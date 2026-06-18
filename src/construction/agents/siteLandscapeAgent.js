export class SiteLandscapeAgent {
  run(prompt = '', architecture = {}, buildSpec = {}, topology = {}, materialPalette = {}, stylePreset = {}) {
    const family = String(architecture.style_family || buildSpec.style_family || 'general');
    const rules = architecture.site_rules || {};
    const design = architecture.design_directives?.site || {};
    const water = Boolean(design.water_feature || rules.water_feature || buildSpec.site?.water_feature || /泳池|水池|喷泉|溪流|海边|海景/.test(prompt));
    const patio = Boolean(design.patio || rules.patio || buildSpec.site?.patio || /露台|庭院|平台|patio/i.test(prompt));
    const dryGarden = Boolean(design.dry_garden || rules.dry_garden || buildSpec.site?.dry_garden);
    const enclosed = Boolean(rules.enclosed_courtyard || buildSpec.site?.enclosed_courtyard);
    const plantingBeds = Boolean(design.planting_beds || rules.planting_beds || /花坛|菜园|种植床|果园|orchard|vegetable|planting bed/i.test(prompt));
    const outdoorSeating = Boolean(design.outdoor_seating || rules.outdoor_seating || /户外座椅|庭院餐桌|烧烤|火坑|outdoor seating|bbq|firepit/i.test(prompt));
    const pool = Boolean(rules.pool || /泳池|游泳池|pool/i.test(prompt));
    const mailbox = Boolean(rules.mailbox || /信箱|门牌|mailbox|address/i.test(prompt));
    const accessible = Boolean(rules.accessible_route || /无障碍|坡道|轮椅|老人友好|accessible|wheelchair|ramp/i.test(prompt));
    const rolePalettes = materialPalette.role_palettes || {};

    return {
      source: 'local-site-landscape-agent',
      style_family: family,
      preset: stylePreset.id || 'none',
      mood: design.mood || rules.landscape_mood || buildSpec.site?.landscape_mood || stylePreset.site || 'simple',
      creative_signature: architecture.design_directives?.signature || buildSpec.creative_design_signature || 'none',
      entry_sequence: {
        side: buildSpec.door_side || architecture.facade_rules?.front_side || 'south',
        path_width: accessible ? Math.max(3, buildSpec.scale === 'large' ? 3 : 2) : buildSpec.scale === 'large' ? 3 : 2,
        lighting: family === 'cyberpunk' || /灯|霓虹|夜景/i.test(prompt) ? 'lit' : 'subtle',
        grade: accessible ? 'gentle-ramped' : 'stepped-or-flat',
        wayfinding: mailbox ? 'address-marker-at-entry' : 'direct-path'
      },
      zones: siteZones({ family, water, patio, dryGarden, enclosed, plantingBeds, outdoorSeating, pool, mailbox, accessible, prompt }),
      boundary: boundaryForFamily(family, enclosed),
      terrain_response: terrainResponseForFamily(family),
      outdoor_program: {
        planting_beds: plantingBeds,
        outdoor_seating: outdoorSeating,
        pool,
        mailbox,
        accessible_route: accessible
      },
      materials: {
        path: architecture.materials?.path || 'minecraft:gravel',
        landscape: materialPalette.materials?.landscape || 'minecraft:grass_block',
        plant: materialPalette.materials?.plant || 'minecraft:oak_leaves[persistent=true]',
        plant_secondary: materialPalette.materials?.plant_secondary || rolePalettes.vegetation?.[1],
        plant_palette: rolePalettes.vegetation || [],
        understory_palette: rolePalettes.understory || [],
        water: materialPalette.materials?.water || 'minecraft:water',
        light: materialPalette.materials?.path_light || architecture.materials?.lamp || 'minecraft:glowstone',
        fence: materialPalette.materials?.railing || 'minecraft:oak_fence',
        pool_edge: materialPalette.materials?.pool_edge || 'minecraft:smooth_quartz',
        outdoor_seat: materialPalette.materials?.outdoor_seat || 'minecraft:spruce_stairs[facing=north,half=bottom]',
        mailbox: materialPalette.materials?.mailbox || 'minecraft:barrel',
        firepit: materialPalette.materials?.firepit || 'minecraft:campfire[lit=false]',
        accessibility_marker: materialPalette.materials?.accessibility_marker || 'minecraft:light_blue_carpet'
      },
      engine_hints: {
        render_entry_path: true,
        render_path_lights: family === 'cyberpunk' || /灯|夜景|霓虹/i.test(prompt),
        render_boundary: enclosed || ['classical', 'gothic', 'japanese', 'chinese-courtyard'].includes(family),
        render_tree_clusters: ['treehouse', 'rustic', 'alpine', 'japanese', 'chinese-courtyard'].includes(family),
        render_rock_edges: ['cliffside', 'alpine', 'subterranean'].includes(family),
        render_water_edge: water,
        render_sunken_court: family === 'subterranean',
        render_deck_transition: patio || /deck|平台|露台|观景/.test(prompt),
        render_planting_beds: plantingBeds,
        render_outdoor_seating: outdoorSeating,
        render_pool: pool,
        render_mailbox: mailbox,
        render_accessible_markers: accessible
      }
    };
  }
}

function siteZones({ family, water, patio, dryGarden, enclosed, plantingBeds, outdoorSeating, pool, mailbox, accessible, prompt }) {
  const zones = ['entry-path'];
  if (water) zones.push('water-edge');
  if (patio) zones.push('patio-transition');
  if (dryGarden) zones.push('dry-garden');
  if (enclosed) zones.push('courtyard-boundary');
  if (plantingBeds) zones.push('planting-beds');
  if (outdoorSeating) zones.push('outdoor-living');
  if (pool) zones.push('pool-deck');
  if (mailbox) zones.push('address-marker');
  if (accessible) zones.push('accessible-route');
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
