import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { sha256, stableJson } from '../shadow/canonical.js';
import {
  createBoundDirectory,
  openBoundDirectory,
  removeBoundEntry,
  removeOwnedTree,
  retireBoundEntry
} from '../execute/ownedTree.js';
import { moveIdentityNoReplace } from '../execute/storageTransaction.js';
import { p6Error, sanitizeP6Error } from './contracts.js';

const OUTPUT_BASENAME = 'playbook-p6';
const OWNERSHIP_BASENAME = '.p6-owned.json';
const GENERATIONS_BASENAME = 'generations';
const CURRENT_BASENAME = 'current';
const MANIFEST_BASENAME = 'manifest.json';
const PRIVATE_BASENAME = 'private';
const STAGE_PREFIX = '.p6-stage-';
const CURRENT_STAGE_PREFIX = '.p6-current-';
const POINTER_BACKUP_PREFIX = '.p6-pointer-backup-';
const RETIREMENT = /^\.p5-retirement-[a-f0-9]{32}$/u;
const MOVE_BINARY = '/usr/bin/mv';
const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const WRITE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
const HASH = /^[a-f0-9]{64}$/u;
const GENERATION = /^generation-(\d{6})$/u;
const UNSAFE_PATH_CHARACTER = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const KINDS = Object.freeze([
  'cohort', 'reference-renders', 'capture-session', 'minecraft-captures',
  'observations', 'blind-comparison', 'gate'
]);
const ROOT_MARKER = Buffer.from(stableJson({ schema_version: 1, kind: 'p6-output-root' }));
const KIND_MARKER = Buffer.from(stableJson({ schema_version: 1, kind: 'p6-output-kind' }));
const GENERATIONS_MARKER = Buffer.from(stableJson({ schema_version: 1, kind: 'p6-generations' }));
const GENERATION_MARKER = Buffer.from(stableJson({ schema_version: 1, kind: 'p6-generation' }));
const PRIVATE_MARKER = Buffer.from(stableJson({ schema_version: 1, kind: 'p6-private-generation' }));
const AUTHORITIES = new WeakMap();
let sequence = 0;

export async function createP6Run({ runDir, fsImpl } = {}) {
  if (!isSafeAbsolutePath(runDir)) throw p6Error('P6_AUTHORITY_INVALID');
  const ops = fsOperations(fsImpl);
  let absoluteAuthority;
  let parentHandle;
  let runHandle;
  let p6;
  let marker;
  try {
    absoluteAuthority = await openAbsoluteDirectory(ops, runDir);
    ({ parentHandle, runHandle } = absoluteAuthority);
    p6 = await createBoundDirectory({
      ops,
      parentHandle: runHandle,
      basename: OUTPUT_BASENAME,
      fallbackCode: 'P6_AUTHORITY_INVALID'
    });
    marker = await createRegularFile({
      ops, parentHandle: p6.handle, basename: OWNERSHIP_BASENAME,
      bytes: ROOT_MARKER, mode: 0o400
    });
    await p6.handle.sync();
    const internal = makeInternal({
      ops, parentHandle, runHandle, p6Handle: p6.handle,
      runBasename: path.basename(runDir), runDir,
      p6Dir: path.join(runDir, OUTPUT_BASENAME),
      absoluteAuthority,
      parentIdentity: identity(await parentHandle.stat()),
      runIdentity: identity(await runHandle.stat()),
      p6Identity: p6.identity,
      markerIdentity: marker.identity
    });
    await close(marker.handle);
    marker.handle = undefined;
    await assertP6Internal(internal, ops);
    return Object.freeze({ p6Dir: OUTPUT_BASENAME, authority: createAuthority(internal) });
  } catch (error) {
    await close(marker?.handle);
    if (p6?.identity && marker?.identity) {
      try {
        await removeOwnedTree({
          ops, parentHandle: runHandle, basename: OUTPUT_BASENAME,
          expectedIdentity: p6.identity,
          expectedFiles: { [OWNERSHIP_BASENAME]: ROOT_MARKER },
          expectedIdentities: {
            [OWNERSHIP_BASENAME]: marker.identity
          },
          requireComplete: true,
          verifyBytes: true,
          fallbackCode: 'P6_AUTHORITY_INVALID'
        });
      } catch {}
    }
    await close(p6?.handle);
    await closeAbsoluteDirectory(absoluteAuthority);
    throw publicError(error);
  }
}

export async function admitP6Run({ p6Dir, fsImpl } = {}) {
  if (!isSafeAbsolutePath(p6Dir) || path.basename(p6Dir) !== OUTPUT_BASENAME) {
    throw p6Error('P6_AUTHORITY_INVALID');
  }
  const ops = fsOperations(fsImpl);
  const runDir = path.dirname(p6Dir);
  let absoluteAuthority;
  let parentHandle;
  let runHandle;
  let p6Handle;
  try {
    absoluteAuthority = await openAbsoluteDirectory(ops, runDir);
    ({ parentHandle, runHandle } = absoluteAuthority);
    const p6Stat = await ops.lstat(entry(runHandle, OUTPUT_BASENAME));
    if (p6Stat.isSymbolicLink() || !p6Stat.isDirectory()) fail();
    const p6Identity = identity(p6Stat);
    p6Handle = await openBoundDirectory(
      ops, runHandle, OUTPUT_BASENAME, p6Identity, 'P6_AUTHORITY_INVALID'
    );
    const marker = await readRegularFile(ops, p6Handle, OWNERSHIP_BASENAME);
    if (!marker.bytes.equals(ROOT_MARKER)) fail();
    const internal = makeInternal({
      ops, parentHandle, runHandle, p6Handle,
      runBasename: path.basename(runDir), runDir, p6Dir,
      absoluteAuthority,
      parentIdentity: identity(await parentHandle.stat()),
      runIdentity: identity(await runHandle.stat()),
      p6Identity,
      markerIdentity: marker.identity
    });
    await assertP6Internal(internal, ops);
    await validateExistingP6Tree(internal, ops);
    return createAuthority(internal);
  } catch (error) {
    await close(p6Handle);
    await closeAbsoluteDirectory(absoluteAuthority);
    throw publicError(error);
  }
}

export async function readP6InputAuthority({ authority, relativePath } = {}) {
  const internal = authorityInternal(authority);
  const ops = fsOperations(internal.ops.source);
  try {
    await assertP6Internal(internal, ops);
    const snapshot = await snapshotRelativeFile(ops, internal.runHandle, relativePath);
    await assertP6Internal(internal, ops);
    return snapshot;
  } catch (error) {
    throw publicError(error);
  }
}

export async function publishP6Generation({ authority, kind, files, fsImpl } = {}) {
  const internal = authorityInternal(authority);
  if (!KINDS.includes(kind)) throw p6Error('P6_AUTHORITY_INVALID');
  const normalized = normalizeFiles(kind, files);
  return (async () => {
    const ops = fsOperations(fsImpl ?? internal.ops.source);
    let tree;
    let stage;
    let installed = false;
    let generationName;
    try {
      await assertP6Internal(internal, ops);
      await validateExistingP6Tree(internal, ops);
      tree = await openOrCreateKindTree(internal, ops, kind);
      await assertKindTree(internal, ops, tree, { allowedGenerationStages: [] });
      generationName = nextGenerationName(await ops.readdir(descriptor(tree.generationsHandle)));
      stage = await createGenerationStage(internal, ops, tree, kind, generationName, normalized);
      try {
        await moveIdentityNoReplace({
          ops,
          sourceHandle: tree.generationsHandle,
          sourceName: stage.basename,
          destinationHandle: tree.generationsHandle,
          destinationName: generationName,
          expectedIdentity: stage.identity,
          expectedKind: 'directory',
          moveForward: () => ops.renameNoReplace(
            tree.generationsHandle, stage.basename, generationName
          ),
          moveReverse: () => ops.renameNoReplace(
            tree.generationsHandle, generationName, stage.basename
          ),
          beforeMove: () => assertP6Internal(internal, ops),
          afterMove: async () => {
            await tree.generationsHandle.sync();
            await assertP6Internal(internal, ops);
          }
        });
        installed = true;
      } catch (error) {
        installed = await namedEntryHasIdentity(
          ops, tree.generationsHandle, generationName, 'directory', stage.identity
        );
        throw error;
      }
      const pointerBytes = Buffer.from(stableJson({
        schema_version: 1,
        kind,
        generation: generationName,
        manifest_sha256: stage.manifestSha256
      }));
      await replaceCurrentPointer({ internal, ops, tree, kind, bytes: pointerBytes });
      await verifyGeneration(internal, ops, tree, kind, generationName, {
        expectedManifestSha256: stage.manifestSha256
      });
      return Object.freeze({
        status: generationName === 'generation-000001' ? 'created' : 'replaced',
        kind,
        generation: generationName,
        manifest_sha256: stage.manifestSha256
      });
    } catch (error) {
      if (stage?.identity) {
        const basename = installed ? generationName : stage.basename;
        try {
          await cleanupOwnedGenerationStage({ ops, tree, stage, basename });
        } catch {}
      }
      throw publicError(error);
    } finally {
      await closeGenerationStage(stage);
      await closeKindTree(tree);
    }
  })();
}

export async function readCurrentP6Generation({ authority, kind, fsImpl } = {}) {
  const internal = authorityInternal(authority);
  if (!KINDS.includes(kind)) throw p6Error('P6_AUTHORITY_INVALID');
  const ops = fsOperations(fsImpl ?? internal.ops.source);
  let tree;
  try {
    await assertP6Internal(internal, ops);
    tree = await openKindTree(internal, ops, kind);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const parsed = await validateKindHistory(internal, ops, tree, {
          allowPointerJournals: true
        });
        if (!parsed) fail();
        const generation = await verifyGeneration(
          internal, ops, tree, kind, parsed.generation,
          { expectedManifestSha256: parsed.manifest_sha256 }
        );
        await assertP6Internal(internal, ops);
        return Object.freeze({
          kind,
          generation: parsed.generation,
          manifest_sha256: parsed.manifest_sha256,
          manifest: generation.manifest,
          files: Object.freeze(generation.files),
          private_file_count: generation.privateFileCount
        });
      } catch (error) {
        if (attempt === 7) throw error;
      }
    }
    fail();
  } catch (error) {
    throw publicError(error);
  } finally {
    await closeKindTree(tree);
  }
}

// Internal cross-module admission helpers. They preserve the P6 capability
// check while returning the same path-free snapshot contract as the public
// run-relative reader.
export async function assertP6RunAuthority(authority) {
  const internal = authorityInternal(authority);
  try { await assertP6Internal(internal, internal.ops); }
  catch (error) { throw publicError(error); }
}

export async function readExternalP6InputAuthority({ authority, rootDir, relativePath } = {}) {
  const internal = authorityInternal(authority);
  if (!isSafeAbsolutePath(rootDir)) throw p6Error('P6_AUTHORITY_INVALID');
  const ops = fsOperations(internal.ops.source);
  let absoluteAuthority;
  try {
    await assertP6Internal(internal, ops);
    absoluteAuthority = await openAbsoluteDirectory(ops, rootDir);
    const snapshot = await snapshotRelativeFile(
      ops, absoluteAuthority.runHandle, relativePath
    );
    await assertAbsoluteDirectory(ops, absoluteAuthority);
    await assertP6Internal(internal, ops);
    return snapshot;
  } catch (error) {
    throw publicError(error);
  } finally {
    await closeAbsoluteDirectory(absoluteAuthority);
  }
}

async function openOrCreateKindTree(internal, ops, kind) {
  let kindHandle;
  let generationsHandle;
  try {
    await assertP6Internal(internal, ops);
    const kindNode = await openOrCreateMarkedDirectory({
      ops, parentHandle: internal.p6Handle, basename: kind,
      markerBytes: KIND_MARKER
    });
    kindHandle = kindNode.handle;
    const generationsNode = await openOrCreateMarkedDirectory({
      ops, parentHandle: kindHandle, basename: GENERATIONS_BASENAME,
      markerBytes: GENERATIONS_MARKER
    });
    generationsHandle = generationsNode.handle;
    return {
      kind, kindHandle, kindIdentity: kindNode.identity,
      generationsHandle, generationsIdentity: generationsNode.identity
    };
  } catch (error) {
    await close(generationsHandle);
    await close(kindHandle);
    throw error;
  }
}

async function openKindTree(internal, ops, kind) {
  let kindHandle;
  let generationsHandle;
  try {
    const kindStat = await ops.lstat(entry(internal.p6Handle, kind));
    if (kindStat.isSymbolicLink() || !kindStat.isDirectory()) fail();
    const kindIdentity = identity(kindStat);
    kindHandle = await openBoundDirectory(
      ops, internal.p6Handle, kind, kindIdentity, 'P6_AUTHORITY_INVALID'
    );
    const kindMarker = await readRegularFile(ops, kindHandle, OWNERSHIP_BASENAME);
    if (!kindMarker.bytes.equals(KIND_MARKER)) fail();
    const generationsStat = await ops.lstat(entry(kindHandle, GENERATIONS_BASENAME));
    if (generationsStat.isSymbolicLink() || !generationsStat.isDirectory()) fail();
    const generationsIdentity = identity(generationsStat);
    generationsHandle = await openBoundDirectory(
      ops, kindHandle, GENERATIONS_BASENAME,
      generationsIdentity, 'P6_AUTHORITY_INVALID'
    );
    const generationsMarker = await readRegularFile(
      ops, generationsHandle, OWNERSHIP_BASENAME
    );
    if (!generationsMarker.bytes.equals(GENERATIONS_MARKER)) fail();
    return { kind, kindHandle, kindIdentity, generationsHandle, generationsIdentity };
  } catch (error) {
    await close(generationsHandle);
    await close(kindHandle);
    throw error;
  }
}

async function createGenerationStage(internal, ops, tree, kind, generationName, normalized) {
  const basename = `${STAGE_PREFIX}${process.pid}-${++sequence}-${randomBytes(8).toString('hex')}`;
  const created = await createBoundDirectory({
    ops, parentHandle: tree.generationsHandle, basename,
    fallbackCode: 'P6_AUTHORITY_INVALID'
  });
  const stage = {
    basename,
    handle: created.handle,
    identity: created.identity,
    fileBytes: {},
    identities: {},
    privateHandle: undefined,
    privateIdentity: undefined
  };
  try {
    const marker = await createRegularFile({
      ops, parentHandle: stage.handle, basename: OWNERSHIP_BASENAME,
      bytes: GENERATION_MARKER, mode: 0o400
    });
    stage.fileBytes[OWNERSHIP_BASENAME] = GENERATION_MARKER;
    stage.identities[OWNERSHIP_BASENAME] = marker.identity;
    stage.markerBound = true;
    await close(marker.handle);
    for (const [name, bytes] of Object.entries(normalized.publicFiles)) {
      const file = await createRegularFile({ ops, parentHandle: stage.handle, basename: name, bytes, mode: 0o400 });
      stage.fileBytes[name] = bytes;
      stage.identities[name] = file.identity;
      await close(file.handle);
    }
    const manifest = {
      schema_version: 1,
      kind,
      generation: generationName,
      managed_paths: Object.keys(normalized.publicFiles),
      artifact_hashes: Object.fromEntries(
        Object.entries(normalized.publicFiles).map(([name, bytes]) => [name, sha256(bytes)])
      )
    };
    const manifestBytes = Buffer.from(stableJson(manifest));
    const manifestFile = await createRegularFile({
      ops, parentHandle: stage.handle, basename: MANIFEST_BASENAME,
      bytes: manifestBytes, mode: 0o400
    });
    stage.fileBytes[MANIFEST_BASENAME] = manifestBytes;
    stage.identities[MANIFEST_BASENAME] = manifestFile.identity;
    stage.manifestSha256 = sha256(manifestBytes);
    await close(manifestFile.handle);

    if (Object.keys(normalized.privateFiles).length > 0) {
      const privateNode = await createBoundDirectory({
        ops, parentHandle: stage.handle, basename: PRIVATE_BASENAME,
        fallbackCode: 'P6_AUTHORITY_INVALID'
      });
      stage.privateHandle = privateNode.handle;
      stage.privateIdentity = privateNode.identity;
      stage.identities[PRIVATE_BASENAME] = privateNode.identity;
      const privateMarker = await createRegularFile({
        ops, parentHandle: stage.privateHandle, basename: OWNERSHIP_BASENAME,
        bytes: PRIVATE_MARKER, mode: 0o400
      });
      stage.fileBytes[`${PRIVATE_BASENAME}/${OWNERSHIP_BASENAME}`] = PRIVATE_MARKER;
      stage.identities[`${PRIVATE_BASENAME}/${OWNERSHIP_BASENAME}`] = privateMarker.identity;
      await close(privateMarker.handle);
      for (const [name, bytes] of Object.entries(normalized.privateFiles)) {
        const file = await createRegularFile({ ops, parentHandle: stage.privateHandle, basename: name, bytes, mode: 0o400 });
        stage.fileBytes[`${PRIVATE_BASENAME}/${name}`] = bytes;
        stage.identities[`${PRIVATE_BASENAME}/${name}`] = file.identity;
        await close(file.handle);
      }
      const privateManifestBytes = Buffer.from(stableJson({
        schema_version: 1,
        kind: 'p6-private-generation',
        managed_paths: Object.keys(normalized.privateFiles),
        artifact_hashes: Object.fromEntries(
          Object.entries(normalized.privateFiles).map(([name, bytes]) => [name, sha256(bytes)])
        )
      }));
      const privateManifest = await createRegularFile({
        ops, parentHandle: stage.privateHandle, basename: MANIFEST_BASENAME,
        bytes: privateManifestBytes, mode: 0o400
      });
      stage.fileBytes[`${PRIVATE_BASENAME}/${MANIFEST_BASENAME}`] = privateManifestBytes;
      stage.identities[`${PRIVATE_BASENAME}/${MANIFEST_BASENAME}`] = privateManifest.identity;
      await close(privateManifest.handle);
      await stage.privateHandle.sync();
    }
    await stage.handle.sync();
    await tree.generationsHandle.sync();
    await assertP6Internal(internal, ops);
    return stage;
  } catch (error) {
    try { await cleanupOwnedGenerationStage({ ops, tree, stage, basename }); } catch {}
    await closeGenerationStage(stage);
    throw error;
  }
}

async function replaceCurrentPointer({ internal, ops, tree, kind, bytes }) {
  const stageName = `${CURRENT_STAGE_PREFIX}${process.pid}-${++sequence}-${randomBytes(8).toString('hex')}`;
  const stageFile = await createRegularFile({
    ops, parentHandle: tree.kindHandle, basename: stageName,
    bytes, mode: 0o400
  });
  let current;
  let backupName;
  let installed = false;
  try {
    current = await readRegularFile(ops, tree.kindHandle, CURRENT_BASENAME, { allowMissing: true });
    if (current) {
      backupName = `${POINTER_BACKUP_PREFIX}${process.pid}-${++sequence}-${randomBytes(8).toString('hex')}`;
      await moveIdentityNoReplace({
        ops,
        sourceHandle: tree.kindHandle,
        sourceName: CURRENT_BASENAME,
        destinationHandle: tree.kindHandle,
        destinationName: backupName,
        expectedIdentity: current.identity,
        expectedKind: 'file',
        moveForward: () => ops.renameNoReplace(tree.kindHandle, CURRENT_BASENAME, backupName),
        moveReverse: () => ops.renameNoReplace(tree.kindHandle, backupName, CURRENT_BASENAME),
        beforeMove: () => assertP6Internal(internal, ops)
      });
    }
    try {
      await moveIdentityNoReplace({
        ops,
        sourceHandle: tree.kindHandle,
        sourceName: stageName,
        destinationHandle: tree.kindHandle,
        destinationName: CURRENT_BASENAME,
        expectedIdentity: stageFile.identity,
        expectedKind: 'file',
        moveForward: () => ops.renameNoReplace(tree.kindHandle, stageName, CURRENT_BASENAME),
        moveReverse: () => ops.renameNoReplace(tree.kindHandle, CURRENT_BASENAME, stageName),
        beforeMove: () => assertP6Internal(internal, ops),
        afterMove: () => tree.kindHandle.sync()
      });
      installed = true;
    } catch (error) {
      installed = await namedEntryHasIdentity(
        ops, tree.kindHandle, CURRENT_BASENAME, 'file', stageFile.identity
      );
      throw error;
    }
    const installedRead = await readRegularFile(ops, tree.kindHandle, CURRENT_BASENAME);
    if (installedRead.sha256 !== sha256(bytes)) fail();
    if (backupName) await deleteBoundFile(ops, tree.kindHandle, backupName, current.identity);
    await tree.kindHandle.sync();
    await assertP6Internal(internal, ops);
  } catch (error) {
    if (installed) {
      try { await deleteBoundFile(ops, tree.kindHandle, CURRENT_BASENAME, stageFile.identity); }
      catch {}
    } else {
      try { await deleteBoundFile(ops, tree.kindHandle, stageName, stageFile.identity); }
      catch {}
    }
    if (backupName) {
      try {
        await moveIdentityNoReplace({
          ops,
          sourceHandle: tree.kindHandle,
          sourceName: backupName,
          destinationHandle: tree.kindHandle,
          destinationName: CURRENT_BASENAME,
          expectedIdentity: current.identity,
          expectedKind: 'file',
          moveForward: () => ops.renameNoReplace(tree.kindHandle, backupName, CURRENT_BASENAME),
          moveReverse: () => ops.renameNoReplace(tree.kindHandle, CURRENT_BASENAME, backupName)
        });
      } catch {}
    }
    throw error;
  } finally {
    await close(stageFile.handle);
  }
}

async function deleteBoundFile(ops, parentHandle, basename, expectedIdentity) {
  await retireBoundEntry({
    ops,
    parentHandle,
    basename,
    expectedIdentity,
    expectedKind: 'file',
    fallbackCode: 'P6_AUTHORITY_INVALID',
    assertAuthority: async () => {
      const retained = await readRegularFile(ops, parentHandle, basename);
      if (!sameIdentity(retained.identity, expectedIdentity)) fail();
    },
    destroy: async (retirementHandle, retiredBasename) => {
      const retired = await readRegularFile(ops, retirementHandle, retiredBasename);
      if (!sameIdentity(retired.identity, expectedIdentity)) fail();
      await removeBoundEntry({
        ops,
        parentHandle: retirementHandle,
        basename: retiredBasename,
        expectedIdentity,
        expectedKind: 'file',
        fallbackCode: 'P6_AUTHORITY_INVALID'
      });
    }
  });
  await parentHandle.sync();
}

async function verifyGeneration(internal, ops, tree, kind, generationName, { expectedManifestSha256 }) {
  if (!GENERATION.test(generationName)) fail();
  const stat = await ops.lstat(entry(tree.generationsHandle, generationName));
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail();
  const generationIdentity = identity(stat);
  const handle = await openBoundDirectory(
    ops, tree.generationsHandle, generationName,
    generationIdentity, 'P6_AUTHORITY_INVALID'
  );
  let privateHandle;
  try {
    const marker = await readRegularFile(ops, handle, OWNERSHIP_BASENAME);
    if (!marker.bytes.equals(GENERATION_MARKER)) fail();
    const manifestFile = await readRegularFile(ops, handle, MANIFEST_BASENAME);
    if (expectedManifestSha256 && manifestFile.sha256 !== expectedManifestSha256) fail();
    const manifest = parseManifest(manifestFile.bytes, kind, generationName);
    const expectedEntries = [OWNERSHIP_BASENAME, MANIFEST_BASENAME, ...manifest.managed_paths];
    const names = (await ops.readdir(descriptor(handle))).sort();
    const hasPrivate = names.includes(PRIVATE_BASENAME);
    if (!sameStrings(names, [...expectedEntries, ...(hasPrivate ? [PRIVATE_BASENAME] : [])].sort())) fail();
    const files = {};
    for (const name of manifest.managed_paths) {
      const file = await readRegularFile(ops, handle, name);
      if (file.sha256 !== manifest.artifact_hashes[name]) fail();
      files[name] = Buffer.from(file.bytes);
    }
    let privateFileCount = 0;
    if (hasPrivate) {
      if (kind !== 'blind-comparison') fail();
      const privateStat = await ops.lstat(entry(handle, PRIVATE_BASENAME));
      if (privateStat.isSymbolicLink() || !privateStat.isDirectory()) fail();
      privateHandle = await openBoundDirectory(
        ops, handle, PRIVATE_BASENAME, identity(privateStat), 'P6_AUTHORITY_INVALID'
      );
      const privateMarker = await readRegularFile(ops, privateHandle, OWNERSHIP_BASENAME);
      if (!privateMarker.bytes.equals(PRIVATE_MARKER)) fail();
      const privateManifestFile = await readRegularFile(ops, privateHandle, MANIFEST_BASENAME);
      const privateManifest = parsePrivateManifest(privateManifestFile.bytes);
      const privateNames = (await ops.readdir(descriptor(privateHandle))).sort();
      if (!sameStrings(privateNames, [OWNERSHIP_BASENAME, MANIFEST_BASENAME, ...privateManifest.managed_paths].sort())) fail();
      for (const name of privateManifest.managed_paths) {
        const file = await readRegularFile(ops, privateHandle, name);
        if (file.sha256 !== privateManifest.artifact_hashes[name]) fail();
      }
      privateFileCount = privateManifest.managed_paths.length;
    }
    await assertP6Internal(internal, ops);
    return { manifest: Object.freeze(manifest), files, privateFileCount };
  } finally {
    await close(privateHandle);
    await close(handle);
  }
}

async function cleanupOwnedGenerationStage({ ops, tree, stage, basename }) {
  if (!tree?.generationsHandle || !stage?.identity || !stage.markerBound) return;
  await close(stage.privateHandle);
  stage.privateHandle = undefined;
  await removeOwnedTree({
    ops,
    parentHandle: tree.generationsHandle,
    basename,
    expectedIdentity: stage.identity,
    expectedFiles: stage.fileBytes,
    expectedIdentities: stage.identities,
    requireComplete: true,
    verifyBytes: true,
    fallbackCode: 'P6_AUTHORITY_INVALID'
  });
}

async function validateExistingP6Tree(internal, ops) {
  await assertP6Internal(internal, ops);
  const kinds = (await ops.readdir(descriptor(internal.p6Handle)))
    .filter(name => name !== OWNERSHIP_BASENAME)
    .sort();
  for (const kind of kinds) {
    let tree;
    try {
      tree = await openKindTree(internal, ops, kind);
      await recoverKindPointer(internal, ops, tree);
      await validateKindHistory(internal, ops, tree, { allowPointerJournals: false });
    } finally {
      await closeKindTree(tree);
    }
  }
}

async function recoverKindPointer(internal, ops, tree) {
  const names = (await ops.readdir(descriptor(tree.kindHandle))).sort();
  const stages = names.filter(name => name.startsWith(CURRENT_STAGE_PREFIX));
  const backups = names.filter(name => name.startsWith(POINTER_BACKUP_PREFIX));
  const retirements = names.filter(name => RETIREMENT.test(name));
  if (stages.length > 1 || backups.length > 1 || retirements.length > 1) fail();
  const current = await readRegularFile(
    ops, tree.kindHandle, CURRENT_BASENAME, { allowMissing: true }
  );
  const stage = stages.length === 1
    ? await readRegularFile(ops, tree.kindHandle, stages[0]) : null;
  const backup = backups.length === 1
    ? await readRegularFile(ops, tree.kindHandle, backups[0]) : null;
  const retirement = retirements.length === 1
    ? await inspectPointerRetirement(internal, ops, tree, retirements[0]) : null;
  const parsed = new Map();
  for (const [label, pointer] of [
    ['current', current], ['stage', stage], ['backup', backup],
    ['retired', retirement?.pointer]
  ]) {
    if (!pointer) continue;
    try {
      const value = parsePointer(pointer.bytes, tree.kind);
      await verifyGeneration(internal, ops, tree, tree.kind, value.generation, {
        expectedManifestSha256: value.manifest_sha256
      });
      parsed.set(label, value);
    } catch (error) {
      if (!['stage', 'retired'].includes(label)) throw error;
    }
  }
  if (retirement && !current) fail();
  if (retirement) await removePointerRetirement(ops, tree, retirement);

  if (!current) {
    const validStage = parsed.has('stage') ? stage : null;
    const source = validStage ?? backup;
    const sourceName = validStage ? stages[0] : backups[0];
    if (source) {
      await moveIdentityNoReplace({
        ops,
        sourceHandle: tree.kindHandle,
        sourceName,
        destinationHandle: tree.kindHandle,
        destinationName: CURRENT_BASENAME,
        expectedIdentity: source.identity,
        expectedKind: 'file',
        moveForward: () => ops.renameNoReplace(
          tree.kindHandle, sourceName, CURRENT_BASENAME
        ),
        moveReverse: () => ops.renameNoReplace(
          tree.kindHandle, CURRENT_BASENAME, sourceName
        ),
        beforeMove: () => assertP6Internal(internal, ops)
      });
      if (validStage) stages.length = 0;
      else backups.length = 0;
    } else {
      if (stage) {
        await deleteBoundFile(ops, tree.kindHandle, stages[0], stage.identity);
        stages.length = 0;
      }
      const generationNames = (await ops.readdir(descriptor(tree.generationsHandle)))
        .filter(name => name !== OWNERSHIP_BASENAME);
      if (generationNames.length === 0 && !stage) return;
      if (generationNames.length !== 1 || !GENERATION.test(generationNames[0])) fail();
      const generation = await verifyGeneration(
        internal, ops, tree, tree.kind, generationNames[0], {}
      );
      const manifestSha256 = sha256(Buffer.from(stableJson(generation.manifest)));
      await replaceCurrentPointer({
        internal,
        ops,
        tree,
        kind: tree.kind,
        bytes: Buffer.from(stableJson({
          schema_version: 1,
          kind: tree.kind,
          generation: generationNames[0],
          manifest_sha256: manifestSha256
        }))
      });
    }
  }
  for (const [name, pointer] of [
    [stages[0], stage], [backups[0], backup]
  ]) {
    if (name && pointer) await deleteBoundFile(
      ops, tree.kindHandle, name, pointer.identity
    );
  }
  await tree.kindHandle.sync();
  await assertP6Internal(internal, ops);
}

async function inspectPointerRetirement(internal, ops, tree, basename) {
  const stat = await ops.lstat(entry(tree.kindHandle, basename));
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail();
  const retirementIdentity = identity(stat);
  const handle = await openBoundDirectory(
    ops, tree.kindHandle, basename, retirementIdentity, 'P6_AUTHORITY_INVALID'
  );
  try {
    const names = (await ops.readdir(descriptor(handle))).sort();
    if (names.length > 1 || names.some(name => name !== 'owned-entry')) fail();
    const pointer = names.length === 1
      ? await readRegularFile(ops, handle, 'owned-entry') : null;
    await assertP6Internal(internal, ops);
    return { basename, identity: retirementIdentity, pointer };
  } finally {
    await close(handle);
  }
}

async function removePointerRetirement(ops, tree, retirement) {
  const handle = await openBoundDirectory(
    ops, tree.kindHandle, retirement.basename,
    retirement.identity, 'P6_AUTHORITY_INVALID'
  );
  try {
    const names = (await ops.readdir(descriptor(handle))).sort();
    if (retirement.pointer) {
      if (!sameStrings(names, ['owned-entry'])) fail();
    } else if (names.length !== 0) fail();
    if (retirement.pointer) await removeBoundEntry({
      ops,
      parentHandle: handle,
      basename: 'owned-entry',
      expectedIdentity: retirement.pointer.identity,
      expectedKind: 'file',
      fallbackCode: 'P6_AUTHORITY_INVALID'
    });
    if ((await ops.readdir(descriptor(handle))).length !== 0) fail();
    await removeBoundEntry({
      ops,
      parentHandle: tree.kindHandle,
      basename: retirement.basename,
      expectedIdentity: retirement.identity,
      expectedKind: 'directory',
      fallbackCode: 'P6_AUTHORITY_INVALID'
    });
  } finally {
    await close(handle);
  }
}

async function validateKindHistory(internal, ops, tree, { allowPointerJournals }) {
  await assertKindTree(internal, ops, tree, {
    allowedGenerationStages: [], allowPointerJournals
  });
  const names = (await ops.readdir(descriptor(tree.generationsHandle))).sort();
  const generations = names.filter(name => name !== OWNERSHIP_BASENAME);
  const retirementNames = (await ops.readdir(descriptor(tree.kindHandle)))
    .filter(name => RETIREMENT.test(name));
  if (retirementNames.length > 1) fail();
  if (retirementNames.length === 1) {
    if (!allowPointerJournals) fail();
    const retirement = await inspectPointerRetirement(
      internal, ops, tree, retirementNames[0]
    );
    if (retirement.pointer) {
      const retired = parsePointer(retirement.pointer.bytes, tree.kind);
      await verifyGeneration(internal, ops, tree, tree.kind, retired.generation, {
        expectedManifestSha256: retired.manifest_sha256
      });
    }
  }
  const pointer = await readLogicalCurrentPointer(ops, tree, { allowPointerJournals });
  if (generations.length === 0) {
    if (pointer) fail();
    return null;
  }
  if (!pointer || !generations.includes(pointer.generation)) fail();
  for (const generation of generations) {
    await verifyGeneration(internal, ops, tree, tree.kind, generation, {
      expectedManifestSha256: generation === pointer.generation
        ? pointer.manifest_sha256 : undefined
    });
  }
  return pointer;
}

async function readLogicalCurrentPointer(ops, tree, { allowPointerJournals }) {
  const names = (await ops.readdir(descriptor(tree.kindHandle))).sort();
  const currentStages = names.filter(name => name.startsWith(CURRENT_STAGE_PREFIX));
  const backups = names.filter(name => name.startsWith(POINTER_BACKUP_PREFIX));
  if (currentStages.length > 1 || backups.length > 1) fail();
  const current = await readRegularFile(
    ops, tree.kindHandle, CURRENT_BASENAME, { allowMissing: true }
  );
  if (current) return parsePointer(current.bytes, tree.kind);
  if (!allowPointerJournals || backups.length !== 1) return null;
  const backup = await readRegularFile(ops, tree.kindHandle, backups[0]);
  return parsePointer(backup.bytes, tree.kind);
}

async function openOrCreateMarkedDirectory({ ops, parentHandle, basename, markerBytes }) {
  try {
    const stat = await ops.lstat(entry(parentHandle, basename));
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail();
    const nodeIdentity = identity(stat);
    const handle = await openBoundDirectory(
      ops, parentHandle, basename, nodeIdentity, 'P6_AUTHORITY_INVALID'
    );
    try {
      const marker = await readRegularFile(ops, handle, OWNERSHIP_BASENAME);
      if (!marker.bytes.equals(markerBytes)) fail();
      return { handle, identity: nodeIdentity };
    } catch (error) {
      await close(handle);
      throw error;
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const made = await createBoundDirectory({
    ops, parentHandle, basename, fallbackCode: 'P6_AUTHORITY_INVALID'
  });
  try {
    const marker = await createRegularFile({
      ops, parentHandle: made.handle, basename: OWNERSHIP_BASENAME,
      bytes: markerBytes, mode: 0o400
    });
    await close(marker.handle);
    await made.handle.sync();
    return made;
  } catch (error) {
    await close(made.handle);
    throw error;
  }
}

async function assertP6Internal(internal, ops) {
  if (internal.closed) fail();
  await assertAbsoluteDirectory(ops, internal.absoluteAuthority);
  const p6 = await internal.p6Handle.stat();
  if (!p6.isDirectory() || !sameIdentity(identity(p6), internal.p6Identity)) fail();
  await assertNamedDirectory(ops, internal.runHandle, OUTPUT_BASENAME, internal.p6Identity);
  const marker = await readRegularFile(ops, internal.p6Handle, OWNERSHIP_BASENAME);
  if (!marker.bytes.equals(ROOT_MARKER) || !sameIdentity(marker.identity, internal.markerIdentity)) fail();
  const rootEntries = (await ops.readdir(descriptor(internal.p6Handle))).sort();
  if (rootEntries.some(name => name !== OWNERSHIP_BASENAME && !KINDS.includes(name))) fail();
  for (const name of rootEntries.filter(name => name !== OWNERSHIP_BASENAME)) {
    const stat = await ops.lstat(entry(internal.p6Handle, name));
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail();
  }
}

async function assertKindTree(internal, ops, tree, {
  allowedGenerationStages,
  allowPointerJournals = false
}) {
  await assertP6Internal(internal, ops);
  await assertNamedDirectory(ops, internal.p6Handle, tree.kind, tree.kindIdentity);
  await assertNamedDirectory(
    ops, tree.kindHandle, GENERATIONS_BASENAME, tree.generationsIdentity
  );
  const kindMarker = await readRegularFile(ops, tree.kindHandle, OWNERSHIP_BASENAME);
  if (!kindMarker.bytes.equals(KIND_MARKER)) fail();
  const generationMarker = await readRegularFile(
    ops, tree.generationsHandle, OWNERSHIP_BASENAME
  );
  if (!generationMarker.bytes.equals(GENERATIONS_MARKER)) fail();
  const kindEntries = (await ops.readdir(descriptor(tree.kindHandle))).sort();
  for (const name of kindEntries) {
    if ([OWNERSHIP_BASENAME, GENERATIONS_BASENAME, CURRENT_BASENAME].includes(name)) continue;
    if (!allowPointerJournals || !isPointerJournalBasename(name)) fail();
    const stat = await ops.lstat(entry(tree.kindHandle, name));
    const expectedDirectory = RETIREMENT.test(name);
    if (stat.isSymbolicLink()
      || (expectedDirectory ? !stat.isDirectory() : !stat.isFile())) fail();
  }
  const generationEntries = (await ops.readdir(descriptor(tree.generationsHandle))).sort();
  for (const name of generationEntries) {
    if (name === OWNERSHIP_BASENAME || GENERATION.test(name) || allowedGenerationStages.includes(name)) continue;
    fail();
  }
}

async function createRegularFile({ ops, parentHandle, basename, bytes, mode }) {
  if (!isPlainBasename(basename) || !Buffer.isBuffer(bytes)) fail();
  let handle;
  try {
    handle = await ops.open(entry(parentHandle, basename), WRITE_FLAGS, 0o600);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1) fail();
    const openedIdentity = identity(opened);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.chmod(mode);
    await handle.sync();
    const retained = await handle.stat();
    const named = await ops.lstat(entry(parentHandle, basename));
    if (!retained.isFile() || retained.nlink !== 1 || Number(retained.size) !== bytes.length
      || (retained.mode & 0o777) !== mode
      || named.isSymbolicLink() || !named.isFile() || named.nlink !== 1
      || !sameIdentity(openedIdentity, identity(retained))
      || !sameIdentity(openedIdentity, identity(named))) fail();
    return { handle, identity: openedIdentity };
  } catch (error) {
    await close(handle);
    throw error;
  }
}

async function readRegularFile(ops, parentHandle, basename, { allowMissing = false } = {}) {
  if (!isPlainBasename(basename)) fail();
  let handle;
  try {
    const before = await ops.lstat(entry(parentHandle, basename));
    if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1) fail();
    handle = await ops.open(entry(parentHandle, basename), READ_FLAGS);
    const opened = await handle.stat();
    const bytes = Buffer.from(await handle.readFile());
    const retained = await handle.stat();
    const after = await ops.lstat(entry(parentHandle, basename));
    const fileIdentity = identity(opened);
    if (!opened.isFile() || !retained.isFile() || !after.isFile() || after.isSymbolicLink()
      || opened.nlink !== 1 || retained.nlink !== 1 || after.nlink !== 1
      || Number(opened.size) !== bytes.length || Number(retained.size) !== bytes.length
      || !sameIdentity(identity(before), fileIdentity)
      || !sameIdentity(fileIdentity, identity(retained))
      || !sameIdentity(fileIdentity, identity(after))) fail();
    return { bytes, sha256: sha256(bytes), identity: fileIdentity, mode: retained.mode };
  } catch (error) {
    if (allowMissing && isMissing(error)) return null;
    throw error;
  } finally {
    await close(handle);
  }
}

async function snapshotRelativeFile(ops, rootHandle, relativePath) {
  const parts = safeRelativeParts(relativePath);
  let parent = rootHandle;
  const opened = [];
  try {
    for (const component of parts.slice(0, -1)) {
      const stat = await ops.lstat(entry(parent, component));
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail();
      const handle = await openBoundDirectory(
        ops, parent, component, identity(stat), 'P6_AUTHORITY_INVALID'
      );
      opened.push(handle);
      parent = handle;
    }
    const read = await readRegularFile(ops, parent, parts.at(-1));
    return Object.freeze({
      bytes: Buffer.from(read.bytes),
      sha256: read.sha256,
      stat: Object.freeze({
        is_regular_file: true,
        is_symlink: false,
        size: read.bytes.length,
        dev: read.identity.dev,
        ino: read.identity.ino,
        nlink: 1
      })
    });
  } finally {
    await Promise.all(opened.map(close));
  }
}

function normalizeFiles(kind, files) {
  if (!plain(files) || Object.keys(files).length === 0) fail();
  const publicFiles = {};
  const privateFiles = {};
  for (const name of Object.keys(files).sort()) {
    const bytes = files[name];
    if (!Buffer.isBuffer(bytes)) fail();
    if (name.startsWith(`${PRIVATE_BASENAME}/`)) {
      if (kind !== 'blind-comparison') fail();
      const privateName = name.slice(PRIVATE_BASENAME.length + 1);
      if (!isManagedBasename(privateName)) fail();
      privateFiles[privateName] = Buffer.from(bytes);
    } else {
      if (!isManagedBasename(name)) fail();
      publicFiles[name] = Buffer.from(bytes);
    }
  }
  if (Object.keys(publicFiles).length === 0) fail();
  return { publicFiles, privateFiles };
}

function parseManifest(bytes, kind, generation) {
  const value = canonicalJson(bytes);
  if (!plain(value) || Object.keys(value).join(',') !== 'artifact_hashes,generation,kind,managed_paths,schema_version'
    || value.schema_version !== 1 || value.kind !== kind || value.generation !== generation
    || !Array.isArray(value.managed_paths) || !plain(value.artifact_hashes)
    || !sameStrings(value.managed_paths, [...value.managed_paths].sort())
    || Object.keys(value.artifact_hashes).join(',') !== value.managed_paths.join(',')) fail();
  for (const name of value.managed_paths) if (!isManagedBasename(name) || !HASH.test(value.artifact_hashes[name])) fail();
  return value;
}

function parsePrivateManifest(bytes) {
  const value = canonicalJson(bytes);
  if (!plain(value) || Object.keys(value).join(',') !== 'artifact_hashes,kind,managed_paths,schema_version'
    || value.schema_version !== 1 || value.kind !== 'p6-private-generation'
    || !Array.isArray(value.managed_paths) || !plain(value.artifact_hashes)
    || !sameStrings(value.managed_paths, [...value.managed_paths].sort())
    || Object.keys(value.artifact_hashes).join(',') !== value.managed_paths.join(',')) fail();
  for (const name of value.managed_paths) if (!isManagedBasename(name) || !HASH.test(value.artifact_hashes[name])) fail();
  return value;
}

function parsePointer(bytes, kind) {
  const value = canonicalJson(bytes);
  if (!plain(value) || Object.keys(value).join(',') !== 'generation,kind,manifest_sha256,schema_version'
    || value.schema_version !== 1 || value.kind !== kind
    || !GENERATION.test(value.generation) || !HASH.test(value.manifest_sha256)) fail();
  return value;
}

function canonicalJson(bytes) {
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    if (stableJson(value) !== bytes.toString('utf8')) fail();
    return value;
  } catch { fail(); }
}

async function openAbsoluteDirectory(ops, absolutePath) {
  if (!isSafeAbsolutePath(absolutePath)) fail();
  const parsed = path.parse(absolutePath);
  const components = absolutePath.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let rootHandle;
  const ancestry = [];
  try {
    rootHandle = await ops.open(parsed.root, DIRECTORY_FLAGS);
    const rootStat = await rootHandle.stat();
    if (!rootStat.isDirectory()) fail();
    let current = rootHandle;
    for (const basename of components) {
      const named = await ops.lstat(entry(current, basename));
      if (named.isSymbolicLink() || !named.isDirectory()) fail();
      const nodeIdentity = identity(named);
      const handle = await openBoundDirectory(
        ops, current, basename, nodeIdentity, 'P6_AUTHORITY_INVALID'
      );
      ancestry.push({ parentHandle: current, handle, basename, identity: nodeIdentity });
      current = handle;
    }
    const parentHandle = ancestry.length === 1
      ? rootHandle : ancestry.at(-2).handle;
    return {
      rootHandle,
      rootIdentity: identity(rootStat),
      ancestry,
      parentHandle,
      runHandle: ancestry.at(-1).handle
    };
  } catch (error) {
    await closeAbsoluteDirectory({ rootHandle, ancestry });
    throw error;
  }
}

async function assertAbsoluteDirectory(ops, absoluteAuthority) {
  const root = await absoluteAuthority?.rootHandle?.stat();
  if (!root?.isDirectory() || !sameIdentity(identity(root), absoluteAuthority.rootIdentity)) fail();
  for (const node of absoluteAuthority.ancestry) {
    const retained = await node.handle.stat();
    if (!retained.isDirectory() || !sameIdentity(identity(retained), node.identity)) fail();
    await assertNamedDirectory(ops, node.parentHandle, node.basename, node.identity);
  }
}

async function closeAbsoluteDirectory(absoluteAuthority) {
  if (!absoluteAuthority) return;
  for (const node of [...(absoluteAuthority.ancestry ?? [])].reverse()) {
    await close(node.handle);
  }
  await close(absoluteAuthority.rootHandle);
}

async function assertNamedDirectory(ops, parentHandle, basename, expectedIdentity) {
  const stat = await ops.lstat(entry(parentHandle, basename));
  if (stat.isSymbolicLink() || !stat.isDirectory()
    || !sameIdentity(identity(stat), expectedIdentity)) fail();
}

async function namedEntryHasIdentity(ops, parentHandle, basename, expectedKind, expectedIdentity) {
  try {
    const stat = await ops.lstat(entry(parentHandle, basename));
    const kind = stat.isSymbolicLink() ? 'symlink'
      : stat.isDirectory() ? 'directory'
        : stat.isFile() ? 'file' : 'other';
    return kind === expectedKind && sameIdentity(identity(stat), expectedIdentity);
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function fsOperations(source) {
  const provided = source?.source ?? source;
  const operation = name => {
    const owner = provided && typeof provided[name] === 'function' ? provided : fs;
    return owner[name].bind(owner);
  };
  const customRename = provided && typeof provided.renameNoReplace === 'function'
    ? provided.renameNoReplace.bind(provided) : null;
  const customBetween = provided && typeof provided.renameNoReplaceBetween === 'function'
    ? provided.renameNoReplaceBetween.bind(provided) : null;
  return Object.freeze({
    source: provided,
    open: operation('open'),
    lstat: operation('lstat'),
    readdir: operation('readdir'),
    mkdirBound: provided && typeof provided.mkdirBound === 'function' ? provided.mkdirBound.bind(provided) : undefined,
    retireEntry: provided && typeof provided.retireEntry === 'function' ? provided.retireEntry.bind(provided) : undefined,
    removeBound: provided && typeof provided.removeBound === 'function' ? provided.removeBound.bind(provided) : undefined,
    renameNoReplace: customRename
      ? (directoryHandle, sourceName, destinationName) => customRename(
        directoryHandle, sourceName, directoryHandle, destinationName,
        (_sourceHandle, from, _destinationHandle, to) => renameNoReplaceBetweenDescriptors(directoryHandle, from, directoryHandle, to)
      )
      : customBetween
        ? (directoryHandle, sourceName, destinationName) => customBetween(
          directoryHandle, sourceName, directoryHandle, destinationName,
          renameNoReplaceBetweenDescriptors
        )
      : (directoryHandle, sourceName, destinationName) => renameNoReplaceBetweenDescriptors(
        directoryHandle, sourceName, directoryHandle, destinationName
      ),
    renameNoReplaceBetween: customBetween
      ? (sourceHandle, sourceName, destinationHandle, destinationName) => customBetween(
        sourceHandle, sourceName, destinationHandle, destinationName,
        renameNoReplaceBetweenDescriptors
      )
      : renameNoReplaceBetweenDescriptors
  });
}

async function renameNoReplaceBetweenDescriptors(sourceHandle, sourceName, destinationHandle, destinationName) {
  if (!isPlainBasename(sourceName) || !isPlainBasename(destinationName)) fail();
  await new Promise((resolve, reject) => {
    const child = spawn(MOVE_BINARY, [
      '--no-clobber', '--no-target-directory',
      `/proc/self/fd/3/${sourceName}`, `/proc/self/fd/4/${destinationName}`
    ], { stdio: ['ignore', 'ignore', 'ignore', sourceHandle.fd, destinationHandle.fd] });
    child.once('error', () => reject(p6Error('P6_AUTHORITY_INVALID')));
    child.once('close', code => code === 0 ? resolve() : reject(p6Error('P6_AUTHORITY_INVALID')));
  });
}

function createAuthority(internal) {
  const authority = {};
  Object.defineProperty(authority, 'close', {
    enumerable: true,
    value: async () => {
      if (internal.closed) return;
      internal.closed = true;
      await close(internal.p6Handle);
      await closeAbsoluteDirectory(internal.absoluteAuthority);
    }
  });
  AUTHORITIES.set(authority, internal);
  return Object.freeze(authority);
}

function makeInternal(value) { return { ...value, closed: false }; }
function authorityInternal(authority) {
  const internal = authority && typeof authority === 'object' ? AUTHORITIES.get(authority) : undefined;
  if (!internal || internal.closed) throw p6Error('P6_AUTHORITY_INVALID');
  return internal;
}

function nextGenerationName(names) {
  let maximum = 0;
  for (const name of names) {
    if (name === OWNERSHIP_BASENAME) continue;
    const match = GENERATION.exec(name);
    if (!match) fail();
    maximum = Math.max(maximum, Number(match[1]));
  }
  if (maximum >= 999999) fail();
  return `generation-${String(maximum + 1).padStart(6, '0')}`;
}

function safeRelativeParts(value) {
  if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value)
    || value.includes('\\') || UNSAFE_PATH_CHARACTER.test(value)) fail();
  const parts = value.split('/');
  if (parts.some(part => !isPlainBasename(part))) fail();
  return parts;
}

function isSafeAbsolutePath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.resolve(value) !== value) return false;
  const parsed = path.parse(value);
  const parts = value.slice(parsed.root.length).split(path.sep).filter(Boolean);
  return parts.length > 0 && parts.every(isPlainBasename);
}
function isPlainBasename(value) { return typeof value === 'string' && value.length > 0 && value !== '.' && value !== '..' && !value.includes('/') && !value.includes('\\') && !UNSAFE_PATH_CHARACTER.test(value); }
function isManagedBasename(value) { return isPlainBasename(value) && ![OWNERSHIP_BASENAME, MANIFEST_BASENAME, CURRENT_BASENAME].includes(value) && !value.startsWith('.p6-'); }
function isPointerJournalBasename(value) {
  return /^\.p6-(?:current|pointer-backup)-\d+-\d+-[a-f0-9]{16}$/u.test(value)
    || RETIREMENT.test(value);
}
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function descriptor(handle) { return `/proc/self/fd/${handle.fd}`; }
function entry(handle, basename) { return `${descriptor(handle)}/${basename}`; }
function identity(stat) { return { dev: stat.dev, ino: stat.ino }; }
function sameIdentity(left, right) { return left?.dev === right?.dev && left?.ino === right?.ino; }
function sameStrings(left, right) { return left.length === right.length && left.every((item, index) => item === right[index]); }
function isMissing(error) { return error?.code === 'ENOENT' || error?.code === 'ENOTDIR'; }
function fail() { throw p6Error('P6_AUTHORITY_INVALID'); }
function publicError(error) { return sanitizeP6Error(error, 'P6_AUTHORITY_INVALID'); }
async function close(handle) { try { await handle?.close(); } catch {} }
async function closeKindTree(tree) { await close(tree?.generationsHandle); await close(tree?.kindHandle); }
async function closeGenerationStage(stage) { await close(stage?.privateHandle); await close(stage?.handle); }
