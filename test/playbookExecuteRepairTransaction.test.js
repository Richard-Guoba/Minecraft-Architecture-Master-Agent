import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { buildDeterministicShadowReview } from '../src/playbook/shadow/runShadowReview.js';
import { buildRepairTransaction, applyLayerEffects } from '../src/playbook/execute/repairTransaction.js';
import { createCheckpointEnvelope } from '../src/playbook/execute/checkpoints.js';
import { validateRepairTransaction } from '../src/playbook/execute/contracts.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const H = (letter) => letter.repeat(64);

async function fixture() {
  const bytes = await fs.readFile(path.join(ROOT, 'test/fixtures/playbook-shadow/medieval-defect.json'));
  const review = await buildDeterministicShadowReview({ projectRoot: ROOT, blueprintBytes: bytes, blueprintRelativePath: 'blueprint.json' });
  const frozenDesign = {
    schema_version: 1, candidate_id: 'candidate-01', seed: 7, brief_intent: 'three-volume repair',
    layer_intents: ['brief', 'massing', 'structure', 'roof', 'facade'].map((layer) => ({ layer, intent: `preserve ${layer}` })),
    selected_rule_ids: [], rejected_rule_ids: [],
    repair_variant_preferences: [
      { repair_operation_id: 'repair:massing:resize-or-reposition-volume', variant_id: 'center-primary-and-reattach-secondaries' },
      { repair_operation_id: 'repair:massing:strengthen-primary-volume', variant_id: 'reduce-nondominant-secondary' },
      { repair_operation_id: 'repair:structure:connect-support-path', variant_id: 'connect-known-structural-anchors' }
    ]
  };
  const layerPayloads = {
    brief: { typology: 'house', style_family: 'medieval' },
    massing: { volumes: [
      { id: 'side-b', shape: 'box', role: 'secondary-mass', scale: [0.4, 0.4, 0.4], placement: { relation: 'attached-right', attach_to: 'main' } },
      { id: 'main', shape: 'box', role: 'primary-mass', scale: [0.4, 0.4, 0.4], placement: { relation: 'offset' } },
      { id: 'side-a', shape: 'box', role: 'secondary-mass', scale: [0.4, 0.4, 0.4], placement: { relation: 'attached-left', attach_to: 'main' } }
    ] },
    structure: { roof_frame: { strategy: 'roof-main' }, system: 'frame-main', foundation: { strategy: 'foundation-main' }, load_paths: [] },
    roof: { overhang: 1 }, facade: { bays: [] }
  };
  const checkpointEnvelopes = checkpointFixtures(layerPayloads, digestCanonical(review));
  const acceptedChain = {
    schema_version: 1,
    candidate_id: 'candidate-01',
    chain_revision: 1,
    parent_chain_sha256: null,
    checkpoint_hashes: checkpointEnvelopes.map((envelope) => ({ layer: envelope.checkpoint.layer, checkpoint_sha256: envelope.checkpoint_sha256 })),
    frozen_design_sha256: digestCanonical(frozenDesign),
    frozen_generator_context_sha256: H('7'),
    blueprint_sha256: H('8'),
    hard_qa_sha256: H('9'),
    p4_review_sha256: digestCanonical(review),
    repair_transaction_sha256: null,
    eligibility: {
      status: 'unresolved-core-violation', hard_qa_ok: true,
      unresolved_violated_core_rule_ids: ['rule:structure.compose-three-volumes'],
      neutral_unknown_rule_ids: [], neutral_not_applicable_rule_ids: [], repair_budget_used: 0
    },
    created_from: 'initial'
  };
  return {
    candidateId: 'candidate-01',
    review,
    frozenDesign,
    baseChainSha256: digestCanonical(acceptedChain),
    acceptedChain,
    checkpointEnvelopes
  };
}

test('transaction constructs local requests, preserves corpus order inside layer order, and binds one original chain', async () => {
  const input = await fixture();
  const transaction = buildRepairTransaction(input);
  assert.deepEqual(Object.keys(transaction), ['schema_version', 'compiler_version', 'candidate_id', 'base_chain_sha256', 'repair_budget', 'earliest_target_layer', 'operations', 'invalidates_layers']);
  assert.equal(transaction.repair_budget, 1);
  assert.equal(transaction.earliest_target_layer, 'massing');
  assert.deepEqual(transaction.operations.map((patch) => patch.rule_id), [
    'rule:structure.compose-three-volumes',
    'rule:structure.create-primary-secondary-hierarchy',
    'rule:medieval.show-load-path'
  ]);
  assert.deepEqual(transaction.operations.map((patch) => patch.base_checkpoint_sha256), [input.acceptedChain.checkpoint_hashes[1].checkpoint_sha256, input.acceptedChain.checkpoint_hashes[1].checkpoint_sha256, input.acceptedChain.checkpoint_hashes[2].checkpoint_sha256]);
  assert.equal(transaction.base_chain_sha256, input.baseChainSha256);
  assert.deepEqual(transaction.invalidates_layers, ['structure', 'roof', 'facade']);
  assert.equal(Object.isFrozen(transaction.operations[0].effects), true);
});

function digestCanonical(value) {
  const sort = (item) => Array.isArray(item)
    ? item.map(sort)
    : item && typeof item === 'object'
      ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, sort(item[key])]))
      : item;
  return createHash('sha256').update(`${JSON.stringify(sort(value), null, 2)}\n`).digest('hex');
}

function rebindFrozenAndChain(input) {
  input.acceptedChain.frozen_design_sha256 = digestCanonical(input.frozenDesign);
  input.baseChainSha256 = digestCanonical(input.acceptedChain);
}

test('omitted preference invokes deterministic default while explicit inapplicable preference does not fall back', async () => {
  const input = await fixture();
  input.frozenDesign.repair_variant_preferences.shift();
  rebindFrozenAndChain(input);
  const transaction = buildRepairTransaction(input);
  assert.equal(transaction.operations[0].variant_id, 'center-primary-and-reattach-secondaries');
  input.frozenDesign.repair_variant_preferences.find((row) => row.repair_operation_id === 'repair:massing:strengthen-primary-volume').variant_id = 'promote-largest-stable';
  rebindFrozenAndChain(input);
  assert.throws(() => buildRepairTransaction(input), { code: 'P5_REPAIR_INVALID' });
});

test('provider-shaped fields cannot override locally derived authority', async () => {
  const input = await fixture();
  input.providerRequest = { candidate_id: 'candidate-03', rule_id: 'rule:invented', base_checkpoint_sha256: H('0') };
  const transaction = buildRepairTransaction(input);
  assert.equal(transaction.candidate_id, 'candidate-01');
  assert.equal(transaction.operations[0].rule_id, 'rule:structure.compose-three-volumes');
  assert.equal(transaction.operations[0].base_checkpoint_sha256, input.acceptedChain.checkpoint_hashes[1].checkpoint_sha256);
});

test('same-field writes conflict even when values equal and transaction emits no partial result', async () => {
  const input = await fixture();
  const transaction = buildRepairTransaction(input);
  const patch = transaction.operations.find((row) => row.target_layer === 'massing');
  const effect = patch.effects[0];
  const conflict = structuredClone(patch); conflict.effects = [effect, { ...effect }];
  assert.throws(() => applyLayerEffects({ payload: input.checkpointEnvelopes[1].checkpoint.recipe_fragment.payload, operations: [conflict] }), { code: 'P5_REPAIR_CONFLICT' });
  const direct = structuredClone(transaction);
  const scale = direct.operations[1].effects[0];
  direct.operations[0].variant_id = 'differentiate-equal-secondary-scale';
  direct.operations[0].effects = [{ ...scale }];
  assert.throws(() => validateRepairTransaction(direct), { code: 'P5_REPAIR_CONFLICT' });
});

test('stale bases, exhausted budget, malformed anchors, and replay-time anchor drift reject atomically', async () => {
  const staleInput = await fixture();
  staleInput.baseChainSha256 = H('0');
  assert.throws(() => buildRepairTransaction(staleInput), { code: 'P5_STALE_BASE' });
  const input = await fixture();
  Object.assign(input.acceptedChain, {
    chain_revision: 2,
    parent_chain_sha256: H('8'),
    repair_transaction_sha256: H('9'),
    created_from: 'replay'
  });
  input.acceptedChain.eligibility.repair_budget_used = 1;
  input.baseChainSha256 = digestCanonical(input.acceptedChain);
  assert.throws(() => buildRepairTransaction(input), { code: 'P5_REPAIR_INVALID' });
  const fresh = await fixture();
  const transaction = buildRepairTransaction(fresh);
  const structurePatch = transaction.operations.find((patch) => patch.target_layer === 'structure');
  const changed = structuredClone(fresh.checkpointEnvelopes[2].checkpoint.recipe_fragment.payload);
  changed.system = 'changed-frame';
  assert.throws(() => applyLayerEffects({ payload: changed, operations: [structurePatch] }), { code: 'P5_STALE_BASE' });
});

test('effect validation rejects arbitrary authority channels and noncanonical values', async () => {
  const input = await fixture();
  const transaction = buildRepairTransaction(input);
  const valid = transaction.operations[0].effects[0];
  for (const [key, value] of [
    ['path', '/volumes/0'], ['pointer', '/x'], ['coordinate', 3], ['block', 'stone'], ['command', 'fill'],
    ['score', 1], ['threshold', 2], ['unknown', true]
  ]) {
    const attack = structuredClone(transaction.operations[0]); attack.effects = [{ ...valid, [key]: value }];
    assert.throws(() => applyLayerEffects({ payload: input.checkpointEnvelopes[1].checkpoint.recipe_fragment.payload, operations: [attack] }), { code: 'P5_REPAIR_INVALID' }, key);
  }
  const scalePatch = transaction.operations.find((row) => row.effects.some((effect) => effect.type === 'set-volume-scale-axis'));
  const scaleEffect = scalePatch.effects.find((effect) => effect.type === 'set-volume-scale-axis');
  const scaleAttack = structuredClone(scalePatch); scaleAttack.effects = [{ ...scaleEffect, value: Infinity }];
  assert.throws(() => applyLayerEffects({ payload: input.checkpointEnvelopes[1].checkpoint.recipe_fragment.payload, operations: [scaleAttack] }), { code: 'P5_REPAIR_INVALID' });
  const structurePatch = transaction.operations.find((row) => row.target_layer === 'structure');
  const structureAttack = structuredClone(structurePatch); structureAttack.effects = [{ ...structurePatch.effects[0], from: 'x'.repeat(129) }];
  assert.throws(() => applyLayerEffects({ payload: input.checkpointEnvelopes[2].checkpoint.recipe_fragment.payload, operations: [structureAttack] }), { code: 'P5_REPAIR_INVALID' });
});

test('transaction rejects detached payload authority and every checkpoint splice or drift', async () => {
  const input = await fixture();
  input.layerPayloads = { massing: { volumes: [{ id: 'caller-invented' }] } };
  assert.throws(() => buildRepairTransaction(input), { code: 'P5_REPAIR_INVALID' });
  for (const mutate of [
    (x) => { [x.checkpointEnvelopes[1], x.checkpointEnvelopes[2]] = [x.checkpointEnvelopes[2], x.checkpointEnvelopes[1]]; },
    (x) => { x.checkpointEnvelopes[1] = structuredClone(x.checkpointEnvelopes[1]); x.checkpointEnvelopes[1].checkpoint.recipe_fragment.payload.volumes[0].id = 'spliced'; },
    (x) => { x.checkpointEnvelopes[1] = structuredClone(x.checkpointEnvelopes[1]); x.checkpointEnvelopes[1].checkpoint_sha256 = H('0'); },
    (x) => { x.acceptedChain.checkpoint_hashes[1].checkpoint_sha256 = H('0'); x.baseChainSha256 = digestCanonical(x.acceptedChain); }
  ]) {
    const attacked = await fixture(); mutate(attacked);
    assert.throws(() => buildRepairTransaction(attacked), { code: /P5_(?:CHECKPOINT_INVALID|STALE_BASE)/u });
  }
});

function checkpointFixtures(payloads, reviewHash) {
  const result = [];
  const invalidates = { brief: ['massing', 'structure', 'roof', 'facade'], massing: ['structure', 'roof', 'facade'], structure: ['roof', 'facade'], roof: ['facade'], facade: [] };
  for (const layer of ['brief', 'massing', 'structure', 'roof', 'facade']) {
    result.push(createCheckpointEnvelope({
      build_id: 'build-01', candidate_id: 'candidate-01', layer, revision: 1, status: 'accepted', preceding_envelopes: result,
      selected_rule_ids: [], rejected_rule_ids: [], design_intent: {}, recipe_fragment: { layer, payload: payloads[layer] }, field_patches: [],
      compiled_artifact_hashes: { artifact: H('1') }, hard_qa: { hard_qa_ok: true, hard_qa_sha256: H('9') },
      design_review: { p4_review_sha256: reviewHash }, invalidates_downstream: invalidates[layer], replay_origin: null
    }));
  }
  return result;
}
