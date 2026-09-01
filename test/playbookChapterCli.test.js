import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  advanceEpisodeStage,
  createChapterLedger,
  readChapterLedger
} from '../src/playbook/course/chapterLedger.js';
import { stableJson } from '../src/playbook/shadow/canonical.js';
import { runChapterCli } from '../src/runArchitecturePlaybookChapter.js';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const COURSE_MANIFEST = await readJson(path.join(
  ROOT,
  'docs/architecture-playbook/course/course-manifest.json'
));
const CHAPTER_PLAN = await readJson(path.join(
  ROOT,
  'docs/architecture-playbook/course/chapter-plan-v1.json'
));
const LEDGER_RELATIVE_PATH =
  '.local/architecture-playbook/work/p7/chapter-ledger.json';
const FIRST_CHAPTER = 'foundations-tools-blocks-modularity-color';
const FIRST_BVID = 'BV1guoPYkExk';
const SECOND_BVID = 'BV1aBV1zwELe';
const HASH = 'a'.repeat(64);
const MEDIA_BYTES = Buffer.from('chapter-cli-media-fixture');
const MEDIA_SHA256 = createHash('sha256').update(MEDIA_BYTES).digest('hex');
const STAGES = [
  'pending',
  'media-verified',
  'asr-complete',
  'events-indexed',
  'visual-reviewed',
  'evidence-packed',
  'notes-reviewed',
  'rules-reviewed'
];
const EVIDENCE_BY_STAGE = {
  'media-verified': { media_sha256: HASH, byte_size: 1234 },
  'asr-complete': { segment_index_sha256: 'b'.repeat(64), segment_count: 41 },
  'events-indexed': { event_index_sha256: 'c'.repeat(64), event_count: 7 },
  'visual-reviewed': { visual_review_sha256: 'd'.repeat(64), reviewed_frame_count: 7 },
  'evidence-packed': { evidence_pack_sha256: 'e'.repeat(64), evidence_count: 12 },
  'notes-reviewed': { notes_sha256: 'f'.repeat(64), note_count: 9 },
  'rules-reviewed': { rules_sha256: '1'.repeat(64), rule_count: 4 }
};

test('chapter status reports exact counts without private data', async (t) => {
  const fixture = await chapterFixture(t);
  const before = await fileIdentity(fixture.ledgerPath);

  const result = await runChapterCli([
    'status',
    '--chapter',
    FIRST_CHAPTER
  ], fixture.deps);

  assert.deepEqual(result, {
    chapter_id: FIRST_CHAPTER,
    episode_count: 7,
    completed_count: 0,
    remaining_count: 7,
    next_bvid: FIRST_BVID,
    next_stage: 'media-verified'
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.doesNotMatch(JSON.stringify(result), /\.local|transcript|https?:|\/tmp\//u);
  assert.deepEqual(await fileIdentity(fixture.ledgerPath), before);
});

test('global status is deterministic in checked-in chapter order', async (t) => {
  const fixture = await chapterFixture(t);

  assert.deepEqual(await runChapterCli(['status'], fixture.deps), {
    chapter_count: 8,
    episode_count: 50,
    completed_count: 0,
    remaining_count: 50,
    next_chapter_id: FIRST_CHAPTER,
    next_bvid: FIRST_BVID,
    next_stage: 'media-verified'
  });
});

test('init creates a missing ledger and exposes only the public global summary', async (t) => {
  const fixture = await chapterFixture(t, { create: false });

  const result = await runChapterCli(['init'], fixture.deps);

  assert.deepEqual(result, {
    status: 'created',
    chapter_count: 8,
    episode_count: 50,
    completed_count: 0,
    remaining_count: 50,
    next_chapter_id: FIRST_CHAPTER,
    next_bvid: FIRST_BVID,
    next_stage: 'media-verified'
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.doesNotMatch(
    JSON.stringify(result),
    /ledger_sha256|chapter_plan_sha256|\.local|transcript|https?:|\/tmp\//u
  );
  assert.deepEqual(await runChapterCli(['status'], fixture.deps), {
    chapter_count: 8,
    episode_count: 50,
    completed_count: 0,
    remaining_count: 50,
    next_chapter_id: FIRST_CHAPTER,
    next_bvid: FIRST_BVID,
    next_stage: 'media-verified'
  });
});

test('init preserves an existing progressed ledger without resetting or advancing it', async (t) => {
  const fixture = await chapterFixture(t);
  await advanceEpisodeStage({
    projectRoot: fixture.projectRoot,
    bvid: FIRST_BVID,
    expectedLedgerSha256: fixture.created.ledger_sha256,
    expectedStage: 'pending',
    nextStage: 'media-verified',
    evidence: EVIDENCE_BY_STAGE['media-verified']
  });
  const before = await fileIdentity(fixture.ledgerPath);

  const result = await runChapterCli(['init'], fixture.deps);

  assert.deepEqual(result, {
    status: 'unchanged',
    chapter_count: 8,
    episode_count: 50,
    completed_count: 0,
    remaining_count: 50,
    next_chapter_id: FIRST_CHAPTER,
    next_bvid: FIRST_BVID,
    next_stage: 'asr-complete'
  });
  assert.deepEqual(await fileIdentity(fixture.ledgerPath), before);
  assert.deepEqual(await runChapterCli([
    'next',
    '--chapter',
    FIRST_CHAPTER
  ], fixture.deps), {
    chapter_id: FIRST_CHAPTER,
    bvid: FIRST_BVID,
    current_stage: 'media-verified',
    next_stage: 'asr-complete',
    command: `npm run playbook:evidence -- transcribe --bvid ${FIRST_BVID}`
  });
});

test('concurrent init calls safely publish one ledger without exposing internals', async (t) => {
  const fixture = await chapterFixture(t, { create: false });

  const results = await Promise.all([
    runChapterCli(['init'], fixture.deps),
    runChapterCli(['init'], fixture.deps)
  ]);

  assert.deepEqual(results.map((result) => result.status).sort(), [
    'created',
    'unchanged'
  ]);
  for (const result of results) {
    assert.deepEqual(Object.keys(result).sort(), [
      'chapter_count',
      'completed_count',
      'episode_count',
      'next_bvid',
      'next_chapter_id',
      'next_stage',
      'remaining_count',
      'status'
    ]);
    assert.doesNotMatch(
      JSON.stringify(result),
      /ledger_sha256|chapter_plan_sha256|\.local|transcript|https?:|\/tmp\//u
    );
  }
  assert.deepEqual(await runChapterCli(['status'], fixture.deps), {
    chapter_count: 8,
    episode_count: 50,
    completed_count: 0,
    remaining_count: 50,
    next_chapter_id: FIRST_CHAPTER,
    next_bvid: FIRST_BVID,
    next_stage: 'media-verified'
  });
});

test('init fails closed on corrupt and source-drifted existing ledgers', async (t) => {
  const corrupt = await chapterFixture(t);
  const corruptBytes = Buffer.from(
    '{"transcript_text":"secret","source_path":"/tmp/private-source"}\n'
  );
  await fs.writeFile(corrupt.ledgerPath, corruptBytes);
  await assertSafeRejection(
    runChapterCli(['init'], corrupt.deps),
    'PLAYBOOK_CHAPTER_LEDGER_INVALID',
    corrupt.projectRoot
  );
  assert.deepEqual(await fs.readFile(corrupt.ledgerPath), corruptBytes);

  const drifted = await chapterFixture(t);
  const driftedLedger = await readJson(drifted.ledgerPath);
  driftedLedger.chapter_plan_sha256 = '0'.repeat(64);
  await fs.writeFile(drifted.ledgerPath, stableJson(driftedLedger));
  const before = await fileIdentity(drifted.ledgerPath);
  await assertSafeRejection(
    runChapterCli(['init'], drifted.deps),
    'PLAYBOOK_CHAPTER_SOURCE_DRIFT',
    drifted.projectRoot
  );
  assert.deepEqual(await fileIdentity(drifted.ledgerPath), before);
});

test('next returns the exact existing evidence command without advancing state', async (t) => {
  const fixture = await chapterFixture(t);
  const before = await fileIdentity(fixture.ledgerPath);

  const result = await runChapterCli([
    'next',
    '--chapter',
    FIRST_CHAPTER
  ], fixture.deps);

  assert.deepEqual(result, {
    chapter_id: FIRST_CHAPTER,
    bvid: FIRST_BVID,
    current_stage: 'pending',
    next_stage: 'media-verified',
    command: `npm run playbook:evidence -- media --bvid ${FIRST_BVID}`
  });
  assert.deepEqual(await fileIdentity(fixture.ledgerPath), before);
});

test('advance reopens the canonical artifact and returns only public transition data', async (t) => {
  const fixture = await chapterFixture(t);
  await writeMediaArtifact(fixture.projectRoot);

  const result = await runChapterCli([
    'advance',
    '--bvid',
    FIRST_BVID
  ], fixture.deps);

  assert.deepEqual(result, {
    status: 'updated',
    bvid: FIRST_BVID,
    from_stage: 'pending',
    to_stage: 'media-verified',
    evidence: {
      media_sha256: MEDIA_SHA256,
      byte_size: MEDIA_BYTES.length
    }
  });
  assert.doesNotMatch(JSON.stringify(result), /\.local|ledger|transcript|\/tmp\//u);
  assert.equal(
    (await readChapterLedger({ projectRoot: fixture.projectRoot }))
      .ledger.episodes[FIRST_BVID].stage,
    'media-verified'
  );
});

test('status and next reopen current progress and preserve course order', async (t) => {
  const fixture = await chapterFixture(t);
  const mediaVerified = await advanceEpisodeStage({
    projectRoot: fixture.projectRoot,
    bvid: FIRST_BVID,
    expectedLedgerSha256: fixture.created.ledger_sha256,
    expectedStage: 'pending',
    nextStage: 'media-verified',
    evidence: EVIDENCE_BY_STAGE['media-verified']
  });
  const before = await fileIdentity(fixture.ledgerPath);

  assert.deepEqual(await runChapterCli([
    'status',
    '--chapter',
    FIRST_CHAPTER
  ], fixture.deps), {
    chapter_id: FIRST_CHAPTER,
    episode_count: 7,
    completed_count: 0,
    remaining_count: 7,
    next_bvid: FIRST_BVID,
    next_stage: 'asr-complete'
  });
  assert.deepEqual(await runChapterCli([
    'next',
    '--chapter',
    FIRST_CHAPTER
  ], fixture.deps), {
    chapter_id: FIRST_CHAPTER,
    bvid: FIRST_BVID,
    current_stage: 'media-verified',
    next_stage: 'asr-complete',
    command: `npm run playbook:evidence -- transcribe --bvid ${FIRST_BVID}`
  });
  assert.deepEqual(await fileIdentity(fixture.ledgerPath), before);
  assert.equal(mediaVerified.ledger.episodes[FIRST_BVID].stage, 'media-verified');
});

test('completed episodes are counted and skipped by the next action', async (t) => {
  const fixture = await chapterFixture(t);
  let current = fixture.created;
  for (let index = 1; index < STAGES.length; index += 1) {
    current = await advanceEpisodeStage({
      projectRoot: fixture.projectRoot,
      bvid: FIRST_BVID,
      expectedLedgerSha256: current.ledger_sha256,
      expectedStage: STAGES[index - 1],
      nextStage: STAGES[index],
      evidence: EVIDENCE_BY_STAGE[STAGES[index]]
    });
  }
  const before = await fileIdentity(fixture.ledgerPath);

  assert.deepEqual(await runChapterCli([
    'status',
    '--chapter',
    FIRST_CHAPTER
  ], fixture.deps), {
    chapter_id: FIRST_CHAPTER,
    episode_count: 7,
    completed_count: 1,
    remaining_count: 6,
    next_bvid: SECOND_BVID,
    next_stage: 'media-verified'
  });
  assert.deepEqual(await runChapterCli([
    'next',
    '--chapter',
    FIRST_CHAPTER
  ], fixture.deps), {
    chapter_id: FIRST_CHAPTER,
    bvid: SECOND_BVID,
    current_stage: 'pending',
    next_stage: 'media-verified',
    command: `npm run playbook:evidence -- media --bvid ${SECOND_BVID}`
  });
  assert.deepEqual(await fileIdentity(fixture.ledgerPath), before);
});

test('argument parsing rejects unknown, duplicate, missing, and command-specific input', async (t) => {
  const fixture = await chapterFixture(t);
  const invalidCases = [
    [[], 'PLAYBOOK_CHAPTER_COMMAND_INVALID'],
    [['summary'], 'PLAYBOOK_CHAPTER_COMMAND_INVALID'],
    [['status', '--unknown', FIRST_CHAPTER], 'PLAYBOOK_CHAPTER_ARGUMENT_UNKNOWN'],
    [[
      'status', '--chapter', FIRST_CHAPTER, '--chapter', FIRST_CHAPTER
    ], 'PLAYBOOK_CHAPTER_ARGUMENT_DUPLICATE'],
    [['status', '--chapter'], 'PLAYBOOK_CHAPTER_ARGUMENT_VALUE_MISSING'],
    [['next'], 'PLAYBOOK_CHAPTER_ARGUMENT_REQUIRED'],
    [['advance'], 'PLAYBOOK_CHAPTER_ARGUMENT_REQUIRED'],
    [['advance', '--chapter', FIRST_CHAPTER], 'PLAYBOOK_CHAPTER_ARGUMENT_UNKNOWN'],
    [['next', '--chapter', FIRST_CHAPTER, 'extra'], 'PLAYBOOK_CHAPTER_ARGUMENT_UNKNOWN'],
    [['init', '--chapter', FIRST_CHAPTER], 'PLAYBOOK_CHAPTER_ARGUMENT_UNKNOWN'],
    [['init', 'extra'], 'PLAYBOOK_CHAPTER_ARGUMENT_UNKNOWN'],
    [['status', '--chapter', 'unknown-chapter'], 'PLAYBOOK_CHAPTER_ID_INVALID']
  ];

  for (const [argv, code] of invalidCases) {
    await assert.rejects(runChapterCli(argv, fixture.deps), { code });
  }
});

test('missing, corrupt, and source-drifted ledgers fail closed without disclosure', async (t) => {
  const missing = await chapterFixture(t, { create: false });
  await assertSafeRejection(
    runChapterCli(['status'], missing.deps),
    'PLAYBOOK_CHAPTER_LEDGER_MISSING',
    missing.projectRoot
  );
  await assert.rejects(fs.access(path.join(missing.projectRoot, '.local')));

  const corrupt = await chapterFixture(t);
  await fs.writeFile(
    corrupt.ledgerPath,
    '{"transcript_text":"secret","source_path":"/tmp/private-source"}\n'
  );
  await assertSafeRejection(
    runChapterCli(['status'], corrupt.deps),
    'PLAYBOOK_CHAPTER_LEDGER_INVALID',
    corrupt.projectRoot
  );

  const planHashDrift = await chapterFixture(t);
  const driftedHashLedger = await readJson(planHashDrift.ledgerPath);
  driftedHashLedger.chapter_plan_sha256 = '0'.repeat(64);
  await fs.writeFile(planHashDrift.ledgerPath, stableJson(driftedHashLedger));
  await assertSafeRejection(
    runChapterCli(['status'], planHashDrift.deps),
    'PLAYBOOK_CHAPTER_SOURCE_DRIFT',
    planHashDrift.projectRoot
  );

  const identityDrift = await chapterFixture(t);
  const redirectedLedger = await readJson(identityDrift.ledgerPath);
  redirectedLedger.episodes[FIRST_BVID].chapter_id = 'complete-structure';
  await fs.writeFile(identityDrift.ledgerPath, stableJson(redirectedLedger));
  await assertSafeRejection(
    runChapterCli(['status'], identityDrift.deps),
    'PLAYBOOK_CHAPTER_SOURCE_DRIFT',
    identityDrift.projectRoot
  );
});

test('package CLI prints one canonical JSON document from fixed checked-in authority', async (t) => {
  const fixture = await chapterFixture(t);
  const before = await fileIdentity(fixture.ledgerPath);
  const npmCli = process.env.npm_execpath;
  assert.equal(typeof npmCli, 'string');

  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_TEST_CONTEXT;
  delete childEnvironment.NODE_TEST_WORKER_ID;
  const result = await execFileAsync(process.execPath, [
    npmCli,
    'run',
    '--silent',
    'playbook:chapter',
    '--',
    'status',
    '--chapter',
    FIRST_CHAPTER
  ], {
    cwd: ROOT,
    env: {
      ...childEnvironment,
      PLAYBOOK_PROJECT_ROOT: fixture.projectRoot
    },
    encoding: 'utf8'
  });

  assert.equal(result.stderr, '');
  assert.equal(result.stdout, stableJson({
    chapter_id: FIRST_CHAPTER,
    episode_count: 7,
    completed_count: 0,
    remaining_count: 7,
    next_bvid: FIRST_BVID,
    next_stage: 'media-verified'
  }));
  assert.deepEqual(await fileIdentity(fixture.ledgerPath), before);
});

test('package CLI exposes init as the fixed-authority clean-checkout entry point', async (t) => {
  const fixture = await chapterFixture(t, { create: false });
  const npmCli = process.env.npm_execpath;
  assert.equal(typeof npmCli, 'string');

  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_TEST_CONTEXT;
  delete childEnvironment.NODE_TEST_WORKER_ID;
  const result = await execFileAsync(process.execPath, [
    npmCli,
    'run',
    '--silent',
    'playbook:chapter',
    '--',
    'init'
  ], {
    cwd: ROOT,
    env: {
      ...childEnvironment,
      PLAYBOOK_PROJECT_ROOT: fixture.projectRoot
    },
    encoding: 'utf8'
  });

  assert.equal(result.stderr, '');
  assert.equal(result.stdout, stableJson({
    status: 'created',
    chapter_count: 8,
    episode_count: 50,
    completed_count: 0,
    remaining_count: 50,
    next_chapter_id: FIRST_CHAPTER,
    next_bvid: FIRST_BVID,
    next_stage: 'media-verified'
  }));
  assert.deepEqual(await runChapterCli(['status'], fixture.deps), {
    chapter_count: 8,
    episode_count: 50,
    completed_count: 0,
    remaining_count: 50,
    next_chapter_id: FIRST_CHAPTER,
    next_bvid: FIRST_BVID,
    next_stage: 'media-verified'
  });
});

async function chapterFixture(t, { create = true } = {}) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-chapter-cli-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  const ledgerPath = path.join(projectRoot, LEDGER_RELATIVE_PATH);
  const fixture = {
    projectRoot,
    ledgerPath,
    deps: {
      projectRoot,
      courseManifest: structuredClone(COURSE_MANIFEST),
      chapterPlan: structuredClone(CHAPTER_PLAN)
    }
  };
  if (create) {
    fixture.created = await createChapterLedger({
      projectRoot,
      chapterPlan: fixture.deps.chapterPlan
    });
  }
  return fixture;
}

async function writeMediaArtifact(projectRoot) {
  const episode = CHAPTER_PLAN.chapters[0].episodes[0];
  const sourceRoot = path.join(
    projectRoot,
    `.local/architecture-playbook/sources/${FIRST_BVID}`
  );
  await fs.mkdir(sourceRoot, { recursive: true });
  await fs.writeFile(path.join(sourceRoot, 'source-360p.mp4'), MEDIA_BYTES);
  await fs.writeFile(path.join(sourceRoot, 'media-index.json'), JSON.stringify({
    schema_version: 1,
    bvid: FIRST_BVID,
    cid: episode.cid,
    source_metadata_fingerprint_sha256:
      episode.metadata_fingerprint_sha256,
    observed_at: '2026-09-01T12:00:00.000Z',
    quality: 16,
    format: 'mp4',
    declared_duration_ms: episode.duration_seconds * 1000,
    duration_ms: episode.duration_seconds * 1000,
    declared_size: MEDIA_BYTES.length,
    byte_size: MEDIA_BYTES.length,
    sha256: MEDIA_SHA256
  }, null, 2) + '\n');
}

async function assertSafeRejection(promise, code, projectRoot) {
  let rejection;
  try {
    await promise;
  } catch (error) {
    rejection = error;
  }
  assert.equal(rejection?.code, code);
  const text = String(rejection);
  assert.equal(text.includes(projectRoot), false);
  assert.doesNotMatch(text, /\.local|transcript|https?:|private-source/u);
}

async function fileIdentity(filePath) {
  const stat = await fs.lstat(filePath);
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: createHash('sha256').update(await fs.readFile(filePath)).digest('hex')
  };
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}
