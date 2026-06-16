const SHAPES = new Set(['box', 'cylinder']);
const BOOLEAN_MODES = new Set(['union', 'subtract']);

const MATERIAL_PRESETS = {
  欧式: {
    foundation: 'minecraft:stone_bricks',
    wall: 'minecraft:smooth_sandstone',
    floor: 'minecraft:spruce_planks',
    roof: 'minecraft:dark_oak_planks',
    trim: 'minecraft:smooth_quartz',
    glass: 'minecraft:glass',
    door: 'minecraft:dark_oak_door',
    interior_wall: 'minecraft:birch_planks',
    stairs: 'minecraft:spruce_stairs[facing=south,half=bottom]',
    path: 'minecraft:gravel',
    lamp: 'minecraft:glowstone'
  },
  现代: {
    foundation: 'minecraft:smooth_stone',
    wall: 'minecraft:white_concrete',
    floor: 'minecraft:quartz_block',
    roof: 'minecraft:smooth_stone',
    trim: 'minecraft:light_gray_concrete',
    glass: 'minecraft:glass',
    door: 'minecraft:iron_door',
    interior_wall: 'minecraft:light_gray_concrete',
    stairs: 'minecraft:quartz_stairs[facing=south,half=bottom]',
    path: 'minecraft:smooth_stone',
    lamp: 'minecraft:sea_lantern'
  },
  江南: {
    foundation: 'minecraft:stone_bricks',
    wall: 'minecraft:white_concrete',
    floor: 'minecraft:spruce_planks',
    roof: 'minecraft:deepslate_tiles',
    trim: 'minecraft:stripped_dark_oak_log',
    glass: 'minecraft:glass_pane',
    door: 'minecraft:spruce_door',
    interior_wall: 'minecraft:birch_planks',
    stairs: 'minecraft:spruce_stairs[facing=south,half=bottom]',
    path: 'minecraft:mossy_cobblestone',
    lamp: 'minecraft:lantern[hanging=true]'
  },
  木屋: {
    foundation: 'minecraft:cobblestone',
    wall: 'minecraft:stripped_spruce_log',
    floor: 'minecraft:spruce_planks',
    roof: 'minecraft:dark_oak_planks',
    trim: 'minecraft:stripped_dark_oak_log',
    glass: 'minecraft:glass_pane',
    door: 'minecraft:spruce_door',
    interior_wall: 'minecraft:spruce_planks',
    stairs: 'minecraft:spruce_stairs[facing=south,half=bottom]',
    path: 'minecraft:coarse_dirt',
    lamp: 'minecraft:lantern[hanging=true]'
  }
};

const MATERIAL_HINTS = [
  { pattern: /白墙|白色混凝土|白混凝土|white concrete/i, targets: ['wall'], block: 'minecraft:white_concrete' },
  { pattern: /石英地板|quartz floor/i, targets: ['floor'], block: 'minecraft:quartz_block' },
  { pattern: /石英墙|石英外墙|quartz wall/i, targets: ['wall'], block: 'minecraft:quartz_block' },
  { pattern: /石英|quartz/i, targets: ['wall', 'floor'], block: 'minecraft:quartz_block' },
  { pattern: /沙岩|砂岩|sandstone/i, targets: ['wall'], block: 'minecraft:smooth_sandstone' },
  { pattern: /石砖|stone brick/i, targets: ['foundation', 'wall'], block: 'minecraft:stone_bricks' },
  { pattern: /木地板|木质地板|木板地板/i, targets: ['floor'], block: 'minecraft:spruce_planks' },
  { pattern: /橡木地板|oak floor/i, targets: ['floor'], block: 'minecraft:oak_planks' },
  { pattern: /黑瓦|黛瓦|黑色屋顶|black tile/i, targets: ['roof'], block: 'minecraft:deepslate_tiles' },
  { pattern: /玻璃|glass/i, targets: ['glass'], block: 'minecraft:glass' },
  { pattern: /铁门|iron door/i, targets: ['door'], block: 'minecraft:iron_door' },
  { pattern: /木门|wood door/i, targets: ['door'], block: 'minecraft:dark_oak_door' }
];

export class ConstructionArchitectAgent {
  constructor({ llmClient, mode = 'auto' } = {}) {
    this.llmClient = llmClient;
    this.mode = ['auto', 'mock', 'llm'].includes(mode) ? mode : 'auto';
  }

  async run(prompt) {
    const fallback = normalizeArchitecture(buildFallbackArchitecture(prompt), 'fallback');
    if (this.mode === 'mock') return fallback;

    if (this.mode === 'llm' || (this.mode === 'auto' && this.llmClient?.isConfigured())) {
      try {
        const parsed = await this.llmClient.chatJson({
          system: [
            '你是一个世界级 Minecraft 建筑大师。',
            '你只思考宏观形态，绝对不要输出具体 XYZ 坐标。',
            '只输出严格 JSON，字段包含 style, materials, volumes, envelope_rules, facade_rules, roof_rules。',
            'volumes 中每项只能包含 id, role, shape, scale, placement, boolean_mode。',
            'scale 是相对主体比例数组 [x,y,z]；placement 是语义关系。'
          ].join('\n'),
          user: prompt
        });
        return normalizeArchitecture(parsed, 'llm', fallback);
      } catch (error) {
        if (this.mode === 'llm') throw error;
        return { ...fallback, source: 'fallback-after-llm-error', llm_error: error.message };
      }
    }

    return fallback;
  }
}

export function buildFallbackArchitecture(prompt) {
  const style = detectStyle(prompt);
  const scale = detectScale(prompt);
  const footprint = detectFootprint(prompt, style, scale);
  const materials = materialOverrides(prompt, MATERIAL_PRESETS[style] || MATERIAL_PRESETS.欧式);
  const volumes = [
    volume('main', '主体外壳', 'box', [1, 1, 1], { relation: 'center' }, 'union')
  ];

  if (footprint === 'winged') {
    volumes.push(
      volume('west-wing', '西侧翼楼', 'box', [0.32, 0.95, 0.62], { relation: 'attached-west', attach_to: 'main' }, 'union'),
      volume('east-wing', '东侧翼楼', 'box', [0.32, 0.95, 0.62], { relation: 'attached-east', attach_to: 'main' }, 'union'),
      volume('entry-porch', '中央门廊', 'box', [0.34, 0.42, 0.18], { relation: 'front-center', attach_to: 'main' }, 'union')
    );
  } else if (footprint === 'l-shape') {
    volumes.push(volume('glass-wing', '玻璃侧翼', 'box', [0.36, 0.62, 0.58], { relation: 'attached-east-rear', attach_to: 'main' }, 'union'));
  } else if (footprint === 'courtyard') {
    volumes.push(volume('front-gate', '前院门楼', 'box', [0.38, 0.45, 0.16], { relation: 'front-center', attach_to: 'main' }, 'union'));
  }

  if (/塔|尖塔|城堡|tower/i.test(prompt)) {
    volumes.push(volume('corner-tower', '角塔', 'cylinder', [0.24, 1.25, 0.24], { relation: 'attached-north-east', attach_to: 'main' }, 'union'));
  }

  let roofStyle = /平屋顶|平顶|现代/.test(prompt) || style === '现代' ? 'flat' : 'gabled';
  if (['江南', '中式'].includes(style)) roofStyle = 'pagoda';

  return {
    style,
    philosophy: '先造壳，后填瓤；LLM 只输出语义 JSON，本地 JS CSG/BSP/A* 引擎负责坐标。',
    footprint,
    materials,
    volumes,
    envelope_rules: {
      hollow_shell: true,
      shell_thickness: 1,
      preserve_main_axis: style === '欧式'
    },
    facade_rules: {
      front_side: detectDoorSide(prompt),
      symmetry: style === '欧式',
      large_glass: style === '现代' || /大玻璃|落地窗|玻璃幕墙/.test(prompt),
      porch: style === '欧式'
    },
    roof_rules: {
      style: roofStyle,
      overhang: roofStyle === 'flat' ? 0 : 1,
      dormers: style === '欧式' && scale === 'large' ? 2 : style === '欧式' ? 1 : 0
    },
    site_rules: {
      formal_garden: style === '欧式' || scale === 'large',
      water_feature: /喷泉|水池|池塘|水景/.test(prompt) || style === '江南'
    }
  };
}

export function normalizeArchitecture(value, source, fallback = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    source,
    style: String(raw.style || fallback.style || '欧式'),
    philosophy: String(raw.philosophy || fallback.philosophy || '先造壳，后填瓤。'),
    footprint: String(raw.footprint || fallback.footprint || 'rectangle'),
    materials: { ...(fallback.materials || {}), ...normalizeObject(raw.materials) },
    volumes: normalizeVolumes(raw.volumes, fallback.volumes),
    envelope_rules: { ...(fallback.envelope_rules || {}), ...normalizeObject(raw.envelope_rules || raw.envelopeRules) },
    facade_rules: { ...(fallback.facade_rules || {}), ...normalizeObject(raw.facade_rules || raw.facadeRules) },
    roof_rules: { ...(fallback.roof_rules || {}), ...normalizeObject(raw.roof_rules || raw.roofRules) },
    site_rules: { ...(fallback.site_rules || {}), ...normalizeObject(raw.site_rules || raw.siteRules) }
  };
}

function normalizeVolumes(value, fallback = []) {
  const source = Array.isArray(value) && value.length ? value : Array.isArray(fallback) ? fallback : [];
  const volumes = source.map((item, index) => {
    const raw = item && typeof item === 'object' ? item : {};
    const shape = String(raw.shape || 'box').toLowerCase();
    const booleanMode = String(raw.boolean_mode || raw.booleanMode || 'union').toLowerCase();
    return volume(
      normalizeId(raw.id || raw.role || `volume-${index}`),
      String(raw.role || raw.name || raw.id || `体块 ${index + 1}`),
      SHAPES.has(shape) ? shape : 'box',
      normalizeScale(raw.scale),
      normalizeObject(raw.placement) || { relation: index === 0 ? 'center' : 'attached-east' },
      BOOLEAN_MODES.has(booleanMode) ? booleanMode : 'union'
    );
  });
  return volumes.length ? volumes : [volume('main', '主体外壳', 'box', [1, 1, 1], { relation: 'center' }, 'union')];
}

function volume(id, role, shape, scale, placement, booleanMode) {
  return { id, role, shape, scale, placement, boolean_mode: booleanMode };
}

function normalizeScale(value) {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? [value.x ?? value.width, value.y ?? value.height, value.z ?? value.depth]
      : [1, 1, 1];
  return [
    clampNumber(raw[0], 0.1, 1.4, 1),
    clampNumber(raw[1], 0.2, 1.6, 1),
    clampNumber(raw[2], 0.1, 1.4, 1)
  ];
}

export function detectStyle(prompt) {
  if (/江南|水乡|徽派|白墙黑瓦/.test(prompt)) return '江南';
  if (/中式|国风|四合院|飞檐/.test(prompt)) return '江南';
  if (/欧式|欧洲|古典|城堡|庄园|尖顶/.test(prompt)) return '欧式';
  if (/木屋|木质|森林|原木/.test(prompt)) return '木屋';
  if (/现代|简约|玻璃幕墙|大玻璃|平屋顶|平顶/.test(prompt)) return '现代';
  return /大房子|别墅|豪华/.test(prompt) ? '欧式' : '现代';
}

export function detectScale(prompt) {
  if (/小|小型|迷你/.test(prompt) && !/大窗|大门|大玻璃/.test(prompt)) return 'small';
  if (/大|大型|豪华|庄园|别墅|城堡/.test(prompt)) return 'large';
  return 'medium';
}

export function detectFloors(prompt, scale) {
  const match = prompt.match(/([一二三四五两2-5])\s*层/);
  if (match) return Math.max(1, Math.min(3, parseChineseNumber(match[1])));
  return scale === 'large' ? 2 : 1;
}

function detectFootprint(prompt, style, scale) {
  if (/L型|L 形|l-shape|侧翼|大玻璃/i.test(prompt) || style === '现代') return 'l-shape';
  if (/庭院|院落|四合院|小院/.test(prompt) || style === '江南') return 'courtyard';
  if (style === '欧式' || scale === 'large') return 'winged';
  return 'rectangle';
}

export function detectDoorSide(prompt) {
  if (/门(?:在|放)?\s*东|东侧门|东门/.test(prompt)) return 'east';
  if (/门(?:在|放)?\s*西|西侧门|西门/.test(prompt)) return 'west';
  if (/门(?:在|放)?\s*北|北侧门|北门/.test(prompt)) return 'north';
  return 'south';
}

function materialOverrides(prompt, base) {
  const materials = { ...base };
  const explicitTargets = new Set();
  for (const hint of MATERIAL_HINTS) {
    if (!hint.pattern.test(prompt)) continue;
    for (const target of hint.targets) {
      if (hint.targets.length > 1 && explicitTargets.has(target)) continue;
      materials[target] = hint.block;
      if (hint.targets.length === 1) explicitTargets.add(target);
    }
  }
  materials.door = toDoorBlock(materials.door);
  return materials;
}

function toDoorBlock(block) {
  const base = String(block || '').split('[')[0];
  if (base.endsWith('_door')) return base;
  if (['minecraft:white_concrete', 'minecraft:quartz_block', 'minecraft:smooth_stone'].includes(base)) return 'minecraft:iron_door';
  if (base.includes('spruce')) return 'minecraft:spruce_door';
  return 'minecraft:dark_oak_door';
}

function parseChineseNumber(value) {
  return new Map([
    ['一', 1],
    ['二', 2],
    ['两', 2],
    ['三', 3],
    ['四', 4],
    ['五', 5]
  ]).get(value) || Number(value) || 2;
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function normalizeId(value) {
  return String(value || 'node')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-\u4e00-\u9fff]+/g, '-') || 'node';
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
