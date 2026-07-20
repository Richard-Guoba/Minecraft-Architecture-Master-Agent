import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertCandidateId } from './stage7CandidateBoundary.js';
import { BOUNDED_NBT_VERSION } from './stage7BoundedNbt.js';
import { CONDITIONAL_FINGERPRINT_VERSION } from './stage7ConditionalFingerprint.js';
import {
  CONDITIONAL_MATERIAL_MAPPING_SHA256,
  CONDITIONAL_MATERIAL_MAPPING_VERSION,
  CONDITIONAL_PREPARATION_VERSION
} from './stage7ConditionalVoxelPreparation.js';
import {
  PilotFilesystemError,
  appendPilotJsonlIdempotent,
  assertPilotRoot,
  readPilotJsonl,
  writePilotBytesIdempotent,
  writePilotJsonIdempotent
} from './stage7PilotFilesystem.js';
import { canonicalPilotJson } from './stage7PilotBatch.js';
import { VANILLA_STRUCTURE_ADAPTER_VERSION } from './stage7VanillaStructureNbt.js';

export const PILOT_PREPARED_LEDGER_RELATIVE = 'manifests/prepared-cases.jsonl';
export const PILOT_FINGERPRINT_LEDGER_RELATIVE = 'fingerprints/structural-fingerprints.jsonl';

const GRID = 64;
const VOXEL_COUNT = GRID ** 3;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const PREPARED_KEYS = Object.freeze([
  'source', 'candidate_id', 'content_sha256', 'parser_version', 'adapter_version',
  'mapping_version', 'mapping_sha256', 'declared_size', 'actual_bounds',
  'actual_extent', 'translation_offset', 'source_orientation', 'shape',
  'token_counts', 'token_proportions', 'non_air_count', 'token_8_share',
  'entity_count', 'block_entity_count', 'voxel_sha256', 'synthetic_only',
  'authorizes_acquisition', 'authorizes_training', 'authorizes_dataset_admission',
  'preparation_sha256'
]);
const FINGERPRINT_KEYS = Object.freeze([
  'version', 'candidate_id', 'content_sha256', 'preparation_sha256',
  'source_orientation_sha256', 'yaw_sha256', 'yaw_canonical_sha256', 'views',
  'synthetic_only', 'authorizes_acquisition', 'authorizes_training',
  'authorizes_dataset_admission'
]);
const VIEW_KEYS = Object.freeze([
  'yaw', 'extent', 'structural_sha256', 'occupancy_minhash',
  'material_minhash', 'lsh_buckets'
]);

export class PilotArtifactError extends Error {
  constructor(code, candidateId, safeDetail = {}) {
    super(`${code}:artifact:${candidateId}`);
    this.name = 'PilotArtifactError';
    this.code = code;
    this.candidate_id = candidateId;
    this.safe_detail = Object.freeze({ ...safeDetail });
  }
}

export async function persistPilotPrepared(root, prepared, deps = {}) {
  const { voxels, record } = validatePrepared(prepared);
  const id = record.candidate_id;
  const preparationSha256 = record.preparation_sha256;
  const binaryName = `${preparationSha256}.voxels.bin`;
  const sidecarName = `${preparationSha256}.json`;
  const inventory = await preparedInventory(root, id, deps);
  const expected = [binaryName, sidecarName].sort();
  if (inventory.length !== 0 && !sameArray(inventory, expected)) {
    const orphan = inventory.length === 1 && expected.includes(inventory[0]);
    fail(orphan ? 'PREPARED_ARTIFACT_ORPHAN' : 'PREPARED_INVENTORY_INVALID', id);
  }
  try {
    await writePilotBytesIdempotent(
      root, `prepared/${id}/${binaryName}`, voxels, record.voxel_sha256, deps
    );
    await writePilotJsonIdempotent(root, `prepared/${id}/${sidecarName}`, record, deps);
    await appendPilotJsonlIdempotent(
      root,
      PILOT_PREPARED_LEDGER_RELATIVE,
      record,
      preparedIdentity(record),
      { ...deps, identityOf: preparedIdentity }
    );
  } catch (error) {
    rethrowFilesystem(error, id);
  }
  return record;
}

export async function readPilotPreparedIndex(root, deps = {}) {
  let records;
  try {
    records = await readPilotJsonl(root, PILOT_PREPARED_LEDGER_RELATIVE, deps);
  } catch (error) {
    rethrowFilesystem(error, 'operational');
  }
  return Object.freeze(records.map((record) => validatePreparedRecord(record)));
}

export async function appendPilotFingerprint(root, input, deps = {}) {
  const fingerprint = validatePilotFingerprint(input);
  const prepared = await readPilotPreparedIndex(root, deps);
  if (!prepared.some((record) => record.candidate_id === fingerprint.candidate_id
    && record.preparation_sha256 === fingerprint.preparation_sha256
    && record.content_sha256 === fingerprint.content_sha256)) {
    fail('FINGERPRINT_PREPARED_BINDING_MISSING', fingerprint.candidate_id);
  }
  try {
    await appendPilotJsonlIdempotent(
      root,
      PILOT_FINGERPRINT_LEDGER_RELATIVE,
      fingerprint,
      preparedIdentity(fingerprint),
      { ...deps, identityOf: preparedIdentity }
    );
  } catch (error) {
    rethrowFilesystem(error, fingerprint.candidate_id);
  }
  return fingerprint;
}

export async function readPilotFingerprints(root, deps = {}) {
  let records;
  try {
    records = await readPilotJsonl(root, PILOT_FINGERPRINT_LEDGER_RELATIVE, deps);
  } catch (error) {
    rethrowFilesystem(error, 'operational');
  }
  const validated = records.map(validatePilotFingerprint);
  const prepared = await readPilotPreparedIndex(root, deps);
  for (const fingerprint of validated) {
    if (!prepared.some((record) => record.candidate_id === fingerprint.candidate_id
      && record.preparation_sha256 === fingerprint.preparation_sha256
      && record.content_sha256 === fingerprint.content_sha256)) {
      fail('FINGERPRINT_PREPARED_BINDING_MISSING', fingerprint.candidate_id);
    }
  }
  return Object.freeze(validated);
}

function validatePrepared(prepared) {
  const id = prepared?.record?.candidate_id || 'operational';
  if (!prepared || !Buffer.isBuffer(prepared.voxels)
    || prepared.voxels.length !== VOXEL_COUNT
    || prepared.voxels.some((token) => token > 8)) {
    fail('PREPARED_VOXELS_INVALID', id);
  }
  const record = validatePreparedRecord(prepared.record);
  const voxelSha256 = createHash('sha256').update(prepared.voxels).digest('hex');
  if (record.voxel_sha256 !== voxelSha256) fail('PREPARED_VOXEL_HASH_INVALID', record.candidate_id);
  const counts = Array(9).fill(0);
  for (const token of prepared.voxels) counts[token] += 1;
  if (!sameArray(counts, record.token_counts)
    || record.token_proportions.some((value, index) => value !== counts[index] / VOXEL_COUNT)) {
    fail('PREPARED_TOKEN_COUNTS_INVALID', record.candidate_id);
  }
  return { voxels: prepared.voxels, record };
}

function validatePreparedRecord(input) {
  const id = assertCandidateId(input?.candidate_id);
  exactKeys(input, PREPARED_KEYS, 'PREPARED_RECORD_INVALID', id);
  if (input.source !== CONDITIONAL_PREPARATION_VERSION
    || input.parser_version !== BOUNDED_NBT_VERSION
    || input.adapter_version !== VANILLA_STRUCTURE_ADAPTER_VERSION
    || input.mapping_version !== CONDITIONAL_MATERIAL_MAPPING_VERSION
    || input.mapping_sha256 !== CONDITIONAL_MATERIAL_MAPPING_SHA256
    || !SHA256_PATTERN.test(input.content_sha256 || '')
    || !SHA256_PATTERN.test(input.voxel_sha256 || '')
    || !SHA256_PATTERN.test(input.preparation_sha256 || '')
    || !sameArray(input.shape, [GRID, GRID, GRID])
    || !validDimension(input.declared_size)
    || !validBounds(input.actual_bounds)
    || !validDimension(input.actual_extent, GRID)
    || !sameDimension(input.actual_extent, input.actual_bounds.extent)
    || !validOffset(input.translation_offset)
    || input.source_orientation !== 'source'
    || !validCounts(input.token_counts)
    || !validProportions(input.token_proportions)
    || input.non_air_count !== input.token_counts.slice(1).reduce((sum, value) => sum + value, 0)
    || input.token_8_share !== input.token_counts[8] / input.non_air_count
    || input.token_8_share > 0.1 + Number.EPSILON
    || !Number.isSafeInteger(input.entity_count) || input.entity_count < 0
    || !Number.isSafeInteger(input.block_entity_count) || input.block_entity_count < 0) {
    fail('PREPARED_RECORD_INVALID', id);
  }
  if (input.synthetic_only !== false) fail('OPERATIONAL_PREPARED_REQUIRED', id);
  if (input.authorizes_acquisition !== false || input.authorizes_training !== false
    || input.authorizes_dataset_admission !== false) {
    fail('PREPARED_AUTHORITY_INVALID', id);
  }
  const binding = structuredClone(input);
  delete binding.preparation_sha256;
  const expected = createHash('sha256')
    .update(canonicalPilotJson(binding).slice(0, -1)).digest('hex');
  if (input.preparation_sha256 !== expected) fail('PREPARED_BINDING_INVALID', id);
  return deepFreeze(structuredClone(input));
}

function validatePilotFingerprint(input) {
  const id = assertCandidateId(input?.candidate_id);
  exactKeys(input, FINGERPRINT_KEYS, 'FINGERPRINT_RECORD_INVALID', id);
  if (input.version !== CONDITIONAL_FINGERPRINT_VERSION
    || !SHA256_PATTERN.test(input.content_sha256 || '')
    || !SHA256_PATTERN.test(input.preparation_sha256 || '')
    || !SHA256_PATTERN.test(input.source_orientation_sha256 || '')
    || !SHA256_PATTERN.test(input.yaw_canonical_sha256 || '')
    || !Array.isArray(input.yaw_sha256) || input.yaw_sha256.length !== 4
    || !Array.isArray(input.views) || input.views.length !== 4) {
    fail('FINGERPRINT_RECORD_INVALID', id);
  }
  const views = input.views.map((view, index) => validateView(view, index, id));
  const yawHashes = views.map((view) => view.structural_sha256);
  if (!sameArray(input.yaw_sha256, yawHashes)
    || input.source_orientation_sha256 !== yawHashes[0]
    || input.yaw_canonical_sha256 !== [...yawHashes].sort()[0]) {
    fail('FINGERPRINT_BINDING_INVALID', id);
  }
  if (input.synthetic_only !== false) fail('OPERATIONAL_FINGERPRINT_REQUIRED', id);
  if (input.authorizes_acquisition !== false || input.authorizes_training !== false
    || input.authorizes_dataset_admission !== false) {
    fail('FINGERPRINT_AUTHORITY_INVALID', id);
  }
  return deepFreeze(structuredClone(input));
}

function validateView(view, yaw, candidateId) {
  exactKeys(view, VIEW_KEYS, 'FINGERPRINT_VIEW_INVALID', candidateId);
  if (view.yaw !== yaw || !validDimension(view.extent, GRID)
    || !SHA256_PATTERN.test(view.structural_sha256 || '')
    || !validMinhash(view.occupancy_minhash)
    || !validMinhash(view.material_minhash)
    || !Array.isArray(view.lsh_buckets) || view.lsh_buckets.length !== 64
    || view.lsh_buckets.some((value) => !/^[om]:[a-f0-9]{16}$/u.test(value))) {
    fail('FINGERPRINT_VIEW_INVALID', candidateId);
  }
  return view;
}

async function preparedInventory(root, candidateId, deps) {
  const absoluteRoot = await assertPilotRoot(root, deps);
  const prepared = path.join(absoluteRoot, 'prepared');
  await assertDirectory(prepared, candidateId, deps);
  const directory = path.join(prepared, candidateId);
  let stat;
  try {
    stat = await (deps.lstat || fs.lstat)(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  if (stat.isSymbolicLink()) fail('PILOT_PATH_SYMLINK', candidateId);
  if (!stat.isDirectory()) fail('PREPARED_INVENTORY_INVALID', candidateId);
  const entries = await (deps.readdir || fs.readdir)(directory, { withFileTypes: true });
  if (entries.some((entry) => entry.isSymbolicLink() || !entry.isFile())) {
    fail('PREPARED_INVENTORY_INVALID', candidateId);
  }
  return entries.map((entry) => entry.name).sort();
}

async function assertDirectory(directory, candidateId, deps) {
  const stat = await (deps.lstat || fs.lstat)(directory);
  if (stat.isSymbolicLink()) fail('PILOT_PATH_SYMLINK', candidateId);
  if (!stat.isDirectory()) fail('PREPARED_INVENTORY_INVALID', candidateId);
}

function preparedIdentity(record) {
  return `${record.candidate_id}:${record.preparation_sha256}`;
}

function validDimension(value, maximum = Number.MAX_SAFE_INTEGER) {
  return value && ['x', 'y', 'z'].every((key) =>
    Number.isSafeInteger(value[key]) && value[key] > 0 && value[key] <= maximum)
    && Object.keys(value).length === 3;
}

function validOffset(value) {
  return value && ['x', 'y', 'z'].every((key) =>
    Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] < GRID)
    && Object.keys(value).length === 3;
}

function sameDimension(left, right) {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function validBounds(value) {
  return value && Object.keys(value).length === 3
    && validPoint(value.min) && validPoint(value.max) && validDimension(value.extent, GRID);
}

function validPoint(value) {
  return value && Object.keys(value).length === 3
    && ['x', 'y', 'z'].every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0);
}

function validCounts(value) {
  return Array.isArray(value) && value.length === 9
    && value.every((count) => Number.isSafeInteger(count) && count >= 0)
    && value.reduce((sum, count) => sum + count, 0) === VOXEL_COUNT;
}

function validProportions(value) {
  return Array.isArray(value) && value.length === 9
    && value.every((item) => Number.isFinite(item) && item >= 0 && item <= 1)
    && Math.abs(value.reduce((sum, item) => sum + item, 0) - 1) <= 1e-12;
}

function validMinhash(value) {
  return Array.isArray(value) && value.length === 128
    && value.every((item) => Number.isSafeInteger(item) && item >= 0 && item <= 0xffffffff);
}

function exactKeys(value, keys, code, candidateId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length
    || Object.keys(value).some((key) => !keys.includes(key))) {
    fail(code, candidateId);
  }
}

function sameArray(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => value === right[index]);
}

function rethrowFilesystem(error, candidateId) {
  if (error instanceof PilotFilesystemError) fail(error.code, candidateId);
  throw error;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function fail(code, candidateId, safeDetail = {}) {
  throw new PilotArtifactError(code, candidateId, safeDetail);
}
