import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './canonical.js';
import { SHADOW_OUTPUT_FILES, SHADOW_SCHEMA_VERSION } from './constants.js';
import {
  sanitizeShadowError,
  shadowError,
  validateManifest
} from './contracts.js';

const ADMISSION_CODES = Object.freeze({
  outside: 'RUN_OUTSIDE_OUT_ROOT',
  symlink: 'SYMLINK_NOT_ALLOWED',
  missingBlueprint: 'BLUEPRINT_MISSING',
  invalidBlueprint: 'BLUEPRINT_INVALID'
});
const BODY_FILES = SHADOW_OUTPUT_FILES.filter((name) => name !== 'manifest.json');
const OUTPUT_BASENAME = 'playbook-shadow';
const STAGE_PREFIX = '.playbook-shadow.stage-';
const BACKUP_PREFIX = '.playbook-shadow.backup-';
const MOVE_BINARY = '/usr/bin/mv';
const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const WRITE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
const UNSAFE_PATH_CHARACTER = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const AUTHORITIES = new WeakMap();
let temporarySequence = 0;

export async function admitShadowRun({ projectRoot, runArg, fsImpl } = {}) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) throw shadowError('INVALID_ARGUMENT');
  if (typeof runArg !== 'string' || runArg.length === 0) throw shadowError('INVALID_ARGUMENT');

  const ops = fsOperations(fsImpl);
  let projectHandle;
  let outHandle;
  let runHandle;
  try {
    const projectAbsolute = path.resolve(projectRoot);
    const outAbsolute = path.resolve(projectAbsolute, 'out');
    const runAbsolute = path.resolve(projectAbsolute, runArg);
    const relativeToOut = path.relative(outAbsolute, runAbsolute);
    if (!isStrictRelativeDescendant(relativeToOut)) throw shadowError(ADMISSION_CODES.outside);

    projectHandle = await openAbsoluteDirectory(ops, projectAbsolute, 'INVALID_ARGUMENT');
    outHandle = await openDirectoryEntry(ops, projectHandle, 'out', 'INVALID_ARGUMENT');
    const runComponents = relativeToOut.split(path.sep);
    runHandle = await walkDirectories(ops, outHandle, runComponents, 'INVALID_ARGUMENT');
    const blueprintBytes = await readBlueprint(ops, runHandle);
    validateBlueprintBytes(blueprintBytes);

    const internal = {
      ops,
      projectAbsolute,
      runComponents,
      projectHandle,
      outHandle,
      runHandle,
      projectIdentity: identity(await projectHandle.stat()),
      outIdentity: identity(await outHandle.stat()),
      runIdentity: identity(await runHandle.stat()),
      blueprintBytes: Buffer.from(blueprintBytes),
      closed: false
    };
    const authority = {};
    Object.defineProperties(authority, {
      project_root: { enumerable: true, value: projectAbsolute },
      run_relative_path: {
        enumerable: true,
        value: path.relative(projectAbsolute, runAbsolute).split(path.sep).join('/')
      },
      blueprint_bytes: {
        enumerable: true,
        get() {
          return Buffer.from(internal.blueprintBytes);
        }
      },
      close: {
        enumerable: true,
        value: async () => closeAuthority(internal)
      }
    });
    AUTHORITIES.set(authority, internal);
    return Object.freeze(authority);
  } catch (error) {
    await closeHandles([runHandle, outHandle, projectHandle]);
    throw externalError(error, admissionFallback(error));
  }
}

export async function installShadowArtifacts({ authority, files, fsImpl } = {}) {
  const internal = authority && typeof authority === 'object' ? AUTHORITIES.get(authority) : undefined;
  if (!internal || internal.closed) throw shadowError('INVALID_ARGUMENT');

  let artifactFiles;
  try {
    artifactFiles = normalizeArtifactFiles(files);
    validateIncomingManifest(artifactFiles);
  } catch (error) {
    throw externalError(error, 'INVALID_ARGUMENT');
  }

  const ops = fsOperations(fsImpl ?? internal.ops.source);
  const artifactHashes = hashFiles(artifactFiles);
  let existing;
  let stage;
  let backupName;
  let oldMoved = false;
  let newInstalled = false;
  try {
    await assertAuthority(internal, ops);
    existing = await inspectOwnedDirectory(internal, ops, OUTPUT_BASENAME, { allowMissing: true });
    if (existing && sameArtifactBytes(existing.files, artifactFiles)) {
      return Object.freeze({ status: 'unchanged', artifact_hashes: Object.freeze(artifactHashes) });
    }

    stage = await createStage(internal, ops, artifactFiles);
    if (existing) {
      const current = await inspectOwnedDirectory(internal, ops, OUTPUT_BASENAME, { allowMissing: false });
      if (
        !sameIdentity(current.identity, existing.identity)
        || !sameArtifactBytes(current.files, existing.files)
      ) throw shadowError('SHADOW_INSTALL_FAILED');

      backupName = await unusedTemporaryBasename(internal, ops, BACKUP_PREFIX);
      await renameExpectedDirectoryNoReplace(
        internal, ops, OUTPUT_BASENAME, backupName, existing.identity
      );
      oldMoved = true;
      await verifyExpectedDirectory(
        internal, ops, backupName, existing.identity, existing.files, { requireComplete: true }
      );
    } else {
      const collision = await inspectOwnedDirectory(internal, ops, OUTPUT_BASENAME, { allowMissing: true });
      if (collision) throw shadowError('SHADOW_INSTALL_FAILED');
    }

    await renameExpectedDirectoryNoReplace(
      internal, ops, stage.basename, OUTPUT_BASENAME, stage.identity
    );
    newInstalled = true;
    await closeHandle(stage.handle);
    stage.handle = undefined;
    await verifyExpectedDirectory(
      internal, ops, OUTPUT_BASENAME, stage.identity, artifactFiles, { requireComplete: true }
    );

  } catch (error) {
    await closeHandle(stage?.handle);
    if (stage) {
      newInstalled ||= await namedDirectoryHasIdentity(internal, ops, OUTPUT_BASENAME, stage.identity);
    }
    if (backupName && existing) {
      oldMoved ||= await namedDirectoryHasIdentity(internal, ops, backupName, existing.identity);
    }

    let rollbackFailed = false;
    if (newInstalled && stage) {
      try {
        await removeVerifiedDirectory(
          internal, ops, OUTPUT_BASENAME, stage.identity, artifactFiles,
          { requireComplete: true, verifyBytes: true }
        );
        newInstalled = false;
      } catch {
        rollbackFailed = true;
      }
    } else if (stage) {
      try {
        await removeVerifiedDirectory(
          internal, ops, stage.basename, stage.identity, artifactFiles,
          { allowMissing: true, requireComplete: false, verifyBytes: false }
        );
      } catch {
        rollbackFailed = true;
      }
    }

    if (oldMoved && backupName && existing) {
      try {
        await rollbackBackup(internal, ops, backupName, existing);
        oldMoved = false;
      } catch {
        rollbackFailed = true;
      }
    }
    if (rollbackFailed) throw shadowError('SHADOW_INSTALL_FAILED');
    throw externalError(error, 'SHADOW_INSTALL_FAILED');
  }

  if (backupName) {
    try {
      await removeVerifiedDirectory(
        internal, ops, backupName, existing.identity, existing.files,
        { requireComplete: true, verifyBytes: true }
      );
      oldMoved = false;
    } catch (error) {
      try {
        await recoverVerifiedBackup(
          internal, ops, backupName, existing.identity, existing.files
        );
        await removeVerifiedDirectory(
          internal, ops, OUTPUT_BASENAME, stage.identity, artifactFiles,
          { requireComplete: true, verifyBytes: true }
        );
        newInstalled = false;
        await rollbackBackup(internal, ops, backupName, existing);
        oldMoved = false;
      } catch {
        // An actual rollback failure preserves the reconstructed backup when possible.
        throw shadowError('SHADOW_INSTALL_FAILED');
      }
      throw externalError(error, 'SHADOW_INSTALL_FAILED');
    }
  }
  return Object.freeze({
    status: existing ? 'replaced' : 'created',
    artifact_hashes: Object.freeze(artifactHashes)
  });
}

async function openAbsoluteDirectory(ops, absolutePath, missingCode) {
  const parsed = path.parse(absolutePath);
  let current;
  try {
    current = await ops.open(parsed.root, DIRECTORY_FLAGS);
    const components = absolutePath.slice(parsed.root.length).split(path.sep).filter(Boolean);
    for (const component of components) {
      const next = await openDirectoryEntry(ops, current, component, missingCode);
      await closeHandle(current);
      current = next;
    }
    return current;
  } catch (error) {
    await closeHandle(current);
    throw externalError(error, missingCode);
  }
}

async function walkDirectories(ops, retainedStart, components, missingCode) {
  let current = retainedStart;
  try {
    for (const component of components) {
      if (!isPlainBasename(component)) throw shadowError(missingCode);
      const next = await openDirectoryEntry(ops, current, component, missingCode);
      if (current !== retainedStart) await closeHandle(current);
      current = next;
    }
    return current;
  } catch (error) {
    if (current !== retainedStart) await closeHandle(current);
    throw error;
  }
}

async function openDirectoryEntry(ops, parentHandle, basename, missingCode) {
  const target = descriptorEntryPath(parentHandle, basename);
  let before;
  try {
    before = await ops.lstat(target);
    if (before.isSymbolicLink()) throw shadowError(ADMISSION_CODES.symlink);
    if (!before.isDirectory()) throw shadowError(missingCode);
    const handle = await ops.open(target, DIRECTORY_FLAGS);
    const after = await handle.stat();
    if (!after.isDirectory() || !sameIdentity(identity(before), identity(after))) {
      await closeHandle(handle);
      throw shadowError(ADMISSION_CODES.symlink);
    }
    return handle;
  } catch (error) {
    if (isSymlinkError(error)) throw shadowError(ADMISSION_CODES.symlink);
    if (error?.code === 'ENOTDIR') {
      try {
        const current = await ops.lstat(target);
        if (current.isSymbolicLink()) throw shadowError(ADMISSION_CODES.symlink);
      } catch (recheckError) {
        if (sanitizeShadowError(recheckError).code === ADMISSION_CODES.symlink) {
          throw shadowError(ADMISSION_CODES.symlink);
        }
      }
    }
    throw externalError(error, missingCode);
  }
}

async function readBlueprint(ops, runHandle) {
  const target = descriptorEntryPath(runHandle, 'blueprint.json');
  let handle;
  try {
    const before = await ops.lstat(target);
    if (before.isSymbolicLink()) throw shadowError(ADMISSION_CODES.symlink);
    if (!before.isFile()) throw shadowError(ADMISSION_CODES.missingBlueprint);
    handle = await ops.open(target, READ_FLAGS);
    const opened = await handle.stat();
    if (!opened.isFile() || !sameIdentity(identity(before), identity(opened))) {
      throw shadowError(ADMISSION_CODES.missingBlueprint);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    const pathAfter = await ops.lstat(target);
    if (pathAfter.isSymbolicLink()) throw shadowError(ADMISSION_CODES.symlink);
    if (
      !after.isFile()
      || !pathAfter.isFile()
      || !sameIdentity(identity(opened), identity(after))
      || !sameIdentity(identity(after), identity(pathAfter))
      || Number(after.size) !== bytes.length
    ) throw shadowError(ADMISSION_CODES.missingBlueprint);
    return Buffer.from(bytes);
  } catch (error) {
    if (isSymlinkError(error)) throw shadowError(ADMISSION_CODES.symlink);
    throw externalError(error, ADMISSION_CODES.missingBlueprint);
  } finally {
    await closeHandle(handle);
  }
}

function validateBlueprintBytes(bytes) {
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const blueprint = JSON.parse(decoded);
    if (!isPlainObject(blueprint) || blueprint.workflow !== 'construction_method_v1') {
      throw shadowError(ADMISSION_CODES.invalidBlueprint);
    }
  } catch (error) {
    throw externalError(error, ADMISSION_CODES.invalidBlueprint);
  }
}

async function assertAuthority(internal, ops) {
  if (internal.closed) throw shadowError('INVALID_ARGUMENT');
  try {
    for (const [handle, expected] of [
      [internal.projectHandle, internal.projectIdentity],
      [internal.outHandle, internal.outIdentity],
      [internal.runHandle, internal.runIdentity]
    ]) {
      const stat = await handle.stat();
      if (!stat.isDirectory() || !sameIdentity(identity(stat), expected)) {
        throw shadowError('SHADOW_INSTALL_FAILED');
      }
    }

    const outPathStat = await ops.lstat(descriptorEntryPath(internal.projectHandle, 'out'));
    if (outPathStat.isSymbolicLink()) throw shadowError('SYMLINK_NOT_ALLOWED');
    if (!outPathStat.isDirectory() || !sameIdentity(identity(outPathStat), internal.outIdentity)) {
      throw shadowError('SHADOW_INSTALL_FAILED');
    }
    const currentRun = await walkDirectories(ops, internal.outHandle, internal.runComponents, 'SHADOW_INSTALL_FAILED');
    try {
      const stat = await currentRun.stat();
      if (!sameIdentity(identity(stat), internal.runIdentity)) throw shadowError('SHADOW_INSTALL_FAILED');
    } finally {
      await closeHandle(currentRun);
    }
  } catch (error) {
    throw externalError(error, 'SHADOW_INSTALL_FAILED');
  }
}

function normalizeArtifactFiles(files) {
  if (!isPlainObject(files)) throw shadowError('INVALID_ARGUMENT');
  const keys = Reflect.ownKeys(files);
  if (!keys.every((key) => typeof key === 'string') || !sameStrings([...keys].sort(), [...SHADOW_OUTPUT_FILES].sort())) {
    throw shadowError('INVALID_ARGUMENT');
  }
  const normalized = {};
  for (const name of SHADOW_OUTPUT_FILES) {
    const descriptor = Object.getOwnPropertyDescriptor(files, name);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw shadowError('INVALID_ARGUMENT');
    const value = descriptor.value;
    if (Buffer.isBuffer(value)) normalized[name] = Buffer.from(value);
    else if (typeof value === 'string') normalized[name] = Buffer.from(value, 'utf8');
    else throw shadowError('INVALID_ARGUMENT');
  }
  return Object.freeze(normalized);
}

function validateIncomingManifest(files) {
  let manifest;
  try {
    manifest = parseManifest(files['manifest.json']);
    validateManifest(manifest);
    assertManifestOwnershipShape(manifest);
  } catch {
    throw shadowError('INVALID_ARGUMENT');
  }
  for (const name of BODY_FILES) {
    if (manifest.artifact_hashes[name] !== sha256(files[name])) throw shadowError('INVALID_ARGUMENT');
  }
}

async function inspectOwnedDirectory(internal, ops, basename, { allowMissing }) {
  await assertAuthority(internal, ops);
  let directoryHandle;
  try {
    const directoryPath = runEntryPath(internal, basename);
    let before;
    try {
      before = await ops.lstat(directoryPath);
    } catch (error) {
      if (allowMissing && isMissingError(error)) return null;
      throw error;
    }
    if (before.isSymbolicLink()) throw shadowError('SYMLINK_NOT_ALLOWED');
    if (!before.isDirectory()) throw shadowError('SHADOW_OUTPUT_OWNERSHIP');
    directoryHandle = await ops.open(directoryPath, DIRECTORY_FLAGS);
    const opened = await directoryHandle.stat();
    if (!opened.isDirectory() || !sameIdentity(identity(before), identity(opened))) {
      throw shadowError('SHADOW_OUTPUT_OWNERSHIP');
    }
    const entries = await ops.readdir(descriptorPath(directoryHandle));
    if (!sameStrings([...entries].sort(), [...SHADOW_OUTPUT_FILES].sort())) {
      throw shadowError('SHADOW_OUTPUT_OWNERSHIP');
    }
    const files = {};
    for (const name of SHADOW_OUTPUT_FILES) {
      files[name] = await readRegularFile(ops, directoryHandle, name, 'SHADOW_OUTPUT_OWNERSHIP');
    }
    const manifest = parseManifest(files['manifest.json']);
    validateManifest(manifest);
    assertManifestOwnershipShape(manifest);
    for (const name of BODY_FILES) {
      if (manifest.artifact_hashes[name] !== sha256(files[name])) {
        throw shadowError('SHADOW_OUTPUT_OWNERSHIP');
      }
    }
    await assertNamedDirectoryIdentity(internal, ops, basename, identity(opened));
    return { identity: identity(opened), files: Object.freeze(files) };
  } catch (error) {
    if (isSymlinkError(error)) throw shadowError('SYMLINK_NOT_ALLOWED');
    throw externalError(error, 'SHADOW_OUTPUT_OWNERSHIP');
  } finally {
    await closeHandle(directoryHandle);
  }
}

function assertManifestOwnershipShape(manifest) {
  if (
    manifest.schema_version !== SHADOW_SCHEMA_VERSION
    || !sameStrings([...manifest.managed_paths].sort(), [...SHADOW_OUTPUT_FILES].sort())
    || !sameStrings(Object.keys(manifest.artifact_hashes).sort(), [...BODY_FILES].sort())
    || !manifest.managed_paths.every(isPlainBasename)
  ) throw shadowError('SHADOW_OUTPUT_OWNERSHIP');
}

async function createStage(internal, ops, files) {
  let basename;
  for (let attempt = 0; attempt < 64; attempt += 1) {
    basename = nextTemporaryBasename(STAGE_PREFIX);
    try {
      await assertAuthority(internal, ops);
      await ops.mkdir(runEntryPath(internal, basename), { recursive: false, mode: 0o700 });
      break;
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        basename = undefined;
        continue;
      }
      throw error;
    }
  }
  if (!basename) throw shadowError('SHADOW_INSTALL_FAILED');

  let handle;
  try {
    const directoryPath = runEntryPath(internal, basename);
    const pathStat = await ops.lstat(directoryPath);
    if (pathStat.isSymbolicLink() || !pathStat.isDirectory()) throw shadowError('SHADOW_INSTALL_FAILED');
    handle = await ops.open(directoryPath, DIRECTORY_FLAGS);
    await assertAuthority(internal, ops);
    await handle.chmod(0o700);
    const opened = await handle.stat();
    if (!sameIdentity(identity(pathStat), identity(opened))) throw shadowError('SHADOW_INSTALL_FAILED');
    const stage = { basename, handle, identity: identity(opened) };

    for (const name of SHADOW_OUTPUT_FILES) {
      await assertAuthority(internal, ops);
      let fileHandle;
      try {
        fileHandle = await ops.open(descriptorEntryPath(handle, name), WRITE_FLAGS, 0o600);
        await assertAuthority(internal, ops);
        await fileHandle.writeFile(files[name]);
        await assertAuthority(internal, ops);
        await fileHandle.sync();
      } finally {
        await closeHandle(fileHandle);
      }
      const verified = await readRegularFile(ops, handle, name, 'SHADOW_INSTALL_FAILED');
      if (sha256(verified) !== sha256(files[name])) throw shadowError('SHADOW_INSTALL_FAILED');
    }
    await verifyDirectoryHandleContents(ops, handle, files, true, true);
    return stage;
  } catch (error) {
    const stageIdentity = handle ? identity(await handle.stat().catch(() => ({ dev: -1, ino: -1 }))) : undefined;
    await closeHandle(handle);
    if (stageIdentity) {
      try {
        await removeVerifiedDirectory(
          internal, ops, basename, stageIdentity, files,
          { allowMissing: true, requireComplete: false, verifyBytes: false }
        );
      } catch {
        // The caller receives one stable install failure; unverified paths are never removed.
      }
    }
    throw externalError(error, 'SHADOW_INSTALL_FAILED');
  }
}

async function verifyExpectedDirectory(
  internal,
  ops,
  basename,
  expectedIdentity,
  expectedFiles,
  { requireComplete }
) {
  await assertAuthority(internal, ops);
  let handle;
  try {
    await assertNamedDirectoryIdentity(internal, ops, basename, expectedIdentity);
    handle = await ops.open(runEntryPath(internal, basename), DIRECTORY_FLAGS);
    const opened = await handle.stat();
    if (!sameIdentity(identity(opened), expectedIdentity)) throw shadowError('SHADOW_INSTALL_FAILED');
    await verifyDirectoryHandleContents(ops, handle, expectedFiles, requireComplete, true);
    await assertNamedDirectoryIdentity(internal, ops, basename, expectedIdentity);
  } catch (error) {
    if (isSymlinkError(error)) throw shadowError('SYMLINK_NOT_ALLOWED');
    throw externalError(error, 'SHADOW_INSTALL_FAILED');
  } finally {
    await closeHandle(handle);
  }
}

async function verifyDirectoryHandleContents(ops, handle, expectedFiles, requireComplete, verifyBytes) {
  const entries = await ops.readdir(descriptorPath(handle));
  if (
    entries.some((name) => !SHADOW_OUTPUT_FILES.includes(name))
    || (requireComplete && !sameStrings([...entries].sort(), [...SHADOW_OUTPUT_FILES].sort()))
  ) throw shadowError('SHADOW_INSTALL_FAILED');
  for (const name of entries) {
    const bytes = await readRegularFile(ops, handle, name, 'SHADOW_INSTALL_FAILED');
    if (verifyBytes && !bytes.equals(expectedFiles[name])) throw shadowError('SHADOW_INSTALL_FAILED');
  }
}

async function removeVerifiedDirectory(
  internal,
  ops,
  basename,
  expectedIdentity,
  expectedFiles,
  { allowMissing = false, requireComplete, verifyBytes }
) {
  await assertAuthority(internal, ops);
  let handle;
  try {
    const target = runEntryPath(internal, basename);
    try {
      const stat = await ops.lstat(target);
      if (stat.isSymbolicLink()) throw shadowError('SYMLINK_NOT_ALLOWED');
      if (!stat.isDirectory() || !sameIdentity(identity(stat), expectedIdentity)) {
        throw shadowError('SHADOW_INSTALL_FAILED');
      }
    } catch (error) {
      if (allowMissing && isMissingError(error)) return;
      throw error;
    }
    handle = await ops.open(target, DIRECTORY_FLAGS);
    const opened = await handle.stat();
    if (!sameIdentity(identity(opened), expectedIdentity)) throw shadowError('SHADOW_INSTALL_FAILED');
    await verifyDirectoryHandleContents(ops, handle, expectedFiles, requireComplete, verifyBytes);
    const entries = await ops.readdir(descriptorPath(handle));
    for (const name of entries) {
      await assertAuthority(internal, ops);
      await assertNamedDirectoryIdentity(internal, ops, basename, expectedIdentity);
      const bytes = await readRegularFile(ops, handle, name, 'SHADOW_INSTALL_FAILED');
      if (verifyBytes && !bytes.equals(expectedFiles[name])) throw shadowError('SHADOW_INSTALL_FAILED');
      await assertAuthority(internal, ops);
      await ops.unlink(descriptorEntryPath(handle, name));
    }
    if ((await ops.readdir(descriptorPath(handle))).length !== 0) throw shadowError('SHADOW_INSTALL_FAILED');
    await closeHandle(handle);
    handle = undefined;
    await assertAuthority(internal, ops);
    await assertNamedDirectoryIdentity(internal, ops, basename, expectedIdentity);
    await assertAuthority(internal, ops);
    await ops.rmdir(target);
  } catch (error) {
    if (allowMissing && isMissingError(error)) return;
    throw externalError(error, 'SHADOW_INSTALL_FAILED');
  } finally {
    await closeHandle(handle);
  }
}

async function rollbackBackup(internal, ops, backupName, existing) {
  await verifyExpectedDirectory(
    internal, ops, backupName, existing.identity, existing.files, { requireComplete: true }
  );
  await renameExpectedDirectoryNoReplace(
    internal, ops, backupName, OUTPUT_BASENAME, existing.identity
  );
  await verifyExpectedDirectory(
    internal, ops, OUTPUT_BASENAME, existing.identity, existing.files, { requireComplete: true }
  );
}

async function recoverVerifiedBackup(
  internal,
  ops,
  backupName,
  expectedIdentity,
  expectedFiles
) {
  await assertAuthority(internal, ops);
  const backupPath = runEntryPath(internal, backupName);
  let handle;
  try {
    let pathStat;
    let created = false;
    try {
      pathStat = await ops.lstat(backupPath);
    } catch (error) {
      if (!isMissingError(error)) throw error;
      await assertAuthority(internal, ops);
      await ops.mkdir(backupPath, { recursive: false, mode: 0o700 });
      pathStat = await ops.lstat(backupPath);
      created = true;
    }
    if (pathStat.isSymbolicLink() || !pathStat.isDirectory()) {
      throw shadowError('SHADOW_INSTALL_FAILED');
    }
    handle = await ops.open(backupPath, DIRECTORY_FLAGS);
    const opened = await handle.stat();
    const backupIdentity = identity(opened);
    if (
      !sameIdentity(identity(pathStat), backupIdentity)
      || (!created && !sameIdentity(backupIdentity, expectedIdentity))
    ) {
      throw shadowError('SHADOW_INSTALL_FAILED');
    }
    const entries = await ops.readdir(descriptorPath(handle));
    if (entries.some((name) => !SHADOW_OUTPUT_FILES.includes(name))) {
      throw shadowError('SHADOW_INSTALL_FAILED');
    }
    for (const name of entries) {
      const bytes = await readRegularFile(ops, handle, name, 'SHADOW_INSTALL_FAILED');
      if (!bytes.equals(expectedFiles[name])) throw shadowError('SHADOW_INSTALL_FAILED');
    }
    for (const name of SHADOW_OUTPUT_FILES.filter((candidate) => !entries.includes(candidate))) {
      await assertAuthority(internal, ops);
      await assertNamedDirectoryIdentity(internal, ops, backupName, backupIdentity);
      let fileHandle;
      try {
        fileHandle = await ops.open(descriptorEntryPath(handle, name), WRITE_FLAGS, 0o600);
        await assertAuthority(internal, ops);
        await fileHandle.writeFile(expectedFiles[name]);
        await assertAuthority(internal, ops);
        await fileHandle.sync();
      } finally {
        await closeHandle(fileHandle);
      }
    }
    await verifyDirectoryHandleContents(ops, handle, expectedFiles, true, true);
    await assertNamedDirectoryIdentity(internal, ops, backupName, backupIdentity);
  } catch (error) {
    throw externalError(error, 'SHADOW_INSTALL_FAILED');
  } finally {
    await closeHandle(handle);
  }
}

async function renameExpectedDirectoryNoReplace(
  internal,
  ops,
  sourceName,
  destinationName,
  expectedIdentity
) {
  await assertAuthority(internal, ops);
  await assertNamedDirectoryIdentity(internal, ops, sourceName, expectedIdentity);
  try {
    await assertAuthority(internal, ops);
    await ops.renameNoReplace(internal.runHandle, sourceName, destinationName);
  } catch (error) {
    throw externalError(error, 'SHADOW_INSTALL_FAILED');
  }

  let destinationStat;
  let sourceExists = false;
  try {
    destinationStat = await ops.lstat(runEntryPath(internal, destinationName));
    sourceExists = await entryExists(ops, runEntryPath(internal, sourceName));
  } catch (error) {
    throw externalError(error, 'SHADOW_INSTALL_FAILED');
  }
  if (
    destinationStat.isDirectory()
    && !destinationStat.isSymbolicLink()
    && sameIdentity(identity(destinationStat), expectedIdentity)
    && !sourceExists
  ) return;

  if (!sourceExists) {
    await restoreUnexpectedRename(
      internal, ops, destinationName, sourceName, identity(destinationStat)
    );
  }
  throw shadowError('SHADOW_INSTALL_FAILED');
}

async function restoreUnexpectedRename(
  internal,
  ops,
  sourceName,
  destinationName,
  movedIdentity
) {
  await assertAuthority(internal, ops);
  const before = await ops.lstat(runEntryPath(internal, sourceName));
  if (!sameIdentity(identity(before), movedIdentity)) throw shadowError('SHADOW_INSTALL_FAILED');
  await assertAuthority(internal, ops);
  await ops.renameNoReplace(internal.runHandle, sourceName, destinationName);
  const restored = await ops.lstat(runEntryPath(internal, destinationName));
  if (
    !sameIdentity(identity(restored), movedIdentity)
    || await entryExists(ops, runEntryPath(internal, sourceName))
  ) throw shadowError('SHADOW_INSTALL_FAILED');
}

async function readRegularFile(ops, directoryHandle, basename, fallbackCode) {
  const target = descriptorEntryPath(directoryHandle, basename);
  let handle;
  try {
    const before = await ops.lstat(target);
    if (before.isSymbolicLink()) throw shadowError('SYMLINK_NOT_ALLOWED');
    if (!before.isFile()) throw shadowError(fallbackCode);
    handle = await ops.open(target, READ_FLAGS);
    const opened = await handle.stat();
    if (!opened.isFile() || !sameIdentity(identity(before), identity(opened))) {
      throw shadowError(fallbackCode);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    const pathAfter = await ops.lstat(target);
    if (pathAfter.isSymbolicLink()) throw shadowError('SYMLINK_NOT_ALLOWED');
    if (
      !after.isFile()
      || !pathAfter.isFile()
      || !sameIdentity(identity(opened), identity(after))
      || !sameIdentity(identity(after), identity(pathAfter))
      || Number(after.size) !== bytes.length
    ) throw shadowError(fallbackCode);
    return Buffer.from(bytes);
  } catch (error) {
    if (isSymlinkError(error)) throw shadowError('SYMLINK_NOT_ALLOWED');
    throw externalError(error, fallbackCode);
  } finally {
    await closeHandle(handle);
  }
}

async function assertNamedDirectoryIdentity(internal, ops, basename, expectedIdentity) {
  try {
    const stat = await ops.lstat(runEntryPath(internal, basename));
    if (stat.isSymbolicLink()) throw shadowError('SYMLINK_NOT_ALLOWED');
    if (!stat.isDirectory() || !sameIdentity(identity(stat), expectedIdentity)) {
      throw shadowError('SHADOW_INSTALL_FAILED');
    }
  } catch (error) {
    if (isSymlinkError(error)) throw shadowError('SYMLINK_NOT_ALLOWED');
    throw error;
  }
}

async function namedDirectoryHasIdentity(internal, ops, basename, expectedIdentity) {
  try {
    const stat = await ops.lstat(runEntryPath(internal, basename));
    return stat.isDirectory() && !stat.isSymbolicLink() && sameIdentity(identity(stat), expectedIdentity);
  } catch {
    return false;
  }
}

async function unusedTemporaryBasename(internal, ops, prefix) {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const basename = nextTemporaryBasename(prefix);
    if (!await entryExists(ops, runEntryPath(internal, basename))) return basename;
  }
  throw shadowError('SHADOW_INSTALL_FAILED');
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

function parseManifest(bytes) {
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const manifest = JSON.parse(decoded);
  if (!isPlainObject(manifest)) throw shadowError('SHADOW_OUTPUT_OWNERSHIP');
  return manifest;
}

function hashFiles(files) {
  return Object.fromEntries(SHADOW_OUTPUT_FILES.map((name) => [name, sha256(files[name])]));
}

function sameArtifactBytes(left, right) {
  return SHADOW_OUTPUT_FILES.every((name) => left[name].equals(right[name]));
}

function isStrictRelativeDescendant(relativePath) {
  return relativePath.length > 0
    && relativePath !== '..'
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath);
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

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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
  return path.join(descriptorPath(handle), basename);
}

function runEntryPath(internal, basename) {
  return descriptorEntryPath(internal.runHandle, basename);
}

function fsOperations(source) {
  const provided = source?.source ?? source;
  const operation = (name) => {
    const owner = provided && typeof provided[name] === 'function' ? provided : fs;
    return owner[name].bind(owner);
  };
  const defaultRenameNoReplace = renameNoReplaceByDescriptor;
  const customRenameNoReplace = provided && typeof provided.renameNoReplace === 'function'
    ? provided.renameNoReplace.bind(provided)
    : null;
  return Object.freeze({
    source: provided,
    open: operation('open'),
    lstat: operation('lstat'),
    mkdir: operation('mkdir'),
    readdir: operation('readdir'),
    renameNoReplace: customRenameNoReplace
      ? (directoryHandle, sourceName, destinationName) => customRenameNoReplace(
        directoryHandle, sourceName, destinationName, defaultRenameNoReplace
      )
      : defaultRenameNoReplace,
    unlink: operation('unlink'),
    rmdir: operation('rmdir')
  });
}

async function renameNoReplaceByDescriptor(directoryHandle, sourceName, destinationName) {
  if (!isPlainBasename(sourceName) || !isPlainBasename(destinationName)) {
    throw shadowError('SHADOW_INSTALL_FAILED');
  }
  await new Promise((resolve, reject) => {
    const child = spawn(MOVE_BINARY, [
      '--no-clobber',
      '--no-target-directory',
      `/proc/self/fd/3/${sourceName}`,
      `/proc/self/fd/3/${destinationName}`
    ], {
      stdio: ['ignore', 'ignore', 'ignore', directoryHandle.fd]
    });
    child.once('error', () => reject(shadowError('SHADOW_INSTALL_FAILED')));
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(shadowError('SHADOW_INSTALL_FAILED'));
    });
  });
}

function admissionFallback(error) {
  const code = sanitizeShadowError(error, 'INVALID_ARGUMENT').code;
  return [
    'RUN_OUTSIDE_OUT_ROOT', 'SYMLINK_NOT_ALLOWED', 'BLUEPRINT_MISSING', 'BLUEPRINT_INVALID'
  ].includes(code) ? code : 'INVALID_ARGUMENT';
}

function externalError(error, fallbackCode) {
  const sanitized = sanitizeShadowError(error, fallbackCode);
  return shadowError(sanitized.code);
}

function isMissingError(error) {
  return error?.code === 'ENOENT' || error?.code === 'ENOTDIR';
}

function isAlreadyExistsError(error) {
  return error?.code === 'EEXIST';
}

function isSymlinkError(error) {
  return error?.code === 'ELOOP' || sanitizeShadowError(error).code === 'SYMLINK_NOT_ALLOWED';
}

async function closeAuthority(internal) {
  if (internal.closed) return;
  internal.closed = true;
  await closeHandles([internal.runHandle, internal.outHandle, internal.projectHandle]);
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
    // Closing is idempotent at this API boundary.
  }
}
