import { failPlaybookContract } from './playbookContractError.js';

const SCHOOL_ID = 'heihui-jileniao';
const CONFLICT_ID = /^conflict:[a-z0-9][a-z0-9_.:-]{0,127}$/u;
const RULE_ID = /^rule:[a-z0-9][a-z0-9_.:-]{0,127}$/u;
const EVIDENCE_ID = /^ev:[a-z0-9][a-z0-9_.:-]{0,127}$/u;
const TOP_LEVEL_FIELDS = [
  'schema_version',
  'conflict_id',
  'primary_school',
  'rule_ids',
  'evidence_ids',
  'resolution',
  'condition_note',
  'review_status'
];

export function validateRuleConflict(value, context) {
  const conflict = cloneDocument(value);
  validateContext(context);
  assertExactObject(conflict, 'RuleConflict', TOP_LEVEL_FIELDS);
  assertEqual(
    conflict.schema_version,
    1,
    'PLAYBOOK_CONFLICT_VERSION_INVALID',
    'RuleConflict.schema_version'
  );
  assertPattern(conflict.conflict_id, CONFLICT_ID, 'RuleConflict.conflict_id');
  assertEqual(
    conflict.primary_school,
    SCHOOL_ID,
    'PLAYBOOK_CONFLICT_SCHOOL_INVALID',
    'RuleConflict.primary_school'
  );
  assertReferenceArray(
    conflict.rule_ids,
    RULE_ID,
    'RuleConflict.rule_ids',
    { min: 2 }
  );
  for (const id of conflict.rule_ids) {
    if (!context.candidateRuleIds.has(id)) {
      failPlaybookContract(
        'PLAYBOOK_CONFLICT_RULE_UNKNOWN',
        'RuleConflict.rule_ids',
        id
      );
    }
  }
  assertReferenceArray(
    conflict.evidence_ids,
    EVIDENCE_ID,
    'RuleConflict.evidence_ids',
    { min: 1 }
  );
  for (const id of conflict.evidence_ids) {
    if (!context.evidenceIds.has(id)) {
      failPlaybookContract(
        'PLAYBOOK_CONFLICT_EVIDENCE_UNKNOWN',
        'RuleConflict.evidence_ids',
        id
      );
    }
  }
  assertEnum(
    conflict.resolution,
    ['conditional-difference', 'unresolved', 'superseded'],
    'RuleConflict.resolution'
  );
  assertText(conflict.condition_note, 'RuleConflict.condition_note', 2000);
  assertEnum(
    conflict.review_status,
    ['draft', 'unresolved', 'needs-owner-review'],
    'RuleConflict.review_status'
  );
  if (
    conflict.resolution === 'superseded'
    && !conflict.evidence_ids.some(
      (id) => context.authorUpdateEvidenceIds.has(id)
    )
  ) {
    failPlaybookContract(
      'PLAYBOOK_CONFLICT_SUPERSEDE_EVIDENCE_REQUIRED',
      'RuleConflict.evidence_ids',
      'superseded requires explicit author-update evidence'
    );
  }
  return deepFreeze(conflict);
}

function validateContext(context) {
  if (
    !context
    || typeof context !== 'object'
    || !(context.evidenceIds instanceof Set)
    || !(context.candidateRuleIds instanceof Set)
    || !(context.authorUpdateEvidenceIds instanceof Set)
  ) {
    failPlaybookContract(
      'PLAYBOOK_CONFLICT_CONTEXT_INVALID',
      'context',
      'evidence, candidate-rule, and author-update Sets required'
    );
  }
}

function assertReferenceArray(value, pattern, valuePath, { min }) {
  if (
    !Array.isArray(value)
    || value.length < min
    || value.length > 64
    || new Set(value).size !== value.length
    || value.some((item) => typeof item !== 'string' || !pattern.test(item))
  ) {
    failPlaybookContract(
      'PLAYBOOK_CONFLICT_REFERENCE_INVALID',
      valuePath,
      `expected ${min}..64 unique valid identifiers`
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

function assertPattern(value, pattern, valuePath) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    failPlaybookContract(
      'PLAYBOOK_STRING_INVALID',
      valuePath,
      'value does not match the required pattern'
    );
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

function cloneDocument(value) {
  try {
    return structuredClone(value);
  } catch (error) {
    failPlaybookContract(
      'PLAYBOOK_DOCUMENT_UNCLONEABLE',
      'RuleConflict',
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
