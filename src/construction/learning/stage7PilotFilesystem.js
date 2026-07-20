import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalPilotJson } from './stage7PilotBatch.js';
import { assertSourceExpansionRoot } from './stage7SourceExpansionBoundary.js';

export const PILOT_MANAGED_DIRECTORIES = Object.freeze([
  'quarantine', 'prepared', 'fingerprints', 'manifests',
  'reviews', 'reports/pilots'
]);

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const RELATIVE_PATH_PATTERN = /^[a-z0-9][a-z0-9._:/-]*$/u;

export class PilotFilesystemError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'PilotFilesystemError';
    this.code = code;
  }
}

export async function assertPilotRoot(root, deps = {}) {
  return (await rootContext(root, deps)).absolute;
}

export async function ensurePilotLayout(root, deps = {}) {
  const context = await rootContext(root, deps);
  for (const relative of PILOT_MANAGED_DIRECTORIES) {
    await ensureDirectoryChain(context, relative.split('/'), deps);
  }
  return context.absolute;
}

export async function readPilotJson(root, relativePath, deps = {}) {
  const { bytes } = await readRegularBytes(root, relativePath, deps);
  const text = decodeUtf8(bytes, relativePath);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail('PILOT_JSON_INVALID', relativePath);
  }
  if (text !== canonicalPilotJson(value)) {
    fail('PILOT_JSON_NONCANONICAL', relativePath);
  }
  return value;
}

export async function readPilotJsonl(root, relativePath, deps = {}) {
  let bytes;
  try {
    ({ bytes } = await readRegularBytes(root, relativePath, deps));
  } catch (error) {
    if (error instanceof PilotFilesystemError && error.code === 'PILOT_PATH_MISSING') {
      return Object.freeze([]);
    }
    throw error;
  }
  const text = decodeUtf8(bytes, relativePath);
  const lines = text.length === 0 ? [] : text.split('\n').slice(0, -1);
  if (text.length > 0 && !text.endsWith('\n')) {
    fail('PILOT_JSONL_NONCANONICAL', relativePath);
  }
  const records = lines.map((line) => {
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      fail('PILOT_JSONL_INVALID', relativePath);
    }
    if (line !== canonicalPilotJson(value).slice(0, -1)) {
      fail('PILOT_JSONL_NONCANONICAL', relativePath);
    }
    return value;
  });
  if (text !== records.map(canonicalPilotJson).join('')) {
    fail('PILOT_JSONL_NONCANONICAL', relativePath);
  }
  return Object.freeze(records);
}

export async function writePilotJsonIdempotent(root, relativePath, value, deps = {}) {
  const bytes = Buffer.from(canonicalPilotJson(value), 'utf8');
  return writePilotBytesIdempotent(root, relativePath, bytes, hashBytes(bytes), deps);
}

export async function writePilotBytesIdempotent(
  root,
  relativePath,
  bytes,
  expectedSha256,
  deps = {}
) {
  const content = Buffer.from(bytes);
  if (!SHA256_PATTERN.test(expectedSha256 || '') || hashBytes(content) !== expectedSha256) {
    fail('PILOT_HASH_MISMATCH', relativePath);
  }
  const target = await writableTarget(root, relativePath, deps);
  const existing = await readExistingTarget(target, relativePath, deps);
  if (existing !== null) {
    if (existing.equals(content)) return target.absolute;
    fail('PILOT_FILE_CONFLICT', relativePath);
  }
  await writeAtomic(target, content, false, deps);
  return target.absolute;
}

export async function appendPilotJsonlIdempotent(
  root,
  relativePath,
  record,
  identity,
  deps = {}
) {
  const { identityOf } = deps;
  if (typeof identity !== 'string' || identity.length === 0 || typeof identityOf !== 'function'
    || identityOf(record) !== identity) {
    fail('PILOT_LEDGER_IDENTITY_INVALID', relativePath);
  }
  const existing = await readPilotJsonl(root, relativePath, deps);
  const canonicalRecord = canonicalPilotJson(record);
  const match = existing.find((item) => identityOf(item) === identity);
  if (match !== undefined) {
    if (canonicalPilotJson(match) === canonicalRecord) return match;
    fail('PILOT_LEDGER_CONFLICT', identity);
  }
  const records = [...existing, record].sort((left, right) =>
    identityOf(left).localeCompare(identityOf(right)));
  if (records.some((item) => typeof identityOf(item) !== 'string'
    || identityOf(item).length === 0)) {
    fail('PILOT_LEDGER_IDENTITY_INVALID', relativePath);
  }
  const target = await writableTarget(root, relativePath, deps);
  await readExistingTarget(target, relativePath, deps);
  await writeAtomic(target, Buffer.from(records.map(canonicalPilotJson).join(''), 'utf8'), true, deps);
  return record;
}

async function rootContext(root, deps) {
  const assertRoot = deps.assertRoot || assertSourceExpansionRoot;
  const absolute = path.resolve(await assertRoot(root));
  let stat;
  try {
    stat = await (deps.lstat || fs.lstat)(absolute);
  } catch (error) {
    if (error.code === 'ENOENT') fail('PILOT_ROOT_INVALID', absolute);
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('PILOT_ROOT_INVALID', absolute);
  }
  const real = await (deps.realpath || fs.realpath)(absolute);
  return { absolute, real };
}

function validatedRelative(relativePath) {
  if (typeof relativePath !== 'string' || !RELATIVE_PATH_PATTERN.test(relativePath)
    || relativePath.includes('\\') || path.posix.isAbsolute(relativePath)) {
    fail('PILOT_PATH_INVALID', String(relativePath));
  }
  const segments = relativePath.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
    || !PILOT_MANAGED_DIRECTORIES.some((managed) =>
      relativePath === managed || relativePath.startsWith(`${managed}/`))) {
    fail('PILOT_PATH_INVALID', relativePath);
  }
  return segments;
}

async function writableTarget(root, relativePath, deps) {
  const context = await rootContext(root, deps);
  const segments = validatedRelative(relativePath);
  if (segments.length < 2) fail('PILOT_PATH_INVALID', relativePath);
  await ensureDirectoryChain(context, segments.slice(0, -1), deps);
  const absolute = path.join(context.absolute, ...segments);
  assertLexicalContainment(context.absolute, absolute, relativePath);
  return { ...context, absolute, relativePath };
}

async function readRegularBytes(root, relativePath, deps) {
  const context = await rootContext(root, deps);
  const segments = validatedRelative(relativePath);
  if (segments.length < 2) fail('PILOT_PATH_INVALID', relativePath);
  await assertDirectoryChain(context, segments.slice(0, -1), relativePath, deps);
  const absolute = path.join(context.absolute, ...segments);
  assertLexicalContainment(context.absolute, absolute, relativePath);
  const target = { ...context, absolute, relativePath };
  const bytes = await readExistingTarget(target, relativePath, deps);
  if (bytes === null) fail('PILOT_PATH_MISSING', relativePath);
  return { absolute, bytes };
}

async function ensureDirectoryChain(context, segments, deps) {
  let current = context.absolute;
  for (const segment of segments) {
    current = path.join(current, segment);
    assertLexicalContainment(context.absolute, current, current);
    let stat;
    try {
      stat = await (deps.lstat || fs.lstat)(current);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try {
        await (deps.mkdir || fs.mkdir)(current);
      } catch (mkdirError) {
        if (mkdirError.code !== 'EEXIST') throw mkdirError;
      }
      stat = await (deps.lstat || fs.lstat)(current);
    }
    assertDirectoryStat(stat, current);
    await assertRealContainment(context.real, current, deps);
  }
}

async function assertDirectoryChain(context, segments, detail, deps) {
  let current = context.absolute;
  for (const segment of segments) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = await (deps.lstat || fs.lstat)(current);
    } catch (error) {
      if (error.code === 'ENOENT') fail('PILOT_PATH_MISSING', detail);
      throw error;
    }
    assertDirectoryStat(stat, current);
    await assertRealContainment(context.real, current, deps);
  }
}

function assertDirectoryStat(stat, detail) {
  if (stat.isSymbolicLink()) fail('PILOT_PATH_SYMLINK', detail);
  if (!stat.isDirectory()) fail('PILOT_PARENT_NOT_DIRECTORY', detail);
}

async function readExistingTarget(target, detail, deps) {
  const lstat = deps.lstat || fs.lstat;
  let entry;
  try {
    entry = await lstat(target.absolute);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (entry.isSymbolicLink()) fail('PILOT_PATH_SYMLINK', detail);
  if (!entry.isFile()) fail('PILOT_NOT_REGULAR', detail);
  await assertRealContainment(target.real, target.absolute, deps);

  const noFollow = Number.isInteger(constants.O_NOFOLLOW) ? constants.O_NOFOLLOW : 0;
  const handle = await (deps.open || fs.open)(target.absolute, constants.O_RDONLY | noFollow);
  try {
    const before = await handle.stat();
    if (!before.isFile()) fail('PILOT_NOT_REGULAR', detail);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!sameIdentity(before, after) || bytes.length !== before.size) {
      fail('PILOT_FILE_CHANGED', detail);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function writeAtomic(target, bytes, replace, deps) {
  const temporary = path.join(
    path.dirname(target.absolute),
    `.${path.basename(target.absolute)}.tmp-${process.pid}`
  );
  const lstat = deps.lstat || fs.lstat;
  try {
    await lstat(temporary);
    fail('PILOT_TEMP_EXISTS', target.relativePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  let owned = false;
  try {
    const handle = await (deps.open || fs.open)(temporary, 'wx');
    owned = true;
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (!replace) {
      const lateExisting = await readExistingTarget(target, target.relativePath, deps);
      if (lateExisting !== null) {
        if (lateExisting.equals(bytes)) return;
        fail('PILOT_FILE_CONFLICT', target.relativePath);
      }
    }
    await (deps.rename || fs.rename)(temporary, target.absolute);
    owned = false;
    await syncDirectory(path.dirname(target.absolute), deps);
  } catch (error) {
    if (owned) await (deps.remove || fs.rm)(temporary, { force: true });
    throw error;
  } finally {
    if (owned) await (deps.remove || fs.rm)(temporary, { force: true });
  }
}

async function syncDirectory(directory, deps) {
  const handle = await (deps.open || fs.open)(directory, 'r');
  try {
    await handle.sync();
  } catch (error) {
    if (!['EINVAL', 'ENOTSUP'].includes(error.code)) throw error;
  } finally {
    await handle.close();
  }
}

async function assertRealContainment(rootReal, candidate, deps) {
  const candidateReal = await (deps.realpath || fs.realpath)(candidate);
  if (!isEqualOrInside(rootReal, candidateReal)) {
    fail('PILOT_PATH_ESCAPE', candidate);
  }
}

function assertLexicalContainment(root, candidate, detail) {
  if (!isEqualOrInside(root, candidate)) fail('PILOT_PATH_INVALID', detail);
}

function isEqualOrInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..'
    && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function decodeUtf8(bytes, detail) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('PILOT_UTF8_INVALID', detail);
  }
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino
    && left.size === right.size && left.mtimeMs === right.mtimeMs;
}

function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fail(code, detail) {
  throw new PilotFilesystemError(code, detail);
}
