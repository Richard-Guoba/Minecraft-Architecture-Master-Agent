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
  regionSchematic,
  vanillaStructure,
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

test('same-batch identical supported candidates reuse one exact identity and profile', async (t) => {
  const local = await fixture(t);
  const bytes = classicSchematic();
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001',
    houseBytes: bytes,
    otherBytes: bytes
  });
  const first = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001',
    clock: () => new Date('2026-07-24T14:00:00.000Z')
  });
  assert.deepEqual(
    first.candidates.map((item) => [item.outcome, item.reason]),
    [
      ['parsed', 'residential_candidate_requires_review'],
      ['duplicate', 'exact_duplicate']
    ]
  );
  assert.equal(first.candidates[1].case_id, first.candidates[0].case_id);
  assert.equal(
    first.candidates[1].source_profile_file,
    first.candidates[0].source_profile_file
  );
  assert.deepEqual(first.summary, {
    candidate_count: 2,
    quarantined_count: 2,
    parsed_count: 1,
    deferred_count: 0,
    rejected_count: 0,
    duplicate_count: 1,
    source_profile_count: 2
  });

  const reportPath = path.join(
    local.root,
    'reports',
    'intake-2026-07-24-fixture-001.json'
  );
  const before = await fs.readFile(reportPath);
  const rerun = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001',
    clock: () => { throw new Error('clock must not run for a recorded report'); }
  });
  assert.deepEqual(rerun, first);
  assert.deepEqual(await fs.readFile(reportPath), before);
});

test('same-batch pre-profile outcomes deduplicate before parsing again', async (t) => {
  const local = await fixture(t);
  const bytes = classicSchematic({
    width: 65,
    height: 1,
    length: 1,
    blocks: [1, ...Array(63).fill(0), 1]
  });
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001',
    houseBytes: bytes,
    otherBytes: bytes
  });
  const report = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001'
  });
  assert.deepEqual(
    report.candidates.map((item) => [
      item.outcome,
      item.reason,
      item.source_profile_file
    ]),
    [
      ['deferred', 'occupied_bounds_exceed_64', null],
      ['duplicate', 'exact_duplicate', null]
    ]
  );
  assert.equal(report.candidates[1].case_id, report.candidates[0].case_id);
});

test('long sparse regions defer before quarantine fingerprinting', async (t) => {
  const local = await fixture(t);
  const states = Array(65_536).fill(1);
  states[0] = 0;
  states[65_535] = 0;
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001',
    houseFilename: 'long-sparse.schem',
    houseBytes: regionSchematic({
      size: [65_536, 1, 1],
      palette: ['minecraft:stone', 'minecraft:air'],
      states
    })
  });
  const report = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001'
  });
  const candidate = report.candidates.find(
    (item) => item.submitted.relative_path === 'houses/long-sparse.schem'
  );
  assert.deepEqual(
    [candidate.outcome, candidate.reason, candidate.source_profile_file],
    ['deferred', 'occupied_bounds_exceed_64', null]
  );
  const caseRoot = path.join(local.root, 'quarantine', candidate.case_id);
  await assert.doesNotReject(fs.access(path.join(caseRoot, 'identity.json')));
  await assert.doesNotReject(fs.access(path.join(caseRoot, 'payload')));
  await assert.rejects(fs.access(path.join(caseRoot, 'fingerprint.json')));
});

test('same-batch malformed payloads deduplicate before parsing again', async (t) => {
  const local = await fixture(t);
  const bytes = Buffer.from('malformed nbt');
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001',
    houseBytes: bytes,
    otherBytes: bytes
  });
  const report = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001'
  });
  assert.deepEqual(
    report.candidates.map((item) => [
      item.outcome,
      item.reason,
      item.source_profile_file
    ]),
    [
      ['rejected', 'malformed_or_unsafe_source', null],
      ['duplicate', 'exact_duplicate', null]
    ]
  );
  assert.equal(report.candidates[1].case_id, report.candidates[0].case_id);
});

test('same-batch unsupported payloads deduplicate before format dispatch', async (t) => {
  const local = await fixture(t);
  const bytes = Buffer.from('unsupported litematic payload');
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001',
    houseFilename: 'Fixture House.litematic',
    otherFilename: 'Fixture Tower.litematic',
    houseBytes: bytes,
    otherBytes: bytes
  });
  const report = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001'
  });
  assert.deepEqual(
    report.candidates.map((item) => [
      item.outcome,
      item.reason,
      item.source_profile_file
    ]),
    [
      ['deferred', 'unsupported_format', null],
      ['duplicate', 'exact_duplicate', null]
    ]
  );
  assert.equal(report.candidates[1].case_id, report.candidates[0].case_id);
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

test('completed reports reject changed readable payloads without changing recorded outputs', async (t) => {
  const local = await fixture(t);
  const batchId = '2026-07-24-fixture-001';
  await writeBatchFixture({ ...local, batchId });
  await intakeResidentialBatch({ ...local, batchId });
  const reportPath = path.join(local.root, 'reports', `intake-${batchId}.json`);
  const housePath = path.join(
    local.root,
    'inbox',
    batchId,
    'houses',
    'Fixture House.schematic'
  );
  const reportBefore = await fs.readFile(reportPath);
  const sourcesBefore = await fs.readdir(path.join(local.root, 'sources'));
  const quarantineBefore = await fs.readdir(path.join(local.root, 'quarantine'));

  await fs.writeFile(housePath, classicSchematic({ blockId: 4 }));
  await assert.rejects(
    intakeResidentialBatch({ ...local, batchId }),
    /INTAKE_BATCH_ALREADY_RECORDED/u
  );
  assert.deepEqual(await fs.readFile(reportPath), reportBefore);
  assert.deepEqual(await fs.readdir(path.join(local.root, 'sources')), sourcesBefore);
  assert.deepEqual(
    await fs.readdir(path.join(local.root, 'quarantine')),
    quarantineBefore
  );
});

test('completed null-identity observations reject replacement by readable payloads', async (t) => {
  const local = await fixture(t);
  const batchId = '2026-07-24-fixture-001';
  await writeBatchFixture({ ...local, batchId });
  const housePath = path.join(
    local.root,
    'inbox',
    batchId,
    'houses',
    'Fixture House.schematic'
  );
  await fs.truncate(housePath, 64 * 1024 * 1024 + 1);
  const first = await intakeResidentialBatch({ ...local, batchId });
  const reportPath = path.join(local.root, 'reports', `intake-${batchId}.json`);
  const reportBefore = await fs.readFile(reportPath);

  assert.deepEqual(await intakeResidentialBatch({ ...local, batchId }), first);
  assert.deepEqual(await fs.readFile(reportPath), reportBefore);

  await fs.writeFile(housePath, classicSchematic({ blockId: 4 }));
  await assert.rejects(
    intakeResidentialBatch({ ...local, batchId }),
    /INTAKE_BATCH_ALREADY_RECORDED/u
  );
  assert.deepEqual(await fs.readFile(reportPath), reportBefore);
});

test('recorded intake reports must exactly match the current sorted inventory', async (t) => {
  const mutations = [
    {
      name: 'batch identity',
      apply(report) {
        report.batch_id = 'fabricated-batch';
      }
    },
    {
      name: 'source project identity',
      apply(report) {
        report.source_project = 'fabricated-project';
      }
    },
    {
      name: 'derived observation identifier',
      apply(report) {
        report.candidates[0].observation_id = 'observation-fabricated-001';
      }
    },
    {
      name: 'submitted candidate content',
      apply(report) {
        report.candidates[0].submitted.collector_note =
          'fabricated report-only note';
      }
    },
    {
      name: 'ordered candidate observations',
      apply(report) {
        report.candidates.reverse();
      }
    }
  ];
  for (const mutation of mutations) {
    const local = await fixture(t);
    await writeBatchFixture({
      ...local,
      batchId: '2026-07-24-fixture-001'
    });
    await intakeResidentialBatch({
      ...local,
      batchId: '2026-07-24-fixture-001'
    });
    const reportPath = path.join(
      local.root,
      'reports',
      'intake-2026-07-24-fixture-001.json'
    );
    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    mutation.apply(report);
    await fs.chmod(reportPath, 0o600);
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    await assert.rejects(
      intakeResidentialBatch({
        ...local,
        batchId: '2026-07-24-fixture-001'
      }),
      /INTAKE_BATCH_ALREADY_RECORDED/u,
      mutation.name
    );
  }
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

test('same-batch recovery rejects altered deterministic decision fields', async (t) => {
  const mutations = [
    {
      name: 'decision identifier',
      apply: (profile) => { profile.decisions[0].id = `decision-${'a'.repeat(24)}`; }
    },
    {
      name: 'inconsistent valid actor',
      apply: (profile) => { profile.decisions[1].actor = 'different-actor'; }
    },
    {
      name: 'timestamp sequence',
      apply: (profile) => { profile.decisions[1].at = '2026-07-24T14:00:00.002Z'; }
    }
  ];
  for (const mutation of mutations) {
    const local = await fixture(t);
    await writeBatchFixture({
      ...local,
      batchId: '2026-07-24-fixture-001',
      houseBytes: classicSchematic(),
      otherBytes: classicSchematic({ blockId: 5 })
    });
    await intakeResidentialBatch({
      ...local,
      batchId: '2026-07-24-fixture-001',
      clock: () => new Date('2026-07-24T14:00:00.000Z')
    });
    const sourceDirectory = path.join(local.root, 'sources');
    const profileEntry = (await Promise.all((await fs.readdir(sourceDirectory)).map(
      async (name) => ({
        name,
        value: JSON.parse(await fs.readFile(path.join(sourceDirectory, name), 'utf8'))
      })
    ))).find((entry) => entry.value.title === 'Fixture House');
    const profilePath = path.join(sourceDirectory, profileEntry.name);
    const profile = profileEntry.value;
    mutation.apply(profile);
    await fs.chmod(profilePath, 0o600);
    await fs.writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
    await fs.rm(path.join(
      local.root,
      'reports',
      'intake-2026-07-24-fixture-001.json'
    ));
    await assert.rejects(
      intakeResidentialBatch({
        ...local,
        batchId: '2026-07-24-fixture-001',
        clock: () => { throw new Error(`clock must not run for ${mutation.name}`); }
      }),
      /SOURCE_PROFILE_BATCH_RECOVERY_CONFLICT/u
    );
    await assert.rejects(fs.access(path.join(
      local.root,
      'reports',
      'intake-2026-07-24-fixture-001.json'
    )));
  }
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

test('vanilla entity overflow is quarantined then deferred as a parser limit', async (t) => {
  const local = await fixture(t);
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001',
    houseFilename: 'entity-overflow.nbt',
    houseBytes: vanillaStructure({
      entities: Array.from({ length: 16_385 }, () => ({}))
    })
  });
  const report = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001'
  });
  const overflow = report.candidates.find(
    (item) => item.submitted.relative_path === 'houses/entity-overflow.nbt'
  );
  assert.deepEqual(
    [
      overflow.outcome,
      overflow.reason,
      overflow.case_id !== null,
      overflow.artifact_sha256 !== null,
      overflow.source_profile_file
    ],
    ['deferred', 'parser_limit', true, true, null]
  );
});

test('raw byte overflow is deferred before quarantine with a null identity', async (t) => {
  const local = await fixture(t);
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001'
  });
  await fs.truncate(
    path.join(
      local.root,
      'inbox',
      '2026-07-24-fixture-001',
      'houses',
      'Fixture House.schematic'
    ),
    64 * 1024 * 1024 + 1
  );
  const report = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001'
  });
  const overflow = report.candidates.find(
    (item) => item.submitted.lane === 'houses'
  );
  assert.deepEqual(
    [
      overflow.outcome,
      overflow.reason,
      overflow.case_id,
      overflow.artifact_sha256,
      overflow.source_profile_file
    ],
    ['deferred', 'parser_limit', null, null, null]
  );
});
