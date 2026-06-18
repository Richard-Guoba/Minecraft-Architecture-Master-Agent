import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../src/pipeline.js';
import { DesignVariationEvaluationAgent, designVariationRubric } from '../src/construction/agents/designVariationEvaluationAgent.js';

test('DesignVariationEvaluationAgent requires 70 percent same-prompt variation authority', async () => {
  const root = path.resolve('.tmp', `architect-variation-test-${Date.now()}`);
  const prompt = '建一个现代两层大房子，宽31深19，大玻璃窗，开放厨房，客厅，餐厅，三间卧室，书房，阳光房，门在南侧，内饰缤纷。';
  try {
    const results = [];
    for (const seed of [101, 102, 103, 104, 105, 106]) {
      results.push(await runPipeline({
        prompt,
        mode: 'mock',
        mcVersion: '1.21',
        outRoot: path.join(root, 'out'),
        cwd: process.cwd(),
        seed
      }));
    }

    const evaluation = new DesignVariationEvaluationAgent().run(results, { prompt, target: 70 });

    assert.equal(evaluation.source, 'local-design-variation-evaluation-agent');
    assert.equal(evaluation.sampleCount, 6);
    assert.equal(evaluation.pass, true);
    assert.ok(evaluation.score >= 70);
    assert.ok(evaluation.authorityShare >= 70);
    assert.equal(designVariationRubric().reduce((sum, item) => sum + item.maxPoints, 0), 100);
    assert.ok(evaluation.scorecard.find((item) => item.id === 'massing').variationPercent >= 60);
    assert.ok(evaluation.scorecard.find((item) => item.id === 'facade').variationPercent >= 70);
    assert.ok(evaluation.scorecard.find((item) => item.id === 'interior').variationPercent >= 70);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
