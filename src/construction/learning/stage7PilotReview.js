import fs from 'node:fs/promises';
import path from 'node:path';
import { compareConditionalFingerprints } from './stage7ConditionalFingerprint.js';
import {
  createOperationalReadinessEvent,
  reduceCandidateReadiness
} from './stage7CandidateReadinessState.js';
import {
  appendPilotReview,
  readPilotFingerprints,
  readPilotPreparedIndex,
  readPilotReviews
} from './stage7PilotArtifacts.js';
import {
  canonicalPilotJson,
  hashPilotValue,
  validatePilotBatchDocument
} from './stage7PilotBatch.js';
import {
  assertPilotRoot,
  readPilotJson,
  writePilotJsonIdempotent
} from './stage7PilotFilesystem.js';
import {
  appendPilotReadinessEvent,
  readPilotReadinessLedger
} from './stage7PilotReadinessStore.js';

const REVIEW_KEYS = Object.freeze([
  'schema_version', 'candidate_id', 'reviewed_at', 'reviewed_by', 'batch_sha256',
  'content_sha256', 'preparation_sha256', 'fingerprint_sha256',
  'identity_consistent', 'completeness', 'quality_decision', 'primary_function',
  'building_type', 'style_family', 'environment', 'label_confidence',
  'near_duplicate_decisions', 'reason_codes', 'authorizes_training',
  'authorizes_dataset_admission'
]);
const DECISION_KEYS = Object.freeze([
  'compared_candidate_id', 'decision', 'structural_equivalent',
  'occupancy_similarity', 'material_similarity', 'shares_lsh_bucket'
]);
const CONTROLLED_REASONS = new Set([
  'IDENTITY_MISMATCH', 'INCOMPLETE_BUILDING', 'QUALITY_REJECTED',
  'LABEL_CONFIDENCE_LOW', 'NEAR_DUPLICATE_REJECTED'
]);

export class PilotReviewError extends Error {
  constructor(code, candidateId, safeDetail = {}) {
    super(`${code}:review:${candidateId}`);
    this.name = 'PilotReviewError';
    this.code = code;
    this.candidate_id = candidateId;
    this.safe_detail = Object.freeze({ ...safeDetail });
  }
}

export function validatePilotReview(record, {
  batchDocument,
  fingerprintRecord,
  proposals
}) {
  const batch = validatePilotBatchDocument(batchDocument);
  const id = record?.candidate_id || 'operational';
  exactKeys(record, REVIEW_KEYS, 'PILOT_REVIEW_INVALID', id);
  const candidate = batch.batch.candidates.find((item) => item.candidate_id === id);
  if (!candidate || record.schema_version !== 1
    || Number.isNaN(Date.parse(record.reviewed_at))
    || new Date(record.reviewed_at).toISOString() !== record.reviewed_at
    || typeof record.reviewed_by !== 'string' || record.reviewed_by.trim().length === 0
    || typeof record.identity_consistent !== 'boolean'
    || !['complete', 'module', 'fragment'].includes(record.completeness)
    || !['accept', 'reject'].includes(record.quality_decision)
    || !['high', 'low'].includes(record.label_confidence)
    || !Array.isArray(record.near_duplicate_decisions)
    || !Array.isArray(record.reason_codes)
    || new Set(record.reason_codes).size !== record.reason_codes.length
    || record.reason_codes.some((reason) => !CONTROLLED_REASONS.has(reason))) {
    fail('PILOT_REVIEW_INVALID', id);
  }
  if (record.authorizes_training !== false || record.authorizes_dataset_admission !== false) {
    fail('PILOT_REVIEW_AUTHORITY_INVALID', id);
  }
  if (!fingerprintRecord || fingerprintRecord.candidate_id !== id
    || record.batch_sha256 !== batch.batch_sha256
    || record.content_sha256 !== fingerprintRecord.content_sha256
    || record.preparation_sha256 !== fingerprintRecord.preparation_sha256
    || record.fingerprint_sha256 !== hashPilotValue(fingerprintRecord)) {
    fail('PILOT_REVIEW_BINDING_INVALID', id);
  }
  for (const key of ['primary_function', 'building_type', 'style_family', 'environment']) {
    if (record[key] !== candidate[key]) fail('PILOT_REVIEW_LABEL_INVALID', id, { field: key });
  }
  validateDuplicateDecisions(record.near_duplicate_decisions, proposals, id);
  validateReasons(record, id);
  return deepFreeze(structuredClone(record));
}

export async function finalizePilotCandidate({
  root,
  batchDocument,
  reviewRecord,
  recordedAt
}, deps = {}) {
  const batch = validatePilotBatchDocument(batchDocument);
  await assertStoredBatch(root, batch, deps);
  const fingerprints = await readPilotFingerprints(root, deps);
  const fingerprint = fingerprints.find((record) =>
    record.candidate_id === reviewRecord?.candidate_id
    && record.preparation_sha256 === reviewRecord?.preparation_sha256);
  const proposals = fingerprint ? proposalsFor(fingerprint, fingerprints) : [];
  const review = validatePilotReview(reviewRecord, {
    batchDocument: batch,
    fingerprintRecord: fingerprint,
    proposals
  });
  let ledger = await readPilotReadinessLedger(root, deps);
  let state = reduceCandidateReadiness(ledger, review.candidate_id);
  const existingReviews = await readPilotReviews(root, deps);
  const existing = existingReviews.find((item) =>
    item.candidate_id === review.candidate_id
    && item.preparation_sha256 === review.preparation_sha256);

  if (state?.terminal || state?.state === 'pilot_ready') {
    if (!existing || canonicalPilotJson(existing) !== canonicalPilotJson(review)) {
      fail('PILOT_REVIEW_START_STATE_INVALID', review.candidate_id, { state: state?.state || 'none' });
    }
    return finalResult(state, review);
  }
  if (!['fingerprinted', 'duplicate_clustered'].includes(state?.state)) {
    fail('PILOT_REVIEW_START_STATE_INVALID', review.candidate_id, { state: state?.state || 'none' });
  }
  await appendPilotReview(root, review, deps);

  const append = async (stateAfter, evidenceHashes, reasonCodes = []) => {
    ledger = await readPilotReadinessLedger(root, deps);
    state = reduceCandidateReadiness(ledger, review.candidate_id);
    const event = createOperationalReadinessEvent({
      candidateId: review.candidate_id,
      revision: state.revision + 1,
      eventType: stateAfter,
      stateBefore: state.state,
      stateAfter,
      recordedAt,
      recordedBy: review.reviewed_by,
      reasonCodes,
      evidenceHashes,
      previousEventSha256: state.latest_event_sha256
    });
    await appendPilotReadinessEvent(root, event, deps);
    state = reduceCandidateReadiness([...ledger, event], review.candidate_id);
  };
  const reviewSha256 = hashPilotValue(review);
  const evidence = {
    fingerprint_sha256: review.fingerprint_sha256,
    review_sha256: reviewSha256
  };

  if (state.state === 'fingerprinted') {
    const terminal = reviewTerminal(review);
    if (terminal) {
      await append(terminal, evidence, review.reason_codes);
      return finalResult(state, review);
    }
    const sameCluster = review.near_duplicate_decisions
      .filter((decision) => decision.decision === 'same_cluster');
    await append('duplicate_clustered', {
      ...evidence,
      duplicate_cluster_sha256: hashPilotValue(sameCluster.map((decision) =>
        [review.candidate_id, decision.compared_candidate_id].sort())
        .sort((left, right) => canonicalPilotJson(left).localeCompare(canonicalPilotJson(right))))
    });
  }
  if (state.state === 'duplicate_clustered') {
    await append('pilot_ready', {
      preparation_sha256: review.preparation_sha256,
      review_sha256: reviewSha256
    });
  }
  return finalResult(state, review);
}

export async function auditPilot({ root, batchDocument }, deps = {}) {
  const batch = validatePilotBatchDocument(batchDocument);
  await assertStoredBatch(root, batch, deps);
  const ledger = await readPilotReadinessLedger(root, deps);
  const prepared = await readPilotPreparedIndex(root, deps);
  const fingerprints = await readPilotFingerprints(root, deps);
  const reviews = await readPilotReviews(root, deps);
  const states = batch.batch.candidates.map((candidate) => ({
    candidate,
    readiness: reduceCandidateReadiness(ledger, candidate.candidate_id)
  }));
  for (const review of reviews) {
    const fingerprint = fingerprints.find((item) =>
      item.candidate_id === review.candidate_id
      && item.preparation_sha256 === review.preparation_sha256);
    validatePilotReview(review, {
      batchDocument: batch,
      fingerprintRecord: fingerprint,
      proposals: fingerprint ? proposalsFor(fingerprint, fingerprints) : []
    });
  }
  await assertArtifactInventory(root, states, prepared, fingerprints, reviews, deps);

  const attempted = states.filter(({ readiness }) => readiness !== null);
  const ready = states.filter(({ readiness }) => readiness?.state === 'pilot_ready');
  const readyIds = new Set(ready.map(({ candidate }) => candidate.candidate_id));
  const readyEvidenceComplete = ready.every(({ candidate }) => {
    const candidatePrepared = prepared.filter((item) => item.candidate_id === candidate.candidate_id);
    const candidateFingerprints = fingerprints.filter(
      (item) => item.candidate_id === candidate.candidate_id
    );
    const candidateReviews = reviews.filter((item) => item.candidate_id === candidate.candidate_id);
    return candidatePrepared.length === 1 && candidateFingerprints.length === 1
      && candidateReviews.length === 1;
  });
  const allAttemptsResolved = attempted.every(({ readiness }) =>
    readiness.state === 'pilot_ready' || readiness.terminal === true);
  const reservePolicyValid = states.filter(({ candidate, readiness }) =>
    candidate.role === 'reserve' && readiness !== null).every(({ candidate }) => {
    const primary = states.find(({ candidate: item }) =>
      item.candidate_id === candidate.reserve_for)?.readiness;
    return primary?.terminal === true;
  });
  const unactivatedReserves = states.filter(({ candidate, readiness }) =>
    candidate.role === 'reserve' && readiness === null);
  const unactivatedClean = unactivatedReserves.every(({ candidate }) =>
    !prepared.some((item) => item.candidate_id === candidate.candidate_id)
    && !fingerprints.some((item) => item.candidate_id === candidate.candidate_id)
    && !reviews.some((item) => item.candidate_id === candidate.candidate_id));
  const readySourceGroups = new Set(ready.map(({ candidate }) => candidate.source_group));
  const readyBuildingTypes = new Set(ready.map(({ candidate }) => candidate.building_type));
  const summary = {
    schema_version: 1,
    batch_id: batch.batch.batch_id,
    batch_sha256: batch.batch_sha256,
    attempted_count: attempted.length,
    ready_count: ready.length,
    terminal_count: attempted.filter(({ readiness }) => readiness.terminal).length,
    prepared_count: prepared.length,
    fingerprint_count: fingerprints.length,
    review_count: reviews.length,
    unactivated_reserve_count: unactivatedReserves.length,
    ready_source_group_count: readySourceGroups.size,
    ready_building_type_count: readyBuildingTypes.size,
    all_attempts_resolved: allAttemptsResolved,
    ready_evidence_complete: readyEvidenceComplete,
    reserve_policy_valid: reservePolicyValid,
    unactivated_reserves_clean: unactivatedClean,
    artifact_inventory_valid: true,
    candidate_states: states.filter(({ readiness }) => readiness !== null)
      .map(({ candidate, readiness }) => ({
        candidate_id: candidate.candidate_id,
        state: readiness.state,
        terminal: readiness.terminal,
        ready: readyIds.has(candidate.candidate_id)
      })),
    complete: ready.length === 5
      && readySourceGroups.size >= 4
      && readyBuildingTypes.size >= 4
      && allAttemptsResolved && readyEvidenceComplete
      && reservePolicyValid && unactivatedClean,
    authorizes_training: false,
    authorizes_dataset_admission: false
  };
  const auditSha256 = hashPilotValue(summary);
  const report = deepFreeze({
    ...summary,
    audit_sha256: auditSha256,
    report_relative_path: `reports/pilots/${batch.batch.batch_id}-${auditSha256}.json`
  });
  await writePilotJsonIdempotent(root, report.report_relative_path, report, deps);
  return report;
}

function validateDuplicateDecisions(decisions, proposals, candidateId) {
  if (!Array.isArray(proposals) || decisions.length !== proposals.length
    || new Set(decisions.map((decision) => decision?.compared_candidate_id)).size !== decisions.length) {
    fail('PILOT_REVIEW_DUPLICATE_DECISIONS_INVALID', candidateId);
  }
  for (const decision of decisions) {
    exactKeys(decision, DECISION_KEYS, 'PILOT_REVIEW_DUPLICATE_DECISIONS_INVALID', candidateId);
    const proposal = proposals.find((item) =>
      item.compared_candidate_id === decision.compared_candidate_id);
    if (!proposal || !['distinct', 'same_cluster'].includes(decision.decision)
      || decision.structural_equivalent !== proposal.structural_equivalent
      || decision.occupancy_similarity !== proposal.occupancy_similarity
      || decision.material_similarity !== proposal.material_similarity
      || decision.shares_lsh_bucket !== proposal.shares_lsh_bucket) {
      fail('PILOT_REVIEW_DUPLICATE_DECISIONS_INVALID', candidateId);
    }
  }
}

function validateReasons(review, candidateId) {
  const reasons = new Set(review.reason_codes);
  const required = [
    review.identity_consistent === false ? 'IDENTITY_MISMATCH' : null,
    review.completeness !== 'complete' ? 'INCOMPLETE_BUILDING' : null,
    review.label_confidence !== 'high' ? 'LABEL_CONFIDENCE_LOW' : null
  ].filter(Boolean);
  if (review.quality_decision === 'reject') {
    const qualityReasons = ['QUALITY_REJECTED', 'NEAR_DUPLICATE_REJECTED']
      .filter((reason) => reasons.has(reason));
    if (qualityReasons.length !== 1) fail('PILOT_REVIEW_REASON_REQUIRED', candidateId);
    required.push(qualityReasons[0]);
  }
  if (reasons.size !== required.length || required.some((reason) => !reasons.has(reason))) {
    fail('PILOT_REVIEW_REASON_MISMATCH', candidateId);
  }
}

function reviewTerminal(review) {
  if (!review.identity_consistent) return 'quarantined_technical';
  if (review.completeness !== 'complete') return 'deferred_incomplete';
  if (review.label_confidence !== 'high') return 'deferred_label';
  if (review.quality_decision === 'reject') return 'rejected_quality';
  return null;
}

function proposalsFor(fingerprint, fingerprints) {
  return fingerprints.filter((other) => other.candidate_id !== fingerprint.candidate_id)
    .map((other) => ({
      compared_candidate_id: other.candidate_id,
      ...compareConditionalFingerprints(fingerprint, other)
    }))
    .filter((comparison) => comparison.near_duplicate_proposed)
    .map((comparison) => ({
      compared_candidate_id: comparison.compared_candidate_id,
      structural_equivalent: comparison.structural_equivalent,
      occupancy_similarity: comparison.occupancy_similarity,
      material_similarity: comparison.material_similarity,
      shares_lsh_bucket: comparison.shares_lsh_bucket
    }))
    .sort((left, right) => left.compared_candidate_id.localeCompare(right.compared_candidate_id));
}

async function assertArtifactInventory(root, states, prepared, fingerprints, reviews, deps) {
  const absoluteRoot = await assertPilotRoot(root, deps);
  const acquired = new Map();
  const ledger = await readPilotReadinessLedger(root, deps);
  for (const event of ledger.filter((item) => item.state_after === 'acquired_quarantine')) {
    acquired.set(event.candidate_id, event.evidence_hashes.content_sha256);
  }
  await assertCandidateDirectories(
    path.join(absoluteRoot, 'quarantine'),
    new Map([...acquired].map(([id, sha]) => [id, [`${sha}.nbt`]])),
    deps
  );
  const preparedExpected = new Map();
  for (const record of prepared) {
    const names = preparedExpected.get(record.candidate_id) || [];
    names.push(`${record.preparation_sha256}.json`, `${record.preparation_sha256}.voxels.bin`);
    preparedExpected.set(record.candidate_id, names.sort());
  }
  await assertCandidateDirectories(path.join(absoluteRoot, 'prepared'), preparedExpected, deps);
  for (const record of prepared) {
    const base = `prepared/${record.candidate_id}/${record.preparation_sha256}`;
    const sidecar = await readPilotJson(root, `${base}.json`, deps);
    if (canonicalPilotJson(sidecar) !== canonicalPilotJson(record)) {
      fail('PILOT_AUDIT_INVENTORY_INVALID', record.candidate_id);
    }
    const binary = path.join(absoluteRoot, ...`${base}.voxels.bin`.split('/'));
    const stat = await (deps.lstat || fs.lstat)(binary);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size !== 64 ** 3) {
      fail('PILOT_AUDIT_INVENTORY_INVALID', record.candidate_id);
    }
  }
  const attemptedIds = new Set(states.filter(({ readiness }) => readiness).map(
    ({ candidate }) => candidate.candidate_id
  ));
  if ([...prepared, ...fingerprints, ...reviews].some(
    (record) => !attemptedIds.has(record.candidate_id))) {
    fail('PILOT_AUDIT_INVENTORY_INVALID', 'operational');
  }
}

async function assertStoredBatch(root, batch, deps) {
  const stored = validatePilotBatchDocument(await readPilotJson(
    root, 'manifests/named-batch.json', deps
  ));
  if (canonicalPilotJson(stored) !== canonicalPilotJson(batch)) {
    fail('PILOT_REVIEW_BATCH_MANIFEST_MISMATCH', batch.batch.batch_id);
  }
}

async function assertCandidateDirectories(directory, expected, deps) {
  const entries = await (deps.readdir || fs.readdir)(directory, { withFileTypes: true });
  if (entries.some((entry) => entry.isSymbolicLink() || !entry.isDirectory())) {
    fail('PILOT_AUDIT_INVENTORY_INVALID', 'operational');
  }
  const actualIds = entries.map((entry) => entry.name).sort();
  const expectedIds = [...expected.keys()].sort();
  if (canonicalPilotJson(actualIds) !== canonicalPilotJson(expectedIds)) {
    fail('PILOT_AUDIT_INVENTORY_INVALID', 'operational');
  }
  for (const id of actualIds) {
    const files = await (deps.readdir || fs.readdir)(path.join(directory, id), {
      withFileTypes: true
    });
    if (files.some((entry) => entry.isSymbolicLink() || !entry.isFile())
      || canonicalPilotJson(files.map((entry) => entry.name).sort())
        !== canonicalPilotJson(expected.get(id))) {
      fail('PILOT_AUDIT_INVENTORY_INVALID', id);
    }
  }
}

function finalResult(state, review) {
  return deepFreeze({
    candidate_id: review.candidate_id,
    state: state.state,
    terminal: state.terminal,
    review_sha256: hashPilotValue(review),
    authorizes_training: false,
    authorizes_dataset_admission: false
  });
}

function exactKeys(value, keys, code, candidateId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length
    || Object.keys(value).some((key) => !keys.includes(key))) {
    fail(code, candidateId);
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function fail(code, candidateId, safeDetail = {}) {
  throw new PilotReviewError(code, candidateId, safeDetail);
}
