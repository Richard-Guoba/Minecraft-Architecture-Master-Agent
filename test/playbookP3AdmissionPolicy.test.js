import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  P3_ALLOWED_FIELD_PATHS,
  P3_LAYER_ORDER,
  P3_MANAGED_ARTIFACT_PATHS,
  validateP3AdmissionPolicy
} from '../src/playbook/manual/p3AdmissionPolicy.js';

const POLICY_URL = new URL(
  '../docs/architecture-playbook/rules/schools/heihui-jileniao/admission-v0.1.json',
  import.meta.url
);

const CANDIDATE_IDS = [
  'rule:structure.compose-three-volumes',
  'rule:structure.layer-volumes-to-reduce-blankness',
  'rule:structure.create-primary-secondary-hierarchy',
  'rule:structure.keep-support-volumes-subordinate',
  'rule:roof.border-with-material-contrast',
  'rule:roof.scale-slope-to-massing',
  'rule:roof.break-large-flat-plane',
  'rule:facade.frame-before-openings',
  'rule:facade.offset-frame-for-depth',
  'rule:facade.partition-large-wall',
  'rule:facade.break-repetitive-bays',
  'rule:medieval.extend-only-needed-facades',
  'rule:medieval.show-load-path',
  'rule:medieval.align-roof-with-overhang',
  'rule:medieval.use-stone-base-for-height',
  'rule:case.join-crossed-massing-with-tower',
  'rule:case.repeat-motif-for-unity',
  'rule:case.use-greenery-as-composition',
  'rule:case.allocate-detail-by-viewpoint',
  'rule:case.balance-warm-mass-with-dark-roof',
  'rule:case.compose-context-depth'
];

const CHAPTER_IDS = [
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
];

const EXPECTED_FIELD_PATHS = [
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
];

const EXPECTED_MANAGED_PATHS = [
  'docs/architecture-playbook/manual/v0.1.md',
  'docs/architecture-playbook/manual/terminology-v0.1.json',
  'docs/architecture-playbook/manual/coverage-v0.1.json',
  'docs/architecture-playbook/rules/schools/heihui-jileniao/reviewed-rules-v0.1.jsonl',
  'docs/architecture-playbook/rules/schools/heihui-jileniao/rule-index-v0.1.json'
];

const EXPECTED_RULE_MAPPING = [
  ['rule:structure.compose-three-volumes', 'core-procedure', ['massing-foundations'], 'advisory-partial', ['brief.prompt', 'massing.volumes'], ['massing.primary_volume_id', 'massing.secondary_volume_ids', 'massing.volume_relations'], ['check:massing:three-volume-composition'], ['repair:massing:resize-or-reposition-volume'], ['structure', 'roof', 'facade']],
  ['rule:structure.layer-volumes-to-reduce-blankness', 'core-procedure', ['massing-foundations', 'failure-and-repair'], 'advisory-partial', ['brief.primary_viewpoint', 'massing.volumes', 'massing.blank_plane_regions'], ['massing.volume_relations'], ['check:massing:continuous-blank-plane'], ['repair:massing:adjust-volume-overlap'], ['structure', 'roof', 'facade']],
  ['rule:structure.create-primary-secondary-hierarchy', 'core-procedure', ['hierarchy-and-structure'], 'advisory-partial', ['massing.volumes'], ['massing.primary_volume_id', 'massing.secondary_volume_ids'], ['check:massing:primary-secondary-hierarchy'], ['repair:massing:strengthen-primary-volume'], ['structure', 'roof', 'facade']],
  ['rule:structure.keep-support-volumes-subordinate', 'core-procedure', ['hierarchy-and-structure'], 'advisory-partial', ['massing.primary_volume_id', 'massing.secondary_volume_ids'], ['massing.volume_relations'], ['check:massing:subordinate-support-volume'], ['repair:massing:reduce-support-volume-prominence'], ['structure', 'roof', 'facade']],
  ['rule:roof.border-with-material-contrast', 'core-procedure', ['roof-form'], 'advisory-partial', ['roof.profile', 'roof.surface_regions'], ['roof.border_role'], ['check:roof:border-readability'], ['repair:roof:restore-continuous-border'], ['facade']],
  ['rule:roof.scale-slope-to-massing', 'core-procedure', ['roof-form'], 'advisory-partial', ['massing.volumes', 'roof.span'], ['roof.slope_pattern', 'roof.profile'], ['check:roof:slope-massing-fit'], ['repair:roof:change-run-rise-pattern'], ['facade']],
  ['rule:roof.break-large-flat-plane', 'core-procedure', ['roof-form', 'failure-and-repair'], 'advisory-partial', ['roof.surface_regions', 'massing.volume_relations'], ['roof.secondary_roofs', 'roof.profile'], ['check:roof:large-flat-plane'], ['repair:roof:add-structural-roof-break'], ['facade']],
  ['rule:facade.frame-before-openings', 'core-procedure', ['facade-layers'], 'advisory-partial', ['structure.frames', 'facade.bay_grid'], ['facade.openings'], ['check:facade:opening-inside-frame'], ['repair:facade:rebuild-bay-before-opening'], []],
  ['rule:facade.offset-frame-for-depth', 'core-procedure', ['facade-layers'], 'advisory-partial', ['facade.bay_grid', 'facade.frame_depth', 'facade.infill_depth'], ['facade.frame_depth', 'facade.infill_depth'], ['check:facade:frame-infill-depth'], ['repair:facade:offset-frame-or-infill'], []],
  ['rule:facade.partition-large-wall', 'core-procedure', ['facade-layers'], 'advisory-partial', ['structure.frames', 'facade.bay_grid'], ['facade.bay_grid', 'facade.openings'], ['check:facade:large-wall-partition'], ['repair:facade:align-partition-to-structure'], []],
  ['rule:facade.break-repetitive-bays', 'core-procedure', ['facade-layers', 'failure-and-repair'], 'advisory-partial', ['facade.bay_grid', 'facade.motif_signatures'], ['facade.variation_axes'], ['check:facade:repetitive-bay-signature'], ['repair:facade:vary-bay-preserve-motif'], []],
  ['rule:medieval.extend-only-needed-facades', 'core-procedure', ['medieval-residence'], 'advisory-partial', ['brief.prompt', 'structure.overhangs', 'massing.volumes'], ['structure.overhangs', 'structure.support_paths'], ['check:structure:purposeful-overhang'], ['repair:structure:remove-or-support-overhang'], ['roof', 'facade']],
  ['rule:medieval.show-load-path', 'core-procedure', ['medieval-residence', 'failure-and-repair'], 'advisory-partial', ['structure.frames', 'structure.load_paths', 'structure.overhangs'], ['structure.support_paths'], ['check:structure:visible-load-path'], ['repair:structure:connect-support-path'], ['roof', 'facade']],
  ['rule:medieval.align-roof-with-overhang', 'core-procedure', ['medieval-residence', 'roof-form'], 'advisory-partial', ['structure.overhangs', 'structure.support_paths', 'roof.ridge_axis'], ['roof.ridge_axis', 'roof.profile'], ['check:roof:overhang-axis-alignment'], ['repair:roof:realign-ridge-or-support'], ['facade']],
  ['rule:medieval.use-stone-base-for-height', 'core-procedure', ['medieval-residence'], 'advisory-partial', ['massing.volumes', 'structure.load_paths'], ['structure.base_strategy', 'structure.support_paths'], ['check:structure:tall-timber-base-weight'], ['repair:structure:add-or-widen-base'], ['roof', 'facade']],
  ['rule:case.join-crossed-massing-with-tower', 'case-pattern', ['complete-case'], 'manual-example-only', ['massing.volumes', 'massing.volume_relations'], ['massing.volume_relations', 'massing.primary_volume_id'], ['check:massing:tower-joint-continuity'], ['repair:massing:move-tower-to-joint'], []],
  ['rule:case.repeat-motif-for-unity', 'case-pattern', ['complete-case', 'failure-and-repair'], 'manual-example-only', ['facade.bay_grid', 'facade.motif_signatures'], ['facade.motif_signatures', 'facade.variation_axes'], ['check:facade:motif-unity-with-bay-variation'], ['repair:facade:separate-motif-from-bay-template'], []],
  ['rule:case.use-greenery-as-composition', 'case-pattern', ['complete-case'], 'manual-example-only', ['brief.primary_viewpoint', 'facade.vegetation_path'], ['facade.vegetation_path'], ['check:facade:connected-vegetation-path'], ['repair:facade:connect-or-prune-vegetation'], []],
  ['rule:case.allocate-detail-by-viewpoint', 'case-pattern', ['complete-case', 'agent-workflow'], 'manual-example-only', ['brief.primary_viewpoint', 'brief.detail_budget'], ['brief.detail_budget'], ['check:brief:viewpoint-detail-allocation'], ['repair:brief:move-detail-budget-to-primary-view'], []],
  ['rule:case.balance-warm-mass-with-dark-roof', 'case-pattern', ['complete-case'], 'manual-example-only', ['roof.surface_regions', 'facade.motif_signatures'], ['roof.border_role', 'roof.surface_regions'], ['check:roof:warm-dark-visual-balance'], ['repair:roof:reduce-dark-secondary-area'], []],
  ['rule:case.compose-context-depth', 'case-pattern', ['complete-case'], 'manual-example-only', ['brief.primary_viewpoint', 'brief.scene_intent'], ['brief.scene_intent'], ['check:brief:foreground-background-intent'], ['repair:brief:restore-unobstructed-scene-depth'], []]
];

function policyFixture() {
  return JSON.parse(fs.readFileSync(POLICY_URL, 'utf8'));
}

function policyContext() {
  return { candidateRuleIds: new Set(CANDIDATE_IDS) };
}

function validateFixture(value = policyFixture()) {
  return validateP3AdmissionPolicy(value, policyContext());
}

test('P3 admission covers all candidates as fifteen core and six case rules', () => {
  const input = policyFixture();
  const policy = validateFixture(input);
  assert.equal(policy.rule_admissions.length, 21);
  assert.equal(policy.rule_admissions.filter(
    (item) => item.teaching_role === 'core-procedure'
  ).length, 15);
  assert.equal(policy.rule_admissions.filter(
    (item) => item.teaching_role === 'case-pattern'
  ).length, 6);
  assert.deepEqual(policy.rule_admissions.map((item) => item.rule_id), CANDIDATE_IDS);
  assert.equal(Object.isFrozen(policy.rule_admissions[0].runtime_projection), true);
  assert.equal(Object.isFrozen(policy.terminology.resolved_terms[0].rule_ids), true);
  assert.equal(Object.isFrozen(policy.coverage[0]), true);
  assert.notEqual(policy, input);
  input.rule_admissions[0].runtime_projection.input_signals[0] = 'changed';
  assert.equal(policy.rule_admissions[0].runtime_projection.input_signals[0], 'brief.prompt');
});

test('P3 constants freeze the exact controlled paths, layer order, and managed outputs', () => {
  assert.deepEqual(P3_ALLOWED_FIELD_PATHS, EXPECTED_FIELD_PATHS);
  assert.deepEqual(P3_LAYER_ORDER, [
    'brief', 'massing', 'space', 'structure', 'roof',
    'facade', 'materials', 'interior', 'scene'
  ]);
  assert.deepEqual(P3_MANAGED_ARTIFACT_PATHS, EXPECTED_MANAGED_PATHS);
  assert.equal(Object.isFrozen(P3_ALLOWED_FIELD_PATHS), true);
  assert.equal(Object.isFrozen(P3_LAYER_ORDER), true);
  assert.equal(Object.isFrozen(P3_MANAGED_ARTIFACT_PATHS), true);
});

test('checked-in P3 admission preserves the exact chapter and rule mapping', () => {
  const policy = validateFixture();
  assert.deepEqual(policy.chapters.map((chapter) => chapter.chapter_id), CHAPTER_IDS);
  assert.deepEqual(policy.chapters.map((chapter) => chapter.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(policy.rule_admissions.map((admission) => [
    admission.rule_id,
    admission.teaching_role,
    admission.chapter_ids,
    admission.runtime_projection.coverage_status,
    admission.runtime_projection.input_signals,
    admission.runtime_projection.proposal_fields,
    admission.runtime_projection.observable_checks,
    admission.runtime_projection.repair_operations,
    admission.runtime_projection.invalidates_layers
  ]), EXPECTED_RULE_MAPPING);
});

test('checked-in P3 admission contains fifteen terms, five unresolved groups, and nine inert coverage rows', () => {
  const policy = validateFixture();
  assert.deepEqual(policy.terminology.resolved_terms.map((term) => term.display_name), [
    '体块', '主体', '次体', '连接体', '主次', '框架', '墙芯', '墙间',
    '包边', '坡度', '外挑', '横架', '斜撑', '石质基座', '主要观景面'
  ]);
  assert.equal(policy.terminology.unresolved_terms.length, 5);
  assert.deepEqual(policy.coverage.map((row) => [row.layer, row.status]), [
    ['brief', 'advisory-partial'],
    ['massing', 'advisory-partial'],
    ['space', 'not-covered'],
    ['structure', 'advisory-partial'],
    ['roof', 'advisory-partial'],
    ['facade', 'advisory-partial'],
    ['materials', 'not-covered'],
    ['interior', 'not-covered'],
    ['scene', 'not-covered']
  ]);
  assert.equal(policy.coverage.every((row) => row.runtime_authority === 'none'), true);
});

test('P3 admission rejects executable authority and uncovered projection paths', () => {
  const authority = policyFixture();
  authority.rule_admissions[0].decision = 'executable';
  assert.throws(
    () => validateFixture(authority),
    /PLAYBOOK_P3_ADMISSION_DECISION_INVALID/u
  );

  const layer = policyFixture();
  layer.rule_admissions[0].runtime_projection.proposal_fields = ['materials.palette'];
  assert.throws(
    () => validateFixture(layer),
    /PLAYBOOK_P3_PROJECTION_FIELD_INVALID/u
  );
});

test('P3 admission rejects missing, duplicate, and unknown candidate rule IDs', () => {
  const missing = policyFixture();
  missing.rule_admissions.pop();
  assert.throws(() => validateFixture(missing), /PLAYBOOK_P3_ADMISSION_RULE_MISSING/u);

  const duplicate = policyFixture();
  duplicate.rule_admissions[20].rule_id = duplicate.rule_admissions[0].rule_id;
  assert.throws(() => validateFixture(duplicate), /PLAYBOOK_P3_ADMISSION_RULE_DUPLICATE/u);

  const unknown = policyFixture();
  unknown.rule_admissions[20].rule_id = 'rule:case.unknown';
  assert.throws(() => validateFixture(unknown), /PLAYBOOK_P3_ADMISSION_RULE_UNKNOWN/u);
});

test('P3 admission rejects reordered and duplicate chapters', () => {
  const reordered = policyFixture();
  [reordered.chapters[0], reordered.chapters[1]] = [
    reordered.chapters[1], reordered.chapters[0]
  ];
  assert.throws(() => validateFixture(reordered), /PLAYBOOK_P3_CHAPTER_ORDER_INVALID/u);

  const duplicate = policyFixture();
  duplicate.chapters[1].chapter_id = duplicate.chapters[0].chapter_id;
  assert.throws(() => validateFixture(duplicate), /PLAYBOOK_P3_CHAPTER_ORDER_INVALID/u);
});

test('P3 admission rejects fourteen/seven teaching-role drift', () => {
  const policy = policyFixture();
  policy.rule_admissions[0].teaching_role = 'case-pattern';
  policy.rule_admissions[0].runtime_projection.coverage_status = 'manual-example-only';
  assert.throws(() => validateFixture(policy), /PLAYBOOK_P3_TEACHING_ROLE_COUNT_INVALID/u);
});

test('P3 admission rejects duplicate projections and invalid check/repair identifiers', () => {
  const duplicate = policyFixture();
  duplicate.rule_admissions[0].runtime_projection.input_signals.push('brief.prompt');
  assert.throws(() => validateFixture(duplicate), /PLAYBOOK_P3_PROJECTION_DUPLICATE/u);

  const check = policyFixture();
  check.rule_admissions[0].runtime_projection.observable_checks = ['check:materials:palette'];
  assert.throws(() => validateFixture(check), /PLAYBOOK_P3_CHECK_IDENTIFIER_INVALID/u);

  const repair = policyFixture();
  repair.rule_admissions[0].runtime_projection.repair_operations = ['repair:roof:not_valid'];
  assert.throws(() => validateFixture(repair), /PLAYBOOK_P3_REPAIR_IDENTIFIER_INVALID/u);
});

test('P3 admission rejects runtime authority and terminology dangling references', () => {
  const authority = policyFixture();
  authority.coverage[0].runtime_authority = 'advisory';
  assert.throws(() => validateFixture(authority), /PLAYBOOK_P3_RUNTIME_AUTHORITY_INVALID/u);

  const terminology = policyFixture();
  terminology.terminology.resolved_terms[0].rule_ids = ['rule:case.unknown'];
  assert.throws(() => validateFixture(terminology), /PLAYBOOK_P3_TERMINOLOGY_RULE_UNKNOWN/u);
});

test('P3 admission enforces exact fields at every policy boundary', () => {
  const topLevel = policyFixture();
  topLevel.runtime = {};
  assert.throws(() => validateFixture(topLevel), /PLAYBOOK_P3_FIELD_UNKNOWN/u);

  const nested = policyFixture();
  nested.rule_admissions[0].runtime_projection.executor = 'apply';
  assert.throws(() => validateFixture(nested), /PLAYBOOK_P3_FIELD_UNKNOWN/u);

  const required = policyFixture();
  delete required.coverage[0].known_capabilities;
  assert.throws(() => validateFixture(required), /PLAYBOOK_P3_FIELD_REQUIRED/u);
});
