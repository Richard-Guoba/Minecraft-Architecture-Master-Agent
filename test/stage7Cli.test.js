import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

test('main CLI help documents Stage 7 Milestone 1 shadow options', () => {
  const result = runCli(['--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--coarse-voxel-mode off\|shadow/);
  assert.match(result.stdout, /--coarse-voxel-provider baseline\|artifact/);
  assert.match(result.stdout, /--coarse-voxel-plan <path>/);
  assert.match(result.stdout, /does not change primary geometry/);
});

test('main CLI rejects apply mode and python provider during Milestone 1', () => {
  const apply = runCli(['--coarse-voxel-mode', 'apply', 'fixture']);
  const python = runCli(['--coarse-voxel-mode', 'shadow', '--coarse-voxel-provider', 'python', 'fixture']);
  assert.equal(apply.status, 1);
  assert.match(apply.stderr, /apply mode is reserved for Stage 7 Milestone 4/);
  assert.equal(python.status, 1);
  assert.match(python.stderr, /python provider is reserved for Stage 7 Milestone 3/);
});

test('main CLI enforces artifact-provider path combinations before generation', () => {
  const missing = runCli(['--coarse-voxel-mode', 'shadow', '--coarse-voxel-provider', 'artifact', 'fixture']);
  const unused = runCli(['--coarse-voxel-mode', 'off', '--coarse-voxel-plan', 'plan.json', 'fixture']);
  const baselinePlan = runCli(['--coarse-voxel-mode', 'shadow', '--coarse-voxel-provider', 'baseline', '--coarse-voxel-plan', 'plan.json', 'fixture']);
  const multiCandidate = runCli(['--candidates', '2', '--coarse-voxel-mode', 'shadow', '--coarse-voxel-provider', 'artifact', '--coarse-voxel-plan', 'plan.json', 'fixture']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /artifact provider requires --coarse-voxel-plan/);
  assert.equal(unused.status, 1);
  assert.match(unused.stderr, /Stage 7 provider options require shadow mode/);
  assert.equal(baselinePlan.status, 1);
  assert.match(baselinePlan.stderr, /--coarse-voxel-plan is only valid with the artifact provider/);
  assert.equal(multiCandidate.status, 1);
  assert.match(multiCandidate.stderr, /artifact provider supports exactly one candidate and one round/);
});

function runCli(args) {
  return spawnSync(process.execPath, ['src/index.js', ...args], { cwd: process.cwd(), encoding: 'utf8' });
}
