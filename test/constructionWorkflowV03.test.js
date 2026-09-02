import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ConstructionDecoratorAgent } from '../src/construction/agents/decoratorAgent.js';
import { SiteLandscapeAgent } from '../src/construction/agents/siteLandscapeAgent.js';
import { BlueprintQAAgent } from '../src/construction/agents/blueprintQaAgent.js';
import { ConstraintRepairAgent } from '../src/construction/agents/constraintRepairAgent.js';
import { buildFallbackStructure } from '../src/construction/agents/structureAgent.js';
import { BSPPartitioner } from '../src/construction/engine/bspPartitioner.js';
import { CSGBuilder } from '../src/construction/engine/csgBuilder.js';
import { mergeConstraintRepairResults, runConstructionWorkflow } from '../src/construction/workflow.js';
import { loadP7AdvisoryOverlay } from '../src/playbook/knowledge/p7AdvisoryOverlay.js';
import {
  applyArchitectureLanguageV02,
  compileArchitectureLanguageV02
} from '../src/playbook/runtime/architectureLanguageV02.js';
import { isConstructionOperationSatisfied } from '../src/construction/constructionWorkflowV03.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const MEDIEVAL_PROMPT = 'Build a broad medieval multi-volume residence with connected wings, a visible column beam structural grid, compound pitched roofs aligned to each mass, facade bays and coherent window assemblies, a sheltered entrance route, connected interior circulation, and foundation material continuity.';
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

  const rejected = [
    ['Build a house with no entrance path.', 'knowledge:p7:landscape-route-and-grounding'],
    ['Build a house but avoid functional zoning.', 'knowledge:p7:function-led-interior-zoning'],
    ['Build a house; do not furnish large-to-small.', 'knowledge:p7:large-to-small-furnishing-pass']
  ];
  for (const [prompt, id] of rejected) {
    assert.equal(compileArchitectureLanguageV02({ prompt, overlay }).selected_knowledge_ids.includes(id), false, prompt);
  }
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
  assert.equal(modules.entry_threshold || 0, 0);

  const layout = new BSPPartitioner(spec, architecture.materials).fitRooms(shell, topology, architecture);
  assert.equal(layout.bsp.semanticSpacePlanning, 'function-before-furnishing');
  assert.equal(layout.bsp.splitStrategy, 'function-first-weighted');
  assert.ok(layout.bsp.openPlanSoftBoundaries > 0);
  const solidLayout = new BSPPartitioner(spec, architecture.materials).fitRooms(shell, topology, {
    ...architecture,
    design_directives: { interior: { space_planning: 'function-before-furnishing' } }
  });
  assert.equal(solidLayout.bsp.openPlanSoftBoundaries, 0);

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

test('volume-proportion roof axes alter wide gable geometry and are recorded per volume', () => {
  const spec = {
    width: 19, depth: 9, wall_height: 5, total_height: 8, floors: 1,
    floor_height: 5, roof_height: 3, roof_overhang: 1, shell_thickness: 1,
    roof_style: 'gabled', facade: {}, structural: {}, site: {}
  };
  const architecture = {
    volumes: [],
    materials: { wall: 'minecraft:stone_bricks', roof: 'minecraft:dark_oak_planks', trim: 'minecraft:quartz_block' },
    roof_rules: { style: 'gabled', axis_strategy: 'volume-proportion' }
  };
  const shell = new CSGBuilder(spec, architecture.materials).generateShell(architecture);
  const ridge = [...shell.grid.entries()]
    .filter(([, cell]) => cell.module === 'roof_detail')
    .map(([key]) => key.split(',').map(Number));
  assert.equal(shell.csg.roof.componentAxes[0].axis, 'x');
  assert.ok(new Set(ridge.map(([x]) => x)).size > new Set(ridge.map(([, , z]) => z)).size);
});

test('construction workflow QA rejects a forged satisfied result when geometry evidence is absent', () => {
  const blueprint = {
    operations: [], bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 },
    modules: {}, shell: { volumeBoxes: [], interiorSpaces: [] }, layout: { rooms: [] }, paths: {},
    constructionWorkflow: {
      workflow_version: '0.3.0',
      rows: [{
        knowledge_id: 'knowledge:p7:scaled-column-beam-grid',
        operation_id: 'language:structure:derived-bay-grid',
        workflow_stage: 'structure', result_kind: 'module-count', satisfied: true,
        evidence: { module: 'structural_frame', count: 0 }
      }]
    }
  };
  const qa = new BlueprintQAAgent().run(blueprint);
  const check = qa.checks.find((item) => item.name === 'construction-workflow');
  assert.equal(check.ok, false);
  assert.match(qa.errors.join('\n'), /Construction Workflow/u);
});

test('construction workflow QA requires an exact ordered language-to-result handoff', () => {
  const blueprint = {
    operations: [], bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 },
    modules: { structural_frame: 2 }, structure: { engine_hints: { render_column_grid: true } },
    shell: { volumeBoxes: [], interiorSpaces: [] }, layout: { rooms: [] }, paths: {},
    architectureLanguage: {
      trace: { applied_operations: [
        { knowledge_id: 'knowledge:p7:scaled-column-beam-grid', operation_id: 'language:structure:derived-bay-grid', workflow_stage: 'structure' },
        { knowledge_id: 'knowledge:p7:function-led-interior-zoning', operation_id: 'language:interior:function-first-zoning', workflow_stage: 'interior' }
      ] }
    },
    constructionWorkflow: {
      schema_version: 1, workflow_version: '0.3.0', authority: 'derived-from-validated-plan-and-grid',
      rows: [{
        knowledge_id: 'knowledge:p7:scaled-column-beam-grid', operation_id: 'language:structure:derived-bay-grid',
        workflow_stage: 'structure', result_kind: 'module-and-agent-result', evidence: {}, satisfied: true
      }]
    }
  };
  const qa = new BlueprintQAAgent().run(blueprint);
  const check = qa.checks.find((item) => item.name === 'construction-workflow');
  assert.equal(check.ok, false);
  assert.ok(check.details.contractIssues.includes('row-count-mismatch'));
});

test('construction workflow QA rejects deleting the required result sidecar', () => {
  const blueprint = {
    operations: [], bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 },
    modules: {}, shell: { volumeBoxes: [], interiorSpaces: [] }, layout: { rooms: [] }, paths: {},
    architectureLanguage: { trace: { applied_operations: [
      { knowledge_id: 'knowledge:p7:function-led-interior-zoning', operation_id: 'language:interior:function-first-zoning', workflow_stage: 'interior' }
    ] } }
  };
  const qa = new BlueprintQAAgent().run(blueprint);
  assert.equal(qa.checks.find((item) => item.name === 'construction-workflow')?.ok, false);
});

test('construction workflow QA binds plan, trace, and sidecar as one contract', () => {
  const blueprint = {
    operations: [], bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 },
    modules: {}, shell: { volumeBoxes: [], interiorSpaces: [] }, layout: { rooms: [] }, paths: {},
    architectureLanguage: {
      plan: {
        selected_knowledge_ids: ['knowledge:p7:function-led-interior-zoning'],
        instructions: [{
          knowledge_id: 'knowledge:p7:function-led-interior-zoning',
          operation_id: 'language:interior:function-first-zoning',
          workflow_stage: 'interior'
        }]
      },
      trace: { selected_knowledge_ids: [], applied_operations: [] }
    }
  };
  const qa = new BlueprintQAAgent().run(blueprint);
  const check = qa.checks.find((item) => item.name === 'construction-workflow');
  assert.equal(check?.ok, false);
  assert.ok(check.details.contractIssues.includes('language-plan-trace-mismatch'));
});

test('construction workflow QA cannot be disabled by clearing every language row', () => {
  const blueprint = {
    prompt: 'Build a house with functional room zoning.',
    operations: [], bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 },
    modules: {}, shell: { volumeBoxes: [], interiorSpaces: [] }, layout: { rooms: [] }, paths: {},
    architectureLanguage: {
      plan: { selected_knowledge_ids: [], instructions: [] },
      trace: { selected_knowledge_ids: [], applied_operations: [] }
    }
  };
  const qa = new BlueprintQAAgent().run(blueprint);
  assert.equal(qa.checks.find((item) => item.name === 'construction-workflow')?.ok, false);
});

test('construction workflow QA accepts a canonical empty language handoff when the prompt selects nothing', async () => {
  const prompt = 'Build a plain house.';
  const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });
  const plan = compileArchitectureLanguageV02({ prompt, overlay });
  const applied = applyArchitectureLanguageV02({
    prompt,
    plan,
    architecture: {},
    buildSpec: {}
  });
  assert.deepEqual(plan.selected_knowledge_ids, []);
  assert.deepEqual(applied.trace.applied_operations, []);

  const qa = new BlueprintQAAgent().run({
    prompt,
    architectureLanguage: { plan, trace: applied.trace },
    operations: [], bounds: {}, modules: {}, shell: { volumeBoxes: [], interiorSpaces: [] }, layout: {}, paths: {}
  });
  const check = qa.checks.find((item) => item.name === 'construction-workflow');
  assert.equal(check?.ok, true);
  assert.equal(check?.details.active, false);
  assert.equal(qa.stats.constructionWorkflow.active, false);
});

test('construction workflow QA rejects language accessors without invoking them', () => {
  let invoked = false;
  const architectureLanguage = { plan: {} };
  Object.defineProperty(architectureLanguage, 'trace', {
    enumerable: true,
    get() {
      invoked = true;
      throw new Error('must not invoke language accessor');
    }
  });
  const qa = new BlueprintQAAgent().run({
    prompt: 'Build a house.', architectureLanguage,
    operations: [], bounds: {}, modules: {}, shell: { volumeBoxes: [], interiorSpaces: [] }, layout: {}, paths: {}
  });
  assert.equal(invoked, false);
  assert.equal(qa.checks.find((item) => item.name === 'construction-workflow')?.ok, false);
});

test('constraint repair merge preserves first-pass before/after evidence', () => {
  const pre = {
    source: 'local-constraint-repair-agent', ok: true, checks: [], suggestions: [], stats: { gridCellCount: 8 },
    repairs: [{ id: 'workflow-v0.3-entry-threshold', before: { entry_threshold: 0 }, after: { entry_threshold: 8 } }]
  };
  const post = {
    source: 'local-constraint-repair-agent', ok: true, checks: [{ name: 'has-shell', ok: true }], suggestions: [],
    stats: { gridCellCount: 99 }, repairs: []
  };
  const merged = mergeConstraintRepairResults(pre, post);
  assert.deepEqual(merged.repairs, pre.repairs);
  assert.deepEqual(merged.checks, post.checks);
  assert.equal(merged.stats.gridCellCount, 99);
});

test('route satisfaction requires exported operations at the recorded threshold points', () => {
  const blueprint = {
    modules: { entry_threshold: 4, landscape_path: 3 },
    paths: {
      mainDoor: { side: 'south', x: 2, z: 8, width: 2 },
      entryThreshold: {
        side: 'south', block: 'minecraft:stone_bricks',
        width: 1, points: [{ x: 2, y: 0, z: 9 }]
      }
    },
    operations: [{
      kind: 'fill', from: { x: 2, y: 0, z: 9 }, to: { x: 2, y: 0, z: 9 }, block: 'minecraft:stone_bricks'
    }]
  };
  assert.equal(isConstructionOperationSatisfied(blueprint, { operation_id: 'language:site:route-first-grounding' }), false);
});

test('subtract volumes are excluded from connected-role and foundation obligations', () => {
  const boxes = [
    { id: 'main', booleanMode: 'union', bounds: { minX: 0, maxX: 4, minY: 1, maxY: 4, minZ: 0, maxZ: 4 } },
    { id: 'courtyard-void', booleanMode: 'subtract', bounds: { minX: 1, maxX: 2, minY: 1, maxY: 4, minZ: 1, maxZ: 2 } }
  ];
  const blueprint = {
    modules: { foundation_transition: 12 }, shell: { volumeBoxes: boxes },
    site: { engine_hints: { render_foundation_transition: true } },
    geometry: { site: { foundationTransitionVolumeIds: ['main'] } }
  };
  assert.equal(isConstructionOperationSatisfied(blueprint, { operation_id: 'language:site:foundation-continuity' }), true);
});

test('route-first missing-threshold repair is bounded and idempotent', () => {
  const grid = new Map();
  const context = {
    grid,
    buildSpec: { width: 11, depth: 9, door_side: 'south', door_width: 2, constraints: {} },
    architecture: { materials: { foundation: 'minecraft:cobblestone' } },
    site: {
      entry_sequence: { strategy: 'route-first-grounding', side: 'south', path_width: 2 },
      materials: { path_secondary: 'minecraft:stone_bricks' }
    },
    paths: { mainDoor: { side: 'south', x: 2, z: 8, width: 2 }, pathfinder: { failedEdgeCount: 0 } }
  };
  const first = new ConstraintRepairAgent().run(context);
  const sizeAfterFirst = grid.size;
  const second = new ConstraintRepairAgent().run(context);
  assert.equal(first.repairs.some((item) => item.id === 'workflow-v0.3-entry-threshold'), true);
  assert.ok(sizeAfterFirst > 0);
  assert.equal(first.stats.moduleCount, 1);
  assert.equal(second.repairs.length, 0);
  assert.equal(grid.size, sizeAfterFirst);
  assert.ok([...grid.values()].every((cell) => cell.module === 'entry_threshold'));
  assert.deepEqual(first.repairs[0].before, { entry_threshold: 0 });
  assert.deepEqual(first.repairs[0].after, { entry_threshold: sizeAfterFirst });
  assert.equal(grid.has('2,0,9'), true);
  assert.equal(grid.has('5,0,9'), false);
});

test('route-first repair replaces a stale threshold that does not touch the main door', () => {
  const grid = new Map([
    ['5,0,9', { block: 'minecraft:cobblestone', module: 'entry_threshold' }],
    ['6,0,9', { block: 'minecraft:cobblestone', module: 'entry_threshold' }]
  ]);
  const context = {
    grid,
    buildSpec: { width: 11, depth: 9, door_side: 'south', constraints: {} },
    architecture: { materials: { foundation: 'minecraft:cobblestone' } },
    site: { entry_sequence: { strategy: 'route-first-grounding', path_width: 2 } },
    paths: {
      mainDoor: { side: 'south', x: 2, z: 8, width: 2 },
      entryThreshold: { side: 'south', points: [{ x: 5, y: 0, z: 9 }] },
      pathfinder: { failedEdgeCount: 0 }
    }
  };
  const result = new ConstraintRepairAgent().run(context);
  assert.equal(result.repairs[0].operation, 'relocated-entry-threshold');
  assert.equal(grid.has('5,0,9'), false);
  assert.equal(grid.has('2,0,9'), true);
});

test('route-first repair rejects a threshold record containing only one correctly aligned point', () => {
  const grid = new Map([
    ['2,0,9', { block: 'minecraft:cobblestone', module: 'entry_threshold' }],
    ['20,0,20', { block: 'minecraft:cobblestone', module: 'entry_threshold' }]
  ]);
  const context = {
    grid,
    buildSpec: { width: 11, depth: 9, constraints: {} },
    architecture: { materials: { foundation: 'minecraft:cobblestone' } },
    site: { entry_sequence: { strategy: 'route-first-grounding', path_width: 2 } },
    paths: {
      mainDoor: { side: 'south', x: 2, z: 8, width: 2 },
      entryThreshold: { side: 'south', width: 4, block: 'minecraft:cobblestone', points: [{ x: 2, y: 0, z: 9 }] },
      pathfinder: { failedEdgeCount: 0 }
    }
  };
  const result = new ConstraintRepairAgent().run(context);
  assert.equal(result.repairs[0].operation, 'relocated-entry-threshold');
  assert.ok(result.repairs[0].placement_count >= 0);
  assert.equal(grid.has('20,0,20'), false);
});

test('route-first repair removes stale threshold cells outside the derived rectangle', () => {
  const spec = { width: 11, depth: 9, constraints: {} };
  const materials = { foundation: 'minecraft:cobblestone' };
  const door = { side: 'south', x: 2, z: 8, width: 2 };
  const grid = new Map();
  const entryThreshold = new CSGBuilder(spec, materials).addEntryThreshold(grid, {
    mainDoor: door, width: 2, block: materials.foundation
  });
  grid.set('20,0,20', { block: materials.foundation, module: 'entry_threshold' });
  const result = new ConstraintRepairAgent().run({
    grid, buildSpec: spec, architecture: { materials },
    site: { entry_sequence: { strategy: 'route-first-grounding', path_width: 2 } },
    paths: { mainDoor: door, entryThreshold, pathfinder: { failedEdgeCount: 0 } }
  });
  assert.equal(result.repairs[0].operation, 'relocated-entry-threshold');
  assert.equal(grid.has('20,0,20'), false);
});

function moduleCounts(grid) {
  const counts = {};
  for (const cell of grid.values()) counts[cell.module] = (counts[cell.module] || 0) + 1;
  return counts;
}

const WORKFLOW_SCENARIOS = [
  {
    id: 'modern-lakeside',
    prompt: 'Build a private modern lakeside villa with three interlocking volumes, a flat roof with parapet, large glass daylight openings, a sheltered entry and path, functional interior zoning, porous public partitions, and a large-to-small furnishing pass.',
    required: ['knowledge:p7:modern-flat-roof-option', 'knowledge:p7:weather-sheltered-entrance-transition', 'knowledge:p7:landscape-route-and-grounding', 'knowledge:p7:function-led-interior-zoning', 'knowledge:p7:daylit-window-wall-integration', 'knowledge:p7:modern-interlocking-volume'],
    verify(blueprint) {
      assert.deepEqual(blueprint.shell.volumeBoxes.map((box) => box.id), ['main', 'glass-wing', 'view-terrace']);
      assert.ok(blueprint.modules.windows > 0);
      assert.equal(blueprint.roof.style, 'flat');
    },
    verifyDifference(after, before) {
      assert.notDeepEqual(after.shell.volumeBoxes.map((box) => box.id), before.shell.volumeBoxes.map((box) => box.id));
    }
  },
  {
    id: 'medieval-multi-volume',
    prompt: MEDIEVAL_PROMPT,
    required: ['knowledge:p7:connected-mass-addition', 'knowledge:p7:scaled-column-beam-grid', 'knowledge:p7:roof-orientation-massing-fit', 'knowledge:p7:integrated-facade-bay-layering', 'knowledge:p7:facade-opening-assembly', 'knowledge:p7:weather-sheltered-entrance-transition', 'knowledge:p7:building-foundation-material-continuity'],
    verify(blueprint) {
      assert.ok(blueprint.shell.volumeBoxes.length > 1);
      assert.ok(blueprint.modules.structural_frame > 0);
      assert.ok(blueprint.geometry.roof.componentAxes.length > 0);
      assert.ok((blueprint.modules.facade_detail || 0) + (blueprint.modules.facade_relief || 0) > 0);
      assert.ok(blueprint.modules.volume_joint > 0);
      assert.ok(blueprint.modules.facade_bay > 0);
      assert.ok(blueprint.modules.opening_assembly > 0);
      assert.ok(blueprint.modules.foundation_transition > 0);
      const expectedJointIds = blueprint.shell.volumeBoxes.slice(1).map((box) => box.id).sort();
      assert.deepEqual(blueprint.geometry.csg.volumeJoints.map((joint) => joint.volumeId).sort(), expectedJointIds);
      for (const joint of blueprint.geometry.csg.volumeJoints) {
        const target = blueprint.shell.volumeBoxes.find((box) => box.id === joint.volumeId);
        assert.equal(pointInBox(joint.from, blueprint.shell.volumeBoxes[0].bounds), true);
        assert.equal(pointInBox(joint.to, target.bounds), true);
      }
      assert.deepEqual(
        [...blueprint.geometry.site.foundationTransitionVolumeIds].sort(),
        blueprint.shell.volumeBoxes.map((box) => box.id).sort()
      );
    },
    verifyDifference(after, before) {
      assert.ok(after.modules.structural_frame > before.modules.structural_frame);
      assert.ok(after.geometry.roof.componentAxes.length > 0);
      assert.equal(before.geometry.roof.componentAxes, undefined);
    }
  },
  {
    id: 'compact-residential',
    prompt: COMPACT_PROMPT,
    required: ['knowledge:p7:bounded-facade-pattern-vocabulary', 'knowledge:p7:landscape-route-and-grounding', 'knowledge:p7:function-led-interior-zoning'],
    verify(blueprint) {
      assert.equal(blueprint.shell.volumeBoxes.length, 1);
      assert.equal(blueprint.facade.relief_density, 'low');
      assert.equal(blueprint.geometry.pathfinder.failedEdgeCount, 0);
    },
    verifyDifference(after, before) {
      assert.ok(after.shell.volumeBoxes.length < before.shell.volumeBoxes.length);
      assert.equal(after.facade.relief_density, 'low');
    }
  }
];

for (const scenario of WORKFLOW_SCENARIOS) {
  test(`${scenario.id} is byte-deterministic, traceable, QA-checked, and portable`, async (t) => {
    const roots = await Promise.all([0, 1].map(() => fs.mkdtemp(path.join(os.tmpdir(), `workflow-v03-${scenario.id}-`))));
    const baselineRoot = await fs.mkdtemp(path.join(os.tmpdir(), `workflow-v02-${scenario.id}-`));
    t.after(() => Promise.all([...roots, baselineRoot].map((root) => fs.rm(root, { recursive: true, force: true }))));
    const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });
    const language = compileArchitectureLanguageV02({ prompt: scenario.prompt, overlay });
    const results = [];
    for (const outputDir of roots) {
      results.push(await runConstructionWorkflow({
        prompt: scenario.prompt, mode: 'mock', outputDir, cwd: ROOT, seed: 7101,
        architectureLanguage: language, critics: false
      }));
    }
    const [first, second] = results;
    const baseline = await runConstructionWorkflow({
      prompt: scenario.prompt, mode: 'mock', outputDir: baselineRoot, cwd: ROOT, seed: 7101, critics: false
    });
    assert.equal(first.validation.ok, true);
    assert.deepEqual(first.blueprint.operations, second.blueprint.operations);
    assert.deepEqual(first.blueprint.constructionWorkflow, second.blueprint.constructionWorkflow);
    assert.equal(first.blueprint.constructionWorkflow.rows.every((row) => row.satisfied), true);
    assert.equal(first.validation.checks.find((row) => row.name === 'construction-workflow')?.ok, true);
    if (scenario.id === 'modern-lakeside') {
      const drifted = structuredClone(first.blueprint);
      drifted.architectureLanguage.trace.extra = true;
      const driftedQa = new BlueprintQAAgent().run(drifted);
      assert.ok(driftedQa.checks.find((row) => row.name === 'construction-workflow')?.details.contractIssues
        .includes('language-plan-trace-mismatch'));
    }
    for (const id of scenario.required) assert.ok(first.blueprint.architectureLanguage.plan.selected_knowledge_ids.includes(id), id);
    assert.ok(first.blueprint.modules.entry_threshold > 0);
    scenario.verify(first.blueprint);
    scenario.verifyDifference(first.blueprint, baseline.blueprint);
    assert.notDeepEqual(first.blueprint.operations, baseline.blueprint.operations);

    const blueprintBytes = await Promise.all(results.map((result) => fs.readFile(result.artifacts.blueprint)));
    assert.equal(sha256(blueprintBytes[0]), sha256(blueprintBytes[1]));
    const pack = JSON.parse(await fs.readFile(path.join(first.artifacts.datapackDir, 'pack.mcmeta'), 'utf8'));
    assert.equal(pack.pack.pack_format, 48);
    for (const name of ['build.mcfunction', 'clear.mcfunction']) {
      const body = await fs.readFile(path.join(first.artifacts.datapackDir, 'data/architect/function', name), 'utf8');
      const commands = body.split('\n').filter((line) => line && !line.startsWith('#'));
      for (const line of commands) assertAllCommandCoordinatesRelative(line);
    }
    const report = await fs.readFile(first.artifacts.report, 'utf8');
    assert.match(report, /Construction Workflow v0\.3 results/u);
  });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertAllCommandCoordinatesRelative(line) {
  const tokens = line.trim().split(/\s+/u);
  const coordinateCount = tokens[0] === 'fill' ? 6 : tokens[0] === 'setblock' ? 3 : 0;
  assert.ok(coordinateCount > 0, `unexpected command: ${line}`);
  assert.ok(tokens.slice(1, coordinateCount + 1).every((token) => /^~-?\d*$/u.test(token)), line);
}

function pointInBox(point, box) {
  return point.x >= box.minX && point.x <= box.maxX &&
    point.y >= box.minY && point.y <= box.maxY &&
    point.z >= box.minZ && point.z <= box.maxZ;
}
