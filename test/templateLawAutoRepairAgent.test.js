import test from 'node:test';
import assert from 'node:assert/strict';
import { TemplateLawAutoRepairAgent } from '../src/construction/agents/templateLawAutoRepairAgent.js';
import { TemplateLawCoverageAgent } from '../src/construction/agents/templateLawCoverageAgent.js';
import { keyFor } from '../src/construction/engine/csgBuilder.js';

test('TemplateLawAutoRepairAgent mutates grid and semantics to close repairable law gaps', () => {
  const blueprint = repairableBlueprint();
  const coverageAgent = new TemplateLawCoverageAgent();
  const before = coverageAgent.run(blueprint);

  assert.equal(before.active, true);
  assert.ok(before.percent < 75);
  assert.ok(before.repair_directives.some((item) => item.id === 'repair-waterfront-threshold'));
  assert.ok(before.repair_directives.some((item) => item.id === 'repair-room-pattern-execution'));

  const repair = new TemplateLawAutoRepairAgent().run({
    grid: blueprint.grid,
    blueprint,
    coverage: before,
    buildSpec: blueprint.buildSpec,
    architecture: blueprint.architecture,
    topology: blueprint.topology,
    site: blueprint.site,
    roof: blueprint.roof,
    opening: blueprint.opening,
    interior: blueprint.interior,
    decorator: blueprint.decorator,
    layout: blueprint.layout
  });
  blueprint.modules = moduleCounts(blueprint.grid);
  const after = coverageAgent.run(blueprint);

  assert.equal(repair.active, true);
  assert.ok(repair.applied_count >= 8);
  assert.ok(repair.grid_patch_count >= 180);
  assert.ok(repair.placement_count >= 30);
  assert.ok(hasModule(blueprint.grid, 'template_site_water_deck'));
  assert.ok(hasModule(blueprint.grid, 'template_site_garden_room'));
  assert.ok(hasModule(blueprint.grid, 'template_site_earth_terrace'));
  assert.ok(hasModule(blueprint.grid, 'roof_detail'));
  assert.equal(blueprint.interior.engine_hints.use_template_design_laws, true);
  assert.ok(blueprint.interior.template_room_experience.opening_plan.public_view_rooms.includes('living'));
  assert.ok(blueprint.topology.site_connections.some((item) => item.to === 'water_edge'));
  assert.ok(blueprint.topology.site_connections.some((item) => item.to === 'roof_terrace'));
  assert.ok(blueprint.opening.window_openings.some((item) => item.template_role === 'view-glass'));
  assert.equal(blueprint.decorator.capability_profile.supports_template_design_laws, true);
  assert.equal(blueprint.decorator.capability_profile.supports_template_room_patterns, true);
  assert.ok(after.percent > before.percent);
  assert.ok(after.percent >= 90);
  assert.ok(after.satisfied_count > before.satisfied_count);
  assert.deepEqual(after.gaps.map((item) => ({ id: item.id, missing: item.missing })), []);
  assert.equal(after.repair_plan.active, false);
});

test('TemplateLawAutoRepairAgent stays inactive when coverage only asks to preserve laws', () => {
  const repair = new TemplateLawAutoRepairAgent().run({
    coverage: {
      active: true,
      percent: 100,
      grade: 'law-perfect',
      repair_directives: [{ id: 'preserve-template-law-coverage', priority: 'maintain' }]
    }
  });

  assert.equal(repair.active, false);
  assert.equal(repair.reason, 'template-law-coverage-already-satisfied');
  assert.equal(repair.applied_count, 0);
});

function repairableBlueprint() {
  const rooms = [
    room('living', 'living', 0, 7, 0, 7),
    room('kitchen', 'kitchen', 8, 14, 0, 6),
    room('bedroom', 'bedroom', 0, 6, 8, 14),
    room('study', 'study', 8, 14, 8, 14)
  ];
  const grid = seedShellGrid(rooms);
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
    prompt: 'modern lake villa with non-flat terrain, garden, glass, roof terrace',
    grid,
    buildSpec: { door_side: 'south' },
    architecture: {
      materials: {
        floor: 'minecraft:smooth_quartz',
        roof: 'minecraft:smooth_quartz_slab[type=top]',
        trim: 'minecraft:smooth_quartz',
        path: 'minecraft:smooth_stone',
        water: 'minecraft:water',
        plant: 'minecraft:flowering_azalea_leaves[persistent=true]',
        railing: 'minecraft:iron_bars',
        lamp: 'minecraft:sea_lantern',
        accent: 'minecraft:calcite'
      },
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
      nodes: rooms.map((item) => ({ id: item.id, type: item.type })),
      circulation_rules: { public_core: 'living' },
      facade_alignment: {},
      site_connections: [],
      bsp_hints: {}
    },
    opening: {
      engine_hints: {},
      window_openings: [],
      view_thresholds: []
    },
    roof: { profile: 'flat', elements: [] },
    site: {
      template_site_scenes: {
        active: true,
        scene_count: 0,
        scene_types: []
      }
    },
    interior: {
      engine_hints: {},
      template_design_law_runtime: { active: true, room_obligations: obligations },
      template_room_experience: {
        active: false,
        room_experiences: [],
        opening_plan: { public_view_rooms: [] }
      },
      room_details: rooms.map((item) => ({
        room_id: item.id,
        type: item.type,
        template_design_law: { active: false },
        template_design_law_clause_ids: [],
        semantic_clause_ids: []
      }))
    },
    decorator: {
      placementCount: 0,
      capability_profile: {
        supports_template_room_patterns: false,
        supports_template_design_laws: false,
        template_pattern_placement_count: 0,
        template_design_law_placement_count: 0,
        module_layers: []
      },
      placements: []
    },
    modules: moduleCounts(grid),
    layout: { rooms }
  };
}

function seedShellGrid(rooms) {
  const grid = new Map();
  for (const item of rooms) {
    for (let x = item.min_x; x <= item.max_x; x += 1) {
      for (let z = item.min_z; z <= item.max_z; z += 1) {
        grid.set(keyFor(x, 0, z), { block: 'minecraft:smooth_quartz', module: 'floor' });
        grid.set(keyFor(x, 5, z), { block: 'minecraft:smooth_quartz_slab[type=top]', module: 'roof' });
      }
    }
  }
  return grid;
}

function room(id, type, minX, maxX, minZ, maxZ) {
  return {
    id,
    type,
    min_x: minX,
    max_x: maxX,
    min_z: minZ,
    max_z: maxZ,
    min_y: 1,
    max_y: 4
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

function hasModule(grid, module) {
  for (const cell of grid.values()) {
    if (cell.module === module) return true;
  }
  return false;
}

function moduleCounts(grid) {
  const counts = {};
  for (const cell of grid.values()) {
    counts[cell.module] = (counts[cell.module] || 0) + 1;
  }
  return counts;
}
