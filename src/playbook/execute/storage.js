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
import {
  createBoundDirectory,
  removeBoundEntry,
  removeOwnedTree,
  retireBoundEntry
} from './ownedTree.js';

const OUTPUT_BASENAME = 'playbook-execute';
const CANDIDATES_BASENAME = 'candidates';
const SELECTION_GENERATIONS_BASENAME = 'selection-generations';
const STAGE_PREFIX = '.playbook-execute.stage-';
const BACKUP_PREFIX = '.playbook-execute.backup-';
const PRIVATE_DIRECTORY_PREFIX = '.playbook-execute.directory-';
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
  let createdRunIdentity;
  try {
    parentHandle = await openOrCreateAbsoluteDirectory(ops, outRoot);
    const created = await createPrivateDirectory(
      ops, parentHandle, runBasename, 'P5_OUTPUT_OWNERSHIP'
    );
    runHandle = created.handle;
    createdRunIdentity = created.identity;
    const parentIdentity = identity(await parentHandle.stat());
    const runIdentity = createdRunIdentity;
    await parentHandle.sync();
    const after = await ops.lstat(descriptorEntryPath(parentHandle, runBasename));
    if (after.isSymbolicLink() || !after.isDirectory() || !sameIdentity(identity(after), runIdentity)) {
      throw executeError('P5_OUTPUT_OWNERSHIP');
    }
    const runDir = path.join(outRoot, runBasename);
    return Object.freeze({
      runDir,
      authority: createAuthority({
        ops, parentHandle, runHandle, runBasename, parentIdentity, runIdentity,
        runDir, workspaces: new Map(), closed: false
      })
    });
  } catch (error) {
    if (parentHandle && createdRunIdentity) {
      try {
        await removeOwnedTree({
          ops, parentHandle, basename: runBasename, expectedIdentity: createdRunIdentity,
          requireComplete: true, expectedFiles: {}, expectedIdentities: {},
          fallbackCode: 'P5_OUTPUT_OWNERSHIP'
        });
      } catch {}
    }
    await closeHandle(runHandle);
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
      workspaces: new Map(),
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
  let attempt;
  let basename;
  try {
    await assertRunAuthority(internal, ops);
    const work = await openOrCreateRunChild(internal, ops, 'candidate-work');
    workHandle = work.handle;
    basename = `replay-${candidateId}-attempt-01-${process.pid}-${++temporarySequence}`;
    attempt = await createPrivateDirectory(ops, workHandle, basename, 'P5_INSTALL_FAILED');
    await attempt.handle.sync();
    await workHandle.sync();
    await assertRunAuthority(internal, ops);
    const workspacePath = path.join(internal.runDir, 'candidate-work', basename);
    internal.workspaces.set(basename, { ...attempt, path: workspacePath });
    return workspacePath;
  } catch (error) {
    await rollbackUnregisteredWorkspace(internal, ops, workHandle, basename, attempt);
    throw publicError(error, 'P5_INSTALL_FAILED');
  } finally {
    await closeHandle(workHandle);
  }
}

export async function createCandidateWorkspace({ authority, candidateId, fsImpl } = {}) {
  const internal = authorityInternal(authority);
  assertCandidateId(candidateId);
  const ops = fsOperations(fsImpl ?? internal.ops.source);
  let workHandle;
  let workspace;
  try {
    await assertRunAuthority(internal, ops);
    const work = await openOrCreateRunChild(internal, ops, 'candidate-work');
    workHandle = work.handle;
    if (internal.workspaces.has(candidateId)) throw executeError('P5_OUTPUT_OWNERSHIP');
    workspace = await createPrivateDirectory(ops, workHandle, candidateId, 'P5_INSTALL_FAILED');
    await workspace.handle.sync();
    await workHandle.sync();
    await assertRunAuthority(internal, ops);
    const workspacePath = path.join(internal.runDir, 'candidate-work', candidateId);
    internal.workspaces.set(candidateId, { ...workspace, path: workspacePath });
    return workspacePath;
  } catch (error) {
    await rollbackUnregisteredWorkspace(internal, ops, workHandle, candidateId, workspace);
    throw publicError(error, 'P5_INSTALL_FAILED');
  } finally {
    await closeHandle(workHandle);
  }
}

export async function removeReplayWorkspace({ authority, workspacePath, fsImpl } = {}) {
  const internal = authorityInternal(authority);
  const ops = fsOperations(fsImpl ?? internal.ops.source);
  const basename = workspaceBasename(internal, workspacePath);
  let workHandle;
  try {
    await assertRunAuthority(internal, ops);
    workHandle = await openDirectoryEntry(
      ops, internal.runHandle, 'candidate-work', 'P5_INSTALL_FAILED', 'P5_OUTPUT_OWNERSHIP'
    );
    await removeRegisteredWorkspace(internal, ops, workHandle, basename);
    await workHandle.sync();
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
      if (!isPlainBasename(name)) throw executeError('P5_OUTPUT_OWNERSHIP');
      const registered = internal.workspaces.get(name);
      if (!registered) throw executeError('P5_OUTPUT_OWNERSHIP');
      if (name === keep) {
        await assertNamedDirectoryIdentity(
          workHandle, ops, name, registered.identity, 'P5_INSTALL_FAILED'
        );
        continue;
      }
      await removeRegisteredWorkspace(internal, ops, workHandle, name);
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
    const collision = await inspectCandidate(internal, ops, tree, candidateId, { allowMissing: true });
    if (collision) throw executeError('P5_INSTALL_FAILED');

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
      candidateId,
      stage.identities
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
          {
            requireComplete: true,
            verifyBytes: true,
            expectedIdentities: stage.identities
          }
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
          {
            allowMissing: true,
            requireComplete: false,
            verifyBytes: false,
            expectedIdentities: stage.identities
          }
        );
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

  await closeExecuteTree(tree);
  return frozenInstallResult('created', candidateId, incoming.currentChainSha256);
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
    await verifyCandidateDirectory(
      internal,
      ops,
      tree,
      candidateId,
      stage.identity,
      incoming.files,
      candidateId,
      stage.identities
    );
    return Object.freeze({ status: 'created', candidate_id: candidateId });
  } catch (error) {
    await closeHandle(stage?.handle);
    if (tree && stage) installed ||= await namedDirectoryHasIdentity(tree.candidatesHandle, ops, candidateId, stage.identity);
    try {
      if (tree && stage) await removeVerifiedDirectory(
        internal,
        ops,
        tree,
        tree.candidatesHandle,
        installed ? candidateId : stage.basename,
        stage.identity,
        incoming.files,
        {
          requireComplete: true,
          verifyBytes: true,
          expectedIdentities: stage.identities
        }
      );
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
  let tree; let candidateHandle; let stageHandle; let stageBasename; let stageIdentity;
  let stageFileIdentity; let committed = false;
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
    ({ basename: stageBasename, handle: stageHandle, identity: stageIdentity }
      = await createGeneratedStageDirectory(internal, ops, tree, tree.candidatesHandle));
    let fileHandle;
    try {
      fileHandle = await ops.open(descriptorEntryPath(stageHandle, fileName), WRITE_FLAGS, 0o600);
      const opened = await fileHandle.stat();
      if (!opened.isFile()) throw executeError('P5_INSTALL_FAILED');
      stageFileIdentity = identity(opened);
      await fileHandle.writeFile(bytes); await fileHandle.sync(); await fileHandle.chmod(0o400); await fileHandle.sync();
      const completed = await fileHandle.stat();
      if (!completed.isFile() || !sameIdentity(identity(completed), stageFileIdentity)) {
        throw executeError('P5_INSTALL_FAILED');
      }
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
        await assertStageFileIdentity();
      },
      moveForward: () => ops.renameNoReplaceBetween(tree.candidatesHandle, stageBasename, candidateHandle, 'failures'),
      moveReverse: () => ops.renameNoReplaceBetween(candidateHandle, 'failures', tree.candidatesHandle, stageBasename),
      afterMove: async () => {
        await assertStageFileIdentity();
        await candidateHandle.sync();
        await tree.candidatesHandle.sync();
      }
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
        await removeOwnedTree({
          ops,
          parentHandle: tree.candidatesHandle,
          basename: stageBasename,
          expectedIdentity: stageIdentity,
          expectedFiles: stageFileIdentity ? { [fileName]: bytes } : {},
          expectedIdentities: stageFileIdentity ? { [fileName]: stageFileIdentity } : {},
          requireComplete: true,
          verifyBytes: Boolean(stageFileIdentity),
          assertAuthority: () => assertTreeAuthority(internal, ops, tree),
          fallbackCode: 'P5_INSTALL_FAILED'
        });
        await tree.candidatesHandle.sync();
      }
    } catch {}
    throw executeError(error?.code === 'P5_STALE_BASE' ? 'P5_STALE_BASE' : 'P5_INSTALL_FAILED');
  } finally {
    await closeHandles([stageHandle, candidateHandle]); await closeExecuteTree(tree);
  }

  async function assertStageFileIdentity() {
    if (!stageFileIdentity) throw executeError('P5_INSTALL_FAILED');
    const read = await readRegularFile(ops, stageHandle, fileName, 'P5_INSTALL_FAILED');
    if (!sameIdentity(read.identity, stageFileIdentity)
      || !read.bytes.equals(bytes)
      || (read.mode & 0o777) !== 0o400) throw executeError('P5_INSTALL_FAILED');
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
  let stageIdentity;
  const stageIdentities = {};
  let pointerStage;
  let pointerStageRead;
  try {
    const generationsPath = descriptorEntryPath(tree.rootHandle, SELECTION_GENERATIONS_BASENAME);
    try {
      const stat = await ops.lstat(generationsPath);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw executeError('P5_OUTPUT_OWNERSHIP');
    } catch (error) {
      if (!isMissingError(error)) throw error;
      const made = await createPrivateDirectory(
        ops,
        tree.rootHandle,
        SELECTION_GENERATIONS_BASENAME,
        'P5_OUTPUT_OWNERSHIP'
      );
      generationsHandle = made.handle;
    }
    generationsHandle ??= await openDirectoryEntry(
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
      ({ basename: stageName, handle: stageHandle, identity: stageIdentity }
        = await createGeneratedStageDirectory(internal, ops, tree, generationsHandle));
      for (const name of SELECTION_PATHS) {
        let handle;
        try {
          handle = await ops.open(descriptorEntryPath(stageHandle, name), WRITE_FLAGS, 0o600);
          const opened = await handle.stat();
          if (!opened.isFile()) throw executeError('P5_INSTALL_FAILED');
          stageIdentities[name] = identity(opened);
          await handle.writeFile(files[name]);
          await handle.sync();
          await handle.chmod(0o400);
          await handle.sync();
          const completed = await handle.stat();
          if (!completed.isFile()
            || !sameIdentity(identity(completed), stageIdentities[name])) {
            throw executeError('P5_INSTALL_FAILED');
          }
        } finally { await closeHandle(handle); }
      }
      await stageHandle.sync();
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
        beforeMove: async () => {
          await assertTreeAuthority(internal, ops, tree);
          await assertBoundCandidates();
          await assertSelectionStageIdentity();
        },
        afterMove: async () => {
          await assertSelectionStageIdentity();
          await generationsHandle.sync();
        }
      });
      await closeHandle(stageHandle); stageHandle = undefined;
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
      const createdIdentity = identity(await pointerHandle.stat());
      await pointerHandle.writeFile(pointerBytes);
      await pointerHandle.sync();
      const completed = await pointerHandle.stat();
      if (!completed.isFile() || !sameIdentity(identity(completed), createdIdentity)) {
        throw executeError('P5_INSTALL_FAILED');
      }
      await assertBoundCandidates();
      const namedStage = await readRegularFile(
        ops, tree.rootHandle, pointerStage, 'P5_INSTALL_FAILED'
      );
      if (!sameIdentity(namedStage.identity, createdIdentity)
        || !namedStage.bytes.equals(pointerBytes)) throw executeError('P5_INSTALL_FAILED');
      pointerStageRead = namedStage;
      const currentRead = existing
        ? await readRegularFile(ops, tree.rootHandle, 'manifest.json', 'P5_OUTPUT_OWNERSHIP')
        : null;
      await replaceBoundPointer({
        internal,
        ops,
        tree,
        pointerHandle: tree.rootHandle,
        pointerName: 'manifest.json',
        stagingHandle: tree.rootHandle,
        stageName: pointerStage,
        stageRead: pointerStageRead,
        stageFileHandle: pointerHandle,
        currentRead,
        assertAuthority: async () => {
          await assertTreeAuthority(internal, ops, tree);
          await assertBoundCandidates();
        },
        validateInstalled: async () => {
          const installed = await readRegularFile(ops, tree.rootHandle, 'manifest.json', 'P5_INSTALL_FAILED');
          if (!installed.bytes.equals(pointerBytes)) throw executeError('P5_INSTALL_FAILED');
        }
      });
      pointerStage = undefined;
    } finally { await closeHandle(pointerHandle); }
  } catch (error) {
    throw error;
  } finally {
    await closeHandle(stageHandle);
    if (stageName && stageIdentity && generationsHandle) {
      try { await removeVerifiedDirectory(internal, ops, tree, generationsHandle, stageName,
        stageIdentity, files,
        {
          allowMissing: true,
          requireComplete: false,
          verifyBytes: false,
          expectedIdentities: stageIdentities
        }); } catch {}
    }
    if (pointerStage && pointerStageRead) {
      try { await unlinkBoundRegularFile(ops, tree.rootHandle, pointerStage, pointerStageRead); } catch {}
    }
    await closeHandle(generationsHandle);
  }

  async function assertSelectionStageIdentity() {
    if (!stageHandle || !stageIdentity) throw executeError('P5_INSTALL_FAILED');
    const retained = await stageHandle.stat();
    const names = (await ops.readdir(descriptorPath(stageHandle))).sort();
    if (!retained.isDirectory()
      || !sameIdentity(identity(retained), stageIdentity)
      || !sameStrings(names, [...SELECTION_PATHS].sort())) {
      throw executeError('P5_INSTALL_FAILED');
    }
    for (const name of SELECTION_PATHS) {
      const read = await readRegularFile(ops, stageHandle, name, 'P5_INSTALL_FAILED');
      if (!sameIdentity(read.identity, stageIdentities[name])
        || !read.bytes.equals(files[name])
        || (read.mode & 0o777) !== 0o400) throw executeError('P5_INSTALL_FAILED');
    }
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
      let next;
      try {
        const stat = await ops.lstat(target);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw executeError('P5_OUTPUT_OWNERSHIP');
      } catch (error) {
        if (!isMissingError(error)) throw error;
        const made = await createPrivateDirectory(
          ops, current, component, 'P5_OUTPUT_OWNERSHIP'
        );
        next = made.handle;
        created = true;
      }
      next ??= await openDirectoryEntry(
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
  let handle;
  try {
    const stat = await ops.lstat(target);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw executeError('P5_OUTPUT_OWNERSHIP');
  } catch (error) {
    if (!isMissingError(error)) throw error;
    const made = await createPrivateDirectory(ops, internal.runHandle, basename, 'P5_OUTPUT_OWNERSHIP');
    handle = made.handle;
    created = true;
  }
  handle ??= await openDirectoryEntry(
    ops, internal.runHandle, basename, 'P5_INSTALL_FAILED', 'P5_OUTPUT_OWNERSHIP'
  );
  try {
    if (created) await internal.runHandle.sync();
    await assertRunAuthority(internal, ops);
    return { handle, created };
  } catch (error) {
    if (created && handle) {
      const createdIdentity = identity(await handle.stat());
      try {
        await removeOwnedTree({
          ops,
          parentHandle: internal.runHandle,
          basename,
          expectedIdentity: createdIdentity,
          expectedFiles: {},
          expectedIdentities: {},
          requireComplete: true,
          verifyBytes: true,
          assertAuthority: () => assertRunAuthority(internal, ops),
          fallbackCode: 'P5_OUTPUT_OWNERSHIP'
        });
      } catch {
        // Preserve an ambiguous creation rather than removing a foreign inode.
      }
    }
    await closeHandle(handle);
    throw error;
  }
}

async function createPrivateDirectory(ops, parentHandle, basename, code) {
  if (await entryExists(ops, descriptorEntryPath(parentHandle, basename))) {
    throw executeError(code);
  }
  const stageName = await unusedPrivateDirectoryBasename(ops, parentHandle);
  const beforeNames = (await ops.readdir(descriptorPath(parentHandle))).sort();
  if (beforeNames.includes(stageName) || beforeNames.includes(basename)) throw executeError(code);
  const made = await createBoundDirectory({
    ops,
    parentHandle,
    basename: stageName,
    fallbackCode: code
  });
  const handle = made.handle;
  let createdIdentity = made.identity;
  try {
    const afterNames = (await ops.readdir(descriptorPath(parentHandle))).sort();
    const expectedNames = [...beforeNames, stageName].sort();
    if (!sameStrings(afterNames, expectedNames)) throw executeError(code);
    const opened = await handle.stat();
    if (!sameIdentity(identity(opened), createdIdentity)) throw executeError(code);
    await handle.chmod(0o700);
    await assertNamedDirectoryIdentity(parentHandle, ops, stageName, createdIdentity, code);
    await moveIdentityNoReplace({
      ops,
      sourceHandle: parentHandle,
      sourceName: stageName,
      destinationHandle: parentHandle,
      destinationName: basename,
      expectedIdentity: createdIdentity,
      expectedKind: 'directory',
      moveForward: () => ops.renameNoReplace(parentHandle, stageName, basename),
      moveReverse: () => ops.renameNoReplace(parentHandle, basename, stageName),
      afterMove: () => parentHandle.sync()
    });
    await assertNamedDirectoryIdentity(parentHandle, ops, basename, createdIdentity, code);
    return { handle, identity: createdIdentity };
  } catch (error) {
    if (createdIdentity) {
      try {
        if (await namedDirectoryHasIdentity(parentHandle, ops, basename, createdIdentity)
          && !await entryExists(ops, descriptorEntryPath(parentHandle, stageName))) {
          try {
            await moveIdentityNoReplace({
              ops,
              sourceHandle: parentHandle,
              sourceName: basename,
              destinationHandle: parentHandle,
              destinationName: stageName,
              expectedIdentity: createdIdentity,
              expectedKind: 'directory',
              moveForward: () => ops.renameNoReplace(parentHandle, basename, stageName),
              moveReverse: () => ops.renameNoReplace(parentHandle, stageName, basename)
            });
          } catch {
            // Reconcile the observed path below; a post-effect error is expected.
          }
        }
        if (await namedDirectoryHasIdentity(parentHandle, ops, stageName, createdIdentity)) {
          await removeOwnedTree({
            ops,
            parentHandle,
            basename: stageName,
            expectedIdentity: createdIdentity,
            expectedFiles: {},
            expectedIdentities: {},
            requireComplete: true,
            verifyBytes: true,
            fallbackCode: code
          });
          await parentHandle.sync();
        }
      } catch {
        // Ambiguous ownership is retained rather than removed by basename.
      }
    }
    await closeHandle(handle);
    throw executeError(code);
  }
}

async function unusedPrivateDirectoryBasename(ops, parentHandle) {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const basename = `${PRIVATE_DIRECTORY_PREFIX}${process.pid}-${++temporarySequence}`;
    if (!await entryExists(ops, descriptorEntryPath(parentHandle, basename))) return basename;
  }
  throw executeError('P5_INSTALL_FAILED');
}

function workspaceBasename(internal, workspacePath) {
  const root = path.join(internal.runDir, 'candidate-work');
  if (typeof workspacePath !== 'string' || path.dirname(workspacePath) !== root) {
    throw executeError('P5_AUTHORITY_INVALID');
  }
  const basename = path.basename(workspacePath);
  if (!isPlainBasename(basename) || !internal.workspaces.has(basename)) {
    throw executeError('P5_AUTHORITY_INVALID');
  }
  return basename;
}

async function removeRegisteredWorkspace(internal, ops, workHandle, basename) {
  const registered = internal.workspaces.get(basename);
  if (!registered) throw executeError('P5_OUTPUT_OWNERSHIP');
  const retained = await registered.handle.stat();
  if (!retained.isDirectory() || !sameIdentity(identity(retained), registered.identity)) {
    throw executeError('P5_INSTALL_FAILED');
  }
  await removeOwnedTree({
    ops,
    parentHandle: workHandle,
    basename,
    expectedIdentity: registered.identity,
    assertAuthority: () => assertRunAuthority(internal, ops),
    fallbackCode: 'P5_INSTALL_FAILED'
  });
  await closeHandle(registered.handle);
  internal.workspaces.delete(basename);
}

async function rollbackUnregisteredWorkspace(internal, ops, workHandle, basename, workspace) {
  if (!workHandle || !basename || !workspace || internal.workspaces.has(basename)) return;
  try {
    await removeOwnedTree({
      ops,
      parentHandle: workHandle,
      basename,
      expectedIdentity: workspace.identity,
      expectedFiles: {},
      expectedIdentities: {},
      requireComplete: true,
      verifyBytes: true,
      assertAuthority: () => assertRunAuthority(internal, ops),
      fallbackCode: 'P5_INSTALL_FAILED'
    });
    await workHandle.sync();
  } catch {
    // Preserve an ambiguous creation rather than removing a foreign inode.
  } finally {
    await closeHandle(workspace.handle);
  }
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
    let topEntries = await ops.readdir(descriptorPath(rootHandle));
    if (!topEntries.includes('manifest.json')) {
      await recoverSelectionPointerIfMissing(ops, rootHandle, topEntries);
      topEntries = await ops.readdir(descriptorPath(rootHandle));
    }
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
  let handle;
  let createdIdentity;
  try {
    const made = await createPrivateDirectory(
      ops, parentHandle, basename, 'P5_OUTPUT_OWNERSHIP'
    );
    handle = made.handle;
    createdIdentity = made.identity;
    await assertRunAuthority(internal, ops);
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
      if (createdIdentity) {
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
    throw publicError(error, 'P5_OUTPUT_OWNERSHIP');
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
  try {
    const retained = await handle.stat();
    if (
      !retained.isDirectory()
      || !sameIdentity(identity(retained), expectedIdentity)
      || (await ops.readdir(descriptorPath(handle))).length !== 0
    ) throw executeError('P5_INSTALL_FAILED');
    await removeOwnedTree({
      ops,
      parentHandle,
      basename,
      expectedIdentity,
      expectedFiles: {},
      expectedIdentities: {},
      requireComplete: true,
      verifyBytes: true,
      assertAuthority: () => assertRunAuthority(internal, ops),
      fallbackCode: 'P5_INSTALL_FAILED'
    });
    await parentHandle.sync();
    await assertRunAuthority(internal, ops);
  } finally {
    await closeHandle(handle);
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
  await recoverCandidatePointerIfMissing(ops, tree.candidatesHandle, candidateId);
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
          const read = await readRegularPath(ops, handle, name, fallbackCode, {
            requireSingleLink: relative !== CURRENT_CHAIN_BASENAME
          });
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
  let pointerStageRead;
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
      let child;
      try {
        const stat = await ops.lstat(target);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw executeError('P5_OUTPUT_OWNERSHIP');
      } catch (error) {
        if (!isMissingError(error)) throw error;
        const made = await createPrivateDirectory(
          ops, parent, basename, 'P5_OUTPUT_OWNERSHIP'
        );
        child = made.handle;
        createdDirectories.push({ directory, parent, basename, identity: made.identity });
      }
      child ??= await openDirectoryEntry(
        ops, parent, basename, 'P5_INSTALL_FAILED', 'P5_OUTPUT_OWNERSHIP'
      );
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
      let stageIdentity;
      try {
        stageHandle = await ops.open(stagePath, WRITE_FLAGS, 0o600);
        stageIdentity = identity(await stageHandle.stat());
        await stageHandle.writeFile(bytes);
        await stageHandle.sync();
        await stageHandle.chmod(0o400);
        await stageHandle.sync();
        const completed = await stageHandle.stat();
        if (!sameIdentity(stageIdentity, identity(completed))) {
          throw executeError('P5_INSTALL_FAILED');
        }
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
        if (stageIdentity) {
          try {
            const remaining = await readRegularFileIfPresent(
              ops, tree.candidatesHandle, stageName
            );
            if (remaining && sameIdentity(remaining.identity, stageIdentity)) {
              await unlinkBoundRegularFile(ops, tree.candidatesHandle, stageName, remaining);
            }
          } catch {}
        }
      }
    }

    const pointerBytes = incoming.files[CURRENT_CHAIN_BASENAME];
    const currentPointer = await readRegularFile(
      ops, candidateHandle, CURRENT_CHAIN_BASENAME, 'P5_OUTPUT_OWNERSHIP'
    );
    pointerStage = await unusedTemporaryBasename(internal, ops, tree, tree.candidatesHandle, STAGE_PREFIX);
    let pointerHandle;
    try {
      pointerHandle = await ops.open(descriptorEntryPath(tree.candidatesHandle, pointerStage), WRITE_FLAGS, 0o600);
      const createdIdentity = identity(await pointerHandle.stat());
      await pointerHandle.writeFile(pointerBytes);
      await pointerHandle.sync();
      const completed = await pointerHandle.stat();
      if (!completed.isFile() || !sameIdentity(identity(completed), createdIdentity)) {
        throw executeError('P5_INSTALL_FAILED');
      }
      const namedStage = await readRegularFile(
        ops, tree.candidatesHandle, pointerStage, 'P5_INSTALL_FAILED'
      );
      if (!sameIdentity(namedStage.identity, createdIdentity)
        || !namedStage.bytes.equals(pointerBytes)) throw executeError('P5_INSTALL_FAILED');
      pointerStageRead = namedStage;
      await replaceBoundPointer({
        internal,
        ops,
        tree,
        pointerHandle: candidateHandle,
        pointerName: CURRENT_CHAIN_BASENAME,
        stagingHandle: tree.candidatesHandle,
        stageName: pointerStage,
        stageRead: pointerStageRead,
        stageFileHandle: pointerHandle,
        currentRead: currentPointer,
        assertAuthority: () => assertTreeAuthority(internal, ops, tree),
        validateInstalled: async () => {
          const checked = await inspectCandidate(internal, ops, tree, candidateId, { allowMissing: false });
          if (checked.validated.currentChainSha256 !== incoming.currentChainSha256) {
            throw executeError('P5_INSTALL_FAILED');
          }
        }
      });
      pointerStage = undefined;
    } finally { await closeHandle(pointerHandle); }
  } catch (error) {
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
    if (pointerStage && pointerStageRead) {
      try { await unlinkBoundRegularFile(ops, tree.candidatesHandle, pointerStage, pointerStageRead); } catch {}
    }
    await closeHandles([...directoryHandles.entries()].filter(([name]) => name !== '').map(([, handle]) => handle));
    await closeHandle(candidateHandle);
  }
}

async function createCandidateStage(internal, ops, tree, incoming) {
  let basename;
  let handle;
  let stageIdentity;
  const ownedIdentities = {};
  try {
    ({ basename, handle, identity: stageIdentity }
      = await createGeneratedStageDirectory(internal, ops, tree, tree.candidatesHandle));
    await assertTreeAuthority(internal, ops, tree);
    await handle.chmod(0o700);
    const opened = await handle.stat();
    if (!sameIdentity(identity(opened), stageIdentity)) throw executeError('P5_INSTALL_FAILED');

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
        const made = await createBoundDirectory({
          ops,
          parentHandle: parent,
          basename: basenamePart,
          fallbackCode: 'P5_INSTALL_FAILED'
        });
        const child = made.handle;
        ownedIdentities[directory] = made.identity;
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
          const opened = await fileHandle.stat();
          if (!opened.isFile()) throw executeError('P5_INSTALL_FAILED');
          ownedIdentities[name] = identity(opened);
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
          const completed = await fileHandle.stat();
          if (!completed.isFile()
            || !sameIdentity(identity(completed), ownedIdentities[name])) {
            throw executeError('P5_INSTALL_FAILED');
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
      incoming.candidateId,
      ownedIdentities
    );
    return { basename, handle, identity: stageIdentity, identities: ownedIdentities };
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
          {
            allowMissing: true,
            requireComplete: false,
            verifyBytes: false,
            expectedIdentities: ownedIdentities
          }
        );
      } catch {
        // Never remove a path whose identity or contents can no longer be verified.
      }
    }
    throw publicError(error, 'P5_INSTALL_FAILED');
  }
}

async function createGeneratedStageDirectory(internal, ops, tree, parentHandle) {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const basename = nextTemporaryBasename(STAGE_PREFIX);
    let made;
    try {
      await assertTreeAuthority(internal, ops, tree);
      made = await createBoundDirectory({
        ops,
        parentHandle,
        basename,
        fallbackCode: 'P5_INSTALL_FAILED'
      });
      await assertTreeAuthority(internal, ops, tree);
      return { basename, handle: made.handle, identity: made.identity };
    } catch (error) {
      if (made) {
        try {
          await removeOwnedTree({
            ops,
            parentHandle,
            basename,
            expectedIdentity: made.identity,
            expectedFiles: {},
            expectedIdentities: {},
            requireComplete: true,
            verifyBytes: true,
            assertAuthority: () => assertTreeAuthority(internal, ops, tree),
            fallbackCode: 'P5_INSTALL_FAILED'
          });
        } catch {}
        await closeHandle(made.handle);
      }
      if (isAlreadyExistsError(error)) continue;
      throw publicError(error, 'P5_INSTALL_FAILED');
    }
  }
  throw executeError('P5_INSTALL_FAILED');
}

async function verifyCandidateDirectory(
  internal,
  ops,
  tree,
  basename,
  expectedIdentity,
  expectedFiles,
  candidateId,
  expectedIdentities
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
  if (expectedIdentities) {
    const actualNames = Object.keys(directory.identities).filter(Boolean).sort();
    const expectedNames = Object.keys(expectedIdentities).filter(Boolean).sort();
    if (!sameStrings(actualNames, expectedNames)
      || actualNames.some((name) => (
        !sameIdentity(directory.identities[name], expectedIdentities[name])
      ))) throw executeError('P5_INSTALL_FAILED');
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
  { allowMissing = false, requireComplete, verifyBytes, expectedIdentities }
) {
  try {
    await assertTreeAuthority(internal, ops, tree);
    const directory = await readDirectoryTree(
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
    if (expectedIdentities) {
      const actualIdentityNames = Object.keys(directory.identities).filter(Boolean).sort();
      const expectedIdentityNames = Object.keys(expectedIdentities).filter(Boolean).sort();
      if (actualIdentityNames.some((name) => (
        !expectedIdentities[name]
        || !sameIdentity(directory.identities[name], expectedIdentities[name])
      )) || (requireComplete && !sameStrings(actualIdentityNames, expectedIdentityNames))) {
        throw executeError('P5_INSTALL_FAILED');
      }
    }
    await removeOwnedTree({
      ops,
      parentHandle,
      basename,
      expectedIdentity,
      expectedFiles,
      expectedIdentities: expectedIdentities ?? directory.identities,
      requireComplete,
      verifyBytes,
      allowMissing,
      assertAuthority: () => assertTreeAuthority(internal, ops, tree),
      fallbackCode: 'P5_INSTALL_FAILED'
    });
  } catch (error) {
    if (allowMissing && isMissingError(error)) return;
    throw publicError(error, 'P5_INSTALL_FAILED');
  }
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

async function replaceBoundPointer({
  internal,
  ops,
  tree,
  pointerHandle,
  pointerName,
  stagingHandle,
  stageName,
  stageRead,
  stageFileHandle,
  currentRead,
  assertAuthority,
  validateInstalled
}) {
  let backupName;
  let retiredName;
  const assertRetainedStage = async () => {
    const before = await stageFileHandle.stat();
    const bytes = Buffer.from(await fs.readFile(descriptorPath(stageFileHandle)));
    const after = await stageFileHandle.stat();
    const retained = { bytes, identity: identity(after), mode: after.mode };
    if (!before.isFile() || !after.isFile()
      || !sameIdentity(identity(before), stageRead.identity)
      || Number(before.size) !== bytes.length
      || Number(after.size) !== bytes.length
      || !sameRegularRead(retained, stageRead)) throw executeError('P5_INSTALL_FAILED');
  };
  try {
    await assertAuthority();
    await assertRetainedStage();
    if (currentRead) {
      backupName = await unusedTemporaryBasename(internal, ops, tree, stagingHandle, BACKUP_PREFIX);
      await ops.link(
        descriptorEntryPath(pointerHandle, pointerName),
        descriptorEntryPath(stagingHandle, backupName)
      );
      const linked = await readRegularFile(ops, stagingHandle, backupName, 'P5_INSTALL_FAILED');
      if (!sameRegularRead(linked, currentRead)) throw executeError('P5_INSTALL_FAILED');
      const rebound = await readRegularFile(ops, pointerHandle, pointerName, 'P5_INSTALL_FAILED');
      if (!sameRegularRead(rebound, currentRead)) throw executeError('P5_INSTALL_FAILED');
      await stagingHandle.sync();
      await assertAuthority();
      const finalSource = await readRegularFile(ops, pointerHandle, pointerName, 'P5_INSTALL_FAILED');
      if (!sameRegularRead(finalSource, currentRead)) throw executeError('P5_INSTALL_FAILED');
      retiredName = await unusedTemporaryBasename(
        internal, ops, tree, stagingHandle, BACKUP_PREFIX
      );
      await moveBoundRegularFile({
        ops,
        sourceHandle: pointerHandle,
        sourceName: pointerName,
        destinationHandle: stagingHandle,
        destinationName: retiredName,
        expectedRead: currentRead,
        beforeMove: assertAuthority,
        afterMove: async () => {
          await pointerHandle.sync();
          if (pointerHandle !== stagingHandle) await stagingHandle.sync();
        }
      });
    } else if (await entryExists(ops, descriptorEntryPath(pointerHandle, pointerName))) {
      throw executeError('P5_INSTALL_FAILED');
    }

    await moveIdentityNoReplace({
      ops,
      sourceHandle: stagingHandle,
      sourceName: stageName,
      destinationHandle: pointerHandle,
      destinationName: pointerName,
      expectedIdentity: stageRead.identity,
      expectedKind: 'file',
      moveForward: () => stagingHandle === pointerHandle
        ? ops.renameNoReplace(stagingHandle, stageName, pointerName)
        : ops.renameNoReplaceBetween(stagingHandle, stageName, pointerHandle, pointerName),
      moveReverse: () => stagingHandle === pointerHandle
        ? ops.renameNoReplace(pointerHandle, pointerName, stageName)
        : ops.renameNoReplaceBetween(pointerHandle, pointerName, stagingHandle, stageName),
      beforeMove: async () => {
        await assertAuthority();
        await assertRetainedStage();
      },
      afterMove: async () => {
        await pointerHandle.sync();
        if (pointerHandle !== stagingHandle) await stagingHandle.sync();
        await assertRetainedStage();
      }
    });
    const installed = await readRegularFile(ops, pointerHandle, pointerName, 'P5_INSTALL_FAILED');
    if (!sameRegularRead(installed, stageRead)) throw executeError('P5_INSTALL_FAILED');
    await validateInstalled();
  } catch (error) {
    await rollbackBoundPointer({
      internal, ops, tree, pointerHandle, pointerName, stagingHandle,
      stageName, stageRead, currentRead, backupName, retiredName, assertAuthority
    });
    throw error;
  }

  for (const name of [backupName, retiredName].filter(Boolean)) {
    try { await unlinkBoundRegularFile(ops, stagingHandle, name, currentRead); }
    catch {
      // The new pointer is durable; ambiguous journals remain safe residue.
    }
  }
}

async function recoverCandidatePointerIfMissing(ops, candidatesHandle, candidateId) {
  if (!await entryExists(ops, descriptorEntryPath(candidatesHandle, candidateId))) return;
  const candidateHandle = await openDirectoryEntry(
    ops, candidatesHandle, candidateId, 'P5_OUTPUT_OWNERSHIP', 'P5_OUTPUT_OWNERSHIP'
  );
  try {
    if (await entryExists(ops, descriptorEntryPath(candidateHandle, CURRENT_CHAIN_BASENAME))) return;
    const valid = [];
    for (const name of (await ops.readdir(descriptorPath(candidatesHandle))).sort()) {
      if (!name.startsWith(BACKUP_PREFIX)) continue;
      try {
        const read = await readRegularFile(ops, candidatesHandle, name, 'P5_OUTPUT_OWNERSHIP');
        const pointer = parseCandidatePointer(read.bytes);
        if (pointer.candidate_id !== candidateId || (read.mode & 0o777) !== 0o600) continue;
        const revision = String(pointer.chain_revision).padStart(4, '0');
        const chain = await readRegularFile(
          ops, candidateHandle, `chains/chain-${revision}.json`, 'P5_OUTPUT_OWNERSHIP'
        );
        if (sha256(chain.bytes) !== pointer.chain_sha256) continue;
        valid.push({ name, read });
      } catch {
        // A generated residue is not recovery authority unless fully bound.
      }
    }
    const unique = uniqueRegularReads(valid);
    if (unique.length === 0) return;
    if (unique.length !== 1 || !await reconcileRegularMove({
      ops,
      sourceHandle: candidatesHandle,
      sourceName: unique[0].name,
      destinationHandle: candidateHandle,
      destinationName: CURRENT_CHAIN_BASENAME,
      expectedRead: unique[0].read
    })) throw executeError('P5_OUTPUT_OWNERSHIP');
    await candidateHandle.sync();
    await candidatesHandle.sync();
  } finally {
    await closeHandle(candidateHandle);
  }
}

async function recoverSelectionPointerIfMissing(ops, rootHandle, topEntries) {
  const valid = [];
  for (const name of [...topEntries].sort()) {
    if (!name.startsWith(BACKUP_PREFIX)) continue;
    try {
      const read = await readRegularFile(ops, rootHandle, name, 'P5_OUTPUT_OWNERSHIP');
      if ((read.mode & 0o777) !== 0o600) continue;
      const pointer = parseSelectionPointer(read.bytes);
      if (!await validatesSelectionGeneration(ops, rootHandle, pointer)) continue;
      valid.push({ name, read });
    } catch {
      // A generated residue is not recovery authority unless fully bound.
    }
  }
  const unique = uniqueRegularReads(valid);
  if (unique.length === 0) return;
  if (unique.length !== 1 || !await reconcileRegularMove({
    ops,
    sourceHandle: rootHandle,
    sourceName: unique[0].name,
    destinationHandle: rootHandle,
    destinationName: 'manifest.json',
    expectedRead: unique[0].read
  })) throw executeError('P5_OUTPUT_OWNERSHIP');
  await rootHandle.sync();
}

async function validatesSelectionGeneration(ops, rootHandle, pointer) {
  let generationsHandle;
  let generationHandle;
  try {
    generationsHandle = await openDirectoryEntry(
      ops, rootHandle, SELECTION_GENERATIONS_BASENAME,
      'P5_OUTPUT_OWNERSHIP', 'P5_OUTPUT_OWNERSHIP'
    );
    generationHandle = await openDirectoryEntry(
      ops, generationsHandle, path.posix.basename(pointer.generation),
      'P5_OUTPUT_OWNERSHIP', 'P5_OUTPUT_OWNERSHIP'
    );
    const files = {};
    for (const name of SELECTION_PATHS) {
      const read = await readRegularFile(ops, generationHandle, name, 'P5_OUTPUT_OWNERSHIP');
      if ((read.mode & 0o777) !== 0o400) return false;
      files[name] = read.bytes;
    }
    if (sha256(files['manifest.json']) !== pointer.manifest_sha256) return false;
    normalizeSelectionFiles(files);
    return true;
  } catch {
    return false;
  } finally {
    await closeHandles([generationHandle, generationsHandle]);
  }
}

function uniqueRegularReads(rows) {
  const unique = [];
  for (const row of rows) {
    if (!unique.some((item) => sameRegularRead(item.read, row.read))) unique.push(row);
  }
  return unique;
}

function parseCandidatePointer(bytes) {
  try {
    const pointer = JSON.parse(bytes.toString('utf8'));
    if (stableJson(pointer) !== bytes.toString('utf8')
      || !pointer || Object.getPrototypeOf(pointer) !== Object.prototype
      || Object.keys(pointer).join(',') !== 'candidate_id,chain_revision,chain_sha256,schema_version'
      || pointer.schema_version !== 1
      || !CANDIDATE_IDS.includes(pointer.candidate_id)
      || ![1, 2].includes(pointer.chain_revision)
      || !HASH.test(pointer.chain_sha256)) throw executeError('P5_OUTPUT_OWNERSHIP');
    return pointer;
  } catch {
    throw executeError('P5_OUTPUT_OWNERSHIP');
  }
}

async function rollbackBoundPointer({
  internal,
  ops,
  tree,
  pointerHandle,
  pointerName,
  stagingHandle,
  stageName,
  stageRead,
  currentRead,
  backupName,
  retiredName,
  assertAuthority
}) {
  let rollbackFailed = false;
  try {
    const backupRead = backupName
      ? await readRegularFileIfPresent(ops, stagingHandle, backupName)
      : null;
    const validBackup = currentRead && backupRead && sameRegularRead(backupRead, currentRead)
      ? backupRead : null;
    let current = await readRegularFileIfPresent(ops, pointerHandle, pointerName);
    if (current && sameRegularRead(current, stageRead)) {
      if (!await reconcileRegularMove({
        ops,
        sourceHandle: pointerHandle,
        sourceName: pointerName,
        destinationHandle: stagingHandle,
        destinationName: stageName,
        expectedRead: stageRead
      })) rollbackFailed = true;
      current = await readRegularFileIfPresent(ops, pointerHandle, pointerName);
    } else if (current && (!currentRead || !sameRegularRead(current, currentRead)) && validBackup) {
      const quarantine = await unusedTemporaryBasename(internal, ops, tree, stagingHandle, BACKUP_PREFIX);
      if (!await reconcileRegularMove({
        ops,
        sourceHandle: pointerHandle,
        sourceName: pointerName,
        destinationHandle: stagingHandle,
        destinationName: quarantine,
        expectedRead: current
      })) rollbackFailed = true;
      current = await readRegularFileIfPresent(ops, pointerHandle, pointerName);
    }

    if (currentRead) {
      if (!current && validBackup) {
        if (!await reconcileRegularMove({
          ops,
          sourceHandle: stagingHandle,
          sourceName: backupName,
          destinationHandle: pointerHandle,
          destinationName: pointerName,
          expectedRead: currentRead
        })) rollbackFailed = true;
      }
      const restored = await readRegularFileIfPresent(ops, pointerHandle, pointerName);
      if (!restored || !sameRegularRead(restored, currentRead)) rollbackFailed = true;
    } else if (await entryExists(ops, descriptorEntryPath(pointerHandle, pointerName))) {
      rollbackFailed = true;
    }
    await assertAuthority();
    await pointerHandle.sync();
    if (pointerHandle !== stagingHandle) await stagingHandle.sync();

    for (const name of [backupName, retiredName].filter(Boolean)) {
      const remaining = await readRegularFileIfPresent(ops, stagingHandle, name);
      if (remaining && currentRead && sameRegularRead(remaining, currentRead)) {
        await unlinkBoundRegularFile(ops, stagingHandle, name, currentRead);
      }
    }
    const remainingStage = await readRegularFileIfPresent(ops, stagingHandle, stageName);
    if (remainingStage && sameRegularRead(remainingStage, stageRead)) {
      await unlinkBoundRegularFile(ops, stagingHandle, stageName, stageRead);
    }
  } catch {
    rollbackFailed = true;
  }
  if (rollbackFailed) throw executeError('P5_INSTALL_FAILED');
}

async function reconcileRegularMove({
  ops, sourceHandle, sourceName, destinationHandle, destinationName, expectedRead
}) {
  const source = await readRegularFileIfPresent(ops, sourceHandle, sourceName);
  if (!source || !sameRegularRead(source, expectedRead)
    || await entryExists(ops, descriptorEntryPath(destinationHandle, destinationName))) return false;
  try {
    if (sourceHandle === destinationHandle) {
      await ops.renameNoReplace(sourceHandle, sourceName, destinationName);
    } else {
      await ops.renameNoReplaceBetween(sourceHandle, sourceName, destinationHandle, destinationName);
    }
  } catch {}
  const sourceAfter = await readRegularFileIfPresent(ops, sourceHandle, sourceName);
  const destination = await readRegularFileIfPresent(ops, destinationHandle, destinationName);
  return sourceAfter === null && destination !== null && sameRegularRead(destination, expectedRead);
}

async function moveBoundRegularFile({
  ops,
  sourceHandle,
  sourceName,
  destinationHandle,
  destinationName,
  expectedRead,
  beforeMove = async () => {},
  afterMove = async () => {}
}) {
  await beforeMove();
  const before = await readRegularFileIfPresent(ops, sourceHandle, sourceName);
  if (!before || !sameRegularRead(before, expectedRead)
    || await entryExists(ops, descriptorEntryPath(destinationHandle, destinationName))) {
    throw executeError('P5_INSTALL_FAILED');
  }
  let moveError;
  try {
    if (sourceHandle === destinationHandle) {
      await ops.renameNoReplace(sourceHandle, sourceName, destinationName);
    } else {
      await ops.renameNoReplaceBetween(
        sourceHandle, sourceName, destinationHandle, destinationName
      );
    }
  } catch (error) {
    moveError = error;
  }
  const source = await readRegularFileIfPresent(ops, sourceHandle, sourceName);
  const destination = await readRegularFileIfPresent(ops, destinationHandle, destinationName);
  if (source === null && destination && sameRegularRead(destination, expectedRead)) {
    await afterMove();
    if (moveError) throw publicError(moveError, 'P5_INSTALL_FAILED');
    return;
  }
  if (source === null && destination) {
    await reconcileRegularMove({
      ops,
      sourceHandle: destinationHandle,
      sourceName: destinationName,
      destinationHandle: sourceHandle,
      destinationName: sourceName,
      expectedRead: destination
    });
  }
  throw executeError('P5_INSTALL_FAILED');
}

async function unlinkBoundRegularFile(ops, handle, basename, expectedRead) {
  await retireBoundEntry({
    ops,
    parentHandle: handle,
    basename,
    expectedIdentity: expectedRead.identity,
    expectedKind: 'file',
    fallbackCode: 'P5_INSTALL_FAILED',
    assertAuthority: async () => {
      const first = await readRegularFile(ops, handle, basename, 'P5_INSTALL_FAILED');
      const second = await readRegularFile(ops, handle, basename, 'P5_INSTALL_FAILED');
      if (!sameRegularRead(first, expectedRead) || !sameRegularRead(second, expectedRead)) {
        throw executeError('P5_INSTALL_FAILED');
      }
    },
    destroy: async (retirementHandle, retiredName) => {
      const target = descriptorEntryPath(retirementHandle, retiredName);
      let fileHandle;
      try {
        const before = await fs.lstat(target);
        if (before.isSymbolicLink() || !before.isFile()) {
          throw executeError('P5_INSTALL_FAILED');
        }
        fileHandle = await fs.open(target, READ_FLAGS);
        const opened = await fileHandle.stat();
        const bytes = Buffer.from(await fileHandle.readFile());
        const retained = await fileHandle.stat();
        const named = await fs.lstat(target);
        const retired = { bytes, identity: identity(retained), mode: retained.mode };
        if (!opened.isFile() || !retained.isFile()
          || named.isSymbolicLink() || !named.isFile()
          || !sameIdentity(identity(before), identity(opened))
          || !sameIdentity(identity(opened), identity(retained))
          || !sameIdentity(identity(retained), identity(named))
          || Number(retained.size) !== bytes.length
          || !sameRegularRead(retired, expectedRead)) {
          throw executeError('P5_INSTALL_FAILED');
        }
        await removeBoundEntry({
          ops,
          parentHandle: retirementHandle,
          basename: retiredName,
          expectedIdentity: expectedRead.identity,
          expectedKind: 'file',
          assertAuthority: async () => {
            const exactBytes = Buffer.from(await fs.readFile(descriptorPath(fileHandle)));
            const exact = await fileHandle.stat();
            const exactRead = { bytes: exactBytes, identity: identity(exact), mode: exact.mode };
            if (!exact.isFile() || Number(exact.size) !== exactBytes.length
              || !sameRegularRead(exactRead, expectedRead)) {
              throw executeError('P5_INSTALL_FAILED');
            }
          },
          fallbackCode: 'P5_INSTALL_FAILED'
        });
      } finally {
        await closeHandle(fileHandle);
      }
    }
  });
}

async function readRegularFileIfPresent(ops, handle, basename) {
  if (!await entryExists(ops, descriptorEntryPath(handle, basename))) return null;
  return readRegularFile(ops, handle, basename, 'P5_INSTALL_FAILED');
}

function sameRegularRead(left, right) {
  return left && right
    && sameIdentity(left.identity, right.identity)
    && (left.mode & 0o777) === (right.mode & 0o777)
    && left.bytes.equals(right.bytes);
}

async function readRegularFile(ops, directoryHandle, basename, fallbackCode) {
  return readRegularPath(ops, directoryHandle, basename, fallbackCode);
}

async function readRegularPath(
  ops,
  directoryHandle,
  relative,
  fallbackCode,
  { requireSingleLink = false } = {}
) {
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
      || Number(before.size) !== bytes.length
      || Number(opened.size) !== bytes.length
      || Number(after.size) !== bytes.length
      || Number(pathAfter.size) !== bytes.length
      || requireSingleLink && (
        Number(before.nlink) !== 1
        || Number(opened.nlink) !== 1
        || Number(after.nlink) !== 1
        || Number(pathAfter.nlink) !== 1
      )
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
  const customMkdirBound = provided && typeof provided.mkdirBound === 'function'
    ? provided.mkdirBound.bind(provided)
    : undefined;
  const customRetireEntry = provided && typeof provided.retireEntry === 'function'
    ? provided.retireEntry.bind(provided)
    : undefined;
  const customRemoveBound = provided && typeof provided.removeBound === 'function'
    ? provided.removeBound.bind(provided)
    : undefined;
  return Object.freeze({
    source: provided,
    open: operation('open'),
    lstat: operation('lstat'),
    readdir: operation('readdir'),
    link: operation('link'),
    rename: operation('rename'),
    mkdirBound: customMkdirBound,
    retireEntry: customRetireEntry,
    removeBound: customRemoveBound,
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
  await closeHandles([
    ...[...internal.workspaces.values()].map((workspace) => workspace.handle),
    internal.runHandle,
    internal.parentHandle
  ]);
  internal.workspaces.clear();
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
