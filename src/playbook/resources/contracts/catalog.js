import { failPlaybookContract } from '../../contracts/playbookContractError.js';
import { RESOURCE_SCHEMA_VERSION, LIFECYCLE_STATUSES } from './vocabularies.js';
import {
  assertExactObject,
  assertLowercaseKebabId,
  assertRelativeResourcePath,
  assertString,
  assertTimestamp,
  cloneResourceDocument,
  deepFreeze
} from './validation.js';

export const RESOURCE_CATALOG_FIELDS = Object.freeze([
  'schema_version', 'catalog_id', 'updated_at', 'sources'
]);
export const RESOURCE_CATALOG_SOURCE_FIELDS = Object.freeze([
  'source_id', 'title', 'lifecycle_status', 'profile_path', 'assessment_path'
]);
export const RESOURCE_CATALOG_RUNTIME_INVARIANTS = Object.freeze([
  Object.freeze({
    id: 'source-id-unique',
    enforcement: 'runtime',
    keyword: 'unique-by',
    array_path: '/sources',
    property: 'source_id'
  }),
  Object.freeze({
    id: 'profile-path-unique',
    enforcement: 'runtime',
    keyword: 'unique-by',
    array_path: '/sources',
    property: 'profile_path'
  }),
  Object.freeze({
    id: 'profile-path-source-binding',
    enforcement: 'runtime',
    keyword: 'template-equals',
    instance_path: '/sources/*/profile_path',
    template: 'sources/{source_id}/source.json'
  }),
  Object.freeze({
    id: 'assessment-path-source-binding',
    enforcement: 'runtime',
    keyword: 'template-equals',
    instance_path: '/sources/*/assessment_path',
    lifecycle_statuses: Object.freeze([
      'assessed', 'approved-for-intake', 'deferred', 'rejected'
    ]),
    template: 'sources/{source_id}/assessment.md'
  }),
  Object.freeze({
    id: 'source-id-lexical-order',
    enforcement: 'runtime',
    keyword: 'strictly-increasing-by',
    array_path: '/sources',
    property: 'source_id'
  })
]);

const PROFILE_PATH_SOURCE_BINDING = RESOURCE_CATALOG_RUNTIME_INVARIANTS[2];
const ASSESSMENT_PATH_SOURCE_BINDING = RESOURCE_CATALOG_RUNTIME_INVARIANTS[3];

export function validateResourceCatalog(value) {
  const catalog = cloneResourceDocument(value, 'ResourceCatalog');
  assertExactObject(catalog, 'ResourceCatalog', RESOURCE_CATALOG_FIELDS);
  if (catalog.schema_version !== RESOURCE_SCHEMA_VERSION) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_VERSION_INVALID',
      'ResourceCatalog.schema_version',
      catalog.schema_version
    );
  }
  if (catalog.catalog_id !== 'architecture-playbook-resource-catalog') {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_ID_INVALID',
      'ResourceCatalog.catalog_id',
      catalog.catalog_id
    );
  }
  assertTimestamp(catalog.updated_at, 'ResourceCatalog.updated_at');
  validateSources(catalog.sources);
  return deepFreeze(catalog);
}

function validateSources(sources) {
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 1024) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_ARRAY_INVALID',
      'ResourceCatalog.sources',
      'expected 1..1024 sources'
    );
  }
  const sourceIds = new Set();
  const profilePaths = new Set();
  let priorSourceId = null;
  for (const [index, source] of sources.entries()) {
    const sourcePath = `ResourceCatalog.sources[${index}]`;
    assertExactObject(source, sourcePath, RESOURCE_CATALOG_SOURCE_FIELDS);
    assertLowercaseKebabId(source.source_id, `${sourcePath}.source_id`);
    assertString(source.title, `${sourcePath}.title`, { maximum: 512 });
    if (!LIFECYCLE_STATUSES.includes(source.lifecycle_status)) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_LIFECYCLE_INVALID',
        `${sourcePath}.lifecycle_status`,
        source.lifecycle_status
      );
    }
    assertRelativeResourcePath(source.profile_path, `${sourcePath}.profile_path`);
    if (
      source.profile_path
      !== bindSourcePath(PROFILE_PATH_SOURCE_BINDING, source.source_id)
    ) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_PATH_INVALID',
        `${sourcePath}.profile_path`,
        source.profile_path
      );
    }
    validateAssessmentPath(source, sourcePath);
    if (sourceIds.has(source.source_id)) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_ID_INVALID', `${sourcePath}.source_id`, 'duplicate source ID'
      );
    }
    if (profilePaths.has(source.profile_path)) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_PATH_INVALID', `${sourcePath}.profile_path`, 'duplicate profile path'
      );
    }
    if (priorSourceId !== null && priorSourceId >= source.source_id) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_CATALOG_ORDER_INVALID',
        `${sourcePath}.source_id`,
        `${source.source_id} must follow ${priorSourceId}`
      );
    }
    sourceIds.add(source.source_id);
    profilePaths.add(source.profile_path);
    priorSourceId = source.source_id;
  }
}

function validateAssessmentPath(source, sourcePath) {
  const requiresAssessment = ASSESSMENT_PATH_SOURCE_BINDING.lifecycle_statuses
    .includes(source.lifecycle_status);
  if (!requiresAssessment) {
    if (source.assessment_path !== null) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_PATH_INVALID',
        `${sourcePath}.assessment_path`,
        'assessment path must be null before assessment'
      );
    }
    return;
  }
  assertRelativeResourcePath(source.assessment_path, `${sourcePath}.assessment_path`);
  if (
    source.assessment_path
    !== bindSourcePath(ASSESSMENT_PATH_SOURCE_BINDING, source.source_id)
  ) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_PATH_INVALID',
      `${sourcePath}.assessment_path`,
      source.assessment_path
    );
  }
}

function bindSourcePath(invariant, sourceId) {
  return invariant.template.replace('{source_id}', sourceId);
}
