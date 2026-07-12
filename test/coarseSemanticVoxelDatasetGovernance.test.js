import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStage7DatasetEligibility } from '../src/construction/learning/coarseSemanticVoxelDatasetGovernance.js';

const approved = {
  case_id: 'house-reviewed',
  source: { license_status: 'restricted', allowed_uses: ['local-analysis', 'local-training'] },
  review: {
    status: 'limited',
    approved_learning_areas: ['envelope', 'site', 'space'],
    blocked_learning_areas: [],
    canonical_front_side: 'south',
    reviewed_by: 'curator',
    reviewed_at: '2026-07-12T00:00:00.000Z'
  }
};

test('limited reviewed case is eligible only for explicitly approved Stage 7 layers', () => {
  const eligible = evaluateStage7DatasetEligibility({ caseRecord: approved });
  assert.equal(eligible.eligible, true);
  assert.deepEqual(eligible.permitted_layers, ['envelope', 'site', 'space']);
  assert.deepEqual(eligible.blockers, []);

  const blocked = evaluateStage7DatasetEligibility({
    caseRecord: { ...approved, review: { ...approved.review, approved_learning_areas: ['envelope', 'site'] } }
  });
  assert.equal(blocked.eligible, false);
  assert.ok(blocked.blockers.includes('learning-area-space-not-approved'));
});

test('pending or unknown-license cases never enter training', () => {
  const result = evaluateStage7DatasetEligibility({
    caseRecord: {
      case_id: 'house-pending',
      source: { license_status: 'unknown', allowed_uses: [] },
      review: { status: 'pending', approved_learning_areas: [], blocked_learning_areas: [], canonical_front_side: null }
    }
  });
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('review-status-pending'));
  assert.ok(result.blockers.includes('license-not-training-approved'));
  assert.ok(result.blockers.includes('canonical-front-side-unreviewed'));
});
