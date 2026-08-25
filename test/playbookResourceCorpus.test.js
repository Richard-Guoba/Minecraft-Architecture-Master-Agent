import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  auditResourceRegistry,
  loadResourceRegistry
} from '../src/playbook/resources/index.js';

const projectRoot = path.resolve(import.meta.dirname, '..');

test('committed first-version registry passes the isolated ten-probe gate', async () => {
  const audit = await auditResourceRegistry({
    projectRoot,
    expectedProbeCounts: {
      mcblock: 5,
      'zh-minecraft-wiki': 5
    }
  });

  assert.equal(audit.source_count, 2);
  assert.equal(audit.probe_count, 10);
  assert.equal(audit.decision_count, 0);
  assert.equal(audit.cross_source_reference_count, 0);
  assert.equal(audit.private_path_leak_count, 0);
  assert.equal(audit.unexpected_file_count, 0);
  assert.equal(audit.gate.status, 'passed');
});

test('first-version sources stop at assessed with no promotion records', async () => {
  const registry = await loadResourceRegistry({ projectRoot });
  assert.deepEqual(
    registry.sources.map(({ profile }) => profile.lifecycle_status),
    ['assessed', 'assessed']
  );
  assert.ok(registry.sources.every(({ assessment }) => assessment !== null));
  assert.ok(registry.sources.every(({ decisions }) => decisions.length === 0));
});

test('first-version registry publishes exactly the four approved schemas', async () => {
  assert.deepEqual(await listCommittedResourceSchemas(projectRoot), [
    'catalog.schema.json',
    'probe-report.schema.json',
    'promotion-decision.schema.json',
    'source-profile.schema.json'
  ]);
  await assert.doesNotReject(
    readFile(path.join(projectRoot, 'docs/architecture-playbook/resources/README.md'), 'utf8')
  );
});

async function listCommittedResourceSchemas(root) {
  const entries = await readdir(
    path.join(root, 'docs/architecture-playbook/resources/schemas'),
    { withFileTypes: true }
  );

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}
