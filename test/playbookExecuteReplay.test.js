import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { BlueprintQAAgent } from '../src/construction/agents/blueprintQaAgent.js';
import { buildFrozenGeneratorContext, compileDesignLayers, prepareConstructionDesign } from '../src/construction/designStages.js';
import { chainManifestBytes, chainManifestHash, checkpointBytes, createChainManifest, createCheckpointEnvelope } from '../src/playbook/execute/checkpoints.js';
import { evaluateExecuteEligibility } from '../src/playbook/execute/eligibility.js';
import { validateRepairEvidenceRequest, validateRepairEvidenceResult, validateReplayFailureEvidence } from '../src/playbook/execute/contracts.js';
import { buildRepairTransaction } from '../src/playbook/execute/repairTransaction.js';
import { replayCandidate } from '../src/playbook/execute/replay.js';
import { admitExecuteRun, installCandidateSnapshot, readCurrentCandidateSnapshot } from '../src/playbook/execute/storage.js';
import { buildDeterministicShadowReview } from '../src/playbook/shadow/runShadowReview.js';

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
});

test('structure replay preserves brief and massing bytes and replays only structure through facade', async (t) => {
  const input = await fixture(t);
  input.transaction = structuredClone(input.transaction);
  input.transaction.operations = input.transaction.operations.filter((operation) => operation.target_layer === 'structure');
  input.transaction.earliest_target_layer = 'structure';
  input.transaction.invalidates_layers = ['roof', 'facade'];
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

test('pre-promotion replay faults preserve original pointer bytes and inode with sanitized evidence', async (t) => {
  for (const boundary of ['apply-effects', 'compile-massing', 'compile-structure', 'compile-roof', 'compile-facade', 'downstream-compile', 'blueprint', 'hard-qa', 'p4-review', 'hashing', 'stage', 'write', 'sync', 'promote', 'pointer', 'cleanup']) {
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

test('functions clients and accessors in frozen context fail closed', async (t) => {
  for (const mutate of [(x) => { x.architecture.callback = () => {}; }, (x) => { x.architecture.client = { chatJson() {} }; }, (x) => { Object.defineProperty(x.architecture, 'computed', { enumerable: true, get: () => 1 }); }]) {
    const input = await fixture(t); input.candidate.frozen_generator_context = structuredClone(input.candidate.frozen_generator_context); mutate(input.candidate.frozen_generator_context);
    await assert.rejects(replayCandidate(input), { code: 'P5_DESIGN_INVALID' });
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

async function fixture(t) {
  const root = path.join('/tmp', `p5-replay-${Date.now()}-${Math.random()}`); const runDir = path.join(root, 'run'); await fs.mkdir(runDir, { recursive: true }); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const frozenDesign = { schema_version: 1, candidate_id: 'candidate-01', seed: 7, brief_intent: 'three-volume repair', layer_intents: LAYERS.map((layer) => ({ layer, intent: `preserve ${layer}` })), selected_rule_ids: [], rejected_rule_ids: [], repair_variant_preferences: [
    { repair_operation_id: 'repair:massing:resize-or-reposition-volume', variant_id: 'center-primary-and-reattach-secondaries' },
    { repair_operation_id: 'repair:massing:strengthen-primary-volume', variant_id: 'reduce-nondominant-secondary' },
    { repair_operation_id: 'repair:structure:connect-support-path', variant_id: 'connect-known-structural-anchors' }
  ] };
  const frozenDesignHash = digest(frozenDesign);
  const prepared = await prepareConstructionDesign({ prompt: 'three-volume medieval house', mode: 'mock', outputDir: path.join(root, 'initial'), seed: 7, candidateId: 'candidate-01', frozenDesignSha256: frozenDesignHash, frozenDesign, critics: false });
  prepared.architecture = structuredClone(prepared.architecture);
  prepared.architecture.volumes = [
    { id: 'side-b', shape: 'box', role: 'secondary-mass', scale: [0.4, 0.4, 0.4], placement: { relation: 'attached-right', attach_to: 'main' } },
    { id: 'main', shape: 'box', role: 'primary-mass', scale: [0.4, 0.4, 0.4], placement: { relation: 'offset' } },
    { id: 'side-a', shape: 'box', role: 'secondary-mass', scale: [0.4, 0.4, 0.4], placement: { relation: 'attached-left', attach_to: 'main' } }
  ];
  prepared.frozen_generator_context = buildFrozenGeneratorContext({ schema_version: 1, candidate_id: 'candidate-01', seed: 7, frozen_design_sha256: frozenDesignHash, architecture: prepared.architecture, topology: prepared.topology, creative_design: prepared.creativeDesign, concept: prepared.conceptStudio?.selectedConcept || null, build_spec: prepared.buildSpec, style_preset: prepared.stylePreset, material_palette: prepared.materialPalette, template_knowledge: prepared.templateKnowledge });
  const compiled = compileDesignLayers({ prepared, resolvedEffectsByLayer: {} });
  const blueprintBytes = await fs.readFile(path.join(ROOT, 'test/fixtures/playbook-shadow/medieval-defect.json')); const blueprint = JSON.parse(blueprintBytes);
  const hardQa = new BlueprintQAAgent().run(blueprint); const p4Review = await buildDeterministicShadowReview({ projectRoot: ROOT, blueprintBytes, blueprintRelativePath: 'blueprint.json' });
  const eligibility = evaluateExecuteEligibility({ review: p4Review, hardQa: { ok: hardQa.ok }, repairBudgetUsed: 0 }); const hardQaHash = digest(hardQa); const reviewHash = digest(p4Review);
  const envelopes = [];
  for (const layer of LAYERS) envelopes.push(createCheckpointEnvelope({ build_id: 'build-01', candidate_id: 'candidate-01', layer, revision: 1, status: 'accepted', preceding_envelopes: envelopes, selected_rule_ids: [], rejected_rule_ids: [], design_intent: { layer }, recipe_fragment: { layer, payload: compiled[layer] }, field_patches: [], compiled_artifact_hashes: { layer_payload_sha256: digest(compiled[layer]) }, hard_qa: { hard_qa_ok: hardQa.ok, hard_qa_sha256: hardQaHash }, design_review: { p4_review_sha256: reviewHash }, invalidates_downstream: INVALIDATES[layer], replay_origin: null }));
  const chain = createChainManifest({ candidate_id: 'candidate-01', chain_revision: 1, parent_chain_sha256: null, checkpoint_envelopes: envelopes, frozen_design_sha256: frozenDesignHash, frozen_generator_context_sha256: digest(prepared.frozen_generator_context), blueprint_sha256: digestBytes(blueprintBytes), hard_qa_sha256: hardQaHash, p4_review_sha256: reviewHash, repair_transaction_sha256: null, eligibility, created_from: 'initial' });
  const chainHash = chainManifestHash(chain); const transaction = buildRepairTransaction({ candidateId: 'candidate-01', review: p4Review, frozenDesign, baseChainSha256: chainHash, acceptedChain: chain, checkpointEnvelopes: envelopes });
  const authority = await admitExecuteRun({ runDir }); t.after(() => authority.close());
  await installCandidateSnapshot({ authority, candidateId: 'candidate-01', expectedPreviousChainSha256: null, currentChain: chainManifestBytes(chain), files: Object.fromEntries(envelopes.map((envelope) => [`checkpoints/${envelope.checkpoint.layer}/r0001.json`, checkpointBytes(envelope)])) });
  const compilePrepared = async ({ outputDir, compiledLayers, world, datapacksDir, minecraftDir }) => {
    assert.equal(world, undefined); assert.equal(datapacksDir, undefined); assert.equal(minecraftDir, undefined);
    assert.deepEqual(compiledLayers.runtime.architecture.volumes, compiledLayers.massing.volumes);
    await fs.mkdir(path.join(outputDir, 'architect_datapack/data/architect/function'), { recursive: true }); const repairedBlueprint = structuredClone(blueprint); repairedBlueprint.replay_massing = compiledLayers.massing;
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
