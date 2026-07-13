import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { tmpdir } from 'node:os';
import {
  auditStage7RealCaseReadiness,
  canonicalizeStage7RealCaseReadinessAudit,
  renderStage7RealCaseReadinessMarkdown
} from '../src/construction/learning/stage7RealCaseReadinessAudit.js';

test('canonical readiness audit serialization and Markdown are deterministic', () => {
  const audit = {
    advisory_only: true,
    mutates_dataset: false,
    authorizes_training: false,
    inputs: [],
    global_blockers: [],
    cases: [],
    summary: {
      gate_contribution_count: 0,
      ready_for_m3_real_data: false,
      training_eligible_count: 0
    }
  };

  const first = canonicalizeStage7RealCaseReadinessAudit(audit);
  assert.equal(first, canonicalizeStage7RealCaseReadinessAudit(structuredClone(audit)));
  assert.match(first, /\n$/);
  assert.match(renderStage7RealCaseReadinessMarkdown(audit), /Advisory only: yes/);
});

test('audit reports the six committed v3 pilots without authorizing training', async () => {
  const audit = await auditStage7RealCaseReadiness({
    repositoryRoot: process.cwd(),
    datasetRoot: 'mc_templates/datasets/coarse_semantic_voxels/v3',
    reviewOverlayPath: 'mc_templates/curation/stage7_dataset_reviews.jsonl',
    artifactRoot: '.tmp/stage7-real-case-readiness-missing-artifacts'
  });

  assert.equal(audit.advisory_only, true);
  assert.equal(audit.mutates_dataset, false);
  assert.equal(audit.authorizes_training, false);
  assert.equal(audit.summary.ready_for_m3_real_data, false);
  assert.equal(audit.summary.training_eligible_count, 0);
  assert.deepEqual(audit.cases.map((item) => item.case_id), [
    'house-a-small-modern-house',
    'house-lakehouse',
    'house-tavern',
    'house-watermill',
    'house-wood-modern-house',
    'temples-japanese-pagoda-plus-tea-house'
  ]);
  for (const item of audit.cases) {
    assert.equal(item.gate_contribution, false);
    assert.ok(item.blockers.some((blocker) => blocker.code === 'REVIEW_DECISION_NOT_POSITIVE'));
    assert.ok(item.blockers.some((blocker) => blocker.code === 'LICENSE_LOCAL_TRAINING_NOT_ALLOWED'));
    assert.ok(item.blockers.some((blocker) => blocker.code === 'SEMANTIC_ACCEPTANCE_NOT_ACCEPTED'));
    assert.ok(item.blockers.some((blocker) => blocker.code === 'V3_REVIEW_UNBOUND'));
    assert.ok(item.blockers.every((blocker) => blocker.source.path));
    assert.ok(item.blockers.every((blocker) => /^[a-f0-9]{64}$/.test(blocker.source.sha256)));
  }
});

test('ambiguous latest review evidence fails closed', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'stage7-readiness-audit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await copyFile('mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json', join(root, 'manifest.json'));
  await copyFile('mc_templates/datasets/coarse_semantic_voxels/v3/cases.jsonl', join(root, 'cases.jsonl'));
  const overlay = await readFile('mc_templates/curation/stage7_dataset_reviews.jsonl', 'utf8');
  const duplicate = { ...JSON.parse(overlay.split('\n')[0]), record_id: 'ambiguous-latest-review' };
  await writeFile(join(root, 'reviews.jsonl'), `${overlay}${JSON.stringify(duplicate)}\n`, 'utf8');

  const audit = await auditStage7RealCaseReadiness({
    repositoryRoot: root,
    datasetRoot: '.',
    reviewOverlayPath: 'reviews.jsonl'
  });

  assert.ok(audit.global_blockers.some((blocker) => blocker.code === 'INPUT_AMBIGUOUS_REVIEW'));
  assert.equal(audit.authorizes_training, false);
  assert.ok(audit.cases.every((item) => item.gate_contribution === false));
});
