import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateHouseSpec
} from '../src/training/residential/contracts/houseSpec.js';
import {
  validHouseSpecFixture
} from './fixtures/residentialContractFixtures.js';

test('HouseSpec v1 validates, clones, and freezes semantic input', () => {
  const input = validHouseSpecFixture();
  const result = validateHouseSpec(input);
  assert.notEqual(result, input);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.rooms));
  assert.equal(result.generation.seed, 18402933);
  assert.equal(result.rooms[1].id, 'living');
});

test('HouseSpec rejects coordinates and unknown fields', () => {
  const input = validHouseSpecFixture();
  input.rooms[0].anchor = [1, 2, 3];
  assert.throws(
    () => validateHouseSpec(input),
    /CONTRACT_FIELD_UNKNOWN: HouseSpec\.rooms\[0\]\.anchor/u
  );
});

test('HouseSpec rejects duplicate room IDs and dangling relationships', () => {
  const duplicate = validHouseSpecFixture();
  duplicate.rooms[1].id = 'entry';
  assert.throws(
    () => validateHouseSpec(duplicate),
    /HOUSE_SPEC_ROOM_DUPLICATE/u
  );

  const dangling = validHouseSpecFixture();
  dangling.relationships[0].to = 'missing_room';
  assert.throws(
    () => validateHouseSpec(dangling),
    /HOUSE_SPEC_RELATIONSHIP_ROOM_UNKNOWN/u
  );
});

test('HouseSpec requires the complete palette and survival baseline', () => {
  const palette = validHouseSpecFixture();
  delete palette.palette.wall_primary;
  assert.throws(
    () => validateHouseSpec(palette),
    /CONTRACT_FIELD_REQUIRED: HouseSpec\.palette\.wall_primary/u
  );

  const survival = validHouseSpecFixture();
  survival.survival.required = survival.survival.required
    .filter((value) => value !== 'crafting');
  assert.throws(
    () => validateHouseSpec(survival),
    /HOUSE_SPEC_SURVIVAL_REQUIRED/u
  );
});

test('HouseSpec enforces 64-cube bounds and signed 32-bit seed', () => {
  const dimensions = validHouseSpecFixture();
  dimensions.envelope.max_width = 65;
  assert.throws(
    () => validateHouseSpec(dimensions),
    /CONTRACT_INTEGER_INVALID/u
  );

  const seed = validHouseSpecFixture();
  seed.generation.seed = 2147483648;
  assert.throws(
    () => validateHouseSpec(seed),
    /CONTRACT_INTEGER_INVALID/u
  );
});
