import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REVIEW_DECISIONS,
  REVIEW_WAVES,
  RIGHTS_CONCLUSIONS,
  SOURCE_EXPANSION_SCHEMA_VERSION,
  SourceExpansionContractError,
  parseValidatedJsonl,
  validateDiscoveryRecord,
  validateIsoDate,
  validateReviewDecision,
  validateRightsRecord
} from '../src/construction/learning/stage7SourceExpansionContracts.js';
import {
  candidateFixture,
  decisionFixture,
  rightsFixture
} from './fixtures/stage7SourceExpansionFixtures.js';

test('contracts accept complete synthetic metadata and deeply freeze independent copies', () => {
  const candidateInput = candidateFixture();
  const rightsInput = rightsFixture();
  const decisionInput = decisionFixture();

  const candidate = validateDiscoveryRecord(candidateInput);
  const rights = validateRightsRecord(rightsInput);
  const decision = validateReviewDecision(decisionInput);

  assert.notEqual(candidate, candidateInput);
  assert.notEqual(rights, rightsInput);
  assert.notEqual(decision, decisionInput);
  assert.equal(Object.isFrozen(candidate), true);
  assert.equal(Object.isFrozen(candidate.signals), true);
  assert.equal(Object.isFrozen(rights.permissions), true);
  assert.equal(Object.isFrozen(rights.authoritative_urls), true);
  assert.equal(decision.decision, 'accept');
  assert.equal(candidate.oversized, false);
  assert.equal(SOURCE_EXPANSION_SCHEMA_VERSION, 1);
  assert.deepEqual(RIGHTS_CONCLUSIONS, ['verified', 'deferred', 'private_research_only', 'rejected']);
  assert.deepEqual(REVIEW_DECISIONS, ['accept', 'defer', 'reject']);
  assert.deepEqual(REVIEW_WAVES, ['discovery', 'yield']);

  candidateInput.signals.popularity = 999;
  rightsInput.permissions.download = false;
  assert.equal(candidate.signals.popularity, 100);
  assert.equal(rights.permissions.download, true);
});

test('discovery contract derives oversized metadata and accepts explicit unknown signal values', () => {
  const signals = Object.fromEntries(
    Object.keys(candidateFixture().signals).map((key) => [key, null])
  );
  const oversized = validateDiscoveryRecord(candidateFixture({
    published_at: null,
    public_dimensions: { x: 65, y: 1, z: 1 },
    signals
  }));

  assert.equal(oversized.oversized, true);
  assert.equal(oversized.published_at, null);
  assert.equal(oversized.signals.popularity, null);

  const dimensionsUnknown = validateDiscoveryRecord(candidateFixture({ public_dimensions: null }));
  assert.equal(dimensionsUnknown.oversized, false);
});

test('discovery rejects insecure URLs, unbound identity, missing authors, invalid metrics, and unknown fields', () => {
  assertCode(
    () => validateDiscoveryRecord(candidateFixture({ canonical_url: 'http://example.invalid/item' })),
    'URL_NOT_HTTPS'
  );
  assertCode(
    () => validateDiscoveryRecord(candidateFixture({ candidate_id: 'source-a:different' })),
    'CANDIDATE_ID_MISMATCH'
  );
  assertCode(() => validateDiscoveryRecord(candidateFixture({ author: '' })), 'STRING_INVALID');
  assertCode(
    () => validateDiscoveryRecord(candidateFixture({
      signals: { ...candidateFixture().signals, popularity: -1 }
    })),
    'SIGNAL_INVALID'
  );
  assertCode(
    () => validateDiscoveryRecord(candidateFixture({
      signals: { ...candidateFixture().signals, reception: Number.POSITIVE_INFINITY }
    })),
    'SIGNAL_INVALID'
  );
  assertCode(
    () => validateDiscoveryRecord(candidateFixture({
      signals: { ...candidateFixture().signals, duplicate_risk: 1.01 }
    })),
    'SIGNAL_INVALID'
  );
  assertCode(
    () => validateDiscoveryRecord(candidateFixture({ unexpected: true })),
    'DISCOVERY_KEYS_INVALID'
  );
  assertCode(
    () => validateDiscoveryRecord(candidateFixture({ oversized: false })),
    'DISCOVERY_KEYS_INVALID'
  );
});

test('discovery requires exact nested keys and positive safe dimensions', () => {
  assertCode(
    () => validateDiscoveryRecord(candidateFixture({ public_dimensions: { x: 1, y: 1, z: 1, t: 1 } })),
    'DIMENSIONS_KEYS_INVALID'
  );
  assertCode(
    () => validateDiscoveryRecord(candidateFixture({ public_dimensions: { x: 0, y: 1, z: 1 } })),
    'DIMENSION_INVALID'
  );
  assertCode(
    () => validateDiscoveryRecord(candidateFixture({ public_dimensions: { x: 1.5, y: 1, z: 1 } })),
    'DIMENSION_INVALID'
  );
  assertCode(
    () => validateDiscoveryRecord(candidateFixture({
      signals: { ...candidateFixture().signals, unknown: 0 }
    })),
    'SIGNALS_KEYS_INVALID'
  );
});

test('rights contract requires complete exact evidence fields', () => {
  assertCode(
    () => validateRightsRecord(rightsFixture({ authoritative_urls: ['http://example.invalid/license'] })),
    'URL_NOT_HTTPS'
  );
  assertCode(() => validateRightsRecord(rightsFixture({ author_chain: [] })), 'ARRAY_INVALID');
  assertCode(
    () => validateRightsRecord(rightsFixture({
      permissions: { ...rightsFixture().permissions, training: 'yes' }
    })),
    'BOOLEAN_INVALID'
  );
  assertCode(
    () => validateRightsRecord(rightsFixture({
      permissions: { ...rightsFixture().permissions, publish: true }
    })),
    'PERMISSIONS_KEYS_INVALID'
  );
  assertCode(() => validateRightsRecord(rightsFixture({ conclusion: 'assumed' })), 'CONCLUSION_INVALID');
  assertCode(() => validateRightsRecord(rightsFixture({ revision: 0 })), 'REVISION_INVALID');
});

test('review contract rejects unsupported values and incomplete reviewer identity', () => {
  assertCode(() => validateReviewDecision(decisionFixture({ decision: 'maybe' })), 'DECISION_INVALID');
  assertCode(() => validateReviewDecision(decisionFixture({ wave: 'third' })), 'WAVE_INVALID');
  assertCode(() => validateReviewDecision(decisionFixture({ decided_by: '' })), 'STRING_INVALID');
  assertCode(
    () => validateReviewDecision(decisionFixture({ extra: true })),
    'REVIEW_KEYS_INVALID'
  );
});

test('date validation rejects impossible calendar dates and invalid date shapes', () => {
  assert.equal(validateIsoDate('2024-02-29', 'leap'), '2024-02-29');
  assertCode(() => validateIsoDate('2026-02-29', 'not-leap'), 'DATE_INVALID');
  assertCode(() => validateIsoDate('2026-02-30', 'normalized-by-Date'), 'DATE_INVALID');
  assertCode(() => validateDiscoveryRecord(candidateFixture({ observed_at: '2026/07/16' })), 'DATE_INVALID');
});

test('JSONL parsing validates rows and rejects duplicate record identities', () => {
  const first = candidateFixture();
  const second = candidateFixture({
    candidate_id: 'source-b:tower-02',
    source_id: 'source-b',
    asset_id: 'tower-02'
  });
  const parsed = parseValidatedJsonl(
    `${JSON.stringify(first)}\n\n${JSON.stringify(second)}\n`,
    validateDiscoveryRecord
  );
  assert.equal(parsed.length, 2);
  assert.equal(Object.isFrozen(parsed), true);

  assertCode(
    () => parseValidatedJsonl(`${JSON.stringify(first)}\n${JSON.stringify(first)}\n`, validateDiscoveryRecord),
    'RECORD_DUPLICATE'
  );
  assertCode(() => parseValidatedJsonl('{broken\n', validateDiscoveryRecord), 'JSONL_INVALID');
  assertCode(() => parseValidatedJsonl(null, validateDiscoveryRecord), 'JSONL_INVALID');
});

function assertCode(action, code) {
  assert.throws(
    action,
    (error) => error instanceof SourceExpansionContractError && error.code === code
  );
}
