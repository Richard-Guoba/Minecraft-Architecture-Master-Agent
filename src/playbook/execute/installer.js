import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveWorldDir } from '../../lib/minecraftWorlds.js';
import { executeError } from './contracts.js';
import { sha256, stableJson } from '../shadow/canonical.js';

const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const WRITE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
const SAFE_BASENAME = /^[A-Za-z0-9._-]+$/u;
const UNSAFE_PATH_CHARACTER = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const HASH = /^[a-f0-9]{64}$/u;
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
    const parent = await openAbsoluteDirectory(targetParent, fsImpl, { create: true });
    try {
      return await installSnapshot({ parent, targetParent, snapshot, faultInjector, fsImpl });
    } finally {
      await close(parent);
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
  let stageIdentity;
  let oldIdentity;
  let backupMade = false;
  let promoted = false;
  let committed = false;
  try {
    oldIdentity = await directoryIdentity(parent, targetName, fsImpl, true);
    await hit(faultInjector, 'stage-mkdir');
    await fsImpl.mkdir(entry(parent, stageName), { recursive: false, mode: 0o700 });
    stageIdentity = identity(await fsImpl.lstat(entry(parent, stageName)));
    const stage = await fsImpl.open(entry(parent, stageName), DIRECTORY_FLAGS);
    try {
      const directories = [...snapshot.directories].sort((left, right) => depth(left) - depth(right) || left.localeCompare(right));
      for (const relative of directories) {
        await fsImpl.mkdir(path.join(descriptor(stage), ...relative.split('/')), { recursive: false, mode: 0o700 });
      }
      for (const file of snapshot.files) {
        let handle;
        try {
          await hit(faultInjector, 'stage-write');
          handle = await fsImpl.open(path.join(descriptor(stage), ...file.path.split('/')), WRITE_FLAGS, 0o600);
          await handle.writeFile(file.bytes);
          await hit(faultInjector, 'stage-chmod');
          await handle.chmod(0o400);
          await hit(faultInjector, 'stage-file-sync');
          await handle.sync();
        } finally { await close(handle); }
      }
      await syncDirectories(stage, snapshot.directories, fsImpl, faultInjector);
    } finally { await close(stage); }
    const verified = await snapshotDatapack(entry(parent, stageName), fsImpl, false);
    if (verified.treeSha256 !== snapshot.treeSha256) invalid();
    if (oldIdentity) {
      await hit(faultInjector, 'backup-rename');
      await assertDirectoryIdentity(parent, targetName, oldIdentity, fsImpl);
      await fsImpl.rename(entry(parent, targetName), entry(parent, backupName));
      backupMade = true;
      await parent.sync();
    }
    await hit(faultInjector, 'promote-rename');
    await assertDirectoryIdentity(parent, stageName, stageIdentity, fsImpl);
    await fsImpl.rename(entry(parent, stageName), entry(parent, targetName));
    promoted = true;
    await hit(faultInjector, 'parent-sync');
    await parent.sync();
    await assertDirectoryIdentity(parent, targetName, stageIdentity, fsImpl);
    const installed = await snapshotDatapack(entry(parent, targetName), fsImpl, false);
    if (installed.treeSha256 !== snapshot.treeSha256) invalid();
    committed = true;
  } catch (error) {
    if (!committed) {
      try {
        if (promoted && await hasIdentity(parent, targetName, stageIdentity, fsImpl)) {
          await fsImpl.rename(entry(parent, targetName), entry(parent, stageName));
          promoted = false;
        }
        if (backupMade && await hasIdentity(parent, backupName, oldIdentity, fsImpl)) {
          await fsImpl.rename(entry(parent, backupName), entry(parent, targetName));
          backupMade = false;
        }
        await parent.sync();
      } catch {}
    }
    throw error;
  } finally {
    if (!committed) {
      await removeOwnedDirectory(parent, stageName, stageIdentity, fsImpl);
    }
  }
  if (backupMade) {
    try {
      await hit(faultInjector, 'cleanup');
      await removeOwnedDirectory(parent, backupName, oldIdentity, fsImpl);
      await parent.sync();
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
  try {
    const opened = await rootHandle.stat();
    if (!opened.isDirectory()) invalid();
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
          files.push({ path: relative, bytes });
        } finally { await close(file); }
      } else invalid();
    }
  }
}

async function syncDirectories(rootHandle, directories, fsImpl, faultInjector) {
  for (const relative of [...directories].sort((left, right) => depth(right) - depth(left))) {
    const handle = await fsImpl.open(path.join(descriptor(rootHandle), ...relative.split('/')), DIRECTORY_FLAGS);
    try {
      await hit(faultInjector, 'stage-directory-sync');
      await handle.sync();
    } finally { await close(handle); }
  }
  await hit(faultInjector, 'stage-directory-sync');
  await rootHandle.sync();
}

async function openAbsoluteDirectory(absolutePath, fsImpl, { create }) {
  const absolute = path.resolve(absolutePath);
  const parsed = path.parse(absolute);
  const components = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = await fsImpl.open(parsed.root, DIRECTORY_FLAGS);
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
        await fsImpl.mkdir(target, { recursive: false, mode: 0o700 });
        before = await fsImpl.lstat(target);
        if (before.isSymbolicLink() || !before.isDirectory()) invalid();
        await current.sync();
      }
      const next = await fsImpl.open(target, DIRECTORY_FLAGS);
      const opened = await next.stat();
      const after = await fsImpl.lstat(target);
      if (!opened.isDirectory() || after.isSymbolicLink() || !after.isDirectory()
        || !sameIdentity(identity(before), identity(opened))
        || !sameIdentity(identity(opened), identity(after))) {
        await close(next);
        invalid();
      }
      await close(current);
      current = next;
    }
    return current;
  } catch (error) {
    await close(current);
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

async function removeOwnedDirectory(parent, name, expected, fsImpl) {
  if (!expected || !await hasIdentity(parent, name, expected, fsImpl)) return;
  await fsImpl.rm(entry(parent, name), { recursive: true, force: false });
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
