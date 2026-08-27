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

async function installerFixture(t, { worldDirectory = 'world' } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-installer-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source', 'architect_datapack');
  const datapacksDir = path.join(root, worldDirectory, 'datapacks');
  const target = path.join(datapacksDir, 'architect_datapack');
  await fs.mkdir(path.join(source, 'data/architect/function'), { recursive: true });
  await fs.writeFile(path.join(source, 'pack.mcmeta'), '{"pack":{"pack_format":48}}\n');
  await fs.writeFile(path.join(source, 'data/architect/function/build.mcfunction'), 'setblock ~ ~ ~ minecraft:stone\n');
  await fs.mkdir(path.join(target, 'data/old'), { recursive: true });
  await fs.writeFile(path.join(target, 'pack.mcmeta'), 'old-pack\n');
  await fs.writeFile(path.join(target, 'data/old/keep.mcfunction'), 'old-command\n');
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

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stable(value) {
  const sort = (item) => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, sort(item[key])])) : item;
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}
