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

async function fixture(t) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-intake-'));
  t.after(() => removeFixture(projectRoot));
  await fs.mkdir(path.join(projectRoot, '.local'));
  const root = path.join(projectRoot, '.local', 'residential-model');
  await initializeResidentialWorkspace({ root, projectRoot });
  await initializeSourceBatch({
    root,
    projectRoot,
    batchId: '2026-07-24-fixture-001',
    sourceProject: 'fixture-project'
  });
  return { projectRoot, root };
}

async function removeFixture(root) {
  const entry = await fs.lstat(root).catch(() => null);
  if (entry?.isDirectory() && !entry.isSymbolicLink()) {
    await fs.chmod(root, 0o700);
    const entries = await fs.readdir(root, { withFileTypes: true });
    await Promise.all(entries.map((item) => removeFixture(path.join(root, item.name))));
  }
  await fs.rm(root, { recursive: true, force: true });
}

test('batch intake leaves house evidence unknown and defers other architecture', async (t) => {
  const local = await fixture(t);
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001',
    houseBytes: classicSchematic(),
    otherBytes: classicSchematic({ blockId: 5 })
  });
  const report = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001',
    clock: () => new Date('2026-07-24T14:00:00.000Z')
  });
  assert.equal(report.summary.parsed_count, 1);
  assert.equal(report.summary.deferred_count, 1);

  const profiles = await fs.readdir(path.join(local.root, 'sources'));
  assert.equal(profiles.length, 2);
  const values = await Promise.all(
    profiles.map(async (name) => JSON.parse(
      await fs.readFile(path.join(local.root, 'sources', name), 'utf8')
    ))
  );
  const house = values.find((item) => item.title.includes('House'));
  const other = values.find((item) => item.title.includes('Tower'));
  const fingerprint = JSON.parse(await fs.readFile(
    path.join(local.root, 'quarantine', house.case_id, 'fingerprint.json'),
    'utf8'
  ));
  assert.equal(house.status, 'parsed');
  assert.deepEqual(house.evidence, {
    complete_residence: 'unknown',
    furnished: 'unknown',
    survival_core: 'unknown',
    supported_content: 'unknown'
  });
  assert.equal(other.status, 'deferred');
  assert.equal(fingerprint.yaw_canonical_sha256, house.fingerprints.structural_sha256);
  assert.equal(
    other.decisions.at(-1).reason,
    'non_residential_reference_only'
  );
  assert.equal(values.some((item) => item.status === 'eligible'), false);
});

test('unchanged intake rerun returns byte-identical report and no new decisions', async (t) => {
  const local = await fixture(t);
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001',
    houseBytes: classicSchematic(),
    otherBytes: classicSchematic({ blockId: 5 })
  });
  const first = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001',
    clock: () => new Date('2026-07-24T14:00:00.000Z')
  });
  const before = await fs.readFile(
    path.join(local.root, 'reports', 'intake-2026-07-24-fixture-001.json')
  );
  const second = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001',
    clock: () => new Date('2030-01-01T00:00:00.000Z')
  });
  const after = await fs.readFile(
    path.join(local.root, 'reports', 'intake-2026-07-24-fixture-001.json')
  );
  assert.deepEqual(second, first);
  assert.deepEqual(after, before);
});

test('unsupported and oversized candidates are preserved without fabricated profiles', async (t) => {
  const local = await fixture(t);
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001',
    houseFilename: 'future-house.litematic',
    houseBytes: Buffer.from('unsupported'),
    otherBytes: classicSchematic({
      width: 65,
      height: 1,
      length: 1,
      blocks: [1, ...Array(63).fill(0), 1]
    })
  });
  const report = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001'
  });
  assert.deepEqual(
    report.candidates.map((item) => item.reason).sort(),
    ['occupied_bounds_exceed_64', 'unsupported_format']
  );
  assert.equal(report.summary.source_profile_count, 0);
  assert.equal(report.summary.quarantined_count, 2);
});

test('a completed batch ID cannot be reused with changed manifest content', async (t) => {
  const local = await fixture(t);
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001',
    houseBytes: classicSchematic(),
    otherBytes: classicSchematic({ blockId: 5 })
  });
  await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001'
  });
  const manifestFile = path.join(
    local.root,
    'inbox',
    '2026-07-24-fixture-001',
    'batch-manifest.json'
  );
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  manifest.candidates[0].collector_note = 'changed after intake';
  await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  await assert.rejects(
    intakeResidentialBatch({
      ...local,
      batchId: '2026-07-24-fixture-001'
    }),
    /INTAKE_BATCH_ALREADY_RECORDED/u
  );
});

test('same-batch interruption recovers the immutable profile outcome without a new clock call', async (t) => {
  const local = await fixture(t);
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001',
    houseBytes: classicSchematic(),
    otherBytes: classicSchematic({ blockId: 5 })
  });
  const first = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001',
    clock: () => new Date('2026-07-24T14:00:00.000Z')
  });
  const reportPath = path.join(
    local.root,
    'reports',
    'intake-2026-07-24-fixture-001.json'
  );
  const before = await fs.readFile(reportPath);
  await fs.rm(reportPath);
  const recovered = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001',
    clock: () => { throw new Error('clock must not run during recovery'); }
  });
  assert.deepEqual(recovered, first);
  assert.deepEqual(await fs.readFile(reportPath), before);
});

test('a prior unsupported observation prevents a later duplicate from fabricating a profile', async (t) => {
  const local = await fixture(t);
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001',
    houseFilename: 'future-house.litematic',
    houseBytes: Buffer.from('same unsupported artifact')
  });
  await intakeResidentialBatch({ ...local, batchId: '2026-07-24-fixture-001' });

  await initializeSourceBatch({
    ...local,
    batchId: '2026-07-24-fixture-002',
    sourceProject: 'fixture-project'
  });
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-002',
    houseFilename: 'future-house.litematic',
    houseBytes: Buffer.from('same unsupported artifact')
  });
  const report = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-002'
  });
  const duplicate = report.candidates.find((item) => (
    item.submitted.relative_path === 'houses/future-house.litematic'
  ));
  assert.equal(duplicate.outcome, 'duplicate');
  assert.equal(duplicate.reason, 'exact_duplicate');
  assert.equal(duplicate.source_profile_file, null);
});

test('parser bounds limits defer a quarantined artifact and malformed input is rejected', async (t) => {
  const local = await fixture(t);
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001',
    houseFilename: 'too-large.schematic',
    houseBytes: classicSchematic({ width: 4097, height: 4097, length: 1, blocks: [1] }),
    otherFilename: 'malformed.schematic',
    otherBytes: Buffer.from('not an NBT document')
  });
  const report = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001'
  });
  assert.deepEqual(
    report.candidates.map((item) => [item.outcome, item.reason]).sort(),
    [
      ['deferred', 'parser_limit'],
      ['rejected', 'malformed_or_unsafe_source']
    ]
  );
  assert.equal(report.summary.quarantined_count, 2);
  assert.equal(report.summary.source_profile_count, 0);
});
