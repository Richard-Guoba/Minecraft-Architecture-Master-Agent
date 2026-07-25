import { createHash } from 'node:crypto';
import { constants as FS_CONSTANTS } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TrainingDataError } from '../../trainingError.js';
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
  return readRegularBytes(filePath, {
    emptyCode: 'SOURCE_FILE_EMPTY',
    nonRegularCode: 'SOURCE_FILE_NOT_REGULAR',
    overflowCode: 'RAW_BYTES_LIMIT',
    symlinkCode: 'SOURCE_FILE_SYMLINK',
    maxBytes,
    rejectEmpty: true
  });
}

export async function quarantineArtifact({ root, bytes, sha256 }) {
  const artifact = Buffer.from(bytes);
  const caseId = caseIdFromSha256(sha256);
  const actualSha256 = hashBytes(artifact);
  if (actualSha256 !== sha256) {
    throw new TrainingDataError('SOURCE_HASH_MISMATCH', caseId, {
      expected_sha256: sha256,
      actual_sha256: actualSha256
    });
  }

  const quarantineRoot = await safeQuarantineRoot(root);
  const target = path.join(quarantineRoot, caseId);
  if (await safeLstat(target)) {
    await verifyQuarantineArtifact({ target, caseId, bytes: artifact, sha256 });
    return Object.freeze({ case_id: caseId, directory: target, created: false });
  }

  const temporary = await fs.mkdtemp(
    path.join(quarantineRoot, `.${caseId}.tmp-`)
  );
  let removeTemporary = true;
  try {
    const identity = quarantineIdentity({ caseId, sha256, byteSize: artifact.length });
    await writeReadOnly(path.join(temporary, 'payload'), artifact);
    await writeReadOnly(path.join(temporary, 'identity.json'), canonicalFileJson(identity));
    await fs.chmod(temporary, QUARANTINE_DIRECTORY_MODE);
    try {
      await fs.rename(temporary, target);
      removeTemporary = false;
      return Object.freeze({ case_id: caseId, directory: target, created: true });
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error?.code)) throw error;
      await verifyQuarantineArtifact({ target, caseId, bytes: artifact, sha256 });
      return Object.freeze({ case_id: caseId, directory: target, created: false });
    }
  } catch (error) {
    if (error instanceof TrainingDataError) throw error;
    throw quarantineConflict(target, error);
  } finally {
    if (removeTemporary) {
      await fs.chmod(temporary, 0o700).catch(() => undefined);
      await fs.rm(temporary, { recursive: true, force: true });
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
    const existingText = await readRegularBytes(filePath, {
      nonRegularCode: 'IMMUTABLE_JSON_CONFLICT',
      symlinkCode: 'IMMUTABLE_JSON_CONFLICT'
    });
    const existingCanonical = canonicalJson(JSON.parse(existingText.toString('utf8')));
    if (existingCanonical !== desired) throw immutableJsonConflict(filePath);
    return 'verified';
  } catch (error) {
    if (error instanceof TrainingDataError && error.code === 'IMMUTABLE_JSON_CONFLICT') {
      throw error;
    }
    throw immutableJsonConflict(filePath, error);
  }
}

async function safeQuarantineRoot(root) {
  const workspaceRoot = path.resolve(String(root));
  const rootEntry = await safeLstat(workspaceRoot);
  const quarantineRoot = path.join(workspaceRoot, 'quarantine');
  const quarantineEntry = await safeLstat(quarantineRoot);
  if (
    !rootEntry?.isDirectory() || rootEntry.isSymbolicLink() ||
    !quarantineEntry?.isDirectory() || quarantineEntry.isSymbolicLink()
  ) {
    throw quarantineConflict(quarantineRoot);
  }
  return quarantineRoot;
}

async function verifyQuarantineArtifact({ target, caseId, bytes, sha256 }) {
  try {
    const directory = await fs.lstat(target);
    if (!directory.isDirectory() || directory.isSymbolicLink()) {
      throw quarantineConflict(target);
    }
    if ((directory.mode & 0o777) !== QUARANTINE_DIRECTORY_MODE) {
      throw quarantineConflict(target);
    }
    const entries = await fs.readdir(target, { withFileTypes: true });
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
    const identity = await readSecureQuarantineFile(identityPath, target);
    const payload = await readSecureQuarantineFile(payloadPath, target);
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

async function readSecureQuarantineFile(filePath, target) {
  const bytes = await readRegularBytes(filePath, {
    nonRegularCode: 'QUARANTINE_CONFLICT',
    symlinkCode: 'QUARANTINE_CONFLICT'
  });
  const metadata = await fs.lstat(filePath);
  if ((metadata.mode & 0o777) !== READ_ONLY_MODE) throw quarantineConflict(target);
  return bytes;
}

async function readRegularBytes(filePath, {
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
    return bytes;
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

async function writeReadOnly(filePath, bytes) {
  const handle = await fs.open(filePath, 'wx', READ_ONLY_MODE);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
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
