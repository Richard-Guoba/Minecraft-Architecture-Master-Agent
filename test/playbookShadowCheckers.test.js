import assert from 'node:assert/strict';
import test from 'node:test';
import { createCheckerRegistry } from '../src/playbook/shadow/checkerRegistry.js';

const EVIDENCE_REQUIREMENTS = new Map([
  ['check:massing:continuous-blank-plane', [['brief.primary_viewpoint', 'massing.blank_plane_regions'], ['unknown:blank-plane-threshold']]],
  ['check:roof:border-readability', [['roof.surface_regions.visual_contrast'], ['unknown:aesthetic-evaluator']]],
  ['check:roof:slope-massing-fit', [['roof.span_and_slope_ratio'], ['unknown:roof-slope-table']]],
  ['check:roof:large-flat-plane', [['roof.surface_regions.area'], ['unknown:blank-plane-threshold']]],
  ['check:facade:opening-inside-frame', [['structure.frames', 'facade.bay_grid', 'facade.opening_sequence'], []]],
  ['check:facade:frame-infill-depth', [['facade.frame_depth', 'facade.infill_depth'], []]],
  ['check:facade:large-wall-partition', [['facade.bay_grid', 'facade.wall_span'], ['unknown:blank-plane-threshold']]],
  ['check:facade:repetitive-bay-signature', [['facade.bay_grid', 'facade.motif_signatures'], ['unknown:repetition-limit']]],
  ['check:structure:purposeful-overhang', [['structure.overhangs', 'structure.support_paths'], ['unknown:medieval-scale-generalization']]],
  ['check:roof:overhang-axis-alignment', [['structure.overhangs', 'structure.support_paths', 'roof.ridge_axis'], ['unknown:medieval-scale-generalization']]],
  ['check:structure:tall-timber-base-weight', [['structure.base_strategy', 'massing.height_scale'], ['unknown:medieval-scale-generalization']]],
  ['check:massing:tower-joint-continuity', [['case.source_identity', 'massing.volume_relations'], ['unknown:cross-author-validity']]],
  ['check:facade:motif-unity-with-bay-variation', [['case.source_identity', 'facade.motif_signatures', 'facade.variation_axes'], ['unknown:cross-author-validity']]],
  ['check:facade:connected-vegetation-path', [['case.source_identity', 'facade.vegetation_path'], ['unknown:aesthetic-evaluator']]],
  ['check:brief:viewpoint-detail-allocation', [['case.source_identity', 'brief.primary_viewpoint', 'brief.detail_budget'], ['unknown:aesthetic-evaluator']]],
  ['check:roof:warm-dark-visual-balance', [['case.source_identity', 'roof.surface_regions.visual_color_balance'], ['unknown:aesthetic-evaluator']]],
  ['check:brief:foreground-background-intent', [['case.source_identity', 'brief.primary_viewpoint', 'brief.scene_intent'], ['unknown:aesthetic-evaluator']]]
]);

for (const scenario of structuralCheckerScenarios()) {
  test(`${scenario.checkId} has positive, negative, and missing evidence branches`, () => {
    assert.equal(runChecker(scenario.checkId, scenario.positive).status, 'satisfied');
    assert.equal(runChecker(scenario.checkId, scenario.negative).status, 'violated');
    const missing = runChecker(scenario.checkId, scenario.missing);
    assert.equal(missing.status, 'unknown');
    assert.ok(missing.missing_signals.length > 0 || missing.unknown_ids.length > 0);
  });
}

test('structural exclusions identify their explicit source fact', () => {
  const composition = runChecker('check:massing:three-volume-composition', projected({
    brief: { typology: 'monument' }
  }));
  const loadPath = runChecker('check:structure:visible-load-path', projected({
    brief: { style_family: 'modern' }
  }));

  for (const result of [composition, loadPath]) {
    assert.equal(result.status, 'not-applicable');
    assert.ok(result.evidence_json_pointers.length > 0);
    assert.ok(result.observations.length > 0);
  }
});

test('visible load path treats an explicit medieval style as applicable for a timber-frame subfamily', () => {
  const result = runChecker('check:structure:visible-load-path', projected({
    brief: { style: 'medieval', style_family: 'timber-frame' },
    structure: { load_paths: [] }
  }));

  assert.equal(result.status, 'violated');
  assert.deepEqual(result.evidence_json_pointers, ['/structure/load_paths']);
});

test('three-volume composition requires the primary mass to be centered', () => {
  const result = runChecker('check:massing:three-volume-composition', projected({
    massing: {
      volumes: [
        volume('main', [1, 1, 1], { relation: 'attached-north', attach_to: 'site' }, ['primary-mass']),
        volume('left', [0.4, 0.6, 0.5], { relation: 'attached-west', attach_to: 'main' }, ['secondary-mass']),
        volume('right', [0.5, 0.7, 0.4], { relation: 'attached-east', attach_to: 'main' }, ['secondary-mass'])
      ]
    }
  }));

  assert.equal(result.status, 'violated');
  assert.deepEqual(result.evidence_json_pointers, ['/architecture/volumes']);
});

test('primary-secondary hierarchy is unknown when an attached volume lacks role or tag evidence', () => {
  const result = runChecker('check:massing:primary-secondary-hierarchy', projected({
    massing: {
      volumes: [
        volume('main', [1, 1, 1], { relation: 'center' }, ['primary-mass']),
        volume('wing', [0.4, 0.6, 0.5], { relation: 'attached-west', attach_to: 'main' }, ['secondary-mass']),
        volume('unclassified', [0.3, 0.4, 0.4], { relation: 'attached-east', attach_to: 'main' })
      ]
    }
  }));

  assert.equal(result.status, 'unknown');
  assert.ok(result.missing_signals.includes('massing.secondary_volume_ids'));
});

test('every evidence-required checker returns its explicit unknown evidence', () => {
  const registry = createCheckerRegistry();
  const evidenceRequired = [...registry.values()].filter((checker) => checker.kind === 'evidence-required');

  assert.equal(evidenceRequired.length, 17);
  for (const checker of evidenceRequired) {
    const result = checker.evaluate(projected(), cardFor(checker));
    assert.deepEqual(Object.keys(result), [
      'status', 'evidence_json_pointers', 'observations', 'missing_signals', 'unknown_ids'
    ]);
    assert.equal(result.status, 'unknown');
    assert.deepEqual(
      [result.missing_signals, result.unknown_ids],
      EVIDENCE_REQUIREMENTS.get(checker.check_id)
    );
  }
});

function runChecker(checkId, input) {
  return createCheckerRegistry().get(checkId).evaluate(input, cardFor({ check_id: checkId }));
}

function cardFor(checker) {
  return { rule_id: checker.rule_id ?? 'rule:test', design_layer: checker.design_layer ?? 'massing' };
}

function structuralCheckerScenarios() {
  const validVolumes = [
    volume('main', [1, 1, 1], { relation: 'center' }, ['primary-mass'], 'main-building-envelope'),
    volume('left', [0.4, 0.6, 0.5], { relation: 'attached-west', attach_to: 'main' }, ['secondary-mass']),
    volume('right', [0.5, 0.7, 0.4], { relation: 'attached-east', attach_to: 'main' }, ['secondary-mass'])
  ];
  return [
    {
      checkId: 'check:massing:three-volume-composition',
      positive: projected({ massing: { volumes: validVolumes } }),
      negative: projected({ massing: { volumes: validVolumes.map((item) => ({ ...item, scale: [1, 1, 1] })) } }),
      missing: projected({ massing: { volumes: null } })
    },
    {
      checkId: 'check:massing:primary-secondary-hierarchy',
      positive: projected({ massing: { volumes: validVolumes } }),
      negative: projected({ massing: { volumes: [validVolumes[0], { ...validVolumes[1], scale: [2, 1, 1] }] } }),
      missing: projected({ massing: { volumes: [volume('main', [1, 1, 1], { relation: 'center' })] } })
    },
    {
      checkId: 'check:massing:subordinate-support-volume',
      positive: projected({ massing: { volumes: validVolumes } }),
      negative: projected({ massing: { volumes: [validVolumes[0], { ...validVolumes[1], scale: [2, 1, 1] }] } }),
      missing: projected({ massing: { volumes: [volume('wing', [0.4, 0.6, 0.5], { relation: 'attached-west', attach_to: 'main' }, ['secondary-mass'])] } })
    },
    {
      checkId: 'check:structure:visible-load-path',
      positive: projected({ brief: { style_family: 'medieval' }, structure: { load_paths: [{ from: 'roof', through: 'post', to: 'foundation' }] } }),
      negative: projected({ brief: { style_family: 'medieval' }, structure: { load_paths: [] } }),
      missing: projected({ brief: { style_family: null }, structure: { load_paths: null } })
    }
  ];
}

function volume(id, scale, placement, tags = [], purpose = undefined) {
  return { id, shape: 'box', scale, placement, tags, ...(purpose ? { purpose } : {}) };
}

function projected(overrides = {}) {
  return {
    brief: { typology: 'house', style: 'medieval', style_family: 'medieval', ...(overrides.brief ?? {}) },
    massing: { volumes: [], ...(overrides.massing ?? {}) },
    structure: { load_paths: null, structural_intent: null, ...(overrides.structure ?? {}) },
    roof: { overhang: null, ...(overrides.roof ?? {}) },
    facade: { ...(overrides.facade ?? {}) },
    pointers: {
      brief: { typology: '/architecture/typology', style_family: '/architecture/style_family' },
      massing: { volumes: '/architecture/volumes' },
      structure: { load_paths: '/structure/load_paths', structural_intent: '/structure/structural_intent' },
      roof: { overhang: '/roof/overhang' }
    }
  };
}
