import { createStage7Plan } from './coarseSemanticVoxelSchema.js';

export const STAGE7_BASELINE_SOURCE = 'stage7-coarse-semantic-voxel-baseline-v1';

export const deterministicCoarseSemanticVoxelProvider = Object.freeze({
  id: 'baseline',
  async generate(input = {}) {
    return generateDeterministicCoarseSemanticVoxelPlan(input);
  }
});

export function generateDeterministicCoarseSemanticVoxelPlan({ condition = {}, seed = condition.seed, options = {} } = {}) {
  if (Number(seed) !== Number(condition.seed)) throw new Error('baseline provider seed must match the canonical condition');
  void options;
  const cells = new Map();
  const evidence = evidenceFor(condition);
  const evidenceIds = evidenceIdsByLayer(condition);
  const bounds = normalizedBuildingBounds(condition);
  const floors = clampInt(condition.dimensions?.floors, 1, 5, 1);
  const baseY = 4;
  const roofY = 58;
  const floorSpan = Math.max(6, Math.floor((roofY - baseY) / floors));
  const strategies = new Set((condition.design?.massing_strategy || []).map(normalizeToken));
  const referenceHints = (condition.references || []).flatMap((item) => item.hints || []).map((item) => normalizeToken(item.claim));
  const courtyard = condition.design?.footprint === 'courtyard' || strategies.has('courtyard') || referenceHints.some((item) => item.includes('courtyard'));
  const stepped = [...strategies, ...referenceHints].some((item) => item.includes('step') || item.includes('terrace'));
  const courtyardBox = courtyard ? insetBox(bounds, Math.max(4, Math.floor((bounds.x1 - bounds.x0 + 1) * 0.35)), Math.max(4, Math.floor((bounds.z1 - bounds.z0 + 1) * 0.35))) : undefined;

  addSiteLayer(cells, condition, bounds, courtyardBox, evidenceIds.site);
  for (let floor = 0; floor < floors; floor += 1) {
    const inset = floorInset(bounds, floor, stepped);
    const floorBounds = {
      x0: bounds.x0 + inset,
      x1: bounds.x1 - inset,
      z0: bounds.z0 + inset,
      z1: bounds.z1 - inset
    };
    const y0 = baseY + floor * floorSpan;
    const y1 = floor === floors - 1 ? roofY - 1 : baseY + (floor + 1) * floorSpan - 1;
    addFloor(cells, floorBounds, courtyardBox, y0, evidenceIds.envelope);
    addStructuralSupportColumns(cells, floorBounds, baseY, y0, evidenceIds.envelope);
    addEnvelopeAndSpaces(cells, floorBounds, courtyardBox, y0, y1, floor, floors, condition, evidenceIds);
  }
  const topInset = floorInset(bounds, floors - 1, stepped);
  addRoof(cells, stepped ? {
    x0: bounds.x0 + topInset,
    x1: bounds.x1 - topInset,
    z0: bounds.z0 + topInset,
    z1: bounds.z1 - topInset
  } : bounds, courtyardBox, roofY, evidenceIds.envelope);
  addEntrance(cells, bounds, condition.design?.front_side || 'south', baseY, [...new Set([...evidenceIds.envelope, ...evidenceIds.space])]);
  if (floors > 1) addVerticalCore(cells, bounds, courtyardBox, baseY, roofY, evidenceIds.space);

  return createStage7Plan({
    condition,
    provider: {
      kind: 'deterministic-baseline',
      name: STAGE7_BASELINE_SOURCE,
      model_version: null,
      dataset_version: null
    },
    cells: [...cells.values()],
    evidence
  });
}

function normalizedBuildingBounds(condition) {
  const secondary = (condition.design?.massing_volumes || []).filter((item) => item.boolean_mode !== 'subtract' && item.placement?.relation !== 'center');
  const widthExtension = secondary.filter((item) => /east|west/i.test(item.placement?.relation || '')).reduce((sum, item) => sum + Number(item.scale?.[0] || 0), 0);
  const depthExtension = secondary.filter((item) => /north|south/i.test(item.placement?.relation || '')).reduce((sum, item) => sum + Number(item.scale?.[2] || 0), 0);
  const widthRatio = clamp(Number(condition.dimensions?.width || 1) / Math.max(1, Number(condition.dimensions?.lot_width || 1)) + Math.min(0.1, widthExtension * 0.04), 0.25, 0.9);
  const depthRatio = clamp(Number(condition.dimensions?.depth || 1) / Math.max(1, Number(condition.dimensions?.lot_depth || 1)) + Math.min(0.1, depthExtension * 0.04), 0.25, 0.9);
  const width = clampInt(Math.round(64 * widthRatio), 20, 56, 40);
  const depth = clampInt(Math.round(64 * depthRatio), 20, 56, 40);
  const x0 = Math.floor((64 - width) / 2);
  const z0 = Math.floor((64 - depth) / 2);
  return { x0, x1: x0 + width - 1, z0, z1: z0 + depth - 1 };
}

function floorInset(bounds, floor, stepped) {
  if (!stepped) return 0;
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const maxInset = Math.max(0, Math.floor((Math.min(width, depth) - 12) / 2));
  return Math.min(floor * 2, maxInset);
}

function addSiteLayer(cells, condition, building, courtyard, evidenceIds) {
  for (let z = 0; z < 64; z += 1) {
    for (let x = 0; x < 64; x += 1) put(cells, x, 0, z, { site: 'ground' }, evidenceIds);
  }
  if ((condition.design?.abstract_site_tags || []).includes('water-edge')) {
    for (let z = 0; z <= 4; z += 1) {
      for (let x = 0; x < 64; x += 1) put(cells, x, 0, z, { site: 'water' }, evidenceIds);
    }
  }
  for (let x = 1; x < 63; x += 6) {
    put(cells, x, 0, 6, { site: 'vegetation' }, evidenceIds);
    put(cells, x, 0, 62, { site: 'vegetation' }, evidenceIds);
  }
  if (courtyard) {
    for (let z = courtyard.z0; z <= courtyard.z1; z += 1) {
      for (let x = courtyard.x0; x <= courtyard.x1; x += 1) put(cells, x, 0, z, { site: 'courtyard' }, evidenceIds);
    }
  }
  const door = entrancePoint(building, condition.design?.front_side || 'south');
  for (const point of pathToLotEdge(door, condition.design?.front_side || 'south')) put(cells, point.x, 0, point.z, { site: 'path' }, evidenceIds);
}

function addFloor(cells, bounds, courtyard, y, evidenceIds) {
  for (let z = bounds.z0; z <= bounds.z1; z += 1) {
    for (let x = bounds.x0; x <= bounds.x1; x += 1) {
      if (inside(x, z, courtyard)) continue;
      put(cells, x, y, z, { envelope: 'floor' }, evidenceIds);
    }
  }
}

function addStructuralSupportColumns(cells, bounds, baseY, floorY, evidenceIds) {
  if (floorY <= baseY) return;
  const corners = [
    [bounds.x0, bounds.z0],
    [bounds.x1, bounds.z0],
    [bounds.x0, bounds.z1],
    [bounds.x1, bounds.z1]
  ];
  for (const [x, z] of corners) {
    for (let y = baseY + 1; y <= floorY; y += 1) put(cells, x, y, z, { envelope: 'support' }, evidenceIds);
  }
}

function addEnvelopeAndSpaces(cells, bounds, courtyard, y0, y1, floor, floors, condition, evidenceIds) {
  for (let y = y0 + 1; y <= y1; y += 1) {
    for (let z = bounds.z0; z <= bounds.z1; z += 1) {
      for (let x = bounds.x0; x <= bounds.x1; x += 1) {
        if (inside(x, z, courtyard)) continue;
        if (x === bounds.x0 || x === bounds.x1 || z === bounds.z0 || z === bounds.z1) {
          put(cells, x, y, z, { envelope: 'wall' }, evidenceIds.envelope);
        } else {
          put(cells, x, y, z, { space: zoneFor(x, z, bounds, floor, floors, condition) }, evidenceIds.space);
        }
      }
    }
  }
}

function addRoof(cells, bounds, courtyard, y, evidenceIds) {
  for (let z = bounds.z0; z <= bounds.z1; z += 1) {
    for (let x = bounds.x0; x <= bounds.x1; x += 1) {
      if (inside(x, z, courtyard)) continue;
      put(cells, x, y, z, { envelope: 'roof' }, evidenceIds);
    }
  }
}

function addEntrance(cells, bounds, frontSide, baseY, evidenceIds) {
  const point = entrancePoint(bounds, frontSide);
  for (let y = baseY + 1; y <= baseY + 3; y += 1) {
    put(cells, point.x, y, point.z, { envelope: 'opening', space: 'circulation' }, evidenceIds);
  }
}

function addVerticalCore(cells, bounds, courtyard, baseY, roofY, evidenceIds) {
  const centerX = Math.floor((bounds.x0 + bounds.x1) / 2);
  const centerZ = Math.floor((bounds.z0 + bounds.z1) / 2);
  const candidates = [
    { x: centerX, z: centerZ },
    { x: centerX + 1, z: centerZ },
    { x: centerX, z: centerZ + 1 },
    { x: centerX + 1, z: centerZ + 1 }
  ].map((point) => inside(point.x, point.z, courtyard) ? { x: courtyard.x0 - 2, z: point.z } : point);
  for (let y = baseY + 1; y < roofY; y += 1) {
    for (const point of candidates) put(cells, point.x, y, point.z, { space: 'vertical_circulation' }, evidenceIds);
  }
}

function zoneFor(x, z, bounds, floor, floors, condition) {
  const centerX = Math.floor((bounds.x0 + bounds.x1) / 2);
  const centerZ = Math.floor((bounds.z0 + bounds.z1) / 2);
  const strategy = [...(condition.design?.space_strategy || []), ...(condition.design?.quality_targets || [])].map(normalizeToken).join(' ');
  const programNodes = condition.design?.topology_program?.nodes || [];
  const totalProgramWeight = programNodes.reduce((sum, item) => sum + Math.max(0, Number(item.weight || 0)), 0);
  const serviceProgramWeight = programNodes.filter((item) => item.zone === 'service' || item.privacy === 'service').reduce((sum, item) => sum + Math.max(0, Number(item.weight || 0)), 0);
  const serviceWidth = clampInt(2 + Math.round(totalProgramWeight ? (serviceProgramWeight / totalProgramWeight) * 8 : 0), 2, 6, 3);
  const corridorRadius = strategy.includes('clear-entry') ? 2 : 1;
  if (Math.abs(x - centerX) <= corridorRadius || Math.abs(z - centerZ) <= corridorRadius) return 'circulation';
  const serviceOnWest = Math.abs(Number(condition.seed || 0)) % 2 === 1;
  const serviceEdge = serviceOnWest ? x <= bounds.x0 + serviceWidth : x >= bounds.x1 - serviceWidth;
  if (serviceEdge) return 'service';
  if (floor > 0 || floors === 1 && z < centerZ) return 'private';
  if (strategy.includes('public-west')) return x < centerX ? 'public' : 'private';
  if (strategy.includes('public-east')) return x > centerX ? 'public' : 'private';
  if (strategy.includes('public-north')) return z < centerZ ? 'public' : 'private';
  return z >= centerZ ? 'public' : 'private';
}

function evidenceFor(condition) {
  return [
    { id: `condition:${condition.condition_hash}`, kind: 'condition', source_id: condition.condition_hash },
    ...(condition.references || []).map((reference) => ({
      id: `reference:${reference.case_id}`,
      kind: 'reference',
      source_id: reference.case_id,
      detail: reference.used_for.join(',')
    }))
  ];
}

function evidenceIdsByLayer(condition) {
  const conditionId = `condition:${condition.condition_hash}`;
  const references = condition.references || [];
  const idsFor = (areas) => [
    conditionId,
    ...references
      .filter((reference) => (reference.used_for || []).some((area) => areas.includes(area)))
      .map((reference) => `reference:${reference.case_id}`)
  ].sort();
  return {
    envelope: idsFor(['massing', 'structure', 'facade', 'roof']),
    space: idsFor(['space', 'planning', 'circulation', 'interior']),
    site: idsFor(['site', 'landscape', 'courtyard', 'water'])
  };
}

function put(cells, x, y, z, values, evidenceIds) {
  if (![x, y, z].every((value) => Number.isInteger(value) && value >= 0 && value < 64)) return;
  const key = `${x},${y},${z}`;
  const current = cells.get(key) || { x, y, z, envelope: 'none', space: 'outside', site: 'none', confidence: 1, evidence_ids: [] };
  cells.set(key, {
    ...current,
    ...values,
    evidence_ids: [...new Set([...current.evidence_ids, ...evidenceIds])].sort()
  });
}

function entrancePoint(bounds, frontSide) {
  const centerX = Math.floor((bounds.x0 + bounds.x1) / 2);
  const centerZ = Math.floor((bounds.z0 + bounds.z1) / 2);
  if (frontSide === 'north') return { x: centerX, z: bounds.z0 };
  if (frontSide === 'east') return { x: bounds.x1, z: centerZ };
  if (frontSide === 'west') return { x: bounds.x0, z: centerZ };
  return { x: centerX, z: bounds.z1 };
}

function pathToLotEdge(point, frontSide) {
  const points = [];
  if (frontSide === 'north') for (let z = point.z; z >= 0; z -= 1) points.push({ x: point.x, z });
  else if (frontSide === 'east') for (let x = point.x; x < 64; x += 1) points.push({ x, z: point.z });
  else if (frontSide === 'west') for (let x = point.x; x >= 0; x -= 1) points.push({ x, z: point.z });
  else for (let z = point.z; z < 64; z += 1) points.push({ x: point.x, z });
  return points;
}

function insetBox(bounds, width, depth) {
  const centerX = Math.floor((bounds.x0 + bounds.x1) / 2);
  const centerZ = Math.floor((bounds.z0 + bounds.z1) / 2);
  return {
    x0: centerX - Math.floor(width / 2),
    x1: centerX + Math.ceil(width / 2) - 1,
    z0: centerZ - Math.floor(depth / 2),
    z1: centerZ + Math.ceil(depth / 2) - 1
  };
}

function inside(x, z, box) {
  return Boolean(box) && x >= box.x0 && x <= box.x1 && z >= box.z0 && z <= box.z1;
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? Math.round(number) : fallback));
}
