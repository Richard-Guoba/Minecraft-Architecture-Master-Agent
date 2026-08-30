import { deepFreeze, sha256, stableJson } from '../shadow/canonical.js';
import {
  P6_CAMERA_PROTOCOL,
  P6_CAMERA_VIEW_PURPOSES,
  P6_ERROR_CODES,
  P6_FIXED_REQUEST,
  P6_MINECRAFT_VERSION,
  P6_OBSERVATION_CRITERIA,
  P6_OBSERVATION_RATINGS,
  P6_PREFERENCE_CONFIDENCE,
  P6_PREFERENCE_VALUES,
  P6_PROTOCOL_VERSION,
  P6_REASON_TAGS,
  P6_SCHEMA_VERSION,
  P6_VIEW_IDS,
  P6_VISUAL_SETTINGS
} from './constants.js';

const HASH = /^[a-f0-9]{64}$/u;
const DECIMAL = /^-?(0|[1-9]\d*)\.\d{6}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const RULE_ID = /^rule:[a-z0-9][a-z0-9.-]*$/u;
const SOLUTION_ID = /^(playbook-candidate-0[1-3]|baseline-current)$/u;
const OPAQUE_SOLUTION_ID = /^opaque-solution-[a-z0-9]+$/u;
const PAIR_ID = /^pair-\d{2}$/u;
const OBSERVATION_ID = /^observation-\d{2,}$/u;

const FIXED_REQUEST_FIELDS = Object.freeze([
  'schema_version',
  'protocol_version',
  'candidate_count',
  'candidate_force_rounds',
  'candidate_rounds',
  'minecraft_version',
  'mode',
  'playbook_version',
  'prompt',
  'root_seed'
]);
const VISUAL_SETTINGS_FIELDS = Object.freeze([
  'schema_version',
  'protocol_version',
  'aspect_ratio',
  'clouds',
  'default_resource_pack',
  'entities_present',
  'fancy_graphics',
  'height_px',
  'hidden_overlays',
  'horizontal_fov_degrees',
  'particles_present',
  'shader_pack',
  'time_of_day',
  'weather',
  'width_px'
]);
const CAMERA_MANIFEST_FIELDS = Object.freeze([
  'schema_version',
  'protocol_version',
  'solution_id',
  'blueprint_sha256',
  'build_function_sha256',
  'request_sha256',
  'settings_sha256',
  'bounds',
  'main_entry',
  'views'
]);
const BOUNDS_FIELDS = Object.freeze(['min_x', 'min_y', 'min_z', 'max_x', 'max_y', 'max_z']);
const MAIN_ENTRY_FIELDS = Object.freeze(['center_x', 'center_y', 'center_z', 'facing']);
const CAMERA_VIEW_FIELDS = Object.freeze(['view_id', 'purpose', 'horizontal_fov_degrees', 'position', 'target']);
const ENTRY_VIEW_FIELDS = Object.freeze([...CAMERA_VIEW_FIELDS, 'entry_offset_blocks']);
const POINT_FIELDS = Object.freeze(['x', 'y', 'z']);
const COHORT_MANIFEST_FIELDS = Object.freeze([
  'schema_version',
  'protocol_version',
  'cohort_id',
  'request_sha256',
  'visual_settings_sha256',
  'solutions'
]);
const COHORT_SOLUTION_FIELDS = Object.freeze([
  'solution_id',
  'playbook_mode',
  'slot_index',
  'root_seed',
  'prompt_sha256',
  'blueprint_sha256',
  'operation_list_sha256',
  'build_function_sha256',
  'hard_qa_ok',
  'minecraft_version'
]);
const CAPTURE_MANIFEST_FIELDS = Object.freeze([
  'schema_version',
  'protocol_version',
  'cohort_sha256',
  'camera_manifest_sha256',
  'request_sha256',
  'visual_settings_sha256',
  'environment',
  'images'
]);
const CAPTURE_ENVIRONMENT_FIELDS = Object.freeze([
  'minecraft_version',
  'capture_kind',
  'environment_sha256',
  'client_options_sha256',
  'world_identifier_sha256'
]);
const CAPTURE_IMAGE_FIELDS = Object.freeze([
  'screenshot_id',
  'solution_id',
  'view_id',
  'width_px',
  'height_px',
  'environment_sha256',
  'image_sha256'
]);
const OBSERVATION_FIELDS = Object.freeze([
  'schema_version',
  'protocol_version',
  'observation_id',
  'solution_authority_hash',
  'capture_manifest_hash',
  'view_ids',
  'design_layer',
  'criterion',
  'rating',
  'observable_paraphrase',
  'evidence_regions',
  'rule_ids',
  'limitations',
  'reviewer_kind',
  'reviewed_at'
]);
const EVIDENCE_REGION_FIELDS = Object.freeze(['screenshot_id', 'region_kind', 'region']);
const RECT_REGION_FIELDS = Object.freeze(['x', 'y', 'width', 'height']);
const COMPARISON_MANIFEST_FIELDS = Object.freeze([
  'schema_version',
  'protocol_version',
  'cohort_sha256',
  'capture_manifest_hash',
  'identity_map_sha256',
  'randomization_sha256',
  'solution_codes',
  'pairs',
  'generated_at'
]);
const COMPARISON_PAIR_FIELDS = Object.freeze(['pair_id', 'left_code', 'right_code', 'view_ids']);
const PREFERENCE_RECORD_FIELDS = Object.freeze([
  'schema_version',
  'protocol_version',
  'comparison_manifest_hash',
  'pair_id',
  'choice',
  'confidence',
  'reason_tags',
  'rationale',
  'reviewer_kind',
  'sealed_at'
]);
const GATE_RESULT_FIELDS = Object.freeze([
  'schema_version',
  'protocol_version',
  'cohort_sha256',
  'capture_manifest_hash',
  'comparison_manifest_hash',
  'sealed_preference_hashes',
  'outcome',
  'next_action',
  'summary_counts',
  'generated_at'
]);
const SUMMARY_COUNTS_FIELDS = Object.freeze([
  'solution_count',
  'required_view_count',
  'formal_capture_count',
  'preference_record_count'
]);
const OBSERVATION_LAYERS = Object.freeze([
  'massing',
  'structure',
  'roof',
  'facade',
  'materials',
  'scene'
]);
const NEXT_ACTIONS = Object.freeze([
  'open-p7',
  'review-rule-to-checker-mapping',
  'review-executable-design-layer-expression',
  'review-frozen-cohort-generation',
  'review-camera-capture-validity',
  'review-visual-observation-wording'
]);
const GATE_OUTCOMES = Object.freeze([
  'playbook-supported',
  'inconclusive',
  'baseline-supported',
  'capture-invalid'
]);

export class P6ContractError extends Error {
  constructor(code, detail = null) {
    const safeCode = safeErrorCode(code, 'P6_OPTIONS_INVALID');
    super(safeCode);
    this.name = 'P6ContractError';
    this.code = safeCode;
    this.rawCode = code;
    if (detail !== null) this.detail = String(detail);
  }
}

export function p6Error(code, detail = null) {
  return new P6ContractError(code, detail);
}

export function sanitizeP6Error(error, fallbackCode = 'P6_INSTALL_FAILED') {
  if (error instanceof P6ContractError && P6_ERROR_CODES.includes(error.rawCode)) {
    return p6Error(error.code);
  }
  return p6Error(fallbackCode);
}

export function validateFixedRequest(value) {
  const data = canonicalObject(value, FIXED_REQUEST_FIELDS, 'P6_OPTIONS_INVALID');
  assertSchemaHeader(data, 'P6_OPTIONS_INVALID');
  assertLiteral(data.prompt, P6_FIXED_REQUEST.prompt, 'P6_OPTIONS_INVALID');
  assertLiteral(data.root_seed, P6_FIXED_REQUEST.root_seed, 'P6_OPTIONS_INVALID');
  assertLiteral(data.playbook_version, P6_FIXED_REQUEST.playbook_version, 'P6_OPTIONS_INVALID');
  assertLiteral(data.minecraft_version, P6_FIXED_REQUEST.minecraft_version, 'P6_OPTIONS_INVALID');
  assertLiteral(data.mode, P6_FIXED_REQUEST.mode, 'P6_OPTIONS_INVALID');
  assertLiteral(data.candidate_count, P6_FIXED_REQUEST.candidate_count, 'P6_OPTIONS_INVALID');
  assertLiteral(data.candidate_rounds, P6_FIXED_REQUEST.candidate_rounds, 'P6_OPTIONS_INVALID');
  assertLiteral(data.candidate_force_rounds, P6_FIXED_REQUEST.candidate_force_rounds, 'P6_OPTIONS_INVALID');
  return data;
}

export function validateVisualSettings(value) {
  const data = canonicalObject(value, VISUAL_SETTINGS_FIELDS, 'P6_OPTIONS_INVALID');
  assertSchemaHeader(data, 'P6_OPTIONS_INVALID');
  assertLiteral(data.width_px, P6_VISUAL_SETTINGS.width_px, 'P6_OPTIONS_INVALID');
  assertLiteral(data.height_px, P6_VISUAL_SETTINGS.height_px, 'P6_OPTIONS_INVALID');
  assertLiteral(data.aspect_ratio, P6_VISUAL_SETTINGS.aspect_ratio, 'P6_OPTIONS_INVALID');
  assertLiteral(data.horizontal_fov_degrees, P6_VISUAL_SETTINGS.horizontal_fov_degrees, 'P6_OPTIONS_INVALID');
  assertLiteral(data.weather, P6_VISUAL_SETTINGS.weather, 'P6_OPTIONS_INVALID');
  assertLiteral(data.time_of_day, P6_VISUAL_SETTINGS.time_of_day, 'P6_OPTIONS_INVALID');
  assertLiteral(data.default_resource_pack, true, 'P6_OPTIONS_INVALID');
  assertLiteral(data.shader_pack, 'none', 'P6_OPTIONS_INVALID');
  assertLiteral(data.fancy_graphics, true, 'P6_OPTIONS_INVALID');
  assertLiteral(data.clouds, 'off', 'P6_OPTIONS_INVALID');
  assertLiteral(data.entities_present, false, 'P6_OPTIONS_INVALID');
  assertLiteral(data.particles_present, false, 'P6_OPTIONS_INVALID');
  assertExactArray(data.hidden_overlays, P6_VISUAL_SETTINGS.hidden_overlays, 'P6_OPTIONS_INVALID');
  return data;
}

export function validateCameraManifest(value) {
  const data = canonicalObject(value, CAMERA_MANIFEST_FIELDS, 'P6_CAMERA_PROTOCOL_INVALID');
  assertSchemaHeader(data, 'P6_CAMERA_PROTOCOL_INVALID');
  assertSolutionId(data.solution_id, 'P6_CAMERA_PROTOCOL_INVALID');
  assertHash(data.blueprint_sha256, 'P6_CAMERA_PROTOCOL_INVALID');
  assertHash(data.build_function_sha256, 'P6_CAMERA_PROTOCOL_INVALID');
  assertHash(data.request_sha256, 'P6_CAMERA_PROTOCOL_INVALID');
  assertHash(data.settings_sha256, 'P6_CAMERA_PROTOCOL_INVALID');
  assertExactObject(data.bounds, BOUNDS_FIELDS, 'P6_CAMERA_PROTOCOL_INVALID');
  for (const field of BOUNDS_FIELDS) assertInteger(data.bounds[field], 'P6_CAMERA_PROTOCOL_INVALID');
  if (data.bounds.min_x > data.bounds.max_x
    || data.bounds.min_y > data.bounds.max_y
    || data.bounds.min_z > data.bounds.max_z) fail('P6_CAMERA_PROTOCOL_INVALID', 'bounds-order');
  assertExactObject(data.main_entry, MAIN_ENTRY_FIELDS, 'P6_CAMERA_PROTOCOL_INVALID');
  assertDecimal(data.main_entry.center_x, 'P6_CAMERA_PROTOCOL_INVALID');
  assertDecimal(data.main_entry.center_y, 'P6_CAMERA_PROTOCOL_INVALID');
  assertDecimal(data.main_entry.center_z, 'P6_CAMERA_PROTOCOL_INVALID');
  assertLiteral(data.main_entry.facing, 'south', 'P6_CAMERA_PROTOCOL_INVALID');
  if (!Array.isArray(data.views) || data.views.length !== P6_VIEW_IDS.length) fail('P6_CAMERA_PROTOCOL_INVALID', 'views');
  const seen = new Set();
  for (const [index, view] of data.views.entries()) {
    const expectedViewId = P6_VIEW_IDS[index];
    const expectedPurpose = P6_CAMERA_VIEW_PURPOSES[expectedViewId];
    const isEntry = expectedViewId === 'entry-eye';
    assertExactObject(view, isEntry ? ENTRY_VIEW_FIELDS : CAMERA_VIEW_FIELDS, 'P6_CAMERA_PROTOCOL_INVALID');
    assertLiteral(view.view_id, expectedViewId, 'P6_CAMERA_PROTOCOL_INVALID');
    assertLiteral(view.purpose, expectedPurpose, 'P6_CAMERA_PROTOCOL_INVALID');
    assertLiteral(view.horizontal_fov_degrees, P6_VISUAL_SETTINGS.horizontal_fov_degrees, 'P6_CAMERA_PROTOCOL_INVALID');
    assertPoint(view.position, 'P6_CAMERA_PROTOCOL_INVALID');
    assertPoint(view.target, 'P6_CAMERA_PROTOCOL_INVALID');
    if (seen.has(view.view_id)) fail('P6_CAMERA_PROTOCOL_INVALID', 'duplicate-view-id');
    seen.add(view.view_id);
    if (isEntry) assertLiteral(view.entry_offset_blocks, P6_CAMERA_PROTOCOL.entry_eye_offset_blocks, 'P6_CAMERA_PROTOCOL_INVALID');
  }
  return data;
}

export function validateCohortManifest(value) {
  const data = canonicalObject(value, COHORT_MANIFEST_FIELDS, 'P6_COHORT_INCOMPLETE');
  assertSchemaHeader(data, 'P6_COHORT_INCOMPLETE');
  assertLiteral(data.cohort_id, 'p6-v0.1', 'P6_COHORT_INCOMPLETE');
  assertHash(data.request_sha256, 'P6_COHORT_INCOMPLETE');
  assertHash(data.visual_settings_sha256, 'P6_COHORT_INCOMPLETE');
  if (!Array.isArray(data.solutions) || data.solutions.length !== 4) fail('P6_COHORT_INCOMPLETE', 'solution-count');
  const expected = [
    ['playbook-candidate-01', 'execute', 1],
    ['playbook-candidate-02', 'execute', 2],
    ['playbook-candidate-03', 'execute', 3],
    ['baseline-current', 'off', 0]
  ];
  for (const [index, solution] of data.solutions.entries()) {
    assertExactObject(solution, COHORT_SOLUTION_FIELDS, 'P6_COHORT_INCOMPLETE');
    const [solutionId, playbookMode, slotIndex] = expected[index];
    assertLiteral(solution.solution_id, solutionId, 'P6_COHORT_INCOMPLETE');
    assertLiteral(solution.playbook_mode, playbookMode, 'P6_COHORT_INCOMPLETE');
    assertLiteral(solution.slot_index, slotIndex, 'P6_COHORT_INCOMPLETE');
    assertLiteral(solution.root_seed, P6_FIXED_REQUEST.root_seed, 'P6_COHORT_INCOMPLETE');
    assertHash(solution.prompt_sha256, 'P6_COHORT_INCOMPLETE');
    assertHash(solution.blueprint_sha256, 'P6_COHORT_INCOMPLETE');
    assertHash(solution.operation_list_sha256, 'P6_COHORT_INCOMPLETE');
    assertHash(solution.build_function_sha256, 'P6_COHORT_INCOMPLETE');
    assertLiteral(solution.hard_qa_ok, true, 'P6_COHORT_INCOMPLETE');
    assertLiteral(solution.minecraft_version, P6_MINECRAFT_VERSION, 'P6_COHORT_INCOMPLETE');
  }
  return data;
}

export function validateCaptureManifest(value) {
  const data = canonicalObject(value, CAPTURE_MANIFEST_FIELDS, 'P6_CAPTURE_INVALID');
  assertSchemaHeader(data, 'P6_CAPTURE_INVALID');
  assertHash(data.cohort_sha256, 'P6_CAPTURE_INVALID');
  assertHash(data.camera_manifest_sha256, 'P6_CAPTURE_INVALID');
  assertHash(data.request_sha256, 'P6_CAPTURE_INVALID');
  assertHash(data.visual_settings_sha256, 'P6_CAPTURE_INVALID');
  assertExactObject(data.environment, CAPTURE_ENVIRONMENT_FIELDS, 'P6_CAPTURE_INVALID');
  assertLiteral(data.environment.minecraft_version, P6_MINECRAFT_VERSION, 'P6_CAPTURE_INVALID');
  if (!['reference-render', 'minecraft-capture'].includes(data.environment.capture_kind)) {
    fail('P6_CAPTURE_INVALID', 'capture-kind');
  }
  assertHash(data.environment.environment_sha256, 'P6_CAPTURE_INVALID');
  assertHash(data.environment.client_options_sha256, 'P6_CAPTURE_INVALID');
  assertHash(data.environment.world_identifier_sha256, 'P6_CAPTURE_INVALID');
  if (!Array.isArray(data.images) || data.images.length !== 24) fail('P6_CAPTURE_INVALID', 'image-count');
  const ids = new Set();
  const combos = new Set();
  const solutionIds = new Set();
  for (const image of data.images) {
    assertExactObject(image, CAPTURE_IMAGE_FIELDS, 'P6_CAPTURE_INVALID');
    assertNonEmptyString(image.screenshot_id, 'P6_CAPTURE_INVALID');
    if (!OPAQUE_SOLUTION_ID.test(image.solution_id)) fail('P6_CAPTURE_INVALID', 'solution-id');
    if (!P6_VIEW_IDS.includes(image.view_id)) fail('P6_CAPTURE_INVALID', 'view-id');
    assertLiteral(image.width_px, P6_VISUAL_SETTINGS.width_px, 'P6_CAPTURE_INVALID');
    assertLiteral(image.height_px, P6_VISUAL_SETTINGS.height_px, 'P6_CAPTURE_INVALID');
    assertHash(image.environment_sha256, 'P6_CAPTURE_INVALID');
    assertHash(image.image_sha256, 'P6_CAPTURE_INVALID');
    if (image.environment_sha256 !== data.environment.environment_sha256) fail('P6_CAPTURE_INVALID', 'environment-drift');
    if (ids.has(image.screenshot_id)) fail('P6_CAPTURE_INVALID', 'duplicate-screenshot-id');
    ids.add(image.screenshot_id);
    const combo = `${image.solution_id}:${image.view_id}`;
    if (combos.has(combo)) fail('P6_CAPTURE_INVALID', 'duplicate-capture');
    combos.add(combo);
    solutionIds.add(image.solution_id);
  }
  if (solutionIds.size !== 4) fail('P6_CAPTURE_INVALID', 'solution-count');
  for (const solutionId of solutionIds) {
    for (const viewId of P6_VIEW_IDS) {
      if (!combos.has(`${solutionId}:${viewId}`)) fail('P6_CAPTURE_INVALID', 'missing-capture');
    }
  }
  return data;
}

export function validateObservation(value) {
  const data = canonicalObject(value, OBSERVATION_FIELDS, 'P6_OBSERVATION_INVALID');
  assertSchemaHeader(data, 'P6_OBSERVATION_INVALID');
  if (!OBSERVATION_ID.test(data.observation_id)) fail('P6_OBSERVATION_INVALID', 'observation-id');
  assertHash(data.solution_authority_hash, 'P6_OBSERVATION_INVALID');
  assertHash(data.capture_manifest_hash, 'P6_OBSERVATION_INVALID');
  assertOrderedSubset(data.view_ids, P6_VIEW_IDS, 'P6_OBSERVATION_INVALID');
  if (!OBSERVATION_LAYERS.includes(data.design_layer)) fail('P6_OBSERVATION_INVALID', 'design-layer');
  if (!P6_OBSERVATION_CRITERIA.includes(data.criterion)) fail('P6_OBSERVATION_INVALID', 'criterion');
  if (!P6_OBSERVATION_RATINGS.includes(data.rating)) fail('P6_OBSERVATION_INVALID', 'rating');
  assertText(data.observable_paraphrase, 400, 'P6_OBSERVATION_INVALID');
  if (!Array.isArray(data.evidence_regions) || data.evidence_regions.length === 0) fail('P6_OBSERVATION_INVALID', 'evidence-regions');
  for (const region of data.evidence_regions) validateEvidenceRegion(region);
  assertUniquePatternArray(data.rule_ids, RULE_ID, 'P6_OBSERVATION_INVALID');
  assertStringArray(data.limitations, 8, 200, 'P6_OBSERVATION_INVALID');
  if (!['human', 'model-assisted'].includes(data.reviewer_kind)) fail('P6_OBSERVATION_INVALID', 'reviewer-kind');
  assertIsoUtc(data.reviewed_at, 'P6_OBSERVATION_INVALID');
  return data;
}

export function validateComparisonManifest(value) {
  const data = canonicalObject(value, COMPARISON_MANIFEST_FIELDS, 'P6_COMPARISON_INVALID');
  assertSchemaHeader(data, 'P6_COMPARISON_INVALID');
  assertHash(data.cohort_sha256, 'P6_COMPARISON_INVALID');
  assertHash(data.capture_manifest_hash, 'P6_COMPARISON_INVALID');
  assertHash(data.identity_map_sha256, 'P6_COMPARISON_INVALID');
  assertHash(data.randomization_sha256, 'P6_COMPARISON_INVALID');
  assertUniquePatternArray(data.solution_codes, OPAQUE_SOLUTION_ID, 'P6_COMPARISON_INVALID');
  if (data.solution_codes.length !== 4) fail('P6_COMPARISON_INVALID', 'solution-codes');
  if (!Array.isArray(data.pairs) || data.pairs.length !== 6) fail('P6_COMPARISON_INVALID', 'pair-count');
  const pairIds = new Set();
  const seenPairs = new Set();
  for (const pair of data.pairs) {
    assertExactObject(pair, COMPARISON_PAIR_FIELDS, 'P6_COMPARISON_INVALID');
    if (!PAIR_ID.test(pair.pair_id)) fail('P6_COMPARISON_INVALID', 'pair-id');
    if (!data.solution_codes.includes(pair.left_code) || !data.solution_codes.includes(pair.right_code)) {
      fail('P6_COMPARISON_INVALID', 'pair-solution');
    }
    if (pair.left_code === pair.right_code) fail('P6_COMPARISON_INVALID', 'pair-self');
    assertExactArray(pair.view_ids, P6_VIEW_IDS, 'P6_COMPARISON_INVALID');
    if (pairIds.has(pair.pair_id)) fail('P6_COMPARISON_INVALID', 'duplicate-pair-id');
    pairIds.add(pair.pair_id);
    const canonicalPair = [pair.left_code, pair.right_code].sort().join(':');
    if (seenPairs.has(canonicalPair)) fail('P6_COMPARISON_INVALID', 'duplicate-pair');
    seenPairs.add(canonicalPair);
  }
  if (seenPairs.size !== 6) fail('P6_COMPARISON_INVALID', 'pair-coverage');
  assertIsoUtc(data.generated_at, 'P6_COMPARISON_INVALID');
  return data;
}

export function validatePreferenceRecord(value) {
  const data = canonicalObject(value, PREFERENCE_RECORD_FIELDS, 'P6_COMPARISON_INVALID');
  assertSchemaHeader(data, 'P6_COMPARISON_INVALID');
  assertHash(data.comparison_manifest_hash, 'P6_COMPARISON_INVALID');
  if (!PAIR_ID.test(data.pair_id)) fail('P6_COMPARISON_INVALID', 'pair-id');
  if (!P6_PREFERENCE_VALUES.includes(data.choice)) fail('P6_COMPARISON_INVALID', 'choice');
  if (!P6_PREFERENCE_CONFIDENCE.includes(data.confidence)) fail('P6_COMPARISON_INVALID', 'confidence');
  assertOrderedSubset(data.reason_tags, P6_REASON_TAGS, 'P6_COMPARISON_INVALID');
  if (data.rationale !== null) assertText(data.rationale, 400, 'P6_COMPARISON_INVALID');
  assertLiteral(data.reviewer_kind, 'human', 'P6_COMPARISON_INVALID');
  assertIsoUtc(data.sealed_at, 'P6_COMPARISON_INVALID');
  return data;
}

export function validateGateResult(value) {
  const data = canonicalObject(value, GATE_RESULT_FIELDS, 'P6_GATE_FAILED');
  assertSchemaHeader(data, 'P6_GATE_FAILED');
  assertHash(data.cohort_sha256, 'P6_GATE_FAILED');
  assertHash(data.capture_manifest_hash, 'P6_GATE_FAILED');
  assertHash(data.comparison_manifest_hash, 'P6_GATE_FAILED');
  if (!Array.isArray(data.sealed_preference_hashes) || data.sealed_preference_hashes.length !== 6) fail('P6_GATE_FAILED', 'preference-hashes');
  const hashes = new Set();
  for (const hash of data.sealed_preference_hashes) {
    assertHash(hash, 'P6_GATE_FAILED');
    if (hashes.has(hash)) fail('P6_GATE_FAILED', 'duplicate-preference-hash');
    hashes.add(hash);
  }
  if (!GATE_OUTCOMES.includes(data.outcome)) fail('P6_GATE_FAILED', 'outcome');
  if (!NEXT_ACTIONS.includes(data.next_action)) fail('P6_GATE_FAILED', 'next-action');
  if (data.outcome === 'playbook-supported') {
    assertLiteral(data.next_action, 'open-p7', 'P6_GATE_FAILED');
  } else if (data.next_action === 'open-p7') {
    fail('P6_GATE_FAILED', 'next-action');
  }
  assertExactObject(data.summary_counts, SUMMARY_COUNTS_FIELDS, 'P6_GATE_FAILED');
  assertLiteral(data.summary_counts.solution_count, 4, 'P6_GATE_FAILED');
  assertLiteral(data.summary_counts.required_view_count, 6, 'P6_GATE_FAILED');
  assertLiteral(data.summary_counts.formal_capture_count, 24, 'P6_GATE_FAILED');
  assertLiteral(data.summary_counts.preference_record_count, 6, 'P6_GATE_FAILED');
  assertIsoUtc(data.generated_at, 'P6_GATE_FAILED');
  return data;
}

export function canonicalP6(value, validator) {
  const validated = validator(value);
  const bytes = stableJson(validated);
  return deepFreeze({ value: validated, bytes, sha256: sha256(bytes) });
}

function validateEvidenceRegion(value) {
  assertExactObject(value, EVIDENCE_REGION_FIELDS, 'P6_OBSERVATION_INVALID');
  assertNonEmptyString(value.screenshot_id, 'P6_OBSERVATION_INVALID');
  if (value.region_kind === 'whole-frame') {
    if (value.region !== null) fail('P6_OBSERVATION_INVALID', 'region');
    return;
  }
  if (value.region_kind !== 'rect') fail('P6_OBSERVATION_INVALID', 'region-kind');
  assertExactObject(value.region, RECT_REGION_FIELDS, 'P6_OBSERVATION_INVALID');
  for (const field of RECT_REGION_FIELDS) {
    assertInteger(value.region[field], 'P6_OBSERVATION_INVALID');
    if (value.region[field] < 0) fail('P6_OBSERVATION_INVALID', 'region-negative');
  }
  if (value.region.width < 1 || value.region.height < 1) fail('P6_OBSERVATION_INVALID', 'region-size');
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

function assertSchemaHeader(value, code) {
  assertLiteral(value.schema_version, P6_SCHEMA_VERSION, code);
  assertLiteral(value.protocol_version, P6_PROTOCOL_VERSION, code);
}

function assertSolutionId(value, code) {
  if (typeof value !== 'string' || !SOLUTION_ID.test(value)) fail(code, 'solution-id');
}

function assertPoint(value, code) {
  assertExactObject(value, POINT_FIELDS, code);
  for (const field of POINT_FIELDS) assertDecimal(value[field], code);
}

function assertOrderedSubset(value, allowed, code) {
  if (!Array.isArray(value)) fail(code);
  const seen = new Set();
  let previous = -1;
  for (const item of value) {
    if (typeof item !== 'string') fail(code);
    const index = allowed.indexOf(item);
    if (index < 0 || seen.has(item) || index <= previous) fail(code);
    seen.add(item);
    previous = index;
  }
}

function assertUniquePatternArray(value, pattern, code) {
  if (!Array.isArray(value)) fail(code);
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || !pattern.test(item) || seen.has(item)) fail(code);
    seen.add(item);
  }
}

function assertStringArray(value, maximumItems, maximumLength, code) {
  if (!Array.isArray(value) || value.length > maximumItems) fail(code);
  for (const item of value) assertText(item, maximumLength, code);
}

function assertNonEmptyString(value, code) {
  if (typeof value !== 'string' || value.length === 0) fail(code);
}

function assertText(value, maximumLength, code) {
  if (typeof value !== 'string' || value.length === 0 || Array.from(value).length > maximumLength) fail(code);
}

function assertIsoUtc(value, code) {
  if (typeof value !== 'string' || !ISO_UTC.test(value)) fail(code);
}

function assertHash(value, code) {
  if (typeof value !== 'string' || !HASH.test(value)) fail(code);
}

function assertDecimal(value, code) {
  if (typeof value !== 'string' || !DECIMAL.test(value)) fail(code);
}

function assertInteger(value, code) {
  if (!Number.isInteger(value)) fail(code);
}

function assertLiteral(value, expected, code) {
  if (value !== expected) fail(code);
}

function assertExactObject(value, fields, code) {
  if (!isPlainObject(value) || !sameKeySet(Object.keys(value), fields)) fail(code);
}

function assertExactArray(value, expected, code) {
  if (!Array.isArray(value) || value.length !== expected.length) fail(code);
  for (const [index, item] of expected.entries()) if (value[index] !== item) fail(code);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function sameKeySet(actual, expected) {
  return actual.length === expected.length
    && expected.every((field) => actual.includes(field));
}

function safeErrorCode(code, fallback) {
  return P6_ERROR_CODES.includes(code) ? code : fallback;
}

function fail(code, detail = null) {
  throw p6Error(code, detail);
}
