import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTemplateEmbeddingIndex } from '../src/construction/templates/templateEmbeddingIndex.js';
import { NeuralTemplateRetriever } from '../src/construction/templates/templateNeuralRetriever.js';

test('neural retriever returns fusion result with rule and embedding scores', () => {
  const knowledgeBase = knowledgeBaseFixture();
  const embeddingIndex = buildTemplateEmbeddingIndex({
    knowledgeBase,
    neuralLabels: neuralLabelsFixture(),
    generatedAt: '2026-07-09T00:00:00.000Z',
    dimensions: 64
  });

  const result = new NeuralTemplateRetriever({ knowledgeBase, embeddingIndex, neuralLabels: neuralLabelsFixture() }).run({
    prompt: 'build a lakeside modern villa with large glass and refined interior',
    context: { style_family: 'modern', typology: 'house' },
    limit: 8
  });

  assert.equal(result.source, 'stage5-neural-template-retriever-v1');
  assert.equal(result.active, true);
  assert.equal(result.mode, 'fusion');
  assert.equal(result.fallback_used, false);
  assert.equal(result.references[0].case_id, 'house-modern-lake-villa');
  assert.ok(result.references[0].rule_score > 0);
  assert.ok(result.references[0].embedding_score > 0);
  assert.ok(result.references[0].tag_match_score > 0);
  assert.match(result.references[0].fusion_explanation, /fusion/i);
  assert.ok(result.references[0].teaches.length > 0);
  assert.ok(result.references[0].risk_controls.length > 0);
});

test('neural retriever falls back to rule-only when embedding index is missing', () => {
  const knowledgeBase = knowledgeBaseFixture();
  const result = new NeuralTemplateRetriever({ knowledgeBase }).run({
    prompt: 'build a lakeside modern villa with large glass',
    context: { style_family: 'modern', typology: 'house' },
    limit: 8
  });

  assert.equal(result.source, 'template-explainable-retriever-v1');
  assert.equal(result.mode, 'rule-only-fallback');
  assert.equal(result.fallback_used, true);
  assert.ok(result.warnings.some((item) => /embedding index missing/i.test(item)));
});

test('neural retriever falls back to rule-only when embedding labels are stale', () => {
  const knowledgeBase = knowledgeBaseFixture();
  const embeddingIndex = buildTemplateEmbeddingIndex({
    knowledgeBase,
    neuralLabels: neuralLabelsFixture(),
    generatedAt: '2026-07-09T00:00:00.000Z',
    dimensions: 64
  });

  const result = new NeuralTemplateRetriever({
    knowledgeBase,
    embeddingIndex,
    neuralLabels: staleNeuralLabelsFixture()
  }).run({
    prompt: 'build a lakeside modern villa with large glass',
    context: { style_family: 'modern', typology: 'house' },
    limit: 8
  });

  assert.equal(result.source, 'template-explainable-retriever-v1');
  assert.equal(result.mode, 'rule-only-fallback');
  assert.equal(result.fallback_used, true);
  assert.ok(result.warnings.some((item) => /stale|changed label_record_hash/i.test(item)));
});

test('neural retriever falls back to rule-only when embedding index misses knowledge-base cases', () => {
  const knowledgeBase = knowledgeBaseFixture();
  const partialKnowledgeBase = {
    ...knowledgeBase,
    cases: [knowledgeBase.cases[0]]
  };
  const embeddingIndex = buildTemplateEmbeddingIndex({
    knowledgeBase: partialKnowledgeBase,
    neuralLabels: neuralLabelsFixture(),
    generatedAt: '2026-07-09T00:00:00.000Z',
    dimensions: 64
  });

  const result = new NeuralTemplateRetriever({
    knowledgeBase,
    embeddingIndex,
    neuralLabels: neuralLabelsFixture()
  }).run({
    prompt: 'build a lakeside modern villa with large glass',
    context: { style_family: 'modern', typology: 'house' },
    limit: 8
  });

  assert.equal(result.source, 'template-explainable-retriever-v1');
  assert.equal(result.mode, 'rule-only-fallback');
  assert.equal(result.fallback_used, true);
  assert.ok(result.warnings.some((item) => /missing.*arenas-amphitheatre-arena/i.test(item)));
});

test('neural retriever does not promote arena interiors for residential interior prompts', () => {
  const knowledgeBase = safeEmbeddingOnlyFixture();
  const embeddingIndex = buildTemplateEmbeddingIndex({
    knowledgeBase,
    neuralLabels: safeEmbeddingOnlyLabelsFixture(),
    generatedAt: '2026-07-09T00:00:00.000Z',
    dimensions: 64
  });

  const result = new NeuralTemplateRetriever({ knowledgeBase, embeddingIndex, neuralLabels: safeEmbeddingOnlyLabelsFixture() }).run({
    prompt: 'residential house interior',
    context: { typology: 'house' },
    limit: 8
  });

  const arena = result.references.find((item) => item.case_id === 'arena-safe-embedding-only');
  assert.ok(arena);
  assert.equal(arena.teaches.some((item) => item.area === 'interior'), false);
  assert.equal(arena.matched_signals.some((item) => item === 'token:interior'), false);
});

test('neural retriever scores suggested learning areas from labels', () => {
  const knowledgeBase = learningAreaFixture();
  const neuralLabels = learningAreaLabelsFixture();
  const embeddingIndex = buildTemplateEmbeddingIndex({
    knowledgeBase,
    neuralLabels,
    generatedAt: '2026-07-09T00:00:00.000Z',
    dimensions: 64
  });

  const result = new NeuralTemplateRetriever({ knowledgeBase, embeddingIndex, neuralLabels }).run({
    prompt: 'site',
    context: {},
    limit: 8
  });

  const reference = result.references.find((item) => item.case_id === 'learning-area-site-study');
  assert.ok(reference);
  assert.ok(reference.tag_match_score > 0);
  assert.ok(reference.matched_signals.includes('tag:learning-area:site'));
});

function knowledgeBaseFixture() {
  const unit = (id, area, claim, targets = ['TemplateKnowledgeAgent']) => ({
    id,
    area,
    claim,
    evidence: [`${area} evidence`],
    confidence: 0.85,
    use_as: [`${area} guidance`],
    avoid_when: ['do not copy block-for-block'],
    integration_targets: targets,
    source_fields: ['fixture']
  });
  return {
    source: 'template-knowledge-base-v2',
    schema_version: 2,
    cases: [
      {
        case_id: 'house-modern-lake-villa',
        case_version: 'sha256:modern',
        title: 'Modern Lake Villa',
        file: 'House/Modern Lake Villa.schematic',
        identity: { style_family: 'modern', typology: 'house', category: 'House', scale_bucket: 'large' },
        review: { status: 'approved', confidence: 0.9 },
        tags: { style: [{ id: 'modern' }], typology: [{ id: 'house' }], site: [{ id: 'water-edge' }], facade: [{ id: 'large-glass' }], interior: [{ id: 'furnished' }] },
        knowledge_units: [
          unit('lake-site', 'site', 'Connect public rooms to a water edge and deck.', ['TemplateSiteSceneStrategy']),
          unit('lake-facade', 'facade', 'Large glass should serve view-facing rooms.', ['FacadeAgent']),
          unit('lake-interior', 'interior', 'Use focal walls and layered lighting for inhabited rooms.', ['InteriorDetailAgent', 'DecoratorAgent'])
        ],
        priority: { global_score: 92, area_scores: { site: 90, facade: 86, interior: 84 }, risk_penalty: 0 },
        retrieval: { search_tokens: ['modern', 'lake', 'villa', 'water-edge', 'large-glass', 'interior'], prompt_affinities: ['modern', 'house', 'waterfront', 'large-glass', 'interior'], diversity_slots: ['site', 'facade', 'interior'], explanation_seeds: ['modern waterfront villa'] },
        risk_controls: ['change exact dimensions and detail placement; do not copy block-for-block']
      },
      {
        case_id: 'arenas-amphitheatre-arena',
        case_version: 'sha256:arena',
        title: 'Amphitheatre Arena',
        file: 'Arenas/Amphitheatre Arena.schematic',
        identity: { style_family: 'classical', typology: 'arena', category: 'Arenas', scale_bucket: 'monumental' },
        review: { status: 'limited', confidence: 0.75, approved_learning_areas: ['site', 'massing'], blocked_learning_areas: ['interior'] },
        tags: { style: [{ id: 'classical' }], typology: [{ id: 'arena' }], site: [{ id: 'terrain-integrated' }] },
        knowledge_units: [unit('arena-site', 'site', 'Use terrain plinths and stepped arrival.', ['TemplateSiteSceneStrategy'])],
        priority: { global_score: 48, area_scores: { site: 82 }, risk_penalty: 20 },
        retrieval: { search_tokens: ['arena', 'terrain', 'classical', 'interior'], prompt_affinities: ['terrain', 'interior'], diversity_slots: ['site'], explanation_seeds: ['terrain plinth'] },
        risk_controls: ['use this case for exterior, site, public approach, or seating rhythm; do not mine domestic rooms']
      }
    ]
  };
}

function neuralLabelsFixture() {
  return [
    {
      case_id: 'house-modern-lake-villa',
      suggested_tags: [
        { group: 'facade', id: 'large-glass', confidence: 0.86, evidence: ['fixture'] },
        { group: 'site', id: 'water-edge', confidence: 0.9, evidence: ['fixture'] }
      ],
      suggested_learning_areas: [{ area: 'site', confidence: 0.9, evidence: ['fixture'] }]
    }
  ];
}

function staleNeuralLabelsFixture() {
  return [
    {
      case_id: 'house-modern-lake-villa',
      suggested_tags: [
        { group: 'facade', id: 'large-glass', confidence: 0.83, evidence: ['fixture'] },
        { group: 'site', id: 'water-edge', confidence: 0.9, evidence: ['fixture'] }
      ],
      suggested_learning_areas: [{ area: 'site', confidence: 0.9, evidence: ['fixture'] }]
    }
  ];
}

function safeEmbeddingOnlyFixture() {
  const unit = (id, area, claim, targets = ['TemplateKnowledgeAgent']) => ({
    id,
    area,
    claim,
    evidence: [`${area} evidence`],
    confidence: 0.85,
    use_as: [`${area} guidance`],
    avoid_when: ['do not copy block-for-block'],
    integration_targets: targets,
    source_fields: ['fixture']
  });
  return {
    source: 'template-knowledge-base-v2',
    schema_version: 2,
    cases: [
      {
        case_id: 'arena-safe-embedding-only',
        case_version: 'sha256:arena-safe',
        title: 'Arena Safe Embedding Only',
        file: 'Arenas/Arena Safe Embedding Only.schematic',
        identity: { style_family: 'classical', typology: 'arena', category: 'Arenas', scale_bucket: 'monumental' },
        review: { status: 'limited', confidence: 0.75, approved_learning_areas: ['site', 'massing'], blocked_learning_areas: ['interior'] },
        tags: { style: [{ id: 'classical' }], typology: [{ id: 'arena' }], site: [{ id: 'terrain-integrated' }] },
        knowledge_units: [
          unit('arena-site', 'site', 'Use terrain plinths and stepped arrival.', ['TemplateSiteSceneStrategy']),
          unit('arena-interior', 'interior', 'Keep domestic room guidance out of this arena reference.', ['InteriorDetailAgent'])
        ],
        priority: { global_score: 55, area_scores: { site: 82 }, risk_penalty: 0 },
        retrieval: { search_tokens: ['arena-safe'], prompt_affinities: ['public-approach'], diversity_slots: ['site'], explanation_seeds: ['terrain plinth'] },
        risk_controls: ['use this case for exterior, site, public approach, or seating rhythm; do not mine domestic rooms']
      }
    ]
  };
}

function safeEmbeddingOnlyLabelsFixture() {
  return [
    {
      case_id: 'arena-safe-embedding-only',
      suggested_tags: [{ group: 'site', id: 'terrain-integrated', confidence: 0.84, evidence: ['fixture'] }],
      suggested_learning_areas: []
    }
  ];
}

function learningAreaFixture() {
  return {
    source: 'template-knowledge-base-v2',
    schema_version: 2,
    cases: [
      {
        case_id: 'learning-area-site-study',
        case_version: 'sha256:learning-area',
        title: 'Site Study Pavilion',
        file: 'Studies/Site Study Pavilion.schematic',
        identity: { style_family: 'modern', typology: 'pavilion', category: 'Studies', scale_bucket: 'small' },
        review: { status: 'approved', confidence: 0.88 },
        tags: { style: [{ id: 'modern' }] },
        knowledge_units: [fixtureUnit('study-site', 'site', 'Use a compact site diagram.', ['TemplateSiteSceneStrategy'])],
        priority: { global_score: 61, area_scores: { site: 71 }, risk_penalty: 0 },
        retrieval: { search_tokens: ['study', 'pavilion'], prompt_affinities: ['diagram'], diversity_slots: ['site'], explanation_seeds: ['site study'] },
        risk_controls: ['change exact dimensions and diagram placement']
      }
    ]
  };
}

function learningAreaLabelsFixture() {
  return [
    {
      case_id: 'learning-area-site-study',
      suggested_tags: [],
      suggested_learning_areas: [{ area: 'site', confidence: 0.93, evidence: ['fixture'] }]
    }
  ];
}

function fixtureUnit(id, area, claim, targets = ['TemplateKnowledgeAgent']) {
  return {
    id,
    area,
    claim,
    evidence: [`${area} evidence`],
    confidence: 0.85,
    use_as: [`${area} guidance`],
    avoid_when: ['do not copy block-for-block'],
    integration_targets: targets,
    source_fields: ['fixture']
  };
}
