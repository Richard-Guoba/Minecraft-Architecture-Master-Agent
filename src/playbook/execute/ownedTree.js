import { randomBytes } from 'node:crypto';
import nativeFs, { constants } from 'node:fs';
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
          await removeBoundEntry({
            ops,
            parentHandle: parent.handle,
            basename: node.basename,
            expectedIdentity: node.identity,
            expectedKind: 'file',
            assertAuthority: () => assertRetiredChain(dirname(relative), retirementHandle),
            fallbackCode
          });
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
          await removeBoundEntry({
            ops,
            parentHandle: parent.handle,
            basename: node.basename,
            expectedIdentity: node.identity,
            expectedKind: 'directory',
            assertAuthority: async () => {
              await assertRetiredChain(relative, retirementHandle);
              if ((await fs.readdir(descriptor(node.handle))).length !== 0) fail(fallbackCode);
            },
            fallbackCode
          });
          await close(node.handle);
          directories.delete(relative);
        }

        await assertRetiredChain('', retirementHandle);
        if ((await fs.readdir(descriptor(root))).length !== 0) fail(fallbackCode);
        await removeBoundEntry({
          ops,
          parentHandle: retirementHandle,
          basename: RETIRED_BASENAME,
          expectedIdentity,
          expectedKind: 'directory',
          assertAuthority: async () => {
            await assertRetiredChain('', retirementHandle);
            if ((await fs.readdir(descriptor(root))).length !== 0) fail(fallbackCode);
          },
          fallbackCode
        });
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
  let provenance;
  let boundaryResult;
  const createAndOpen = async () => {
    let handle;
    try {
      const target = entry(parentHandle, basename);
      nativeFs.mkdirSync(target, { recursive: false, mode });
      const createdIdentity = identity(nativeFs.lstatSync(target));
      handle = await ops.open(target, DIRECTORY_FLAGS);
      const opened = await handle.stat();
      const named = await ops.lstat(target);
      if (!opened.isDirectory() || named.isSymbolicLink() || !named.isDirectory()
        || !sameIdentity(createdIdentity, identity(opened))
        || !sameIdentity(createdIdentity, identity(named))) fail(fallbackCode);
      provenance = { handle, identity: createdIdentity };
      return provenance;
    } catch (error) {
      await close(handle);
      throw error;
    }
  };
  try {
    boundaryResult = typeof ops.mkdirBound === 'function'
      ? await ops.mkdirBound(parentHandle, basename, createAndOpen)
      : await createAndOpen();
    const createdRetained = await provenance?.handle?.stat();
    const returnedRetained = await boundaryResult?.handle?.stat();
    const named = await ops.lstat(entry(parentHandle, basename));
    if (!createdRetained?.isDirectory?.() || !returnedRetained?.isDirectory?.()
      || named.isSymbolicLink() || !named.isDirectory()
      || !sameIdentity(identity(createdRetained), provenance.identity)
      || !sameIdentity(identity(returnedRetained), provenance.identity)
      || !sameIdentity(boundaryResult.identity, provenance.identity)
      || !sameIdentity(provenance.identity, identity(named))) fail(fallbackCode);
    return boundaryResult;
  } catch (error) {
    if (provenance?.handle) {
      try {
        const retained = await provenance.handle.stat();
        const named = await describeEntry(ops, parentHandle, basename);
        if (retained.isDirectory()
          && sameIdentity(identity(retained), provenance.identity)
          && named?.kind === 'directory'
          && sameIdentity(named.identity, provenance.identity)
          && (await fs.readdir(descriptor(provenance.handle))).length === 0) {
          await removeBoundEntry({
            ops,
            parentHandle,
            basename,
            expectedIdentity: provenance.identity,
            expectedKind: 'directory',
            assertAuthority: async () => {
              const current = await provenance.handle.stat();
              if (!current.isDirectory()
                || !sameIdentity(identity(current), provenance.identity)
                || (await fs.readdir(descriptor(provenance.handle))).length !== 0) {
                fail(fallbackCode);
              }
            },
            fallbackCode,
          });
        }
      } catch {
        // Preserve any creation whose retained inode or public name is ambiguous.
      }
    }
    await close(boundaryResult?.handle);
    await close(provenance?.handle);
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
    const retirement = await createRetirementDirectory(ops, parentHandle, fallbackCode);
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
      await removeBoundEntry({
        ops,
        parentHandle,
        basename: retirement.basename,
        expectedIdentity: retirement.identity,
        expectedKind: 'directory',
        assertAuthority: async () => {
          const retained = await retirement.handle.stat();
          if (!retained.isDirectory()
            || !sameIdentity(identity(retained), retirement.identity)
            || (await fs.readdir(descriptor(retirement.handle))).length !== 0) fail(fallbackCode);
        },
        fallbackCode
      });
      await close(retirement.handle);
      retirement.handle = undefined;
    } catch (error) {
      if (!moved) await removeEmptyRetirement(ops, parentHandle, retirement, fallbackCode);
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

/**
 * Run the final injected removal boundary, then revalidate authority and inode
 * identity immediately beside a non-yielding unlink/rmdir syscall.
 */
export async function removeBoundEntry({
  ops,
  parentHandle,
  basename,
  expectedIdentity,
  expectedKind,
  assertAuthority = async () => {},
  fallbackCode = 'P5_INSTALL_FAILED'
}) {
  if (!isBasename(basename) || !['file', 'directory'].includes(expectedKind)) fail(fallbackCode);
  const perform = async () => {
    await assertAuthority();
    const target = entry(parentHandle, basename);
    const exact = describeRawEntrySync(parentHandle, basename);
    if (!exact || exact.kind !== expectedKind
      || !sameIdentity(exact.identity, expectedIdentity)) fail(fallbackCode);
    if (expectedKind === 'file') nativeFs.unlinkSync(target);
    else nativeFs.rmdirSync(target);
  };
  try {
    if (typeof ops.removeBound === 'function') {
      await ops.removeBound(
        parentHandle, basename, expectedIdentity, expectedKind, perform
      );
    } else await perform();
    if (describeRawEntrySync(parentHandle, basename)) fail(fallbackCode);
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

async function createRetirementDirectory(ops, parentHandle, code) {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const basename = `${RETIREMENT_PREFIX}${randomBytes(16).toString('hex')}`;
    try {
      const made = await createBoundDirectory({
        ops,
        parentHandle,
        basename,
        fallbackCode: code
      });
      return { basename, handle: made.handle, identity: made.identity };
    } catch (error) {
      if (error?.code === 'EEXIST') continue;
      throw error;
    }
  }
  fail(code);
}

async function removeEmptyRetirement(ops, parentHandle, retirement, code) {
  try {
    if ((await fs.readdir(descriptor(retirement.handle))).length !== 0) return;
    await removeBoundEntry({
      ops,
      parentHandle,
      basename: retirement.basename,
      expectedIdentity: retirement.identity,
      expectedKind: 'directory',
      assertAuthority: async () => {
        const retained = await retirement.handle.stat();
        if (!retained.isDirectory()
          || !sameIdentity(identity(retained), retirement.identity)
          || (await fs.readdir(descriptor(retirement.handle))).length !== 0) fail(code);
      },
      fallbackCode: code
    });
    await close(retirement.handle);
    retirement.handle = undefined;
  } catch {
    // A non-empty or ambiguous retirement namespace is retained fail-closed.
  }
}

function describeRawEntrySync(parentHandle, basename) {
  try {
    const stat = nativeFs.lstatSync(entry(parentHandle, basename));
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
