#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './lib/env.js';
import { runPipeline } from './pipeline.js';
import { launchConfiguredMinecraft } from './lib/launcher.js';
import { listWorlds } from './lib/minecraftWorlds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const options = {
    mode: 'auto',
    mcVersion: process.env.MC_VERSION || '1.21',
    out: path.join(projectRoot, 'out'),
    seed: undefined,
    minecraftDir: process.env.MINECRAFT_DIR,
    world: undefined,
    autoBuild: false,
    launch: false,
    launchCommand: process.env.MINECRAFT_LAUNCH_COMMAND,
    listWorlds: false
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
    } else if (arg === '--minecraft-dir') {
      options.minecraftDir = path.resolve(argv[++i] || '');
    } else if (arg === '--world') {
      options.world = argv[++i];
    } else if (arg === '--auto-build') {
      options.autoBuild = true;
    } else if (arg === '--launch') {
      options.launch = true;
    } else if (arg === '--launch-command') {
      options.launchCommand = argv[++i] || options.launchCommand;
    } else if (arg === '--list-worlds') {
      options.listWorlds = true;
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
  npm start -- --world "DemoWorld" --auto-build --launch "建一个欧式大房子"
  npm start -- --list-worlds

Options:
  --mode mock|llm|auto       Use rule fallback, force LLM, or auto-detect API config.
  --mc-version 1.21          Target Minecraft Java version. v1 exports 1.21 datapacks.
  --out <dir>                Output root directory. Defaults to ./out.
  --seed <number>            Optional deterministic seed for design variation.
  --minecraft-dir <dir>      Minecraft Java directory. Defaults to MINECRAFT_DIR or %APPDATA%\\.minecraft.
  --world <name|latest|dir>  Install the datapack into this save after generation.
  --auto-build               Add load/tick functions so the datapack builds automatically on world load.
  --launch                   Open Minecraft or a launcher after generation with MINECRAFT_LAUNCH_COMMAND.
  --launch-command <command> Command used by --launch.
  --list-worlds              List detected local Minecraft save names.
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

  if (!prompt) {
    printHelp();
    process.exit(1);
  }

  const result = await runPipeline({
    prompt,
    mode: options.mode,
    mcVersion: options.mcVersion,
    outRoot: options.out,
    seed: options.seed,
    cwd: projectRoot,
    minecraftDir: options.minecraftDir,
    world: options.world,
    autoBuild: options.autoBuild
  });

  console.log('\n建筑智能体运行完成。');
  console.log(`输出目录: ${result.outputDir}`);
  console.log(`数据包: ${result.artifacts.datapackDir}`);
  if (result.artifacts.installedDatapackDir) {
    console.log(`已安装到世界: ${result.artifacts.installedDatapackDir}`);
  }
  console.log(`预览: ${result.artifacts.previewHtml}`);
  console.log(`报告: ${result.artifacts.report}`);
  if (options.autoBuild && result.artifacts.installedDatapackDir) {
    console.log('\n已启用自动建造：打开该世界后，数据包会在第一个玩家位置自动 clear + build。');
  } else {
    console.log('\nMinecraft 1.21 中执行: /reload -> /function architect:clear -> /function architect:build');
  }

  if (options.launch) {
    const launched = launchConfiguredMinecraft({ launchCommand: options.launchCommand });
    console.log(`已尝试打开 Minecraft/启动器: ${launched.command}`);
  }
}

main().catch((error) => {
  console.error('运行失败:', error.message);
  if (process.env.DEBUG) console.error(error);
  process.exit(1);
});
