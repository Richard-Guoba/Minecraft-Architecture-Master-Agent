export class SiteLandscapeAgent {
  run(prompt = '', architecture = {}, buildSpec = {}, topology = {}, materialPalette = {}, stylePreset = {}) {
    const family = String(architecture.style_family || buildSpec.style_family || 'general');
    const rules = architecture.site_rules || {};
    const water = Boolean(rules.water_feature || buildSpec.site?.water_feature || /泳池|水池|喷泉|溪流|海边|海景/.test(prompt));
    const patio = Boolean(rules.patio || buildSpec.site?.patio || /露台|庭院|平台|patio/i.test(prompt));
    const dryGarden = Boolean(rules.dry_garden || buildSpec.site?.dry_garden);
    const enclosed = Boolean(rules.enclosed_courtyard || buildSpec.site?.enclosed_courtyard);

    return {
      source: 'local-site-landscape-agent',
      style_family: family,
      preset: stylePreset.id || 'none',
      mood: rules.landscape_mood || buildSpec.site?.landscape_mood || stylePreset.site || 'simple',
      entry_sequence: {
        side: buildSpec.door_side || architecture.facade_rules?.front_side || 'south',
        path_width: buildSpec.scale === 'large' ? 3 : 2,
        lighting: family === 'cyberpunk' || /灯|霓虹|夜景/i.test(prompt) ? 'lit' : 'subtle'
      },
      zones: siteZones({ family, water, patio, dryGarden, enclosed, prompt }),
      boundary: boundaryForFamily(family, enclosed),
      terrain_response: terrainResponseForFamily(family),
      materials: {
        path: architecture.materials?.path || 'minecraft:gravel',
        landscape: materialPalette.materials?.landscape || 'minecraft:grass_block',
        plant: materialPalette.materials?.plant || 'minecraft:oak_leaves[persistent=true]',
        water: materialPalette.materials?.water || 'minecraft:water',
        light: materialPalette.materials?.path_light || architecture.materials?.lamp || 'minecraft:glowstone',
        fence: materialPalette.materials?.railing || 'minecraft:oak_fence'
      },
      engine_hints: {
        render_entry_path: true,
        render_path_lights: family === 'cyberpunk' || /灯|夜景|霓虹/i.test(prompt),
        render_boundary: enclosed || ['classical', 'gothic', 'japanese', 'chinese-courtyard'].includes(family),
        render_tree_clusters: ['treehouse', 'rustic', 'alpine', 'japanese', 'chinese-courtyard'].includes(family),
        render_rock_edges: ['cliffside', 'alpine', 'subterranean'].includes(family),
        render_water_edge: water,
        render_sunken_court: family === 'subterranean',
        render_deck_transition: patio || /deck|平台|露台|观景/.test(prompt)
      }
    };
  }
}

function siteZones({ family, water, patio, dryGarden, enclosed, prompt }) {
  const zones = ['entry-path'];
  if (water) zones.push('water-edge');
  if (patio) zones.push('patio-transition');
  if (dryGarden) zones.push('dry-garden');
  if (enclosed) zones.push('courtyard-boundary');
  if (family === 'treehouse') zones.push('forest-understory');
  if (family === 'subterranean') zones.push('sunken-lightwell-court');
  if (family === 'cliffside') zones.push('rocky-overlook');
  if (/花园|garden/i.test(prompt)) zones.push('planting-beds');
  return [...new Set(zones)];
}

function boundaryForFamily(family, enclosed) {
  if (enclosed) return 'courtyard-wall';
  if (family === 'treehouse') return 'low-natural-edge';
  if (family === 'cliffside') return 'safety-rail-and-rock-edge';
  if (family === 'cyberpunk') return 'lit-urban-curb';
  return 'open-setback';
}

function terrainResponseForFamily(family) {
  if (family === 'subterranean') return 'sunken-and-bermed';
  if (family === 'cliffside') return 'anchored-to-rock-edge';
  if (family === 'treehouse') return 'raised-above-forest-floor';
  if (family === 'coastal') return 'sand-to-deck-transition';
  if (family === 'alpine') return 'snow-and-stone-base';
  return 'flat-lot';
}
