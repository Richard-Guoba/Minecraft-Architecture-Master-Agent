import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import { executeError, sanitizeExecuteError } from './contracts.js';
import { moveIdentityNoReplace } from './storageTransaction.js';

const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const RETIREMENT_PREFIX = '.p5-retirement-';
const RETIRED_BASENAME = 'owned-entry';

/**
 * Retire one directory tree without destructively mutating its public name.
 * The exact retained root is first moved, without replacement, into a random
 * capability-private sibling directory. A source swap is therefore reversible
 * and never becomes an unlink/rmdir of an unexpected inode. Physical deletion
 * happens only after the retained root has entered that private namespace.
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

    await retireBoundEntry({
      ops,
      parentHandle,
      basename,
      expectedIdentity,
      expectedKind: 'directory',
      assertAuthority: () => assertChain(''),
      fallbackCode,
      destroy: async (retirementHandle) => {
        for (const [relative, node] of [...files.entries()].sort(([left], [right]) => (
          depth(right) - depth(left) || right.localeCompare(left)
        ))) {
          const parent = directories.get(dirname(relative));
          await assertRetiredChain(dirname(relative), retirementHandle);
          const retainedBytes = await assertRetainedFile(parent.handle, node, fallbackCode);
          if (!retainedBytes.equals(node.bytes)
            || (verifyBytes && !retainedBytes.equals(expectedFiles[relative]))) fail(fallbackCode);
          await fs.unlink(entry(parent.handle, node.basename));
          await close(node.handle);
          files.delete(relative);
        }

        const children = [...directories.keys()].filter(Boolean).sort((left, right) => (
          depth(right) - depth(left) || right.localeCompare(left)
        ));
        for (const relative of children) {
          const node = directories.get(relative);
          const parent = directories.get(node.parent);
          await assertRetiredChain(relative, retirementHandle);
          if ((await fs.readdir(descriptor(node.handle))).length !== 0) fail(fallbackCode);
          await fs.rmdir(entry(parent.handle, node.basename));
          await close(node.handle);
          directories.delete(relative);
        }

        await assertRetiredChain('', retirementHandle);
        if ((await fs.readdir(descriptor(root))).length !== 0) fail(fallbackCode);
        await fs.rmdir(entry(retirementHandle, RETIRED_BASENAME));
      }
    });
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
      if (expectedIdentities && !expected) fail(fallbackCode);
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

  async function assertRetiredChain(relative, retirementHandle) {
    const retainedRoot = await root.stat();
    if (!retainedRoot.isDirectory()
      || !sameIdentity(identity(retainedRoot), expectedIdentity)) fail(fallbackCode);
    await assertRawNamedDirectory(
      retirementHandle, RETIRED_BASENAME, expectedIdentity, fallbackCode
    );
    if (!relative) return;
    let current = '';
    for (const component of relative.split('/')) {
      const next = current ? `${current}/${component}` : component;
      const parent = directories.get(current);
      const node = directories.get(next);
      if (!parent || !node) fail(fallbackCode);
      const retained = await node.handle.stat();
      if (!retained.isDirectory()
        || !sameIdentity(identity(retained), node.identity)) fail(fallbackCode);
      await assertRawNamedDirectory(parent.handle, component, node.identity, fallbackCode);
      current = next;
    }
  }
}

/**
 * Create and retain the exact private directory before an injected caller can
 * observe a completed creation. The optional mkdirBound hook surrounds the
 * complete create+open boundary, not the raw mkdir promise.
 */
export async function createBoundDirectory({
  ops,
  parentHandle,
  basename,
  mode = 0o700,
  fallbackCode = 'P5_INSTALL_FAILED'
}) {
  if (!isBasename(basename)) fail(fallbackCode);
  let created;
  const createAndOpen = async () => {
    let handle;
    try {
      await fs.mkdir(entry(parentHandle, basename), { recursive: false, mode });
      handle = await fs.open(entry(parentHandle, basename), DIRECTORY_FLAGS);
      const opened = await handle.stat();
      const named = await fs.lstat(entry(parentHandle, basename));
      if (!opened.isDirectory() || named.isSymbolicLink() || !named.isDirectory()
        || !sameIdentity(identity(opened), identity(named))) fail(fallbackCode);
      created = { handle, identity: identity(opened) };
      return created;
    } catch (error) {
      await close(handle);
      throw error;
    }
  };
  try {
    created = typeof ops.mkdirBound === 'function'
      ? await ops.mkdirBound(parentHandle, basename, createAndOpen)
      : await createAndOpen();
    const retained = await created?.handle?.stat();
    const named = await ops.lstat(entry(parentHandle, basename));
    if (!retained?.isDirectory?.() || named.isSymbolicLink() || !named.isDirectory()
      || !sameIdentity(identity(retained), created.identity)
      || !sameIdentity(created.identity, identity(named))) fail(fallbackCode);
    return created;
  } catch (error) {
    if (created?.handle) {
      try {
        const retained = await created.handle.stat();
        const named = await describeEntry(ops, parentHandle, basename);
        if (retained.isDirectory()
          && sameIdentity(identity(retained), created.identity)
          && named?.kind === 'directory'
          && sameIdentity(named.identity, created.identity)
          && (await fs.readdir(descriptor(created.handle))).length === 0) {
          await retireBoundEntry({
            ops,
            parentHandle,
            basename,
            expectedIdentity: created.identity,
            expectedKind: 'directory',
            fallbackCode,
            destroy: async (retirementHandle, retiredName) => {
              const exact = await describeRawEntry(retirementHandle, retiredName);
              if (!exact || exact.kind !== 'directory'
                || !sameIdentity(exact.identity, created.identity)) fail(fallbackCode);
              await fs.rmdir(entry(retirementHandle, retiredName));
            }
          });
        }
      } catch {
        // Preserve any creation whose retained inode or public name is ambiguous.
      }
    }
    await close(created?.handle);
    if (error?.code === 'EEXIST') throw error;
    throw executeError(sanitizeExecuteError(error, fallbackCode).code);
  }
}

/**
 * Evacuate one exact inode into a capability-private namespace before any
 * destructive operation. Callers may wrap the boundary for fault injection;
 * the default operation revalidates after that wrapper runs.
 */
export async function retireBoundEntry({
  ops,
  parentHandle,
  basename,
  expectedIdentity,
  expectedKind,
  assertAuthority = async () => {},
  destroy,
  fallbackCode = 'P5_INSTALL_FAILED'
}) {
  if (!isBasename(basename) || !['file', 'directory'].includes(expectedKind)
    || typeof destroy !== 'function') fail(fallbackCode);
  const perform = async () => {
    await assertAuthority();
    const before = await describeEntry(ops, parentHandle, basename);
    if (!before || before.kind !== expectedKind
      || !sameIdentity(before.identity, expectedIdentity)) fail(fallbackCode);
    const retirement = await createRetirementDirectory(parentHandle, fallbackCode);
    let moved = false;
    try {
      await moveIdentityNoReplace({
        ops,
        sourceHandle: parentHandle,
        sourceName: basename,
        destinationHandle: retirement.handle,
        destinationName: RETIRED_BASENAME,
        expectedIdentity,
        expectedKind,
        moveForward: () => ops.renameNoReplaceBetween(
          parentHandle, basename, retirement.handle, RETIRED_BASENAME
        ),
        moveReverse: () => ops.renameNoReplaceBetween(
          retirement.handle, RETIRED_BASENAME, parentHandle, basename
        )
      });
      const retired = await describeRawEntry(retirement.handle, RETIRED_BASENAME);
      if (!retired || retired.kind !== expectedKind
        || !sameIdentity(retired.identity, expectedIdentity)) fail(fallbackCode);
      moved = true;
      await destroy(retirement.handle, RETIRED_BASENAME);
      if ((await fs.readdir(descriptor(retirement.handle))).length !== 0) fail(fallbackCode);
      await retirement.handle.sync();
      await close(retirement.handle);
      retirement.handle = undefined;
      await fs.rmdir(entry(parentHandle, retirement.basename));
    } catch (error) {
      if (!moved) await removeEmptyRetirement(parentHandle, retirement);
      throw error;
    } finally {
      await close(retirement.handle);
    }
  };
  try {
    if (typeof ops.retireEntry === 'function') {
      await ops.retireEntry(parentHandle, basename, expectedIdentity, perform);
    } else await perform();
  } catch (error) {
    throw executeError(sanitizeExecuteError(error, fallbackCode).code);
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

async function assertRetainedFile(parentHandle, node, code) {
  const before = await node.handle.stat();
  const bytes = Buffer.from(await fs.readFile(descriptor(node.handle)));
  const retained = await node.handle.stat();
  const named = await fs.lstat(entry(parentHandle, node.basename));
  if (!before.isFile() || !retained.isFile() || named.isSymbolicLink() || !named.isFile()
    || !sameIdentity(identity(before), node.identity)
    || !sameIdentity(identity(retained), node.identity)
    || !sameIdentity(identity(named), node.identity)
    || Number(before.size) !== bytes.length
    || Number(retained.size) !== bytes.length
    || (retained.mode & 0o7777) !== (node.mode & 0o7777)) fail(code);
  return bytes;
}

async function assertNamedDirectory(ops, parentHandle, basename, expectedIdentity, code) {
  const first = await ops.lstat(entry(parentHandle, basename));
  const second = await ops.lstat(entry(parentHandle, basename));
  if (first.isSymbolicLink() || !first.isDirectory() || second.isSymbolicLink() || !second.isDirectory()
    || !sameIdentity(identity(first), expectedIdentity)
    || !sameIdentity(identity(second), expectedIdentity)) fail(code);
}

async function assertRawNamedDirectory(parentHandle, basename, expectedIdentity, code) {
  const named = await fs.lstat(entry(parentHandle, basename));
  if (named.isSymbolicLink() || !named.isDirectory()
    || !sameIdentity(identity(named), expectedIdentity)) fail(code);
}

function descriptor(handle) { return `/proc/self/fd/${handle.fd}`; }
function entry(handle, basename) { return `${descriptor(handle)}/${basename}`; }
function dirname(relative) { const index = relative.lastIndexOf('/'); return index < 0 ? '' : relative.slice(0, index); }
function depth(relative) { return relative ? relative.split('/').length : 0; }
function identity(stat) { return { dev: stat.dev, ino: stat.ino }; }
function sameIdentity(left, right) { return left?.dev === right?.dev && left?.ino === right?.ino; }
function sameStrings(left, right) { return left.length === right.length && left.every((value, index) => value === right[index]); }
function isBasename(value) { return typeof value === 'string' && value.length > 0 && value !== '.' && value !== '..' && !value.includes('/') && !value.includes('\\'); }
function isMissing(error) { return error?.code === 'ENOENT' || error?.code === 'ENOTDIR'; }
function fail(code) { throw executeError(code); }
async function close(handle) { try { await handle?.close(); } catch {} }

async function describeEntry(ops, parentHandle, basename) {
  try {
    const stat = await ops.lstat(entry(parentHandle, basename));
    return {
      kind: stat.isSymbolicLink() ? 'symlink'
        : stat.isFile() ? 'file'
          : stat.isDirectory() ? 'directory' : 'other',
      identity: identity(stat)
    };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function describeRawEntry(parentHandle, basename) {
  try {
    const stat = await fs.lstat(entry(parentHandle, basename));
    return {
      kind: stat.isSymbolicLink() ? 'symlink'
        : stat.isFile() ? 'file'
          : stat.isDirectory() ? 'directory' : 'other',
      identity: identity(stat)
    };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function createRetirementDirectory(parentHandle, code) {
  let handle;
  try {
    const createdPath = await fs.mkdtemp(`${descriptor(parentHandle)}/${RETIREMENT_PREFIX}`);
    const basename = createdPath.slice(createdPath.lastIndexOf('/') + 1);
    handle = await fs.open(entry(parentHandle, basename), DIRECTORY_FLAGS);
    const opened = await handle.stat();
    const named = await fs.lstat(entry(parentHandle, basename));
    if (!opened.isDirectory() || named.isSymbolicLink() || !named.isDirectory()
      || !sameIdentity(identity(opened), identity(named))) fail(code);
    return { basename, handle };
  } catch (error) {
    await close(handle);
    throw error;
  }
}

async function removeEmptyRetirement(parentHandle, retirement) {
  try {
    if ((await fs.readdir(descriptor(retirement.handle))).length !== 0) return;
    await close(retirement.handle);
    retirement.handle = undefined;
    await fs.rmdir(entry(parentHandle, retirement.basename));
  } catch {
    // A non-empty or ambiguous retirement namespace is retained fail-closed.
  }
}
