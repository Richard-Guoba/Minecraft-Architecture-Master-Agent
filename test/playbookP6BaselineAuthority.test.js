import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

test('baseline crash worker skips execution when test discovery supplies no job', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-baseline-crash-discovery-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [
    path.join(ROOT, 'test', 'fixtures', 'crashP6BaselinePublication.js')
  ], { cwd: temp, encoding: 'utf8', timeout: 30_000 });

  assert.deepEqual({
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr
  }, { status: 0, signal: null, stdout: '', stderr: '' });
  assert.deepEqual(await fs.readdir(temp), []);
});

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
    neuralRetrieval: false, playbook: 'off', mcVersion: '1.21.9'
  });
  const sourceRun = result.outputDir;
  const generationAuthorityBytes = await fs.readFile(path.join(sourceRun, 'generation-authority.json'));
  const generationAuthority = JSON.parse(generationAuthorityBytes);
  assert.equal(generationAuthority.kind, 'construction-generation-authority');
  assert.equal(generationAuthority.options.minecraft_version, '1.21.9');
  assert.equal(generationAuthority.options.playbook, 'off');
  const baselineRun = path.join(temp, 'authority');
  const selected = JSON.parse(await fs.readFile(path.join(sourceRun, 'candidate_selection.json')));
  const selectedDir = path.join(sourceRun, 'candidates', 'round-01',
    `candidate-${String(selected.selected_index).padStart(2, '0')}-seed-${selected.selected_seed}`);
  const sourceBlueprint = await fs.readFile(path.join(selectedDir, 'blueprint.json'));
  const sourceBuild = await fs.readFile(path.join(selectedDir, 'architect_datapack', 'data', 'architect', 'function', 'build.mcfunction'));
  assert.match(sourceBuild.toString('utf8'), /minecraft:iron_chain/u);
  assert.doesNotMatch(sourceBuild.toString('utf8'), /minecraft:chain(?:\[|\s|$)/u);

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

  const legacyRun = path.join(temp, 'legacy-source');
  await fs.cp(sourceRun, legacyRun, { recursive: true });
  const legacyReceiptPath = path.join(legacyRun, 'generation-authority.json');
  const legacyReceipt = JSON.parse(await fs.readFile(legacyReceiptPath));
  legacyReceipt.options.minecraft_version = '1.21';
  delete legacyReceipt.authority_sha256;
  legacyReceipt.authority_sha256 = sha256(stableJson(legacyReceipt));
  await fs.chmod(legacyReceiptPath, 0o600);
  await fs.writeFile(legacyReceiptPath, Buffer.from(stableJson(legacyReceipt)));
  await assert.rejects(prepareP6BaselineAuthority({
    projectRoot: ROOT, sourceRun: legacyRun, baselineRun: path.join(temp, 'legacy-authority')
  }), { code: 'P6_AUTHORITY_INVALID' });

  const legacyBuildRun = path.join(temp, 'legacy-build-source');
  await fs.cp(sourceRun, legacyBuildRun, { recursive: true });
  const legacyBuildReceiptPath = path.join(legacyBuildRun, 'generation-authority.json');
  const legacyBuildReceipt = JSON.parse(await fs.readFile(legacyBuildReceiptPath));
  const legacyBuildPath = path.join(legacyBuildRun, ...legacyBuildReceipt.files.build_function.relative_path.split('/'));
  const legacyBuildBytes = Buffer.from((await fs.readFile(legacyBuildPath, 'utf8'))
    .replaceAll('minecraft:iron_chain', 'minecraft:chain'));
  await fs.chmod(legacyBuildPath, 0o600);
  await fs.writeFile(legacyBuildPath, legacyBuildBytes);
  legacyBuildReceipt.files.build_function.sha256 = sha256(legacyBuildBytes);
  delete legacyBuildReceipt.authority_sha256;
  legacyBuildReceipt.authority_sha256 = sha256(stableJson(legacyBuildReceipt));
  await fs.chmod(legacyBuildReceiptPath, 0o600);
  await fs.writeFile(legacyBuildReceiptPath, Buffer.from(stableJson(legacyBuildReceipt)));
  await assert.rejects(prepareP6BaselineAuthority({
    projectRoot: ROOT, sourceRun: legacyBuildRun, baselineRun: path.join(temp, 'legacy-build-authority')
  }), { code: 'P6_AUTHORITY_INVALID' });

  for (const [label, mutate] of [
    ['neural', receipt => { receipt.options.neural_retrieval = true; }],
    ['coarse-mode', receipt => { receipt.options.coarse_voxel_mode = 'shadow'; }],
    ['coarse-plan', receipt => { receipt.options.coarse_voxel_plan = { resolution: 8 }; }]
  ]) {
    const driftRun = path.join(temp, `${label}-source`);
    await fs.cp(sourceRun, driftRun, { recursive: true });
    const receiptPath = path.join(driftRun, 'generation-authority.json');
    const driftReceipt = JSON.parse(await fs.readFile(receiptPath));
    mutate(driftReceipt);
    delete driftReceipt.authority_sha256;
    driftReceipt.authority_sha256 = sha256(stableJson(driftReceipt));
    await fs.chmod(receiptPath, 0o600);
    await fs.writeFile(receiptPath, Buffer.from(stableJson(driftReceipt)));
    await assert.rejects(prepareP6BaselineAuthority({
      projectRoot: ROOT, sourceRun: driftRun, baselineRun: path.join(temp, `${label}-authority`)
    }), { code: 'P6_AUTHORITY_INVALID' });
  }

  const replacedRun = path.join(temp, 'replaced-source');
  const retainedRun = path.join(temp, 'replaced-source-retained');
  await fs.cp(sourceRun, replacedRun, { recursive: true });
  await assert.rejects(prepareP6BaselineAuthority({
    projectRoot: ROOT, sourceRun: replacedRun, baselineRun: path.join(temp, 'replaced-authority'),
    fsImpl: {
      async afterGenerationAuthorityRead() {
        await fs.rename(replacedRun, retainedRun);
        await fs.mkdir(replacedRun);
      }
    }
  }), { code: 'P6_AUTHORITY_INVALID' });
  await assert.rejects(fs.lstat(path.join(temp, 'replaced-authority')), { code: 'ENOENT' });

  const partialTarget = path.join(temp, 'partial-authority');
  await assert.rejects(prepareP6BaselineAuthority({
    projectRoot: ROOT, sourceRun, baselineRun: partialTarget,
    fsImpl: {
      async afterStageFileWritten({ name }) {
        if (name === 'blueprint.json') throw new Error('injected partial publication failure');
      }
    }
  }), { code: 'P6_AUTHORITY_INVALID' });
  await assert.rejects(fs.lstat(partialTarget), { code: 'ENOENT' });
  assert.deepEqual((await fs.readdir(temp)).filter(name => name.startsWith('.p6-baseline-stage-')), [],
    'an unchanged partial owned stage is cleaned after publication failure');

  const failedTarget = path.join(temp, 'failed-authority');
  await assert.rejects(prepareP6BaselineAuthority({
    projectRoot: ROOT, sourceRun, baselineRun: failedTarget,
    fsImpl: {
      async afterStageFilesWritten() { throw new Error('injected publication failure'); }
    }
  }), { code: 'P6_AUTHORITY_INVALID' });
  await assert.rejects(fs.lstat(failedTarget), { code: 'ENOENT' });
  assert.deepEqual((await fs.readdir(temp)).filter(name => name.startsWith('.p6-baseline-stage-')), [],
    'an unchanged owned stage is cleaned after publication failure');

  const postPromotionTarget = path.join(temp, 'post-promotion-authority');
  await assert.rejects(prepareP6BaselineAuthority({
    projectRoot: ROOT, sourceRun, baselineRun: postPromotionTarget,
    fsImpl: {
      async afterAuthorityPromotion() {
        const filename = path.join(postPromotionTarget, 'build.mcfunction');
        const sameBytes = await fs.readFile(filename);
        await fs.unlink(filename);
        await fs.writeFile(filename, sameBytes, { mode: 0o400 });
      }
    }
  }), { code: 'P6_AUTHORITY_INVALID' });
  assert.equal((await fs.lstat(path.join(postPromotionTarget, 'build.mcfunction'))).isFile(), true,
    'a foreign post-promotion replacement is preserved');

  const crashTarget = path.join(temp, 'crash-authority');
  const crash = spawnSync(process.execPath, [path.join(ROOT, 'test', 'fixtures', 'crashP6BaselinePublication.js'),
    ROOT, sourceRun, crashTarget], { cwd: ROOT, encoding: 'utf8', timeout: 30_000 });
  assert.equal(crash.signal, 'SIGKILL');
  await assert.rejects(fs.lstat(crashTarget), { code: 'ENOENT' });
  const crashStages = (await fs.readdir(temp)).filter(name => name.startsWith('.p6-baseline-stage-'));
  assert.equal(crashStages.length, 1);
  assert.equal((await fs.lstat(path.join(temp, crashStages[0], '.p6-baseline-owned.json'))).isFile(), true);
  const recoveredTarget = path.join(temp, 'recovered-authority');
  assert.equal((await prepareP6BaselineAuthority({ projectRoot: ROOT, sourceRun,
    baselineRun: recoveredTarget })).status, 'created');

  const swappedTarget = path.join(temp, 'swapped-authority');
  await assert.rejects(prepareP6BaselineAuthority({
    projectRoot: ROOT, sourceRun, baselineRun: swappedTarget,
    fsImpl: {
      async afterStageFilesWritten({ stagePath }) {
        const filename = path.join(stagePath, 'blueprint.json');
        const sameBytes = await fs.readFile(filename);
        await fs.unlink(filename);
        await fs.writeFile(filename, sameBytes, { mode: 0o400 });
      }
    }
  }), { code: 'P6_AUTHORITY_INVALID' });
  await assert.rejects(fs.lstat(swappedTarget), { code: 'ENOENT' });
  const preservedStages = (await fs.readdir(temp)).filter(name => name.startsWith('.p6-baseline-stage-'));
  assert.equal(preservedStages.length, 2, 'crash residue and foreign replacement are preserved for inspection');
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
