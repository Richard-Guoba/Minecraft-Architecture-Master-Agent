import { buildTemplateRoomExperienceStrategy } from './templateRoomExperienceStrategy.js';

export class OpeningConnectivityAgent {
  run(prompt = '', architecture = {}, buildSpec = {}, topology = {}, shell = {}, layout = {}, facade = {}) {
    const rooms = Array.isArray(layout.rooms) ? layout.rooms : [];
    const doors = Array.isArray(layout.interiorDoors) ? layout.interiorDoors : [];
    const templateRoomExperience = buildTemplateRoomExperienceStrategy({ rooms, architecture, buildSpec, topology });
    const floorCount = Number(buildSpec.floors || 1);
    const frontSide = facade.front_side || architecture.facade_rules?.front_side || buildSpec.door_side || 'south';
    const largeEntry = /大门|双开门|宽门|门厅|玻璃门/.test(prompt) || buildSpec.scale === 'large' || architecture.facade_rules?.arches;
    const width = Math.max(Number(buildSpec.door_width || 1), largeEntry ? 2 : 1);
    const height = Math.max(Number(buildSpec.door_height || 2), architecture.facade_rules?.arches ? 4 : 2);
    const accessible = /无障碍|轮椅|坡道|老人友好|accessible|wheelchair|ramp/i.test(prompt);
    const fireSafety = /防火|逃生|安全出口|fire|egress|emergency/i.test(prompt) || floorCount > 2;
    const daylightRooms = rooms
      .filter((room) => Number(room.floor || 0) === 0 || ['living', 'study', 'bedroom', 'sunroom', 'greenhouse'].includes(room.type))
      .filter((room) => !['bathroom', 'storage', 'utility'].includes(room.type))
      .map((room) => room.id)
      .slice(0, 12);

    return {
      source: 'local-opening-connectivity-agent',
      main_entry: {
        side: frontSide,
        width,
        height,
        target_room: selectEntryRoom(rooms)?.id || 'entry',
        strategy: architecture.facade_rules?.arches ? 'ceremonial-arched-entry' : 'direct-entry'
      },
      secondary_exits: secondaryExits(rooms, frontSide, fireSafety),
      emergency_egress: {
        enabled: fireSafety,
        preferred_rooms: rooms.filter((room) => ['bedroom', 'master_bedroom', 'study', 'workshop'].includes(room.type)).map((room) => room.id),
        strategy: fireSafety ? 'opposite-side-exit-or-large-egress-window' : 'main-entry-plus-windows'
      },
      window_openings: plannedWindows(rooms, facade, buildSpec, templateRoomExperience),
      template_room_experience: templateRoomExperience,
      view_thresholds: viewThresholds(templateRoomExperience),
      daylight_targets: daylightRooms,
      interior_thresholds: doors.map((door) => ({
        kind: door.kind,
        floor: door.floor,
        axis: door.axis,
        connects: door.connects || [],
        source: door.source
      })),
      attached_links: doors.filter((door) => door.kind === 'attached-volume').map((door) => ({
        source: door.source,
        connects: door.connects || []
      })),
      vertical_openings: floorCount > 1 ? [{ floors: [0, floorCount - 1], strategy: 'stair-core-openings' }] : [],
      safety_clearances: {
        protect_modules: ['structural_frame', 'bracing', 'retaining_wall', 'foundation_anchor'],
        min_door_height: height,
        min_route_width: accessible ? 2 : width >= 3 ? 2 : 1,
        accessible_turning_rooms: accessible ? rooms.filter((room) => ['entry', 'living', 'bathroom'].includes(room.type)).map((room) => room.id) : []
      },
      engine_hints: {
        prefer_wide_entry: width >= 2,
        use_facade_side: frontSide,
        protect_structural_modules: true,
        prefer_accessible_routes: accessible,
        protect_egress_routes: fireSafety,
        planned_daylight_room_count: daylightRooms.length,
        template_view_opening_count: templateRoomExperience.opening_plan?.public_view_rooms?.length || 0,
        template_terrace_door_count: templateRoomExperience.opening_plan?.terrace_door_rooms?.length || 0,
        planned_opening_count: 1 + doors.length + (floorCount > 1 ? floorCount - 1 : 0)
      }
    };
  }
}

function selectEntryRoom(rooms) {
  return rooms.find((room) => room.id === 'entry') ||
    rooms.find((room) => room.type === 'entry') ||
    rooms.find((room) => room.zone === 'public');
}

function plannedWindows(rooms, facade = {}, buildSpec = {}, templateRoomExperience = {}) {
  const highGlazing = facade.window_system?.glazing_ratio === 'high' || buildSpec.facade?.large_glass;
  const publicRooms = rooms
    .filter((room) => Number(room.floor || 0) === 0)
    .filter((room) => ['living', 'great_hall', 'lounge', 'sunroom', 'greenhouse', 'dining'].includes(room.type))
    .map((room) => room.id);
  const base = [{
    side: facade.front_side || buildSpec.door_side || 'south',
    priority_rooms: publicRooms,
    rhythm: facade.window_system?.rhythm || 'balanced',
    glazing_ratio: highGlazing ? 'high' : facade.window_system?.glazing_ratio || 'medium'
  }];
  const templateGroups = templateRoomExperience.opening_plan?.window_groups || [];
  if (!templateGroups.length) return base;
  return [
    ...templateGroups.map((group) => ({
      side: group.side,
      priority_rooms: group.priority_rooms,
      rhythm: group.role === 'view-glass' ? 'view-framed' : facade.window_system?.rhythm || 'balanced',
      glazing_ratio: group.glazing_ratio || (group.role === 'view-glass' ? 'high' : 'medium'),
      template_role: group.role,
      source: 'template-room-experience-strategy-v1'
    })),
    ...base.filter((item) => !templateGroups.some((group) => group.side === item.side))
  ];
}

function viewThresholds(templateRoomExperience = {}) {
  const plan = templateRoomExperience.opening_plan || {};
  return (plan.terrace_door_rooms || []).map((roomId) => ({
    room_id: roomId,
    side: plan.primary_view_side || templateRoomExperience.view_side || 'south',
    target: 'view-deck-or-water-edge',
    relation: 'template-public-room-to-outdoor-view-threshold'
  }));
}

function secondaryExits(rooms, frontSide, enabled) {
  if (!enabled) return [];
  const side = oppositeSide(frontSide);
  return rooms
    .filter((room) => Number(room.floor || 0) === 0)
    .filter((room) => ['living', 'kitchen', 'workshop', 'garage', 'corridor'].includes(room.type))
    .slice(0, 2)
    .map((room) => ({
      target_room: room.id,
      side,
      type: room.type === 'garage' ? 'service-exit' : 'egress-door'
    }));
}

function oppositeSide(side) {
  return {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east'
  }[String(side || 'south')] || 'north';
}
