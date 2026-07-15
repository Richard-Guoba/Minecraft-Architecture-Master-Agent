import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { importPrivateSources, preparePrivateCorpus } from '../src/construction/learning/stage7PrivateResearchCorpus.js';

const ROOT = path.resolve('.tmp/stage7-private-research-corpus-test');
const OBTAINED_AT = '2026-07-15T00:00:00.000Z';

test('private corpus imports a synthetic schematic with local-only provenance and permits an idempotent re-import', async () => {
  await resetRoot();
  await fs.writeFile(path.join(ROOT, 'source', 'small-house.schematic'), syntheticSchematic());

  const first = await importPrivateSources({ cwd: process.cwd(), root: ROOT, obtainedAt: OBTAINED_AT, sourceUrl: '' });
  const second = await importPrivateSources({ cwd: process.cwd(), root: ROOT, obtainedAt: OBTAINED_AT, sourceUrl: '' });

  assert.equal(first.records.length, 1);
  assert.deepEqual(second.records, first.records);
  assert.equal(first.records[0].rights_state, 'unverified');
  assert.equal(first.records[0].distribution, 'prohibited');
  assert.equal(first.records[0].purpose, 'local-private-research-only');
  assert.deepEqual(first.records[0].dimensions, { x: 2, y: 2, z: 2 });
});

test('private corpus prepares a centered 64-cube and deterministic source-group split', async () => {
  await resetRoot();
  await fs.mkdir(path.join(ROOT, 'prepared'), { recursive: true });
  await fs.mkdir(path.join(ROOT, 'splits'), { recursive: true });
  await fs.writeFile(path.join(ROOT, 'source', 'small-house.schematic'), syntheticSchematic());
  await importPrivateSources({ cwd: process.cwd(), root: ROOT, obtainedAt: OBTAINED_AT, sourceUrl: '' });

  const first = await preparePrivateCorpus({ cwd: process.cwd(), root: ROOT, splitSeed: 7101 });
  const second = await preparePrivateCorpus({ cwd: process.cwd(), root: ROOT, splitSeed: 7101 });
  const sidecar = JSON.parse(await fs.readFile(path.join(ROOT, first.records[0].metadata_path), 'utf8'));
  const voxels = await fs.readFile(path.join(ROOT, first.records[0].voxel_path));

  assert.deepEqual(second, first);
  assert.equal(first.records.length, 1);
  assert.deepEqual(first.records[0].shape, [64, 64, 64]);
  assert.equal(voxels.length, 64 ** 3);
  assert.equal(sidecar.taxonomy_version, 'private-raw-material-family-v1');
  assert.equal(voxels[31 * 64 * 64 + 31 * 64 + 31], 2);
  assert.deepEqual(first.split.case_ids, [first.records[0].source_id]);
});

async function resetRoot() {
  await fs.rm(ROOT, { recursive: true, force: true });
  await fs.mkdir(path.join(ROOT, 'source'), { recursive: true });
  await fs.mkdir(path.join(ROOT, 'manifests'), { recursive: true });
  await fs.writeFile(path.join(ROOT, 'PRIVATE_RESEARCH_ACK.json'), `${JSON.stringify({
    scope: 'stage7-private-research-only',
    distribution_prohibited: true,
    dataset_v3_unchanged: true,
    m4_apply_mode_unchanged: true,
    acknowledged_at: OBTAINED_AT,
    acknowledged_by: 'test-owner'
  })}\n`);
}

function syntheticSchematic() {
  const shortTag = (name, value) => Buffer.concat([Buffer.from([2, 0, name.length]), Buffer.from(name), Buffer.from([value >> 8, value & 0xff])]);
  const byteArrayTag = (name, values) => {
    const length = Buffer.alloc(4); length.writeInt32BE(values.length);
    return Buffer.concat([Buffer.from([7, 0, name.length]), Buffer.from(name), length, Buffer.from(values)]);
  };
  return Buffer.concat([
    Buffer.from([10, 0, 0]),
    shortTag('Width', 2), shortTag('Height', 2), shortTag('Length', 2),
    byteArrayTag('Blocks', [1, 0, 0, 0, 0, 0, 0, 0]),
    Buffer.from([0])
  ]);
}
