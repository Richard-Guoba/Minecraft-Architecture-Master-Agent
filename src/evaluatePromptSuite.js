#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runConstructionWorkflow } from './construction/workflow.js';
import { ConstructionEvaluationAgent, evaluationCriteria } from './construction/agents/constructionEvaluationAgent.js';
import { CONSTRUCTION_EVALUATION_PROMPTS } from './construction/evaluationPromptSuite.js';
import { createTimestamp, ensureDir, writeJson } from './lib/fs.js';
import { loadEnvFile } from './lib/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  loadEnvFile(path.join(projectRoot, '.env'));
  const options = parseArgs(process.argv.slice(2));
  const suite = CONSTRUCTION_EVALUATION_PROMPTS.slice(0, options.limit);
  const root = path.resolve(options.out || path.join(projectRoot, 'out', `evaluation-${createTimestamp()}`));
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
        seedSource: 'evaluation-suite',
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
        evaluation
      });
      console.log(`  ${evaluation.grade} ${evaluation.percent}% | rooms=${evaluation.metrics.rooms} decor=${evaluation.metrics.decorPlacements} uniqueDecor=${evaluation.metrics.uniqueDecorBlocks}`);
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
  await writeJson(path.join(root, 'evaluation_summary.json'), summary);
  await fs.writeFile(path.join(root, 'evaluation_report.md'), renderMarkdownReport(summary), 'utf8');

  console.log('');
  console.log(`Prompt suite complete: ${summary.passCount}/${summary.total} generated successfully`);
  console.log(`Average score: ${summary.averagePercent}%`);
  console.log(`Report: ${path.join(root, 'evaluation_report.md')}`);
  console.log(`JSON: ${path.join(root, 'evaluation_summary.json')}`);

  if (options.strict && summary.passCount !== summary.total) process.exit(1);
}

function parseArgs(argv) {
  const options = {
    mode: 'mock',
    mcVersion: '1.21',
    out: undefined,
    limit: CONSTRUCTION_EVALUATION_PROMPTS.length,
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
      options.limit = Math.max(1, Math.min(CONSTRUCTION_EVALUATION_PROMPTS.length, Number(argv[++index]) || options.limit));
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
  const averagePercent = Math.round(evaluations.reduce((sum, item) => sum + Number(item.percent || 0), 0) / Math.max(1, evaluations.length));
  const categorySummary = summarizeCategories(evaluations);
  const weakCheckCounts = summarizeWeakChecks(evaluations);

  return {
    source: 'local-prompt-suite-evaluator',
    generatedAt: new Date().toISOString(),
    root,
    options,
    total: results.length,
    passCount: successful.length,
    failCount: results.length - successful.length,
    averagePercent,
    criteria: evaluationCriteria(),
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
  return {
    id: item.id,
    focus: item.focus,
    seed: item.seed,
    ok: item.ok,
    prompt: item.prompt,
    outputDir: item.outputDir,
    error: item.error,
    score: item.evaluation?.score,
    maxScore: item.evaluation?.maxScore,
    percent: item.evaluation?.percent,
    grade: item.evaluation?.grade,
    metrics: item.evaluation?.metrics,
    redFlags: item.evaluation?.redFlags || [],
    weakChecks: item.evaluation?.weakChecks || [],
    warnings: item.validation?.warnings || []
  };
}

function failedEvaluation(item, error) {
  return {
    source: 'local-construction-evaluation-agent',
    version: 1,
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
  const resultRows = summary.results.map((item, index) => {
    const metrics = item.metrics || {};
    return `| ${index + 1} | ${item.id} | ${item.ok ? item.grade : 'FAIL'} | ${item.percent ?? 0}% | ${metrics.styleFamily || '-'} | ${metrics.dimensions || '-'} | ${metrics.rooms ?? '-'} | ${metrics.decorPlacements ?? '-'} | ${metrics.uniqueDecorBlocks ?? '-'} | ${metrics.vibrantPlacements ?? '-'} |`;
  }).join('\n');

  const categoryRows = Object.entries(summary.categorySummary).map(([name, score]) => {
    return `| ${name} | ${score.percent}% | ${score.score}/${score.maxScore} | ${score.passed}/${score.total} |`;
  }).join('\n');

  const weakRows = summary.weakCheckCounts.length
    ? summary.weakCheckCounts.map((item) => `| ${item.id} | ${item.category} | ${item.count} | ${item.label} |`).join('\n')
    : '| - | - | 0 | 无 |';

  const criteriaRows = summary.criteria.map((item) => `| ${item.id} | ${item.category} | ${item.weight} | ${item.label} |`).join('\n');
  const failureDetails = summary.results
    .filter((item) => !item.ok || item.redFlags.length)
    .map((item) => {
      const flags = item.redFlags.length
        ? item.redFlags.map((flag) => `  - ${flag.id}: ${flag.label} (${flag.value ?? 'no value'})`).join('\n')
        : `  - ${item.error || 'unknown failure'}`;
      return `- ${item.id}\n${flags}`;
    }).join('\n') || '- 无';

  return `# Construction Prompt Suite Evaluation

## Summary

- Total prompts: ${summary.total}
- Successful generations: ${summary.passCount}
- Failed generations: ${summary.failCount}
- Average score: ${summary.averagePercent}%
- Mode: ${summary.options.mode}
- Minecraft target: ${summary.options.mcVersion}
- Output root: ${summary.root}

## Results

| # | Prompt ID | Grade | Score | Style | Dimensions | Rooms | Decor | Unique Decor Blocks | Vibrant |
|---|---|---:|---:|---|---:|---:|---:|---:|---:|
${resultRows}

## Category Scores

| Category | Percent | Score | Checks |
|---|---:|---:|---:|
${categoryRows}

## Frequent Weak Checks

| Check | Category | Count | Label |
|---|---|---:|---|
${weakRows}

## Red Flags

${failureDetails}

## Full Evaluation Criteria

| Check | Category | Weight | Label |
|---|---|---:|---|
${criteriaRows}
`;
}

function printHelp() {
  console.log(`Evaluate the built-in 20 prompt construction suite.

Usage:
  node src/evaluatePromptSuite.js
  node src/evaluatePromptSuite.js --limit 5 --out out/eval-smoke

Options:
  --mode mock|auto|llm       Generation mode. Defaults to mock for stable regression runs.
  --mc-version 1.21          Target Minecraft Java version.
  --out <dir>                Evaluation output root.
  --limit <n>                Run the first n prompts.
  --strict                   Exit non-zero if any generation fails.
`);
}

main().catch((error) => {
  console.error(error.message);
  if (process.env.DEBUG) console.error(error);
  process.exit(1);
});
