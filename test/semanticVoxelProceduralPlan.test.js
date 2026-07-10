import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStage7Condition } from '../src/construction/learning/coarseSemanticVoxelCondition.js';
import { generateDeterministicCoarseSemanticVoxelPlan } from '../src/construction/learning/coarseSemanticVoxelBaseline.js';
import { repairCoarseSemanticVoxelPlan } from '../src/construction/learning/coarseSemanticVoxelRepair.js';
import { decodeStage7Runs, encodeStage7Cells } from '../src/construction/learning/coarseSemanticVoxelSchema.js';
import {
  convertSemanticVoxelPlanToProceduralPlan,
  deriveStage7Sketches
} from '../src/construction/learning/semanticVoxelProceduralPlan.js';

test('Stage 7 converter derives massing, space, and site sketches from the repaired grid', () => {
  const fixture = conversionFixture();
  const repaired = repairedFixture(fixture.condition);
  const sketches = deriveStage7Sketches({ plan: repaired.plan, condition: fixture.condition });
  const cells = decodeStage7Runs(repaired.plan.runs);

  assert.ok(sketches.massing.length >= 1);
  assert.ok(sketches.spaces.some((item) => item.role === 'public'));
  assert.ok(sketches.spaces.some((item) => item.role === 'vertical_circulation'));
  assert.ok(sketches.site.some((item) => item.role === 'courtyard'));
  assert.ok(sketches.site.some((item) => item.role === 'water'));
  assert.ok(sketches.massing.every((item) => item.bounds.minX >= 0 && item.bounds.maxX <= 63));
  assert.equal(sketches.massing.reduce((sum, item) => sum + item.cell_count, 0), cells.filter((cell) => ['wall', 'floor', 'roof', 'support'].includes(cell.envelope)).length);
  assert.ok(sketches.spaces.some((item) => item.adjacent_zone_ids.length > 0));
});

test('Stage 7 converter returns normalized candidate semantic inputs without mutating baselines', () => {
  const fixture = conversionFixture();
  const originalArchitecture = structuredClone(fixture.architecture);
  const originalBuildSpec = structuredClone(fixture.buildSpec);
  const originalTopology = structuredClone(fixture.topology);
  const repaired = repairedFixture(fixture.condition);
  const candidate = convertSemanticVoxelPlanToProceduralPlan({
    plan: repaired.plan,
    condition: fixture.condition,
    architecture: fixture.architecture,
    buildSpec: fixture.buildSpec,
    topology: fixture.topology,
    prompt: fixture.prompt
  });

  assert.equal(candidate.source, 'stage7-coarse-semantic-voxel-procedural-plan-v1');
  assert.equal(candidate.active, true);
  assert.equal(candidate.architecture.source, 'stage7-shadow-candidate');
  assert.equal(candidate.architecture.volumes[0].id, 'main');
  assert.ok(candidate.architecture.volumes.some((item) => item.boolean_mode === 'subtract' && item.tags.includes('courtyard-void')));
  assert.equal(candidate.architecture.volumes.filter((item) => item.boolean_mode === 'union').length, candidate.sketches.massing.length);
  assert.ok(candidate.architecture.volumes.every((item) => Array.isArray(item.scale) && item.placement));
  assert.ok(candidate.architecture.volumes.every((item) => item.tags.includes('stage7-concept:concept-courtyard')));
  assert.ok(candidate.architecture.volumes.every((item) => !Object.hasOwn(item, 'x') && !Object.hasOwn(item, 'y') && !Object.hasOwn(item, 'z')));
  assert.ok(candidate.buildSpec.width <= fixture.buildSpec.width);
  assert.ok(candidate.buildSpec.depth <= fixture.buildSpec.depth);
  for (const field of ['floors', 'floor_height', 'roof_height', 'total_height']) assert.ok(candidate.buildSpec[field] <= fixture.buildSpec[field]);
  assert.ok(candidate.buildSpec.lot.width <= fixture.buildSpec.lot.width);
  assert.ok(candidate.buildSpec.lot.depth <= fixture.buildSpec.lot.depth);
  assert.equal(candidate.buildSpec.lot.side_setback, fixture.buildSpec.lot.side_setback);
  assert.equal(candidate.buildSpec.lot.front_setback, fixture.buildSpec.lot.front_setback);
  assert.equal(candidate.buildSpec.lot.rear_setback, fixture.buildSpec.lot.rear_setback);
  assert.equal(candidate.buildSpec.door_side, fixture.buildSpec.door_side);
  assert.deepEqual(candidate.topology.nodes.map((item) => item.id), fixture.topology.nodes.map((item) => item.id));
  assert.ok(candidate.topology.bsp_hints.stage7_space_zones.length > 0);
  assert.ok(candidate.topology.bsp_hints.stage7_space_zone_edges.length > 0);
  assert.ok(candidate.topology.bsp_hints.stage7_stair_hints.length > 0);
  assert.ok(candidate.topology.bsp_hints.stage7_entrance_hints.length > 0);
  assert.equal(candidate.topology.bsp_hints.stage7_entrance_hints.length, repaired.plan.summary.validated_entrance_cells.length);
  assert.equal(Object.hasOwn(candidate, 'grid'), false);
  assert.equal(Object.hasOwn(candidate, 'operations'), false);
  assert.equal(Object.hasOwn(candidate, 'plan'), false);
  assert.equal(Object.hasOwn(candidate.plan_provenance, 'runs'), false);
  assert.deepEqual(fixture.architecture, originalArchitecture);
  assert.deepEqual(fixture.buildSpec, originalBuildSpec);
  assert.deepEqual(fixture.topology, originalTopology);

  const noisyPlan = structuredClone(repaired.plan);
  const noisyCells = decodeStage7Runs(noisyPlan.runs);
  let internalOpenings = 0;
  for (const cell of noisyCells) {
    if (cell.envelope !== 'none' || cell.space !== 'public' || internalOpenings >= 20) continue;
    cell.envelope = 'opening';
    internalOpenings += 1;
  }
  noisyPlan.runs = encodeStage7Cells(noisyCells);
  const noisyCandidate = convertSemanticVoxelPlanToProceduralPlan({
    plan: noisyPlan,
    condition: fixture.condition,
    architecture: fixture.architecture,
    buildSpec: fixture.buildSpec,
    topology: fixture.topology,
    prompt: fixture.prompt
  });
  assert.equal(internalOpenings, 20);
  assert.equal(noisyCandidate.topology.bsp_hints.stage7_entrance_hints.length, repaired.plan.summary.validated_entrance_cells.length);
});

test('Stage 7 converter is deterministic and rejects plans with unresolved blockers', () => {
  const fixture = conversionFixture();
  const repaired = repairedFixture(fixture.condition);
  const input = {
    plan: repaired.plan,
    condition: fixture.condition,
    architecture: fixture.architecture,
    buildSpec: fixture.buildSpec,
    topology: fixture.topology,
    prompt: fixture.prompt
  };
  assert.deepEqual(
    convertSemanticVoxelPlanToProceduralPlan(input),
    convertSemanticVoxelPlanToProceduralPlan(input)
  );

  const blocked = structuredClone(repaired.plan);
  blocked.conflicts = [{ id: 'missing-entrance', severity: 'blocker', message: 'missing entrance' }];
  assert.throws(
    () => convertSemanticVoxelPlanToProceduralPlan({ ...input, plan: blocked }),
    /unresolved Stage 7 blockers: missing-entrance/
  );
});

test('Stage 7 converter rejects unsafe inputs and unresolved entrance keys', () => {
  const fixture = conversionFixture();
  const repaired = repairedFixture(fixture.condition);
  const input = { plan: repaired.plan, condition: fixture.condition, architecture: fixture.architecture, buildSpec: fixture.buildSpec, topology: fixture.topology, prompt: fixture.prompt };
  const candidate = convertSemanticVoxelPlanToProceduralPlan(input);
  assert.ok(candidate.topology.bsp_hints.stage7_entrance_hints.every((hint) => !Object.hasOwn(hint, 'grid') && !Object.hasOwn(hint, 'x')));
  assert.throws(() => convertSemanticVoxelPlanToProceduralPlan({ ...input, condition: { ...fixture.condition, condition_hash: 'wrong' } }), /invalid Stage 7 plan/);
  assert.throws(() => convertSemanticVoxelPlanToProceduralPlan({ ...input, plan: { ...repaired.plan, accepted: false } }), /invalid Stage 7 plan/);
  assert.throws(() => convertSemanticVoxelPlanToProceduralPlan({ ...input, plan: { ...repaired.plan, runs: 'bad' } }), /invalid Stage 7 plan/);
  assert.throws(() => convertSemanticVoxelPlanToProceduralPlan({ ...input, plan: { ...repaired.plan, summary: { ...repaired.plan.summary, validated_entrance_cells: ['999,999,999'] } } }), /unresolved validated entrance key/);
});

function repairedFixture(condition) {
  const result = repairCoarseSemanticVoxelPlan({
    plan: generateDeterministicCoarseSemanticVoxelPlan({ condition }),
    condition
  });
  assert.equal(result.accepted, true, result.blockers.map((item) => item.message).join('; '));
  return result;
}

function conversionFixture() {
  const prompt = '湖边带庭院的两层日式住宅';
  const architecture = {
    source: 'fallback',
    style: '日式',
    style_family: 'japanese',
    typology: 'house',
    philosophy: 'semantic fixture',
    footprint: 'courtyard',
    materials: { wall: 'minecraft:stripped_birch_wood', floor: 'minecraft:bamboo_planks' },
    volumes: [{ id: 'main', role: '主体', shape: 'box', scale: [1, 1, 1], placement: { relation: 'center' }, boolean_mode: 'union', tags: ['primary-mass'] }],
    envelope_rules: { hollow_shell: true },
    facade_rules: { front_side: 'south' },
    roof_rules: { style: 'hipped' },
    site_rules: { water_feature: true, enclosed_courtyard: true },
    massing_rules: { creative_variant: 'courtyard' },
    structural_rules: {},
    detail_rules: {},
    generation_hints: {}
  };
  const buildSpec = {
    width: 31,
    depth: 27,
    floors: 2,
    floor_height: 5,
    total_height: 14,
    wall_height: 10,
    roof_height: 4,
    door_side: 'south',
    footprint: 'courtyard',
    lot: { width: 37, depth: 40, side_setback: 3, front_setback: 4, rear_setback: 3 },
    constraints: { max_total_height: 40, minecraft_fill_limit: 32768 }
  };
  const topology = {
    source: 'fallback',
    nodes: [
      { id: 'entry', label: '入口', type: 'entry', floor: 0, weight: 0.8, privacy: 'public', zone: 'public', tags: [] },
      { id: 'living', label: '起居', type: 'living', floor: 0, weight: 1.5, privacy: 'public', zone: 'public', tags: [] },
      { id: 'bedroom', label: '卧室', type: 'bedroom', floor: 1, weight: 1.2, privacy: 'private', zone: 'private', tags: [] },
      { id: 'stairs', label: '楼梯', type: 'stairs', floor: 0, weight: 0.8, privacy: 'circulation', zone: 'circulation', tags: [] }
    ],
    edges: [
      { from: 'entry', to: 'living', relation: 'connected' },
      { from: 'living', to: 'stairs', relation: 'connected' },
      { from: 'stairs', to: 'bedroom', relation: 'vertical' }
    ],
    floor_program: [],
    zoning: { public: ['entry', 'living'], private: ['bedroom'], service: [], circulation: ['stairs'], outdoor: [] },
    circulation_rules: { entry_node: 'entry', connect_all_rooms: true },
    facade_alignment: {},
    site_connections: [],
    bsp_hints: { split_strategy: 'weighted' }
  };
  const condition = buildStage7Condition({
    prompt,
    seed: 7101,
    architecture,
    buildSpec,
    topology,
    creativeDesign: {
      design_axes: { massing_variant: 'courtyard', split_strategy: 'weighted' },
      topology: { public_core_position: 'center' },
      site: { water_feature: true }
    },
    conceptStudio: {
      selected_concept_id: 'concept-courtyard',
      selectedConcept: { id: 'concept-courtyard', massing_plan: { variant_hint: 'courtyard' }, quality_targets: ['clear-entry'] }
    },
    templateKnowledge: { retrieval_explanation: { references: [] } }
  });
  return { prompt, architecture, buildSpec, topology, condition };
}
