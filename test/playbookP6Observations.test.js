import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  compileObservationSet,
  createObservation,
  renderObservationReport
} from '../src/playbook/p6/observations.js';
import { P6_OBSERVATION_CRITERIA, P6_PROTOCOL_FILE_HASHES, P6_VIEW_IDS } from '../src/playbook/p6/constants.js';
import { parseP6Args, runP6Cli } from '../src/runArchitecturePlaybookP6.js';
import {
  createP6Run,
  publishP6Generation,
  readCurrentP6Generation
} from '../src/playbook/p6/storage.js';
import { sha256, stableJson } from '../src/playbook/shadow/canonical.js';
import { createP6CaptureInputs, p6CaptureHash } from './fixtures/playbookP6Captures.js';

const OPAQUE_IDS = ['alpha', 'bravo', 'charlie', 'delta'].map(id => `opaque-solution-${id}`);
const LAYERS = {
  'massing-hierarchy': 'massing',
  'structural-legibility': 'structure',
  silhouette: 'massing',
  'roof-composition': 'roof',
  'facade-rhythm-depth': 'facade',
  'material-role-legibility': 'materials',
  'detail-density': 'facade',
  'scene-integration': 'scene',
  'style-consistency': 'facade'
};

test('accepts all nine categorical criteria with exact authority-bound visible evidence', () => {
  const context = fixture();
  for (const [index, criterion] of P6_OBSERVATION_CRITERIA.entries()) {
    const observation = createObservation(observationFor(context, { index, criterion }), context);
    assert.equal(observation.criterion, criterion);
    assert.equal(observation.design_layer, LAYERS[criterion]);
    assert.equal(observation.rating, ['strong', 'usable', 'weak', 'fail', 'unknown'][index % 5]);
  }
});

test('accepts whole-frame and normalized rectangles but rejects invalid citations and fields', () => {
  const context = fixture();
  const whole = observationFor(context);
  assert.equal(createObservation(whole, context).evidence_regions[0].region, null);

  const rectangle = observationFor(context, {
    evidence_regions: [{
      screenshot_id: 'capture-01-opaque', region_kind: 'rect',
      region: { x: 0.125, y: 0.2, width: 0.5, height: 0.6 }
    }]
  });
  assert.deepEqual(createObservation(rectangle, context).evidence_regions[0].region,
    { x: 0.125, y: 0.2, width: 0.5, height: 0.6 });

  for (const mutate of [
    value => { value.evidence_regions = []; },
    value => { value.evidence_regions[0].screenshot_id = 'capture-07-opaque'; },
    value => { value.evidence_regions[0].region_kind = 'rect'; value.evidence_regions[0].region = { x: 0.8, y: 0, width: 0.3, height: 1 }; },
    value => { value.score = 4; },
    value => { value.weight = 1; },
    value => { value.rank = 1; },
    value => { delete value.rating; }
  ]) {
    const value = structuredClone(whole);
    mutate(value);
    assert.throws(() => createObservation(value, context), { code: 'P6_OBSERVATION_INVALID' });
  }
});

test('binds citations, views, solution authority, and capture authority to admitted manifests', () => {
  const context = fixture();
  const valid = observationFor(context);
  for (const mutate of [
    value => { value.capture_manifest_hash = p6CaptureHash('other-capture'); },
    value => { value.solution_authority_hash = p6CaptureHash('other-solution'); },
    value => { value.view_ids = ['side-east']; },
    value => { value.evidence_regions[0].screenshot_id = 'capture-13-opaque'; }
  ]) {
    const value = structuredClone(valid);
    mutate(value);
    assert.throws(() => createObservation(value, context), { code: 'P6_OBSERVATION_INVALID' });
  }

  const forged = fixture();
  forged.captureManifest.images[12].build_function_sha256 = forged.cohort.solutions[0].build_function_sha256;
  const mismatchedOpaqueIdentity = observationFor(forged, {
    capture_manifest_hash: sha256(stableJson(forged.captureManifest)),
    evidence_regions: [{
      screenshot_id: 'capture-13-opaque', region_kind: 'whole-frame', region: null
    }]
  });
  assert.throws(
    () => createObservation(mismatchedOpaqueIdentity, forged),
    { code: 'P6_OBSERVATION_INVALID' }
  );
});

test('enforces criterion layers, ratings, reviewer kinds, optional rules, and explicit limitations', () => {
  const context = fixture();
  const base = observationFor(context);
  assert.deepEqual(createObservation({ ...base, rule_ids: [] }, context).rule_ids, []);
  for (const mutate of [
    value => { value.design_layer = 'roof'; },
    value => { value.rating = 'excellent'; },
    value => { value.reviewer_kind = 'automated'; },
    value => { value.rule_ids = ['not-a-rule']; },
    value => { value.limitations = []; }
  ]) {
    const value = structuredClone(base);
    mutate(value);
    assert.throws(() => createObservation(value, context), { code: 'P6_OBSERVATION_INVALID' });
  }
});

test('rejects preference language and claims of intent, authenticity, engineering, or unseen interiors', () => {
  const context = fixture();
  for (const observable_paraphrase of [
    'This is better than the other solution.',
    'This candidate is best.',
    'This option is the worst.',
    'This solution wins.',
    'This candidate loses.',
    'The architect intended the taller volume to dominate.',
    'The architect had the intention of making the taller volume dominant.',
    'The façade is historically authentic medieval work.',
    'The roof is structurally sound.',
    'The unseen interior has a generous circulation plan.'
  ]) {
    assert.throws(
      () => createObservation(observationFor(context, { observable_paraphrase }), context),
      { code: 'P6_OBSERVATION_INVALID' }
    );
  }

  for (const limitation of [
    'This candidate wins despite the limited view.',
    'This is the best solution.',
    'The architect intended a dominant central volume.',
    'The roof is structurally safe.'
  ]) {
    assert.throws(
      () => createObservation(observationFor(context, { limitations: [limitation] }), context),
      { code: 'P6_OBSERVATION_INVALID' }
    );
  }

  assert.doesNotThrow(() => createObservation(observationFor(context, {
    rating: 'unknown',
    limitations: ['The exterior image cannot establish historical authenticity or unseen interior conditions.']
  }), context));
  assert.doesNotThrow(() => createObservation(observationFor(context, {
    observable_paraphrase: 'This design loses definition toward the roof edge.'
  }), context));

  assert.throws(() => createObservation(observationFor(context, {
    rating: 'unknown',
    limitations: [
      'Evidence remains unclear for unseen interior conditions, but the architect intended a dominant center.'
    ]
  }), context), { code: 'P6_OBSERVATION_INVALID' });
});

test('requires unknown plus a limitation when exterior evidence is explicitly insufficient', () => {
  const context = fixture();
  const insufficient = observationFor(context, {
    observable_paraphrase: 'The cited exterior view does not establish the interior condition.',
    rating: 'usable'
  });
  assert.throws(() => createObservation(insufficient, context), { code: 'P6_OBSERVATION_INVALID' });
  assert.equal(createObservation({ ...insufficient, rating: 'unknown' }, context).rating, 'unknown');

  const unclearLimitation = observationFor(context, {
    rating: 'usable',
    limitations: ['Evidence remains unclear in the cited exterior frame.']
  });
  assert.throws(() => createObservation(unclearLimitation, context), { code: 'P6_OBSERVATION_INVALID' });
  assert.equal(createObservation({ ...unclearLimitation, rating: 'unknown' }, context).rating, 'unknown');
});

test('compiles deterministic complete and explicitly partial sets without scores or preference results', () => {
  const context = fixture();
  const completeRows = OPAQUE_IDS.flatMap((_, solutionIndex) => (
    P6_OBSERVATION_CRITERIA.map((criterion, criterionIndex) => observationFor(context, {
      solutionIndex,
      criterion,
      index: solutionIndex * 9 + criterionIndex
    }))
  ));
  const complete = compileObservationSet({ ...context, observations: completeRows });
  assert.equal(complete.status, 'complete');
  assert.equal(complete.observation_count, 36);
  assert.equal(complete.required_observation_count, 36);
  assert.equal(complete.gate_ready, true);
  assert.equal(stableJson(compileObservationSet({ ...context, observations: [...completeRows].reverse() })), stableJson(complete));

  const partial = compileObservationSet({ ...context, observations: completeRows.slice(0, 1) });
  assert.equal(partial.status, 'partial');
  assert.equal(partial.gate_ready, false);
  assert.equal(JSON.stringify(partial).includes('score'), false);
  assert.equal(JSON.stringify(partial).includes('winner'), false);
  assert.throws(
    () => compileObservationSet({ ...context, observations: [completeRows[0], completeRows[0]] }),
    { code: 'P6_OBSERVATION_INVALID' }
  );
});

test('renders a deterministic evidence report with partial completeness semantics', () => {
  const context = fixture();
  const set = compileObservationSet({ ...context, observations: [observationFor(context)] });
  const report = renderObservationReport(set);
  assert.match(report, /Status: partial/u);
  assert.match(report, /Gate ready: no/u);
  assert.match(report, /1 of 36/u);
  assert.match(report, /capture-01-opaque/u);
  assert.equal(renderObservationReport(set), report);
});

test('report rendering rejects forged semantic sets instead of trusting complete and gate-ready flags', () => {
  const context = fixture();
  const complete = compileObservationSet({ ...context, observations: completeObservations(context) });
  const forgeries = [
    value => { value.observations[35] = structuredClone(value.observations[0]); },
    value => { value.observations[0].design_layer = 'roof'; },
    value => { value.observations[0].capture_manifest_hash = p6CaptureHash('other-capture'); },
    value => { value.observations.reverse(); },
    value => { value.observations[0].limitations = ['This candidate wins.']; },
    value => { value.observations[0].evidence_regions[0].screenshot_id = 'capture-99-opaque'; },
    value => { value.observations[0].evidence_regions[0].screenshot_id = 'capture-13-opaque'; },
    value => { value.observations[0].view_ids = ['side-east']; },
    value => {
      value.observations = [
        ...value.observations.slice(9, 18),
        ...value.observations.slice(0, 9),
        ...value.observations.slice(18)
      ];
    },
    value => { value.cohort_sha256 = p6CaptureHash('drifted-cohort'); },
    value => { value.capture_manifest_hash = p6CaptureHash('drifted-capture'); }
  ];
  for (const forge of forgeries) {
    const value = structuredClone(complete);
    forge(value);
    assert.throws(() => renderObservationReport(value), { code: 'P6_OBSERVATION_INVALID' });
  }
});

test('CLI publishes a complete or explicitly partial exact JSON set against current authorities', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-observations-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'observations.json');
  const context = fixture();
  await fs.writeFile(file, stableJson({
    schema_version: 1,
    protocol_version: '0.1.0',
    status: 'partial',
    observations: [observationFor(context)]
  }));
  assert.deepEqual(parseP6Args(['import-observations', '--run-dir', root, '--file', file]), {
    action: 'import-observations', runDir: root, file
  });
  const calls = [];
  const result = await runP6Cli(['import-observations', '--run-dir', root, '--file', file], {
    admitP6Run: async () => ({ close: async () => calls.push(['close']) }),
    readCurrentP6Generation: async ({ kind }) => {
      calls.push(['read', kind]);
      if (kind === 'cohort') return {
        generation: 'generation-000001', manifest_sha256: p6CaptureHash('cohort-generation'),
        files: { 'cohort.json': Buffer.from(stableJson({ schema_version: 1, cohort: context.cohort })) }
      };
      return {
        generation: 'generation-000001', manifest_sha256: p6CaptureHash('capture-generation'),
        files: { 'capture-manifest.json': Buffer.from(stableJson(context.captureManifest)) }
      };
    },
    publishP6Generation: async options => {
      calls.push(['publish', options.kind, options.expectedCurrent]);
      assert.equal(options.files['observations.json'].toString(), stableJson(
        compileObservationSet({ ...context, observations: [observationFor(context)] })
      ));
      assert.match(options.files['observation-report.md'].toString(), /Gate ready: no/u);
      return { generation: 'generation-000001', manifest_sha256: p6CaptureHash('published') };
    }
  });
  assert.deepEqual(result, {
    status: 'observations-imported', completeness: 'partial', observation_count: 1,
    required_observation_count: 36, gate_ready: false,
    observation_set_sha256: sha256(stableJson(compileObservationSet({ ...context, observations: [observationFor(context)] }))),
    output: 'observations/generation-000001'
  });
  assert.deepEqual(calls.at(-2), ['publish', 'observations', {
    kind: 'minecraft-captures', generation: 'generation-000001',
    manifest_sha256: p6CaptureHash('capture-generation')
  }]);
  assert.deepEqual(calls.at(-1), ['close']);

  await fs.writeFile(file, stableJson({
    schema_version: 1, protocol_version: '0.1.0', status: 'complete',
    observations: [observationFor(context)]
  }));
  await assert.rejects(
    runP6Cli(['import-observations', '--run-dir', root, '--file', file], {
      admitP6Run: async () => ({ close: async () => {} }),
      readCurrentP6Generation: async ({ kind }) => kind === 'cohort'
        ? { files: { 'cohort.json': Buffer.from(stableJson({ schema_version: 1, cohort: context.cohort })) } }
        : { files: { 'capture-manifest.json': Buffer.from(stableJson(context.captureManifest)) } }
    }),
    { code: 'P6_OBSERVATION_INVALID' }
  );
});

test('observation publication cannot commit after its current capture authority is replaced', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-observation-race-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runDir = path.join(root, 'run');
  await fs.mkdir(runDir);
  const created = await createP6Run({ runDir });
  t.after(() => created.authority.close());
  const session = await publishP6Generation({
    authority: created.authority,
    kind: 'capture-session',
    files: { 'capture-session.json': Buffer.from('session') }
  });
  const expected = await publishP6Generation({
    authority: created.authority,
    kind: 'minecraft-captures',
    files: { 'capture-manifest.json': Buffer.from('old-capture') },
    expectedCurrent: {
      kind: 'capture-session', generation: session.generation,
      manifest_sha256: session.manifest_sha256
    }
  });
  let replaced = false;
  const fsImpl = new Proxy(fs, {
    get(target, property) {
      if (property === 'afterExpectedCurrentValidation') return async () => {
        if (!replaced) {
          replaced = true;
          await publishP6Generation({
            authority: created.authority,
            kind: 'minecraft-captures',
            files: { 'capture-manifest.json': Buffer.from('new-capture') },
            expectedCurrent: {
              kind: 'capture-session', generation: session.generation,
              manifest_sha256: session.manifest_sha256
            }
          });
        }
      };
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  await assert.rejects(
    publishP6Generation({
      authority: created.authority,
      kind: 'observations',
      files: { 'observations.json': Buffer.from('stale-observations') },
      expectedCurrent: {
        kind: 'minecraft-captures', generation: expected.generation,
        manifest_sha256: expected.manifest_sha256
      },
      fsImpl
    }),
    { code: 'P6_AUTHORITY_INVALID' }
  );
  const capture = await readCurrentP6Generation({ authority: created.authority, kind: 'minecraft-captures' });
  assert.equal(capture.files['capture-manifest.json'].toString(), 'new-capture');
  await assert.rejects(
    readCurrentP6Generation({ authority: created.authority, kind: 'observations' }),
    { code: 'P6_AUTHORITY_INVALID' }
  );
});

function fixture() {
  const { cohort: source } = createP6CaptureInputs();
  const cohort = source.manifest;
  const cohortHash = sha256(stableJson(cohort));
  const images = OPAQUE_IDS.flatMap((solution_id, solutionIndex) => P6_VIEW_IDS.map((view_id, viewIndex) => ({
    screenshot_id: `capture-${String(solutionIndex * 6 + viewIndex + 1).padStart(2, '0')}-opaque`,
    solution_id,
    camera: {
      view_id,
      position: { x: '1.000000', y: '2.000000', z: '3.000000' },
      orientation: { pitch_degrees: '0.000000', yaw_degrees: '0.000000' }
    },
    build_function_sha256: cohort.solutions[solutionIndex].build_function_sha256,
    image_sha256: p6CaptureHash(`image-${solutionIndex}-${viewIndex}`)
  })));
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
    images
  };
  return { cohort, captureManifest };
}

function observationFor(context, overrides = {}) {
  const solutionIndex = overrides.solutionIndex ?? 0;
  const index = overrides.index ?? 0;
  const criterion = overrides.criterion ?? P6_OBSERVATION_CRITERIA[index % 9];
  const rating = overrides.rating ?? ['strong', 'usable', 'weak', 'fail', 'unknown'][index % 5];
  const screenshotIndex = solutionIndex * 6 + 1;
  const {
    solutionIndex: _solutionIndex,
    index: _index,
    ...recordOverrides
  } = overrides;
  return {
    schema_version: 1,
    protocol_version: '0.1.0',
    observation_id: `observation-${String(index + 1).padStart(2, '0')}`,
    solution_authority_hash: sha256(stableJson(context.cohort.solutions[solutionIndex])),
    capture_manifest_hash: sha256(stableJson(context.captureManifest)),
    view_ids: ['front-south'],
    design_layer: LAYERS[criterion],
    criterion,
    rating,
    observable_paraphrase: rating === 'unknown'
      ? 'The cited exterior view does not establish this condition.'
      : 'The front screenshot visibly shows a distinct primary volume and attached lower forms.',
    evidence_regions: [{
      screenshot_id: `capture-${String(screenshotIndex).padStart(2, '0')}-opaque`,
      region_kind: 'whole-frame', region: null
    }],
    rule_ids: ['rule:massing.primary-secondary-tertiary'],
    limitations: ['Only the cited exterior frame was reviewed.'],
    reviewer_kind: index % 2 === 0 ? 'human' : 'model-assisted',
    reviewed_at: '2026-08-30T10:00:00.000Z',
    ...recordOverrides
  };
}

function completeObservations(context) {
  return OPAQUE_IDS.flatMap((_, solutionIndex) => (
    P6_OBSERVATION_CRITERIA.map((criterion, criterionIndex) => observationFor(context, {
      solutionIndex,
      criterion,
      index: solutionIndex * 9 + criterionIndex
    }))
  ));
}
