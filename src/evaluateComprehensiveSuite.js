#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runConstructionWorkflow, formatLlmUsage } from './construction/workflow.js';
import { buildingScoreRubric, ConstructionEvaluationAgent, evaluationCriteria } from './construction/agents/constructionEvaluationAgent.js';
import { COMPREHENSIVE_EVALUATION_PROMPTS } from './construction/comprehensivePromptSuite.js';
import { createTimestamp, ensureDir, writeJson } from './lib/fs.js';
import { loadEnvFile } from './lib/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  loadEnvFile(path.join(projectRoot, '.env'));
  const options = parseArgs(process.argv.slice(2));
  const suite = COMPREHENSIVE_EVALUATION_PROMPTS.slice(0, options.limit);
  const root = path.resolve(options.out || path.join(projectRoot, 'out', `comprehensive-evaluation-${createTimestamp()}`));
  const runsDir = path.join(root, 'runs');
  await ensureDir(runsDir);

  const evaluator = new ConstructionEvaluationAgent();
  const results = [];

  for (let index = 0; index < suite.length; index += 1) {
    const item = suite[index];
    const runDir = path.join(runsDir, `${String(index + 1).padStart(3, '0')}-${item.id}`);
    console.log(`[${index + 1}/${suite.length}] ${item.id}`);
    try {
      const result = await runConstructionWorkflow({
        prompt: item.prompt,
        mode: options.mode,
        mcVersion: options.mcVersion,
        outputDir: runDir,
        seed: item.seed,
        seedSource: 'comprehensive-evaluation-suite',
        cwd: projectRoot
      });
      const evaluation = evaluator.run(result);
      const scorecard = evaluation.scorecard || {};
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
      console.log(`  ${scorecard.grade || evaluation.grade} ${scorecard.totalScore ?? evaluation.percent}/100 | base=${scorecard.baseScore ?? '-'} adv=${scorecard.advancedScore ?? '-'} | H=${categoryPercent(evaluation, 'Habitation')}% D=${categoryPercent(evaluation, 'Decoration')}% | LLM=${formatLlmUsage(result.llmUsage)}`);
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
  await writeJson(path.join(root, 'comprehensive_summary.json'), summary);
  await fs.writeFile(path.join(root, 'comprehensive_report.md'), renderMarkdownReport(summary), 'utf8');
  await fs.writeFile(path.join(root, 'comprehensive_table.csv'), renderCsv(summary), 'utf8');

  console.log('');
  console.log(renderConsoleTable(summary.results));
  console.log('');
  console.log(`Comprehensive prompt suite complete: ${summary.passCount}/${summary.total} generated successfully`);
  console.log(`Average scorecard: ${summary.averageScorecard}/100 (base ${summary.averageBaseScore}/60, advanced ${summary.averageAdvancedScore}/40)`);
  console.log(`Average legacy checklist score: ${summary.averagePercent}%`);
  console.log(`Report: ${path.join(root, 'comprehensive_report.md')}`);
  console.log(`JSON: ${path.join(root, 'comprehensive_summary.json')}`);
  console.log(`CSV: ${path.join(root, 'comprehensive_table.csv')}`);

  if (options.strict && (summary.passCount !== summary.total || summary.redFlagCount > 0 || summary.averageScorecard < options.minAverage)) process.exit(1);
}

function parseArgs(argv) {
  const options = {
    mode: 'mock',
    mcVersion: '1.21',
    out: undefined,
    limit: COMPREHENSIVE_EVALUATION_PROMPTS.length,
    strict: false,
    minAverage: 82
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
      options.limit = Math.max(1, Math.min(COMPREHENSIVE_EVALUATION_PROMPTS.length, Number(argv[++index]) || options.limit));
    } else if (arg === '--min-average') {
      options.minAverage = Number(argv[++index]) || options.minAverage;
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
    source: 'local-comprehensive-prompt-suite-evaluator',
    generatedAt: new Date().toISOString(),
    root,
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

function compactResult(item) {
  const evaluation = item.evaluation || {};
  const scorecard = evaluation.scorecard || {};
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
    legacyScore: evaluation.percent,
    legacyGrade: evaluation.grade,
    scorecard: {
      totalScore: scorecard.totalScore || 0,
      grade: scorecard.grade || 'D',
      baseScore: scorecard.baseScore || 0,
      advancedScore: scorecard.advancedScore || 0,
      dimensions: (scorecard.dimensions || []).map((dimension) => ({
        id: dimension.id,
        section: dimension.section,
        label: dimension.label,
        points: dimension.points,
        maxPoints: dimension.maxPoints,
        percent: dimension.percent,
        evidence: dimension.evidence
      }))
    },
    habitationPercent: categoryPercent(evaluation, 'Habitation'),
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
    scorecard: {
      totalScore: 0,
      grade: 'D',
      baseScore: 0,
      advancedScore: 0,
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

function renderMarkdownReport(summary) {
  const resultRows = summary.results.map((item, index) => comprehensiveRow(item, index)).join('\n');
  const dimensionRows = summary.weakDimensionCounts.length
    ? summary.weakDimensionCounts.map((item) => `| ${item.id} | ${item.sectionLabel} | ${item.count} | ${item.averagePercent}% | ${item.label} | ${item.examples[0] || ''} |`).join('\n')
    : '| - | - | 0 | 100% | 无 | - |';
  const repairRows = summary.repairPriorities.length
    ? summary.repairPriorities.map((item, index) => `| ${index + 1} | ${item.id} | ${item.count} | ${item.averagePercent}% | ${item.action} |`).join('\n')
    : '| 1 | - | 0 | 100% | 暂无需要整改的高频弱项 |';
  const categoryRows = Object.entries(summary.categorySummary).map(([name, score]) => {
    return `| ${name} | ${score.percent}% | ${score.score}/${score.maxScore} | ${score.passed}/${score.total} |`;
  }).join('\n');
  const weakRows = summary.weakCheckCounts.length
    ? summary.weakCheckCounts.slice(0, 30).map((item) => `| ${item.id} | ${item.category} | ${item.count} | ${item.label} |`).join('\n')
    : '| - | - | 0 | 无 |';
  const rubricRows = summary.scoreRubric.map((item) => `| ${item.sectionLabel} | ${item.label} | ${item.maxPoints} | ${item.description} |`).join('\n');
  const detailRows = summary.results.map((item) => {
    const weakDims = item.scorecard.dimensions
      .filter((dimension) => Number(dimension.percent || 0) < 80)
      .slice(0, 8)
      .map((dimension) => `${dimension.id}=${dimension.percent}%`)
      .join('<br>') || '无';
    return `| ${item.id} | ${item.prompt} | ${weakDims} | ${item.outputDir || '-'} |`;
  }).join('\n');

  return `# Comprehensive Building Prompt Suite Evaluation

## Summary

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

## Results

| # | Prompt ID | Grade | Scorecard | Base | Advanced | Legacy | Habitation | Decoration | Rooms | Blocks | Decor | Weak Dims |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
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

## Score Rubric

| Section | Dimension | Points | Description |
|---|---|---:|---|
${rubricRows}

## Detailed Prompt Diagnostics

| Prompt ID | Prompt | Weak Scorecard Dimensions | Output Dir |
|---|---|---|---|
${detailRows}
`;
}

function comprehensiveRow(item, index) {
  const metrics = item.metrics || {};
  const scorecard = item.scorecard || {};
  const weakDims = (scorecard.dimensions || []).filter((dimension) => Number(dimension.percent || 0) < 80).length;
  return `| ${index + 1} | ${item.id} | ${item.ok ? scorecard.grade : 'FAIL'} | ${scorecard.totalScore ?? 0} | ${scorecard.baseScore ?? 0} | ${scorecard.advancedScore ?? 0} | ${item.legacyScore ?? 0}% | ${item.habitationPercent ?? 0}% | ${item.decorationPercent ?? 0}% | ${metrics.rooms ?? '-'} | ${metrics.blockTypes ?? '-'} | ${metrics.decorPlacements ?? '-'} | ${weakDims} |`;
}

function renderConsoleTable(results) {
  const lines = [
    '| # | id | grade | score | base | adv | H | D | rooms | decor | weakDims |',
    '|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
  ];
  for (let index = 0; index < results.length; index += 1) {
    const item = results[index];
    const scorecard = item.scorecard || {};
    const weakDims = (scorecard.dimensions || []).filter((dimension) => Number(dimension.percent || 0) < 80).length;
    lines.push(`| ${index + 1} | ${item.id} | ${item.ok ? scorecard.grade : 'FAIL'} | ${scorecard.totalScore ?? 0} | ${scorecard.baseScore ?? 0} | ${scorecard.advancedScore ?? 0} | ${item.habitationPercent ?? 0}% | ${item.decorationPercent ?? 0}% | ${item.metrics?.rooms ?? '-'} | ${item.metrics?.decorPlacements ?? '-'} | ${weakDims} |`);
  }
  return lines.join('\n');
}

function renderCsv(summary) {
  const dimensionIds = summary.scoreRubric.map((item) => item.id);
  const headers = [
    'index',
    'id',
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
    'prompt',
    'output_dir'
  ];
  const rows = summary.results.map((item, index) => {
    const byId = new Map((item.scorecard.dimensions || []).map((dimension) => [dimension.id, dimension]));
    const weakDimensionCount = [...byId.values()].filter((dimension) => Number(dimension.percent || 0) < 80).length;
    return [
      index + 1,
      item.id,
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
  return Math.round(mean(values));
}

function mean(values) {
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(1, values.length);
}

function roundTo(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function printHelp() {
  console.log(`Evaluate the built-in 100 prompt comprehensive building suite.

Usage:
  node src/evaluateComprehensiveSuite.js
  node src/evaluateComprehensiveSuite.js --limit 10 --out out/comprehensive-smoke
  node src/evaluateComprehensiveSuite.js --strict --min-average 85

Options:
  --mode mock|auto|llm       Generation mode. Defaults to mock for stable regression runs.
  --mc-version 1.21          Target Minecraft Java version.
  --out <dir>                Evaluation output root.
  --limit <n>                Run the first n prompts.
  --min-average <n>          Strict-mode minimum average scorecard. Defaults to 82.
  --strict                   Exit non-zero if generation fails, red flags remain, or average is too low.
`);
}

main().catch((error) => {
  console.error(error.message);
  if (process.env.DEBUG) console.error(error);
  process.exit(1);
});
