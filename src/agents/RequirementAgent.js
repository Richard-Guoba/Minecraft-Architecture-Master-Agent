const SUPPORTED_MODES = new Set(['auto', 'mock', 'llm']);

const MATERIAL_HINTS = [
  { pattern: /白墙|白色混凝土|白混凝土|white concrete/i, targets: ['wall'], block: 'minecraft:white_concrete' },
  { pattern: /石英地板|quartz floor/i, targets: ['floor'], block: 'minecraft:quartz_block' },
  { pattern: /石英墙|石英外墙|quartz wall/i, targets: ['wall'], block: 'minecraft:quartz_block' },
  { pattern: /石英|quartz/i, targets: ['wall', 'floor'], block: 'minecraft:quartz_block' },
  { pattern: /沙岩|砂岩|sandstone/i, targets: ['wall'], block: 'minecraft:smooth_sandstone' },
  { pattern: /石砖|stone brick/i, targets: ['foundation', 'wall'], block: 'minecraft:stone_bricks' },
  { pattern: /木地板|木质地板|木板地板/i, targets: ['floor'], block: 'minecraft:spruce_planks' },
  { pattern: /橡木地板|oak floor/i, targets: ['floor'], block: 'minecraft:oak_planks' },
  { pattern: /深色橡木|深橡木|dark oak/i, targets: ['door', 'roof', 'trim'], block: 'minecraft:dark_oak_planks' },
  { pattern: /云杉|spruce/i, targets: ['door', 'floor', 'trim'], block: 'minecraft:spruce_planks' },
  { pattern: /黑瓦|黛瓦|黑色屋顶|black tile/i, targets: ['roof'], block: 'minecraft:deepslate_tiles' },
  { pattern: /蓝瓦|青瓦|dark prismarine/i, targets: ['roof'], block: 'minecraft:dark_prismarine' },
  { pattern: /玻璃|glass/i, targets: ['window'], block: 'minecraft:glass' },
  { pattern: /铁门|iron door/i, targets: ['door'], block: 'minecraft:iron_door' },
  { pattern: /木门|wood door/i, targets: ['door'], block: 'minecraft:dark_oak_door' }
];

export class RequirementAgent {
  constructor({ llmClient, mode = 'auto' }) {
    this.llmClient = llmClient;
    this.mode = SUPPORTED_MODES.has(mode) ? mode : 'auto';
  }

  async run(prompt) {
    const fallback = this.fallback(prompt);

    if (this.mode === 'mock') return fallback;
    if (this.mode === 'llm' || (this.mode === 'auto' && this.llmClient?.isConfigured())) {
      try {
        const parsed = await this.llmClient.chatJson({
          system: [
            '你是 Minecraft 建筑需求解析 Agent。',
            '只输出 JSON，不要输出解释。',
            '字段必须包括 style, scale, floors, features, materials, constraints, notes, dimensions, elementPreferences。',
            'features 和 materials 必须是字符串数组。floors 必须是数字。',
            'dimensions 可包含 width, depth, floorHeight, roofHeight, gardenDepth。',
            'elementPreferences 必须描述 wall, floor, door, roof, window, interior, landscape 等元素的尺寸、位置和材质。'
          ].join('\n'),
          user: `解析这个建房需求，用中文短词和 Minecraft 方块 ID 填充字段：${prompt}`
        });
        return normalizeRequirement(prompt, parsed, 'llm');
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

  fallback(prompt) {
    const style = detectStyle(prompt);
    const scale = detectScale(prompt);
    const floorsMatch = prompt.match(/([一二三四五两2-5])\s*层/);
    const floors = floorsMatch ? parseChineseNumber(floorsMatch[1]) : (scale === 'large' ? 2 : 1);
    const features = collectFeatures(prompt, style, scale);
    const materialHints = collectMaterialHints(prompt);
    const dimensions = parseDimensions(prompt, scale);
    const elementPreferences = parseElementPreferences(prompt, style, scale, features, materialHints);

    return normalizeRequirement(prompt, {
      style,
      scale,
      floors,
      features,
      materials: collectMaterialList(elementPreferences, materialHints),
      dimensions,
      elementPreferences,
      constraints: ['Minecraft Java 1.21', '单人创造超平坦世界', '使用数据包函数执行'],
      notes: ['未配置大模型时使用规则模板解析。']
    }, 'fallback');
  }
}

function detectStyle(prompt) {
  if (/江南|水乡|徽派/.test(prompt)) return '江南';
  if (/中式|国风|庭院|四合院|飞檐/.test(prompt)) return '中式';
  if (/欧式|欧洲|古典|城堡|尖顶|庄园/.test(prompt)) return '欧式';
  if (/木屋|木质|森林|原木/.test(prompt)) return '木屋';
  if (/现代|简约|玻璃幕墙|大玻璃|平屋顶|平顶/.test(prompt)) return '现代';
  if (/白墙|黑瓦|黛瓦/.test(prompt)) return '江南';
  return '现代';
}

function detectScale(prompt) {
  if (/小|小型|迷你/.test(prompt) && !/大窗|大门|大玻璃/.test(prompt)) return 'small';
  if (/大|大型|豪华|庄园|别墅|城堡/.test(prompt)) return 'large';
  return 'medium';
}

function collectFeatures(prompt, style, scale) {
  const features = new Set();
  if (style === '欧式') {
    features.add('尖顶');
    features.add('烟囱');
    features.add('对称窗户');
    features.add('对称立面');
    features.add('门廊柱子');
  }
  if (style === '江南' || style === '中式') {
    features.add('白墙');
    features.add('黛瓦');
    features.add('飞檐');
  }
  if (style === '现代') {
    features.add('大玻璃窗');
    features.add('平屋顶');
  }
  if (style === '木屋') {
    features.add('木梁');
    features.add('坡屋顶');
  }
  if (/花园|庭院|院子|小院/.test(prompt) || scale === 'large') features.add('小花园');
  if (/玻璃|窗|采光/.test(prompt)) features.add(/大玻璃|落地窗|玻璃幕墙/.test(prompt) ? '大玻璃窗' : '玻璃窗');
  if (/阳台|露台/.test(prompt)) features.add('阳台');
  if (/喷泉|水池|池塘|水景/.test(prompt)) features.add('水景');
  if (/楼梯|室内|房间|客厅|卧室|家具|灯/.test(prompt)) features.add('室内功能');
  if (/烟囱|壁炉/.test(prompt)) features.add('烟囱');
  return [...features];
}

function parseDimensions(prompt, scale) {
  const defaults = {
    small: { width: 15, depth: 13, gardenDepth: 5 },
    medium: { width: 19, depth: 15, gardenDepth: 6 },
    large: { width: 27, depth: 23, gardenDepth: 9 }
  }[scale] || { width: 19, depth: 15, gardenDepth: 6 };
  const pair = prompt.match(/(?:尺寸|大小)?\s*(\d{2})\s*[xX×*]\s*(\d{2})/);
  const widthBeforeUnit = prompt.match(/(\d{1,2})\s*(?:格|块)?\s*宽/);
  const depthBeforeUnit = prompt.match(/(\d{1,2})\s*(?:格|块)?\s*(?:深|长)/);
  const width = parseDimension(prompt, /宽(?:度)?\s*(\d{1,2})/, pair?.[1] || widthBeforeUnit?.[1], defaults.width);
  const depth = parseDimension(prompt, /(?:深|深度|长|长度)\s*(\d{1,2})/, pair?.[2] || depthBeforeUnit?.[1], defaults.depth);
  const floorHeight = parseDimension(prompt, /层高\s*(\d{1,2})/, undefined, 5, 4, 7);
  const roofHeight = parseDimension(prompt, /屋顶(?:高|高度)\s*(\d{1,2})/, undefined, undefined, 2, 9);
  const gardenDepth = parseDimension(prompt, /(?:庭院|院子|花园)(?:深|长度)?\s*(\d{1,2})/, undefined, defaults.gardenDepth, 3, 16);

  return dropUndefined({
    width,
    depth,
    floorHeight,
    roofHeight,
    gardenDepth
  });
}

function parseDimension(prompt, regex, fallbackRaw, defaultValue, min = 9, max = 45) {
  const match = prompt.match(regex);
  const value = Number(match?.[1] || match?.[2] || fallbackRaw || defaultValue);
  if (!Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function parseElementPreferences(prompt, style, scale, features, materialHints) {
  const largeWindows = /大玻璃|落地窗|玻璃幕墙/.test(prompt) || features.includes('大玻璃窗');
  const doubleDoor = /双开门|大门|拱门|门厅/.test(prompt) || scale === 'large';
  const roofStyle = detectRoofStyle(prompt, style);
  const doorSide = detectDoorSide(prompt);

  return {
    wall: dropUndefined({
      material: materialFor(materialHints, 'wall'),
      thickness: /厚墙|双层墙|厚一点/.test(prompt) ? 2 : 1
    }),
    floor: dropUndefined({
      material: materialFor(materialHints, 'floor')
    }),
    door: dropUndefined({
      material: materialFor(materialHints, 'door'),
      side: doorSide,
      width: doubleDoor ? 2 : 1,
      height: /高门|拱门|门厅/.test(prompt) ? 3 : 2,
      position: `${doorSide}-center`
    }),
    roof: dropUndefined({
      material: materialFor(materialHints, 'roof'),
      style: roofStyle,
      overhang: style === '江南' || style === '中式' ? 2 : 1
    }),
    window: dropUndefined({
      material: materialFor(materialHints, 'window'),
      width: parseDimension(prompt, /窗(?:户)?(?:宽|宽度)\s*(\d{1,2})/, undefined, largeWindows ? 4 : 2, 1, 6),
      height: parseDimension(prompt, /窗(?:户)?(?:高|高度)\s*(\d{1,2})/, undefined, largeWindows ? 3 : 2, 1, 5),
      spacing: /密集窗|很多窗/.test(prompt) ? 4 : 6,
      placement: /对称/.test(prompt) || style === '欧式' ? 'symmetric' : 'balanced'
    }),
    interior: {
      enabled: true,
      rooms: /房间|卧室|客厅|厨房/.test(prompt) ? 4 : 2,
      stairs: true,
      lighting: true
    },
    landscape: {
      enabled: /花园|庭院|院子|小院|喷泉|水池|池塘|水景/.test(prompt) || scale === 'large',
      waterFeature: /喷泉|水池|池塘|水景/.test(prompt) || style === '江南'
    },
    balcony: {
      enabled: /阳台|露台/.test(prompt)
    },
    chimney: {
      enabled: /烟囱|壁炉/.test(prompt) || style === '欧式'
    }
  };
}

function detectRoofStyle(prompt, style) {
  if (/平屋顶|平顶|露台顶/.test(prompt) || style === '现代') return 'flat';
  if (/飞檐|翘角|江南|中式|黑瓦|黛瓦/.test(prompt) || style === '江南' || style === '中式') return 'pagoda';
  if (/四坡|庑殿|歇山/.test(prompt)) return 'hipped';
  return 'gabled';
}

function detectDoorSide(prompt) {
  if (/门(?:在|放)?\s*东|东侧门|东门/.test(prompt)) return 'east';
  if (/门(?:在|放)?\s*西|西侧门|西门/.test(prompt)) return 'west';
  if (/门(?:在|放)?\s*北|北侧门|北门/.test(prompt)) return 'north';
  return 'south';
}

function collectMaterialHints(prompt) {
  return MATERIAL_HINTS.filter((hint) => hint.pattern.test(prompt));
}

function materialFor(hints, target) {
  const hint = [...hints].reverse().find((item) => item.targets.length === 1 && item.targets.includes(target)) ||
    [...hints].reverse().find((item) => item.targets.includes(target));
  return hint?.block;
}

function collectMaterialList(elementPreferences, hints) {
  const materials = new Set(hints.map((hint) => hint.block));
  for (const group of Object.values(elementPreferences)) {
    if (group && typeof group === 'object' && group.material) materials.add(group.material);
  }
  return [...materials].map((item) => item.replace(/^minecraft:/, ''));
}

function normalizeRequirement(prompt, value, source) {
  const floors = Number(value.floors);
  return {
    source,
    prompt,
    style: String(value.style || '欧式'),
    scale: normalizeScale(value.scale),
    floors: Number.isFinite(floors) ? Math.max(1, Math.min(3, Math.round(floors))) : 2,
    features: normalizeArray(value.features),
    materials: normalizeArray(value.materials),
    dimensions: normalizeDimensions(value.dimensions),
    elementPreferences: normalizeElementPreferences(value.elementPreferences || value.elements),
    constraints: normalizeArray(value.constraints),
    notes: normalizeArray(value.notes)
  };
}

function normalizeScale(value) {
  const scale = String(value || 'medium').toLowerCase();
  if (['small', 'medium', 'large'].includes(scale)) return scale;
  if (/小/.test(scale)) return 'small';
  if (/大|豪华|large/.test(scale)) return 'large';
  return 'medium';
}

function normalizeDimensions(value) {
  if (!value || typeof value !== 'object') return {};
  return dropUndefined({
    width: clampNumber(value.width, 9, 45),
    depth: clampNumber(value.depth, 9, 45),
    floorHeight: clampNumber(value.floorHeight, 4, 7),
    roofHeight: clampNumber(value.roofHeight, 2, 9),
    gardenDepth: clampNumber(value.gardenDepth, 3, 16)
  });
}

function normalizeElementPreferences(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    wall: normalizeElementObject(pick(source, ['wall', 'walls', '墙', '墙壁', '墙体'])),
    floor: normalizeElementObject(pick(source, ['floor', 'floors', '地板', '楼板'])),
    door: normalizeElementObject(pick(source, ['door', 'doors', '门', '大门'])),
    roof: normalizeElementObject(pick(source, ['roof', 'roofs', '屋顶'])),
    window: normalizeElementObject(pick(source, ['window', 'windows', '窗', '窗户'])),
    interior: normalizeElementObject(pick(source, ['interior', '室内', '内部'])),
    landscape: normalizeElementObject(pick(source, ['landscape', 'garden', '庭院', '花园'])),
    balcony: normalizeElementObject(pick(source, ['balcony', '阳台', '露台'])),
    chimney: normalizeElementObject(pick(source, ['chimney', '烟囱']))
  };
}

function normalizeElementObject(value) {
  if (!value) return {};
  if (typeof value === 'string') return { material: value };
  if (typeof value !== 'object') return {};
  return dropUndefined({
    material: value.material || value.block,
    style: value.style,
    side: value.side,
    position: value.position,
    placement: value.placement,
    width: clampNumber(value.width, 1, 12),
    height: clampNumber(value.height, 1, 12),
    thickness: clampNumber(value.thickness, 1, 3),
    spacing: clampNumber(value.spacing, 3, 10),
    overhang: clampNumber(value.overhang, 0, 4),
    rooms: clampNumber(value.rooms, 1, 8),
    enabled: typeof value.enabled === 'boolean' ? value.enabled : undefined,
    stairs: typeof value.stairs === 'boolean' ? value.stairs : undefined,
    lighting: typeof value.lighting === 'boolean' ? value.lighting : undefined,
    waterFeature: typeof value.waterFeature === 'boolean' ? value.waterFeature : undefined
  });
}

function pick(source, keys) {
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }
  return undefined;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value) return [];
  return [String(value)];
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function dropUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function parseChineseNumber(value) {
  const map = new Map([
    ['一', 1],
    ['二', 2],
    ['两', 2],
    ['三', 3],
    ['四', 4],
    ['五', 5]
  ]);
  return map.get(value) || Number(value) || 2;
}
