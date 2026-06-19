import test from 'node:test';
import assert from 'node:assert/strict';
import { TemplateAssimilationAuditAgent } from '../src/construction/agents/templateAssimilationAuditAgent.js';
import { TemplateInteriorDensityRepairAgent } from '../src/construction/agents/templateInteriorDensityRepairAgent.js';
import { keyFor } from '../src/construction/engine/csgBuilder.js';

test('TemplateInteriorDensityRepairAgent tops up scene, experience, pattern, and design-law density before audit', () => {
  const blueprint = repairableTopTierBlueprint();
  const beforeAudit = new TemplateAssimilationAuditAgent().run(blueprint);
  const beforeTrack = trackById(beforeAudit, 'interior-scene-density');

  assert.ok(beforeTrack.percent < 85);
  assert.ok(beforeTrack.missing.includes('pattern-placement-density-low'));
  assert.ok(beforeTrack.missing.includes('design-law-placement-density-low'));

  const repair = new TemplateInteriorDensityRepairAgent().run({
    grid: blueprint.grid,
    blueprint,
    architecture: blueprint.architecture,
    topology: blueprint.topology,
    interior: blueprint.interior,
    decorator: blueprint.decorator,
    layout: blueprint.layout
  });
  blueprint.templateInteriorDensityRepair = repair;
  const afterAudit = new TemplateAssimilationAuditAgent().run(blueprint);
  const afterTrack = trackById(afterAudit, 'interior-scene-density');

  assert.equal(repair.active, true);
  assert.equal(repair.reason, 'template-interior-density-repaired');
  assert.equal(repair.applied_count, 4);
  assert.ok(repair.grid_patch_count >= 100);
  assert.equal(repair.grid_patch_count, repair.placement_count);
  assert.ok(repair.after.scene >= repair.targets.scene);
  assert.ok(repair.after.experience >= repair.targets.experience);
  assert.ok(repair.after.pattern >= repair.targets.pattern);
  assert.ok(repair.after.designLaw >= repair.targets.designLaw);
  assert.equal(blueprint.decorator.capability_profile.supports_template_room_patterns, true);
  assert.equal(blueprint.decorator.capability_profile.supports_template_design_laws, true);
  assert.ok(repair.placements.some((item) => item.role.startsWith('template-scene-density-')));
  assert.ok(repair.placements.some((item) => item.role.startsWith('template-experience-density-')));
  assert.ok(repair.placements.some((item) => item.role.startsWith('template-pattern-density-')));
  assert.ok(repair.placements.some((item) => item.role.startsWith('design-law-density-')));
  assert.ok([...blueprint.grid.values()].filter((cell) => String(cell.module || '').startsWith('decor_')).length >= repair.grid_patch_count);
  assert.equal(afterTrack.percent, 100);
  assert.deepEqual(afterTrack.missing, []);
  assert.equal(afterAudit.readiness, 'top-tier-ready');
  assert.ok(afterAudit.percent >= 96);
});

test('TemplateInteriorDensityRepairAgent remains inactive without template interior signals', () => {
  const blueprint = {
    grid: new Map(),
    layout: { rooms: sampleRooms() },
    decorator: { placements: [], capability_profile: {} }
  };

  const repair = new TemplateInteriorDensityRepairAgent().run({ grid: blueprint.grid, blueprint });

  assert.equal(repair.active, false);
  assert.equal(repair.reason, 'template-interior-density-signal-inactive');
  assert.equal(repair.placement_count, 0);
});

test('TemplateInteriorDensityRepairAgent records already-satisfied density without adding redundant placements', () => {
  const rooms = sampleRooms();
  const blueprint = {
    grid: emptyRoomGrid(rooms),
    layout: { rooms },
    topology: {
      template_design_law_runtime: {
        active: true,
        room_obligations: obligations()
      }
    },
    interior: {
      template_interior_scenes: { active: true },
      template_design_law_runtime: {
        active: true,
        room_obligations: obligations()
      }
    },
    decorator: {
      placements: [],
      capability_profile: {
        template_interior_scene_placement_count: 40,
        template_experience_placement_count: 22,
        template_pattern_placement_count: 50,
        template_design_law_placement_count: 30,
        supports_template_room_patterns: true,
        supports_template_design_laws: true
      }
    }
  };

  const repair = new TemplateInteriorDensityRepairAgent().run({ grid: blueprint.grid, blueprint });

  assert.equal(repair.active, false);
  assert.equal(repair.reason, 'template-interior-density-already-satisfied');
  assert.equal(repair.placement_count, 0);
  assert.equal(repair.after.pattern, 50);
  assert.equal(repair.after.designLaw, 30);
});

function repairableTopTierBlueprint() {
  const rooms = sampleRooms();
  const lawItems = laws();
  const roomObligations = obligations();
  return {
    grid: emptyRoomGrid(rooms),
    architecture: {
      style_family: 'modern',
      materials: {
        lamp: 'minecraft:sea_lantern',
        accent: 'minecraft:smooth_quartz',
        furniture: 'minecraft:barrel',
        plant: 'minecraft:potted_azalea_bush'
      }
    },
    templateKnowledge: {
      active: true,
      retrieved: [{ id: 'case-1' }, { id: 'case-2' }, { id: 'case-3' }],
      recommendations: {
        composition_strategy: { readiness: 'high' },
        design_law_pack: { active: true, selected_laws: lawItems, interior_laws: lawItems.slice(5) },
        design_laws: lawItems,
        interior_design_laws: lawItems.slice(5),
        room_pattern_guidance: [{ room_type: 'living' }, { room_type: 'kitchen' }],
        landscape_features: ['terrain', 'garden', 'water']
      }
    },
    topology: {
      template_design_law_runtime: {
        active: true,
        selected_laws: lawItems,
        interior_laws: lawItems.slice(5),
        topology_directives: {
          public_view_axis: true,
          waterfront_threshold: true,
          foreground_garden_sequence: true,
          layered_terrain_arrival: true,
          large_glass_view_axis: true,
          roof_terrace_access_required: true
        },
        room_obligations: roomObligations
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
      template_design_law_runtime: { active: true, room_obligations: roomObligations },
      template_room_experience: {
        active: true,
        opening_plan: { public_view_rooms: ['living', 'dining'] }
      },
      template_interior_scenes: {
        active: true,
        room_scene_count: 5,
        scene_types: ['view-lounge-scene', 'kitchen-island-scene', 'sleep-suite-scene', 'study-reading-scene', 'bathroom-spa-scene']
      },
      room_details: rooms.map((room) => ({
        room_id: room.id,
        template_design_law: { active: true }
      }))
    },
    decorator: {
      placementCount: 10,
      placements: [],
      capability_profile: {
        template_interior_scene_placement_count: 4,
        template_experience_placement_count: 3,
        template_pattern_placement_count: 2,
        template_design_law_placement_count: 1,
        supports_template_room_patterns: false,
        supports_template_design_laws: false,
        module_layers: []
      }
    },
    modules: templateSiteModules(),
    layout: { rooms },
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

function sampleRooms() {
  return [
    room('entry', 'entry', 0, 0),
    room('living', 'living', 14, 0),
    room('kitchen', 'kitchen', 28, 0),
    room('bedroom', 'bedroom', 0, 14),
    room('study', 'study', 14, 14),
    room('bathroom', 'bathroom', 28, 14)
  ];
}

function room(id, type, x, z) {
  return { id, type, min_x: x, max_x: x + 12, min_y: 1, max_y: 5, min_z: z, max_z: z + 12 };
}

function emptyRoomGrid(rooms) {
  const grid = new Map();
  for (const room of rooms) {
    for (let x = room.min_x; x <= room.max_x; x += 1) {
      for (let z = room.min_z; z <= room.max_z; z += 1) {
        grid.set(keyFor(x, 0, z), { block: 'minecraft:smooth_stone', module: 'floor' });
      }
    }
  }
  return grid;
}

function obligations() {
  return [
    obligation('living', 'living'),
    obligation('kitchen', 'kitchen'),
    obligation('bedroom', 'bedroom'),
    obligation('study', 'study'),
    obligation('bathroom', 'bathroom')
  ];
}

function obligation(roomId, roomType) {
  return {
    room_id: roomId,
    room_type: roomType,
    pattern_types: ['social_cluster', 'layered_lighting']
  };
}

function laws() {
  return [
    law('site-waterfront-public-threshold'),
    law('site-foreground-garden-rooms'),
    law('site-terrain-plinth-sequence'),
    law('facade-glass-view-axis'),
    law('roof-usable-terrace-system'),
    law('interior-room-identity-layer-stack')
  ];
}

function law(id) {
  return { id, rule: id, implementation_clauses: [id] };
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
  for (let index = 0; index < 10; index += 1) modules[`template_site_extra_${index}`] = 8;
  return modules;
}

function trackById(audit, id) {
  return audit.tracks.find((item) => item.id === id);
}
