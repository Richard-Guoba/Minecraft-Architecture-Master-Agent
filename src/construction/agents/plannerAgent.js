import { detectFloors, detectStyle } from './architectAgent.js';

const ROOM_TYPES = new Set([
  'entry',
  'living',
  'great_hall',
  'dining',
  'kitchen',
  'stairs',
  'corridor',
  'bedroom',
  'master_bedroom',
  'study',
  'bathroom',
  'utility',
  'storage',
  'garage',
  'balcony',
  'lounge',
  'tea_room',
  'tatami',
  'workshop',
  'greenhouse',
  'sunroom',
  'tower',
  'chapel',
  'armory',
  'room'
]);

export class ConstructionPlannerAgent {
  constructor({ llmClient, mode = 'auto' } = {}) {
    this.llmClient = llmClient;
    this.mode = ['auto', 'mock', 'llm'].includes(mode) ? mode : 'auto';
  }

  async run(prompt, architectureJson, buildSpec = {}) {
    const fallback = normalizeTopology(buildFallbackTopology(prompt, architectureJson, buildSpec), 'fallback', undefined, buildSpec);
    if (this.mode === 'mock') return fallback;

    if (this.mode === 'llm' || (this.mode === 'auto' && this.llmClient?.isConfigured())) {
      try {
        const parsed = await this.llmClient.chatJson({
          system: [
            '你是一个严谨的 Minecraft 建筑平面规划 Agent。',
            '你只输出房间拓扑和空间组织规则，不允许输出具体长宽高或 XYZ 坐标。',
            '只输出严格 JSON object；不要 Markdown、注释、解释文字或尾随逗号。',
            '所有数组元素、对象属性都必须用英文逗号分隔。字符串内不要使用未转义的双引号。',
            '保持输出精简：每层 3-5 个核心房间即可，避免生成冗长描述。',
            '必需字段: nodes, edges, floor_program, zoning, circulation_rules, facade_alignment, site_connections, bsp_hints。',
            'nodes 每项包含 id, label, type, floor, weight, privacy，可选 zone, orientation, access, daylight, tags。',
            'edges 每项包含 from, to, relation，可选 priority。',
            'floor_program 按楼层描述 public/private/service/circulation/outdoor 节点。',
            'circulation_rules 描述入口、公区核心、竖向核心、走廊策略、门策略。',
            'facade_alignment 描述哪些房间响应大玻璃、拱门、格栅、阳台、庭院朝向。',
            'site_connections 描述房间到花园、水景、枯山水、车库、露台等场地元素的关系。',
            'bsp_hints 给本地 BSP 几何引擎使用，不能包含绝对坐标。'
          ].join('\n'),
          user: JSON.stringify({
            user_prompt: prompt,
            architecture_json: {
              style: architectureJson.style,
              style_family: architectureJson.style_family,
              typology: architectureJson.typology,
              footprint: architectureJson.footprint,
              volumes: architectureJson.volumes,
              facade_rules: architectureJson.facade_rules,
              roof_rules: architectureJson.roof_rules,
              site_rules: architectureJson.site_rules,
              structural_rules: architectureJson.structural_rules,
              generation_hints: architectureJson.generation_hints
            },
            build_spec: compactBuildSpec(buildSpec)
          })
        });
        return normalizeTopology(parsed, 'llm', fallback, buildSpec);
      } catch (error) {
        if (this.mode === 'llm') throw error;
        return { ...fallback, source: 'fallback-after-llm-error', llm_error: error.message };
      }
    }

    return fallback;
  }
}

export function buildFallbackTopology(prompt, architectureJson = {}, buildSpec = {}) {
  const style = architectureJson.style || buildSpec.style || detectStyle(prompt);
  const styleFamily = architectureJson.style_family || buildSpec.style_family || 'general';
  const typology = architectureJson.typology || buildSpec.typology || inferTypology(prompt, style);
  const footprint = architectureJson.footprint || buildSpec.footprint || 'rectangle';
  const floors = Number(buildSpec.floors || detectFloors(prompt, footprint === 'winged' ? 'large' : undefined));
  const requested = requestedProgram(prompt);
  const nodes = [];

  addGroundFloor(nodes, { prompt, style, styleFamily, typology, footprint, buildSpec, requested });
  addUpperFloors(nodes, { prompt, style, styleFamily, typology, floors, buildSpec, requested });
  addSpecialRooms(nodes, { prompt, style, styleFamily, typology, floors, buildSpec, requested });
  ensureVerticalCore(nodes, floors, typology);
  ensureUniqueIds(nodes);

  const edges = buildEdges(nodes, { styleFamily, typology, footprint, buildSpec });
  const floorProgram = buildFloorProgram(nodes, floors);
  const zoning = buildZoning(nodes);
  const verticalCore = firstNodeId(nodes, 'stairs') || firstNodeId(nodes, 'tower') || 'none';
  const publicCore = choosePublicCore(nodes, typology);

  return {
    nodes,
    edges,
    floor_program: floorProgram,
    zoning,
    circulation_rules: {
      entry_node: 'entry',
      public_core: publicCore,
      vertical_core: verticalCore,
      connect_all_rooms: true,
      door_policy: 'use_pathfinder_after_bsp',
      corridor_policy: corridorPolicy({ floors, typology, footprint, styleFamily }),
      stair_policy: floors > 1 ? 'near-entry-but-not-blocking-public-core' : 'none',
      accessibility_notes: floors > 1 ? ['vertical core must connect every upper-floor private zone'] : []
    },
    facade_alignment: buildFacadeAlignment(nodes, architectureJson, buildSpec),
    site_connections: buildSiteConnections(nodes, architectureJson, buildSpec),
    bsp_hints: buildBspHints({ style, styleFamily, typology, footprint, floors, buildSpec, nodes })
  };
}

export function normalizeTopology(value, source, fallback = {}, buildSpec = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  const maxFloor = Math.max(0, Number(buildSpec.floors || 3) - 1);
  const nodes = normalizeNodes(raw.nodes, fallback.nodes, maxFloor);
  const idNormalization = uniquifyNodeIds(nodes);
  const rebuildDerivedTopology = idNormalization.renamed.length > 0;
  return {
    source,
    nodes,
    edges: rebuildDerivedTopology ? buildEdges(nodes) : normalizeEdges(raw.edges, nodes, fallback.edges),
    floor_program: rebuildDerivedTopology ? buildFloorProgram(nodes, maxFloor + 1) : normalizeFloorProgram(raw.floor_program || raw.floorProgram, nodes, fallback.floor_program, maxFloor),
    zoning: rebuildDerivedTopology ? buildZoning(nodes) : normalizeZoning(raw.zoning, nodes, fallback.zoning),
    circulation_rules: {
      ...(fallback.circulation_rules || {}),
      ...normalizeObject(raw.circulation_rules || raw.circulationRules)
    },
    facade_alignment: {
      ...(fallback.facade_alignment || {}),
      ...normalizeObject(raw.facade_alignment || raw.facadeAlignment)
    },
    site_connections: normalizeSiteConnections(raw.site_connections || raw.siteConnections, nodes, fallback.site_connections),
    bsp_hints: {
      ...(fallback.bsp_hints || {}),
      ...normalizeObject(raw.bsp_hints || raw.bspHints)
    }
  };
}

function addGroundFloor(nodes, context) {
  const { style, styleFamily, typology, footprint, buildSpec, requested } = context;
  const publicWeight = buildSpec.scale === 'large' ? 1.8 : 1.4;
  nodes.push(room('entry', entryLabel(styleFamily), 'entry', 0, 0.75, 'public', { zone: 'public', orientation: buildSpec.door_side || 'south', access: 'main-door' }));

  if (typology === 'castle') {
    nodes.push(
      room('great-hall', '大厅', 'great_hall', 0, 2.0, 'public', { zone: 'public', tags: ['ceremonial-core'] }),
      room('armory', '武备间', 'armory', 0, 0.8, 'service', { zone: 'service' }),
      room('kitchen', '后厨', 'kitchen', 0, 1.0, 'service', { zone: 'service' })
    );
    return;
  }

  if (styleFamily === 'japanese') {
    nodes.push(
      room('living', '起居间', 'living', 0, 1.2, 'public', { zone: 'public', orientation: 'courtyard' }),
      room('tatami', '榻榻米室', 'tatami', 0, 1.0, 'semi-private', { zone: 'private', orientation: 'courtyard', tags: ['quiet-room'] }),
      room('kitchen', '厨房', 'kitchen', 0, 0.85, 'service', { zone: 'service' }),
      room('tea-room', '茶室', 'tea_room', 0, 0.75, 'semi-private', { zone: 'private', orientation: 'garden' })
    );
    return;
  }

  if (styleFamily === 'industrial') {
    nodes.push(
      room('living', '开放客厅', 'living', 0, 1.7, 'public', { zone: 'public', daylight: 'high' }),
      room('kitchen', '开放厨房', 'kitchen', 0, 1.0, 'service', { zone: 'service' }),
      room('workshop', '工作间', 'workshop', 0, 1.0, 'service', { zone: 'service' })
    );
    return;
  }

  const livingLabel = style === '现代' ? '通高客厅' : style === '欧式' ? '客厅' : '起居';
  nodes.push(
    room('living', livingLabel, 'living', 0, publicWeight, 'public', { zone: 'public', daylight: buildSpec.facade?.large_glass ? 'high' : 'medium' }),
    room('kitchen', style === '现代' ? '开放厨房' : '厨房', 'kitchen', 0, 0.95, 'service', { zone: 'service' })
  );

  if (shouldHaveDining(context)) nodes.push(room('dining', '餐厅', 'dining', 0, 1.0, 'public', { zone: 'public' }));
  if (footprint === 'winged') nodes.push(room('lounge', '侧厅', 'lounge', 0, 0.9, 'public', { zone: 'public', tags: ['wing-room'] }));
  if (requested.bathrooms || buildSpec.scale === 'large') nodes.push(room('guest-bath', '客卫', 'bathroom', 0, 0.45, 'service', { zone: 'service' }));
  if (requested.bedrooms > 0 && Number(buildSpec.floors || 1) <= 1) {
    nodes.push(room('bedroom', '卧室', 'bedroom', 0, 1.1, 'private', { zone: 'private' }));
  }
}

function addUpperFloors(nodes, context) {
  const { floors, typology, buildSpec, requested } = context;
  if (floors <= 1) return;

  for (let floor = 1; floor < floors; floor += 1) {
    nodes.push(room(floor === 1 ? 'corridor' : `corridor-${floor}`, `${floor + 1}层走廊`, 'corridor', floor, 0.65, 'circulation', { zone: 'circulation' }));

    if (typology === 'castle' && floor === floors - 1) {
      nodes.push(
        room('tower-room', '塔楼瞭望间', 'tower', floor, 1.0, 'private', { zone: 'private', tags: ['vertical-accent'] }),
        room('chapel', '礼拜室', 'chapel', floor, 0.9, 'semi-private', { zone: 'public' })
      );
      continue;
    }

    if (floor === 1) {
      nodes.push(room('master-bedroom', '主卧', 'master_bedroom', floor, buildSpec.scale === 'large' ? 1.35 : 1.15, 'private', { zone: 'private', daylight: 'medium' }));
    }

    const bedroomTarget = Math.max(1, requested.bedrooms || (buildSpec.scale === 'large' ? 3 : 2));
    const remainingBedrooms = Math.max(0, bedroomTarget - nodes.filter((node) => ['bedroom', 'master_bedroom'].includes(node.type)).length);
    if (remainingBedrooms > 0) {
      nodes.push(room(floor === 1 ? 'second-bedroom' : `bedroom-${floor}`, floor === 1 ? '次卧' : `${floor + 1}层卧室`, 'bedroom', floor, 1.0, 'private', { zone: 'private' }));
    }
    if (requested.study || floor === 1 || buildSpec.scale === 'large') nodes.push(room(floor === 1 ? 'study' : `study-${floor}`, '书房', 'study', floor, 0.75, 'private', { zone: 'private' }));
    if (requested.bathrooms || buildSpec.scale !== 'small') nodes.push(room(floor === 1 ? 'bathroom' : `bathroom-${floor}`, '卫生间', 'bathroom', floor, 0.5, 'service', { zone: 'service' }));
    if (buildSpec.facade?.balcony && floor === 1) nodes.push(room('balcony-entry', '阳台入口', 'balcony', floor, 0.45, 'public', { zone: 'outdoor', orientation: buildSpec.door_side || 'south' }));
  }
}

function addSpecialRooms(nodes, context) {
  const { prompt, buildSpec, typology } = context;
  const floors = Number(buildSpec.floors || 1);
  if (/车库|停车|garage/i.test(prompt) || buildSpec.modules?.preferred?.includes('garage')) {
    nodes.push(room('garage', '车库', 'garage', 0, 1.0, 'service', { zone: 'service', access: 'side-entry' }));
  }
  if (/储藏|储物|库房/.test(prompt)) nodes.push(room('storage', '储藏间', 'storage', 0, 0.55, 'service', { zone: 'service' }));
  if (/洗衣|设备|机房/.test(prompt)) nodes.push(room('utility', '设备间', 'utility', 0, 0.55, 'service', { zone: 'service' }));
  if (/温室|花房|greenhouse/i.test(prompt)) nodes.push(room('greenhouse', '温室', 'greenhouse', 0, 0.8, 'public', { zone: 'outdoor', orientation: 'garden', daylight: 'high' }));
  if (/阳光房|sunroom/i.test(prompt)) nodes.push(room('sunroom', '阳光房', 'sunroom', 0, 0.85, 'public', { zone: 'public', orientation: 'garden', daylight: 'high' }));
  if (typology === 'castle' && floors > 1) nodes.push(room('tower-stair', '塔楼楼梯', 'stairs', 0, 0.8, 'circulation', { zone: 'circulation', tags: ['vertical-core'] }));
}

function ensureVerticalCore(nodes, floors, typology) {
  if (floors <= 1) return;
  if (nodes.some((item) => item.type === 'stairs')) return;
  nodes.push(room(typology === 'castle' ? 'tower-stair' : 'stairs', typology === 'castle' ? '塔楼楼梯' : '楼梯', 'stairs', 0, 0.75, 'circulation', { zone: 'circulation', tags: ['vertical-core'] }));
}

function buildEdges(nodes, context = {}) {
  const ids = new Set(nodes.map((item) => item.id));
  const edgeMap = new Map();
  const add = (from, to, relation, priority = 'normal') => {
    if (!ids.has(from) || !ids.has(to) || from === to) return;
    const key = `${from}->${to}`;
    if (!edgeMap.has(key)) edgeMap.set(key, { from, to, relation, priority });
  };

  const publicCore = choosePublicCore(nodes, context.typology);
  const verticalCore = firstNodeId(nodes, 'stairs');
  add('entry', publicCore, 'entry-to-public', 'required');
  if (verticalCore) add('entry', verticalCore, 'entry-to-vertical-core', 'required');

  const nodeByType = groupByType(nodes);
  for (const item of nodes) {
    if (item.id === 'entry' || item.id === publicCore) continue;
    if (item.floor === 0 && ['public', 'semi-private'].includes(item.privacy)) add(publicCore, item.id, 'public-flow');
    if (item.floor === 0 && item.privacy === 'service') add(nodeByType.dining?.[0]?.id || publicCore, item.id, 'service-flow');
    if (item.floor > 0) {
      const corridor = nodes.find((node) => node.floor === item.floor && node.type === 'corridor');
      if (corridor) add(corridor.id, item.id, item.privacy === 'private' ? 'private-access' : 'upper-floor-access');
      if (verticalCore && corridor) add(verticalCore, corridor.id, 'vertical-flow', 'required');
    }
  }

  if (ids.has('living') && ids.has('dining')) add('living', 'dining', 'public-flow');
  if (ids.has('dining') && ids.has('kitchen')) add('dining', 'kitchen', 'service-flow', 'required');
  if (ids.has('living') && ids.has('kitchen')) add('living', 'kitchen', 'public-service');
  if (ids.has('living') && ids.has('lounge')) add('living', 'lounge', 'public-flow');
  if (ids.has('great-hall') && ids.has('armory')) add('great-hall', 'armory', 'service-security');
  if (ids.has('great-hall') && ids.has('kitchen')) add('great-hall', 'kitchen', 'service-flow');
  if (ids.has('living') && ids.has('tatami')) add('living', 'tatami', 'quiet-room-access');
  if (ids.has('tatami') && ids.has('tea-room')) add('tatami', 'tea-room', 'garden-ritual-flow');
  if (ids.has('garage') && ids.has('entry')) add('garage', 'entry', 'service-entry');
  if (ids.has('sunroom') && ids.has('living')) add('living', 'sunroom', 'garden-transition');
  if (ids.has('greenhouse') && ids.has('kitchen')) add('kitchen', 'greenhouse', 'garden-service');

  return [...edgeMap.values()];
}

function buildFloorProgram(nodes, floors) {
  const program = [];
  for (let floor = 0; floor < floors; floor += 1) {
    const floorNodes = nodes.filter((node) => node.floor === floor);
    program.push({
      floor,
      label: floor === 0 ? 'ground' : `level-${floor + 1}`,
      public: floorNodes.filter((node) => node.zone === 'public').map((node) => node.id),
      private: floorNodes.filter((node) => node.zone === 'private').map((node) => node.id),
      service: floorNodes.filter((node) => node.zone === 'service').map((node) => node.id),
      circulation: floorNodes.filter((node) => node.zone === 'circulation').map((node) => node.id),
      outdoor: floorNodes.filter((node) => node.zone === 'outdoor').map((node) => node.id)
    });
  }
  return program;
}

function buildZoning(nodes) {
  return {
    public: nodes.filter((node) => node.zone === 'public').map((node) => node.id),
    private: nodes.filter((node) => node.zone === 'private').map((node) => node.id),
    service: nodes.filter((node) => node.zone === 'service').map((node) => node.id),
    circulation: nodes.filter((node) => node.zone === 'circulation').map((node) => node.id),
    outdoor: nodes.filter((node) => node.zone === 'outdoor').map((node) => node.id)
  };
}

function buildFacadeAlignment(nodes, architecture, buildSpec) {
  const living = nodes.find((node) => ['living', 'great_hall'].includes(node.type));
  const rules = {
    front_side: buildSpec.door_side || architecture.facade_rules?.front_side || 'south',
    daylight_rooms: nodes.filter((node) => node.daylight === 'high').map((node) => node.id),
    public_frontage: living ? [living.id] : [],
    private_quiet_side: nodes.filter((node) => ['bedroom', 'master_bedroom', 'study', 'tatami', 'tea_room'].includes(node.type)).map((node) => node.id)
  };
  if (architecture.facade_rules?.large_glass || buildSpec.facade?.large_glass) rules.glass_priority_rooms = living ? [living.id, 'sunroom'].filter((id) => nodes.some((node) => node.id === id)) : [];
  if (architecture.facade_rules?.arches || architecture.facade_rules?.pointed_arches) rules.arch_priority_rooms = ['entry', living?.id].filter(Boolean);
  if (architecture.facade_rules?.screen || buildSpec.facade?.screens) rules.screen_priority_rooms = nodes.filter((node) => ['tatami', 'tea_room', 'study'].includes(node.type)).map((node) => node.id);
  if (architecture.facade_rules?.balcony || buildSpec.facade?.balcony) rules.balcony_rooms = nodes.filter((node) => node.type === 'balcony').map((node) => node.id);
  return rules;
}

function buildSiteConnections(nodes, architecture, buildSpec) {
  const site = architecture.site_rules || {};
  const living = nodes.find((node) => ['living', 'great_hall'].includes(node.type));
  const connections = [];
  if (site.enclosed_courtyard || buildSpec.site?.enclosed_courtyard) connections.push(connection(living?.id || 'entry', 'courtyard', 'primary-view-and-access'));
  if (site.water_feature || buildSpec.site?.water_feature) connections.push(connection(living?.id || 'entry', 'water_feature', 'visual-focus'));
  if (site.dry_garden || buildSpec.site?.dry_garden) connections.push(connection('tea-room', 'dry_garden', 'quiet-view'));
  if (site.formal_garden || buildSpec.site?.formal_garden) connections.push(connection('entry', 'formal_garden', 'axial-approach'));
  if (nodes.some((node) => node.id === 'garage')) connections.push(connection('garage', 'side_path', 'service-access'));
  if (nodes.some((node) => node.id === 'greenhouse')) connections.push(connection('greenhouse', 'garden', 'garden-workflow'));
  if (nodes.some((node) => node.id === 'sunroom')) connections.push(connection('sunroom', 'garden', 'garden-transition'));
  return connections.filter((item) => item.from === 'entry' || nodes.some((node) => node.id === item.from));
}

function buildBspHints({ style, styleFamily, typology, footprint, floors, buildSpec, nodes }) {
  return {
    split_strategy: splitStrategy(style, styleFamily, typology, footprint),
    prefer_corridor_on_upper_floors: floors > 1,
    keep_entry_on_front: true,
    avoid_tiny_rooms: true,
    wet_rooms_near_service_core: nodes.some((node) => node.type === 'bathroom'),
    public_core_weight_bias: buildSpec.scale === 'large' ? 'large' : 'normal',
    courtyard_bias: footprint === 'courtyard' ? 'rooms-face-inward' : 'none',
    glass_front_bias: buildSpec.facade?.large_glass ? 'public-rooms-on-daylight-side' : 'balanced',
    wing_room_policy: footprint === 'winged' ? 'assign-public-or-service-functions-to-wings' : 'none'
  };
}

function normalizeNodes(value, fallback = [], maxFloor = 2) {
  const source = Array.isArray(value) && value.length ? value : Array.isArray(fallback) ? fallback : [];
  const nodes = source.map((item, index) => {
    const raw = item && typeof item === 'object' ? item : {};
    const type = normalizeRoomType(raw.type || raw.id);
    return room(
      normalizeId(raw.id || raw.type || `room-${index}`),
      String(raw.label || raw.name || raw.id || `房间 ${index + 1}`),
      type,
      clampInt(raw.floor ?? raw.level, 0, maxFloor, 0),
      clampNumber(raw.weight ?? raw.area_weight ?? raw.priority, 0.2, 3, 1),
      String(raw.privacy || privacyForType(type)),
      {
        zone: normalizeZone(raw.zone || zoneForType(type)),
        orientation: raw.orientation,
        access: raw.access,
        daylight: raw.daylight,
        tags: normalizeStringArray(raw.tags)
      }
    );
  });
  return nodes.length ? nodes : [room('living', '起居', 'living', 0, 1, 'public', { zone: 'public' })];
}

function normalizeEdges(value, nodes, fallback = []) {
  const ids = new Set(nodes.map((item) => item.id));
  const source = Array.isArray(value) && value.length ? value : Array.isArray(fallback) ? fallback : [];
  const edges = source
    .map((item) => {
      const raw = Array.isArray(item)
        ? { from: item[0], to: item[1], relation: item[2] || 'connected' }
        : item && typeof item === 'object'
          ? item
          : {};
      return {
        from: normalizeId(raw.from),
        to: normalizeId(raw.to),
        relation: String(raw.relation || raw.type || 'connected'),
        priority: raw.priority ? String(raw.priority) : undefined
      };
    })
    .filter((item) => ids.has(item.from) && ids.has(item.to));
  return edges.length ? edges.map(dropUndefined) : buildEdges(nodes);
}

function normalizeFloorProgram(value, nodes, fallback = [], maxFloor = 0) {
  if (Array.isArray(value) && value.length) {
    return value.map((item, index) => ({
      floor: clampInt(item?.floor ?? index, 0, maxFloor, index),
      label: String(item?.label || (index === 0 ? 'ground' : `level-${index + 1}`)),
      public: filterIds(item?.public, nodes),
      private: filterIds(item?.private, nodes),
      service: filterIds(item?.service, nodes),
      circulation: filterIds(item?.circulation, nodes),
      outdoor: filterIds(item?.outdoor, nodes)
    }));
  }
  if (Array.isArray(fallback) && fallback.length) return fallback;
  return buildFloorProgram(nodes, maxFloor + 1);
}

function normalizeZoning(value, nodes, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      public: filterIds(value.public, nodes),
      private: filterIds(value.private, nodes),
      service: filterIds(value.service, nodes),
      circulation: filterIds(value.circulation, nodes),
      outdoor: filterIds(value.outdoor, nodes)
    };
  }
  return fallback && Object.keys(fallback).length ? fallback : buildZoning(nodes);
}

function normalizeSiteConnections(value, nodes, fallback = []) {
  const source = Array.isArray(value) && value.length ? value : Array.isArray(fallback) ? fallback : [];
  const ids = new Set(nodes.map((node) => node.id));
  return source
    .map((item) => item && typeof item === 'object' ? {
      from: String(item.from || ''),
      to: String(item.to || item.target || ''),
      relation: String(item.relation || 'connected')
    } : undefined)
    .filter((item) => item && ids.has(item.from) && item.to);
}

function room(id, label, type, floor, weight, privacy, extra = {}) {
  return dropUndefined({
    id,
    label,
    type,
    floor,
    weight,
    privacy,
    zone: normalizeZone(extra.zone || zoneForType(type)),
    orientation: extra.orientation,
    access: extra.access,
    daylight: extra.daylight,
    tags: extra.tags?.length ? extra.tags : undefined
  });
}

function connection(from, to, relation) {
  return { from, to, relation };
}

function requestedProgram(prompt) {
  return {
    bedrooms: parseRequestedCount(prompt, /([一二三四五六七八九十两\d]{1,2})\s*(?:个|间)?\s*(?:卧室|卧房|客房)/) || (/卧室|卧房|主卧/.test(prompt) ? 1 : 0),
    bathrooms: parseRequestedCount(prompt, /([一二三四五六七八九十两\d]{1,2})\s*(?:个|间)?\s*(?:卫生间|浴室|厕所)/) || (/卫生间|浴室|厕所|客卫/.test(prompt) ? 1 : 0),
    study: /书房|工作室|阅读/.test(prompt),
    dining: /餐厅|餐区/.test(prompt)
  };
}

function parseRequestedCount(prompt, pattern) {
  const match = prompt.match(pattern);
  if (!match) return undefined;
  return parseNumberToken(match[1]);
}

function parseNumberToken(value) {
  if (!value) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.round(numeric);
  const map = new Map([
    ['一', 1],
    ['二', 2],
    ['两', 2],
    ['三', 3],
    ['四', 4],
    ['五', 5],
    ['六', 6],
    ['七', 7],
    ['八', 8],
    ['九', 9],
    ['十', 10]
  ]);
  return map.get(String(value));
}

function shouldHaveDining({ prompt, style, buildSpec, requested }) {
  return requested.dining || buildSpec.scale === 'large' || style === '欧式' || /餐厅|餐区|厨房/.test(prompt);
}

function splitStrategy(style, styleFamily, typology, footprint) {
  if (typology === 'castle' || style === '欧式') return 'axis-balanced';
  if (footprint === 'courtyard') return 'courtyard-ring';
  if (['modern', 'industrial', 'futuristic'].includes(styleFamily)) return 'open-plan-weighted';
  return 'weighted';
}

function corridorPolicy({ floors, typology, footprint, styleFamily }) {
  if (floors <= 1) return footprint === 'courtyard' ? 'short-gallery-around-courtyard' : 'minimal';
  if (typology === 'castle') return 'vertical-core-with-upper-gallery';
  if (styleFamily === 'modern') return 'compact-open-stair-hall';
  return 'upper-floor-corridor';
}

function choosePublicCore(nodes, typology) {
  if (typology === 'castle' && nodes.some((node) => node.id === 'great-hall')) return 'great-hall';
  return nodes.find((node) => node.id === 'living')?.id || nodes.find((node) => node.privacy === 'public')?.id || nodes[0]?.id || 'living';
}

function groupByType(nodes) {
  const groups = {};
  for (const item of nodes) {
    groups[item.type] ||= [];
    groups[item.type].push(item);
  }
  return groups;
}

function firstNodeId(nodes, type) {
  return nodes.find((item) => item.type === type)?.id;
}

function entryLabel(styleFamily) {
  if (styleFamily === 'japanese') return '玄关';
  if (styleFamily === 'gothic') return '门厅';
  return '入口';
}

function inferTypology(prompt, style) {
  if (/城堡|堡垒|castle/i.test(prompt)) return 'castle';
  if (/庄园|manor/i.test(prompt)) return 'manor';
  if (/别墅|villa/i.test(prompt)) return 'villa';
  if (/小屋|木屋|cabin|lodge/i.test(prompt) || style === '木屋') return 'cabin';
  if (/庭院|合院|四合院|courtyard/i.test(prompt)) return 'courtyard-house';
  return 'house';
}

function compactBuildSpec(buildSpec) {
  return {
    scale: buildSpec.scale,
    style: buildSpec.style,
    style_family: buildSpec.style_family,
    typology: buildSpec.typology,
    footprint: buildSpec.footprint,
    width: buildSpec.width,
    depth: buildSpec.depth,
    floors: buildSpec.floors,
    floor_height: buildSpec.floor_height,
    door_side: buildSpec.door_side,
    facade: buildSpec.facade,
    site: buildSpec.site,
    structural: buildSpec.structural,
    modules: buildSpec.modules,
    seed: buildSpec.seed,
    seed_variation: buildSpec.seed_variation
  };
}

function ensureUniqueIds(nodes) {
  uniquifyNodeIds(nodes);
}

function uniquifyNodeIds(nodes) {
  const used = new Set();
  const baseCounts = new Map();
  const renamed = [];

  for (const item of nodes) {
    const base = normalizeId(item.id || item.type || 'room');
    const count = baseCounts.get(base) || 0;
    baseCounts.set(base, count + 1);

    let id = base;
    if (used.has(id)) {
      const floor = Number(item.floor);
      const suffix = Number.isFinite(floor) && floor > 0 ? `floor-${floor}` : String(count + 1);
      id = normalizeId(`${base}-${suffix}`);
      let serial = 2;
      while (used.has(id)) {
        id = normalizeId(`${base}-${suffix}-${serial}`);
        serial += 1;
      }
      renamed.push({ from: base, to: id, floor: item.floor });
    }

    item.id = id;
    used.add(id);
  }

  return { nodes, renamed };
}

function normalizeRoomType(value) {
  const text = String(value || '').toLowerCase();
  if (/entry|门厅|玄关|入口/.test(text)) return 'entry';
  if (/great[_-]?hall|hall|大厅|厅堂/.test(text)) return 'great_hall';
  if (/living|客厅|起居/.test(text)) return 'living';
  if (/dining|餐/.test(text)) return 'dining';
  if (/kitchen|厨/.test(text)) return 'kitchen';
  if (/stair|楼梯|vertical/.test(text)) return 'stairs';
  if (/corridor|hallway|走廊/.test(text)) return 'corridor';
  if (/master.*bed|主卧/.test(text)) return 'master_bedroom';
  if (/bed|卧|客房/.test(text)) return 'bedroom';
  if (/study|书|office|工作室/.test(text)) return 'study';
  if (/bath|wash|卫|浴|厕所/.test(text)) return 'bathroom';
  if (/utility|设备|洗衣/.test(text)) return 'utility';
  if (/storage|储/.test(text)) return 'storage';
  if (/garage|车库/.test(text)) return 'garage';
  if (/balcony|阳台|露台/.test(text)) return 'balcony';
  if (/lounge|侧厅|会客/.test(text)) return 'lounge';
  if (/tea|茶/.test(text)) return 'tea_room';
  if (/tatami|榻榻米/.test(text)) return 'tatami';
  if (/workshop|工坊|车间/.test(text)) return 'workshop';
  if (/greenhouse|温室|花房/.test(text)) return 'greenhouse';
  if (/sunroom|阳光房/.test(text)) return 'sunroom';
  if (/tower|塔/.test(text)) return 'tower';
  if (/chapel|礼拜/.test(text)) return 'chapel';
  if (/armory|武备/.test(text)) return 'armory';
  return ROOM_TYPES.has(text) ? text : 'room';
}

function zoneForType(type) {
  if (['entry', 'living', 'great_hall', 'dining', 'lounge', 'chapel', 'sunroom'].includes(type)) return 'public';
  if (['bedroom', 'master_bedroom', 'study', 'tatami', 'tea_room', 'tower'].includes(type)) return 'private';
  if (['kitchen', 'bathroom', 'utility', 'storage', 'garage', 'workshop', 'armory'].includes(type)) return 'service';
  if (['stairs', 'corridor'].includes(type)) return 'circulation';
  if (['balcony', 'greenhouse'].includes(type)) return 'outdoor';
  return 'public';
}

function privacyForType(type) {
  const zone = zoneForType(type);
  if (zone === 'private') return 'private';
  if (zone === 'service') return 'service';
  if (zone === 'circulation') return 'circulation';
  return 'public';
}

function normalizeZone(value) {
  const text = String(value || 'public').toLowerCase();
  if (['public', 'private', 'service', 'circulation', 'outdoor'].includes(text)) return text;
  return 'public';
}

function filterIds(value, nodes) {
  const ids = new Set(nodes.map((node) => node.id));
  return normalizeStringArray(value).map(normalizeId).filter((id) => ids.has(id));
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value) return [String(value)];
  return [];
}

function normalizeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-\u4e00-\u9fff]+/g, '-') || 'node';
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function clampInt(value, min, max, fallback) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function dropUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
