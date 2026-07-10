import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStage7Plan,
  decodeStage7Runs,
  hashCanonicalValue
} from '../src/construction/learning/coarseSemanticVoxelSchema.js';
import { repairCoarseSemanticVoxelPlan } from '../src/construction/learning/coarseSemanticVoxelRepair.js';

test('Stage 7 repair removes noise, closes a one-cell wall gap, adds a roof, and clears circulation collisions', () => {
  const condition = conditionFixture(2);
  const plan = planFixture(condition, { includeRoof: false, includeEntrance: true, includeVertical: true, includeNoise: true, includeGap: true, includeCollision: true });
  const result = repairCoarseSemanticVoxelPlan({ plan, condition });
  const cells = decodeStage7Runs(result.plan.runs);

  assert.equal(result.accepted, true, result.blockers.map((item) => item.message).join('; '));
  for (const reason of ['isolated-component', 'one-cell-envelope-gap', 'missing-roof-cap', 'circulation-envelope-conflict']) {
    assert.ok(result.repairs.some((item) => item.reason === reason), `missing repair ${reason}`);
  }
  for (const item of result.repairs) {
    assert.ok(Array.isArray(item.evidence_ids));
    assert.ok(Number.isInteger(item.before_cell_count));
    assert.ok(Number.isInteger(item.after_cell_count));
  }
  assert.equal(cells.some((cell) => cell.x === 60 && cell.y === 60 && cell.z === 60 && cell.envelope === 'wall'), false);
  assert.ok(cells.some((cell) => cell.x === 6 && cell.y === 3 && cell.z === 4 && cell.envelope === 'wall'));
  assert.ok(cells.some((cell) => cell.envelope === 'roof'));
  assert.ok(cells.some((cell) => cell.x === 5 && cell.y === 3 && cell.z === 5 && cell.envelope === 'opening'));

  const roofCondition = conditionFixture(1);
  const roofBase = planFixture(roofCondition, { includeRoof: false, includeEntrance: true });
  const roofCells = decodeStage7Runs(roofBase.runs);
  roofCells.push(cell(6, 8, 6, { envelope: 'opening', space: 'public' }));
  const occupiedRoofTarget = createStage7Plan({
    condition: roofCondition,
    provider: roofBase.provider,
    cells: mergeFixtureCells(roofCells),
    evidence: roofBase.evidence
  });
  const occupiedResult = repairCoarseSemanticVoxelPlan({ plan: occupiedRoofTarget, condition: roofCondition });
  const occupiedCells = decodeStage7Runs(occupiedResult.plan.runs);
  assert.ok(occupiedCells.some((cell) => cell.x === 6 && cell.y === 8 && cell.z === 6 && cell.envelope === 'opening'));
});

test('Stage 7 repair rejects hard schema blockers without mutating the plan', () => {
  const condition = conditionFixture(1);
  const plan = planFixture(condition, { includeRoof: true, includeEntrance: true });
  plan.condition_hash = 'wrong';
  plan.runs[0].x1 = 64;

  const result = repairCoarseSemanticVoxelPlan({ plan, condition });
  assert.equal(result.accepted, false);
  assert.equal(result.plan, undefined);
  assert.ok(result.blockers.some((item) => item.id === 'hard-schema'));
  assert.ok(result.validation.errors.includes('condition hash mismatch'));
  assert.ok(result.validation.errors.includes('run coordinates must be integers inside 0..63'));

  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  let revokedResult;
  assert.doesNotThrow(() => {
    revokedResult = repairCoarseSemanticVoxelPlan(proxy);
  });
  assert.equal(revokedResult.accepted, false);
  assert.ok(revokedResult.blockers.some((item) => item.id === 'hard-schema'));

  const tamperedCondition = structuredClone(condition);
  tamperedCondition.prompt = 'tampered after hashing';
  const conditionResult = repairCoarseSemanticVoxelPlan({
    plan: planFixture(condition, { includeRoof: true, includeEntrance: true }),
    condition: tamperedCondition
  });
  assert.equal(conditionResult.accepted, false);
  assert.ok(conditionResult.blockers.some((item) => item.id === 'hard-schema'));
  assert.ok(conditionResult.validation.errors.includes('condition hash mismatch'));
});

test('Stage 7 repair reports missing entrance, circulation, and vertical core instead of inventing them', () => {
  const condition = conditionFixture(2);
  const plan = planFixture(condition, { includeRoof: true, includeEntrance: false, includeVertical: false });
  const result = repairCoarseSemanticVoxelPlan({ plan, condition });

  assert.equal(result.accepted, false);
  assert.ok(result.blockers.some((item) => item.id === 'missing-entrance'));
  assert.ok(result.blockers.some((item) => item.id === 'missing-circulation'));
  assert.ok(result.blockers.some((item) => item.id === 'missing-vertical-circulation'));
  assert.equal(result.repairs.some((item) => /entrance|vertical/.test(item.reason)), false);
});

test('Stage 7 repair is deterministic for the same plan and condition', () => {
  const condition = conditionFixture(1);
  const plan = planFixture(condition, { includeRoof: false, includeEntrance: true, includeGap: true });
  const splitIndex = plan.runs.findIndex((run) => run.x1 > run.x0);
  const split = plan.runs[splitIndex];
  plan.runs.splice(splitIndex, 1,
    { ...split, x1: split.x0 },
    { ...split, x0: split.x0 + 1 }
  );
  const first = repairCoarseSemanticVoxelPlan({ plan, condition });
  const second = repairCoarseSemanticVoxelPlan({ plan, condition });
  assert.ok(first.repairs.some((item) => item.reason === 'merge-adjacent-runs'));
  assert.deepEqual(first, second);
});

test('detached components cannot donate entrance or vertical-core semantics to the primary envelope', () => {
  const condition = conditionFixture(2);
  const base = planFixture(condition, { includeRoof: true, includeEntrance: false, includeVertical: false });
  const cells = decodeStage7Runs(base.runs);
  for (let y = 2; y <= 12; y += 1) cells.push(cell(45, y, 45, { envelope: 'support', space: 'vertical_circulation' }));
  cells.push(cell(45, 3, 46, { envelope: 'opening', space: 'circulation' }));
  const spoofed = createStage7Plan({ condition, provider: base.provider, cells: mergeFixtureCells(cells), evidence: base.evidence });

  const result = repairCoarseSemanticVoxelPlan({ plan: spoofed, condition });
  assert.equal(result.accepted, false);
  assert.ok(result.blockers.some((item) => item.id === 'missing-entrance'));
  assert.ok(result.blockers.some((item) => item.id === 'missing-vertical-circulation'));

  const insideBase = planFixture(condition, { includeRoof: true, includeEntrance: true, includeVertical: false });
  const insideCells = decodeStage7Runs(insideBase.runs);
  insideCells.push(cell(7, 4, 7, { envelope: 'wall', space: 'vertical_circulation' }));
  const insideSpoofed = createStage7Plan({ condition, provider: insideBase.provider, cells: mergeFixtureCells(insideCells), evidence: insideBase.evidence });
  const insideResult = repairCoarseSemanticVoxelPlan({ plan: insideSpoofed, condition });
  assert.ok(insideResult.repairs.some((item) => item.reason === 'isolated-component'));
  assert.ok(insideResult.blockers.some((item) => item.id === 'missing-vertical-circulation'));
});

test('repair handles ten thousand valid isolated cells with a bounded component scan', () => {
  const condition = conditionFixture(1);
  const cells = [];
  collect: for (let y = 0; y < 64; y += 2) {
    for (let z = 0; z < 64; z += 2) {
      for (let x = 0; x < 64; x += 2) {
        cells.push(cell(x, y, z, { envelope: 'wall' }));
        if (cells.length === 10000) break collect;
      }
    }
  }
  const plan = createStage7Plan({
    condition,
    provider: { kind: 'artifact', name: 'large-component-fixture' },
    cells,
    evidence: [{ id: 'condition:repair', kind: 'condition', source_id: condition.condition_hash }]
  });
  const result = repairCoarseSemanticVoxelPlan({ plan, condition });
  assert.equal(result.accepted, false);
  assert.equal(result.repairs.filter((item) => item.reason === 'isolated-component').length, 9999);
});

test('repair rejects more massing components than the bounded converter contract can represent', () => {
  const condition = conditionFixture(1);
  const base = planFixture(condition, { includeRoof: true, includeEntrance: true });
  const cells = decodeStage7Runs(base.runs);
  for (let index = 0; index < 16; index += 1) {
    const x0 = 20 + (index % 4) * 10;
    const z0 = 20 + Math.floor(index / 4) * 10;
    for (let x = x0; x < x0 + 3; x += 1) {
      for (let z = z0; z < z0 + 3; z += 1) cells.push(cell(x, 2, z, { envelope: 'wall' }));
    }
  }
  const plan = createStage7Plan({ condition, provider: base.provider, cells: mergeFixtureCells(cells), evidence: base.evidence });
  const result = repairCoarseSemanticVoxelPlan({ plan, condition });
  assert.equal(result.accepted, false);
  assert.ok(result.blockers.some((item) => item.id === 'too-many-massing-components'));
});

function conditionFixture(floors) {
  const payload = {
    source: 'stage7-coarse-semantic-voxel-condition-v1',
    schema_version: 1,
    prompt: 'repair fixture',
    seed: 7,
    dimensions: { width: 20, depth: 18, floors, floor_height: 5, total_height: floors * 5 + 4, lot_width: 26, lot_depth: 28 },
    design: { front_side: 'south' },
    references: [],
    constraints: { resolution: [64, 64, 64], max_total_height: 40, minecraft_fill_limit: 32768 }
  };
  return { ...payload, condition_hash: hashCanonicalValue(payload) };
}

function planFixture(condition, options = {}) {
  const cells = [];
  const evidence = [{ id: 'condition:repair', kind: 'condition', source_id: condition.condition_hash }];
  for (let x = 4; x <= 10; x += 1) {
    cells.push(cell(x, 2, 4, { envelope: 'floor' }));
    cells.push(cell(x, 7, 4, { envelope: 'floor' }));
    if (!(options.includeGap && x === 6)) cells.push(cell(x, 3, 4, { envelope: 'wall' }));
    cells.push(cell(x, 3, 10, { envelope: 'wall' }));
  }
  for (let y = 3; y <= 7; y += 1) cells.push(cell(4, y, 4, { envelope: 'support' }));
  for (let x = 4; x <= 10; x += 1) {
    for (let z = 5; z <= 10; z += 1) {
      cells.push(cell(x, 2, z, { envelope: 'floor' }));
      cells.push(cell(x, 7, z, { envelope: 'floor' }));
    }
  }
  for (let z = 5; z <= 9; z += 1) {
    cells.push(cell(4, 3, z, { envelope: 'wall' }));
    cells.push(cell(10, 3, z, { envelope: 'wall' }));
  }
  for (let x = 5; x <= 9; x += 1) {
    for (let z = 5; z <= 9; z += 1) cells.push(cell(x, 3, z, { space: x <= 6 ? 'public' : 'private' }));
  }
  if (options.includeEntrance) cells.push(cell(7, 3, 10, { envelope: 'opening', space: 'circulation' }));
  if (options.includeVertical) {
    // Anchor the fixture core to both floor layers so the upper floor is not
    // mistaken for removable isolated noise before collision clearing runs.
    for (let y = 3; y <= 7; y += 1) cells.push(cell(7, y, 4, { envelope: 'support', space: 'vertical_circulation' }));
  }
  if (options.includeCollision) cells.push(cell(5, 3, 5, { envelope: 'wall', space: 'circulation' }));
  if (options.includeRoof) cells.push(cell(7, 8, 7, { envelope: 'roof' }));
  if (options.includeNoise) cells.push(cell(60, 60, 60, { envelope: 'wall' }));
  return createStage7Plan({
    condition,
    provider: { kind: 'artifact', name: 'repair-fixture' },
    cells: mergeFixtureCells(cells),
    evidence
  });
}

function mergeFixtureCells(cells) {
  const merged = new Map();
  for (const item of cells) {
    const key = `${item.x},${item.y},${item.z}`;
    const current = merged.get(key) || cell(item.x, item.y, item.z);
    merged.set(key, { ...current, ...item, evidence_ids: ['condition:repair'] });
  }
  return [...merged.values()];
}

function cell(x, y, z, values = {}) {
  return {
    x,
    y,
    z,
    envelope: values.envelope || 'none',
    space: values.space || 'outside',
    site: values.site || 'none',
    confidence: 1,
    evidence_ids: ['condition:repair']
  };
}
