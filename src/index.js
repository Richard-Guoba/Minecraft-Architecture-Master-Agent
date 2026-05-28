#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './lib/env.js';
import { runPipeline } from './pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const options = {
    mode: 'auto',
    mcVersion: process.env.MC_VERSION || '1.21',
    out: path.join(projectRoot, 'out'),
    seed: undefined
  };
  const promptParts = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--mode') {
      options.mode = argv[++i] || options.mode;
    } else if (arg === '--mc-version') {
      options.mcVersion = argv[++i] || options.mcVersion;
    } else if (arg === '--out') {
      options.out = path.resolve(argv[++i] || options.out);
    } else if (arg === '--seed') {
      const parsed = Number(argv[++i]);
      options.seed = Number.isFinite(parsed) ? parsed : undefined;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      promptParts.push(arg);
    }
  }

  return {
    prompt: promptParts.join(' ').trim(),
    options
  };
}

function printHelp() {
  console.log(`Minecraft Architect Agent

Usage:
  npm start -- "建一个欧式大房子"
  npm start -- --mode mock --mc-version 1.21 "建一个两层欧式大房子，带花园"

Options:
  --mode mock|llm|auto       Use rule fallback, force LLM, or auto-detect API config.
  --mc-version 1.21          Target Minecraft Java version. v1 exports 1.21 datapacks.
  --out <dir>                Output root directory. Defaults to ./out.
  --seed <number>            Optional deterministic seed for design variation.
`);
}

async function main() {
  loadEnvFile(path.join(projectRoot, '.env'));
  const { prompt, options } = parseArgs(process.argv.slice(2));

  if (options.help || !prompt) {
    printHelp();
    process.exit(prompt ? 0 : 1);
  }

  const result = await runPipeline({
    prompt,
    mode: options.mode,
    mcVersion: options.mcVersion,
    outRoot: options.out,
    seed: options.seed,
    cwd: projectRoot
  });

  console.log('\n建筑智能体运行完成。');
  console.log(`输出目录: ${result.outputDir}`);
  console.log(`数据包: ${result.artifacts.datapackDir}`);
  console.log(`预览: ${result.artifacts.previewHtml}`);
  console.log(`报告: ${result.artifacts.report}`);
  console.log('\nMinecraft 1.21 中执行: /reload -> /function architect:clear -> /function architect:build');
}

main().catch((error) => {
  console.error('运行失败:', error.message);
  if (process.env.DEBUG) console.error(error);
  process.exit(1);
});
