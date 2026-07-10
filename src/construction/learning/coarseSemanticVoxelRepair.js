import {
  canonicalStringify,
  decodeStage7Runs,
  encodeStage7Cells,
  validateStage7Condition,
  validateStage7Plan
} from './coarseSemanticVoxelSchema.js';

export const STAGE7_REPAIR_SOURCE = 'stage7-coarse-semantic-voxel-repair-v1';
export const MAX_STAGE7_MASSING_COMPONENTS = 16;

const SOLID_ENVELOPE = new Set(['wall', 'floor', 'roof', 'support']);
const USABLE_SPACE = new Set(['public', 'private', 'service', 'circulation', 'vertical_circulation']);
const NEIGHBORS_6 = Object.freeze([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]);

export function repairCoarseSemanticVoxelPlan(input = {}) {
  const snapshot = snapshotRepairInput(input);
  if (!snapshot.ok) return rejectedPlan(snapshot.validation, 0);

  const { plan, condition } = snapshot;
  const conditionValidation = validateStage7Condition(condition);
  if (!conditionValidation.ok) {
    return rejectedPlan({
      ...conditionValidation,
      warnings: [],
      stats: { run_count: safeRunCount(plan), cell_count: 0, evidence_count: 0 }
    }, safeRunCount(plan));
  }
  const validation = validateStage7Plan(plan, { condition });
  if (!validation.ok) return rejectedPlan(validation, safeRunCount(plan));

  const decoded = decodeStage7Runs(plan.runs);
  const originalOpeningKeys = new Set(decoded.filter((cell) => cell.envelope === 'opening').map(keyOf));
  const cells = new Map(decoded.map((cell) => [keyOf(cell), { ...cell, evidence_ids: [...cell.evidence_ids] }]));
  const repairs = [];
  const canonicalInputRuns = encodeStage7Cells(decoded);
  if (canonicalStringify(canonicalInputRuns) !== canonicalStringify(plan.runs)) {
    const reason = canonicalInputRuns.length < plan.runs.length ? 'merge-adjacent-runs' : 'canonicalize-run-tuples';
    repairs.push(repair(reason, [], evidenceOf(decoded), decoded.length, decoded.length, {
      input_run_count: plan.runs.length,
      output_run_count: canonicalInputRuns.length
    }));
  }
  removeIsolatedComponents(cells, repairs);
  closeOneCellWallGaps(cells, repairs);
  clearCirculationEnvelopeConflicts(cells, repairs);
  addMissingRoofCap(cells, repairs, plan);

  const outputCells = [...cells.values()].filter(hasSemanticValue).sort(compareCells);
  const semantic = semanticConflicts(outputCells, condition, originalOpeningKeys);
  const repairedPlan = {
    ...plan,
    runs: encodeStage7Cells(outputCells),
    summary: { ...summarize(outputCells), validated_entrance_cells: semantic.entranceKeys },
    conflicts: semantic.conflicts,
    repairs,
    warnings: [...new Set([...(plan.warnings || []), ...semantic.warnings])]
  };
  const outputValidation = validateStage7Plan(repairedPlan, { condition, allowDerived: true });
  const blockers = [...semantic.blockers];
  if (!outputValidation.ok) blockers.push(conflict('post-repair-schema', 'blocker', outputValidation.errors.join('; ')));

  return {
    source: STAGE7_REPAIR_SOURCE,
    active: true,
    accepted: blockers.length === 0,
    plan: repairedPlan,
    validation: outputValidation,
    conflicts: semantic.conflicts,
    repairs,
    blockers,
    warnings: repairedPlan.warnings,
    summary: {
      input_run_count: plan.runs.length,
      output_run_count: repairedPlan.runs.length,
      input_cell_count: validation.stats.cell_count,
      output_cell_count: outputValidation.stats.cell_count,
      repair_count: repairs.length,
      blocker_count: blockers.length
    }
  };
}

function snapshotRepairInput(input) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { ok: false, validation: unsafeInputValidation() };
    }
    const plan = structuredClone(input.plan ?? {});
    const rawCondition = structuredClone(input.condition ?? {});
    const condition = rawCondition && typeof rawCondition === 'object' && !Array.isArray(rawCondition) ? rawCondition : {};
    return { ok: true, plan, condition };
  } catch {
    return { ok: false, validation: unsafeInputValidation() };
  }
}

function unsafeInputValidation() {
  return {
    ok: false,
    errors: ['plan and condition inputs could not be safely inspected'],
    warnings: [],
    stats: { run_count: 0, cell_count: 0, evidence_count: 0 }
  };
}

function rejectedPlan(validation, inputRunCount) {
  return {
    source: STAGE7_REPAIR_SOURCE,
    active: true,
    accepted: false,
    plan: undefined,
    validation,
    conflicts: validation.errors.map((message) => conflict('hard-schema', 'blocker', message)),
    repairs: [],
    blockers: [conflict('hard-schema', 'blocker', validation.errors.join('; '))],
    warnings: validation.warnings,
    summary: { input_run_count: inputRunCount, output_run_count: 0 }
  };
}

function safeRunCount(plan) {
  try {
    return Array.isArray(plan?.runs) ? plan.runs.length : 0;
  } catch {
    return 0;
  }
}

function removeIsolatedComponents(cells, repairs) {
  const components = connectedComponents(cells, (cell) => SOLID_ENVELOPE.has(cell.envelope));
  if (!components.length) return;
  const primary = components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))[0];
  const primaryKey = new Set(primary);
  for (const component of components) {
    if (component === primary || component.some((key) => primaryKey.has(key)) || component.length > 8) continue;
    const evidenceIds = evidenceOf(component.map((key) => cells.get(key)));
    for (const key of component) cells.delete(key);
    repairs.push(repair('isolated-component', component, evidenceIds, component.length, 0, { removed_cell_count: component.length }));
  }
}

function closeOneCellWallGaps(cells, repairs) {
  const additions = [];
  for (const cell of cells.values()) {
    if (!['wall', 'support'].includes(cell.envelope)) continue;
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const gapKey = `${cell.x + dx},${cell.y},${cell.z + dz}`;
      const farKey = `${cell.x + dx * 2},${cell.y},${cell.z + dz * 2}`;
      const gap = cells.get(gapKey);
      const far = cells.get(farKey);
      if (!far || !['wall', 'support'].includes(far.envelope)) continue;
      if (gap?.envelope && gap.envelope !== 'none') continue;
      if (['circulation', 'vertical_circulation'].includes(gap?.space)) continue;
      additions.push({
        x: cell.x + dx,
        y: cell.y,
        z: cell.z + dz,
        evidence_ids: [...new Set([...cell.evidence_ids, ...far.evidence_ids])].sort()
      });
    }
  }
  for (const item of uniquePoints(additions)) {
    const key = keyOf(item);
    const current = cells.get(key) || emptyCell(item.x, item.y, item.z, item.evidence_ids);
    cells.set(key, { ...current, envelope: 'wall', evidence_ids: item.evidence_ids });
    repairs.push(repair('one-cell-envelope-gap', [key], item.evidence_ids, 0, 1, { added_cell_count: 1 }));
  }
}

function clearCirculationEnvelopeConflicts(cells, repairs) {
  for (const [key, cell] of cells) {
    if (!['circulation', 'vertical_circulation'].includes(cell.space)) continue;
    const blocked = ['wall', 'support'].includes(cell.envelope) ||
      (cell.space === 'vertical_circulation' && cell.envelope === 'floor');
    if (!blocked) continue;
    const replacement = cell.envelope === 'floor' ? 'none' : 'opening';
    cells.set(key, { ...cell, envelope: replacement });
    repairs.push(repair('circulation-envelope-conflict', [key], cell.evidence_ids, 1, 1, {
      before_envelope: cell.envelope,
      after_envelope: replacement
    }));
  }
}

function addMissingRoofCap(cells, repairs, plan) {
  const components = connectedComponents(cells, (cell) => ['wall', 'floor', 'support'].includes(cell.envelope))
    .filter((component) => component.length > 8)
    .sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
  if (!components.length) return;
  const existingRoof = new Map([...cells.values()]
    .filter((cell) => cell.envelope === 'roof')
    .map((cell) => [`${cell.x},${cell.z}`, cell.y]));
  const added = [];
  for (const component of components) {
    const projection = new Map();
    for (const key of component) {
      const cell = cells.get(key);
      const projectionKey = `${cell.x},${cell.z}`;
      if (!projection.has(projectionKey) || projection.get(projectionKey).y < cell.y) projection.set(projectionKey, cell);
    }
    for (const [projectionKey, cell] of projection) {
      if (Number(existingRoof.get(projectionKey)) > cell.y || cell.y >= 63) continue;
      const key = `${cell.x},${cell.y + 1},${cell.z}`;
      const current = cells.get(key);
      if (current && hasSemanticValue(current)) continue;
      const evidenceIds = [...new Set([...(current?.evidence_ids || []), ...cell.evidence_ids])].sort();
      const target = current || emptyCell(cell.x, cell.y + 1, cell.z, evidenceIds);
      cells.set(key, { ...target, envelope: 'roof', evidence_ids: evidenceIds });
      existingRoof.set(projectionKey, cell.y + 1);
      added.push(key);
    }
  }
  if (added.length) {
    repairs.push(repair('missing-roof-cap', added, evidenceOf(added.map((key) => cells.get(key))), 0, added.length, {
      added_cell_count: added.length,
      provider: plan.provider?.name
    }));
  }
}

function semanticConflicts(cells, condition, originalOpeningKeys) {
  const conflicts = [];
  const blockers = [];
  const warnings = [];
  const byKey = new Map(cells.map((cell) => [keyOf(cell), cell]));
  const solid = cells.filter((cell) => SOLID_ENVELOPE.has(cell.envelope));
  const usable = cells.filter((cell) => USABLE_SPACE.has(cell.space));
  const opening = cells.filter((cell) => cell.envelope === 'opening' && originalOpeningKeys.has(keyOf(cell)));
  const solidComponents = connectedComponents(byKey, (cell) => SOLID_ENVELOPE.has(cell.envelope))
    .sort((left, right) => right.length - left.length || left[0].localeCompare(right[0]));
  const primaryKeys = new Set(solidComponents[0] || []);
  const primarySolid = solid.filter((cell) => primaryKeys.has(keyOf(cell)));
  const nonRoofSolid = primarySolid.filter((cell) => cell.envelope !== 'roof');
  const primaryBounds = boundsOf(nonRoofSolid);
  const usableInside = usable.filter((cell) => insideBounds(cell, primaryBounds));
  const usableMap = new Map(usableInside.map((cell) => [keyOf(cell), cell]));
  const usableComponents = connectedComponents(usableMap, () => true)
    .sort((left, right) => right.length - left.length || left[0].localeCompare(right[0]));
  const primaryUsableKeys = new Set(usableComponents[0] || []);
  const primaryUsable = usableInside.filter((cell) => primaryUsableKeys.has(keyOf(cell)));
  const circulation = primaryUsable.filter((cell) => cell.space === 'circulation');
  const vertical = primaryUsable.filter((cell) => cell.space === 'vertical_circulation');
  const roof = primarySolid.filter((cell) => cell.envelope === 'roof');
  const floorLevels = new Set(primarySolid.filter((cell) => cell.envelope === 'floor').map((cell) => cell.y));
  const entranceCells = opening.filter((cell) =>
    onHorizontalBoundary(cell, primaryBounds) &&
    touchesPrimaryEnvelope(cell, primaryKeys) &&
    (primaryUsableKeys.has(keyOf(cell)) || neighbourKeyInSet(cell, primaryUsableKeys)) &&
    (cell.space === 'circulation' || neighbourHasSpace(cell, byKey, 'circulation'))
  );
  const entrance = entranceCells.length > 0;
  const roofCoverage = roofCoverageRatio(nonRoofSolid, roof);
  const requestedFloors = Math.max(1, Number(condition.dimensions?.floors || 1));
  const sortedFloorLevels = [...floorLevels].sort((left, right) => left - right).slice(0, requestedFloors);
  const verticalContinuity = requestedFloors <= 1 || verticalPathCoversFloors(vertical, sortedFloorLevels);

  requireCondition(primarySolid.length > 0, 'missing-primary-envelope', 'primary envelope is missing');
  requireCondition(solidComponents.length <= MAX_STAGE7_MASSING_COMPONENTS, 'too-many-massing-components', `massing component count exceeds ${MAX_STAGE7_MASSING_COMPONENTS}`);
  requireCondition(primaryUsable.length > 0, 'missing-usable-space', 'connected usable space inside the primary envelope is missing');
  requireCondition(entrance, 'missing-entrance', 'an opening connected to circulation is required');
  requireCondition(circulation.length > 0, 'missing-circulation', 'circulation space is required');
  requireCondition(requestedFloors <= 1 || vertical.length > 0, 'missing-vertical-circulation', 'multi-floor plans require vertical circulation');
  requireCondition(roofCoverage >= 0.5, 'missing-roof', `roof coverage above occupied massing is insufficient: ${roofCoverage}`);
  requireCondition(floorLevels.size >= requestedFloors && verticalContinuity, 'missing-floor-continuity', 'each requested floor requires a floor layer connected by vertical circulation');
  if (cells.some((cell) => cell.site !== 'none' && (cell.x < 0 || cell.x > 63 || cell.z < 0 || cell.z > 63))) {
    requireCondition(false, 'site-outside-lot', 'conceptual site cells must remain inside the normalized lot');
  }
  return { conflicts, blockers, warnings, entranceKeys: entranceCells.map(keyOf).sort() };

  function requireCondition(ok, id, message) {
    if (ok) return;
    const item = conflict(id, 'blocker', message);
    conflicts.push(item);
    blockers.push(item);
  }
}

function connectedComponents(cells, predicate) {
  const remaining = new Set([...cells.entries()].filter(([, cell]) => predicate(cell)).map(([key]) => key));
  const components = [];
  const starts = [...remaining].sort();
  for (const start of starts) {
    if (!remaining.has(start)) continue;
    const queue = [start];
    const component = [];
    remaining.delete(start);
    for (let head = 0; head < queue.length; head += 1) {
      const key = queue[head];
      component.push(key);
      const cell = cells.get(key);
      for (const [dx, dy, dz] of NEIGHBORS_6) {
        const neighbour = `${cell.x + dx},${cell.y + dy},${cell.z + dz}`;
        if (!remaining.has(neighbour)) continue;
        remaining.delete(neighbour);
        queue.push(neighbour);
      }
    }
    components.push(component.sort());
  }
  return components;
}

function neighbourHasSpace(cell, cellsByKey, role) {
  return NEIGHBORS_6.some(([dx, dy, dz]) => cellsByKey.get(`${cell.x + dx},${cell.y + dy},${cell.z + dz}`)?.space === role);
}

function onHorizontalBoundary(cell, bounds) {
  return Boolean(bounds) && (cell.x === bounds.minX || cell.x === bounds.maxX || cell.z === bounds.minZ || cell.z === bounds.maxZ);
}

function touchesPrimaryEnvelope(cell, primaryKeys) {
  return NEIGHBORS_6.some(([dx, dy, dz]) => primaryKeys.has(`${cell.x + dx},${cell.y + dy},${cell.z + dz}`));
}

function neighbourKeyInSet(cell, keys) {
  return NEIGHBORS_6.some(([dx, dy, dz]) => keys.has(`${cell.x + dx},${cell.y + dy},${cell.z + dz}`));
}

function verticalPathCoversFloors(verticalCells, floorLevels) {
  if (floorLevels.length < 2 || !verticalCells.length) return false;
  const verticalMap = new Map(verticalCells.map((cell) => [keyOf(cell), cell]));
  return connectedComponents(verticalMap, () => true).some((component) => {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const key of component) {
      const y = verticalMap.get(key).y;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return minY <= floorLevels[0] + 1 && maxY >= floorLevels.at(-1);
  });
}

function roofCoverageRatio(massing, roof) {
  const columns = new Map();
  for (const cell of massing) {
    const key = `${cell.x},${cell.z}`;
    if (!columns.has(key) || columns.get(key) < cell.y) columns.set(key, cell.y);
  }
  if (!columns.size) return 0;
  const covered = new Set();
  for (const cell of roof) {
    const key = `${cell.x},${cell.z}`;
    if (columns.has(key) && cell.y > columns.get(key)) covered.add(key);
  }
  return Number((covered.size / columns.size).toFixed(4));
}

function summarize(cells) {
  const envelope = countBy(cells, 'envelope');
  const space = countBy(cells, 'space');
  const site = countBy(cells, 'site');
  const confidenceValues = cells.map((cell) => Number(cell.confidence)).filter(Number.isFinite);
  return {
    cell_count: cells.length,
    envelope_counts: envelope,
    space_counts: space,
    site_counts: site,
    mean_confidence: confidenceValues.length ? Number((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length).toFixed(4)) : 0
  };
}

function countBy(cells, field) {
  const counts = {};
  for (const cell of cells) {
    const value = cell[field];
    if (value === 'none' || value === 'outside') continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function boundsOf(cells) {
  if (!cells.length) return undefined;
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const cell of cells) {
    bounds.minX = Math.min(bounds.minX, cell.x);
    bounds.maxX = Math.max(bounds.maxX, cell.x);
    bounds.minY = Math.min(bounds.minY, cell.y);
    bounds.maxY = Math.max(bounds.maxY, cell.y);
    bounds.minZ = Math.min(bounds.minZ, cell.z);
    bounds.maxZ = Math.max(bounds.maxZ, cell.z);
  }
  return bounds;
}

function insideBounds(cell, bounds) {
  return Boolean(bounds) && cell.x >= bounds.minX && cell.x <= bounds.maxX && cell.y >= bounds.minY && cell.y <= bounds.maxY && cell.z >= bounds.minZ && cell.z <= bounds.maxZ;
}

function repair(reason, cells, evidenceIds, beforeCellCount, afterCellCount, details) {
  return {
    reason,
    cells: [...cells].sort(),
    evidence_ids: [...new Set(evidenceIds || [])].sort(),
    before_cell_count: beforeCellCount,
    after_cell_count: afterCellCount,
    details
  };
}

function conflict(id, severity, message) {
  return { id, severity, message };
}

function emptyCell(x, y, z, evidenceIds) {
  return { x, y, z, envelope: 'none', space: 'outside', site: 'none', confidence: 1, evidence_ids: [...evidenceIds] };
}

function evidenceOf(cells) {
  return [...new Set(cells.flatMap((cell) => cell?.evidence_ids || []))].sort();
}

function hasSemanticValue(cell) {
  return cell.envelope !== 'none' || cell.space !== 'outside' || cell.site !== 'none';
}

function uniquePoints(points) {
  return [...new Map(points.map((point) => [keyOf(point), point])).values()].sort(compareCells);
}

function keyOf(cell) {
  return `${cell.x},${cell.y},${cell.z}`;
}

function compareCells(left, right) {
  return left.z - right.z || left.y - right.y || left.x - right.x;
}
