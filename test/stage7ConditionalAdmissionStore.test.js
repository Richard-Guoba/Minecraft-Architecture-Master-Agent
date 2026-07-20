import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  TAXONOMY_LEDGER_RELATIVE,
  appendTaxonomyAssessment,
  readTaxonomyAssessmentLedger
} from '../src/construction/learning/stage7ConditionalAdmissionStore.js';
import { taxonomyAssessmentFixture } from './fixtures/stage7ConditionalAdmissionFixtures.js';

async function rootFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'stage7-conditional-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'reviews'));
  return root;
}

test('append creates canonical ledger and requires the next candidate revision', async (t) => {
  const root = await rootFixture(t);
  await appendTaxonomyAssessment(root, taxonomyAssessmentFixture({ revision: 1 }));
  await appendTaxonomyAssessment(root, taxonomyAssessmentFixture({
    revision: 2,
    assessment_decision: 'defer',
    completeness: 'module',
    reason_codes: ['INCOMPLETE_MODULE']
  }));
  const records = await readTaxonomyAssessmentLedger(root);
  assert.deepEqual(records.map((record) => record.revision), [1, 2]);
  const text = await readFile(join(root, TAXONOMY_LEDGER_RELATIVE), 'utf8');
  assert.equal(text.endsWith('\n'), true);
  assert.equal(text.split('\n').filter(Boolean).length, 2);
  await assert.rejects(
    appendTaxonomyAssessment(root, taxonomyAssessmentFixture({ revision: 4 })),
    (error) => error.code === 'ASSESSMENT_REVISION_NOT_NEXT'
  );
});

test('append rejects noncanonical existing content and symlink ledgers', async (t) => {
  const root = await rootFixture(t);
  const ledger = join(root, TAXONOMY_LEDGER_RELATIVE);
  await writeFile(ledger, `${JSON.stringify(taxonomyAssessmentFixture())}\n`, 'utf8');
  await assert.rejects(readTaxonomyAssessmentLedger(root),
    (error) => error.code === 'ASSESSMENT_LEDGER_NONCANONICAL');
  await rm(ledger);
  const outside = join(root, 'outside.jsonl');
  await writeFile(outside, '', 'utf8');
  await symlink(outside, ledger);
  await assert.rejects(readTaxonomyAssessmentLedger(root),
    (error) => error.code === 'ASSESSMENT_LEDGER_SYMLINK');
});

test('injected rename failure preserves the original ledger and removes temp output', async (t) => {
  const root = await rootFixture(t);
  await appendTaxonomyAssessment(root, taxonomyAssessmentFixture());
  const ledger = join(root, TAXONOMY_LEDGER_RELATIVE);
  const before = await readFile(ledger);
  await assert.rejects(
    appendTaxonomyAssessment(root, taxonomyAssessmentFixture({ revision: 2 }), {
      rename: async () => { throw new Error('injected rename failure'); }
    }),
    /injected rename failure/u
  );
  assert.deepEqual(await readFile(ledger), before);
  assert.deepEqual((await readdir(join(root, 'reviews'))).sort(), [
    'conditional-taxonomy.jsonl'
  ]);
});
