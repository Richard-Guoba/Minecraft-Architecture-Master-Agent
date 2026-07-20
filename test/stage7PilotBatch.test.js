import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PILOT_BATCH_SCHEMA_VERSION,
  PilotContractError,
  canonicalPilotJson,
  hashPilotValue,
  reserveEligible,
  selectPilotCandidate,
  validatePilotBatchDocument
} from '../src/construction/learning/stage7PilotBatch.js';
import {
  pilotBatchFixture,
  resignPilotBatch
} from './fixtures/stage7PilotFixtures.js';

function hasCode(code) {
  return (error) => error instanceof PilotContractError && error.code === code;
}

function mutateCandidate(document, candidateId, mutator) {
  const copy = structuredClone(document);
  const candidate = copy.batch.candidates.find((item) => item.candidate_id === candidateId);
  mutator(candidate, copy);
  return resignPilotBatch(copy);
}

test('valid 5+3 batch is canonical, hash-bound, diverse, and deeply frozen', () => {
  const input = pilotBatchFixture();
  const result = validatePilotBatchDocument(input);
  assert.equal(PILOT_BATCH_SCHEMA_VERSION, 1);
  assert.equal(result.batch_sha256, hashPilotValue(result.batch));
  assert.equal(result.approval.approved_batch_sha256, result.batch_sha256);
  assert.equal(result.batch.candidates.filter((item) => item.role === 'primary').length, 5);
  assert.equal(result.batch.candidates.filter((item) => item.role === 'reserve').length, 3);
  assert.equal(new Set(result.batch.candidates.filter((item) => item.role === 'primary')
    .map((item) => item.source_group)).size, 5);
  assert.equal(new Set(result.batch.candidates.filter((item) => item.role === 'primary')
    .map((item) => item.building_type)).size, 5);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.batch.candidates[0].rights.permissions), true);
  input.batch.candidates[0].building_type = 'changed';
  assert.equal(result.batch.candidates[0].building_type, 'house');
  assert.equal(canonicalPilotJson({ z: 1, a: { y: 2, x: 3 } }),
    '{"a":{"x":3,"y":2},"z":1}\n');
});

test('candidate identity, immutable URL, path, rights, and weighted score are exact', () => {
  const candidate = selectPilotCandidate(pilotBatchFixture(), 'source-a:house-01');
  assert.equal(candidate.candidate_id, `${candidate.source_id}:house-01`);
  assert.equal(candidate.canonical_file_url.includes(candidate.immutable_revision), true);
  assert.equal(new URL(candidate.canonical_file_url).pathname.endsWith(
    `/${candidate.relative_nbt_path}`), true);
  assert.equal(Object.values(candidate.rights.permissions).every(Boolean), true);
  const scores = candidate.scores;
  assert.equal(Math.abs(scores.total - (
    0.45 * scores.parser_reliability
      + 0.30 * scores.quality
      + 0.15 * scores.diversity
      + 0.10 * scores.source_stability
  )) <= 1e-12, true);
  assert.throws(
    () => selectPilotCandidate(pilotBatchFixture(), 'source-z:missing'),
    hasCode('PILOT_CANDIDATE_NOT_APPROVED')
  );
});

test('batch and approval hashes cannot drift', () => {
  const hashDrift = pilotBatchFixture();
  hashDrift.batch.candidates[0].style_family = 'changed';
  assert.throws(() => validatePilotBatchDocument(hashDrift),
    hasCode('PILOT_BATCH_HASH_INVALID'));

  const approvalDrift = pilotBatchFixture({
    approval: { approved_batch_sha256: '0'.repeat(64) }
  });
  assert.throws(() => validatePilotBatchDocument(approvalDrift),
    hasCode('PILOT_APPROVAL_INVALID'));
});

test('rights and training permission fail closed', () => {
  for (const [mutator, code] of [
    [(candidate) => { candidate.rights.permissions.training = false; }, 'PILOT_RIGHTS_INVALID'],
    [(candidate) => { candidate.rights.ai_ml_restriction = true; }, 'PILOT_RIGHTS_INVALID'],
    [(candidate) => { candidate.rights.platform_conflict = true; }, 'PILOT_RIGHTS_INVALID'],
    [(candidate) => { candidate.rights.verified_at = '2026-07-19'; }, 'PILOT_RIGHTS_INVALID'],
    [(candidate) => { candidate.admission_state = 'rights_pending'; }, 'PILOT_CANDIDATE_INVALID']
  ]) {
    const document = mutateCandidate(pilotBatchFixture(), 'source-a:house-01', mutator);
    assert.throws(() => validatePilotBatchDocument(document), hasCode(code));
  }
});

test('candidate keys, revisions, paths, redirects, and scores are strict', () => {
  const cases = [
    [(candidate) => { candidate.extra = true; }, 'PILOT_CANDIDATE_INVALID'],
    [(candidate) => { candidate.immutable_revision = 'main'; }, 'PILOT_CANDIDATE_INVALID'],
    [(candidate) => { candidate.relative_nbt_path = '../house.nbt'; }, 'PILOT_CANDIDATE_INVALID'],
    [(candidate) => { candidate.relative_nbt_path = 'data\\house.nbt'; }, 'PILOT_CANDIDATE_INVALID'],
    [(candidate) => { candidate.relative_nbt_path = 'data/house.NBT'; }, 'PILOT_CANDIDATE_INVALID'],
    [(candidate) => { candidate.canonical_file_url = 'http://example.test/house.nbt'; }, 'PILOT_CANDIDATE_INVALID'],
    [(candidate) => { candidate.approved_redirect_urls = ['http://redirect.test/file.nbt']; }, 'PILOT_CANDIDATE_INVALID'],
    [(candidate) => { candidate.scores.total = 0.5; }, 'PILOT_SCORE_INVALID']
  ];
  for (const [mutator, code] of cases) {
    const document = mutateCandidate(pilotBatchFixture(), 'source-a:house-01', mutator);
    assert.throws(() => validatePilotBatchDocument(document), hasCode(code));
  }
});

test('candidate IDs, file identities, and source paths cannot duplicate', () => {
  for (const property of ['candidate_id', 'canonical_file_url']) {
    const document = pilotBatchFixture();
    document.batch.candidates[1][property] = document.batch.candidates[0][property];
    const signed = resignPilotBatch(document);
    assert.throws(() => validatePilotBatchDocument(signed),
      hasCode('PILOT_CANDIDATE_DUPLICATE'));
  }
  const sourcePathDuplicate = pilotBatchFixture();
  Object.assign(sourcePathDuplicate.batch.candidates[1], {
    source_id: sourcePathDuplicate.batch.candidates[0].source_id,
    relative_nbt_path: sourcePathDuplicate.batch.candidates[0].relative_nbt_path
  });
  assert.throws(() => validatePilotBatchDocument(resignPilotBatch(sourcePathDuplicate)),
    hasCode('PILOT_CANDIDATE_DUPLICATE'));
});

test('primary diversity and reserve binding are mandatory', () => {
  const insufficientTypes = pilotBatchFixture();
  for (const candidate of insufficientTypes.batch.candidates.filter((item) => item.role === 'primary')) {
    candidate.building_type = ['house', 'tower', 'temple'].at(
      insufficientTypes.batch.candidates.indexOf(candidate) % 3
    );
  }
  assert.throws(() => validatePilotBatchDocument(resignPilotBatch(insufficientTypes)),
    hasCode('PILOT_DIVERSITY_INVALID'));

  const orphan = mutateCandidate(pilotBatchFixture(), 'source-f:house-02', (candidate) => {
    candidate.reserve_for = 'source-z:missing';
  });
  assert.throws(() => validatePilotBatchDocument(orphan), hasCode('PILOT_RESERVE_INVALID'));

  const wrongType = mutateCandidate(pilotBatchFixture(), 'source-f:house-02', (candidate) => {
    candidate.building_type = 'tower';
  });
  assert.throws(() => validatePilotBatchDocument(wrongType), hasCode('PILOT_RESERVE_INVALID'));

  const fourthReserve = pilotBatchFixture();
  fourthReserve.batch.candidates.find((item) => item.candidate_id === 'source-e:ruin-01').role = 'reserve';
  fourthReserve.batch.candidates.find((item) => item.candidate_id === 'source-e:ruin-01').reserve_for = 'source-a:house-01';
  assert.throws(() => validatePilotBatchDocument(resignPilotBatch(fourthReserve)),
    hasCode('PILOT_RESERVE_INVALID'));
});

test('reserve eligibility requires its bound primary terminal and reserve untouched', () => {
  const document = pilotBatchFixture();
  assert.equal(reserveEligible(document, 'source-f:house-02', [{
    candidate_id: 'source-a:house-01', state: 'quarantined_technical', terminal: true
  }]), true);
  assert.throws(() => reserveEligible(document, 'source-f:house-02', [{
    candidate_id: 'source-a:house-01', state: 'fingerprinted', terminal: false
  }]), hasCode('PILOT_RESERVE_NOT_ELIGIBLE'));
  assert.throws(() => reserveEligible(document, 'source-f:house-02', [
    { candidate_id: 'source-a:house-01', state: 'quarantined_technical', terminal: true },
    { candidate_id: 'source-f:house-02', state: 'named_batch_approved', terminal: false }
  ]), hasCode('PILOT_RESERVE_NOT_ELIGIBLE'));
});
