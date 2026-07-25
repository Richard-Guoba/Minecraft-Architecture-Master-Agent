import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import {
  parseResidentialArtifact,
  RESIDENTIAL_INTAKE_LIMITS,
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

test('artifact parser enforces the vanilla entity limit at the R2 boundary', () => {
  const atLimit = parseResidentialArtifact({
    bytes: vanillaStructure({
      entities: Array.from({ length: 16_384 }, () => ({}))
    }),
    originalFilename: 'entity-limit.nbt',
    sourceId: 'entity-limit-accepted'
  });
  assert.equal(atLimit.entity_count, 16_384);

  assert.throws(
    () => parseResidentialArtifact({
      bytes: vanillaStructure({
        entities: Array.from({ length: 16_385 }, () => ({}))
      }),
      originalFilename: 'entity-overflow.nbt',
      sourceId: 'entity-limit-rejected'
    }),
    (error) => (
      error.code === 'STRUCTURE_ENTITY_LIMIT'
      && error.metadata.stage === 'structure'
      && error.metadata.entity_count === 16_385
    )
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

test('occupied analysis is capped at the maximum useful 64-cube envelope', () => {
  assert.equal(Object.isFrozen(RESIDENTIAL_INTAKE_LIMITS), true);
  assert.equal(
    RESIDENTIAL_INTAKE_LIMITS.maxOccupiedAnalysisEntries,
    64 ** 3
  );
  const atLimit = parseResidentialArtifact({
    bytes: classicSchematic({
      width: 64,
      height: 64,
      length: 64,
      blocks: Buffer.alloc(64 ** 3, 1)
    }),
    originalFilename: 'dense-at-limit.schematic',
    sourceId: 'dense-at-limit'
  });
  assert.deepEqual(atLimit.occupied_bounds.extent, [64, 64, 64]);

  const overLimitVolume = 65 * 64 * 64;
  assert.throws(
    () => parseResidentialArtifact({
      bytes: classicSchematic({
        width: 65,
        height: 64,
        length: 64,
        blocks: Buffer.alloc(overLimitVolume, 1)
      }),
      originalFilename: 'dense-over-limit.schematic',
      sourceId: 'dense-over-limit'
    }),
    (error) => (
      error.code === 'SOURCE_OCCUPIED_ENTRY_LIMIT'
      && error.metadata.stage === 'measurement'
      && error.metadata.entry_count === 64 ** 3 + 1
      && error.metadata.max_entries === 64 ** 3
    )
  );
});

test('dense hostile schematic fails with a controlled limit under a capped heap', async () => {
  const parserUrl = new URL(
    '../src/training/residential/intake/index.js',
    import.meta.url
  ).href;
  const fixtureUrl = new URL(
    './fixtures/residentialIntakeFixtures.js',
    import.meta.url
  ).href;
  const worker = new Worker(`
    const { parentPort } = require('node:worker_threads');
    Promise.all([
      import(${JSON.stringify(parserUrl)}),
      import(${JSON.stringify(fixtureUrl)})
    ]).then(([{ parseResidentialArtifact }, { classicSchematic }]) => {
      const width = 1000;
      const height = 1000;
      const bytes = classicSchematic({
        width,
        height,
        length: 1,
        blocks: Buffer.alloc(width * height, 1)
      });
      try {
        parseResidentialArtifact({
          bytes,
          originalFilename: 'dense-hostile.schematic',
          sourceId: 'dense-hostile-worker'
        });
        parentPort.postMessage({ kind: 'accepted' });
      } catch (error) {
        parentPort.postMessage({
          kind: 'training_error',
          name: error.name,
          code: error.code,
          stage: error.metadata?.stage
        });
      }
    });
  `, {
    eval: true,
    resourceLimits: { maxOldGenerationSizeMb: 64 }
  });
  let result;
  try {
    [result] = await once(worker, 'message');
  } catch (error) {
    result = {
      kind: 'worker_error',
      code: error.code,
      message: error.message
    };
  } finally {
    await worker.terminate();
  }
  assert.deepEqual(result, {
    kind: 'training_error',
    name: 'TrainingDataError',
    code: 'SOURCE_OCCUPIED_ENTRY_LIMIT',
    stage: 'measurement'
  });
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
