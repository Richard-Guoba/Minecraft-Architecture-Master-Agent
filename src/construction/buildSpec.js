import { detectDoorSide, detectFloors, detectScale } from './agents/architectAgent.js';

export function deriveBuildSpec(prompt, architecture, seed) {
  const normalizedArchitecture = architecture || {};
  const scale = detectScale(prompt);
  const footprint = normalizeFootprint(normalizedArchitecture.footprint);
  const style = String(normalizedArchitecture.style || '通用');
  const styleFamily = String(normalizedArchitecture.style_family || normalizedArchitecture.styleFamily || 'general');
  const typology = String(normalizedArchitecture.typology || inferTypology(prompt, style));
  const defaults = defaultBuildDimensions({ scale, footprint, style, styleFamily, typology });
  const seedVariation = createSeedVariation(seed, { scale, typology });
  const explicitDimensions = parseDimensions(prompt, defaults.width, defaults.depth, {
    minWidth: defaults.min_width,
    maxWidth: defaults.max_width,
    minDepth: defaults.min_depth,
    maxDepth: defaults.max_depth
  });
  const dimensions = applySeedDimensionVariation(explicitDimensions, defaults, seedVariation, typology);
  const floorHeight = deriveFloorHeight(prompt, normalizedArchitecture, defaults);
  const floors = deriveFloorCount(prompt, normalizedArchitecture, scale, typology);
  const roofHeight = deriveRoofHeight(prompt, normalizedArchitecture, defaults, floors, floorHeight);
  const wallHeight = floors * floorHeight;
  const gardenDepth = deriveGardenDepth(prompt, normalizedArchitecture, defaults, seedVariation);
  const shellThickness = deriveShellThickness(prompt, normalizedArchitecture);
  const doorSide = normalizeSide(String(normalizedArchitecture.facade_rules?.front_side || detectDoorSide(prompt)));
  const doorWidth = deriveDoorWidth(prompt, normalizedArchitecture, scale, typology);
  const doorHeight = deriveDoorHeight(prompt, normalizedArchitecture, floorHeight, scale, typology);
  const facadeRules = normalizedArchitecture.facade_rules || {};
  const roofRules = normalizedArchitecture.roof_rules || {};
  const siteRules = normalizedArchitecture.site_rules || {};

  return {
    scale,
    style,
    style_family: styleFamily,
    typology,
    footprint,
    width: dimensions.width,
    depth: dimensions.depth,
    floors,
    floor_height: floorHeight,
    wall_height: wallHeight,
    roof_height: roofHeight,
    total_height: wallHeight + roofHeight,
    garden_depth: gardenDepth.value,
    shell_thickness: shellThickness,
    door_side: doorSide,
    door_width: doorWidth,
    door_height: doorHeight,
    roof_style: String(roofRules.style || defaults.roof_style),
    roof_overhang: clampNumber(Number(roofRules.overhang ?? defaults.roof_overhang), 0, 4, defaults.roof_overhang),
    lot: {
      width: dimensions.width + defaults.side_setback * 2,
      depth: dimensions.depth + gardenDepth.value + defaults.rear_setback,
      side_setback: defaults.side_setback,
      front_setback: gardenDepth.value,
      rear_setback: defaults.rear_setback
    },
    seed,
    seed_variation: seedVariation,
    structural: {
      system: normalizedArchitecture.structural_rules?.system || 'standard-shell',
      shell_thickness: shellThickness,
      span_strategy: normalizedArchitecture.structural_rules?.span_strategy || 'room-scale-spans',
      supports: normalizedArchitecture.structural_rules?.primary_supports || 'load-bearing-walls'
    },
    facade: {
      symmetry: Boolean(facadeRules.symmetry),
      large_glass: Boolean(facadeRules.large_glass),
      glazing_ratio: String(facadeRules.glazing_ratio || 'medium'),
      porch: Boolean(facadeRules.porch),
      arches: Boolean(facadeRules.arches || facadeRules.pointed_arches),
      screens: Boolean(facadeRules.screen),
      balcony: Boolean(facadeRules.balcony)
    },
    site: {
      formal_garden: Boolean(siteRules.formal_garden),
      water_feature: Boolean(siteRules.water_feature),
      dry_garden: Boolean(siteRules.dry_garden),
      patio: Boolean(siteRules.patio),
      enclosed_courtyard: Boolean(siteRules.enclosed_courtyard),
      landscape_mood: String(siteRules.landscape_mood || 'simple')
    },
    modules: {
      preferred: normalizeStringArray(normalizedArchitecture.generation_hints?.preferred_modules),
      future_engine_features: normalizeStringArray(normalizedArchitecture.generation_hints?.future_engine_features)
    },
    constraints: {
      max_width: defaults.max_width,
      max_depth: defaults.max_depth,
      max_floors: 5,
      max_total_height: 40,
      minecraft_fill_limit: 32768
    },
    source: {
      dimensions: explicitDimensions.source,
      width: explicitDimensions.width_source,
      depth: explicitDimensions.depth_source,
      garden_depth: gardenDepth.source,
      floors: deriveFloorCountSource(prompt, normalizedArchitecture),
      floor_height: hasNumberAfter(prompt, /层高\s*([一二三四五六七八九十两\d]{1,3})/i) ? 'prompt' : 'default',
      roof_height: hasNumberAfter(prompt, /屋顶(?:高|高度)\s*([一二三四五六七八九十两\d]{1,3})/i) ? 'prompt' : 'architecture-or-default',
      semantic_architecture: normalizedArchitecture.source || 'unknown'
    }
  };
}

function parseDimensions(prompt, defaultWidth, defaultDepth, limits = {}) {
  const pair = prompt.match(/(?:尺寸|大小|占地|地基)?\s*([一二三四五六七八九十两\d]{1,3})\s*(?:x|X|×|\*)\s*([一二三四五六七八九十两\d]{1,3})/);
  const widthBefore = prompt.match(/([一二三四五六七八九十两\d]{1,3})\s*(?:格|块|米|m)?\s*宽/);
  const depthBefore = prompt.match(/([一二三四五六七八九十两\d]{1,3})\s*(?:格|块|米|m)?\s*(?:深|长)/);
  const widthAfter = prompt.match(/宽(?:度)?\s*([一二三四五六七八九十两\d]{1,3})/);
  const depthAfter = prompt.match(/(?:深|深度|长|长度)\s*([一二三四五六七八九十两\d]{1,3})/);
  const rawWidth = parseNumberToken(pair?.[1]) ?? parseNumberToken(widthAfter?.[1]) ?? parseNumberToken(widthBefore?.[1]);
  const rawDepth = parseNumberToken(pair?.[2]) ?? parseNumberToken(depthAfter?.[1]) ?? parseNumberToken(depthBefore?.[1]);
  const minWidth = limits.minWidth ?? 11;
  const maxWidth = limits.maxWidth ?? 45;
  const minDepth = limits.minDepth ?? 11;
  const maxDepth = limits.maxDepth ?? 45;
  const widthFromPrompt = rawWidth !== undefined;
  const depthFromPrompt = rawDepth !== undefined;
  return {
    width: clampNumber(rawWidth ?? defaultWidth, minWidth, maxWidth, defaultWidth),
    depth: clampNumber(rawDepth ?? defaultDepth, minDepth, maxDepth, defaultDepth),
    source: widthFromPrompt || depthFromPrompt ? 'prompt' : 'default',
    width_source: widthFromPrompt ? 'prompt' : 'default',
    depth_source: depthFromPrompt ? 'prompt' : 'default'
  };
}

function applySeedDimensionVariation(dimensions, defaults, variation, typology) {
  const compactTypology = ['cabin', 'treehouse', 'lodge'].includes(typology);
  const minWidth = Math.max(defaults.min_width, defaults.width - 4);
  const maxWidth = compactTypology ? defaults.width : Math.min(defaults.max_width, defaults.width + 4);
  const minDepth = Math.max(defaults.min_depth, defaults.depth - 4);
  const maxDepth = compactTypology ? defaults.depth : Math.min(defaults.max_depth, defaults.depth + 4);
  return {
    ...dimensions,
    width: dimensions.width_source === 'default'
      ? clampNumber(dimensions.width + variation.width_delta, minWidth, maxWidth, dimensions.width)
      : dimensions.width,
    depth: dimensions.depth_source === 'default'
      ? clampNumber(dimensions.depth + variation.depth_delta, minDepth, maxDepth, dimensions.depth)
      : dimensions.depth
  };
}

function createSeedVariation(seed, context = {}) {
  const parsed = Number(seed);
  if (!Number.isFinite(parsed)) {
    return { source: 'none', width_delta: 0, depth_delta: 0, garden_delta: 0 };
  }
  const seedInt = Math.abs(Math.trunc(parsed));
  const compactTypology = ['cabin', 'treehouse', 'lodge'].includes(context.typology);
  const dimensionSteps = compactTypology
    ? [-2, 0, 0]
    : context.scale === 'large' ? [-4, -2, 0, 2, 4] : [-2, 0, 2];
  const gardenSteps = [-1, 0, 1];
  return {
    source: 'seed',
    width_delta: dimensionSteps[seedInt % dimensionSteps.length],
    depth_delta: dimensionSteps[Math.floor(seedInt / dimensionSteps.length) % dimensionSteps.length],
    garden_delta: gardenSteps[Math.floor(seedInt / (dimensionSteps.length * dimensionSteps.length)) % gardenSteps.length]
  };
}

function defaultBuildDimensions({ scale, footprint, style, styleFamily, typology }) {
  const base = {
    small: { width: 15, depth: 13, garden_depth: 5 },
    medium: { width: 19, depth: 15, garden_depth: 6 },
    large: { width: 27, depth: 23, garden_depth: 9 }
  }[scale] || { width: 19, depth: 15, garden_depth: 6 };
  const defaults = {
    ...base,
    min_width: 11,
    max_width: 45,
    min_depth: 11,
    max_depth: 45,
    floor_height: ['industrial', 'modern', 'futuristic', 'cyberpunk', 'greenhouse-house'].includes(styleFamily) ? 6 : 5,
    roof_height: style === '欧式' || style === '哥特' ? 6 : ['日式', '热带', '北欧', '雪山', '树屋'].includes(style) ? 4 : 3,
    roof_style: 'gabled',
    roof_overhang: ['japanese', 'tropical', 'chinese-courtyard'].includes(styleFamily) ? 2 : 1,
    side_setback: scale === 'large' ? 4 : 2,
    rear_setback: scale === 'large' ? 4 : 2
  };
  if (footprint === 'winged') {
    defaults.width += scale === 'large' ? 2 : 1;
    defaults.min_width = Math.max(defaults.min_width, 21);
    defaults.min_depth = Math.max(defaults.min_depth, 17);
  } else if (footprint === 'courtyard') {
    defaults.width += scale === 'small' ? 0 : 2;
    defaults.depth += 2;
    defaults.garden_depth += 1;
    defaults.min_width = Math.max(defaults.min_width, 17);
    defaults.min_depth = Math.max(defaults.min_depth, 15);
    defaults.rear_setback += 1;
  } else if (footprint === 'l-shape') {
    defaults.width += 2;
    defaults.min_width = Math.max(defaults.min_width, 17);
  } else if (footprint === 'compact-tower') {
    defaults.width = Math.max(styleFamily === 'treehouse' ? 13 : 15, Math.min(defaults.width, styleFamily === 'treehouse' ? 17 : 21));
    defaults.depth = Math.max(styleFamily === 'treehouse' ? 13 : 15, Math.min(defaults.depth, styleFamily === 'treehouse' ? 17 : 21));
    defaults.roof_height += 2;
  }
  if (typology === 'castle') {
    defaults.width = Math.max(defaults.width, 29);
    defaults.depth = Math.max(defaults.depth, 25);
    defaults.roof_height = Math.max(defaults.roof_height, 7);
    defaults.garden_depth = Math.max(defaults.garden_depth, 8);
  } else if (['cabin', 'treehouse', 'lodge'].includes(typology)) {
    defaults.width = Math.min(defaults.width, 17);
    defaults.depth = Math.min(defaults.depth, 15);
    if (typology === 'treehouse') defaults.garden_depth = Math.max(defaults.garden_depth, 7);
  } else if (typology === 'earth-shelter') {
    defaults.width = Math.max(defaults.width, 21);
    defaults.depth = Math.max(defaults.depth, 17);
    defaults.garden_depth = Math.max(defaults.garden_depth, 7);
  } else if (typology === 'villa') {
    defaults.width = Math.max(defaults.width, 25);
    defaults.depth = Math.max(defaults.depth, 19);
  }
  if (['desert', 'mediterranean', 'subterranean'].includes(styleFamily)) {
    defaults.floor_height = 5;
    defaults.roof_height = 2;
    defaults.roof_style = 'flat';
  } else if (['modern', 'industrial', 'futuristic', 'cyberpunk', 'cliffside', 'greenhouse-house'].includes(styleFamily)) {
    defaults.roof_style = 'flat';
    defaults.roof_height = Math.min(defaults.roof_height, 3);
  } else if (styleFamily === 'coastal') {
    defaults.roof_style = 'hipped';
    defaults.roof_height = Math.max(defaults.roof_height, 3);
    defaults.roof_overhang = Math.max(defaults.roof_overhang, 1);
    defaults.garden_depth = Math.max(defaults.garden_depth, 7);
  } else if (styleFamily === 'alpine') {
    defaults.roof_style = 'gabled';
    defaults.roof_height = Math.max(defaults.roof_height, 5);
    defaults.roof_overhang = Math.max(defaults.roof_overhang, 2);
  } else if (styleFamily === 'treehouse') {
    defaults.roof_style = 'hipped';
    defaults.roof_height = Math.max(defaults.roof_height, 5);
    defaults.side_setback = Math.max(defaults.side_setback, 3);
  } else if (styleFamily === 'japanese') {
    defaults.roof_style = 'hipped';
  } else if (styleFamily === 'chinese-courtyard') {
    defaults.roof_style = 'pagoda';
  }
  return defaults;
}

function deriveFloorCount(prompt, architecture, scale, typology) {
  const explicit = parseFloorCount(prompt);
  if (explicit !== undefined) return explicit;
  const semanticFloors = Number(architecture.envelope_rules?.floors || architecture.massing_rules?.floors);
  if (Number.isFinite(semanticFloors)) return clampNumber(semanticFloors, 1, 5, detectFloors(prompt, scale));
  if (typology === 'castle') return 3;
  if (typology === 'cabin') return 1;
  return detectFloors(prompt, scale);
}

function deriveFloorCountSource(prompt, architecture) {
  if (parseFloorCount(prompt) !== undefined) return 'prompt';
  if (architecture.envelope_rules?.floors || architecture.massing_rules?.floors) return 'architecture';
  return 'default';
}

function deriveFloorHeight(prompt, architecture, defaults) {
  const explicit = extractNumber(prompt, /层高\s*([一二三四五六七八九十两\d]{1,3})/i);
  const semantic = Number(architecture.envelope_rules?.floor_height || architecture.envelope_rules?.floorHeight);
  const value = explicit ?? (Number.isFinite(semantic) ? semantic : defaults.floor_height);
  return clampNumber(value, 4, 8, defaults.floor_height);
}

function deriveRoofHeight(prompt, architecture, defaults, floors, floorHeight) {
  const explicit = extractNumber(prompt, /屋顶(?:高|高度)\s*([一二三四五六七八九十两\d]{1,3})/i);
  const semantic = Number(architecture.roof_rules?.height || architecture.roof_rules?.roof_height);
  const style = String(architecture.roof_rules?.style || defaults.roof_style);
  let value = explicit ?? (Number.isFinite(semantic) ? semantic : defaults.roof_height);
  if (style === 'flat') value = Math.min(value, 3);
  if (architecture.roof_rules?.vertical_accent) value = Math.max(value, 5);
  const maxTotalRoof = Math.max(2, 40 - floors * floorHeight);
  return clampNumber(value, 1, Math.min(9, maxTotalRoof), defaults.roof_height);
}

function deriveGardenDepth(prompt, architecture, defaults, variation = createSeedVariation()) {
  const explicit = extractNumber(prompt, /(?:庭院|院子|花园|前院|后院)(?:深|长度)?\s*([一二三四五六七八九十两\d]{1,3})/i);
  const semantic = Number(architecture.site_rules?.garden_depth || architecture.site_rules?.gardenDepth);
  const source = explicit !== undefined ? 'prompt' : Number.isFinite(semantic) ? 'architecture' : 'default';
  let value = explicit ?? (Number.isFinite(semantic) ? semantic : defaults.garden_depth);
  if (architecture.site_rules?.formal_garden) value = Math.max(value, 8);
  if (architecture.site_rules?.dry_garden) value = Math.max(value, 6);
  if (architecture.site_rules?.water_feature) value = Math.max(value, 7);
  if (source === 'default') value += variation.garden_delta;
  return { value: clampNumber(value, 3, 18, defaults.garden_depth), source };
}

function deriveShellThickness(prompt, architecture) {
  const explicit = extractNumber(prompt, /(?:墙厚|厚墙|墙体厚度)\s*([一二三四五六七八九十两\d]{1,3})/i);
  const semantic = Number(architecture.envelope_rules?.shell_thickness || architecture.envelope_rules?.shellThickness);
  const styleFamily = String(architecture.style_family || architecture.styleFamily || '');
  const thickByText = /厚墙|双层墙|夯土|土坯|城堡|堡垒|地下|地堡|半地下|掩体/.test(prompt) || styleFamily === 'subterranean';
  const value = explicit ?? (Number.isFinite(semantic) ? semantic : thickByText ? 2 : 1);
  return clampNumber(value, 1, 3, 1);
}

function deriveDoorWidth(prompt, architecture, scale, typology) {
  const explicit = extractNumber(prompt, /(?:门宽|大门宽度|入口宽度)\s*([一二三四五六七八九十两\d]{1,3})/i);
  if (explicit !== undefined) return clampNumber(explicit, 1, 4, 2);
  if (/三开门|三格门/.test(prompt)) return 3;
  if (/双开门|大门|拱门|门厅|门廊|城堡|宫殿/.test(prompt) || scale === 'large' || ['castle', 'manor'].includes(typology)) return 2;
  if (architecture.facade_rules?.porch || architecture.facade_rules?.arches) return 2;
  return 1;
}

function deriveDoorHeight(prompt, architecture, floorHeight, scale, typology) {
  const explicit = extractNumber(prompt, /(?:门高|入口高度|大门高度)\s*([一二三四五六七八九十两\d]{1,3})/i);
  if (explicit !== undefined) return clampNumber(explicit, 2, Math.max(2, floorHeight - 1), 3);
  if (/高门|拱门|尖拱|门厅|城堡|宫殿/.test(prompt) || architecture.facade_rules?.arches || typology === 'castle') {
    return clampNumber(4, 2, Math.max(2, floorHeight - 1), 3);
  }
  if (scale === 'large') return clampNumber(3, 2, Math.max(2, floorHeight - 1), 3);
  return 2;
}

function inferTypology(prompt, style) {
  if (/树屋|树上|treehouse|tree house/i.test(prompt) || style === '树屋') return 'treehouse';
  if (/地下|地堡|半地下|掩体|洞穴住宅|地下基地|bunker|underground/i.test(prompt) || style === '地下') return 'earth-shelter';
  if (/温室住宅|玻璃温室|花房住宅|greenhouse house/i.test(prompt) || style === '温室住宅') return 'greenhouse-house';
  if (/悬崖|峭壁|山崖|cliffside|悬挑住宅/i.test(prompt) || style === '悬崖') return 'cliffside-house';
  if (/别墅|villa/i.test(prompt)) return 'villa';
  if (/庄园|manor/i.test(prompt)) return 'manor';
  if (/城堡|堡垒|castle/i.test(prompt)) return 'castle';
  if (/小屋|木屋|cabin|lodge/i.test(prompt) || style === '木屋') return style === '雪山' ? 'lodge' : 'cabin';
  if (/庭院|合院|四合院|courtyard/i.test(prompt)) return 'courtyard-house';
  if (/农舍|farm/i.test(prompt)) return 'farmhouse';
  if (style === '海滨') return 'beach-house';
  if (style === '雪山') return 'lodge';
  return 'house';
}

function normalizeFootprint(value) {
  const text = String(value || 'rectangle').toLowerCase();
  if (['rectangle', 'l-shape', 'winged', 'courtyard', 'compact-tower'].includes(text)) return text;
  return 'rectangle';
}

function parseFloorCount(prompt) {
  const match = prompt.match(/([一二三四五六七八九十两\d]{1,3})\s*(?:层|楼)/);
  const value = parseNumberToken(match?.[1]);
  if (value === undefined) return undefined;
  return clampNumber(value, 1, 5, 2);
}

function extractNumber(prompt, pattern) {
  const match = prompt.match(pattern);
  return parseNumberToken(match?.[1]);
}

function hasNumberAfter(prompt, pattern) {
  return extractNumber(prompt, pattern) !== undefined;
}

function parseNumberToken(value) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return Math.round(numeric);
  return parseChineseNumberToken(text);
}

function parseChineseNumberToken(text) {
  const digits = new Map([
    ['零', 0], ['一', 1], ['二', 2], ['两', 2], ['三', 3],
    ['四', 4], ['五', 5], ['六', 6], ['七', 7], ['八', 8], ['九', 9]
  ]);
  if (digits.has(text)) return digits.get(text);
  if (!text.includes('十')) return undefined;
  const [tensRaw, onesRaw] = text.split('十');
  const tens = tensRaw ? digits.get(tensRaw) : 1;
  const ones = onesRaw ? digits.get(onesRaw) : 0;
  if (!Number.isFinite(tens) || !Number.isFinite(ones)) return undefined;
  return tens * 10 + ones;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value) return [String(value)];
  return [];
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeSide(value) {
  const text = value.toLowerCase();
  if (['north', 'south', 'east', 'west'].includes(text)) return text;
  if (text.includes('北')) return 'north';
  if (text.includes('东')) return 'east';
  if (text.includes('西')) return 'west';
  return 'south';
}
