const PUBLIC_TYPES = new Set(['living', 'great_hall', 'lounge', 'dining', 'sunroom', 'greenhouse']);
const SERVICE_TYPES = new Set(['kitchen', 'bathroom', 'utility', 'storage', 'garage', 'workshop']);
const QUIET_TYPES = new Set(['bedroom', 'master_bedroom', 'study', 'tatami', 'tea_room', 'chapel']);

export function buildTemplateRoomExperienceStrategy({ rooms = [], architecture = {}, buildSpec = {}, topology = {} } = {}) {
  const spacePlan = topology.template_space_plan || architecture.generation_hints?.template_space_plan || {};
  if (!spacePlan.active) return { active: false, reason: 'template-space-plan-inactive' };

  const roomList = Array.isArray(rooms) ? rooms : [];
  const viewSide = normalizeSide(spacePlan.view_side || topology.bsp_hints?.template_view_side || buildSpec.door_side || 'south');
  const serviceSide = normalizeSide(spacePlan.service_side || topology.bsp_hints?.template_service_side || sideClockwise(viewSide));
  const quietSide = normalizeSide(spacePlan.quiet_side || topology.bsp_hints?.template_quiet_side || oppositeSide(viewSide));
  const publicRoomIds = new Set([
    ...(topology.facade_alignment?.template_public_view_rooms || []),
    ...roomList.filter((room) => hasTag(room, 'template-view-facing')).map((room) => room.id)
  ]);
  const quietRoomIds = new Set(topology.facade_alignment?.template_quiet_rooms || []);
  const experiences = roomList.map((room) => roomExperience(room, {
    viewSide,
    serviceSide,
    quietSide,
    publicRoomIds,
    quietRoomIds,
    spacePlan
  }));
  const activeExperiences = experiences.filter((item) => item.role !== 'neutral');
  const openingPlan = buildOpeningPlan(activeExperiences, { viewSide, serviceSide, quietSide, buildSpec });

  return {
    active: true,
    source: 'template-room-experience-strategy-v1',
    readiness: spacePlan.readiness || 'unknown',
    view_side: viewSide,
    service_side: serviceSide,
    quiet_side: quietSide,
    axis: ['north', 'south'].includes(viewSide) ? 'z' : 'x',
    entry_sequence: spacePlan.entry_sequence || {},
    room_experiences: activeExperiences,
    opening_plan: openingPlan,
    directives: {
      align_public_furniture_to_view: activeExperiences.some((item) => item.role === 'public-view'),
      protect_view_wall_from_storage: true,
      put_service_fixtures_on_service_side: activeExperiences.some((item) => item.role === 'service-band'),
      put_quiet_work_on_quiet_side: activeExperiences.some((item) => item.role === 'quiet-retreat'),
      mark_entry_axis: activeExperiences.some((item) => item.role === 'entry-axis')
    }
  };
}

export function roomExperienceFor(room = {}, strategy = {}) {
  const experiences = Array.isArray(strategy.room_experiences) ? strategy.room_experiences : [];
  return experiences.find((item) => item.room_id === room.id) || { active: false, role: 'neutral' };
}

function roomExperience(room = {}, context = {}) {
  const type = String(room.type || 'room');
  const orientation = normalizedOrientation(room.orientation);
  const isPublicView = context.publicRoomIds.has(room.id) || hasTag(room, 'template-public-view-axis') || PUBLIC_TYPES.has(type) && orientation === context.viewSide;
  const isService = SERVICE_TYPES.has(type) || hasTag(room, 'template-service-band');
  const isQuiet = QUIET_TYPES.has(type) || context.quietRoomIds.has(room.id) || hasTag(room, 'template-quiet-side');
  const isEntry = type === 'entry' || room.id === 'entry' || hasTag(room, 'template-axis-entry');

  if (isEntry) {
    return dropUndefined({
      room_id: room.id,
      room_type: type,
      role: 'entry-axis',
      view_side: context.viewSide,
      primary_window_side: context.viewSide,
      furniture_facing: context.viewSide,
      anchor_wall: oppositeSide(context.viewSide),
      focal_wall: context.viewSide,
      clauses: ['template-entry-axis-runner', 'template-arrival-view-glimpse'],
      opening_priority: 'entry-threshold'
    });
  }

  if (isPublicView) {
    return dropUndefined({
      room_id: room.id,
      room_type: type,
      role: 'public-view',
      view_side: context.viewSide,
      primary_window_side: context.viewSide,
      furniture_facing: context.viewSide,
      anchor_wall: oppositeSide(context.viewSide),
      focal_wall: context.viewSide,
      side_wall: sideClockwise(context.viewSide),
      clauses: ['template-view-seat', 'template-view-frame-interior', 'template-public-furniture-faces-view'],
      opening_priority: ['living', 'great_hall', 'lounge', 'sunroom', 'greenhouse'].includes(type) ? 'view-door-or-large-glass' : 'view-window'
    });
  }

  if (isService) {
    return dropUndefined({
      room_id: room.id,
      room_type: type,
      role: 'service-band',
      view_side: context.viewSide,
      primary_window_side: context.serviceSide,
      furniture_facing: oppositeSide(context.serviceSide),
      anchor_wall: context.serviceSide,
      focal_wall: context.serviceSide,
      clauses: ['template-service-work-wall', 'template-service-kept-off-view-wall'],
      opening_priority: type === 'kitchen' ? 'service-daylight-window' : 'small-service-window'
    });
  }

  if (isQuiet) {
    const quietView = orientation === 'courtyard' ? 'courtyard' : context.quietSide;
    return dropUndefined({
      room_id: room.id,
      room_type: type,
      role: 'quiet-retreat',
      view_side: context.viewSide,
      primary_window_side: quietView,
      furniture_facing: quietView === 'courtyard' ? context.quietSide : quietView,
      anchor_wall: oppositeSide(quietView === 'courtyard' ? context.quietSide : quietView),
      focal_wall: quietView,
      clauses: type === 'study'
        ? ['template-quiet-desk-faces-garden', 'template-library-wall-away-from-view']
        : ['template-bed-away-from-view-glass', 'template-quiet-window-seat'],
      opening_priority: type === 'study' ? 'quiet-work-window' : 'quiet-sleep-window'
    });
  }

  return {
    room_id: room.id,
    room_type: type,
    role: 'neutral'
  };
}

function buildOpeningPlan(experiences = [], { viewSide, serviceSide, quietSide, buildSpec = {} }) {
  const publicViewRooms = experiences.filter((item) => item.role === 'public-view').map((item) => item.room_id);
  const serviceRooms = experiences.filter((item) => item.role === 'service-band').map((item) => item.room_id);
  const quietRooms = experiences.filter((item) => item.role === 'quiet-retreat').map((item) => item.room_id);
  const entryRooms = experiences.filter((item) => item.role === 'entry-axis').map((item) => item.room_id);
  return {
    primary_view_side: viewSide,
    public_view_rooms: publicViewRooms,
    terrace_door_rooms: publicViewRooms.slice(0, buildSpec.scale === 'large' ? 3 : 2),
    service_window_side: serviceSide,
    service_window_rooms: serviceRooms,
    quiet_window_side: quietSide,
    quiet_window_rooms: quietRooms,
    entry_axis_rooms: entryRooms,
    window_groups: [
      { side: viewSide, priority_rooms: publicViewRooms, role: 'view-glass', glazing_ratio: 'high' },
      { side: serviceSide, priority_rooms: serviceRooms, role: 'service-window', glazing_ratio: 'medium' },
      { side: quietSide, priority_rooms: quietRooms, role: 'quiet-window', glazing_ratio: 'medium' }
    ].filter((item) => item.priority_rooms.length)
  };
}

function normalizedOrientation(value) {
  if (String(value || '').toLowerCase() === 'courtyard') return 'courtyard';
  return normalizeSide(value);
}

function normalizeSide(value) {
  const text = String(value || '').toLowerCase();
  if (/north|北/.test(text)) return 'north';
  if (/east|东/.test(text)) return 'east';
  if (/west|西/.test(text)) return 'west';
  return 'south';
}

function oppositeSide(side) {
  return {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east',
    courtyard: 'south'
  }[String(side || 'south')] || 'north';
}

function sideClockwise(side) {
  return {
    north: 'east',
    east: 'south',
    south: 'west',
    west: 'north',
    courtyard: 'east'
  }[String(side || 'south')] || 'west';
}

function hasTag(room = {}, tag) {
  return Array.isArray(room.tags) && room.tags.includes(tag);
}

function dropUndefined(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
