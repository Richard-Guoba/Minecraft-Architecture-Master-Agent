import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

test('main CLI help documents the fixture-only Stage 7 M3 Python shadow options', () => {
  const result = runCli(['--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--coarse-voxel-mode off\|shadow/);
  assert.match(result.stdout, /--coarse-voxel-provider baseline\|artifact\|python/);
  assert.match(result.stdout, /--coarse-voxel-plan <path>/);
  assert.match(result.stdout, /--coarse-voxel-checkpoint <path>/);
  assert.match(result.stdout, /fixture-only/);
  assert.match(result.stdout, /shadow does not change primary geometry/);
});

test('main CLI enables Python only in shadow mode with a checkpoint while apply remains unavailable', () => {
  const missingCheckpoint = runCli(['--coarse-voxel-mode', 'shadow', '--coarse-voxel-provider', 'python', 'fixture']);
  const apply = runCli(['--coarse-voxel-mode', 'apply', '--coarse-voxel-provider', 'python', '--coarse-voxel-checkpoint', 'checkpoint.pt', 'fixture']);
  assert.equal(apply.status, 1);
  assert.match(apply.stderr, /apply mode is reserved for Stage 7 Milestone 4/);
  assert.equal(missingCheckpoint.status, 1);
  assert.match(missingCheckpoint.stderr, /python provider requires --coarse-voxel-checkpoint/);
});

test('main CLI enforces the baseline, artifact, and Python option matrix before generation', () => {
  const missing = runCli(['--coarse-voxel-mode', 'shadow', '--coarse-voxel-provider', 'artifact', 'fixture']);
  const unused = runCli(['--coarse-voxel-mode', 'off', '--coarse-voxel-plan', 'plan.json', 'fixture']);
  const baselinePlan = runCli(['--coarse-voxel-mode', 'shadow', '--coarse-voxel-provider', 'baseline', '--coarse-voxel-plan', 'plan.json', 'fixture']);
  const baselineCheckpoint = runCli(['--coarse-voxel-mode', 'shadow', '--coarse-voxel-checkpoint', 'checkpoint.pt', 'fixture']);
  const artifactCheckpoint = runCli(['--coarse-voxel-mode', 'shadow', '--coarse-voxel-provider', 'artifact', '--coarse-voxel-plan', 'plan.json', '--coarse-voxel-checkpoint', 'checkpoint.pt', 'fixture']);
  const pythonPlan = runCli(['--coarse-voxel-mode', 'shadow', '--coarse-voxel-provider', 'python', '--coarse-voxel-checkpoint', 'checkpoint.pt', '--coarse-voxel-plan', 'plan.json', 'fixture']);
  const multiCandidate = runCli(['--candidates', '2', '--coarse-voxel-mode', 'shadow', '--coarse-voxel-provider', 'artifact', '--coarse-voxel-plan', 'plan.json', 'fixture']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /artifact provider requires --coarse-voxel-plan/);
  assert.equal(unused.status, 1);
  assert.match(unused.stderr, /Stage 7 provider options require shadow mode/);
  assert.equal(baselinePlan.status, 1);
  assert.match(baselinePlan.stderr, /--coarse-voxel-plan is only valid with the artifact provider/);
  assert.equal(baselineCheckpoint.status, 1);
  assert.match(baselineCheckpoint.stderr, /--coarse-voxel-checkpoint is only valid with the python provider/);
  assert.equal(artifactCheckpoint.status, 1);
  assert.match(artifactCheckpoint.stderr, /artifact provider does not accept --coarse-voxel-checkpoint/);
  assert.equal(pythonPlan.status, 1);
  assert.match(pythonPlan.stderr, /python provider does not accept --coarse-voxel-plan/);
  assert.equal(multiCandidate.status, 1);
  assert.match(multiCandidate.stderr, /artifact provider supports exactly one candidate and one round/);
});

test('main CLI permits Python multi-candidate validation before checkpoint file access', () => {
  const result = runCli([
    '--candidates', '2', '--candidate-rounds', '2', '--coarse-voxel-mode', 'shadow',
    '--coarse-voxel-provider', 'python', '--coarse-voxel-checkpoint', 'missing-checkpoint.pt', 'fixture'
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /supports exactly one candidate and one round/);
});

function runCli(args) {
  return spawnSync(process.execPath, ['src/index.js', ...args], { cwd: process.cwd(), encoding: 'utf8' });
}
