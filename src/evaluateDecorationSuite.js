#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runConstructionWorkflow, formatLlmUsage } from './construction/workflow.js';
import { ConstructionEvaluationAgent, evaluationCriteria } from './construction/agents/constructionEvaluationAgent.js';
import { DECORATION_EVALUATION_PROMPTS } from './construction/decorationPromptSuite.js';
import { createTimestamp, ensureDir, writeJson } from './lib/fs.js';
import { loadEnvFile } from './lib/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  loadEnvFile(path.join(projectRoot, '.env'));
  const options = parseArgs(process.argv.slice(2));
  const suite = DECORATION_EVALUATION_PROMPTS.slice(0, options.limit);
  const root = path.resolve(options.out || path.join(projectRoot, 'out', `decoration-evaluation-${createTimestamp()}`));
  const runsDir = path.join(root, 'runs');
  await ensureDir(runsDir);

  const evaluator = new ConstructionEvaluationAgent();
  const results = [];

  for (let index = 0; index < suite.length; index += 1) {
    const item = suite[index];
    const runDir = path.join(runsDir, `${String(index + 1).padStart(2, '0')}-${item.id}`);
    console.log(`[${index + 1}/${suite.length}] ${item.id}`);
    try {
      const result = await runConstructionWorkflow({
        prompt: item.prompt,
        mode: options.mode,
        mcVersion: options.mcVersion,
        outputDir: runDir,
        seed: item.seed,
        seedSource: 'decoration-evaluation-suite',
        cwd: projectRoot
      });
      const evaluation = evaluator.run(result);
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
      console.log(`  ${evaluation.grade} ${evaluation.percent}% | D=${categoryPercent(evaluation, 'Decoration')}% | decor=${evaluation.metrics.decorPlacements} unique=${evaluation.metrics.uniqueDecorBlocks} vibrantRooms=${evaluation.metrics.decorationVibrantRooms}/${evaluation.metrics.rooms} fit=${evaluation.metrics.decorationRoleFit}% | LLM=${formatLlmUsage(result.llmUsage)}`);
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
      console.log(`  FAILED | ${error.message}`);
    }
  }

  const summary = summarizeSuite(results, root, options);
  await writeJson(path.join(root, 'decoration_summary.json'), summary);
  await fs.writeFile(path.join(root, 'decoration_report.md'), renderMarkdownReport(summary), 'utf8');
  await fs.writeFile(path.join(root, 'decoration_table.csv'), renderCsv(summary), 'utf8');

  console.log('');
  console.log(renderConsoleTable(summary.results));
  console.log('');
  console.log(`Decoration prompt suite complete: ${summary.passCount}/${summary.total} generated successfully`);
  console.log(`Average score: ${summary.averagePercent}%`);
  console.log(`Average decoration score: ${summary.decorationAveragePercent}%`);
  console.log(`Report: ${path.join(root, 'decoration_report.md')}`);
  console.log(`JSON: ${path.join(root, 'decoration_summary.json')}`);
  console.log(`CSV: ${path.join(root, 'decoration_table.csv')}`);

  if (options.strict && (summary.passCount !== summary.total || summary.redFlagCount > 0)) process.exit(1);
}

function parseArgs(argv) {
  const options = {
    mode: 'mock',
    mcVersion: '1.21',
    out: undefined,
    limit: DECORATION_EVALUATION_PROMPTS.length,
    strict: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') {
      options.mode = argv[++index] || options.mode;
    } else if (arg === '--mc-version') {
      options.mcVersion = argv[++index] || options.mcVersion;
    } else if (arg === '--out') {
      options.out = argv[++index];
    } else if (arg === '--limit') {
      options.limit = Math.max(1, Math.min(DECORATION_EVALUATION_PROMPTS.length, Number(argv[++index]) || options.limit));
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function summarizeSuite(results, root, options) {
  const successful = results.filter((item) => item.ok);
  const evaluations = results.map((item) => item.evaluation).filter(Boolean);
  const averagePercent = average(evaluations.map((item) => Number(item.percent || 0)));
  const decorationAveragePercent = average(evaluations.map((item) => categoryPercent(item, 'Decoration')));
  const categorySummary = summarizeCategories(evaluations);
  const weakCheckCounts = summarizeWeakChecks(evaluations);
  const redFlagCount = evaluations.reduce((sum, item) => sum + (item.redFlags || []).length, 0);

  return {
    source: 'local-decoration-prompt-suite-evaluator',
    generatedAt: new Date().toISOString(),
    root,
    options,
    total: results.length,
    passCount: successful.length,
    failCount: results.length - successful.length,
    redFlagCount,
    averagePercent,
    decorationAveragePercent,
    criteria: evaluationCriteria(),
    decorationCriteria: evaluationCriteria().filter((item) => item.category === 'Decoration'),
    categorySummary,
    weakCheckCounts,
    results: results.map(compactResult)
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

function compactResult(item) {
  const evaluation = item.evaluation || {};
  return {
    id: item.id,
    focus: item.focus,
    seed: item.seed,
    ok: item.ok,
    prompt: item.prompt,
    outputDir: item.outputDir,
    error: item.error,
    llmProvider: item.llmProvider,
    llmUsage: item.llmUsage,
    score: evaluation.score,
    maxScore: evaluation.maxScore,
    percent: evaluation.percent,
    grade: evaluation.grade,
    decorationPercent: categoryPercent(evaluation, 'Decoration'),
    metrics: evaluation.metrics,
    redFlags: evaluation.redFlags || [],
    weakChecks: evaluation.weakChecks || [],
    warnings: item.validation?.warnings || []
  };
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

function renderMarkdownReport(summary) {
  const resultRows = summary.results.map((item, index) => decorationRow(item, index)).join('\n');
  const categoryRows = Object.entries(summary.categorySummary).map(([name, score]) => {
    return `| ${name} | ${score.percent}% | ${score.score}/${score.maxScore} | ${score.passed}/${score.total} |`;
  }).join('\n');
  const criteriaRows = summary.decorationCriteria.map((item) => `| ${item.id} | ${item.weight} | ${item.label} |`).join('\n');
  const weakRows = summary.weakCheckCounts.length
    ? summary.weakCheckCounts.map((item) => `| ${item.id} | ${item.category} | ${item.count} | ${item.label} |`).join('\n')
    : '| - | - | 0 | 无 |';
  const redFlags = summary.results
    .filter((item) => !item.ok || item.redFlags.length)
    .map((item) => {
      const flags = item.redFlags.length
        ? item.redFlags.map((flag) => `  - ${flag.id}: ${flag.label} (${flag.value ?? 'no value'})`).join('\n')
        : `  - ${item.error || 'unknown failure'}`;
      return `- ${item.id}\n${flags}`;
    }).join('\n') || '- 无';
  const detailRows = summary.results.map((item) => {
    const weak = item.weakChecks.length
      ? item.weakChecks.slice(0, 8).map((check) => `${check.id}=${check.value ?? ''}`).join('<br>')
      : '无';
    return `| ${item.id} | ${item.prompt} | ${item.llmProvider || '-'} | ${formatLlmUsage(item.llmUsage)} | ${weak} | ${item.outputDir || '-'} |`;
  }).join('\n');

  return `# Decoration Prompt Suite Evaluation

## Summary

- Total prompts: ${summary.total}
- Successful generations: ${summary.passCount}
- Failed generations: ${summary.failCount}
- Red flags: ${summary.redFlagCount}
- Average score: ${summary.averagePercent}%
- Average decoration score: ${summary.decorationAveragePercent}%
- Mode: ${summary.options.mode}
- Minecraft target: ${summary.options.mcVersion}
- Output root: ${summary.root}

## Decoration Results

| # | Prompt ID | Grade | Score | Decoration | Decor | Unique | Vibrant Rooms | Role Fit | Coverage | Density | Modules | Circulation | Anchors | Style |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
${resultRows}

## Category Scores

| Category | Percent | Score | Checks |
|---|---:|---:|---:|
${categoryRows}

## Decoration Criteria

| Check | Weight | Label |
|---|---:|---|
${criteriaRows}

## Frequent Weak Checks

| Check | Category | Count | Label |
|---|---|---:|---|
${weakRows}

## Red Flags

${redFlags}

## Detailed Prompt Diagnostics

| Prompt ID | Prompt | LLM Provider | LLM Usage | Weak Checks | Output Dir |
|---|---|---|---|---|---|
${detailRows}
`;
}

function decorationRow(item, index) {
  const metrics = item.metrics || {};
  const rooms = metrics.rooms || 0;
  const vibrantRooms = rooms ? `${metrics.decorationVibrantRooms ?? 0}/${rooms}` : '-';
  return `| ${index + 1} | ${item.id} | ${item.ok ? item.grade : 'FAIL'} | ${item.percent ?? 0}% | ${item.decorationPercent ?? 0}% | ${metrics.decorPlacements ?? '-'} | ${metrics.uniqueDecorBlocks ?? '-'} | ${vibrantRooms} | ${metrics.decorationRoleFit ?? '-'}% | ${metrics.decorationHabitableCoverage ?? '-'}% | ${metrics.decorationAverageDensity ?? '-'} | ${metrics.decorationModuleCount ?? '-'} | ${metrics.decorationCirculationShare ?? '-'}% | ${metrics.decorationAnchoredPlacements ?? '-'}% | ${metrics.decorationStyleAnchored === undefined ? '-' : metrics.decorationStyleAnchored} |`;
}

function renderConsoleTable(results) {
  const lines = [
    '| # | id | grade | score | D | decor | unique | vibrantRooms | fit | density | style |',
    '|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|'
  ];
  for (let index = 0; index < results.length; index += 1) {
    const item = results[index];
    const metrics = item.metrics || {};
    const rooms = metrics.rooms || 0;
    const vibrantRooms = rooms ? `${metrics.decorationVibrantRooms ?? 0}/${rooms}` : '-';
    lines.push(`| ${index + 1} | ${item.id} | ${item.ok ? item.grade : 'FAIL'} | ${item.percent ?? 0}% | ${item.decorationPercent ?? 0}% | ${metrics.decorPlacements ?? '-'} | ${metrics.uniqueDecorBlocks ?? '-'} | ${vibrantRooms} | ${metrics.decorationRoleFit ?? '-'}% | ${metrics.decorationAverageDensity ?? '-'} | ${metrics.decorationStyleAnchored === undefined ? '-' : metrics.decorationStyleAnchored} |`);
  }
  return lines.join('\n');
}

function renderCsv(summary) {
  const headers = [
    'index',
    'id',
    'grade',
    'score_percent',
    'decoration_percent',
    'decor_placements',
    'unique_decor_blocks',
    'vibrant_rooms',
    'rooms',
    'role_fit_percent',
    'habitable_coverage_percent',
    'average_density',
    'max_density',
    'module_count',
    'circulation_share_percent',
    'anchored_percent',
    'style_anchored',
    'llm_provider',
    'llm_usage_status',
    'weak_checks',
    'prompt',
    'output_dir'
  ];
  const rows = summary.results.map((item, index) => {
    const metrics = item.metrics || {};
    return [
      index + 1,
      item.id,
      item.ok ? item.grade : 'FAIL',
      item.percent ?? 0,
      item.decorationPercent ?? 0,
      metrics.decorPlacements ?? '',
      metrics.uniqueDecorBlocks ?? '',
      metrics.decorationVibrantRooms ?? '',
      metrics.rooms ?? '',
      metrics.decorationRoleFit ?? '',
      metrics.decorationHabitableCoverage ?? '',
      metrics.decorationAverageDensity ?? '',
      metrics.decorationMaxDensity ?? '',
      metrics.decorationModuleCount ?? '',
      metrics.decorationCirculationShare ?? '',
      metrics.decorationAnchoredPlacements ?? '',
      metrics.decorationStyleAnchored ?? '',
      item.llmProvider || '',
      item.llmUsage?.status || '',
      item.weakChecks.map((check) => check.id).join(';'),
      item.prompt,
      item.outputDir || ''
    ];
  });
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(value) {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function categoryPercent(evaluation, category) {
  return evaluation.categoryScores?.[category]?.percent || 0;
}

function average(values) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length));
}

function printHelp() {
  console.log(`Evaluate the built-in 10 prompt decoration suite.

Usage:
  node src/evaluateDecorationSuite.js
  node src/evaluateDecorationSuite.js --mode auto --out out/decoration-auto
  node src/evaluateDecorationSuite.js --mode llm --out out/decoration-llm

Options:
  --mode mock|auto|llm       Generation mode. Defaults to mock for stable regression runs.
  --mc-version 1.21          Target Minecraft Java version.
  --out <dir>                Evaluation output root.
  --limit <n>                Run the first n prompts.
  --strict                   Exit non-zero if any generation fails or red flags remain.
`);
}

main().catch((error) => {
  console.error(error.message);
  if (process.env.DEBUG) console.error(error);
  process.exit(1);
});
