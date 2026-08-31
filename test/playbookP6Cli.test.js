import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseP6Args, runP6Cli } from '../src/runArchitecturePlaybookP6.js';

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

test('prepare publishes only relative managed names and never invokes a Minecraft dependency', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-cli-disposable-'));
  const calls = [];
  const deps = fakeDependencies({ root, calls });
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
      build_function_sha256: HASH,
      bounds: { min_x: 0, min_y: 0, min_z: 0, max_x: 1, max_y: 1, max_z: 1 },
      main_entry: { center_x: 1, center_y: 0, center_z: 1, facing: 'south' }
    }))
  });
  return {
    createP6Run: async () => ({ p6Dir: 'playbook-p6', authority: { close: async () => {} } }),
    admitP6CohortInputs: async () => cohort,
    loadRenderSolutions: async () => cohort.solutions.map(solution => ({
      ...solution,
      blueprint: { bounds: solution.bounds, operations: [] },
      operations: []
    })),
    deriveSharedFraming: () => ({ view_multipliers: {} }),
    deriveFixedViewManifest: ({ solutionId }) => ({ solution_id: solutionId, views: [] }),
    renderReferenceViews: ({ solution }) => Array.from({ length: 6 }, (_, index) => ({
      view_id: `view-${index + 1}`,
      filename: `${solution.solution_id}-${index + 1}.png`,
      bytes: Buffer.from(`png-${solution.solution_id}-${index + 1}`),
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
