import {
  CHECKPOINT_STATUSES,
  DESIGN_LAYER_ORDER,
  EXECUTABLE_REPAIR_ROWS,
  EXECUTE_COMPILER_VERSION,
  EXECUTE_SCHEMA_VERSION,
  INVALIDATES_BY_LAYER,
  P5_ERROR_CODES,
  PLAYBOOK_MODES
} from './constants.js';
import { deepFreeze, sha256, stableJson } from '../shadow/canonical.js';

const HASH = /^[a-f0-9]{64}$/u;
const CANDIDATE_ID = /^candidate-0[1-3]$/u;
const RULE_ID = /^rule:[a-z0-9][a-z0-9.-]*$/u;
const REPAIR_ID = /^repair:[a-z0-9][a-z0-9:-]*$/u;
const VARIANT_ID = /^[a-z][a-z0-9-]*$/u;
const ELIGIBILITY_STATUSES = Object.freeze([
  'eligible', 'hard-qa-failed', 'unresolved-core-violation', 'repair-invalid', 'replay-failed'
]);
const ROW_BY_OPERATION = new Map(EXECUTABLE_REPAIR_ROWS.map((row) => [row.repair_operation_id, row]));

const FROZEN_DESIGN_FIELDS = Object.freeze([
  'schema_version', 'candidate_id', 'seed', 'brief_intent', 'layer_intents',
  'selected_rule_ids', 'rejected_rule_ids', 'repair_variant_preferences'
]);
const GENERATOR_CONTEXT_FIELDS = Object.freeze([
  'schema_version', 'candidate_id', 'seed', 'frozen_design_sha256', 'architecture',
  'topology', 'creative_design', 'concept', 'build_spec', 'style_preset',
  'material_palette', 'template_knowledge'
]);
const CHECKPOINT_FIELDS = Object.freeze([
  'schema_version', 'playbook_version', 'build_id', 'candidate_id', 'layer', 'revision',
  'status', 'upstream_accepted_hashes', 'selected_rule_ids', 'rejected_rule_ids',
  'design_intent', 'recipe_fragment', 'field_patches', 'compiled_artifact_hashes',
  'hard_qa', 'design_review', 'invalidates_downstream', 'replay_origin'
]);
const CHAIN_FIELDS = Object.freeze([
  'schema_version', 'candidate_id', 'chain_revision', 'parent_chain_sha256',
  'checkpoint_hashes', 'frozen_design_sha256', 'frozen_generator_context_sha256',
  'blueprint_sha256', 'hard_qa_sha256', 'p4_review_sha256', 'repair_transaction_sha256',
  'eligibility', 'created_from'
]);
const ELIGIBILITY_FIELDS = Object.freeze([
  'status', 'hard_qa_ok', 'unresolved_violated_core_rule_ids', 'neutral_unknown_rule_ids',
  'neutral_not_applicable_rule_ids', 'repair_budget_used'
]);
const RECIPE_FRAGMENT_FIELDS = Object.freeze(['layer', 'payload']);
const FIELD_PATCH_FIELDS = Object.freeze(['field', 'value']);
const HARD_QA_FIELDS = Object.freeze(['hard_qa_ok', 'hard_qa_sha256']);
const DESIGN_REVIEW_FIELDS = Object.freeze(['p4_review_sha256']);
const REPLAY_REPLAY_ORIGIN_FIELDS = Object.freeze([
  'kind', 'base_chain_sha256', 'repair_transaction_sha256'
]);
const PREFERENCE_FIELDS = Object.freeze(['repair_operation_id', 'variant_id']);
const REQUEST_FIELDS = Object.freeze([
  'schema_version', 'candidate_id', 'rule_id', 'repair_operation_id', 'variant_id',
  'base_checkpoint_sha256'
]);
const PATCH_FIELDS = Object.freeze([
  'schema_version', 'compiler_version', 'candidate_id', 'rule_id',
  'repair_operation_id', 'variant_id', 'target_layer', 'base_checkpoint_sha256',
  'precondition_hashes', 'effects', 'invalidates_layers'
]);
const ENVELOPE_FIELDS = Object.freeze(['checkpoint_sha256', 'checkpoint']);
const SELECTION_FIELDS = Object.freeze([
  'schema_version', 'mode', 'candidate_count', 'candidates', 'selected_candidate_id',
  'selected_chain_sha256', 'repair_attempt_count', 'ranker_result'
]);
const SELECTION_CANDIDATE_FIELDS = Object.freeze([
  'candidate_id', 'seed', 'current_chain_sha256', 'hard_qa_sha256', 'p4_review_sha256',
  'eligibility', 'repair_attempt_count'
]);
const SELECTION_STORAGE_MANIFEST_FIELDS = Object.freeze([
  'schema_version', 'managed_paths', 'artifact_hashes'
]);
const SELECTION_STORAGE_PATHS = Object.freeze([
  'manifest.json', 'selection.json', 'selection-report.md'
]);
const SELECTION_STORAGE_BODY_PATHS = Object.freeze([
  'selection.json', 'selection-report.md'
]);

export class PlaybookExecuteError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PlaybookExecuteError';
    this.code = code;
  }
}

export function executeError(code) {
  return new PlaybookExecuteError(code);
}

export function sanitizeExecuteError(error, fallback) {
  return error instanceof PlaybookExecuteError && P5_ERROR_CODES.includes(error.code)
    ? error
    : executeError(fallback);
}

export function validatePlaybookMode(value = 'off') {
  if (!PLAYBOOK_MODES.includes(value)) fail('P5_MODE_INVALID');
  return value;
}

export function validateExecuteOptions(options = {}) {
  const value = jsonClone(options, 'P5_OPTIONS_INCOMPATIBLE');
  if (!isPlainObject(value)) fail('P5_OPTIONS_INCOMPATIBLE');
  const playbook = validatePlaybookMode(value.playbook === undefined ? 'off' : value.playbook);
  if (playbook !== 'execute') return deepFreeze(value);
  if (value.candidates !== undefined && value.candidates !== 3) fail('P5_OPTIONS_INCOMPATIBLE');
  if (value.candidateRounds !== undefined && value.candidateRounds !== 1) fail('P5_OPTIONS_INCOMPATIBLE');
  if (value.candidateForceRounds !== undefined && value.candidateForceRounds !== false) fail('P5_OPTIONS_INCOMPATIBLE');
  return deepFreeze({
    ...value,
    playbook: 'execute',
    candidates: 3,
    candidateRounds: 1,
    candidateForceRounds: false
  });
}

export function validateFrozenDesignEnvelope(value) {
  const data = canonicalObject(value, FROZEN_DESIGN_FIELDS, 'P5_DESIGN_INVALID');
  assertSchemaVersion(data, 'P5_DESIGN_INVALID');
  assertCandidateId(data.candidate_id, 'P5_DESIGN_INVALID');
  assertSeed(data.seed, 'P5_DESIGN_INVALID');
  assertBoundedProse(data.brief_intent, 'P5_DESIGN_INVALID');
  assertLayerIntentRows(data.layer_intents, 'P5_DESIGN_INVALID');
  assertUniqueIds(data.selected_rule_ids, RULE_ID, 'P5_DESIGN_INVALID');
  assertUniqueIds(data.rejected_rule_ids, RULE_ID, 'P5_DESIGN_INVALID');
  assertDistinct(data.selected_rule_ids, data.rejected_rule_ids, 'P5_DESIGN_INVALID');
  assertArray(data.repair_variant_preferences, 'P5_DESIGN_INVALID');
  const seen = new Set();
  for (const preference of data.repair_variant_preferences) {
    let row;
    try {
      row = validateRepairPreference(preference);
    } catch {
      fail('P5_DESIGN_INVALID');
    }
    if (seen.has(row.repair_operation_id)) fail('P5_DESIGN_INVALID');
    seen.add(row.repair_operation_id);
  }
  return data;
}

export function validateFrozenGeneratorContext(value) {
  const data = canonicalObject(value, GENERATOR_CONTEXT_FIELDS, 'P5_DESIGN_INVALID');
  assertSchemaVersion(data, 'P5_DESIGN_INVALID');
  assertCandidateId(data.candidate_id, 'P5_DESIGN_INVALID');
  assertSeed(data.seed, 'P5_DESIGN_INVALID');
  assertHash(data.frozen_design_sha256, 'P5_DESIGN_INVALID');
  for (const key of ['architecture', 'topology', 'creative_design', 'build_spec', 'style_preset', 'material_palette', 'template_knowledge']) {
    assertContainer(data[key], 'P5_DESIGN_INVALID');
  }
  if (data.concept !== null) assertContainer(data.concept, 'P5_DESIGN_INVALID');
  return data;
}

export function validateCheckpointPayload(value) {
  const data = canonicalObject(value, CHECKPOINT_FIELDS, 'P5_CHECKPOINT_INVALID');
  assertSchemaVersion(data, 'P5_CHECKPOINT_INVALID');
  if (data.playbook_version !== '0.1.0') fail('P5_CHECKPOINT_INVALID');
  assertNonEmptyString(data.build_id, 'P5_CHECKPOINT_INVALID');
  assertCandidateId(data.candidate_id, 'P5_CHECKPOINT_INVALID');
  assertLayer(data.layer, 'P5_CHECKPOINT_INVALID');
  if (!Number.isInteger(data.revision) || data.revision < 1) fail('P5_CHECKPOINT_INVALID');
  if (!CHECKPOINT_STATUSES.includes(data.status)) fail('P5_CHECKPOINT_INVALID');
  assertPredecessorHashes(data.upstream_accepted_hashes, data.layer, 'P5_CHECKPOINT_INVALID');
  assertCanonicalIds(data.selected_rule_ids, RULE_ID, 'P5_CHECKPOINT_INVALID');
  assertCanonicalIds(data.rejected_rule_ids, RULE_ID, 'P5_CHECKPOINT_INVALID');
  assertDistinct(data.selected_rule_ids, data.rejected_rule_ids, 'P5_CHECKPOINT_INVALID');
  assertContainer(data.design_intent, 'P5_CHECKPOINT_INVALID');
  assertRecipeFragment(data.recipe_fragment, data.layer, 'P5_CHECKPOINT_INVALID');
  assertFieldPatches(data.field_patches, 'P5_CHECKPOINT_INVALID');
  assertHashObject(data.compiled_artifact_hashes, 'P5_CHECKPOINT_INVALID');
  assertHardQa(data.hard_qa, 'P5_CHECKPOINT_INVALID');
  assertDesignReview(data.design_review, 'P5_CHECKPOINT_INVALID');
  assertExactArray(data.invalidates_downstream, INVALIDATES_BY_LAYER[data.layer], 'P5_CHECKPOINT_INVALID');
  assertReplayOrigin(data.replay_origin, 'P5_CHECKPOINT_INVALID');
  return data;
}

export function validateCheckpointEnvelope(value) {
  const data = canonicalObject(value, ENVELOPE_FIELDS, 'P5_CHECKPOINT_INVALID');
  assertHash(data.checkpoint_sha256, 'P5_CHECKPOINT_INVALID');
  const checkpoint = validateCheckpointPayload(data.checkpoint);
  if (sha256(stableJson(checkpoint)) !== data.checkpoint_sha256) fail('P5_CHECKPOINT_INVALID');
  return deepFreeze({ checkpoint_sha256: data.checkpoint_sha256, checkpoint });
}

export function validateEligibilityRecord(value) {
  const data = canonicalObject(value, ELIGIBILITY_FIELDS, 'P5_AUTHORITY_INVALID');
  if (typeof data.hard_qa_ok !== 'boolean') fail('P5_AUTHORITY_INVALID');
  assertCanonicalIds(data.unresolved_violated_core_rule_ids, RULE_ID, 'P5_AUTHORITY_INVALID');
  assertCanonicalIds(data.neutral_unknown_rule_ids, RULE_ID, 'P5_AUTHORITY_INVALID');
  assertCanonicalIds(data.neutral_not_applicable_rule_ids, RULE_ID, 'P5_AUTHORITY_INVALID');
  assertDistinct(data.unresolved_violated_core_rule_ids, data.neutral_unknown_rule_ids, 'P5_AUTHORITY_INVALID');
  assertDistinct(data.unresolved_violated_core_rule_ids, data.neutral_not_applicable_rule_ids, 'P5_AUTHORITY_INVALID');
  assertDistinct(data.neutral_unknown_rule_ids, data.neutral_not_applicable_rule_ids, 'P5_AUTHORITY_INVALID');
  if (!Number.isInteger(data.repair_budget_used) || ![0, 1].includes(data.repair_budget_used)) fail('P5_AUTHORITY_INVALID');
  if (!ELIGIBILITY_STATUSES.includes(data.status)) fail('P5_AUTHORITY_INVALID');
  if (data.status === 'eligible' && (!data.hard_qa_ok || data.unresolved_violated_core_rule_ids.length !== 0)) fail('P5_AUTHORITY_INVALID');
  return data;
}

export function validateChainManifest(value) {
  const data = canonicalObject(value, CHAIN_FIELDS, 'P5_CHECKPOINT_INVALID');
  assertSchemaVersion(data, 'P5_CHECKPOINT_INVALID');
  assertCandidateId(data.candidate_id, 'P5_CHECKPOINT_INVALID');
  if (!Number.isInteger(data.chain_revision) || data.chain_revision < 1) fail('P5_CHECKPOINT_INVALID');
  assertNullableHash(data.parent_chain_sha256, 'P5_CHECKPOINT_INVALID');
  assertFullLayerHashes(data.checkpoint_hashes, 'P5_CHECKPOINT_INVALID');
  for (const key of ['frozen_design_sha256', 'frozen_generator_context_sha256', 'blueprint_sha256', 'hard_qa_sha256', 'p4_review_sha256']) {
    assertHash(data[key], 'P5_CHECKPOINT_INVALID');
  }
  assertNullableHash(data.repair_transaction_sha256, 'P5_CHECKPOINT_INVALID');
  validateEligibilityRecord(data.eligibility);
  assertChainProvenance(data, 'P5_CHECKPOINT_INVALID');
  return deepFreeze(data);
}

export function validateRepairPreference(value) {
  const data = canonicalObject(value, PREFERENCE_FIELDS, 'P5_REPAIR_INVALID');
  const row = assertRepairTuple(data, 'P5_REPAIR_INVALID');
  if (!row.allowed_variant_ids.includes(data.variant_id)) fail('P5_REPAIR_INVALID');
  return data;
}

export function validateRepairRequest(value) {
  const data = canonicalObject(value, REQUEST_FIELDS, 'P5_REPAIR_INVALID');
  assertSchemaVersion(data, 'P5_REPAIR_INVALID');
  assertCandidateId(data.candidate_id, 'P5_REPAIR_INVALID');
  const row = assertRepairTuple(data, 'P5_REPAIR_INVALID');
  if (data.rule_id !== row.rule_id || !row.allowed_variant_ids.includes(data.variant_id)) fail('P5_REPAIR_INVALID');
  assertHash(data.base_checkpoint_sha256, 'P5_REPAIR_INVALID');
  return data;
}

export function validateResolvedPatch(value) {
  const data = canonicalObject(value, PATCH_FIELDS, 'P5_REPAIR_INVALID');
  assertSchemaVersion(data, 'P5_REPAIR_INVALID');
  if (data.compiler_version !== EXECUTE_COMPILER_VERSION) fail('P5_REPAIR_INVALID');
  assertCandidateId(data.candidate_id, 'P5_REPAIR_INVALID');
  const row = assertRepairTuple(data, 'P5_REPAIR_INVALID');
  if (data.rule_id !== row.rule_id || !row.allowed_variant_ids.includes(data.variant_id)) fail('P5_REPAIR_INVALID');
  const targetLayer = data.repair_operation_id.startsWith('repair:massing:') ? 'massing' : row.design_layer;
  if (data.target_layer !== targetLayer) fail('P5_REPAIR_INVALID');
  assertHash(data.base_checkpoint_sha256, 'P5_REPAIR_INVALID');
  assertArray(data.precondition_hashes, 'P5_REPAIR_INVALID');
  assertArray(data.effects, 'P5_REPAIR_INVALID');
  assertExactArray(data.invalidates_layers, row.invalidates_layers, 'P5_REPAIR_INVALID');
  return data;
}

export function validateSelectionRecord(value) {
  const data = canonicalObject(value, SELECTION_FIELDS, 'P5_AUTHORITY_INVALID');
  assertSchemaVersion(data, 'P5_AUTHORITY_INVALID');
  if (data.mode !== 'execute' || data.candidate_count !== 3) fail('P5_AUTHORITY_INVALID');
  assertArray(data.candidates, 'P5_AUTHORITY_INVALID');
  if (data.candidates.length !== 3) fail('P5_AUTHORITY_INVALID');
  let attempts = 0;
  for (const [index, row] of data.candidates.entries()) {
    assertExactObject(row, SELECTION_CANDIDATE_FIELDS, 'P5_AUTHORITY_INVALID');
    if (row.candidate_id !== `candidate-${String(index + 1).padStart(2, '0')}`) fail('P5_AUTHORITY_INVALID');
    assertSeed(row.seed, 'P5_AUTHORITY_INVALID');
    const hashes = ['current_chain_sha256', 'hard_qa_sha256', 'p4_review_sha256'];
    const nullCount = hashes.filter((key) => row[key] === null).length;
    if (nullCount !== 0 && nullCount !== hashes.length) fail('P5_AUTHORITY_INVALID');
    for (const key of hashes) assertNullableHash(row[key], 'P5_AUTHORITY_INVALID');
    validateEligibilityRecord(row.eligibility);
    if (!Number.isInteger(row.repair_attempt_count) || ![0, 1].includes(row.repair_attempt_count)) fail('P5_AUTHORITY_INVALID');
    attempts += row.repair_attempt_count;
  }
  if (!Number.isInteger(data.repair_attempt_count) || data.repair_attempt_count !== attempts) fail('P5_AUTHORITY_INVALID');
  if (data.selected_candidate_id === null || data.selected_chain_sha256 === null) {
    if (data.selected_candidate_id !== null || data.selected_chain_sha256 !== null) fail('P5_AUTHORITY_INVALID');
  } else {
    assertCandidateId(data.selected_candidate_id, 'P5_AUTHORITY_INVALID');
    assertHash(data.selected_chain_sha256, 'P5_AUTHORITY_INVALID');
    const selected = data.candidates.find((row) => row.candidate_id === data.selected_candidate_id);
    if (!selected || selected.eligibility.status !== 'eligible' || selected.current_chain_sha256 !== data.selected_chain_sha256) {
      fail('P5_AUTHORITY_INVALID');
    }
  }
  assertContainer(data.ranker_result, 'P5_AUTHORITY_INVALID');
  return deepFreeze(data);
}

export function validateExecuteSelectionManifest(value) {
  const data = canonicalObject(
    value,
    SELECTION_STORAGE_MANIFEST_FIELDS,
    'P5_AUTHORITY_INVALID'
  );
  assertSchemaVersion(data, 'P5_AUTHORITY_INVALID');
  assertExactArray(data.managed_paths, SELECTION_STORAGE_PATHS, 'P5_AUTHORITY_INVALID');
  assertExactObject(data.artifact_hashes, SELECTION_STORAGE_BODY_PATHS, 'P5_AUTHORITY_INVALID');
  for (const name of SELECTION_STORAGE_BODY_PATHS) {
    assertHash(data.artifact_hashes[name], 'P5_AUTHORITY_INVALID');
  }
  return deepFreeze(data);
}

function canonicalObject(value, fields, code) {
  const data = jsonClone(value, code);
  assertExactObject(data, fields, code);
  return data;
}

function jsonClone(value, code) {
  const ancestors = new WeakSet();
  const clone = (item) => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) fail(code);
      return item;
    }
    if (!item || typeof item !== 'object') fail(code);
    if (ancestors.has(item) || Object.getOwnPropertySymbols(item).length > 0) fail(code);
    ancestors.add(item);
    if (Array.isArray(item)) {
      if (Object.getPrototypeOf(item) !== Array.prototype) fail(code);
      const names = Object.getOwnPropertyNames(item);
      if (names.length !== item.length + 1 || !names.includes('length')) fail(code);
      const output = new Array(item.length);
      for (let index = 0; index < item.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
        output[index] = clone(descriptor.value);
      }
      ancestors.delete(item);
      return output;
    }
    if (Object.getPrototypeOf(item) !== Object.prototype) fail(code);
    const output = {};
    for (const key of Object.keys(item)) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
      output[key] = clone(descriptor.value);
    }
    if (Object.getOwnPropertyNames(item).length !== Object.keys(item).length) fail(code);
    ancestors.delete(item);
    return output;
  };
  return deepFreeze(clone(value));
}

function assertExactObject(value, fields, code) {
  if (!isPlainObject(value) || !sameKeySet(Object.keys(value), fields)) fail(code);
}

function assertSchemaVersion(value, code) {
  if (value.schema_version !== EXECUTE_SCHEMA_VERSION) fail(code);
}

function assertLayerIntentRows(value, code) {
  assertArray(value, code);
  if (value.length !== DESIGN_LAYER_ORDER.length) fail(code);
  for (const [index, row] of value.entries()) {
    assertExactObject(row, ['layer', 'intent'], code);
    if (row.layer !== DESIGN_LAYER_ORDER[index]) fail(code);
    assertBoundedProse(row.intent, code);
  }
}

function assertPredecessorHashes(value, layer, code) {
  const expected = DESIGN_LAYER_ORDER.slice(0, DESIGN_LAYER_ORDER.indexOf(layer));
  assertLayerHashRows(value, expected, code);
}

function assertFullLayerHashes(value, code) {
  assertLayerHashRows(value, DESIGN_LAYER_ORDER, code);
}

function assertLayerHashRows(value, layers, code) {
  assertArray(value, code);
  if (value.length !== layers.length) fail(code);
  for (const [index, row] of value.entries()) {
    assertExactObject(row, ['layer', 'checkpoint_sha256'], code);
    if (row.layer !== layers[index]) fail(code);
    assertHash(row.checkpoint_sha256, code);
  }
}

function assertHashObject(value, code) {
  if (!isPlainObject(value) || Object.keys(value).length === 0) fail(code);
  for (const hash of Object.values(value)) assertHash(hash, code);
}

function assertRecipeFragment(value, layer, code) {
  assertExactObject(value, RECIPE_FRAGMENT_FIELDS, code);
  if (value.layer !== layer) fail(code);
  assertContainer(value.payload, code);
}

function assertFieldPatches(value, code) {
  assertArray(value, code);
  for (const patch of value) {
    assertExactObject(patch, FIELD_PATCH_FIELDS, code);
    if (typeof patch.field !== 'string' || !VARIANT_ID.test(patch.field)) fail(code);
    if (patch.value === null || ['string', 'number', 'boolean'].includes(typeof patch.value)) continue;
    assertContainer(patch.value, code);
  }
}

function assertHardQa(value, code) {
  assertExactObject(value, HARD_QA_FIELDS, code);
  if (typeof value.hard_qa_ok !== 'boolean') fail(code);
  assertHash(value.hard_qa_sha256, code);
}

function assertDesignReview(value, code) {
  assertExactObject(value, DESIGN_REVIEW_FIELDS, code);
  assertHash(value.p4_review_sha256, code);
}

function assertReplayOrigin(value, code) {
  if (value === null) return;
  if (!isPlainObject(value) || value.kind !== 'replay') fail(code);
  assertExactObject(value, REPLAY_REPLAY_ORIGIN_FIELDS, code);
  assertHash(value.base_chain_sha256, code);
  assertHash(value.repair_transaction_sha256, code);
}

function assertChainProvenance(value, code) {
  if (value.created_from === 'initial') {
    if (value.chain_revision !== 1 || value.parent_chain_sha256 !== null || value.repair_transaction_sha256 !== null) {
      fail(code);
    }
    return;
  }
  if (value.created_from !== 'replay' || value.chain_revision <= 1) fail(code);
  assertHash(value.parent_chain_sha256, code);
  assertHash(value.repair_transaction_sha256, code);
}

function assertRepairTuple(value, code) {
  if (!REPAIR_ID.test(value.repair_operation_id) || !VARIANT_ID.test(value.variant_id)) fail(code);
  const row = ROW_BY_OPERATION.get(value.repair_operation_id);
  if (!row) fail(code);
  return row;
}

function assertCanonicalIds(value, pattern, code) {
  assertArray(value, code);
  let previous;
  for (const item of value) {
    if (typeof item !== 'string' || !pattern.test(item) || item === previous || previous !== undefined && item < previous) fail(code);
    previous = item;
  }
}

function assertUniqueIds(value, pattern, code) {
  assertArray(value, code);
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || !pattern.test(item) || seen.has(item)) fail(code);
    seen.add(item);
  }
}

function assertDistinct(left, right, code) {
  const values = new Set(left);
  if (right.some((item) => values.has(item))) fail(code);
}

function assertExactArray(value, expected, code) {
  if (!sameArray(value, expected)) fail(code);
}

function assertArray(value, code) {
  if (!Array.isArray(value)) fail(code);
}

function assertContainer(value, code) {
  if (!Array.isArray(value) && !isPlainObject(value)) fail(code);
}

function assertLayer(value, code) {
  if (!DESIGN_LAYER_ORDER.includes(value)) fail(code);
}

function assertCandidateId(value, code) {
  if (typeof value !== 'string' || !CANDIDATE_ID.test(value)) fail(code);
}

function assertSeed(value, code) {
  if (!Number.isInteger(value)) fail(code);
}

function assertHash(value, code) {
  if (typeof value !== 'string' || !HASH.test(value)) fail(code);
}

function assertNullableHash(value, code) {
  if (value !== null) assertHash(value, code);
}

function assertBoundedProse(value, code) {
  if (typeof value !== 'string' || Array.from(value).length > 800) fail(code);
}

function assertNonEmptyString(value, code) {
  if (typeof value !== 'string' || value.length === 0) fail(code);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function sameArray(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameKeySet(left, right) {
  return left.length === right.length && left.every((key) => right.includes(key));
}

function fail(code) {
  throw executeError(code);
}
