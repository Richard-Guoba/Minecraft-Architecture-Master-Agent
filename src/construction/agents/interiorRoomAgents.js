import { blockCatalogStats, minecraftBlocksForRole } from './minecraftBlockCatalog.js';

const INTERIOR_COLORS = [
  'white',
  'orange',
  'magenta',
  'light_blue',
  'yellow',
  'lime',
  'pink',
  'gray',
  'light_gray',
  'cyan',
  'purple',
  'blue',
  'brown',
  'green',
  'red',
  'black'
];

const VIBRANT_INTERIOR_BLOCKS = [
  ...INTERIOR_COLORS.map((color) => `minecraft:${color}_carpet`),
  ...INTERIOR_COLORS.map((color) => `minecraft:${color}_banner`),
  ...INTERIOR_COLORS.map((color) => `minecraft:${color}_candle`),
  ...INTERIOR_COLORS.map((color) => `minecraft:${color}_bed`),
  ...INTERIOR_COLORS.map((color) => `minecraft:${color}_glazed_terracotta`),
  ...INTERIOR_COLORS.map((color) => `minecraft:${color}_stained_glass_pane`),
  ...INTERIOR_COLORS.map((color) => `minecraft:${color}_shulker_box`),
  'minecraft:decorated_pot',
  'minecraft:flower_pot',
  'minecraft:potted_torchflower',
  'minecraft:potted_blue_orchid',
  'minecraft:potted_allium',
  'minecraft:potted_azure_bluet',
  'minecraft:potted_cornflower',
  'minecraft:potted_lily_of_the_valley',
  'minecraft:potted_red_tulip',
  'minecraft:potted_orange_tulip',
  'minecraft:potted_bamboo',
  'minecraft:potted_cherry_sapling',
  'minecraft:potted_azalea_bush',
  'minecraft:potted_flowering_azalea_bush',
  'minecraft:pearlescent_froglight',
  'minecraft:verdant_froglight',
  'minecraft:ochre_froglight',
  'minecraft:redstone_lamp',
  'minecraft:copper_bulb',
  'minecraft:jukebox',
  'minecraft:note_block',
  'minecraft:loom',
  'minecraft:lectern',
  'minecraft:cartography_table',
  'minecraft:chiseled_bookshelf',
  'minecraft:brewing_stand'
];

const VIBRANT_PALETTES = [
  {
    key: 'festival-pop',
    rugs: ['minecraft:magenta_carpet', 'minecraft:cyan_carpet', 'minecraft:yellow_carpet', 'minecraft:lime_carpet', 'minecraft:pink_carpet'],
    banners: ['minecraft:magenta_banner', 'minecraft:cyan_banner'],
    candles: ['minecraft:yellow_candle', 'minecraft:lime_candle'],
    planter: 'minecraft:potted_torchflower',
    display: 'minecraft:decorated_pot',
    storage: 'minecraft:purple_shulker_box',
    tile: 'minecraft:orange_glazed_terracotta',
    screen: 'minecraft:light_blue_stained_glass_pane',
    light: 'minecraft:pearlescent_froglight'
  },
  {
    key: 'warm-market',
    rugs: ['minecraft:orange_carpet', 'minecraft:red_carpet', 'minecraft:yellow_carpet', 'minecraft:white_carpet', 'minecraft:pink_carpet'],
    banners: ['minecraft:red_banner', 'minecraft:orange_banner'],
    candles: ['minecraft:orange_candle', 'minecraft:red_candle'],
    planter: 'minecraft:potted_red_tulip',
    display: 'minecraft:decorated_pot',
    storage: 'minecraft:red_shulker_box',
    tile: 'minecraft:red_glazed_terracotta',
    screen: 'minecraft:orange_stained_glass_pane',
    light: 'minecraft:ochre_froglight'
  },
  {
    key: 'garden-bright',
    rugs: ['minecraft:lime_carpet', 'minecraft:green_carpet', 'minecraft:light_blue_carpet', 'minecraft:yellow_carpet', 'minecraft:white_carpet'],
    banners: ['minecraft:green_banner', 'minecraft:yellow_banner'],
    candles: ['minecraft:lime_candle', 'minecraft:light_blue_candle'],
    planter: 'minecraft:potted_blue_orchid',
    display: 'minecraft:decorated_pot',
    storage: 'minecraft:lime_shulker_box',
    tile: 'minecraft:lime_glazed_terracotta',
    screen: 'minecraft:green_stained_glass_pane',
    light: 'minecraft:verdant_froglight'
  },
  {
    key: 'royal-contrast',
    rugs: ['minecraft:purple_carpet', 'minecraft:blue_carpet', 'minecraft:red_carpet', 'minecraft:white_carpet', 'minecraft:cyan_carpet'],
    banners: ['minecraft:purple_banner', 'minecraft:blue_banner'],
    candles: ['minecraft:purple_candle', 'minecraft:blue_candle'],
    planter: 'minecraft:potted_allium',
    display: 'minecraft:decorated_pot',
    storage: 'minecraft:blue_shulker_box',
    tile: 'minecraft:purple_glazed_terracotta',
    screen: 'minecraft:blue_stained_glass_pane',
    light: 'minecraft:sea_lantern'
  },
  {
    key: 'mono-neon',
    rugs: ['minecraft:black_carpet', 'minecraft:cyan_carpet', 'minecraft:magenta_carpet', 'minecraft:purple_carpet', 'minecraft:light_gray_carpet'],
    banners: ['minecraft:black_banner', 'minecraft:cyan_banner'],
    candles: ['minecraft:cyan_candle', 'minecraft:magenta_candle'],
    planter: 'minecraft:potted_cornflower',
    display: 'minecraft:decorated_pot',
    storage: 'minecraft:cyan_shulker_box',
    tile: 'minecraft:cyan_glazed_terracotta',
    screen: 'minecraft:magenta_stained_glass_pane',
    light: 'minecraft:redstone_lamp'
  }
];

const UNIVERSAL_INTERIOR_BLOCKS = [
  'minecraft:barrel',
  'minecraft:chest',
  'minecraft:bookshelf',
  'minecraft:chiseled_bookshelf',
  'minecraft:crafting_table',
  'minecraft:oak_slab[type=bottom]',
  'minecraft:spruce_slab[type=bottom]',
  'minecraft:smooth_quartz_slab[type=bottom]',
  'minecraft:oak_stairs[facing=north,half=bottom]',
  'minecraft:spruce_stairs[facing=north,half=bottom]',
  'minecraft:oak_fence',
  'minecraft:spruce_fence',
  'minecraft:lantern',
  'minecraft:candle',
  'minecraft:glowstone',
  'minecraft:sea_lantern',
  'minecraft:white_carpet',
  'minecraft:red_carpet',
  'minecraft:green_carpet',
  'minecraft:light_blue_carpet',
  'minecraft:flower_pot',
  'minecraft:potted_bamboo',
  'minecraft:potted_azalea_bush',
  'minecraft:decorated_pot',
  'minecraft:oak_pressure_plate',
  'minecraft:note_block',
  ...VIBRANT_INTERIOR_BLOCKS,
  ...minecraftBlocksForRole('furniture'),
  ...minecraftBlocksForRole('lighting'),
  ...minecraftBlocksForRole('plant'),
  ...minecraftBlocksForRole('floor'),
  ...minecraftBlocksForRole('door')
];

const ROOM_BLOCKS = {
  entry: [
    'minecraft:dark_oak_door[facing=south,half=lower]',
    'minecraft:spruce_stairs[facing=east,half=bottom]',
    'minecraft:barrel',
    'minecraft:chest',
    'minecraft:lantern',
    'minecraft:red_carpet',
    'minecraft:flower_pot',
    'minecraft:potted_azalea_bush',
    'minecraft:oak_pressure_plate',
    'minecraft:spruce_fence',
    'minecraft:chain',
    'minecraft:bell[attachment=floor,facing=south]'
  ],
  kitchen: [
    'minecraft:furnace',
    'minecraft:smoker',
    'minecraft:blast_furnace',
    'minecraft:crafting_table',
    'minecraft:barrel',
    'minecraft:chest',
    'minecraft:cauldron',
    'minecraft:water',
    'minecraft:stonecutter',
    'minecraft:composter',
    'minecraft:redstone_lamp',
    'minecraft:light_gray_carpet',
    'minecraft:oak_trapdoor[facing=north,half=bottom,open=false]',
    'minecraft:iron_trapdoor[facing=north,half=bottom,open=false]',
    'minecraft:cake',
    'minecraft:potted_red_mushroom',
    'minecraft:potted_brown_mushroom',
    'minecraft:hay_block',
    'minecraft:dried_kelp_block',
    'minecraft:quartz_block'
  ],
  living: [
    'minecraft:bookshelf',
    'minecraft:chiseled_bookshelf',
    'minecraft:smooth_quartz_stairs[facing=north,half=bottom]',
    'minecraft:oak_slab[type=bottom]',
    'minecraft:oak_fence',
    'minecraft:black_concrete',
    'minecraft:gray_concrete',
    'minecraft:note_block',
    'minecraft:jukebox',
    'minecraft:campfire[lit=false]',
    'minecraft:red_banner',
    'minecraft:blue_banner',
    'minecraft:potted_azalea_bush',
    'minecraft:decorated_pot',
    'minecraft:cyan_carpet'
  ],
  dining: [
    'minecraft:oak_fence',
    'minecraft:oak_pressure_plate',
    'minecraft:spruce_stairs[facing=north,half=bottom]',
    'minecraft:barrel',
    'minecraft:chest',
    'minecraft:cake',
    'minecraft:flower_pot',
    'minecraft:candle',
    'minecraft:lantern',
    'minecraft:white_carpet',
    'minecraft:red_carpet',
    'minecraft:smooth_quartz_slab[type=bottom]'
  ],
  bedroom: [
    'minecraft:red_bed',
    'minecraft:white_bed',
    'minecraft:blue_bed',
    'minecraft:black_bed',
    'minecraft:barrel',
    'minecraft:chest',
    'minecraft:trapped_chest',
    'minecraft:spruce_slab[type=bottom]',
    'minecraft:pink_carpet',
    'minecraft:potted_poppy',
    'minecraft:loom',
    'minecraft:dark_oak_trapdoor[facing=south,half=bottom,open=false]',
    'minecraft:light_gray_banner'
  ],
  study: [
    'minecraft:lectern',
    'minecraft:cartography_table',
    'minecraft:fletching_table',
    'minecraft:loom',
    'minecraft:dark_oak_slab[type=bottom]',
    'minecraft:redstone_lamp',
    'minecraft:enchanting_table',
    'minecraft:brewing_stand',
    'minecraft:composter',
    'minecraft:green_carpet'
  ],
  bathroom: [
    'minecraft:cauldron',
    'minecraft:water',
    'minecraft:smooth_quartz_slab[type=bottom]',
    'minecraft:quartz_block',
    'minecraft:white_carpet',
    'minecraft:light_blue_carpet',
    'minecraft:sea_lantern',
    'minecraft:iron_trapdoor[facing=north,half=bottom,open=false]',
    'minecraft:polished_andesite',
    'minecraft:flower_pot'
  ],
  tatami: [
    'minecraft:lime_carpet',
    'minecraft:green_carpet',
    'minecraft:bamboo_slab[type=bottom]',
    'minecraft:bamboo_fence',
    'minecraft:potted_bamboo',
    'minecraft:lantern',
    'minecraft:barrel',
    'minecraft:flower_pot',
    'minecraft:oak_pressure_plate',
    'minecraft:spruce_trapdoor[facing=south,half=bottom,open=false]'
  ],
  tea_room: [
    'minecraft:bamboo_slab[type=bottom]',
    'minecraft:bamboo_fence',
    'minecraft:potted_bamboo',
    'minecraft:green_carpet',
    'minecraft:lantern',
    'minecraft:candle',
    'minecraft:barrel',
    'minecraft:flower_pot',
    'minecraft:moss_block',
    'minecraft:decorated_pot'
  ],
  tower: [
    'minecraft:bell',
    'minecraft:cartography_table',
    'minecraft:lodestone',
    'minecraft:barrel',
    'minecraft:chest',
    'minecraft:lantern',
    'minecraft:iron_bars',
    'minecraft:stone_brick_stairs[facing=north,half=bottom]',
    'minecraft:stone_brick_slab[type=bottom]',
    'minecraft:glass'
  ],
  chapel: [
    'minecraft:lectern',
    'minecraft:candle',
    'minecraft:lantern',
    'minecraft:red_banner',
    'minecraft:blue_banner',
    'minecraft:white_carpet',
    'minecraft:smooth_quartz',
    'minecraft:chiseled_stone_bricks',
    'minecraft:flower_pot',
    'minecraft:bookshelf'
  ],
  armory: [
    'minecraft:anvil',
    'minecraft:smithing_table',
    'minecraft:grindstone',
    'minecraft:blast_furnace',
    'minecraft:barrel',
    'minecraft:chest',
    'minecraft:iron_bars',
    'minecraft:chain',
    'minecraft:stonecutter',
    'minecraft:polished_blackstone'
  ],
  garage: [
    'minecraft:smithing_table',
    'minecraft:barrel',
    'minecraft:chest',
    'minecraft:smooth_stone',
    'minecraft:stonecutter',
    'minecraft:anvil',
    'minecraft:blast_furnace',
    'minecraft:iron_bars',
    'minecraft:redstone_lamp',
    'minecraft:light_gray_concrete'
  ],
  sunroom: [
    'minecraft:composter',
    'minecraft:potted_bamboo',
    'minecraft:oak_leaves[persistent=true]',
    'minecraft:moss_block',
    'minecraft:flower_pot',
    'minecraft:potted_azalea_bush',
    'minecraft:green_carpet',
    'minecraft:lantern',
    'minecraft:sea_lantern',
    'minecraft:glass'
  ],
  circulation: [
    'minecraft:lantern',
    'minecraft:sea_lantern',
    'minecraft:glowstone',
    'minecraft:white_carpet',
    'minecraft:gray_carpet',
    'minecraft:oak_pressure_plate',
    'minecraft:spruce_fence',
    'minecraft:barrel',
    'minecraft:flower_pot',
    'minecraft:chain'
  ],
  generic: [
    'minecraft:barrel',
    'minecraft:bookshelf',
    'minecraft:crafting_table',
    'minecraft:flower_pot',
    'minecraft:lantern',
    'minecraft:white_carpet',
    'minecraft:oak_slab[type=bottom]',
    'minecraft:spruce_stairs[facing=north,half=bottom]'
  ]
};

const STYLE_BLOCKS = {
  modern: [
    'minecraft:white_concrete',
    'minecraft:light_gray_concrete',
    'minecraft:smooth_quartz',
    'minecraft:smooth_quartz_slab[type=bottom]',
    'minecraft:smooth_quartz_stairs[facing=north,half=bottom]',
    'minecraft:sea_lantern',
    'minecraft:iron_bars',
    'minecraft:cyan_carpet',
    'minecraft:black_concrete',
    'minecraft:glass',
    'minecraft:flower_pot',
    'minecraft:potted_azalea_bush',
    'minecraft:calcite',
    'minecraft:polished_tuff',
    'minecraft:end_rod',
    'minecraft:quartz_bricks',
    'minecraft:lightning_rod'
  ],
  japanese: [
    'minecraft:bamboo_slab[type=bottom]',
    'minecraft:bamboo_fence',
    'minecraft:bamboo',
    'minecraft:potted_bamboo',
    'minecraft:lime_carpet',
    'minecraft:green_carpet',
    'minecraft:dark_oak_planks',
    'minecraft:barrel',
    'minecraft:lantern',
    'minecraft:spruce_trapdoor[facing=south,half=bottom,open=false]',
    'minecraft:flower_pot',
    'minecraft:moss_block'
  ],
  gothic: [
    'minecraft:stone_brick_stairs[facing=north,half=bottom]',
    'minecraft:stone_brick_slab[type=bottom]',
    'minecraft:polished_blackstone',
    'minecraft:blackstone',
    'minecraft:iron_bars',
    'minecraft:soul_lantern',
    'minecraft:candle',
    'minecraft:red_banner',
    'minecraft:blue_banner',
    'minecraft:black_bed',
    'minecraft:chiseled_stone_bricks',
    'minecraft:chain'
  ],
  cyberpunk: [
    'minecraft:sea_lantern',
    'minecraft:cyan_concrete',
    'minecraft:magenta_concrete',
    'minecraft:black_concrete',
    'minecraft:gray_concrete',
    'minecraft:cyan_carpet',
    'minecraft:purple_carpet',
    'minecraft:redstone_lamp',
    'minecraft:iron_bars',
    'minecraft:glass',
    'minecraft:note_block',
    'minecraft:jukebox'
  ],
  alpine: [
    'minecraft:spruce_slab[type=bottom]',
    'minecraft:spruce_stairs[facing=north,half=bottom]',
    'minecraft:spruce_fence',
    'minecraft:spruce_log',
    'minecraft:lantern',
    'minecraft:campfire[lit=false]',
    'minecraft:snow_block',
    'minecraft:white_carpet',
    'minecraft:barrel',
    'minecraft:chest',
    'minecraft:potted_spruce_sapling'
  ],
  coastal: [
    'minecraft:dark_prismarine',
    'minecraft:prismarine',
    'minecraft:sea_lantern',
    'minecraft:sand',
    'minecraft:birch_slab[type=bottom]',
    'minecraft:birch_stairs[facing=north,half=bottom]',
    'minecraft:blue_carpet',
    'minecraft:light_blue_carpet',
    'minecraft:glass',
    'minecraft:flower_pot',
    'minecraft:water'
  ],
  subterranean: [
    'minecraft:mossy_cobblestone',
    'minecraft:moss_block',
    'minecraft:deepslate_bricks',
    'minecraft:polished_deepslate',
    'minecraft:glowstone',
    'minecraft:lantern',
    'minecraft:gray_carpet',
    'minecraft:barrel',
    'minecraft:chain',
    'minecraft:stone_brick_slab[type=bottom]',
    'minecraft:potted_fern'
  ],
  treehouse: [
    'minecraft:jungle_slab[type=bottom]',
    'minecraft:jungle_stairs[facing=north,half=bottom]',
    'minecraft:jungle_fence',
    'minecraft:stripped_jungle_log',
    'minecraft:oak_leaves[persistent=true]',
    'minecraft:chain',
    'minecraft:lantern',
    'minecraft:green_carpet',
    'minecraft:barrel',
    'minecraft:potted_bamboo',
    'minecraft:moss_block'
  ],
  desert: [
    'minecraft:smooth_sandstone',
    'minecraft:cut_sandstone',
    'minecraft:sandstone_slab[type=bottom]',
    'minecraft:terracotta',
    'minecraft:orange_carpet',
    'minecraft:potted_cactus',
    'minecraft:lantern',
    'minecraft:barrel',
    'minecraft:flower_pot',
    'minecraft:dead_bush',
    'minecraft:chiseled_sandstone'
  ],
  'chinese-courtyard': [
    'minecraft:dark_oak_fence',
    'minecraft:dark_oak_slab[type=bottom]',
    'minecraft:stripped_dark_oak_log',
    'minecraft:bamboo_slab[type=bottom]',
    'minecraft:bamboo_fence',
    'minecraft:red_carpet',
    'minecraft:red_banner',
    'minecraft:lantern',
    'minecraft:potted_bamboo',
    'minecraft:flower_pot',
    'minecraft:mossy_cobblestone'
  ],
  classical: [
    'minecraft:smooth_quartz',
    'minecraft:smooth_quartz_slab[type=bottom]',
    'minecraft:smooth_quartz_stairs[facing=north,half=bottom]',
    'minecraft:white_carpet',
    'minecraft:red_carpet',
    'minecraft:bookshelf',
    'minecraft:candle',
    'minecraft:flower_pot',
    'minecraft:potted_azalea_bush',
    'minecraft:lantern',
    'minecraft:chiseled_quartz_block'
  ],
  'greenhouse-house': [
    'minecraft:glass',
    'minecraft:oak_leaves[persistent=true]',
    'minecraft:moss_block',
    'minecraft:composter',
    'minecraft:potted_bamboo',
    'minecraft:potted_azalea_bush',
    'minecraft:green_carpet',
    'minecraft:sea_lantern',
    'minecraft:flower_pot',
    'minecraft:water',
    'minecraft:oxidized_copper'
  ]
};

const ROOM_SPECIALISTS = [
  roomSpecialist('entry-decoration-agent', 'local-entry-decoration-agent', '门厅装饰 Agent', ['entry'], 'entry', 'entry'),
  roomSpecialist('kitchen-decoration-agent', 'local-kitchen-decoration-agent', '厨房装饰 Agent', ['kitchen'], 'kitchen', 'kitchen'),
  roomSpecialist('living-room-decoration-agent', 'local-living-room-decoration-agent', '客厅/大厅装饰 Agent', ['living', 'lounge', 'great_hall'], 'living', 'living'),
  roomSpecialist('dining-decoration-agent', 'local-dining-decoration-agent', '餐厅装饰 Agent', ['dining'], 'dining', 'dining'),
  roomSpecialist('bedroom-decoration-agent', 'local-bedroom-decoration-agent', '卧室装饰 Agent', ['bedroom', 'master_bedroom'], 'bedroom', 'bedroom'),
  roomSpecialist('study-decoration-agent', 'local-study-decoration-agent', '书房装饰 Agent', ['study'], 'study', 'study'),
  roomSpecialist('bathroom-decoration-agent', 'local-bathroom-decoration-agent', '卫生间装饰 Agent', ['bathroom'], 'bathroom', 'bathroom'),
  roomSpecialist('tatami-decoration-agent', 'local-tatami-decoration-agent', '榻榻米装饰 Agent', ['tatami'], 'tatami', 'tatami'),
  roomSpecialist('tea-room-decoration-agent', 'local-tea-room-decoration-agent', '茶室装饰 Agent', ['tea_room'], 'tea-room', 'tea_room'),
  roomSpecialist('tower-decoration-agent', 'local-tower-decoration-agent', '塔楼装饰 Agent', ['tower'], 'tower', 'tower'),
  roomSpecialist('chapel-decoration-agent', 'local-chapel-decoration-agent', '礼拜室装饰 Agent', ['chapel'], 'chapel', 'chapel'),
  roomSpecialist('armory-decoration-agent', 'local-armory-decoration-agent', '武备间装饰 Agent', ['armory'], 'armory', 'armory'),
  roomSpecialist('garage-decoration-agent', 'local-garage-decoration-agent', '车库装饰 Agent', ['garage'], 'garage', 'garage'),
  roomSpecialist('sunroom-decoration-agent', 'local-sunroom-decoration-agent', '阳光房/温室装饰 Agent', ['sunroom', 'greenhouse'], 'sunroom', 'sunroom'),
  roomSpecialist('circulation-decoration-agent', 'local-circulation-decoration-agent', '走廊/楼梯导视 Agent', ['corridor', 'stairs'], 'circulation', 'circulation'),
  roomSpecialist('generic-room-decoration-agent', 'local-generic-room-decoration-agent', '通用/储藏/设备/工坊装饰 Agent', ['room', 'storage', 'utility', 'workshop', 'atrium'], 'generic', 'generic')
];

const STYLE_SPECIALISTS = [
  styleSpecialist('modern-interior-style-agent', 'local-modern-interior-style-agent', '现代内饰风格 Agent', ['modern', 'minimalist', 'industrial', 'futuristic'], 'modern'),
  styleSpecialist('japanese-interior-style-agent', 'local-japanese-interior-style-agent', '日式内饰风格 Agent', ['japanese'], 'japanese'),
  styleSpecialist('gothic-interior-style-agent', 'local-gothic-interior-style-agent', '哥特内饰风格 Agent', ['gothic'], 'gothic'),
  styleSpecialist('cyberpunk-interior-style-agent', 'local-cyberpunk-interior-style-agent', '赛博朋克内饰风格 Agent', ['cyberpunk'], 'cyberpunk'),
  styleSpecialist('alpine-interior-style-agent', 'local-alpine-interior-style-agent', '雪山/木屋内饰风格 Agent', ['alpine', 'rustic', 'nordic'], 'alpine'),
  styleSpecialist('coastal-interior-style-agent', 'local-coastal-interior-style-agent', '海滨内饰风格 Agent', ['coastal'], 'coastal'),
  styleSpecialist('subterranean-interior-style-agent', 'local-subterranean-interior-style-agent', '地下住宅内饰风格 Agent', ['subterranean'], 'subterranean'),
  styleSpecialist('treehouse-interior-style-agent', 'local-treehouse-interior-style-agent', '树屋内饰风格 Agent', ['treehouse'], 'treehouse'),
  styleSpecialist('desert-interior-style-agent', 'local-desert-interior-style-agent', '沙漠/地中海内饰风格 Agent', ['desert', 'mediterranean'], 'desert'),
  styleSpecialist('chinese-courtyard-interior-style-agent', 'local-chinese-courtyard-interior-style-agent', '中式合院内饰风格 Agent', ['chinese-courtyard'], 'chinese-courtyard'),
  styleSpecialist('classical-interior-style-agent', 'local-classical-interior-style-agent', '古典内饰风格 Agent', ['classical'], 'classical'),
  styleSpecialist('greenhouse-interior-style-agent', 'local-greenhouse-interior-style-agent', '温室住宅内饰风格 Agent', ['greenhouse-house'], 'greenhouse-house')
];

const SPECIALIST_DEFINITIONS = [...ROOM_SPECIALISTS, ...STYLE_SPECIALISTS];

export class InteriorDecorationAgent {
  constructor(definition) {
    this.definition = definition;
  }

  run(builder) {
    return runSpecialist(builder, this.definition, placeSpecialist);
  }
}

export class KitchenDecorationAgent extends InteriorDecorationAgent {
  constructor() {
    super(findDefinition('local-kitchen-decoration-agent'));
  }
}

export class LivingRoomDecorationAgent extends InteriorDecorationAgent {
  constructor() {
    super(findDefinition('local-living-room-decoration-agent'));
  }
}

export class BedroomDecorationAgent extends InteriorDecorationAgent {
  constructor() {
    super(findDefinition('local-bedroom-decoration-agent'));
  }
}

export class StudyDecorationAgent extends InteriorDecorationAgent {
  constructor() {
    super(findDefinition('local-study-decoration-agent'));
  }
}

export function interiorSpecialistCapabilities() {
  return SPECIALIST_DEFINITIONS.map(publicDefinition);
}

export function specialistDefinitionsForRoom(room = {}, context = {}) {
  const type = String(room.type || 'room');
  const family = styleFamilyFromContext(context);
  const area = roomArea(room);
  return SPECIALIST_DEFINITIONS.filter((definition) => {
    if (definition.scope === 'room' && area <= 24 && type === 'great_hall') return false;
    if (definition.scope === 'room') return definition.target_types.includes(type);
    if (['corridor', 'stairs'].includes(type)) return false;
    if (definition.scope === 'style' && area <= 24 && ['bathroom', 'storage', 'utility', 'workshop'].includes(type)) return false;
    if (definition.scope === 'style') return definition.style_families.includes(family);
    return false;
  });
}

export function specialistDefinitionForRoomType(type) {
  return ROOM_SPECIALISTS.find((definition) => definition.target_types.includes(String(type || '')));
}

export function specialistAgentForRoom(room = {}, context = {}) {
  return specialistAgentsForRoom(room, context)[0];
}

export function specialistAgentsForRoom(room = {}, context = {}) {
  return specialistDefinitionsForRoom(room, context).map((definition) => new InteriorDecorationAgent(definition));
}

function placeSpecialist(builder, definition) {
  if (definition.scope === 'style') {
    placeStyleSignature(builder, definition);
    return;
  }

  switch (definition.placer) {
    case 'entry':
      placeEntry(builder, definition);
      break;
    case 'kitchen':
      placeKitchen(builder, definition);
      break;
    case 'living':
      placeLivingRoom(builder, definition);
      break;
    case 'dining':
      placeDining(builder, definition);
      break;
    case 'bedroom':
      placeBedroom(builder, definition);
      break;
    case 'study':
      placeStudy(builder, definition);
      break;
    case 'bathroom':
      placeBathroom(builder, definition);
      break;
    case 'tatami':
      placeTatamiSpecialist(builder, definition);
      break;
    case 'tea-room':
      placeTeaRoomSpecialist(builder, definition);
      break;
    case 'tower':
      placeTowerSpecialist(builder, definition);
      break;
    case 'chapel':
      placeChapelSpecialist(builder, definition);
      break;
    case 'armory':
      placeArmorySpecialist(builder, definition);
      break;
    case 'garage':
      placeGarageSpecialist(builder, definition);
      break;
    case 'sunroom':
      placeSunroomSpecialist(builder, definition);
      break;
    case 'circulation':
      placeCirculationSpecialist(builder, definition);
      break;
    default:
      placeGenericSpecialist(builder, definition);
      break;
  }
}

function placeEntry(builder, definition) {
  const { y, y1, ceiling, north, south, west, east, cx, cz } = anchors(builder);
  add(builder, definition, 'vibrant-entry-runner', 'minecraft:red_carpet', cx, y, cz, 'arrival-axis', 'decor_floor');
  add(builder, definition, 'shoe-bench', 'minecraft:spruce_stairs[facing=east,half=bottom]', west, y, cz, 'entry-bench', 'decor_furniture');
  add(builder, definition, 'coat-storage', 'minecraft:barrel', east, y, north, 'coat-corner', 'decor_storage');
  add(builder, definition, 'parcel-chest', 'minecraft:chest', east, y1, north, 'coat-corner', 'decor_storage');
  add(builder, definition, 'welcome-bell', 'minecraft:bell[attachment=floor,facing=south]', cx, y1, north, 'entry-marker', 'decor_detail');
  add(builder, definition, 'entry-lantern', 'minecraft:lantern', cx, ceiling, south, 'entry-light', 'decor_light');
}

function placeKitchen(builder, definition) {
  const { y, y1, ceiling, north, south, west, east, cx, cz } = anchors(builder);
  const compact = isCompactDecorRoom(builder);
  add(builder, definition, 'smoker', 'minecraft:smoker', west + 3, y, north, 'hot-line', 'decor_utility');
  if (!compact) add(builder, definition, 'blast-furnace', 'minecraft:blast_furnace', west + 4, y, north, 'hot-line', 'decor_utility');
  add(builder, definition, 'range-hood', 'minecraft:iron_trapdoor[facing=north,half=bottom,open=false]', west + 3, y1, north, 'over-stove-hood', 'decor_detail');
  add(builder, definition, 'prep-counter', 'minecraft:smooth_quartz_slab[type=bottom]', west + 5, y, north, 'prep-line', 'decor_furniture');
  add(builder, definition, 'cutting-station', 'minecraft:stonecutter', east, y, north + 1, 'prep-corner', 'decor_utility');
  add(builder, definition, 'upper-cabinet', 'minecraft:barrel', west + 1, y1, north, 'upper-storage', 'decor_storage');
  if (!compact) add(builder, definition, 'pantry-chest', 'minecraft:chest', west + 2, y1, north, 'upper-storage', 'decor_storage');
  add(builder, definition, 'water-basin', 'minecraft:water', east, y1, north, 'sink-water', 'decor_utility');
  if (!compact) add(builder, definition, 'service-tile', 'minecraft:polished_andesite', east - 1, y, north, 'service-counter', 'decor_furniture');
  if (!compact) add(builder, definition, 'compost-bin', 'minecraft:composter', west, y, south, 'waste-corner', 'decor_utility');
  if (!compact) add(builder, definition, 'dry-storage', 'minecraft:hay_block', west + 1, y, south, 'pantry-floor', 'decor_storage');
  if (!compact) {
    add(builder, definition, 'kelp-crate', 'minecraft:dried_kelp_block', west + 2, y, south, 'pantry-floor', 'decor_storage');
    add(builder, definition, 'cake-display', 'minecraft:cake', cx, y1, north + 1, 'counter-display', 'decor_detail');
    add(builder, definition, 'breakfast-bar', 'minecraft:quartz_block', cx, y, cz + 1, 'island-base', 'decor_furniture');
    add(builder, definition, 'bar-counter', 'minecraft:smooth_quartz_slab[type=bottom]', cx, y1, cz + 1, 'island-top', 'decor_furniture');
    add(builder, definition, 'bar-stool', 'minecraft:spruce_stairs[facing=south,half=bottom]', cx - 1, y, cz + 2, 'island-seat', 'decor_furniture');
    add(builder, definition, 'bar-stool', 'minecraft:spruce_stairs[facing=south,half=bottom]', cx + 1, y, cz + 2, 'island-seat', 'decor_furniture');
  }
  add(builder, definition, 'work-light', 'minecraft:redstone_lamp', cx, ceiling, north + 1, 'work-lighting', 'decor_light');
  if (!compact) add(builder, definition, 'floor-runner', 'minecraft:light_gray_carpet', cx - 1, y, cz, 'kitchen-runner', 'decor_floor');
  if (!compact) add(builder, definition, 'counter-plate', 'minecraft:oak_pressure_plate', cx + 1, y1, cz + 1, 'serving-detail', 'decor_detail');
}

function placeLivingRoom(builder, definition) {
  const { y, y1, ceiling, north, south, west, east, cx, cz } = anchors(builder);
  const compact = isCompactDecorRoom(builder);
  const seatBlock = builder.styleFamily === 'modern'
    ? 'minecraft:smooth_quartz_stairs[facing=north,half=bottom]'
    : 'minecraft:spruce_stairs[facing=north,half=bottom]';
  addRug(builder, definition, 'living-rug', builder.styleFamily === 'modern' ? 'minecraft:cyan_carpet' : 'minecraft:red_carpet', cx, cz, compact ? 1 : 2, compact ? 0 : 1);
  add(builder, definition, 'sectional-seat', seatBlock, compact ? cx : cx - 2, y, south, 'sofa-run', 'decor_furniture');
  if (!compact) add(builder, definition, 'sectional-seat', seatBlock, cx + 2, y, south, 'sofa-run', 'decor_furniture');
  add(builder, definition, 'coffee-table-base', 'minecraft:oak_fence', cx, y, cz + 1, 'coffee-table', 'decor_furniture');
  add(builder, definition, 'coffee-table-top', 'minecraft:oak_pressure_plate', cx, y1, cz + 1, 'coffee-table', 'decor_furniture');
  add(builder, definition, 'media-wall', 'minecraft:black_concrete', cx, y, north, 'feature-wall', 'decor_detail');
  if (!compact) add(builder, definition, 'media-light', 'minecraft:sea_lantern', cx + 1, y, north, 'feature-wall', 'decor_light');
  if (!compact) add(builder, definition, 'chiseled-bookcase', 'minecraft:chiseled_bookshelf', west, y1, north, 'library-corner', 'decor_furniture');
  if (!compact) {
    add(builder, definition, 'music-corner', 'minecraft:jukebox', east, y, north, 'music-corner', 'decor_detail');
    add(builder, definition, 'note-block', 'minecraft:note_block', east, y, north + 1, 'music-corner', 'decor_detail');
    add(builder, definition, 'feature-hearth', 'minecraft:campfire[lit=false]', cx, y, north + 1, 'hearth-line', 'decor_detail');
  }
  add(builder, definition, 'plant-pot', 'minecraft:potted_azalea_bush', east, y, south, 'green-corner', 'decor_plant');
  add(builder, definition, 'ceiling-glow', 'minecraft:glowstone', cx, ceiling, cz, 'ceiling-feature', 'decor_light');
}

function placeDining(builder, definition) {
  const { y, y1, ceiling, north, south, west, east, cx, cz } = anchors(builder);
  addTableSet(builder, definition, cx, y, cz, 'dining-table');
  add(builder, definition, 'dining-chair', 'minecraft:spruce_stairs[facing=north,half=bottom]', cx - 2, y, cz, 'dining-seat', 'decor_furniture');
  add(builder, definition, 'dining-chair', 'minecraft:spruce_stairs[facing=north,half=bottom]', cx + 2, y, cz, 'dining-seat', 'decor_furniture');
  add(builder, definition, 'serving-sideboard', 'minecraft:barrel', east, y, north, 'serving-wall', 'decor_storage');
  add(builder, definition, 'china-chest', 'minecraft:chest', east, y1, north, 'serving-wall', 'decor_storage');
  add(builder, definition, 'table-candle', 'minecraft:candle', cx, y1, cz, 'table-detail', 'decor_light');
  add(builder, definition, 'dessert-display', 'minecraft:cake', cx + 1, y1, cz, 'table-detail', 'decor_detail');
  add(builder, definition, 'vibrant-dining-runner', 'minecraft:white_carpet', cx, y, cz + 1, 'dining-rug', 'decor_floor');
  add(builder, definition, 'dining-light', 'minecraft:lantern', cx, ceiling, cz, 'table-light', 'decor_light');
  add(builder, definition, 'side-plant', 'minecraft:flower_pot', west, y, south, 'dining-corner', 'decor_plant');
}

function placeBedroom(builder, definition) {
  const { y, y1, ceiling, north, south, west, east, cx, cz } = anchors(builder);
  const compact = isCompactDecorRoom(builder);
  addRug(builder, definition, 'bedroom-rug', 'minecraft:light_blue_carpet', cx, cz, 1, compact ? 0 : 2);
  if (!compact) {
    add(builder, definition, 'second-bed-foot', 'minecraft:white_bed[facing=south,part=foot]', west + 1, y, north + 1, 'expanded-sleeping-zone', 'decor_furniture');
    add(builder, definition, 'second-bed-head', 'minecraft:white_bed[facing=south,part=head]', west + 1, y, north + 2, 'expanded-sleeping-zone', 'decor_furniture');
    add(builder, definition, 'guest-bed-foot', 'minecraft:blue_bed[facing=south,part=foot]', west + 2, y, north + 1, 'expanded-sleeping-zone', 'decor_furniture');
    add(builder, definition, 'guest-bed-head', 'minecraft:blue_bed[facing=south,part=head]', west + 2, y, north + 2, 'expanded-sleeping-zone', 'decor_furniture');
  }
  add(builder, definition, 'wardrobe', 'minecraft:barrel', east - 1, y, north, 'wardrobe-wall', 'decor_storage');
  if (!compact) {
    add(builder, definition, 'wardrobe-upper', 'minecraft:chest', east, y1, north, 'wardrobe-wall', 'decor_storage');
    add(builder, definition, 'linen-chest', 'minecraft:trapped_chest', east, y, north + 1, 'wardrobe-wall', 'decor_storage');
  }
  if (!compact) {
    add(builder, definition, 'dresser', 'minecraft:spruce_slab[type=bottom]', cx, y, south, 'dresser-wall', 'decor_furniture');
    add(builder, definition, 'vanity-top', 'minecraft:oak_slab[type=bottom]', cx + 1, y, south, 'dresser-wall', 'decor_furniture');
  }
  add(builder, definition, 'reading-seat', 'minecraft:spruce_stairs[facing=north,half=bottom]', east, y, south, 'reading-corner', 'decor_furniture');
  if (!compact) add(builder, definition, 'bookcase', 'minecraft:bookshelf', east - 1, y, south, 'reading-corner', 'decor_furniture');
  if (!compact) add(builder, definition, 'plant-pot', 'minecraft:potted_poppy', east, y1, south, 'window-plant', 'decor_plant');
  add(builder, definition, 'bedside-candle', 'minecraft:candle', west, y1, north + 2, 'bedside-light', 'decor_light');
  if (!compact) add(builder, definition, 'private-lantern', 'minecraft:lantern', cx, ceiling, south, 'soft-ceiling-light', 'decor_light');
  if (!compact) {
    add(builder, definition, 'canopy-post', 'minecraft:spruce_fence', west, y1, north, 'canopy-corner', 'decor_detail');
    add(builder, definition, 'canopy-top', 'minecraft:dark_oak_trapdoor[facing=south,half=bottom,open=false]', west, Math.min(y1 + 1, ceiling), north, 'canopy-top', 'decor_detail');
  }
}

function placeStudy(builder, definition) {
  const { y, y1, ceiling, north, south, west, east, cx, cz } = anchors(builder);
  const compact = isCompactDecorRoom(builder);
  addRug(builder, definition, 'study-rug', 'minecraft:green_carpet', cx, cz, compact ? 0 : 1, compact ? 0 : 1);
  add(builder, definition, 'main-lectern', 'minecraft:lectern', cx, y, north, 'desk-line', 'decor_furniture');
  add(builder, definition, 'desk-chair', 'minecraft:oak_stairs[facing=north,half=bottom]', cx, y, north + 1, 'desk-seat', 'decor_furniture');
  add(builder, definition, 'archive-barrel', 'minecraft:barrel', west, y, north, 'archive-wall', 'decor_storage');
  add(builder, definition, 'reading-lamp', 'minecraft:redstone_lamp', cx + 1, y1, north + 1, 'task-lighting', 'decor_light');
  if (compact) return;

  add(builder, definition, 'desk-slab', 'minecraft:dark_oak_slab[type=bottom]', cx - 1, y, north, 'desk-line', 'decor_furniture');
  add(builder, definition, 'reading-chair', 'minecraft:spruce_stairs[facing=north,half=bottom]', east, y, south, 'reading-corner', 'decor_furniture');
  add(builder, definition, 'library-shelf-upper', 'minecraft:bookshelf', west, y1, south, 'library-wall', 'decor_furniture');
  add(builder, definition, 'chiseled-shelf', 'minecraft:chiseled_bookshelf', west + 1, y, south, 'library-wall', 'decor_furniture');
  add(builder, definition, 'cartography-table', 'minecraft:cartography_table', east, y, north, 'map-station', 'decor_furniture');
  add(builder, definition, 'enchanting-reference', 'minecraft:enchanting_table', cx + 2, y, cz, 'reference-table', 'decor_detail');
  add(builder, definition, 'brewing-stand', 'minecraft:brewing_stand', cx - 2, y1, cz, 'experiment-corner', 'decor_detail');
  add(builder, definition, 'potted-bamboo', 'minecraft:potted_bamboo', east, y1, south, 'quiet-plant', 'decor_plant');
  add(builder, definition, 'secondary-reading-lamp', 'minecraft:redstone_lamp', cx + 2, y1, north + 1, 'task-lighting', 'decor_light');
  add(builder, definition, 'cool-task-light', 'minecraft:sea_lantern', cx + 1, ceiling, north + 1, 'task-lighting', 'decor_light');
}

function placeBathroom(builder, definition) {
  const { y, y1, ceiling, north, south, west, east, cx, cz } = anchors(builder);
  add(builder, definition, 'filled-basin', 'minecraft:water', west, y1, north, 'wet-fixture', 'decor_utility');
  add(builder, definition, 'vanity-counter', 'minecraft:smooth_quartz_slab[type=bottom]', west + 1, y, north, 'wet-counter', 'decor_furniture');
  add(builder, definition, 'mirror-light', 'minecraft:sea_lantern', west + 1, y1, north, 'mirror-light', 'decor_light');
  add(builder, definition, 'shower-screen', 'minecraft:iron_trapdoor[facing=north,half=bottom,open=false]', east, y1, north, 'screen-detail', 'decor_detail');
  add(builder, definition, 'vibrant-bath-mat', 'minecraft:light_blue_carpet', cx, y, cz, 'bath-mat', 'decor_floor');
  add(builder, definition, 'linen-storage', 'minecraft:barrel', east, y, south, 'linen-corner', 'decor_storage');
  add(builder, definition, 'small-plant', 'minecraft:flower_pot', west, y1, south, 'fresh-corner', 'decor_plant');
}

function placeTatamiSpecialist(builder, definition) {
  const { y, y1, ceiling, north, south, west, east, cx, cz } = anchors(builder);
  const compact = isCompactDecorRoom(builder);
  addRug(builder, definition, 'specialist-tatami-grid', 'minecraft:lime_carpet', cx, cz, compact ? 1 : 2, compact ? 0 : 2);
  add(builder, definition, 'tokonoma-shelf', 'minecraft:bamboo_slab[type=bottom]', west, y, north, 'display-alcove', 'decor_furniture');
  add(builder, definition, 'bamboo-screen', 'minecraft:bamboo_fence', east, y, cz, 'screen-line', 'decor_detail');
  add(builder, definition, 'floor-lantern', 'minecraft:lantern', west, y, south, 'quiet-light', 'decor_light');
  add(builder, definition, 'potted-bamboo', 'minecraft:potted_bamboo', east, y, south, 'green-corner', 'decor_plant');
  add(builder, definition, 'low-tray', 'minecraft:oak_pressure_plate', cx, y1, cz, 'low-table-detail', 'decor_detail');
}

function placeTeaRoomSpecialist(builder, definition) {
  const { y, y1, ceiling, north, south, west, east, cx, cz } = anchors(builder);
  add(builder, definition, 'tea-heart-table', 'minecraft:bamboo_slab[type=bottom]', cx, y, cz, 'tea-heart', 'decor_furniture');
  add(builder, definition, 'tea-candle', 'minecraft:candle', cx, y1, cz, 'tea-heart', 'decor_light');
  add(builder, definition, 'tea-storage', 'minecraft:barrel', west, y, north, 'tea-storage', 'decor_storage');
  add(builder, definition, 'bamboo-view', 'minecraft:potted_bamboo', east, y, south, 'garden-view', 'decor_plant');
  add(builder, definition, 'tea-mat-edge', 'minecraft:green_carpet', cx + 1, y, cz, 'tea-mat', 'decor_floor');
  add(builder, definition, 'ceramic-pot', 'minecraft:decorated_pot', west, y, south, 'tea-display', 'decor_detail');
}

function placeTowerSpecialist(builder, definition) {
  const { y, y1, ceiling, north, south, west, east, cx, cz } = anchors(builder);
  add(builder, definition, 'lookout-bell', 'minecraft:bell', cx, y, cz, 'lookout-center', 'decor_detail');
  add(builder, definition, 'map-table', 'minecraft:cartography_table', west, y, south, 'map-corner', 'decor_furniture');
  add(builder, definition, 'watch-lantern', 'minecraft:lantern', cx, ceiling, north, 'watch-light', 'decor_light');
  add(builder, definition, 'guard-rail', 'minecraft:iron_bars', east, y1, cz, 'lookout-rail', 'decor_detail');
  add(builder, definition, 'supply-barrel', 'minecraft:barrel', west, y, north, 'supply-corner', 'decor_storage');
}

function placeChapelSpecialist(builder, definition) {
  const { y, y1, ceiling, north, south, west, east, cx, cz } = anchors(builder);
  add(builder, definition, 'altar-lectern', 'minecraft:lectern', cx, y, north, 'altar-front', 'decor_furniture');
  add(builder, definition, 'altar-candle', 'minecraft:candle', cx - 1, y1, north, 'altar-light', 'decor_light');
  add(builder, definition, 'altar-candle', 'minecraft:candle', cx + 1, y1, north, 'altar-light', 'decor_light');
  add(builder, definition, 'ceremonial-runner', 'minecraft:white_carpet', cx, y, cz, 'aisle-runner', 'decor_floor');
  add(builder, definition, 'banner-left', 'minecraft:red_banner', west, y1, cz, 'ceremonial-wall', 'decor_detail');
  add(builder, definition, 'banner-right', 'minecraft:blue_banner', east, y1, cz, 'ceremonial-wall', 'decor_detail');
}

function placeArmorySpecialist(builder, definition) {
  const { y, y1, ceiling, north, south, west, east, cx, cz } = anchors(builder);
  add(builder, definition, 'grindstone', 'minecraft:grindstone', west, y, north + 1, 'repair-line', 'decor_utility');
  add(builder, definition, 'chain-rack', 'minecraft:chain', east, y1, north, 'rack-wall', 'decor_detail');
  add(builder, definition, 'iron-rack', 'minecraft:iron_bars', east, y, north, 'rack-wall', 'decor_detail');
  add(builder, definition, 'blackstone-pad', 'minecraft:polished_blackstone', cx, y, cz, 'work-pad', 'decor_floor');
  add(builder, definition, 'supply-chest', 'minecraft:chest', west, y, south, 'supply-corner', 'decor_storage');
  add(builder, definition, 'forge-light', 'minecraft:lantern', cx, ceiling, north, 'forge-light', 'decor_light');
}

function placeGarageSpecialist(builder, definition) {
  const { y, y1, ceiling, north, south, west, east, cx, cz } = anchors(builder);
  add(builder, definition, 'vehicle-pad-wide', 'minecraft:smooth_stone', cx, y, cz, 'vehicle-pad', 'decor_floor');
  add(builder, definition, 'tool-anvil', 'minecraft:anvil', west, y, north, 'tool-wall', 'decor_utility');
  add(builder, definition, 'tool-stonecutter', 'minecraft:stonecutter', west + 1, y, north, 'tool-wall', 'decor_utility');
  add(builder, definition, 'parts-chest', 'minecraft:chest', east, y, north, 'parts-storage', 'decor_storage');
  add(builder, definition, 'task-lamp', 'minecraft:redstone_lamp', cx, ceiling, north, 'task-light', 'decor_light');
  add(builder, definition, 'metal-rail', 'minecraft:iron_bars', east, y1, south, 'garage-detail', 'decor_detail');
}

function placeSunroomSpecialist(builder, definition) {
  const { y, y1, ceiling, north, south, west, east, cx, cz } = anchors(builder);
  const compact = isCompactDecorRoom(builder);
  addRug(builder, definition, 'greenhouse-moss-floor', 'minecraft:moss_block', cx, cz, 1, compact ? 0 : 1);
  add(builder, definition, 'compost-planter', 'minecraft:composter', west, y, north, 'planting-line', 'decor_plant');
  add(builder, definition, 'leaf-cluster', 'minecraft:oak_leaves[persistent=true]', cx, y1, cz, 'leaf-cluster', 'decor_plant');
  add(builder, definition, 'azalea-pot', 'minecraft:potted_azalea_bush', east, y, south, 'sunny-corner', 'decor_plant');
  if (!compact) {
    add(builder, definition, 'water-tray', 'minecraft:water', west + 1, y1, north, 'watering-tray', 'decor_utility');
    add(builder, definition, 'grow-light', 'minecraft:sea_lantern', cx, ceiling, south, 'grow-light', 'decor_light');
  }
}

function placeCirculationSpecialist(builder, definition) {
  const { y, ceiling, north, south, cx, cz } = anchors(builder);
  add(builder, definition, 'path-runner', 'minecraft:gray_carpet', cx, y, cz, 'circulation-runner', 'decor_floor');
  add(builder, definition, 'wayfinding-light', 'minecraft:sea_lantern', cx, ceiling, cz, 'wayfinding-light', 'decor_light');
  add(builder, definition, 'threshold-plate', 'minecraft:oak_pressure_plate', cx, y, north, 'threshold-marker', 'decor_detail');
  if (builder.width >= 7 && builder.depth >= 5) {
    add(builder, definition, 'small-storage', 'minecraft:barrel', cx, y, south, 'hall-storage', 'decor_storage');
  }
}

function placeGenericSpecialist(builder, definition) {
  const { y, y1, ceiling, north, south, west, east, cx, cz } = anchors(builder);
  add(builder, definition, 'generic-storage', 'minecraft:barrel', west, y, north, 'general-storage', 'decor_storage');
  add(builder, definition, 'generic-shelf', 'minecraft:bookshelf', east, y, south, 'general-shelf', 'decor_furniture');
  add(builder, definition, 'generic-light', 'minecraft:lantern', cx, ceiling, cz, 'general-light', 'decor_light');
  add(builder, definition, 'generic-rug', 'minecraft:white_carpet', cx, y, cz, 'general-rug', 'decor_floor');
  add(builder, definition, 'generic-pot', 'minecraft:flower_pot', west, y1, south, 'general-plant', 'decor_plant');
}

function placeStyleSignature(builder, definition) {
  const { y, y1, ceiling, north, south, west, east, cx, cz } = anchors(builder);
  const blocks = definition.capability_blocks;
  const accent = blocks[0];
  const slab = firstBlock(blocks, /_slab/) || 'minecraft:oak_slab[type=bottom]';
  const stair = firstBlock(blocks, /_stairs/) || 'minecraft:spruce_stairs[facing=north,half=bottom]';
  const light = firstBlock(blocks, /lantern|glowstone|sea_lantern|redstone_lamp|candle/) || 'minecraft:lantern';
  const carpet = firstBlock(blocks, /_carpet/) || 'minecraft:white_carpet';
  const plant = firstBlock(blocks, /potted|leaves|moss_block|cactus/) || 'minecraft:flower_pot';
  const compact = builder.width * builder.depth <= 30;

  add(builder, definition, `${definition.style_key}-style-accent`, accent, east, y, cz, 'style-accent-wall', 'decor_detail');
  add(builder, definition, `${definition.style_key}-style-carpet`, carpet, cx + 1, y, cz, 'style-floor-accent', 'decor_floor');
  add(builder, definition, `${definition.style_key}-style-light`, light, cx, ceiling, south, 'style-light', 'decor_light');
  if (compact) return;

  add(builder, definition, `${definition.style_key}-style-seat`, stair, west, y, south, 'style-seat', 'decor_furniture');
  add(builder, definition, `${definition.style_key}-style-shelf`, slab, cx - 1, y, south, 'style-shelf', 'decor_furniture');
  add(builder, definition, `${definition.style_key}-style-plant`, plant, west, y1, north, 'style-plant', 'decor_plant');
  if (definition.style_key === 'modern' && builder.area >= 36) {
    add(builder, definition, 'modern-style-calcite-plinth', 'minecraft:calcite', east, y, north, 'minimal-material-accent', 'decor_detail');
    add(builder, definition, 'modern-style-tuff-plinth', 'minecraft:polished_tuff', west, y, north, 'minimal-material-accent', 'decor_detail');
    add(builder, definition, 'modern-style-end-rod', 'minecraft:end_rod', east, y1, north, 'minimal-linear-light', 'decor_light');
    add(builder, definition, 'modern-style-quartz-bricks', 'minecraft:quartz_bricks', west, y, south, 'minimal-material-accent', 'decor_detail');
    add(builder, definition, 'modern-style-lightning-rod', 'minecraft:lightning_rod[facing=up]', east, y1, south, 'minimal-linear-detail', 'decor_detail');
  }
}

function placeVibrantLayer(builder, definition) {
  const { y, y1, ceiling, north, south, west, east, cx, cz } = anchors(builder);
  const palette = vibrantPaletteFor(definition, builder.styleFamily);
  const offset = hashKey(definition.source || definition.id) % 13;
  const area = builder.width * builder.depth;
  const compact = area <= 30;
  const moderate = area > 30 && area <= 48;
  const floorPoints = uniquePoints([
    [cx, cz],
    [cx - 1, cz],
    [cx + 1, cz],
    [cx, cz - 1],
    [cx, cz + 1],
    [west, north],
    [east, north],
    [west, south],
    [east, south],
    [west, cz],
    [east, cz],
    [cx, north],
    [cx, south]
  ]);
  const wallPoints = uniquePoints([
    [west, cz],
    [east, cz],
    [cx, north],
    [cx, south],
    [west, north + 1],
    [east, north + 1],
    [west, south - 1],
    [east, south - 1],
    [west, north],
    [east, south]
  ]);
  const ceilingPoints = uniquePoints([
    [cx, north],
    [cx, south],
    [west, cz],
    [east, cz],
    [cx, cz],
    [west, north],
    [east, south]
  ]);

  const rugLimit = compact ? 2 : moderate ? 3 : palette.rugs.length;
  palette.rugs.slice(0, rugLimit).forEach((block, index) => {
    const [x, z] = pointAt(floorPoints, offset + index);
    add(builder, definition, `vibrant-rug-${index + 1}`, block, x, y, z, `${palette.key}-rug-mosaic`, 'decor_floor');
  });

  const [bannerX1, bannerZ1] = pointAt(wallPoints, offset);
  const [bannerX2, bannerZ2] = pointAt(wallPoints, offset + 3);
  const [candleX1, candleZ1] = pointAt(floorPoints, offset + 5);
  const [candleX2, candleZ2] = pointAt(floorPoints, offset + 7);
  const [plantX, plantZ] = pointAt(floorPoints, offset + 8);
  const [displayX, displayZ] = pointAt(floorPoints, offset + 9);
  const [storageX, storageZ] = pointAt(floorPoints, offset + 10);
  const [tileX, tileZ] = pointAt(floorPoints, offset + 11);
  const [screenX, screenZ] = pointAt(wallPoints, offset + 6);
  const [lightX, lightZ] = pointAt(ceilingPoints, offset + 2);

  add(builder, definition, 'vibrant-banner-left', palette.banners[0], bannerX1, y1, bannerZ1, `${palette.key}-wall-color`, 'decor_detail');
  add(builder, definition, 'vibrant-candle-left', palette.candles[0], candleX1, y, candleZ1, `${palette.key}-colored-candles`, 'decor_light');
  add(builder, definition, 'vibrant-planter', palette.planter, plantX, y, plantZ, `${palette.key}-plant-color`, 'decor_plant');
  add(builder, definition, 'vibrant-display-pot', palette.display, displayX, y, displayZ, `${palette.key}-ceramic-display`, 'decor_detail');
  add(builder, definition, 'vibrant-ceiling-light', palette.light, lightX, ceiling, lightZ, `${palette.key}-ceiling-color`, 'decor_light');
  if (compact) return;

  add(builder, definition, 'vibrant-candle-right', palette.candles[1], candleX2, y, candleZ2, `${palette.key}-colored-candles`, 'decor_light');
  add(builder, definition, 'vibrant-storage-cube', palette.storage, storageX, y, storageZ, `${palette.key}-color-storage`, 'decor_storage');
  add(builder, definition, 'vibrant-glazed-tile', palette.tile, tileX, y, tileZ, `${palette.key}-glazed-tile`, 'decor_floor');
  if (moderate) return;

  add(builder, definition, 'vibrant-banner-right', palette.banners[1], bannerX2, y1, bannerZ2, `${palette.key}-wall-color`, 'decor_detail');
  add(builder, definition, 'vibrant-glass-screen', palette.screen, screenX, y1, screenZ, `${palette.key}-glass-screen`, 'decor_detail');
}

function runSpecialist(builder, definition, place) {
  const before = builder.blocks.length;
  place(builder, definition);
  const compactStyleRoom = definition.scope === 'style' && builder.width * builder.depth <= 30;
  const compactFunctionalRoom = definition.scope === 'room' &&
    builder.width * builder.depth <= 24 &&
    ['bathroom', 'storage', 'utility', 'workshop', 'entry'].includes(builder.room?.type);
  if (!['corridor', 'stairs'].includes(builder.room?.type) && !compactStyleRoom && !compactFunctionalRoom) placeVibrantLayer(builder, definition);
  return {
    agent_id: definition.source,
    id: definition.id,
    label: definition.label,
    scope: definition.scope,
    target_types: [...(definition.target_types || [])],
    style_families: [...(definition.style_families || [])],
    block_count: definition.capability_blocks.length,
    placement_count: builder.blocks.length - before
  };
}

function add(builder, definition, role, block, x, y, z, placement, module) {
  return builder.addWithin(role, block, x, y, z, placement, module, definition.source);
}

function addRug(builder, definition, placement, block, centerX, centerZ, radiusX, radiusZ) {
  for (let x = centerX - radiusX; x <= centerX + radiusX; x += 1) {
    for (let z = centerZ - radiusZ; z <= centerZ + radiusZ; z += 1) {
      add(builder, definition, 'floor-accent', block, x, builder.floorY, z, placement, 'decor_floor');
    }
  }
}

function addTableSet(builder, definition, x, y, z, placement) {
  add(builder, definition, 'table-base', 'minecraft:oak_fence', x, y, z, placement, 'decor_furniture');
  add(builder, definition, 'table-top', 'minecraft:oak_pressure_plate', x, y + 1, z, placement, 'decor_furniture');
}

function isCompactDecorRoom(builder) {
  const area = builder.area || builder.width * builder.depth;
  return area <= 50 || Math.min(builder.width, builder.depth) <= 4;
}

function roomArea(room = {}) {
  const width = Number(room.max_x) - Number(room.min_x) + 1;
  const depth = Number(room.max_z) - Number(room.min_z) + 1;
  if (!Number.isFinite(width) || !Number.isFinite(depth)) return 0;
  return Math.max(0, width) * Math.max(0, depth);
}

function vibrantPaletteFor(definition, styleFamily) {
  const key = definition.style_key || definition.placer || definition.id || styleFamily || 'general';
  if (key === 'cyberpunk' || styleFamily === 'cyberpunk') return VIBRANT_PALETTES.find((palette) => palette.key === 'mono-neon');
  if (['sunroom', 'greenhouse-house', 'treehouse'].includes(key) || ['greenhouse-house', 'treehouse'].includes(styleFamily)) return VIBRANT_PALETTES.find((palette) => palette.key === 'garden-bright');
  if (['gothic', 'classical', 'chapel', 'tower'].includes(key) || ['gothic', 'classical'].includes(styleFamily)) return VIBRANT_PALETTES.find((palette) => palette.key === 'royal-contrast');
  if (['kitchen', 'dining', 'entry', 'desert', 'chinese-courtyard'].includes(key)) return VIBRANT_PALETTES.find((palette) => palette.key === 'warm-market');
  return VIBRANT_PALETTES[hashKey(key) % VIBRANT_PALETTES.length];
}

function anchors(builder) {
  return {
    y: builder.floorY,
    y1: Math.min(builder.floorY + 1, builder.ceilingY),
    ceiling: builder.ceilingY,
    north: builder.room.min_z + 1,
    south: builder.room.max_z - 1,
    west: builder.room.min_x + 1,
    east: builder.room.max_x - 1,
    cx: builder.centerX,
    cz: builder.centerZ
  };
}

function roomSpecialist(id, source, label, targetTypes, placer, blockKey) {
  return specialistDefinition({
    id,
    source,
    label,
    scope: 'room',
    target_types: targetTypes,
    capability_blocks: [...(ROOM_BLOCKS[blockKey] || []), ...UNIVERSAL_INTERIOR_BLOCKS],
    roles: roomRolesFor(placer),
    placer
  });
}

function styleSpecialist(id, source, label, styleFamilies, styleKey) {
  return specialistDefinition({
    id,
    source,
    label,
    scope: 'style',
    style_families: styleFamilies,
    style_key: styleKey,
    capability_blocks: [...(STYLE_BLOCKS[styleKey] || []), ...UNIVERSAL_INTERIOR_BLOCKS],
    roles: [
      'style-accent-wall',
      'style-floor-accent',
      'style-lighting',
      'style-planting',
      'style-seat',
      'style-shelf'
    ],
    placer: 'style'
  });
}

function roomRolesFor(placer) {
  const common = ['storage', 'lighting', 'floor-accent', 'display-detail'];
  const roles = {
    entry: ['arrival-axis', 'entry-bench', 'coat-storage', 'threshold-marker'],
    kitchen: ['stove-line', 'prep-counter', 'sink-line', 'pantry-storage', 'breakfast-bar'],
    living: ['sectional-seating', 'media-wall', 'bookshelf-wall', 'rug-zone', 'hearth-or-feature'],
    dining: ['dining-table', 'serving-wall', 'table-light', 'dining-rug'],
    bedroom: ['sleeping-zone', 'wardrobe-wall', 'bedside-storage', 'soft-flooring', 'private-lighting'],
    study: ['desk-zone', 'library-wall', 'map-and-craft-table', 'archive-storage', 'reading-light'],
    bathroom: ['wet-fixture', 'wet-counter', 'bath-mat', 'linen-storage'],
    tatami: ['tatami-grid', 'tokonoma', 'screen-line', 'quiet-light'],
    'tea-room': ['tea-heart', 'tea-storage', 'garden-view', 'ceramic-display'],
    tower: ['lookout-center', 'map-corner', 'watch-light', 'guard-rail'],
    chapel: ['altar-front', 'altar-light', 'aisle-runner', 'ceremonial-wall'],
    armory: ['repair-line', 'rack-wall', 'work-pad', 'forge-light'],
    garage: ['vehicle-pad', 'tool-wall', 'parts-storage', 'task-light'],
    sunroom: ['planting-line', 'leaf-cluster', 'watering-tray', 'grow-light'],
    circulation: ['circulation-runner', 'wayfinding-light', 'threshold-marker']
  }[placer] || ['general-storage', 'general-light'];
  return [...roles, ...common];
}

function specialistDefinition(definition) {
  const capabilityBlocks = unique(definition.capability_blocks.map(asMinecraftBlock));
  return {
    ...definition,
    target_types: [...(definition.target_types || [])],
    style_families: [...(definition.style_families || [])],
    capability_blocks: capabilityBlocks,
    roles: [...definition.roles]
  };
}

function publicDefinition(definition) {
  return {
    id: definition.id,
    source: definition.source,
    label: definition.label,
    scope: definition.scope,
    target_types: [...(definition.target_types || [])],
    style_families: [...(definition.style_families || [])],
    block_count: definition.capability_blocks.length,
    capability_blocks: [...definition.capability_blocks],
    block_catalog: blockCatalogStats(),
    roles: [...definition.roles]
  };
}

function styleFamilyFromContext(context = {}) {
  return String(context.styleFamily || context.architecture?.style_family || context.buildSpec?.style_family || 'general');
}

function findDefinition(source) {
  return SPECIALIST_DEFINITIONS.find((definition) => definition.source === source);
}

function firstBlock(blocks, pattern) {
  return blocks.find((block) => pattern.test(block));
}

function hashKey(key) {
  return [...String(key || '')].reduce((total, char) => total + char.charCodeAt(0), 0);
}

function asMinecraftBlock(block) {
  const text = String(block || '');
  return text.startsWith('minecraft:') ? text : `minecraft:${text}`;
}

function uniquePoints(points) {
  const seen = new Set();
  const result = [];
  for (const [x, z] of points) {
    const key = `${x},${z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push([x, z]);
  }
  return result;
}

function pointAt(points, index) {
  return points[((index % points.length) + points.length) % points.length];
}

function unique(values) {
  return [...new Set(values.map(String).filter(Boolean))];
}
