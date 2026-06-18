import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateSeedFor, runPipeline } from '../src/pipeline.js';

test('candidate pipeline generates multiple rounds and selects the best aesthetic review', async () => {
  const root = path.resolve('.tmp', `architect-candidate-pipeline-${Date.now()}`);
  const datapacksDir = path.join(root, 'world', 'datapacks');
  try {
    await fs.mkdir(datapacksDir, { recursive: true });
    const result = await runPipeline({
      prompt: '建一个现代湖边别墅，带非平坦自然地形、前景花园、水边平台、大玻璃、屋顶露台，内饰要有精致的客厅、开放厨房、餐厅、卧室和书房',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 1997941929,
      candidates: 2,
      candidateRounds: 2,
      candidateForceRounds: true,
      candidateTargetScore: 100,
      datapacksDir
    });

    const selection = result.candidateSelection;
    assert.equal(selection.active, true);
    assert.equal(selection.candidate_count_per_round, 2);
    assert.equal(selection.round_count, 2);
    assert.equal(selection.successful_count, 4);
    assert.equal(selection.selected_seed, result.seed);
    assert.equal(result.seedSource, 'manual-candidate-selected');
    assert.ok(selection.selected_template_score >= 80);
    assert.equal(selection.ranking[0].candidate_id, selection.selected_candidate_id);
    assert.equal(result.blueprint.candidateSelection.selected_candidate_id, selection.selected_candidate_id);
    assert.equal(result.artifacts.installedDatapackDir, path.join(datapacksDir, 'architect_datapack'));

    const selectionJson = JSON.parse(await fs.readFile(result.artifacts.candidateSelection, 'utf8'));
    const selectionReport = await fs.readFile(result.artifacts.candidateSelectionReport, 'utf8');
    const selectedReport = await fs.readFile(result.artifacts.report, 'utf8');
    assert.equal(selectionJson.selected_candidate_id, selection.selected_candidate_id);
    assert.match(selectionReport, /第6阶段候选择优报告/);
    assert.match(selectionReport, /排名/);
    assert.match(selectedReport, /第6阶段候选择优/);
    await fs.access(path.join(result.artifacts.installedDatapackDir, 'pack.mcmeta'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('candidateSeedFor creates stable per-round candidate seeds', () => {
  assert.equal(candidateSeedFor(10, 1, 1), candidateSeedFor(10, 1, 1));
  assert.notEqual(candidateSeedFor(10, 1, 1), candidateSeedFor(10, 1, 2));
  assert.notEqual(candidateSeedFor(10, 1, 1), candidateSeedFor(10, 2, 1));
});
