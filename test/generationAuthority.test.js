import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { publishGenerationAuthority } from '../src/lib/generationAuthority.js';

const OPTIONS = Object.freeze({
  prompt: 'p', rootSeed: 7, mode: 'mock', minecraftVersion: '1.21.9',
  candidateCount: 1, candidateRounds: 1, candidateForceRounds: false,
  concepts: 0, conceptStrategy: 'select', critics: false, neuralRetrieval: false,
  coarseVoxelMode: 'off', coarseVoxelProvider: 'baseline', coarseVoxelPlan: null,
  playbook: 'off'
});

test('generation authority publication refuses to replace an existing file', async t => {
  const fixture = await makeFixture(t);
  const authorityPath = path.join(fixture.runDir, 'generation-authority.json');
  await fs.writeFile(authorityPath, 'foreign\n');

  await assert.rejects(publishGenerationAuthority({
    runDir: fixture.runDir, options: OPTIONS
  }), /GENERATION_AUTHORITY_INVALID|EEXIST/u);
  assert.equal(await fs.readFile(authorityPath, 'utf8'), 'foreign\n');
  assert.deepEqual(await privateStages(fixture.runDir), []);
});

test('generation authority admits safe absolute ancestors without restricting ordinary names', async t => {
  const fixture = await makeFixture(t, { spacedParent: true });
  const result = await publishGenerationAuthority({ runDir: fixture.runDir, options: OPTIONS });
  assert.equal(result.path, path.join(fixture.runDir, 'generation-authority.json'));
  assert.equal((await fs.lstat(result.path)).nlink, 1);
});

test('generation authority binds the original prompt to canonical round-one selection data', async t => {
  const fixture = await makeFixture(t);
  const selectionPath = path.join(fixture.runDir, 'candidate_selection.json');
  const selection = JSON.parse(await fs.readFile(selectionPath));
  selection.rounds[0].prompt = 'different prompt';
  await fs.writeFile(selectionPath, `${JSON.stringify(selection, null, 2)}\n`);
  await assert.rejects(publishGenerationAuthority({
    runDir: fixture.runDir, options: OPTIONS
  }), /GENERATION_AUTHORITY_INVALID/u);
  await assert.rejects(fs.lstat(path.join(fixture.runDir, 'generation-authority.json')), { code: 'ENOENT' });
});

test('generation authority rejects split snapshots across replaced retained boundaries', async t => {
  for (const boundary of ['root', 'candidates', 'round', 'blueprint', 'build']) {
    await t.test(boundary, async subtest => {
      const fixture = await makeFixture(subtest);
      let replacementPath;
      await assert.rejects(publishGenerationAuthority({
        runDir: fixture.runDir,
        options: OPTIONS,
        fsImpl: {
          async afterSelectedArtifactsBound() {
            if (boundary === 'root') {
              const retained = `${fixture.runDir}-retained`;
              await fs.rename(fixture.runDir, retained);
              await fs.mkdir(fixture.runDir);
              replacementPath = path.join(fixture.runDir, 'foreign.txt');
              await fs.writeFile(replacementPath, 'foreign-root\n');
              return;
            }
            const target = boundary === 'candidates' ? fixture.candidatesDir
              : boundary === 'round' ? fixture.roundDir
                : boundary === 'blueprint' ? fixture.blueprintPath : fixture.buildFunctionPath;
            const retained = `${target}.retained`;
            await fs.rename(target, retained);
            if (boundary === 'candidates' || boundary === 'round') {
              await fs.mkdir(target);
              replacementPath = path.join(target, 'foreign.txt');
            } else {
              replacementPath = target;
            }
            await fs.writeFile(replacementPath, `foreign-${boundary}\n`);
          }
        }
      }), /GENERATION_AUTHORITY_INVALID/u);
      assert.equal(await fs.readFile(replacementPath, 'utf8'), `foreign-${boundary}\n`);
      await assert.rejects(fs.lstat(path.join(fixture.runDir, 'generation-authority.json')), { code: 'ENOENT' });
      assert.deepEqual(await privateStages(fixture.runDir), []);
    });
  }
});

test('generation authority revalidates bound artifacts immediately before receipt publication', async t => {
  const fixture = await makeFixture(t);
  await assert.rejects(publishGenerationAuthority({
    runDir: fixture.runDir,
    options: OPTIONS,
    fsImpl: {
      async afterSelectedArtifactsRead() {
        const retained = `${fixture.blueprintPath}.retained`;
        await fs.rename(fixture.blueprintPath, retained);
        await fs.writeFile(fixture.blueprintPath, 'foreign-blueprint\n');
      }
    }
  }), /GENERATION_AUTHORITY_INVALID/u);
  assert.equal(await fs.readFile(fixture.blueprintPath, 'utf8'), 'foreign-blueprint\n');
  await assert.rejects(fs.lstat(path.join(fixture.runDir, 'generation-authority.json')), { code: 'ENOENT' });
});

test('generation authority preserves a foreign same-byte receipt-stage replacement', async t => {
  const fixture = await makeFixture(t);
  await assert.rejects(publishGenerationAuthority({
    runDir: fixture.runDir,
    options: OPTIONS,
    fsImpl: {
      async afterReceiptStageWritten({ stagePath }) {
        const bytes = await fs.readFile(stagePath);
        await fs.unlink(stagePath);
        await fs.writeFile(stagePath, bytes, { mode: 0o400 });
      }
    }
  }), /GENERATION_AUTHORITY_INVALID/u);
  await assert.rejects(fs.lstat(path.join(fixture.runDir, 'generation-authority.json')), { code: 'ENOENT' });
  assert.equal((await privateStages(fixture.runDir)).length, 1);
});

test('generation authority never removes a stage replacement after final-link verification', async t => {
  const fixture = await makeFixture(t);
  await assert.rejects(publishGenerationAuthority({
    runDir: fixture.runDir,
    options: OPTIONS,
    fsImpl: {
      async afterFinalLinkVerificationBeforeStageRemoval({ stagePath }) {
        await fs.unlink(stagePath);
        await fs.writeFile(stagePath, 'foreign-final-stage\n', { mode: 0o400 });
      }
    }
  }), /GENERATION_AUTHORITY_INVALID/u);
  const receiptPath = path.join(fixture.runDir, 'generation-authority.json');
  assert.equal((await fs.lstat(receiptPath)).nlink, 1);
  assert.equal((await fs.readFile(receiptPath, 'utf8')).includes('construction-generation-authority'), true);
  const stages = await privateStages(fixture.runDir);
  assert.equal(stages.length, 1);
  assert.equal(await fs.readFile(path.join(fixture.runDir, stages[0]), 'utf8'), 'foreign-final-stage\n');
});

test('generation authority error cleanup never removes a post-verification stage replacement', async t => {
  const fixture = await makeFixture(t);
  const receiptPath = path.join(fixture.runDir, 'generation-authority.json');
  await assert.rejects(publishGenerationAuthority({
    runDir: fixture.runDir,
    options: OPTIONS,
    fsImpl: {
      async afterReceiptStageWritten() {
        await fs.writeFile(receiptPath, 'foreign-receipt\n');
      },
      async afterCleanupVerificationBeforeStageRemoval({ stagePath }) {
        await fs.unlink(stagePath);
        await fs.writeFile(stagePath, 'foreign-error-stage\n', { mode: 0o400 });
      }
    }
  }), /GENERATION_AUTHORITY_INVALID/u);
  assert.equal(await fs.readFile(receiptPath, 'utf8'), 'foreign-receipt\n');
  const stages = await privateStages(fixture.runDir);
  assert.equal(stages.length, 1);
  assert.equal(await fs.readFile(path.join(fixture.runDir, stages[0]), 'utf8'), 'foreign-error-stage\n');
});

async function makeFixture(t, { spacedParent = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'generation-authority-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runDir = path.join(root, ...(spacedParent ? ['ordinary parent', 'run'] : ['run']));
  const candidatesDir = path.join(runDir, 'candidates');
  const roundDir = path.join(candidatesDir, 'round-01');
  const selectedDir = path.join(roundDir, 'candidate-01-seed-7');
  const blueprintPath = path.join(selectedDir, 'blueprint.json');
  const buildFunctionPath = path.join(selectedDir, 'architect_datapack', 'data', 'architect', 'function', 'build.mcfunction');
  const selectionPath = path.join(runDir, 'candidate_selection.json');
  await fs.mkdir(path.dirname(buildFunctionPath), { recursive: true });
  await fs.writeFile(selectionPath, `${JSON.stringify({
    source: 'local-candidate-optimization-pipeline', active: true, candidate_optimization: true,
    base_seed: 7, candidate_count_per_round: 1, requested_round_count: 1,
    force_rounds: false, concept_count: 0, concept_strategy: 'select',
    selected_candidate_id: 'r1-c1-seed-7', selected_round: 1, selected_index: 1, selected_seed: 7,
    candidates: [{ candidate_id: 'r1-c1-seed-7', round: 1, index: 1, seed: 7, ok: true, prompt: 'p' }],
    ranking: [{ candidate_id: 'r1-c1-seed-7', rank: 1 }],
    rounds: [{ round: 1, prompt: 'p', selected_candidate_id: 'r1-c1-seed-7' }]
  }, null, 2)}\n`);
  await fs.writeFile(blueprintPath, '{}\n');
  await fs.writeFile(buildFunctionPath, '# build\n');
  return { root, runDir, candidatesDir, roundDir, selectedDir, blueprintPath, buildFunctionPath };
}

async function privateStages(runDir) {
  try { return (await fs.readdir(runDir)).filter(name => name.startsWith('.generation-authority-')); }
  catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
}
