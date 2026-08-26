import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PATCH_SIZE,
  PATCH_STRIDE,
  PREPARATION_VERSION,
  WHOLE_SIZE,
  axisOrigins,
  prepareTrainingVolume
} from '../src/training/volumePreparation.js';

test('axis origins use the stride and always include the far boundary', () => {
  assert.deepEqual(axisOrigins(20), [0]);
  assert.deepEqual(axisOrigins(64), [0, 16, 32]);
  assert.deepEqual(axisOrigins(80), [0, 16, 32, 48]);
  assert.deepEqual(axisOrigins(81), [0, 16, 32, 48, 49]);
});

test('a small source produces a centered whole volume and one padded patch', () => {
  const fixture = syntheticFixture({ x: 20, y: 10, z: 20 });
  const result = prepareTrainingVolume(fixture);

  assert.equal(WHOLE_SIZE, 64);
  assert.equal(PATCH_SIZE, 32);
  assert.equal(PATCH_STRIDE, 16);
  assert.equal(PREPARATION_VERSION, 'training-voxel-preparation-v1');
  assert.deepEqual(result.whole.shape, [64, 64, 64]);
  assert.deepEqual(result.whole.translation_offset, { x: 22, y: 27, z: 22 });
  assert.equal(result.whole.voxels.length, 64 ** 3);
  assert.equal(result.whole.non_air_count, fixture.nonAirCount);
  assert.equal(result.patches.length, 1);
  assert.deepEqual(result.patches[0].shape, [32, 32, 32]);
  assert.deepEqual(result.patches[0].origin, { x: 0, y: 0, z: 0 });
  assert.equal(result.patches[0].non_air_count, fixture.nonAirCount);
});

test('an exact 64-cube remains eligible for a whole sample', () => {
  const result = prepareTrainingVolume(
    syntheticFixture({ x: 64, y: 64, z: 64 })
  );

  assert.deepEqual(result.whole.shape, [64, 64, 64]);
  assert.deepEqual(result.whole.translation_offset, { x: 0, y: 0, z: 0 });
  assert.equal(result.whole.non_air_count, 8);
  assert.equal(result.patches.length, 8);
});

test('an oversized source skips whole preparation and patches cover every occupied voxel', () => {
  const fixture = syntheticFixture({ x: 80, y: 40, z: 80 });
  const first = prepareTrainingVolume(fixture);
  const second = prepareTrainingVolume(fixture);

  assert.equal(first.whole, null);
  assert.ok(first.patches.length > 0);
  assert.ok(first.patches.every((patch) => (
    patch.shape.join(',') === '32,32,32'
    && patch.voxels.length === 32 ** 3
    && patch.non_air_count > 0
  )));
  assert.equal(
    new Set(first.patches.map((patch) => patch.sample_id)).size,
    first.patches.length
  );
  assert.deepEqual(
    first.patches.map((patch) => patch.sample_id),
    second.patches.map((patch) => patch.sample_id)
  );

  for (const occupied of fixture.occupied) {
    assert.ok(
      first.patches.some((patch) => contains(patch, occupied)),
      `uncovered voxel ${JSON.stringify(occupied)}`
    );
  }
  assert.ok(first.patches.some((patch) => patch.origin.x === 48));
  assert.ok(first.patches.some((patch) => patch.origin.y === 8));
  assert.ok(first.patches.some((patch) => patch.origin.z === 48));
});

function syntheticFixture(extent) {
  const occupied = [
    { x: 0, y: 0, z: 0 },
    { x: extent.x - 1, y: 0, z: 0 },
    { x: 0, y: extent.y - 1, z: 0 },
    { x: 0, y: 0, z: extent.z - 1 },
    { x: extent.x - 1, y: extent.y - 1, z: 0 },
    { x: extent.x - 1, y: 0, z: extent.z - 1 },
    { x: 0, y: extent.y - 1, z: extent.z - 1 },
    { x: extent.x - 1, y: extent.y - 1, z: extent.z - 1 }
  ];
  const occupiedKeys = new Set(
    occupied.map(({ x, y, z }) => `${x},${y},${z}`)
  );
  const volume = {
    width: extent.x,
    height: extent.y,
    length: extent.z,
    block_count: extent.x * extent.y * extent.z,
    blockAt(x, y, z) {
      return occupiedKeys.has(`${x},${y},${z}`)
        ? { air: false, category: 'rock' }
        : { air: true, category: 'air' };
    }
  };
  return {
    source: {
      source_id: 'source-0123456789abcdef',
      content_sha256: 'a'.repeat(64),
      occupied_bounds: {
        min: { x: 0, y: 0, z: 0 },
        max: {
          x: extent.x - 1,
          y: extent.y - 1,
          z: extent.z - 1
        },
        extent
      }
    },
    volume,
    occupied,
    nonAirCount: occupied.length
  };
}

function contains(patch, point) {
  return (
    point.x >= patch.origin.x
    && point.x < patch.origin.x + PATCH_SIZE
    && point.y >= patch.origin.y
    && point.y < patch.origin.y + PATCH_SIZE
    && point.z >= patch.origin.z
    && point.z < patch.origin.z + PATCH_SIZE
  );
}
