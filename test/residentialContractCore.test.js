import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ResidentialContractError
} from '../src/training/residential/contracts/contractError.js';
import {
  assertArtifactPath,
  assertCell,
  assertExactObject,
  cloneDocument,
  deepFreeze
} from '../src/training/residential/contracts/validation.js';
import {
  HOUSE_SPEC_SOURCE,
  HOUSE_SCENE_SOURCE,
  MATERIAL_ROLES,
  OBJECT_ROLES,
  RESIDENTIAL_RESOLUTION,
  SOURCE_PROFILE_SOURCE,
  STRUCTURE_ROLES,
  SURVIVAL_BASELINE
} from '../src/training/residential/contracts/vocabularies.js';

test('residential vocabularies expose the frozen v1 contract', () => {
  assert.equal(HOUSE_SPEC_SOURCE, 'residential-housespec-v1');
  assert.equal(HOUSE_SCENE_SOURCE, 'residential-housescene-v1');
  assert.equal(SOURCE_PROFILE_SOURCE, 'residential-source-profile-v1');
  assert.deepEqual(RESIDENTIAL_RESOLUTION, [64, 64, 64]);
  assert.ok(STRUCTURE_ROLES.includes('wall'));
  assert.ok(MATERIAL_ROLES.includes('wall_primary'));
  assert.ok(OBJECT_ROLES.includes('painting'));
  assert.deepEqual(
    SURVIVAL_BASELINE,
    [
      'reachable_entrance',
      'connected_required_rooms',
      'connected_occupied_floors',
      'bed',
      'storage',
      'crafting',
      'cooking_or_smelting',
      'safe_lighting',
      'usable_clearance'
    ]
  );
  assert.ok(Object.isFrozen(STRUCTURE_ROLES));
  assert.ok(Object.isFrozen(RESIDENTIAL_RESOLUTION));
});

test('shared validation clones and deeply freezes caller data', () => {
  const input = { nested: { values: ['a'] } };
  const cloned = cloneDocument(input, 'fixture');
  assert.notEqual(cloned, input);
  assert.notEqual(cloned.nested, input.nested);
  assert.equal(deepFreeze(cloned), cloned);
  assert.ok(Object.isFrozen(cloned));
  assert.ok(Object.isFrozen(cloned.nested.values));
  input.nested.values.push('caller-mutation');
  assert.deepEqual(cloned.nested.values, ['a']);
});

test('shared validation rejects unknown fields, unsafe paths, and invalid cells', () => {
  assert.throws(
    () => assertExactObject(
      { allowed: true, extra: true },
      'fixture',
      ['allowed'],
      ['allowed']
    ),
    (error) => (
      error instanceof ResidentialContractError
      && error.code === 'CONTRACT_FIELD_UNKNOWN'
      && error.path === 'fixture.extra'
    )
  );
  for (const value of [
    '../escape.json',
    '/absolute.json',
    'nested/../../escape.json',
    'nested\\windows.json',
    '.',
    ''
  ]) {
    assert.throws(
      () => assertArtifactPath(value, 'artifact.file'),
      (error) => (
        error instanceof ResidentialContractError
        && error.code === 'CONTRACT_ARTIFACT_PATH_INVALID'
      ),
      value
    );
  }
  assert.equal(
    assertArtifactPath('grids/structure-role.bin', 'artifact.file'),
    'grids/structure-role.bin'
  );
  assert.deepEqual(assertCell([0, 63, 12], 'object.anchor'), [0, 63, 12]);
  assert.throws(
    () => assertCell([0, 64, 12], 'object.anchor'),
    (error) => (
      error instanceof ResidentialContractError
      && error.code === 'CONTRACT_CELL_INVALID'
    )
  );
});
