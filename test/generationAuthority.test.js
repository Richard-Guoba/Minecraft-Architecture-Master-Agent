import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { publishGenerationAuthority } from '../src/lib/generationAuthority.js';

test('generation authority publication refuses to replace an existing file', async t => {
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'generation-authority-'));
  t.after(() => fs.rm(runDir, { recursive: true, force: true }));
  const selectedDir = path.join(runDir, 'candidates', 'round-01', 'candidate-01-seed-7');
  const blueprintPath = path.join(selectedDir, 'blueprint.json');
  const buildFunctionPath = path.join(selectedDir, 'architect_datapack', 'data', 'architect', 'function', 'build.mcfunction');
  const selectionPath = path.join(runDir, 'candidate_selection.json');
  await fs.mkdir(path.dirname(buildFunctionPath), { recursive: true });
  await fs.writeFile(selectionPath, '{}\n');
  await fs.writeFile(blueprintPath, '{}\n');
  await fs.writeFile(buildFunctionPath, '# build\n');
  const authorityPath = path.join(runDir, 'generation-authority.json');
  await fs.writeFile(authorityPath, 'foreign\n');

  await assert.rejects(publishGenerationAuthority({
    runDir,
    options: {
      prompt: 'p', rootSeed: 7, mode: 'mock', minecraftVersion: '1.21.9',
      candidateCount: 3, candidateRounds: 1, candidateForceRounds: false,
      concepts: 0, conceptStrategy: 'select', critics: false, neuralRetrieval: false,
      coarseVoxelMode: 'off', coarseVoxelProvider: 'baseline', coarseVoxelPlan: null,
      playbook: 'off'
    },
    selectionPath, selectedCandidateId: 'candidate-01', selectedDir,
    blueprintPath, buildFunctionPath
  }), /GENERATION_AUTHORITY_INVALID|EEXIST/u);
  assert.equal(await fs.readFile(authorityPath, 'utf8'), 'foreign\n');
  assert.deepEqual((await fs.readdir(runDir)).filter(name => name.startsWith('.generation-authority-')), []);
});
