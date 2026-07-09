import fs from 'node:fs/promises';
import path from 'node:path';

export const PATCH_DATASET_SOURCE = 'stage6-semantic-voxel-patch-dataset-v1';
export const PATCH_DATASET_SCHEMA_VERSION = 1;
export const PATCH_CATEGORIES = Object.freeze(['courtyard', 'facade', 'interior', 'roof']);

const CATEGORY_AREAS = Object.freeze({
  courtyard: 'site',
  facade: 'facade',
  interior: 'interior',
  roof: 'roof'
});

const CATEGORY_DIMENSIONS = Object.freeze({
  courtyard: Object.freeze({ width: 5, height: 3, depth: 5 }),
  facade: Object.freeze({ width: 5, height: 5, depth: 2 }),
  interior: Object.freeze({ width: 5, height: 4, depth: 5 }),
  roof: Object.freeze({ width: 5, height: 2, depth: 5 })
});

const CATEGORY_ANCHORS = Object.freeze({
  courtyard: 'site-courtyard',
  facade: 'facade-plane',
  interior: 'room-corner',
  roof: 'roof-surface'
});

const CATEGORY_TAG_GROUPS = Object.freeze({
  courtyard: ['site'],
  facade: ['facade'],
  interior: ['interior', 'room_types'],
  roof: ['roof']
});

const CATEGORY_KEYWORDS = Object.freeze({
  courtyard: ['courtyard', 'garden', 'water-edge', 'waterfront', 'site'],
  facade: ['facade', 'large-glass', 'glass', 'trim', 'balcony'],
  interior: ['interior', 'furnished', 'furniture', 'room-layout', 'living'],
  roof: ['roof', 'terrace', 'eaves', 'flat-terrace', 'overhang']
});

export function buildSemanticVoxelPatchDataset({
  knowledgeBase = {},
  neuralLabels = [],
  generatedAt = stableGeneratedAt()
} = {}) {
  const labelsByCase = new Map((neuralLabels || []).map((item) => [item.case_id, item]));
  const patchesById = new Map();

  for (const caseRecord of knowledgeBase.cases || []) {
    if (caseRecord.review?.status === 'rejected') continue;
    const labelRecord = labelsByCase.get(caseRecord.case_id) || {};
    for (const category of PATCH_CATEGORIES) {
      if (!caseSupportsCategory(caseRecord, labelRecord, category)) continue;
      const patch = buildPatch(caseRecord, labelRecord, category);
      if (patch && !patchesById.has(patch.patch_id)) patchesById.set(patch.patch_id, patch);
    }
  }

  const patches = [...patchesById.values()].sort(comparePatch);
  return {
    source: PATCH_DATASET_SOURCE,
    schema_version: PATCH_DATASET_SCHEMA_VERSION,
    generated_at: generatedAt,
    patch_count: patches.length,
    categories: PATCH_CATEGORIES,
    patches
  };
}

export function semanticPatchDatasetJsonl(dataset = {}) {
  return `${(dataset.patches || []).map((patch) => JSON.stringify(patch)).join('\n')}\n`;
}

export function renderSemanticPatchDatasetReport(dataset = {}) {
  const patches = dataset.patches || [];
  const categoryCounts = countBy(patches, (patch) => patch.category);
  const tagCounts = countTags(patches);
  const riskSummary = summarizePatchRisks(patches);
  const categoryRows = PATCH_CATEGORIES.map((category) => {
    const examples = patches
      .filter((patch) => patch.category === category)
      .slice(0, 3)
      .map((patch) => patch.patch_id)
      .join('<br>') || '-';
    return `| ${category} | ${categoryCounts[category] || 0} | ${examples} |`;
  }).join('\n');
  const tagRows = tagCounts.slice(0, 12)
    .map((item) => `| ${item.tag} | ${item.count} |`)
    .join('\n') || '| - | 0 |';
  const riskRows = [
    ['copy-control', riskSummary.copy_control],
    ['review-gated', riskSummary.review_gated],
    ['research-or-reject', riskSummary.research_or_reject]
  ].map(([label, count]) => `| ${label} | ${count} |`).join('\n');
  const examples = patches.slice(0, 10)
    .map((patch) => `- ${patch.patch_id}: ${patch.title}; tags=${(patch.tags || []).slice(0, 6).join(', ') || '-'}; risk=${(patch.risk_controls || []).slice(0, 1).join('; ') || '-'}`)
    .join('\n') || '- none';

  return `# Stage 6 Semantic Patch Report

Generated: ${dataset.generated_at || ''}

- Total patches: ${Number(dataset.patch_count || 0)}
- Categories: ${(dataset.categories || PATCH_CATEGORIES).join(', ')}
- Schema: ${dataset.source || PATCH_DATASET_SOURCE} v${dataset.schema_version || PATCH_DATASET_SCHEMA_VERSION}

## Category Coverage

| Category | Count | Examples |
| --- | ---: | --- |
${categoryRows}

## Top Tags

| Tag | Count |
| --- | ---: |
${tagRows}

## Risk Summary

| Risk Signal | Count |
| --- | ---: |
${riskRows}

## Representative Patches

${examples}
`;
}

export async function writeSemanticVoxelPatchDatasetArtifact({
  outputDir,
  knowledgeBase = {},
  neuralLabels = [],
  generatedAt = stableGeneratedAt()
} = {}) {
  const dataset = buildSemanticVoxelPatchDataset({ knowledgeBase, neuralLabels, generatedAt });
  await fs.mkdir(outputDir, { recursive: true });
  const datasetFile = path.join(outputDir, 'semantic_patch_dataset.json');
  const jsonlFile = path.join(outputDir, 'semantic_patch_dataset.jsonl');
  const reportFile = path.join(outputDir, 'semantic_patch_report.md');
  await fs.writeFile(datasetFile, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  await fs.writeFile(jsonlFile, semanticPatchDatasetJsonl(dataset), 'utf8');
  await fs.writeFile(reportFile, renderSemanticPatchDatasetReport(dataset), 'utf8');
  return { dataset, datasetFile, jsonlFile, reportFile };
}

function buildPatch(caseRecord = {}, labelRecord = {}, category = '') {
  const tags = collectTags(caseRecord, labelRecord);
  const categoryTags = tagsForCategory(tags, category);
  const primaryTag = primaryPatchTag(category, categoryTags);
  const dimensions = { ...CATEGORY_DIMENSIONS[category] };
  const evidence = categoryEvidence(caseRecord, labelRecord, category);
  const semanticVoxels = semanticVoxelsForCategory(category, evidence, confidenceForCategory(caseRecord, labelRecord, category));
  return {
    patch_id: `${caseRecord.case_id}:${category}:${primaryTag}`,
    case_id: caseRecord.case_id,
    case_version: caseRecord.case_version || '',
    category,
    title: `${caseRecord.title || caseRecord.case_id} ${category} patch`,
    file: caseRecord.file || '',
    style_family: caseRecord.identity?.style_family || 'general',
    typology: caseRecord.identity?.typology || 'building',
    tags: [...new Set([...categoryTags, ...crossContextTags(tags)])].sort(),
    dimensions,
    anchor: CATEGORY_ANCHORS[category],
    semantic_voxels: semanticVoxels,
    risk_controls: safeRiskControls(caseRecord)
  };
}

function caseSupportsCategory(caseRecord = {}, labelRecord = {}, category = '') {
  const area = CATEGORY_AREAS[category];
  if (!area || !reviewAllowsArea(caseRecord.review || {}, area)) return false;
  const tags = collectTags(caseRecord, labelRecord);
  if (tagsForCategory(tags, category).length) return true;
  if ((caseRecord.knowledge_units || []).some((unit) => normalizeToken(unit.area) === area)) return true;
  if ((labelRecord.suggested_learning_areas || []).some((item) => normalizeToken(item.area) === area)) return true;
  const haystack = [
    caseRecord.title,
    ...(caseRecord.retrieval?.search_tokens || []),
    ...(caseRecord.retrieval?.prompt_affinities || []),
    ...(caseRecord.knowledge_units || []).map((unit) => unit.claim)
  ].join(' ').toLowerCase();
  return CATEGORY_KEYWORDS[category].some((token) => haystack.includes(token));
}

function reviewAllowsArea(review = {}, area = '') {
  const blocked = new Set((review.blocked_learning_areas || []).map((item) => normalizeToken(item)));
  if (blocked.has(area)) return false;
  if (review.status !== 'limited') return true;
  const allowed = new Set((review.approved_learning_areas || []).map((item) => normalizeToken(item)));
  return allowed.has(area);
}

function collectTags(caseRecord = {}, labelRecord = {}) {
  const tags = [];
  for (const [group, values] of Object.entries(caseRecord.tags || {})) {
    for (const tag of Array.isArray(values) ? values : []) {
      const id = normalizeToken(tag.id || tag.label);
      if (group && id) tags.push({ group, id, confidence: Number(tag.confidence || 0.72) });
    }
  }
  for (const tag of labelRecord.suggested_tags || []) {
    const group = String(tag.group || '').trim();
    const id = normalizeToken(tag.id);
    if (group && id) tags.push({ group, id, confidence: Number(tag.confidence || 0.72) });
  }
  return dedupeTags(tags);
}

function tagsForCategory(tags = [], category = '') {
  const groups = new Set(CATEGORY_TAG_GROUPS[category] || []);
  return tags
    .filter((tag) => groups.has(tag.group))
    .map((tag) => tag.id)
    .sort();
}

function crossContextTags(tags = []) {
  const groups = new Set(['site', 'style', 'typology']);
  return tags
    .filter((tag) => groups.has(tag.group))
    .map((tag) => tag.id)
    .sort();
}

function primaryPatchTag(category = '', tags = []) {
  if (tags.length) return tags[0];
  const fallback = {
    courtyard: 'courtyard',
    facade: 'facade-rhythm',
    interior: 'room-composition',
    roof: 'roof-profile'
  };
  return fallback[category] || 'general';
}

function categoryEvidence(caseRecord = {}, labelRecord = {}, category = '') {
  const area = CATEGORY_AREAS[category];
  const evidence = [];
  for (const unit of caseRecord.knowledge_units || []) {
    if (normalizeToken(unit.area) === area) evidence.push(unit.claim || unit.evidence?.[0] || `${area} knowledge unit`);
  }
  for (const tag of collectTags(caseRecord, labelRecord)) {
    if ((CATEGORY_TAG_GROUPS[category] || []).includes(tag.group)) evidence.push(`tag ${tag.group}:${tag.id}`);
  }
  for (const item of labelRecord.suggested_learning_areas || []) {
    if (normalizeToken(item.area) === area) evidence.push(`suggested learning area ${area}`);
  }
  return [...new Set(evidence.filter(Boolean))].slice(0, 6);
}

function confidenceForCategory(caseRecord = {}, labelRecord = {}, category = '') {
  const area = CATEGORY_AREAS[category];
  const values = [];
  for (const unit of caseRecord.knowledge_units || []) {
    if (normalizeToken(unit.area) === area) values.push(Number(unit.confidence || 0.7));
  }
  for (const tag of collectTags(caseRecord, labelRecord)) {
    if ((CATEGORY_TAG_GROUPS[category] || []).includes(tag.group)) values.push(Number(tag.confidence || 0.72));
  }
  for (const item of labelRecord.suggested_learning_areas || []) {
    if (normalizeToken(item.area) === area) values.push(Number(item.confidence || 0.72));
  }
  if (!values.length) return 0.7;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function semanticVoxelsForCategory(category = '', evidence = [], confidence = 0.7) {
  const safeEvidence = evidence.length ? evidence : [`${category} semantic signal`];
  const voxel = (x, y, z, role, materialRole, occupancy, factor = 1) => ({
    x,
    y,
    z,
    role,
    material_role: materialRole,
    occupancy,
    confidence: round(confidence * factor),
    evidence: safeEvidence
  });
  if (category === 'facade') {
    return [
      voxel(0, 0, 0, 'structural-frame', 'primary-wall', 'solid', 0.9),
      voxel(2, 2, 0, 'view-glass', 'transparent', 'replaceable', 1),
      voxel(2, 3, 0, 'view-glass', 'transparent', 'replaceable', 0.95),
      voxel(4, 1, 0, 'shadow-trim', 'accent-trim', 'solid', 0.78)
    ];
  }
  if (category === 'roof') {
    return [
      voxel(2, 0, 2, 'roof-surface', 'roof-primary', 'solid', 1),
      voxel(0, 1, 2, 'guarded-edge', 'safety-trim', 'solid', 0.82),
      voxel(2, 1, 2, 'terrace-clearance', 'open-air', 'air', 0.76)
    ];
  }
  if (category === 'interior') {
    return [
      voxel(0, 1, 2, 'focal-wall', 'interior-accent', 'solid', 0.86),
      voxel(2, 0, 2, 'seating-cluster', 'furniture', 'furniture', 1),
      voxel(2, 1, 2, 'circulation-air', 'open-air', 'air', 0.9),
      voxel(3, 2, 1, 'warm-light', 'lighting', 'replaceable', 0.78)
    ];
  }
  return [
    voxel(2, 0, 2, 'garden-planting', 'planting', 'planting', 1),
    voxel(1, 0, 2, 'path-clearance', 'open-air', 'air', 0.9),
    voxel(3, 0, 2, 'water-or-gravel-edge', 'site-accent', 'replaceable', 0.78)
  ];
}

function safeRiskControls(caseRecord = {}) {
  const controls = (caseRecord.risk_controls || []).map((item) => String(item || '').trim()).filter(Boolean);
  if (controls.length) return [...new Set(controls)];
  return ['change exact dimensions and detail placement; do not copy block-for-block'];
}

function dedupeTags(tags = []) {
  const seen = new Set();
  const result = [];
  for (const tag of tags) {
    const key = `${tag.group}:${tag.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

function countBy(items = [], keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function countTags(patches = []) {
  const counts = countBy(
    patches.flatMap((patch) => patch.tags || []),
    (tag) => tag
  );
  return Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || compareString(a.tag, b.tag));
}

function summarizePatchRisks(patches = []) {
  const summary = {
    copy_control: 0,
    review_gated: 0,
    research_or_reject: 0
  };
  for (const patch of patches) {
    const text = (patch.risk_controls || []).join(' ').toLowerCase();
    if (/copy|block-for-block|exact/.test(text)) summary.copy_control += 1;
    if (/review|reviewed|limited/.test(text)) summary.review_gated += 1;
    if (/research-only|rejected|do not use/.test(text)) summary.research_or_reject += 1;
  }
  return summary;
}

function comparePatch(a = {}, b = {}) {
  return compareString(a.category, b.category)
    || compareString(a.case_id, b.case_id)
    || compareString(a.patch_id, b.patch_id);
}

function compareString(left = '', right = '') {
  const a = String(left || '');
  const b = String(right || '');
  if (a === b) return 0;
  return a < b ? -1 : 1;
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

function round(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function stableGeneratedAt() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch !== undefined) {
    const seconds = Number(epoch);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  }
  return '2026-07-09T00:00:00.000Z';
}
