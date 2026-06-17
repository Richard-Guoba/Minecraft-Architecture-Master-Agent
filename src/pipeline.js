import path from 'node:path';
import { randomInt } from 'node:crypto';
import { createTimestamp, ensureDir } from './lib/fs.js';
import { runConstructionWorkflow } from './construction/workflow.js';

const MAX_RANDOM_SEED = 2147483647;

export async function runPipeline({
  prompt,
  mode = 'auto',
  mcVersion = '1.21',
  outRoot,
  seed,
  cwd = process.cwd(),
  minecraftDir,
  world,
  datapacksDir,
  autoBuild = false
}) {
  if (!prompt || !prompt.trim()) {
    throw new Error('Prompt is required.');
  }

  const seedPlan = resolveSeed(seed);
  const outputDir = path.join(path.resolve(outRoot || path.join(cwd, 'out')), createTimestamp());
  await ensureDir(outputDir);

  const result = await runConstructionWorkflow({
    prompt,
    mode,
    mcVersion,
    outputDir,
    seed: seedPlan.seed,
    seedSource: seedPlan.source,
    cwd,
    minecraftDir,
    world,
    datapacksDir,
    autoBuild
  });

  return {
    ...result,
    seed: seedPlan.seed,
    seedSource: seedPlan.source
  };
}

export function resolveSeed(seed) {
  if (seed === undefined || seed === null || seed === '') {
    return {
      seed: randomInt(1, MAX_RANDOM_SEED),
      source: 'random'
    };
  }

  const parsed = Number(seed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid seed: ${seed}`);
  }

  return {
    seed: Math.trunc(parsed),
    source: 'manual'
  };
}
