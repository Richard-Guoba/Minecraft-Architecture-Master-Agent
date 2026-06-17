import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../src/pipeline.js';
import { ConstructionEvaluationAgent, evaluationCriteria } from '../src/construction/agents/constructionEvaluationAgent.js';
import { CONSTRUCTION_EVALUATION_PROMPTS } from '../src/construction/evaluationPromptSuite.js';

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
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('construction evaluation prompt suite contains twenty broad unique prompts', () => {
  const ids = new Set(CONSTRUCTION_EVALUATION_PROMPTS.map((item) => item.id));
  const prompts = new Set(CONSTRUCTION_EVALUATION_PROMPTS.map((item) => item.prompt));
  const focusTags = new Set(CONSTRUCTION_EVALUATION_PROMPTS.flatMap((item) => item.focus));

  assert.equal(CONSTRUCTION_EVALUATION_PROMPTS.length, 20);
  assert.equal(ids.size, 20);
  assert.equal(prompts.size, 20);
  assert.ok(focusTags.size >= 20);
  assert.ok(evaluationCriteria().length >= 70);
});
