import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TAG_TAXONOMY,
  validateTagRecord,
  loadTagTaxonomy
} from '../src/construction/templates/templateTagTaxonomy.js';
import {
  parseTemplateReviewOverlay,
  mergeReviewRecords,
  defaultReviewForCase
} from '../src/construction/templates/templateReviewOverlay.js';

test('tag taxonomy validates known tags and rejects unknown tags', async () => {
  const taxonomy = await loadTagTaxonomy();
  assert.deepEqual(Object.keys(taxonomy.groups).sort(), Object.keys(DEFAULT_TAG_TAXONOMY.groups).sort());

  const valid = validateTagRecord({
    group: 'quality',
    id: 'high-value-reference',
    confidence: 0.9,
    evidence: 'manual review'
  }, taxonomy);
  assert.equal(valid.ok, true);
  assert.equal(valid.normalized.group, 'quality');
  assert.equal(valid.normalized.id, 'high-value-reference');
  assert.equal(valid.normalized.confidence, 0.9);

  const invalid = validateTagRecord({ group: 'quality', id: 'unknown-quality' }, taxonomy);
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /unknown tag/i);
});

test('review overlay parser accepts valid lines and reports invalid lines', () => {
  const text = [
    JSON.stringify({
      record_id: 'review-1',
      case_id: 'house-tavern',
      reviewed_by: 'human',
      reviewed_at: '2026-07-09T00:00:00.000Z',
      status: 'approved',
      confidence: 0.9,
      approved_learning_areas: ['interior', 'site'],
      blocked_learning_areas: [],
      manual_tags: [{ group: 'quality', id: 'high-value-reference', confidence: 0.9, evidence: 'manual review' }],
      risk_overrides: [],
      notes: 'Useful tavern interior.'
    }),
    '{bad json',
    JSON.stringify({
      record_id: 'review-2',
      case_id: 'house-empty',
      reviewed_by: 'human',
      reviewed_at: '2026-07-09T00:01:00.000Z',
      status: 'rejected',
      confidence: 0.8
    })
  ].join('\n');

  const parsed = parseTemplateReviewOverlay(text);
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.errors[0].line, 2);
  assert.match(parsed.errors[0].message, /invalid json/i);
});

test('review overlay parser reports tag validation errors with line numbers', () => {
  const parsed = parseTemplateReviewOverlay(JSON.stringify({
    record_id: 'review-invalid-tag',
    case_id: 'house-tavern',
    reviewed_by: 'human',
    reviewed_at: '2026-07-09T00:00:00.000Z',
    status: 'approved',
    confidence: 0.9,
    manual_tags: [{ group: 'quality', id: 'not-in-taxonomy' }]
  }));

  assert.equal(parsed.records.length, 0);
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.errors[0].line, 1);
  assert.match(parsed.errors[0].message, /unknown tag quality:not-in-taxonomy/i);
});

test('review overlay merge uses newest record per case and preserves lineage', () => {
  const parsed = parseTemplateReviewOverlay([
    JSON.stringify({
      record_id: 'review-old',
      case_id: 'house-tavern',
      reviewed_by: 'human',
      reviewed_at: '2026-07-09T00:00:00.000Z',
      status: 'limited',
      confidence: 0.5,
      approved_learning_areas: ['site'],
      blocked_learning_areas: ['interior']
    }),
    JSON.stringify({
      record_id: 'review-new',
      case_id: 'house-tavern',
      reviewed_by: 'human',
      reviewed_at: '2026-07-09T01:00:00.000Z',
      status: 'approved',
      confidence: 0.95,
      approved_learning_areas: ['interior', 'site'],
      blocked_learning_areas: []
    })
  ].join('\n'));

  const merged = mergeReviewRecords(parsed.records);
  const review = merged.get('house-tavern');
  assert.equal(review.status, 'approved');
  assert.equal(review.confidence, 0.95);
  assert.deepEqual(review.review_record_ids, ['review-old', 'review-new']);
  assert.deepEqual(review.approved_learning_areas, ['interior', 'site']);
  assert.deepEqual(review.blocked_learning_areas, []);
});

test('default review marks unreviewed cases pending', () => {
  const review = defaultReviewForCase('house-watermill');
  assert.equal(review.status, 'pending');
  assert.equal(review.confidence, 0);
  assert.deepEqual(review.approved_learning_areas, []);
  assert.deepEqual(review.blocked_learning_areas, []);
  assert.deepEqual(review.review_record_ids, []);
});
