const SUPPORTED_MODES = new Set(['auto', 'mock', 'llm']);

export class SuperPlannerAgent {
  constructor({ llmClient, mode = 'auto' } = {}) {
    this.llmClient = llmClient;
    this.mode = SUPPORTED_MODES.has(mode) ? mode : 'auto';
  }

  async run({ requirement, skill, plan, design, architecture }) {
    const fallback = this.fallback({ requirement, skill, plan, design, architecture });
    if (this.mode === 'mock') return fallback;

    if (this.mode === 'llm' || (this.mode === 'auto' && this.llmClient?.isConfigured())) {
      try {
        const parsed = await this.llmClient.chatJson({
          system: [
            '你是严谨的 Minecraft 室内拓扑规划师。',
            '你只输出房间拓扑，不允许输出具体长宽高或 XYZ 坐标。',
            '只输出 JSON，不要解释。',
            '字段必须包括 nodes, edges, circulationRules, bspHints。',
            'nodes 中每项必须包含 id, label, type, level, weight, privacy。',
            'edges 中每项必须包含 from, to, relation。'
          ].join('\n'),
          user: JSON.stringify({ requirement, skill, plan, design: compactDesign(design), architecture })
        });
        return normalizeTopology(parsed, fallback, 'llm');
      } catch (error) {
        return {
          ...fallback,
          source: 'fallback-after-llm-error',
          llmError: error.message
        };
      }
    }

    return fallback;
  }

  fallback({ requirement, skill, plan, design, architecture }) {
    return normalizeTopology(buildFallbackTopology({ requirement, skill, plan, design, architecture }), undefined, 'fallback');
  }
}

function buildFallbackTopology({ requirement, skill, plan, design }) {
  const style = requirement.style || design.style || '通用';
  const floors = design.floors || requirement.floors || 1;
  const nodes = [];

  if (style === '欧式' || skill?.skillId === 'european-manor') {
    nodes.push(
      node('entry', '门厅', 'entry', 0, 1.0, 'public'),
      node('living', '客厅', 'living', 0, 1.7, 'public'),
      node('dining', '餐厅', 'dining', 0, 1.1, 'public'),
      node('kitchen', '厨房', 'kitchen', 0, 1.0, 'service'),
      node('stair-hall', '楼梯间', 'stairs', 0, 0.9, 'circulation'),
      node('lounge', '侧厅', 'lounge', 0, 0.9, 'public')
    );
    if (floors > 1) {
      nodes.push(
        node('corridor', '二层走廊', 'corridor', 1, 0.7, 'circulation'),
        node('master-bedroom', '主卧', 'bedroom', 1, 1.4, 'private'),
        node('second-bedroom', '次卧', 'bedroom', 1, 1.1, 'private'),
        node('study', '书房', 'study', 1, 0.9, 'private'),
        node('balcony-entry', '阳台入口', 'balcony', 1, 0.7, 'public')
      );
    }
  } else {
    nodes.push(
      node('entry', '门厅', 'entry', 0, 0.7, 'public'),
      node('living', '客厅', 'living', 0, 1.5, 'public'),
      node('kitchen', '厨房', 'kitchen', 0, 0.9, 'service'),
      node('bedroom', '卧室', 'bedroom', floors > 1 ? 1 : 0, 1.1, 'private')
    );
    if (floors > 1) nodes.push(node('stairs', '楼梯', 'stairs', 0, 0.6, 'circulation'));
    if (hasPlanZone(plan, 'study')) nodes.push(node('study', '书房', 'study', Math.min(1, floors - 1), 0.8, 'private'));
  }

  return {
    nodes,
    edges: buildEdges(nodes),
    circulationRules: {
      entryNode: 'entry',
      verticalCore: nodes.some((item) => item.type === 'stairs') ? nodes.find((item) => item.type === 'stairs').id : 'none',
      publicCore: nodes.some((item) => item.id === 'living') ? 'living' : nodes[0]?.id,
      connectAllRooms: true
    },
    bspHints: {
      splitStrategy: style === '欧式' ? 'axis-balanced' : 'weighted',
      preferCorridorOnUpperFloors: floors > 1,
      keepEntryOnFront: true,
      avoidTinyRooms: true
    }
  };
}

function node(id, label, type, level, weight, privacy) {
  return { id, label, type, level, weight, privacy };
}

function buildEdges(nodes) {
  const ids = new Set(nodes.map((item) => item.id));
  const pairs = [
    ['entry', 'living', 'entry-to-public'],
    ['entry', 'stair-hall', 'entry-to-vertical-core'],
    ['living', 'dining', 'public-flow'],
    ['dining', 'kitchen', 'service-flow'],
    ['living', 'lounge', 'public-flow'],
    ['stair-hall', 'corridor', 'vertical-flow'],
    ['corridor', 'master-bedroom', 'private-access'],
    ['corridor', 'second-bedroom', 'private-access'],
    ['corridor', 'study', 'private-access'],
    ['corridor', 'balcony-entry', 'balcony-access'],
    ['living', 'kitchen', 'public-service'],
    ['living', 'bedroom', 'public-private'],
    ['living', 'stairs', 'vertical-flow']
  ];
  return pairs
    .filter(([from, to]) => ids.has(from) && ids.has(to))
    .map(([from, to, relation]) => ({ from, to, relation }));
}

function normalizeTopology(value, fallback, source) {
  const raw = value && typeof value === 'object' ? value : {};
  const nodes = normalizeNodes(raw.nodes, fallback?.nodes);
  return {
    source,
    nodes,
    edges: normalizeEdges(raw.edges, nodes, fallback?.edges),
    circulationRules: normalizeObject(raw.circulationRules, fallback?.circulationRules || {}),
    bspHints: normalizeObject(raw.bspHints, fallback?.bspHints || {})
  };
}

function normalizeNodes(value, fallback = []) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  return source.map((item, index) => {
    const raw = item && typeof item === 'object' ? item : {};
    return {
      id: normalizeId(raw.id || raw.type || `room-${index}`),
      label: String(raw.label || raw.name || raw.id || `房间 ${index + 1}`),
      type: normalizeRoomType(raw.type || raw.id),
      level: clampInteger(raw.level, 0, 2, 0),
      weight: clampNumber(raw.weight ?? raw.areaWeight ?? raw.priority, 0.2, 3, 1),
      privacy: String(raw.privacy || 'public')
    };
  });
}

function normalizeEdges(value, nodes, fallback = []) {
  const ids = new Set(nodes.map((item) => item.id));
  const source = Array.isArray(value) && value.length ? value : fallback;
  return source
    .map((item) => {
      if (Array.isArray(item)) return { from: normalizeId(item[0]), to: normalizeId(item[1]), relation: String(item[2] || 'connected') };
      const raw = item && typeof item === 'object' ? item : {};
      return { from: normalizeId(raw.from), to: normalizeId(raw.to), relation: String(raw.relation || raw.type || 'connected') };
    })
    .filter((item) => ids.has(item.from) && ids.has(item.to));
}

function hasPlanZone(plan, type) {
  return (plan?.zones || []).some((zone) => zone.type === type || zone.id === type);
}

function normalizeRoomType(value) {
  const text = String(value || '').toLowerCase();
  if (/entry|门厅|玄关/.test(text)) return 'entry';
  if (/living|客厅/.test(text)) return 'living';
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

function normalizeObject(value, fallback) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...fallback, ...value } : fallback;
}

function normalizeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-\u4e00-\u9fa5]/g, '-') || 'node';
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function clampInteger(value, min, max, fallback) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function compactDesign(design) {
  return {
    style: design.style,
    floors: design.floors,
    dimensions: design.dimensions,
    elements: design.elements,
    plan: design.plan
  };
}
