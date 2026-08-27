import { executeError, validateEligibilityRecord } from './contracts.js';
import { EXECUTABLE_REPAIR_ROWS } from './constants.js';
import { validateReview } from '../shadow/contracts.js';

const CORPUS_SHA256 = 'b91051095fa5336f29dc6412a0fbbc289eb60219798e488f91e1317133ddfb74';

const REVIEWED_ROWS = Object.freeze([
  row('rule:structure.compose-three-volumes', 'massing', 'check:massing:three-volume-composition', 'repair:massing:resize-or-reposition-volume', ['structure', 'roof', 'facade'], 'structural'),
  row('rule:structure.layer-volumes-to-reduce-blankness', 'massing', 'check:massing:continuous-blank-plane', 'repair:massing:adjust-volume-overlap', ['structure', 'roof', 'facade'], 'evidence-required'),
  row('rule:structure.create-primary-secondary-hierarchy', 'massing', 'check:massing:primary-secondary-hierarchy', 'repair:massing:strengthen-primary-volume', ['structure', 'roof', 'facade'], 'structural'),
  row('rule:structure.keep-support-volumes-subordinate', 'structure', 'check:massing:subordinate-support-volume', 'repair:massing:reduce-support-volume-prominence', ['structure', 'roof', 'facade'], 'structural'),
  row('rule:roof.border-with-material-contrast', 'roof', 'check:roof:border-readability', 'repair:roof:restore-continuous-border', ['facade'], 'evidence-required'),
  row('rule:roof.scale-slope-to-massing', 'roof', 'check:roof:slope-massing-fit', 'repair:roof:change-run-rise-pattern', ['facade'], 'evidence-required'),
  row('rule:roof.break-large-flat-plane', 'roof', 'check:roof:large-flat-plane', 'repair:roof:add-structural-roof-break', ['facade'], 'evidence-required'),
  row('rule:facade.frame-before-openings', 'facade', 'check:facade:opening-inside-frame', 'repair:facade:rebuild-bay-before-opening', [], 'evidence-required'),
  row('rule:facade.offset-frame-for-depth', 'facade', 'check:facade:frame-infill-depth', 'repair:facade:offset-frame-or-infill', [], 'evidence-required'),
  row('rule:facade.partition-large-wall', 'facade', 'check:facade:large-wall-partition', 'repair:facade:align-partition-to-structure', [], 'evidence-required'),
  row('rule:facade.break-repetitive-bays', 'facade', 'check:facade:repetitive-bay-signature', 'repair:facade:vary-bay-preserve-motif', [], 'evidence-required'),
  row('rule:medieval.extend-only-needed-facades', 'structure', 'check:structure:purposeful-overhang', 'repair:structure:remove-or-support-overhang', ['roof', 'facade'], 'evidence-required'),
  row('rule:medieval.show-load-path', 'structure', 'check:structure:visible-load-path', 'repair:structure:connect-support-path', ['roof', 'facade'], 'structural'),
  row('rule:medieval.align-roof-with-overhang', 'roof', 'check:roof:overhang-axis-alignment', 'repair:roof:realign-ridge-or-support', ['facade'], 'evidence-required'),
  row('rule:medieval.use-stone-base-for-height', 'structure', 'check:structure:tall-timber-base-weight', 'repair:structure:add-or-widen-base', ['roof', 'facade'], 'evidence-required'),
  row('rule:case.join-crossed-massing-with-tower', 'massing', 'check:massing:tower-joint-continuity', 'repair:massing:move-tower-to-joint', [], 'evidence-required'),
  row('rule:case.repeat-motif-for-unity', 'facade', 'check:facade:motif-unity-with-bay-variation', 'repair:facade:separate-motif-from-bay-template', [], 'evidence-required'),
  row('rule:case.use-greenery-as-composition', 'facade', 'check:facade:connected-vegetation-path', 'repair:facade:connect-or-prune-vegetation', [], 'evidence-required'),
  row('rule:case.allocate-detail-by-viewpoint', 'brief', 'check:brief:viewpoint-detail-allocation', 'repair:brief:move-detail-budget-to-primary-view', [], 'evidence-required'),
  row('rule:case.balance-warm-mass-with-dark-roof', 'roof', 'check:roof:warm-dark-visual-balance', 'repair:roof:reduce-dark-secondary-area', [], 'evidence-required'),
  row('rule:case.compose-context-depth', 'brief', 'check:brief:foreground-background-intent', 'repair:brief:restore-unobstructed-scene-depth', [], 'evidence-required')
]);

const COVERAGE_ROWS = Object.freeze([
  coverage('brief', ['rule:case.allocate-detail-by-viewpoint', 'rule:case.compose-context-depth'], ['unknown:aesthetic-evaluator', 'unknown:cross-author-validity']),
  coverage('massing', ['rule:structure.compose-three-volumes', 'rule:structure.layer-volumes-to-reduce-blankness', 'rule:structure.create-primary-secondary-hierarchy', 'rule:case.join-crossed-massing-with-tower'], ['unknown:massing-ratio-thresholds', 'unknown:blank-plane-threshold']),
  coverage('space', [], []),
  coverage('structure', ['rule:structure.keep-support-volumes-subordinate', 'rule:medieval.extend-only-needed-facades', 'rule:medieval.show-load-path', 'rule:medieval.align-roof-with-overhang', 'rule:medieval.use-stone-base-for-height'], ['unknown:medieval-scale-generalization', 'unknown:cross-author-validity']),
  coverage('roof', ['rule:roof.border-with-material-contrast', 'rule:roof.scale-slope-to-massing', 'rule:roof.break-large-flat-plane', 'rule:case.balance-warm-mass-with-dark-roof'], ['unknown:roof-slope-table', 'unknown:blank-plane-threshold']),
  coverage('facade', ['rule:facade.frame-before-openings', 'rule:facade.offset-frame-for-depth', 'rule:facade.partition-large-wall', 'rule:facade.break-repetitive-bays', 'rule:case.repeat-motif-for-unity', 'rule:case.use-greenery-as-composition'], ['unknown:blank-plane-threshold', 'unknown:repetition-limit']),
  coverage('materials', [], ['unknown:cross-author-validity']),
  coverage('interior', [], []),
  coverage('scene', [], ['unknown:aesthetic-evaluator'])
]);

const EXECUTABLE_BY_RULE = new Map(EXECUTABLE_REPAIR_ROWS.map((item) => [item.rule_id, item]));

export function evaluateExecuteEligibility({ review, hardQa, repairBudgetUsed, candidateAuthority } = {}) {
  const authoritativeReview = authorityReview(review);
  try {
    if (candidateAuthority !== undefined) assertReviewCandidateAuthority(authoritativeReview, candidateAuthority);
    if (!isExactHardQa(hardQa)) throw executeError('P5_AUTHORITY_INVALID');
    const coreRows = authoritativeReview.assessments.filter((item) => item.teaching_role === 'core-procedure');
    const unresolved = coreRows.filter((item) => item.status === 'violated').map((item) => item.rule_id);
    const unknown = coreRows.filter((item) => item.status === 'unknown').map((item) => item.rule_id);
    const notApplicable = coreRows.filter((item) => item.status === 'not-applicable').map((item) => item.rule_id);
    return validateEligibilityRecord({
      status: !hardQa.ok ? 'hard-qa-failed' : unresolved.length > 0 ? 'unresolved-core-violation' : 'eligible',
      hard_qa_ok: hardQa.ok,
      unresolved_violated_core_rule_ids: unresolved,
      neutral_unknown_rule_ids: unknown,
      neutral_not_applicable_rule_ids: notApplicable,
      repair_budget_used: repairBudgetUsed
    });
  } catch {
    throw executeError('P5_AUTHORITY_INVALID');
  }
}

export function assertReviewCandidateAuthority(review, candidateAuthority) {
  try {
    if (!candidateAuthority || Object.getPrototypeOf(candidateAuthority) !== Object.prototype
      || !sameArray(Object.keys(candidateAuthority).sort(), ['blueprint_sha256', 'seed', 'workflow'])) invalid();
    if (review.input.blueprint_sha256 !== candidateAuthority.blueprint_sha256
      || review.input.workflow !== candidateAuthority.workflow
      || review.input.seed !== candidateAuthority.seed) invalid();
    return review;
  } catch {
    throw executeError('P5_AUTHORITY_INVALID');
  }
}

export function executableViolations(review) {
  const authoritativeReview = authorityReview(review);
  return Object.freeze(authoritativeReview.assessments.filter((assessment) => {
    if (assessment.status !== 'violated') return false;
    const executable = EXECUTABLE_BY_RULE.get(assessment.rule_id);
    return executable
      && assessment.check_id === executable.check_id
      && assessment.design_layer === executable.design_layer
      && assessment.repair_operation_id === executable.repair_operation_id
      && sameArray(assessment.invalidates_layers, executable.invalidates_layers);
  }));
}

function authorityReview(value) {
  try {
    const review = validateReview(value);
    if (review.rule_corpus_sha256 !== CORPUS_SHA256) invalid();
    if (review.assessments.length !== REVIEWED_ROWS.length) invalid();
    for (const [index, assessment] of review.assessments.entries()) {
      const expected = REVIEWED_ROWS[index];
      if (
        assessment.rule_id !== expected.rule_id
        || assessment.rule_version !== 1
        || assessment.teaching_role !== expected.teaching_role
        || assessment.admission_status !== 'admitted-advisory'
        || assessment.design_layer !== expected.design_layer
        || assessment.check_id !== expected.check_id
        || assessment.checker_kind !== expected.checker_kind
      ) invalid();
      if (assessment.status === 'violated' && (
        assessment.repair_operation_id !== expected.repair_operation_id
        || assessment.repair_target_layer !== expected.repair_operation_id.split(':')[1]
        || !sameArray(assessment.invalidates_layers, expected.invalidates_layers)
      )) invalid();
    }
    for (const [index, coverageRow] of review.coverage.entries()) {
      const expected = COVERAGE_ROWS[index];
      if (!expected || coverageRow.layer !== expected.layer || !sameArray(coverageRow.rule_ids, expected.rule_ids) || !sameArray(coverageRow.unknown_ids, expected.unknown_ids)) {
        invalid();
      }
    }
    return review;
  } catch {
    throw executeError('P5_AUTHORITY_INVALID');
  }
}

function row(rule_id, design_layer, check_id, repair_operation_id, invalidates_layers, checker_kind) {
  return Object.freeze({
    rule_id,
    teaching_role: rule_id.startsWith('rule:case.') ? 'case-pattern' : 'core-procedure',
    design_layer,
    check_id,
    repair_operation_id,
    invalidates_layers: Object.freeze([...invalidates_layers]),
    checker_kind
  });
}

function coverage(layer, rule_ids, unknown_ids) {
  return Object.freeze({ layer, rule_ids: Object.freeze([...rule_ids]), unknown_ids: Object.freeze([...unknown_ids]) });
}

function isExactHardQa(value) {
  return value !== null
    && typeof value === 'object'
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === 1
    && Object.hasOwn(value, 'ok')
    && typeof value.ok === 'boolean';
}

function sameArray(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((item, index) => item === right[index]);
}

function invalid() {
  throw executeError('P5_AUTHORITY_INVALID');
}
