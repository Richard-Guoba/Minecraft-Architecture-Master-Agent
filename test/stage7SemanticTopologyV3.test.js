import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStage7GridTransformV3 } from '../src/construction/learning/stage7GridTransformV3.js';
import { collectStage7SemanticEvidenceV3 } from '../src/construction/learning/stage7SemanticEvidenceV3.js';
import { buildStage7SemanticTopologyV3 } from '../src/construction/learning/stage7SemanticTopologyV3.js';
import {
  oneFloorHouseV3Fixture,
  twoFloorHouseV3Fixture,
  detachedPavilionV3Fixture,
  siteSceneV3Fixture
} from './fixtures/stage7DatasetV3Fixtures.js';

function extract(volume, caseId) {
  const occupiedBounds = {
    min_x: 0,
    min_y: 0,
    min_z: 0,
    max_x: volume.width - 1,
    max_y: volume.height - 1,
    max_z: volume.length - 1
  };
  const transform = buildStage7GridTransformV3({
    volume,
    occupiedBounds,
    frontSide: 'south'
  });
  const evidence = collectStage7SemanticEvidenceV3({ volume, transform, caseId });
  return buildStage7SemanticTopologyV3({ evidence, transform, caseId });
}

test('one-floor fixture has entrance, circulation, usable space, floor, roof, and no vertical core', () => {
  const result = extract(oneFloorHouseV3Fixture(), 'one-floor');
  assert.ok(result.topology.entrance_keys.length > 0);
  assert.ok(result.topology.circulation_keys.length > 0);
  assert.deepEqual(result.topology.vertical_core_keys, []);
  assert.ok(result.cells.some((cell) => cell.envelope === 'floor'));
  assert.ok(result.cells.some((cell) => cell.envelope === 'roof'));
  assert.ok(result.cells.some((cell) => ['public', 'private'].includes(cell.space)));
});

test('connected two-floor stairs form one vertical core and disconnected stairs do not', () => {
  const connected = extract(twoFloorHouseV3Fixture(), 'two-floor');
  const disconnected = extract(
    twoFloorHouseV3Fixture({ disconnectedStairs: true }),
    'broken-stairs'
  );
  assert.ok(connected.topology.vertical_core_keys.length > 0);
  assert.deepEqual(disconnected.topology.vertical_core_keys, []);
});

test('roof stairs stay roof and detached pavilion cannot donate the entrance or core', () => {
  const roof = extract(oneFloorHouseV3Fixture({ roofStairs: true }), 'roof-stairs');
  assert.equal(roof.topology.roof_vertical_overlap, 0);
  const detached = extract(detachedPavilionV3Fixture(), 'detached');
  assert.deepEqual(detached.topology.entrance_keys, []);
  assert.deepEqual(detached.topology.vertical_core_keys, []);
});

test('sealed primary house has no exterior-connected entrance', () => {
  const sealed = extract(oneFloorHouseV3Fixture({ sealed: true }), 'sealed-house');
  assert.deepEqual(sealed.topology.entrance_keys, []);
  assert.deepEqual(sealed.topology.circulation_keys, []);
});

test('site scene preserves ground, path, water, and vegetation labels', () => {
  const site = extract(siteSceneV3Fixture(), 'site-scene');
  for (const value of ['ground', 'path', 'water', 'vegetation']) {
    assert.ok(site.cells.some((cell) => cell.site === value), `missing site ${value}`);
  }
});
