export const STYLE_GRAMMAR_PROFILES = [
  {
    style: '海滨',
    pattern: /海滨|海边|海景|滨海|沙滩|海岛别墅|beach|coastal|seaside/i,
    family: 'coastal',
    defaultFootprint: 'l-shape',
    defaultRoof: 'hipped',
    massing: 'open-view-house-with-deck',
    structuralSystem: 'weather-resistant-frame-on-raised-foundation',
    facade: { symmetry: false, porch: true, large_glass: true, windowRhythm: 'panoramic' },
    site: { formal_garden: false, water_feature: true, patio: true },
    motifs: ['ocean-view-glass', 'raised-deck', 'light-wall', 'breezy-veranda']
  },
  {
    style: '雪山',
    pattern: /雪山|雪地|滑雪|阿尔卑斯|山屋|山间木屋|alpine|ski/i,
    family: 'alpine',
    defaultFootprint: 'rectangle',
    defaultRoof: 'gabled',
    massing: 'compact-steep-roof-lodge',
    structuralSystem: 'heavy-timber-frame-with-steep-roof',
    facade: { symmetry: false, porch: true, large_glass: true, windowRhythm: 'view-window' },
    site: { formal_garden: false },
    motifs: ['steep-snow-shedding-roof', 'stone-base', 'timber-warmth', 'hearth-core']
  },
  {
    style: '地下',
    pattern: /地下|地堡|半地下|掩体|洞穴住宅|地下基地|bunker|underground|subterranean/i,
    family: 'subterranean',
    defaultFootprint: 'courtyard',
    defaultRoof: 'flat',
    massing: 'bermed-courtyard-with-lightwell',
    structuralSystem: 'reinforced-earth-shelter',
    facade: { symmetry: false, porch: false, arches: false, large_glass: false, windowRhythm: 'protected-small-openings' },
    site: { formal_garden: false, patio: true, enclosed_courtyard: true },
    motifs: ['bermed-roof', 'lightwell', 'protected-entry', 'utility-core']
  },
  {
    style: '悬崖',
    pattern: /悬崖|峭壁|山崖|cliff|cliffside|悬挑住宅|悬挑屋/i,
    family: 'cliffside',
    defaultFootprint: 'l-shape',
    defaultRoof: 'flat',
    massing: 'cantilevered-view-platforms',
    structuralSystem: 'cantilevered-frame-anchored-to-rock',
    facade: { symmetry: false, porch: true, large_glass: true, windowRhythm: 'view-facing' },
    site: { formal_garden: false, patio: true },
    motifs: ['cantilever-deck', 'panoramic-glass', 'rock-anchor', 'view-platform']
  },
  {
    style: '树屋',
    pattern: /树屋|树上|林冠|treehouse|tree house/i,
    family: 'treehouse',
    defaultFootprint: 'compact-tower',
    defaultRoof: 'hipped',
    massing: 'raised-house-around-trunk-core',
    structuralSystem: 'timber-stilt-frame-around-tree-trunk',
    facade: { symmetry: false, porch: true, screen: true, windowRhythm: 'small-openings' },
    site: { formal_garden: false },
    motifs: ['trunk-core', 'wraparound-deck', 'rope-bridge', 'leaf-canopy']
  },
  {
    style: '温室住宅',
    pattern: /温室住宅|玻璃温室|花房住宅|植物住宅|greenhouse house|greenhouse-home/i,
    family: 'greenhouse-house',
    defaultFootprint: 'l-shape',
    defaultRoof: 'flat',
    massing: 'transparent-greenhouse-wing',
    structuralSystem: 'light-frame-with-glass-enclosure',
    facade: { symmetry: false, porch: false, large_glass: true, windowRhythm: 'continuous-glazing' },
    site: { formal_garden: false, water_feature: true },
    motifs: ['transparent-wing', 'planting-core', 'skylight-roof', 'garden-transition']
  },
  {
    style: '赛博朋克',
    pattern: /赛博朋克|霓虹|cyberpunk|neon|夜城/i,
    family: 'cyberpunk',
    defaultFootprint: 'l-shape',
    defaultRoof: 'flat',
    massing: 'stacked-neon-boxes',
    structuralSystem: 'expressed-mega-frame-with-service-core',
    facade: { symmetry: false, large_glass: true, windowRhythm: 'strip-window' },
    site: { formal_garden: false },
    motifs: ['neon-trim', 'dark-shell', 'cyan-glass', 'service-pipes', 'roof-sign']
  },
  {
    style: '沙漠',
    pattern: /沙漠|砂岩|绿洲|摩洛哥|阿拉伯|desert|oasis|adobe/i,
    family: 'desert',
    defaultFootprint: 'courtyard',
    defaultRoof: 'flat',
    massing: 'thick-walled-courtyard-with-shaded-loggia',
    structuralSystem: 'thermal-mass-walls-with-shaded-courtyard',
    facade: { symmetry: false, porch: true, arches: true, large_glass: false, windowRhythm: 'small-shaded-openings' },
    site: { formal_garden: false, water_feature: true, patio: true, enclosed_courtyard: true },
    motifs: ['arcade-shade', 'oasis-water', 'terracotta-accents', 'cool-courtyard']
  },
  {
    style: '工业',
    pattern: /工业|loft|仓库|红砖|钢梁|industrial|warehouse/i,
    family: 'industrial',
    defaultFootprint: 'rectangle',
    defaultRoof: 'flat',
    massing: 'open-loft-with-service-spine',
    structuralSystem: 'expressed-steel-frame-with-long-span-bays',
    facade: { symmetry: false, large_glass: true, windowRhythm: 'warehouse-grid' },
    site: { formal_garden: false, patio: true },
    motifs: ['exposed-frame', 'warehouse-windows', 'mezzanine', 'service-spine']
  },
  {
    style: '维多利亚',
    pattern: /维多利亚|victorian|尖顶别墅|装饰木檐|bay window/i,
    family: 'victorian',
    defaultFootprint: 'l-shape',
    defaultRoof: 'gabled',
    massing: 'asymmetric-villa-with-bay-and-porch',
    structuralSystem: 'timber-frame-with-decorative-porch',
    facade: { symmetry: false, porch: true, bay_windows: true, windowRhythm: 'ornamental' },
    site: { formal_garden: true, patio: true },
    motifs: ['bay-window', 'decorative-gable', 'front-porch', 'garden-path']
  },
  {
    style: '古典庄园',
    pattern: /古典|法式|庄园|柱廊|classical|villa|manor/i,
    family: 'classical',
    defaultFootprint: 'rectangle',
    defaultRoof: 'hipped',
    massing: 'balanced-villa-with-formal-axis',
    structuralSystem: 'masonry-bearing-walls-with-columned-entry',
    facade: { symmetry: true, porch: true, arches: true, columns: true, windowRhythm: 'formal-bay' },
    site: { formal_garden: true, patio: true, water_feature: true },
    motifs: ['columned-entry', 'formal-garden-axis', 'stone-trim', 'balanced-windows']
  }
];

export const STYLE_GRAMMAR_MATERIAL_HINTS = [
  { pattern: /海晶灯|海灯|sea lantern/i, targets: ['lamp', 'path'], block: 'minecraft:sea_lantern' },
  { pattern: /海晶石|暗海晶|prismarine/i, targets: ['trim', 'foundation'], block: 'minecraft:dark_prismarine' },
  { pattern: /雪块|积雪|snow/i, targets: ['trim'], block: 'minecraft:snow_block' },
  { pattern: /冰|蓝冰|blue ice/i, targets: ['trim'], block: 'minecraft:blue_ice' },
  { pattern: /黑色混凝土|黑混凝土|black concrete/i, targets: ['wall'], block: 'minecraft:black_concrete' },
  { pattern: /青色玻璃|蓝绿色玻璃|cyan glass/i, targets: ['glass'], block: 'minecraft:cyan_stained_glass' },
  { pattern: /紫色玻璃|magenta glass|purple glass/i, targets: ['glass'], block: 'minecraft:purple_stained_glass' },
  { pattern: /铜梁|铜装饰|copper/i, targets: ['trim'], block: 'minecraft:oxidized_copper' },
  { pattern: /苔石|苔藓石|mossy/i, targets: ['foundation', 'path'], block: 'minecraft:mossy_cobblestone' },
  { pattern: /树叶|树冠|leaf|leaves/i, targets: ['trim'], block: 'minecraft:oak_leaves[persistent=true]' },
  { pattern: /红砖|brick/i, targets: ['wall', 'chimney'], block: 'minecraft:bricks' },
  { pattern: /砂岩|sandstone/i, targets: ['wall', 'foundation'], block: 'minecraft:smooth_sandstone' },
  { pattern: /太阳能|solar/i, targets: ['roof_detail'], block: 'minecraft:daylight_detector' },
  { pattern: /花箱|planter/i, targets: ['plant'], block: 'minecraft:potted_azalea_bush' },
  { pattern: /铁艺|栏杆|railing/i, targets: ['railing'], block: 'minecraft:iron_bars' }
];

const FEATURE_PATTERNS = [
  { key: 'cliff_deck', pattern: /悬崖|峭壁|山崖|观景台|观景平台|view deck|cliff/i, motif: 'view-deck' },
  { key: 'treehouse', pattern: /树屋|树上|林冠|treehouse|tree house/i, motif: 'treehouse' },
  { key: 'underground', pattern: /地下|地堡|半地下|掩体|洞穴住宅|地下基地|bunker|underground/i, motif: 'earth-shelter' },
  { key: 'greenhouse', pattern: /温室|花房|玻璃温室|植物房|greenhouse/i, motif: 'greenhouse' },
  { key: 'coastal_deck', pattern: /海滨|海边|海景|沙滩|海岛|beach|coastal|seaside/i, motif: 'coastal-deck' },
  { key: 'neon', pattern: /赛博朋克|霓虹|neon|cyberpunk/i, motif: 'neon-trim' },
  { key: 'snow_lodge', pattern: /雪山|雪地|滑雪|阿尔卑斯|alpine|ski/i, motif: 'snow-lodge' },
  { key: 'roof_garden', pattern: /屋顶花园|屋顶菜园|绿化屋顶|green roof/i, motif: 'roof-garden' },
  { key: 'solar_roof', pattern: /太阳能|光伏|solar/i, motif: 'solar-roof' },
  { key: 'rain_harvest', pattern: /雨水|雨链|蓄水|rainwater|rain chain/i, motif: 'rain-harvest' },
  { key: 'pool', pattern: /泳池|游泳池|pool/i, motif: 'pool-deck' },
  { key: 'planting_beds', pattern: /菜园|花坛|种植床|果园|orchard|vegetable|planting bed/i, motif: 'planting-beds' },
  { key: 'outdoor_living', pattern: /户外座椅|火坑|烧烤|庭院餐桌|outdoor seating|firepit|bbq/i, motif: 'outdoor-living' },
  { key: 'accessibility', pattern: /无障碍|轮椅|坡道|老人友好|accessible|wheelchair|ramp/i, motif: 'accessible-route' },
  { key: 'privacy', pattern: /私密|隐私|遮阳|百叶|privacy|awning|shade/i, motif: 'privacy-shading' },
  { key: 'wind_resilience', pattern: /抗风|台风|强风|大风|wind|hurricane/i, motif: 'wind-tie-downs' },
  { key: 'fire_resilience', pattern: /防火|消防|逃生|fire|egress/i, motif: 'firebreak-core' },
  { key: 'flood_resilience', pattern: /防洪|抬高|潮湿|洪水|flood|raised/i, motif: 'raised-vented-plinth' },
  { key: 'service_roof', pattern: /设备平台|屋顶设备|机房|service platform|roof equipment/i, motif: 'roof-service-platform' }
];

export class StyleGrammarAgent {
  analyze(prompt) {
    const features = {};
    const extraMotifs = [];
    for (const item of FEATURE_PATTERNS) {
      const matched = item.pattern.test(prompt);
      features[item.key] = matched;
      if (matched) extraMotifs.push(item.motif);
    }
    return {
      source: 'local-style-grammar',
      profile: bestStyleProfile(prompt),
      features,
      extra_motifs: extraMotifs,
      material_hints: STYLE_GRAMMAR_MATERIAL_HINTS.filter((item) => item.pattern.test(prompt)).map((item) => ({
        targets: item.targets,
        block: item.block
      }))
    };
  }
}

function bestStyleProfile(prompt) {
  return STYLE_GRAMMAR_PROFILES
    .map((item, order) => ({ item, order, match: prompt.match(item.pattern) }))
    .filter(({ match }) => match)
    .sort((a, b) => a.match.index - b.match.index || a.order - b.order)[0]?.item;
}
