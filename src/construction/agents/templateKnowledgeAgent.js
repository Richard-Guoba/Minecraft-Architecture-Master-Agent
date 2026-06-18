import fs from 'node:fs';
import path from 'node:path';
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
  const compositionStrategy = buildCompositionStrategy(compositionCandidates, {
    styleFamily,
    typology,
    prompt: options.prompt,
    terrainWeight,
    gardenWeight,
    waterWeight
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
    detail_density: detailScore / totalScore > 2.35 ? 'high' : detailScore / totalScore > 1.45 ? 'medium' : 'low',
    template_interior_pattern_strength: furniturePatternScore / totalScore > 2.35 ? 'high' : furniturePatternScore / totalScore > 1.35 ? 'medium' : furniturePatternScore > 0 ? 'low' : 'none',
    learning_roles: [...learningRoles].sort(),
    room_reference_candidates: [...roomReferences].sort(),
    furniture_group_patterns: topWeightedEntries(furniturePatterns, 12),
    room_pattern_clauses: [...roomPatternClauses].slice(0, 24),
    room_pattern_guidance: roomPatternGuidance,
    room_pattern_strategy: roomPatternStrategy,
    composition_strategy: compositionStrategy,
    case_library_clauses: dedupeClauseRecords(caseLibraryClauses).slice(0, 32),
    case_feature_priorities: [...caseFeaturePriorities].slice(0, 24).sort(),
    design_priorities: [...designPriorities].slice(0, 8),
    corpus_gap_priorities: corpus.gap_priorities || []
  };
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

function buildCompositionStrategy(candidates = [], { styleFamily = 'general', typology = 'building', prompt = '', terrainWeight = 0, gardenWeight = 0, waterWeight = 0 } = {}) {
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
  const directives = compositionDirectives(groups, { prompt, terrainWeight, gardenWeight, waterWeight, styleFamily, typology });
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

function compositionDirectives(groups, { prompt = '', terrainWeight, gardenWeight, waterWeight, styleFamily, typology }) {
  const has = (group, type) => (groups[group] || []).some((item) => item.pattern_type === type);
  const weightOf = (group, type) => Number((groups[group] || []).find((item) => item.pattern_type === type)?.weight || 0);
  const styleText = String(styleFamily || '').toLowerCase();
  const typologyText = String(typology || '').toLowerCase();
  const promptText = String(prompt || '').toLowerCase();
  const modernLike = /modern|coastal|futuristic|cyberpunk|现代|海滨|湖边|未来|赛博/.test(styleText);
  const verticalTypology = /castle|tower|temple|gothic|medieval|城堡|塔|神殿|教堂|哥特|中世纪/.test(`${typologyText} ${styleText}`);
  const waterRequested = /湖|海|河|水边|临水|滨水|海边|湖边|water|lake|beach|coast|waterfront|riverside/.test(promptText);
  const gardenRequested = /前景|花园|庭院|园林|前庭|garden|courtyard|yard|forecourt|approach/.test(promptText);
  const terrainRequested = /非平坦|地形|坡|山|悬崖|岩|terrain|slope|hill|cliff|rock/.test(promptText);
  const roofTerraceRequested = /屋顶露台|上人屋顶|屋顶平台|平屋顶|roof terrace|roof deck|flat roof/.test(promptText);
  const explicitCompositionRequest = waterRequested || gardenRequested || terrainRequested || roofTerraceRequested || /整体构图|入口序列|空间序列|composition|massing/.test(promptText);
  const useVerticalAccent = has('massing', 'vertical_landmark') && (verticalTypology || weightOf('massing', 'vertical_landmark') >= 720);
  const useWaterfront = waterRequested && (has('approach', 'waterfront_transition') || has('site', 'water_edge') || waterWeight > 0.2);
  const useLargeGlass = has('facade', 'large_glass_bands') || (modernLike && has('view', 'orient_public_rooms_to_view'));
  const useLayeredEaves = has('roof', 'layered_eaves') && !modernLike;
  const useFlatTerrace = roofTerraceRequested || has('roof', 'flat_terrace_or_platform') || (modernLike && useWaterfront);
  const useForegroundGarden = gardenRequested && (has('approach', 'garden_forecourt') || has('site', 'garden_rooms') || gardenWeight > 0.25);
  const useLayeredTerrain = terrainRequested && (has('site', 'layered_terrain_base') || terrainWeight > 0.25);
  const massingVariant =
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
        has('roof', 'tower_cap') ? 'stepped-flat-with-light-slot' :
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
    use_wings: has('massing', 'asymmetric_wings') || has('massing', 'long_bar'),
    use_vertical_accent: useVerticalAccent,
    use_courtyard_or_patio_void: has('massing', 'courtyard_or_void') || useForegroundGarden,
    use_large_view_glass: useLargeGlass,
    use_facade_depth: has('facade', 'micro_depth_trim') || has('facade', 'rail_balcony_edges'),
    use_layered_roof_edges: useLayeredEaves || has('roof', 'deep_overhang_edges'),
    use_waterfront_transition: useWaterfront,
    use_foreground_garden_sequence: useForegroundGarden,
    use_layered_terrain_base: useLayeredTerrain,
    prompt_signals: {
      explicit_composition_request: explicitCompositionRequest,
      water_requested: waterRequested,
      garden_requested: gardenRequested,
      terrain_requested: terrainRequested,
      roof_terrace_requested: roofTerraceRequested
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
  const hasCompositionDirectives = Object.keys(compositionDirectives).length > 0;
  const explicitTemplateSite = !hasCompositionDirectives || Boolean(compositionDirectives.prompt_signals?.explicit_composition_request);
  return {
    ...architecture,
    template_knowledge: templateKnowledge,
    massing_rules: {
      ...(architecture.massing_rules || {}),
      template_composition_strategy: compositionStrategy,
      template_preferred_massing_variant: compositionDirectives.preferred_massing_variant,
      template_use_wings: Boolean(compositionDirectives.use_wings),
      template_use_vertical_accent: Boolean(compositionDirectives.use_vertical_accent),
      template_use_courtyard_or_patio_void: Boolean(compositionDirectives.use_courtyard_or_patio_void)
    },
    facade_rules: {
      ...(architecture.facade_rules || {}),
      template_composition_strategy: compositionStrategy,
      template_facade_rhythm: compositionDirectives.preferred_facade_rhythm,
      large_glass: Boolean((architecture.facade_rules || {}).large_glass || compositionDirectives.use_large_view_glass),
      wall_relief: (architecture.facade_rules || {}).wall_relief !== false || Boolean(compositionDirectives.use_facade_depth)
    },
    roof_rules: {
      ...(architecture.roof_rules || {}),
      template_composition_strategy: compositionStrategy,
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
      template_interior_pattern_strength: recommendations.template_interior_pattern_strength,
      template_room_pattern_clauses: recommendations.room_pattern_clauses || [],
      template_room_pattern_guidance: recommendations.room_pattern_guidance || [],
      template_room_pattern_strategy: recommendations.room_pattern_strategy || {},
      template_case_library_clauses: recommendations.case_library_clauses || [],
      template_case_feature_priorities: recommendations.case_feature_priorities || [],
      template_design_law_pack: recommendations.design_law_pack || {},
      template_design_law_clauses: recommendations.design_law_clauses || [],
      template_interior_design_laws: recommendations.interior_design_laws || []
    },
    generation_hints: {
      ...(architecture.generation_hints || {}),
      template_knowledge_active: true,
      template_retrieved: templateKnowledge.retrieved?.map((item) => item.title) || [],
      template_composition_strategy: recommendations.composition_strategy || {},
      template_furniture_group_patterns: recommendations.furniture_group_patterns || [],
      template_room_pattern_strategy: recommendations.room_pattern_strategy || {},
      template_case_library_clauses: recommendations.case_library_clauses || [],
      template_case_feature_priorities: recommendations.case_feature_priorities || [],
      template_design_law_pack: recommendations.design_law_pack || {},
      template_design_laws: recommendations.design_laws || [],
      template_interior_design_laws: recommendations.interior_design_laws || [],
      template_design_law_clauses: recommendations.design_law_clauses || [],
      template_gap_priorities: templateKnowledge.gap_priorities || []
    }
  };
}

export function applyTemplateKnowledgeToBuildSpec(buildSpec = {}, templateKnowledge = {}) {
  if (!templateKnowledge.active) return buildSpec;
  const recommendations = templateKnowledge.recommendations || {};
  const compositionDirectives = recommendations.composition_strategy?.directives || {};
  const hasCompositionDirectives = Object.keys(compositionDirectives).length > 0;
  const explicitTemplateSite = !hasCompositionDirectives || Boolean(compositionDirectives.prompt_signals?.explicit_composition_request);
  const needsSiteDepth = explicitTemplateSite && (
    recommendations.terrain_profile !== 'flat-or-built-platform' ||
    (recommendations.landscape_features || []).some((item) => ['garden-composition', 'water-edge', 'layered-terrain'].includes(item))
  );
  const gardenDepth = needsSiteDepth ? Math.max(Number(buildSpec.garden_depth || 0), 10) : buildSpec.garden_depth;
  return {
    ...buildSpec,
    garden_depth: gardenDepth,
    lot: {
      ...(buildSpec.lot || {}),
      depth: (buildSpec.lot?.depth || buildSpec.depth || 0) + Math.max(0, gardenDepth - Number(buildSpec.garden_depth || 0))
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
      template_interior_design_laws: recommendations.interior_design_laws || []
    },
    template_knowledge: {
      active: true,
      retrieved_count: templateKnowledge.retrieved?.length || 0,
      recommendations
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
