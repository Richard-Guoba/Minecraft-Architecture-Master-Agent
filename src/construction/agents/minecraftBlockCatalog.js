import { MINECRAFT_121_REGISTRY_BLOCK_IDS } from './minecraftBlockRegistry1_21.js';

export const MINECRAFT_BLOCK_CATALOG_VERSION = 'java-1.21/1.21.1';
export const MINECRAFT_BLOCK_CATALOG_SOURCE = 'https://github.com/PrismarineJS/minecraft-data/tree/master/data/pc/1.21.1';

const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry'];
const STEMS = ['crimson', 'warped'];
const BAMBOO = ['bamboo'];
const COLORS = [
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

const BASE_BLOCKS = [
  'air',
  'water',
  'lava',
  'stone',
  'granite',
  'polished_granite',
  'diorite',
  'polished_diorite',
  'andesite',
  'polished_andesite',
  'grass_block',
  'dirt',
  'coarse_dirt',
  'podzol',
  'rooted_dirt',
  'mud',
  'packed_mud',
  'clay',
  'gravel',
  'sand',
  'red_sand',
  'sandstone',
  'smooth_sandstone',
  'cut_sandstone',
  'chiseled_sandstone',
  'red_sandstone',
  'smooth_red_sandstone',
  'cut_red_sandstone',
  'chiseled_red_sandstone',
  'cobblestone',
  'mossy_cobblestone',
  'stone_bricks',
  'mossy_stone_bricks',
  'cracked_stone_bricks',
  'chiseled_stone_bricks',
  'smooth_stone',
  'bricks',
  'deepslate',
  'cobbled_deepslate',
  'polished_deepslate',
  'deepslate_bricks',
  'cracked_deepslate_bricks',
  'deepslate_tiles',
  'cracked_deepslate_tiles',
  'chiseled_deepslate',
  'tuff',
  'polished_tuff',
  'tuff_bricks',
  'chiseled_tuff',
  'chiseled_tuff_bricks',
  'calcite',
  'dripstone_block',
  'blackstone',
  'polished_blackstone',
  'polished_blackstone_bricks',
  'cracked_polished_blackstone_bricks',
  'chiseled_polished_blackstone',
  'basalt',
  'smooth_basalt',
  'polished_basalt',
  'netherrack',
  'nether_bricks',
  'cracked_nether_bricks',
  'chiseled_nether_bricks',
  'red_nether_bricks',
  'end_stone',
  'end_stone_bricks',
  'purpur_block',
  'purpur_pillar',
  'quartz_block',
  'smooth_quartz',
  'chiseled_quartz_block',
  'quartz_bricks',
  'quartz_pillar',
  'prismarine',
  'prismarine_bricks',
  'dark_prismarine',
  'sea_lantern',
  'obsidian',
  'crying_obsidian',
  'bedrock',
  'ice',
  'packed_ice',
  'blue_ice',
  'snow',
  'snow_block',
  'moss_block',
  'moss_carpet',
  'sculk',
  'sculk_catalyst',
  'sculk_shrieker',
  'sculk_sensor',
  'calibrated_sculk_sensor',
  'amethyst_block',
  'budding_amethyst',
  'small_amethyst_bud',
  'medium_amethyst_bud',
  'large_amethyst_bud',
  'amethyst_cluster',
  'glass',
  'tinted_glass',
  'gold_block',
  'iron_block',
  'copper_block',
  'diamond_block',
  'emerald_block',
  'lapis_block',
  'redstone_block',
  'coal_block',
  'netherite_block',
  'raw_iron_block',
  'raw_copper_block',
  'raw_gold_block',
  'slime_block',
  'honey_block',
  'honeycomb_block',
  'hay_block',
  'dried_kelp_block',
  'bone_block',
  'melon',
  'pumpkin',
  'carved_pumpkin',
  'jack_o_lantern',
  'target',
  'lodestone',
  'respawn_anchor',
  'beacon',
  'conduit',
  'heavy_core',
  'trial_spawner',
  'vault',
  'ominous_trial_spawner',
  'crafter',
  'decorated_pot'
];

const FUNCTIONAL_BLOCKS = [
  'crafting_table',
  'furnace',
  'blast_furnace',
  'smoker',
  'cartography_table',
  'fletching_table',
  'smithing_table',
  'stonecutter',
  'grindstone',
  'loom',
  'lectern',
  'enchanting_table',
  'brewing_stand',
  'anvil',
  'chipped_anvil',
  'damaged_anvil',
  'barrel',
  'chest',
  'trapped_chest',
  'ender_chest',
  'bookshelf',
  'chiseled_bookshelf',
  'note_block',
  'jukebox',
  'bell',
  'composter',
  'cauldron',
  'water_cauldron',
  'lava_cauldron',
  'powder_snow_cauldron',
  'campfire',
  'soul_campfire',
  'lantern',
  'soul_lantern',
  'torch',
  'soul_torch',
  'redstone_torch',
  'candle',
  'cake',
  'flower_pot',
  'lightning_rod',
  'hopper',
  'dropper',
  'dispenser',
  'observer',
  'piston',
  'sticky_piston',
  'lever',
  'tripwire_hook',
  'daylight_detector',
  'redstone_lamp',
  'redstone_wire',
  'rail',
  'powered_rail',
  'detector_rail',
  'activator_rail',
  'chain',
  'iron_bars',
  'end_rod'
];

const PLANTS = [
  'oak_sapling',
  'spruce_sapling',
  'birch_sapling',
  'jungle_sapling',
  'acacia_sapling',
  'dark_oak_sapling',
  'mangrove_propagule',
  'cherry_sapling',
  'grass',
  'short_grass',
  'fern',
  'dead_bush',
  'dandelion',
  'poppy',
  'blue_orchid',
  'allium',
  'azure_bluet',
  'red_tulip',
  'orange_tulip',
  'white_tulip',
  'pink_tulip',
  'oxeye_daisy',
  'cornflower',
  'lily_of_the_valley',
  'wither_rose',
  'torchflower',
  'pitcher_plant',
  'sunflower',
  'lilac',
  'rose_bush',
  'peony',
  'bamboo',
  'cactus',
  'sugar_cane',
  'kelp',
  'kelp_plant',
  'seagrass',
  'sea_pickle',
  'lily_pad',
  'vine',
  'glow_lichen',
  'hanging_roots',
  'azalea',
  'flowering_azalea',
  'brown_mushroom',
  'red_mushroom',
  'crimson_fungus',
  'warped_fungus',
  'crimson_roots',
  'warped_roots',
  'nether_sprouts'
];

const COPPER_STATES = ['', 'exposed_', 'weathered_', 'oxidized_'];
const WAXED = ['', 'waxed_'];
const COPPER_BASES = [
  'cut_copper',
  'cut_copper_stairs',
  'cut_copper_slab',
  'chiseled_copper',
  'copper_grate',
  'copper_door',
  'copper_trapdoor',
  'copper_bulb'
];

const INVALID_GENERATED_BLOCKS = new Set([
  'ominous_trial_spawner',
  'grass',
  'mangrove_sapling',
  'stone_wall',
  'polished_granite_wall',
  'polished_diorite_wall',
  'polished_andesite_wall',
  'smooth_sandstone_wall',
  'smooth_red_sandstone_wall',
  'prismarine_brick_wall',
  'dark_prismarine_wall',
  'quartz',
  'quartz_wall',
  'smooth_quartz_wall',
  'purpur',
  'purpur_wall',
  'potted_rose_bush',
  'potted_lily_pad',
  'potted_hanging_roots',
  'potted_azalea',
  'potted_flowering_azalea'
]);

const BLOCK_GROUPS = {
  base: BASE_BLOCKS,
  functional: FUNCTIONAL_BLOCKS,
  plants: PLANTS,
  woods: woodBlocks(),
  colors: colorBlocks(),
  stones: stoneVariants(),
  copper: copperBlocks(),
  corals: coralBlocks(),
  potted: pottedPlants()
};

const GENERATED_ROLE_BLOCK_IDS = unique([
  ...Object.values(BLOCK_GROUPS).flat(),
  ...oreBlocks(),
  ...froglightBlocks(),
  ...skulkVeinAndWallBlocks()
]).filter((name) => !INVALID_GENERATED_BLOCKS.has(name)).map((name) => `minecraft:${name}`);

export const MINECRAFT_121_BLOCK_IDS = unique([
  ...MINECRAFT_121_REGISTRY_BLOCK_IDS,
  ...GENERATED_ROLE_BLOCK_IDS
]);

const KNOWN_BLOCK_BASES = new Set(MINECRAFT_121_BLOCK_IDS.map((block) => block.slice('minecraft:'.length)));

const BUILD_PART_USAGE_POLICIES = [
  {
    part: 'structural_frame',
    preferred_roles: ['structural-frame', 'mass-block', 'pier'],
    guidance: 'Use as columns, cores, corner posts, heavy plinths, or exposed beams; keep odd novelty blocks as rare anchors.'
  },
  {
    part: 'wall_plane',
    preferred_roles: ['wall-surface', 'mass-block', 'panel'],
    guidance: 'Use broad, quiet blocks for the main plane; reserve vivid or patterned blocks for small panels and story accents.'
  },
  {
    part: 'facade_trim',
    preferred_roles: ['sill-lintel', 'cornice', 'pier', 'micro-detail'],
    guidance: 'Use slabs, stairs, walls, buttons, heads, signs, rods, and grates as edges, belts, caps, and focal details only where the wall has blank space.'
  },
  {
    part: 'window_system',
    preferred_roles: ['glazing', 'sill-lintel', 'screen'],
    guidance: 'Keep glass clear; use sills and lintels first, side jambs only with enough window spacing, and avoid bars unless the style explicitly wants protected slits.'
  },
  {
    part: 'entry_system',
    preferred_roles: ['entry', 'threshold', 'lighting', 'identity-marker'],
    guidance: 'Concentrate ornament at the entrance with a readable threshold, posts, canopy, lamp, and one identity marker.'
  },
  {
    part: 'roof',
    preferred_roles: ['roofing', 'cornice', 'drainage', 'vegetation'],
    guidance: 'Use stairs and slabs for pitch and eaves, copper or chains for drainage, and foliage only as an intentional canopy or green roof layer.'
  },
  {
    part: 'site_landscape',
    preferred_roles: ['terrain', 'vegetation', 'water', 'path', 'outdoor-furniture'],
    guidance: 'Layer soil, stone, leaf, vine, flower, water, and furniture blocks into terrain zones instead of repeating one plant everywhere.'
  },
  {
    part: 'interior_fixture',
    preferred_roles: ['fixture', 'storage', 'workstation', 'soft-furnishing', 'lighting'],
    guidance: 'Treat functional blocks as furniture, equipment, and room identity; use colorful soft blocks sparingly to mark use.'
  },
  {
    part: 'utility_detail',
    preferred_roles: ['mechanical', 'redstone', 'vent', 'indicator-light'],
    guidance: 'Group technical blocks into service bays, vents, roof utilities, and industrial details rather than scattering them across quiet walls.'
  },
  {
    part: 'special_accent',
    preferred_roles: ['artifact', 'identity-marker', 'rare-accent'],
    guidance: 'Use heads, spawners, vaults, heavy cores, rare ores, and other unusual blocks as one-off symbols, trophies, keystones, or themed frame accents.'
  }
];

let BLOCK_USAGE_ATLAS_CACHE = null;

export function blockCatalogStats() {
  return {
    version: MINECRAFT_BLOCK_CATALOG_VERSION,
    source: MINECRAFT_BLOCK_CATALOG_SOURCE,
    blockCount: MINECRAFT_121_BLOCK_IDS.length,
    registryBlockCount: MINECRAFT_121_REGISTRY_BLOCK_IDS.length,
    generatedRoleBlockCount: GENERATED_ROLE_BLOCK_IDS.length,
    categoryCounts: Object.fromEntries(
      Object.entries(BLOCK_GROUPS).map(([category, blocks]) => [category, unique(blocks).length])
    ),
    usageRoleCounts: blockUsageAtlasStats().roleCounts
  };
}

export function normalizeBlockId(block) {
  const text = String(block || '').trim();
  if (!text) return '';
  const base = text.split('[')[0];
  return base.startsWith('minecraft:') ? base : `minecraft:${base}`;
}

export function isKnownMinecraft121Block(block) {
  const normalized = normalizeBlockId(block);
  if (!normalized.startsWith('minecraft:')) return false;
  return KNOWN_BLOCK_BASES.has(normalized.slice('minecraft:'.length));
}

export function minecraftBlocksForRole(role, context = {}) {
  const family = String(context.styleFamily || context.family || 'general');
  const roleName = String(role || 'general');
  const styleBlocks = styleBlocksForFamily(family);
  const roleBlocks = roleBlocksFor(roleName);
  return asMinecraftBlocks(unique([...styleBlocks, ...roleBlocks]));
}

export function materialOptionsForFamily(family, prompt = '') {
  const styleBlocks = styleBlocksForFamily(family);
  const promptBlocks = promptDrivenBlocks(prompt);
  return {
    wall: asMinecraftBlocks(unique([...styleBlocks, ...roleBlocksFor('wall'), ...promptBlocks])),
    floor: asMinecraftBlocks(unique([...styleBlocks, ...roleBlocksFor('floor'), ...promptBlocks])),
    roof: asMinecraftBlocks(unique([...styleBlocks, ...roleBlocksFor('roof'), ...promptBlocks])),
    trim: asMinecraftBlocks(unique([...styleBlocks, ...roleBlocksFor('trim'), ...promptBlocks])),
    glass: asMinecraftBlocks(roleBlocksFor('glass')),
    door: asMinecraftBlocks(roleBlocksFor('door')),
    stairs: asMinecraftBlocks(roleBlocksFor('stairs')),
    slab: asMinecraftBlocks(roleBlocksFor('slab')),
    lighting: asMinecraftBlocks(roleBlocksFor('lighting')),
    plant: asMinecraftBlocks(roleBlocksFor('plant')),
    furniture: asMinecraftBlocks(roleBlocksFor('furniture')),
    redstone: asMinecraftBlocks(roleBlocksFor('redstone')),
    landscape: asMinecraftBlocks(roleBlocksFor('landscape')),
    frame: asMinecraftBlocks(roleBlocksFor('frame')),
    exterior_detail: asMinecraftBlocks(roleBlocksFor('exterior_detail')),
    ornament: asMinecraftBlocks(roleBlocksFor('ornament')),
    artifact: asMinecraftBlocks(roleBlocksFor('artifact')),
    technical_detail: asMinecraftBlocks(roleBlocksFor('technical_detail')),
    vegetation: asMinecraftBlocks(roleBlocksFor('vegetation')),
    creative: MINECRAFT_121_BLOCK_IDS,
    all: MINECRAFT_121_BLOCK_IDS,
    catalog: MINECRAFT_121_BLOCK_IDS
  };
}

export function minecraftBlockUsageAtlas({ compact = false } = {}) {
  if (!BLOCK_USAGE_ATLAS_CACHE) {
    BLOCK_USAGE_ATLAS_CACHE = MINECRAFT_121_BLOCK_IDS.map((block) => blockUsageProfile(block));
  }
  if (!compact) {
    return BLOCK_USAGE_ATLAS_CACHE.map((entry) => ({
      ...entry,
      roles: [...entry.roles],
      parts: [...entry.parts],
      examples: [...entry.examples]
    }));
  }
  return Object.fromEntries(BLOCK_USAGE_ATLAS_CACHE.map((entry) => [
    entry.block,
    {
      primary_use: entry.primary_use,
      roles: [...entry.roles],
      parts: [...entry.parts],
      placement: entry.placement
    }
  ]));
}

export function blockUsageAtlasStats() {
  const atlas = minecraftBlockUsageAtlas();
  const roleCounts = {};
  const partCounts = {};
  for (const entry of atlas) {
    for (const role of entry.roles) roleCounts[role] = (roleCounts[role] || 0) + 1;
    for (const part of entry.parts) partCounts[part] = (partCounts[part] || 0) + 1;
  }
  return {
    version: MINECRAFT_BLOCK_CATALOG_VERSION,
    blockCount: atlas.length,
    coverageBlockCount: atlas.filter((entry) => entry.roles.length > 0 && entry.parts.length > 0).length,
    roleCounts,
    partCounts,
    policyCount: BUILD_PART_USAGE_POLICIES.length
  };
}

export function blockUsageProfile(block) {
  const normalized = normalizeBlockId(block);
  const name = normalized.startsWith('minecraft:') ? normalized.slice('minecraft:'.length) : String(block || '');
  const roles = [];
  const parts = [];
  const examples = [];

  addUsage(roles, parts, examples, 'general-buildable', 'wall_plane', 'Fallback block for bespoke accents or prompt-driven construction.');

  if (/^(air|cave_air|void_air)$/.test(name)) {
    return usageEntry(normalized, ['negative-space'], ['opening', 'void'], ['Carve openings, keep clearances, or reserve invisible debug space.'], 'opening clearance');
  }
  if (/^(water|lava|bubble_column)$/.test(name)) addUsage(roles, parts, examples, 'fluid', 'site_landscape', 'Use as pools, water edges, moats, fountains, lava cores, or contained hazards.');
  if (/^(powder_snow|snow|ice|packed_ice|blue_ice|frosted_ice)$/.test(name)) addUsage(roles, parts, examples, 'climate-surface', 'site_landscape', 'Use for climate bands, snow caps, frozen paths, and cold roof edges.');
  if (/sand|gravel|dirt|podzol|mud|clay|nylium|mycelium|grass_block|moss_block|farmland|soul_sand|soul_soil/.test(name)) addUsage(roles, parts, examples, 'terrain', 'site_landscape', 'Use as ground plane, berm, planter soil, trail edge, or natural wall base.');
  if (/ore$|ancient_debris|raw_.*_block|coal_block|iron_block|gold_block|diamond_block|emerald_block|lapis_block|redstone_block|netherite_block|copper_block/.test(name)) addUsage(roles, parts, examples, 'resource-accent', 'special_accent', 'Use as rare inlays, treasury accents, plinths, cores, or symbolic structural nodes.');
  if (/_log$|_wood$|_stem$|_hyphae$|stripped_.*(_log|_wood|_stem|_hyphae|_block)$|bamboo_block/.test(name)) addUsage(roles, parts, examples, 'structural-frame', 'structural_frame', 'Use as posts, beams, stilts, exposed trusses, trunks, and warm wall rhythm.');
  if (/_planks$|bamboo_mosaic$/.test(name)) addUsage(roles, parts, examples, 'wall-surface', 'wall_plane', 'Use as timber wall fields, floors, soffits, decks, and broad frame infill.');
  if (/stone|granite|diorite|andesite|deepslate|tuff|basalt|blackstone|sandstone|quartz|prismarine|purpur|brick|terracotta|concrete|wool|obsidian|end_stone|netherrack|nether_bricks/.test(name)) addUsage(roles, parts, examples, 'mass-block', 'wall_plane', 'Use as primary walls, plinths, retaining mass, facade fields, or strong contrast panels.');
  if (/_stairs$/.test(name)) addUsage(roles, parts, examples, 'cornice', 'facade_trim', 'Use as roof pitch, sill cap, eave lip, stair run, bench, bracket, or shadow line.');
  if (/_slab$/.test(name)) addUsage(roles, parts, examples, 'sill-lintel', 'facade_trim', 'Use as thin belt course, window sill, lintel, step, roof edge, shelf, or layered wall trim.');
  if (/_wall$/.test(name)) addUsage(roles, parts, examples, 'pier', 'facade_trim', 'Use as corner pilaster, parapet tooth, low wall, window jamb, or vertical rhythm.');
  if (/_fence$|_fence_gate$|iron_bars$/.test(name)) addUsage(roles, parts, examples, 'screen', 'facade_trim', 'Use as railings, screens, balcony guards, light structural posts, or garden boundaries.');
  if (/_door$/.test(name)) addUsage(roles, parts, examples, 'entry', 'entry_system', 'Use as primary doors, service doors, false panels, or large facade shutters.');
  if (/_trapdoor$|copper_grate$/.test(name)) addUsage(roles, parts, examples, 'vent-panel', 'utility_detail', 'Use as shutters, grates, mechanical vents, planter faces, access hatches, or texture panels.');
  if (/glass$|_glass$|_glass_pane$|tinted_glass$/.test(name)) addUsage(roles, parts, examples, 'glazing', 'window_system', 'Use as windows, skylights, greenhouse skin, display cases, translucent screens, or light wells.');
  if (/torch|lantern|glowstone|sea_lantern|froglight|redstone_lamp|end_rod|candle|copper_bulb|jack_o_lantern|beacon|respawn_anchor/.test(name)) addUsage(roles, parts, examples, 'lighting', 'lighting', 'Use as lamps, night identity, path lights, luminous trim, shrine lights, or service indicators.');
  if (/sapling|propagule|leaves$|azalea|flower|tulip|daisy|orchid|bluet|allium|cornflower|rose|peony|lilac|sunflower|mushroom|fungus|roots|vine|lichen|grass$|fern|petals|dripleaf|spore_blossom|cactus|bamboo|sugar_cane|kelp|seagrass|lily_pad|coral|pickle|moss_carpet/.test(name)) addUsage(roles, parts, examples, 'vegetation', 'site_landscape', 'Use as canopy, hedge, planter layer, understory, green roof, hanging growth, or biome-specific decoration.');
  if (/bed$|carpet$|banner$|wall_banner$|shulker_box$/.test(name)) addUsage(roles, parts, examples, 'soft-furnishing', 'interior_fixture', 'Use as rugs, beds, flags, awnings, signage color fields, or compact storage accents.');
  if (/chest|barrel|furnace|smoker|blast_furnace|crafting_table|cartography_table|fletching_table|smithing_table|stonecutter|grindstone|loom|lectern|bookshelf|enchanting_table|brewing_stand|anvil|cauldron|composter|jukebox|note_block|bell|decorated_pot|flower_pot|cake/.test(name)) addUsage(roles, parts, examples, 'fixture', 'interior_fixture', 'Use as room equipment, storage, kitchen/workshop fixtures, planters, hearth details, or decor anchors.');
  if (/redstone|piston|observer|hopper|dropper|dispenser|rail|detector_rail|powered_rail|activator_rail|lever|tripwire|daylight_detector|target|crafter|sculk_sensor|calibrated_sculk_sensor/.test(name)) addUsage(roles, parts, examples, 'mechanical', 'utility_detail', 'Use as service spines, vents, machinery, roof equipment, signal panels, rails, or technical facade accents.');
  if (/button$|pressure_plate$|sign$|hanging_sign$|head$|skull$|chain$|lightning_rod$|heavy_core|vault|trial_spawner|spawner|conduit|lodestone|sculk|amethyst|dragon_egg|decorated_pot/.test(name)) addUsage(roles, parts, examples, 'micro-detail', 'special_accent', 'Use as hardware, address marks, trophies, keystones, artifacts, ritual details, or tiny scale cues.');

  return usageEntry(normalized, roles, parts, examples, primaryUseFor(roles));
}

export function partUsagePolicies() {
  return BUILD_PART_USAGE_POLICIES.map((policy) => ({
    ...policy,
    preferred_roles: [...policy.preferred_roles]
  }));
}

function roleBlocksFor(role) {
  const woods = BLOCK_GROUPS.woods;
  const colors = BLOCK_GROUPS.colors;
  const stones = BLOCK_GROUPS.stones;
  const copper = BLOCK_GROUPS.copper;
  const functional = BLOCK_GROUPS.functional;
  const plants = BLOCK_GROUPS.plants;
  const potted = BLOCK_GROUPS.potted;
  if (role === 'catalog' || role === 'all') return MINECRAFT_121_BLOCK_IDS;
  if (role === 'wall') return [...stones, ...concreteBlocks(), ...terracottaBlocks(), ...copper];
  if (role === 'floor') return [...woods.filter((block) => /planks$|_slab$/.test(block)), ...stones.filter((block) => /_slab$|stone$|bricks$|tiles$/.test(block)), ...colors.filter((block) => /_carpet$|_wool$/.test(block))];
  if (role === 'roof') return [...woods.filter((block) => /planks$|_slab$|_stairs$/.test(block)), ...stones.filter((block) => /_stairs$|_slab$|bricks$|tiles$/.test(block)), ...copper.filter((block) => /copper/.test(block))];
  if (role === 'trim') return [...stones, ...copper, ...woods.filter((block) => /fence$|_wall$|_slab$/.test(block)), ...colors.filter((block) => /_banner$|_carpet$/.test(block))];
  if (role === 'glass') return ['glass', 'tinted_glass', ...COLORS.flatMap((color) => [`${color}_stained_glass`, `${color}_stained_glass_pane`])];
  if (role === 'door') return [...WOODS.flatMap((wood) => [`${wood}_door`, `${wood}_trapdoor`, `${wood}_fence_gate`]), ...STEMS.flatMap((wood) => [`${wood}_door`, `${wood}_trapdoor`, `${wood}_fence_gate`]), 'bamboo_door', 'bamboo_trapdoor', 'bamboo_fence_gate', 'iron_door', 'iron_trapdoor', ...copper.filter((block) => /door|trapdoor/.test(block))];
  if (role === 'stairs') return [...woods.filter((block) => /_stairs$/.test(block)), ...stones.filter((block) => /_stairs$/.test(block)), ...copper.filter((block) => /_stairs$/.test(block))];
  if (role === 'slab') return [...woods.filter((block) => /_slab$/.test(block)), ...stones.filter((block) => /_slab$/.test(block)), ...copper.filter((block) => /_slab$/.test(block))];
  if (role === 'lighting') return ['torch', 'soul_torch', 'lantern', 'soul_lantern', 'glowstone', 'sea_lantern', 'redstone_lamp', 'jack_o_lantern', 'end_rod', 'candle', ...COLORS.map((color) => `${color}_candle`), ...froglightBlocks(), ...copper.filter((block) => /bulb/.test(block))];
  if (role === 'plant') return [...plants, ...potted, ...WOODS.map((wood) => `${wood}_leaves`).filter((block) => block !== 'bamboo_leaves'), 'azalea_leaves', 'flowering_azalea_leaves'];
  if (role === 'furniture') return [...functional, ...woods.filter((block) => /_slab$|_stairs$|fence$|trapdoor$|pressure_plate$/.test(block)), ...colors.filter((block) => /_bed$|_banner$|_carpet$/.test(block))];
  if (role === 'redstone') return functional.filter((block) => /redstone|piston|observer|dropper|dispenser|hopper|lever|rail|crafter|daylight|tripwire/.test(block)).concat(['crafter', 'target']);
  if (role === 'landscape') return ['grass_block', 'dirt', 'coarse_dirt', 'podzol', 'rooted_dirt', 'mud', 'packed_mud', 'gravel', 'sand', 'red_sand', 'clay', 'moss_block', 'snow_block', 'ice', 'packed_ice', 'blue_ice', ...plants, ...BLOCK_GROUPS.corals];
  if (role === 'frame') return blocksForUsage((profile) => profile.roles.includes('structural-frame') || profile.roles.includes('mass-block') || profile.roles.includes('pier'));
  if (role === 'exterior_detail') return blocksForUsage((profile) => ['sill-lintel', 'cornice', 'pier', 'screen', 'vent-panel', 'micro-detail', 'lighting', 'identity-marker'].some((item) => profile.roles.includes(item)));
  if (role === 'ornament') return blocksForUsage((profile) => ['micro-detail', 'artifact', 'soft-furnishing', 'lighting', 'vegetation', 'resource-accent'].some((item) => profile.roles.includes(item)));
  if (role === 'artifact') return blocksForUsage((profile) => profile.parts.includes('special_accent') || ['resource-accent', 'micro-detail'].some((item) => profile.roles.includes(item)));
  if (role === 'technical_detail') return blocksForUsage((profile) => profile.parts.includes('utility_detail') || ['mechanical', 'vent-panel', 'lighting'].some((item) => profile.roles.includes(item)));
  if (role === 'vegetation') return blocksForUsage((profile) => profile.roles.includes('vegetation'));
  return [...BASE_BLOCKS, ...functional, ...woods, ...colors, ...stones, ...plants, ...potted];
}

function styleBlocksForFamily(family) {
  const style = String(family || 'general');
  if (style === 'modern' || style === 'industrial' || style === 'futuristic') return ['white_concrete', 'light_gray_concrete', 'gray_concrete', 'black_concrete', 'smooth_quartz', 'quartz_block', 'glass', 'sea_lantern', 'iron_bars', ...BLOCK_GROUPS.copper];
  if (style === 'cyberpunk') return ['black_concrete', 'gray_concrete', 'cyan_concrete', 'magenta_concrete', 'purple_concrete', 'sea_lantern', 'redstone_lamp', 'iron_bars', 'tinted_glass'];
  if (style === 'gothic') return ['stone_bricks', 'mossy_stone_bricks', 'cracked_stone_bricks', 'chiseled_stone_bricks', 'blackstone', 'polished_blackstone', 'deepslate_tiles', 'iron_bars', 'soul_lantern', 'candle'];
  if (style === 'japanese' || style === 'chinese-courtyard') return ['dark_oak_planks', 'dark_oak_slab', 'dark_oak_stairs', 'dark_oak_fence', 'bamboo_planks', 'bamboo_slab', 'bamboo_fence', 'bamboo_mosaic', 'lantern', 'red_carpet'];
  if (style === 'treehouse' || style === 'tropical') return ['jungle_planks', 'jungle_slab', 'jungle_stairs', 'jungle_fence', 'stripped_jungle_log', 'moss_block', 'oak_leaves', 'vine', 'lantern'];
  if (style === 'alpine' || style === 'rustic' || style === 'nordic') return ['spruce_planks', 'spruce_slab', 'spruce_stairs', 'spruce_fence', 'stripped_spruce_log', 'stone_bricks', 'snow_block', 'lantern', 'campfire'];
  if (style === 'coastal') return ['birch_planks', 'birch_slab', 'birch_stairs', 'dark_prismarine', 'prismarine', 'sea_lantern', 'sand', 'light_blue_carpet', 'glass'];
  if (style === 'subterranean') return ['deepslate_bricks', 'polished_deepslate', 'mossy_cobblestone', 'moss_block', 'glowstone', 'lantern', 'chain', 'gray_carpet'];
  if (style === 'desert' || style === 'mediterranean') return ['smooth_sandstone', 'cut_sandstone', 'chiseled_sandstone', 'terracotta', 'orange_terracotta', 'sandstone_slab', 'lantern', 'potted_cactus'];
  if (style === 'greenhouse-house') return ['glass', 'tinted_glass', 'moss_block', 'oak_leaves', 'flowering_azalea_leaves', 'composter', 'oxidized_copper', 'sea_lantern'];
  if (style === 'classical') return ['smooth_quartz', 'quartz_block', 'chiseled_quartz_block', 'quartz_pillar', 'bricks', 'red_carpet', 'candle', 'lantern'];
  return [];
}

function woodBlocks() {
  const overworld = WOODS.flatMap((wood) => [
    `${wood}_log`,
    `${wood}_wood`,
    `stripped_${wood}_log`,
    `stripped_${wood}_wood`,
    `${wood}_planks`,
    `${wood}_stairs`,
    `${wood}_slab`,
    `${wood}_fence`,
    `${wood}_fence_gate`,
    `${wood}_door`,
    `${wood}_trapdoor`,
    `${wood}_pressure_plate`,
    `${wood}_button`,
    `${wood}_sign`,
    `${wood}_wall_sign`,
    `${wood}_hanging_sign`,
    `${wood}_wall_hanging_sign`,
    `${wood}_leaves`,
    `${wood}_sapling`
  ]);
  const nether = STEMS.flatMap((wood) => [
    `${wood}_stem`,
    `${wood}_hyphae`,
    `stripped_${wood}_stem`,
    `stripped_${wood}_hyphae`,
    `${wood}_planks`,
    `${wood}_stairs`,
    `${wood}_slab`,
    `${wood}_fence`,
    `${wood}_fence_gate`,
    `${wood}_door`,
    `${wood}_trapdoor`,
    `${wood}_pressure_plate`,
    `${wood}_button`,
    `${wood}_sign`,
    `${wood}_wall_sign`,
    `${wood}_hanging_sign`,
    `${wood}_wall_hanging_sign`
  ]);
  const bamboo = BAMBOO.flatMap((wood) => [
    `${wood}_block`,
    `stripped_${wood}_block`,
    `${wood}_planks`,
    `${wood}_mosaic`,
    `${wood}_stairs`,
    `${wood}_mosaic_stairs`,
    `${wood}_slab`,
    `${wood}_mosaic_slab`,
    `${wood}_fence`,
    `${wood}_fence_gate`,
    `${wood}_door`,
    `${wood}_trapdoor`,
    `${wood}_pressure_plate`,
    `${wood}_button`,
    `${wood}_sign`,
    `${wood}_wall_sign`,
    `${wood}_hanging_sign`,
    `${wood}_wall_hanging_sign`
  ]);
  return [...overworld, ...nether, ...bamboo];
}

function colorBlocks() {
  return COLORS.flatMap((color) => [
    `${color}_wool`,
    `${color}_carpet`,
    `${color}_bed`,
    `${color}_banner`,
    `${color}_wall_banner`,
    `${color}_concrete`,
    `${color}_concrete_powder`,
    `${color}_terracotta`,
    `${color}_glazed_terracotta`,
    `${color}_stained_glass`,
    `${color}_stained_glass_pane`,
    `${color}_shulker_box`,
    `${color}_candle`
  ]);
}

function concreteBlocks() {
  return COLORS.flatMap((color) => [`${color}_concrete`, `${color}_concrete_powder`]);
}

function terracottaBlocks() {
  return COLORS.flatMap((color) => [`${color}_terracotta`, `${color}_glazed_terracotta`]);
}

function stoneVariants() {
  const bases = [
    'stone',
    'cobblestone',
    'mossy_cobblestone',
    'stone_brick',
    'mossy_stone_brick',
    'granite',
    'polished_granite',
    'diorite',
    'polished_diorite',
    'andesite',
    'polished_andesite',
    'deepslate_brick',
    'deepslate_tile',
    'cobbled_deepslate',
    'polished_deepslate',
    'tuff',
    'polished_tuff',
    'tuff_brick',
    'sandstone',
    'smooth_sandstone',
    'red_sandstone',
    'smooth_red_sandstone',
    'brick',
    'mud_brick',
    'nether_brick',
    'red_nether_brick',
    'blackstone',
    'polished_blackstone',
    'polished_blackstone_brick',
    'end_stone_brick',
    'prismarine',
    'prismarine_brick',
    'dark_prismarine',
    'quartz',
    'smooth_quartz',
    'purpur'
  ];
  const blocks = [];
  for (const base of bases) {
    const blockBase = base.endsWith('brick') || base.endsWith('tile') ? `${base}s` : base;
    blocks.push(blockBase, `${base}_stairs`, `${base}_slab`, `${base}_wall`);
  }
  blocks.push(...BASE_BLOCKS.filter((block) => /stone|brick|tuff|deepslate|quartz|prismarine|blackstone|sandstone|basalt|purpur/.test(block)));
  return blocks;
}

function copperBlocks() {
  const blocks = [
    'copper_block',
    'exposed_copper',
    'weathered_copper',
    'oxidized_copper',
    'waxed_copper_block',
    'waxed_exposed_copper',
    'waxed_weathered_copper',
    'waxed_oxidized_copper'
  ];
  for (const waxed of WAXED) {
    for (const state of COPPER_STATES) {
      for (const base of COPPER_BASES) {
        blocks.push(`${waxed}${state}${base}`);
      }
    }
  }
  return blocks;
}

function coralBlocks() {
  const types = ['tube', 'brain', 'bubble', 'fire', 'horn'];
  return types.flatMap((type) => [
    `${type}_coral`,
    `${type}_coral_block`,
    `${type}_coral_fan`,
    `${type}_coral_wall_fan`,
    `dead_${type}_coral`,
    `dead_${type}_coral_block`,
    `dead_${type}_coral_fan`,
    `dead_${type}_coral_wall_fan`
  ]);
}

function pottedPlants() {
  return [
    ...PLANTS.filter((block) => /sapling|mushroom|fungus|roots|fern|bamboo|cactus|azalea|tulip|orchid|allium|bluet|daisy|cornflower|poppy|dandelion|lily|rose|dead_bush/.test(block))
      .map((block) => `potted_${block}`),
    'potted_flowering_azalea_bush',
    'potted_azalea_bush'
  ];
}

function oreBlocks() {
  const ores = ['coal', 'iron', 'copper', 'gold', 'redstone', 'emerald', 'lapis', 'diamond'];
  return ores.flatMap((ore) => [`${ore}_ore`, `deepslate_${ore}_ore`]).concat(['nether_gold_ore', 'nether_quartz_ore', 'ancient_debris']);
}

function froglightBlocks() {
  return ['ochre_froglight', 'verdant_froglight', 'pearlescent_froglight'];
}

function skulkVeinAndWallBlocks() {
  return ['sculk_vein', 'pointed_dripstone', 'big_dripleaf', 'big_dripleaf_stem', 'small_dripleaf', 'spore_blossom'];
}

function promptDrivenBlocks(prompt) {
  const text = String(prompt || '');
  const blocks = [];
  if (/霓虹|neon|海晶灯|海灯/i.test(text)) blocks.push('sea_lantern', 'cyan_concrete', 'magenta_concrete', 'redstone_lamp');
  if (/铜|copper/i.test(text)) blocks.push(...BLOCK_GROUPS.copper);
  if (/雪|snow/i.test(text)) blocks.push('snow_block', 'ice', 'packed_ice', 'blue_ice');
  if (/苔藓|moss/i.test(text)) blocks.push('moss_block', 'mossy_cobblestone', 'mossy_stone_bricks');
  if (/樱|cherry/i.test(text)) blocks.push(...BLOCK_GROUPS.woods.filter((block) => block.startsWith('cherry_') || block.startsWith('stripped_cherry_')));
  return blocks;
}

function blocksForUsage(predicate) {
  return minecraftBlockUsageAtlas()
    .filter(predicate)
    .map((profile) => profile.block.slice('minecraft:'.length));
}

function addUsage(roles, parts, examples, role, part, example) {
  if (role && !roles.includes(role)) roles.push(role);
  if (part && !parts.includes(part)) parts.push(part);
  if (example && !examples.includes(example)) examples.push(example);
}

function usageEntry(block, roles, parts, examples, primaryUse) {
  const finalRoles = unique(roles);
  const finalParts = unique(parts);
  const finalExamples = unique(examples);
  return {
    block,
    primary_use: primaryUse || primaryUseFor(finalRoles),
    roles: finalRoles,
    parts: finalParts,
    examples: finalExamples,
    placement: placementGuidanceFor(finalRoles, finalParts)
  };
}

function primaryUseFor(roles) {
  const priority = [
    ['negative-space', 'opening clearance'],
    ['structural-frame', 'structural frame or exposed post'],
    ['glazing', 'window, skylight, or translucent surface'],
    ['sill-lintel', 'thin trim, sill, lintel, shelf, or belt course'],
    ['cornice', 'shadow-making stair edge, bracket, eave, or seat'],
    ['pier', 'vertical pier, parapet, corner quoin, or low wall'],
    ['screen', 'railing, screen, grille, or boundary'],
    ['vent-panel', 'shutter, grate, access hatch, or service panel'],
    ['vegetation', 'planting, canopy, hedge, or green layer'],
    ['lighting', 'lamp, glowing trim, path light, or indicator'],
    ['fixture', 'room fixture, furniture, or equipment'],
    ['mechanical', 'machine, service spine, redstone detail, or roof utility'],
    ['micro-detail', 'hardware, identity marker, trophy, or small accent'],
    ['resource-accent', 'rare inlay, plinth, core, or treasure accent'],
    ['terrain', 'terrain, berm, path, planter soil, or natural base'],
    ['wall-surface', 'broad wall, floor, deck, soffit, or infill'],
    ['mass-block', 'primary wall mass, foundation, or contrast panel']
  ];
  const roleSet = new Set(roles);
  return priority.find(([role]) => roleSet.has(role))?.[1] || 'general construction or controlled accent';
}

function placementGuidanceFor(roles, parts) {
  const roleSet = new Set(roles);
  const partSet = new Set(parts);
  if (roleSet.has('negative-space')) return 'Use as an invisible operation, not as visible decoration.';
  if (roleSet.has('glazing')) return 'Place inside explicit opening modules and keep adjacent exterior details out of the glass plane.';
  if (roleSet.has('sill-lintel') || roleSet.has('cornice')) return 'Place as continuous or paired edge courses where it reinforces a window, roof, floor, or wall edge.';
  if (roleSet.has('micro-detail') || partSet.has('special_accent')) return 'Use at low frequency as focal hardware, story detail, or identity marker.';
  if (roleSet.has('vegetation')) return 'Layer with at least two related plant or terrain blocks when representing living growth.';
  if (partSet.has('utility_detail')) return 'Cluster into service zones, vents, technical backs, or roof equipment.';
  if (partSet.has('structural_frame')) return 'Align to grid, corners, supports, floor lines, or visible load paths.';
  return 'Use according to scale: broad fields for quiet blocks, sparse accents for vivid or unusual blocks.';
}

function asMinecraftBlocks(blocks) {
  return unique(blocks.map((block) => String(block).startsWith('minecraft:') ? block : `minecraft:${block}`))
    .filter((block) => isKnownMinecraft121Block(block));
}

function unique(values) {
  return [...new Set(values.map(String).filter(Boolean))];
}
