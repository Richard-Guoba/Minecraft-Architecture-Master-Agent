const BLOCK_PATTERN = /^minecraft:[a-z0-9_]+(?:\[[a-z0-9_=,]+\])?$/;

const FAMILY_EXTRAS = {
  coastal: {
    accent: 'minecraft:dark_prismarine',
    railing: 'minecraft:birch_fence',
    landscape: 'minecraft:sand',
    plant: 'minecraft:oak_leaves[persistent=true]',
    water: 'minecraft:water'
  },
  alpine: {
    accent: 'minecraft:snow_block',
    railing: 'minecraft:spruce_fence',
    chimney: 'minecraft:stone_bricks',
    landscape: 'minecraft:snow_block',
    plant: 'minecraft:spruce_leaves[persistent=true]'
  },
  subterranean: {
    accent: 'minecraft:mossy_cobblestone',
    retaining: 'minecraft:deepslate_bricks',
    landscape: 'minecraft:moss_block',
    path_light: 'minecraft:glowstone',
    earth: 'minecraft:moss_block'
  },
  cliffside: {
    accent: 'minecraft:iron_bars',
    railing: 'minecraft:iron_bars',
    retaining: 'minecraft:stone_bricks',
    landscape: 'minecraft:stone',
    path_light: 'minecraft:sea_lantern'
  },
  treehouse: {
    accent: 'minecraft:stripped_jungle_log',
    railing: 'minecraft:jungle_fence',
    landscape: 'minecraft:moss_block',
    plant: 'minecraft:oak_leaves[persistent=true]',
    rope: 'minecraft:chain'
  },
  'greenhouse-house': {
    accent: 'minecraft:oxidized_copper',
    railing: 'minecraft:iron_bars',
    landscape: 'minecraft:moss_block',
    plant: 'minecraft:oak_leaves[persistent=true]',
    greenhouse_frame: 'minecraft:oxidized_copper'
  },
  cyberpunk: {
    accent: 'minecraft:cyan_concrete',
    neon: 'minecraft:sea_lantern',
    railing: 'minecraft:iron_bars',
    facade_light: 'minecraft:sea_lantern',
    path_light: 'minecraft:sea_lantern',
    secondary_wall: 'minecraft:gray_concrete'
  },
  gothic: {
    accent: 'minecraft:smooth_quartz',
    railing: 'minecraft:iron_bars',
    chimney: 'minecraft:blackstone',
    path_light: 'minecraft:soul_lantern[hanging=true]'
  },
  japanese: {
    accent: 'minecraft:dark_oak_planks',
    railing: 'minecraft:bamboo_fence',
    landscape: 'minecraft:gravel',
    plant: 'minecraft:bamboo'
  },
  'chinese-courtyard': {
    accent: 'minecraft:stripped_dark_oak_log',
    railing: 'minecraft:dark_oak_fence',
    landscape: 'minecraft:mossy_cobblestone',
    plant: 'minecraft:bamboo'
  },
  modern: {
    accent: 'minecraft:light_gray_concrete',
    railing: 'minecraft:iron_bars',
    facade_light: 'minecraft:sea_lantern',
    secondary_wall: 'minecraft:smooth_stone'
  },
  classical: {
    accent: 'minecraft:smooth_quartz',
    railing: 'minecraft:smooth_quartz',
    chimney: 'minecraft:bricks',
    landscape: 'minecraft:grass_block'
  }
};

export class MaterialPaletteAgent {
  run(prompt = '', architecture = {}, stylePreset = {}) {
    const family = String(architecture.style_family || architecture.styleFamily || 'general');
    const base = { ...(architecture.materials || {}) };
    const extras = {
      ...(FAMILY_EXTRAS[family] || {}),
      ...promptDrivenExtras(prompt)
    };
    const materials = normalizeMaterials({
      ...base,
      accent: extras.accent || base.trim || base.wall,
      secondary_wall: extras.secondary_wall || base.interior_wall || base.wall,
      railing: extras.railing || base.trim || 'minecraft:iron_bars',
      chimney: extras.chimney || base.foundation || 'minecraft:bricks',
      landscape: extras.landscape || base.path || 'minecraft:grass_block',
      plant: extras.plant || 'minecraft:oak_leaves[persistent=true]',
      water: extras.water || 'minecraft:water',
      path_light: extras.path_light || base.lamp || 'minecraft:glowstone',
      facade_light: extras.facade_light || extras.neon || base.lamp || 'minecraft:glowstone',
      neon: extras.neon || extras.facade_light || base.lamp || 'minecraft:sea_lantern',
      retaining: extras.retaining || base.foundation || 'minecraft:stone_bricks',
      greenhouse_frame: extras.greenhouse_frame || base.trim || 'minecraft:iron_bars',
      roof_detail: base.roof_detail || extras.accent || base.trim || base.roof,
      furniture: base.furniture || furnitureForFamily(family)
    });

    const invalid = Object.entries(materials).filter(([, block]) => !BLOCK_PATTERN.test(block));
    return {
      source: 'local-material-palette',
      style_family: family,
      preset: stylePreset.id || 'none',
      palette: stylePreset.palette || paletteNameForFamily(family),
      materials,
      roles: Object.keys(materials).sort(),
      contrast: contrastForFamily(family),
      warnings: invalid.map(([role, block]) => `Invalid block for ${role}: ${block}`),
      valid: invalid.length === 0
    };
  }
}

function promptDrivenExtras(prompt) {
  const extras = {};
  if (/霓虹|neon|海晶灯|海灯/i.test(prompt)) extras.neon = 'minecraft:sea_lantern';
  if (/红砖|砖烟囱/.test(prompt)) extras.chimney = 'minecraft:bricks';
  if (/黑石|黑色装饰|blackstone/i.test(prompt)) extras.accent = 'minecraft:polished_blackstone';
  if (/铜|copper/i.test(prompt)) extras.accent = 'minecraft:oxidized_copper';
  if (/雪|snow/i.test(prompt)) extras.landscape = 'minecraft:snow_block';
  if (/苔藓|moss/i.test(prompt)) extras.landscape = 'minecraft:moss_block';
  return extras;
}

function normalizeMaterials(materials) {
  const normalized = {};
  for (const [role, block] of Object.entries(materials)) {
    if (!block) continue;
    normalized[role] = String(block);
  }
  return normalized;
}

function furnitureForFamily(family) {
  if (family === 'cyberpunk' || family === 'modern') return 'minecraft:smooth_quartz_slab[type=bottom]';
  if (family === 'treehouse' || family === 'tropical') return 'minecraft:jungle_slab[type=bottom]';
  if (family === 'japanese' || family === 'chinese-courtyard') return 'minecraft:bamboo_slab[type=bottom]';
  if (family === 'gothic' || family === 'subterranean') return 'minecraft:stone_brick_slab[type=bottom]';
  return 'minecraft:oak_slab[type=bottom]';
}

function paletteNameForFamily(family) {
  return FAMILY_EXTRAS[family] ? `${family}-expanded` : 'material-native-expanded';
}

function contrastForFamily(family) {
  if (['cyberpunk', 'gothic', 'subterranean'].includes(family)) return 'high';
  if (['japanese', 'treehouse', 'alpine'].includes(family)) return 'natural';
  return 'balanced';
}
