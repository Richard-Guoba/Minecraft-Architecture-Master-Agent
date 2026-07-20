import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANDIDATE_NBT_LIMITS,
  CandidateReadinessError
} from '../src/construction/learning/stage7CandidateBoundary.js';
import { decodeBoundedNbt } from '../src/construction/learning/stage7BoundedNbt.js';
import { validateVanillaStructureNbt } from '../src/construction/learning/stage7VanillaStructureNbt.js';
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
  assert.deepEqual(volume.declared_size, { x: 3, y: 2, z: 3 });
  assert.equal(volume.palette[1].canonical_state, 'minecraft:oak_stairs[facing=north]');
  assert.equal(volume.blocks.length, 3);
  assert.equal(volume.block_entity_count, 1);
  assert.deepEqual(volume.non_air_bounds, {
    min: { x: 1, y: 0, z: 0 },
    max: { x: 2, y: 1, z: 2 },
    extent: { x: 2, y: 2, z: 3 }
  });
  assert.equal(volume.source_orientation, 'source');
});

test('adapter rejects missing, multi-palette, empty, coordinate, and palette failures', () => {
  const valid = decodeBoundedNbt(structureNbt(), { candidateId: ID });
  for (const [code, value] of [
    ['STRUCTURE_FIELDS_INVALID', { ...valid, value: { ...valid.value, blocks: undefined } }],
    ['STRUCTURE_MULTI_PALETTE', { ...valid, value: { ...valid.value, palettes: [], palette: undefined } }]
  ]) {
    assert.throws(() => validateVanillaStructureNbt(value, { candidateId: ID }), hasCode(code));
  }
  assert.throws(
    () => decode(structureNbt({ blocks: [{ pos: [3, 0, 0], state: 1 }] })),
    hasCode('STRUCTURE_COORDINATE_INVALID')
  );
  assert.throws(
    () => decode(structureNbt({ blocks: [{ pos: [0, 0, 0], state: 99 }] })),
    hasCode('STRUCTURE_PALETTE_INDEX_INVALID')
  );
  assert.throws(
    () => decode(structureNbt({ blocks: [{ pos: [0, 0, 0], state: 0 }] })),
    hasCode('STRUCTURE_EMPTY')
  );
});

test('adapter rejects duplicate coordinates and over-budget palette or blocks', () => {
  assert.throws(
    () => decode(structureNbt({
      blocks: [{ pos: [0, 0, 0], state: 1 }, { pos: [0, 0, 0], state: 1 }]
    })),
    hasCode('STRUCTURE_COORDINATE_DUPLICATE')
  );
  assert.throws(
    () => validateVanillaStructureNbt(
      decodeBoundedNbt(structureNbt(), { candidateId: ID }),
      { candidateId: ID, limits: { maxPaletteEntries: 1, maxBlocks: 1, maxBlockEntities: 1 } }
    ),
    (error) => ['STRUCTURE_PALETTE_LIMIT', 'STRUCTURE_BLOCK_LIMIT'].includes(error.code)
  );
  const withBlockEntity = decodeBoundedNbt(structureNbt({
    blocks: [{ pos: [0, 0, 0], state: 1, nbt: { Custom: nbtString('ignored') } }]
  }), { candidateId: ID });
  assert.throws(
    () => validateVanillaStructureNbt(withBlockEntity, {
      candidateId: ID,
      limits: { ...CANDIDATE_NBT_LIMITS, maxBlockEntities: 0 }
    }),
    hasCode('STRUCTURE_BLOCK_ENTITY_LIMIT')
  );
});

test('adapter defers jigsaw, structure-block, and command-block evidence without reading commands', () => {
  for (const [identifier, code] of [
    ['minecraft:jigsaw', 'STRUCTURE_EXTERNAL_DEPENDENCY'],
    ['minecraft:structure_block', 'STRUCTURE_EXTERNAL_DEPENDENCY'],
    ['minecraft:command_block', 'SECURITY_REVIEW_REQUIRED']
  ]) {
    assert.throws(
      () => decode(structureNbt({ palette: ['minecraft:air', identifier], blocks: [{ pos: [0, 0, 0], state: 1 }] })),
      hasCode(code)
    );
  }
});

test('adapter rejects invalid resource identifiers and unsafe property shapes', () => {
  assert.throws(
    () => decode(structureNbt({ palette: ['minecraft:air', '../stone'], blocks: [{ pos: [0, 0, 0], state: 1 }] })),
    hasCode('STRUCTURE_BLOCK_ID_INVALID')
  );
  assert.throws(
    () => decode(structureNbt({
      palette: [
        'minecraft:air',
        { Name: 'minecraft:stone', Properties: { facing: 'north\nunsafe' } }
      ],
      blocks: [{ pos: [0, 0, 0], state: 1 }]
    })),
    hasCode('STRUCTURE_PROPERTIES_INVALID')
  );
});

function decode(bytes) {
  return validateVanillaStructureNbt(
    decodeBoundedNbt(bytes, { candidateId: ID }),
    { candidateId: ID }
  );
}

function hasCode(code) {
  return (error) => error instanceof CandidateReadinessError && error.code === code;
}
