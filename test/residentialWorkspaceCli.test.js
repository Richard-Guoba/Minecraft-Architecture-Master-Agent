import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  parseResidentialWorkspaceArgs
} from '../src/runResidentialWorkspace.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const RUNNER = path.join(ROOT, 'src', 'runResidentialWorkspace.js');

test('residential workspace parser accepts init and status only', () => {
  assert.equal(
    parseResidentialWorkspaceArgs(['init'], { cwd: ROOT }).command,
    'init'
  );
  assert.equal(
    parseResidentialWorkspaceArgs(['status'], { cwd: ROOT }).command,
    'status'
  );
  assert.throws(
    () => parseResidentialWorkspaceArgs(['train'], { cwd: ROOT }),
    /ARGUMENT_COMMAND_INVALID/u
  );
  assert.throws(
    () => parseResidentialWorkspaceArgs(['status', '--unknown', 'x'], { cwd: ROOT }),
    /ARGUMENT_UNKNOWN/u
  );
});

test('residential workspace CLI initializes and reports a fixture project', async (t) => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'residential-cli-project-')
  );
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  await fs.mkdir(path.join(projectRoot, '.local'));
  const root = path.join(projectRoot, '.local', 'residential-model');

  const initialized = runCli(['init', '--root', root], {
    RESIDENTIAL_PROJECT_ROOT: projectRoot
  });
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.match(initialized.stdout, /^workspace_status=ready$/mu);
  assert.match(initialized.stdout, /source_profiles=0/u);

  const status = runCli(['status', '--root', root], {
    RESIDENTIAL_PROJECT_ROOT: projectRoot
  });
  assert.equal(status.status, 0, status.stderr);
  assert.equal(status.stdout, initialized.stdout);
});

test('package exposes a non-training workspace command and ignores local data', async () => {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(ROOT, 'package.json'), 'utf8')
  );
  const ignore = await fs.readFile(path.join(ROOT, '.gitignore'), 'utf8');
  assert.equal(
    packageJson.scripts['residential:workspace'],
    'node src/runResidentialWorkspace.js'
  );
  assert.match(ignore, /^\.local\/residential-model\/$/mu);
  assert.deepEqual(
    Object.keys(packageJson.scripts)
      .filter((name) => name.startsWith('training:'))
      .sort(),
    [
      'training:evaluate',
      'training:prepare',
      'training:status',
      'training:train'
    ]
  );
});

function runCli(args, environment = {}) {
  return spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...environment }
  });
}
