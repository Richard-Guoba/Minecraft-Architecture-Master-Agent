const SUPPORTED_MODES = new Set(['auto', 'mock', 'llm']);
const SHAPES = new Set(['box', 'cylinder']);
const BOOLEAN_MODES = new Set(['union', 'subtract']);

export class SuperArchitectAgent {
  constructor({ llmClient, mode = 'auto' } = {}) {
    this.llmClient = llmClient;
    this.mode = SUPPORTED_MODES.has(mode) ? mode : 'auto';
  }

  async run({ requirement, skill, plan, design }) {
    const fallback = this.fallback({ requirement, skill, plan, design });
    if (this.mode === 'mock') return fallback;

    if (this.mode === 'llm' || (this.mode === 'auto' && this.llmClient?.isConfigured())) {
      try {
        const parsed = await this.llmClient.chatJson({
          system: [
            '你是 Minecraft 超级建筑架构师 Agent。',
            '你只负责宏观形态，不允许输出任何具体 XYZ 坐标。',
            '只输出 JSON，不要解释。',
            '字段必须包括 style, philosophy, materials, volumes, envelopeRules, facadeRules, roofRules。',
            'volumes 数组中每项必须包含 id, role, shape, scale, placement, booleanMode。',
            'shape 只能是 box 或 cylinder；booleanMode 只能是 union 或 subtract。',
            'scale 必须是相对主体的比例对象 {x,y,z}，placement 必须描述语义关系，例如 center, west-wing, east-wing, front-porch。'
          ].join('\n'),
          user: JSON.stringify({ requirement, skill, plan, design: compactDesign(design) })
        });
        return normalizeArchitecture(parsed, fallback, 'llm');
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

  fallback({ requirement, skill, plan, design }) {
    return normalizeArchitecture(buildFallbackArchitecture({ requirement, skill, plan, design }), undefined, 'fallback');
  }
}

function buildFallbackArchitecture({ requirement, skill, plan, design }) {
  const footprint = plan?.footprint?.type || skill?.preferredFootprint || 'rectangle';
  const style = requirement.style || design.style || '通用';
  const materials = {
    wall: design.palette.wall,
    foundation: design.palette.foundation,
    floor: design.palette.floor,
    roof: design.palette.roof,
    trim: design.palette.trim,
    glass: design.palette.glass,
    door: design.palette.doorBase,
    column: design.palette.column || design.palette.trim,
    path: design.palette.path,
    water: design.palette.water,
    lamp: design.palette.lamp
  };

  const volumes = [
    volume('main', '主体体块', 'box', { x: 1, y: 1, z: 1 }, { relation: 'center', anchor: 'site-axis' }, 'union')
  ];

  if (footprint === 'winged') {
    volumes.push(
      volume('west-wing', '左侧翼', 'box', { x: 0.3, y: 1, z: 0.62 }, { relation: 'attached-west', attachTo: 'main', align: 'middle' }, 'union'),
      volume('east-wing', '右侧翼', 'box', { x: 0.3, y: 1, z: 0.62 }, { relation: 'attached-east', attachTo: 'main', align: 'middle' }, 'union')
    );
  } else if (footprint === 'l-shape') {
    volumes.push(volume('glass-wing', 'L 型侧翼', 'box', { x: 0.36, y: 0.6, z: 0.58 }, { relation: 'attached-east', attachTo: 'main', align: 'rear' }, 'union'));
  } else if (footprint === 'courtyard') {
    volumes.push(volume('front-gate', '院落门楼', 'box', { x: 0.36, y: 0.45, z: 0.16 }, { relation: 'front-center', attachTo: 'main' }, 'union'));
  }

  if (style === '欧式' || skill?.skillId === 'european-manor') {
    volumes.push(volume('entry-porch', '中央门廊', 'box', { x: 0.34, y: 0.42, z: 0.18 }, { relation: 'front-center', attachTo: 'main' }, 'union'));
  }

  return {
    style,
    philosophy: '先造壳，后填瓤；LLM 只给语义体块，本地 CSG/BSP 几何引擎负责坐标。',
    footprint,
    materials,
    volumes,
    envelopeRules: {
      shellThickness: design.elements?.wall?.thickness || 1,
      floorHeight: design.dimensions.floorHeight,
      floors: design.floors,
      hollowShell: true,
      preserveCentralAxis: style === '欧式'
    },
    facadeRules: {
      frontSide: design.elements?.door?.side || 'south',
      symmetry: style === '欧式',
      framedWindows: style === '欧式',
      largeGlass: style === '现代',
      porch: style === '欧式',
      columns: style === '欧式'
    },
    roofRules: {
      style: design.elements?.roof?.style || 'gabled',
      height: design.dimensions.roofHeight,
      overhang: design.elements?.roof?.overhang ?? 1,
      separateRoofsForVolumes: ['winged', 'l-shape'].includes(footprint),
      dormers: style === '欧式' ? (requirement.scale === 'large' ? 2 : 1) : 0
    },
    siteRules: {
      formalGarden: style === '欧式',
      centralPath: style === '欧式',
      waterFeature: design.elements?.landscape?.waterFeature === true
    }
  };
}

function volume(id, role, shape, scale, placement, booleanMode) {
  return { id, role, shape, scale, placement, booleanMode };
}

function normalizeArchitecture(value, fallback, source) {
  const raw = value && typeof value === 'object' ? value : {};
  const volumes = normalizeVolumes(raw.volumes, fallback?.volumes);
  return {
    source,
    style: String(raw.style || fallback?.style || '通用'),
    philosophy: String(raw.philosophy || fallback?.philosophy || '先造壳，后填瓤。'),
    footprint: String(raw.footprint || fallback?.footprint || 'rectangle'),
    materials: normalizeObject(raw.materials, fallback?.materials || {}),
    volumes,
    envelopeRules: normalizeObject(raw.envelopeRules, fallback?.envelopeRules || {}),
    facadeRules: normalizeObject(raw.facadeRules, fallback?.facadeRules || {}),
    roofRules: normalizeObject(raw.roofRules, fallback?.roofRules || {}),
    siteRules: normalizeObject(raw.siteRules, fallback?.siteRules || {})
  };
}

function normalizeVolumes(value, fallback = []) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  return source.map((item, index) => {
    const raw = item && typeof item === 'object' ? item : {};
    const shape = String(raw.shape || 'box').toLowerCase();
    const booleanMode = String(raw.booleanMode || raw.boolean_mode || 'union').toLowerCase();
    return {
      id: normalizeId(raw.id || raw.role || `volume-${index}`),
      role: String(raw.role || raw.name || raw.id || `体块 ${index + 1}`),
      shape: SHAPES.has(shape) ? shape : 'box',
      scale: normalizeScale(raw.scale),
      placement: normalizeObject(raw.placement, { relation: index === 0 ? 'center' : 'attached-east' }),
      booleanMode: BOOLEAN_MODES.has(booleanMode) ? booleanMode : 'union'
    };
  });
}

function normalizeScale(value) {
  if (Array.isArray(value)) {
    return {
      x: clampNumber(value[0], 0.1, 1.4, 1),
      y: clampNumber(value[1], 0.2, 1.4, 1),
      z: clampNumber(value[2], 0.1, 1.4, 1)
    };
  }
  const raw = value && typeof value === 'object' ? value : {};
  return {
    x: clampNumber(raw.x ?? raw.width, 0.1, 1.4, 1),
    y: clampNumber(raw.y ?? raw.height, 0.2, 1.4, 1),
    z: clampNumber(raw.z ?? raw.depth, 0.1, 1.4, 1)
  };
}

function normalizeObject(value, fallback) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...fallback, ...value } : fallback;
}

function normalizeId(value) {
  return String(value || 'node')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-\u4e00-\u9fa5]/g, '-') || 'node';
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function compactDesign(design) {
  return {
    style: design.style,
    scale: design.scale,
    floors: design.floors,
    dimensions: design.dimensions,
    palette: design.palette,
    elements: design.elements,
    plan: design.plan
  };
}
