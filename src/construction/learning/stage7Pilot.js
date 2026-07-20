import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import {
  CandidateReadinessError,
  readQuarantinedNbt
} from './stage7CandidateBoundary.js';
import { acquireApprovedCandidate } from './stage7CandidateAcquisition.js';
import { decodeBoundedNbt } from './stage7BoundedNbt.js';
import {
  compareConditionalFingerprints,
  fingerprintConditionalVolume
} from './stage7ConditionalFingerprint.js';
import { prepareConditionalVolume } from './stage7ConditionalVoxelPreparation.js';
import {
  READINESS_TERMINAL_STATES,
  createOperationalReadinessEvent,
  reduceCandidateReadiness
} from './stage7CandidateReadinessState.js';
import {
  PilotArtifactError,
  appendPilotFingerprint,
  persistPilotPrepared,
  readPilotFingerprints
} from './stage7PilotArtifacts.js';
import {
  canonicalPilotJson,
  hashPilotValue,
  reserveEligible,
  selectPilotCandidate,
  validatePilotBatchDocument
} from './stage7PilotBatch.js';
import {
  PilotFilesystemError,
  readPilotJson
} from './stage7PilotFilesystem.js';
import {
  appendPilotReadinessEvent,
  readPilotReadinessLedger
} from './stage7PilotReadinessStore.js';
import { validateVanillaStructureNbt } from './stage7VanillaStructureNbt.js';

const execFile = promisify(execFileCallback);
const PROCESS_STATES = new Set([
  'named_batch_approved', 'acquired_quarantine', 'bytes_verified',
  'format_validated', 'structure_validated', 'completeness_validated',
  'prepared', 'fingerprinted'
]);

export async function runPilotCandidate({
  root,
  batchDocument,
  candidateId,
  fetchImpl = globalThis.fetch,
  recordedAt,
  recordedBy
}, deps = {}) {
  const batch = validatePilotBatchDocument(batchDocument);
  const candidate = selectPilotCandidate(batch, candidateId);
  await assertExecutionBinding(root, batch, candidate, deps);
  let ledger = await readPilotReadinessLedger(root, deps);
  let state = reduceCandidateReadiness(ledger, candidate.candidate_id);
  const enteredFingerprinted = state?.state === 'fingerprinted';
  if (state === null && candidate.role === 'reserve') {
    const summaries = batch.batch.candidates.map((item) =>
      reduceCandidateReadiness(ledger, item.candidate_id)).filter(Boolean);
    reserveEligible(batch, candidate.candidate_id, summaries);
  }
  if (state && (state.terminal || !PROCESS_STATES.has(state.state))) {
    return terminalOrExistingResult(state, latestEvent(ledger, candidate.candidate_id));
  }

  const append = async (stateAfter, evidenceHashes, reasonCodes = []) => {
    ledger = await readPilotReadinessLedger(root, deps);
    const before = reduceCandidateReadiness(ledger, candidate.candidate_id);
    const event = createOperationalReadinessEvent({
      candidateId: candidate.candidate_id,
      revision: (before?.revision || 0) + 1,
      eventType: stateAfter,
      stateBefore: before?.state || 'admission_contract_ready',
      stateAfter,
      recordedAt,
      recordedBy,
      reasonCodes,
      evidenceHashes,
      previousEventSha256: before?.latest_event_sha256 || null
    });
    await appendPilotReadinessEvent(root, event, deps);
    ledger = [...ledger, event];
    state = reduceCandidateReadiness(ledger, candidate.candidate_id);
    return event;
  };
  const failStage = async (error) => {
    if (!operationalFailure(error)) throw error;
    const current = reduceCandidateReadiness(
      await readPilotReadinessLedger(root, deps), candidate.candidate_id
    );
    if (current?.terminal) return terminalOrExistingResult(current,
      latestEvent(await readPilotReadinessLedger(root, deps), candidate.candidate_id));
    await append('quarantined_technical', {
      failure_sha256: hashPilotValue({
        candidate_id: candidate.candidate_id,
        state_before: current?.state || 'admission_contract_ready',
        reason_code: error.code
      })
    }, [error.code]);
    return terminalOrExistingResult(state, latestEvent(ledger, candidate.candidate_id));
  };

  if (state === null) {
    await append('named_batch_approved', {
      batch_sha256: batch.batch_sha256,
      admission_evidence_sha256: candidate.admission_evidence_sha256,
      rights_evidence_sha256: candidate.rights.evidence_sha256
    });
  }

  let receipt;
  if (state.state === 'named_batch_approved') {
    try {
      receipt = await acquireApprovedCandidate({ root, candidate, fetchImpl }, deps);
      await append('acquired_quarantine', {
        content_sha256: receipt.content_sha256,
        receipt_sha256: hashPilotValue(receipt)
      });
    } catch (error) {
      return failStage(error);
    }
  }

  const acquiredEvent = eventForState(ledger, candidate.candidate_id, 'acquired_quarantine');
  const contentSha256 = acquiredEvent?.evidence_hashes?.content_sha256;
  if (!/^[a-f0-9]{64}$/u.test(contentSha256 || '')) {
    return failStage(new CandidateReadinessError(
      'ACQUIRED_CONTENT_BINDING_INVALID', 'pilot', candidate.candidate_id
    ));
  }
  const relativePath = `quarantine/${candidate.candidate_id}/${contentSha256}.nbt`;
  let quarantined;
  try {
    quarantined = await readQuarantinedNbt({
      root,
      candidateId: candidate.candidate_id,
      relativePath
    }, deps);
    if (state.state === 'acquired_quarantine') {
      await append('bytes_verified', { content_sha256: contentSha256 });
    }
  } catch (error) {
    return failStage(error);
  }

  let decoded;
  try {
    decoded = decodeBoundedNbt(quarantined.bytes, { candidateId: candidate.candidate_id });
    if (state.state === 'bytes_verified') {
      await append('format_validated', { content_sha256: contentSha256 });
    }
  } catch (error) {
    return failStage(error);
  }

  let volume;
  try {
    volume = validateVanillaStructureNbt(decoded, { candidateId: candidate.candidate_id });
    if (state.state === 'format_validated') {
      await append('structure_validated', { content_sha256: contentSha256 });
    }
  } catch (error) {
    return failStage(error);
  }

  const extent = volume.non_air_bounds.extent;
  if ([extent.x, extent.y, extent.z].some((value) => value > 64)) {
    if (state.state !== 'structure_validated') {
      return failStage(new CandidateReadinessError(
        'OVERSIZE_STATE_INVALID', 'pilot', candidate.candidate_id
      ));
    }
    await append('deferred_oversized_public', {
      extent_sha256: hashPilotValue(extent)
    }, ['ACTUAL_EXTENT_EXCEEDS_64']);
    return terminalOrExistingResult(state, latestEvent(ledger, candidate.candidate_id));
  }

  if (state.state === 'structure_validated') {
    await append('completeness_validated', {
      admission_evidence_sha256: candidate.admission_evidence_sha256,
      rights_evidence_sha256: candidate.rights.evidence_sha256,
      standalone_evidence_sha256: hashPilotValue({
        candidate_id: candidate.candidate_id,
        standalone_evidence: candidate.technical.standalone_evidence
      })
    });
  }

  let prepared;
  try {
    prepared = prepareConditionalVolume({
      candidateId: candidate.candidate_id,
      contentSha256,
      volume,
      evidenceMode: 'operational'
    });
    const repeated = prepareConditionalVolume({
      candidateId: candidate.candidate_id,
      contentSha256,
      volume,
      evidenceMode: 'operational'
    });
    if (prepared.record.preparation_sha256 !== repeated.record.preparation_sha256
      || prepared.record.voxel_sha256 !== repeated.record.voxel_sha256
      || !prepared.voxels.equals(repeated.voxels)) {
      throw new CandidateReadinessError(
        'PREPARATION_NONDETERMINISTIC', 'pilot', candidate.candidate_id
      );
    }
    await persistPilotPrepared(root, prepared, deps);
    if (state.state === 'completeness_validated') {
      await append('prepared', {
        preparation_sha256: prepared.record.preparation_sha256,
        voxel_sha256: prepared.record.voxel_sha256
      });
    }
  } catch (error) {
    return failStage(error);
  }

  let fingerprint;
  let existingFingerprints;
  let comparisons;
  try {
    fingerprint = fingerprintConditionalVolume(prepared);
    const repeated = fingerprintConditionalVolume(prepared);
    if (canonicalPilotJson(fingerprint) !== canonicalPilotJson(repeated)) {
      throw new CandidateReadinessError(
        'FINGERPRINT_NONDETERMINISTIC', 'pilot', candidate.candidate_id
      );
    }
    existingFingerprints = await readPilotFingerprints(root, deps);
    comparisons = existingFingerprints
      .filter((other) => other.candidate_id !== candidate.candidate_id)
      .map((other) => ({
        compared_candidate_id: other.candidate_id,
        compared_content_sha256: other.content_sha256,
        ...compareConditionalFingerprints(fingerprint, other)
      }));
    await appendPilotFingerprint(root, fingerprint, deps);
    if (state.state === 'prepared') {
      await append('fingerprinted', {
        fingerprint_sha256: hashPilotValue(fingerprint),
        structural_sha256: fingerprint.yaw_canonical_sha256
      });
    }
  } catch (error) {
    return failStage(error);
  }

  const exact = comparisons.find((comparison) => comparison.exact_byte_duplicate);
  if (exact && !enteredFingerprinted) {
    if (state.state === 'fingerprinted') {
      await append('rejected_duplicate', {
        content_sha256: contentSha256,
        duplicate_content_sha256: exact.compared_content_sha256
      }, ['EXACT_BYTE_DUPLICATE']);
    }
    return machineResult({
      candidate, state, prepared, fingerprint, comparisons, reasonCodes: ['EXACT_BYTE_DUPLICATE']
    });
  }
  return machineResult({ candidate, state, prepared, fingerprint, comparisons });
}

async function assertExecutionBinding(root, batch, candidate, deps) {
  let stored;
  try {
    stored = validatePilotBatchDocument(await readPilotJson(
      root, 'manifests/named-batch.json', deps
    ));
  } catch (error) {
    if (error instanceof PilotFilesystemError) {
      throw new CandidateReadinessError(
        'PILOT_BATCH_MANIFEST_INVALID', 'pilot', candidate.candidate_id
      );
    }
    throw error;
  }
  if (canonicalPilotJson(stored) !== canonicalPilotJson(batch)) {
    throw new CandidateReadinessError(
      'PILOT_BATCH_MANIFEST_MISMATCH', 'pilot', candidate.candidate_id
    );
  }
  const currentCodeRevision = deps.currentCodeRevision || defaultCodeRevision;
  const revision = await currentCodeRevision();
  if (revision !== batch.batch.code_revision) {
    throw new CandidateReadinessError(
      'PILOT_CODE_REVISION_MISMATCH', 'pilot', candidate.candidate_id
    );
  }
}

async function defaultCodeRevision() {
  const { stdout } = await execFile('git', ['rev-parse', 'HEAD'], {
    cwd: process.cwd(), encoding: 'utf8'
  });
  return stdout.trim();
}

function machineResult({
  candidate,
  state,
  prepared,
  fingerprint,
  comparisons,
  reasonCodes = []
}) {
  const proposals = comparisons.filter((comparison) => comparison.near_duplicate_proposed)
    .map((comparison) => ({
      compared_candidate_id: comparison.compared_candidate_id,
      structural_equivalent: comparison.structural_equivalent,
      occupancy_similarity: comparison.occupancy_similarity,
      material_similarity: comparison.material_similarity,
      shares_lsh_bucket: comparison.shares_lsh_bucket
    }))
    .sort((left, right) => left.compared_candidate_id.localeCompare(right.compared_candidate_id));
  return deepFreeze({
    candidate_id: candidate.candidate_id,
    state: state.state,
    terminal: state.terminal,
    awaiting_human_review: state.state === 'fingerprinted',
    dimensions: {
      declared: prepared.record.declared_size,
      actual_extent: prepared.record.actual_extent
    },
    token_counts: prepared.record.token_counts,
    token_proportions: prepared.record.token_proportions,
    non_air_count: prepared.record.non_air_count,
    token_8_share: prepared.record.token_8_share,
    hashes: {
      content_sha256: prepared.record.content_sha256,
      voxel_sha256: prepared.record.voxel_sha256,
      preparation_sha256: prepared.record.preparation_sha256,
      structural_sha256: fingerprint.yaw_canonical_sha256,
      fingerprint_sha256: hashPilotValue(fingerprint)
    },
    duplicate_proposals: proposals,
    reason_codes: [...reasonCodes],
    authorizes_training: false,
    authorizes_dataset_admission: false
  });
}

function terminalOrExistingResult(state, event) {
  return deepFreeze({
    candidate_id: state.candidate_id,
    state: state.state,
    terminal: state.terminal,
    awaiting_human_review: state.state === 'fingerprinted',
    dimensions: null,
    token_counts: [],
    token_proportions: [],
    non_air_count: null,
    token_8_share: null,
    hashes: {},
    duplicate_proposals: [],
    reason_codes: [...(event?.reason_codes || [])],
    authorizes_training: false,
    authorizes_dataset_admission: false
  });
}

function eventForState(records, candidateId, stateAfter) {
  return records.find((record) => record.candidate_id === candidateId
    && record.state_after === stateAfter);
}

function latestEvent(records, candidateId) {
  return records.filter((record) => record.candidate_id === candidateId)
    .sort((left, right) => left.revision - right.revision).at(-1);
}

function operationalFailure(error) {
  return error instanceof CandidateReadinessError
    || error instanceof PilotArtifactError
    || error instanceof PilotFilesystemError;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
