import assert from 'node:assert/strict';
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
  const reranked = await createP6CohortFixture(t, { selectionRank: [3, 2, 1] });
  assert.notEqual(first.input_sha256, compileP6Cohort({
    fixedRequest: reranked.fixedRequest,
    playbook: reranked.playbookAuthority,
    baseline: reranked.baselineAuthority
  }).input_sha256, 'selection ranking authority must change the cohort input hash');
});

test('fixture authority snapshots preserve actual lstat node kinds without publishing paths', async t => {
  const symlink = await createP6CohortFixture(t, { defect: 'symlink' });
  const directory = await createP6CohortFixture(t, { defect: 'directory' });

  for (const [fixture, expectedStat] of [
    [symlink, { is_regular_file: false, is_symlink: true }],
    [directory, { is_regular_file: false, is_symlink: false }]
  ]) {
    const authoritySnapshot = fixture.playbookAuthority.slots[0].build_function;
    const bindings = fixture.node_evidence.filter(row => row.authority_snapshot === authoritySnapshot);
    assert.equal(bindings.length, 1, 'the exact compiler input snapshot has one lstat evidence binding');
    const evidence = bindings[0].lstat;
    assert.deepEqual(authoritySnapshot.stat, {
      is_regular_file: evidence.is_regular_file,
      is_symlink: evidence.is_symlink,
      size: evidence.size
    });
    assert.deepEqual(evidence, {
      stat_source: 'lstat',
      ...expectedStat,
      size: evidence.size
    });

    const unrelated = fixture.node_evidence.find(row => row.authority_snapshot !== authoritySnapshot);
    assert.ok(unrelated, 'fixture has an unrelated node that cannot satisfy the exact binding');
    assert.notDeepEqual(authoritySnapshot.stat, {
      is_regular_file: unrelated.lstat.is_regular_file,
      is_symlink: unrelated.lstat.is_symlink,
      size: unrelated.lstat.size
    });
  }
  for (const fixture of [symlink, directory]) {
    assert.throws(() => compileP6Cohort({
      fixedRequest: fixture.fixedRequest,
      playbook: fixture.playbookAuthority,
      baseline: fixture.baselineAuthority
    }), { code: 'P6_AUTHORITY_INVALID' });
  }

  const normal = await createP6CohortFixture(t);
  const cohort = compileP6Cohort({
    fixedRequest: normal.fixedRequest,
    playbook: normal.playbookAuthority,
    baseline: normal.baselineAuthority
  });
  assert.equal(JSON.stringify(cohort).includes(normal.snapshot_root), false);
  assert.equal(JSON.stringify(cohort).includes('"path"'), false);
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

test('P5 and P4 production dependency auditors never reach P6', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const [execute, shadow] = await Promise.all([
    auditExecuteDependencyBoundary({ projectRoot: root }), auditShadowDependencyBoundary({ projectRoot: root })
  ]);
  assert.equal(execute.import_boundary_violation_count, 0);
  assert.equal(execute.import_boundary_unresolved_count, 0);
  assert.equal(shadow.import_boundary_violation_count, 0);
  assert.equal(shadow.import_boundary_unresolved_count, 0);
});
