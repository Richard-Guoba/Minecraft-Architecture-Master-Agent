import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTemplateKnowledgeBaseV2,
  buildTemplateRetrievalIndexV2,
  renderTemplatePriorityReport,
  renderTemplateReviewQueue,
  writeTemplateKnowledgeBaseV2Artifacts
} from '../src/construction/templates/templateKnowledgeBaseV2.js';
import { normalizeTemplateKnowledgeBaseV2Inputs } from '../src/construction/templates/schematicAnalyzer.js';
import { parseTemplateReviewOverlay, mergeReviewRecords } from '../src/construction/templates/templateReviewOverlay.js';

test('knowledge base v2 converts v1 cases into reviewed knowledge units', () => {
  const reviewOverlay = mergeReviewRecords(parseTemplateReviewOverlay(JSON.stringify({
    record_id: 'review-modern-1',
    case_id: 'house-modern-lake-villa',
    reviewed_by: 'human',
    reviewed_at: '2026-07-09T00:00:00.000Z',
    status: 'approved',
    confidence: 0.9,
    approved_learning_areas: ['site', 'facade', 'interior'],
    blocked_learning_areas: [],
    manual_tags: [{ group: 'quality', id: 'high-value-reference', confidence: 0.9, evidence: 'manual review' }]
  })).records);

  const kb = buildTemplateKnowledgeBaseV2({
    generatedAt: '2026-07-09T00:00:00.000Z',
    caseLibrary: caseLibraryFixture(),
    templateIndex: templateIndexFixture(),
    reviewOverlay
  });

  assert.equal(kb.source, 'template-knowledge-base-v2');
  assert.equal(kb.schema_version, 2);
  assert.equal(kb.summary.case_count, 2);
  assert.equal(kb.summary.review_status_counts.approved, 1);
  assert.equal(kb.summary.review_status_counts.pending, 1);
  assert.ok(kb.knowledge_base_id.startsWith('sha256:'));

  const modern = kb.cases.find((item) => item.case_id === 'house-modern-lake-villa');
  assert.equal(modern.review.status, 'approved');
  assert.ok(modern.case_version.startsWith('sha256:'));
  assert.ok(modern.tags.site.some((tag) => tag.id === 'water-edge'));
  assert.ok(modern.tags.quality.some((tag) => tag.id === 'high-value-reference'));
  assert.ok(modern.knowledge_units.some((unit) => unit.area === 'site'));
  assert.ok(modern.knowledge_units.some((unit) => unit.area === 'facade'));
  assert.ok(modern.knowledge_units.some((unit) => unit.area === 'interior'));
  assert.ok(modern.priority.global_score > 70);
  assert.ok(modern.retrieval.search_tokens.includes('modern'));
  assert.ok(modern.retrieval.explanation_seeds.length > 0);
});

test('knowledge base v2 suppresses blocked learning areas and ranks review queue', () => {
  const overlay = mergeReviewRecords(parseTemplateReviewOverlay(JSON.stringify({
    record_id: 'review-arena-1',
    case_id: 'arenas-amphitheatre-arena',
    reviewed_by: 'human',
    reviewed_at: '2026-07-09T00:00:00.000Z',
    status: 'limited',
    confidence: 0.75,
    approved_learning_areas: ['site', 'massing'],
    blocked_learning_areas: ['interior']
  })).records);

  const kb = buildTemplateKnowledgeBaseV2({
    generatedAt: '2026-07-09T00:00:00.000Z',
    caseLibrary: caseLibraryFixture(),
    templateIndex: templateIndexFixture(),
    reviewOverlay: overlay
  });

  const arena = kb.cases.find((item) => item.case_id === 'arenas-amphitheatre-arena');
  assert.equal(arena.review.status, 'limited');
  assert.ok(arena.knowledge_units.some((unit) => unit.area === 'site'));
  assert.ok(arena.knowledge_units.some((unit) => unit.area === 'massing'));
  assert.equal(arena.knowledge_units.some((unit) => unit.area === 'interior'), false);
  assert.equal(arena.retrieval.search_tokens.includes('interior'), false);
  assert.equal(arena.retrieval.prompt_affinities.includes('interior'), false);
  assert.ok(arena.retrieval.prompt_affinities.includes('classical'));
  assert.ok(arena.retrieval.prompt_affinities.includes('arena'));
  assert.deepEqual(Object.keys(arena.tags).sort(), ['facade', 'interior', 'massing', 'quality', 'roof', 'room_types', 'site', 'style', 'typology']);
  assert.equal(arena.tags.interior.length, 0);
  assert.ok(arena.priority.review_bonus > 0);
  assert.ok(arena.priority.area_scores.site > arena.priority.area_scores.interior || arena.priority.area_scores.interior === undefined);
  assert.equal(arena.retrieval.diversity_slots.site > 0, true);
  assert.equal(arena.retrieval.diversity_slots.interior || 0, 0);
  assert.ok(arena.risk_controls.some((item) => /do not mine domestic rooms/i.test(item)));

  const queue = renderTemplateReviewQueue(kb);
  assert.match(queue, /Template Review Queue/);
  assert.match(queue, /Amphitheatre Arena/);
  assert.match(queue, /arena-not-for-room-mining/);
});

test('knowledge base v2 builds retrieval index and markdown reports', () => {
  const kb = buildTemplateKnowledgeBaseV2({
    generatedAt: '2026-07-09T00:00:00.000Z',
    caseLibrary: caseLibraryFixture(),
    templateIndex: templateIndexFixture()
  });
  const index = buildTemplateRetrievalIndexV2(kb);
  assert.equal(index.source, 'template-retrieval-index-v2');
  assert.equal(index.schema_version, 2);
  assert.equal(index.case_count, 2);
  assert.ok(index.token_to_cases.modern.includes('house-modern-lake-villa'));
  assert.ok(index.area_to_cases.site.includes('house-modern-lake-villa'));

  const priorityReport = renderTemplatePriorityReport(kb);
  assert.match(priorityReport, /Template Priority Report/);
  assert.match(priorityReport, /Modern Lake Villa/);
});

test('knowledge base v2 preserves unknown tags and applies risk overrides', () => {
  const overlay = mergeReviewRecords(parseTemplateReviewOverlay(JSON.stringify({
    record_id: 'review-modern-override',
    case_id: 'house-modern-lake-villa',
    reviewed_by: 'human',
    reviewed_at: '2026-07-09T01:00:00.000Z',
    status: 'approved',
    confidence: 1,
    approved_learning_areas: ['site', 'facade'],
    blocked_learning_areas: ['interior'],
    risk_overrides: ['add:Human review required before copying glazing ratios', 'suppress:safe for normal template retrieval']
  })).records);

  const cases = caseLibraryFixture().cases.map((item) => item.case_id === 'house-modern-lake-villa'
    ? {
        ...item,
        source_url: '',
        source_note: '',
        tags: [...item.tags, 'mystery-balcony'],
        quality_tags: [...item.quality_tags, 'untracked-quality-signal']
      }
    : item);

  const kb = buildTemplateKnowledgeBaseV2({
    generatedAt: '2026-07-09T01:00:00.000Z',
    caseLibrary: { ...caseLibraryFixture(), cases },
    templateIndex: templateIndexFixture(),
    reviewOverlay: overlay
  });

  const modern = kb.cases.find((item) => item.case_id === 'house-modern-lake-villa');
  assert.equal(modern.review.status, 'approved');
  assert.equal(modern.priority.review_bonus, 8);
  assert.equal(modern.knowledge_units.some((unit) => unit.area === 'interior'), false);
  assert.equal(modern.retrieval.search_tokens.includes('interior'), false);
  assert.ok(modern.risk_controls.includes('Human review required before copying glazing ratios'));
  assert.equal(modern.risk_controls.some((item) => item === 'safe for normal template retrieval according to current evidence'), false);
  assert.ok(modern.tags.quality.some((tag) => tag.id === 'high-value-reference'));
  assert.equal(modern.tags.quality.some((tag) => tag.id === 'untracked-quality-signal'), false);
  assert.equal(modern.unknown_tag_count, 2);
  assert.deepEqual(modern.unknown_tags.map((item) => item.raw), ['mystery-balcony', 'untracked-quality-signal']);
  assert.ok(modern.warnings.some((item) => /unknown taxonomy tags/i.test(item)));
  assert.ok(modern.warnings.some((item) => /missing source url/i.test(item)));
});

test('knowledge base v2 review queue includes metadata-risk cases beyond explicit review flags', () => {
  const kb = buildTemplateKnowledgeBaseV2({
    generatedAt: '2026-07-09T00:00:00.000Z',
    caseLibrary: caseLibraryFixture(),
    templateIndex: templateIndexFixture()
  });

  const modern = kb.cases.find((item) => item.case_id === 'house-modern-lake-villa');
  assert.equal(modern.review.status, 'pending');
  assert.ok(modern.warnings.some((item) => /missing source url/i.test(item)));

  const queue = renderTemplateReviewQueue(kb);
  assert.match(queue, /Modern Lake Villa/);
  assert.match(queue, /missing-source-url/);
});

test('knowledge base v2 artifact writer writes json and reports', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-kb-v2-'));
  const result = await writeTemplateKnowledgeBaseV2Artifacts({
    outputDir: root,
    generatedAt: '2026-07-09T00:00:00.000Z',
    caseLibrary: caseLibraryFixture(),
    templateIndex: templateIndexFixture()
  });

  assert.ok(result.knowledgeBaseFile.endsWith('case_library.v2.json'));
  assert.ok(result.retrievalIndexFile.endsWith('retrieval_index.v2.json'));
  assert.ok(result.priorityReportFile.endsWith('template_priority_report.md'));
  assert.ok(result.reviewQueueFile.endsWith('template_review_queue.md'));

  const writtenKb = JSON.parse(await fs.readFile(result.knowledgeBaseFile, 'utf8'));
  assert.equal(writtenKb.schema_version, 2);
  const queue = await fs.readFile(result.reviewQueueFile, 'utf8');
  assert.match(queue, /Template Review Queue/);
});

test('knowledge base v2 artifact writer result shape is analyzer-friendly', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-kb-v2-analyzer-'));
  const result = await writeTemplateKnowledgeBaseV2Artifacts({
    outputDir: root,
    generatedAt: '2026-07-09T00:00:00.000Z',
    caseLibrary: caseLibraryFixture(),
    templateIndex: templateIndexFixture(),
    designLawBook: { source: 'stage7-design-law-book-v1' }
  });

  assert.deepEqual(Object.keys(result).sort(), [
    'knowledgeBase',
    'knowledgeBaseFile',
    'priorityReportFile',
    'retrievalIndex',
    'retrievalIndexFile',
    'reviewQueueFile'
  ].sort());
  assert.equal(result.knowledgeBase.summary.case_count, 2);
  assert.equal(result.retrievalIndex.case_count, 2);
});

test('schematic analyzer normalizes v2 artifact input paths to forward slashes', () => {
  const inputs = normalizeTemplateKnowledgeBaseV2Inputs({
    rootDir: 'mc_templates',
    outputDir: 'mc_templates\\analysis'
  });

  assert.deepEqual(inputs, {
    case_library: 'mc_templates/analysis/case_library.json',
    template_index: 'mc_templates/analysis/template_index.json',
    design_laws: 'mc_templates/analysis/design_laws.json',
    review_overlay: 'mc_templates/curation/template_reviews.jsonl',
    tag_taxonomy: 'mc_templates/curation/tag_taxonomy.json'
  });
});

function caseLibraryFixture() {
  return {
    source: 'stage7-template-case-library-v1',
    cases: [
      {
        case_id: 'house-modern-lake-villa',
        title: 'Modern Lake Villa',
        file: 'House/Modern Lake Villa.schematic',
        category: 'House',
        style_family: 'modern',
        typology: 'house',
        study_priority: 'high',
        overall_reference_score: 92,
        tags: ['water-edge', 'landscape-composition', 'glass-emphasis', 'furnished-interior'],
        quality_tags: ['site-rich-reference', 'interior-rich-reference'],
        learning_roles: [
          { role: 'water_edge', score: 90, evidence: 'water edge' },
          { role: 'garden_scene', score: 85, evidence: 'garden' },
          { role: 'facade_detail', score: 80, evidence: 'glass facade' },
          { role: 'interior_reference', score: 88, evidence: 'furnished interior' }
        ],
        learnable_areas: [
          { area: 'site-water-edge', priority: 'high', role: 'water_edge', evidence: 'water edge', next_phase: 'phase2-site-pattern-mining' },
          { area: 'facade', priority: 'high', role: 'facade_detail', evidence: 'glass facade', next_phase: 'phase2-facade-motif-mining' },
          { area: 'interior', priority: 'high', role: 'interior_reference', evidence: 'furnished interior', next_phase: 'phase2-room-segmentation' }
        ],
        review_flags: [],
        risk_controls: ['safe for normal template retrieval according to current evidence'],
        feature_card: {
          scale: { bucket: 'large', width: 34, height: 18, length: 28 },
          site: { integrated: true, terrain_profile: 'non-flat-integrated', landscape_features: ['garden-composition', 'water-edge'], water_ratio: 0.02 },
          facade_roof: { glass_ratio: 0.09, facade_patterns: ['large_glass_bands'], roof_patterns: ['flat_terrace_or_platform'] },
          interior: { furnished_likelihood: 'high', room_candidates: [{ room_type: 'living' }, { room_type: 'kitchen' }] },
          composition: { massing: ['long_bar'], roof: ['flat_terrace_or_platform'], site: ['water_edge'], facade: ['large_glass_bands'] }
        },
        semantic_clauses: [
          'site: connect public rooms to a water edge, reflection basin, deck, or waterfront threshold',
          'facade: make large glass serve a view axis, not just a random wall material',
          'interior: build room identity from focal walls, storage bands, task zones, textiles, plants, and layered lighting'
        ],
        retrieval: { tokens: ['modern', 'lake', 'villa', 'water-edge', 'large-glass'], prompt_affinities: ['modern', 'house', 'waterfront', 'large-glass', 'interior'] }
      },
      {
        case_id: 'arenas-amphitheatre-arena',
        title: 'Amphitheatre Arena',
        file: 'Arenas/Amphitheatre Arena.schematic',
        category: 'Arenas',
        style_family: 'classical',
        typology: 'arena',
        study_priority: 'low',
        overall_reference_score: 40,
        tags: ['terrain-integrated'],
        quality_tags: ['review-before-deep-mining'],
        learning_roles: [
          { role: 'terrain_base', score: 80, evidence: 'terrain' },
          { role: 'interior_reference', score: 60, evidence: 'non residential interior noise' }
        ],
        learnable_areas: [
          { area: 'site-terrain', priority: 'high', role: 'terrain_base', evidence: 'terrain', next_phase: 'phase2-site-pattern-mining' },
          { area: 'interior', priority: 'medium', role: 'interior_reference', evidence: 'noisy interior', next_phase: 'manual-review' }
        ],
        review_flags: ['arena-not-for-room-mining', 'non-residential-interior-noise'],
        risk_controls: ['use this case for exterior, site, public approach, or seating rhythm; do not mine domestic rooms'],
        feature_card: {
          scale: { bucket: 'monumental', width: 64, height: 28, length: 64 },
          site: { integrated: true, terrain_profile: 'non-flat-integrated', landscape_features: ['garden-composition'], water_ratio: 0 },
          composition: { massing: ['vertical_landmark'], site: ['foreground_scene'] },
          interior: { furnished_likelihood: 'medium', room_candidates: [{ room_type: 'entry_or_lobby' }] }
        },
        semantic_clauses: [
          'site: treat terrain as part of the architecture with rock/earth plinths, retaining edges, and stepped arrival',
          'massing: use a vertical accent or tower-like marker as an arrival/view focus',
          'interior: build room identity from focal walls, storage bands, task zones, textiles, plants, and layered lighting'
        ],
        retrieval: { tokens: ['classical', 'arena', 'terrain'], prompt_affinities: ['classical', 'arena', 'terrain', 'interior'] }
      }
    ]
  };
}

function templateIndexFixture() {
  return { corpus: { template_count: 2 }, templates: [] };
}
