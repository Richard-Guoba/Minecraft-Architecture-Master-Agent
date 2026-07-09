import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_TAG_TAXONOMY, validateTagRecord } from './templateTagTaxonomy.js';
import { defaultReviewForCase } from './templateReviewOverlay.js';

const SOURCE = 'template-knowledge-base-v2';
const SCHEMA_VERSION = 2;
const RETRIEVAL_SOURCE = 'template-retrieval-index-v2';

const TAG_ALIASES = Object.freeze({
  'terrain-integrated': { group: 'site', id: 'terrain-integrated' },
  'water-edge': { group: 'site', id: 'water-edge' },
  'landscape-composition': { group: 'site', id: 'garden' },
  'glass-emphasis': { group: 'facade', id: 'large-glass' },
  'furnished-interior': { group: 'interior', id: 'furnished' },
  'site-rich-reference': { group: 'quality', id: 'high-value-reference' },
  'interior-rich-reference': { group: 'quality', id: 'high-value-reference' },
  'review-before-deep-mining': { group: 'quality', id: 'review-before-deep-mining' }
});

export function buildTemplateKnowledgeBaseV2({
  generatedAt = new Date().toISOString(),
  caseLibrary = {},
  templateIndex = {},
  designLawBook = {},
  reviewOverlay = new Map(),
  inputs = {}
} = {}) {
  const cases = (caseLibrary.cases || []).map((card) =>
    buildCaseV2(card, reviewOverlay.get(card.case_id) || defaultReviewForCase(card.case_id))
  );
  const summary = summarizeCases(cases, caseLibrary, templateIndex);
  const base = {
    source: SOURCE,
    schema_version: SCHEMA_VERSION,
    generated_at: generatedAt,
    knowledge_base_id: '',
    inputs: {
      case_library: inputs.case_library || 'mc_templates/analysis/case_library.json',
      template_index: inputs.template_index || 'mc_templates/analysis/template_index.json',
      design_laws: inputs.design_laws || 'mc_templates/analysis/design_laws.json',
      review_overlay: inputs.review_overlay || 'mc_templates/curation/template_reviews.jsonl',
      tag_taxonomy: inputs.tag_taxonomy || 'mc_templates/curation/tag_taxonomy.json'
    },
    summary,
    cases,
    design_law_source: designLawBook.source || ''
  };
  base.knowledge_base_id = `sha256:${hashJson({ cases, summary, inputs: base.inputs })}`;
  return base;
}

export function buildTemplateRetrievalIndexV2(knowledgeBase = {}) {
  const tokenToCases = {};
  const areaToCases = {};
  for (const item of knowledgeBase.cases || []) {
    for (const token of item.retrieval?.search_tokens || []) {
      addIndex(tokenToCases, token, item.case_id);
    }
    for (const unit of item.knowledge_units || []) {
      addIndex(areaToCases, unit.area, item.case_id);
    }
  }
  return {
    source: RETRIEVAL_SOURCE,
    schema_version: SCHEMA_VERSION,
    case_count: (knowledgeBase.cases || []).length,
    token_count: Object.keys(tokenToCases).length,
    token_to_cases: sortIndex(tokenToCases),
    area_to_cases: sortIndex(areaToCases),
    cases: (knowledgeBase.cases || []).map((item) => ({
      case_id: item.case_id,
      title: item.title,
      file: item.file,
      score: item.priority.global_score,
      review_status: item.review.status,
      tokens: item.retrieval.search_tokens,
      areas: [...new Set((item.knowledge_units || []).map((unit) => unit.area))].sort(),
      risk_controls: item.risk_controls
    }))
  };
}

export function renderTemplatePriorityReport(knowledgeBase = {}) {
  const rows = [...(knowledgeBase.cases || [])]
    .sort((a, b) => b.priority.global_score - a.priority.global_score || a.title.localeCompare(b.title))
    .map((item, index) => `| ${index + 1} | ${item.title} | ${item.identity.style_family} | ${item.identity.typology} | ${item.review.status} | ${item.priority.global_score} | ${Object.keys(item.priority.area_scores).join(', ')} | ${(item.priority.high_value_rank_reason || []).join('; ')} |`)
    .join('\n');
  return `# Template Priority Report\n\nGenerated: ${knowledgeBase.generated_at || ''}\n\n| Rank | Case | Style | Typology | Review | Score | Areas | Reason |\n| --- | --- | --- | --- | --- | ---: | --- | --- |\n${rows || '| - | none | - | - | - | 0 | - | - |'}\n`;
}

export function renderTemplateReviewQueue(knowledgeBase = {}) {
  const rows = [...(knowledgeBase.cases || [])]
    .filter((item) => item.review.status === 'pending' || item.review.status === 'limited' || item.review_flags?.length)
    .sort((a, b) => b.priority.risk_penalty - a.priority.risk_penalty || b.priority.global_score - a.priority.global_score)
    .map((item, index) => `| ${index + 1} | ${item.title} | ${item.review.status} | ${item.priority.global_score} | ${(item.review_flags || []).join(', ') || '-'} | ${(item.risk_controls || []).slice(0, 2).join('; ')} |`)
    .join('\n');
  return `# Template Review Queue\n\nGenerated: ${knowledgeBase.generated_at || ''}\n\n| Rank | Case | Review | Score | Flags | Risk Controls |\n| --- | --- | --- | ---: | --- | --- |\n${rows || '| - | none | - | 0 | - | - |'}\n`;
}

export async function writeTemplateKnowledgeBaseV2Artifacts({
  outputDir,
  generatedAt,
  caseLibrary,
  templateIndex,
  designLawBook,
  reviewOverlay,
  inputs
} = {}) {
  const knowledgeBase = buildTemplateKnowledgeBaseV2({
    generatedAt,
    caseLibrary,
    templateIndex,
    designLawBook,
    reviewOverlay,
    inputs
  });
  const retrievalIndex = buildTemplateRetrievalIndexV2(knowledgeBase);
  await fs.mkdir(outputDir, { recursive: true });
  const knowledgeBaseFile = path.join(outputDir, 'case_library.v2.json');
  const retrievalIndexFile = path.join(outputDir, 'retrieval_index.v2.json');
  const priorityReportFile = path.join(outputDir, 'template_priority_report.md');
  const reviewQueueFile = path.join(outputDir, 'template_review_queue.md');
  await fs.writeFile(knowledgeBaseFile, `${JSON.stringify(knowledgeBase, null, 2)}\n`, 'utf8');
  await fs.writeFile(retrievalIndexFile, `${JSON.stringify(retrievalIndex, null, 2)}\n`, 'utf8');
  await fs.writeFile(priorityReportFile, renderTemplatePriorityReport(knowledgeBase), 'utf8');
  await fs.writeFile(reviewQueueFile, renderTemplateReviewQueue(knowledgeBase), 'utf8');
  return { knowledgeBase, retrievalIndex, knowledgeBaseFile, retrievalIndexFile, priorityReportFile, reviewQueueFile };
}

function buildCaseV2(card = {}, review = {}) {
  const blocked = new Set(review.blocked_learning_areas || []);
  const tags = buildTags(card, review);
  const knowledgeUnits = buildKnowledgeUnits(card).filter((unit) => !blocked.has(unit.area));
  const riskControls = [...new Set([...(card.risk_controls || []), ...riskControlsFromFlags(card.review_flags || [])])];
  const priority = buildPriority(card, review, knowledgeUnits, riskControls);
  const result = {
    case_id: card.case_id,
    case_version: '',
    title: card.title || card.case_id,
    file: card.file,
    identity: {
      category: card.category || '',
      typology: card.typology || 'building',
      style_family: card.style_family || 'general',
      scale_bucket: card.feature_card?.scale?.bucket || 'unknown'
    },
    source: {
      url: card.source_url || '',
      note: card.source_note || '',
      license_status: review.status === 'research-only' ? 'research-only' : 'unknown',
      author: '',
      public_release_allowed: false
    },
    review: {
      status: review.status || 'pending',
      reviewed_by: review.reviewed_by || '',
      reviewed_at: review.reviewed_at || '',
      confidence: Number(review.confidence || 0),
      notes: review.notes || '',
      approved_learning_areas: review.approved_learning_areas || [],
      blocked_learning_areas: review.blocked_learning_areas || [],
      manual_tags: review.manual_tags || [],
      risk_overrides: review.risk_overrides || [],
      review_record_ids: review.review_record_ids || []
    },
    tags,
    knowledge_units: knowledgeUnits,
    priority,
    retrieval: buildRetrieval(card, tags, knowledgeUnits),
    risk_controls: riskControls,
    review_flags: card.review_flags || [],
    lineage: {
      v1_case_id: card.case_id,
      input_hashes: { v1_case: `sha256:${hashJson(card)}` },
      review_record_ids: review.review_record_ids || []
    }
  };
  result.case_version = `sha256:${hashJson({ ...result, case_version: '' })}`;
  return result;
}

function buildKnowledgeUnits(card = {}) {
  const units = [];
  const add = (area, claim, evidence, confidence, useAs, targets) => {
    units.push({
      id: `${card.case_id}:${area}:${slug(claim).slice(0, 48)}`,
      area,
      claim,
      evidence: Array.isArray(evidence) ? evidence : [evidence],
      confidence,
      use_as: useAs,
      avoid_when: avoidWhenFor(card, area),
      integration_targets: targets,
      source_fields: ['case_library.semantic_clauses', 'case_library.feature_card', 'case_library.learning_roles']
    });
  };
  for (const clause of card.semantic_clauses || []) {
    if (/site|water|terrain|garden/i.test(clause)) add('site', clause, 'semantic clause', 0.78, ['site composition'], ['TemplateSiteSceneStrategy']);
    if (/massing|vertical|courtyard|wing/i.test(clause)) add('massing', clause, 'semantic clause', 0.72, ['massing guidance'], ['ArchitectAgent', 'TemplateSpacePlanningStrategy']);
    if (/facade|glass|wall/i.test(clause)) add('facade', clause, 'semantic clause', 0.76, ['facade rhythm'], ['FacadeAgent']);
    if (/roof|terrace|eaves/i.test(clause)) add('roof', clause, 'semantic clause', 0.74, ['roof profile'], ['RoofAgent']);
    if (/interior|room|focal|lighting|furniture/i.test(clause)) add('interior', clause, 'semantic clause', 0.8, ['room identity', 'decorator pattern guidance'], ['InteriorDetailAgent', 'DecoratorAgent']);
  }
  for (const area of card.learnable_areas || []) {
    const normalizedArea = normalizeArea(area.area || area.role);
    add(
      normalizedArea,
      `${card.title} teaches ${normalizedArea} through ${area.evidence || area.role}`,
      area.evidence || area.role,
      priorityConfidence(area.priority),
      [area.next_phase || normalizedArea],
      integrationTargets(normalizedArea)
    );
  }
  return dedupeById(units);
}

function buildTags(card = {}, review = {}) {
  const taxonomy = DEFAULT_TAG_TAXONOMY;
  const grouped = {};
  const add = (candidate) => {
    const normalized = normalizeCandidateTag(candidate);
    if (!normalized) return;
    const validation = validateTagRecord(normalized, taxonomy);
    if (!validation.ok) return;
    const tag = validation.normalized;
    if (!grouped[tag.group]) grouped[tag.group] = [];
    if (!grouped[tag.group].some((item) => item.id === tag.id)) grouped[tag.group].push(tag);
  };

  add({ group: 'typology', id: normalizeTaxonomyId(card.typology) });
  add({ group: 'style', id: normalizeTaxonomyId(card.style_family) });
  for (const raw of card.tags || []) add(raw);
  for (const raw of card.quality_tags || []) add(raw);
  for (const raw of review.manual_tags || []) add(raw);
  for (const room of card.feature_card?.interior?.room_candidates || []) add({ group: 'room_types', id: normalizeTaxonomyId(room.room_type) });

  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => a.id.localeCompare(b.id));
  }
  return grouped;
}

function buildPriority(card = {}, review = {}, knowledgeUnits = [], riskControls = []) {
  const areaScores = {};
  for (const unit of knowledgeUnits) {
    areaScores[unit.area] = Math.max(areaScores[unit.area] || 0, Math.round(unit.confidence * 100));
  }

  const baseScore = Number(card.overall_reference_score || 0);
  const knowledgeBonus = Math.min(knowledgeUnits.length * 4, 20);
  const approvalBonus = review.status === 'approved' ? 8 : review.status === 'limited' ? 2 : 0;
  const studyPriorityBonus = card.study_priority === 'high' ? 6 : card.study_priority === 'medium' ? 3 : 0;
  const riskPenalty = (card.review_flags || []).length * 8 + (review.status === 'pending' ? 8 : 0) + (review.status === 'limited' ? 6 : 0);
  const globalScore = Math.max(0, Math.min(100, Math.round(baseScore + knowledgeBonus + approvalBonus + studyPriorityBonus - riskPenalty)));

  return {
    global_score: globalScore,
    risk_penalty: riskPenalty,
    area_scores: areaScores,
    high_value_rank_reason: buildRankReasons(card, review, knowledgeUnits, riskControls)
  };
}

function buildRetrieval(card = {}, tags = {}, knowledgeUnits = []) {
  const tagTokens = Object.values(tags).flat().map((tag) => tag.id);
  const unitAreas = knowledgeUnits.map((unit) => unit.area);
  const searchTokens = [...new Set([
    ...((card.retrieval && card.retrieval.tokens) || []),
    ...((card.retrieval && card.retrieval.prompt_affinities) || []),
    ...tagTokens,
    ...unitAreas,
    ...tokenize(card.title)
  ])].sort();
  return {
    search_tokens: searchTokens,
    prompt_affinities: [...new Set(((card.retrieval && card.retrieval.prompt_affinities) || []).map((item) => String(item)))].sort(),
    explanation_seeds: buildExplanationSeeds(card, knowledgeUnits, tags)
  };
}

function riskControlsFromFlags(flags = []) {
  const controls = [];
  for (const flag of flags) {
    if (flag === 'arena-not-for-room-mining') controls.push('Do not mine domestic rooms from arena references.');
    if (flag === 'non-residential-interior-noise') controls.push('Treat interior observations as public-space patterns unless a reviewer approves room mining.');
  }
  return controls;
}

function normalizeArea(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'site';
  if (raw.startsWith('site')) return 'site';
  if (raw.includes('massing')) return 'massing';
  if (raw.includes('facade')) return 'facade';
  if (raw.includes('roof')) return 'roof';
  if (raw.includes('space')) return 'space-planning';
  if (raw.includes('interior') || raw.includes('room')) return 'interior';
  if (raw.includes('material')) return 'materials';
  if (raw.includes('risk')) return 'risk';
  return raw;
}

function integrationTargets(area) {
  const table = {
    site: ['TemplateSiteSceneStrategy'],
    massing: ['ArchitectAgent', 'TemplateSpacePlanningStrategy'],
    facade: ['FacadeAgent'],
    roof: ['RoofAgent'],
    'space-planning': ['TemplateSpacePlanningStrategy'],
    interior: ['InteriorDetailAgent', 'DecoratorAgent'],
    materials: ['DecoratorAgent'],
    risk: ['TemplateKnowledgeAgent']
  };
  return table[area] || ['TemplateKnowledgeAgent'];
}

function summarizeCases(cases = [], caseLibrary = {}, templateIndex = {}) {
  const reviewStatusCounts = {};
  for (const item of cases) {
    reviewStatusCounts[item.review.status] = (reviewStatusCounts[item.review.status] || 0) + 1;
  }
  return {
    case_count: cases.length,
    template_count: Number(templateIndex.corpus?.template_count || 0),
    source_case_library: caseLibrary.source || '',
    review_status_counts: reviewStatusCounts,
    reviewed_case_count: cases.filter((item) => item.review.status !== 'pending').length
  };
}

function addIndex(index, key, caseId) {
  if (!key) return;
  if (!index[key]) index[key] = [];
  if (!index[key].includes(caseId)) index[key].push(caseId);
}

function sortIndex(index) {
  return Object.fromEntries(
    Object.entries(index)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, [...value].sort()])
  );
}

function hashJson(value) {
  return crypto.createHash('sha256').update(JSON.stringify(sortValue(value))).digest('hex');
}

function slug(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function dedupeById(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function priorityConfidence(priority) {
  const table = { high: 0.9, medium: 0.75, low: 0.6 };
  return table[String(priority || '').toLowerCase()] || 0.7;
}

function avoidWhenFor(card = {}, area = '') {
  if (area === 'interior' && (card.review_flags || []).includes('arena-not-for-room-mining')) {
    return ['Do not treat public arena interiors as domestic room precedents.'];
  }
  if (area === 'site' && card.feature_card?.site?.integrated === false) {
    return ['Avoid terrain-integrated lessons when the source sits on a flat isolated pad.'];
  }
  return [];
}

function normalizeCandidateTag(candidate) {
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    if (candidate.group && candidate.id) {
      return { ...candidate, id: normalizeTaxonomyId(candidate.id) };
    }
    return null;
  }
  const alias = TAG_ALIASES[String(candidate || '').trim()];
  return alias ? { ...alias } : null;
}

function normalizeTaxonomyId(value = '') {
  return String(value || '').trim().toLowerCase().replaceAll('_', '-');
}

function buildRankReasons(card = {}, review = {}, knowledgeUnits = [], riskControls = []) {
  const reasons = [];
  if (Number(card.overall_reference_score || 0) >= 80) reasons.push('strong reference score');
  if (review.status === 'approved') reasons.push('human approved');
  if (knowledgeUnits.some((unit) => unit.area === 'site')) reasons.push('usable site knowledge');
  if (knowledgeUnits.some((unit) => unit.area === 'interior')) reasons.push('usable interior knowledge');
  if (riskControls.length) reasons.push(`${riskControls.length} risk controls`);
  return reasons;
}

function buildExplanationSeeds(card = {}, knowledgeUnits = [], tags = {}) {
  const seeds = [];
  for (const unit of knowledgeUnits.slice(0, 3)) {
    seeds.push(`${card.title}: ${unit.claim}`);
  }
  for (const [group, values] of Object.entries(tags)) {
    if (!values.length) continue;
    seeds.push(`${group}: ${values.map((item) => item.id).join(', ')}`);
  }
  return [...new Set(seeds)];
}

function tokenize(value = '') {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map((item) => sortValue(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortValue(value[key])])
  );
}
