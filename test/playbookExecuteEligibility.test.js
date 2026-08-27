import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateExecuteEligibility,
  executableViolations
} from '../src/playbook/execute/eligibility.js';

const CORPUS_SHA256 = 'b91051095fa5336f29dc6412a0fbbc289eb60219798e488f91e1317133ddfb74';
const HASH = 'a'.repeat(64);
const LAYERS = ['brief', 'massing', 'space', 'structure', 'roof', 'facade', 'materials', 'interior', 'scene'];
const CARD_ROWS = [
  ['rule:structure.compose-three-volumes', 'massing', 'check:massing:three-volume-composition', 'repair:massing:resize-or-reposition-volume', ['structure', 'roof', 'facade'], 'structural'],
  ['rule:structure.layer-volumes-to-reduce-blankness', 'massing', 'check:massing:continuous-blank-plane', 'repair:massing:adjust-volume-overlap', ['structure', 'roof', 'facade'], 'evidence-required'],
  ['rule:structure.create-primary-secondary-hierarchy', 'massing', 'check:massing:primary-secondary-hierarchy', 'repair:massing:strengthen-primary-volume', ['structure', 'roof', 'facade'], 'structural'],
  ['rule:structure.keep-support-volumes-subordinate', 'structure', 'check:massing:subordinate-support-volume', 'repair:massing:reduce-support-volume-prominence', ['structure', 'roof', 'facade'], 'structural'],
  ['rule:roof.border-with-material-contrast', 'roof', 'check:roof:border-readability', 'repair:roof:restore-continuous-border', ['facade'], 'evidence-required'],
  ['rule:roof.scale-slope-to-massing', 'roof', 'check:roof:slope-massing-fit', 'repair:roof:change-run-rise-pattern', ['facade'], 'evidence-required'],
  ['rule:roof.break-large-flat-plane', 'roof', 'check:roof:large-flat-plane', 'repair:roof:add-structural-roof-break', ['facade'], 'evidence-required'],
  ['rule:facade.frame-before-openings', 'facade', 'check:facade:opening-inside-frame', 'repair:facade:rebuild-bay-before-opening', [], 'evidence-required'],
  ['rule:facade.offset-frame-for-depth', 'facade', 'check:facade:frame-infill-depth', 'repair:facade:offset-frame-or-infill', [], 'evidence-required'],
  ['rule:facade.partition-large-wall', 'facade', 'check:facade:large-wall-partition', 'repair:facade:align-partition-to-structure', [], 'evidence-required'],
  ['rule:facade.break-repetitive-bays', 'facade', 'check:facade:repetitive-bay-signature', 'repair:facade:vary-bay-preserve-motif', [], 'evidence-required'],
  ['rule:medieval.extend-only-needed-facades', 'structure', 'check:structure:purposeful-overhang', 'repair:structure:remove-or-support-overhang', ['roof', 'facade'], 'evidence-required'],
  ['rule:medieval.show-load-path', 'structure', 'check:structure:visible-load-path', 'repair:structure:connect-support-path', ['roof', 'facade'], 'structural'],
  ['rule:medieval.align-roof-with-overhang', 'roof', 'check:roof:overhang-axis-alignment', 'repair:roof:realign-ridge-or-support', ['facade'], 'evidence-required'],
  ['rule:medieval.use-stone-base-for-height', 'structure', 'check:structure:tall-timber-base-weight', 'repair:structure:add-or-widen-base', ['roof', 'facade'], 'evidence-required'],
  ['rule:case.join-crossed-massing-with-tower', 'massing', 'check:massing:tower-joint-continuity', 'repair:massing:move-tower-to-joint', [], 'evidence-required'],
  ['rule:case.repeat-motif-for-unity', 'facade', 'check:facade:motif-unity-with-bay-variation', 'repair:facade:separate-motif-from-bay-template', [], 'evidence-required'],
  ['rule:case.use-greenery-as-composition', 'facade', 'check:facade:connected-vegetation-path', 'repair:facade:connect-or-prune-vegetation', [], 'evidence-required'],
  ['rule:case.allocate-detail-by-viewpoint', 'brief', 'check:brief:viewpoint-detail-allocation', 'repair:brief:move-detail-budget-to-primary-view', [], 'evidence-required'],
  ['rule:case.balance-warm-mass-with-dark-roof', 'roof', 'check:roof:warm-dark-visual-balance', 'repair:roof:reduce-dark-secondary-area', [], 'evidence-required'],
  ['rule:case.compose-context-depth', 'brief', 'check:brief:foreground-background-intent', 'repair:brief:restore-unobstructed-scene-depth', [], 'evidence-required']
];
const COVERAGE_UNKNOWNS = {
  brief: ['unknown:aesthetic-evaluator', 'unknown:cross-author-validity'],
  massing: ['unknown:massing-ratio-thresholds', 'unknown:blank-plane-threshold'],
  space: [],
  structure: ['unknown:medieval-scale-generalization', 'unknown:cross-author-validity'],
  roof: ['unknown:roof-slope-table', 'unknown:blank-plane-threshold'],
  facade: ['unknown:blank-plane-threshold', 'unknown:repetition-limit'],
  materials: ['unknown:cross-author-validity'],
  interior: [],
  scene: ['unknown:aesthetic-evaluator']
};
const COVERAGE_RULE_IDS = {
  brief: ['rule:case.allocate-detail-by-viewpoint', 'rule:case.compose-context-depth'],
  massing: ['rule:structure.compose-three-volumes', 'rule:structure.layer-volumes-to-reduce-blankness', 'rule:structure.create-primary-secondary-hierarchy', 'rule:case.join-crossed-massing-with-tower'],
  space: [],
  structure: ['rule:structure.keep-support-volumes-subordinate', 'rule:medieval.extend-only-needed-facades', 'rule:medieval.show-load-path', 'rule:medieval.align-roof-with-overhang', 'rule:medieval.use-stone-base-for-height'],
  roof: ['rule:roof.border-with-material-contrast', 'rule:roof.scale-slope-to-massing', 'rule:roof.break-large-flat-plane', 'rule:case.balance-warm-mass-with-dark-roof'],
  facade: ['rule:facade.frame-before-openings', 'rule:facade.offset-frame-for-depth', 'rule:facade.partition-large-wall', 'rule:facade.break-repetitive-bays', 'rule:case.repeat-motif-for-unity', 'rule:case.use-greenery-as-composition'],
  materials: [],
  interior: [],
  scene: []
};

test('classifies literal complete P4 reviews without a score channel', () => {
  const allNeutral = literalReview();
  const oneCoreViolation = literalReview({ statuses: { 0: 'violated' } });
  const allSatisfied = literalReview({ coreStatus: 'satisfied' });

  assert.equal(evaluateExecuteEligibility({ review: allNeutral, hardQa: { ok: true }, repairBudgetUsed: 0 }).status, 'eligible');
  assert.equal(evaluateExecuteEligibility({ review: oneCoreViolation, hardQa: { ok: true }, repairBudgetUsed: 0 }).status, 'unresolved-core-violation');
  assert.equal(evaluateExecuteEligibility({ review: allSatisfied, hardQa: { ok: false }, repairBudgetUsed: 0 }).status, 'hard-qa-failed');
  assert.deepEqual(
    evaluateExecuteEligibility({ review: literalReview({ coreStatus: 'satisfied', statuses: { 1: 'unknown', 3: 'not-applicable' } }), hardQa: { ok: true }, repairBudgetUsed: 1 }),
    {
      status: 'eligible',
      hard_qa_ok: true,
      unresolved_violated_core_rule_ids: [],
      neutral_unknown_rule_ids: [CARD_ROWS[1][0]],
      neutral_not_applicable_rule_ids: [CARD_ROWS[3][0]],
      repair_budget_used: 1
    }
  );
});

test('rejects malformed P4 authority instead of treating it as eligibility', () => {
  const mutations = [
    ['fourteen core rows', (review) => { review.assessments[0].teaching_role = 'case-pattern'; review.assessments[0].status = 'unknown'; review.assessments[0].admission_status = 'manual-example-only'; }],
    ['sixteen core rows', (review) => { review.assessments[15].teaching_role = 'core-procedure'; }],
    ['five case rows', (review) => { review.assessments[15].teaching_role = 'core-procedure'; }],
    ['seven case rows', (review) => { review.assessments[0].teaching_role = 'case-pattern'; review.assessments[0].status = 'unknown'; review.assessments[0].admission_status = 'manual-example-only'; }],
    ['reordered assessments', (review) => { [review.assessments[0], review.assessments[1]] = [review.assessments[1], review.assessments[0]]; }],
    ['invented rule', (review) => { review.assessments[0].rule_id = 'rule:invented'; }],
    ['invented check', (review) => { review.assessments[0].check_id = 'check:invented'; }],
    ['invented repair', (review) => { review.assessments[0].status = 'violated'; review.assessments[0].repair_operation_id = 'repair:massing:invented'; review.assessments[0].repair_target_layer = 'massing'; review.assessments[0].invalidates_layers = ['structure', 'roof', 'facade']; review.assessments[0].evidence_json_pointers = ['/architecture']; review.assessments[0].observations = ['observed']; }],
    ['wrong corpus hash', (review) => { review.rule_corpus_sha256 = 'b'.repeat(64); }],
    ['repair on unknown', (review) => { review.assessments[0].repair_operation_id = CARD_ROWS[0][3]; review.assessments[0].repair_target_layer = 'massing'; }],
    ['core violation without reviewed repair', (review) => { review.assessments[0].status = 'violated'; review.assessments[0].repair_operation_id = null; review.assessments[0].repair_target_layer = null; review.assessments[0].invalidates_layers = []; review.assessments[0].evidence_json_pointers = ['/architecture']; review.assessments[0].observations = ['observed']; }],
    ['case violation', (review) => { const row = review.assessments[15]; row.status = 'violated'; row.repair_operation_id = CARD_ROWS[15][3]; row.repair_target_layer = 'massing'; row.evidence_json_pointers = ['/architecture']; row.observations = ['observed']; }]
  ];
  for (const [name, mutate] of mutations) {
    const review = literalReview();
    mutate(review);
    refreshReviewDerivedFields(review);
    assert.throws(
      () => evaluateExecuteEligibility({ review, hardQa: { ok: true }, repairBudgetUsed: 0 }),
      { code: 'P5_AUTHORITY_INVALID' },
      name
    );
  }
  for (const field of ['score', 'points', 'percent', 'grade', 'threshold', 'reason']) {
    const review = literalReview();
    review[field] = field === 'reason' ? 'not allowed' : 1;
    assert.throws(
      () => evaluateExecuteEligibility({ review, hardQa: { ok: true }, repairBudgetUsed: 0 }),
      { code: 'P5_AUTHORITY_INVALID' },
      field
    );
  }
});

test('returns only the four exact structural violations in reviewed order', () => {
  const review = literalReview({ statuses: { 0: 'violated', 1: 'violated', 2: 'violated', 3: 'violated', 12: 'violated' } });
  assert.deepEqual(executableViolations(review).map((row) => row.rule_id), [
    CARD_ROWS[0][0], CARD_ROWS[2][0], CARD_ROWS[3][0], CARD_ROWS[12][0]
  ]);
  assert.deepEqual(
    evaluateExecuteEligibility({ review, hardQa: { ok: true }, repairBudgetUsed: 0 }).unresolved_violated_core_rule_ids,
    [CARD_ROWS[0][0], CARD_ROWS[1][0], CARD_ROWS[2][0], CARD_ROWS[3][0], CARD_ROWS[12][0]]
  );
});

test('requires reviewed P4 order for ordered neutral eligibility evidence', () => {
  const review = literalReview({ statuses: { 0: 'unknown', 2: 'unknown' } });
  assert.deepEqual(
    evaluateExecuteEligibility({ review, hardQa: { ok: true }, repairBudgetUsed: 0 }).neutral_unknown_rule_ids.slice(0, 3),
    [CARD_ROWS[0][0], CARD_ROWS[1][0], CARD_ROWS[2][0]]
  );
  const reversed = literalReview();
  [reversed.assessments[0], reversed.assessments[2]] = [reversed.assessments[2], reversed.assessments[0]];
  refreshReviewDerivedFields(reversed);
  assert.throws(
    () => evaluateExecuteEligibility({ review: reversed, hardQa: { ok: true }, repairBudgetUsed: 0 }),
    { code: 'P5_AUTHORITY_INVALID' }
  );
});

function literalReview({ coreStatus = 'unknown', statuses = {} } = {}) {
  const assessments = CARD_ROWS.map(([rule_id, design_layer, check_id, repair_operation_id, invalidates_layers, checker_kind], index) => {
    const status = statuses[index] ?? (index < 15 ? coreStatus : 'unknown');
    const violated = status === 'violated';
    return {
      rule_id,
      rule_version: 1,
      teaching_role: index < 15 ? 'core-procedure' : 'case-pattern',
      admission_status: 'admitted-advisory',
      design_layer,
      check_id,
      checker_kind,
      status,
      evidence_json_pointers: violated ? ['/architecture'] : [],
      observations: status === 'satisfied' || status === 'not-applicable' || violated ? ['observed'] : [],
      missing_signals: status === 'unknown' ? ['evidence'] : [],
      unknown_ids: status === 'unknown' ? [`unknown:neutral-${index}`] : [],
      repair_operation_id: violated ? repair_operation_id : null,
      repair_target_layer: violated ? repair_operation_id.split(':')[1] : null,
      invalidates_layers: violated ? invalidates_layers : []
    };
  });
  const review = {
    schema_version: 1,
    evaluator_version: '0.1.0',
    playbook_version: '0.1.0',
    school_id: 'heihui-jileniao',
    input: { blueprint_path: 'blueprint.json', blueprint_sha256: HASH, workflow: 'construction_method_v1', seed: 7 },
    rule_corpus_sha256: CORPUS_SHA256,
    coverage: LAYERS.map((layer) => ({
      layer,
      status: ['brief', 'massing', 'structure', 'roof', 'facade'].includes(layer) ? 'advisory-partial' : 'not-covered',
      rule_ids: COVERAGE_RULE_IDS[layer],
      unknown_ids: COVERAGE_UNKNOWNS[layer],
      assessment_counts: countsFor(assessments.filter((row) => row.design_layer === layer))
    })),
    assessments,
    summary: null
  };
  refreshReviewDerivedFields(review);
  return review;
}

function refreshReviewDerivedFields(review) {
  review.coverage = review.coverage.map((row) => ({
    ...row,
    assessment_counts: countsFor(review.assessments.filter((item) => item.design_layer === row.layer))
  }));
  review.summary = {
    assessment_count: review.assessments.length,
    core_procedure_count: review.assessments.filter((row) => row.teaching_role === 'core-procedure').length,
    case_pattern_count: review.assessments.filter((row) => row.teaching_role === 'case-pattern').length,
    status_counts: countsFor(review.assessments),
    layer_status_counts: LAYERS.map((layer) => ({ layer, ...countsFor(review.assessments.filter((row) => row.design_layer === layer)) })),
    missing_evidence_rule_count: review.assessments.filter((row) => row.status === 'unknown').length
  };
}

function countsFor(rows) {
  const result = { satisfied: 0, violated: 0, unknown: 0, 'not-applicable': 0 };
  for (const row of rows) result[row.status] += 1;
  return result;
}
