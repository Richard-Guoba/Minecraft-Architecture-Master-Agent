import fs from 'node:fs/promises';
import path from 'node:path';

import { ensureDir } from '../lib/fs.js';
import { resolveWorldDir } from '../lib/minecraftWorlds.js';

const MAX_RANDOM_SEED = 2147483647;

export function candidateSeedFor(baseSeed, roundIndex = 1, candidateIndex = 1) {
  const base = Number(baseSeed || 1);
  const raw = Math.trunc(base + roundIndex * 1000003 + candidateIndex * 7919);
  const normalized = ((raw % MAX_RANDOM_SEED) + MAX_RANDOM_SEED) % MAX_RANDOM_SEED;
  return normalized || 1;
}

export async function installSelectedDatapack(sourceDatapackDir, { minecraftDir, world, datapacksDir } = {}) {
  if (!sourceDatapackDir || (!world && !datapacksDir)) return undefined;
  const targetDir = datapacksDir
    ? path.join(path.resolve(datapacksDir), 'architect_datapack')
    : path.join(await resolveWorldDir({ minecraftDir, world }), 'datapacks', 'architect_datapack');
  await fs.rm(targetDir, { recursive: true, force: true });
  await ensureDir(path.dirname(targetDir));
  await fs.cp(sourceDatapackDir, targetDir, { recursive: true });
  return targetDir;
}
