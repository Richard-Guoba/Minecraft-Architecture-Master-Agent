import assert from 'node:assert/strict';
import test from 'node:test';
import { TrainingDataError } from '../src/training/trainingError.js';
import { BOUNDED_NBT_LIMITS, decodeBoundedNbt } from '../src/training/boundedNbt.js';
import { validateVanillaStructureNbt } from '../src/training/vanillaStructureNbt.js';
import { nbtString, structureNbt } from './fixtures/stage7CandidateReadinessFixtures.js';

const ID = 'synthetic-source:house-01';

test('adapter validates one independent sparse Java structure', () => {
  const volume = decode(structureNbt({
    palette: [
      'minecraft:air',
      { Name: 'minecraft:oak_stairs', Properties: { facing: 'north' } },
      'minecraft:stone_bricks'
    ],
    blocks: [
      { pos: [0, 0, 0], state: 0 },
      { pos: [1, 0, 0], state: 1 },
      { pos: [2, 1, 2], state: 2, nbt: { Custom: nbtString('ignored') } }
    ]
  }));
  assert.equal(volume.source_id, ID);
  assert.deepEqual(volume.declared_size, { x: 3, y: 2, z: 3 });
  assert.equal(volume.palette[1].canonical_state, 'minecraft:oak_stairs[facing=north]');
  assert.equal(volume.blocks.length, 3);
  assert.equal(volume.block_entity_count, 1);
  assert.deepEqual(volume.non_air_bounds, {
    min: { x: 1, y: 0, z: 0 },
    max: { x: 2, y: 1, z: 2 },
    extent: { x: 2, y: 2, z: 3 }
  });
});

test('adapter rejects missing, duplicate, unsafe, and over-budget structure data', () => {
  const valid = decodeBoundedNbt(structureNbt(), { sourceId: ID });
  assert.throws(
    () => validateVanillaStructureNbt(
      { ...valid, value: { ...valid.value, blocks: undefined } },
      { sourceId: ID }
    ),
    hasCode('STRUCTURE_FIELDS_INVALID')
  );
  assert.throws(
    () => decode(structureNbt({
      blocks: [{ pos: [0, 0, 0], state: 1 }, { pos: [0, 0, 0], state: 1 }]
    })),
    hasCode('STRUCTURE_COORDINATE_DUPLICATE')
  );
  assert.throws(
    () => validateVanillaStructureNbt(valid, {
      sourceId: ID,
      limits: { ...BOUNDED_NBT_LIMITS, maxPaletteEntries: 1 }
    }),
    hasCode('STRUCTURE_PALETTE_LIMIT')
  );
  assert.throws(
    () => decode(structureNbt({ palette: ['minecraft:air', '../stone'], blocks: [{ pos: [0, 0, 0], state: 1 }] })),
    hasCode('STRUCTURE_BLOCK_ID_INVALID')
  );
});

test('adapter rejects external and command structure blocks', () => {
  for (const [identifier, code] of [
    ['minecraft:jigsaw', 'STRUCTURE_EXTERNAL_DEPENDENCY'],
    ['minecraft:structure_block', 'STRUCTURE_EXTERNAL_DEPENDENCY'],
    ['minecraft:command_block', 'SECURITY_REVIEW_REQUIRED']
  ]) {
    assert.throws(
      () => decode(structureNbt({
        palette: ['minecraft:air', identifier],
        blocks: [{ pos: [0, 0, 0], state: 1 }]
      })),
      hasCode(code)
    );
  }
});

function decode(bytes) {
  return validateVanillaStructureNbt(
    decodeBoundedNbt(bytes, { sourceId: ID }),
    { sourceId: ID }
  );
}

function hasCode(code) {
  return (error) => error instanceof TrainingDataError && error.code === code;
}
