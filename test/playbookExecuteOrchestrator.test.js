import assert from 'node:assert/strict';
import { chmodSync, constants as fsConstants, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runExecutablePlaybookPipeline } from '../src/playbook/execute/orchestrator.js';
import { runPipeline } from '../src/pipeline.js';
import { stableJson } from '../src/playbook/shadow/canonical.js';
import { validateInitialCandidateFailure, validateRepairPlanningFailureEvidence } from '../src/playbook/execute/contracts.js';
import { CandidateSelectionAgent } from '../src/construction/agents/candidateSelectionAgent.js';
import { buildFrozenGeneratorContext, prepareConstructionDesign } from '../src/construction/designStages.js';
import { compilePreparedConstruction } from '../src/construction/workflow.js';
import { buildDeterministicShadowReview } from '../src/playbook/shadow/runShadowReview.js';
import { createFrozenDesignEnvelope } from '../src/playbook/execute/designEnvelope.js';
import { deriveFailureEligibilityOverlay } from '../src/playbook/execute/storageValidation.js';
import {
  admitExecuteRun,
  appendCandidateRepairPlanningFailureEvidence,
  inspectCandidateEvidence,
  installExecuteSelection,
  installInitialCandidateFailure,
  pruneCandidateWorkspaces,
  readCurrentCandidateSnapshot
} from '../src/playbook/execute/storage.js';

test('execute orchestration forwards the request-scoped LLM provider', async (t) => {
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-provider-forward-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  const calls = [];

  await assert.rejects(runExecutablePlaybookPipeline({
    playbook: 'execute',
    prompt: 'Build a medieval gatehouse',
    mode: 'llm',
    llmProvider: 'codex',
    outRoot,
    cwd: path.resolve(import.meta.dirname, '..')
  }, {
    createClient: (options) => {
      calls.push(options);
      throw Object.assign(new Error('private dependency stop'), {
        code: 'P5_AUTHORITY_INVALID'
      });
    }
  }), { code: 'P5_AUTHORITY_INVALID' });

  assert.deepEqual(calls, [{
    cwd: path.resolve(import.meta.dirname, '..'),
    provider: 'codex'
  }]);
});

test('execute orchestration rejects unknown dependency authority before work', async () => {
  await assert.rejects(
    runExecutablePlaybookPipeline({}, { unexpected: () => {} }),
    { code: 'P5_AUTHORITY_INVALID' }
  );
});

test('outer execute boundary sanitizes every public stage and authority close', async (t) => {
  const projectRoot = path.resolve(import.meta.dirname, '..');
  const prompt = 'Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base';
  const secret = 'PRIVATE_EXECUTE_BOUNDARY_BODY_/home/private/world';
  const cases = [
    ['create-run', 'P5_AUTHORITY_INVALID', { createRun: async () => { throw new Error(secret); } }],
    ['corpus-load', 'P5_AUTHORITY_INVALID', { loadCorpus: async () => { throw new Error(secret); } }],
    ['selection-render', 'P5_INSTALL_FAILED', { renderSelection: () => { throw new Error(secret); } }],
    ['selection-publication', 'P5_INSTALL_FAILED', { publishSelection: async () => { throw new Error(secret); } }],
    ['installer', 'P5_INSTALL_FAILED', { installSelected: async () => { throw new Error(secret); } }]
  ];
  for (const [name, code, dependencies] of cases) {
    await t.test(name, async (t) => {
      const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), `p5-boundary-${name}-`));
      t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
      await assert.rejects(
        runExecutablePlaybookPipeline({
          playbook: 'execute', prompt, mode: 'mock', seed: 424242, outRoot, cwd: projectRoot
        }, dependencies),
        (error) => {
          assert.equal(error.code, code);
          assert.equal(error.message, code);
          assert.equal(JSON.stringify(error).includes(secret), false);
          return true;
        }
      );
    });
  }
  await assert.rejects(
    runExecutablePlaybookPipeline({ playbook: 'execute', prompt, candidates: 2 }),
    { code: 'P5_OPTIONS_INCOMPATIBLE', message: 'P5_OPTIONS_INCOMPATIBLE' }
  );
  const committedOutRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-boundary-authority-close-'));
  t.after(() => fs.rm(committedOutRoot, { recursive: true, force: true }));
  const committed = await runExecutablePlaybookPipeline({
    playbook: 'execute', prompt, mode: 'mock', seed: 424242,
    outRoot: committedOutRoot, cwd: projectRoot
  }, {
    closeAuthority: async (authority) => { await authority.close(); throw new Error(secret); }
  });
  assert.equal(committed.playbookExecution.mode, 'execute');
});

test('direct execute API rejects an empty prompt at the stable P5 boundary before output', async (t) => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-empty-prompt-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const outRoot = path.join(parent, 'PRIVATE-output-path-that-must-not-leak');
  await assert.rejects(
    runPipeline({ playbook: 'execute', prompt: ' \t\n', outRoot }),
    (error) => {
      assert.equal(error.code, 'P5_OPTIONS_INCOMPATIBLE');
      assert.equal(error.message, 'P5_OPTIONS_INCOMPATIBLE');
      assert.equal(JSON.stringify(error).includes(outRoot), false);
      return true;
    }
  );
  await assert.rejects(fs.lstat(outRoot), { code: 'ENOENT' });
});

test('execute precommit failures retain no selected candidate workspace', async (t) => {
  const prompt = 'Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base';
  for (const [name, dependency] of [
    ['selection-publication', { publishSelection: async () => { throw new Error('private publication fault'); } }],
    ['installer', { installSelected: async () => { throw new Error('private installer fault'); } }]
  ]) {
    await t.test(name, async (t) => {
      const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), `p5-workspace-${name}-`));
      t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
      await assert.rejects(runExecutablePlaybookPipeline({
        playbook: 'execute', prompt, mode: 'mock', seed: 424242,
        outRoot, cwd: path.resolve(import.meta.dirname, '..')
      }, dependency), { code: 'P5_INSTALL_FAILED', message: 'P5_INSTALL_FAILED' });
      const [runName] = await fs.readdir(outRoot);
      assert.deepEqual(await fs.readdir(path.join(outRoot, runName, 'candidate-work')), []);
    });
  }
});

test('workspace pruning is a pre-publication boundary and cannot run after install as a fatal transaction', async (t) => {
  const prompt = 'Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base';
  await t.test('preinstall prune failure prevents installation', async (t) => {
    const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-preinstall-prune-'));
    t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
    let installCalls = 0;
    await assert.rejects(runExecutablePlaybookPipeline({
      playbook: 'execute', prompt, mode: 'mock', seed: 424242,
      outRoot, cwd: path.resolve(import.meta.dirname, '..')
    }, {
      pruneWorkspaces: async () => { throw new Error('private preinstall prune fault'); },
      installSelected: async () => { installCalls += 1; return '/private/install'; }
    }), { code: 'P5_INSTALL_FAILED', message: 'P5_INSTALL_FAILED' });
    assert.equal(installCalls, 0);
  });

  await t.test('postinstall cleanup failure preserves reported committed success', async (t) => {
    const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-postinstall-prune-'));
    t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
    let installed = false;
    let pruneCalls = 0;
    const result = await runExecutablePlaybookPipeline({
      playbook: 'execute', prompt, mode: 'mock', seed: 424242,
      outRoot, cwd: path.resolve(import.meta.dirname, '..')
    }, {
      installSelected: async () => { installed = true; return undefined; },
      pruneWorkspaces: async (input) => {
        pruneCalls += 1;
        await pruneCandidateWorkspaces(input);
        if (installed) throw new Error('private postinstall prune fault');
      }
    });
    assert.equal(result.playbookExecution.mode, 'execute');
    assert.equal(installed, true);
    assert.equal(pruneCalls, 2);
  });
});

test('initial failure evidence installs once without an accepted-chain pointer', async (t) => {
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-initial-failure-'));
  t.after(() => fs.rm(runDir, { recursive: true, force: true }));
  const authority = await admitExecuteRun({ runDir });
  t.after(() => authority.close());
  const failure = {
    schema_version: 1,
    candidate_id: 'candidate-01',
    stage: 'design',
    code: 'P5_DESIGN_INVALID',
    frozen_design_sha256: null,
    frozen_generator_context_sha256: null,
    blueprint_sha256: null,
    hard_qa_sha256: null,
    p4_review_sha256: null,
    artifact_hashes: {}
  };
  const installed = await installInitialCandidateFailure({ authority, candidateId: 'candidate-01', files: {
    'failures/initial.json': Buffer.from(stableJson(failure))
  } });
  assert.equal(installed.status, 'created');
  const evidence = await inspectCandidateEvidence({ authority, candidateId: 'candidate-01' });
  assert.equal(evidence.kind, 'initial-failed');
  assert.deepEqual(evidence.failure, failure);
  await assert.rejects(
    installInitialCandidateFailure({ authority, candidateId: 'candidate-01', files: {
      'failures/initial.json': Buffer.from(stableJson(failure))
    } }),
    { code: 'P5_OUTPUT_OWNERSHIP' }
  );
  await assert.rejects(fs.readFile(path.join(runDir, 'playbook-execute/candidates/candidate-01/current-chain.json')),
    { code: 'ENOENT' });
});

test('initial failure installation rejects unknown paths, symlinks, and precommit write faults', async (t) => {
  const failureBytes = Buffer.from(stableJson({ schema_version: 1, candidate_id: 'candidate-01', stage: 'design',
    code: 'P5_DESIGN_INVALID', frozen_design_sha256: null, frozen_generator_context_sha256: null,
    blueprint_sha256: null, hard_qa_sha256: null, p4_review_sha256: null, artifact_hashes: {} }));
  for (const kind of ['unknown-path', 'symlink', 'write-fault']) {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), `p5-failed-${kind}-`));
    t.after(() => fs.rm(runDir, { recursive: true, force: true }));
    const authority = await admitExecuteRun({ runDir }); t.after(() => authority.close());
    if (kind === 'symlink') {
      await fs.mkdir(path.join(runDir, 'playbook-execute/candidates'), { recursive: true });
      await fs.symlink(runDir, path.join(runDir, 'playbook-execute/candidates/candidate-01'));
    }
    const files = { 'failures/initial.json': failureBytes };
    if (kind === 'unknown-path') files['failures/private.json'] = Buffer.from('{}\n');
    const fsImpl = kind === 'write-fault' ? {
      async open(target, flags, ...args) {
        if ((flags & 1) !== 0) throw new Error('private write fault');
        return fs.open(target, flags, ...args);
      }
    } : undefined;
    await assert.rejects(installInitialCandidateFailure({ authority, candidateId: 'candidate-01', files, fsImpl }),
      { code: kind === 'unknown-path' ? 'P5_AUTHORITY_INVALID' : kind === 'symlink' ? 'P5_OUTPUT_OWNERSHIP' : 'P5_INSTALL_FAILED' });
    if (kind === 'write-fault') {
      const names = await fs.readdir(path.join(runDir, 'playbook-execute/candidates'));
      assert.equal(names.includes('candidate-01'), false);
    }
  }
});

test('initial failure contract rejects extra fields, broken provenance, and artifact drift', () => {
  const valid = { schema_version: 1, candidate_id: 'candidate-01', stage: 'p4-review', code: 'P5_AUTHORITY_INVALID',
    frozen_design_sha256: '1'.repeat(64), frozen_generator_context_sha256: '2'.repeat(64),
    blueprint_sha256: '3'.repeat(64), hard_qa_sha256: '4'.repeat(64), p4_review_sha256: '5'.repeat(64),
    artifact_hashes: { 'reviews/initial-hard-qa.json': '4'.repeat(64), 'reviews/initial-review.json': '5'.repeat(64) } };
  assert.deepEqual(validateInitialCandidateFailure(valid), valid);
  for (const mutate of [
    (value) => { value.secret = '/private/path'; },
    (value) => { value.stage = 'replay'; },
    (value) => { value.frozen_design_sha256 = null; },
    (value) => { value.frozen_generator_context_sha256 = null; },
    (value) => { value.blueprint_sha256 = null; },
    (value) => { value.hard_qa_sha256 = null; },
    (value) => { delete value.artifact_hashes['reviews/initial-review.json']; },
    (value) => { value.artifact_hashes['reviews/initial-hard-qa.json'] = '6'.repeat(64); },
    (value) => { value.artifact_hashes['reviews/extra.json'] = '6'.repeat(64); }
  ]) {
    const changed = structuredClone(valid); mutate(changed);
    assert.throws(() => validateInitialCandidateFailure(changed), { code: 'P5_AUTHORITY_INVALID' });
  }
});

test('accepted failure overlays preserve chain evidence and map exact failure classes', () => {
  const chain = { status: 'unresolved-core-violation', hard_qa_ok: true,
    unresolved_violated_core_rule_ids: ['rule:structure.compose-three-volumes'],
    neutral_unknown_rule_ids: ['rule:roof.border-with-material-contrast'],
    neutral_not_applicable_rule_ids: [], repair_budget_used: 0 };
  for (const [kind, code, status] of [
    ['repair-planning', 'P5_REPAIR_INVALID', 'repair-invalid'],
    ['replay', 'P5_REPAIR_INVALID', 'repair-invalid'],
    ['replay', 'P5_REPAIR_CONFLICT', 'repair-invalid'],
    ['replay', 'P5_REPLAY_FAILED', 'replay-failed'],
    ['replay', 'P5_INSTALL_FAILED', 'replay-failed']
  ]) {
    const overlay = deriveFailureEligibilityOverlay(chain, { kind, code });
    assert.equal(overlay.status, status);
    assert.equal(overlay.repair_budget_used, 1);
    assert.equal(overlay.hard_qa_ok, true);
    assert.deepEqual(overlay.unresolved_violated_core_rule_ids, chain.unresolved_violated_core_rule_ids);
    assert.deepEqual(overlay.neutral_unknown_rule_ids, chain.neutral_unknown_rule_ids);
  }
});

test('pretransaction repair failure accepts only the fixed null-transaction schema', () => {
  const valid = { schema_version: 1, candidate_id: 'candidate-01', attempt: 1, code: 'P5_REPAIR_INVALID',
    base_chain_sha256: '1'.repeat(64), repair_transaction_sha256: null, current_chain_sha256: '1'.repeat(64) };
  assert.deepEqual(validateRepairPlanningFailureEvidence(valid), valid);
  for (const mutate of [
    (value) => { value.extra = true; },
    (value) => { value.attempt = 2; },
    (value) => { value.code = 'P5_REPLAY_FAILED'; },
    (value) => { value.repair_transaction_sha256 = '2'.repeat(64); },
    (value) => { value.current_chain_sha256 = '3'.repeat(64); }
  ]) {
    const changed = structuredClone(valid); mutate(changed);
    assert.throws(() => validateRepairPlanningFailureEvidence(changed), { code: 'P5_REPAIR_INVALID' });
  }
});

test('pipeline rejects execute option drift before creating output', async (t) => {
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-option-boundary-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  for (const options of [
    { playbook: 'shadow' },
    { playbook: 'execute', candidates: 2 },
    { playbook: 'execute', candidates: 4 },
    { playbook: 'execute', candidateRounds: 2 },
    { playbook: 'execute', candidateForceRounds: true }
  ]) {
    await assert.rejects(runPipeline({ prompt: 'medieval house', mode: 'mock', outRoot, ...options }),
      { code: options.playbook === 'shadow' ? 'P5_MODE_INVALID' : 'P5_OPTIONS_INCOMPATIBLE' });
    assert.deepEqual(await fs.readdir(outRoot), []);
  }
});

test('execute admits a no-follow output root before creating run topology', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-output-root-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const external = path.join(root, 'external');
  const linked = path.join(root, 'linked-out');
  await fs.mkdir(external);
  await fs.symlink(external, linked, 'dir');

  await assert.rejects(runExecutablePlaybookPipeline({
    playbook: 'execute', prompt: 'three-volume medieval house', mode: 'mock',
    seed: 7, cwd: path.resolve(import.meta.dirname, '..'), outRoot: linked
  }), { code: /P5_(?:AUTHORITY_INVALID|OUTPUT_OWNERSHIP)/u });
  assert.deepEqual(await fs.readdir(external), []);
});

test('reviewed corpus order survives the complete lifecycle and reversed order fails closed', async (t) => {
  const projectRoot = path.resolve(import.meta.dirname, '..');
  const prompt = 'Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base';
  const orderedRuleIds = [
    'rule:structure.compose-three-volumes',
    'rule:roof.border-with-material-contrast'
  ];
  const orderedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-corpus-order-'));
  const reversedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-corpus-reversed-'));
  t.after(() => Promise.all([orderedRoot, reversedRoot].map((root) => fs.rm(root, { recursive: true, force: true }))));

  const ordered = await runExecutablePlaybookPipeline({
    playbook: 'execute', prompt, mode: 'mock', seed: 424242, outRoot: orderedRoot, cwd: projectRoot
  }, { createEnvelope: (input) => reviewedSubsetEnvelope(input, orderedRuleIds) });
  assert.equal(ordered.playbookExecution.selected_candidate_id, 'candidate-03');
  for (const candidateId of ['candidate-01', 'candidate-02', 'candidate-03']) {
    const checkpoint = JSON.parse(await fs.readFile(path.join(
      ordered.outputDir, 'playbook-execute', 'candidates', candidateId, 'checkpoints', 'brief', 'r0001.json'
    )));
    assert.deepEqual(checkpoint.selected_rule_ids, orderedRuleIds);
  }

  await assert.rejects(runExecutablePlaybookPipeline({
    playbook: 'execute', prompt, mode: 'mock', seed: 424242, outRoot: reversedRoot, cwd: projectRoot
  }, { createEnvelope: (input) => reviewedSubsetEnvelope(input, [...orderedRuleIds].reverse()) }), {
    code: 'P5_DESIGN_INVALID'
  });
  const [runName] = await fs.readdir(reversedRoot);
  for (const candidateId of ['candidate-01', 'candidate-02', 'candidate-03']) {
    const failure = JSON.parse(await fs.readFile(path.join(
      reversedRoot, runName, 'playbook-execute', 'candidates', candidateId, 'failures', 'initial.json'
    )));
    assert.equal(failure.stage, 'design');
    assert.equal(failure.code, 'P5_DESIGN_INVALID');
  }
});

test('real production-authority mock input creates natural outcomes and installs into a disposable root', async (t) => {
  const fixture = JSON.parse(await fs.readFile(path.join(
    import.meta.dirname, 'fixtures/playbook-execute/natural-production-authority.json'
  )));
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-three-candidates-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  const datapacksDir = path.join(outRoot, 'disposable-world', 'datapacks');
  const result = await runPipeline({ prompt: fixture.prompt,
    mode: 'mock', outRoot, seed: fixture.seed, playbook: 'execute', datapacksDir });
  assert.equal(result.playbookExecution.mode, 'execute');
  assert.equal(result.playbookExecution.candidate_count, 3);
  assert.deepEqual(result.playbookExecution.candidates.map((row) => row.seed), [1432164, 1440083, 1448002]);
  assert.ok(['candidate-01', 'candidate-02', 'candidate-03'].includes(result.playbookExecution.selected_candidate_id));
  assert.deepEqual(result.playbookExecution.candidates.map((row) => row.repair_attempt_count), fixture.expected_attempt_counts);
  assert.deepEqual(result.playbookExecution.candidates.map((row) => row.eligibility.status), fixture.expected_statuses);
  assert.equal(result.playbookExecution.candidates.filter((row) => row.eligibility.status === 'eligible').length, 1);
  assert.equal(result.playbookExecution.selected_candidate_id, fixture.expected_selected_candidate_id);
  assert.equal(result.artifacts.installedDatapackDir, path.join(datapacksDir, 'architect_datapack'));
  assert.deepEqual(
    await fileTreeBytes(result.artifacts.installedDatapackDir),
    await fileTreeBytes(result.artifacts.datapackDir)
  );
  const authority = await admitExecuteRun({ runDir: result.outputDir });
  t.after(() => authority.close());
  for (const id of ['candidate-01', 'candidate-02', 'candidate-03']) {
    const root = path.join(result.outputDir, 'playbook-execute/candidates', id);
    const evidence = await fs.readdir(root);
    assert.ok(evidence.includes('current-chain.json') || evidence.includes('failures'));
    if (evidence.includes('current-chain.json')) {
      const pointer = JSON.parse(await fs.readFile(path.join(root, 'current-chain.json')));
      const chain = JSON.parse(await fs.readFile(path.join(root, `chains/chain-${String(pointer.chain_revision).padStart(4, '0')}.json`)));
      assert.equal(chain.checkpoint_hashes.length, 5);
      const snapshot = await readCurrentCandidateSnapshot({ authority, candidateId: id });
      const facadeName = Object.keys(snapshot.files).find(name => name.startsWith('checkpoints/facade/')
        && sha256ForTest(snapshot.files[name]) === chain.checkpoint_hashes.at(-1).checkpoint_sha256);
      const facade = JSON.parse(snapshot.files[facadeName]);
      const suffix = String(pointer.chain_revision).padStart(4, '0');
      assert.equal(sha256ForTest(snapshot.files[`artifacts/chain-${suffix}-operation-list.json`]), facade.compiled_artifact_hashes.operation_list_sha256);
      assert.equal(sha256ForTest(snapshot.files[`artifacts/chain-${suffix}-build.mcfunction`]), facade.compiled_artifact_hashes.build_function_sha256);
    }
  }
  for (const id of ['candidate-01', 'candidate-02']) {
    const failure = JSON.parse(await fs.readFile(path.join(result.outputDir, 'playbook-execute/candidates', id, 'failures/repair-attempt-01.json')));
    assert.deepEqual(Object.keys(failure), ['attempt', 'base_chain_sha256', 'candidate_id', 'code', 'current_chain_sha256', 'repair_transaction_sha256', 'schema_version']);
    assert.equal(failure.repair_transaction_sha256, null);
    assert.equal(failure.base_chain_sha256, failure.current_chain_sha256);
  }
  assert.deepEqual(Object.keys(result.artifacts).filter((key) => key.startsWith('playbookExecution')).sort(),
    ['playbookExecutionManifest', 'playbookExecutionReport', 'playbookExecutionSelection']);
  const report = await fs.readFile(result.artifacts.playbookExecutionReport, 'utf8');
  assert.equal(/playbook_score|quality_improvement|quality claim/iu.test(report), false);
  assert.match(report, /P5 creates no playbook score/iu);
});

test('selection installation binds candidate rows and selected current review bodies', async (t) => {
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-selection-binding-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  const result = await runPipeline({ prompt: 'Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base',
    mode: 'mock', outRoot, seed: 424242, playbook: 'execute' });
  const authority = await admitExecuteRun({ runDir: result.outputDir }); t.after(() => authority.close());
  const selection = JSON.parse(await fs.readFile(result.artifacts.playbookExecutionSelection));
  const reportBytes = await fs.readFile(result.artifacts.playbookExecutionReport);
  for (const [name, mutate] of [
    ['invented hash', (value) => { value.candidates[0].current_chain_sha256 = 'f'.repeat(64); }],
    ['accepted seed mismatch', (value) => { value.candidates[0].seed += 1; }],
    ['attempt mismatch', (value) => { value.candidates[0].repair_attempt_count = 0; }],
    ['eligibility mismatch', (value) => { value.candidates[0].eligibility.status = 'replay-failed'; }],
    ['candidate authority swap', (value) => {
      for (const key of ['current_chain_sha256', 'hard_qa_sha256', 'p4_review_sha256']) {
        [value.candidates[0][key], value.candidates[1][key]] = [value.candidates[1][key], value.candidates[0][key]];
      }
    }],
    ['select ineligible accepted root', (value) => {
      const row = value.candidates[0];
      row.eligibility = { ...row.eligibility, status: 'eligible', unresolved_violated_core_rule_ids: [], repair_budget_used: 1 };
      value.selected_candidate_id = row.candidate_id; value.selected_chain_sha256 = row.current_chain_sha256;
    }]
  ]) {
    const changed = structuredClone(selection); mutate(changed);
    const selectionBytes = Buffer.from(stableJson(changed));
    const manifestBytes = Buffer.from(stableJson({ schema_version: 1,
      managed_paths: ['manifest.json', 'selection.json', 'selection-report.md'],
      artifact_hashes: { 'selection.json': sha256ForTest(selectionBytes), 'selection-report.md': sha256ForTest(reportBytes) } }));
    await assert.rejects(installExecuteSelection({ authority, files: {
      'manifest.json': manifestBytes, 'selection.json': selectionBytes, 'selection-report.md': reportBytes
    } }), { code: /P5_(?:INSTALL_FAILED|AUTHORITY_INVALID)/u }, name);
  }

  const selectedId = selection.selected_candidate_id;
  const selectedRow = selection.candidates.find((row) => row.candidate_id === selectedId);
  const selectedRoot = path.join(result.outputDir, 'playbook-execute/candidates', selectedId);
  const current = JSON.parse(await fs.readFile(path.join(selectedRoot, 'current-chain.json')));

  const pointerPath = path.join(selectedRoot, 'current-chain.json');
  const pointerBefore = await fs.readFile(pointerPath);
  const pointerIdentityBefore = await fs.stat(pointerPath);
  await assert.rejects(appendCandidateRepairPlanningFailureEvidence({ authority, candidateId: selectedId,
    expectedCurrentChainSha256: selectedRow.current_chain_sha256,
    evidence: { schema_version: 1, candidate_id: selectedId, attempt: 1, code: 'P5_REPAIR_INVALID',
      base_chain_sha256: selectedRow.current_chain_sha256, repair_transaction_sha256: null,
      current_chain_sha256: selectedRow.current_chain_sha256 },
    fsImpl: { async open(target, flags, ...args) {
      if ((flags & fsConstants.O_WRONLY) !== 0) throw new Error('controlled failure evidence write fault');
      return fs.open(target, flags, ...args);
    } }
  }), { code: 'P5_INSTALL_FAILED' });
  const pointerIdentityAfter = await fs.stat(pointerPath);
  assert.deepEqual(await fs.readFile(pointerPath), pointerBefore);
  assert.equal(pointerIdentityAfter.dev, pointerIdentityBefore.dev);
  assert.equal(pointerIdentityAfter.ino, pointerIdentityBefore.ino);
  await assert.rejects(fs.access(path.join(selectedRoot, 'failures/repair-attempt-01.json')), { code: 'ENOENT' });

  const candidatesRoot = path.join(result.outputDir, 'playbook-execute/candidates');
  const firstRoot = path.join(candidatesRoot, 'candidate-01');
  const secondRoot = path.join(candidatesRoot, 'candidate-02');
  const swapRoot = path.join(candidatesRoot, '.test-swap');
  let currentChainOpens = 0;
  let swapped = false;
  const swapCandidates = async () => {
    await fs.rename(firstRoot, swapRoot);
    await fs.rename(secondRoot, firstRoot);
    await fs.rename(swapRoot, secondRoot);
  };
  try {
    await assert.rejects(installExecuteSelection({ authority, files: {
      'manifest.json': await fs.readFile(result.artifacts.playbookExecutionManifest),
      'selection.json': await fs.readFile(result.artifacts.playbookExecutionSelection),
      'selection-report.md': await fs.readFile(result.artifacts.playbookExecutionReport)
    }, fsImpl: { async open(target, flags, ...args) {
      if (path.basename(String(target)) === 'current-chain.json' && ++currentChainOpens === 4) {
        await swapCandidates(); swapped = true;
      }
      return fs.open(target, flags, ...args);
    } } }), { code: 'P5_INSTALL_FAILED' });
  } finally {
    if (swapped) await swapCandidates();
  }

  const revision = String(current.chain_revision).padStart(4, '0');
  await fs.unlink(path.join(selectedRoot, `reviews/chain-${revision}-review.json`));
  await assert.rejects(installExecuteSelection({ authority, files: {
    'manifest.json': await fs.readFile(result.artifacts.playbookExecutionManifest),
    'selection.json': await fs.readFile(result.artifacts.playbookExecutionSelection),
    'selection-report.md': await fs.readFile(result.artifacts.playbookExecutionReport)
  } }), { code: 'P5_INSTALL_FAILED' });
  assert.equal(selectedRow.eligibility.status, 'eligible');
});

test('three design failures retain immutable evidence and expose P5_DESIGN_INVALID', async (t) => {
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-no-eligible-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  let envelopeCalls = 0;
  let installCalls = 0;
  await assert.rejects(runExecutablePlaybookPipeline({ playbook: 'execute', prompt: 'medieval house', mode: 'mock',
    outRoot, cwd: path.resolve(import.meta.dirname, '..'), seed: 9 }, {
    createEnvelope: async () => { envelopeCalls += 1; throw new Error('private provider body'); },
    installSelected: async () => { installCalls += 1; }
  }), { code: 'P5_DESIGN_INVALID', message: 'P5_DESIGN_INVALID' });
  assert.equal(envelopeCalls, 3);
  assert.equal(installCalls, 0);
  const [runName] = await fs.readdir(outRoot);
  const executeRoot = path.join(outRoot, runName, 'playbook-execute');
  assert.deepEqual((await fs.readdir(path.join(executeRoot, 'candidates'))).sort(),
    ['candidate-01', 'candidate-02', 'candidate-03']);
  for (const id of ['candidate-01', 'candidate-02', 'candidate-03']) {
    const failure = JSON.parse(await fs.readFile(path.join(executeRoot, 'candidates', id, 'failures/initial.json')));
    assert.equal(failure.code, 'P5_DESIGN_INVALID');
    assert.equal(JSON.stringify(failure).includes('private provider body'), false);
  }
  await assert.rejects(fs.access(path.join(executeRoot, 'selection.json')), { code: 'ENOENT' });
});

test('selection publication accepts an exact mixed accepted and initial-failed candidate set', async (t) => {
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-mixed-roots-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  let calls = 0;
  const result = await runExecutablePlaybookPipeline({ playbook: 'execute',
    prompt: 'Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base',
    mode: 'mock', outRoot, cwd: path.resolve(import.meta.dirname, '..'), seed: 424242, critics: true }, {
    createEnvelope: async (input) => {
      calls += 1;
      if (calls === 1) throw new Error('candidate-local-design-failure');
      return createFrozenDesignEnvelope(input);
    }
  });
  assert.equal(result.playbookExecution.candidates[0].current_chain_sha256, null);
  assert.equal(result.playbookExecution.candidates[0].repair_attempt_count, 0);
  assert.equal(result.playbookExecution.candidates[0].eligibility.status, 'replay-failed');
  assert.notEqual(result.playbookExecution.selected_candidate_id, 'candidate-01');
  await fs.access(result.artifacts.playbookExecutionSelection);

  const authority = await admitExecuteRun({ runDir: result.outputDir }); t.after(() => authority.close());
  const selectedFailed = JSON.parse(await fs.readFile(result.artifacts.playbookExecutionSelection));
  const failedRow = selectedFailed.candidates[0];
  failedRow.current_chain_sha256 = 'f'.repeat(64);
  failedRow.hard_qa_sha256 = 'e'.repeat(64);
  failedRow.p4_review_sha256 = 'd'.repeat(64);
  failedRow.eligibility.status = 'eligible';
  failedRow.eligibility.hard_qa_ok = true;
  selectedFailed.selected_candidate_id = failedRow.candidate_id;
  selectedFailed.selected_chain_sha256 = failedRow.current_chain_sha256;
  const selectionBytes = Buffer.from(stableJson(selectedFailed));
  const reportBytes = await fs.readFile(result.artifacts.playbookExecutionReport);
  const manifestBytes = Buffer.from(stableJson({ schema_version: 1,
    managed_paths: ['manifest.json', 'selection.json', 'selection-report.md'],
    artifact_hashes: { 'selection.json': sha256ForTest(selectionBytes), 'selection-report.md': sha256ForTest(reportBytes) } }));
  await assert.rejects(installExecuteSelection({ authority, files: {
    'manifest.json': manifestBytes, 'selection.json': selectionBytes, 'selection-report.md': reportBytes
  } }), { code: 'P5_INSTALL_FAILED' });
});

test('selected build authority drift fails before the existing installer can change a world', async (t) => {
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-install-drift-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  let installCalls = 0;
  await assert.rejects(runExecutablePlaybookPipeline({ playbook: 'execute',
    prompt: 'Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base',
    mode: 'mock', outRoot, cwd: path.resolve(import.meta.dirname, '..'), seed: 424242, critics: true }, {
    createSelectionAgent: () => ({ run(candidates, options) {
      const ranked = new CandidateSelectionAgent().run(candidates, options);
      const selected = candidates.find((row) => row.id === ranked.selected_candidate_id);
      writeFileSync(selected.result.artifacts.buildFunction, 'foreign mutation\n');
      return ranked;
    } }),
    installSelected: async () => { installCalls += 1; }
  }), { code: 'P5_INSTALL_FAILED' });
  assert.equal(installCalls, 0);
});

test('selected current QA and P4 bodies reject delete mutation and swap before installation', async (t) => {
  for (const kind of ['delete-hard-qa', 'delete-review', 'mutate-hard-qa', 'mutate-review', 'swap']) {
    const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), `p5-review-drift-${kind}-`));
    t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
    let installCalls = 0;
    await assert.rejects(runExecutablePlaybookPipeline({ playbook: 'execute',
      prompt: 'Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base',
      mode: 'mock', outRoot, cwd: path.resolve(import.meta.dirname, '..'), seed: 424242, critics: true }, {
      createSelectionAgent: () => ({ run(candidates, options) {
        const ranked = new CandidateSelectionAgent().run(candidates, options);
        const selected = candidates.find((row) => row.id === ranked.selected_candidate_id);
        const root = path.join(selected.result.outputDir, '..', '..', 'playbook-execute', 'candidates', selected.id);
        const current = JSON.parse(readFileSync(path.join(root, 'current-chain.json')));
        const revision = String(current.chain_revision).padStart(4, '0');
        const hardQaPath = path.join(root, `reviews/chain-${revision}-hard-qa.json`);
        const reviewPath = path.join(root, `reviews/chain-${revision}-review.json`);
        if (kind === 'delete-hard-qa') unlinkSync(hardQaPath);
        if (kind === 'delete-review') unlinkSync(reviewPath);
        if (kind === 'mutate-hard-qa') { chmodSync(hardQaPath, 0o600); writeFileSync(hardQaPath, '{}\n'); }
        if (kind === 'mutate-review') { chmodSync(reviewPath, 0o600); writeFileSync(reviewPath, '{}\n'); }
        if (kind === 'swap') {
          const hardQa = readFileSync(hardQaPath); const review = readFileSync(reviewPath);
          chmodSync(hardQaPath, 0o600); chmodSync(reviewPath, 0o600);
          writeFileSync(hardQaPath, review); writeFileSync(reviewPath, hardQa);
        }
        return ranked;
      } }),
      installSelected: async () => { installCalls += 1; }
    }), { code: 'P5_INSTALL_FAILED' }, kind);
    assert.equal(installCalls, 0, kind);
  }
});

test('controlled production semantics yield 01 eligible, 02 repaired, and 03 still ineligible after one replay', async (t) => {
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-lifecycle-matrix-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  let rankedIds;
  const hierarchyDefectVolumes = [
    { id: 'side-b', shape: 'box', role: 'secondary-mass', scale: [0.5, 0.5, 0.5], placement: { relation: 'attached-right', attach_to: 'main' } },
    { id: 'main', shape: 'box', role: 'primary-mass', scale: [0.4, 0.4, 0.4], placement: { relation: 'center' } },
    { id: 'side-a', shape: 'box', role: 'secondary-mass', scale: [0.3, 0.3, 0.3], placement: { relation: 'attached-left', attach_to: 'main' } }
  ];
  const result = await runExecutablePlaybookPipeline({ playbook: 'execute',
    prompt: 'Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base',
    mode: 'mock', outRoot, cwd: path.resolve(import.meta.dirname, '..'), seed: 424242, critics: true }, {
    createEnvelope: async (input) => {
      const envelope = structuredClone(await createFrozenDesignEnvelope(input));
      if (input.candidateId !== 'candidate-01') {
        envelope.repair_variant_preferences[0].variant_id = 'reduce-nondominant-secondary';
      }
      return envelope;
    },
    prepareDesign: async (input) => {
      const prepared = await prepareConstructionDesign(input);
      if (input.candidateId !== 'candidate-01') {
        prepared.architecture = structuredClone(prepared.architecture);
        prepared.architecture.volumes = structuredClone(hierarchyDefectVolumes);
        prepared.frozen_generator_context = buildFrozenGeneratorContext({ ...prepared.frozen_generator_context,
          architecture: prepared.architecture });
      }
      return prepared;
    },
    buildReview: async (input) => {
      const review = structuredClone(await buildDeterministicShadowReview(input));
      const candidateIndex = review.input.seed === 1432164 ? 1 : review.input.seed === 1440083 ? 2 : 3;
      if (candidateIndex === 1) {
        for (const row of review.assessments.slice(0, 15).filter((item) => item.status === 'violated')) satisfy(row);
      } else {
        for (const row of review.assessments.slice(1, 15).filter((item) => item.status === 'violated')) satisfy(row);
        violateHierarchy(review.assessments[2]);
      }
      refreshReview(review);
      return review;
    },
    compilePrepared: async (input) => {
      const compiled = await compilePreparedConstruction(input);
      if (input.prepared.seed === 1448002 && input.outputDir.includes('replay-candidate-03-attempt-01')) {
        compiled.blueprint.architecture.volumes = structuredClone(hierarchyDefectVolumes);
        await fs.writeFile(compiled.artifacts.blueprint, `${JSON.stringify(compiled.blueprint, null, 2)}\n`);
      }
      return compiled;
    },
    createSelectionAgent: () => ({ run(candidates, options) {
      rankedIds = candidates.map((row) => row.id);
      return new CandidateSelectionAgent().run(candidates, options);
    } })
  });
  assert.deepEqual(result.playbookExecution.candidates.map((row) => row.repair_attempt_count), [0, 1, 1]);
  assert.deepEqual(result.playbookExecution.candidates.map((row) => row.eligibility.status), ['eligible', 'eligible', 'unresolved-core-violation']);
  assert.deepEqual(rankedIds, ['candidate-01', 'candidate-02']);
});

function satisfy(row) {
  Object.assign(row, { status: 'satisfied', evidence_json_pointers: row.evidence_json_pointers.length ? row.evidence_json_pointers : ['/architecture'],
    observations: row.observations.length ? row.observations : ['controlled satisfied evidence'], missing_signals: [], unknown_ids: [],
    repair_operation_id: null, repair_target_layer: null, invalidates_layers: [] });
}

async function reviewedSubsetEnvelope(input, selectedRuleIds) {
  const response = structuredClone(await createFrozenDesignEnvelope({ ...input, mode: 'mock' }));
  response.selected_rule_ids = selectedRuleIds;
  return createFrozenDesignEnvelope({
    ...input,
    mode: 'llm',
    client: {
      isConfigured: () => true,
      chatJson: async () => response
    }
  });
}

function violateHierarchy(row) {
  Object.assign(row, { status: 'violated', evidence_json_pointers: ['/architecture/volumes'], observations: ['controlled hierarchy defect'],
    missing_signals: [], unknown_ids: [], repair_operation_id: 'repair:massing:strengthen-primary-volume',
    repair_target_layer: 'massing', invalidates_layers: ['structure', 'roof', 'facade'] });
}

function refreshReview(review) {
  const counts = (rows) => {
    const value = { satisfied: 0, violated: 0, unknown: 0, 'not-applicable': 0 };
    for (const row of rows) value[row.status] += 1;
    return value;
  };
  review.coverage = review.coverage.map((row) => ({ ...row,
    assessment_counts: counts(review.assessments.filter((item) => item.design_layer === row.layer)) }));
  review.summary = { assessment_count: 21, core_procedure_count: 15, case_pattern_count: 6,
    status_counts: counts(review.assessments),
    layer_status_counts: review.coverage.map((row) => ({ layer: row.layer, ...counts(review.assessments.filter((item) => item.design_layer === row.layer)) })),
    missing_evidence_rule_count: review.assessments.filter((row) => row.status === 'unknown').length };
}

function sha256ForTest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fileTreeBytes(root) {
  const files = {};
  await walk(root, '');
  return files;
  async function walk(current, prefix) {
    for (const name of (await fs.readdir(current)).sort()) {
      const target = path.join(current, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const stat = await fs.lstat(target);
      if (stat.isDirectory()) await walk(target, relative);
      else files[relative] = await fs.readFile(target);
    }
  }
}
