import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseP6Args, runP6Cli } from '../src/runArchitecturePlaybookP6.js';
import { admitP6Run, createP6Run, publishP6Generation, readCurrentP6Generation } from '../src/playbook/p6/storage.js';
import { stableJson } from '../src/playbook/shadow/canonical.js';
import {
  createP6CaptureInputs,
  p6CaptureHash,
  p6CapturePngHeader
} from './fixtures/playbookP6Captures.js';

const HASH = 'a'.repeat(64);
const POSIX_ROOT = '/tmp/p6-cli-disposable';

test('prepare requires the exact fixed inputs and rejects protocol overrides', () => {
  assert.throws(
    () => parseP6Args(['prepare', '--playbook-run', `${POSIX_ROOT}/p5`, '--baseline-run', `${POSIX_ROOT}/baseline`]),
    { code: 'P6_OPTIONS_INVALID' }
  );
  assert.throws(
    () => parseP6Args([
      'prepare', '--playbook-run', `${POSIX_ROOT}/p5`, '--baseline-run', `${POSIX_ROOT}/baseline`,
      '--run-dir', `${POSIX_ROOT}/run`, '--prompt', 'different request'
    ]),
    { code: 'P6_OPTIONS_INVALID' }
  );
});

test('help returns before any filesystem-capable dependency can run', async () => {
  const noDependencies = new Proxy({}, {
    get() { throw new Error('help must not access a dependency'); }
  });
  assert.deepEqual(await runP6Cli(['--help'], noDependencies), { status: 'help' });
});

test('prepare renders only the cohort-owned snapshots and publishes an exact solution/view reference map', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-cli-disposable-'));
  const calls = [];
  const deps = fakeDependencies({ root, calls });
  deps.loadRenderSolutions = () => { throw new Error('second source admission is forbidden'); };
  const result = await runP6Cli([
    'prepare', '--playbook-run', `${root}/p5`, '--baseline-run', `${root}/baseline`, '--run-dir', `${root}/run`
  ], deps);

  assert.equal(result.status, 'prepared');
  assert.equal(result.reference_image_count, 24);
  assert.equal(result.next_action, 'P6_CAPTURE_AUTHORIZATION_REQUIRED');
  assert.deepEqual(result.outputs, {
    cohort: 'cohort/generation-000001',
    reference_renders: 'reference-renders/generation-000001',
    capture_session: 'capture-session/generation-000001'
  });
  assert.equal(JSON.stringify(result).includes(root), false);
  assert.deepEqual(calls.map(call => call.kind), ['cohort', 'reference-renders', 'capture-session']);
  assert.equal(calls.some(call => call.name === 'launchMinecraft'), false);
  assert.equal(calls.find(call => call.kind === 'reference-renders').files.size, 25);
  const referenceManifest = JSON.parse(
    calls.find(call => call.kind === 'reference-renders').files.get('reference-renders.json')
  );
  const expectedPairs = ['playbook-candidate-01', 'playbook-candidate-02', 'playbook-candidate-03', 'baseline-current']
    .flatMap(solution_id => ['front-south', 'side-east', 'quarter-southeast', 'quarter-southwest', 'roof-birdseye', 'entry-eye']
      .map(view_id => `${solution_id}/${view_id}`));
  assert.deepEqual(referenceManifest.images.map(image => `${image.solution_id}/${image.view_id}`), expectedPairs);
  assert.equal(new Set(referenceManifest.images.map(image => image.filename)).size, 24);
  assert.equal(new Set(referenceManifest.images.map(image => image.image_sha256)).size, 1);
  await fs.rm(root, { recursive: true, force: true });
});

test('prepare converts private dependency failures into a stable public code', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-cli-disposable-'));
  await assert.rejects(
    runP6Cli([
      'prepare', '--playbook-run', `${root}/p5`, '--baseline-run', `${root}/baseline`, '--run-dir', `${root}/run`
    ], {
      ...fakeDependencies({ root, calls: [] }),
      admitP6CohortInputs: async () => { throw new Error(`private failure ${root}`); }
    }),
    error => error?.code === 'P6_AUTHORITY_INVALID' && !String(error.message).includes(root)
  );
  await fs.rm(root, { recursive: true, force: true });
});

test('capture always refuses without touching a world, including authorization-looking flags', async () => {
  await assert.rejects(
    runP6Cli(['capture'], fakeDependencies({ root: POSIX_ROOT, calls: [] })),
    { code: 'P6_CAPTURE_AUTHORIZATION_REQUIRED' }
  );
  await assert.rejects(
    runP6Cli([
      'capture', '--authorize-disposable-world', '--world', `${POSIX_ROOT}/world`,
      '--expected-world-identity', HASH
    ], fakeDependencies({ root: POSIX_ROOT, calls: [] })),
    { code: 'P6_CAPTURE_AUTHORIZATION_REQUIRED' }
  );
});

test('import-captures requires only an exact P6 run and caller capture root', () => {
  assert.deepEqual(parseP6Args([
    'import-captures', '--run-dir', `${POSIX_ROOT}/run`, '--capture-root', `${POSIX_ROOT}/submitted`
  ]), {
    action: 'import-captures',
    runDir: `${POSIX_ROOT}/run`,
    captureRoot: `${POSIX_ROOT}/submitted`
  });
  assert.throws(
    () => parseP6Args(['import-captures', '--run-dir', `${POSIX_ROOT}/run`]),
    { code: 'P6_OPTIONS_INVALID' }
  );
  assert.throws(
    () => parseP6Args([
      'import-captures', '--run-dir', `${POSIX_ROOT}/run`, '--capture-root', `${POSIX_ROOT}/submitted`,
      '--authorize-disposable-world'
    ]),
    { code: 'P6_OPTIONS_INVALID' }
  );
});

test('import-captures consumes the exact current session and never reaches world-capable dependencies', async () => {
  const calls = [];
  const session = { schema_version: 1, kind: 'p6-capture-session' };
  const result = await runP6Cli([
    'import-captures', '--run-dir', `${POSIX_ROOT}/run`, '--capture-root', `${POSIX_ROOT}/submitted`
  ], {
    admitP6Run: async ({ p6Dir }) => {
      calls.push(['admit', p6Dir]);
      return { close: async () => { calls.push(['close']); } };
    },
    readCurrentP6Generation: async ({ kind }) => {
      calls.push(['read', kind]);
      return { files: { 'capture-session.json': Buffer.from(JSON.stringify(session)) } };
    },
    validateImportedCaptures: async ({ session: received, captureRoot }) => {
      calls.push(['validate', received, captureRoot]);
      return {
        status: 'imported', capture_count: 24, capture_manifest_sha256: HASH,
        environment_sha256: HASH, output: 'minecraft-captures/generation-000001'
      };
    },
    createP6Run: async () => { throw new Error('import must not create a run'); },
    launchMinecraft: async () => { throw new Error('import must not launch Minecraft'); }
  });

  assert.deepEqual(result, {
    status: 'imported', capture_count: 24, capture_manifest_sha256: HASH,
    environment_sha256: HASH, output: 'minecraft-captures/generation-000001'
  });
  assert.deepEqual(calls, [
    ['admit', `${POSIX_ROOT}/run/playbook-p6`],
    ['read', 'capture-session'],
    ['validate', session, `${POSIX_ROOT}/submitted`],
    ['close']
  ]);
});

test('prepare-capture-session and import-captures form a real commands-only formal capture flow', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-cli-formal-disposable-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runDir = path.join(root, 'run');
  const captureRoot = path.join(root, 'submitted');
  const inputs = createP6CaptureInputs();
  await fs.mkdir(runDir);
  await fs.mkdir(captureRoot);
  const created = await createP6Run({ runDir });
  await publishP6Generation({
    authority: created.authority,
    kind: 'cohort',
    files: {
      'cohort.json': Buffer.from(stableJson({
        schema_version: 1,
        cohort: inputs.cohort.manifest,
        cohort_input_sha256: inputs.cohort.input_sha256,
        selection_rank: []
      })),
      ...Object.fromEntries(inputs.cameraManifests.map(camera => [
        `camera-${camera.solution_id}.json`, Buffer.from(stableJson(camera))
      ]))
    }
  });
  await created.authority.close();

  const worldIdentity = p6CaptureHash('formal-world');
  const prepared = await runP6Cli([
    'prepare-capture-session', '--run-dir', runDir,
    '--expected-world-identity', worldIdentity, '--plot-origin', '100,64,200'
  ]);
  assert.equal(prepared.status, 'capture-session-prepared');
  assert.equal(prepared.output, 'capture-session/generation-000001');
  assert.equal(JSON.stringify(prepared).includes(root), false);

  const authority = await admitP6Run({ p6Dir: path.join(runDir, 'playbook-p6') });
  const current = await readCurrentP6Generation({ authority, kind: 'capture-session' });
  const session = JSON.parse(current.files['capture-session.json']);
  for (const row of session.captures) {
    await fs.writeFile(path.join(captureRoot, row.filename), p6CapturePngHeader());
  }
  await fs.writeFile(
    path.join(captureRoot, 'capture-provenance.json'), stableJson(session.required_provenance)
  );
  await authority.close();

  const imported = await runP6Cli([
    'import-captures', '--run-dir', runDir, '--capture-root', captureRoot
  ]);
  assert.equal(imported.status, 'imported');
  assert.equal(imported.capture_count, 24);
  assert.equal(imported.output, 'minecraft-captures/generation-000001');
  assert.equal(JSON.stringify(imported).includes(root), false);
});

test('CLI capture refusal is non-zero and does not expose its disposable POSIX path', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-cli-disposable-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const child = await spawnCli([
    'capture', '--authorize-disposable-world', '--world', `${root}/world`,
    '--expected-world-identity', HASH
  ]);
  assert.equal(child.code, 1);
  assert.match(child.stderr, /P6_CAPTURE_AUTHORIZATION_REQUIRED/u);
  assert.equal(child.stderr.includes(root), false);
});

function fakeDependencies({ root, calls }) {
  const cohort = Object.freeze({
    input_sha256: HASH,
    manifest: { schema_version: 1, cohort_id: 'p6-v0.1' },
    solutions: ['playbook-candidate-01', 'playbook-candidate-02', 'playbook-candidate-03', 'baseline-current'].map(solution_id => ({
      solution_id,
      blueprint_sha256: HASH,
      operation_list_sha256: HASH,
      build_function_sha256: HASH,
      bounds: { min_x: 0, min_y: 0, min_z: 0, max_x: 1, max_y: 1, max_z: 1 },
      main_entry: { center_x: 1, center_y: 0, center_z: 1, facing: 'south' }
    }))
  });
  const render_solutions = cohort.solutions.map(solution => Object.freeze({
    ...solution,
    blueprint: Object.freeze({ bounds: solution.bounds, operations: [] }),
    operations: Object.freeze([])
  }));
  const admitted = Object.freeze({ ...cohort, render_solutions: Object.freeze(render_solutions) });
  return {
    createP6Run: async () => ({ p6Dir: 'playbook-p6', authority: { close: async () => {} } }),
    admitP6CohortInputs: async () => admitted,
    deriveSharedFraming: () => ({ view_multipliers: {} }),
    deriveFixedViewManifest: ({ solutionId }) => ({ solution_id: solutionId, views: [] }),
    renderReferenceViews: ({ solution }) => [
      'front-south', 'side-east', 'quarter-southeast', 'quarter-southwest', 'roof-birdseye', 'entry-eye'
    ].map(view_id => ({
      view_id,
      filename: `${solution.solution_id}-${view_id}.png`,
      bytes: Buffer.from(`png-${solution.solution_id}-${view_id}`),
      sha256: HASH,
      width: 1920,
      height: 1080
    })),
    publishP6Generation: async ({ kind, files }) => {
      calls.push({ kind, files: new Map(Object.entries(files)) });
      return { generation: 'generation-000001', manifest_sha256: HASH };
    },
    sha256: () => HASH,
    stableJson: JSON.stringify,
    root
  };
}

function spawnCli(argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/runArchitecturePlaybookP6.js', ...argv], {
      cwd: path.resolve(import.meta.dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout, stderr }));
  });
}
