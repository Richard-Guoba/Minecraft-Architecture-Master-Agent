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
    assert.equal(facade.exterior_detail_requirements.minimum_detail_types, 3);
    assert.equal(facade.exterior_detail_requirements.minimum_blocks_per_detail, 3);

    for (const kit of facade.exterior_detail_kits) {
      assert.ok(kit.block_count >= 3, `${label}:${kit.id} should expose at least three block types`);
      assert.ok(kit.non_full_block_count >= 3, `${label}:${kit.id} should emphasize non-full blocks`);
      for (const block of kit.blocks) assert.ok(isKnownMinecraft121Block(block), `${label}:${kit.id} uses invalid block ${block}`);
    }
  }
});

test('CSGBuilder renders exterior decorations with three-plus block palettes', () => {
  for (const [label, prompt] of REPRESENTATIVE_HOUSE_PROMPTS) {
    const { architecture, buildSpec, facade, shell } = buildAgentContext(prompt);
    const moduleBlocks = exteriorModuleBlockSets(shell.grid);
    const exteriorBlocks = new Set(Object.values(moduleBlocks).flatMap((set) => [...set]));
    const nonFullBlocks = [...exteriorBlocks].filter(isNonFullExteriorBlock);

    assert.ok(Object.keys(moduleBlocks).length >= 3, `${label} should render at least three exterior modules`);
    assert.ok(nonFullBlocks.length >= 8, `${label} should render at least eight non-full exterior block types`);
    for (const module of CORE_EXTERIOR_MODULES) {
      assert.ok(moduleBlocks[module]?.size >= 3, `${label}:${module} should render at least three block types`);
    }
    for (const [module, blocks] of Object.entries(moduleBlocks)) {
      if (module === 'facade_trim' || module === 'railing') continue;
      assert.ok(blocks.size >= 3, `${label}:${module} should render at least three block types`);
    }
    if (architecture.facade_rules?.screen || buildSpec.facade?.screens) {
      assert.ok(moduleBlocks.screens?.size >= 3, `${label}:screens should render at least three block types`);
    }
    if (architecture.facade_rules?.arches || architecture.facade_rules?.pointed_arches || buildSpec.facade?.arches) {
      assert.ok(moduleBlocks.arches?.size >= 3, `${label}:arches should render at least three block types`);
    }
    if (facade.engine_hints?.render_service_vents) {
      assert.ok(moduleBlocks.service_vent?.size >= 3, `${label}:service_vent should render at least three block types`);
    }
    if (facade.engine_hints?.render_balcony_rail) {
      assert.ok(moduleBlocks.railing?.size >= 3, `${label}:railing should render at least three block types`);
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

function blockBase(block) {
  return String(block || '').split('[')[0];
}
