import assert from 'node:assert/strict';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readPilotFingerprints } from '../src/construction/learning/stage7PilotArtifacts.js';
import { hashPilotValue } from '../src/construction/learning/stage7PilotBatch.js';
import { ensurePilotLayout, writePilotJsonIdempotent } from '../src/construction/learning/stage7PilotFilesystem.js';
import { runPilotCandidate } from '../src/construction/learning/stage7Pilot.js';
import { readPilotReadinessLedger } from '../src/construction/learning/stage7PilotReadinessStore.js';
import {
  PilotReviewError,
  auditPilot,
  finalizePilotCandidate,
  validatePilotReview
} from '../src/construction/learning/stage7PilotReview.js';
import { structureNbt } from './fixtures/stage7CandidateReadinessFixtures.js';
import { pilotBatchFixture, pilotHttpResponse } from './fixtures/stage7PilotFixtures.js';

const REVISION = 'f'.repeat(40);
const IDS = [
  'source-a:house-01', 'source-b:tower-01', 'source-c:temple-01',
  'source-d:ship-01', 'source-e:ruin-01'
];

function hasCode(code) {
  return (error) => error instanceof PilotReviewError && error.code === code;
}

async function context(t) {
  const root = await mkdtemp(join(tmpdir(), 'stage7-pilot-review-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const batchDocument = pilotBatchFixture();
  const deps = {
    assertRoot: async () => root,
    currentCodeRevision: async () => REVISION
  };
  await ensurePilotLayout(root, deps);
  await writePilotJsonIdempotent(root, 'manifests/named-batch.json', batchDocument, deps);
  return { root, batchDocument, deps };
}

function fetchBytes(bytes) {
  return async () => pilotHttpResponse([bytes]);
}

async function machine(contextValue, candidateId, bytes = structureNbt()) {
  const result = await runPilotCandidate({
    root: contextValue.root,
    batchDocument: contextValue.batchDocument,
    candidateId,
    fetchImpl: fetchBytes(bytes),
    recordedAt: '2026-07-20T13:00:00.000Z',
    recordedBy: 'machine-test'
  }, contextValue.deps);
  const fingerprint = (await readPilotFingerprints(contextValue.root, contextValue.deps))
    .find((record) => record.candidate_id === candidateId);
  return { result, fingerprint };
}

function reviewFixture(contextValue, candidateId, fingerprint, proposals = [], overrides = {}) {
  const candidate = contextValue.batchDocument.batch.candidates
    .find((item) => item.candidate_id === candidateId);
  return {
    schema_version: 1,
    candidate_id: candidateId,
    reviewed_at: '2026-07-20T14:00:00.000Z',
    reviewed_by: 'owner',
    batch_sha256: contextValue.batchDocument.batch_sha256,
    content_sha256: fingerprint.content_sha256,
    preparation_sha256: fingerprint.preparation_sha256,
    fingerprint_sha256: hashPilotValue(fingerprint),
    identity_consistent: true,
    completeness: 'complete',
    quality_decision: 'accept',
    primary_function: candidate.primary_function,
    building_type: candidate.building_type,
    style_family: candidate.style_family,
    environment: candidate.environment,
    label_confidence: 'high',
    near_duplicate_decisions: proposals.map((proposal) => ({
      compared_candidate_id: proposal.compared_candidate_id,
      decision: 'distinct',
      structural_equivalent: proposal.structural_equivalent,
      occupancy_similarity: proposal.occupancy_similarity,
      material_similarity: proposal.material_similarity,
      shares_lsh_bucket: proposal.shares_lsh_bucket
    })),
    reason_codes: [],
    authorizes_training: false,
    authorizes_dataset_admission: false,
    ...overrides
  };
}

test('review contract binds batch, fingerprint, labels, decisions, and false authority', async (t) => {
  const current = await context(t);
  const { result, fingerprint } = await machine(current, IDS[0]);
  const accepted = reviewFixture(current, IDS[0], fingerprint, result.duplicate_proposals);
  assert.deepEqual(validatePilotReview(accepted, {
    batchDocument: current.batchDocument,
    fingerprintRecord: fingerprint,
    proposals: result.duplicate_proposals
  }), accepted);
  assert.equal(Object.isFrozen(validatePilotReview(accepted, {
    batchDocument: current.batchDocument,
    fingerprintRecord: fingerprint,
    proposals: []
  })), true);

  const invalid = [
    [{ ...accepted, unexpected: true }, 'PILOT_REVIEW_INVALID'],
    [{ ...accepted, batch_sha256: '0'.repeat(64) }, 'PILOT_REVIEW_BINDING_INVALID'],
    [{ ...accepted, building_type: 'tower' }, 'PILOT_REVIEW_LABEL_INVALID'],
    [{ ...accepted, completeness: 'module' }, 'PILOT_REVIEW_REASON_MISMATCH'],
    [{ ...accepted, label_confidence: 'low' }, 'PILOT_REVIEW_REASON_MISMATCH'],
    [{ ...accepted, identity_consistent: false }, 'PILOT_REVIEW_REASON_MISMATCH'],
    [{ ...accepted, quality_decision: 'reject' }, 'PILOT_REVIEW_REASON_REQUIRED'],
    [{ ...accepted, authorizes_training: true }, 'PILOT_REVIEW_AUTHORITY_INVALID']
  ];
  for (const [record, code] of invalid) {
    assert.throws(() => validatePilotReview(record, {
      batchDocument: current.batchDocument,
      fingerprintRecord: fingerprint,
      proposals: result.duplicate_proposals
    }), hasCode(code));
  }
});

test('every near-duplicate proposal requires one exact distinct or same-cluster decision', async (t) => {
  const current = await context(t);
  await machine(current, IDS[0], structureNbt({ compression: 'none' }));
  const second = await machine(current, IDS[1], structureNbt({ compression: 'gzip' }));
  assert.equal(second.result.duplicate_proposals.length, 1);
  const accepted = reviewFixture(
    current, IDS[1], second.fingerprint, second.result.duplicate_proposals
  );
  const options = {
    batchDocument: current.batchDocument,
    fingerprintRecord: second.fingerprint,
    proposals: second.result.duplicate_proposals
  };
  assert.throws(() => validatePilotReview({
    ...accepted,
    near_duplicate_decisions: []
  }, options), hasCode('PILOT_REVIEW_DUPLICATE_DECISIONS_INVALID'));
  assert.throws(() => validatePilotReview({
    ...accepted,
    near_duplicate_decisions: [{
      ...accepted.near_duplicate_decisions[0],
      occupancy_similarity: 0
    }]
  }, options), hasCode('PILOT_REVIEW_DUPLICATE_DECISIONS_INVALID'));
  const sameCluster = {
    ...accepted,
    near_duplicate_decisions: accepted.near_duplicate_decisions.map((decision) => ({
      ...decision,
      decision: 'same_cluster'
    }))
  };
  assert.deepEqual(validatePilotReview(sameCluster, options), sameCluster);
});

test('accepted review appends duplicate_clustered and pilot_ready only after fingerprinted', async (t) => {
  const current = await context(t);
  const { result, fingerprint } = await machine(current, IDS[0]);
  const review = reviewFixture(current, IDS[0], fingerprint, result.duplicate_proposals);
  const finalized = await finalizePilotCandidate({
    root: current.root,
    batchDocument: current.batchDocument,
    reviewRecord: review,
    recordedAt: '2026-07-20T14:00:01.000Z'
  }, current.deps);
  assert.equal(finalized.state, 'pilot_ready');
  assert.equal(finalized.authorizes_training, false);
  assert.equal(finalized.authorizes_dataset_admission, false);
  const states = (await readPilotReadinessLedger(current.root, current.deps))
    .filter((event) => event.candidate_id === IDS[0]).map((event) => event.state_after);
  assert.deepEqual(states.slice(-2), ['duplicate_clustered', 'pilot_ready']);
});

test('controlled human failures map directly from fingerprinted to the exact terminal state', async (t) => {
  const cases = [
    [{ identity_consistent: false, reason_codes: ['IDENTITY_MISMATCH'] }, 'quarantined_technical'],
    [{ completeness: 'module', reason_codes: ['INCOMPLETE_BUILDING'] }, 'deferred_incomplete'],
    [{ label_confidence: 'low', reason_codes: ['LABEL_CONFIDENCE_LOW'] }, 'deferred_label'],
    [{ quality_decision: 'reject', reason_codes: ['QUALITY_REJECTED'] }, 'rejected_quality'],
    [{ quality_decision: 'reject', reason_codes: ['NEAR_DUPLICATE_REJECTED'] }, 'rejected_quality']
  ];
  for (const [overrides, state] of cases) {
    const current = await context(t);
    const { result, fingerprint } = await machine(current, IDS[0]);
    const review = reviewFixture(
      current, IDS[0], fingerprint, result.duplicate_proposals, overrides
    );
    const finalized = await finalizePilotCandidate({
      root: current.root,
      batchDocument: current.batchDocument,
      reviewRecord: review,
      recordedAt: '2026-07-20T14:00:01.000Z'
    }, current.deps);
    assert.equal(finalized.state, state);
    assert.equal(finalized.terminal, true);
  }
});

test('audit remains incomplete at four and becomes complete only at exactly five diverse ready cases', async (t) => {
  const current = await context(t);
  for (const [index, candidateId] of IDS.entries()) {
    const bytes = structureNbt({
      size: [index + 2, 2, index + 2],
      palette: ['minecraft:air', 'minecraft:stone_bricks', 'minecraft:oak_planks'],
      blocks: [
        { pos: [0, 0, 0], state: 1 },
        { pos: [index + 1, 1, index + 1], state: index % 2 ? 2 : 1 }
      ],
      compression: index % 2 ? 'gzip' : 'none'
    });
    const { result, fingerprint } = await machine(current, candidateId, bytes);
    const review = reviewFixture(
      current, candidateId, fingerprint, result.duplicate_proposals
    );
    await finalizePilotCandidate({
      root: current.root,
      batchDocument: current.batchDocument,
      reviewRecord: review,
      recordedAt: `2026-07-20T14:00:0${index}.000Z`
    }, current.deps);
    if (index === 3) {
      const four = await auditPilot({
        root: current.root,
        batchDocument: current.batchDocument
      }, current.deps);
      assert.equal(four.ready_count, 4);
      assert.equal(four.complete, false);
    }
  }
  const five = await auditPilot({
    root: current.root,
    batchDocument: current.batchDocument
  }, current.deps);
  assert.equal(five.ready_count, 5);
  assert.equal(five.ready_source_group_count >= 4, true);
  assert.equal(five.ready_building_type_count >= 4, true);
  assert.equal(five.complete, true);
  assert.equal(five.authorizes_training, false);
  assert.equal(five.authorizes_dataset_admission, false);
  assert.match(five.report_relative_path,
    /^reports\/pilots\/r3-pilot-20260720-[a-f0-9]{64}\.json$/u);
  const readSafe = await auditPilot({
    root: current.root,
    batchDocument: current.batchDocument
  }, {
    ...current.deps,
    open: async (value, ...args) => {
      assert.equal(String(value).endsWith('.voxels.bin'), false);
      assert.equal(String(value).endsWith('.nbt'), false);
      return open(value, ...args);
    }
  });
  assert.equal(readSafe.complete, true);
});
