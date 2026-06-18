const PUBLIC_LOUNGE_TYPES = new Set(['living', 'great_hall', 'lounge', 'family_lounge']);
const DINING_TYPES = new Set(['dining']);
const GARDEN_ROOM_TYPES = new Set(['sunroom', 'greenhouse', 'tea_room', 'tatami']);
const SERVICE_KITCHEN_TYPES = new Set(['kitchen']);
const SERVICE_WET_TYPES = new Set(['bathroom']);
const UTILITY_TYPES = new Set(['utility', 'storage', 'garage', 'workshop']);
const SLEEP_TYPES = new Set(['bedroom', 'master_bedroom']);
const STUDY_TYPES = new Set(['study']);

export function buildTemplateInteriorSceneStrategy({
  rooms = [],
  roomDetails = [],
  architecture = {},
  buildSpec = {},
  topology = {},
  templateRoomExperience = {}
} = {}) {
  if (!templateRoomExperience?.active) return { active: false, reason: 'template-room-experience-inactive' };

  const roomList = Array.isArray(rooms) ? rooms : [];
  const detailByRoom = new Map((Array.isArray(roomDetails) ? roomDetails : []).map((detail) => [detail.room_id, detail]));
  const experienceByRoom = new Map((templateRoomExperience.room_experiences || []).map((item) => [item.room_id, item]));
  const viewSide = normalizeSide(templateRoomExperience.view_side || topology.template_space_plan?.view_side || buildSpec.door_side || 'south');
  const serviceSide = normalizeSide(templateRoomExperience.service_side || topology.template_space_plan?.service_side || sideClockwise(viewSide));
  const quietSide = normalizeSide(templateRoomExperience.quiet_side || topology.template_space_plan?.quiet_side || oppositeSide(viewSide));
  const scenes = roomList
    .map((room) => sceneForRoom(room, {
      detail: detailByRoom.get(room.id) || {},
      experience: experienceByRoom.get(room.id) || {},
      viewSide,
      serviceSide,
      quietSide,
      architecture,
      buildSpec
    }))
    .filter((scene) => scene.active);

  return {
    active: scenes.length > 0,
    source: 'template-interior-scene-strategy-v1',
    readiness: scenes.length >= 4 ? templateRoomExperience.readiness || 'high' : 'partial',
    view_side: viewSide,
    service_side: serviceSide,
    quiet_side: quietSide,
    room_scene_count: scenes.length,
    scene_types: [...new Set(scenes.map((scene) => scene.scene_type))],
    room_scenes: scenes,
    directives: {
      compose_rooms_as_furniture_groups: true,
      preserve_scene_clearances: true,
      face_public_groups_to_view: scenes.some((scene) => scene.scene_type === 'view-lounge-scene'),
      use_kitchen_islands_when_possible: scenes.some((scene) => scene.scene_type === 'kitchen-island-scene'),
      make_sleep_and_study_scenes_quiet: scenes.some((scene) => ['sleep-suite-scene', 'study-reading-scene'].includes(scene.scene_type))
    }
  };
}

export function roomInteriorSceneFor(room = {}, strategy = {}) {
  const roomId = room.id || room.room_id;
  const scenes = Array.isArray(strategy.room_scenes) ? strategy.room_scenes : [];
  return scenes.find((scene) => scene.room_id === roomId) || { active: false, scene_type: 'none', components: [] };
}

function sceneForRoom(room = {}, context = {}) {
  const type = normalizeRoomType(room.type);
  const experience = context.experience || {};
  if (!experience.role || experience.role === 'neutral') return inactive(room, 'neutral-template-room');

  if (type === 'entry' || experience.role === 'entry-axis') {
    return buildScene(room, context, 'entry-arrival-scene', [
      component('arrival_runner', 'floor-axis', 'template-scene-entry-runner'),
      component('entry_bench', 'edge-seat', 'template-scene-entry-bench'),
      component('coat_storage', 'storage-wall', 'template-scene-coat-storage'),
      component('arrival_console', 'display-ledge', 'template-scene-arrival-console'),
      component('entry_pendant', 'axis-light', 'template-scene-entry-pendant')
    ], ['scene-entry-threshold', 'scene-arrival-axis', 'scene-storage-before-public-core']);
  }

  if (DINING_TYPES.has(type)) {
    return buildScene(room, context, 'view-dining-scene', [
      component('dining_table', 'center-piece', 'template-scene-dining-table'),
      component('paired_seats', 'conversation-pair', 'template-scene-dining-chair'),
      component('dining_pendant', 'table-light', 'template-scene-dining-pendant'),
      component('sideboard', 'service-edge', 'template-scene-dining-sideboard'),
      component('view_rug', 'floor-frame', 'template-scene-dining-rug'),
      component('window_planter', 'view-softener', 'template-scene-window-planter')
    ], ['scene-dining-table-centers-view', 'scene-sideboard-on-service-edge', 'scene-pendant-over-table']);
  }

  if (PUBLIC_LOUNGE_TYPES.has(type)) {
    return buildScene(room, context, 'view-lounge-scene', [
      component('sofa_group', 'primary-seating', 'template-scene-sofa-primary'),
      component('side_seating', 'secondary-seating', 'template-scene-sofa-side'),
      component('coffee_table', 'center-piece', 'template-scene-coffee-table'),
      component('view_rug', 'floor-frame', 'template-scene-view-rug'),
      component('focal_wall', 'view-wall-response', 'template-scene-focal-wall'),
      component('side_table', 'support-surface', 'template-scene-side-table'),
      component('corner_plant', 'soft-corner', 'template-scene-corner-plant')
    ], ['scene-lounge-seats-face-view', 'scene-low-center-table', 'scene-view-wall-kept-readable']);
  }

  if (GARDEN_ROOM_TYPES.has(type)) {
    return buildScene(room, context, 'garden-room-scene', [
      component('planting_edge', 'green-edge', 'template-scene-planting-edge'),
      component('low_table', 'center-piece', 'template-scene-garden-table'),
      component('reading_seat', 'view-seat', 'template-scene-garden-seat'),
      component('garden_lantern', 'soft-light', 'template-scene-garden-light'),
      component('display_pot', 'garden-display', 'template-scene-display-pot')
    ], ['scene-indoor-garden-edge', 'scene-low-garden-table', 'scene-seat-near-green-view']);
  }

  if (SERVICE_KITCHEN_TYPES.has(type)) {
    return buildScene(room, context, 'kitchen-island-scene', [
      component('service_wall', 'work-wall', 'template-scene-kitchen-service-wall'),
      component('prep_run', 'counter-run', 'template-scene-kitchen-prep'),
      component('kitchen_island', 'center-piece', 'template-scene-kitchen-island'),
      component('bar_seating', 'social-edge', 'template-scene-bar-stool'),
      component('pantry_column', 'storage-wall', 'template-scene-pantry-column'),
      component('task_lights', 'work-light', 'template-scene-kitchen-task-light')
    ], ['scene-kitchen-service-wall', 'scene-island-between-service-and-public', 'scene-bar-edge-faces-public-room']);
  }

  if (SERVICE_WET_TYPES.has(type)) {
    return buildScene(room, context, 'bath-spa-scene', [
      component('wet_wall', 'wet-wall', 'template-scene-bath-wet-wall'),
      component('vanity', 'service-edge', 'template-scene-vanity'),
      component('privacy_screen', 'screen-edge', 'template-scene-bath-screen'),
      component('bath_mat', 'floor-frame', 'template-scene-bath-mat'),
      component('mirror_light', 'task-light', 'template-scene-mirror-light')
    ], ['scene-wet-wall-consolidated', 'scene-privacy-away-from-view', 'scene-soft-floor-mat']);
  }

  if (UTILITY_TYPES.has(type)) {
    return buildScene(room, context, 'utility-wall-scene', [
      component('utility_bench', 'work-wall', 'template-scene-utility-bench'),
      component('tool_storage', 'storage-wall', 'template-scene-utility-storage'),
      component('task_light', 'work-light', 'template-scene-utility-task-light')
    ], ['scene-service-run', 'scene-storage-off-public-view']);
  }

  if (SLEEP_TYPES.has(type)) {
    return buildScene(room, context, 'sleep-suite-scene', [
      component('bed_anchor', 'sleep-anchor', 'template-scene-bed'),
      component('headboard_wall', 'focal-wall', 'template-scene-bed-headboard'),
      component('bedside_pair', 'paired-storage', 'template-scene-bedside'),
      component('wardrobe_wall', 'storage-wall', 'template-scene-wardrobe'),
      component('soft_rug', 'floor-frame', 'template-scene-bedroom-rug'),
      component('reading_lights', 'task-light', 'template-scene-bed-reading-light')
    ], ['scene-bed-headboard-away-from-view-glass', 'scene-bedside-pair', 'scene-wardrobe-on-side-wall']);
  }

  if (STUDY_TYPES.has(type)) {
    return buildScene(room, context, 'study-reading-scene', [
      component('desk_anchor', 'work-anchor', 'template-scene-study-desk'),
      component('bookcase_wall', 'library-wall', 'template-scene-study-bookcase'),
      component('reading_chair', 'quiet-seat', 'template-scene-reading-chair'),
      component('side_table', 'support-surface', 'template-scene-study-side-table'),
      component('desk_light', 'task-light', 'template-scene-study-light')
    ], ['scene-desk-faces-quiet-window', 'scene-library-wall-away-from-main-view', 'scene-reading-corner']);
  }

  return inactive(room, 'unsupported-room-type');
}

function buildScene(room = {}, context = {}, sceneType, components = [], clauses = []) {
  const experience = context.experience || {};
  const viewSide = normalizeSide(experience.view_side || context.viewSide);
  const primaryWindowSide = normalizeSide(experience.primary_window_side || viewSide);
  const anchorWall = normalizeSide(experience.anchor_wall || oppositeSide(primaryWindowSide));
  const sideWall = normalizeSide(experience.side_wall || sideClockwise(primaryWindowSide));
  return {
    active: true,
    room_id: room.id,
    room_type: normalizeRoomType(room.type),
    scene_id: `${room.id || 'room'}:${sceneType}`,
    scene_type: sceneType,
    template_role: experience.role,
    quality: sceneQualityFor(room, components.length),
    components,
    component_ids: components.map((item) => item.id),
    placement_roles: components.flatMap((item) => item.placement_roles),
    layout_hints: {
      view_side: viewSide,
      primary_window_side: primaryWindowSide,
      furniture_facing: normalizeSide(experience.furniture_facing || primaryWindowSide),
      anchor_wall: anchorWall,
      focal_wall: normalizeSide(experience.focal_wall || primaryWindowSide),
      side_wall: sideWall,
      service_wall: normalizeSide(context.serviceSide || sideClockwise(viewSide)),
      quiet_wall: normalizeSide(context.quietSide || oppositeSide(viewSide)),
      center_clearance: 'keep-path-through-middle-readable'
    },
    clauses,
    source_experience_clauses: experience.clauses || []
  };
}

function component(id, role, placementRole) {
  return {
    id,
    role,
    placement_roles: Array.isArray(placementRole) ? placementRole : [placementRole],
    required: true
  };
}

function inactive(room = {}, reason) {
  return {
    active: false,
    room_id: room.id,
    room_type: normalizeRoomType(room.type),
    reason
  };
}

function sceneQualityFor(room = {}, componentCount = 0) {
  const width = Number(room.max_x) - Number(room.min_x) + 1;
  const depth = Number(room.max_z) - Number(room.min_z) + 1;
  const area = Number.isFinite(width * depth) ? width * depth : 0;
  if (area >= 56 && componentCount >= 6) return 'rich';
  if (area >= 30 && componentCount >= 5) return 'complete';
  return 'compact';
}

function normalizeRoomType(roomType) {
  return {
    entry_or_lobby: 'entry',
    living_or_hall: 'living',
    great_hall: 'great_hall',
    family_lounge: 'lounge',
    corridor_or_gallery: 'corridor',
    tower_room: 'tower'
  }[roomType] || roomType || 'room';
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
    west: 'east'
  }[normalizeSide(side)] || 'north';
}

function sideClockwise(side) {
  return {
    north: 'east',
    east: 'south',
    south: 'west',
    west: 'north'
  }[normalizeSide(side)] || 'west';
}
