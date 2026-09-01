import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { failPlaybookContract } from '../contracts/playbookContractError.js';
import { deepFreeze, sha256, stableJson } from '../shadow/canonical.js';
import {
  assertPrivatePlaybookStorage,
  resolvePrivatePlaybookPath
} from '../storage/privatePlaybookPath.js';

const LEDGER_PATH = '.local/architecture-playbook/work/p7/chapter-ledger.json';
const HASH = /^[a-f0-9]{64}$/u;
const BVID = /^BV[0-9A-Za-z]{10}$/u;
const EVIDENCE_FIELD = /^[a-z][a-z0-9_]*(?:_sha256|_count)$/u;
const STAGES = Object.freeze([
  'pending',
  'media-verified',
  'asr-complete',
  'events-indexed',
  'visual-reviewed',
  'evidence-packed',
  'notes-reviewed',
  'rules-reviewed'
]);
const LEDGER_FIELDS = Object.freeze([
  'schema_version',
  'chapter_plan_sha256',
  'episode_count',
  'unresolved_count',
  'last_completed_action',
  'episodes'
]);
const EPISODE_FIELDS = Object.freeze([
  'chapter_id',
  'course_order',
  'stage',
  'evidence'
]);
const ACTION_FIELDS = Object.freeze(['bvid', 'from_stage', 'to_stage']);

export async function createChapterLedger({ projectRoot, chapterPlan, fsImpl } = {}) {
  const ops = fsOperations(fsImpl);
  const ledger = initialLedger(chapterPlan);
  const bytes = Buffer.from(stableJson(ledger));
  const ledgerPath = await privateLedgerPath(projectRoot, { createParent: true });

  const existing = await readLedgerFile(ledgerPath, ops, { allowMissing: true });
  if (existing) {
    if (existing.bytes.equals(bytes)) return envelope('unchanged', existing);
    fail('PLAYBOOK_CHAPTER_LEDGER_EXISTS', 'ledger', 'ledger already initialized');
  }

  let stagePath;
  try {
    stagePath = await writeExclusiveStage(ledgerPath, bytes, ops);
    const collision = await readLedgerFile(ledgerPath, ops, { allowMissing: true });
    if (collision) {
      if (collision.bytes.equals(bytes)) return envelope('unchanged', collision);
      fail('PLAYBOOK_CHAPTER_LEDGER_EXISTS', 'ledger', 'ledger already initialized');
    }
    await ops.rename(stagePath, ledgerPath);
    stagePath = undefined;
    await syncDirectory(path.dirname(ledgerPath), ops);
    const published = await readLedgerFile(ledgerPath, ops);
    if (!published.bytes.equals(bytes)) {
      fail('PLAYBOOK_CHAPTER_LEDGER_WRITE_FAILED', 'ledger', 'publication mismatch');
    }
    return envelope('created', published);
  } catch (error) {
    throw publicWriteError(error);
  } finally {
    if (stagePath) await removeStage(stagePath, ops);
  }
}

export async function readChapterLedger({ projectRoot, fsImpl } = {}) {
  const ops = fsOperations(fsImpl);
  const ledgerPath = await privateLedgerPath(projectRoot, { missingIsLedger: true });
  const current = await readLedgerFile(ledgerPath, ops);
  return readEnvelope(current);
}

export async function advanceEpisodeStage({
  projectRoot,
  bvid,
  expectedLedgerSha256,
  expectedStage,
  nextStage,
  evidence,
  fsImpl
} = {}) {
  assertExpectedHash(expectedLedgerSha256);
  const ops = fsOperations(fsImpl);
  const ledgerPath = await privateLedgerPath(projectRoot, { missingIsLedger: true });
  const current = await readLedgerFile(ledgerPath, ops);
  if (current.sha256 !== expectedLedgerSha256) {
    fail('PLAYBOOK_CHAPTER_LEDGER_STALE', 'expectedLedgerSha256', 'stale ledger');
  }

  const episode = current.ledger.episodes[bvid];
  if (!episode || !BVID.test(bvid || '')) {
    fail('PLAYBOOK_CHAPTER_EPISODE_INVALID', 'bvid', 'unknown episode');
  }
  const expectedIndex = STAGES.indexOf(expectedStage);
  const nextIndex = STAGES.indexOf(nextStage);
  if (expectedIndex < 0 || nextIndex !== expectedIndex + 1) {
    fail('PLAYBOOK_CHAPTER_STAGE_INVALID', 'nextStage', 'expected adjacent stage');
  }
  const checkedEvidence = validateEvidence(evidence, { allowEmpty: false });

  if (episode.stage === nextStage && evidenceMatches(episode.evidence, checkedEvidence)) {
    return envelope('unchanged', current);
  }
  if (episode.stage !== expectedStage) {
    fail('PLAYBOOK_CHAPTER_STAGE_INVALID', 'expectedStage', 'stage no longer current');
  }

  const nextLedger = structuredClone(current.ledger);
  nextLedger.episodes[bvid] = {
    ...nextLedger.episodes[bvid],
    stage: nextStage,
    evidence: {
      ...nextLedger.episodes[bvid].evidence,
      ...checkedEvidence
    }
  };
  nextLedger.unresolved_count = Object.values(nextLedger.episodes).filter(
    (candidate) => candidate.stage !== STAGES.at(-1)
  ).length;
  nextLedger.last_completed_action = {
    bvid,
    from_stage: expectedStage,
    to_stage: nextStage
  };
  validateLedger(nextLedger);
  const nextBytes = Buffer.from(stableJson(nextLedger));

  let stagePath;
  try {
    stagePath = await writeExclusiveStage(ledgerPath, nextBytes, ops);
    const latest = await readLedgerFile(ledgerPath, ops);
    if (latest.sha256 !== expectedLedgerSha256) {
      fail('PLAYBOOK_CHAPTER_LEDGER_STALE', 'expectedLedgerSha256', 'stale ledger');
    }
    await ops.rename(stagePath, ledgerPath);
    stagePath = undefined;
    await syncDirectory(path.dirname(ledgerPath), ops);
    const published = await readLedgerFile(ledgerPath, ops);
    if (!published.bytes.equals(nextBytes)) {
      fail('PLAYBOOK_CHAPTER_LEDGER_WRITE_FAILED', 'ledger', 'publication mismatch');
    }
    return envelope('updated', published);
  } catch (error) {
    throw publicWriteError(error);
  } finally {
    if (stagePath) await removeStage(stagePath, ops);
  }
}

function initialLedger(chapterPlan) {
  if (!chapterPlan || typeof chapterPlan !== 'object' || Array.isArray(chapterPlan)) {
    fail('PLAYBOOK_CHAPTER_PLAN_INVALID', 'chapterPlan', 'expected validated plan');
  }
  if (!Array.isArray(chapterPlan.chapters) || chapterPlan.episode_count !== 50) {
    fail('PLAYBOOK_CHAPTER_PLAN_INVALID', 'chapterPlan', 'expected 50-episode plan');
  }
  const episodes = {};
  for (const chapter of chapterPlan.chapters) {
    if (typeof chapter?.chapter_id !== 'string' || !Array.isArray(chapter.episodes)) {
      fail('PLAYBOOK_CHAPTER_PLAN_INVALID', 'chapterPlan.chapters', 'invalid chapter');
    }
    for (const episode of chapter.episodes) {
      if (
        !BVID.test(episode?.bvid || '')
        || Object.hasOwn(episodes, episode.bvid)
        || !Number.isSafeInteger(episode.course_order)
        || episode.course_order < 1
      ) {
        fail('PLAYBOOK_CHAPTER_PLAN_INVALID', 'chapterPlan.chapters', 'invalid episode');
      }
      episodes[episode.bvid] = {
        chapter_id: chapter.chapter_id,
        course_order: episode.course_order,
        stage: 'pending',
        evidence: {}
      };
    }
  }
  if (Object.keys(episodes).length !== 50) {
    fail('PLAYBOOK_CHAPTER_PLAN_INVALID', 'chapterPlan.chapters', 'expected 50 episodes');
  }
  return deepFreeze({
    schema_version: 1,
    chapter_plan_sha256: sha256(stableJson(chapterPlan)),
    episode_count: 50,
    unresolved_count: 50,
    last_completed_action: null,
    episodes
  });
}

async function privateLedgerPath(projectRoot, {
  createParent = false,
  missingIsLedger = false
} = {}) {
  let ledgerPath;
  try {
    ledgerPath = resolvePrivatePlaybookPath(LEDGER_PATH, { projectRoot });
    await assertPrivatePlaybookStorage(ledgerPath, { projectRoot, createParent });
    return ledgerPath;
  } catch (error) {
    if (missingIsLedger && error?.code === 'ENOENT') {
      fail('PLAYBOOK_CHAPTER_LEDGER_MISSING', 'ledger', 'ledger not initialized');
    }
    if (error?.code === 'PLAYBOOK_PRIVATE_PATH_ESCAPE'
      || error?.code === 'PLAYBOOK_PRIVATE_PATH_INVALID') {
      fail(error.code, 'privatePath', 'private storage rejected');
    }
    throw error;
  }
}

async function readLedgerFile(ledgerPath, ops, { allowMissing = false } = {}) {
  let bytes;
  try {
    bytes = await ops.readFile(ledgerPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      if (allowMissing) return null;
      fail('PLAYBOOK_CHAPTER_LEDGER_MISSING', 'ledger', 'ledger not initialized');
    }
    throw sanitizeReadError(error);
  }
  let ledger;
  try {
    ledger = JSON.parse(bytes.toString('utf8'));
    validateLedger(ledger);
    if (!bytes.equals(Buffer.from(stableJson(ledger)))) {
      fail('PLAYBOOK_CHAPTER_LEDGER_INVALID', 'ledger', 'non-canonical ledger');
    }
  } catch (error) {
    if (error?.code) throw error;
    fail('PLAYBOOK_CHAPTER_LEDGER_INVALID', 'ledger', 'invalid ledger');
  }
  return {
    bytes,
    sha256: sha256(bytes),
    ledger: deepFreeze(ledger)
  };
}

function validateLedger(ledger) {
  assertExactObject(ledger, LEDGER_FIELDS, 'ledger');
  if (ledger.schema_version !== 1 || !HASH.test(ledger.chapter_plan_sha256 || '')) {
    invalidLedger();
  }
  if (!Number.isSafeInteger(ledger.episode_count) || ledger.episode_count !== 50) {
    invalidLedger();
  }
  if (!ledger.episodes || typeof ledger.episodes !== 'object' || Array.isArray(ledger.episodes)) {
    invalidLedger();
  }
  const entries = Object.entries(ledger.episodes);
  if (entries.length !== ledger.episode_count) invalidLedger();
  const orders = new Set();
  for (const [bvid, episode] of entries) {
    if (!BVID.test(bvid)) invalidLedger();
    assertExactObject(episode, EPISODE_FIELDS, `episodes.${bvid}`);
    if (
      typeof episode.chapter_id !== 'string'
      || episode.chapter_id.length === 0
      || !Number.isSafeInteger(episode.course_order)
      || episode.course_order < 1
      || episode.course_order > ledger.episode_count
      || orders.has(episode.course_order)
      || !STAGES.includes(episode.stage)
    ) {
      invalidLedger();
    }
    orders.add(episode.course_order);
    validateEvidence(episode.evidence, { allowEmpty: episode.stage === 'pending' });
  }
  const unresolved = entries.filter(([, episode]) => episode.stage !== STAGES.at(-1)).length;
  if (ledger.unresolved_count !== unresolved) invalidLedger();
  if (ledger.last_completed_action === null) {
    if (entries.some(([, episode]) => episode.stage !== 'pending')) invalidLedger();
    return ledger;
  }
  assertExactObject(ledger.last_completed_action, ACTION_FIELDS, 'last_completed_action');
  const action = ledger.last_completed_action;
  const fromIndex = STAGES.indexOf(action.from_stage);
  if (
    !Object.hasOwn(ledger.episodes, action.bvid)
    || fromIndex < 0
    || STAGES[fromIndex + 1] !== action.to_stage
    || ledger.episodes[action.bvid].stage !== action.to_stage
  ) {
    invalidLedger();
  }
  return ledger;
}

function validateEvidence(value, { allowEmpty }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    evidenceInvalid();
  }
  const checked = {};
  for (const [field, fieldValue] of Object.entries(value)) {
    if (field === 'byte_size') {
      if (!Number.isSafeInteger(fieldValue) || fieldValue < 0) evidenceInvalid();
    } else if (field.endsWith('_sha256')) {
      if (!EVIDENCE_FIELD.test(field) || !HASH.test(fieldValue || '')) evidenceInvalid();
    } else if (field.endsWith('_count')) {
      if (!EVIDENCE_FIELD.test(field)
        || !Number.isSafeInteger(fieldValue)
        || fieldValue < 0) evidenceInvalid();
    } else {
      evidenceInvalid();
    }
    checked[field] = fieldValue;
  }
  if (!allowEmpty && Object.keys(checked).length === 0) evidenceInvalid();
  return checked;
}

function evidenceMatches(current, requested) {
  return Object.entries(requested).every(([field, value]) => current[field] === value);
}

async function writeExclusiveStage(ledgerPath, bytes, ops) {
  const stagePath = path.join(
    path.dirname(ledgerPath),
    `.chapter-ledger.${process.pid}.${randomBytes(8).toString('hex')}.stage`
  );
  let handle;
  try {
    handle = await ops.open(stagePath, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    return stagePath;
  } catch (error) {
    try { await handle?.close(); } catch {}
    await removeStage(stagePath, ops);
    throw error;
  }
}

async function syncDirectory(directory, ops) {
  let handle;
  try {
    handle = await ops.open(directory, 'r');
    await handle.sync();
  } finally {
    try { await handle?.close(); } catch {}
  }
}

async function removeStage(stagePath, ops) {
  try {
    await ops.rm(stagePath, { force: true });
  } catch {}
}

function fsOperations(fsImpl) {
  return fsImpl ?? fs;
}

function readEnvelope(current) {
  return deepFreeze({
    ledger_sha256: current.sha256,
    ledger: current.ledger
  });
}

function envelope(status, current) {
  return deepFreeze({ status, ...readEnvelope(current) });
}

function assertExpectedHash(value) {
  if (!HASH.test(value || '')) {
    fail(
      'PLAYBOOK_CHAPTER_LEDGER_HASH_INVALID',
      'expectedLedgerSha256',
      'expected lowercase SHA-256'
    );
  }
}

function assertExactObject(value, fields, valuePath) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidLedger();
  const names = Object.keys(value);
  if (names.length !== fields.length || names.some((field) => !fields.includes(field))) {
    fail('PLAYBOOK_CHAPTER_LEDGER_INVALID', valuePath, 'unexpected fields');
  }
}

function publicWriteError(error) {
  if (
    error?.code === 'PLAYBOOK_CHAPTER_LEDGER_STALE'
    || error?.code === 'PLAYBOOK_CHAPTER_LEDGER_EXISTS'
    || error?.code === 'PLAYBOOK_CHAPTER_LEDGER_INVALID'
  ) return error;
  try {
    fail('PLAYBOOK_CHAPTER_LEDGER_WRITE_FAILED', 'ledger', 'publication failed');
  } catch (publicError) {
    return publicError;
  }
}

function sanitizeReadError(error) {
  if (error?.code?.startsWith?.('PLAYBOOK_')) return error;
  try {
    fail('PLAYBOOK_CHAPTER_LEDGER_INVALID', 'ledger', 'ledger read failed');
  } catch (publicError) {
    return publicError;
  }
}

function invalidLedger() {
  fail('PLAYBOOK_CHAPTER_LEDGER_INVALID', 'ledger', 'invalid ledger');
}

function evidenceInvalid() {
  fail('PLAYBOOK_CHAPTER_EVIDENCE_INVALID', 'evidence', 'expected hashes and counts only');
}

function fail(code, valuePath, detail) {
  failPlaybookContract(code, valuePath, detail);
}
