import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHECKPOINT_STATUSES,
  DESIGN_LAYER_ORDER,
  EXECUTABLE_REPAIR_ROWS,
  EXECUTE_COMPILER_VERSION,
  EXECUTE_SCHEMA_VERSION,
  INVALIDATES_BY_LAYER,
  P5_ERROR_CODES,
  PLAYBOOK_MODES
} from '../src/playbook/execute/constants.js';
import {
  executeError,
  sanitizeExecuteError,
  validateChainManifest,
  validateCheckpointEnvelope,
  validateCheckpointPayload,
  validateEligibilityRecord,
  validateExecuteOptions,
  validateFrozenDesignEnvelope,
  validateFrozenGeneratorContext,
  validatePlaybookMode,
  validateRepairPreference,
  validateRepairRequest,
  validateResolvedPatch,
  validateSelectionRecord
} from '../src/playbook/execute/contracts.js';
import { sha256, stableJson } from '../src/playbook/shadow/canonical.js';

const HASH = 'a'.repeat(64);
const DESIGN_LAYERS = ['brief', 'massing', 'structure', 'roof', 'facade'];

test('exports the literal P5 modes, layers, invalidation graph, and repair rows', () => {
  assert.equal(EXECUTE_SCHEMA_VERSION, 1);
  assert.equal(EXECUTE_COMPILER_VERSION, 1);
  assert.deepEqual(PLAYBOOK_MODES, ['off', 'execute']);
  assert.deepEqual(DESIGN_LAYER_ORDER, DESIGN_LAYERS);
  assert.deepEqual(INVALIDATES_BY_LAYER.massing, ['structure', 'roof', 'facade']);
  assert.deepEqual(INVALIDATES_BY_LAYER.structure, ['roof', 'facade']);
  assert.deepEqual(CHECKPOINT_STATUSES, [
    'draft', 'reviewing', 'accepted', 'rework_required', 'superseded', 'failed'
  ]);
  assert.equal(EXECUTABLE_REPAIR_ROWS.length, 4);
  assert.deepEqual(EXECUTABLE_REPAIR_ROWS.map((row) => row.repair_operation_id), [
    'repair:massing:resize-or-reposition-volume',
    'repair:massing:strengthen-primary-volume',
    'repair:massing:reduce-support-volume-prominence',
    'repair:structure:connect-support-path'
  ]);
  assert.ok(Object.isFrozen(EXECUTABLE_REPAIR_ROWS));
  assert.ok(P5_ERROR_CODES.includes('P5_NO_ELIGIBLE_CANDIDATE'));
});

test('mode/options and public errors have an exact safe surface', () => {
  assert.equal(validatePlaybookMode(undefined), 'off');
  assert.equal(validatePlaybookMode('execute'), 'execute');
  assert.throws(() => validatePlaybookMode('shadow'), { code: 'P5_MODE_INVALID' });
  assert.deepEqual(validateExecuteOptions({ playbook: 'execute' }), {
    playbook: 'execute', candidates: 3, candidateRounds: 1, candidateForceRounds: false
  });
  assert.throws(
    () => validateExecuteOptions({ playbook: 'execute', candidates: 2 }),
    { code: 'P5_OPTIONS_INCOMPATIBLE' }
  );
  assert.equal(executeError('P5_DESIGN_INVALID').code, 'P5_DESIGN_INVALID');
  assert.equal(sanitizeExecuteError(new Error('private'), 'P5_REPLAY_FAILED').code, 'P5_REPLAY_FAILED');
  assert.equal(sanitizeExecuteError(executeError('private'), 'P5_REPLAY_FAILED').code, 'P5_REPLAY_FAILED');
});

test('frozen envelope admits only its exact outer schema and canonical data', () => {
  assertFrozenMutationRejections(validateFrozenDesignEnvelope, frozenDesign(), 'P5_DESIGN_INVALID');
  assert.throws(() => validateFrozenDesignEnvelope(accessorObject(frozenDesign())), { code: 'P5_DESIGN_INVALID' });
  assert.throws(() => validateFrozenDesignEnvelope(cyclic(frozenDesign())), { code: 'P5_DESIGN_INVALID' });
  const result = validateFrozenDesignEnvelope(frozenDesign());
  assert.ok(Object.isFrozen(result));
  assert.notEqual(result, frozenDesign());
});

test('frozen generator context is bound to its candidate and contains only safe canonical data', () => {
  assertFrozenMutationRejections(validateFrozenGeneratorContext, frozenGeneratorContext(), 'P5_DESIGN_INVALID');
  const invalid = frozenGeneratorContext();
  invalid.concept = Number.NaN;
  assert.throws(() => validateFrozenGeneratorContext(invalid), { code: 'P5_DESIGN_INVALID' });
  assert.deepEqual(validateFrozenGeneratorContext(frozenGeneratorContext()).concept, null);
});

test('checkpoint payload/envelope preserve exact layer predecessors and their canonical hash', () => {
  assertFrozenMutationRejections(validateCheckpointPayload, checkpointPayload(), 'P5_CHECKPOINT_INVALID');
  const reordered = checkpointPayload('facade');
  reordered.upstream_accepted_hashes.reverse();
  assert.throws(() => validateCheckpointPayload(reordered), { code: 'P5_CHECKPOINT_INVALID' });
  const payload = checkpointPayload();
  const envelope = { checkpoint_sha256: sha256(stableJson(payload)), checkpoint: payload };
  assert.deepEqual(validateCheckpointEnvelope(envelope), envelope);
  envelope.checkpoint_sha256 = HASH.replace('a', 'b');
  assert.throws(() => validateCheckpointEnvelope(envelope), { code: 'P5_CHECKPOINT_INVALID' });
  const wrongPredecessorHash = checkpointPayload('facade');
  wrongPredecessorHash.upstream_accepted_hashes[0].checkpoint_sha256 = 'g'.repeat(64);
  assert.throws(() => validateCheckpointPayload(wrongPredecessorHash), { code: 'P5_CHECKPOINT_INVALID' });
  const wrongArtifactHash = checkpointPayload();
  wrongArtifactHash.compiled_artifact_hashes.blueprint = 'g'.repeat(64);
  assert.throws(() => validateCheckpointPayload(wrongArtifactHash), { code: 'P5_CHECKPOINT_INVALID' });
});

test('chain manifest and eligibility reject extra, reordered, duplicate, and malformed authority rows', () => {
  assertFrozenMutationRejections(validateEligibilityRecord, eligibility(), 'P5_AUTHORITY_INVALID');
  assertFrozenMutationRejections(validateChainManifest, chainManifest(), 'P5_CHECKPOINT_INVALID');
  const duplicate = chainManifest();
  duplicate.checkpoint_hashes[4] = { ...duplicate.checkpoint_hashes[0] };
  assert.throws(() => validateChainManifest(duplicate), { code: 'P5_CHECKPOINT_INVALID' });
  const badHash = chainManifest();
  badHash.blueprint_sha256 = 'not-a-hash';
  assert.throws(() => validateChainManifest(badHash), { code: 'P5_CHECKPOINT_INVALID' });
  for (const key of [
    'frozen_design_sha256', 'frozen_generator_context_sha256', 'blueprint_sha256',
    'hard_qa_sha256', 'p4_review_sha256'
  ]) {
    const invalid = chainManifest();
    invalid[key] = 'g'.repeat(64);
    assert.throws(() => validateChainManifest(invalid), { code: 'P5_CHECKPOINT_INVALID' }, key);
  }
});

test('repair preference, request, and resolved patch retain only the allowlisted registry tuple', () => {
  assertFrozenMutationRejections(validateRepairPreference, repairPreference(), 'P5_REPAIR_INVALID');
  assertFrozenMutationRejections(validateRepairRequest, repairRequest(), 'P5_REPAIR_INVALID');
  assertFrozenMutationRejections(validateResolvedPatch, resolvedPatch(), 'P5_REPAIR_INVALID');
  const invalidated = resolvedPatch();
  invalidated.invalidates_layers = ['roof'];
  assert.throws(() => validateResolvedPatch(invalidated), { code: 'P5_REPAIR_INVALID' });
  const badHash = repairRequest();
  badHash.base_checkpoint_sha256 = 'f'.repeat(63);
  assert.throws(() => validateRepairRequest(badHash), { code: 'P5_REPAIR_INVALID' });
});

test('selection record is an exact, frozen authority boundary', () => {
  assertFrozenMutationRejections(validateSelectionRecord, selectionRecord(), 'P5_AUTHORITY_INVALID');
  const duplicate = selectionRecord();
  duplicate.candidates[1].candidate_id = duplicate.candidates[0].candidate_id;
  assert.throws(() => validateSelectionRecord(duplicate), { code: 'P5_AUTHORITY_INVALID' });
  for (const key of ['current_chain_sha256', 'hard_qa_sha256', 'p4_review_sha256']) {
    const invalid = selectionRecord();
    invalid.candidates[0][key] = 'g'.repeat(64);
    assert.throws(() => validateSelectionRecord(invalid), { code: 'P5_AUTHORITY_INVALID' }, key);
  }
  const wrongSelection = selectionRecord();
  wrongSelection.selected_chain_sha256 = 'b'.repeat(64);
  assert.throws(() => validateSelectionRecord(wrongSelection), { code: 'P5_AUTHORITY_INVALID' });
});

function assertFrozenMutationRejections(validate, input, code) {
  assert.deepEqual(validate(input), input);
  for (const key of Object.keys(input)) {
    const missing = clone(input);
    delete missing[key];
    assert.throws(() => validate(missing), { code }, `missing ${key}`);
  }
  assert.throws(() => validate({ ...clone(input), extra: true }), { code }, 'extra field');
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value) && value.length > 1) {
      const reordered = clone(input);
      reordered[key].reverse();
      assert.throws(() => validate(reordered), { code }, `reordered ${key}`);
    }
    if (isScalar(value)) {
      const wrongType = clone(input);
      wrongType[key] = wrongScalar(value);
      assert.throws(() => validate(wrongType), { code }, `wrong type ${key}`);
    }
  }
}

function frozenDesign() {
  return {
    schema_version: 1,
    candidate_id: 'candidate-01',
    seed: 424242,
    brief_intent: 'medieval residence',
    layer_intents: Object.fromEntries(DESIGN_LAYERS.map((layer) => [layer, { layer }])),
    selected_rule_ids: ['rule:medieval.show-load-path', 'rule:structure.compose-three-volumes'],
    rejected_rule_ids: ['rule:facade.break-repetitive-bays'],
    repair_variant_preferences: [repairPreference()]
  };
}

function frozenGeneratorContext() {
  return {
    schema_version: 1,
    candidate_id: 'candidate-01',
    seed: 424242,
    frozen_design_sha256: HASH,
    architecture: { source: 'fallback' },
    topology: { rooms: 8 },
    creative_design: { source: 'local' },
    concept: null,
    build_spec: { typology: 'house' },
    style_preset: { id: 'medieval' },
    material_palette: { roof: 'dark_oak' },
    template_knowledge: { source: 'local' }
  };
}

function checkpointPayload(layer = 'massing') {
  const index = DESIGN_LAYERS.indexOf(layer);
  return {
    schema_version: 1,
    playbook_version: '0.1.0',
    build_id: 'build-01',
    candidate_id: 'candidate-01',
    layer,
    revision: 1,
    status: 'accepted',
    upstream_accepted_hashes: DESIGN_LAYERS.slice(0, index).map((name) => ({ layer: name, checkpoint_sha256: HASH })),
    selected_rule_ids: ['rule:medieval.show-load-path', 'rule:structure.compose-three-volumes'],
    rejected_rule_ids: ['rule:facade.break-repetitive-bays'],
    design_intent: { layer },
    recipe_fragment: { id: `${layer}-recipe` },
    field_patches: [{ field: 'role', value: 'primary' }],
    compiled_artifact_hashes: { blueprint: HASH },
    hard_qa: { ok: true },
    design_review: { status: 'satisfied' },
    invalidates_downstream: INVALIDATES_BY_LAYER[layer],
    replay_origin: 'initial'
  };
}

function eligibility() {
  return {
    hard_qa_ok: true,
    unresolved_core_rule_ids: [],
    neutral_rule_ids: ['rule:facade.break-repetitive-bays'],
    repair_budget_used: 0,
    status: 'eligible'
  };
}

function chainManifest() {
  return {
    schema_version: 1,
    candidate_id: 'candidate-01',
    chain_revision: 1,
    parent_chain_sha256: null,
    checkpoint_hashes: DESIGN_LAYERS.map((layer) => ({ layer, checkpoint_sha256: HASH })),
    frozen_design_sha256: HASH,
    frozen_generator_context_sha256: HASH,
    blueprint_sha256: HASH,
    hard_qa_sha256: HASH,
    p4_review_sha256: HASH,
    repair_transaction_sha256: null,
    eligibility: eligibility(),
    created_from: 'initial'
  };
}

function repairPreference() {
  return {
    repair_operation_id: 'repair:massing:strengthen-primary-volume',
    variant_id: 'promote-largest-stable'
  };
}

function repairRequest() {
  return {
    schema_version: 1,
    candidate_id: 'candidate-01',
    rule_id: 'rule:structure.create-primary-secondary-hierarchy',
    repair_operation_id: 'repair:massing:strengthen-primary-volume',
    variant_id: 'promote-largest-stable',
    base_checkpoint_sha256: HASH
  };
}

function resolvedPatch() {
  return {
    schema_version: 1,
    compiler_version: 1,
    candidate_id: 'candidate-01',
    rule_id: 'rule:structure.create-primary-secondary-hierarchy',
    repair_operation_id: 'repair:massing:strengthen-primary-volume',
    variant_id: 'promote-largest-stable',
    target_layer: 'massing',
    base_checkpoint_sha256: HASH,
    precondition_hashes: [{ anchor_id: 'primary-volume', sha256: HASH }],
    effects: [{ kind: 'assign-primary', volume_id: 'volume-01' }],
    invalidates_layers: ['structure', 'roof', 'facade']
  };
}

function selectionRecord() {
  return {
    schema_version: 1,
    mode: 'execute',
    candidate_count: 3,
    candidates: [
      selectionCandidate('candidate-01', 11, eligibility(), HASH, 1),
      selectionCandidate('candidate-02', 12, { ...eligibility(), status: 'hard-qa-failed' }, null, 0),
      selectionCandidate('candidate-03', 13, { ...eligibility(), status: 'replay-failed' }, null, 0)
    ],
    selected_candidate_id: 'candidate-01',
    selected_chain_sha256: HASH,
    repair_attempt_count: 1,
    ranker_result: { selected_candidate_id: 'candidate-01' }
  };
}

function selectionCandidate(candidate_id, seed, eligibility, current_chain_sha256, repair_attempt_count) {
  const accepted = current_chain_sha256 !== null;
  return {
    candidate_id,
    seed,
    current_chain_sha256,
    hard_qa_sha256: accepted ? HASH : null,
    p4_review_sha256: accepted ? HASH : null,
    eligibility,
    repair_attempt_count
  };
}

function accessorObject(value) {
  Object.defineProperty(value.architecture || value, 'malicious', { enumerable: true, get: () => 'x' });
  return value;
}

function cyclic(value) {
  value.layer_intents.self = value;
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function isScalar(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function wrongScalar(value) {
  if (value === null) return 'not-null';
  if (typeof value === 'string') return 1;
  if (typeof value === 'number') return '1';
  return 'true';
}
