import { createHash } from 'node:crypto';
import { TrainingDataError, assertSourceId } from './trainingError.js';
import { mapTrainingToken } from './tokenTaxonomy.js';

export const WHOLE_SIZE = 64;
export const PATCH_SIZE = 32;
export const PATCH_STRIDE = 16;
export const PREPARATION_VERSION = 'training-voxel-preparation-v1';

export function axisOrigins(
  extent,
  size = PATCH_SIZE,
  stride = PATCH_STRIDE
) {
  for (const [name, value] of Object.entries({ extent, size, stride })) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TrainingDataError(
        'PREPARATION_GEOMETRY_INVALID',
        `${name}=${value}`
      );
    }
  }
  if (extent <= size) return [0];
  const values = [];
  for (let value = 0; value + size < extent; value += stride) {
    values.push(value);
  }
  values.push(extent - size);
  return [...new Set(values)].sort((left, right) => left - right);
}

export function prepareTrainingVolume({ source, volume } = {}) {
  const input = validateInput(source, volume);
  const tight = rasterizeTightVolume(input, volume);
  const whole = prepareWhole(source, tight);
  const xOrigins = axisOrigins(tight.extent.x);
  const yOrigins = axisOrigins(tight.extent.y);
  const zOrigins = axisOrigins(tight.extent.z);
  const patches = [];
  let emptyPatchCount = 0;

  for (const y of yOrigins) {
    for (const z of zOrigins) {
      for (const x of xOrigins) {
        const voxels = extractPatch(tight, { x, y, z });
        const tokenCounts = countTokens(voxels);
        const nonAirCount = voxels.length - tokenCounts[0];
        if (nonAirCount === 0) {
          emptyPatchCount += 1;
          continue;
        }
        const origin = { x, y, z };
        patches.push(deepFreeze({
          sample_id: sampleId(source, 'patch', origin, PATCH_SIZE),
          source_id: source.source_id,
          preparation_version: PREPARATION_VERSION,
          origin,
          shape: [PATCH_SIZE, PATCH_SIZE, PATCH_SIZE],
          token_counts: tokenCounts,
          non_air_count: nonAirCount,
          voxels
        }));
      }
    }
  }

  if (patches.length === 0) {
    throw new TrainingDataError(
      'PREPARATION_EMPTY',
      source.source_id
    );
  }

  return deepFreeze({
    whole,
    patches,
    report: {
      source_id: source.source_id,
      preparation_version: PREPARATION_VERSION,
      extent: tight.extent,
      non_air_count: tight.nonAirCount,
      whole_included: whole !== null,
      patch_candidate_count: (
        xOrigins.length * yOrigins.length * zOrigins.length
      ),
      patch_count: patches.length,
      empty_patch_count: emptyPatchCount
    }
  });
}

function validateInput(source, volume) {
  if (!source || typeof source !== 'object') {
    throw new TrainingDataError('PREPARATION_SOURCE_INVALID', 'missing source');
  }
  assertSourceId(source.source_id);
  if (!/^[a-f0-9]{64}$/u.test(source.content_sha256 || '')) {
    throw new TrainingDataError(
      'CONTENT_HASH_INVALID',
      source.source_id
    );
  }
  if (
    !volume
    || typeof volume.blockAt !== 'function'
    || !positiveInteger(volume.width)
    || !positiveInteger(volume.height)
    || !positiveInteger(volume.length)
    || volume.block_count !== volume.width * volume.height * volume.length
  ) {
    throw new TrainingDataError(
      'PREPARATION_VOLUME_INVALID',
      source.source_id
    );
  }

  const bounds = source.occupied_bounds;
  const axes = ['x', 'y', 'z'];
  if (
    !bounds
    || axes.some((axis) => (
      !nonNegativeInteger(bounds.min?.[axis])
      || !nonNegativeInteger(bounds.max?.[axis])
      || !positiveInteger(bounds.extent?.[axis])
      || bounds.max[axis] - bounds.min[axis] + 1 !== bounds.extent[axis]
    ))
    || bounds.max.x >= volume.width
    || bounds.max.y >= volume.height
    || bounds.max.z >= volume.length
  ) {
    throw new TrainingDataError(
      'PREPARATION_BOUNDS_INVALID',
      source.source_id
    );
  }
  return bounds;
}

function rasterizeTightVolume(bounds, volume) {
  const extent = { ...bounds.extent };
  const voxels = Buffer.alloc(extent.x * extent.y * extent.z);
  let nonAirCount = 0;
  for (let y = 0; y < extent.y; y += 1) {
    for (let z = 0; z < extent.z; z += 1) {
      for (let x = 0; x < extent.x; x += 1) {
        const token = mapTrainingToken(volume.blockAt(
          bounds.min.x + x,
          bounds.min.y + y,
          bounds.min.z + z
        ));
        voxels[indexOf(x, y, z, extent.x, extent.z)] = token;
        if (token !== 0) nonAirCount += 1;
      }
    }
  }
  if (nonAirCount === 0) {
    throw new TrainingDataError('PREPARATION_EMPTY', 'no non-air voxels');
  }
  return { extent, voxels, nonAirCount };
}

function prepareWhole(source, tight) {
  if (
    tight.extent.x > WHOLE_SIZE
    || tight.extent.y > WHOLE_SIZE
    || tight.extent.z > WHOLE_SIZE
  ) {
    return null;
  }
  const translationOffset = {
    x: Math.floor((WHOLE_SIZE - tight.extent.x) / 2),
    y: Math.floor((WHOLE_SIZE - tight.extent.y) / 2),
    z: Math.floor((WHOLE_SIZE - tight.extent.z) / 2)
  };
  const voxels = Buffer.alloc(WHOLE_SIZE ** 3);
  copyBox({
    source: tight.voxels,
    sourceWidth: tight.extent.x,
    sourceLength: tight.extent.z,
    sourceExtent: tight.extent,
    target: voxels,
    targetWidth: WHOLE_SIZE,
    targetLength: WHOLE_SIZE,
    targetOffset: translationOffset
  });
  return deepFreeze({
    sample_id: sampleId(
      source,
      'whole',
      translationOffset,
      WHOLE_SIZE
    ),
    source_id: source.source_id,
    preparation_version: PREPARATION_VERSION,
    translation_offset: translationOffset,
    shape: [WHOLE_SIZE, WHOLE_SIZE, WHOLE_SIZE],
    token_counts: countTokens(voxels),
    non_air_count: tight.nonAirCount,
    voxels
  });
}

function extractPatch(tight, origin) {
  const voxels = Buffer.alloc(PATCH_SIZE ** 3);
  const copyExtent = {
    x: Math.min(PATCH_SIZE, tight.extent.x - origin.x),
    y: Math.min(PATCH_SIZE, tight.extent.y - origin.y),
    z: Math.min(PATCH_SIZE, tight.extent.z - origin.z)
  };
  copyBox({
    source: tight.voxels,
    sourceWidth: tight.extent.x,
    sourceLength: tight.extent.z,
    sourceOffset: origin,
    sourceExtent: copyExtent,
    target: voxels,
    targetWidth: PATCH_SIZE,
    targetLength: PATCH_SIZE,
    targetOffset: { x: 0, y: 0, z: 0 }
  });
  return voxels;
}

function copyBox({
  source,
  sourceWidth,
  sourceLength,
  sourceOffset = { x: 0, y: 0, z: 0 },
  sourceExtent,
  target,
  targetWidth,
  targetLength,
  targetOffset
}) {
  for (let y = 0; y < sourceExtent.y; y += 1) {
    for (let z = 0; z < sourceExtent.z; z += 1) {
      const sourceStart = indexOf(
        sourceOffset.x,
        sourceOffset.y + y,
        sourceOffset.z + z,
        sourceWidth,
        sourceLength
      );
      const targetStart = indexOf(
        targetOffset.x,
        targetOffset.y + y,
        targetOffset.z + z,
        targetWidth,
        targetLength
      );
      source.copy(
        target,
        targetStart,
        sourceStart,
        sourceStart + sourceExtent.x
      );
    }
  }
}

function countTokens(voxels) {
  const counts = Array(9).fill(0);
  for (const token of voxels) {
    if (token > 8) {
      throw new TrainingDataError(
        'PREPARATION_TOKEN_INVALID',
        String(token)
      );
    }
    counts[token] += 1;
  }
  return counts;
}

function sampleId(source, kind, origin, size) {
  const digest = createHash('sha256')
    .update(JSON.stringify({
      content_sha256: source.content_sha256,
      kind,
      origin,
      preparation_version: PREPARATION_VERSION,
      shape: [size, size, size],
      source_id: source.source_id
    }))
    .digest('hex');
  return `${kind}-${digest.slice(0, 24)}`;
}

function indexOf(x, y, z, width, length) {
  return y * width * length + z * width + x;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function deepFreeze(value) {
  if (
    value
    && typeof value === 'object'
    && !Buffer.isBuffer(value)
    && !Object.isFrozen(value)
  ) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
