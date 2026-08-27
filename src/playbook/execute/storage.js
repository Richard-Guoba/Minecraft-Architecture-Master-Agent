import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sha256, stableJson } from '../shadow/canonical.js';
import {
  executeError,
  sanitizeExecuteError,
  validateChainManifest,
  validateCheckpointPayload,
  validateExecuteSelectionManifest,
  validateSelectionRecord
} from './contracts.js';

const CANDIDATE_IDS = Object.freeze(['candidate-01', 'candidate-02', 'candidate-03']);
const LAYERS = Object.freeze(['brief', 'massing', 'structure', 'roof', 'facade']);
const OUTPUT_BASENAME = 'playbook-execute';
const CANDIDATES_BASENAME = 'candidates';
const CURRENT_CHAIN_BASENAME = 'current-chain.json';
const STAGE_PREFIX = '.playbook-execute.stage-';
const BACKUP_PREFIX = '.playbook-execute.backup-';
const MOVE_BINARY = '/usr/bin/mv';
const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const WRITE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
const UNSAFE_PATH_CHARACTER = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const HASH = /^[a-f0-9]{64}$/u;
const REVISION = '[0-9]{4}';
const CHECKPOINT_PATH = new RegExp(`^checkpoints/(${LAYERS.join('|')})/r(${REVISION})\\.json$`, 'u');
const CHAIN_PATH = new RegExp(`^chains/chain-(${REVISION})\\.json$`, 'u');
const HARD_QA_PATH = new RegExp(`^reviews/chain-(${REVISION})-hard-qa\\.json$`, 'u');
const REVIEW_PATH = new RegExp(`^reviews/chain-(${REVISION})-review\\.json$`, 'u');
const REPAIR_PATH = /^repairs\/attempt-01-(request|patch|result)\.json$/u;
const FAILURE_PATH = /^failures\/attempt-01\.json$/u;
const SELECTION_PATHS = Object.freeze(['manifest.json', 'selection.json', 'selection-report.md']);
const SELECTION_BODY_PATHS = Object.freeze(['selection.json', 'selection-report.md']);
const AUTHORITIES = new WeakMap();
let temporarySequence = 0;

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
      closed: false
    };
    const authority = {};
    Object.defineProperty(authority, 'close', {
      enumerable: true,
      value: async () => closeAuthority(internal)
    });
    AUTHORITIES.set(authority, internal);
    return Object.freeze(authority);
  } catch (error) {
    await closeHandles([runHandle, parentHandle]);
    throw publicError(error, admissionFallback(error));
  }
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
    } catch (error) {
      try {
        if (await namedDirectoryHasIdentity(
          tree.candidatesHandle,
          ops,
          backupName,
          existing.identity
        )) {
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
          await rollbackCandidateBackup(
            internal,
            ops,
            tree,
            backupName,
            candidateId,
            existing
          );
          oldMoved = false;
        } else {
          throw executeError('P5_INSTALL_FAILED');
        }
      } catch {
        await closeExecuteTree(tree);
        throw executeError('P5_INSTALL_FAILED');
      }
      await closeExecuteTree(tree);
      throw publicError(error, 'P5_INSTALL_FAILED');
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
    return Object.freeze({
      candidate_id: candidateId,
      current_chain_sha256: candidate.validated.currentChainSha256,
      current_chain: Buffer.from(candidate.files[CURRENT_CHAIN_BASENAME]),
      files: cloneFileMap(candidate.files)
    });
  } catch (error) {
    throw publicError(error, 'P5_OUTPUT_OWNERSHIP');
  } finally {
    await closeExecuteTree(tree);
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
    for (const candidateId of CANDIDATE_IDS) {
      const candidate = await inspectCandidate(internal, ops, tree, candidateId, { allowMissing: true });
      if (!candidate) throw executeError('P5_AUTHORITY_INVALID');
    }
    const existing = tree.selection;
    if (existing && sameFileMap(existing.files, normalized.files)) {
      return Object.freeze({ status: 'unchanged', artifact_hashes: normalized.artifactHashes });
    }
    await installSelectionFiles(internal, ops, tree, normalized.files, existing);
    return Object.freeze({
      status: existing ? 'replaced' : 'created',
      artifact_hashes: normalized.artifactHashes
    });
  } catch (error) {
    throw publicError(error, 'P5_INSTALL_FAILED');
  } finally {
    await closeExecuteTree(tree);
  }
}

function normalizeCandidateSnapshot({ candidateId, files, currentChain }) {
  assertCandidateId(candidateId);
  if (!Buffer.isBuffer(currentChain)) throw executeError('P5_AUTHORITY_INVALID');
  const immutableFiles = normalizeCandidateFileMap(files);
  let current;
  try {
    current = parseCanonicalValidatedJson(currentChain, validateChainManifest);
  } catch {
    throw executeError('P5_CHECKPOINT_INVALID');
  }
  if (current.candidate_id !== candidateId) throw executeError('P5_CHECKPOINT_INVALID');
  const checkpointPaths = Object.keys(immutableFiles).filter((name) => CHECKPOINT_PATH.test(name));
  if (
    checkpointPaths.length < LAYERS.length
    || LAYERS.some((layer) => !checkpointPaths.some((name) => name.startsWith(`checkpoints/${layer}/`)))
  ) throw executeError('P5_AUTHORITY_INVALID');
  const currentChainBytes = Buffer.from(currentChain);
  const currentChainPath = chainPath(current.chain_revision);
  if (Object.hasOwn(immutableFiles, currentChainPath)) throw executeError('P5_AUTHORITY_INVALID');
  const installedFiles = Object.freeze(sortFileMap({
    ...immutableFiles,
    [currentChainPath]: Buffer.from(currentChainBytes),
    [CURRENT_CHAIN_BASENAME]: Buffer.from(currentChainBytes)
  }));
  const validated = validateCandidateFiles(candidateId, installedFiles, 'P5_CHECKPOINT_INVALID');
  return Object.freeze({
    files: installedFiles,
    candidateId,
    currentChainSha256: validated.currentChainSha256
  });
}

function normalizeCandidateFileMap(files) {
  if (!isPlainObject(files)) throw executeError('P5_AUTHORITY_INVALID');
  const names = Reflect.ownKeys(files);
  if (names.length === 0 || names.some((name) => typeof name !== 'string')) {
    throw executeError('P5_AUTHORITY_INVALID');
  }
  const normalized = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(files, name);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw executeError('P5_AUTHORITY_INVALID');
    }
    if (!isAllowedImmutablePath(name) || !Buffer.isBuffer(descriptor.value)) {
      throw executeError('P5_AUTHORITY_INVALID');
    }
    normalized[name] = Buffer.from(descriptor.value);
  }
  return Object.freeze(sortFileMap(normalized));
}

function validateCandidateFiles(candidateId, files, code) {
  try {
    if (!isPlainObject(files) || !Buffer.isBuffer(files[CURRENT_CHAIN_BASENAME])) {
      throw executeError(code);
    }
    const current = parseCanonicalValidatedJson(files[CURRENT_CHAIN_BASENAME], validateChainManifest);
    if (current.candidate_id !== candidateId) throw executeError(code);
    const currentPath = chainPath(current.chain_revision);
    if (!Buffer.isBuffer(files[currentPath]) || !files[currentPath].equals(files[CURRENT_CHAIN_BASENAME])) {
      throw executeError(code);
    }

    const checkpointByHash = new Map();
    const chainsByRevision = new Map();
    const directories = new Set();
    for (const [name, bytes] of Object.entries(files)) {
      if (!Buffer.isBuffer(bytes)) throw executeError(code);
      if (name === CURRENT_CHAIN_BASENAME) continue;
      if (!isAllowedImmutablePath(name)) throw executeError(code);
      addParentDirectories(directories, name);
      let match = CHECKPOINT_PATH.exec(name);
      if (match) {
        const checkpoint = parseCanonicalValidatedJson(bytes, validateCheckpointPayload);
        const revision = parseRevision(match[2]);
        if (
          checkpoint.candidate_id !== candidateId
          || checkpoint.layer !== match[1]
          || checkpoint.revision !== revision
        ) throw executeError(code);
        const hash = sha256(bytes);
        if (checkpointByHash.has(hash)) throw executeError(code);
        checkpointByHash.set(hash, { checkpoint, name });
        continue;
      }
      match = CHAIN_PATH.exec(name);
      if (match) {
        const chain = parseCanonicalValidatedJson(bytes, validateChainManifest);
        const revision = parseRevision(match[1]);
        if (chain.candidate_id !== candidateId || chain.chain_revision !== revision) {
          throw executeError(code);
        }
        if (chainsByRevision.has(revision)) throw executeError(code);
        chainsByRevision.set(revision, { chain, bytes, hash: sha256(bytes), name });
        continue;
      }
      parseCanonicalJson(bytes, code);
    }

    if (chainsByRevision.size !== current.chain_revision) throw executeError(code);
    const referencedCheckpointHashes = new Set();
    for (let revision = 1; revision <= current.chain_revision; revision += 1) {
      const row = chainsByRevision.get(revision);
      if (!row) throw executeError(code);
      if (revision === 1) {
        if (row.chain.parent_chain_sha256 !== null || row.chain.created_from !== 'initial') {
          throw executeError(code);
        }
      } else {
        const previous = chainsByRevision.get(revision - 1);
        if (row.chain.parent_chain_sha256 !== previous.hash || row.chain.created_from !== 'replay') {
          throw executeError(code);
        }
      }
      for (const checkpointRow of row.chain.checkpoint_hashes) {
        referencedCheckpointHashes.add(checkpointRow.checkpoint_sha256);
        const stored = checkpointByHash.get(checkpointRow.checkpoint_sha256);
        if (!stored || stored.checkpoint.layer !== checkpointRow.layer) throw executeError(code);
      }
      const hardQaName = `reviews/chain-${padRevision(revision)}-hard-qa.json`;
      const reviewName = `reviews/chain-${padRevision(revision)}-review.json`;
      if (files[hardQaName] && sha256(files[hardQaName]) !== row.chain.hard_qa_sha256) {
        throw executeError(code);
      }
      if (files[reviewName] && sha256(files[reviewName]) !== row.chain.p4_review_sha256) {
        throw executeError(code);
      }
    }
    if (
      checkpointByHash.size !== referencedCheckpointHashes.size
      || [...checkpointByHash.keys()].some((hash) => !referencedCheckpointHashes.has(hash))
    ) throw executeError(code);
    for (const name of Object.keys(files)) {
      const auxiliary = HARD_QA_PATH.exec(name) ?? REVIEW_PATH.exec(name);
      if (auxiliary && !chainsByRevision.has(parseRevision(auxiliary[1]))) {
        throw executeError(code);
      }
    }
    const currentStored = chainsByRevision.get(current.chain_revision);
    if (!currentStored.bytes.equals(files[CURRENT_CHAIN_BASENAME])) throw executeError(code);
    return Object.freeze({
      currentChainSha256: currentStored.hash,
      current,
      expectedDirectories: Object.freeze([...directories].sort())
    });
  } catch {
    throw executeError(code);
  }
}

function normalizeSelectionFiles(files) {
  if (!isPlainObject(files) || !sameStrings(Reflect.ownKeys(files).sort(), [...SELECTION_PATHS].sort())) {
    throw executeError('P5_AUTHORITY_INVALID');
  }
  const normalized = {};
  for (const name of SELECTION_PATHS) {
    const descriptor = Object.getOwnPropertyDescriptor(files, name);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value') || !Buffer.isBuffer(descriptor.value)) {
      throw executeError('P5_AUTHORITY_INVALID');
    }
    normalized[name] = Buffer.from(descriptor.value);
  }
  let manifest;
  try {
    manifest = parseCanonicalValidatedJson(
      normalized['manifest.json'],
      validateExecuteSelectionManifest
    );
    parseCanonicalValidatedJson(normalized['selection.json'], validateSelectionRecord);
  } catch {
    throw executeError('P5_AUTHORITY_INVALID');
  }
  for (const name of SELECTION_BODY_PATHS) {
    if (manifest.artifact_hashes[name] !== sha256(normalized[name])) {
      throw executeError('P5_AUTHORITY_INVALID');
    }
  }
  return Object.freeze({
    files: Object.freeze(normalized),
    artifactHashes: Object.freeze({
      'selection.json': manifest.artifact_hashes['selection.json'],
      'selection-report.md': manifest.artifact_hashes['selection-report.md']
    })
  });
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
  try {
    rootHandle = await openOrCreateOwnedDirectory(
      internal,
      ops,
      internal.runHandle,
      OUTPUT_BASENAME,
      create
    );
    const rootIdentity = identity(await rootHandle.stat());
    const topEntries = await ops.readdir(descriptorPath(rootHandle));
    const allowed = new Set([
      CANDIDATES_BASENAME,
      ...SELECTION_PATHS
    ]);
    if (topEntries.some((name) => !allowed.has(name) && !isGeneratedBasename(name))) {
      throw executeError('P5_OUTPUT_OWNERSHIP');
    }
    const selectionNames = topEntries.filter((name) => SELECTION_PATHS.includes(name));
    let selection = null;
    if (selectionNames.length !== 0) {
      if (selectionNames.length !== SELECTION_PATHS.length) throw executeError('P5_OUTPUT_OWNERSHIP');
      const selectionFiles = {};
      const identities = {};
      for (const name of SELECTION_PATHS) {
        const read = await readRegularFile(ops, rootHandle, name, 'P5_OUTPUT_OWNERSHIP');
        selectionFiles[name] = read.bytes;
        identities[name] = read.identity;
      }
      try {
        normalizeSelectionFiles(selectionFiles);
      } catch {
        throw executeError('P5_OUTPUT_OWNERSHIP');
      }
      selection = { files: Object.freeze(selectionFiles), identities: Object.freeze(identities) };
    }
    candidatesHandle = await openOrCreateOwnedDirectory(
      internal,
      ops,
      rootHandle,
      CANDIDATES_BASENAME,
      create
    );
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
      selection
    };
    await assertTreeAuthority(internal, ops, tree);
    return tree;
  } catch (error) {
    await closeHandles([candidatesHandle, rootHandle]);
    if (!create && isMissingError(error)) throw executeError('P5_AUTHORITY_INVALID');
    throw publicError(error, 'P5_OUTPUT_OWNERSHIP');
  }
}

async function openOrCreateOwnedDirectory(internal, ops, parentHandle, basename, create) {
  const target = descriptorEntryPath(parentHandle, basename);
  try {
    await ops.lstat(target);
    return await openDirectoryEntry(
      ops,
      parentHandle,
      basename,
      create ? 'P5_INSTALL_FAILED' : 'P5_AUTHORITY_INVALID',
      'P5_OUTPUT_OWNERSHIP'
    );
  } catch (error) {
    if (!create || !isMissingError(error)) throw error;
  }
  await assertRunAuthority(internal, ops);
  try {
    await ops.mkdir(target, { recursive: false, mode: 0o700 });
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw publicError(error, 'P5_INSTALL_FAILED');
  }
  await assertRunAuthority(internal, ops);
  let handle;
  try {
    handle = await openDirectoryEntry(
      ops,
      parentHandle,
      basename,
      'P5_INSTALL_FAILED',
      'P5_OUTPUT_OWNERSHIP'
    );
    await syncBareDirectory(internal, ops, parentHandle);
    return handle;
  } catch (error) {
    await closeHandle(handle);
    throw error;
  }
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
    const validated = validateCandidateFiles(candidateId, directory.files, 'P5_OUTPUT_OWNERSHIP');
    const expectedDirectories = expectedDirectoriesFor(directory.files);
    if (!sameStrings(directory.directories, expectedDirectories)) {
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
  validateCandidateFiles(candidateId, directory.files, 'P5_INSTALL_FAILED');
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

    const rootHandle = await ops.open(descriptorEntryPath(parentHandle, basename), DIRECTORY_FLAGS);
    try {
      for (const name of actualNames.sort((left, right) => right.length - left.length)) {
        await assertTreeAuthority(internal, ops, tree);
        await assertNamedDirectoryIdentity(parentHandle, ops, basename, expectedIdentity, 'P5_INSTALL_FAILED');
        const stat = await ops.lstat(descriptorEntryPath(rootHandle, name));
        const expectedEntryIdentity = directory.identities[name];
        if (stat.isSymbolicLink() || !stat.isFile() || !sameIdentity(identity(stat), expectedEntryIdentity)) {
          throw executeError('P5_INSTALL_FAILED');
        }
        if (verifyBytes) {
          const read = await readRegularPath(ops, rootHandle, name, 'P5_INSTALL_FAILED');
          if (!read.bytes.equals(expectedFiles[name])) throw executeError('P5_INSTALL_FAILED');
        }
        await ops.unlink(descriptorEntryPath(rootHandle, name));
      }
      for (const name of [...directory.directories].sort((left, right) => right.length - left.length)) {
        const stat = await ops.lstat(descriptorEntryPath(rootHandle, name));
        if (
          stat.isSymbolicLink()
          || !stat.isDirectory()
          || !sameIdentity(identity(stat), directory.identities[name])
        ) throw executeError('P5_INSTALL_FAILED');
        await ops.rmdir(descriptorEntryPath(rootHandle, name));
      }
    } finally {
      await closeHandle(rootHandle);
    }
    await assertTreeAuthority(internal, ops, tree);
    await assertNamedDirectoryIdentity(parentHandle, ops, basename, expectedIdentity, 'P5_INSTALL_FAILED');
    await ops.rmdir(descriptorEntryPath(parentHandle, basename));
  } catch (error) {
    if (allowMissing && isMissingError(error)) return;
    throw publicError(error, 'P5_INSTALL_FAILED');
  }
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
  await assertTreeAuthority(internal, ops, tree);
  await assertNamedDirectoryIdentity(
    parentHandle,
    ops,
    sourceName,
    expectedIdentity,
    'P5_INSTALL_FAILED'
  );
  try {
    await assertTreeAuthority(internal, ops, tree);
    await ops.renameNoReplace(parentHandle, sourceName, destinationName);
  } catch (error) {
    throw publicError(error, 'P5_INSTALL_FAILED');
  }
  let destinationStat;
  let sourceExists;
  try {
    destinationStat = await ops.lstat(descriptorEntryPath(parentHandle, destinationName));
    sourceExists = await entryExists(ops, descriptorEntryPath(parentHandle, sourceName));
  } catch (error) {
    throw publicError(error, 'P5_INSTALL_FAILED');
  }
  if (
    destinationStat.isDirectory()
    && !destinationStat.isSymbolicLink()
    && sameIdentity(identity(destinationStat), expectedIdentity)
    && !sourceExists
  ) return;
  if (!sourceExists) {
    await restoreUnexpectedRename(
      internal,
      ops,
      tree,
      parentHandle,
      destinationName,
      sourceName,
      identity(destinationStat)
    );
  }
  throw executeError('P5_INSTALL_FAILED');
}

async function restoreUnexpectedRename(
  internal,
  ops,
  tree,
  parentHandle,
  sourceName,
  destinationName,
  movedIdentity
) {
  await assertTreeAuthority(internal, ops, tree);
  const before = await ops.lstat(descriptorEntryPath(parentHandle, sourceName));
  if (!sameIdentity(identity(before), movedIdentity)) throw executeError('P5_INSTALL_FAILED');
  await ops.renameNoReplace(parentHandle, sourceName, destinationName);
  const restored = await ops.lstat(descriptorEntryPath(parentHandle, destinationName));
  if (
    !sameIdentity(identity(restored), movedIdentity)
    || await entryExists(ops, descriptorEntryPath(parentHandle, sourceName))
  ) throw executeError('P5_INSTALL_FAILED');
}

async function installSelectionFiles(internal, ops, tree, files, existing) {
  const stageName = nextTemporaryBasename(STAGE_PREFIX);
  let stageHandle;
  const installed = [];
  const backups = new Map();
  try {
    await assertTreeAuthority(internal, ops, tree);
    await ops.mkdir(descriptorEntryPath(tree.rootHandle, stageName), { recursive: false, mode: 0o700 });
    stageHandle = await openDirectoryEntry(
      ops,
      tree.rootHandle,
      stageName,
      'P5_INSTALL_FAILED',
      'P5_INSTALL_FAILED'
    );
    for (const name of SELECTION_PATHS) {
      let handle;
      try {
        handle = await ops.open(descriptorEntryPath(stageHandle, name), WRITE_FLAGS, 0o600);
        await handle.writeFile(files[name]);
        await handle.sync();
        await handle.chmod(0o400);
        await handle.sync();
      } finally {
        await closeHandle(handle);
      }
    }
    await stageHandle.sync();

    if (existing) {
      for (const name of ['manifest.json', 'selection.json', 'selection-report.md']) {
        const backup = nextTemporaryBasename(`${BACKUP_PREFIX}${name}-`);
        await ops.renameNoReplace(tree.rootHandle, name, backup);
        backups.set(name, backup);
      }
    }
    for (const name of ['selection.json', 'selection-report.md', 'manifest.json']) {
      await ops.renameNoReplaceBetween(stageHandle, name, tree.rootHandle, name);
      installed.push(name);
    }
    await closeHandle(stageHandle);
    stageHandle = undefined;
    await ops.rmdir(descriptorEntryPath(tree.rootHandle, stageName));
    await assertTreeAuthority(internal, ops, tree);
    await tree.rootHandle.sync();
    await assertTreeAuthority(internal, ops, tree);
    for (const backup of backups.values()) await ops.unlink(descriptorEntryPath(tree.rootHandle, backup));
  } catch (error) {
    for (const name of installed.reverse()) {
      try {
        const current = await readRegularFile(ops, tree.rootHandle, name, 'P5_INSTALL_FAILED');
        if (current.bytes.equals(files[name])) await ops.unlink(descriptorEntryPath(tree.rootHandle, name));
      } catch {
        // A path that cannot be verified is never removed.
      }
    }
    for (const [name, backup] of [...backups.entries()].reverse()) {
      try {
        if (!await entryExists(ops, descriptorEntryPath(tree.rootHandle, name))) {
          await ops.renameNoReplace(tree.rootHandle, backup, name);
        }
      } catch {
        throw executeError('P5_INSTALL_FAILED');
      }
    }
    if (stageHandle) {
      try {
        for (const name of await ops.readdir(descriptorPath(stageHandle))) {
          await ops.unlink(descriptorEntryPath(stageHandle, name));
        }
        await closeHandle(stageHandle);
        stageHandle = undefined;
        await ops.rmdir(descriptorEntryPath(tree.rootHandle, stageName));
      } catch {
        // Preserve anything that cannot be positively identified as this stage.
      }
    }
    throw publicError(error, 'P5_INSTALL_FAILED');
  } finally {
    await closeHandle(stageHandle);
  }
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

function assertImmutableHistory(existingFiles, incomingFiles) {
  for (const [name, bytes] of Object.entries(existingFiles)) {
    if (name === CURRENT_CHAIN_BASENAME) continue;
    if (!incomingFiles[name] || !incomingFiles[name].equals(bytes)) {
      throw executeError('P5_OUTPUT_OWNERSHIP');
    }
  }
}

function parseCanonicalValidatedJson(bytes, validator) {
  const value = parseCanonicalJson(bytes, 'P5_CHECKPOINT_INVALID');
  const validated = validator(value);
  if (!Buffer.from(stableJson(validated), 'utf8').equals(bytes)) {
    throw executeError('P5_CHECKPOINT_INVALID');
  }
  return validated;
}

function parseCanonicalJson(bytes, code) {
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(decoded);
    if (!isPlainObject(value) || !Buffer.from(stableJson(value), 'utf8').equals(bytes)) {
      throw executeError(code);
    }
    return value;
  } catch {
    throw executeError(code);
  }
}

function isAllowedImmutablePath(value) {
  return typeof value === 'string'
    && !UNSAFE_PATH_CHARACTER.test(value)
    && (
      CHECKPOINT_PATH.test(value)
      || CHAIN_PATH.test(value)
      || HARD_QA_PATH.test(value)
      || REVIEW_PATH.test(value)
      || REPAIR_PATH.test(value)
      || FAILURE_PATH.test(value)
    );
}

function expectedDirectoriesFor(files) {
  const directories = new Set();
  for (const name of Object.keys(files)) addParentDirectories(directories, name);
  return [...directories].sort();
}

function addParentDirectories(output, filename) {
  let parent = path.posix.dirname(filename);
  while (parent !== '.') {
    output.add(parent);
    parent = path.posix.dirname(parent);
  }
}

function chainPath(revision) {
  return `chains/chain-${padRevision(revision)}.json`;
}

function padRevision(revision) {
  if (!Number.isInteger(revision) || revision < 1 || revision > 9999) {
    throw executeError('P5_CHECKPOINT_INVALID');
  }
  return String(revision).padStart(4, '0');
}

function parseRevision(value) {
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1 || revision > 9999) {
    throw executeError('P5_CHECKPOINT_INVALID');
  }
  return revision;
}

function assertCandidateId(candidateId) {
  if (!CANDIDATE_IDS.includes(candidateId)) throw executeError('P5_AUTHORITY_INVALID');
}

function frozenInstallResult(status, candidateId, currentChainSha256) {
  return Object.freeze({
    status,
    candidate_id: candidateId,
    current_chain_sha256: currentChainSha256
  });
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

function isPlainObject(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function cloneFileMap(files) {
  return Object.freeze(Object.fromEntries(
    Object.entries(files).map(([name, bytes]) => [name, Buffer.from(bytes)])
  ));
}

function sortFileMap(files) {
  return Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right)));
}

function sameFileMap(left, right) {
  const leftNames = Object.keys(left).sort();
  const rightNames = Object.keys(right).sort();
  return sameStrings(leftNames, rightNames)
    && leftNames.every((name) => left[name].equals(right[name]));
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
