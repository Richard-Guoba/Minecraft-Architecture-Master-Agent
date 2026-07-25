import { createHash } from 'node:crypto';
import {
  SOURCE_PROFILE_SOURCE,
  RESIDENTIAL_SCHEMA_VERSION
} from '../contracts/vocabularies.js';
import { validateSourceProfile } from '../contracts/sourceProfile.js';

export function buildSourceProfile({
  manifest,
  candidate,
  caseId,
  artifact,
  actor = 'r2-intake',
  at
}) {
  const firstAt = new Date(at);
  const decision = (action, fromStatus, toStatus, reason, offset) => ({
    id: decisionId(caseId, action),
    at: new Date(firstAt.getTime() + offset).toISOString(),
    actor,
    action,
    from_status: fromStatus,
    to_status: toStatus,
    reason
  });
  const decisions = [
    decision('quarantine', null, 'quarantined', 'immutable source recorded', 0),
    decision('parse', 'quarantined', 'parsed', 'bounded source parsed', 1)
  ];
  if (candidate.lane === 'other-architecture') {
    decisions.push(decision(
      'defer_reference',
      'parsed',
      'deferred',
      'non_residential_reference_only',
      2
    ));
  }
  return validateSourceProfile({
    source: SOURCE_PROFILE_SOURCE,
    schema_version: RESIDENTIAL_SCHEMA_VERSION,
    case_id: caseId,
    batch_id: manifest.batch_id,
    title: candidate.title,
    origin: candidate.origin,
    artifact: {
      original_filename: candidate.relative_path.split('/').at(-1),
      format: artifact.format,
      byte_size: artifact.byte_size,
      sha256: artifact.exact_sha256
    },
    lineage: {
      source_project: manifest.source_project,
      asset_family:
        `family-${artifact.structural_fingerprint.yaw_canonical_sha256.slice(0, 24)}`
    },
    measurements: {
      occupied_bounds: artifact.occupied_bounds
    },
    fingerprints: {
      exact_sha256: artifact.exact_sha256,
      structural_sha256:
        artifact.structural_fingerprint.yaw_canonical_sha256
    },
    evidence: {
      complete_residence: 'unknown',
      furnished: 'unknown',
      survival_core: 'unknown',
      supported_content: 'unknown'
    },
    status: candidate.lane === 'houses' ? 'parsed' : 'deferred',
    decisions
  });
}

function decisionId(caseId, action) {
  return `decision-${createHash('sha256')
    .update(`${caseId}\0${action}`)
    .digest('hex')
    .slice(0, 24)}`;
}
