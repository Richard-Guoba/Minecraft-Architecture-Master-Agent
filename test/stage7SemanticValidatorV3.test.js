import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateStage7SemanticTopologyV3,
  enforceStage7V3RepairPolicy
} from '../src/construction/learning/stage7SemanticValidatorV3.js';

const cell = (x, y, z, values = {}) => ({
  x,
  y,
  z,
  envelope: values.envelope || 'none',
  space: values.space || 'outside',
  site: values.site || 'none',
  confidence: 1,
  evidence_ids: ['fixture:v3']
});

test('v3 validator accepts complete one-floor topology and rejects missing entrance', () => {
  const cells = [
    cell(1, 1, 1, { envelope: 'floor' }),
    cell(1, 2, 1, { space: 'circulation' }),
    cell(2, 2, 1, { space: 'public' }),
    cell(1, 3, 1, { envelope: 'roof' }),
    cell(0, 2, 1, { envelope: 'opening', space: 'circulation' })
  ];
  const topology = {
    massing_component_count: 1,
    primary_component_size: 3,
    entrance_keys: ['0,2,1'],
    circulation_keys: ['1,2,1'],
    vertical_core_keys: [],
    floor_levels: [1],
    roof_vertical_overlap: 0
  };
  assert.equal(validateStage7SemanticTopologyV3({
    cells,
    topology,
    requiredFloors: 1
  }).accepted, true);
  const rejected = validateStage7SemanticTopologyV3({
    cells,
    topology: { ...topology, entrance_keys: [] },
    requiredFloors: 1
  });
  assert.ok(rejected.blockers.some((item) => item.id === 'missing-entrance'));
});

test('v3 validator requires one connected vertical core for multiple floors', () => {
  const result = validateStage7SemanticTopologyV3({
    cells: [
      cell(1, 1, 1, { envelope: 'floor' }),
      cell(1, 8, 1, { envelope: 'floor' }),
      cell(1, 9, 1, { envelope: 'roof' }),
      cell(0, 2, 1, { envelope: 'opening', space: 'circulation' }),
      cell(1, 2, 1, { space: 'circulation' })
    ],
    topology: {
      massing_component_count: 1,
      primary_component_size: 4,
      entrance_keys: ['0,2,1'],
      circulation_keys: ['1,2,1'],
      vertical_core_keys: [],
      floor_levels: [1, 8],
      roof_vertical_overlap: 0
    },
    requiredFloors: 2
  });
  assert.ok(result.blockers.some((item) => item.id === 'missing-vertical-circulation'));

  const discontinuous = validateStage7SemanticTopologyV3({
    cells: [
      cell(1, 1, 1, { envelope: 'floor' }),
      cell(1, 9, 1, { envelope: 'roof' }),
      cell(0, 2, 1, { envelope: 'opening', space: 'circulation' }),
      cell(1, 2, 1, { space: 'circulation' }),
      cell(2, 2, 1, { space: 'public' })
    ],
    topology: {
      massing_component_count: 1,
      primary_component_size: 4,
      entrance_keys: ['0,2,1'],
      circulation_keys: ['1,2,1'],
      vertical_core_keys: ['1,2,1'],
      floor_levels: [1],
      roof_vertical_overlap: 0
    },
    requiredFloors: 2
  });
  assert.ok(discontinuous.blockers.some((item) => item.id === 'missing-floor-continuity'));
});

test('v3 repair policy rejects invented roof caps and audits permitted cell changes', () => {
  const before = [cell(1, 1, 1, { envelope: 'wall' })];
  const invented = {
    accepted: true,
    plan: { runs: [] },
    repairs: [{ reason: 'missing-roof-cap', cells: ['1,2,1'] }],
    decodedCells: [...before, cell(1, 2, 1, { envelope: 'roof' })]
  };
  const rejected = enforceStage7V3RepairPolicy({ beforeCells: before, repairResult: invented });
  assert.equal(rejected.accepted, false);
  assert.ok(rejected.blockers.some((item) => item.id === 'v3-repair-policy-exceeded'));

  const permitted = {
    accepted: true,
    plan: { runs: [] },
    repairs: [{ reason: 'one-cell-envelope-gap', cells: ['2,1,1'] }],
    decodedCells: [...before, cell(2, 1, 1, { envelope: 'wall' })]
  };
  const accepted = enforceStage7V3RepairPolicy({ beforeCells: before, repairResult: permitted });
  assert.equal(accepted.accepted, true);
  assert.deepEqual(accepted.repair_audit[0], {
    coordinate: [2, 1, 1],
    before: { envelope: 'none', space: 'outside', site: 'none' },
    after: { envelope: 'wall', space: 'outside', site: 'none' },
    reason: 'one-cell-envelope-gap'
  });
});

test('v3 repair policy rejects changes above the configured cell budget', () => {
  const before = [cell(1, 1, 1, { envelope: 'wall' })];
  const overBudget = {
    accepted: true,
    plan: { runs: [] },
    repairs: [{ reason: 'one-cell-envelope-gap', cells: ['2,1,1', '3,1,1'] }],
    decodedCells: [
      ...before,
      cell(2, 1, 1, { envelope: 'wall' }),
      cell(3, 1, 1, { envelope: 'wall' })
    ]
  };
  const result = enforceStage7V3RepairPolicy({ beforeCells: before, repairResult: overBudget });
  assert.equal(result.accepted, false);
  assert.ok(result.blockers.some((item) => (
    item.id === 'v3-repair-policy-exceeded' && /budget 1/.test(item.message)
  )));
});
