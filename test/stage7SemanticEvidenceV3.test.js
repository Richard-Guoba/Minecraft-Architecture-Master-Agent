import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStage7GridTransformV3 } from '../src/construction/learning/stage7GridTransformV3.js';
import {
  collectStage7SemanticEvidenceV3,
  chooseDominantEvidenceLabel
} from '../src/construction/learning/stage7SemanticEvidenceV3.js';
import {
  oneFloorHouseV3Fixture,
  axisLengthV3Fixture,
  siteSceneV3Fixture
} from './fixtures/stage7DatasetV3Fixtures.js';

function bounds(volume) {
  return {
    min_x: 0,
    min_y: 0,
    min_z: 0,
    max_x: volume.width - 1,
    max_y: volume.height - 1,
    max_z: volume.length - 1
  };
}

test('dense evidence expands a 17-cell source axis without target gaps', () => {
  const volume = axisLengthV3Fixture(17);
  const transform = buildStage7GridTransformV3({
    volume,
    occupiedBounds: bounds(volume),
    frontSide: 'south'
  });
  const result = collectStage7SemanticEvidenceV3({ volume, transform, caseId: 'axis-17' });
  const occupied = [...result.voxels.values()].filter((voxel) => voxel.occupancy > 0);
  assert.deepEqual(
    [...new Set(occupied.map((voxel) => voxel.x))],
    Array.from({ length: 64 }, (_, index) => index)
  );
});

test('dense evidence aggregates a 128-cell source axis into all 64 targets', () => {
  const volume = axisLengthV3Fixture(128);
  const transform = buildStage7GridTransformV3({
    volume,
    occupiedBounds: bounds(volume),
    frontSide: 'south'
  });
  const result = collectStage7SemanticEvidenceV3({ volume, transform, caseId: 'axis-128' });
  const occupied = [...result.voxels.values()].filter((voxel) => voxel.occupancy > 0);
  assert.deepEqual(
    [...new Set(occupied.map((voxel) => voxel.x))],
    Array.from({ length: 64 }, (_, index) => index)
  );
  assert.ok(occupied.every((voxel) => voxel.samples === 2));
});

test('geometry evidence distinguishes doors, roof stairs, and interior air', () => {
  const volume = oneFloorHouseV3Fixture({ roofStairs: true });
  const transform = buildStage7GridTransformV3({
    volume,
    occupiedBounds: bounds(volume),
    frontSide: 'south'
  });
  const result = collectStage7SemanticEvidenceV3({
    volume,
    transform,
    caseId: 'roof-stair-house'
  });
  const values = [...result.voxels.values()];
  assert.ok(values.some((voxel) => voxel.flags.includes('opening-candidate')));
  assert.ok(values.some((voxel) => (
    voxel.flags.includes('stair-candidate') && voxel.flags.includes('exterior-above')
  )));
  assert.ok(values.some((voxel) => voxel.flags.includes('interior-air')));
  assert.ok(result.sourceSampleCount > 0);
});

test('site evidence distinguishes ground, path, water, and vegetation', () => {
  const volume = siteSceneV3Fixture();
  const transform = buildStage7GridTransformV3({
    volume,
    occupiedBounds: bounds(volume),
    frontSide: 'south'
  });
  const values = [...collectStage7SemanticEvidenceV3({
    volume,
    transform,
    caseId: 'site-scene'
  }).voxels.values()];
  for (const flag of ['ground', 'path', 'water', 'vegetation']) {
    assert.ok(values.some((voxel) => voxel.flags.includes(flag)), `missing ${flag}`);
  }
});

test('evidence voting uses volume first and the declared canonical order only for ties', () => {
  assert.equal(
    chooseDominantEvidenceLabel({ water: 1, path: 2 }, ['water', 'path', 'none']),
    'path'
  );
  assert.equal(
    chooseDominantEvidenceLabel({ water: 1, path: 1 }, ['water', 'path', 'none']),
    'water'
  );
  assert.equal(chooseDominantEvidenceLabel({}, ['water', 'path', 'none']), 'none');
});
