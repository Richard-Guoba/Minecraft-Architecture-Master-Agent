import { createHash } from 'node:crypto';
import { TrainingDataError, assertSourceId } from './trainingError.js';

export const STRUCTURAL_FINGERPRINT_VERSION = 'categorical-structural-fingerprint-v1';

const SIGNATURE_LENGTH = 128;
const BAND_SIZE = 4;
const UINT16_MAX = 0xffff;

export function fingerprintCategoricalEntries({
  sourceId,
  contentSha256,
  extent,
  entries
}) {
  const id = assertSourceId(sourceId);
  if (!/^[a-f0-9]{64}$/u.test(contentSha256 || '')) {
    fail('FINGERPRINT_CONTENT_HASH_INVALID', id);
  }
  const normalizedExtent = validateExtent(extent, id);
  const normalizedEntries = validateEntries(entries, normalizedExtent, id);
  const views = Object.freeze(
    Array.from(
      { length: 4 },
      (_, yaw) => viewFingerprint(normalizedEntries, normalizedExtent, yaw)
    )
  );
  const structural = views.map((view) => view.structural_sha256).sort();
  return deepFreeze({
    version: STRUCTURAL_FINGERPRINT_VERSION,
    source_id: id,
    raw_content_sha256: contentSha256,
    content_sha256: contentSha256,
    source_orientation_sha256: views[0].structural_sha256,
    yaw_sha256: views.map((view) => view.structural_sha256),
    canonical_structure_sha256: structural[0],
    yaw_canonical_sha256: structural[0],
    views
  });
}

export function compareFingerprints(left, right) {
  assertFingerprint(left);
  assertFingerprint(right);
  let best = { occupancy: 0, material: 0, shared: false };
  for (const a of left.views) {
    for (const b of right.views) {
      const occupancy = equalShare(
        a.occupancy_minhash,
        b.occupancy_minhash
      );
      const material = equalShare(a.material_minhash, b.material_minhash);
      const shared = a.lsh_buckets.some(
        (value) => b.lsh_buckets.includes(value)
      );
      if (occupancy + material > best.occupancy + best.material) {
        best = { occupancy, material, shared };
      }
    }
  }
  const exactByteDuplicate = left.content_sha256 === right.content_sha256;
  const structuralEquivalent = left.yaw_sha256.some(
    (value) => right.yaw_sha256.includes(value)
  );
  const thresholdProposal = best.shared
    && best.occupancy >= 0.85
    && best.material >= 0.75;
  return Object.freeze({
    exact_byte_duplicate: exactByteDuplicate,
    structural_equivalent: structuralEquivalent,
    occupancy_similarity: best.occupancy,
    material_similarity: best.material,
    shares_lsh_bucket: best.shared,
    near_duplicate_proposed: !exactByteDuplicate
      && (structuralEquivalent || thresholdProposal)
  });
}

function validateExtent(extent, sourceId) {
  if (
    !extent
    || !['x', 'y', 'z'].every(
      (axis) => Number.isInteger(extent[axis])
        && extent[axis] > 0
        && extent[axis] <= UINT16_MAX
    )
  ) {
    fail('FINGERPRINT_EXTENT_INVALID', sourceId);
  }
  return Object.freeze({ x: extent.x, y: extent.y, z: extent.z });
}

function validateEntries(entries, extent, sourceId) {
  if (!Array.isArray(entries) || entries.length === 0) {
    fail('FINGERPRINT_VOLUME_EMPTY', sourceId);
  }
  const seen = new Set();
  const normalized = entries.map((entry) => {
    if (
      !entry
      || !Number.isInteger(entry.x)
      || !Number.isInteger(entry.y)
      || !Number.isInteger(entry.z)
      || !Number.isInteger(entry.token)
      || entry.x < 0
      || entry.y < 0
      || entry.z < 0
      || entry.x >= extent.x
      || entry.y >= extent.y
      || entry.z >= extent.z
      || entry.token < 1
      || entry.token > 8
    ) {
      fail('FINGERPRINT_ENTRY_INVALID', sourceId);
    }
    const key = `${entry.x},${entry.y},${entry.z}`;
    if (seen.has(key)) fail('FINGERPRINT_ENTRY_DUPLICATE', sourceId);
    seen.add(key);
    return Object.freeze({
      x: entry.x,
      y: entry.y,
      z: entry.z,
      token: entry.token
    });
  });
  return Object.freeze(normalized.sort(compareEntry));
}

function viewFingerprint(sourceEntries, sourceExtent, yaw) {
  const rotated = sourceEntries
    .map((entry) => rotate(entry, sourceExtent, yaw))
    .sort(compareEntry);
  const extent = yaw % 2 === 0
    ? sourceExtent
    : Object.freeze({
      x: sourceExtent.z,
      y: sourceExtent.y,
      z: sourceExtent.x
    });
  const bytes = Buffer.alloc(6 + rotated.length * 7);
  writeCoordinate(bytes, 0, extent.x);
  writeCoordinate(bytes, 2, extent.y);
  writeCoordinate(bytes, 4, extent.z);
  rotated.forEach((entry, index) => {
    const offset = 6 + index * 7;
    writeCoordinate(bytes, offset, entry.x);
    writeCoordinate(bytes, offset + 2, entry.y);
    writeCoordinate(bytes, offset + 4, entry.z);
    bytes[offset + 6] = entry.token;
  });
  const occupancyKeys = rotated.map(
    (entry) => coordinateKey(entry.x, entry.y, entry.z, 0)
  );
  const materialKeys = rotated.map(
    (entry) => coordinateKey(entry.x, entry.y, entry.z, entry.token)
  );
  const occupancy = minhash(occupancyKeys);
  const material = minhash(materialKeys);
  return deepFreeze({
    yaw,
    extent,
    structural_sha256: createHash('sha256').update(bytes).digest('hex'),
    occupancy_minhash: occupancy,
    material_minhash: material,
    lsh_buckets: lshBuckets(occupancy, 'o')
      .concat(lshBuckets(material, 'm'))
  });
}

function writeCoordinate(buffer, offset, value) {
  buffer.writeUInt16BE(value, offset);
}

function rotate(entry, extent, yaw) {
  if (yaw === 0) return { ...entry };
  if (yaw === 1) {
    return {
      x: extent.z - 1 - entry.z,
      y: entry.y,
      z: entry.x,
      token: entry.token
    };
  }
  if (yaw === 2) {
    return {
      x: extent.x - 1 - entry.x,
      y: entry.y,
      z: extent.z - 1 - entry.z,
      token: entry.token
    };
  }
  return {
    x: entry.z,
    y: entry.y,
    z: extent.x - 1 - entry.x,
    token: entry.token
  };
}

function coordinateKey(x, y, z, token) {
  let value = Math.imul(x + 1, 0x9e3779b1);
  value ^= Math.imul(y + 1, 0x85ebca77);
  value ^= Math.imul(z + 1, 0xc2b2ae3d);
  value ^= Math.imul(token + 1, 0x27d4eb2f);
  return mix32(value >>> 0);
}

function minhash(keys) {
  const output = Array(SIGNATURE_LENGTH).fill(0xffffffff);
  for (const key of keys) {
    for (let index = 0; index < SIGNATURE_LENGTH; index += 1) {
      const value = mix32((key ^ seed(index)) >>> 0);
      if (value < output[index]) output[index] = value;
    }
  }
  return Object.freeze(output);
}

function lshBuckets(signature, prefix) {
  const output = [];
  for (let start = 0; start < signature.length; start += BAND_SIZE) {
    const bytes = Buffer.alloc(1 + BAND_SIZE * 4);
    bytes[0] = start / BAND_SIZE;
    for (let index = 0; index < BAND_SIZE; index += 1) {
      bytes.writeUInt32BE(
        signature[start + index] >>> 0,
        1 + index * 4
      );
    }
    output.push(
      `${prefix}:${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}`
    );
  }
  return Object.freeze(output);
}

function seed(index) {
  return mix32((0x9e3779b9 * (index + 1)) >>> 0);
}

function mix32(value) {
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function compareEntry(left, right) {
  return left.y - right.y
    || left.z - right.z
    || left.x - right.x
    || left.token - right.token;
}

function equalShare(left, right) {
  return left.reduce(
    (count, value, index) => count + (value === right[index] ? 1 : 0),
    0
  ) / left.length;
}

function assertFingerprint(value) {
  if (
    !value
    || value.version !== STRUCTURAL_FINGERPRINT_VERSION
    || !Array.isArray(value.views)
    || value.views.length !== 4
  ) {
    fail('FINGERPRINT_RECORD_INVALID', value?.source_id || 'source');
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function fail(code, sourceId, metadata = {}) {
  throw new TrainingDataError(code, `fingerprint:${sourceId}`, {
    stage: 'fingerprint',
    source_id: sourceId,
    ...metadata
  });
}
