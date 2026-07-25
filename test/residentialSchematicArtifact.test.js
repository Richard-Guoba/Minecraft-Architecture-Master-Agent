import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeResidentialSchematic
} from '../src/training/residential/intake/schematicArtifact.js';
import {
  classicSchematic,
  regionSchematic,
  spongeSchematic
} from './fixtures/residentialIntakeFixtures.js';

test('residential adapter decodes bounded legacy and Sponge schematics', () => {
  const legacy = decodeResidentialSchematic(classicSchematic(), {
    sourceId: 'fixture-legacy',
    format: 'schematic'
  });
  assert.deepEqual(legacy.declared_size, { x: 2, y: 2, z: 2 });
  assert.equal(legacy.blockAtIndex(0).name, 'stone');

  const sponge = decodeResidentialSchematic(spongeSchematic(), {
    sourceId: 'fixture-sponge',
    format: 'schem'
  });
  assert.equal(sponge.blockAtIndex(0).canonical_state, 'minecraft:oak_planks');
  assert.equal(sponge.blockAtIndex(1).air, true);
});

for (const { name, encodedBlockData } of [
  {
    name: 'overflowing',
    encodedBlockData: [0x80, 0x80, 0x80, 0x80, 0x10]
  },
  {
    name: 'overlong',
    encodedBlockData: [0x80, 0x80, 0x80, 0x80, 0x80, 0x00]
  },
  {
    name: 'noncanonical',
    encodedBlockData: [0x80, 0x00]
  }
]) {
  test(`Sponge block data rejects ${name} varints`, () => {
    assert.throws(
      () => decodeResidentialSchematic(spongeSchematic({
        width: 1,
        encodedBlockData
      }), {
        sourceId: `${name}-varint`,
        format: 'schem'
      }),
      (error) => error.code === 'SCHEMATIC_BLOCK_DATA_INVALID'
    );
  });
}

test('Sponge block data accepts canonical varint boundaries', () => {
  const palette = Object.fromEntries(Array.from(
    { length: 4096 },
    (_, index) => [`minecraft:test_${index}`, index]
  ));
  const schematic = decodeResidentialSchematic(spongeSchematic({
    width: 4,
    palette,
    encodedBlockData: [0x00, 0x7f, 0x80, 0x01, 0xff, 0x1f]
  }), {
    sourceId: 'canonical-varint-boundaries',
    format: 'schem'
  });
  assert.deepEqual(
    Array.from(
      { length: schematic.block_count },
      (_, index) => schematic.blockAtIndex(index).canonical_state
    ),
    [
      'minecraft:test_0',
      'minecraft:test_127',
      'minecraft:test_128',
      'minecraft:test_4095'
    ]
  );

  assert.throws(
    () => decodeResidentialSchematic(spongeSchematic({
      width: 1,
      encodedBlockData: [0xff, 0xff, 0xff, 0xff, 0x0f]
    }), {
      sourceId: 'canonical-uint32-maximum',
      format: 'schem'
    }),
    (error) => error.code === 'SCHEMATIC_PALETTE_INDEX_INVALID'
  );
});

test('residential adapter decodes a bounded one-region packed-state schematic', () => {
  const region = decodeResidentialSchematic(regionSchematic(), {
    sourceId: 'fixture-region',
    format: 'schem'
  });
  assert.deepEqual(region.declared_size, { x: 2, y: 1, z: 1 });
  assert.equal(region.block_count, 2);
  assert.equal(region.blockAtIndex(0).canonical_state, 'minecraft:stone');
  assert.equal(region.blockAtIndex(1).air, true);
  assert.equal(Object.isFrozen(region.blockAtIndex(0)), true);
});

test('one-region signed size reverses the affected axis into normalized coordinates', () => {
  const region = decodeResidentialSchematic(regionSchematic({
    size: [-3, 1, 1],
    palette: [
      'minecraft:stone',
      'minecraft:oak_planks',
      'minecraft:glass'
    ],
    states: [0, 1, 2]
  }), {
    sourceId: 'negative-x-region',
    format: 'schem'
  });
  assert.deepEqual(region.declared_size, { x: 3, y: 1, z: 1 });
  assert.deepEqual(
    Array.from(
      { length: region.block_count },
      (_, index) => region.blockAtIndex(index).canonical_state
    ),
    [
      'minecraft:glass',
      'minecraft:oak_planks',
      'minecraft:stone'
    ]
  );
});

test('one-region signed size reverses multiple asymmetric axes', () => {
  const palette = [
    'minecraft:stone',
    'minecraft:oak_planks',
    'minecraft:glass',
    'minecraft:dirt',
    'minecraft:torch',
    'minecraft:oak_stairs',
    'minecraft:water',
    'minecraft:chest'
  ];
  const region = decodeResidentialSchematic(regionSchematic({
    size: [-2, -2, -2],
    palette,
    states: [0, 1, 2, 3, 4, 5, 6, 7]
  }), {
    sourceId: 'negative-xyz-region',
    format: 'schem'
  });
  assert.deepEqual(region.declared_size, { x: 2, y: 2, z: 2 });
  assert.deepEqual(
    Array.from(
      { length: region.block_count },
      (_, index) => region.blockAtIndex(index).canonical_state
    ),
    [...palette].reverse()
  );
});

test('one-region signed size still rejects a zero axis', () => {
  assert.throws(
    () => decodeResidentialSchematic(regionSchematic({
      size: [2, 0, -1],
      states: [0, 1]
    }), {
      sourceId: 'zero-axis-region',
      format: 'schem'
    }),
    /SCHEMATIC_DIMENSIONS_INVALID/u
  );
});

test('residential adapter rejects bad palette data and over-budget volume', () => {
  assert.throws(
    () => decodeResidentialSchematic(
      spongeSchematic({ width: 65_536, height: 1, length: 1 }),
      { sourceId: 'bad-volume', format: 'schem' }
    ),
    /SCHEMATIC_VOLUME_LIMIT|SCHEMATIC_DIMENSIONS_INVALID/u
  );
  assert.throws(
    () => decodeResidentialSchematic(
      spongeSchematic({ palette: { 'minecraft:stone': 2 } }),
      { sourceId: 'bad-palette', format: 'schem' }
    ),
    /SCHEMATIC_PALETTE_INVALID/u
  );
});

test('residential adapter rejects legacy command blocks before exposing an artifact', () => {
  for (const blockId of [137, 210, 211]) {
    assert.throws(
      () => decodeResidentialSchematic(classicSchematic({ blockId }), {
        sourceId: `legacy-command-${blockId}`,
        format: 'schematic'
      }),
      /SECURITY_REVIEW_REQUIRED/u
    );
  }
});

test('one-region dimensions above a signed short remain valid below the volume budget', () => {
  const volume = decodeResidentialSchematic(regionSchematic({
    size: [32_768, 1, 1],
    states: Array(32_768).fill(0)
  }), {
    sourceId: 'large-region',
    format: 'schem'
  });
  assert.deepEqual(volume.declared_size, { x: 32_768, y: 1, z: 1 });
  assert.equal(volume.block_count, 32_768);
  assert.equal(volume.blockAtIndex(0).canonical_state, 'minecraft:stone');
});
