import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  advanceEpisodeStage,
  createChapterLedger,
  readChapterLedger
} from '../src/playbook/course/chapterLedger.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHAPTER_PLAN_PATH = path.join(
  ROOT,
  'docs/architecture-playbook/course/chapter-plan-v1.json'
);
const LEDGER_RELATIVE_PATH =
  '.local/architecture-playbook/work/p7/chapter-ledger.json';
const FIRST_BVID = 'BV1guoPYkExk';
const UNKNOWN_BVID = 'BV1aaaaaaaaaa';
const HASH = 'a'.repeat(64);
const CHAPTER_PLAN_SHA256 =
  '501b1d7129f53b17a2e02ff0dd451a455700ca62354da55955093d203bb597f2';
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

test('create owns absent-to-initial ledger publication and exact replay is unchanged', async (t) => {
  const fixture = await ledgerFixture(t, { create: false });

  const created = await createChapterLedger({
    projectRoot: fixture.projectRoot,
    chapterPlan: fixture.chapterPlan
  });

  assert.equal(created.status, 'created');
  assert.equal(created.ledger_sha256, sha256(await fs.readFile(fixture.ledgerPath)));
  assert.equal(created.ledger.schema_version, 1);
  assert.equal(created.ledger.chapter_plan_sha256, CHAPTER_PLAN_SHA256);
  assert.equal(created.ledger.episode_count, 50);
  assert.equal(created.ledger.unresolved_count, 50);
  assert.equal(created.ledger.last_completed_action, null);
  assert.equal(Object.keys(created.ledger.episodes).length, 50);
  assert.deepEqual(created.ledger.episodes[FIRST_BVID], {
    chapter_id: 'foundations-tools-blocks-modularity-color',
    course_order: 1,
    stage: 'pending',
    evidence: {}
  });
  assert.ok(Object.values(created.ledger.episodes).every(
    (episode) => episode.stage === 'pending'
  ));
  assert.equal(
    (await fs.readFile(fixture.ledgerPath, 'utf8')),
    stableJson(created.ledger)
  );
  assert.deepEqual(await fs.readdir(path.dirname(fixture.ledgerPath)), [
    'chapter-ledger.json'
  ]);

  const before = await fileIdentity(fixture.ledgerPath);
  const replay = await createChapterLedger({
    projectRoot: fixture.projectRoot,
    chapterPlan: fixture.chapterPlan
  });
  assert.deepEqual(replay, {
    status: 'unchanged',
    ledger_sha256: created.ledger_sha256,
    ledger: created.ledger
  });
  assert.deepEqual(await fileIdentity(fixture.ledgerPath), before);
});

test('ledger advances adjacent stages by mandatory compare-and-swap and survives reopen', async (t) => {
  const fixture = await ledgerFixture(t);
  const first = await advanceEpisodeStage({
    projectRoot: fixture.projectRoot,
    bvid: FIRST_BVID,
    expectedLedgerSha256: fixture.created.ledger_sha256,
    expectedStage: 'pending',
    nextStage: 'media-verified',
    evidence: EVIDENCE_BY_STAGE['media-verified']
  });

  assert.equal(first.status, 'updated');
  assert.equal(first.ledger_sha256, sha256(await fs.readFile(fixture.ledgerPath)));
  assert.equal(first.ledger.episodes[FIRST_BVID].stage, 'media-verified');
  assert.deepEqual(
    first.ledger.episodes[FIRST_BVID].evidence,
    EVIDENCE_BY_STAGE['media-verified']
  );
  assert.equal(first.ledger.unresolved_count, 50);
  assert.deepEqual(first.ledger.last_completed_action, {
    bvid: FIRST_BVID,
    from_stage: 'pending',
    to_stage: 'media-verified'
  });

  const reopened = await readChapterLedger({ projectRoot: fixture.projectRoot });
  assert.equal(reopened.ledger_sha256, first.ledger_sha256);
  assert.deepEqual(reopened.ledger, first.ledger);

  let current = first;
  for (let index = 2; index < STAGES.length; index += 1) {
    current = await advanceEpisodeStage({
      projectRoot: fixture.projectRoot,
      bvid: FIRST_BVID,
      expectedLedgerSha256: current.ledger_sha256,
      expectedStage: STAGES[index - 1],
      nextStage: STAGES[index],
      evidence: EVIDENCE_BY_STAGE[STAGES[index]]
    });
  }
  assert.equal(current.ledger.episodes[FIRST_BVID].stage, 'rules-reviewed');
  assert.deepEqual(current.ledger.episodes[FIRST_BVID].evidence, {
    ...EVIDENCE_BY_STAGE['media-verified'],
    ...EVIDENCE_BY_STAGE['asr-complete'],
    ...EVIDENCE_BY_STAGE['events-indexed'],
    ...EVIDENCE_BY_STAGE['visual-reviewed'],
    ...EVIDENCE_BY_STAGE['evidence-packed'],
    ...EVIDENCE_BY_STAGE['notes-reviewed'],
    ...EVIDENCE_BY_STAGE['rules-reviewed']
  });
  assert.equal(current.ledger.unresolved_count, 49);
});

test('ledger rejects missing CAS, skipped stages, unknown episodes, and absent initialization', async (t) => {
  const fixture = await ledgerFixture(t);

  await assert.rejects(advanceEpisodeStage({
    projectRoot: fixture.projectRoot,
    bvid: FIRST_BVID,
    expectedStage: 'pending',
    nextStage: 'media-verified',
    evidence: EVIDENCE_BY_STAGE['media-verified']
  }), { code: 'PLAYBOOK_CHAPTER_LEDGER_HASH_INVALID' });

  await assert.rejects(advanceEpisodeStage({
    projectRoot: fixture.projectRoot,
    bvid: FIRST_BVID,
    expectedLedgerSha256: fixture.created.ledger_sha256,
    expectedStage: 'pending',
    nextStage: 'asr-complete',
    evidence: {}
  }), { code: 'PLAYBOOK_CHAPTER_STAGE_INVALID' });

  await assert.rejects(advanceEpisodeStage({
    projectRoot: fixture.projectRoot,
    bvid: UNKNOWN_BVID,
    expectedLedgerSha256: fixture.created.ledger_sha256,
    expectedStage: 'pending',
    nextStage: 'media-verified',
    evidence: EVIDENCE_BY_STAGE['media-verified']
  }), { code: 'PLAYBOOK_CHAPTER_EPISODE_INVALID' });

  const absent = await ledgerFixture(t, { create: false });
  await assert.rejects(advanceEpisodeStage({
    projectRoot: absent.projectRoot,
    bvid: FIRST_BVID,
    expectedLedgerSha256: '0'.repeat(64),
    expectedStage: 'pending',
    nextStage: 'media-verified',
    evidence: EVIDENCE_BY_STAGE['media-verified']
  }), { code: 'PLAYBOOK_CHAPTER_LEDGER_MISSING' });
  await assert.rejects(fs.access(absent.ledgerPath));
});

test('stale writers fail closed while an exact refreshed replay is unchanged', async (t) => {
  const fixture = await ledgerFixture(t);
  const initialBytes = await fs.readFile(fixture.ledgerPath);
  const updated = await advanceEpisodeStage({
    projectRoot: fixture.projectRoot,
    bvid: FIRST_BVID,
    expectedLedgerSha256: fixture.created.ledger_sha256,
    expectedStage: 'pending',
    nextStage: 'media-verified',
    evidence: EVIDENCE_BY_STAGE['media-verified']
  });
  const updatedBytes = await fs.readFile(fixture.ledgerPath);
  assert.notDeepEqual(updatedBytes, initialBytes);

  await assert.rejects(advanceEpisodeStage({
    projectRoot: fixture.projectRoot,
    bvid: FIRST_BVID,
    expectedLedgerSha256: fixture.created.ledger_sha256,
    expectedStage: 'pending',
    nextStage: 'media-verified',
    evidence: EVIDENCE_BY_STAGE['media-verified']
  }), { code: 'PLAYBOOK_CHAPTER_LEDGER_STALE' });
  assert.deepEqual(await fs.readFile(fixture.ledgerPath), updatedBytes);

  const beforeReplay = await fileIdentity(fixture.ledgerPath);
  const replay = await advanceEpisodeStage({
    projectRoot: fixture.projectRoot,
    bvid: FIRST_BVID,
    expectedLedgerSha256: updated.ledger_sha256,
    expectedStage: 'pending',
    nextStage: 'media-verified',
    evidence: EVIDENCE_BY_STAGE['media-verified']
  });
  assert.deepEqual(replay, {
    status: 'unchanged',
    ledger_sha256: updated.ledger_sha256,
    ledger: updated.ledger
  });
  assert.deepEqual(await fileIdentity(fixture.ledgerPath), beforeReplay);
});

test('a pre-rename failure preserves the old ledger byte-for-byte and sanitizes errors', async (t) => {
  const fixture = await ledgerFixture(t);
  const before = await fs.readFile(fixture.ledgerPath);
  const crashingFs = new Proxy(fs, {
    get(target, property, receiver) {
      if (property === 'rename') {
        return async (source, destination) => {
          throw new Error(`PRIVATE_PRE_RENAME ${source} ${destination}`);
        };
      }
      return Reflect.get(target, property, receiver);
    }
  });

  let rejection;
  try {
    await advanceEpisodeStage({
      projectRoot: fixture.projectRoot,
      bvid: FIRST_BVID,
      expectedLedgerSha256: fixture.created.ledger_sha256,
      expectedStage: 'pending',
      nextStage: 'media-verified',
      evidence: EVIDENCE_BY_STAGE['media-verified'],
      fsImpl: crashingFs
    });
  } catch (error) {
    rejection = error;
  }
  assert.equal(rejection?.code, 'PLAYBOOK_CHAPTER_LEDGER_WRITE_FAILED');
  assert.equal(String(rejection).includes(fixture.projectRoot), false);
  assert.equal(String(rejection).includes('PRIVATE_PRE_RENAME'), false);
  assert.deepEqual(await fs.readFile(fixture.ledgerPath), before);
  assert.deepEqual(await fs.readdir(path.dirname(fixture.ledgerPath)), [
    'chapter-ledger.json'
  ]);
});

test('ledger rejects symlinked private ancestors without writing outside private storage', async (t) => {
  const fixture = await ledgerFixture(t, { create: false });
  const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-ledger-outside-'));
  t.after(() => fs.rm(outsideRoot, { recursive: true, force: true }));
  const privateRoot = path.join(
    fixture.projectRoot,
    '.local/architecture-playbook'
  );
  await fs.mkdir(privateRoot, { recursive: true });
  await fs.symlink(outsideRoot, path.join(privateRoot, 'work'), 'dir');

  let rejection;
  try {
    await createChapterLedger({
      projectRoot: fixture.projectRoot,
      chapterPlan: fixture.chapterPlan
    });
  } catch (error) {
    rejection = error;
  }
  assert.equal(rejection?.code, 'PLAYBOOK_PRIVATE_PATH_ESCAPE');
  assert.equal(String(rejection).includes(outsideRoot), false);
  assert.equal(String(rejection).includes(fixture.projectRoot), false);
  assert.deepEqual(await fs.readdir(outsideRoot), []);
});

test('ledger rejects source paths and transcript or media text in evidence', async (t) => {
  const fixture = await ledgerFixture(t);
  const before = await fs.readFile(fixture.ledgerPath);
  for (const evidence of [
    { ...EVIDENCE_BY_STAGE['media-verified'], source_path: '/private/source.mp4' },
    { ...EVIDENCE_BY_STAGE['media-verified'], transcript_text: 'secret transcript' },
    { ...EVIDENCE_BY_STAGE['media-verified'], media_text: 'secret media payload' }
  ]) {
    await assert.rejects(advanceEpisodeStage({
      projectRoot: fixture.projectRoot,
      bvid: FIRST_BVID,
      expectedLedgerSha256: fixture.created.ledger_sha256,
      expectedStage: 'pending',
      nextStage: 'media-verified',
      evidence
    }), { code: 'PLAYBOOK_CHAPTER_EVIDENCE_INVALID' });
  }
  assert.deepEqual(await fs.readFile(fixture.ledgerPath), before);
});

test('create refuses to reset an advanced ledger to pending', async (t) => {
  const fixture = await ledgerFixture(t);
  const advanced = await advanceEpisodeStage({
    projectRoot: fixture.projectRoot,
    bvid: FIRST_BVID,
    expectedLedgerSha256: fixture.created.ledger_sha256,
    expectedStage: 'pending',
    nextStage: 'media-verified',
    evidence: EVIDENCE_BY_STAGE['media-verified']
  });
  const before = await fs.readFile(fixture.ledgerPath);

  await assert.rejects(createChapterLedger({
    projectRoot: fixture.projectRoot,
    chapterPlan: fixture.chapterPlan
  }), { code: 'PLAYBOOK_CHAPTER_LEDGER_EXISTS' });
  assert.deepEqual(await fs.readFile(fixture.ledgerPath), before);
  assert.deepEqual(
    (await readChapterLedger({ projectRoot: fixture.projectRoot })).ledger,
    advanced.ledger
  );
});

async function ledgerFixture(t, { create = true } = {}) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-ledger-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  const chapterPlan = JSON.parse(await fs.readFile(CHAPTER_PLAN_PATH, 'utf8'));
  const ledgerPath = path.join(projectRoot, LEDGER_RELATIVE_PATH);
  const fixture = { projectRoot, chapterPlan, ledgerPath };
  if (create) {
    fixture.created = await createChapterLedger({ projectRoot, chapterPlan });
  }
  return fixture;
}

async function fileIdentity(filePath) {
  const stat = await fs.lstat(filePath);
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: sha256(await fs.readFile(filePath))
  };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [
    key,
    sortValue(value[key])
  ]));
}
