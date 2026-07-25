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
  intakeResidentialBatch
} from '../src/training/residential/intake/index.js';
import {
  classicSchematic,
  writeBatchFixture
} from './fixtures/residentialIntakeFixtures.js';

test('R2 validates first, preserves identities, and never auto-admits a house', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-e2e-'));
  t.after(() => removeFixture(projectRoot));
  await fs.mkdir(path.join(projectRoot, '.local'));
  const root = path.join(projectRoot, '.local', 'residential-model');
  await initializeResidentialWorkspace({ root, projectRoot });

  for (const batchId of ['batch-first', 'batch-duplicate']) {
    await initializeSourceBatch({
      root,
      projectRoot,
      batchId,
      sourceProject: 'fixture-project'
    });
    await writeBatchFixture({
      root,
      projectRoot,
      batchId,
      houseBytes: classicSchematic(),
      otherBytes: classicSchematic({ blockId: batchId === 'batch-first' ? 5 : 1 })
    });
  }

  const first = await intakeResidentialBatch({
    root,
    projectRoot,
    batchId: 'batch-first',
    clock: () => new Date('2026-07-24T15:00:00.000Z')
  });
  const second = await intakeResidentialBatch({
    root,
    projectRoot,
    batchId: 'batch-duplicate',
    clock: () => new Date('2026-07-24T15:01:00.000Z')
  });
  assert.ok(first.summary.source_profile_count > 0);
  assert.ok(second.summary.duplicate_count > 0);

  const profiles = await fs.readdir(path.join(root, 'sources'));
  for (const name of profiles) {
    const profile = JSON.parse(
      await fs.readFile(path.join(root, 'sources', name), 'utf8')
    );
    assert.notEqual(profile.status, 'eligible');
    assert.equal(profile.evidence.complete_residence, 'unknown');
  }
});

test('invalid inventory produces no quarantine, profile, or report writes', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-preflight-'));
  t.after(() => removeFixture(projectRoot));
  await fs.mkdir(path.join(projectRoot, '.local'));
  const root = path.join(projectRoot, '.local', 'residential-model');
  await initializeResidentialWorkspace({ root, projectRoot });
  const batch = await initializeSourceBatch({
    root,
    projectRoot,
    batchId: 'invalid-batch',
    sourceProject: 'fixture-project'
  });
  await fs.writeFile(
    path.join(batch.batch_path, 'houses', 'unlisted.schematic'),
    classicSchematic()
  );
  await assert.rejects(
    intakeResidentialBatch({
      root,
      projectRoot,
      batchId: 'invalid-batch'
    }),
    /SOURCE_BATCH_UNLISTED_PAYLOAD/u
  );
  assert.deepEqual(await fs.readdir(path.join(root, 'quarantine')), []);
  assert.deepEqual(await fs.readdir(path.join(root, 'sources')), []);
  assert.deepEqual(await fs.readdir(path.join(root, 'reports')), []);
});

async function removeFixture(root) {
  const entry = await fs.lstat(root).catch(() => null);
  if (entry?.isDirectory() && !entry.isSymbolicLink()) {
    await fs.chmod(root, 0o700);
    const entries = await fs.readdir(root, { withFileTypes: true });
    await Promise.all(entries.map((item) => removeFixture(path.join(root, item.name))));
  }
  await fs.rm(root, { recursive: true, force: true });
}
