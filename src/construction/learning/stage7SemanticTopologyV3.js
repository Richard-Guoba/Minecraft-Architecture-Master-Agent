import { chooseDominantEvidenceLabel } from './stage7SemanticEvidenceV3.js';

const NEIGHBOURS_6 = Object.freeze([
  [1, 0, 0], [-1, 0, 0], [0, 1, 0],
  [0, -1, 0], [0, 0, 1], [0, 0, -1]
]);
const HORIZONTAL_4 = Object.freeze([[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]);
const ENVELOPE_TIE_ORDER = Object.freeze(['roof', 'wall', 'floor', 'support', 'none']);
const SITE_TIE_ORDER = Object.freeze(['water', 'path', 'vegetation', 'ground', 'none']);

export function buildStage7SemanticTopologyV3({ evidence, transform, caseId } = {}) {
  const voxels = evidence?.voxels;
  if (!(voxels instanceof Map)) throw new Error('v3 topology requires evidence voxels');
  if (!Array.isArray(transform?.resolution) || transform.resolution.join(',') !== '64,64,64') {
    throw new Error('v3 topology requires a 64-cubed transform');
  }

  const classified = new Map();
  for (const [key, voxel] of voxels) {
    classified.set(key, classifyVoxel(voxel, caseId));
  }
  const solidComponents = components(
    classified,
    (cell) => cell.envelope !== 'none' && cell.site === 'none'
  );
  const primaryKeys = new Set(solidComponents[0] || []);
  const primaryBounds = boundsOfKeys(primaryKeys, classified);
  const interiorKeys = new Set([...classified.entries()]
    .filter(([, cell]) => cell.flags.includes('interior-air') && insideBounds(cell, primaryBounds))
    .map(([key]) => key));
  const floorLevels = acceptedFloorLevels(classified, primaryKeys, interiorKeys);
  const roofKeys = new Set([...classified.entries()]
    .filter(([key, cell]) => primaryKeys.has(key) && cell.envelope === 'roof')
    .map(([key]) => key));
  const openingKeys = findConfirmedOpenings(classified, primaryKeys, interiorKeys);
  const entranceKeys = findEntrances(classified, openingKeys, interiorKeys);
  const circulationKeys = entranceKeys.length
    ? findCirculationPath(classified, interiorKeys, entranceKeys)
    : [];
  const verticalCoreKeys = findVerticalCore(classified, primaryKeys, floorLevels);

  const openingSet = new Set(openingKeys);
  const entranceSet = new Set(entranceKeys);
  const circulationSet = new Set(circulationKeys);
  const verticalCoreSet = new Set(verticalCoreKeys);
  const cells = [...classified.values()].map((cell) => {
    const key = keyOf(cell);
    const space = entranceSet.has(key) ? 'circulation'
      : verticalCoreSet.has(key) ? 'vertical_circulation'
        : circulationSet.has(key) ? 'circulation'
          : interiorKeys.has(key) ? (cell.y <= median(floorLevels) ? 'public' : 'private')
            : 'outside';
    const envelope = verticalCoreSet.has(key) ? 'none'
      : openingSet.has(key) ? 'opening'
        : cell.envelope;
    return { ...stripEvidence(cell), envelope, space };
  }).filter(hasSemanticValue).sort(compareCells);

  return {
    cells,
    topology: {
      massing_component_count: solidComponents.length,
      primary_component_size: primaryKeys.size,
      opening_keys: [...openingKeys].sort(),
      entrance_keys: [...entranceKeys].sort(),
      circulation_keys: [...circulationKeys].sort(),
      vertical_core_keys: [...verticalCoreKeys].sort(),
      floor_levels: [...floorLevels].sort((left, right) => left - right),
      roof_vertical_overlap: verticalCoreKeys.filter((key) => roofKeys.has(key)).length
    },
    stats: summarize(cells, evidence.sourceSampleCount),
    warnings: []
  };
}

function classifyVoxel(voxel, caseId) {
  const flags = [...voxel.flags];
  const envelope = chooseEnvelope(voxel);
  const site = chooseSite(voxel.flag_counts);
  return {
    x: voxel.x,
    y: voxel.y,
    z: voxel.z,
    envelope: site === 'none' ? envelope : 'none',
    space: 'outside',
    site,
    confidence: 1,
    evidence_ids: [`source:${caseId}`],
    flags,
    flag_counts: voxel.flag_counts
  };
}

function chooseEnvelope(voxel) {
  const flags = voxel.flags;
  const counts = voxel.flag_counts || {};
  if (flags.includes('outside-air') || flags.includes('interior-air')) return 'none';
  const solid = counts.solid || 0;
  const roof = counts['exterior-above'] || 0;
  const wall = counts['exterior-side'] || 0;
  return chooseDominantEvidenceLabel({
    roof,
    wall,
    floor: Math.max(0, solid - Math.max(roof, wall)),
    support: counts['fence-candidate'] || 0,
    none: 0
  }, ENVELOPE_TIE_ORDER);
}

function chooseSite(flagCounts) {
  return chooseDominantEvidenceLabel(flagCounts, SITE_TIE_ORDER);
}

function components(cells, predicate) {
  const remaining = new Set([...cells.entries()]
    .filter(([, cell]) => predicate(cell))
    .map(([key]) => key));
  const result = [];
  for (const start of [...remaining].sort()) {
    if (!remaining.has(start)) continue;
    const queue = [start];
    const component = [];
    remaining.delete(start);
    for (let head = 0; head < queue.length; head += 1) {
      const key = queue[head];
      const cell = cells.get(key);
      component.push(key);
      for (const [dx, dy, dz] of NEIGHBOURS_6) {
        const next = `${cell.x + dx},${cell.y + dy},${cell.z + dz}`;
        if (remaining.delete(next)) queue.push(next);
      }
    }
    result.push(component.sort());
  }
  return result.sort((left, right) => (
    right.length - left.length || left[0].localeCompare(right[0])
  ));
}

function acceptedFloorLevels(cells, primaryKeys, interiorKeys) {
  const counts = new Map();
  for (const [key, cell] of cells) {
    if (!primaryKeys.has(key) || cell.envelope !== 'floor') continue;
    if (!interiorKeys.has(`${cell.x},${cell.y + 1},${cell.z}`)) continue;
    counts.set(cell.y, (counts.get(cell.y) || 0) + 1);
  }
  const levels = [...counts.entries()]
    .filter(([, count]) => count >= 4)
    .map(([y]) => y)
    .sort((left, right) => left - right);
  const bands = [];
  for (const level of levels) {
    const band = bands.at(-1);
    if (!band || level > band.at(-1) + 1) bands.push([level]);
    else band.push(level);
  }
  return bands.map((band) => band.at(-1));
}

function findConfirmedOpenings(cells, primaryKeys, interiorKeys) {
  const candidates = new Map([...cells.entries()].filter(([key, cell]) => (
    primaryKeys.has(key)
    && (cell.flags.includes('opening-candidate') || cell.flags.includes('window-candidate'))
  )));
  const confirmed = [];
  for (const component of components(candidates, () => true)) {
    const touchesOutside = component.some((key) => cells.get(key).flags.includes('exterior-side'));
    const touchesInside = component.some((key) => (
      neighbourKeys(cells.get(key)).some((next) => interiorKeys.has(next))
    ));
    if (touchesOutside && touchesInside) confirmed.push(...component);
  }
  return [...new Set(confirmed)].sort();
}

function findEntrances(cells, openingKeys, interiorKeys) {
  const accepted = new Set(openingKeys);
  const candidates = new Map([...cells.entries()]
    .filter(([key, cell]) => accepted.has(key) && cell.flags.includes('opening-candidate')));
  for (const component of components(candidates, () => true)) {
    const touchesOutside = component.some((key) => cells.get(key).flags.includes('exterior-side'));
    const touchesInside = component.some((key) => (
      neighbourKeys(cells.get(key)).some((next) => interiorKeys.has(next))
    ));
    if (touchesOutside && touchesInside) return component;
  }
  return [];
}

function findCirculationPath(cells, interiorKeys, entranceKeys) {
  const candidateSeeds = [];
  for (const key of entranceKeys) {
    for (const next of neighbourKeys(cells.get(key))) {
      if (interiorKeys.has(next)) candidateSeeds.push(next);
    }
  }
  if (!candidateSeeds.length) return [];
  const walkY = Math.min(...candidateSeeds.map((key) => cells.get(key).y));
  const seeds = [...new Set(candidateSeeds.filter((key) => cells.get(key).y === walkY))].sort();
  const visited = new Set(seeds);
  const queue = [...seeds];
  const distance = new Map(seeds.map((key) => [key, 0]));
  const previous = new Map();
  for (let head = 0; head < queue.length; head += 1) {
    const key = queue[head];
    const cell = cells.get(key);
    for (const [dx, dy, dz] of HORIZONTAL_4) {
      const next = `${cell.x + dx},${cell.y + dy},${cell.z + dz}`;
      if (!interiorKeys.has(next) || visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
      distance.set(next, distance.get(key) + 1);
      previous.set(next, key);
    }
  }
  let goal = seeds[0];
  for (const key of [...visited].sort()) {
    if (distance.get(key) > distance.get(goal)) goal = key;
  }
  const path = [goal];
  while (previous.has(path.at(-1))) path.push(previous.get(path.at(-1)));
  return path.sort();
}

function findVerticalCore(cells, primaryKeys, floorLevels) {
  if (floorLevels.length < 2) return [];
  const candidates = new Map([...cells.entries()].filter(([key, cell]) => (
    primaryKeys.has(key)
    && cell.envelope !== 'roof'
    && (cell.flags.includes('stair-candidate') || cell.flags.includes('ladder-candidate'))
  )));
  for (const component of components(candidates, () => true)) {
    const ys = component.map((key) => cells.get(key).y);
    if (Math.min(...ys) <= floorLevels[0] + 1
      && Math.max(...ys) >= floorLevels.at(-1) - 1) return component;
  }
  return [];
}

function boundsOfKeys(keys, cells) {
  if (!keys.size) return null;
  const result = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  };
  for (const key of keys) {
    const cell = cells.get(key);
    result.minX = Math.min(result.minX, cell.x);
    result.maxX = Math.max(result.maxX, cell.x);
    result.minY = Math.min(result.minY, cell.y);
    result.maxY = Math.max(result.maxY, cell.y);
    result.minZ = Math.min(result.minZ, cell.z);
    result.maxZ = Math.max(result.maxZ, cell.z);
  }
  return result;
}

function insideBounds(cell, bounds) {
  return Boolean(bounds)
    && cell.x >= bounds.minX && cell.x <= bounds.maxX
    && cell.y >= bounds.minY && cell.y <= bounds.maxY
    && cell.z >= bounds.minZ && cell.z <= bounds.maxZ;
}

function neighbourKeys(cell) {
  return NEIGHBOURS_6.map(([dx, dy, dz]) => `${cell.x + dx},${cell.y + dy},${cell.z + dz}`);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function stripEvidence(cell) {
  const { flags, flag_counts: flagCounts, ...canonical } = cell;
  void flags;
  void flagCounts;
  return canonical;
}

function hasSemanticValue(cell) {
  return cell.envelope !== 'none' || cell.space !== 'outside' || cell.site !== 'none';
}

function keyOf(cell) {
  return `${cell.x},${cell.y},${cell.z}`;
}

function compareCells(left, right) {
  return left.z - right.z || left.y - right.y || left.x - right.x;
}

function summarize(cells, sourceSampleCount) {
  const layer_counts = { envelope: {}, space: {}, site: {} };
  for (const cell of cells) {
    for (const layer of ['envelope', 'space', 'site']) {
      layer_counts[layer][cell[layer]] = (layer_counts[layer][cell[layer]] || 0) + 1;
    }
  }
  return {
    source_sample_count: sourceSampleCount,
    logical_cell_count: cells.length,
    layer_counts
  };
}
