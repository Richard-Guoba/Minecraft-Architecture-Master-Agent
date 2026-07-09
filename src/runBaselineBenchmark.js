#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBenchmarkSuite } from './construction/benchmarkRunner.js';
import { BASELINE_BENCHMARK_PROMPTS } from './construction/baselineBenchmarkSuite.js';
import { loadEnvFile } from './lib/env.js';
import { createTimestamp } from './lib/fs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  loadEnvFile(path.join(projectRoot, '.env'));
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const root = path.resolve(options.out || path.join(projectRoot, 'out', `baseline-benchmark-${createTimestamp()}`));
  const summary = await runBenchmarkSuite({
    suite: BASELINE_BENCHMARK_PROMPTS,
    root,
    mode: options.mode,
    mcVersion: options.mcVersion,
    limit: options.limit,
    strict: options.strict,
    minAverage: options.minAverage,
    cwd: projectRoot
  });

  console.log('');
  console.log(renderConsoleTable(summary.results));
  console.log('');
  console.log(`Baseline benchmark complete: ${summary.passCount}/${summary.total} generated successfully`);
  console.log(`Average scorecard: ${summary.averageScorecard}/100 (base ${summary.averageBaseScore}/60, advanced ${summary.averageAdvancedScore}/40)`);
  console.log(`Red flags: ${summary.redFlagCount}`);
  console.log(`Gallery: ${summary.artifacts.galleryHtml}`);
  console.log(`Report: ${summary.artifacts.reportMd}`);
  console.log(`JSON: ${summary.artifacts.summaryJson}`);
  console.log(`CSV: ${summary.artifacts.tableCsv}`);
  console.log(`Human feedback: ${summary.artifacts.feedbackTemplate}`);
}

function parseArgs(argv) {
  const options = {
    mode: 'mock',
    mcVersion: '1.21',
    out: undefined,
    limit: BASELINE_BENCHMARK_PROMPTS.length,
    strict: false,
    minAverage: 82,
    help: false
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
      options.limit = Math.max(1, Math.min(BASELINE_BENCHMARK_PROMPTS.length, Number(argv[++index]) || options.limit));
    } else if (arg === '--min-average') {
      options.minAverage = Number(argv[++index]) || options.minAverage;
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
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

function printHelp() {
  console.log(`Run the fixed Architecture Master Stage 0 baseline benchmark.

Usage:
  npm run benchmark:baseline
  npm run benchmark:baseline -- --limit 3 --out out/baseline-smoke
  npm run benchmark:baseline -- --strict --min-average 82

Options:
  --mode mock|auto|llm       Generation mode. Defaults to mock for reproducible local runs.
  --mc-version 1.21          Target Minecraft Java version.
  --out <dir>                Benchmark output root.
  --limit <n>                Run the first n fixed baseline prompts.
  --min-average <n>          Strict-mode minimum average scorecard. Defaults to 82.
  --strict                   Exit non-zero if generation fails, red flags remain, or average is too low.
`);
}

main().catch((error) => {
  console.error(error.message);
  if (process.env.DEBUG) console.error(error);
  process.exit(1);
});
