import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runExecutablePlaybookPipeline } from '../src/playbook/execute/orchestrator.js';
import { runPipeline } from '../src/pipeline.js';
import { stableJson } from '../src/playbook/shadow/canonical.js';
import { validateInitialCandidateFailure } from '../src/playbook/execute/contracts.js';
import { CandidateSelectionAgent } from '../src/construction/agents/candidateSelectionAgent.js';
import { buildFrozenGeneratorContext, prepareConstructionDesign } from '../src/construction/designStages.js';
import { compilePreparedConstruction } from '../src/construction/workflow.js';
import { buildDeterministicShadowReview } from '../src/playbook/shadow/runShadowReview.js';
import { createFrozenDesignEnvelope } from '../src/playbook/execute/designEnvelope.js';
import {
  admitExecuteRun,
  inspectCandidateEvidence,
  installInitialCandidateFailure
} from '../src/playbook/execute/storage.js';

test('execute orchestration rejects unknown dependency authority before work', async () => {
  await assert.rejects(
    runExecutablePlaybookPipeline({}, { unexpected: () => {} }),
    { code: 'P5_AUTHORITY_INVALID' }
  );
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

test('real mock execution creates exactly three five-layer evidence trees and one selection', async (t) => {
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-three-candidates-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  const result = await runPipeline({ prompt: 'Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base',
    mode: 'mock', outRoot, seed: 424242, playbook: 'execute' });
  assert.equal(result.playbookExecution.mode, 'execute');
  assert.equal(result.playbookExecution.candidate_count, 3);
  assert.deepEqual(result.playbookExecution.candidates.map((row) => row.seed), [1432164, 1440083, 1448002]);
  assert.ok(['candidate-01', 'candidate-02', 'candidate-03'].includes(result.playbookExecution.selected_candidate_id));
  assert.deepEqual(result.playbookExecution.candidates.map((row) => row.repair_attempt_count), [1, 1, 0]);
  assert.deepEqual(result.playbookExecution.candidates.map((row) => row.eligibility.status), ['repair-invalid', 'repair-invalid', 'eligible']);
  assert.equal(result.playbookExecution.candidates.filter((row) => row.eligibility.status === 'eligible').length, 1);
  assert.equal(result.playbookExecution.selected_candidate_id, 'candidate-03');
  for (const id of ['candidate-01', 'candidate-02', 'candidate-03']) {
    const root = path.join(result.outputDir, 'playbook-execute/candidates', id);
    const evidence = await fs.readdir(root);
    assert.ok(evidence.includes('current-chain.json') || evidence.includes('failures'));
    if (evidence.includes('current-chain.json')) {
      const chain = JSON.parse(await fs.readFile(path.join(root, 'current-chain.json')));
      assert.equal(chain.checkpoint_hashes.length, 5);
    }
  }
  assert.deepEqual(Object.keys(result.artifacts).filter((key) => key.startsWith('playbookExecution')).sort(),
    ['playbookExecutionManifest', 'playbookExecutionReport', 'playbookExecutionSelection']);
  const report = await fs.readFile(result.artifacts.playbookExecutionReport, 'utf8');
  assert.equal(/playbook_score|quality_improvement|quality claim/iu.test(report), false);
});

test('no eligible candidate retains three immutable failures and never installs or publishes selection', async (t) => {
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-no-eligible-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  let envelopeCalls = 0;
  let installCalls = 0;
  await assert.rejects(runExecutablePlaybookPipeline({ playbook: 'execute', prompt: 'medieval house', mode: 'mock',
    outRoot, cwd: path.resolve(import.meta.dirname, '..'), seed: 9 }, {
    createEnvelope: async () => { envelopeCalls += 1; throw new Error('private provider body'); },
    installSelected: async () => { installCalls += 1; }
  }), { code: 'P5_NO_ELIGIBLE_CANDIDATE', message: 'P5_NO_ELIGIBLE_CANDIDATE' });
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
      if (input.prepared.seed === 1448002 && input.outputDir.includes('p5-replay-candidate-03-')) {
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
