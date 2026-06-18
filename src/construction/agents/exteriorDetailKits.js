export const CORE_EXTERIOR_DETAIL_KIT_IDS = [
  'window_surround',
  'entry_portal',
  'wall_relief',
  'shade_awnings',
  'plant_boxes',
  'identity_marker',
  'privacy_screen',
  'service_utilities'
];

const KIT_METADATA = {
  window_surround: {
    label: 'layered-window-decoration',
    module: 'facade_detail',
    motifs: ['sill', 'lintel', 'side-jambs', 'bars', 'trapdoor-shutters']
  },
  entry_portal: {
    label: 'detailed-entry-decoration',
    module: 'entry_detail',
    motifs: ['threshold', 'portal-posts', 'canopy-cap', 'lanterns', 'hardware']
  },
  wall_relief: {
    label: 'textured-wall-decoration',
    module: 'facade_relief',
    motifs: ['slab-relief', 'stair-caps', 'wall-piers', 'buttons', 'trapdoor-panels']
  },
  shade_awnings: {
    label: 'shade-and-awning-decoration',
    module: 'awning',
    motifs: ['carpet-canopy', 'slab-edge', 'stair-lip', 'hangers', 'side-brackets']
  },
  plant_boxes: {
    label: 'window-planter-decoration',
    module: 'flower_box',
    motifs: ['trapdoor-box', 'planter-basin', 'potted-plant', 'leaves', 'moss-lip']
  },
  identity_marker: {
    label: 'address-and-sign-decoration',
    module: 'address_marker',
    motifs: ['wall-sign', 'hanging-sign', 'button-hardware', 'lantern', 'trim-plate']
  },
  privacy_screen: {
    label: 'privacy-fin-decoration',
    module: 'privacy_fin',
    motifs: ['bars', 'trapdoors', 'chains', 'glass-panes', 'slab-fins']
  },
  service_utilities: {
    label: 'service-utility-decoration',
    module: 'service_vent',
    motifs: ['vents', 'grates', 'rods', 'chains', 'indicator-light']
  },
  decorative_screens: {
    label: 'screen-panel-decoration',
    module: 'screens',
    motifs: ['fence-posts', 'trapdoor-screens', 'bamboo-slats', 'lanterns', 'buttons']
  },
  balcony_rail: {
    label: 'balcony-rail-decoration',
    module: 'railing',
    motifs: ['rail-bars', 'posts', 'chains', 'caps', 'lanterns']
  }
};

const COMMON_KIT_BLOCKS = {
  window_surround: [
    'minecraft:smooth_quartz_slab[type=bottom]',
    'minecraft:smooth_quartz_stairs[facing=north,half=bottom]',
    'minecraft:stone_brick_wall',
    'minecraft:iron_bars',
    'minecraft:white_stained_glass_pane',
    'minecraft:oak_trapdoor[facing=south,half=top,open=false]',
    'minecraft:stone_button[face=wall,facing=south]'
  ],
  entry_portal: [
    'minecraft:smooth_quartz_stairs[facing=north,half=bottom]',
    'minecraft:smooth_quartz_slab[type=bottom]',
    'minecraft:stone_brick_wall',
    'minecraft:chain',
    'minecraft:lantern',
    'minecraft:oak_trapdoor[facing=south,half=top,open=false]',
    'minecraft:stone_button[face=wall,facing=south]',
    'minecraft:oak_pressure_plate'
  ],
  wall_relief: [
    'minecraft:smooth_quartz_slab[type=bottom]',
    'minecraft:smooth_quartz_stairs[facing=north,half=bottom]',
    'minecraft:stone_brick_wall',
    'minecraft:iron_trapdoor[facing=north,half=bottom,open=false]',
    'minecraft:stone_button[face=wall,facing=south]',
    'minecraft:white_carpet',
    'minecraft:iron_bars'
  ],
  shade_awnings: [
    'minecraft:white_carpet',
    'minecraft:smooth_quartz_slab[type=bottom]',
    'minecraft:smooth_quartz_stairs[facing=north,half=bottom]',
    'minecraft:chain',
    'minecraft:lantern',
    'minecraft:oak_fence',
    'minecraft:oak_trapdoor[facing=south,half=top,open=false]',
    'minecraft:iron_bars'
  ],
  plant_boxes: [
    'minecraft:spruce_trapdoor[facing=south,half=top,open=false]',
    'minecraft:composter',
    'minecraft:flower_pot',
    'minecraft:potted_azalea_bush',
    'minecraft:oak_leaves[persistent=true]',
    'minecraft:moss_carpet',
    'minecraft:spruce_fence'
  ],
  identity_marker: [
    'minecraft:oak_wall_sign',
    'minecraft:oak_wall_hanging_sign',
    'minecraft:lantern',
    'minecraft:chain',
    'minecraft:stone_button[face=wall,facing=south]',
    'minecraft:oak_trapdoor[facing=south,half=top,open=false]',
    'minecraft:smooth_quartz_slab[type=bottom]',
    'minecraft:glowstone'
  ],
  privacy_screen: [
    'minecraft:iron_bars',
    'minecraft:iron_trapdoor[facing=north,half=bottom,open=false]',
    'minecraft:chain',
    'minecraft:white_stained_glass_pane',
    'minecraft:smooth_quartz_slab[type=bottom]',
    'minecraft:oak_fence',
    'minecraft:stone_button[face=wall,facing=south]'
  ],
  service_utilities: [
    'minecraft:iron_trapdoor[facing=north,half=bottom,open=false]',
    'minecraft:copper_grate',
    'minecraft:lightning_rod',
    'minecraft:chain',
    'minecraft:hopper',
    'minecraft:stone_button[face=wall,facing=south]',
    'minecraft:redstone_lamp',
    'minecraft:iron_bars'
  ],
  decorative_screens: [
    'minecraft:bamboo_fence',
    'minecraft:bamboo_trapdoor[facing=south,half=top,open=false]',
    'minecraft:bamboo_mosaic_slab[type=bottom]',
    'minecraft:bamboo_mosaic_stairs[facing=north,half=bottom]',
    'minecraft:lantern',
    'minecraft:chain',
    'minecraft:bamboo_button[face=wall,facing=south]'
  ],
  balcony_rail: [
    'minecraft:iron_bars',
    'minecraft:chain',
    'minecraft:smooth_quartz_slab[type=bottom]',
    'minecraft:oak_fence',
    'minecraft:lantern',
    'minecraft:stone_button[face=wall,facing=south]',
    'minecraft:oak_trapdoor[facing=south,half=top,open=false]'
  ]
};

const FAMILY_KIT_OVERRIDES = {
  modern: {
    window_surround: ['minecraft:white_stained_glass_pane', 'minecraft:iron_trapdoor[facing=north,half=bottom,open=false]', 'minecraft:end_rod'],
    wall_relief: ['minecraft:light_gray_carpet', 'minecraft:smooth_quartz_slab[type=bottom]', 'minecraft:iron_bars'],
    shade_awnings: ['minecraft:white_carpet', 'minecraft:iron_bars', 'minecraft:sea_lantern'],
    privacy_screen: ['minecraft:iron_bars', 'minecraft:white_stained_glass_pane', 'minecraft:end_rod']
  },
  futuristic: {
    window_surround: ['minecraft:cyan_stained_glass_pane', 'minecraft:iron_trapdoor[facing=north,half=bottom,open=false]', 'minecraft:end_rod'],
    wall_relief: ['minecraft:smooth_quartz_slab[type=bottom]', 'minecraft:cyan_carpet', 'minecraft:sea_lantern'],
    privacy_screen: ['minecraft:iron_bars', 'minecraft:cyan_stained_glass_pane', 'minecraft:end_rod']
  },
  cyberpunk: {
    window_surround: ['minecraft:cyan_stained_glass_pane', 'minecraft:magenta_carpet', 'minecraft:end_rod', 'minecraft:iron_trapdoor[facing=north,half=bottom,open=false]'],
    wall_relief: ['minecraft:gray_carpet', 'minecraft:cyan_carpet', 'minecraft:sea_lantern', 'minecraft:iron_bars'],
    shade_awnings: ['minecraft:cyan_carpet', 'minecraft:magenta_carpet', 'minecraft:sea_lantern', 'minecraft:chain'],
    identity_marker: ['minecraft:sea_lantern', 'minecraft:redstone_lamp', 'minecraft:iron_bars', 'minecraft:chain'],
    service_utilities: ['minecraft:copper_grate', 'minecraft:iron_trapdoor[facing=north,half=bottom,open=false]', 'minecraft:redstone_lamp', 'minecraft:lightning_rod']
  },
  industrial: {
    window_surround: ['minecraft:polished_deepslate_slab[type=bottom]', 'minecraft:polished_deepslate_stairs[facing=north,half=bottom]', 'minecraft:polished_deepslate_wall', 'minecraft:copper_grate'],
    wall_relief: ['minecraft:polished_deepslate_slab[type=bottom]', 'minecraft:polished_deepslate_stairs[facing=north,half=bottom]', 'minecraft:iron_trapdoor[facing=north,half=bottom,open=false]', 'minecraft:copper_grate'],
    shade_awnings: ['minecraft:gray_carpet', 'minecraft:iron_bars', 'minecraft:chain', 'minecraft:redstone_lamp'],
    plant_boxes: ['minecraft:dark_oak_trapdoor[facing=south,half=top,open=false]', 'minecraft:barrel', 'minecraft:potted_azalea_bush'],
    service_utilities: ['minecraft:copper_grate', 'minecraft:weathered_copper_grate', 'minecraft:iron_trapdoor[facing=north,half=bottom,open=false]', 'minecraft:lightning_rod']
  },
  japanese: {
    window_surround: ['minecraft:bamboo_mosaic_slab[type=bottom]', 'minecraft:bamboo_mosaic_stairs[facing=north,half=bottom]', 'minecraft:bamboo_fence', 'minecraft:bamboo_trapdoor[facing=south,half=top,open=false]', 'minecraft:dark_oak_trapdoor[facing=south,half=top,open=false]'],
    entry_portal: ['minecraft:dark_oak_fence', 'minecraft:bamboo_mosaic_slab[type=bottom]', 'minecraft:lantern', 'minecraft:dark_oak_trapdoor[facing=south,half=top,open=false]'],
    wall_relief: ['minecraft:bamboo_mosaic_slab[type=bottom]', 'minecraft:bamboo_fence', 'minecraft:dark_oak_trapdoor[facing=south,half=top,open=false]', 'minecraft:red_carpet'],
    shade_awnings: ['minecraft:red_carpet', 'minecraft:bamboo_mosaic_slab[type=bottom]', 'minecraft:bamboo_fence', 'minecraft:lantern'],
    privacy_screen: ['minecraft:bamboo_fence', 'minecraft:bamboo_trapdoor[facing=south,half=top,open=false]', 'minecraft:bamboo_mosaic_slab[type=bottom]', 'minecraft:chain'],
    decorative_screens: ['minecraft:bamboo_fence', 'minecraft:bamboo_trapdoor[facing=south,half=top,open=false]', 'minecraft:bamboo_mosaic_slab[type=bottom]', 'minecraft:bamboo_button[face=wall,facing=south]']
  },
  'chinese-courtyard': {
    window_surround: ['minecraft:dark_oak_trapdoor[facing=south,half=top,open=false]', 'minecraft:dark_oak_fence', 'minecraft:red_carpet', 'minecraft:stone_brick_wall'],
    entry_portal: ['minecraft:dark_oak_fence', 'minecraft:dark_oak_trapdoor[facing=south,half=top,open=false]', 'minecraft:lantern', 'minecraft:red_carpet'],
    shade_awnings: ['minecraft:red_carpet', 'minecraft:dark_oak_fence', 'minecraft:lantern', 'minecraft:chain'],
    privacy_screen: ['minecraft:dark_oak_fence', 'minecraft:dark_oak_trapdoor[facing=south,half=top,open=false]', 'minecraft:iron_bars']
  },
  gothic: {
    window_surround: ['minecraft:deepslate_tile_wall', 'minecraft:deepslate_tile_slab[type=bottom]', 'minecraft:deepslate_tile_stairs[facing=north,half=bottom]', 'minecraft:iron_bars', 'minecraft:soul_lantern'],
    entry_portal: ['minecraft:stone_brick_wall', 'minecraft:deepslate_tile_wall', 'minecraft:soul_lantern', 'minecraft:chain', 'minecraft:blackstone_slab[type=bottom]'],
    wall_relief: ['minecraft:deepslate_tile_wall', 'minecraft:deepslate_tile_slab[type=bottom]', 'minecraft:deepslate_tile_stairs[facing=north,half=bottom]', 'minecraft:iron_bars', 'minecraft:soul_lantern'],
    shade_awnings: ['minecraft:blackstone_slab[type=bottom]', 'minecraft:blackstone_stairs[facing=north,half=bottom]', 'minecraft:chain', 'minecraft:soul_lantern'],
    identity_marker: ['minecraft:soul_lantern', 'minecraft:chain', 'minecraft:iron_bars', 'minecraft:stone_button[face=wall,facing=south]']
  },
  desert: {
    window_surround: ['minecraft:sandstone_slab[type=bottom]', 'minecraft:sandstone_stairs[facing=north,half=bottom]', 'minecraft:sandstone_wall', 'minecraft:acacia_trapdoor[facing=south,half=top,open=false]', 'minecraft:orange_carpet'],
    entry_portal: ['minecraft:sandstone_wall', 'minecraft:sandstone_slab[type=bottom]', 'minecraft:sandstone_stairs[facing=north,half=bottom]', 'minecraft:lantern', 'minecraft:acacia_trapdoor[facing=south,half=top,open=false]'],
    wall_relief: ['minecraft:cut_sandstone_slab[type=bottom]', 'minecraft:sandstone_wall', 'minecraft:orange_carpet', 'minecraft:acacia_trapdoor[facing=south,half=top,open=false]'],
    shade_awnings: ['minecraft:orange_carpet', 'minecraft:acacia_fence', 'minecraft:lantern', 'minecraft:chain'],
    plant_boxes: ['minecraft:acacia_trapdoor[facing=south,half=top,open=false]', 'minecraft:potted_cactus', 'minecraft:dead_bush']
  },
  mediterranean: {
    window_surround: ['minecraft:smooth_sandstone_slab[type=bottom]', 'minecraft:smooth_sandstone_stairs[facing=north,half=bottom]', 'minecraft:sandstone_wall', 'minecraft:light_blue_carpet'],
    shade_awnings: ['minecraft:light_blue_carpet', 'minecraft:smooth_sandstone_slab[type=bottom]', 'minecraft:lantern', 'minecraft:chain'],
    plant_boxes: ['minecraft:spruce_trapdoor[facing=south,half=top,open=false]', 'minecraft:potted_azalea_bush', 'minecraft:flower_pot']
  },
  coastal: {
    window_surround: ['minecraft:dark_prismarine_slab[type=bottom]', 'minecraft:dark_prismarine_stairs[facing=north,half=bottom]', 'minecraft:birch_trapdoor[facing=south,half=top,open=false]', 'minecraft:light_blue_carpet', 'minecraft:sea_lantern'],
    wall_relief: ['minecraft:dark_prismarine_slab[type=bottom]', 'minecraft:birch_trapdoor[facing=south,half=top,open=false]', 'minecraft:light_blue_carpet', 'minecraft:sea_lantern'],
    shade_awnings: ['minecraft:light_blue_carpet', 'minecraft:birch_fence', 'minecraft:sea_lantern', 'minecraft:chain'],
    balcony_rail: ['minecraft:birch_fence', 'minecraft:chain', 'minecraft:sea_lantern']
  },
  alpine: {
    window_surround: ['minecraft:spruce_trapdoor[facing=south,half=top,open=false]', 'minecraft:spruce_fence', 'minecraft:stone_brick_wall', 'minecraft:snow', 'minecraft:lantern'],
    wall_relief: ['minecraft:spruce_trapdoor[facing=south,half=top,open=false]', 'minecraft:stone_brick_wall', 'minecraft:snow', 'minecraft:lantern'],
    shade_awnings: ['minecraft:white_carpet', 'minecraft:spruce_fence', 'minecraft:lantern', 'minecraft:chain']
  },
  rustic: {
    window_surround: ['minecraft:spruce_trapdoor[facing=south,half=top,open=false]', 'minecraft:spruce_fence', 'minecraft:stone_brick_wall', 'minecraft:lantern'],
    wall_relief: ['minecraft:spruce_trapdoor[facing=south,half=top,open=false]', 'minecraft:spruce_fence', 'minecraft:stone_button[face=wall,facing=south]'],
    shade_awnings: ['minecraft:spruce_trapdoor[facing=south,half=top,open=false]', 'minecraft:spruce_fence', 'minecraft:lantern']
  },
  nordic: {
    window_surround: ['minecraft:spruce_trapdoor[facing=south,half=top,open=false]', 'minecraft:spruce_fence', 'minecraft:white_carpet', 'minecraft:lantern'],
    wall_relief: ['minecraft:spruce_trapdoor[facing=south,half=top,open=false]', 'minecraft:light_gray_carpet', 'minecraft:stone_brick_wall']
  },
  victorian: {
    window_surround: ['minecraft:dark_oak_trapdoor[facing=south,half=top,open=false]', 'minecraft:dark_oak_fence', 'minecraft:red_carpet', 'minecraft:iron_bars'],
    entry_portal: ['minecraft:dark_oak_fence', 'minecraft:red_carpet', 'minecraft:lantern', 'minecraft:chain'],
    shade_awnings: ['minecraft:red_carpet', 'minecraft:dark_oak_fence', 'minecraft:lantern'],
    plant_boxes: ['minecraft:spruce_trapdoor[facing=south,half=top,open=false]', 'minecraft:potted_azalea_bush', 'minecraft:flower_pot']
  },
  classical: {
    window_surround: ['minecraft:quartz_slab[type=bottom]', 'minecraft:quartz_stairs[facing=north,half=bottom]', 'minecraft:stone_brick_wall', 'minecraft:iron_bars'],
    entry_portal: ['minecraft:quartz_stairs[facing=north,half=bottom]', 'minecraft:quartz_slab[type=bottom]', 'minecraft:stone_brick_wall', 'minecraft:lantern'],
    wall_relief: ['minecraft:quartz_slab[type=bottom]', 'minecraft:quartz_stairs[facing=north,half=bottom]', 'minecraft:stone_brick_wall', 'minecraft:stone_button[face=wall,facing=south]']
  },
  treehouse: {
    window_surround: ['minecraft:jungle_trapdoor[facing=south,half=top,open=false]', 'minecraft:jungle_fence', 'minecraft:vine', 'minecraft:lantern', 'minecraft:chain'],
    entry_portal: ['minecraft:jungle_fence', 'minecraft:jungle_trapdoor[facing=south,half=top,open=false]', 'minecraft:lantern', 'minecraft:chain'],
    wall_relief: ['minecraft:jungle_trapdoor[facing=south,half=top,open=false]', 'minecraft:jungle_fence', 'minecraft:vine', 'minecraft:moss_carpet'],
    plant_boxes: ['minecraft:jungle_trapdoor[facing=south,half=top,open=false]', 'minecraft:oak_leaves[persistent=true]', 'minecraft:moss_carpet', 'minecraft:flower_pot'],
    privacy_screen: ['minecraft:jungle_fence', 'minecraft:chain', 'minecraft:vine', 'minecraft:jungle_trapdoor[facing=south,half=top,open=false]']
  },
  tropical: {
    window_surround: ['minecraft:jungle_trapdoor[facing=south,half=top,open=false]', 'minecraft:jungle_fence', 'minecraft:vine', 'minecraft:lantern'],
    shade_awnings: ['minecraft:green_carpet', 'minecraft:jungle_fence', 'minecraft:chain', 'minecraft:lantern'],
    privacy_screen: ['minecraft:jungle_fence', 'minecraft:jungle_trapdoor[facing=south,half=top,open=false]', 'minecraft:vine', 'minecraft:chain']
  },
  subterranean: {
    window_surround: ['minecraft:polished_deepslate_wall', 'minecraft:polished_deepslate_slab[type=bottom]', 'minecraft:iron_bars', 'minecraft:chain', 'minecraft:glowstone'],
    entry_portal: ['minecraft:polished_deepslate_wall', 'minecraft:polished_deepslate_slab[type=bottom]', 'minecraft:chain', 'minecraft:lantern'],
    wall_relief: ['minecraft:polished_deepslate_wall', 'minecraft:polished_deepslate_slab[type=bottom]', 'minecraft:moss_carpet', 'minecraft:glowstone'],
    service_utilities: ['minecraft:iron_trapdoor[facing=north,half=bottom,open=false]', 'minecraft:copper_grate', 'minecraft:chain', 'minecraft:lightning_rod']
  },
  'greenhouse-house': {
    window_surround: ['minecraft:oxidized_cut_copper_slab[type=bottom]', 'minecraft:oxidized_copper_grate', 'minecraft:iron_bars', 'minecraft:green_stained_glass_pane', 'minecraft:chain'],
    wall_relief: ['minecraft:oxidized_cut_copper_slab[type=bottom]', 'minecraft:oxidized_copper_grate', 'minecraft:moss_carpet', 'minecraft:oak_leaves[persistent=true]'],
    plant_boxes: ['minecraft:composter', 'minecraft:potted_azalea_bush', 'minecraft:oak_leaves[persistent=true]', 'minecraft:moss_carpet', 'minecraft:flower_pot']
  }
};

const MATERIAL_ROLES_BY_KIT = {
  window_surround: ['roof_detail', 'accent', 'trim', 'railing'],
  entry_portal: ['trim', 'accent', 'foundation', 'lamp'],
  wall_relief: ['wall_detail', 'secondary_wall', 'accent', 'trim'],
  shade_awnings: ['awning', 'trim', 'railing', 'lamp'],
  plant_boxes: ['flower_box', 'planter', 'plant'],
  identity_marker: ['facade_light', 'neon', 'lamp', 'trim'],
  privacy_screen: ['railing', 'trim', 'glass'],
  service_utilities: ['service_vent', 'facade_light', 'railing'],
  decorative_screens: ['railing', 'trim', 'lamp'],
  balcony_rail: ['railing', 'trim', 'lamp']
};

export function exteriorDetailKitsForFamily(family = 'general', materials = {}) {
  const style = String(family || 'general');
  const kitIds = unique([
    ...CORE_EXTERIOR_DETAIL_KIT_IDS,
    'decorative_screens',
    'balcony_rail'
  ]);

  return kitIds.map((id) => buildKit(id, style, materials));
}

export function exteriorBlockPaletteForFamily(family = 'general', materials = {}) {
  return unique(exteriorDetailKitsForFamily(family, materials).flatMap((kit) => kit.blocks));
}

export function isNonFullExteriorBlock(block) {
  const base = blockBase(block);
  return /_slab$|_stairs$|_fence$|_wall$|_trapdoor$|_pane$|_bars$|_carpet$|_button$|_pressure_plate$|_sign$|_hanging_sign$|chain$|lantern$|candle$|flower_pot$|potted_|vine$|moss_carpet$|lightning_rod$|end_rod$|copper_grate$/.test(base);
}

function buildKit(id, family, materials) {
  const metadata = KIT_METADATA[id] || { label: id, module: id, motifs: [] };
  const blocks = unique([
    ...(FAMILY_KIT_OVERRIDES[family]?.[id] || []),
    ...materialBlocksForKit(id, materials),
    ...(COMMON_KIT_BLOCKS[id] || [])
  ]);
  return {
    id,
    label: metadata.label,
    module: metadata.module,
    motifs: [...metadata.motifs],
    block_count: unique(blocks.map(blockBase)).length,
    non_full_block_count: unique(blocks.filter(isNonFullExteriorBlock).map(blockBase)).length,
    blocks
  };
}

function materialBlocksForKit(id, materials = {}) {
  return (MATERIAL_ROLES_BY_KIT[id] || [])
    .map((role) => materials?.[role])
    .filter(Boolean);
}

function blockBase(block) {
  return String(block || '').split('[')[0];
}

function unique(values) {
  return [...new Set(values.map(String).filter(Boolean))];
}
