import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNeuralLabelRecords,
  neuralLabelsJsonl,
  parseGeneratedLabelsJsonl,
  writeNeuralLabelArtifacts
} from '../src/construction/templates/templateNeuralLabels.js';

test('neural label builder maps known generated aliases into normalized taxonomy suggestions', () => {
  const records = buildNeuralLabelRecords({
    knowledgeBase: knowledgeBaseFixture(),
    generatedLabels: [generatedLabelFixture()]
  });

  const modern = records.find((item) => item.case_id === 'house-modern-lake-villa');
  assert.ok(modern);
  assert.equal(modern.source, 'stage5-neural-labels-v1');
  assert.equal(modern.schema_version, 1);
  assert.equal(modern.review_guidance.suggested_status, 'limited');
  assert.equal(modern.review_guidance.needs_human_review, true);
  assert.deepEqual(modern.review_guidance.approved_learning_areas.sort(), ['facade', 'interior', 'site'].sort());
  assert.ok(modern.risk_notes.some((item) => /Human review overlay/i.test(item)));

  const tagKeys = modern.suggested_tags.map((tag) => `${tag.group}:${tag.id}`).sort();
  assert.ok(tagKeys.includes('facade:large-glass'));
  assert.ok(tagKeys.includes('interior:furnished'));
  assert.ok(tagKeys.includes('site:water-edge'));
  assert.ok(tagKeys.includes('site:garden'));
  assert.ok(tagKeys.includes('quality:high-value-reference'));
  assert.equal(modern.suggested_tags.every((tag) => tag.confidence > 0 && tag.confidence <= 1), true);
  assert.equal(modern.suggested_tags.every((tag) => tag.evidence.length > 0), true);
});

test('neural label builder preserves unknown aliases as review evidence', () => {
  const records = buildNeuralLabelRecords({
    knowledgeBase: knowledgeBaseFixture(),
    generatedLabels: [{
      ...generatedLabelFixture(),
      tags: ['glass-emphasis', 'strange-new-shape'],
      quality_tags: ['unmapped-quality-signal']
    }]
  });

  const modern = records.find((item) => item.case_id === 'house-modern-lake-villa');
  assert.ok(modern.unknown_suggestions.some((item) => item.raw === 'strange-new-shape'));
  assert.ok(modern.unknown_suggestions.some((item) => item.raw === 'unmapped-quality-signal'));
  assert.equal(modern.review_guidance.review_priority, 'high');
});

test('neural label builder merges duplicate generated rows for the same file', () => {
  const records = buildNeuralLabelRecords({
    knowledgeBase: knowledgeBaseFixture(),
    generatedLabels: [
      {
        ...generatedLabelFixture(),
        tags: ['landscape-composition'],
        quality_tags: ['interior-rich-reference'],
        composition_patterns: {
          site: ['foreground_scene']
        },
        learning_roles: ['interior_reference']
      },
      {
        ...generatedLabelFixture(),
        tags: ['water-edge', 'strange-unknown-duplicate'],
        quality_tags: ['site-rich-reference'],
        composition_patterns: {
          site: ['garden_forecourt'],
          facade: ['large_glass_bands']
        },
        learning_roles: ['water_edge'],
        room_reference_candidates: ['living']
      }
    ]
  });

  const modern = records.find((item) => item.case_id === 'house-modern-lake-villa');
  assert.ok(modern);
  const siteWater = modern.suggested_tags.find((tag) => tag.group === 'site' && tag.id === 'water-edge');
  assert.ok(siteWater);
  assert.ok(siteWater.evidence.length >= 2);
  const tagKeys = modern.suggested_tags.map((tag) => `${tag.group}:${tag.id}`).sort();
  assert.ok(tagKeys.includes('facade:large-glass'));
  assert.ok(tagKeys.includes('interior:room-layout-rich'));
  assert.ok(tagKeys.includes('site:garden'));
  assert.ok(modern.unknown_suggestions.some((item) => item.raw === 'strange-unknown-duplicate'));
});

test('high risk penalty alone does not block interior learning area', () => {
  const records = buildNeuralLabelRecords({
    knowledgeBase: knowledgeBaseFixture({
      priority: { global_score: 75, risk_penalty: 99 },
      review: { status: 'approved', approved_learning_areas: [], blocked_learning_areas: [] },
      review_priority_signals: []
    }),
    generatedLabels: [generatedLabelFixture()]
  });

  const modern = records.find((item) => item.case_id === 'house-modern-lake-villa');
  assert.ok(modern);
  assert.deepEqual(modern.review_guidance.blocked_learning_areas, []);
});

test('explicit interior-noise risk flag adds interior blocked_learning_areas', () => {
  const records = buildNeuralLabelRecords({
    knowledgeBase: knowledgeBaseFixture({
      priority: { global_score: 75, risk_penalty: 99 },
      review: { status: 'approved', approved_learning_areas: ['site'], blocked_learning_areas: ['site'] },
      risk_controls: ['arena-not-for-room-mining', 'non-residential-interior-noise']
    }),
    generatedLabels: [generatedLabelFixture()]
  });

  const modern = records.find((item) => item.case_id === 'house-modern-lake-villa');
  assert.ok(modern);
  assert.deepEqual(modern.review_guidance.blocked_learning_areas, ['interior', 'site']);
});

test('generated labels jsonl parser reports invalid lines without discarding valid records', () => {
  const parsed = parseGeneratedLabelsJsonl([
    JSON.stringify(generatedLabelFixture()),
    '{bad json',
    ''
  ].join('\n'));

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.errors[0].line, 2);
});

test('neural label artifact writer writes stable jsonl', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-neural-labels-'));
  try {
    const result = await writeNeuralLabelArtifacts({
      outputDir: root,
      knowledgeBase: knowledgeBaseFixture(),
      generatedLabels: [generatedLabelFixture()]
    });

    assert.ok(result.file.endsWith('neural_labels.jsonl'));
    const text = await fs.readFile(result.file, 'utf8');
    assert.match(text, /stage5-neural-labels-v1/);
    assert.equal(parseGeneratedLabelsJsonl(text).records.length, 1);
    assert.equal(neuralLabelsJsonl(result.records).endsWith('\n'), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function knowledgeBaseFixture(overrides = {}) {
  const base = {
    source: 'template-knowledge-base-v2',
    schema_version: 2,
    cases: [
      {
        case_id: 'house-modern-lake-villa',
        title: 'Modern Lake Villa',
        file: 'House/Modern Lake Villa.schematic',
        identity: { category: 'House', typology: 'house', style_family: 'modern', scale_bucket: 'medium' },
        review: { status: 'pending', approved_learning_areas: [], blocked_learning_areas: [] },
        tags: {
          typology: [{ group: 'typology', id: 'house' }],
          style: [{ group: 'style', id: 'modern' }],
          site: [{ group: 'site', id: 'water-edge' }],
          facade: [],
          interior: [],
          quality: [],
          room_types: []
        },
        unknown_tags: [{ raw: 'glass-emphasis', reason: 'unmapped-tag-alias' }],
        knowledge_units: [
          { id: 'site', area: 'site', claim: 'Use water edge deck transitions.', confidence: 0.82 },
          { id: 'facade', area: 'facade', claim: 'Use large view glass.', confidence: 0.81 },
          { id: 'interior', area: 'interior', claim: 'Use layered lighting.', confidence: 0.79 }
        ],
        priority: { global_score: 88, risk_penalty: 8 },
        risk_controls: ['change exact dimensions and detail placement; do not copy block-for-block'],
        review_priority_signals: ['pending-review', 'unknown-taxonomy-tags']
      }
    ]
  };

  if (!Object.keys(overrides).length) return base;

  const source = base;
  const caseRecord = source.cases[0];
  if (overrides.review) {
    caseRecord.review = { ...caseRecord.review, ...overrides.review };
  }
  if (overrides.priority) {
    caseRecord.priority = { ...caseRecord.priority, ...overrides.priority };
  }
  if (overrides.risk_controls) {
    caseRecord.risk_controls = overrides.risk_controls;
  }
  if (overrides.review_priority_signals) {
    caseRecord.review_priority_signals = overrides.review_priority_signals;
  }
  if (overrides.tags) {
    caseRecord.tags = overrides.tags;
  }
  if (overrides.knowledge_units) {
    caseRecord.knowledge_units = overrides.knowledge_units;
  }
  if (overrides.unknown_tags) {
    caseRecord.unknown_tags = overrides.unknown_tags;
  }

  return source;
}

function generatedLabelFixture() {
  return {
    file: 'House/Modern Lake Villa.schematic',
    title: 'Modern Lake Villa',
    style_family: 'modern',
    typology: 'house',
    tags: ['glass-emphasis', 'landscape-composition', 'water-edge'],
    quality_tags: ['interior-rich-reference', 'site-rich-reference'],
    learning_roles: ['interior_reference', 'water_edge', 'facade_detail'],
    composition_patterns: {
      facade: ['large_glass_bands'],
      site: ['foreground_scene', 'water_edge'],
      roof: ['flat_terrace_or_platform']
    },
    room_reference_candidates: ['living', 'bedroom']
  };
}
