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
  try {
    await assertContext(context);
    const directory = await snapshotDirectory(target, target);
    if ((directory.mode & 0o777) !== QUARANTINE_DIRECTORY_MODE) {
      throw quarantineConflict(target);
    }
    await assertContext(context);
    await assertSameDirectory(directory, target);
    const entries = await fs.readdir(target, { withFileTypes: true });
    await assertContext(context);
    await assertSameDirectory(directory, target);
    if (
      entries.length !== 2 ||
      !entries.some((entry) => entry.name === 'identity.json' && entry.isFile() && !entry.isSymbolicLink()) ||
      !entries.some((entry) => entry.name === 'payload' && entry.isFile() && !entry.isSymbolicLink())
    ) {
      throw quarantineConflict(target);
    }
    const identityPath = path.join(target, 'identity.json');
    const payloadPath = path.join(target, 'payload');
    const expectedIdentity = canonicalFileJson(
      quarantineIdentity({ caseId, sha256, byteSize: bytes.length })
    );
    const identity = await readSecureQuarantineFile({
      context, directory, filePath: identityPath, target
    });
    const payload = await readSecureQuarantineFile({
      context, directory, filePath: payloadPath, target
    });
    if (
      !identity.equals(expectedIdentity) ||
      !payload.equals(bytes) ||
      hashBytes(payload) !== sha256
    ) {
      throw quarantineConflict(target);
    }
  } catch (error) {
    if (error instanceof TrainingDataError && error.code === 'QUARANTINE_CONFLICT') {
      throw error;
    }
    throw quarantineConflict(target, error);
  }
}

async function readSecureQuarantineFile({ context, directory, filePath, target }) {
  await assertContext(context);
  await assertSameDirectory(directory, target);
  const file = await readRegularFile(filePath, {
    nonRegularCode: 'QUARANTINE_CONFLICT',
    symlinkCode: 'QUARANTINE_CONFLICT'
  });
  if ((file.metadata.mode & 0o777) !== READ_ONLY_MODE) throw quarantineConflict(target);
  await assertContext(context);
  await assertSameDirectory(directory, target);
  await assertSameFile(filePath, file.metadata, target);
  return file.bytes;
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
