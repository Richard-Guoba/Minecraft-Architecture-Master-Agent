import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditExecuteDependencyBoundary } from '../src/playbook/execute/executeDependencyBoundary.js';
import { auditShadowDependencyBoundary } from '../src/playbook/shadow/shadowDependencyBoundary.js';
import { runPipeline } from '../src/pipeline.js';
import { runExecutablePlaybookPipeline } from '../src/playbook/execute/orchestrator.js';
import { createFrozenDesignEnvelope } from '../src/playbook/execute/designEnvelope.js';
import { buildFrozenGeneratorContext, prepareConstructionDesign } from '../src/construction/designStages.js';
import { compilePreparedConstruction } from '../src/construction/workflow.js';
import { buildDeterministicShadowReview } from '../src/playbook/shadow/runShadowReview.js';
import { CandidateSelectionAgent } from '../src/construction/agents/candidateSelectionAgent.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIXTURES = path.join(ROOT, 'test/fixtures/playbook-execute');

test('checked-in P5 graph is closed while the independent P4 boundary stays closed', async () => {
  const [execute, shadow] = await Promise.all([
    auditExecuteDependencyBoundary({ projectRoot: ROOT }),
    auditShadowDependencyBoundary({ projectRoot: ROOT })
  ]);
  assert.equal(execute.import_boundary_violation_count, 0);
  assert.equal(execute.import_boundary_unresolved_count, 0);
  assert.equal(execute.eligibility_authority_violation_count, 0);
  assert.equal(execute.eligibility_authority_unresolved_count, 0);
  assert.deepEqual(execute.allowed_noneligibility_dependencies, [
    'src/construction/agents/candidateSelectionAgent.js',
    'src/construction/agents/visualizationAgent.js'
  ]);
  assert.equal(shadow.import_boundary_violation_count, 0);
  assert.equal(shadow.import_boundary_unresolved_count, 0);
});

test('P5 dependency gate denies forbidden, dynamic, computed, unresolved, and symlink edges', async (t) => {
  for (const kind of ['direct', 'dynamic', 'computed', 'create-require', 'unresolved', 'symlink']) {
    await t.test(kind, async (t) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), `p5-dependency-${kind}-`));
      t.after(() => fs.rm(root, { recursive: true, force: true }));
      const entry = path.join(root, 'src/playbook/execute/entry.js');
      const forbidden = path.join(root, 'src/playbook/p6/visual.js');
      await fs.mkdir(path.dirname(entry), { recursive: true });
      await fs.mkdir(path.dirname(forbidden), { recursive: true });
      await fs.writeFile(path.join(root, 'src/playbook/execute/eligibility.js'), 'export const eligibility = true;\n');
      await fs.writeFile(forbidden, 'export const forbidden = true;\n');
      if (kind === 'direct') await fs.writeFile(entry, "import '../p6/visual.js';\n");
      if (kind === 'dynamic') await fs.writeFile(entry, "await import('../p6/visual.js');\n");
      if (kind === 'computed') await fs.writeFile(entry, "const target = '../p6/visual.js'; await import(target);\n");
      if (kind === 'create-require') await fs.writeFile(entry, "import { createRequire } from 'node:module'; const load = createRequire(import.meta.url); load('../p6/visual.js');\n");
      if (kind === 'unresolved') await fs.writeFile(entry, "import './missing.js';\n");
      if (kind === 'symlink') {
        await fs.symlink(forbidden, path.join(root, 'src/playbook/execute/escape.js'));
        await fs.writeFile(entry, "import './escape.js';\n");
      }
      const audit = await auditExecuteDependencyBoundary({ projectRoot: root });
      assert.equal(audit.import_boundary_violation_count + audit.import_boundary_unresolved_count > 0, true);
    });
  }
});

test('P5 dependency gate rejects every reserved visual and P6 namespace', async (t) => {
  for (const target of ['p6', 'image-model', 'screenshot', 'camera', 'fixed-view', 'blind-selection', 'human-preference', 'visual-scoring']) {
    await t.test(target, async (t) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), `p5-reserved-${target}-`));
      t.after(() => fs.rm(root, { recursive: true, force: true }));
      const entry = path.join(root, 'src/playbook/execute/entry.js');
      const forbidden = path.join(root, `src/playbook/${target}/entry.js`);
      await fs.mkdir(path.dirname(entry), { recursive: true });
      await fs.mkdir(path.dirname(forbidden), { recursive: true });
      await fs.writeFile(path.join(root, 'src/playbook/execute/eligibility.js'), 'export const eligibility = true;\n');
      await fs.writeFile(path.join(root, 'src/pipeline.js'), 'export const pipeline = true;\n');
      await fs.writeFile(entry, `import '../${target}/entry.js';\n`);
      await fs.writeFile(forbidden, 'export const forbidden = true;\n');
      const audit = await auditExecuteDependencyBoundary({ projectRoot: root });
      assert.equal(audit.import_boundary_violation_count, 1);
      assert.equal(audit.import_boundary_unresolved_count, 0);
    });
  }
});

test('checked-in mock acceptance inputs drive byte-stable positive execution with three five-layer trees', async (t) => {
  const fixture = JSON.parse(await fs.readFile(path.join(FIXTURES, 'medieval-positive.json')));
  assert.deepEqual(Object.keys(fixture), ['schema_version', 'prompt', 'seed', 'expected_candidate_count', 'expected_checkpoint_layers']);
  const outRoots = await Promise.all([0, 1].map(() => fs.mkdtemp(path.join(os.tmpdir(), 'p5-accept-positive-'))));
  t.after(() => Promise.all(outRoots.map((root) => fs.rm(root, { recursive: true, force: true }))));
  const results = [];
  for (const outRoot of outRoots) results.push(await runPipeline({ prompt: fixture.prompt, seed: fixture.seed, mode: 'mock', playbook: 'execute', outRoot }));
  for (const result of results) {
    assert.equal(result.playbookExecution.candidate_count, fixture.expected_candidate_count);
    assert.equal(result.playbookExecution.candidates.filter((row) => row.eligibility.status === 'eligible').length > 0, true);
    for (const row of result.playbookExecution.candidates) {
      const candidateRoot = path.join(result.outputDir, 'playbook-execute/candidates', row.candidate_id);
      const chain = JSON.parse(await fs.readFile(path.join(candidateRoot, 'current-chain.json')));
      assert.equal(chain.checkpoint_hashes.length, 5);
      assert.deepEqual(chain.checkpoint_hashes.map((item) => item.layer), fixture.expected_checkpoint_layers);
      if (row.eligibility.status === 'eligible') {
        assert.equal(row.eligibility.hard_qa_ok, true);
        assert.deepEqual(row.eligibility.unresolved_violated_core_rule_ids, []);
      }
    }
  }
  for (const id of ['candidate-01', 'candidate-02', 'candidate-03']) {
    const chainBytes = await Promise.all(results.map((result) => fs.readFile(path.join(result.outputDir, 'playbook-execute/candidates', id, 'current-chain.json'))));
    assert.deepEqual(chainBytes[1], chainBytes[0]);
  }
  assert.equal(results[0].llmUsage?.calls ?? 0, 0);
});

test('repairable mock fixture performs one exact massing replay and ranks only eligible rows', async (t) => {
  const repairable = JSON.parse(await fs.readFile(path.join(FIXTURES, 'medieval-repairable.json')));
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-accept-repair-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  let rankedIds;
  const volumes = repairable.initial_massing.volumes.map((row) => ({ ...row, shape: 'box' }));
  const result = await runExecutablePlaybookPipeline({ playbook: 'execute', prompt: repairable.prompt,
    mode: 'mock', outRoot, cwd: ROOT, seed: repairable.seed, critics: true }, {
    createClient: () => { throw new Error('replay/provider client forbidden'); },
    createEnvelope: async (input) => {
      const envelope = structuredClone(await createFrozenDesignEnvelope(input));
      if (input.candidateId !== 'candidate-01') envelope.repair_variant_preferences[0].variant_id = repairable.variant_id;
      return envelope;
    },
    prepareDesign: async (input) => {
      const prepared = await prepareConstructionDesign(input);
      if (input.candidateId !== 'candidate-01') {
        prepared.architecture = structuredClone(prepared.architecture);
        prepared.architecture.volumes = structuredClone(volumes);
        prepared.frozen_generator_context = buildFrozenGeneratorContext({ ...prepared.frozen_generator_context, architecture: prepared.architecture });
      }
      return prepared;
    },
    buildReview: async (input) => {
      const review = structuredClone(await buildDeterministicShadowReview(input));
      const index = review.input.seed === 1432164 ? 1 : review.input.seed === 1440083 ? 2 : 3;
      if (index === 1) for (const row of review.assessments.slice(0, 15).filter((item) => item.status === 'violated')) satisfy(row);
      else {
        for (const row of review.assessments.slice(1, 15).filter((item) => item.status === 'violated')) satisfy(row);
        violateHierarchy(review.assessments[2]);
      }
      refreshReview(review);
      return review;
    },
    compilePrepared: async (input) => {
      const compiled = await compilePreparedConstruction(input);
      if (input.prepared.seed === 1448002 && input.outputDir.includes('p5-replay-candidate-03-')) {
        compiled.blueprint.architecture.volumes = structuredClone(volumes);
        await fs.writeFile(compiled.artifacts.blueprint, `${JSON.stringify(compiled.blueprint, null, 2)}\n`);
      }
      return compiled;
    },
    createSelectionAgent: () => ({ run(candidates, options) {
      rankedIds = candidates.map((row) => row.id);
      return new CandidateSelectionAgent().run(candidates, options);
    } })
  });
  assert.deepEqual(result.playbookExecution.candidates.map((row) => row.repair_attempt_count), repairable.expected_attempt_counts);
  assert.deepEqual(result.playbookExecution.candidates.map((row) => row.eligibility.status), repairable.expected_statuses);
  assert.deepEqual(rankedIds, repairable.expected_ranked_candidate_ids);
  const repairedRoot = path.join(result.outputDir, 'playbook-execute/candidates/candidate-02');
  const initial = JSON.parse(await fs.readFile(path.join(repairedRoot, 'chains/chain-0001.json')));
  const replayed = JSON.parse(await fs.readFile(path.join(repairedRoot, 'current-chain.json')));
  assert.equal(replayed.chain_revision, 2);
  assert.equal(replayed.eligibility.status, 'eligible');
  assert.equal(replayed.eligibility.repair_budget_used, 1);
  assert.equal(replayed.checkpoint_hashes[0].checkpoint_sha256, initial.checkpoint_hashes[0].checkpoint_sha256);
  assert.deepEqual(replayed.checkpoint_hashes.slice(1).map((row) => row.layer), ['massing', 'structure', 'roof', 'facade']);
  assert.equal(replayed.checkpoint_hashes.slice(1).every((row, index) => row.checkpoint_sha256 !== initial.checkpoint_hashes[index + 1].checkpoint_sha256), true);
  const checkpointRevisions = await Promise.all(['brief/r0001.json', 'massing/r0002.json', 'structure/r0002.json', 'roof/r0002.json', 'facade/r0002.json']
    .map((relative) => fs.readFile(path.join(repairedRoot, 'checkpoints', relative)).then(JSON.parse)));
  assert.deepEqual(checkpointRevisions.map((checkpoint) => checkpoint.revision), [1, 2, 2, 2, 2]);
  assert.equal(checkpointRevisions[0].replay_origin, null);
  assert.equal(checkpointRevisions.slice(1).every((checkpoint) => checkpoint.replay_origin.base_chain_sha256 === replayed.parent_chain_sha256), true);
  assert.deepEqual((await fs.readdir(path.join(repairedRoot, 'repairs'))).sort(),
    ['attempt-01-patch.json', 'attempt-01-request.json', 'attempt-01-result.json']);
});

test('no-eligible mock fixture preserves three sanitized trees and installs nothing', async (t) => {
  const noEligible = JSON.parse(await fs.readFile(path.join(FIXTURES, 'medieval-no-eligible.json')));
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-accept-no-eligible-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  let installCount = 0;
  await assert.rejects(runExecutablePlaybookPipeline({ playbook: 'execute', prompt: noEligible.prompt,
    mode: 'mock', outRoot, cwd: ROOT, seed: noEligible.seed }, {
    createEnvelope: async () => { throw new Error('private provider bytes /outside/secret'); },
    installSelected: async () => { installCount += 1; }
  }), { code: 'P5_NO_ELIGIBLE_CANDIDATE', message: 'P5_NO_ELIGIBLE_CANDIDATE' });
  assert.equal(installCount, noEligible.expected_install_count);
  const [runName] = await fs.readdir(outRoot);
  const executeRoot = path.join(outRoot, runName, 'playbook-execute');
  assert.deepEqual((await fs.readdir(path.join(executeRoot, 'candidates'))).sort(), ['candidate-01', 'candidate-02', 'candidate-03']);
  for (const id of ['candidate-01', 'candidate-02', 'candidate-03']) {
    const failure = await fs.readFile(path.join(executeRoot, 'candidates', id, 'failures/initial.json'), 'utf8');
    assert.equal(failure.includes('private provider bytes'), false);
    await assert.rejects(fs.access(path.join(executeRoot, 'candidates', id, 'current-chain.json')), { code: 'ENOENT' });
  }
  await assert.rejects(fs.access(path.join(executeRoot, 'selection.json')), { code: 'ENOENT' });
  assert.equal(noEligible.expected_selected_candidate_id, null);
});

test('public P5 evidence makes no score, aesthetic, quality, or P6-open claim', async () => {
  const paths = ['README.md', 'docs/architecture-playbook/README.md', 'docs/architecture-playbook/reports/p5-executable-design-layer.md'];
  const text = (await Promise.all(paths.map((file) => fs.readFile(path.join(ROOT, file), 'utf8')))).join('\n');
  assert.match(text, /default-off|默认关闭/iu);
  assert.match(text, /P6.*(?:closed|未开放)/iu);
  assert.match(text, /no playbook score|没有.*秘籍评分/iu);
  assert.match(text, /does not prove.*(?:quality|aesthetic)|不证明.*(?:质量|审美)/iu);
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
