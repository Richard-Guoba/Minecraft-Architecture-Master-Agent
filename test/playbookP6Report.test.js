import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { compileBlindComparison, revealPreferenceResults, sealPreferences } from '../src/playbook/p6/comparisons.js';
import { P6_OBSERVATION_CRITERIA, P6_PROTOCOL_FILE_HASHES, P6_VIEW_IDS } from '../src/playbook/p6/constants.js';
import { compileObservationSet } from '../src/playbook/p6/observations.js';
import { p6Error } from '../src/playbook/p6/contracts.js';
import { evaluateP6Gate, renderP6Report } from '../src/playbook/p6/report.js';
import { createP6Run, publishP6Generation, readCurrentP6Generation } from '../src/playbook/p6/storage.js';
import { parseP6Args, runP6Cli } from '../src/runArchitecturePlaybookP6.js';
import { sha256, stableJson } from '../src/playbook/shadow/canonical.js';
import { createP6CaptureInputs, p6CaptureHash } from './fixtures/playbookP6Captures.js';

const GENERATED_AT = '2026-08-30T12:00:00.000Z';
const OPAQUE_IDS = ['alpha', 'bravo', 'charlie', 'delta'].map(value => `opaque-solution-${value}`);
const LAYERS = {
  'massing-hierarchy': 'massing', 'structural-legibility': 'structure', silhouette: 'massing',
  'roof-composition': 'roof', 'facade-rhythm-depth': 'facade', 'material-role-legibility': 'materials',
  'detail-density': 'facade', 'scene-integration': 'scene', 'style-consistency': 'facade'
};

test('passes only a complete internally consistent evidence package', () => {
  const evidence = completeEvidence();
  const gate = evaluateP6Gate(evidence);
  assert.equal(gate.status, 'pass');
  assert.equal(gate.p7_allowed, true);
  assert.equal(gate.next_action.kind, 'start-p7');
  assert.equal(gate.outcome, 'playbook-supported');
  assert.deepEqual(gate.failures, []);
});

test('every prerequisite independently blocks instead of being inferred from an outcome', () => {
  const cases = [
    ['cohort', value => { value.cohort.solutions.pop(); }],
    ['reference-renders', value => { value.referenceManifest.images.pop(); }],
    ['reference-renders', value => { value.referenceManifest.camera_manifest_sha256 = p6CaptureHash('other-cameras'); }],
    ['formal-captures', value => { value.captureManifest.images.pop(); }],
    ['environment', value => { value.captureManifest.environment.minecraft_version = '1.21.1'; }],
    ['observations', value => { value.observationSet.status = 'partial'; value.observationSet.gate_ready = false; }],
    ['comparisons', value => { value.comparisonManifest.pairs.pop(); }],
    ['sealed-preferences', value => { value.sealedPreferences.records.pop(); }],
    ['sealed-preferences', value => { value.sealedPreferences.synthetic_score = 1; }],
    ['private-reveal', value => { value.revealedResults.pair_decisions.pop(); }],
    ['private-reveal', value => {
      for (const row of value.revealedResults.pair_decisions) {
        row.left_solution_id = 'playbook-candidate-01';
        row.right_solution_id = 'baseline-current';
        row.preferred_solution_id = row.decision === 'left' ? row.left_solution_id : row.decision === 'right' ? row.right_solution_id : null;
      }
    }],
    ['regressions', value => { value.regressions.p5 = 'fail'; }]
  ];
  for (const [expectedStage, mutate] of cases) {
    const evidence = structuredClone(completeEvidence());
    mutate(evidence);
    const gate = evaluateP6Gate(evidence);
    assert.equal(gate.status, 'blocked', expectedStage);
    assert.equal(gate.p7_allowed, false, expectedStage);
    assert.equal(gate.next_action.kind, 'collect-p6-evidence', expectedStage);
    assert.ok(gate.failures.some(failure => failure.stage === expectedStage), expectedStage);
  }
});

test('outcome wording changes advice but never substitutes for completeness', () => {
  const cases = [
    ['playbook-supported', playbookWin, 'start-p7'],
    ['baseline-supported', baselineWin, 'review-p5-evidence'],
    ['inconclusive', allTies, 'review-p5-evidence'],
    ['inconclusive', mixedResult, 'review-p5-evidence']
  ];
  for (const [outcome, alter, adviceKind] of cases) {
    const evidence = completeEvidence();
    alter(evidence);
    const gate = evaluateP6Gate(evidence);
    assert.equal(gate.status, 'pass', outcome);
    assert.equal(gate.p7_allowed, true, outcome);
    assert.equal(gate.outcome, outcome);
    assert.equal(gate.advice.kind, adviceKind);
    assert.equal(JSON.stringify(gate).includes('score'), false);
    assert.equal(JSON.stringify(gate).includes('statistical'), false);
  }
  const incomplete = completeEvidence();
  playbookWin(incomplete);
  incomplete.referenceManifest.images.pop();
  assert.equal(evaluateP6Gate(incomplete).status, 'blocked');
});

test('renders a deterministic hash inventory without scalar or statistical claims', () => {
  const gate = evaluateP6Gate(completeEvidence());
  const evidenceHashes = {
    cohort: p6CaptureHash('cohort-evidence'),
    reference_renders: p6CaptureHash('reference-evidence'),
    formal_captures: p6CaptureHash('capture-evidence'),
    observations: p6CaptureHash('observation-evidence'),
    comparisons: p6CaptureHash('comparison-evidence'),
    sealed_preferences: p6CaptureHash('sealed-evidence'),
    private_reveal: p6CaptureHash('reveal-evidence'),
    regressions: p6CaptureHash('regression-evidence')
  };
  const first = renderP6Report({ gate, evidenceHashes });
  const second = renderP6Report({ gate, evidenceHashes: { ...evidenceHashes } });
  assert.equal(first, second);
  assert.match(first, /Status: pass/u);
  assert.match(first, /Outcome: playbook-supported/u);
  for (const hash of Object.values(evidenceHashes)) assert.match(first, new RegExp(hash, 'u'));
  assert.doesNotMatch(first, /(?:weighted|aesthetic|visual)[ _-]?score|statistically significant/iu);
  const forged = structuredClone(gate);
  forged.advice.message = '/home/private/world';
  assert.throws(() => renderP6Report({ gate: forged, evidenceHashes }), /P6_GATE_FAILED/u);
});

test('report CLI parses only an absolute run and publishes against every exact current authority', async () => {
  const runDir = '/tmp/p6-report-disposable';
  assert.deepEqual(parseP6Args(['report', '--run-dir', runDir]), { action: 'report', runDir });
  assert.throws(() => parseP6Args(['report', '--run-dir', runDir, '--file', '/tmp/forged.json']), { code: 'P6_OPTIONS_INVALID' });
  const evidence = completeEvidence();
  const hash = name => p6CaptureHash(`${name}-generation`);
  const current = {
    cohort: generation(hash, 'cohort', { 'cohort.json': { schema_version: 1, cohort: evidence.cohort, cohort_input_sha256: evidence.referenceManifest.cohort_input_sha256, selection_rank: [] } }),
    'reference-renders': generation(hash, 'reference-renders', { 'reference-renders.json': evidence.referenceManifest }),
    'capture-session': generation(hash, 'capture-session', { 'capture-session.json': {
      cohort_sha256: sha256(stableJson(evidence.cohort)), camera_manifest_sha256: evidence.captureManifest.camera_manifest_sha256,
      environment: { ...evidence.captureManifest.environment, width_px: 1920, height_px: 1080, aspect_ratio: '16:9' }
    } }),
    'minecraft-captures': generation(hash, 'minecraft-captures', { 'capture-manifest.json': evidence.captureManifest }),
    observations: generation(hash, 'observations', { 'observations.json': evidence.observationSet }),
    'blind-comparison': {
      ...generation(hash, 'blind-comparison', { 'comparison-manifest.json': evidence.comparisonManifest }),
      privateFiles: {
        'sealed-preferences.json': Buffer.from(stableJson(evidence.sealedPreferences)),
        'identity-map.json': Buffer.from('{}')
      }
    },
    gate: generation(hash, 'gate', { 'regressions.json': evidence.regressions })
  };
  const calls = [];
  const result = await runP6Cli(['report', '--run-dir', runDir], {
    admitP6Run: async () => ({ close: async () => calls.push(['close']) }),
    readCurrentP6Generation: async ({ kind, includePrivate, fileNames }) => {
      calls.push(['read', kind, includePrivate === true, fileNames ?? null]);
      return current[kind];
    },
    revealPreferenceResults: () => evidence.revealedResults,
    evaluateP6Gate,
    renderP6Report,
    publishP6Generation: async options => {
      calls.push(['publish', options]);
      return { generation: 'generation-000002', manifest_sha256: hash('published-gate') };
    },
    stableJson, sha256
  });
  assert.equal(result.status, 'pass');
  assert.equal(result.p7_allowed, true);
  assert.equal(result.output, 'gate/generation-000002');
  assert.deepEqual(calls.find(row => row[0] === 'read' && row[1] === 'blind-comparison'), [
    'read', 'blind-comparison', true, ['comparison-manifest.json']
  ]);
  const publication = calls.find(row => row[0] === 'publish')[1];
  assert.deepEqual(publication.expectedCurrent, [
    'cohort', 'reference-renders', 'capture-session', 'minecraft-captures', 'observations', 'blind-comparison', 'gate'
  ].map(kind => ({ kind, generation: 'generation-000001', manifest_sha256: hash(kind) })));
  assert.deepEqual(Object.keys(publication.files).sort(), ['regressions.json', 'report.json', 'report.md']);
  assert.equal(publication.files['report.md'].toString().includes(runDir), false);
  assert.deepEqual(calls.at(-1), ['close']);
});

test('gate publication serializes and compare-and-swaps every exact evidence authority', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-gate-authority-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runDir = path.join(root, 'run');
  await fs.mkdir(runDir);
  const created = await createP6Run({ runDir });
  t.after(() => created.authority.close());
  const cohort = await publishP6Generation({ authority: created.authority, kind: 'cohort', files: { 'cohort.json': Buffer.from('cohort') } });
  const references = await publishP6Generation({ authority: created.authority, kind: 'reference-renders', files: { 'reference-renders.json': Buffer.from('references') } });
  const session = await publishP6Generation({ authority: created.authority, kind: 'capture-session', files: { 'capture-session.json': Buffer.from('session') } });
  const captures = await publishP6Generation({
    authority: created.authority, kind: 'minecraft-captures', files: { 'capture-manifest.json': Buffer.from('captures') },
    expectedCurrent: currentRef('capture-session', session)
  });
  const observations = await publishP6Generation({
    authority: created.authority, kind: 'observations', files: { 'observations.json': Buffer.from('observations') },
    expectedCurrent: currentRef('minecraft-captures', captures)
  });
  const blind = await publishP6Generation({
    authority: created.authority, kind: 'blind-comparison', files: { 'comparison-manifest.json': Buffer.from('blind') },
    expectedCurrent: [currentRef('cohort', cohort), currentRef('minecraft-captures', captures), { kind: 'blind-comparison', generation: null, manifest_sha256: null }]
  });
  const dependencies = [
    currentRef('cohort', cohort), currentRef('reference-renders', references), currentRef('capture-session', session),
    currentRef('minecraft-captures', captures), currentRef('observations', observations),
    currentRef('blind-comparison', blind), { kind: 'gate', generation: null, manifest_sha256: null }
  ];
  const gate = await publishP6Generation({
    authority: created.authority, kind: 'gate', files: { 'report.json': Buffer.from('{}') }, expectedCurrent: dependencies
  });
  assert.equal((await readCurrentP6Generation({ authority: created.authority, kind: 'gate' })).generation, gate.generation);
  await publishP6Generation({
    authority: created.authority, kind: 'reference-renders', files: { 'reference-renders.json': Buffer.from('drift') }
  });
  await assert.rejects(
    publishP6Generation({
      authority: created.authority, kind: 'gate', files: { 'report.json': Buffer.from('{"stale":true}') },
      expectedCurrent: [...dependencies.slice(0, 6), currentRef('gate', gate)]
    }),
    { code: 'P6_AUTHORITY_INVALID' }
  );
});

test('report publishes blocked when formal generations are absent and never invents regressions or choices', async () => {
  const runDir = '/tmp/p6-report-blocked';
  const hash = name => p6CaptureHash(`${name}-generation`);
  const available = {
    cohort: generation(hash, 'cohort', { 'cohort.json': { schema_version: 1, cohort: null, cohort_input_sha256: p6CaptureHash('input'), selection_rank: [] } }),
    'reference-renders': generation(hash, 'reference-renders', { 'reference-renders.json': { schema_version: 1, kind: 'reference-render', images: [] } }),
    'capture-session': generation(hash, 'capture-session', { 'capture-session.json': { status: 'prepared-not-executed' } })
  };
  let published;
  const result = await runP6Cli(['report', '--run-dir', runDir], {
    admitP6Run: async () => ({ close: async () => {} }),
    readCurrentP6Generation: async ({ kind }) => {
      if (available[kind]) return available[kind];
      throw p6Error('P6_AUTHORITY_INVALID');
    },
    revealPreferenceResults: () => { throw p6Error('P6_HUMAN_PREFERENCE_REQUIRED'); },
    evaluateP6Gate,
    renderP6Report,
    publishP6Generation: async options => {
      published = options;
      return { generation: 'generation-000001', manifest_sha256: hash('published') };
    },
    stableJson, sha256
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.p7_allowed, false);
  assert.deepEqual(published.expectedCurrent.map(row => [row.kind, row.generation]), [
    ['cohort', 'generation-000001'], ['reference-renders', 'generation-000001'],
    ['capture-session', 'generation-000001'], ['minecraft-captures', null],
    ['observations', null], ['blind-comparison', null], ['gate', null]
  ]);
  const report = JSON.parse(published.files['report.json']);
  assert.equal(report.gate.status, 'blocked');
  assert.equal(report.gate.outcome, 'not-evaluated');
  assert.equal(report.gate.advice.kind, 'collect-p6-evidence');
  assert.ok(report.gate.failures.some(row => row.stage === 'formal-captures'));
  assert.ok(report.gate.failures.some(row => row.stage === 'sealed-preferences'));
  assert.ok(report.gate.failures.some(row => row.stage === 'regressions'));
});

function completeEvidence() {
  const cohort = createP6CaptureInputs().cohort.manifest;
  const cohortHash = sha256(stableJson(cohort));
  const captureManifest = {
    schema_version: 1, protocol_version: '0.1.0', cohort_sha256: cohortHash,
    camera_manifest_sha256: p6CaptureHash('cameras'),
    request_sha256: P6_PROTOCOL_FILE_HASHES['fixed-request.json'],
    visual_settings_sha256: P6_PROTOCOL_FILE_HASHES['visual-settings.json'],
    environment: {
      minecraft_version: '1.21.9', client_options_sha256: p6CaptureHash('options'),
      resource_pack_ids: ['vanilla'], viewport: { width_px: 1920, height_px: 1080, aspect_ratio: '16:9' },
      horizontal_fov_degrees: 70, time_of_day: 6000, weather: 'clear',
      world_identifier_sha256: p6CaptureHash('world')
    },
    images: OPAQUE_IDS.flatMap((solution_id, solutionIndex) => P6_VIEW_IDS.map((view_id, viewIndex) => ({
      screenshot_id: `capture-${String(solutionIndex * 6 + viewIndex + 1).padStart(2, '0')}-opaque`,
      solution_id,
      camera: { view_id, position: { x: '1.000000', y: '2.000000', z: '3.000000' }, orientation: { pitch_degrees: '0.000000', yaw_degrees: '0.000000' } },
      build_function_sha256: cohort.solutions[solutionIndex].build_function_sha256,
      image_sha256: p6CaptureHash(`image-${solutionIndex}-${viewIndex}`)
    })))
  };
  const observations = OPAQUE_IDS.flatMap((_, solutionIndex) => P6_OBSERVATION_CRITERIA.map((criterion, criterionIndex) => ({
    schema_version: 1, protocol_version: '0.1.0',
    observation_id: `observation-${String(solutionIndex * 9 + criterionIndex + 1).padStart(2, '0')}`,
    solution_authority_hash: sha256(stableJson(cohort.solutions[solutionIndex])),
    capture_manifest_hash: sha256(stableJson(captureManifest)), view_ids: ['front-south'],
    design_layer: LAYERS[criterion], criterion, rating: 'usable',
    observable_paraphrase: 'The cited exterior view visibly shows the evaluated building form.',
    evidence_regions: [{ screenshot_id: `capture-${String(solutionIndex * 6 + 1).padStart(2, '0')}-opaque`, region_kind: 'whole-frame', region: null }],
    rule_ids: ['rule:massing.primary-secondary-tertiary'], limitations: ['Only the cited frame was reviewed.'],
    reviewer_kind: 'human', reviewed_at: GENERATED_AT
  })));
  const observationSet = compileObservationSet({ cohort, captureManifest, observations });
  const bundle = compileBlindComparison({ cohort, captureManifest, randomBytes: deterministicBytes(), generatedAt: GENERATED_AT });
  const comparisonHash = sha256(stableJson(bundle.publicManifest));
  const records = bundle.publicManifest.pairs.map((pair, index) => ({
    schema_version: 1, protocol_version: '0.1.0', comparison_manifest_hash: comparisonHash,
    pair_id: pair.pair_id, choice: index === 2 ? baselineChoice(pair, bundle) : 'tie', confidence: 'high',
    reason_tags: [], rationale: null, reviewer_kind: 'human', sealed_at: GENERATED_AT
  }));
  const sealedPreferences = sealPreferences({ publicManifest: bundle.publicManifest, records, reviewerPseudonym: 'reviewer-owl-17' });
  const revealedResults = revealPreferenceResults({ sealedPreferences, privateIdentityMap: bundle.privateIdentityMap });
  const referenceManifest = {
    schema_version: 1, kind: 'reference-render', cohort_input_sha256: p6CaptureHash('cohort-input'),
    camera_manifest_sha256: p6CaptureHash('cameras'),
    images: cohort.solutions.flatMap(solution => P6_VIEW_IDS.map(view_id => ({
      filename: `${solution.solution_id}-${view_id}.png`, image_sha256: p6CaptureHash(`${solution.solution_id}-${view_id}`),
      view_id, solution_id: solution.solution_id, width: 1920, height: 1080
    })))
  };
  const evidence = structuredClone({
    cohort, referenceManifest, captureManifest, observationSet,
    comparisonManifest: bundle.publicManifest, sealedPreferences, revealedResults,
    regressions: { p4: 'pass', p5: 'pass', playbook_off: 'pass', six_episode_golden: 'pass' }
  });
  playbookWin(evidence);
  return evidence;
}

function deterministicBytes() {
  let offset = 0;
  const values = [3, 1, 4, 2, 7, 5, 8, 6];
  return length => Buffer.from(Array.from({ length }, () => values[offset++ % values.length]));
}

function generation(hash, kind, values) {
  return {
    generation: 'generation-000001', manifest_sha256: hash(kind),
    files: Object.fromEntries(Object.entries(values).map(([name, value]) => [name, Buffer.from(stableJson(value))]))
  };
}

function currentRef(kind, publication) {
  return { kind, generation: publication.generation, manifest_sha256: publication.manifest_sha256 };
}

function baselineChoice(pair, bundle) {
  const baselineCode = bundle.privateIdentityMap.mappings.find(row => row.solution_id === 'baseline-current').solution_code;
  return pair.left_code === baselineCode ? 'left' : pair.right_code === baselineCode ? 'right' : 'tie';
}

function replaceRecords(evidence, chooser) {
  evidence.sealedPreferences.records.forEach((record, index) => { record.choice = chooser(evidence.revealedResults.pair_decisions[index], index); });
  evidence.sealedPreferences.sealed_preference_hashes = evidence.sealedPreferences.records.map(record => sha256(stableJson(record)));
  evidence.revealedResults.pair_decisions.forEach((decision, index) => {
    const choice = evidence.sealedPreferences.records[index].choice;
    decision.decision = choice;
    decision.preferred_solution_id = choice === 'left' ? decision.left_solution_id : choice === 'right' ? decision.right_solution_id : null;
  });
  evidence.revealedResults.categorical_counts = { left: 0, right: 0, tie: 0 };
  for (const record of evidence.sealedPreferences.records) evidence.revealedResults.categorical_counts[record.choice] += 1;
}

function playbookWin(evidence) {
  replaceRecords(evidence, decision => decision.left_solution_id === 'baseline-current' ? 'right' : decision.right_solution_id === 'baseline-current' ? 'left' : 'tie');
}
function baselineWin(evidence) {
  replaceRecords(evidence, decision => decision.left_solution_id === 'baseline-current' ? 'left' : decision.right_solution_id === 'baseline-current' ? 'right' : 'tie');
}
function allTies(evidence) { replaceRecords(evidence, () => 'tie'); }
function mixedResult(evidence) { replaceRecords(evidence, (decision, index) => index % 3 === 0 ? 'left' : index % 3 === 1 ? 'right' : 'tie'); }
