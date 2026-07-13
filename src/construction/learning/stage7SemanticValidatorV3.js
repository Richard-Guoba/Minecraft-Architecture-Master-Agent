import { decodeStage7Runs } from './coarseSemanticVoxelSchema.js';

export const STAGE7_V3_REPAIR_BUDGETS = Object.freeze({
  'merge-adjacent-runs': 262144,
  'isolated-component': 8,
  'one-cell-envelope-gap': 1,
  'circulation-envelope-conflict': 8
});

export function validateStage7SemanticTopologyV3({
  cells = [],
  topology = {},
  requiredFloors = 1
} = {}) {
  const blockers = [];
  requireValue(
    topology.massing_component_count > 0,
    'missing-primary-envelope',
    'primary envelope is missing'
  );
  requireValue(
    topology.massing_component_count <= 16,
    'too-many-massing-components',
    'massing component count exceeds 16'
  );
  requireValue(
    cells.some((cell) => ['public', 'private', 'service'].includes(cell.space)),
    'missing-usable-space',
    'usable interior space is missing'
  );
  requireValue(
    (topology.entrance_keys || []).length > 0,
    'missing-entrance',
    'exterior-connected entrance is missing'
  );
  requireValue(
    (topology.circulation_keys || []).length > 0,
    'missing-circulation',
    'entrance-connected circulation is missing'
  );
  requireValue(
    cells.some((cell) => cell.envelope === 'roof'),
    'missing-roof',
    'roof coverage is missing'
  );
  requireValue(
    (topology.floor_levels || []).length >= requiredFloors,
    'missing-floor-continuity',
    'accepted floor levels are incomplete'
  );
  requireValue(
    requiredFloors <= 1 || (topology.vertical_core_keys || []).length > 0,
    'missing-vertical-circulation',
    'connected vertical core is missing'
  );
  requireValue(
    (topology.roof_vertical_overlap || 0) === 0,
    'roof-vertical-overlap',
    'roof cells cannot be vertical circulation'
  );
  return {
    accepted: blockers.length === 0,
    blockers,
    metrics: { ...topology, cell_count: cells.length }
  };

  function requireValue(ok, id, message) {
    if (!ok) blockers.push({ id, severity: 'blocker', message });
  }
}

export function enforceStage7V3RepairPolicy({ beforeCells = [], repairResult = {} } = {}) {
  const blockers = [...(repairResult.blockers || [])];
  const counts = {};
  for (const repair of repairResult.repairs || []) {
    counts[repair.reason] = (counts[repair.reason] || 0) + (repair.cells?.length || 0);
  }
  for (const [reason, count] of Object.entries(counts)) {
    const budget = STAGE7_V3_REPAIR_BUDGETS[reason];
    if (budget === undefined || count > budget) {
      blockers.push({
        id: 'v3-repair-policy-exceeded',
        severity: 'blocker',
        message: `${reason} changed ${count} cells; budget ${budget ?? 0}`
      });
    }
  }
  const afterCells = repairResult.decodedCells
    || decodeStage7Runs(repairResult.plan?.runs || []);
  const repairAudit = diffCells(beforeCells, afterCells, repairResult.repairs || []);
  return {
    accepted: Boolean(repairResult.accepted) && blockers.length === 0,
    blockers,
    repair_audit: repairAudit,
    plan: repairResult.plan
  };
}

function diffCells(beforeCells, afterCells, repairs) {
  const empty = { envelope: 'none', space: 'outside', site: 'none' };
  const before = new Map(beforeCells.map((cell) => [keyOf(cell), cell]));
  const after = new Map(afterCells.map((cell) => [keyOf(cell), cell]));
  const reasonByKey = new Map();
  for (const repair of repairs) {
    for (const key of repair.cells || []) {
      if (!reasonByKey.has(key)) reasonByKey.set(key, repair.reason);
    }
  }
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  return keys
    .filter((key) => semanticJson(before.get(key) || empty) !== semanticJson(after.get(key) || empty))
    .map((key) => ({
      coordinate: key.split(',').map(Number),
      before: semantic(before.get(key) || empty),
      after: semantic(after.get(key) || empty),
      reason: reasonByKey.get(key) || 'canonical-run-normalization'
    }));
}

function semantic(cell) {
  return {
    envelope: cell.envelope || 'none',
    space: cell.space || 'outside',
    site: cell.site || 'none'
  };
}

function semanticJson(cell) {
  return JSON.stringify(semantic(cell));
}

function keyOf(cell) {
  return `${cell.x},${cell.y},${cell.z}`;
}
