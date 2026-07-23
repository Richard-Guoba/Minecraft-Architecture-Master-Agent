import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export const PRIVATE_ROOT_RELATIVE = '.local/stage7-private-research';
export const PRIVATE_SCOPE = 'stage7-private-research-only';

export class PrivateResearchBoundaryError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'PrivateResearchBoundaryError';
    this.code = code;
  }
}

export function resolvePrivateRoot(cwd = process.cwd()) {
  return path.resolve(cwd, PRIVATE_ROOT_RELATIVE);
}

export async function assertPrivateRoot(root) {
  const absolute = path.resolve(root);
  let entry;
  try {
    entry = await fs.lstat(absolute);
  } catch (error) {
    if (error.code === 'ENOENT') throw new PrivateResearchBoundaryError('ROOT_MISSING', absolute);
    throw error;
  }
  if (entry.isSymbolicLink()) throw new PrivateResearchBoundaryError('PATH_SYMLINK', absolute);
  if (!entry.isDirectory()) throw new PrivateResearchBoundaryError('ROOT_NOT_DIRECTORY', absolute);
  await assertGitIgnoredAndUntracked(absolute);
  return fs.realpath(absolute);
}

export async function assertPrivateAcknowledgement(root) {
  const privateRoot = await assertPrivateRoot(root);
  const acknowledgementPath = path.join(privateRoot, 'PRIVATE_RESEARCH_ACK.json');
  let acknowledgement;
  try {
    acknowledgement = await readCanonicalJson(acknowledgementPath);
  } catch (error) {
    if (error.code === 'ENOENT') throw new PrivateResearchBoundaryError('ACK_MISSING', acknowledgementPath);
    throw error;
  }
  if (
    acknowledgement.scope !== PRIVATE_SCOPE
    || acknowledgement.distribution_prohibited !== true
    || acknowledgement.dataset_v3_unchanged !== true
    || acknowledgement.m4_apply_mode_unchanged !== true
  ) throw new PrivateResearchBoundaryError('ACK_INVALID', acknowledgementPath);
  return acknowledgement;
}

export async function assertPrivateCandidate(root, candidate) {
  const privateRoot = await assertPrivateRoot(root);
  const absolute = path.resolve(candidate);
  let entry;
  try {
    entry = await fs.lstat(absolute);
  } catch (error) {
    if (error.code === 'ENOENT') throw new PrivateResearchBoundaryError('PATH_MISSING', absolute);
    throw error;
  }
  if (entry.isSymbolicLink()) throw new PrivateResearchBoundaryError('PATH_SYMLINK', absolute);
  const resolved = await fs.realpath(absolute);
  if (!isEqualOrInside(privateRoot, resolved)) throw new PrivateResearchBoundaryError('PATH_OUTSIDE_PRIVATE_ROOT', resolved);
  await assertGitIgnoredAndUntracked(resolved);
  return resolved;
}

export async function readCanonicalJson(filePath) {
  const value = JSON.parse(await fs.readFile(filePath, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PrivateResearchBoundaryError('JSON_INVALID', filePath);
  return value;
}

export async function writeCanonicalJson(filePath, value) {
  await fs.writeFile(filePath, canonicalJson(value), 'utf8');
}

export function canonicalJson(value) {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

async function assertGitIgnoredAndUntracked(filePath) {
  if (await gitStatus(['check-ignore', '--quiet', '--', filePath]) !== 0) {
    throw new PrivateResearchBoundaryError('PATH_NOT_IGNORED', filePath);
  }
  if (await gitStatus(['ls-files', '--error-unmatch', '--', filePath]) === 0) {
    throw new PrivateResearchBoundaryError('PATH_GIT_TRACKED', filePath);
  }
}

async function gitStatus(argumentsList) {
  try {
    await execFile('git', argumentsList, { cwd: process.cwd() });
    return 0;
  } catch (error) {
    return Number.isInteger(error.code) ? error.code : 1;
  }
}

function isEqualOrInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
  return value;
}
