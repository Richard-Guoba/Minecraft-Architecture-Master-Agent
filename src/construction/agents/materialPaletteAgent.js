import { blockCatalogStats, blockUsageAtlasStats, isKnownMinecraft121Block, materialOptionsForFamily, partUsagePolicies } from './minecraftBlockCatalog.js';

const BLOCK_PATTERN = /^minecraft:[a-z0-9_]+(?:\[[a-z0-9_=,]+\])?$/;

const BLOCK_ALIASES = {
  'minecraft:wool': 'minecraft:white_wool',
  'minecraft:stained_glass': 'minecraft:white_stained_glass',
  'minecraft:stained_glass_pane': 'minecraft:white_stained_glass_pane',
  'minecraft:terracotta_block': 'minecraft:terracotta',
  'minecraft:wood': 'minecraft:oak_planks',
  'minecraft:planks': 'minecraft:oak_planks',
  'minecraft:stonebrick': 'minecraft:stone_bricks'
};

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
    plant: 'minecraft:jungle_leaves[persistent=true]',
    plant_secondary: 'minecraft:azalea_leaves[persistent=true]',
    rope: 'minecraft:chain',
    roof_detail: 'minecraft:moss_carpet'
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
  },
  desert: {
    accent: 'minecraft:orange_terracotta',
    railing: 'minecraft:acacia_fence',
    chimney: 'minecraft:smooth_sandstone',
    landscape: 'minecraft:sand',
    plant: 'minecraft:potted_cactus',
    water: 'minecraft:water',
    awning: 'minecraft:orange_carpet'
  },
  victorian: {
    accent: 'minecraft:white_concrete',
    railing: 'minecraft:dark_oak_fence',
    chimney: 'minecraft:bricks',
    landscape: 'minecraft:grass_block',
    awning: 'minecraft:red_carpet',
    planter: 'minecraft:potted_azalea_bush'
  },
  industrial: {
    accent: 'minecraft:iron_bars',
    railing: 'minecraft:iron_bars',
    chimney: 'minecraft:bricks',
    landscape: 'minecraft:gravel',
    secondary_wall: 'minecraft:gray_concrete',
    facade_light: 'minecraft:redstone_lamp',
    service_vent: 'minecraft:iron_trapdoor[facing=north,half=bottom,open=false]'
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
    const materialOptions = materialOptionsForFamily(family, prompt);
    const rolePalettes = rolePalettesForFamily(family, prompt, materialOptions, extras);
    const repaired = repairInvalidMaterials(normalizeMaterials({
      ...base,
      roof: extras.roof || base.roof,
      accent: extras.accent || base.trim || base.wall,
      secondary_wall: extras.secondary_wall || base.interior_wall || base.wall,
      railing: extras.railing || base.trim || 'minecraft:iron_bars',
      chimney: extras.chimney || base.foundation || 'minecraft:bricks',
      landscape: extras.landscape || base.path || 'minecraft:grass_block',
      plant: extras.plant || 'minecraft:oak_leaves[persistent=true]',
      plant_secondary: extras.plant_secondary || rolePalettes.vegetation[1] || extras.plant || 'minecraft:flowering_azalea_leaves[persistent=true]',
      water: extras.water || 'minecraft:water',
      path_light: extras.path_light || base.lamp || 'minecraft:glowstone',
      facade_light: extras.facade_light || extras.neon || base.lamp || 'minecraft:glowstone',
      neon: extras.neon || extras.facade_light || base.lamp || 'minecraft:sea_lantern',
      retaining: extras.retaining || base.foundation || 'minecraft:stone_bricks',
      greenhouse_frame: extras.greenhouse_frame || base.trim || 'minecraft:iron_bars',
      roof_detail: extras.roof_detail || base.roof_detail || extras.accent || base.trim || base.roof,
      furniture: base.furniture || furnitureForFamily(family),
      awning: extras.awning || base.awning || awningForFamily(family),
      planter: extras.planter || base.planter || extras.plant || 'minecraft:potted_azalea_bush',
      flower_box: extras.flower_box || base.flower_box || 'minecraft:flower_pot',
      solar_panel: extras.solar_panel || base.solar_panel || 'minecraft:daylight_detector',
      rain_chain: extras.rain_chain || base.rain_chain || 'minecraft:chain',
      drainage: extras.drainage || base.drainage || 'minecraft:cauldron',
      pool_edge: extras.pool_edge || base.pool_edge || 'minecraft:smooth_quartz',
      outdoor_seat: extras.outdoor_seat || base.outdoor_seat || seatingForFamily(family),
      service_vent: extras.service_vent || base.service_vent || 'minecraft:iron_trapdoor[facing=north,half=bottom,open=false]',
      accessibility_marker: extras.accessibility_marker || base.accessibility_marker || 'minecraft:blue_carpet',
      mailbox: extras.mailbox || base.mailbox || 'minecraft:barrel',
      firepit: extras.firepit || base.firepit || 'minecraft:campfire[lit=false]'
    }), materialOptions);
    const materials = repaired.materials;

    const invalid = Object.entries(materials).filter(([, block]) => !validMinecraftBlock(block));
    return {
      source: 'local-material-palette',
      style_family: family,
      preset: stylePreset.id || 'none',
      palette: stylePreset.palette || paletteNameForFamily(family),
      materials,
      material_options: materialOptions,
      block_catalog: blockCatalogStats(),
      block_usage_atlas: blockUsageAtlasStats(),
      part_usage_policies: partUsagePolicies(),
      role_palettes: rolePalettes,
      roles: Object.keys(materials).sort(),
      option_roles: Object.keys(materialOptions).sort(),
      controllableBlockCount: unique(Object.values(materialOptions).flat()).length,
      contrast: contrastForFamily(family),
      warnings: [
        ...repaired.warnings,
        ...invalid.map(([role, block]) => `Invalid block for ${role}: ${block}`)
      ],
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
  if (/太阳能|光伏|solar/i.test(prompt)) extras.solar_panel = 'minecraft:daylight_detector';
  if (/雨链|雨水|rain chain|rainwater/i.test(prompt)) extras.rain_chain = 'minecraft:chain';
  if (/遮阳|棚|awning|shade/i.test(prompt)) extras.awning = 'minecraft:white_carpet';
  if (/泳池|pool/i.test(prompt)) extras.pool_edge = 'minecraft:smooth_quartz';
  if (/火坑|firepit|篝火/i.test(prompt)) extras.firepit = 'minecraft:campfire[lit=false]';
  if (/无障碍|轮椅|accessible|wheelchair/i.test(prompt)) extras.accessibility_marker = 'minecraft:light_blue_carpet';
  return extras;
}

function rolePalettesForFamily(family, prompt, materialOptions = {}, extras = {}) {
  const text = String(prompt || '');
  const naturalVegetation = [
    extras.plant,
    extras.plant_secondary,
    'minecraft:jungle_leaves[persistent=true]',
    'minecraft:mangrove_leaves[persistent=true]',
    'minecraft:azalea_leaves[persistent=true]',
    'minecraft:flowering_azalea_leaves[persistent=true]',
    'minecraft:vine',
    'minecraft:moss_carpet',
    'minecraft:bamboo',
    'minecraft:potted_azalea_bush'
  ];
  const alpineVegetation = [
    extras.plant,
    'minecraft:spruce_leaves[persistent=true]',
    'minecraft:snow',
    'minecraft:moss_carpet',
    'minecraft:fern',
    'minecraft:potted_spruce_sapling'
  ];
  const formalVegetation = [
    extras.plant,
    'minecraft:oak_leaves[persistent=true]',
    'minecraft:flowering_azalea_leaves[persistent=true]',
    'minecraft:potted_azalea_bush',
    'minecraft:rose_bush',
    'minecraft:peony'
  ];
  const desertVegetation = [
    extras.plant,
    'minecraft:potted_cactus',
    'minecraft:dead_bush',
    'minecraft:cactus',
    'minecraft:azalea',
    'minecraft:flower_pot'
  ];

  const vegetation = family === 'treehouse' || family === 'tropical'
    ? naturalVegetation
    : family === 'alpine' || family === 'nordic'
      ? alpineVegetation
      : family === 'desert' || /沙漠|desert/i.test(text)
        ? desertVegetation
        : formalVegetation;

  return {
    vegetation: validPalette(vegetation),
    understory: validPalette([
      'minecraft:moss_carpet',
      'minecraft:fern',
      'minecraft:grass',
      'minecraft:short_grass',
      'minecraft:pink_petals',
      'minecraft:flower_pot',
      'minecraft:potted_fern'
    ]),
    window_sill: validPalette([
      materialOptions.slab?.[0],
      materialOptions.stairs?.[0],
      extras.accent,
      'minecraft:smooth_quartz_slab',
      'minecraft:stone_brick_slab',
      'minecraft:jungle_slab'
    ]),
    facade_relief: validPalette([
      extras.roof_detail,
      extras.accent,
      extras.secondary_wall,
      materialOptions.exterior_detail?.[0],
      materialOptions.exterior_detail?.[1],
      materialOptions.artifact?.[0]
    ]),
    artifact_accents: validPalette((materialOptions.artifact || []).slice(0, 24)),
    technical_details: validPalette((materialOptions.technical_detail || []).slice(0, 24)),
    creative_catalog_sample: validPalette((materialOptions.creative || []).filter((block) => /head|skull|rod|grate|bulb|vault|heavy_core|decorated_pot|banner|chain|candle/.test(block)).slice(0, 32))
  };
}

function normalizeMaterials(materials) {
  const normalized = {};
  for (const [role, block] of Object.entries(materials)) {
    if (!block) continue;
    normalized[role] = String(block);
  }
  return normalized;
}

function repairInvalidMaterials(materials, materialOptions = {}) {
  const repaired = {};
  const warnings = [];
  for (const [role, rawBlock] of Object.entries(materials)) {
    const aliased = BLOCK_ALIASES[String(rawBlock)] || String(rawBlock);
    if (validMinecraftBlock(aliased)) {
      repaired[role] = aliased;
      if (aliased !== rawBlock) warnings.push(`Replaced block alias for ${role}: ${rawBlock} -> ${aliased}`);
      continue;
    }
    const fallback = fallbackBlockForRole(role, materialOptions);
    repaired[role] = fallback;
    warnings.push(`Replaced invalid block for ${role}: ${rawBlock} -> ${fallback}`);
  }
  return { materials: repaired, warnings };
}

function fallbackBlockForRole(role, materialOptions = {}) {
  const options = materialOptions[role] || materialOptions[role.replace(/_/g, '-')] || [];
  const validOption = options.find(validMinecraftBlock);
  if (validOption) return validOption;
  if (role.includes('glass')) return 'minecraft:glass';
  if (role.includes('carpet')) return 'minecraft:white_carpet';
  if (role.includes('light') || role.includes('lamp')) return 'minecraft:glowstone';
  if (role.includes('roof')) return 'minecraft:oak_planks';
  if (role.includes('wall')) return 'minecraft:white_concrete';
  if (role.includes('floor')) return 'minecraft:oak_planks';
  if (role.includes('door')) return 'minecraft:oak_door';
  if (role.includes('plant')) return 'minecraft:oak_leaves[persistent=true]';
  return 'minecraft:stone_bricks';
}

function validMinecraftBlock(block) {
  return BLOCK_PATTERN.test(String(block || '')) && isKnownMinecraft121Block(block);
}

function furnitureForFamily(family) {
  if (family === 'cyberpunk' || family === 'modern') return 'minecraft:smooth_quartz_slab[type=bottom]';
  if (family === 'treehouse' || family === 'tropical') return 'minecraft:jungle_slab[type=bottom]';
  if (family === 'japanese' || family === 'chinese-courtyard') return 'minecraft:bamboo_slab[type=bottom]';
  if (family === 'gothic' || family === 'subterranean') return 'minecraft:stone_brick_slab[type=bottom]';
  return 'minecraft:oak_slab[type=bottom]';
}

function seatingForFamily(family) {
  if (family === 'modern' || family === 'cyberpunk') return 'minecraft:smooth_quartz_stairs[facing=north,half=bottom]';
  if (family === 'desert') return 'minecraft:sandstone_stairs[facing=north,half=bottom]';
  if (family === 'industrial') return 'minecraft:stone_brick_stairs[facing=north,half=bottom]';
  if (family === 'treehouse' || family === 'tropical') return 'minecraft:jungle_stairs[facing=north,half=bottom]';
  return 'minecraft:spruce_stairs[facing=north,half=bottom]';
}

function awningForFamily(family) {
  if (family === 'desert') return 'minecraft:orange_carpet';
  if (family === 'cyberpunk') return 'minecraft:cyan_carpet';
  if (family === 'victorian') return 'minecraft:red_carpet';
  return 'minecraft:white_carpet';
}

function paletteNameForFamily(family) {
  return FAMILY_EXTRAS[family] ? `${family}-expanded` : 'material-native-expanded';
}

function contrastForFamily(family) {
  if (['cyberpunk', 'gothic', 'subterranean'].includes(family)) return 'high';
  if (['japanese', 'treehouse', 'alpine'].includes(family)) return 'natural';
  return 'balanced';
}

function validPalette(blocks) {
  return unique(blocks)
    .filter((block) => validMinecraftBlock(block));
}

function unique(values) {
  return [...new Set(values.map(String).filter(Boolean))];
}
