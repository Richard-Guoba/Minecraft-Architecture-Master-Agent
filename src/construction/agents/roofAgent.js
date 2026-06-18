export class RoofAgent {
  run(prompt = '', architecture = {}, buildSpec = {}, structure = {}, facade = {}, materialPalette = {}, stylePreset = {}) {
    const family = String(architecture.style_family || buildSpec.style_family || 'general');
    const rules = architecture.roof_rules || {};
    const design = architecture.design_directives?.roof || {};
    const style = String(design.style || rules.style || buildSpec.roof_style || 'gabled');
    const roofGarden = Boolean(design.roof_terrace || rules.roof_terrace || /屋顶花园|屋顶菜园|绿化屋顶|green roof/i.test(prompt));
    const skylights = Boolean(design.skylights || rules.skylights || /天窗|采光顶|温室/i.test(prompt));
    const chimney = shouldHaveChimney(family, prompt);
    const neonSign = family === 'cyberpunk' || /霓虹|招牌|neon|sign/i.test(prompt);
    const solarPanels = Boolean(rules.solar_panels || /太阳能|光伏|solar/i.test(prompt));
    const rainHarvest = Boolean(rules.rain_harvest || /雨水|雨链|蓄水|rainwater|rain chain/i.test(prompt));
    const dormers = Number(design.dormers ?? rules.dormers ?? (/老虎窗|屋顶窗|dormer/i.test(prompt) ? 2 : 0));
    const roofAccess = Boolean(rules.roof_access || roofGarden || /屋顶露台|上人屋顶|roof terrace|roof access/i.test(prompt));

    return {
      source: 'local-roof-agent',
      style_family: family,
      preset: stylePreset.id || 'none',
      style,
      profile: design.profile || rules.profile || stylePreset.roof || 'style-default',
      roof_height: Number(buildSpec.roof_height || 3),
      overhang: Number(design.overhang ?? rules.overhang ?? buildSpec.roof_overhang ?? 1),
      creative_signature: architecture.design_directives?.signature || buildSpec.creative_design_signature || 'none',
      elements: roofElements({ family, style, roofGarden, skylights, chimney, neonSign, solarPanels, rainHarvest, dormers, roofAccess, rules }),
      drainage: drainageForRoof(style, family),
      edge_treatment: edgeTreatmentForFamily(family, style),
      service_strategy: {
        solar_ready: solarPanels,
        rain_collection: rainHarvest,
        safe_roof_access: roofAccess,
        maintenance_zone: roofGarden || solarPanels || rainHarvest ? 'reserved-roof-service-strip' : 'eave-only'
      },
      materials: {
        roof: architecture.materials?.roof || 'minecraft:dark_oak_planks',
        trim: materialPalette.materials?.roof_detail || architecture.materials?.trim || 'minecraft:smooth_quartz',
        garden: materialPalette.materials?.plant || 'minecraft:oak_leaves[persistent=true]',
        light: materialPalette.materials?.facade_light || 'minecraft:glowstone',
        chimney: materialPalette.materials?.chimney || architecture.materials?.foundation || 'minecraft:bricks',
        solar: materialPalette.materials?.solar_panel || 'minecraft:daylight_detector',
        rain_chain: materialPalette.materials?.rain_chain || 'minecraft:chain',
        drainage: materialPalette.materials?.drainage || 'minecraft:cauldron'
      },
      engine_hints: {
        render_ridge_caps: ['gabled', 'hipped', 'pagoda'].includes(style),
        render_gutters: style !== 'flat',
        render_chimney: chimney,
        render_skylight_grid: skylights,
        render_roof_garden: roofGarden,
        render_neon_sign: neonSign,
        render_snow_caps: family === 'alpine',
        render_canopy_caps: family === 'treehouse',
        render_solar_panels: solarPanels,
        render_rain_collectors: rainHarvest,
        render_roof_access: roofAccess,
        render_dormers: dormers > 0
      }
    };
  }
}

function roofElements({ family, style, roofGarden, skylights, chimney, neonSign, solarPanels, rainHarvest, dormers, roofAccess, rules }) {
  const elements = [];
  if (['gabled', 'hipped', 'pagoda'].includes(style)) elements.push({ id: 'ridge-cap', kind: 'ridge-cap' });
  if (dormers) elements.push({ id: 'dormers', kind: 'dormer', count: dormers });
  if (skylights) elements.push({ id: 'skylight-grid', kind: 'skylight-grid' });
  if (roofGarden) elements.push({ id: 'roof-garden', kind: 'roof-garden' });
  if (chimney) elements.push({ id: 'chimney', kind: 'chimney' });
  if (neonSign) elements.push({ id: 'roof-sign', kind: 'neon-sign' });
  if (solarPanels) elements.push({ id: 'solar-array', kind: 'solar-array' });
  if (rainHarvest) elements.push({ id: 'rain-chain-and-cistern', kind: 'rain-harvest' });
  if (roofAccess) elements.push({ id: 'roof-access-hatch', kind: 'roof-access' });
  if (family === 'alpine') elements.push({ id: 'snow-caps', kind: 'snow-caps' });
  if (family === 'treehouse') elements.push({ id: 'canopy-caps', kind: 'leaf-canopy-caps' });
  return elements;
}

function shouldHaveChimney(family, prompt) {
  if (/烟囱|壁炉|hearth|chimney/i.test(prompt)) return true;
  return ['alpine', 'rustic', 'farmhouse', 'victorian', 'classical'].includes(family);
}

function drainageForRoof(style, family) {
  if (style === 'flat') return family === 'subterranean' ? 'hidden-drain-to-lightwell' : 'parapet-scupper';
  if (family === 'alpine') return 'snow-shedding-deep-eaves';
  return 'eave-drip-edge';
}

function edgeTreatmentForFamily(family, style) {
  if (family === 'japanese' || family === 'chinese-courtyard') return 'layered-deep-eaves';
  if (family === 'cyberpunk') return 'lit-parapet-edge';
  if (family === 'treehouse') return 'leaf-canopy-edge';
  return style === 'flat' ? 'parapet' : 'trimmed-eave';
}
