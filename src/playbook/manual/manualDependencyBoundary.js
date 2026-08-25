import { createRequire, isBuiltin } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'acorn';
import { resolve as resolveEsmSpecifier } from 'import-meta-resolve';

const MODULE_EXTENSIONS = Object.freeze(['.js', '.mjs', '.cjs']);
const MODULE_EXTENSION_SET = new Set(MODULE_EXTENSIONS);
const STATIC_EDGE_MODES = Object.freeze({ ESM: 'esm', CJS: 'cjs' });
const AUDIT_IMPLEMENTATION_PATH = await fs.realpath(fileURLToPath(import.meta.url));

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
    const scanned = scanModuleDependencies({
      source,
      extension: path.extname(realPath),
      modulePath: realPath,
      auditImplementationPath: AUDIT_IMPLEMENTATION_PATH
    });
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

function scanModuleDependencies({
  source,
  extension,
  modulePath,
  auditImplementationPath
}) {
  const program = parseModule(source, extension);
  if (!program) {
    return {
      dependencies: [],
      unresolvedCodes: ['SOURCE_PARSE_FAILED']
    };
  }

  const lexical = buildLexicalBindings(program);
  const dependencies = [];
  const unresolvedCodes = new Set();
  const trustedAuditImport = program.body.some((node) =>
    isTrustedAuditModuleImport(node, modulePath, auditImplementationPath));

  walkProgram(program, (node, parent, parentMap) => {
    collectStaticDependency({
      node,
      extension,
      lexical,
      dependencies,
      unresolvedCodes
    });
    collectDeniedCapability({
      node,
      parent,
      parentMap,
      lexical,
      extension,
      modulePath,
      auditImplementationPath,
      trustedAuditImport,
      unresolvedCodes
    });
  });

  return {
    dependencies: uniqueDependencies(dependencies),
    unresolvedCodes: [...unresolvedCodes].sort()
  };
}

function parseModule(source, extension) {
  try {
    return parse(source, {
      ecmaVersion: 'latest',
      sourceType: extension === '.cjs' ? 'script' : 'module'
    });
  } catch {
    return null;
  }
}

function walkProgram(program, visitor) {
  const parentMap = new WeakMap();
  const pending = [{ node: program, parent: null }];
  while (pending.length > 0) {
    const { node, parent } = pending.pop();
    if (!node || typeof node !== 'object') continue;
    if (parent) parentMap.set(node, parent);
    visitor(node, parent, parentMap);
    const children = [];
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child.type === 'string') children.push(child);
        }
      } else if (value && typeof value.type === 'string') {
        children.push(value);
      }
    }
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push({ node: children[index], parent: node });
    }
  }
}

function collectStaticDependency({
  node,
  extension,
  lexical,
  dependencies,
  unresolvedCodes
}) {
  if (
    node.type === 'ImportDeclaration'
    || node.type === 'ExportNamedDeclaration'
    || node.type === 'ExportAllDeclaration'
  ) {
    addStaticDependency(dependencies, node.source, STATIC_EDGE_MODES.ESM);
    return;
  }
  if (node.type === 'ImportExpression') {
    if (!addStaticDependency(dependencies, node.source, STATIC_EDGE_MODES.ESM)) {
      unresolvedCodes.add('COMPUTED_DYNAMIC_IMPORT');
    }
    return;
  }
  if (isDirectGlobalRequireCall(node, lexical)) {
    if (
      node.arguments.length !== 1
      || !addStaticDependency(
        dependencies,
        node.arguments[0],
        STATIC_EDGE_MODES.CJS
      )
    ) {
      unresolvedCodes.add('COMPUTED_REQUIRE');
    }
    return;
  }
  if (
    extension === '.cjs'
    && isDirectGlobalModuleRequireCall(node, lexical)
  ) {
    if (
      node.arguments.length !== 1
      || !addStaticDependency(
        dependencies,
        node.arguments[0],
        STATIC_EDGE_MODES.CJS
      )
    ) {
      unresolvedCodes.add('COMPUTED_MODULE_REQUIRE');
    }
  }
}

function collectDeniedCapability({
  node,
  parent,
  parentMap,
  lexical,
  extension,
  modulePath,
  auditImplementationPath,
  trustedAuditImport,
  unresolvedCodes
}) {
  if (
    isModuleSourceNode(node)
    && isNodeModuleSpecifier(literalSpecifier(node.source))
    && !isSafeNodeModuleImport(node, modulePath)
    && !isTrustedAuditModuleImport(
      node,
      modulePath,
      auditImplementationPath
    )
  ) {
    unresolvedCodes.add('DYNAMIC_NODE_MODULE_CAPABILITY');
  }

  if (
    (isDirectGlobalRequireCall(node, lexical)
      || isDirectGlobalModuleRequireCall(node, lexical))
    && isNodeModuleSpecifier(literalSpecifier(node.arguments[0]))
  ) {
    unresolvedCodes.add('DYNAMIC_NODE_MODULE_CAPABILITY');
  }

  if (
    node.type === 'MemberExpression'
    && lexical.isUnboundGlobal(node.object, 'process')
    && memberPropertyName(node) === 'getBuiltinModule'
  ) {
    unresolvedCodes.add('PROCESS_BUILTIN_MODULE_CAPABILITY');
  }

  if (
    node.type === 'MemberExpression'
    && lexical.isUnboundGlobal(node.object, 'module')
    && memberPropertyName(node) === 'constructor'
  ) {
    unresolvedCodes.add('INDIRECT_MODULE_REQUIRE_CAPABILITY');
  }

  if (
    node.type === 'MemberExpression'
    && lexical.isUnboundGlobal(node.object, 'module')
    && node.computed
    && memberPropertyName(node) === null
  ) {
    unresolvedCodes.add('INDIRECT_MODULE_REQUIRE_CAPABILITY');
  }

  if (
    node.type === 'MemberExpression'
    && lexical.isUnboundGlobal(node.object, 'module')
    && memberPropertyName(node) === 'require'
    && !(
      extension === '.cjs'
      && !node.computed
      && parent?.type === 'CallExpression'
      && parent.callee === node
    )
  ) {
    unresolvedCodes.add('INDIRECT_MODULE_REQUIRE_CAPABILITY');
  }

  if (
    lexical.isUnboundGlobal(node, 'require')
    && isIdentifierReference(node, parent)
    && !(parent?.type === 'CallExpression' && parent.callee === node)
  ) {
    unresolvedCodes.add('INDIRECT_REQUIRE_CAPABILITY');
  }

  if (
    lexical.isUnboundGlobal(node, 'eval')
    && isIdentifierReference(node, parent)
  ) {
    unresolvedCodes.add('DYNAMIC_EVAL_CAPABILITY');
  }

  if (
    lexical.isUnboundGlobal(node, 'Function')
    && isIdentifierReference(node, parent)
  ) {
    unresolvedCodes.add('DYNAMIC_FUNCTION_CAPABILITY');
  }

  if (
    trustedAuditImport
    && node.type === 'Identifier'
    && node.name === 'createRequire'
    && !isTrustedAuditImportIdentifier(node, parent, parentMap)
    && !isTrustedAuditCreateRequireCall(
      parent,
      parentMap,
      modulePath,
      auditImplementationPath
    )
  ) {
    unresolvedCodes.add('DYNAMIC_NODE_MODULE_CAPABILITY');
  }
}

function isModuleSourceNode(node) {
  return node.type === 'ImportDeclaration'
    || node.type === 'ImportExpression'
    || node.type === 'ExportNamedDeclaration'
    || node.type === 'ExportAllDeclaration';
}

function isSafeNodeModuleImport(node, modulePath) {
  if (
    node.type !== 'ImportDeclaration'
    || node.specifiers.length !== 1
    || node.specifiers[0].type !== 'ImportSpecifier'
  ) return false;
  const name = importedName(node.specifiers[0]);
  return name === 'isBuiltin'
    || (name === 'builtinModules' && isNodeModulesPath(modulePath));
}

function isNodeModulesPath(modulePath) {
  return modulePath.split(path.sep).includes('node_modules');
}

function isTrustedAuditModuleImport(
  node,
  modulePath,
  auditImplementationPath
) {
  if (
    modulePath !== auditImplementationPath
    || node.type !== 'ImportDeclaration'
    || node.source?.value !== 'node:module'
    || node.specifiers.length !== 2
  ) return false;
  const names = node.specifiers.map((specifier) =>
    specifier.type === 'ImportSpecifier'
      && importedName(specifier) === specifier.local?.name
      ? importedName(specifier)
      : null);
  return names.includes('createRequire') && names.includes('isBuiltin');
}

function isTrustedAuditImportIdentifier(node, parent, parentMap) {
  return parent?.type === 'ImportSpecifier'
    && parentMap.get(parent)?.type === 'ImportDeclaration'
    && parentMap.get(parent).source?.value === 'node:module';
}

function isTrustedAuditCreateRequireCall(
  call,
  parentMap,
  modulePath,
  auditImplementationPath
) {
  if (
    modulePath !== auditImplementationPath
    || call?.type !== 'CallExpression'
    || call.callee?.type !== 'Identifier'
    || call.callee.name !== 'createRequire'
    || call.arguments.length !== 1
  ) return false;
  const urlCall = call.arguments[0];
  if (
    urlCall?.type !== 'CallExpression'
    || urlCall.callee?.type !== 'Identifier'
    || urlCall.callee.name !== 'pathToFileURL'
    || urlCall.arguments.length !== 1
    || urlCall.arguments[0]?.type !== 'Identifier'
    || urlCall.arguments[0].name !== 'importerPath'
  ) return false;
  const resolveMember = parentMap.get(call);
  const resolveCall = parentMap.get(resolveMember);
  return resolveMember?.type === 'MemberExpression'
    && resolveMember.object === call
    && !resolveMember.computed
    && resolveMember.property?.type === 'Identifier'
    && resolveMember.property.name === 'resolve'
    && resolveCall?.type === 'CallExpression'
    && resolveCall.callee === resolveMember
    && resolveCall.arguments.length === 1
    && resolveCall.arguments[0]?.type === 'MemberExpression'
    && !resolveCall.arguments[0].computed
    && resolveCall.arguments[0].object?.type === 'Identifier'
    && resolveCall.arguments[0].object.name === 'dependency'
    && resolveCall.arguments[0].property?.type === 'Identifier'
    && resolveCall.arguments[0].property.name === 'specifier';
}

function literalSpecifier(node) {
  return node?.type === 'Literal' && typeof node.value === 'string'
    ? node.value
    : null;
}

function addStaticDependency(dependencies, node, mode) {
  const specifier = literalSpecifier(node);
  if (specifier === null) return false;
  dependencies.push({ specifier, mode });
  return true;
}

function isDirectGlobalRequireCall(node, lexical) {
  return node?.type === 'CallExpression'
    && node.callee?.type === 'Identifier'
    && node.callee.name === 'require'
    && lexical.isUnboundGlobal(node.callee, 'require');
}

function isDirectGlobalModuleRequireCall(node, lexical) {
  return node?.type === 'CallExpression'
    && node.callee?.type === 'MemberExpression'
    && !node.callee.computed
    && lexical.isUnboundGlobal(node.callee.object, 'module')
    && memberPropertyName(node.callee) === 'require';
}

function isNodeModuleSpecifier(specifier) {
  return specifier === 'module' || specifier === 'node:module';
}

function isIdentifierReference(node, parent) {
  if (node?.type !== 'Identifier' || !parent) return false;
  if (
    parent.type === 'MemberExpression'
    && parent.property === node
    && !parent.computed
  ) return false;
  if (
    (parent.type === 'Property' || parent.type === 'MethodDefinition')
    && parent.key === node
    && !parent.computed
    && !parent.shorthand
  ) return false;
  if (
    parent.type === 'LabeledStatement'
    || parent.type === 'BreakStatement'
    || parent.type === 'ContinueStatement'
  ) return false;
  if (
    (parent.type === 'VariableDeclarator' && parent.id === node)
    || ((parent.type === 'FunctionDeclaration'
      || parent.type === 'FunctionExpression'
      || parent.type === 'ClassDeclaration'
      || parent.type === 'ClassExpression') && parent.id === node)
  ) return false;
  return true;
}

function buildLexicalBindings(program) {
  const nodeScopes = new WeakMap();

  function createScope(parent, kind) {
    return { parent, kind, bindings: new Set() };
  }

  const rootScope = createScope(null, 'program');

  function nearestVarScope(scope) {
    let candidate = scope;
    while (candidate.parent && !['function', 'program'].includes(candidate.kind)) {
      candidate = candidate.parent;
    }
    return candidate;
  }

  function declareIdentifier(identifier, scope) {
    if (identifier?.type === 'Identifier') {
      scope.bindings.add(identifier.name);
    }
  }

  function declarePattern(pattern, scope) {
    if (!pattern) return;
    if (pattern.type === 'Identifier') {
      declareIdentifier(pattern, scope);
      return;
    }
    if (pattern.type === 'RestElement') {
      declarePattern(pattern.argument, scope);
      return;
    }
    if (pattern.type === 'AssignmentPattern') {
      declarePattern(pattern.left, scope);
      return;
    }
    if (pattern.type === 'ArrayPattern') {
      for (const element of pattern.elements) declarePattern(element, scope);
      return;
    }
    if (pattern.type === 'ObjectPattern') {
      for (const property of pattern.properties) {
        declarePattern(
          property.type === 'RestElement' ? property.argument : property.value,
          scope
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
      for (const specifier of node.specifiers) {
        declareIdentifier(specifier.local, scope);
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
      const parameterScope = createScope(scope, 'parameters');
      nodeScopes.set(node, parameterScope);
      if (node.id) declareIdentifier(node.id, parameterScope);
      for (const parameter of node.params) {
        declarePattern(parameter, parameterScope);
        visit(parameter, parameterScope);
      }
      const bodyScope = createScope(parameterScope, 'function');
      visit(node.body, bodyScope);
      return;
    }
    if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      const parameterScope = createScope(scope, 'parameters');
      nodeScopes.set(node, parameterScope);
      if (node.type === 'FunctionExpression' && node.id) {
        declareIdentifier(node.id, parameterScope);
      }
      for (const parameter of node.params) {
        declarePattern(parameter, parameterScope);
        visit(parameter, parameterScope);
      }
      const bodyScope = createScope(parameterScope, 'function');
      visit(node.body, bodyScope);
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
    if (node.type === 'ClassExpression' && node.id) {
      const classScope = createScope(scope, 'block');
      declareIdentifier(node.id, classScope);
      visitChildren(node, classScope, new Set(['id']));
      return;
    }
    visitChildren(node, scope);
  }

  function resolveBinding(node, name) {
    let scope = nodeScopes.get(node) ?? rootScope;
    while (scope) {
      if (scope.bindings.has(name)) return true;
      scope = scope.parent;
    }
    return false;
  }

  visit(program, rootScope);
  return {
    isUnboundGlobal(node, name) {
      return node?.type === 'Identifier'
        && node.name === name
        && !resolveBinding(node, name);
    }
  };
}

function importedName(specifier) {
  if (specifier.imported?.type === 'Identifier') return specifier.imported.name;
  if (specifier.imported?.type === 'Literal') return specifier.imported.value;
  return null;
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
