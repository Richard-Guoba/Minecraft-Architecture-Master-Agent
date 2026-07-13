import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStage7V3ReviewScope } from '../src/construction/learning/stage7DatasetReviewScopeV3.js';

const expected = {
  sourceSha256: 'a'.repeat(64),
  extractorVersion: 'stage7-coarse-semantic-voxel-schematic-extractor-v3',
  reviewPlanSha256: 'c'.repeat(64)
};

test('only an exact v3 source, extractor, and plan binding applies', () => {
  const record = {
    source_sha256: expected.sourceSha256,
    dataset_version: 'v3',
    extractor_version: expected.extractorVersion,
    plan_sha256: expected.reviewPlanSha256,
    approved_learning_areas: ['envelope', 'site', 'space'],
    blocked_learning_areas: []
  };
  assert.deepEqual(evaluateStage7V3ReviewScope({ reviewRecord: record, ...expected }), {
    applies: true,
    semanticAccepted: true,
    blockers: []
  });
  for (const changed of [
    { ...record, source_sha256: 'b'.repeat(64) },
    { ...record, extractor_version: 'stale-extractor' },
    { ...record, plan_sha256: 'd'.repeat(64) },
    { source_sha256: expected.sourceSha256 }
  ]) {
    assert.equal(evaluateStage7V3ReviewScope({
      reviewRecord: changed,
      ...expected
    }).applies, false);
  }
});

test('an exact scoped review with a blocked layer applies but rejects whole-case semantics', () => {
  const record = {
    source_sha256: expected.sourceSha256,
    dataset_version: 'v3',
    extractor_version: expected.extractorVersion,
    plan_sha256: expected.reviewPlanSha256,
    approved_learning_areas: ['envelope', 'site'],
    blocked_learning_areas: ['space']
  };
  const result = evaluateStage7V3ReviewScope({ reviewRecord: record, ...expected });
  assert.equal(result.applies, true);
  assert.equal(result.semanticAccepted, false);
  assert.deepEqual(result.blockers, ['v3-semantic-review-rejected']);
});
