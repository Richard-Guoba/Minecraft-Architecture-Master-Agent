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

test('planner supplies a compact bathroom for residential prompts even when omitted', () => {
  const prompt = '建一个北欧一层紧凑小木屋，宽17深13，客厅，开放厨房，一间卧室，彩色地毯和盆栽';
  const architecture = buildFallbackArchitecture(prompt);
  const buildSpec = deriveBuildSpec(prompt, architecture);
  const topology = buildFallbackTopology(prompt, architecture, buildSpec);

  assert.ok(topology.nodes.some((node) => node.type === 'bathroom' && node.floor === 0));
  assert.ok(topology.zoning.service.some((id) => topology.nodes.find((node) => node.id === id)?.type === 'bathroom'));
  assert.equal(topology.bsp_hints.wet_rooms_near_service_core, true);
});

test('planner normalization infers LLM room types from ids when type is generic room', () => {
  const fallback = buildFallbackTopology(
    '建一个现代紧凑一层住宅，宽17深15，一间卧室，一个卫生间，客厅，厨房，餐厅，玄关和储藏间',
    buildFallbackArchitecture('建一个现代紧凑一层住宅，宽17深15，一间卧室，一个卫生间，客厅，厨房，餐厅，玄关和储藏间'),
    { floors: 1, scale: 'small', style_family: 'modern', door_side: 'south' }
  );
  const raw = {
    nodes: [
      { id: 'entry', label: '玄关', type: 'room', floor: 0, weight: 1, privacy: 'public' },
      { id: 'living', label: '客厅', type: 'room', floor: 0, weight: 2, privacy: 'public' },
      { id: 'kitchen', label: '厨房', type: 'room', floor: 0, weight: 1, privacy: 'service' },
      { id: 'bathroom', label: '卫生间', type: 'room', floor: 0, weight: 1, privacy: 'service' },
      { id: 'storage', label: '储藏间', type: 'room', floor: 0, weight: 1, privacy: 'service' }
    ],
    edges: []
  };

  const topology = normalizeTopology(raw, 'llm', fallback, { floors: 1 });
  const typeCounts = new Map(topology.nodes.map((node) => [node.type, (topology.nodes.filter((item) => item.type === node.type)).length]));

  assert.equal(topology.nodes.find((node) => node.id === 'living').type, 'living');
  assert.equal(topology.nodes.find((node) => node.id === 'kitchen').type, 'kitchen');
  assert.equal(topology.nodes.find((node) => node.id === 'bathroom').type, 'bathroom');
  assert.equal(topology.nodes.find((node) => node.id === 'storage').type, 'storage');
  assert.equal(typeCounts.get('living'), 1);
  assert.equal(typeCounts.get('kitchen'), 1);
  assert.equal(typeCounts.get('bathroom'), 1);
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

test('planner normalization shifts one-based LLM floors to zero-based floors', () => {
  const raw = {
    nodes: [
      { id: 'entry', label: '一层门厅', type: 'entry', floor: 1, weight: 1, privacy: 'public', zone: 'public' },
      { id: 'living', label: '一层客厅', type: 'living', floor: 1, weight: 2, privacy: 'public', zone: 'public' },
      { id: 'stairs', label: '楼梯', type: 'stairs', floor: 1, weight: 0.7, privacy: 'circulation', zone: 'circulation' },
      { id: 'corridor', label: '二层走廊', type: 'corridor', floor: 2, weight: 0.7, privacy: 'circulation', zone: 'circulation' },
      { id: 'bedroom', label: '二层卧室', type: 'bedroom', floor: 2, weight: 1, privacy: 'private', zone: 'private' }
    ],
    floor_program: [
      { floor: 1, public: ['entry', 'living'], circulation: ['stairs'] },
      { floor: 2, private: ['bedroom'], circulation: ['corridor'] }
    ]
  };

  const topology = normalizeTopology(raw, 'llm', {}, { floors: 3 });

  assert.equal(topology.nodes.find((node) => node.id === 'entry').floor, 0);
  assert.equal(topology.nodes.find((node) => node.id === 'corridor').floor, 1);
  assert.ok(topology.floor_program[0].public.includes('entry'));
  assert.ok(topology.floor_program[1].private.includes('bedroom'));
  assert.ok(topology.edges.some((edge) => edge.from === 'stairs' && edge.to === 'corridor'));
});

test('planner applies template design laws to fallback topology', () => {
  const prompt = '建一个现代湖边别墅，带非平坦自然地形、前景花园、水边平台、大玻璃和屋顶露台';
  const architecture = buildFallbackArchitecture(prompt);
  const designLawPack = {
    active: true,
    source: 'test-planner-design-laws',
    selected_laws: [
      { id: 'site-waterfront-public-threshold', domain: 'site', rule: 'Water edge public rooms align to deck and view.', implementation_clauses: ['place living/dining/lounge rooms on the water/view side'] },
      { id: 'site-foreground-garden-rooms', domain: 'site', rule: 'Foreground garden rooms frame entry.', implementation_clauses: ['reserve a foreground zone before the facade'] },
      { id: 'site-terrain-plinth-sequence', domain: 'site', rule: 'Non-flat terrain becomes stone and earth plinth.', implementation_clauses: ['build a layered stone/earth base before placing the main shell'] },
      { id: 'facade-glass-view-axis', domain: 'facade', rule: 'Large glass attaches to public view axis.', implementation_clauses: ['assign large glass to living/dining/lounge or stair reveal zones'] },
      { id: 'roof-usable-terrace-system', domain: 'roof', rule: 'Roof terrace needs access and view edge.', implementation_clauses: ['include stair or internal access logic to the roof terrace'] }
    ],
    interior_laws: [
      { id: 'interior-room-identity-layer-stack', domain: 'interior', rule: 'Important rooms need identity stack.', implementation_clauses: ['give each room one focal wall or task wall before adding loose decor'] }
    ],
    implementation_clauses: [
      'connect public rooms to a deck, terrace, pier, or reflection basin',
      'use height bands, retaining edges, and planting pockets instead of a flat lot'
    ]
  };
  architecture.generation_hints = {
    ...(architecture.generation_hints || {}),
    template_design_law_pack: designLawPack
  };
  const buildSpec = deriveBuildSpec(prompt, architecture);
  buildSpec.design = { ...(buildSpec.design || {}), template_design_law_pack: designLawPack };
  const topology = buildFallbackTopology(prompt, architecture, buildSpec);

  assert.equal(topology.template_design_law_runtime.active, true);
  assert.ok(topology.facade_alignment.template_design_law_public_view_axis);
  assert.ok(topology.facade_alignment.glass_priority_rooms.includes('living'));
  assert.ok(topology.site_connections.some((item) => item.to === 'water_edge'));
  assert.ok(topology.site_connections.some((item) => item.to === 'foreground_garden'));
  assert.ok(topology.site_connections.some((item) => item.to === 'terrain_plinth'));
  assert.ok(topology.site_connections.some((item) => item.to === 'roof_terrace'));
  assert.equal(topology.bsp_hints.template_design_law_active, true);
});
