import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTimestamp, ensureDir, writeJson } from '../lib/fs.js';
import { runConstructionWorkflow } from './workflow.js';
import {
  buildingScoreRubric,
  ConstructionEvaluationAgent,
  evaluationCriteria
} from './agents/constructionEvaluationAgent.js';
import { BASELINE_BENCHMARK_PROMPTS } from './baselineBenchmarkSuite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

const DEFAULT_SOURCE = 'local-baseline-benchmark-runner';
const SUMMARY_FILE = 'baseline_benchmark_summary.json';
const REPORT_FILE = 'baseline_benchmark_report.md';
const CSV_FILE = 'baseline_benchmark_table.csv';
const GALLERY_FILE = 'gallery.html';
const FEEDBACK_FILE = 'human_feedback_template.json';

export async function runBenchmarkSuite({
  suite = BASELINE_BENCHMARK_PROMPTS,
  root,
  out,
  mode = 'mock',
  mcVersion = '1.21',
  limit = suite.length,
  strict = false,
  minAverage = 82,
  source = DEFAULT_SOURCE,
  seedSource = 'baseline-benchmark-suite',
  cwd = projectRoot,
  runWorkflow = runConstructionWorkflow,
  evaluateResult = defaultEvaluateResult,
  generatedAt = () => new Date()
} = {}) {
  const selectedSuite = suite.slice(0, clampInt(limit, 1, suite.length, suite.length));
  const outputRoot = path.resolve(root || out || path.join(cwd, 'out', `baseline-benchmark-${createTimestamp()}`));
  const runsDir = path.join(outputRoot, 'runs');
  await ensureDir(runsDir);

  const results = [];
  const idWidth = selectedSuite.length >= 100 ? 3 : 2;

  for (let index = 0; index < selectedSuite.length; index += 1) {
    const item = selectedSuite[index];
    const runDir = path.join(runsDir, `${pad(index + 1, idWidth)}-${safeId(item.id)}`);
    try {
      const result = await runWorkflow({
        prompt: item.prompt,
        mode,
        mcVersion,
        outputDir: runDir,
        seed: item.seed,
        seedSource,
        cwd
      });
      const evaluation = evaluateResult(result, item);
      results.push({
        id: item.id,
        focus: item.focus,
        prompt: item.prompt,
        seed: item.seed,
        ok: true,
        outputDir: runDir,
        artifacts: result.artifacts,
        validation: result.validation,
        llmProvider: result.llmProvider,
        llmUsage: result.llmUsage,
        evaluation
      });
    } catch (error) {
      results.push({
        id: item.id,
        focus: item.focus,
        prompt: item.prompt,
        seed: item.seed,
        ok: false,
        outputDir: runDir,
        error: error.message,
        evaluation: failedEvaluation(item, error)
      });
    }
  }

  const generatedAtValue = generatedAt();
  const summary = summarizeBenchmarkResults(results, outputRoot, {
    mode,
    mcVersion,
    limit: selectedSuite.length,
    requestedLimit: limit,
    strict,
    minAverage,
    seedSource
  }, {
    source,
    generatedAt: generatedAtValue instanceof Date ? generatedAtValue.toISOString() : String(generatedAtValue)
  });

  await writeJson(summary.artifacts.summaryJson, summary);
  await fs.writeFile(summary.artifacts.reportMd, renderBenchmarkReport(summary), 'utf8');
  await fs.writeFile(summary.artifacts.tableCsv, renderBenchmarkCsv(summary), 'utf8');
  await fs.writeFile(summary.artifacts.galleryHtml, renderBenchmarkGalleryHtml(summary), 'utf8');
  await writeJson(summary.artifacts.feedbackTemplate, renderHumanFeedbackTemplate(summary));

  if (strict && (summary.passCount !== summary.total || summary.redFlagCount > 0 || summary.averageScorecard < minAverage)) {
    const detail = `pass=${summary.passCount}/${summary.total}, redFlags=${summary.redFlagCount}, average=${summary.averageScorecard}`;
    throw new Error(`Benchmark strict gate failed: ${detail}`);
  }

  return summary;
}

export function summarizeBenchmarkResults(results, root, options = {}, metadata = {}) {
  const successful = results.filter((item) => item.ok);
  const evaluations = results.map((item) => item.evaluation).filter(Boolean);
  const scorecards = evaluations.map((item) => item.scorecard).filter(Boolean);
  const averagePercent = average(evaluations.map((item) => Number(item.percent || 0)));
  const averageScorecard = average(scorecards.map((item) => Number(item.totalScore || 0)));
  const averageBaseScore = roundTo(mean(scorecards.map((item) => Number(item.baseScore || 0))), 1);
  const averageAdvancedScore = roundTo(mean(scorecards.map((item) => Number(item.advancedScore || 0))), 1);
  const categorySummary = summarizeCategories(evaluations);
  const weakCheckCounts = summarizeWeakChecks(evaluations);
  const weakDimensionCounts = summarizeWeakDimensions(scorecards);
  const redFlagCount = evaluations.reduce((sum, item) => sum + (item.redFlags || []).length, 0);

  return {
    source: metadata.source || DEFAULT_SOURCE,
    generatedAt: metadata.generatedAt || new Date().toISOString(),
    benchmark: {
      id: 'architecture-master-stage0-baseline',
      name: 'Architecture Master Stage 0 Baseline',
      promptCount: results.length
    },
    root,
    artifacts: {
      summaryJson: path.join(root, SUMMARY_FILE),
      reportMd: path.join(root, REPORT_FILE),
      tableCsv: path.join(root, CSV_FILE),
      galleryHtml: path.join(root, GALLERY_FILE),
      feedbackTemplate: path.join(root, FEEDBACK_FILE)
    },
    options,
    total: results.length,
    passCount: successful.length,
    failCount: results.length - successful.length,
    redFlagCount,
    averagePercent,
    averageScorecard,
    averageBaseScore,
    averageAdvancedScore,
    scoreRubric: buildingScoreRubric(),
    criteria: evaluationCriteria(),
    categorySummary,
    weakCheckCounts,
    weakDimensionCounts,
    repairPriorities: repairPriorities(weakDimensionCounts),
    results: results.map((item, index) => compactResult(item, index, root))
  };
}

export function renderBenchmarkReport(summary) {
  const resultRows = summary.results.map((item, index) => benchmarkRow(item, index)).join('\n');
  const repairRows = summary.repairPriorities.length
    ? summary.repairPriorities.map((item, index) => `| ${index + 1} | ${item.id} | ${item.count} | ${item.averagePercent}% | ${item.action} |`).join('\n')
    : '| 1 | - | 0 | 100% | 暂无需要整改的高频弱项 |';
  const dimensionRows = summary.weakDimensionCounts.length
    ? summary.weakDimensionCounts.map((item) => `| ${item.id} | ${item.sectionLabel} | ${item.count} | ${item.averagePercent}% | ${item.label} | ${item.examples[0] || ''} |`).join('\n')
    : '| - | - | 0 | 100% | 无 | - |';
  const categoryRows = Object.entries(summary.categorySummary).map(([name, score]) => {
    return `| ${name} | ${score.percent}% | ${score.score}/${score.maxScore} | ${score.passed}/${score.total} |`;
  }).join('\n') || '| - | 0% | 0/0 | 0/0 |';
  const weakRows = summary.weakCheckCounts.length
    ? summary.weakCheckCounts.slice(0, 30).map((item) => `| ${item.id} | ${item.category} | ${item.count} | ${item.label} |`).join('\n')
    : '| - | - | 0 | 无 |';
  const detailRows = summary.results.map((item) => {
    const weakDims = item.scorecard.dimensions
      .filter((dimension) => Number(dimension.percent || 0) < 80)
      .slice(0, 8)
      .map((dimension) => `${dimension.id}=${dimension.percent}%`)
      .join('<br>') || '无';
    return `| ${item.id} | ${item.prompt} | ${weakDims} | ${item.links.preview || '-'} | ${item.links.report || '-'} |`;
  }).join('\n');

  return `# Architecture Master Baseline Benchmark

## Summary

- Benchmark: ${summary.benchmark.name}
- Generated at: ${summary.generatedAt}
- Total prompts: ${summary.total}
- Successful generations: ${summary.passCount}
- Failed generations: ${summary.failCount}
- Red flags: ${summary.redFlagCount}
- Average scorecard: ${summary.averageScorecard}/100
- Average base score: ${summary.averageBaseScore}/60
- Average advanced score: ${summary.averageAdvancedScore}/40
- Average legacy checklist score: ${summary.averagePercent}%
- Mode: ${summary.options.mode}
- Minecraft target: ${summary.options.mcVersion}
- Output root: ${summary.root}
- Gallery: ${summary.artifacts.galleryHtml}
- Human feedback template: ${summary.artifacts.feedbackTemplate}

## Results

| # | Prompt ID | Grade | Scorecard | Base | Advanced | Legacy | Habitation | Decoration | Rooms | Blocks | Decor | Weak Dims |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${resultRows}

## Repair Priorities

| # | Dimension | Count | Avg | Action |
|---:|---|---:|---:|---|
${repairRows}

## Frequent Weak Scorecard Dimensions

| Dimension | Section | Count | Avg | Label | Example Evidence |
|---|---|---:|---:|---|---|
${dimensionRows}

## Category Scores

| Category | Percent | Score | Checks |
|---|---:|---:|---:|
${categoryRows}

## Frequent Weak Checks

| Check | Category | Count | Label |
|---|---|---:|---|
${weakRows}

## Detailed Prompt Diagnostics

| Prompt ID | Prompt | Weak Scorecard Dimensions | Preview | Report |
|---|---|---|---|---|
${detailRows}
`;
}

export function renderBenchmarkCsv(summary) {
  const dimensionIds = summary.scoreRubric.map((item) => item.id);
  const headers = [
    'index',
    'id',
    'ok',
    'grade',
    'scorecard_total',
    'base_score',
    'advanced_score',
    'legacy_percent',
    'habitation_percent',
    'decoration_percent',
    'rooms',
    'block_types',
    'decor_placements',
    'weak_dimension_count',
    ...dimensionIds,
    'weak_checks',
    'preview',
    'report',
    'scorecard',
    'prompt'
  ];
  const rows = summary.results.map((item, index) => {
    const byId = new Map((item.scorecard.dimensions || []).map((dimension) => [dimension.id, dimension]));
    const weakDimensionCount = [...byId.values()].filter((dimension) => Number(dimension.percent || 0) < 80).length;
    return [
      index + 1,
      item.id,
      item.ok,
      item.ok ? item.scorecard.grade : 'FAIL',
      item.scorecard.totalScore ?? 0,
      item.scorecard.baseScore ?? 0,
      item.scorecard.advancedScore ?? 0,
      item.legacyScore ?? 0,
      item.habitationPercent ?? 0,
      item.decorationPercent ?? 0,
      item.metrics?.rooms ?? '',
      item.metrics?.blockTypes ?? '',
      item.metrics?.decorPlacements ?? '',
      weakDimensionCount,
      ...dimensionIds.map((id) => byId.get(id)?.percent ?? ''),
      item.weakChecks.map((check) => check.id).join(';'),
      item.links.preview || '',
      item.links.report || '',
      item.links.scorecard || '',
      item.prompt
    ];
  });
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

export function renderBenchmarkGalleryHtml(summary) {
  const resultCards = summary.results.map(renderGalleryCard).join('\n');
  const priorityItems = summary.repairPriorities?.length
    ? summary.repairPriorities.slice(0, 6).map((item) => `<li><strong>${escapeHtml(item.label || item.id)}</strong><span>${escapeHtml(item.count)} runs, avg ${escapeHtml(item.averagePercent)}%</span></li>`).join('\n')
    : '<li><strong>No repeated weak dimensions</strong><span>Keep watching future runs.</span></li>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Architecture Master Benchmark Gallery</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #24211d;
      --muted: #6d665f;
      --line: #d8d0c4;
      --surface: #fbfaf7;
      --panel: #ffffff;
      --accent: #236c5b;
      --accent-2: #a45535;
      --good: #2f7d43;
      --warn: #a76500;
      --bad: #a23b3b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background: var(--surface);
      font: 15px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      padding: 28px clamp(18px, 4vw, 48px) 18px;
      border-bottom: 1px solid var(--line);
      background: #fffdf9;
    }
    h1 {
      margin: 0 0 10px;
      font-size: clamp(28px, 4vw, 44px);
      font-weight: 760;
      letter-spacing: 0;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 19px;
      letter-spacing: 0;
    }
    a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 3px; }
    .subtle { color: var(--muted); }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
      margin-top: 18px;
      max-width: 980px;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 12px;
      min-height: 78px;
    }
    .metric b {
      display: block;
      font-size: 24px;
      line-height: 1.1;
    }
    main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(260px, 330px);
      gap: 18px;
      padding: 20px clamp(18px, 4vw, 48px) 40px;
    }
    .toolbar {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin: 0 0 18px;
    }
    .button {
      display: inline-flex;
      align-items: center;
      min-height: 34px;
      padding: 6px 10px;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: #fff;
      color: var(--ink);
      text-decoration: none;
      font-weight: 620;
    }
    .runs {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 16px;
    }
    .run-card, aside {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      overflow: hidden;
    }
    .run-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 13px 14px;
      border-bottom: 1px solid var(--line);
    }
    .run-title {
      margin: 0;
      font-size: 17px;
      overflow-wrap: anywhere;
    }
    .badge {
      flex: 0 0 auto;
      min-width: 58px;
      border-radius: 999px;
      padding: 5px 9px;
      text-align: center;
      font-weight: 760;
      color: #fff;
      background: var(--accent);
    }
    .badge.fail { background: var(--bad); }
    .preview-frame {
      display: block;
      width: 100%;
      height: 310px;
      border: 0;
      background: #f1eee8;
    }
    .missing-preview {
      display: grid;
      place-items: center;
      min-height: 180px;
      color: var(--muted);
      background: #f1eee8;
    }
    .run-body { padding: 13px 14px 16px; }
    .prompt {
      margin: 0 0 12px;
      color: var(--muted);
      overflow-wrap: anywhere;
    }
    .facts {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }
    .fact {
      border-left: 3px solid var(--accent-2);
      padding-left: 8px;
      min-height: 40px;
    }
    .fact span {
      display: block;
      color: var(--muted);
      font-size: 12px;
    }
    .links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .links a {
      border: 1px solid var(--line);
      border-radius: 7px;
      padding: 5px 8px;
      background: #fffdf9;
      text-decoration: none;
    }
    .weak-list {
      margin: 0;
      padding-left: 18px;
      color: var(--muted);
    }
    aside {
      align-self: start;
      position: sticky;
      top: 16px;
      padding: 16px;
    }
    aside ul {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 10px;
    }
    aside li {
      border-bottom: 1px solid var(--line);
      padding-bottom: 10px;
    }
    aside li:last-child { border-bottom: 0; padding-bottom: 0; }
    aside strong, aside span { display: block; }
    aside span { color: var(--muted); }
    @media (max-width: 900px) {
      main { grid-template-columns: 1fr; }
      aside { position: static; }
      .runs { grid-template-columns: 1fr; }
      .facts { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Architecture Master Benchmark Gallery</h1>
    <div class="subtle">Generated ${escapeHtml(summary.generatedAt)} · ${escapeHtml(summary.benchmark?.name || 'Baseline benchmark')}</div>
    <section class="metrics" aria-label="Benchmark summary">
      <div class="metric"><b>${escapeHtml(summary.passCount)}/${escapeHtml(summary.total)}</b><span>successful runs</span></div>
      <div class="metric"><b>${escapeHtml(summary.averageScorecard)}</b><span>average scorecard</span></div>
      <div class="metric"><b>${escapeHtml(summary.averageBaseScore)}</b><span>average base / 60</span></div>
      <div class="metric"><b>${escapeHtml(summary.averageAdvancedScore)}</b><span>average advanced / 40</span></div>
      <div class="metric"><b>${escapeHtml(summary.redFlagCount)}</b><span>red flags</span></div>
    </section>
  </header>
  <main>
    <section>
      <nav class="toolbar" aria-label="Benchmark artifacts">
        <a class="button" href="${artifactHref(summary.artifacts?.summaryJson)}">Summary JSON</a>
        <a class="button" href="${artifactHref(summary.artifacts?.reportMd)}">Markdown Report</a>
        <a class="button" href="${artifactHref(summary.artifacts?.tableCsv)}">CSV Table</a>
        <a class="button" href="${artifactHref(summary.artifacts?.feedbackTemplate)}">Human Feedback</a>
      </nav>
      <div class="runs">
${resultCards}
      </div>
    </section>
    <aside>
      <h2>Repair Priorities</h2>
      <ul>
${priorityItems}
      </ul>
    </aside>
  </main>
</body>
</html>
`;
}

export function renderHumanFeedbackTemplate(summary) {
  return {
    source: 'human-feedback-template',
    benchmark: summary.benchmark,
    generatedAt: summary.generatedAt,
    instructions: '填写每个结果的 human.score、human.tags 和 human.notes，用于后续人工品味记忆与 A/B 回归。',
    results: summary.results.map((item) => ({
      id: item.id,
      seed: item.seed,
      prompt: item.prompt,
      outputDir: item.outputDir,
      preview: item.links.preview,
      scorecard: item.scorecard.totalScore,
      human: {
        score: null,
        tags: [],
        notes: ''
      }
    }))
  };
}

function defaultEvaluateResult(result) {
  return result.architectureScorecard || new ConstructionEvaluationAgent().run(result);
}

function failedEvaluation(item, error) {
  return {
    source: 'local-construction-evaluation-agent',
    version: 2,
    prompt: item.prompt,
    score: 0,
    maxScore: 1,
    ratio: 0,
    percent: 0,
    grade: 'D',
    scorecard: {
      totalScore: 0,
      maxScore: 100,
      grade: 'D',
      baseScore: 0,
      baseMaxScore: 60,
      advancedScore: 0,
      advancedMaxScore: 40,
      dimensions: []
    },
    passedChecks: 0,
    totalChecks: 1,
    categoryScores: {
      Failure: { score: 0, maxScore: 1, passed: 0, total: 1, percent: 0 }
    },
    redFlags: [{ id: 'workflow.failed', category: 'Failure', label: error.message, weight: 5 }],
    weakChecks: [{ id: 'workflow.failed', category: 'Failure', label: error.message, weight: 5 }],
    strengths: [],
    metrics: {},
    checks: []
  };
}

function compactResult(item, index, root) {
  const evaluation = item.evaluation || {};
  const scorecard = evaluation.scorecard || {};
  const artifacts = fallbackArtifacts(item.outputDir, item.artifacts);
  const dimensions = (scorecard.dimensions || []).map((dimension) => ({
    id: dimension.id,
    section: dimension.section,
    sectionLabel: dimension.sectionLabel,
    label: dimension.label,
    points: dimension.points,
    maxPoints: dimension.maxPoints,
    percent: dimension.percent,
    evidence: dimension.evidence
  }));

  return {
    index: index + 1,
    id: item.id,
    focus: item.focus || [],
    seed: item.seed,
    ok: item.ok,
    prompt: item.prompt,
    outputDir: item.outputDir,
    outputDirRelative: relativeLink(root, item.outputDir),
    error: item.error,
    llmProvider: item.llmProvider,
    llmUsage: item.llmUsage,
    links: {
      outputDir: relativeLink(root, item.outputDir),
      preview: artifacts.previewHtml ? relativeLink(root, artifacts.previewHtml) : undefined,
      report: artifacts.report ? relativeLink(root, artifacts.report) : undefined,
      scorecard: artifacts.architectureScorecard ? relativeLink(root, artifacts.architectureScorecard) : undefined
    },
    legacyScore: evaluation.percent,
    legacyGrade: evaluation.grade,
    scorecard: {
      totalScore: scorecard.totalScore || 0,
      maxScore: scorecard.maxScore || 100,
      grade: scorecard.grade || evaluation.grade || 'D',
      baseScore: scorecard.baseScore || 0,
      baseMaxScore: scorecard.baseMaxScore || 60,
      advancedScore: scorecard.advancedScore || 0,
      advancedMaxScore: scorecard.advancedMaxScore || 40,
      dimensions
    },
    habitationPercent: categoryPercent(evaluation, 'Habitation'),
    decorationPercent: categoryPercent(evaluation, 'Decoration'),
    metrics: evaluation.metrics || {},
    redFlags: evaluation.redFlags || [],
    weakChecks: evaluation.weakChecks || [],
    warnings: item.validation?.warnings || []
  };
}

function fallbackArtifacts(outputDir, artifacts = {}) {
  return {
    previewHtml: artifacts.previewHtml || path.join(outputDir, 'preview.html'),
    report: artifacts.report || path.join(outputDir, 'run_report.md'),
    architectureScorecard: artifacts.architectureScorecard || path.join(outputDir, 'architecture_scorecard.json')
  };
}

function summarizeCategories(evaluations) {
  const categories = {};
  for (const evaluation of evaluations) {
    for (const [name, score] of Object.entries(evaluation.categoryScores || {})) {
      categories[name] ||= { score: 0, maxScore: 0, passed: 0, total: 0, percent: 0 };
      categories[name].score += score.score;
      categories[name].maxScore += score.maxScore;
      categories[name].passed += score.passed;
      categories[name].total += score.total;
    }
  }
  for (const item of Object.values(categories)) {
    item.percent = item.maxScore ? Math.round((item.score / item.maxScore) * 100) : 0;
  }
  return categories;
}

function summarizeWeakChecks(evaluations) {
  const counts = {};
  for (const evaluation of evaluations) {
    for (const check of evaluation.weakChecks || []) {
      counts[check.id] ||= {
        id: check.id,
        category: check.category,
        label: check.label,
        count: 0
      };
      counts[check.id].count += 1;
    }
  }
  return Object.values(counts).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

function summarizeWeakDimensions(scorecards) {
  const counts = {};
  for (const scorecard of scorecards) {
    for (const dimension of scorecard.dimensions || []) {
      if (Number(dimension.percent || 0) >= 80) continue;
      counts[dimension.id] ||= {
        id: dimension.id,
        section: dimension.section,
        sectionLabel: dimension.sectionLabel,
        label: dimension.label,
        count: 0,
        totalPercent: 0,
        examples: []
      };
      counts[dimension.id].count += 1;
      counts[dimension.id].totalPercent += Number(dimension.percent || 0);
      if (counts[dimension.id].examples.length < 5) counts[dimension.id].examples.push(dimension.evidence || '');
    }
  }
  return Object.values(counts)
    .map((item) => ({ ...item, averagePercent: Math.round(item.totalPercent / Math.max(1, item.count)) }))
    .sort((a, b) => b.count - a.count || a.averagePercent - b.averagePercent || a.id.localeCompare(b.id));
}

function repairPriorities(weakDimensions) {
  return weakDimensions.slice(0, 8).map((item) => {
    const action = {
      'base.entry-circulation': '优先检查 mainDoor、外部路径、楼梯和 floorOpening 的生成规则。',
      'base.residential-program': '补齐缺失的卧室、卫生间、厨房、储藏和公共核心 fallback。',
      'base.shell-structure': '提高围护/屋顶/楼板覆盖率，检查附属体块是否连接主体。',
      'base.room-layout': '调整 BSP 最小面积、紧凑布局和同层房间重叠处理。',
      'advanced.surface-site-detail': '增加表皮、屋顶、场地模块的触发词和落块顺序。',
      'advanced.vibrant-interior': '增强室内专家的房间覆盖、彩色层和功能匹配。',
      'advanced.resilience-utilities': '让太阳能、雨水、抗风、防火、防洪信号进入结构和 CSG。',
      'advanced.creativity': '增加特殊体块、风格预设和高级模块组合。'
    }[item.id] || '查看该维度 evidence，补对应 agent 的语义字段或几何消费。';
    return { ...item, action };
  });
}

function benchmarkRow(item, index) {
  const metrics = item.metrics || {};
  const scorecard = item.scorecard || {};
  const weakDims = (scorecard.dimensions || []).filter((dimension) => Number(dimension.percent || 0) < 80).length;
  return `| ${index + 1} | ${item.id} | ${item.ok ? scorecard.grade : 'FAIL'} | ${scorecard.totalScore ?? 0} | ${scorecard.baseScore ?? 0} | ${scorecard.advancedScore ?? 0} | ${item.legacyScore ?? 0}% | ${item.habitationPercent ?? 0}% | ${item.decorationPercent ?? 0}% | ${metrics.rooms ?? '-'} | ${metrics.blockTypes ?? '-'} | ${metrics.decorPlacements ?? '-'} | ${weakDims} |`;
}

function renderGalleryCard(item) {
  const scorecard = item.scorecard || {};
  const metrics = item.metrics || {};
  const weakDims = (scorecard.dimensions || [])
    .filter((dimension) => Number(dimension.percent || 0) < 80)
    .slice(0, 5);
  const weakItems = weakDims.length
    ? weakDims.map((dimension) => `<li>${escapeHtml(dimension.label || dimension.id)}: ${escapeHtml(dimension.percent)}%</li>`).join('\n')
    : '<li>No weak scorecard dimensions below 80%.</li>';
  const frame = item.ok && item.links?.preview
    ? `<iframe class="preview-frame" title="${escapeHtml(item.id)} preview" src="${escapeHtml(item.links.preview)}" loading="lazy"></iframe>`
    : `<div class="missing-preview">${escapeHtml(item.error || 'Generation failed')}</div>`;
  const linkItems = [
    item.links?.preview ? `<a href="${escapeHtml(item.links.preview)}">Preview</a>` : '',
    item.links?.report ? `<a href="${escapeHtml(item.links.report)}">Report</a>` : '',
    item.links?.scorecard ? `<a href="${escapeHtml(item.links.scorecard)}">architecture_scorecard.json</a>` : ''
  ].filter(Boolean).join('\n');

  return `        <article class="run-card">
          <div class="run-head">
            <div>
              <h2 class="run-title">${escapeHtml(item.index)}. ${escapeHtml(item.id)}</h2>
              <div class="subtle">seed ${escapeHtml(item.seed)} · ${escapeHtml((item.focus || []).join(', ') || 'general')}</div>
            </div>
            <div class="badge${item.ok ? '' : ' fail'}">${escapeHtml(item.ok ? `${scorecard.totalScore ?? 0}` : 'FAIL')}</div>
          </div>
          ${frame}
          <div class="run-body">
            <p class="prompt">${escapeHtml(item.prompt)}</p>
            <div class="facts">
              <div class="fact"><strong>${escapeHtml(scorecard.grade || 'D')}</strong><span>grade</span></div>
              <div class="fact"><strong>${escapeHtml(scorecard.baseScore ?? 0)}/${escapeHtml(scorecard.baseMaxScore ?? 60)}</strong><span>base</span></div>
              <div class="fact"><strong>${escapeHtml(scorecard.advancedScore ?? 0)}/${escapeHtml(scorecard.advancedMaxScore ?? 40)}</strong><span>advanced</span></div>
              <div class="fact"><strong>${escapeHtml(metrics.rooms ?? '-')}</strong><span>rooms</span></div>
              <div class="fact"><strong>${escapeHtml(metrics.decorPlacements ?? '-')}</strong><span>decor</span></div>
              <div class="fact"><strong>${escapeHtml(metrics.dimensions ?? '-')}</strong><span>dimensions</span></div>
            </div>
            <div class="links">${linkItems || '<span class="subtle">No run artifacts</span>'}</div>
            <ul class="weak-list">
${weakItems}
            </ul>
          </div>
        </article>`;
}

function artifactHref(pathValue) {
  if (!pathValue) return '#';
  return escapeHtml(path.basename(pathValue));
}

function relativeLink(root, target) {
  if (!target) return undefined;
  return path.relative(root, target).split(path.sep).join('/');
}

function safeId(value) {
  return String(value || 'run').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'run';
}

function categoryPercent(evaluation, category) {
  return evaluation.categoryScores?.[category]?.percent || 0;
}

function average(values) {
  return Math.round(mean(values));
}

function mean(values) {
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(1, values.length);
}

function roundTo(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function clampInt(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function pad(value, width = 2) {
  return String(value).padStart(width, '0');
}

function csvCell(value) {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
