import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

test('main CLI help exposes only baseline and artifact shadow providers', () => {
  const result = runCli(['--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--coarse-voxel-mode off\|shadow/);
  assert.match(result.stdout, /--coarse-voxel-provider baseline\|artifact/);
  assert.match(result.stdout, /--coarse-voxel-plan <path>/);
  assert.doesNotMatch(result.stdout, /\bpython\b/i);
  assert.doesNotMatch(result.stdout, /coarse-voxel-checkpoint/);
  assert.match(result.stdout, /shadow does not change primary geometry/);
});

test('main CLI rejects the retired Python provider and checkpoint option', () => {
  const provider = runCli([
    '--coarse-voxel-mode',
    'shadow',
    '--coarse-voxel-provider',
    'python',
    'fixture'
  ]);
  const checkpoint = runCli([
    '--coarse-voxel-checkpoint',
    'checkpoint.pt',
    'fixture'
  ]);
  assert.equal(provider.status, 1);
  assert.match(provider.stderr, /invalid.*coarse voxel provider.*python/i);
  assert.equal(checkpoint.status, 1);
  assert.match(
    checkpoint.stderr,
    /unknown option.*--coarse-voxel-checkpoint/i
  );
});

test('main CLI enforces the baseline and artifact option matrix', () => {
  const missing = runCli([
    '--coarse-voxel-mode',
    'shadow',
    '--coarse-voxel-provider',
    'artifact',
    'fixture'
  ]);
  const unused = runCli([
    '--coarse-voxel-mode',
    'off',
    '--coarse-voxel-plan',
    'plan.json',
    'fixture'
  ]);
  const baselinePlan = runCli([
    '--coarse-voxel-mode',
    'shadow',
    '--coarse-voxel-provider',
    'baseline',
    '--coarse-voxel-plan',
    'plan.json',
    'fixture'
  ]);
  const multiCandidate = runCli([
    '--candidates',
    '2',
    '--coarse-voxel-mode',
    'shadow',
    '--coarse-voxel-provider',
    'artifact',
    '--coarse-voxel-plan',
    'plan.json',
    'fixture'
  ]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /artifact provider requires --coarse-voxel-plan/);
  assert.equal(unused.status, 1);
  assert.match(unused.stderr, /provider options require shadow mode/);
  assert.equal(baselinePlan.status, 1);
  assert.match(
    baselinePlan.stderr,
    /--coarse-voxel-plan is only valid with the artifact provider/
  );
  assert.equal(multiCandidate.status, 1);
  assert.match(
    multiCandidate.stderr,
    /artifact provider supports exactly one candidate and one round/
  );
});

function runCli(args) {
  return spawnSync(process.execPath, ['src/index.js', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
}
