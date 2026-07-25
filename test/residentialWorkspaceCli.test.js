import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  parseResidentialWorkspaceArgs
} from '../src/runResidentialWorkspace.js';
import {
  classicSchematic,
  writeBatchFixture
} from './fixtures/residentialIntakeFixtures.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const RUNNER = path.join(ROOT, 'src', 'runResidentialWorkspace.js');

test('residential workspace parser enforces command-specific options', () => {
  assert.equal(
    parseResidentialWorkspaceArgs(['init'], { cwd: ROOT }).command,
    'init'
  );
  assert.deepEqual(
    parseResidentialWorkspaceArgs([
      'batch-init',
      '--batch-id', '2026-07-24-fixture-001',
      '--source-project', 'fixture-project'
    ], { cwd: ROOT }),
    {
      command: 'batch-init',
      root: path.join(ROOT, '.local', 'residential-model'),
      batchId: '2026-07-24-fixture-001',
      sourceProject: 'fixture-project'
    }
  );
  assert.throws(
    () => parseResidentialWorkspaceArgs(['intake'], { cwd: ROOT }),
    /ARGUMENT_REQUIRED/u
  );
  assert.throws(
    () => parseResidentialWorkspaceArgs([
      'legacy-audit', '--batch-id', 'not-allowed'
    ], { cwd: ROOT }),
    /ARGUMENT_NOT_ALLOWED/u
  );
  assert.throws(
    () => parseResidentialWorkspaceArgs(['train'], { cwd: ROOT }),
    /ARGUMENT_COMMAND_INVALID/u
  );
});

test('residential workspace parser rejects duplicate and incomplete command options', () => {
  assert.throws(
    () => parseResidentialWorkspaceArgs([
      'batch-init',
      '--batch-id', '2026-07-24-fixture-001',
      '--batch-id', '2026-07-24-fixture-002',
      '--source-project', 'fixture-project'
    ], { cwd: ROOT }),
    /ARGUMENT_DUPLICATE/u
  );
  assert.throws(
    () => parseResidentialWorkspaceArgs(['intake', '--batch-id'], { cwd: ROOT }),
    /ARGUMENT_VALUE_MISSING/u
  );
  assert.throws(
    () => parseResidentialWorkspaceArgs([
      'batch-init',
      '--batch-id', '2026-07-24-fixture-001'
    ], { cwd: ROOT }),
    /ARGUMENT_REQUIRED/u
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
  assert.doesNotMatch(initialized.stdout, /^root=/mu);

  const status = runCli(['status', '--root', root], {
    RESIDENTIAL_PROJECT_ROOT: projectRoot
  });
  assert.equal(status.status, 0, status.stderr);
  assert.equal(status.stdout, initialized.stdout);
});

test('residential workspace CLI creates, intakes, and audits fixture sources', async (t) => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'residential-cli-intake-project-')
  );
  t.after(() => removeFixture(projectRoot));
  await fs.mkdir(path.join(projectRoot, '.local'));
  const root = path.join(projectRoot, '.local', 'residential-model');
  const environment = { RESIDENTIAL_PROJECT_ROOT: projectRoot };

  const initialized = runCli(['init', '--root', root], environment);
  assert.equal(initialized.status, 0, initialized.stderr);

  const batch = runCli([
    'batch-init',
    '--root', root,
    '--batch-id', '2026-07-24-fixture-001',
    '--source-project', 'fixture-project'
  ], environment);
  assert.equal(batch.status, 0, batch.stderr);
  assert.equal(
    batch.stdout,
    'batch_status=ready\n'
      + 'batch_id=2026-07-24-fixture-001\n'
      + 'source_project=fixture-project\n'
      + 'candidate_count=0\n'
  );

  await writeBatchFixture({
    root,
    batchId: '2026-07-24-fixture-001',
    houseBytes: classicSchematic(),
    otherBytes: classicSchematic({ blockId: 5 })
  });
  const intake = runCli([
    'intake',
    '--root', root,
    '--batch-id', '2026-07-24-fixture-001'
  ], environment);
  assert.equal(intake.status, 0, intake.stderr);
  assert.equal(
    intake.stdout,
    'intake_status=complete\n'
      + 'batch_id=2026-07-24-fixture-001\n'
      + 'candidate_count=2\n'
      + 'parsed_count=1\n'
      + 'deferred_count=1\n'
      + 'rejected_count=0\n'
      + 'duplicate_count=0\n'
      + 'source_profile_count=2\n'
  );

  const legacyRoot = path.join(projectRoot, 'mc_templates');
  await fs.mkdir(path.join(legacyRoot, 'House'), { recursive: true });
  await fs.mkdir(path.join(legacyRoot, 'Tower'), { recursive: true });
  await fs.writeFile(
    path.join(legacyRoot, 'House', 'Fixture House.schematic'),
    classicSchematic({ blockId: 6 })
  );
  await fs.writeFile(
    path.join(legacyRoot, 'Tower', 'Fixture Tower.schematic'),
    classicSchematic({ blockId: 7 })
  );
  const legacy = runCli(['legacy-audit', '--root', root], environment);
  assert.equal(legacy.status, 0, legacy.stderr);
  assert.equal(
    legacy.stdout,
    'legacy_audit_status=complete\n'
      + 'candidate_count=2\n'
      + 'house_hint_count=1\n'
      + 'other_hint_count=1\n'
      + 'parsed_count=0\n'
      + 'deferred_count=2\n'
      + 'rejected_count=0\n'
      + 'duplicate_count=0\n'
      + 'missing_provenance_count=2\n'
  );
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

async function removeFixture(target) {
  const entry = await fs.lstat(target).catch(() => null);
  if (entry?.isDirectory() && !entry.isSymbolicLink()) {
    await fs.chmod(target, 0o700);
    const entries = await fs.readdir(target, { withFileTypes: true });
    await Promise.all(entries.map((item) => removeFixture(
      path.join(target, item.name)
    )));
  }
  await fs.rm(target, { recursive: true, force: true });
}
