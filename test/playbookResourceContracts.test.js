import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  LIFECYCLE_STATUSES,
  RESOURCE_SCHEMA_VERSION,
  validateResourceCatalog,
  validateResourcePromotionDecision,
  validateResourceProbeReport,
  validateResourceSourceProfile
} from '../src/playbook/resources/contracts/index.js';
import * as resourceContracts from '../src/playbook/resources/contracts/index.js';
import {
  resourceCatalogFixture,
  resourcePromotionDecisionFixture,
  resourceProbeReportFixture,
  resourceSourceProfileFixture
} from './helpers/playbookResourceFixtures.js';

test('validates and freezes the minimal resource catalog', () => {
  const input = resourceCatalogFixture();
  const catalog = validateResourceCatalog(input);

  assert.equal(catalog.catalog_id, 'architecture-playbook-resource-catalog');
  assert.notEqual(catalog, input);
  assert.ok(Object.isFrozen(catalog));
  assert.ok(Object.isFrozen(catalog.sources));
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
  assert.ok(Object.isFrozen(profile));
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

test('source profile schema HTTPS URLs mirror runtime scheme and credential rules', async () => {
  const schema = JSON.parse(await readFile(
    new URL('../docs/architecture-playbook/resources/schemas/source-profile.schema.json', import.meta.url),
    'utf8'
  ));
  const httpsPattern = new RegExp(schema.$defs.httpsUrl.pattern, 'u');

  assert.equal(httpsPattern.test('HTTPS://example.com/source'), true);
  assert.equal(httpsPattern.test('https://user:pass@example.com/source'), false);
});

test('validates and freezes a resource probe report', () => {
  const input = resourceProbeReportFixture();
  const probe = validateResourceProbeReport(input);

  assert.equal(probe.probe_id, 'example-probe');
  assert.notEqual(probe, input);
  assert.ok(Object.isFrozen(probe));
  assert.ok(Object.isFrozen(probe.knowledge_value));
  assert.ok(Object.isFrozen(probe.creator_observation));
  assert.equal(probe.knowledge_value.survival_constraints.value, 'unknown');
});

test('unknown creator cannot carry an invented display name', () => {
  const probe = resourceProbeReportFixture();
  probe.creator_observation = {
    status: 'unknown',
    display_name: '猜测作者',
    profile_url: null,
    bases: ['project-inference']
  };
  assert.throws(
    () => validateResourceProbeReport(probe),
    /PLAYBOOK_RESOURCE_CREATOR_NAME_FORBIDDEN/u
  );
});

test('search-index evidence cannot be presented as direct-page evidence', () => {
  const probe = resourceProbeReportFixture();
  probe.observation_bases = ['search-index'];
  probe.creator_observation.bases = ['direct-page'];
  assert.throws(
    () => validateResourceProbeReport(probe),
    /PLAYBOOK_RESOURCE_CREATOR_BASIS_UNBOUND/u
  );
});

test('unknown fingerprint remains distinct from a real SHA-256', () => {
  const probe = resourceProbeReportFixture();
  probe.content_fingerprint = {
    status: 'unknown', sha256: '0'.repeat(64), basis: 'unverified'
  };
  assert.throws(
    () => validateResourceProbeReport(probe),
    /PLAYBOOK_RESOURCE_FINGERPRINT_UNKNOWN_INVALID/u
  );
});

test('probe report rejects synthetic revisions and copied-content fields', () => {
  const syntheticRevision = resourceProbeReportFixture();
  syntheticRevision.content_revision = {
    status: 'known', value: 'derived-from-title', basis: 'project-inference'
  };
  assert.throws(
    () => validateResourceProbeReport(syntheticRevision),
    /PLAYBOOK_RESOURCE_REVISION_SYNTHETIC_FORBIDDEN/u
  );

  const copiedContent = resourceProbeReportFixture();
  copiedContent.raw_html = '<article>Copied page body</article>';
  assert.throws(
    () => validateResourceProbeReport(copiedContent),
    /PLAYBOOK_RESOURCE_FIELD_UNKNOWN/u
  );
});

test('probe report keeps access and rights observation shapes strict', () => {
  const wrongHttpStatus = resourceProbeReportFixture();
  wrongHttpStatus.access_result.http_status = 99;
  assert.throws(
    () => validateResourceProbeReport(wrongHttpStatus),
    /PLAYBOOK_RESOURCE_HTTP_STATUS_INVALID/u
  );

  const inventedRightsEvidence = resourceProbeReportFixture();
  inventedRightsEvidence.rights_observations.model_training.evidence_url =
    'https://example.com/rights';
  assert.throws(
    () => validateResourceProbeReport(inventedRightsEvidence),
    /PLAYBOOK_RESOURCE_EVIDENCE_URL_INVALID/u
  );
});

test('probe report schema matches the strict runtime contract', async () => {
  const schema = JSON.parse(await readFile(
    new URL('../docs/architecture-playbook/resources/schemas/probe-report.schema.json', import.meta.url),
    'utf8'
  ));

  assert.equal(
    schema.$id,
    'https://minecraft-constructing-agents.local/schemas/probe-report-v1.json'
  );
  assert.deepEqual(schema.required, resourceContracts.PROBE_REPORT_FIELDS);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.accessResult.additionalProperties, false);
  assert.equal(schema.$defs.creatorObservation.additionalProperties, false);
  assert.equal(schema.$defs.rightsObservations.additionalProperties, false);
  assert.equal(schema.$defs.rating.additionalProperties, false);
  assert.deepEqual(schema.$defs.probeStringArray.items, {
    type: 'string', minLength: 1, maxLength: 512
  });
});

test('probe report schema preserves known and unknown observation boundaries', async () => {
  const schema = JSON.parse(await readFile(
    new URL('../docs/architecture-playbook/resources/schemas/probe-report.schema.json', import.meta.url),
    'utf8'
  ));
  const httpsPattern = new RegExp(schema.$defs.httpsUrl.pattern, 'u');

  assert.equal(httpsPattern.test('HTTPS://example.com/probe'), true);
  assert.equal(httpsPattern.test('https://user:pass@example.com/probe'), false);
  assert.deepEqual(schema.$defs.contentRevision.allOf[1].then.properties.value, { const: null });
  assert.deepEqual(schema.$defs.contentFingerprint.allOf[1].then.properties.sha256, { const: null });
  assert.deepEqual(
    schema.$defs.creatorObservation.allOf[1].then.properties.display_name,
    { const: null }
  );
});

test('promotion decision is reserved for the project owner', () => {
  const decision = resourcePromotionDecisionFixture();
  decision.decided_by = 'ai-agent';
  assert.throws(
    () => validateResourcePromotionDecision(decision),
    /PLAYBOOK_RESOURCE_DECIDER_INVALID/u
  );
});

test('promotion decision binds the exact source assessment path', () => {
  const decision = resourcePromotionDecisionFixture();
  decision.assessment_path = 'sources/other/assessment.md';
  assert.throws(
    () => validateResourcePromotionDecision(decision),
    /PLAYBOOK_RESOURCE_DECISION_SOURCE_MISMATCH/u
  );
});

test('validates and freezes a resource promotion decision', () => {
  const input = resourcePromotionDecisionFixture({
    conditions: ['Confirm current retrieval terms before intake.']
  });
  const decision = validateResourcePromotionDecision(input);

  assert.equal(decision.decision_id, '2026-08-25-deferred');
  assert.notEqual(decision, input);
  assert.ok(Object.isFrozen(decision));
  assert.ok(Object.isFrozen(decision.probe_ids));
  assert.ok(Object.isFrozen(decision.conditions));
});

test('promotion decision keeps probe identities unique and conditions in their original order', () => {
  const duplicateProbe = resourcePromotionDecisionFixture({
    probe_ids: ['probe-one', 'probe-one', 'probe-three']
  });
  assert.throws(
    () => validateResourcePromotionDecision(duplicateProbe),
    /PLAYBOOK_RESOURCE_ARRAY_DUPLICATE/u
  );

  const input = resourcePromotionDecisionFixture({
    conditions: ['Preserve this wording.', 'Then preserve this wording too.', 'Preserve this wording.']
  });
  const decision = validateResourcePromotionDecision(input);
  assert.deepEqual(decision.conditions, [
    'Preserve this wording.', 'Then preserve this wording too.', 'Preserve this wording.'
  ]);
});

test('all resource contract schemas parse as JSON', async () => {
  const schemaPaths = [
    'catalog.schema.json',
    'source-profile.schema.json',
    'probe-report.schema.json',
    'promotion-decision.schema.json'
  ];
  const schemas = await Promise.all(schemaPaths.map(async (schemaPath) => JSON.parse(await readFile(
    new URL(`../docs/architecture-playbook/resources/schemas/${schemaPath}`, import.meta.url),
    'utf8'
  ))));

  assert.equal(schemas.length, 4);
});

test('promotion decision schema matches the strict runtime contract', async () => {
  const schema = JSON.parse(await readFile(
    new URL('../docs/architecture-playbook/resources/schemas/promotion-decision.schema.json', import.meta.url),
    'utf8'
  ));

  assert.equal(
    schema.$id,
    'https://minecraft-constructing-agents.local/schemas/promotion-decision-v1.json'
  );
  assert.deepEqual(schema.required, resourceContracts.PROMOTION_DECISION_FIELDS);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema_version.const, RESOURCE_SCHEMA_VERSION);
  assert.deepEqual(schema.properties.decision.enum, resourceContracts.DECISIONS);
  assert.equal(schema.properties.decided_by.const, 'project-owner');
  assert.deepEqual(schema.properties.probe_ids, {
    type: 'array', minItems: 3, maxItems: 5, uniqueItems: true,
    items: { $ref: '#/$defs/kebabId' }
  });
  assert.deepEqual(schema.properties.conditions, {
    type: 'array', minItems: 0, maxItems: 32,
    items: { $ref: '#/$defs/shortOriginalString' }
  });
  assert.equal(schema.properties.assessment_path.pattern,
    '^sources/[a-z0-9]+(?:-[a-z0-9]+)*/assessment\\.md$');
  assert.equal(schema.properties.assessment_sha256.pattern, '^[a-f0-9]{64}$');
  assert.equal(schema.$defs.shortOriginalString.maxLength, 256);
});
