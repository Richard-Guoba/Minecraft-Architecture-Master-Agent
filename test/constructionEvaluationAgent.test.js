import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../src/pipeline.js';
import { ConstructionEvaluationAgent, buildingScoreRubric, evaluationCriteria } from '../src/construction/agents/constructionEvaluationAgent.js';
import { CONSTRUCTION_EVALUATION_PROMPTS } from '../src/construction/evaluationPromptSuite.js';
import { HABITATION_EVALUATION_PROMPTS } from '../src/construction/habitationPromptSuite.js';
import { DECORATION_EVALUATION_PROMPTS } from '../src/construction/decorationPromptSuite.js';
import { COMPREHENSIVE_EVALUATION_PROMPTS } from '../src/construction/comprehensivePromptSuite.js';
import { BASELINE_BENCHMARK_PROMPTS } from '../src/construction/baselineBenchmarkSuite.js';

test('ConstructionEvaluationAgent scores a generated blueprint with a long checklist', async () => {
  const root = path.resolve('.tmp', `architect-evaluation-test-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: CONSTRUCTION_EVALUATION_PROMPTS[0].prompt,
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: CONSTRUCTION_EVALUATION_PROMPTS[0].seed
    });
    const evaluation = new ConstructionEvaluationAgent().run(result);

    assert.equal(evaluation.source, 'local-construction-evaluation-agent');
    assert.ok(evaluation.totalChecks >= 70);
    assert.ok(evaluation.percent >= 80);
    assert.ok(evaluation.metrics.decorPlacements > 0);
    assert.ok(evaluation.metrics.vibrantPlacements > 0);
    assert.ok(evaluation.categoryScores.Interior.percent > 0);
    assert.equal(evaluation.scorecard.maxScore, 100);
    assert.equal(evaluation.scorecard.baseMaxScore, 60);
    assert.equal(evaluation.scorecard.advancedMaxScore, 40);
    assert.ok(evaluation.scorecard.dimensions.length > 10);
    assert.ok(evaluation.scorecard.totalScore >= 70);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('building score rubric is a 60 plus 40 scorecard with many dimensions', () => {
  const rubric = buildingScoreRubric();
  const base = rubric.filter((item) => item.section === 'base');
  const advanced = rubric.filter((item) => item.section === 'advanced');

  assert.ok(rubric.length > 10);
  assert.equal(base.reduce((sum, item) => sum + item.maxPoints, 0), 60);
  assert.equal(advanced.reduce((sum, item) => sum + item.maxPoints, 0), 40);
  assert.ok(rubric.every((item) => item.label && item.description && item.maxPoints > 0));
});

test('construction evaluation prompt suite contains twenty broad unique prompts', () => {
  const ids = new Set(CONSTRUCTION_EVALUATION_PROMPTS.map((item) => item.id));
  const prompts = new Set(CONSTRUCTION_EVALUATION_PROMPTS.map((item) => item.prompt));
  const focusTags = new Set(CONSTRUCTION_EVALUATION_PROMPTS.flatMap((item) => item.focus));

  assert.equal(CONSTRUCTION_EVALUATION_PROMPTS.length, 20);
  assert.equal(ids.size, 20);
  assert.equal(prompts.size, 20);
  assert.ok(focusTags.size >= 20);
  assert.ok(evaluationCriteria().length >= 100);
  assert.ok(evaluationCriteria().filter((item) => item.category === 'Habitation').length >= 30);
  assert.equal(evaluationCriteria().filter((item) => item.category === 'Decoration').length, 10);
});

test('habitation prompt suite contains one hundred broad unique residential prompts', () => {
  const ids = new Set(HABITATION_EVALUATION_PROMPTS.map((item) => item.id));
  const prompts = new Set(HABITATION_EVALUATION_PROMPTS.map((item) => item.prompt));
  const sides = new Set(HABITATION_EVALUATION_PROMPTS.map((item) => item.focus.find((tag) => ['north', 'south', 'east', 'west'].includes(tag))));

  assert.equal(HABITATION_EVALUATION_PROMPTS.length, 100);
  assert.equal(ids.size, 100);
  assert.equal(prompts.size, 100);
  assert.deepEqual([...sides].sort(), ['east', 'north', 'south', 'west']);
});

test('decoration prompt suite contains ten broad unique interior prompts', () => {
  const ids = new Set(DECORATION_EVALUATION_PROMPTS.map((item) => item.id));
  const prompts = new Set(DECORATION_EVALUATION_PROMPTS.map((item) => item.prompt));
  const focusTags = new Set(DECORATION_EVALUATION_PROMPTS.flatMap((item) => item.focus));

  assert.equal(DECORATION_EVALUATION_PROMPTS.length, 10);
  assert.equal(ids.size, 10);
  assert.equal(prompts.size, 10);
  assert.ok(focusTags.size >= 16);
});

test('comprehensive prompt suite contains one hundred broad unique prompts', () => {
  const ids = new Set(COMPREHENSIVE_EVALUATION_PROMPTS.map((item) => item.id));
  const prompts = new Set(COMPREHENSIVE_EVALUATION_PROMPTS.map((item) => item.prompt));
  const seeds = new Set(COMPREHENSIVE_EVALUATION_PROMPTS.map((item) => item.seed));
  const focusTags = new Set(COMPREHENSIVE_EVALUATION_PROMPTS.flatMap((item) => item.focus));

  assert.equal(COMPREHENSIVE_EVALUATION_PROMPTS.length, 100);
  assert.equal(ids.size, 100);
  assert.equal(prompts.size, 100);
  assert.equal(seeds.size, 100);
  assert.ok(focusTags.size >= 70);
  assert.ok(COMPREHENSIVE_EVALUATION_PROMPTS.every((item) => item.prompt.length >= 45));
});

test('baseline benchmark suite freezes ten Architecture Master prompts', () => {
  const ids = new Set(BASELINE_BENCHMARK_PROMPTS.map((item) => item.id));
  const seeds = new Set(BASELINE_BENCHMARK_PROMPTS.map((item) => item.seed));
  const focusTags = new Set(BASELINE_BENCHMARK_PROMPTS.flatMap((item) => item.focus));

  assert.equal(BASELINE_BENCHMARK_PROMPTS.length, 10);
  assert.equal(ids.size, 10);
  assert.equal(seeds.size, 10);
  assert.ok(focusTags.has('visual-composition'));
  assert.ok(focusTags.has('space-planning'));
  assert.ok(focusTags.has('site-integration'));
  assert.ok(focusTags.has('creative-narrative'));
  assert.ok(BASELINE_BENCHMARK_PROMPTS.every((item) => item.prompt.length >= 35));
});

test('ConstructionEvaluationAgent reports habitation metrics for a residential prompt', async () => {
  const root = path.resolve('.tmp', `architect-habitation-evaluation-test-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: HABITATION_EVALUATION_PROMPTS[1].prompt,
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: HABITATION_EVALUATION_PROMPTS[1].seed
    });
    const evaluation = new ConstructionEvaluationAgent().run(result);

    assert.ok(evaluation.categoryScores.Habitation.percent >= 80);
    assert.equal(evaluation.metrics.entrySide, 'east');
    assert.equal(evaluation.metrics.entryApproachCoverage, 100);
    assert.equal(evaluation.metrics.unreachableRooms, 0);
    assert.ok(evaluation.metrics.boundaryCoverage >= 60);
    assert.ok(evaluation.metrics.roofCoverage >= 60);
    assert.ok(evaluation.metrics.bathroomCount >= 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('ConstructionEvaluationAgent reports decoration reasonability metrics', async () => {
  const root = path.resolve('.tmp', `architect-decoration-evaluation-test-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: DECORATION_EVALUATION_PROMPTS[0].prompt,
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: DECORATION_EVALUATION_PROMPTS[0].seed
    });
    const evaluation = new ConstructionEvaluationAgent().run(result);

    assert.equal(evaluation.categoryScores.Decoration.total, 10);
    assert.ok(evaluation.categoryScores.Decoration.percent >= 90);
    assert.ok(evaluation.metrics.decorationHabitableCoverage >= 90);
    assert.ok(evaluation.metrics.decorationVibrantRooms >= 3);
    assert.ok(evaluation.metrics.decorationRoleFit >= 80);
    assert.equal(evaluation.metrics.decorationStyleAnchored, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('baseline waterfront villa keeps rich decoration below clutter density', async () => {
  const root = path.resolve('.tmp', `architect-decoration-density-test-${Date.now()}`);
  const prompt = BASELINE_BENCHMARK_PROMPTS.find((item) => item.id === 'modern-waterfront-villa');
  try {
    const result = await runPipeline({
      prompt: prompt.prompt,
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: prompt.seed
    });
    const evaluation = new ConstructionEvaluationAgent().run(result);
    const redFlagIds = new Set(evaluation.redFlags.map((item) => item.id));

    assert.equal(redFlagIds.has('decoration.density.not-cluttered'), false);
    assert.ok(evaluation.metrics.decorationAverageDensity <= 0.65);
    assert.ok(evaluation.metrics.decorationMaxDensity <= 1);
    assert.ok(evaluation.metrics.decorationAveragePlacementsPerRoom >= 8);
    assert.ok(evaluation.metrics.decorationHabitableCoverage >= 90);
    assert.ok(evaluation.metrics.decorationVibrantRooms >= 3);
    assert.equal(evaluation.metrics.decorationStyleAnchored, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('baseline small village keeps compact rooms below clutter density', async () => {
  const root = path.resolve('.tmp', `architect-village-density-test-${Date.now()}`);
  const prompt = BASELINE_BENCHMARK_PROMPTS.find((item) => item.id === 'small-village-cluster');
  try {
    const result = await runPipeline({
      prompt: prompt.prompt,
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: prompt.seed
    });
    const evaluation = new ConstructionEvaluationAgent().run(result);
    const redFlagIds = new Set(evaluation.redFlags.map((item) => item.id));

    assert.equal(redFlagIds.has('decoration.density.not-cluttered'), false);
    assert.ok(evaluation.metrics.decorationAverageDensity <= 0.65);
    assert.ok(evaluation.metrics.decorationMaxDensity <= 1);
    assert.ok(evaluation.metrics.decorationAveragePlacementsPerRoom >= 8);
    assert.ok(evaluation.metrics.decorationHabitableCoverage >= 90);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('baseline waterfront villa avoids a light-dominated decoration palette', async () => {
  const root = path.resolve('.tmp', `architect-decoration-palette-test-${Date.now()}`);
  const prompt = BASELINE_BENCHMARK_PROMPTS.find((item) => item.id === 'modern-waterfront-villa');
  try {
    const result = await runPipeline({
      prompt: prompt.prompt,
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: prompt.seed
    });
    const evaluation = new ConstructionEvaluationAgent().run(result);
    const redFlagIds = new Set(evaluation.redFlags.map((item) => item.id));

    assert.equal(redFlagIds.has('decoration.palette.balanced-variety'), false);
    assert.ok(evaluation.metrics.uniqueDecorBlocks >= 48);
    assert.ok(evaluation.metrics.decorationDominantBlockShare <= 25);
    assert.equal(redFlagIds.has('decoration.density.not-cluttered'), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('baseline waterfront villa keeps site comfort modules after the full workflow', async () => {
  const root = path.resolve('.tmp', `architect-site-comfort-test-${Date.now()}`);
  const prompt = BASELINE_BENCHMARK_PROMPTS.find((item) => item.id === 'modern-waterfront-villa');
  try {
    const result = await runPipeline({
      prompt: prompt.prompt,
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: prompt.seed
    });
    const evaluation = new ConstructionEvaluationAgent().run(result);
    const comfort = evaluation.scorecard.dimensions.find((item) => item.id === 'advanced.human-comfort-site');

    assert.ok(result.blueprint.modules.landscape_path > 0 || result.blueprint.modules.entry_path > 0);
    assert.ok(result.blueprint.modules.outdoor_living > 0);
    assert.ok(comfort.percent >= 80, comfort.evidence);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('baseline small village keeps vibrant accents distributed after compact density budgeting', async () => {
  const root = path.resolve('.tmp', `architect-village-vibrant-test-${Date.now()}`);
  const prompt = BASELINE_BENCHMARK_PROMPTS.find((item) => item.id === 'small-village-cluster');
  try {
    const result = await runPipeline({
      prompt: prompt.prompt,
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: prompt.seed
    });
    const evaluation = new ConstructionEvaluationAgent().run(result);
    const redFlagIds = new Set(evaluation.redFlags.map((item) => item.id));

    assert.equal(redFlagIds.has('decoration.palette.balanced-variety'), false);
    assert.equal(redFlagIds.has('decoration.vibrant.distributed'), false);
    assert.ok(evaluation.metrics.uniqueDecorBlocks >= 24);
    assert.ok(evaluation.metrics.decorationDominantBlockShare <= 25);
    assert.ok(evaluation.metrics.decorationVibrantRooms >= 4);
    assert.equal(redFlagIds.has('decoration.density.not-cluttered'), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('baseline small village includes a sleeping room in its residential program', async () => {
  const root = path.resolve('.tmp', `architect-village-sleeping-program-test-${Date.now()}`);
  const prompt = BASELINE_BENCHMARK_PROMPTS.find((item) => item.id === 'small-village-cluster');
  try {
    const result = await runPipeline({
      prompt: prompt.prompt,
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: prompt.seed
    });
    const evaluation = new ConstructionEvaluationAgent().run(result);
    const redFlagIds = new Set(evaluation.redFlags.map((item) => item.id));

    assert.equal(redFlagIds.has('habitation.program.sleeping'), false);
    assert.ok(evaluation.metrics.bedroomCount >= 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
