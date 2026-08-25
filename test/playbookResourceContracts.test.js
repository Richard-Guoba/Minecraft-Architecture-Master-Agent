import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  LIFECYCLE_STATUSES,
  RESOURCE_SCHEMA_VERSION,
  validateResourceCatalog,
  validateResourceSourceProfile
} from '../src/playbook/resources/contracts/index.js';
import * as resourceContracts from '../src/playbook/resources/contracts/index.js';
import {
  resourceCatalogFixture,
  resourceSourceProfileFixture
} from './helpers/playbookResourceFixtures.js';

test('validates and freezes the minimal resource catalog', () => {
  const input = resourceCatalogFixture();
  const catalog = validateResourceCatalog(input);

  assert.equal(catalog.catalog_id, 'architecture-playbook-resource-catalog');
  assert.notEqual(catalog, input);
  assert.ok(Object.isFrozen(catalog.sources[0]));
});

test('catalog rejects unknown fields and source path drift', () => {
  const unknown = resourceCatalogFixture();
  unknown.extra = true;
  assert.throws(() => validateResourceCatalog(unknown), /PLAYBOOK_RESOURCE_FIELD_UNKNOWN/u);

  const escaped = resourceCatalogFixture();
  escaped.sources[0].profile_path = '../course/course-manifest.json';
  assert.throws(() => validateResourceCatalog(escaped), /PLAYBOOK_RESOURCE_PATH_INVALID/u);
});

test('catalog rejects unsorted entries, duplicate source identities, and lifecycle path drift', () => {
  const unsorted = resourceCatalogFixture();
  unsorted.sources.unshift({
    source_id: 'z-source',
    title: 'Z source',
    lifecycle_status: 'assessed',
    profile_path: 'sources/z-source/source.json',
    assessment_path: 'sources/z-source/assessment.md'
  });
  assert.throws(
    () => validateResourceCatalog(unsorted),
    /PLAYBOOK_RESOURCE_CATALOG_ORDER_INVALID/u
  );

  const duplicate = resourceCatalogFixture();
  duplicate.sources.push({
    source_id: 'example-source',
    title: 'Second example source',
    lifecycle_status: 'registered',
    profile_path: 'sources/example-source/source.json',
    assessment_path: null
  });
  assert.throws(() => validateResourceCatalog(duplicate), /PLAYBOOK_RESOURCE_ID_INVALID/u);

  const driftedAssessment = resourceCatalogFixture();
  driftedAssessment.sources[0].lifecycle_status = 'assessed';
  driftedAssessment.sources[0].assessment_path = null;
  assert.throws(
    () => validateResourceCatalog(driftedAssessment),
    /PLAYBOOK_RESOURCE_PATH_INVALID/u
  );
});

test('catalog schema matches the runtime top-level contract', async () => {
  const schema = JSON.parse(await readFile(
    new URL('../docs/architecture-playbook/resources/schemas/catalog.schema.json', import.meta.url),
    'utf8'
  ));

  assert.deepEqual(schema.required, [
    'schema_version', 'catalog_id', 'updated_at', 'sources'
  ]);
  assert.equal(schema.properties.schema_version.const, RESOURCE_SCHEMA_VERSION);
  assert.deepEqual(
    schema.properties.sources.items.properties.lifecycle_status.enum,
    [...LIFECYCLE_STATUSES]
  );
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.sources.items.additionalProperties, false);
});

test('catalog schema binds assessment paths to lifecycle and records runtime-only invariants', async () => {
  const schema = JSON.parse(await readFile(
    new URL('../docs/architecture-playbook/resources/schemas/catalog.schema.json', import.meta.url),
    'utf8'
  ));
  const sourceSchema = schema.properties.sources.items;
  const assessmentLifecycleStatuses = [
    'assessed', 'approved-for-intake', 'deferred', 'rejected'
  ];
  const assessmentPathPattern = '^sources/[a-z0-9]+(?:-[a-z0-9]+)*/assessment\\.md$';

  assert.deepEqual(sourceSchema.allOf, [
    {
      if: {
        properties: {
          lifecycle_status: { enum: ['registered', 'probing'] }
        },
        required: ['lifecycle_status']
      },
      then: {
        properties: { assessment_path: { const: null } },
        required: ['assessment_path']
      }
    },
    {
      if: {
        properties: {
          lifecycle_status: { enum: assessmentLifecycleStatuses }
        },
        required: ['lifecycle_status']
      },
      then: {
        properties: {
          assessment_path: {
            type: 'string',
            minLength: 1,
            maxLength: 512,
            pattern: assessmentPathPattern
          }
        },
        required: ['assessment_path']
      }
    }
  ]);
  assert.deepEqual(schema['x-runtime-invariants'], [
    {
      id: 'source-id-unique',
      enforcement: 'runtime',
      keyword: 'unique-by',
      array_path: '/sources',
      property: 'source_id'
    },
    {
      id: 'profile-path-unique',
      enforcement: 'runtime',
      keyword: 'unique-by',
      array_path: '/sources',
      property: 'profile_path'
    },
    {
      id: 'profile-path-source-binding',
      enforcement: 'runtime',
      keyword: 'template-equals',
      instance_path: '/sources/*/profile_path',
      template: 'sources/{source_id}/source.json'
    },
    {
      id: 'assessment-path-source-binding',
      enforcement: 'runtime',
      keyword: 'template-equals',
      instance_path: '/sources/*/assessment_path',
      lifecycle_statuses: assessmentLifecycleStatuses,
      template: 'sources/{source_id}/assessment.md'
    },
    {
      id: 'source-id-lexical-order',
      enforcement: 'runtime',
      keyword: 'strictly-increasing-by',
      array_path: '/sources',
      property: 'source_id'
    }
  ]);
  assert.deepEqual(
    schema['x-runtime-invariants'],
    resourceContracts.RESOURCE_CATALOG_RUNTIME_INVARIANTS
  );
});

test('assessed source requires a bound assessment and no owner decision', () => {
  const profile = validateResourceSourceProfile(resourceSourceProfileFixture());
  assert.equal(profile.lifecycle_status, 'assessed');
  assert.equal(profile.assessment.probe_ids.length, 5);
  assert.deepEqual(profile.decision_history, []);
  assert.ok(Object.isFrozen(profile.assessment.ratings));
});

test('registered source cannot carry an assessment', () => {
  const profile = resourceSourceProfileFixture({ lifecycle_status: 'registered' });
  profile.decision_history = [];
  assert.throws(
    () => validateResourceSourceProfile(profile),
    /PLAYBOOK_RESOURCE_ASSESSMENT_FORBIDDEN/u
  );
});

test('unknown rights cannot be silently rewritten as allowed', () => {
  const profile = resourceSourceProfileFixture();
  profile.model_training.status = true;
  assert.throws(
    () => validateResourceSourceProfile(profile),
    /PLAYBOOK_RESOURCE_RIGHTS_STATUS_INVALID/u
  );
});

test('platform can never be a school in the registry', () => {
  const profile = resourceSourceProfileFixture();
  profile.platform_is_school = true;
  assert.throws(
    () => validateResourceSourceProfile(profile),
    /PLAYBOOK_RESOURCE_PLATFORM_SCHOOL_FORBIDDEN/u
  );
});

test('source profile keeps URL identities and unreviewed evidence honest', () => {
  const duplicateUrl = resourceSourceProfileFixture({
    alternate_urls: ['https://example.com:443/resources']
  });
  assert.throws(
    () => validateResourceSourceProfile(duplicateUrl),
    /PLAYBOOK_RESOURCE_URL_DUPLICATE/u
  );

  const inventedEvidence = resourceSourceProfileFixture();
  inventedEvidence.artifact_access.evidence_url = 'https://example.com/evidence';
  assert.throws(
    () => validateResourceSourceProfile(inventedEvidence),
    /PLAYBOOK_RESOURCE_EVIDENCE_URL_INVALID/u
  );

  const unknownNestedField = resourceSourceProfileFixture();
  unknownNestedField.operator.extra = true;
  assert.throws(
    () => validateResourceSourceProfile(unknownNestedField),
    /PLAYBOOK_RESOURCE_FIELD_UNKNOWN/u
  );

  const unknownTopLevelField = resourceSourceProfileFixture();
  unknownTopLevelField.extra = true;
  assert.throws(
    () => validateResourceSourceProfile(unknownTopLevelField),
    /PLAYBOOK_RESOURCE_FIELD_UNKNOWN/u
  );
});

test('source profile enforces owner-decision lifecycle and assessment risk boundaries', () => {
  const noDecision = resourceSourceProfileFixture({ lifecycle_status: 'deferred' });
  assert.throws(
    () => validateResourceSourceProfile(noDecision),
    /PLAYBOOK_RESOURCE_DECISION_HISTORY_INVALID/u
  );

  const deferred = resourceSourceProfileFixture({
    lifecycle_status: 'deferred',
    decision_history: ['sources/example-source/decisions/2026-08-25-deferred.json']
  });
  assert.equal(validateResourceSourceProfile(deferred).lifecycle_status, 'deferred');

  const expandedAssessmentRisk = resourceSourceProfileFixture();
  expandedAssessmentRisk.assessment.risk_flags.push('unsupported-format');
  assert.throws(
    () => validateResourceSourceProfile(expandedAssessmentRisk),
    /PLAYBOOK_RESOURCE_RISK_FLAG_INVALID/u
  );
});

test('source profile schema matches the strict runtime contract', async () => {
  const schema = JSON.parse(await readFile(
    new URL('../docs/architecture-playbook/resources/schemas/source-profile.schema.json', import.meta.url),
    'utf8'
  ));

  assert.equal(
    schema.$id,
    'https://minecraft-constructing-agents.local/schemas/source-profile-v1.json'
  );
  assert.deepEqual(schema.required, resourceContracts.SOURCE_PROFILE_FIELDS);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.identityObservation.additionalProperties, false);
  assert.equal(schema.$defs.accessObservation.additionalProperties, false);
  assert.equal(schema.$defs.rightsObservation.additionalProperties, false);
  assert.equal(schema.$defs.assessment.additionalProperties, false);
  assert.equal(schema.$defs.rating.additionalProperties, false);
  assert.match(
    schema.$defs.canonicalTimestamp.pattern,
    /\\\.\\d\{3\}Z\$/u
  );
  assert.equal(schema.properties.platform_is_school.const, false);
});
