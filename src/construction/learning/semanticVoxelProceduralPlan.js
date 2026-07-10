import { normalizeArchitecture } from '../agents/architectAgent.js';
import { normalizeTopology } from '../agents/plannerAgent.js';
import { decodeStage7Runs, validateStage7Plan } from './coarseSemanticVoxelSchema.js';

export const STAGE7_CONVERTER_SOURCE = 'stage7-coarse-semantic-voxel-procedural-plan-v1';

const MASSING_ROLES = new Set(['wall', 'floor', 'roof', 'support']);
const SPACE_ROLES = new Set(['public', 'private', 'service', 'circulation', 'vertical_circulation', 'void']);
const SITE_ROLES = new Set(['ground', 'path', 'courtyard', 'water', 'vegetation']);
const NEIGHBORS_6 = Object.freeze([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]);

export function deriveStage7Sketches({ plan = {}, condition = {} } = {}) {
  const cells = decodeStage7Runs(plan.runs || []);
  const massing = connectedComponents(cells.filter((cell) => MASSING_ROLES.has(cell.envelope)))
    .map((component, index) => sketch(`massing-${index + 1}`, 'massing', component))
    .sort((left, right) => right.cell_count - left.cell_count || left.id.localeCompare(right.id));
  massing.forEach((item, index) => { item.id = `massing-${index + 1}`; item.primary = index === 0; });

  const floors = Math.max(1, Number(condition.dimensions?.floors || 1));
  const floorLevels = detectedFloorLevels(cells, floors);
  const spaceCells = cells.filter((cell) => SPACE_ROLES.has(cell.space));
  const spaceRecords = connectedComponentsByKey(
    spaceCells,
    (cell) => `${cell.space}:F${floorForY(cell.y, floorLevels)}`
  ).map((group) => ({
    role: group[0].space,
    floor: floorForY(group[0].y, floorLevels),
    group,
    bounds: boundsOf(group)
  })).sort((left, right) => left.floor - right.floor || left.role.localeCompare(right.role) || compareBounds(left.bounds, right.bounds));
  const cellToSpace = new Map();
  const spaces = spaceRecords.map((record, index) => {
    const item = { ...sketch(`space-${index + 1}`, record.role, record.group), floor: record.floor, adjacent_zone_ids: [] };
    for (const cell of record.group) cellToSpace.set(keyOf(cell), item.id);
    return item;
  });
  const adjacency = new Map(spaces.map((item) => [item.id, new Set()]));
  for (const cell of spaceCells) {
    const from = cellToSpace.get(keyOf(cell));
    for (const [dx, dy, dz] of NEIGHBORS_6) {
      const to = cellToSpace.get(`${cell.x + dx},${cell.y + dy},${cell.z + dz}`);
      if (to && to !== from) adjacency.get(from).add(to);
    }
  }
  for (const item of spaces) item.adjacent_zone_ids = [...adjacency.get(item.id)].sort();
  const site = groupedSketches(
    cells.filter((cell) => SITE_ROLES.has(cell.site)),
    (cell) => cell.site,
    (group, role, index) => sketch(`site-${index + 1}`, role, group)
  );
  return { massing, spaces, site };
}

export function convertSemanticVoxelPlanToProceduralPlan({
  plan = {},
  condition = {},
  architecture = {},
  buildSpec = {},
  topology = {},
  prompt = ''
} = {}) {
  const validation = validateStage7Plan(plan, { condition, allowDerived: true });
  if (!validation.ok || plan.accepted === false) throw new Error(`invalid Stage 7 plan: ${(validation.errors || []).join('; ') || 'unaccepted plan'}`);
  const blockers = (plan.conflicts || []).filter((item) => item.severity === 'blocker');
  if (blockers.length) throw new Error(`unresolved Stage 7 blockers: ${blockers.map((item) => item.id).join(', ')}`);
  const sketches = deriveStage7Sketches({ plan, condition });
  if (!sketches.massing.length) throw new Error('Stage 7 conversion requires a massing sketch');

  const volumes = volumesFromMassing(sketches, condition);
  const candidateArchitecture = normalizeArchitecture({
    ...architecture,
    footprint: condition.design?.footprint || architecture.footprint,
    volumes,
    generation_hints: {
      ...(architecture.generation_hints || {}),
      stage7_shadow_condition_hash: condition.condition_hash,
      stage7_shadow_massing_count: sketches.massing.length
    }
  }, 'stage7-shadow-candidate', architecture);
  const primary = sketches.massing[0];
  const candidateBuildSpec = deriveCandidateBuildSpec({ buildSpec, condition, primary, sketches });
  const candidateNodes = (topology.nodes || []).map((node) => tagNodeWithSpaceSketch(node, sketches.spaces));
  const entryId = candidateNodes.find((node) => node.type === 'entry' || node.id === 'entry')?.id;
  const stage7SiteConnections = entryId
    ? sketches.site.filter((item) => ['path', 'courtyard', 'water'].includes(item.role)).map((item) => ({ from: entryId, to: `stage7-${item.id}`, relation: `conceptual-${item.role}` }))
    : [];
  const stage7SpaceZoneEdges = uniqueSpaceEdges(sketches.spaces);
  const stage7StairHints = sketches.spaces
    .filter((item) => item.role === 'vertical_circulation')
    .map((item) => ({ zone_id: item.id, floor: item.floor, bounds: item.bounds }));
  const candidateCells = new Map(decodeStage7Runs(plan.runs).map((cell) => [keyOf(cell), cell]));
  const validatedEntranceKeys = Array.isArray(plan.summary?.validated_entrance_cells) ? plan.summary.validated_entrance_cells : [];
  if (!validatedEntranceKeys.length) throw new Error('Stage 7 conversion requires validated exterior entrance cells');
  const unresolvedEntrance = validatedEntranceKeys.find((key) => !candidateCells.has(key));
  if (unresolvedEntrance) throw new Error(`unresolved validated entrance key: ${unresolvedEntrance}`);
  const stage7EntranceHints = validatedEntranceKeys.map((key) => ({ side: condition.design?.front_side, role: 'exterior-entrance', anchor: 'validated-boundary' }));
  const candidateTopology = normalizeTopology({
    ...topology,
    nodes: candidateNodes,
    site_connections: [...(topology.site_connections || []), ...stage7SiteConnections],
    bsp_hints: {
      ...(topology.bsp_hints || {}),
      stage7_space_zones: sketches.spaces.map((item) => ({
        id: item.id,
        role: item.role,
        floor: item.floor,
        weight: zoneWeight(item),
        bounds: item.bounds,
        adjacent_zone_ids: item.adjacent_zone_ids
      })),
      stage7_space_zone_edges: stage7SpaceZoneEdges,
      stage7_stair_hints: stage7StairHints,
      stage7_entrance_hints: stage7EntranceHints
    }
  }, 'stage7-shadow-candidate', topology, candidateBuildSpec, { prompt, architecture: candidateArchitecture });

  return {
    source: STAGE7_CONVERTER_SOURCE,
    active: true,
    condition_hash: condition.condition_hash,
    plan_provenance: {
      source: plan.source,
      schema_version: plan.schema_version,
      condition_hash: plan.condition_hash,
      provider: structuredClone(plan.provider),
      run_count: Array.isArray(plan.runs) ? plan.runs.length : 0,
      repair_count: Array.isArray(plan.repairs) ? plan.repairs.length : 0
    },
    architecture: candidateArchitecture,
    buildSpec: candidateBuildSpec,
    topology: candidateTopology,
    sketches,
    warnings: volumes.some((item) => item.boolean_mode === 'subtract')
      ? ['courtyard subtract volume is shadow-only until apply-mode synthesis is implemented']
      : []
  };
}

function volumesFromMassing(sketches, condition) {
  const primary = sketches.massing[0];
  const evidenceTags = provenanceTags(condition);
  const volumes = [{
    id: 'main',
    role: 'Stage 7 primary mass',
    shape: 'box',
    scale: [1, 1, 1],
    placement: { relation: 'center' },
    boolean_mode: 'union',
    tags: ['stage7-shadow', 'primary-mass', ...evidenceTags],
    purpose: 'stage7-primary-building-envelope'
  }];
  for (const item of sketches.massing.slice(1)) {
    volumes.push({
      id: item.id,
      role: `Stage 7 attached mass ${item.id}`,
      shape: 'box',
      scale: relativeScale(item.bounds, primary.bounds),
      placement: { relation: relationToPrimary(item.bounds, primary.bounds), attach_to: 'main' },
      boolean_mode: 'union',
      tags: ['stage7-shadow', 'attached-mass', ...evidenceTags],
      purpose: 'stage7-secondary-building-envelope'
    });
  }
  const courtyard = sketches.site.find((item) => item.role === 'courtyard' && overlaps2d(item.bounds, primary.bounds));
  if (courtyard) {
    volumes.push({
      id: 'stage7-courtyard-void',
      role: 'Stage 7 conceptual courtyard void',
      shape: 'box',
      scale: relativeScale(courtyard.bounds, primary.bounds),
      placement: { relation: 'center', attach_to: 'main' },
      boolean_mode: 'subtract',
      tags: ['stage7-shadow', 'courtyard-void', ...evidenceTags],
      purpose: 'stage7-conceptual-courtyard'
    });
  }
  return volumes;
}

function provenanceTags(condition = {}) {
  return [
    condition.condition_hash ? `stage7-condition:${condition.condition_hash}` : undefined,
    condition.design?.selected_concept_id ? `stage7-concept:${condition.design.selected_concept_id}` : undefined,
    ...(condition.references || []).map((item) => `stage7-reference:${item.case_id}`)
  ].filter(Boolean).sort();
}

function tagNodeWithSpaceSketch(node, spaces) {
  const zone = String(node.zone || node.privacy || 'public');
  const role = node.type === 'stairs' ? 'vertical_circulation' : zone;
  const matches = spaces.filter((item) => item.role === role && Number(item.floor) === Number(node.floor || 0));
  const selected = matches.sort((left, right) => right.cell_count - left.cell_count)[0];
  return {
    ...node,
    tags: [...new Set([...(node.tags || []), ...(selected ? [`stage7-zone:${selected.id}`] : [])])],
    weight: selected ? Math.max(Number(node.weight || 1), zoneWeight(selected)) : node.weight
  };
}

function connectedComponents(cells) {
  const byKey = new Map(cells.map((cell) => [keyOf(cell), cell]));
  const remaining = new Set(byKey.keys());
  const components = [];
  const starts = [...remaining].sort();
  for (const start of starts) {
    if (!remaining.has(start)) continue;
    const queue = [start];
    const group = [];
    remaining.delete(start);
    for (let head = 0; head < queue.length; head += 1) {
      const key = queue[head];
      const cell = byKey.get(key);
      group.push(cell);
      for (const [dx, dy, dz] of NEIGHBORS_6) {
        const neighbour = `${cell.x + dx},${cell.y + dy},${cell.z + dz}`;
        if (!remaining.has(neighbour)) continue;
        remaining.delete(neighbour);
        queue.push(neighbour);
      }
    }
    components.push(group);
  }
  return components;
}

function connectedComponentsByKey(cells, groupKey) {
  const byKey = new Map(cells.map((cell) => [keyOf(cell), cell]));
  const remaining = new Set(byKey.keys());
  const groups = [];
  const starts = [...remaining].sort();
  for (const start of starts) {
    if (!remaining.has(start)) continue;
    const expected = groupKey(byKey.get(start));
    const queue = [start];
    const group = [];
    remaining.delete(start);
    for (let head = 0; head < queue.length; head += 1) {
      const key = queue[head];
      const cell = byKey.get(key);
      group.push(cell);
      for (const [dx, dy, dz] of NEIGHBORS_6) {
        const neighbour = `${cell.x + dx},${cell.y + dy},${cell.z + dz}`;
        if (!remaining.has(neighbour) || groupKey(byKey.get(neighbour)) !== expected) continue;
        remaining.delete(neighbour);
        queue.push(neighbour);
      }
    }
    groups.push(group);
  }
  return groups;
}

function groupedSketches(cells, keyFor, build) {
  const groups = new Map();
  for (const cell of cells) {
    const key = keyFor(cell);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(cell);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, group], index) => build(group, key, index));
}

function deriveCandidateBuildSpec({ buildSpec, condition, primary, sketches }) {
  const baseline = structuredClone(buildSpec);
  const projectedWidth = projectBlocks(size(primary.bounds, 'X'), condition.dimensions?.lot_width);
  const projectedDepth = projectBlocks(size(primary.bounds, 'Z'), condition.dimensions?.lot_depth);
  const floors = boundedPositiveInt(condition.dimensions?.floors, baseline.floors, 1);
  const floorHeight = boundedPositiveInt(condition.dimensions?.floor_height, baseline.floor_height, 3);
  const roofHeight = boundedPositiveInt(baseline.roof_height, baseline.roof_height, 1);
  const totalHeight = Math.min(Number(baseline.total_height || floors * floorHeight + roofHeight), floors * floorHeight + roofHeight);
  const minimumWidth = Math.max(11, Number(baseline.constraints?.min_width || 11));
  const minimumDepth = Math.max(11, Number(baseline.constraints?.min_depth || 11));
  return {
    ...baseline,
    width: boundedPositiveInt(projectedWidth, baseline.width, minimumWidth),
    depth: boundedPositiveInt(projectedDepth, baseline.depth, minimumDepth),
    floors,
    floor_height: floorHeight,
    wall_height: Math.min(Number(baseline.wall_height || floors * floorHeight), floors * floorHeight),
    roof_height: roofHeight,
    total_height: totalHeight,
    door_side: ['north', 'south', 'east', 'west'].includes(condition.design?.front_side) ? condition.design.front_side : baseline.door_side,
    lot: {
      ...structuredClone(baseline.lot || {}),
      width: boundedPositiveInt(condition.dimensions?.lot_width, baseline.lot?.width, 1),
      depth: boundedPositiveInt(condition.dimensions?.lot_depth, baseline.lot?.depth, 1)
    },
    stage7_shadow: {
      source: STAGE7_CONVERTER_SOURCE,
      condition_hash: condition.condition_hash,
      massing_count: sketches.massing.length,
      space_zone_count: sketches.spaces.length,
      site_zone_count: sketches.site.length
    }
  };
}

function uniqueSpaceEdges(spaces) {
  const edges = new Map();
  for (const item of spaces) {
    for (const adjacent of item.adjacent_zone_ids || []) {
      const [from, to] = [item.id, adjacent].sort();
      edges.set(`${from}|${to}`, { from, to, relation: 'shared-boundary' });
    }
  }
  return [...edges.values()].sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to));
}

function sketch(id, role, cells) {
  return { id, role, cell_count: cells.length, bounds: boundsOf(cells) };
}

function boundsOf(cells) {
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

function compareBounds(left, right) {
  return left.minY - right.minY || left.minZ - right.minZ || left.minX - right.minX || left.maxY - right.maxY || left.maxZ - right.maxZ || left.maxX - right.maxX;
}

function relativeScale(bounds, primary) {
  return [
    clampRatio(size(bounds, 'X') / size(primary, 'X'), 0.1, 1.4),
    clampRatio(size(bounds, 'Y') / size(primary, 'Y'), 0.2, 1.6),
    clampRatio(size(bounds, 'Z') / size(primary, 'Z'), 0.1, 1.4)
  ];
}

function relationToPrimary(bounds, primary) {
  const dx = center(bounds, 'X') - center(primary, 'X');
  const dz = center(bounds, 'Z') - center(primary, 'Z');
  if (Math.abs(dx) >= Math.abs(dz)) return dx < 0 ? 'attached-west' : 'attached-east';
  return dz < 0 ? 'attached-north' : 'attached-south';
}

function projectBlocks(gridSize, lotSize) {
  return Math.max(1, Math.round((Number(gridSize) / 64) * Math.max(1, Number(lotSize || 1))));
}

function boundedPositiveInt(value, ceiling, minimum) {
  const upper = Math.max(minimum, Math.trunc(Number(ceiling) || minimum));
  return Math.max(minimum, Math.min(upper, Math.trunc(Number(value) || upper)));
}

function detectedFloorLevels(cells, requestedFloors) {
  const levels = [...new Set(cells.filter((cell) => cell.envelope === 'floor').map((cell) => cell.y))].sort((left, right) => left - right);
  if (levels.length) return levels.slice(0, requestedFloors);
  return Array.from({ length: requestedFloors }, (_, index) => Math.floor((index * 64) / requestedFloors));
}

function floorForY(y, floorLevels) {
  let floor = 0;
  for (let index = 1; index < floorLevels.length; index += 1) {
    if (Number(y) >= floorLevels[index]) floor = index;
  }
  return floor;
}

function zoneWeight(item) {
  return Number(Math.max(0.2, Math.min(3, item.cell_count / 2000)).toFixed(3));
}

function overlaps2d(left, right) {
  return left.minX <= right.maxX && left.maxX >= right.minX && left.minZ <= right.maxZ && left.maxZ >= right.minZ;
}

function size(bounds, axis) {
  return bounds[`max${axis}`] - bounds[`min${axis}`] + 1;
}

function center(bounds, axis) {
  return (bounds[`min${axis}`] + bounds[`max${axis}`]) / 2;
}

function clampRatio(value, min, max) {
  return Number(Math.max(min, Math.min(max, value)).toFixed(4));
}

function keyOf(cell) {
  return `${cell.x},${cell.y},${cell.z}`;
}
