import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CandidateReadinessError } from '../src/construction/learning/stage7CandidateBoundary.js';
import { acquireApprovedCandidate } from '../src/construction/learning/stage7CandidateAcquisition.js';
import {
  createOperationalReadinessEvent,
  reduceCandidateReadiness
} from '../src/construction/learning/stage7CandidateReadinessState.js';
import {
  appendPilotReadinessEvent,
  readPilotReadinessLedger
} from '../src/construction/learning/stage7PilotReadinessStore.js';
import { persistPilotPrepared } from '../src/construction/learning/stage7PilotArtifacts.js';
import { decodeBoundedNbt } from '../src/construction/learning/stage7BoundedNbt.js';
import { prepareConditionalVolume } from '../src/construction/learning/stage7ConditionalVoxelPreparation.js';
import { ensurePilotLayout, writePilotJsonIdempotent } from '../src/construction/learning/stage7PilotFilesystem.js';
import { selectPilotCandidate } from '../src/construction/learning/stage7PilotBatch.js';
import { runPilotCandidate } from '../src/construction/learning/stage7Pilot.js';
import { validateVanillaStructureNbt } from '../src/construction/learning/stage7VanillaStructureNbt.js';
import { structureNbt } from './fixtures/stage7CandidateReadinessFixtures.js';
import {
  pilotBatchFixture,
  pilotHttpResponse,
  resignPilotBatch
} from './fixtures/stage7PilotFixtures.js';

const REVISION = 'f'.repeat(40);

function hasCode(code) {
  return (error) => error instanceof CandidateReadinessError && error.code === code;
}

async function context(t, batchDocument = pilotBatchFixture()) {
  const root = await mkdtemp(join(tmpdir(), 'stage7-pilot-pipeline-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const deps = {
    assertRoot: async () => root,
    currentCodeRevision: async () => REVISION
  };
  await ensurePilotLayout(root, deps);
  await writePilotJsonIdempotent(root, 'manifests/named-batch.json', batchDocument, deps);
  return { root, deps, batchDocument };
}

function fetchBytes(bytes) {
  return async () => pilotHttpResponse([bytes.subarray(0, 5), bytes.subarray(5)]);
}

async function run(contextValue, candidateId, bytes, fetchImpl = fetchBytes(bytes)) {
  return runPilotCandidate({
    root: contextValue.root,
    batchDocument: contextValue.batchDocument,
    candidateId,
    fetchImpl,
    recordedAt: '2026-07-20T13:00:00.000Z',
    recordedBy: 'r3-test'
  }, contextValue.deps);
}

test('machine pipeline reaches fingerprinted in the exact deterministic state sequence', async (t) => {
  const first = await context(t);
  const bytes = structureNbt({ compression: 'gzip', size: [5, 3, 5] });
  const result = await run(first, 'source-a:house-01', bytes);
  const ledger = await readPilotReadinessLedger(first.root, first.deps);
  assert.deepEqual(ledger.map((event) => event.state_after), [
    'named_batch_approved', 'acquired_quarantine', 'bytes_verified',
    'format_validated', 'structure_validated', 'completeness_validated',
    'prepared', 'fingerprinted'
  ]);
  assert.equal(ledger.filter((event) => event.authorizes_acquisition).length, 1);
  assert.equal(ledger.every((event) => event.authorizes_training === false
    && event.authorizes_dataset_admission === false), true);
  assert.equal(result.state, 'fingerprinted');
  assert.equal(result.awaiting_human_review, true);
  assert.equal(result.terminal, false);
  assert.equal(result.candidate_id, 'source-a:house-01');
  assert.equal(result.hashes.content_sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(result.token_counts.length, 9);

  const second = await context(t);
  const repeated = await run(second, 'source-a:house-01', bytes);
  assert.deepEqual(repeated.hashes, result.hashes);
  assert.deepEqual(repeated.dimensions, result.dimensions);
  assert.deepEqual(repeated.token_counts, result.token_counts);
});

test('exact bytes reject automatically while structural similarity only creates a proposal', async (t) => {
  const exact = await context(t);
  const bytes = structureNbt();
  await run(exact, 'source-a:house-01', bytes);
  const duplicate = await run(exact, 'source-b:tower-01', bytes);
  assert.equal(duplicate.state, 'rejected_duplicate');
  assert.equal(duplicate.terminal, true);
  const originalAgain = await run(exact, 'source-a:house-01', bytes, async () => {
    throw new Error('fetch must not run');
  });
  assert.equal(originalAgain.state, 'fingerprinted');

  const near = await context(t);
  await run(near, 'source-a:house-01', structureNbt({ compression: 'none' }));
  const proposal = await run(near, 'source-b:tower-01', structureNbt({ compression: 'gzip' }));
  assert.equal(proposal.state, 'fingerprinted');
  assert.equal(proposal.terminal, false);
  assert.equal(proposal.duplicate_proposals.length, 1);
  assert.equal(proposal.duplicate_proposals[0].compared_candidate_id, 'source-a:house-01');
  assert.equal(proposal.duplicate_proposals[0].structural_equivalent, true);
});

test('technical, oversized, material, and malformed inputs stop in controlled states', async (t) => {
  const cases = [
    ['minecraft:jigsaw', 'quarantined_technical', 'STRUCTURE_EXTERNAL_DEPENDENCY'],
    ['minecraft:command_block', 'quarantined_technical', 'SECURITY_REVIEW_REQUIRED'],
    ['minecraft:diamond_block', 'quarantined_technical', 'MATERIAL_UNMAPPED_LIMIT']
  ];
  for (const [block, state, reason] of cases) {
    const current = await context(t);
    const result = await run(current, 'source-a:house-01', structureNbt({
      palette: ['minecraft:air', block],
      blocks: [{ pos: [0, 0, 0], state: 1 }]
    }));
    assert.equal(result.state, state);
    assert.deepEqual(result.reason_codes, [reason]);
  }

  let current = await context(t);
  const oversized = await run(current, 'source-a:house-01', structureNbt({
    size: [65, 1, 1],
    palette: ['minecraft:air', 'minecraft:stone'],
    blocks: [{ pos: [0, 0, 0], state: 1 }, { pos: [64, 0, 0], state: 1 }]
  }));
  assert.equal(oversized.state, 'deferred_oversized_public');

  current = await context(t);
  const malformed = await run(current, 'source-a:house-01', Buffer.from([0x0a, 0x00]));
  assert.equal(malformed.state, 'quarantined_technical');
  assert.equal(malformed.reason_codes[0], 'NBT_TRUNCATED');
});

test('state-driven resume after acquisition or prepared persistence never refetches', async (t) => {
  const quarantined = await context(t);
  const interruptedBytes = structureNbt();
  await acquireApprovedCandidate({
    root: quarantined.root,
    candidate: selectPilotCandidate(quarantined.batchDocument, 'source-a:house-01'),
    fetchImpl: fetchBytes(interruptedBytes)
  }, quarantined.deps);
  let retryFetches = 0;
  const afterQuarantine = await run(
    quarantined,
    'source-a:house-01',
    interruptedBytes,
    async () => {
      retryFetches += 1;
      return pilotHttpResponse([interruptedBytes]);
    }
  );
  assert.equal(afterQuarantine.state, 'fingerprinted');
  assert.equal(retryFetches, 1);

  const acquired = await context(t);
  const bytes = structureNbt();
  await seedThrough(acquired, 'source-a:house-01', bytes, 'acquired_quarantine');
  const resumed = await run(acquired, 'source-a:house-01', bytes, async () => {
    throw new Error('fetch must not run');
  });
  assert.equal(resumed.state, 'fingerprinted');

  const persisted = await context(t);
  const prepared = await seedThrough(
    persisted, 'source-a:house-01', bytes, 'completeness_validated'
  );
  await persistPilotPrepared(persisted.root, prepared, persisted.deps);
  const afterPrepared = await run(persisted, 'source-a:house-01', bytes, async () => {
    throw new Error('fetch must not run');
  });
  assert.equal(afterPrepared.state, 'fingerprinted');
});

test('batch manifest, code revision, and reserve eligibility fail closed', async (t) => {
  const current = await context(t);
  const other = pilotBatchFixture();
  other.batch.batch_id = 'other-batch';
  const resigned = resignPilotBatch(other);
  await assert.rejects(runPilotCandidate({
    root: current.root,
    batchDocument: resigned,
    candidateId: 'source-a:house-01',
    fetchImpl: fetchBytes(structureNbt()),
    recordedAt: '2026-07-20T13:00:00.000Z',
    recordedBy: 'r3-test'
  }, current.deps), hasCode('PILOT_BATCH_MANIFEST_MISMATCH'));
  await assert.rejects(runPilotCandidate({
    root: current.root,
    batchDocument: current.batchDocument,
    candidateId: 'source-a:house-01',
    fetchImpl: fetchBytes(structureNbt()),
    recordedAt: '2026-07-20T13:00:00.000Z',
    recordedBy: 'r3-test'
  }, { ...current.deps, currentCodeRevision: async () => '0'.repeat(40) }),
  hasCode('PILOT_CODE_REVISION_MISMATCH'));
  await assert.rejects(run(current, 'source-f:house-02', structureNbt()),
    (error) => error.code === 'PILOT_RESERVE_NOT_ELIGIBLE');

  const eligible = await context(t);
  const failed = await run(eligible, 'source-a:house-01', Buffer.from([0x0a, 0x00]));
  assert.equal(failed.terminal, true);
  const reserve = await run(eligible, 'source-f:house-02', structureNbt());
  assert.equal(reserve.state, 'fingerprinted');
});

test('a fully fingerprinted resume is idempotent and does not fetch or append', async (t) => {
  const current = await context(t);
  const bytes = structureNbt();
  const first = await run(current, 'source-a:house-01', bytes);
  const before = await readPilotReadinessLedger(current.root, current.deps);
  const second = await run(current, 'source-a:house-01', bytes, async () => {
    throw new Error('fetch must not run');
  });
  const after = await readPilotReadinessLedger(current.root, current.deps);
  assert.deepEqual(second, first);
  assert.deepEqual(after, before);
});

async function seedThrough(contextValue, candidateId, bytes, targetState) {
  const candidate = selectPilotCandidate(contextValue.batchDocument, candidateId);
  const receipt = await acquireApprovedCandidate({
    root: contextValue.root,
    candidate,
    fetchImpl: fetchBytes(bytes)
  }, contextValue.deps);
  const decoded = decodeBoundedNbt(bytes, { candidateId });
  const volume = validateVanillaStructureNbt(decoded, { candidateId });
  const prepared = prepareConditionalVolume({
    candidateId,
    contentSha256: receipt.content_sha256,
    volume,
    evidenceMode: 'operational'
  });
  const states = [
    'named_batch_approved', 'acquired_quarantine', 'bytes_verified',
    'format_validated', 'structure_validated', 'completeness_validated'
  ];
  let before = 'admission_contract_ready';
  let previous = null;
  for (const [index, after] of states.entries()) {
    const evidenceHashes = after === 'acquired_quarantine'
      ? { content_sha256: receipt.content_sha256 }
      : { evidence_sha256: String(index + 1).repeat(64) };
    const event = createOperationalReadinessEvent({
      candidateId,
      revision: index + 1,
      eventType: after,
      stateBefore: before,
      stateAfter: after,
      recordedAt: '2026-07-20T12:30:00.000Z',
      recordedBy: 'seed-test',
      evidenceHashes,
      previousEventSha256: previous
    });
    await appendPilotReadinessEvent(contextValue.root, event, contextValue.deps);
    before = after;
    previous = event.event_sha256;
    if (after === targetState) break;
  }
  assert.equal(reduceCandidateReadiness(
    await readPilotReadinessLedger(contextValue.root, contextValue.deps), candidateId
  ).state, targetState);
  return prepared;
}
