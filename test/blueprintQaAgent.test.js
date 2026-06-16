import test from 'node:test';
import assert from 'node:assert/strict';
import { BlueprintQAAgent } from '../src/construction/agents/blueprintQaAgent.js';
import { CSGBuilder } from '../src/construction/engine/csgBuilder.js';
import { BSPPartitioner } from '../src/construction/engine/bspPartitioner.js';
import { AStarPathfinder } from '../src/construction/engine/pathfinder.js';
import { ConstructionDecoratorAgent } from '../src/construction/agents/decoratorAgent.js';
import { BlueprintOptimizerAgent } from '../src/construction/agents/blueprintOptimizerAgent.js';
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
import { deriveBuildSpec } from '../src/construction/workflow.js';

test('BlueprintQAAgent passes a complete generated blueprint and reports reachability', () => {
  const blueprint = buildBlueprintForQa('建一个现代两层房子，宽31深17，大玻璃窗，阳光房，车库，开放厨房，平屋顶');
  const validation = new BlueprintQAAgent().run(blueprint);

  assert.equal(validation.ok, true);
  assert.equal(validation.stats.exporter.coverageOk, true);
  assert.equal(validation.stats.circulation.failedEdgeCount, 0);
  assert.equal(validation.stats.rooms.roomCount, blueprint.layout.rooms.length);
  assert.ok(validation.stats.circulation.reachableRoomCount > 0);
  assert.ok(validation.stats.semantic.hasDecoration);
  assert.equal(validation.stats.agentContracts.missing.length, 0);
  assert.equal(validation.stats.agentContracts.repairOk, true);
  assert.ok(validation.checks.some((item) => item.name === 'agent-contracts' && item.ok));
  assert.ok(validation.checks.some((item) => item.name === 'circulation' && item.ok));
});

test('BlueprintQAAgent rejects illegal blocks and oversized fills', () => {
  const blueprint = buildBlueprintForQa('建一个现代小房子');
  blueprint.operations.push({
    kind: 'fill',
    from: { x: 0, y: 0, z: 0 },
    to: { x: 0, y: 0, z: 0 },
    block: 'bad:block'
  });
  blueprint.operations.push({
    kind: 'fill',
    from: { x: 0, y: 0, z: 0 },
    to: { x: 32, y: 30, z: 32 },
    block: 'minecraft:stone'
  });
  blueprint.geometry.exporter.operationCount = blueprint.operations.length;

  const validation = new BlueprintQAAgent().run(blueprint);

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((item) => item.includes('非法方块 ID')));
  assert.ok(validation.errors.some((item) => item.includes('fill 命令体积超过 Minecraft 限制')));
  assert.equal(validation.checks.find((item) => item.name === 'commands').ok, false);
});

test('BlueprintQAAgent rejects multi-floor blueprints without stairs', () => {
  const blueprint = buildBlueprintForQa('建一个现代两层房子，宽31深17，大玻璃窗，平屋顶');
  blueprint.paths.stairs = [];
  blueprint.geometry.pathfinder.stairCount = 0;

  const validation = new BlueprintQAAgent().run(blueprint);

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((item) => item.includes('多层建筑缺少楼梯')));
  assert.equal(validation.checks.find((item) => item.name === 'circulation').ok, false);
});

test('BlueprintQAAgent rejects missing integrated agent contracts', () => {
  const blueprint = buildBlueprintForQa('建一个现代小房子');
  delete blueprint.facade;

  const validation = new BlueprintQAAgent().run(blueprint);

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((item) => item.includes('缺少 agent 输出: facade')));
  assert.equal(validation.checks.find((item) => item.name === 'agent-contracts').ok, false);
});

function buildBlueprintForQa(prompt) {
  let architecture = buildFallbackArchitecture(prompt);
  const stylePreset = new StylePresetMemoryAgent().run(prompt, architecture);
  const materialPalette = new MaterialPaletteAgent().run(prompt, architecture, stylePreset);
  architecture = {
    ...architecture,
    materials: materialPalette.materials,
    generation_hints: {
      ...(architecture.generation_hints || {}),
      style_preset: stylePreset.id,
      material_palette: materialPalette.palette
    }
  };
  const buildSpec = deriveBuildSpec(prompt, architecture);
  const topology = buildFallbackTopology(prompt, architecture, buildSpec);
  const structure = new StructureAgent().run(architecture, buildSpec, topology);
  const facade = new FacadeAgent().run(prompt, architecture, buildSpec, topology, materialPalette, stylePreset);
  const roof = new RoofAgent().run(prompt, architecture, buildSpec, structure, facade, materialPalette, stylePreset);
  const site = new SiteLandscapeAgent().run(prompt, architecture, buildSpec, topology, materialPalette, stylePreset);
  const shell = new CSGBuilder(buildSpec, architecture.materials).generateShell(architecture, { structure, facade, roof, site });
  const layout = new BSPPartitioner(buildSpec, architecture.materials).fitRooms(shell, topology);
  const opening = new OpeningConnectivityAgent().run(prompt, architecture, buildSpec, topology, shell, layout, facade);
  const paths = new AStarPathfinder(buildSpec, architecture.materials).connect(shell, layout, topology, opening);
  const interior = new InteriorDetailAgent().run(layout.rooms, architecture, buildSpec, topology, materialPalette, stylePreset);
  const decorator = new ConstructionDecoratorAgent().run(layout.rooms, architecture.materials, {
    grid: shell.grid,
    buildSpec,
    architecture,
    topology,
    paths,
    materialPalette,
    facade,
    roof,
    site,
    opening,
    interior
  });
  const repair = new ConstraintRepairAgent().run({
    grid: shell.grid,
    buildSpec,
    architecture,
    topology,
    structure,
    facade,
    roof,
    site,
    opening,
    interior,
    layout,
    paths,
    decorator
  });
  const exportPlan = new BlueprintOptimizerAgent().run(shell.grid, {
    maxFillVolume: buildSpec.constraints.minecraft_fill_limit
  });
  return {
    version: 4,
    workflow: 'construction_method_v1',
    buildSpec,
    architecture,
    topology,
    stylePreset,
    materialPalette,
    structure,
    facade,
    roof,
    site,
    opening,
    interior,
    repair,
    geometry: {
      csg: shell.csg,
      structure: shell.csg.structure,
      facade: shell.csg.facade,
      roof: shell.csg.roof || shell.csg.roofPlan,
      site: shell.csg.site || shell.csg.sitePlan,
      bsp: layout.bsp,
      pathfinder: paths.pathfinder,
      exporter: exportPlan.optimizer,
      gridCellCount: shell.grid.size
    },
    shell: {
      bounds: shell.bounds,
      interiorSpaces: shell.interiorSpaces,
      volumeBoxes: shell.volumeBoxes
    },
    layout: {
      rooms: layout.rooms,
      interiorDoors: layout.interiorDoors,
      floorOpenings: layout.floorOpenings
    },
    paths: {
      mainDoor: paths.mainDoor,
      openedEdges: paths.openedEdges,
      stairs: paths.stairs
    },
    decorator,
    modules: moduleCounts(shell.grid),
    bounds: shell.bounds,
    operations: exportPlan.operations
  };
}

function moduleCounts(grid) {
  const counts = {};
  for (const cell of grid.values()) counts[cell.module] = (counts[cell.module] || 0) + 1;
  return counts;
}
