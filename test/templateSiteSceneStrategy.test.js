import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackArchitecture } from '../src/construction/agents/architectAgent.js';
import { buildFallbackTopology } from '../src/construction/agents/plannerAgent.js';
import { StylePresetMemoryAgent } from '../src/construction/agents/stylePresetMemoryAgent.js';
import { MaterialPaletteAgent } from '../src/construction/agents/materialPaletteAgent.js';
import { StructureAgent } from '../src/construction/agents/structureAgent.js';
import { FacadeAgent } from '../src/construction/agents/facadeAgent.js';
import { RoofAgent } from '../src/construction/agents/roofAgent.js';
import { SiteLandscapeAgent } from '../src/construction/agents/siteLandscapeAgent.js';
import { buildSeededCreativeDesign, applyCreativeDesign } from '../src/construction/agents/creativeDesignAgent.js';
import { CSGBuilder } from '../src/construction/engine/csgBuilder.js';
import { deriveBuildSpec } from '../src/construction/workflow.js';

test('template site scene strategy renders terrain, forecourt garden, water edge, and grove scenes', () => {
  const context = buildTemplateSiteContext();
  const siteScenes = context.site.template_site_scenes;
  const counts = moduleCounts(context.shell.grid);

  assert.equal(siteScenes.active, true);
  assert.equal(context.site.engine_hints.render_template_site_scenes, true);
  assert.ok(siteScenes.scene_count >= 5);
  assert.ok(siteScenes.scene_types.includes('entry-approach-scene'));
  assert.ok(siteScenes.scene_types.includes('terrain-plinth-scene'));
  assert.ok(siteScenes.scene_types.includes('forecourt-garden-room-scene'));
  assert.ok(siteScenes.scene_types.includes('water-edge-deck-scene'));
  assert.ok(siteScenes.scene_types.includes('grove-edge-scene'));
  assert.ok(context.site.zones.includes('template-garden-room'));
  assert.equal(context.shell.csg.site.templateSiteSceneCount, siteScenes.scene_count);
  assert.ok(context.shell.csg.site.templateSiteSceneTypes.includes('water-edge-deck-scene'));

  for (const module of [
    'template_site_axis_path',
    'template_site_entry_frame',
    'template_site_threshold_light',
    'template_site_stone_plinth',
    'template_site_earth_terrace',
    'template_site_retaining_edge',
    'template_site_garden_room',
    'template_site_garden_planting',
    'template_site_reflection_basin',
    'template_site_water_deck',
    'template_site_reflection_water',
    'template_site_outdoor_seat',
    'template_site_tree_canopy',
    'template_site_understory'
  ]) {
    assert.ok(counts[module] > 0, `expected ${module} module`);
  }
});

test('template site scenes bypass old explicit prompt gate during strong reference transfer', () => {
  const context = buildTemplateSiteContext({
    prompt: '按模板库顶级房子强参考复现：建一个现代别墅，完整客厅、开放厨房、主卧和书房场景',
    referenceTransferOnly: true
  });
  const siteScenes = context.site.template_site_scenes;

  assert.equal(siteScenes.active, true);
  assert.ok(siteScenes.scene_types.includes('forecourt-garden-room-scene'));
  assert.ok(siteScenes.scene_types.includes('water-edge-deck-scene'));
  assert.ok(siteScenes.scene_types.includes('terrain-plinth-scene'));
});

function buildTemplateSiteContext(options = {}) {
  const prompt = options.prompt || '建一个现代湖边别墅，带非平坦自然地形、前景花园、水边平台、大玻璃和屋顶露台';
  let architecture = withLakeVillaComposition(buildFallbackArchitecture(prompt), options);
  const stylePreset = new StylePresetMemoryAgent().run(prompt, architecture);
  const materialPalette = new MaterialPaletteAgent().run(prompt, architecture, stylePreset);
  architecture = { ...architecture, materials: materialPalette.materials };
  let buildSpec = deriveBuildSpec(prompt, architecture, 1997941929);
  if (options.referenceTransferOnly) {
    buildSpec = {
      ...buildSpec,
      garden_depth: Math.max(Number(buildSpec.garden_depth || 0), 12),
      lot: {
        ...(buildSpec.lot || {}),
        depth: Number(buildSpec.depth || 0) + 12 + Number(buildSpec.lot?.rear_setback || 2)
      }
    };
  }
  let topology = buildFallbackTopology(prompt, architecture, buildSpec);
  const creativeDesign = buildSeededCreativeDesign(prompt, architecture, buildSpec, topology);
  ({ architecture, buildSpec, topology } = applyCreativeDesign({ architecture, buildSpec, topology, creativeDesign, prompt }));
  const structure = new StructureAgent().run(architecture, buildSpec, topology);
  const facade = new FacadeAgent().run(prompt, architecture, buildSpec, topology, materialPalette, stylePreset);
  const roof = new RoofAgent().run(prompt, architecture, buildSpec, structure, facade, materialPalette, stylePreset);
  const site = new SiteLandscapeAgent().run(prompt, architecture, buildSpec, topology, materialPalette, stylePreset);
  const shell = new CSGBuilder(buildSpec, architecture.materials).generateShell(architecture, { structure, facade, roof, site });
  return { prompt, architecture, buildSpec, topology, structure, facade, roof, site, shell };
}

function withLakeVillaComposition(architecture, options = {}) {
  const referenceTransferOnly = Boolean(options.referenceTransferOnly);
  const compositionStrategy = {
    source: 'template-composition-strategy-v1',
    readiness: 'high',
    directives: {
      preferred_massing_variant: 'east-offset-glass-wing',
      preferred_facade_rhythm: 'horizontal-ribbon-breaks',
      preferred_roof_profile: 'thin-parapet-terrace',
      preferred_site_mood: 'reflecting-water-edge',
      use_wings: true,
      use_large_view_glass: true,
      use_facade_depth: true,
      use_waterfront_transition: true,
      use_foreground_garden_sequence: true,
      use_layered_terrain_base: true,
      prompt_signals: {
        explicit_composition_request: !referenceTransferOnly,
        reference_transfer: referenceTransferOnly,
        water_requested: !referenceTransferOnly,
        garden_requested: !referenceTransferOnly,
        terrain_requested: !referenceTransferOnly,
        roof_terrace_requested: !referenceTransferOnly
      }
    },
    massing_patterns: [{ pattern_type: 'long_bar', confidence: 84 }],
    approach_sequence: [{ pattern_type: 'garden_forecourt', confidence: 82 }, { pattern_type: 'waterfront_transition', confidence: 80 }],
    facade_rhythm: [{ pattern_type: 'large_glass_bands', confidence: 90 }],
    roof_composition: [{ pattern_type: 'flat_terrace_or_platform', confidence: 78 }],
    site_composition: [{ pattern_type: 'water_edge', confidence: 88 }, { pattern_type: 'garden_rooms', confidence: 80 }],
    view_and_landmark_rules: [{ pattern_type: 'orient_public_rooms_to_view', confidence: 86 }]
  };
  const referenceReproduction = referenceTransferOnly ? {
    active: true,
    strength: 'high',
    detail_targets: { natural_site_density: 'high', detail_density: 'high' }
  } : undefined;
  return {
    ...architecture,
    generation_hints: {
      ...(architecture.generation_hints || {}),
      template_composition_strategy: compositionStrategy,
      ...(referenceReproduction ? { reference_reproduction: referenceReproduction } : {})
    },
    massing_rules: {
      ...(architecture.massing_rules || {}),
      template_composition_strategy: compositionStrategy
    },
    site_rules: {
      ...(architecture.site_rules || {}),
      template_composition_strategy: compositionStrategy,
      ...(referenceReproduction ? { reference_reproduction: referenceReproduction } : {})
    },
    detail_rules: {
      ...(architecture.detail_rules || {}),
      ...(referenceReproduction ? { reference_reproduction: referenceReproduction } : {})
    }
  };
}

function moduleCounts(grid) {
  const counts = {};
  for (const item of grid.values()) counts[item.module] = (counts[item.module] || 0) + 1;
  return counts;
}
