import { validatePilotEpisodeSet } from '../course/pilotEpisodeSet.js';
import { failPlaybookContract } from './playbookContractError.js';

const SCHOOL_ID = 'heihui-jileniao';
const RULE_ID = /^rule:[a-z0-9][a-z0-9_.:-]{0,127}$/u;
const EVIDENCE_ID = /^ev:[a-z0-9][a-z0-9_.:-]{0,127}$/u;
const CONFLICT_ID = /^conflict:[a-z0-9][a-z0-9_.:-]{0,127}$/u;
const TOP_LEVEL_FIELDS = [
  'schema_version',
  'rule_id',
  'rule_version',
  'primary_school',
  'source_episode_bvids',
  'evidence_ids',
  'claim_type',
  'design_layer',
  'intent',
  'applicability',
  'prerequisites',
  'exclusions',
  'action',
  'parameters',
  'implementation_hints',
  'positive_signs',
  'failure_modes',
  'repairs',
  'author_reason',
  'confidence',
  'maturity',
  'review_status',
  'conflict_ids',
  'supersedes'
];

export function validatePlaybookRuleCandidate(value, context) {
  const rule = cloneDocument(value, 'PlaybookRuleCandidate');
  const pilot = validateContext(context);
  assertExactObject(rule, 'PlaybookRuleCandidate', TOP_LEVEL_FIELDS);
  assertEqual(
    rule.schema_version,
    1,
    'PLAYBOOK_RULE_VERSION_INVALID',
    'PlaybookRuleCandidate.schema_version'
  );
  assertPattern(rule.rule_id, RULE_ID, 'PlaybookRuleCandidate.rule_id');
  if (!Number.isSafeInteger(rule.rule_version) || rule.rule_version < 1) {
    failPlaybookContract(
      'PLAYBOOK_RULE_VERSION_INVALID',
      'PlaybookRuleCandidate.rule_version',
      String(rule.rule_version)
    );
  }
  assertEqual(
    rule.primary_school,
    SCHOOL_ID,
    'PLAYBOOK_RULE_SCHOOL_INVALID',
    'PlaybookRuleCandidate.primary_school'
  );
  validateSourceEpisodes(rule.source_episode_bvids, pilot);
  validateEvidenceIds(rule.evidence_ids, context.evidenceIds);
  assertEnum(
    rule.claim_type,
    ['fact', 'author_claim', 'inference'],
    'PlaybookRuleCandidate.claim_type'
  );
  assertEnum(
    rule.design_layer,
    ['brief', 'massing', 'structure', 'roof', 'facade'],
    'PlaybookRuleCandidate.design_layer'
  );
  assertText(rule.intent, 'PlaybookRuleCandidate.intent', 256);
  for (const field of ['applicability', 'prerequisites', 'exclusions']) {
    assertTextArray(rule[field], `PlaybookRuleCandidate.${field}`, {
      allowEmpty: field === 'exclusions',
      maxItems: 64
    });
  }
  assertText(rule.action, 'PlaybookRuleCandidate.action', 2000);
  validateParameters(rule.parameters);
  for (const field of [
    'implementation_hints',
    'positive_signs',
    'failure_modes',
    'repairs'
  ]) {
    assertTextArray(rule[field], `PlaybookRuleCandidate.${field}`, {
      allowEmpty: false,
      maxItems: 64
    });
  }
  assertText(rule.author_reason, 'PlaybookRuleCandidate.author_reason', 2000);
  assertEnum(
    rule.confidence,
    ['unknown', 'low', 'medium', 'high'],
    'PlaybookRuleCandidate.confidence'
  );
  if (!['observed', 'candidate'].includes(rule.maturity)) {
    failPlaybookContract(
      'PLAYBOOK_RULE_MATURITY_INVALID',
      'PlaybookRuleCandidate.maturity',
      'P2 permits only observed or candidate maturity'
    );
  }
  assertEnum(
    rule.review_status,
    ['draft', 'unresolved', 'needs-owner-review'],
    'PlaybookRuleCandidate.review_status'
  );
  assertPatternArray(
    rule.conflict_ids,
    CONFLICT_ID,
    'PlaybookRuleCandidate.conflict_ids',
    { allowEmpty: true }
  );
  assertPatternArray(
    rule.supersedes,
    RULE_ID,
    'PlaybookRuleCandidate.supersedes',
    { allowEmpty: true }
  );
  if (rule.supersedes.length > 0) {
    failPlaybookContract(
      'PLAYBOOK_RULE_SUPERSEDE_INVALID',
      'PlaybookRuleCandidate.supersedes',
      'P2 candidates cannot supersede rules before author-update review'
    );
  }
  return deepFreeze(rule);
}

function validateContext(context) {
  if (
    !context
    || typeof context !== 'object'
    || !context.pilotEpisodeSet
    || !(context.evidenceIds instanceof Set)
  ) {
    failPlaybookContract(
      'PLAYBOOK_RULE_CONTEXT_INVALID',
      'context',
      'pilotEpisodeSet and evidenceIds Set required'
    );
  }
  return validatePilotEpisodeSet(context.pilotEpisodeSet);
}

function validateSourceEpisodes(values, pilot) {
  if (
    !Array.isArray(values)
    || values.length === 0
    || values.length > pilot.episode_count
    || new Set(values).size !== values.length
  ) {
    failPlaybookContract(
      'PLAYBOOK_RULE_SOURCE_INVALID',
      'PlaybookRuleCandidate.source_episode_bvids',
      'expected unique pilot BVIDs'
    );
  }
  const allowed = new Set(pilot.episodes.map((episode) => episode.bvid));
  if (values.some((bvid) => !allowed.has(bvid))) {
    failPlaybookContract(
      'PLAYBOOK_RULE_SOURCE_INVALID',
      'PlaybookRuleCandidate.source_episode_bvids',
      'source must belong to the primary-school pilot'
    );
  }
}

function validateEvidenceIds(values, knownIds) {
  assertPatternArray(
    values,
    EVIDENCE_ID,
    'PlaybookRuleCandidate.evidence_ids',
    { allowEmpty: false }
  );
  for (const id of values) {
    if (!knownIds.has(id)) {
      failPlaybookContract(
        'PLAYBOOK_RULE_EVIDENCE_UNKNOWN',
        'PlaybookRuleCandidate.evidence_ids',
        id
      );
    }
  }
}

function validateParameters(parameters) {
  if (!Array.isArray(parameters) || parameters.length > 64) {
    failPlaybookContract(
      'PLAYBOOK_RULE_PARAMETERS_INVALID',
      'PlaybookRuleCandidate.parameters',
      'expected up to 64 parameters'
    );
  }
  const names = new Set();
  for (const [index, parameter] of parameters.entries()) {
    const parameterPath = `PlaybookRuleCandidate.parameters[${index}]`;
    assertExactObject(parameter, parameterPath, [
      'name',
      'value',
      'unit',
      'status'
    ]);
    assertText(parameter.name, `${parameterPath}.name`, 128);
    if (names.has(parameter.name)) {
      failPlaybookContract(
        'PLAYBOOK_RULE_PARAMETERS_INVALID',
        `${parameterPath}.name`,
        'duplicate parameter name'
      );
    }
    names.add(parameter.name);
    if (parameter.unit !== null) {
      assertText(parameter.unit, `${parameterPath}.unit`, 64);
    }
    assertEnum(parameter.status, ['known', 'unknown'], `${parameterPath}.status`);
    if (parameter.status === 'unknown' && parameter.value !== null) {
      failPlaybookContract(
        'PLAYBOOK_RULE_UNKNOWN_PARAMETER_INVALID',
        `${parameterPath}.value`,
        'unknown parameters must keep a null value'
      );
    }
    if (parameter.status === 'known' && !validKnownValue(parameter.value)) {
      failPlaybookContract(
        'PLAYBOOK_RULE_PARAMETERS_INVALID',
        `${parameterPath}.value`,
        'known parameter requires a finite scalar value'
      );
    }
  }
}

function validKnownValue(value) {
  return typeof value === 'boolean'
    || (typeof value === 'string' && value.length > 0 && value.length <= 256)
    || (typeof value === 'number' && Number.isFinite(value));
}

function assertPatternArray(value, pattern, valuePath, { allowEmpty }) {
  if (
    !Array.isArray(value)
    || (!allowEmpty && value.length === 0)
    || value.length > 64
    || new Set(value).size !== value.length
    || value.some((item) => typeof item !== 'string' || !pattern.test(item))
  ) {
    failPlaybookContract(
      'PLAYBOOK_RULE_REFERENCE_INVALID',
      valuePath,
      'expected unique valid identifiers'
    );
  }
}

function assertTextArray(value, valuePath, { allowEmpty, maxItems }) {
  if (
    !Array.isArray(value)
    || (!allowEmpty && value.length === 0)
    || value.length > maxItems
    || new Set(value).size !== value.length
    || value.some((item) => typeof item !== 'string'
      || item.length === 0 || item.length > 1000)
  ) {
    failPlaybookContract(
      'PLAYBOOK_STRING_ARRAY_INVALID',
      valuePath,
      'expected unique non-empty strings'
    );
  }
}

function assertExactObject(value, objectPath, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failPlaybookContract('PLAYBOOK_OBJECT_INVALID', objectPath, 'expected object');
  }
  const allowed = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      failPlaybookContract(
        'PLAYBOOK_FIELD_UNKNOWN',
        `${objectPath}.${field}`,
        'unknown field'
      );
    }
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      failPlaybookContract(
        'PLAYBOOK_FIELD_REQUIRED',
        `${objectPath}.${field}`,
        'missing field'
      );
    }
  }
}

function assertText(value, valuePath, max) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    failPlaybookContract(
      'PLAYBOOK_STRING_INVALID',
      valuePath,
      `expected non-empty string up to ${max} characters`
    );
  }
}

function assertPattern(value, pattern, valuePath) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    failPlaybookContract(
      'PLAYBOOK_STRING_INVALID',
      valuePath,
      'value does not match the required pattern'
    );
  }
}

function assertEnum(value, allowed, valuePath) {
  if (!allowed.includes(value)) {
    failPlaybookContract(
      'PLAYBOOK_ENUM_INVALID',
      valuePath,
      `expected one of ${allowed.join(',')}`
    );
  }
}

function assertEqual(value, expected, code, valuePath) {
  if (value !== expected) {
    failPlaybookContract(code, valuePath, `${value} != ${expected}`);
  }
}

function cloneDocument(value, valuePath) {
  try {
    return structuredClone(value);
  } catch (error) {
    failPlaybookContract(
      'PLAYBOOK_DOCUMENT_UNCLONEABLE',
      valuePath,
      error?.message || 'structured clone failed'
    );
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
