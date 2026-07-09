import { ExplainableTemplateRetriever } from './templateExplainableRetriever.js';
import { queryEmbeddingIndex, validateEmbeddingIndex } from './templateEmbeddingIndex.js';

export const NEURAL_RETRIEVER_SOURCE = 'stage5-neural-template-retriever-v1';

export class NeuralTemplateRetriever {
  constructor({ knowledgeBase, embeddingIndex, neuralLabels = [] } = {}) {
    this.knowledgeBase = knowledgeBase || {};
    this.embeddingIndex = embeddingIndex;
    this.neuralLabels = Array.isArray(neuralLabels) ? neuralLabels : [];
  }

  run({ prompt = '', context = {}, limit = 8 } = {}) {
    const rule = new ExplainableTemplateRetriever({ knowledgeBase: this.knowledgeBase }).run({ prompt, context, limit });
    if (!this.embeddingIndex) return fallback(rule, 'embedding index missing');

    const validation = validateEmbeddingIndex(this.embeddingIndex, this.knowledgeBase, this.neuralLabels);
    if (!validation.ok) return fallback(rule, validation.warnings.join('; ') || 'embedding index invalid');

    const embeddingMatches = queryEmbeddingIndex({ index: this.embeddingIndex, prompt, limit: 8 });
    const labelsByCase = new Map(this.neuralLabels.map((item) => [item.case_id, item]));
    const embeddingByCase = new Map(embeddingMatches.map((item) => [item.case_id, item]));
    const ruleByCase = new Map((rule.references || []).map((item) => [item.case_id, item]));
    const caseById = new Map((this.knowledgeBase.cases || []).map((item) => [item.case_id, item]));
    const ids = [...new Set([...ruleByCase.keys(), ...embeddingByCase.keys()])];
    const promptTokens = tokenSet(prompt, context);

    const fused = ids
      .map((caseId) => {
        const caseRecord = caseById.get(caseId) || {};
        const ruleRef = ruleByCase.get(caseId);
        const embedding = embeddingByCase.get(caseId);
        const labelRecord = labelsByCase.get(caseId) || {};
        const ruleScore = Number(ruleRef?.match_score || 0);
        const embeddingScore = Number(embedding?.embedding_score || 0);
        const tagMatchScore = scoreTagMatch(caseRecord, labelRecord, promptTokens);
        const reviewBonus = reviewBonusFor(caseRecord.review?.status);
        const diversityBonus = diversityBonusFor(caseRecord, promptTokens);
        const riskPenalty = Number(caseRecord.priority?.risk_penalty || embedding?.risk_penalty || 0);
        const matchScore = Math.max(
          0,
          Math.round(ruleScore * 0.45 + embeddingScore * 0.3 + tagMatchScore * 0.15 + reviewBonus + diversityBonus - riskPenalty)
        );
        const ref = ruleRef || explainFromCase(caseRecord, embedding);

        return {
          ...ref,
          match_score: matchScore,
          rule_score: ruleScore,
          embedding_score: embeddingScore,
          tag_match_score: tagMatchScore,
          fusion_explanation: `Neural fusion combined rule=${ruleScore}, embedding=${embeddingScore}, tag=${tagMatchScore}, review=${reviewBonus}, diversity=${diversityBonus}, risk=${riskPenalty}.`,
          matched_signals: [...new Set([...(ref.matched_signals || []), ...matchedTagSignals(caseRecord, labelRecord, promptTokens)])]
        };
      })
      .filter((item) => item.match_score > 0)
      .sort((a, b) => b.match_score - a.match_score || a.title.localeCompare(b.title))
      .slice(0, clampLimit(limit));

    if (!fused.length) return fallback(rule, 'fusion produced no references');

    return {
      source: NEURAL_RETRIEVER_SOURCE,
      active: true,
      mode: 'fusion',
      fallback_used: false,
      prompt,
      references: fused.map((item, index) => ({ ...item, rank: index + 1 })),
      warnings: rule.warnings || []
    };
  }
}

function fallback(rule, reason) {
  return {
    ...rule,
    mode: 'rule-only-fallback',
    fallback_used: true,
    warnings: [...(rule.warnings || []), reason].filter(Boolean)
  };
}

function explainFromCase(caseRecord = {}, embedding = {}) {
  const units = (caseRecord.knowledge_units || []).slice(0, 4);
  return {
    rank: 0,
    case_id: caseRecord.case_id,
    title: caseRecord.title || caseRecord.case_id,
    file: caseRecord.file,
    match_score: Number(embedding?.embedding_score || 0),
    diversity_slot: (caseRecord.retrieval?.diversity_slots || ['general'])[0],
    matched_signals: ['embedding:semantic-similarity'],
    teaches: units.length
      ? units.map((unit) => ({ area: unit.area, claim: unit.claim, confidence: unit.confidence || 0.7 }))
      : [{ area: 'risk', claim: 'Use as weak inspiration only because no knowledge units are available.', confidence: 0.3 }],
    risk_controls: caseRecord.risk_controls?.length
      ? caseRecord.risk_controls
      : ['change exact dimensions, room order, and detail placement so the result is not a block-for-block copy'],
    integration_targets: [...new Set(units.flatMap((unit) => unit.integration_targets || []))].slice(0, 8),
    explanation: `Embedding matched ${caseRecord.title || caseRecord.case_id}.`
  };
}

function scoreTagMatch(caseRecord = {}, labelRecord = {}, promptTokens = new Set()) {
  const tags = allTags(caseRecord, labelRecord);
  let score = 0;
  for (const tag of tags) {
    if (promptTokens.has(tag.id) || promptTokens.has(tag.group)) score += Math.round(Number(tag.confidence || 0.7) * 20);
  }
  return Math.min(100, score);
}

function matchedTagSignals(caseRecord = {}, labelRecord = {}, promptTokens = new Set()) {
  return allTags(caseRecord, labelRecord)
    .filter((tag) => promptTokens.has(tag.id) || promptTokens.has(tag.group))
    .map((tag) => `tag:${tag.group}:${tag.id}`);
}

function allTags(caseRecord = {}, labelRecord = {}) {
  const existing = Object.entries(caseRecord.tags || {}).flatMap(([group, values]) =>
    (Array.isArray(values) ? values : []).map((tag) => ({ group: tag.group || group, id: tag.id, confidence: tag.confidence || 0.7 }))
  );
  const suggested = (labelRecord.suggested_tags || []).map((tag) => ({ group: tag.group, id: tag.id, confidence: tag.confidence || 0.7 }));
  return [...existing, ...suggested].filter((tag) => tag.group && tag.id);
}

function tokenSet(prompt = '', context = {}) {
  const text = `${prompt} ${context.style_family || ''} ${context.style || ''} ${context.typology || ''}`.toLowerCase();
  const tokens = new Set(text.split(/[^\p{Letter}\p{Number}-]+/gu).map((item) => item.trim()).filter(Boolean));
  if (/湖|水|lake|water|waterfront|lakeside/.test(text)) tokens.add('water-edge');
  if (/glass|玻璃|window/.test(text)) tokens.add('large-glass');
  if (/interior|内饰|家具|living|bedroom|kitchen/.test(text)) tokens.add('interior');
  if (/garden|花园|庭院/.test(text)) tokens.add('garden');
  if (/roof|露台|terrace/.test(text)) tokens.add('roof');
  return tokens;
}

function reviewBonusFor(status = '') {
  if (status === 'approved') return 10;
  if (status === 'limited') return 3;
  if (status === 'rejected') return -100;
  return 0;
}

function diversityBonusFor(caseRecord = {}, promptTokens = new Set()) {
  const areas = new Set((caseRecord.knowledge_units || []).map((unit) => unit.area));
  let bonus = 0;
  if (promptTokens.has('water-edge') && areas.has('site')) bonus += 3;
  if (promptTokens.has('large-glass') && areas.has('facade')) bonus += 3;
  if (promptTokens.has('interior') && areas.has('interior')) bonus += 3;
  return bonus;
}

function clampLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 8;
  return Math.max(1, Math.min(8, Math.trunc(number)));
}
