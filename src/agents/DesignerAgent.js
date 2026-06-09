const SCALE_DIMENSIONS = {
  small: { width: 15, depth: 13, gardenDepth: 5 },
  medium: { width: 19, depth: 15, gardenDepth: 6 },
  large: { width: 27, depth: 23, gardenDepth: 9 }
};

const STYLE_PRESETS = [
  {
    match: /江南|中式|徽派/,
    id: 'jiangnan-courtyard-v2',
    palette: {
      foundation: 'minecraft:stone_bricks',
      wall: 'minecraft:white_concrete',
      trim: 'minecraft:stripped_dark_oak_log',
      floor: 'minecraft:spruce_planks',
      roof: 'minecraft:deepslate_tiles',
      roofAccent: 'minecraft:dark_oak_planks',
      glass: 'minecraft:glass_pane',
      doorBase: 'minecraft:spruce_door',
      chimney: 'minecraft:bricks',
      interiorWall: 'minecraft:birch_planks',
      stairs: 'minecraft:spruce_stairs[facing=south,half=bottom]',
      hedge: 'minecraft:azalea_leaves[persistent=true]',
      path: 'minecraft:mossy_cobblestone',
      water: 'minecraft:water',
      flowerRed: 'minecraft:poppy',
      flowerBlue: 'minecraft:blue_orchid',
      lamp: 'minecraft:lantern[hanging=true]',
      furniture: 'minecraft:bookshelf'
    },
    roof: { style: 'pagoda', height: 5, overhang: 2 },
    window: { width: 2, height: 2, spacing: 5 },
    wall: { thickness: 1 },
    door: { width: 2, height: 2, side: 'south' }
  },
  {
    match: /现代/,
    id: 'modern-glass-house-v2',
    palette: {
      foundation: 'minecraft:smooth_stone',
      wall: 'minecraft:white_concrete',
      trim: 'minecraft:light_gray_concrete',
      floor: 'minecraft:quartz_block',
      roof: 'minecraft:smooth_stone',
      roofAccent: 'minecraft:light_gray_concrete',
      glass: 'minecraft:glass',
      doorBase: 'minecraft:iron_door',
      chimney: 'minecraft:bricks',
      interiorWall: 'minecraft:light_gray_concrete',
      stairs: 'minecraft:quartz_stairs[facing=south,half=bottom]',
      hedge: 'minecraft:oak_leaves[persistent=true]',
      path: 'minecraft:smooth_stone',
      water: 'minecraft:water',
      flowerRed: 'minecraft:red_tulip',
      flowerBlue: 'minecraft:cornflower',
      lamp: 'minecraft:sea_lantern',
      furniture: 'minecraft:crafting_table'
    },
    roof: { style: 'flat', height: 2, overhang: 0 },
    window: { width: 4, height: 3, spacing: 6 },
    wall: { thickness: 1 },
    door: { width: 1, height: 2, side: 'south' }
  },
  {
    match: /木屋|木质|森林|原木/,
    id: 'timber-lodge-v2',
    palette: {
      foundation: 'minecraft:cobblestone',
      wall: 'minecraft:stripped_spruce_log',
      trim: 'minecraft:stripped_dark_oak_log',
      floor: 'minecraft:spruce_planks',
      roof: 'minecraft:dark_oak_planks',
      roofAccent: 'minecraft:spruce_slab',
      glass: 'minecraft:glass_pane',
      doorBase: 'minecraft:spruce_door',
      chimney: 'minecraft:bricks',
      interiorWall: 'minecraft:spruce_planks',
      stairs: 'minecraft:spruce_stairs[facing=south,half=bottom]',
      hedge: 'minecraft:spruce_leaves[persistent=true]',
      path: 'minecraft:coarse_dirt',
      water: 'minecraft:water',
      flowerRed: 'minecraft:poppy',
      flowerBlue: 'minecraft:cornflower',
      lamp: 'minecraft:lantern[hanging=true]',
      furniture: 'minecraft:bookshelf'
    },
    roof: { style: 'gabled', height: 5, overhang: 1 },
    window: { width: 2, height: 2, spacing: 6 },
    wall: { thickness: 1 },
    door: { width: 1, height: 2, side: 'south' }
  },
  {
    match: /欧式|欧洲|古典|城堡|庄园|.*/,
    id: 'european-large-house-v2',
    palette: {
      foundation: 'minecraft:stone_bricks',
      wall: 'minecraft:smooth_sandstone',
      trim: 'minecraft:stripped_dark_oak_log',
      floor: 'minecraft:spruce_planks',
      roof: 'minecraft:dark_oak_planks',
      roofAccent: 'minecraft:dark_oak_slab',
      glass: 'minecraft:glass',
      doorBase: 'minecraft:dark_oak_door',
      chimney: 'minecraft:bricks',
      interiorWall: 'minecraft:birch_planks',
      stairs: 'minecraft:spruce_stairs[facing=south,half=bottom]',
      hedge: 'minecraft:oak_leaves[persistent=true]',
      path: 'minecraft:gravel',
      water: 'minecraft:water',
      flowerRed: 'minecraft:poppy',
      flowerBlue: 'minecraft:cornflower',
      lamp: 'minecraft:glowstone',
      furniture: 'minecraft:bookshelf'
    },
    roof: { style: 'gabled', height: 6, overhang: 1 },
    window: { width: 2, height: 2, spacing: 6 },
    wall: { thickness: 1 },
    door: { width: 2, height: 3, side: 'south' }
  }
];

const DOOR_MATERIALS = new Map([
  ['minecraft:dark_oak_planks', 'minecraft:dark_oak_door'],
  ['minecraft:spruce_planks', 'minecraft:spruce_door'],
  ['minecraft:oak_planks', 'minecraft:oak_door'],
  ['minecraft:birch_planks', 'minecraft:birch_door'],
  ['minecraft:white_concrete', 'minecraft:iron_door'],
  ['minecraft:quartz_block', 'minecraft:iron_door']
]);

export class DesignerAgent {
  constructor({ seed } = {}) {
    this.seed = seed ?? 2026;
  }

  run(requirement, plan = {}) {
    const preset = pickPreset(requirement.style);
    const floors = Math.max(1, Math.min(3, requirement.floors || 2));
    const dimensions = buildDimensions(requirement, preset, floors);
    const elements = buildElements(requirement, preset, dimensions, plan);
    const palette = buildPalette(preset.palette, elements);
    const modules = buildModules(requirement, elements, floors, plan);

    return {
      id: `${preset.id}-${requirement.scale}`,
      style: requirement.style,
      scale: requirement.scale,
      floors,
      dimensions,
      palette,
      elements,
      modules,
      plan,
      notes: [
        '建筑以玩家当前位置作为西北角附近起点，向东和向南展开。',
        'v2 为墙壁、地板、门、屋顶、窗户建立独立元素规格，支持尺寸、位置和材质覆盖。',
        '生成结果包含室内隔断、楼梯、照明和庭院细节，避免只生成空壳房间。',
        'v3 初步加入语义建筑规划：先生成 footprint、房间区、邻接关系和风格母题，再由蓝图 Agent 程序化落地。'
      ],
      requirement
    };
  }
}

function pickPreset(style) {
  return STYLE_PRESETS.find((preset) => preset.match.test(style)) || STYLE_PRESETS.at(-1);
}

function buildDimensions(requirement, preset, floors) {
  const scaleBase = SCALE_DIMENSIONS[requirement.scale] || SCALE_DIMENSIONS.medium;
  const prefs = requirement.elementPreferences || {};
  const floorHeight = clampInt(requirement.dimensions?.floorHeight, 4, 7, 5);
  const roofHeight = clampInt(requirement.dimensions?.roofHeight || prefs.roof?.height, 2, 9, preset.roof.height);
  const width = clampInt(requirement.dimensions?.width, 11, 45, scaleBase.width);
  const depth = clampInt(requirement.dimensions?.depth, 11, 45, scaleBase.depth);
  return {
    width,
    depth,
    floorHeight,
    wallHeight: floors * floorHeight,
    roofHeight,
    gardenDepth: clampInt(requirement.dimensions?.gardenDepth, 3, 16, scaleBase.gardenDepth)
  };
}

function buildElements(requirement, preset, dimensions, plan) {
  const prefs = requirement.elementPreferences || {};
  const plannedRoomCount = countPlannedInteriorZones(plan);
  const defaultRooms = Math.max(requirement.scale === 'large' ? 4 : 2, plannedRoomCount || 0);
  const wall = {
    material: toBlockId(prefs.wall?.material, preset.palette.wall),
    thickness: clampInt(prefs.wall?.thickness, 1, 3, preset.wall.thickness)
  };
  const floor = {
    material: toBlockId(prefs.floor?.material, preset.palette.floor),
    levels: requirement.floors
  };
  const doorMaterial = toDoorBlock(toBlockId(prefs.door?.material, preset.palette.doorBase));
  const door = {
    material: doorMaterial,
    side: normalizeSide(prefs.door?.side || preset.door.side),
    width: clampInt(prefs.door?.width, 1, 3, preset.door.width),
    height: clampInt(prefs.door?.height, 2, Math.min(4, dimensions.floorHeight - 1), preset.door.height),
    position: prefs.door?.position || `${normalizeSide(prefs.door?.side || preset.door.side)}-center`
  };
  const roof = {
    material: toBlockId(prefs.roof?.material, preset.palette.roof),
    style: normalizeRoofStyle(prefs.roof?.style || preset.roof.style),
    height: dimensions.roofHeight,
    overhang: clampInt(prefs.roof?.overhang, 0, 4, preset.roof.overhang)
  };
  const window = {
    material: toBlockId(prefs.window?.material, preset.palette.glass),
    width: clampInt(prefs.window?.width, 1, 6, preset.window.width),
    height: clampInt(prefs.window?.height, 1, Math.max(2, dimensions.floorHeight - 2), preset.window.height),
    spacing: clampInt(prefs.window?.spacing, 3, 10, preset.window.spacing),
    placement: prefs.window?.placement || 'balanced'
  };
  const interior = {
    enabled: prefs.interior?.enabled !== false,
    rooms: clampInt(prefs.interior?.rooms, 1, 8, defaultRooms),
    stairs: prefs.interior?.stairs !== false && requirement.floors > 1,
    lighting: prefs.interior?.lighting !== false
  };
  const landscape = {
    enabled: prefs.landscape?.enabled !== false && (
      requirement.features.includes('小花园') ||
      requirement.features.includes('水景') ||
      requirement.scale === 'large' ||
      hasPlanZone(plan, ['garden', 'water']) ||
      planFootprintType(plan) === 'courtyard'
    ),
    waterFeature: prefs.landscape?.waterFeature === true ||
      requirement.features.includes('水景') ||
      requirement.style === '江南' ||
      hasPlanZone(plan, ['water']) ||
      hasPlanMotif(plan, 'water-courtyard')
  };
  const balcony = {
    enabled: prefs.balcony?.enabled === true || requirement.features.includes('阳台') || hasPlanZone(plan, ['balcony'])
  };
  const chimney = {
    enabled: prefs.chimney?.enabled === true ||
      requirement.features.includes('烟囱') ||
      requirement.style === '欧式' ||
      hasPlanMotif(plan, 'chimney')
  };

  return { wall, floor, door, roof, window, interior, landscape, balcony, chimney };
}

function buildPalette(base, elements) {
  const doorFacing = elements.door.side;
  return {
    ...base,
    wall: elements.wall.material,
    floor: elements.floor.material,
    roof: elements.roof.material,
    glass: elements.window.material,
    doorBase: elements.door.material,
    doorLower: doorState(elements.door.material, doorFacing, 'lower', 'left'),
    doorUpper: doorState(elements.door.material, doorFacing, 'upper', 'left')
  };
}

function buildModules(requirement, elements, floors, plan) {
  const modules = ['foundation', 'walls', 'floors', 'roof', 'windows', 'door'];
  if (elements.interior.enabled) modules.push('interior');
  if (elements.interior.stairs && floors > 1) modules.push('stairs');
  if (elements.interior.lighting) modules.push('lighting');
  if (elements.interior.enabled) modules.push('furnishing');
  if (['l-shape', 'winged'].includes(planFootprintType(plan))) modules.push('wing');
  if (planFootprintType(plan) === 'courtyard') modules.push('courtyard');
  if (elements.chimney.enabled) modules.push('chimney');
  if (elements.balcony.enabled && floors > 1) modules.push('balcony');
  if (elements.landscape.enabled) modules.push('garden');
  if (elements.landscape.enabled && elements.landscape.waterFeature) modules.push('water_feature');
  if (['pagoda', 'hipped'].includes(elements.roof.style) || requirement.features.includes('飞檐')) {
    modules.push('roof_detail');
  }
  return [...new Set(modules)];
}

function countPlannedInteriorZones(plan) {
  const zones = Array.isArray(plan?.zones) ? plan.zones : [];
  const layoutZones = zones.filter((zone) => (
    !zone.outside &&
    !['entry', 'stairs'].includes(zone.type) &&
    !['entry', 'stairs'].includes(zone.id)
  ));
  return layoutZones.length;
}

function hasPlanZone(plan, types) {
  const zoneTypes = new Set(types);
  return (plan?.zones || []).some((zone) => zoneTypes.has(zone.type) || zoneTypes.has(zone.id));
}

function hasPlanMotif(plan, motif) {
  return (plan?.styleMotifs || []).includes(motif);
}

function planFootprintType(plan) {
  return plan?.footprint?.type || 'rectangle';
}

function toBlockId(value, fallback) {
  if (!value) return fallback;
  const text = String(value).trim();
  if (!text) return fallback;
  if (text.startsWith('minecraft:')) return text;
  return `minecraft:${text}`;
}

function toDoorBlock(value) {
  const block = stripState(value);
  if (block.endsWith('_door')) return block;
  return DOOR_MATERIALS.get(block) || 'minecraft:dark_oak_door';
}

function doorState(base, facing, half, hinge) {
  return `${stripState(base)}[facing=${facing},half=${half},hinge=${hinge}]`;
}

function stripState(block) {
  return String(block).split('[')[0];
}

function normalizeSide(value) {
  const side = String(value || 'south').toLowerCase();
  if (['north', 'south', 'east', 'west'].includes(side)) return side;
  if (/北/.test(side)) return 'north';
  if (/东/.test(side)) return 'east';
  if (/西/.test(side)) return 'west';
  return 'south';
}

function normalizeRoofStyle(value) {
  const style = String(value || 'gabled').toLowerCase();
  if (['flat', 'gabled', 'hipped', 'pagoda'].includes(style)) return style;
  if (/平/.test(style)) return 'flat';
  if (/飞檐|中式|江南|翘/.test(style)) return 'pagoda';
  if (/四坡|庑殿|歇山/.test(style)) return 'hipped';
  return 'gabled';
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function doorStateForTest(base, facing, half, hinge) {
  return doorState(base, facing, half, hinge);
}
