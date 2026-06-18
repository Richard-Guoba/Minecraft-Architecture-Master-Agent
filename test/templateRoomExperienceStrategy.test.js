import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackArchitecture } from '../src/construction/agents/architectAgent.js';
import { buildFallbackTopology } from '../src/construction/agents/plannerAgent.js';
import { buildSeededCreativeDesign, applyCreativeDesign } from '../src/construction/agents/creativeDesignAgent.js';
import { OpeningConnectivityAgent } from '../src/construction/agents/openingConnectivityAgent.js';
import { InteriorDetailAgent } from '../src/construction/agents/interiorDetailAgent.js';
import { ConstructionDecoratorAgent } from '../src/construction/agents/decoratorAgent.js';
import { CSGBuilder } from '../src/construction/engine/csgBuilder.js';
import { BSPPartitioner } from '../src/construction/engine/bspPartitioner.js';
import { deriveBuildSpec } from '../src/construction/workflow.js';

test('template room experience strategy drives openings, room details, and furnishings', () => {
  const context = buildTemplateExperienceContext();
  const opening = new OpeningConnectivityAgent().run(
    context.prompt,
    context.architecture,
    context.buildSpec,
    context.topology,
    context.shell,
    context.layout,
    context.facade
  );
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
  const kitchenDetail = interior.room_details.find((detail) => detail.room_id === 'kitchen');
  const studyDetail = interior.room_details.find((detail) => detail.type === 'study');

  assert.equal(opening.template_room_experience.active, true);
  assert.ok(opening.window_openings.some((item) => item.template_role === 'view-glass' && item.side === 'south' && item.priority_rooms.includes('living')));
  assert.ok(opening.view_thresholds.some((item) => item.room_id === 'living' && item.side === 'south'));
  assert.equal(opening.engine_hints.template_view_opening_count > 0, true);
  assert.equal(interior.engine_hints.use_template_room_experience, true);
  assert.equal(livingDetail.template_experience.role, 'public-view');
  assert.equal(livingDetail.template_experience.primary_window_side, 'south');
  assert.equal(kitchenDetail.template_experience.role, 'service-band');
  assert.equal(kitchenDetail.template_experience.anchor_wall, 'west');
  assert.equal(studyDetail.template_experience.role, 'quiet-retreat');
  assert.equal(decorator.capability_profile.supports_template_room_experience, true);
  assert.ok(decorator.placements.some((item) => item.room_id === 'living' && item.role === 'template-view-seat' && /facing=south/.test(item.block)));
  assert.ok(decorator.placements.some((item) => item.room_id === 'living' && item.role === 'template-view-frame-interior'));
  assert.ok(decorator.placements.some((item) => item.type === 'kitchen' && item.role === 'template-service-wall'));
  assert.ok(decorator.placements.some((item) => item.type === 'study' && item.role === 'template-quiet-desk'));
  assert.ok(decorator.placements.some((item) => item.type === 'entry' && item.role === 'template-entry-runner'));
});

function buildTemplateExperienceContext() {
  const prompt = '建一个现代湖边别墅，带前景花园、水边平台、大玻璃和屋顶露台，客厅、开放厨房、卧室和书房';
  let architecture = withLakeVillaComposition(buildFallbackArchitecture(prompt));
  let buildSpec = deriveBuildSpec(prompt, architecture, 1997941929);
  let topology = buildFallbackTopology(prompt, architecture, buildSpec);
  const creativeDesign = buildSeededCreativeDesign(prompt, architecture, buildSpec, topology);
  ({ architecture, buildSpec, topology } = applyCreativeDesign({ architecture, buildSpec, topology, creativeDesign, prompt }));
  const shell = new CSGBuilder(buildSpec, architecture.materials).generateShell(architecture);
  const layout = new BSPPartitioner(buildSpec, architecture.materials).fitRooms(shell, topology);
  const facade = {
    front_side: 'south',
    window_system: { rhythm: 'horizontal-ribbon-breaks', glazing_ratio: 'high', width: 4, height: 2, spacing: 4 }
  };
  return { prompt, architecture, buildSpec, topology, shell, layout, facade };
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
    }
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
