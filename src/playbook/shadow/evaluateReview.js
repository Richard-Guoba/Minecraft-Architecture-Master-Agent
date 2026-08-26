import { deepFreeze, sha256, stableJson } from './canonical.js';
import { EVALUATOR_VERSION, LAYER_ORDER, PLAYBOOK_VERSION, SCHOOL_ID, SHADOW_SCHEMA_VERSION } from './constants.js';
import { projectBlueprint } from './blueprintProjection.js';
import { shadowError, validateReview } from './contracts.js';
import { validateCheckerRegistry } from './checkerRegistry.js';

const RESULT_FIELDS = Object.freeze([
  'status', 'evidence_json_pointers', 'observations', 'missing_signals', 'unknown_ids'
]);
const STATUSES = new Set(['satisfied', 'violated', 'unknown', 'not-applicable']);

export function evaluateShadowReview({ blueprint, blueprintPath, blueprintSha256, corpus, registry } = {}) {
  assertCorpus(corpus);
  const projected = projectBlueprint(blueprint);
  const checkedRegistry = validateCheckerRegistry(corpus.cards, registry);
  const assessments = corpus.cards.map((card) => {
    const checkId = card.runtime_projection.observable_checks[0];
    const checker = checkedRegistry.get(checkId);
    const raw = checker.evaluate(projected, card);
    return assessmentFrom(card, checker, raw);
  });
  const review = {
    schema_version: SHADOW_SCHEMA_VERSION,
    evaluator_version: EVALUATOR_VERSION,
    playbook_version: PLAYBOOK_VERSION,
    school_id: SCHOOL_ID,
    input: {
      blueprint_path: blueprintPath,
      blueprint_sha256: blueprintSha256,
      workflow: blueprint?.workflow,
      seed: blueprint?.seed
    },
    rule_corpus_sha256: corpus.corpus_sha256,
    coverage: coverageFrom(corpus.coverage, assessments),
    assessments,
    summary: summaryFrom(assessments)
  };
  return validateReview(deepFreeze(review));
}

export function reviewHash(review) {
  return sha256(stableJson(validateReview(review)));
}

function assessmentFrom(card, checker, raw) {
  assertRawResult(raw);
  const isCasePattern = card.runtime_projection.coverage_status === 'manual-example-only';
  if (isCasePattern && !['unknown', 'not-applicable'].includes(raw.status)) {
    throw shadowError('PLAYBOOK_CORPUS_INVALID');
  }
  const violated = raw.status === 'violated';
  const repair = violated ? card.runtime_projection.repair_operations[0] : null;
  return {
    rule_id: card.rule_id,
    rule_version: card.rule_version,
    teaching_role: card.teaching_role,
    admission_status: card.admission_status,
    design_layer: card.design_layer,
    check_id: card.runtime_projection.observable_checks[0],
    checker_kind: checker.kind,
    status: raw.status,
    evidence_json_pointers: stableUnique(raw.evidence_json_pointers),
    observations: stableUnique(raw.observations),
    missing_signals: stableUnique(raw.missing_signals),
    unknown_ids: stableUnique(raw.unknown_ids),
    repair_operation_id: repair,
    repair_target_layer: repair ? repair.split(':')[1] : null,
    invalidates_layers: repair ? [...card.runtime_projection.invalidates_layers] : []
  };
}

function coverageFrom(rows, assessments) {
  return LAYER_ORDER.map((layer) => {
    const row = rows.find((item) => item.layer === layer);
    if (!row) throw shadowError('PLAYBOOK_CORPUS_INVALID');
    return {
      layer,
      status: row.status,
      rule_ids: [...row.rule_ids],
      unknown_ids: [...row.unknown_ids],
      assessment_counts: countsFor(assessments.filter((item) => item.design_layer === layer))
    };
  });
}

function summaryFrom(assessments) {
  const coreProcedureCount = assessments.filter((item) => item.teaching_role === 'core-procedure').length;
  return {
    assessment_count: assessments.length,
    core_procedure_count: coreProcedureCount,
    case_pattern_count: assessments.length - coreProcedureCount,
    status_counts: countsFor(assessments),
    layer_status_counts: LAYER_ORDER.map((layer) => ({
      layer,
      ...countsFor(assessments.filter((item) => item.design_layer === layer))
    })),
    missing_evidence_rule_count: assessments.filter((item) => item.status === 'unknown').length
  };
}

function countsFor(assessments) {
  const counts = { satisfied: 0, violated: 0, unknown: 0, 'not-applicable': 0 };
  for (const assessment of assessments) counts[assessment.status] += 1;
  return counts;
}

function assertCorpus(corpus) {
  if (
    !corpus
    || corpus.playbook_version !== PLAYBOOK_VERSION
    || corpus.school_id !== SCHOOL_ID
    || !Array.isArray(corpus.cards)
    || corpus.cards.length !== 21
    || !Array.isArray(corpus.coverage)
    || typeof corpus.corpus_sha256 !== 'string'
  ) throw shadowError('PLAYBOOK_CORPUS_INVALID');
}

function assertRawResult(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalidRawResult();
  const keys = Object.keys(raw);
  if (keys.length !== RESULT_FIELDS.length || keys.some((key) => !RESULT_FIELDS.includes(key))) {
    invalidRawResult();
  }
  if (!STATUSES.has(raw.status)) invalidRawResult();
  assertStrings(raw.evidence_json_pointers, (item) => item.startsWith('/'));
  assertStrings(raw.observations);
  assertStrings(raw.missing_signals);
  assertStrings(raw.unknown_ids, (item) => item.startsWith('unknown:'));
}

function assertStrings(value, predicate = () => true) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !predicate(item))) {
    invalidRawResult();
  }
}

function stableUnique(values) {
  return [...new Set(values)];
}

function invalidRawResult() {
  throw shadowError('PLAYBOOK_CORPUS_INVALID');
}
