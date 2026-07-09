const SOURCE = 'template-explainable-retriever-v1';
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 12;
const MIN_LIMIT = 1;

const PROMPT_HINTS = Object.freeze([
  ['modern', ['modern', '现代']],
  ['house', ['house', '住宅', '别墅', 'villa', 'home']],
  ['waterfront', ['waterfront', 'lakefront', 'lakeside', '湖边', '水边', '滨水']],
  ['water-edge', ['water-edge', 'water edge', '湖边', '水边', '滨水', 'waterfront', 'lakefront', 'lakeside']],
  ['large-glass', ['large-glass', 'large glass', 'glass wall', '玻璃', '大玻璃', '落地窗']],
  ['interior', ['interior', 'inside', '室内', '内饰', '家具', '客厅', '卧室', '厨房']],
  ['furnished', ['furnished', '家具', '精致内饰', '内饰', '客厅', '卧室', '厨房']],
  ['roof', ['roof', '屋顶']],
  ['terrace', ['terrace', '露台', '平台', 'deck']],
  ['living', ['living', '客厅']],
  ['kitchen', ['kitchen', '厨房']],
  ['bedroom', ['bedroom', '卧室']],
  ['terrain', ['terrain', '地形', '山体', 'plinth']]
]);

const TOKEN_ALIASES = Object.freeze({
  waterfront: 'water-edge',
  lakefront: 'water-edge',
  lakeside: 'water-edge',
  villa: 'house',
  home: 'house',
  residential: 'house',
  residence: 'house',
  glass: 'large-glass',
  furnished: 'interior',
  inside: 'interior',
  rooms: 'interior',
  room: 'interior',
  deck: 'terrace',
  rooftop: 'roof'
});

export class ExplainableTemplateRetriever {
  constructor({ knowledgeBase } = {}) {
    this.knowledgeBase = knowledgeBase || {};
  }

  run({ prompt = '', context = {}, limit = DEFAULT_LIMIT } = {}) {
    const cases = Array.isArray(this.knowledgeBase.cases) ? this.knowledgeBase.cases : [];
    if (!cases.length) return inactive('case library v2 not found or empty', prompt);

    const normalizedLimit = clampLimit(limit);
    const promptTokens = tokenSet(prompt, context);
    const scored = cases
      .filter((item) => item?.review?.status !== 'rejected')
      .map((item) => scoreCase(item, promptTokens, context))
      .filter((item) => item.match_score > 0)
      .sort((a, b) => b.match_score - a.match_score || a.title.localeCompare(b.title));

    const selected = selectDiverse(scored, normalizedLimit);
    const backfilled = backfillIfNeeded(selected, scored, normalizedLimit);

    return {
      source: SOURCE,
      active: backfilled.length > 0,
      prompt,
      references: backfilled.map((item, index) => explainReference(item, index + 1, promptTokens, context)),
      warnings: warningsFor(backfilled, scored)
    };
  }
}

function inactive(reason, prompt) {
  return { source: SOURCE, active: false, prompt, references: [], warnings: [reason] };
}

function scoreCase(item, promptTokens, context) {
  const retrievalTokens = [
    ...(item.retrieval?.search_tokens || []),
    ...(item.retrieval?.prompt_affinities || []),
    ...(item.retrieval?.explanation_seeds || [])
  ].flatMap((entry) => splitNormalized(entry));
  const tokens = new Set(retrievalTokens.map(expandToken).flat());
  const matched = [...promptTokens].filter((token) => tokens.has(token) || tokens.has(aliasToken(token)));
  const style = normalizeToken(context.style_family || context.style || '');
  const typology = normalizeToken(context.typology || '');
  const styleScore = style && normalizeToken(item.identity?.style_family) === style ? 18 : 0;
  const typologyScore = typology && normalizeToken(item.identity?.typology) === typology ? 14 : 0;
  const unitScore = Math.min(24, (item.knowledge_units || []).length * 4);
  const reviewBonus = item.review?.status === 'approved' ? 14 : item.review?.status === 'limited' ? 4 : 0;
  const riskPenalty = Number(item.priority?.risk_penalty || 0);
  const baseScore = Number(item.priority?.global_score || 0) * 0.18;

  return {
    ...item,
    match_score: Math.max(0, Math.round(matched.length * 8 + styleScore + typologyScore + unitScore + reviewBonus + baseScore - riskPenalty)),
    matched_signals: matched.map((token) => `token:${token}`)
  };
}

function explainReference(item, rank, promptTokens, context) {
  const safeUnits = safeKnowledgeUnits(item, promptTokens, context);
  const teaches = safeUnits
    .slice(0, 4)
    .map((unit) => ({ area: unit.area, claim: unit.claim, confidence: unit.confidence }));
  const targets = [...new Set(safeUnits.flatMap((unit) => unit.integration_targets || []))].slice(0, 8);

  return {
    rank,
    case_id: item.case_id,
    title: item.title,
    file: item.file,
    match_score: item.match_score,
    diversity_slot: diversitySlot(item),
    matched_signals: item.matched_signals,
    teaches: teaches.length
      ? teaches
      : [{ area: 'risk', claim: 'Use only as a weak general reference because no safe knowledge units matched.', confidence: 0.3 }],
    risk_controls: item.risk_controls?.length
      ? item.risk_controls
      : ['change exact dimensions, room order, and detail placement so the result is not a block-for-block copy'],
    integration_targets: targets.length ? targets : ['TemplateKnowledgeAgent'],
    explanation: `${item.match_score >= 45 ? 'Matches' : 'Backfilled'} ${[item.identity?.style_family, item.identity?.typology, ...(item.retrieval?.explanation_seeds || [])].filter(Boolean).join(', ')}. Best used for ${teaches.map((unit) => unit.area).join(', ') || 'risk-controlled inspiration'}.`
  };
}

function safeKnowledgeUnits(item = {}, promptTokens, context = {}) {
  const review = item.review || {};
  const allowedAreas = allowedLearningAreas(review);
  const blockedAreas = blockedLearningAreas(review);
  const residentialInterior = wantsResidentialInterior(promptTokens, context);

  return (item.knowledge_units || []).filter((unit) => {
    const area = normalizeToken(unit?.area);
    if (!area) return false;
    if (blockedAreas.has(area)) return false;
    if (allowedAreas && !allowedAreas.has(area)) return false;
    if (residentialInterior && item.identity?.typology === 'arena' && area === 'interior') return false;
    return true;
  });
}

function tokenSet(prompt = '', context = {}) {
  const tokens = new Set();
  for (const token of splitNormalized(prompt)) {
    for (const expanded of expandToken(token)) tokens.add(expanded);
  }

  const text = String(prompt || '').toLowerCase();
  for (const [token, hints] of PROMPT_HINTS) {
    if (hints.some((hint) => text.includes(String(hint).toLowerCase()))) tokens.add(token);
  }

  for (const raw of [context.style_family, context.style, context.typology]) {
    const token = normalizeToken(raw);
    if (!token) continue;
    for (const expanded of expandToken(token)) tokens.add(expanded);
  }

  return tokens;
}

function normalizeToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll('_', '-')
    .replace(/[^\p{Letter}\p{Number}-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function aliasToken(token = '') {
  return TOKEN_ALIASES[token] || token;
}

function splitNormalized(value = '') {
  const normalized = String(value || '')
    .toLowerCase()
    .replaceAll('_', '-');
  return normalized
    .split(/[^\p{Letter}\p{Number}-]+/gu)
    .map((item) => normalizeToken(item))
    .filter(Boolean);
}

function expandToken(token = '') {
  const normalized = normalizeToken(token);
  if (!normalized) return [];
  const alias = aliasToken(normalized);
  return alias === normalized ? [normalized] : [normalized, alias];
}

function selectDiverse(scored = [], limit = DEFAULT_LIMIT) {
  const chosen = [];
  const used = new Set();
  const slotHits = new Set();

  for (const item of scored) {
    if (chosen.length >= limit) break;
    const slot = diversitySlot(item);
    if (slot !== 'general' && slotHits.has(slot)) continue;
    chosen.push(item);
    used.add(item.case_id);
    slotHits.add(slot);
  }

  if (chosen.length >= limit) return chosen;
  return backfillIfNeeded(chosen, scored, limit, used);
}

function backfillIfNeeded(selected = [], scored = [], limit = DEFAULT_LIMIT, used = new Set(selected.map((item) => item.case_id))) {
  const result = [...selected];
  for (const item of scored) {
    if (result.length >= limit) break;
    if (used.has(item.case_id)) continue;
    result.push(item);
    used.add(item.case_id);
  }
  return result.slice(0, limit);
}

function warningsFor(selected = [], scored = []) {
  const warnings = [];
  if (!scored.length) warnings.push('no explainable references matched the prompt');
  if (scored.length > selected.length) warnings.push(`truncated ${scored.length - selected.length} lower-ranked references`);
  return warnings;
}

function wantsResidentialInterior(promptTokens, context = {}) {
  const residential = promptTokens.has('house') || normalizeToken(context.typology || '') === 'house';
  const interior = ['interior', 'furnished', 'living', 'kitchen', 'bedroom'].some((token) => promptTokens.has(token));
  return residential && interior;
}

function allowedLearningAreas(review = {}) {
  if (review.status !== 'limited') return null;
  return learningAreaSet(review.approved_learning_areas || []);
}

function blockedLearningAreas(review = {}) {
  return learningAreaSet(review.blocked_learning_areas || []);
}

function learningAreaSet(areas = []) {
  return new Set((Array.isArray(areas) ? areas : []).map((area) => normalizeToken(area)).filter(Boolean));
}

function diversitySlot(item = {}) {
  const slots = item.retrieval?.diversity_slots;
  if (Array.isArray(slots) && slots.length) return normalizeToken(slots[0]) || 'general';
  if (slots && typeof slots === 'object') {
    const best = Object.entries(slots)
      .filter(([, weight]) => Number(weight) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))[0];
    if (best) return normalizeToken(best[0]) || 'general';
  }
  return normalizeToken(item.identity?.typology) || 'general';
}

function clampLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_LIMIT;
  return Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, Math.trunc(number)));
}
