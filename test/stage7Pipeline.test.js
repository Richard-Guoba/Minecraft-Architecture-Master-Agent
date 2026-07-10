import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runCandidatePipeline, runPipeline } from '../src/pipeline.js';

const PROMPT = '建一个湖边现代两层别墅，带大玻璃、水边平台、庭院和精致内饰';

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
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('artifact provider rejects multi-candidate execution', async () => {
  await assert.rejects(runPipeline({ prompt:PROMPT, mode:'mock', outRoot:path.join(os.tmpdir(),'s7'), seed:7101, candidates:2, coarseVoxelMode:'shadow', coarseVoxelProvider:'artifact', coarseVoxelPlan:'fixture.json' }), /artifact provider supports exactly one candidate and one round/);
  await assert.rejects(runCandidatePipeline({ prompt:PROMPT, mode:'mock', outRoot:path.join(os.tmpdir(),'s7c'), seed:7101, candidates:2, coarseVoxelMode:'shadow', coarseVoxelProvider:'artifact', coarseVoxelPlan:'fixture.json' }), /artifact provider supports exactly one candidate and one round/);
});

function runFixture(outRoot, stage7 = {}) { return runPipeline({ prompt:PROMPT, mode:'mock', mcVersion:'1.21', outRoot, cwd:process.cwd(), seed:7101, concepts:3, conceptStrategy:'select', ...stage7 }); }
