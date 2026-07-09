import { keyFor } from '../engine/csgBuilder.js';
import { isBlockingHeadroomBlock, roomBlockingBudget } from './interiorClearanceRepairAgent.js';

const SOURCE = 'local-template-interior-density-repair-agent';
const VERSION = 1;

const ROLE_TARGETS = {
  scene: 35,
  experience: 20,
  patternFallback: 8,
  patternMax: 50,
  patternPerObligation: 5,
  designFallback: 6,
  designMax: 30,
  designPerObligation: 2
};

const DENSITY_LIGHT_VARIANTS_BY_STYLE = {
  modern: ['minecraft:sea_lantern', 'minecraft:redstone_lamp', 'minecraft:pearlescent_froglight', 'minecraft:end_rod', 'minecraft:copper_bulb'],
  futuristic: ['minecraft:sea_lantern', 'minecraft:redstone_lamp', 'minecraft:pearlescent_froglight', 'minecraft:end_rod', 'minecraft:copper_bulb'],
  cyberpunk: ['minecraft:sea_lantern', 'minecraft:redstone_lamp', 'minecraft:pearlescent_froglight', 'minecraft:end_rod', 'minecraft:cyan_candle'],
  gothic: ['minecraft:soul_lantern', 'minecraft:candle', 'minecraft:blue_candle', 'minecraft:purple_candle', 'minecraft:redstone_lamp'],
  japanese: ['minecraft:lantern', 'minecraft:candle', 'minecraft:ochre_froglight', 'minecraft:verdant_froglight'],
  rustic: ['minecraft:lantern', 'minecraft:candle', 'minecraft:ochre_froglight', 'minecraft:glowstone', 'minecraft:copper_bulb'],
  nordic: ['minecraft:lantern', 'minecraft:candle', 'minecraft:ochre_froglight', 'minecraft:glowstone', 'minecraft:copper_bulb'],
  alpine: ['minecraft:lantern', 'minecraft:candle', 'minecraft:ochre_froglight', 'minecraft:glowstone', 'minecraft:copper_bulb'],
  classical: ['minecraft:glowstone', 'minecraft:lantern', 'minecraft:candle', 'minecraft:ochre_froglight', 'minecraft:pearlescent_froglight'],
  coastal: ['minecraft:sea_lantern', 'minecraft:lantern', 'minecraft:light_blue_candle', 'minecraft:pearlescent_froglight', 'minecraft:copper_bulb'],
  default: ['minecraft:glowstone', 'minecraft:lantern', 'minecraft:candle', 'minecraft:ochre_froglight', 'minecraft:pearlescent_froglight']
};

const VIBRANT_DENSITY_ANCHORS = [
  'minecraft:magenta_candle',
  'minecraft:cyan_banner',
  'minecraft:yellow_candle',
  'minecraft:potted_torchflower',
  'minecraft:orange_stained_glass_pane',
  'minecraft:purple_candle',
  'minecraft:lime_banner',
  'minecraft:potted_blue_orchid',
  'minecraft:red_candle',
  'minecraft:green_stained_glass_pane',
  'minecraft:pink_candle',
  'minecraft:blue_banner',
  'minecraft:potted_allium',
  'minecraft:light_blue_candle',
  'minecraft:decorated_pot',
  'minecraft:orange_banner',
  'minecraft:magenta_glazed_terracotta',
  'minecraft:cyan_candle'
];

export class TemplateInteriorDensityRepairAgent {
  run({
    grid,
    blueprint = {},
    architecture = blueprint.architecture || {},
    topology = blueprint.topology || {},
    interior = blueprint.interior || {},
    decorator = blueprint.decorator || {},
    layout = blueprint.layout || {}
  } = {}) {
    const context = {
      grid,
      blueprint,
      architecture,
      topology,
      interior,
      decorator,
      layout,
      materials: architecture.materials || blueprint.materialPalette?.materials || {},
      rooms: importantRooms(layout.rooms || blueprint.layout?.rooms || []),
      placementCountsByRoom: placementCountsByRoom(decorator.placements || []),
      placements: [],
      applied: [],
      gridPatchCount: 0
    };

    if (!hasTemplateInteriorSignal(context)) {
      return inactiveRepair('template-interior-density-signal-inactive', context);
    }
    if (!context.rooms.length) {
      return inactiveRepair('no-habitable-rooms-for-density-repair', context);
    }

    const before = currentCounts(context);
    const targets = targetCounts(context);
    topUpCategory(context, 'scene', before.scene, targets.scene);
    topUpCategory(context, 'experience', before.experience, targets.experience);
    topUpCategory(context, 'pattern', before.pattern, targets.pattern);
    topUpCategory(context, 'designLaw', before.designLaw, targets.designLaw);
    topUpVibrantCoverage(context);

    refreshDecoratorProfile(context.decorator, context.placements);
    const after = currentCounts(context);

    return {
      source: SOURCE,
      version: VERSION,
      active: context.placements.length > 0,
      reason: context.placements.length ? 'template-interior-density-repaired' : 'template-interior-density-already-satisfied',
      targets,
      before,
      after,
      applied_count: context.applied.length,
      grid_patch_count: context.gridPatchCount,
      placement_count: context.placements.length,
      applied: context.applied,
      placements: context.placements,
      engine_hints: {
        mutates_grid_before_export: context.gridPatchCount > 0,
        mutates_decorator_profile: context.placements.length > 0,
        repairs_template_assimilation_audit_track: 'interior-scene-density'
      }
    };
  }
}

function inactiveRepair(reason, context = {}) {
  return {
    source: SOURCE,
    version: VERSION,
    active: false,
    reason,
    targets: targetCounts(context),
    before: currentCounts(context),
    after: currentCounts(context),
    applied_count: 0,
    grid_patch_count: 0,
    placement_count: 0,
    applied: [],
    placements: []
  };
}

function hasTemplateInteriorSignal(ctx) {
  return Boolean(
    ctx.interior?.template_interior_scenes?.active ||
    ctx.interior?.template_room_experience?.active ||
    ctx.interior?.template_design_law_runtime?.active ||
    ctx.topology?.template_design_law_runtime?.active ||
    ctx.decorator?.capability_profile?.supports_template_room_patterns ||
    ctx.decorator?.capability_profile?.supports_template_design_laws ||
    ctx.blueprint?.templateLawCoverage?.active ||
    ctx.blueprint?.templateAssimilationAudit?.active
  );
}

function currentCounts(ctx) {
  const profile = ctx.decorator?.capability_profile || {};
  return {
    scene: Number(profile.template_interior_scene_placement_count || 0),
    experience: Number(profile.template_experience_placement_count || 0),
    pattern: Number(profile.template_pattern_placement_count || 0),
    designLaw: Number(profile.template_design_law_placement_count || 0)
  };
}

function targetCounts(ctx) {
  const obligationCount = runtimeObligations(ctx).length;
  return {
    scene: ROLE_TARGETS.scene,
    experience: ROLE_TARGETS.experience,
    pattern: Math.min(ROLE_TARGETS.patternMax, Math.max(ROLE_TARGETS.patternFallback, obligationCount * ROLE_TARGETS.patternPerObligation)),
    designLaw: Math.min(ROLE_TARGETS.designMax, Math.max(ROLE_TARGETS.designFallback, obligationCount * ROLE_TARGETS.designPerObligation))
  };
}

function topUpCategory(ctx, category, current, target) {
  let count = Number(current || 0);
  let attempts = 0;
  const maxAttempts = Math.max(48, (target - count) * 20);
  while (count < target && attempts < maxAttempts) {
    const room = ctx.rooms[attempts % ctx.rooms.length];
    if (addDensityPlacement(ctx, room, category, attempts)) count += 1;
    attempts += 1;
  }
  if (count > current) {
    ctx.applied.push({
      id: `repair-${category}-density`,
      before: current,
      after: count,
      target
    });
  }
}

function addDensityPlacement(ctx, room, category, slot) {
  if (!roomHasDensityCapacity(ctx, room)) return false;
  const spec = densitySpec(ctx, room, category, slot);
  if (!spec) return false;
  const point = densityPoint(room, category, slot, spec.module);
  return addPlacement(ctx, room, spec.role, spec.block, point, spec.placement, spec.module);
}

function topUpVibrantCoverage(ctx) {
  const decoratedRooms = ctx.rooms.filter((room) => roomPlacementCount(ctx, room) > 0);
  if (!decoratedRooms.length) return;
  const targetRooms = Math.ceil(decoratedRooms.length * 0.6);
  const vibrantPlacements = ctx.decorator.placements.filter((item) => String(item.role || '').startsWith('vibrant'));
  const vibrantRooms = new Set(vibrantPlacements.map((item) => item.room_id).filter(Boolean));
  const vibrantBlocks = new Set(vibrantPlacements.map((item) => blockBase(item.block)).filter(Boolean));
  let slot = 0;
  let attempts = 0;
  const maxAttempts = decoratedRooms.length * VIBRANT_DENSITY_ANCHORS.length;

  while ((vibrantRooms.size < targetRooms || vibrantBlocks.size < 10) && attempts < maxAttempts) {
    const room = nextVibrantRoom(decoratedRooms, vibrantRooms, attempts);
    if (roomHasVibrantCapacity(ctx, room)) {
      const block = nextVibrantBlock(room, slot, vibrantBlocks);
      const module = vibrantAnchorModule(block);
      const point = vibrantDensityPoint(room, slot, module);
      const role = `vibrant-density-anchor-${normalizeRoleToken(room.type || room.id)}-${slot + 1}`;
      if (addPlacement(ctx, room, role, block, point, 'vibrant-density-room-color-anchor', module)) {
        vibrantRooms.add(room.id);
        vibrantBlocks.add(blockBase(block));
        slot += 1;
      }
    }
    attempts += 1;
  }
}

function nextVibrantRoom(rooms = [], vibrantRooms = new Set(), attempts = 0) {
  const missing = rooms.filter((room) => !vibrantRooms.has(room.id));
  const pool = missing.length ? missing : rooms;
  return pool[attempts % pool.length];
}

function nextVibrantBlock(room = {}, slot = 0, usedBlocks = new Set()) {
  const start = hashKey(`${room.id || ''}:${room.type || ''}:${room.min_x || 0}:${room.min_z || 0}:${slot}`) % VIBRANT_DENSITY_ANCHORS.length;
  for (let offset = 0; offset < VIBRANT_DENSITY_ANCHORS.length; offset += 1) {
    const block = VIBRANT_DENSITY_ANCHORS[(start + offset) % VIBRANT_DENSITY_ANCHORS.length];
    if (!usedBlocks.has(blockBase(block))) return block;
  }
  return VIBRANT_DENSITY_ANCHORS[start];
}

function vibrantAnchorModule(block) {
  const base = blockBase(block);
  if (/_banner$|_stained_glass_pane$|decorated_pot$/.test(base)) return 'decor_detail';
  if (/_candle$|froglight$|redstone_lamp$|copper_bulb$|end_rod$/.test(base)) return 'decor_light';
  if (/potted_/.test(base)) return 'decor_plant';
  return 'decor_floor';
}

function vibrantDensityPoint(room, slot, module) {
  const side = ['north', 'east', 'south', 'west'][slot % 4];
  const offset = (Math.floor(slot / 4) % 3) - 1;
  const point = module === 'decor_floor' ? centerPoint(room, module) : edgePoint(room, side, offset, module);
  if (module === 'decor_detail') return { ...point, y: Math.min(room.min_y + 1, room.max_y) };
  return point;
}

function densitySpec(ctx, room, category, slot) {
  const light = densityLightBlock(ctx, room, category, slot);
  const accent = ctx.materials.accent || ctx.materials.trim || 'minecraft:smooth_quartz';
  const seat = seatingBlockForStyle(ctx.architecture?.style_family);
  const storage = ctx.materials.furniture || 'minecraft:barrel';
  const plant = plantBlock(ctx.materials);
  const index = Math.floor(slot / Math.max(1, ctx.rooms.length)) + 1;
  const roomToken = normalizeRoleToken(room.type || room.id || 'room');
  if (category === 'scene') {
    const variants = [
      ['soft-frame', 'minecraft:white_carpet', 'decor_floor'],
      ['accent-light', light, 'decor_light'],
      ['plant-softener', plant, 'decor_plant'],
      ['threshold-marker', 'minecraft:oak_pressure_plate', 'decor_floor'],
      ['detail-vessel', 'minecraft:flower_pot', 'decor_detail']
    ];
    const [name, block, module] = variants[slot % variants.length];
    return {
      role: `template-scene-density-${roomToken}-${name}-${index}`,
      block,
      module,
      placement: `template-interior-scene-density-${name}`
    };
  }
  if (category === 'experience') {
    const variants = [
      ['threshold-rug', 'minecraft:white_carpet', 'decor_floor'],
      ['view-light', light, 'decor_light'],
      ['soft-plant', plant, 'decor_plant'],
      ['memory-marker', 'minecraft:flower_pot', 'decor_detail'],
      ['view-threshold', 'minecraft:oak_pressure_plate', 'decor_floor']
    ];
    const [name, block, module] = variants[slot % variants.length];
    return {
      role: `template-experience-density-${roomToken}-${name}-${index}`,
      block,
      module,
      placement: `template-room-experience-density-${name}`
    };
  }
  if (category === 'pattern') {
    const variants = patternVariantsForRoom(room, ctx, slot);
    const [name, block, module] = variants[slot % variants.length];
    return {
      role: `template-pattern-density-${roomToken}-${name}-${index}`,
      block,
      module,
      placement: `template-pattern-density-${name}`
    };
  }
  if (category === 'designLaw') {
    const variants = [
      ['focal-marker', 'minecraft:stone_button[face=wall,facing=south]', 'decor_detail'],
      ['task-light', light, 'decor_light'],
      ['soft-detail', plant, 'decor_plant'],
      ['circulation-rug', 'minecraft:white_carpet', 'decor_floor'],
      ['memory-vessel', 'minecraft:flower_pot', 'decor_detail']
    ];
    const [name, block, module] = variants[slot % variants.length];
    return {
      role: `design-law-density-${roomToken}-${name}-${index}`,
      block,
      module,
      placement: `design-law-interior-density-${name}`
    };
  }
  return undefined;
}

function patternVariantsForRoom(room, ctx) {
  const light = ctx.materials.lamp || lightBlockForStyle(ctx.architecture?.style_family, ctx.materials);
  const plant = plantBlock(ctx.materials);
  if (room.type === 'kitchen') {
    return [
      ['task-light', light, 'decor_light'],
      ['prep-run-rug', 'minecraft:white_carpet', 'decor_floor'],
      ['herb-pot', plant, 'decor_plant'],
      ['work-threshold', 'minecraft:oak_pressure_plate', 'decor_floor']
    ];
  }
  if (['bedroom', 'master_bedroom'].includes(room.type)) {
    return [
      ['reading-light', light, 'decor_light'],
      ['soft-rug', 'minecraft:white_carpet', 'decor_floor'],
      ['bedside-plant', plant, 'decor_plant'],
      ['sleep-threshold', 'minecraft:oak_pressure_plate', 'decor_floor']
    ];
  }
  if (room.type === 'study') {
    return [
      ['reading-light', light, 'decor_light'],
      ['desk-rug', 'minecraft:white_carpet', 'decor_floor'],
      ['archive-marker', 'minecraft:flower_pot', 'decor_detail'],
      ['quiet-plant', plant, 'decor_plant']
    ];
  }
  if (room.type === 'bathroom') {
    return [
      ['mirror-light', light, 'decor_light'],
      ['bath-mat', 'minecraft:white_carpet', 'decor_floor'],
      ['soft-plant', plant, 'decor_plant'],
      ['threshold-marker', 'minecraft:oak_pressure_plate', 'decor_floor']
    ];
  }
  return [
    ['rug', 'minecraft:white_carpet', 'decor_floor'],
    ['layered-light', light, 'decor_light'],
    ['plant-softener', plant, 'decor_plant'],
    ['display-vessel', 'minecraft:flower_pot', 'decor_detail'],
    ['threshold-marker', 'minecraft:oak_pressure_plate', 'decor_floor']
  ];
}

function addPlacement(ctx, room, role, block, point, placement, module) {
  if (!room || !point || !block) return false;
  ctx.decorator.placements ||= [];
  if (ctx.decorator.placements.some((item) => item.role === role && item.room_id === room.id)) return false;
  const at = normalizePointForRoom(room, point, module);
  const free = findFreeRoomPoint(ctx.grid, room, at, module);
  if (!free) return false;
  if (ctx.grid) {
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
  ctx.decorator.placements.push(placementItem);
  ctx.placements.push(placementItem);
  ctx.placementCountsByRoom.set(room.id, roomPlacementCount(ctx, room) + 1);
  return true;
}

function placementCountsByRoom(placements = []) {
  const counts = new Map();
  for (const item of placements) {
    if (!item?.room_id) continue;
    counts.set(item.room_id, (counts.get(item.room_id) || 0) + 1);
  }
  return counts;
}

function roomHasDensityCapacity(ctx, room) {
  return roomPlacementCount(ctx, room) < roomDensityBudget(room);
}

function roomHasVibrantCapacity(ctx, room) {
  return roomPlacementCount(ctx, room) < roomVibrantBudget(room);
}

function roomPlacementCount(ctx, room = {}) {
  return ctx.placementCountsByRoom.get(room.id) || 0;
}

function roomDensityBudget(room = {}) {
  const area = roomArea(room);
  if (area <= 0) return 0;
  if (['corridor', 'stairs'].includes(room.type)) return Math.min(area, 4);
  return Math.max(4, Math.min(area, Math.floor(area * 0.62)));
}

function roomVibrantBudget(room = {}) {
  const area = roomArea(room);
  if (area <= 0) return 0;
  if (['corridor', 'stairs'].includes(room.type)) return Math.min(area, 4);
  return Math.max(roomDensityBudget(room), Math.min(area, Math.floor(area * 0.72)));
}

function roomArea(room = {}) {
  const width = Number(room.max_x) - Number(room.min_x) + 1;
  const depth = Number(room.max_z) - Number(room.min_z) + 1;
  if (!Number.isFinite(width) || !Number.isFinite(depth)) return 0;
  return Math.max(0, width) * Math.max(0, depth);
}

function findFreeRoomPoint(grid, room, preferred, module) {
  if (!grid) return preferred;
  const candidates = candidatePoints(room, preferred, module);
  let replaceable;
  for (const point of candidates) {
    if (!canUseDensityPoint(grid, room, point, module)) continue;
    const existing = grid.get(keyFor(point.x, point.y, point.z));
    if (!existing) return point;
    if (!replaceable && String(existing.module || '').startsWith('decor_')) replaceable = point;
  }
  return replaceable;
}

function canUseDensityPoint(grid, room, point, module) {
  if (!grid || !room || !point) return true;
  if (module === 'decor_light' || module === 'decor_floor') return true;
  if (Number(room.floor || 0) !== 0) return true;
  if (point.y !== room.min_y) return true;
  const projectedBlock = densityBlockingProbeBlock(module);
  if (!isBlockingHeadroomBlock(projectedBlock)) return true;
  return roomBlockingCount(grid, room) < roomBlockingBudget(room);
}

function densityBlockingProbeBlock(module) {
  if (module === 'decor_plant') return 'minecraft:potted_azalea_bush';
  return 'minecraft:stone';
}

function roomBlockingCount(grid, room) {
  const scan = insetRoomHeadroomScan(room);
  let count = 0;
  for (let x = scan.min_x; x <= scan.max_x; x += 1) {
    for (let z = scan.min_z; z <= scan.max_z; z += 1) {
      const cell = grid.get(keyFor(x, room.min_y, z));
      if (cell && isBlockingHeadroomBlock(cell.block)) count += 1;
    }
  }
  return count;
}

function insetRoomHeadroomScan(room = {}) {
  const width = room.max_x - room.min_x + 1;
  const depth = room.max_z - room.min_z + 1;
  const insetX = width >= 5 ? 1 : 0;
  const insetZ = depth >= 5 ? 1 : 0;
  return {
    min_x: room.min_x + insetX,
    max_x: room.max_x - insetX,
    min_z: room.min_z + insetZ,
    max_z: room.max_z - insetZ
  };
}

function candidatePoints(room, preferred, module) {
  const points = [preferred];
  for (let ring = 0; ring < 4; ring += 1) {
    for (let dx = -ring; dx <= ring; dx += 1) {
      points.push({ x: preferred.x + dx, y: preferred.y, z: preferred.z - ring });
      points.push({ x: preferred.x + dx, y: preferred.y, z: preferred.z + ring });
    }
    for (let dz = -ring + 1; dz <= ring - 1; dz += 1) {
      points.push({ x: preferred.x - ring, y: preferred.y, z: preferred.z + dz });
      points.push({ x: preferred.x + ring, y: preferred.y, z: preferred.z + dz });
    }
  }
  points.push(centerPoint(room, module));
  points.push(edgePoint(room, 'north', 0, module));
  points.push(edgePoint(room, 'south', 0, module));
  points.push(edgePoint(room, 'east', 0, module));
  points.push(edgePoint(room, 'west', 0, module));
  const seen = new Set();
  return points
    .map((point) => normalizePointForRoom(room, point, module))
    .filter((point) => {
      const key = `${point.x},${point.y},${point.z}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function densityPoint(room, category, slot, module) {
  const side = ['north', 'east', 'south', 'west'][slot % 4];
  const offset = ((Math.floor(slot / 4) % 5) - 2);
  if (category === 'scene' && slot % 6 === 2) return centerPoint(room, module);
  if (category === 'experience' && slot % 5 === 1) return centerPoint(room, module);
  if (module === 'decor_floor') return centerPoint(room, module);
  return edgePoint(room, side, offset, module);
}

function normalizePointForRoom(room, point, module) {
  const minX = Math.min(room.max_x - 1, room.min_x + 1);
  const maxX = Math.max(room.min_x + 1, room.max_x - 1);
  const minZ = Math.min(room.max_z - 1, room.min_z + 1);
  const maxZ = Math.max(room.min_z + 1, room.max_z - 1);
  const y = module === 'decor_light'
    ? clampInt(point.y ?? room.max_y, room.min_y, room.max_y, room.max_y)
    : clampInt(point.y ?? room.min_y, room.min_y, room.max_y, room.min_y);
  return {
    x: clampInt(point.x, minX, maxX, Math.floor((room.min_x + room.max_x) / 2)),
    y,
    z: clampInt(point.z, minZ, maxZ, Math.floor((room.min_z + room.max_z) / 2))
  };
}

function centerPoint(room, module) {
  return {
    x: Math.floor((room.min_x + room.max_x) / 2),
    y: module === 'decor_light' ? room.max_y : room.min_y,
    z: Math.floor((room.min_z + room.max_z) / 2)
  };
}

function edgePoint(room, side = 'north', offset = 0, module) {
  const cx = Math.floor((room.min_x + room.max_x) / 2);
  const cz = Math.floor((room.min_z + room.max_z) / 2);
  const y = module === 'decor_light' ? room.max_y : room.min_y;
  if (side === 'south') return { x: cx + offset, y, z: room.max_z - 1 };
  if (side === 'east') return { x: room.max_x - 1, y, z: cz + offset };
  if (side === 'west') return { x: room.min_x + 1, y, z: cz + offset };
  return { x: cx + offset, y, z: room.min_z + 1 };
}

function refreshDecoratorProfile(decorator = {}, newPlacements = []) {
  decorator.placementCount = Number(decorator.placementCount || 0) + newPlacements.length;
  decorator.capability_profile ||= {};
  const profile = decorator.capability_profile;
  profile.template_interior_scene_placement_count = Number(profile.template_interior_scene_placement_count || 0) +
    newPlacements.filter((item) => String(item.role || '').startsWith('template-scene-')).length;
  profile.template_experience_placement_count = Number(profile.template_experience_placement_count || 0) +
    newPlacements.filter((item) => isExperienceRole(item.role)).length;
  profile.template_pattern_placement_count = Number(profile.template_pattern_placement_count || 0) +
    newPlacements.filter((item) => String(item.role || '').startsWith('template-pattern-')).length;
  profile.template_design_law_placement_count = Number(profile.template_design_law_placement_count || 0) +
    newPlacements.filter((item) => String(item.role || '').startsWith('design-law-')).length;
  profile.functional_placement_count = Number(profile.functional_placement_count || 0) +
    newPlacements.filter((item) => ['decor_furniture', 'decor_storage', 'decor_utility'].includes(item.module)).length;
  profile.supports_template_interior_scenes = profile.template_interior_scene_placement_count > 0;
  profile.supports_template_room_experience = profile.template_experience_placement_count > 0;
  profile.supports_template_room_patterns = profile.template_pattern_placement_count > 0;
  profile.supports_template_design_laws = profile.template_design_law_placement_count > 0;
  const layers = new Set([...(profile.module_layers || []), ...newPlacements.map((item) => item.module).filter(Boolean)]);
  profile.module_layers = [...layers].sort();
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

function isExperienceRole(role) {
  const text = String(role || '');
  return text.startsWith('template-') &&
    !text.startsWith('template-pattern-') &&
    !text.startsWith('template-scene-');
}

function runtimeObligations(ctx) {
  return [
    ...(ctx.topology?.template_design_law_runtime?.room_obligations || []),
    ...(ctx.interior?.template_design_law_runtime?.room_obligations || [])
  ];
}

function importantRooms(rooms = []) {
  const order = ['entry', 'living', 'great_hall', 'lounge', 'dining', 'kitchen', 'master_bedroom', 'bedroom', 'study', 'bathroom', 'sunroom', 'greenhouse', 'tatami', 'tea_room', 'utility', 'storage'];
  return [...rooms]
    .filter((room) => room && !['corridor', 'stairs', 'balcony'].includes(room.type) && room.max_x - room.min_x >= 2 && room.max_z - room.min_z >= 2)
    .sort((a, b) => orderIndex(order, a.type) - orderIndex(order, b.type));
}

function orderIndex(order, value) {
  const index = order.indexOf(value);
  return index === -1 ? order.length : index;
}

function normalizeRoleToken(value) {
  return String(value || 'room').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'room';
}

function functionalBlockForRoom(type) {
  if (type === 'kitchen') return 'minecraft:crafting_table';
  if (type === 'bathroom') return 'minecraft:cauldron';
  if (['storage', 'utility', 'garage', 'workshop'].includes(type)) return 'minecraft:barrel';
  return 'minecraft:smooth_quartz_slab[type=bottom]';
}

function plantBlock(materials = {}) {
  const plant = materials.plant || 'minecraft:potted_azalea_bush';
  return String(plant).includes('leaves') ? 'minecraft:potted_azalea_bush' : plant;
}

function lightBlockForStyle(styleFamily, materials = {}) {
  if (materials.lamp) return materials.lamp;
  if (['modern', 'futuristic', 'cyberpunk'].includes(styleFamily)) return 'minecraft:sea_lantern';
  if (styleFamily === 'gothic') return 'minecraft:soul_lantern';
  if (['rustic', 'nordic', 'alpine'].includes(styleFamily)) return 'minecraft:lantern';
  return 'minecraft:glowstone';
}

function densityLightBlock(ctx, room = {}, category = '', slot = 0) {
  const styleFamily = ctx.architecture?.style_family;
  const base = ctx.materials.lamp || lightBlockForStyle(styleFamily, ctx.materials);
  const variants = DENSITY_LIGHT_VARIANTS_BY_STYLE[styleFamily] || DENSITY_LIGHT_VARIANTS_BY_STYLE.default;
  if (!isGenericLightBlock(base)) return base;
  const offset = variants.includes(blockBase(base)) ? 0 : 1;
  return variants[(hashKey(`${room.id || ''}:${room.type || ''}:${category}:${slot}:${base}`) + offset) % variants.length];
}

function isGenericLightBlock(block) {
  return /lantern|glowstone|sea_lantern|redstone_lamp|froglight|candle|copper_bulb|end_rod/.test(blockBase(block));
}

function blockBase(block) {
  return String(block || '').split('[')[0];
}

function seatingBlockForStyle(styleFamily) {
  if (styleFamily === 'modern') return 'minecraft:smooth_quartz_stairs[facing=north,half=bottom]';
  if (styleFamily === 'japanese') return 'minecraft:bamboo_slab[type=bottom]';
  if (styleFamily === 'gothic') return 'minecraft:stone_brick_stairs[facing=north,half=bottom]';
  return 'minecraft:spruce_stairs[facing=north,half=bottom]';
}

function tableBlockForStyle(styleFamily) {
  if (['modern', 'classical'].includes(styleFamily)) return 'minecraft:smooth_quartz';
  if (styleFamily === 'gothic') return 'minecraft:chiseled_stone_bricks';
  if (styleFamily === 'japanese') return 'minecraft:bamboo_planks';
  return 'minecraft:oak_planks';
}

function clampInt(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function hashKey(value) {
  let hash = 0;
  for (const char of String(value || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}
