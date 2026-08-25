import { failPlaybookContract } from '../../contracts/playbookContractError.js';
import {
  ACCESS_OBSERVATION_STATUSES,
  AVAILABILITY_STATUSES,
  CREATOR_MODELS,
  LIFECYCLE_STATUSES,
  OBSERVATION_BASES,
  RECOMMENDATIONS,
  RESOURCE_SCHEMA_VERSION,
  RIGHTS_STATUSES,
  SOURCE_TYPES
} from './vocabularies.js';
import {
  assertExactObject,
  assertHttpsUrl,
  assertLowercaseKebabId,
  assertNullable,
  assertRatings,
  assertRelativeResourcePath,
  assertSha256,
  assertString,
  assertTimestamp,
  assertUniqueArray,
  cloneResourceDocument,
  deepFreeze
} from './validation.js';

export const SOURCE_PROFILE_FIELDS = Object.freeze([
  'schema_version', 'source_id', 'title', 'canonical_url', 'alternate_urls',
  'registered_at', 'last_checked_at', 'source_type', 'operator', 'publisher',
  'creator_model', 'platform_is_school', 'content_hierarchy',
  'content_unit_types', 'representation_modes', 'access_methods',
  'requires_login', 'client_rendered', 'robots_observation', 'api_access',
  'artifact_access', 'availability_status', 'access_notes', 'styles',
  'building_types', 'difficulty_levels', 'scale_range', 'game_editions',
  'game_versions', 'game_modes', 'design_layers', 'knowledge_modes',
  'public_access', 'local_analysis', 'automated_retrieval', 'artifact_download',
  'model_training', 'external_redistribution', 'extractable_fields',
  'suitable_ai_operations', 'prohibited_operations', 'adapter_requirements',
  'risk_flags', 'lifecycle_status', 'assessment', 'decision_history'
]);

const CONTENT_AND_COVERAGE_ARRAY_FIELDS = Object.freeze([
  'content_hierarchy', 'content_unit_types', 'representation_modes',
  'access_methods', 'access_notes', 'styles', 'building_types',
  'difficulty_levels', 'scale_range', 'game_editions', 'game_versions',
  'game_modes', 'design_layers', 'extractable_fields', 'suitable_ai_operations'
]);
const OPTIONAL_STRING_ARRAY_FIELDS = Object.freeze([
  'prohibited_operations', 'adapter_requirements', 'risk_flags'
]);
const ACCESS_OBSERVATION_FIELDS = Object.freeze([
  'status', 'evidence_url', 'checked_at', 'note'
]);
const IDENTITY_OBSERVATION_FIELDS = Object.freeze(['name', 'url', 'basis']);
const ASSESSMENT_FIELDS = Object.freeze([
  'path', 'sha256', 'completed_at', 'probe_ids', 'recommendation', 'ratings', 'risk_flags'
]);
const DECISION_LIFECYCLES = Object.freeze([
  'approved-for-intake', 'deferred', 'rejected'
]);
const KNOWLEDGE_MODES = Object.freeze([
  'design-principles', 'construction-sequence', 'reference-case', 'materials',
  'survival-constraints', 'visual-evaluation'
]);

export function validateResourceSourceProfile(value) {
  const profile = cloneResourceDocument(value, 'ResourceSourceProfile');
  assertExactObject(profile, 'ResourceSourceProfile', SOURCE_PROFILE_FIELDS);
  if (profile.schema_version !== RESOURCE_SCHEMA_VERSION) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_VERSION_INVALID',
      'ResourceSourceProfile.schema_version',
      profile.schema_version
    );
  }
  assertLowercaseKebabId(profile.source_id, 'ResourceSourceProfile.source_id');
  assertString(profile.title, 'ResourceSourceProfile.title', { maximum: 512 });
  validateUrls(profile);
  assertTimestamp(profile.registered_at, 'ResourceSourceProfile.registered_at');
  assertTimestamp(profile.last_checked_at, 'ResourceSourceProfile.last_checked_at');
  assertEnum(profile.source_type, SOURCE_TYPES, 'PLAYBOOK_RESOURCE_SOURCE_TYPE_INVALID',
    'ResourceSourceProfile.source_type');
  validateIdentityObservation(profile.operator, 'ResourceSourceProfile.operator');
  validateIdentityObservation(profile.publisher, 'ResourceSourceProfile.publisher');
  assertEnum(profile.creator_model, CREATOR_MODELS, 'PLAYBOOK_RESOURCE_CREATOR_MODEL_INVALID',
    'ResourceSourceProfile.creator_model');
  if (profile.platform_is_school !== false) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_PLATFORM_SCHOOL_FORBIDDEN',
      'ResourceSourceProfile.platform_is_school',
      profile.platform_is_school
    );
  }
  for (const field of CONTENT_AND_COVERAGE_ARRAY_FIELDS) {
    assertStringArray(profile[field], `ResourceSourceProfile.${field}`, { minimum: 1 });
  }
  assertUniqueArray(profile.knowledge_modes, 'ResourceSourceProfile.knowledge_modes', {
    minimum: 1,
    maximum: 6,
    validate: (mode, path) => assertEnum(
      mode, KNOWLEDGE_MODES, 'PLAYBOOK_RESOURCE_KNOWLEDGE_MODE_INVALID', path
    )
  });
  assertTriState(profile.requires_login, 'ResourceSourceProfile.requires_login');
  assertTriState(profile.client_rendered, 'ResourceSourceProfile.client_rendered');
  validateAccessObservation(profile.robots_observation, 'ResourceSourceProfile.robots_observation');
  validateAccessObservation(profile.api_access, 'ResourceSourceProfile.api_access');
  validateAccessObservation(profile.artifact_access, 'ResourceSourceProfile.artifact_access');
  assertEnum(profile.availability_status, AVAILABILITY_STATUSES,
    'PLAYBOOK_RESOURCE_AVAILABILITY_INVALID', 'ResourceSourceProfile.availability_status');
  for (const field of [
    'public_access', 'local_analysis', 'automated_retrieval', 'artifact_download',
    'model_training', 'external_redistribution'
  ]) {
    validateRightsObservation(profile[field], `ResourceSourceProfile.${field}`);
  }
  for (const field of OPTIONAL_STRING_ARRAY_FIELDS) {
    assertStringArray(profile[field], `ResourceSourceProfile.${field}`);
  }
  assertEnum(profile.lifecycle_status, LIFECYCLE_STATUSES,
    'PLAYBOOK_RESOURCE_LIFECYCLE_INVALID', 'ResourceSourceProfile.lifecycle_status');
  validateLifecycle(profile);
  return deepFreeze(profile);
}

function validateUrls(profile) {
  const canonicalPath = 'ResourceSourceProfile.canonical_url';
  assertHttpsUrl(profile.canonical_url, canonicalPath);
  const urls = new Set([normalizeUrl(profile.canonical_url)]);
  assertUniqueArray(profile.alternate_urls, 'ResourceSourceProfile.alternate_urls', {
    maximum: 64,
    validate: (url, path) => {
      assertHttpsUrl(url, path);
      const normalized = normalizeUrl(url);
      if (urls.has(normalized)) {
        failPlaybookContract('PLAYBOOK_RESOURCE_URL_DUPLICATE', path, url);
      }
      urls.add(normalized);
    }
  });
}

function normalizeUrl(value) {
  return new URL(value).href;
}

function validateIdentityObservation(value, valuePath) {
  assertExactObject(value, valuePath, IDENTITY_OBSERVATION_FIELDS);
  assertString(value.name, `${valuePath}.name`, { maximum: 512 });
  assertNullable(value.url, (url) => assertHttpsUrl(url, `${valuePath}.url`));
  assertEnum(value.basis, OBSERVATION_BASES, 'PLAYBOOK_RESOURCE_OBSERVATION_BASIS_INVALID',
    `${valuePath}.basis`);
}

function validateAccessObservation(value, valuePath) {
  assertExactObject(value, valuePath, ACCESS_OBSERVATION_FIELDS);
  assertEnum(value.status, ACCESS_OBSERVATION_STATUSES,
    'PLAYBOOK_RESOURCE_ACCESS_STATUS_INVALID', `${valuePath}.status`);
  validateObservationEvidence(value, valuePath);
}

function validateRightsObservation(value, valuePath) {
  assertExactObject(value, valuePath, ACCESS_OBSERVATION_FIELDS);
  assertEnum(value.status, RIGHTS_STATUSES,
    'PLAYBOOK_RESOURCE_RIGHTS_STATUS_INVALID', `${valuePath}.status`);
  validateObservationEvidence(value, valuePath);
}

function validateObservationEvidence(value, valuePath) {
  assertNullable(value.evidence_url, (url) => assertHttpsUrl(url, `${valuePath}.evidence_url`));
  if (
    (value.status === 'unknown' || value.status === 'not-reviewed')
    && value.evidence_url !== null
  ) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_EVIDENCE_URL_INVALID',
      `${valuePath}.evidence_url`,
      'unknown or not-reviewed observations require null evidence_url'
    );
  }
  assertTimestamp(value.checked_at, `${valuePath}.checked_at`);
  assertString(value.note, `${valuePath}.note`, { maximum: 1024 });
}

function assertTriState(value, valuePath) {
  if (value !== true && value !== false && value !== 'unknown') {
    failPlaybookContract('PLAYBOOK_RESOURCE_TRI_STATE_INVALID', valuePath, value);
  }
}

function assertStringArray(value, valuePath, { minimum = 0, maximum = 64 } = {}) {
  assertUniqueArray(value, valuePath, {
    minimum,
    maximum,
    validate: (item, path) => assertString(item, path, { maximum: 256 })
  });
}

function validateLifecycle(profile) {
  const lifecyclePath = 'ResourceSourceProfile.lifecycle_status';
  if (profile.lifecycle_status === 'registered' || profile.lifecycle_status === 'probing') {
    if (profile.assessment !== null) {
      failPlaybookContract('PLAYBOOK_RESOURCE_ASSESSMENT_FORBIDDEN', lifecyclePath,
        'assessment must be null before assessment');
    }
    assertUniqueArray(profile.decision_history, 'ResourceSourceProfile.decision_history', {
      maximum: 64,
      validate: (path, valuePath) => validateDecisionPath(path, valuePath, profile.source_id)
    });
    if (profile.decision_history.length !== 0) {
      failPlaybookContract('PLAYBOOK_RESOURCE_DECISION_HISTORY_INVALID',
        'ResourceSourceProfile.decision_history', 'must be empty before assessment');
    }
    return;
  }
  if (profile.assessment === null) {
    failPlaybookContract('PLAYBOOK_RESOURCE_ASSESSMENT_REQUIRED', lifecyclePath,
      'assessment is required after probing');
  }
  validateAssessment(profile.assessment, profile.source_id);
  assertUniqueArray(profile.decision_history, 'ResourceSourceProfile.decision_history', {
    maximum: 64,
    validate: (path, valuePath) => validateDecisionPath(path, valuePath, profile.source_id)
  });
  if (profile.lifecycle_status === 'assessed' && profile.decision_history.length !== 0) {
    failPlaybookContract('PLAYBOOK_RESOURCE_DECISION_HISTORY_INVALID',
      'ResourceSourceProfile.decision_history', 'must be empty while assessed');
  }
  if (DECISION_LIFECYCLES.includes(profile.lifecycle_status) && profile.decision_history.length === 0) {
    failPlaybookContract('PLAYBOOK_RESOURCE_DECISION_HISTORY_INVALID',
      'ResourceSourceProfile.decision_history', 'must be nonempty after an owner decision');
  }
  for (const flag of profile.assessment.risk_flags) {
    if (!profile.risk_flags.includes(flag)) {
      failPlaybookContract('PLAYBOOK_RESOURCE_RISK_FLAG_INVALID',
        'ResourceSourceProfile.assessment.risk_flags', 'must be a subset of profile risk_flags');
    }
  }
}

function validateAssessment(value, sourceId) {
  const valuePath = 'ResourceSourceProfile.assessment';
  assertExactObject(value, valuePath, ASSESSMENT_FIELDS);
  assertRelativeResourcePath(value.path, `${valuePath}.path`);
  if (value.path !== `sources/${sourceId}/assessment.md`) {
    failPlaybookContract('PLAYBOOK_RESOURCE_PATH_INVALID', `${valuePath}.path`, value.path);
  }
  assertSha256(value.sha256, `${valuePath}.sha256`);
  assertTimestamp(value.completed_at, `${valuePath}.completed_at`);
  assertUniqueArray(value.probe_ids, `${valuePath}.probe_ids`, {
    minimum: 3,
    maximum: 5,
    validate: assertLowercaseKebabId
  });
  assertEnum(value.recommendation, RECOMMENDATIONS,
    'PLAYBOOK_RESOURCE_RECOMMENDATION_INVALID', `${valuePath}.recommendation`);
  assertRatings(value.ratings, `${valuePath}.ratings`);
  assertStringArray(value.risk_flags, `${valuePath}.risk_flags`);
}

function validateDecisionPath(value, valuePath, sourceId) {
  assertRelativeResourcePath(value, valuePath);
  const pattern = new RegExp(
    `^sources/${sourceId}/decisions/\\d{4}-\\d{2}-\\d{2}-(?:${DECISION_LIFECYCLES.join('|')})\\.json$`,
    'u'
  );
  if (!pattern.test(value)) {
    failPlaybookContract('PLAYBOOK_RESOURCE_PATH_INVALID', valuePath, value);
  }
}

function assertEnum(value, values, code, valuePath) {
  if (!values.includes(value)) {
    failPlaybookContract(code, valuePath, value);
  }
}
