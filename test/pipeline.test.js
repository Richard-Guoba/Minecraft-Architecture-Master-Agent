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
