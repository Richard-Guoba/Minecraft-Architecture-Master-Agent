import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeTrainingDataset } from '../src/training/trainingDatasetWriter.js';

test('dataset writer creates deterministic source-bound whole and patch artifacts', async (t) => {
  const fixture = await datasetFixture(t);
  const first = await writeTrainingDataset(fixture);
  const manifestPath = path.join(
    fixture.outputRoot,
    'dataset',
    'manifest.json'
  );
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const report = JSON.parse(await fs.readFile(
    path.join(fixture.outputRoot, 'reports', 'preparation.json'),
    'utf8'
  ));
  const split = JSON.parse(await fs.readFile(
    path.join(fixture.outputRoot, 'splits', 'split.json'),
    'utf8'
  ));

  assert.equal(first.accepted_source_count, 4);
  assert.equal(first.rejected_source_count, 1);
  assert.equal(first.whole_count, 4);
  assert.equal(first.patch_count, 4);
  assert.equal(manifest.source, 'minecraft-architecture-training-dataset-v1');
  assert.deepEqual(manifest.patch_shape, [32, 32, 32]);
  assert.equal(manifest.patch_stride, 16);
  assert.equal(manifest.sources.length, 4);
  assert.equal(manifest.samples.length, 4);
  assert.equal(report.rejected_sources[0].relative_path, 'corrupt.schematic');
  assert.equal(report.rejected_sources[0].code, 'SOURCE_MALFORMED');

  for (const sample of manifest.samples) {
    assert.equal(
      sample.split,
      split.assignments[sample.source_id],
      sample.sample_id
    );
    const bytes = await fs.readFile(path.join(
      fixture.outputRoot,
      'dataset',
      'samples',
      `${sample.sample_id}.bin`
    ));
    assert.equal(bytes.length, 32 ** 3);
  }
  for (const source of manifest.sources) {
    assert.equal(source.split, split.assignments[source.source_id]);
    const bytes = await fs.readFile(path.join(
      fixture.outputRoot,
      'dataset',
      'whole',
      `${source.source_id}.bin`
    ));
    assert.equal(bytes.length, 64 ** 3);
  }

  const duplicateHash = manifest.sources
    .map((source) => source.content_sha256)
    .find((hash, index, hashes) => hashes.indexOf(hash) !== index);
  const duplicateSources = manifest.sources.filter(
    (source) => source.content_sha256 === duplicateHash
  );
  assert.equal(duplicateSources.length, 2);
  assert.equal(duplicateSources[0].split, duplicateSources[1].split);

  const expectedInventory = [
    'dataset/manifest.json',
    ...manifest.samples.map(
      (sample) => `dataset/samples/${sample.sample_id}.bin`
    ),
    ...manifest.sources.map(
      (source) => `dataset/whole/${source.source_id}.bin`
    ),
    'reports/preparation.json',
    'splits/split.json'
  ].sort();
  assert.deepEqual(await inventory(fixture.outputRoot), expectedInventory);

  const before = await treeDigest(fixture.outputRoot);
  const second = await writeTrainingDataset(fixture);
  const after = await treeDigest(fixture.outputRoot);
  assert.deepEqual(second, first);
  assert.equal(after, before);
});

test('dataset writer refuses to overwrite a different existing dataset', async (t) => {
  const fixture = await datasetFixture(t);
  await writeTrainingDataset(fixture);
  await fs.writeFile(
    path.join(fixture.outputRoot, 'dataset', 'manifest.json'),
    '{"changed":true}\n'
  );

  await assert.rejects(
    writeTrainingDataset(fixture),
    (error) => error.code === 'DATASET_OUTPUT_CONFLICT'
  );
});

async function datasetFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'training-writer-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, 'sources');
  const outputRoot = path.join(root, 'training');
  await fs.mkdir(sourceRoot);
  const single = schematic({ x: 1, y: 1, z: 1 }, [1]);
  await fs.writeFile(path.join(sourceRoot, 'a.schematic'), single);
  await fs.writeFile(path.join(sourceRoot, 'a-copy.schematic'), single);
  await fs.writeFile(
    path.join(sourceRoot, 'vertical.schematic'),
    schematic({ x: 1, y: 2, z: 1 }, [1, 1])
  );
  await fs.writeFile(
    path.join(sourceRoot, 'corner.schematic'),
    schematic({ x: 2, y: 2, z: 1 }, [1, 0, 1, 1])
  );
  await fs.writeFile(path.join(sourceRoot, 'corrupt.schematic'), 'broken');
  return { sourceRoot, outputRoot, seed: 7101 };
}

function schematic({ x, y, z }, blocks) {
  const shortTag = (name, value) => Buffer.concat([
    Buffer.from([2, 0, name.length]),
    Buffer.from(name),
    Buffer.from([value >> 8, value & 0xff])
  ]);
  const blocksLength = Buffer.alloc(4);
  blocksLength.writeInt32BE(blocks.length);
  return Buffer.concat([
    Buffer.from([10, 0, 0]),
    shortTag('Width', x),
    shortTag('Height', y),
    shortTag('Length', z),
    Buffer.from([7, 0, 6]),
    Buffer.from('Blocks'),
    blocksLength,
    Buffer.from(blocks),
    Buffer.from([0])
  ]);
}

async function inventory(root) {
  const files = [];
  await visit(root, '');
  return files.sort();

  async function visit(directory, relative) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const childRelative = path.join(relative, entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute, childRelative);
      } else {
        files.push(childRelative.split(path.sep).join('/'));
      }
    }
  }
}

async function treeDigest(root) {
  const hash = createHash('sha256');
  for (const relative of await inventory(root)) {
    hash.update(relative);
    hash.update(await fs.readFile(path.join(root, relative)));
  }
  return hash.digest('hex');
}
