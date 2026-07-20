import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { CandidateReadinessError } from '../src/construction/learning/stage7CandidateBoundary.js';
import { decodeBoundedNbt } from '../src/construction/learning/stage7BoundedNbt.js';
import { validateVanillaStructureNbt } from '../src/construction/learning/stage7VanillaStructureNbt.js';
import {
  CONDITIONAL_MATERIAL_MAPPING_SHA256,
  prepareConditionalVolume
} from '../src/construction/learning/stage7ConditionalVoxelPreparation.js';
import { structureNbt } from './fixtures/stage7CandidateReadinessFixtures.js';

const ID = 'synthetic-source:house-01';

test('preparation centers tight bounds without retaining empty source padding', () => {
  const prepared = prepare({
    size: [20, 20, 20],
    palette: ['minecraft:air', 'minecraft:stone_bricks', 'minecraft:oak_planks'],
    blocks: [
      { pos: [8, 7, 9], state: 1 },
      { pos: [9, 8, 10], state: 2 }
    ]
  });
  assert.equal(prepared.voxels.length, 64 ** 3);
  assert.deepEqual(prepared.record.actual_extent, { x: 2, y: 2, z: 2 });
  assert.deepEqual(prepared.record.translation_offset, { x: 31, y: 31, z: 31 });
  assert.equal(prepared.voxels[index(31, 31, 31)], 2);
  assert.equal(prepared.voxels[index(32, 32, 32)], 3);
  assert.equal(prepared.record.mapping_sha256, CONDITIONAL_MATERIAL_MAPPING_SHA256);

  const oddExtent = prepare({
    size: [7, 1, 1],
    palette: ['minecraft:air', 'minecraft:stone'],
    blocks: [
      { pos: [2, 0, 0], state: 1 },
      { pos: [3, 0, 0], state: 1 },
      { pos: [4, 0, 0], state: 1 }
    ]
  });
  assert.deepEqual(oddExtent.record.translation_offset, { x: 30, y: 31, z: 31 });
  assert.deepEqual(oddExtent.record.actual_extent, { x: 3, y: 1, z: 1 });
});

test('preparation maps every approved token class and is byte deterministic', () => {
  const palette = [
    'minecraft:air', 'minecraft:dirt', 'minecraft:stone_bricks',
    'minecraft:oak_planks', 'minecraft:glass', 'minecraft:oak_stairs',
    'minecraft:lantern', 'minecraft:water', 'modded:unknown_machine'
  ];
  const blocks = [
    ...palette.slice(1).map((name, x) => ({ pos: [x, 0, 0], state: x + 1 })),
    { pos: [8, 0, 0], state: 2 },
    { pos: [9, 0, 0], state: 2 }
  ];
  const first = prepare({ size: [10, 1, 1], palette, blocks });
  const second = prepare({ size: [10, 1, 1], palette, blocks });
  const tokens = [...first.voxels].filter((value) => value !== 0);
  assert.deepEqual(tokens, [1, 2, 3, 4, 5, 6, 7, 8, 2, 2]);
  assert.deepEqual(second.voxels, first.voxels);
  assert.deepEqual(second.record, first.record);
  assert.match(first.record.voxel_sha256, /^[a-f0-9]{64}$/u);
  assert.match(first.record.preparation_sha256, /^[a-f0-9]{64}$/u);
});

test('preparation permits exactly ten percent token 8 and rejects more', () => {
  const ten = Array.from({ length: 10 }, (_, x) => ({ pos: [x, 0, 0], state: x === 9 ? 2 : 1 }));
  const valid = prepare({
    size: [10, 1, 1],
    palette: ['minecraft:air', 'minecraft:stone', 'modded:unknown'],
    blocks: ten
  });
  assert.equal(valid.record.token_counts[8], 1);
  assert.equal(valid.record.token_8_share, 0.1);
  const eleven = Array.from({ length: 10 }, (_, x) => ({ pos: [x, 0, 0], state: x >= 8 ? 2 : 1 }));
  assert.throws(
    () => prepare({
      size: [10, 1, 1],
      palette: ['minecraft:air', 'minecraft:stone', 'modded:unknown'],
      blocks: eleven
    }),
    hasCode('MATERIAL_UNMAPPED_LIMIT')
  );
});

test('preparation accepts extent 64 and defers extent 65 without an artifact', () => {
  assert.doesNotThrow(() => prepare({
    size: [64, 1, 1],
    palette: ['minecraft:air', 'minecraft:stone'],
    blocks: [{ pos: [0, 0, 0], state: 1 }, { pos: [63, 0, 0], state: 1 }]
  }));
  assert.throws(() => prepare({
    size: [65, 1, 1],
    palette: ['minecraft:air', 'minecraft:stone'],
    blocks: [{ pos: [0, 0, 0], state: 1 }, { pos: [64, 0, 0], state: 1 }]
  }), hasCode('VOLUME_TOO_LARGE'));
});

function prepare(options) {
  const bytes = structureNbt(options);
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const decoded = decodeBoundedNbt(bytes, { candidateId: ID });
  const volume = validateVanillaStructureNbt(decoded, { candidateId: ID });
  return prepareConditionalVolume({ candidateId: ID, contentSha256, volume });
}

function index(x, y, z) { return y * 64 * 64 + z * 64 + x; }
function hasCode(code) {
  return (error) => error instanceof CandidateReadinessError && error.code === code;
}
