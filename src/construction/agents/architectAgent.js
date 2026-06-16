import { STYLE_GRAMMAR_MATERIAL_HINTS, STYLE_GRAMMAR_PROFILES, StyleGrammarAgent } from './styleGrammarAgent.js';

const SHAPES = new Set(['box', 'cylinder']);
const BOOLEAN_MODES = new Set(['union', 'subtract']);
const FOOTPRINTS = new Set(['rectangle', 'l-shape', 'winged', 'courtyard', 'compact-tower']);

const MATERIAL_PRESETS = {
  欧式: {
    foundation: 'minecraft:stone_bricks',
    wall: 'minecraft:smooth_sandstone',
    floor: 'minecraft:spruce_planks',
    roof: 'minecraft:dark_oak_planks',
    trim: 'minecraft:smooth_quartz',
    glass: 'minecraft:glass',
    door: 'minecraft:dark_oak_door',
    interior_wall: 'minecraft:birch_planks',
    stairs: 'minecraft:spruce_stairs[facing=south,half=bottom]',
    path: 'minecraft:gravel',
    lamp: 'minecraft:glowstone'
  },
  现代: {
    foundation: 'minecraft:smooth_stone',
    wall: 'minecraft:white_concrete',
    floor: 'minecraft:quartz_block',
    roof: 'minecraft:smooth_stone',
    trim: 'minecraft:light_gray_concrete',
    glass: 'minecraft:glass',
    door: 'minecraft:iron_door',
    interior_wall: 'minecraft:light_gray_concrete',
    stairs: 'minecraft:quartz_stairs[facing=south,half=bottom]',
    path: 'minecraft:smooth_stone',
    lamp: 'minecraft:sea_lantern'
  },
  江南: {
    foundation: 'minecraft:stone_bricks',
    wall: 'minecraft:white_concrete',
    floor: 'minecraft:spruce_planks',
    roof: 'minecraft:deepslate_tiles',
    trim: 'minecraft:stripped_dark_oak_log',
    glass: 'minecraft:glass_pane',
    door: 'minecraft:spruce_door',
    interior_wall: 'minecraft:birch_planks',
    stairs: 'minecraft:spruce_stairs[facing=south,half=bottom]',
    path: 'minecraft:mossy_cobblestone',
    lamp: 'minecraft:lantern[hanging=true]'
  },
  日式: {
    foundation: 'minecraft:stone_bricks',
    wall: 'minecraft:stripped_birch_wood',
    floor: 'minecraft:bamboo_planks',
    roof: 'minecraft:deepslate_tiles',
    trim: 'minecraft:dark_oak_planks',
    glass: 'minecraft:glass_pane',
    door: 'minecraft:spruce_door',
    interior_wall: 'minecraft:birch_planks',
    stairs: 'minecraft:bamboo_stairs[facing=south,half=bottom]',
    path: 'minecraft:gravel',
    lamp: 'minecraft:lantern[hanging=true]'
  },
  地中海: {
    foundation: 'minecraft:sandstone',
    wall: 'minecraft:white_concrete',
    floor: 'minecraft:cut_sandstone',
    roof: 'minecraft:blue_terracotta',
    trim: 'minecraft:dark_prismarine',
    glass: 'minecraft:glass',
    door: 'minecraft:dark_oak_door',
    interior_wall: 'minecraft:smooth_sandstone',
    stairs: 'minecraft:sandstone_stairs[facing=south,half=bottom]',
    path: 'minecraft:smooth_sandstone',
    lamp: 'minecraft:sea_lantern'
  },
  北欧: {
    foundation: 'minecraft:stone_bricks',
    wall: 'minecraft:stripped_spruce_log',
    floor: 'minecraft:spruce_planks',
    roof: 'minecraft:dark_oak_planks',
    trim: 'minecraft:white_concrete',
    glass: 'minecraft:glass',
    door: 'minecraft:spruce_door',
    interior_wall: 'minecraft:birch_planks',
    stairs: 'minecraft:spruce_stairs[facing=south,half=bottom]',
    path: 'minecraft:coarse_dirt',
    lamp: 'minecraft:lantern[hanging=true]'
  },
  木屋: {
    foundation: 'minecraft:cobblestone',
    wall: 'minecraft:stripped_spruce_log',
    floor: 'minecraft:spruce_planks',
    roof: 'minecraft:dark_oak_planks',
    trim: 'minecraft:stripped_dark_oak_log',
    glass: 'minecraft:glass_pane',
    door: 'minecraft:spruce_door',
    interior_wall: 'minecraft:spruce_planks',
    stairs: 'minecraft:spruce_stairs[facing=south,half=bottom]',
    path: 'minecraft:coarse_dirt',
    lamp: 'minecraft:lantern[hanging=true]'
  },
  哥特: {
    foundation: 'minecraft:stone_bricks',
    wall: 'minecraft:deepslate_bricks',
    floor: 'minecraft:polished_deepslate',
    roof: 'minecraft:blackstone',
    trim: 'minecraft:smooth_quartz',
    glass: 'minecraft:purple_stained_glass',
    door: 'minecraft:dark_oak_door',
    interior_wall: 'minecraft:stone_bricks',
    stairs: 'minecraft:stone_brick_stairs[facing=south,half=bottom]',
    path: 'minecraft:polished_blackstone',
    lamp: 'minecraft:soul_lantern[hanging=true]'
  },
  维多利亚: {
    foundation: 'minecraft:stone_bricks',
    wall: 'minecraft:bricks',
    floor: 'minecraft:oak_planks',
    roof: 'minecraft:dark_oak_planks',
    trim: 'minecraft:white_concrete',
    glass: 'minecraft:glass_pane',
    door: 'minecraft:dark_oak_door',
    interior_wall: 'minecraft:birch_planks',
    stairs: 'minecraft:oak_stairs[facing=south,half=bottom]',
    path: 'minecraft:brick_stairs[facing=south,half=bottom]',
    lamp: 'minecraft:lantern[hanging=true]'
  },
  工业: {
    foundation: 'minecraft:smooth_stone',
    wall: 'minecraft:bricks',
    floor: 'minecraft:smooth_stone',
    roof: 'minecraft:polished_blackstone',
    trim: 'minecraft:iron_bars',
    glass: 'minecraft:gray_stained_glass',
    door: 'minecraft:iron_door',
    interior_wall: 'minecraft:gray_concrete',
    stairs: 'minecraft:stone_brick_stairs[facing=south,half=bottom]',
    path: 'minecraft:stone',
    lamp: 'minecraft:redstone_lamp'
  },
  热带: {
    foundation: 'minecraft:jungle_log',
    wall: 'minecraft:bamboo_planks',
    floor: 'minecraft:jungle_planks',
    roof: 'minecraft:hay_block',
    trim: 'minecraft:stripped_jungle_log',
    glass: 'minecraft:glass_pane',
    door: 'minecraft:jungle_door',
    interior_wall: 'minecraft:bamboo_planks',
    stairs: 'minecraft:jungle_stairs[facing=south,half=bottom]',
    path: 'minecraft:sand',
    lamp: 'minecraft:lantern[hanging=true]'
  },
  沙漠: {
    foundation: 'minecraft:sandstone',
    wall: 'minecraft:terracotta',
    floor: 'minecraft:smooth_sandstone',
    roof: 'minecraft:mud_bricks',
    trim: 'minecraft:cut_sandstone',
    glass: 'minecraft:orange_stained_glass',
    door: 'minecraft:acacia_door',
    interior_wall: 'minecraft:packed_mud',
    stairs: 'minecraft:sandstone_stairs[facing=south,half=bottom]',
    path: 'minecraft:red_sand',
    lamp: 'minecraft:lantern[hanging=true]'
  },
  未来: {
    foundation: 'minecraft:smooth_stone',
    wall: 'minecraft:white_concrete',
    floor: 'minecraft:quartz_block',
    roof: 'minecraft:light_gray_concrete',
    trim: 'minecraft:cyan_concrete',
    glass: 'minecraft:light_blue_stained_glass',
    door: 'minecraft:iron_door',
    interior_wall: 'minecraft:light_gray_concrete',
    stairs: 'minecraft:quartz_stairs[facing=south,half=bottom]',
    path: 'minecraft:sea_lantern',
    lamp: 'minecraft:sea_lantern'
  },
  农舍: {
    foundation: 'minecraft:cobblestone',
    wall: 'minecraft:white_terracotta',
    floor: 'minecraft:oak_planks',
    roof: 'minecraft:spruce_planks',
    trim: 'minecraft:stripped_oak_log',
    glass: 'minecraft:glass_pane',
    door: 'minecraft:oak_door',
    interior_wall: 'minecraft:birch_planks',
    stairs: 'minecraft:oak_stairs[facing=south,half=bottom]',
    path: 'minecraft:coarse_dirt',
    lamp: 'minecraft:lantern[hanging=true]'
  },
  海滨: {
    foundation: 'minecraft:smooth_sandstone',
    wall: 'minecraft:white_concrete',
    floor: 'minecraft:birch_planks',
    roof: 'minecraft:prismarine_bricks',
    trim: 'minecraft:dark_prismarine',
    glass: 'minecraft:light_blue_stained_glass',
    door: 'minecraft:birch_door',
    interior_wall: 'minecraft:birch_planks',
    stairs: 'minecraft:birch_stairs[facing=south,half=bottom]',
    path: 'minecraft:sand',
    lamp: 'minecraft:sea_lantern'
  },
  雪山: {
    foundation: 'minecraft:stone_bricks',
    wall: 'minecraft:stripped_spruce_log',
    floor: 'minecraft:spruce_planks',
    roof: 'minecraft:deepslate_tiles',
    trim: 'minecraft:snow_block',
    glass: 'minecraft:glass_pane',
    door: 'minecraft:spruce_door',
    interior_wall: 'minecraft:spruce_planks',
    stairs: 'minecraft:spruce_stairs[facing=south,half=bottom]',
    path: 'minecraft:snow_block',
    lamp: 'minecraft:lantern[hanging=true]'
  },
  地下: {
    foundation: 'minecraft:deepslate_bricks',
    wall: 'minecraft:stone_bricks',
    floor: 'minecraft:polished_deepslate',
    roof: 'minecraft:moss_block',
    trim: 'minecraft:mossy_cobblestone',
    glass: 'minecraft:glass',
    door: 'minecraft:iron_door',
    interior_wall: 'minecraft:deepslate_tiles',
    stairs: 'minecraft:stone_brick_stairs[facing=south,half=bottom]',
    path: 'minecraft:mossy_cobblestone',
    lamp: 'minecraft:glowstone'
  },
  悬崖: {
    foundation: 'minecraft:stone_bricks',
    wall: 'minecraft:light_gray_concrete',
    floor: 'minecraft:spruce_planks',
    roof: 'minecraft:smooth_stone',
    trim: 'minecraft:iron_bars',
    glass: 'minecraft:glass',
    door: 'minecraft:iron_door',
    interior_wall: 'minecraft:light_gray_concrete',
    stairs: 'minecraft:stone_brick_stairs[facing=south,half=bottom]',
    path: 'minecraft:stone',
    lamp: 'minecraft:sea_lantern'
  },
  树屋: {
    foundation: 'minecraft:jungle_log',
    wall: 'minecraft:jungle_planks',
    floor: 'minecraft:jungle_planks',
    roof: 'minecraft:oak_leaves[persistent=true]',
    trim: 'minecraft:stripped_jungle_log',
    glass: 'minecraft:glass_pane',
    door: 'minecraft:jungle_door',
    interior_wall: 'minecraft:bamboo_planks',
    stairs: 'minecraft:jungle_stairs[facing=south,half=bottom]',
    path: 'minecraft:mossy_cobblestone',
    lamp: 'minecraft:lantern[hanging=true]'
  },
  温室住宅: {
    foundation: 'minecraft:smooth_stone',
    wall: 'minecraft:glass',
    floor: 'minecraft:quartz_block',
    roof: 'minecraft:glass',
    trim: 'minecraft:oxidized_copper',
    glass: 'minecraft:glass',
    door: 'minecraft:iron_door',
    interior_wall: 'minecraft:light_gray_concrete',
    stairs: 'minecraft:quartz_stairs[facing=south,half=bottom]',
    path: 'minecraft:mossy_cobblestone',
    lamp: 'minecraft:sea_lantern'
  },
  赛博朋克: {
    foundation: 'minecraft:polished_blackstone',
    wall: 'minecraft:black_concrete',
    floor: 'minecraft:gray_concrete',
    roof: 'minecraft:polished_blackstone',
    trim: 'minecraft:cyan_concrete',
    glass: 'minecraft:purple_stained_glass',
    door: 'minecraft:iron_door',
    interior_wall: 'minecraft:gray_concrete',
    stairs: 'minecraft:polished_blackstone_stairs[facing=south,half=bottom]',
    path: 'minecraft:sea_lantern',
    lamp: 'minecraft:sea_lantern'
  }
};

const STYLE_PROFILES = [
  ...STYLE_GRAMMAR_PROFILES,
  profile('欧式', /欧式|欧洲|古典|法式|巴洛克|洛可可|庄园|别墅|宫殿/, {
    family: 'classical',
    defaultFootprint: 'winged',
    defaultRoof: 'gabled',
    massing: 'axial-symmetric',
    structuralSystem: 'masonry-bearing-wall-with-pilasters',
    facade: { symmetry: true, porch: true, columns: true, arches: false, windowRhythm: 'regular' },
    site: { formal_garden: true, central_path: true },
    motifs: ['central-axis', 'paired-wings', 'columned-porch', 'framed-windows', 'dormers']
  }),
  profile('现代', /现代|简约|极简|玻璃幕墙|大玻璃|平屋顶|平顶|盒子|悬挑/, {
    family: 'modern',
    defaultFootprint: 'l-shape',
    defaultRoof: 'flat',
    massing: 'asymmetric-interlocking-boxes',
    structuralSystem: 'concrete-frame-with-large-openings',
    facade: { symmetry: false, porch: false, large_glass: true, windowRhythm: 'free' },
    site: { formal_garden: false, central_path: false },
    motifs: ['offset-volume', 'large-glass', 'flat-roof', 'terrace']
  }),
  profile('江南', /江南|水乡|徽派|白墙黑瓦|中式|国风|四合院|合院|飞檐/, {
    family: 'chinese-courtyard',
    defaultFootprint: 'courtyard',
    defaultRoof: 'pagoda',
    massing: 'courtyard-axis',
    structuralSystem: 'timber-frame-with-masonry-infill',
    facade: { symmetry: true, porch: true, screen: true, windowRhythm: 'small-regular' },
    site: { formal_garden: false, water_feature: true, enclosed_courtyard: true },
    motifs: ['white-wall-dark-roof', 'courtyard-axis', 'deep-eaves', 'water-court']
  }),
  profile('日式', /日式|和风|侘寂|町屋|榻榻米|枯山水|障子|缘侧|鸟居/, {
    family: 'japanese',
    defaultFootprint: 'courtyard',
    defaultRoof: 'hipped',
    massing: 'low-courtyard-pavilion',
    structuralSystem: 'timber-post-and-beam',
    facade: { symmetry: false, porch: true, screen: true, windowRhythm: 'tatami-grid' },
    site: { formal_garden: false, dry_garden: true, enclosed_courtyard: true },
    motifs: ['low-eaves', 'wooden-screen', 'engawa', 'dry-garden']
  }),
  profile('地中海', /地中海|圣托里尼|蓝白|拱廊|拱门|露台|西班牙|意大利海岸/, {
    family: 'mediterranean',
    defaultFootprint: 'courtyard',
    defaultRoof: 'flat',
    massing: 'terraced-courtyard',
    structuralSystem: 'thick-masonry-walls',
    facade: { symmetry: false, porch: true, arches: true, windowRhythm: 'arched' },
    site: { formal_garden: false, water_feature: true, patio: true },
    motifs: ['whitewashed-wall', 'blue-accent', 'arched-arcade', 'roof-terrace']
  }),
  profile('北欧', /北欧|斯堪的纳维亚|木玻璃|大坡屋顶|雪地|山居/, {
    family: 'nordic',
    defaultFootprint: 'rectangle',
    defaultRoof: 'gabled',
    massing: 'simple-compact-bar',
    structuralSystem: 'timber-frame',
    facade: { symmetry: false, porch: true, large_glass: true, windowRhythm: 'calm' },
    site: { formal_garden: false },
    motifs: ['steep-roof', 'timber-cladding', 'large-view-window']
  }),
  profile('木屋', /木屋|木质|森林|原木|小木屋|林间|猎人小屋/, {
    family: 'rustic',
    defaultFootprint: 'rectangle',
    defaultRoof: 'gabled',
    massing: 'compact-lodge',
    structuralSystem: 'log-wall-and-timber-roof',
    facade: { symmetry: false, porch: true, windowRhythm: 'cozy' },
    site: { formal_garden: false },
    motifs: ['log-walls', 'warm-lanterns', 'deep-porch']
  }),
  profile('哥特', /哥特|教堂|尖拱|玫瑰窗|尖塔|城堡|堡垒|塔楼/, {
    family: 'gothic',
    defaultFootprint: 'winged',
    defaultRoof: 'gabled',
    massing: 'vertical-symmetric',
    structuralSystem: 'stone-buttress-and-vault',
    facade: { symmetry: true, porch: true, arches: true, pointed_arches: true, windowRhythm: 'vertical' },
    site: { formal_garden: true },
    motifs: ['pointed-arches', 'corner-towers', 'vertical-windows', 'buttresses']
  }),
  profile('维多利亚', /维多利亚|英式|都铎|阁楼|尖顶阁楼|彩色窗|老洋房/, {
    family: 'victorian',
    defaultFootprint: 'winged',
    defaultRoof: 'gabled',
    massing: 'picturesque-asymmetric',
    structuralSystem: 'masonry-and-timber-frame',
    facade: { symmetry: false, porch: true, bay_windows: true, windowRhythm: 'varied' },
    site: { formal_garden: true },
    motifs: ['bay-window', 'steep-gables', 'wraparound-porch', 'decorative-trim']
  }),
  profile('工业', /工业|loft|厂房|仓库|红砖|钢架|管线|车间/, {
    family: 'industrial',
    defaultFootprint: 'rectangle',
    defaultRoof: 'flat',
    massing: 'long-span-hall',
    structuralSystem: 'steel-frame-and-brick-infill',
    facade: { symmetry: false, large_glass: true, windowRhythm: 'warehouse-grid' },
    site: { formal_garden: false },
    motifs: ['brick-wall', 'steel-frame', 'large-industrial-windows']
  }),
  profile('热带', /热带|海岛|度假|竹屋|高脚|吊脚|茅草|棕榈/, {
    family: 'tropical',
    defaultFootprint: 'rectangle',
    defaultRoof: 'hipped',
    massing: 'raised-open-pavilion',
    structuralSystem: 'lightweight-timber-stilt-frame',
    facade: { symmetry: false, porch: true, large_glass: false, windowRhythm: 'open-air' },
    site: { formal_garden: false, water_feature: true },
    motifs: ['raised-floor', 'broad-eaves', 'veranda', 'thatch-roof']
  }),
  profile('沙漠', /沙漠|土坯|夯土|摩洛哥|中东|Adobe|adobe|绿洲/, {
    family: 'desert',
    defaultFootprint: 'courtyard',
    defaultRoof: 'flat',
    massing: 'thick-wall-courtyard',
    structuralSystem: 'adobe-masonry',
    facade: { symmetry: false, porch: true, arches: true, windowRhythm: 'small-shaded' },
    site: { formal_garden: false, patio: true },
    motifs: ['thick-walls', 'small-openings', 'shaded-courtyard', 'parapet-roof']
  }),
  profile('未来', /未来|科幻|赛博|太空|飞船|曲面|悬浮|全息/, {
    family: 'futuristic',
    defaultFootprint: 'l-shape',
    defaultRoof: 'flat',
    massing: 'cantilevered-modules',
    structuralSystem: 'mega-frame-with-cantilevers',
    facade: { symmetry: false, large_glass: true, windowRhythm: 'strip-window' },
    site: { formal_garden: false },
    motifs: ['cantilever', 'glowing-trim', 'panoramic-glass', 'pod-volume']
  }),
  profile('农舍', /农舍|乡村|牧场|田园|美式|谷仓|农场/, {
    family: 'farmhouse',
    defaultFootprint: 'rectangle',
    defaultRoof: 'gabled',
    massing: 'simple-house-with-porch',
    structuralSystem: 'wood-frame',
    facade: { symmetry: true, porch: true, windowRhythm: 'regular' },
    site: { formal_garden: false },
    motifs: ['front-porch', 'simple-gable', 'farm-path']
  })
];

const MATERIAL_HINTS = [
  { pattern: /白墙|白色混凝土|白混凝土|white concrete/i, targets: ['wall'], block: 'minecraft:white_concrete' },
  { pattern: /石英地板|quartz floor/i, targets: ['floor'], block: 'minecraft:quartz_block' },
  { pattern: /石英墙|石英外墙|quartz wall/i, targets: ['wall'], block: 'minecraft:quartz_block' },
  { pattern: /石英|quartz/i, targets: ['wall', 'floor'], block: 'minecraft:quartz_block' },
  { pattern: /沙岩|砂岩|sandstone/i, targets: ['wall', 'foundation'], block: 'minecraft:smooth_sandstone' },
  { pattern: /石砖|stone brick/i, targets: ['foundation', 'wall'], block: 'minecraft:stone_bricks' },
  { pattern: /红砖|砖墙|brick/i, targets: ['wall'], block: 'minecraft:bricks' },
  { pattern: /黑石|blackstone/i, targets: ['roof', 'trim'], block: 'minecraft:blackstone' },
  { pattern: /深板岩|deepslate/i, targets: ['wall', 'roof'], block: 'minecraft:deepslate_tiles' },
  { pattern: /木地板|木质地板|木板地板/i, targets: ['floor'], block: 'minecraft:spruce_planks' },
  { pattern: /橡木地板|oak floor/i, targets: ['floor'], block: 'minecraft:oak_planks' },
  { pattern: /竹|bamboo/i, targets: ['wall', 'floor'], block: 'minecraft:bamboo_planks' },
  { pattern: /樱花|cherry/i, targets: ['wall', 'floor'], block: 'minecraft:cherry_planks' },
  { pattern: /土坯|夯土|泥砖|mud brick|adobe/i, targets: ['wall'], block: 'minecraft:mud_bricks' },
  { pattern: /陶瓦|陶土|terracotta/i, targets: ['wall', 'roof'], block: 'minecraft:terracotta' },
  { pattern: /黑瓦|黛瓦|黑色屋顶|black tile/i, targets: ['roof'], block: 'minecraft:deepslate_tiles' },
  { pattern: /蓝瓦|蓝顶|蓝色屋顶|blue roof/i, targets: ['roof'], block: 'minecraft:blue_terracotta' },
  { pattern: /茅草|草屋顶|thatch/i, targets: ['roof'], block: 'minecraft:hay_block' },
  { pattern: /铜屋顶|铜瓦|copper/i, targets: ['roof', 'trim'], block: 'minecraft:oxidized_copper' },
  { pattern: /玻璃|glass/i, targets: ['glass'], block: 'minecraft:glass' },
  { pattern: /彩色玻璃|stained glass/i, targets: ['glass'], block: 'minecraft:light_blue_stained_glass' },
  { pattern: /铁门|iron door/i, targets: ['door'], block: 'minecraft:iron_door' },
  { pattern: /木门|wood door/i, targets: ['door'], block: 'minecraft:dark_oak_door' },
  { pattern: /竹门|bamboo door/i, targets: ['door'], block: 'minecraft:bamboo_door' },
  { pattern: /樱花门|cherry door/i, targets: ['door'], block: 'minecraft:cherry_door' },
  ...STYLE_GRAMMAR_MATERIAL_HINTS
];

export class ConstructionArchitectAgent {
  constructor({ llmClient, mode = 'auto' } = {}) {
    this.llmClient = llmClient;
    this.mode = ['auto', 'mock', 'llm'].includes(mode) ? mode : 'auto';
  }

  async run(prompt) {
    const fallback = normalizeArchitecture(buildFallbackArchitecture(prompt), 'fallback');
    if (this.mode === 'mock') return fallback;

    if (this.mode === 'llm' || (this.mode === 'auto' && this.llmClient?.isConfigured())) {
      try {
        const parsed = await this.llmClient.chatJson({
          system: [
            '你是一个世界级 Minecraft 建筑架构师 Agent。',
            '目标是把任意住宅需求转成高层建筑语义 JSON，作为后续确定性几何引擎的稳定输入。',
            '绝对不要输出具体 XYZ 坐标、绝对坐标、方块命令或逐块蓝图。',
            '必须输出严格 JSON。',
            '必需字段: style, typology, philosophy, footprint, materials, volumes, envelope_rules, facade_rules, roof_rules, site_rules, massing_rules, structural_rules, detail_rules, generation_hints。',
            'materials 的值必须是 minecraft:block_id 或带方块状态的 minecraft:block_id[state=value]。',
            'volumes 是相对体块数组；每项包含 id, role, shape, scale, placement, boolean_mode，可选 tags/purpose/facade_role/roof_policy。',
            'shape 只能是 box 或 cylinder；boolean_mode 只能是 union 或 subtract。',
            'scale 是相对主体比例数组 [x,y,z]；placement 只能描述语义关系，例如 center, attached-west, attached-east-rear, front-center, attached-north-east。',
            '规则字段必须描述结构系统、体块组织、立面节奏、屋顶策略、场地元素和后续引擎提示。'
          ].join('\n'),
          user: JSON.stringify({ prompt, fallback_schema_example: fallback })
        });
        return normalizeArchitecture(parsed, 'llm', fallback);
      } catch (error) {
        if (this.mode === 'llm') throw error;
        return { ...fallback, source: 'fallback-after-llm-error', llm_error: error.message };
      }
    }

    return fallback;
  }
}

export function buildFallbackArchitecture(prompt) {
  const grammar = new StyleGrammarAgent().analyze(prompt);
  const profileMatch = grammar.profile || detectStyleProfile(prompt);
  const style = profileMatch.style;
  const scale = detectScale(prompt);
  const typology = detectTypology(prompt, style, scale, profileMatch, grammar);
  const footprint = detectFootprint(prompt, style, scale, profileMatch, grammar);
  const materials = materialOverrides(prompt, MATERIAL_PRESETS[style] || MATERIAL_PRESETS.欧式);
  const intents = collectArchitecturalIntents(prompt, profileMatch, scale, typology, grammar);
  const roofStyle = detectRoofStyle(prompt, profileMatch);
  const facadeRules = buildFacadeRules(prompt, profileMatch, scale, intents);
  const roofRules = buildRoofRules(prompt, profileMatch, scale, roofStyle, intents);
  const siteRules = buildSiteRules(prompt, profileMatch, scale, intents);
  const volumes = buildVolumes({ prompt, footprint, profile: profileMatch, scale, intents });

  return {
    style,
    style_family: profileMatch.family,
    typology,
    philosophy: '先造壳，后填瓤；ArchitectAgent 只输出建筑语义、体块比例和设计规则，本地 JS CSG/BSP/A* 引擎负责坐标。',
    footprint,
    materials,
    volumes,
    envelope_rules: {
      hollow_shell: true,
      shell_thickness: intents.thick_walls ? 2 : 1,
      preserve_main_axis: Boolean(profileMatch.facade.symmetry),
      daylight_priority: facadeRules.large_glass ? 'high' : 'balanced',
      expansion_strategy: footprint
    },
    facade_rules: facadeRules,
    roof_rules: roofRules,
    site_rules: siteRules,
    massing_rules: buildMassingRules(prompt, profileMatch, footprint, scale, intents),
    structural_rules: buildStructuralRules(prompt, profileMatch, materials, intents),
    detail_rules: buildDetailRules(prompt, profileMatch, intents),
    generation_hints: {
      preferred_modules: preferredModules({ profile: profileMatch, footprint, intents }),
      planner_priorities: plannerPriorities({ profile: profileMatch, typology, intents }),
      geometry_engine_contract: [
        'volumes are semantic relative masses, not coordinates',
        'CSG resolves massing before BSP room fitting',
        'A* opens doors/stairs after rooms are partitioned'
      ],
      future_engine_features: futureEngineFeatures(profileMatch, intents)
    }
  };
}

export function normalizeArchitecture(value, source, fallback = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    source,
    style: String(raw.style || fallback.style || '欧式'),
    style_family: String(raw.style_family || raw.styleFamily || fallback.style_family || 'general'),
    typology: String(raw.typology || fallback.typology || 'house'),
    philosophy: String(raw.philosophy || fallback.philosophy || '先造壳，后填瓤。'),
    footprint: normalizeFootprint(raw.footprint || fallback.footprint || 'rectangle'),
    materials: { ...(fallback.materials || {}), ...normalizeObject(raw.materials) },
    volumes: normalizeVolumes(raw.volumes, fallback.volumes),
    envelope_rules: { ...(fallback.envelope_rules || {}), ...normalizeObject(raw.envelope_rules || raw.envelopeRules) },
    facade_rules: { ...(fallback.facade_rules || {}), ...normalizeObject(raw.facade_rules || raw.facadeRules) },
    roof_rules: { ...(fallback.roof_rules || {}), ...normalizeObject(raw.roof_rules || raw.roofRules) },
    site_rules: { ...(fallback.site_rules || {}), ...normalizeObject(raw.site_rules || raw.siteRules) },
    massing_rules: { ...(fallback.massing_rules || {}), ...normalizeObject(raw.massing_rules || raw.massingRules) },
    structural_rules: { ...(fallback.structural_rules || {}), ...normalizeObject(raw.structural_rules || raw.structuralRules) },
    detail_rules: { ...(fallback.detail_rules || {}), ...normalizeObject(raw.detail_rules || raw.detailRules) },
    generation_hints: normalizeGenerationHints(raw.generation_hints || raw.generationHints, fallback.generation_hints)
  };
}

function buildVolumes({ prompt, footprint, profile, scale, intents }) {
  const volumes = [
    volume('main', '主体外壳', 'box', [1, 1, 1], { relation: 'center' }, 'union', {
      tags: ['primary-mass', profile.family],
      purpose: 'main-building-envelope',
      roof_policy: profile.defaultRoof
    })
  ];

  if (footprint === 'winged') {
    volumes.push(
      volume('west-wing', '西侧翼楼', 'box', [0.32, 0.95, 0.62], { relation: 'attached-west', attach_to: 'main' }, 'union', { tags: ['secondary-mass', 'wing'] }),
      volume('east-wing', '东侧翼楼', 'box', [0.32, 0.95, 0.62], { relation: 'attached-east', attach_to: 'main' }, 'union', { tags: ['secondary-mass', 'wing'] })
    );
  } else if (footprint === 'l-shape') {
    const role = intents.sunroom || profile.style === '现代' ? '玻璃侧翼' : '功能侧翼';
    volumes.push(volume('glass-wing', role, 'box', [0.36, 0.62, 0.58], { relation: 'attached-east-rear', attach_to: 'main' }, 'union', { tags: ['offset-mass', 'wing'], facade_role: 'feature-glazing' }));
  } else if (footprint === 'courtyard') {
    volumes.push(
      volume('front-gate', '前院门楼', 'box', [0.38, 0.45, 0.16], { relation: 'front-center', attach_to: 'main' }, 'union', { tags: ['threshold', 'courtyard-edge'] })
    );
    if (scale !== 'small' || intents.gallery) {
      volumes.push(
        volume('east-gallery', '东侧廊', 'box', [0.24, 0.72, 0.52], { relation: 'attached-east', attach_to: 'main' }, 'union', { tags: ['gallery', 'courtyard-edge'] }),
        volume('west-gallery', '西侧廊', 'box', [0.24, 0.72, 0.52], { relation: 'attached-west', attach_to: 'main' }, 'union', { tags: ['gallery', 'courtyard-edge'] })
      );
    }
  } else if (footprint === 'compact-tower') {
    volumes.push(volume('vertical-core', '竖向核心塔楼', 'cylinder', [0.34, 1.35, 0.34], { relation: 'attached-north-east', attach_to: 'main' }, 'union', { tags: ['tower', 'vertical-accent'] }));
  }

  if (profile.facade.porch || /门廊|玄关|雨棚|前廊|porch|veranda/i.test(prompt)) {
    volumes.push(volume('entry-porch', profile.style === '地中海' ? '拱廊门廊' : '中央门廊', 'box', [0.34, 0.42, 0.18], { relation: 'front-center', attach_to: 'main' }, 'union', { tags: ['entrance', 'porch'], facade_role: 'entry-focus' }));
  }

  if (intents.tower || profile.style === '哥特') {
    volumes.push(volume('corner-tower', '角塔', 'cylinder', [0.24, profile.style === '哥特' ? 1.45 : 1.25, 0.24], { relation: 'attached-north-east', attach_to: 'main' }, 'union', { tags: ['tower', 'vertical-accent'] }));
  }

  if (intents.treehouse) {
    volumes.push(
      volume('trunk-core', '树干支撑核心', 'cylinder', [0.2, 1.45, 0.2], { relation: 'attached-north-east', attach_to: 'main' }, 'union', {
        tags: ['tower', 'treehouse', 'support-trunk', 'vertical-accent'],
        purpose: 'tree-trunk-structural-core'
      }),
      volume('wraparound-deck', '环绕观景露台', 'box', [0.5, 0.28, 0.22], { relation: 'attached-south', attach_to: 'main' }, 'union', {
        tags: ['gallery', 'deck', 'veranda', 'treehouse'],
        facade_role: 'wraparound-deck',
        roof_policy: 'flat'
      })
    );
  }

  if (intents.coastal_deck) {
    volumes.push(volume('ocean-deck', '海景观景平台', 'box', [0.58, 0.26, 0.3], { relation: 'attached-south', attach_to: 'main' }, 'union', {
      tags: ['gallery', 'deck', 'veranda', 'view-platform', 'coastal'],
      facade_role: 'view-platform',
      roof_policy: 'flat'
    }));
  }

  if (intents.cliff_deck) {
    volumes.push(volume('cantilever-deck', '悬崖悬挑观景平台', 'box', [0.56, 0.28, 0.34], { relation: 'attached-south', attach_to: 'main' }, 'union', {
      tags: ['gallery', 'deck', 'cantilever', 'view-platform', 'cliffside'],
      facade_role: 'cantilevered-view-platform',
      roof_policy: 'flat'
    }));
  }

  if (intents.underground) {
    volumes.push(volume('lightwell-court', '地下采光井庭院', 'box', [0.36, 0.38, 0.28], { relation: 'attached-south', attach_to: 'main' }, 'union', {
      tags: ['courtyard', 'lightwell', 'earth-shelter', 'atrium'],
      purpose: 'bring-daylight-to-subterranean-core',
      facade_role: 'protected-lightwell',
      roof_policy: 'flat'
    }));
  }

  if (intents.neon) {
    volumes.push(volume('service-core', '霓虹服务核心', 'box', [0.24, 1.08, 0.22], { relation: 'attached-east', attach_to: 'main' }, 'union', {
      tags: ['tower', 'service-core', 'neon', 'vertical-accent'],
      facade_role: 'roof-sign-and-service-spine',
      roof_policy: 'flat'
    }));
  }

  if (intents.garage) {
    volumes.push(volume('garage-wing', '车库侧翼', 'box', [0.34, 0.45, 0.42], { relation: 'attached-west', attach_to: 'main' }, 'union', { tags: ['service', 'garage'] }));
  }

  if (intents.greenhouse || intents.sunroom) {
    volumes.push(volume('sunroom', '阳光房', 'box', [0.32, 0.48, 0.36], { relation: 'attached-east-rear', attach_to: 'main' }, 'union', { tags: ['glass', 'sunroom'], facade_role: 'transparent-volume' }));
  }

  return dedupeVolumes(volumes);
}

function buildFacadeRules(prompt, profile, scale, intents) {
  const viewGlassFamilies = ['coastal', 'cliffside', 'greenhouse-house', 'cyberpunk', 'alpine'];
  const explicitLargeGlass = /大玻璃|落地窗|玻璃幕墙|全景窗/i.test(prompt);
  const daylightGlass = /采光(?!井)/i.test(prompt);
  const largeGlass = explicitLargeGlass || (!intents.underground && (
    profile.facade.large_glass ||
    viewGlassFamilies.includes(profile.family) ||
    intents.coastal_deck ||
    intents.cliff_deck ||
    intents.greenhouse ||
    daylightGlass
  ));
  return {
    front_side: detectDoorSide(prompt),
    symmetry: Boolean(profile.facade.symmetry) && !/不对称|自由|错落/.test(prompt),
    large_glass: largeGlass,
    glazing_ratio: intents.underground ? 'low' : largeGlass ? 'high' : profile.family === 'desert' ? 'low' : 'medium',
    porch: Boolean(profile.facade.porch || /门廊|玄关|前廊|雨棚|廊/i.test(prompt)),
    columns: Boolean(profile.facade.columns || /柱|立柱|柱廊/.test(prompt)),
    arches: Boolean(profile.facade.arches || /拱|拱门|拱廊|尖拱/.test(prompt)),
    pointed_arches: Boolean(profile.facade.pointed_arches || /尖拱|哥特/.test(prompt)),
    screen: Boolean(profile.facade.screen || intents.treehouse || /格栅|屏风|障子|木格/.test(prompt)),
    bay_windows: Boolean(profile.facade.bay_windows || /凸窗|飘窗/.test(prompt)),
    balcony: /阳台|露台|挑台/.test(prompt) || intents.cliff_deck || intents.coastal_deck || intents.treehouse || (scale === 'large' && ['欧式', '维多利亚'].includes(profile.style)),
    window_rhythm: profile.facade.windowRhythm || 'balanced',
    facade_motifs: [...profile.motifs, ...intents.extra_motifs]
  };
}

function buildRoofRules(prompt, profile, scale, roofStyle, intents) {
  return {
    style: roofStyle,
    profile: roofProfile(prompt, profile, roofStyle),
    overhang: roofStyle === 'flat' ? 0 : profile.family === 'japanese' || profile.family === 'tropical' ? 2 : 1,
    dormers: /老虎窗|阁楼窗/.test(prompt) || ['欧式', '维多利亚'].includes(profile.style)
      ? scale === 'large' ? 2 : 1
      : 0,
    skylights: /天窗|采光顶/.test(prompt) || intents.greenhouse || intents.underground || profile.family === 'greenhouse-house',
    roof_terrace: /露台|屋顶花园|屋顶平台/.test(prompt) || profile.family === 'mediterranean' || intents.roof_garden || intents.cliff_deck || intents.coastal_deck,
    vertical_accent: intents.tower || intents.treehouse || intents.neon || profile.family === 'gothic',
    eave_treatment: profile.family === 'chinese-courtyard' || profile.family === 'japanese'
      ? 'deep-layered-eaves'
      : intents.treehouse ? 'leaf-canopy-overhang' : intents.snow_lodge ? 'snow-shedding-eaves' : 'style-default'
  };
}

function buildSiteRules(prompt, profile, scale, intents) {
  const looseLargeGarden = scale === 'large' && !['coastal', 'alpine', 'subterranean', 'cliffside', 'treehouse', 'greenhouse-house', 'cyberpunk'].includes(profile.family);
  return {
    formal_garden: Boolean(profile.site.formal_garden || /花园|庄园|庭园|对称花坛/.test(prompt) || looseLargeGarden),
    water_feature: Boolean(profile.site.water_feature || intents.coastal_deck || /喷泉|水池|池塘|水景|泳池|溪流/.test(prompt)),
    dry_garden: Boolean(profile.site.dry_garden || /枯山水|砂庭|石庭/.test(prompt)),
    patio: Boolean(profile.site.patio || intents.cliff_deck || intents.coastal_deck || intents.underground || /庭院|内院|露台|patio/i.test(prompt)),
    enclosed_courtyard: Boolean(profile.site.enclosed_courtyard || intents.underground || /四合院|合院|小院|内院/.test(prompt)),
    central_path: Boolean(profile.site.central_path || profile.site.formal_garden),
    veranda: Boolean(intents.veranda || /廊|回廊|缘侧|veranda/i.test(prompt)),
    landscape_mood: landscapeMood(profile, prompt)
  };
}

function buildMassingRules(prompt, profile, footprint, scale, intents) {
  return {
    organization: profile.massing,
    footprint,
    hierarchy: scale === 'large' ? 'primary-secondary-tertiary' : 'primary-with-accents',
    primary_axis: profile.facade.symmetry ? detectDoorSide(prompt) : 'free',
    composition: {
      wings: footprint === 'winged',
      courtyard: footprint === 'courtyard',
      offset: footprint === 'l-shape',
      vertical_core: footprint === 'compact-tower' || intents.tower,
      porch_or_threshold: profile.facade.porch || intents.veranda,
      view_deck: intents.cliff_deck || intents.coastal_deck,
      raised_treehouse: intents.treehouse,
      earth_shelter: intents.underground,
      greenhouse_wing: intents.greenhouse || profile.family === 'greenhouse-house',
      neon_service_spine: intents.neon
    },
    proportion: {
      horizontal_emphasis: ['现代', '北欧', '热带', '海滨', '悬崖', '温室住宅'].includes(profile.style),
      vertical_emphasis: ['哥特', '维多利亚', '树屋', '赛博朋克'].includes(profile.style) || intents.tower,
      low_spreading: ['日式', '江南', '沙漠', '地下'].includes(profile.style)
    }
  };
}

function buildStructuralRules(prompt, profile, materials, intents) {
  const openSpan = /大空间|开敞|通高|大厅/.test(prompt) || intents.greenhouse || intents.coastal_deck || intents.cliff_deck;
  return {
    system: profile.structuralSystem,
    foundation: materials.foundation,
    primary_supports: structuralSupports(profile, prompt, intents),
    span_strategy: openSpan ? 'long-span-public-core' : 'room-scale-spans',
    wall_strategy: intents.underground ? 'retaining-earth-shelter-walls' : intents.thick_walls ? 'thick-thermal-masonry' : 'standard-shell-wall',
    frame_expression: ['现代', '工业', '未来', '赛博朋克', '温室住宅', '悬崖'].includes(profile.style) ? 'expressed-frame-or-grid' : 'implicit-in-walls',
    buildability_notes: [
      'semantic structural rules are advisory for downstream geometry agents',
      'current CSG engine consumes compatible shell/material fields first'
    ]
  };
}

function buildDetailRules(prompt, profile, intents) {
  return {
    motifs: [...new Set([...profile.motifs, ...intents.extra_motifs])],
    ornament_density: /极简|现代|北欧|侘寂/.test(prompt) ? 'low' : ['欧式', '哥特', '维多利亚'].includes(profile.style) ? 'high' : 'medium',
    color_strategy: colorStrategy(profile, prompt),
    signature_elements: signatureElements(profile, intents),
    style_grammar: intents.style_grammar
  };
}

function collectArchitecturalIntents(prompt, profile, scale, typology, grammar = new StyleGrammarAgent().analyze(prompt)) {
  const extraMotifs = [];
  if (/阳台|露台|挑台/.test(prompt)) extraMotifs.push('balcony');
  if (/车库|停车|garage/i.test(prompt)) extraMotifs.push('garage');
  if (/温室|阳光房|花房|greenhouse|sunroom/i.test(prompt)) extraMotifs.push('sunroom');
  if (/泳池|水池|喷泉/.test(prompt)) extraMotifs.push('water-feature');
  if (/中庭|采光井|天井|atrium/i.test(prompt)) extraMotifs.push('atrium');

  const features = grammar?.features || {};
  const grammarMotifs = normalizeStringArray(grammar?.extra_motifs);
  const treehouse = Boolean(features.treehouse || profile.family === 'treehouse');
  const cliffDeck = Boolean(features.cliff_deck || profile.family === 'cliffside');
  const underground = Boolean(features.underground || profile.family === 'subterranean');
  const coastalDeck = Boolean(features.coastal_deck || profile.family === 'coastal');
  const neon = Boolean(features.neon || profile.family === 'cyberpunk');
  const greenhouse = Boolean(features.greenhouse || profile.family === 'greenhouse-house' || /温室|花房|greenhouse/i.test(prompt));
  const roofGarden = Boolean(features.roof_garden || /屋顶花园|屋顶菜园|绿化屋顶|green roof/i.test(prompt));
  const snowLodge = Boolean(features.snow_lodge || profile.family === 'alpine');

  return {
    style_grammar: {
      source: grammar?.source || 'local-style-grammar',
      profile: grammar?.profile?.style || profile.style,
      family: grammar?.profile?.family || profile.family,
      features,
      material_hints: Array.isArray(grammar?.material_hints) ? grammar.material_hints : []
    },
    treehouse,
    cliff_deck: cliffDeck,
    underground,
    coastal_deck: coastalDeck,
    neon,
    roof_garden: roofGarden,
    snow_lodge: snowLodge,
    tower: /塔|尖塔|钟楼|城堡|tower|turret/i.test(prompt) || profile.family === 'gothic' || treehouse || neon,
    veranda: /廊|回廊|前廊|缘侧|veranda|porch/i.test(prompt) || treehouse || coastalDeck,
    gallery: /连廊|回廊|廊/.test(prompt) || profile.family === 'chinese-courtyard' || cliffDeck || coastalDeck || treehouse,
    garage: /车库|停车|garage/i.test(prompt),
    greenhouse,
    sunroom: /阳光房|sunroom/i.test(prompt) || greenhouse,
    thick_walls: /厚墙|夯土|土坯|隔热|沙漠|地堡|地下|半地下/.test(prompt) || ['desert', 'mediterranean', 'subterranean'].includes(profile.family) || underground,
    extra_motifs: [...new Set([...extraMotifs, ...grammarMotifs])],
    scale,
    typology
  };
}

function detectStyleProfile(prompt) {
  return STYLE_PROFILES.find((item) => item.pattern.test(prompt)) || (
    /大房子|豪华|别墅/.test(prompt) ? STYLE_PROFILES.find((item) => item.style === '欧式') : STYLE_PROFILES.find((item) => item.style === '现代')
  );
}

export function detectStyle(prompt) {
  return detectStyleProfile(prompt).style;
}

export function detectScale(prompt) {
  if (/小|小型|迷你|tiny|compact/i.test(prompt) && !/大窗|大门|大玻璃|大厅/.test(prompt)) return 'small';
  if (/大|大型|豪华|庄园|别墅|城堡|宫殿|多功能|会所|large/i.test(prompt)) return 'large';
  return 'medium';
}

export function detectFloors(prompt, scale) {
  const match = prompt.match(/([一二三四五两2-5])\s*层/);
  if (match) return Math.max(1, Math.min(3, parseChineseNumber(match[1])));
  if (/高层|塔楼|钟楼|城堡/.test(prompt)) return 3;
  return scale === 'large' ? 2 : 1;
}

export function detectDoorSide(prompt) {
  if (/门(?:在|放)?\s*东|东侧门|东门/.test(prompt)) return 'east';
  if (/门(?:在|放)?\s*西|西侧门|西门/.test(prompt)) return 'west';
  if (/门(?:在|放)?\s*北|北侧门|北门/.test(prompt)) return 'north';
  return 'south';
}

function detectTypology(prompt, style, scale, profile, grammar) {
  const family = profile?.family || grammar?.profile?.family || '';
  if (/树屋|树上|treehouse|tree house/i.test(prompt) || family === 'treehouse') return 'treehouse';
  if (/地下|地堡|半地下|掩体|洞穴住宅|地下基地|bunker|underground/i.test(prompt) || family === 'subterranean') return 'earth-shelter';
  if (/温室住宅|玻璃温室|花房住宅|greenhouse house/i.test(prompt) || family === 'greenhouse-house') return 'greenhouse-house';
  if (/悬崖|峭壁|山崖|cliffside|悬挑住宅/i.test(prompt) || family === 'cliffside') return 'cliffside-house';
  if (/别墅|villa/i.test(prompt)) return 'villa';
  if (/庄园|manor/i.test(prompt)) return 'manor';
  if (/城堡|堡垒|castle/i.test(prompt)) return 'castle';
  if (family === 'alpine') return 'lodge';
  if (/小屋|木屋|cabin|lodge/i.test(prompt)) return 'cabin';
  if (/庭院|合院|四合院|courtyard/i.test(prompt)) return 'courtyard-house';
  if (/公寓|loft|复式/i.test(prompt)) return 'loft-house';
  if (/农舍|farm/i.test(prompt)) return 'farmhouse';
  if (family === 'coastal') return 'beach-house';
  if (style === '现代' && scale === 'large') return 'villa';
  return 'house';
}

function detectFootprint(prompt, style, scale, profileMatch = detectStyleProfile(prompt), grammar) {
  const family = profileMatch?.family || grammar?.profile?.family || '';
  if (/树屋|树上|treehouse|tree house/i.test(prompt) || family === 'treehouse') return 'compact-tower';
  if (/地下|地堡|半地下|采光井|lightwell|underground/i.test(prompt) || family === 'subterranean') return 'courtyard';
  if (/L型|L 形|l-shape|侧翼|大玻璃/i.test(prompt)) return 'l-shape';
  if (/U型|U 形|回字|庭院|院落|四合院|合院|小院|内院|中庭|天井/.test(prompt)) return 'courtyard';
  if (/塔楼|高塔|钟楼/.test(prompt)) return 'compact-tower';
  if (/双翼|侧翼|对称翼|庄园|宫殿/.test(prompt)) return 'winged';
  if (style === '现代' || style === '未来') return 'l-shape';
  if (profileMatch.defaultFootprint) return profileMatch.defaultFootprint;
  if (style === '欧式' || scale === 'large') return 'winged';
  return 'rectangle';
}

function detectRoofStyle(prompt, profileMatch) {
  if (/平屋顶|平顶|露台顶|屋顶平台/.test(prompt)) return 'flat';
  if (/飞檐|翘角|重檐|庑殿|歇山|中式|江南|黑瓦|黛瓦/.test(prompt)) return 'pagoda';
  if (/四坡|庑殿|歇山|hipped/i.test(prompt)) return 'hipped';
  if (/穹顶|圆顶|dome/i.test(prompt)) return 'domed';
  return profileMatch.defaultRoof || 'gabled';
}

function roofProfile(prompt, profile, roofStyle) {
  if (/尖顶|尖塔|陡坡|steep/i.test(prompt) || profile.family === 'gothic') return 'steep';
  if (profile.family === 'alpine') return 'steep-snow-shedding';
  if (profile.family === 'subterranean') return 'bermed-flat-roof';
  if (profile.family === 'treehouse') return 'canopy-overhang';
  if (profile.family === 'coastal') return 'breezy-hipped-or-terrace';
  if (profile.family === 'cliffside') return 'flat-cantilever-terrace';
  if (profile.family === 'greenhouse-house') return 'glass-skylight-roof';
  if (/低坡|缓坡/.test(prompt) || profile.family === 'japanese') return 'low-and-wide';
  if (roofStyle === 'flat') return 'parapet-or-terrace';
  if (roofStyle === 'pagoda') return 'layered-eaves';
  return 'standard';
}

function preferredModules({ profile, footprint, intents }) {
  const modules = new Set(['foundation', 'walls', 'floors', 'roof', 'windows', 'door']);
  if (footprint === 'winged' || footprint === 'l-shape') modules.add('wing');
  if (footprint === 'courtyard') modules.add('courtyard');
  if (profile.facade.porch || intents.veranda) modules.add('porch');
  if (profile.facade.columns) modules.add('columns');
  if (profile.facade.arches) modules.add('arches');
  if (profile.facade.screen) modules.add('screens');
  if (intents.tower) modules.add('tower');
  if (intents.greenhouse || intents.sunroom) modules.add('sunroom');
  if (intents.garage) modules.add('garage');
  if (intents.gallery || intents.cliff_deck || intents.coastal_deck || intents.treehouse) modules.add('gallery');
  if (intents.treehouse) modules.add('treehouse_supports');
  if (intents.underground) modules.add('lightwell');
  if (intents.roof_garden) modules.add('roof_garden');
  if (intents.neon) modules.add('facade_lighting');
  if (profile.site.formal_garden || profile.site.water_feature || profile.site.dry_garden) modules.add('garden');
  if (profile.site.water_feature || intents.extra_motifs.includes('water-feature')) modules.add('water_feature');
  return [...modules];
}

function plannerPriorities({ profile, typology, intents }) {
  const priorities = ['entry-to-public-core', 'rooms-follow-architectural-style'];
  if (typology === 'castle') priorities.push('separate-public-hall-and-tower-core');
  if (profile.defaultFootprint === 'courtyard') priorities.push('rooms-face-courtyard');
  if (profile.facade.large_glass) priorities.push('place-living-room-on-glass-front');
  if (intents.garage) priorities.push('reserve-service-wing-for-garage');
  if (intents.cliff_deck || intents.coastal_deck) priorities.push('orient-public-rooms-to-view-deck');
  if (intents.treehouse) priorities.push('keep-private-rooms-around-vertical-tree-core');
  if (intents.underground) priorities.push('cluster-rooms-around-lightwell');
  if (intents.greenhouse) priorities.push('connect-living-core-to-greenhouse-wing');
  return priorities;
}

function futureEngineFeatures(profile, intents) {
  const features = [];
  if (profile.facade.arches || profile.facade.pointed_arches) features.push('arched-openings');
  if (profile.facade.screen) features.push('screen-facades');
  if (profile.site.dry_garden) features.push('dry-garden-generator');
  if (profile.defaultRoof === 'hipped' || profile.defaultRoof === 'pagoda') features.push('multi-roof-geometry');
  if (intents.tower) features.push('tower-roof-and-vertical-circulation');
  if (profile.family === 'futuristic') features.push('cantilever-supports');
  if (intents.cliff_deck || intents.coastal_deck) features.push('view-decks');
  if (intents.treehouse) features.push('treehouse-supports');
  if (intents.underground) features.push('earth-shelter-lightwells');
  if (intents.greenhouse) features.push('greenhouse-roofs');
  if (intents.neon) features.push('neon-trim');
  if (intents.roof_garden) features.push('roof-garden');
  return features;
}

function structuralSupports(profile, prompt, intents = {}) {
  if (intents.treehouse || profile.family === 'treehouse') return 'tree-trunk-and-stilts';
  if (intents.cliff_deck || profile.family === 'cliffside') return 'rock-anchored-cantilever-frame';
  if (intents.underground || profile.family === 'subterranean') return 'retaining-walls-and-earth-anchors';
  if (intents.greenhouse || profile.family === 'greenhouse-house') return 'light-frame-glass-ribs';
  if (/柱|柱廊|立柱/.test(prompt) || profile.facade.columns) return 'regular-columns-and-pilasters';
  if (profile.family === 'industrial') return 'steel-grid';
  if (profile.family === 'gothic') return 'buttresses-and-piers';
  if (profile.family === 'cyberpunk') return 'mega-frame-and-service-spine';
  if (profile.family === 'tropical') return 'stilts-and-light-posts';
  return 'load-bearing-walls';
}

function signatureElements(profile, intents) {
  const elements = [...profile.motifs];
  if (intents.tower) elements.push('tower');
  if (intents.veranda) elements.push('veranda');
  if (intents.greenhouse || intents.sunroom) elements.push('sunroom');
  if (intents.garage) elements.push('garage-wing');
  if (intents.cliff_deck) elements.push('cantilever-deck');
  if (intents.coastal_deck) elements.push('ocean-view-deck');
  if (intents.treehouse) elements.push('trunk-core');
  if (intents.underground) elements.push('lightwell');
  if (intents.neon) elements.push('neon-roof-sign');
  if (intents.roof_garden) elements.push('roof-garden');
  return [...new Set(elements)];
}

function colorStrategy(profile, prompt) {
  if (/蓝白|圣托里尼/.test(prompt)) return 'white-with-blue-accents';
  if (/黑白|白墙黑瓦|黛瓦/.test(prompt)) return 'white-wall-dark-roof';
  if (/红砖/.test(prompt)) return 'warm-red-brick';
  if (profile.family === 'coastal') return 'white-sand-with-aqua-accents';
  if (profile.family === 'alpine') return 'stone-timber-and-snow';
  if (profile.family === 'subterranean') return 'moss-stone-and-muted-light';
  if (profile.family === 'cliffside') return 'stone-concrete-and-glass';
  if (profile.family === 'treehouse') return 'jungle-wood-and-leaf-canopy';
  if (profile.family === 'greenhouse-house') return 'glass-copper-and-greenery';
  if (profile.family === 'cyberpunk') return 'dark-shell-with-cyan-magenta-light';
  if (profile.family === 'futuristic') return 'white-gray-with-cyan-glow';
  if (profile.family === 'tropical') return 'warm-wood-and-sand';
  return 'material-native';
}

function landscapeMood(profile, prompt) {
  if (/枯山水|石庭/.test(prompt)) return 'dry-zen';
  if (/泳池|海岛|度假/.test(prompt)) return 'resort';
  if (profile.family === 'coastal') return 'coastal-resort';
  if (profile.family === 'alpine') return 'snow-lodge';
  if (profile.family === 'subterranean') return 'sunken-courtyard';
  if (profile.family === 'cliffside') return 'rocky-overlook';
  if (profile.family === 'treehouse') return 'forest-canopy';
  if (profile.family === 'greenhouse-house') return 'lush-greenhouse';
  if (profile.family === 'cyberpunk') return 'urban-neon';
  if (/庄园|对称花坛/.test(prompt) || profile.site.formal_garden) return 'formal';
  if (/水池|池塘|江南|水乡/.test(prompt)) return 'water-courtyard';
  return 'simple';
}

function normalizeVolumes(value, fallback = []) {
  const source = Array.isArray(value) && value.length ? value : Array.isArray(fallback) ? fallback : [];
  const volumes = source.map((item, index) => {
    const raw = item && typeof item === 'object' ? item : {};
    const shape = String(raw.shape || 'box').toLowerCase();
    const booleanMode = String(raw.boolean_mode || raw.booleanMode || 'union').toLowerCase();
    return volume(
      normalizeId(raw.id || raw.role || `volume-${index}`),
      String(raw.role || raw.name || raw.id || `体块 ${index + 1}`),
      SHAPES.has(shape) ? shape : 'box',
      normalizeScale(raw.scale),
      normalizePlacement(raw.placement, index),
      BOOLEAN_MODES.has(booleanMode) ? booleanMode : 'union',
      normalizeVolumeExtras(raw)
    );
  });
  return volumes.length ? volumes : [volume('main', '主体外壳', 'box', [1, 1, 1], { relation: 'center' }, 'union')];
}

function normalizeVolumeExtras(raw) {
  return {
    tags: normalizeStringArray(raw.tags),
    purpose: raw.purpose ? String(raw.purpose) : undefined,
    facade_role: raw.facade_role || raw.facadeRole ? String(raw.facade_role || raw.facadeRole) : undefined,
    roof_policy: raw.roof_policy || raw.roofPolicy ? String(raw.roof_policy || raw.roofPolicy) : undefined
  };
}

function normalizeGenerationHints(value, fallback = {}) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  return {
    ...base,
    ...raw,
    preferred_modules: normalizeStringArray(raw.preferred_modules || raw.preferredModules, base.preferred_modules || base.preferredModules),
    planner_priorities: normalizeStringArray(raw.planner_priorities || raw.plannerPriorities, base.planner_priorities || base.plannerPriorities),
    geometry_engine_contract: normalizeStringArray(raw.geometry_engine_contract || raw.geometryEngineContract, base.geometry_engine_contract || base.geometryEngineContract),
    future_engine_features: normalizeStringArray(raw.future_engine_features || raw.futureEngineFeatures, base.future_engine_features || base.futureEngineFeatures)
  };
}

function volume(id, role, shape, scale, placement, booleanMode, extra = {}) {
  return dropUndefined({
    id,
    role,
    shape,
    scale,
    placement,
    boolean_mode: booleanMode,
    tags: extra.tags?.length ? extra.tags : undefined,
    purpose: extra.purpose,
    facade_role: extra.facade_role,
    roof_policy: extra.roof_policy
  });
}

function profile(style, pattern, config) {
  return { style, pattern, ...config };
}

function materialOverrides(prompt, base) {
  const materials = { ...base };
  const explicitTargets = new Set();
  for (const hint of MATERIAL_HINTS) {
    if (!hint.pattern.test(prompt)) continue;
    for (const target of hint.targets) {
      if (hint.targets.length > 1 && explicitTargets.has(target)) continue;
      materials[target] = hint.block;
      if (hint.targets.length === 1) explicitTargets.add(target);
    }
  }
  materials.door = toDoorBlock(materials.door);
  return materials;
}

function toDoorBlock(block) {
  const base = String(block || '').split('[')[0];
  if (base.endsWith('_door')) return base;
  if (['minecraft:white_concrete', 'minecraft:quartz_block', 'minecraft:smooth_stone', 'minecraft:iron_bars'].includes(base)) return 'minecraft:iron_door';
  if (base.includes('bamboo')) return 'minecraft:bamboo_door';
  if (base.includes('cherry')) return 'minecraft:cherry_door';
  if (base.includes('jungle')) return 'minecraft:jungle_door';
  if (base.includes('acacia') || base.includes('terracotta') || base.includes('mud')) return 'minecraft:acacia_door';
  if (base.includes('spruce')) return 'minecraft:spruce_door';
  if (base.includes('oak')) return 'minecraft:dark_oak_door';
  return 'minecraft:dark_oak_door';
}

function dedupeVolumes(volumes) {
  const seen = new Set();
  return volumes.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function normalizeScale(value) {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? [value.x ?? value.width, value.y ?? value.height, value.z ?? value.depth]
      : [1, 1, 1];
  return [
    clampNumber(raw[0], 0.1, 1.4, 1),
    clampNumber(raw[1], 0.2, 1.6, 1),
    clampNumber(raw[2], 0.1, 1.4, 1)
  ];
}

function normalizePlacement(value, index) {
  const placement = normalizeObject(value);
  if (!placement.relation) placement.relation = index === 0 ? 'center' : 'attached-east';
  return placement;
}

function normalizeFootprint(value) {
  const footprint = String(value || 'rectangle').toLowerCase();
  return FOOTPRINTS.has(footprint) ? footprint : 'rectangle';
}

function parseChineseNumber(value) {
  return new Map([
    ['一', 1],
    ['二', 2],
    ['两', 2],
    ['三', 3],
    ['四', 4],
    ['五', 5]
  ]).get(value) || Number(value) || 2;
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function normalizeStringArray(value, fallback = []) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value) return [String(value)];
  return Array.isArray(fallback) ? fallback.map(String).filter(Boolean) : [];
}

function normalizeId(value) {
  return String(value || 'node')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-\u4e00-\u9fff]+/g, '-') || 'node';
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function dropUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
