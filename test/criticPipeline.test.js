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

test('pipeline suppresses critic council artifacts when critics are disabled', async () => {
  const root = path.resolve('.tmp', `architect-critic-off-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个欧式大房子',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 1,
      critics: false
    });

    assert.equal(result.criticCouncil, undefined);
    assert.equal(result.blueprint.criticCouncil, undefined);
    assert.equal(result.artifacts.criticCouncil, undefined);
    const runReport = await fs.readFile(result.artifacts.report, 'utf8');
    assert.doesNotMatch(runReport, /## Stage 4 Critic Council/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('candidate pipeline passes critic options into candidate runs', async () => {
  const root = path.resolve('.tmp', `architect-critic-candidate-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个湖边现代别墅，带大玻璃、水边平台和前景花园',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 8111,
      candidates: 2,
      candidateTargetScore: 100,
      candidateForceRounds: true,
      critics: false
    });

    assert.equal(result.candidateSelection.active, true);
    assert.equal(result.criticCouncil, undefined);
    assert.equal(result.blueprint.criticCouncil, undefined);
    assert.equal(result.artifacts.criticCouncil, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('pipeline keeps neural retrieval opt-in and reports fallback-safe mode', async () => {
  const root = path.resolve('.tmp', `architect-neural-runtime-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 7101,
      concepts: 0,
      neuralRetrieval: true
    });

    assert.equal(result.validation.ok, true);
    assert.ok(['stage5-neural-template-retriever-v1', 'template-explainable-retriever-v1'].includes(result.blueprint.templateKnowledge.retrieval_explanation.source));
    const runReport = await fs.readFile(result.artifacts.report, 'utf8');
    assert.match(runReport, /Retrieval mode:/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
