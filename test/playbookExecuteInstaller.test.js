import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { installSelectedDatapackSafely } from '../src/construction/candidatePipelineSupport.js';

test('P5 installer preserves exact old datapack inodes on every precommit fault', async (t) => {
  for (const boundary of ['snapshot', 'stage-mkdir', 'stage-write', 'stage-chmod', 'stage-file-sync', 'stage-directory-sync', 'backup-rename', 'promote-rename', 'parent-sync']) {
    const fixture = await installerFixture(t);
    const before = await snapshotTree(fixture.target);
    await assert.rejects(installSelectedDatapackSafely(fixture.source, {
      datapacksDir: fixture.datapacksDir,
      expectedDatapackTreeSha256: fixture.expectedHash,
      faultInjector(name) {
        if (name === boundary) throw new Error(`private:${boundary}:${fixture.root}`);
      }
    }), { code: 'P5_INSTALL_FAILED' }, boundary);
    assert.deepEqual(await snapshotTree(fixture.target), before, boundary);
  }
});

test('P5 installer copies the validated snapshot and rejects symlinks', async (t) => {
  const fixture = await installerFixture(t);
  const originalBuild = await fs.readFile(path.join(fixture.source, 'data/architect/function/build.mcfunction'));
  const installed = await installSelectedDatapackSafely(fixture.source, {
    datapacksDir: fixture.datapacksDir,
    expectedDatapackTreeSha256: fixture.expectedHash,
    async faultInjector(name) {
      if (name === 'source-snapshotted') {
        await fs.writeFile(path.join(fixture.source, 'data/architect/function/build.mcfunction'), 'attacker\n');
      }
    }
  });
  assert.equal(installed, fixture.target);
  assert.deepEqual(await fs.readFile(path.join(installed, 'data/architect/function/build.mcfunction')), originalBuild);

  const symlinkFixture = await installerFixture(t);
  await fs.symlink('/etc/passwd', path.join(symlinkFixture.source, 'data/architect/function/leak'));
  await assert.rejects(installSelectedDatapackSafely(symlinkFixture.source, {
    datapacksDir: symlinkFixture.datapacksDir,
    expectedDatapackTreeSha256: symlinkFixture.expectedHash
  }), { code: 'P5_INSTALL_FAILED' });

  const parentSymlinkFixture = await installerFixture(t);
  const sourceAlias = path.join(parentSymlinkFixture.root, 'source-alias');
  await fs.symlink(path.dirname(parentSymlinkFixture.source), sourceAlias);
  await assert.rejects(installSelectedDatapackSafely(
    path.join(sourceAlias, 'architect_datapack'),
    {
      datapacksDir: parentSymlinkFixture.datapacksDir,
      expectedDatapackTreeSha256: parentSymlinkFixture.expectedHash
    }
  ), { code: 'P5_INSTALL_FAILED' });
});

test('P5 installer admits ordinary world path names and treats cleanup as postcommit', async (t) => {
  const fixture = await installerFixture(t, { worldDirectory: '建造 实验 world' });
  const installed = await installSelectedDatapackSafely(fixture.source, {
    datapacksDir: fixture.datapacksDir,
    expectedDatapackTreeSha256: fixture.expectedHash,
    faultInjector(name) {
      if (name === 'cleanup') throw new Error(`private:cleanup:${fixture.root}`);
    }
  });

  assert.equal(installed, fixture.target);
  assert.equal(
    await fs.readFile(path.join(installed, 'data/architect/function/build.mcfunction'), 'utf8'),
    'setblock ~ ~ ~ minecraft:stone\n'
  );
  assert.equal((await fs.readdir(fixture.datapacksDir)).some((name) => name.startsWith('.p5-install-backup-')), true);
});

test('P5 installer reconciles a target-to-backup rename that completes before throwing', async (t) => {
  const fixture = await installerFixture(t);
  const before = await snapshotTree(fixture.target);
  let injected = false;
  const fsImpl = new Proxy(fs, { get(target, property) {
    if (property === 'renameNoReplace') return async (parent, sourceName, destinationName, next) => {
      const result = await next(parent, sourceName, destinationName);
      if (!injected && sourceName === 'architect_datapack'
        && destinationName.startsWith('.p5-install-backup-')) {
        injected = true;
        throw new Error(`private post-effect backup move ${fixture.root}`);
      }
      return result;
    };
    if (property !== 'rename') return Reflect.get(target, property);
    return async (source, destination) => {
      const result = await fs.rename(source, destination);
      if (!injected && path.basename(String(source)) === 'architect_datapack'
        && path.basename(String(destination)).startsWith('.p5-install-backup-')) {
        injected = true;
        throw new Error(`private post-effect backup move ${fixture.root}`);
      }
      return result;
    };
  } });

  await assert.rejects(installSelectedDatapackSafely(fixture.source, {
    datapacksDir: fixture.datapacksDir,
    expectedDatapackTreeSha256: fixture.expectedHash,
    fsImpl
  }), { code: 'P5_INSTALL_FAILED', message: 'P5_INSTALL_FAILED' });
  assert.equal(injected, true);
  assert.deepEqual(await snapshotTree(fixture.target), before);
});

test('P5 installer cleanup never recursively removes a swapped foreign backup path', async (t) => {
  const fixture = await installerFixture(t);
  const foreignBytes = Buffer.from('foreign backup sentinel must survive\n');
  let swapped = false;
  let parked;
  let foreignRoot;
  const fsImpl = new Proxy(fs, { get(target, property) {
    if (property !== 'lstat') return Reflect.get(target, property);
    return async (targetPath, ...args) => {
      const stat = await fs.lstat(targetPath, ...args);
      if (!swapped && path.basename(String(targetPath)).startsWith('.p5-install-backup-')) {
        swapped = true;
        parked = `${String(targetPath)}.owned-parked`;
        const basename = path.basename(String(targetPath));
        foreignRoot = path.join(fixture.datapacksDir, basename);
        await fs.rename(targetPath, parked);
        await fs.mkdir(targetPath);
        await fs.writeFile(path.join(String(targetPath), 'foreign-sentinel.txt'), foreignBytes);
      }
      return stat;
    };
  } });

  const installed = await installSelectedDatapackSafely(fixture.source, {
    datapacksDir: fixture.datapacksDir,
    expectedDatapackTreeSha256: fixture.expectedHash,
    fsImpl
  });
  assert.equal(installed, fixture.target);
  assert.equal(swapped, true);
  assert.deepEqual(await fs.readFile(path.join(foreignRoot, 'foreign-sentinel.txt')), foreignBytes);
  await fs.access(path.join(fixture.datapacksDir, `${path.basename(parked).replace(/\.owned-parked$/u, '')}.owned-parked`, 'pack.mcmeta'));
});

test('P5 installer rolls back only topology created by a failed absent-world install', async (t) => {
  const fixture = await installerFixture(t, { existingTarget: false, missingDatapacksTopology: true });
  const worldRoot = path.dirname(fixture.datapacksDir);
  await assert.rejects(installSelectedDatapackSafely(fixture.source, {
    datapacksDir: fixture.datapacksDir,
    expectedDatapackTreeSha256: fixture.expectedHash,
    faultInjector(boundary) {
      if (boundary === 'stage-mkdir') throw new Error(`private topology fault ${fixture.root}`);
    }
  }), { code: 'P5_INSTALL_FAILED', message: 'P5_INSTALL_FAILED' });
  await assert.rejects(fs.lstat(worldRoot), { code: 'ENOENT' });
});

test('P5 installer never adopts a swapped generated world component', async (t) => {
  const fixture = await installerFixture(t, { existingTarget: false, missingDatapacksTopology: true });
  const worldRoot = path.dirname(fixture.datapacksDir);
  const worldName = path.basename(worldRoot);
  const parked = `${fixture.root}-reviewer-owned-world`;
  const foreignBytes = Buffer.from('foreign generated world must survive\n');
  let swapped = false;
  let parkedCreated = false;
  let foreignBefore;
  const installForeign = async () => {
    await fs.mkdir(worldRoot);
    await fs.writeFile(path.join(worldRoot, 'foreign-sentinel.txt'), foreignBytes);
    foreignBefore = await snapshotTree(worldRoot);
  };
  const fsImpl = new Proxy(fs, { get(target, property) {
    if (property === 'mkdir') return async (targetPath, ...args) => {
      const result = await fs.mkdir(targetPath, ...args);
      if (!swapped && String(targetPath) === worldRoot) {
        swapped = true;
        await fs.rename(worldRoot, parked);
        parkedCreated = true;
        await installForeign();
      }
      return result;
    };
    if (property === 'renameNoReplace') return async (parent, sourceName, destinationName, next) => {
      if (!swapped && destinationName === worldName) {
        swapped = true;
        await installForeign();
      }
      return next(parent, sourceName, destinationName);
    };
    return Reflect.get(target, property);
  } });

  await assert.rejects(installSelectedDatapackSafely(fixture.source, {
    datapacksDir: fixture.datapacksDir,
    expectedDatapackTreeSha256: fixture.expectedHash,
    fsImpl
  }), { code: 'P5_INSTALL_FAILED', message: 'P5_INSTALL_FAILED' });
  assert.equal(swapped, true);
  assert.deepEqual(await snapshotTree(worldRoot), foreignBefore);
  assert.deepEqual(await fs.readFile(path.join(worldRoot, 'foreign-sentinel.txt')), foreignBytes);
  if (parkedCreated) await fs.access(parked);
});

test('P5 installer restores exact old authority across target swaps and no-replace collisions', async (t) => {
  for (const kind of ['target-swap', 'backup-collision', 'promote-collision']) {
    await t.test(kind, async (t) => {
      const fixture = await installerFixture(t);
      const before = await snapshotTree(fixture.target);
      const foreignBytes = Buffer.from(`foreign ${kind} must survive\n`);
      let injected = false;
      const fsImpl = new Proxy(fs, { get(target, property) {
        if (property !== 'renameNoReplace') return Reflect.get(target, property);
        return async (parent, sourceName, destinationName, next) => {
          if (!injected && sourceName === 'architect_datapack'
            && destinationName.startsWith('.p5-install-backup-')) {
            if (kind === 'target-swap') {
              injected = true;
              await fs.rename(`/proc/self/fd/${parent.fd}/${sourceName}`, `/proc/self/fd/${parent.fd}/.reviewer-owned-old`);
              await fs.mkdir(`/proc/self/fd/${parent.fd}/${sourceName}`);
              await fs.writeFile(`/proc/self/fd/${parent.fd}/${sourceName}/foreign-sentinel.txt`, foreignBytes);
            } else if (kind === 'backup-collision') {
              injected = true;
              await fs.mkdir(`/proc/self/fd/${parent.fd}/${destinationName}`);
              await fs.writeFile(`/proc/self/fd/${parent.fd}/${destinationName}/foreign-sentinel.txt`, foreignBytes);
            }
          } else if (!injected && sourceName.startsWith('.p5-install-stage-')
            && destinationName === 'architect_datapack' && kind === 'promote-collision') {
            injected = true;
            await fs.mkdir(`/proc/self/fd/${parent.fd}/${destinationName}`);
            await fs.writeFile(`/proc/self/fd/${parent.fd}/${destinationName}/foreign-sentinel.txt`, foreignBytes);
          }
          return next(parent, sourceName, destinationName);
        };
      } });

      await assert.rejects(installSelectedDatapackSafely(fixture.source, {
        datapacksDir: fixture.datapacksDir,
        expectedDatapackTreeSha256: fixture.expectedHash,
        fsImpl
      }), { code: 'P5_INSTALL_FAILED', message: 'P5_INSTALL_FAILED' });
      assert.equal(injected, true);
      assert.deepEqual(await snapshotTree(fixture.target), before);
      assert.equal(await treeContainsBytes(fixture.datapacksDir, foreignBytes), true);
    });
  }
});

test('P5 installer reconciles post-effect rollback moves and preserves old authority on cleanup faults', async (t) => {
  for (const kind of ['rollback-post-effect', 'rollback-cleanup']) {
    await t.test(kind, async (t) => {
      const fixture = await installerFixture(t);
      const before = await snapshotTree(fixture.target);
      let rollbackInjected = false;
      const fsImpl = new Proxy(fs, { get(target, property) {
        if (property === 'renameNoReplace') return async (parent, sourceName, destinationName, next) => {
          if (sourceName.startsWith('.p5-install-stage-') && destinationName === 'architect_datapack') {
            throw new Error('private promote failure');
          }
          const result = await next(parent, sourceName, destinationName);
          if (kind === 'rollback-post-effect' && sourceName.startsWith('.p5-install-backup-')
            && destinationName === 'architect_datapack') {
            rollbackInjected = true;
            throw new Error('private rollback post-effect failure');
          }
          return result;
        };
        if (property === 'rmdir' && kind === 'rollback-cleanup') return async (targetPath, ...args) => {
          if (path.basename(String(targetPath)).startsWith('.p5-install-stage-')) {
            rollbackInjected = true;
            throw new Error('private rollback cleanup failure');
          }
          return fs.rmdir(targetPath, ...args);
        };
        return Reflect.get(target, property);
      } });

      await assert.rejects(installSelectedDatapackSafely(fixture.source, {
        datapacksDir: fixture.datapacksDir,
        expectedDatapackTreeSha256: fixture.expectedHash,
        fsImpl
      }), { code: 'P5_INSTALL_FAILED', message: 'P5_INSTALL_FAILED' });
      assert.equal(rollbackInjected, true);
      assert.deepEqual(await snapshotTree(fixture.target), before);
    });
  }
});

async function installerFixture(t, {
  worldDirectory = 'world',
  existingTarget = true,
  missingDatapacksTopology = false
} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-installer-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source', 'architect_datapack');
  const datapacksDir = path.join(root, worldDirectory, 'datapacks');
  const target = path.join(datapacksDir, 'architect_datapack');
  await fs.mkdir(path.join(source, 'data/architect/function'), { recursive: true });
  await fs.writeFile(path.join(source, 'pack.mcmeta'), '{"pack":{"pack_format":48}}\n');
  await fs.writeFile(path.join(source, 'data/architect/function/build.mcfunction'), 'setblock ~ ~ ~ minecraft:stone\n');
  if (!missingDatapacksTopology) await fs.mkdir(datapacksDir, { recursive: true });
  if (existingTarget) {
    await fs.mkdir(path.join(target, 'data/old'), { recursive: true });
    await fs.writeFile(path.join(target, 'pack.mcmeta'), 'old-pack\n');
    await fs.writeFile(path.join(target, 'data/old/keep.mcfunction'), 'old-command\n');
  }
  return { root, source, datapacksDir, target, expectedHash: await datapackTreeHash(source) };
}

async function datapackTreeHash(root) {
  const rows = [];
  async function walk(current, prefix = '') {
    for (const entry of (await fs.readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(current, entry.name), relative);
      else rows.push({ path: `architect_datapack/${relative}`, sha256: digest(await fs.readFile(path.join(current, entry.name))) });
    }
  }
  await walk(root);
  return digest(Buffer.from(stable(rows)));
}

async function snapshotTree(root) {
  const rows = [];
  async function walk(current, prefix = '') {
    const stat = await fs.stat(current);
    rows.push({ path: prefix, ino: stat.ino, mode: stat.mode & 0o777 });
    if (!stat.isDirectory()) {
      rows.at(-1).bytes = (await fs.readFile(current)).toString('hex');
      return;
    }
    for (const name of (await fs.readdir(current)).sort()) await walk(path.join(current, name), prefix ? `${prefix}/${name}` : name);
  }
  await walk(root);
  return rows;
}

async function treeContainsBytes(root, expected) {
  for (const name of await fs.readdir(root)) {
    const target = path.join(root, name);
    const stat = await fs.lstat(target);
    if (stat.isDirectory()) {
      if (await treeContainsBytes(target, expected)) return true;
    } else if (stat.isFile() && (await fs.readFile(target)).equals(expected)) return true;
  }
  return false;
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stable(value) {
  const sort = (item) => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, sort(item[key])])) : item;
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}
