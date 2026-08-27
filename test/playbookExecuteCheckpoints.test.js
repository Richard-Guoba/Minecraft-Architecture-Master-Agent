import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  chainManifestBytes,
  chainManifestHash,
  checkpointBytes,
  createChainManifest,
  createCheckpointEnvelope,
  createEligibilityRecord
} from '../src/playbook/execute/checkpoints.js';
import { validateCheckpointPayload } from '../src/playbook/execute/contracts.js';

const LAYERS = ['brief', 'massing', 'structure', 'roof', 'facade'];
const INVALIDATES = Object.freeze({
  brief: ['massing', 'structure', 'roof', 'facade'],
  massing: ['structure', 'roof', 'facade'],
  structure: ['roof', 'facade'],
  roof: ['facade'],
  facade: []
});
const FIXTURE_HASHES = Object.freeze(Object.fromEntries(LAYERS.map((layer, index) => [layer, String(index + 1).repeat(64)])));
const ARTIFACT_HASH = 'a'.repeat(64);
const QA_HASH = 'b'.repeat(64);
const REVIEW_HASH = 'c'.repeat(64);
const DESIGN_HASH = 'd'.repeat(64);
const CONTEXT_HASH = 'e'.repeat(64);
const BLUEPRINT_HASH = 'f'.repeat(64);

test('validates the five-layer fixture with independent fixed upstream hashes', () => {
  const payloads = LAYERS.map((layer) => checkpointPayloadFixture(layer));
  assert.deepEqual(payloads.map((payload) => payload.upstream_accepted_hashes), [
    [],
    [{ layer: 'brief', checkpoint_sha256: FIXTURE_HASHES.brief }],
    [
      { layer: 'brief', checkpoint_sha256: FIXTURE_HASHES.brief },
      { layer: 'massing', checkpoint_sha256: FIXTURE_HASHES.massing }
    ],
    [
      { layer: 'brief', checkpoint_sha256: FIXTURE_HASHES.brief },
      { layer: 'massing', checkpoint_sha256: FIXTURE_HASHES.massing },
      { layer: 'structure', checkpoint_sha256: FIXTURE_HASHES.structure }
    ],
    [
      { layer: 'brief', checkpoint_sha256: FIXTURE_HASHES.brief },
      { layer: 'massing', checkpoint_sha256: FIXTURE_HASHES.massing },
      { layer: 'structure', checkpoint_sha256: FIXTURE_HASHES.structure },
      { layer: 'roof', checkpoint_sha256: FIXTURE_HASHES.roof }
    ]
  ]);
  for (const payload of payloads) assert.deepEqual(validateCheckpointPayload(payload), payload);
});

test('creates five canonical envelopes with locally derived ordered upstream rows', () => {
  const envelopes = buildEnvelopes();
  const hashes = Object.fromEntries(envelopes.map((envelope) => [envelope.checkpoint.layer, envelope.checkpoint_sha256]));

  assert.deepEqual(envelopes.map((envelope) => envelope.checkpoint.upstream_accepted_hashes), [
    [],
    [{ layer: 'brief', checkpoint_sha256: hashes.brief }],
    [
      { layer: 'brief', checkpoint_sha256: hashes.brief },
      { layer: 'massing', checkpoint_sha256: hashes.massing }
    ],
    [
      { layer: 'brief', checkpoint_sha256: hashes.brief },
      { layer: 'massing', checkpoint_sha256: hashes.massing },
      { layer: 'structure', checkpoint_sha256: hashes.structure }
    ],
    [
      { layer: 'brief', checkpoint_sha256: hashes.brief },
      { layer: 'massing', checkpoint_sha256: hashes.massing },
      { layer: 'structure', checkpoint_sha256: hashes.structure },
      { layer: 'roof', checkpoint_sha256: hashes.roof }
    ]
  ]);
  assert.ok(Object.isFrozen(envelopes[4]));
  assert.ok(Object.isFrozen(envelopes[4].checkpoint));
});

test('hashes the checkpoint body only from P4 canonical UTF-8 bytes', () => {
  const envelope = createCheckpointEnvelope(checkpointInput('brief'));
  const literalCanonicalPayload = `{
  "build_id": "build-01",
  "candidate_id": "candidate-01",
  "compiled_artifact_hashes": {
    "layer_payload_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "design_intent": {
    "layer": "brief",
    "purpose": "brief-intent"
  },
  "design_review": {
    "p4_review_sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  },
  "field_patches": [],
  "hard_qa": {
    "hard_qa_ok": true,
    "hard_qa_sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  },
  "invalidates_downstream": [
    "massing",
    "structure",
    "roof",
    "facade"
  ],
  "layer": "brief",
  "playbook_version": "0.1.0",
  "recipe_fragment": {
    "layer": "brief",
    "payload": {
      "intent": "brief-recipe"
    }
  },
  "rejected_rule_ids": [
    "rule:facade.break-repetitive-bays"
  ],
  "replay_origin": null,
  "revision": 1,
  "schema_version": 1,
  "selected_rule_ids": [
    "rule:medieval.show-load-path"
  ],
  "status": "accepted",
  "upstream_accepted_hashes": []
}\n`;
  const expectedHash = createHash('sha256').update(Buffer.from(literalCanonicalPayload, 'utf8')).digest('hex');

  assert.equal(envelope.checkpoint_sha256, expectedHash);
  assert.deepEqual(checkpointBytes(envelope), Buffer.from(literalCanonicalPayload, 'utf8'));
  assert.equal(envelope.checkpoint.checkpoint_sha256, undefined);
});

test('rejects checkpoint mutations across lifecycle, layer ownership, and hash authority', () => {
  const valid = checkpointInput('structure');
  valid.preceding_envelopes = buildEnvelopes().slice(0, 2);
  const cases = [
    ['revision', (value) => { value.revision = 0; }],
    ['status', (value) => { value.status = 'eligible'; }],
    ['upstream order', (value) => { value.preceding_envelopes.reverse(); }],
    ['selected/rejected overlap', (value) => { value.rejected_rule_ids = [...value.selected_rule_ids]; }],
    ['layer-owned recipe', (value) => { value.recipe_fragment.layer = 'roof'; }],
    ['field-patch type', (value) => { value.field_patches = {}; }],
    ['hard-QA hash', (value) => { value.hard_qa.hard_qa_sha256 = 'g'.repeat(64); }],
    ['review hash', (value) => { value.design_review.p4_review_sha256 = 'g'.repeat(64); }],
    ['replay origin', (value) => { value.replay_origin = { kind: 'replay', base_chain_sha256: DESIGN_HASH }; }],
    ['invalidation array', (value) => { value.invalidates_downstream = []; }]
  ];

  for (const [name, mutate] of cases) {
    const input = clone(valid);
    mutate(input);
    assert.throws(() => createCheckpointEnvelope(input), { code: 'P5_CHECKPOINT_INVALID' }, name);
  }

  const envelope = createCheckpointEnvelope(valid);
  const selfHash = clone(envelope);
  selfHash.checkpoint_sha256 = '0'.repeat(64);
  assert.throws(() => checkpointBytes(selfHash), { code: 'P5_CHECKPOINT_INVALID' });
});

test('rejects a well-formed transitive ancestry spliced from another accepted history', () => {
  const primary = buildEnvelopes();
  const alternateBrief = createCheckpointEnvelope({
    ...checkpointInput('brief'),
    revision: 2,
    design_intent: { layer: 'brief', purpose: 'alternate-brief-intent' }
  });
  const alternateMassingInput = checkpointInput('massing');
  alternateMassingInput.preceding_envelopes = [alternateBrief];
  const alternateMassing = createCheckpointEnvelope(alternateMassingInput);
  const splicedStructure = checkpointInput('structure');
  splicedStructure.preceding_envelopes = [primary[0], alternateMassing];

  assert.throws(() => createCheckpointEnvelope(splicedStructure), { code: 'P5_CHECKPOINT_INVALID' });
});

test('creates an immutable canonical chain with all five checkpoint hashes', () => {
  const checkpoints = buildEnvelopes();
  const chain = createChainManifest(chainInput(checkpoints));

  assert.deepEqual(chain.checkpoint_hashes, checkpoints.map(({ checkpoint, checkpoint_sha256 }) => ({
    layer: checkpoint.layer,
    checkpoint_sha256
  })));
  assert.ok(Object.isFrozen(chain));
  assert.ok(Object.isFrozen(chain.eligibility));
  assert.equal(chainManifestHash(chain), createHash('sha256').update(chainManifestBytes(chain)).digest('hex'));
});

test('rejects chain parent and checkpoint authority mutations', () => {
  const checkpoints = buildEnvelopes();
  const badParent = chainInput(checkpoints);
  badParent.parent_chain_sha256 = 'g'.repeat(64);
  assert.throws(() => createChainManifest(badParent), { code: 'P5_CHECKPOINT_INVALID' });

  const missing = chainInput(checkpoints.slice(0, -1));
  assert.throws(() => createChainManifest(missing), { code: 'P5_CHECKPOINT_INVALID' });

  for (const field of ['hard_qa_sha256', 'p4_review_sha256']) {
    const mismatch = chainInput(checkpoints);
    mismatch[field] = field === 'hard_qa_sha256' ? ARTIFACT_HASH : DESIGN_HASH;
    assert.throws(() => createChainManifest(mismatch), { code: 'P5_CHECKPOINT_INVALID' }, field);
  }
});

test('rejects arbitrary and semantically inconsistent chain provenance', () => {
  const checkpoints = buildEnvelopes();
  const cases = [
    ['arbitrary created_from', (input) => { input.created_from = 'anything'; }],
    ['initial parent', (input) => { input.parent_chain_sha256 = DESIGN_HASH; }],
    ['initial transaction', (input) => { input.repair_transaction_sha256 = CONTEXT_HASH; }],
    ['replay null parent', (input) => { input.created_from = 'replay'; input.chain_revision = 2; input.repair_transaction_sha256 = DESIGN_HASH; }],
    ['replay null transaction', (input) => { input.created_from = 'replay'; input.chain_revision = 2; input.parent_chain_sha256 = DESIGN_HASH; }]
  ];
  for (const [name, mutate] of cases) {
    const input = chainInput(checkpoints);
    mutate(input);
    assert.throws(() => createChainManifest(input), { code: 'P5_CHECKPOINT_INVALID' }, name);
  }
});

test('accepts only a contiguous replay suffix bound to its parent and transaction', () => {
  const replay = buildReplayEnvelopes();
  const accepted = chainInput(replay);
  accepted.chain_revision = 2;
  accepted.parent_chain_sha256 = DESIGN_HASH;
  accepted.repair_transaction_sha256 = CONTEXT_HASH;
  accepted.created_from = 'replay';
  assert.equal(createChainManifest(accepted).created_from, 'replay');

  const mismatch = clone(accepted);
  mismatch.checkpoint_envelopes = buildReplayEnvelopes({ base_chain_sha256: ARTIFACT_HASH });
  assert.throws(() => createChainManifest(mismatch), { code: 'P5_CHECKPOINT_INVALID' });

  const gapped = clone(accepted);
  gapped.checkpoint_envelopes = buildReplayEnvelopes({ null_roof_origin: true });
  assert.throws(() => createChainManifest(gapped), { code: 'P5_CHECKPOINT_INVALID' });
});

test('creates exact score-free eligibility records and rejects forbidden fields', () => {
  const eligibility = createEligibilityRecord({
    status: 'eligible',
    hard_qa_ok: true,
    unresolved_violated_core_rule_ids: [],
    neutral_unknown_rule_ids: [],
    neutral_not_applicable_rule_ids: [],
    repair_budget_used: 0
  });
  assert.deepEqual(eligibility, {
    status: 'eligible',
    hard_qa_ok: true,
    unresolved_violated_core_rule_ids: [],
    neutral_unknown_rule_ids: [],
    neutral_not_applicable_rule_ids: [],
    repair_budget_used: 0
  });
  for (const key of ['score', 'points', 'percent', 'grade', 'threshold', 'reason']) {
    assert.throws(() => createEligibilityRecord({ ...eligibility, [key]: key === 'reason' ? 'nope' : 1 }), { code: 'P5_AUTHORITY_INVALID' }, key);
  }
});

test('eligible retains ordered neutral evidence and one consumed repair budget', () => {
  const eligible = createEligibilityRecord({
    status: 'eligible',
    hard_qa_ok: true,
    unresolved_violated_core_rule_ids: [],
    neutral_unknown_rule_ids: ['rule:medieval.show-load-path'],
    neutral_not_applicable_rule_ids: ['rule:structure.compose-three-volumes'],
    repair_budget_used: 1
  });
  assert.equal(eligible.repair_budget_used, 1);
  assert.deepEqual(eligible.neutral_unknown_rule_ids, ['rule:medieval.show-load-path']);
  for (const mutate of [
    (value) => { value.hard_qa_ok = false; },
    (value) => { value.unresolved_violated_core_rule_ids = ['rule:medieval.show-load-path']; },
    (value) => { value.repair_budget_used = 2; }
  ]) {
    const invalid = clone(eligible);
    mutate(invalid);
    assert.throws(() => createEligibilityRecord(invalid), { code: 'P5_AUTHORITY_INVALID' });
  }
});

test('eligibility contract preserves a reviewed-order cross-prefix neutral list', () => {
  const neutral = createEligibilityRecord({
    status: 'eligible',
    hard_qa_ok: true,
    unresolved_violated_core_rule_ids: [],
    neutral_unknown_rule_ids: [
      'rule:structure.compose-three-volumes',
      'rule:roof.border-with-material-contrast'
    ],
    neutral_not_applicable_rule_ids: [],
    repair_budget_used: 0
  });
  assert.deepEqual(neutral.neutral_unknown_rule_ids, [
    'rule:structure.compose-three-volumes',
    'rule:roof.border-with-material-contrast'
  ]);
});

function checkpointInput(layer) {
  const index = LAYERS.indexOf(layer);
  return {
    build_id: 'build-01',
    candidate_id: 'candidate-01',
    layer,
    revision: 1,
    status: 'accepted',
    preceding_envelopes: [],
    selected_rule_ids: ['rule:medieval.show-load-path'],
    rejected_rule_ids: ['rule:facade.break-repetitive-bays'],
    design_intent: { layer, purpose: `${layer}-intent` },
    recipe_fragment: { layer, payload: { intent: `${layer}-recipe` } },
    field_patches: [],
    compiled_artifact_hashes: { layer_payload_sha256: ARTIFACT_HASH },
    hard_qa: { hard_qa_ok: true, hard_qa_sha256: QA_HASH },
    design_review: { p4_review_sha256: REVIEW_HASH },
    invalidates_downstream: INVALIDATES[layer],
    replay_origin: null
  };
}

function buildEnvelopes() {
  const envelopes = [];
  for (const layer of LAYERS) {
    const input = checkpointInput(layer);
    input.preceding_envelopes = envelopes;
    envelopes.push(createCheckpointEnvelope(input));
  }
  return envelopes;
}

function buildReplayEnvelopes({ base_chain_sha256 = DESIGN_HASH, null_roof_origin = false } = {}) {
  const initial = buildEnvelopes();
  const replay = initial.slice(0, 2);
  for (const layer of LAYERS.slice(2)) {
    const input = checkpointInput(layer);
    input.revision = 2;
    input.preceding_envelopes = replay;
    input.replay_origin = layer === 'roof' && null_roof_origin
      ? null
      : {
          kind: 'replay',
          base_chain_sha256,
          repair_transaction_sha256: CONTEXT_HASH
        };
    replay.push(createCheckpointEnvelope(input));
  }
  return replay;
}

function chainInput(checkpoint_envelopes) {
  return {
    candidate_id: 'candidate-01',
    chain_revision: 1,
    parent_chain_sha256: null,
    checkpoint_envelopes,
    frozen_design_sha256: DESIGN_HASH,
    frozen_generator_context_sha256: CONTEXT_HASH,
    blueprint_sha256: BLUEPRINT_HASH,
    hard_qa_sha256: QA_HASH,
    p4_review_sha256: REVIEW_HASH,
    repair_transaction_sha256: null,
    eligibility: {
      status: 'eligible',
      hard_qa_ok: true,
      unresolved_violated_core_rule_ids: [],
      neutral_unknown_rule_ids: [],
      neutral_not_applicable_rule_ids: [],
      repair_budget_used: 0
    },
    created_from: 'initial'
  };
}

function checkpointPayloadFixture(layer) {
  const input = checkpointInput(layer);
  return {
    schema_version: 1,
    playbook_version: '0.1.0',
    build_id: input.build_id,
    candidate_id: input.candidate_id,
    layer,
    revision: input.revision,
    status: input.status,
    upstream_accepted_hashes: LAYERS.slice(0, LAYERS.indexOf(layer)).map((name) => ({
      layer: name,
      checkpoint_sha256: FIXTURE_HASHES[name]
    })),
    selected_rule_ids: input.selected_rule_ids,
    rejected_rule_ids: input.rejected_rule_ids,
    design_intent: input.design_intent,
    recipe_fragment: input.recipe_fragment,
    field_patches: input.field_patches,
    compiled_artifact_hashes: input.compiled_artifact_hashes,
    hard_qa: input.hard_qa,
    design_review: input.design_review,
    invalidates_downstream: input.invalidates_downstream,
    replay_origin: input.replay_origin
  };
}

function clone(value) {
  return structuredClone(value);
}
