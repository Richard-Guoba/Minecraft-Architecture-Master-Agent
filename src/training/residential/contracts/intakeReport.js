import {
  assertArtifactPath,
  assertArray,
  assertEnum,
  assertExactObject,
  assertId,
  assertInteger,
  assertNullable,
  assertSha256,
  cloneDocument,
  deepFreeze
} from './validation.js';
import { failContract } from './contractError.js';
import { validateSourceCandidate } from './sourceBatch.js';
import {
  INTAKE_REPORT_SOURCE,
  RESIDENTIAL_SCHEMA_VERSION
} from './vocabularies.js';

const OUTCOMES = ['parsed', 'deferred', 'rejected', 'duplicate'];
const OUTCOME_BY_REASON = Object.freeze({
  residential_candidate_requires_review: 'parsed',
  non_residential_reference_only: 'deferred',
  unsupported_format: 'deferred',
  occupied_bounds_exceed_64: 'deferred',
  parser_limit: 'deferred',
  malformed_or_unsafe_source: 'rejected',
  exact_duplicate: 'duplicate'
});

export function validateIntakeReport(value) {
  const document = cloneDocument(value, 'IntakeReport');
  assertExactObject(document, 'IntakeReport', [
    'source', 'schema_version', 'operation', 'batch_id', 'source_project',
    'manifest_sha256', 'summary', 'candidates'
  ]);
  if (document.source !== INTAKE_REPORT_SOURCE) {
    failContract('INTAKE_REPORT_SOURCE_INVALID', 'IntakeReport.source', document.source);
  }
  if (document.schema_version !== RESIDENTIAL_SCHEMA_VERSION) {
    failContract(
      'INTAKE_REPORT_VERSION_INVALID',
      'IntakeReport.schema_version',
      document.schema_version
    );
  }
  assertEnum(document.operation, 'IntakeReport.operation', ['batch_intake']);
  assertId(document.batch_id, 'IntakeReport.batch_id');
  assertId(document.source_project, 'IntakeReport.source_project');
  assertSha256(document.manifest_sha256, 'IntakeReport.manifest_sha256');
  assertArray(document.candidates, 'IntakeReport.candidates', {
    maximum: 10_000
  });
  const observations = new Set();
  const submittedPaths = new Set();
  document.candidates.forEach((candidate, index) => {
    const itemPath = `IntakeReport.candidates[${index}]`;
    assertExactObject(candidate, itemPath, [
      'observation_id', 'submitted', 'case_id', 'artifact_sha256',
      'source_profile_file', 'outcome', 'reason'
    ]);
    assertId(candidate.observation_id, `${itemPath}.observation_id`);
    if (observations.has(candidate.observation_id)) {
      failContract(
        'INTAKE_REPORT_OBSERVATION_DUPLICATE',
        `${itemPath}.observation_id`,
        candidate.observation_id
      );
    }
    observations.add(candidate.observation_id);
    validateSourceCandidate(candidate.submitted, `${itemPath}.submitted`);
    if (submittedPaths.has(candidate.submitted.relative_path)) {
      failContract(
        'INTAKE_REPORT_SUBMITTED_PATH_DUPLICATE',
        `${itemPath}.submitted.relative_path`,
        candidate.submitted.relative_path
      );
    }
    submittedPaths.add(candidate.submitted.relative_path);
    assertNullable(candidate.case_id, (item) => assertId(item, `${itemPath}.case_id`));
    assertNullable(
      candidate.artifact_sha256,
      (item) => assertSha256(item, `${itemPath}.artifact_sha256`)
    );
    assertNullable(candidate.source_profile_file, (item) => {
      assertArtifactPath(item, `${itemPath}.source_profile_file`);
    });
    assertEnum(candidate.outcome, `${itemPath}.outcome`, OUTCOMES);
    assertId(candidate.reason, `${itemPath}.reason`);
    if (OUTCOME_BY_REASON[candidate.reason] !== candidate.outcome) {
      failContract(
        'INTAKE_REPORT_OUTCOME_REASON_INVALID',
        `${itemPath}.reason`,
        `${candidate.outcome}/${candidate.reason}`
      );
    }
    validateCandidateRelationships(candidate, itemPath);
  });
  validateSummary(document.summary, document.candidates);
  return deepFreeze(document);
}

function validateCandidateRelationships(candidate, itemPath) {
  const hasCase = candidate.case_id !== null;
  const hasHash = candidate.artifact_sha256 !== null;
  const hasProfile = candidate.source_profile_file !== null;
  if (hasCase !== hasHash) {
    failIdentity(itemPath, 'case and exact hash must appear together');
  }
  if (
    hasCase
    && candidate.case_id !== `case-${candidate.artifact_sha256.slice(0, 24)}`
  ) {
    failContract(
      'INTAKE_REPORT_CASE_ID_MISMATCH',
      `${itemPath}.case_id`,
      candidate.case_id
    );
  }
  if (
    hasProfile
    && (
      !hasCase
      || candidate.source_profile_file !== `sources/${candidate.case_id}.json`
    )
  ) {
    failContract(
      'INTAKE_REPORT_PROFILE_PATH_INVALID',
      `${itemPath}.source_profile_file`,
      candidate.source_profile_file
    );
  }

  if ([
    'residential_candidate_requires_review',
    'non_residential_reference_only'
  ].includes(candidate.reason)) {
    if (!hasCase || !hasProfile) {
      failIdentity(itemPath, 'parsed outcomes require identity and profile');
    }
    return;
  }
  if (['unsupported_format', 'occupied_bounds_exceed_64'].includes(
    candidate.reason
  )) {
    if (!hasCase || hasProfile) {
      failIdentity(itemPath, 'post-quarantine deferral requires identity only');
    }
    return;
  }
  if ([
    'parser_limit',
    'malformed_or_unsafe_source'
  ].includes(candidate.reason)) {
    if (hasProfile) {
      failIdentity(itemPath, 'parser/read failures cannot reference a profile');
    }
    return;
  }
  if (candidate.reason === 'exact_duplicate' && !hasCase) {
    failIdentity(itemPath, 'exact duplicates require an identity');
  }
}

function failIdentity(itemPath, detail) {
  failContract(
    'INTAKE_REPORT_IDENTITY_INVALID',
    itemPath,
    detail
  );
}

function validateSummary(summary, candidates) {
  const path = 'IntakeReport.summary';
  const fields = [
    'candidate_count', 'quarantined_count', 'parsed_count', 'deferred_count',
    'rejected_count', 'duplicate_count', 'source_profile_count'
  ];
  assertExactObject(summary, path, fields);
  fields.forEach((field) => {
    assertInteger(summary[field], `${path}.${field}`, { minimum: 0 });
  });
  const expected = {
    candidate_count: candidates.length,
    quarantined_count: candidates.filter((item) => item.case_id !== null).length,
    parsed_count: candidates.filter((item) => item.outcome === 'parsed').length,
    deferred_count: candidates.filter((item) => item.outcome === 'deferred').length,
    rejected_count: candidates.filter((item) => item.outcome === 'rejected').length,
    duplicate_count: candidates.filter((item) => item.outcome === 'duplicate').length,
    source_profile_count: candidates.filter(
      (item) => item.source_profile_file !== null
    ).length
  };
  for (const field of fields) {
    if (summary[field] !== expected[field]) {
      failContract(
        'INTAKE_REPORT_SUMMARY_MISMATCH',
        `${path}.${field}`,
        `${summary[field]} != ${expected[field]}`
      );
    }
  }
}
