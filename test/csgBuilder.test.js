import test from 'node:test';
import assert from 'node:assert/strict';
import { CSGBuilder } from '../src/construction/engine/csgBuilder.js';
import { buildFallbackArchitecture } from '../src/construction/agents/architectAgent.js';
import { buildFallbackTopology } from '../src/construction/agents/plannerAgent.js';
import { buildFallbackStructure } from '../src/construction/agents/structureAgent.js';
import { deriveBuildSpec } from '../src/construction/workflow.js';

test('CSGBuilder turns Japanese courtyard semantics into screens, patio, and dry garden geometry', () => {
  const prompt = '建一个日式一层町屋，木格栅，榻榻米，茶室，枯山水小庭院，宽二十三深十九，门在北侧';
  const architecture = buildFallbackArchitecture(prompt);
  const spec = deriveBuildSpec(prompt, architecture);
  const shell = new CSGBuilder(spec, architecture.materials).generateShell(architecture);
  const counts = moduleCounts(shell.grid);

  assert.equal(shell.csg.roofStyle, 'hipped');
  assert.equal(shell.csg.shellThickness, 1);
  assert.ok(shell.volumeBoxes.some((box) => box.id === 'front-gate' && box.module === 'porch'));
  assert.ok(counts.screens > 0);
  assert.ok(counts.dry_garden > 0);
  assert.ok(counts.patio > 0);
  assert.ok(shell.bounds.maxZ > spec.depth);
});

test('CSGBuilder consumes fortified Gothic rules as thick shells, tower massing, buttresses, and arches', () => {
  const prompt = '建一个哥特式四层城堡，宽33深29，厚墙，高门，带尖塔、尖拱和玫瑰窗';
  const architecture = buildFallbackArchitecture(prompt);
  const spec = deriveBuildSpec(prompt, architecture);
  const shell = new CSGBuilder(spec, architecture.materials).generateShell(architecture);
  const counts = moduleCounts(shell.grid);
  const mainInterior = shell.interiorSpaces.find((space) => space.source === 'main' && space.floor === 0);

  assert.equal(shell.csg.shellThickness, 2);
  assert.equal(shell.csg.structuralSystem, 'stone-buttress-and-vault');
  assert.ok(shell.volumeBoxes.some((box) => box.id === 'corner-tower' && box.module === 'tower' && box.shape === 'cylinder'));
  assert.ok(counts.tower > 0);
  assert.ok(counts.buttress > 0);
  assert.ok(counts.arches > 0);
  assert.ok(counts.roof_detail > 0);
  assert.equal(mainInterior.min_x, 2);
  assert.equal(mainInterior.min_z, 2);
});

test('CSGBuilder maps modern glass additions to transparent shells, flat parapets, and skylights', () => {
  const prompt = '建一个现代两层房子，宽31深17，大玻璃窗，阳光房，平屋顶，屋顶天窗';
  const architecture = buildFallbackArchitecture(prompt);
  const spec = deriveBuildSpec(prompt, architecture);
  const shell = new CSGBuilder(spec, architecture.materials).generateShell(architecture);
  const counts = moduleCounts(shell.grid);

  assert.equal(shell.csg.roofStyle, 'flat');
  assert.ok(shell.volumeBoxes.some((box) => box.module === 'sunroom'));
  assert.ok([...shell.grid.values()].some((item) => item.module === 'sunroom' && item.block === architecture.materials.glass));
  assert.ok(counts.skylight > 0);
  assert.ok(counts.roof_detail > 0);
});

test('CSGBuilder maps style grammar decks and service spines to semantic modules', () => {
  const prompt = '建一个赛博朋克海边别墅，霓虹招牌，海晶灯，青色玻璃，屋顶花园';
  const architecture = buildFallbackArchitecture(prompt);
  const spec = deriveBuildSpec(prompt, architecture);
  const shell = new CSGBuilder(spec, architecture.materials).generateShell(architecture);
  const counts = moduleCounts(shell.grid);

  assert.equal(architecture.style, '赛博朋克');
  assert.ok(shell.volumeBoxes.some((box) => box.id === 'ocean-deck' && box.module === 'gallery'));
  assert.ok(shell.volumeBoxes.some((box) => box.id === 'service-core' && box.module === 'tower'));
  assert.ok(counts.gallery > 0);
  assert.ok(counts.tower > 0);
  assert.ok(counts.water_feature > 0);
});

test('CSGBuilder renders structure-agent retaining ribs for subterranean houses', () => {
  const { shell, structure } = buildStructuredShell('建一个地下基地，半地下庭院，采光井，厚墙');
  const counts = moduleCounts(shell.grid);

  assert.equal(structure.foundation.strategy, 'retaining-slab-and-earth-anchors');
  assert.equal(shell.csg.structure.foundationStrategy, 'retaining-slab-and-earth-anchors');
  assert.ok(counts.retaining_wall > 0);
  assert.ok(counts.structural_frame > 0);
  assert.equal(shell.csg.structure.reinforcementElementCount, 3);
});

test('CSGBuilder renders structure-agent braces and anchors for cantilever decks', () => {
  const { shell, structure } = buildStructuredShell('建一个悬崖边的现代住宅，悬挑观景平台，大玻璃');
  const counts = moduleCounts(shell.grid);

  assert.equal(structure.foundation.strategy, 'anchored-strip-footings');
  assert.ok(structure.bracing_elements.some((item) => item.kind === 'knee-brace'));
  assert.ok(counts.bracing > 0);
  assert.ok(counts.foundation_anchor > 0);
  assert.ok(shell.csg.structure.bracingElementCount >= 2);
});

test('CSGBuilder renders structure-agent trunk core for treehouses', () => {
  const { shell, structure } = buildStructuredShell('建一个树屋，树上小屋，环绕露台，木头和树叶屋顶');
  const counts = moduleCounts(shell.grid);

  assert.equal(structure.stability.lateral_system, 'stilt-frame-with-trunk-core');
  assert.ok(structure.support_elements.some((item) => item.kind === 'tree-trunk-core'));
  assert.ok(counts.structural_frame > 0);
  assert.ok(counts.bracing > 0);
  assert.equal(shell.csg.structure.lateralSystem, 'stilt-frame-with-trunk-core');
});

function moduleCounts(grid) {
  const counts = {};
  for (const item of grid.values()) counts[item.module] = (counts[item.module] || 0) + 1;
  return counts;
}

function buildStructuredShell(prompt) {
  const architecture = buildFallbackArchitecture(prompt);
  const spec = deriveBuildSpec(prompt, architecture);
  const topology = buildFallbackTopology(prompt, architecture, spec);
  const structure = buildFallbackStructure(architecture, spec, topology);
  const shell = new CSGBuilder(spec, architecture.materials).generateShell(architecture, structure);
  return { architecture, spec, topology, structure, shell };
}
