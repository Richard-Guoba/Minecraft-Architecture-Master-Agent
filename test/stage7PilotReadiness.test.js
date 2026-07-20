import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { decodeBoundedNbt } from '../src/construction/learning/stage7BoundedNbt.js';
import { CandidateReadinessError } from '../src/construction/learning/stage7CandidateBoundary.js';
import {
  canonicalReadinessJson,
  createOperationalReadinessEvent,
  createSyntheticReadinessEvent,
  reduceCandidateReadiness,
  validateReadinessEvent
} from '../src/construction/learning/stage7CandidateReadinessState.js';
import { appendSyntheticReadinessEvent } from '../src/construction/learning/stage7CandidateReadinessStore.js';
import {
  appendPilotReadinessEvent,
  readPilotReadinessLedger
} from '../src/construction/learning/stage7PilotReadinessStore.js';
import { ensurePilotLayout } from '../src/construction/learning/stage7PilotFilesystem.js';
import { fingerprintConditionalVolume } from '../src/construction/learning/stage7ConditionalFingerprint.js';
import { prepareConditionalVolume } from '../src/construction/learning/stage7ConditionalVoxelPreparation.js';
import { validateVanillaStructureNbt } from '../src/construction/learning/stage7VanillaStructureNbt.js';
import { structureNbt } from './fixtures/stage7CandidateReadinessFixtures.js';

const ID = 'synthetic-source:house-01';
const CONTENT_SHA = 'a'.repeat(64);

function hasCode(code) {
  return (error) => error instanceof CandidateReadinessError && error.code === code;
}

function validVolume() {
  return validateVanillaStructureNbt(decodeBoundedNbt(structureNbt(), {
    candidateId: ID
  }), { candidateId: ID });
}

test('preparation defaults to synthetic and explicit operational evidence stays non-authorizing', () => {
  const volume = validVolume();
  const synthetic = prepareConditionalVolume({
    candidateId: ID, contentSha256: CONTENT_SHA, volume
  });
  const operational = prepareConditionalVolume({
    candidateId: ID,
    contentSha256: CONTENT_SHA,
    volume,
    evidenceMode: 'operational'
  });
  assert.equal(synthetic.record.synthetic_only, true);
  assert.equal(operational.record.synthetic_only, false);
  assert.equal(operational.record.authorizes_acquisition, false);
  assert.equal(operational.record.authorizes_training, false);
  assert.equal(operational.record.authorizes_dataset_admission, false);
  const fingerprint = fingerprintConditionalVolume(operational);
  assert.equal(fingerprint.synthetic_only, false);
  assert.equal(fingerprint.authorizes_acquisition, false);
  assert.equal(fingerprint.authorizes_training, false);
  assert.equal(fingerprint.authorizes_dataset_admission, false);
  assert.throws(() => prepareConditionalVolume({
    candidateId: ID,
    contentSha256: CONTENT_SHA,
    volume,
    evidenceMode: 'training'
  }), hasCode('EVIDENCE_MODE_INVALID'));
});

test('operational authority is true only for named batch approval', () => {
  const approval = operationalEvent({
    revision: 1,
    before: 'admission_contract_ready',
    after: 'named_batch_approved'
  });
  const acquired = operationalEvent({
    revision: 2,
    before: 'named_batch_approved',
    after: 'acquired_quarantine',
    previous: approval.event_sha256
  });
  assert.equal(approval.synthetic_only, false);
  assert.equal(approval.authorizes_acquisition, true);
  assert.equal(acquired.authorizes_acquisition, false);
  for (const event of [approval, acquired]) {
    assert.equal(event.authorizes_training, false);
    assert.equal(event.authorizes_dataset_admission, false);
    assert.deepEqual(validateReadinessEvent(event), event);
  }
  assert.throws(() => validateReadinessEvent({
    ...acquired,
    authorizes_training: true
  }), hasCode('READINESS_MARKERS_INVALID'));
});

test('operational transport failure is terminal from named approval', () => {
  const approval = operationalEvent({
    revision: 1,
    before: 'admission_contract_ready',
    after: 'named_batch_approved'
  });
  const failed = operationalEvent({
    revision: 2,
    before: 'named_batch_approved',
    after: 'quarantined_technical',
    previous: approval.event_sha256,
    reasonCodes: ['HTTPS_STATUS_INVALID']
  });
  assert.deepEqual(reduceCandidateReadiness([approval, failed], ID), {
    candidate_id: ID,
    revision: 2,
    state: 'quarantined_technical',
    terminal: true,
    latest_event_sha256: failed.event_sha256
  });
});

test('post-fingerprint human failures use controlled terminal states', () => {
  for (const terminal of ['deferred_incomplete', 'deferred_label', 'rejected_quality']) {
    const events = chainThroughFingerprint();
    const prior = events.at(-1);
    const failed = operationalEvent({
      revision: prior.revision + 1,
      before: 'fingerprinted',
      after: terminal,
      previous: prior.event_sha256,
      reasonCodes: ['HUMAN_REVIEW_FAILED']
    });
    const result = reduceCandidateReadiness([...events, failed], ID);
    assert.equal(result.state, terminal);
    assert.equal(result.terminal, true);
  }
});

test('R2 synthetic store rejects operational records', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'stage7-candidate-readiness-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'manifests'));
  const operational = operationalEvent({
    revision: 1,
    before: 'admission_contract_ready',
    after: 'named_batch_approved'
  });
  await assert.rejects(
    appendSyntheticReadinessEvent(root, operational),
    hasCode('SYNTHETIC_EVENT_REQUIRED')
  );
  const synthetic = createSyntheticReadinessEvent({
    candidateId: ID,
    revision: 1,
    eventType: 'named_batch_approved',
    stateBefore: 'admission_contract_ready',
    stateAfter: 'named_batch_approved',
    recordedAt: '2026-07-20T01:00:00.000Z',
    recordedBy: 'synthetic-test',
    evidenceHashes: { metadata_sha256: '1'.repeat(64) }
  });
  assert.equal((await appendSyntheticReadinessEvent(root, synthetic)).synthetic_only, true);
});

test('operational ledger is canonical, hash-chained, idempotent, and rejects synthetic events', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'stage7-pilot-readiness-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const deps = { assertRoot: async () => root };
  await ensurePilotLayout(root, deps);
  const approval = operationalEvent({
    revision: 1,
    before: 'admission_contract_ready',
    after: 'named_batch_approved'
  });
  const acquired = operationalEvent({
    revision: 2,
    before: 'named_batch_approved',
    after: 'acquired_quarantine',
    previous: approval.event_sha256
  });
  await appendPilotReadinessEvent(root, approval, deps);
  await appendPilotReadinessEvent(root, approval, deps);
  await appendPilotReadinessEvent(root, acquired, deps);
  assert.deepEqual(await readPilotReadinessLedger(root, deps), [approval, acquired]);
  const synthetic = createSyntheticReadinessEvent({
    candidateId: 'synthetic-source:other-01',
    revision: 1,
    eventType: 'named_batch_approved',
    stateBefore: 'admission_contract_ready',
    stateAfter: 'named_batch_approved',
    recordedAt: '2026-07-20T02:00:00.000Z',
    recordedBy: 'synthetic-test',
    evidenceHashes: { metadata_sha256: '2'.repeat(64) }
  });
  await assert.rejects(
    appendPilotReadinessEvent(root, synthetic, deps),
    hasCode('OPERATIONAL_EVENT_REQUIRED')
  );
  const revisionGap = operationalEvent({
    revision: 4,
    before: 'acquired_quarantine',
    after: 'bytes_verified',
    previous: acquired.event_sha256
  });
  await assert.rejects(
    appendPilotReadinessEvent(root, revisionGap, deps),
    hasCode('READINESS_REVISION_NOT_NEXT')
  );

  const tampered = {
    ...approval,
    evidence_hashes: { evidence_sha256: '9'.repeat(64) }
  };
  await writeFile(
    join(root, 'manifests', 'acquisition-events.jsonl'),
    canonicalReadinessJson(tampered),
    'utf8'
  );
  await assert.rejects(
    readPilotReadinessLedger(root, deps),
    hasCode('READINESS_EVENT_HASH_INVALID')
  );
});

function operationalEvent({
  revision,
  before,
  after,
  previous = null,
  reasonCodes = []
}) {
  return createOperationalReadinessEvent({
    candidateId: ID,
    revision,
    eventType: after,
    stateBefore: before,
    stateAfter: after,
    recordedAt: `2026-07-20T01:00:${String(revision).padStart(2, '0')}.000Z`,
    recordedBy: 'r3-test',
    reasonCodes,
    evidenceHashes: { evidence_sha256: String(revision % 10).repeat(64) },
    previousEventSha256: previous
  });
}

function chainThroughFingerprint() {
  const transitions = [
    ['admission_contract_ready', 'named_batch_approved'],
    ['named_batch_approved', 'acquired_quarantine'],
    ['acquired_quarantine', 'bytes_verified'],
    ['bytes_verified', 'format_validated'],
    ['format_validated', 'structure_validated'],
    ['structure_validated', 'completeness_validated'],
    ['completeness_validated', 'prepared'],
    ['prepared', 'fingerprinted']
  ];
  const output = [];
  for (const [index, [before, after]] of transitions.entries()) {
    output.push(operationalEvent({
      revision: index + 1,
      before,
      after,
      previous: output.at(-1)?.event_sha256 ?? null
    }));
  }
  return output;
}
