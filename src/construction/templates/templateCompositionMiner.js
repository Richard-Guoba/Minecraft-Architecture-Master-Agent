const ARCHITECTURAL_CATEGORIES = new Set(['rock', 'wood', 'glass', 'light', 'fence', 'stair', 'slab', 'opening', 'decor', 'other']);
const SITE_CATEGORIES = new Set(['earth', 'vegetation', 'water']);

export function analyzeTemplateComposition(schematic = {}, {
  blockAt,
  analysis = {},
  text = '',
  styleFamily = 'general',
  typology = 'building',
  tags = []
} = {}) {
  const width = Number(schematic.width || 0);
  const height = Number(schematic.height || 0);
  const length = Number(schematic.length || 0);
  if (!width || !height || !length || typeof blockAt !== 'function') {
    return skippedComposition('missing schematic dimensions or block accessor');
  }

  const architecturalColumns = new Map();
  const siteColumns = new Map();
  const waterColumns = new Set();
  const vegetationColumns = new Set();
  const layerCounts = Array.from({ length: height }, () => 0);
  let architecturalBlocks = 0;
  let siteBlocks = 0;
  let glassBlocks = 0;
  let stairSlabBlocks = 0;
  let fenceBlocks = 0;
  let lightBlocks = 0;
  let decorBlocks = 0;

  for (let y = 0; y < height; y += 1) {
    for (let z = 0; z < length; z += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * length * width + z * width + x;
        const block = blockAt(index);
        if (!block || block.air) continue;
        const category = String(block.category || 'other');
        const key = `${x},${z}`;
        if (ARCHITECTURAL_CATEGORIES.has(category)) {
          architecturalBlocks += 1;
          layerCounts[y] += 1;
          const current = architecturalColumns.get(key);
          if (!current) architecturalColumns.set(key, { x, z, min_y: y, max_y: y, count: 1 });
          else {
            current.min_y = Math.min(current.min_y, y);
            current.max_y = Math.max(current.max_y, y);
            current.count += 1;
          }
          if (category === 'glass') glassBlocks += 1;
          if (category === 'stair' || category === 'slab') stairSlabBlocks += 1;
          if (category === 'fence') fenceBlocks += 1;
          if (category === 'light') lightBlocks += 1;
          if (category === 'decor') decorBlocks += 1;
        } else if (SITE_CATEGORIES.has(category)) {
          siteBlocks += 1;
          const current = siteColumns.get(key);
          if (!current) siteColumns.set(key, { x, z, min_y: y, max_y: y, count: 1, categories: { [category]: 1 } });
          else {
            current.min_y = Math.min(current.min_y, y);
            current.max_y = Math.max(current.max_y, y);
            current.count += 1;
            current.categories[category] = (current.categories[category] || 0) + 1;
          }
          if (category === 'water') waterColumns.add(key);
          if (category === 'vegetation') vegetationColumns.add(key);
        }
      }
    }
  }

  if (!architecturalColumns.size) return skippedComposition('no architectural massing columns detected');

  const architecturalBounds = boundsForColumns([...architecturalColumns.values()]);
  const siteBounds = siteColumns.size ? boundsForColumns([...siteColumns.values()]) : undefined;
  const spanWidth = architecturalBounds.max_x - architecturalBounds.min_x + 1;
  const spanLength = architecturalBounds.max_z - architecturalBounds.min_z + 1;
  const spanArea = Math.max(1, spanWidth * spanLength);
  const occupiedRatio = round(architecturalColumns.size / spanArea);
  const aspectRatio = round(Math.max(spanWidth, spanLength) / Math.max(1, Math.min(spanWidth, spanLength)));
  const complexity = footprintComplexity(architecturalColumns, architecturalBounds);
  const heightStats = columnHeightStats([...architecturalColumns.values()]);
  const layerStats = verticalLayerStats(layerCounts);
  const projections = projectionStats(architecturalColumns, architecturalBounds);
  const siteMetrics = siteCompositionMetrics({ siteColumns, waterColumns, vegetationColumns, architecturalBounds, siteBounds, analysis });
  const context = {
    text: String(text || '').toLowerCase(),
    styleFamily: String(styleFamily || 'general'),
    typology: String(typology || 'building'),
    tags: new Set(tags || []),
    analysis,
    architecturalBlocks,
    siteBlocks,
    glassRatio: round(glassBlocks / Math.max(1, architecturalBlocks)),
    stairSlabRatio: round(stairSlabBlocks / Math.max(1, architecturalBlocks)),
    fenceRatio: round(fenceBlocks / Math.max(1, architecturalBlocks)),
    lightRatio: round(lightBlocks / Math.max(1, architecturalBlocks)),
    decorRatio: round(decorBlocks / Math.max(1, architecturalBlocks)),
    architecturalBounds,
    siteBounds,
    spanWidth,
    spanLength,
    aspectRatio,
    occupiedRatio,
    complexity,
    heightStats,
    layerStats,
    projections,
    siteMetrics
  };

  const massingPatterns = massingPatternEvidence(context);
  const approachSequence = approachSequenceEvidence(context);
  const facadeRhythm = facadeRhythmEvidence(context);
  const roofComposition = roofCompositionEvidence(context);
  const siteComposition = siteCompositionEvidence(context);
  const viewRules = viewAndLandmarkEvidence(context);
  const readinessScore = compositionReadinessScore({
    massingPatterns,
    approachSequence,
    facadeRhythm,
    roofComposition,
    siteComposition,
    viewRules,
    context
  });

  return {
    source: 'template-composition-miner-v1',
    status: 'analyzed',
    readiness: readinessBucket(readinessScore),
    score: readinessScore,
    metrics: {
      architectural_columns: architecturalColumns.size,
      architectural_blocks: architecturalBlocks,
      site_columns: siteColumns.size,
      site_blocks: siteBlocks,
      architectural_bounds: architecturalBounds,
      site_bounds: siteBounds,
      footprint: {
        span_width: spanWidth,
        span_length: spanLength,
        aspect_ratio: aspectRatio,
        occupied_ratio: occupiedRatio,
        center_void_ratio: complexity.center_void_ratio,
        edge_articulation: complexity.edge_articulation,
        quadrant_balance: complexity.quadrant_balance
      },
      height: heightStats,
      layers: layerStats,
      facade_material_ratios: {
        glass: context.glassRatio,
        stair_slab: context.stairSlabRatio,
        fence: context.fenceRatio,
        light: context.lightRatio,
        decor: context.decorRatio
      },
      site: siteMetrics
    },
    massing_patterns: massingPatterns,
    approach_sequence: approachSequence,
    facade_rhythm: facadeRhythm,
    roof_composition: roofComposition,
    site_composition: siteComposition,
    view_and_landmark_rules: viewRules,
    transfer_rules: transferRulesFor({ massingPatterns, approachSequence, facadeRhythm, roofComposition, siteComposition, viewRules })
  };
}

function skippedComposition(reason) {
  return {
    source: 'template-composition-miner-v1',
    status: 'skipped',
    reason,
    readiness: 'skip',
    score: 0,
    metrics: {},
    massing_patterns: [],
    approach_sequence: [],
    facade_rhythm: [],
    roof_composition: [],
    site_composition: [],
    view_and_landmark_rules: [],
    transfer_rules: []
  };
}

function massingPatternEvidence(ctx) {
  const result = [];
  const vertical = ctx.heightStats.max_height >= Math.max(ctx.spanWidth, ctx.spanLength) * 0.75 || ctx.layerStats.tower_like || ctx.tags.has('vertical-icon');
  addEvidence(result, 'vertical_landmark', vertical, confidence(70, ctx.heightStats.max_height / Math.max(1, Math.max(ctx.spanWidth, ctx.spanLength)) * 20), 'strong vertical silhouette or tower-like layer profile');
  addEvidence(result, 'long_bar', ctx.aspectRatio >= 1.7, confidence(62, (ctx.aspectRatio - 1.4) * 20), 'elongated footprint span');
  addEvidence(result, 'compact_block', ctx.aspectRatio < 1.45 && ctx.occupiedRatio >= 0.56, confidence(58, ctx.occupiedRatio * 30), 'compact high-occupancy footprint');
  addEvidence(result, 'courtyard_or_void', ctx.complexity.center_void_ratio >= 0.22 && ctx.occupiedRatio < 0.72, confidence(60, ctx.complexity.center_void_ratio * 80), 'central void or courtyard-like footprint');
  addEvidence(result, 'asymmetric_wings', ctx.complexity.quadrant_balance === 'asymmetric' || ctx.projections.side_bias !== 'balanced', confidence(58, ctx.complexity.edge_articulation * 28), 'side-biased or winged footprint massing');
  addEvidence(result, 'balanced_axis', ctx.tags.has('formal-axis') || ctx.complexity.quadrant_balance === 'balanced', ctx.tags.has('formal-axis') ? 82 : 62, 'balanced footprint or formal-axis metadata');
  addEvidence(result, 'stepped_terraces', ctx.layerStats.step_changes >= 4 || ctx.heightStats.height_stddev >= 4, confidence(60, ctx.layerStats.step_changes * 5), 'stepped vertical occupancy changes');
  addEvidence(result, 'terrain_plinth', ctx.siteMetrics.terrain_integrated, confidence(64, ctx.siteMetrics.terrain_range * 1.2), 'building mass sits with terrain or plinth evidence');
  addEvidence(result, 'waterfront_deck_massing', ctx.siteMetrics.water_edge, confidence(62, ctx.siteMetrics.water_proximity * 40), 'water or waterfront edge participates in massing');
  return sortEvidence(result, 8);
}

function approachSequenceEvidence(ctx) {
  const result = [];
  addEvidence(result, 'garden_forecourt', ctx.siteMetrics.garden_signal !== 'none' || ctx.tags.has('landscape-composition'), 78, 'foreground garden or landscape composition frames arrival');
  addEvidence(result, 'waterfront_transition', ctx.siteMetrics.water_edge, confidence(66, ctx.siteMetrics.water_proximity * 36), 'water edge creates transition before or beside building');
  addEvidence(result, 'stepped_terrain_arrival', ctx.siteMetrics.terrain_integrated && ctx.siteMetrics.terrain_range >= 4, confidence(64, ctx.siteMetrics.terrain_range), 'non-flat terrain implies stepped approach');
  addEvidence(result, 'central_axis_entry', ctx.tags.has('formal-axis') || ctx.complexity.quadrant_balance === 'balanced', ctx.tags.has('formal-axis') ? 82 : 60, 'formal or balanced arrival axis');
  addEvidence(result, 'landmark_reveal', ctx.heightStats.max_height >= Math.max(ctx.spanWidth, ctx.spanLength) * 0.75 || ctx.tags.has('vertical-icon'), 74, 'approach should reveal a vertical landmark');
  addEvidence(result, 'porch_or_threshold_layer', ctx.fenceRatio > 0.015 || ctx.stairSlabRatio > 0.04, confidence(58, (ctx.fenceRatio + ctx.stairSlabRatio) * 420), 'small blocks indicate threshold rails, steps, or porch detailing');
  return sortEvidence(result, 7);
}

function facadeRhythmEvidence(ctx) {
  const result = [];
  addEvidence(result, 'large_glass_bands', ctx.glassRatio >= 0.06 || ctx.tags.has('glass-emphasis') || ctx.tags.has('large-glass-or-panel-grid'), confidence(65, ctx.glassRatio * 180), 'high glass ratio or panel-grid metadata');
  addEvidence(result, 'micro_depth_trim', ctx.stairSlabRatio >= 0.045 || ctx.tags.has('micro-block-detailing'), confidence(62, ctx.stairSlabRatio * 180), 'stair/slab density creates facade depth');
  addEvidence(result, 'rail_balcony_edges', ctx.fenceRatio >= 0.015 || ctx.tags.has('rail-and-fence-detail'), confidence(60, ctx.fenceRatio * 220), 'fence/rail blocks define balcony or edge rhythm');
  addEvidence(result, 'formal_symmetry', ctx.tags.has('formal-axis') || ctx.complexity.quadrant_balance === 'balanced', ctx.tags.has('formal-axis') ? 82 : 58, 'formal facade symmetry cue');
  addEvidence(result, 'vertical_slots', ctx.heightStats.max_height > Math.max(ctx.spanWidth, ctx.spanLength) * 0.65 && ctx.glassRatio < 0.08, 64, 'tall massing with restrained openings');
  addEvidence(result, 'lit_depth_points', ctx.lightRatio > 0.018, confidence(56, ctx.lightRatio * 240), 'lighting blocks form facade points');
  return sortEvidence(result, 7);
}

function roofCompositionEvidence(ctx) {
  const result = [];
  addEvidence(result, 'flat_terrace_or_platform', /modern|futuristic|coastal/.test(ctx.styleFamily) && ctx.layerStats.top_plateau_ratio >= 0.18, confidence(56, ctx.layerStats.top_plateau_ratio * 80), 'modern/coastal mass with usable top plateau');
  addEvidence(result, 'layered_eaves', ctx.tags.has('layered-eaves') || ctx.stairSlabRatio >= 0.12, ctx.tags.has('layered-eaves') ? 86 : confidence(60, ctx.stairSlabRatio * 140), 'layered eave or high stair/slab roof detail');
  addEvidence(result, 'tower_cap', ctx.heightStats.max_height >= Math.max(ctx.spanWidth, ctx.spanLength) * 0.75 || ctx.layerStats.tower_like, 76, 'vertical landmark needs a cap or crown');
  addEvidence(result, 'stepped_roofline', ctx.layerStats.step_changes >= 4, confidence(60, ctx.layerStats.step_changes * 5), 'roofline changes across vertical layers');
  addEvidence(result, 'deep_overhang_edges', ctx.fenceRatio > 0.025 || ctx.stairSlabRatio > 0.08, confidence(54, (ctx.fenceRatio + ctx.stairSlabRatio) * 180), 'edge detail supports pronounced roof or terrace edges');
  return sortEvidence(result, 6);
}

function siteCompositionEvidence(ctx) {
  const result = [];
  addEvidence(result, 'layered_terrain_base', ctx.siteMetrics.terrain_integrated, confidence(68, ctx.siteMetrics.terrain_range * 1.4), 'terrain is integrated with building composition');
  addEvidence(result, 'rock_earth_plinth', ctx.siteMetrics.natural_ratio >= 0.08 || ctx.tags.has('terrain-integrated'), confidence(60, ctx.siteMetrics.natural_ratio * 90), 'earth or rock base surrounds the building');
  addEvidence(result, 'garden_rooms', ctx.siteMetrics.garden_signal !== 'none' || ctx.tags.has('landscape-composition'), 78, 'vegetation/garden signal forms outdoor rooms');
  addEvidence(result, 'water_edge', ctx.siteMetrics.water_edge, confidence(66, ctx.siteMetrics.water_proximity * 36), 'water edge is close enough to shape the site');
  addEvidence(result, 'tree_shrub_clusters', ctx.siteMetrics.vegetation_ratio >= 0.02, confidence(56, ctx.siteMetrics.vegetation_ratio * 260), 'vegetation columns support tree/shrub cluster transfer');
  addEvidence(result, 'foreground_scene', ctx.siteMetrics.site_to_building_ratio >= 0.35, confidence(56, ctx.siteMetrics.site_to_building_ratio * 45), 'site footprint is large relative to building footprint');
  return sortEvidence(result, 8);
}

function viewAndLandmarkEvidence(ctx) {
  const result = [];
  addEvidence(result, 'orient_public_rooms_to_view', ctx.siteMetrics.water_edge || ctx.glassRatio >= 0.06 || /lake|beach|water|湖|海|水/.test(ctx.text), ctx.siteMetrics.water_edge ? 78 : 64, 'views should drive public-room glass and terraces');
  addEvidence(result, 'make_entry_reveal_landmark', ctx.heightStats.max_height >= Math.max(ctx.spanWidth, ctx.spanLength) * 0.75 || ctx.tags.has('vertical-icon'), 74, 'entry path should reveal vertical silhouette');
  addEvidence(result, 'keep_center_clear_for_courtyard', ctx.complexity.center_void_ratio >= 0.22, 70, 'central void should remain readable');
  addEvidence(result, 'frame_foreground_before_facade', ctx.siteMetrics.garden_signal !== 'none' || ctx.siteMetrics.site_to_building_ratio >= 0.35, 68, 'foreground scene should precede wall plane');
  addEvidence(result, 'use_edge_decks_or_balconies', ctx.siteMetrics.water_edge || ctx.fenceRatio >= 0.015, 66, 'edge rails/waterfront support decks or balconies');
  return sortEvidence(result, 6);
}

function transferRulesFor({ massingPatterns, approachSequence, facadeRhythm, roofComposition, siteComposition, viewRules }) {
  const rules = [];
  const all = [...massingPatterns, ...approachSequence, ...facadeRhythm, ...roofComposition, ...siteComposition, ...viewRules];
  const has = (type) => all.some((item) => item.pattern_type === type);
  if (has('asymmetric_wings')) rules.push('use side wings or offset attached volumes instead of a plain box');
  if (has('vertical_landmark')) rules.push('reserve one tower/lookout/corner accent as silhouette anchor');
  if (has('courtyard_or_void')) rules.push('keep a courtyard, patio bite, or foreground void readable');
  if (has('large_glass_bands')) rules.push('orient large glass toward water, garden, or main view');
  if (has('micro_depth_trim')) rules.push('add layered facade trims, slabs, and relief rather than flat walls');
  if (has('flat_terrace_or_platform')) rules.push('use flat roof terrace or usable roof/service strip');
  if (has('layered_eaves')) rules.push('stack roof/eave layers as a style-defining silhouette');
  if (has('garden_forecourt') || has('garden_rooms')) rules.push('compose foreground garden rooms before the main facade');
  if (has('waterfront_transition') || has('water_edge')) rules.push('connect entry, terrace, and public rooms to the water edge');
  if (has('layered_terrain_base')) rules.push('build with stone/earth terrain layers and retaining edges');
  return [...new Set(rules)].slice(0, 10);
}

function compositionReadinessScore({ massingPatterns, approachSequence, facadeRhythm, roofComposition, siteComposition, viewRules, context }) {
  const familyBonus = /house|castle|temple|tower|public-building/.test(context.typology) ? 4 : 0;
  const evidenceGroups = [
    topEvidenceScore(massingPatterns),
    topEvidenceScore(approachSequence),
    topEvidenceScore(facadeRhythm),
    topEvidenceScore(roofComposition),
    topEvidenceScore(siteComposition),
    topEvidenceScore(viewRules)
  ];
  const coverage = evidenceGroups.filter((value) => value >= 55).length * 6;
  const topAverage = evidenceGroups.reduce((sum, value) => sum + value, 0) / Math.max(1, evidenceGroups.length);
  return clampInt(Math.round(topAverage * 0.72 + coverage + familyBonus), 0, 100, 0);
}

function topEvidenceScore(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.confidence || 0)), 0);
}

function readinessBucket(score) {
  if (score >= 78) return 'high';
  if (score >= 58) return 'medium';
  if (score >= 35) return 'low';
  return 'skip';
}

function addEvidence(result, patternType, condition, confidenceValue, reason) {
  if (!condition) return;
  result.push({
    pattern_type: patternType,
    confidence: clampInt(confidenceValue, 0, 100, 0),
    reason
  });
}

function sortEvidence(items, limit) {
  return items
    .filter((item) => Number(item.confidence || 0) > 0)
    .sort((a, b) => b.confidence - a.confidence || a.pattern_type.localeCompare(b.pattern_type))
    .slice(0, limit);
}

function boundsForColumns(columns) {
  const bounds = { min_x: Infinity, max_x: -Infinity, min_z: Infinity, max_z: -Infinity, min_y: Infinity, max_y: -Infinity };
  for (const column of columns) {
    bounds.min_x = Math.min(bounds.min_x, column.x);
    bounds.max_x = Math.max(bounds.max_x, column.x);
    bounds.min_z = Math.min(bounds.min_z, column.z);
    bounds.max_z = Math.max(bounds.max_z, column.z);
    bounds.min_y = Math.min(bounds.min_y, column.min_y);
    bounds.max_y = Math.max(bounds.max_y, column.max_y);
  }
  return Number.isFinite(bounds.min_x) ? bounds : undefined;
}

function footprintComplexity(columns, bounds) {
  const occupied = new Set([...columns.keys()]);
  const width = bounds.max_x - bounds.min_x + 1;
  const length = bounds.max_z - bounds.min_z + 1;
  const center = {
    min_x: bounds.min_x + Math.floor(width * 0.3),
    max_x: bounds.max_x - Math.floor(width * 0.3),
    min_z: bounds.min_z + Math.floor(length * 0.3),
    max_z: bounds.max_z - Math.floor(length * 0.3)
  };
  let centerTotal = 0;
  let centerEmpty = 0;
  for (let x = center.min_x; x <= center.max_x; x += 1) {
    for (let z = center.min_z; z <= center.max_z; z += 1) {
      centerTotal += 1;
      if (!occupied.has(`${x},${z}`)) centerEmpty += 1;
    }
  }

  let edgeExposed = 0;
  for (const key of occupied) {
    const [x, z] = key.split(',').map(Number);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!occupied.has(`${x + dx},${z + dz}`)) edgeExposed += 1;
    }
  }

  const quadrants = [0, 0, 0, 0];
  const midX = (bounds.min_x + bounds.max_x) / 2;
  const midZ = (bounds.min_z + bounds.max_z) / 2;
  for (const key of occupied) {
    const [x, z] = key.split(',').map(Number);
    const index = (x > midX ? 1 : 0) + (z > midZ ? 2 : 0);
    quadrants[index] += 1;
  }
  const qMax = Math.max(...quadrants, 1);
  const qMin = Math.min(...quadrants);
  const spread = (qMax - qMin) / qMax;

  return {
    center_void_ratio: round(centerEmpty / Math.max(1, centerTotal)),
    edge_articulation: round(edgeExposed / Math.max(1, occupied.size)),
    quadrant_balance: spread <= 0.24 ? 'balanced' : spread >= 0.58 ? 'asymmetric' : 'moderate',
    quadrant_counts: quadrants
  };
}

function columnHeightStats(columns) {
  const heights = columns.map((column) => column.max_y - column.min_y + 1);
  const maxHeight = heights.reduce((max, value) => Math.max(max, value), 0);
  const avgHeight = heights.reduce((sum, value) => sum + value, 0) / Math.max(1, heights.length);
  const variance = heights.reduce((sum, value) => sum + (value - avgHeight) ** 2, 0) / Math.max(1, heights.length);
  return {
    max_height: maxHeight,
    avg_height: round(avgHeight),
    height_stddev: round(Math.sqrt(variance)),
    tall_column_ratio: round(heights.filter((value) => value >= maxHeight * 0.65).length / Math.max(1, heights.length))
  };
}

function verticalLayerStats(layerCounts) {
  const peak = layerCounts.reduce((max, value) => Math.max(max, value), 1);
  const occupied = layerCounts.filter((value) => value > 0);
  const topStart = Math.floor(layerCounts.length * 0.78);
  const topPlateau = layerCounts.slice(topStart).filter((value) => value > peak * 0.18).length;
  let stepChanges = 0;
  let previous = 0;
  for (const count of layerCounts) {
    const normalized = count / peak;
    if (Math.abs(normalized - previous) >= 0.18) stepChanges += 1;
    previous = normalized;
  }
  return {
    occupied_layers: occupied.length,
    peak_layer_occupancy: peak,
    top_plateau_ratio: round(topPlateau / Math.max(1, layerCounts.length - topStart)),
    step_changes: stepChanges,
    tower_like: occupied.length >= layerCounts.length * 0.55 && layerCounts.filter((count) => count > peak * 0.45).length < layerCounts.length * 0.42
  };
}

function projectionStats(columns, bounds) {
  const width = bounds.max_x - bounds.min_x + 1;
  const length = bounds.max_z - bounds.min_z + 1;
  const thirds = {
    west: 0,
    center_x: 0,
    east: 0,
    north: 0,
    center_z: 0,
    south: 0
  };
  for (const key of columns.keys()) {
    const [x, z] = key.split(',').map(Number);
    const xNorm = (x - bounds.min_x) / Math.max(1, width - 1);
    const zNorm = (z - bounds.min_z) / Math.max(1, length - 1);
    if (xNorm < 0.34) thirds.west += 1;
    else if (xNorm > 0.66) thirds.east += 1;
    else thirds.center_x += 1;
    if (zNorm < 0.34) thirds.north += 1;
    else if (zNorm > 0.66) thirds.south += 1;
    else thirds.center_z += 1;
  }
  const westEastSpread = Math.abs(thirds.west - thirds.east) / Math.max(1, thirds.west + thirds.east);
  const northSouthSpread = Math.abs(thirds.north - thirds.south) / Math.max(1, thirds.north + thirds.south);
  return {
    thirds,
    side_bias: westEastSpread > 0.36 || northSouthSpread > 0.36 ? 'biased' : 'balanced'
  };
}

function siteCompositionMetrics({ siteColumns, waterColumns, vegetationColumns, architecturalBounds, siteBounds, analysis }) {
  const terrain = analysis.terrain || {};
  const detail = analysis.detail_metrics || {};
  const buildingArea = Math.max(1, (architecturalBounds.max_x - architecturalBounds.min_x + 1) * (architecturalBounds.max_z - architecturalBounds.min_z + 1));
  const siteArea = siteBounds ? Math.max(1, (siteBounds.max_x - siteBounds.min_x + 1) * (siteBounds.max_z - siteBounds.min_z + 1)) : 0;
  const waterNear = countColumnsNearBounds(waterColumns, architecturalBounds, 8);
  const vegetationNear = countColumnsNearBounds(vegetationColumns, architecturalBounds, 8);
  return {
    terrain_integrated: Boolean(terrain.integrated || terrain.non_flat),
    terrain_range: Number(terrain.height_range || 0),
    garden_signal: String(detail.garden_signal || 'none'),
    natural_ratio: Number(detail.natural_ratio || 0),
    site_to_building_ratio: round(siteArea / buildingArea),
    water_edge: waterColumns.size > 0 && (waterNear > 0 || Number(analysis.block_categories?.water?.ratio || 0) > 0.005),
    water_proximity: round(waterNear / Math.max(1, waterColumns.size)),
    vegetation_ratio: round(vegetationColumns.size / Math.max(1, siteColumns.size)),
    vegetation_near_building_ratio: round(vegetationNear / Math.max(1, vegetationColumns.size))
  };
}

function countColumnsNearBounds(columns, bounds, distance) {
  let count = 0;
  for (const key of columns) {
    const [x, z] = key.split(',').map(Number);
    const dx = x < bounds.min_x ? bounds.min_x - x : x > bounds.max_x ? x - bounds.max_x : 0;
    const dz = z < bounds.min_z ? bounds.min_z - z : z > bounds.max_z ? z - bounds.max_z : 0;
    if (Math.max(dx, dz) <= distance) count += 1;
  }
  return count;
}

function confidence(base, bonus) {
  return clampInt(Math.round(base + Number(bonus || 0)), 0, 100, base);
}

function clampInt(value, min, max, fallback = min) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function round(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}
