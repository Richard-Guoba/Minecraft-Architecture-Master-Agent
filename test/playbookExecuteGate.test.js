import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
import { replayCandidate } from '../src/playbook/execute/replay.js';
import { stableJson } from '../src/playbook/shadow/canonical.js';

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
    'src/construction/agents/templateAestheticReviewAgent.js',
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
      const forbidden = path.join(root, 'src/construction/agents/visualScoringAgent.js');
      await fs.mkdir(path.dirname(entry), { recursive: true });
      await fs.mkdir(path.dirname(forbidden), { recursive: true });
      await fs.writeFile(path.join(root, 'src/playbook/execute/eligibility.js'), 'export const eligibility = true;\n');
      await fs.writeFile(forbidden, 'export const forbidden = true;\n');
      const specifier = '../../construction/agents/visualScoringAgent.js';
      if (kind === 'direct') await fs.writeFile(entry, `import '${specifier}';\n`);
      if (kind === 'dynamic') await fs.writeFile(entry, `await import('${specifier}');\n`);
      if (kind === 'computed') await fs.writeFile(entry, `const target = '${specifier}'; await import(target);\n`);
      if (kind === 'create-require') await fs.writeFile(entry, `import { createRequire } from 'node:module'; const load = createRequire(import.meta.url); load('${specifier}');\n`);
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

test('P5 dependency gate closes repository-wide P6 and visual scoring paths with exact legacy exceptions', async (t) => {
  for (const target of [
    'src/p6/visual.js',
    'src/construction/agents/visualScoringAgent.js',
    'src/evaluation/fixedViewScorer.js',
    'src/tools/screenshotCamera.js',
    'src/selection/blindSelection.js',
    'src/preferences/humanPreferenceModel.js',
    'src/construction/agents/candidateSelectionAgentV2.js',
    'src/construction/agents/visualizationAgentV2.js'
  ]) {
    await t.test(`reject ${target}`, async (t) => {
      const root = await dependencyRoot(t);
      await writeFixture(root, target, 'export const forbidden = true;\n');
      await writeFixture(root, 'src/playbook/execute/entry.js', `import '${relativeImport('src/playbook/execute/entry.js', target)}';\n`);
      const audit = await auditExecuteDependencyBoundary({ projectRoot: root });
      assert.equal(audit.import_boundary_violation_count, 1);
      assert.equal(audit.import_boundary_unresolved_count, 0);
    });
  }
  await t.test('allow the three exact legacy dependencies only outside eligibility', async (t) => {
    const root = await dependencyRoot(t);
    await writeFixture(root, 'src/construction/agents/candidateSelectionAgent.js', 'export const ranker = true;\n');
    await writeFixture(root, 'src/construction/agents/templateAestheticReviewAgent.js', 'export const scorer = true;\n');
    await writeFixture(root, 'src/construction/agents/visualizationAgent.js', 'export const preview = true;\n');
    await writeFixture(root, 'src/playbook/execute/entry.js', [
      "import '../../construction/agents/candidateSelectionAgent.js';",
      "import '../../construction/agents/templateAestheticReviewAgent.js';",
      "import '../../construction/agents/visualizationAgent.js';",
      ''
    ].join('\n'));
    const audit = await auditExecuteDependencyBoundary({ projectRoot: root });
    assert.equal(audit.import_boundary_violation_count, 0);
    assert.equal(audit.import_boundary_unresolved_count, 0);
    assert.equal(audit.eligibility_authority_violation_count, 0);
  });
  await t.test('deny all three exact exceptions when eligibility imports them', async (t) => {
    const root = await dependencyRoot(t);
    await writeFixture(root, 'src/construction/agents/candidateSelectionAgent.js', 'export const ranker = true;\n');
    await writeFixture(root, 'src/construction/agents/templateAestheticReviewAgent.js', 'export const scorer = true;\n');
    await writeFixture(root, 'src/construction/agents/visualizationAgent.js', 'export const preview = true;\n');
    await writeFixture(root, 'src/playbook/execute/entry.js', 'export const execute = true;\n');
    await writeFixture(root, 'src/playbook/execute/eligibility.js', [
      "import '../../construction/agents/candidateSelectionAgent.js';",
      "import '../../construction/agents/templateAestheticReviewAgent.js';",
      "import '../../construction/agents/visualizationAgent.js';",
      ''
    ].join('\n'));
    const audit = await auditExecuteDependencyBoundary({ projectRoot: root });
    assert.equal(audit.import_boundary_violation_count, 0);
    assert.equal(audit.eligibility_authority_violation_count, 3);
    assert.equal(audit.eligibility_authority_unresolved_count, 0);
  });
  await t.test('deny aliases to the three exact legacy dependency inodes', async (t) => {
    const root = await dependencyRoot(t);
    const targets = [
      ['src/construction/agents/candidateSelectionAgent.js', 'src/utils/ranker.js'],
      ['src/construction/agents/templateAestheticReviewAgent.js', 'src/utils/scorer.js'],
      ['src/construction/agents/visualizationAgent.js', 'src/utils/preview.js']
    ];
    for (const [target, alias] of targets) {
      await writeFixture(root, target, 'export const legacy = true;\n');
      const aliasPath = path.join(root, alias);
      await fs.mkdir(path.dirname(aliasPath), { recursive: true });
      await fs.symlink(path.join(root, target), aliasPath);
    }
    await writeFixture(root, 'src/playbook/execute/entry.js', targets
      .map(([, alias]) => `import '${relativeImport('src/playbook/execute/entry.js', alias)}';`)
      .join('\n'));
    const audit = await auditExecuteDependencyBoundary({ projectRoot: root });
    assert.equal(audit.import_boundary_violation_count, 3);
    assert.equal(audit.import_boundary_unresolved_count, 0);
  });
});

test('P5 dependency gate classifies logical and real paths for every visual-authority variant', async (t) => {
  for (const target of [
    'src/phases/p6/evaluator.js',
    'src/phases/p6Evaluator.js',
    'src/providers/imageClient.js',
    'src/scoring/aestheticEvaluator.js',
    'src/construction/agents/candidateSelectionAgent/index.js',
    'src/construction/agents/visualizationAgent/index.js'
  ]) {
    await t.test(`reject ${target}`, async (t) => {
      const root = await dependencyRoot(t);
      await writeFixture(root, target, 'export const forbidden = true;\n');
      await writeFixture(root, 'src/playbook/execute/entry.js',
        `import '${relativeImport('src/playbook/execute/entry.js', target)}';\n`);
      const audit = await auditExecuteDependencyBoundary({ projectRoot: root });
      assert.equal(audit.import_boundary_violation_count, 1);
      assert.equal(audit.import_boundary_unresolved_count, 0);
    });
  }

  await t.test('allow helper by its own logical path', async (t) => {
    const root = await dependencyRoot(t);
    await writeFixture(root, 'src/utils/helper.js', 'export const helper = true;\n');
    await writeFixture(root, 'src/playbook/execute/entry.js', "import '../../utils/helper.js';\n");
    const audit = await auditExecuteDependencyBoundary({ projectRoot: root });
    assert.equal(audit.import_boundary_violation_count, 0);
    assert.equal(audit.import_boundary_unresolved_count, 0);
  });

  await t.test('reject forbidden logical P6 symlink without forbidding its helper inode', async (t) => {
    const root = await dependencyRoot(t);
    const helper = path.join(root, 'src/utils/helper.js');
    const logicalP6 = path.join(root, 'src/p6/evaluator.js');
    await writeFixture(root, 'src/utils/helper.js', 'export const helper = true;\n');
    await fs.mkdir(path.dirname(logicalP6), { recursive: true });
    await fs.symlink(helper, logicalP6);
    await writeFixture(root, 'src/playbook/execute/entry.js', "import '../../p6/evaluator.js';\n");
    const audit = await auditExecuteDependencyBoundary({ projectRoot: root });
    assert.equal(audit.import_boundary_violation_count, 1);
    assert.equal(audit.import_boundary_unresolved_count, 0);
    assert.deepEqual(audit.forbidden_dependency_imports,
      ['EXECUTE_FORBIDDEN_MODULE:src/p6/evaluator.js -> src/utils/helper.js']);
  });
});

test('P5 dependency gate uses bounded semantic tokens for visual authority', async (t) => {
  for (const target of [
    'src/evaluation/visual.js',
    'src/visual/index.js',
    'src/evaluation/visualReview.js',
    'src/models/aestheticModel.js',
    'src/evaluation/Visual-Scoring.js',
    'src/evaluation/visual_evaluation.js',
    'src/models/AestheticReview.js',
    'src/construction/agents/templateAestheticReviewAgentV2.js',
    'src/construction/agents/templateAestheticReviewAgent/index.js',
    'src/providers/Image_ModelClient.js',
    'src/tools/ScreenShotCamera.js',
    'src/fixed_view/selector.js',
    'src/blind-selection/agent.js',
    'src/Human_Preference/model.js',
    'src/phases/P6Review.js'
  ]) {
    await t.test(`reject ${target}`, async (t) => {
      const root = await dependencyRoot(t);
      await writeFixture(root, target, 'export const forbidden = true;\n');
      await writeFixture(root, 'src/playbook/execute/entry.js',
        `import '${relativeImport('src/playbook/execute/entry.js', target)}';\n`);
      const audit = await auditExecuteDependencyBoundary({ projectRoot: root });
      assert.equal(audit.import_boundary_violation_count, 1);
      assert.equal(audit.import_boundary_unresolved_count, 0);
    });
  }

  for (const target of [
    'src/utils/provisional.js',
    'src/models/imagery.js',
    'src/tools/cameraderie.js',
    'src/layout/fixedWidth.js',
    'src/selection/blindfold.js',
    'src/preferences/humanity.js',
    'src/reviews/aesthete.js'
  ]) {
    await t.test(`allow unrelated ${target}`, async (t) => {
      const root = await dependencyRoot(t);
      await writeFixture(root, target, 'export const allowed = true;\n');
      await writeFixture(root, 'src/playbook/execute/entry.js',
        `import '${relativeImport('src/playbook/execute/entry.js', target)}';\n`);
      const audit = await auditExecuteDependencyBoundary({ projectRoot: root });
      assert.equal(audit.import_boundary_violation_count, 0);
      assert.equal(audit.import_boundary_unresolved_count, 0);
    });
  }
});

test('P5 dependency gate canonicalizes compound authority identifiers without substring matches', async (t) => {
  for (const target of [
    'src/phases/p-6/review.js',
    'src/phases/p_6_review.js',
    'src/tools/screen-shot-review.js',
    'src/tools/screen_shot_review.js',
    'src/tools/ScreenShotReview.js',
    'src/evaluation/visualreview.js',
    'src/models/aestheticreview.js',
    'src/tools/screenshotreview.js',
    'src/providers/imagemodelclient.js',
    'src/evaluation/visualevaluationmodel.js',
    'src/models/aestheticscoringmodel.js',
    'src/layout/fixedviewscorer.js',
    'src/selection/blindselectionagent.js',
    'src/preferences/humanpreferencemodel.js',
    'src/construction/agents/candidateselectionagent.js',
    'src/construction/agents/templateaestheticreviewagent.js',
    'src/construction/agents/visualizationagent.js'
  ]) {
    await t.test(`reject ${target}`, async (t) => {
      const root = await dependencyRoot(t);
      await writeFixture(root, target, 'export const forbidden = true;\n');
      await writeFixture(root, 'src/playbook/execute/entry.js',
        `import '${relativeImport('src/playbook/execute/entry.js', target)}';\n`);
      const audit = await auditExecuteDependencyBoundary({ projectRoot: root });
      assert.equal(audit.import_boundary_violation_count, 1);
      assert.equal(audit.import_boundary_unresolved_count, 0);
    });
  }

  for (const target of [
    'src/phases/p-60-review.js',
    'src/tools/screen-shotgun-review.js',
    'src/reviews/provisionalreview.js',
    'src/models/imagerymodel.js',
    'src/tools/cameraderiereview.js',
    'src/layout/fixedwidthview.js',
    'src/selection/blindfoldselection.js',
    'src/preferences/humanitypreference.js',
    'src/reviews/aesthetereview.js'
  ]) {
    await t.test(`allow adjacent word ${target}`, async (t) => {
      const root = await dependencyRoot(t);
      await writeFixture(root, target, 'export const allowed = true;\n');
      await writeFixture(root, 'src/playbook/execute/entry.js',
        `import '${relativeImport('src/playbook/execute/entry.js', target)}';\n`);
      const audit = await auditExecuteDependencyBoundary({ projectRoot: root });
      assert.equal(audit.import_boundary_violation_count, 0);
      assert.equal(audit.import_boundary_unresolved_count, 0);
    });
  }
});

test('P5 dependency gate normalizes terminal conventional versions before authority decomposition', async (t) => {
  for (const target of [
    'src/evaluation/visualreviewv2.js',
    'src/providers/imageclientv2.js',
    'src/tools/screenshotreviewv2.js',
    'src/models/aestheticreviewv2.js',
    'src/construction/agents/candidateselectionagentv2.js',
    'src/construction/agents/visualizationagentv2.js',
    'src/evaluation/visualreviewv1.js',
    'src/providers/imageclientv12.js',
    'src/models/aestheticreviewv999.js',
    'src/evaluation/visualReviewV2.js',
    'src/evaluation/VisualReviewV2.js',
    'src/evaluation/visual-review-v2.js',
    'src/evaluation/visual_review_v2.js',
    'src/evaluation/visualreview-v2.js',
    'src/evaluation/visualreview_v2.js',
    'src/evaluation/visualreviewv2/index.js',
    'src/phases/p6v2/review.js'
  ]) {
    await t.test(`reject ${target}`, async (t) => {
      const root = await dependencyRoot(t);
      await writeFixture(root, target, 'export const forbidden = true;\n');
      await writeFixture(root, 'src/playbook/execute/entry.js',
        `import '${relativeImport('src/playbook/execute/entry.js', target)}';\n`);
      const audit = await auditExecuteDependencyBoundary({ projectRoot: root });
      assert.equal(audit.import_boundary_violation_count, 1);
      assert.equal(audit.import_boundary_unresolved_count, 0);
    });
  }

  for (const target of [
    'src/evaluation/visualreviewv0.js',
    'src/evaluation/visualreviewv01.js',
    'src/evaluation/visualreviewv1000.js',
    'src/phases/p60v2/review.js',
    'src/tools/screen-shotgun-review-v2.js',
    'src/reviews/provisionalreviewv2.js',
    'src/models/imagerymodelv2.js',
    'src/tools/cameraderiereviewv2.js',
    'src/layout/fixedwidthviewv2.js',
    'src/selection/blindfoldselectionv2.js',
    'src/preferences/humanitypreferencev2.js',
    'src/reviews/aesthetereviewv2.js'
  ]) {
    await t.test(`allow versioned adjacent word ${target}`, async (t) => {
      const root = await dependencyRoot(t);
      await writeFixture(root, target, 'export const allowed = true;\n');
      await writeFixture(root, 'src/playbook/execute/entry.js',
        `import '${relativeImport('src/playbook/execute/entry.js', target)}';\n`);
      const audit = await auditExecuteDependencyBoundary({ projectRoot: root });
      assert.equal(audit.import_boundary_violation_count, 0);
      assert.equal(audit.import_boundary_unresolved_count, 0);
    });
  }
});

test('controlled-seam positive fixture produces exactly three eligible zero-repair five-layer candidates', async (t) => {
  const fixture = JSON.parse(await fs.readFile(path.join(FIXTURES, 'medieval-positive.json')));
  assert.deepEqual(Object.keys(fixture), ['schema_version', 'prompt', 'seed', 'expected_candidate_count', 'expected_checkpoint_layers']);
  const roots = await acceptanceRoots(t, 'p5-accept-positive-');
  const observed = { ranked: [], replays: [] };
  const result = await runExecutablePlaybookPipeline(executeOptions(fixture, roots.outRoot, roots.worldRoot),
    scenarioDependencies({ scenario: 'positive', observed }));
  assert.equal(result.playbookExecution.candidate_count, fixture.expected_candidate_count);
  assert.deepEqual(result.playbookExecution.candidates.map((row) => row.eligibility.status), ['eligible', 'eligible', 'eligible']);
  assert.deepEqual(result.playbookExecution.candidates.map((row) => row.repair_attempt_count), [0, 0, 0]);
  assert.deepEqual(observed.ranked, ['candidate-01', 'candidate-02', 'candidate-03']);
  assert.deepEqual(observed.replays, []);
  assert.equal(observed.installCount, 1);
  for (const row of result.playbookExecution.candidates) {
    assert.equal(row.eligibility.hard_qa_ok, true);
    assert.deepEqual(row.eligibility.unresolved_violated_core_rule_ids, []);
    const candidateRoot = path.join(result.outputDir, 'playbook-execute/candidates', row.candidate_id);
    const pointer = JSON.parse(await fs.readFile(path.join(candidateRoot, 'current-chain.json')));
    const chain = JSON.parse(await fs.readFile(path.join(
      candidateRoot, 'chains', `chain-${String(pointer.chain_revision).padStart(4, '0')}.json`
    )));
    assert.equal(chain.chain_revision, 1);
    assert.deepEqual(chain.checkpoint_hashes.map((item) => item.layer), fixture.expected_checkpoint_layers);
  }
  await roots.assertPreexistingUnchanged();
});

test('controlled-seam repairable fixture is provider-free and byte-identical across exact massing replays', async (t) => {
  const repairable = JSON.parse(await fs.readFile(path.join(FIXTURES, 'medieval-repairable.json')));
  const runs = [];
  for (let index = 0; index < 2; index += 1) {
    const roots = await acceptanceRoots(t, `p5-accept-repair-${index}-`);
    const observed = { ranked: [], replays: [], providerCalls: 0 };
    const result = await runExecutablePlaybookPipeline(executeOptions(repairable, roots.outRoot, roots.worldRoot),
      scenarioDependencies({ scenario: 'repairable', fixture: repairable, observed }));
    await roots.assertPreexistingUnchanged();
    runs.push({ result, observed, evidence: await repairedEvidence(result, observed) });
  }
  for (const { result, observed, evidence } of runs) {
    assert.deepEqual(result.playbookExecution.candidates.map((row) => row.repair_attempt_count), repairable.expected_attempt_counts);
    assert.deepEqual(result.playbookExecution.candidates.map((row) => row.eligibility.status), repairable.expected_statuses);
    assert.deepEqual(observed.ranked, repairable.expected_ranked_candidate_ids);
    assert.equal(observed.providerCalls, 0);
    assert.equal(observed.installCount, 1);
    assert.deepEqual(
      await fs.readdir(path.join(result.outputDir, 'candidate-work')),
      [path.basename(result.selectedOutputDir)]
    );
    for (const candidateId of observed.ranked) {
      const ranked = result.playbookExecution.candidates.find((row) => row.candidate_id === candidateId);
      assert.equal(ranked.eligibility.hard_qa_ok, true);
      assert.deepEqual(ranked.eligibility.unresolved_violated_core_rule_ids, []);
    }
    assert.deepEqual(observed.replays.map((row) => row.candidate_id), ['candidate-02', 'candidate-03']);
    assert.equal(evidence.chain.chain_revision, 2);
    assert.equal(evidence.chain.eligibility.status, 'eligible');
    assert.equal(evidence.chain.eligibility.repair_budget_used, 1);
    assert.equal(evidence.chain.checkpoint_hashes[0].checkpoint_sha256, evidence.initial.checkpoint_hashes[0].checkpoint_sha256);
    assert.equal(evidence.chain.checkpoint_hashes.slice(1).every((row, index) => row.checkpoint_sha256 !== evidence.initial.checkpoint_hashes[index + 1].checkpoint_sha256), true);
    assert.deepEqual(evidence.revisions, [1, 2, 2, 2, 2]);
    assert.deepEqual(evidence.replayOrigins, [null, 'massing', 'structure', 'roof', 'facade']);
    assert.equal(evidence.chain.blueprint_sha256, evidence.blueprintSha256);
    assert.deepEqual(evidence.persistedArtifactHashes, evidence.regeneratedArtifactHashes);
  }
  assert.deepEqual(runs[1].evidence.deterministicBytes, runs[0].evidence.deterministicBytes);
});

test('controlled-seam no-eligible fixture exhausts one bounded replay for every unresolved candidate', async (t) => {
  const noEligible = JSON.parse(await fs.readFile(path.join(FIXTURES, 'medieval-no-eligible.json')));
  const roots = await acceptanceRoots(t, 'p5-accept-no-eligible-');
  const observed = { ranked: [], replays: [], installCount: 0, providerCalls: 0 };
  await assert.rejects(runExecutablePlaybookPipeline(executeOptions(noEligible, roots.outRoot, roots.worldRoot),
    scenarioDependencies({ scenario: 'no-eligible', fixture: noEligible, observed })),
  { code: 'P5_NO_ELIGIBLE_CANDIDATE', message: 'P5_NO_ELIGIBLE_CANDIDATE' });
  assert.equal(observed.installCount, noEligible.expected_install_count);
  assert.equal(observed.providerCalls, 0);
  assert.deepEqual(observed.ranked, []);
  assert.deepEqual(observed.replays.map((row) => row.candidate_id), ['candidate-01', 'candidate-02', 'candidate-03']);
  const runNames = (await fs.readdir(roots.outRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== 'pre-existing')
    .map((entry) => entry.name);
  assert.equal(runNames.length, 1);
  const executeRoot = path.join(roots.outRoot, runNames[0], 'playbook-execute');
  assert.deepEqual((await fs.readdir(path.join(executeRoot, 'candidates'))).sort(), ['candidate-01', 'candidate-02', 'candidate-03']);
  for (const id of ['candidate-01', 'candidate-02', 'candidate-03']) {
    const root = path.join(executeRoot, 'candidates', id);
    const pointer = JSON.parse(await fs.readFile(path.join(root, 'current-chain.json')));
    const chain = JSON.parse(await fs.readFile(path.join(
      root, 'chains', `chain-${String(pointer.chain_revision).padStart(4, '0')}.json`
    )));
    assert.equal(chain.chain_revision, 2);
    assert.equal(chain.eligibility.status, 'unresolved-core-violation');
    assert.equal(chain.eligibility.repair_budget_used, 1);
    assert.deepEqual((await fs.readdir(path.join(root, 'repairs'))).sort(),
      ['attempt-01-patch.json', 'attempt-01-request.json', 'attempt-01-result.json']);
    await assert.rejects(fs.access(path.join(root, 'failures/initial.json')), { code: 'ENOENT' });
  }
  assert.deepEqual(await fs.readdir(path.join(roots.outRoot, runNames[0], 'candidate-work')), []);
  await assert.rejects(fs.access(path.join(executeRoot, 'selection.json')), { code: 'ENOENT' });
  assert.equal(noEligible.expected_selected_candidate_id, null);
  await roots.assertPreexistingUnchanged();
});

test('controlled-seam injected repair failure preserves accepted pointer inode and unrelated world bytes', async (t) => {
  const fixture = JSON.parse(await fs.readFile(path.join(FIXTURES, 'medieval-repairable.json')));
  const outRoot = await temporaryRoot(t, 'p5-accept-rollback-out-');
  const worldRoot = await temporaryRoot(t, 'p5-accept-rollback-world-');
  const unrelatedOut = path.join(outRoot, 'pre-existing.bin');
  const unrelatedWorld = path.join(worldRoot, 'region.bin');
  await fs.writeFile(unrelatedOut, Buffer.from([0, 1, 2, 255]));
  await fs.writeFile(unrelatedWorld, Buffer.from('world-before\n'));
  const observed = { ranked: [], replays: [], rollback: null, outRoot };
  const result = await runExecutablePlaybookPipeline({ ...executeOptions(fixture, outRoot), datapacksDir: worldRoot },
    scenarioDependencies({ scenario: 'rollback', fixture, observed }));
  assert.ok(result.playbookExecution.selected_candidate_id);
  assert.ok(observed.rollback);
  assert.deepEqual(observed.rollback.afterBytes, observed.rollback.beforeBytes);
  assert.equal(observed.rollback.afterSha256, observed.rollback.beforeSha256);
  assert.equal(observed.rollback.afterIno, observed.rollback.beforeIno);
  assert.deepEqual(await fs.readFile(unrelatedOut), Buffer.from([0, 1, 2, 255]));
  assert.deepEqual(await fs.readFile(unrelatedWorld), Buffer.from('world-before\n'));
  const failure = JSON.parse(await fs.readFile(observed.rollback.failurePath));
  assert.deepEqual(await fs.readdir(path.dirname(observed.rollback.failurePath)), ['attempt-01.json']);
  assert.deepEqual(Object.keys(failure), ['attempt', 'base_chain_sha256', 'candidate_id', 'code', 'current_chain_sha256', 'repair_transaction_sha256', 'schema_version']);
  assert.equal(failure.code, 'P5_REPLAY_FAILED');
  assert.equal(failure.current_chain_sha256, failure.base_chain_sha256);
  assert.equal(JSON.stringify(failure).includes('private'), false);
});

test('public P5 evidence makes no score, aesthetic, quality, or P6-open claim', async () => {
  const paths = ['README.md', 'docs/architecture-playbook/README.md', 'docs/architecture-playbook/reports/p5-executable-design-layer.md'];
  const text = (await Promise.all(paths.map((file) => fs.readFile(path.join(ROOT, file), 'utf8')))).join('\n');
  assert.match(text, /default-off|默认关闭/iu);
  assert.match(text, /P6.*(?:closed|未开放)/iu);
  assert.match(text, /no playbook score|没有.*秘籍评分/iu);
  assert.match(text, /does not prove.*(?:quality|aesthetic)|不证明.*(?:质量|审美)/iu);
});

function executeOptions(fixture, outRoot, worldRoot) {
  return {
    playbook: 'execute', prompt: fixture.prompt, mode: 'mock', outRoot,
    cwd: ROOT, seed: fixture.seed, critics: true, datapacksDir: worldRoot
  };
}

function scenarioDependencies({ scenario, fixture, observed }) {
  const volumes = (fixture?.initial_massing?.volumes || [
    { id: 'side-b', role: 'secondary-mass', scale: [0.5, 0.5, 0.5], placement: { relation: 'attached-right', attach_to: 'main' } },
    { id: 'main', role: 'primary-mass', scale: [0.4, 0.4, 0.4], placement: { relation: 'center' } },
    { id: 'side-a', role: 'secondary-mass', scale: [0.3, 0.3, 0.3], placement: { relation: 'attached-left', attach_to: 'main' } }
  ]).map((row) => ({ ...row, shape: 'box' }));
  const candidateIndex = (seed) => seed === 1432164 ? 1 : seed === 1440083 ? 2 : 3;
  const initiallyDefective = (index) => scenario === 'no-eligible' || scenario === 'repairable' && index > 1 || scenario === 'rollback' && index === 2;
  const retainDefectAfterReplay = (index) => scenario === 'no-eligible' || scenario === 'repairable' && index === 3;
  return {
    createClient() {
      observed.providerCalls = (observed.providerCalls || 0) + 1;
      throw new Error('provider creation is forbidden');
    },
    async createEnvelope(input) {
      const envelope = structuredClone(await createFrozenDesignEnvelope(input));
      if (initiallyDefective(Number(input.candidateId.at(-1)))) {
        envelope.repair_variant_preferences[0].variant_id = 'reduce-nondominant-secondary';
      }
      return envelope;
    },
    async prepareDesign(input) {
      const prepared = await prepareConstructionDesign(input);
      if (initiallyDefective(Number(input.candidateId.at(-1)))) {
        prepared.architecture = structuredClone(prepared.architecture);
        prepared.architecture.volumes = structuredClone(volumes);
        prepared.frozen_generator_context = buildFrozenGeneratorContext({
          ...prepared.frozen_generator_context,
          architecture: prepared.architecture
        });
      }
      return prepared;
    },
    async buildReview(input) {
      const review = structuredClone(await buildDeterministicShadowReview(input));
      const index = candidateIndex(review.input.seed);
      for (const row of review.assessments.slice(0, 15).filter((item) => item.status === 'violated')) satisfy(row);
      if (initiallyDefective(index)) violateHierarchy(review.assessments[2]);
      refreshReview(review);
      return review;
    },
    async compilePrepared(input) {
      const compiled = await compilePreparedConstruction(input);
      const index = candidateIndex(input.prepared.seed);
      if (input.outputDir.includes(`replay-candidate-0${index}-`) && retainDefectAfterReplay(index)) {
        compiled.blueprint.architecture.volumes = structuredClone(volumes);
        await fs.writeFile(compiled.artifacts.blueprint, `${JSON.stringify(compiled.blueprint, null, 2)}\n`);
      }
      return compiled;
    },
    async replay(input) {
      if (scenario === 'rollback' && input.candidateId === 'candidate-02') {
        const [runName] = (await fs.readdir(observed.outRoot, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory() && entry.name !== 'pre-existing')
          .map((entry) => entry.name);
        const candidateRoot = path.join(observed.outRoot, runName, 'playbook-execute/candidates/candidate-02');
        const pointer = path.join(candidateRoot, 'current-chain.json');
        const beforeBytes = await fs.readFile(pointer);
        const beforeStat = await fs.stat(pointer);
        try {
          await replayCandidate({ ...input,
            faultInjector(boundary) {
              if (boundary === 'downstream-compile') throw new Error('private repair failure body /outside/path');
            } });
          assert.fail('faulted replay unexpectedly completed');
        } catch (error) {
          const afterBytes = await fs.readFile(pointer);
          const afterStat = await fs.stat(pointer);
          observed.rollback = {
            beforeBytes, afterBytes,
            beforeSha256: digestBytes(beforeBytes), afterSha256: digestBytes(afterBytes),
            beforeIno: beforeStat.ino, afterIno: afterStat.ino,
            failurePath: path.join(candidateRoot, 'failures/attempt-01.json')
          };
          throw error;
        }
      }
      const result = await replayCandidate(input);
      observed.replayArtifacts ||= [];
      observed.replayArtifacts.push({
        candidate_id: result.candidate_id,
        blueprint: await fs.readFile(result.compiled_result.artifacts.blueprint),
        build: await fs.readFile(result.compiled_result.artifacts.buildFunction),
        treeRows: await datapackRows(result.compiled_result.artifacts.datapackDir)
      });
      observed.replays.push(result);
      return result;
    },
    createSelectionAgent: () => ({
      run(candidates, options) {
        observed.ranked = candidates.map((row) => row.id);
        return new CandidateSelectionAgent().run(candidates, options);
      }
    }),
    async installSelected() {
      observed.installCount = (observed.installCount || 0) + 1;
      return undefined;
    }
  };
}

async function repairedEvidence(result, observed) {
  const replay = observed.replays.find((row) => row.candidate_id === 'candidate-02');
  const replayArtifacts = observed.replayArtifacts.find((row) => row.candidate_id === 'candidate-02');
  assert.ok(replay);
  assert.ok(replayArtifacts);
  const root = path.join(result.outputDir, 'playbook-execute/candidates/candidate-02');
  const initialBytes = await fs.readFile(path.join(root, 'chains/chain-0001.json'));
  const pointer = JSON.parse(await fs.readFile(path.join(root, 'current-chain.json')));
  const chainBytes = await fs.readFile(path.join(root, 'chains', `chain-${String(pointer.chain_revision).padStart(4, '0')}.json`));
  const initial = JSON.parse(initialBytes);
  const chain = JSON.parse(chainBytes);
  const checkpointPaths = ['brief/r0001.json', 'massing/r0002.json', 'structure/r0002.json', 'roof/r0002.json', 'facade/r0002.json'];
  const checkpoints = await Promise.all(checkpointPaths.map((relative) => fs.readFile(path.join(root, 'checkpoints', relative)).then((bytes) => JSON.parse(bytes))));
  const repairPaths = ['attempt-01-request.json', 'attempt-01-patch.json', 'attempt-01-result.json'];
  const repairBytes = await Promise.all(repairPaths.map((name) => fs.readFile(path.join(root, 'repairs', name))));
  const facade = checkpoints.at(-1);
  const blueprintBytes = replayArtifacts.blueprint;
  const buildBytes = replayArtifacts.build;
  const treeRows = replayArtifacts.treeRows;
  const regeneratedArtifactHashes = {
    operation_list_sha256: digestBytes(Buffer.from(stableJson(replay.compiled_result.blueprint.operations))),
    build_function_sha256: digestBytes(buildBytes),
    datapack_tree_sha256: digestBytes(Buffer.from(stableJson(treeRows)))
  };
  const persistedArtifactHashes = Object.fromEntries(Object.entries(facade.compiled_artifact_hashes)
    .filter(([key]) => ['operation_list_sha256', 'build_function_sha256', 'datapack_tree_sha256'].includes(key)));
  return {
    initial, chain,
    revisions: checkpoints.map((checkpoint) => checkpoint.revision),
    replayOrigins: checkpoints.map((checkpoint) => checkpoint.replay_origin === null ? null : checkpoint.layer),
    blueprintSha256: digestBytes(blueprintBytes),
    persistedArtifactHashes, regeneratedArtifactHashes,
    deterministicBytes: {
      chain: chainBytes, repairs: repairBytes, blueprint: blueprintBytes,
      operations: Buffer.from(stableJson(replay.compiled_result.blueprint.operations)),
      build: buildBytes, tree: Buffer.from(stableJson(treeRows))
    }
  };
}

async function datapackRows(root) {
  const rows = [];
  await visit(root, 'architect_datapack');
  rows.sort((left, right) => left.path.localeCompare(right.path));
  return rows;
  async function visit(absolute, relative) {
    for (const name of (await fs.readdir(absolute)).sort()) {
      const target = path.join(absolute, name);
      const child = `${relative}/${name}`;
      const stat = await fs.lstat(target);
      assert.equal(stat.isSymbolicLink(), false);
      if (stat.isDirectory()) await visit(target, child);
      else {
        assert.equal(stat.isFile(), true);
        rows.push({ path: child, sha256: digestBytes(await fs.readFile(target)) });
      }
    }
  }
}

function digestBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function temporaryRoot(t, prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function acceptanceRoots(t, prefix) {
  const outRoot = await temporaryRoot(t, `${prefix}out-`);
  const worldRoot = await temporaryRoot(t, `${prefix}world-`);
  const expected = new Map([
    [path.join(outRoot, 'pre-existing/root.bin'), Buffer.from([0, 1, 2, 255])],
    [path.join(outRoot, 'pre-existing/nested/report.txt'), Buffer.from('output-before\n')],
    [path.join(worldRoot, 'region/r.0.0.mca'), Buffer.from([255, 2, 1, 0])],
    [path.join(worldRoot, 'level.dat'), Buffer.from('world-before\n')]
  ]);
  for (const [target, bytes] of expected) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
  return {
    outRoot,
    worldRoot,
    async assertPreexistingUnchanged() {
      for (const [target, bytes] of expected) assert.deepEqual(await fs.readFile(target), bytes);
    }
  };
}

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

async function dependencyRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-repository-dependency-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await writeFixture(root, 'src/pipeline.js', 'export const pipeline = true;\n');
  await writeFixture(root, 'src/playbook/execute/eligibility.js', 'export const eligibility = true;\n');
  return root;
}

async function writeFixture(root, relative, bytes) {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
}

function relativeImport(importer, target) {
  const relative = path.posix.relative(path.posix.dirname(importer), target);
  return relative.startsWith('.') ? relative : `./${relative}`;
}
