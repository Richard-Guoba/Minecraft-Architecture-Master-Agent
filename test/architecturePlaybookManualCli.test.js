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

test('managed writer rejects a parent symlink that escapes the project', async (t) => {
  const projectRoot = await temporaryRoot(t, 'playbook-manual-link-');
  const outsideRoot = await temporaryRoot(t, 'playbook-manual-outside-');
  const manualRoot = path.join(projectRoot, 'docs/architecture-playbook/manual');
  await fs.mkdir(path.dirname(manualRoot), { recursive: true });
  await fs.mkdir(path.join(
    projectRoot,
    'docs/architecture-playbook/rules/schools/heihui-jileniao'
  ), { recursive: true });
  await fs.symlink(outsideRoot, manualRoot, 'dir');

  await assert.rejects(
    writeManagedPlaybookArtifacts({
      projectRoot,
      artifacts: artifactFixture('escaped')
    }),
    (error) => {
      assert.match(error.message, /PLAYBOOK_MANUAL_SYMLINK_ESCAPE/u);
      assert.doesNotMatch(error.message, new RegExp(escapeRegExp(outsideRoot), 'u'));
      assert.doesNotMatch(error.message, /\.local\/|\/home\//u);
      return true;
    }
  );
  assert.deepEqual(await fs.readdir(outsideRoot), []);
});

test('managed writer stages and syncs every artifact before fixed-order installation', async (t) => {
  const fixture = await managedWriteFixture(t, {
    originals: P3_MANAGED_ARTIFACT_PATHS.map((_, index) => `old-${index}\n`)
  });
  const events = [];
  const fsImpl = tracingFs(fs, fixture.projectRoot, events);

  const summary = await writeManagedPlaybookArtifacts({
    projectRoot: fixture.projectRoot,
    artifacts: fixture.artifacts,
    fsImpl
  });

  const firstInstall = events.findIndex((event) => event.startsWith('rename:'));
  const beforeInstall = events.slice(0, firstInstall);
  assert.equal(beforeInstall.filter((event) => event === 'open:wx').length, 5);
  assert.equal(beforeInstall.filter((event) => event === 'sync').length, 5);
  assert.equal(beforeInstall.filter((event) => event === 'close').length, 5);
  assert.deepEqual(
    events.filter((event) => event.startsWith('rename:')),
    P3_MANAGED_ARTIFACT_PATHS.map((artifactPath) => `rename:${artifactPath}`)
  );
  assert.equal(summary.status, 'updated');
  assert.equal(summary.artifact_count, 5);
  assert.deepEqual(Object.keys(summary.artifact_hashes), P3_MANAGED_ARTIFACT_PATHS);
  assert.deepEqual(await fixture.readAll(), fixture.wantedBytes);
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
      assert.doesNotMatch(error.message, new RegExp(escapeRegExp(fixture.projectRoot), 'u'));
      assert.doesNotMatch(error.message, /\.local\/|simulated private failure/u);
      return true;
    }
  );
  assert.deepEqual(await fixture.readAll(), fixture.originalBytes);
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
  return {
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
    readAll: () => readManagedState(projectRoot)
  };
}

function tracingFs(fsImpl, projectRoot, events) {
  return new Proxy(fsImpl, {
    get(target, property) {
      if (property === 'open') {
        return async (temporary, flags, mode) => {
          events.push(`open:${flags}`);
          const handle = await target.open(temporary, flags, mode);
          return {
            writeFile: (...args) => handle.writeFile(...args),
            sync: async () => {
              events.push('sync');
              await handle.sync();
            },
            close: async () => {
              events.push('close');
              await handle.close();
            }
          };
        };
      }
      if (property === 'rename') {
        return async (source, destination) => {
          const relative = path.relative(projectRoot, destination);
          if (P3_MANAGED_ARTIFACT_PATHS.includes(relative)) {
            events.push(`rename:${relative}`);
          }
          await target.rename(source, destination);
        };
      }
      return Reflect.get(target, property);
    }
  });
}

function failOnThirdInstallFs(fsImpl, projectRoot) {
  let installCount = 0;
  return new Proxy(fsImpl, {
    get(target, property) {
      if (property !== 'rename') return Reflect.get(target, property);
      return async (source, destination) => {
        const relative = path.relative(projectRoot, destination);
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
        const relative = path.relative(projectRoot, destination);
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
