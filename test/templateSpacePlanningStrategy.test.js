import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackArchitecture } from '../src/construction/agents/architectAgent.js';
import { buildFallbackTopology } from '../src/construction/agents/plannerAgent.js';
import { buildSeededCreativeDesign, applyCreativeDesign } from '../src/construction/agents/creativeDesignAgent.js';
import { CSGBuilder } from '../src/construction/engine/csgBuilder.js';
import { BSPPartitioner } from '../src/construction/engine/bspPartitioner.js';
import { deriveBuildSpec } from '../src/construction/workflow.js';

test('template space planning turns composition grammar into room orientation and topology hints', () => {
  const prompt = '建一个现代湖边别墅，带前景花园、水边平台、大玻璃和屋顶露台，客厅、开放厨房、卧室和书房';
  const architecture = withLakeVillaComposition(buildFallbackArchitecture(prompt));
  const buildSpec = deriveBuildSpec(prompt, architecture, 7);
  const topology = buildFallbackTopology(prompt, architecture, buildSpec);
  const living = topology.nodes.find((node) => node.id === 'living');
  const kitchen = topology.nodes.find((node) => node.id === 'kitchen');
  const study = topology.nodes.find((node) => node.type === 'study');

  assert.equal(topology.template_space_plan.active, true);
  assert.equal(topology.template_space_plan.view_side, 'south');
  assert.equal(topology.template_space_plan.service_side, 'west');
  assert.ok(topology.template_space_plan.entry_sequence.thresholds.length >= 5);
  assert.ok(topology.template_space_plan.entry_sequence.thresholds.includes('porch-threshold'));
  assert.equal(topology.bsp_hints.template_space_planning_active, true);
  assert.equal(topology.bsp_hints.split_strategy, 'view-side-cluster');
  assert.ok(topology.bsp_hints.room_order_by_floor[0].includes('living'));
  assert.equal(living.orientation, 'south');
  assert.equal(living.daylight, 'high');
  assert.ok(living.tags.includes('template-public-view-axis'));
  assert.equal(kitchen.orientation, 'west');
  assert.ok(kitchen.tags.includes('template-service-band'));
  assert.equal(study.orientation, 'north');
  assert.ok(topology.edges.some((edge) => edge.relation === 'template-entry-to-public-core'));
  assert.ok(topology.site_connections.some((item) => item.to === 'water_edge'));
  assert.ok(topology.facade_alignment.template_public_view_rooms.includes('living'));
});

test('template space planning stays active for reference transfer without explicit composition words', () => {
  const prompt = '按模板库顶级房子强参考复现：建一个现代别墅，客厅、开放厨房、卧室和书房';
  const architecture = withLakeVillaComposition(buildFallbackArchitecture(prompt), { referenceTransferOnly: true });
  const buildSpec = deriveBuildSpec(prompt, architecture, 17);
  const topology = buildFallbackTopology(prompt, architecture, buildSpec);

  assert.equal(topology.template_space_plan.active, true);
  assert.equal(topology.template_space_plan.view_side, 'south');
  assert.equal(topology.bsp_hints.template_space_planning_active, true);
  assert.ok(topology.site_connections.some((item) => item.to === 'water_edge'));
  assert.ok(topology.facade_alignment.template_public_view_rooms.includes('living'));
});

test('template space planning survives creative design and biases BSP room placement', () => {
  const prompt = '建一个现代湖边别墅，带前景花园、水边平台、大玻璃和屋顶露台，客厅、开放厨房、卧室和书房';
  let architecture = withLakeVillaComposition(buildFallbackArchitecture(prompt));
  let buildSpec = deriveBuildSpec(prompt, architecture, 1997941929);
  let topology = buildFallbackTopology(prompt, architecture, buildSpec);
  const creativeDesign = buildSeededCreativeDesign(prompt, architecture, buildSpec, topology);
  ({ architecture, buildSpec, topology } = applyCreativeDesign({ architecture, buildSpec, topology, creativeDesign, prompt }));

  const shell = new CSGBuilder(buildSpec, architecture.materials).generateShell(architecture);
  const layout = new BSPPartitioner(buildSpec, architecture.materials).fitRooms(shell, topology);
  const living = layout.rooms.find((room) => room.id === 'living');
  const kitchen = layout.rooms.find((room) => room.id === 'kitchen');

  assert.equal(topology.template_space_plan.active, true);
  assert.equal(layout.bsp.templateSpacePlanning.active, true);
  assert.equal(layout.bsp.templateSpacePlanning.viewSide, 'south');
  assert.equal(layout.bsp.unassignedPlannerNodes.includes('living'), false);
  assert.ok(living);
  assert.ok(living.tags.includes('template-view-facing'));
  assert.ok(kitchen.tags.includes('template-service-band'));
  assert.ok(living.max_z >= kitchen.max_z, 'public view room should sit no farther from the south view edge than the kitchen');
});

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
      reference_reproduction_strength: referenceTransferOnly ? 'high' : 'low',
      prompt_signals: {
        explicit_composition_request: !referenceTransferOnly,
        reference_transfer: referenceTransferOnly,
        water_requested: !referenceTransferOnly,
        garden_requested: !referenceTransferOnly,
        terrain_requested: false,
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
