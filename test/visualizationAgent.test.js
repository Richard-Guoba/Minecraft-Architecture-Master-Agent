import test from 'node:test';
import assert from 'node:assert/strict';
import { VisualizationAgent } from '../src/construction/agents/visualizationAgent.js';
import { BlueprintQAAgent } from '../src/construction/agents/blueprintQaAgent.js';
import { CSGBuilder, computeBounds } from '../src/construction/engine/csgBuilder.js';
import { BSPPartitioner } from '../src/construction/engine/bspPartitioner.js';
import { AStarPathfinder } from '../src/construction/engine/pathfinder.js';
import { ConstructionDecoratorAgent } from '../src/construction/agents/decoratorAgent.js';
import { BlueprintOptimizerAgent } from '../src/construction/agents/blueprintOptimizerAgent.js';
import { buildFallbackArchitecture } from '../src/construction/agents/architectAgent.js';
import { buildFallbackTopology } from '../src/construction/agents/plannerAgent.js';
import { deriveBuildSpec } from '../src/construction/workflow.js';

test('VisualizationAgent renders multi-floor plans, QA checks, modules, paths, and decorations', () => {
  const { blueprint, validation } = buildPreviewData('建一个现代两层房子，宽31深17，大玻璃窗，阳光房，车库，开放厨房，平屋顶');
  const html = new VisualizationAgent().render({ prompt: blueprint.prompt, blueprint, validation });

  assert.match(html, /MC Architect Preview/);
  assert.match(html, /多层平面/);
  assert.match(html, /一层/);
  assert.match(html, /2层/);
  assert.match(html, /QA 检查/);
  assert.match(html, /导出压缩/);
  assert.match(html, /模块/);
  assert.match(html, /class="path-line"/);
  assert.match(html, /class="decor"/);
  assert.match(html, /sunroom|阳光房/);
  assert.doesNotMatch(html, /<script/i);
});

test('VisualizationAgent escapes prompt and room labels in static HTML', () => {
  const { blueprint, validation } = buildPreviewData('建一个现代小房子 <script>alert(1)</script>');
  blueprint.layout.rooms[0].label = '<b>入口</b>';
  const html = new VisualizationAgent().render({ prompt: blueprint.prompt, blueprint, validation });

  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;b&gt;入口&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
});

test('VisualizationAgent renders expanded agent capability summaries', () => {
  const { blueprint, validation } = buildPreviewData('建一个现代小房子，太阳能屋顶，雨水回收，无障碍坡道');
  Object.assign(blueprint, {
    stylePreset: { id: 'resilient-family-upgrade', signatures: ['solar', 'rain', 'accessible'] },
    materialPalette: { roles: ['wall', 'roof', 'trim', 'glass', 'solar', 'rain', 'pool', 'plant'], controllableBlockCount: 72 },
    structure: {
      support_elements: [{}, {}],
      bracing_elements: [{}],
      reinforcement_elements: [{}],
      stability: { lateral_system: 'bearing-wall-box-action' }
    },
    facade: { facade_elements: ['awning', 'flower-box', 'privacy-fin'], window_system: { rhythm: 'layered' } },
    roof: { elements: [{}, {}, {}], service_strategy: { maintenance_zone: 'reserved-roof-service-strip' } },
    site: { zones: ['pool', 'planting-beds', 'outdoor-living'], terrain_response: 'garden-ready' },
    opening: { daylight_targets: ['living'], secondary_exits: ['back-door'], emergency_egress: { strategy: 'two-way-egress' } },
    interior: { room_specialists: ['kitchen', 'living'], comfort_strategy: { density_target: 'rich' } },
    repair: { checks: [{}, {}], ok: true },
    geometry: {
      ...blueprint.geometry,
      exporter: { ...blueprint.geometry.exporter, moduleTypeCount: 20, operationCount: 123 }
    }
  });
  const html = new VisualizationAgent().render({ prompt: blueprint.prompt, blueprint, validation });

  assert.match(html, /Agent能力项/);
  assert.match(html, /能力项/);
  assert.match(html, /MaterialPalette/);
  assert.match(html, /72 blocks/);
  assert.match(html, /reserved-roof-service-strip/);
  assert.match(html, /two-way-egress/);
});

function buildPreviewData(prompt) {
  const architecture = buildFallbackArchitecture(prompt);
  const buildSpec = deriveBuildSpec(prompt, architecture);
  const topology = buildFallbackTopology(prompt, architecture, buildSpec);
  const shell = new CSGBuilder(buildSpec, architecture.materials).generateShell(architecture);
  const layout = new BSPPartitioner(buildSpec, architecture.materials).fitRooms(shell, topology);
  const paths = new AStarPathfinder(buildSpec, architecture.materials).connect(shell, layout, topology);
  const decorator = new ConstructionDecoratorAgent().run(layout.rooms, architecture.materials, {
    grid: shell.grid,
    buildSpec,
    architecture,
    topology,
    paths
  });
  const bounds = computeBounds(shell.grid);
  const exportPlan = new BlueprintOptimizerAgent().run(shell.grid, {
    maxFillVolume: buildSpec.constraints.minecraft_fill_limit
  });
  const blueprint = {
    version: 4,
    workflow: 'construction_method_v1',
    prompt,
    buildSpec,
    architecture,
    topology,
    geometry: {
      csg: shell.csg,
      bsp: layout.bsp,
      pathfinder: paths.pathfinder,
      exporter: exportPlan.optimizer,
      gridCellCount: shell.grid.size
    },
    shell: {
      bounds,
      interiorSpaces: shell.interiorSpaces,
      volumeBoxes: shell.volumeBoxes.map((box) => ({
        id: box.id,
        role: box.role,
        shape: box.shape,
        module: box.module,
        bounds: {
          minX: box.min_x,
          maxX: box.max_x,
          minY: box.min_y,
          maxY: box.max_y,
          minZ: box.min_z,
          maxZ: box.max_z
        }
      }))
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
    bounds,
    operations: exportPlan.operations
  };
  return { blueprint, validation: new BlueprintQAAgent().run(blueprint) };
}

function moduleCounts(grid) {
  const counts = {};
  for (const cell of grid.values()) counts[cell.module] = (counts[cell.module] || 0) + 1;
  return counts;
}
