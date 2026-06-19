import fs from 'node:fs';
import path from 'node:path';
import { isKnownMinecraft121Block, normalizeBlockId } from './minecraftBlockCatalog.js';
import { buildStylePatternStrategy, selectStyleAwareRoomPatternGuidance } from './templatePatternStylePolicy.js';
import { selectTemplateDesignLaws } from '../templates/templateDesignLawDistiller.js';

const DEFAULT_ANALYSIS_FILE = path.join('mc_templates', 'analysis', 'template_index.json');

export class TemplateKnowledgeAgent {
  constructor({ cwd = process.cwd(), analysisFile = DEFAULT_ANALYSIS_FILE } = {}) {
    this.cwd = cwd;
    this.analysisFile = path.resolve(cwd, analysisFile);
  }

  run(prompt = '', architecture = {}, buildSpec = {}) {
    const corpus = this.loadCorpus();
    if (!corpus?.templates?.length) return inactiveKnowledge('template corpus not found or empty');

    const scored = corpus.templates
      .map((template) => ({ template, score: scoreTemplate(template, prompt, architecture, buildSpec) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.template.quality - a.template.quality)
      .slice(0, 6);

    if (!scored.length) return inactiveKnowledge('no matching templates');
    const caseCards = caseCardsByFile(corpus.case_library);
    const retrieved = scored.map(({ template, score }) => compactTemplate(template, score, caseCards.get(template.file)));
    const recommendations = summarizeRecommendations(retrieved, corpus.corpus, {
      requestedStyleFamily: architecture.style_family || architecture.style || buildSpec.style_family,
      requestedTypology: architecture.typology || buildSpec.typology,
      prompt
    });
    const designLawPack = selectTemplateDesignLaws(corpus.design_law_book, prompt, {
      styleFamily: recommendations.style_family,
      typology: recommendations.typology,
      featurePriorities: recommendations.case_feature_priorities || [],
      retrievedCaseIds: retrieved.map((item) => item.case_card?.case_id || item.case_profile?.case_id).filter(Boolean)
    });
    return {
      source: 'local-template-knowledge-agent',
      active: true,
      analysis_file: path.relative(this.cwd, this.analysisFile).replaceAll('\\', '/'),
      corpus_size: corpus.templates.length,
      retrieved,
      recommendations: {
        ...recommendations,
        design_law_pack: designLawPack,
        design_laws: designLawPack.selected_laws || [],
        interior_design_laws: designLawPack.interior_laws || [],
        design_law_clauses: designLawPack.implementation_clauses || []
      },
      gap_priorities: corpus.corpus?.gap_priorities || []
    };
  }

  loadCorpus() {
    if (!fs.existsSync(this.analysisFile)) return undefined;
    try {
      const corpus = JSON.parse(fs.readFileSync(this.analysisFile, 'utf8'));
      const caseLibraryFile = path.join(path.dirname(this.analysisFile), 'case_library.json');
      if (fs.existsSync(caseLibraryFile)) {
        corpus.case_library = JSON.parse(fs.readFileSync(caseLibraryFile, 'utf8'));
      }
      const designLawFile = path.join(path.dirname(this.analysisFile), 'design_laws.json');
      if (fs.existsSync(designLawFile)) {
        corpus.design_law_book = JSON.parse(fs.readFileSync(designLawFile, 'utf8'));
      }
      return corpus;
    } catch {
      return undefined;
    }
  }
}

function inactiveKnowledge(reason) {
  return {
    source: 'local-template-knowledge-agent',
    active: false,
    reason,
    retrieved: [],
    recommendations: {
      terrain_profile: 'unknown',
      landscape_features: [],
      detail_density: 'unknown',
      template_interior_pattern_strength: 'none',
      room_pattern_guidance: [],
      room_pattern_strategy: {},
      composition_strategy: {},
      case_library_clauses: [],
      case_feature_priorities: [],
      material_guidance: emptyMaterialGuidance(),
      material_locks: [],
      design_law_pack: {},
      design_laws: [],
      interior_design_laws: [],
      design_law_clauses: [],
      design_priorities: []
    },
    gap_priorities: []
  };
}

function scoreTemplate(template, prompt, architecture, buildSpec) {
  const text = `${prompt} ${architecture.style || ''} ${architecture.style_family || ''} ${architecture.typology || ''} ${buildSpec.typology || ''}`.toLowerCase();
  const titleText = String(template.title || '').toLowerCase();
  const fileTitleText = String(path.basename(template.file || '', path.extname(template.file || '')) || '').toLowerCase();
  const fields = [
    template.title,
    template.category,
    template.style_family,
    template.typology,
    ...(template.tags || []),
    ...(template.case_profile?.quality_tags || []),
    ...(template.case_profile?.learning_roles || []).map((role) => role.role),
    ...(template.case_profile?.room_reference_candidates || []).map((room) => room.room_type),
    ...(template.recommendations?.source_keywords || [])
  ].join(' ').toLowerCase();
  let score = 0;
  if (titleText && text.includes(titleText)) score += 16;
  if (fileTitleText && fileTitleText !== titleText && text.includes(fileTitleText)) score += 12;
  if (template.style_family && text.includes(String(template.style_family).toLowerCase())) score += 10;
  if (template.typology && text.includes(String(template.typology).toLowerCase())) score += 8;
  if (String(template.category || '').toLowerCase().includes('house') && /house|home|住宅|房|别墅|庄园/.test(text)) score += 4;
  if (String(template.category || '').toLowerCase().includes('castle') && /castle|城堡|堡垒|哥特|中世纪/.test(text)) score += 6;
  if (String(template.category || '').toLowerCase().includes('temple') && /temple|庙|神庙|日式|pagoda|塔/.test(text)) score += 6;
  if (String(template.category || '').toLowerCase().includes('tower') && /tower|塔|高楼|钟楼|灯塔/.test(text)) score += 6;
  for (const token of keywordTokens(text)) {
    if (fields.includes(token)) score += 1.5;
  }
  if (template.analysis?.terrain?.integrated && /地形|山|洞|湖|海|水|悬崖|花园|庭院|terrain|garden|cave|lake|coast|cliff/i.test(text)) score += 3;
  if (hasCaseRole(template, 'terrain_base') && /地形|山|坡|悬崖|terrain|cliff|slope|hill/i.test(text)) score += 4;
  if (hasCaseRole(template, 'garden_scene') && /花园|庭院|园|garden|yard|landscape|foreground/i.test(text)) score += 4;
  if (hasCaseRole(template, 'water_edge') && /湖|水|海|河|平台|lake|water|coast|deck|platform/i.test(text)) score += 4;
  if (hasCaseRole(template, 'interior_reference') && /内饰|室内|家具|卧室|客厅|厨房|书房|interior|furnish|bedroom|living|kitchen|study/i.test(text)) score += 5;
  if (hasCaseRole(template, 'room_layout_reference') && /内饰|室内|房间|户型|布局|楼层|interior|room|layout|floor/i.test(text)) score += 4;
  if (hasCaseRole(template, 'facade_detail') && /细节|立面|大玻璃|窗|facade|detail|glass|window/i.test(text)) score += 3;
  if (template.case_profile?.study_priority === 'high') score += 2;
  if (template.case_profile?.phase2_room_mining_priority === 'high' && /内饰|室内|家具|interior|furnish/i.test(text)) score += 2;
  if (['high', 'medium'].includes(String(template.case_profile?.phase2_spatial_evidence?.pattern_mining_readiness || '')) && /内饰|室内|房间|家具|interior|room|furnish/i.test(text)) score += 2;
  if ((template.case_profile?.review_flags || []).includes('arena-not-for-room-mining') && /房|住宅|别墅|house|home|villa|mansion/i.test(text)) score -= 5;
  if ((template.case_profile?.review_flags || []).includes('interior-described-as-unfinished') && /内饰|室内|家具|interior|furnish/i.test(text)) score -= 6;
  if (template.recommendations?.detail_density === 'high') score += 1;
  return score;
}

function compactTemplate(template, score, caseCard) {
  return {
    file: template.file,
    title: template.title,
    quality: template.quality,
    score,
    style_family: template.style_family,
    typology: template.typology,
    tags: template.tags || [],
    dimensions: template.analysis?.dimensions,
    terrain: template.analysis?.terrain,
    detail_metrics: template.analysis?.detail_metrics,
    case_profile: compactCaseProfile(template.case_profile),
    composition_grammar: template.analysis?.composition_grammar,
    case_card: compactCaseCard(caseCard),
    top_blocks: (template.analysis?.top_blocks || []).slice(0, 8),
    recommendations: template.recommendations || {}
  };
}

function detectReferenceReproductionMode(prompt = '', context = {}) {
  const text = String(prompt || '').toLowerCase();
  const explicitStrong = /强参考|强复现|复现|复刻|顶级|模板库|差不多|接近模板|像.*模板|top[- ]?tier|replica|recreate|reference reproduction/i.test(text);
  const explicitReference = explicitStrong || /参考案例|参考|模板|inspired|reference|mcbuild/i.test(text);
  const houseLike = /房|住宅|别墅|庄园|house|home|villa|manor|mansion|estate/.test(text) ||
    /house|villa|manor|mansion|estate/.test(String(context.typology || '').toLowerCase());
  const promptCompositionSignal = /湖|海|河|水边|临水|滨水|海边|湖边|花园|庭院|前景|非平坦|地形|坡|山|悬崖|岩|屋顶露台|水边平台|water|lake|coast|waterfront|garden|courtyard|terrain|slope|roof terrace/i.test(text);
  const detailRichReferenceSignal = /精致|细节|复杂|高级|立面|装饰|层次|轮廓|场地|构图|detailed|ornate|facade|composition|silhouette/i.test(text);
  const templateCompositionRich = Number(context.terrainWeight || 0) > 0.2 ||
    Number(context.gardenWeight || 0) > 0.2 ||
    Number(context.waterWeight || 0) > 0.15;
  const compositionRich = (promptCompositionSignal && templateCompositionRich) ||
    (Number(context.detailAverage || 0) > 1.4 && detailRichReferenceSignal);
  const highQualityMatch = (context.retrieved || []).some((item) => Number(item.quality || item.case_profile?.overall_reference_score || 0) >= 5 || Number(item.score || 0) >= 18);
  const strength = explicitStrong
    ? 'high'
    : explicitReference || (houseLike && compositionRich && highQualityMatch)
      ? 'medium'
      : 'low';
  return {
    active: strength !== 'low',
    strength,
    explicit_strong: explicitStrong,
    explicit_reference: explicitReference,
    reason: explicitStrong ? 'explicit-strong-reference-language' : strength === 'medium' ? 'high-quality-template-match' : 'weak-reference-signal'
  };
}

function buildReferenceReproductionStrategy(retrieved = [], prompt = '', context = {}) {
  const mode = context.referenceMode || detectReferenceReproductionMode(prompt, context);
  if (!retrieved.length) {
    return {
      source: 'template-reference-reproduction-v1',
      active: false,
      strength: 'none',
      reason: 'no-retrieved-template'
    };
  }
  const topSources = retrieved.slice(0, mode.strength === 'high' ? 4 : 3);
  const targetDimensions = referenceTargetDimensions(topSources, context);
  const detailTargets = referenceDetailTargets(topSources, context);
  const active = Boolean(mode.active);
  return {
    source: 'template-reference-reproduction-v1',
    active,
    strength: mode.strength,
    reason: mode.reason,
    intent: mode.strength === 'high'
      ? 'strongly echo the reference cases in massing, silhouette, material atmosphere, site composition, and detail density without block-for-block copying'
      : 'raise generated houses toward the retrieved template level while preserving variation',
    top_reference_cases: topSources.map((item) => ({
      title: item.title,
      file: item.file,
      style_family: item.style_family,
      typology: item.typology,
      score: round(item.score),
      dimensions: item.dimensions,
      detail_metrics: item.detail_metrics
    })),
    target_dimensions: targetDimensions,
    detail_targets: detailTargets,
    style_targets: {
      style_family: context.styleFamily,
      typology: context.typology,
      preserve_reference_silhouette_family: mode.strength === 'high',
      preserve_reference_material_atmosphere: ['high', 'medium'].includes(mode.strength),
      require_visible_foreground_scene: true,
      require_template_level_facade_depth: true
    },
    obligations: [
      'use the reference dimensions as proportional targets, scaled into Minecraft-safe residential bounds',
      'preserve the recognizable silhouette family and field-of-view impression',
      'carry over template-level material atmosphere and exterior detail density',
      'build a composed foreground/site scene before the facade',
      'change exact dimensions, room order, and detail placement so the result is not a block-for-block copy'
    ]
  };
}

function referenceTargetDimensions(sources = [], context = {}) {
  const typology = String(context.typology || '').toLowerCase();
  const styleFamily = String(context.styleFamily || '').toLowerCase();
  const estateLike = /villa|manor|mansion|estate|castle|public-building|temple|庄园|别墅/.test(`${typology} ${styleFamily}`);
  const compact = /cabin|small|compact|treehouse|lodge/.test(`${typology} ${styleFamily}`);
  const maxWidth = /castle|temple|public-building/.test(typology) ? 43 : estateLike ? 39 : compact ? 23 : 31;
  const maxDepth = /castle|temple|public-building/.test(typology) ? 39 : estateLike ? 33 : compact ? 21 : 29;
  const minWidth = estateLike ? 27 : compact ? 15 : 19;
  const minDepth = estateLike ? 21 : compact ? 13 : 17;
  const samples = sources
    .map((item) => normalizeReferenceDimensionSample(item.dimensions, { maxWidth, maxDepth, minWidth, minDepth, title: item.title }))
    .filter(Boolean);
  if (!samples.length) {
    return {
      source: 'fallback-from-typology',
      width: minWidth,
      depth: minDepth,
      floors: estateLike ? 2 : 1,
      garden_depth: estateLike ? 12 : 10,
      normalized_from: []
    };
  }
  const width = weightedAverage(samples, 'width');
  const depth = weightedAverage(samples, 'depth');
  const height = weightedAverage(samples, 'height');
  const floors = /castle|temple|public-building/.test(typology)
    ? 3
    : estateLike || height >= 16
      ? 2
      : 1;
  return {
    source: 'weighted-template-dimensions',
    width: clampNumber(Math.round(width), minWidth, maxWidth, minWidth),
    depth: clampNumber(Math.round(depth), minDepth, maxDepth, minDepth),
    floors,
    garden_depth: clampNumber(Math.round(Math.max(10, depth * 0.45)), 9, estateLike ? 16 : 13, 10),
    normalized_from: samples.map((item) => item.title)
  };
}

function normalizeReferenceDimensionSample(dimensions = {}, limits = {}) {
  const width = Number(dimensions.width);
  const depth = Number(dimensions.length || dimensions.depth);
  const height = Number(dimensions.height);
  if (!Number.isFinite(width) || !Number.isFinite(depth)) return undefined;
  const scale = Math.min(1, Number(limits.maxWidth || width) / width, Number(limits.maxDepth || depth) / depth);
  return {
    title: limits.title,
    width: clampNumber(Math.round(width * scale), limits.minWidth, limits.maxWidth, limits.minWidth),
    depth: clampNumber(Math.round(depth * scale), limits.minDepth, limits.maxDepth, limits.minDepth),
    height: Number.isFinite(height) ? height * scale : 10,
    weight: 1
  };
}

function referenceDetailTargets(sources = [], context = {}) {
  const metrics = sources.map((item) => item.detail_metrics || {}).filter((item) => Object.keys(item).length);
  const avg = (key) => metrics.length ? metrics.reduce((sum, item) => sum + Number(item[key] || 0), 0) / metrics.length : 0;
  const stairSlab = avg('stair_slab_ratio');
  const fence = avg('fence_ratio');
  const light = avg('light_ratio');
  const decor = avg('decor_ratio');
  const natural = avg('natural_ratio');
  const glass = avg('glass_ratio');
  const densityScore = stairSlab * 2.4 + fence * 4 + light * 8 + decor * 3 + glass * 1.6;
  return {
    source: 'weighted-template-detail-metrics',
    detail_density: densityScore > 0.36 || Number(context.detailAverage || 0) > 2.35 ? 'high' : densityScore > 0.18 ? 'medium' : 'standard',
    facade_depth: stairSlab > 0.08 || decor > 0.025 ? 'template-level' : 'normal',
    rail_and_edge_frequency: fence > 0.02 ? 'high' : 'normal',
    lighting_frequency: light > 0.01 ? 'layered' : 'standard',
    natural_site_density: natural > 0.18 ? 'high' : natural > 0.05 ? 'medium' : 'low',
    glass_ratio_hint: glass > 0.06 ? 'large-glass' : glass > 0.02 ? 'medium-glass' : 'style-default',
    raw_average: {
      glass_ratio: round(glass),
      stair_slab_ratio: round(stairSlab),
      fence_ratio: round(fence),
      light_ratio: round(light),
      decor_ratio: round(decor),
      natural_ratio: round(natural)
    }
  };
}

function weightedAverage(samples = [], key) {
  const total = samples.reduce((sum, item) => sum + Number(item.weight || 1), 0) || 1;
  return samples.reduce((sum, item) => sum + Number(item[key] || 0) * Number(item.weight || 1), 0) / total;
}

function summarizeRecommendations(retrieved, corpus = {}, options = {}) {
  const weighted = (selector) => retrieved.reduce((sum, item) => sum + (selector(item) ? item.score : 0), 0);
  const totalScore = retrieved.reduce((sum, item) => sum + item.score, 0) || 1;
  const landscapeFeatures = new Set();
  const designPriorities = new Set();
  const learningRoles = new Set();
  const roomReferences = new Set();
  const roomPatternClauses = new Set();
  const furniturePatterns = new Map();
  const roomPatternGuidanceCandidates = [];
  const compositionCandidates = [];
  const caseLibraryClauses = [];
  const caseFeaturePriorities = new Set();
  const styles = new Map();
  const typologies = new Map();
  let detailScore = 0;
  let furniturePatternScore = 0;

  for (const item of retrieved) {
    styles.set(item.style_family, (styles.get(item.style_family) || 0) + item.score);
    typologies.set(item.typology, (typologies.get(item.typology) || 0) + item.score);
    for (const feature of item.recommendations?.landscape_features || []) landscapeFeatures.add(feature);
    for (const priority of item.recommendations?.design_priorities || []) designPriorities.add(priority);
    for (const role of item.case_profile?.learning_roles || []) learningRoles.add(role.role);
    for (const room of item.case_profile?.room_reference_candidates || []) roomReferences.add(room.room_type);
    for (const pattern of item.case_profile?.phase3_pattern_evidence?.top_patterns || []) {
      furniturePatterns.set(pattern.pattern_type, (furniturePatterns.get(pattern.pattern_type) || 0) + item.score * (Number(pattern.confidence || 0) / 100));
      for (const clause of pattern.clauses || []) roomPatternClauses.add(clause);
      roomPatternGuidanceCandidates.push({
        source_title: item.title,
        source_style_family: item.style_family,
        source_typology: item.typology,
        source_score: item.score,
        room_type: pattern.room_type,
        pattern_type: pattern.pattern_type,
        confidence: pattern.confidence,
        anchor: pattern.anchor,
        clauses: (pattern.clauses || []).slice(0, 6),
        layout_intent: pattern.layout_intent
      });
    }
    if (item.case_card) {
      for (const clause of item.case_card.semantic_clauses || []) caseLibraryClauses.push({
        source_title: item.title,
        case_id: item.case_card.case_id,
        clause
      });
      for (const affinity of item.case_card.prompt_affinities || []) caseFeaturePriorities.add(affinity);
      for (const area of item.case_card.learnable_areas || []) caseFeaturePriorities.add(area);
    }
    collectCompositionCandidates(compositionCandidates, item);
    furniturePatternScore += patternReadinessWeight(item.case_profile?.phase3_pattern_evidence?.furniture_pattern_readiness) * item.score;
    detailScore += detailWeight(item.recommendations?.detail_density) * item.score;
  }

  const terrainWeight = weighted((item) => item.terrain?.integrated || item.terrain?.non_flat || item.tags?.includes('terrain-integrated')) / totalScore;
  const gardenWeight = weighted((item) => item.tags?.includes('landscape-composition') || item.detail_metrics?.garden_signal !== 'none') / totalScore;
  const waterWeight = weighted((item) => item.tags?.includes('water-edge')) / totalScore;
  if (terrainWeight > 0.25) landscapeFeatures.add('layered-terrain');
  if (gardenWeight > 0.25) landscapeFeatures.add('garden-composition');
  if (waterWeight > 0.2) landscapeFeatures.add('water-edge');
  const referenceStyleFamily = topWeighted(styles);
  const referenceTypology = topWeighted(typologies);
  const styleFamily = options.requestedStyleFamily || referenceStyleFamily;
  const typology = options.requestedTypology || referenceTypology;
  const roomPatternGuidance = selectStyleAwareRoomPatternGuidance(roomPatternGuidanceCandidates, {
    styleFamily,
    typology,
    limit: 16
  });
  const roomPatternStrategy = buildStylePatternStrategy({
    styleFamily,
    typology,
    candidates: roomPatternGuidanceCandidates
  });
  const detailAverage = detailScore / totalScore;
  const materialGuidance = buildMaterialGuidance(retrieved);
  const materialLocks = detectExplicitMaterialLocks(options.prompt);
  const materialTransferStrength = materialTransferStrengthForPrompt(options.prompt, detailAverage);
  const referenceMode = detectReferenceReproductionMode(options.prompt, {
    styleFamily,
    typology,
    detailAverage,
    terrainWeight,
    gardenWeight,
    waterWeight,
    retrieved
  });
  const compositionStrategy = buildCompositionStrategy(compositionCandidates, {
    styleFamily,
    typology,
    prompt: options.prompt,
    terrainWeight,
    gardenWeight,
    waterWeight,
    referenceMode
  });
  const sourceFusionPolicy = buildSourceFusionPolicy(retrieved, options.prompt);
  const referenceReproduction = buildReferenceReproductionStrategy(retrieved, options.prompt, {
    styleFamily,
    typology,
    detailAverage,
    terrainWeight,
    gardenWeight,
    waterWeight,
    referenceMode,
    compositionStrategy
  });

  return {
    style_family: styleFamily,
    reference_style_family: referenceStyleFamily,
    typology,
    reference_typology: referenceTypology,
    terrain_profile: terrainWeight > 0.45 ? 'non-flat-integrated' : terrainWeight > 0.2 ? 'landscape-integrated' : 'flat-or-built-platform',
    terrain_weight: round(terrainWeight),
    garden_weight: round(gardenWeight),
    water_weight: round(waterWeight),
    landscape_features: [...landscapeFeatures].sort(),
    detail_density: detailAverage > 2.35 ? 'high' : detailAverage > 1.45 ? 'medium' : 'low',
    material_transfer_strength: materialTransferStrength,
    template_interior_pattern_strength: furniturePatternScore / totalScore > 2.35 ? 'high' : furniturePatternScore / totalScore > 1.35 ? 'medium' : furniturePatternScore > 0 ? 'low' : 'none',
    learning_roles: [...learningRoles].sort(),
    room_reference_candidates: [...roomReferences].sort(),
    furniture_group_patterns: topWeightedEntries(furniturePatterns, 12),
    room_pattern_clauses: [...roomPatternClauses].slice(0, 24),
    room_pattern_guidance: roomPatternGuidance,
    room_pattern_strategy: roomPatternStrategy,
    composition_strategy: compositionStrategy,
    source_fusion_policy: sourceFusionPolicy,
    reference_reproduction: referenceReproduction,
    material_guidance: materialGuidance,
    material_locks: materialLocks,
    case_library_clauses: dedupeClauseRecords(caseLibraryClauses).slice(0, 32),
    case_feature_priorities: [...caseFeaturePriorities].slice(0, 24).sort(),
    design_priorities: [...designPriorities].slice(0, 8),
    corpus_gap_priorities: corpus.gap_priorities || []
  };
}

function emptyMaterialGuidance() {
  return {
    source: 'template-top-blocks-v1',
    wall_candidates: [],
    accent_candidates: [],
    trim_candidates: [],
    glass_candidates: [],
    landscape_candidates: [],
    earth_candidates: [],
    plant_candidates: [],
    water_candidates: []
  };
}

function buildMaterialGuidance(retrieved = []) {
  const buckets = {
    wall: new Map(),
    accent: new Map(),
    trim: new Map(),
    glass: new Map(),
    landscape: new Map(),
    earth: new Map(),
    plant: new Map(),
    water: new Map()
  };

  for (const item of retrieved) {
    for (const blockInfo of item.top_blocks || []) {
      const block = normalizeTemplateBlock(blockInfo.key || blockInfo.name);
      if (!block || !isKnownMinecraft121Block(block)) continue;
      const base = blockBase(block);
      const category = String(blockInfo.category || '').toLowerCase();
      const weight = Number(item.score || 1) *
        (1 + Math.min(2, Number(blockInfo.ratio || 0) * 10)) +
        Math.log1p(Number(blockInfo.count || 0)) * 0.1;

      if (base === 'minecraft:water') addMaterialCandidate(buckets.water, block, item, category, weight);
      if (isGlassCandidate(base)) addMaterialCandidate(buckets.glass, block, item, category, weight);
      if (isPlantCandidate(base, category)) addMaterialCandidate(buckets.plant, plantMaterialBlock(block), item, category, weight);
      if (isEarthCandidate(base, category)) addMaterialCandidate(buckets.earth, block, item, category, weight);
      if (isLandscapeCandidate(base, category)) addMaterialCandidate(buckets.landscape, block, item, category, weight);
      if (isSolidSurfaceCandidate(base, category)) {
        if (isWallSurfaceCandidate(base, category)) addMaterialCandidate(buckets.wall, block, item, category, weight);
        addMaterialCandidate(buckets.accent, block, item, category, weight * 0.9);
        addMaterialCandidate(buckets.trim, block, item, category, weight * 0.8);
      }
    }
  }

  return {
    source: 'template-top-blocks-v1',
    wall_candidates: rankedMaterialCandidates(buckets.wall, 8),
    accent_candidates: rankedMaterialCandidates(buckets.accent, 8),
    trim_candidates: rankedMaterialCandidates(buckets.trim, 8),
    glass_candidates: rankedMaterialCandidates(buckets.glass, 6),
    landscape_candidates: rankedMaterialCandidates(buckets.landscape, 8),
    earth_candidates: rankedMaterialCandidates(buckets.earth, 8),
    plant_candidates: rankedMaterialCandidates(buckets.plant, 8),
    water_candidates: rankedMaterialCandidates(buckets.water, 4)
  };
}

function normalizeTemplateBlock(value) {
  const normalized = normalizeBlockId(value);
  return normalized && normalized !== 'minecraft:' ? normalized : '';
}

function addMaterialCandidate(bucket, block, item, category, weight) {
  const existing = bucket.get(block) || {
    block,
    weight: 0,
    sources: new Set(),
    categories: new Set()
  };
  existing.weight += weight;
  if (item.title) existing.sources.add(item.title);
  if (category) existing.categories.add(category);
  bucket.set(block, existing);
}

function rankedMaterialCandidates(bucket, limit) {
  return [...bucket.values()]
    .sort((a, b) => b.weight - a.weight || a.block.localeCompare(b.block))
    .slice(0, limit)
    .map((item) => ({
      block: item.block,
      weight: round(item.weight),
      sources: [...item.sources].slice(0, 4),
      categories: [...item.categories].sort()
    }));
}

function isSolidSurfaceCandidate(base, category) {
  if (isNonSurfaceBase(base) || ['glass', 'water', 'vegetation', 'light', 'decor', 'stair', 'slab'].includes(category)) return false;
  if (category === 'earth' && !/sandstone|mud_bricks|packed_mud|terracotta|clay/.test(base)) return false;
  return ['rock', 'wood', 'metal', 'ore', 'wool', 'concrete', 'terracotta'].includes(category) ||
    /stone|quartz|brick|deepslate|blackstone|tuff|andesite|diorite|granite|concrete|terracotta|planks|log|wood|copper|prismarine|basalt|sandstone|calcite/.test(base);
}

function isWallSurfaceCandidate(base, category) {
  if (category === 'wood' || /planks|log|wood|stem|hyphae|bamboo/.test(base)) return false;
  if (category === 'earth' && !/sandstone|mud_bricks|packed_mud/.test(base)) return false;
  return ['rock', 'concrete', 'terracotta', 'metal', 'ore'].includes(category) ||
    /stone|quartz|brick|deepslate|blackstone|tuff|andesite|diorite|granite|concrete|terracotta|copper|prismarine|basalt|sandstone|calcite/.test(base);
}

function isGlassCandidate(base) {
  return /(^minecraft:glass$|_glass$|tinted_glass$)/.test(base) && !/_pane$/.test(base);
}

function isLandscapeCandidate(base, category) {
  return ['earth', 'vegetation', 'rock'].includes(category) ||
    /grass_block|dirt|podzol|mud|moss_block|gravel|sand|clay|stone|tuff|andesite|diorite|granite/.test(base);
}

function isEarthCandidate(base, category) {
  return category === 'earth' ||
    /grass_block|dirt|coarse_dirt|podzol|rooted_dirt|mud|packed_mud|clay|gravel|sand|moss_block/.test(base);
}

function isPlantCandidate(base, category) {
  if (/grass_block|moss_block/.test(base)) return false;
  return category === 'vegetation' ||
    /leaves|azalea|bamboo|short_grass|tall_grass|fern|flower|sapling|bush|vine/.test(base);
}

function isNonSurfaceBase(base) {
  return /_slab$|_stairs$|_trapdoor$|_pane$|_fence$|_wall$|_bars$|_carpet$|_button$|_pressure_plate$|_door$|_sign$|_hanging_sign$|chain$|lantern$|candle$|flower_pot$|potted_|vine$|torch$|rail$|rod$|grate$/.test(base);
}

function plantMaterialBlock(block) {
  const base = blockBase(block);
  return /_leaves$/.test(base) ? `${base}[persistent=true]` : block;
}

function blockBase(block) {
  return String(block || '').split('[')[0];
}

function detectExplicitMaterialLocks(prompt = '') {
  const text = String(prompt || '');
  const locks = new Set();
  if (/白墙|白色混凝土|白混凝土|white concrete/i.test(text)) locks.add('wall');
  if (/石英地板|quartz floor|石英.*地板/i.test(text)) locks.add('floor');
  if (/玻璃|glass/i.test(text)) locks.add('glass');
  if (/铁门|iron door/i.test(text)) locks.add('door');
  if (/沙岩|砂岩|sandstone/i.test(text)) {
    locks.add('wall');
    locks.add('foundation');
  }
  if (/木墙|木屋|木质|wooden|timber/i.test(text)) locks.add('wall');
  return [...locks].sort();
}

function materialTransferStrengthForPrompt(prompt = '', detailAverage = 0) {
  const text = String(prompt || '');
  if (/材质|材料|质感|模板|参考|顶级|精致|细节|花园|庭院|地形|水边|湖|海|河|露台|大玻璃|平台|garden|terrain|water|lake|terrace|material|reference/i.test(text)) {
    return 'high';
  }
  if (detailAverage > 2.35) return 'high';
  if (detailAverage > 1.45) return 'medium';
  return 'low';
}

function caseCardsByFile(caseLibrary = {}) {
  const map = new Map();
  for (const card of caseLibrary.cases || []) {
    if (card?.file) map.set(card.file, card);
  }
  return map;
}

function hasCaseRole(template, role) {
  return (template.case_profile?.learning_roles || []).some((item) => item.role === role);
}

function compactCaseProfile(profile = {}) {
  return {
    case_id: profile.case_id,
    overall_reference_score: profile.overall_reference_score,
    study_priority: profile.study_priority,
    phase2_room_mining_priority: profile.phase2_room_mining_priority,
    quality_scores: profile.quality_scores,
    quality_tags: profile.quality_tags || [],
    learning_roles: (profile.learning_roles || []).slice(0, 5),
    room_reference_candidates: (profile.room_reference_candidates || []).slice(0, 6),
    room_learning_clauses: (profile.room_learning_clauses || []).slice(0, 6),
    phase2_spatial_evidence: profile.phase2_spatial_evidence,
    phase3_pattern_evidence: profile.phase3_pattern_evidence,
    phase5_composition_evidence: profile.phase5_composition_evidence,
    review_flags: profile.review_flags || [],
    next_phase_hints: profile.next_phase_hints || []
  };
}

function compactCaseCard(card) {
  if (!card) return undefined;
  return {
    case_id: card.case_id,
    study_priority: card.study_priority,
    overall_reference_score: card.overall_reference_score,
    learnable_areas: normalizeLearnableAreas(card.learnable_areas).slice(0, 12),
    prompt_affinities: normalizeStringArray(card.retrieval?.prompt_affinities).slice(0, 16),
    semantic_clauses: (card.semantic_clauses || []).slice(0, 20),
    risk_controls: (card.risk_controls || []).slice(0, 6),
    feature_card: {
      site: card.feature_card?.site,
      composition: card.feature_card?.composition,
      interior: {
        furnished_likelihood: card.feature_card?.interior?.furnished_likelihood,
        room_candidates: card.feature_card?.interior?.room_candidates,
        furniture_readiness: card.feature_card?.interior?.furniture_readiness,
        top_furniture_patterns: card.feature_card?.interior?.top_furniture_patterns
      }
    }
  };
}

function collectCompositionCandidates(target, item = {}) {
  const grammar = item.composition_grammar || {};
  const phase5 = item.case_profile?.phase5_composition_evidence || {};
  const sourceReadiness = grammar.readiness || phase5.readiness || 'skip';
  const groups = [
    ['massing', grammar.massing_patterns || phase5.massing_patterns || []],
    ['approach', grammar.approach_sequence || phase5.approach_sequence || []],
    ['facade', grammar.facade_rhythm || phase5.facade_rhythm || []],
    ['roof', grammar.roof_composition || phase5.roof_composition || []],
    ['site', grammar.site_composition || phase5.site_composition || []],
    ['view', grammar.view_and_landmark_rules || phase5.view_and_landmark_rules || []]
  ];
  for (const [group, patterns] of groups) {
    for (const pattern of patterns || []) {
      if (!pattern?.pattern_type) continue;
      target.push({
        group,
        pattern_type: pattern.pattern_type,
        confidence: Number(pattern.confidence || 0),
        reason: pattern.reason,
        source_title: item.title,
        source_style_family: item.style_family,
        source_typology: item.typology,
        source_score: item.score,
        source_readiness: sourceReadiness
      });
    }
  }
  for (const rule of grammar.transfer_rules || phase5.transfer_rules || []) {
    target.push({
      group: 'transfer',
      pattern_type: 'transfer_rule',
      confidence: readinessConfidence(sourceReadiness),
      reason: String(rule),
      source_title: item.title,
      source_style_family: item.style_family,
      source_typology: item.typology,
      source_score: item.score,
      source_readiness: sourceReadiness
    });
  }
}

function buildCompositionStrategy(candidates = [], { styleFamily = 'general', typology = 'building', prompt = '', terrainWeight = 0, gardenWeight = 0, waterWeight = 0, referenceMode = {} } = {}) {
  const groups = {
    massing: aggregateCompositionGroup(candidates, 'massing', styleFamily, typology, 8),
    approach: aggregateCompositionGroup(candidates, 'approach', styleFamily, typology, 8),
    facade: aggregateCompositionGroup(candidates, 'facade', styleFamily, typology, 8),
    roof: aggregateCompositionGroup(candidates, 'roof', styleFamily, typology, 6),
    site: aggregateCompositionGroup(candidates, 'site', styleFamily, typology, 8),
    view: aggregateCompositionGroup(candidates, 'view', styleFamily, typology, 6)
  };
  const transferRules = candidates
    .filter((item) => item.group === 'transfer')
    .sort((a, b) => scoreCompositionCandidate(b, styleFamily, typology) - scoreCompositionCandidate(a, styleFamily, typology))
    .map((item) => item.reason)
    .filter(Boolean);
  const directives = compositionDirectives(groups, { prompt, terrainWeight, gardenWeight, waterWeight, styleFamily, typology, referenceMode });
  const score = Object.values(groups)
    .flat()
    .slice(0, 12)
    .reduce((sum, item) => sum + Number(item.weight || 0), 0);

  return {
    source: 'template-composition-strategy-v1',
    style_family: String(styleFamily || 'general'),
    typology: String(typology || 'building'),
    readiness: score > 420 ? 'high' : score > 180 ? 'medium' : score > 0 ? 'low' : 'none',
    massing_patterns: groups.massing,
    approach_sequence: groups.approach,
    facade_rhythm: groups.facade,
    roof_composition: groups.roof,
    site_composition: groups.site,
    view_and_landmark_rules: groups.view,
    transfer_rules: [...new Set(transferRules)].slice(0, 10),
    directives
  };
}

function buildSourceFusionPolicy(retrieved = [], prompt = '') {
  const totalScore = retrieved.reduce((sum, item) => sum + Number(item.score || 0), 0) || 1;
  const sourceBlend = retrieved.map((item) => ({
    title: item.title,
    file: item.file,
    style_family: item.style_family,
    typology: item.typology,
    score: round(item.score),
    share: round(Number(item.score || 0) / totalScore),
    transferable_roles: (item.case_profile?.learning_roles || []).map((role) => role.role).slice(0, 5),
    risk_controls: item.case_card?.risk_controls || []
  }));
  const topShare = sourceBlend[0]?.share || 0;
  const explicitReference = /复刻|参考|模板|inspired|reference|case/i.test(String(prompt || ''));
  const copyRisk = topShare >= 0.56 && explicitReference ? 'medium' : topShare >= 0.72 ? 'medium' : 'low';
  return {
    source: 'template-source-fusion-policy-v1',
    active: retrieved.length > 0,
    min_source_cases: Math.min(3, retrieved.length),
    retrieved_source_count: retrieved.length,
    top_source_share: topShare,
    copy_risk: copyRisk,
    source_blend: sourceBlend.slice(0, 6),
    obligations: [
      'borrow transferable grammar rather than dimensions or exact floor plans',
      'mix site, massing, facade, roof, and interior lessons from different cases',
      'normalize monumental references to residential scale when the requested typology is a house',
      'avoid preserving a single template silhouette unless the user explicitly asks for a replica'
    ],
    expected_variation_axes: [
      'footprint proportions',
      'entry sequence',
      'room ordering',
      'facade rhythm',
      'roof edge treatment',
      'garden and terrain placement',
      'interior furniture group layout'
    ]
  };
}

function aggregateCompositionGroup(candidates, group, styleFamily, typology, limit) {
  const map = new Map();
  for (const item of candidates.filter((candidate) => candidate.group === group)) {
    const key = item.pattern_type;
    const current = map.get(key) || {
      pattern_type: key,
      weight: 0,
      confidence: 0,
      sources: [],
      reasons: []
    };
    const score = scoreCompositionCandidate(item, styleFamily, typology);
    current.weight += score;
    current.confidence = Math.max(current.confidence, Number(item.confidence || 0));
    if (!current.sources.includes(item.source_title)) current.sources.push(item.source_title);
    if (item.reason && !current.reasons.includes(item.reason)) current.reasons.push(item.reason);
    map.set(key, current);
  }
  return [...map.values()]
    .sort((a, b) => b.weight - a.weight || b.confidence - a.confidence || a.pattern_type.localeCompare(b.pattern_type))
    .slice(0, limit)
    .map((item) => ({
      pattern_type: item.pattern_type,
      confidence: round(item.confidence),
      weight: round(item.weight),
      sources: item.sources.slice(0, 4),
      reason: item.reasons[0]
    }));
}

function scoreCompositionCandidate(item, styleFamily, typology) {
  const confidence = Number(item.confidence || 0);
  const sourceScore = Number(item.source_score || 0);
  const readiness = readinessConfidence(item.source_readiness);
  const styleBonus = styleMatchBonus(item.source_style_family, styleFamily);
  const typologyBonus = typologyMatchBonus(item.source_typology, typology);
  return confidence * 0.8 + sourceScore * 0.65 + readiness * 0.25 + styleBonus + typologyBonus;
}

function compositionDirectives(groups, { prompt = '', terrainWeight, gardenWeight, waterWeight, styleFamily, typology, referenceMode = {} }) {
  const has = (group, type) => (groups[group] || []).some((item) => item.pattern_type === type);
  const weightOf = (group, type) => Number((groups[group] || []).find((item) => item.pattern_type === type)?.weight || 0);
  const styleText = String(styleFamily || '').toLowerCase();
  const typologyText = String(typology || '').toLowerCase();
  const promptText = String(prompt || '').toLowerCase();
  const modernLike = /modern|coastal|futuristic|cyberpunk|现代|海滨|湖边|未来|赛博/.test(styleText);
  const classicalLike = /classical|european|victorian|baroque|rococo|manor|palace|古典|欧式|法式|庄园|宫殿|巴洛克|洛可可|维多利亚/.test(`${styleText} ${typologyText} ${promptText}`);
  const terraceRoofStyle = /modern|coastal|futuristic|cyberpunk|desert|mediterranean|industrial|subterranean|现代|海滨|沙漠|地中海|工业|地下/.test(`${styleText} ${typologyText} ${promptText}`);
  const layeredEaveStyle = /japanese|chinese|east-asian|pagoda|日式|和风|中式|江南|飞檐|重檐|层叠檐/.test(`${styleText} ${typologyText} ${promptText}`);
  const verticalTypology = /castle|tower|temple|gothic|medieval|城堡|塔|神殿|教堂|哥特|中世纪/.test(`${typologyText} ${styleText}`);
  const waterRequested = /湖|海|河|水边|临水|滨水|海边|湖边|water|lake|beach|coast|waterfront|riverside/.test(promptText);
  const gardenRequested = /前景|花园|庭院|园林|前庭|garden|courtyard|yard|forecourt|approach/.test(promptText);
  const terrainRequested = /非平坦|地形|坡|山|悬崖|岩|terrain|slope|hill|cliff|rock/.test(promptText);
  const roofTerraceRequested = /屋顶露台|上人屋顶|屋顶平台|平屋顶|roof terrace|roof deck|flat roof/.test(promptText);
  const explicitCompositionRequest = waterRequested || gardenRequested || terrainRequested || roofTerraceRequested || /整体构图|入口序列|空间序列|composition|massing/.test(promptText);
  const formalAxisRequested = classicalLike && /对称|轴线|中轴|入口轴线|庄园|主轴|礼仪|formal|symmetry|axis|manor/.test(`${promptText} ${styleText} ${typologyText}`);
  const useVerticalAccent = has('massing', 'vertical_landmark') && (verticalTypology || weightOf('massing', 'vertical_landmark') >= 720);
  const useWaterfront = waterRequested && (has('approach', 'waterfront_transition') || has('site', 'water_edge') || waterWeight > 0.2);
  const useLargeGlass = has('facade', 'large_glass_bands') || (modernLike && has('view', 'orient_public_rooms_to_view'));
  const modernWaterfrontRequested = modernLike && waterRequested && (useLargeGlass || /大玻璃|落地窗|玻璃|glass|view/.test(promptText));
  const strongReference = referenceMode.strength === 'high';
  const promptLayeredEaves = /层叠|重檐|深檐|飞檐|屋檐|eaves|pagoda/.test(promptText);
  const useLayeredEaves = layeredEaveStyle && (promptLayeredEaves || has('roof', 'layered_eaves'));
  const useFlatTerrace = roofTerraceRequested || (terraceRoofStyle && has('roof', 'flat_terrace_or_platform')) || (modernLike && useWaterfront);
  const useForegroundGarden = gardenRequested && (has('approach', 'garden_forecourt') || has('site', 'garden_rooms') || gardenWeight > 0.25);
  const useLayeredTerrain = terrainRequested && (has('site', 'layered_terrain_base') || terrainWeight > 0.25);
  const massingVariant =
    strongReference && modernWaterfrontRequested ? 'waterfront-stepped-estate' :
      formalAxisRequested ? 'formal-axis-manor' :
        modernWaterfrontRequested ? 'east-offset-glass-wing' :
        useVerticalAccent ? 'corner-vertical-accent' :
          has('massing', 'asymmetric_wings') ? 'dual-wing-balanced' :
            has('massing', 'long_bar') && useWaterfront ? 'east-offset-glass-wing' :
              useForegroundGarden || has('massing', 'courtyard_or_void') ? 'front-back-gallery' :
                useWaterfront ? 'compact-patio-bar' :
                  undefined;
  const facadeRhythm =
    has('facade', 'large_glass_bands') ? 'horizontal-ribbon-breaks' :
      has('facade', 'vertical_slots') ? 'vertical-slot-grid' :
        has('facade', 'formal_symmetry') ? 'quiet-punched-windows' :
          has('facade', 'micro_depth_trim') ? 'irregular-studio-grid' :
            undefined;
  const roofProfile =
    useFlatTerrace ? 'thin-parapet-terrace' :
      useLayeredEaves ? 'low-layered-eaves' :
        undefined;
  const siteMood =
    useWaterfront ? 'reflecting-water-edge' :
      has('site', 'garden_rooms') || gardenWeight > 0.25 ? 'ordered-entry-court' :
        has('site', 'layered_terrain_base') || terrainWeight > 0.25 ? 'terrain-forecourt' :
          undefined;

  return {
    preferred_massing_variant: massingVariant,
    preferred_facade_rhythm: facadeRhythm,
    preferred_roof_profile: roofProfile,
    preferred_site_mood: siteMood,
    use_wings: formalAxisRequested || has('massing', 'asymmetric_wings') || has('massing', 'long_bar'),
    use_vertical_accent: useVerticalAccent,
    use_courtyard_or_patio_void: has('massing', 'courtyard_or_void') || useForegroundGarden,
    use_large_view_glass: useLargeGlass,
    use_facade_depth: has('facade', 'micro_depth_trim') || has('facade', 'rail_balcony_edges'),
    use_layered_roof_edges: useLayeredEaves || has('roof', 'deep_overhang_edges'),
    lock_preferred_roof_profile: Boolean(roofTerraceRequested || useLayeredEaves),
    reference_reproduction_strength: referenceMode.strength || 'low',
    use_waterfront_transition: useWaterfront,
    use_foreground_garden_sequence: useForegroundGarden,
    use_layered_terrain_base: useLayeredTerrain,
    lock_preferred_massing_variant: Boolean(formalAxisRequested || modernWaterfrontRequested || strongReference),
    massing_intent: formalAxisRequested ? 'formal-axis' : modernWaterfrontRequested ? 'modern-waterfront' : undefined,
    prompt_signals: {
      explicit_composition_request: explicitCompositionRequest,
      water_requested: waterRequested,
      garden_requested: gardenRequested,
      terrain_requested: terrainRequested,
      roof_terrace_requested: roofTerraceRequested,
      formal_axis_requested: formalAxisRequested,
      modern_waterfront_requested: modernWaterfrontRequested
    }
  };
}

function readinessConfidence(value) {
  if (value === 'high') return 90;
  if (value === 'medium') return 65;
  if (value === 'low') return 35;
  return 0;
}

function styleMatchBonus(sourceStyle, requestedStyle) {
  const source = String(sourceStyle || '').toLowerCase();
  const requested = String(requestedStyle || '').toLowerCase();
  if (!source || !requested || requested === 'unknown') return 0;
  if (source === requested || requested.includes(source) || source.includes(requested)) return 18;
  if ((source === 'medieval' && requested === 'gothic') || (source === 'gothic' && requested === 'medieval')) return 8;
  if ((source === 'coastal' && requested === 'modern') || (source === 'modern' && requested === 'coastal')) return 5;
  return -3;
}

function typologyMatchBonus(sourceTypology, requestedTypology) {
  const source = String(sourceTypology || '').toLowerCase();
  const requested = String(requestedTypology || '').toLowerCase();
  if (!source || !requested || requested === 'unknown') return 0;
  if (source === requested || requested.includes(source) || source.includes(requested)) return 12;
  if (source === 'tower' && ['castle', 'temple', 'public-building'].includes(requested)) return 5;
  if (source === 'house' && /villa|house|home|住宅|别墅/.test(requested)) return 10;
  return -2;
}

export function applyTemplateKnowledgeToArchitecture(architecture = {}, templateKnowledge = {}) {
  if (!templateKnowledge.active) {
    return {
      ...architecture,
      template_knowledge: templateKnowledge
    };
  }

  const recommendations = templateKnowledge.recommendations || {};
  const features = new Set(recommendations.landscape_features || []);
  const compositionStrategy = recommendations.composition_strategy || {};
  const compositionDirectives = compositionStrategy.directives || {};
  const referenceReproduction = recommendations.reference_reproduction || {};
  const referenceStrong = referenceReproduction.active && ['high', 'medium'].includes(String(referenceReproduction.strength || ''));
  const referenceDetailHigh = referenceReproduction.detail_targets?.detail_density === 'high';
  const hasCompositionDirectives = Object.keys(compositionDirectives).length > 0;
  const explicitTemplateSite = !hasCompositionDirectives || Boolean(compositionDirectives.prompt_signals?.explicit_composition_request);
  const materialPatch = buildTemplateMaterialPatch(architecture.materials || {}, recommendations);
  const materials = {
    ...(architecture.materials || {}),
    ...materialPatch
  };
  return {
    ...architecture,
    materials,
    template_knowledge: templateKnowledge,
    massing_rules: {
      ...(architecture.massing_rules || {}),
      template_composition_strategy: compositionStrategy,
      reference_reproduction: referenceReproduction,
      template_preferred_massing_variant: compositionDirectives.preferred_massing_variant,
      template_use_wings: Boolean(compositionDirectives.use_wings),
      template_use_vertical_accent: Boolean(compositionDirectives.use_vertical_accent),
      template_use_courtyard_or_patio_void: Boolean(compositionDirectives.use_courtyard_or_patio_void)
    },
    facade_rules: {
      ...(architecture.facade_rules || {}),
      template_composition_strategy: compositionStrategy,
      reference_reproduction: referenceReproduction,
      template_facade_rhythm: compositionDirectives.preferred_facade_rhythm,
      large_glass: Boolean((architecture.facade_rules || {}).large_glass || compositionDirectives.use_large_view_glass),
      wall_relief: (architecture.facade_rules || {}).wall_relief !== false || Boolean(compositionDirectives.use_facade_depth || referenceStrong),
      reference_detail_boost: Boolean(referenceStrong),
      flower_boxes: Boolean((architecture.facade_rules || {}).flower_boxes || (referenceDetailHigh && ['rustic', 'classical', 'victorian', 'alpine'].includes(String(recommendations.style_family || '').toLowerCase()))),
      awnings: Boolean((architecture.facade_rules || {}).awnings || (referenceDetailHigh && !['modern', 'industrial', 'cyberpunk'].includes(String(recommendations.style_family || '').toLowerCase()))),
      balcony: Boolean((architecture.facade_rules || {}).balcony || (referenceStrong && (compositionDirectives.use_waterfront_transition || /deck|water|湖|水/.test(JSON.stringify(referenceReproduction)))))
    },
    roof_rules: {
      ...(architecture.roof_rules || {}),
      template_composition_strategy: compositionStrategy,
      reference_reproduction: referenceReproduction,
      template_roof_profile: compositionDirectives.preferred_roof_profile,
      roof_terrace: Boolean((architecture.roof_rules || {}).roof_terrace || compositionDirectives.preferred_roof_profile === 'thin-parapet-terrace'),
      overhang: compositionDirectives.use_layered_roof_edges ? Math.max(Number((architecture.roof_rules || {}).overhang || 1), 2) : (architecture.roof_rules || {}).overhang
    },
    site_rules: {
      ...(architecture.site_rules || {}),
      template_composition_strategy: compositionStrategy,
      template_terrain_profile: recommendations.terrain_profile,
      template_landscape_features: [...features],
      template_guided_site: true,
      terrain_layers: Boolean((architecture.site_rules || {}).terrain_layers || (explicitTemplateSite && (features.has('layered-terrain') || recommendations.terrain_profile !== 'flat-or-built-platform'))),
      rock_base: Boolean((architecture.site_rules || {}).rock_base || (explicitTemplateSite && (features.has('rock-and-earth-base') || features.has('layered-terrain')))),
      garden_composition: Boolean((architecture.site_rules || {}).garden_composition || (explicitTemplateSite && features.has('garden-composition'))),
      water_feature: Boolean((architecture.site_rules || {}).water_feature || (explicitTemplateSite && compositionDirectives.use_waterfront_transition)),
      planting_beds: Boolean((architecture.site_rules || {}).planting_beds || (explicitTemplateSite && (features.has('garden-composition') || features.has('tree-and-shrub-clusters')))),
      template_site_mood: compositionDirectives.preferred_site_mood,
      template_waterfront_transition: Boolean(compositionDirectives.use_waterfront_transition),
      template_foreground_garden_sequence: Boolean(compositionDirectives.use_foreground_garden_sequence),
      template_layered_terrain_base: Boolean(compositionDirectives.use_layered_terrain_base)
    },
    detail_rules: {
      ...(architecture.detail_rules || {}),
      template_detail_density: recommendations.detail_density,
      template_design_priorities: recommendations.design_priorities || [],
      template_composition_strategy: recommendations.composition_strategy || {},
      reference_reproduction: referenceReproduction,
      reference_detail_boost: Boolean(referenceStrong),
      template_interior_pattern_strength: recommendations.template_interior_pattern_strength,
      template_room_pattern_clauses: recommendations.room_pattern_clauses || [],
      template_room_pattern_guidance: recommendations.room_pattern_guidance || [],
      template_room_pattern_strategy: recommendations.room_pattern_strategy || {},
      template_source_fusion_policy: recommendations.source_fusion_policy || {},
      template_case_library_clauses: recommendations.case_library_clauses || [],
      template_case_feature_priorities: recommendations.case_feature_priorities || [],
      template_design_law_pack: recommendations.design_law_pack || {},
      template_design_law_clauses: recommendations.design_law_clauses || [],
      template_interior_design_laws: recommendations.interior_design_laws || [],
      template_material_guidance: recommendations.material_guidance || emptyMaterialGuidance(),
      template_material_patch: materialPatch
    },
    generation_hints: {
      ...(architecture.generation_hints || {}),
      template_knowledge_active: true,
      template_retrieved: templateKnowledge.retrieved?.map((item) => item.title) || [],
      template_composition_strategy: recommendations.composition_strategy || {},
      reference_reproduction: referenceReproduction,
      template_furniture_group_patterns: recommendations.furniture_group_patterns || [],
      template_room_pattern_strategy: recommendations.room_pattern_strategy || {},
      template_source_fusion_policy: recommendations.source_fusion_policy || {},
      template_case_library_clauses: recommendations.case_library_clauses || [],
      template_case_feature_priorities: recommendations.case_feature_priorities || [],
      template_design_law_pack: recommendations.design_law_pack || {},
      template_design_laws: recommendations.design_laws || [],
      template_interior_design_laws: recommendations.interior_design_laws || [],
      template_design_law_clauses: recommendations.design_law_clauses || [],
      template_material_guidance: recommendations.material_guidance || emptyMaterialGuidance(),
      template_material_patch: materialPatch,
      template_gap_priorities: templateKnowledge.gap_priorities || []
    }
  };
}

function buildTemplateMaterialPatch(existing = {}, recommendations = {}) {
  const guidance = recommendations.material_guidance || {};
  const locks = new Set(recommendations.material_locks || []);
  const strongSurfaceTransfer = recommendations.material_transfer_strength === 'high';
  const hasSiteLearning = (recommendations.landscape_features || []).some((item) =>
    ['garden-composition', 'water-edge', 'layered-terrain', 'rock-and-earth-base', 'tree-and-shrub-clusters'].includes(item)
  );
  const patch = {};
  const wall = pickCandidate(guidance.wall_candidates);
  const accent = pickCandidate(guidance.accent_candidates, wall);
  const trim = pickCandidate(guidance.trim_candidates, accent || wall);
  const glass = pickCandidate(guidance.glass_candidates);
  const landscape = pickCandidate(guidance.landscape_candidates);
  const earth = pickCandidate(guidance.earth_candidates);
  const plant = pickCandidate(guidance.plant_candidates);
  const water = pickCandidate(guidance.water_candidates);
  const poolEdge = pickCandidate([...(guidance.trim_candidates || []), ...(guidance.wall_candidates || [])], accent);

  if (strongSurfaceTransfer && !locks.has('wall') && wall && shouldAdoptTemplateMaterial(existing.wall, wall)) patch.wall = wall;
  if (strongSurfaceTransfer && !locks.has('accent') && accent && shouldAdoptTemplateMaterial(existing.accent, accent)) patch.accent = accent;
  if (strongSurfaceTransfer && !locks.has('trim') && trim && shouldAdoptTemplateMaterial(existing.trim, trim)) patch.trim = trim;
  if (!locks.has('glass') && glass && shouldAdoptTemplateMaterial(existing.glass, glass)) patch.glass = glass;
  if (hasSiteLearning && !locks.has('landscape') && landscape && shouldAdoptTemplateMaterial(existing.landscape, landscape)) patch.landscape = landscape;
  if (hasSiteLearning && !locks.has('earth') && earth && shouldAdoptTemplateMaterial(existing.earth, earth)) patch.earth = earth;
  if (hasSiteLearning && !locks.has('plant') && plant && shouldAdoptTemplateMaterial(existing.plant, plant)) patch.plant = plant;
  if (hasSiteLearning && !locks.has('plant_secondary') && plant && shouldAdoptTemplateMaterial(existing.plant_secondary, plant)) patch.plant_secondary = plant;
  if (!locks.has('water') && water && shouldAdoptTemplateMaterial(existing.water, water)) patch.water = water;
  if (strongSurfaceTransfer && !locks.has('wall_detail') && trim && shouldAdoptTemplateMaterial(existing.wall_detail, trim)) patch.wall_detail = trim;
  if (strongSurfaceTransfer && !locks.has('secondary_wall') && accent && shouldAdoptTemplateMaterial(existing.secondary_wall, accent)) patch.secondary_wall = accent;
  if (!locks.has('retaining') && landscape && shouldAdoptTemplateMaterial(existing.retaining, landscape) && /stone|tuff|andesite|diorite|granite|deepslate|blackstone|brick/.test(landscape)) {
    patch.retaining = landscape;
  }
  if (strongSurfaceTransfer && !locks.has('pool_edge') && poolEdge && shouldAdoptTemplateMaterial(existing.pool_edge, poolEdge)) patch.pool_edge = poolEdge;

  return patch;
}

function pickCandidate(candidates = [], avoidBlock) {
  const avoid = blockBase(avoidBlock);
  const found = (candidates || [])
    .map((item) => typeof item === 'string' ? item : item?.block)
    .find((block) => block && blockBase(block) !== avoid && isKnownMinecraft121Block(block));
  return found;
}

function shouldAdoptTemplateMaterial(existing, candidate) {
  if (!candidate || !isKnownMinecraft121Block(candidate)) return false;
  if (!existing) return true;
  return blockBase(existing) !== blockBase(candidate);
}

export function applyTemplateKnowledgeToBuildSpec(buildSpec = {}, templateKnowledge = {}) {
  if (!templateKnowledge.active) return buildSpec;
  const recommendations = templateKnowledge.recommendations || {};
  const compositionDirectives = recommendations.composition_strategy?.directives || {};
  const referenceReproduction = recommendations.reference_reproduction || {};
  const referenceDimensions = referenceReproduction.target_dimensions || {};
  const referenceActive = referenceReproduction.active && ['high', 'medium'].includes(String(referenceReproduction.strength || ''));
  const hasCompositionDirectives = Object.keys(compositionDirectives).length > 0;
  const explicitTemplateSite = !hasCompositionDirectives || Boolean(compositionDirectives.prompt_signals?.explicit_composition_request);
  const needsSiteDepth = explicitTemplateSite && (
    recommendations.terrain_profile !== 'flat-or-built-platform' ||
    (recommendations.landscape_features || []).some((item) => ['garden-composition', 'water-edge', 'layered-terrain'].includes(item))
  );
  const explicitDimensions = buildSpec.source?.dimensions === 'prompt';
  const explicitFloors = buildSpec.source?.floors === 'prompt';
  const maxWidth = Number(buildSpec.constraints?.max_width || 45);
  const maxDepth = Number(buildSpec.constraints?.max_depth || 45);
  const targetWidth = Number(referenceDimensions.width || 0);
  const targetDepth = Number(referenceDimensions.depth || 0);
  const width = referenceActive && !explicitDimensions && targetWidth
    ? clampNumber(Math.max(Number(buildSpec.width || 0), targetWidth), Number(buildSpec.width || 11), maxWidth, Number(buildSpec.width || 19))
    : buildSpec.width;
  const depth = referenceActive && !explicitDimensions && targetDepth
    ? clampNumber(Math.max(Number(buildSpec.depth || 0), targetDepth), Number(buildSpec.depth || 11), maxDepth, Number(buildSpec.depth || 15))
    : buildSpec.depth;
  const targetFloors = Number(referenceDimensions.floors || 0);
  const floors = referenceActive && !explicitFloors && targetFloors
    ? clampNumber(Math.max(Number(buildSpec.floors || 1), targetFloors), 1, Number(buildSpec.constraints?.max_floors || 5), Number(buildSpec.floors || 1))
    : buildSpec.floors;
  const wallHeight = Number(floors || buildSpec.floors || 1) * Number(buildSpec.floor_height || 5);
  const roofHeight = Number(buildSpec.roof_height || 3);
  const referenceGardenDepth = Number(referenceDimensions.garden_depth || 0);
  const gardenDepth = Math.max(
    Number(buildSpec.garden_depth || 0),
    needsSiteDepth ? 10 : 0,
    referenceActive ? referenceGardenDepth : 0
  );
  const sideSetback = Number(buildSpec.lot?.side_setback || 2);
  const rearSetback = Number(buildSpec.lot?.rear_setback || 2);
  return {
    ...buildSpec,
    width,
    depth,
    floors,
    wall_height: wallHeight,
    total_height: wallHeight + roofHeight,
    garden_depth: gardenDepth,
    lot: {
      ...(buildSpec.lot || {}),
      width: Number(width || buildSpec.width || 0) + sideSetback * 2,
      depth: Number(depth || buildSpec.depth || 0) + gardenDepth + rearSetback
    },
    site: {
      ...(buildSpec.site || {}),
      template_terrain_profile: recommendations.terrain_profile,
      template_landscape_features: recommendations.landscape_features || []
    },
    design: {
      ...(buildSpec.design || {}),
      template_composition_strategy: recommendations.composition_strategy || {},
      template_case_library_clauses: recommendations.case_library_clauses || [],
      template_case_feature_priorities: recommendations.case_feature_priorities || [],
      template_design_law_pack: recommendations.design_law_pack || {},
      template_design_law_clauses: recommendations.design_law_clauses || [],
      template_interior_design_laws: recommendations.interior_design_laws || [],
      template_material_guidance: recommendations.material_guidance || emptyMaterialGuidance(),
      reference_reproduction: referenceReproduction
    },
    reference_reproduction: referenceReproduction,
    source_fusion_policy: recommendations.source_fusion_policy || {},
    template_knowledge: {
      active: true,
      retrieved_count: templateKnowledge.retrieved?.length || 0,
      recommendations
    },
    source: {
      ...(buildSpec.source || {}),
      dimensions: referenceActive && !explicitDimensions && (width !== buildSpec.width || depth !== buildSpec.depth) ? 'template-reference' : buildSpec.source?.dimensions,
      width: referenceActive && !explicitDimensions && width !== buildSpec.width ? 'template-reference' : buildSpec.source?.width,
      depth: referenceActive && !explicitDimensions && depth !== buildSpec.depth ? 'template-reference' : buildSpec.source?.depth,
      garden_depth: gardenDepth !== buildSpec.garden_depth ? 'template-reference' : buildSpec.source?.garden_depth,
      floors: referenceActive && !explicitFloors && floors !== buildSpec.floors ? 'template-reference' : buildSpec.source?.floors
    }
  };
}

function keywordTokens(text) {
  return [...new Set(String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/u)
    .filter((item) => item.length >= 3)
    .slice(0, 24))];
}

function detailWeight(value) {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  if (value === 'low') return 1;
  return 0;
}

function topWeighted(map) {
  return [...map.entries()]
    .filter(([key]) => key && key !== 'undefined')
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
}

function topWeightedEntries(map, limit) {
  return [...map.entries()]
    .filter(([key]) => key && key !== 'undefined')
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([pattern_type, weight]) => ({ pattern_type, weight: round(weight) }));
}

function dedupeClauseRecords(records = []) {
  const seen = new Set();
  const result = [];
  for (const record of records) {
    const key = `${record.case_id || record.source_title}:${record.clause}`;
    if (seen.has(key) || !record.clause) continue;
    seen.add(key);
    result.push(record);
  }
  return result;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeStringArray(item));
  if (value === undefined || value === null) return [];
  return String(value).split(/[,，、\s]+/u).map((item) => item.trim()).filter(Boolean);
}

function normalizeLearnableAreas(value) {
  if (!Array.isArray(value)) return normalizeStringArray(value);
  return value
    .map((item) => typeof item === 'string' ? item : item?.area || item?.role || item?.next_phase)
    .filter(Boolean);
}

function patternReadinessWeight(value) {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  if (value === 'low') return 1;
  return 0;
}

function round(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function clampNumber(value, min, max, fallback = min) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
