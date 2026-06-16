import fs from 'node:fs/promises';
import path from 'node:path';
import { ConstructionArchitectAgent } from './agents/architectAgent.js';
import { ConstructionPlannerAgent } from './agents/plannerAgent.js';
import { ConstructionDecoratorAgent } from './agents/decoratorAgent.js';
import { CSGBuilder, computeBounds, parseKey } from './engine/csgBuilder.js';
import { BSPPartitioner } from './engine/bspPartitioner.js';
import { AStarPathfinder } from './engine/pathfinder.js';
import { createLlmClient } from '../llm/createLlmClient.js';
import { ensureDir, writeJson } from '../lib/fs.js';
import { resolveWorldDir } from '../lib/minecraftWorlds.js';
import { detectDoorSide, detectFloors, detectScale } from './agents/architectAgent.js';

const BLOCK_PATTERN = /^minecraft:[a-z0-9_]+(?:\[[a-z0-9_=,]+\])?$/;

export async function runConstructionWorkflow({
  prompt,
  mode = 'auto',
  mcVersion = '1.21',
  outputDir,
  seed,
  cwd = process.cwd(),
  minecraftDir,
  world,
  datapacksDir,
  autoBuild = false
}) {
  if (!prompt || !prompt.trim()) throw new Error('Prompt is required.');

  await ensureDir(outputDir);
  const llmClient = createLlmClient({ cwd });
  const llmProvider = mode === 'mock' ? 'disabled-by-mock-mode' : llmClient.name;

  const architecture = await new ConstructionArchitectAgent({ llmClient, mode }).run(prompt);
  const buildSpec = deriveBuildSpec(prompt, architecture);
  const topology = await new ConstructionPlannerAgent({ llmClient, mode }).run(prompt, architecture);
  const shell = new CSGBuilder(buildSpec, architecture.materials).generateShell(architecture);
  const layout = new BSPPartitioner(buildSpec, architecture.materials).fitRooms(shell, topology);
  const paths = new AStarPathfinder(buildSpec, architecture.materials).connect(shell, layout, topology);
  const decorator = new ConstructionDecoratorAgent().run(layout.rooms, architecture.materials);
  const bounds = computeBounds(shell.grid);
  const operations = gridToOperations(shell.grid);
  const blueprint = buildBlueprint({
    prompt,
    architecture,
    topology,
    buildSpec,
    shell,
    layout,
    paths,
    decorator,
    operations,
    bounds,
    llmProvider,
    seed
  });
  const validation = validateBlueprint(blueprint);
  if (!validation.ok) throw new Error(`Blueprint validation failed: ${validation.errors.join('; ')}`);

  const artifacts = await exportArtifacts({
    outputDir,
    blueprint,
    validation,
    prompt,
    mcVersion,
    autoBuild,
    minecraftDir,
    world,
    datapacksDir
  });

  return {
    workflow: 'construction_method_v1',
    runtime: 'nodejs',
    prompt,
    outputDir,
    mode,
    llmProvider,
    mcVersion,
    architecture,
    topology,
    buildSpec,
    geometry: blueprint.geometry,
    blueprint,
    validation,
    artifacts
  };
}

export function deriveBuildSpec(prompt, architecture) {
  const scale = detectScale(prompt);
  const floors = detectFloors(prompt, scale);
  const defaults = {
    small: { width: 15, depth: 13, garden_depth: 5 },
    medium: { width: 19, depth: 15, garden_depth: 6 },
    large: { width: 27, depth: 23, garden_depth: 9 }
  }[scale];
  const { width, depth } = parseDimensions(prompt, defaults.width, defaults.depth);
  const floorHeight = parseIntMatch(prompt, /层高\s*(\d{1,2})/, 5, 4, 7);
  const roofHeight = parseIntMatch(prompt, /屋顶(?:高|高度)\s*(\d{1,2})/, architecture.style === '欧式' ? 6 : 3, 2, 9);
  const doorSide = architecture.facade_rules?.front_side || detectDoorSide(prompt);
  const doorWidth = scale === 'large' || /双开门|大门|门厅/.test(prompt) ? 2 : 1;
  const doorHeight = scale === 'large' || /高门|拱门|门厅/.test(prompt) ? 3 : 2;

  return {
    scale,
    width,
    depth,
    floors,
    floor_height: floorHeight,
    wall_height: floors * floorHeight,
    roof_height: roofHeight,
    garden_depth: parseIntMatch(prompt, /(?:庭院|院子|花园)(?:深|长度)?\s*(\d{1,2})/, defaults.garden_depth, 3, 16),
    door_side: normalizeSide(String(doorSide)),
    door_width: Math.max(1, Math.min(3, doorWidth)),
    door_height: Math.max(2, Math.min(4, doorHeight))
  };
}

function parseDimensions(prompt, defaultWidth, defaultDepth) {
  const pair = prompt.match(/(?:尺寸|大小)?\s*(\d{2})\s*[xX×*]\s*(\d{2})/);
  const widthBefore = prompt.match(/(\d{1,2})\s*(?:格|块)?\s*宽/);
  const depthBefore = prompt.match(/(\d{1,2})\s*(?:格|块)?\s*(?:深|长)/);
  const width = parseIntMatch(prompt, /宽(?:度)?\s*(\d{1,2})/, pair ? Number(pair[1]) : widthBefore ? Number(widthBefore[1]) : defaultWidth, 11, 45);
  const depth = parseIntMatch(prompt, /(?:深|深度|长|长度)\s*(\d{1,2})/, pair ? Number(pair[2]) : depthBefore ? Number(depthBefore[1]) : defaultDepth, 11, 45);
  return { width, depth };
}

function buildBlueprint({ prompt, architecture, topology, buildSpec, shell, layout, paths, decorator, operations, bounds, llmProvider, seed }) {
  return {
    version: 4,
    workflow: 'construction_method_v1',
    runtime: 'nodejs',
    prompt,
    seed,
    llmProvider,
    philosophy: architecture.philosophy,
    buildSpec,
    architecture,
    topology,
    geometry: {
      engine: 'pure JavaScript CSG + BSP + A* voxel engine',
      csg: shell.csg,
      bsp: layout.bsp,
      pathfinder: paths.pathfinder,
      gridCellCount: shell.grid.size
    },
    shell: {
      bounds,
      interiorSpaces: shell.interiorSpaces,
      volumeBoxes: shell.volumeBoxes.map((box) => ({
        id: box.id,
        role: box.role,
        shape: box.shape,
        module: box.module,
        bounds: {
          minX: box.min_x,
          maxX: box.max_x,
          minY: box.min_y,
          maxY: box.max_y,
          minZ: box.min_z,
          maxZ: box.max_z
        }
      }))
    },
    layout: {
      rooms: layout.rooms,
      interiorDoors: layout.interiorDoors,
      floorOpenings: layout.floorOpenings
    },
    paths: {
      mainDoor: paths.mainDoor,
      openedEdges: paths.openedEdges,
      stairs: paths.stairs
    },
    decorator,
    modules: moduleCounts(shell.grid),
    bounds,
    operations,
    constraints: [
      'LLM outputs semantic JSON only.',
      'Zhipu API is the default LLM channel; Codex CLI and OpenAI-compatible HTTP APIs are preserved.',
      'All coordinates are generated by deterministic local JavaScript algorithms.',
      'SkillAgent/SkillRouter is not used in this workflow.',
      'Python is not required.'
    ]
  };
}

function gridToOperations(grid) {
  const rows = new Map();
  for (const [pointKey, cell] of grid.entries()) {
    const point = parseKey(pointKey);
    const rowKey = `${point.y}|${point.z}|${cell.block}`;
    if (!rows.has(rowKey)) rows.set(rowKey, []);
    rows.get(rowKey).push(point.x);
  }

  const operations = [];
  const sortedRows = [...rows.entries()].sort(([a], [b]) => {
    const [ay, az, ab] = a.split('|');
    const [by, bz, bb] = b.split('|');
    return Number(ay) - Number(by) || Number(az) - Number(bz) || ab.localeCompare(bb);
  });

  for (const [rowKey, xs] of sortedRows) {
    const [yRaw, zRaw, block] = rowKey.split('|');
    const y = Number(yRaw);
    const z = Number(zRaw);
    xs.sort((a, b) => a - b);
    let start = xs[0];
    let previous = xs[0];
    for (let index = 1; index <= xs.length; index += 1) {
      const current = xs[index];
      if (current === previous + 1) {
        previous = current;
        continue;
      }
      operations.push({
        kind: 'fill',
        from: { x: start, y, z },
        to: { x: previous, y, z },
        block
      });
      start = current;
      previous = current;
    }
  }
  return operations;
}

function moduleCounts(grid) {
  const counts = {};
  for (const cell of grid.values()) counts[cell.module] = (counts[cell.module] || 0) + 1;
  return counts;
}

function validateBlueprint(blueprint) {
  const errors = [];
  const warnings = [];
  let fillCount = 0;
  let setblockCount = 0;

  for (const operation of blueprint.operations) {
    if (!BLOCK_PATTERN.test(operation.block)) errors.push(`非法方块 ID: ${operation.block}`);
    if (operation.kind === 'fill') {
      fillCount += 1;
      const volume = (
        Math.abs(operation.to.x - operation.from.x) + 1
      ) * (
        Math.abs(operation.to.y - operation.from.y) + 1
      ) * (
        Math.abs(operation.to.z - operation.from.z) + 1
      );
      if (volume > 32768) errors.push(`fill 命令体积超过 Minecraft 限制: ${volume}`);
    } else if (operation.kind === 'setblock') {
      setblockCount += 1;
    } else {
      errors.push(`未知操作类型: ${operation.kind}`);
    }
  }

  const bounds = blueprint.bounds;
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  const depth = bounds.maxZ - bounds.minZ + 1;
  if (width > 80 || depth > 80 || height > 40) warnings.push(`建筑边界较大: ${width}x${height}x${depth}`);
  if (blueprint.operations.length > 8000) warnings.push('函数命令数量接近 Minecraft 单次执行压力上限。');

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      operationCount: blueprint.operations.length,
      fillCount,
      setblockCount,
      bounds: { width, height, depth },
      modules: blueprint.modules
    }
  };
}

async function exportArtifacts({ outputDir, blueprint, validation, prompt, mcVersion, autoBuild, minecraftDir, world, datapacksDir }) {
  const datapackDir = path.join(outputDir, 'architect_datapack');
  const functionDir = path.join(datapackDir, 'data', 'architect', 'function');
  await ensureDir(functionDir);

  const buildCommands = blueprint.operations.map(operationToCommand);
  const buildPath = path.join(functionDir, 'build.mcfunction');
  const clearPath = path.join(functionDir, 'clear.mcfunction');
  const runPath = path.join(functionDir, 'run.mcfunction');
  const blueprintPath = path.join(outputDir, 'blueprint.json');
  const rawPath = path.join(outputDir, 'raw_build.mcfunction');
  const previewPath = path.join(outputDir, 'preview.html');
  const reportPath = path.join(outputDir, 'run_report.md');

  await writeJson(blueprintPath, blueprint);
  await writeJson(path.join(datapackDir, 'pack.mcmeta'), {
    pack: {
      pack_format: packFormatFor(mcVersion),
      description: 'AI Minecraft Architect construction_method_v1 nodejs'
    }
  });
  await fs.writeFile(buildPath, `${['# Generated by MC Architect Agent construction_method_v1', '# Run with: /function architect:build', ...buildCommands].join('\n')}\n`, 'utf8');
  await fs.writeFile(clearPath, `${['# Clear the generated build area', '# Run with: /function architect:clear', clearCommandForBounds(blueprint.bounds)].join('\n')}\n`, 'utf8');
  await fs.writeFile(runPath, `${[
    '# One-command build entrypoint',
    '# Run with: /function architect:run',
    '# /reload only refreshes the datapack and does not build.',
    'function architect:clear',
    'function architect:build',
    'tellraw @a [{"text":"AI Architect 建造完成。","color":"green"}]'
  ].join('\n')}\n`, 'utf8');
  await fs.writeFile(rawPath, `${buildCommands.join('\n')}\n`, 'utf8');
  await fs.writeFile(previewPath, renderPreviewHtml(prompt, blueprint, validation), 'utf8');

  const installedDatapackDir = await installDatapack(datapackDir, minecraftDir, world, datapacksDir);
  await fs.writeFile(reportPath, renderReport({ prompt, blueprint, validation, mcVersion, autoBuild, datapackDir, buildPath, clearPath, runPath, rawPath, previewPath, installedDatapackDir }), 'utf8');

  return {
    blueprint: blueprintPath,
    datapackDir,
    buildFunction: buildPath,
    clearFunction: clearPath,
    runFunction: runPath,
    rawBuild: rawPath,
    previewHtml: previewPath,
    report: reportPath,
    installedDatapackDir
  };
}

function operationToCommand(operation) {
  if (operation.kind === 'fill') {
    return `fill ${rel(operation.from.x)} ${rel(operation.from.y)} ${rel(operation.from.z)} ${rel(operation.to.x)} ${rel(operation.to.y)} ${rel(operation.to.z)} ${operation.block}`;
  }
  return `setblock ${rel(operation.at.x)} ${rel(operation.at.y)} ${rel(operation.at.z)} ${operation.block}`;
}

function clearCommandForBounds(bounds, padding = 2) {
  return `fill ${rel(bounds.minX - padding)} ${rel(Math.max(0, bounds.minY))} ${rel(bounds.minZ - padding)} ${rel(bounds.maxX + padding)} ${rel(bounds.maxY + padding)} ${rel(bounds.maxZ + padding)} minecraft:air`;
}

function rel(value) {
  return value === 0 ? '~' : `~${value}`;
}

async function installDatapack(datapackDir, minecraftDir, world, datapacksDir) {
  if (datapacksDir) {
    const targetDir = path.join(path.resolve(datapacksDir), 'architect_datapack');
    await fs.rm(targetDir, { recursive: true, force: true });
    await ensureDir(path.dirname(targetDir));
    await fs.cp(datapackDir, targetDir, { recursive: true });
    return targetDir;
  }
  if (!world) return undefined;
  const worldDir = await resolveWorldDir({ minecraftDir, world });
  const targetDir = path.join(worldDir, 'datapacks', 'architect_datapack');
  await fs.rm(targetDir, { recursive: true, force: true });
  await ensureDir(path.dirname(targetDir));
  await fs.cp(datapackDir, targetDir, { recursive: true });
  return targetDir;
}

function renderPreviewHtml(prompt, blueprint, validation) {
  const bounds = blueprint.bounds;
  const width = bounds.maxX - bounds.minX + 1;
  const depth = bounds.maxZ - bounds.minZ + 1;
  const roomRects = blueprint.layout.rooms
    .filter((room) => room.floor === 0)
    .map((room) => {
      const x = room.min_x - bounds.minX;
      const z = room.min_z - bounds.minZ;
      return `<rect x="${x}" y="${z}" width="${room.max_x - room.min_x + 1}" height="${room.max_z - room.min_z + 1}" /><text x="${x + 1}" y="${z + 4}">${escapeHtml(room.label)}</text>`;
    })
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<title>MC Architect Preview</title>
<style>
body { font-family: system-ui, sans-serif; margin: 24px; background: #f7f7f3; color: #242424; }
svg { background: #fff; border: 1px solid #d8d8d0; max-width: 100%; height: auto; }
rect { fill: #e7efe7; stroke: #44624a; stroke-width: .5; }
text { font-size: 3px; fill: #26352a; }
</style>
<h1>MC Architect Preview</h1>
<p>${escapeHtml(prompt)}</p>
<p>workflow: construction_method_v1 | runtime: nodejs | operations: ${validation.stats.operationCount}</p>
<svg viewBox="0 0 ${width} ${depth}" width="${width * 16}" height="${depth * 16}" role="img" aria-label="floor plan preview">
${roomRects}
</svg>
</html>
`;
}

function renderReport({ prompt, blueprint, validation, mcVersion, autoBuild, datapackDir, buildPath, clearPath, runPath, rawPath, previewPath, installedDatapackDir }) {
  const architecture = blueprint.architecture;
  const topology = blueprint.topology;
  const geometry = blueprint.geometry;
  const volumes = architecture.volumes.map((item) => `${item.role}(${item.shape}/${item.boolean_mode})`).join('、');
  const rooms = topology.nodes.map((item) => `${item.label}(F${item.floor}/${item.type})`).join('、');
  const warnings = validation.warnings.map((item) => `- ${item}`).join('\n') || '- 无';
  const installLine = installedDatapackDir ? `- 已安装到世界：${installedDatapackDir}\n` : '';
  const usage = [
    '1. 如果刚复制或更新了数据包，先运行 /reload。这个命令只刷新数据包，不会建造。',
    '2. 站在目标位置运行 /function architect:run。它会自动 clear + build。'
  ].join('\n');

  return `# Minecraft 建筑智能体运行报告

## 输入需求

${prompt}

## PDF 流程对齐

- ArchitectAgent：生成第一步外壳 JSON，只包含 style/materials/volumes 等语义字段。
- PlannerAgent：生成第二步房间拓扑 JSON，只包含 nodes/edges/circulation/bsp hints。
- GeometryEngine：本地纯 JavaScript CSG + BSP + A* 负责所有坐标、门洞和楼梯。
- Export：将网格转成 Minecraft 函数命令。
- SkillAgent：未使用。
- Python：未使用。
- LLM 通道：${blueprint.llmProvider}

## 建筑语义 JSON

- 来源：${architecture.source}
- 风格：${architecture.style}
- 体块：${volumes}
- 材质：${Object.entries(architecture.materials).map(([key, value]) => `${key}=${value}`).join(', ')}

## 拓扑 JSON

- 来源：${topology.source}
- 房间节点：${rooms}
- 边数量：${topology.edges.length}

## 几何结果

- 引擎：${geometry.engine}
- CSG：体块 ${geometry.csg.volumeCount} 个，实体格 ${geometry.csg.solidCellCount}，表面格 ${geometry.csg.surfaceCellCount}
- BSP：房间 ${geometry.bsp.roomCount} 个，节点 ${geometry.bsp.nodeCount}，边 ${geometry.bsp.edgeCount}
- A*：开洞 ${geometry.pathfinder.openedDoorCount} 处，楼梯块 ${geometry.pathfinder.stairCount} 个

## 校验

- 状态：${validation.ok ? '通过' : '未通过'}
- 命令数：${validation.stats.operationCount}
- 建筑尺寸：${validation.stats.bounds.width} x ${validation.stats.bounds.height} x ${validation.stats.bounds.depth}
- 警告：
${warnings}

## 输出文件

- 数据包目录：${datapackDir}
- 建造函数：${buildPath}
- 清理函数：${clearPath}
- 一键建造函数：${runPath}
- 原始 mcfunction：${rawPath}
- 预览 HTML：${previewPath}
${installLine}
## Minecraft Java ${mcVersion} 使用步骤

${usage}

说明：mcfunction 文件内部命令不带斜杠，这是 Minecraft 数据包函数的正常格式。
`;
}

function parseIntMatch(prompt, pattern, fallback, min, max) {
  const match = prompt.match(pattern);
  const value = Number(match?.[1] ?? fallback);
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeSide(value) {
  const text = value.toLowerCase();
  if (['north', 'south', 'east', 'west'].includes(text)) return text;
  if (text.includes('北')) return 'north';
  if (text.includes('东')) return 'east';
  if (text.includes('西')) return 'west';
  return 'south';
}

function packFormatFor(version) {
  return String(version).startsWith('1.21') ? 48 : 26;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
