const VARIATION_RUBRIC = [
  { id: 'creative-signature', label: '设计签名差异', maxPoints: 12 },
  { id: 'massing', label: '体块与轮廓差异', maxPoints: 20 },
  { id: 'plan-topology', label: '平面拓扑差异', maxPoints: 18 },
  { id: 'facade', label: '立面节奏差异', maxPoints: 16 },
  { id: 'roof', label: '屋顶表达差异', maxPoints: 10 },
  { id: 'site', label: '场地组织差异', maxPoints: 8 },
  { id: 'interior', label: '室内语法差异', maxPoints: 10 },
  { id: 'module-mix', label: '模块分布差异', maxPoints: 4 },
  { id: 'geometry-footprint', label: '落地方位差异', maxPoints: 2 }
];

export class DesignVariationEvaluationAgent {
  run(samples = [], options = {}) {
    const blueprints = samples.map(toBlueprint).filter(Boolean);
    const target = Number(options.target ?? 70);
    const features = blueprints.map(extractFeatures);
    const pairs = pairwise(features).map(([a, b]) => scoreFeaturePair(a, b));
    const dimensionAverages = averageDimensions(pairs);
    const scorecard = VARIATION_RUBRIC.map((item) => {
      const variation = dimensionAverages[item.id] ?? 0;
      return {
        ...item,
        variationPercent: Math.round(variation * 100),
        score: round2(item.maxPoints * variation)
      };
    });
    const score = round2(scorecard.reduce((sum, item) => sum + item.score, 0));
    const authorityShare = round2(average(features.map((item) => item.authorityShare)) * 100);
    const fixedAlgorithmShareEstimate = round2(Math.max(0, 100 - authorityShare));

    return {
      source: 'local-design-variation-evaluation-agent',
      prompt: options.prompt || commonPrompt(blueprints),
      sampleCount: blueprints.length,
      target,
      score,
      percent: score,
      pass: blueprints.length >= 2 && score >= target && authorityShare >= target,
      authorityShare,
      fixedAlgorithmShareEstimate,
      scorecard,
      pairCount: pairs.length,
      pairwise: pairs.map((pair) => ({
        a: pair.a,
        b: pair.b,
        score: Math.round(pair.score * 100),
        dimensions: Object.fromEntries(Object.entries(pair.dimensions).map(([key, value]) => [key, Math.round(value * 100)]))
      })),
      rubric: VARIATION_RUBRIC,
      recommendations: recommendations({ score, target, authorityShare, fixedAlgorithmShareEstimate, scorecard })
    };
  }
}

export function designVariationRubric() {
  return VARIATION_RUBRIC.map((item) => ({ ...item }));
}

function extractFeatures(blueprint = {}) {
  const creative = blueprint.creativeDesign || blueprint.architecture?.design_directives || {};
  const volumes = blueprint.architecture?.volumes || [];
  const volumeBoxes = blueprint.shell?.volumeBoxes || [];
  const nodes = blueprint.topology?.nodes || [];
  const rooms = blueprint.layout?.rooms || [];
  const placements = blueprint.decorator?.placements || [];
  return {
    id: String(blueprint.seed ?? blueprint.creativeDesign?.signature ?? Math.random()),
    prompt: blueprint.prompt,
    authorityShare: Number(creative.authority?.estimated_llm_decision_share || 0),
    creativeSignature: creative.signature || blueprint.buildSpec?.creative_design_signature || '',
    massingVariant: creative.design_axes?.massing_variant || '',
    volumeIds: volumes.map((item) => item.id),
    volumeRelations: volumes.map((item) => item.placement?.relation || ''),
    volumeScales: volumes.flatMap((item) => Array.isArray(item.scale) ? item.scale.map(Number) : []),
    volumeBoxSides: volumeBoxes.map((item) => item.side || item.volume?.side || item.module || ''),
    splitStrategy: blueprint.topology?.bsp_hints?.split_strategy || creative.topology?.split_strategy || '',
    publicCore: blueprint.topology?.circulation_rules?.public_core || creative.topology?.public_core || '',
    nodeOrder: nodes.map((item) => `${item.floor}:${item.id}`),
    nodeTypes: nodes.map((item) => `${item.floor}:${item.type}`),
    extraNodeIds: nodes.filter((item) => (item.tags || []).includes('creative-extra-node')).map((item) => item.id),
    nodeWeights: Object.fromEntries(nodes.map((item) => [item.id, Number(item.weight || 1)])),
    roomShapes: rooms.map((room) => `${room.type}:${span(room.min_x, room.max_x)}x${span(room.min_z, room.max_z)}:${room.source || 'main'}`),
    facadeRhythm: blueprint.facade?.window_system?.rhythm || creative.facade?.window_rhythm || '',
    facadeGlazing: blueprint.facade?.window_system?.glazing_ratio || creative.facade?.glazing_ratio || '',
    facadeEntry: blueprint.facade?.entry_detail_style || creative.facade?.entry_detail_style || '',
    facadeRelief: blueprint.facade?.relief_density || creative.facade?.relief_density || '',
    facadeSurround: blueprint.facade?.window_surround_pattern || creative.facade?.window_surround_pattern || '',
    facadeWindow: [
      blueprint.facade?.window_system?.width,
      blueprint.facade?.window_system?.height,
      blueprint.facade?.window_system?.spacing
    ].map(Number),
    facadeElements: blueprint.facade?.facade_elements || [],
    roofStyle: blueprint.roof?.style || creative.roof?.style || '',
    roofProfile: blueprint.roof?.profile || creative.roof?.profile || '',
    roofElements: (blueprint.roof?.elements || []).map((item) => item.kind || item.id),
    siteMood: blueprint.site?.mood || creative.site?.mood || '',
    siteZones: blueprint.site?.zones || [],
    interiorColor: creative.interior?.color_story || blueprint.interior?.comfort_strategy?.color_story || '',
    interiorDensity: creative.interior?.decor_density || blueprint.interior?.comfort_strategy?.density_target || '',
    interiorBlocks: placements.map((item) => blockBase(item.block)).filter(Boolean),
    modules: blueprint.modules || {},
    bounds: blueprint.bounds || blueprint.shell?.bounds || {},
    operationCount: Number(blueprint.operations?.length || 0)
  };
}

function scoreFeaturePair(a, b) {
  const dimensions = {
    'creative-signature': exactDistance(a.creativeSignature, b.creativeSignature),
    massing: weightedAverage([
      [exactDistance(a.massingVariant, b.massingVariant), 0.34],
      [jaccardDistance(a.volumeIds, b.volumeIds), 0.24],
      [jaccardDistance(a.volumeRelations, b.volumeRelations), 0.22],
      [numericVectorDistance(a.volumeScales, b.volumeScales), 0.12],
      [jaccardDistance(a.volumeBoxSides, b.volumeBoxSides), 0.08]
    ]),
    'plan-topology': weightedAverage([
      [exactDistance(a.splitStrategy, b.splitStrategy), 0.34],
      [exactDistance(a.publicCore, b.publicCore), 0.12],
      [sequenceDistance(a.nodeOrder, b.nodeOrder), 0.22],
      [jaccardDistance(a.extraNodeIds, b.extraNodeIds), 0.18],
      [numericMapDistance(a.nodeWeights, b.nodeWeights), 0.1],
      [jaccardDistance(a.nodeTypes, b.nodeTypes), 0.02],
      [jaccardDistance(a.roomShapes, b.roomShapes), 0.02]
    ]),
    facade: weightedAverage([
      [exactDistance(a.facadeRhythm, b.facadeRhythm), 0.34],
      [exactDistance(a.facadeEntry, b.facadeEntry), 0.22],
      [exactDistance(a.facadeSurround, b.facadeSurround), 0.16],
      [exactDistance(a.facadeRelief, b.facadeRelief), 0.08],
      [exactDistance(a.facadeGlazing, b.facadeGlazing), 0.08],
      [numericVectorDistance(a.facadeWindow, b.facadeWindow), 0.08],
      [jaccardDistance(a.facadeElements, b.facadeElements), 0.04]
    ]),
    roof: average([
      exactDistance(a.roofStyle, b.roofStyle),
      exactDistance(a.roofProfile, b.roofProfile),
      jaccardDistance(a.roofElements, b.roofElements)
    ]),
    site: average([
      exactDistance(a.siteMood, b.siteMood),
      jaccardDistance(a.siteZones, b.siteZones)
    ]),
    interior: average([
      exactDistance(a.interiorColor, b.interiorColor),
      exactDistance(a.interiorDensity, b.interiorDensity),
      jaccardDistance(a.interiorBlocks, b.interiorBlocks)
    ]),
    'module-mix': moduleDistance(a.modules, b.modules),
    'geometry-footprint': average([
      boundsDistance(a.bounds, b.bounds),
      normalizedDifference(a.operationCount, b.operationCount, Math.max(a.operationCount, b.operationCount, 1))
    ])
  };
  const weighted = VARIATION_RUBRIC.reduce((sum, item) => sum + (dimensions[item.id] || 0) * item.maxPoints, 0) / 100;
  return { a: a.id, b: b.id, score: weighted, dimensions };
}

function averageDimensions(pairs) {
  const result = {};
  if (!pairs.length) {
    for (const item of VARIATION_RUBRIC) result[item.id] = 0;
    return result;
  }
  for (const item of VARIATION_RUBRIC) {
    result[item.id] = average(pairs.map((pair) => pair.dimensions[item.id] || 0));
  }
  return result;
}

function recommendations({ score, target, authorityShare, fixedAlgorithmShareEstimate, scorecard }) {
  const notes = [];
  if (authorityShare < target) notes.push(`设计选择权 ${authorityShare}% 未达到 ${target}%，需要让更多下游 agent 读取 CreativeDesignAgent 输出。`);
  if (score < target) notes.push(`同 prompt 变化分 ${score} 未达到 ${target}，应增加体块、平面、立面和室内的设计可选项。`);
  const weak = scorecard.filter((item) => item.variationPercent < 50).map((item) => item.label);
  if (weak.length) notes.push(`低变化维度: ${weak.join('、')}。`);
  if (fixedAlgorithmShareEstimate > 30) notes.push(`固定算法估算占比 ${fixedAlgorithmShareEstimate}%，应继续下放设计决策。`);
  return notes.length ? notes : ['同 prompt 变化程度与设计选择权达到当前目标。'];
}

function pairwise(items) {
  const pairs = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) pairs.push([items[i], items[j]]);
  }
  return pairs;
}

function toBlueprint(sample) {
  if (!sample) return undefined;
  return sample.blueprint || sample;
}

function commonPrompt(blueprints) {
  const prompts = [...new Set(blueprints.map((item) => item.prompt).filter(Boolean))];
  return prompts.length === 1 ? prompts[0] : prompts.join(' | ');
}

function exactDistance(a, b) {
  if (!a && !b) return 0;
  return String(a) === String(b) ? 0 : 1;
}

function jaccardDistance(a = [], b = []) {
  const left = new Set((a || []).map(String));
  const right = new Set((b || []).map(String));
  const union = new Set([...left, ...right]);
  if (!union.size) return 0;
  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) intersection += 1;
  }
  return 1 - intersection / union.size;
}

function sequenceDistance(a = [], b = []) {
  const union = [...new Set([...a, ...b].map(String))];
  if (!union.length) return 0;
  const maxLength = Math.max(a.length, b.length, 1);
  let total = 0;
  for (const item of union) {
    const ai = a.indexOf(item);
    const bi = b.indexOf(item);
    const left = ai >= 0 ? ai : maxLength;
    const right = bi >= 0 ? bi : maxLength;
    total += Math.min(1, Math.abs(left - right) / maxLength);
  }
  return total / union.length;
}

function numericVectorDistance(a = [], b = []) {
  const length = Math.max(a.length, b.length);
  if (!length) return 0;
  let total = 0;
  for (let index = 0; index < length; index += 1) {
    total += normalizedDifference(Number(a[index] || 0), Number(b[index] || 0), Math.max(Math.abs(Number(a[index] || 0)), Math.abs(Number(b[index] || 0)), 1));
  }
  return total / length;
}

function numericMapDistance(a = {}, b = {}) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  if (!keys.length) return 0;
  return average(keys.map((key) => normalizedDifference(Number(a[key] || 0), Number(b[key] || 0), Math.max(Number(a[key] || 0), Number(b[key] || 0), 1))));
}

function moduleDistance(a = {}, b = {}) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  if (!keys.length) return 0;
  const totalA = keys.reduce((sum, key) => sum + Number(a[key] || 0), 0) || 1;
  const totalB = keys.reduce((sum, key) => sum + Number(b[key] || 0), 0) || 1;
  const delta = keys.reduce((sum, key) => {
    return sum + Math.abs(Number(a[key] || 0) / totalA - Number(b[key] || 0) / totalB);
  }, 0);
  return Math.min(1, delta / 1.4);
}

function boundsDistance(a = {}, b = {}) {
  const widthA = span(a.minX, a.maxX);
  const widthB = span(b.minX, b.maxX);
  const depthA = span(a.minZ, a.maxZ);
  const depthB = span(b.minZ, b.maxZ);
  const heightA = span(a.minY, a.maxY);
  const heightB = span(b.minY, b.maxY);
  return average([
    normalizedDifference(widthA, widthB, Math.max(widthA, widthB, 1)),
    normalizedDifference(depthA, depthB, Math.max(depthA, depthB, 1)),
    normalizedDifference(heightA, heightB, Math.max(heightA, heightB, 1))
  ]);
}

function normalizedDifference(a, b, denominator = 1) {
  return Math.min(1, Math.abs(Number(a || 0) - Number(b || 0)) / Math.max(1, denominator));
}

function average(values) {
  const filtered = values.filter((value) => Number.isFinite(Number(value)));
  if (!filtered.length) return 0;
  return filtered.reduce((sum, value) => sum + Number(value), 0) / filtered.length;
}

function weightedAverage(items) {
  const valid = items.filter(([value, weight]) => Number.isFinite(Number(value)) && Number.isFinite(Number(weight)) && Number(weight) > 0);
  const totalWeight = valid.reduce((sum, [, weight]) => sum + Number(weight), 0);
  if (!totalWeight) return 0;
  return valid.reduce((sum, [value, weight]) => sum + Number(value) * Number(weight), 0) / totalWeight;
}

function span(min, max) {
  const a = Number(min);
  const b = Number(max);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.abs(b - a) + 1;
}

function blockBase(block) {
  return String(block || '').replace(/\[.*$/, '');
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
