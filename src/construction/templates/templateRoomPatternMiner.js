const ROOM_TYPE_ALIASES = {
  living_or_hall: 'living',
  great_hall: 'living',
  stairs_or_vertical_hall: 'entry_or_lobby'
};

export function mineRoomFurniturePatterns({ component = {}, signals = {}, typeHints = [] } = {}) {
  const points = Array.isArray(signals.signal_points) ? signals.signal_points : [];
  const counts = signals.interior_signals || {};
  const categoryCounts = signals.category_counts || {};
  const roomType = normalizeRoomType(typeHints[0]?.room_type || inferRoomTypeFromSignals(counts, component));
  const patterns = [];

  addSignalPattern(patterns, {
    pattern_type: 'sleep_niche',
    room_type: 'bedroom',
    condition: Number(counts.bed || 0) > 0,
    signals: ['bed', 'textile'],
    component,
    points,
    clauses: ['template-sleep-niche', 'bedroom-bedside-pair', 'bedroom-reading-light', 'bedroom-wardrobe-wall'],
    modules: ['decor_furniture', 'decor_storage', 'decor_light'],
    layout_intent: 'bed anchors a private wall or corner with nearby light and storage'
  });

  addSignalPattern(patterns, {
    pattern_type: 'kitchen_work_wall',
    room_type: 'kitchen',
    condition: Number(counts.kitchen_work || 0) > 0,
    signals: ['kitchen_work', 'storage', 'table_surface'],
    component,
    points,
    clauses: ['template-work-wall', 'kitchen-work-wall', 'kitchen-prep-counter', 'kitchen-pantry-wall', 'kitchen-task-light'],
    modules: ['decor_utility', 'decor_storage', 'decor_light'],
    layout_intent: 'cooking, prep, storage, and task lighting form a compact wall band'
  });

  addSignalPattern(patterns, {
    pattern_type: 'library_focus_wall',
    room_type: 'study',
    condition: Number(counts.books_library || 0) > 0,
    signals: ['books_library', 'display_object', 'table_surface'],
    component,
    points,
    clauses: ['template-library-wall', 'study-library-wall', 'study-desk-focus', 'study-reading-light', 'study-archive-storage'],
    modules: ['decor_furniture', 'decor_storage', 'decor_light'],
    layout_intent: 'books and desk/display objects create a readable study focal wall'
  });

  addSignalPattern(patterns, {
    pattern_type: 'storage_wall',
    room_type: roomType === 'bedroom' ? 'bedroom' : 'storage',
    condition: Number(counts.storage || 0) >= 2,
    signals: ['storage'],
    component,
    points,
    clauses: ['template-storage-wall', 'storage-shelving-wall', 'storage-barrel-stack', 'storage-clear-aisle'],
    modules: ['decor_storage', 'decor_light'],
    layout_intent: 'storage blocks repeat along an edge while preserving an access aisle'
  });

  addSignalPattern(patterns, {
    pattern_type: 'wet_wall',
    room_type: 'bathroom',
    condition: Number(counts.wet_fixture || 0) > 0,
    signals: ['wet_fixture', 'table_surface'],
    component,
    points,
    clauses: ['template-wet-wall', 'bathroom-wet-wall', 'bathroom-bath-mat', 'bathroom-mirror-light'],
    modules: ['decor_utility', 'decor_furniture', 'decor_floor', 'decor_light'],
    layout_intent: 'wet fixture and counter elements stay compact on one service edge'
  });

  addSignalPattern(patterns, {
    pattern_type: 'workshop_bench_wall',
    room_type: 'workshop',
    condition: Number(counts.workshop || 0) > 0,
    signals: ['workshop', 'storage', 'kitchen_work'],
    component,
    points,
    clauses: ['template-workbench-wall', 'workshop-workbench-wall', 'workshop-tool-rack', 'workshop-parts-storage', 'workshop-task-light'],
    modules: ['decor_utility', 'decor_storage', 'decor_light'],
    layout_intent: 'work blocks, tools, and parts storage cluster as a production wall'
  });

  addSignalPattern(patterns, {
    pattern_type: 'display_wall',
    room_type: roomType,
    condition: Number(counts.display_object || 0) + Number(counts.wall_art || 0) + Number(counts.ceremonial || 0) >= 2,
    signals: ['display_object', 'wall_art', 'ceremonial', 'books_library'],
    component,
    points,
    clauses: ['template-display-wall', 'template-focal-wall', 'universal-wall-depth-layer'],
    modules: ['decor_detail', 'decor_light'],
    layout_intent: 'display and ceremonial objects collect on a visible focal edge'
  });

  addSignalPattern(patterns, {
    pattern_type: 'social_cluster',
    room_type: roomType === 'corridor_or_gallery' ? 'living' : roomType,
    condition: Number(counts.seating_shape || 0) + Number(counts.table_surface || 0) >= 2 || (component.area >= 120 && ['living', 'living_or_hall', 'great_hall'].includes(roomType)),
    signals: ['seating_shape', 'table_surface', 'light_fixture'],
    component,
    points,
    clauses: ['template-conversation-cluster', 'living-conversation-cluster', 'living-rug-anchor', 'template-clear-center'],
    modules: ['decor_furniture', 'decor_floor', 'decor_light'],
    layout_intent: 'seating, table, rug, and light form a social island while center circulation remains legible'
  });

  addSignalPattern(patterns, {
    pattern_type: 'layered_lighting',
    room_type: roomType,
    condition: Number(counts.light_fixture || 0) >= 2 || Number(categoryCounts.light || 0) >= 2,
    signals: ['light_fixture'],
    component,
    points,
    clauses: ['template-lighting-layer', 'universal-three-layer-lighting'],
    modules: ['decor_light'],
    layout_intent: 'multiple lights mark task zones, corners, or room center rather than one bare lamp'
  });

  addSignalPattern(patterns, {
    pattern_type: 'plant_corner',
    room_type: roomType,
    condition: Number(counts.potted_plant || 0) > 0,
    signals: ['potted_plant'],
    component,
    points,
    clauses: ['template-plant-corner', 'template-garden-view-response', 'universal-window-view-response'],
    modules: ['decor_plant'],
    layout_intent: 'plants sit in corners or view edges as part of a garden/window response'
  });

  addSignalPattern(patterns, {
    pattern_type: 'circulation_spine',
    room_type: 'entry_or_lobby',
    condition: Number(counts.vertical_detail || 0) >= 2 || Number(categoryCounts.stair || 0) >= 3,
    signals: ['vertical_detail', 'seating_shape', 'light_fixture'],
    component,
    points,
    clauses: ['template-circulation-spine', 'circulation-wayfinding-light', 'circulation-threshold-marker', 'universal-clear-circulation'],
    modules: ['decor_light', 'decor_detail'],
    layout_intent: 'vertical or corridor elements get lighting and guard/detail markers without blocking movement'
  });

  return patterns
    .sort((a, b) => b.confidence - a.confidence || a.pattern_type.localeCompare(b.pattern_type))
    .slice(0, 8);
}

export function summarizeFurniturePatterns(groups = []) {
  const patternTypes = {};
  const roomTypes = {};
  const clauses = {};
  let highConfidence = 0;
  for (const group of groups || []) {
    patternTypes[group.pattern_type] = (patternTypes[group.pattern_type] || 0) + 1;
    roomTypes[group.room_type] = (roomTypes[group.room_type] || 0) + 1;
    if (Number(group.confidence || 0) >= 70) highConfidence += 1;
    for (const clause of group.clauses || []) clauses[clause] = (clauses[clause] || 0) + 1;
  }
  return {
    furniture_group_count: groups.length,
    high_confidence_furniture_group_count: highConfidence,
    pattern_type_counts: sortObject(patternTypes),
    room_type_counts: sortObject(roomTypes),
    clause_counts: sortObject(clauses),
    readiness: patternReadiness(groups, highConfidence)
  };
}

function addSignalPattern(patterns, {
  pattern_type,
  room_type,
  condition,
  signals,
  component,
  points,
  clauses,
  modules,
  layout_intent
}) {
  if (!condition) return;
  const matchedPoints = points.filter((point) => (point.signals || []).some((signal) => signals.includes(signal)));
  const anchor = inferAnchor(matchedPoints, component);
  const observedSignals = countSignals(matchedPoints, signals);
  const signalHits = Object.values(observedSignals).reduce((sum, count) => sum + count, 0);
  patterns.push({
    source: 'schematic-room-pattern-miner',
    pattern_type,
    room_type: normalizeRoomType(room_type),
    confidence: patternConfidence({ component, signalHits, matchedPoints }),
    anchor,
    layout_intent,
    observed_signals: observedSignals,
    observed_block_count: matchedPoints.length,
    clauses,
    modules,
    evidence: `${signalHits} signal hits, ${anchor.wall || 'center'} anchor, ${enclosureLabel(component)}`
  });
}

function patternConfidence({ component = {}, signalHits = 0, matchedPoints = [] }) {
  let score = 42;
  if (!component.touches_schematic_edge) score += 12;
  if (Number(component.wall_contact_ratio || 0) >= 0.35) score += 12;
  if (Number(component.ceiling_contact_ratio || 0) >= 0.12) score += 5;
  score += Math.min(24, signalHits * 4);
  if (matchedPoints.some((point) => point.wall)) score += 6;
  if (matchedPoints.some((point) => point.zone === 'corner')) score += 4;
  return clampScore(score);
}

function inferAnchor(points = [], component = {}) {
  if (!points.length) {
    return {
      zone: component.area >= 100 ? 'center_with_open_edges' : 'edge',
      wall: undefined,
      relation: component.area >= 100 ? 'clear-center' : 'inferred-edge'
    };
  }
  const wallCounts = {};
  const zoneCounts = {};
  for (const point of points) {
    if (point.wall) wallCounts[point.wall] = (wallCounts[point.wall] || 0) + 1;
    if (point.zone) zoneCounts[point.zone] = (zoneCounts[point.zone] || 0) + 1;
  }
  const wall = topKey(wallCounts);
  const zone = topKey(zoneCounts) || 'edge';
  return {
    zone,
    wall,
    relation: wall ? `${wall}-anchored` : zone
  };
}

export function signalPointForBlock({ block = {}, signals = [], x, y, z, bbox = {} }) {
  const wall = nearestWall({ x, z, bbox });
  return {
    block: block.name || block.state || block.key,
    category: block.category || 'other',
    signals,
    x,
    y,
    z,
    rel_x: relativePosition(x, bbox.min_x, bbox.max_x),
    rel_z: relativePosition(z, bbox.min_z, bbox.max_z),
    wall,
    zone: zoneForPoint({ x, z, bbox, wall })
  };
}

function nearestWall({ x, z, bbox = {} }) {
  const distances = [
    ['west', Math.abs(x - bbox.min_x)],
    ['east', Math.abs(x - bbox.max_x)],
    ['north', Math.abs(z - bbox.min_z)],
    ['south', Math.abs(z - bbox.max_z)]
  ].sort((a, b) => a[1] - b[1]);
  return distances[0]?.[1] <= 1 ? distances[0][0] : undefined;
}

function zoneForPoint({ x, z, bbox = {}, wall }) {
  const nearX = x <= bbox.min_x + 1 || x >= bbox.max_x - 1;
  const nearZ = z <= bbox.min_z + 1 || z >= bbox.max_z - 1;
  if (nearX && nearZ) return 'corner';
  if (wall) return 'wall';
  return 'center';
}

function relativePosition(value, min, max) {
  const span = Math.max(1, Number(max) - Number(min));
  return Math.round(((Number(value) - Number(min)) / span) * 100) / 100;
}

function countSignals(points, signalOrder = []) {
  const counts = {};
  for (const point of points) {
    for (const signal of point.signals || []) {
      if (signalOrder.length && !signalOrder.includes(signal)) continue;
      counts[signal] = (counts[signal] || 0) + 1;
    }
  }
  return sortObject(counts);
}

function inferRoomTypeFromSignals(counts = {}, component = {}) {
  if (Number(counts.bed || 0) > 0) return 'bedroom';
  if (Number(counts.kitchen_work || 0) > 0) return 'kitchen';
  if (Number(counts.books_library || 0) > 0) return 'study';
  if (Number(counts.wet_fixture || 0) > 0) return 'bathroom';
  if (Number(counts.storage || 0) >= 2) return 'storage';
  if (Number(counts.workshop || 0) > 0) return 'workshop';
  if (component.area >= 120) return 'living';
  return 'room';
}

function normalizeRoomType(roomType) {
  return ROOM_TYPE_ALIASES[roomType] || roomType || 'room';
}

function patternReadiness(groups, highConfidence) {
  if (highConfidence >= 8) return 'high';
  if (highConfidence >= 2 || groups.length >= 5) return 'medium';
  if (groups.length > 0) return 'low';
  return 'skip';
}

function enclosureLabel(component = {}) {
  if (!component.touches_schematic_edge && Number(component.wall_contact_ratio || 0) >= 0.35) return 'enclosed';
  if (!component.touches_schematic_edge) return 'partly-enclosed';
  return 'edge-adjacent';
}

function topKey(counts = {}) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

function sortObject(value = {}) {
  return Object.fromEntries(Object.entries(value).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
}
