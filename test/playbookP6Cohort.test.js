import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { compileP6Cohort, normalizeP6SelectionRank, resolveP6Bounds, resolveSouthEntry } from '../src/playbook/p6/cohort.js';
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

test('real-shaped P5 and off blueprints project legacy camelCase bounds without changing source data', () => {
  for (const source of ['p5', 'off']) {
    const blueprint = {
      workflow: 'construction_method_v1',
      bounds: { minX: -11, maxX: 30, minY: 0, maxY: 10, minZ: -5, maxZ: 28 },
      paths: { mainDoor: { side: 'south', x: 14, z: 12, width: 2, height: 2, doorBlock: 'minecraft:spruce_door[facing=south,half=lower,hinge=left]' } },
      opening: { main_entry: { side: 'south', width: 2, height: 2, target_room: 'entry', strategy: 'direct-entry' } }
    };
    const operations = exactSouthDoor(14, 1, 12, 'minecraft:spruce_door');
    const before = structuredClone(blueprint);
    const bounds = resolveP6Bounds(blueprint);
    assert.deepEqual(bounds, { min_x: -11, min_y: 0, min_z: -5, max_x: 30, max_y: 10, max_z: 28 }, source);
    assert.deepEqual(resolveSouthEntry({ blueprint, operations, bounds }), {
      center_x: 14.5, center_y: 1.5, center_z: 12, facing: 'south'
    }, source);
    assert.deepEqual(blueprint, before, `${source} source authority must remain byte-equivalent`);
  }
});

test('legacy entry derivation fails closed for missing, ambiguous, or semantically wrong doors', () => {
  const blueprint = {
    workflow: 'construction_method_v1',
    bounds: { minX: 0, maxX: 20, minY: 0, maxY: 10, minZ: 0, maxZ: 30 },
    paths: { mainDoor: { side: 'south', x: 4, z: 12, width: 2, height: 2, doorBlock: 'minecraft:oak_door[facing=south,half=lower,hinge=left]' } },
    opening: { main_entry: { side: 'south', width: 2, height: 2 } }
  };
  const bounds = { min_x: 0, max_x: 20, min_y: 0, max_y: 10, min_z: 0, max_z: 30 };
  const exact = exactSouthDoor(4, 1, 12, 'minecraft:oak_door');
  assert.throws(() => resolveSouthEntry({ blueprint, operations: [], bounds }), { code: 'P6_COHORT_INCOMPLETE' });
  assert.throws(() => resolveSouthEntry({ blueprint, operations: [...exact, { ...exact[0], block: exact[0].block.replace('oak_door', 'spruce_door') }], bounds }), { code: 'P6_COHORT_INCOMPLETE' });
  const north = exact.map(row => ({ ...row, block: row.block.replace('facing=south', 'facing=north') }));
  assert.throws(() => resolveSouthEntry({ blueprint, operations: north, bounds }), { code: 'P6_COHORT_INCOMPLETE' });
  const mixed = exact.map((row, index) => index === 3 ? { ...row, block: row.block.replace('oak_door', 'spruce_door') } : row);
  assert.throws(() => resolveSouthEntry({ blueprint, operations: mixed, bounds }), { code: 'P6_COHORT_INCOMPLETE' });
  const powered = exact.map(row => ({ ...row, block: row.block.replace(']', ',open=false,powered=true]') }));
  assert.throws(() => resolveSouthEntry({ blueprint, operations: powered, bounds }), { code: 'P6_COHORT_INCOMPLETE' });
  const extra = exact.map(row => ({ ...row, block: row.block.replace(']', ',waterlogged=false]') }));
  assert.throws(() => resolveSouthEntry({ blueprint, operations: extra, bounds }), { code: 'P6_COHORT_INCOMPLETE' });
  assert.throws(() => resolveSouthEntry({
    blueprint: { ...blueprint, paths: { mainDoor: { ...blueprint.paths.mainDoor, height: 3 } } },
    operations: [...exact, ...exact.slice(2).map(row => ({
      ...row, from: { ...row.from, y: 3 }, to: { ...row.to, y: 3 }
    }))], bounds
  }), { code: 'P6_COHORT_INCOMPLETE' });
});

test('sparse P5 eligibility ranking preserves all three frozen slots without substituting a solution', () => {
  assert.deepEqual(normalizeP6SelectionRank({
    candidates: [
      selectionCandidate('candidate-01', 'repair-invalid'),
      selectionCandidate('candidate-02', 'repair-invalid'),
      selectionCandidate('candidate-03', 'eligible')
    ],
    ranking: [{ candidate_id: 'candidate-03', rank: 1 }]
  }), [
    { candidate_id: 'candidate-01', rank: null },
    { candidate_id: 'candidate-02', rank: null },
    { candidate_id: 'candidate-03', rank: 1 }
  ]);
});

test('selection rank rejects an omitted eligible candidate', () => {
  assert.throws(() => normalizeP6SelectionRank({
    candidates: [
      selectionCandidate('candidate-01', 'eligible'),
      selectionCandidate('candidate-02', 'repair-invalid'),
      selectionCandidate('candidate-03', 'eligible')
    ],
    ranking: [{ candidate_id: 'candidate-03', rank: 1 }]
  }), { code: 'P6_AUTHORITY_INVALID' });
});

test('selection rank rejects a ranked ineligible candidate', () => {
  assert.throws(() => normalizeP6SelectionRank({
    candidates: [
      selectionCandidate('candidate-01', 'repair-invalid'),
      selectionCandidate('candidate-02', 'repair-invalid'),
      selectionCandidate('candidate-03', 'eligible')
    ],
    ranking: [
      { candidate_id: 'candidate-03', rank: 1 },
      { candidate_id: 'candidate-02', rank: 2 }
    ]
  }), { code: 'P6_AUTHORITY_INVALID' });
});

function selectionCandidate(candidate_id, status) {
  return {
    candidate_id,
    eligibility: {
      status,
      hard_qa_ok: true,
      unresolved_violated_core_rule_ids: status === 'eligible' ? [] : ['rule:test.unresolved'],
      neutral_unknown_rule_ids: [],
      neutral_not_applicable_rule_ids: [],
      repair_budget_used: status === 'eligible' ? 0 : 1
    }
  };
}

function exactSouthDoor(x, y, z, block) {
  return [
    { kind: 'fill', from: { x, y, z }, to: { x, y, z }, block: `${block}[facing=south,half=lower,hinge=left]` },
    { kind: 'fill', from: { x: x + 1, y, z }, to: { x: x + 1, y, z }, block: `${block}[facing=south,half=lower,hinge=right]` },
    { kind: 'fill', from: { x, y: y + 1, z }, to: { x, y: y + 1, z }, block: `${block}[facing=south,half=upper,hinge=left]` },
    { kind: 'fill', from: { x: x + 1, y: y + 1, z }, to: { x: x + 1, y: y + 1, z }, block: `${block}[facing=south,half=upper,hinge=right]` }
  ];
}

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

test('fixed provenance rejects coordinated drift and invalid rank sequences', async t => {
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
