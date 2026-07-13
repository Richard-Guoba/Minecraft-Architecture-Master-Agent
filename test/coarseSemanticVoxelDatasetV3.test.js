import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  buildStage7DatasetCase,
  STAGE7_DATASET_EXTRACTOR_V3
} from '../src/construction/learning/coarseSemanticVoxelDatasetCase.js';
import { oneFloorHouseV3Fixture } from './fixtures/stage7DatasetV3Fixtures.js';
import { reviewedCaseFixture } from './fixtures/stage7DatasetFixtures.js';

test('v3 case is automated separately from human semantic acceptance', () => {
  const volume = oneFloorHouseV3Fixture();
  const caseRecord = reviewedCaseFixture();
  const first = buildStage7DatasetCase({
    volume,
    caseRecord,
    reviewRecord: null,
    datasetVersion: 'v3',
    localArtifactRoot: '.tmp/v3-test'
  });
  assert.equal(first.record.dataset_version, 'v3');
  assert.equal(first.record.extraction.extractor_version, STAGE7_DATASET_EXTRACTOR_V3);
  assert.match(first.record.artifacts.review_plan_sha256, /^[a-f0-9]{64}$/);
  assert.equal(first.record.training.eligible, false);
  assert.ok(first.record.training.blockers.includes('v3-semantic-review-unbound'));
  assert.notEqual(first.record.extraction.semantic_status, 'accepted');
});

test('v3 unreviewed front remains diagnostic-only and cannot become accepted', () => {
  const volume = oneFloorHouseV3Fixture();
  const caseRecord = reviewedCaseFixture();
  caseRecord.review.canonical_front_side = null;
  const result = buildStage7DatasetCase({ volume, caseRecord, datasetVersion: 'v3' });
  assert.equal(result.record.normalized_transform.front_side, 'south');
  assert.ok(result.record.extraction.warnings.includes(
    'canonical front side is unreviewed; south used for diagnostics'
  ));
  assert.ok(result.record.training.blockers.includes('canonical-front-side-unreviewed'));
  assert.notEqual(result.record.extraction.semantic_status, 'accepted');
});

test('exact v3 plan-bound positive review can accept an automated-valid fixture', () => {
  const volume = oneFloorHouseV3Fixture();
  const caseRecord = reviewedCaseFixture();
  const preview = buildStage7DatasetCase({ volume, caseRecord, datasetVersion: 'v3' });
  const reviewRecord = {
    record_id: 'fixture-v3-review',
    case_id: caseRecord.case_id,
    source_sha256: volume.source_sha256,
    reviewed_by: 'fixture-curator',
    reviewed_at: '2026-07-13T00:00:00.000Z',
    status: 'limited',
    source_author: 'fixture-author',
    source_uploader: 'fixture-uploader',
    author_evidence: 'Fixture provenance.',
    canonical_front_side: 'south',
    license_status: 'verified',
    allowed_uses: ['local-analysis', 'local-training'],
    license_evidence: 'Fixture-only permission.',
    approved_learning_areas: ['envelope', 'site', 'space'],
    blocked_learning_areas: [],
    semantic_corrections: [],
    notes: '',
    dataset_version: 'v3',
    extractor_version: STAGE7_DATASET_EXTRACTOR_V3,
    plan_sha256: preview.record.artifacts.review_plan_sha256
  };
  const accepted = buildStage7DatasetCase({
    volume,
    caseRecord,
    reviewRecord,
    datasetVersion: 'v3'
  });
  assert.equal(accepted.record.extraction.automated_semantic_status, 'accepted');
  assert.equal(accepted.record.extraction.semantic_status, 'accepted');
  assert.equal(accepted.record.training.eligible, true);
});

test('one-floor v3 fixture matches the reviewed golden transform, layers, topology, blockers, and hash', async () => {
  const result = buildStage7DatasetCase({
    volume: oneFloorHouseV3Fixture(),
    caseRecord: reviewedCaseFixture(),
    datasetVersion: 'v3'
  });
  const actual = {
    source: 'stage7-dataset-v3-fixture-golden-v1',
    schema_version: 1,
    fixture: 'one-floor-house-v3',
    extractor_version: result.record.extraction.extractor_version,
    transform: result.record.normalized_transform,
    layer_counts: result.record.extraction.stats.layer_counts,
    topology: result.record.extraction.topology,
    automated_semantic_status: result.record.extraction.automated_semantic_status,
    blockers: result.record.extraction.blockers,
    review_plan_sha256: result.record.artifacts.review_plan_sha256
  };
  const goldenUrl = new URL('./fixtures/stage7DatasetV3Golden.json', import.meta.url);
  if (process.env.UPDATE_STAGE7_V3_GOLDEN === '1') {
    await fs.writeFile(goldenUrl, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
  }
  const expected = JSON.parse(await fs.readFile(goldenUrl, 'utf8'));
  assert.deepEqual(actual, expected);
});
