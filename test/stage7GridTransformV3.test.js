import test from 'node:test';
import assert from 'node:assert/strict';
import {
  targetIntervalForSource,
  sourceIntervalForTarget,
  buildStage7GridTransformV3
} from '../src/construction/learning/stage7GridTransformV3.js';

test('v3 target intervals exactly partition 0..63 for source axes at or below 64', () => {
  for (const length of [1, 17, 23, 64]) {
    const covered = [];
    for (let index = 0; index < length; index += 1) {
      const [start, end] = targetIntervalForSource(index, length);
      assert.ok(start >= 0 && end <= 63 && start <= end);
      for (let value = start; value <= end; value += 1) covered.push(value);
    }
    assert.deepEqual(covered, Array.from({ length: 64 }, (_, index) => index));
  }
});

test('v3 source intervals exactly partition axes above 64', () => {
  for (const length of [66, 128]) {
    const covered = [];
    for (let index = 0; index < 64; index += 1) {
      const [start, end] = sourceIntervalForTarget(index, length);
      assert.ok(start >= 0 && end < length && start <= end);
      for (let value = start; value <= end; value += 1) covered.push(value);
    }
    assert.deepEqual(covered, Array.from({ length }, (_, index) => index));
  }
});

test('v3 transform records occupied bounds, source size, ground, and reviewed front', () => {
  const transform = buildStage7GridTransformV3({
    volume: { width: 23, height: 16, length: 66 },
    occupiedBounds: { min_x: 2, min_y: 1, min_z: 3, max_x: 20, max_y: 14, max_z: 65 },
    frontSide: 'north'
  });
  assert.deepEqual(transform.resolution, [64, 64, 64]);
  assert.deepEqual(transform.source_size, [23, 16, 66]);
  assert.deepEqual(transform.occupied_size, [19, 14, 63]);
  assert.equal(transform.ground_y, 1);
  assert.equal(transform.front_side, 'north');
  assert.equal(transform.transform_version, 'stage7-interval-partition-v1');
});
