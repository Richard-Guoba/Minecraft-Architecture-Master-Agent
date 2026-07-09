const SELECTION_VERSION = 1;

export class ConceptSelectionAgent {
  run(concepts = [], options = {}) {
    const rows = (Array.isArray(concepts) ? concepts : []).map((concept) => scoreConcept(concept, options));
    const ranked = rows.slice().sort(compareRows).map((row, index) => ({ ...row, rank: index + 1 }));
    const selected = ranked[0];
    return {
      source: 'local-concept-selection-agent',
      version: SELECTION_VERSION,
      active: rows.length > 0,
      strategy: 'highest-local-score',
      selected_concept_id: selected?.concept_id,
      selected_archetype: selected?.archetype,
      selected_selection_score: selected?.selection_score || 0,
      reason: selected ? selectionReason(selected, ranked) : 'no concepts available',
      ranking: ranked,
      warnings: rows.length ? [] : ['no concepts available for selection']
    };
  }
}

function scoreConcept(concept = {}, options = {}) {
  const prompt = String(options.prompt || '').toLowerCase();
  const text = `${concept.title || ''} ${concept.archetype || ''} ${concept.summary || ''} ${(concept.design_intent || []).join(' ')} ${(concept.quality_targets || []).join(' ')}`.toLowerCase();
  const promptTokens = tokenSet(prompt);
  const promptHits = [...promptTokens].filter((token) => text.includes(token)).length;
  const prompt_match_score = Math.min(34, promptHits * 6 + archetypePromptBonus(concept, prompt, options));
  const reference_evidence_score = Math.min(24, (concept.reference_strategy || []).length * 6 + referenceAreaCount(concept) * 3);
  const buildability_prior_score = buildabilityScore(concept);
  const diversity_role_score = diversityRoleScore(concept);
  const quality_target_score = Math.min(18, (concept.quality_targets || []).length * 4);
  const risk_penalty = riskPenalty(concept);
  const selection_score = round(prompt_match_score + reference_evidence_score + buildability_prior_score + diversity_role_score + quality_target_score - risk_penalty);
  return {
    concept_id: concept.id,
    title: concept.title,
    archetype: concept.archetype,
    selection_score,
    prompt_match_score: round(prompt_match_score),
    reference_evidence_score: round(reference_evidence_score),
    buildability_prior_score: round(buildability_prior_score),
    diversity_role_score: round(diversity_role_score),
    quality_target_score: round(quality_target_score),
    risk_penalty: round(risk_penalty),
    risk_ids: (concept.risks || []).map((risk) => risk.id),
    reference_count: (concept.reference_strategy || []).length
  };
}

function tokenSet(prompt) {
  const tokens = new Set(String(prompt || '').split(/[^a-z0-9\u4e00-\u9fa5]+/u).filter((item) => item.length >= 2));
  const hints = [
    ['湖', 'water'],
    ['水', 'water'],
    ['玻璃', 'glass'],
    ['平台', 'deck'],
    ['露台', 'terrace'],
    ['内饰', 'interior'],
    ['庭院', 'courtyard'],
    ['塔', 'tower'],
    ['庄园', 'manor'],
    ['紧凑', 'compact']
  ];
  for (const [hint, token] of hints) {
    if (prompt.includes(hint)) tokens.add(token);
  }
  return tokens;
}

function archetypePromptBonus(concept, prompt, options) {
  const archetype = String(concept.archetype || '');
  const wantsWaterView = /湖|水|滨水|water|lake/.test(prompt) || Boolean(options.buildSpec?.site?.water_feature);
  const wantsLargeGlass = /glass|玻璃/.test(prompt) || Boolean(options.buildSpec?.facade?.large_glass) || options.buildSpec?.facade?.glazing_ratio === 'high';
  const wantsOutdoorPlatform = /平台|deck|露台|terrace/.test(prompt) || Boolean(options.buildSpec?.site?.patio);
  let score = 0;
  if (archetype === 'view-courtyard' && /湖|水|water|glass|玻璃|平台/.test(prompt)) score += 16;
  if (archetype === 'view-courtyard' && wantsWaterView && wantsLargeGlass && wantsOutdoorPlatform) score += 8;
  if (archetype === 'formal-axis' && /庄园|城堡|对称|axis|formal|manor/.test(prompt)) score += 14;
  if (archetype === 'compact-patio' && /紧凑|小|compact|patio|露台/.test(prompt)) score += 14;
  if (archetype === 'vertical-landmark' && /塔|地标|tower|lookout/.test(prompt)) score += 16;
  if (archetype === 'dual-wing-estate' && /大|家庭|多房间|villa|estate/.test(prompt)) score += 12;
  if (archetype === 'formal-axis' && /湖|水|现代|modern/.test(prompt) && !/庄园|城堡/.test(prompt)) score -= 8;
  if (options.buildSpec?.facade?.large_glass && archetype === 'view-courtyard') score += 4;
  if (options.buildSpec?.site?.water_feature && archetype === 'view-courtyard') score += 4;
  return score;
}

function referenceAreaCount(concept) {
  const areas = new Set((concept.reference_strategy || []).flatMap((item) => item.used_for || []));
  return areas.size;
}

function buildabilityScore(concept = {}) {
  const patch = concept.creative_design_patch || {};
  const sections = ['facade', 'roof', 'site', 'interior', 'topology'].filter((key) => patch[key] && typeof patch[key] === 'object');
  return Math.min(18, sections.length * 3 + (patch.massing_variant ? 3 : 0));
}

function diversityRoleScore(concept = {}) {
  const archetype = String(concept.archetype || '');
  return ['view-courtyard', 'formal-axis', 'compact-patio', 'vertical-landmark', 'dual-wing-estate'].includes(archetype) ? 6 : 2;
}

function riskPenalty(concept = {}) {
  return (concept.risks || []).reduce((sum, risk) => {
    if (risk.severity === 'high') return sum + 24;
    if (risk.severity === 'medium') return sum + 10;
    return sum + 3;
  }, 0);
}

function compareRows(a, b) {
  return Number(b.selection_score || 0) - Number(a.selection_score || 0) ||
    Number(b.reference_count || 0) - Number(a.reference_count || 0) ||
    String(a.concept_id || '').localeCompare(String(b.concept_id || ''));
}

function selectionReason(selected, ranked) {
  const next = ranked.find((item) => item.concept_id !== selected.concept_id);
  if (!next) return `选择 ${selected.concept_id}，它是唯一概念，择优分 ${selected.selection_score}。`;
  return `选择 ${selected.concept_id}，择优分 ${selected.selection_score}，优于下一概念 ${next.concept_id} 的 ${next.selection_score}；主要优势是 prompt 匹配 ${selected.prompt_match_score}、参考证据 ${selected.reference_evidence_score}、可建造先验 ${selected.buildability_prior_score}。`;
}

function round(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}
