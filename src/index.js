#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './lib/env.js';
import { runPipeline } from './pipeline.js';
import { launchConfiguredMinecraft } from './lib/launcher.js';
import { listWorlds } from './lib/minecraftWorlds.js';
import { formatLlmUsage } from './construction/workflow.js';
import { listCuratedTemplatePrompts, resolveCuratedTemplatePrompt } from './construction/curatedTemplatePromptLibrary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const DATAPACK_TARGETS = {
  'build-lab': 'D:\\Program Files\\minecraft\\自然之旅\\自然之旅3-1.20.1 [v1.6X]\\.minecraft\\saves\\建造实验v1\\datapacks'
};

function parseArgs(argv) {
  const options = {
    mode: 'mock',
    mcVersion: process.env.MC_VERSION || '1.21',
    out: path.join(projectRoot, 'out'),
    seed: undefined,
    candidates: 1,
    candidateRounds: 1,
    candidateTargetScore: 95,
    candidateForceRounds: false,
    concepts: 0,
    conceptStrategy: 'select',
    critics: true,
    neuralRetrieval: false,
    coarseVoxelMode: 'off',
    coarseVoxelProvider: 'baseline',
    coarseVoxelPlan: undefined,
    minecraftDir: process.env.MINECRAFT_DIR,
    world: undefined,
    datapacksDir: process.env.ARCHITECT_DATAPACKS_DIR || resolveDatapacksTarget(process.env.ARCHITECT_DATAPACKS_TARGET),
    autoBuild: false,
    launch: false,
    launchCommand: process.env.MINECRAFT_LAUNCH_COMMAND,
    listWorlds: false,
    listPrompts: false,
    promptId: undefined
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
      const rawSeed = argv[++i];
      const parsed = Number(rawSeed);
      if (!Number.isFinite(parsed)) throw new Error(`无效 seed: ${rawSeed}`);
      options.seed = Math.trunc(parsed);
    } else if (arg === '--candidates') {
      const parsed = Number(argv[++i]);
      if (!Number.isFinite(parsed) || parsed < 1) throw new Error(`无效候选数量: ${parsed}`);
      options.candidates = Math.trunc(parsed);
    } else if (arg === '--auto-select') {
      options.candidates = Math.max(options.candidates, 3);
    } else if (arg === '--candidate-rounds') {
      const parsed = Number(argv[++i]);
      if (!Number.isFinite(parsed) || parsed < 1) throw new Error(`无效候选轮数: ${parsed}`);
      options.candidateRounds = Math.trunc(parsed);
    } else if (arg === '--candidate-target-score') {
      const parsed = Number(argv[++i]);
      if (!Number.isFinite(parsed)) throw new Error(`无效候选目标分: ${parsed}`);
      options.candidateTargetScore = Math.trunc(parsed);
    } else if (arg === '--candidate-force-rounds') {
      options.candidateForceRounds = true;
    } else if (arg === '--concepts') {
      const parsed = Number(argv[++i]);
      if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`无效概念数量: ${parsed}`);
      options.concepts = Math.trunc(parsed);
    } else if (arg === '--concept-strategy') {
      const value = argv[++i] || 'select';
      if (!['select', 'fuse'].includes(value)) throw new Error(`无效概念策略: ${value}`);
      options.conceptStrategy = value;
    } else if (arg === '--no-critics') {
      options.critics = false;
    } else if (arg === '--neural-retrieval') {
      options.neuralRetrieval = true;
    } else if (arg === '--no-neural-retrieval') {
      options.neuralRetrieval = false;
    } else if (arg === '--coarse-voxel-mode') {
      const value = argv[++i];
      if (value === 'apply') throw new Error('Stage 7 apply mode is reserved for Stage 7 Milestone 4.');
      if (!['off', 'shadow'].includes(value)) throw new Error(`无效 Stage 7 coarse voxel mode: ${value}`);
      options.coarseVoxelMode = value;
    } else if (arg === '--coarse-voxel-provider') {
      const value = argv[++i];
      if (!['baseline', 'artifact'].includes(value)) throw new Error(`Invalid Stage 7 coarse voxel provider: ${value}`);
      options.coarseVoxelProvider = value;
    } else if (arg === '--coarse-voxel-plan') {
      const value = argv[++i];
      if (!value) throw new Error('--coarse-voxel-plan requires a path.');
      options.coarseVoxelPlan = path.resolve(value);
    } else if (arg === '--minecraft-dir') {
      options.minecraftDir = path.resolve(argv[++i] || '');
    } else if (arg === '--world') {
      options.world = argv[++i];
    } else if (arg === '--datapacks-dir') {
      options.datapacksDir = path.resolve(argv[++i] || '');
    } else if (arg === '--datapacks-target') {
      options.datapacksDir = resolveDatapacksTarget(argv[++i]);
    } else if (arg === '--auto-build') {
      options.autoBuild = true;
    } else if (arg === '--launch') {
      options.launch = true;
    } else if (arg === '--launch-command') {
      options.launchCommand = argv[++i] || options.launchCommand;
    } else if (arg === '--list-worlds') {
      options.listWorlds = true;
    } else if (arg === '--list-prompts') {
      options.listPrompts = true;
    } else if (arg === '--prompt-id') {
      options.promptId = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      promptParts.push(arg);
    }
  }

  validateCoarseVoxelOptions(options);
  return {
    prompt: promptParts.join(' ').trim(),
    options
  };
}

function validateCoarseVoxelOptions(options) {
  if (options.coarseVoxelMode === 'off' && (options.coarseVoxelProvider !== 'baseline' || options.coarseVoxelPlan)) throw new Error('Stage 7 provider options require shadow mode.');
  if (options.coarseVoxelMode === 'shadow' && options.coarseVoxelProvider === 'artifact' && !options.coarseVoxelPlan) throw new Error('Stage 7 artifact provider requires --coarse-voxel-plan.');
  if (options.coarseVoxelProvider === 'baseline' && options.coarseVoxelPlan) throw new Error('--coarse-voxel-plan is only valid with the artifact provider.');
  if (options.coarseVoxelMode === 'shadow' && options.coarseVoxelProvider === 'artifact' && (options.candidates > 1 || options.candidateRounds > 1)) throw new Error('Stage 7 M1 artifact provider supports exactly one candidate and one round because each plan is bound to one condition hash.');
}

function resolveDatapacksTarget(name) {
  if (!name) return undefined;
  const target = DATAPACK_TARGETS[name];
  if (!target) {
    const names = Object.keys(DATAPACK_TARGETS).join(', ') || '无';
    throw new Error(`未知 datapacks 快捷目标: ${name}。可用目标: ${names}`);
  }
  return target;
}

function printHelp() {
  console.log(`Minecraft Architect Agent (construction_method_v1)

Usage:
  npm start -- "建一个欧式大房子"
  npm start -- --mode mock --mc-version 1.21 "建一个两层欧式大房子，带花园"
  npm start -- --world "DemoWorld" --launch "建一个欧式大房子"
  npm start -- --datapacks-dir "D:\\path\\to\\world\\datapacks" "建一个欧式大房子"
  npm start -- --datapacks-target build-lab "建一个欧式大房子"
  npm start -- --list-worlds

Options:
  --mode mock|llm|auto       Use local mock mode, force your configured API, or auto-detect API config. Defaults to mock.
  --mc-version 1.21          Target Minecraft Java version. v1 exports 1.21 datapacks.
  --out <dir>                Output root directory. Defaults to ./out.
  --seed <number>            Deterministic design seed. Omit it to generate a random seed.
  --concepts <n>             Enable Stage 3 Concept Studio with 2-5 concepts before construction.
  --concept-strategy <mode>  select or fuse. Defaults to select.
  --no-critics               Disable Stage 4 Critic Council report and critic_council.json.
  --neural-retrieval        Opt into Stage 5 neural fusion retrieval when embedding artifacts are valid.
  --no-neural-retrieval     Keep Stage 5 retrieval disabled. This is the default MVP behavior.
  --coarse-voxel-mode off|shadow       Stage 7 mode. Defaults to off; shadow does not change primary geometry.
  --coarse-voxel-provider baseline|artifact  Select baseline or a canonical plan.
  --coarse-voxel-plan <path>           Canonical Stage 7 plan path required by the artifact provider.
  --candidates <n>           Generate n candidates and auto-select the strongest local result.
  --auto-select              Shortcut for --candidates 3.
  --candidate-rounds <n>     Run up to n reflection rounds. Defaults to 1.
  --candidate-target-score <n> Stop reflection rounds when the selected candidate reaches this score. Defaults to 95.
  --candidate-force-rounds   Run all requested reflection rounds even if target score is already reached.
  --minecraft-dir <dir>      Minecraft Java directory. Defaults to MINECRAFT_DIR or %APPDATA%\\.minecraft.
  --world <name|latest|dir>  Install the datapack into this save after generation.
  --datapacks-dir <dir>      Install directly into this world's datapacks directory. Can also use ARCHITECT_DATAPACKS_DIR.
  --datapacks-target <name>  Install into a named quick target. Available: ${Object.keys(DATAPACK_TARGETS).join(', ') || 'none'}.
  --auto-build               Deprecated compatibility flag. /reload only refreshes; use /function architect:run to build.
  --launch                   Open Minecraft or a launcher after generation with MINECRAFT_LAUNCH_COMMAND.
  --launch-command <command> Command used by --launch.
  --list-worlds              List detected local Minecraft save names.
  --list-prompts             List recommended prompt ids.
  --prompt-id <id>           Use a recommended prompt profile. Extra text after options is appended as user additions.

  Workflow:
  ArchitectAgent -> PlannerAgent -> CSGBuilder -> BSPPartitioner -> AStarPathfinder.
  construction_method_v1 is the only active generation pipeline.
  Stage 7 shadow supports deterministic baseline and validated artifact comparison.
  Runtime: Node.js.
  API: configure your own provider in .env and use --mode llm.
  Mock: use --mode mock when no API key is available.
`);
}

async function main() {
  loadEnvFile(path.join(projectRoot, '.env'));
  const { prompt, options } = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (options.listWorlds) {
    const worlds = await listWorlds(options.minecraftDir);
    if (!worlds.length) {
      console.log('没有在 Minecraft saves 目录中发现世界。');
    } else {
      console.log('检测到的 Minecraft 世界：');
      for (const world of worlds) {
        console.log(`- ${world.name} (${world.path})`);
      }
    }
    process.exit(0);
  }

  if (options.listPrompts) {
    printCuratedPromptList();
    process.exit(0);
  }

  let finalPrompt = prompt;
  let resolvedPromptProfile;
  if (options.promptId) {
    const resolved = resolveCuratedTemplatePrompt(options.promptId, prompt);
    finalPrompt = resolved.prompt;
    resolvedPromptProfile = resolved.profile;
    if (options.seed === undefined) options.seed = resolved.profile.seed;
  }

  if (!finalPrompt) {
    printHelp();
    process.exit(1);
  }

  const result = await runPipeline({
    prompt: finalPrompt,
    mode: options.mode,
    mcVersion: options.mcVersion,
    outRoot: options.out,
    seed: options.seed,
    candidates: options.candidates,
    candidateRounds: options.candidateRounds,
    candidateTargetScore: options.candidateTargetScore,
    candidateForceRounds: options.candidateForceRounds,
    concepts: options.concepts,
    conceptStrategy: options.conceptStrategy,
    critics: options.critics,
    neuralRetrieval: options.neuralRetrieval,
    coarseVoxelMode: options.coarseVoxelMode,
    coarseVoxelProvider: options.coarseVoxelProvider,
    coarseVoxelPlan: options.coarseVoxelPlan,
    cwd: projectRoot,
    minecraftDir: options.minecraftDir,
    world: options.world,
    datapacksDir: options.datapacksDir,
    autoBuild: options.autoBuild
  });

  console.log('\n建筑智能体运行完成。');
  console.log(`工作流: ${result.workflow}`);
  console.log(`Seed: ${result.seed} (${result.seedSource === 'random' ? '自动随机' : '手动指定'})`);
  if (resolvedPromptProfile) {
    console.log(`推荐提示词: ${resolvedPromptProfile.id} (${resolvedPromptProfile.title})`);
  }
  console.log(`LLM通道: ${result.llmProvider}`);
  console.log(`LLM调用: ${formatLlmUsage(result.llmUsage)}`);
  console.log(`输出目录: ${result.outputDir}`);
  if (result.candidateSelection) {
    console.log(`候选择优: ${result.candidateSelection.selected_candidate_id} / seed ${result.candidateSelection.selected_seed} / ${result.candidateSelection.selected_template_score}分`);
    console.log(`候选报告: ${result.artifacts.candidateSelectionReport}`);
    console.log(`选中输出: ${result.selectedOutputDir}`);
  }
  if (result.conceptStudio) {
    console.log(`Concept Studio: ${result.conceptStudio.selected_concept_id} / ${result.conceptStudio.concept_count} concepts / ${result.conceptStudio.strategy}`);
    console.log(`概念报告: ${result.artifacts.conceptStudioReport}`);
  }
  if (result.stage7) {
    console.log(`Stage 7 Shadow: ${result.stage7.status} / ${result.stage7.provider} / geometry unchanged`);
    console.log(`Stage 7 报告: ${result.artifacts.stage7Report}`);
    if (result.artifacts.stage7FailureCase) console.log(`Stage 7 失败案例: ${result.artifacts.stage7FailureCase}`);
  }
  if (result.criticCouncil) {
    console.log(`Critic Council: ${result.criticCouncil.readiness} / ${result.criticCouncil.overall_score}/100 / ${result.criticCouncil.warning_count} warnings`);
    console.log(`批评产物: ${result.artifacts.criticCouncil}`);
  }
  console.log(`数据包: ${result.artifacts.datapackDir}`);
  if (result.artifacts.installedDatapackDir) {
    console.log(`已安装到世界: ${result.artifacts.installedDatapackDir}`);
  }
  console.log(`预览: ${result.artifacts.previewHtml}`);
  console.log(`报告: ${result.artifacts.report}`);
  if (result.artifacts.installedDatapackDir) {
    console.log('\nMinecraft 1.21 中执行: /reload -> /function architect:run');
    console.log('/reload 只刷新数据包，不会建造。');
  } else {
    console.log('\n安装数据包后执行: /reload -> /function architect:run');
    console.log('/reload 只刷新数据包，不会建造。');
  }

  if (options.launch) {
    const launched = launchConfiguredMinecraft({ launchCommand: options.launchCommand });
    console.log(`已尝试打开 Minecraft/启动器: ${launched.command}`);
  }
}

function printCuratedPromptList() {
  console.log('可用推荐提示词：');
  for (const item of listCuratedTemplatePrompts()) {
    console.log(`- ${item.id} | ${item.style}/${item.typology} | seed ${item.seed} | ${item.title}`);
  }
}

main().catch((error) => {
  console.error('运行失败:', error.message);
  if (process.env.DEBUG) console.error(error);
  process.exit(1);
});
