import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SHADOW_OUTPUT_FILES } from '../src/playbook/shadow/constants.js';
import {
  admitShadowRun,
  installShadowArtifacts
} from '../src/playbook/shadow/storage.js';

const BODY_FILES = SHADOW_OUTPUT_FILES.filter((name) => name !== 'manifest.json');
const STAGE_PREFIX = '.playbook-shadow.stage-';
const BACKUP_PREFIX = '.playbook-shadow.backup-';

test('admits a nested candidate under out and reads exact blueprint bytes', async (t) => {
  const fixture = await storageFixture(t);
  const authority = await admitShadowRun({
    projectRoot: fixture.root,
    runArg: 'out/run/candidates/round-01/candidate-01'
  });
  t.after(() => authority.close());
  assert.equal(authority.run_relative_path, 'out/run/candidates/round-01/candidate-01');
  assert.deepEqual(authority.blueprint_bytes, fixture.blueprintBytes);
});

test('rejects outside, missing, non-directory, and every symlinked path component', async (t) => {
  const fixture = await storageFixture(t);
  for (const scenario of await invalidAdmissionScenarios(t, fixture)) {
    await assert.rejects(
      admitShadowRun({
        projectRoot: scenario.projectRoot ?? fixture.root,
        runArg: scenario.runArg
      }),
      (error) => {
        assert.equal(error.code, scenario.code, scenario.name);
        assert.equal(error.message, scenario.code, scenario.name);
        return true;
      },
      scenario.name
    );
  }
});

test('rejects invalid blueprint JSON and workflow without leaking input bytes', async (t) => {
  for (const [name, bytes] of [
    ['invalid-json', Buffer.from('{ secret invalid json')],
    ['invalid-workflow', Buffer.from('{"workflow":"other","secret":"do-not-leak"}\n')]
  ]) {
    await t.test(name, async (t) => {
      const fixture = await storageFixture(t, { blueprintBytes: bytes });
      await assert.rejects(
        admitShadowRun({ projectRoot: fixture.root, runArg: fixture.runArg }),
        (error) => {
          assert.equal(error.code, 'BLUEPRINT_INVALID');
          assert.equal(error.message, 'BLUEPRINT_INVALID');
          assert.doesNotMatch(error.message, /secret|other/u);
          return true;
        }
      );
    });
  }
});

test('refuses unowned output without changing any bytes', async (t) => {
  const fixture = await storageFixture(t, { foreignOutput: true });
  const before = await snapshotTree(fixture.root);
  const authority = await admitShadowRun({ projectRoot: fixture.root, runArg: fixture.runArg });
  t.after(() => authority.close());
  await assert.rejects(
    installShadowArtifacts({ authority, files: validArtifactFiles() }),
    /SHADOW_OUTPUT_OWNERSHIP/u
  );
  assert.deepEqual(await snapshotTree(fixture.root), before);
});

test('refuses extra files, corrupt manifests, traversal, and body hash drift', async (t) => {
  for (const scenario of [
    {
      name: 'extra-file',
      mutate: async (outputPath) => fs.writeFile(path.join(outputPath, 'foreign.txt'), 'keep')
    },
    {
      name: 'corrupt-manifest',
      mutate: async (outputPath) => fs.writeFile(path.join(outputPath, 'manifest.json'), '{broken')
    },
    {
      name: 'manifest-traversal',
      mutate: async (outputPath) => {
        const manifestPath = path.join(outputPath, 'manifest.json');
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        manifest.managed_paths[0] = '../manifest.json';
        await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
      }
    },
    {
      name: 'body-hash-drift',
      mutate: async (outputPath) => fs.writeFile(path.join(outputPath, 'report.md'), 'changed\n')
    }
  ]) {
    await t.test(scenario.name, async (t) => {
      const fixture = await storageFixture(t);
      await writeArtifactDirectory(fixture.runPath, validArtifactFiles('old'));
      const outputPath = path.join(fixture.runPath, 'playbook-shadow');
      await scenario.mutate(outputPath);
      const before = await snapshotTree(fixture.root);
      const authority = await admitShadowRun({ projectRoot: fixture.root, runArg: fixture.runArg });
      t.after(() => authority.close());

      await assert.rejects(
        installShadowArtifacts({ authority, files: validArtifactFiles('new') }),
        /SHADOW_OUTPUT_OWNERSHIP/u
      );
      assert.deepEqual(await snapshotTree(fixture.root), before);
    });
  }
});

test('rejects output and target-file symlinks without touching their targets', async (t) => {
  await t.test('output-symlink', async (t) => {
    const fixture = await storageFixture(t);
    const target = path.join(fixture.root, 'outside-output');
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, 'foreign.txt'), 'outside bytes\n');
    await fs.symlink(target, path.join(fixture.runPath, 'playbook-shadow'));
    const before = await snapshotTree(fixture.root);
    const authority = await admitShadowRun({ projectRoot: fixture.root, runArg: fixture.runArg });
    t.after(() => authority.close());

    await assert.rejects(
      installShadowArtifacts({ authority, files: validArtifactFiles() }),
      /SYMLINK_NOT_ALLOWED/u
    );
    assert.deepEqual(await snapshotTree(fixture.root), before);
  });

  await t.test('target-file-symlink', async (t) => {
    const fixture = await storageFixture(t);
    const files = validArtifactFiles('old');
    const target = path.join(fixture.root, 'outside-review.json');
    await fs.writeFile(target, files['review.json']);
    const outputPath = path.join(fixture.runPath, 'playbook-shadow');
    await fs.mkdir(outputPath);
    for (const name of SHADOW_OUTPUT_FILES) {
      if (name === 'review.json') await fs.symlink(target, path.join(outputPath, name));
      else await fs.writeFile(path.join(outputPath, name), files[name]);
    }
    const before = await snapshotTree(fixture.root);
    const authority = await admitShadowRun({ projectRoot: fixture.root, runArg: fixture.runArg });
    t.after(() => authority.close());

    await assert.rejects(
      installShadowArtifacts({ authority, files: validArtifactFiles('new') }),
      /SYMLINK_NOT_ALLOWED/u
    );
    assert.deepEqual(await snapshotTree(fixture.root), before);
  });
});

test('rejects a symlink swapped between admission lstat and descriptor open', async (t) => {
  const fixture = await storageFixture(t);
  const parked = `${fixture.runPath}-parked`;
  const outside = path.join(fixture.root, 'outside-run');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'blueprint.json'), fixture.blueprintBytes);
  let swapped = false;
  const fsImpl = fsWith({
    async lstat(target, ...args) {
      const stat = await fs.lstat(target, ...args);
      if (!swapped && String(target).endsWith('/candidate-01')) {
        swapped = true;
        await fs.rename(fixture.runPath, parked);
        await fs.symlink(outside, fixture.runPath);
      }
      return stat;
    }
  });

  await assert.rejects(
    admitShadowRun({ projectRoot: fixture.root, runArg: fixture.runArg, fsImpl }),
    /SYMLINK_NOT_ALLOWED/u
  );
  assert.equal(await fs.readFile(path.join(outside, 'blueprint.json'), 'utf8'), fixture.blueprintBytes.toString());
});

test('rejects a target file swapped to a symlink during ownership validation', async (t) => {
  const fixture = await storageFixture(t);
  const oldFiles = validArtifactFiles('old');
  await writeArtifactDirectory(fixture.runPath, oldFiles);
  const target = path.join(fixture.root, 'outside-race-review.json');
  await fs.writeFile(target, oldFiles['review.json']);
  const reviewPath = path.join(fixture.runPath, 'playbook-shadow', 'review.json');
  const parked = `${reviewPath}.parked`;
  let swapped = false;
  const fsImpl = fsWith({
    async lstat(targetPath, ...args) {
      const stat = await fs.lstat(targetPath, ...args);
      if (
        !swapped
        && path.basename(String(targetPath)) === 'review.json'
        && await descriptorParentBasename(targetPath) === 'playbook-shadow'
      ) {
        swapped = true;
        await fs.rename(reviewPath, parked);
        await fs.symlink(target, reviewPath);
      }
      return stat;
    }
  });
  const authority = await admitShadowRun({ projectRoot: fixture.root, runArg: fixture.runArg });
  t.after(() => authority.close());

  await assert.rejects(
    installShadowArtifacts({ authority, files: validArtifactFiles('new'), fsImpl }),
    /SYMLINK_NOT_ALLOWED/u
  );
  assert.deepEqual(await fs.readFile(target), oldFiles['review.json']);
  assert.equal((await generatedEntries(fixture.runPath)).length, 0);
});

test('retries a private stage collision without deleting the colliding directory', async (t) => {
  const fixture = await storageFixture(t);
  let collisionPath;
  const fsImpl = fsWith({
    async mkdir(target, options) {
      if (!collisionPath && path.basename(String(target)).startsWith(STAGE_PREFIX)) {
        collisionPath = String(target);
        await fs.mkdir(collisionPath, options);
        await fs.writeFile(path.join(collisionPath, 'foreign.txt'), 'collision bytes\n');
        throw Object.assign(new Error('raw collision'), { code: 'EEXIST' });
      }
      return fs.mkdir(target, options);
    }
  });
  const authority = await admitShadowRun({ projectRoot: fixture.root, runArg: fixture.runArg });
  t.after(() => authority.close());

  const result = await installShadowArtifacts({ authority, files: validArtifactFiles(), fsImpl });
  assert.equal(result.status, 'created');
  assert.equal(await fs.readFile(path.join(collisionPath, 'foreign.txt'), 'utf8'), 'collision bytes\n');
  assert.deepEqual(await generatedEntries(fixture.runPath), [path.basename(collisionPath)]);
});

test('a failure on the third exclusive stage write leaves no output or residue', async (t) => {
  const fixture = await storageFixture(t);
  let writes = 0;
  const fsImpl = fsWith({
    async open(target, flags, ...args) {
      const parent = await descriptorParentBasename(target);
      if (parent.startsWith(STAGE_PREFIX) && (flags & constants.O_WRONLY) !== 0) {
        writes += 1;
        if (writes === 3) throw new Error('RAW_THIRD_WRITE_FAILURE');
      }
      return fs.open(target, flags, ...args);
    }
  });
  const authority = await admitShadowRun({ projectRoot: fixture.root, runArg: fixture.runArg });
  t.after(() => authority.close());

  await assertStableInstallFailure(
    installShadowArtifacts({ authority, files: validArtifactFiles(), fsImpl }),
    'RAW_THIRD_WRITE_FAILURE'
  );
  await assert.rejects(fs.lstat(path.join(fixture.runPath, 'playbook-shadow')), { code: 'ENOENT' });
  assert.equal((await generatedEntries(fixture.runPath)).length, 0);
});

test('failure after backup rename restores the exact old output', async (t) => {
  const fixture = await storageFixture(t);
  const oldFiles = validArtifactFiles('old');
  await writeArtifactDirectory(fixture.runPath, oldFiles);
  let backupRenamed = false;
  const fsImpl = fsWith({
    async rename(source, destination) {
      const sourceName = path.basename(String(source));
      const destinationName = path.basename(String(destination));
      if (sourceName === 'playbook-shadow' && destinationName.startsWith(BACKUP_PREFIX)) {
        backupRenamed = true;
        return fs.rename(source, destination);
      }
      if (backupRenamed && sourceName.startsWith(STAGE_PREFIX) && destinationName === 'playbook-shadow') {
        throw new Error('RAW_AFTER_BACKUP_RENAME');
      }
      return fs.rename(source, destination);
    }
  });
  const authority = await admitShadowRun({ projectRoot: fixture.root, runArg: fixture.runArg });
  t.after(() => authority.close());

  await assertStableInstallFailure(
    installShadowArtifacts({ authority, files: validArtifactFiles('new'), fsImpl }),
    'RAW_AFTER_BACKUP_RENAME'
  );
  assertArtifactBytes(await readArtifactDirectory(fixture.runPath), oldFiles);
  assert.equal((await generatedEntries(fixture.runPath)).length, 0);
});

test('rollback failure is sanitized and leaves the verified backup recoverable', async (t) => {
  const fixture = await storageFixture(t);
  const oldFiles = validArtifactFiles('old');
  await writeArtifactDirectory(fixture.runPath, oldFiles);
  let backupRenamed = false;
  const fsImpl = fsWith({
    async rename(source, destination) {
      const sourceName = path.basename(String(source));
      const destinationName = path.basename(String(destination));
      if (sourceName === 'playbook-shadow' && destinationName.startsWith(BACKUP_PREFIX)) {
        backupRenamed = true;
        return fs.rename(source, destination);
      }
      if (backupRenamed && sourceName.startsWith(STAGE_PREFIX) && destinationName === 'playbook-shadow') {
        throw new Error('RAW_INSTALL_FAILURE');
      }
      if (sourceName.startsWith(BACKUP_PREFIX) && destinationName === 'playbook-shadow') {
        throw new Error('RAW_ROLLBACK_FAILURE');
      }
      return fs.rename(source, destination);
    }
  });
  const authority = await admitShadowRun({ projectRoot: fixture.root, runArg: fixture.runArg });
  t.after(() => authority.close());

  await assertStableInstallFailure(
    installShadowArtifacts({ authority, files: validArtifactFiles('new'), fsImpl }),
    'RAW_INSTALL_FAILURE|RAW_ROLLBACK_FAILURE'
  );
  const generated = await generatedEntries(fixture.runPath);
  assert.equal(generated.length, 1);
  assert.match(generated[0], /^\.playbook-shadow\.backup-/u);
  assertArtifactBytes(await readNamedDirectory(fixture.runPath, generated[0]), oldFiles);
});

test('an unowned collision during final install is preserved', async (t) => {
  const fixture = await storageFixture(t);
  let collided = false;
  const fsImpl = fsWith({
    async rename(source, destination) {
      if (
        !collided
        && path.basename(String(source)).startsWith(STAGE_PREFIX)
        && path.basename(String(destination)) === 'playbook-shadow'
      ) {
        collided = true;
        await fs.mkdir(destination);
        await fs.writeFile(path.join(destination, 'foreign.txt'), 'late collision\n');
      }
      return fs.rename(source, destination);
    }
  });
  const authority = await admitShadowRun({ projectRoot: fixture.root, runArg: fixture.runArg });
  t.after(() => authority.close());

  await assert.rejects(
    installShadowArtifacts({ authority, files: validArtifactFiles(), fsImpl }),
    /SHADOW_INSTALL_FAILED/u
  );
  assert.equal(
    await fs.readFile(path.join(fixture.runPath, 'playbook-shadow', 'foreign.txt'), 'utf8'),
    'late collision\n'
  );
  assert.equal((await generatedEntries(fixture.runPath)).length, 0);
});

test('creates all five artifacts with exact bytes and hashes', async (t) => {
  const fixture = await storageFixture(t);
  const files = validArtifactFiles('created');
  const authority = await admitShadowRun({ projectRoot: fixture.root, runArg: fixture.runArg });
  t.after(() => authority.close());

  const result = await installShadowArtifacts({ authority, files });
  assert.equal(result.status, 'created');
  assert.deepEqual(result.artifact_hashes, expectedHashes(files));
  assertArtifactBytes(await readArtifactDirectory(fixture.runPath), files);
  assert.equal((await generatedEntries(fixture.runPath)).length, 0);
});

test('replaces an owned output while preserving unrelated run bytes', async (t) => {
  const fixture = await storageFixture(t);
  const oldFiles = validArtifactFiles('old');
  const newFiles = validArtifactFiles('new');
  await writeArtifactDirectory(fixture.runPath, oldFiles);
  const unrelatedPath = path.join(fixture.runPath, 'preview.png');
  await fs.writeFile(unrelatedPath, Buffer.from([0, 1, 2, 255]));
  const authority = await admitShadowRun({ projectRoot: fixture.root, runArg: fixture.runArg });
  t.after(() => authority.close());

  const result = await installShadowArtifacts({ authority, files: newFiles });
  assert.equal(result.status, 'replaced');
  assert.deepEqual(result.artifact_hashes, expectedHashes(newFiles));
  assertArtifactBytes(await readArtifactDirectory(fixture.runPath), newFiles);
  assert.deepEqual(await fs.readFile(unrelatedPath), Buffer.from([0, 1, 2, 255]));
  assert.equal((await generatedEntries(fixture.runPath)).length, 0);
});

test('leaves an identical owned output inode-for-inode unchanged', async (t) => {
  const fixture = await storageFixture(t);
  const files = validArtifactFiles('same');
  await writeArtifactDirectory(fixture.runPath, files);
  const outputPath = path.join(fixture.runPath, 'playbook-shadow');
  const before = await inodeSnapshot(outputPath);
  const authority = await admitShadowRun({ projectRoot: fixture.root, runArg: fixture.runArg });
  t.after(() => authority.close());

  const result = await installShadowArtifacts({ authority, files });
  assert.equal(result.status, 'unchanged');
  assert.deepEqual(result.artifact_hashes, expectedHashes(files));
  assert.deepEqual(await inodeSnapshot(outputPath), before);
  assertArtifactBytes(await readArtifactDirectory(fixture.runPath), files);
  assert.equal((await generatedEntries(fixture.runPath)).length, 0);
});

test('rejects missing, extra, and non-byte artifact values before staging', async (t) => {
  for (const scenario of [
    {
      name: 'missing',
      mutate(files) {
        delete files['report.md'];
      }
    },
    {
      name: 'extra',
      mutate(files) {
        files['extra.txt'] = 'no';
      }
    },
    {
      name: 'non-byte',
      mutate(files) {
        files['report.md'] = 42;
      }
    }
  ]) {
    await t.test(scenario.name, async (t) => {
      const fixture = await storageFixture(t);
      const files = validArtifactFiles();
      scenario.mutate(files);
      const authority = await admitShadowRun({ projectRoot: fixture.root, runArg: fixture.runArg });
      t.after(() => authority.close());
      await assert.rejects(
        installShadowArtifacts({ authority, files }),
        /INVALID_ARGUMENT/u
      );
      assert.equal((await generatedEntries(fixture.runPath)).length, 0);
    });
  }
});

async function storageFixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-shadow-storage-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runArg = 'out/run/candidates/round-01/candidate-01';
  const runPath = path.join(root, ...runArg.split('/'));
  const blueprintBytes = options.blueprintBytes ?? Buffer.from(
    '{"workflow":"construction_method_v1","prompt":"exact bytes 测试"}\n'
  );
  await fs.mkdir(runPath, { recursive: true });
  await fs.writeFile(path.join(runPath, 'blueprint.json'), blueprintBytes);
  if (options.foreignOutput) {
    const outputPath = path.join(runPath, 'playbook-shadow');
    await fs.mkdir(outputPath);
    await fs.writeFile(path.join(outputPath, 'foreign.txt'), 'foreign bytes\n');
  }
  return { root, runArg, runPath, blueprintBytes };
}

async function invalidAdmissionScenarios(t, fixture) {
  const outside = path.join(fixture.root, 'outside-run');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'blueprint.json'), fixture.blueprintBytes);

  const nonDirectory = path.join(fixture.root, 'out', 'not-a-directory');
  await fs.writeFile(nonDirectory, 'file\n');

  const realParent = path.join(fixture.root, 'out', 'real-parent');
  const realNestedRun = path.join(realParent, 'child');
  await fs.mkdir(realNestedRun, { recursive: true });
  await fs.writeFile(path.join(realNestedRun, 'blueprint.json'), fixture.blueprintBytes);
  await fs.symlink(realParent, path.join(fixture.root, 'out', 'linked-parent'));
  await fs.symlink(fixture.runPath, path.join(fixture.root, 'out', 'linked-run'));

  const blueprintLinkRun = path.join(fixture.root, 'out', 'blueprint-link-run');
  const blueprintTarget = path.join(fixture.root, 'blueprint-target.json');
  await fs.mkdir(blueprintLinkRun);
  await fs.writeFile(blueprintTarget, fixture.blueprintBytes);
  await fs.symlink(blueprintTarget, path.join(blueprintLinkRun, 'blueprint.json'));

  const missingBlueprintRun = path.join(fixture.root, 'out', 'missing-blueprint-run');
  const directoryBlueprintRun = path.join(fixture.root, 'out', 'directory-blueprint-run');
  await fs.mkdir(missingBlueprintRun);
  await fs.mkdir(path.join(directoryBlueprintRun, 'blueprint.json'), { recursive: true });

  const linkedProject = `${fixture.root}-link`;
  await fs.symlink(fixture.root, linkedProject);
  t.after(() => fs.rm(linkedProject, { force: true }));

  const outLinkProject = path.join(fixture.root, 'out-link-project');
  await fs.mkdir(outLinkProject);
  await fs.symlink(path.join(fixture.root, 'out'), path.join(outLinkProject, 'out'));

  return [
    { name: 'outside', runArg: outside, code: 'RUN_OUTSIDE_OUT_ROOT' },
    { name: 'out-itself', runArg: 'out', code: 'RUN_OUTSIDE_OUT_ROOT' },
    { name: 'missing', runArg: 'out/missing-run', code: 'INVALID_ARGUMENT' },
    { name: 'non-directory', runArg: 'out/not-a-directory', code: 'INVALID_ARGUMENT' },
    { name: 'symlinked-project-root', projectRoot: linkedProject, runArg: fixture.runArg, code: 'SYMLINK_NOT_ALLOWED' },
    { name: 'symlinked-out', projectRoot: outLinkProject, runArg: 'out/run', code: 'SYMLINK_NOT_ALLOWED' },
    { name: 'symlinked-parent', runArg: 'out/linked-parent/child', code: 'SYMLINK_NOT_ALLOWED' },
    { name: 'symlinked-run', runArg: 'out/linked-run', code: 'SYMLINK_NOT_ALLOWED' },
    { name: 'symlinked-blueprint', runArg: 'out/blueprint-link-run', code: 'SYMLINK_NOT_ALLOWED' },
    { name: 'missing-blueprint', runArg: 'out/missing-blueprint-run', code: 'BLUEPRINT_MISSING' },
    { name: 'directory-blueprint', runArg: 'out/directory-blueprint-run', code: 'BLUEPRINT_MISSING' }
  ];
}

function validArtifactFiles(marker = 'new') {
  const bodyFiles = {
    'review.json': Buffer.from(`{"artifact":"review","marker":"${marker}"}\n`),
    'prompt-packet.json': Buffer.from(`{"artifact":"prompt","marker":"${marker}"}\n`),
    'explanation.json': Buffer.from(`{"artifact":"explanation","marker":"${marker}"}\n`),
    'report.md': Buffer.from(`# Shadow report\n\n${marker}\n`)
  };
  const manifest = {
    schema_version: 1,
    evaluator_version: '0.1.0',
    playbook_version: '0.1.0',
    school_id: 'heihui-jileniao',
    blueprint_sha256: 'a'.repeat(64),
    rule_corpus_sha256: 'b'.repeat(64),
    mode: 'mock',
    explanation_status: 'available',
    managed_paths: [...SHADOW_OUTPUT_FILES],
    artifact_hashes: Object.fromEntries(BODY_FILES.map((name) => [name, testHash(bodyFiles[name])]))
  };
  return {
    'manifest.json': Buffer.from(`${JSON.stringify(manifest)}\n`),
    ...bodyFiles
  };
}

function expectedHashes(files) {
  return Object.fromEntries(SHADOW_OUTPUT_FILES.map((name) => [name, testHash(files[name])]));
}

function testHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function writeArtifactDirectory(runPath, files) {
  const outputPath = path.join(runPath, 'playbook-shadow');
  await fs.mkdir(outputPath);
  await Promise.all(SHADOW_OUTPUT_FILES.map((name) => fs.writeFile(path.join(outputPath, name), files[name])));
}

async function readArtifactDirectory(runPath) {
  return readNamedDirectory(runPath, 'playbook-shadow');
}

async function readNamedDirectory(runPath, basename) {
  return Object.fromEntries(await Promise.all(SHADOW_OUTPUT_FILES.map(async (name) => [
    name,
    await fs.readFile(path.join(runPath, basename, name))
  ])));
}

function assertArtifactBytes(actual, expected) {
  assert.deepEqual(Object.keys(actual), SHADOW_OUTPUT_FILES);
  for (const name of SHADOW_OUTPUT_FILES) assert.deepEqual(actual[name], Buffer.from(expected[name]), name);
}

async function inodeSnapshot(outputPath) {
  const paths = [outputPath, ...SHADOW_OUTPUT_FILES.map((name) => path.join(outputPath, name))];
  return Promise.all(paths.map(async (target) => {
    const stat = await fs.lstat(target);
    return { dev: stat.dev, ino: stat.ino };
  }));
}

async function generatedEntries(runPath) {
  return (await fs.readdir(runPath)).filter((name) => (
    name.startsWith(STAGE_PREFIX) || name.startsWith(BACKUP_PREFIX)
  )).sort();
}

async function snapshotTree(root) {
  const snapshot = [];
  await visit(root, '');
  return snapshot;

  async function visit(absolute, relative) {
    const stat = await fs.lstat(absolute);
    if (stat.isSymbolicLink()) {
      snapshot.push([relative, 'symlink', await fs.readlink(absolute)]);
      return;
    }
    if (stat.isDirectory()) {
      snapshot.push([relative, 'directory']);
      for (const name of (await fs.readdir(absolute)).sort()) {
        await visit(path.join(absolute, name), relative ? `${relative}/${name}` : name);
      }
      return;
    }
    snapshot.push([relative, 'file', (await fs.readFile(absolute)).toString('base64')]);
  }
}

function fsWith(overrides) {
  return new Proxy(fs, {
    get(target, property) {
      return Object.hasOwn(overrides, property) ? overrides[property] : Reflect.get(target, property);
    }
  });
}

async function descriptorParentBasename(target) {
  const parent = path.dirname(String(target));
  if (!parent.startsWith('/proc/self/fd/')) return path.basename(parent);
  return path.basename(await fs.readlink(parent));
}

async function assertStableInstallFailure(promise, forbiddenPattern) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, 'SHADOW_INSTALL_FAILED');
    assert.equal(error.message, 'SHADOW_INSTALL_FAILED');
    assert.doesNotMatch(error.message, new RegExp(forbiddenPattern, 'u'));
    return true;
  });
}
