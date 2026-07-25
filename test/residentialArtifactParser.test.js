import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseResidentialArtifact,
  supportedResidentialFormat
} from '../src/training/residential/intake/index.js';
import {
  classicSchematic,
  vanillaStructure
} from './fixtures/residentialIntakeFixtures.js';

test('format dispatch follows the original extension exactly', () => {
  assert.equal(supportedResidentialFormat('house.schem'), 'schem');
  assert.equal(supportedResidentialFormat('house.schematic'), 'schematic');
  assert.equal(supportedResidentialFormat('house.nbt'), 'structure_nbt');
  assert.equal(supportedResidentialFormat('house.litematic'), null);
  assert.equal(supportedResidentialFormat('house.schem.zip'), null);
});

test('artifact parser measures tight bounds and stable fingerprints', () => {
  const first = parseResidentialArtifact({
    bytes: classicSchematic(),
    originalFilename: 'fixture.schematic',
    sourceId: 'fixture-artifact'
  });
  const second = parseResidentialArtifact({
    bytes: classicSchematic(),
    originalFilename: 'fixture.schematic',
    sourceId: 'fixture-artifact'
  });
  assert.deepEqual(second, first);
  assert.deepEqual(first.occupied_bounds.extent, [1, 1, 1]);
  assert.deepEqual(first.source_occupied_bounds, {
    min: [0, 0, 0], max: [0, 0, 0], extent: [1, 1, 1]
  });
  assert.match(first.exact_sha256, /^[a-f0-9]{64}$/u);
  assert.equal(
    first.structural_fingerprint.content_sha256,
    first.exact_sha256
  );
});

test('artifact parser normalizes padded sparse vanilla bounds', () => {
  const result = parseResidentialArtifact({
    bytes: vanillaStructure({
      size: [5, 4, 3],
      palette: ['minecraft:air', 'minecraft:oak_stairs', 'minecraft:lantern'],
      blocks: [
        { pos: [1, 1, 1], state: 1 },
        { pos: [3, 2, 1], state: 2 }
      ]
    }),
    originalFilename: 'fixture.nbt',
    sourceId: 'fixture-structure'
  });
  assert.equal(result.format, 'structure_nbt');
  assert.deepEqual(result.source_occupied_bounds, {
    min: [1, 1, 1], max: [3, 2, 1], extent: [3, 2, 1]
  });
  assert.deepEqual(result.occupied_bounds, {
    min: [0, 0, 0], max: [2, 1, 0], extent: [3, 2, 1]
  });
});

test('artifact parser supports sparse vanilla structures and rejects renamed data', () => {
  const result = parseResidentialArtifact({
    bytes: vanillaStructure(),
    originalFilename: 'fixture.nbt',
    sourceId: 'fixture-structure'
  });
  assert.equal(result.format, 'structure_nbt');
  assert.ok(result.occupied_bounds.extent.every((axis) => axis > 0));

  assert.throws(
    () => parseResidentialArtifact({
      bytes: classicSchematic(),
      originalFilename: 'renamed.nbt',
      sourceId: 'renamed-source'
    }),
    /STRUCTURE_FIELDS_INVALID/u
  );
});

test('artifact parser rejects all-air schematic sources', () => {
  assert.throws(
    () => parseResidentialArtifact({
      bytes: classicSchematic({ blocks: [0, 0, 0, 0, 0, 0, 0, 0] }),
      originalFilename: 'empty.schematic',
      sourceId: 'empty-source'
    }),
    (error) => error.code === 'SOURCE_EMPTY'
  );
});

test('unsupported extensions are deferred by a stable parser error', () => {
  assert.throws(
    () => parseResidentialArtifact({
      bytes: Buffer.from('fixture'),
      originalFilename: 'fixture.litematic',
      sourceId: 'unsupported-source'
    }),
    (error) => error.code === 'ARTIFACT_FORMAT_UNSUPPORTED'
  );
});
