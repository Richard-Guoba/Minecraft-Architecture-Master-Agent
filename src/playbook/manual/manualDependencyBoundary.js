import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_EXTENSIONS = Object.freeze(['.js', '.mjs', '.cjs']);
const MODULE_EXTENSION_SET = new Set(MODULE_EXTENSIONS);
const REGEX_PREFIX_IDENTIFIERS = new Set([
  'await', 'case', 'delete', 'do', 'else', 'in', 'instanceof', 'of',
  'return', 'throw', 'typeof', 'void', 'yield'
]);
const REGEX_PREFIX_PUNCTUATION = new Set([
  '(', '[', '{', '=', ',', ':', ';', '!', '?', '&', '|', '+', '-', '*',
  '%', '^', '~', '<', '>'
]);

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
    const scanned = scanModuleDependencies(source);
    for (const code of scanned.unresolvedCodes) {
      unresolved.add(`${safeRelative(root, logicalPath)}:${code}`);
    }
    for (const specifier of scanned.specifiers) {
      if (!isLocalSpecifier(specifier)) continue;
      const resolved = await resolveLocalModule(realPath, specifier);
      if (!resolved) {
        unresolved.add(
          `${safeRelative(root, logicalPath)}:LOCAL_DEPENDENCY_UNRESOLVED`
        );
        continue;
      }
      let resolvedReal;
      try {
        resolvedReal = await fs.realpath(resolved);
      } catch {
        unresolved.add(
          `${safeRelative(root, logicalPath)}:LOCAL_DEPENDENCY_UNAVAILABLE`
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
        queuedModules.push(resolved);
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

function scanModuleDependencies(source) {
  const { tokens, invalid } = tokenizeJavaScript(source);
  const specifiers = new Set();
  const unresolvedCodes = new Set();
  if (invalid) unresolvedCodes.add('SOURCE_TOKENIZATION_FAILED');

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'identifier') continue;
    if (token.value === 'import') {
      if (tokens[index - 1]?.value === '.') continue;
      const next = tokens[index + 1];
      if (next?.value === '.') continue;
      if (next?.value === '(') {
        const expression = dynamicExpression(tokens, index + 1);
        if (expression.specifier !== null) {
          specifiers.add(expression.specifier);
        } else {
          unresolvedCodes.add('COMPUTED_DYNAMIC_IMPORT');
        }
        continue;
      }
      if (next?.type === 'string') {
        specifiers.add(next.value);
        continue;
      }
      const fromSpecifier = findFromSpecifier(tokens, index + 1);
      if (fromSpecifier !== null) specifiers.add(fromSpecifier);
      continue;
    }
    if (token.value === 'export') {
      const fromSpecifier = findFromSpecifier(tokens, index + 1);
      if (fromSpecifier !== null) specifiers.add(fromSpecifier);
      continue;
    }
    if (token.value === 'require' && tokens[index - 1]?.value !== '.') {
      if (tokens[index + 1]?.value !== '(') continue;
      const expression = dynamicExpression(tokens, index + 1);
      if (expression.specifier !== null) {
        specifiers.add(expression.specifier);
      } else {
        unresolvedCodes.add('COMPUTED_REQUIRE');
      }
    }
  }
  return {
    specifiers: [...specifiers],
    unresolvedCodes: [...unresolvedCodes]
  };
}

function dynamicExpression(tokens, openIndex) {
  const closeIndex = matchingCloseParenthesis(tokens, openIndex);
  const expression = tokens.slice(openIndex + 1, closeIndex);
  if (
    closeIndex < tokens.length
    && expression.length === 1
    && expression[0].type === 'string'
  ) {
    return { specifier: expression[0].value };
  }
  return { specifier: null };
}

function matchingCloseParenthesis(tokens, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (tokens[index].value === '(') depth += 1;
    if (tokens[index].value === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return tokens.length;
}

function findFromSpecifier(tokens, startIndex) {
  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.value === ';') return null;
    if (
      token.type === 'identifier'
      && token.value === 'from'
      && tokens[index + 1]?.type === 'string'
    ) {
      return tokens[index + 1].value;
    }
    if (
      index > startIndex
      && token.type === 'identifier'
      && ['import', 'export'].includes(token.value)
    ) {
      return null;
    }
  }
  return null;
}

function tokenizeJavaScript(source) {
  const tokens = [];
  let invalid = false;
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    if (character === '/' && source[index + 1] === '/') {
      index = skipLineComment(source, index + 2);
      continue;
    }
    if (character === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end === -1) {
        invalid = true;
        break;
      }
      index = end + 2;
      continue;
    }
    if (character === "'" || character === '"') {
      const parsed = readQuotedString(source, index, character);
      tokens.push({ type: 'string', value: parsed.value });
      invalid ||= parsed.invalid;
      index = parsed.nextIndex;
      continue;
    }
    if (character === '`') {
      const parsed = readTemplateLiteral(source, index);
      tokens.push({ type: 'template', value: '`' });
      invalid ||= parsed.invalid;
      for (const expression of parsed.expressions) {
        const nested = tokenizeJavaScript(expression);
        tokens.push(...nested.tokens);
        invalid ||= nested.invalid;
      }
      index = parsed.nextIndex;
      continue;
    }
    if (/[A-Za-z_$]/u.test(character)) {
      let end = index + 1;
      while (end < source.length && /[A-Za-z0-9_$]/u.test(source[end])) end += 1;
      tokens.push({ type: 'identifier', value: source.slice(index, end) });
      index = end;
      continue;
    }
    if (character === '/' && canStartRegex(tokens.at(-1))) {
      const parsed = skipRegexLiteral(source, index);
      tokens.push({ type: 'regex', value: '/' });
      invalid ||= parsed.invalid;
      index = parsed.nextIndex;
      continue;
    }
    tokens.push({ type: 'punctuation', value: character });
    index += 1;
  }
  return { tokens, invalid };
}

function readQuotedString(source, startIndex, quote) {
  let value = '';
  let index = startIndex + 1;
  while (index < source.length) {
    const character = source[index];
    if (character === quote) {
      return { value, nextIndex: index + 1, invalid: false };
    }
    if (character === '\\') {
      if (index + 1 >= source.length) break;
      value += source[index + 1];
      index += 2;
      continue;
    }
    if (character === '\n' || character === '\r') break;
    value += character;
    index += 1;
  }
  return { value, nextIndex: source.length, invalid: true };
}

function readTemplateLiteral(source, startIndex) {
  const expressions = [];
  let invalid = false;
  let index = startIndex + 1;
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === '$' && source[index + 1] === '{') {
      const parsed = readTemplateExpression(source, index + 2);
      expressions.push(parsed.expression);
      invalid ||= parsed.invalid;
      index = parsed.nextIndex;
      continue;
    }
    if (source[index] === '`') {
      return { expressions, nextIndex: index + 1, invalid };
    }
    index += 1;
  }
  return { expressions, nextIndex: source.length, invalid: true };
}

function readTemplateExpression(source, startIndex) {
  let depth = 1;
  let index = startIndex;
  let invalid = false;
  let previous = null;
  while (index < source.length) {
    const character = source[index];
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    if (character === '/' && source[index + 1] === '/') {
      index = skipLineComment(source, index + 2);
      continue;
    }
    if (character === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end === -1) {
        invalid = true;
        break;
      }
      index = end + 2;
      continue;
    }
    if (character === "'" || character === '"') {
      const parsed = readQuotedString(source, index, character);
      invalid ||= parsed.invalid;
      previous = { type: 'string', value: parsed.value };
      index = parsed.nextIndex;
      continue;
    }
    if (character === '`') {
      const parsed = readTemplateLiteral(source, index);
      invalid ||= parsed.invalid;
      previous = { type: 'template', value: '`' };
      index = parsed.nextIndex;
      continue;
    }
    if (/[A-Za-z_$]/u.test(character)) {
      let end = index + 1;
      while (end < source.length && /[A-Za-z0-9_$]/u.test(source[end])) end += 1;
      previous = { type: 'identifier', value: source.slice(index, end) };
      index = end;
      continue;
    }
    if (character === '/' && canStartRegex(previous)) {
      const parsed = skipRegexLiteral(source, index);
      invalid ||= parsed.invalid;
      previous = { type: 'regex', value: '/' };
      index = parsed.nextIndex;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          expression: source.slice(startIndex, index),
          nextIndex: index + 1,
          invalid
        };
      }
    }
    previous = { type: 'punctuation', value: character };
    index += 1;
  }
  return {
    expression: source.slice(startIndex),
    nextIndex: source.length,
    invalid: true
  };
}

function skipLineComment(source, startIndex) {
  const end = source.indexOf('\n', startIndex);
  return end === -1 ? source.length : end + 1;
}

function skipRegexLiteral(source, startIndex) {
  let index = startIndex + 1;
  let inCharacterClass = false;
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === '[') inCharacterClass = true;
    if (source[index] === ']') inCharacterClass = false;
    if (source[index] === '/' && !inCharacterClass) {
      index += 1;
      while (index < source.length && /[A-Za-z]/u.test(source[index])) index += 1;
      return { nextIndex: index, invalid: false };
    }
    if (source[index] === '\n' || source[index] === '\r') break;
    index += 1;
  }
  return { nextIndex: source.length, invalid: true };
}

function canStartRegex(previous) {
  if (!previous) return true;
  if (previous.type === 'identifier') {
    return REGEX_PREFIX_IDENTIFIERS.has(previous.value);
  }
  return previous.type === 'punctuation'
    && REGEX_PREFIX_PUNCTUATION.has(previous.value);
}

function isLocalSpecifier(specifier) {
  return specifier.startsWith('.')
    || specifier.startsWith('/')
    || specifier.startsWith('file:');
}

async function resolveLocalModule(importerPath, specifier) {
  let basePath;
  try {
    basePath = specifier.startsWith('file:')
      ? fileURLToPath(specifier)
      : path.isAbsolute(specifier)
        ? specifier
        : path.resolve(path.dirname(importerPath), specifier);
  } catch {
    return null;
  }
  const candidates = [basePath];
  if (path.extname(basePath) === '') {
    candidates.push(...MODULE_EXTENSIONS.map((extension) =>
      `${basePath}${extension}`));
    candidates.push(...MODULE_EXTENSIONS.map((extension) =>
      path.join(basePath, `index${extension}`)));
  }
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // Try the next Node-style local module candidate.
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
