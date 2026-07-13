export const STAGE7_V3_GRID_SIZE = 64;
export const STAGE7_V3_TRANSFORM_VERSION = 'stage7-interval-partition-v1';

export function targetIntervalForSource(index, length) {
  assertCoordinate(index, length, 'source');
  if (length > STAGE7_V3_GRID_SIZE) {
    const target = Math.min(
      STAGE7_V3_GRID_SIZE - 1,
      Math.floor(index * STAGE7_V3_GRID_SIZE / length)
    );
    return [target, target];
  }
  return [
    Math.floor(index * STAGE7_V3_GRID_SIZE / length),
    Math.floor((index + 1) * STAGE7_V3_GRID_SIZE / length) - 1
  ];
}

export function sourceIntervalForTarget(index, length) {
  if (!Number.isInteger(index) || index < 0 || index >= STAGE7_V3_GRID_SIZE) {
    throw new Error('target index must be an integer in [0,63]');
  }
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('axis length must be a positive integer');
  }
  if (length <= STAGE7_V3_GRID_SIZE) {
    const source = Math.min(length - 1, Math.floor(index * length / STAGE7_V3_GRID_SIZE));
    return [source, source];
  }
  return [
    Math.floor(index * length / STAGE7_V3_GRID_SIZE),
    Math.floor((index + 1) * length / STAGE7_V3_GRID_SIZE) - 1
  ];
}

export function buildStage7GridTransformV3({ volume, occupiedBounds, frontSide } = {}) {
  if (!volume || ![volume.width, volume.height, volume.length]
    .every((value) => Number.isInteger(value) && value > 0)) {
    throw new Error('v3 transform requires positive source dimensions');
  }
  const bounds = normalizeBounds(occupiedBounds);
  if (!['north', 'south', 'east', 'west'].includes(frontSide)) {
    throw new Error('v3 transform requires a reviewed canonical front side');
  }
  return {
    resolution: [64, 64, 64],
    source_size: [volume.width, volume.height, volume.length],
    occupied_size: [
      bounds.max_x - bounds.min_x + 1,
      bounds.max_y - bounds.min_y + 1,
      bounds.max_z - bounds.min_z + 1
    ],
    ground_y: bounds.min_y,
    front_side: frontSide,
    vertical_axis: 'y-up',
    transform_version: STAGE7_V3_TRANSFORM_VERSION,
    occupied_bounds: bounds
  };
}

function assertCoordinate(index, length, label) {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('axis length must be a positive integer');
  }
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new Error(`${label} index must be inside its axis`);
  }
}

function normalizeBounds(value = {}) {
  const result = {};
  for (const field of ['min_x', 'min_y', 'min_z', 'max_x', 'max_y', 'max_z']) {
    if (!Number.isInteger(value[field])) throw new Error(`occupied bounds require ${field}`);
    result[field] = value[field];
  }
  if (result.min_x > result.max_x || result.min_y > result.max_y || result.min_z > result.max_z) {
    throw new Error('occupied bounds are inverted');
  }
  return result;
}
