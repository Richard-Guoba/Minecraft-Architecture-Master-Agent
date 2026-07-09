import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCaseEmbeddingDocument,
  buildTemplateEmbeddingIndex,
  queryEmbeddingIndex,
  validateEmbeddingIndex,
  vectorizeText,
  writeTemplateEmbeddingIndexArtifact
} from '../src/construction/templates/templateEmbeddingIndex.js';

test('case embedding document includes identity, tags, learning areas, and suggestions', () => {
  const document = buildCaseEmbeddingDocument(caseFixture(), neuralLabelFixture());

  assert.match(document.document, /Modern Lake Villa/);
  assert.match(document.document, /modern/);
  assert.match(document.document, /water-edge/);
  assert.match(document.document, /large-glass/);
  assert.ok(document.tokens.includes('modern'));
  assert.ok(document.tokens.includes('large-glass'));
  assert.ok(document.areas.includes('facade'));
  assert.equal(document.risk_penalty, 8);
});

test('deterministic token vectors are stable and normalized', () => {
  const first = vectorizeText('modern house large glass water edge', { dimensions: 32 });
  const second = vectorizeText('modern house large glass water edge', { dimensions: 32 });
  const norm = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));

  assert.deepEqual(first, second);
  assert.equal(first.length, 32);
  assert.ok(Math.abs(norm - 1) < 0.000001);
});

test('source weighting increases importance for identity and suggested-tag fields', () => {
  const markerToken = 'qvortex';
  const lowWeightCase = {
    case_id: 'low-weight',
    case_version: 'sha256:low',
    title: `A ${markerToken} touch`,
    file: 'House/Low Weight.schematic',
    identity: { category: 'House', typology: 'house', style_family: '', scale_bucket: 'medium' },
    knowledge_units: [{ area: 'site', claim: `This ${markerToken} idea appears only in prose.` }],
    priority: { risk_penalty: 0 }
  };
  const highWeightCase = {
    case_id: 'high-weight',
    case_version: 'sha256:high',
    title: 'A concise note',
    file: 'House/High Weight.schematic',
    identity: { category: 'House', typology: 'house', style_family: markerToken, scale_bucket: 'medium' },
    knowledge_units: [{ area: 'site', claim: 'Simple site notes.' }],
    priority: { risk_penalty: 0 }
  };

  const lowDocument = buildCaseEmbeddingDocument(lowWeightCase, {});
  const highDocument = buildCaseEmbeddingDocument(highWeightCase, {
    suggested_tags: [{ group: 'facade', id: markerToken, confidence: 0.86 }]
  });

  const query = vectorizeText(markerToken, { dimensions: 4096 });
  const lowScore = cosineSimilarity(query, vectorizeText(lowDocument.document, { dimensions: 4096 }));
  const highScore = cosineSimilarity(query, vectorizeText(highDocument.document, { dimensions: 4096 }));

  assert.ok(highScore > lowScore);
});

test('document tokens use file stem and avoid directory names or extensions', () => {
  const withPath = buildCaseEmbeddingDocument({
    case_id: 'file-stem',
    case_version: 'sha256:file',
    title: 'Modern Lake Villa',
    file: 'Folder/Sub/Modern Lake Villa.schematic',
    identity: { category: 'House', typology: 'house', style_family: 'modern', scale_bucket: 'medium' },
    knowledge_units: [{ area: 'site', claim: 'Deck on water edge.' }],
    priority: { risk_penalty: 0 }
  }, {});

  assert.equal(withPath.tokens.includes('folder'), false);
  assert.equal(withPath.tokens.includes('sub'), false);
  assert.equal(withPath.tokens.includes('schematic'), false);
  assert.equal(withPath.tokens.includes('modern'), true);
  assert.equal(withPath.tokens.includes('lake'), true);
});

test('query tie-breaking is deterministic with equal scores', () => {
  const identicalBase = {
    case_version: 'sha256:tie',
    title: 'Unrelated',
    file: 'House/Tie Case.schematic',
    identity: { category: 'House', typology: 'house', style_family: 'modern', scale_bucket: 'medium' },
    review: { status: 'pending' },
    tags: {
      typology: [{ id: 'house' }]
    },
    knowledge_units: [{ area: 'site', claim: 'Unique neutral text.' }],
    retrieval: { search_tokens: ['modern', 'house'], prompt_affinities: ['water-edge'] },
    priority: { risk_penalty: 0 },
    risk_controls: ['no direct block copy'],
    review_flags: []
  };

  const index = buildTemplateEmbeddingIndex({
    knowledgeBase: { cases: [
      { ...identicalBase, case_id: 'case-b', file: 'House/Tie Case.schematic' },
      { ...identicalBase, case_id: 'case-a', file: 'House/Tie Case.schematic' }
    ] },
    dimensions: 64
  });

  const matches = queryEmbeddingIndex({
    index,
    prompt: 'unmatched-token',
    limit: 2
  });

  assert.equal(matches[0].case_id, 'case-a');
  assert.equal(matches[1].case_id, 'case-b');
});

test('embedding index query ranks matching cases above unrelated cases', () => {
  const index = buildTemplateEmbeddingIndex({
    knowledgeBase: { cases: [caseFixture(), tavernFixture()] },
    neuralLabels: [neuralLabelFixture()],
    generatedAt: '2026-07-09T00:00:00.000Z',
    dimensions: 64
  });

  const matches = queryEmbeddingIndex({
    index,
    prompt: 'lakeside modern villa with large glass and water deck',
    limit: 2
  });

  assert.equal(matches[0].case_id, 'house-modern-lake-villa');
  assert.ok(matches[0].embedding_score > matches[1].embedding_score);
});

test('embedding validation detects stale case versions', () => {
  const index = buildTemplateEmbeddingIndex({
    knowledgeBase: { cases: [caseFixture()] },
    neuralLabels: [neuralLabelFixture()],
    generatedAt: '2026-07-09T00:00:00.000Z',
    dimensions: 32
  });
  const changed = { ...caseFixture(), case_version: 'sha256:changed' };

  const validation = validateEmbeddingIndex(index, { cases: [changed] });

  assert.equal(validation.ok, false);
  assert.deepEqual(validation.staleCaseIds, ['house-modern-lake-villa']);
  assert.ok(validation.warnings.some((item) => /stale/i.test(item)));
});

test('embedding artifact writer persists index json', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-embedding-index-'));
  try {
    const result = await writeTemplateEmbeddingIndexArtifact({
      outputDir: root,
      knowledgeBase: { cases: [caseFixture()] },
      neuralLabels: [neuralLabelFixture()],
      generatedAt: '2026-07-09T00:00:00.000Z'
    });

    const parsed = JSON.parse(await fs.readFile(result.file, 'utf8'));
    assert.equal(parsed.source, 'stage5-template-embedding-index-v1');
    assert.equal(parsed.case_count, 1);
    assert.equal(parsed.cases[0].case_id, 'house-modern-lake-villa');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function caseFixture() {
  return {
    case_id: 'house-modern-lake-villa',
    case_version: 'sha256:modern',
    title: 'Modern Lake Villa',
    file: 'House/Modern Lake Villa.schematic',
    identity: { category: 'House', typology: 'house', style_family: 'modern', scale_bucket: 'medium' },
    review: { status: 'pending' },
    tags: {
      typology: [{ id: 'house' }],
      style: [{ id: 'modern' }],
      site: [{ id: 'water-edge' }],
      facade: [{ id: 'large-glass' }]
    },
    knowledge_units: [
      { area: 'site', claim: 'Use water edge deck transitions.' },
      { area: 'facade', claim: 'Use large view glass.' }
    ],
    retrieval: { search_tokens: ['modern', 'house', 'water-edge'], prompt_affinities: ['large-glass'] },
    priority: { risk_penalty: 8 },
    risk_controls: ['do not copy exact dimensions'],
    review_flags: []
  };
}

function tavernFixture() {
  return {
    ...caseFixture(),
    case_id: 'house-tavern',
    case_version: 'sha256:tavern',
    title: 'Medieval Tavern',
    file: 'House/Tavern.schematic',
    identity: { category: 'House', typology: 'house', style_family: 'medieval', scale_bucket: 'medium' },
    tags: { typology: [{ id: 'house' }], style: [{ id: 'medieval' }], interior: [{ id: 'furnished' }] },
    knowledge_units: [{ area: 'interior', claim: 'Use social furniture clusters.' }],
    retrieval: { search_tokens: ['medieval', 'tavern', 'interior'], prompt_affinities: ['furnished'] },
    priority: { risk_penalty: 0 }
  };
}

function neuralLabelFixture() {
  return {
    case_id: 'house-modern-lake-villa',
    suggested_tags: [
      { group: 'facade', id: 'large-glass', confidence: 0.86, evidence: ['fixture'] },
      { group: 'site', id: 'water-edge', confidence: 0.9, evidence: ['fixture'] }
    ],
    suggested_learning_areas: [
      { area: 'facade', confidence: 0.86, evidence: ['fixture'] },
      { area: 'site', confidence: 0.9, evidence: ['fixture'] }
    ]
  };
}

function cosineSimilarity(a = [], b = []) {
  const limit = Math.min(a.length, b.length);
  let sum = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let index = 0; index < limit; index += 1) {
    const aValue = Number(a[index] || 0);
    const bValue = Number(b[index] || 0);
    sum += aValue * bValue;
    aNorm += aValue * aValue;
    bNorm += bValue * bValue;
  }
  if (!aNorm || !bNorm) return 0;
  return sum / Math.sqrt(aNorm * bNorm);
}
