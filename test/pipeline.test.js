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

    const report = await fs.readFile(result.artifacts.report, 'utf8');
    assert.match(report, /Minecraft Java 1\.21/);
    assert.match(report, /\/function architect:build/);
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
