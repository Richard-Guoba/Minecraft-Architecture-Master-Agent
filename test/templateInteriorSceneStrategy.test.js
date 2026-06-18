import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackArchitecture } from '../src/construction/agents/architectAgent.js';
import { buildFallbackTopology } from '../src/construction/agents/plannerAgent.js';
import { buildSeededCreativeDesign, applyCreativeDesign } from '../src/construction/agents/creativeDesignAgent.js';
import { InteriorDetailAgent } from '../src/construction/agents/interiorDetailAgent.js';
import { ConstructionDecoratorAgent } from '../src/construction/agents/decoratorAgent.js';
import { CSGBuilder } from '../src/construction/engine/csgBuilder.js';
import { BSPPartitioner } from '../src/construction/engine/bspPartitioner.js';
import { deriveBuildSpec } from '../src/construction/workflow.js';

test('template interior scene strategy composes room-scale furniture groups', () => {
  const context = buildTemplateInteriorSceneContext();
  const interior = new InteriorDetailAgent().run(
    context.layout.rooms,
    context.architecture,
    context.buildSpec,
    context.topology,
    { materials: context.architecture.materials },
    {}
  );
  const decorator = new ConstructionDecoratorAgent().run(context.layout.rooms, context.architecture.materials, {
    buildSpec: context.buildSpec,
    architecture: context.architecture,
    topology: context.topology,
    interior
  });

  const livingDetail = interior.room_details.find((detail) => detail.room_id === 'living');
  const diningDetail = interior.room_details.find((detail) => detail.type === 'dining');
  const kitchenDetail = interior.room_details.find((detail) => detail.room_id === 'kitchen');
  const bedroomDetail = interior.room_details.find((detail) => ['bedroom', 'master_bedroom'].includes(detail.type));
  const studyDetail = interior.room_details.find((detail) => detail.type === 'study');
  const roles = new Set(decorator.placements.map((item) => item.role));

  assert.equal(interior.template_interior_scenes.active, true);
  assert.equal(interior.engine_hints.use_template_interior_scenes, true);
  assert.ok(interior.template_interior_scenes.room_scene_count >= 5);
  assert.ok(interior.template_interior_scenes.scene_types.includes('view-lounge-scene'));
  assert.ok(interior.template_interior_scenes.scene_types.includes('kitchen-island-scene'));
  assert.equal(livingDetail.template_interior_scene.scene_type, 'view-lounge-scene');
  assert.ok(livingDetail.template_scene_component_ids.includes('sofa_group'));
  assert.ok(diningDetail.template_scene_component_ids.includes('dining_table'));
  assert.equal(kitchenDetail.template_interior_scene.scene_type, 'kitchen-island-scene');
  assert.ok(kitchenDetail.template_scene_component_ids.includes('kitchen_island'));
  assert.equal(bedroomDetail.template_interior_scene.scene_type, 'sleep-suite-scene');
  assert.ok(studyDetail.template_scene_component_ids.includes('bookcase_wall'));
  assert.equal(decorator.capability_profile.supports_template_interior_scenes, true);
  assert.ok(decorator.capability_profile.template_interior_scene_placement_count >= 20);
  assert.ok(decorator.placements.some((item) => item.room_id === 'living' && item.role === 'template-scene-sofa-primary' && /facing=south/.test(item.block)));
  assert.ok(roles.has('template-scene-coffee-table'));
  assert.ok(roles.has('template-scene-dining-table'));
  assert.ok(roles.has('template-scene-kitchen-island'));
  assert.ok(roles.has('template-scene-bar-stool'));
  assert.ok(roles.has('template-scene-bed-headboard'));
  assert.ok(roles.has('template-scene-study-bookcase'));
});

function buildTemplateInteriorSceneContext() {
  const prompt = '建一个现代湖边别墅，带前景花园、水边平台、大玻璃和屋顶露台，客厅、开放厨房、餐厅、卧室和书房';
  let architecture = withLakeVillaComposition(buildFallbackArchitecture(prompt));
  let buildSpec = deriveBuildSpec(prompt, architecture, 1997941929);
  let topology = buildFallbackTopology(prompt, architecture, buildSpec);
  const creativeDesign = buildSeededCreativeDesign(prompt, architecture, buildSpec, topology);
  ({ architecture, buildSpec, topology } = applyCreativeDesign({ architecture, buildSpec, topology, creativeDesign, prompt }));
  const shell = new CSGBuilder(buildSpec, architecture.materials).generateShell(architecture);
  const layout = new BSPPartitioner(buildSpec, architecture.materials).fitRooms(shell, topology);
  return { prompt, architecture, buildSpec, topology, shell, layout };
}

function withLakeVillaComposition(architecture) {
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
        explicit_composition_request: true,
        water_requested: true,
        garden_requested: true,
        terrain_requested: false,
        roof_terrace_requested: true
      }
    },
    massing_patterns: [{ pattern_type: 'long_bar', confidence: 84 }],
    approach_sequence: [{ pattern_type: 'garden_forecourt', confidence: 82 }, { pattern_type: 'waterfront_transition', confidence: 80 }],
    facade_rhythm: [{ pattern_type: 'large_glass_bands', confidence: 90 }],
    roof_composition: [{ pattern_type: 'flat_terrace_or_platform', confidence: 78 }],
    site_composition: [{ pattern_type: 'water_edge', confidence: 88 }, { pattern_type: 'garden_rooms', confidence: 80 }],
    view_and_landmark_rules: [{ pattern_type: 'orient_public_rooms_to_view', confidence: 86 }]
  };
  return {
    ...architecture,
    generation_hints: {
      ...(architecture.generation_hints || {}),
      template_composition_strategy: compositionStrategy
    },
    massing_rules: {
      ...(architecture.massing_rules || {}),
      template_composition_strategy: compositionStrategy
    },
    site_rules: {
      ...(architecture.site_rules || {}),
      template_composition_strategy: compositionStrategy
    }
  };
}
