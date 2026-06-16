const SUPPORTED_MODES = new Set(['auto', 'mock', 'llm']);
const FOOTPRINT_TYPES = new Set(['rectangle', 'l-shape', 'winged', 'courtyard']);

export class PlannerAgent {
  constructor({ llmClient, mode = 'auto' }) {
    this.llmClient = llmClient;
    this.mode = SUPPORTED_MODES.has(mode) ? mode : 'auto';
  }

  async run(requirement, skill) {
    const fallback = this.fallback(requirement, skill);
    if (this.mode === 'mock') return fallback;

    if (this.mode === 'llm' || (this.mode === 'auto' && this.llmClient?.isConfigured())) {
      try {
        const parsed = await this.llmClient.chatJson({
          system: [
            '你是 Minecraft 建筑规划 Agent。',
            '只输出 JSON，不要输出解释。',
            '你不输出 Minecraft 命令，只输出可被程序化几何算法执行的语义建筑规划。',
            '字段必须包括 footprint, zones, adjacency, circulation, styleMotifs, constraints, evaluationGoals。',
            'footprint.type 只能是 rectangle, l-shape, winged, courtyard 之一。',
            'zones 必须是数组，每项包含 id, label, type, level, priority，可选 areaHint, needsWindow。',
            'adjacency 必须是二维字符串数组，例如 [["living","kitchen"]]。'
          ].join('\n'),
          user: `把这个 Minecraft 建房需求规划成语义蓝图：${JSON.stringify({ requirement, skill })}`
        });
        return normalizePlan(parsed, requirement, 'llm', fallback);
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

  fallback(requirement, skill) {
    return normalizePlan(buildFallbackPlan(requirement, skill), requirement, 'fallback');
  }
}

function buildFallbackPlan(requirement, skill) {
  const style = requirement.style || '欧式';
  const features = new Set(requirement.features || []);
  const floors = requirement.floors || 1;
  const hasGarden = features.has('小花园') || features.has('水景') || requirement.scale === 'large';
  const hasWater = features.has('水景') || style === '江南';
  const footprint = pickFootprint({ style, scale: requirement.scale, floors, features, skill });
  const zones = buildZones({ style, floors, hasGarden, hasWater, features, skill });

  return {
    footprint,
    zones,
    adjacency: buildAdjacency(zones, hasGarden),
    circulation: {
      entry: requirement.elementPreferences?.door?.side || 'south',
      stairs: floors > 1 ? 'near-entry' : 'none',
      publicCore: 'living'
    },
    styleMotifs: buildMotifs(style, features, hasWater, skill),
    constraints: [
      '保持 Minecraft fill/setblock 命令可执行',
      '房间之间至少通过一个公共空间连通',
      '门窗和楼梯不得互相覆盖'
    ],
    evaluationGoals: [
      '满足用户要求的风格、尺寸和功能元素',
      '增加外形层次而不是只生成矩形空壳',
      '优先生成可通行、可预览、可校验的建筑'
    ]
  };
}

function pickFootprint({ style, scale, floors, features, skill }) {
  if (skill?.preferredFootprint) {
    return { type: skill.preferredFootprint, source: 'skill', publicSide: 'south' };
  }
  if (style === '江南' || style === '中式' || features.has('水景')) {
    return { type: 'courtyard', courtyard: true, publicSide: 'south' };
  }
  if (scale === 'large' && /欧式|古典|城堡|庄园/.test(style)) {
    return { type: 'winged', wing: 'side-hall', publicSide: 'south' };
  }
  if (style === '现代' && (floors > 1 || features.has('大玻璃窗') || features.has('阳台'))) {
    return { type: 'l-shape', wing: 'glass-lounge', publicSide: 'south' };
  }
  return { type: 'rectangle', publicSide: 'south' };
}

function buildZones({ style, floors, hasGarden, hasWater, features, skill }) {
  const zones = [
    zone('entry', '门厅', 'entry', 0, 90, { needsWindow: false }),
    zone('living', '客厅', 'living', 0, 100),
    zone('kitchen', '厨房', 'kitchen', 0, 70),
    zone('bedroom', '卧室', 'bedroom', floors > 1 ? 1 : 0, 80)
  ];

  if (floors > 1) zones.push(zone('stairs', '楼梯间', 'stairs', 0, 95, { needsWindow: false }));
  if (features.has('室内功能') || floors > 1) zones.push(zone('study', '书房', 'study', floors > 1 ? 1 : 0, 55));
  if (hasGarden) zones.push(zone('garden', style === '江南' ? '水院' : '花园', 'garden', 0, 65, { outside: true }));
  if (hasWater) zones.push(zone('water', '水景', 'water', 0, 60, { outside: true, needsWindow: false }));
  if (features.has('阳台')) zones.push(zone('balcony', '阳台', 'balcony', Math.min(1, floors - 1), 50, { outside: true }));

  return mergeSkillZones(zones, skill, floors);
}

function zone(id, label, type, level, priority, extra = {}) {
  return {
    id,
    label,
    type,
    level,
    priority,
    areaHint: extra.outside ? 'exterior' : 'medium',
    needsWindow: extra.needsWindow !== false,
    outside: extra.outside === true
  };
}

function buildAdjacency(zones, hasGarden) {
  const zoneIds = new Set(zones.map((item) => item.id));
  const pairs = [
    ['entry', 'living'],
    ['living', 'kitchen'],
    ['living', 'bedroom'],
    ['living', 'stairs'],
    ['bedroom', 'study'],
    ['living', 'garden'],
    ['garden', 'water'],
    ['living', 'balcony']
  ];
  return pairs.filter(([a, b]) => zoneIds.has(a) && zoneIds.has(b) && (hasGarden || !['garden', 'water'].includes(b)));
}

function buildMotifs(style, features, hasWater, skill) {
  const motifs = new Set();
  if (style === '欧式') {
    motifs.add('symmetrical-facade');
    motifs.add('central-axis');
    motifs.add('stone-plinth');
    motifs.add('pilasters');
    motifs.add('columned-porch');
    motifs.add('framed-windows');
    motifs.add('layered-gabled-roof');
    motifs.add('chimney');
    motifs.add('side-wing');
    motifs.add('formal-garden');
  }
  if (style === '现代') {
    motifs.add('flat-roof');
    motifs.add('large-glass');
    motifs.add('offset-volume');
  }
  if (style === '江南' || style === '中式') {
    motifs.add('white-wall-dark-roof');
    motifs.add('courtyard-axis');
    motifs.add('eave-corners');
  }
  if (style === '木屋') {
    motifs.add('timber-beams');
    motifs.add('warm-lanterns');
  }
  if (features.has('阳台')) motifs.add('balcony');
  if (hasWater) motifs.add('water-courtyard');
  for (const motif of skill?.styleMotifs || []) motifs.add(motif);
  return [...motifs];
}

function mergeSkillZones(zones, skill, floors) {
  const existing = new Set(zones.map((item) => item.id));
  const merged = [...zones];
  for (const hint of skill?.zoneHints || []) {
    if (existing.has(hint)) continue;
    const outside = ['garden', 'water', 'balcony'].includes(hint);
    merged.push(zone(hint, labelForZone(hint), hint, outside ? 0 : Math.min(1, floors - 1), 45, { outside }));
    existing.add(hint);
  }
  return merged;
}

function labelForZone(type) {
  const labels = {
    entry: '门厅',
    living: '客厅',
    bedroom: '卧室',
    kitchen: '厨房',
    study: '书房',
    dining: '餐区',
    garden: '花园',
    water: '水景',
    balcony: '阳台'
  };
  return labels[type] || type;
}

function normalizePlan(value, requirement, source, fallback) {
  const plan = value && typeof value === 'object' ? value : {};
  const footprint = normalizeFootprint(plan.footprint, fallback?.footprint);
  const zones = normalizeZones(plan.zones, fallback?.zones);
  return {
    source,
    footprint,
    zones,
    adjacency: normalizeAdjacency(plan.adjacency, zones, fallback?.adjacency),
    circulation: normalizeObject(plan.circulation, fallback?.circulation || {
      entry: requirement.elementPreferences?.door?.side || 'south',
      stairs: requirement.floors > 1 ? 'near-entry' : 'none',
      publicCore: 'living'
    }),
    styleMotifs: normalizeStringArray(plan.styleMotifs, fallback?.styleMotifs),
    constraints: normalizeStringArray(plan.constraints, fallback?.constraints),
    evaluationGoals: normalizeStringArray(plan.evaluationGoals, fallback?.evaluationGoals)
  };
}

function normalizeFootprint(value, fallback) {
  const raw = value && typeof value === 'object' ? value : {};
  const type = String(raw.type || fallback?.type || 'rectangle').toLowerCase();
  return {
    ...fallback,
    ...raw,
    type: FOOTPRINT_TYPES.has(type) ? type : 'rectangle'
  };
}

function normalizeZones(value, fallback) {
  const source = Array.isArray(value) && value.length ? value : fallback || [];
  return source.map((item, index) => {
    const raw = item && typeof item === 'object' ? item : { id: String(item || `zone-${index}`) };
    const id = normalizeId(raw.id || raw.type || raw.label || `zone-${index}`);
    return {
      id,
      label: String(raw.label || raw.name || id),
      type: normalizeId(raw.type || id),
      level: clampNumber(raw.level, 0, 2, 0),
      priority: clampNumber(raw.priority, 1, 100, 50),
      areaHint: String(raw.areaHint || 'medium'),
      needsWindow: raw.needsWindow !== false,
      outside: raw.outside === true
    };
  });
}

function normalizeAdjacency(value, zones, fallback) {
  const ids = new Set(zones.map((item) => item.id));
  const source = Array.isArray(value) && value.length ? value : fallback || [];
  return source
    .filter((item) => Array.isArray(item) && item.length >= 2)
    .map(([a, b]) => [normalizeId(a), normalizeId(b)])
    .filter(([a, b]) => ids.has(a) && ids.has(b));
}

function normalizeObject(value, fallback) {
  return value && typeof value === 'object' ? { ...fallback, ...value } : fallback;
}

function normalizeStringArray(value, fallback) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return fallback || [];
}

function normalizeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-\u4e00-\u9fa5]/g, '_') || 'zone';
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}
