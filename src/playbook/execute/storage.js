import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  executeError,
  sanitizeExecuteError,
  validateRepairPlanningFailureEvidence,
  validateReplayFailureEvidence
} from './contracts.js';
import { sha256, stableJson } from '../shadow/canonical.js';
import {
  assertCandidateId,
  assertImmutableHistory,
  CANDIDATE_IDS,
  cloneFileMap,
  CURRENT_CHAIN_BASENAME,
  expectedDirectoriesFor,
  normalizeCandidateSnapshot,
  normalizeInitialFailureFiles,
  normalizeSelectionFiles,
  sameFileMap,
  SELECTION_PATHS,
  selectionProjectionForCandidateEvidence,
  sortFileMap,
  validateCandidateEvidence,
  validateCandidateFiles
} from './storageValidation.js';
import {
  moveIdentityNoReplace
} from './storageTransaction.js';

const OUTPUT_BASENAME = 'playbook-execute';
const CANDIDATES_BASENAME = 'candidates';
const SELECTION_GENERATIONS_BASENAME = 'selection-generations';
const STAGE_PREFIX = '.playbook-execute.stage-';
const BACKUP_PREFIX = '.playbook-execute.backup-';
const MOVE_BINARY = '/usr/bin/mv';
const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const WRITE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
const UNSAFE_PATH_CHARACTER = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const HASH = /^[a-f0-9]{64}$/u;
const AUTHORITIES = new WeakMap();
let temporarySequence = 0;

export async function createExecuteRun({ outRoot, runBasename, fsImpl } = {}) {
  if (!isSafeAbsolutePath(outRoot) || !isPlainBasename(runBasename)) {
    throw executeError('P5_AUTHORITY_INVALID');
  }
  const ops = fsOperations(fsImpl);
  let parentHandle;
  let runHandle;
  let created = false;
  let createdRunIdentity;
  try {
    parentHandle = await openOrCreateAbsoluteDirectory(ops, outRoot);
    const target = descriptorEntryPath(parentHandle, runBasename);
    try {
      await ops.mkdir(target, { recursive: false, mode: 0o700 });
      created = true;
    } catch (error) {
      throw publicError(error, 'P5_OUTPUT_OWNERSHIP');
    }
    runHandle = await openDirectoryEntry(
      ops, parentHandle, runBasename, 'P5_AUTHORITY_INVALID', 'P5_OUTPUT_OWNERSHIP'
    );
    const parentIdentity = identity(await parentHandle.stat());
    const runIdentity = identity(await runHandle.stat());
    createdRunIdentity = runIdentity;
    await parentHandle.sync();
    const after = await ops.lstat(target);
    if (after.isSymbolicLink() || !after.isDirectory() || !sameIdentity(identity(after), runIdentity)) {
      throw executeError('P5_OUTPUT_OWNERSHIP');
    }
    const runDir = path.join(outRoot, runBasename);
    return Object.freeze({
      runDir,
      authority: createAuthority({
        ops, parentHandle, runHandle, runBasename, parentIdentity, runIdentity,
        runDir, closed: false
      })
    });
  } catch (error) {
    await closeHandle(runHandle);
    if (created && parentHandle && createdRunIdentity) {
      try {
        const target = descriptorEntryPath(parentHandle, runBasename);
        const stat = await ops.lstat(target);
        const entries = await ops.readdir(target);
        if (!stat.isSymbolicLink() && stat.isDirectory()
          && sameIdentity(identity(stat), createdRunIdentity) && entries.length === 0) await ops.rmdir(target);
      } catch {}
    }
    await closeHandle(parentHandle);
    throw publicError(error, admissionFallback(error));
  }
}

export async function admitExecuteRun({ runDir, fsImpl } = {}) {
  if (!isSafeAbsolutePath(runDir)) throw executeError('P5_AUTHORITY_INVALID');
  const ops = fsOperations(fsImpl);
  let parentHandle;
  let runHandle;
  try {
    ({ parentHandle, runHandle } = await openAbsoluteRun(ops, runDir));
    const internal = {
      ops,
      parentHandle,
      runHandle,
      runBasename: path.basename(runDir),
      parentIdentity: identity(await parentHandle.stat()),
      runIdentity: identity(await runHandle.stat()),
      runDir,
      closed: false
    };
    return createAuthority(internal);
  } catch (error) {
    await closeHandles([runHandle, parentHandle]);
    throw publicError(error, admissionFallback(error));
  }
}

export async function createReplayWorkspace({ authority, candidateId, fsImpl } = {}) {
  const internal = authorityInternal(authority);
  assertCandidateId(candidateId);
  const ops = fsOperations(fsImpl ?? internal.ops.source);
  let workHandle;
  try {
    await assertRunAuthority(internal, ops);
    const work = await openOrCreateRunChild(internal, ops, 'candidate-work');
    workHandle = work.handle;
    const basename = `replay-${candidateId}-attempt-01-${process.pid}-${++temporarySequence}`;
    await ops.mkdir(descriptorEntryPath(workHandle, basename), { recursive: false, mode: 0o700 });
    const attempt = await openDirectoryEntry(ops, workHandle, basename, 'P5_INSTALL_FAILED', 'P5_INSTALL_FAILED');
    try { await attempt.sync(); } finally { await closeHandle(attempt); }
    await workHandle.sync();
    await assertRunAuthority(internal, ops);
    return path.join(internal.runDir, 'candidate-work', basename);
  } catch (error) {
    throw publicError(error, 'P5_INSTALL_FAILED');
  } finally {
    await closeHandle(workHandle);
  }
}

export async function pruneCandidateWorkspaces({ authority, keepPath, fsImpl } = {}) {
  const internal = authorityInternal(authority);
  const ops = fsOperations(fsImpl ?? internal.ops.source);
  const keep = typeof keepPath === 'string'
    && path.dirname(keepPath) === path.join(internal.runDir, 'candidate-work')
    ? path.basename(keepPath) : null;
  let workHandle;
  try {
    await assertRunAuthority(internal, ops);
    workHandle = await openDirectoryEntry(
      ops, internal.runHandle, 'candidate-work', 'P5_INSTALL_FAILED', 'P5_OUTPUT_OWNERSHIP'
    );
    for (const name of (await ops.readdir(descriptorPath(workHandle))).sort()) {
      if (name === keep) continue;
      if (!isPlainBasename(name)) throw executeError('P5_OUTPUT_OWNERSHIP');
      const target = descriptorEntryPath(workHandle, name);
      const before = await ops.lstat(target);
      if (before.isSymbolicLink() || !before.isDirectory()) throw executeError('P5_OUTPUT_OWNERSHIP');
      const handle = await ops.open(target, DIRECTORY_FLAGS);
      try {
        const opened = await handle.stat();
        if (!opened.isDirectory() || !sameIdentity(identity(before), identity(opened))) {
          throw executeError('P5_OUTPUT_OWNERSHIP');
        }
      } finally { await closeHandle(handle); }
      await ops.rm(target, { recursive: true, force: false });
    }
    await workHandle.sync();
  } catch (error) {
    if (isMissingError(error)) return;
    throw publicError(error, 'P5_INSTALL_FAILED');
  } finally { await closeHandle(workHandle); }
}

export async function installCandidateSnapshot({
  authority,
  candidateId,
  files,
  currentChain,
  expectedPreviousChainSha256,
  fsImpl
} = {}) {
  const internal = authorityInternal(authority);
  let incoming;
  try {
    incoming = normalizeCandidateSnapshot({ candidateId, files, currentChain });
    if (
      expectedPreviousChainSha256 !== undefined
      && expectedPreviousChainSha256 !== null
      && (typeof expectedPreviousChainSha256 !== 'string' || !HASH.test(expectedPreviousChainSha256))
    ) throw executeError('P5_AUTHORITY_INVALID');
  } catch (error) {
    throw publicError(error, 'P5_AUTHORITY_INVALID');
  }

  const ops = fsOperations(fsImpl ?? internal.ops.source);
  let tree;
  let existing;
  let stage;
  let backupName;
  let oldMoved = false;
  let newInstalled = false;
  try {
    tree = await openExecuteTree(internal, ops, { create: true });
    existing = await inspectCandidate(internal, ops, tree, candidateId, { allowMissing: true });
    if (!existing) {
      if (expectedPreviousChainSha256 !== undefined && expectedPreviousChainSha256 !== null) {
        throw executeError('P5_STALE_BASE');
      }
    } else {
      if (expectedPreviousChainSha256 !== existing.validated.currentChainSha256) {
        throw executeError('P5_STALE_BASE');
      }
      assertImmutableHistory(existing.files, incoming.files);
      if (sameFileMap(existing.files, incoming.files)) {
        await closeExecuteTree(tree);
        tree = undefined;
        return frozenInstallResult('unchanged', candidateId, incoming.currentChainSha256);
      }
      await publishCandidateUpdate({ internal, ops, tree, existing, incoming, candidateId });
      await closeExecuteTree(tree);
      tree = undefined;
      return frozenInstallResult('replaced', candidateId, incoming.currentChainSha256);
    }

    stage = await createCandidateStage(internal, ops, tree, incoming);
    if (existing) {
      const current = await inspectCandidate(internal, ops, tree, candidateId, { allowMissing: false });
      if (!sameIdentity(current.identity, existing.identity) || !sameFileMap(current.files, existing.files)) {
        throw executeError('P5_INSTALL_FAILED');
      }
      backupName = await unusedTemporaryBasename(
        internal,
        ops,
        tree,
        tree.candidatesHandle,
        BACKUP_PREFIX
      );
      await renameExpectedDirectoryNoReplace(
        internal,
        ops,
        tree,
        tree.candidatesHandle,
        candidateId,
        backupName,
        existing.identity
      );
      oldMoved = true;
      await syncDirectory(internal, ops, tree, tree.candidatesHandle);
      await verifyCandidateDirectory(
        internal,
        ops,
        tree,
        backupName,
        existing.identity,
        existing.files,
        candidateId
      );
    } else {
      const collision = await inspectCandidate(internal, ops, tree, candidateId, { allowMissing: true });
      if (collision) throw executeError('P5_INSTALL_FAILED');
    }

    await renameExpectedDirectoryNoReplace(
      internal,
      ops,
      tree,
      tree.candidatesHandle,
      stage.basename,
      candidateId,
      stage.identity
    );
    newInstalled = true;
    await closeHandle(stage.handle);
    stage.handle = undefined;
    await syncDirectory(internal, ops, tree, tree.candidatesHandle);
    await verifyCandidateDirectory(
      internal,
      ops,
      tree,
      candidateId,
      stage.identity,
      incoming.files,
      candidateId
    );
  } catch (error) {
    await closeHandle(stage?.handle);
    if (tree && stage) {
      newInstalled ||= await namedDirectoryHasIdentity(
        tree.candidatesHandle,
        ops,
        candidateId,
        stage.identity
      );
    }
    if (tree && backupName && existing) {
      oldMoved ||= await namedDirectoryHasIdentity(
        tree.candidatesHandle,
        ops,
        backupName,
        existing.identity
      );
    }
    let rollbackFailed = false;
    if (tree && newInstalled && stage) {
      try {
        await removeVerifiedDirectory(
          internal,
          ops,
          tree,
          tree.candidatesHandle,
          candidateId,
          stage.identity,
          incoming.files,
          { requireComplete: true, verifyBytes: true }
        );
        newInstalled = false;
      } catch {
        rollbackFailed = true;
      }
    } else if (tree && stage) {
      try {
        await removeVerifiedDirectory(
          internal,
          ops,
          tree,
          tree.candidatesHandle,
          stage.basename,
          stage.identity,
          incoming.files,
          { allowMissing: true, requireComplete: false, verifyBytes: false }
        );
      } catch {
        rollbackFailed = true;
      }
    }
    if (tree && oldMoved && backupName && existing) {
      try {
        await rollbackCandidateBackup(
          internal,
          ops,
          tree,
          backupName,
          candidateId,
          existing
        );
        oldMoved = false;
      } catch {
        rollbackFailed = true;
      }
    }
    if (tree && !newInstalled) {
      try {
        await rollbackCreatedExecuteTree(internal, ops, tree);
      } catch {
        rollbackFailed = true;
      }
    }
    await closeExecuteTree(tree);
    if (rollbackFailed) throw executeError('P5_INSTALL_FAILED');
    throw publicError(error, 'P5_INSTALL_FAILED');
  }

  if (backupName) {
    try {
      await removeVerifiedDirectory(
        internal,
        ops,
        tree,
        tree.candidatesHandle,
        backupName,
        existing.identity,
        existing.files,
        { requireComplete: true, verifyBytes: true }
      );
      oldMoved = false;
    } catch {
      // The new generation is already verified and committed. Old retirement is
      // best-effort and can only leave a fixed-prefix residue behind.
    }
  }

  await closeExecuteTree(tree);
  return frozenInstallResult(existing ? 'replaced' : 'created', candidateId, incoming.currentChainSha256);
}

export async function readCurrentCandidateSnapshot({ authority, candidateId, fsImpl } = {}) {
  const internal = authorityInternal(authority);
  assertCandidateId(candidateId);
  const ops = fsOperations(fsImpl ?? internal.ops.source);
  let tree;
  try {
    tree = await openExecuteTree(internal, ops, { create: false });
    const candidate = await inspectCandidate(internal, ops, tree, candidateId, { allowMissing: false });
    if (candidate.validated.kind !== 'accepted') throw executeError('P5_OUTPUT_OWNERSHIP');
    const currentChain = currentChainBytes(candidate);
    return Object.freeze({
      candidate_id: candidateId,
      current_chain_sha256: candidate.validated.currentChainSha256,
      current_chain: currentChain,
      files: cloneFileMap(candidate.files)
    });
  } catch (error) {
    throw publicError(error, 'P5_OUTPUT_OWNERSHIP');
  } finally {
    await closeExecuteTree(tree);
  }
}

export async function inspectCandidateEvidence({ authority, candidateId, fsImpl } = {}) {
  const internal = authorityInternal(authority);
  const ops = fsOperations(fsImpl ?? internal.ops.source);
  let tree;
  try {
    tree = await openExecuteTree(internal, ops, { create: false });
    const candidate = await inspectCandidate(internal, ops, tree, candidateId, { allowMissing: false });
    return candidate.validated.kind === 'accepted'
      ? Object.freeze({ kind: 'accepted', candidate_id: candidateId, current_chain_sha256: candidate.validated.currentChainSha256, current_chain: currentChainBytes(candidate), files: cloneFileMap(candidate.files) })
      : Object.freeze({ kind: 'initial-failed', candidate_id: candidateId, failure: candidate.validated.failure, files: cloneFileMap(candidate.files) });
  } catch (error) {
    throw publicError(error, 'P5_OUTPUT_OWNERSHIP');
  } finally { await closeExecuteTree(tree); }
}

export async function installInitialCandidateFailure({ authority, candidateId, files, fsImpl } = {}) {
  const internal = authorityInternal(authority);
  let incoming;
  try { incoming = normalizeInitialFailureFiles({ candidateId, files }); }
  catch (error) { throw publicError(error, 'P5_AUTHORITY_INVALID'); }
  const ops = fsOperations(fsImpl ?? internal.ops.source);
  let tree; let stage; let installed = false;
  try {
    tree = await openExecuteTree(internal, ops, { create: true });
    if (await inspectCandidate(internal, ops, tree, candidateId, { allowMissing: true })) throw executeError('P5_OUTPUT_OWNERSHIP');
    stage = await createCandidateStage(internal, ops, tree, incoming);
    await renameExpectedDirectoryNoReplace(internal, ops, tree, tree.candidatesHandle, stage.basename, candidateId, stage.identity);
    installed = true;
    await closeHandle(stage.handle); stage.handle = undefined;
    await syncDirectory(internal, ops, tree, tree.candidatesHandle);
    await verifyCandidateDirectory(internal, ops, tree, candidateId, stage.identity, incoming.files, candidateId);
    return Object.freeze({ status: 'created', candidate_id: candidateId });
  } catch (error) {
    await closeHandle(stage?.handle);
    if (tree && stage) installed ||= await namedDirectoryHasIdentity(tree.candidatesHandle, ops, candidateId, stage.identity);
    try {
      if (tree && stage) await removeVerifiedDirectory(internal, ops, tree, tree.candidatesHandle,
        installed ? candidateId : stage.basename, stage.identity, incoming.files, { requireComplete: true, verifyBytes: true });
    } catch {}
    throw publicError(error, error?.code === 'P5_OUTPUT_OWNERSHIP' ? 'P5_OUTPUT_OWNERSHIP' : 'P5_INSTALL_FAILED');
  } finally { await closeExecuteTree(tree); }
}

export async function appendCandidateFailureEvidence({ authority, candidateId, evidence, expectedCurrentChainSha256, fsImpl } = {}) {
  const validated = validateReplayFailureEvidence(evidence);
  return appendCandidateFailureRecord({ authority, candidateId, validated, expectedCurrentChainSha256,
    fileName: 'attempt-01.json', fsImpl, validationCode: 'P5_REPLAY_FAILED' });
}

export async function appendCandidateRepairPlanningFailureEvidence({ authority, candidateId, evidence, expectedCurrentChainSha256, fsImpl } = {}) {
  const validated = validateRepairPlanningFailureEvidence(evidence);
  return appendCandidateFailureRecord({ authority, candidateId, validated, expectedCurrentChainSha256,
    fileName: 'repair-attempt-01.json', fsImpl, validationCode: 'P5_REPAIR_INVALID' });
}

async function appendCandidateFailureRecord({ authority, candidateId, validated, expectedCurrentChainSha256, fileName, fsImpl, validationCode }) {
  const internal = authorityInternal(authority);
  if (validated.candidate_id !== candidateId || validated.current_chain_sha256 !== expectedCurrentChainSha256) {
    throw executeError(validationCode);
  }
  const bytes = Buffer.from(stableJson(validated));
  const ops = fsOperations(fsImpl ?? internal.ops.source);
  let tree; let candidateHandle; let stageHandle; let stageBasename; let stageIdentity; let committed = false;
  try {
    tree = await openExecuteTree(internal, ops, { create: false });
    const existing = await inspectCandidate(internal, ops, tree, candidateId, { allowMissing: false });
    if (existing.validated.kind !== 'accepted' || existing.validated.currentChainSha256 !== expectedCurrentChainSha256
      || Object.keys(existing.files).some((name) => name.startsWith('failures/'))
      || Object.keys(existing.files).some((name) => name.startsWith('repairs/'))) {
      throw executeError('P5_STALE_BASE');
    }
    candidateHandle = await openDirectoryEntry(ops, tree.candidatesHandle, candidateId, 'P5_OUTPUT_OWNERSHIP', 'P5_OUTPUT_OWNERSHIP');
    if (!sameIdentity(identity(await candidateHandle.stat()), existing.identity)) throw executeError('P5_OUTPUT_OWNERSHIP');
    stageBasename = await unusedTemporaryBasename(internal, ops, tree, tree.candidatesHandle, STAGE_PREFIX);
    await ops.mkdir(descriptorEntryPath(tree.candidatesHandle, stageBasename), { recursive: false, mode: 0o700 });
    stageHandle = await openDirectoryEntry(ops, tree.candidatesHandle, stageBasename, 'P5_INSTALL_FAILED', 'P5_INSTALL_FAILED');
    stageIdentity = identity(await stageHandle.stat());
    let fileHandle;
    try {
      fileHandle = await ops.open(descriptorEntryPath(stageHandle, fileName), WRITE_FLAGS, 0o600);
      await fileHandle.writeFile(bytes); await fileHandle.sync(); await fileHandle.chmod(0o400); await fileHandle.sync();
    } finally { await closeHandle(fileHandle); }
    await stageHandle.sync();
    await moveIdentityNoReplace({
      ops, sourceHandle: tree.candidatesHandle, sourceName: stageBasename,
      destinationHandle: candidateHandle, destinationName: 'failures', expectedIdentity: stageIdentity,
      expectedKind: 'directory',
      beforeMove: async () => {
        await assertNamedDirectoryIdentity(tree.candidatesHandle, ops, candidateId, existing.identity, 'P5_OUTPUT_OWNERSHIP');
        const current = await readRegularFile(ops, candidateHandle, CURRENT_CHAIN_BASENAME, 'P5_OUTPUT_OWNERSHIP');
        let pointer;
        try { pointer = JSON.parse(current.bytes.toString('utf8')); } catch { throw executeError('P5_STALE_BASE'); }
        if (pointer.chain_sha256 !== expectedCurrentChainSha256) throw executeError('P5_STALE_BASE');
      },
      moveForward: () => ops.renameNoReplaceBetween(tree.candidatesHandle, stageBasename, candidateHandle, 'failures'),
      moveReverse: () => ops.renameNoReplaceBetween(candidateHandle, 'failures', tree.candidatesHandle, stageBasename),
      afterMove: async () => { await candidateHandle.sync(); await tree.candidatesHandle.sync(); }
    });
    const checked = await inspectCandidate(internal, ops, tree, candidateId, { allowMissing: false });
    if (!checked.files[`failures/${fileName}`]?.equals(bytes) || checked.validated.currentChainSha256 !== expectedCurrentChainSha256) {
      throw executeError('P5_INSTALL_FAILED');
    }
    committed = true;
    return Object.freeze({ status: 'created', path: `failures/${fileName}` });
  } catch (error) {
    try {
      if (!committed && stageHandle && stageIdentity
        && await namedDirectoryHasIdentity(candidateHandle, ops, 'failures', stageIdentity)) {
        const rollbackBasename = await unusedTemporaryBasename(internal, ops, tree, tree.candidatesHandle, STAGE_PREFIX);
        let reversed = false;
        for (let attempt = 0; attempt < 2 && !reversed; attempt += 1) {
          try {
            await moveIdentityNoReplace({
              ops, sourceHandle: candidateHandle, sourceName: 'failures', destinationHandle: tree.candidatesHandle,
              destinationName: rollbackBasename, expectedIdentity: stageIdentity, expectedKind: 'directory',
              moveForward: () => ops.renameNoReplaceBetween(candidateHandle, 'failures', tree.candidatesHandle, rollbackBasename),
              moveReverse: () => ops.renameNoReplaceBetween(tree.candidatesHandle, rollbackBasename, candidateHandle, 'failures')
            });
            reversed = true;
          } catch {
            reversed = await namedDirectoryHasIdentity(tree.candidatesHandle, ops, rollbackBasename, stageIdentity);
          }
        }
        if (!reversed) throw executeError('P5_INSTALL_FAILED');
        stageBasename = rollbackBasename;
        await candidateHandle.sync(); await tree.candidatesHandle.sync();
      }
      if (!committed && stageHandle && stageBasename
        && await namedDirectoryHasIdentity(tree.candidatesHandle, ops, stageBasename, stageIdentity)) {
        const read = await readRegularFile(ops, stageHandle, fileName, 'P5_INSTALL_FAILED');
        if (!read.bytes.equals(bytes)) throw executeError('P5_INSTALL_FAILED');
        await ops.unlink(descriptorEntryPath(stageHandle, fileName));
        await closeHandle(stageHandle); stageHandle = undefined;
        await ops.rmdir(descriptorEntryPath(tree.candidatesHandle, stageBasename));
        await tree.candidatesHandle.sync();
      }
    } catch {}
    throw executeError(error?.code === 'P5_STALE_BASE' ? 'P5_STALE_BASE' : 'P5_INSTALL_FAILED');
  } finally {
    await closeHandles([stageHandle, candidateHandle]); await closeExecuteTree(tree);
  }
}

export async function installExecuteSelection({ authority, files, fsImpl } = {}) {
  const internal = authorityInternal(authority);
  let normalized;
  try {
    normalized = normalizeSelectionFiles(files);
  } catch (error) {
    throw publicError(error, 'P5_AUTHORITY_INVALID');
  }
  const ops = fsOperations(fsImpl ?? internal.ops.source);
  let tree;
  try {
    tree = await openExecuteTree(internal, ops, { create: false });
    const boundCandidates = [];
    for (const candidateId of CANDIDATE_IDS) {
      const candidate = await inspectCandidate(internal, ops, tree, candidateId, { allowMissing: true });
      if (!candidate) throw executeError('P5_AUTHORITY_INVALID');
      const row = normalized.selection.candidates.find((item) => item.candidate_id === candidateId);
      const projection = selectionProjectionForCandidateEvidence(candidateId, candidate.files, {
        requireCurrentReviews: normalized.selection.selected_candidate_id === candidateId
      });
      if (!row || row.current_chain_sha256 !== projection.current_chain_sha256
        || projection.kind === 'accepted' && row.seed !== projection.seed
        || row.hard_qa_sha256 !== projection.hard_qa_sha256
        || row.p4_review_sha256 !== projection.p4_review_sha256
        || row.repair_attempt_count !== projection.repair_attempt_count
        || stableJson(row.eligibility) !== stableJson(projection.eligibility)
        || normalized.selection.selected_candidate_id === candidateId
          && (projection.kind !== 'accepted' || projection.eligibility.status !== 'eligible')) {
        throw executeError('P5_INSTALL_FAILED');
      }
      boundCandidates.push({ candidateId, identity: candidate.identity, files: candidate.files });
    }
    const assertBoundCandidates = async () => {
      for (const bound of boundCandidates) {
        const current = await inspectCandidate(internal, ops, tree, bound.candidateId, { allowMissing: false });
        if (!sameIdentity(current.identity, bound.identity) || !sameFileMap(current.files, bound.files)) {
          throw executeError('P5_INSTALL_FAILED');
        }
      }
    };
    await assertBoundCandidates();
    const existing = tree.selection;
    if (existing && sameFileMap(existing.files, normalized.files)) {
      await assertBoundCandidates();
      return Object.freeze({
        status: 'unchanged',
        artifact_hashes: normalized.artifactHashes,
        generation: existing.pointer.generation
      });
    }
    await publishSelectionGeneration({
      internal, ops, tree, files: normalized.files, existing,
      assertBoundCandidates
    });
    return Object.freeze({
      status: existing ? 'replaced' : 'created',
      artifact_hashes: normalized.artifactHashes,
      generation: `selection-generations/selection-${sha256(normalized.files['manifest.json'])}`
    });
  } catch (error) {
    throw executeError('P5_INSTALL_FAILED');
  } finally {
    await closeExecuteTree(tree);
  }
}

async function publishSelectionGeneration({ internal, ops, tree, files, existing, assertBoundCandidates }) {
  let generationsHandle;
  let stageHandle;
  let stageName;
  let pointerStage;
  let pointerBackup;
  let pointerReplaced = false;
  try {
    const generationsPath = descriptorEntryPath(tree.rootHandle, SELECTION_GENERATIONS_BASENAME);
    try {
      const stat = await ops.lstat(generationsPath);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw executeError('P5_OUTPUT_OWNERSHIP');
    } catch (error) {
      if (!isMissingError(error)) throw error;
      await ops.mkdir(generationsPath, { recursive: false, mode: 0o700 });
      await tree.rootHandle.sync();
    }
    generationsHandle = await openDirectoryEntry(
      ops, tree.rootHandle, SELECTION_GENERATIONS_BASENAME,
      'P5_INSTALL_FAILED', 'P5_OUTPUT_OWNERSHIP'
    );
    const manifestHash = sha256(files['manifest.json']);
    const generationName = `selection-${manifestHash}`;
    let generationExists = false;
    try {
      const existingGeneration = await openDirectoryEntry(
        ops, generationsHandle, generationName, 'P5_INSTALL_FAILED', 'P5_OUTPUT_OWNERSHIP'
      );
      try {
        for (const name of SELECTION_PATHS) {
          const read = await readRegularFile(ops, existingGeneration, name, 'P5_OUTPUT_OWNERSHIP');
          if (!read.bytes.equals(files[name]) || (read.mode & 0o777) !== 0o400) {
            throw executeError('P5_OUTPUT_OWNERSHIP');
          }
        }
        generationExists = true;
      } finally { await closeHandle(existingGeneration); }
    } catch (error) {
      if (!isMissingError(error) && error?.code !== 'P5_INSTALL_FAILED') throw error;
    }
    if (!generationExists) {
      stageName = await unusedTemporaryBasename(internal, ops, tree, generationsHandle, STAGE_PREFIX);
      await ops.mkdir(descriptorEntryPath(generationsHandle, stageName), { recursive: false, mode: 0o700 });
      stageHandle = await openDirectoryEntry(
        ops, generationsHandle, stageName, 'P5_INSTALL_FAILED', 'P5_INSTALL_FAILED'
      );
      for (const name of SELECTION_PATHS) {
        let handle;
        try {
          handle = await ops.open(descriptorEntryPath(stageHandle, name), WRITE_FLAGS, 0o600);
          await handle.writeFile(files[name]);
          await handle.sync();
          await handle.chmod(0o400);
          await handle.sync();
        } finally { await closeHandle(handle); }
      }
      await stageHandle.sync();
      const stageIdentity = identity(await stageHandle.stat());
      await closeHandle(stageHandle); stageHandle = undefined;
      await moveIdentityNoReplace({
        ops,
        sourceHandle: generationsHandle,
        sourceName: stageName,
        destinationHandle: generationsHandle,
        destinationName: generationName,
        expectedIdentity: stageIdentity,
        expectedKind: 'directory',
        moveForward: () => ops.renameNoReplace(generationsHandle, stageName, generationName),
        moveReverse: () => ops.renameNoReplace(generationsHandle, generationName, stageName),
        beforeMove: async () => { await assertTreeAuthority(internal, ops, tree); await assertBoundCandidates(); },
        afterMove: () => generationsHandle.sync()
      });
      stageName = undefined;
    }

    const pointerBytes = Buffer.from(stableJson({
      schema_version: 1,
      generation: `${SELECTION_GENERATIONS_BASENAME}/${generationName}`,
      manifest_sha256: manifestHash
    }));
    if (existing && existing.pointer.generation === `${SELECTION_GENERATIONS_BASENAME}/${generationName}`) return;
    pointerStage = await unusedTemporaryBasename(internal, ops, tree, tree.rootHandle, STAGE_PREFIX);
    let pointerHandle;
    try {
      pointerHandle = await ops.open(descriptorEntryPath(tree.rootHandle, pointerStage), WRITE_FLAGS, 0o600);
      await pointerHandle.writeFile(pointerBytes);
      await pointerHandle.sync();
    } finally { await closeHandle(pointerHandle); }
    await assertBoundCandidates();
    if (existing) {
      pointerBackup = await unusedTemporaryBasename(internal, ops, tree, tree.rootHandle, BACKUP_PREFIX);
      await ops.link(
        descriptorEntryPath(tree.rootHandle, 'manifest.json'),
        descriptorEntryPath(tree.rootHandle, pointerBackup)
      );
      await tree.rootHandle.sync();
      await ops.rename(
        descriptorEntryPath(tree.rootHandle, pointerStage),
        descriptorEntryPath(tree.rootHandle, 'manifest.json')
      );
    } else {
      await moveIdentityNoReplace({
        ops,
        sourceHandle: tree.rootHandle,
        sourceName: pointerStage,
        destinationHandle: tree.rootHandle,
        destinationName: 'manifest.json',
        expectedIdentity: identity(await ops.lstat(descriptorEntryPath(tree.rootHandle, pointerStage))),
        expectedKind: 'file',
        moveForward: () => ops.renameNoReplace(tree.rootHandle, pointerStage, 'manifest.json'),
        moveReverse: () => ops.renameNoReplace(tree.rootHandle, 'manifest.json', pointerStage)
      });
    }
    pointerStage = undefined;
    pointerReplaced = true;
    await tree.rootHandle.sync();
    const installed = await readRegularFile(ops, tree.rootHandle, 'manifest.json', 'P5_INSTALL_FAILED');
    if (!installed.bytes.equals(pointerBytes)) throw executeError('P5_INSTALL_FAILED');
    pointerReplaced = false;
    if (pointerBackup) {
      try { await ops.unlink(descriptorEntryPath(tree.rootHandle, pointerBackup)); } catch {}
      pointerBackup = undefined;
    }
  } catch (error) {
    if (pointerReplaced && pointerBackup) {
      try {
        await ops.rename(
          descriptorEntryPath(tree.rootHandle, pointerBackup),
          descriptorEntryPath(tree.rootHandle, 'manifest.json')
        );
        pointerBackup = undefined;
        await tree.rootHandle.sync();
      } catch {}
    }
    throw error;
  } finally {
    await closeHandle(stageHandle);
    if (stageName && generationsHandle) {
      try { await removeVerifiedDirectory(internal, ops, tree, generationsHandle, stageName,
        identity(await ops.lstat(descriptorEntryPath(generationsHandle, stageName))), files,
        { allowMissing: true, requireComplete: false, verifyBytes: false }); } catch {}
    }
    for (const name of [pointerStage, pointerBackup].filter(Boolean)) {
      try { await ops.unlink(descriptorEntryPath(tree.rootHandle, name)); } catch {}
    }
    await closeHandle(generationsHandle);
  }
}

async function openAbsoluteRun(ops, absolutePath) {
  const parsed = path.parse(absolutePath);
  const components = absolutePath.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = await ops.open(parsed.root, DIRECTORY_FLAGS);
  try {
    for (let index = 0; index < components.length; index += 1) {
      const next = await openDirectoryEntry(
        ops,
        current,
        components[index],
        'P5_AUTHORITY_INVALID',
        'P5_OUTPUT_OWNERSHIP'
      );
      if (index === components.length - 1) {
        return { parentHandle: current, runHandle: next };
      }
      await closeHandle(current);
      current = next;
    }
    throw executeError('P5_AUTHORITY_INVALID');
  } catch (error) {
    await closeHandle(current);
    throw error;
  }
}

async function openOrCreateAbsoluteDirectory(ops, absolutePath) {
  const parsed = path.parse(absolutePath);
  const components = absolutePath.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = await ops.open(parsed.root, DIRECTORY_FLAGS);
  try {
    for (const component of components) {
      const target = descriptorEntryPath(current, component);
      let created = false;
      try {
        const stat = await ops.lstat(target);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw executeError('P5_OUTPUT_OWNERSHIP');
      } catch (error) {
        if (!isMissingError(error)) throw error;
        await ops.mkdir(target, { recursive: false, mode: 0o700 });
        created = true;
      }
      const next = await openDirectoryEntry(
        ops, current, component, 'P5_AUTHORITY_INVALID', 'P5_OUTPUT_OWNERSHIP'
      );
      if (created) await current.sync();
      await closeHandle(current);
      current = next;
    }
    return current;
  } catch (error) {
    await closeHandle(current);
    throw error;
  }
}

async function openOrCreateRunChild(internal, ops, basename) {
  await assertRunAuthority(internal, ops);
  const target = descriptorEntryPath(internal.runHandle, basename);
  let created = false;
  try {
    const stat = await ops.lstat(target);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw executeError('P5_OUTPUT_OWNERSHIP');
  } catch (error) {
    if (!isMissingError(error)) throw error;
    await ops.mkdir(target, { recursive: false, mode: 0o700 });
    created = true;
  }
  const handle = await openDirectoryEntry(
    ops, internal.runHandle, basename, 'P5_INSTALL_FAILED', 'P5_OUTPUT_OWNERSHIP'
  );
  if (created) await internal.runHandle.sync();
  await assertRunAuthority(internal, ops);
  return { handle, created };
}

async function openDirectoryEntry(ops, parentHandle, basename, missingCode, ownershipCode) {
  const target = descriptorEntryPath(parentHandle, basename);
  let handle;
  try {
    const before = await ops.lstat(target);
    if (before.isSymbolicLink()) throw executeError(ownershipCode);
    if (!before.isDirectory()) throw executeError(missingCode);
    handle = await ops.open(target, DIRECTORY_FLAGS);
    const opened = await handle.stat();
    const pathAfter = await ops.lstat(target);
    if (
      pathAfter.isSymbolicLink()
      || !opened.isDirectory()
      || !pathAfter.isDirectory()
      || !sameIdentity(identity(before), identity(opened))
      || !sameIdentity(identity(opened), identity(pathAfter))
    ) throw executeError(ownershipCode);
    return handle;
  } catch (error) {
    await closeHandle(handle);
    if (isSymlinkError(error)) throw executeError(ownershipCode);
    if (error?.code === 'ENOTDIR') {
      try {
        const current = await ops.lstat(target);
        if (current.isSymbolicLink()) throw executeError(ownershipCode);
      } catch (recheckError) {
        if (sanitizeExecuteError(recheckError).code === ownershipCode) {
          throw executeError(ownershipCode);
        }
      }
    }
    throw publicError(error, missingCode);
  }
}

async function assertRunAuthority(internal, ops) {
  if (internal.closed) throw executeError('P5_AUTHORITY_INVALID');
  try {
    const parentStat = await internal.parentHandle.stat();
    const runStat = await internal.runHandle.stat();
    if (
      !parentStat.isDirectory()
      || !runStat.isDirectory()
      || !sameIdentity(identity(parentStat), internal.parentIdentity)
      || !sameIdentity(identity(runStat), internal.runIdentity)
    ) throw executeError('P5_INSTALL_FAILED');
    const pathStat = await ops.lstat(descriptorEntryPath(internal.parentHandle, internal.runBasename));
    if (pathStat.isSymbolicLink()) throw executeError('P5_OUTPUT_OWNERSHIP');
    if (!pathStat.isDirectory() || !sameIdentity(identity(pathStat), internal.runIdentity)) {
      throw executeError('P5_INSTALL_FAILED');
    }
  } catch (error) {
    throw publicError(error, 'P5_INSTALL_FAILED');
  }
}

async function openExecuteTree(internal, ops, { create }) {
  await assertRunAuthority(internal, ops);
  let rootHandle;
  let candidatesHandle;
  let rootCreated = false;
  let candidatesCreated = false;
  try {
    ({ handle: rootHandle, created: rootCreated } = await openOrCreateOwnedDirectory(
      internal,
      ops,
      internal.runHandle,
      OUTPUT_BASENAME,
      create
    ));
    const rootIdentity = identity(await rootHandle.stat());
    const topEntries = await ops.readdir(descriptorPath(rootHandle));
    const allowed = new Set([
      CANDIDATES_BASENAME,
      'manifest.json',
      SELECTION_GENERATIONS_BASENAME
    ]);
    if (topEntries.some((name) => !allowed.has(name) && !isGeneratedBasename(name))) {
      throw executeError('P5_OUTPUT_OWNERSHIP');
    }
    if (topEntries.includes('selection.json') || topEntries.includes('selection-report.md')) {
      throw executeError('P5_OUTPUT_OWNERSHIP');
    }
    let selection = null;
    if (topEntries.includes('manifest.json')) {
      const pointerRead = await readRegularFile(ops, rootHandle, 'manifest.json', 'P5_OUTPUT_OWNERSHIP');
      const pointer = parseSelectionPointer(pointerRead.bytes);
      const generationRoot = await openDirectoryEntry(
        ops, rootHandle, SELECTION_GENERATIONS_BASENAME,
        'P5_OUTPUT_OWNERSHIP', 'P5_OUTPUT_OWNERSHIP'
      );
      let generationHandle;
      try {
        generationHandle = await openDirectoryEntry(
          ops, generationRoot, path.posix.basename(pointer.generation),
          'P5_OUTPUT_OWNERSHIP', 'P5_OUTPUT_OWNERSHIP'
        );
        const selectionFiles = {};
        const identities = {};
        for (const name of SELECTION_PATHS) {
          const read = await readRegularFile(ops, generationHandle, name, 'P5_OUTPUT_OWNERSHIP');
          selectionFiles[name] = read.bytes;
          identities[name] = read.identity;
        }
        if (sha256(selectionFiles['manifest.json']) !== pointer.manifest_sha256) {
          throw executeError('P5_OUTPUT_OWNERSHIP');
        }
        normalizeSelectionFiles(selectionFiles);
        selection = {
          files: Object.freeze(selectionFiles),
          identities: Object.freeze(identities),
          pointer,
          pointerIdentity: pointerRead.identity
        };
      } finally {
        await closeHandles([generationHandle, generationRoot]);
      }
    }
    ({ handle: candidatesHandle, created: candidatesCreated } = await openOrCreateOwnedDirectory(
      internal,
      ops,
      rootHandle,
      CANDIDATES_BASENAME,
      create
    ));
    const candidatesIdentity = identity(await candidatesHandle.stat());
    const candidateEntries = await ops.readdir(descriptorPath(candidatesHandle));
    if (candidateEntries.some((name) => !CANDIDATE_IDS.includes(name) && !isGeneratedBasename(name))) {
      throw executeError('P5_OUTPUT_OWNERSHIP');
    }
    const tree = {
      rootHandle,
      rootIdentity,
      candidatesHandle,
      candidatesIdentity,
      selection,
      rootCreated,
      candidatesCreated
    };
    await assertTreeAuthority(internal, ops, tree);
    return tree;
  } catch (error) {
    if (create) {
      try {
        if (candidatesCreated && candidatesHandle && rootHandle) {
          await removeVerifiedEmptyCreatedDirectory(
            internal,
            ops,
            rootHandle,
            CANDIDATES_BASENAME,
            identity(await candidatesHandle.stat()),
            candidatesHandle
          );
          candidatesHandle = undefined;
          candidatesCreated = false;
        }
        if (rootCreated && rootHandle) {
          await removeVerifiedEmptyCreatedDirectory(
            internal,
            ops,
            internal.runHandle,
            OUTPUT_BASENAME,
            identity(await rootHandle.stat()),
            rootHandle
          );
          rootHandle = undefined;
          rootCreated = false;
        }
      } catch {
        // Preserve anything that cannot be verified empty and owned.
      }
    }
    await closeHandles([candidatesHandle, rootHandle]);
    if (!create && isMissingError(error)) throw executeError('P5_AUTHORITY_INVALID');
    throw publicError(error, 'P5_OUTPUT_OWNERSHIP');
  }
}

async function openOrCreateOwnedDirectory(internal, ops, parentHandle, basename, create) {
  const target = descriptorEntryPath(parentHandle, basename);
  try {
    await ops.lstat(target);
    return { handle: await openDirectoryEntry(
      ops,
      parentHandle,
      basename,
      create ? 'P5_INSTALL_FAILED' : 'P5_AUTHORITY_INVALID',
      'P5_OUTPUT_OWNERSHIP'
    ), created: false };
  } catch (error) {
    if (!create || !isMissingError(error)) throw error;
  }
  await assertRunAuthority(internal, ops);
  let madeDirectory = false;
  let handle;
  let createdIdentity;
  try {
    try {
      await ops.mkdir(target, { recursive: false, mode: 0o700 });
      madeDirectory = true;
    } catch (error) {
      if (!isAlreadyExistsError(error)) throw error;
    }
    if (!madeDirectory) {
      await assertRunAuthority(internal, ops);
      return {
        handle: await openDirectoryEntry(
          ops,
          parentHandle,
          basename,
          'P5_INSTALL_FAILED',
          'P5_OUTPUT_OWNERSHIP'
        ),
        created: false
      };
    }
    const createdStat = await ops.lstat(target);
    if (createdStat.isSymbolicLink() || !createdStat.isDirectory()) {
      throw executeError('P5_INSTALL_FAILED');
    }
    createdIdentity = identity(createdStat);
    await assertRunAuthority(internal, ops);
    handle = await openDirectoryEntry(
      ops,
      parentHandle,
      basename,
      'P5_INSTALL_FAILED',
      'P5_OUTPUT_OWNERSHIP'
    );
    const opened = await handle.stat();
    if (!opened.isDirectory() || !sameIdentity(identity(opened), createdIdentity)) {
      throw executeError('P5_INSTALL_FAILED');
    }
    await syncBareDirectory(internal, ops, parentHandle);
    await assertNamedDirectoryIdentity(
      parentHandle,
      ops,
      basename,
      createdIdentity,
      'P5_INSTALL_FAILED'
    );
    const reconciled = await handle.stat();
    if (!reconciled.isDirectory() || !sameIdentity(identity(reconciled), createdIdentity)) {
      throw executeError('P5_INSTALL_FAILED');
    }
    return { handle, created: true };
  } catch (error) {
    try {
      if (madeDirectory && createdIdentity) {
        await removeVerifiedEmptyCreatedDirectory(
          internal,
          ops,
          parentHandle,
          basename,
          createdIdentity,
          handle
        );
        handle = undefined;
      }
    } catch {
      // Preserve a path that can no longer be proven to be our empty creation.
    }
    await closeHandle(handle);
    throw publicError(error, 'P5_INSTALL_FAILED');
  }
}

async function removeVerifiedEmptyCreatedDirectory(
  internal,
  ops,
  parentHandle,
  basename,
  expectedIdentity,
  existingHandle
) {
  await assertRunAuthority(internal, ops);
  let handle = existingHandle;
  if (!handle) {
    handle = await openDirectoryEntry(
      ops,
      parentHandle,
      basename,
      'P5_INSTALL_FAILED',
      'P5_INSTALL_FAILED'
    );
  }
  let closed = false;
  try {
    const retained = await handle.stat();
    if (
      !retained.isDirectory()
      || !sameIdentity(identity(retained), expectedIdentity)
      || (await ops.readdir(descriptorPath(handle))).length !== 0
    ) throw executeError('P5_INSTALL_FAILED');
    await assertNamedDirectoryIdentity(
      parentHandle,
      ops,
      basename,
      expectedIdentity,
      'P5_INSTALL_FAILED'
    );
    await closeHandle(handle);
    closed = true;
    await assertNamedDirectoryIdentity(
      parentHandle,
      ops,
      basename,
      expectedIdentity,
      'P5_INSTALL_FAILED'
    );
    await ops.rmdir(descriptorEntryPath(parentHandle, basename));
    await parentHandle.sync();
    await assertRunAuthority(internal, ops);
  } finally {
    if (!closed) await closeHandle(handle);
  }
}

async function rollbackCreatedExecuteTree(internal, ops, tree) {
  await assertRunAuthority(internal, ops);
  if (tree.candidatesCreated) {
    await removeVerifiedEmptyCreatedDirectory(
      internal,
      ops,
      tree.rootHandle,
      CANDIDATES_BASENAME,
      tree.candidatesIdentity,
      tree.candidatesHandle
    );
    tree.candidatesHandle = undefined;
    tree.candidatesCreated = false;
  }
  if (tree.rootCreated) {
    await removeVerifiedEmptyCreatedDirectory(
      internal,
      ops,
      internal.runHandle,
      OUTPUT_BASENAME,
      tree.rootIdentity,
      tree.rootHandle
    );
    tree.rootHandle = undefined;
    tree.rootCreated = false;
  }
  await assertRunAuthority(internal, ops);
}

async function assertTreeAuthority(internal, ops, tree) {
  await assertRunAuthority(internal, ops);
  for (const [handle, expected] of [
    [tree.rootHandle, tree.rootIdentity],
    [tree.candidatesHandle, tree.candidatesIdentity]
  ]) {
    const stat = await handle.stat();
    if (!stat.isDirectory() || !sameIdentity(identity(stat), expected)) {
      throw executeError('P5_INSTALL_FAILED');
    }
  }
  await assertNamedDirectoryIdentity(
    internal.runHandle,
    ops,
    OUTPUT_BASENAME,
    tree.rootIdentity,
    'P5_OUTPUT_OWNERSHIP'
  );
  await assertNamedDirectoryIdentity(
    tree.rootHandle,
    ops,
    CANDIDATES_BASENAME,
    tree.candidatesIdentity,
    'P5_OUTPUT_OWNERSHIP'
  );
}

async function inspectCandidate(internal, ops, tree, candidateId, { allowMissing }) {
  assertCandidateId(candidateId);
  await assertTreeAuthority(internal, ops, tree);
  let directory;
  try {
    directory = await readDirectoryTree(
      ops,
      tree.candidatesHandle,
      candidateId,
      'P5_OUTPUT_OWNERSHIP',
      { allowMissing }
    );
    if (!directory) return null;
    const validated = validateCandidateEvidence(candidateId, directory.files, 'P5_OUTPUT_OWNERSHIP');
    const expectedDirectories = expectedDirectoriesFor(directory.files);
    const crashSafeProspectiveDirectories = validated.kind === 'accepted'
      && validated.current.chain_revision === 1
      ? [...new Set([...expectedDirectories, 'repairs'])].sort()
      : expectedDirectories;
    if (!sameStrings(directory.directories, expectedDirectories)
      && !sameStrings(directory.directories, crashSafeProspectiveDirectories)) {
      throw executeError('P5_OUTPUT_OWNERSHIP');
    }
    for (const [name, mode] of Object.entries(directory.modes)) {
      if ((mode & 0o777) !== (name === CURRENT_CHAIN_BASENAME ? 0o600 : 0o400)) {
        throw executeError('P5_OUTPUT_OWNERSHIP');
      }
    }
    await assertNamedDirectoryIdentity(
      tree.candidatesHandle,
      ops,
      candidateId,
      directory.identity,
      'P5_OUTPUT_OWNERSHIP'
    );
    return { ...directory, validated };
  } catch (error) {
    if (allowMissing && isMissingError(error)) return null;
    throw executeError('P5_OUTPUT_OWNERSHIP');
  }
}

async function readDirectoryTree(ops, parentHandle, basename, fallbackCode, { allowMissing = false } = {}) {
  const target = descriptorEntryPath(parentHandle, basename);
  let rootHandle;
  try {
    let before;
    try {
      before = await ops.lstat(target);
    } catch (error) {
      if (allowMissing && isMissingError(error)) return null;
      throw error;
    }
    if (before.isSymbolicLink() || !before.isDirectory()) throw executeError(fallbackCode);
    rootHandle = await ops.open(target, DIRECTORY_FLAGS);
    const opened = await rootHandle.stat();
    if (!opened.isDirectory() || !sameIdentity(identity(before), identity(opened))) {
      throw executeError(fallbackCode);
    }
    const files = {};
    const modes = {};
    const identities = { '': identity(opened) };
    const directories = [];
    await walk(rootHandle, '');
    const pathAfter = await ops.lstat(target);
    if (
      pathAfter.isSymbolicLink()
      || !pathAfter.isDirectory()
      || !sameIdentity(identity(pathAfter), identity(opened))
    ) throw executeError(fallbackCode);
    return {
      identity: identity(opened),
      files: Object.freeze(sortFileMap(files)),
      modes: Object.freeze(modes),
      identities: Object.freeze(identities),
      directories: Object.freeze(directories.sort())
    };

    async function walk(handle, prefix) {
      const entries = await ops.readdir(descriptorPath(handle));
      for (const name of entries.sort()) {
        if (!isPlainBasename(name)) throw executeError(fallbackCode);
        const relative = prefix ? `${prefix}/${name}` : name;
        const entryPath = descriptorEntryPath(handle, name);
        const stat = await ops.lstat(entryPath);
        if (stat.isSymbolicLink()) throw executeError(fallbackCode);
        if (stat.isDirectory()) {
          let child;
          try {
            child = await ops.open(entryPath, DIRECTORY_FLAGS);
            const openedChild = await child.stat();
            if (!openedChild.isDirectory() || !sameIdentity(identity(stat), identity(openedChild))) {
              throw executeError(fallbackCode);
            }
            identities[relative] = identity(openedChild);
            directories.push(relative);
            await walk(child, relative);
            const after = await ops.lstat(entryPath);
            if (after.isSymbolicLink() || !sameIdentity(identity(after), identity(openedChild))) {
              throw executeError(fallbackCode);
            }
          } finally {
            await closeHandle(child);
          }
        } else if (stat.isFile()) {
          const read = await readRegularFile(ops, handle, name, fallbackCode);
          files[relative] = read.bytes;
          modes[relative] = read.mode;
          identities[relative] = read.identity;
        } else {
          throw executeError(fallbackCode);
        }
      }
    }
  } catch (error) {
    if (allowMissing && isMissingError(error)) return null;
    throw publicError(error, fallbackCode);
  } finally {
    await closeHandle(rootHandle);
  }
}

async function publishCandidateUpdate({ internal, ops, tree, existing, incoming, candidateId }) {
  let candidateHandle;
  const directoryHandles = new Map();
  const createdDirectories = [];
  let pointerStage;
  let pointerBackup;
  let pointerReplaced = false;
  try {
    candidateHandle = await openDirectoryEntry(
      ops, tree.candidatesHandle, candidateId, 'P5_INSTALL_FAILED', 'P5_OUTPUT_OWNERSHIP'
    );
    if (!sameIdentity(identity(await candidateHandle.stat()), existing.identity)) {
      throw executeError('P5_OUTPUT_OWNERSHIP');
    }
    directoryHandles.set('', candidateHandle);
    for (const directory of expectedDirectoriesFor(incoming.files)) {
      const parentName = path.posix.dirname(directory) === '.' ? '' : path.posix.dirname(directory);
      const parent = directoryHandles.get(parentName);
      const basename = path.posix.basename(directory);
      const target = descriptorEntryPath(parent, basename);
      try {
        const stat = await ops.lstat(target);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw executeError('P5_OUTPUT_OWNERSHIP');
      } catch (error) {
        if (!isMissingError(error)) throw error;
        await ops.mkdir(target, { recursive: false, mode: 0o700 });
        const created = await ops.lstat(target);
        if (created.isSymbolicLink() || !created.isDirectory()) {
          throw executeError('P5_OUTPUT_OWNERSHIP');
        }
        createdDirectories.push({ directory, parent, basename, identity: identity(created) });
        await parent.sync();
      }
      const child = await openDirectoryEntry(ops, parent, basename, 'P5_INSTALL_FAILED', 'P5_OUTPUT_OWNERSHIP');
      directoryHandles.set(directory, child);
    }

    for (const [name, bytes] of Object.entries(incoming.files)) {
      if (name === CURRENT_CHAIN_BASENAME) continue;
      const parentName = path.posix.dirname(name) === '.' ? '' : path.posix.dirname(name);
      const parent = directoryHandles.get(parentName);
      const basename = path.posix.basename(name);
      try {
        const current = await readRegularFile(ops, parent, basename, 'P5_OUTPUT_OWNERSHIP');
        if (!current.bytes.equals(bytes) || (current.mode & 0o777) !== 0o400) {
          throw executeError('P5_OUTPUT_OWNERSHIP');
        }
        continue;
      } catch (error) {
        if (error?.code !== 'P5_OUTPUT_OWNERSHIP') throw error;
        try {
          const stat = await ops.lstat(descriptorEntryPath(parent, basename));
          if (stat) throw error;
        } catch (missing) {
          if (!isMissingError(missing)) throw error;
        }
      }
      const stageName = await unusedTemporaryBasename(internal, ops, tree, tree.candidatesHandle, STAGE_PREFIX);
      const stagePath = descriptorEntryPath(tree.candidatesHandle, stageName);
      let stageHandle;
      try {
        stageHandle = await ops.open(stagePath, WRITE_FLAGS, 0o600);
        await stageHandle.writeFile(bytes);
        await stageHandle.sync();
        await stageHandle.chmod(0o400);
        await stageHandle.sync();
        const stageIdentity = identity(await stageHandle.stat());
        await closeHandle(stageHandle); stageHandle = undefined;
        await moveIdentityNoReplace({
          ops,
          sourceHandle: tree.candidatesHandle,
          sourceName: stageName,
          destinationHandle: parent,
          destinationName: basename,
          expectedIdentity: stageIdentity,
          expectedKind: 'file',
          moveForward: () => ops.renameNoReplaceBetween(tree.candidatesHandle, stageName, parent, basename),
          moveReverse: () => ops.renameNoReplaceBetween(parent, basename, tree.candidatesHandle, stageName),
          beforeMove: () => assertTreeAuthority(internal, ops, tree),
          afterMove: async () => { await parent.sync(); await tree.candidatesHandle.sync(); }
        });
      } finally {
        await closeHandle(stageHandle);
        try { await ops.unlink(stagePath); } catch {}
      }
    }

    const pointerBytes = incoming.files[CURRENT_CHAIN_BASENAME];
    const currentPointer = await readRegularFile(
      ops, candidateHandle, CURRENT_CHAIN_BASENAME, 'P5_OUTPUT_OWNERSHIP'
    );
    pointerStage = await unusedTemporaryBasename(internal, ops, tree, tree.candidatesHandle, STAGE_PREFIX);
    pointerBackup = await unusedTemporaryBasename(internal, ops, tree, tree.candidatesHandle, BACKUP_PREFIX);
    let pointerHandle;
    try {
      pointerHandle = await ops.open(descriptorEntryPath(tree.candidatesHandle, pointerStage), WRITE_FLAGS, 0o600);
      await pointerHandle.writeFile(pointerBytes);
      await pointerHandle.sync();
    } finally { await closeHandle(pointerHandle); }
    await ops.link(
      descriptorEntryPath(candidateHandle, CURRENT_CHAIN_BASENAME),
      descriptorEntryPath(tree.candidatesHandle, pointerBackup)
    );
    await tree.candidatesHandle.sync();
    await ops.rename(
      descriptorEntryPath(tree.candidatesHandle, pointerStage),
      descriptorEntryPath(candidateHandle, CURRENT_CHAIN_BASENAME)
    );
    pointerReplaced = true;
    await candidateHandle.sync();
    const installedPointer = await readRegularFile(
      ops, candidateHandle, CURRENT_CHAIN_BASENAME, 'P5_INSTALL_FAILED'
    );
    if (!installedPointer.bytes.equals(pointerBytes)) throw executeError('P5_INSTALL_FAILED');
    const checked = await inspectCandidate(internal, ops, tree, candidateId, { allowMissing: false });
    if (checked.validated.currentChainSha256 !== incoming.currentChainSha256) {
      throw executeError('P5_INSTALL_FAILED');
    }
    pointerReplaced = false;
    try { await ops.unlink(descriptorEntryPath(tree.candidatesHandle, pointerBackup)); } catch {}
    pointerBackup = undefined;
  } catch (error) {
    if (pointerReplaced && pointerBackup) {
      try {
        await ops.rename(
          descriptorEntryPath(tree.candidatesHandle, pointerBackup),
          descriptorEntryPath(candidateHandle, CURRENT_CHAIN_BASENAME)
        );
        pointerBackup = undefined;
        await candidateHandle.sync();
      } catch {}
    }
    for (const created of [...createdDirectories].reverse()) {
      try {
        await removeVerifiedEmptyCreatedDirectory(
          internal,
          ops,
          created.parent,
          created.basename,
          created.identity,
          directoryHandles.get(created.directory)
        );
      } catch {
        // A non-empty directory contains only immutable prospective bodies.
        // Those are safe to retain and remain non-authoritative until the
        // current pointer commits their complete chain.
      } finally {
        directoryHandles.delete(created.directory);
      }
    }
    throw error;
  } finally {
    if (pointerStage) {
      try { await ops.unlink(descriptorEntryPath(tree.candidatesHandle, pointerStage)); } catch {}
    }
    if (pointerBackup) {
      try { await ops.unlink(descriptorEntryPath(tree.candidatesHandle, pointerBackup)); } catch {}
    }
    await closeHandles([...directoryHandles.entries()].filter(([name]) => name !== '').map(([, handle]) => handle));
    await closeHandle(candidateHandle);
  }
}

async function createCandidateStage(internal, ops, tree, incoming) {
  let basename;
  for (let attempt = 0; attempt < 64; attempt += 1) {
    basename = nextTemporaryBasename(STAGE_PREFIX);
    try {
      await assertTreeAuthority(internal, ops, tree);
      await ops.mkdir(descriptorEntryPath(tree.candidatesHandle, basename), {
        recursive: false,
        mode: 0o700
      });
      break;
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        basename = undefined;
        continue;
      }
      throw publicError(error, 'P5_INSTALL_FAILED');
    }
  }
  if (!basename) throw executeError('P5_INSTALL_FAILED');

  let handle;
  let stageIdentity;
  try {
    const stagePath = descriptorEntryPath(tree.candidatesHandle, basename);
    const before = await ops.lstat(stagePath);
    if (before.isSymbolicLink() || !before.isDirectory()) throw executeError('P5_INSTALL_FAILED');
    handle = await ops.open(stagePath, DIRECTORY_FLAGS);
    await assertTreeAuthority(internal, ops, tree);
    await handle.chmod(0o700);
    const opened = await handle.stat();
    stageIdentity = identity(opened);
    if (!sameIdentity(identity(before), stageIdentity)) throw executeError('P5_INSTALL_FAILED');

    const directoryHandles = new Map([['', handle]]);
    try {
      for (const directory of expectedDirectoriesFor(incoming.files)) {
        const parentName = path.posix.dirname(directory) === '.' ? '' : path.posix.dirname(directory);
        const parent = directoryHandles.get(parentName);
        const basenamePart = path.posix.basename(directory);
        await assertTreeAuthority(internal, ops, tree);
        await assertNamedDirectoryIdentity(
          tree.candidatesHandle,
          ops,
          basename,
          stageIdentity,
          'P5_INSTALL_FAILED'
        );
        await ops.mkdir(descriptorEntryPath(parent, basenamePart), { recursive: false, mode: 0o700 });
        const child = await openDirectoryEntry(
          ops,
          parent,
          basenamePart,
          'P5_INSTALL_FAILED',
          'P5_INSTALL_FAILED'
        );
        directoryHandles.set(directory, child);
        await assertTreeAuthority(internal, ops, tree);
        await child.chmod(0o700);
        await syncDirectory(internal, ops, tree, parent);
      }

      for (const [name, bytes] of Object.entries(incoming.files)) {
        const parentName = path.posix.dirname(name) === '.' ? '' : path.posix.dirname(name);
        const parent = directoryHandles.get(parentName);
        const basenamePart = path.posix.basename(name);
        let fileHandle;
        try {
          await assertTreeAuthority(internal, ops, tree);
          await assertNamedDirectoryIdentity(
            tree.candidatesHandle,
            ops,
            basename,
            stageIdentity,
            'P5_INSTALL_FAILED'
          );
          fileHandle = await ops.open(descriptorEntryPath(parent, basenamePart), WRITE_FLAGS, 0o600);
          await assertTreeAuthority(internal, ops, tree);
          await fileHandle.writeFile(bytes);
          await assertTreeAuthority(internal, ops, tree);
          await fileHandle.sync();
          if (name !== CURRENT_CHAIN_BASENAME) {
            await assertTreeAuthority(internal, ops, tree);
            await fileHandle.chmod(0o400);
            await assertTreeAuthority(internal, ops, tree);
            await fileHandle.sync();
          }
        } finally {
          await closeHandle(fileHandle);
        }
      }
      for (const directory of [...directoryHandles.keys()].sort((left, right) => right.length - left.length)) {
        await syncDirectory(internal, ops, tree, directoryHandles.get(directory));
      }
    } finally {
      await closeHandles([...directoryHandles.entries()].filter(([name]) => name !== '').map(([, item]) => item));
    }
    await verifyCandidateDirectory(
      internal,
      ops,
      tree,
      basename,
      stageIdentity,
      incoming.files,
      incoming.candidateId
    );
    return { basename, handle, identity: stageIdentity };
  } catch (error) {
    await closeHandle(handle);
    if (stageIdentity) {
      try {
        await removeVerifiedDirectory(
          internal,
          ops,
          tree,
          tree.candidatesHandle,
          basename,
          stageIdentity,
          incoming.files,
          { allowMissing: true, requireComplete: false, verifyBytes: false }
        );
      } catch {
        // Never remove a path whose identity or contents can no longer be verified.
      }
    }
    throw publicError(error, 'P5_INSTALL_FAILED');
  }
}

async function verifyCandidateDirectory(
  internal,
  ops,
  tree,
  basename,
  expectedIdentity,
  expectedFiles,
  candidateId
) {
  await assertTreeAuthority(internal, ops, tree);
  const directory = await readDirectoryTree(
    ops,
    tree.candidatesHandle,
    basename,
    'P5_INSTALL_FAILED'
  );
  if (!sameIdentity(directory.identity, expectedIdentity) || !sameFileMap(directory.files, expectedFiles)) {
    throw executeError('P5_INSTALL_FAILED');
  }
  validateCandidateEvidence(candidateId, directory.files, 'P5_INSTALL_FAILED');
  if (!sameStrings(directory.directories, expectedDirectoriesFor(expectedFiles))) {
    throw executeError('P5_INSTALL_FAILED');
  }
  for (const [name, mode] of Object.entries(directory.modes)) {
    if ((mode & 0o777) !== (name === CURRENT_CHAIN_BASENAME ? 0o600 : 0o400)) {
      throw executeError('P5_INSTALL_FAILED');
    }
  }
  await assertNamedDirectoryIdentity(
    tree.candidatesHandle,
    ops,
    basename,
    expectedIdentity,
    'P5_INSTALL_FAILED'
  );
}

async function removeVerifiedDirectory(
  internal,
  ops,
  tree,
  parentHandle,
  basename,
  expectedIdentity,
  expectedFiles,
  { allowMissing = false, requireComplete, verifyBytes }
) {
  await assertTreeAuthority(internal, ops, tree);
  let directory;
  try {
    directory = await readDirectoryTree(
      ops,
      parentHandle,
      basename,
      'P5_INSTALL_FAILED',
      { allowMissing }
    );
    if (!directory) return;
    if (!sameIdentity(directory.identity, expectedIdentity)) throw executeError('P5_INSTALL_FAILED');
    const actualNames = Object.keys(directory.files);
    if (
      actualNames.some((name) => !Object.hasOwn(expectedFiles, name))
      || (requireComplete && !sameStrings(actualNames.sort(), Object.keys(expectedFiles).sort()))
    ) throw executeError('P5_INSTALL_FAILED');
    if (verifyBytes) {
      for (const name of actualNames) {
        if (!directory.files[name].equals(expectedFiles[name])) throw executeError('P5_INSTALL_FAILED');
      }
    }

    const rootHandle = await openDirectoryEntry(
      ops,
      parentHandle,
      basename,
      'P5_INSTALL_FAILED',
      'P5_INSTALL_FAILED'
    );
    const nodes = new Map();
    nodes.set('', {
      handle: rootHandle,
      identity: expectedIdentity,
      parent: null,
      basename
    });
    try {
      const cleanupRootStat = await rootHandle.stat();
      if (
        !cleanupRootStat.isDirectory()
        || !sameIdentity(identity(cleanupRootStat), expectedIdentity)
      ) throw executeError('P5_INSTALL_FAILED');
      for (const relative of [...directory.directories].sort((left, right) => (
        pathDepth(left) - pathDepth(right) || left.localeCompare(right)
      ))) {
        const parentRelative = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative);
        const parent = nodes.get(parentRelative);
        const childBasename = path.posix.basename(relative);
        await assertRetainedNodeChain(ops, parentHandle, basename, nodes, parentRelative);
        const child = await openDirectoryEntry(
          ops,
          parent.handle,
          childBasename,
          'P5_INSTALL_FAILED',
          'P5_INSTALL_FAILED'
        );
        const childIdentity = identity(await child.stat());
        if (!sameIdentity(childIdentity, directory.identities[relative])) {
          await closeHandle(child);
          throw executeError('P5_INSTALL_FAILED');
        }
        nodes.set(relative, {
          handle: child,
          identity: childIdentity,
          parent: parentRelative,
          basename: childBasename
        });
      }
      for (const name of actualNames.sort()) {
        await assertTreeAuthority(internal, ops, tree);
        const parentRelative = path.posix.dirname(name) === '.' ? '' : path.posix.dirname(name);
        const parent = nodes.get(parentRelative);
        const childBasename = path.posix.basename(name);
        await assertRetainedNodeChain(ops, parentHandle, basename, nodes, parentRelative);
        const stat = await ops.lstat(descriptorEntryPath(parent.handle, childBasename));
        const expectedEntryIdentity = directory.identities[name];
        if (stat.isSymbolicLink() || !stat.isFile() || !sameIdentity(identity(stat), expectedEntryIdentity)) {
          throw executeError('P5_INSTALL_FAILED');
        }
        if (verifyBytes) {
          const read = await readRegularFile(ops, parent.handle, childBasename, 'P5_INSTALL_FAILED');
          if (!read.bytes.equals(expectedFiles[name])) throw executeError('P5_INSTALL_FAILED');
        }
        await assertRetainedNodeChain(ops, parentHandle, basename, nodes, parentRelative);
        await ops.unlink(descriptorEntryPath(parent.handle, childBasename));
      }
      for (const relative of [...directory.directories].sort((left, right) => (
        pathDepth(right) - pathDepth(left) || right.localeCompare(left)
      ))) {
        const node = nodes.get(relative);
        const parent = nodes.get(node.parent);
        await assertRetainedNodeChain(ops, parentHandle, basename, nodes, relative);
        if ((await ops.readdir(descriptorPath(node.handle))).length !== 0) {
          throw executeError('P5_INSTALL_FAILED');
        }
        await closeHandle(node.handle);
        nodes.delete(relative);
        const stat = await ops.lstat(descriptorEntryPath(parent.handle, node.basename));
        if (stat.isSymbolicLink() || !stat.isDirectory() || !sameIdentity(identity(stat), node.identity)) {
          throw executeError('P5_INSTALL_FAILED');
        }
        await ops.rmdir(descriptorEntryPath(parent.handle, node.basename));
      }
    } finally {
      await closeHandles([...nodes.values()].map((node) => node.handle));
    }
    await assertTreeAuthority(internal, ops, tree);
    await assertNamedDirectoryIdentity(parentHandle, ops, basename, expectedIdentity, 'P5_INSTALL_FAILED');
    await ops.rmdir(descriptorEntryPath(parentHandle, basename));
  } catch (error) {
    if (allowMissing && isMissingError(error)) return;
    throw publicError(error, 'P5_INSTALL_FAILED');
  }
}

async function assertRetainedNodeChain(ops, rootParentHandle, rootBasename, nodes, relative) {
  const root = nodes.get('');
  const retainedRoot = await root.handle.stat();
  if (
    !retainedRoot.isDirectory()
    || !sameIdentity(identity(retainedRoot), root.identity)
  ) throw executeError('P5_INSTALL_FAILED');
  await assertNamedDirectoryIdentity(
    rootParentHandle,
    ops,
    rootBasename,
    root.identity,
    'P5_INSTALL_FAILED'
  );
  if (!relative) return;
  let current = '';
  for (const component of relative.split('/')) {
    const next = current ? `${current}/${component}` : component;
    const parent = nodes.get(current);
    const node = nodes.get(next);
    if (!parent || !node) throw executeError('P5_INSTALL_FAILED');
    await assertNamedDirectoryIdentity(
      parent.handle,
      ops,
      component,
      node.identity,
      'P5_INSTALL_FAILED'
    );
    const opened = await node.handle.stat();
    if (!opened.isDirectory() || !sameIdentity(identity(opened), node.identity)) {
      throw executeError('P5_INSTALL_FAILED');
    }
    current = next;
  }
}

function pathDepth(value) {
  return value === '' ? 0 : value.split('/').length;
}

async function rollbackCandidateBackup(internal, ops, tree, backupName, candidateId, existing) {
  await verifyCandidateDirectory(
    internal,
    ops,
    tree,
    backupName,
    existing.identity,
    existing.files,
    candidateId
  );
  await renameExpectedDirectoryNoReplace(
    internal,
    ops,
    tree,
    tree.candidatesHandle,
    backupName,
    candidateId,
    existing.identity
  );
  await syncDirectory(internal, ops, tree, tree.candidatesHandle);
  await verifyCandidateDirectory(
    internal,
    ops,
    tree,
    candidateId,
    existing.identity,
    existing.files,
    candidateId
  );
}

async function renameExpectedDirectoryNoReplace(
  internal,
  ops,
  tree,
  parentHandle,
  sourceName,
  destinationName,
  expectedIdentity
) {
  await moveIdentityNoReplace({
    ops,
    sourceHandle: parentHandle,
    sourceName,
    destinationHandle: parentHandle,
    destinationName,
    expectedIdentity,
    expectedKind: 'directory',
    moveForward: () => ops.renameNoReplace(parentHandle, sourceName, destinationName),
    moveReverse: () => ops.renameNoReplace(parentHandle, destinationName, sourceName),
    beforeMove: async () => {
      await assertTreeAuthority(internal, ops, tree);
      await assertNamedDirectoryIdentity(
        parentHandle,
        ops,
        sourceName,
        expectedIdentity,
        'P5_INSTALL_FAILED'
      );
    },
    afterMove: () => assertTreeAuthority(internal, ops, tree)
  });
}

async function readRegularFile(ops, directoryHandle, basename, fallbackCode) {
  return readRegularPath(ops, directoryHandle, basename, fallbackCode);
}

async function readRegularPath(ops, directoryHandle, relative, fallbackCode) {
  const target = descriptorEntryPath(directoryHandle, relative);
  let handle;
  try {
    const before = await ops.lstat(target);
    if (before.isSymbolicLink() || !before.isFile()) throw executeError(fallbackCode);
    handle = await ops.open(target, READ_FLAGS);
    const opened = await handle.stat();
    if (!opened.isFile() || !sameIdentity(identity(before), identity(opened))) {
      throw executeError(fallbackCode);
    }
    const bytes = Buffer.from(await handle.readFile());
    const after = await handle.stat();
    const pathAfter = await ops.lstat(target);
    if (
      pathAfter.isSymbolicLink()
      || !after.isFile()
      || !pathAfter.isFile()
      || !sameIdentity(identity(opened), identity(after))
      || !sameIdentity(identity(after), identity(pathAfter))
      || Number(after.size) !== bytes.length
    ) throw executeError(fallbackCode);
    return { bytes, identity: identity(after), mode: after.mode };
  } catch (error) {
    throw publicError(error, fallbackCode);
  } finally {
    await closeHandle(handle);
  }
}

async function assertNamedDirectoryIdentity(parentHandle, ops, basename, expectedIdentity, code) {
  try {
    const stat = await ops.lstat(descriptorEntryPath(parentHandle, basename));
    if (
      stat.isSymbolicLink()
      || !stat.isDirectory()
      || !sameIdentity(identity(stat), expectedIdentity)
    ) throw executeError(code);
  } catch (error) {
    throw publicError(error, code);
  }
}

async function namedDirectoryHasIdentity(parentHandle, ops, basename, expectedIdentity) {
  try {
    const stat = await ops.lstat(descriptorEntryPath(parentHandle, basename));
    return stat.isDirectory()
      && !stat.isSymbolicLink()
      && sameIdentity(identity(stat), expectedIdentity);
  } catch {
    return false;
  }
}

async function unusedTemporaryBasename(internal, ops, tree, parentHandle, prefix) {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    await assertTreeAuthority(internal, ops, tree);
    const basename = nextTemporaryBasename(prefix);
    if (!await entryExists(ops, descriptorEntryPath(parentHandle, basename))) return basename;
  }
  throw executeError('P5_INSTALL_FAILED');
}

async function syncDirectory(internal, ops, tree, handle) {
  await assertTreeAuthority(internal, ops, tree);
  await handle.sync();
  await assertTreeAuthority(internal, ops, tree);
}

async function syncBareDirectory(internal, ops, handle) {
  await assertRunAuthority(internal, ops);
  await handle.sync();
  await assertRunAuthority(internal, ops);
}

function frozenInstallResult(status, candidateId, currentChainSha256) {
  return Object.freeze({
    status,
    candidate_id: candidateId,
    current_chain_sha256: currentChainSha256
  });
}

function currentChainBytes(candidate) {
  const revision = String(candidate.validated.current.chain_revision).padStart(4, '0');
  const bytes = candidate.files[`chains/chain-${revision}.json`];
  if (!Buffer.isBuffer(bytes) || sha256(bytes) !== candidate.validated.currentChainSha256) {
    throw executeError('P5_OUTPUT_OWNERSHIP');
  }
  return Buffer.from(bytes);
}

function parseSelectionPointer(bytes) {
  try {
    const pointer = JSON.parse(bytes.toString('utf8'));
    if (stableJson(pointer) !== bytes.toString('utf8')
      || !pointer || Object.getPrototypeOf(pointer) !== Object.prototype
      || Object.keys(pointer).join(',') !== 'generation,manifest_sha256,schema_version'
      || pointer.schema_version !== 1
      || !/^selection-generations\/selection-[a-f0-9]{64}$/u.test(pointer.generation)
      || !HASH.test(pointer.manifest_sha256)
      || pointer.generation !== `selection-generations/selection-${pointer.manifest_sha256}`) {
      throw executeError('P5_OUTPUT_OWNERSHIP');
    }
    return pointer;
  } catch {
    throw executeError('P5_OUTPUT_OWNERSHIP');
  }
}

function isSafeAbsolutePath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.resolve(value) !== value) return false;
  const parsed = path.parse(value);
  const components = value.slice(parsed.root.length).split(path.sep).filter(Boolean);
  return components.length > 0 && components.every(isPlainBasename);
}

function isPlainBasename(value) {
  return typeof value === 'string'
    && value.length > 0
    && !UNSAFE_PATH_CHARACTER.test(value)
    && value !== '.'
    && value !== '..'
    && path.posix.basename(value) === value
    && path.win32.basename(value) === value;
}

function isGeneratedBasename(value) {
  return typeof value === 'string'
    && (value.startsWith(STAGE_PREFIX) || value.startsWith(BACKUP_PREFIX))
    && isPlainBasename(value);
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function identity(stat) {
  return { dev: stat.dev, ino: stat.ino };
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function descriptorPath(handle) {
  return `/proc/self/fd/${handle.fd}`;
}

function descriptorEntryPath(handle, basename) {
  return path.join(descriptorPath(handle), ...String(basename).split('/'));
}

function nextTemporaryBasename(prefix) {
  temporarySequence += 1;
  return `${prefix}${process.pid}-${temporarySequence}`;
}

async function entryExists(ops, target) {
  try {
    await ops.lstat(target);
    return true;
  } catch (error) {
    if (isMissingError(error)) return false;
    throw error;
  }
}

function fsOperations(source) {
  const provided = source?.source ?? source;
  const operation = (name) => {
    const owner = provided && typeof provided[name] === 'function' ? provided : fs;
    return owner[name].bind(owner);
  };
  const customRename = provided && typeof provided.renameNoReplace === 'function'
    ? provided.renameNoReplace.bind(provided)
    : null;
  const customBetween = provided && typeof provided.renameNoReplaceBetween === 'function'
    ? provided.renameNoReplaceBetween.bind(provided)
    : null;
  return Object.freeze({
    source: provided,
    open: operation('open'),
    lstat: operation('lstat'),
    mkdir: operation('mkdir'),
    readdir: operation('readdir'),
    link: operation('link'),
    rename: operation('rename'),
    rm: operation('rm'),
    unlink: operation('unlink'),
    rmdir: operation('rmdir'),
    renameNoReplace: customRename
      ? (directoryHandle, sourceName, destinationName) => customRename(
        directoryHandle,
        sourceName,
        destinationName,
        renameNoReplaceByDescriptor
      )
      : renameNoReplaceByDescriptor,
    renameNoReplaceBetween: customBetween
      ? (sourceHandle, sourceName, destinationHandle, destinationName) => customBetween(
        sourceHandle,
        sourceName,
        destinationHandle,
        destinationName,
        renameNoReplaceBetweenDescriptors
      )
      : renameNoReplaceBetweenDescriptors
  });
}

async function renameNoReplaceByDescriptor(directoryHandle, sourceName, destinationName) {
  return renameNoReplaceBetweenDescriptors(
    directoryHandle,
    sourceName,
    directoryHandle,
    destinationName
  );
}

async function renameNoReplaceBetweenDescriptors(
  sourceHandle,
  sourceName,
  destinationHandle,
  destinationName
) {
  if (!isPlainBasename(sourceName) || !isPlainBasename(destinationName)) {
    throw executeError('P5_INSTALL_FAILED');
  }
  await new Promise((resolve, reject) => {
    const child = spawn(MOVE_BINARY, [
      '--no-clobber',
      '--no-target-directory',
      `/proc/self/fd/3/${sourceName}`,
      `/proc/self/fd/4/${destinationName}`
    ], {
      stdio: ['ignore', 'ignore', 'ignore', sourceHandle.fd, destinationHandle.fd]
    });
    child.once('error', () => reject(executeError('P5_INSTALL_FAILED')));
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(executeError('P5_INSTALL_FAILED'));
    });
  });
}

function createAuthority(internal) {
  const authority = {};
  Object.defineProperty(authority, 'close', {
    enumerable: true,
    value: async () => closeAuthority(internal)
  });
  AUTHORITIES.set(authority, internal);
  return Object.freeze(authority);
}

function authorityInternal(authority) {
  const internal = authority && typeof authority === 'object' ? AUTHORITIES.get(authority) : undefined;
  if (!internal || internal.closed) throw executeError('P5_AUTHORITY_INVALID');
  return internal;
}

function admissionFallback(error) {
  const code = sanitizeExecuteError(error, 'P5_AUTHORITY_INVALID').code;
  return code === 'P5_OUTPUT_OWNERSHIP' ? code : 'P5_AUTHORITY_INVALID';
}

function publicError(error, fallbackCode) {
  const sanitized = sanitizeExecuteError(error, fallbackCode);
  return executeError(sanitized.code);
}

function isMissingError(error) {
  return error?.code === 'ENOENT' || error?.code === 'ENOTDIR';
}

function isAlreadyExistsError(error) {
  return error?.code === 'EEXIST';
}

function isSymlinkError(error) {
  return error?.code === 'ELOOP'
    || sanitizeExecuteError(error).code === 'P5_OUTPUT_OWNERSHIP';
}

async function closeAuthority(internal) {
  if (internal.closed) return;
  internal.closed = true;
  await closeHandles([internal.runHandle, internal.parentHandle]);
}

async function closeExecuteTree(tree) {
  if (!tree) return;
  await closeHandles([tree.candidatesHandle, tree.rootHandle]);
}

async function closeHandles(handles) {
  const unique = [...new Set(handles.filter(Boolean))];
  await Promise.all(unique.map(closeHandle));
}

async function closeHandle(handle) {
  if (!handle) return;
  try {
    await handle.close();
  } catch {
    // Closing is idempotent at this public lifecycle boundary.
  }
}
