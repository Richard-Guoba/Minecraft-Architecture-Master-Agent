import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  initializeResidentialWorkspace
} from '../src/training/residential/workspace/index.js';
import {
  initializeSourceBatch,
  inventorySourceBatch
} from '../src/training/residential/intake/index.js';
import {
  validSourceBatchManifestFixture
} from './fixtures/residentialContractFixtures.js';

async function fixture(t) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-batch-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  await fs.mkdir(path.join(projectRoot, '.local'));
  const root = path.join(projectRoot, '.local', 'residential-model');
  await initializeResidentialWorkspace({ root, projectRoot });
  return { projectRoot, root };
}

test('batch initialization is atomic and creates exactly two lanes', async (t) => {
  const local = await fixture(t);
  const first = await initializeSourceBatch({
    ...local,
    batchId: '2026-07-24-fixture-001',
    sourceProject: 'fixture-project'
  });
  const second = await initializeSourceBatch({
    ...local,
    batchId: '2026-07-24-fixture-001',
    sourceProject: 'fixture-project'
  });
  assert.deepEqual(second, first);
  assert.deepEqual(
    await fs.readdir(first.batch_path),
    ['batch-manifest.json', 'houses', 'other-architecture']
  );
  assert.deepEqual(first.manifest.candidates, []);
});

test('inventory requires listed regular files and rejects unlisted payloads', async (t) => {
  const local = await fixture(t);
  const initialized = await initializeSourceBatch({
    ...local,
    batchId: '2026-07-24-fixture-001',
    sourceProject: 'fixture-project'
  });
  const manifest = validSourceBatchManifestFixture();
  await fs.writeFile(
    path.join(initialized.batch_path, 'batch-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
  await fs.writeFile(
    path.join(initialized.batch_path, manifest.candidates[0].relative_path),
    'house'
  );
  await fs.writeFile(
    path.join(initialized.batch_path, manifest.candidates[1].relative_path),
    'tower'
  );
  const inventory = await inventorySourceBatch({
    ...local,
    batchId: manifest.batch_id
  });
  assert.deepEqual(
    inventory.candidates.map((item) => item.relative_path),
    manifest.candidates.map((item) => item.relative_path).sort()
  );

  await fs.writeFile(
    path.join(initialized.batch_path, 'houses', 'unlisted.schem'),
    'unlisted'
  );
  await assert.rejects(
    inventorySourceBatch({ ...local, batchId: manifest.batch_id }),
    /SOURCE_BATCH_UNLISTED_PAYLOAD/u
  );
});

test('inventory rejects missing files, symlinks, and unknown root entries before writes', async (t) => {
  const local = await fixture(t);
  const initialized = await initializeSourceBatch({
    ...local,
    batchId: '2026-07-24-fixture-001',
    sourceProject: 'fixture-project'
  });
  const manifest = validSourceBatchManifestFixture();
  await fs.writeFile(
    path.join(initialized.batch_path, 'batch-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
  await fs.writeFile(
    path.join(initialized.batch_path, manifest.candidates[1].relative_path),
    'tower'
  );
  await fs.symlink(
    manifest.candidates[1].relative_path,
    path.join(initialized.batch_path, manifest.candidates[0].relative_path)
  );
  await assert.rejects(
    inventorySourceBatch({ ...local, batchId: manifest.batch_id }),
    /SOURCE_BATCH_SYMLINK/u
  );
  await fs.unlink(
    path.join(initialized.batch_path, manifest.candidates[0].relative_path)
  );
  await fs.mkdir(path.join(initialized.batch_path, 'modern'));
  await assert.rejects(
    inventorySourceBatch({ ...local, batchId: manifest.batch_id }),
    /SOURCE_BATCH_ROOT_ENTRY_INVALID/u
  );
});
