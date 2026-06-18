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
import { isNonFullExteriorBlock } from '../src/construction/agents/exteriorDetailKits.js';
import { isKnownMinecraft121Block } from '../src/construction/agents/minecraftBlockCatalog.js';
import { deriveBuildSpec } from '../src/construction/workflow.js';
import { CSGBuilder } from '../src/construction/engine/csgBuilder.js';

const REPRESENTATIVE_HOUSE_PROMPTS = [
  ['modern', '建一个现代两层房子，宽31深17，大玻璃窗，阳光房，车库，开放厨房，平屋顶'],
  ['japanese', '建一个日式一层町屋，木格栅，榻榻米，茶室，枯山水小庭院，宽二十三深十九'],
  ['gothic', '建一个哥特式四层城堡，宽33深29，厚墙，高门，带尖塔、尖拱和玫瑰窗'],
  ['industrial', '建一个工业风三层家庭住宅，宽31深21，遮阳棚，花箱，隐私格栅，通风管线，门牌'],
  ['coastal', '建一个海滨两层度假屋，宽29深21，观景露台，大玻璃，海晶灯']
];

const CORE_EXTERIOR_MODULES = [
  'facade_detail',
  'entry_detail',
  'facade_relief'
];

test('FacadeAgent exposes balanced exterior decoration kits for every representative house family', () => {
  for (const [label, prompt] of REPRESENTATIVE_HOUSE_PROMPTS) {
    const { facade } = buildAgentContext(prompt);
    const nonFullBlocks = new Set(facade.exterior_block_palette.filter(isNonFullExteriorBlock).map(blockBase));

    assert.ok(facade.facade_elements.length >= 3, `${label} should expose at least three facade elements`);
    assert.ok(facade.exterior_detail_kits.length >= 3, `${label} should expose at least three exterior detail kits`);
    assert.ok(nonFullBlocks.size >= 8, `${label} should expose at least eight non-full exterior blocks`);
    assert.equal(facade.exterior_detail_requirements.strategy, 'quality-over-quantity');
    assert.equal(facade.exterior_detail_requirements.avoid_window_overlap, true);
    assert.ok(facade.exterior_detail_requirements.minimum_blocks_per_detail <= 1);
    assert.equal(facade.composition_strategy.window_surround_policy.keep_glass_plane_clear, true);
    assert.equal(facade.composition_strategy.blank_wall_policy.place_relief_only_on_blank_bays, true);

    for (const kit of facade.exterior_detail_kits) {
      assert.ok(kit.block_count >= 1, `${label}:${kit.id} should expose at least one block type`);
      assert.ok(kit.non_full_block_count >= 1, `${label}:${kit.id} should include non-full blocks for scale`);
      assert.equal(kit.placement_rules.avoid_window_overlap, true);
      assert.ok(kit.block_uses.length >= kit.blocks.length, `${label}:${kit.id} should explain block uses`);
      for (const block of kit.blocks) assert.ok(isKnownMinecraft121Block(block), `${label}:${kit.id} uses invalid block ${block}`);
    }
  }
});

test('CSGBuilder renders restrained exterior details without covering window glass', () => {
  for (const [label, prompt] of REPRESENTATIVE_HOUSE_PROMPTS) {
    const { architecture, buildSpec, facade, shell } = buildAgentContext(prompt);
    const moduleBlocks = exteriorModuleBlockSets(shell.grid);
    const exteriorBlocks = new Set(Object.values(moduleBlocks).flatMap((set) => [...set]));
    const nonFullBlocks = [...exteriorBlocks].filter(isNonFullExteriorBlock);

    assert.ok(Object.keys(moduleBlocks).length >= 2, `${label} should render layered exterior modules`);
    assert.ok(nonFullBlocks.length >= 3, `${label} should render non-full exterior block types`);
    assert.equal(windowObstructionCount(shell.grid), 0, `${label} should not place exterior details directly in front of window glass`);
    for (const module of CORE_EXTERIOR_MODULES) {
      if (moduleBlocks[module]) assert.ok(moduleBlocks[module].size >= 1, `${label}:${module} should render purposeful material`);
    }
    if (architecture.facade_rules?.screen || buildSpec.facade?.screens) {
      assert.ok(moduleBlocks.screens?.size >= 1, `${label}:screens should render purposeful material`);
    }
    if (architecture.facade_rules?.arches || architecture.facade_rules?.pointed_arches || buildSpec.facade?.arches) {
      assert.ok(moduleBlocks.arches?.size >= 1, `${label}:arches should render purposeful material`);
    }
    if (facade.engine_hints?.render_service_vents) {
      assert.ok(moduleBlocks.service_vent?.size >= 1, `${label}:service_vent should render purposeful material`);
    }
    if (facade.engine_hints?.render_balcony_rail) {
      assert.ok(moduleBlocks.railing?.size >= 1, `${label}:railing should render purposeful material`);
    }
  }
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
  return { architecture, buildSpec, topology, structure, facade, roof, site, shell };
}

function exteriorModuleBlockSets(grid) {
  const modules = {};
  const exteriorModules = new Set([
    ...CORE_EXTERIOR_MODULES,
    'service_vent',
    'screens',
    'arches',
    'railing',
    'facade_trim'
  ]);
  for (const cell of grid.values()) {
    if (!exteriorModules.has(cell.module)) continue;
    if (!modules[cell.module]) modules[cell.module] = new Set();
    modules[cell.module].add(blockBase(cell.block));
  }
  return modules;
}

function windowObstructionCount(grid) {
  const exteriorModules = new Set([
    ...CORE_EXTERIOR_MODULES,
    'service_vent',
    'screens',
    'arches',
    'railing',
    'facade_trim',
    'flower_box',
    'privacy_fin',
    'address_marker'
  ]);
  let count = 0;
  for (const [keyValue, cell] of grid.entries()) {
    if (!exteriorModules.has(cell.module)) continue;
    const point = parsePoint(keyValue);
    if (adjacentWindow(grid, point)) count += 1;
  }
  return count;
}

function adjacentWindow(grid, point) {
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ].some(([dx, dz]) => grid.get(`${point.x + dx},${point.y},${point.z + dz}`)?.module === 'windows');
}

function parsePoint(keyValue) {
  const [x, y, z] = keyValue.split(',').map(Number);
  return { x, y, z };
}

function blockBase(block) {
  return String(block || '').split('[')[0];
}
