import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { BlueprintQAAgent } from '../src/construction/agents/blueprintQaAgent.js';
import { runPipeline } from '../src/pipeline.js';
import { prepareP6BaselineAuthority } from '../src/playbook/p6/baselineAuthority.js';
import { P6_FIXED_REQUEST } from '../src/playbook/p6/constants.js';
import { buildDeterministicShadowReview } from '../src/playbook/shadow/runShadowReview.js';
import { sha256, stableJson } from '../src/playbook/shadow/canonical.js';
import { parseP6Args, runP6Cli } from '../src/runArchitecturePlaybookP6.js';

const ROOT = path.resolve(import.meta.dirname, '..');

test('offline baseline authority snapshots the exact selected off run and recomputes bound evidence', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-baseline-authority-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const result = await runPipeline({
    prompt: P6_FIXED_REQUEST.prompt,
    mode: 'mock', seed: P6_FIXED_REQUEST.root_seed,
    outRoot: path.join(temp, 'source'), cwd: ROOT,
    candidates: 3, candidateRounds: 1, candidateForceRounds: false,
    concepts: 0, conceptStrategy: 'select', critics: false,
    coarseVoxelMode: 'off', coarseVoxelProvider: 'baseline',
    neuralRetrieval: false, playbook: 'off', mcVersion: '1.21'
  });
  const sourceRun = result.outputDir;
  const baselineRun = path.join(temp, 'authority');
  const selected = JSON.parse(await fs.readFile(path.join(sourceRun, 'candidate_selection.json')));
  const selectedDir = path.join(sourceRun, 'candidates', 'round-01',
    `candidate-${String(selected.selected_index).padStart(2, '0')}-seed-${selected.selected_seed}`);
  const sourceBlueprint = await fs.readFile(path.join(selectedDir, 'blueprint.json'));
  const sourceBuild = await fs.readFile(path.join(selectedDir, 'architect_datapack', 'data', 'architect', 'function', 'build.mcfunction'));

  const publication = await prepareP6BaselineAuthority({ projectRoot: ROOT, sourceRun, baselineRun });
  assert.equal(publication.status, 'created');
  const manifestBytes = await fs.readFile(path.join(baselineRun, 'p6-baseline-authority.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.kind, 'p6-baseline-authority');
  assert.equal(JSON.stringify(manifest).includes(temp), false);
  assert.deepEqual(Object.keys(manifest.files).sort(), ['blueprint', 'build_function', 'hard_qa', 'operations', 'review']);
  const readBound = name => fs.readFile(path.join(baselineRun, manifest.files[name].relative_path));
  assert.deepEqual(await readBound('blueprint'), sourceBlueprint);
  assert.deepEqual(await readBound('build_function'), sourceBuild);
  const blueprint = JSON.parse(sourceBlueprint);
  assert.deepEqual(await readBound('operations'), Buffer.from(stableJson(blueprint.operations)));
  assert.deepEqual(await readBound('hard_qa'), Buffer.from(stableJson(new BlueprintQAAgent().run(blueprint))));
  assert.deepEqual(await readBound('review'), Buffer.from(stableJson(await buildDeterministicShadowReview({
    projectRoot: ROOT, blueprintBytes: sourceBlueprint, blueprintRelativePath: 'blueprint.json'
  }))));
  for (const binding of Object.values(manifest.files)) {
    assert.equal(binding.sha256, sha256(await fs.readFile(path.join(baselineRun, binding.relative_path))));
    assert.equal((await fs.lstat(path.join(baselineRun, binding.relative_path))).nlink, 1);
  }

  assert.deepEqual(parseP6Args(['prepare-baseline-authority', '--source-run', sourceRun, '--baseline-run', path.join(temp, 'second')]), {
    action: 'prepare-baseline-authority', sourceRun, baselineRun: path.join(temp, 'second')
  });
  const cli = await runP6Cli(['prepare-baseline-authority', '--source-run', sourceRun, '--baseline-run', path.join(temp, 'second')]);
  assert.equal(cli.status, 'baseline-authority-prepared');

  const rerankedRun = path.join(temp, 'reranked-source');
  await fs.cp(sourceRun, rerankedRun, { recursive: true });
  const rerankedPath = path.join(rerankedRun, 'candidate_selection.json');
  const reranked = JSON.parse(await fs.readFile(rerankedPath));
  [reranked.ranking[0], reranked.ranking[1]] = [reranked.ranking[1], reranked.ranking[0]];
  await fs.writeFile(rerankedPath, `${JSON.stringify(reranked, null, 2)}\n`);
  await assert.rejects(prepareP6BaselineAuthority({
    projectRoot: ROOT, sourceRun: rerankedRun, baselineRun: path.join(temp, 'reranked-authority')
  }), { code: 'P6_AUTHORITY_INVALID' });

  const linkedParent = path.join(temp, 'linked-parent');
  const realParent = path.join(temp, 'real-parent');
  await fs.mkdir(path.join(realParent, 'nested'), { recursive: true });
  await fs.symlink(realParent, linkedParent);
  await assert.rejects(prepareP6BaselineAuthority({
    projectRoot: ROOT, sourceRun, baselineRun: path.join(linkedParent, 'nested', 'authority')
  }), { code: 'P6_AUTHORITY_INVALID' });
  await assert.rejects(fs.lstat(path.join(realParent, 'nested', 'authority')), { code: 'ENOENT' });

  for (const kind of ['symlink', 'hardlink']) {
    const unsafeRun = path.join(temp, `${kind}-source`);
    await fs.cp(sourceRun, unsafeRun, { recursive: true });
    const unsafeBuild = path.join(unsafeRun, 'candidates', 'round-01',
      `candidate-${String(selected.selected_index).padStart(2, '0')}-seed-${selected.selected_seed}`,
      'architect_datapack', 'data', 'architect', 'function', 'build.mcfunction');
    const retained = `${unsafeBuild}.retained`;
    await fs.rename(unsafeBuild, retained);
    if (kind === 'symlink') await fs.symlink(path.basename(retained), unsafeBuild);
    else await fs.link(retained, unsafeBuild);
    await assert.rejects(prepareP6BaselineAuthority({
      projectRoot: ROOT, sourceRun: unsafeRun, baselineRun: path.join(temp, `${kind}-authority`)
    }), { code: 'P6_AUTHORITY_INVALID' });
  }
});

test('baseline authority refuses an existing target before touching it', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-baseline-collision-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const target = path.join(temp, 'authority');
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'foreign.txt'), 'keep');
  await assert.rejects(prepareP6BaselineAuthority({ projectRoot: ROOT, sourceRun: path.join(temp, 'missing'), baselineRun: target }), { code: 'P6_AUTHORITY_INVALID' });
  assert.equal(await fs.readFile(path.join(target, 'foreign.txt'), 'utf8'), 'keep');
});
