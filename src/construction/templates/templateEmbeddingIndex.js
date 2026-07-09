import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const EMBEDDING_INDEX_SOURCE = 'stage5-template-embedding-index-v1';
export const EMBEDDING_INDEX_SCHEMA_VERSION = 1;
const DEFAULT_DIMENSIONS = 256;

const TOKEN_ALIASES = Object.freeze({
  waterfront: 'water-edge',
  lakefront: 'water-edge',
  lakeside: 'water-edge',
  lake: 'water-edge',
  glass: 'large-glass',
  windows: 'large-glass',
  window: 'large-glass',
  villa: 'house',
  home: 'house',
  residence: 'house',
  furnished: 'interior'
});

export function buildCaseEmbeddingDocument(caseRecord = {}, labelRecord = {}) {
  const tokens = new Set();
  const parts = [];
  const add = (value, weightLabel = '') => {
    const raw = String(value || '').trim();
    if (raw) parts.push(weightLabel ? `${weightLabel}:${raw}` : raw);
    for (const token of tokenize(value)) {
      tokens.add(token);
      parts.push(weightLabel ? `${weightLabel}:${token}` : token);
    }
  };

  add(caseRecord.title, 'title');
  add(caseRecord.file, 'file');
  add(caseRecord.identity?.category, 'identity');
  add(caseRecord.identity?.typology, 'identity');
  add(caseRecord.identity?.style_family, 'identity');
  add(caseRecord.identity?.scale_bucket, 'identity');

  for (const [group, values] of Object.entries(caseRecord.tags || {})) {
    for (const tag of Array.isArray(values) ? values : []) {
      add(group, 'tag-group');
      add(tag.id || tag.label, 'tag');
    }
  }
  for (const tag of labelRecord.suggested_tags || []) {
    add(tag.group, 'suggested-tag-group');
    add(tag.id, 'suggested-tag');
  }
  for (const unit of caseRecord.knowledge_units || []) {
    add(unit.area, 'area');
    add(unit.claim, 'claim');
  }
  for (const area of labelRecord.suggested_learning_areas || []) add(area.area, 'suggested-area');
  for (const token of caseRecord.retrieval?.search_tokens || []) add(token, 'search');
  for (const token of caseRecord.retrieval?.prompt_affinities || []) add(token, 'affinity');
  for (const risk of caseRecord.risk_controls || []) add(risk, 'risk');
  for (const flag of caseRecord.review_flags || []) add(flag, 'review-flag');

  return {
    document: parts.join(' '),
    tokens: [...tokens].sort(),
    areas: [...new Set([
      ...(caseRecord.knowledge_units || []).map((unit) => normalizeToken(unit.area)),
      ...(labelRecord.suggested_learning_areas || []).map((area) => normalizeToken(area.area))
    ].filter(Boolean))].sort(),
    risk_penalty: Number(caseRecord.priority?.risk_penalty || 0)
  };
}

export function vectorizeText(text = '', { dimensions = DEFAULT_DIMENSIONS } = {}) {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (const token of tokenize(text)) {
    const bucket = hashToken(token) % dimensions;
    const sign = hashToken(`sign:${token}`) % 2 === 0 ? 1 : -1;
    vector[bucket] += sign * tokenWeight(token);
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return vector;
  return vector.map((value) => round(value / norm));
}

export function buildTemplateEmbeddingIndex({
  knowledgeBase = {},
  neuralLabels = [],
  generatedAt = stableGeneratedAt(),
  dimensions = DEFAULT_DIMENSIONS
} = {}) {
  const labelsByCase = new Map((neuralLabels || []).map((item) => [item.case_id, item]));
  const cases = (knowledgeBase.cases || []).map((caseRecord) => {
    const labelRecord = labelsByCase.get(caseRecord.case_id) || {};
    const document = buildCaseEmbeddingDocument(caseRecord, labelRecord);
    const vector = vectorizeText(document.document, { dimensions });
    return {
      case_id: caseRecord.case_id,
      title: caseRecord.title || caseRecord.case_id,
      file: caseRecord.file,
      review_status: caseRecord.review?.status || 'pending',
      document: document.document,
      tokens: document.tokens,
      vector,
      norm: 1,
      areas: document.areas,
      risk_penalty: document.risk_penalty,
      lineage: {
        case_version: caseRecord.case_version || '',
        label_record_hash: `sha256:${hashJson(labelRecord)}`
      }
    };
  });
  return {
    source: EMBEDDING_INDEX_SOURCE,
    schema_version: EMBEDDING_INDEX_SCHEMA_VERSION,
    generated_at: generatedAt,
    embedding_model: {
      provider: 'deterministic-token-vector',
      model: 'token-hash-v1',
      dimensions,
      normalized: true
    },
    inputs: {
      case_library_v2: 'mc_templates/analysis/case_library.v2.json',
      neural_labels: 'mc_templates/analysis/neural_labels.jsonl',
      tag_taxonomy: 'mc_templates/curation/tag_taxonomy.json'
    },
    case_count: cases.length,
    cases,
    warnings: []
  };
}

export function queryEmbeddingIndex({ index = {}, prompt = '', limit = 8 } = {}) {
  const dimensions = Number(index.embedding_model?.dimensions || DEFAULT_DIMENSIONS);
  const queryVector = vectorizeText(prompt, { dimensions });
  return (index.cases || [])
    .filter((item) => Array.isArray(item.vector) && item.vector.length === dimensions)
    .map((item) => ({
      case_id: item.case_id,
      title: item.title,
      embedding_score: Math.max(0, Math.round(cosine(queryVector, item.vector) * 100)),
      areas: item.areas || [],
      tokens: item.tokens || [],
      risk_penalty: Number(item.risk_penalty || 0)
    }))
    .sort((a, b) => b.embedding_score - a.embedding_score || a.title.localeCompare(b.title))
    .slice(0, clampLimit(limit));
}

export function validateEmbeddingIndex(index = {}, knowledgeBase = {}) {
  const cases = new Map((knowledgeBase.cases || []).map((item) => [item.case_id, item]));
  const validCaseIds = [];
  const staleCaseIds = [];
  const warnings = [];
  const dimensions = Number(index.embedding_model?.dimensions || 0);
  if (index.source !== EMBEDDING_INDEX_SOURCE) warnings.push('embedding index source is not stage5-template-embedding-index-v1');
  if (!dimensions) warnings.push('embedding index dimensions missing');
  for (const item of index.cases || []) {
    const current = cases.get(item.case_id);
    const vectorOk = Array.isArray(item.vector) && item.vector.length === dimensions;
    if (!current || !vectorOk || item.lineage?.case_version !== (current.case_version || '')) {
      staleCaseIds.push(item.case_id);
      continue;
    }
    validCaseIds.push(item.case_id);
  }
  if (staleCaseIds.length) warnings.push(`stale or invalid vectors: ${staleCaseIds.join(', ')}`);
  return {
    ok: warnings.length === 0 && validCaseIds.length > 0,
    validCaseIds,
    staleCaseIds,
    warnings
  };
}

export async function writeTemplateEmbeddingIndexArtifact({
  outputDir,
  knowledgeBase = {},
  neuralLabels = [],
  generatedAt = stableGeneratedAt(),
  dimensions = DEFAULT_DIMENSIONS
} = {}) {
  const index = buildTemplateEmbeddingIndex({ knowledgeBase, neuralLabels, generatedAt, dimensions });
  await fs.mkdir(outputDir, { recursive: true });
  const file = path.join(outputDir, 'embedding_index.json');
  await fs.writeFile(file, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  return { index, file };
}

function tokenize(value = '') {
  const raw = String(value || '').toLowerCase().replaceAll('_', '-');
  const base = raw
    .split(/[^\p{Letter}\p{Number}-]+/gu)
    .map((item) => normalizeToken(item))
    .filter(Boolean);
  const expanded = [];
  for (const token of base) {
    expanded.push(token);
    if (TOKEN_ALIASES[token]) expanded.push(TOKEN_ALIASES[token]);
  }
  return [...new Set(expanded)];
}

function normalizeToken(value = '') {
  return String(value || '').trim().toLowerCase().replaceAll('_', '-').replace(/^-|-$/g, '');
}

function tokenWeight(token = '') {
  if (token.includes(':identity')) return 1.4;
  if (token.includes('large-glass') || token.includes('water-edge')) return 1.3;
  if (token.length >= 8) return 1.1;
  return 1;
}

function hashToken(token) {
  const hash = crypto.createHash('sha256').update(String(token)).digest();
  return hash.readUInt32BE(0);
}

function cosine(a = [], b = []) {
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let index = 0; index < length; index += 1) sum += Number(a[index] || 0) * Number(b[index] || 0);
  return sum;
}

function hashJson(value) {
  return crypto.createHash('sha256').update(JSON.stringify(sortValue(value))).digest('hex');
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map((item) => sortValue(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function clampLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 8;
  return Math.max(1, Math.min(8, Math.trunc(number)));
}

function round(value) {
  return Math.round(Number(value || 0) * 1000000) / 1000000;
}

function stableGeneratedAt() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch !== undefined) {
    const seconds = Number(epoch);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  }
  return '2026-07-09T00:00:00.000Z';
}
