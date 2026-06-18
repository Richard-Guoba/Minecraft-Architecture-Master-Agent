import { computeBounds, keyFor } from '../engine/csgBuilder.js';

const SOURCE = 'local-template-law-auto-repair-agent';
const VERSION = 1;

export class TemplateLawAutoRepairAgent {
  run({
    grid,
    blueprint = {},
    coverage = {},
    buildSpec = blueprint.buildSpec || {},
    architecture = blueprint.architecture || {},
    topology = blueprint.topology || {},
    site = blueprint.site || {},
    roof = blueprint.roof || {},
    opening = blueprint.opening || {},
    interior = blueprint.interior || {},
    decorator = blueprint.decorator || {},
    layout = blueprint.layout || {}
  } = {}) {
    if (!coverage?.active) {
      return inactiveRepair('template-law-coverage-inactive', coverage);
    }
    const directives = (coverage.repair_directives || []).filter((item) => item.priority !== 'maintain');
    if (!directives.length) {
      return inactiveRepair('template-law-coverage-already-satisfied', coverage);
    }

    const context = {
      grid,
      blueprint,
      coverage,
      buildSpec,
      architecture,
      topology,
      site,
      roof,
      opening,
      interior,
      decorator,
      layout,
      materials: architecture.materials || blueprint.materialPalette?.materials || {},
      bounds: grid?.size ? computeBounds(grid) : (blueprint.bounds || { minX: 0, maxX: 0, minY: 0, maxY: 4, minZ: 0, maxZ: 0 }),
      applied: [],
      unresolved: [],
      placements: [],
      gridPatchCount: 0
    };

    const ids = new Set(directives.map((item) => item.id));
    if (ids.has('refresh-template-design-laws')) {
      context.unresolved.push(unresolved('refresh-template-design-laws', 'Template analysis must be regenerated before grid-level auto repair can infer missing laws.'));
    }
    if (ids.has('repair-public-view-axis')) repairPublicViewAxis(context);
    if (ids.has('repair-terrain-plinth')) repairTerrainPlinth(context);
    if (ids.has('repair-waterfront-threshold')) repairWaterfrontThreshold(context);
    if (ids.has('repair-foreground-garden')) repairForegroundGarden(context);
    if (ids.has('repair-glass-view-axis')) repairGlassViewAxis(context);
    if (ids.has('repair-roof-terrace')) repairRoofTerrace(context);
    if (ids.has('repair-room-identity-stack')) repairRoomIdentityStack(context);
    if (ids.has('repair-room-pattern-execution')) repairRoomPatternExecution(context);
    if (ids.has('repair-design-law-decorator-layer')) repairDesignLawDecoratorLayer(context);

    refreshDecoratorProfile(decorator, context.placements);
    refreshSiteSceneCount(site);

    return {
      source: SOURCE,
      version: VERSION,
      active: context.applied.length > 0,
      reason: context.applied.length ? 'template-law-gaps-auto-repaired' : 'no-grid-level-template-law-repair-applied',
      coverage_before: compactCoverage(coverage),
      directive_count: directives.length,
      applied_count: context.applied.length,
      grid_patch_count: context.gridPatchCount,
      placement_count: context.placements.length,
      applied: context.applied,
      unresolved: context.unresolved,
      placements: context.placements,
      engine_hints: {
        mutates_grid_before_export: context.gridPatchCount > 0,
        mutates_decorator_profile: context.placements.length > 0,
        rerun_coverage_after_repair: true
      }
    };
  }
}

function inactiveRepair(reason, coverage = {}) {
  return {
    source: SOURCE,
    version: VERSION,
    active: false,
    reason,
    coverage_before: compactCoverage(coverage),
    applied_count: 0,
    grid_patch_count: 0,
    placement_count: 0,
    applied: [],
    unresolved: [],
    placements: []
  };
}

function repairPublicViewAxis(ctx) {
  ensurePublicViewMetadata(ctx);
  addPublicViewInteriorAnchors(ctx);
  markApplied(ctx, 'repair-public-view-axis', 'Aligned public rooms, view thresholds, and view-facing anchors.');
}

function repairWaterfrontThreshold(ctx) {
  const core = publicCoreId(ctx);
  addSiteConnection(ctx.topology, core, 'water_edge', 'template-design-law-public-water-threshold');
  ensureSiteScene(ctx.site, 'water-edge-deck-scene');
  const center = frontCenter(ctx, 10);
  const deck = ctx.materials.pool_edge || ctx.materials.trim || 'minecraft:smooth_quartz';
  const water = ctx.materials.water || 'minecraft:water';
  const plant = plantBlock(ctx);
  for (let lateral = -7; lateral <= 7; lateral += 1) {
    const deckPoint = offsetAlongFront(ctx, center, lateral, 0);
    writeGrid(ctx, deckPoint.x, 0, deckPoint.z, deck, 'template_site_water_deck');
    const waterPoint = offsetFrontDepth(ctx, deckPoint, 1);
    writeGrid(ctx, waterPoint.x, 0, waterPoint.z, water, 'template_site_reflection_water');
    if (Math.abs(lateral) % 2 === 0) {
      const edgePoint = offsetFrontDepth(ctx, deckPoint, -1);
      writeGrid(ctx, edgePoint.x, 0, edgePoint.z, plant, 'template_site_water_edge');
    }
  }
  markApplied(ctx, 'repair-waterfront-threshold', 'Added water deck, reflection water, planting edge, and topology connection.');
}

function repairForegroundGarden(ctx) {
  addSiteConnection(ctx.topology, 'entry', 'foreground_garden', 'template-design-law-garden-arrival');
  ensureSiteScene(ctx.site, 'forecourt-garden-room-scene');
  ensureSiteScene(ctx.site, 'entry-approach-scene');
  const center = frontCenter(ctx, 2);
  const path = ctx.materials.path || 'minecraft:smooth_stone';
  const hedge = ctx.materials.plant_secondary || ctx.materials.plant || 'minecraft:flowering_azalea_leaves[persistent=true]';
  const frame = ctx.materials.garden_edge || ctx.materials.railing || 'minecraft:iron_bars';
  for (let depth = 0; depth < 7; depth += 1) {
    const pathPoint = offsetFrontDepth(ctx, center, depth);
    writeGrid(ctx, pathPoint.x, 0, pathPoint.z, path, 'template_site_entry_approach');
    const left = offsetAlongFront(ctx, pathPoint, -3, 0);
    const right = offsetAlongFront(ctx, pathPoint, 3, 0);
    writeGrid(ctx, left.x, 0, left.z, hedge, 'template_site_planting_room');
    writeGrid(ctx, right.x, 0, right.z, hedge, 'template_site_planting_room');
    if (depth === 0 || depth === 4) {
      const leftFrame = offsetAlongFront(ctx, pathPoint, -4, 0);
      const rightFrame = offsetAlongFront(ctx, pathPoint, 4, 0);
      writeGrid(ctx, leftFrame.x, 0, leftFrame.z, frame, 'template_site_threshold_frame');
      writeGrid(ctx, rightFrame.x, 0, rightFrame.z, frame, 'template_site_threshold_frame');
    }
  }
  for (let lateral = -7; lateral <= 7; lateral += 1) {
    if (Math.abs(lateral) <= 1) continue;
    const roomPoint = offsetAlongFront(ctx, center, lateral, 3);
    writeGrid(ctx, roomPoint.x, 0, roomPoint.z, hedge, 'template_site_garden_room');
  }
  markApplied(ctx, 'repair-foreground-garden', 'Composed entry approach, planting beds, threshold frame, and garden-room modules.');
}

function repairTerrainPlinth(ctx) {
  addSiteConnection(ctx.topology, 'entry', 'terrain_plinth', 'template-design-law-stepped-arrival');
  ctx.topology.bsp_hints ||= {};
  ctx.topology.bsp_hints.terrain_plinth_sequence ||= 'stone-earth-garden-approach';
  ensureSiteScene(ctx.site, 'terrain-plinth-scene');
  const stone = ctx.materials.retaining || ctx.materials.foundation || 'minecraft:smooth_stone';
  const earth = ctx.materials.earth || 'minecraft:dirt';
  const { minX, maxX, minZ, maxZ } = ctx.bounds;
  for (let x = minX - 2; x <= maxX + 2; x += 1) {
    writeGrid(ctx, x, 0, minZ - 2, stone, 'template_site_retaining_edge');
    writeGrid(ctx, x, 0, maxZ + 2, stone, 'template_site_retaining_edge');
    if ((x - minX) % 2 === 0) {
      writeGrid(ctx, x, 0, minZ - 3, earth, 'template_site_earth_terrace');
      writeGrid(ctx, x, 0, maxZ + 3, earth, 'template_site_earth_terrace');
    }
  }
  for (let z = minZ - 1; z <= maxZ + 1; z += 1) {
    writeGrid(ctx, minX - 2, 0, z, stone, 'template_site_stone_plinth');
    writeGrid(ctx, maxX + 2, 0, z, stone, 'template_site_stone_plinth');
  }
  markApplied(ctx, 'repair-terrain-plinth', 'Added retaining edge, stone plinth, earth terraces, and terrain arrival metadata.');
}

function repairGlassViewAxis(ctx) {
  ensurePublicViewMetadata(ctx);
  ctx.opening.engine_hints ||= {};
  ctx.opening.engine_hints.template_view_opening_count = Math.max(1, Number(ctx.opening.engine_hints.template_view_opening_count || 0));
  ctx.opening.window_openings ||= [];
  if (!ctx.opening.window_openings.some((item) => item.template_role === 'view-glass')) {
    ctx.opening.window_openings.push({
      room_id: publicCoreId(ctx),
      side: viewSide(ctx),
      template_role: 'view-glass',
      glazing_ratio: 'high',
      source: SOURCE
    });
  }
  ctx.opening.view_thresholds ||= [];
  if (!ctx.opening.view_thresholds.some((item) => item.room_id === publicCoreId(ctx))) {
    ctx.opening.view_thresholds.push({ room_id: publicCoreId(ctx), to: 'view_axis', source: SOURCE });
  }
  addPublicViewInteriorAnchors(ctx);
  markApplied(ctx, 'repair-glass-view-axis', 'Patched view-glass opening metadata and interior view response anchors.');
}

function repairRoofTerrace(ctx) {
  const core = publicCoreId(ctx);
  ctx.topology.circulation_rules ||= {};
  ctx.topology.circulation_rules.roof_terrace_access_required = true;
  addSiteConnection(ctx.topology, core, 'roof_terrace', 'template-design-law-roof-terrace-access');
  ctx.roof.elements ||= [];
  if (!ctx.roof.elements.some((item) => /roof-access/i.test(`${item.kind || ''} ${item.role || ''}`))) ctx.roof.elements.push({ kind: 'roof-access', source: SOURCE });
  if (!ctx.roof.elements.some((item) => /roof-garden|terrace/i.test(`${item.kind || ''} ${item.role || ''}`))) ctx.roof.elements.push({ kind: 'roof-garden', source: SOURCE });
  if (!/terrace|parapet/i.test(String(ctx.roof.profile || ''))) ctx.roof.profile = `${ctx.roof.profile || 'flat'}-terrace`;
  const y = Math.max(1, ctx.bounds.maxY);
  const cx = Math.floor((ctx.bounds.minX + ctx.bounds.maxX) / 2);
  const cz = Math.floor((ctx.bounds.minZ + ctx.bounds.maxZ) / 2);
  const rail = ctx.materials.railing || 'minecraft:iron_bars';
  const deck = ctx.materials.roof || ctx.materials.floor || 'minecraft:smooth_quartz_slab[type=top]';
  const planter = ctx.materials.planter || ctx.materials.plant || 'minecraft:potted_azalea_bush';
  const seat = ctx.materials.outdoor_seat || 'minecraft:smooth_quartz_stairs[facing=north,half=bottom]';
  for (let dx = -4; dx <= 4; dx += 1) {
    for (let dz = -4; dz <= 4; dz += 1) {
      writeGrid(ctx, cx + dx, y, cz + dz, deck, 'roof_detail');
    }
  }
  for (let dx = -4; dx <= 4; dx += 1) {
    writeGrid(ctx, cx + dx, y + 1, cz - 4, rail, 'roof_detail');
    writeGrid(ctx, cx + dx, y + 1, cz + 4, rail, 'roof_detail');
  }
  for (let dz = -3; dz <= 3; dz += 1) {
    writeGrid(ctx, cx - 4, y + 1, cz + dz, rail, 'roof_detail');
    writeGrid(ctx, cx + 4, y + 1, cz + dz, rail, 'roof_detail');
  }
  writeGrid(ctx, cx - 2, y + 1, cz, planter, 'roof_detail');
  writeGrid(ctx, cx + 2, y + 1, cz, planter, 'roof_detail');
  writeGrid(ctx, cx, y + 1, cz, seat, 'roof_detail');
  markApplied(ctx, 'repair-roof-terrace', 'Added roof terrace access metadata, roof elements, rail, planter, and seating cluster.');
}

function repairRoomIdentityStack(ctx) {
  ctx.interior.engine_hints ||= {};
  ctx.interior.engine_hints.use_template_design_laws = true;
  const rooms = importantRooms(ctx).slice(0, 8);
  for (const room of rooms) {
    ensureRoomDetailLaw(ctx.interior, room);
    addRoomIdentityPlacements(ctx, room);
  }
  markApplied(ctx, 'repair-room-identity-stack', `Added identity-stack details for ${rooms.length} important rooms.`);
}

function repairRoomPatternExecution(ctx) {
  const rooms = importantRooms(ctx).slice(0, 8);
  for (const room of rooms) {
    const patterns = patternsForRoom(room);
    for (const pattern of patterns) addPatternPlacements(ctx, room, pattern);
  }
  topUpTemplatePatternPlacements(ctx, rooms);
  markApplied(ctx, 'repair-room-pattern-execution', `Added template-pattern furniture groups for ${rooms.length} rooms.`);
}

function repairDesignLawDecoratorLayer(ctx) {
  const rooms = importantRooms(ctx).slice(0, 8);
  for (const room of rooms) addRoomIdentityPlacements(ctx, room);
  markApplied(ctx, 'repair-design-law-decorator-layer', `Added explicit design-law decorator roles for ${rooms.length} rooms.`);
}

function ensurePublicViewMetadata(ctx) {
  const core = publicCoreId(ctx);
  ctx.topology.facade_alignment ||= {};
  ctx.topology.facade_alignment.template_design_law_public_view_axis = true;
  ctx.topology.facade_alignment.template_design_law_view_rooms = dedupeStrings([
    ...(ctx.topology.facade_alignment.template_design_law_view_rooms || []),
    core
  ]);
  ctx.topology.facade_alignment.glass_priority_rooms = dedupeStrings([
    ...(ctx.topology.facade_alignment.glass_priority_rooms || []),
    core
  ]);
  addSiteConnection(ctx.topology, core, 'view_deck', 'template-design-law-view-threshold');
  ensurePublicViewExperience(ctx.interior, core);
}

function addPublicViewInteriorAnchors(ctx) {
  const room = roomById(ctx, publicCoreId(ctx)) || importantRooms(ctx).find((item) => ['living', 'great_hall', 'lounge', 'dining'].includes(item.type));
  if (!room) return;
  addPlacement(ctx, room, 'design-law-social-anchor', ctx.materials.furniture || 'minecraft:smooth_quartz_slab[type=bottom]', centerPoint(room), 'design-law-public-view-axis', 'decor_furniture');
  addPlacement(ctx, room, 'design-law-focal-wall', ctx.materials.accent || 'minecraft:smooth_quartz', edgePoint(room, 'south'), 'design-law-public-view-axis', 'decor_detail');
  addPlacement(ctx, room, 'design-law-task-light', ctx.materials.lamp || 'minecraft:sea_lantern', { ...centerPoint(room), y: room.max_y }, 'design-law-public-view-axis', 'decor_light');
}

function addRoomIdentityPlacements(ctx, room) {
  addPlacement(ctx, room, 'design-law-focal-wall', ctx.materials.accent || ctx.materials.trim || 'minecraft:smooth_quartz', edgePoint(room, 'east'), 'design-law-room-identity-stack', 'decor_detail');
  addPlacement(ctx, room, 'design-law-task-light', ctx.materials.lamp || 'minecraft:sea_lantern', { ...centerPoint(room), y: room.max_y }, 'design-law-room-identity-stack', 'decor_light');
  if (!['bathroom', 'utility', 'storage'].includes(room.type)) {
    addPlacement(ctx, room, 'design-law-soft-detail', ctx.materials.plant || 'minecraft:potted_azalea_bush', edgePoint(room, 'south'), 'design-law-room-identity-stack', 'decor_plant');
  }
}

function addPatternPlacements(ctx, room, pattern) {
  const light = ctx.materials.lamp || 'minecraft:sea_lantern';
  if (pattern === 'social_cluster') {
    addPlacement(ctx, room, 'template-pattern-seat', ctx.materials.furniture || 'minecraft:smooth_quartz_slab[type=bottom]', edgePoint(room, 'south'), 'template-conversation-cluster', 'decor_furniture');
    addPlacement(ctx, room, 'template-pattern-side-seat', ctx.materials.furniture || 'minecraft:smooth_quartz_slab[type=bottom]', edgePoint(room, 'south', 2), 'template-conversation-cluster', 'decor_furniture');
    addPlacement(ctx, room, 'template-pattern-rug', 'minecraft:white_carpet', centerPoint(room), 'template-conversation-cluster', 'decor_floor');
    addPlacement(ctx, room, 'template-pattern-low-table', 'minecraft:smooth_quartz_slab[type=bottom]', centerPoint(room), 'template-conversation-cluster', 'decor_furniture');
    addPlacement(ctx, room, 'template-pattern-layered-light', light, { ...centerPoint(room), y: room.max_y }, 'template-conversation-cluster', 'decor_light');
  } else if (pattern === 'kitchen_work_wall') {
    addPlacement(ctx, room, 'template-pattern-range', 'minecraft:furnace', edgePoint(room, 'north', -1), 'template-work-wall', 'decor_utility');
    addPlacement(ctx, room, 'template-pattern-prep', 'minecraft:crafting_table', edgePoint(room, 'north', 0), 'template-work-wall', 'decor_utility');
    addPlacement(ctx, room, 'template-pattern-pantry', 'minecraft:barrel', edgePoint(room, 'north', 1), 'template-work-wall', 'decor_storage');
    addPlacement(ctx, room, 'template-pattern-layered-light', light, { ...edgePoint(room, 'north'), y: room.max_y }, 'template-work-wall', 'decor_light');
    addPlacement(ctx, room, 'design-law-work-wall-light', light, { ...edgePoint(room, 'north'), y: room.max_y }, 'design-law-kitchen-work-wall', 'decor_light');
  } else if (pattern === 'sleep_niche') {
    addPlacement(ctx, room, 'template-pattern-bedside', 'minecraft:barrel', edgePoint(room, 'south', -1), 'template-sleep-niche', 'decor_storage');
    addPlacement(ctx, room, 'template-pattern-wardrobe', 'minecraft:barrel', edgePoint(room, 'west'), 'template-sleep-niche', 'decor_storage');
    addPlacement(ctx, room, 'template-pattern-bed-rug', 'minecraft:white_carpet', centerPoint(room), 'template-sleep-niche', 'decor_floor');
    addPlacement(ctx, room, 'template-pattern-layered-light', light, { ...centerPoint(room), y: room.max_y }, 'template-sleep-niche', 'decor_light');
    addPlacement(ctx, room, 'design-law-bedside-soft-light', light, { ...edgePoint(room, 'south', 1), y: Math.min(room.min_y + 1, room.max_y) }, 'design-law-bedroom-sleep-niche', 'decor_light');
  } else if (pattern === 'library_focus_wall') {
    addPlacement(ctx, room, 'template-pattern-library', 'minecraft:bookshelf', edgePoint(room, 'east'), 'template-library-wall', 'decor_furniture');
    addPlacement(ctx, room, 'template-pattern-desk', 'minecraft:lectern', centerPoint(room), 'template-library-wall', 'decor_furniture');
    addPlacement(ctx, room, 'template-pattern-reading-rug', 'minecraft:white_carpet', centerPoint(room), 'template-library-wall', 'decor_floor');
    addPlacement(ctx, room, 'template-pattern-layered-light', light, { ...edgePoint(room, 'east'), y: room.max_y }, 'template-library-wall', 'decor_light');
    addPlacement(ctx, room, 'design-law-focus-wall-light', light, { ...edgePoint(room, 'east'), y: room.max_y }, 'design-law-study-library-focus', 'decor_light');
  } else if (pattern === 'wet_wall') {
    addPlacement(ctx, room, 'template-pattern-basin', 'minecraft:cauldron', edgePoint(room, 'north'), 'template-wet-wall', 'decor_utility');
    addPlacement(ctx, room, 'design-law-mirror-light', light, { ...edgePoint(room, 'north'), y: Math.min(room.min_y + 1, room.max_y) }, 'design-law-bathroom-wet-wall', 'decor_light');
  } else if (pattern === 'storage_wall') {
    addPlacement(ctx, room, 'template-pattern-storage', 'minecraft:barrel', edgePoint(room, 'north', -1), 'template-storage-wall', 'decor_storage');
    addPlacement(ctx, room, 'design-law-inventory-light', light, { ...edgePoint(room, 'north'), y: room.max_y }, 'design-law-storage-service-wall', 'decor_light');
  } else if (pattern === 'display_wall') {
    addPlacement(ctx, room, 'template-pattern-display', ctx.materials.accent || 'minecraft:decorated_pot', edgePoint(room, 'east'), 'template-display-wall', 'decor_detail');
    addPlacement(ctx, room, 'template-pattern-display-light', light, { ...edgePoint(room, 'east'), y: room.max_y }, 'template-display-wall', 'decor_light');
  }
}

function topUpTemplatePatternPlacements(ctx, rooms = []) {
  const target = templatePatternTarget(ctx);
  let count = currentTemplatePatternCount(ctx);
  let slot = 0;
  const roles = ['soft-frame', 'anchor', 'storage', 'view', 'accent-light', 'material-layer'];
  while (count < target && rooms.length && slot < target * 2) {
    const room = rooms[slot % rooms.length];
    const role = `template-pattern-${roles[slot % roles.length]}-${Math.floor(slot / roles.length) + 1}`;
    const block = role.includes('light')
      ? (ctx.materials.lamp || 'minecraft:sea_lantern')
      : (role.includes('storage') ? 'minecraft:barrel' : (ctx.materials.accent || 'minecraft:smooth_quartz'));
    const module = role.includes('light') ? 'decor_light' : (role.includes('storage') ? 'decor_storage' : 'decor_detail');
    if (addPlacement(ctx, room, role, block, edgePoint(room, slot % 2 === 0 ? 'west' : 'east', (slot % 5) - 2), 'template-pattern-density-topup', module)) {
      count += 1;
    }
    slot += 1;
  }
}

function addPlacement(ctx, room, role, block, point, placement, module) {
  if (!room || !point) return false;
  const at = normalizePointForRoom(room, point, module);
  const free = findFreeRoomPoint(ctx.grid, room, at, module) || at;
  if (ctx.grid) {
    const existing = ctx.grid.get(keyFor(free.x, free.y, free.z));
    if (existing && !String(existing.module || '').startsWith('decor_')) return false;
    ctx.grid.set(keyFor(free.x, free.y, free.z), { block, module });
    ctx.gridPatchCount += 1;
  }
  const placementItem = {
    room_id: room.id,
    type: room.type,
    role,
    block,
    placement,
    module,
    at: free,
    source: SOURCE
  };
  ctx.decorator.placements ||= [];
  if (!ctx.decorator.placements.some((item) => item.room_id === placementItem.room_id && item.role === placementItem.role && item.at?.x === free.x && item.at?.y === free.y && item.at?.z === free.z)) {
    ctx.decorator.placements.push(placementItem);
    ctx.placements.push(placementItem);
  }
  return true;
}

function writeGrid(ctx, x, y, z, block, module) {
  if (!ctx.grid) return false;
  const key = keyFor(Math.round(x), Math.round(y), Math.round(z));
  const existing = ctx.grid.get(key);
  if (existing && protectedModule(existing.module)) return false;
  ctx.grid.set(key, { block, module });
  ctx.gridPatchCount += 1;
  return true;
}

function protectedModule(module) {
  return ['door', 'stairs', 'windows'].includes(String(module || ''));
}

function findFreeRoomPoint(grid, room, preferred, module) {
  if (!grid) return preferred;
  const candidates = [
    preferred,
    centerPoint(room),
    edgePoint(room, 'north'),
    edgePoint(room, 'south'),
    edgePoint(room, 'east'),
    edgePoint(room, 'west')
  ].map((point) => normalizePointForRoom(room, point, module));
  for (const point of candidates) {
    const existing = grid.get(keyFor(point.x, point.y, point.z));
    if (!existing || String(existing.module || '').startsWith('decor_')) return point;
  }
  return undefined;
}

function normalizePointForRoom(room, point, module) {
  const x = clampInt(point.x, room.min_x + 1, room.max_x - 1, Math.floor((room.min_x + room.max_x) / 2));
  const z = clampInt(point.z, room.min_z + 1, room.max_z - 1, Math.floor((room.min_z + room.max_z) / 2));
  const y = module === 'decor_light'
    ? clampInt(point.y ?? room.max_y, room.min_y, room.max_y, room.max_y)
    : clampInt(point.y ?? room.min_y, room.min_y, room.max_y, room.min_y);
  return { x, y, z };
}

function refreshDecoratorProfile(decorator = {}, newPlacements = []) {
  if (!newPlacements.length) return;
  decorator.placementCount = Number(decorator.placementCount || 0) + newPlacements.length;
  decorator.capability_profile ||= {};
  const profile = decorator.capability_profile;
  profile.template_design_law_placement_count = Number(profile.template_design_law_placement_count || 0) +
    newPlacements.filter((item) => String(item.role || '').startsWith('design-law-')).length;
  profile.template_pattern_placement_count = Number(profile.template_pattern_placement_count || 0) +
    newPlacements.filter((item) => String(item.role || '').startsWith('template-pattern-')).length;
  profile.functional_placement_count = Number(profile.functional_placement_count || 0) +
    newPlacements.filter((item) => ['decor_furniture', 'decor_storage', 'decor_utility'].includes(item.module)).length;
  profile.supports_template_design_laws = profile.template_design_law_placement_count > 0;
  profile.supports_template_room_patterns = profile.supports_template_room_patterns || profile.template_pattern_placement_count > 0;
  const modules = new Set([...(profile.module_layers || []), ...newPlacements.map((item) => item.module).filter(Boolean)]);
  profile.module_layers = [...modules].sort();
  decorator.stats ||= { byRole: {}, byModule: {}, byRoomType: {}, byAgent: {} };
  decorator.stats.byRole ||= {};
  decorator.stats.byModule ||= {};
  decorator.stats.byRoomType ||= {};
  for (const item of newPlacements) {
    decorator.stats.byRole[item.role] = (decorator.stats.byRole[item.role] || 0) + 1;
    decorator.stats.byModule[item.module] = (decorator.stats.byModule[item.module] || 0) + 1;
    decorator.stats.byRoomType[item.type] = (decorator.stats.byRoomType[item.type] || 0) + 1;
  }
}

function ensurePublicViewExperience(interior = {}, core) {
  interior.template_room_experience ||= {
    active: true,
    source: SOURCE,
    room_experiences: [],
    opening_plan: { public_view_rooms: [] }
  };
  const experience = interior.template_room_experience;
  experience.active = true;
  experience.room_experiences ||= [];
  experience.opening_plan ||= {};
  experience.opening_plan.public_view_rooms = dedupeStrings([
    ...(experience.opening_plan.public_view_rooms || []),
    core
  ]);
  if (!experience.room_experiences.some((item) => item.room_id === core && item.role === 'public-view')) {
    experience.room_experiences.push({
      room_id: core,
      role: 'public-view',
      source: SOURCE
    });
  }
}

function ensureRoomDetailLaw(interior = {}, room = {}) {
  const details = interior.room_details || [];
  const detail = details.find((item) => item.room_id === room.id);
  if (!detail) return;
  detail.template_design_law = { ...(detail.template_design_law || {}), active: true, source: SOURCE };
  detail.template_design_law_clause_ids = dedupeStrings([...(detail.template_design_law_clause_ids || []), 'design-law-room-identity-stack']);
  detail.semantic_clause_ids = dedupeStrings([...(detail.semantic_clause_ids || []), 'design-law-room-identity-stack']);
  detail.semantic_clauses ||= [];
  if (!detail.semantic_clauses.some((item) => item.id === 'design-law-room-identity-stack')) {
    detail.semantic_clauses.unshift({
      id: 'design-law-room-identity-stack',
      group: 'template-design-law',
      priority: 'template',
      text: 'Auto repair: important rooms need focal wall, functional anchor, storage/display layer, soft detail, and layered light.'
    });
  }
}

function templatePatternTarget(ctx) {
  const patternTypes = dedupeStrings([
    ...runtimeObligations(ctx).flatMap((item) => item.pattern_types || [])
  ]);
  return Math.min(50, Math.max(8, patternTypes.length * 5));
}

function currentTemplatePatternCount(ctx) {
  const profileCount = Number(ctx.decorator.capability_profile?.template_pattern_placement_count || 0);
  const newCount = ctx.placements.filter((item) => String(item.role || '').startsWith('template-pattern-')).length;
  return profileCount + newCount;
}

function runtimeObligations(ctx) {
  return [
    ...(ctx.topology.template_design_law_runtime?.room_obligations || []),
    ...(ctx.interior.template_design_law_runtime?.room_obligations || [])
  ];
}

function addSiteConnection(topology = {}, from, to, relation) {
  if (!from || !to) return;
  topology.site_connections ||= [];
  if (topology.site_connections.some((item) => item.from === from && item.to === to && item.relation === relation)) return;
  topology.site_connections.push({ from, to, relation });
}

function ensureSiteScene(site = {}, sceneType) {
  site.template_site_scenes ||= { active: true, source: SOURCE, scene_types: [], scene_count: 0 };
  site.template_site_scenes.active = true;
  site.template_site_scenes.scene_types = dedupeStrings([...(site.template_site_scenes.scene_types || []), sceneType]);
  site.template_site_scenes.scene_count = Math.max(Number(site.template_site_scenes.scene_count || 0), site.template_site_scenes.scene_types.length);
}

function refreshSiteSceneCount(site = {}) {
  if (!site.template_site_scenes) return;
  site.template_site_scenes.scene_types = dedupeStrings(site.template_site_scenes.scene_types || []);
  site.template_site_scenes.scene_count = Math.max(Number(site.template_site_scenes.scene_count || 0), site.template_site_scenes.scene_types.length);
}

function publicCoreId(ctx) {
  return ctx.topology.circulation_rules?.public_core ||
    ctx.topology.nodes?.find((node) => node.id === 'living')?.id ||
    ctx.topology.nodes?.find((node) => ['living', 'great_hall', 'lounge', 'dining'].includes(node.type))?.id ||
    ctx.layout.rooms?.find((room) => ['living', 'great_hall', 'lounge', 'dining'].includes(room.type))?.id ||
    'living';
}

function roomById(ctx, id) {
  return (ctx.layout.rooms || []).find((room) => room.id === id);
}

function importantRooms(ctx) {
  const order = ['living', 'great_hall', 'lounge', 'dining', 'kitchen', 'master_bedroom', 'bedroom', 'study', 'bathroom', 'entry', 'sunroom', 'greenhouse'];
  const rooms = [...(ctx.layout.rooms || [])].filter((room) => room && room.max_x - room.min_x >= 3 && room.max_z - room.min_z >= 3);
  return rooms.sort((a, b) => orderIndex(order, a.type) - orderIndex(order, b.type));
}

function orderIndex(order, value) {
  const index = order.indexOf(value);
  return index === -1 ? order.length : index;
}

function patternsForRoom(room = {}) {
  if (['living', 'great_hall', 'lounge', 'dining'].includes(room.type)) return ['social_cluster'];
  if (room.type === 'kitchen') return ['kitchen_work_wall'];
  if (['bedroom', 'master_bedroom'].includes(room.type)) return ['sleep_niche'];
  if (room.type === 'study') return ['library_focus_wall', 'display_wall'];
  if (room.type === 'bathroom') return ['wet_wall'];
  if (['storage', 'utility'].includes(room.type)) return ['storage_wall'];
  return ['display_wall'];
}

function centerPoint(room = {}) {
  return {
    x: Math.floor((room.min_x + room.max_x) / 2),
    y: room.min_y,
    z: Math.floor((room.min_z + room.max_z) / 2)
  };
}

function edgePoint(room = {}, side = 'north', offset = 0) {
  const cx = Math.floor((room.min_x + room.max_x) / 2);
  const cz = Math.floor((room.min_z + room.max_z) / 2);
  if (side === 'south') return { x: clampInt(cx + offset, room.min_x + 1, room.max_x - 1, cx), y: room.min_y, z: room.max_z - 1 };
  if (side === 'east') return { x: room.max_x - 1, y: room.min_y, z: clampInt(cz + offset, room.min_z + 1, room.max_z - 1, cz) };
  if (side === 'west') return { x: room.min_x + 1, y: room.min_y, z: clampInt(cz + offset, room.min_z + 1, room.max_z - 1, cz) };
  return { x: clampInt(cx + offset, room.min_x + 1, room.max_x - 1, cx), y: room.min_y, z: room.min_z + 1 };
}

function frontCenter(ctx, depth = 0) {
  const side = viewSide(ctx);
  const { minX, maxX, minZ, maxZ } = ctx.bounds;
  if (side === 'north') return { x: Math.floor((minX + maxX) / 2), z: minZ - depth };
  if (side === 'east') return { x: maxX + depth, z: Math.floor((minZ + maxZ) / 2) };
  if (side === 'west') return { x: minX - depth, z: Math.floor((minZ + maxZ) / 2) };
  return { x: Math.floor((minX + maxX) / 2), z: maxZ + depth };
}

function offsetAlongFront(ctx, point, lateral = 0, depth = 0) {
  const side = viewSide(ctx);
  const base = offsetFrontDepth(ctx, point, depth);
  if (['north', 'south'].includes(side)) return { x: base.x + lateral, z: base.z };
  return { x: base.x, z: base.z + lateral };
}

function offsetFrontDepth(ctx, point, depth = 0) {
  const side = viewSide(ctx);
  if (side === 'north') return { x: point.x, z: point.z - depth };
  if (side === 'east') return { x: point.x + depth, z: point.z };
  if (side === 'west') return { x: point.x - depth, z: point.z };
  return { x: point.x, z: point.z + depth };
}

function viewSide(ctx) {
  return normalizeSide(ctx.topology.template_space_plan?.view_side ||
    ctx.topology.bsp_hints?.template_view_side ||
    ctx.buildSpec.door_side ||
    ctx.topology.facade_alignment?.front_side ||
    'south');
}

function normalizeSide(value) {
  const text = String(value || '').toLowerCase();
  if (/north|北/.test(text)) return 'north';
  if (/east|东/.test(text)) return 'east';
  if (/west|西/.test(text)) return 'west';
  return 'south';
}

function plantBlock(ctx) {
  return ctx.materials.plant || ctx.materials.plant_secondary || 'minecraft:flowering_azalea_leaves[persistent=true]';
}

function markApplied(ctx, id, summary) {
  if (ctx.applied.some((item) => item.id === id)) return;
  ctx.applied.push({ id, summary });
}

function unresolved(id, reason) {
  return { id, reason };
}

function compactCoverage(coverage = {}) {
  return {
    active: Boolean(coverage.active),
    percent: coverage.percent || 0,
    grade: coverage.grade || 'not-applicable',
    satisfied_count: coverage.satisfied_count || 0,
    partial_count: coverage.partial_count || 0,
    missing_count: coverage.missing_count || 0,
    gap_ids: (coverage.gaps || []).map((gap) => gap.id)
  };
}

function dedupeStrings(values = []) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function clampInt(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}
