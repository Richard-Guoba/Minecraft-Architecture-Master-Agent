import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { ConstructionDecoratorAgent } from '../src/construction/agents/decoratorAgent.js';
import { SiteLandscapeAgent } from '../src/construction/agents/siteLandscapeAgent.js';
import { buildFallbackStructure } from '../src/construction/agents/structureAgent.js';
import { BSPPartitioner } from '../src/construction/engine/bspPartitioner.js';
import { CSGBuilder } from '../src/construction/engine/csgBuilder.js';
import { loadP7AdvisoryOverlay } from '../src/playbook/knowledge/p7AdvisoryOverlay.js';
import {
  applyArchitectureLanguageV02,
  compileArchitectureLanguageV02
} from '../src/playbook/runtime/architectureLanguageV02.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const MEDIEVAL_PROMPT = 'Build a broad medieval multi-volume residence with connected wings, a visible column beam structural grid, compound pitched roofs aligned to each mass, facade bays and coherent window assemblies, a sheltered entrance, connected interior circulation, and foundation material continuity.';
const COMPACT_PROMPT = 'Build a compact single-volume residential house with functional room zoning, connected doors and stairs, porous public partitions, a short entrance path, and restrained facade detail using a bounded pattern vocabulary.';

test('selects a bounded medieval construction slice in canonical order', async () => {
  const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });
  const plan = compileArchitectureLanguageV02({ prompt: MEDIEVAL_PROMPT, overlay });

  assert.deepEqual(plan.selected_knowledge_ids.filter((id) => [
    'knowledge:p7:connected-mass-addition',
    'knowledge:p7:scaled-column-beam-grid',
    'knowledge:p7:roof-orientation-massing-fit',
    'knowledge:p7:integrated-facade-bay-layering',
    'knowledge:p7:facade-opening-assembly',
    'knowledge:p7:building-foundation-material-continuity'
  ].includes(id)), [
    'knowledge:p7:connected-mass-addition',
    'knowledge:p7:scaled-column-beam-grid',
    'knowledge:p7:roof-orientation-massing-fit',
    'knowledge:p7:integrated-facade-bay-layering',
    'knowledge:p7:facade-opening-assembly',
    'knowledge:p7:building-foundation-material-continuity'
  ]);

  const applied = applyArchitectureLanguageV02({
    prompt: MEDIEVAL_PROMPT,
    plan,
    architecture: { structural_rules: {}, roof_rules: {}, facade_rules: {}, site_rules: {} },
    buildSpec: { site: {} }
  });
  assert.equal(applied.architecture.structural_rules.visible_bay_grid, true);
  assert.equal(applied.architecture.roof_rules.axis_strategy, 'volume-proportion');
  assert.equal(applied.architecture.facade_rules.bay_layering, 'integrated-supported');
  assert.equal(applied.architecture.facade_rules.opening_assembly, 'sill-lintel-frame');
  assert.equal(applied.architecture.site_rules.foundation_transition, 'material-continuous');
});

test('selects compact zoning, porous partitions, restrained facade, and route handoffs', async () => {
  const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });
  const plan = compileArchitectureLanguageV02({ prompt: COMPACT_PROMPT, overlay });
  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:bounded-facade-pattern-vocabulary'), true);
  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:landscape-route-and-grounding'), true);
  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:function-led-interior-zoning'), true);
  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:porous-interior-partition'), true);
  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:connected-mass-addition'), false);

  const applied = applyArchitectureLanguageV02({
    prompt: COMPACT_PROMPT,
    plan,
    architecture: { facade_rules: {}, site_rules: {}, design_directives: {} },
    buildSpec: { site: {} }
  });
  assert.equal(applied.architecture.facade_rules.pattern_vocabulary, 'bounded-restrained');
  assert.equal(applied.architecture.design_directives.interior.space_planning, 'function-before-furnishing');
  assert.equal(applied.architecture.design_directives.interior.partition_strategy, 'porous-public-solid-private');
  assert.equal(applied.architecture.site_rules.route_strategy, 'route-first-grounding');
});

test('explicit negation suppresses new construction operations without suppressing unrelated clauses', async () => {
  const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });
  const plan = compileArchitectureLanguageV02({
    prompt: 'Build a medieval home with no visible structural grid, avoid facade bays, no porous partitions, but use coherent window assemblies.',
    overlay
  });

  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:scaled-column-beam-grid'), false);
  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:integrated-facade-bay-layering'), false);
  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:porous-interior-partition'), false);
  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:facade-opening-assembly'), true);
});

test('structure, BSP, site, and decorator consume v0.3 semantic handoffs as construction behavior', () => {
  const spec = {
    width: 19, depth: 15, wall_height: 5, total_height: 8, floors: 1,
    floor_height: 5, roof_height: 3, roof_overhang: 1, shell_thickness: 1,
    roof_style: 'gabled', door_side: 'south', door_width: 2, door_height: 3,
    garden_depth: 4, scale: 'compact', facade: {}, structural: {}, site: {}
  };
  const architecture = {
    style_family: 'general',
    volumes: [],
    materials: {
      wall: 'minecraft:stone_bricks', roof: 'minecraft:dark_oak_planks',
      floor: 'minecraft:oak_planks', foundation: 'minecraft:cobblestone',
      interior_wall: 'minecraft:birch_planks', path: 'minecraft:gravel',
      furniture: 'minecraft:barrel', lamp: 'minecraft:lantern'
    },
    structural_rules: { visible_bay_grid: true },
    roof_rules: { style: 'gabled', axis_strategy: 'volume-proportion' },
    facade_rules: { pattern_vocabulary: 'bounded-restrained' },
    site_rules: { route_strategy: 'route-first-grounding' },
    design_directives: {
      interior: {
        space_planning: 'function-before-furnishing',
        partition_strategy: 'porous-public-solid-private',
        furnishing_sequence: 'large-to-small'
      }
    }
  };
  const topology = {
    nodes: [
      { id: 'entry', type: 'entry', floor: 0, weight: 1, access: 'main-door' },
      { id: 'living', type: 'living', floor: 0, weight: 2 },
      { id: 'dining', type: 'dining', floor: 0, weight: 1 }
    ],
    edges: [{ from: 'entry', to: 'living' }, { from: 'living', to: 'dining' }],
    bsp_hints: { split_strategy: 'weighted' }
  };
  const structure = buildFallbackStructure(architecture, spec, topology);
  assert.equal(structure.engine_hints.render_column_grid, true);
  assert.ok(structure.support_elements.some((item) => item.kind === 'column-grid'));

  const site = new SiteLandscapeAgent().run('', architecture, spec, topology);
  assert.equal(site.entry_sequence.strategy, 'route-first-grounding');
  assert.equal(site.engine_hints.render_entry_threshold, true);
  const shell = new CSGBuilder(spec, architecture.materials).generateShell(architecture, { structure, site });
  const modules = moduleCounts(shell.grid);
  assert.ok(modules.structural_frame > 0);
  assert.ok(modules.entry_threshold > 0);

  const layout = new BSPPartitioner(spec, architecture.materials).fitRooms(shell, topology, architecture);
  assert.equal(layout.bsp.semanticSpacePlanning, 'function-before-furnishing');
  assert.equal(layout.bsp.splitStrategy, 'function-first-weighted');
  assert.ok(layout.bsp.openPlanSoftBoundaries > 0);

  const decorator = new ConstructionDecoratorAgent().run(layout.rooms, architecture.materials, {
    grid: shell.grid, buildSpec: spec, architecture, topology, interior: { room_details: [] }
  });
  assert.equal(decorator.furnishing_sequence, 'large-to-small');
  assert.deepEqual(decorator.placement_passes, [
    'function-bearing-large', 'secondary-storage-and-work', 'lighting-and-small-accents'
  ]);
  const firstFurniture = decorator.placements.findIndex((item) => item.module === 'decor_furniture');
  const firstLight = decorator.placements.findIndex((item) => item.module === 'decor_light');
  assert.ok(firstFurniture >= 0 && (firstLight < 0 || firstFurniture < firstLight));
});

function moduleCounts(grid) {
  const counts = {};
  for (const cell of grid.values()) counts[cell.module] = (counts[cell.module] || 0) + 1;
  return counts;
}
