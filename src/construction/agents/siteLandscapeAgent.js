import { buildTemplateSiteSceneStrategy } from './templateSiteSceneStrategy.js';

export class SiteLandscapeAgent {
  run(prompt = '', architecture = {}, buildSpec = {}, topology = {}, materialPalette = {}, stylePreset = {}) {
    const family = String(architecture.style_family || buildSpec.style_family || 'general');
    const rules = architecture.site_rules || {};
    const design = architecture.design_directives?.site || {};
    const plannedMood = design.mood || rules.template_site_mood || rules.landscape_mood || buildSpec.site?.landscape_mood || stylePreset.site || 'simple';
    const water = Boolean(design.water_feature || rules.water_feature || buildSpec.site?.water_feature || /泳池|水池|喷泉|溪流|海边|海景/.test(prompt));
    const requestedPatio = /露台|庭院|平台|patio/i.test(prompt);
    const patio = Boolean((plannedMood !== 'compact-urban-strip' || requestedPatio) && (design.patio || rules.patio || buildSpec.site?.patio || requestedPatio));
    const dryGarden = Boolean(design.dry_garden || rules.dry_garden || buildSpec.site?.dry_garden);
    const enclosed = Boolean(rules.enclosed_courtyard || buildSpec.site?.enclosed_courtyard);
    const plantingBeds = Boolean(design.planting_beds || rules.planting_beds || /花坛|菜园|种植床|果园|orchard|vegetable|planting bed/i.test(prompt));
    const outdoorSeating = Boolean(design.outdoor_seating || rules.outdoor_seating || /户外座椅|庭院餐桌|烧烤|火坑|outdoor seating|bbq|firepit/i.test(prompt));
    const pool = Boolean(rules.pool || /泳池|游泳池|pool/i.test(prompt));
    const mailbox = Boolean(rules.mailbox || /信箱|门牌|mailbox|address/i.test(prompt));
    const accessible = Boolean(rules.accessible_route || /无障碍|坡道|轮椅|老人友好|accessible|wheelchair|ramp/i.test(prompt));
    const rolePalettes = materialPalette.role_palettes || {};
    const templateRecommendations = architecture.template_knowledge?.recommendations || {};
    const compositionStrategy = rules.template_composition_strategy ||
      architecture.generation_hints?.template_composition_strategy ||
      templateRecommendations.composition_strategy ||
      buildSpec.design?.template_composition_strategy ||
      {};
    const compositionDirectives = compositionStrategy.directives || {};
    const hasCompositionDirectives = Object.keys(compositionDirectives).length > 0;
    const explicitTemplateSite = !hasCompositionDirectives || Boolean(compositionDirectives.prompt_signals?.explicit_composition_request);
    const templateFeatures = new Set(explicitTemplateSite ? [
      ...normalizeStringArray(templateRecommendations.landscape_features),
      ...normalizeStringArray(rules.template_landscape_features),
      ...normalizeStringArray(buildSpec.site?.template_landscape_features)
    ] : []);
    const templateTerrainProfile = explicitTemplateSite
      ? String(rules.template_terrain_profile || buildSpec.site?.template_terrain_profile || templateRecommendations.terrain_profile || 'flat-or-built-platform')
      : 'flat-or-built-platform';
    const templateTerrain = Boolean(rules.terrain_layers || templateFeatures.has('layered-terrain') || templateTerrainProfile !== 'flat-or-built-platform' || compositionDirectives.use_layered_terrain_base);
    const templateGarden = Boolean(rules.garden_composition || templateFeatures.has('garden-composition') || compositionDirectives.use_foreground_garden_sequence);
    const templateRockBase = Boolean(rules.rock_base || templateFeatures.has('rock-and-earth-base') || templateFeatures.has('layered-terrain'));
    const templateWaterEdge = Boolean(templateFeatures.has('water-edge') || compositionDirectives.use_waterfront_transition);
    const templateTrees = Boolean(templateFeatures.has('tree-and-shrub-clusters'));
    const templateApproach = Boolean(compositionDirectives.use_foreground_garden_sequence || compositionDirectives.use_waterfront_transition || compositionDirectives.use_layered_terrain_base);
    const templateSiteScenes = buildTemplateSiteSceneStrategy({
      prompt,
      architecture,
      buildSpec,
      topology,
      context: {
        water: water || templateWaterEdge,
        template_features: [...templateFeatures],
        terrain_profile: templateTerrainProfile,
        template_terrain: templateTerrain,
        template_garden: templateGarden,
        template_rock_base: templateRockBase,
        template_water_edge: templateWaterEdge,
        template_trees: templateTrees,
        template_approach: templateApproach
      }
    });
    const zones = [
      ...siteZones({ family, water: water || templateWaterEdge, patio, dryGarden, enclosed, plantingBeds: plantingBeds || templateGarden, outdoorSeating, pool, mailbox, accessible, prompt, templateTerrain, templateGarden, templateRockBase, templateApproach }),
      ...(templateSiteScenes.zones || [])
    ];

    return {
      source: 'local-site-landscape-agent',
      style_family: family,
      preset: stylePreset.id || 'none',
      mood: design.mood || rules.template_site_mood || compositionDirectives.preferred_site_mood || rules.landscape_mood || buildSpec.site?.landscape_mood || stylePreset.site || 'simple',
      creative_signature: architecture.design_directives?.signature || buildSpec.creative_design_signature || 'none',
      entry_sequence: {
        side: buildSpec.door_side || architecture.facade_rules?.front_side || 'south',
        path_width: accessible ? Math.max(3, buildSpec.scale === 'large' ? 3 : 2) : buildSpec.scale === 'large' ? 3 : 2,
        lighting: family === 'cyberpunk' || /灯|霓虹|夜景/i.test(prompt) ? 'lit' : 'subtle',
        grade: accessible ? 'gentle-ramped' : 'stepped-or-flat',
        wayfinding: mailbox ? 'address-marker-at-entry' : 'direct-path'
      },
      zones: [...new Set(zones)],
      boundary: boundaryForFamily(family, enclosed),
      terrain_response: templateTerrain ? templateTerrainProfile : terrainResponseForFamily(family),
      template_site_scenes: templateSiteScenes,
      template_guidance: {
        active: Boolean(architecture.template_knowledge?.active),
        terrain_profile: templateTerrainProfile,
        landscape_features: [...templateFeatures],
        detail_density: templateRecommendations.detail_density || 'unknown',
        retrieved: architecture.template_knowledge?.retrieved?.map((item) => item.title) || [],
        composition_strategy: compositionStrategy,
        site_scene_strategy: templateSiteScenes
      },
      outdoor_program: {
        planting_beds: plantingBeds || templateGarden,
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
        earth: materialPalette.materials?.earth || 'minecraft:dirt',
        rock: materialPalette.materials?.retaining || materialPalette.materials?.landscape || 'minecraft:stone',
        grass: materialPalette.materials?.grass || 'minecraft:grass_block',
        path_secondary: materialPalette.materials?.path_secondary || 'minecraft:cobblestone',
        garden_edge: materialPalette.materials?.garden_edge || materialPalette.materials?.railing || 'minecraft:oak_fence',
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
        render_tree_clusters: templateTrees || ['treehouse', 'rustic', 'alpine', 'japanese', 'chinese-courtyard'].includes(family),
        render_rock_edges: templateRockBase || ['cliffside', 'alpine', 'subterranean'].includes(family),
        render_water_edge: water || templateWaterEdge,
        render_sunken_court: family === 'subterranean',
        render_deck_transition: patio || /deck|平台|露台|观景/.test(prompt),
        render_planting_beds: plantingBeds || templateGarden,
        render_outdoor_seating: outdoorSeating,
        render_pool: pool,
        render_mailbox: mailbox,
        render_accessible_markers: accessible,
        render_layered_terrain: templateTerrain,
        render_garden_composition: templateGarden,
        render_terrain_retaining: templateTerrain || templateRockBase,
        render_template_approach_sequence: templateApproach,
        render_template_view_frame: Boolean(compositionDirectives.use_waterfront_transition || compositionDirectives.use_large_view_glass),
        render_template_site_scenes: Boolean(templateSiteScenes.active),
        template_site_scene_count: templateSiteScenes.scene_count || 0
      }
    };
  }
}

function siteZones({ family, water, patio, dryGarden, enclosed, plantingBeds, outdoorSeating, pool, mailbox, accessible, prompt, templateTerrain, templateGarden, templateRockBase, templateApproach }) {
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
  if (templateTerrain) zones.push('layered-terrain');
  if (templateGarden) zones.push('garden-composition');
  if (templateRockBase) zones.push('rock-and-earth-base');
  if (templateApproach) zones.push('template-approach-sequence');
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

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item !== undefined && item !== null).map(String);
}
