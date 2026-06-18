#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runConstructionWorkflow } from './construction/workflow.js';
import { DesignVariationEvaluationAgent } from './construction/agents/designVariationEvaluationAgent.js';
import { createTimestamp, ensureDir, writeJson } from './lib/fs.js';
import { loadEnvFile } from './lib/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const DEFAULT_PROMPT = '建一个现代两层大房子，宽31深19，大玻璃窗，开放厨房，客厅，餐厅，三间卧室，书房，阳光房，门在南侧，内饰缤纷。';
const DEFAULT_SEEDS = [101, 102, 103, 104, 105, 106];

async function main() {
  loadEnvFile(path.join(projectRoot, '.env'));
  const options = parseArgs(process.argv.slice(2));
  const root = path.resolve(options.out || path.join(projectRoot, 'out', `design-variation-${createTimestamp()}`));
  const runsDir = path.join(root, 'runs');
  await ensureDir(runsDir);

  const results = [];
  for (let index = 0; index < options.seeds.length; index += 1) {
    const seed = options.seeds[index];
    const runDir = path.join(runsDir, `${String(index + 1).padStart(2, '0')}-seed-${seed}`);
    console.log(`[${index + 1}/${options.seeds.length}] seed=${seed}`);
    const result = await runConstructionWorkflow({
      prompt: options.prompt,
      mode: options.mode,
      mcVersion: options.mcVersion,
      outputDir: runDir,
      seed,
      seedSource: 'design-variation-suite',
      cwd: projectRoot
    });
    results.push(result);
    console.log(`  ${result.creativeDesign.signature} | rooms=${result.layout?.rooms?.length || result.blueprint.layout.rooms.length} ops=${result.blueprint.operations.length}`);
  }

  const evaluation = new DesignVariationEvaluationAgent().run(results, { prompt: options.prompt, target: options.target });
  await writeJson(path.join(root, 'design_variation_summary.json'), evaluation);
  await fs.writeFile(path.join(root, 'design_variation_report.md'), renderReport(evaluation, options), 'utf8');

  console.log('');
  console.log(`Design variation score: ${evaluation.score}/100 (${evaluation.pass ? 'PASS' : 'FAIL'})`);
  console.log(`Design authority: ${evaluation.authorityShare}% | fixed algorithm estimate: ${evaluation.fixedAlgorithmShareEstimate}%`);
  for (const item of evaluation.scorecard) console.log(`- ${item.label}: ${item.variationPercent}% (${item.score}/${item.maxPoints})`);
  console.log(`Report: ${path.join(root, 'design_variation_report.md')}`);
  console.log(`JSON: ${path.join(root, 'design_variation_summary.json')}`);

  if (options.strict && !evaluation.pass) process.exit(1);
}

function parseArgs(argv) {
  const options = {
    mode: 'mock',
    mcVersion: '1.21',
    out: undefined,
    prompt: '',
    seeds: DEFAULT_SEEDS,
    target: 70,
    strict: false
  };
  const promptParts = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') {
      options.mode = argv[++index] || options.mode;
    } else if (arg === '--mc-version') {
      options.mcVersion = argv[++index] || options.mcVersion;
    } else if (arg === '--out') {
      options.out = argv[++index];
    } else if (arg === '--seeds') {
      options.seeds = String(argv[++index] || '').split(',').map((item) => Number(item.trim())).filter(Number.isFinite);
    } else if (arg === '--target') {
      options.target = Number(argv[++index]) || options.target;
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      promptParts.push(arg);
    }
  }

  options.prompt = promptParts.join(' ').trim() || DEFAULT_PROMPT;
  if (!options.seeds.length) options.seeds = DEFAULT_SEEDS;
  return options;
}

function renderReport(evaluation, options) {
  return `# 同 Prompt 设计变化评估

Prompt:

${options.prompt}

- 样本数：${evaluation.sampleCount}
- Seeds：${options.seeds.join(', ')}
- 目标：${evaluation.target}/100
- 变化分：${evaluation.score}/100
- 设计选择权：${evaluation.authorityShare}%
- 固定算法估算占比：${evaluation.fixedAlgorithmShareEstimate}%
- 结果：${evaluation.pass ? '通过' : '未通过'}

## 评分表

| 维度 | 变化率 | 得分 |
| --- | ---: | ---: |
${evaluation.scorecard.map((item) => `| ${item.label} | ${item.variationPercent}% | ${item.score}/${item.maxPoints} |`).join('\n')}

## 建议

${evaluation.recommendations.map((item) => `- ${item}`).join('\n')}
`;
}

function printHelp() {
  console.log(`Usage:
  npm run evaluate:variation -- "建一个现代两层住宅，宽31深19..."
  npm run evaluate:variation -- --mode mock --seeds 101,102,103,104,105,106 --strict "prompt"

Options:
  --mode mock|llm|auto
  --mc-version 1.21
  --out <dir>
  --seeds <a,b,c>
  --target <number>
  --strict
`);
}

main().catch((error) => {
  console.error('Design variation evaluation failed:', error.message);
  if (process.env.DEBUG) console.error(error);
  process.exit(1);
});
