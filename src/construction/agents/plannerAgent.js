import { detectFloors, detectStyle } from './architectAgent.js';

export class ConstructionPlannerAgent {
  constructor({ llmClient, mode = 'auto' } = {}) {
    this.llmClient = llmClient;
    this.mode = ['auto', 'mock', 'llm'].includes(mode) ? mode : 'auto';
  }

  async run(prompt, architectureJson) {
    const fallback = normalizeTopology(buildFallbackTopology(prompt, architectureJson), 'fallback');
    if (this.mode === 'mock') return fallback;

    if (this.mode === 'llm' || (this.mode === 'auto' && this.llmClient?.isConfigured())) {
      try {
        const parsed = await this.llmClient.chatJson({
          system: [
            '你是一个严谨的室内空间规划师。',
            '你只输出房间拓扑，不允许输出具体长宽高或 XYZ 坐标。',
            '只输出 JSON，字段包含 nodes, edges, circulation_rules, bsp_hints。',
            'nodes 每项包含 id, label, type, floor, weight, privacy。',
            'edges 每项包含 from, to, relation。'
          ].join('\n'),
          user: JSON.stringify({
            user_prompt: prompt,
            architecture_json: {
              style: architectureJson.style,
              footprint: architectureJson.footprint,
              volumes: architectureJson.volumes
            }
          })
        });
        return normalizeTopology(parsed, 'llm', fallback);
      } catch (error) {
        if (this.mode === 'llm') throw error;
        return { ...fallback, source: 'fallback-after-llm-error', llm_error: error.message };
      }
    }

    return fallback;
  }
}

export function buildFallbackTopology(prompt, architectureJson) {
  const style = architectureJson.style || detectStyle(prompt);
  const floors = detectFloors(prompt, architectureJson.footprint === 'winged' ? 'large' : undefined);
  const nodes = [];

  if (style === '欧式') {
    nodes.push(
      node('entry', '门厅', 'entry', 0, 0.9, 'public'),
      node('living', '客厅', 'living', 0, 1.7, 'public'),
      node('dining', '餐厅', 'dining', 0, 1.1, 'public'),
      node('kitchen', '厨房', 'kitchen', 0, 1.0, 'service'),
      node('stair-hall', '楼梯间', 'stairs', 0, 0.8, 'circulation')
    );
    if (architectureJson.footprint === 'winged') nodes.push(node('lounge', '侧厅', 'lounge', 0, 0.9, 'public'));
    if (floors > 1) {
      nodes.push(
        node('corridor', '二层走廊', 'corridor', 1, 0.7, 'circulation'),
        node('master-bedroom', '主卧', 'bedroom', 1, 1.4, 'private'),
        node('second-bedroom', '次卧', 'bedroom', 1, 1.1, 'private'),
        node('study', '书房', 'study', 1, 0.8, 'private'),
        node('balcony-entry', '阳台入口', 'balcony', 1, 0.5, 'public')
      );
    }
  } else if (style === '现代') {
    nodes.push(
      node('entry', '玄关', 'entry', 0, 0.7, 'public'),
      node('living', '通高客厅', 'living', 0, 1.8, 'public'),
      node('kitchen', '开放厨房', 'kitchen', 0, 1.0, 'service'),
      node('stairs', '楼梯', 'stairs', 0, 0.7, 'circulation'),
      node('bedroom', '卧室', 'bedroom', floors > 1 ? 1 : 0, floors > 1 ? 1.2 : 1.1, 'private')
    );
    if (/书房/.test(prompt)) nodes.push(node('study', '书房', 'study', floors > 1 ? 1 : 0, 0.8, 'private'));
  } else {
    nodes.push(
      node('entry', '入口', 'entry', 0, 0.7, 'public'),
      node('living', '起居', 'living', 0, 1.4, 'public'),
      node('kitchen', '厨房', 'kitchen', 0, 0.9, 'service'),
      node('bedroom', '卧室', floors > 1 ? 1 : 0, 1.1, 'private')
    );
    if (floors > 1) nodes.push(node('stairs', '楼梯', 'stairs', 0, 0.6, 'circulation'));
  }

  return {
    nodes,
    edges: buildEdges(nodes),
    circulation_rules: {
      entry_node: 'entry',
      public_core: 'living',
      vertical_core: firstNodeId(nodes, 'stairs') || 'none',
      connect_all_rooms: true,
      door_policy: 'use_pathfinder_after_bsp'
    },
    bsp_hints: {
      split_strategy: style === '欧式' ? 'axis-balanced' : 'weighted',
      prefer_corridor_on_upper_floors: floors > 1,
      keep_entry_on_front: true,
      avoid_tiny_rooms: true
    }
  };
}

export function normalizeTopology(value, source, fallback = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  const nodes = normalizeNodes(raw.nodes, fallback.nodes);
  return {
    source,
    nodes,
    edges: normalizeEdges(raw.edges, nodes, fallback.edges),
    circulation_rules: {
      ...(fallback.circulation_rules || {}),
      ...normalizeObject(raw.circulation_rules || raw.circulationRules)
    },
    bsp_hints: {
      ...(fallback.bsp_hints || {}),
      ...normalizeObject(raw.bsp_hints || raw.bspHints)
    }
  };
}

function normalizeNodes(value, fallback = []) {
  const source = Array.isArray(value) && value.length ? value : Array.isArray(fallback) ? fallback : [];
  const nodes = source.map((item, index) => {
    const raw = item && typeof item === 'object' ? item : {};
    return node(
      normalizeId(raw.id || raw.type || `room-${index}`),
      String(raw.label || raw.name || raw.id || `房间 ${index + 1}`),
      normalizeRoomType(raw.type || raw.id),
      clampInt(raw.floor ?? raw.level, 0, 2, 0),
      clampNumber(raw.weight ?? raw.area_weight ?? raw.priority, 0.2, 3, 1),
      String(raw.privacy || 'public')
    );
  });
  return nodes.length ? nodes : [node('living', '起居', 'living', 0, 1, 'public')];
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
        relation: String(raw.relation || raw.type || 'connected')
      };
    })
    .filter((item) => ids.has(item.from) && ids.has(item.to));
  return edges.length ? edges : buildEdges(nodes);
}

function buildEdges(nodes) {
  const ids = new Set(nodes.map((item) => item.id));
  const pairs = [
    ['entry', 'living', 'entry-to-public'],
    ['entry', 'stair-hall', 'entry-to-vertical-core'],
    ['entry', 'stairs', 'entry-to-vertical-core'],
    ['living', 'dining', 'public-flow'],
    ['dining', 'kitchen', 'service-flow'],
    ['living', 'kitchen', 'public-service'],
    ['living', 'lounge', 'public-flow'],
    ['stair-hall', 'corridor', 'vertical-flow'],
    ['stairs', 'bedroom', 'vertical-flow'],
    ['corridor', 'master-bedroom', 'private-access'],
    ['corridor', 'second-bedroom', 'private-access'],
    ['corridor', 'study', 'private-access'],
    ['corridor', 'balcony-entry', 'balcony-access'],
    ['living', 'bedroom', 'public-private']
  ];
  return pairs
    .filter(([from, to]) => ids.has(from) && ids.has(to))
    .map(([from, to, relation]) => ({ from, to, relation }));
}

function node(id, label, type, floor, weight, privacy) {
  return { id, label, type, floor, weight, privacy };
}

function firstNodeId(nodes, type) {
  return nodes.find((item) => item.type === type)?.id;
}

function normalizeRoomType(value) {
  const text = String(value || '').toLowerCase();
  if (/entry|门厅|玄关|入口/.test(text)) return 'entry';
  if (/living|客厅|起居/.test(text)) return 'living';
  if (/dining|餐/.test(text)) return 'dining';
  if (/kitchen|厨/.test(text)) return 'kitchen';
  if (/stair|楼梯/.test(text)) return 'stairs';
  if (/corridor|hall|走廊/.test(text)) return 'corridor';
  if (/bed|卧/.test(text)) return 'bedroom';
  if (/study|书/.test(text)) return 'study';
  if (/balcony|阳台/.test(text)) return 'balcony';
  if (/lounge|侧厅|会客/.test(text)) return 'lounge';
  return text || 'room';
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
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
