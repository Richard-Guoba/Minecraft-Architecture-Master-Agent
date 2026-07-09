import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../src/pipeline.js';

test('pipeline writes critic council artifacts and blueprint metadata by default', async () => {
  const root = path.resolve('.tmp', `architect-critic-pipeline-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 7101,
      concepts: 3
    });

    assert.equal(result.validation.ok, true);
    assert.equal(result.criticCouncil.active, true);
    assert.equal(result.criticCouncil.critic_count, 6);
    assert.equal(result.blueprint.criticCouncil.active, true);
    assert.equal(result.blueprint.criticCouncil.readiness, result.criticCouncil.readiness);
    assert.ok(result.artifacts.criticCouncil.endsWith('critic_council.json'));

    const criticJson = JSON.parse(await fs.readFile(result.artifacts.criticCouncil, 'utf8'));
    const runReport = await fs.readFile(result.artifacts.report, 'utf8');
    const blueprintJson = JSON.parse(await fs.readFile(result.artifacts.blueprint, 'utf8'));
    assert.equal(criticJson.source, 'stage4-critic-council-v1');
    assert.equal(criticJson.critics.length, 6);
    assert.equal(blueprintJson.criticCouncil.active, true);
    assert.match(runReport, /## Stage 4 Critic Council/);
    assert.match(runReport, /Readiness:/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
