import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

const HASH = 'a'.repeat(64);
const DESIGN_LAYERS = ['brief', 'massing', 'structure', 'roof', 'facade'];
const INVALIDATES = {
  brief: ['massing', 'structure', 'roof', 'facade'],
  massing: ['structure', 'roof', 'facade'],
  structure: ['roof', 'facade'],
  roof: ['facade'],
  facade: []
};
const CHECKPOINT_ENVELOPE_SHA256 = 'b662788a2efee69bd511f2cb50f5ba1bb2062d291879feed22a5fbcc76d1f8b1';
const REPAIR_ROWS = [
  {
    rule_id: 'rule:structure.compose-three-volumes',
    check_id: 'check:massing:three-volume-composition',
    design_layer: 'massing',
    repair_operation_id: 'repair:massing:resize-or-reposition-volume',
    invalidates_layers: ['structure', 'roof', 'facade'],
    compiler_version: 1,
    allowed_variant_ids: ['center-primary-and-reattach-secondaries', 'differentiate-equal-secondary-scale']
  },
  {
    rule_id: 'rule:structure.create-primary-secondary-hierarchy',
    check_id: 'check:massing:primary-secondary-hierarchy',
    design_layer: 'massing',
    repair_operation_id: 'repair:massing:strengthen-primary-volume',
    invalidates_layers: ['structure', 'roof', 'facade'],
    compiler_version: 1,
    allowed_variant_ids: ['promote-largest-stable', 'reduce-nondominant-secondary']
  },
  {
    rule_id: 'rule:structure.keep-support-volumes-subordinate',
    check_id: 'check:massing:subordinate-support-volume',
    design_layer: 'structure',
    repair_operation_id: 'repair:massing:reduce-support-volume-prominence',
    invalidates_layers: ['structure', 'roof', 'facade'],
    compiler_version: 1,
    allowed_variant_ids: ['reduce-attached-support-scale']
  },
  {
    rule_id: 'rule:medieval.show-load-path',
    check_id: 'check:structure:visible-load-path',
    design_layer: 'structure',
    repair_operation_id: 'repair:structure:connect-support-path',
    invalidates_layers: ['roof', 'facade'],
    compiler_version: 1,
    allowed_variant_ids: ['connect-known-structural-anchors']
  }
];

test('exports the literal P5 modes, layers, invalidation graph, and repair rows', () => {
  assert.equal(EXECUTE_SCHEMA_VERSION, 1);
  assert.equal(EXECUTE_COMPILER_VERSION, 1);
  assert.deepEqual(PLAYBOOK_MODES, ['off', 'execute']);
  assert.deepEqual(DESIGN_LAYER_ORDER, DESIGN_LAYERS);
  assert.deepEqual(INVALIDATES_BY_LAYER, INVALIDATES);
  assert.deepEqual(CHECKPOINT_STATUSES, [
    'draft', 'reviewing', 'accepted', 'rework_required', 'superseded', 'failed'
  ]);
  assert.deepEqual(EXECUTABLE_REPAIR_ROWS, REPAIR_ROWS);
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
  assertFrozenMutationRejections(validateFrozenDesignEnvelope, frozenDesign(), 'P5_DESIGN_INVALID', {
    unorderedArrays: ['selected_rule_ids', 'rejected_rule_ids']
  });
  assert.throws(() => validateFrozenDesignEnvelope(accessorObject(frozenDesign())), { code: 'P5_DESIGN_INVALID' });
  assert.throws(() => validateFrozenDesignEnvelope(cyclic(frozenDesign())), { code: 'P5_DESIGN_INVALID' });
  const input = frozenDesign();
  const result = validateFrozenDesignEnvelope(input);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.layer_intents));
  assert.ok(Object.isFrozen(result.repair_variant_preferences));
  assert.notEqual(result, input);
});

test('canonical data rejects array accessors/custom prototypes and accepts reordered object keys', () => {
  const accessor = frozenDesign();
  Object.defineProperty(accessor.selected_rule_ids, '0', {
    enumerable: true,
    get: () => 'rule:medieval.show-load-path'
  });
  assert.throws(() => validateFrozenDesignEnvelope(accessor), { code: 'P5_DESIGN_INVALID' });

  const customPrototype = frozenDesign();
  Object.setPrototypeOf(customPrototype.selected_rule_ids, { map: Array.prototype.map });
  assert.throws(() => validateFrozenDesignEnvelope(customPrototype), { code: 'P5_DESIGN_INVALID' });

  const reordered = Object.fromEntries(Object.entries(frozenDesign()).reverse());
  assert.deepEqual(validateFrozenDesignEnvelope(reordered), frozenDesign());
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
  const envelope = checkpointEnvelope();
  assert.equal(independentSha256(independentStableJson(envelope.checkpoint)), CHECKPOINT_ENVELOPE_SHA256);
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

test('checkpoint envelope receives the same exhaustive outer mutation matrix as other contracts', () => {
  assertFrozenMutationRejections(validateCheckpointEnvelope, checkpointEnvelope(), 'P5_CHECKPOINT_INVALID');
  const envelope = checkpointEnvelope();
  assertNestedObjectMutationRejections(
    validateCheckpointEnvelope,
    envelope,
    ['checkpoint'],
    'P5_CHECKPOINT_INVALID'
  );
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
  for (const row of REPAIR_ROWS) {
    const request = repairRequestFor(row);
    const patch = resolvedPatchFor(row);
    assert.deepEqual(validateRepairRequest(request), request);
    assert.deepEqual(validateResolvedPatch(patch), patch);
  }
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

test('every fixed nested authority row receives missing, extra, wrong-type, duplicate, order, and hash mutations', () => {
  assertRowMutationRejections(
    validateFrozenDesignEnvelope,
    frozenDesign(),
    ['repair_variant_preferences'],
    ['repair_operation_id', 'variant_id'],
    'P5_DESIGN_INVALID'
  );

  const checkpoint = checkpointPayload('facade');
  assertRowMutationRejections(
    validateCheckpointPayload,
    checkpoint,
    ['upstream_accepted_hashes'],
    ['layer', 'checkpoint_sha256'],
    'P5_CHECKPOINT_INVALID'
  );
  for (const [index] of checkpoint.upstream_accepted_hashes.entries()) {
    const invalid = clone(checkpoint);
    invalid.upstream_accepted_hashes[index].checkpoint_sha256 = 'g'.repeat(64);
    assert.throws(() => validateCheckpointPayload(invalid), { code: 'P5_CHECKPOINT_INVALID' }, `upstream hash ${index}`);
  }

  const chain = chainManifest();
  assertRowMutationRejections(
    validateChainManifest,
    chain,
    ['checkpoint_hashes'],
    ['layer', 'checkpoint_sha256'],
    'P5_CHECKPOINT_INVALID'
  );
  assertNestedObjectMutationRejections(
    validateChainManifest,
    chain,
    ['eligibility'],
    'P5_AUTHORITY_INVALID'
  );
  for (const [index] of chain.checkpoint_hashes.entries()) {
    const invalid = clone(chain);
    invalid.checkpoint_hashes[index].checkpoint_sha256 = 'g'.repeat(64);
    assert.throws(() => validateChainManifest(invalid), { code: 'P5_CHECKPOINT_INVALID' }, `chain hash ${index}`);
  }

  const selection = selectionRecord();
  assertRowMutationRejections(
    validateSelectionRecord,
    selection,
    ['candidates'],
    ['candidate_id', 'seed', 'current_chain_sha256', 'hard_qa_sha256', 'p4_review_sha256', 'eligibility', 'repair_attempt_count'],
    'P5_AUTHORITY_INVALID'
  );
  for (const [rowIndex, row] of selection.candidates.entries()) {
    for (const hash of ['current_chain_sha256', 'hard_qa_sha256', 'p4_review_sha256']) {
      const invalid = clone(selection);
      invalid.candidates[rowIndex][hash] = 'g'.repeat(64);
      assert.throws(() => validateSelectionRecord(invalid), { code: 'P5_AUTHORITY_INVALID' }, `selection ${rowIndex} ${hash}`);
    }
    const duplicate = clone(selection);
    duplicate.candidates[rowIndex].candidate_id = 'candidate-01';
    if (rowIndex !== 0) {
      assert.throws(() => validateSelectionRecord(duplicate), { code: 'P5_AUTHORITY_INVALID' }, `duplicate candidate ${rowIndex}`);
    }
  }
});

test('every ID-bearing authoritative array rejects duplicated rows', () => {
  const envelope = frozenDesign();
  assertDuplicateRowRejected(
    validateFrozenDesignEnvelope,
    envelope,
    ['selected_rule_ids'],
    0,
    'P5_DESIGN_INVALID'
  );
  assertDuplicateRowRejected(
    validateFrozenDesignEnvelope,
    envelope,
    ['rejected_rule_ids'],
    0,
    'P5_DESIGN_INVALID'
  );
  assertDuplicateRowRejected(
    validateFrozenDesignEnvelope,
    envelope,
    ['repair_variant_preferences'],
    0,
    'P5_DESIGN_INVALID'
  );

  const checkpoint = checkpointPayload('facade');
  assertDuplicateRowRejected(
    validateCheckpointPayload,
    checkpoint,
    ['selected_rule_ids'],
    0,
    'P5_CHECKPOINT_INVALID'
  );
  assertDuplicateRowRejected(
    validateCheckpointPayload,
    checkpoint,
    ['rejected_rule_ids'],
    0,
    'P5_CHECKPOINT_INVALID'
  );
  assertDuplicateRowRejected(
    validateCheckpointPayload,
    checkpoint,
    ['upstream_accepted_hashes'],
    0,
    'P5_CHECKPOINT_INVALID'
  );

  const eligibilityWithUnresolved = {
    status: 'unresolved-core-violation',
    hard_qa_ok: true,
    unresolved_violated_core_rule_ids: ['rule:medieval.show-load-path'],
    neutral_unknown_rule_ids: ['rule:facade.break-repetitive-bays'],
    neutral_not_applicable_rule_ids: [],
    repair_budget_used: 0
  };
  assertDuplicateRowRejected(
    validateEligibilityRecord,
    eligibilityWithUnresolved,
    ['unresolved_violated_core_rule_ids'],
    0,
    'P5_AUTHORITY_INVALID'
  );
  assertDuplicateRowRejected(
    validateEligibilityRecord,
    eligibilityWithUnresolved,
    ['neutral_unknown_rule_ids'],
    0,
    'P5_AUTHORITY_INVALID'
  );

  assertDuplicateRowRejected(
    validateChainManifest,
    chainManifest(),
    ['checkpoint_hashes'],
    0,
    'P5_CHECKPOINT_INVALID'
  );
  assertDuplicateRowRejected(
    validateSelectionRecord,
    selectionRecord(),
    ['candidates'],
    0,
    'P5_AUTHORITY_INVALID'
  );
});

function assertFrozenMutationRejections(validate, input, code, { unorderedArrays = [] } = {}) {
  assert.deepEqual(validate(input), input);
  for (const key of Object.keys(input)) {
    const missing = clone(input);
    delete missing[key];
    assert.throws(() => validate(missing), { code }, `missing ${key}`);
  }
  assert.throws(() => validate({ ...clone(input), extra: true }), { code }, 'extra field');
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value) && value.length > 1 && !unorderedArrays.includes(key)) {
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

function assertNestedObjectMutationRejections(validate, input, path, code) {
  const target = atPath(input, path);
  for (const key of Object.keys(target)) {
    const missing = clone(input);
    delete atPath(missing, path)[key];
    assert.throws(() => validate(missing), { code }, `missing ${path.join('.')}.${key}`);

    const extra = clone(input);
    atPath(extra, path).extra = true;
    assert.throws(() => validate(extra), { code }, `extra ${path.join('.')}.${key}`);

    if (isScalar(target[key])) {
      const wrongType = clone(input);
      atPath(wrongType, path)[key] = wrongScalar(target[key]);
      assert.throws(() => validate(wrongType), { code }, `wrong type ${path.join('.')}.${key}`);
    }
  }
}

function assertRowMutationRejections(validate, input, path, fields, code) {
  const rows = atPath(input, path);
  for (const [index, row] of rows.entries()) {
    for (const key of fields) {
      const missing = clone(input);
      delete atPath(missing, path)[index][key];
      assert.throws(() => validate(missing), { code }, `missing ${path.join('.')}[${index}].${key}`);

      const extra = clone(input);
      atPath(extra, path)[index].extra = true;
      assert.throws(() => validate(extra), { code }, `extra ${path.join('.')}[${index}].${key}`);

      if (isScalar(row[key])) {
        const wrongType = clone(input);
        atPath(wrongType, path)[index][key] = wrongScalar(row[key]);
        assert.throws(() => validate(wrongType), { code }, `wrong type ${path.join('.')}[${index}].${key}`);
      }
    }
  }
}

function assertDuplicateRowRejected(validate, input, path, index, code) {
  const invalid = clone(input);
  const rows = atPath(invalid, path);
  rows.push(clone(rows[index]));
  assert.throws(() => validate(invalid), { code }, `duplicate ${path.join('.')}[${index}]`);
}

function atPath(value, path) {
  return path.reduce((current, key) => current[key], value);
}

function frozenDesign() {
  return {
    schema_version: 1,
    candidate_id: 'candidate-01',
    seed: 424242,
    brief_intent: 'medieval residence',
    layer_intents: DESIGN_LAYERS.map((layer) => ({ layer, intent: `${layer}-intent` })),
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
    recipe_fragment: { layer, payload: { id: `${layer}-recipe` } },
    field_patches: [{ field: 'role', value: 'primary' }],
    compiled_artifact_hashes: { blueprint: HASH },
    hard_qa: { hard_qa_ok: true, hard_qa_sha256: HASH },
    design_review: { p4_review_sha256: HASH },
    invalidates_downstream: INVALIDATES[layer],
    replay_origin: { kind: 'initial' }
  };
}

function checkpointEnvelope() {
  return {
    checkpoint_sha256: CHECKPOINT_ENVELOPE_SHA256,
    checkpoint: checkpointPayload()
  };
}

function eligibility() {
  return {
    status: 'eligible',
    hard_qa_ok: true,
    unresolved_violated_core_rule_ids: [],
    neutral_unknown_rule_ids: ['rule:facade.break-repetitive-bays'],
    neutral_not_applicable_rule_ids: [],
    repair_budget_used: 0
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

function repairRequestFor(row) {
  return {
    schema_version: 1,
    candidate_id: 'candidate-01',
    rule_id: row.rule_id,
    repair_operation_id: row.repair_operation_id,
    variant_id: row.allowed_variant_ids[0],
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

function resolvedPatchFor(row) {
  return {
    schema_version: 1,
    compiler_version: 1,
    candidate_id: 'candidate-01',
    rule_id: row.rule_id,
    repair_operation_id: row.repair_operation_id,
    variant_id: row.allowed_variant_ids[0],
    target_layer: row.repair_operation_id.startsWith('repair:massing:') ? 'massing' : row.design_layer,
    base_checkpoint_sha256: HASH,
    precondition_hashes: [{ anchor_id: 'primary-volume', sha256: HASH }],
    effects: [{ kind: 'assign-primary', volume_id: 'volume-01' }],
    invalidates_layers: row.invalidates_layers
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

function independentSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function independentStableJson(value) {
  return `${JSON.stringify(independentSort(value), null, 2)}\n`;
}

function independentSort(value) {
  if (Array.isArray(value)) return value.map(independentSort);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, independentSort(value[key]) ]));
}
