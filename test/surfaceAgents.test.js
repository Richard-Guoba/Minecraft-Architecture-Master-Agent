import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackArchitecture } from '../src/construction/agents/architectAgent.js';
import { buildFallbackTopology } from '../src/construction/agents/plannerAgent.js';
import { StylePresetMemoryAgent } from '../src/construction/agents/stylePresetMemoryAgent.js';
import { MaterialPaletteAgent } from '../src/construction/agents/materialPaletteAgent.js';
import { StructureAgent } from '../src/construction/agents/structureAgent.js';
import { FacadeAgent } from '../src/construction/agents/facadeAgent.js';
import { RoofAgent } from '../src/construction/agents/roofAgent.js';
import { SiteLandscapeAgent } from '../src/construction/agents/siteLandscapeAgent.js';
import { OpeningConnectivityAgent } from '../src/construction/agents/openingConnectivityAgent.js';
import { InteriorDetailAgent } from '../src/construction/agents/interiorDetailAgent.js';
import { ConstraintRepairAgent } from '../src/construction/agents/constraintRepairAgent.js';
import { ConstructionDecoratorAgent } from '../src/construction/agents/decoratorAgent.js';
import { deriveBuildSpec } from '../src/construction/workflow.js';
import { CSGBuilder } from '../src/construction/engine/csgBuilder.js';
import { BSPPartitioner } from '../src/construction/engine/bspPartitioner.js';
import { AStarPathfinder } from '../src/construction/engine/pathfinder.js';

test('surface agents derive palette, facade, roof, and site plans for hybrid neon coastal prompts', () => {
  const context = buildAgentContext('建一个赛博朋克海边别墅，霓虹招牌，海晶灯，青色玻璃，屋顶花园');

  assert.equal(context.stylePreset.id, 'cyberpunk-neon-core');
  assert.equal(context.materialPalette.valid, true);
  assert.equal(context.materialPalette.materials.neon, 'minecraft:sea_lantern');
  assert.equal(context.materialPalette.materials.glass, 'minecraft:cyan_stained_glass');
  assert.equal(context.facade.engine_hints.render_neon_trim, true);
  assert.equal(context.facade.window_system.glazing_ratio, 'high');
  assert.equal(context.roof.engine_hints.render_roof_garden, true);
  assert.equal(context.roof.engine_hints.render_neon_sign, true);
  assert.equal(context.site.engine_hints.render_water_edge, true);
  assert.equal(context.site.engine_hints.render_path_lights, true);
});

test('CSG consumes facade, roof, and site plans as real modules', () => {
  const context = buildAgentContext('建一个赛博朋克海边别墅，霓虹招牌，海晶灯，青色玻璃，屋顶花园');
  const counts = moduleCounts(context.shell.grid);

  assert.ok(counts.facade_light > 0);
  assert.ok(counts.facade_trim > 0);
  assert.ok(counts.roof_garden > 0);
  assert.ok(counts.roof_sign > 0);
  assert.ok(counts.landscape_path > 0);
  assert.ok(counts.path_light > 0);
  assert.equal(context.shell.csg.facade.elementCount > 0, true);
  assert.equal(context.shell.csg.roof.elementCount > 0, true);
  assert.equal(context.shell.csg.site.zoneCount > 0, true);
  assert.equal(context.shell.csg.roofPlan.elementCount > 0, true);
  assert.equal(context.shell.csg.sitePlan.zoneCount > 0, true);
});

test('opening, interior, and repair agents complete the post-layout contract', () => {
  const context = buildAgentContext('建一个悬崖边的现代住宅，悬挑观景平台，大玻璃，双开门');
  const layout = new BSPPartitioner(context.buildSpec, context.architecture.materials).fitRooms(context.shell, context.topology);
  const opening = new OpeningConnectivityAgent().run(context.prompt, context.architecture, context.buildSpec, context.topology, context.shell, layout, context.facade);
  const paths = new AStarPathfinder(context.buildSpec, context.architecture.materials).connect(context.shell, layout, context.topology, opening);
  const interior = new InteriorDetailAgent().run(layout.rooms, context.architecture, context.buildSpec, context.topology, context.materialPalette, context.stylePreset);
  const decorator = new ConstructionDecoratorAgent().run(layout.rooms, context.architecture.materials, {
    grid: context.shell.grid,
    buildSpec: context.buildSpec,
    architecture: context.architecture,
    topology: context.topology,
    paths,
    interior
  });
  const repair = new ConstraintRepairAgent().run({ grid: context.shell.grid, buildSpec: context.buildSpec, structure: context.structure, facade: context.facade, layout, paths, decorator });

  assert.ok(opening.main_entry.width >= 2);
  assert.equal(paths.pathfinder.plannedOpeningCount, opening.engine_hints.planned_opening_count);
  assert.equal(interior.room_count, layout.rooms.length);
  assert.equal(decorator.interior_source, 'local-interior-detail-agent');
  assert.equal(repair.ok, true);
});

function buildAgentContext(prompt) {
  let architecture = buildFallbackArchitecture(prompt);
  const stylePreset = new StylePresetMemoryAgent().run(prompt, architecture);
  const materialPalette = new MaterialPaletteAgent().run(prompt, architecture, stylePreset);
  architecture = { ...architecture, materials: materialPalette.materials };
  const buildSpec = deriveBuildSpec(prompt, architecture);
  const topology = buildFallbackTopology(prompt, architecture, buildSpec);
  const structure = new StructureAgent().run(architecture, buildSpec, topology);
  const facade = new FacadeAgent().run(prompt, architecture, buildSpec, topology, materialPalette, stylePreset);
  const roof = new RoofAgent().run(prompt, architecture, buildSpec, structure, facade, materialPalette, stylePreset);
  const site = new SiteLandscapeAgent().run(prompt, architecture, buildSpec, topology, materialPalette, stylePreset);
  const shell = new CSGBuilder(buildSpec, architecture.materials).generateShell(architecture, { structure, facade, roof, site });
  return { prompt, architecture, stylePreset, materialPalette, buildSpec, topology, structure, facade, roof, site, shell };
}

function moduleCounts(grid) {
  const counts = {};
  for (const item of grid.values()) counts[item.module] = (counts[item.module] || 0) + 1;
  return counts;
}
