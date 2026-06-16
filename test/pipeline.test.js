import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../src/pipeline.js';

test('runs the PDF construction-method workflow without SkillAgent', async () => {
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
    assert.equal(result.runtime, 'nodejs');
    assert.equal(result.geometry.engine, 'pure JavaScript CSG + BSP + A* voxel engine');
    assert.ok(result.geometry.csg.solidCellCount > 0);
    assert.ok(result.geometry.bsp.roomCount >= 8);
    assert.equal(result.geometry.pathfinder.algorithm, 'A*');
    assert.ok(result.geometry.pathfinder.openedDoorCount > 0);
    assert.equal(result.blueprint.constraints.some((item) => /SkillAgent/.test(item)), true);
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
    assert.match(report, /PDF 流程对齐/);
    assert.match(report, /SkillAgent：未使用/);
    assert.match(report, /Python：未使用/);
    assert.doesNotMatch(report, /SkillRouterAgent 来源/);
    assert.match(report, /CSG：体块/);
    assert.match(report, /BSP：房间/);
    assert.match(report, /A\*：开洞/);
    assert.match(report, /\/function architect:run/);
    assert.match(report, /只刷新数据包，不会建造/);
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
