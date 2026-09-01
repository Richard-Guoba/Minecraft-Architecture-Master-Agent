import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  rmdirSync
} from 'node:fs';
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
const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const FLOCK_BINARY = '/usr/bin/flock';
const PRIVATE_COMPONENTS = Object.freeze([
  '.local', 'architecture-playbook', 'work', 'p7'
]);
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
const TRANSITION_EVIDENCE_FIELDS = Object.freeze({
  'media-verified': Object.freeze(['media_sha256', 'byte_size']),
  'asr-complete': Object.freeze(['segment_index_sha256', 'segment_count']),
  'events-indexed': Object.freeze(['event_index_sha256', 'event_count']),
  'visual-reviewed': Object.freeze(['visual_review_sha256', 'reviewed_frame_count']),
  'evidence-packed': Object.freeze(['evidence_pack_sha256', 'evidence_count']),
  'notes-reviewed': Object.freeze(['notes_sha256', 'note_count']),
  'rules-reviewed': Object.freeze(['rules_sha256', 'rule_count'])
});

export async function createChapterLedger({ projectRoot, chapterPlan, fsImpl } = {}) {
  const ops = fsOperations(fsImpl);
  const ledger = initialLedger(chapterPlan);
  const bytes = Buffer.from(stableJson(ledger));
  const ledgerPath = await privateLedgerPath(projectRoot, { initialize: true });
  try {
    return await withLedgerLock(
      ledgerPath,
      ops,
      async (boundLedgerPath, assertAuthority) => {
        const existing = await readLedgerFile(boundLedgerPath, ops, { allowMissing: true });
        if (existing) {
          if (existing.bytes.equals(bytes)) return envelope('unchanged', existing);
          fail('PLAYBOOK_CHAPTER_LEDGER_EXISTS', 'ledger', 'ledger already initialized');
        }

        let stagePath;
        try {
          stagePath = await writeExclusiveStage(boundLedgerPath, bytes, ops);
          const collision = await readLedgerFile(boundLedgerPath, ops, { allowMissing: true });
          if (collision) {
            if (collision.bytes.equals(bytes)) return envelope('unchanged', collision);
            fail('PLAYBOOK_CHAPTER_LEDGER_EXISTS', 'ledger', 'ledger already initialized');
          }
          await assertAuthority();
          await ops.rename(stagePath, boundLedgerPath);
          stagePath = undefined;
          await syncDirectory(path.dirname(boundLedgerPath), ops);
          const published = await readLedgerFile(boundLedgerPath, ops);
          if (!published.bytes.equals(bytes)) {
            fail('PLAYBOOK_CHAPTER_LEDGER_WRITE_FAILED', 'ledger', 'publication mismatch');
          }
          return envelope('created', published);
        } finally {
          if (stagePath) await removeStage(stagePath, ops);
        }
      },
      { createMissing: true }
    );
  } catch (error) {
    throw publicWriteError(error);
  }
}

export async function readChapterLedger({ projectRoot, fsImpl } = {}) {
  const ops = fsOperations(fsImpl);
  const ledgerPath = await privateLedgerPath(projectRoot, { missingIsLedger: true });
  try {
    return await withLedgerLock(ledgerPath, ops, async (boundLedgerPath) => {
      const current = await readLedgerFile(boundLedgerPath, ops);
      return readEnvelope(current);
    });
  } catch (error) {
    throw sanitizeReadError(error);
  }
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
  try {
    return await withLedgerLock(ledgerPath, ops, async (boundLedgerPath, assertAuthority) => {
      const current = await readLedgerFile(boundLedgerPath, ops);
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
      assertTransitionEvidence(checkedEvidence, nextStage);

      if (
        episode.stage === nextStage
        && transitionEvidenceMatches(episode.evidence, checkedEvidence, nextStage)
      ) {
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
        stagePath = await writeExclusiveStage(boundLedgerPath, nextBytes, ops);
        const latest = await readLedgerFile(boundLedgerPath, ops);
        if (latest.sha256 !== expectedLedgerSha256) {
          fail('PLAYBOOK_CHAPTER_LEDGER_STALE', 'expectedLedgerSha256', 'stale ledger');
        }
        await assertAuthority();
        await ops.rename(stagePath, boundLedgerPath);
        stagePath = undefined;
        await syncDirectory(path.dirname(boundLedgerPath), ops);
        const published = await readLedgerFile(boundLedgerPath, ops);
        if (!published.bytes.equals(nextBytes)) {
          fail('PLAYBOOK_CHAPTER_LEDGER_WRITE_FAILED', 'ledger', 'publication mismatch');
        }
        return envelope('updated', published);
      } finally {
        if (stagePath) await removeStage(stagePath, ops);
      }
    });
  } catch (error) {
    throw publicWriteError(error);
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
  initialize = false,
  missingIsLedger = false
} = {}) {
  let ledgerPath;
  try {
    ledgerPath = resolvePrivatePlaybookPath(LEDGER_PATH, { projectRoot });
    if (!initialize) {
      await assertPrivatePlaybookStorage(ledgerPath, {
        projectRoot,
        createParent: false
      });
    }
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
  const before = await assertRegularLedger(ledgerPath, ops, { allowMissing });
  if (!before) return null;
  let handle;
  let bytes;
  try {
    handle = await ops.open(ledgerPath, READ_FLAGS);
    const opened = await handle.stat();
    if (!opened.isFile() || !sameIdentity(before, opened)) privateAuthorityInvalid();
    bytes = await handle.readFile();
  } catch (error) {
    if (error?.code === 'ELOOP') privateAuthorityInvalid();
    throw sanitizeReadError(error);
  } finally {
    try { await handle?.close(); } catch {}
  }
  const after = await assertRegularLedger(ledgerPath, ops);
  if (!sameIdentity(before, after)) privateAuthorityInvalid();
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
    let checkedEvidence;
    try {
      checkedEvidence = validateEvidence(episode.evidence, { allowEmpty: true });
    } catch (error) {
      if (error?.code === 'PLAYBOOK_CHAPTER_EVIDENCE_INVALID') invalidLedger();
      throw error;
    }
    assertStageEvidence(checkedEvidence, episode.stage);
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

function assertTransitionEvidence(evidence, nextStage) {
  const fields = TRANSITION_EVIDENCE_FIELDS[nextStage];
  const names = Object.keys(evidence).sort();
  if (
    !fields
    || names.length !== fields.length
    || names.some((field) => !fields.includes(field))
  ) {
    evidenceInvalid();
  }
}

function assertStageEvidence(evidence, stage) {
  const stageIndex = STAGES.indexOf(stage);
  const fields = STAGES.slice(1, stageIndex + 1).flatMap(
    (candidate) => TRANSITION_EVIDENCE_FIELDS[candidate]
  );
  const names = Object.keys(evidence);
  if (
    names.length !== fields.length
    || names.some((field) => !fields.includes(field))
  ) {
    invalidLedger();
  }
}

function transitionEvidenceMatches(current, requested, nextStage) {
  const fields = TRANSITION_EVIDENCE_FIELDS[nextStage];
  return fields.every((field) => current[field] === requested[field]);
}

async function withLedgerLock(
  ledgerPath,
  ops,
  operation,
  { createMissing = false } = {}
) {
  const authority = await acquireLedgerAuthority(ledgerPath, ops, { createMissing });
  let completed = false;
  try {
    await flockExclusive(authority.root.handle);
    await assertLedgerAuthority(authority, ops);
    const result = await operation(
      entry(authority.p7.handle, 'chapter-ledger.json'),
      () => assertLedgerAuthority(authority, ops)
    );
    await assertLedgerAuthority(authority, ops);
    completed = true;
    return result;
  } finally {
    if (!completed) cleanupCreatedDirectories(authority);
    await closeLedgerAuthority(authority);
  }
}

async function acquireLedgerAuthority(
  ledgerPath,
  ops,
  { createMissing = false } = {}
) {
  const projectRoot = path.resolve(path.dirname(ledgerPath), '../../../..');
  const expectedLedgerPath = path.join(
    projectRoot,
    ...PRIVATE_COMPONENTS,
    'chapter-ledger.json'
  );
  if (expectedLedgerPath !== ledgerPath) privateAuthorityInvalid();
  const authority = {
    projectRoot,
    root: null,
    chain: [],
    createdDirectories: [],
    p7: null
  };
  try {
    authority.root = await openAbsoluteDirectory(ops, projectRoot);
    let parent = authority.root;
    for (const basename of PRIVATE_COMPONENTS) {
      const node = await openRetainedDirectory(ops, parent.handle, basename, {
        createMissing,
        createdDirectories: authority.createdDirectories
      });
      authority.chain.push({ ...node, parent, basename });
      parent = node;
      await assertLedgerAuthority(authority, ops);
    }
    authority.p7 = parent;
    await assertLedgerAuthority(authority, ops);
    return authority;
  } catch (error) {
    cleanupCreatedDirectories(authority);
    await closeLedgerAuthority(authority);
    throw error;
  }
}

async function openAbsoluteDirectory(ops, directory) {
  let handle;
  try {
    const before = await ops.lstat(directory);
    if (before.isSymbolicLink() || !before.isDirectory()) privateAuthorityInvalid();
    handle = await ops.open(directory, DIRECTORY_FLAGS);
    const opened = await handle.stat();
    const after = await ops.lstat(directory);
    if (!opened.isDirectory() || after.isSymbolicLink() || !after.isDirectory()
      || !sameIdentity(before, opened) || !sameIdentity(opened, after)) {
      privateAuthorityInvalid();
    }
    return { handle, identity: opened };
  } catch (error) {
    try { await handle?.close(); } catch {}
    if (error?.code === 'ELOOP' || error?.code === 'ENOTDIR') privateAuthorityInvalid();
    throw error;
  }
}

async function openRetainedDirectory(
  ops,
  parentHandle,
  basename,
  { createMissing = false, createdDirectories } = {}
) {
  const target = entry(parentHandle, basename);
  if (createMissing) {
    try {
      mkdirSync(target, { mode: 0o700 });
      return bindCreatedDirectory(
        parentHandle,
        basename,
        target,
        createdDirectories
      );
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }

  let handle;
  try {
    const before = await ops.lstat(target);
    if (before.isSymbolicLink() || !before.isDirectory()) privateAuthorityInvalid();
    handle = await ops.open(target, DIRECTORY_FLAGS);
    const opened = await handle.stat();
    if (!opened.isDirectory() || !sameIdentity(before, opened)) {
      privateAuthorityInvalid();
    }
    const after = await ops.lstat(target);
    if (!opened.isDirectory() || after.isSymbolicLink() || !after.isDirectory()
      || !sameIdentity(before, opened) || !sameIdentity(opened, after)) {
      privateAuthorityInvalid();
    }
    return { handle, identity: opened };
  } catch (error) {
    try { await handle?.close(); } catch {}
    if (error?.code === 'ELOOP' || error?.code === 'ENOTDIR') privateAuthorityInvalid();
    throw error;
  }
}

function bindCreatedDirectory(
  parentHandle,
  basename,
  target,
  createdDirectories
) {
  let fd;
  try {
    const before = lstatSync(target);
    if (before.isSymbolicLink() || !before.isDirectory()) privateAuthorityInvalid();
    fd = openSync(target, DIRECTORY_FLAGS);
    const opened = fstatSync(fd);
    const after = lstatSync(target);
    if (!opened.isDirectory() || after.isSymbolicLink() || !after.isDirectory()
      || !sameIdentity(before, opened) || !sameIdentity(opened, after)) {
      privateAuthorityInvalid();
    }
    const handle = retainedDirectoryHandle(fd);
    fd = undefined;
    createdDirectories?.push({
      parentHandle,
      basename,
      handle,
      identity: opened
    });
    return { handle, identity: opened };
  } catch (error) {
    if (fd !== undefined) {
      try { closeSync(fd); } catch {}
    }
    if (error?.code === 'ELOOP' || error?.code === 'ENOTDIR') privateAuthorityInvalid();
    throw error;
  }
}

function retainedDirectoryHandle(fd) {
  let closed = false;
  return {
    fd,
    async stat() {
      return fstatSync(fd);
    },
    async close() {
      if (closed) return;
      closed = true;
      closeSync(fd);
    }
  };
}

async function assertLedgerAuthority(authority, ops) {
  const rootRetained = await authority.root.handle.stat();
  const rootNamed = await ops.lstat(authority.projectRoot);
  if (!rootRetained.isDirectory() || rootNamed.isSymbolicLink() || !rootNamed.isDirectory()
    || !sameIdentity(rootRetained, authority.root.identity)
    || !sameIdentity(rootNamed, authority.root.identity)) privateAuthorityInvalid();
  for (const node of authority.chain) {
    const retained = await node.handle.stat();
    const named = await ops.lstat(entry(node.parent.handle, node.basename));
    if (!retained.isDirectory() || named.isSymbolicLink() || !named.isDirectory()
      || !sameIdentity(retained, node.identity)
      || !sameIdentity(named, node.identity)) privateAuthorityInvalid();
  }
}

async function flockExclusive(handle) {
  await new Promise((resolve, reject) => {
    const child = spawn(FLOCK_BINARY, ['--exclusive', '3'], {
      stdio: ['ignore', 'ignore', 'ignore', handle.fd]
    });
    child.once('error', () => reject(new Error('ledger advisory lock failed')));
    child.once('close', (code) => code === 0
      ? resolve()
      : reject(new Error('ledger advisory lock failed')));
  });
}

async function closeLedgerAuthority(authority) {
  const handles = [
    ...(authority?.chain || []).map((node) => node.handle).reverse(),
    ...(authority?.createdDirectories || []).map((node) => node.handle).reverse(),
    authority?.root?.handle
  ];
  await Promise.all([...new Set(handles)].map(async (handle) => {
    try { await handle?.close(); } catch {}
  }));
}

function cleanupCreatedDirectories(authority) {
  for (const created of [...(authority?.createdDirectories || [])].reverse()) {
    removeExactOwnedEmptyDirectory(created);
  }
}

function removeExactOwnedEmptyDirectory({
  parentHandle,
  basename,
  handle,
  identity
}) {
  try {
    const retained = fstatSync(handle.fd);
    const target = entry(parentHandle, basename);
    const named = lstatSync(target);
    if (
      !retained.isDirectory()
      || !named.isDirectory()
      || named.isSymbolicLink()
      || !sameIdentity(retained, identity)
      || !sameIdentity(named, identity)
    ) return;
    rmdirSync(target);
  } catch {}
}

async function assertRegularLedger(ledgerPath, ops, { allowMissing = false } = {}) {
  const authority = await lstatOrNull(ledgerPath, ops);
  if (!authority) {
    if (allowMissing) return null;
    fail('PLAYBOOK_CHAPTER_LEDGER_MISSING', 'ledger', 'ledger not initialized');
  }
  if (!authority.isFile() || authority.isSymbolicLink()) privateAuthorityInvalid();
  return authority;
}

async function lstatOrNull(target, ops) {
  try {
    return await ops.lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw sanitizeReadError(error);
  }
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function descriptor(handle) { return `/proc/self/fd/${handle.fd}`; }
function entry(handle, basename) { return `${descriptor(handle)}/${basename}`; }

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
  if (error?.code?.startsWith?.('PLAYBOOK_')) return error;
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

function privateAuthorityInvalid() {
  fail('PLAYBOOK_PRIVATE_PATH_ESCAPE', 'privatePath', 'private storage rejected');
}

function fail(code, valuePath, detail) {
  failPlaybookContract(code, valuePath, detail);
}
