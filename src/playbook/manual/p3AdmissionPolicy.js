import { failPlaybookContract } from '../contracts/playbookContractError.js';

const SCHOOL_ID = 'heihui-jileniao';
const PLAYBOOK_VERSION = '0.1.0';
const RULE_ID = /^rule:[a-z0-9][a-z0-9_.:-]{0,127}$/u;
const TERM_ID = /^term:[a-z0-9][a-z0-9-]{0,127}$/u;
const UNRESOLVED_TERM_ID = /^unresolved:[a-z0-9][a-z0-9-]{0,127}$/u;
const UNKNOWN_ID = /^unknown:[a-z0-9][a-z0-9_.:-]{0,127}$/u;
const CHECK_ID = /^check:(brief|massing|structure|roof|facade):[a-z0-9][a-z0-9-]*$/u;
const REPAIR_ID = /^repair:(brief|massing|structure|roof|facade):[a-z0-9][a-z0-9-]*$/u;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const TOP_LEVEL_FIELDS = [
  'schema_version',
  'playbook_version',
  'school_id',
  'created_at',
  'chapters',
  'rule_admissions',
  'terminology',
  'coverage'
];
const CHAPTER_FIELDS = ['chapter_id', 'title', 'order', 'introduction'];
const ADMISSION_FIELDS = [
  'rule_id',
  'decision',
  'teaching_role',
  'chapter_ids',
  'runtime_projection',
  'editorial_note'
];
const PROJECTION_FIELDS = [
  'coverage_status',
  'input_signals',
  'proposal_fields',
  'observable_checks',
  'repair_operations',
  'invalidates_layers'
];
const TERMINOLOGY_FIELDS = ['resolved_terms', 'unresolved_terms'];
const RESOLVED_TERM_FIELDS = [
  'term_id',
  'display_name',
  'definition',
  'aliases',
  'rule_ids',
  'scope_note'
];
const UNRESOLVED_TERM_FIELDS = [
  'term_group_id',
  'display_name',
  'impact',
  'handling_policy',
  'rule_ids'
];
const COVERAGE_FIELDS = [
  'layer',
  'status',
  'rule_ids',
  'known_capabilities',
  'unknown_ids',
  'runtime_authority'
];

const EXPECTED_CHAPTER_IDS = Object.freeze([
  'method-and-boundaries',
  'massing-foundations',
  'hierarchy-and-structure',
  'roof-form',
  'facade-layers',
  'medieval-residence',
  'complete-case',
  'failure-and-repair',
  'agent-workflow',
  'unknowns-and-coverage'
]);

export const P3_ALLOWED_FIELD_PATHS = Object.freeze([
  'brief.prompt',
  'brief.primary_viewpoint',
  'brief.detail_budget',
  'brief.scene_intent',
  'massing.volumes',
  'massing.primary_volume_id',
  'massing.secondary_volume_ids',
  'massing.volume_relations',
  'massing.blank_plane_regions',
  'structure.frames',
  'structure.load_paths',
  'structure.overhangs',
  'structure.support_paths',
  'structure.base_strategy',
  'roof.span',
  'roof.profile',
  'roof.slope_pattern',
  'roof.border_role',
  'roof.secondary_roofs',
  'roof.ridge_axis',
  'roof.surface_regions',
  'facade.bay_grid',
  'facade.frame_depth',
  'facade.infill_depth',
  'facade.openings',
  'facade.motif_signatures',
  'facade.variation_axes',
  'facade.vegetation_path'
]);

export const P3_LAYER_ORDER = Object.freeze([
  'brief', 'massing', 'space', 'structure', 'roof',
  'facade', 'materials', 'interior', 'scene'
]);

export const P3_MANAGED_ARTIFACT_PATHS = Object.freeze([
  'docs/architecture-playbook/manual/v0.1.md',
  'docs/architecture-playbook/manual/terminology-v0.1.json',
  'docs/architecture-playbook/manual/coverage-v0.1.json',
  'docs/architecture-playbook/rules/schools/heihui-jileniao/reviewed-rules-v0.1.jsonl',
  'docs/architecture-playbook/rules/schools/heihui-jileniao/rule-index-v0.1.json'
]);

const ALLOWED_FIELD_PATH_SET = new Set(P3_ALLOWED_FIELD_PATHS);
const EXPECTED_CHAPTER_ID_SET = new Set(EXPECTED_CHAPTER_IDS);
const COVERED_LAYER_SET = new Set(['brief', 'massing', 'structure', 'roof', 'facade']);

export function validateP3AdmissionPolicy(value, context) {
  const policy = cloneDocument(value);
  const candidateRuleIds = validateContext(context);
  assertExactObject(policy, 'P3AdmissionPolicy', TOP_LEVEL_FIELDS);
  assertEqual(
    policy.schema_version,
    1,
    'PLAYBOOK_P3_VERSION_INVALID',
    'P3AdmissionPolicy.schema_version'
  );
  assertEqual(
    policy.playbook_version,
    PLAYBOOK_VERSION,
    'PLAYBOOK_P3_VERSION_INVALID',
    'P3AdmissionPolicy.playbook_version'
  );
  assertEqual(
    policy.school_id,
    SCHOOL_ID,
    'PLAYBOOK_P3_SCHOOL_INVALID',
    'P3AdmissionPolicy.school_id'
  );
  assertTimestamp(policy.created_at, 'P3AdmissionPolicy.created_at');
  validateChapters(policy.chapters);
  validateAdmissions(policy.rule_admissions, candidateRuleIds);
  validateTerminology(policy.terminology, candidateRuleIds);
  validateCoverage(policy.coverage, candidateRuleIds);
  return deepFreeze(policy);
}

function validateContext(context) {
  if (
    !context
    || typeof context !== 'object'
    || !(context.candidateRuleIds instanceof Set)
    || context.candidateRuleIds.size !== 21
    || [...context.candidateRuleIds].some((id) => typeof id !== 'string' || !RULE_ID.test(id))
  ) {
    failPlaybookContract(
      'PLAYBOOK_P3_CONTEXT_INVALID',
      'context.candidateRuleIds',
      'expected the 21 unique P2 candidate rule IDs'
    );
  }
  return context.candidateRuleIds;
}

function validateChapters(chapters) {
  if (!Array.isArray(chapters) || chapters.length !== EXPECTED_CHAPTER_IDS.length) {
    failPlaybookContract(
      'PLAYBOOK_P3_CHAPTER_ORDER_INVALID',
      'P3AdmissionPolicy.chapters',
      'expected the ten fixed chapters'
    );
  }
  for (const [index, chapter] of chapters.entries()) {
    const chapterPath = `P3AdmissionPolicy.chapters[${index}]`;
    assertExactObject(chapter, chapterPath, CHAPTER_FIELDS);
    if (
      chapter.chapter_id !== EXPECTED_CHAPTER_IDS[index]
      || chapter.order !== index + 1
    ) {
      failPlaybookContract(
        'PLAYBOOK_P3_CHAPTER_ORDER_INVALID',
        chapterPath,
        `expected ${EXPECTED_CHAPTER_IDS[index]} at order ${index + 1}`
      );
    }
    assertText(chapter.title, `${chapterPath}.title`, 128);
    assertText(chapter.introduction, `${chapterPath}.introduction`, 1000);
  }
}

function validateAdmissions(admissions, candidateRuleIds) {
  if (!Array.isArray(admissions)) {
    failPlaybookContract(
      'PLAYBOOK_P3_ADMISSION_RULE_MISSING',
      'P3AdmissionPolicy.rule_admissions',
      'expected one admission per P2 candidate'
    );
  }
  const seenRuleIds = new Set();
  let coreCount = 0;
  let caseCount = 0;
  for (const [index, admission] of admissions.entries()) {
    const admissionPath = `P3AdmissionPolicy.rule_admissions[${index}]`;
    assertExactObject(admission, admissionPath, ADMISSION_FIELDS);
    assertPattern(admission.rule_id, RULE_ID, `${admissionPath}.rule_id`);
    if (!candidateRuleIds.has(admission.rule_id)) {
      failPlaybookContract(
        'PLAYBOOK_P3_ADMISSION_RULE_UNKNOWN',
        `${admissionPath}.rule_id`,
        admission.rule_id
      );
    }
    if (seenRuleIds.has(admission.rule_id)) {
      failPlaybookContract(
        'PLAYBOOK_P3_ADMISSION_RULE_DUPLICATE',
        `${admissionPath}.rule_id`,
        admission.rule_id
      );
    }
    seenRuleIds.add(admission.rule_id);
    if (admission.decision !== 'admitted-advisory') {
      failPlaybookContract(
        'PLAYBOOK_P3_ADMISSION_DECISION_INVALID',
        `${admissionPath}.decision`,
        'P3 permits only admitted-advisory'
      );
    }
    if (admission.teaching_role === 'core-procedure') coreCount += 1;
    else if (admission.teaching_role === 'case-pattern') caseCount += 1;
    else {
      failPlaybookContract(
        'PLAYBOOK_P3_TEACHING_ROLE_INVALID',
        `${admissionPath}.teaching_role`,
        String(admission.teaching_role)
      );
    }
    validateChapterReferences(admission.chapter_ids, `${admissionPath}.chapter_ids`);
    validateProjection(
      admission.runtime_projection,
      admission.teaching_role,
      `${admissionPath}.runtime_projection`
    );
    assertText(admission.editorial_note, `${admissionPath}.editorial_note`, 1000);
  }
  if (seenRuleIds.size !== candidateRuleIds.size) {
    const missing = [...candidateRuleIds].filter((id) => !seenRuleIds.has(id));
    failPlaybookContract(
      'PLAYBOOK_P3_ADMISSION_RULE_MISSING',
      'P3AdmissionPolicy.rule_admissions',
      missing.join(',')
    );
  }
  if (coreCount !== 15 || caseCount !== 6) {
    failPlaybookContract(
      'PLAYBOOK_P3_TEACHING_ROLE_COUNT_INVALID',
      'P3AdmissionPolicy.rule_admissions',
      `expected 15 core-procedure and 6 case-pattern; got ${coreCount} and ${caseCount}`
    );
  }
}

function validateChapterReferences(value, valuePath) {
  assertUniqueStringArray(value, valuePath, {
    allowEmpty: false,
    duplicateCode: 'PLAYBOOK_P3_ADMISSION_CHAPTER_INVALID'
  });
  if (value.some((chapterId) => !EXPECTED_CHAPTER_ID_SET.has(chapterId))) {
    failPlaybookContract(
      'PLAYBOOK_P3_ADMISSION_CHAPTER_INVALID',
      valuePath,
      'unknown chapter ID'
    );
  }
}

function validateProjection(projection, teachingRole, projectionPath) {
  assertExactObject(projection, projectionPath, PROJECTION_FIELDS);
  const expectedCoverage = teachingRole === 'core-procedure'
    ? 'advisory-partial'
    : 'manual-example-only';
  if (projection.coverage_status !== expectedCoverage) {
    failPlaybookContract(
      'PLAYBOOK_P3_PROJECTION_COVERAGE_INVALID',
      `${projectionPath}.coverage_status`,
      `expected ${expectedCoverage}`
    );
  }
  for (const field of ['input_signals', 'proposal_fields']) {
    const fieldPath = `${projectionPath}.${field}`;
    assertUniqueStringArray(projection[field], fieldPath, {
      allowEmpty: false,
      duplicateCode: 'PLAYBOOK_P3_PROJECTION_DUPLICATE'
    });
    if (projection[field].some((item) => !ALLOWED_FIELD_PATH_SET.has(item))) {
      failPlaybookContract(
        'PLAYBOOK_P3_PROJECTION_FIELD_INVALID',
        fieldPath,
        'projection field is outside the controlled P3 paths'
      );
    }
  }
  validateIdentifierArray(
    projection.observable_checks,
    CHECK_ID,
    `${projectionPath}.observable_checks`,
    'PLAYBOOK_P3_CHECK_IDENTIFIER_INVALID'
  );
  validateIdentifierArray(
    projection.repair_operations,
    REPAIR_ID,
    `${projectionPath}.repair_operations`,
    'PLAYBOOK_P3_REPAIR_IDENTIFIER_INVALID'
  );
  validateInvalidatedLayers(
    projection.invalidates_layers,
    projection.observable_checks,
    `${projectionPath}.invalidates_layers`
  );
}

function validateIdentifierArray(value, pattern, valuePath, invalidCode) {
  assertUniqueStringArray(value, valuePath, {
    allowEmpty: false,
    duplicateCode: 'PLAYBOOK_P3_PROJECTION_DUPLICATE'
  });
  if (value.some((identifier) => !pattern.test(identifier))) {
    failPlaybookContract(invalidCode, valuePath, 'invalid inert operation identifier');
  }
}

function validateInvalidatedLayers(value, observableChecks, valuePath) {
  assertUniqueStringArray(value, valuePath, {
    allowEmpty: true,
    duplicateCode: 'PLAYBOOK_P3_PROJECTION_DUPLICATE'
  });
  const checkLayer = observableChecks[0]?.split(':')[1];
  const checkLayerIndex = P3_LAYER_ORDER.indexOf(checkLayer);
  let previousIndex = -1;
  for (const layer of value) {
    const layerIndex = P3_LAYER_ORDER.indexOf(layer);
    if (
      !COVERED_LAYER_SET.has(layer)
      || layerIndex < checkLayerIndex
      || layerIndex <= previousIndex
    ) {
      failPlaybookContract(
        'PLAYBOOK_P3_INVALIDATION_LAYER_INVALID',
        valuePath,
        'expected unique covered layers in downstream order'
      );
    }
    previousIndex = layerIndex;
  }
}

function validateTerminology(terminology, candidateRuleIds) {
  assertExactObject(terminology, 'P3AdmissionPolicy.terminology', TERMINOLOGY_FIELDS);
  if (!Array.isArray(terminology.resolved_terms) || terminology.resolved_terms.length !== 15) {
    failPlaybookContract(
      'PLAYBOOK_P3_TERMINOLOGY_COUNT_INVALID',
      'P3AdmissionPolicy.terminology.resolved_terms',
      'expected fifteen resolved terms'
    );
  }
  if (!Array.isArray(terminology.unresolved_terms) || terminology.unresolved_terms.length !== 5) {
    failPlaybookContract(
      'PLAYBOOK_P3_TERMINOLOGY_COUNT_INVALID',
      'P3AdmissionPolicy.terminology.unresolved_terms',
      'expected five unresolved term groups'
    );
  }
  validateResolvedTerms(terminology.resolved_terms, candidateRuleIds);
  validateUnresolvedTerms(terminology.unresolved_terms, candidateRuleIds);
}

function validateResolvedTerms(terms, candidateRuleIds) {
  const seenIds = new Set();
  const seenNames = new Set();
  for (const [index, term] of terms.entries()) {
    const termPath = `P3AdmissionPolicy.terminology.resolved_terms[${index}]`;
    assertExactObject(term, termPath, RESOLVED_TERM_FIELDS);
    assertPattern(term.term_id, TERM_ID, `${termPath}.term_id`);
    if (seenIds.has(term.term_id) || seenNames.has(term.display_name)) {
      failPlaybookContract(
        'PLAYBOOK_P3_TERMINOLOGY_DUPLICATE',
        termPath,
        'duplicate term ID or display name'
      );
    }
    seenIds.add(term.term_id);
    seenNames.add(term.display_name);
    assertText(term.display_name, `${termPath}.display_name`, 128);
    assertText(term.definition, `${termPath}.definition`, 1000);
    assertUniqueStringArray(term.aliases, `${termPath}.aliases`, {
      allowEmpty: true,
      duplicateCode: 'PLAYBOOK_P3_TERMINOLOGY_DUPLICATE'
    });
    validateTerminologyRuleIds(term.rule_ids, candidateRuleIds, `${termPath}.rule_ids`);
    assertText(term.scope_note, `${termPath}.scope_note`, 1000);
  }
}

function validateUnresolvedTerms(terms, candidateRuleIds) {
  const seenIds = new Set();
  for (const [index, term] of terms.entries()) {
    const termPath = `P3AdmissionPolicy.terminology.unresolved_terms[${index}]`;
    assertExactObject(term, termPath, UNRESOLVED_TERM_FIELDS);
    assertPattern(term.term_group_id, UNRESOLVED_TERM_ID, `${termPath}.term_group_id`);
    if (seenIds.has(term.term_group_id)) {
      failPlaybookContract(
        'PLAYBOOK_P3_TERMINOLOGY_DUPLICATE',
        `${termPath}.term_group_id`,
        term.term_group_id
      );
    }
    seenIds.add(term.term_group_id);
    assertText(term.display_name, `${termPath}.display_name`, 256);
    assertText(term.impact, `${termPath}.impact`, 1000);
    assertText(term.handling_policy, `${termPath}.handling_policy`, 1000);
    validateTerminologyRuleIds(term.rule_ids, candidateRuleIds, `${termPath}.rule_ids`);
  }
}

function validateTerminologyRuleIds(value, candidateRuleIds, valuePath) {
  assertUniqueStringArray(value, valuePath, {
    allowEmpty: false,
    duplicateCode: 'PLAYBOOK_P3_TERMINOLOGY_DUPLICATE'
  });
  for (const ruleId of value) {
    if (!candidateRuleIds.has(ruleId)) {
      failPlaybookContract(
        'PLAYBOOK_P3_TERMINOLOGY_RULE_UNKNOWN',
        valuePath,
        ruleId
      );
    }
  }
}

function validateCoverage(coverage, candidateRuleIds) {
  if (!Array.isArray(coverage) || coverage.length !== P3_LAYER_ORDER.length) {
    failPlaybookContract(
      'PLAYBOOK_P3_COVERAGE_ORDER_INVALID',
      'P3AdmissionPolicy.coverage',
      'expected all nine design layers'
    );
  }
  const coveredRuleIds = new Set();
  for (const [index, row] of coverage.entries()) {
    const rowPath = `P3AdmissionPolicy.coverage[${index}]`;
    assertExactObject(row, rowPath, COVERAGE_FIELDS);
    if (row.layer !== P3_LAYER_ORDER[index]) {
      failPlaybookContract(
        'PLAYBOOK_P3_COVERAGE_ORDER_INVALID',
        `${rowPath}.layer`,
        `expected ${P3_LAYER_ORDER[index]}`
      );
    }
    const expectedStatus = COVERED_LAYER_SET.has(row.layer)
      ? 'advisory-partial'
      : 'not-covered';
    if (row.status !== expectedStatus) {
      failPlaybookContract(
        'PLAYBOOK_P3_COVERAGE_STATUS_INVALID',
        `${rowPath}.status`,
        `expected ${expectedStatus}`
      );
    }
    if (row.runtime_authority !== 'none') {
      failPlaybookContract(
        'PLAYBOOK_P3_RUNTIME_AUTHORITY_INVALID',
        `${rowPath}.runtime_authority`,
        'P3 has no runtime authority'
      );
    }
    assertUniqueStringArray(row.rule_ids, `${rowPath}.rule_ids`, {
      allowEmpty: !COVERED_LAYER_SET.has(row.layer),
      duplicateCode: 'PLAYBOOK_P3_COVERAGE_REFERENCE_INVALID'
    });
    for (const ruleId of row.rule_ids) {
      if (!candidateRuleIds.has(ruleId) || coveredRuleIds.has(ruleId)) {
        failPlaybookContract(
          'PLAYBOOK_P3_COVERAGE_REFERENCE_INVALID',
          `${rowPath}.rule_ids`,
          ruleId
        );
      }
      coveredRuleIds.add(ruleId);
    }
    assertUniqueStringArray(row.known_capabilities, `${rowPath}.known_capabilities`, {
      allowEmpty: !COVERED_LAYER_SET.has(row.layer),
      duplicateCode: 'PLAYBOOK_P3_COVERAGE_CAPABILITY_INVALID'
    });
    assertUniqueStringArray(row.unknown_ids, `${rowPath}.unknown_ids`, {
      allowEmpty: true,
      duplicateCode: 'PLAYBOOK_P3_COVERAGE_UNKNOWN_INVALID'
    });
    if (row.unknown_ids.some((unknownId) => !UNKNOWN_ID.test(unknownId))) {
      failPlaybookContract(
        'PLAYBOOK_P3_COVERAGE_UNKNOWN_INVALID',
        `${rowPath}.unknown_ids`,
        'invalid unknown ID'
      );
    }
    if (
      !COVERED_LAYER_SET.has(row.layer)
      && (row.rule_ids.length > 0 || row.known_capabilities.length > 0)
    ) {
      failPlaybookContract(
        'PLAYBOOK_P3_COVERAGE_STATUS_INVALID',
        rowPath,
        'not-covered layers cannot claim rules or known capabilities'
      );
    }
  }
  if (coveredRuleIds.size !== candidateRuleIds.size) {
    failPlaybookContract(
      'PLAYBOOK_P3_COVERAGE_REFERENCE_INVALID',
      'P3AdmissionPolicy.coverage',
      'coverage rows must classify every candidate exactly once'
    );
  }
}

function assertExactObject(value, objectPath, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failPlaybookContract('PLAYBOOK_P3_OBJECT_INVALID', objectPath, 'expected object');
  }
  const allowed = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      failPlaybookContract(
        'PLAYBOOK_P3_FIELD_UNKNOWN',
        `${objectPath}.${field}`,
        'unknown field'
      );
    }
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      failPlaybookContract(
        'PLAYBOOK_P3_FIELD_REQUIRED',
        `${objectPath}.${field}`,
        'missing field'
      );
    }
  }
}

function assertUniqueStringArray(value, valuePath, { allowEmpty, duplicateCode }) {
  if (
    !Array.isArray(value)
    || (!allowEmpty && value.length === 0)
    || value.length > 64
    || value.some((item) => typeof item !== 'string' || item.length === 0 || item.length > 1000)
  ) {
    failPlaybookContract(duplicateCode, valuePath, 'expected bounded non-empty strings');
  }
  if (new Set(value).size !== value.length) {
    failPlaybookContract(duplicateCode, valuePath, 'duplicate entry');
  }
}

function assertText(value, valuePath, max) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    failPlaybookContract(
      'PLAYBOOK_P3_STRING_INVALID',
      valuePath,
      `expected non-empty string up to ${max} characters`
    );
  }
}

function assertPattern(value, pattern, valuePath) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    failPlaybookContract(
      'PLAYBOOK_P3_IDENTIFIER_INVALID',
      valuePath,
      'value does not match the required identifier pattern'
    );
  }
}

function assertEqual(value, expected, code, valuePath) {
  if (value !== expected) {
    failPlaybookContract(code, valuePath, `${value} != ${expected}`);
  }
}

function assertTimestamp(value, valuePath) {
  if (
    typeof value !== 'string'
    || !UTC_TIMESTAMP.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    failPlaybookContract(
      'PLAYBOOK_P3_TIMESTAMP_INVALID',
      valuePath,
      'expected canonical UTC timestamp'
    );
  }
}

function cloneDocument(value) {
  try {
    return structuredClone(value);
  } catch (error) {
    failPlaybookContract(
      'PLAYBOOK_P3_DOCUMENT_UNCLONEABLE',
      'P3AdmissionPolicy',
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
