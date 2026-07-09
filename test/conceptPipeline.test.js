import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../src/pipeline.js';

test('pipeline writes concept studio artifacts and blueprint metadata when enabled', async () => {
  const root = path.resolve('.tmp', `architect-concept-pipeline-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 7101,
      concepts: 3,
      conceptStrategy: 'select'
    });

    assert.equal(result.validation.ok, true);
    assert.equal(result.conceptStudio.active, true);
    assert.equal(result.conceptStudio.concept_count, 3);
    assert.equal(result.blueprint.conceptStudio.active, true);
    assert.equal(result.blueprint.conceptStudio.selected_concept_id, result.conceptStudio.selected_concept_id);
    assert.equal(result.creativeDesign.concept_studio.selected_concept_id, result.conceptStudio.selected_concept_id);
    assert.ok(result.artifacts.conceptStudio.endsWith('concept_studio.json'));
    assert.ok(result.artifacts.conceptStudioReport.endsWith('concept_studio_report.md'));

    const conceptJson = JSON.parse(await fs.readFile(result.artifacts.conceptStudio, 'utf8'));
    const conceptReport = await fs.readFile(result.artifacts.conceptStudioReport, 'utf8');
    const runReport = await fs.readFile(result.artifacts.report, 'utf8');
    assert.equal(conceptJson.selected_concept_id, result.conceptStudio.selected_concept_id);
    assert.match(conceptReport, /# Stage 3 Concept Studio/);
    assert.match(conceptReport, /Ranking/);
    assert.match(runReport, /## Stage 3 Concept Studio/);
    assert.match(runReport, /Selected:/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('pipeline keeps concept studio inactive when concepts are omitted', async () => {
  const root = path.resolve('.tmp', `architect-concept-off-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个欧式大房子',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 1
    });

    assert.equal(result.conceptStudio, undefined);
    assert.equal(result.blueprint.conceptStudio, undefined);
    assert.equal(result.artifacts.conceptStudio, undefined);
    const runReport = await fs.readFile(result.artifacts.report, 'utf8');
    assert.doesNotMatch(runReport, /## Stage 3 Concept Studio/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('candidate pipeline passes concept studio options into candidate runs', async () => {
  const root = path.resolve('.tmp', `architect-concept-candidate-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个湖边现代别墅，带大玻璃、水边平台和前景花园',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 8111,
      concepts: 2,
      conceptStrategy: 'fuse',
      candidates: 2,
      candidateTargetScore: 100,
      candidateForceRounds: true
    });

    assert.equal(result.candidateSelection.active, true);
    assert.equal(result.blueprint.conceptStudio.active, true);
    assert.equal(result.blueprint.conceptStudio.strategy, 'fuse');
    assert.ok(result.artifacts.conceptStudio);
    assert.ok(result.candidateSelection.ranking.length >= 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
