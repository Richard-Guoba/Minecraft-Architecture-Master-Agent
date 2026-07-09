import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_TAG_TAXONOMY, validateTagRecord } from './templateTagTaxonomy.js';

export const NEURAL_LABEL_SOURCE = 'stage5-neural-labels-v1';
export const NEURAL_LABEL_SCHEMA_VERSION = 1;

const TAG_ALIASES = Object.freeze({
  'glass-emphasis': { group: 'facade', id: 'large-glass', confidence: 0.86 },
  'large-glass-or-panel-grid': { group: 'facade', id: 'large-glass', confidence: 0.82 },
  'landscape-composition': { group: 'site', id: 'garden', confidence: 0.8 },
  'terrain-integrated': { group: 'site', id: 'terrain-integrated', confidence: 0.86 },
  'water-edge': { group: 'site', id: 'water-edge', confidence: 0.9 },
  'waterfront-learning': { group: 'site', id: 'water-edge', confidence: 0.82 },
  'furnished-interior': { group: 'interior', id: 'furnished', confidence: 0.84 },
  'interior-rich-reference': { group: 'interior', id: 'room-layout-rich', confidence: 0.8 },
  'layered-interior': { group: 'interior', id: 'room-layout-rich', confidence: 0.74 },
  'furniture-pattern-rich': { group: 'interior', id: 'furniture-pattern-rich', confidence: 0.84 },
  'phase3-furniture-pattern-ready': { group: 'interior', id: 'furniture-pattern-rich', confidence: 0.82 },
  'vertical-circulation-reference': { group: 'interior', id: 'vertical-circulation', confidence: 0.78 },
  'library-study-reference': { group: 'interior', id: 'study-library', confidence: 0.78 },
  'facade-detail-rich': { group: 'quality', id: 'high-value-reference', confidence: 0.72 },
  'site-rich-reference': { group: 'quality', id: 'high-value-reference', confidence: 0.76 },
  'massing-usable': { group: 'quality', id: 'high-value-reference', confidence: 0.7 },
  'review-before-deep-mining': { group: 'quality', id: 'review-before-deep-mining', confidence: 0.88 },
  'exterior-only-reference': { group: 'quality', id: 'exterior-only', confidence: 0.88 },
  'micro-block-detailing': { group: 'facade', id: 'micro-depth-trim', confidence: 0.72 },
  'rail-and-fence-detail': { group: 'facade', id: 'rail-balcony', confidence: 0.7 },
  'formal-axis': { group: 'massing', id: 'balanced-axis', confidence: 0.76 },
  'vertical-icon': { group: 'massing', id: 'vertical-landmark', confidence: 0.78 }
});

const COMPOSITION_ALIASES = Object.freeze({
  large_glass_bands: { group: 'facade', id: 'large-glass', confidence: 0.88 },
  micro_depth_trim: { group: 'facade', id: 'micro-depth-trim', confidence: 0.82 },
  rail_balcony_edges: { group: 'facade', id: 'rail-balcony', confidence: 0.82 },
  lit_depth_points: { group: 'facade', id: 'lit-depth-points', confidence: 0.78 },
  formal_symmetry: { group: 'facade', id: 'formal-symmetry', confidence: 0.8 },
  terrain_plinth: { group: 'site', id: 'terrain-integrated', confidence: 0.84 },
  layered_terrain_base: { group: 'site', id: 'terrain-integrated', confidence: 0.82 },
  water_edge: { group: 'site', id: 'water-edge', confidence: 0.9 },
  waterfront_deck_massing: { group: 'site', id: 'water-edge', confidence: 0.86 },
  foreground_scene: { group: 'site', id: 'garden', confidence: 0.78 },
  garden_forecourt: { group: 'site', id: 'garden', confidence: 0.82 },
  courtyard_or_void: { group: 'massing', id: 'courtyard-or-void', confidence: 0.82 },
  compact_block: { group: 'massing', id: 'compact-block', confidence: 0.78 },
  long_bar: { group: 'massing', id: 'long-bar', confidence: 0.78 },
  balanced_axis: { group: 'massing', id: 'balanced-axis', confidence: 0.78 },
  vertical_landmark: { group: 'massing', id: 'vertical-landmark', confidence: 0.84 },
  stepped_terraces: { group: 'massing', id: 'stepped-terraces', confidence: 0.82 },
  flat_terrace_or_platform: { group: 'roof', id: 'flat-terrace', confidence: 0.82 },
  tower_cap: { group: 'roof', id: 'tower-cap', confidence: 0.78 },
  layered_eaves: { group: 'roof', id: 'layered-eaves', confidence: 0.82 },
  deep_overhang_edges: { group: 'roof', id: 'deep-overhang', confidence: 0.78 },
  stepped_roofline: { group: 'roof', id: 'stepped-roofline', confidence: 0.82 }
});

const ROOM_ALIASES = Object.freeze({
  living_or_hall: 'living',
  entry_or_lobby: 'entry-or-lobby',
  corridor_or_gallery: 'corridor-or-gallery',
  great_hall: 'chapel-or-ceremonial-hall',
  stairs_or_vertical_hall: 'corridor-or-gallery'
});

export function parseGeneratedLabelsJsonl(text = '') {
  const records = [];
  const errors = [];
  const lines = String(text || '').split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      errors.push({ line: index + 1, message: error.message });
    }
  }
  return { records, errors };
}

export function buildNeuralLabelRecords({
  knowledgeBase = {},
  generatedLabels = [],
  taxonomy = DEFAULT_TAG_TAXONOMY
} = {}) {
  const labelsByFile = mergeGeneratedLabelsByFile(generatedLabels || []);
  return (knowledgeBase.cases || []).map((caseRecord) => {
    const generated = labelsByFile.get(normalizePath(caseRecord.file)) || {};
    return buildRecord(caseRecord, generated, taxonomy);
  });
}

export async function writeNeuralLabelArtifacts({
  outputDir,
  knowledgeBase = {},
  generatedLabels = [],
  taxonomy = DEFAULT_TAG_TAXONOMY
} = {}) {
  const records = buildNeuralLabelRecords({ knowledgeBase, generatedLabels, taxonomy });
  await fs.mkdir(outputDir, { recursive: true });
  const file = path.join(outputDir, 'neural_labels.jsonl');
  await fs.writeFile(file, neuralLabelsJsonl(records), 'utf8');
  return { records, file };
}

export function neuralLabelsJsonl(records = []) {
  return `${(records || []).map((item) => JSON.stringify(item)).join('\n')}\n`;
}

function buildRecord(caseRecord = {}, generated = {}, taxonomy = DEFAULT_TAG_TAXONOMY) {
  const suggestions = [];
  const unknown = [];
  const addSuggestion = (candidate, evidence) => {
    if (!candidate?.group || !candidate?.id) {
      if (candidate?.raw) unknown.push({ raw: candidate.raw, evidence, reason: 'unmapped-alias' });
      return;
    }
    const validation = validateTagRecord({
      group: candidate.group,
      id: candidate.id,
      confidence: candidate.confidence,
      source: 'deterministic-labeler',
      evidence
    }, taxonomy);
    if (!validation.ok) {
      unknown.push({ raw: candidate.raw || `${candidate.group}:${candidate.id}`, evidence, reason: validation.error });
      return;
    }
    const tag = {
      ...validation.normalized,
      evidence: Array.isArray(evidence) ? evidence : [String(evidence || '').trim()].filter(Boolean)
    };
    const existing = suggestions.find((item) => item.group === tag.group && item.id === tag.id);
    if (!existing) {
      suggestions.push(tag);
      return;
    }
    existing.confidence = Math.max(existing.confidence, tag.confidence);
    existing.evidence = [...new Set([...existing.evidence, ...tag.evidence])];
  };

  for (const tag of existingTags(caseRecord)) addSuggestion({ group: tag.group, id: tag.id, confidence: Math.min(1, Number(tag.confidence || 0.72)) }, `existing v2 tag ${tag.group}:${tag.id}`);
  for (const raw of stringArray(generated.tags)) addAlias(raw, `labels.generated tag ${raw}`, addSuggestion, unknown);
  for (const raw of stringArray(generated.quality_tags)) addAlias(raw, `labels.generated quality tag ${raw}`, addSuggestion, unknown);
  for (const raw of stringArray(generated.learning_roles)) addLearningRole(raw, addSuggestion, unknown);
  for (const raw of caseRecord.unknown_tags || []) addAlias(raw.raw || raw.id || raw, `case unknown tag ${raw.raw || raw.id || raw}`, addSuggestion, unknown);
  for (const [group, values] of Object.entries(generated.composition_patterns || {})) {
    for (const raw of stringArray(values)) addComposition(raw, group, addSuggestion, unknown);
  }
  for (const room of stringArray(generated.room_reference_candidates)) addRoom(room, addSuggestion, unknown);

  const learningAreas = suggestedLearningAreas(caseRecord, suggestions);
  const guidance = reviewGuidance(caseRecord, suggestions, learningAreas, unknown);
  return {
    source: NEURAL_LABEL_SOURCE,
    schema_version: NEURAL_LABEL_SCHEMA_VERSION,
    case_id: caseRecord.case_id,
    file: caseRecord.file,
    title: caseRecord.title || caseRecord.case_id,
    suggested_tags: suggestions.sort(sortTags),
    suggested_learning_areas: learningAreas,
    unknown_suggestions: unknown,
    review_guidance: guidance,
    risk_notes: [
      'Model suggestions do not approve the case. Human review overlay is still required.'
    ]
  };
}

function addAlias(raw, evidence, addSuggestion, unknown) {
  const key = normalizeToken(raw);
  const mapped = TAG_ALIASES[key];
  if (mapped) addSuggestion({ ...mapped, raw }, evidence);
  else unknown.push({ raw: String(raw || ''), evidence: [evidence], reason: 'unmapped-alias' });
}

function addComposition(raw, group, addSuggestion, unknown) {
  const key = normalizeToken(raw).replaceAll('-', '_');
  const mapped = COMPOSITION_ALIASES[key];
  if (mapped) addSuggestion({ ...mapped, raw }, `composition ${group} pattern ${raw}`);
  else unknown.push({ raw: String(raw || ''), evidence: [`composition ${group} pattern ${raw}`], reason: 'unmapped-composition-pattern' });
}

function addLearningRole(raw, addSuggestion, unknown) {
  const key = normalizeToken(raw).replaceAll('-', '_');
  if (key.includes('interior')) addSuggestion({ group: 'interior', id: 'furnished', confidence: 0.76, raw }, `learning role ${raw}`);
  else if (key.includes('water_edge')) addSuggestion({ group: 'site', id: 'water-edge', confidence: 0.82, raw }, `learning role ${raw}`);
  else if (key.includes('garden')) addSuggestion({ group: 'site', id: 'garden', confidence: 0.78, raw }, `learning role ${raw}`);
  else if (key.includes('terrain')) addSuggestion({ group: 'site', id: 'terrain-integrated', confidence: 0.78, raw }, `learning role ${raw}`);
  else if (key.includes('facade')) addSuggestion({ group: 'facade', id: 'micro-depth-trim', confidence: 0.68, raw }, `learning role ${raw}`);
  else unknown.push({ raw: String(raw || ''), evidence: [`learning role ${raw}`], reason: 'unmapped-learning-role' });
}

function addRoom(raw, addSuggestion, unknown) {
  const id = ROOM_ALIASES[normalizeToken(raw).replaceAll('-', '_')] || normalizeToken(raw);
  if (!id) return;
  addSuggestion({ group: 'room_types', id, confidence: 0.72, raw }, `room reference candidate ${raw}`);
}

function suggestedLearningAreas(caseRecord = {}, suggestions = []) {
  const areas = new Map();
  for (const unit of caseRecord.knowledge_units || []) {
    const area = normalizeToken(unit.area);
    if (!area) continue;
    const existing = areas.get(area);
    const confidence = Math.max(Number(existing?.confidence || 0), Number(unit.confidence || 0.65));
    const evidence = `knowledge unit ${unit.id || 'unknown'} ${area} confidence ${Number(unit.confidence || 0.65)}`;
    if (existing) {
      existing.confidence = confidence;
      existing.evidence.push(evidence);
      continue;
    }
    areas.set(area, {
      area,
      confidence,
      evidence: [evidence]
    });
  }
  for (const tag of suggestions) {
    const area = tagGroupToArea(tag.group);
    if (!area) continue;
    const existing = areas.get(area);
    if (existing) {
      existing.confidence = Math.max(existing.confidence, tag.confidence);
      existing.evidence.push(`suggested tag ${tag.group}:${tag.id}`);
    } else {
      areas.set(area, { area, confidence: tag.confidence, evidence: [`suggested tag ${tag.group}:${tag.id}`] });
    }
  }
  return [...areas.values()]
    .map((item) => ({ ...item, confidence: round01(item.confidence), evidence: [...new Set(item.evidence)] }))
    .sort((a, b) => a.area.localeCompare(b.area));
}

function reviewGuidance(caseRecord = {}, suggestions = [], learningAreas = [], unknown = []) {
  const safeAreas = learningAreas
    .filter((item) => item.confidence >= 0.72 && item.area !== 'risk')
    .map((item) => item.area)
    .sort();
  const reviewSignals = caseRecord.review_priority_signals || [];
  const needsHumanReview = caseRecord.review?.status === 'pending' || unknown.length > 0 || reviewSignals.length > 0;
  const suggestedStatus = safeAreas.length >= 2 ? 'limited' : 'pending';
  const blockedLearningAreas = resolveBlockedLearningAreas(caseRecord);
  return {
    suggested_status: suggestedStatus,
    approved_learning_areas: safeAreas,
    blocked_learning_areas: blockedLearningAreas,
    needs_human_review: needsHumanReview,
    review_priority: unknown.length || Number(caseRecord.priority?.global_score || 0) >= 80 ? 'high' : 'normal',
    reason: needsHumanReview
      ? 'pending or ambiguous case with Stage 5 label suggestions'
      : 'case has enough deterministic evidence for low-priority review'
  };
}

function resolveBlockedLearningAreas(caseRecord = {}) {
  const blocked = new Set(Array.isArray(caseRecord.review?.blocked_learning_areas) ? caseRecord.review.blocked_learning_areas : []);
  const riskSignals = []
    .concat(caseRecord.review_priority_signals || [])
    .concat(caseRecord.risk_controls || [])
    .concat(caseRecord.review?.review_signals || [])
    .map((item) => String(item || '').toLowerCase());

  for (const signal of riskSignals) {
    if (signal.includes('arena-not-for-room-mining') || signal.includes('non-residential-interior-noise') || signal.includes('exterior-only-reference')) {
      blocked.add('interior');
    }
  }
  return [...blocked].filter(Boolean).sort();
}

function mergeGeneratedLabelsByFile(records = []) {
  const map = new Map();
  for (const item of records) {
    const key = normalizePath(item?.file);
    if (!key) continue;
    const current = map.get(key);
    if (!current) {
      map.set(key, cloneGeneratedRecord(item));
      continue;
    }
    map.set(key, mergeGeneratedRecords(current, item));
  }
  return map;
}

function mergeGeneratedRecords(base = {}, next = {}) {
  return {
    ...base,
    ...next,
    tags: [...stringArray(base.tags), ...stringArray(next.tags)],
    quality_tags: [...stringArray(base.quality_tags), ...stringArray(next.quality_tags)],
    learning_roles: [...stringArray(base.learning_roles), ...stringArray(next.learning_roles)],
    room_reference_candidates: [...stringArray(base.room_reference_candidates), ...stringArray(next.room_reference_candidates)],
    composition_patterns: mergeCompositionPatterns(base.composition_patterns, next.composition_patterns),
    unknown_tags: [...concatArrayValues(base.unknown_tags), ...concatArrayValues(next.unknown_tags)],
    file: base.file || next.file
  };
}

function mergeCompositionPatterns(base = {}, next = {}) {
  const result = { ...(base || {}) };
  for (const [group, values] of Object.entries(next || {})) {
    const prior = Array.isArray(result[group]) ? result[group] : [];
    result[group] = [...prior, ...stringArray(values)];
  }
  return result;
}

function cloneGeneratedRecord(item = {}) {
  const safe = item || {};
  return {
    ...safe,
    tags: stringArray(safe.tags),
    quality_tags: stringArray(safe.quality_tags),
    learning_roles: stringArray(safe.learning_roles),
    room_reference_candidates: stringArray(safe.room_reference_candidates),
    composition_patterns: normalizeCompositionPatterns(safe.composition_patterns),
    unknown_tags: concatArrayValues(safe.unknown_tags)
  };
}

function concatArrayValues(value) {
  if (Array.isArray(value)) return value.flatMap((item) => concatArrayValues(item));
  if (value === undefined || value === null) return [];
  return [value];
}

function normalizeCompositionPatterns(value = {}) {
  const out = {};
  for (const [group, patterns] of Object.entries(value || {})) {
    out[group] = stringArray(patterns);
  }
  return out;
}

function existingTags(caseRecord = {}) {
  return Object.entries(caseRecord.tags || {}).flatMap(([group, values]) =>
    (Array.isArray(values) ? values : []).map((tag) => ({ ...tag, group: tag.group || group }))
  );
}

function tagGroupToArea(group) {
  if (['site', 'massing', 'facade', 'interior', 'roof'].includes(group)) return group;
  if (group === 'room_types') return 'interior';
  return '';
}

function stringArray(value) {
  if (Array.isArray(value)) return value.flatMap((item) => stringArray(item));
  if (value === undefined || value === null) return [];
  return [String(value).trim()].filter(Boolean);
}

function normalizePath(value = '') {
  return String(value || '').replaceAll('\\', '/').toLowerCase();
}

function normalizeToken(value = '') {
  return String(value || '').trim().toLowerCase().replaceAll('_', '-');
}

function sortTags(a, b) {
  return a.group.localeCompare(b.group) || a.id.localeCompare(b.id);
}

function round01(value) {
  return Math.round(Math.max(0, Math.min(1, Number(value || 0))) * 100) / 100;
}
