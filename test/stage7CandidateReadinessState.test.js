import assert from 'node:assert/strict';
import test from 'node:test';
import { CandidateReadinessError } from '../src/construction/learning/stage7CandidateBoundary.js';
import {
  createSyntheticReadinessEvent,
  reduceCandidateReadiness,
  validateReadinessEvent
} from '../src/construction/learning/stage7CandidateReadinessState.js';

const ID = 'synthetic-source:house-01';
const HASH = 'a'.repeat(64);

test('synthetic events bind mandatory non-authorization and a stable hash', () => {
  const event = eventFixture();
  assert.deepEqual(validateReadinessEvent(event), event);
  assert.equal(event.synthetic_only, true);
  assert.equal(event.authorizes_acquisition, false);
  assert.equal(event.authorizes_training, false);
  assert.equal(event.authorizes_dataset_admission, false);
  assert.match(event.event_sha256, /^[a-f0-9]{64}$/u);
  assert.equal(Object.isFrozen(event), true);
});

test('reducer permits the ordered readiness evidence path', () => {
  const states = [
    'named_batch_approved', 'acquired_quarantine', 'bytes_verified',
    'format_validated', 'structure_validated', 'completeness_validated',
    'prepared', 'fingerprinted', 'duplicate_clustered', 'pilot_ready'
  ];
  const events = [];
  let before = 'admission_contract_ready';
  let previous = null;
  states.forEach((after, index) => {
    const event = eventFixture({
      revision: index + 1,
      stateBefore: before,
      stateAfter: after,
      previousEventSha256: previous
    });
    events.push(event);
    before = after;
    previous = event.event_sha256;
  });
  assert.deepEqual(reduceCandidateReadiness(events, ID), {
    candidate_id: ID,
    revision: 10,
    state: 'pilot_ready',
    terminal: false,
    latest_event_sha256: previous
  });
});

test('every R2 terminal state is fail-closed from its exact allowed predecessor', () => {
  for (const [stateBefore, terminalState] of [
    ['admission_contract_ready', 'deferred_rights'],
    ['admission_contract_ready', 'deferred_label'],
    ['acquired_quarantine', 'quarantined_technical'],
    ['structure_validated', 'deferred_incomplete'],
    ['structure_validated', 'deferred_oversized_public'],
    ['fingerprinted', 'rejected_duplicate'],
    ['duplicate_clustered', 'rejected_quality']
  ]) {
    const events = pathTo(stateBefore);
    const terminal = eventFixture({
      revision: events.length + 1,
      stateBefore,
      stateAfter: terminalState,
      previousEventSha256: events.at(-1)?.event_sha256 ?? null
    });
    const reduced = reduceCandidateReadiness([...events, terminal], ID);
    assert.equal(reduced.state, terminalState);
    assert.equal(reduced.terminal, true);
  }
});

test('reducer rejects skipped, reversed, broken-chain, and post-terminal transitions', () => {
  assert.throws(() => reduceCandidateReadiness([
    eventFixture({ stateAfter: 'format_validated' })
  ], ID), hasCode('READINESS_TRANSITION_INVALID'));
  const terminal = eventFixture({ stateAfter: 'deferred_rights' });
  const later = eventFixture({
    revision: 2,
    stateBefore: 'deferred_rights',
    stateAfter: 'named_batch_approved',
    previousEventSha256: terminal.event_sha256
  });
  assert.throws(() => reduceCandidateReadiness([terminal, later], ID), hasCode('READINESS_TRANSITION_INVALID'));
  const broken = eventFixture({ revision: 2, stateBefore: 'named_batch_approved', stateAfter: 'acquired_quarantine' });
  assert.throws(() => reduceCandidateReadiness([eventFixture(), broken], ID), hasCode('READINESS_PREVIOUS_HASH_INVALID'));
});

test('validation rejects any authorization marker or event-hash tampering', () => {
  const event = eventFixture();
  assert.throws(() => validateReadinessEvent({ ...event, authorizes_training: true }), hasCode('READINESS_MARKERS_INVALID'));
  assert.throws(() => validateReadinessEvent({ ...event, event_sha256: 'b'.repeat(64) }), hasCode('READINESS_EVENT_HASH_INVALID'));
});

function eventFixture({
  revision = 1,
  stateBefore = 'admission_contract_ready',
  stateAfter = 'named_batch_approved',
  previousEventSha256 = null
} = {}) {
  return createSyntheticReadinessEvent({
    candidateId: ID,
    revision,
    eventType: stateAfter,
    stateBefore,
    stateAfter,
    recordedAt: `2026-07-20T00:00:${String(revision).padStart(2, '0')}.000Z`,
    recordedBy: 'synthetic-test',
    reasonCodes: [],
    evidenceHashes: { fixture_sha256: HASH },
    previousEventSha256
  });
}

function pathTo(target) {
  const path = [
    'named_batch_approved', 'acquired_quarantine', 'bytes_verified',
    'format_validated', 'structure_validated', 'completeness_validated',
    'prepared', 'fingerprinted', 'duplicate_clustered', 'pilot_ready'
  ];
  if (target === 'admission_contract_ready') return [];
  const end = path.indexOf(target);
  const events = [];
  let before = 'admission_contract_ready';
  let previous = null;
  for (let index = 0; index <= end; index += 1) {
    const event = eventFixture({
      revision: index + 1,
      stateBefore: before,
      stateAfter: path[index],
      previousEventSha256: previous
    });
    events.push(event);
    before = path[index];
    previous = event.event_sha256;
  }
  return events;
}

function hasCode(code) {
  return (error) => error instanceof CandidateReadinessError && error.code === code;
}
