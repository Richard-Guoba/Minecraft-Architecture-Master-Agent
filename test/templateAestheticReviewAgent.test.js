import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../src/pipeline.js';
import { TemplateAestheticReviewAgent } from '../src/construction/agents/templateAestheticReviewAgent.js';

test('TemplateAestheticReviewAgent stays inactive without template-guided generation', () => {
  const review = new TemplateAestheticReviewAgent().run({ prompt: '建一个普通小屋' });

  assert.equal(review.active, false);
  assert.equal(review.grade, 'not-applicable');
  assert.deepEqual(review.next_iteration_directives, []);
});

test('template aesthetic review scores template absorption and writes reflection feedback', async () => {
  const root = path.resolve('.tmp', `template-aesthetic-review-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个现代湖边别墅，带非平坦自然地形、前景花园、水边平台、大玻璃、屋顶露台，内饰要有精致的客厅、开放厨房、餐厅、卧室和书房',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 1997941929
    });
    const review = result.blueprint.templateAestheticReview;
    const coverage = result.blueprint.templateLawCoverage;
    const report = await fs.readFile(result.artifacts.report, 'utf8');

    assert.equal(review.active, true);
    assert.equal(review.source, 'local-template-aesthetic-review-agent');
    assert.ok(review.score >= 80);
    assert.ok(review.dimensions.some((item) => item.id === 'interior-scenes' && item.percent >= 80));
    assert.ok(review.dimensions.some((item) => item.id === 'site-scenes' && item.percent >= 80));
    assert.ok(review.metrics.template_site_scene_count >= 5);
    assert.ok(review.metrics.template_interior_scene_placement_count >= 35);
    assert.equal(coverage.active, true);
    assert.ok(coverage.percent >= 80);
    assert.ok(review.metrics.template_law_coverage_percent >= 80);
    assert.ok(Array.isArray(review.next_iteration_directives));
    assert.match(report, /模板审美评分/);
    assert.match(report, /模板反省闭环/);
    assert.match(report, /模板法则覆盖率/);
    assert.match(report, /模板法则补强闭环/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
