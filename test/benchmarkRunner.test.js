import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderBenchmarkGalleryHtml,
  runBenchmarkSuite,
  summarizeBenchmarkResults
} from '../src/construction/benchmarkRunner.js';

const SAMPLE_SUITE = [
  {
    id: 'sample-waterfront',
    seed: 8101,
    focus: ['visual-composition', 'site-integration'],
    prompt: '建一个湖边现代住宅，带露台、步道和开放客厅。'
  },
  {
    id: 'sample-tower',
    seed: 8102,
    focus: ['creative-narrative', 'vertical-circulation'],
    prompt: '建一个小型法师塔，带书房、楼梯和观景平台。'
  }
];

test('benchmark runner writes summary, reports, gallery, and feedback template', async () => {
  const root = path.resolve('.tmp', `benchmark-runner-test-${Date.now()}`);
  const calls = [];

  try {
    const summary = await runBenchmarkSuite({
      suite: SAMPLE_SUITE,
      root,
      mode: 'mock',
      mcVersion: '1.21',
      limit: 2,
      source: 'test-benchmark-runner',
      seedSource: 'test-suite',
      runWorkflow: async ({ prompt, outputDir, seed, mode, mcVersion }) => {
        calls.push({ prompt, outputDir, seed, mode, mcVersion });
        await fs.mkdir(outputDir, { recursive: true });
        await fs.writeFile(path.join(outputDir, 'preview.html'), `<html><body>${seed}</body></html>`, 'utf8');
        await fs.writeFile(path.join(outputDir, 'run_report.md'), `# report ${seed}`, 'utf8');
        await fs.writeFile(path.join(outputDir, 'architecture_scorecard.json'), '{}', 'utf8');

        return {
          prompt,
          outputDir,
          seed,
          artifacts: {
            previewHtml: path.join(outputDir, 'preview.html'),
            report: path.join(outputDir, 'run_report.md'),
            architectureScorecard: path.join(outputDir, 'architecture_scorecard.json')
          },
          validation: { warnings: [] },
          llmProvider: 'disabled-by-mock-mode',
          llmUsage: { called: false, status: 'not-called' },
          architectureScorecard: fakeEvaluation(seed)
        };
      },
      evaluateResult: (result) => result.architectureScorecard,
      generatedAt: () => new Date('2026-07-09T08:00:00.000Z')
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].seed, 8101);
    assert.equal(calls[1].seed, 8102);
    assert.equal(summary.source, 'test-benchmark-runner');
    assert.equal(summary.total, 2);
    assert.equal(summary.passCount, 2);
    assert.equal(summary.failCount, 0);
    assert.equal(summary.averageScorecard, 86);
    assert.ok(summary.artifacts.summaryJson.endsWith('baseline_benchmark_summary.json'));
    assert.ok(summary.artifacts.reportMd.endsWith('baseline_benchmark_report.md'));
    assert.ok(summary.artifacts.tableCsv.endsWith('baseline_benchmark_table.csv'));
    assert.ok(summary.artifacts.galleryHtml.endsWith('gallery.html'));
    assert.ok(summary.artifacts.feedbackTemplate.endsWith('human_feedback_template.json'));
    assert.equal(summary.results[0].links.preview, 'runs/01-sample-waterfront/preview.html');
    assert.equal(summary.results[0].links.report, 'runs/01-sample-waterfront/run_report.md');
    assert.equal(summary.results[0].links.scorecard, 'runs/01-sample-waterfront/architecture_scorecard.json');

    const summaryJson = JSON.parse(await fs.readFile(path.join(root, 'baseline_benchmark_summary.json'), 'utf8'));
    const report = await fs.readFile(path.join(root, 'baseline_benchmark_report.md'), 'utf8');
    const csv = await fs.readFile(path.join(root, 'baseline_benchmark_table.csv'), 'utf8');
    const gallery = await fs.readFile(path.join(root, 'gallery.html'), 'utf8');
    const feedback = JSON.parse(await fs.readFile(path.join(root, 'human_feedback_template.json'), 'utf8'));

    assert.equal(summaryJson.averageScorecard, 86);
    assert.match(report, /# Architecture Master Baseline Benchmark/);
    assert.match(report, /Repair Priorities/);
    assert.match(csv, /sample-waterfront/);
    assert.match(gallery, /Architecture Master Benchmark Gallery/);
    assert.match(gallery, /<iframe/);
    assert.match(gallery, /sample-waterfront/);
    assert.match(gallery, /architecture_scorecard\.json/);
    assert.match(gallery, /human_feedback_template\.json/);
    assert.equal(feedback.results.length, 2);
    assert.deepEqual(Object.keys(feedback.results[0].human).sort(), ['notes', 'score', 'tags']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('benchmark summary records failures without losing successful runs', () => {
  const summary = summarizeBenchmarkResults([
    {
      id: 'ok-run',
      focus: ['space-planning'],
      prompt: '建一个可居住住宅。',
      seed: 1,
      ok: true,
      outputDir: path.resolve('.tmp', 'benchmark-summary-test', 'runs', '01-ok-run'),
      artifacts: {
        previewHtml: path.resolve('.tmp', 'benchmark-summary-test', 'runs', '01-ok-run', 'preview.html'),
        report: path.resolve('.tmp', 'benchmark-summary-test', 'runs', '01-ok-run', 'run_report.md'),
        architectureScorecard: path.resolve('.tmp', 'benchmark-summary-test', 'runs', '01-ok-run', 'architecture_scorecard.json')
      },
      evaluation: fakeEvaluation(1)
    },
    {
      id: 'failed-run',
      focus: ['site-integration'],
      prompt: '建一个失败样例。',
      seed: 2,
      ok: false,
      outputDir: path.resolve('.tmp', 'benchmark-summary-test', 'runs', '02-failed-run'),
      error: 'boom',
      evaluation: {
        scorecard: { totalScore: 0, grade: 'D', baseScore: 0, advancedScore: 0, dimensions: [] },
        percent: 0,
        grade: 'D',
        redFlags: [{ id: 'workflow.failed', category: 'Failure', label: 'boom' }],
        weakChecks: [{ id: 'workflow.failed', category: 'Failure', label: 'boom' }],
        metrics: {}
      }
    }
  ], path.resolve('.tmp', 'benchmark-summary-test'), {
    mode: 'mock',
    mcVersion: '1.21',
    limit: 2
  }, {
    source: 'unit-test-summary',
    generatedAt: '2026-07-09T08:30:00.000Z'
  });

  assert.equal(summary.passCount, 1);
  assert.equal(summary.failCount, 1);
  assert.equal(summary.redFlagCount, 1);
  assert.equal(summary.averageScorecard, 43);
  assert.equal(summary.results[0].links.preview, 'runs/01-ok-run/preview.html');
  assert.equal(summary.results[1].error, 'boom');
  assert.ok(summary.weakDimensionCounts.some((item) => item.id === 'advanced.surface-site-detail'));
  assert.ok(summary.repairPriorities.some((item) => item.id === 'advanced.surface-site-detail'));
});

test('gallery escapes prompts and exposes run links', () => {
  const html = renderBenchmarkGalleryHtml({
    generatedAt: '2026-07-09T08:45:00.000Z',
    total: 1,
    passCount: 1,
    failCount: 0,
    averageScorecard: 90,
    averageBaseScore: 55,
    averageAdvancedScore: 35,
    redFlagCount: 0,
    artifacts: {
      summaryJson: path.resolve('.tmp', 'gallery', 'baseline_benchmark_summary.json'),
      reportMd: path.resolve('.tmp', 'gallery', 'baseline_benchmark_report.md'),
      tableCsv: path.resolve('.tmp', 'gallery', 'baseline_benchmark_table.csv'),
      feedbackTemplate: path.resolve('.tmp', 'gallery', 'human_feedback_template.json')
    },
    results: [{
      id: 'html-run',
      ok: true,
      prompt: '建一个 <script> 不应执行的住宅。',
      focus: ['visual-composition'],
      seed: 9,
      links: {
        preview: 'runs/01-html-run/preview.html',
        report: 'runs/01-html-run/run_report.md',
        scorecard: 'runs/01-html-run/architecture_scorecard.json'
      },
      scorecard: {
        totalScore: 90,
        grade: 'A',
        baseScore: 55,
        advancedScore: 35,
        dimensions: []
      },
      metrics: { rooms: 8, dimensions: '31x17x14', decorPlacements: 64 },
      redFlags: [],
      weakChecks: []
    }]
  });

  assert.match(html, /runs\/01-html-run\/preview\.html/);
  assert.match(html, /run_report\.md/);
  assert.match(html, /architecture_scorecard\.json/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script> 不应执行/);
});

function fakeEvaluation(seed) {
  const score = seed === 8101 ? 84 : seed === 8102 ? 88 : 86;
  return {
    source: 'local-construction-evaluation-agent',
    version: 2,
    percent: score,
    grade: score >= 88 ? 'B' : 'C',
    passedChecks: 100,
    totalChecks: 120,
    scorecard: {
      totalScore: score,
      maxScore: 100,
      grade: score >= 88 ? 'B' : 'C',
      baseScore: Math.round(score * 0.6),
      baseMaxScore: 60,
      advancedScore: Math.round(score * 0.4),
      advancedMaxScore: 40,
      dimensions: [
        {
          id: 'base.entry-circulation',
          section: 'base',
          sectionLabel: 'Base',
          label: 'Entry and circulation',
          points: 10,
          maxPoints: 10,
          percent: 100,
          evidence: 'entry ok'
        },
        {
          id: 'advanced.surface-site-detail',
          section: 'advanced',
          sectionLabel: 'Advanced',
          label: 'Surface and site detail',
          points: 5,
          maxPoints: 10,
          percent: 50,
          evidence: 'site needs richer foreground'
        }
      ]
    },
    categoryScores: {
      Habitation: { score: 45, maxScore: 50, passed: 45, total: 50, percent: 90 },
      Decoration: { score: 9, maxScore: 10, passed: 9, total: 10, percent: 90 }
    },
    metrics: {
      styleFamily: 'modern',
      dimensions: '31x17x14',
      rooms: 8,
      blockTypes: 24,
      decorPlacements: 64,
      uniqueDecorBlocks: 18
    },
    redFlags: [],
    weakChecks: [{
      id: 'surface.site.zones',
      category: 'Surface',
      label: 'Site plan needs richer zones',
      value: 1
    }]
  };
}
