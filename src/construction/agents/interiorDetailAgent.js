import { interiorSpecialistCapabilities, specialistDefinitionsForRoom } from './interiorRoomAgents.js';
import { buildInteriorSemanticLibrary, semanticClausesForRoom, summarizeInteriorSemanticPlan } from './interiorSemanticClauses.js';

export class InteriorDetailAgent {
  run(rooms = [], architecture = {}, buildSpec = {}, topology = {}, materialPalette = {}, stylePreset = {}) {
    const family = String(architecture.style_family || buildSpec.style_family || 'general');
    const design = architecture.design_directives?.interior || {};
    const templateKnowledge = architecture.template_knowledge || buildSpec.template_knowledge || {};
    const roomDetails = (rooms || []).map((room) => detailForRoom(room, family, materialPalette, architecture, buildSpec, topology, design, templateKnowledge));
    const roomSpecialists = interiorSpecialistCapabilities();
    const semanticLibrary = buildInteriorSemanticLibrary();
    const semanticSummary = summarizeInteriorSemanticPlan(roomDetails);
    return {
      source: 'local-interior-detail-agent',
      style_family: family,
      preset: stylePreset.id || 'none',
      creative_signature: architecture.design_directives?.signature || buildSpec.creative_design_signature || 'none',
      room_count: roomDetails.length,
      room_details: roomDetails,
      semantic_library: semanticLibrary,
      semantic_summary: semanticSummary,
      room_specialists: roomSpecialists,
      lighting_strategy: lightingForFamily(family),
      comfort_strategy: comfortStrategy(rooms, family, buildSpec, design),
      storage_strategy: storageStrategy(rooms, family),
      safety_strategy: safetyStrategy(rooms, topology),
      circulation_detail: {
        vertical_core: topology.circulation_rules?.vertical_core || 'none',
        wayfinding: buildSpec.floors > 1 ? 'lit-stair-and-corridor' : 'entry-to-public-core',
        accessible_route_hint: buildSpec.floors > 1 ? 'ground-floor-daily-functions' : 'single-floor-clearances'
      },
      engine_hints: {
        apply_room_accents: true,
        protect_circulation: true,
        add_task_lighting: true,
        add_style_storage: true,
        use_room_specialist_agents: true,
        use_template_room_patterns: Boolean(templateKnowledge?.active),
        minimum_blocks_per_specialist: 50,
        add_vibrant_accent_layers: true,
        add_comfort_layers: true,
        add_safety_wayfinding: true,
        add_storage_by_room_type: true
      }
    };
  }
}

function detailForRoom(room, family, materialPalette = {}, architecture = {}, buildSpec = {}, topology = {}, design = {}, templateKnowledge = {}) {
  const materials = materialPalette.materials || architecture.materials || {};
  const specialists = specialistDefinitionsForRoom(room, { styleFamily: family, architecture });
  const blockCounts = specialists.map((specialist) => specialist.capability_blocks.length);
  const semanticClauses = semanticClausesForRoom(room, { family, architecture, buildSpec, topology, materialPalette, templateKnowledge });
  const templateRoomPatterns = templatePatternsForRoom(room, templateKnowledge);
  const base = {
    room_id: room.id,
    type: room.type,
    zone: room.zone || 'public',
    mood: moodForRoom(room, family),
    accent_block: accentForRoom(room, family, materials),
    task_light: materials.path_light || materials.lamp || 'minecraft:glowstone',
    storage_block: storageForFamily(family),
    floor_accent: design.floor_accent || floorAccentForFamily(family),
    furniture_density: design.decor_density || densityForRoom(room),
    display_strategy: design.display_strategy || 'wall-display',
    color_story: design.color_story || 'balanced',
    edge_bias: design.edge_bias || 'edge-anchored',
    specialist_agent: specialists[0]?.source || 'general-room-furnishing',
    specialist_agents: specialists.map((specialist) => specialist.source),
    specialist_block_count: blockCounts.length ? Math.max(...blockCounts) : 0,
    specialist_block_counts: Object.fromEntries(specialists.map((specialist) => [specialist.source, specialist.capability_blocks.length])),
    semantic_clauses: semanticClauses,
    semantic_clause_ids: semanticClauses.map((clause) => clause.id),
    semantic_clause_groups: [...new Set(semanticClauses.map((clause) => clause.group))],
    semantic_budget: semanticBudgetForRoom(room, semanticClauses, design),
    template_room_patterns: templateRoomPatterns,
    template_pattern_strength: templateRoomPatterns.strength
  };
  if (['kitchen', 'bathroom', 'garage', 'utility'].includes(room.type)) base.service_wall = materials.secondary_wall || architecture.materials?.interior_wall || 'minecraft:light_gray_concrete';
  if (['living', 'great_hall', 'lounge'].includes(room.type)) base.focal_feature = focalFeatureForFamily(family);
  if (room.type === 'sunroom' || room.type === 'greenhouse') base.planting = materials.plant || 'minecraft:oak_leaves[persistent=true]';
  return base;
}

function templatePatternsForRoom(room = {}, templateKnowledge = {}) {
  if (!templateKnowledge?.active) {
    return { strength: 'none', guidance: [], clauses: [] };
  }
  const recommendations = templateKnowledge.recommendations || {};
  const roomType = normalizeRoomType(room.type);
  const guidance = (recommendations.room_pattern_guidance || [])
    .filter((item) => guidanceMatchesRoom(item, roomType))
    .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
    .slice(0, 5);
  return {
    strength: guidance.length ? recommendations.template_interior_pattern_strength || 'medium' : 'none',
    strategy: recommendations.room_pattern_strategy || {},
    guidance,
    clauses: [...new Set(guidance.flatMap((item) => item.clauses || []))]
  };
}

function guidanceMatchesRoom(guidance = {}, roomType) {
  const sourceType = normalizeRoomType(guidance.room_type);
  if (sourceType === roomType) return true;
  if (roomType === 'master_bedroom' && sourceType === 'bedroom') return true;
  if (roomType === 'living' && ['lounge', 'great_hall'].includes(sourceType)) return true;
  return false;
}

function normalizeRoomType(roomType) {
  return {
    entry_or_lobby: 'entry',
    living_or_hall: 'living',
    great_hall: 'living',
    corridor_or_gallery: 'corridor',
    tower_room: 'tower'
  }[roomType] || roomType || 'room';
}

function moodForRoom(room, family) {
  if (room.type === 'tower') return 'lookout';
  if (room.type === 'sunroom' || room.type === 'greenhouse') return 'lush-daylit';
  if (family === 'cyberpunk') return 'lit-urban';
  if (family === 'subterranean') return 'protected-warm-light';
  if (family === 'treehouse') return 'canopy-cozy';
  if (family === 'gothic') return 'ceremonial-stone';
  return room.privacy === 'private' ? 'quiet' : 'welcoming';
}

function accentForRoom(room, family, materials = {}) {
  if (family === 'cyberpunk') return materials.neon || 'minecraft:sea_lantern';
  if (family === 'treehouse') return materials.plant || 'minecraft:oak_leaves[persistent=true]';
  if (family === 'subterranean') return materials.path_light || 'minecraft:glowstone';
  if (room.type === 'greenhouse' || room.type === 'sunroom') return materials.plant || 'minecraft:oak_leaves[persistent=true]';
  return materials.accent || materials.trim || 'minecraft:smooth_quartz';
}

function storageForFamily(family) {
  if (family === 'cyberpunk') return 'minecraft:barrel';
  if (family === 'gothic') return 'minecraft:chest';
  if (family === 'japanese' || family === 'treehouse') return 'minecraft:barrel';
  return 'minecraft:bookshelf';
}

function floorAccentForFamily(family) {
  if (family === 'cyberpunk') return 'minecraft:cyan_carpet';
  if (family === 'subterranean') return 'minecraft:gray_carpet';
  if (family === 'treehouse') return 'minecraft:green_carpet';
  if (family === 'japanese') return 'minecraft:lime_carpet';
  return 'minecraft:white_carpet';
}

function focalFeatureForFamily(family) {
  if (family === 'alpine' || family === 'rustic') return 'hearth';
  if (family === 'cyberpunk') return 'neon-media-wall';
  if (family === 'subterranean') return 'lightwell-view';
  if (family === 'treehouse') return 'canopy-view';
  return 'seating-core';
}

function densityForRoom(room) {
  if (room.type === 'corridor' || room.type === 'stairs') return 'low';
  if (room.zone === 'service') return 'functional';
  if (room.type === 'great_hall') return 'ceremonial';
  return 'medium';
}

function semanticBudgetForRoom(room, clauses = [], design = {}) {
  const area = roomArea(room);
  if (['corridor', 'stairs'].includes(room.type)) return Math.min(4, clauses.length);
  if (area <= 18) return Math.min(5, clauses.length);
  if (area <= 36) return Math.min(8, clauses.length);
  const density = String(design.decor_density || '');
  const rich = ['layered', 'gallery', 'formal', 'rich-but-spaced'].includes(density);
  return Math.min(rich ? 22 : 18, clauses.length);
}

function roomArea(room = {}) {
  const width = Number(room.max_x) - Number(room.min_x) + 1;
  const depth = Number(room.max_z) - Number(room.min_z) + 1;
  if (!Number.isFinite(width) || !Number.isFinite(depth)) return 0;
  return Math.max(0, width) * Math.max(0, depth);
}

function lightingForFamily(family) {
  if (family === 'cyberpunk') return 'neon-and-path-lights';
  if (family === 'subterranean') return 'warm-recessed-light';
  if (family === 'gothic') return 'lantern-and-candle';
  return 'room-center-and-task-lighting';
}

function comfortStrategy(rooms, family, buildSpec = {}, design = {}) {
  const publicRooms = rooms.filter((room) => ['living', 'great_hall', 'dining', 'sunroom'].includes(room.type)).length;
  const privateRooms = rooms.filter((room) => ['bedroom', 'master_bedroom', 'study', 'tatami'].includes(room.type)).length;
  return {
    acoustic_zoning: privateRooms > 0 ? 'quiet-private-rooms-away-from-entry' : 'open-plan',
    thermal_tone: ['alpine', 'rustic', 'subterranean'].includes(family) ? 'warm-lamps-and-soft-rugs' : 'balanced-light-and-planting',
    daylight_balance: publicRooms > 0 ? 'public-rooms-prioritize-daylight' : 'distributed-daylight',
    density_target: design.decor_density || (buildSpec.scale === 'large' ? 'rich-but-spaced' : 'compact-layered'),
    color_story: design.color_story || 'style-balanced'
  };
}

function storageStrategy(rooms, family) {
  const roomTypes = new Set(rooms.map((room) => room.type));
  return {
    entry_storage: roomTypes.has('entry') ? 'bench-barrel-and-drop-zone' : 'wall-barrel',
    kitchen_storage: roomTypes.has('kitchen') ? 'pantry-upper-cabinets-and-crates' : 'general-cabinet',
    bedroom_storage: roomTypes.has('bedroom') || roomTypes.has('master_bedroom') ? 'wardrobe-chest-and-nightstand' : 'minimal',
    style_storage_block: storageForFamily(family)
  };
}

function safetyStrategy(rooms, topology = {}) {
  const floors = new Set(rooms.map((room) => Number(room.floor || 0))).size;
  return {
    stair_visibility: floors > 1 ? 'lit-and-marked' : 'not-required',
    wet_room_marking: rooms.some((room) => room.type === 'bathroom') ? 'bath-mat-and-light' : 'not-present',
    kitchen_heat_clearance: rooms.some((room) => room.type === 'kitchen') ? 'work-wall-kept-open' : 'not-present',
    graph_intent: topology.circulation_rules?.connect_all_rooms ? 'all-rooms-connected' : 'local-flow'
  };
}
