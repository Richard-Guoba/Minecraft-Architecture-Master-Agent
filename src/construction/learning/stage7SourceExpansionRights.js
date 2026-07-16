import {
  SourceExpansionContractError,
  validateIsoDate
} from './stage7SourceExpansionContracts.js';

const REQUIRED_PERMISSIONS = Object.freeze({
  download: 'RIGHTS_DOWNLOAD_DENIED',
  copy: 'RIGHTS_COPY_DENIED',
  transform: 'RIGHTS_TRANSFORM_DENIED',
  training: 'RIGHTS_TRAINING_DENIED',
  derivative_research_artifacts: 'RIGHTS_DERIVATIVE_DENIED',
  local_retention: 'RIGHTS_RETENTION_DENIED'
});

export function latestUniqueRevision(records, candidateId) {
  const matches = records.filter((record) => record.candidate_id === candidateId);
  if (matches.length === 0) return null;
  const revision = Math.max(...matches.map((record) => record.revision));
  const latest = matches.filter((record) => record.revision === revision);
  if (latest.length !== 1) {
    throw new SourceExpansionContractError('RIGHTS_REVISION_AMBIGUOUS', candidateId);
  }
  return latest[0];
}

export function evaluateRightsEvidence({ candidate, evidence, asOf }) {
  validateIsoDate(asOf, 'asOf');
  const blockers = [];
  if (!evidence) {
    blockers.push('RIGHTS_MISSING');
  } else {
    const observedAt = validateIsoDate(evidence.observed_at, 'evidence.observed_at');
    const ageDays = dayNumber(asOf) - dayNumber(observedAt);
    if (ageDays < 0) blockers.push('RIGHTS_FUTURE_DATED');
    if (ageDays > 30) blockers.push('RIGHTS_STALE');
    if (!['asset', 'uniform-family'].includes(evidence.scope)) {
      blockers.push('RIGHTS_SCOPE_INVALID');
    }
    if (!Array.isArray(evidence.author_chain) || evidence.author_chain.length === 0) {
      blockers.push('RIGHTS_AUTHOR_CHAIN_EMPTY');
    }
    for (const [permission, code] of Object.entries(REQUIRED_PERMISSIONS)) {
      if (evidence.permissions?.[permission] !== true) blockers.push(code);
    }
    if (evidence.ai_ml_restriction === true) blockers.push('RIGHTS_AI_ML_RESTRICTED');
    if (evidence.platform_conflict === true) blockers.push('RIGHTS_PLATFORM_CONFLICT');
    if (evidence.upstream_conflict === true) blockers.push('RIGHTS_UPSTREAM_CONFLICT');
    if (evidence.conclusion !== 'verified') blockers.push('RIGHTS_CONCLUSION_NOT_VERIFIED');
  }

  const uniqueBlockers = Object.freeze([...new Set(blockers)].sort());
  return Object.freeze({
    candidate_id: candidate.candidate_id,
    state: uniqueBlockers.length === 0
      ? 'rights_verified'
      : stateForConclusion(evidence?.conclusion),
    rights_verified: uniqueBlockers.length === 0,
    evidence_revision: evidence?.revision ?? null,
    blockers: uniqueBlockers
  });
}

export function evaluateRightsLedger({ candidates, rightsRecords, asOf }) {
  validateIsoDate(asOf, 'asOf');
  const candidateIds = candidates.map((candidate) => candidate.candidate_id);
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new SourceExpansionContractError('CANDIDATE_DUPLICATE', 'candidate_id');
  }
  const known = new Set(candidateIds);
  const orphan = rightsRecords.find((record) => !known.has(record.candidate_id));
  if (orphan) {
    throw new SourceExpansionContractError('RIGHTS_ORPHAN', orphan.candidate_id);
  }

  const sortedCandidates = [...candidates].sort((left, right) =>
    left.candidate_id.localeCompare(right.candidate_id)
  );
  return Object.freeze(sortedCandidates.map((candidate) =>
    evaluateRightsEvidence({
      candidate,
      evidence: latestUniqueRevision(rightsRecords, candidate.candidate_id),
      asOf
    })
  ));
}

function dayNumber(value) {
  return Math.floor(Date.parse(`${value}T00:00:00Z`) / 86_400_000);
}

function stateForConclusion(conclusion) {
  if (conclusion === 'private_research_only') return 'private_research_only';
  if (conclusion === 'rejected') return 'rejected';
  return 'deferred';
}
