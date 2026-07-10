import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStage7Condition } from '../src/construction/learning/coarseSemanticVoxelCondition.js';
import { generateDeterministicCoarseSemanticVoxelPlan } from '../src/construction/learning/coarseSemanticVoxelBaseline.js';
import { decodeStage7Runs, hashCanonicalValue, validateStage7Plan } from '../src/construction/learning/coarseSemanticVoxelSchema.js';

test('deterministic Stage 7 baseline emits a valid reproducible whole-building plan', () => {
  const condition = fixtureCondition();
  const first = generateDeterministicCoarseSemanticVoxelPlan({ condition });
  const second = generateDeterministicCoarseSemanticVoxelPlan({ condition });
  const validation = validateStage7Plan(first, { conditionHash: condition.condition_hash });

  assert.deepEqual(first, second);
  assert.equal(first.provider.kind, 'deterministic-baseline');
  assert.equal(first.provider.name, 'stage7-coarse-semantic-voxel-baseline-v1');
  assert.equal(validation.ok, true, validation.errors.join('; '));
  assert.ok(validation.stats.cell_count > 1000);
});

test('deterministic Stage 7 baseline covers envelope, space, site, entrance, and vertical circulation semantics', () => {
  const plan = generateDeterministicCoarseSemanticVoxelPlan({ condition: fixtureCondition() });
  const cells = decodeStage7Runs(plan.runs);

  for (const role of ['wall', 'floor', 'roof', 'opening']) {
    assert.ok(cells.some((cell) => cell.envelope === role), `missing envelope role ${role}`);
  }
  for (const role of ['public', 'private', 'service', 'circulation', 'vertical_circulation']) {
    assert.ok(cells.some((cell) => cell.space === role), `missing space role ${role}`);
  }
  for (const role of ['ground', 'path', 'courtyard', 'water', 'vegetation']) {
    assert.ok(cells.some((cell) => cell.site === role), `missing site role ${role}`);
  }
  assert.ok(plan.evidence.some((item) => item.kind === 'condition'));
  assert.ok(plan.evidence.some((item) => item.kind === 'reference'));
});

test('deterministic Stage 7 baseline changes seed-controlled zoning without changing schema', () => {
  const firstCondition = fixtureCondition(7101);
  const secondCondition = fixtureCondition(7102);
  const first = generateDeterministicCoarseSemanticVoxelPlan({ condition: firstCondition });
  const second = generateDeterministicCoarseSemanticVoxelPlan({ condition: secondCondition });

  assert.notDeepEqual(first.runs, second.runs);
  assert.equal(validateStage7Plan(first, { conditionHash: firstCondition.condition_hash }).ok, true);
  assert.equal(validateStage7Plan(second, { conditionHash: secondCondition.condition_hash }).ok, true);
});

test('deterministic Stage 7 baseline preserves requested floor layers for one through five floors', () => {
  for (let floors = 1; floors <= 5; floors += 1) {
    const condition = fixtureCondition(7101, floors);
    const plan = generateDeterministicCoarseSemanticVoxelPlan({ condition });
    const cells = decodeStage7Runs(plan.runs);
    const floorLevels = new Set(cells.filter((cell) => cell.envelope === 'floor').map((cell) => cell.y));
    assert.equal(floorLevels.size, floors, `floor layer mismatch for ${floors} floors`);
    assert.ok(cells.some((cell) => cell.envelope === 'roof'), `missing roof for ${floors} floors`);
    assert.equal(validateStage7Plan(plan, { conditionHash: condition.condition_hash }).ok, true);
  }
});

test('baseline follows space-strategy signals and scopes reviewed evidence to approved layers', () => {
  const base = fixtureCondition(7101, 1);
  const changedPayload = structuredClone(base);
  delete changedPayload.condition_hash;
  changedPayload.design.space_strategy = ['public-west'];
  const changed = { ...changedPayload, condition_hash: hashCanonicalValue(changedPayload) };
  const volumePayload = structuredClone(base);
  delete volumePayload.condition_hash;
  volumePayload.design.massing_volumes = [{ id: 'wing', role: 'wing', shape: 'box', scale: [1, 0.7, 0.4], placement: { relation: 'attached-east', attach_to: 'main' }, boolean_mode: 'union', tags: ['secondary-mass'] }];
  const volumeChanged = { ...volumePayload, condition_hash: hashCanonicalValue(volumePayload) };
  const topologyPayload = structuredClone(base);
  delete topologyPayload.condition_hash;
  topologyPayload.design.topology_program = { nodes: [{ id: 'service-core', type: 'service', floor: 0, weight: 8, privacy: 'service', zone: 'service' }], edges: [], zoning: { service: ['service-core'] } };
  const topologyChanged = { ...topologyPayload, condition_hash: hashCanonicalValue(topologyPayload) };
  const baseCells = decodeStage7Runs(generateDeterministicCoarseSemanticVoxelPlan({ condition: base }).runs);
  const basePlan = generateDeterministicCoarseSemanticVoxelPlan({ condition: base });
  const changedCells = decodeStage7Runs(generateDeterministicCoarseSemanticVoxelPlan({ condition: changed }).runs);
  const averagePublicX = (cells) => {
    const values = cells.filter((cell) => cell.space === 'public').map((cell) => cell.x);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };
  assert.ok(averagePublicX(changedCells) < averagePublicX(baseCells) - 3);
  assert.notDeepEqual(generateDeterministicCoarseSemanticVoxelPlan({ condition: volumeChanged }).runs, basePlan.runs);
  assert.notDeepEqual(generateDeterministicCoarseSemanticVoxelPlan({ condition: topologyChanged }).runs, basePlan.runs);

  const referenceId = 'reference:approved-courtyard-house';
  assert.ok(baseCells.some((cell) => cell.envelope !== 'none' && cell.evidence_ids.includes(referenceId)));
  assert.equal(baseCells.some((cell) => cell.space !== 'outside' && cell.envelope === 'none' && cell.evidence_ids.includes(referenceId)), false);
  assert.equal(baseCells.some((cell) => cell.site !== 'none' && cell.evidence_ids.includes(referenceId)), false);
});

function fixtureCondition(seed = 7101, floors = 2) {
  return buildStage7Condition({
    prompt: '湖边带水景庭院的两层日式住宅，有花园和观景轴线',
    seed,
    architecture: {
      style: '日式',
      style_family: 'japanese',
      typology: 'house',
      footprint: 'courtyard',
      facade_rules: { front_side: 'south' },
      site_rules: { water_feature: true, enclosed_courtyard: true, planting_beds: true },
      massing_rules: { creative_variant: 'stepped-terrace' }
    },
    buildSpec: {
      width: 31,
      depth: 27,
      floors,
      floor_height: 5,
      total_height: floors * 5 + 4,
      door_side: 'south',
      lot: { width: 37, depth: 40 },
      constraints: { max_total_height: 40, minecraft_fill_limit: 32768 }
    },
    topology: { bsp_hints: { split_strategy: 'view-facing' } },
    creativeDesign: {
      design_axes: { massing_variant: 'stepped-terrace', split_strategy: 'view-facing' },
      topology: { public_core_position: 'view-facing' },
      site: { water_feature: true }
    },
    conceptStudio: {
      selected_concept_id: 'concept-courtyard',
      selectedConcept: {
        id: 'concept-courtyard',
        massing_plan: { variant_hint: 'courtyard', key_moves: ['stepped-terrace'] },
        space_graph_strategy: { public_core: 'living' },
        quality_targets: ['clear-entry']
      }
    },
    templateKnowledge: {
      retrieval_explanation: {
        source: 'template-explainable-retriever-v1',
        references: [{
          case_id: 'approved-courtyard-house',
          title: 'Approved Courtyard House',
          rank: 1,
          match_score: 90,
          review_state: 'approved',
          review_confidence: 0.9,
          approved_learning_areas: [],
          blocked_learning_areas: [],
          teaches: [{ area: 'massing', claim: 'courtyard massing', confidence: 0.9 }],
          risk_controls: ['change dimensions']
        }]
      }
    }
  });
}
