import { createHash } from 'node:crypto';
import { CandidateReadinessError } from './stage7CandidateBoundary.js';

export const CONDITIONAL_FINGERPRINT_VERSION = 'stage7-conditional-fingerprint-v1';
const GRID = 64;
const SIGNATURE_LENGTH = 128;
const BAND_SIZE = 4;

export function fingerprintConditionalVolume(prepared) {
  assertPrepared(prepared);
  const source = tightEntries(prepared.voxels, prepared.record.candidate_id);
  const views = Object.freeze(Array.from({ length: 4 }, (_, yaw) => viewFingerprint(source, yaw)));
  const structural = views.map((view) => view.structural_sha256).sort();
  return deepFreeze({
    version: CONDITIONAL_FINGERPRINT_VERSION,
    candidate_id: prepared.record.candidate_id,
    content_sha256: prepared.record.content_sha256,
    preparation_sha256: prepared.record.preparation_sha256,
    source_orientation_sha256: views[0].structural_sha256,
    yaw_sha256: views.map((view) => view.structural_sha256),
    yaw_canonical_sha256: structural[0],
    views,
    synthetic_only: true,
    authorizes_acquisition: false,
    authorizes_training: false,
    authorizes_dataset_admission: false
  });
}

export function compareConditionalFingerprints(left, right) {
  assertFingerprint(left);
  assertFingerprint(right);
  let best = { occupancy: 0, material: 0, shared: false };
  for (const a of left.views) for (const b of right.views) {
    const occupancy = equalShare(a.occupancy_minhash, b.occupancy_minhash);
    const material = equalShare(a.material_minhash, b.material_minhash);
    const shared = a.lsh_buckets.some((value) => b.lsh_buckets.includes(value));
    if (occupancy + material > best.occupancy + best.material) {
      best = { occupancy, material, shared };
    }
  }
  const exactByteDuplicate = left.content_sha256 === right.content_sha256;
  const structuralEquivalent = left.yaw_sha256.some((value) => right.yaw_sha256.includes(value));
  const thresholdProposal = best.shared && best.occupancy >= 0.85 && best.material >= 0.75;
  return Object.freeze({
    exact_byte_duplicate: exactByteDuplicate,
    structural_equivalent: structuralEquivalent,
    occupancy_similarity: best.occupancy,
    material_similarity: best.material,
    shares_lsh_bucket: best.shared,
    near_duplicate_proposed: !exactByteDuplicate && (structuralEquivalent || thresholdProposal)
  });
}

function viewFingerprint(source, yaw) {
  const rotated = source.entries.map((entry) => rotate(entry, source.extent, yaw));
  const extent = yaw % 2 === 0
    ? source.extent
    : { x: source.extent.z, y: source.extent.y, z: source.extent.x };
  rotated.sort(compareEntry);
  const bytes = Buffer.alloc(3 + rotated.length * 4);
  bytes.set([extent.x, extent.y, extent.z], 0);
  rotated.forEach((entry, index) => bytes.set([entry.x, entry.y, entry.z, entry.token], 3 + index * 4));
  const occupancyKeys = rotated.map((entry) => pack(entry.x, entry.y, entry.z, 0));
  const materialKeys = rotated.map((entry) => pack(entry.x, entry.y, entry.z, entry.token));
  const occupancy = minhash(occupancyKeys);
  const material = minhash(materialKeys);
  return deepFreeze({
    yaw,
    extent,
    structural_sha256: createHash('sha256').update(bytes).digest('hex'),
    occupancy_minhash: occupancy,
    material_minhash: material,
    lsh_buckets: lshBuckets(occupancy, 'o').concat(lshBuckets(material, 'm'))
  });
}

function tightEntries(voxels, candidateId) {
  const entries = [];
  let minX = GRID, minY = GRID, minZ = GRID, maxX = -1, maxY = -1, maxZ = -1;
  for (let y = 0; y < GRID; y += 1) for (let z = 0; z < GRID; z += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const token = voxels[y * GRID * GRID + z * GRID + x];
      if (token === 0) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
      entries.push({ x, y, z, token });
    }
  }
  if (entries.length === 0) fail('FINGERPRINT_VOLUME_EMPTY', candidateId);
  return {
    extent: { x: maxX - minX + 1, y: maxY - minY + 1, z: maxZ - minZ + 1 },
    entries: entries.map((entry) => ({
      x: entry.x - minX, y: entry.y - minY, z: entry.z - minZ, token: entry.token
    }))
  };
}

function rotate(entry, extent, yaw) {
  if (yaw === 0) return { ...entry };
  if (yaw === 1) return { x: extent.z - 1 - entry.z, y: entry.y, z: entry.x, token: entry.token };
  if (yaw === 2) return { x: extent.x - 1 - entry.x, y: entry.y, z: extent.z - 1 - entry.z, token: entry.token };
  return { x: entry.z, y: entry.y, z: extent.x - 1 - entry.x, token: entry.token };
}

function minhash(keys) {
  const output = Array(SIGNATURE_LENGTH).fill(0xffffffff);
  for (const key of keys) for (let index = 0; index < SIGNATURE_LENGTH; index += 1) {
    const value = mix32((key ^ seed(index)) >>> 0);
    if (value < output[index]) output[index] = value;
  }
  return Object.freeze(output);
}

function lshBuckets(signature, prefix) {
  const output = [];
  for (let start = 0; start < signature.length; start += BAND_SIZE) {
    const bytes = Buffer.alloc(1 + BAND_SIZE * 4);
    bytes[0] = start / BAND_SIZE;
    for (let index = 0; index < BAND_SIZE; index += 1) {
      bytes.writeUInt32BE(signature[start + index] >>> 0, 1 + index * 4);
    }
    output.push(`${prefix}:${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}`);
  }
  return Object.freeze(output);
}

function seed(index) { return mix32((0x9e3779b9 * (index + 1)) >>> 0); }
function mix32(value) {
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}
function pack(x, y, z, token) { return (x | (y << 6) | (z << 12) | (token << 18)) >>> 0; }
function compareEntry(a, b) { return a.y - b.y || a.z - b.z || a.x - b.x || a.token - b.token; }
function equalShare(left, right) {
  return left.reduce((count, value, index) => count + (value === right[index] ? 1 : 0), 0) / left.length;
}
function assertPrepared(prepared) {
  if (!prepared || !Buffer.isBuffer(prepared.voxels) || prepared.voxels.length !== GRID ** 3
    || prepared.voxels.some((token) => token > 8)
    || !prepared.record || !/^[a-f0-9]{64}$/u.test(prepared.record.content_sha256 || '')) {
    fail('FINGERPRINT_INPUT_INVALID', prepared?.record?.candidate_id || 'synthetic');
  }
}
function assertFingerprint(value) {
  if (!value || value.version !== CONDITIONAL_FINGERPRINT_VERSION || !Array.isArray(value.views)
    || value.views.length !== 4) fail('FINGERPRINT_RECORD_INVALID', value?.candidate_id || 'synthetic');
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function fail(code, candidateId) {
  throw new CandidateReadinessError(code, 'fingerprint', candidateId);
}
