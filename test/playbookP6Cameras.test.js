import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveFixedViewManifest,
  deriveSharedFraming,
  decimal6
} from '../src/playbook/p6/cameras.js';
import { P6_VIEW_IDS } from '../src/playbook/p6/constants.js';
import { validateCameraManifest } from '../src/playbook/p6/contracts.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const ASYMMETRIC_BOUNDS = {
  minX: 0, minY: 4, minZ: 10,
  maxX: 20, maxY: 19, maxZ: 34
};
const SOUTH_ENTRY = { x: 10, y: 5, z: 34, facing: 'south' };

test('derives the approved six cameras from inclusive asymmetric bounds', () => {
  const manifest = deriveFixedViewManifest({
    solutionId: 'playbook-candidate-01',
    blueprintSha256: HASH_A,
    buildFunctionSha256: HASH_B,
    bounds: ASYMMETRIC_BOUNDS,
    mainEntry: SOUTH_ENTRY,
    sharedFraming: null
  });

  assert.deepEqual(manifest.views.map(view => view.view_id), P6_VIEW_IDS);
  assert.deepEqual(manifest.views.map(view => view.framing_multiplier), Array(6).fill('1.000000'));
  assert.deepEqual(manifest.views.map(view => view.position), [
    { x: '10.000000', y: '11.200000', z: '67.750000' },
    { x: '53.750000', y: '11.200000', z: '22.000000' },
    { x: '43.750000', y: '12.800000', z: '57.750000' },
    { x: '-23.750000', y: '12.800000', z: '57.750000' },
    { x: '10.000000', y: '56.500000', z: '22.000000' },
    { x: '10.000000', y: '6.620000', z: '42.000000' }
  ]);
  assert.deepEqual(manifest.views.map(view => view.target), [
    { x: '10.000000', y: '11.200000', z: '22.000000' },
    { x: '10.000000', y: '11.200000', z: '22.000000' },
    { x: '10.000000', y: '11.500000', z: '22.000000' },
    { x: '10.000000', y: '11.500000', z: '22.000000' },
    { x: '10.000000', y: '11.500000', z: '22.000000' },
    { x: '10.000000', y: '5.000000', z: '34.000000' }
  ]);
  assert.equal(manifest.main_entry.facing, 'south');
  assert.equal(manifest.views.at(-1).entry_offset_blocks, 8);
  assert.equal(manifest.views.every(view => view.horizontal_fov_degrees === 70), true);
  assert.doesNotThrow(() => validateCameraManifest(manifest));
});

test('decimal6 rejects non-finite camera coordinates', () => {
  assert.equal(decimal6(-0), '0.000000');
  assert.equal(decimal6(1 / 3), '0.333333');
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => decimal6(value), { code: 'P6_CAMERA_PROTOCOL_INVALID' });
  }
});

test('entry camera accepts a proven south door inside site-expanded scene bounds', () => {
  const manifest = deriveFixedViewManifest({
    solutionId: 'baseline-current', blueprintSha256: HASH_A, buildFunctionSha256: HASH_B,
    bounds: ASYMMETRIC_BOUNDS,
    mainEntry: { x: 10.5, y: 5.5, z: 18, facing: 'south' },
    sharedFraming: null
  });
  assert.equal(manifest.main_entry.center_z, '18.000000');
  assert.equal(manifest.views.at(-1).position.z, '26.000000');
});

test('shared perspective framing applies one multiplier per view to every solution', () => {
  const solutions = [
    solution('playbook-candidate-01', ASYMMETRIC_BOUNDS),
    solution('playbook-candidate-02', { minX: -4, minY: 0, minZ: 2, maxX: 8, maxY: 50, maxZ: 18 }),
    solution('playbook-candidate-03', { minX: 2, minY: 3, minZ: -8, maxX: 26, maxY: 17, maxZ: 6 }),
    solution('baseline-current', { minX: -20, minY: 1, minZ: 0, maxX: 4, maxY: 12, maxZ: 10 })
  ];
  const shared = deriveSharedFraming({ solutions });
  assert.deepEqual(Object.keys(shared.view_multipliers), P6_VIEW_IDS);
  assert.ok(Number(shared.view_multipliers['entry-eye']) > 1, 'oversized cohort expands entry-eye southward');
  assert.ok(Number(shared.view_multipliers['front-south']) > 1, 'tall cohort member needs a shared expansion');

  const manifests = solutions.map(item => deriveFixedViewManifest({
    solutionId: item.solution_id,
    blueprintSha256: HASH_A,
    buildFunctionSha256: HASH_B,
    bounds: item.bounds,
    mainEntry: item.main_entry,
    sharedFraming: shared
  }));
  for (const viewIndex of [0, 1, 2, 3, 4]) {
    const multiplier = Number(shared.view_multipliers[P6_VIEW_IDS[viewIndex]]);
    for (const [index, manifest] of manifests.entries()) {
      const base = deriveFixedViewManifest({
        solutionId: solutions[index].solution_id,
        blueprintSha256: HASH_A,
        buildFunctionSha256: HASH_B,
        bounds: solutions[index].bounds,
        mainEntry: solutions[index].main_entry,
        sharedFraming: null
      });
      assert.ok(Math.abs(
        distance(manifest.views[viewIndex]) - distance(base.views[viewIndex]) * multiplier
      ) < 0.00002, `view ${P6_VIEW_IDS[viewIndex]} uses the cohort multiplier`);
    }
  }
  for (const [index, manifest] of manifests.entries()) {
    const entryView = manifest.views.at(-1);
    assert.equal(entryView.framing_multiplier, shared.view_multipliers['entry-eye']);
    assert.equal(entryView.position.y, decimal6(solutions[index].main_entry.y + 1.62));
    assert.equal(
      entryView.position.z,
      decimal6(solutions[index].main_entry.z + 8 * Number(shared.view_multipliers['entry-eye']))
    );
    for (const view of manifest.views) assertAllCornersFit(view, solutions[index].bounds);
  }
});

test('camera derivation rejects empty cohorts and invalid geometry or entry semantics', () => {
  assert.throws(() => deriveSharedFraming({ solutions: [] }), { code: 'P6_CAMERA_PROTOCOL_INVALID' });
  assert.throws(() => deriveSharedFraming({ solutions: [
    solution('playbook-candidate-01', ASYMMETRIC_BOUNDS),
    solution('playbook-candidate-01', ASYMMETRIC_BOUNDS),
    solution('playbook-candidate-03', ASYMMETRIC_BOUNDS),
    solution('baseline-current', ASYMMETRIC_BOUNDS)
  ] }), { code: 'P6_CAMERA_PROTOCOL_INVALID' });
  assert.throws(() => deriveSharedFraming({ solutions: [solution('playbook-candidate-01', { ...ASYMMETRIC_BOUNDS, maxX: -1 })] }), { code: 'P6_CAMERA_PROTOCOL_INVALID' });
  assert.throws(() => deriveFixedViewManifest({
    solutionId: 'playbook-candidate-01', blueprintSha256: HASH_A,
    bounds: ASYMMETRIC_BOUNDS, mainEntry: { ...SOUTH_ENTRY, facing: 'north' }
  }), { code: 'P6_CAMERA_PROTOCOL_INVALID' });
  assert.throws(() => deriveFixedViewManifest({
    solutionId: 'playbook-candidate-01', blueprintSha256: HASH_A,
    bounds: ASYMMETRIC_BOUNDS, mainEntry: { ...SOUTH_ENTRY, z: 33 }
  }), { code: 'P6_CAMERA_PROTOCOL_INVALID' });
  assert.throws(() => deriveFixedViewManifest({
    solutionId: 'candidate-best', blueprintSha256: HASH_A,
    bounds: ASYMMETRIC_BOUNDS, mainEntry: SOUTH_ENTRY
  }), { code: 'P6_CAMERA_PROTOCOL_INVALID' });
  assert.throws(() => deriveFixedViewManifest({
    solutionId: 'playbook-candidate-01', blueprintSha256: HASH_A,
    bounds: ASYMMETRIC_BOUNDS, mainEntry: SOUTH_ENTRY
  }), { code: 'P6_CAMERA_PROTOCOL_INVALID' });
  assert.throws(() => deriveFixedViewManifest({
    solutionId: 'playbook-candidate-01', blueprintSha256: HASH_A,
    buildFunctionSha256: Symbol('build'), bounds: ASYMMETRIC_BOUNDS, mainEntry: SOUTH_ENTRY
  }), error => error?.code === 'P6_CAMERA_PROTOCOL_INVALID' && error?.name === 'P6ContractError');
  for (const buildFunctionSha256 of [123, '', 'A'.repeat(64), 'b'.repeat(63)]) {
    assert.throws(() => deriveFixedViewManifest({
      solutionId: 'playbook-candidate-01', blueprintSha256: HASH_A,
      buildFunctionSha256, bounds: ASYMMETRIC_BOUNDS, mainEntry: SOUTH_ENTRY
    }), { code: 'P6_CAMERA_PROTOCOL_INVALID' });
  }
  const invalidShared = {
    horizontal_fov_degrees: 70,
    aspect_ratio: '16:9',
    view_multipliers: Object.fromEntries(P6_VIEW_IDS.map(viewId => [viewId, '1.000000']))
  };
  invalidShared.view_multipliers['front-south'] = '01.000000';
  assert.throws(() => deriveFixedViewManifest({
    solutionId: 'playbook-candidate-01', blueprintSha256: HASH_A,
    buildFunctionSha256: HASH_B, bounds: ASYMMETRIC_BOUNDS,
    mainEntry: SOUTH_ENTRY, sharedFraming: invalidShared
  }), { code: 'P6_CAMERA_PROTOCOL_INVALID' });
});

function solution(solution_id, bounds) {
  return {
    solution_id,
    bounds,
    main_entry: {
      x: (bounds.minX + bounds.maxX) / 2,
      y: bounds.minY + 1,
      z: bounds.maxZ,
      facing: 'south'
    }
  };
}

function distance(view) {
  return Number(Math.hypot(
    Number(view.position.x) - Number(view.target.x),
    Number(view.position.y) - Number(view.target.y),
    Number(view.position.z) - Number(view.target.z)
  ).toFixed(5));
}

function assertAllCornersFit(view, bounds) {
  const position = numericPoint(view.position);
  const target = numericPoint(view.target);
  const forward = normalize(subtract(target, position));
  const referenceUp = Math.abs(forward.y) > 0.999 ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 };
  const right = normalize(cross(forward, referenceUp));
  const up = normalize(cross(right, forward));
  const horizontal = Math.tan(70 * Math.PI / 360);
  const vertical = horizontal / (16 / 9);
  for (const x of [bounds.minX - 0.5, bounds.maxX + 0.5]) {
    for (const y of [bounds.minY - 0.5, bounds.maxY + 0.5]) {
      for (const z of [bounds.minZ - 0.5, bounds.maxZ + 0.5]) {
        const relative = subtract({ x, y, z }, position);
        const depth = dot(relative, forward);
        assert.ok(depth > 0, `${view.view_id} corner is in front of camera`);
        assert.ok(Math.abs(dot(relative, right) / depth) <= horizontal, `${view.view_id} horizontal fit`);
        assert.ok(Math.abs(dot(relative, up) / depth) <= vertical, `${view.view_id} vertical fit`);
      }
    }
  }
}

function numericPoint(point) { return { x: Number(point.x), y: Number(point.y), z: Number(point.z) }; }
function subtract(left, right) { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function dot(left, right) { return left.x * right.x + left.y * right.y + left.z * right.z; }
function cross(left, right) { return { x: left.y * right.z - left.z * right.y, y: left.z * right.x - left.x * right.z, z: left.x * right.y - left.y * right.x }; }
function normalize(vector) { const length = Math.hypot(vector.x, vector.y, vector.z); return { x: vector.x / length, y: vector.y / length, z: vector.z / length }; }
