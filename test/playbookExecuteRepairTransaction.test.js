import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { buildDeterministicShadowReview } from '../src/playbook/shadow/runShadowReview.js';
import { buildRepairTransaction, applyLayerEffects } from '../src/playbook/execute/repairTransaction.js';

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
  const acceptedChain = {
    schema_version: 1,
    candidate_id: 'candidate-01',
    chain_revision: 1,
    parent_chain_sha256: null,
    checkpoint_hashes: ['brief', 'massing', 'structure', 'roof', 'facade'].map((layer, index) => ({ layer, checkpoint_sha256: H(String.fromCharCode(97 + index)) })),
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
    layerPayloads: {
      massing: { volumes: [
        { id: 'side-b', shape: 'box', role: 'secondary-mass', scale: [4, 4, 4], placement: { relation: 'detached-right' } },
        { id: 'main', shape: 'box', role: 'primary-mass', scale: [4, 4, 4], placement: { relation: 'offset' } },
        { id: 'side-a', shape: 'box', role: 'secondary-mass', scale: [4, 4, 4], placement: { relation: 'detached-left' } }
      ] },
      structure: { structural_anchors: {
        upper: { id: 'roof-main', hash: H('a') }, frame: { id: 'frame-main', hash: H('b') }, base: { id: 'foundation-main', hash: H('c') }
      }, load_paths: [] }
    }
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
  assert.deepEqual(transaction.operations.map((patch) => patch.base_checkpoint_sha256), [H('b'), H('b'), H('c')]);
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
  input.frozenDesign.repair_variant_preferences.unshift({ repair_operation_id: 'repair:massing:resize-or-reposition-volume', variant_id: 'differentiate-equal-secondary-scale' });
  rebindFrozenAndChain(input);
  assert.throws(() => buildRepairTransaction(input), { code: 'P5_REPAIR_INVALID' });
});

test('provider-shaped fields cannot override locally derived authority', async () => {
  const input = await fixture();
  input.providerRequest = { candidate_id: 'candidate-03', rule_id: 'rule:invented', base_checkpoint_sha256: H('0') };
  const transaction = buildRepairTransaction(input);
  assert.equal(transaction.candidate_id, 'candidate-01');
  assert.equal(transaction.operations[0].rule_id, 'rule:structure.compose-three-volumes');
  assert.equal(transaction.operations[0].base_checkpoint_sha256, H('b'));
});

test('same-field writes conflict even when values equal and transaction emits no partial result', async () => {
  const input = await fixture();
  const transaction = buildRepairTransaction(input);
  const patch = transaction.operations.find((row) => row.target_layer === 'massing');
  const effect = patch.effects[0];
  assert.throws(() => applyLayerEffects({ layer: 'massing', payload: input.layerPayloads.massing, effects: [effect, { ...effect }], preconditionHashes: patch.precondition_hashes }), { code: 'P5_REPAIR_CONFLICT' });
});

test('stale bases, exhausted budget, malformed anchors, and replay-time anchor drift reject atomically', async () => {
  const staleInput = await fixture();
  staleInput.baseChainSha256 = H('0');
  assert.throws(() => buildRepairTransaction(staleInput), { code: 'P5_STALE_BASE' });
  const input = await fixture();
  input.acceptedChain.eligibility.repair_budget_used = 1;
  input.baseChainSha256 = digestCanonical(input.acceptedChain);
  assert.throws(() => buildRepairTransaction(input), { code: 'P5_REPAIR_INVALID' });
  const fresh = await fixture();
  const transaction = buildRepairTransaction(fresh);
  const structurePatch = transaction.operations.find((patch) => patch.target_layer === 'structure');
  const changed = structuredClone(fresh.layerPayloads.structure);
  changed.structural_anchors.frame.hash = H('d');
  assert.throws(() => applyLayerEffects({ layer: 'structure', payload: changed, effects: structurePatch.effects, preconditionHashes: structurePatch.precondition_hashes }), { code: 'P5_STALE_BASE' });
});

test('effect validation rejects arbitrary authority channels and noncanonical values', async () => {
  const input = await fixture();
  const transaction = buildRepairTransaction(input);
  const valid = transaction.operations[0].effects[0];
  for (const [key, value] of [
    ['path', '/volumes/0'], ['pointer', '/x'], ['coordinate', 3], ['block', 'stone'], ['command', 'fill'],
    ['score', 1], ['threshold', 2], ['unknown', true]
  ]) {
    assert.throws(() => applyLayerEffects({ layer: 'massing', payload: input.layerPayloads.massing, effects: [{ ...valid, [key]: value }], preconditionHashes: transaction.operations[0].precondition_hashes }), { code: 'P5_REPAIR_INVALID' }, key);
  }
  const scalePatch = transaction.operations.find((row) => row.effects.some((effect) => effect.type === 'set-volume-scale-axis'));
  const scaleEffect = scalePatch.effects.find((effect) => effect.type === 'set-volume-scale-axis');
  assert.throws(() => applyLayerEffects({ layer: 'massing', payload: input.layerPayloads.massing, effects: [{ ...scaleEffect, value: Infinity }], preconditionHashes: scalePatch.precondition_hashes }), { code: 'P5_REPAIR_INVALID' });
  const structurePatch = transaction.operations.find((row) => row.target_layer === 'structure');
  assert.throws(() => applyLayerEffects({ layer: 'structure', payload: input.layerPayloads.structure, effects: [{ ...structurePatch.effects[0], from: 'x'.repeat(129) }], preconditionHashes: structurePatch.precondition_hashes }), { code: 'P5_REPAIR_INVALID' });
});
