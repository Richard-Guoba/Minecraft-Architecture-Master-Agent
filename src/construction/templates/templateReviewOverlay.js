import { DEFAULT_TAG_TAXONOMY, validateTagRecord } from './templateTagTaxonomy.js';

const VALID_STATUSES = new Set(['pending', 'approved', 'limited', 'rejected', 'research-only']);
const VALID_AREAS = new Set(['site', 'massing', 'facade', 'roof', 'space-planning', 'interior', 'materials', 'risk']);

export function parseTemplateReviewOverlay(text = '', options = {}) {
  const strict = Boolean(options.strict);
  const taxonomy = options.taxonomy || DEFAULT_TAG_TAXONOMY;
  const records = [];
  const errors = [];
  const lines = String(text || '').split(/\r?\n/u);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const raw = JSON.parse(trimmed);
      const normalized = normalizeReviewRecord(raw, taxonomy);
      records.push(normalized);
    } catch (error) {
      const message = error instanceof SyntaxError ? `invalid json: ${error.message}` : error.message;
      errors.push({ line: lineNumber, message });
      if (strict) throw new Error(`Invalid review overlay line ${lineNumber}: ${message}`);
    }
  });

  return { records, errors };
}

export function mergeReviewRecords(records = []) {
  const byCase = new Map();
  const allIds = new Map();
  for (const record of records) {
    const caseId = record.case_id;
    const ids = allIds.get(caseId) || [];
    ids.push(record.record_id);
    allIds.set(caseId, ids);
    const current = byCase.get(caseId);
    if (!current || String(record.reviewed_at || '').localeCompare(String(current.reviewed_at || '')) >= 0) {
      byCase.set(caseId, { ...record });
    }
  }
  for (const [caseId, record] of byCase.entries()) {
    byCase.set(caseId, {
      ...record,
      review_record_ids: allIds.get(caseId) || [record.record_id]
    });
  }
  return byCase;
}

export function defaultReviewForCase(caseId) {
  return {
    case_id: caseId,
    status: 'pending',
    reviewed_by: '',
    reviewed_at: '',
    confidence: 0,
    notes: '',
    approved_learning_areas: [],
    blocked_learning_areas: [],
    manual_tags: [],
    risk_overrides: [],
    review_record_ids: []
  };
}

function normalizeReviewRecord(raw = {}, taxonomy) {
  const recordId = String(raw.record_id || '').trim();
  const caseId = String(raw.case_id || '').trim();
  const status = String(raw.status || 'pending').trim();
  if (!recordId) throw new Error('review record requires record_id');
  if (!caseId) throw new Error('review record requires case_id');
  if (!VALID_STATUSES.has(status)) throw new Error(`invalid review status ${status}`);
  return {
    record_id: recordId,
    case_id: caseId,
    reviewed_by: String(raw.reviewed_by || '').trim(),
    reviewed_at: String(raw.reviewed_at || '').trim(),
    status,
    confidence: clamp01(raw.confidence === undefined ? 0 : raw.confidence),
    approved_learning_areas: normalizeAreas(raw.approved_learning_areas),
    blocked_learning_areas: normalizeAreas(raw.blocked_learning_areas),
    manual_tags: normalizeTags(raw.manual_tags, taxonomy),
    risk_overrides: Array.isArray(raw.risk_overrides) ? raw.risk_overrides.map(String).filter(Boolean) : [],
    notes: String(raw.notes || '')
  };
}

function normalizeAreas(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => String(item).trim()).filter((item) => VALID_AREAS.has(item)))].sort();
}

function normalizeTags(value, taxonomy) {
  const result = [];
  for (const tag of Array.isArray(value) ? value : []) {
    const validation = validateTagRecord(tag, taxonomy);
    if (!validation.ok) throw new Error(validation.error || 'invalid manual tag');
    result.push(validation.normalized);
  }
  return result;
}

function clamp01(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}
