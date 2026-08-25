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
  const nodes = [program];
  while (nodes.length > 0) {
    const node = nodes.pop();
    if (!node || typeof node !== 'object') continue;

    if (
      node.type === 'ImportDeclaration'
      || node.type === 'ExportNamedDeclaration'
      || node.type === 'ExportAllDeclaration'
    ) {
      addLiteralDependency(dependencies, node.source, 'esm');
    } else if (node.type === 'ImportExpression') {
      if (!addLiteralDependency(dependencies, node.source, 'esm')) {
        unresolvedCodes.add('COMPUTED_DYNAMIC_IMPORT');
      }
    } else if (node.type === 'CallExpression') {
      const requireKind = requireCallKind(node.callee);
      if (requireKind) {
        if (!addLiteralDependency(dependencies, node.arguments[0], 'cjs')) {
          unresolvedCodes.add(requireKind === 'module.require'
            ? 'COMPUTED_MODULE_REQUIRE'
            : 'COMPUTED_REQUIRE');
        }
      }
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child.type === 'string') nodes.push(child);
        }
      } else if (value && typeof value.type === 'string') {
        nodes.push(value);
      }
    }
  }

  return {
    dependencies: uniqueDependencies(dependencies),
    unresolvedCodes: [...unresolvedCodes]
  };
}

function addLiteralDependency(dependencies, node, mode) {
  if (node?.type !== 'Literal' || typeof node.value !== 'string') return false;
  dependencies.push({ specifier: node.value, mode });
  return true;
}

function requireCallKind(callee) {
  if (callee?.type === 'Identifier' && callee.name === 'require') {
    return 'require';
  }
  if (
    callee?.type === 'MemberExpression'
    && callee.object?.type === 'Identifier'
    && callee.object.name === 'module'
    && memberPropertyName(callee) === 'require'
  ) {
    return 'module.require';
  }
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
