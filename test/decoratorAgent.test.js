import test from 'node:test';
import assert from 'node:assert/strict';
import { ConstructionDecoratorAgent } from '../src/construction/agents/decoratorAgent.js';
import { CSGBuilder } from '../src/construction/engine/csgBuilder.js';
import { BSPPartitioner } from '../src/construction/engine/bspPartitioner.js';
import { AStarPathfinder } from '../src/construction/engine/pathfinder.js';
import { buildFallbackArchitecture } from '../src/construction/agents/architectAgent.js';
import { buildFallbackTopology } from '../src/construction/agents/plannerAgent.js';
import { deriveBuildSpec } from '../src/construction/workflow.js';

test('DecoratorAgent writes Japanese tatami and tea-room furnishings into the grid', () => {
  const { shell, decorator } = buildDecorated('建一个日式一层町屋，木格栅，榻榻米，茶室，枯山水小庭院，宽二十三深十九');
  const modules = moduleCounts(shell.grid);

  assert.equal(decorator.enabled, true);
  assert.equal(decorator.style_family, 'japanese');
  assert.ok(decorator.placementCount > 0);
  assert.ok(modules.decor_floor > 0);
  assert.ok(modules.decor_plant > 0);
  assert.ok(decorator.placements.some((item) => item.room_id === 'tatami' && item.role === 'low-table' && item.block.startsWith('minecraft:bamboo_slab')));
  assert.ok(decorator.placements.some((item) => item.room_id === 'tatami' && item.block === 'minecraft:lime_carpet'));
  assert.ok(decorator.placements.some((item) => item.room_id === 'tea-room' && item.block === 'minecraft:potted_bamboo'));
});

test('DecoratorAgent adds Gothic ceremonial, armory, and tower furnishings', () => {
  const { shell, decorator } = buildDecorated('建一个哥特式四层城堡，宽33深29，厚墙，高门，带尖塔、尖拱和玫瑰窗');
  const modules = moduleCounts(shell.grid);

  assert.equal(decorator.style_family, 'gothic');
  assert.ok(modules.decor_light > 0);
  assert.ok(modules.decor_detail > 0);
  assert.ok(decorator.placements.some((item) => item.room_id === 'great-hall' && item.role === 'hearth'));
  assert.ok(decorator.placements.some((item) => item.room_id === 'armory' && item.block === 'minecraft:anvil'));
  assert.ok(decorator.placements.some((item) => item.room_id === 'tower-room' && item.role === 'lookout'));
  assert.ok(decorator.placements.some((item) => item.block.includes('soul_lantern') || item.block === 'minecraft:candle'));
});

test('DecoratorAgent furnishes modern sunrooms and garages with functional props', () => {
  const { shell, decorator } = buildDecorated('建一个现代两层房子，宽31深17，大玻璃窗，阳光房，车库，开放厨房，平屋顶');
  const modules = moduleCounts(shell.grid);

  assert.equal(decorator.style_family, 'modern');
  assert.ok(modules.decor_furniture > 0);
  assert.ok(modules.decor_plant > 0);
  assert.ok(decorator.placements.some((item) => item.type === 'sunroom' && item.block === 'minecraft:composter'));
  assert.ok(decorator.placements.some((item) => item.type === 'sunroom' && item.block === 'minecraft:oak_leaves[persistent=true]'));
  assert.ok(decorator.placements.some((item) => item.room_id === 'garage' && item.block === 'minecraft:smithing_table'));
  assert.ok(decorator.placements.some((item) => item.block === 'minecraft:sea_lantern'));
});

function buildDecorated(prompt) {
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
  return { architecture, buildSpec, topology, shell, layout, paths, decorator };
}

function moduleCounts(grid) {
  const counts = {};
  for (const item of grid.values()) counts[item.module] = (counts[item.module] || 0) + 1;
  return counts;
}
