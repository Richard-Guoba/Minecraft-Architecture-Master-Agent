import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../src/pipeline.js';

test('runs the construction-method workflow as the single active pipeline', async () => {
  const root = path.resolve('.tmp', `architect-test-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个欧式大房子',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 1
    });

    assert.equal(result.workflow, 'construction_method_v1');
    assert.equal(result.validation.ok, true);
    assert.equal(result.seed, 1);
    assert.equal(result.seedSource, 'manual');
    assert.equal(result.llmUsage.called, false);
    assert.equal(result.llmUsage.status, 'not-called');
    assert.equal(result.blueprint.seedSource, 'manual');
    assert.equal(result.architecture.source, 'fallback');
    assert.equal(result.architecture.footprint, 'winged');
    assert.equal(result.architecture.volumes.length >= 4, true);
    for (const volume of result.architecture.volumes) {
      assert.ok(volume.scale, 'volume should use relative scale');
      assert.ok(volume.placement, 'volume should use semantic placement');
      assert.equal(Object.hasOwn(volume, 'x'), false);
      assert.equal(Object.hasOwn(volume, 'y'), false);
      assert.equal(Object.hasOwn(volume, 'z'), false);
    }

    assert.equal(result.topology.source, 'fallback');
    assert.ok(result.topology.nodes.some((node) => node.type === 'living'));
    assert.ok(result.topology.edges.length > 0);
    assert.equal(result.stylePreset.source, 'local-style-preset-memory');
    assert.equal(result.materialPalette.source, 'local-material-palette');
    assert.equal(result.structure.source, 'fallback-structure');
    assert.ok(result.structure.support_elements.length > 0);
    assert.equal(result.facade.source, 'local-facade-agent');
    assert.equal(result.roof.source, 'local-roof-agent');
    assert.equal(result.site.source, 'local-site-landscape-agent');
    assert.equal(result.opening.source, 'local-opening-connectivity-agent');
    assert.equal(result.interior.source, 'local-interior-detail-agent');
    assert.equal(result.repair.source, 'local-constraint-repair-agent');
    assert.equal(result.repair.ok, true);
    assert.equal(result.runtime, 'nodejs');
    assert.equal(result.geometry.engine, 'pure JavaScript CSG + BSP + A* voxel engine');
    assert.ok(result.geometry.csg.solidCellCount > 0);
    assert.equal(result.geometry.structure.system, result.structure.system);
    assert.ok(result.geometry.structure.supportElementCount > 0);
    assert.ok(result.geometry.facade.elementCount > 0);
    assert.ok(result.geometry.roof.elementCount >= 0);
    assert.ok(result.geometry.site.zoneCount > 0);
    assert.ok(result.geometry.bsp.roomCount >= 8);
    assert.equal(result.geometry.pathfinder.algorithm, 'A*');
    assert.equal(result.geometry.exporter.strategy, 'block-grouped-greedy-cuboid-packing');
    assert.equal(result.geometry.exporter.operationCount, result.blueprint.operations.length);
    assert.ok(result.geometry.exporter.operationCount < result.geometry.exporter.naiveOperationCount);
    assert.equal(result.geometry.exporter.coverageOk, true);
    assert.ok(result.validation.checks.some((item) => item.name === 'circulation' && item.ok));
    assert.equal(result.validation.stats.circulation.failedEdgeCount, 0);
    assert.equal(result.validation.stats.semantic.hasDecoration, true);
    assert.ok(result.geometry.pathfinder.openedDoorCount > 0);
    assert.equal(result.blueprint.constraints.some((item) => /construction_method_v1/.test(item)), true);
    assert.equal(result.blueprint.constraints.some((item) => /Python is not required/.test(item)), true);

    const pack = JSON.parse(await fs.readFile(path.join(result.artifacts.datapackDir, 'pack.mcmeta'), 'utf8'));
    assert.equal(pack.pack.pack_format, 48);

    const buildPath = path.join(result.artifacts.datapackDir, 'data', 'architect', 'function', 'build.mcfunction');
    const runPath = path.join(result.artifacts.datapackDir, 'data', 'architect', 'function', 'run.mcfunction');
    const build = await fs.readFile(buildPath, 'utf8');
    const run = await fs.readFile(runPath, 'utf8');
    assert.match(build, /^fill /m);
    assert.match(build, /minecraft:smooth_sandstone/);
    assert.match(build, /minecraft:dark_oak_door/);
    assert.doesNotMatch(build, /^\//m);
    assert.match(run, /function architect:clear/);
    assert.match(run, /function architect:build/);
    assert.match(run, /\/reload only refreshes/);

    const report = await fs.readFile(result.artifacts.report, 'utf8');
    const preview = await fs.readFile(result.artifacts.previewHtml, 'utf8');
    assert.match(report, /PDF 流程对齐/);
    assert.match(report, /旧 Requirement\/Designer\/Blueprint\/Super agent 流程：已移除/);
    assert.match(report, /Python：未使用/);
    assert.match(report, /LLM 调用：未调用，使用本地规则/);
    assert.match(report, /Seed：1 \(manual\)/);
    assert.match(report, /StructureAgent/);
    assert.match(report, /MaterialPaletteAgent/);
    assert.match(report, /FacadeAgent \/ RoofAgent \/ SiteLandscapeAgent/);
    assert.match(report, /OpeningConnectivityAgent/);
    assert.match(report, /InteriorDetailAgent/);
    assert.match(report, /ConstraintRepairAgent/);
    assert.match(report, /结构框架 JSON/);
    assert.match(report, /表皮与场地 JSON/);
    assert.match(report, /CSG：体块/);
    assert.match(report, /Structure：支撑/);
    assert.match(report, /Facade\/Roof\/Site/);
    assert.match(report, /BSP：房间/);
    assert.match(report, /A\*：开洞/);
    assert.match(report, /Exporter：网格/);
    assert.match(report, /QA：/);
    assert.match(report, /\/function architect:run/);
    assert.match(report, /只刷新数据包，不会建造/);
    assert.match(preview, /多层平面/);
    assert.match(preview, /QA 检查/);
    assert.match(preview, /导出压缩/);
    assert.match(preview, /class="room/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('honors configurable size, position, and material hints in the new workflow', async () => {
  const root = path.resolve('.tmp', `architect-config-test-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个现代两层房子，宽31深17，白色混凝土墙，石英地板，大玻璃窗，铁门，门在东侧，平屋顶，带室内楼梯和灯',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 2
    });

    assert.equal(result.validation.ok, true);
    assert.equal(result.architecture.style, '现代');
    assert.equal(result.architecture.footprint, 'l-shape');
    assert.equal(result.buildSpec.width, 31);
    assert.equal(result.buildSpec.depth, 17);
    assert.equal(result.buildSpec.door_side, 'east');
    assert.equal(result.architecture.materials.wall, 'minecraft:white_concrete');
    assert.equal(result.architecture.materials.floor, 'minecraft:quartz_block');
    assert.equal(result.architecture.materials.glass, 'minecraft:glass');
    assert.equal(result.architecture.materials.door, 'minecraft:iron_door');
    assert.equal(result.architecture.roof_rules.style, 'flat');
    assert.ok(result.architecture.volumes.some((volume) => volume.id === 'glass-wing'));
    assert.ok(result.topology.nodes.some((node) => node.type === 'stairs'));

    const buildPath = path.join(result.artifacts.datapackDir, 'data', 'architect', 'function', 'build.mcfunction');
    const build = await fs.readFile(buildPath, 'utf8');
    assert.match(build, /minecraft:white_concrete/);
    assert.match(build, /minecraft:quartz_block/);
    assert.match(build, /minecraft:glass/);
    assert.match(build, /minecraft:iron_door\[facing=east/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('generates a random seed when none is provided', async () => {
  const root = path.resolve('.tmp', `architect-random-seed-test-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个小木屋',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd()
    });

    assert.equal(Number.isInteger(result.seed), true);
    assert.equal(result.seedSource, 'random');
    assert.equal(result.blueprint.seed, result.seed);
    assert.equal(result.blueprint.seedSource, 'random');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('installs datapack into a Minecraft save with a single run function', async () => {
  const root = path.resolve('.tmp', `architect-install-test-${Date.now()}`);
  const minecraftDir = path.join(root, 'mc');
  const worldDir = path.join(minecraftDir, 'saves', 'DemoWorld');
  try {
    await fs.mkdir(worldDir, { recursive: true });
    const result = await runPipeline({
      prompt: '建一个欧式大房子',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      minecraftDir,
      world: 'DemoWorld',
      autoBuild: true,
      cwd: process.cwd(),
      seed: 1
    });

    const installed = path.join(worldDir, 'datapacks', 'architect_datapack');
    assert.equal(result.artifacts.installedDatapackDir, installed);
    await fs.access(path.join(installed, 'pack.mcmeta'));

    const functionDir = path.join(installed, 'data', 'architect', 'function');
    const run = await fs.readFile(path.join(functionDir, 'run.mcfunction'), 'utf8');
    assert.match(run, /function architect:clear/);
    assert.match(run, /function architect:build/);
    await assert.rejects(
      fs.access(path.join(functionDir, 'auto_build.mcfunction')),
      /ENOENT/
    );
    await assert.rejects(
      fs.access(path.join(functionDir, 'tick.mcfunction')),
      /ENOENT/
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('installs directly into an explicit datapacks directory', async () => {
  const root = path.resolve('.tmp', `architect-datapacks-dir-test-${Date.now()}`);
  const datapacksDir = path.join(root, 'saves', 'BuildLab', 'datapacks');
  try {
    await fs.mkdir(datapacksDir, { recursive: true });
    const result = await runPipeline({
      prompt: '建一个欧式大房子',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      datapacksDir,
      autoBuild: true,
      cwd: process.cwd(),
      seed: 1
    });

    const installed = path.join(datapacksDir, 'architect_datapack');
    assert.equal(result.artifacts.installedDatapackDir, installed);
    await fs.access(path.join(installed, 'pack.mcmeta'));
    await fs.access(path.join(installed, 'data', 'architect', 'function', 'build.mcfunction'));
    await fs.access(path.join(installed, 'data', 'architect', 'function', 'run.mcfunction'));
    await assert.rejects(
      fs.access(path.join(installed, 'data', 'minecraft', 'tags', 'function', 'load.json')),
      /ENOENT/
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
