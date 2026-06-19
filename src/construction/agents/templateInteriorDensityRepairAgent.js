import { keyFor } from '../engine/csgBuilder.js';

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
  const spec = densitySpec(ctx, room, category, slot);
  if (!spec) return false;
  const point = densityPoint(room, category, slot, spec.module);
  return addPlacement(ctx, room, spec.role, spec.block, point, spec.placement, spec.module);
}

function densitySpec(ctx, room, category, slot) {
  const light = ctx.materials.lamp || lightBlockForStyle(ctx.architecture?.style_family, ctx.materials);
  const accent = ctx.materials.accent || ctx.materials.trim || 'minecraft:smooth_quartz';
  const seat = seatingBlockForStyle(ctx.architecture?.style_family);
  const storage = ctx.materials.furniture || 'minecraft:barrel';
  const plant = plantBlock(ctx.materials);
  const index = Math.floor(slot / Math.max(1, ctx.rooms.length)) + 1;
  const roomToken = normalizeRoleToken(room.type || room.id || 'room');
  if (category === 'scene') {
    const variants = [
      ['anchor', seat, 'decor_furniture'],
      ['support-table', tableBlockForStyle(ctx.architecture?.style_family), 'decor_furniture'],
      ['soft-frame', 'minecraft:white_carpet', 'decor_floor'],
      ['storage-edge', storage, 'decor_storage'],
      ['accent-light', light, 'decor_light'],
      ['plant-softener', plant, 'decor_plant']
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
      ['view-anchor', seat, 'decor_furniture'],
      ['threshold-rug', 'minecraft:white_carpet', 'decor_floor'],
      ['view-light', light, 'decor_light'],
      ['memory-object', accent, 'decor_detail'],
      ['soft-plant', plant, 'decor_plant']
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
      ['focal-wall', accent, 'decor_detail'],
      ['task-light', light, 'decor_light'],
      ['functional-anchor', functionalBlockForRoom(room.type), 'decor_utility'],
      ['storage-display', storage, 'decor_storage'],
      ['soft-detail', plant, 'decor_plant']
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
  const seat = seatingBlockForStyle(ctx.architecture?.style_family);
  const storage = ctx.materials.furniture || 'minecraft:barrel';
  if (room.type === 'kitchen') {
    return [
      ['prep-run', 'minecraft:crafting_table', 'decor_utility'],
      ['range', 'minecraft:furnace', 'decor_utility'],
      ['pantry', storage, 'decor_storage'],
      ['task-light', light, 'decor_light']
    ];
  }
  if (['bedroom', 'master_bedroom'].includes(room.type)) {
    return [
      ['bedside', storage, 'decor_storage'],
      ['reading-light', light, 'decor_light'],
      ['wardrobe', storage, 'decor_storage'],
      ['soft-rug', 'minecraft:white_carpet', 'decor_floor']
    ];
  }
  if (room.type === 'study') {
    return [
      ['library', 'minecraft:bookshelf', 'decor_furniture'],
      ['desk', 'minecraft:lectern', 'decor_furniture'],
      ['reading-light', light, 'decor_light'],
      ['display', ctx.materials.accent || 'minecraft:decorated_pot', 'decor_detail']
    ];
  }
  if (room.type === 'bathroom') {
    return [
      ['basin', 'minecraft:cauldron', 'decor_utility'],
      ['counter', 'minecraft:smooth_quartz_slab[type=bottom]', 'decor_furniture'],
      ['mirror-light', light, 'decor_light']
    ];
  }
  return [
    ['seat', seat, 'decor_furniture'],
    ['rug', 'minecraft:white_carpet', 'decor_floor'],
    ['low-table', tableBlockForStyle(ctx.architecture?.style_family), 'decor_furniture'],
    ['layered-light', light, 'decor_light'],
    ['display', ctx.materials.accent || 'minecraft:decorated_pot', 'decor_detail']
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
  return true;
}

function findFreeRoomPoint(grid, room, preferred, module) {
  if (!grid) return preferred;
  const candidates = candidatePoints(room, preferred, module);
  let replaceable;
  for (const point of candidates) {
    const existing = grid.get(keyFor(point.x, point.y, point.z));
    if (!existing) return point;
    if (!replaceable && String(existing.module || '').startsWith('decor_')) replaceable = point;
  }
  return replaceable;
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
