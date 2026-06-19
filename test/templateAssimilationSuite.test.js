import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATE_ASSIMILATION_PROMPTS } from '../src/construction/templateAssimilationPromptSuite.js';
import { renderTemplateAssimilationMarkdown, summarizeTemplateAssimilationSuite } from '../src/evaluateTemplateAssimilationSuite.js';

test('template assimilation prompt suite covers broad top-tier reference scenarios', () => {
  const ids = new Set(TEMPLATE_ASSIMILATION_PROMPTS.map((item) => item.id));
  const prompts = new Set(TEMPLATE_ASSIMILATION_PROMPTS.map((item) => item.prompt));
  const seeds = new Set(TEMPLATE_ASSIMILATION_PROMPTS.map((item) => item.seed));
  const focusTags = new Set(TEMPLATE_ASSIMILATION_PROMPTS.flatMap((item) => item.focus));

  assert.equal(TEMPLATE_ASSIMILATION_PROMPTS.length, 24);
  assert.equal(ids.size, 24);
  assert.equal(prompts.size, 24);
  assert.equal(seeds.size, 24);
  assert.ok(focusTags.size >= 45);
  assert.ok(TEMPLATE_ASSIMILATION_PROMPTS.every((item) => item.prompt.length >= 45));
  assert.ok(TEMPLATE_ASSIMILATION_PROMPTS.every((item) => /花园|庭院|地形|平台|露台|内饰|室内/.test(item.prompt)));
});

test('template assimilation suite summary aggregates audits, tracks, gaps, and directives', () => {
  const summary = summarizeTemplateAssimilationSuite([
    result('modern-lake-villa', 100, {
      law: 100,
      aesthetic: 99,
      readiness: 'top-tier-ready',
      tracks: [
        track('site-terrain-scenes', 100),
        track('interior-scene-density', 96)
      ],
      directives: [{ id: 'preserve-top-tier-template-assimilation', priority: 'maintain' }]
    }),
    result('narrow-urban-infill-villa', 76, {
      law: 82,
      aesthetic: 79,
      gaps: [{ id: 'site-terrain-scenes', label: 'Site and terrain scenes', severity: 'medium', percent: 66 }],
      tracks: [
        track('site-terrain-scenes', 66, ['site-module-density-low']),
        track('interior-scene-density', 82, ['scene-placement-density-low'])
      ],
      directives: [{ id: 'increase-site-terrain-scenes', priority: 'medium', targets: ['SiteLandscapeAgent'], text: 'Increase site scenes.' }],
      autoRepair: { active: true, applied_count: 2, grid_patch_count: 80, placement_count: 6 },
      interiorDensityRepair: { active: true, applied_count: 4, grid_patch_count: 120, placement_count: 120 }
    })
  ], 'out/test', { mode: 'mock', mcVersion: '1.21' });

  assert.equal(summary.total, 2);
  assert.equal(summary.passCount, 2);
  assert.equal(summary.averageAudit, 88);
  assert.equal(summary.averageLaw, 91);
  assert.equal(summary.topTierReadyCount, 1);
  assert.equal(summary.autoRepairAppliedCount, 1);
  assert.equal(summary.repairSummary.grid_patch_count, 80);
  assert.equal(summary.interiorDensityRepairAppliedCount, 1);
  assert.equal(summary.interiorDensityRepairSummary.grid_patch_count, 120);
  assert.equal(summary.gapCounts[0].id, 'site-terrain-scenes');
  assert.ok(summary.trackSummary.some((item) => item.id === 'site-terrain-scenes' && item.weakCount === 1));
  assert.ok(summary.directiveCounts.some((item) => item.id === 'increase-site-terrain-scenes'));

  const markdown = renderTemplateAssimilationMarkdown(summary);
  assert.match(markdown, /Stage 7H Template Assimilation Regression/);
  assert.match(markdown, /Average assimilation audit: 88%/);
  assert.match(markdown, /Stage 7I interior density repair/);
  assert.match(markdown, /site-terrain-scenes/);
});

function result(id, auditPercent, options = {}) {
  return {
    id,
    ok: true,
    focus: ['modern', 'garden'],
    prompt: `prompt for ${id}`,
    outputDir: `out/${id}`,
    audit: {
      active: true,
      percent: auditPercent,
      score: auditPercent,
      grade: auditPercent >= 96 ? 'top-tier-closed-loop' : 'usable',
      readiness: options.readiness || 'medium',
      top_tier_distance: 100 - auditPercent,
      gaps: options.gaps || [],
      tracks: options.tracks || [],
      next_iteration_directives: options.directives || []
    },
    law: {
      active: true,
      percent: options.law || auditPercent,
      grade: 'law-test',
      gaps: []
    },
    aesthetic: {
      active: true,
      score: options.aesthetic || auditPercent,
      grade: 'test',
      gaps: []
    },
    autoRepair: options.autoRepair || {
      active: false,
      reason: 'template-law-coverage-already-satisfied'
    },
    interiorDensityRepair: options.interiorDensityRepair || {
      active: false,
      reason: 'template-interior-density-already-satisfied'
    },
    validation: { warnings: [] }
  };
}

function track(id, percent, missing = []) {
  return {
    id,
    label: id,
    percent,
    score: percent,
    max_score: 100,
    missing
  };
}
