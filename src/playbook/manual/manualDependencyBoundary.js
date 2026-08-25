import { createRequire, isBuiltin } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'acorn';
import { resolve as resolveEsmSpecifier } from 'import-meta-resolve';

const MODULE_EXTENSIONS = Object.freeze(['.js', '.mjs', '.cjs']);
const MODULE_EXTENSION_SET = new Set(MODULE_EXTENSIONS);

export async function auditManualDependencyBoundary({ projectRoot }) {
  const root = path.resolve(projectRoot);
  const manualRoot = path.join(root, 'src/playbook/manual');
  const constructionRoot = path.join(root, 'src/construction');
  const constructionRoots = new Set([constructionRoot]);
  const violations = new Set();
  const unresolved = new Set();
  const visitedModules = new Set();
  const queuedModules = [];

  try {
    constructionRoots.add(await fs.realpath(constructionRoot));
  } catch {
    // A missing construction root cannot receive a resolved dependency edge.
  }

  try {
    queuedModules.push(...await listManualEntries({
      directoryPath: manualRoot,
      projectRoot: root,
      unresolved,
      visitedDirectories: new Set()
    }));
  } catch {
    unresolved.add('src/playbook/manual:MANUAL_ROOT_UNAVAILABLE');
  }

  while (queuedModules.length > 0) {
    const logicalPath = queuedModules.shift();
    let realPath;
    try {
      realPath = await fs.realpath(logicalPath);
    } catch {
      unresolved.add(`${safeRelative(root, logicalPath)}:MODULE_UNAVAILABLE`);
      continue;
    }
    if (isConstructionPath(realPath, constructionRoots)) {
      violations.add(safeRelative(root, realPath));
      continue;
    }
    if (!isWithin(realPath, root)) {
      unresolved.add(`${safeRelative(root, logicalPath)}:MODULE_OUTSIDE_PROJECT`);
      continue;
    }
    if (visitedModules.has(realPath)) continue;
    visitedModules.add(realPath);

    let source;
    try {
      source = await fs.readFile(realPath, 'utf8');
    } catch {
      unresolved.add(`${safeRelative(root, logicalPath)}:MODULE_READ_FAILED`);
      continue;
    }
    const scanned = scanModuleDependencies(source, path.extname(realPath));
    for (const code of scanned.unresolvedCodes) {
      unresolved.add(`${safeRelative(root, logicalPath)}:${code}`);
    }
    for (const dependency of scanned.dependencies) {
      const resolved = await resolveDependency({
        importerPath: realPath,
        dependency
      });
      if (resolved.kind === 'builtin') continue;
      if (resolved.kind === 'unresolved') {
        unresolved.add(
          `${safeRelative(root, logicalPath)}:${dependency.mode.toUpperCase()}_DEPENDENCY_UNRESOLVED`
        );
        continue;
      }

      let resolvedReal;
      try {
        resolvedReal = await fs.realpath(resolved.path);
      } catch {
        unresolved.add(
          `${safeRelative(root, logicalPath)}:DEPENDENCY_UNAVAILABLE`
        );
        continue;
      }
      if (isConstructionPath(resolvedReal, constructionRoots)) {
        violations.add(safeRelative(root, resolvedReal));
        continue;
      }
      if (!isWithin(resolvedReal, root)) {
        unresolved.add(
          `${safeRelative(root, logicalPath)}:DEPENDENCY_OUTSIDE_PROJECT`
        );
        continue;
      }
      if (MODULE_EXTENSION_SET.has(path.extname(resolvedReal))) {
        queuedModules.push(resolvedReal);
      }
    }
  }

  const manualConstructionImports = [...violations].sort();
  const unresolvedManualDependencies = [...unresolved].sort();
  return freezeAudit({
    import_boundary_violation_count: manualConstructionImports.length,
    import_boundary_unresolved_count: unresolvedManualDependencies.length,
    manual_construction_imports: manualConstructionImports,
    unresolved_manual_dependencies: unresolvedManualDependencies,
    resolved_manual_dependency_paths: [...visitedModules]
      .map((modulePath) => safeRelative(root, modulePath))
      .sort()
  });
}

async function listManualEntries({
  directoryPath,
  projectRoot,
  unresolved,
  visitedDirectories
}) {
  let realDirectory;
  try {
    realDirectory = await fs.realpath(directoryPath);
  } catch {
    unresolved.add(`${safeRelative(projectRoot, directoryPath)}:DIRECTORY_UNAVAILABLE`);
    return [];
  }
  if (visitedDirectories.has(realDirectory)) return [];
  visitedDirectories.add(realDirectory);

  let entries;
  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch {
    unresolved.add(`${safeRelative(projectRoot, directoryPath)}:DIRECTORY_READ_FAILED`);
    return [];
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const modules = [];
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      modules.push(...await listManualEntries({
        directoryPath: entryPath,
        projectRoot,
        unresolved,
        visitedDirectories
      }));
      continue;
    }
    if (entry.isSymbolicLink()) {
      let stat;
      try {
        stat = await fs.stat(entryPath);
      } catch {
        unresolved.add(`${safeRelative(projectRoot, entryPath)}:SYMLINK_UNRESOLVED`);
        continue;
      }
      if (stat.isDirectory()) {
        modules.push(...await listManualEntries({
          directoryPath: entryPath,
          projectRoot,
          unresolved,
          visitedDirectories
        }));
        continue;
      }
      if (stat.isFile() && MODULE_EXTENSION_SET.has(path.extname(entry.name))) {
        modules.push(entryPath);
      }
      continue;
    }
    if (entry.isFile() && MODULE_EXTENSION_SET.has(path.extname(entry.name))) {
      modules.push(entryPath);
    }
  }
  return modules;
}

function scanModuleDependencies(source, extension) {
  let program;
  try {
    program = parse(source, {
      ecmaVersion: 'latest',
      sourceType: extension === '.cjs' ? 'script' : 'module'
    });
  } catch {
    return {
      dependencies: [],
      unresolvedCodes: ['SOURCE_PARSE_FAILED']
    };
  }

  const dependencies = [];
  const unresolvedCodes = new Set();
  const nodes = collectAstNodes(program);
  const analysis = buildLexicalAnalysis(program);
  propagateBindingTaint(nodes, analysis);
  for (const node of nodes) {
    if (
      node.type === 'ImportDeclaration'
      || node.type === 'ExportNamedDeclaration'
      || node.type === 'ExportAllDeclaration'
    ) {
      addLiteralDependency(dependencies, node.source, 'esm');
    }
    if (node.type === 'ImportExpression') {
      if (!addLiteralDependency(dependencies, node.source, 'esm')) {
        unresolvedCodes.add('COMPUTED_DYNAMIC_IMPORT');
      }
    }
    if (node.type === 'CallExpression') {
      evaluateTaint(node, analysis, {
        dependencies,
        unresolvedCodes
      });
    }
    if (node.type === 'ReturnStatement') {
      recordEscapedTaint(
        evaluateTaint(node.argument, analysis),
        unresolvedCodes,
        'RETURN'
      );
    }
    if (node.type === 'ExportNamedDeclaration') {
      recordExportEscape(node, analysis, unresolvedCodes);
    }
    if (node.type === 'ExportDefaultDeclaration') {
      recordEscapedTaint(
        evaluateTaint(node.declaration, analysis),
        unresolvedCodes,
        'EXPORT'
      );
    }
    if (node.type === 'AssignmentExpression') {
      recordAssignmentEscape(node, analysis, unresolvedCodes);
    }
    if (
      node.type === 'VariableDeclarator'
      && hasUnmodeledModuleDestructure(node, analysis)
    ) {
      unresolvedCodes.add('INDIRECT_LOADER_FACTORY_DESTRUCTURE');
    }
    if (
      (node.type === 'ObjectExpression' || node.type === 'ArrayExpression')
      && evaluateTaint(node, analysis) !== TAINT_NONE
    ) {
      recordOpaqueTaint(evaluateTaint(node, analysis), unresolvedCodes);
    }
  }

  return {
    dependencies: uniqueDependencies(dependencies),
    unresolvedCodes: [...unresolvedCodes]
  };
}

const TAINT_NONE = 0;
const TAINT_MODULE_NAMESPACE = 1 << 0;
const TAINT_LOADER_FACTORY = 1 << 1;
const TAINT_LOADER = 1 << 2;
const TAINT_OPAQUE_FACTORY = 1 << 3;
const TAINT_OPAQUE_LOADER = 1 << 4;
const TAINT_OPAQUE_MODULE_LOADER = 1 << 5;
const TAINT_OPAQUE_FACTORY_LOADER = 1 << 6;
const FACTORY_TAINT = TAINT_LOADER_FACTORY | TAINT_OPAQUE_FACTORY;
const LOADER_TAINT = TAINT_LOADER
  | TAINT_OPAQUE_LOADER
  | TAINT_OPAQUE_MODULE_LOADER
  | TAINT_OPAQUE_FACTORY_LOADER;

function buildLexicalAnalysis(program) {
  const nodeScopes = new WeakMap();
  const scopes = [];

  function createScope(parent, kind) {
    const scope = { parent, kind, bindings: new Map() };
    scopes.push(scope);
    return scope;
  }

  const rootScope = createScope(null, 'program');

  function nearestVarScope(scope) {
    let candidate = scope;
    while (candidate.parent && !['function', 'program'].includes(candidate.kind)) {
      candidate = candidate.parent;
    }
    return candidate;
  }

  function declareIdentifier(identifier, scope, initialTaint = TAINT_NONE) {
    if (identifier?.type !== 'Identifier') return;
    const existing = scope.bindings.get(identifier.name);
    if (existing) {
      existing.taint |= initialTaint;
      return;
    }
    scope.bindings.set(identifier.name, {
      name: identifier.name,
      taint: initialTaint
    });
  }

  function declarePattern(pattern, scope, initialTaint = TAINT_NONE) {
    if (!pattern) return;
    if (pattern.type === 'Identifier') {
      declareIdentifier(pattern, scope, initialTaint);
      return;
    }
    if (pattern.type === 'RestElement') {
      declarePattern(pattern.argument, scope, initialTaint);
      return;
    }
    if (pattern.type === 'AssignmentPattern') {
      declarePattern(pattern.left, scope, initialTaint);
      return;
    }
    if (pattern.type === 'ArrayPattern') {
      for (const element of pattern.elements) {
        declarePattern(element, scope, initialTaint);
      }
      return;
    }
    if (pattern.type === 'ObjectPattern') {
      for (const property of pattern.properties) {
        declarePattern(
          property.type === 'RestElement' ? property.argument : property.value,
          scope,
          initialTaint
        );
      }
    }
  }

  function visitChildren(node, scope, omitted = new Set()) {
    for (const [key, value] of Object.entries(node)) {
      if (omitted.has(key)) continue;
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child.type === 'string') visit(child, scope);
        }
      } else if (value && typeof value.type === 'string') {
        visit(value, scope);
      }
    }
  }

  function visit(node, scope) {
    if (!node || typeof node !== 'object') return;
    nodeScopes.set(node, scope);

    if (node.type === 'Program') {
      visitChildren(node, scope);
      return;
    }
    if (node.type === 'ImportDeclaration') {
      const isNodeModule = ['module', 'node:module'].includes(node.source?.value);
      for (const specifier of node.specifiers) {
        let initialTaint = TAINT_NONE;
        if (isNodeModule && (
          specifier.type === 'ImportDefaultSpecifier'
          || specifier.type === 'ImportNamespaceSpecifier'
          || (specifier.type === 'ImportSpecifier'
            && importedName(specifier) === 'default')
        )) {
          initialTaint = TAINT_MODULE_NAMESPACE;
        } else if (
          isNodeModule
          && specifier.type === 'ImportSpecifier'
          && importedName(specifier) === 'createRequire'
        ) {
          initialTaint = TAINT_LOADER_FACTORY;
        }
        declareIdentifier(specifier.local, scope, initialTaint);
        visit(specifier, scope);
      }
      visit(node.source, scope);
      return;
    }
    if (node.type === 'VariableDeclaration') {
      const declarationScope = node.kind === 'var'
        ? nearestVarScope(scope)
        : scope;
      for (const declaration of node.declarations) {
        declarePattern(declaration.id, declarationScope);
        visit(declaration, scope);
      }
      return;
    }
    if (node.type === 'FunctionDeclaration') {
      declareIdentifier(node.id, scope);
      const functionScope = createScope(scope, 'function');
      nodeScopes.set(node, functionScope);
      if (node.id) declareIdentifier(node.id, functionScope);
      for (const parameter of node.params) {
        declarePattern(parameter, functionScope);
        visit(parameter, functionScope);
      }
      visit(node.body, functionScope);
      return;
    }
    if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      const functionScope = createScope(scope, 'function');
      nodeScopes.set(node, functionScope);
      if (node.type === 'FunctionExpression' && node.id) {
        declareIdentifier(node.id, functionScope);
      }
      for (const parameter of node.params) {
        declarePattern(parameter, functionScope);
        visit(parameter, functionScope);
      }
      visit(node.body, functionScope);
      return;
    }
    if (node.type === 'BlockStatement') {
      const blockScope = createScope(scope, 'block');
      nodeScopes.set(node, blockScope);
      for (const statement of node.body) visit(statement, blockScope);
      return;
    }
    if (node.type === 'CatchClause') {
      const catchScope = createScope(scope, 'block');
      nodeScopes.set(node, catchScope);
      declarePattern(node.param, catchScope);
      if (node.param) visit(node.param, catchScope);
      visit(node.body, catchScope);
      return;
    }
    if (
      node.type === 'ForStatement'
      || node.type === 'ForInStatement'
      || node.type === 'ForOfStatement'
      || node.type === 'SwitchStatement'
    ) {
      const blockScope = createScope(scope, 'block');
      nodeScopes.set(node, blockScope);
      visitChildren(node, blockScope);
      return;
    }
    if (node.type === 'ClassDeclaration') {
      declareIdentifier(node.id, scope);
    }
    visitChildren(node, scope);
  }

  visit(program, rootScope);
  return { rootScope, nodeScopes, scopes };
}

function importedName(specifier) {
  if (specifier.imported?.type === 'Identifier') return specifier.imported.name;
  if (specifier.imported?.type === 'Literal') return specifier.imported.value;
  return null;
}

function resolveBinding(analysis, node, name) {
  let scope = analysis.nodeScopes.get(node) ?? analysis.rootScope;
  while (scope) {
    const binding = scope.bindings.get(name);
    if (binding) return binding;
    scope = scope.parent;
  }
  return null;
}

function isUnboundIdentifier(node, analysis, name) {
  return node?.type === 'Identifier'
    && node.name === name
    && !resolveBinding(analysis, node, name);
}

function propagateBindingTaint(nodes, analysis) {
  let changed = true;
  let passes = 0;
  const maximumPasses = Math.max(1, analysis.scopes.length * 8);
  while (changed && passes < maximumPasses) {
    changed = false;
    passes += 1;
    for (const node of nodes) {
      if (node.type === 'VariableDeclarator') {
        const valueTaint = evaluateTaint(node.init, analysis);
        changed = propagatePatternTaint(
          node.id,
          valueTaint,
          node.init,
          analysis
        ) || changed;
      } else if (
        node.type === 'AssignmentExpression'
        && node.operator === '='
        && node.left?.type === 'Identifier'
      ) {
        const binding = resolveBinding(analysis, node.left, node.left.name);
        if (binding) {
          const next = binding.taint | evaluateTaint(node.right, analysis);
          if (next !== binding.taint) {
            binding.taint = next;
            changed = true;
          }
        }
      }
    }
  }
}

function propagatePatternTaint(pattern, taint, source, analysis) {
  if (!pattern || taint === TAINT_NONE) return false;
  if (pattern.type === 'Identifier') {
    const binding = resolveBinding(analysis, pattern, pattern.name);
    if (!binding) return false;
    const next = binding.taint | taint;
    if (next === binding.taint) return false;
    binding.taint = next;
    return true;
  }
  if (pattern.type === 'AssignmentPattern') {
    return propagatePatternTaint(pattern.left, taint, source, analysis);
  }
  if (pattern.type === 'RestElement') {
    return propagatePatternTaint(pattern.argument, opaqueTaint(taint), source, analysis);
  }
  if (
    pattern.type === 'ObjectPattern'
    && (taint & TAINT_MODULE_NAMESPACE) !== 0
  ) {
    let changed = false;
    for (const property of pattern.properties) {
      if (
        property.type === 'Property'
        && propertyKeyName(property) === 'createRequire'
      ) {
        changed = propagatePatternTaint(
          property.value,
          TAINT_LOADER_FACTORY,
          source,
          analysis
        ) || changed;
      }
    }
    return changed;
  }
  let changed = false;
  for (const identifier of patternIdentifiers(pattern)) {
    changed = propagatePatternTaint(
      identifier,
      opaqueTaint(taint),
      source,
      analysis
    ) || changed;
  }
  return changed;
}

function patternIdentifiers(pattern) {
  if (!pattern) return [];
  if (pattern.type === 'Identifier') return [pattern];
  if (pattern.type === 'RestElement') return patternIdentifiers(pattern.argument);
  if (pattern.type === 'AssignmentPattern') return patternIdentifiers(pattern.left);
  if (pattern.type === 'ArrayPattern') {
    return pattern.elements.flatMap(patternIdentifiers);
  }
  if (pattern.type === 'ObjectPattern') {
    return pattern.properties.flatMap((property) => patternIdentifiers(
      property.type === 'RestElement' ? property.argument : property.value
    ));
  }
  return [];
}

function evaluateTaint(node, analysis, collector = null) {
  if (!node || typeof node !== 'object') return TAINT_NONE;
  if (node.type === 'Identifier') {
    const binding = resolveBinding(analysis, node, node.name);
    if (binding) return binding.taint;
    return node.name === 'require' ? TAINT_LOADER : TAINT_NONE;
  }
  if (node.type === 'ChainExpression') {
    return evaluateTaint(node.expression, analysis, collector);
  }
  if (node.type === 'SequenceExpression') {
    return evaluateTaint(node.expressions.at(-1), analysis, collector);
  }
  if (node.type === 'ConditionalExpression' || node.type === 'LogicalExpression') {
    return evaluateTaint(node.consequent ?? node.left, analysis, collector)
      | evaluateTaint(node.alternate ?? node.right, analysis, collector);
  }
  if (node.type === 'AssignmentExpression') {
    return evaluateTaint(node.right, analysis, collector);
  }
  if (node.type === 'AwaitExpression' || node.type === 'YieldExpression') {
    return evaluateTaint(node.argument, analysis, collector);
  }
  if (node.type === 'MemberExpression') {
    if (
      isUnboundIdentifier(node.object, analysis, 'module')
      && memberPropertyName(node) === 'require'
    ) {
      return TAINT_LOADER;
    }
    if (
      isUnboundIdentifier(node.object, analysis, 'module')
      && node.computed
      && memberPropertyName(node) === null
    ) {
      collector?.unresolvedCodes.add('INDIRECT_MODULE_LOADER');
      return TAINT_OPAQUE_MODULE_LOADER;
    }
    const objectTaint = evaluateTaint(node.object, analysis, collector);
    const propertyName = memberPropertyName(node);
    if ((objectTaint & TAINT_MODULE_NAMESPACE) !== 0) {
      if (propertyName === 'createRequire') return TAINT_LOADER_FACTORY;
      if (node.computed && propertyName === null) {
        collector?.unresolvedCodes.add('INDIRECT_LOADER_FACTORY_CALL');
        return TAINT_OPAQUE_FACTORY;
      }
      return TAINT_NONE;
    }
    if ((objectTaint & FACTORY_TAINT) !== 0) return TAINT_OPAQUE_FACTORY;
    if ((objectTaint & LOADER_TAINT) !== 0) return TAINT_OPAQUE_LOADER;
    return TAINT_NONE;
  }
  if (node.type === 'CallExpression') {
    return evaluateCallTaint(node, analysis, collector);
  }
  if (node.type === 'ObjectExpression') {
    let contained = TAINT_NONE;
    for (const property of node.properties) {
      contained |= evaluateTaint(
        property.type === 'SpreadElement' ? property.argument : property.value,
        analysis,
        collector
      );
    }
    return opaqueTaint(contained);
  }
  if (node.type === 'ArrayExpression') {
    return opaqueTaint(node.elements.reduce(
      (taint, element) => taint | evaluateTaint(element, analysis, collector),
      TAINT_NONE
    ));
  }
  return TAINT_NONE;
}

function evaluateCallTaint(node, analysis, collector) {
  const callee = node.callee?.type === 'ChainExpression'
    ? node.callee.expression
    : node.callee;
  if (isEvalCallee(callee, analysis)) {
    collector?.unresolvedCodes.add('INDIRECT_EVAL');
    return TAINT_NONE;
  }

  if (callee?.type === 'MemberExpression') {
    const propertyName = memberPropertyName(callee);
    const objectTaint = evaluateTaint(callee.object, analysis, collector);
    if (propertyName === 'resolve' && (objectTaint & TAINT_LOADER) !== 0) {
      return TAINT_NONE;
    }
    if (propertyName === 'bind' && (objectTaint & TAINT_LOADER) !== 0) {
      return TAINT_LOADER;
    }
    if (['call', 'apply'].includes(propertyName) && (objectTaint & TAINT_LOADER) !== 0) {
      const argument = propertyName === 'call'
        ? node.arguments[1]
        : appliedLoaderArgument(node.arguments[1]);
      if (propertyName === 'apply' && argument === null) {
        collector?.unresolvedCodes.add('INDIRECT_LOADER_APPLY');
        return TAINT_NONE;
      }
      recordLoaderDependency(argument, collector, 'COMPUTED_REQUIRE');
      return TAINT_NONE;
    }
  }

  const calleeTaint = evaluateTaint(callee, analysis, collector);
  if ((calleeTaint & TAINT_LOADER_FACTORY) !== 0) return TAINT_LOADER;
  if ((calleeTaint & TAINT_OPAQUE_FACTORY) !== 0) {
    collector?.unresolvedCodes.add('INDIRECT_LOADER_FACTORY_CALL');
    return TAINT_OPAQUE_FACTORY_LOADER;
  }
  if ((calleeTaint & TAINT_LOADER) !== 0) {
    recordLoaderDependency(
      node.arguments[0],
      collector,
      isDirectModuleRequire(callee, analysis)
        ? 'COMPUTED_MODULE_REQUIRE'
        : 'COMPUTED_REQUIRE'
    );
    if (
      node.arguments[0]?.type === 'Literal'
      && ['module', 'node:module'].includes(node.arguments[0].value)
    ) {
      return TAINT_MODULE_NAMESPACE;
    }
    return TAINT_NONE;
  }
  if ((calleeTaint & TAINT_OPAQUE_FACTORY_LOADER) !== 0) {
    collector?.unresolvedCodes.add('INDIRECT_LOADER_FACTORY_CALL');
    return TAINT_NONE;
  }
  if ((calleeTaint & TAINT_OPAQUE_LOADER) !== 0) {
    collector?.unresolvedCodes.add('INDIRECT_LOADER_CALL');
    return TAINT_NONE;
  }
  if ((calleeTaint & TAINT_OPAQUE_MODULE_LOADER) !== 0) {
    collector?.unresolvedCodes.add('INDIRECT_MODULE_LOADER');
    return TAINT_NONE;
  }

  const argumentTaint = node.arguments.reduce(
    (taint, argument) => taint | evaluateTaint(argument, analysis, collector),
    TAINT_NONE
  );
  recordOpaqueTaint(argumentTaint, collector?.unresolvedCodes);
  return TAINT_NONE;
}

function appliedLoaderArgument(argument) {
  return argument?.type === 'ArrayExpression'
    ? argument.elements[0]
    : null;
}

function recordLoaderDependency(argument, collector, computedCode) {
  if (!collector) return;
  if (!addLiteralDependency(collector.dependencies, argument, 'cjs')) {
    collector.unresolvedCodes.add(computedCode);
  }
}

function opaqueTaint(taint) {
  let opaque = TAINT_NONE;
  if ((taint & (
    TAINT_MODULE_NAMESPACE
    | TAINT_LOADER_FACTORY
    | TAINT_OPAQUE_FACTORY
  )) !== 0) {
    opaque |= TAINT_OPAQUE_FACTORY;
  }
  if ((taint & LOADER_TAINT) !== 0) {
    opaque |= TAINT_OPAQUE_LOADER;
  }
  return opaque;
}

function recordOpaqueTaint(taint, unresolvedCodes) {
  if (!unresolvedCodes) return;
  if ((taint & FACTORY_TAINT) !== 0) {
    unresolvedCodes.add('INDIRECT_LOADER_FACTORY_CALL');
  }
  if ((taint & LOADER_TAINT) !== 0) {
    unresolvedCodes.add('INDIRECT_LOADER_CALL');
  }
}

function recordEscapedTaint(taint, unresolvedCodes, kind) {
  if ((taint & (TAINT_MODULE_NAMESPACE | FACTORY_TAINT)) !== 0) {
    unresolvedCodes.add(`LOADER_FACTORY_${kind}_ESCAPE`);
  }
  if ((taint & LOADER_TAINT) !== 0) {
    unresolvedCodes.add(`LOADER_${kind}_ESCAPE`);
  }
}

function recordExportEscape(node, analysis, unresolvedCodes) {
  if (
    node.type === 'ExportAllDeclaration'
    && ['module', 'node:module'].includes(node.source?.value)
  ) {
    unresolvedCodes.add('LOADER_FACTORY_EXPORT_ESCAPE');
  }
  if (['module', 'node:module'].includes(node.source?.value)) {
    for (const specifier of node.specifiers ?? []) {
      if (
        importedName(specifier) === 'createRequire'
        || specifier.local?.name === 'createRequire'
        || specifier.local?.name === 'default'
      ) {
        unresolvedCodes.add('LOADER_FACTORY_EXPORT_ESCAPE');
      }
    }
  }
  for (const specifier of node.specifiers ?? []) {
    if (!node.source && specifier.local?.type === 'Identifier') {
      recordEscapedTaint(
        evaluateTaint(specifier.local, analysis),
        unresolvedCodes,
        'EXPORT'
      );
    }
  }
  if (node.declaration?.type === 'VariableDeclaration') {
    for (const declaration of node.declaration.declarations) {
      for (const identifier of patternIdentifiers(declaration.id)) {
        recordEscapedTaint(
          evaluateTaint(identifier, analysis),
          unresolvedCodes,
          'EXPORT'
        );
      }
    }
  }
}

function hasUnmodeledModuleDestructure(node, analysis) {
  if (
    node.id?.type !== 'ObjectPattern'
    || (evaluateTaint(node.init, analysis) & TAINT_MODULE_NAMESPACE) === 0
  ) return false;
  return node.id.properties.some((property) =>
    property.type !== 'Property'
    || (property.computed && propertyKeyName(property) === null));
}

function recordAssignmentEscape(node, analysis, unresolvedCodes) {
  const taint = evaluateTaint(node.right, analysis);
  if (taint === TAINT_NONE || node.left?.type !== 'MemberExpression') return;
  if (isCommonJsExportTarget(node.left, analysis)) {
    recordEscapedTaint(taint, unresolvedCodes, 'EXPORT');
    return;
  }
  recordOpaqueTaint(taint, unresolvedCodes);
}

function isCommonJsExportTarget(member, analysis) {
  if (isUnboundIdentifier(member.object, analysis, 'exports')) return true;
  return member.object?.type === 'Identifier'
    && isUnboundIdentifier(member.object, analysis, 'module')
    && memberPropertyName(member) === 'exports';
}

function addLiteralDependency(dependencies, node, mode) {
  if (node?.type !== 'Literal' || typeof node.value !== 'string') return false;
  dependencies.push({ specifier: node.value, mode });
  return true;
}

function collectAstNodes(program) {
  const collected = [];
  const pending = [program];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node || typeof node !== 'object') continue;
    collected.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child.type === 'string') pending.push(child);
        }
      } else if (value && typeof value.type === 'string') {
        pending.push(value);
      }
    }
  }
  return collected;
}

function isDirectModuleRequire(node, analysis) {
  return node?.type === 'MemberExpression'
    && isUnboundIdentifier(node.object, analysis, 'module')
    && memberPropertyName(node) === 'require';
}

function isEvalCallee(node, analysis) {
  return isUnboundIdentifier(node, analysis, 'eval')
    || (node?.type === 'MemberExpression'
      && memberPropertyName(node) === 'eval');
}

function memberPropertyName(member) {
  if (!member.computed && member.property?.type === 'Identifier') {
    return member.property.name;
  }
  if (member.computed && member.property?.type === 'Literal') {
    return member.property.value;
  }
  return null;
}

function propertyKeyName(property) {
  if (!property.computed && property.key?.type === 'Identifier') {
    return property.key.name;
  }
  if (property.key?.type === 'Literal' && typeof property.key.value === 'string') {
    return property.key.value;
  }
  return null;
}

function uniqueDependencies(dependencies) {
  const seen = new Set();
  return dependencies.filter(({ specifier, mode }) => {
    const key = `${mode}\0${specifier}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function resolveDependency({ importerPath, dependency }) {
  if (isBuiltin(dependency.specifier)) return { kind: 'builtin' };
  try {
    if (dependency.mode === 'cjs') {
      const resolved = createRequire(pathToFileURL(importerPath))
        .resolve(dependency.specifier);
      if (isBuiltin(resolved)) return { kind: 'builtin' };
      return { kind: 'file', path: resolved };
    }

    const resolved = resolveEsmSpecifier(
      dependency.specifier,
      pathToFileURL(importerPath).href
    );
    if (resolved.startsWith('node:')) return { kind: 'builtin' };
    if (!resolved.startsWith('file:')) return { kind: 'unresolved' };
    const resolvedPath = fileURLToPath(resolved);
    const supportedPath = await resolveSupportedFile(resolvedPath);
    return supportedPath
      ? { kind: 'file', path: supportedPath }
      : { kind: 'unresolved' };
  } catch {
    return { kind: 'unresolved' };
  }
}

async function resolveSupportedFile(resolvedPath) {
  const candidates = [resolvedPath];
  if (path.extname(resolvedPath) === '') {
    candidates.push(...MODULE_EXTENSIONS.map((extension) =>
      `${resolvedPath}${extension}`));
    candidates.push(...MODULE_EXTENSIONS.map((extension) =>
      path.join(resolvedPath, `index${extension}`)));
  }
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
      if (stat.isDirectory()) {
        for (const extension of MODULE_EXTENSIONS) {
          const indexPath = path.join(candidate, `index${extension}`);
          try {
            if ((await fs.stat(indexPath)).isFile()) return indexPath;
          } catch {
            // Try the next supported index extension.
          }
        }
      }
    } catch {
      // Try the next supported file candidate.
    }
  }
  return null;
}

function isConstructionPath(candidate, constructionRoots) {
  return [...constructionRoots].some((root) => isWithin(candidate, root));
}

function isWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

function safeRelative(projectRoot, candidate) {
  if (!isWithin(candidate, projectRoot)) return 'outside-project';
  return path.relative(projectRoot, candidate).split(path.sep).join('/');
}

function freezeAudit(value) {
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) Object.freeze(child);
  }
  return Object.freeze(value);
}
