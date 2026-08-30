import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { compileP6Cohort, resolveSouthEntry } from '../src/playbook/p6/cohort.js';
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
    'commit-drift', 'minecraft-drift', 'options-drift'
  ]) await t.test(defect, async t => {
    const fixture = await createP6CohortFixture(t, { defect });
    assert.throws(() => compileP6Cohort({
      fixedRequest: fixture.fixedRequest,
      playbook: fixture.playbookAuthority,
      baseline: fixture.baselineAuthority
    }), { code: ['symlink', 'hash-mismatch'].includes(defect) ? 'P6_AUTHORITY_INVALID' : 'P6_COHORT_INCOMPLETE' });
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

test('P5, P4, and pipeline imports never reach P6 and off remains the baseline route', async () => {
  const root = path.resolve(import.meta.dirname, '..');
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
