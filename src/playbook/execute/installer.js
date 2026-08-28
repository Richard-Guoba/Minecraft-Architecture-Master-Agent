import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { resolveWorldDir } from '../../lib/minecraftWorlds.js';
import { executeError } from './contracts.js';
import { sha256, stableJson } from '../shadow/canonical.js';
import { createBoundDirectory, removeOwnedTree } from './ownedTree.js';

const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const WRITE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
const SAFE_BASENAME = /^[A-Za-z0-9._-]+$/u;
const UNSAFE_PATH_CHARACTER = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const HASH = /^[a-f0-9]{64}$/u;
const MOVE_BINARY = '/usr/bin/mv';
const PRIVATE_DIRECTORY_PREFIX = '.p5-private-directory-';
let sequence = 0;

export async function installSelectedDatapackSafely(sourceDatapackDir, {
  minecraftDir,
  world,
  datapacksDir,
  expectedDatapackTreeSha256,
  faultInjector,
  fsImpl = fs
} = {}) {
  if (!sourceDatapackDir || (!world && !datapacksDir)) return undefined;
  try {
    if (!HASH.test(expectedDatapackTreeSha256 || '')) invalid();
    const snapshot = await snapshotDatapack(sourceDatapackDir, fsImpl);
    await hit(faultInjector, 'snapshot');
    if (snapshot.treeSha256 !== expectedDatapackTreeSha256) invalid();
    await hit(faultInjector, 'source-snapshotted');
    const targetParent = datapacksDir
      ? path.resolve(datapacksDir)
      : path.join(await resolveWorldDir({ minecraftDir, world }), 'datapacks');
    const topology = await openAbsoluteDirectory(targetParent, fsImpl, { create: true });
    try {
      return await installSnapshot({ parent: topology.handle, targetParent, snapshot, faultInjector, fsImpl });
    } catch (error) {
      await rollbackCreatedTopology(topology, fsImpl);
      throw error;
    } finally {
      await closeTopology(topology);
    }
  } catch {
    throw executeError('P5_INSTALL_FAILED');
  }
}

async function installSnapshot({ parent, targetParent, snapshot, faultInjector, fsImpl }) {
  const targetName = 'architect_datapack';
  const token = `${process.pid}-${++sequence}`;
  const stageName = `.p5-install-stage-${token}`;
  const backupName = `.p5-install-backup-${token}`;
  const ops = installerOperations(fsImpl);
  let stageIdentity;
  let stagePartialSnapshot;
  let stageCleanupSafe = true;
  let stageSnapshot;
  let oldSnapshot;
  let committed = false;
  try {
    const oldIdentity = await directoryIdentity(parent, targetName, fsImpl, true);
    oldSnapshot = oldIdentity
      ? await snapshotDatapack(entry(parent, targetName), fsImpl, false)
      : null;
    if (oldSnapshot && !sameIdentity(oldSnapshot.rootIdentity, oldIdentity)) invalid();
    await hit(faultInjector, 'stage-mkdir');
    const stage = await createPromotedPrivateDirectory(parent, stageName, fsImpl);
    stageIdentity = identity(await stage.stat());
    stagePartialSnapshot = { rootIdentity: stageIdentity, files: [], identities: {} };
    const directoryHandles = new Map([['', stage]]);
    try {
      const directories = [...snapshot.directories].sort((left, right) => depth(left) - depth(right) || left.localeCompare(right));
      for (const relative of directories) {
        const parentRelative = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative);
        const parentHandle = directoryHandles.get(parentRelative);
        let made;
        try {
          made = await createBoundDirectory({
            ops,
            parentHandle,
            basename: path.posix.basename(relative),
            fallbackCode: 'P5_INSTALL_FAILED'
          });
        } catch (error) {
          stageCleanupSafe = false;
          throw error;
        }
        directoryHandles.set(relative, made.handle);
        stagePartialSnapshot.identities[relative] = made.identity;
      }
      for (const file of snapshot.files) {
        let handle;
        try {
          await hit(faultInjector, 'stage-write');
          const parentRelative = path.posix.dirname(file.path) === '.' ? '' : path.posix.dirname(file.path);
          const parentHandle = directoryHandles.get(parentRelative);
          try {
            handle = await fsImpl.open(
              entry(parentHandle, path.posix.basename(file.path)), WRITE_FLAGS, 0o600
            );
          } catch (error) {
            stageCleanupSafe = false;
            throw error;
          }
          const opened = await handle.stat();
          if (!opened.isFile()) invalid();
          try {
            await handle.writeFile(file.bytes);
          } catch (error) {
            stageCleanupSafe = false;
            throw error;
          }
          stagePartialSnapshot.files.push({ path: file.path, bytes: Buffer.from(file.bytes) });
          stagePartialSnapshot.identities[file.path] = identity(opened);
          await hit(faultInjector, 'stage-chmod');
          await handle.chmod(0o400);
          await hit(faultInjector, 'stage-file-sync');
          await handle.sync();
          const completed = await handle.stat();
          if (!completed.isFile()
            || !sameIdentity(identity(completed), stagePartialSnapshot.identities[file.path])) {
            invalid();
          }
        } finally { await close(handle); }
      }
      await syncDirectories(directoryHandles, faultInjector);
    } finally {
      await Promise.all(
        [...directoryHandles.entries()].filter(([relative]) => relative).map(([, handle]) => close(handle))
      );
      await close(stage);
    }
    const verified = await snapshotDatapack(entry(parent, stageName), fsImpl, false);
    if (verified.treeSha256 !== snapshot.treeSha256
      || !sameIdentity(verified.rootIdentity, stageIdentity)
      || !sameIdentityMaps(verified.identities, stagePartialSnapshot.identities)
      || !sameSnapshotFiles(verified.files, stagePartialSnapshot.files)) invalid();
    stageSnapshot = verified;
    if (oldSnapshot) {
      await hit(faultInjector, 'backup-rename');
      await moveBoundDirectory({
        ops, parent, sourceName: targetName, destinationName: backupName,
        expectedIdentity: oldSnapshot.rootIdentity, fsImpl
      });
      await syncParent(parent);
    }
    await hit(faultInjector, 'promote-rename');
    await moveBoundDirectory({
      ops, parent, sourceName: stageName, destinationName: targetName,
      expectedIdentity: stageSnapshot.rootIdentity, fsImpl
    });
    await hit(faultInjector, 'parent-sync');
    await syncParent(parent);
    await assertDirectoryIdentity(parent, targetName, stageSnapshot.rootIdentity, fsImpl);
    const installed = await snapshotDatapack(entry(parent, targetName), fsImpl, false);
    if (installed.treeSha256 !== snapshot.treeSha256
      || !sameIdentity(installed.rootIdentity, stageSnapshot.rootIdentity)
      || !sameIdentityMaps(installed.identities, stageSnapshot.identities)
      || !sameSnapshotFiles(installed.files, stageSnapshot.files)) invalid();
    committed = true;
  } catch (error) {
    if (!committed) {
      await rollbackInstall({
        ops, parent, targetName, stageName, backupName,
        stageSnapshot, oldSnapshot, fsImpl
      });
    }
    throw error;
  } finally {
    if (!committed) {
      await removeSnapshotDirectory(
        parent,
        stageName,
        stageSnapshot ?? (stageCleanupSafe ? stagePartialSnapshot : { rootIdentity: stageIdentity }),
        ops,
        true
      );
    }
  }
  if (oldSnapshot && await hasIdentity(parent, backupName, oldSnapshot.rootIdentity, fsImpl)) {
    try {
      await hit(faultInjector, 'cleanup');
      await removeSnapshotDirectory(parent, backupName, oldSnapshot, ops, false);
      await syncParent(parent);
    } catch {
      // Publication is already durable; a fixed-prefix verified backup is safe residue.
    }
  }
  return path.join(targetParent, targetName);
}

async function snapshotDatapack(root, fsImpl, requireDatapackBasename = true) {
  const absolute = path.resolve(root);
  if (requireDatapackBasename && path.basename(absolute) !== 'architect_datapack') invalid();
  const descriptorRelative = !requireDatapackBasename;
  const before = descriptorRelative ? await fsImpl.lstat(absolute) : null;
  if (before && (before.isSymbolicLink() || !before.isDirectory())) invalid();
  const rootHandle = descriptorRelative
    ? await fsImpl.open(absolute, DIRECTORY_FLAGS)
    : await openAbsoluteDirectory(absolute, fsImpl, { create: false });
  const files = [];
  const directories = [];
  const identities = {};
  let rootIdentity;
  try {
    const opened = await rootHandle.stat();
    if (!opened.isDirectory()) invalid();
    rootIdentity = identity(opened);
    await walk(rootHandle, '');
    if (descriptorRelative) {
      const after = await fsImpl.lstat(absolute);
      if (after.isSymbolicLink() || !after.isDirectory()
        || !sameIdentity(identity(before), identity(opened))
        || !sameIdentity(identity(opened), identity(after))) invalid();
    } else {
      const reopened = await openAbsoluteDirectory(absolute, fsImpl, { create: false });
      try {
        const after = await reopened.stat();
        if (!after.isDirectory() || !sameIdentity(identity(opened), identity(after))) invalid();
      } finally { await close(reopened); }
    }
  } finally { await close(rootHandle); }
  files.sort((left, right) => left.path.localeCompare(right.path));
  directories.sort();
  const rows = files.map((file) => ({
    path: `architect_datapack/${file.path}`,
    sha256: sha256(file.bytes)
  }));
  return {
    files: files.map((file) => ({ path: file.path, bytes: Buffer.from(file.bytes) })),
    directories,
    identities: Object.freeze(identities),
    rootIdentity,
    treeSha256: sha256(stableJson(rows))
  };

  async function walk(handle, prefix) {
    for (const name of (await fsImpl.readdir(descriptor(handle))).sort()) {
      if (!SAFE_BASENAME.test(name) || name === '.' || name === '..') invalid();
      const relative = prefix ? `${prefix}/${name}` : name;
      const target = entry(handle, name);
      const stat = await fsImpl.lstat(target);
      if (stat.isSymbolicLink()) invalid();
      if (stat.isDirectory()) {
        const child = await fsImpl.open(target, DIRECTORY_FLAGS);
        try {
          const opened = await child.stat();
          if (!opened.isDirectory() || !sameIdentity(identity(stat), identity(opened))) invalid();
          identities[relative] = identity(opened);
          directories.push(relative);
          await walk(child, relative);
          const after = await fsImpl.lstat(target);
          if (after.isSymbolicLink() || !after.isDirectory()
            || !sameIdentity(identity(opened), identity(after))) invalid();
        } finally { await close(child); }
      } else if (stat.isFile()) {
        const file = await fsImpl.open(target, READ_FLAGS);
        try {
          const opened = await file.stat();
          if (!opened.isFile() || !sameIdentity(identity(stat), identity(opened))) invalid();
          const bytes = Buffer.from(await file.readFile());
          const after = await fsImpl.lstat(target);
          if (after.isSymbolicLink() || !after.isFile()
            || !sameIdentity(identity(opened), identity(after)) || Number(after.size) !== bytes.length) invalid();
          identities[relative] = identity(opened);
          files.push({ path: relative, bytes });
        } finally { await close(file); }
      } else invalid();
    }
  }
}

async function syncDirectories(directoryHandles, faultInjector) {
  for (const [relative, handle] of [...directoryHandles.entries()].sort(([left], [right]) => (
    depth(right) - depth(left) || right.localeCompare(left)
  ))) {
    if (!relative) continue;
    await hit(faultInjector, 'stage-directory-sync');
    await handle.sync();
  }
  await hit(faultInjector, 'stage-directory-sync');
  await directoryHandles.get('').sync();
}

async function openAbsoluteDirectory(absolutePath, fsImpl, { create }) {
  const absolute = path.resolve(absolutePath);
  const parsed = path.parse(absolute);
  const components = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  const handles = [await fsImpl.open(parsed.root, DIRECTORY_FLAGS)];
  const created = [];
  let current = handles[0];
  try {
    for (const component of components) {
      if (!isSafePathComponent(component)) invalid();
      const target = entry(current, component);
      let before;
      try {
        before = await fsImpl.lstat(target);
        if (before.isSymbolicLink() || !before.isDirectory()) invalid();
      } catch (error) {
        if (!create || error?.code !== 'ENOENT') throw error;
        const made = await createPromotedPrivateDirectory(current, component, fsImpl);
        before = await made.stat();
        created.push({ parent: current, handle: made, basename: component, identity: identity(before) });
        handles.push(made);
        await current.sync();
      }
      const recorded = created.at(-1);
      const next = recorded?.parent === current && recorded.basename === component
        ? recorded.handle
        : await fsImpl.open(target, DIRECTORY_FLAGS);
      const opened = await next.stat();
      const after = await fsImpl.lstat(target);
      if (!opened.isDirectory() || after.isSymbolicLink() || !after.isDirectory()
        || !sameIdentity(identity(before), identity(opened))
        || !sameIdentity(identity(opened), identity(after))) {
        await close(next);
        invalid();
      }
      if (!handles.includes(next)) handles.push(next);
      current = next;
    }
    if (!create) {
      for (const handle of handles.slice(0, -1)) await close(handle);
      return current;
    }
    return { handle: current, handles, created };
  } catch (error) {
    if (create) {
      try { await rollbackCreatedTopology({ handle: current, handles, created }, fsImpl); } catch {}
    }
    await Promise.all(handles.map(close));
    throw error;
  }
}

function isSafePathComponent(value) {
  return typeof value === 'string' && value.length > 0 && value !== '.' && value !== '..'
    && !UNSAFE_PATH_CHARACTER.test(value) && !value.includes(path.sep);
}

async function directoryIdentity(parent, name, fsImpl, allowMissing) {
  try {
    const stat = await fsImpl.lstat(entry(parent, name));
    if (stat.isSymbolicLink() || !stat.isDirectory()) invalid();
    return identity(stat);
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function assertDirectoryIdentity(parent, name, expected, fsImpl) {
  if (!await hasIdentity(parent, name, expected, fsImpl)) invalid();
}

async function hasIdentity(parent, name, expected, fsImpl) {
  if (!expected) return false;
  try {
    const stat = await fsImpl.lstat(entry(parent, name));
    return !stat.isSymbolicLink() && stat.isDirectory()
      && sameIdentity(identity(stat), expected);
  } catch { return false; }
}

async function createPrivateDirectory(parent, basename, fsImpl) {
  const beforeNames = (await fsImpl.readdir(descriptor(parent))).sort();
  if (beforeNames.includes(basename)) invalid();
  const ops = installerOperations(fsImpl);
  const made = await createBoundDirectory({
    ops,
    parentHandle: parent,
    basename,
    fallbackCode: 'P5_INSTALL_FAILED'
  });
  const handle = made.handle;
  try {
    const afterNames = (await fsImpl.readdir(descriptor(parent))).sort();
    const expectedNames = [...beforeNames, basename].sort();
    if (!sameStrings(afterNames, expectedNames)) invalid();
    const opened = await handle.stat();
    const after = await fsImpl.lstat(entry(parent, basename));
    if (!opened.isDirectory() || after.isSymbolicLink() || !after.isDirectory()
      || !sameIdentity(made.identity, identity(opened))
      || !sameIdentity(identity(opened), identity(after))) invalid();
    return handle;
  } catch (error) {
    try {
      if (await hasIdentity(parent, basename, made.identity, fsImpl)) {
        await removeOwnedTree({
          ops,
          parentHandle: parent,
          basename,
          expectedIdentity: made.identity,
          expectedFiles: {},
          expectedIdentities: {},
          requireComplete: true,
          verifyBytes: true,
          fallbackCode: 'P5_INSTALL_FAILED'
        });
        await syncParent(parent);
      }
    } catch {
      // Preserve anything that no longer matches the exact empty creation.
    }
    await close(handle);
    throw error;
  }
}

async function createPromotedPrivateDirectory(parent, basename, fsImpl) {
  if (await entryDescription(parent, basename, fsImpl)) invalid();
  const ops = installerOperations(fsImpl);
  const stageName = await unusedBasename(parent, PRIVATE_DIRECTORY_PREFIX, fsImpl);
  const handle = await createPrivateDirectory(parent, stageName, fsImpl);
  const expectedIdentity = identity(await handle.stat());
  try {
    await moveBoundDirectory({
      ops,
      parent,
      sourceName: stageName,
      destinationName: basename,
      expectedIdentity,
      fsImpl
    });
    await syncParent(parent);
    await assertDirectoryIdentity(parent, basename, expectedIdentity, fsImpl);
    return handle;
  } catch (error) {
    try {
      if (await hasIdentity(parent, basename, expectedIdentity, fsImpl)
        && !await entryDescription(parent, stageName, fsImpl)) {
        await reconcileMove({
          ops,
          parent,
          sourceName: basename,
          destinationName: stageName,
          expectedIdentity,
          expectedKind: 'directory',
          fsImpl
        });
      }
      if (await hasIdentity(parent, stageName, expectedIdentity, fsImpl)) {
        await removeOwnedTree({
          ops,
          parentHandle: parent,
          basename: stageName,
          expectedIdentity,
          expectedFiles: {},
          expectedIdentities: {},
          requireComplete: true,
          verifyBytes: true,
          fallbackCode: 'P5_INSTALL_FAILED'
        });
        await syncParent(parent);
      }
    } catch {
      // Ownership ambiguity is retained rather than removed by pathname.
    }
    await close(handle);
    throw error;
  }
}

function installerOperations(fsImpl) {
  const custom = typeof fsImpl.renameNoReplace === 'function'
    ? fsImpl.renameNoReplace.bind(fsImpl)
    : null;
  const customBetween = typeof fsImpl.renameNoReplaceBetween === 'function'
    ? fsImpl.renameNoReplaceBetween.bind(fsImpl)
    : null;
  const customMkdirBound = typeof fsImpl.mkdirBound === 'function'
    ? fsImpl.mkdirBound.bind(fsImpl)
    : undefined;
  const customRetireEntry = typeof fsImpl.retireEntry === 'function'
    ? fsImpl.retireEntry.bind(fsImpl)
    : undefined;
  return Object.freeze({
    open: fsImpl.open.bind(fsImpl),
    lstat: fsImpl.lstat.bind(fsImpl),
    readdir: fsImpl.readdir.bind(fsImpl),
    mkdirBound: customMkdirBound,
    retireEntry: customRetireEntry,
    renameNoReplace: custom
      ? (parent, sourceName, destinationName) => custom(
        parent, sourceName, destinationName, renameNoReplaceByDescriptor
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

async function renameNoReplaceByDescriptor(parent, sourceName, destinationName) {
  return renameNoReplaceBetweenDescriptors(parent, sourceName, parent, destinationName);
}

async function renameNoReplaceBetweenDescriptors(
  sourceParent,
  sourceName,
  destinationParent,
  destinationName
) {
  await new Promise((resolve, reject) => {
    const child = spawn(MOVE_BINARY, [
      '--no-clobber',
      '--no-target-directory',
      `/proc/self/fd/3/${sourceName}`,
      `/proc/self/fd/4/${destinationName}`
    ], { stdio: ['ignore', 'ignore', 'ignore', sourceParent.fd, destinationParent.fd] });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(executeError('P5_INSTALL_FAILED')));
  });
}

async function moveBoundDirectory({ ops, parent, sourceName, destinationName, expectedIdentity, fsImpl }) {
  await assertDirectoryIdentity(parent, sourceName, expectedIdentity, fsImpl);
  if (await entryDescription(parent, destinationName, fsImpl)) invalid();
  let moveError;
  try { await ops.renameNoReplace(parent, sourceName, destinationName); }
  catch (error) { moveError = error; }
  const source = await entryDescription(parent, sourceName, fsImpl);
  const destination = await entryDescription(parent, destinationName, fsImpl);
  if (source === null && destination?.kind === 'directory'
    && sameIdentity(destination.identity, expectedIdentity)) {
    if (moveError) invalid();
    return;
  }
  invalid();
}

async function rollbackInstall({
  ops, parent, targetName, stageName, backupName, stageSnapshot, oldSnapshot, fsImpl
}) {
  let rollbackFailed = false;
  try {
    let target = await entryDescription(parent, targetName, fsImpl);
    if (target && stageSnapshot && sameIdentity(target.identity, stageSnapshot.rootIdentity)) {
      if (!await reconcileMove({
        ops, parent, sourceName: targetName, destinationName: stageName,
        expectedIdentity: stageSnapshot.rootIdentity, expectedKind: 'directory', fsImpl
      })) rollbackFailed = true;
      target = await entryDescription(parent, targetName, fsImpl);
    } else if (target && (!oldSnapshot || !sameIdentity(target.identity, oldSnapshot.rootIdentity))) {
      const quarantine = await unusedBasename(parent, '.p5-install-foreign-', fsImpl);
      if (!await reconcileMove({
        ops, parent, sourceName: targetName, destinationName: quarantine,
        expectedIdentity: target.identity, expectedKind: target.kind, fsImpl
      })) rollbackFailed = true;
      target = await entryDescription(parent, targetName, fsImpl);
    }

    if (oldSnapshot) {
      if (!target) {
        const oldName = await findNameByIdentity(parent, oldSnapshot.rootIdentity, fsImpl);
        const oldEntry = oldName ? await entryDescription(parent, oldName, fsImpl) : null;
        if (!oldEntry || oldEntry.kind !== 'directory'
          || !await reconcileMove({
            ops, parent, sourceName: oldName, destinationName: targetName,
            expectedIdentity: oldSnapshot.rootIdentity, expectedKind: 'directory', fsImpl
          })) rollbackFailed = true;
      }
      const restored = await entryDescription(parent, targetName, fsImpl);
      if (!restored || restored.kind !== 'directory'
        || !sameIdentity(restored.identity, oldSnapshot.rootIdentity)) rollbackFailed = true;
      else {
        const checked = await snapshotDatapack(entry(parent, targetName), fsImpl, false);
        if (checked.treeSha256 !== oldSnapshot.treeSha256
          || !sameIdentity(checked.rootIdentity, oldSnapshot.rootIdentity)
          || !sameIdentityMaps(checked.identities, oldSnapshot.identities)) rollbackFailed = true;
      }
    } else if (await entryDescription(parent, targetName, fsImpl)) rollbackFailed = true;
    await syncParent(parent);
  } catch {
    rollbackFailed = true;
  }
  if (rollbackFailed) invalid();
}

async function reconcileMove({
  ops, parent, sourceName, destinationName, expectedIdentity, expectedKind, fsImpl
}) {
  const sourceBefore = await entryDescription(parent, sourceName, fsImpl);
  const destinationBefore = await entryDescription(parent, destinationName, fsImpl);
  if (!sourceBefore || sourceBefore.kind !== expectedKind
    || !sameIdentity(sourceBefore.identity, expectedIdentity) || destinationBefore) return false;
  try { await ops.renameNoReplace(parent, sourceName, destinationName); } catch {}
  const source = await entryDescription(parent, sourceName, fsImpl);
  const destination = await entryDescription(parent, destinationName, fsImpl);
  return source === null && destination?.kind === expectedKind
    && sameIdentity(destination.identity, expectedIdentity);
}

async function entryDescription(parent, name, fsImpl) {
  try {
    const stat = await fsImpl.lstat(entry(parent, name));
    return {
      kind: stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : stat.isSymbolicLink() ? 'symlink' : 'other',
      identity: identity(stat)
    };
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    throw error;
  }
}

async function findNameByIdentity(parent, expectedIdentity, fsImpl) {
  const matches = [];
  for (const name of await fsImpl.readdir(descriptor(parent))) {
    const described = await entryDescription(parent, name, fsImpl);
    if (described && sameIdentity(described.identity, expectedIdentity)) matches.push(name);
  }
  return matches.length === 1 ? matches[0] : null;
}

async function removeSnapshotDirectory(parent, name, snapshot, ops, allowMissing) {
  if (!snapshot?.rootIdentity) return;
  const complete = Array.isArray(snapshot.files) && snapshot.identities;
  const expectedFiles = complete
    ? Object.fromEntries(snapshot.files.map((file) => [file.path, file.bytes]))
    : {};
  await removeOwnedTree({
    ops,
    parentHandle: parent,
    basename: name,
    expectedIdentity: snapshot.rootIdentity,
    expectedFiles,
    expectedIdentities: complete ? snapshot.identities : {},
    requireComplete: true,
    verifyBytes: Boolean(complete),
    allowMissing,
    fallbackCode: 'P5_INSTALL_FAILED'
  });
}

async function unusedBasename(parent, prefix, fsImpl) {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const name = `${prefix}${process.pid}-${++sequence}`;
    if (!await entryDescription(parent, name, fsImpl)) return name;
  }
  invalid();
}

async function rollbackCreatedTopology(topology, fsImpl) {
  if (!topology?.created?.length) return;
  const ops = installerOperations(fsImpl);
  let failed = false;
  for (const created of [...topology.created].reverse()) {
    try {
      await removeOwnedTree({
        ops,
        parentHandle: created.parent,
        basename: created.basename,
        expectedIdentity: created.identity,
        expectedFiles: {},
        expectedIdentities: {},
        requireComplete: true,
        verifyBytes: true,
        allowMissing: true,
        fallbackCode: 'P5_INSTALL_FAILED'
      });
      await created.parent.sync();
    } catch { failed = true; }
  }
  if (failed) invalid();
}

async function closeTopology(topology) {
  await Promise.all([...new Set(topology?.handles || [])].map(close));
}

async function syncParent(parent) { await parent.sync(); }
function sameStrings(left, right) { return left.length === right.length && left.every((value, index) => value === right[index]); }
function sameIdentityMaps(left, right) {
  const names = Object.keys(left).sort();
  return sameStrings(names, Object.keys(right).sort())
    && names.every((name) => sameIdentity(left[name], right[name]));
}
function sameSnapshotFiles(left, right) {
  return left.length === right.length && left.every((file, index) => (
    file.path === right[index].path && file.bytes.equals(right[index].bytes)
  ));
}

async function hit(injector, boundary) {
  if (injector === undefined) return;
  if (typeof injector !== 'function') invalid();
  await injector(boundary);
}

function entry(handle, name) { return path.join(descriptor(handle), name); }
function descriptor(handle) { return `/proc/self/fd/${handle.fd}`; }
function identity(stat) { return { dev: stat.dev, ino: stat.ino }; }
function sameIdentity(left, right) { return left.dev === right.dev && left.ino === right.ino; }
function depth(value) { return value.split('/').length; }
async function close(handle) { try { await handle?.close(); } catch {} }
function invalid() { throw executeError('P5_INSTALL_FAILED'); }
