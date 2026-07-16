import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parseValidatedJsonl } from './stage7SourceExpansionContracts.js';

const execFile = promisify(execFileCallback);

export const SOURCE_EXPANSION_ROOT_RELATIVE = '.local/stage7-source-expansion';
export const SOURCE_EXPANSION_DIRECTORIES = Object.freeze([
  'metadata',
  'evidence',
  'reviews',
  'reports'
]);

export class SourceExpansionBoundaryError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'SourceExpansionBoundaryError';
    this.code = code;
  }
}

export async function assertSourceExpansionRoot(root, {
  repositoryRoot = process.cwd(),
  gitStatus = defaultGitStatus
} = {}) {
  const repository = path.resolve(repositoryRoot);
  const expected = path.resolve(repository, SOURCE_EXPANSION_ROOT_RELATIVE);
  const absolute = path.resolve(root);
  if (absolute !== expected) {
    throw new SourceExpansionBoundaryError('ROOT_INVALID', absolute);
  }
  let stat;
  try {
    stat = await fs.lstat(absolute);
  } catch (error) {
    if (error.code === 'ENOENT') throw new SourceExpansionBoundaryError('ROOT_INVALID', absolute);
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new SourceExpansionBoundaryError('ROOT_INVALID', absolute);
  }
  if (await gitStatus(['check-ignore', '--quiet', '--', absolute], repository) !== 0) {
    throw new SourceExpansionBoundaryError('ROOT_NOT_IGNORED', absolute);
  }
  if (await gitStatus(['ls-files', '--error-unmatch', '--', absolute], repository) === 0) {
    throw new SourceExpansionBoundaryError('ROOT_TRACKED', absolute);
  }
  return absolute;
}

export async function readSourceExpansionJsonl(root, relativePath, validator) {
  const absolute = await resolveRegularInside(root, relativePath);
  const text = await readUtf8(absolute, relativePath);
  return parseValidatedJsonl(text, validator);
}

export async function readSourceExpansionJson(root, relativePath) {
  const absolute = await resolveRegularInside(root, relativePath);
  const text = await readUtf8(absolute, relativePath);
  try {
    return JSON.parse(text);
  } catch {
    throw new SourceExpansionBoundaryError('INPUT_INVALID_JSON', relativePath);
  }
}

export async function assertExactInventory(root, relativePath, expected) {
  const directory = path.resolve(root, relativePath);
  await assertInsideWithoutSymlinks(root, directory);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) {
    throw new SourceExpansionBoundaryError('REPORT_INVENTORY_INVALID', relativePath);
  }
  const actual = entries.map((entry) => entry.name).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new SourceExpansionBoundaryError(
      'REPORT_INVENTORY_INVALID',
      `${relativePath}:${actual.join(',')}`
    );
  }
}

export async function writeFreshReportDirectory(root, name, files, {
  rename = fs.rename,
  writeFile = fs.writeFile
} = {}) {
  const reports = path.join(root, 'reports');
  const output = path.join(reports, name);
  await assertInsideWithoutSymlinks(root, reports);
  try {
    await fs.lstat(output);
    throw new SourceExpansionBoundaryError('REPORT_EXISTS', name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const temporary = path.join(reports, `.${name}.tmp-${process.pid}`);
  try {
    await fs.lstat(temporary);
    throw new SourceExpansionBoundaryError('TEMP_EXISTS', temporary);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.mkdir(temporary);
  try {
    const sortedFiles = Object.entries(files).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    for (const [filename, content] of sortedFiles) {
      if (!/^[a-z0-9][a-z0-9.-]*$/u.test(filename)) {
        throw new SourceExpansionBoundaryError('REPORT_FILENAME_INVALID', filename);
      }
      if (typeof content !== 'string') {
        throw new SourceExpansionBoundaryError('REPORT_CONTENT_INVALID', filename);
      }
      await writeFile(path.join(temporary, filename), content, { encoding: 'utf8', flag: 'wx' });
    }
    await rename(temporary, output);
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return output;
}

async function readUtf8(absolute, relativePath) {
  const bytes = await fs.readFile(absolute);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new SourceExpansionBoundaryError('INPUT_INVALID_UTF8', relativePath);
  }
}

async function resolveRegularInside(root, relativePath) {
  const absolute = path.resolve(root, relativePath);
  await assertInsideWithoutSymlinks(root, absolute);
  const stat = await fs.lstat(absolute);
  if (stat.isSymbolicLink()) {
    throw new SourceExpansionBoundaryError('PATH_SYMLINK', relativePath);
  }
  if (!stat.isFile()) {
    throw new SourceExpansionBoundaryError('INPUT_NOT_REGULAR', relativePath);
  }
  return absolute;
}

async function assertInsideWithoutSymlinks(root, candidate) {
  const sourceRoot = path.resolve(root);
  const absolute = path.resolve(candidate);
  if (!isEqualOrInside(sourceRoot, absolute)) {
    throw new SourceExpansionBoundaryError('PATH_ESCAPE', absolute);
  }
  let rootStat;
  try {
    rootStat = await fs.lstat(sourceRoot);
  } catch (error) {
    if (error.code === 'ENOENT') throw new SourceExpansionBoundaryError('INPUT_MISSING', sourceRoot);
    throw error;
  }
  if (rootStat.isSymbolicLink()) {
    throw new SourceExpansionBoundaryError('PATH_SYMLINK', sourceRoot);
  }
  if (!rootStat.isDirectory()) {
    throw new SourceExpansionBoundaryError('ROOT_INVALID', sourceRoot);
  }

  const relative = path.relative(sourceRoot, absolute);
  let current = sourceRoot;
  for (const segment of relative ? relative.split(path.sep) : []) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new SourceExpansionBoundaryError('INPUT_MISSING', current);
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new SourceExpansionBoundaryError('PATH_SYMLINK', current);
    }
  }
  return absolute;
}

function isEqualOrInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
  );
}

async function defaultGitStatus(args, cwd) {
  try {
    await execFile('git', args, { cwd });
    return 0;
  } catch (error) {
    return Number.isInteger(error.code) ? error.code : 1;
  }
}
