import {
  ASSESSMENT_STATUSES,
  EVALUATED_LAYERS,
  EVALUATOR_VERSION,
  FATAL_SHADOW_ERROR_CODES,
  LAYER_ORDER,
  LLM_DEGRADATION_CODES,
  PLAYBOOK_VERSION,
  SCHOOL_ID,
  SHADOW_OUTPUT_FILES,
  SHADOW_SCHEMA_VERSION
} from './constants.js';
import { deepFreeze, sha256, stableJson } from './canonical.js';

export const REVIEW_FIELDS = Object.freeze([
  'schema_version', 'evaluator_version', 'playbook_version', 'school_id',
  'input', 'rule_corpus_sha256', 'coverage', 'assessments', 'summary'
]);

export const ASSESSMENT_FIELDS = Object.freeze([
  'rule_id', 'rule_version', 'teaching_role', 'admission_status',
  'design_layer', 'check_id', 'checker_kind', 'status',
  'evidence_json_pointers', 'observations', 'missing_signals', 'unknown_ids',
  'repair_operation_id', 'repair_target_layer', 'invalidates_layers'
]);

const INPUT_FIELDS = Object.freeze([
  'blueprint_path', 'blueprint_sha256', 'workflow', 'seed'
]);
const COVERAGE_FIELDS = Object.freeze([
  'layer', 'status', 'rule_ids', 'unknown_ids', 'assessment_counts'
]);
const SUMMARY_FIELDS = Object.freeze([
  'assessment_count', 'core_procedure_count', 'case_pattern_count',
  'status_counts', 'layer_status_counts', 'missing_evidence_rule_count'
]);
const COUNTS_FIELDS = ASSESSMENT_STATUSES;
const EXPLANATION_FIELDS = Object.freeze([
  'schema_version', 'review_hash', 'mode', 'provider', 'status',
  'layer_explanations', 'rule_explanations', 'overall_unknowns', 'error_code'
]);
const LAYER_EXPLANATION_FIELDS = Object.freeze(['layer', 'explanation']);
const RULE_EXPLANATION_FIELDS = Object.freeze([
  'rule_id', 'status', 'repair_operation_id', 'explanation'
]);
const PROMPT_PACKET_FIELDS = Object.freeze([
  'schema_version', 'review_hash', 'playbook_version', 'school_id',
  'allowed_layers', 'authority', 'blueprint_prompt_data', 'rules',
  'output_contract'
]);
const PROMPT_RULE_FIELDS = Object.freeze([
  'rule_id', 'status', 'observations', 'missing_signals', 'repair_operation_id',
  'applicability', 'exclusions', 'intent', 'positive_signs', 'failure_modes'
]);
const PROMPT_AUTHORITY_FIELDS = Object.freeze([
  'immutable_fields', 'prohibited_additions', 'blueprint_prompt_role'
]);
const PROMPT_DATA_FIELDS = Object.freeze(['value', 'role']);
const OUTPUT_CONTRACT_FIELDS = Object.freeze(['format', 'permitted_rule_fields']);
const MANIFEST_FIELDS = Object.freeze([
  'schema_version', 'evaluator_version', 'playbook_version', 'school_id',
  'blueprint_sha256', 'rule_corpus_sha256', 'mode', 'explanation_status',
  'managed_paths', 'artifact_hashes'
]);
const ARTIFACT_HASH_FIELDS = Object.freeze([
  'review.json', 'prompt-packet.json', 'explanation.json', 'report.md'
]);
const SAFE_CODES = new Set([...FATAL_SHADOW_ERROR_CODES, ...LLM_DEGRADATION_CODES]);
const SHA256 = /^[a-f0-9]{64}$/u;
const RULE_ID = /^rule:[a-z0-9][a-z0-9.-]*$/u;
const CHECK_ID = /^check:[a-z0-9][a-z0-9:-]*$/u;
const REPAIR_ID = /^repair:[a-z0-9][a-z0-9:-]*$/u;
const UNKNOWN_ID = /^unknown:[a-z0-9][a-z0-9:-]*$/u;
const SAFE_DETAIL = /^[a-z][a-z0-9-]{0,79}$/u;

export class ArchitecturePlaybookShadowError extends Error {
  constructor(code, detailCode) {
    const safeCode = safeErrorCode(code, 'SHADOW_INSTALL_FAILED');
    const safeDetail = safeDetailCode(detailCode);
    super(safeDetail ? `${safeCode}: ${safeDetail}` : safeCode);
    this.name = 'ArchitecturePlaybookShadowError';
    this.code = safeCode;
    this.detailCode = safeDetail || undefined;
  }
}

export function shadowError(code, detailCode) {
  return new ArchitecturePlaybookShadowError(code, detailCode);
}

export function sanitizeShadowError(error, fallbackCode = 'SHADOW_INSTALL_FAILED') {
  const fallback = safeErrorCode(fallbackCode, 'SHADOW_INSTALL_FAILED');
  if (error instanceof ArchitecturePlaybookShadowError && SAFE_CODES.has(error.code)) {
    return shadowError(error.code, error.detailCode);
  }
  return shadowError(fallback);
}

export function validateReview(value) {
  assertExactObject(value, 'review', REVIEW_FIELDS, 'BLUEPRINT_INVALID');
  assertSchemaHeader(value, 'BLUEPRINT_INVALID');
  assertExactObject(value.input, 'review-input', INPUT_FIELDS, 'BLUEPRINT_INVALID');
  assertBlueprintPath(value.input.blueprint_path, 'BLUEPRINT_INVALID');
  assertSha256(value.input.blueprint_sha256, 'BLUEPRINT_INVALID');
  if (value.input.workflow !== 'construction_method_v1') fail('BLUEPRINT_INVALID', 'workflow');
  if (!Number.isInteger(value.input.seed) || value.input.seed < 0) fail('BLUEPRINT_INVALID', 'seed');
  assertSha256(value.rule_corpus_sha256, 'PLAYBOOK_CORPUS_INVALID');
  validateCoverage(value.coverage);
  if (!Array.isArray(value.assessments) || value.assessments.length !== 21) {
    fail('PLAYBOOK_CORPUS_INVALID', 'assessment-count');
  }
  const ruleIds = new Set();
  for (const [index, item] of value.assessments.entries()) {
    validateAssessment(item, index);
    if (ruleIds.has(item.rule_id)) fail('PLAYBOOK_CORPUS_INVALID', 'duplicate-rule-id');
    ruleIds.add(item.rule_id);
  }
  validateCoverageAssessmentCounts(value.coverage, value.assessments);
  const coreRuleCount = value.assessments.filter((item) => item.teaching_role === 'core-procedure').length;
  if (coreRuleCount !== 15 || value.assessments.length - coreRuleCount !== 6) {
    fail('PLAYBOOK_CORPUS_INVALID', 'assessment-role-count');
  }
  validateSummary(value.summary, value.assessments);
  return deepFreeze(value);
}

export function validatePromptPacket(value) {
  assertExactObject(value, 'prompt-packet', PROMPT_PACKET_FIELDS, 'BLUEPRINT_INVALID');
  if (value.schema_version !== SHADOW_SCHEMA_VERSION) fail('BLUEPRINT_INVALID', 'schema-version');
  assertSha256(value.review_hash, 'BLUEPRINT_INVALID');
  assertLiteral(value.playbook_version, PLAYBOOK_VERSION, 'BLUEPRINT_INVALID', 'playbook-version');
  assertLiteral(value.school_id, SCHOOL_ID, 'BLUEPRINT_INVALID', 'school-id');
  assertExactArray(value.allowed_layers, EVALUATED_LAYERS, 'BLUEPRINT_INVALID', 'allowed-layers');
  if (!Array.isArray(value.rules) || value.rules.length !== 21) fail('BLUEPRINT_INVALID', 'prompt-rule-count');
  const seen = new Set();
  for (const rule of value.rules) {
    assertExactObject(rule, 'prompt-rule', PROMPT_RULE_FIELDS, 'BLUEPRINT_INVALID');
    assertId(rule.rule_id, RULE_ID, 'BLUEPRINT_INVALID', 'rule-id');
    if (seen.has(rule.rule_id)) fail('BLUEPRINT_INVALID', 'duplicate-rule-id');
    seen.add(rule.rule_id);
    assertStatus(rule.status, 'BLUEPRINT_INVALID');
    assertNullableId(rule.repair_operation_id, REPAIR_ID, 'BLUEPRINT_INVALID', 'repair-operation-id');
    for (const field of [
      'observations', 'missing_signals', 'applicability', 'exclusions',
      'positive_signs', 'failure_modes'
    ]) assertStrings(rule[field], 'BLUEPRINT_INVALID', field, 12, false, 800);
    assertString(rule.intent, 'BLUEPRINT_INVALID', 'intent', 0, 800);
  }
  assertExactObject(value.authority, 'prompt-authority', PROMPT_AUTHORITY_FIELDS, 'BLUEPRINT_INVALID');
  assertExactArray(value.authority.immutable_fields, [
    'rule_ids', 'rule_order', 'statuses', 'repair_operation_ids', 'review_hash'
  ], 'BLUEPRINT_INVALID', 'immutable-fields');
  assertExactArray(value.authority.prohibited_additions, [
    'coordinates', 'block_ids', 'patches', 'scores', 'thresholds'
  ], 'BLUEPRINT_INVALID', 'prohibited-additions');
  assertLiteral(value.authority.blueprint_prompt_role, 'inert-data', 'BLUEPRINT_INVALID', 'blueprint-prompt-role');
  assertExactObject(value.blueprint_prompt_data, 'blueprint-prompt-data', PROMPT_DATA_FIELDS, 'BLUEPRINT_INVALID');
  assertString(value.blueprint_prompt_data.value, 'BLUEPRINT_INVALID', 'blueprint-prompt', 0, 2000);
  assertLiteral(value.blueprint_prompt_data.role, 'inert-data', 'BLUEPRINT_INVALID', 'blueprint-prompt-role');
  assertExactObject(value.output_contract, 'output-contract', OUTPUT_CONTRACT_FIELDS, 'BLUEPRINT_INVALID');
  assertLiteral(value.output_contract.format, 'explanation.json.v1', 'BLUEPRINT_INVALID', 'output-format');
  assertExactArray(value.output_contract.permitted_rule_fields, [
    'rule_id', 'status', 'repair_operation_id', 'explanation'
  ], 'BLUEPRINT_INVALID', 'permitted-rule-fields');
  return deepFreeze(value);
}

export function validateExplanation(value, review) {
  assertExactObject(value, 'explanation', EXPLANATION_FIELDS, 'LLM_OUTPUT_INVALID');
  if (value.schema_version !== SHADOW_SCHEMA_VERSION) fail('LLM_OUTPUT_INVALID', 'schema-version');
  assertSha256(value.review_hash, 'LLM_OUTPUT_INVALID');
  if (!['mock', 'llm'].includes(value.mode)) fail('LLM_OUTPUT_INVALID', 'mode');
  if (value.provider !== null) assertString(value.provider, 'LLM_OUTPUT_INVALID', 'provider', 1, 128);
  if (!['available', 'unavailable'].includes(value.status)) fail('LLM_OUTPUT_INVALID', 'status');
  if (value.status === 'available' && value.error_code !== null) fail('LLM_OUTPUT_INVALID', 'available-error');
  if (value.status === 'unavailable' && !LLM_DEGRADATION_CODES.includes(value.error_code)) {
    fail('LLM_OUTPUT_INVALID', 'unavailable-error');
  }
  validateLayerExplanations(value.layer_explanations, value.status);
  if (!Array.isArray(value.rule_explanations)) fail('LLM_OUTPUT_INVALID', 'rule-explanations');
  for (const item of value.rule_explanations) {
    assertExactObject(item, 'rule-explanation', RULE_EXPLANATION_FIELDS, 'LLM_OUTPUT_INVALID');
    assertId(item.rule_id, RULE_ID, 'LLM_OUTPUT_INVALID', 'rule-id');
    assertStatus(item.status, 'LLM_OUTPUT_INVALID');
    assertNullableId(item.repair_operation_id, REPAIR_ID, 'LLM_OUTPUT_INVALID', 'repair-operation-id');
    assertExplanationText(item.explanation, value.status, 'explanation');
  }
  assertStrings(value.overall_unknowns, 'LLM_OUTPUT_INVALID', 'overall-unknowns', 64, true);
  if (value.status === 'unavailable' && value.overall_unknowns.length !== 0) {
    fail('LLM_OUTPUT_INVALID', 'unavailable-unknowns');
  }

  const authoritativeReview = validateReview(review);
  if (value.review_hash !== sha256(stableJson(authoritativeReview))) {
    fail('LLM_AUTHORITY_VIOLATION', 'review-hash');
  }
  if (value.rule_explanations.length !== authoritativeReview.assessments.length) {
    fail('LLM_AUTHORITY_VIOLATION', 'rule-count');
  }
  for (const [index, assessment] of authoritativeReview.assessments.entries()) {
    const explanation = value.rule_explanations[index];
    if (
      explanation.rule_id !== assessment.rule_id
      || explanation.status !== assessment.status
      || explanation.repair_operation_id !== assessment.repair_operation_id
    ) fail('LLM_AUTHORITY_VIOLATION', 'rule-authority');
  }
  return deepFreeze(value);
}

export function validateManifest(value) {
  assertExactObject(value, 'manifest', MANIFEST_FIELDS, 'SHADOW_OUTPUT_OWNERSHIP');
  assertSchemaHeader(value, 'SHADOW_OUTPUT_OWNERSHIP');
  assertSha256(value.blueprint_sha256, 'SHADOW_OUTPUT_OWNERSHIP');
  assertSha256(value.rule_corpus_sha256, 'SHADOW_OUTPUT_OWNERSHIP');
  if (!['mock', 'llm'].includes(value.mode)) fail('SHADOW_OUTPUT_OWNERSHIP', 'mode');
  if (!['available', 'unavailable'].includes(value.explanation_status)) {
    fail('SHADOW_OUTPUT_OWNERSHIP', 'explanation-status');
  }
  assertExactArray(value.managed_paths, SHADOW_OUTPUT_FILES, 'SHADOW_OUTPUT_OWNERSHIP', 'managed-paths');
  assertExactObject(value.artifact_hashes, 'manifest-hashes', ARTIFACT_HASH_FIELDS, 'SHADOW_OUTPUT_OWNERSHIP');
  for (const file of ARTIFACT_HASH_FIELDS) assertSha256(value.artifact_hashes[file], 'SHADOW_OUTPUT_OWNERSHIP');
  return deepFreeze(value);
}

function validateAssessment(item, index) {
  assertExactObject(item, `assessment-${index}`, ASSESSMENT_FIELDS, 'PLAYBOOK_CORPUS_INVALID');
  assertId(item.rule_id, RULE_ID, 'PLAYBOOK_CORPUS_INVALID', 'rule-id');
  if (!Number.isInteger(item.rule_version) || item.rule_version < 1) {
    fail('PLAYBOOK_CORPUS_INVALID', 'rule-version');
  }
  if (!['core-procedure', 'case-pattern'].includes(item.teaching_role)) {
    fail('PLAYBOOK_CORPUS_INVALID', 'teaching-role');
  }
  if (!['admitted-advisory', 'manual-example-only'].includes(item.admission_status)) {
    fail('PLAYBOOK_CORPUS_INVALID', 'admission-status');
  }
  assertEvaluatedLayer(item.design_layer, 'PLAYBOOK_CORPUS_INVALID', 'design-layer');
  assertId(item.check_id, CHECK_ID, 'PLAYBOOK_CORPUS_INVALID', 'check-id');
  if (!['structural', 'evidence-required'].includes(item.checker_kind)) {
    fail('PLAYBOOK_CORPUS_INVALID', 'checker-kind');
  }
  assertStatus(item.status, 'BLUEPRINT_INVALID');
  assertJsonPointers(item.evidence_json_pointers);
  assertStrings(item.observations, 'PLAYBOOK_CORPUS_INVALID', 'observations');
  assertStrings(item.missing_signals, 'PLAYBOOK_CORPUS_INVALID', 'missing-signals');
  assertIds(item.unknown_ids, UNKNOWN_ID, 'PLAYBOOK_CORPUS_INVALID', 'unknown-ids');
  assertNullableId(item.repair_operation_id, REPAIR_ID, 'PLAYBOOK_CORPUS_INVALID', 'repair-operation-id');
  if (item.repair_target_layer !== null) assertLayer(item.repair_target_layer, 'PLAYBOOK_CORPUS_INVALID', 'repair-target-layer');
  assertOrderedLayers(item.invalidates_layers, 'PLAYBOOK_CORPUS_INVALID', 'invalidates-layers');

  if (item.teaching_role === 'case-pattern') {
    if (!['unknown', 'not-applicable'].includes(item.status)) {
      fail('PLAYBOOK_CORPUS_INVALID', 'case-pattern-status');
    }
    if (item.repair_operation_id !== null || item.repair_target_layer !== null) {
      fail('PLAYBOOK_CORPUS_INVALID', 'case-pattern-repair');
    }
  }
  if (item.status === 'violated') {
    assertNonEmptyStrings(item.evidence_json_pointers, 'evidence-json-pointers');
    assertNonEmptyStrings(item.observations, 'observations');
    assertId(item.repair_operation_id, REPAIR_ID, 'PLAYBOOK_CORPUS_INVALID', 'repair-operation-id');
    if (item.repair_target_layer === null) fail('PLAYBOOK_CORPUS_INVALID', 'repair-target-layer');
  } else if (item.repair_operation_id !== null || item.repair_target_layer !== null) {
    fail('PLAYBOOK_CORPUS_INVALID', 'repair-on-non-violation');
  }
  if (
    item.invalidates_layers.length > 0
    && (item.status !== 'violated' || item.teaching_role !== 'core-procedure')
  ) {
    fail('PLAYBOOK_CORPUS_INVALID', 'invalidations-without-core-violation');
  }
  if (item.status === 'unknown' && item.missing_signals.length + item.unknown_ids.length === 0) {
    fail('PLAYBOOK_CORPUS_INVALID', 'unknown-without-missing-evidence');
  }
  if (item.status === 'not-applicable') assertNonEmptyStrings(item.observations, 'not-applicable-observation');
}

function validateCoverage(coverage) {
  if (!Array.isArray(coverage) || coverage.length !== LAYER_ORDER.length) {
    fail('PLAYBOOK_CORPUS_INVALID', 'coverage-count');
  }
  for (const [index, item] of coverage.entries()) {
    assertExactObject(item, 'coverage', COVERAGE_FIELDS, 'PLAYBOOK_CORPUS_INVALID');
    if (item.layer !== LAYER_ORDER[index]) fail('PLAYBOOK_CORPUS_INVALID', 'coverage-order');
    const expected = EVALUATED_LAYERS.includes(item.layer) ? 'advisory-partial' : 'not-covered';
    if (item.status !== expected) fail('PLAYBOOK_CORPUS_INVALID', 'coverage-status');
    assertIds(item.rule_ids, RULE_ID, 'PLAYBOOK_CORPUS_INVALID', 'coverage-rule-ids');
    assertIds(item.unknown_ids, UNKNOWN_ID, 'PLAYBOOK_CORPUS_INVALID', 'coverage-unknown-ids');
    assertCounts(item.assessment_counts, 'coverage-assessment-counts');
  }
}

function validateCoverageAssessmentCounts(coverage, assessments) {
  for (const row of coverage) {
    validateCounts(
      row.assessment_counts,
      'coverage-assessment-counts',
      countsFor(assessments.filter((assessment) => assessment.design_layer === row.layer))
    );
  }
}

function validateSummary(summary, assessments) {
  assertExactObject(summary, 'summary', SUMMARY_FIELDS, 'PLAYBOOK_CORPUS_INVALID');
  const actualGlobal = countsFor(assessments);
  validateCounts(summary.status_counts, 'summary-status-counts', actualGlobal);
  if (!Array.isArray(summary.layer_status_counts) || summary.layer_status_counts.length !== LAYER_ORDER.length) {
    fail('PLAYBOOK_CORPUS_INVALID', 'layer-status-counts');
  }
  for (const [index, row] of summary.layer_status_counts.entries()) {
    assertExactObject(row, 'layer-status-count', ['layer', ...COUNTS_FIELDS], 'PLAYBOOK_CORPUS_INVALID');
    if (row.layer !== LAYER_ORDER[index]) fail('PLAYBOOK_CORPUS_INVALID', 'layer-status-counts');
    const { layer, ...statusCounts } = row;
    validateCounts(statusCounts, 'layer-status-count', countsFor(assessments.filter(
      (assessment) => assessment.design_layer === row.layer
    )));
  }
  const coreRuleCount = assessments.filter((item) => item.teaching_role === 'core-procedure').length;
  const casePatternCount = assessments.length - coreRuleCount;
  const missingEvidenceCount = assessments.filter((item) => item.status === 'unknown').length;
  if (summary.assessment_count !== assessments.length) fail('PLAYBOOK_CORPUS_INVALID', 'assessment-count');
  if (summary.core_procedure_count !== coreRuleCount) fail('PLAYBOOK_CORPUS_INVALID', 'core-procedure-count');
  if (summary.case_pattern_count !== casePatternCount) fail('PLAYBOOK_CORPUS_INVALID', 'case-pattern-count');
  if (summary.missing_evidence_rule_count !== missingEvidenceCount) fail('PLAYBOOK_CORPUS_INVALID', 'missing-evidence-rule-count');
}

function validateCounts(value, label, expected) {
  assertCounts(value, label);
  for (const status of ASSESSMENT_STATUSES) {
    if (value[status] !== expected[status]) {
      fail('PLAYBOOK_CORPUS_INVALID', 'summary-count');
    }
  }
}

function assertCounts(value, label) {
  assertExactObject(value, label, COUNTS_FIELDS, 'PLAYBOOK_CORPUS_INVALID');
  for (const status of ASSESSMENT_STATUSES) {
    if (!Number.isInteger(value[status]) || value[status] < 0) {
      fail('PLAYBOOK_CORPUS_INVALID', 'summary-count');
    }
  }
}

function validateLayerExplanations(value, status) {
  if (!Array.isArray(value) || value.length !== EVALUATED_LAYERS.length) {
    fail('LLM_OUTPUT_INVALID', 'layer-explanations');
  }
  for (const [index, item] of value.entries()) {
    assertExactObject(item, 'layer-explanation', LAYER_EXPLANATION_FIELDS, 'LLM_OUTPUT_INVALID');
    if (item.layer !== EVALUATED_LAYERS[index]) fail('LLM_OUTPUT_INVALID', 'layer-order');
    assertExplanationText(item.explanation, status, 'layer-explanation');
  }
}

function assertExplanationText(value, status, detail) {
  if (status === 'unavailable') {
    if (value !== '') fail('LLM_OUTPUT_INVALID', `unavailable-${detail}`);
    return;
  }
  assertString(value, 'LLM_OUTPUT_INVALID', detail, 1, 2048);
}

function assertSchemaHeader(value, code) {
  if (value.schema_version !== SHADOW_SCHEMA_VERSION) fail(code, 'schema-version');
  assertLiteral(value.evaluator_version, EVALUATOR_VERSION, code, 'evaluator-version');
  assertLiteral(value.playbook_version, PLAYBOOK_VERSION, code, 'playbook-version');
  assertLiteral(value.school_id, SCHOOL_ID, code, 'school-id');
}

function assertExactObject(value, label, fields, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label}-object`);
  const keys = Object.keys(value);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    fail(code, `${label}-fields`);
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) fail(code, `${label}-fields`);
  }
}

function assertExactArray(value, expected, code, detail) {
  if (!Array.isArray(value) || value.length !== expected.length) fail(code, detail);
  for (const [index, item] of expected.entries()) if (value[index] !== item) fail(code, detail);
}

function assertLiteral(value, expected, code, detail) {
  if (value !== expected) fail(code, detail);
}

function assertStatus(value, code) {
  if (!ASSESSMENT_STATUSES.includes(value)) fail(code, 'status');
}

function assertLayer(value, code, detail) {
  if (!LAYER_ORDER.includes(value)) fail(code, detail);
}

function assertEvaluatedLayer(value, code, detail) {
  if (!EVALUATED_LAYERS.includes(value)) fail(code, detail);
}

function assertOrderedLayers(value, code, detail) {
  if (!Array.isArray(value)) fail(code, detail);
  let last = -1;
  for (const layer of value) {
    assertLayer(layer, code, detail);
    const current = LAYER_ORDER.indexOf(layer);
    if (current <= last) fail(code, detail);
    last = current;
  }
}

function assertJsonPointers(value) {
  if (!Array.isArray(value)) fail('PLAYBOOK_CORPUS_INVALID', 'evidence-json-pointers');
  for (const pointer of value) {
    if (typeof pointer !== 'string' || !pointer.startsWith('/') || pointer.length > 512) {
      fail('PLAYBOOK_CORPUS_INVALID', 'evidence-json-pointers');
    }
  }
}

function assertNonEmptyStrings(value, detail) {
  if (!Array.isArray(value) || value.length === 0) fail('PLAYBOOK_CORPUS_INVALID', detail);
}

function assertStrings(value, code, detail, maximum = 128, unique = false, stringMaximum = 2048) {
  if (!Array.isArray(value) || value.length > maximum) fail(code, detail);
  const seen = new Set();
  for (const item of value) {
    assertString(item, code, detail, 1, stringMaximum);
    if (unique && (seen.has(item) || !seen.add(item))) fail(code, detail);
  }
}

function assertIds(value, expression, code, detail) {
  if (!Array.isArray(value) || value.length > 128) fail(code, detail);
  const seen = new Set();
  for (const item of value) {
    assertId(item, expression, code, detail);
    if (seen.has(item)) fail(code, detail);
    seen.add(item);
  }
}

function assertId(value, expression, code, detail) {
  if (typeof value !== 'string' || !expression.test(value)) fail(code, detail);
}

function assertNullableId(value, expression, code, detail) {
  if (value !== null) assertId(value, expression, code, detail);
}

function assertSha256(value, code) {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(code, 'sha256');
}

function assertBlueprintPath(value, code) {
  if (value !== 'blueprint.json') fail(code, 'blueprint-path');
}

function assertString(value, code, detail, minimum = 1, maximum = 512) {
  const length = typeof value === 'string' ? Array.from(value).length : 0;
  if (typeof value !== 'string' || length < minimum || length > maximum) fail(code, detail);
}

function countsFor(assessments) {
  const counts = { satisfied: 0, violated: 0, unknown: 0, 'not-applicable': 0 };
  for (const assessment of assessments) counts[assessment.status] += 1;
  return counts;
}

function safeErrorCode(value, fallback) {
  return SAFE_CODES.has(value) ? value : fallback;
}

function safeDetailCode(value) {
  return typeof value === 'string' && SAFE_DETAIL.test(value) ? value : undefined;
}

function fail(code, detailCode) {
  throw shadowError(code, detailCode);
}
