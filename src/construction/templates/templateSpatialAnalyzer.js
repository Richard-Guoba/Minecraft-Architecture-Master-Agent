import { mineRoomFurniturePatterns, signalPointForBlock, summarizeFurniturePatterns } from './templateRoomPatternMiner.js';

const DEFAULT_MAX_VOLUME = 4_500_000;
const DEFAULT_MAX_FLOORS = 14;

export function analyzeSpatialLayout(schematic = {}, {
  blockAt,
  interiorSignalCategories = () => [],
  maxVolume = DEFAULT_MAX_VOLUME,
  maxFloors = DEFAULT_MAX_FLOORS
} = {}) {
  const width = Number(schematic.width || 0);
  const height = Number(schematic.height || 0);
  const length = Number(schematic.length || 0);
  const volume = width * height * length;
  if (!width || !height || !length || typeof blockAt !== 'function') {
    return skippedSpatial('missing schematic dimensions or block accessor', { width, height, length, volume });
  }
  if (volume > maxVolume) {
    return skippedSpatial('schematic exceeds spatial scan volume limit', { width, height, length, volume, max_volume: maxVolume });
  }

  const getBlock = (x, y, z) => {
    if (x < 0 || x >= width || y < 0 || y >= height || z < 0 || z >= length) return { air: true, category: 'air', name: 'minecraft:air', key: 'minecraft:air' };
    return blockAt(indexFor(width, length, x, y, z));
  };
  const layerStats = scanWalkableLayers({ width, height, length, getBlock });
  const selectedLevels = selectFloorLevels(layerStats, { width, length, maxFloors });
  const floors = [];
  const roomCandidates = [];

  for (const [floorIndex, layer] of selectedLevels.entries()) {
    const floor = analyzeFloorLayer({
      floorIndex,
      y: layer.y,
      width,
      height,
      length,
      getBlock,
      interiorSignalCategories
    });
    floors.push(floor);
    roomCandidates.push(...floor.room_candidates);
  }

  const roomAdjacencies = floors.flatMap((floor) => floor.room_adjacencies);
  const furnitureGroups = roomCandidates.flatMap((room) => room.furniture_groups || []);
  const furnitureSummary = summarizeFurniturePatterns(furnitureGroups);
  const verticalSignals = scanVerticalCirculation({ width, height, length, getBlock });
  const detectedRoomTypes = groupRoomTypes(roomCandidates);
  const highConfidenceRooms = roomCandidates.filter((item) => item.confidence >= 70);
  const warnings = spatialWarnings({ floors, roomCandidates, volume, selectedLevels });
  const segmentationConfidence = segmentationConfidenceFor({ floors, roomCandidates, highConfidenceRooms, warnings });

  return {
    status: 'analyzed',
    dimensions: { width, height, length, volume },
    scan_limits: { max_volume: maxVolume, max_floors: maxFloors },
    floor_count: floors.length,
    floor_candidates_scanned: layerStats.filter((item) => item.walkable_cells > 0).length,
    selected_floor_levels: floors.map((floor) => floor.y),
    floors,
    room_candidate_count: roomCandidates.length,
    high_confidence_room_count: highConfidenceRooms.length,
    room_adjacency_count: roomAdjacencies.length,
    room_adjacencies: roomAdjacencies.slice(0, 96),
    furniture_group_count: furnitureGroups.length,
    high_confidence_furniture_group_count: furnitureSummary.high_confidence_furniture_group_count,
    detected_furniture_patterns: furnitureSummary.pattern_type_counts,
    furniture_pattern_readiness: furnitureSummary.readiness,
    furniture_groups: furnitureGroups
      .sort((a, b) => b.confidence - a.confidence || a.pattern_type.localeCompare(b.pattern_type))
      .slice(0, 160),
    room_candidates: roomCandidates
      .sort((a, b) => b.confidence - a.confidence || b.area - a.area)
      .slice(0, 48),
    detected_room_types: detectedRoomTypes,
    vertical_circulation: verticalSignals,
    segmentation_confidence: segmentationConfidence,
    pattern_mining_readiness: patternMiningReadiness({ roomCandidates, highConfidenceRooms, segmentationConfidence }),
    warnings,
    notes: [
      'rooms are walkable-air components inferred from geometry, not copied from source metadata',
      'components touching schematic edges are treated as exterior unless strong interior/furnishing evidence exists',
      'phase 3 should mine furniture groups only from medium/high confidence room candidates'
    ]
  };
}

function skippedSpatial(reason, dimensions) {
  return {
    status: 'skipped',
    reason,
    dimensions,
    floor_count: 0,
    room_candidate_count: 0,
    high_confidence_room_count: 0,
    room_adjacency_count: 0,
    room_adjacencies: [],
    furniture_group_count: 0,
    high_confidence_furniture_group_count: 0,
    detected_furniture_patterns: {},
    furniture_pattern_readiness: 'skip',
    furniture_groups: [],
    room_candidates: [],
    detected_room_types: {},
    vertical_circulation: { stair_blocks: 0, ladder_or_opening_blocks: 0, likely_vertical_links: 0 },
    segmentation_confidence: 'none',
    pattern_mining_readiness: 'skip',
    warnings: [reason]
  };
}

function scanWalkableLayers({ width, height, length, getBlock }) {
  const footprint = width * length;
  const layers = [];
  for (let y = 1; y < height - 1; y += 1) {
    let walkable = 0;
    let edgeWalkable = 0;
    let support = 0;
    for (let z = 0; z < length; z += 1) {
      for (let x = 0; x < width; x += 1) {
        const below = getBlock(x, y - 1, z);
        if (!isSupportBlock(below)) continue;
        support += 1;
        if (!isPassableBlock(getBlock(x, y, z)) || !isPassableBlock(getBlock(x, y + 1, z))) continue;
        walkable += 1;
        if (x <= 1 || z <= 1 || x >= width - 2 || z >= length - 2) edgeWalkable += 1;
      }
    }
    layers.push({
      y,
      support_cells: support,
      walkable_cells: walkable,
      walkable_ratio: round(walkable / Math.max(1, footprint), 4),
      edge_walkable_ratio: round(edgeWalkable / Math.max(1, walkable), 4)
    });
  }
  return layers;
}

function selectFloorLevels(layers, { width, length, maxFloors }) {
  const footprint = width * length;
  const minWalkable = Math.max(12, Math.floor(footprint * 0.006));
  const peaks = layers
    .filter((layer) => layer.walkable_cells >= minWalkable)
    .filter((layer, index) => {
      const prev = layers[index - 1]?.walkable_cells || 0;
      const next = layers[index + 1]?.walkable_cells || 0;
      return layer.walkable_cells >= prev && layer.walkable_cells >= next;
    })
    .sort((a, b) => b.walkable_cells - a.walkable_cells);
  const selected = [];
  for (const peak of peaks) {
    if (selected.some((item) => Math.abs(item.y - peak.y) < 3)) continue;
    selected.push(peak);
    if (selected.length >= maxFloors) break;
  }
  return selected.sort((a, b) => a.y - b.y);
}

function analyzeFloorLayer({ floorIndex, y, width, height, length, getBlock, interiorSignalCategories }) {
  const area = width * length;
  const mask = new Uint8Array(area);
  const visited = new Uint8Array(area);
  let walkableCells = 0;
  for (let z = 0; z < length; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = z * width + x;
      if (isWalkableCell(getBlock, x, y, z)) {
        mask[idx] = 1;
        walkableCells += 1;
      }
    }
  }

  const components = [];
  for (let idx = 0; idx < area; idx += 1) {
    if (!mask[idx] || visited[idx]) continue;
    const component = floodWalkableComponent({
      start: idx,
      mask,
      visited,
      width,
      length,
      y,
      getBlock
    });
    if (component.area < 8) continue;
    const enriched = enrichComponent({
      component,
      floorIndex,
      y,
      width,
      height,
      length,
      getBlock,
      interiorSignalCategories
    });
    components.push(enriched);
  }

  const roomCandidates = components
    .filter((component) => component.room_candidate)
    .map((component, index) => ({
      id: `f${floorIndex}-r${index + 1}`,
      floor_index: floorIndex,
      y,
      area: component.area,
      bbox: component.bbox,
      aspect_ratio: component.aspect_ratio,
      touches_schematic_edge: component.touches_schematic_edge,
      wall_contact_ratio: component.wall_contact_ratio,
      ceiling_contact_ratio: component.ceiling_contact_ratio,
      confidence: component.confidence,
      type_hints: component.type_hints,
      type_scores: component.type_scores,
      furniture_group_count: component.furniture_groups.length,
      furniture_groups: component.furniture_groups,
      evidence: component.evidence
    }));
  const roomAdjacencies = inferRoomAdjacencies(roomCandidates);

  return {
    floor_index: floorIndex,
    y,
    walkable_cells: walkableCells,
    walkable_ratio: round(walkableCells / Math.max(1, area), 4),
    component_count: components.length,
    room_candidate_count: roomCandidates.length,
    high_confidence_room_count: roomCandidates.filter((item) => item.confidence >= 70).length,
    room_adjacency_count: roomAdjacencies.length,
    furniture_group_count: roomCandidates.reduce((sum, item) => sum + Number(item.furniture_group_count || 0), 0),
    room_adjacencies: roomAdjacencies,
    largest_components: components
      .sort((a, b) => b.area - a.area)
      .slice(0, 8)
      .map((item) => compactComponent(item)),
    room_candidates: roomCandidates
  };
}

function inferRoomAdjacencies(roomCandidates) {
  const adjacencies = [];
  for (let a = 0; a < roomCandidates.length; a += 1) {
    for (let b = a + 1; b < roomCandidates.length; b += 1) {
      const first = roomCandidates[a];
      const second = roomCandidates[b];
      const relation = adjacencyBetween(first, second);
      if (!relation) continue;
      adjacencies.push({
        room_a: first.id,
        room_b: second.id,
        floor_index: first.floor_index,
        y: first.y,
        relation: relation.relation,
        axis: relation.axis,
        gap: relation.gap,
        overlap: relation.overlap,
        confidence: relation.confidence,
        room_a_type: first.type_hints?.[0]?.room_type,
        room_b_type: second.type_hints?.[0]?.room_type
      });
    }
  }
  return adjacencies
    .sort((a, b) => b.confidence - a.confidence || b.overlap - a.overlap)
    .slice(0, 64);
}

function adjacencyBetween(first, second) {
  const a = first.bbox;
  const b = second.bbox;
  const xGap = intervalGap(a.min_x, a.max_x, b.min_x, b.max_x);
  const zGap = intervalGap(a.min_z, a.max_z, b.min_z, b.max_z);
  const xOverlap = intervalOverlap(a.min_x, a.max_x, b.min_x, b.max_x);
  const zOverlap = intervalOverlap(a.min_z, a.max_z, b.min_z, b.max_z);
  const aWidth = a.max_x - a.min_x + 1;
  const aDepth = a.max_z - a.min_z + 1;
  const bWidth = b.max_x - b.min_x + 1;
  const bDepth = b.max_z - b.min_z + 1;
  if (xGap >= 1 && xGap <= 2 && zOverlap >= Math.min(4, Math.min(aDepth, bDepth))) {
    return {
      relation: xGap === 1 ? 'shared_wall_or_partition' : 'nearby_rooms',
      axis: 'x',
      gap: xGap,
      overlap: zOverlap,
      confidence: clampScore(48 + zOverlap * 4 + Math.min(first.confidence, second.confidence) / 5)
    };
  }
  if (zGap >= 1 && zGap <= 2 && xOverlap >= Math.min(4, Math.min(aWidth, bWidth))) {
    return {
      relation: zGap === 1 ? 'shared_wall_or_partition' : 'nearby_rooms',
      axis: 'z',
      gap: zGap,
      overlap: xOverlap,
      confidence: clampScore(48 + xOverlap * 4 + Math.min(first.confidence, second.confidence) / 5)
    };
  }
  return undefined;
}

function intervalGap(aMin, aMax, bMin, bMax) {
  if (aMax < bMin) return bMin - aMax - 1;
  if (bMax < aMin) return aMin - bMax - 1;
  return 0;
}

function intervalOverlap(aMin, aMax, bMin, bMax) {
  return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin) + 1);
}

function isWalkableCell(getBlock, x, y, z) {
  return isSupportBlock(getBlock(x, y - 1, z)) &&
    isPassableBlock(getBlock(x, y, z)) &&
    isPassableBlock(getBlock(x, y + 1, z));
}

function floodWalkableComponent({ start, mask, visited, width, length, y, getBlock }) {
  const stack = [start];
  visited[start] = 1;
  let head = 0;
  let area = 0;
  let edgeCells = 0;
  let wallContacts = 0;
  let openContacts = 0;
  let ceilingChecks = 0;
  let ceilingHits = 0;
  let minX = width;
  let maxX = -1;
  let minZ = length;
  let maxZ = -1;

  while (head < stack.length) {
    const idx = stack[head];
    head += 1;
    const x = idx % width;
    const z = Math.floor(idx / width);
    area += 1;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    if (x <= 1 || z <= 1 || x >= width - 2 || z >= length - 2) edgeCells += 1;

    const ceiling = getBlock(x, Math.min(y + 3, y + 2), z);
    ceilingChecks += 1;
    if (!isPassableBlock(ceiling)) ceilingHits += 1;

    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nx >= width || nz < 0 || nz >= length) {
        openContacts += 1;
        continue;
      }
      const nIdx = nz * width + nx;
      if (mask[nIdx]) {
        if (!visited[nIdx]) {
          visited[nIdx] = 1;
          stack.push(nIdx);
        }
        continue;
      }
      if (isBlockingAtBody(getBlock, nx, y, nz)) wallContacts += 1;
      else openContacts += 1;
    }
  }

  return {
    area,
    bbox: { min_x: minX, max_x: maxX, min_z: minZ, max_z: maxZ },
    touches_schematic_edge: edgeCells > 0,
    edge_cell_ratio: round(edgeCells / Math.max(1, area), 4),
    wall_contact_ratio: round(wallContacts / Math.max(1, wallContacts + openContacts), 4),
    ceiling_contact_ratio: round(ceilingHits / Math.max(1, ceilingChecks), 4)
  };
}

function enrichComponent({ component, floorIndex, y, width, height, length, getBlock, interiorSignalCategories }) {
  const bbox = component.bbox;
  const signals = scanSignalsNearComponent({
    bbox,
    y,
    width,
    height,
    length,
    getBlock,
    interiorSignalCategories
  });
  const typeScores = roomTypeScores(component, signals);
  const typeHints = Object.entries(typeScores)
    .filter(([, score]) => score >= 35)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([room_type, score]) => ({ room_type, score }));
  const confidence = roomConfidence(component, signals, typeHints);
  const roomCandidate = confidence >= 42 && component.area >= 10;
  const furnitureGroups = mineRoomFurniturePatterns({ component, signals, typeHints });

  return {
    ...component,
    floor_index: floorIndex,
    y,
    width: bbox.max_x - bbox.min_x + 1,
    depth: bbox.max_z - bbox.min_z + 1,
    aspect_ratio: aspectRatio(bbox),
    confidence,
    type_hints: typeHints,
    type_scores: typeScores,
    furniture_groups: furnitureGroups,
    room_candidate: roomCandidate,
    evidence: {
      interior_signal_hits: signals.total_interior_signal_hits,
      dominant_signals: dominantSignals(signals.interior_signals),
      decor_blocks: signals.category_counts.decor || 0,
      light_blocks: signals.category_counts.light || 0,
      glass_blocks: signals.category_counts.glass || 0,
      opening_blocks: signals.category_counts.opening || 0,
      stair_blocks: signals.category_counts.stair || 0,
      furniture_group_count: furnitureGroups.length,
      dominant_patterns: furnitureGroups.slice(0, 4).map((group) => ({ pattern_type: group.pattern_type, confidence: group.confidence })),
      enclosure: enclosureLabel(component)
    }
  };
}

function scanSignalsNearComponent({ bbox, y, width, height, length, getBlock, interiorSignalCategories }) {
  const categoryCounts = {};
  const interiorSignals = {};
  const signalPoints = [];
  let totalInteriorSignalHits = 0;
  const minX = clampInt(bbox.min_x - 1, 0, width - 1);
  const maxX = clampInt(bbox.max_x + 1, 0, width - 1);
  const minZ = clampInt(bbox.min_z - 1, 0, length - 1);
  const maxZ = clampInt(bbox.max_z + 1, 0, length - 1);
  const minY = clampInt(y - 1, 0, height - 1);
  const maxY = clampInt(y + 3, 0, height - 1);
  for (let yy = minY; yy <= maxY; yy += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const block = getBlock(x, yy, z);
        if (block.air) continue;
        const category = block.category || 'other';
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        const signals = interiorSignalCategories(block);
        if (signals.length && signalPoints.length < 240) signalPoints.push(signalPointForBlock({ block, signals, x, y: yy, z, bbox }));
        for (const signal of signals) {
          interiorSignals[signal] = (interiorSignals[signal] || 0) + 1;
          totalInteriorSignalHits += 1;
        }
      }
    }
  }
  return { category_counts: categoryCounts, interior_signals: interiorSignals, signal_points: signalPoints, total_interior_signal_hits: totalInteriorSignalHits };
}

function roomTypeScores(component, signals) {
  const area = component.area;
  const aspect = aspectRatio(component.bbox);
  const counts = signals.interior_signals;
  const categories = signals.category_counts;
  const scores = {};
  if ((counts.bed || 0) > 0) scores.bedroom = clampScore(65 + counts.bed * 10);
  if ((counts.kitchen_work || 0) > 0) scores.kitchen = clampScore(62 + counts.kitchen_work * 9);
  if ((counts.books_library || 0) > 0) scores.study = clampScore(62 + counts.books_library * 8);
  if ((counts.wet_fixture || 0) > 0 && area <= 90) scores.bathroom = clampScore(56 + counts.wet_fixture * 12);
  if ((counts.storage || 0) >= 2) scores.storage = clampScore(42 + counts.storage * 5);
  if ((counts.workshop || 0) > 0) scores.workshop = clampScore(54 + counts.workshop * 10);
  if ((counts.ceremonial || 0) >= 2) scores.chapel_or_ceremonial_hall = clampScore(48 + counts.ceremonial * 5);
  if ((categories.stair || 0) >= 3) scores.stairs_or_vertical_hall = clampScore(52 + categories.stair * 4);
  if (area >= 48 && ((counts.seating_shape || 0) > 0 || (counts.table_surface || 0) > 1 || (counts.display_object || 0) > 0 || (categories.light || 0) > 0)) {
    scores.living_or_hall = clampScore(45 + Math.min(25, area / 8) + Math.min(20, signals.total_interior_signal_hits));
  }
  if (aspect >= 4 && area <= 110) scores.corridor_or_gallery = clampScore(44 + Math.min(24, aspect * 4));
  if (area >= 160 && component.wall_contact_ratio > 0.2) scores.great_hall = clampScore(50 + Math.min(28, area / 20));
  return scores;
}

function roomConfidence(component, signals, typeHints) {
  let score = 18;
  if (!component.touches_schematic_edge) score += 22;
  if (component.wall_contact_ratio >= 0.35) score += 22;
  else if (component.wall_contact_ratio >= 0.22) score += 12;
  if (component.ceiling_contact_ratio >= 0.12) score += 8;
  if (component.area >= 24) score += 8;
  if (component.area >= 80) score += 6;
  if (signals.total_interior_signal_hits > 0) score += Math.min(18, signals.total_interior_signal_hits * 2);
  if (typeHints.length) score += Math.min(16, typeHints[0].score / 6);
  if (component.edge_cell_ratio > 0.08 && signals.total_interior_signal_hits < 3) score -= 22;
  if (component.area > 2200 && signals.total_interior_signal_hits < 6) score -= 14;
  return clampScore(score);
}

function scanVerticalCirculation({ width, height, length, getBlock }) {
  let stairBlocks = 0;
  let ladderOrOpeningBlocks = 0;
  const columns = new Map();
  for (let y = 0; y < height; y += 1) {
    for (let z = 0; z < length; z += 1) {
      for (let x = 0; x < width; x += 1) {
        const block = getBlock(x, y, z);
        if (block.air) continue;
        const name = blockName(block);
        const vertical = /stairs?$/.test(name) || /ladder|scaffold|chain|vine|water/.test(name);
        if (!vertical) continue;
        if (/stairs?$/.test(name)) stairBlocks += 1;
        if (/ladder|scaffold|chain|vine|water/.test(name)) ladderOrOpeningBlocks += 1;
        const key = `${x},${z}`;
        if (!columns.has(key)) columns.set(key, []);
        columns.get(key).push(y);
      }
    }
  }
  const linkedColumns = [...columns.values()].filter((ys) => {
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    return max - min >= 3 || ys.length >= 4;
  }).length;
  return {
    stair_blocks: stairBlocks,
    ladder_or_opening_blocks: ladderOrOpeningBlocks,
    likely_vertical_links: linkedColumns,
    vertical_signal: linkedColumns > 0 || stairBlocks > 8 ? 'present' : stairBlocks > 0 ? 'weak' : 'none'
  };
}

function groupRoomTypes(roomCandidates) {
  const counts = {};
  for (const room of roomCandidates) {
    const top = room.type_hints?.[0]?.room_type;
    if (!top) continue;
    counts[top] = (counts[top] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function spatialWarnings({ floors, roomCandidates, volume, selectedLevels }) {
  const warnings = [];
  if (!selectedLevels.length) warnings.push('no-walkable-floor-level-detected');
  if (!roomCandidates.length) warnings.push('no-room-air-components-detected');
  if (floors.length > 10) warnings.push('many-floor-levels-detected-review-scale');
  if (volume > 2_500_000) warnings.push('large-template-spatial-analysis-may-be-coarse');
  const exteriorLike = roomCandidates.filter((room) => room.touches_schematic_edge && room.confidence < 65).length;
  if (exteriorLike > roomCandidates.length * 0.5 && roomCandidates.length > 4) warnings.push('many-components-touch-exterior-edge');
  return warnings;
}

function segmentationConfidenceFor({ floors, roomCandidates, highConfidenceRooms, warnings }) {
  if (!floors.length || warnings.includes('no-room-air-components-detected')) return 'none';
  if (highConfidenceRooms.length >= 5 && floors.length >= 1) return 'high';
  if (highConfidenceRooms.length >= 2 || roomCandidates.length >= 4) return 'medium';
  return 'low';
}

function patternMiningReadiness({ roomCandidates, highConfidenceRooms, segmentationConfidence }) {
  if (segmentationConfidence === 'high' && highConfidenceRooms.length >= 4) return 'high';
  if (['high', 'medium'].includes(segmentationConfidence) && roomCandidates.length >= 2) return 'medium';
  if (roomCandidates.length > 0) return 'low';
  return 'skip';
}

function compactComponent(component) {
  return {
    area: component.area,
    bbox: component.bbox,
    confidence: component.confidence,
    room_candidate: component.room_candidate,
    touches_schematic_edge: component.touches_schematic_edge,
    wall_contact_ratio: component.wall_contact_ratio,
    type_hints: component.type_hints?.slice(0, 3) || [],
    furniture_groups: component.furniture_groups?.slice(0, 3).map((group) => ({
      pattern_type: group.pattern_type,
      confidence: group.confidence,
      anchor: group.anchor
    })) || []
  };
}

function isSupportBlock(block = {}) {
  if (block.air) return false;
  const category = block.category || '';
  const name = blockName(block);
  if (['air', 'water', 'vegetation', 'light', 'opening'].includes(category)) return false;
  if (/(torch|lantern|candle|flower_pot|potted_|carpet|pressure_plate|button|ladder|rail|vine|chain|pane|bars)$/.test(name)) return false;
  return true;
}

function isPassableBlock(block = {}) {
  if (block.air) return true;
  const name = blockName(block);
  const category = block.category || '';
  if (category === 'light') return true;
  if (/(torch|lantern|candle|flower_pot|potted_|carpet|pressure_plate|button|tripwire|lever|sign|banner|painting|item_frame|skull|head)/.test(name)) return true;
  return false;
}

function isBlockingAtBody(getBlock, x, y, z) {
  return !isPassableBlock(getBlock(x, y, z)) || !isPassableBlock(getBlock(x, y + 1, z));
}

function enclosureLabel(component) {
  if (!component.touches_schematic_edge && component.wall_contact_ratio >= 0.35) return 'enclosed';
  if (!component.touches_schematic_edge && component.wall_contact_ratio >= 0.2) return 'partly-enclosed';
  if (component.touches_schematic_edge) return 'edge/exterior-adjacent';
  return 'open';
}

function dominantSignals(counts = {}) {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([signal, count]) => ({ signal, count }));
}

function aspectRatio(bbox) {
  const width = bbox.max_x - bbox.min_x + 1;
  const depth = bbox.max_z - bbox.min_z + 1;
  return round(Math.max(width, depth) / Math.max(1, Math.min(width, depth)), 3);
}

function blockName(block = {}) {
  return String(block.name || block.state || block.key || '').replace(/^minecraft:/, '').replace(/\[.*\]$/, '');
}

function indexFor(width, length, x, y, z) {
  return y * length * width + z * width + x;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
}

function clampInt(value, min, max) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function round(value, places = 3) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}
