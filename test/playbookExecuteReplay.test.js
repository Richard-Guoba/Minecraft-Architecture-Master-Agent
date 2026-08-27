import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BlueprintQAAgent } from '../src/construction/agents/blueprintQaAgent.js';
import { buildFrozenGeneratorContext, compileDesignLayers, prepareConstructionDesign } from '../src/construction/designStages.js';
import { chainManifestBytes, chainManifestHash, checkpointBytes, createChainManifest, createCheckpointEnvelope } from '../src/playbook/execute/checkpoints.js';
import { evaluateExecuteEligibility } from '../src/playbook/execute/eligibility.js';
import { validateRepairEvidenceRequest, validateRepairEvidenceResult, validateReplayFailureEvidence } from '../src/playbook/execute/contracts.js';
import { buildRepairTransaction } from '../src/playbook/execute/repairTransaction.js';
import { compileMassingRepair } from '../src/playbook/execute/repairCompilers/massing.js';
import { replayCandidate } from '../src/playbook/execute/replay.js';
import { admitExecuteRun, installCandidateSnapshot, readCurrentCandidateSnapshot } from '../src/playbook/execute/storage.js';
import { buildDeterministicShadowReview } from '../src/playbook/shadow/runShadowReview.js';
import { validateCandidateFiles } from '../src/playbook/execute/storageValidation.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const LAYERS = ['brief', 'massing', 'structure', 'roof', 'facade'];
const INVALIDATES = { brief: ['massing', 'structure', 'roof', 'facade'], massing: ['structure', 'roof', 'facade'], structure: ['roof', 'facade'], roof: ['facade'], facade: [] };

test('massing replay preserves brief and replaces the exact target suffix once', async (t) => {
  const input = await fixture(t);
  const result = await replayCandidate(input);
  assert.equal(result.status, 'complete');
  assert.deepEqual(Object.keys(result), ['status', 'candidate_id', 'base_chain_sha256', 'repair_transaction_sha256', 'current_chain_sha256', 'current_chain', 'checkpoint_envelopes', 'compiled_result', 'hard_qa', 'p4_review', 'playbook_eligibility', 'evidence']);
  assert.deepEqual(result.checkpoint_envelopes[0], input.candidate.checkpoint_envelopes[0]);
  assert.notEqual(result.checkpoint_envelopes[1].checkpoint_sha256, input.candidate.checkpoint_envelopes[1].checkpoint_sha256);
  for (let index = 1; index < LAYERS.length; index += 1) {
    const checkpoint = result.checkpoint_envelopes[index].checkpoint;
    assert.equal(checkpoint.revision, input.candidate.checkpoint_envelopes[index].checkpoint.revision + 1);
    assert.deepEqual(checkpoint.replay_origin, { kind: 'replay', base_chain_sha256: input.transaction.base_chain_sha256, repair_transaction_sha256: result.repair_transaction_sha256 });
  }
  assert.equal(result.current_chain.parent_chain_sha256, input.transaction.base_chain_sha256);
  assert.equal(result.current_chain.chain_revision, 2);
  assert.equal(result.current_chain.eligibility.repair_budget_used, 1);
  assert.equal(result.playbook_eligibility.status, 'hard-qa-failed');
  assert.equal(result.current_chain_sha256, chainManifestHash(result.current_chain));
  assert.deepEqual(Object.keys(result.evidence), ['repair_request_sha256', 'repair_result_sha256']);
  assert.equal(result.checkpoint_envelopes[4].checkpoint.compiled_artifact_hashes.repair_result_sha256, result.evidence.repair_result_sha256);
  assert.deepEqual(Object.keys(result.checkpoint_envelopes[4].checkpoint.compiled_artifact_hashes).sort(), [
    'build_function_sha256', 'datapack_tree_sha256', 'layer_payload_sha256',
    'operation_list_sha256', 'repair_result_sha256'
  ]);
  const artifactHashes = result.checkpoint_envelopes[4].checkpoint.compiled_artifact_hashes;
  assert.equal(artifactHashes.operation_list_sha256, digest(result.compiled_result.blueprint.operations));
  assert.equal(artifactHashes.build_function_sha256, await fileDigest(result.compiled_result.artifacts.buildFunction));
  assert.equal(artifactHashes.datapack_tree_sha256, await authorityTreeDigest(result.compiled_result.artifacts.datapackDir));
  const installed = await readCurrentCandidateSnapshot({ authority: input.authority, candidateId: 'candidate-01' });
  assert.equal(installed.current_chain_sha256, result.current_chain_sha256);
  for (const name of ['repairs/attempt-01-request.json', 'repairs/attempt-01-patch.json', 'repairs/attempt-01-result.json']) assert.ok(installed.files[name]);
});

test('replay is provider-free and deterministic across roots', async (t) => {
  const left = await fixture(t); const right = await fixture(t);
  for (const input of [left, right]) input.candidate.prepared_design.llmClient = Object.freeze({ name: 'must-not-run', isConfigured: () => true, chatJson: () => { throw new Error('provider-created-during-replay'); } });
  left.compilePrepared = undefined; right.compilePrepared = undefined;
  const [a, b] = await Promise.all([replayCandidate(left), replayCandidate(right)]);
  assert.equal(a.current_chain_sha256, b.current_chain_sha256);
  assert.deepEqual(a.current_chain.checkpoint_hashes, b.current_chain.checkpoint_hashes);
  assert.equal(digest(a.compiled_result.blueprint), digest(b.compiled_result.blueprint));
  assert.equal(await fileDigest(a.compiled_result.artifacts.blueprint), await fileDigest(b.compiled_result.artifacts.blueprint));
  assert.equal(digest(a.compiled_result.blueprint.operations), digest(b.compiled_result.blueprint.operations));
  assert.equal(await fileDigest(a.compiled_result.artifacts.buildFunction), await fileDigest(b.compiled_result.artifacts.buildFunction));
  assert.equal(await treeDigest(a.compiled_result.artifacts.datapackDir), await treeDigest(b.compiled_result.artifacts.datapackDir));
  for (const field of ['operation_list_sha256', 'build_function_sha256', 'datapack_tree_sha256']) {
    assert.equal(a.checkpoint_envelopes[4].checkpoint.compiled_artifact_hashes[field], b.checkpoint_envelopes[4].checkpoint.compiled_artifact_hashes[field]);
  }
});

test('restart replay reconstructs from disk authority without a runtime candidate object', async (t) => {
  const input = await fixture(t);
  const result = await replayCandidate({
    authority: input.authority,
    candidateId: 'candidate-01',
    transaction: input.transaction,
    projectRoot: input.projectRoot,
    compilePrepared: input.compilePrepared
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.candidate_id, 'candidate-01');
});

test('disk-only replay restores active Concept Studio and Stage 7 authority without providers', async (t) => {
  const input = await fixture(t, { activeContext: true });
  assert.ok(input.candidate.frozen_generator_context.concept_studio);
  assert.ok(input.candidate.frozen_generator_context.stage7_shadow);
  const compile = input.compilePrepared;
  let observed = false;
  const result = await replayCandidate({
    authority: input.authority,
    candidateId: 'candidate-01',
    transaction: input.transaction,
    projectRoot: input.projectRoot,
    compilePrepared: async (options) => {
      observed = true;
      assert.equal(options.prepared.conceptStudio.selected_concept_id,
        input.candidate.frozen_generator_context.concept_studio.selected_concept_id);
      assert.equal(options.prepared.stage7Shadow.condition.condition_hash,
        input.candidate.frozen_generator_context.stage7_shadow.condition.condition_hash);
      assert.equal(options.prepared.llmClient, undefined);
      return compile(options);
    }
  });
  assert.equal(observed, true);
  assert.equal(result.status, 'complete');
});

test('every persisted output-bearing context field is hash-bound to the accepted chain', async (t) => {
  const input = await fixture(t);
  const stored = await readCurrentCandidateSnapshot({
    authority: input.authority,
    candidateId: 'candidate-01'
  });
  const contextPath = 'frozen/frozen-generator-context.json';
  const mutations = {
    seed: (value) => value + 1,
    frozen_design_sha256: () => '0'.repeat(64),
    architecture: (value) => ({ ...value, compatibility_marker: true }),
    topology: (value) => ({ ...value, compatibility_marker: true }),
    creative_design: (value) => ({ ...value, compatibility_marker: true }),
    concept_studio: (value) => value ? { ...value, compatibility_marker: true } : { active: true },
    stage7_shadow: (value) => value ? { ...value, compatibility_marker: true } : { active: true },
    build_spec: (value) => ({ ...value, compatibility_marker: true }),
    style_preset: (value) => ({ ...value, compatibility_marker: true }),
    material_palette: (value) => ({ ...value, compatibility_marker: true }),
    template_knowledge: (value) => ({ ...value, compatibility_marker: true }),
    prompt: (value) => `${value} changed`,
    mode: () => 'auto',
    mc_version: (value) => `${value}.1`,
    seed_source: (value) => `${value}-changed`,
    concept_count: () => 1,
    concept_strategy: () => 'fuse',
    critics: (value) => !value,
    neural_retrieval: (value) => !value,
    coarse_voxel_mode: () => 'shadow',
    coarse_voxel_provider: () => 'artifact',
    llm_provider: (value) => `${value}-changed`,
    llm_usage: (value) => ({ ...value, compatibility_marker: true })
  };
  for (const [field, mutate] of Object.entries(mutations)) {
    const context = JSON.parse(stored.files[contextPath]);
    context[field] = mutate(context[field]);
    const files = Object.fromEntries(Object.entries(stored.files).map(([name, body]) => [
      name,
      name === contextPath ? Buffer.from(stable(context)) : Buffer.from(body)
    ]));
    assert.throws(
      () => validateCandidateFiles('candidate-01', files, 'P5_OUTPUT_OWNERSHIP'),
      { code: 'P5_OUTPUT_OWNERSHIP' },
      field
    );
  }
});

test('successful replay uses run-owned workspace and creates no p5 replay temp residue', async (t) => {
  const before = new Set((await fs.readdir(os.tmpdir())).filter((name) => name.startsWith('p5-replay-candidate-')));
  const input = await fixture(t);
  const result = await replayCandidate(input);
  const after = (await fs.readdir(os.tmpdir())).filter((name) => name.startsWith('p5-replay-candidate-') && !before.has(name));
  assert.deepEqual(after, []);
  assert.equal(path.relative(input.runDir, result.compiled_result.outputDir).startsWith('..'), false);
});

test('structure replay preserves brief and massing bytes and replays only structure through facade', async (t) => {
  const input = await fixture(t, { structureOnly: true });
  assert.equal(input.transaction.earliest_target_layer, 'structure');
  assert.deepEqual(input.transaction.operations.map((operation) => operation.target_layer), ['structure']);
  const result = await replayCandidate(input);
  assert.deepEqual(result.checkpoint_envelopes.slice(0, 2), input.candidate.checkpoint_envelopes.slice(0, 2));
  for (let index = 2; index < LAYERS.length; index += 1) {
    assert.equal(result.checkpoint_envelopes[index].checkpoint.revision, 2);
    assert.notEqual(result.checkpoint_envelopes[index].checkpoint_sha256, input.candidate.checkpoint_envelopes[index].checkpoint_sha256);
  }
});

test('default replay recompiles through the production provider-free downstream seam without installation', async (t) => {
  const input = await fixture(t); input.compilePrepared = undefined;
  const result = await replayCandidate(input);
  assert.equal(result.compiled_result.workflow, 'construction_method_v1');
  assert.equal(result.compiled_result.artifacts.installedDatapackDir, undefined);
  assert.equal(result.compiled_result.blueprint.architecture.volumes[0].placement.relation, 'attached-right');
  assert.equal(result.current_chain.blueprint_sha256, await fileDigest(result.compiled_result.artifacts.blueprint));
});

test('actual replay compiler applicator QA review and hash faults preserve the original pointer', async (t) => {
  for (const boundary of ['apply-effects', 'compile-massing', 'compile-structure', 'compile-roof', 'compile-facade', 'downstream-compile', 'blueprint', 'hard-qa', 'p4-review', 'hashing']) {
    const input = await fixture(t);
    const currentPath = path.join(input.runDir, 'playbook-execute/candidates/candidate-01/current-chain.json');
    const beforeBytes = await fs.readFile(currentPath); const beforeStat = await fs.stat(currentPath);
    const unrelatedPath = path.join(input.runDir, 'world-region.bin'); await fs.writeFile(unrelatedPath, Buffer.from([0, 1, 2, 255]));
    input.faultInjector = (name) => { if (name === boundary) throw new Error(`secret:${boundary}:${input.runDir}`); };
    await assert.rejects(replayCandidate(input), { code: /P5_(?:REPLAY_FAILED|INSTALL_FAILED)/u }, boundary);
    assert.deepEqual(await fs.readFile(currentPath), beforeBytes, boundary);
    assert.equal((await fs.stat(currentPath)).ino, beforeStat.ino, boundary);
    assert.deepEqual(await fs.readFile(unrelatedPath), Buffer.from([0, 1, 2, 255]), boundary);
    const failure = JSON.parse(await fs.readFile(path.join(input.runDir, 'playbook-execute/candidates/candidate-01/failures/attempt-01.json')));
    assert.deepEqual(Object.keys(failure), ['attempt', 'base_chain_sha256', 'candidate_id', 'code', 'current_chain_sha256', 'repair_transaction_sha256', 'schema_version']);
    assert.equal(failure.current_chain_sha256, failure.base_chain_sha256);
    assert.equal(JSON.stringify(failure).includes('secret:'), false);
  }
});

test('actual candidate storage precommit faults preserve the original pointer bytes and inode', async (t) => {
  for (const category of ['exclusiveWrite', 'chmod', 'fileSync', 'directorySync', 'bodyRename', 'pointerWrite', 'backupLink', 'pointerRename']) {
    const input = await fixture(t);
    const currentPath = path.join(input.runDir, 'playbook-execute/candidates/candidate-01/current-chain.json');
    const beforeBytes = await fs.readFile(currentPath); const beforeStat = await fs.stat(currentPath);
    input.fsImpl = replayStorageFs({ failCategory: category, failAt: 1 });
    await assert.rejects(replayCandidate(input), { code: 'P5_INSTALL_FAILED' }, category);
    assert.deepEqual(await fs.readFile(currentPath), beforeBytes, category);
    assert.equal((await fs.stat(currentPath)).ino, beforeStat.ino, category);
    assert.equal((await readCurrentCandidateSnapshot({ authority: input.authority, candidateId: 'candidate-01' })).current_chain_sha256, input.transaction.base_chain_sha256);
  }
});

test('candidate retirement cleanup faults are postcommit and keep the replay generation authoritative', async (t) => {
  const input = await fixture(t);
  const result = await replayCandidate({ ...input, fsImpl: replayStorageFs({ failCategory: 'cleanup', failAt: 1 }) });
  assert.equal(result.status, 'complete');
  const current = await readCurrentCandidateSnapshot({ authority: input.authority, candidateId: 'candidate-01' });
  assert.equal(current.current_chain_sha256, result.current_chain_sha256);
  assert.notEqual(current.current_chain_sha256, input.transaction.base_chain_sha256);
});

test('runtime-only frozen-context lookalikes cannot override persisted replay authority', async (t) => {
  for (const mutate of [(x) => { x.architecture.callback = () => {}; }, (x) => { x.architecture.client = { chatJson() {} }; }, (x) => { Object.defineProperty(x.architecture, 'computed', { enumerable: true, get: () => 1 }); }]) {
    const input = await fixture(t);
    input.candidate.frozen_generator_context = structuredClone(input.candidate.frozen_generator_context);
    mutate(input.candidate.frozen_generator_context);
    await assert.rejects(replayCandidate(input), { code: 'P5_AUTHORITY_INVALID' });
  }
});

test('repair and failure evidence contracts reject every extra field and cross-hash drift', async (t) => {
  const input = await fixture(t); const result = await replayCandidate(input);
  const installed = await readCurrentCandidateSnapshot({ authority: input.authority, candidateId: 'candidate-01' });
  const request = JSON.parse(installed.files['repairs/attempt-01-request.json']);
  const repairResult = JSON.parse(installed.files['repairs/attempt-01-result.json']);
  for (const [validator, value] of [
    [validateRepairEvidenceRequest, request], [validateRepairEvidenceResult, repairResult],
    [validateReplayFailureEvidence, { schema_version: 1, candidate_id: 'candidate-01', attempt: 1, code: 'P5_REPLAY_FAILED', base_chain_sha256: result.current_chain_sha256, repair_transaction_sha256: result.repair_transaction_sha256, current_chain_sha256: result.current_chain_sha256 }]
  ]) {
    assert.throws(() => validator({ ...value, provider_message: 'secret' }), { code: /P5_(?:REPAIR_INVALID|REPLAY_FAILED)/u });
  }
  const files = Object.fromEntries(Object.entries(installed.files).filter(([name]) => name !== 'current-chain.json' && name !== 'chains/chain-0002.json'));
  repairResult.repair_request_sha256 = '0'.repeat(64);
  files['repairs/attempt-01-result.json'] = Buffer.from(stable(repairResult));
  await assert.rejects(installCandidateSnapshot({ authority: input.authority, candidateId: 'candidate-01', files, currentChain: chainManifestBytes(result.current_chain), expectedPreviousChainSha256: result.current_chain_sha256 }), { code: /P5_(?:CHECKPOINT_INVALID|AUTHORITY_INVALID|REPAIR_INVALID)/u });
});

test('storage rejects missing extra and malformed facade artifact authority keys', async (t) => {
  for (const mutate of [
    (hashes) => { delete hashes.operation_list_sha256; },
    (hashes) => { hashes.provider_hash = 'a'.repeat(64); },
    (hashes) => { hashes.datapack_tree_sha256 = 'short'; }
  ]) {
    const input = await fixture(t); const result = await replayCandidate(input);
    const installed = await readCurrentCandidateSnapshot({ authority: input.authority, candidateId: 'candidate-01' });
    const files = Object.fromEntries(Object.entries(installed.files).filter(([name]) => name !== 'current-chain.json' && name !== 'chains/chain-0002.json'));
    const facadePath = 'checkpoints/facade/r0002.json'; const facade = JSON.parse(files[facadePath]);
    mutate(facade.compiled_artifact_hashes);
    const facadeHash = digest(facade); files[facadePath] = Buffer.from(stable(facade));
    const chain = structuredClone(result.current_chain); chain.checkpoint_hashes[4].checkpoint_sha256 = facadeHash;
    await assert.rejects(installCandidateSnapshot({
      authority: input.authority, candidateId: 'candidate-01', files,
      currentChain: Buffer.from(stable(chain)), expectedPreviousChainSha256: result.current_chain_sha256
    }), { code: /P5_(?:CHECKPOINT_INVALID|AUTHORITY_INVALID|REPAIR_INVALID)/u });
  }
});

test('replay validates the exact candidate authority chain and transaction before compilation', async (t) => {
  for (const mutate of [
    (input) => { input.candidate.provider_patch = {}; },
    (input) => { input.candidate.hard_qa = structuredClone(input.candidate.hard_qa); input.candidate.hard_qa.errors.push('drift'); },
    (input) => { input.transaction = structuredClone(input.transaction); input.transaction.base_chain_sha256 = '0'.repeat(64); },
    (input) => { input.candidate.checkpoint_envelopes = structuredClone(input.candidate.checkpoint_envelopes); input.candidate.checkpoint_envelopes[1].checkpoint.recipe_fragment.payload.volumes[0].id = 'drift'; }
  ]) {
    const input = await fixture(t); mutate(input);
    await assert.rejects(replayCandidate(input), { code: /P5_(?:AUTHORITY_INVALID|STALE_BASE|CHECKPOINT_INVALID)/u });
  }
});

test('replay rejects a valid transaction that omits an authoritative executable violation', async (t) => {
  const input = await fixture(t);
  input.transaction = structuredClone(input.transaction);
  input.transaction.operations.pop();
  const invalidated = new Set(input.transaction.operations.flatMap((operation) => operation.invalidates_layers));
  input.transaction.invalidates_layers = LAYERS.filter((layer) => invalidated.has(layer));
  await assert.rejects(replayCandidate(input), { code: 'P5_REPAIR_INVALID' });
});

test('replay rejects a valid operation for a rule that is not violated by the authoritative review', async (t) => {
  const input = await fixture(t);
  const massing = input.candidate.checkpoint_envelopes[1].checkpoint.recipe_fragment.payload;
  const operation = compileMassingRepair({ request: {
    schema_version: 1, candidate_id: 'candidate-01',
    rule_id: 'rule:structure.keep-support-volumes-subordinate',
    repair_operation_id: 'repair:massing:reduce-support-volume-prominence',
    variant_id: 'reduce-attached-support-scale',
    base_checkpoint_sha256: input.candidate.current_chain.checkpoint_hashes[1].checkpoint_sha256
  }, layerPayload: massing });
  input.transaction = {
    schema_version: 1, compiler_version: 1, candidate_id: 'candidate-01',
    base_chain_sha256: input.transaction.base_chain_sha256, repair_budget: 1,
    earliest_target_layer: 'massing', operations: [operation],
    invalidates_layers: ['structure', 'roof', 'facade']
  };
  await assert.rejects(replayCandidate(input), { code: 'P5_REPAIR_INVALID' });
});

test('replay rejects a locally valid variant that drifts the frozen repair preference', async (t) => {
  const input = await fixture(t);
  const massing = input.candidate.checkpoint_envelopes[1].checkpoint.recipe_fragment.payload;
  const operation = compileMassingRepair({ request: {
    schema_version: 1, candidate_id: 'candidate-01',
    rule_id: 'rule:structure.compose-three-volumes',
    repair_operation_id: 'repair:massing:resize-or-reposition-volume',
    variant_id: 'differentiate-equal-secondary-scale',
    base_checkpoint_sha256: input.candidate.current_chain.checkpoint_hashes[1].checkpoint_sha256
  }, layerPayload: massing });
  input.transaction = {
    schema_version: 1, compiler_version: 1, candidate_id: 'candidate-01',
    base_chain_sha256: input.transaction.base_chain_sha256, repair_budget: 1,
    earliest_target_layer: 'massing', operations: [operation],
    invalidates_layers: ['structure', 'roof', 'facade']
  };
  await assert.rejects(replayCandidate(input), { code: 'P5_REPAIR_INVALID' });
});

test('artifact hashing rejects a datapack symlink swap before candidate promotion', async (t) => {
  const input = await fixture(t); const original = input.compilePrepared; let compiled;
  input.compilePrepared = async (options) => { compiled = await original(options); return compiled; };
  input.faultInjector = async (boundary) => {
    if (boundary !== 'hashing') return;
    const target = path.join(compiled.artifacts.datapackDir, 'pack.mcmeta');
    const outside = path.join(input.runDir, 'foreign-pack.mcmeta');
    await fs.writeFile(outside, 'foreign'); await fs.unlink(target); await fs.symlink(outside, target);
  };
  const before = await readCurrentCandidateSnapshot({ authority: input.authority, candidateId: 'candidate-01' });
  await assert.rejects(replayCandidate(input), { code: 'P5_REPLAY_FAILED' });
  const after = await readCurrentCandidateSnapshot({ authority: input.authority, candidateId: 'candidate-01' });
  assert.equal(after.current_chain_sha256, before.current_chain_sha256);
});

test('artifact hashing rejects blueprint object and byte mutations before candidate promotion', async (t) => {
  for (const kind of ['object', 'bytes']) {
    const input = await fixture(t); const original = input.compilePrepared; let compiled;
    input.compilePrepared = async (options) => { compiled = await original(options); return compiled; };
    input.faultInjector = async (boundary) => {
      if (boundary !== 'hashing') return;
      if (kind === 'object') compiled.blueprint.operations.push({ op: 'foreign-mutation' });
      else await fs.writeFile(compiled.artifacts.blueprint, '{"foreign":"mutation"}\n');
    };
    const before = await readCurrentCandidateSnapshot({ authority: input.authority, candidateId: 'candidate-01' });
    await assert.rejects(replayCandidate(input), { code: 'P5_REPLAY_FAILED' }, kind);
    const after = await readCurrentCandidateSnapshot({ authority: input.authority, candidateId: 'candidate-01' });
    assert.equal(after.current_chain_sha256, before.current_chain_sha256, kind);
  }
});

async function fixture(t, { structureOnly = false, activeContext = false } = {}) {
  const root = path.join('/tmp', `p5-replay-${Date.now()}-${Math.random()}`); const runDir = path.join(root, 'run'); await fs.mkdir(runDir, { recursive: true }); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const frozenDesign = { schema_version: 1, candidate_id: 'candidate-01', seed: 7, brief_intent: 'three-volume repair', layer_intents: LAYERS.map((layer) => ({ layer, intent: `preserve ${layer}` })), selected_rule_ids: [], rejected_rule_ids: [], repair_variant_preferences: [
    { repair_operation_id: 'repair:massing:resize-or-reposition-volume', variant_id: 'center-primary-and-reattach-secondaries' },
    { repair_operation_id: 'repair:massing:strengthen-primary-volume', variant_id: 'reduce-nondominant-secondary' },
    { repair_operation_id: 'repair:structure:connect-support-path', variant_id: 'connect-known-structural-anchors' }
  ] };
  const frozenDesignHash = digest(frozenDesign);
  const prepared = await prepareConstructionDesign({
    prompt: 'three-volume medieval house', mode: 'mock', outputDir: path.join(root, 'initial'),
    seed: 7, candidateId: 'candidate-01', frozenDesignSha256: frozenDesignHash, frozenDesign,
    critics: false,
    conceptCount: activeContext ? 2 : 0,
    conceptStrategy: activeContext ? 'fuse' : 'select',
    coarseVoxelMode: activeContext ? 'shadow' : 'off',
    coarseVoxelProvider: 'baseline'
  });
  prepared.architecture = structuredClone(prepared.architecture);
  prepared.architecture.volumes = [
    { id: 'side-b', shape: 'box', role: 'secondary-mass', scale: [0.4, 0.4, 0.4], placement: { relation: 'attached-right', attach_to: 'main' } },
    { id: 'main', shape: 'box', role: 'primary-mass', scale: [0.4, 0.4, 0.4], placement: { relation: 'offset' } },
    { id: 'side-a', shape: 'box', role: 'secondary-mass', scale: [0.4, 0.4, 0.4], placement: { relation: 'attached-left', attach_to: 'main' } }
  ];
  prepared.frozen_generator_context = buildFrozenGeneratorContext({
    ...structuredClone(prepared.frozen_generator_context),
    architecture: prepared.architecture
  });
  const compiled = compileDesignLayers({ prepared, resolvedEffectsByLayer: {} });
  let blueprintBytes = await fs.readFile(path.join(ROOT, `test/fixtures/playbook-shadow/${structureOnly ? 'medieval-positive' : 'medieval-defect'}.json`));
  const blueprint = JSON.parse(blueprintBytes);
  blueprint.seed = 7;
  if (structureOnly) {
    blueprint.structure.load_paths = [];
  }
  blueprintBytes = Buffer.from(`${JSON.stringify(blueprint, null, 2)}\n`);
  const hardQa = new BlueprintQAAgent().run(blueprint); const p4Review = await buildDeterministicShadowReview({ projectRoot: ROOT, blueprintBytes, blueprintRelativePath: 'blueprint.json' });
  const eligibility = evaluateExecuteEligibility({ review: p4Review, hardQa: { ok: hardQa.ok }, repairBudgetUsed: 0 }); const hardQaHash = digest(hardQa); const reviewHash = digest(p4Review);
  const envelopes = [];
  for (const layer of LAYERS) envelopes.push(createCheckpointEnvelope({ build_id: 'build-01', candidate_id: 'candidate-01', layer, revision: 1, status: 'accepted', preceding_envelopes: envelopes, selected_rule_ids: [], rejected_rule_ids: [], design_intent: { layer }, recipe_fragment: { layer, payload: compiled[layer] }, field_patches: [], compiled_artifact_hashes: { layer_payload_sha256: digest(compiled[layer]) }, hard_qa: { hard_qa_ok: hardQa.ok, hard_qa_sha256: hardQaHash }, design_review: { p4_review_sha256: reviewHash }, invalidates_downstream: INVALIDATES[layer], replay_origin: null }));
  const chain = createChainManifest({ candidate_id: 'candidate-01', chain_revision: 1, parent_chain_sha256: null, checkpoint_envelopes: envelopes, frozen_design_sha256: frozenDesignHash, frozen_generator_context_sha256: digest(prepared.frozen_generator_context), blueprint_sha256: digestBytes(blueprintBytes), hard_qa_sha256: hardQaHash, p4_review_sha256: reviewHash, repair_transaction_sha256: null, eligibility, created_from: 'initial' });
  const chainHash = chainManifestHash(chain); const transaction = buildRepairTransaction({ candidateId: 'candidate-01', review: p4Review, frozenDesign, baseChainSha256: chainHash, acceptedChain: chain, checkpointEnvelopes: envelopes });
  const authority = await admitExecuteRun({ runDir }); t.after(() => authority.close());
  await installCandidateSnapshot({ authority, candidateId: 'candidate-01', expectedPreviousChainSha256: null, currentChain: chainManifestBytes(chain), files: {
    ...Object.fromEntries(envelopes.map((envelope) => [`checkpoints/${envelope.checkpoint.layer}/r0001.json`, checkpointBytes(envelope)])),
    'frozen/frozen-design.json': Buffer.from(stable(frozenDesign)),
    'frozen/frozen-generator-context.json': Buffer.from(stable(prepared.frozen_generator_context)),
    'blueprints/chain-0001.json': Buffer.from(blueprintBytes),
    'reviews/chain-0001-hard-qa.json': Buffer.from(stable(hardQa)),
    'reviews/chain-0001-review.json': Buffer.from(stable(p4Review))
  } });
  const compilePrepared = async ({ outputDir, compiledLayers, world, datapacksDir, minecraftDir }) => {
    assert.equal(world, undefined); assert.equal(datapacksDir, undefined); assert.equal(minecraftDir, undefined);
    assert.deepEqual(compiledLayers.runtime.architecture.volumes, compiledLayers.massing.volumes);
    await fs.mkdir(path.join(outputDir, 'architect_datapack/data/architect/function'), { recursive: true }); const repairedBlueprint = structuredClone(blueprint); repairedBlueprint.operations ||= []; repairedBlueprint.replay_massing = compiledLayers.massing;
    const blueprintPath = path.join(outputDir, 'blueprint.json'); const buildFunction = path.join(outputDir, 'architect_datapack/data/architect/function/build.mcfunction');
    await fs.writeFile(blueprintPath, `${JSON.stringify(repairedBlueprint, null, 2)}\n`); await fs.writeFile(buildFunction, `${JSON.stringify(compiledLayers.massing)}\n`); await fs.writeFile(path.join(outputDir, 'architect_datapack/pack.mcmeta'), '{"pack":{"pack_format":48,"description":"replay"}}\n');
    return { blueprint: repairedBlueprint, validation: new BlueprintQAAgent().run(repairedBlueprint), artifacts: { blueprint: blueprintPath, buildFunction, datapackDir: path.join(outputDir, 'architect_datapack') } };
  };
  return { authority, projectRoot: ROOT, compilePrepared, runDir, transaction, candidate: { candidate_id: 'candidate-01', seed: 7, frozen_design: frozenDesign, frozen_generator_context: prepared.frozen_generator_context, prepared_design: prepared, current_chain: chain, checkpoint_envelopes: envelopes, initial_result: { blueprint }, hard_qa: hardQa, p4_review: p4Review, playbook_eligibility: eligibility } };
}

function digest(value) { return digestBytes(Buffer.from(stable(value))); }
function digestBytes(value) { return createHash('sha256').update(value).digest('hex'); }
function stable(value) { const sort = (item) => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, sort(item[key])])) : item; return `${JSON.stringify(sort(value), null, 2)}\n`; }
async function fileDigest(filename) { return digestBytes(await fs.readFile(filename)); }
async function treeDigest(root) { const names = []; async function walk(current, prefix = '') { for (const entry of (await fs.readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) { const relative = prefix ? `${prefix}/${entry.name}` : entry.name; if (entry.isDirectory()) await walk(path.join(current, entry.name), relative); else names.push(`${relative}:${await fileDigest(path.join(current, entry.name))}`); } } await walk(root); return digest(names); }
async function authorityTreeDigest(root) { const rows = []; async function walk(current, prefix = '') { for (const entry of (await fs.readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) { const relative = prefix ? `${prefix}/${entry.name}` : entry.name; if (entry.isDirectory()) await walk(path.join(current, entry.name), relative); else rows.push({ path: `architect_datapack/${relative}`, sha256: await fileDigest(path.join(current, entry.name)) }); } } await walk(root); return digest(rows); }

function replayStorageFs({ failCategory, failAt }) {
  const counts = {};
  const tick = (category) => {
    counts[category] = (counts[category] ?? 0) + 1;
    if (category === failCategory && counts[category] === failAt) throw new Error(`RAW_REPLAY_STORAGE_${category}`);
  };
  return fsWith({
    async open(target, flags, ...args) {
      const targetText = String(target); const inStage = await pathContainsGeneratedName(targetText, '.playbook-execute.stage-');
      if (inStage && (flags & constants.O_WRONLY) !== 0) tick('exclusiveWrite');
      const handle = await fs.open(target, flags, ...args); const isDirectory = (await handle.stat()).isDirectory();
      return wrapFileHandle(handle, {
        async chmod(...chmodArgs) { if (inStage) tick('chmod'); return handle.chmod(...chmodArgs); },
        async writeFile(...writeArgs) {
          if (inStage && isCurrentChainPointer(writeArgs[0])) tick('pointerWrite');
          return handle.writeFile(...writeArgs);
        },
        async sync(...syncArgs) {
          if (inStage && !isDirectory) tick('fileSync');
          if (isDirectory && path.basename(targetText) === 'candidate-01') tick('directorySync');
          return handle.sync(...syncArgs);
        }
      });
    },
    async renameNoReplaceBetween(sourceHandle, sourceName, destinationHandle, destinationName, next) {
      if (sourceName.startsWith('.playbook-execute.stage-') && destinationName === 'current-chain.json') tick('pointerRename');
      else if (sourceName.startsWith('.playbook-execute.stage-')) tick('bodyRename');
      return next(sourceHandle, sourceName, destinationHandle, destinationName);
    },
    async link(source, destination) {
      if (path.basename(String(source)) === 'current-chain.json'
        && path.basename(String(destination)).startsWith('.playbook-execute.backup-')) tick('backupLink');
      return fs.link(source, destination);
    },
    async rename(source, destination) {
      if (path.basename(String(source)).startsWith('.playbook-execute.stage-')
        && path.basename(String(destination)) === 'current-chain.json') tick('pointerRename');
      return fs.rename(source, destination);
    },
    async unlink(target) { if (await pathContainsGeneratedName(String(target), '.playbook-execute.backup-')) tick('cleanup'); return fs.unlink(target); }
  });
}

function isCurrentChainPointer(value) {
  try {
    const parsed = JSON.parse(Buffer.from(value).toString('utf8'));
    return Object.keys(parsed).sort().join(',') === 'candidate_id,chain_revision,chain_sha256,schema_version';
  } catch { return false; }
}

function fsWith(overrides) { return new Proxy(fs, { get(target, property) { return Object.hasOwn(overrides, property) ? overrides[property] : Reflect.get(target, property); } }); }
function wrapFileHandle(handle, overrides) { return new Proxy(handle, { get(target, property) { if (Object.hasOwn(overrides, property)) return overrides[property]; const value = Reflect.get(target, property, target); return typeof value === 'function' ? value.bind(target) : value; } }); }
async function pathContainsGeneratedName(target, prefix) { if (target.includes(prefix)) return true; const match = target.match(/^\/proc\/self\/fd\/(\d+)(?:\/|$)/u); if (!match) return false; try { return (await fs.readlink(`/proc/self/fd/${match[1]}`)).includes(prefix); } catch { return false; } }
