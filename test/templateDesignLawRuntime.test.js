import test from 'node:test';
import assert from 'node:assert/strict';
import { ConstructionDecoratorAgent } from '../src/construction/agents/decoratorAgent.js';
import { InteriorDetailAgent } from '../src/construction/agents/interiorDetailAgent.js';
import {
  applyTemplateDesignLawRuntimeToTopology,
  buildTemplateDesignLawRuntime,
  extractTemplateDesignLawPack
} from '../src/construction/agents/templateDesignLawRuntime.js';

test('Template design law runtime keeps empty loose law fields inactive', () => {
  const pack = extractTemplateDesignLawPack({
    generation_hints: {
      template_design_law_pack: { active: false, selected_laws: [], interior_laws: [], implementation_clauses: [] },
      template_design_laws: [],
      template_interior_design_laws: [],
      template_design_law_clauses: []
    }
  }, {});
  const runtime = buildTemplateDesignLawRuntime({
    architecture: { generation_hints: { template_design_laws: [], template_design_law_clauses: [] } },
    topology: { nodes: [{ id: 'living', type: 'living' }] }
  });

  assert.equal(pack.active, false);
  assert.equal(runtime.active, false);
});

test('Template design law runtime converts selected laws into topology directives', () => {
  const rooms = designLawRooms().map(({ min_x, max_x, min_y, max_y, min_z, max_z, ...node }) => node);
  const architecture = designLawArchitecture();
  const buildSpec = { style_family: 'modern', floors: 1, design: { template_design_law_pack: designLawPack() } };
  const topology = {
    nodes: rooms,
    edges: [],
    facade_alignment: {},
    site_connections: [],
    circulation_rules: {},
    bsp_hints: {}
  };

  const runtime = buildTemplateDesignLawRuntime({ architecture, buildSpec, topology, rooms });
  const enhanced = applyTemplateDesignLawRuntimeToTopology(topology, { prompt: '现代湖边别墅，大玻璃，屋顶露台，前景花园，非平坦地形', architecture, buildSpec });

  assert.equal(runtime.active, true);
  assert.ok(runtime.topology_directives.public_view_axis);
  assert.ok(runtime.topology_directives.roof_terrace_access_required);
  assert.ok(runtime.room_obligations.some((item) => item.room_id === 'living' && item.pattern_types.includes('social_cluster')));
  assert.equal(enhanced.template_design_law_runtime.active, true);
  assert.ok(enhanced.facade_alignment.glass_priority_rooms.includes('living'));
  assert.ok(enhanced.site_connections.some((item) => item.to === 'water_edge'));
  assert.ok(enhanced.site_connections.some((item) => item.to === 'foreground_garden'));
  assert.ok(enhanced.site_connections.some((item) => item.to === 'terrain_plinth'));
  assert.ok(enhanced.site_connections.some((item) => item.to === 'roof_terrace'));
  assert.equal(enhanced.bsp_hints.template_design_law_active, true);
});

test('InteriorDetailAgent and DecoratorAgent execute template design laws', () => {
  const rooms = designLawRooms();
  const architecture = designLawArchitecture();
  const buildSpec = { style_family: 'modern', floors: 1, design: { template_design_law_pack: designLawPack() } };
  const topology = applyTemplateDesignLawRuntimeToTopology({
    nodes: rooms.map(({ min_x, max_x, min_y, max_y, min_z, max_z, ...node }) => node),
    edges: [],
    facade_alignment: {},
    site_connections: [],
    circulation_rules: {},
    bsp_hints: {}
  }, { prompt: '现代湖边别墅，顶级内饰，大玻璃，屋顶露台', architecture, buildSpec });

  const interior = new InteriorDetailAgent().run(rooms, architecture, buildSpec, topology, { materials: architecture.materials }, {});
  const decorator = new ConstructionDecoratorAgent().run(rooms, architecture.materials, { architecture, buildSpec, topology, interior });
  const living = interior.room_details.find((detail) => detail.room_id === 'living');
  const kitchen = interior.room_details.find((detail) => detail.room_id === 'kitchen');
  const bedroom = interior.room_details.find((detail) => detail.room_id === 'bedroom');
  const study = interior.room_details.find((detail) => detail.room_id === 'study');
  const roles = new Set(decorator.placements.map((item) => item.role));

  assert.equal(interior.engine_hints.use_template_design_laws, true);
  assert.equal(interior.template_design_law_runtime.active, true);
  assert.ok(living.semantic_clause_ids.includes('design-law-living-social-core'));
  assert.ok(kitchen.semantic_clause_ids.includes('design-law-kitchen-work-wall'));
  assert.ok(bedroom.template_room_patterns.guidance.some((item) => item.pattern_type === 'sleep_niche'));
  assert.ok(study.template_room_patterns.design_law_pattern_types.includes('library_focus_wall'));
  assert.equal(decorator.capability_profile.supports_template_design_laws, true);
  assert.ok(decorator.capability_profile.template_design_law_placement_count >= 8);
  assert.ok(roles.has('template-pattern-range'));
  assert.ok(roles.has('template-pattern-seat'));
  assert.ok(roles.has('design-law-focal-wall'));
  assert.ok(roles.has('design-law-task-light'));
  assert.ok(roles.has('design-law-work-wall-light'));
});

function designLawArchitecture() {
  const pack = designLawPack();
  return {
    style_family: 'modern',
    materials: {
      lamp: 'minecraft:sea_lantern',
      accent: 'minecraft:smooth_quartz',
      trim: 'minecraft:quartz_slab',
      furniture: 'minecraft:barrel',
      plant: 'minecraft:potted_azalea_bush'
    },
    generation_hints: { template_design_law_pack: pack },
    detail_rules: { template_design_law_pack: pack },
    template_knowledge: {
      active: true,
      recommendations: {
        design_law_pack: pack,
        design_laws: pack.selected_laws,
        interior_design_laws: pack.interior_laws,
        design_law_clauses: pack.implementation_clauses,
        template_interior_pattern_strength: 'high',
        room_pattern_guidance: []
      }
    }
  };
}

function designLawPack() {
  return {
    source: 'test-design-law-pack',
    active: true,
    selected_count: 5,
    interior_selected_count: 6,
    selected_laws: [
      law('site-waterfront-public-threshold', 'site', 'Water edge public rooms align with deck and view.'),
      law('site-foreground-garden-rooms', 'site', 'Foreground garden rooms frame the approach.'),
      law('site-terrain-plinth-sequence', 'site', 'Non-flat terrain needs stone and earth plinth arrival.'),
      law('facade-glass-view-axis', 'facade', 'Large glass must attach to public view axis.'),
      law('roof-usable-terrace-system', 'roof', 'Flat roof terrace needs access, rail, seating, and view edge.'),
      law('interior-room-identity-layer-stack', 'interior', 'Every important room needs identity stack: focal wall, functional anchor, storage/display, textiles/plants, layered lighting.')
    ],
    interior_laws: [
      law('room-living-template-grammar', 'room', 'Living rooms need social_cluster, focal wall, view seat, rug, and accent light.'),
      law('room-kitchen-template-grammar', 'room', 'Kitchen rooms need kitchen_work_wall, prep counter, pantry, and task light.'),
      law('room-bedroom-template-grammar', 'room', 'Bedroom rooms need sleep_niche, bedside pair, wardrobe, rug, and reading light.'),
      law('room-study-template-grammar', 'room', 'Study rooms need library_focus_wall, desk focus, archive storage, and reading light.'),
      law('interior-pattern-social-cluster', 'interior', 'Social rooms use social_cluster furniture groups.'),
      law('interior-pattern-library-focus-wall', 'interior', 'Studies use library_focus_wall and display_wall.')
    ],
    implementation_clauses: [
      'place living/dining/lounge rooms on the water/view side',
      'connect public rooms to a deck, terrace, pier, or reflection basin',
      'reserve a foreground zone before the facade',
      'build a layered stone/earth base before placing the main shell',
      'assign large glass to living/dining/lounge or stair reveal zones',
      'include stair or internal access logic to the roof terrace',
      'give each room one focal wall or task wall before adding loose decor',
      'combine functional anchor + storage/display + lighting + soft detail'
    ]
  };
}

function law(id, domain, rule) {
  return {
    id,
    domain,
    priority: 'critical',
    confidence: 95,
    rule,
    implementation_clauses: [rule],
    applies_to: ['interior', 'room-detail'],
    prompt_affinities: ['modern', 'lake', 'interior']
  };
}

function designLawRooms() {
  return [
    { id: 'entry', type: 'entry', min_x: 0, max_x: 5, min_y: 1, max_y: 4, min_z: 0, max_z: 5, zone: 'public' },
    { id: 'living', type: 'living', min_x: 7, max_x: 18, min_y: 1, max_y: 5, min_z: 0, max_z: 9, zone: 'public' },
    { id: 'kitchen', type: 'kitchen', min_x: 0, max_x: 8, min_y: 1, max_y: 4, min_z: 7, max_z: 14, zone: 'service' },
    { id: 'bedroom', type: 'bedroom', min_x: 10, max_x: 18, min_y: 1, max_y: 4, min_z: 11, max_z: 18, zone: 'private' },
    { id: 'study', type: 'study', min_x: 20, max_x: 27, min_y: 1, max_y: 4, min_z: 0, max_z: 7, zone: 'private' }
  ];
}
