import { constants } from 'node:fs';
import { executeError, sanitizeExecuteError } from './contracts.js';

const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;

/**
 * Retire one directory tree without ever handing a released basename to a
 * recursive remover. Every discovered directory and regular file remains open
 * while its descriptor-relative entry is checked and removed. A pathname
 * collision or identity ambiguity aborts and leaves the unexpected inode in
 * place.
 */
export async function removeOwnedTree({
  ops,
  parentHandle,
  basename,
  expectedIdentity,
  expectedFiles,
  expectedIdentities,
  requireComplete = false,
  verifyBytes = false,
  allowMissing = false,
  assertAuthority = async () => {},
  fallbackCode = 'P5_INSTALL_FAILED'
}) {
  let root;
  const directories = new Map();
  const files = new Map();
  try {
    await assertAuthority();
    root = await openBoundDirectory(ops, parentHandle, basename, expectedIdentity, fallbackCode);
    directories.set('', { handle: root, parent: null, basename, identity: expectedIdentity });
    await discover(root, '');
    validateExpectedTree();

    for (const [relative, node] of [...files.entries()].sort(([left], [right]) => right.localeCompare(left))) {
      const parentRelative = dirname(relative);
      const parent = directories.get(parentRelative);
      await assertChain(parentRelative);
      await assertBoundFile(ops, parent.handle, node.basename, node.handle, node.identity, fallbackCode);
      if (verifyBytes && !node.bytes.equals(expectedFiles[relative])) fail(fallbackCode);
      await assertChain(parentRelative);
      await assertBoundFile(ops, parent.handle, node.basename, node.handle, node.identity, fallbackCode);
      await ops.unlink(entry(parent.handle, node.basename));
      await close(node.handle);
      files.delete(relative);
    }

    const children = [...directories.keys()].filter(Boolean).sort((left, right) => (
      depth(right) - depth(left) || right.localeCompare(left)
    ));
    for (const relative of children) {
      const node = directories.get(relative);
      const parent = directories.get(node.parent);
      await assertChain(relative);
      if ((await ops.readdir(descriptor(node.handle))).length !== 0) fail(fallbackCode);
      await assertChain(relative);
      await ops.rmdir(entry(parent.handle, node.basename));
      await close(node.handle);
      directories.delete(relative);
    }

    await assertChain('');
    if ((await ops.readdir(descriptor(root))).length !== 0) fail(fallbackCode);
    await assertChain('');
    await ops.rmdir(entry(parentHandle, basename));
  } catch (error) {
    if (allowMissing && isMissing(error)) return false;
    throw executeError(sanitizeExecuteError(error, fallbackCode).code);
  } finally {
    await Promise.all([...files.values()].map((node) => close(node.handle)));
    await Promise.all([...directories.values()].map((node) => close(node.handle)));
  }
  return true;

  async function discover(handle, prefix) {
    const names = (await ops.readdir(descriptor(handle))).sort();
    for (const name of names) {
      const relative = prefix ? `${prefix}/${name}` : name;
      const target = entry(handle, name);
      const before = await ops.lstat(target);
      if (before.isSymbolicLink()) fail(fallbackCode);
      if (before.isDirectory()) {
        const child = await ops.open(target, DIRECTORY_FLAGS);
        try {
          const opened = await child.stat();
          const after = await ops.lstat(target);
          const nodeIdentity = identity(opened);
          if (!opened.isDirectory() || after.isSymbolicLink() || !after.isDirectory()
            || !sameIdentity(identity(before), nodeIdentity)
            || !sameIdentity(nodeIdentity, identity(after))) fail(fallbackCode);
          directories.set(relative, {
            handle: child,
            parent: prefix,
            basename: name,
            identity: nodeIdentity
          });
          await discover(child, relative);
        } catch (error) {
          if (!directories.has(relative)) await close(child);
          throw error;
        }
      } else if (before.isFile()) {
        const file = await ops.open(target, READ_FLAGS);
        try {
          const opened = await file.stat();
          const bytes = Buffer.from(await file.readFile());
          const retained = await file.stat();
          const after = await ops.lstat(target);
          const nodeIdentity = identity(opened);
          if (!opened.isFile() || !retained.isFile() || after.isSymbolicLink() || !after.isFile()
            || !sameIdentity(identity(before), nodeIdentity)
            || !sameIdentity(nodeIdentity, identity(retained))
            || !sameIdentity(nodeIdentity, identity(after))
            || Number(retained.size) !== bytes.length) fail(fallbackCode);
          files.set(relative, { handle: file, basename: name, identity: nodeIdentity, bytes, mode: retained.mode });
        } catch (error) {
          await close(file);
          throw error;
        }
      } else fail(fallbackCode);
    }
  }

  function validateExpectedTree() {
    if (!expectedFiles && !expectedIdentities) return;
    const actualFiles = [...files.keys()].sort();
    const expectedNames = Object.keys(expectedFiles || {}).sort();
    if (actualFiles.some((name) => !Object.hasOwn(expectedFiles || {}, name))) fail(fallbackCode);
    if (requireComplete && !sameStrings(actualFiles, expectedNames)) fail(fallbackCode);
    for (const [relative, node] of files) {
      const expected = expectedIdentities?.[relative];
      if (expected && !sameIdentity(node.identity, expected)) fail(fallbackCode);
      if (verifyBytes && !node.bytes.equals(expectedFiles[relative])) fail(fallbackCode);
    }
    for (const [relative, node] of directories) {
      if (!relative) continue;
      const expected = expectedIdentities?.[relative];
      if (expected && !sameIdentity(node.identity, expected)) fail(fallbackCode);
      if (expectedIdentities && !expected) fail(fallbackCode);
    }
  }

  async function assertChain(relative) {
    await assertAuthority();
    const rootStat = await root.stat();
    if (!rootStat.isDirectory() || !sameIdentity(identity(rootStat), expectedIdentity)) fail(fallbackCode);
    await assertNamedDirectory(ops, parentHandle, basename, expectedIdentity, fallbackCode);
    if (!relative) return;
    let current = '';
    for (const component of relative.split('/')) {
      const next = current ? `${current}/${component}` : component;
      const parent = directories.get(current);
      const node = directories.get(next);
      if (!parent || !node) fail(fallbackCode);
      const retained = await node.handle.stat();
      if (!retained.isDirectory() || !sameIdentity(identity(retained), node.identity)) fail(fallbackCode);
      await assertNamedDirectory(ops, parent.handle, component, node.identity, fallbackCode);
      current = next;
    }
  }
}

export async function openBoundDirectory(ops, parentHandle, basename, expectedIdentity, code = 'P5_INSTALL_FAILED') {
  let handle;
  try {
    const before = await ops.lstat(entry(parentHandle, basename));
    if (before.isSymbolicLink() || !before.isDirectory()
      || expectedIdentity && !sameIdentity(identity(before), expectedIdentity)) fail(code);
    handle = await ops.open(entry(parentHandle, basename), DIRECTORY_FLAGS);
    const opened = await handle.stat();
    const after = await ops.lstat(entry(parentHandle, basename));
    const openedIdentity = identity(opened);
    if (!opened.isDirectory() || after.isSymbolicLink() || !after.isDirectory()
      || !sameIdentity(identity(before), openedIdentity)
      || !sameIdentity(openedIdentity, identity(after))
      || expectedIdentity && !sameIdentity(openedIdentity, expectedIdentity)) fail(code);
    return handle;
  } catch (error) {
    await close(handle);
    throw error;
  }
}

async function assertBoundFile(ops, parentHandle, basename, handle, expectedIdentity, code) {
  const retained = await handle.stat();
  const first = await ops.lstat(entry(parentHandle, basename));
  const second = await ops.lstat(entry(parentHandle, basename));
  if (!retained.isFile() || first.isSymbolicLink() || !first.isFile()
    || second.isSymbolicLink() || !second.isFile()
    || !sameIdentity(identity(retained), expectedIdentity)
    || !sameIdentity(identity(first), expectedIdentity)
    || !sameIdentity(identity(second), expectedIdentity)) fail(code);
}

async function assertNamedDirectory(ops, parentHandle, basename, expectedIdentity, code) {
  const first = await ops.lstat(entry(parentHandle, basename));
  const second = await ops.lstat(entry(parentHandle, basename));
  if (first.isSymbolicLink() || !first.isDirectory() || second.isSymbolicLink() || !second.isDirectory()
    || !sameIdentity(identity(first), expectedIdentity)
    || !sameIdentity(identity(second), expectedIdentity)) fail(code);
}

function descriptor(handle) { return `/proc/self/fd/${handle.fd}`; }
function entry(handle, basename) { return `${descriptor(handle)}/${basename}`; }
function dirname(relative) { const index = relative.lastIndexOf('/'); return index < 0 ? '' : relative.slice(0, index); }
function depth(relative) { return relative ? relative.split('/').length : 0; }
function identity(stat) { return { dev: stat.dev, ino: stat.ino }; }
function sameIdentity(left, right) { return left?.dev === right?.dev && left?.ino === right?.ino; }
function sameStrings(left, right) { return left.length === right.length && left.every((value, index) => value === right[index]); }
function isMissing(error) { return error?.code === 'ENOENT' || error?.code === 'ENOTDIR'; }
function fail(code) { throw executeError(code); }
async function close(handle) { try { await handle?.close(); } catch {} }
