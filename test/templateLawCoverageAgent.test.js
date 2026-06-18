import test from 'node:test';
import assert from 'node:assert/strict';
import { TemplateLawCoverageAgent } from '../src/construction/agents/templateLawCoverageAgent.js';

test('TemplateLawCoverageAgent stays inactive without template design law runtime', () => {
  const coverage = new TemplateLawCoverageAgent().run({ prompt: '建一个普通小屋' });

  assert.equal(coverage.active, false);
  assert.equal(coverage.grade, 'not-applicable');
  assert.deepEqual(coverage.repair_directives, []);
});

test('TemplateLawCoverageAgent scores law execution across site, roof, interior, and decorator', () => {
  const coverage = new TemplateLawCoverageAgent().run(fullCoverageBlueprint());

  assert.equal(coverage.active, true);
  assert.ok(coverage.percent >= 90);
  assert.ok(coverage.checks.some((item) => item.id === 'waterfront-threshold' && item.status === 'satisfied'));
  assert.ok(coverage.checks.some((item) => item.id === 'roof-usable-terrace' && item.status === 'satisfied'));
  assert.ok(coverage.checks.some((item) => item.id === 'room-identity-stack' && item.status === 'satisfied'));
  assert.ok(coverage.metrics.design_law_placement_count >= 20);
  assert.equal(coverage.repair_plan.active, false);
});

test('TemplateLawCoverageAgent emits repair directives for missing law obligations', () => {
  const blueprint = fullCoverageBlueprint();
  blueprint.site.template_site_scenes.scene_types = ['entry-approach-scene'];
  blueprint.topology.site_connections = [];
  blueprint.modules = { roof: 20 };
  blueprint.decorator.capability_profile.supports_template_design_laws = false;
  blueprint.decorator.capability_profile.template_design_law_placement_count = 0;
  blueprint.decorator.placements = [];

  const coverage = new TemplateLawCoverageAgent().run(blueprint);

  assert.equal(coverage.active, true);
  assert.ok(coverage.percent < 75);
  assert.ok(coverage.gaps.some((item) => item.id === 'waterfront-threshold'));
  assert.ok(coverage.gaps.some((item) => item.id === 'decorator-design-law-layer'));
  assert.equal(coverage.repair_plan.active, true);
  assert.ok(coverage.repair_directives.some((item) => item.id === 'repair-waterfront-threshold'));
  assert.ok(coverage.regeneration_prompt_addendum.length > 0);
});

function fullCoverageBlueprint() {
  const laws = [
    law('site-waterfront-public-threshold', 'site', 'Water edge public rooms align with deck and view.'),
    law('site-foreground-garden-rooms', 'site', 'Foreground garden rooms frame entry.'),
    law('site-terrain-plinth-sequence', 'site', 'Non-flat terrain becomes stone and earth plinth.'),
    law('facade-glass-view-axis', 'facade', 'Large glass must attach to public view axis.'),
    law('roof-usable-terrace-system', 'roof', 'Flat roof terrace needs access, rail, seating, and view edge.'),
    law('interior-room-identity-layer-stack', 'interior', 'Important rooms need focal wall, anchor, storage, soft detail, and layered lighting.')
  ];
  const obligations = [
    obligation('living', 'living', ['social_cluster', 'layered_lighting']),
    obligation('kitchen', 'kitchen', ['kitchen_work_wall', 'layered_lighting']),
    obligation('bedroom', 'bedroom', ['sleep_niche', 'layered_lighting']),
    obligation('study', 'study', ['library_focus_wall', 'display_wall', 'layered_lighting'])
  ];
  return {
    architecture: {
      generation_hints: {
        template_design_law_pack: {
          active: true,
          selected_laws: laws,
          interior_laws: laws.slice(5),
          implementation_clauses: laws.map((item) => item.rule)
        }
      }
    },
    templateKnowledge: {
      recommendations: {
        design_law_pack: { active: true, selected_laws: laws, interior_laws: laws.slice(5) },
        design_laws: laws,
        interior_design_laws: laws.slice(5),
        design_law_clauses: laws.map((item) => item.rule)
      }
    },
    topology: {
      template_design_law_runtime: {
        active: true,
        selected_laws: laws,
        interior_laws: laws.slice(5),
        implementation_clauses: laws.map((item) => item.rule),
        topology_directives: {
          public_view_axis: true,
          waterfront_threshold: true,
          foreground_garden_sequence: true,
          layered_terrain_arrival: true,
          large_glass_view_axis: true,
          roof_terrace_access_required: true
        },
        room_obligations: obligations
      },
      circulation_rules: { roof_terrace_access_required: true },
      facade_alignment: {
        template_design_law_public_view_axis: true,
        template_design_law_view_rooms: ['living', 'dining'],
        glass_priority_rooms: ['living', 'dining']
      },
      site_connections: [
        { from: 'living', to: 'water_edge', relation: 'template-design-law-public-water-threshold' },
        { from: 'entry', to: 'foreground_garden', relation: 'template-design-law-garden-arrival' },
        { from: 'entry', to: 'terrain_plinth', relation: 'template-design-law-stepped-arrival' },
        { from: 'living', to: 'roof_terrace', relation: 'template-design-law-roof-terrace-access' }
      ],
      bsp_hints: { terrain_plinth_sequence: 'stone-earth-garden-approach' }
    },
    opening: {
      engine_hints: { template_view_opening_count: 3 },
      window_openings: [{ template_role: 'view-glass', glazing_ratio: 'high' }],
      view_thresholds: [{ room_id: 'living' }, { room_id: 'dining' }]
    },
    roof: {
      profile: 'thin-parapet-terrace',
      elements: [{ kind: 'roof-access' }, { kind: 'roof-garden' }]
    },
    site: {
      template_site_scenes: {
        active: true,
        scene_count: 5,
        scene_types: [
          'entry-approach-scene',
          'terrain-plinth-scene',
          'forecourt-garden-room-scene',
          'water-edge-deck-scene',
          'grove-edge-scene'
        ]
      }
    },
    interior: {
      engine_hints: { use_template_design_laws: true },
      template_design_law_runtime: { active: true, room_obligations: obligations },
      template_room_experience: {
        room_experiences: [{ room_id: 'living', role: 'public-view' }],
        opening_plan: { public_view_rooms: ['living', 'dining'] }
      },
      room_details: ['living', 'kitchen', 'bedroom', 'study'].map((id) => ({
        room_id: id,
        type: id,
        template_design_law: { active: true },
        template_design_law_clause_ids: ['design-law-room-identity-stack'],
        semantic_clause_ids: ['design-law-room-identity-stack']
      }))
    },
    decorator: {
      capability_profile: {
        supports_template_room_patterns: true,
        supports_template_design_laws: true,
        template_pattern_placement_count: 40,
        template_design_law_placement_count: 24
      },
      placements: [
        role('template-view-seat'),
        role('template-scene-sofa-primary'),
        role('template-pattern-seat'),
        role('template-pattern-rug'),
        role('template-pattern-range'),
        role('template-pattern-prep'),
        role('template-pattern-bedside'),
        role('template-pattern-library'),
        role('template-pattern-desk'),
        role('template-pattern-display'),
        role('template-pattern-layered-light'),
        role('design-law-focal-wall'),
        role('design-law-task-light'),
        role('design-law-social-anchor'),
        role('design-law-work-wall-light'),
        role('design-law-bedside-soft-light'),
        role('design-law-focus-wall-light')
      ]
    },
    modules: {
      template_site_water_deck: 20,
      template_site_reflection_water: 18,
      template_site_water_edge: 16,
      template_site_garden_room: 18,
      template_site_planting_room: 18,
      template_site_entry_approach: 14,
      template_site_threshold_frame: 8,
      template_site_earth_terrace: 30,
      template_site_stone_plinth: 24,
      template_site_retaining_edge: 16,
      roof: 90,
      roof_detail: 20
    }
  };
}

function law(id, domain, rule) {
  return {
    id,
    domain,
    rule,
    implementation_clauses: [rule],
    prompt_affinities: ['modern', 'lake', 'interior'],
    applies_to: ['site', 'interior', 'room']
  };
}

function obligation(roomId, roomType, patternTypes) {
  return {
    active: true,
    room_id: roomId,
    room_type: roomType,
    pattern_types: patternTypes,
    semantic_clauses: [{ id: 'design-law-room-identity-stack' }]
  };
}

function role(value) {
  return { role: value };
}
