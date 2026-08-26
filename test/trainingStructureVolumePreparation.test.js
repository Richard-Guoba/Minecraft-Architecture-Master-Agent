import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { TrainingDataError } from '../src/training/trainingError.js';
import { decodeBoundedNbt } from '../src/training/boundedNbt.js';
import { validateVanillaStructureNbt } from '../src/training/vanillaStructureNbt.js';
import {
  MATERIAL_MAPPING_SHA256,
  prepareStructureVolume
} from '../src/training/structureVolumePreparation.js';
import { structureNbt } from './fixtures/stage7CandidateReadinessFixtures.js';

const ID = 'synthetic-source:house-01';

test('preparation centers tight bounds and emits a neutral source record', () => {
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
  assert.equal(prepared.record.source_id, ID);
  assert.equal(prepared.record.mapping_sha256, MATERIAL_MAPPING_SHA256);
  for (const key of [
    'synthetic_only',
    'authorizes_acquisition',
    'authorizes_training',
    'authorizes_dataset_admission'
  ]) {
    assert.equal(Object.hasOwn(prepared.record, key), false, key);
  }
});

test('preparation maps all nine token classes deterministically', () => {
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
  assert.deepEqual([...first.voxels].filter(Boolean), [1, 2, 3, 4, 5, 6, 7, 8, 2, 2]);
  assert.deepEqual(second, first);
  assert.equal(first.record.non_air_count, 10);
  assert.deepEqual(first.record.shape, [64, 64, 64]);
});

test('preparation enforces unmapped share and whole-volume extent', () => {
  const mostlyMapped = Array.from(
    { length: 10 },
    (_, x) => ({ pos: [x, 0, 0], state: x === 9 ? 2 : 1 })
  );
  assert.doesNotThrow(() => prepare({
    size: [10, 1, 1],
    palette: ['minecraft:air', 'minecraft:stone', 'modded:unknown'],
    blocks: mostlyMapped
  }));
  assert.throws(() => prepare({
    size: [10, 1, 1],
    palette: ['minecraft:air', 'minecraft:stone', 'modded:unknown'],
    blocks: mostlyMapped.map((block, indexValue) => ({
      ...block,
      state: indexValue >= 8 ? 2 : 1
    }))
  }), hasCode('MATERIAL_UNMAPPED_LIMIT'));
  assert.throws(() => prepare({
    size: [65, 1, 1],
    palette: ['minecraft:air', 'minecraft:stone'],
    blocks: [{ pos: [0, 0, 0], state: 1 }, { pos: [64, 0, 0], state: 1 }]
  }), hasCode('VOLUME_TOO_LARGE'));
});

function prepare(options) {
  const bytes = structureNbt(options);
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const decoded = decodeBoundedNbt(bytes, { sourceId: ID });
  const volume = validateVanillaStructureNbt(decoded, { sourceId: ID });
  return prepareStructureVolume({ sourceId: ID, contentSha256, volume });
}

function index(x, y, z) {
  return y * 64 * 64 + z * 64 + x;
}

function hasCode(code) {
  return (error) => error instanceof TrainingDataError && error.code === code;
}
