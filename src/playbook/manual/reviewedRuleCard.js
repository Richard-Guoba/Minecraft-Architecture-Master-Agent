import { createHash } from 'node:crypto';
import { failPlaybookContract } from '../contracts/playbookContractError.js';

const PLAYBOOK_VERSION = '0.1.0';
const CARD_FIELDS = [
  'schema_version',
  'playbook_version',
  'rule_id',
  'rule_version',
  'source_candidate_sha256',
  'primary_school',
  'source_episode_bvids',
  'evidence_ids',
  'claim_type',
  'design_layer',
  'teaching_role',
  'chapter_ids',
  'authority',
  'maturity',
  'admission_status',
  'effect_validation_status',
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
  'conflict_ids',
  'runtime_projection',
  'editorial_note'
];
const CANDIDATE_FIELDS = [
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
  'conflict_ids'
];
const P2_CANDIDATE_FIELDS = [
  'schema_version',
  ...CANDIDATE_FIELDS.slice(0, 2),
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
const POLICY_FIELDS = [
  'teaching_role',
  'chapter_ids',
  'runtime_projection',
  'editorial_note'
];
const ADMISSION_FIELDS = ['rule_id', 'decision', ...POLICY_FIELDS];

export function deriveReviewedRuleCard(candidate, admission, { playbookVersion } = {}) {
  const validatedCandidate = validateCandidateBoundary(candidate);
  validateDerivationContext(validatedCandidate, admission, playbookVersion);
  return validateReviewedRuleCard(createReviewedRuleCard(validatedCandidate, admission), {
    candidate: validatedCandidate,
    admission
  });
}

export function validateReviewedRuleCard(value, { candidate, admission } = {}) {
  const card = cloneDocument(value, 'ReviewedRuleCard');
  const validatedCandidate = validateCandidateBoundary(candidate);
  validateDerivationContext(validatedCandidate, admission, card.playbook_version);
  assertExactObject(card, 'ReviewedRuleCard', CARD_FIELDS, 'PLAYBOOK_P3_CARD_FIELDS_INVALID');

  if (card.schema_version !== 1 || card.playbook_version !== PLAYBOOK_VERSION) {
    failPlaybookContract(
      'PLAYBOOK_P3_CARD_VERSION_INVALID',
      'ReviewedRuleCard',
      'expected schema version 1 and playbook version 0.1.0'
    );
  }
  if (card.authority !== 'advisory') {
    failPlaybookContract(
      'PLAYBOOK_P3_AUTHORITY_INVALID',
      'ReviewedRuleCard.authority',
      'P3 reviewed cards are advisory only'
    );
  }
  if (card.maturity !== 'candidate') {
    failPlaybookContract(
      'PLAYBOOK_P3_MATURITY_INVALID',
      'ReviewedRuleCard.maturity',
      'P3 reviewed cards remain candidates'
    );
  }
  if (card.admission_status !== 'admitted-advisory') {
    failPlaybookContract(
      'PLAYBOOK_P3_ADMISSION_STATUS_INVALID',
      'ReviewedRuleCard.admission_status',
      'expected admitted-advisory'
    );
  }
  if (card.effect_validation_status !== 'not-tested') {
    failPlaybookContract(
      'PLAYBOOK_P3_EFFECT_VALIDATION_INVALID',
      'ReviewedRuleCard.effect_validation_status',
      'P3 does not validate effects'
    );
  }

  const expected = createReviewedRuleCard(validatedCandidate, admission);
  const candidateFields = ['source_candidate_sha256', ...CANDIDATE_FIELDS];
  if (candidateFields.some((field) => !sameJson(card[field], expected[field]))) {
    failPlaybookContract(
      'PLAYBOOK_P3_CANDIDATE_CONTENT_DRIFT',
      'ReviewedRuleCard',
      'candidate-derived fields must be copied exactly'
    );
  }
  if (POLICY_FIELDS.some((field) => !sameJson(card[field], expected[field]))) {
    failPlaybookContract(
      'PLAYBOOK_P3_POLICY_CONTENT_DRIFT',
      'ReviewedRuleCard',
      'admission-derived fields must be copied exactly'
    );
  }
  return deepFreeze(card);
}

export function buildReviewedRuleCards(candidates, policy) {
  if (!Array.isArray(candidates) || candidates.length !== 21) {
    failPlaybookContract(
      'PLAYBOOK_P3_POLICY_CANDIDATE_MISMATCH',
      'candidates',
      'expected the 21 P2 candidates in JSONL order'
    );
  }
  if (!policy || typeof policy !== 'object' || !Array.isArray(policy.rule_admissions)) {
    failPlaybookContract(
      'PLAYBOOK_P3_POLICY_CANDIDATE_MISMATCH',
      'policy.rule_admissions',
      'expected validated P3 admissions'
    );
  }
  const candidateIds = candidates.map((candidate) => candidate?.rule_id);
  const admissionIds = policy.rule_admissions.map((admission) => admission?.rule_id);
  if (
    admissionIds.length !== candidates.length
    || new Set(candidateIds).size !== candidates.length
    || new Set(admissionIds).size !== admissionIds.length
    || candidateIds.some((id) => !admissionIds.includes(id))
  ) {
    failPlaybookContract(
      'PLAYBOOK_P3_POLICY_CANDIDATE_MISMATCH',
      'candidates',
      'candidate and admission rule IDs must be unique and equal'
    );
  }
  const admissionsByRuleId = new Map(
    policy.rule_admissions.map((admission) => [admission.rule_id, admission])
  );
  return deepFreeze(candidates.map((candidate) => deriveReviewedRuleCard(
    candidate,
    admissionsByRuleId.get(candidate.rule_id),
    { playbookVersion: policy.playbook_version }
  )));
}

function createReviewedRuleCard(candidate, admission) {
  return {
    schema_version: 1,
    playbook_version: PLAYBOOK_VERSION,
    rule_id: candidate.rule_id,
    rule_version: candidate.rule_version,
    source_candidate_sha256: candidateHash(candidate),
    primary_school: candidate.primary_school,
    source_episode_bvids: cloneDocument(candidate.source_episode_bvids, 'candidate.source_episode_bvids'),
    evidence_ids: cloneDocument(candidate.evidence_ids, 'candidate.evidence_ids'),
    claim_type: candidate.claim_type,
    design_layer: candidate.design_layer,
    teaching_role: admission.teaching_role,
    chapter_ids: cloneDocument(admission.chapter_ids, 'admission.chapter_ids'),
    authority: 'advisory',
    maturity: 'candidate',
    admission_status: 'admitted-advisory',
    effect_validation_status: 'not-tested',
    intent: candidate.intent,
    applicability: cloneDocument(candidate.applicability, 'candidate.applicability'),
    prerequisites: cloneDocument(candidate.prerequisites, 'candidate.prerequisites'),
    exclusions: cloneDocument(candidate.exclusions, 'candidate.exclusions'),
    action: candidate.action,
    parameters: cloneDocument(candidate.parameters, 'candidate.parameters'),
    implementation_hints: cloneDocument(candidate.implementation_hints, 'candidate.implementation_hints'),
    positive_signs: cloneDocument(candidate.positive_signs, 'candidate.positive_signs'),
    failure_modes: cloneDocument(candidate.failure_modes, 'candidate.failure_modes'),
    repairs: cloneDocument(candidate.repairs, 'candidate.repairs'),
    author_reason: candidate.author_reason,
    confidence: candidate.confidence,
    conflict_ids: cloneDocument(candidate.conflict_ids, 'candidate.conflict_ids'),
    runtime_projection: cloneDocument(admission.runtime_projection, 'admission.runtime_projection'),
    editorial_note: admission.editorial_note
  };
}

function validateDerivationContext(candidate, admission, playbookVersion) {
  if (!candidate || typeof candidate !== 'object' || !admission || typeof admission !== 'object') {
    failPlaybookContract(
      'PLAYBOOK_P3_CARD_CONTEXT_INVALID',
      'candidate/admission',
      'validated candidate and admission required'
    );
  }
  assertExactObject(admission, 'P3Admission', ADMISSION_FIELDS, 'PLAYBOOK_P3_CARD_CONTEXT_INVALID');
  if (playbookVersion !== PLAYBOOK_VERSION) {
    failPlaybookContract(
      'PLAYBOOK_P3_CARD_VERSION_INVALID',
      'playbookVersion',
      'expected 0.1.0'
    );
  }
  if (candidate.rule_id !== admission.rule_id) {
    failPlaybookContract(
      'PLAYBOOK_P3_POLICY_CANDIDATE_MISMATCH',
      'candidate.rule_id',
      'candidate and admission must name the same rule'
    );
  }
  if (admission.decision !== 'admitted-advisory') {
    failPlaybookContract(
      'PLAYBOOK_P3_ADMISSION_STATUS_INVALID',
      'admission.decision',
      'P3 admits advisory cards only'
    );
  }
}

function validateCandidateBoundary(candidate) {
  const validatedCandidate = cloneDocument(candidate, 'PlaybookRuleCandidate');
  assertExactObject(
    validatedCandidate,
    'PlaybookRuleCandidate',
    P2_CANDIDATE_FIELDS,
    'PLAYBOOK_P3_CANDIDATE_FIELDS_INVALID'
  );
  return validatedCandidate;
}

function candidateHash(candidate) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(candidate)))
    .digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function assertExactObject(value, valuePath, fields, code) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))
  ) {
    failPlaybookContract(code, valuePath, 'unexpected field shape');
  }
}

function cloneDocument(value, valuePath) {
  try {
    return structuredClone(value);
  } catch (error) {
    failPlaybookContract(
      'PLAYBOOK_P3_CARD_UNCLONEABLE',
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
