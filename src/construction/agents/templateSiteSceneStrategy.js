export function buildTemplateSiteSceneStrategy({
  prompt = '',
  architecture = {},
  buildSpec = {},
  topology = {},
  context = {}
} = {}) {
  const composition = templateCompositionStrategyFor(architecture, buildSpec);
  const directives = composition.directives || {};
  const features = new Set(context.template_features || []);
  if (!shouldActivateSiteScenes({ prompt, composition, directives, features, context, topology })) {
    return { active: false, reason: 'no-template-site-scene-signal' };
  }

  const entrySide = normalizeSide(buildSpec.door_side || architecture.facade_rules?.front_side || topology.template_space_plan?.entry_side || 'south');
  const viewSide = normalizeSide(topology.template_space_plan?.view_side || topology.bsp_hints?.template_view_side || entrySide);
  const terrainProfile = context.terrain_profile || architecture.site_rules?.template_terrain_profile || buildSpec.site?.template_terrain_profile || 'flat-or-built-platform';
  const scenes = [];
  const addScene = (scene) => {
    if (scene) scenes.push(scene);
  };

  addScene(buildApproachScene({ directives, context, entrySide, viewSide }));
  addScene(buildTerrainPlinthScene({ directives, context, terrainProfile, entrySide, viewSide }));
  addScene(buildForegroundGardenScene({ directives, context, features, entrySide, viewSide }));
  addScene(buildWaterEdgeScene({ directives, context, features, entrySide, viewSide }));
  addScene(buildGroveEdgeScene({ directives, context, features, entrySide, viewSide }));

  return {
    active: scenes.length > 0,
    source: 'template-site-scene-strategy-v1',
    readiness: scenes.length >= 4 ? composition.readiness || 'high' : composition.readiness || 'partial',
    composition_source: composition.source || 'template-composition-strategy-v1',
    entry_side: entrySide,
    view_side: viewSide,
    terrain_profile: terrainProfile,
    scene_count: scenes.length,
    scene_types: scenes.map((scene) => scene.scene_type),
    scenes,
    zones: [...new Set(scenes.flatMap((scene) => scene.zone_ids || []))],
    module_roles: [...new Set(scenes.flatMap((scene) => scene.module_roles || []))],
    directives: {
      compose_entry_as_sequence: scenes.some((scene) => scene.scene_type === 'entry-approach-scene'),
      render_layered_terrain_plinth: scenes.some((scene) => scene.scene_type === 'terrain-plinth-scene'),
      render_foreground_garden_rooms: scenes.some((scene) => scene.scene_type === 'forecourt-garden-room-scene'),
      render_waterfront_living_edge: scenes.some((scene) => scene.scene_type === 'water-edge-deck-scene'),
      render_grove_edges: scenes.some((scene) => scene.scene_type === 'grove-edge-scene')
    }
  };
}

function buildApproachScene({ directives = {}, context = {}, entrySide, viewSide }) {
  if (!context.template_approach && !directives.use_foreground_garden_sequence && !directives.use_layered_terrain_base) return undefined;
  return scene({
    id: 'entry-approach',
    scene_type: 'entry-approach-scene',
    entrySide,
    viewSide,
    intent: 'compress arrival through a framed garden threshold before revealing the house',
    zone_ids: ['template-entry-approach', 'template-threshold-frame'],
    components: [
      component('approach_axis', ['template_site_axis_path']),
      component('entry_gate_frame', ['template_site_entry_frame']),
      component('threshold_lights', ['template_site_threshold_light']),
      component('arrival_pockets', ['template_site_arrival_pocket'])
    ],
    clauses: ['site-entry-axis', 'site-framed-threshold', 'site-arrival-compression']
  });
}

function buildTerrainPlinthScene({ directives = {}, context = {}, terrainProfile, entrySide, viewSide }) {
  if (!context.template_terrain && !context.template_rock_base && !directives.use_layered_terrain_base && terrainProfile === 'flat-or-built-platform') return undefined;
  return scene({
    id: 'terrain-plinth',
    scene_type: 'terrain-plinth-scene',
    entrySide,
    viewSide,
    intent: 'make non-flat ground part of the architectural base with stone, dirt, and planted terraces',
    zone_ids: ['template-terrain-plinth', 'template-retaining-terrace'],
    components: [
      component('stone_plinth', ['template_site_stone_plinth']),
      component('earth_terrace', ['template_site_earth_terrace']),
      component('retaining_edges', ['template_site_retaining_edge']),
      component('planting_pockets', ['template_site_planting_pocket'])
    ],
    clauses: ['site-layered-terrain-base', 'site-rock-and-earth-plinth', 'site-terrace-retaining-edges']
  });
}

function buildForegroundGardenScene({ directives = {}, context = {}, features = new Set(), entrySide, viewSide }) {
  if (!context.template_garden && !features.has('garden-composition') && !directives.use_foreground_garden_sequence) return undefined;
  return scene({
    id: 'forecourt-garden-rooms',
    scene_type: 'forecourt-garden-room-scene',
    entrySide,
    viewSide,
    intent: 'organize the foreground as small garden rooms instead of a flat empty lawn',
    zone_ids: ['template-forecourt-garden', 'template-garden-room', 'template-planting-room'],
    components: [
      component('garden_axis', ['template_site_garden_axis']),
      component('paired_garden_rooms', ['template_site_garden_room']),
      component('hedge_edges', ['template_site_garden_edge']),
      component('planting_beds', ['template_site_garden_planting']),
      component('garden_water_basin', ['template_site_reflection_basin'])
    ],
    clauses: ['site-foreground-garden-rooms', 'site-paired-planting-beds', 'site-garden-water-focus']
  });
}

function buildWaterEdgeScene({ directives = {}, context = {}, features = new Set(), entrySide, viewSide }) {
  if (!context.template_water_edge && !features.has('water-edge') && !directives.use_waterfront_transition && !context.water) return undefined;
  return scene({
    id: 'water-edge-deck',
    scene_type: 'water-edge-deck-scene',
    entrySide,
    viewSide,
    intent: 'release the public rooms toward a deck, reflection water, and low framed water edge',
    zone_ids: ['template-water-deck', 'template-reflection-water', 'template-outdoor-living-edge'],
    components: [
      component('view_deck', ['template_site_water_deck']),
      component('reflection_pool', ['template_site_reflection_water', 'template_site_water_edge']),
      component('deck_frame', ['template_site_deck_frame']),
      component('outdoor_lounge', ['template_site_outdoor_seat', 'template_site_outdoor_table']),
      component('water_edge_planting', ['template_site_water_planting'])
    ],
    clauses: ['site-waterfront-threshold', 'site-reflection-water-edge', 'site-outdoor-living-facing-view']
  });
}

function buildGroveEdgeScene({ directives = {}, context = {}, features = new Set(), entrySide, viewSide }) {
  if (!context.template_trees && !context.template_garden && !features.has('tree-and-shrub-clusters') && !directives.use_foreground_garden_sequence) return undefined;
  return scene({
    id: 'grove-edge',
    scene_type: 'grove-edge-scene',
    entrySide,
    viewSide,
    intent: 'wrap the composed site with asymmetrical tree clusters and understory texture',
    zone_ids: ['template-grove-edge', 'template-understory'],
    components: [
      component('tree_cluster', ['template_site_tree_trunk', 'template_site_tree_canopy']),
      component('understory', ['template_site_understory']),
      component('rock_planting_edge', ['template_site_grove_rock'])
    ],
    clauses: ['site-asymmetric-tree-clusters', 'site-understory-depth', 'site-soft-natural-edge']
  });
}

function scene({ id, scene_type: sceneType, entrySide, viewSide, intent, zone_ids: zoneIds, components, clauses }) {
  return {
    scene_id: id,
    scene_type: sceneType,
    entry_side: entrySide,
    view_side: viewSide,
    intent,
    zone_ids: zoneIds,
    components,
    component_ids: components.map((item) => item.id),
    module_roles: [...new Set(components.flatMap((item) => item.module_roles))],
    clauses
  };
}

function component(id, moduleRoles) {
  return {
    id,
    module_roles: moduleRoles,
    required: true
  };
}

function shouldActivateSiteScenes({ prompt = '', composition = {}, directives = {}, features = new Set(), context = {}, topology = {} }) {
  if (!composition || !Object.keys(composition).length) return false;
  if (composition.readiness === 'none') return false;
  const text = String(prompt || '').toLowerCase();
  const explicitPrompt = /前景|花园|园林|庭院|水边|湖边|平台|露台|地形|非平坦|挡土|树|景观|garden|landscape|water|lake|terrain|deck|terrace|forecourt/.test(text);
  const referenceTransfer = Boolean(
    directives.prompt_signals?.reference_transfer ||
    (context.reference_reproduction?.active && ['high', 'medium'].includes(String(context.reference_reproduction?.strength || '')))
  );
  const hasSignals = directives.prompt_signals && Object.keys(directives.prompt_signals).length > 0;
  const explicitSignal = Boolean(directives.prompt_signals?.explicit_composition_request || explicitPrompt);
  if (hasSignals && !explicitSignal && !referenceTransfer) return false;
  return Boolean(
    explicitSignal ||
    referenceTransfer ||
    directives.use_foreground_garden_sequence ||
    directives.use_waterfront_transition ||
    directives.use_layered_terrain_base ||
    context.template_garden ||
    context.template_terrain ||
    context.template_water_edge ||
    features.size ||
    (topology.site_connections || []).some((item) => /^template-/.test(String(item.relation || '')))
  );
}

function templateCompositionStrategyFor(architecture = {}, buildSpec = {}) {
  return architecture.generation_hints?.template_composition_strategy ||
    architecture.massing_rules?.template_composition_strategy ||
    architecture.site_rules?.template_composition_strategy ||
    architecture.facade_rules?.template_composition_strategy ||
    architecture.detail_rules?.template_composition_strategy ||
    buildSpec.design?.template_composition_strategy ||
    architecture.template_knowledge?.recommendations?.composition_strategy ||
    buildSpec.template_knowledge?.recommendations?.composition_strategy ||
    {};
}

function normalizeSide(value) {
  const text = String(value || '').toLowerCase();
  if (/north|北/.test(text)) return 'north';
  if (/east|东/.test(text)) return 'east';
  if (/west|西/.test(text)) return 'west';
  return 'south';
}
