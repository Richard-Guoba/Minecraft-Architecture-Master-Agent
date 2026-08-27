import { constants } from 'node:fs';
import { executeError, sanitizeExecuteError } from './contracts.js';
import { normalizeSelectionFiles, SELECTION_PATHS } from './storageValidation.js';

const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const WRITE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
const STAGE_PREFIX = '.playbook-execute.stage-';
const BACKUP_PREFIX = '.playbook-execute.backup-';
let transactionSequence = 0;

export async function installSelectionGeneration({
  ops,
  tree,
  files,
  existing,
  assertForwardAuthority,
  assertRollbackAuthority
}) {
  let stage;
  let backup;
  let committed = false;
  try {
    stage = await createFlatGenerationDirectory(ops, tree, STAGE_PREFIX, files, assertForwardAuthority);
    if (existing) {
      backup = await createFlatGenerationDirectory(ops, tree, BACKUP_PREFIX, null, assertForwardAuthority);
      for (const name of SELECTION_PATHS) {
        await moveExpectedRegularFileNoReplace({
          ops,
          tree,
          sourceHandle: tree.rootHandle,
          sourceName: name,
          destinationHandle: backup.handle,
          destinationName: name,
          expectedIdentity: existing.identities[name],
          expectedBytes: existing.files[name],
          assertAuthority: assertForwardAuthority
        });
      }
      await backup.handle.sync();
    }

    for (const name of ['selection.json', 'selection-report.md', 'manifest.json']) {
      await moveExpectedRegularFileNoReplace({
        ops,
        tree,
        sourceHandle: stage.handle,
        sourceName: name,
        destinationHandle: tree.rootHandle,
        destinationName: name,
        expectedIdentity: stage.identities[name],
        expectedBytes: files[name],
        assertAuthority: assertForwardAuthority
      });
    }
    await verifySelectionGeneration(ops, tree, files, stage.identities, assertForwardAuthority);
    await tree.rootHandle.sync();
    await verifySelectionGeneration(ops, tree, files, stage.identities, assertForwardAuthority);
    committed = true;
  } catch (error) {
    let rollbackFailed = false;
    if (!committed && stage) {
      for (const name of [...SELECTION_PATHS].reverse()) {
        try {
          if (await regularEntryHasIdentity(ops, tree.rootHandle, name, stage.identities[name])) {
            if (await entryExists(ops, descriptorEntryPath(stage.handle, name))) throw executeError('P5_INSTALL_FAILED');
            await moveExpectedRegularFileNoReplace({
              ops,
              tree,
              sourceHandle: tree.rootHandle,
              sourceName: name,
              destinationHandle: stage.handle,
              destinationName: name,
              expectedIdentity: stage.identities[name],
              expectedBytes: files[name],
              assertAuthority: assertRollbackAuthority
            });
          }
        } catch {
          rollbackFailed = true;
        }
      }
    }
    if (!committed && existing && backup) {
      for (const name of [...SELECTION_PATHS].reverse()) {
        try {
          if (await regularEntryHasIdentity(ops, tree.rootHandle, name, existing.identities[name])) continue;
          if (!await regularEntryHasIdentity(ops, backup.handle, name, existing.identities[name])) {
            rollbackFailed = true;
            continue;
          }
          if (await entryExists(ops, descriptorEntryPath(tree.rootHandle, name))) {
            const unexpected = await entryDescription(ops, tree.rootHandle, name);
            if (!stage || await entryExists(ops, descriptorEntryPath(stage.handle, name))) {
              rollbackFailed = true;
              continue;
            }
            await moveIdentityNoReplace({
              ops,
              sourceHandle: tree.rootHandle,
              sourceName: name,
              destinationHandle: stage.handle,
              destinationName: name,
              expectedIdentity: unexpected.identity,
              expectedKind: unexpected.kind,
              moveForward: () => ops.renameNoReplaceBetween(
                tree.rootHandle,
                name,
                stage.handle,
                name
              ),
              moveReverse: () => ops.renameNoReplaceBetween(
                stage.handle,
                name,
                tree.rootHandle,
                name
              ),
              beforeMove: assertRollbackAuthority
            });
          }
          await moveExpectedRegularFileNoReplace({
            ops,
            tree,
            sourceHandle: backup.handle,
            sourceName: name,
            destinationHandle: tree.rootHandle,
            destinationName: name,
            expectedIdentity: existing.identities[name],
            expectedBytes: existing.files[name],
            assertAuthority: assertRollbackAuthority
          });
        } catch {
          rollbackFailed = true;
        }
      }
    }
    try {
      await assertRollbackAuthority();
      await tree.rootHandle.sync();
    } catch {
      rollbackFailed = true;
    }
    try {
      if (stage) await removeVerifiedFlatDirectory(
        ops,
        tree,
        stage,
        files,
        stage.identities,
        false,
        assertRollbackAuthority
      );
    } catch {
      // Preserve a stage containing any unknown or swapped entry.
    }
    try {
      if (backup) await removeVerifiedFlatDirectory(
        ops,
        tree,
        backup,
        existing.files,
        existing.identities,
        false,
        assertRollbackAuthority
      );
    } catch {
      // Preserve a backup containing any old inode that could not be restored.
    }
    await closeHandles([stage?.handle, backup?.handle]);
    if (stage) stage.handle = undefined;
    if (backup) backup.handle = undefined;
    if (rollbackFailed) throw executeError('P5_INSTALL_FAILED');
    throw publicError(error, 'P5_INSTALL_FAILED');
  }

  try {
    await removeVerifiedFlatDirectory(
      ops,
      tree,
      stage,
      files,
      stage.identities,
      false,
      assertRollbackAuthority
    );
  } catch {
    // Empty stage retirement is postcommit and best-effort.
  }
  if (backup) {
    try {
      await removeVerifiedFlatDirectory(
        ops,
        tree,
        backup,
        existing.files,
        existing.identities,
        true,
        assertRollbackAuthority
      );
    } catch {
      // The new manifest generation remains authoritative; old residue is fixed-prefix.
    }
  }
  await closeHandles([stage?.handle, backup?.handle]);
}

export async function moveIdentityNoReplace({
  ops,
  sourceHandle,
  sourceName,
  destinationHandle,
  destinationName,
  expectedIdentity,
  expectedKind,
  moveForward,
  moveReverse,
  beforeMove = async () => {},
  afterMove = async () => {}
}) {
  await beforeMove();
  const before = await entryDescription(ops, sourceHandle, sourceName);
  if (!before || before.kind !== expectedKind || !sameIdentity(before.identity, expectedIdentity)) {
    throw executeError('P5_INSTALL_FAILED');
  }
  let moveError;
  try {
    await moveForward();
  } catch (error) {
    moveError = error;
  }
  const source = await entryDescription(ops, sourceHandle, sourceName);
  const destination = await entryDescription(ops, destinationHandle, destinationName);
  if (
    source === null
    && destination?.kind === expectedKind
    && sameIdentity(destination.identity, expectedIdentity)
  ) {
    await afterMove();
    if (moveError) throw publicError(moveError, 'P5_INSTALL_FAILED');
    return;
  }
  if (source === null && destination) {
    try {
      await moveReverse();
      const restored = await entryDescription(ops, sourceHandle, sourceName);
      const destinationAfter = await entryDescription(ops, destinationHandle, destinationName);
      if (
        destinationAfter !== null
        || !restored
        || restored.kind !== destination.kind
        || !sameIdentity(restored.identity, destination.identity)
      ) throw executeError('P5_INSTALL_FAILED');
    } catch {
      // Preserve an unexpected entry wherever the failed primitive left it.
    }
  }
  throw executeError('P5_INSTALL_FAILED');
}

async function createFlatGenerationDirectory(ops, tree, prefix, files, assertAuthority) {
  const basename = await unusedTemporaryBasename(ops, tree.rootHandle, prefix, assertAuthority);
  await assertAuthority();
  await ops.mkdir(descriptorEntryPath(tree.rootHandle, basename), { recursive: false, mode: 0o700 });
  const handle = await openDirectoryEntry(ops, tree.rootHandle, basename);
  const directoryIdentity = identity(await handle.stat());
  const identities = {};
  try {
    if (files) {
      for (const name of SELECTION_PATHS) {
        let fileHandle;
        try {
          fileHandle = await ops.open(descriptorEntryPath(handle, name), WRITE_FLAGS, 0o600);
          await fileHandle.writeFile(files[name]);
          await fileHandle.sync();
          await fileHandle.chmod(0o400);
          await fileHandle.sync();
          const stat = await fileHandle.stat();
          identities[name] = identity(stat);
          if (!stat.isFile() || Number(stat.size) !== files[name].length) throw executeError('P5_INSTALL_FAILED');
        } finally {
          await closeHandle(fileHandle);
        }
      }
      await handle.sync();
      await assertFlatGeneration(ops, tree.rootHandle, basename, directoryIdentity, files, identities);
    }
    return { basename, handle, identity: directoryIdentity, identities: Object.freeze(identities) };
  } catch (error) {
    await closeHandle(handle);
    throw publicError(error, 'P5_INSTALL_FAILED');
  }
}

async function moveExpectedRegularFileNoReplace({
  ops,
  tree,
  sourceHandle,
  sourceName,
  destinationHandle,
  destinationName,
  expectedIdentity,
  expectedBytes,
  assertAuthority
}) {
  const verify = async (handle, name) => {
    const read = await readRegularFile(ops, handle, name);
    if (!sameIdentity(read.identity, expectedIdentity) || !read.bytes.equals(expectedBytes)) {
      throw executeError('P5_INSTALL_FAILED');
    }
  };
  await verify(sourceHandle, sourceName);
  await moveIdentityNoReplace({
    ops,
    sourceHandle,
    sourceName,
    destinationHandle,
    destinationName,
    expectedIdentity,
    expectedKind: 'file',
    moveForward: () => ops.renameNoReplaceBetween(
      sourceHandle,
      sourceName,
      destinationHandle,
      destinationName
    ),
    moveReverse: () => ops.renameNoReplaceBetween(
      destinationHandle,
      destinationName,
      sourceHandle,
      sourceName
    ),
    beforeMove: assertAuthority,
    afterMove: () => verify(destinationHandle, destinationName)
  });
}

async function verifySelectionGeneration(ops, tree, files, identities, assertAuthority) {
  await assertAuthority();
  for (const name of SELECTION_PATHS) {
    const read = await readRegularFile(ops, tree.rootHandle, name);
    if (
      !sameIdentity(read.identity, identities[name])
      || !read.bytes.equals(files[name])
      || (read.mode & 0o777) !== 0o400
    ) throw executeError('P5_INSTALL_FAILED');
  }
  normalizeSelectionFiles(Object.fromEntries(SELECTION_PATHS.map((name) => [name, Buffer.from(files[name])])));
}

async function assertFlatGeneration(ops, parentHandle, basename, directoryIdentity, files, identities) {
  await assertNamedDirectoryIdentity(ops, parentHandle, basename, directoryIdentity);
  const directoryHandle = await ops.open(descriptorEntryPath(parentHandle, basename), DIRECTORY_FLAGS);
  try {
    const names = (await ops.readdir(descriptorPath(directoryHandle))).sort();
    if (!sameStrings(names, Object.keys(files).sort())) throw executeError('P5_INSTALL_FAILED');
    for (const name of names) {
      const read = await readRegularFile(ops, directoryHandle, name);
      if (!sameIdentity(read.identity, identities[name]) || !read.bytes.equals(files[name])) {
        throw executeError('P5_INSTALL_FAILED');
      }
    }
  } finally {
    await closeHandle(directoryHandle);
  }
}

async function removeVerifiedFlatDirectory(
  ops,
  tree,
  directory,
  files,
  identities,
  requireComplete,
  assertAuthority
) {
  await assertAuthority();
  await assertNamedDirectoryIdentity(ops, tree.rootHandle, directory.basename, directory.identity);
  const handle = directory.handle ?? await ops.open(descriptorEntryPath(tree.rootHandle, directory.basename), DIRECTORY_FLAGS);
  directory.handle = handle;
  const names = (await ops.readdir(descriptorPath(handle))).sort();
  if (
    names.some((name) => !SELECTION_PATHS.includes(name))
    || requireComplete && !sameStrings(names, Object.keys(files).sort())
  ) throw executeError('P5_INSTALL_FAILED');
  for (const name of names) {
    const read = await readRegularFile(ops, handle, name);
    if (!sameIdentity(read.identity, identities[name]) || !read.bytes.equals(files[name])) {
      throw executeError('P5_INSTALL_FAILED');
    }
    await assertFlatRetirementAuthority(
      ops,
      tree,
      directory,
      handle,
      assertAuthority
    );
    await ops.unlink(descriptorEntryPath(handle, name));
  }
  await assertFlatRetirementAuthority(
    ops,
    tree,
    directory,
    handle,
    assertAuthority
  );
  if ((await ops.readdir(descriptorPath(handle))).length !== 0) {
    throw executeError('P5_INSTALL_FAILED');
  }
  await closeHandle(handle);
  directory.handle = undefined;
  await assertNamedDirectoryIdentity(ops, tree.rootHandle, directory.basename, directory.identity);
  await ops.rmdir(descriptorEntryPath(tree.rootHandle, directory.basename));
}

async function assertFlatRetirementAuthority(ops, tree, directory, handle, assertAuthority) {
  await assertAuthority();
  const retained = await handle.stat();
  if (!retained.isDirectory() || !sameIdentity(identity(retained), directory.identity)) {
    throw executeError('P5_INSTALL_FAILED');
  }
  await assertNamedDirectoryIdentity(ops, tree.rootHandle, directory.basename, directory.identity);
}

async function readRegularFile(ops, directoryHandle, basename) {
  const target = descriptorEntryPath(directoryHandle, basename);
  let handle;
  try {
    const before = await ops.lstat(target);
    if (before.isSymbolicLink() || !before.isFile()) throw executeError('P5_INSTALL_FAILED');
    handle = await ops.open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile() || !sameIdentity(identity(before), identity(opened))) throw executeError('P5_INSTALL_FAILED');
    const bytes = Buffer.from(await handle.readFile());
    const after = await handle.stat();
    const pathAfter = await ops.lstat(target);
    if (
      pathAfter.isSymbolicLink()
      || !pathAfter.isFile()
      || !sameIdentity(identity(opened), identity(after))
      || !sameIdentity(identity(after), identity(pathAfter))
      || Number(after.size) !== bytes.length
    ) throw executeError('P5_INSTALL_FAILED');
    return { bytes, identity: identity(after), mode: after.mode };
  } catch (error) {
    throw publicError(error, 'P5_INSTALL_FAILED');
  } finally {
    await closeHandle(handle);
  }
}

async function openDirectoryEntry(ops, parentHandle, basename) {
  const target = descriptorEntryPath(parentHandle, basename);
  let handle;
  try {
    const before = await ops.lstat(target);
    if (before.isSymbolicLink() || !before.isDirectory()) throw executeError('P5_INSTALL_FAILED');
    handle = await ops.open(target, DIRECTORY_FLAGS);
    const opened = await handle.stat();
    const after = await ops.lstat(target);
    if (
      !opened.isDirectory()
      || after.isSymbolicLink()
      || !after.isDirectory()
      || !sameIdentity(identity(before), identity(opened))
      || !sameIdentity(identity(opened), identity(after))
    ) throw executeError('P5_INSTALL_FAILED');
    return handle;
  } catch (error) {
    await closeHandle(handle);
    throw publicError(error, 'P5_INSTALL_FAILED');
  }
}

async function assertNamedDirectoryIdentity(ops, parentHandle, basename, expectedIdentity) {
  const stat = await ops.lstat(descriptorEntryPath(parentHandle, basename));
  if (stat.isSymbolicLink() || !stat.isDirectory() || !sameIdentity(identity(stat), expectedIdentity)) {
    throw executeError('P5_INSTALL_FAILED');
  }
}

async function unusedTemporaryBasename(ops, parentHandle, prefix, assertAuthority) {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    await assertAuthority();
    transactionSequence += 1;
    const basename = `${prefix}${process.pid}-${transactionSequence}`;
    if (!await entryExists(ops, descriptorEntryPath(parentHandle, basename))) return basename;
  }
  throw executeError('P5_INSTALL_FAILED');
}

async function regularEntryHasIdentity(ops, handle, basename, expectedIdentity) {
  const entry = await entryDescription(ops, handle, basename);
  return entry?.kind === 'file' && sameIdentity(entry.identity, expectedIdentity);
}

async function entryDescription(ops, handle, basename) {
  try {
    const stat = await ops.lstat(descriptorEntryPath(handle, basename));
    return {
      kind: stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other',
      identity: identity(stat)
    };
  } catch (error) {
    if (isMissingError(error)) return null;
    throw publicError(error, 'P5_INSTALL_FAILED');
  }
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

function descriptorPath(handle) {
  return `/proc/self/fd/${handle.fd}`;
}

function descriptorEntryPath(handle, basename) {
  return `${descriptorPath(handle)}/${basename}`;
}

function identity(stat) {
  return { dev: stat.dev, ino: stat.ino };
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isMissingError(error) {
  return error?.code === 'ENOENT' || error?.code === 'ENOTDIR';
}

function publicError(error, fallbackCode) {
  return executeError(sanitizeExecuteError(error, fallbackCode).code);
}

async function closeHandles(handles) {
  await Promise.all([...new Set(handles.filter(Boolean))].map(closeHandle));
}

async function closeHandle(handle) {
  if (!handle) return;
  try {
    await handle.close();
  } catch {
    // File-handle close is idempotent at this transaction lifecycle boundary.
  }
}
