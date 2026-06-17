import { interiorSpecialistCapabilities, specialistDefinitionsForRoom } from './interiorRoomAgents.js';

export class InteriorDetailAgent {
  run(rooms = [], architecture = {}, buildSpec = {}, topology = {}, materialPalette = {}, stylePreset = {}) {
    const family = String(architecture.style_family || buildSpec.style_family || 'general');
    const roomDetails = (rooms || []).map((room) => detailForRoom(room, family, materialPalette, architecture));
    const roomSpecialists = interiorSpecialistCapabilities();
    return {
      source: 'local-interior-detail-agent',
      style_family: family,
      preset: stylePreset.id || 'none',
      room_count: roomDetails.length,
      room_details: roomDetails,
      room_specialists: roomSpecialists,
      lighting_strategy: lightingForFamily(family),
      circulation_detail: {
        vertical_core: topology.circulation_rules?.vertical_core || 'none',
        wayfinding: buildSpec.floors > 1 ? 'lit-stair-and-corridor' : 'entry-to-public-core'
      },
      engine_hints: {
        apply_room_accents: true,
        protect_circulation: true,
        add_task_lighting: true,
        add_style_storage: true,
        use_room_specialist_agents: true,
        minimum_blocks_per_specialist: 20
      }
    };
  }
}

function detailForRoom(room, family, materialPalette = {}, architecture = {}) {
  const materials = materialPalette.materials || architecture.materials || {};
  const specialists = specialistDefinitionsForRoom(room, { styleFamily: family, architecture });
  const blockCounts = specialists.map((specialist) => specialist.capability_blocks.length);
  const base = {
    room_id: room.id,
    type: room.type,
    zone: room.zone || 'public',
    mood: moodForRoom(room, family),
    accent_block: accentForRoom(room, family, materials),
    task_light: materials.path_light || materials.lamp || 'minecraft:glowstone',
    storage_block: storageForFamily(family),
    floor_accent: floorAccentForFamily(family),
    furniture_density: densityForRoom(room),
    specialist_agent: specialists[0]?.source || 'general-room-furnishing',
    specialist_agents: specialists.map((specialist) => specialist.source),
    specialist_block_count: blockCounts.length ? Math.max(...blockCounts) : 0,
    specialist_block_counts: Object.fromEntries(specialists.map((specialist) => [specialist.source, specialist.capability_blocks.length]))
  };
  if (['kitchen', 'bathroom', 'garage', 'utility'].includes(room.type)) base.service_wall = materials.secondary_wall || architecture.materials?.interior_wall || 'minecraft:light_gray_concrete';
  if (['living', 'great_hall', 'lounge'].includes(room.type)) base.focal_feature = focalFeatureForFamily(family);
  if (room.type === 'sunroom' || room.type === 'greenhouse') base.planting = materials.plant || 'minecraft:oak_leaves[persistent=true]';
  return base;
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

function lightingForFamily(family) {
  if (family === 'cyberpunk') return 'neon-and-path-lights';
  if (family === 'subterranean') return 'warm-recessed-light';
  if (family === 'gothic') return 'lantern-and-candle';
  return 'room-center-and-task-lighting';
}
