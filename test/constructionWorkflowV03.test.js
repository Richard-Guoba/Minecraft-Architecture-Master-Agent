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
import { runConstructionWorkflow } from '../src/construction/workflow.js';
import { loadP7AdvisoryOverlay } from '../src/playbook/knowledge/p7AdvisoryOverlay.js';
import {
  applyArchitectureLanguageV02,
  compileArchitectureLanguageV02
} from '../src/playbook/runtime/architectureLanguageV02.js';

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
    paths: { mainDoor: { side: 'south' }, pathfinder: { failedEdgeCount: 0 } }
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
});

function moduleCounts(grid) {
  const counts = {};
  for (const cell of grid.values()) counts[cell.module] = (counts[cell.module] || 0) + 1;
  return counts;
}

const WORKFLOW_SCENARIOS = [
  {
    id: 'modern-lakeside',
    prompt: 'Build a private modern lakeside villa with three interlocking volumes, a flat parapet roof, large daylight glass, a sheltered readable entrance and path, functional interior zoning, porous public partitions, and a large-to-small furnishing pass.',
    required: ['knowledge:p7:modern-interlocking-volume', 'knowledge:p7:landscape-route-and-grounding', 'knowledge:p7:function-led-interior-zoning'],
    verify(blueprint) {
      assert.deepEqual(blueprint.shell.volumeBoxes.map((box) => box.id), ['main', 'glass-wing', 'view-terrace']);
      assert.ok(blueprint.modules.windows > 0);
      assert.equal(blueprint.roof.style, 'flat');
    }
  },
  {
    id: 'medieval-multi-volume',
    prompt: MEDIEVAL_PROMPT,
    required: ['knowledge:p7:connected-mass-addition', 'knowledge:p7:scaled-column-beam-grid', 'knowledge:p7:roof-orientation-massing-fit', 'knowledge:p7:integrated-facade-bay-layering'],
    verify(blueprint) {
      assert.ok(blueprint.shell.volumeBoxes.length > 1);
      assert.ok(blueprint.modules.structural_frame > 0);
      assert.ok(blueprint.geometry.roof.componentAxes.length > 0);
      assert.ok((blueprint.modules.facade_detail || 0) + (blueprint.modules.facade_relief || 0) > 0);
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
    }
  }
];

for (const scenario of WORKFLOW_SCENARIOS) {
  test(`${scenario.id} is byte-deterministic, traceable, QA-checked, and portable`, async (t) => {
    const roots = await Promise.all([0, 1].map(() => fs.mkdtemp(path.join(os.tmpdir(), `workflow-v03-${scenario.id}-`))));
    t.after(() => Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true }))));
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
    assert.equal(first.validation.ok, true);
    assert.deepEqual(first.blueprint.operations, second.blueprint.operations);
    assert.deepEqual(first.blueprint.constructionWorkflow, second.blueprint.constructionWorkflow);
    assert.equal(first.blueprint.constructionWorkflow.rows.every((row) => row.satisfied), true);
    assert.equal(first.validation.checks.find((row) => row.name === 'construction-workflow')?.ok, true);
    for (const id of scenario.required) assert.ok(first.blueprint.architectureLanguage.plan.selected_knowledge_ids.includes(id), id);
    assert.ok(first.blueprint.modules.entry_threshold > 0);
    scenario.verify(first.blueprint);

    const blueprintBytes = await Promise.all(results.map((result) => fs.readFile(result.artifacts.blueprint)));
    assert.equal(sha256(blueprintBytes[0]), sha256(blueprintBytes[1]));
    const pack = JSON.parse(await fs.readFile(path.join(first.artifacts.datapackDir, 'pack.mcmeta'), 'utf8'));
    assert.equal(pack.pack.pack_format, 48);
    for (const name of ['build.mcfunction', 'clear.mcfunction']) {
      const body = await fs.readFile(path.join(first.artifacts.datapackDir, 'data/architect/function', name), 'utf8');
      const commands = body.split('\n').filter((line) => line && !line.startsWith('#'));
      assert.ok(commands.every((line) => /(?:^| )~-?\d*(?: |$)/u.test(line)));
    }
    const report = await fs.readFile(first.artifacts.report, 'utf8');
    assert.match(report, /Construction Workflow v0\.3 results/u);
  });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
