import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { compileP6Cohort, resolveSouthEntry } from '../src/playbook/p6/cohort.js';
import { auditExecuteDependencyBoundary } from '../src/playbook/execute/executeDependencyBoundary.js';
import { auditShadowDependencyBoundary } from '../src/playbook/shadow/shadowDependencyBoundary.js';
import { createP6CohortFixture } from './fixtures/playbookP6.js';

test('compileP6Cohort binds the exact four solutions', async t => {
  const fixture = await createP6CohortFixture(t);
  const cohort = compileP6Cohort({
    fixedRequest: fixture.fixedRequest,
    playbook: fixture.playbookAuthority,
    baseline: fixture.baselineAuthority
  });
  assert.deepEqual(cohort.solutions.map(row => row.solution_id), [
    'playbook-candidate-01', 'playbook-candidate-02',
    'playbook-candidate-03', 'baseline-current'
  ]);
  assert.equal(cohort.solutions.length, 4);
  assert.equal(cohort.manifest.solutions[3].playbook_mode, 'off');
  assert.deepEqual(cohort.advisory_rule_eligibility[0].unresolved_violated_core_rule_ids, []);
});

test('preflight rejects each blocking snapshot defect without reading an ambient path', async t => {
  for (const defect of [
    'missing-slot', 'missing-checkpoint', 'hard-qa-failed', 'entry-not-south',
    'hash-mismatch', 'symlink', 'baseline-provenance', 'request-drift',
    'commit-drift', 'minecraft-drift', 'options-drift', 'substituted-build',
    'cross-run-chain', 'corpus-drift', 'rule-drift', 'bounds-missing',
    'bounds-unstable', 'entry-conflict', 'malformed-slots', 'directory'
  ]) await t.test(defect, async t => {
    const fixture = await createP6CohortFixture(t, { defect });
    assert.throws(() => compileP6Cohort({
      fixedRequest: fixture.fixedRequest,
      playbook: fixture.playbookAuthority,
      baseline: fixture.baselineAuthority
    }), { code: ['symlink', 'hash-mismatch', 'directory'].includes(defect) ? 'P6_AUTHORITY_INVALID' : 'P6_COHORT_INCOMPLETE' });
  });
});

test('selection rank remains informational and resolved entry is explicitly south-facing', async t => {
  const fixture = await createP6CohortFixture(t, { selectionRank: [3, 2, 1] });
  const cohort = compileP6Cohort({
    fixedRequest: fixture.fixedRequest,
    playbook: fixture.playbookAuthority,
    baseline: fixture.baselineAuthority
  });
  assert.deepEqual(cohort.selection_rank.map(row => row.candidate_id), [
    'candidate-03', 'candidate-02', 'candidate-01'
  ]);
  assert.equal(cohort.solutions[0].main_entry.facing, 'south');
  assert.throws(() => resolveSouthEntry({ blueprint: {}, operations: [] }), { code: 'P6_COHORT_INCOMPLETE' });
});

test('cohort bytes are stable and post-compile authority mutation cannot alter the frozen result', async t => {
  const fixture = await createP6CohortFixture(t);
  const first = compileP6Cohort({ fixedRequest: fixture.fixedRequest, playbook: fixture.playbookAuthority, baseline: fixture.baselineAuthority });
  const second = compileP6Cohort({ fixedRequest: fixture.fixedRequest, playbook: fixture.playbookAuthority, baseline: fixture.baselineAuthority });
  assert.equal(first.input_sha256, second.input_sha256);
  fixture.playbookAuthority.slots[0].build_function.bytes[0] ^= 1;
  assert.equal(first.solutions[0].build_function_sha256, second.solutions[0].build_function_sha256);
  for (const order of [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]) {
    const ranked = await createP6CohortFixture(t, { selectionRank: order });
    assert.equal(compileP6Cohort({ fixedRequest: ranked.fixedRequest, playbook: ranked.playbookAuthority, baseline: ranked.baselineAuthority }).solutions.length, 4);
  }
});

test('fixed provenance rejects coordinated drift and ranks are exact permutations', async t => {
  for (const mutate of [
    ({ playbook, baseline }) => { playbook.provenance.corpus_sha256 = baseline.provenance.corpus_sha256 = 'd'.repeat(64); },
    ({ playbook, baseline }) => { playbook.provenance.rule_version = baseline.provenance.rule_version = '0.2.0'; },
    ({ playbook, baseline }) => { playbook.generator_commit = baseline.generator_commit = 'b'.repeat(40); playbook.provenance.generator_commit = baseline.provenance.generator_commit = 'b'.repeat(40); },
    ({ playbook, baseline }) => { playbook.options.concepts = baseline.options.concepts = 1; playbook.provenance.options.concepts = baseline.provenance.options.concepts = 1; }
  ]) {
    const fixture = await createP6CohortFixture(t); mutate({ playbook: fixture.playbookAuthority, baseline: fixture.baselineAuthority });
    assert.throws(() => compileP6Cohort({ fixedRequest: fixture.fixedRequest, playbook: fixture.playbookAuthority, baseline: fixture.baselineAuthority }), { code: 'P6_COHORT_INCOMPLETE' });
  }
  for (const ranks of [[1, 1, 2], [0, 2, 3], [1, 2]]) {
    const fixture = await createP6CohortFixture(t); fixture.playbookAuthority.selection_rank = ranks.map((rank, index) => ({ candidate_id: `candidate-0${index + 1}`, rank }));
    assert.throws(() => compileP6Cohort({ fixedRequest: fixture.fixedRequest, playbook: fixture.playbookAuthority, baseline: fixture.baselineAuthority }), { code: 'P6_COHORT_INCOMPLETE' });
  }
});

test('P5, P4, and pipeline imports never reach P6 and off remains the baseline route', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const [execute, shadow] = await Promise.all([
    auditExecuteDependencyBoundary({ projectRoot: root }), auditShadowDependencyBoundary({ projectRoot: root })
  ]);
  assert.equal(execute.import_boundary_violation_count, 0);
  assert.equal(execute.import_boundary_unresolved_count, 0);
  assert.equal(shadow.import_boundary_violation_count, 0);
  assert.equal(shadow.import_boundary_unresolved_count, 0);
  const start = [
    'src/playbook/execute', 'src/playbook/review', 'src/pipeline.js'
  ];
  const visited = new Set();
  const queue = start.map(item => path.join(root, item));
  while (queue.length) {
    const current = queue.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    const stat = await import('node:fs/promises').then(({ lstat }) => lstat(current)).catch(() => null);
    if (!stat) continue;
    if (stat.isDirectory()) {
      const names = await import('node:fs/promises').then(({ readdir }) => readdir(current));
      queue.push(...names.filter(name => name.endsWith('.js')).map(name => path.join(current, name)));
      continue;
    }
    const source = await readFile(current, 'utf8');
    assert.equal(source.includes('/p6/'), false, current);
    assert.equal(source.includes("'../p6/") || source.includes("'./p6/"), false, current);
  }
  const pipeline = await readFile(path.join(root, 'src/pipeline.js'), 'utf8');
  assert.match(pipeline, /playbook = 'off'/u);
  assert.equal(pipeline.includes('p6/cohort'), false);
});
