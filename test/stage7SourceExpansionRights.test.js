import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SourceExpansionContractError,
  validateDiscoveryRecord,
  validateRightsRecord
} from '../src/construction/learning/stage7SourceExpansionContracts.js';
import {
  evaluateRightsEvidence,
  evaluateRightsLedger,
  latestUniqueRevision
} from '../src/construction/learning/stage7SourceExpansionRights.js';
import {
  candidateFixture,
  rightsFixture
} from './fixtures/stage7SourceExpansionFixtures.js';

const AS_OF = '2026-07-16';

test('fresh complete human-reviewed evidence reaches rights_verified', () => {
  const result = evaluateRightsEvidence({
    candidate: validateDiscoveryRecord(candidateFixture()),
    evidence: validateRightsRecord(rightsFixture()),
    asOf: AS_OF
  });

  assert.deepEqual(result, {
    candidate_id: 'source-a:castle-01',
    state: 'rights_verified',
    rights_verified: true,
    evidence_revision: 1,
    blockers: []
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.blockers), true);
});

test('every independent rights blocker fails closed with a stable code', () => {
  const cases = [
    ['RIGHTS_MISSING', null],
    ['RIGHTS_STALE', rightsFixture({ observed_at: '2026-06-15' })],
    ['RIGHTS_FUTURE_DATED', rightsFixture({ observed_at: '2026-07-17' })],
    ['RIGHTS_SCOPE_INVALID', rightsFixture({ scope: 'collection-page' })],
    ['RIGHTS_AUTHOR_CHAIN_EMPTY', rightsFixture({ author_chain: [] })],
    ['RIGHTS_DOWNLOAD_DENIED', deniedPermission('download')],
    ['RIGHTS_COPY_DENIED', deniedPermission('copy')],
    ['RIGHTS_TRANSFORM_DENIED', deniedPermission('transform')],
    ['RIGHTS_TRAINING_DENIED', deniedPermission('training')],
    ['RIGHTS_DERIVATIVE_DENIED', deniedPermission('derivative_research_artifacts')],
    ['RIGHTS_RETENTION_DENIED', deniedPermission('local_retention')],
    ['RIGHTS_AI_ML_RESTRICTED', rightsFixture({ ai_ml_restriction: true })],
    ['RIGHTS_PLATFORM_CONFLICT', rightsFixture({ platform_conflict: true })],
    ['RIGHTS_UPSTREAM_CONFLICT', rightsFixture({ upstream_conflict: true })],
    ['RIGHTS_CONCLUSION_NOT_VERIFIED', rightsFixture({ conclusion: 'deferred' })]
  ];

  for (const [code, evidence] of cases) {
    const result = evaluateRightsEvidence({
      candidate: candidateFixture(),
      evidence,
      asOf: AS_OF
    });
    assert.equal(result.rights_verified, false, code);
    assert.equal(result.blockers.includes(code), true, code);
  }
});

test('verified label cannot override an AI restriction or stale evidence', () => {
  const restricted = evaluateRightsEvidence({
    candidate: candidateFixture(),
    evidence: rightsFixture({ observed_at: '2026-05-01', ai_ml_restriction: true }),
    asOf: AS_OF
  });

  assert.equal(restricted.rights_verified, false);
  assert.deepEqual(restricted.blockers, ['RIGHTS_AI_ML_RESTRICTED', 'RIGHTS_STALE']);
  assert.equal(restricted.state, 'deferred');
});

test('evidence is fresh through day 30 and stale on day 31', () => {
  const day30 = evaluateRightsEvidence({
    candidate: candidateFixture(),
    evidence: rightsFixture({ observed_at: '2026-06-16' }),
    asOf: AS_OF
  });
  const day31 = evaluateRightsEvidence({
    candidate: candidateFixture(),
    evidence: rightsFixture({ observed_at: '2026-06-15' }),
    asOf: AS_OF
  });

  assert.equal(day30.rights_verified, true);
  assert.deepEqual(day31.blockers, ['RIGHTS_STALE']);
});

test('non-verified conclusions retain explicit deferred/private/rejected states', () => {
  const deferred = evaluateRightsEvidence({
    candidate: candidateFixture(),
    evidence: rightsFixture({ conclusion: 'deferred' }),
    asOf: AS_OF
  });
  const privateOnly = evaluateRightsEvidence({
    candidate: candidateFixture(),
    evidence: rightsFixture({ conclusion: 'private_research_only' }),
    asOf: AS_OF
  });
  const rejected = evaluateRightsEvidence({
    candidate: candidateFixture(),
    evidence: rightsFixture({ conclusion: 'rejected' }),
    asOf: AS_OF
  });

  assert.equal(deferred.state, 'deferred');
  assert.equal(privateOnly.state, 'private_research_only');
  assert.equal(rejected.state, 'rejected');
});

test('latest revision selection is deterministic and rejects ambiguous latest evidence', () => {
  const revision1 = validateRightsRecord(rightsFixture({ revision: 1 }));
  const revision2 = validateRightsRecord(rightsFixture({ revision: 2 }));
  assert.equal(latestUniqueRevision([revision2, revision1], revision1.candidate_id), revision2);
  assert.equal(latestUniqueRevision([], revision1.candidate_id), null);

  assert.throws(
    () => latestUniqueRevision([revision2, revision2], revision1.candidate_id),
    (error) => error instanceof SourceExpansionContractError
      && error.code === 'RIGHTS_REVISION_AMBIGUOUS'
  );
});

test('ledger uses latest rights revisions, sorts candidates, and never mutates inputs', () => {
  const candidateA = validateDiscoveryRecord(candidateFixture());
  const candidateB = validateDiscoveryRecord(candidateFixture({
    candidate_id: 'source-b:tower-02',
    source_id: 'source-b',
    asset_id: 'tower-02'
  }));
  const candidates = [candidateB, candidateA];
  const rightsRecords = [
    validateRightsRecord(rightsFixture({ revision: 1, conclusion: 'deferred' })),
    validateRightsRecord(rightsFixture({ revision: 2 }))
  ];

  const results = evaluateRightsLedger({ candidates, rightsRecords, asOf: AS_OF });

  assert.deepEqual(results.map((entry) => entry.candidate_id), [
    'source-a:castle-01',
    'source-b:tower-02'
  ]);
  assert.equal(results[0].rights_verified, true);
  assert.equal(results[0].evidence_revision, 2);
  assert.deepEqual(candidates, [candidateB, candidateA]);
  assert.deepEqual(rightsRecords.map((record) => record.revision), [1, 2]);
  assert.equal(Object.isFrozen(results), true);
});

test('ledger rejects duplicate candidates and orphan rights records', () => {
  const candidate = validateDiscoveryRecord(candidateFixture());
  const orphan = validateRightsRecord(rightsFixture({ candidate_id: 'source-z:orphan-01' }));

  assert.throws(
    () => evaluateRightsLedger({ candidates: [candidate, candidate], rightsRecords: [], asOf: AS_OF }),
    (error) => error instanceof SourceExpansionContractError && error.code === 'CANDIDATE_DUPLICATE'
  );
  assert.throws(
    () => evaluateRightsLedger({ candidates: [candidate], rightsRecords: [orphan], asOf: AS_OF }),
    (error) => error instanceof SourceExpansionContractError && error.code === 'RIGHTS_ORPHAN'
  );
});

function deniedPermission(permission) {
  return rightsFixture({
    permissions: { ...rightsFixture().permissions, [permission]: false }
  });
}
