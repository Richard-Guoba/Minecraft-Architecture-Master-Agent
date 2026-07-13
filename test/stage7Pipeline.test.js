import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runCandidatePipeline, runPipeline } from '../src/pipeline.js';

const PROMPT = '建一个湖边现代两层别墅，带大玻璃、水边平台、庭院和精致内饰';
const fixtureRoot = path.join(process.cwd(), 'training', 'stage7', 'fixtures', 'm3', 'cases', 'two-floor-house');
const fixtureCheckpoint = 'fixture-checkpoint';

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

function pythonPlanFor(condition) {
  const plan = JSON.parse(readFileSync(path.join(fixtureRoot, 'plan.json'), 'utf8'));
  plan.condition_hash = condition.condition_hash;
  plan.orientation.front_side = condition.design.front_side;
  plan.world_transform = {
    ground_y: 0,
    lot_depth: condition.dimensions.lot_depth,
    lot_width: condition.dimensions.lot_width,
    total_height: condition.dimensions.total_height
  };
  plan.provider = {
    kind: 'learned-python-shadow',
    name: 'stage7-tiny-cvae-v1',
    model_version: 'm3-fixture-v1',
    dataset_version: 'fixture-v1',
    checkpoint_version: `sha256:${sha256(fixtureCheckpoint)}`
  };
  return plan;
}

function processResult(stdout, { stderr = '', durationMs = 19 } = {}) {
  return {
    stdout,
    stderr,
    duration_ms: durationMs,
    stdout_bytes: Buffer.byteLength(stdout),
    stderr_bytes: Buffer.byteLength(stderr)
  };
}

async function writeCheckpoint(root, overrides = {}) {
  const checkpoint = path.join(root, 'checkpoint.pt');
  const manifest = path.join(root, 'checkpoint_manifest.json');
  await fs.writeFile(checkpoint, fixtureCheckpoint, 'utf8');
  await fs.writeFile(manifest, `${JSON.stringify({
    source: 'stage7-m3-checkpoint-manifest-v1',
    schema_version: 1,
    training_scope: 'fixture-only',
    model_name: 'stage7-tiny-cvae-v1',
    model_version: 'm3-fixture-v1',
    dataset_version: 'fixture-v1',
    checkpoint_file: 'checkpoint.pt',
    checkpoint_sha256: sha256(fixtureCheckpoint),
    ...overrides
  })}\n`, 'utf8');
  return { checkpoint, manifest };
}

test('Stage 7 defaults off and explicit off preserve exact fixed-seed operations', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-off-parity-'));
  try {
    const baseline = await runFixture(path.join(root, 'baseline'));
    const explicitOff = await runFixture(path.join(root, 'explicit-off'), { coarseVoxelMode: 'off' });
    assert.deepEqual(explicitOff.blueprint.operations, baseline.blueprint.operations);
    assert.equal(baseline.stage7, undefined);
    assert.equal(explicitOff.stage7, undefined);
    assert.equal(baseline.blueprint.stage7, undefined);
    assert.equal(explicitOff.artifacts.stage7Condition, undefined);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('Stage 7 baseline shadow writes review artifacts without changing primary operations', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-shadow-parity-'));
  try {
    const baseline = await runFixture(path.join(root, 'baseline'));
    const shadow = await runFixture(path.join(root, 'shadow'), { coarseVoxelMode: 'shadow', coarseVoxelProvider: 'baseline' });
    assert.equal(shadow.validation.ok, true); assert.equal(shadow.stage7.status, 'converted');
    assert.equal(shadow.blueprint.stage7.status, 'converted');
    assert.deepEqual(shadow.blueprint.operations, baseline.blueprint.operations);
    for (const key of ['stage7Condition','stage7RawPlan','stage7RepairedPlan','stage7Report','stage7Candidate']) { assert.ok(shadow.artifacts[key]); await fs.access(shadow.artifacts[key]); }
    assert.equal(shadow.artifacts.stage7FailureCase, undefined);
    const report = await fs.readFile(shadow.artifacts.report, 'utf8');
    const stage7Report = await fs.readFile(shadow.artifacts.stage7Report, 'utf8');
    const savedBlueprint = JSON.parse(await fs.readFile(shadow.artifacts.blueprint, 'utf8'));
    assert.match(report, /## Stage 7 Milestone 1 Shadow/); assert.match(stage7Report, /Primary geometry changed: no/);
    assert.equal(savedBlueprint.stage7.condition_hash, shadow.stage7.condition.condition_hash);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('invalid Stage 7 artifacts reject while normal build succeeds unchanged', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-rejected-pipeline-'));
  try {
    const artifactPath = path.join(root, 'invalid-plan.json'); await fs.writeFile(artifactPath, '{"source":"wrong"}\n', 'utf8');
    const baseline = await runFixture(path.join(root, 'baseline'));
    const rejected = await runFixture(path.join(root, 'rejected'), { coarseVoxelMode: 'shadow', coarseVoxelProvider: 'artifact', coarseVoxelPlan: artifactPath });
    assert.equal(rejected.validation.ok, true); assert.equal(rejected.stage7.status, 'rejected');
    assert.equal(rejected.blueprint.stage7.fallback, 'primary-build-unchanged');
    assert.deepEqual(rejected.blueprint.operations, baseline.blueprint.operations); assert.ok(rejected.artifacts.stage7FailureCase);
    assert.ok(rejected.artifacts.stage7RawPlan);
    assert.equal(await fs.readFile(rejected.artifacts.stage7RawPlan, 'utf8'), await fs.readFile(artifactPath, 'utf8'));
    const failure = JSON.parse(await fs.readFile(rejected.artifacts.stage7FailureCase, 'utf8'));
    assert.equal(failure.baseline_artifact_paths.blueprint, 'blueprint.json');
    assert.equal(failure.baseline_artifact_paths.run_report, 'run_report.md');
    assert.equal(failure.diagnostic_artifact_paths.raw_plan, 'stage7_coarse_semantic_plan.raw.json');
    assert.equal(failure.diagnostic_artifact_paths.candidate, undefined);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('Python shadow converts a complete plan with checkpoint provenance without changing primary operations', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-python-converted-'));
  try {
    const { checkpoint, manifest } = await writeCheckpoint(root);
    const baseline = await runFixture(path.join(root, 'baseline'));
    const shadow = await runFixture(path.join(root, 'shadow'), {
      coarseVoxelMode: 'shadow',
      coarseVoxelProvider: 'python',
      coarseVoxelCheckpoint: checkpoint,
      coarseVoxelCheckpointManifest: manifest,
      coarseVoxelPythonExecutable: '/opt/stage7/python',
      coarseVoxelPythonInvoke: async ({ condition }) => processResult(JSON.stringify(pythonPlanFor(condition)))
    });
    assert.equal(shadow.validation.ok, true);
    assert.equal(shadow.stage7.status, 'converted');
    assert.equal(shadow.stage7.providerProvenance.checkpoint_sha256, sha256(fixtureCheckpoint));
    assert.equal(shadow.stage7.providerProvenance.training_scope, 'fixture-only');
    assert.equal(shadow.blueprint.stage7.checkpoint_sha256, sha256(fixtureCheckpoint));
    assert.equal(shadow.blueprint.stage7.training_scope, 'fixture-only');
    assert.equal(shadow.blueprint.stage7.artifact_sha256, undefined);
    assert.deepEqual(shadow.blueprint.operations, baseline.blueprint.operations);
    assert.ok(shadow.artifacts.stage7Candidate);
    assert.equal(shadow.artifacts.stage7FailureCase, undefined);
    const report = await fs.readFile(shadow.artifacts.stage7Report, 'utf8');
    assert.match(report, new RegExp(`Checkpoint sha256: ${sha256(fixtureCheckpoint)}`));
    assert.match(report, /Training scope: fixture-only/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('Python timeout, malformed output, scope mismatch, and Node schema rejection fail closed with operation parity', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-python-rejected-'));
  try {
    const baseline = await runFixture(path.join(root, 'baseline'));
    const failures = [
      {
        id: 'timeout',
        invoke: async () => {
          const error = new Error('python provider timed out after 60000ms');
          error.stage7ProcessResult = { duration_ms: 60000, stdout_bytes: 0, stderr_bytes: 7 };
          throw error;
        },
        expectedStage: 'provider'
      },
      { id: 'malformed', invoke: async () => processResult('{'), expectedStage: 'provider' },
      { id: 'schema', invoke: async ({ condition }) => {
        const plan = pythonPlanFor(condition);
        plan.source = 'wrong';
        return processResult(JSON.stringify(plan));
      }, expectedStage: 'semantic-validation' }
    ];

    for (const failure of failures) {
      const fixtureDir = path.join(root, failure.id);
      await fs.mkdir(fixtureDir, { recursive: true });
      const { checkpoint, manifest } = await writeCheckpoint(fixtureDir);
      const rejected = await runFixture(path.join(root, `out-${failure.id}`), {
        coarseVoxelMode: 'shadow',
        coarseVoxelProvider: 'python',
        coarseVoxelCheckpoint: checkpoint,
        coarseVoxelCheckpointManifest: manifest,
        coarseVoxelPythonInvoke: failure.invoke
      });
      await assertPythonFailure(rejected, baseline, failure.expectedStage);
    }

    const scopeDir = path.join(root, 'scope');
    await fs.mkdir(scopeDir, { recursive: true });
    const { checkpoint, manifest } = await writeCheckpoint(scopeDir, { training_scope: 'prototype' });
    const scopeRejected = await runFixture(path.join(root, 'out-scope'), {
      coarseVoxelMode: 'shadow',
      coarseVoxelProvider: 'python',
      coarseVoxelCheckpoint: checkpoint,
      coarseVoxelCheckpointManifest: manifest,
      coarseVoxelPythonInvoke: async ({ condition }) => processResult(JSON.stringify(pythonPlanFor(condition)))
    });
    await assertPythonFailure(scopeRejected, baseline, 'provider', 'prototype');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('artifact provider rejects multi-candidate execution', async () => {
  await assert.rejects(runPipeline({ prompt:PROMPT, mode:'mock', outRoot:path.join(os.tmpdir(),'s7'), seed:7101, candidates:2, coarseVoxelMode:'shadow', coarseVoxelProvider:'artifact', coarseVoxelPlan:'fixture.json' }), /artifact provider supports exactly one candidate and one round/);
  await assert.rejects(runCandidatePipeline({ prompt:PROMPT, mode:'mock', outRoot:path.join(os.tmpdir(),'s7c'), seed:7101, candidates:2, coarseVoxelMode:'shadow', coarseVoxelProvider:'artifact', coarseVoxelPlan:'fixture.json' }), /artifact provider supports exactly one candidate and one round/);
});

test('Python provider may infer each candidate independently', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-python-candidates-'));
  try {
    const { checkpoint, manifest } = await writeCheckpoint(root);
    const result = await runCandidatePipeline({
      prompt: PROMPT,
      mode: 'mock',
      outRoot: path.join(root, 'out'),
      seed: 7101,
      candidates: 2,
      candidateRounds: 1,
      coarseVoxelMode: 'shadow',
      coarseVoxelProvider: 'python',
      coarseVoxelCheckpoint: checkpoint,
      coarseVoxelCheckpointManifest: manifest,
      coarseVoxelPythonInvoke: async ({ condition }) => processResult(JSON.stringify(pythonPlanFor(condition)))
    });
    assert.equal(result.candidateSelection.candidate_count, 2);
    assert.equal(result.candidateSelection.successful_count, 2);
    assert.equal(result.stage7.provider, 'python');
    assert.equal(result.stage7.status, 'converted');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

function runFixture(outRoot, stage7 = {}) { return runPipeline({ prompt:PROMPT, mode:'mock', mcVersion:'1.21', outRoot, cwd:process.cwd(), seed:7101, concepts:3, conceptStrategy:'select', ...stage7 }); }

async function assertPythonFailure(result, baseline, expectedStage, expectedScope = 'fixture-only') {
  assert.equal(result.validation.ok, true);
  assert.equal(result.stage7.status, 'rejected');
  assert.equal(result.blueprint.stage7.fallback, 'primary-build-unchanged');
  assert.deepEqual(result.blueprint.operations, baseline.blueprint.operations);
  assert.ok(result.artifacts.stage7FailureCase);
  const failure = JSON.parse(await fs.readFile(result.artifacts.stage7FailureCase, 'utf8'));
  assert.equal(failure.failure_stage, expectedStage);
  assert.equal(failure.fallback, 'primary-build-unchanged');
  assert.equal(failure.provider_metadata.checkpoint_sha256, sha256(fixtureCheckpoint));
  assert.equal(failure.provider_metadata.training_scope, expectedScope);
  assert.equal(failure.artifact, undefined);
}
