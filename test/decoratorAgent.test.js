import test from 'node:test';
import assert from 'node:assert/strict';
import { ConstructionDecoratorAgent } from '../src/construction/agents/decoratorAgent.js';
import { InteriorDetailAgent } from '../src/construction/agents/interiorDetailAgent.js';
import { interiorSpecialistCapabilities } from '../src/construction/agents/interiorRoomAgents.js';
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

test('Interior specialist agents expose at least fifty controllable blocks each', () => {
  const capabilities = interiorSpecialistCapabilities();
  const expected = [
    'local-bedroom-decoration-agent',
    'local-dining-decoration-agent',
    'local-gothic-interior-style-agent',
    'local-japanese-interior-style-agent',
    'local-kitchen-decoration-agent',
    'local-living-room-decoration-agent',
    'local-modern-interior-style-agent',
    'local-study-decoration-agent'
  ];
  const sources = new Set(capabilities.map((item) => item.source));

  assert.ok(capabilities.length >= 20);
  for (const source of expected) assert.ok(sources.has(source), `${source} should be registered`);
  for (const agent of capabilities) {
    assert.ok(agent.block_count >= 50, `${agent.source} should control at least 50 blocks`);
    assert.ok(new Set(agent.capability_blocks).size >= 50, `${agent.source} should expose 50 unique blocks`);
    assert.ok(agent.capability_blocks.some((block) => block.includes('_carpet')), `${agent.source} should include colorful carpets`);
    assert.ok(agent.capability_blocks.some((block) => block.includes('_banner')), `${agent.source} should include banners`);
    assert.ok(agent.capability_blocks.some((block) => block.includes('_candle')), `${agent.source} should include colored candles`);
    assert.ok(agent.capability_blocks.some((block) => block.includes('potted_')), `${agent.source} should include potted plants`);
  }
});

test('DecoratorAgent activates kitchen, living room, bedroom, and study specialists', () => {
  const { decorator, interior } = buildDecorated('建一个现代两层大房子，宽31深17，大玻璃窗，开放厨房，三间卧室，书房，客厅');
  const expected = [
    'local-kitchen-decoration-agent',
    'local-living-room-decoration-agent',
    'local-bedroom-decoration-agent',
    'local-study-decoration-agent',
    'local-modern-interior-style-agent'
  ];
  const active = new Set(decorator.activeSpecialists.map((item) => item.agent_id));
  const uniquePlacedBlocks = new Set(decorator.placements.map((item) => item.block.split('[')[0]));
  const vibrantPlacements = decorator.placements.filter((item) => item.role.startsWith('vibrant'));
  const vibrantBlocks = new Set(vibrantPlacements.map((item) => item.block.split('[')[0]));

  assert.ok(interior.room_specialists.length >= 20);
  assert.ok(interior.room_specialists.every((agent) => agent.block_count >= 50));
  assert.equal(interior.engine_hints.minimum_blocks_per_specialist, 50);
  assert.ok(uniquePlacedBlocks.size >= 50);
  assert.ok(vibrantPlacements.length >= 40);
  assert.ok(vibrantBlocks.size >= 20);
  assert.ok([...vibrantBlocks].some((block) => block.endsWith('_glazed_terracotta')));
  assert.ok([...vibrantBlocks].some((block) => block.endsWith('_stained_glass_pane')));
  assert.ok([...vibrantBlocks].some((block) => block.endsWith('_candle')));
  for (const source of expected) {
    assert.ok(active.has(source), `${source} should be active`);
    assert.ok(decorator.stats.byAgent[source] > 0, `${source} should write placements`);
  }

  assert.ok(decorator.placements.some((item) => item.agent_id === 'local-kitchen-decoration-agent' && item.role === 'range-hood'));
  assert.ok(decorator.placements.some((item) => item.agent_id === 'local-living-room-decoration-agent' && item.role === 'media-wall'));
  assert.ok(decorator.placements.some((item) => item.agent_id === 'local-bedroom-decoration-agent' && item.role === 'wardrobe'));
  assert.ok(decorator.placements.some((item) => item.agent_id === 'local-study-decoration-agent' && item.role === 'reading-lamp'));
  assert.ok(decorator.placements.some((item) => item.agent_id === 'local-modern-interior-style-agent' && item.role.includes('modern-style')));
});

test('DecoratorAgent combines architectural style specialists with special room experts', () => {
  const japanese = buildDecorated('建一个日式一层町屋，木格栅，榻榻米，茶室，枯山水小庭院，宽二十三深十九');
  const gothic = buildDecorated('建一个哥特式四层城堡，宽33深29，厚墙，高门，带尖塔、尖拱和玫瑰窗');
  const japaneseActive = new Set(japanese.decorator.activeSpecialists.map((item) => item.agent_id));
  const gothicActive = new Set(gothic.decorator.activeSpecialists.map((item) => item.agent_id));

  assert.ok(japaneseActive.has('local-japanese-interior-style-agent'));
  assert.ok(japaneseActive.has('local-tatami-decoration-agent'));
  assert.ok(japaneseActive.has('local-tea-room-decoration-agent'));
  assert.ok(gothicActive.has('local-gothic-interior-style-agent'));
  assert.ok(gothicActive.has('local-armory-decoration-agent'));
  assert.ok(gothicActive.has('local-tower-decoration-agent'));
});

function buildDecorated(prompt) {
  const architecture = buildFallbackArchitecture(prompt);
  const buildSpec = deriveBuildSpec(prompt, architecture);
  const topology = buildFallbackTopology(prompt, architecture, buildSpec);
  const shell = new CSGBuilder(buildSpec, architecture.materials).generateShell(architecture);
  const layout = new BSPPartitioner(buildSpec, architecture.materials).fitRooms(shell, topology);
  const paths = new AStarPathfinder(buildSpec, architecture.materials).connect(shell, layout, topology);
  const interior = new InteriorDetailAgent().run(layout.rooms, architecture, buildSpec, topology, { materials: architecture.materials }, {});
  const decorator = new ConstructionDecoratorAgent().run(layout.rooms, architecture.materials, {
    grid: shell.grid,
    buildSpec,
    architecture,
    topology,
    paths,
    interior
  });
  return { architecture, buildSpec, topology, shell, layout, paths, interior, decorator };
}

function moduleCounts(grid) {
  const counts = {};
  for (const item of grid.values()) counts[item.module] = (counts[item.module] || 0) + 1;
  return counts;
}
