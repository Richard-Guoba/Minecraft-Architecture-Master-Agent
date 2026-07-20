import { createHash } from 'node:crypto';
import { CandidateReadinessError, assertCandidateId } from './stage7CandidateBoundary.js';

export const READINESS_SCHEMA_VERSION = 1;
export const READINESS_TERMINAL_STATES = Object.freeze([
  'deferred_rights', 'deferred_incomplete', 'deferred_oversized_public',
  'quarantined_technical', 'rejected_duplicate', 'deferred_label', 'rejected_quality'
]);
const FORWARD = Object.freeze({
  admission_contract_ready: 'named_batch_approved',
  named_batch_approved: 'acquired_quarantine',
  acquired_quarantine: 'bytes_verified',
  bytes_verified: 'format_validated',
  format_validated: 'structure_validated',
  structure_validated: 'completeness_validated',
  completeness_validated: 'prepared',
  prepared: 'fingerprinted',
  fingerprinted: 'duplicate_clustered',
  duplicate_clustered: 'pilot_ready'
});
const FAILURE_FROM = Object.freeze({
  deferred_rights: new Set(['admission_contract_ready', 'named_batch_approved']),
  deferred_incomplete: new Set(['structure_validated', 'fingerprinted']),
  deferred_oversized_public: new Set(['structure_validated']),
  quarantined_technical: new Set([
    'named_batch_approved', 'acquired_quarantine', 'bytes_verified', 'format_validated',
    'structure_validated', 'completeness_validated', 'prepared', 'fingerprinted'
  ]),
  rejected_duplicate: new Set(['fingerprinted']),
  deferred_label: new Set(['admission_contract_ready', 'fingerprinted']),
  rejected_quality: new Set(['fingerprinted', 'duplicate_clustered', 'pilot_ready'])
});
const EVENT_KEYS = new Set([
  'schema_version', 'candidate_id', 'revision', 'event_type', 'state_before',
  'state_after', 'recorded_at', 'recorded_by', 'reason_codes', 'evidence_hashes',
  'previous_event_sha256', 'event_sha256', 'synthetic_only',
  'authorizes_acquisition', 'authorizes_training', 'authorizes_dataset_admission'
]);

export function createSyntheticReadinessEvent({
  candidateId, revision, eventType, stateBefore, stateAfter, recordedAt,
  recordedBy, reasonCodes = [], evidenceHashes, previousEventSha256 = null
}) {
  return createReadinessEvent({
    candidateId, revision, eventType, stateBefore, stateAfter, recordedAt,
    recordedBy, reasonCodes, evidenceHashes, previousEventSha256
  }, true);
}

export function createOperationalReadinessEvent({
  candidateId, revision, eventType, stateBefore, stateAfter, recordedAt,
  recordedBy, reasonCodes = [], evidenceHashes, previousEventSha256 = null
}) {
  return createReadinessEvent({
    candidateId, revision, eventType, stateBefore, stateAfter, recordedAt,
    recordedBy, reasonCodes, evidenceHashes, previousEventSha256
  }, false);
}

function createReadinessEvent({
  candidateId, revision, eventType, stateBefore, stateAfter, recordedAt,
  recordedBy, reasonCodes, evidenceHashes, previousEventSha256
}, syntheticOnly) {
  const value = {
    schema_version: READINESS_SCHEMA_VERSION,
    candidate_id: assertCandidateId(candidateId),
    revision,
    event_type: eventType,
    state_before: stateBefore,
    state_after: stateAfter,
    recorded_at: recordedAt,
    recorded_by: recordedBy,
    reason_codes: [...reasonCodes],
    evidence_hashes: { ...evidenceHashes },
    previous_event_sha256: previousEventSha256,
    synthetic_only: syntheticOnly,
    authorizes_acquisition: syntheticOnly === false && stateAfter === 'named_batch_approved',
    authorizes_training: false,
    authorizes_dataset_admission: false
  };
  const eventSha256 = hashEvent(value);
  return validateReadinessEvent({ ...value, event_sha256: eventSha256 });
}

export function validateReadinessEvent(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || Object.keys(record).some((key) => !EVENT_KEYS.has(key))
    || Object.keys(record).length !== EVENT_KEYS.size) fail('READINESS_RECORD_INVALID', 'unknown');
  const id = assertCandidateId(record.candidate_id);
  if (record.schema_version !== READINESS_SCHEMA_VERSION
    || !Number.isSafeInteger(record.revision) || record.revision <= 0
    || typeof record.event_type !== 'string' || record.event_type !== record.state_after
    || typeof record.state_before !== 'string' || typeof record.state_after !== 'string'
    || Number.isNaN(Date.parse(record.recorded_at))
    || new Date(record.recorded_at).toISOString() !== record.recorded_at
    || typeof record.recorded_by !== 'string' || record.recorded_by.trim().length === 0
    || !Array.isArray(record.reason_codes)
    || record.reason_codes.some((value) => typeof value !== 'string' || value.length === 0)
    || !validHashes(record.evidence_hashes)
    || !(record.previous_event_sha256 === null || /^[a-f0-9]{64}$/u.test(record.previous_event_sha256))) {
    fail('READINESS_RECORD_INVALID', id);
  }
  const expectedAcquisition = record.synthetic_only === false
    && record.state_after === 'named_batch_approved';
  if (typeof record.synthetic_only !== 'boolean'
    || record.authorizes_acquisition !== expectedAcquisition
    || record.authorizes_training !== false || record.authorizes_dataset_admission !== false) {
    fail('READINESS_MARKERS_INVALID', id);
  }
  const expected = hashEvent(Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== 'event_sha256')
  ));
  if (record.event_sha256 !== expected) fail('READINESS_EVENT_HASH_INVALID', id);
  return deepFreeze(structuredClone(record));
}

export function reduceCandidateReadiness(records, candidateId) {
  const id = assertCandidateId(candidateId);
  const selected = records.filter((record) => record.candidate_id === id)
    .map(validateReadinessEvent)
    .sort((left, right) => left.revision - right.revision);
  if (selected.length === 0) return null;
  let expectedBefore = 'admission_contract_ready';
  let previous = null;
  selected.forEach((event, index) => {
    if (event.revision !== index + 1) fail('READINESS_REVISION_GAP', id);
    if (event.previous_event_sha256 !== previous) fail('READINESS_PREVIOUS_HASH_INVALID', id);
    if (event.state_before !== expectedBefore || !allowed(event.state_before, event.state_after)) {
      fail('READINESS_TRANSITION_INVALID', id, {
        state_before: event.state_before,
        state_after: event.state_after
      });
    }
    expectedBefore = event.state_after;
    previous = event.event_sha256;
  });
  return Object.freeze({
    candidate_id: id,
    revision: selected.length,
    state: expectedBefore,
    terminal: READINESS_TERMINAL_STATES.includes(expectedBefore),
    latest_event_sha256: previous
  });
}

function allowed(before, after) {
  return FORWARD[before] === after || FAILURE_FROM[after]?.has(before) === true;
}
function validHashes(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length > 0
    && Object.entries(value).every(([key, hash]) => /^[a-z0-9_]+$/u.test(key)
      && /^[a-f0-9]{64}$/u.test(hash));
}
function hashEvent(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function canonicalReadinessJson(value) { return `${canonical(value)}\n`; }
function canonical(value) { return JSON.stringify(sortKeys(value)); }
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  }
  return value;
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function fail(code, candidateId, safeDetail = {}) {
  throw new CandidateReadinessError(code, 'state', candidateId, safeDetail);
}
