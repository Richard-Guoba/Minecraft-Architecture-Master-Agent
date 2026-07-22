import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  EXPECTED_DATASET_HASHES
} from '../src/construction/learning/stage7PrivateResearchBoundary.js';
import {
  PilotPreflightError,
  runPilotPreflight
} from '../src/construction/learning/stage7PilotPreflight.js';
import {
  PublicNbtPilotCliError,
  parseStage7PublicNbtPilotArgs,
  runStage7PublicNbtPilotCli
} from '../src/runStage7PublicNbtPilot.js';
import { pilotBatchFixture, resignPilotBatch } from './fixtures/stage7PilotFixtures.js';

const ROOT = '.local/stage7-source-expansion';
const BATCH = 'manifests/named-batch.json';
const ACK = '--public-pilot-only';
const REVISION = 'f'.repeat(40);

function args(command, extra = []) {
  return [command, '--root', ROOT, '--batch', BATCH, ...extra, ACK];
}

function hasCode(Type, code) {
  return (error) => error instanceof Type && error.code === code;
}

test('parser accepts only four exact one-scope command shapes', () => {
  assert.deepEqual(parseStage7PublicNbtPilotArgs(args('validate-batch')), {
    command: 'validate-batch', root: ROOT, batch: BATCH,
    candidateId: null, input: null, publicPilotOnly: true
  });
  assert.deepEqual(parseStage7PublicNbtPilotArgs(args('run-candidate', [
    '--candidate-id', 'source-a:house-01'
  ])), {
    command: 'run-candidate', root: ROOT, batch: BATCH,
    candidateId: 'source-a:house-01', input: null, publicPilotOnly: true
  });
  assert.deepEqual(parseStage7PublicNbtPilotArgs(args('record-review', [
    '--candidate-id', 'source-a:house-01', '--input', 'reviews/pilot-review-input.json'
  ])), {
    command: 'record-review', root: ROOT, batch: BATCH,
    candidateId: 'source-a:house-01', input: 'reviews/pilot-review-input.json',
    publicPilotOnly: true
  });
  assert.equal(parseStage7PublicNbtPilotArgs(args('audit')).command, 'audit');
});

test('parser rejects duplicates, URL/run-all surfaces, alternate paths, and missing scope', () => {
  const invalid = [
    args('validate-batch', ['--root', ROOT]),
    args('run-all'),
    args('run-candidate', ['--url', 'https://example.test/file.nbt']),
    args('run-candidate'),
    args('validate-batch', ['--candidate-id', 'source-a:house-01']),
    args('audit', ['--candidate-id', 'source-a:house-01']),
    ['validate-batch', '--root', '.local/other', '--batch', BATCH, ACK],
    ['validate-batch', '--root', ROOT, '--batch', 'other.json', ACK],
    args('record-review', ['--candidate-id', 'source-a:house-01', '--input', 'other.json']),
    ['validate-batch', '--root', ROOT, '--batch', BATCH]
  ];
  for (const argv of invalid) {
    assert.throws(() => parseStage7PublicNbtPilotArgs(argv),
      (error) => error instanceof PublicNbtPilotCliError);
  }
});

test('preflight validates exact Git, private aggregate, Python count, Dataset, and date bindings', async (t) => {
  const fixture = await preflightFixture(t);
  const calls = [];
  const result = await runPilotPreflight({
    repositoryRoot: fixture.repositoryRoot,
    root: fixture.publicRoot,
    batchDocument: fixture.batch,
    today: '2026-07-20',
    execFileImpl: commandDouble(calls),
    assertDatasetBoundary: async () => ({
      dataset_hashes: EXPECTED_DATASET_HASHES,
      dataset_v3_gate: { ready_for_m3_real_data: false, training_eligible_count: 0 }
    })
  });
  assert.deepEqual(result, {
    git_head: REVISION,
    private_case_count: 22,
    run_directory_count: 3,
    dataset_hashes: EXPECTED_DATASET_HASHES,
    dataset_v3_gate: { ready_for_m3_real_data: false, training_eligible_count: 0 }
  });
  const python = calls.find(([command]) => command === 'conda');
  assert.deepEqual(python, ['conda', [
    'run', '-n', 'mcagent-stage7', '--cwd', 'training/stage7',
    'python', '-c',
    "from pathlib import Path; from mcagent_stage7.private_research import run_private_preflight; p=run_private_preflight(root=Path('../../.local/stage7-private-research'),repo_root=Path('../..')); print(p.case_count)"
  ], { cwd: fixture.repositoryRoot }]);
});

test('preflight drift stops before Python and exposes no private names', async (t) => {
  const fixture = await preflightFixture(t);
  await rm(join(fixture.privateRoot, 'prepared', 'case-21.voxels.bin'));
  const calls = [];
  await assert.rejects(runPilotPreflight({
    repositoryRoot: fixture.repositoryRoot,
    root: fixture.publicRoot,
    batchDocument: fixture.batch,
    today: '2026-07-20',
    execFileImpl: commandDouble(calls),
    assertDatasetBoundary: async () => ({
      dataset_hashes: EXPECTED_DATASET_HASHES,
      dataset_v3_gate: { ready_for_m3_real_data: false, training_eligible_count: 0 }
    })
  }), (error) => hasCode(PilotPreflightError, 'PRIVATE_AGGREGATE_DRIFT')(error)
    && !error.message.includes('case-21'));
  assert.equal(calls.some(([command]) => command === 'conda'), false);
});

test('preflight permits only a past descendant batch for review recovery', async (t) => {
  const descendantHead = 'a'.repeat(40);
  const fixture = await preflightFixture(t);
  const calls = [];
  const recovered = await runPilotPreflight({
    repositoryRoot: fixture.repositoryRoot,
    root: fixture.publicRoot,
    batchDocument: fixture.batch,
    today: '2026-07-21',
    reviewRecovery: true,
    execFileImpl: commandDouble(calls, { head: descendantHead, isAncestor: true }),
    assertDatasetBoundary: datasetBoundary
  });
  assert.equal(recovered.git_head, descendantHead);
  assert.deepEqual(calls.filter(([command, commandArgs]) =>
    command === 'git' && commandArgs[0] === 'merge-base'
  ), [[
    'git', ['merge-base', '--is-ancestor', fixture.batch.batch.code_revision, descendantHead],
    { cwd: fixture.repositoryRoot }
  ]]);

  const futureCalls = [];
  await assert.rejects(runPilotPreflight({
    repositoryRoot: fixture.repositoryRoot,
    root: fixture.publicRoot,
    batchDocument: batchForDate('2026-07-22'),
    today: '2026-07-21',
    reviewRecovery: true,
    execFileImpl: commandDouble(futureCalls, { head: descendantHead, isAncestor: true }),
    assertDatasetBoundary: datasetBoundary
  }), hasCode(PilotPreflightError, 'PREFLIGHT_DATE_DRIFT'));
  assert.equal(futureCalls.some(([command]) => command === 'conda'), false);

  const ancestryCalls = [];
  await assert.rejects(runPilotPreflight({
    repositoryRoot: fixture.repositoryRoot,
    root: fixture.publicRoot,
    batchDocument: fixture.batch,
    today: '2026-07-21',
    reviewRecovery: true,
    execFileImpl: commandDouble(ancestryCalls, { head: descendantHead, isAncestor: false }),
    assertDatasetBoundary: datasetBoundary
  }), hasCode(PilotPreflightError, 'GIT_HEAD_DRIFT'));
  assert.equal(ancestryCalls.some(([command]) => command === 'conda'), false);
});

test('CLI preflights validation without writes and mutating commands before and after writes', async () => {
  const batch = pilotBatchFixture();
  const calls = [];
  const context = cliContext(batch, calls);
  const validated = await runStage7PublicNbtPilotCli(args('validate-batch'), context);
  assert.equal(validated.command, 'validate-batch');
  assert.deepEqual(calls.map((call) => call[0]), ['read', 'preflight']);
  assert.equal(calls[1][1].reviewRecovery, false);

  calls.length = 0;
  const runResult = await runStage7PublicNbtPilotCli(args('run-candidate', [
    '--candidate-id', 'source-a:house-01'
  ]), context);
  assert.equal(runResult.candidate_id, 'source-a:house-01');
  assert.deepEqual(calls.map((call) => call[0]), [
    'read', 'preflight', 'layout', 'run', 'preflight'
  ]);
  assert.equal(calls.find((call) => call[0] === 'run')[1].candidateId, 'source-a:house-01');
  assert.equal(calls.filter((call) => call[0] === 'preflight')
    .every((call) => call[1].reviewRecovery === false), true);

  calls.length = 0;
  const review = await runStage7PublicNbtPilotCli(args('record-review', [
    '--candidate-id', 'source-a:house-01', '--input', 'reviews/pilot-review-input.json'
  ]), context);
  assert.equal(review.state, 'pilot_ready');
  assert.deepEqual(calls.map((call) => call[0]), [
    'read', 'preflight', 'layout', 'read-review', 'review', 'preflight'
  ]);
  assert.equal(calls.filter((call) => call[0] === 'preflight')
    .every((call) => call[1].reviewRecovery === true), true);

  calls.length = 0;
  const audited = await runStage7PublicNbtPilotCli(args('audit'), context);
  assert.equal(audited.ready_count, 5);
  assert.deepEqual(calls.map((call) => call[0]), [
    'read', 'preflight', 'layout', 'audit', 'preflight'
  ]);
  assert.equal(calls.filter((call) => call[0] === 'preflight')
    .every((call) => call[1].reviewRecovery === false), true);
});

test('CLI always postflights a failed mutation and returns only safe summary fields', async () => {
  const batch = pilotBatchFixture();
  const calls = [];
  const context = cliContext(batch, calls);
  context.runCandidate = async (input) => {
    calls.push(['run', input]);
    throw new Error('synthetic failure');
  };
  await assert.rejects(runStage7PublicNbtPilotCli(args('run-candidate', [
    '--candidate-id', 'source-a:house-01'
  ]), context));
  assert.deepEqual(calls.map((call) => call[0]), [
    'read', 'preflight', 'layout', 'run', 'preflight'
  ]);
});

function cliContext(batch, calls) {
  const review = { candidate_id: 'source-a:house-01', reviewed_at: '2026-07-20T14:00:00.000Z' };
  return {
    repositoryRoot: '/synthetic/repository',
    readJson: async (_root, relative) => {
      calls.push([relative === BATCH ? 'read' : 'read-review', relative]);
      return relative === BATCH ? batch : review;
    },
    preflight: async (input) => {
      calls.push(['preflight', input]);
      return { git_head: REVISION };
    },
    ensureLayout: async (root) => { calls.push(['layout', root]); },
    runCandidate: async (input) => {
      calls.push(['run', input]);
      return {
        candidate_id: input.candidateId,
        state: 'fingerprinted', terminal: false,
        token_counts: Array(9).fill(0), duplicate_proposals: [],
        authorizes_training: false, authorizes_dataset_admission: false
      };
    },
    finalizeCandidate: async (input) => {
      calls.push(['review', input]);
      return {
        candidate_id: input.reviewRecord.candidate_id,
        state: 'pilot_ready', terminal: false,
        authorizes_training: false, authorizes_dataset_admission: false
      };
    },
    audit: async (input) => {
      calls.push(['audit', input]);
      return {
        ready_count: 5, terminal_count: 0, complete: true,
        authorizes_training: false, authorizes_dataset_admission: false
      };
    },
    now: () => '2026-07-20T13:00:00.000Z'
  };
}

async function preflightFixture(t) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'stage7-pilot-preflight-'));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const publicRoot = join(repositoryRoot, ROOT);
  const privateRoot = join(repositoryRoot, '.local', 'stage7-private-research');
  await mkdir(publicRoot, { recursive: true });
  for (const relative of [
    'source', 'deferred/oversized', 'manifests', 'prepared', 'splits', 'runs'
  ]) await mkdir(join(privateRoot, relative), { recursive: true });
  await writeFile(join(privateRoot, 'PRIVATE_RESEARCH_ACK.json'), JSON.stringify({
    scope: 'stage7-private-research-only',
    distribution_prohibited: true,
    dataset_v3_unchanged: true,
    m4_apply_mode_unchanged: true
  }));
  for (let index = 0; index < 22; index += 1) {
    await writeFile(join(privateRoot, 'source', `source-${index}.schematic`), '');
    await writeFile(join(privateRoot, 'prepared', `case-${index}.voxels.bin`), Buffer.alloc(64 ** 3));
  }
  for (let index = 0; index < 42; index += 1) {
    await writeFile(join(privateRoot, 'deferred', 'oversized', `large-${index}.schematic`), '');
  }
  await writeFile(join(privateRoot, 'manifests', 'sources.jsonl'), '{}\n'.repeat(22));
  await writeFile(join(privateRoot, 'manifests', 'prepared.jsonl'), '{}\n'.repeat(22));
  await writeFile(join(privateRoot, 'splits', 'split.json'), JSON.stringify({
    train_case_ids: Array.from({ length: 15 }, (_, index) => `train-${index}`),
    validation_case_ids: Array.from({ length: 7 }, (_, index) => `validation-${index}`)
  }));
  for (let index = 0; index < 3; index += 1) {
    await mkdir(join(privateRoot, 'runs', `run-${index}`));
  }
  return { repositoryRoot, publicRoot, privateRoot, batch: pilotBatchFixture() };
}

const datasetBoundary = async () => ({
  dataset_hashes: EXPECTED_DATASET_HASHES,
  dataset_v3_gate: { ready_for_m3_real_data: false, training_eligible_count: 0 }
});

function batchForDate(asOf) {
  const batch = pilotBatchFixture();
  batch.batch.as_of = asOf;
  for (const candidate of batch.batch.candidates) candidate.rights.verified_at = asOf;
  return resignPilotBatch(batch);
}

function commandDouble(calls, { head = REVISION, isAncestor = true } = {}) {
  return async (command, commandArgs, options) => {
    calls.push([command, commandArgs, options]);
    if (command === 'conda') return { stdout: '22\n', stderr: '' };
    const joined = commandArgs.join(' ');
    if (joined === 'status --porcelain=v1 --untracked-files=no') {
      return { stdout: '', stderr: '' };
    }
    if (joined === 'branch --show-current') {
      return { stdout: 'codex/stage7-dataset-v3-extraction\n', stderr: '' };
    }
    if (joined === 'rev-parse HEAD') return { stdout: `${head}\n`, stderr: '' };
    if (commandArgs[0] === 'merge-base') {
      if (isAncestor) return { stdout: '', stderr: '' };
      throw Object.assign(new Error('not-descendant'), { code: 1, stdout: '', stderr: '' });
    }
    if (commandArgs[0] === 'check-ignore') return { stdout: '', stderr: '' };
    if (commandArgs[0] === 'ls-files') {
      throw Object.assign(new Error('untracked'), { code: 1, stdout: '', stderr: '' });
    }
    throw new Error(`unexpected command: ${command} ${joined}`);
  };
}
