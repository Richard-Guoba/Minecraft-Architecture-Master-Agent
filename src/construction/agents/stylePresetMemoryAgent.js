const PRESETS = [
  {
    id: 'coastal-view-house',
    families: ['coastal', 'mediterranean', 'tropical'],
    pattern: /海滨|海边|海景|滨海|沙滩|度假|coastal|beach/i,
    signatures: ['view-deck', 'breezy-veranda', 'panoramic-glass', 'light-wall'],
    palette: 'sand-white-aqua',
    facade: 'wide-view-facing-openings',
    roof: 'hipped-or-terrace',
    site: 'water-and-deck-transition'
  },
  {
    id: 'treehouse-canopy',
    families: ['treehouse', 'tropical'],
    pattern: /树屋|树上|林冠|treehouse|tree house/i,
    signatures: ['trunk-core', 'wraparound-deck', 'leaf-canopy', 'stilt-supports'],
    palette: 'jungle-wood-leaves',
    facade: 'small-openings-with-screens',
    roof: 'leaf-canopy-overhang',
    site: 'forest-canopy-path'
  },
  {
    id: 'earth-shelter-lightwell',
    families: ['subterranean', 'desert'],
    pattern: /地下|半地下|地堡|掩体|采光井|underground|bunker/i,
    signatures: ['retaining-walls', 'lightwell', 'protected-entry', 'bermed-roof'],
    palette: 'moss-stone-muted-light',
    facade: 'protected-low-glazing',
    roof: 'flat-bermed-roof',
    site: 'sunken-courtyard'
  },
  {
    id: 'cliffside-cantilever',
    families: ['cliffside', 'modern'],
    pattern: /悬崖|峭壁|山崖|悬挑|观景平台|cliff|cantilever/i,
    signatures: ['cantilever-deck', 'rock-anchors', 'panoramic-glass'],
    palette: 'stone-concrete-glass',
    facade: 'view-facing-glass',
    roof: 'flat-terrace',
    site: 'rocky-overlook'
  },
  {
    id: 'cyberpunk-neon-core',
    families: ['cyberpunk', 'futuristic'],
    pattern: /赛博朋克|霓虹|neon|cyberpunk|夜城/i,
    signatures: ['dark-shell', 'cyan-glass', 'neon-trim', 'service-spine'],
    palette: 'dark-cyan-magenta',
    facade: 'strip-window-with-neon',
    roof: 'flat-signage-roof',
    site: 'urban-neon-approach'
  },
  {
    id: 'alpine-lodge',
    families: ['alpine', 'nordic', 'rustic'],
    pattern: /雪山|雪地|滑雪|阿尔卑斯|山屋|木屋|alpine|ski|lodge/i,
    signatures: ['steep-roof', 'stone-base', 'timber-frame', 'hearth-core'],
    palette: 'stone-timber-snow',
    facade: 'warm-view-windows',
    roof: 'steep-snow-shedding',
    site: 'snow-lodge-path'
  },
  {
    id: 'courtyard-calm',
    families: ['japanese', 'chinese-courtyard'],
    pattern: /日式|江南|四合院|合院|庭院|枯山水|水乡|町屋/,
    signatures: ['courtyard-axis', 'screens', 'deep-eaves', 'garden-edge'],
    palette: 'wood-white-dark-roof',
    facade: 'screened-courtyard-front',
    roof: 'deep-eaves',
    site: 'courtyard-garden'
  },
  {
    id: 'default-house-memory',
    families: ['general'],
    pattern: /.*/,
    signatures: ['clear-entry', 'balanced-windows', 'simple-roof'],
    palette: 'material-native',
    facade: 'balanced-openings',
    roof: 'style-default',
    site: 'simple-path'
  }
];

export class StylePresetMemoryAgent {
  run(prompt = '', architecture = {}) {
    const family = String(architecture.style_family || architecture.styleFamily || 'general');
    const matches = PRESETS
      .map((preset, order) => ({ preset, order, score: scorePreset(prompt, family, preset) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.order - b.order);
    const preset = matches[0]?.preset || PRESETS.at(-1);
    return {
      source: 'local-style-preset-memory',
      id: preset.id,
      style_family: family,
      signatures: [...preset.signatures],
      palette: preset.palette,
      facade: preset.facade,
      roof: preset.roof,
      site: preset.site,
      agent_focus: agentFocusForPreset(preset),
      matched_score: matches[0]?.score || 1
    };
  }
}

function scorePreset(prompt, family, preset) {
  let score = preset.pattern.test(prompt) ? 4 : 0;
  if (preset.families.includes(family)) score += 6;
  if (preset.id === 'default-house-memory') score = Math.max(score, 1);
  return score;
}

function agentFocusForPreset(preset) {
  const focus = ['material-palette', 'facade', 'roof', 'site'];
  if (preset.signatures.some((item) => /deck|cantilever|trunk|retaining/.test(item))) focus.push('structure', 'opening-connectivity');
  if (preset.signatures.some((item) => /hearth|courtyard|canopy/.test(item))) focus.push('interior-detail');
  return focus;
}
