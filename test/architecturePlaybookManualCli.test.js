import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  checkManagedPlaybookArtifacts,
  parseArchitecturePlaybookManualArgs,
  writeManagedPlaybookArtifacts
} from '../src/runArchitecturePlaybookManual.js';
import {
  P3_MANAGED_ARTIFACT_PATHS
} from '../src/playbook/manual/p3AdmissionPolicy.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLI_PATH = path.join(ROOT, 'src/runArchitecturePlaybookManual.js');
const execFileAsync = promisify(execFile);
const MANAGED_PARENT_PATHS = Object.freeze([
  'docs/architecture-playbook/manual',
  'docs/architecture-playbook/rules/schools/heihui-jileniao'
]);
const TRANSACTION_TEMP = /\.playbook-manual-(?:stage|rollback)-/u;

test('manual CLI accepts build and check only', () => {
  assert.deepEqual(parseArchitecturePlaybookManualArgs(['build']), {
    command: 'build'
  });
  assert.deepEqual(parseArchitecturePlaybookManualArgs(['check']), {
    command: 'check'
  });
  for (const argv of [
    [],
    ['publish'],
    ['build', '--output', '/tmp/x'],
    ['build', '--overwrite'],
    ['check', '--network']
  ]) {
    assert.throws(
      () => parseArchitecturePlaybookManualArgs(argv),
      /PLAYBOOK_MANUAL_ARGUMENT_INVALID/u
    );
  }
});

test('managed writer rejects every path outside the exact lexical allowlist', async (t) => {
  const projectRoot = await temporaryRoot(t, 'playbook-manual-path-');
  const artifacts = artifactFixture('wanted');
  artifacts['docs/architecture-playbook/manual/../escape.md'] = 'escape\n';

  await assert.rejects(
    writeManagedPlaybookArtifacts({ projectRoot, artifacts }),
    /PLAYBOOK_MANUAL_PATH_INVALID/u
  );
  await assert.rejects(fs.access(path.join(
    projectRoot,
    'docs/architecture-playbook/escape.md'
  )));
});

test('managed writer rejects escaping symlink parents in both managed trees', async (t) => {
  for (const [index, parentPath] of MANAGED_PARENT_PATHS.entries()) {
    await t.test(parentPath, async (t) => {
      const projectRoot = await temporaryRoot(t, `playbook-manual-link-${index}-`);
      const outsideRoot = await temporaryRoot(t, `playbook-manual-outside-${index}-`);
      const managedParent = path.join(projectRoot, parentPath);
      await fs.mkdir(path.dirname(managedParent), { recursive: true });
      for (const otherParent of MANAGED_PARENT_PATHS) {
        if (otherParent !== parentPath) {
          await fs.mkdir(path.join(projectRoot, otherParent), { recursive: true });
        }
      }
      await fs.symlink(outsideRoot, managedParent, 'dir');

      await assert.rejects(
        writeManagedPlaybookArtifacts({
          projectRoot,
          artifacts: artifactFixture('escaped')
        }),
        (error) => {
          assert.match(error.message, /PLAYBOOK_MANUAL_SYMLINK_ESCAPE/u);
          assert.doesNotMatch(
            error.message,
            new RegExp(escapeRegExp(outsideRoot), 'u')
          );
          assert.doesNotMatch(error.message, /\.local\/|\/home\//u);
          return true;
        }
      );
      assert.deepEqual(await fs.readdir(outsideRoot), []);
    });
  }
});

test('managed writer rejects target symlinks without touching their referents', async (t) => {
  for (const [index, artifactPath] of [
    P3_MANAGED_ARTIFACT_PATHS[0],
    P3_MANAGED_ARTIFACT_PATHS[3]
  ].entries()) {
    await t.test(artifactPath, async (t) => {
      const fixture = await managedWriteFixture(t, {
        originals: P3_MANAGED_ARTIFACT_PATHS.map(() => null)
      });
      const outsideRoot = await temporaryRoot(t, `playbook-target-outside-${index}-`);
      const outsideTarget = path.join(outsideRoot, 'referent');
      await fs.writeFile(outsideTarget, 'outside-original\n', 'utf8');
      await fs.symlink(
        outsideTarget,
        path.join(fixture.projectRoot, artifactPath),
        'file'
      );
      const before = await fixture.readTree();

      await assert.rejects(
        writeManagedPlaybookArtifacts({
          projectRoot: fixture.projectRoot,
          artifacts: fixture.artifacts
        }),
        /PLAYBOOK_MANUAL_SYMLINK_ESCAPE/u
      );

      assert.equal(await fs.readFile(outsideTarget, 'utf8'), 'outside-original\n');
      assert.deepEqual(await fixture.readTree(), before);
      await assertNoTransactionTemps(fixture.projectRoot);
    });
  }
});

test('managed writer preserves an unowned wx collision and installs nothing', async (t) => {
  const fixture = await managedWriteFixture(t, {
    originals: P3_MANAGED_ARTIFACT_PATHS.map((_, index) => `old-${index}\n`)
  });
  const collisionPath = `${path.join(
    fixture.projectRoot,
    P3_MANAGED_ARTIFACT_PATHS[4]
  )}.playbook-manual-stage-${process.pid}-5-4.tmp`;
  await fs.writeFile(collisionPath, 'unowned-collision\n', 'utf8');
  const before = await fixture.readTree();

  await assert.rejects(
    writeManagedPlaybookArtifacts({
      projectRoot: fixture.projectRoot,
      artifacts: fixture.artifacts
    }),
    /PLAYBOOK_MANUAL_STAGE_FAILED/u
  );

  assert.deepEqual(await fixture.readTree(), before);
  assert.equal(await fs.readFile(collisionPath, 'utf8'), 'unowned-collision\n');
});

test('managed writer installs exact bytes without transaction residue', async (t) => {
  const fixture = await managedWriteFixture(t, {
    originals: P3_MANAGED_ARTIFACT_PATHS.map((_, index) => `old-${index}\n`)
  });

  const summary = await writeManagedPlaybookArtifacts({
    projectRoot: fixture.projectRoot,
    artifacts: fixture.artifacts
  });

  assert.equal(summary.status, 'updated');
  assert.equal(summary.artifact_count, 5);
  assert.deepEqual(Object.keys(summary.artifact_hashes), P3_MANAGED_ARTIFACT_PATHS);
  assert.deepEqual(await fixture.readAll(), fixture.wantedBytes);
  await assertNoTransactionTemps(fixture.projectRoot);
});

test('managed writer restores installed files after a later rename failure', async (t) => {
  const fixture = await managedWriteFixture(t, {
    originals: ['old-0\n', null, 'old-2\n', null, 'old-4\n']
  });

  await assert.rejects(
    writeManagedPlaybookArtifacts({
      projectRoot: fixture.projectRoot,
      artifacts: fixture.artifacts,
      fsImpl: failOnThirdInstallFs(fs, fixture.projectRoot)
    }),
    (error) => {
      assert.match(error.message, /PLAYBOOK_MANUAL_INSTALL_FAILED/u);
      assert.match(error.message, new RegExp(
        escapeRegExp(P3_MANAGED_ARTIFACT_PATHS[2]),
        'u'
      ));
      assert.doesNotMatch(error.message, new RegExp(escapeRegExp(fixture.projectRoot), 'u'));
      assert.doesNotMatch(error.message, /\.local\/|simulated private failure/u);
      return true;
    }
  );
  assert.deepEqual(await fixture.readAll(), fixture.originalBytes);
  assert.deepEqual(await fixture.readTree(), fixture.originalTree);
  await assertNoTransactionTemps(fixture.projectRoot);
});

test('managed writer reports rollback failure with managed relative paths only', async (t) => {
  const fixture = await managedWriteFixture(t, {
    originals: ['old-0\n', null, 'old-2\n', null, 'old-4\n']
  });
  const fsImpl = failInstallAndRollbackFs(fs, fixture.projectRoot);

  await assert.rejects(
    writeManagedPlaybookArtifacts({
      projectRoot: fixture.projectRoot,
      artifacts: fixture.artifacts,
      fsImpl
    }),
    (error) => {
      assert.match(error.message, /PLAYBOOK_MANUAL_ROLLBACK_FAILED/u);
      assert.match(error.message, new RegExp(
        escapeRegExp(P3_MANAGED_ARTIFACT_PATHS[0]),
        'u'
      ));
      assert.doesNotMatch(error.message, new RegExp(escapeRegExp(fixture.projectRoot), 'u'));
      assert.doesNotMatch(error.message, /\.local\/|simulated private failure/u);
      return true;
    }
  );
  await assertNoTransactionTemps(fixture.projectRoot);
  const state = await fixture.readAll();
  assert.equal(state[P3_MANAGED_ARTIFACT_PATHS[1]], null);
  assert.deepEqual(
    state[P3_MANAGED_ARTIFACT_PATHS[2]],
    fixture.originalBytes[P3_MANAGED_ARTIFACT_PATHS[2]]
  );
  assert.equal(state[P3_MANAGED_ARTIFACT_PATHS[3]], null);
  assert.deepEqual(
    state[P3_MANAGED_ARTIFACT_PATHS[4]],
    fixture.originalBytes[P3_MANAGED_ARTIFACT_PATHS[4]]
  );
});

test('managed writer surfaces a real cleanup failure with its owned residue', {
  timeout: 10_000
}, async (t) => {
  const fixture = await managedWriteFixture(t, {
    originals: P3_MANAGED_ARTIFACT_PATHS.map((_, index) => `old-${index}\n`),
    wantedPrefix: 'x'.repeat(2 * 1024 * 1024)
  });
  const parent = path.join(fixture.projectRoot, MANAGED_PARENT_PATHS[0]);
  const controller = new AbortController();
  t.after(() => controller.abort());
  const lockPromise = chmodParentOnFirstStage(parent, controller.signal);
  const writePromise = writeManagedPlaybookArtifacts({
    projectRoot: fixture.projectRoot,
    artifacts: fixture.artifacts
  });

  await lockPromise;
  try {
    await assert.rejects(writePromise, /PLAYBOOK_MANUAL_CLEANUP_FAILED/u);
  } finally {
    await fs.chmod(parent, 0o700);
  }
  const residue = (await fs.readdir(parent)).filter((name) =>
    TRANSACTION_TEMP.test(name));
  assert.equal(residue.length > 0, true);
  for (const name of residue) await fs.rm(path.join(parent, name));
  assert.deepEqual(await fixture.readAll(), fixture.originalBytes);
});

test('managed writer fails closed when either managed parent is swapped mid-stage', {
  timeout: 15_000
}, async (t) => {
  for (const [index, parentPath] of MANAGED_PARENT_PATHS.entries()) {
    await t.test(parentPath, { timeout: 7_000 }, async (t) => {
      const fixture = await managedWriteFixture(t, {
        originals: P3_MANAGED_ARTIFACT_PATHS.map(() => null),
        wantedPrefix: 'x'.repeat(2 * 1024 * 1024)
      });
      const outsideRoot = await temporaryRoot(t, `playbook-swap-outside-${index}-`);
      const managedParent = path.join(fixture.projectRoot, parentPath);
      const heldParent = `${managedParent}-held`;
      const sentinelPath = P3_MANAGED_ARTIFACT_PATHS.find(
        (artifactPath) => path.dirname(artifactPath) === parentPath
      );
      const outsideSentinel = path.join(outsideRoot, path.basename(sentinelPath));
      await fs.writeFile(outsideSentinel, 'outside-original\n', 'utf8');
      const outsideBefore = await filesystemContentSnapshot(outsideRoot);
      const controller = new AbortController();
      t.after(() => controller.abort());
      const swapPromise = swapParentOnFirstStage({
        managedParent,
        heldParent,
        outsideRoot,
        signal: controller.signal
      });
      const writePromise = writeManagedPlaybookArtifacts({
        projectRoot: fixture.projectRoot,
        artifacts: fixture.artifacts
      });

      await swapPromise;
      await assert.rejects(
        writePromise,
        (error) => {
          assert.match(
            error.message,
            /PLAYBOOK_MANUAL_(?:SYMLINK_ESCAPE|INSTALL_FAILED)/u
          );
          assert.doesNotMatch(error.message, /\/proc\/|\/tmp\/|\/home\//u);
          return true;
        }
      );

      assert.deepEqual(
        await filesystemContentSnapshot(outsideRoot),
        outsideBefore
      );
      assert.deepEqual(await filesystemContentSnapshot(heldParent), []);
      await assertDirectoryHasNoTransactionTemps(heldParent);
      await assertDirectoryHasNoTransactionTemps(outsideRoot);
    });
  }
});

test('managed check returns sorted missing and drifted paths without writing', async (t) => {
  const fixture = await managedWriteFixture(t, {
    originals: P3_MANAGED_ARTIFACT_PATHS.map((_, index) => `wanted-${index}\n`),
    wantedPrefix: 'wanted'
  });
  await fs.rm(path.join(fixture.projectRoot, P3_MANAGED_ARTIFACT_PATHS[4]));
  await fs.writeFile(
    path.join(fixture.projectRoot, P3_MANAGED_ARTIFACT_PATHS[1]),
    'drifted\n',
    'utf8'
  );
  const before = await filesystemSnapshot(fixture.projectRoot);

  const summary = await checkManagedPlaybookArtifacts({
    projectRoot: fixture.projectRoot,
    artifacts: fixture.artifacts
  });

  assert.equal(summary.status, 'drift');
  assert.equal(summary.artifact_count, 5);
  assert.equal(summary.managed_artifact_drift_count, 2);
  assert.deepEqual(summary.drift_paths, [
    P3_MANAGED_ARTIFACT_PATHS[1],
    P3_MANAGED_ARTIFACT_PATHS[4]
  ].sort());
  assert.deepEqual(await filesystemSnapshot(fixture.projectRoot), before);
});

test('manual CLI builds, checks, and reports drift with safe fixed summaries', async (t) => {
  const projectRoot = await checkedInputFixture(t);
  const build = await runCli(projectRoot, 'build');

  assert.equal(build.code, 0);
  assert.equal(build.stderr, '');
  assert.equal(build.stdout, [
    'playbook_status=created',
    'playbook_version=0.1.0',
    'reviewed_rule_count=21',
    'core_procedure_count=15',
    'case_pattern_count=6',
    'artifact_count=5',
    ''
  ].join('\n'));
  assertSafeProcessOutput(build, projectRoot);

  const check = await runCli(projectRoot, 'check');
  assert.equal(check.code, 0);
  assert.equal(check.stderr, '');
  assert.match(check.stdout, /^playbook_status=current$/mu);
  assert.match(check.stdout, /^managed_artifact_drift_count=0$/mu);
  assertSafeProcessOutput(check, projectRoot);

  await fs.writeFile(
    path.join(projectRoot, P3_MANAGED_ARTIFACT_PATHS[0]),
    'drifted\n',
    'utf8'
  );
  const drift = await runCli(projectRoot, 'check');
  assert.equal(drift.code, 1);
  assert.equal(drift.stdout, '');
  assert.match(drift.stderr, /PLAYBOOK_MANUAL_ARTIFACT_DRIFT/u);
  assert.match(drift.stderr, new RegExp(
    escapeRegExp(P3_MANAGED_ARTIFACT_PATHS[0]),
    'u'
  ));
  assertSafeProcessOutput(drift, projectRoot);
});

function artifactFixture(prefix = 'wanted') {
  return Object.fromEntries(P3_MANAGED_ARTIFACT_PATHS.map(
    (artifactPath, index) => [artifactPath, `${prefix}-${index}\n`]
  ));
}

async function managedWriteFixture(t, {
  originals = P3_MANAGED_ARTIFACT_PATHS.map((_, index) => `old-${index}\n`),
  wantedPrefix = 'wanted'
} = {}) {
  const projectRoot = await temporaryRoot(t, 'playbook-manual-write-');
  const artifacts = artifactFixture(wantedPrefix);
  for (const artifactPath of P3_MANAGED_ARTIFACT_PATHS) {
    await fs.mkdir(path.dirname(path.join(projectRoot, artifactPath)), {
      recursive: true
    });
  }
  for (const [index, artifactPath] of P3_MANAGED_ARTIFACT_PATHS.entries()) {
    if (originals[index] !== null) {
      await fs.writeFile(path.join(projectRoot, artifactPath), originals[index], 'utf8');
    }
  }
  const fixture = {
    projectRoot,
    artifacts,
    originalBytes: Object.fromEntries(P3_MANAGED_ARTIFACT_PATHS.map(
      (artifactPath, index) => [
        artifactPath,
        originals[index] === null ? null : Buffer.from(originals[index])
      ]
    )),
    wantedBytes: Object.fromEntries(P3_MANAGED_ARTIFACT_PATHS.map(
      (artifactPath) => [artifactPath, Buffer.from(artifacts[artifactPath])]
    )),
    readAll: () => readManagedState(projectRoot),
    readTree: () => managedFilesystemState(projectRoot)
  };
  fixture.originalTree = await fixture.readTree();
  return fixture;
}

function failOnThirdInstallFs(fsImpl, projectRoot) {
  let installCount = 0;
  return new Proxy(fsImpl, {
    get(target, property) {
      if (property !== 'rename') return Reflect.get(target, property);
      return async (source, destination) => {
        const relative = managedDestinationPath(destination, projectRoot);
        if (P3_MANAGED_ARTIFACT_PATHS.includes(relative)) {
          installCount += 1;
          if (installCount === 3) {
            const error = new Error(
              `${projectRoot}/.local/simulated private failure`
            );
            error.code = 'EIO';
            throw error;
          }
        }
        await target.rename(source, destination);
      };
    }
  });
}

function failInstallAndRollbackFs(fsImpl, projectRoot) {
  let installCount = 0;
  let installFailed = false;
  return new Proxy(fsImpl, {
    get(target, property) {
      if (property !== 'rename') return Reflect.get(target, property);
      return async (source, destination) => {
        const relative = managedDestinationPath(destination, projectRoot);
        if (P3_MANAGED_ARTIFACT_PATHS.includes(relative)) {
          if (!installFailed) {
            installCount += 1;
            if (installCount === 3) {
              installFailed = true;
              throw new Error(`${projectRoot}/.local/simulated private failure`);
            }
          } else if (relative === P3_MANAGED_ARTIFACT_PATHS[0]) {
            throw new Error(`${projectRoot}/.local/simulated private failure`);
          }
        }
        await target.rename(source, destination);
      };
    }
  });
}

function managedDestinationPath(destination, projectRoot) {
  const lexical = path.relative(projectRoot, destination);
  if (P3_MANAGED_ARTIFACT_PATHS.includes(lexical)) return lexical;
  return P3_MANAGED_ARTIFACT_PATHS.find((artifactPath) =>
    path.basename(artifactPath) === path.basename(destination));
}

async function readManagedState(projectRoot) {
  const state = {};
  for (const artifactPath of P3_MANAGED_ARTIFACT_PATHS) {
    try {
      state[artifactPath] = await fs.readFile(path.join(projectRoot, artifactPath));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      state[artifactPath] = null;
    }
  }
  return state;
}

async function filesystemSnapshot(root) {
  const rows = [];
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      const stat = await fs.lstat(absolute);
      if (entry.isDirectory()) {
        rows.push([relative, 'directory', stat.mtimeNs]);
        await visit(absolute);
      } else {
        rows.push([relative, 'file', stat.mtimeNs, await fs.readFile(absolute)]);
      }
    }
  }
  await visit(root);
  return rows;
}

async function managedFilesystemState(projectRoot) {
  return Promise.all(MANAGED_PARENT_PATHS.map(async (parentPath) => [
    parentPath,
    await filesystemContentSnapshot(path.join(projectRoot, parentPath))
  ]));
}

async function filesystemContentSnapshot(root) {
  const rows = [];
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return rows;
    throw error;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      rows.push([entry.name, 'directory']);
    } else if (entry.isSymbolicLink()) {
      rows.push([entry.name, 'symlink', await fs.readlink(absolute)]);
    } else {
      rows.push([entry.name, 'file', await fs.readFile(absolute)]);
    }
  }
  return rows;
}

async function assertNoTransactionTemps(root) {
  for (const parentPath of MANAGED_PARENT_PATHS) {
    await assertDirectoryHasNoTransactionTemps(path.join(root, parentPath));
  }
}

async function assertDirectoryHasNoTransactionTemps(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  assert.deepEqual(
    entries.filter((name) => TRANSACTION_TEMP.test(name)),
    [],
    directory
  );
}

async function chmodParentOnFirstStage(parent, signal) {
  for await (const event of fs.watch(parent, { signal })) {
    if (String(event.filename).includes('.playbook-manual-stage-')) {
      await fs.chmod(parent, 0o500);
      return;
    }
  }
  throw new Error('stage event not observed');
}

async function swapParentOnFirstStage({
  managedParent,
  heldParent,
  outsideRoot,
  signal
}) {
  for await (const event of fs.watch(managedParent, { signal })) {
    if (String(event.filename).includes('.playbook-manual-stage-')) {
      await fs.rename(managedParent, heldParent);
      await fs.symlink(outsideRoot, managedParent, 'dir');
      return;
    }
  }
  throw new Error('stage event not observed');
}

async function checkedInputFixture(t) {
  const projectRoot = await temporaryRoot(t, 'playbook-manual-cli-');
  await fs.cp(
    path.join(ROOT, 'docs/architecture-playbook/course'),
    path.join(projectRoot, 'docs/architecture-playbook/course'),
    { recursive: true }
  );
  await fs.cp(
    path.join(ROOT, 'docs/architecture-playbook/rules/schools/heihui-jileniao'),
    path.join(
      projectRoot,
      'docs/architecture-playbook/rules/schools/heihui-jileniao'
    ),
    { recursive: true }
  );
  return projectRoot;
}

async function runCli(projectRoot, command) {
  try {
    const result = await execFileAsync(process.execPath, [CLI_PATH, command], {
      cwd: projectRoot,
      env: {
        ...process.env,
        PLAYBOOK_PROJECT_ROOT: projectRoot
      },
      encoding: 'utf8'
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? ''
    };
  }
}

function assertSafeProcessOutput(result, projectRoot) {
  const output = `${result.stdout}${result.stderr}`;
  assert.doesNotMatch(output, new RegExp(escapeRegExp(projectRoot), 'u'));
  assert.doesNotMatch(output, /\.local\/|\/home\//u);
}

async function temporaryRoot(t, prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
