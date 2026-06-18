import test from 'node:test';
import assert from 'node:assert/strict';
import { TemplateAssimilationAuditAgent } from '../src/construction/agents/templateAssimilationAuditAgent.js';

test('TemplateAssimilationAuditAgent stays inactive without template signals', () => {
  const audit = new TemplateAssimilationAuditAgent().run({ prompt: 'plain house' });

  assert.equal(audit.active, false);
  assert.equal(audit.reason, 'no-template-assimilation-signal');
  assert.equal(audit.stage_progress.total_count, 6);
});

test('TemplateAssimilationAuditAgent recognizes a closed-loop top-tier template pipeline', () => {
  const audit = new TemplateAssimilationAuditAgent().run(topTierBlueprint());

  assert.equal(audit.active, true);
  assert.equal(audit.grade, 'top-tier-closed-loop');
  assert.equal(audit.readiness, 'top-tier-ready');
  assert.ok(audit.percent >= 96);
  assert.ok(audit.top_tier_distance <= 4);
  assert.equal(audit.stage_progress.completed_count, audit.stage_progress.total_count);
  assert.deepEqual(audit.gaps, []);
  assert.ok(audit.strengths.some((item) => item.id === 'interior-scene-density'));
  assert.ok(audit.next_iteration_directives.some((item) => item.id === 'preserve-top-tier-template-assimilation'));
});

test('TemplateAssimilationAuditAgent surfaces weak tracks and actionable directives', () => {
  const blueprint = topTierBlueprint();
  blueprint.site.template_site_scenes.scene_count = 1;
  blueprint.site.template_site_scenes.scene_types = ['entry-approach-scene'];
  blueprint.modules = { roof_detail: 4 };
  blueprint.interior.template_interior_scenes.room_scene_count = 1;
  blueprint.decorator.capability_profile.template_interior_scene_placement_count = 4;
  blueprint.decorator.capability_profile.template_experience_placement_count = 2;
  blueprint.decorator.capability_profile.template_pattern_placement_count = 3;
  blueprint.decorator.capability_profile.template_design_law_placement_count = 2;
  blueprint.templateLawCoverage.percent = 62;
  blueprint.templateLawCoverage.grade = 'law-basic';
  blueprint.templateLawCoverage.gaps = [{ id: 'site-scenes' }];
  blueprint.templateLawCoverage.missing_count = 1;
  blueprint.templateLawCoverage.repair_directives = [{ id: 'repair-site-scenes', priority: 'high', text: 'Repair site scenes.', targets: ['SiteLandscapeAgent'] }];
  blueprint.templateAestheticReview.percent = 68;
  blueprint.templateAestheticReview.score = 68;
  blueprint.templateAestheticReview.gaps = [{ id: 'site-scenes', severity: 'high' }];

  const audit = new TemplateAssimilationAuditAgent().run(blueprint);

  assert.equal(audit.active, true);
  assert.ok(audit.percent < 85);
  assert.ok(audit.gaps.some((item) => item.id === 'site-terrain-scenes'));
  assert.ok(audit.gaps.some((item) => item.id === 'interior-scene-density'));
  assert.ok(audit.gaps.some((item) => item.id === 'verification-closure'));
  assert.ok(audit.next_iteration_directives.some((item) => item.id === 'increase-site-terrain-scenes'));
  assert.ok(audit.next_iteration_directives.some((item) => item.id === 'repair-site-scenes'));
});

function topTierBlueprint() {
  const laws = [
    law('site-waterfront-public-threshold'),
    law('site-foreground-garden-rooms'),
    law('site-terrain-plinth-sequence'),
    law('facade-glass-view-axis'),
    law('roof-usable-terrace-system'),
    law('interior-room-identity-layer-stack')
  ];
  const obligations = [
    obligation('living', 'living'),
    obligation('kitchen', 'kitchen'),
    obligation('bedroom', 'bedroom'),
    obligation('study', 'study')
  ];
  return {
    templateKnowledge: {
      active: true,
      retrieved: [{ id: 'case-1' }, { id: 'case-2' }, { id: 'case-3' }],
      recommendations: {
        composition_strategy: { readiness: 'high' },
        design_law_pack: { active: true, selected_laws: laws, interior_laws: laws.slice(5) },
        design_laws: laws,
        interior_design_laws: laws.slice(5),
        room_pattern_guidance: [{ room_type: 'living' }],
        landscape_features: ['terrain', 'garden', 'water']
      }
    },
    topology: {
      template_design_law_runtime: {
        active: true,
        selected_laws: laws,
        interior_laws: laws.slice(5),
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
      template_space_plan: {
        active: true,
        entry_sequence: { thresholds: ['street', 'garden', 'porch', 'living', 'view'] }
      },
      site_connections: [
        { from: 'living', to: 'water_edge', relation: 'template-design-law-public-water-threshold' },
        { from: 'entry', to: 'foreground_garden', relation: 'template-design-law-garden-arrival' },
        { from: 'entry', to: 'terrain_plinth', relation: 'template-design-law-stepped-arrival' },
        { from: 'living', to: 'roof_terrace', relation: 'template-design-law-roof-terrace-access' }
      ]
    },
    opening: {
      engine_hints: { template_view_opening_count: 2 },
      window_openings: [{ template_role: 'view-glass', glazing_ratio: 'high' }]
    },
    site: {
      template_site_scenes: {
        active: true,
        scene_count: 5,
        scene_types: ['entry-approach-scene', 'terrain-plinth-scene', 'forecourt-garden-room-scene', 'water-edge-deck-scene', 'grove-edge-scene']
      }
    },
    interior: {
      engine_hints: { use_template_design_laws: true },
      template_design_law_runtime: { active: true, room_obligations: obligations },
      template_room_experience: {
        active: true,
        opening_plan: { public_view_rooms: ['living', 'dining'] }
      },
      template_interior_scenes: {
        active: true,
        room_scene_count: 5,
        scene_types: ['view-lounge-scene', 'kitchen-island-scene', 'sleep-suite-scene', 'study-reading-scene']
      },
      room_details: ['living', 'kitchen', 'bedroom', 'study'].map((id) => ({
        room_id: id,
        template_design_law: { active: true }
      }))
    },
    decorator: {
      capability_profile: {
        supports_template_room_patterns: true,
        supports_template_design_laws: true,
        template_pattern_placement_count: 50,
        template_design_law_placement_count: 30,
        template_experience_placement_count: 25,
        template_interior_scene_placement_count: 40
      }
    },
    modules: templateSiteModules(),
    geometry: {
      bsp: { templateSpacePlanning: { active: true } },
      exporter: { coverageOk: true }
    },
    operations: [{ kind: 'setblock' }],
    repair: { ok: true },
    templateLawCoverage: {
      active: true,
      percent: 100,
      grade: 'law-perfect',
      gaps: [],
      missing_count: 0,
      repair_directives: [{ id: 'preserve-template-law-coverage', priority: 'maintain' }]
    },
    templateLawAutoRepair: {
      source: 'local-template-law-auto-repair-agent',
      active: false,
      reason: 'template-law-coverage-already-satisfied'
    },
    templateAestheticReview: {
      active: true,
      percent: 98,
      score: 98,
      gaps: [],
      next_iteration_directives: [{ id: 'preserve-template-quality', priority: 'maintain' }]
    }
  };
}

function templateSiteModules() {
  const modules = {
    template_site_earth_terrace: 80,
    template_site_stone_plinth: 35,
    template_site_retaining_edge: 35,
    template_site_reflection_water: 45,
    template_site_water_deck: 45,
    template_site_water_edge: 35,
    template_site_garden_room: 45,
    template_site_planting_room: 40,
    template_site_entry_approach: 35,
    template_site_threshold_frame: 20,
    roof_detail: 120
  };
  for (let index = 0; index < 10; index += 1) {
    modules[`template_site_extra_${index}`] = 8;
  }
  return modules;
}

function law(id) {
  return { id, rule: id, implementation_clauses: [id] };
}

function obligation(roomId, roomType) {
  return {
    room_id: roomId,
    room_type: roomType,
    pattern_types: ['social_cluster', 'layered_lighting']
  };
}
