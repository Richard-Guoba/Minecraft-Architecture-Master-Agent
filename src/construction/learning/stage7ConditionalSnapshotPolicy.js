import {
  ConditionalAdmissionContractError,
  PRIMARY_FUNCTIONS,
  STYLE_FAMILIES
} from './stage7ConditionalTaxonomy.js';
import { CANDIDATE_ID_PATTERN, LOCAL_ID_PATTERN } from './stage7SourceExpansionContracts.js';

const POLICY_KEYS = Object.freeze([
  'candidate_id', 'primary_function', 'style_family', 'scale_bin',
  'source_group', 'asset_family', 'author_entity', 'near_duplicate_cluster',
  'exact_duplicate_of', 'human_reviewed', 'second_reviewed', 'batch_id'
]);
const ASSIGNMENT_KEYS = Object.freeze(['candidate_id', 'split']);
const SPLITS = Object.freeze(['train', 'validation', 'test']);
const FUNCTION_TARGET_100 = Object.freeze({
  residential: 15,
  religious_public: 15,
  defensive_military: 15,
  production_agriculture: 10,
  transport_infrastructure: 10,
  exploration_challenge: 15,
  monument_ruin: 10,
  fantastical_special: 10
});

export function validatePolicyCase(record) {
  exactKeys(record, POLICY_KEYS, 'POLICY_CASE_KEYS_INVALID');
  const styleFamily = member(record.style_family, STYLE_FAMILIES, 'style_family');
  if (styleFamily === 'unknown') {
    throw new ConditionalAdmissionContractError(
      'POLICY_VALUE_INVALID', 'style_family'
    );
  }
  return deepFreeze({
    candidate_id: patterned(record.candidate_id, CANDIDATE_ID_PATTERN, 'candidate_id'),
    primary_function: member(record.primary_function, PRIMARY_FUNCTIONS, 'primary_function'),
    style_family: styleFamily,
    scale_bin: member(record.scale_bin, ['compact', 'standard', 'large'], 'scale_bin'),
    source_group: patterned(record.source_group, LOCAL_ID_PATTERN, 'source_group'),
    asset_family: patterned(record.asset_family, LOCAL_ID_PATTERN, 'asset_family'),
    author_entity: patterned(record.author_entity, LOCAL_ID_PATTERN, 'author_entity'),
    near_duplicate_cluster: nullablePattern(record.near_duplicate_cluster, 'near_duplicate_cluster'),
    exact_duplicate_of: nullablePattern(record.exact_duplicate_of, 'exact_duplicate_of', CANDIDATE_ID_PATTERN),
    human_reviewed: boolean(record.human_reviewed, 'human_reviewed'),
    second_reviewed: boolean(record.second_reviewed, 'second_reviewed'),
    batch_id: patterned(record.batch_id, LOCAL_ID_PATTERN, 'batch_id')
  });
}

export function evaluateSnapshotPolicy(inputCases, snapshotTier) {
  tier(snapshotTier);
  const cases = inputCases.map(validatePolicyCase);
  const violations = [];
  const expectedExact = snapshotTier === 2000 ? null : snapshotTier;
  if ((expectedExact !== null && cases.length !== expectedExact)
    || (snapshotTier === 2000 && cases.length < 2000)) {
    violations.push('SNAPSHOT_COUNT_INVALID');
  }
  const ids = cases.map((item) => item.candidate_id);
  if (new Set(ids).size !== ids.length) violations.push('CANDIDATE_DUPLICATE');
  if (cases.some((item) => item.exact_duplicate_of !== null)) {
    violations.push('EXACT_DUPLICATE_PRESENT');
  }
  const functionCounts = countBy(cases, 'primary_function');
  if (snapshotTier === 100) {
    for (const [name, target] of Object.entries(FUNCTION_TARGET_100)) {
      const value = functionCounts.get(name) || 0;
      if (Math.abs(value - target) > 3 || value < 8 || value > 20) {
        violations.push('FUNCTION_QUOTA_INVALID');
      }
    }
  } else {
    const minimum = snapshotTier === 500 ? 40 : 150;
    const maximum = snapshotTier === 500 ? 100 : Number.POSITIVE_INFINITY;
    for (const name of PRIMARY_FUNCTIONS) {
      const value = functionCounts.get(name) || 0;
      if (value < minimum) violations.push('FUNCTION_MINIMUM_MISSED');
      if (value > maximum) violations.push('FUNCTION_MAXIMUM_EXCEEDED');
    }
  }
  const sourceCounts = countBy(cases, 'source_group');
  const sourceMinimum = snapshotTier === 100 ? 5 : snapshotTier === 500 ? 12 : 30;
  const sourceCap = snapshotTier === 500 ? 0.15 : 0.10;
  const effectiveSourceCap = snapshotTier === 100 ? 0.20 : sourceCap;
  if (sourceCounts.size < sourceMinimum) violations.push('SOURCE_COUNT_INSUFFICIENT');
  if ([...sourceCounts.values()].some((count) => count > cases.length * effectiveSourceCap)) {
    violations.push('SOURCE_CAP_EXCEEDED');
  }
  if (snapshotTier === 100) {
    const familyCounts = countBy(cases, 'asset_family');
    const styleCounts = countBy(cases, 'style_family');
    const scaleCounts = countBy(cases, 'scale_bin');
    if ([...familyCounts.values()].some((count) => count > 10)) {
      violations.push('ASSET_FAMILY_CAP_EXCEEDED');
    }
    if (styleCounts.size < 5) violations.push('STYLE_COUNT_INSUFFICIENT');
    if ([...styleCounts.values()].some((count) => count > 30)) {
      violations.push('STYLE_CAP_EXCEEDED');
    }
    if ((scaleCounts.get('compact') || 0) !== 30
      || (scaleCounts.get('standard') || 0) !== 45
      || (scaleCounts.get('large') || 0) !== 25) {
      violations.push('SCALE_TARGET_MISSED');
    }
    const nearExtras = duplicateExtras(cases);
    if (nearExtras > 10) violations.push('NEAR_DUPLICATE_CAP_EXCEEDED');
  }
  if (cases.some((item) => item.human_reviewed !== true)) {
    violations.push('HUMAN_REVIEW_INCOMPLETE');
  }
  if (snapshotTier === 500
    && cases.filter((item) => item.second_reviewed).length < 100) {
    violations.push('SECOND_REVIEW_INSUFFICIENT');
  }
  if (snapshotTier === 2000) {
    const authorCounts = countBy(cases, 'author_entity');
    if ([...authorCounts.values()].some((count) => count > cases.length * 0.05)) {
      violations.push('AUTHOR_CAP_EXCEEDED');
    }
    for (const batch of grouped(cases, 'batch_id').values()) {
      if (batch.length > 100) violations.push('BATCH_SIZE_EXCEEDED');
      if (batch.filter((item) => item.second_reviewed).length < Math.ceil(batch.length * 0.10)) {
        violations.push('BATCH_REVIEW_INSUFFICIENT');
      }
    }
  }
  const sorted = Object.freeze([...new Set(violations)].sort());
  return deepFreeze({
    snapshot_tier: snapshotTier,
    case_count: cases.length,
    passed: sorted.length === 0,
    violations: sorted,
    function_counts: mapObject(functionCounts),
    source_counts: mapObject(sourceCounts),
    style_counts: mapObject(countBy(cases, 'style_family')),
    scale_counts: mapObject(countBy(cases, 'scale_bin'))
  });
}

export function validateLockedSplit({ cases: inputCases, assignments, priorAssignments, snapshotTier }) {
  tier(snapshotTier);
  const cases = inputCases.map(validatePolicyCase);
  const normalized = assignments.map(validateAssignment);
  const prior = priorAssignments.map(validateAssignment);
  const violations = [];
  if ((snapshotTier !== 2000 && cases.length !== snapshotTier)
    || (snapshotTier === 2000 && cases.length < 2000)) {
    violations.push('SNAPSHOT_COUNT_INVALID');
  }
  const caseIds = new Set(cases.map((item) => item.candidate_id));
  const assignmentIds = normalized.map((item) => item.candidate_id);
  if (new Set(assignmentIds).size !== assignmentIds.length
    || assignmentIds.length !== caseIds.size
    || assignmentIds.some((id) => !caseIds.has(id))) {
    violations.push('ASSIGNMENT_COVERAGE_INVALID');
  }
  const expected = splitCounts(cases.length, snapshotTier);
  const actual = countBy(normalized, 'split');
  for (const name of SPLITS) {
    if ((actual.get(name) || 0) !== expected[name]) violations.push('SPLIT_COUNT_INVALID');
  }
  const splitById = new Map(normalized.map((item) => [item.candidate_id, item.split]));
  const priorIds = prior.map((item) => item.candidate_id);
  if (new Set(priorIds).size !== priorIds.length) {
    violations.push('PRIOR_ASSIGNMENT_AMBIGUOUS');
  }
  for (const old of prior) {
    if (!splitById.has(old.candidate_id)) {
      violations.push('PRIOR_ASSIGNMENT_MISSING');
    } else if (splitById.get(old.candidate_id) !== old.split) {
      violations.push('PRIOR_ASSIGNMENT_CHANGED');
    }
  }
  assertGroupSplit(cases, splitById, 'asset_family', 'ASSET_FAMILY_SPLIT_LEAK', violations);
  assertGroupSplit(
    cases.filter((item) => item.near_duplicate_cluster !== null),
    splitById,
    'near_duplicate_cluster',
    'NEAR_DUPLICATE_SPLIT_LEAK',
    violations
  );
  const trainSources = new Set(cases
    .filter((item) => splitById.get(item.candidate_id) === 'train')
    .map((item) => item.source_group));
  const sourceHoldoutTestCount = cases.filter((item) =>
    splitById.get(item.candidate_id) === 'test' && !trainSources.has(item.source_group)
  ).length;
  if (snapshotTier === 500 && sourceHoldoutTestCount < 25) {
    violations.push('SOURCE_HOLDOUT_INSUFFICIENT');
  }
  if (snapshotTier === 2000 && sourceHoldoutTestCount < expected.test / 2) {
    violations.push('SOURCE_HOLDOUT_INSUFFICIENT');
  }
  const sorted = Object.freeze([...new Set(violations)].sort());
  return deepFreeze({
    snapshot_tier: snapshotTier,
    passed: sorted.length === 0,
    violations: sorted,
    split_counts: mapObject(actual),
    source_holdout_test_count: sourceHoldoutTestCount
  });
}

function splitCounts(count, snapshotTier) {
  if (snapshotTier === 100) return { train: 70, validation: 15, test: 15 };
  if (snapshotTier === 500) return { train: 350, validation: 75, test: 75 };
  const train = Math.floor(count * 0.80);
  const validation = Math.floor(count * 0.10);
  return { train, validation, test: count - train - validation };
}

function validateAssignment(record) {
  exactKeys(record, ASSIGNMENT_KEYS, 'ASSIGNMENT_KEYS_INVALID');
  return deepFreeze({
    candidate_id: patterned(record.candidate_id, CANDIDATE_ID_PATTERN, 'candidate_id'),
    split: member(record.split, SPLITS, 'split')
  });
}

function assertGroupSplit(cases, splitById, field, code, violations) {
  for (const members of grouped(cases, field).values()) {
    const splits = new Set(members.map((item) => splitById.get(item.candidate_id)));
    if (splits.size > 1) violations.push(code);
  }
}

function duplicateExtras(cases) {
  let extras = 0;
  for (const [key, members] of grouped(
    cases.filter((item) => item.near_duplicate_cluster !== null),
    'near_duplicate_cluster'
  )) {
    if (key !== null) extras += Math.max(0, members.length - 1);
  }
  return extras;
}

function tier(value) {
  if (![100, 500, 2000].includes(value)) {
    throw new ConditionalAdmissionContractError('SNAPSHOT_TIER_INVALID', String(value));
  }
}

function countBy(records, field) {
  const counts = new Map();
  for (const record of records) counts.set(record[field], (counts.get(record[field]) || 0) + 1);
  return counts;
}

function grouped(records, field) {
  const output = new Map();
  for (const record of records) {
    const values = output.get(record[field]) || [];
    values.push(record);
    output.set(record[field], values);
  }
  return output;
}

function mapObject(value) {
  return Object.fromEntries([...value.entries()].sort(([left], [right]) =>
    String(left).localeCompare(String(right))
  ));
}

function exactKeys(value, allowed, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConditionalAdmissionContractError(code, 'object required');
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length || missing.length) {
    throw new ConditionalAdmissionContractError(code, [...unknown, ...missing].sort().join(','));
  }
}

function member(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new ConditionalAdmissionContractError('POLICY_VALUE_INVALID', label);
  }
  return value;
}

function patterned(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new ConditionalAdmissionContractError('POLICY_ID_INVALID', label);
  }
  return value;
}

function nullablePattern(value, label, pattern = LOCAL_ID_PATTERN) {
  return value === null ? null : patterned(value, pattern, label);
}

function boolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new ConditionalAdmissionContractError('POLICY_BOOLEAN_INVALID', label);
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
