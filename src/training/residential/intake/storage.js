import { createHash } from 'node:crypto';
import { constants as FS_CONSTANTS } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TrainingDataError } from '../../trainingError.js';
import { failContract } from '../contracts/contractError.js';
import {
  readResidentialWorkspaceStatus,
  validateResidentialWorkspaceRoot
} from '../workspace/index.js';
import { canonicalJson } from './canonicalJson.js';
import { RESIDENTIAL_INTAKE_LIMITS } from './limits.js';

const QUARANTINE_IDENTITY_SOURCE = 'residential-quarantine-identity-v1';
const QUARANTINE_IDENTITY_SCHEMA_VERSION = 1;
const READ_ONLY_MODE = 0o400;
const QUARANTINE_DIRECTORY_MODE = 0o500;

export function caseIdFromSha256(value) {
  if (!/^[a-f0-9]{64}$/u.test(value || '')) {
    throw new TrainingDataError('SOURCE_HASH_INVALID', String(value));
  }
  return `case-${value.slice(0, 24)}`;
}

export async function readCandidateBytes(
  filePath,
  { maxBytes = RESIDENTIAL_INTAKE_LIMITS.maxRawBytes } = {}
) {
  const file = await readRegularFile(filePath, {
    emptyCode: 'SOURCE_FILE_EMPTY',
    nonRegularCode: 'SOURCE_FILE_NOT_REGULAR',
    overflowCode: 'RAW_BYTES_LIMIT',
    symlinkCode: 'SOURCE_FILE_SYMLINK',
    maxBytes,
    rejectEmpty: true
  });
  return file.bytes;
}

export async function readVerifiedQuarantineArtifacts({ root, projectRoot }) {
  const context = await readyQuarantineRoot({ root, projectRoot });
  const entries = await fs.readdir(context.quarantine.path, { withFileTypes: true });
  const artifacts = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!/^case-[a-f0-9]{24}$/u.test(entry.name)) continue;
    const target = path.join(context.quarantine.path, entry.name);
    const verified = await readVerifiedQuarantineArtifact({
      context,
      target,
      caseId: entry.name
    });
    artifacts.push(Object.freeze({
      case_id: entry.name,
      sha256: verified.sha256
    }));
  }
  return Object.freeze(artifacts);
}

export async function quarantineArtifact({ root, projectRoot, bytes, sha256 }) {
  const artifact = Buffer.from(bytes);
  const caseId = caseIdFromSha256(sha256);
  const actualSha256 = hashBytes(artifact);
  if (actualSha256 !== sha256) {
    throw new TrainingDataError('SOURCE_HASH_MISMATCH', caseId, {
      expected_sha256: sha256,
      actual_sha256: actualSha256
    });
  }

  const context = await readyQuarantineRoot({ root, projectRoot });
  const target = path.join(context.quarantine.path, caseId);
  if (await safeLstat(target)) {
    await verifyQuarantineArtifact({ context, target, caseId, bytes: artifact, sha256 });
    return Object.freeze({ case_id: caseId, directory: target, created: false });
  }

  await assertContext(context);
  // A failed publication intentionally leaves only this private sibling behind.
  // Removing it safely would require a directory-descriptor-relative unlink API.
  const temporary = await fs.mkdtemp(
    path.join(context.quarantine.path, `.${caseId}.tmp-`)
  );
  const temporaryDirectory = await snapshotDirectory(temporary, target);
  const temporaryHandle = await openPinnedDirectory(temporaryDirectory, target);
  try {
    const identity = quarantineIdentity({ caseId, sha256, byteSize: artifact.length });
    await writeReadOnly({
      context,
      parent: temporaryDirectory,
      filePath: path.join(temporary, 'payload'),
      bytes: artifact
    });
    await writeReadOnly({
      context,
      parent: temporaryDirectory,
      filePath: path.join(temporary, 'identity.json'),
      bytes: canonicalFileJson(identity)
    });
    await temporaryHandle.chmod(QUARANTINE_DIRECTORY_MODE);
    await assertPinnedDirectoryHandle(
      temporaryHandle,
      temporaryDirectory,
      QUARANTINE_DIRECTORY_MODE,
      target
    );
    await assertContext(context);
    await assertSameDirectory(temporaryDirectory, target);
    if (await safeLstat(target)) {
      await verifyQuarantineArtifact({ context, target, caseId, bytes: artifact, sha256 });
      return Object.freeze({ case_id: caseId, directory: target, created: false });
    }
    try {
      await fs.rename(temporary, target);
      await assertPinnedDirectoryHandle(
        temporaryHandle,
        temporaryDirectory,
        QUARANTINE_DIRECTORY_MODE,
        target
      );
      await assertContext(context);
      await verifyQuarantineArtifact({ context, target, caseId, bytes: artifact, sha256 });
      return Object.freeze({ case_id: caseId, directory: target, created: true });
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error?.code)) throw error;
      await assertContext(context);
      await verifyQuarantineArtifact({ context, target, caseId, bytes: artifact, sha256 });
      return Object.freeze({ case_id: caseId, directory: target, created: false });
    }
  } catch (error) {
    if (error instanceof TrainingDataError) throw error;
    throw quarantineConflict(target, error);
  } finally {
    await temporaryHandle.close();
  }
}

export async function writeQuarantineFingerprint({
  root,
  projectRoot,
  caseId,
  fingerprint
}) {
  if (!/^case-[a-f0-9]{24}$/u.test(caseId || '')) {
    throw new TrainingDataError('SOURCE_CASE_INVALID', String(caseId));
  }
  const context = await readyQuarantineRoot({ root, projectRoot });
  const target = path.join(context.quarantine.path, caseId);
  const directory = await snapshotDirectory(target, target);
  const desired = canonicalFileJson(fingerprint);
  let handle;
  let descriptorRoot;
  let result;
  try {
    handle = await openPinnedDirectory(directory, target);
    descriptorRoot = await pinnedDescriptorRoot(handle, directory, target);
    await assertContext(context);
    const before = await verifyPinnedQuarantineCase({
      context,
      handle,
      directory,
      descriptorRoot,
      target,
      caseId,
      expectedMode: QUARANTINE_DIRECTORY_MODE
    });
    if (before.fingerprint !== null) {
      if (!before.fingerprint.equals(desired)) throw quarantineConflict(target);
      result = 'verified';
      return result;
    }
    await handle.chmod(0o700);
    await assertPinnedDirectoryHandle(handle, directory, 0o700, target);
    await assertContext(context);
    await verifyPinnedQuarantineCase({
      context,
      handle,
      directory,
      descriptorRoot,
      target,
      caseId,
      expectedMode: 0o700
    });
    await writePinnedReadOnlyJson({
      descriptorRoot,
      name: 'fingerprint.json',
      bytes: desired,
      target
    });
    await verifyPinnedQuarantineCase({
      context,
      handle,
      directory,
      descriptorRoot,
      target,
      caseId,
      expectedMode: 0o700,
      expectedFingerprint: desired,
      requireFingerprint: true
    });
    result = 'created';
    return result;
  } catch (error) {
    if (error instanceof TrainingDataError) throw error;
    throw quarantineConflict(target, error);
  } finally {
    try {
      if (handle) {
        await handle.chmod(QUARANTINE_DIRECTORY_MODE);
        await assertPinnedDirectoryHandle(
          handle,
          directory,
          QUARANTINE_DIRECTORY_MODE,
          target
        );
        await assertContext(context);
        await verifyPinnedQuarantineCase({
          context,
          handle,
          directory,
          descriptorRoot,
          target,
          caseId,
          expectedMode: QUARANTINE_DIRECTORY_MODE,
          expectedFingerprint: result === 'created' || result === 'verified'
            ? desired
            : undefined,
          requireFingerprint: result === 'created' || result === 'verified'
        });
      }
    } catch (error) {
      if (error instanceof TrainingDataError) throw error;
      throw quarantineConflict(target, error);
    } finally {
      await handle?.close();
    }
  }
}

export async function writeJsonOnceOrVerify(filePath, value) {
  const desired = canonicalJson(value);
  const contents = `${JSON.stringify(JSON.parse(desired), null, 2)}\n`;
  const existing = await safeLstat(filePath);
  if (existing?.isSymbolicLink()) throw immutableJsonConflict(filePath);
  try {
    const handle = await fs.open(filePath, 'wx', READ_ONLY_MODE);
    try {
      await handle.writeFile(contents, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    return 'created';
  } catch (error) {
    if (error?.code !== 'EEXIST') throw immutableJsonConflict(filePath, error);
  }

  try {
    const current = await safeLstat(filePath);
    if (!current?.isFile() || current.isSymbolicLink()) throw immutableJsonConflict(filePath);
    const existingFile = await readRegularFile(filePath, {
      nonRegularCode: 'IMMUTABLE_JSON_CONFLICT',
      symlinkCode: 'IMMUTABLE_JSON_CONFLICT'
    });
    const existingCanonical = canonicalJson(JSON.parse(existingFile.bytes.toString('utf8')));
    if (existingCanonical !== desired) throw immutableJsonConflict(filePath);
    return 'verified';
  } catch (error) {
    if (error instanceof TrainingDataError && error.code === 'IMMUTABLE_JSON_CONFLICT') {
      throw error;
    }
    throw immutableJsonConflict(filePath, error);
  }
}

async function readyQuarantineRoot({ root, projectRoot }) {
  const workspaceRoot = await validateResidentialWorkspaceRoot(root, {
    projectRoot
  });
  const status = await readResidentialWorkspaceStatus({
    root: workspaceRoot,
    projectRoot
  });
  if (status.state !== 'ready') {
    failContract('WORKSPACE_NOT_READY', 'workspace.root', workspaceRoot);
  }
  const context = Object.freeze({
    root: await snapshotDirectory(workspaceRoot, workspaceRoot),
    quarantine: await snapshotDirectory(path.join(workspaceRoot, 'quarantine'), workspaceRoot)
  });
  await assertContext(context);
  return context;
}

async function verifyQuarantineArtifact({ context, target, caseId, bytes, sha256 }) {
  let handle;
  try {
    await assertContext(context);
    const directory = await snapshotDirectory(target, target);
    handle = await openPinnedDirectory(directory, target);
    const descriptorRoot = await pinnedDescriptorRoot(handle, directory, target);
    await verifyPinnedQuarantineCase({
      context,
      handle,
      directory,
      descriptorRoot,
      target,
      caseId,
      expectedMode: QUARANTINE_DIRECTORY_MODE,
      expectedBytes: bytes,
      expectedSha256: sha256
    });
  } catch (error) {
    if (error instanceof TrainingDataError && error.code === 'QUARANTINE_CONFLICT') {
      throw error;
    }
    throw quarantineConflict(target, error);
  } finally {
    await handle?.close();
  }
}

async function readVerifiedQuarantineArtifact({ context, target, caseId }) {
  let handle;
  try {
    await assertContext(context);
    const directory = await snapshotDirectory(target, target);
    handle = await openPinnedDirectory(directory, target);
    const descriptorRoot = await pinnedDescriptorRoot(handle, directory, target);
    const verified = await verifyPinnedQuarantineCase({
      context,
      handle,
      directory,
      descriptorRoot,
      target,
      caseId,
      expectedMode: QUARANTINE_DIRECTORY_MODE
    });
    return Object.freeze({ sha256: verified.sha256 });
  } catch (error) {
    if (error instanceof TrainingDataError && error.code === 'QUARANTINE_CONFLICT') {
      throw error;
    }
    throw quarantineConflict(target, error);
  } finally {
    await handle?.close();
  }
}

async function verifyPinnedQuarantineCase({
  context,
  handle,
  directory,
  descriptorRoot,
  target,
  caseId,
  expectedMode,
  expectedBytes,
  expectedSha256,
  expectedFingerprint,
  requireFingerprint = false
}) {
  await assertContext(context);
  await assertPinnedDirectoryHandle(handle, directory, expectedMode, target);
  const entries = await fs.readdir(descriptorRoot, { withFileTypes: true });
  const names = new Set(entries.map((entry) => entry.name));
  const allowed = new Set(['identity.json', 'payload', 'fingerprint.json']);
  if (
    entries.length < 2 || entries.length > 3 ||
    entries.some((entry) => !allowed.has(entry.name) || !entry.isFile() || entry.isSymbolicLink()) ||
    !names.has('identity.json') || !names.has('payload') ||
    (requireFingerprint && !names.has('fingerprint.json'))
  ) {
    throw quarantineConflict(target);
  }
  const identity = await readPinnedReadOnlyFile({
    descriptorRoot,
    name: 'identity.json',
    target
  });
  const payload = await readPinnedReadOnlyFile({
    descriptorRoot,
    name: 'payload',
    target,
    maxBytes: RESIDENTIAL_INTAKE_LIMITS.maxRawBytes
  });
  const identityValue = parseCanonicalJson(identity, target);
  const identitySha256 = identityValue?.sha256;
  const identitySize = identityValue?.byte_size;
  let derivedCaseId;
  try {
    derivedCaseId = caseIdFromSha256(identitySha256);
  } catch {
    throw quarantineConflict(target);
  }
  if (
    !/^[a-f0-9]{64}$/u.test(identitySha256 || '') ||
    derivedCaseId !== caseId ||
    !Number.isInteger(identitySize) || identitySize !== payload.length ||
    hashBytes(payload) !== identitySha256 ||
    !identity.equals(canonicalFileJson(quarantineIdentity({
      caseId,
      sha256: identitySha256,
      byteSize: identitySize
    }))) ||
    (expectedBytes !== undefined && !payload.equals(expectedBytes)) ||
    (expectedSha256 !== undefined && identitySha256 !== expectedSha256)
  ) {
    throw quarantineConflict(target);
  }
  let fingerprint = null;
  if (names.has('fingerprint.json')) {
    fingerprint = await readPinnedReadOnlyFile({
      descriptorRoot,
      name: 'fingerprint.json',
      target
    });
    parseCanonicalJson(fingerprint, target);
    if (expectedFingerprint !== undefined && !fingerprint.equals(expectedFingerprint)) {
      throw quarantineConflict(target);
    }
  }
  return Object.freeze({ fingerprint, sha256: identitySha256 });
}

async function pinnedDescriptorRoot(handle, directory, target) {
  const descriptorRoot = `/proc/self/fd/${handle.fd}`;
  try {
    const metadata = await fs.stat(descriptorRoot);
    if (
      !metadata.isDirectory() ||
      metadata.dev !== directory.dev || metadata.ino !== directory.ino
    ) {
      throw quarantineConflict(target);
    }
    return descriptorRoot;
  } catch (error) {
    if (error instanceof TrainingDataError) throw error;
    throw quarantineConflict(target, error);
  }
}

async function readPinnedReadOnlyFile({
  descriptorRoot,
  name,
  target,
  maxBytes
}) {
  const file = await readRegularFile(path.join(descriptorRoot, name), {
    nonRegularCode: 'QUARANTINE_CONFLICT',
    symlinkCode: 'QUARANTINE_CONFLICT',
    overflowCode: 'QUARANTINE_CONFLICT',
    maxBytes
  });
  if ((file.metadata.mode & 0o777) !== READ_ONLY_MODE) {
    throw quarantineConflict(target);
  }
  return file.bytes;
}

async function writePinnedReadOnlyJson({ descriptorRoot, name, bytes, target }) {
  const filePath = path.join(descriptorRoot, name);
  const handle = await fs.open(
    filePath,
    FS_CONSTANTS.O_WRONLY |
      FS_CONSTANTS.O_CREAT |
      FS_CONSTANTS.O_EXCL |
      FS_CONSTANTS.O_NOFOLLOW,
    READ_ONLY_MODE
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    const metadata = await handle.stat();
    if (!metadata.isFile() || (metadata.mode & 0o777) !== READ_ONLY_MODE) {
      throw quarantineConflict(target);
    }
  } catch (error) {
    if (error instanceof TrainingDataError) throw error;
    throw quarantineConflict(target, error);
  } finally {
    await handle.close();
  }
}

function parseCanonicalJson(bytes, target) {
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    if (!bytes.equals(canonicalFileJson(value))) throw quarantineConflict(target);
    return value;
  } catch (error) {
    if (error instanceof TrainingDataError) throw error;
    throw quarantineConflict(target, error);
  }
}

async function readRegularFile(filePath, {
  emptyCode,
  nonRegularCode,
  overflowCode,
  symlinkCode,
  maxBytes,
  rejectEmpty = false
} = {}) {
  let handle;
  try {
    handle = await fs.open(filePath, FS_CONSTANTS.O_RDONLY | FS_CONSTANTS.O_NOFOLLOW);
    const before = await handle.stat();
    if (!before.isFile()) {
      throw new TrainingDataError(nonRegularCode, String(filePath));
    }
    if (maxBytes !== undefined && before.size > maxBytes) {
      throw new TrainingDataError(overflowCode, String(filePath), { max_bytes: maxBytes });
    }
    if (rejectEmpty && before.size === 0) {
      throw new TrainingDataError(emptyCode, String(filePath));
    }
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) {
        throw new TrainingDataError(nonRegularCode, String(filePath));
      }
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (after.size !== before.size) {
      if (maxBytes !== undefined && after.size > maxBytes) {
        throw new TrainingDataError(overflowCode, String(filePath), { max_bytes: maxBytes });
      }
      throw new TrainingDataError(nonRegularCode, String(filePath));
    }
    return Object.freeze({ bytes, metadata: after });
  } catch (error) {
    if (error instanceof TrainingDataError) throw error;
    if (error?.code === 'ELOOP') {
      throw new TrainingDataError(symlinkCode, String(filePath));
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

async function writeReadOnly({ context, parent, filePath, bytes }) {
  await assertContext(context);
  await assertSameDirectory(parent, parent.path);
  const handle = await fs.open(
    filePath,
    FS_CONSTANTS.O_WRONLY |
      FS_CONSTANTS.O_CREAT |
      FS_CONSTANTS.O_EXCL |
      FS_CONSTANTS.O_NOFOLLOW,
    READ_ONLY_MODE
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    const metadata = await handle.stat();
    if (!metadata.isFile() || (metadata.mode & 0o777) !== READ_ONLY_MODE) {
      throw quarantineConflict(parent.path);
    }
    await assertContext(context);
    await assertSameDirectory(parent, parent.path);
    await assertSameFile(filePath, metadata, parent.path);
    return Object.freeze({ path: filePath, dev: metadata.dev, ino: metadata.ino });
  } finally {
    await handle.close();
  }
}

function quarantineIdentity({ caseId, sha256, byteSize }) {
  return {
    source: QUARANTINE_IDENTITY_SOURCE,
    schema_version: QUARANTINE_IDENTITY_SCHEMA_VERSION,
    case_id: caseId,
    sha256,
    byte_size: byteSize
  };
}

function canonicalFileJson(value) {
  return Buffer.from(`${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`);
}

function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function snapshotDirectory(directoryPath, conflictTarget) {
  const entry = await safeLstat(directoryPath);
  if (!entry?.isDirectory() || entry.isSymbolicLink()) {
    throw quarantineConflict(conflictTarget);
  }
  return Object.freeze({
    path: directoryPath,
    dev: entry.dev,
    ino: entry.ino,
    mode: entry.mode
  });
}

async function assertContext(context) {
  await assertSameDirectory(context.root, context.root.path);
  await assertSameDirectory(context.quarantine, context.quarantine.path);
}

async function assertSameDirectory(snapshot, conflictTarget) {
  const entry = await safeLstat(snapshot.path);
  if (
    !entry?.isDirectory() || entry.isSymbolicLink() ||
    entry.dev !== snapshot.dev || entry.ino !== snapshot.ino
  ) {
    throw quarantineConflict(conflictTarget);
  }
  return entry;
}

async function assertSameFile(filePath, metadata, conflictTarget) {
  const entry = await safeLstat(filePath);
  if (
    !entry?.isFile() || entry.isSymbolicLink() ||
    entry.dev !== metadata.dev || entry.ino !== metadata.ino
  ) {
    throw quarantineConflict(conflictTarget);
  }
}

async function openPinnedDirectory(snapshot, conflictTarget) {
  let handle;
  try {
    handle = await fs.open(
      snapshot.path,
      FS_CONSTANTS.O_RDONLY |
        FS_CONSTANTS.O_DIRECTORY |
        FS_CONSTANTS.O_NOFOLLOW
    );
    await assertPinnedDirectoryHandle(handle, snapshot, undefined, conflictTarget);
    return handle;
  } catch (error) {
    await handle?.close();
    if (error instanceof TrainingDataError) throw error;
    if (error?.code === 'ELOOP') throw quarantineConflict(conflictTarget, error);
    throw error;
  }
}

async function assertPinnedDirectoryHandle(handle, snapshot, expectedMode, conflictTarget) {
  const metadata = await handle.stat();
  if (
    !metadata.isDirectory() ||
    metadata.dev !== snapshot.dev || metadata.ino !== snapshot.ino ||
    (expectedMode !== undefined && (metadata.mode & 0o777) !== expectedMode)
  ) {
    throw quarantineConflict(conflictTarget);
  }
  return metadata;
}

async function safeLstat(filePath) {
  try {
    return await fs.lstat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function quarantineConflict(target, cause) {
  return new TrainingDataError(
    'QUARANTINE_CONFLICT',
    String(target),
    cause ? { cause: String(cause.message || cause) } : {}
  );
}

function immutableJsonConflict(filePath, cause) {
  return new TrainingDataError(
    'IMMUTABLE_JSON_CONFLICT',
    String(filePath),
    cause ? { cause: String(cause.message || cause) } : {}
  );
}
