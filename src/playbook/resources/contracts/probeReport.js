import { failPlaybookContract } from '../../contracts/playbookContractError.js';
import {
  AVAILABILITY_STATUSES,
  OBSERVATION_BASES,
  RESOURCE_SCHEMA_VERSION,
  RIGHTS_STATUSES
} from './vocabularies.js';
import {
  assertExactObject,
  assertHttpsUrl,
  assertLowercaseKebabId,
  assertNullable,
  assertRatings,
  assertSha256,
  assertString,
  assertTimestamp,
  assertUniqueArray,
  cloneResourceDocument,
  deepFreeze
} from './validation.js';

export const PROBE_REPORT_FIELDS = Object.freeze([
  'schema_version', 'probe_id', 'source_id', 'canonical_url', 'title', 'sample_role',
  'selection_reason', 'observed_at', 'observation_bases', 'access_result',
  'content_revision', 'content_fingerprint', 'creator_observation', 'observed_structure',
  'extractable_fields', 'knowledge_value', 'rights_observations', 'blocking_conditions',
  'recommended_adapter_behavior', 'summary'
]);

const ACCESS_RESULT_FIELDS = Object.freeze(['status', 'http_status', 'final_url', 'note']);
const CONTENT_REVISION_FIELDS = Object.freeze(['status', 'value', 'basis']);
const CONTENT_FINGERPRINT_FIELDS = Object.freeze(['status', 'sha256', 'basis']);
const CREATOR_OBSERVATION_FIELDS = Object.freeze([
  'status', 'display_name', 'profile_url', 'bases'
]);
const RIGHTS_OBSERVATION_FIELDS = Object.freeze([
  'status', 'evidence_url', 'checked_at', 'note'
]);
const RIGHTS_DIMENSIONS = Object.freeze([
  'public_access', 'local_analysis', 'automated_retrieval', 'artifact_download',
  'model_training', 'external_redistribution'
]);
const CREATOR_STATUSES = Object.freeze(['known', 'unknown', 'conflicting', 'not-applicable']);

export function validateResourceProbeReport(value) {
  const probe = cloneResourceDocument(value, 'ResourceProbeReport');
  assertExactObject(probe, 'ResourceProbeReport', PROBE_REPORT_FIELDS);
  if (probe.schema_version !== RESOURCE_SCHEMA_VERSION) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_VERSION_INVALID',
      'ResourceProbeReport.schema_version',
      probe.schema_version
    );
  }
  assertLowercaseKebabId(probe.probe_id, 'ResourceProbeReport.probe_id');
  assertLowercaseKebabId(probe.source_id, 'ResourceProbeReport.source_id');
  assertHttpsUrl(probe.canonical_url, 'ResourceProbeReport.canonical_url');
  assertString(probe.title, 'ResourceProbeReport.title', { maximum: 512 });
  assertLowercaseKebabId(probe.sample_role, 'ResourceProbeReport.sample_role');
  assertString(probe.selection_reason, 'ResourceProbeReport.selection_reason', { maximum: 512 });
  assertTimestamp(probe.observed_at, 'ResourceProbeReport.observed_at');
  validateObservationBases(probe.observation_bases, 'ResourceProbeReport.observation_bases');
  validateAccessResult(probe.access_result);
  validateContentRevision(probe.content_revision);
  validateContentFingerprint(probe.content_fingerprint);
  validateCreatorObservation(probe.creator_observation, probe.observation_bases);
  for (const field of ['observed_structure', 'extractable_fields', 'recommended_adapter_behavior']) {
    validateProbeStringArray(probe[field], `ResourceProbeReport.${field}`, { minimum: 1 });
  }
  validateProbeStringArray(probe.blocking_conditions, 'ResourceProbeReport.blocking_conditions');
  assertRatings(probe.knowledge_value, 'ResourceProbeReport.knowledge_value');
  validateRightsObservations(probe.rights_observations);
  assertString(probe.summary, 'ResourceProbeReport.summary', { maximum: 512 });
  return deepFreeze(probe);
}

function validateAccessResult(value) {
  const valuePath = 'ResourceProbeReport.access_result';
  assertExactObject(value, valuePath, ACCESS_RESULT_FIELDS);
  assertEnum(value.status, AVAILABILITY_STATUSES,
    'PLAYBOOK_RESOURCE_AVAILABILITY_INVALID', `${valuePath}.status`);
  if (
    value.http_status !== null
    && (!Number.isInteger(value.http_status) || value.http_status < 100 || value.http_status > 599)
  ) {
    failPlaybookContract('PLAYBOOK_RESOURCE_HTTP_STATUS_INVALID', `${valuePath}.http_status`,
      value.http_status);
  }
  assertNullable(value.final_url, (url) => assertHttpsUrl(url, `${valuePath}.final_url`));
  assertString(value.note, `${valuePath}.note`, { maximum: 1024 });
}

function validateContentRevision(value) {
  const valuePath = 'ResourceProbeReport.content_revision';
  assertExactObject(value, valuePath, CONTENT_REVISION_FIELDS);
  assertKnownOrUnknown(value.status, `${valuePath}.status`);
  assertObservationBasis(value.basis, `${valuePath}.basis`);
  if (value.status === 'unknown') {
    if (value.value !== null) {
      failPlaybookContract('PLAYBOOK_RESOURCE_REVISION_UNKNOWN_INVALID', `${valuePath}.value`, value.value);
    }
    return;
  }
  assertString(value.value, `${valuePath}.value`, { maximum: 512 });
  assertObservedKnownValue(value.basis, valuePath, 'PLAYBOOK_RESOURCE_REVISION_SYNTHETIC_FORBIDDEN');
}

function validateContentFingerprint(value) {
  const valuePath = 'ResourceProbeReport.content_fingerprint';
  assertExactObject(value, valuePath, CONTENT_FINGERPRINT_FIELDS);
  assertKnownOrUnknown(value.status, `${valuePath}.status`);
  assertObservationBasis(value.basis, `${valuePath}.basis`);
  if (value.status === 'unknown') {
    if (value.sha256 !== null) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_FINGERPRINT_UNKNOWN_INVALID', `${valuePath}.sha256`, value.sha256
      );
    }
    return;
  }
  assertSha256(value.sha256, `${valuePath}.sha256`);
  assertObservedKnownValue(value.basis, valuePath, 'PLAYBOOK_RESOURCE_FINGERPRINT_SYNTHETIC_FORBIDDEN');
}

function validateCreatorObservation(value, observationBases) {
  const valuePath = 'ResourceProbeReport.creator_observation';
  assertExactObject(value, valuePath, CREATOR_OBSERVATION_FIELDS);
  assertEnum(value.status, CREATOR_STATUSES, 'PLAYBOOK_RESOURCE_CREATOR_STATUS_INVALID',
    `${valuePath}.status`);
  if (value.status === 'known') {
    assertString(value.display_name, `${valuePath}.display_name`, { maximum: 512 });
  } else if (value.display_name !== null) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_CREATOR_NAME_FORBIDDEN', `${valuePath}.display_name`, value.display_name
    );
  }
  assertNullable(value.profile_url, (url) => assertHttpsUrl(url, `${valuePath}.profile_url`));
  validateObservationBases(value.bases, `${valuePath}.bases`);
  for (const basis of value.bases) {
    if (!observationBases.includes(basis)) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_CREATOR_BASIS_UNBOUND', `${valuePath}.bases`, basis
      );
    }
  }
}

function validateRightsObservations(value) {
  const valuePath = 'ResourceProbeReport.rights_observations';
  assertExactObject(value, valuePath, RIGHTS_DIMENSIONS);
  for (const field of RIGHTS_DIMENSIONS) {
    const observationPath = `${valuePath}.${field}`;
    const observation = value[field];
    assertExactObject(observation, observationPath, RIGHTS_OBSERVATION_FIELDS);
    assertEnum(observation.status, RIGHTS_STATUSES, 'PLAYBOOK_RESOURCE_RIGHTS_STATUS_INVALID',
      `${observationPath}.status`);
    assertNullable(observation.evidence_url,
      (url) => assertHttpsUrl(url, `${observationPath}.evidence_url`));
    if (
      (observation.status === 'unknown' || observation.status === 'not-reviewed')
      && observation.evidence_url !== null
    ) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_EVIDENCE_URL_INVALID', `${observationPath}.evidence_url`,
        'unknown or not-reviewed observations require null evidence_url'
      );
    }
    assertTimestamp(observation.checked_at, `${observationPath}.checked_at`);
    assertString(observation.note, `${observationPath}.note`, { maximum: 1024 });
  }
}

function validateProbeStringArray(value, valuePath, { minimum = 0 } = {}) {
  assertUniqueArray(value, valuePath, {
    minimum,
    maximum: 64,
    validate: (item, itemPath) => assertString(item, itemPath, { maximum: 512 })
  });
}

function validateObservationBases(value, valuePath) {
  assertUniqueArray(value, valuePath, {
    minimum: 1,
    maximum: 5,
    validate: assertObservationBasis
  });
}

function assertKnownOrUnknown(value, valuePath) {
  assertEnum(value, ['known', 'unknown'], 'PLAYBOOK_RESOURCE_OBSERVATION_STATUS_INVALID', valuePath);
}

function assertObservedKnownValue(basis, valuePath, code) {
  if (basis === 'project-inference') {
    failPlaybookContract(code, `${valuePath}.basis`, basis);
  }
}

function assertObservationBasis(value, valuePath) {
  assertEnum(value, OBSERVATION_BASES, 'PLAYBOOK_RESOURCE_OBSERVATION_BASIS_INVALID', valuePath);
}

function assertEnum(value, values, code, valuePath) {
  if (!values.includes(value)) {
    failPlaybookContract(code, valuePath, value);
  }
}
