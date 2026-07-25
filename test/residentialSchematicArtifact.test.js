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
