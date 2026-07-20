import {
  CANDIDATE_ID_PATTERN,
  LOCAL_ID_PATTERN,
  validateIsoDate
} from './stage7SourceExpansionContracts.js';

export const CONDITIONAL_ADMISSION_SCHEMA_VERSION = 1;
export const PRIMARY_FUNCTIONS = Object.freeze([
  'residential',
  'religious_public',
  'defensive_military',
  'production_agriculture',
  'transport_infrastructure',
  'exploration_challenge',
  'monument_ruin',
  'fantastical_special'
]);
export const ASSESSMENT_DECISIONS = Object.freeze(['accept', 'defer', 'reject']);
export const ASSESSMENT_REASON_CODES = Object.freeze([
  'COLLECTION_UNSEPARATED',
  'COMPLETENESS_UNCLEAR',
  'INCOMPLETE_FRAGMENT',
  'INCOMPLETE_MODULE',
  'LABEL_LOW_CONFIDENCE',
  'MULTIPART_ASSEMBLY_REQUIRED',
  'OUT_OF_SCOPE',
  'QUALITY_REJECTED',
  'STYLE_UNKNOWN',
  'TYPE_UNKNOWN'
]);
export const COMPLETENESS_VALUES = Object.freeze(['complete', 'module', 'fragment']);
export const LABEL_CONFIDENCE_VALUES = Object.freeze(['high', 'medium', 'low']);
export const STYLE_FAMILIES = Object.freeze([
  'vanilla_traditional', 'medieval', 'classical_ancient', 'rustic',
  'gothic_dark', 'fantasy', 'industrial_steampunk',
  'prehistoric_earthwork', 'regional_biome', 'modern', 'unknown'
]);
export const STYLE_TAGS = Object.freeze([
  'ancient', 'aquatic', 'cherry', 'classical', 'dark', 'desert',
  'earthwork', 'fantasy', 'gothic', 'ice', 'industrial', 'jungle',
  'medieval', 'nether', 'prehistoric', 'red_sandstone', 'rustic',
  'steampunk', 'vanilla'
]);
export const ENVIRONMENTS = Object.freeze([
  'overworld', 'nether', 'end', 'aquatic', 'underground', 'aerial', 'unknown'
]);
export const BIOME_THEMES = Object.freeze([
  'none', 'plains', 'forest', 'taiga', 'jungle', 'desert', 'badlands',
  'savanna', 'swamp', 'cherry', 'snow_ice', 'mushroom', 'ocean',
  'nether_crimson', 'nether_warped', 'nether_soul_sand', 'end', 'unknown'
]);
export const BUILDING_TYPE_PARENTS = Object.freeze({
  house: 'dwelling',
  cottage: 'dwelling',
  manor: 'dwelling',
  village_building: 'dwelling',
  temple: 'worship',
  shrine: 'worship',
  altar: 'worship',
  public_hall: 'civic',
  castle: 'fortification',
  fortress: 'fortification',
  fort: 'fortification',
  citadel: 'fortification',
  lookout: 'fortification',
  tower: 'tower',
  workshop: 'production',
  windmill: 'production',
  farm: 'production',
  industrial_facility: 'production',
  ship: 'transport',
  airship: 'transport',
  bridge: 'infrastructure',
  station: 'infrastructure',
  dungeon: 'challenge',
  catacomb: 'challenge',
  tomb: 'challenge',
  burial_mound: 'challenge',
  maze: 'challenge',
  monument: 'monument',
  memorial: 'monument',
  ruin: 'ruin',
  megalith: 'monument',
  portal: 'special',
  laboratory: 'special',
  other_complete: 'special',
  unknown: 'unknown'
});

const ASSESSMENT_KEYS = Object.freeze([
  'schema_version', 'candidate_id', 'revision', 'assessed_at', 'assessed_by',
  'assessment_decision', 'reason_codes', 'primary_function',
  'secondary_functions', 'building_type', 'building_type_parent',
  'style_family', 'style_tags', 'environment', 'biome_theme',
  'completeness', 'label_confidence', 'source_group', 'asset_family'
]);

export class ConditionalAdmissionContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'ConditionalAdmissionContractError';
    this.code = code;
  }
}

export function validateTaxonomyAssessment(record) {
  rejectUnknownKeys(record, ASSESSMENT_KEYS, 'ASSESSMENT_KEYS_INVALID');
  if (record.schema_version !== CONDITIONAL_ADMISSION_SCHEMA_VERSION) {
    throw new ConditionalAdmissionContractError('SCHEMA_VERSION_INVALID', 'schema_version');
  }
  const candidateId = requirePattern(record.candidate_id, CANDIDATE_ID_PATTERN, 'candidate_id');
  const decision = requireMember(record.assessment_decision, ASSESSMENT_DECISIONS, 'assessment_decision');
  const primary = requireMember(record.primary_function, PRIMARY_FUNCTIONS, 'primary_function');
  const secondary = uniqueSortedMembers(
    record.secondary_functions, PRIMARY_FUNCTIONS, 'secondary_functions'
  );
  if (secondary.includes(primary)) {
    throw new ConditionalAdmissionContractError(
      'ASSESSMENT_FUNCTION_DUPLICATE', primary
    );
  }
  const buildingType = requireMember(
    record.building_type, Object.keys(BUILDING_TYPE_PARENTS), 'building_type'
  );
  const expectedParent = BUILDING_TYPE_PARENTS[buildingType];
  if (record.building_type_parent !== expectedParent) {
    throw new ConditionalAdmissionContractError(
      'BUILDING_TYPE_PARENT_MISMATCH', buildingType
    );
  }
  const styleFamily = requireMember(record.style_family, STYLE_FAMILIES, 'style_family');
  const completeness = requireMember(
    record.completeness, COMPLETENESS_VALUES, 'completeness'
  );
  const confidence = requireMember(
    record.label_confidence, LABEL_CONFIDENCE_VALUES, 'label_confidence'
  );
  const reasons = uniqueSortedMembers(
    record.reason_codes, ASSESSMENT_REASON_CODES, 'reason_codes'
  );
  if (decision === 'accept' && (
    completeness !== 'complete'
      || confidence === 'low'
      || buildingType === 'unknown'
      || styleFamily === 'unknown'
  )) {
    throw new ConditionalAdmissionContractError(
      'ASSESSMENT_ACCEPT_INVALID', candidateId
    );
  }
  if (decision === 'accept' && reasons.length !== 0) {
    throw new ConditionalAdmissionContractError(
      'ASSESSMENT_REASON_UNEXPECTED', candidateId
    );
  }
  if (decision !== 'accept' && reasons.length === 0) {
    throw new ConditionalAdmissionContractError(
      'ASSESSMENT_REASON_REQUIRED', candidateId
    );
  }
  if (decision === 'reject' && (
    completeness !== 'complete'
      || confidence === 'low'
      || buildingType === 'unknown'
      || styleFamily === 'unknown'
  )) {
    throw new ConditionalAdmissionContractError(
      'ASSESSMENT_DEFER_REQUIRED', candidateId
    );
  }
  const requiredReasons = [
    completeness === 'module' ? 'INCOMPLETE_MODULE' : null,
    completeness === 'fragment' ? 'INCOMPLETE_FRAGMENT' : null,
    confidence === 'low' ? 'LABEL_LOW_CONFIDENCE' : null,
    buildingType === 'unknown' ? 'TYPE_UNKNOWN' : null,
    styleFamily === 'unknown' ? 'STYLE_UNKNOWN' : null
  ].filter(Boolean);
  if (decision === 'defer' && requiredReasons.some((code) => !reasons.includes(code))) {
    throw new ConditionalAdmissionContractError(
      'ASSESSMENT_REASON_MISMATCH', candidateId
    );
  }
  return deepFreeze({
    schema_version: CONDITIONAL_ADMISSION_SCHEMA_VERSION,
    candidate_id: candidateId,
    revision: requirePositiveInteger(record.revision, 'revision'),
    assessed_at: validateIsoDate(record.assessed_at, 'assessed_at'),
    assessed_by: requireString(record.assessed_by, 'assessed_by'),
    assessment_decision: decision,
    reason_codes: reasons,
    primary_function: primary,
    secondary_functions: secondary,
    building_type: buildingType,
    building_type_parent: expectedParent,
    style_family: styleFamily,
    style_tags: uniqueSortedMembers(record.style_tags, STYLE_TAGS, 'style_tags'),
    environment: requireMember(record.environment, ENVIRONMENTS, 'environment'),
    biome_theme: requireMember(record.biome_theme, BIOME_THEMES, 'biome_theme'),
    completeness,
    label_confidence: confidence,
    source_group: requirePattern(record.source_group, LOCAL_ID_PATTERN, 'source_group'),
    asset_family: requirePattern(record.asset_family, LOCAL_ID_PATTERN, 'asset_family')
  });
}

export function deriveScaleBin(dimensions) {
  rejectUnknownKeys(dimensions, ['x', 'y', 'z'], 'DIMENSIONS_INVALID');
  const values = ['x', 'y', 'z'].map((axis) =>
    requirePositiveInteger(dimensions[axis], `dimensions.${axis}`)
  );
  const largest = Math.max(...values);
  if (largest > 64) {
    throw new ConditionalAdmissionContractError('DIMENSIONS_INVALID', 'oversized');
  }
  if (largest <= 24) return 'compact';
  if (largest <= 40) return 'standard';
  return 'large';
}

export function conditionSupportFloor(snapshotTier) {
  const floors = new Map([[100, 5], [500, 10], [2000, 20]]);
  if (!floors.has(snapshotTier)) {
    throw new ConditionalAdmissionContractError(
      'SNAPSHOT_TIER_INVALID', String(snapshotTier)
    );
  }
  return floors.get(snapshotTier);
}

export function resolveSupportedBuildingCondition({
  buildingType,
  trainingSupport,
  snapshotTier
}) {
  const type = requireMember(
    buildingType, Object.keys(BUILDING_TYPE_PARENTS), 'building_type'
  );
  if (!Number.isSafeInteger(trainingSupport) || trainingSupport < 0) {
    throw new ConditionalAdmissionContractError(
      'TRAINING_SUPPORT_INVALID', String(trainingSupport)
    );
  }
  const supportFloor = conditionSupportFloor(snapshotTier);
  const parent = BUILDING_TYPE_PARENTS[type];
  const fellBack = trainingSupport < supportFloor;
  return deepFreeze({
    building_type: type,
    parent_condition: parent,
    active_condition: fellBack ? parent : type,
    fell_back_to_parent: fellBack,
    support_floor: supportFloor,
    training_support: trainingSupport
  });
}

function uniqueSortedMembers(value, allowed, label) {
  if (!Array.isArray(value)) {
    throw new ConditionalAdmissionContractError('ASSESSMENT_ARRAY_INVALID', label);
  }
  const output = value.map((entry) => requireMember(entry, allowed, label));
  if (new Set(output).size !== output.length) {
    throw new ConditionalAdmissionContractError('ASSESSMENT_ARRAY_DUPLICATE', label);
  }
  return output.sort();
}

function requireMember(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new ConditionalAdmissionContractError('ASSESSMENT_VALUE_INVALID', label);
  }
  return value;
}

function requirePattern(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new ConditionalAdmissionContractError('ASSESSMENT_ID_INVALID', label);
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ConditionalAdmissionContractError('ASSESSMENT_INTEGER_INVALID', label);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ConditionalAdmissionContractError('ASSESSMENT_STRING_INVALID', label);
  }
  return value;
}

function rejectUnknownKeys(value, allowed, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConditionalAdmissionContractError(code, 'object required');
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key)).sort();
  const missing = allowed.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0) throw new ConditionalAdmissionContractError(code, unknown.join(','));
  if (missing.length > 0) {
    throw new ConditionalAdmissionContractError(code, `missing:${missing.join(',')}`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
