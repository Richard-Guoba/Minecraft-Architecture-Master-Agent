import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  initializeResidentialWorkspace
} from '../src/training/residential/workspace/index.js';
import {
  auditLegacyTemplates,
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
  const identitiesBeforeDuplicate = await snapshotFiles(path.join(root, 'quarantine'));
  const profilesBeforeDuplicate = await snapshotFiles(path.join(root, 'sources'));
  const second = await intakeResidentialBatch({
    root,
    projectRoot,
    batchId: 'batch-duplicate',
    clock: () => new Date('2026-07-24T15:01:00.000Z')
  });
  assert.ok(first.summary.source_profile_count > 0);
  assert.ok(second.summary.duplicate_count > 0);

  const duplicate = second.candidates.find((candidate) => (
    candidate.outcome === 'duplicate' && candidate.reason === 'exact_duplicate'
  ));
  assert.ok(duplicate, 'the second batch must contain an exact duplicate observation');
  const firstObservation = first.candidates.find((candidate) => (
    candidate.artifact_sha256 === duplicate.artifact_sha256
  ));
  assert.ok(firstObservation, 'the duplicate must refer to a first-batch observation');
  assert.equal(duplicate.case_id, firstObservation.case_id);
  assert.equal(duplicate.source_profile_file, firstObservation.source_profile_file);
  assert.deepEqual(
    await snapshotFiles(path.join(root, 'quarantine')),
    identitiesBeforeDuplicate
  );
  assert.deepEqual(
    await snapshotFiles(path.join(root, 'sources')),
    profilesBeforeDuplicate
  );

  await assertUnknownEvidenceProfiles(root);
});

test('R2 legacy audit is read-only and confines every audit output to local storage', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-audit-e2e-'));
  t.after(() => removeFixture(projectRoot));
  await fs.mkdir(path.join(projectRoot, '.local'));
  const root = path.join(projectRoot, '.local', 'residential-model');
  await initializeResidentialWorkspace({ root, projectRoot });
  await initializeSourceBatch({
    root,
    projectRoot,
    batchId: 'new-source-batch',
    sourceProject: 'fixture-project'
  });
  await writeBatchFixture({
    root,
    projectRoot,
    batchId: 'new-source-batch'
  });
  await intakeResidentialBatch({
    root,
    projectRoot,
    batchId: 'new-source-batch',
    clock: () => new Date('2026-07-24T16:00:00.000Z')
  });
  await assertUnknownEvidenceProfiles(root);

  const legacyRoot = path.join(projectRoot, 'mc_templates');
  await fs.mkdir(path.join(legacyRoot, 'House'), { recursive: true });
  await fs.mkdir(path.join(legacyRoot, 'Tower'), { recursive: true });
  await fs.writeFile(
    path.join(legacyRoot, 'House', 'Legacy House.schematic'),
    classicSchematic({ blockId: 3 })
  );
  await fs.writeFile(
    path.join(legacyRoot, 'Tower', 'Legacy Tower.schematic'),
    classicSchematic({ blockId: 4 })
  );

  const legacyBefore = await snapshotFiles(legacyRoot);
  const quarantineBefore = await snapshotFiles(path.join(root, 'quarantine'));
  const profilesBefore = await snapshotFiles(path.join(root, 'sources'));
  const projectBefore = await snapshotFiles(projectRoot);
  const report = await auditLegacyTemplates({ root, projectRoot });
  const legacyAfter = await snapshotFiles(legacyRoot);
  const projectAfter = await snapshotFiles(projectRoot);

  assert.equal(legacyBefore.length, 2);
  assert.deepEqual(legacyAfter, legacyBefore);
  assert.deepEqual(
    await snapshotFiles(path.join(root, 'quarantine')),
    quarantineBefore
  );
  assert.deepEqual(await snapshotFiles(path.join(root, 'sources')), profilesBefore);
  assert.equal(report.summary.candidate_count, 2);
  const createdPaths = addedPaths(projectBefore, projectAfter);
  assert.deepEqual(createdPaths, [
    '.local/residential-model/reports/legacy-audit.json'
  ]);
  assert.ok(createdPaths.every((relativePath) => (
    relativePath.startsWith('.local/residential-model/')
  )));
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

async function snapshotFiles(root, relative = '') {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const child = path.join(root, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      files.push(...await snapshotFiles(child, childRelative));
      continue;
    }
    if (entry.isFile() && !entry.isSymbolicLink()) {
      files.push(Object.freeze({
        relative_path: childRelative,
        bytes: (await fs.readFile(child)).toString('base64')
      }));
      continue;
    }
    files.push(Object.freeze({ relative_path: childRelative, kind: 'unsafe' }));
  }
  return files;
}

function addedPaths(before, after) {
  const previous = new Set(before.map((entry) => entry.relative_path));
  return after
    .map((entry) => entry.relative_path)
    .filter((relativePath) => !previous.has(relativePath));
}

async function assertUnknownEvidenceProfiles(root) {
  const profiles = await fs.readdir(path.join(root, 'sources'));
  for (const name of profiles) {
    const profile = JSON.parse(
      await fs.readFile(path.join(root, 'sources', name), 'utf8')
    );
    assert.notEqual(profile.status, 'eligible');
    assert.deepEqual(profile.evidence, {
      complete_residence: 'unknown',
      furnished: 'unknown',
      survival_core: 'unknown',
      supported_content: 'unknown'
    });
  }
}
