import path from 'node:path';
import { createTimestamp, ensureDir } from './lib/fs.js';
import { runConstructionWorkflow } from './construction/workflow.js';

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

  const outputDir = path.join(path.resolve(outRoot || path.join(cwd, 'out')), createTimestamp());
  await ensureDir(outputDir);

  return runConstructionWorkflow({
    prompt,
    mode,
    mcVersion,
    outputDir,
    seed,
    cwd,
    minecraftDir,
    world,
    datapacksDir,
    autoBuild
  });
}
