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
  { pattern: /树叶|树冠|leaf|leaves/i, targets: ['trim'], block: 'minecraft:oak_leaves[persistent=true]' }
];

const FEATURE_PATTERNS = [
  { key: 'cliff_deck', pattern: /悬崖|峭壁|山崖|观景台|观景平台|view deck|cliff/i, motif: 'view-deck' },
  { key: 'treehouse', pattern: /树屋|树上|林冠|treehouse|tree house/i, motif: 'treehouse' },
  { key: 'underground', pattern: /地下|地堡|半地下|掩体|洞穴住宅|地下基地|bunker|underground/i, motif: 'earth-shelter' },
  { key: 'greenhouse', pattern: /温室|花房|玻璃温室|植物房|greenhouse/i, motif: 'greenhouse' },
  { key: 'coastal_deck', pattern: /海滨|海边|海景|沙滩|海岛|beach|coastal|seaside/i, motif: 'coastal-deck' },
  { key: 'neon', pattern: /赛博朋克|霓虹|neon|cyberpunk/i, motif: 'neon-trim' },
  { key: 'snow_lodge', pattern: /雪山|雪地|滑雪|阿尔卑斯|alpine|ski/i, motif: 'snow-lodge' },
  { key: 'roof_garden', pattern: /屋顶花园|屋顶菜园|绿化屋顶|green roof/i, motif: 'roof-garden' }
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
