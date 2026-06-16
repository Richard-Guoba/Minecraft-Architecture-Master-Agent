import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackArchitecture } from '../src/construction/agents/architectAgent.js';
import { buildFallbackTopology } from '../src/construction/agents/plannerAgent.js';
import { buildFallbackStructure, StructureAgent } from '../src/construction/agents/structureAgent.js';
import { deriveBuildSpec } from '../src/construction/workflow.js';

test('StructureAgent derives treehouse trunk, stilt, deck, and load-path semantics', () => {
  const structure = structureFor('建一个树屋，树上小屋，环绕露台，木头和树叶屋顶');

  assert.equal(structure.source, 'fallback-structure');
  assert.equal(structure.foundation.strategy, 'raised-pier-footings-around-trunk');
  assert.equal(structure.stability.lateral_system, 'stilt-frame-with-trunk-core');
  assert.ok(kindSet(structure.support_elements).has('tree-trunk-core'));
  assert.ok(kindSet(structure.support_elements).has('tree-stilt-grid'));
  assert.ok(kindSet(structure.support_elements).has('deck-posts'));
  assert.ok(kindSet(structure.bracing_elements).has('knee-brace'));
  assert.ok(structure.load_paths.some((item) => item.id === 'deck-to-anchor'));
  assert.equal(structure.engine_hints.render_tree_trunk, true);
  assert.equal(structure.engine_hints.render_stilts, true);
});

test('StructureAgent derives retaining ribs and lightwell ring for subterranean houses', () => {
  const structure = structureFor('建一个地下基地，半地下庭院，采光井，厚墙');

  assert.equal(structure.foundation.strategy, 'retaining-slab-and-earth-anchors');
  assert.equal(structure.stability.lateral_system, 'retaining-ribs-and-box-action');
  assert.ok(kindSet(structure.reinforcement_elements).has('retaining-ribs'));
  assert.ok(kindSet(structure.reinforcement_elements).has('lightwell-ring'));
  assert.ok(structure.load_paths.some((item) => item.id === 'earth-pressure-to-ribs'));
  assert.equal(structure.engine_hints.render_retaining_ribs, true);
});

test('StructureAgent derives cantilever and service-spine bracing for hybrid styles', () => {
  const structure = structureFor('建一个赛博朋克海边别墅，霓虹招牌，海晶灯，青色玻璃，屋顶花园');

  assert.equal(structure.foundation.strategy, 'anchored-strip-footings');
  assert.ok(kindSet(structure.support_elements).has('column-grid'));
  assert.ok(kindSet(structure.bracing_elements).has('knee-brace'));
  assert.ok(kindSet(structure.bracing_elements).has('anchor-ties'));
  assert.ok(kindSet(structure.bracing_elements).has('x-brace'));
  assert.equal(structure.engine_hints.render_cantilever_braces, true);
  assert.equal(structure.engine_hints.render_service_braces, true);
});

test('StructureAgent run accepts context objects and positional arguments', () => {
  const prompt = '建一个现代两层房子，大玻璃，平屋顶';
  const architecture = buildFallbackArchitecture(prompt);
  const buildSpec = deriveBuildSpec(prompt, architecture);
  const topology = buildFallbackTopology(prompt, architecture, buildSpec);

  const positional = new StructureAgent().run(architecture, buildSpec, topology);
  const contextual = new StructureAgent().run({ architecture, buildSpec, topology });

  assert.deepEqual(contextual.foundation, positional.foundation);
  assert.deepEqual(contextual.engine_hints, positional.engine_hints);
});

function structureFor(prompt) {
  const architecture = buildFallbackArchitecture(prompt);
  const buildSpec = deriveBuildSpec(prompt, architecture);
  const topology = buildFallbackTopology(prompt, architecture, buildSpec);
  return buildFallbackStructure(architecture, buildSpec, topology);
}

function kindSet(items) {
  return new Set(items.map((item) => item.kind));
}
