import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertSourceExpansionRoot } from './stage7SourceExpansionBoundary.js';
import { CANDIDATE_ID_PATTERN } from './stage7SourceExpansionContracts.js';

export const CANDIDATE_NBT_LIMITS = Object.freeze({
  maxRawBytes: 16 * 1024 * 1024,
  maxInflatedBytes: 64 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxDepth: 32,
  maxEntries: 1_500_000,
  maxStringBytes: 32 * 1024,
  maxBlocks: 64 ** 3,
  maxPaletteEntries: 4096,
  maxBlockEntities: 16_384
});

export class CandidateReadinessError extends Error {
  constructor(code, stage, candidateId, safeDetail = {}) {
    super(`${code}:${stage}:${candidateId}`);
    this.name = 'CandidateReadinessError';
    this.code = code;
    this.stage = stage;
    this.candidate_id = candidateId;
    this.safe_detail = Object.freeze({ ...safeDetail });
  }
}

export function assertCandidateId(candidateId) {
  if (typeof candidateId !== 'string' || !CANDIDATE_ID_PATTERN.test(candidateId)) {
    fail('CANDIDATE_ID_INVALID', 'boundary', String(candidateId));
  }
  return candidateId;
}

export async function readQuarantinedNbt({
  root,
  candidateId,
  relativePath,
  limits = CANDIDATE_NBT_LIMITS
}, {
  assertRoot = assertSourceExpansionRoot,
  lstat = fs.lstat,
  realpath = fs.realpath,
  openFile = fs.open
} = {}) {
  const id = assertCandidateId(candidateId);
  const validatedRoot = path.resolve(await assertRoot(root));
  const normalized = String(relativePath || '').replaceAll('\\', '/');
  const basename = path.posix.basename(normalized);
  const match = /^([a-f0-9]{64})\.nbt$/u.exec(basename);
  if (!match) fail('QUARANTINE_NAME_INVALID', 'boundary', id, { basename });
  const expected = `quarantine/${id}/${basename}`;
  if (normalized !== expected) {
    fail('QUARANTINE_PATH_INVALID', 'boundary', id, { basename });
  }
  const absolute = path.resolve(validatedRoot, ...normalized.split('/'));
  if (!isInside(validatedRoot, absolute)) {
    fail('QUARANTINE_PATH_ESCAPE', 'boundary', id, { basename });
  }
  await assertParents(validatedRoot, absolute, id, lstat);
  const entry = await safeLstat(absolute, id, basename, lstat);
  if (entry.isSymbolicLink()) {
    fail('QUARANTINE_PATH_SYMLINK', 'boundary', id, { basename });
  }
  if (!entry.isFile()) fail('QUARANTINE_NOT_REGULAR', 'boundary', id, { basename });
  const canonicalRoot = await realpath(validatedRoot);
  const canonicalFile = await realpath(absolute);
  if (!isInside(canonicalRoot, canonicalFile)) {
    fail('QUARANTINE_PATH_ESCAPE', 'boundary', id, { basename });
  }

  const noFollow = Number.isInteger(constants.O_NOFOLLOW) ? constants.O_NOFOLLOW : 0;
  let handle;
  try {
    handle = await openFile(absolute, constants.O_RDONLY | noFollow);
  } catch (error) {
    fail('QUARANTINE_OPEN_FAILED', 'boundary', id, { basename, error_code: error.code || 'UNKNOWN' });
  }
  try {
    const before = await handle.stat();
    if (!before.isFile()) fail('QUARANTINE_NOT_REGULAR', 'boundary', id, { basename });
    if (before.size > limits.maxRawBytes) {
      fail('RAW_BYTES_LIMIT', 'boundary', id, { basename, byte_count: before.size });
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!sameIdentity(before, after) || bytes.length !== before.size) {
      fail('FILE_IDENTITY_CHANGED', 'boundary', id, { basename });
    }
    const contentSha256 = createHash('sha256').update(bytes).digest('hex');
    if (contentSha256 !== match[1]) {
      fail('CONTENT_HASH_NAME_MISMATCH', 'boundary', id, { basename });
    }
    return Object.freeze({
      candidate_id: id,
      basename,
      bytes,
      content_sha256: contentSha256,
      raw_byte_count: bytes.length
    });
  } finally {
    await handle.close();
  }
}

async function assertParents(root, absolute, candidateId, lstat) {
  const parent = path.dirname(absolute);
  const relative = path.relative(root, parent);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const entry = await safeLstat(current, candidateId, path.basename(current), lstat);
    if (entry.isSymbolicLink()) {
      fail('QUARANTINE_PATH_SYMLINK', 'boundary', candidateId, { basename: path.basename(current) });
    }
    if (!entry.isDirectory()) {
      fail('QUARANTINE_PARENT_INVALID', 'boundary', candidateId, { basename: path.basename(current) });
    }
  }
}

async function safeLstat(value, candidateId, basename, lstat) {
  try {
    return await lstat(value);
  } catch (error) {
    fail('QUARANTINE_PATH_MISSING', 'boundary', candidateId, {
      basename,
      error_code: error.code || 'UNKNOWN'
    });
  }
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
  );
}

function fail(code, stage, candidateId, safeDetail = {}) {
  throw new CandidateReadinessError(code, stage, candidateId, safeDetail);
}
