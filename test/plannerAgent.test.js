import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackArchitecture } from '../src/construction/agents/architectAgent.js';
import { buildFallbackTopology, normalizeTopology } from '../src/construction/agents/plannerAgent.js';
import { deriveBuildSpec } from '../src/construction/workflow.js';

test('planner uses buildSpec and architecture semantics for Japanese courtyard houses', () => {
  const prompt = '建一个日式一层町屋，木格栅，榻榻米，茶室，枯山水小庭院，宽二十三深十九';
  const architecture = buildFallbackArchitecture(prompt);
  const buildSpec = deriveBuildSpec(prompt, architecture);
  const topology = buildFallbackTopology(prompt, architecture, buildSpec);

  assert.ok(topology.nodes.some((node) => node.id === 'tatami' && node.floor === 0));
  assert.ok(topology.nodes.some((node) => node.id === 'tea-room'));
  assert.equal(topology.floor_program.length, 1);
  assert.ok(topology.zoning.private.includes('tatami'));
  assert.ok(topology.facade_alignment.screen_priority_rooms.includes('tatami'));
  assert.ok(topology.site_connections.some((item) => item.to === 'dry_garden'));
  assert.equal(topology.bsp_hints.courtyard_bias, 'rooms-face-inward');
});

test('planner creates multi-floor castle topology with vertical core and upper program', () => {
  const prompt = '建一个哥特式四层城堡，宽33深29，厚墙，高门，带尖塔、尖拱和玫瑰窗';
  const architecture = buildFallbackArchitecture(prompt);
  const buildSpec = deriveBuildSpec(prompt, architecture);
  const topology = buildFallbackTopology(prompt, architecture, buildSpec);

  assert.equal(topology.floor_program.length, 4);
  assert.ok(topology.nodes.some((node) => node.id === 'great-hall' && node.type === 'great_hall'));
  assert.ok(topology.nodes.some((node) => node.type === 'stairs'));
  assert.ok(topology.nodes.some((node) => node.id === 'tower-room' && node.floor === 3));
  assert.equal(topology.circulation_rules.public_core, 'great-hall');
  assert.notEqual(topology.circulation_rules.vertical_core, 'none');
  assert.ok(topology.edges.some((edge) => edge.relation === 'vertical-flow'));
  assert.ok(topology.facade_alignment.arch_priority_rooms.includes('entry'));
  assert.equal(topology.bsp_hints.split_strategy, 'axis-balanced');
});

test('planner aligns modern public rooms to glass frontage and preserves normalized extras', () => {
  const prompt = '建一个现代两层房子，宽31深17，大玻璃窗，开放厨房，阳光房，带书房';
  const architecture = buildFallbackArchitecture(prompt);
  const buildSpec = deriveBuildSpec(prompt, architecture);
  const topology = normalizeTopology(buildFallbackTopology(prompt, architecture, buildSpec), 'fallback', undefined, buildSpec);

  assert.ok(topology.nodes.some((node) => node.id === 'sunroom'));
  assert.ok(topology.nodes.some((node) => node.type === 'study' && node.floor === 1));
  assert.ok(topology.facade_alignment.glass_priority_rooms.includes('living'));
  assert.ok(topology.site_connections.some((item) => item.to === 'garden'));
  assert.equal(topology.bsp_hints.glass_front_bias, 'public-rooms-on-daylight-side');
  for (const node of topology.nodes) {
    assert.ok(node.floor >= 0 && node.floor < buildSpec.floors);
    assert.equal(Object.hasOwn(node, 'x'), false);
  }
});

test('planner normalization repairs duplicate LLM room ids before geometry', () => {
  const raw = {
    nodes: [
      { id: 'entry', label: '一层入口', type: 'entry', floor: 0, weight: 0.7, privacy: 'public', zone: 'public' },
      { id: 'living', label: '一层客厅', type: 'living', floor: 0, weight: 1.5, privacy: 'public', zone: 'public' },
      { id: 'kitchen', label: '一层厨房', type: 'kitchen', floor: 0, weight: 0.9, privacy: 'service', zone: 'service' },
      { id: 'corridor', label: '二层走廊', type: 'corridor', floor: 1, weight: 0.7, privacy: 'circulation', zone: 'circulation' },
      { id: 'entry', label: '二层门厅', type: 'entry', floor: 1, weight: 0.5, privacy: 'public', zone: 'public' },
      { id: 'living', label: '二层起居', type: 'living', floor: 1, weight: 1.0, privacy: 'private', zone: 'private' },
      { id: 'kitchen', label: '二层茶水间', type: 'kitchen', floor: 1, weight: 0.5, privacy: 'service', zone: 'service' }
    ],
    edges: [
      { from: 'living', to: 'kitchen', relation: 'ambiguous-llm-edge' },
      { from: 'entry', to: 'living', relation: 'ambiguous-llm-edge' },
      { from: 'corridor', to: 'living', relation: 'upper-ambiguous-edge' }
    ],
    floor_program: []
  };

  const topology = normalizeTopology(raw, 'llm', {}, { floors: 2 });
  const ids = topology.nodes.map((node) => node.id);

  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('entry-floor-1'));
  assert.ok(ids.includes('living-floor-1'));
  assert.ok(ids.includes('kitchen-floor-1'));
  assert.ok(topology.edges.some((edge) => edge.from === 'corridor' && edge.to === 'living-floor-1'));
  assert.ok(topology.edges.every((edge) => ids.includes(edge.from) && ids.includes(edge.to)));
  assert.ok(topology.floor_program[1].private.includes('living-floor-1'));
  assert.ok(topology.floor_program[1].service.includes('kitchen-floor-1'));
});
