import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDiscoveryRecord, validateReviewDecision } from '../src/construction/learning/stage7SourceExpansionContracts.js';
import { evaluateRightsLedger } from '../src/construction/learning/stage7SourceExpansionRights.js';
import { validateTaxonomyAssessment } from '../src/construction/learning/stage7ConditionalTaxonomy.js';
import {
  buildConditionalAdmissionSummary,
  evaluateConditionalAdmission,
  latestUniqueAssessment,
  renderConditionalAdmissionMarkdown
} from '../src/construction/learning/stage7ConditionalAdmission.js';
import { candidateFixture, decisionFixture, rightsFixture } from './fixtures/stage7SourceExpansionFixtures.js';
import { taxonomyAssessmentFixture } from './fixtures/stage7ConditionalAdmissionFixtures.js';

const AS_OF = '2026-07-18';

function auditInputs(overrides = {}) {
  const candidates = [validateDiscoveryRecord(candidateFixture())];
  const rightsResults = evaluateRightsLedger({
    candidates,
    rightsRecords: [rightsFixture({ observed_at: AS_OF })],
    asOf: AS_OF
  });
  return {
    candidates,
    rightsResults,
    reviewDecisions: [validateReviewDecision(decisionFixture({ decided_at: AS_OF }))],
    assessments: [validateTaxonomyAssessment(taxonomyAssessmentFixture())],
    ...overrides
  };
}

test('fresh rights, owner acceptance, and accepted complete taxonomy reach contract-ready only', () => {
  const [result] = evaluateConditionalAdmission(auditInputs());
  assert.equal(result.state, 'admission_contract_ready');
  assert.equal(result.authorizes_download, false);
  assert.equal(result.authorizes_training, false);
  assert.equal(result.authorizes_dataset_admission, false);
  assert.equal(result.taxonomy_revision, 1);
});

test('state machine fails closed at each missing or negative gate', () => {
  const base = auditInputs();
  assert.equal(evaluateConditionalAdmission({ ...base, rightsResults: [{
    ...base.rightsResults[0], rights_verified: false, state: 'deferred'
  }] })[0].state, 'rights_pending');
  assert.equal(evaluateConditionalAdmission({ ...base, reviewDecisions: [] })[0].state, 'human_review_pending');
  assert.equal(evaluateConditionalAdmission({
    ...base,
    reviewDecisions: [validateReviewDecision(decisionFixture({ decision: 'defer' }))]
  })[0].state, 'human_deferred');
  assert.equal(evaluateConditionalAdmission({ ...base, assessments: [] })[0].state, 'taxonomy_pending');
  assert.equal(evaluateConditionalAdmission({
    ...base,
    assessments: [validateTaxonomyAssessment(taxonomyAssessmentFixture({
      assessment_decision: 'defer', completeness: 'module',
      reason_codes: ['INCOMPLETE_MODULE']
    }))]
  })[0].state, 'deferred_incomplete');
});

test('latest assessment is unique and revision-selected', () => {
  const one = validateTaxonomyAssessment(taxonomyAssessmentFixture({ revision: 1 }));
  const two = validateTaxonomyAssessment(taxonomyAssessmentFixture({ revision: 2 }));
  assert.equal(latestUniqueAssessment([one, two], one.candidate_id), two);
  assert.throws(
    () => latestUniqueAssessment([two, two], one.candidate_id),
    (error) => error.code === 'ASSESSMENT_REVISION_AMBIGUOUS'
  );
});

test('orphan rights, reviews, or assessments fail instead of disappearing', () => {
  const base = auditInputs();
  assert.throws(
    () => evaluateConditionalAdmission({
      ...base,
      assessments: [validateTaxonomyAssessment(taxonomyAssessmentFixture({
        candidate_id: 'source-z:unknown'
      }))]
    }),
    (error) => error.code === 'ASSESSMENT_ORPHAN'
  );
  assert.throws(
    () => evaluateConditionalAdmission({
      ...base,
      assessments: [validateTaxonomyAssessment(taxonomyAssessmentFixture({
        source_group: 'source-z'
      }))]
    }),
    (error) => error.code === 'ASSESSMENT_SOURCE_MISMATCH'
  );
});

test('summary is aggregate, metadata-only, deterministic, and explicit about non-authorization', () => {
  const results = evaluateConditionalAdmission(auditInputs());
  const summary = buildConditionalAdmissionSummary(results);
  assert.equal(summary.contract_ready_count, 1);
  assert.equal(summary.metadata_only, true);
  assert.equal(summary.authorizes_download, false);
  assert.equal(summary.authorizes_training, false);
  assert.equal(summary.authorizes_dataset_admission, false);
  const markdown = renderConditionalAdmissionMarkdown(summary);
  assert.match(markdown, /does not authorize download, Dataset admission, or training/iu);
  assert.doesNotMatch(markdown, /\.schematic|checkpoint|loss/iu);
});
