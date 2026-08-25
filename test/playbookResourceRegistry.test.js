import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import {
  auditResourceRegistry,
  loadResourceRegistry
} from '../src/playbook/resources/resourceRegistry.js';
import {
  escapedResourceRegistryFixture,
  replaceAssessmentText,
  resourcePromotionDecisionFixture,
  resourceRegistryProjectFixture,
  writeMalformedProtectedSentinels
} from './helpers/playbookResourceFixtures.js';
import * as resourceRegistryExports from '../src/playbook/resources/index.js';

test('loads a valid isolated resource registry without reading course or rules', async (t) => {
  const projectRoot = await resourceRegistryProjectFixture(t, {
    sources: ['fixture-source'], probeCount: 3
  });
  await writeMalformedProtectedSentinels(projectRoot);

  const registry = await loadResourceRegistry({ projectRoot });
  assert.equal(registry.sources.length, 1);
  assert.equal(registry.sources[0].probes.length, 3);
});

test('rejects assessment hash drift', async (t) => {
  const projectRoot = await resourceRegistryProjectFixture(t);
  await replaceAssessmentText(projectRoot, '# changed\n');
  await assert.rejects(
    loadResourceRegistry({ projectRoot }),
    /PLAYBOOK_RESOURCE_ASSESSMENT_HASH_MISMATCH/u
  );
});

test('rejects cross-source probes and symlink escapes', async (t) => {
  const projectRoot = await escapedResourceRegistryFixture(t);
  await assert.rejects(
    loadResourceRegistry({ projectRoot }),
    /PLAYBOOK_RESOURCE_PATH_ESCAPE|PLAYBOOK_RESOURCE_PROBE_SOURCE_MISMATCH/u
  );
});

test('generic audit accepts three probes but initial-count policy can require five', async (t) => {
  const projectRoot = await resourceRegistryProjectFixture(t, { probeCount: 3 });
  const generic = await auditResourceRegistry({ projectRoot });
  assert.equal(generic.gate.status, 'passed');
  await assert.rejects(
    auditResourceRegistry({
      projectRoot,
      expectedProbeCounts: { 'fixture-source': 5 }
    }),
    /PLAYBOOK_RESOURCE_PROBE_COUNT_MISMATCH/u
  );
});

test('resource registry public module exports only the loader and auditor', () => {
  assert.deepEqual(Object.keys(resourceRegistryExports).sort(), [
    'auditResourceRegistry', 'loadResourceRegistry'
  ]);
});

test('audit reports exact zero-blocker counts for a valid registry', async (t) => {
  const projectRoot = await resourceRegistryProjectFixture(t, { probeCount: 3 });

  assert.deepEqual(await auditResourceRegistry({ projectRoot }), {
    schema_version: 1,
    source_count: 1,
    probe_count: 3,
    decision_count: 0,
    cross_source_reference_count: 0,
    private_path_leak_count: 0,
    unexpected_file_count: 0,
    gate: { status: 'passed', blocker_codes: [] }
  });
});

test('rejects an unexpected public HTML snapshot', async (t) => {
  const projectRoot = await resourceRegistryProjectFixture(t);
  await writeFile(join(resourceRoot(projectRoot), 'snapshot.html'), '<html></html>', 'utf8');

  await assert.rejects(
    loadResourceRegistry({ projectRoot }),
    /PLAYBOOK_RESOURCE_UNEXPECTED_FILE/u
  );
});

test('rejects an absolute Unix home path persisted in JSON', async (t) => {
  const projectRoot = await resourceRegistryProjectFixture(t);
  await mutateJson(sourceProfilePath(projectRoot), (profile) => {
    profile.access_notes.push('/home/guoba/private/snapshot.html');
  });

  await assert.rejects(
    loadResourceRegistry({ projectRoot }),
    {
      name: 'PlaybookContractError',
      code: 'PLAYBOOK_RESOURCE_PRIVATE_PATH_LEAK'
    }
  );
});

test('rejects a concrete private artifact path persisted in an assessment', async (t) => {
  const projectRoot = await resourceRegistryProjectFixture(t);
  await replaceAssessmentAndHash(
    projectRoot,
    '# Assessment\n\nSee `.local/architecture-playbook/sources/private/snapshot.html`.\n'
  );

  await assert.rejects(
    loadResourceRegistry({ projectRoot }),
    /PLAYBOOK_RESOURCE_PRIVATE_PATH_LEAK/u
  );
});

test('rejects normalized source URLs duplicated across profiles', async (t) => {
  const projectRoot = await resourceRegistryProjectFixture(t, {
    sources: ['fixture-source', 'second-source']
  });
  await mutateJson(sourceProfilePath(projectRoot, 'second-source'), (profile) => {
    profile.canonical_url = 'https://fixture-source.example.com/resources#duplicate';
  });

  await assert.rejects(
    loadResourceRegistry({ projectRoot }),
    /PLAYBOOK_RESOURCE_URL_DUPLICATE/u
  );
});

test('rejects a probe hosted outside its source profile hosts', async (t) => {
  const projectRoot = await resourceRegistryProjectFixture(t);
  await mutateJson(probePath(projectRoot, 'fixture-source-probe-1'), (probe) => {
    probe.canonical_url = 'https://outside.example.net/probe-1';
  });

  await assert.rejects(
    loadResourceRegistry({ projectRoot }),
    /PLAYBOOK_RESOURCE_PROBE_HOST_MISMATCH/u
  );
});

test('rejects a discovered decision omitted from profile history', async (t) => {
  const projectRoot = await resourceRegistryProjectFixture(t);
  await writeDecision(projectRoot, resourcePromotionDecisionFixture({
    source_id: 'fixture-source',
    assessment_path: 'sources/fixture-source/assessment.md',
    assessment_sha256: await assessmentHash(projectRoot),
    probe_ids: fixtureProbeIds()
  }));

  await assert.rejects(
    loadResourceRegistry({ projectRoot }),
    /PLAYBOOK_RESOURCE_DECISION_HISTORY_MISMATCH/u
  );
});

test('rejects a decision bound to a stale assessment hash', async (t) => {
  const projectRoot = await resourceRegistryProjectFixture(t);
  await configureDecisionLifecycle(projectRoot, 'deferred', {
    assessment_sha256: 'a'.repeat(64)
  });

  await assert.rejects(
    loadResourceRegistry({ projectRoot }),
    /PLAYBOOK_RESOURCE_DECISION_ASSESSMENT_HASH_MISMATCH/u
  );
});

test('rejects a final decision that disagrees with profile lifecycle', async (t) => {
  const projectRoot = await resourceRegistryProjectFixture(t);
  await configureDecisionLifecycle(projectRoot, 'rejected');

  await assert.rejects(
    loadResourceRegistry({ projectRoot }),
    /PLAYBOOK_RESOURCE_DECISION_LIFECYCLE_MISMATCH/u
  );
});

test('loads append-only decision history in decided-at order rather than filename order', async (t) => {
  const projectRoot = await resourceRegistryProjectFixture(t);
  await configureTwoDecisionHistory(projectRoot, {
    deferredAt: '2026-08-25T00:00:00.000Z',
    approvedAt: '2026-08-25T01:00:00.000Z'
  });

  const registry = await loadResourceRegistry({ projectRoot });
  assert.deepEqual(
    registry.sources[0].decisions.map((decision) => decision.decision),
    ['deferred', 'approved-for-intake']
  );
});

test('rejects decision history whose decided-at timestamps are out of order', async (t) => {
  const projectRoot = await resourceRegistryProjectFixture(t);
  await configureTwoDecisionHistory(projectRoot, {
    deferredAt: '2026-08-25T02:00:00.000Z',
    approvedAt: '2026-08-25T01:00:00.000Z'
  });

  await assert.rejects(
    loadResourceRegistry({ projectRoot }),
    /PLAYBOOK_RESOURCE_DECISION_ORDER_INVALID/u
  );
});

function resourceRoot(projectRoot) {
  return join(projectRoot, 'docs', 'architecture-playbook', 'resources');
}

function sourceProfilePath(projectRoot, sourceId = 'fixture-source') {
  return join(resourceRoot(projectRoot), 'sources', sourceId, 'source.json');
}

function probePath(projectRoot, probeId) {
  return join(
    resourceRoot(projectRoot), 'sources', 'fixture-source', 'probes', `${probeId}.json`
  );
}

function fixtureProbeIds() {
  return [
    'fixture-source-probe-1',
    'fixture-source-probe-2',
    'fixture-source-probe-3'
  ];
}

async function mutateJson(path, mutate) {
  const value = JSON.parse(await readFile(path, 'utf8'));
  mutate(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function assessmentHash(projectRoot) {
  const bytes = await readFile(
    join(resourceRoot(projectRoot), 'sources', 'fixture-source', 'assessment.md')
  );
  return createHash('sha256').update(bytes).digest('hex');
}

async function replaceAssessmentAndHash(projectRoot, text) {
  await replaceAssessmentText(projectRoot, text);
  await mutateJson(sourceProfilePath(projectRoot), (profile) => {
    profile.assessment.sha256 = createHash('sha256').update(text).digest('hex');
  });
}

async function writeDecision(projectRoot, decision) {
  const decisionsRoot = join(
    resourceRoot(projectRoot), 'sources', 'fixture-source', 'decisions'
  );
  await mkdir(decisionsRoot, { recursive: true });
  await writeFile(
    join(decisionsRoot, `${decision.decision_id}.json`),
    `${JSON.stringify(decision, null, 2)}\n`,
    'utf8'
  );
}

async function configureDecisionLifecycle(projectRoot, profileLifecycle, overrides = {}) {
  const decisionPath = 'sources/fixture-source/decisions/2026-08-25-deferred.json';
  await mutateJson(sourceProfilePath(projectRoot), (profile) => {
    profile.lifecycle_status = profileLifecycle;
    profile.decision_history = [decisionPath];
  });
  await mutateJson(join(resourceRoot(projectRoot), 'catalog.json'), (catalog) => {
    catalog.sources[0].lifecycle_status = profileLifecycle;
  });
  await writeDecision(projectRoot, resourcePromotionDecisionFixture({
    source_id: 'fixture-source',
    assessment_path: 'sources/fixture-source/assessment.md',
    assessment_sha256: await assessmentHash(projectRoot),
    probe_ids: fixtureProbeIds(),
    ...overrides
  }));
}

async function configureTwoDecisionHistory(projectRoot, { deferredAt, approvedAt }) {
  const deferredPath = 'sources/fixture-source/decisions/2026-08-25-deferred.json';
  const approvedPath =
    'sources/fixture-source/decisions/2026-08-25-approved-for-intake.json';
  await mutateJson(sourceProfilePath(projectRoot), (profile) => {
    profile.lifecycle_status = 'approved-for-intake';
    profile.decision_history = [deferredPath, approvedPath];
  });
  await mutateJson(join(resourceRoot(projectRoot), 'catalog.json'), (catalog) => {
    catalog.sources[0].lifecycle_status = 'approved-for-intake';
  });
  const shared = {
    source_id: 'fixture-source',
    assessment_path: 'sources/fixture-source/assessment.md',
    assessment_sha256: await assessmentHash(projectRoot),
    probe_ids: fixtureProbeIds()
  };
  await writeDecision(projectRoot, resourcePromotionDecisionFixture({
    ...shared,
    decision_id: '2026-08-25-deferred',
    decision: 'deferred',
    decided_at: deferredAt
  }));
  await writeDecision(projectRoot, resourcePromotionDecisionFixture({
    ...shared,
    decision_id: '2026-08-25-approved-for-intake',
    decision: 'approved-for-intake',
    decided_at: approvedAt
  }));
}
