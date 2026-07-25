import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TrainingDataError } from '../../trainingError.js';
import { failContract } from '../contracts/contractError.js';
import { validateIntakeReport } from '../contracts/intakeReport.js';
import { validateSourceProfile } from '../contracts/sourceProfile.js';
import {
  INTAKE_REPORT_SOURCE,
  RESIDENTIAL_SCHEMA_VERSION
} from '../contracts/vocabularies.js';
import { assertId } from '../contracts/validation.js';
import { inventorySourceBatch } from './batch.js';
import { supportedResidentialFormat, parseResidentialArtifact } from './artifactParser.js';
import { canonicalJson } from './canonicalJson.js';
import { buildSourceProfile } from './profileBuilder.js';
import {
  quarantineArtifact,
  readCandidateBytes,
  writeJsonOnceOrVerify,
  writeQuarantineFingerprint
} from './storage.js';

const REPORT_PREFIX = 'intake-';
const REPORT_SUFFIX = '.json';

export async function intakeResidentialBatch({
  root,
  batchId,
  projectRoot,
  actor = 'r2-intake',
  clock = () => new Date()
}) {
  assertId(actor, 'Intake.actor');
  const inventory = await inventorySourceBatch({ root, batchId, projectRoot });
  const reportPath = path.join(
    root,
    'reports',
    `${REPORT_PREFIX}${inventory.manifest.batch_id}${REPORT_SUFFIX}`
  );
  const completed = await readIntakeReport(reportPath);
  if (completed) {
    await validateRecordedReportInventory(completed, inventory);
    return completed;
  }

  const priorObservations = await priorArtifactObservations({
    root,
    reportPath
  });
  const currentRunObservations = new Map();
  const candidates = [];
  for (const candidate of inventory.candidates) {
    const outcome = await intakeCandidate({
      root,
      projectRoot,
      manifest: inventory.manifest,
      candidate,
      actor,
      clock,
      priorObservations,
      currentRunObservations
    });
    candidates.push(outcome);
    if (
      outcome.artifact_sha256 !== null
      && !currentRunObservations.has(outcome.artifact_sha256)
    ) {
      currentRunObservations.set(outcome.artifact_sha256, Object.freeze({
        case_id: outcome.case_id,
        source_profile_file: outcome.source_profile_file
      }));
    }
  }
  const report = validateIntakeReport({
    source: INTAKE_REPORT_SOURCE,
    schema_version: RESIDENTIAL_SCHEMA_VERSION,
    operation: 'batch_intake',
    batch_id: inventory.manifest.batch_id,
    source_project: inventory.manifest.source_project,
    manifest_sha256: inventory.manifest_sha256,
    summary: summaryFor(candidates),
    candidates
  });
  await writeJsonOnceOrVerify(reportPath, report);
  return report;
}

async function intakeCandidate({
  root,
  projectRoot,
  manifest,
  candidate,
  actor,
  clock,
  priorObservations,
  currentRunObservations
}) {
  const base = {
    observation_id: observationId(manifest.batch_id, candidate.relative_path),
    submitted: candidate.submitted
  };
  let bytes;
  try {
    bytes = await readCandidateBytes(candidate.absolute_path);
  } catch (error) {
    if (!(error instanceof TrainingDataError)) throw error;
    return candidateOutcome(base, {
      case_id: null,
      artifact_sha256: null,
      source_profile_file: null,
      outcome: parserOutcome(error),
      reason: parserReason(error)
    });
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const quarantine = await quarantineArtifact({
    root,
    projectRoot,
    bytes,
    sha256
  });
  const common = {
    case_id: quarantine.case_id,
    artifact_sha256: sha256
  };
  const currentObservation = currentRunObservations.get(sha256);
  if (currentObservation) {
    return candidateOutcome(base, {
      ...common,
      source_profile_file: currentObservation.source_profile_file,
      outcome: 'duplicate',
      reason: 'exact_duplicate'
    });
  }
  const priorObservation = priorObservations.get(sha256);
  if (priorObservation) {
    const sourceProfileFile = await priorSourceProfileFile({
      root,
      observation: priorObservation,
      sha256
    });
    return candidateOutcome(base, {
      case_id: priorObservation.case_id,
      artifact_sha256: sha256,
      source_profile_file: sourceProfileFile,
      outcome: 'duplicate',
      reason: 'exact_duplicate'
    });
  }
  if (!supportedResidentialFormat(candidate.relative_path)) {
    return candidateOutcome(base, {
      ...common,
      source_profile_file: null,
      outcome: 'deferred',
      reason: 'unsupported_format'
    });
  }

  let artifact;
  try {
    artifact = parseResidentialArtifact({
      bytes,
      originalFilename: candidate.relative_path,
      sourceId: quarantine.case_id,
      occupiedExtentLimit: 64
    });
  } catch (error) {
    if (!(error instanceof TrainingDataError)) throw error;
    if (error.code === 'SOURCE_OCCUPIED_BOUNDS_LIMIT') {
      return candidateOutcome(base, {
        ...common,
        source_profile_file: null,
        outcome: 'deferred',
        reason: 'occupied_bounds_exceed_64'
      });
    }
    return candidateOutcome(base, {
      ...common,
      source_profile_file: null,
      outcome: parserOutcome(error),
      reason: parserReason(error)
    });
  }
  await writeQuarantineFingerprint({
    root,
    projectRoot,
    caseId: quarantine.case_id,
    fingerprint: artifact.structural_fingerprint
  });

  const profileFile = `sources/${quarantine.case_id}.json`;
  const profilePath = path.join(root, ...profileFile.split('/'));
  const existing = await readSourceProfile(profilePath);
  if (existing) {
    if (
      existing.case_id !== quarantine.case_id
      || existing.fingerprints.exact_sha256 !== sha256
    ) {
      failContract(
        'SOURCE_PROFILE_ARTIFACT_CONFLICT',
        'SourceProfile.case_id',
        quarantine.case_id
      );
    }
    if (existing.batch_id === manifest.batch_id) {
      return recoverSameBatchProfile({
        base,
        common,
        profileFile,
        profile: existing,
        manifest,
        candidate: candidate.submitted,
        artifact,
        caseId: quarantine.case_id
      });
    }
    return candidateOutcome(base, {
      ...common,
      source_profile_file: profileFile,
      outcome: 'duplicate',
      reason: 'exact_duplicate'
    });
  }
  const profile = buildSourceProfile({
    manifest,
    candidate: candidate.submitted,
    caseId: quarantine.case_id,
    artifact,
    actor,
    at: clock()
  });
  await writeJsonOnceOrVerify(profilePath, profile);
  return candidateOutcome(base, {
    ...common,
    source_profile_file: profileFile,
    outcome: candidate.submitted.lane === 'houses' ? 'parsed' : 'deferred',
    reason: candidate.submitted.lane === 'houses'
      ? 'residential_candidate_requires_review'
      : 'non_residential_reference_only'
  });
}

function recoverSameBatchProfile({
  base,
  common,
  profileFile,
  profile,
  manifest,
  candidate,
  artifact,
  caseId
}) {
  const deferred = candidate.lane === 'other-architecture';
  let expected;
  try {
    const firstDecision = profile.decisions[0];
    expected = buildSourceProfile({
      manifest,
      candidate,
      caseId,
      artifact,
      actor: firstDecision.actor,
      at: firstDecision.at
    });
  } catch {
    failContract(
      'SOURCE_PROFILE_BATCH_RECOVERY_CONFLICT',
      'SourceProfile.case_id',
      caseId
    );
  }
  if (canonicalJson(profile) !== canonicalJson(expected)) {
    failContract(
      'SOURCE_PROFILE_BATCH_RECOVERY_CONFLICT',
      'SourceProfile.case_id',
      caseId
    );
  }
  return candidateOutcome(base, {
    ...common,
    source_profile_file: profileFile,
    outcome: expected.status,
    reason: deferred
      ? 'non_residential_reference_only'
      : 'residential_candidate_requires_review'
  });
}

function candidateOutcome(base, value) {
  return { ...base, ...value };
}

function summaryFor(candidates) {
  return {
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
}

function observationId(batchId, relativePath) {
  return `observation-${createHash('sha256')
    .update(`${batchId}\0${relativePath}`)
    .digest('hex')
    .slice(0, 24)}`;
}

async function validateRecordedReportInventory(report, inventory) {
  if (
    report.manifest_sha256 !== inventory.manifest_sha256
    || report.batch_id !== inventory.manifest.batch_id
    || report.source_project !== inventory.manifest.source_project
    || report.candidates.length !== inventory.candidates.length
  ) {
    failRecordedReport(inventory.manifest.batch_id);
  }
  for (let index = 0; index < inventory.candidates.length; index += 1) {
    const expected = inventory.candidates[index];
    const observed = report.candidates[index];
    if (
      observed.observation_id !== observationId(
        inventory.manifest.batch_id,
        expected.relative_path
      )
      || canonicalJson(observed.submitted) !== canonicalJson(expected.submitted)
    ) {
      failRecordedReport(inventory.manifest.batch_id);
    }
    await validateRecordedCandidatePayload(
      observed,
      expected,
      inventory.manifest.batch_id
    );
  }
}

async function validateRecordedCandidatePayload(observed, expected, batchId) {
  try {
    const bytes = await readCandidateBytes(expected.absolute_path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (observed.artifact_sha256 !== sha256) failRecordedReport(batchId);
  } catch (error) {
    if (
      !(error instanceof TrainingDataError)
      || observed.artifact_sha256 !== null
      || observed.outcome !== parserOutcome(error)
      || observed.reason !== parserReason(error)
    ) {
      failRecordedReport(batchId);
    }
  }
}

function failRecordedReport(batchId) {
  failContract(
    'INTAKE_BATCH_ALREADY_RECORDED',
    'IntakeReport.inventory',
    batchId
  );
}

async function readIntakeReport(reportPath) {
  const entry = await safeLstat(reportPath);
  if (!entry) return null;
  if (!entry.isFile() || entry.isSymbolicLink()) {
    failContract('INTAKE_REPORT_INVALID', 'IntakeReport.file', reportPath);
  }
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  } catch (error) {
    failContract(
      'INTAKE_REPORT_INVALID',
      'IntakeReport.file',
      error?.message || reportPath
    );
  }
  return validateIntakeReport(raw);
}

async function readSourceProfile(profilePath) {
  const entry = await safeLstat(profilePath);
  if (!entry) return null;
  if (!entry.isFile() || entry.isSymbolicLink()) {
    failContract('SOURCE_PROFILE_FILE_INVALID', 'SourceProfile.file', profilePath);
  }
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(profilePath, 'utf8'));
  } catch (error) {
    failContract(
      'SOURCE_PROFILE_FILE_INVALID',
      'SourceProfile.file',
      error?.message || profilePath
    );
  }
  return validateSourceProfile(raw);
}

async function priorSourceProfileFile({ root, observation, sha256 }) {
  const profileFile = observation.source_profile_file;
  if (profileFile === null) return null;
  const profilePath = path.join(root, ...profileFile.split('/'));
  const profile = await readSourceProfile(profilePath);
  if (profile === null) return null;
  if (
    profile.case_id !== observation.case_id
    || profile.fingerprints.exact_sha256 !== sha256
  ) {
    failContract(
      'SOURCE_PROFILE_ARTIFACT_CONFLICT',
      'SourceProfile.case_id',
      observation.case_id
    );
  }
  return profileFile;
}

async function priorArtifactObservations({ root, reportPath }) {
  const observations = new Map();
  const directory = path.join(root, 'reports');
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (!entry.name.startsWith(REPORT_PREFIX) || !entry.name.endsWith(REPORT_SUFFIX)) {
      continue;
    }
    const candidatePath = path.join(directory, entry.name);
    if (candidatePath === reportPath) continue;
    if (!entry.isFile() || entry.isSymbolicLink()) {
      failContract('INTAKE_REPORT_INVALID', 'IntakeReport.file', candidatePath);
    }
    const report = await readIntakeReport(candidatePath);
    for (const candidate of report.candidates) {
      const existing = observations.get(candidate.artifact_sha256);
      if (
        candidate.artifact_sha256 !== null
        && (
          existing === undefined
          || (
            existing.source_profile_file === null
            && candidate.source_profile_file !== null
          )
        )
      ) {
        observations.set(candidate.artifact_sha256, Object.freeze({
          case_id: candidate.case_id,
          source_profile_file: candidate.source_profile_file
        }));
      }
    }
  }
  return observations;
}

function parserOutcome(error) {
  return parserLimit(error) ? 'deferred' : 'rejected';
}

function parserReason(error) {
  return parserLimit(error) ? 'parser_limit' : 'malformed_or_unsafe_source';
}

function parserLimit(error) {
  if (!(error instanceof TrainingDataError)) return false;
  return error.code.endsWith('_LIMIT')
    || error.code === 'RAW_BYTES_LIMIT'
    || error.code === 'NBT_COMPRESSION_RATIO';
}

async function safeLstat(filePath) {
  try {
    return await fs.lstat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}
