import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { tmpdir } from 'node:os';
import {
  auditStage7RealCaseReadiness,
  canonicalizeStage7RealCaseReadinessAudit,
  renderStage7RealCaseReadinessMarkdown
} from '../src/construction/learning/stage7RealCaseReadinessAudit.js';
import { main as runReadinessAuditCli } from '../src/auditStage7RealCaseReadiness.js';

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

test('missing local artifact root blocks every pilot without changing eligibility', async () => {
  const audit = await auditStage7RealCaseReadiness({
    repositoryRoot: process.cwd(),
    datasetRoot: 'mc_templates/datasets/coarse_semantic_voxels/v3',
    reviewOverlayPath: 'mc_templates/curation/stage7_dataset_reviews.jsonl',
    artifactRoot: '.tmp/stage7-real-case-readiness-missing-artifacts'
  });

  assert.equal(audit.summary.training_eligible_count, 0);
  assert.ok(audit.cases.every((item) => item.gate_contribution === false));
  assert.ok(audit.cases.every((item) => item.blockers.some((blocker) => blocker.code === 'LOCAL_ARTIFACT_ROOT_MISSING')));
});

test('CLI writes the canonical advisory report pair outside Dataset roots', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'stage7-readiness-output-'));
  const output = join(root, 'reports');
  t.after(() => rm(root, { recursive: true, force: true }));

  const audit = await runReadinessAuditCli([
    '--out', output,
    '--artifact-root', '.tmp/stage7-real-case-readiness-missing-artifacts'
  ]);

  const json = JSON.parse(await readFile(join(output, 'stage7-real-case-readiness-audit.json'), 'utf8'));
  const markdown = await readFile(join(output, 'stage7-real-case-readiness-audit.md'), 'utf8');
  assert.equal(json.authorizes_training, false);
  assert.deepEqual(json, audit);
  assert.match(markdown, /Advisory only: yes/);
});

test('local plan canonical hash mismatch fails closed', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'stage7-readiness-artifact-'));
  const artifactPlan = join(root, 'artifacts', 'cases', 'house-a-small-modern-house', 'plan.raw.json');
  t.after(() => rm(root, { recursive: true, force: true }));
  await copyFile('mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json', join(root, 'manifest.json'));
  await copyFile('mc_templates/datasets/coarse_semantic_voxels/v3/cases.jsonl', join(root, 'cases.jsonl'));
  await copyFile('mc_templates/curation/stage7_dataset_reviews.jsonl', join(root, 'reviews.jsonl'));
  await mkdir(join(root, 'artifacts', 'cases', 'house-a-small-modern-house'), { recursive: true });
  await writeFile(artifactPlan, '{"not":"the committed canonical plan"}\n', 'utf8');

  const audit = await auditStage7RealCaseReadiness({
    repositoryRoot: root,
    datasetRoot: '.',
    reviewOverlayPath: 'reviews.jsonl',
    artifactRoot: 'artifacts'
  });

  const first = audit.cases.find((item) => item.case_id === 'house-a-small-modern-house');
  assert.ok(first.blockers.some((blocker) => blocker.code === 'LOCAL_ARTIFACT_CANONICAL_HASH_MISMATCH'));
  assert.equal(first.gate_contribution, false);
});
