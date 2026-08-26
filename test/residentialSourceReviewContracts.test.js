import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateReviewRecord,
  validateSourceProfile
} from '../src/training/residential/contracts/index.js';
import {
  validReviewRecordFixture,
  validSourceProfileFixture
} from './fixtures/residentialContractFixtures.js';

test('SourceProfile validates immutable identity and contiguous decisions', () => {
  const result = validateSourceProfile(validSourceProfileFixture());
  assert.ok(Object.isFrozen(result));
  assert.equal(result.status, 'eligible');
  assert.equal(result.decisions.at(-1).to_status, 'eligible');
});

test('SourceProfile rejects broken decision history and unsupported formats', () => {
  const history = validSourceProfileFixture();
  history.decisions[1].from_status = 'eligible';
  assert.throws(
    () => validateSourceProfile(history),
    /SOURCE_PROFILE_DECISION_DISCONTIGUOUS/u
  );

  const format = validSourceProfileFixture();
  format.artifact.format = 'litematic';
  assert.throws(
    () => validateSourceProfile(format),
    /CONTRACT_ENUM_INVALID/u
  );
});

test('ReviewRecord validates completed golden review evidence', () => {
  const result = validateReviewRecord(validReviewRecordFixture());
  assert.ok(Object.isFrozen(result));
  assert.equal(result.kind, 'golden');
  assert.equal(result.field_decisions[0].action, 'confirm');
});

test('ReviewRecord enforces pending and completed reviewer fields', () => {
  const pending = validReviewRecordFixture();
  pending.status = 'pending';
  pending.reviewer = 'fixture-reviewer';
  pending.reviewed_at = null;
  pending.field_decisions = [];
  assert.throws(
    () => validateReviewRecord(pending),
    /REVIEW_RECORD_PENDING_REVIEWER/u
  );

  const complete = validReviewRecordFixture();
  complete.reviewer = '';
  assert.throws(
    () => validateReviewRecord(complete),
    /CONTRACT_STRING_INVALID/u
  );
});

test('ReviewRecord rejects malformed pending decisions through the contract', () => {
  const pending = validReviewRecordFixture();
  pending.status = 'pending';
  pending.reviewer = '';
  pending.reviewed_at = null;
  pending.field_decisions = null;
  assert.throws(
    () => validateReviewRecord(pending),
    /CONTRACT_ARRAY_INVALID: ReviewRecord\.field_decisions/u
  );
});
