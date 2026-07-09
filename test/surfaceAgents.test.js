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
import { OpeningConnectivityAgent } from '../src/construction/agents/openingConnectivityAgent.js';
import { InteriorDetailAgent } from '../src/construction/agents/interiorDetailAgent.js';
import { ConstraintRepairAgent } from '../src/construction/agents/constraintRepairAgent.js';
import { ConstructionDecoratorAgent } from '../src/construction/agents/decoratorAgent.js';
import { applyTemplateKnowledgeToArchitecture, applyTemplateKnowledgeToBuildSpec } from '../src/construction/agents/templateKnowledgeAgent.js';
import { buildSeededCreativeDesign, applyCreativeDesign } from '../src/construction/agents/creativeDesignAgent.js';
import { deriveBuildSpec } from '../src/construction/workflow.js';
import { CSGBuilder } from '../src/construction/engine/csgBuilder.js';
import { BSPPartitioner } from '../src/construction/engine/bspPartitioner.js';
import { AStarPathfinder } from '../src/construction/engine/pathfinder.js';

test('surface agents derive palette, facade, roof, and site plans for hybrid neon coastal prompts', () => {
  const context = buildAgentContext('建一个赛博朋克海边别墅，霓虹招牌，海晶灯，青色玻璃，屋顶花园');

  assert.equal(context.stylePreset.id, 'cyberpunk-neon-core');
  assert.equal(context.materialPalette.valid, true);
  assert.equal(context.materialPalette.materials.neon, 'minecraft:sea_lantern');
  assert.equal(context.materialPalette.materials.glass, 'minecraft:cyan_stained_glass');
  assert.equal(context.facade.engine_hints.render_neon_trim, true);
  assert.equal(context.facade.window_system.glazing_ratio, 'high');
  assert.equal(context.roof.engine_hints.render_roof_garden, true);
  assert.equal(context.roof.engine_hints.render_neon_sign, true);
  assert.equal(context.site.engine_hints.render_water_edge, true);
  assert.equal(context.site.engine_hints.render_path_lights, true);
});

test('CSG consumes facade, roof, and site plans as real modules', () => {
  const context = buildAgentContext('建一个赛博朋克海边别墅，霓虹招牌，海晶灯，青色玻璃，屋顶花园');
  const counts = moduleCounts(context.shell.grid);

  assert.ok(counts.facade_light > 0);
  assert.ok(counts.facade_trim > 0);
  assert.ok(counts.roof_garden > 0);
  assert.ok(counts.roof_sign > 0);
  assert.ok(counts.landscape_path > 0);
  assert.ok(counts.path_light > 0);
  assert.equal(context.shell.csg.facade.elementCount > 0, true);
  assert.equal(context.shell.csg.roof.elementCount > 0, true);
  assert.equal(context.shell.csg.site.zoneCount > 0, true);
  assert.equal(context.shell.csg.roofPlan.elementCount > 0, true);
  assert.equal(context.shell.csg.sitePlan.zoneCount > 0, true);
});

test('expanded agents route utility, resilience, and landscape features into real modules', () => {
  const context = buildAgentContext('建一个工业风三层家庭住宅，宽31深21，太阳能屋顶，雨链，上人屋顶，老虎窗，遮阳棚，花箱，隐私格栅，通风管线，门牌，泳池，菜园，户外座椅，信箱，无障碍坡道，防火抗风');
  const counts = moduleCounts(context.shell.grid);

  assert.equal(context.stylePreset.id, 'industrial-loft-frame');
  assert.equal(context.architecture.roof_rules.solar_panels, true);
  assert.equal(context.architecture.roof_rules.rain_harvest, true);
  assert.equal(context.architecture.site_rules.accessible_route, true);
  assert.equal(context.architecture.structural_rules.resilience_flags.high_wind, true);
  assert.equal(context.architecture.structural_rules.resilience_flags.firebreak, true);
  assert.equal(context.facade.engine_hints.render_awnings, true);
  assert.equal(context.facade.engine_hints.render_flower_boxes, true);
  assert.equal(context.facade.engine_hints.render_service_vents, true);
  assert.equal(context.facade.engine_hints.render_address_marker, true);
  assert.equal(context.facade.engine_hints.render_privacy_fins, true);
  assert.equal(context.roof.engine_hints.render_solar_panels, true);
  assert.equal(context.roof.engine_hints.render_rain_collectors, true);
  assert.equal(context.roof.engine_hints.render_roof_access, true);
  assert.equal(context.roof.engine_hints.render_dormers, true);
  assert.equal(context.site.engine_hints.render_pool, true);
  assert.equal(context.site.engine_hints.render_planting_beds, true);
  assert.equal(context.site.engine_hints.render_outdoor_seating, true);
  assert.equal(context.site.engine_hints.render_mailbox, true);
  assert.equal(context.site.engine_hints.render_accessible_markers, true);
  assert.equal(context.structure.engine_hints.render_wind_ties, true);
  assert.equal(context.structure.engine_hints.render_firebreaks, true);
  assert.equal(context.structure.engine_hints.render_service_platform_frame, true);

  for (const module of [
    'awning',
    'flower_box',
    'service_vent',
    'address_marker',
    'privacy_fin',
    'solar_panel',
    'rain_chain',
    'rain_cistern',
    'roof_access',
    'dormer',
    'pool_edge',
    'pool_water',
    'planting_bed',
    'outdoor_living',
    'mailbox',
    'accessible_marker',
    'wind_tie',
    'firebreak',
    'roof_service_frame'
  ]) {
    assert.ok(counts[module] > 0, `expected ${module} module`);
  }
});

test('patio site plans reserve outdoor living modules', () => {
  const context = buildAgentContext('建一个湖边现代住宅，带面向水景的露台和前景花园');
  const counts = moduleCounts(context.shell.grid);

  assert.equal(context.architecture.site_rules.patio, true);
  assert.equal(context.site.engine_hints.render_outdoor_seating, true);
  assert.ok(counts.outdoor_living > 0);
});

test('template-guided sites render terrain layers and composed gardens', () => {
  const prompt = '建一个现代湖边别墅，带花园和自然地形';
  let architecture = buildFallbackArchitecture(prompt);
  const stylePreset = new StylePresetMemoryAgent().run(prompt, architecture);
  const materialPalette = new MaterialPaletteAgent().run(prompt, architecture, stylePreset);
  architecture = { ...architecture, materials: materialPalette.materials };
  let buildSpec = deriveBuildSpec(prompt, architecture);
  const templateKnowledge = {
    active: true,
    retrieved: [{ title: 'Lakehouse', file: 'House/Lakehouse.schematic' }],
    recommendations: {
      terrain_profile: 'non-flat-integrated',
      landscape_features: ['layered-terrain', 'rock-and-earth-base', 'garden-composition', 'water-edge', 'tree-and-shrub-clusters'],
      detail_density: 'high',
      design_priorities: ['treat terrain as part of the composition, not a flat base']
    },
    gap_priorities: ['replace flat-lot assumption with terrain-aware bases']
  };
  architecture = applyTemplateKnowledgeToArchitecture(architecture, templateKnowledge);
  buildSpec = applyTemplateKnowledgeToBuildSpec(buildSpec, templateKnowledge);

  const topology = buildFallbackTopology(prompt, architecture, buildSpec);
  const structure = new StructureAgent().run(architecture, buildSpec, topology);
  const facade = new FacadeAgent().run(prompt, architecture, buildSpec, topology, materialPalette, stylePreset);
  const roof = new RoofAgent().run(prompt, architecture, buildSpec, structure, facade, materialPalette, stylePreset);
  const site = new SiteLandscapeAgent().run(prompt, architecture, buildSpec, topology, materialPalette, stylePreset);
  const shell = new CSGBuilder(buildSpec, architecture.materials).generateShell(architecture, { structure, facade, roof, site });
  const counts = moduleCounts(shell.grid);

  assert.equal(site.engine_hints.render_layered_terrain, true);
  assert.equal(site.engine_hints.render_garden_composition, true);
  assert.equal(site.engine_hints.render_terrain_retaining, true);
  assert.ok(counts.terrain_surface > 0);
  assert.ok(counts.terrain_rock > 0);
  assert.ok(counts.retaining_edge > 0);
  assert.ok(counts.garden_axis > 0);
  assert.ok(counts.garden_room > 0);
  assert.ok(counts.garden_water > 0);
});

test('template composition strategy biases massing, facade, roof, and site modules', () => {
  const prompt = '建一个现代湖边别墅，带前景花园、水边平台、大玻璃和屋顶露台';
  let architecture = buildFallbackArchitecture(prompt);
  const stylePreset = new StylePresetMemoryAgent().run(prompt, architecture);
  const materialPalette = new MaterialPaletteAgent().run(prompt, architecture, stylePreset);
  architecture = { ...architecture, materials: materialPalette.materials };
  let buildSpec = deriveBuildSpec(prompt, architecture, 42);
  const templateKnowledge = {
    active: true,
    retrieved: [{ title: 'Modern Lake Villa', file: 'House/Modern Lake Villa.schematic' }],
    recommendations: {
      terrain_profile: 'non-flat-integrated',
      landscape_features: ['layered-terrain', 'rock-and-earth-base', 'garden-composition', 'water-edge'],
      detail_density: 'high',
      composition_strategy: {
        source: 'template-composition-strategy-v1',
        readiness: 'high',
        directives: {
          preferred_massing_variant: 'east-offset-glass-wing',
          preferred_facade_rhythm: 'horizontal-ribbon-breaks',
          preferred_roof_profile: 'thin-parapet-terrace',
          preferred_site_mood: 'reflecting-water-edge',
          use_large_view_glass: true,
          use_facade_depth: true,
          use_waterfront_transition: true,
          use_foreground_garden_sequence: true,
          use_layered_terrain_base: true,
          use_wings: true,
          lock_preferred_massing_variant: true,
          massing_intent: 'modern-waterfront',
          prompt_signals: {
            explicit_composition_request: true,
            water_requested: true,
            garden_requested: true,
            roof_terrace_requested: true,
            modern_waterfront_requested: true
          }
        }
      },
      design_priorities: ['compose foreground garden rooms before the main facade']
    },
    gap_priorities: ['learn whole-building composition']
  };
  architecture = applyTemplateKnowledgeToArchitecture(architecture, templateKnowledge);
  buildSpec = applyTemplateKnowledgeToBuildSpec(buildSpec, templateKnowledge);
  let topology = buildFallbackTopology(prompt, architecture, buildSpec);
  let creativeDesign = buildSeededCreativeDesign(prompt, architecture, buildSpec, topology);
  ({ architecture, buildSpec, topology, creativeDesign } = applyCreativeDesign({ architecture, buildSpec, topology, creativeDesign, prompt }));

  const structure = new StructureAgent().run(architecture, buildSpec, topology);
  const facade = new FacadeAgent().run(prompt, architecture, buildSpec, topology, materialPalette, stylePreset);
  const roof = new RoofAgent().run(prompt, architecture, buildSpec, structure, facade, materialPalette, stylePreset);
  const site = new SiteLandscapeAgent().run(prompt, architecture, buildSpec, topology, materialPalette, stylePreset);
  const shell = new CSGBuilder(buildSpec, architecture.materials).generateShell(architecture, { structure, facade, roof, site });
  const counts = moduleCounts(shell.grid);

  assert.ok(creativeDesign.signature.includes('template-composition'));
  assert.equal(creativeDesign.design_axes.massing_variant, 'east-offset-glass-wing');
  assert.ok(['horizontal-ribbon-breaks', 'corner-window-bands', 'asymmetric-panels', 'irregular-studio-grid'].includes(facade.window_system.rhythm));
  assert.equal(facade.window_system.glazing_ratio, 'high');
  assert.ok(['thin-parapet-terrace', 'stepped-flat-with-light-slot', 'service-flat-roof'].includes(roof.profile));
  assert.equal(site.engine_hints.render_template_approach_sequence, true);
  assert.equal(site.engine_hints.render_template_view_frame, true);
  assert.ok(counts.template_approach_path > 0);
  assert.ok(counts.template_entry_frame > 0);
  assert.ok(counts.template_view_frame > 0);
});

test('locked template massing prevents modern and classical prompts from sharing the same structure', () => {
  const modernPrompt = '建一个现代湖边别墅，带非平坦自然地形、前景花园、水边平台、大玻璃、屋顶露台';
  const classicalPrompt = '建一个古典庄园住宅，带对称立面、入口轴线花园、石质台地、喷泉水景、露台屋顶';

  const modern = applyPromptLockedMassing(modernPrompt, lockedTemplateKnowledge('east-offset-glass-wing', 'modern-waterfront'), pollutedCreativeDesign('formal-axis-manor'));
  const classical = applyPromptLockedMassing(classicalPrompt, lockedTemplateKnowledge('formal-axis-manor', 'formal-axis'), pollutedCreativeDesign('east-offset-glass-wing'));

  assert.equal(modern.creativeDesign.design_axes.massing_variant, 'east-offset-glass-wing');
  assert.equal(classical.creativeDesign.design_axes.massing_variant, 'formal-axis-manor');

  const modernIds = modern.architecture.volumes.map((volume) => volume.id);
  const classicalIds = classical.architecture.volumes.map((volume) => volume.id);
  assert.ok(modernIds.includes('glass-wing'));
  assert.ok(modernIds.includes('view-terrace'));
  assert.equal(modernIds.includes('entry-portico'), false);
  assert.equal(modernIds.includes('west-wing'), false);
  assert.ok(classicalIds.includes('west-wing'));
  assert.ok(classicalIds.includes('east-wing'));
  assert.ok(classicalIds.includes('entry-portico'));
  assert.ok(classicalIds.includes('rear-stone-terrace'));
  assert.equal(classicalIds.some((id) => /glass-wing|view-terrace/.test(id)), false);
  assert.notEqual(volumeSignature(modern.architecture.volumes), volumeSignature(classical.architecture.volumes));
});

test('opening, interior, and repair agents complete the post-layout contract', () => {
  const context = buildAgentContext('建一个悬崖边的现代住宅，悬挑观景平台，大玻璃，双开门');
  const layout = new BSPPartitioner(context.buildSpec, context.architecture.materials).fitRooms(context.shell, context.topology);
  const opening = new OpeningConnectivityAgent().run(context.prompt, context.architecture, context.buildSpec, context.topology, context.shell, layout, context.facade);
  const paths = new AStarPathfinder(context.buildSpec, context.architecture.materials).connect(context.shell, layout, context.topology, opening);
  const interior = new InteriorDetailAgent().run(layout.rooms, context.architecture, context.buildSpec, context.topology, context.materialPalette, context.stylePreset);
  const decorator = new ConstructionDecoratorAgent().run(layout.rooms, context.architecture.materials, {
    grid: context.shell.grid,
    buildSpec: context.buildSpec,
    architecture: context.architecture,
    topology: context.topology,
    paths,
    interior
  });
  const repair = new ConstraintRepairAgent().run({ grid: context.shell.grid, buildSpec: context.buildSpec, structure: context.structure, facade: context.facade, layout, paths, decorator });

  assert.ok(opening.main_entry.width >= 2);
  assert.equal(paths.pathfinder.plannedOpeningCount, opening.engine_hints.planned_opening_count);
  assert.equal(interior.room_count, layout.rooms.length);
  assert.equal(decorator.interior_source, 'local-interior-detail-agent');
  assert.equal(repair.ok, true);
});

function buildAgentContext(prompt) {
  let architecture = buildFallbackArchitecture(prompt);
  const stylePreset = new StylePresetMemoryAgent().run(prompt, architecture);
  const materialPalette = new MaterialPaletteAgent().run(prompt, architecture, stylePreset);
  architecture = { ...architecture, materials: materialPalette.materials };
  const buildSpec = deriveBuildSpec(prompt, architecture);
  const topology = buildFallbackTopology(prompt, architecture, buildSpec);
  const structure = new StructureAgent().run(architecture, buildSpec, topology);
  const facade = new FacadeAgent().run(prompt, architecture, buildSpec, topology, materialPalette, stylePreset);
  const roof = new RoofAgent().run(prompt, architecture, buildSpec, structure, facade, materialPalette, stylePreset);
  const site = new SiteLandscapeAgent().run(prompt, architecture, buildSpec, topology, materialPalette, stylePreset);
  const shell = new CSGBuilder(buildSpec, architecture.materials).generateShell(architecture, { structure, facade, roof, site });
  return { prompt, architecture, stylePreset, materialPalette, buildSpec, topology, structure, facade, roof, site, shell };
}

function moduleCounts(grid) {
  const counts = {};
  for (const item of grid.values()) counts[item.module] = (counts[item.module] || 0) + 1;
  return counts;
}

function applyPromptLockedMassing(prompt, templateKnowledge, creativeDesign) {
  let architecture = buildFallbackArchitecture(prompt);
  const stylePreset = new StylePresetMemoryAgent().run(prompt, architecture);
  const materialPalette = new MaterialPaletteAgent().run(prompt, architecture, stylePreset);
  architecture = { ...architecture, materials: materialPalette.materials };
  let buildSpec = deriveBuildSpec(prompt, architecture, 101);
  architecture = applyTemplateKnowledgeToArchitecture(architecture, templateKnowledge);
  buildSpec = applyTemplateKnowledgeToBuildSpec(buildSpec, templateKnowledge);
  let topology = buildFallbackTopology(prompt, architecture, buildSpec);
  return applyCreativeDesign({ architecture, buildSpec, topology, creativeDesign, prompt });
}

function lockedTemplateKnowledge(preferredMassingVariant, massingIntent) {
  const isModernWaterfront = massingIntent === 'modern-waterfront';
  return {
    active: true,
    recommendations: {
      composition_strategy: {
        source: 'template-composition-strategy-v1',
        readiness: 'high',
        directives: {
          preferred_massing_variant: preferredMassingVariant,
          preferred_facade_rhythm: isModernWaterfront ? 'horizontal-ribbon-breaks' : 'quiet-punched-windows',
          preferred_roof_profile: isModernWaterfront ? 'thin-parapet-terrace' : 'low-layered-eaves',
          preferred_site_mood: isModernWaterfront ? 'reflecting-water-edge' : 'ordered-entry-court',
          use_wings: true,
          use_large_view_glass: isModernWaterfront,
          use_waterfront_transition: isModernWaterfront,
          use_foreground_garden_sequence: true,
          use_courtyard_or_patio_void: true,
          lock_preferred_massing_variant: true,
          massing_intent: massingIntent,
          prompt_signals: {
            explicit_composition_request: true,
            water_requested: isModernWaterfront,
            garden_requested: true,
            formal_axis_requested: !isModernWaterfront,
            modern_waterfront_requested: isModernWaterfront
          }
        }
      }
    }
  };
}

function pollutedCreativeDesign(variant) {
  const formal = variant === 'formal-axis-manor';
  return {
    signature: `polluted-${variant}`,
    design_axes: {
      massing_variant: variant,
      massing_label: variant,
      public_core: 'living',
      split_strategy: formal ? 'axis-balanced' : 'open-plan-weighted',
      composition_bias: formal ? 'balanced-wings' : 'east-weighted'
    },
    volume_directives: formal ? [
      pollutedVolume('west-wing', [0.34, 0.92, 0.58], 'attached-west', ['formal-pair', 'wing']),
      pollutedVolume('east-wing', [0.34, 0.92, 0.58], 'attached-east', ['formal-pair', 'wing']),
      pollutedVolume('entry-portico', [0.38, 0.48, 0.2], 'front-center', ['formal-axis', 'columned-entry'])
    ] : [
      pollutedVolume('glass-wing', [0.4, 0.7, 0.52], 'attached-east-rear', ['glass-wing', 'offset-mass']),
      pollutedVolume('view-terrace', [0.5, 0.24, 0.24], 'attached-south', ['deck', 'view-platform'])
    ],
    facade: {
      window_rhythm: formal ? 'quiet-punched-windows' : 'horizontal-ribbon-breaks',
      glazing_ratio: formal ? 'medium' : 'high'
    },
    roof: { style: formal ? 'hipped' : 'flat', profile: formal ? 'low-layered-eaves' : 'thin-parapet-terrace' },
    site: { mood: formal ? 'ordered-entry-court' : 'reflecting-water-edge' },
    interior: {},
    topology: {}
  };
}

function pollutedVolume(id, scale, relation, tags) {
  return {
    id,
    action: 'add',
    role: id,
    shape: 'box',
    scale,
    placement: { relation, attach_to: 'main' },
    boolean_mode: 'union',
    tags
  };
}

function volumeSignature(volumes = []) {
  return volumes
    .map((volume) => `${volume.id}:${volume.scale?.join(',')}:${volume.placement?.relation}`)
    .sort()
    .join('|');
}
