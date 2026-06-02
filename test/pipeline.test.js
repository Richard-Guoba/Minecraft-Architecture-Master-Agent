import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../src/pipeline.js';

test('generates a Minecraft Java 1.21 datapack in fallback mode', async () => {
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

    const pack = JSON.parse(await fs.readFile(path.join(result.artifacts.datapackDir, 'pack.mcmeta'), 'utf8'));
    assert.equal(pack.pack.pack_format, 48);

    const buildPath = path.join(result.artifacts.datapackDir, 'data', 'architect', 'function', 'build.mcfunction');
    const build = await fs.readFile(buildPath, 'utf8');
    assert.match(build, /fill ~ ~ ~/);
    assert.match(build, /minecraft:smooth_sandstone/);
    assert.match(build, /minecraft:dark_oak_door/);
    assert.doesNotMatch(build, /^\//m);

    await assert.rejects(
      fs.access(path.join(result.artifacts.datapackDir, 'data', 'architect', 'functions')),
      /ENOENT/
    );

    assert.equal(result.validation.ok, true);
    for (const module of ['foundation', 'walls', 'floors', 'roof', 'windows', 'door', 'chimney', 'garden']) {
      assert.ok(result.blueprint.modules[module], `missing module ${module}`);
    }
    for (const module of ['interior', 'stairs', 'lighting', 'furnishing']) {
      assert.ok(result.blueprint.modules[module], `missing enriched module ${module}`);
    }
    assert.equal(result.design.elements.wall.material, 'minecraft:smooth_sandstone');
    assert.equal(result.design.elements.roof.style, 'gabled');
    assert.equal(result.blueprint.version, 3);
    assert.ok(result.blueprint.agents.shell.interiorSpaces.length >= 1);
    assert.ok(result.blueprint.agents.layout.rooms.length >= 2);
    assert.ok(result.blueprint.agents.furnishing.placed > 0);
    assert.equal(result.blueprint.agents.garden.enabled, true);

    const report = await fs.readFile(result.artifacts.report, 'utf8');
    assert.match(report, /Minecraft Java 1\.21/);
    assert.match(report, /\/function architect:build/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('honors configurable element size, position, and material hints', async () => {
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
    assert.equal(result.design.dimensions.width, 31);
    assert.equal(result.design.dimensions.depth, 17);
    assert.equal(result.design.elements.wall.material, 'minecraft:white_concrete');
    assert.equal(result.design.elements.floor.material, 'minecraft:quartz_block');
    assert.equal(result.design.elements.window.width, 4);
    assert.equal(result.design.elements.window.height, 3);
    assert.equal(result.design.elements.door.side, 'east');
    assert.equal(result.design.elements.door.material, 'minecraft:iron_door');
    assert.equal(result.design.elements.roof.style, 'flat');

    for (const module of ['interior', 'stairs', 'lighting', 'furnishing']) {
      assert.ok(result.blueprint.modules[module], `missing module ${module}`);
    }
    assert.ok(result.blueprint.agents.shell.interiorSpaces.length >= 2);
    assert.ok(result.blueprint.agents.layout.floorOpenings.length >= 1);
    assert.ok(result.blueprint.agents.furnishing.rooms.length >= 2);

    const buildPath = path.join(result.artifacts.datapackDir, 'data', 'architect', 'function', 'build.mcfunction');
    const build = await fs.readFile(buildPath, 'utf8');
    assert.match(build, /minecraft:white_concrete/);
    assert.match(build, /minecraft:quartz_block/);
    assert.match(build, /minecraft:glass/);
    assert.match(build, /minecraft:iron_door\[facing=east/);

    const report = await fs.readFile(result.artifacts.report, 'utf8');
    assert.match(report, /可配置建筑元素/);
    assert.match(report, /蓝图子 Agent 交付/);
    assert.match(report, /位置 east-center/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('installs auto-build datapack into a Minecraft save', async () => {
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
    const tagDir = path.join(installed, 'data', 'minecraft', 'tags', 'function');
    const autoBuild = await fs.readFile(path.join(functionDir, 'auto_build.mcfunction'), 'utf8');
    const tick = await fs.readFile(path.join(functionDir, 'tick.mcfunction'), 'utf8');
    const loadTag = JSON.parse(await fs.readFile(path.join(tagDir, 'load.json'), 'utf8'));
    const tickTag = JSON.parse(await fs.readFile(path.join(tagDir, 'tick.json'), 'utf8'));

    assert.match(autoBuild, /function architect:clear/);
    assert.match(autoBuild, /function architect:build/);
    assert.match(tick, /as @a\[limit=1,sort=nearest\] at @s run function architect:auto_build/);
    assert.deepEqual(loadTag.values, ['architect:load']);
    assert.deepEqual(tickTag.values, ['architect:tick']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
