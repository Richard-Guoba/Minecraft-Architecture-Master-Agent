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

test('site-only reference hints support site semantics without changing envelope massing', () => {
  const fixture = fixtureCondition(7101, 2);
  const base = canonicalCondition(fixture, (payload) => {
    payload.design.footprint = 'rectangle';
    payload.design.massing_strategy = [];
    payload.design.abstract_site_tags = [];
    payload.references = [];
  });
  const siteOnly = canonicalCondition(base, (payload) => {
    const reference = structuredClone(fixture.references[0]);
    reference.case_id = 'site-only-courtyard';
    reference.title = 'Site-only Courtyard';
    reference.used_for = ['site'];
    reference.hints = [{ area: 'site', claim: 'courtyard stepped terrace', confidence: 0.9 }];
    payload.references = [reference];
  });
  const baseCells = decodeStage7Runs(generateDeterministicCoarseSemanticVoxelPlan({ condition: base }).runs);
  const siteCells = decodeStage7Runs(generateDeterministicCoarseSemanticVoxelPlan({ condition: siteOnly }).runs);
  const envelopeSignature = (cells) => cells
    .filter((cell) => cell.envelope !== 'none')
    .map(({ x, y, z, envelope }) => ({ x, y, z, envelope }));

  assert.ok(siteCells.some((cell) => cell.site === 'courtyard'));
  assert.equal(hashCanonicalValue(envelopeSignature(siteCells)), hashCanonicalValue(envelopeSignature(baseCells)));
});

test('mixed semantic cells only retain references approved for every active layer', () => {
  const condition = fixtureCondition(7101, 1);
  const cells = decodeStage7Runs(generateDeterministicCoarseSemanticVoxelPlan({ condition }).runs);
  const entranceCells = cells.filter((cell) => cell.envelope === 'opening' && cell.space === 'circulation');
  const conditionId = `condition:${condition.condition_hash}`;

  assert.ok(entranceCells.length > 0);
  for (const cell of entranceCells) assert.deepEqual(cell.evidence_ids, [conditionId]);
});

test('five-floor stepped courtyard baseline keeps a connected vertical core on every floor plate', () => {
  const condition = canonicalCondition(fixtureCondition(7101, 5), (payload) => {
    payload.dimensions.width = 24;
    payload.dimensions.depth = 24;
    payload.dimensions.lot_width = 64;
    payload.dimensions.lot_depth = 64;
    payload.design.footprint = 'courtyard';
    payload.design.massing_strategy = ['stepped-terrace'];
  });
  const plan = generateDeterministicCoarseSemanticVoxelPlan({ condition });
  const cells = decodeStage7Runs(plan.runs);
  const floorLevels = [...new Set(cells.filter((cell) => cell.envelope === 'floor').map((cell) => cell.y))].sort((left, right) => left - right);
  const verticalCells = cells.filter((cell) => cell.space === 'vertical_circulation');
  const verticalByColumn = new Map();
  for (const cell of verticalCells) {
    const key = `${cell.x},${cell.z}`;
    verticalByColumn.set(key, [...(verticalByColumn.get(key) || []), cell]);
  }
  const connectedColumn = [...verticalByColumn.values()].some((column) => {
    const levels = new Set(column.map((cell) => cell.y));
    return [...levels].every((level) => levels.has(level + 1) || level === Math.max(...levels));
  });
  const intersectedFloorLevels = floorLevels.filter((level) => verticalCells.some((cell) => cell.y === level && cell.envelope === 'floor'));

  assert.equal(validateStage7Plan(plan, { conditionHash: condition.condition_hash }).ok, true);
  assert.equal(floorLevels.length, 5);
  assert.equal(connectedColumn, true);
  assert.deepEqual(intersectedFloorLevels, floorLevels);
});

test('one-floor zoning applies every supported directional public strategy', async (t) => {
  const cases = [
    { strategy: 'public-west', axis: 'x', direction: -1 },
    { strategy: 'public-east', axis: 'x', direction: 1 },
    { strategy: 'public-north', axis: 'z', direction: -1 }
  ];

  for (const item of cases) {
    await t.test(item.strategy, () => {
      const condition = canonicalCondition(fixtureCondition(7102, 1), (payload) => {
        payload.design.space_strategy = [item.strategy];
      });
      const cells = decodeStage7Runs(generateDeterministicCoarseSemanticVoxelPlan({ condition }).runs);
      const floorCells = cells.filter((cell) => cell.envelope === 'floor');
      const publicCells = cells.filter((cell) => cell.space === 'public');
      const coordinates = floorCells.map((cell) => cell[item.axis]);
      const center = (Math.min(...coordinates) + Math.max(...coordinates)) / 2;
      const average = publicCells.reduce((sum, cell) => sum + cell[item.axis], 0) / publicCells.length;

      assert.ok(publicCells.length > 0, `missing public cells for ${item.strategy}`);
      assert.ok(item.direction < 0 ? average < center : average > center, `${item.strategy} public centroid is on the wrong side`);
    });
  }
});

function canonicalCondition(condition, mutate) {
  const payload = structuredClone(condition);
  delete payload.condition_hash;
  mutate(payload);
  return { ...payload, condition_hash: hashCanonicalValue(payload) };
}

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
