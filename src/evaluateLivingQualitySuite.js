#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runConstructionWorkflow, formatLlmUsage } from './construction/workflow.js';
import { ConstructionEvaluationAgent, evaluationCriteria } from './construction/agents/constructionEvaluationAgent.js';
import { HABITATION_EVALUATION_PROMPTS } from './construction/habitationPromptSuite.js';
import { createTimestamp, ensureDir, writeJson } from './lib/fs.js';
import { loadEnvFile } from './lib/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  loadEnvFile(path.join(projectRoot, '.env'));
  const options = parseArgs(process.argv.slice(2));
  const suite = HABITATION_EVALUATION_PROMPTS.slice(0, options.limit);
  const root = path.resolve(options.out || path.join(projectRoot, 'out', `living-quality-evaluation-${createTimestamp()}`));
  const runsDir = path.join(root, 'runs');
  await ensureDir(runsDir);

  const jobs = [];
  const results = [];
  for (let index = 0; index < suite.length; index += 1) {
    for (const mode of options.modes) {
      const item = suite[index];
      const runDir = path.join(runsDir, mode, `${String(index + 1).padStart(3, '0')}-${item.id}`);
      jobs.push({ mode, index, item, runDir });
    }
  }

  console.log(`Living quality evaluation: ${suite.length} prompts x ${options.modes.length} modes = ${jobs.length} runs`);
  console.log(`Modes: ${options.modes.join(', ')} | concurrency=${options.concurrency} | output=${root}`);

  const pending = [...jobs];
  let completed = 0;
  const workers = Array.from({ length: options.concurrency }, (_, workerIndex) => worker(workerIndex + 1));
  await Promise.all(workers);

  const summary = summarizeSuite(results, root, options);
  await writeOutputs(root, summary);
  console.log('');
  console.log(renderConsoleTable(summary.results));
  console.log('');
  console.log(`Living quality suite complete: ${summary.passCount}/${summary.totalRuns} generated successfully`);
  console.log(`Average scorecard: ${summary.averageScorecard}/100`);
  console.log(`Average habitation: ${summary.habitationAveragePercent}%`);
  console.log(`Average decoration: ${summary.decorationAveragePercent}%`);
  console.log(`Report: ${path.join(root, 'living_quality_report.md')}`);
  console.log(`JSON: ${path.join(root, 'living_quality_summary.json')}`);
  console.log(`CSV: ${path.join(root, 'living_quality_table.csv')}`);

  if (options.strict && (summary.passCount !== summary.totalRuns || summary.redFlagCount > 0)) process.exit(1);

  async function worker(workerId) {
    const evaluator = new ConstructionEvaluationAgent();
    while (pending.length) {
      const job = pending.shift();
      const label = `[${++completed}/${jobs.length}] ${job.mode} ${job.item.id}`;
      try {
        const cached = options.resume ? await readCachedResult(job) : undefined;
        if (cached) {
          results.push(cached);
          console.log(`${label}  CACHED | ${cached.grade || cached.scorecard?.grade || 'OK'} ${cached.scorecard?.totalScore ?? cached.percent ?? 0}`);
          continue;
        }

        console.log(`${label}  worker=${workerId}`);
        const result = await runConstructionWorkflow({
          prompt: job.item.prompt,
          mode: job.mode,
          mcVersion: options.mcVersion,
          outputDir: job.runDir,
          seed: job.item.seed,
          seedSource: `living-quality-${job.mode}-suite`,
          cwd: projectRoot
        });
        const evaluation = evaluator.run(result);
        const compact = compactResult({ job, result, evaluation, ok: true });
        results.push(compact);
        await writeJson(resultPath(job), compact);
        await writeOutputs(root, summarizeSuite(results, root, options));
        console.log(`  ${job.mode} ${evaluation.scorecard?.grade || evaluation.grade} ${evaluation.scorecard?.totalScore ?? evaluation.percent}/100 | H=${categoryPercent(evaluation, 'Habitation')}% D=${categoryPercent(evaluation, 'Decoration')}% | entry=${evaluation.metrics.entrySide} reach=${evaluation.metrics.reachableRooms}/${evaluation.metrics.rooms} shell=${evaluation.metrics.boundaryCoverage}/${evaluation.metrics.roofCoverage}/${evaluation.metrics.floorCoverage} | decorFit=${evaluation.metrics.decorationRoleFit}% | LLM=${formatLlmUsage(result.llmUsage)}`);
      } catch (error) {
        const compact = compactResult({ job, error, evaluation: failedEvaluation(job.item, error), ok: false });
        results.push(compact);
        await ensureDir(job.runDir);
        await writeJson(resultPath(job), compact);
        await writeOutputs(root, summarizeSuite(results, root, options));
        console.log(`  ${job.mode} FAILED | ${error.message}`);
      }
    }
  }
}

function parseArgs(argv) {
  const options = {
    modes: ['auto', 'llm'],
    mcVersion: '1.21',
    out: undefined,
    limit: HABITATION_EVALUATION_PROMPTS.length,
    concurrency: 2,
    resume: true,
    strict: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--modes') {
      options.modes = parseModes(argv[++index]);
    } else if (arg === '--mode') {
      options.modes = parseModes(argv[++index]);
    } else if (arg === '--mc-version') {
      options.mcVersion = argv[++index] || options.mcVersion;
    } else if (arg === '--out') {
      options.out = argv[++index];
    } else if (arg === '--limit') {
      options.limit = Math.max(1, Math.min(HABITATION_EVALUATION_PROMPTS.length, Number(argv[++index]) || options.limit));
    } else if (arg === '--concurrency') {
      options.concurrency = Math.max(1, Math.min(8, Number(argv[++index]) || options.concurrency));
    } else if (arg === '--no-resume') {
      options.resume = false;
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function parseModes(value) {
  const modes = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const allowed = new Set(['mock', 'auto', 'llm']);
  const normalized = modes.filter((mode) => allowed.has(mode));
  return normalized.length ? [...new Set(normalized)] : ['auto', 'llm'];
}

async function readCachedResult(job) {
  try {
    const text = await fs.readFile(resultPath(job), 'utf8');
    const parsed = JSON.parse(text);
    return parsed && parsed.id && parsed.mode ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function resultPath(job) {
  return path.join(job.runDir, 'living_quality_result.json');
}

async function writeOutputs(root, summary) {
  await ensureDir(root);
  await writeJson(path.join(root, 'living_quality_summary.json'), summary);
  await fs.writeFile(path.join(root, 'living_quality_report.md'), renderMarkdownReport(summary), 'utf8');
  await fs.writeFile(path.join(root, 'living_quality_table.csv'), renderCsv(summary), 'utf8');
}

function summarizeSuite(results, root, options) {
  const successful = results.filter((item) => item.ok);
  const byMode = {};
  for (const mode of options.modes) {
    const modeResults = results.filter((item) => item.mode === mode);
    byMode[mode] = summarizeMode(modeResults);
  }
  const redFlagCount = results.reduce((sum, item) => sum + (item.redFlags || []).length, 0);
  const weakCheckCounts = summarizeWeakChecks(results);
  return {
    source: 'local-living-quality-dual-mode-evaluator',
    generatedAt: new Date().toISOString(),
    root,
    options,
    promptCount: options.limit,
    modes: options.modes,
    totalRuns: results.length,
    expectedRuns: options.limit * options.modes.length,
    passCount: successful.length,
    failCount: results.length - successful.length,
    redFlagCount,
    averageScorecard: average(results.map((item) => item.scorecard?.totalScore ?? item.percent ?? 0)),
    habitationAveragePercent: average(results.map((item) => item.habitationPercent || 0)),
    decorationAveragePercent: average(results.map((item) => item.decorationPercent || 0)),
    habitationCriteria: evaluationCriteria().filter((item) => item.category === 'Habitation'),
    decorationCriteria: decorationReasonabilityCriteria(),
    weakCheckCounts,
    byMode,
    results: results.sort((a, b) => a.mode.localeCompare(b.mode) || a.index - b.index)
  };
}

function summarizeMode(results) {
  return {
    runs: results.length,
    passCount: results.filter((item) => item.ok).length,
    failCount: results.filter((item) => !item.ok).length,
    redFlagCount: results.reduce((sum, item) => sum + (item.redFlags || []).length, 0),
    averageScorecard: average(results.map((item) => item.scorecard?.totalScore ?? item.percent ?? 0)),
    habitationAveragePercent: average(results.map((item) => item.habitationPercent || 0)),
    decorationAveragePercent: average(results.map((item) => item.decorationPercent || 0))
  };
}

function summarizeWeakChecks(results) {
  const counts = {};
  for (const result of results) {
    for (const check of result.weakChecks || []) {
      counts[check.id] ||= {
        id: check.id,
        category: check.category,
        label: check.label,
        count: 0,
        modes: {}
      };
      counts[check.id].count += 1;
      counts[check.id].modes[result.mode] = (counts[check.id].modes[result.mode] || 0) + 1;
    }
  }
  return Object.values(counts).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

function compactResult({ job, result, evaluation, error, ok }) {
  const metrics = evaluation.metrics || {};
  return {
    mode: job.mode,
    index: job.index,
    id: job.item.id,
    focus: job.item.focus,
    seed: job.item.seed,
    ok,
    prompt: job.item.prompt,
    outputDir: job.runDir,
    error: error?.message,
    artifacts: result?.artifacts,
    llmProvider: result?.llmProvider,
    llmUsage: result?.llmUsage,
    score: evaluation.score,
    maxScore: evaluation.maxScore,
    percent: evaluation.percent,
    grade: evaluation.grade,
    scorecard: evaluation.scorecard,
    habitationPercent: categoryPercent(evaluation, 'Habitation'),
    decorationPercent: categoryPercent(evaluation, 'Decoration'),
    living: livingMetrics(metrics),
    decoration: decorationMetrics(metrics),
    metrics,
    redFlags: evaluation.redFlags || [],
    weakChecks: evaluation.weakChecks || [],
    warnings: result?.validation?.warnings || []
  };
}

function livingMetrics(metrics) {
  return {
    entrySide: metrics.entrySide,
    reachableRooms: metrics.reachableRooms,
    rooms: metrics.rooms,
    unreachableRooms: metrics.unreachableRooms,
    failedEdges: metrics.failedEdges,
    entryApproachCoverage: metrics.entryApproachCoverage,
    boundaryCoverage: metrics.boundaryCoverage,
    roofCoverage: metrics.roofCoverage,
    floorCoverage: metrics.floorCoverage,
    bedroomCount: metrics.bedroomCount,
    bathroomCount: metrics.bathroomCount,
    kitchenCount: metrics.kitchenCount,
    storageCount: metrics.storageCount,
    minCoreRoomArea: metrics.minCoreRoomArea,
    averageRoomArea: metrics.averageRoomArea
  };
}

function decorationMetrics(metrics) {
  return {
    decorPlacements: metrics.decorPlacements,
    uniqueDecorBlocks: metrics.uniqueDecorBlocks,
    vibrantPlacements: metrics.vibrantPlacements,
    decorationHabitableCoverage: metrics.decorationHabitableCoverage,
    decorationAveragePlacementsPerRoom: metrics.decorationAveragePlacementsPerRoom,
    decorationAverageDensity: metrics.decorationAverageDensity,
    decorationMaxDensity: metrics.decorationMaxDensity,
    decorationDominantBlockShare: metrics.decorationDominantBlockShare,
    decorationVibrantRooms: metrics.decorationVibrantRooms,
    decorationRoleFit: metrics.decorationRoleFit,
    decorationModuleCount: metrics.decorationModuleCount,
    decorationCirculationShare: metrics.decorationCirculationShare,
    decorationAnchoredPlacements: metrics.decorationAnchoredPlacements,
    decorationStyleAnchored: metrics.decorationStyleAnchored
  };
}

function decorationReasonabilityCriteria() {
  return evaluationCriteria()
    .filter((item) => item.category === 'Decoration')
    .map((item, index) => ({
      index: index + 1,
      id: item.id,
      weight: item.weight,
      label: item.label
    }));
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
    scorecard: {
      totalScore: 0,
      baseScore: 0,
      advancedScore: 0,
      grade: 'D',
      dimensions: []
    },
    redFlags: [{ id: 'workflow.failed', category: 'Failure', label: error.message, weight: 5 }],
    weakChecks: [{ id: 'workflow.failed', category: 'Failure', label: error.message, weight: 5 }],
    strengths: [],
    metrics: {},
    checks: []
  };
}

function renderMarkdownReport(summary) {
  const modeRows = Object.entries(summary.byMode).map(([mode, item]) => {
    return `| ${mode} | ${item.runs} | ${item.passCount} | ${item.failCount} | ${item.averageScorecard}/100 | ${item.habitationAveragePercent}% | ${item.decorationAveragePercent}% | ${item.redFlagCount} |`;
  }).join('\n');
  const resultRows = summary.results.map((item, index) => livingQualityRow(item, index)).join('\n');
  const habitationRows = summary.habitationCriteria.map((item) => `| ${item.id} | ${item.weight} | ${item.label} |`).join('\n');
  const decorationRows = summary.decorationCriteria.map((item) => `| ${item.index} | ${item.id} | ${item.weight} | ${item.label} |`).join('\n');
  const weakRows = summary.weakCheckCounts.length
    ? summary.weakCheckCounts.map((item) => `| ${item.id} | ${item.category} | ${item.count} | ${modeBreakdown(item.modes)} | ${item.label} |`).join('\n')
    : '| - | - | 0 | - | 无 |';
  const redFlags = summary.results
    .filter((item) => !item.ok || item.redFlags.length)
    .map((item) => {
      const flags = item.redFlags.length
        ? item.redFlags.map((flag) => `  - ${flag.id}: ${flag.label} (${flag.value ?? 'no value'})`).join('\n')
        : `  - ${item.error || 'unknown failure'}`;
      return `- ${item.mode}/${item.id}\n${flags}`;
    }).join('\n') || '- 无';
  const detailRows = summary.results.map((item) => {
    const weak = item.weakChecks.length
      ? item.weakChecks.slice(0, 10).map((check) => `${check.id}=${check.value ?? ''}`).join('<br>')
      : '无';
    return `| ${item.mode} | ${item.id} | ${item.prompt} | ${formatLlmUsage(item.llmUsage)} | ${weak} | ${item.outputDir || '-'} |`;
  }).join('\n');

  return `# Living Quality Dual-Mode Evaluation

## Summary

- Prompt count: ${summary.promptCount}
- Modes: ${summary.modes.join(', ')}
- Completed runs: ${summary.totalRuns}/${summary.expectedRuns}
- Successful generations: ${summary.passCount}
- Failed generations: ${summary.failCount}
- Red flags: ${summary.redFlagCount}
- Average scorecard: ${summary.averageScorecard}/100
- Average habitation score: ${summary.habitationAveragePercent}%
- Average decoration score: ${summary.decorationAveragePercent}%
- Minecraft target: ${summary.options.mcVersion}
- Output root: ${summary.root}

## Mode Summary

| Mode | Runs | Pass | Fail | Scorecard | Habitation | Decoration | Red Flags |
|---|---:|---:|---:|---:|---:|---:|---:|
${modeRows}

## Detailed Output Table

| # | Mode | Prompt ID | Grade | Scorecard | Base | Advanced | Habitation | Decoration | Entry | Reach | Approach | Shell B/R/F | Bed/Bath/Kitchen | Min Area | Decor | Unique | Coverage | Density | Fit | Circulation | Style | Weak |
|---:|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
${resultRows}

## Habitation Criteria

| Check | Weight | Label |
|---|---:|---|
${habitationRows}

## Decoration Reasonability Criteria

| # | Check | Weight | Label |
|---:|---|---:|---|
${decorationRows}

## Frequent Weak Checks

| Check | Category | Count | Modes | Label |
|---|---|---:|---|---|
${weakRows}

## Red Flags

${redFlags}

## Prompt Diagnostics

| Mode | Prompt ID | Prompt | LLM Usage | Weak Checks | Output Dir |
|---|---|---|---|---|---|
${detailRows}
`;
}

function livingQualityRow(item, index) {
  const living = item.living || {};
  const decoration = item.decoration || {};
  const reach = living.rooms ? `${living.reachableRooms}/${living.rooms}` : '-';
  const shell = `${living.boundaryCoverage ?? '-'}/${living.roofCoverage ?? '-'}/${living.floorCoverage ?? '-'}`;
  const program = `${living.bedroomCount ?? '-'}/${living.bathroomCount ?? '-'}/${living.kitchenCount ?? '-'}`;
  const scorecard = item.scorecard || {};
  return `| ${index + 1} | ${item.mode} | ${item.id} | ${item.ok ? scorecard.grade || item.grade : 'FAIL'} | ${scorecard.totalScore ?? item.percent ?? 0} | ${scorecard.baseScore ?? '-'} | ${scorecard.advancedScore ?? '-'} | ${item.habitationPercent ?? 0}% | ${item.decorationPercent ?? 0}% | ${living.entrySide || '-'} | ${reach} | ${living.entryApproachCoverage ?? '-'}% | ${shell} | ${program} | ${living.minCoreRoomArea ?? '-'} | ${decoration.decorPlacements ?? '-'} | ${decoration.uniqueDecorBlocks ?? '-'} | ${decoration.decorationHabitableCoverage ?? '-'}% | ${decoration.decorationAverageDensity ?? '-'} | ${decoration.decorationRoleFit ?? '-'}% | ${decoration.decorationCirculationShare ?? '-'}% | ${decoration.decorationStyleAnchored === undefined ? '-' : decoration.decorationStyleAnchored} | ${(item.weakChecks || []).length} |`;
}

function renderConsoleTable(results) {
  const lines = [
    '| # | mode | id | grade | score | H | D | reach | entry | approach | shell(B/R/F) | bed/bath/kit | decor fit/circ | weak |',
    '|---:|---|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|'
  ];
  for (let index = 0; index < results.length; index += 1) {
    const item = results[index];
    const living = item.living || {};
    const decoration = item.decoration || {};
    const reach = living.rooms ? `${living.reachableRooms}/${living.rooms}` : '-';
    const shell = `${living.boundaryCoverage ?? '-'}/${living.roofCoverage ?? '-'}/${living.floorCoverage ?? '-'}`;
    const program = `${living.bedroomCount ?? '-'}/${living.bathroomCount ?? '-'}/${living.kitchenCount ?? '-'}`;
    const decor = `${decoration.decorationRoleFit ?? '-'}/${decoration.decorationCirculationShare ?? '-'}`;
    lines.push(`| ${index + 1} | ${item.mode} | ${item.id} | ${item.ok ? item.scorecard?.grade || item.grade : 'FAIL'} | ${item.scorecard?.totalScore ?? item.percent ?? 0} | ${item.habitationPercent ?? 0}% | ${item.decorationPercent ?? 0}% | ${reach} | ${living.entrySide || '-'} | ${living.entryApproachCoverage ?? '-'}% | ${shell} | ${program} | ${decor} | ${(item.weakChecks || []).length} |`);
  }
  return lines.join('\n');
}

function renderCsv(summary) {
  const headers = [
    'mode',
    'index',
    'id',
    'grade',
    'scorecard_total',
    'base_score',
    'advanced_score',
    'habitation_percent',
    'decoration_percent',
    'entry_side',
    'reachable_rooms',
    'rooms',
    'unreachable_rooms',
    'failed_edges',
    'entry_approach_percent',
    'boundary_percent',
    'roof_percent',
    'floor_percent',
    'bedrooms',
    'bathrooms',
    'kitchens',
    'storage_rooms',
    'min_core_room_area',
    'decor_placements',
    'unique_decor_blocks',
    'vibrant_placements',
    'decor_habitable_coverage',
    'decor_average_placements_per_room',
    'decor_average_density',
    'decor_max_density',
    'decor_dominant_block_share',
    'decor_vibrant_rooms',
    'decor_role_fit',
    'decor_module_count',
    'decor_circulation_share',
    'decor_anchored_percent',
    'decor_style_anchored',
    'llm_provider',
    'llm_usage_status',
    'red_flags',
    'weak_checks',
    'prompt',
    'output_dir'
  ];
  const rows = summary.results.map((item) => {
    const living = item.living || {};
    const decoration = item.decoration || {};
    const scorecard = item.scorecard || {};
    return [
      item.mode,
      item.index + 1,
      item.id,
      item.ok ? scorecard.grade || item.grade : 'FAIL',
      scorecard.totalScore ?? item.percent ?? 0,
      scorecard.baseScore ?? '',
      scorecard.advancedScore ?? '',
      item.habitationPercent ?? 0,
      item.decorationPercent ?? 0,
      living.entrySide || '',
      living.reachableRooms ?? '',
      living.rooms ?? '',
      living.unreachableRooms ?? '',
      living.failedEdges ?? '',
      living.entryApproachCoverage ?? '',
      living.boundaryCoverage ?? '',
      living.roofCoverage ?? '',
      living.floorCoverage ?? '',
      living.bedroomCount ?? '',
      living.bathroomCount ?? '',
      living.kitchenCount ?? '',
      living.storageCount ?? '',
      living.minCoreRoomArea ?? '',
      decoration.decorPlacements ?? '',
      decoration.uniqueDecorBlocks ?? '',
      decoration.vibrantPlacements ?? '',
      decoration.decorationHabitableCoverage ?? '',
      decoration.decorationAveragePlacementsPerRoom ?? '',
      decoration.decorationAverageDensity ?? '',
      decoration.decorationMaxDensity ?? '',
      decoration.decorationDominantBlockShare ?? '',
      decoration.decorationVibrantRooms ?? '',
      decoration.decorationRoleFit ?? '',
      decoration.decorationModuleCount ?? '',
      decoration.decorationCirculationShare ?? '',
      decoration.decorationAnchoredPlacements ?? '',
      decoration.decorationStyleAnchored ?? '',
      item.llmProvider || '',
      item.llmUsage?.status || '',
      item.redFlags.map((flag) => flag.id).join(';'),
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
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length);
}

function modeBreakdown(modes = {}) {
  return Object.entries(modes).map(([mode, count]) => `${mode}:${count}`).join(', ');
}

function printHelp() {
  console.log(`Evaluate 100 habitation prompts with habitation and decoration reasonability checks across multiple modes.

Usage:
  node src/evaluateLivingQualitySuite.js
  node src/evaluateLivingQualitySuite.js --modes auto,llm --concurrency 2 --out .tmp/living-quality
  node src/evaluateLivingQualitySuite.js --modes mock --limit 10

Options:
  --modes auto,llm          Comma-separated modes. Defaults to auto,llm.
  --mode auto              Alias for --modes.
  --mc-version 1.21        Target Minecraft Java version.
  --out <dir>              Evaluation output root.
  --limit <n>              Run the first n prompts from the 100 prompt suite.
  --concurrency <n>        Parallel runs, 1-8. Defaults to 2.
  --no-resume              Ignore cached per-run living_quality_result.json files.
  --strict                 Exit non-zero if failures or red flags remain.
`);
}

main().catch((error) => {
  console.error(error.message);
  if (process.env.DEBUG) console.error(error);
  process.exit(1);
});
