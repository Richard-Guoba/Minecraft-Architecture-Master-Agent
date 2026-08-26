import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateHouseScene
} from '../src/training/residential/contracts/houseScene.js';
import {
  validHouseSceneFixture
} from './fixtures/residentialContractFixtures.js';

test('HouseScene validates fixed layers and sparse learned objects', () => {
  const input = validHouseSceneFixture();
  const result = validateHouseScene(input);
  assert.notEqual(result, input);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.objects[0].occupied_cells));
  assert.deepEqual(result.resolution, [64, 64, 64]);
  assert.equal(result.objects[0].role, 'painting');
});

test('HouseScene rejects missing, duplicate, and unsafe grid descriptors', () => {
  const missing = validHouseSceneFixture();
  missing.grids.pop();
  assert.throws(() => validateHouseScene(missing), /HOUSE_SCENE_GRID_MISSING/u);

  const duplicate = validHouseSceneFixture();
  duplicate.grids[1].name = 'structure_role';
  assert.throws(() => validateHouseScene(duplicate), /HOUSE_SCENE_GRID_DUPLICATE/u);

  const escape = validHouseSceneFixture();
  escape.grids[0].file = '../structure.bin';
  assert.throws(() => validateHouseScene(escape), /CONTRACT_ARTIFACT_PATH_INVALID/u);

  const shape = validHouseSceneFixture();
  shape.grids[0].shape = [];
  assert.throws(() => validateHouseScene(shape), /HOUSE_SCENE_GRID_SHAPE_INVALID/u);
});

test('HouseScene rejects out-of-range cells and unknown room references', () => {
  const cell = validHouseSceneFixture();
  cell.objects[0].anchor = [18, 64, 11];
  assert.throws(() => validateHouseScene(cell), /CONTRACT_CELL_INVALID/u);

  const room = validHouseSceneFixture();
  room.objects[0].room_id = 'missing_room';
  assert.throws(() => validateHouseScene(room), /HOUSE_SCENE_OBJECT_ROOM_UNKNOWN/u);
});

test('HouseScene requires unique object and room identifiers', () => {
  const object = validHouseSceneFixture();
  object.objects.push(structuredClone(object.objects[0]));
  assert.throws(() => validateHouseScene(object), /HOUSE_SCENE_OBJECT_DUPLICATE/u);

  const room = validHouseSceneFixture();
  room.room_index.push({ index: 4, room_id: 'living' });
  assert.throws(() => validateHouseScene(room), /HOUSE_SCENE_ROOM_DUPLICATE/u);
});
