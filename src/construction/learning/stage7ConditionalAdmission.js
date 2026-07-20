import { ConditionalAdmissionContractError } from './stage7ConditionalTaxonomy.js';

export function latestUniqueAssessment(records, candidateId) {
  const matches = records.filter((record) => record.candidate_id === candidateId);
  if (matches.length === 0) return null;
  const revision = Math.max(...matches.map((record) => record.revision));
  const latest = matches.filter((record) => record.revision === revision);
  if (latest.length !== 1) {
    throw new ConditionalAdmissionContractError(
      'ASSESSMENT_REVISION_AMBIGUOUS', candidateId
    );
  }
  return latest[0];
}

export function evaluateConditionalAdmission({
  candidates,
  rightsResults,
  reviewDecisions,
  assessments
}) {
  const candidateIds = candidates.map((candidate) => candidate.candidate_id);
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new ConditionalAdmissionContractError('CANDIDATE_DUPLICATE', 'candidate_id');
  }
  const known = new Set(candidateIds);
  rejectOrphan(rightsResults, known, 'RIGHTS_ORPHAN');
  rejectOrphan(reviewDecisions, known, 'REVIEW_ORPHAN');
  rejectOrphan(assessments, known, 'ASSESSMENT_ORPHAN');
  const rightsById = uniqueByCandidate(rightsResults, 'RIGHTS_RESULT_AMBIGUOUS');
  const reviewById = latestUniqueMap(reviewDecisions, 'REVIEW_REVISION_AMBIGUOUS');
  return Object.freeze([...candidates]
    .sort((left, right) => left.candidate_id.localeCompare(right.candidate_id))
    .map((candidate) => {
      const rights = rightsById.get(candidate.candidate_id) || null;
      const review = reviewById.get(candidate.candidate_id) || null;
      const assessment = latestUniqueAssessment(assessments, candidate.candidate_id);
      if (assessment && assessment.source_group !== candidate.source_id) {
        throw new ConditionalAdmissionContractError(
          'ASSESSMENT_SOURCE_MISMATCH', candidate.candidate_id
        );
      }
      const state = admissionState(rights, review, assessment);
      return deepFreeze({
        candidate_id: candidate.candidate_id,
        source_id: candidate.source_id,
        state,
        rights_verified: rights?.rights_verified === true,
        review_decision: review?.decision ?? 'pending',
        review_revision: review?.revision ?? null,
        taxonomy_revision: assessment?.revision ?? null,
        primary_function: assessment?.primary_function ?? null,
        style_family: assessment?.style_family ?? null,
        completeness: assessment?.completeness ?? null,
        label_confidence: assessment?.label_confidence ?? null,
        blockers: blockersFor(rights, review, assessment, state),
        metadata_only: true,
        authorizes_download: false,
        authorizes_training: false,
        authorizes_dataset_admission: false
      });
    }));
}

export function buildConditionalAdmissionSummary(results) {
  const stateCounts = countBy(results, (item) => item.state);
  const functionCounts = countBy(
    results.filter((item) => item.primary_function !== null),
    (item) => item.primary_function
  );
  const styleCounts = countBy(
    results.filter((item) => item.style_family !== null),
    (item) => item.style_family
  );
  return deepFreeze({
    source: 'stage7-conditional-admission-r1-v1',
    metadata_only: true,
    authorizes_download: false,
    authorizes_training: false,
    authorizes_dataset_admission: false,
    candidate_count: results.length,
    contract_ready_count: results.filter(
      (item) => item.state === 'admission_contract_ready'
    ).length,
    state_counts: Object.fromEntries([...stateCounts].sort()),
    function_counts: Object.fromEntries([...functionCounts].sort()),
    style_counts: Object.fromEntries([...styleCounts].sort()),
    states: results
  });
}

export function renderConditionalAdmissionMarkdown(summary) {
  const stateRows = Object.entries(summary.state_counts)
    .map(([state, count]) => `| ${state} | ${count} |`)
    .join('\n') || '| none | 0 |';
  return `# Stage 7 Conditional Admission R1 Audit

- Metadata only: yes
- Candidate records: ${summary.candidate_count}
- Admission-contract ready: ${summary.contract_ready_count}

| State | Count |
| --- | ---: |
${stateRows}

This report does not authorize download, Dataset admission, or training.
`;
}

function admissionState(rights, review, assessment) {
  if (rights?.state === 'rejected' || review?.decision === 'reject'
    || assessment?.assessment_decision === 'reject') return 'rejected';
  if (rights?.state === 'private_research_only') return 'private_research_only';
  if (rights?.rights_verified !== true) return 'rights_pending';
  if (!review) return 'human_review_pending';
  if (review.decision === 'defer') return 'human_deferred';
  if (review.decision !== 'accept') return 'human_review_pending';
  if (!assessment) return 'taxonomy_pending';
  if (assessment.assessment_decision === 'defer') {
    if (assessment.completeness !== 'complete') return 'deferred_incomplete';
    if (assessment.label_confidence === 'low') return 'deferred_label';
    return 'taxonomy_deferred';
  }
  return 'admission_contract_ready';
}

function blockersFor(rights, review, assessment, state) {
  const blockers = [...(rights?.blockers || [])];
  if (!review) blockers.push('HUMAN_REVIEW_MISSING');
  if (review?.decision === 'defer') blockers.push('HUMAN_REVIEW_DEFERRED');
  if (review?.decision === 'reject') blockers.push('HUMAN_REVIEW_REJECTED');
  if (!assessment) blockers.push('TAXONOMY_ASSESSMENT_MISSING');
  if (assessment?.assessment_decision !== 'accept') {
    blockers.push(...(assessment?.reason_codes || []));
  }
  if (state === 'admission_contract_ready') return Object.freeze([]);
  return Object.freeze([...new Set(blockers)].sort());
}

function rejectOrphan(records, known, code) {
  const orphan = records.find((record) => !known.has(record.candidate_id));
  if (orphan) throw new ConditionalAdmissionContractError(code, orphan.candidate_id);
}

function uniqueByCandidate(records, code) {
  const output = new Map();
  for (const record of records) {
    if (output.has(record.candidate_id)) {
      throw new ConditionalAdmissionContractError(code, record.candidate_id);
    }
    output.set(record.candidate_id, record);
  }
  return output;
}

function latestUniqueMap(records, code) {
  const grouped = new Map();
  for (const record of records) {
    const current = grouped.get(record.candidate_id) || [];
    current.push(record);
    grouped.set(record.candidate_id, current);
  }
  const output = new Map();
  for (const [candidateId, candidates] of grouped) {
    const revision = Math.max(...candidates.map((record) => record.revision));
    const latest = candidates.filter((record) => record.revision === revision);
    if (latest.length !== 1) {
      throw new ConditionalAdmissionContractError(code, candidateId);
    }
    output.set(candidateId, latest[0]);
  }
  return output;
}

function countBy(records, key) {
  const counts = new Map();
  for (const record of records) {
    const value = key(record);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
