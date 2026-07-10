import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PATCH_CATEGORIES,
  buildSemanticVoxelPatchDataset,
  filterSemanticPatchTrainingCandidates,
  rankSemanticPatchTrainingCandidates,
  renderSemanticPatchDatasetReport,
  semanticPatchDatasetJsonl,
  scoreSemanticPatchTrainingCandidate,
  summarizeSemanticPatchTrainingCandidates,
  writeSemanticVoxelPatchDatasetArtifact
} from '../src/construction/templates/templateSemanticPatchDataset.js';

test('semantic patch dataset builds all four Stage 6 categories from knowledge cases', () => {
  const dataset = buildSemanticVoxelPatchDataset({
    knowledgeBase: knowledgeBaseFixture(),
    neuralLabels: neuralLabelsFixture(),
    generatedAt: '2026-07-09T00:00:00.000Z'
  });

  assert.equal(dataset.source, 'stage6-semantic-voxel-patch-dataset-v1');
  assert.equal(dataset.schema_version, 1);
  assert.equal(dataset.generated_at, '2026-07-09T00:00:00.000Z');
  assert.deepEqual(dataset.categories, PATCH_CATEGORIES);
  assert.deepEqual([...new Set(dataset.patches.map((patch) => patch.category))].sort(), PATCH_CATEGORIES);
  assert.equal(dataset.patch_count, dataset.patches.length);
  assert.ok(dataset.patches.length >= 4);
  assert.ok(dataset.patches.every((patch) => patch.semantic_voxels.length > 0));
  assert.ok(dataset.patches.every((patch) => patch.semantic_voxels.every((voxel) => voxel.evidence.length > 0)));
});

test('semantic patch records keep stable ids, dimensions, tags, and bounded voxels', () => {
  const dataset = buildSemanticVoxelPatchDataset({
    knowledgeBase: knowledgeBaseFixture(),
    neuralLabels: neuralLabelsFixture()
  });

  const facade = dataset.patches.find((patch) => patch.patch_id === 'house-modern-lake-villa:facade:large-glass');
  assert.ok(facade);
  assert.equal(facade.anchor, 'facade-plane');
  assert.deepEqual(facade.dimensions, { width: 5, height: 5, depth: 2 });
  assert.ok(facade.tags.includes('large-glass'));
  assert.ok(facade.tags.includes('water-edge'));
  assert.ok(facade.risk_controls.some((item) => /block-for-block/i.test(item)));
  assert.ok(facade.semantic_voxels.some((voxel) => voxel.role === 'view-glass'));
  assert.ok(facade.semantic_voxels.every((voxel) => voxel.x >= 0 && voxel.x < facade.dimensions.width));
  assert.ok(facade.semantic_voxels.every((voxel) => voxel.y >= 0 && voxel.y < facade.dimensions.height));
  assert.ok(facade.semantic_voxels.every((voxel) => voxel.z >= 0 && voxel.z < facade.dimensions.depth));
});

test('semantic patch dataset jsonl is stable and parseable', () => {
  const dataset = buildSemanticVoxelPatchDataset({
    knowledgeBase: knowledgeBaseFixture(),
    neuralLabels: neuralLabelsFixture()
  });
  const jsonl = semanticPatchDatasetJsonl(dataset);
  const rows = jsonl.trim().split('\n').map((line) => JSON.parse(line));

  assert.equal(jsonl.endsWith('\n'), true);
  assert.equal(rows.length, dataset.patches.length);
  assert.deepEqual(rows.map((row) => row.patch_id), dataset.patches.map((patch) => patch.patch_id));
});

test('semantic patch dataset artifact writer persists dataset and jsonl files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-stage6-patches-'));
  try {
    const result = await writeSemanticVoxelPatchDatasetArtifact({
      outputDir: root,
      knowledgeBase: knowledgeBaseFixture(),
      neuralLabels: neuralLabelsFixture(),
      generatedAt: '2026-07-09T00:00:00.000Z'
    });

    assert.ok(result.datasetFile.endsWith('semantic_patch_dataset.json'));
    assert.ok(result.jsonlFile.endsWith('semantic_patch_dataset.jsonl'));
    assert.ok(result.reportFile.endsWith('semantic_patch_report.md'));
    const saved = JSON.parse(await fs.readFile(result.datasetFile, 'utf8'));
    const rows = (await fs.readFile(result.jsonlFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    const report = await fs.readFile(result.reportFile, 'utf8');
    assert.equal(saved.patch_count, result.dataset.patch_count);
    assert.equal(rows.length, result.dataset.patch_count);
    assert.match(report, /# Stage 6 Semantic Patch Report/);
    assert.match(report, /Representative Patches/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('semantic patch report summarizes category counts, tags, risk, and examples', () => {
  const dataset = buildSemanticVoxelPatchDataset({
    knowledgeBase: knowledgeBaseFixture(),
    neuralLabels: neuralLabelsFixture(),
    generatedAt: '2026-07-09T00:00:00.000Z'
  });
  const report = renderSemanticPatchDatasetReport(dataset);

  assert.match(report, /# Stage 6 Semantic Patch Report/);
  assert.match(report, /Generated: 2026-07-09T00:00:00.000Z/);
  assert.match(report, /Total patches: 6/);
  assert.match(report, /\| facade \| 1 \|/);
  assert.match(report, /large-glass/);
  assert.match(report, /review-gated/);
  assert.match(report, /house-modern-lake-villa:facade:large-glass/);
  assert.match(report, /do not copy block-for-block/);
  assert.match(report, /Training Candidates/);
  assert.match(report, /\| Rank \| Patch \| Category \| Score \| Band \| Notes \|/);
  assert.match(report, /high-confidence semantic voxels/);
});

test('semantic patch training candidates are scored, ranked, and risk penalized', () => {
  const strongFacade = patchCandidateFixture({
    patch_id: 'modern-facade',
    category: 'facade',
    tags: ['large-glass', 'modern', 'house', 'water-edge'],
    confidence: 0.92,
    evidence: ['facade unit', 'label unit'],
    risk_controls: ['change exact dimensions and detail placement; do not copy block-for-block']
  });
  const riskyInterior = patchCandidateFixture({
    patch_id: 'arena-interior',
    category: 'interior',
    tags: ['arena', 'furnished', 'classical'],
    confidence: 0.88,
    evidence: ['interior unit', 'label unit'],
    risk_controls: [
      'use this case for exterior, site, public approach, or seating rhythm; do not mine domestic rooms',
      'arena-not-for-room-mining'
    ]
  });
  const thinRoof = patchCandidateFixture({
    patch_id: 'thin-roof',
    category: 'roof',
    tags: ['roof'],
    confidence: 0.66,
    evidence: ['roof unit'],
    risk_controls: [],
    semantic_voxels: [{ x: 0, y: 0, z: 0, role: 'roof-surface', occupancy: 'solid' }]
  });
  const dataset = { patches: [riskyInterior, thinRoof, strongFacade] };

  const ranked = rankSemanticPatchTrainingCandidates(dataset, { limit: 2 });
  const riskyScore = scoreSemanticPatchTrainingCandidate(riskyInterior);
  const summary = summarizeSemanticPatchTrainingCandidates(dataset);

  assert.deepEqual(ranked.map((candidate) => candidate.patch_id), ['modern-facade', 'arena-interior']);
  assert.equal(ranked[0].band, 'high');
  assert.ok(ranked[0].score > ranked[1].score);
  assert.ok(ranked[0].reasons.includes('high-confidence semantic voxels'));
  assert.ok(riskyScore.penalties.includes('interior mining blocked by risk control'));
  assert.ok(riskyScore.score < ranked[0].score);
  assert.deepEqual(summary.training_band_counts, { high: 1, medium: 1, low: 1 });
  assert.equal(summary.training_candidate_count, 2);
  assert.equal(summary.top_training_candidates[0].patch_id, 'modern-facade');
});

test('semantic patch training candidates can be filtered for review queues', () => {
  const dataset = buildSemanticVoxelPatchDataset({
    knowledgeBase: knowledgeBaseFixture(),
    neuralLabels: neuralLabelsFixture(),
    generatedAt: '2026-07-09T00:00:00.000Z'
  });

  const facadeCandidates = filterSemanticPatchTrainingCandidates(dataset, {
    category: 'facade',
    band: 'high',
    limit: 1
  });
  const reviewGated = filterSemanticPatchTrainingCandidates(dataset, {
    band: 'medium',
    risk: 'reviewed site',
    limit: 10
  });

  assert.equal(facadeCandidates.length, 1);
  assert.equal(facadeCandidates[0].patch_id, 'house-modern-lake-villa:facade:large-glass');
  assert.equal(facadeCandidates[0].category, 'facade');
  assert.equal(facadeCandidates[0].band, 'high');
  assert.ok(facadeCandidates[0].tags.includes('large-glass'));
  assert.ok(facadeCandidates[0].risk_controls.some((item) => /block-for-block/i.test(item)));
  assert.deepEqual([...new Set(reviewGated.map((candidate) => candidate.case_id))], ['house-japanese-courtyard']);
  assert.ok(reviewGated.every((candidate) => candidate.penalties.includes('review-gated patch')));
});

test('semantic patch dataset does not learn from limited cases without approved areas', () => {
  const dataset = buildSemanticVoxelPatchDataset({
    knowledgeBase: {
      cases: [{
        case_id: 'limited-without-areas',
        case_version: 'sha256:limited',
        title: 'Limited Unapproved Case',
        file: 'House/Limited Unapproved Case.schematic',
        identity: { style_family: 'modern', typology: 'house', category: 'House', scale_bucket: 'small' },
        review: { status: 'limited', confidence: 0.4, approved_learning_areas: [], blocked_learning_areas: [] },
        tags: { facade: [{ id: 'large-glass' }], site: [{ id: 'garden' }] },
        knowledge_units: [
          unit('limited-facade', 'facade', 'Use a large glass facade before review approval.', ['FacadeAgent']),
          unit('limited-site', 'site', 'Use a small garden before review approval.', ['TemplateSiteSceneStrategy'])
        ],
        priority: { global_score: 40, risk_penalty: 12 },
        retrieval: { search_tokens: ['modern', 'large-glass', 'garden'] },
        risk_controls: ['review areas before learning']
      }]
    }
  });

  assert.equal(dataset.patch_count, 0);
});

function knowledgeBaseFixture() {
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
        tags: {
          style: [{ id: 'modern' }],
          typology: [{ id: 'house' }],
          site: [{ id: 'water-edge' }, { id: 'garden' }],
          facade: [{ id: 'large-glass' }],
          interior: [{ id: 'furnished' }],
          roof: [{ id: 'flat-terrace' }]
        },
        knowledge_units: [
          unit('lake-site', 'site', 'Connect a quiet garden court to the water-edge deck.', ['TemplateSiteSceneStrategy']),
          unit('lake-facade', 'facade', 'Use large glass bays with thin trim for view-facing rooms.', ['FacadeAgent']),
          unit('lake-interior', 'interior', 'Use focal walls, seating groups, and layered lighting for inhabited rooms.', ['InteriorDetailAgent', 'DecoratorAgent']),
          unit('lake-roof', 'roof', 'Use a flat roof terrace with guarded edges and service access.', ['RoofAgent'])
        ],
        priority: { global_score: 92, risk_penalty: 0 },
        retrieval: {
          search_tokens: ['modern', 'lake', 'villa', 'water-edge', 'large-glass', 'interior', 'roof-terrace'],
          prompt_affinities: ['modern', 'house', 'waterfront', 'large-glass', 'interior'],
          diversity_slots: ['site', 'facade', 'interior', 'roof']
        },
        risk_controls: ['change exact dimensions and detail placement; do not copy block-for-block']
      },
      {
        case_id: 'house-japanese-courtyard',
        case_version: 'sha256:japanese',
        title: 'Japanese Courtyard House',
        file: 'House/Japanese Courtyard House.schematic',
        identity: { style_family: 'japanese', typology: 'house', category: 'House', scale_bucket: 'medium' },
        review: { status: 'limited', confidence: 0.8, approved_learning_areas: ['site', 'roof'], blocked_learning_areas: [] },
        tags: {
          style: [{ id: 'japanese' }],
          typology: [{ id: 'house' }],
          site: [{ id: 'courtyard' }],
          roof: [{ id: 'layered-eaves' }]
        },
        knowledge_units: [
          unit('jp-site', 'site', 'Use a framed courtyard garden as a calm center.', ['TemplateSiteSceneStrategy']),
          unit('jp-roof', 'roof', 'Use layered eaves and deep overhang rhythm.', ['RoofAgent'])
        ],
        priority: { global_score: 74, risk_penalty: 6 },
        retrieval: { search_tokens: ['japanese', 'courtyard', 'garden', 'layered-eaves'], prompt_affinities: ['courtyard', 'quiet'] },
        risk_controls: ['use only reviewed site and roof lessons']
      }
    ]
  };
}

function neuralLabelsFixture() {
  return [
    {
      case_id: 'house-modern-lake-villa',
      suggested_tags: [
        { group: 'facade', id: 'large-glass', confidence: 0.88, evidence: ['fixture label'] },
        { group: 'site', id: 'water-edge', confidence: 0.9, evidence: ['fixture label'] },
        { group: 'interior', id: 'furnished', confidence: 0.84, evidence: ['fixture label'] },
        { group: 'roof', id: 'flat-terrace', confidence: 0.82, evidence: ['fixture label'] }
      ],
      suggested_learning_areas: [
        { area: 'facade', confidence: 0.86, evidence: ['fixture learning area'] },
        { area: 'interior', confidence: 0.82, evidence: ['fixture learning area'] },
        { area: 'site', confidence: 0.84, evidence: ['fixture learning area'] }
      ]
    }
  ];
}

function unit(id, area, claim, targets) {
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

function patchCandidateFixture({
  patch_id,
  category,
  tags = [],
  confidence = 0.8,
  evidence = ['fixture evidence'],
  risk_controls = [],
  semantic_voxels
}) {
  const voxels = semantic_voxels || [
    { x: 0, y: 0, z: 0, role: 'frame', occupancy: 'solid' },
    { x: 1, y: 0, z: 0, role: 'detail', occupancy: 'replaceable' },
    { x: 2, y: 0, z: 0, role: 'opening', occupancy: 'air' }
  ];
  return {
    patch_id,
    case_id: `${patch_id}-case`,
    title: `${patch_id} patch`,
    category,
    tags,
    semantic_voxels: voxels.map((voxel) => ({
      ...voxel,
      material_role: voxel.material_role || 'fixture',
      confidence,
      evidence
    })),
    risk_controls
  };
}
