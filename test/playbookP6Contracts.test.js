import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import {
  P6_CAMERA_PROTOCOL,
  P6_ERROR_CODES,
  P6_COMPARISON_ALIASES,
  P6_FIXED_PROMPT,
  P6_FIXED_REQUEST,
  P6_OBSERVATION_CRITERIA,
  P6_PREFERENCE_CONFIDENCE,
  P6_PREFERENCE_VALUES,
  P6_PROTOCOL_FILE_HASHES,
  P6_PROTOCOL_VERSION,
  P6_REASON_TAGS,
  P6_VIEW_IDS,
  P6_VISUAL_SETTINGS
} from '../src/playbook/p6/constants.js';
import {
  P6ContractError,
  canonicalP6,
  p6Error,
  sanitizeP6Error,
  validateCameraManifest,
  validateCaptureManifest,
  validateCohortManifest,
  validateComparisonManifest,
  validateFixedRequest,
  validateGateResult,
  validateObservation,
  validatePreferenceRecord,
  validateVisualSettings
} from '../src/playbook/p6/contracts.js';

const DOCS_ROOT = new URL('../docs/architecture-playbook/evaluation/p6-v0.1/', import.meta.url);
const SCHEMAS_ROOT = new URL('../docs/architecture-playbook/evaluation/p6-v0.1/schemas/', import.meta.url);
const SOURCE_ROOT = new URL('../src/playbook/p6/', import.meta.url);
const FORBIDDEN_SCORE_FIELDS = ['aesthetic_score', 'visual_score', 'weighted_score'];
const PUBLIC_SCHEMA_FILES = [
  'camera-manifest.schema.json',
  'camera-protocol.schema.json',
  'capture-manifest.schema.json',
  'cohort-manifest.schema.json',
  'comparison-manifest.schema.json',
  'fixed-request.schema.json',
  'gate-result.schema.json',
  'observation-criteria.schema.json',
  'observation.schema.json',
  'preference-record.schema.json',
  'reason-tags.schema.json',
  'visual-settings.schema.json'
];
test('exports frozen literals and public errors without private detail leakage', () => {
  assert.equal(P6_PROTOCOL_VERSION, '0.1.0');
  assert.equal(P6_FIXED_PROMPT, 'Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base');
  assert.equal(P6_FIXED_REQUEST.root_seed, 424242);
  assert.equal(P6_FIXED_REQUEST.minecraft_version, '1.21.9');
  assert.deepEqual(P6_PREFERENCE_VALUES, ['left', 'right', 'tie']);
  assert.deepEqual(P6_PREFERENCE_CONFIDENCE, ['low', 'medium', 'high']);
  assert.deepEqual(P6_REASON_TAGS, [
    'massing',
    'hierarchy',
    'silhouette',
    'roof',
    'facade',
    'materials',
    'detail',
    'scene',
    'style-consistency',
    'capture-uncertainty'
  ]);
  assert.deepEqual(P6_VIEW_IDS, [
    'front-south',
    'side-east',
    'quarter-southeast',
    'quarter-southwest',
    'roof-birdseye',
    'entry-eye'
  ]);
  assert.equal(new Set(P6_VIEW_IDS).size, 6);
  assert.deepEqual(P6_COMPARISON_ALIASES, ['solution-A', 'solution-B', 'solution-C', 'solution-D']);
  assert.ok(P6_ERROR_CODES.includes('P6_GATE_FAILED'));

  const error = p6Error('P6_CAPTURE_INVALID');
  assert.ok(error instanceof P6ContractError);
  assert.equal(error.code, 'P6_CAPTURE_INVALID');
  assert.equal(error.message, 'P6_CAPTURE_INVALID');
  assert.equal(Object.hasOwn(error, 'rawCode'), false);
  assert.equal(Object.hasOwn(error, 'detail'), false);
  assert.equal(sanitizeP6Error(new Error('private')).code, 'P6_GATE_FAILED');
  assert.equal(sanitizeP6Error(new Error('private'), 'P6_INSTALL_FAILED').code, 'P6_INSTALL_FAILED');
  assert.equal(sanitizeP6Error({ code: 'P6_CAPTURE_INVALID' }).code, 'P6_GATE_FAILED');
});

test('fixed request is exact, immutable, and canonical', () => {
  const request = validateFixedRequest(P6_FIXED_REQUEST);
  assert.equal(request.prompt, P6_FIXED_PROMPT);
  assert.equal(request.root_seed, 424242);
  assert.equal(request.minecraft_version, '1.21.9');
  assert.ok(Object.isFrozen(request));
  assert.throws(() => {
    request.root_seed = 1;
  }, TypeError);
  assert.throws(
    () => validateFixedRequest({ ...P6_FIXED_REQUEST, score: 99 }),
    { code: 'P6_OPTIONS_INVALID' }
  );

  const canonical = canonicalP6(P6_FIXED_REQUEST, validateFixedRequest);
  const expectedBytes = stableJsonIndependent(P6_FIXED_REQUEST);
  assert.equal(canonical.bytes, expectedBytes);
  assert.equal(canonical.sha256, sha256Independent(expectedBytes));
});

test('visual settings and camera manifests enforce fixed authority hashes and six-view ordering', () => {
  const settings = validateVisualSettings(P6_VISUAL_SETTINGS);
  assert.equal(settings.width_px, 1920);
  assert.equal(settings.height_px, 1080);
  assert.equal(settings.horizontal_fov_degrees, 70);
  assert.throws(
    () => validateVisualSettings({ ...P6_VISUAL_SETTINGS, shader_pack: 'complementary' }),
    { code: 'P6_OPTIONS_INVALID' }
  );

  const manifest = validateCameraManifest(validCameraManifest());
  assert.deepEqual(manifest.views.map((item) => item.view_id), P6_VIEW_IDS);
  assert.equal(manifest.request_sha256, P6_PROTOCOL_FILE_HASHES['fixed-request.json']);
  assert.equal(manifest.settings_sha256, P6_PROTOCOL_FILE_HASHES['visual-settings.json']);

  const swappedViews = validCameraManifest();
  [swappedViews.views[0], swappedViews.views[1]] = [swappedViews.views[1], swappedViews.views[0]];
  assert.throws(() => validateCameraManifest(swappedViews), { code: 'P6_CAMERA_PROTOCOL_INVALID' });

  const missingEntryOffset = validCameraManifest();
  delete missingEntryOffset.views[5].entry_offset_blocks;
  assert.throws(() => validateCameraManifest(missingEntryOffset), { code: 'P6_CAMERA_PROTOCOL_INVALID' });

  const wrongRequestHash = validCameraManifest();
  wrongRequestHash.request_sha256 = hashFor('mutated-request');
  assert.throws(() => validateCameraManifest(wrongRequestHash), { code: 'P6_AUTHORITY_INVALID' });

  const wrongSettingsHash = validCameraManifest();
  wrongSettingsHash.settings_sha256 = hashFor('mutated-settings');
  assert.throws(() => validateCameraManifest(wrongSettingsHash), { code: 'P6_AUTHORITY_INVALID' });
});

test('cohort and capture manifests preserve frozen authorities and require complete capture metadata', () => {
  const cohort = validateCohortManifest(validCohortManifest());
  assert.deepEqual(cohort.solutions.map((item) => item.solution_id), [
    'playbook-candidate-01',
    'playbook-candidate-02',
    'playbook-candidate-03',
    'baseline-current'
  ]);
  assert.equal(cohort.request_sha256, P6_PROTOCOL_FILE_HASHES['fixed-request.json']);
  assert.equal(cohort.visual_settings_sha256, P6_PROTOCOL_FILE_HASHES['visual-settings.json']);

  const driftedCohortRequest = validCohortManifest();
  driftedCohortRequest.request_sha256 = hashFor('drifted-cohort-request');
  assert.throws(() => validateCohortManifest(driftedCohortRequest), { code: 'P6_AUTHORITY_INVALID' });

  const driftedCohortSettings = validCohortManifest();
  driftedCohortSettings.visual_settings_sha256 = hashFor('drifted-cohort-settings');
  assert.throws(() => validateCohortManifest(driftedCohortSettings), { code: 'P6_AUTHORITY_INVALID' });

  const capture = validateCaptureManifest(validCaptureManifest());
  assert.equal(capture.environment.minecraft_version, '1.21.9');
  assert.deepEqual(capture.environment.resource_pack_ids, ['vanilla']);
  assert.equal(capture.environment.viewport.width_px, 1920);
  assert.equal(capture.images.length, 24);
  assert.equal(capture.images[0].screenshot_id.startsWith('capture-'), true);

  const wrongCaptureRequest = validCaptureManifest();
  wrongCaptureRequest.request_sha256 = hashFor('drifted-capture-request');
  assert.throws(() => validateCaptureManifest(wrongCaptureRequest), { code: 'P6_AUTHORITY_INVALID' });

  const wrongCaptureSettings = validCaptureManifest();
  wrongCaptureSettings.visual_settings_sha256 = hashFor('drifted-capture-settings');
  assert.throws(() => validateCaptureManifest(wrongCaptureSettings), { code: 'P6_AUTHORITY_INVALID' });

  const nonOpaqueScreenshot = validCaptureManifest();
  nonOpaqueScreenshot.images[0].screenshot_id = 'shot-01';
  assert.throws(() => validateCaptureManifest(nonOpaqueScreenshot), { code: 'P6_CAPTURE_INVALID' });

  const wrongViewport = validCaptureManifest();
  wrongViewport.environment.viewport.width_px = 1280;
  assert.throws(() => validateCaptureManifest(wrongViewport), { code: 'P6_CAPTURE_INVALID' });

  const wrongViewCamera = validCaptureManifest();
  wrongViewCamera.images[0].camera.view_id = 'front-east';
  assert.throws(() => validateCaptureManifest(wrongViewCamera), { code: 'P6_CAPTURE_INVALID' });
});

test('observations, comparisons, preferences, and gate results stay exact and categorical', () => {
  const observation = validateObservation(validObservation());
  assert.equal(observation.rating, 'usable');
  assert.deepEqual(observation.view_ids, ['front-south', 'entry-eye']);
  const reorderedViews = validObservation();
  reorderedViews.view_ids = ['entry-eye', 'front-south'];
  assert.deepEqual(validateObservation(reorderedViews).view_ids, ['entry-eye', 'front-south']);
  const duplicateViews = validObservation();
  duplicateViews.view_ids = ['front-south', 'front-south'];
  assert.throws(() => validateObservation(duplicateViews), { code: 'P6_OBSERVATION_INVALID' });
  const emptyViews = validObservation();
  emptyViews.view_ids = [];
  assert.throws(() => validateObservation(emptyViews), { code: 'P6_OBSERVATION_INVALID' });
  const unknownView = validObservation();
  unknownView.view_ids = ['front-south', 'rear-north'];
  assert.throws(() => validateObservation(unknownView), { code: 'P6_OBSERVATION_INVALID' });

  const reorderedTags = validPreferenceRecord();
  reorderedTags.reason_tags = ['facade', 'massing'];
  assert.deepEqual(validatePreferenceRecord(reorderedTags).reason_tags, ['facade', 'massing']);
  const emptyTags = validPreferenceRecord();
  emptyTags.reason_tags = [];
  assert.deepEqual(validatePreferenceRecord(emptyTags).reason_tags, []);
  const duplicateTags = validPreferenceRecord();
  duplicateTags.reason_tags = ['massing', 'massing'];
  assert.throws(() => validatePreferenceRecord(duplicateTags), { code: 'P6_COMPARISON_INVALID' });
  const unknownTag = validPreferenceRecord();
  unknownTag.reason_tags = ['massing', 'not-a-tag'];
  assert.throws(() => validatePreferenceRecord(unknownTag), { code: 'P6_COMPARISON_INVALID' });

  const comparison = validateComparisonManifest(validComparisonManifest());
  assert.deepEqual(comparison.pairs.map((pair) => pair.pair_id), [
    'pair-01',
    'pair-02',
    'pair-03',
    'pair-04',
    'pair-05',
    'pair-06'
  ]);
  const reversedSlotOrientation = validComparisonManifest();
  reversedSlotOrientation.pairs[0] = pair('pair-01', 'solution-B', 'solution-A');
  reversedSlotOrientation.pairs[3] = pair('pair-04', 'solution-C', 'solution-B');
  assert.deepEqual(validateComparisonManifest(reversedSlotOrientation).pairs[0], reversedSlotOrientation.pairs[0]);
  const wrongPairBinding = validComparisonManifest();
  wrongPairBinding.pairs[0] = pair('pair-01', 'solution-C', 'solution-A');
  assert.throws(() => validateComparisonManifest(wrongPairBinding), { code: 'P6_COMPARISON_INVALID' });

  const gate = validateGateResult(validGateResult());
  assert.equal(gate.outcome, 'inconclusive');
  assert.equal(gate.failures.length, 1);
  const winningGate = validGateResult('playbook-supported');
  assert.deepEqual(validateGateResult(winningGate).failures, []);
  const invalidWinningGate = validGateResult('playbook-supported');
  invalidWinningGate.failures = [{ code: 'P6_GATE_FAILED', stage: 'gate', subject_id: 'gate-01' }];
  assert.throws(() => validateGateResult(invalidWinningGate), { code: 'P6_GATE_FAILED' });
  const missingFailures = validGateResult();
  delete missingFailures.failures;
  assert.throws(() => validateGateResult(missingFailures), { code: 'P6_GATE_FAILED' });
});

test('checked-in protocol JSON is canonical, hash-bound, and every persisted public contract has a schema', async () => {
  const protocolFiles = [
    'fixed-request.json',
    'visual-settings.json',
    'observation-criteria.json',
    'camera-protocol.json',
    'reason-tags.json'
  ];

  for (const filename of protocolFiles) {
    const text = await readFile(new URL(filename, DOCS_ROOT), 'utf8');
    const parsed = JSON.parse(text);
    assert.equal(text, stableJsonIndependent(parsed), filename);
    assert.equal(sha256Independent(text), P6_PROTOCOL_FILE_HASHES[filename], filename);
  }

  const schemaFiles = (await readdir(SCHEMAS_ROOT)).sort();
  assert.deepEqual(schemaFiles, PUBLIC_SCHEMA_FILES);
});

test('public schemas accept representative valid instances and reject representative invalid ones', async () => {
  const schemas = await loadSchemas();
  const validCases = new Map([
    ['fixed-request.schema.json', P6_FIXED_REQUEST],
    ['visual-settings.schema.json', P6_VISUAL_SETTINGS],
    ['camera-protocol.schema.json', P6_CAMERA_PROTOCOL],
    ['observation-criteria.schema.json', readProtocolJson('observation-criteria.json')],
    ['reason-tags.schema.json', readProtocolJson('reason-tags.json')],
    ['camera-manifest.schema.json', validCameraManifest()],
    ['cohort-manifest.schema.json', validCohortManifest()],
    ['capture-manifest.schema.json', validCaptureManifest()],
    ['observation.schema.json', validObservation()],
    ['comparison-manifest.schema.json', validComparisonManifest()],
    ['preference-record.schema.json', validPreferenceRecord()],
    ['gate-result.schema.json', validGateResult()]
  ]);
  const invalidCases = new Map([
    ['fixed-request.schema.json', { ...P6_FIXED_REQUEST, candidate_count: 4 }],
    ['visual-settings.schema.json', { ...P6_VISUAL_SETTINGS, clouds: 'fast' }],
    ['camera-protocol.schema.json', invalidCameraProtocol()],
    ['observation-criteria.schema.json', invalidObservationCriteria()],
    ['reason-tags.schema.json', invalidReasonTags()],
    ['camera-manifest.schema.json', invalidCameraManifestForSchema()],
    ['cohort-manifest.schema.json', invalidCohortManifestForSchema()],
    ['capture-manifest.schema.json', invalidCaptureManifestForSchema()],
    ['observation.schema.json', invalidObservationForSchema()],
    ['comparison-manifest.schema.json', invalidComparisonManifestForSchema()],
    ['preference-record.schema.json', invalidPreferenceRecordForSchema()],
    ['gate-result.schema.json', invalidGateResultForSchema()]
  ]);

  for (const filename of PUBLIC_SCHEMA_FILES) {
    const validErrors = validateSchemaValue(schemas.get(filename), validCases.get(filename));
    assert.deepEqual(validErrors, [], `${filename}:valid`);
    const invalidErrors = validateSchemaValue(schemas.get(filename), invalidCases.get(filename));
    assert.notDeepEqual(invalidErrors, [], `${filename}:invalid`);
  }
});

test('P6 sources, public protocol JSON, and public schemas forbid scalar score fields', async () => {
  const sourceFiles = (await readdir(SOURCE_ROOT)).filter((name) => name.endsWith('.js'));
  const docFiles = (await readdir(DOCS_ROOT)).filter((name) => name.endsWith('.json'));
  const schemaFiles = (await readdir(SCHEMAS_ROOT)).filter((name) => name.endsWith('.json'));

  for (const [root, files] of [
    [SOURCE_ROOT, sourceFiles],
    [DOCS_ROOT, docFiles],
    [SCHEMAS_ROOT, schemaFiles]
  ]) {
    for (const filename of files) {
      const text = await readFile(new URL(filename, root), 'utf8');
      for (const field of FORBIDDEN_SCORE_FIELDS) {
        assert.equal(text.includes(field), false, `${filename}:${field}`);
      }
    }
  }
});

function validCameraManifest() {
  return {
    schema_version: 1,
    protocol_version: P6_PROTOCOL_VERSION,
    solution_id: 'playbook-candidate-01',
    blueprint_sha256: hashFor('camera-blueprint'),
    build_function_sha256: hashFor('camera-build-function'),
    request_sha256: P6_PROTOCOL_FILE_HASHES['fixed-request.json'],
    settings_sha256: P6_PROTOCOL_FILE_HASHES['visual-settings.json'],
    bounds: {
      min_x: 0,
      min_y: 4,
      min_z: 0,
      max_x: 20,
      max_y: 18,
      max_z: 14
    },
    main_entry: {
      center_x: '10.500000',
      center_y: '5.000000',
      center_z: '14.500000',
      facing: 'south'
    },
    views: [
      cameraView('front-south', '10.000000', '10.300000', '42.000000', '10.000000', '10.300000', '7.000000'),
      cameraView('side-east', '48.000000', '10.300000', '7.000000', '10.000000', '10.300000', '7.000000'),
      cameraView('quarter-southeast', '29.950000', '11.700000', '26.950000', '10.000000', '11.000000', '7.000000'),
      cameraView('quarter-southwest', '-9.950000', '11.700000', '26.950000', '10.000000', '11.000000', '7.000000'),
      cameraView('roof-birdseye', '10.000000', '49.500000', '7.000000', '10.000000', '11.000000', '7.000000'),
      {
        ...cameraView('entry-eye', '10.500000', '6.620000', '22.500000', '10.500000', '5.000000', '14.500000'),
        entry_offset_blocks: 8
      }
    ]
  };
}

function cameraView(view_id, px, py, pz, tx, ty, tz) {
  return {
    view_id,
    purpose: cameraPurpose(view_id),
    horizontal_fov_degrees: 70,
    position: { x: px, y: py, z: pz },
    target: { x: tx, y: ty, z: tz }
  };
}

function validCohortManifest() {
  return {
    schema_version: 1,
    protocol_version: P6_PROTOCOL_VERSION,
    cohort_id: 'p6-v0.1',
    request_sha256: P6_PROTOCOL_FILE_HASHES['fixed-request.json'],
    visual_settings_sha256: P6_PROTOCOL_FILE_HASHES['visual-settings.json'],
    solutions: [
      cohortSolution('playbook-candidate-01', 'execute', 1, 'cohort-a'),
      cohortSolution('playbook-candidate-02', 'execute', 2, 'cohort-b'),
      cohortSolution('playbook-candidate-03', 'execute', 3, 'cohort-c'),
      cohortSolution('baseline-current', 'off', 0, 'cohort-d')
    ]
  };
}

function cohortSolution(solution_id, playbook_mode, slot_index, label) {
  return {
    solution_id,
    playbook_mode,
    slot_index,
    root_seed: 424242,
    prompt_sha256: hashFor(`${label}-prompt`),
    blueprint_sha256: hashFor(`${label}-blueprint`),
    operation_list_sha256: hashFor(`${label}-operations`),
    build_function_sha256: hashFor(`${label}-build-function`),
    hard_qa_ok: true,
    minecraft_version: '1.21.9'
  };
}

function validCaptureManifest() {
  const images = [];
  for (const [solutionIndex, solution_id] of [
    'opaque-solution-alpha',
    'opaque-solution-bravo',
    'opaque-solution-charlie',
    'opaque-solution-delta'
  ].entries()) {
    for (const [viewIndex, view_id] of P6_VIEW_IDS.entries()) {
      images.push({
        screenshot_id: `capture-${String(solutionIndex * P6_VIEW_IDS.length + viewIndex + 1).padStart(2, '0')}-opaque`,
        solution_id,
        camera: {
          position: { x: decimalFor(solutionIndex + 10), y: decimalFor(viewIndex + 20), z: decimalFor(solutionIndex + viewIndex + 30) },
          orientation: { pitch_degrees: decimalFor(viewIndex + 1), yaw_degrees: decimalFor(solutionIndex + 90) },
          view_id
        },
        build_function_sha256: hashFor(`${solution_id}-${view_id}-build`),
        image_sha256: hashFor(`${solution_id}-${view_id}-image`)
      });
    }
  }
  return {
    schema_version: 1,
    protocol_version: P6_PROTOCOL_VERSION,
    cohort_sha256: hashFor('capture-cohort'),
    camera_manifest_sha256: hashFor('capture-camera-manifest'),
    request_sha256: P6_PROTOCOL_FILE_HASHES['fixed-request.json'],
    visual_settings_sha256: P6_PROTOCOL_FILE_HASHES['visual-settings.json'],
    environment: {
      minecraft_version: '1.21.9',
      client_options_sha256: hashFor('client-options'),
      resource_pack_ids: ['vanilla'],
      viewport: {
        width_px: 1920,
        height_px: 1080,
        aspect_ratio: '16:9'
      },
      horizontal_fov_degrees: 70,
      time_of_day: 6000,
      weather: 'clear',
      world_identifier_sha256: hashFor('world-id')
    },
    images
  };
}

function validObservation() {
  return {
    schema_version: 1,
    protocol_version: P6_PROTOCOL_VERSION,
    observation_id: 'observation-01',
    solution_authority_hash: hashFor('observation-solution'),
    capture_manifest_hash: hashFor('observation-capture'),
    view_ids: ['front-south', 'entry-eye'],
    design_layer: 'facade',
    criterion: P6_OBSERVATION_CRITERIA[4],
    rating: 'usable',
    observable_paraphrase: 'Layered timber framing stays readable from the formal front and entry views.',
    evidence_regions: [
      {
        screenshot_id: 'capture-01-opaque',
        region_kind: 'whole-frame',
        region: null
      }
    ],
    rule_ids: ['rule:facade.offset-frame-for-depth'],
    limitations: ['Exterior screenshots cannot confirm unseen interior depth.'],
    reviewer_kind: 'model-assisted',
    reviewed_at: '2026-08-30T10:00:00.000Z'
  };
}

function validComparisonManifest() {
  return {
    schema_version: 1,
    protocol_version: P6_PROTOCOL_VERSION,
    cohort_sha256: hashFor('comparison-cohort'),
    capture_manifest_hash: hashFor('comparison-capture'),
    identity_map_sha256: hashFor('comparison-identity'),
    randomization_sha256: hashFor('comparison-randomization'),
    solution_codes: [...P6_COMPARISON_ALIASES],
    pairs: [
      pair('pair-01', P6_COMPARISON_ALIASES[0], P6_COMPARISON_ALIASES[1]),
      pair('pair-02', P6_COMPARISON_ALIASES[0], P6_COMPARISON_ALIASES[2]),
      pair('pair-03', P6_COMPARISON_ALIASES[0], P6_COMPARISON_ALIASES[3]),
      pair('pair-04', P6_COMPARISON_ALIASES[1], P6_COMPARISON_ALIASES[2]),
      pair('pair-05', P6_COMPARISON_ALIASES[1], P6_COMPARISON_ALIASES[3]),
      pair('pair-06', P6_COMPARISON_ALIASES[2], P6_COMPARISON_ALIASES[3])
    ],
    generated_at: '2026-08-30T10:05:00.000Z'
  };
}

function pair(pair_id, left_code, right_code) {
  return {
    pair_id,
    left_code,
    right_code,
    view_ids: [...P6_VIEW_IDS]
  };
}

function validPreferenceRecord() {
  return {
    schema_version: 1,
    protocol_version: P6_PROTOCOL_VERSION,
    comparison_manifest_hash: hashFor('preference-manifest'),
    pair_id: 'pair-01',
    choice: 'left',
    confidence: 'medium',
    reason_tags: ['massing', 'facade'],
    rationale: 'The left option reads more clearly from the front and entry views.',
    reviewer_kind: 'human',
    sealed_at: '2026-08-30T10:15:00.000Z'
  };
}

function validGateResult(outcome = 'inconclusive') {
  return {
    schema_version: 1,
    protocol_version: P6_PROTOCOL_VERSION,
    cohort_sha256: hashFor('gate-cohort'),
    capture_manifest_hash: hashFor('gate-capture'),
    comparison_manifest_hash: hashFor('gate-comparison'),
    sealed_preference_hashes: Array.from({ length: 6 }, (_, index) => hashFor(`gate-preference-${index + 1}`)),
    outcome,
    failures: outcome === 'playbook-supported'
      ? []
      : [
        {
          code: 'P6_GATE_FAILED',
          stage: 'observation',
          subject_id: 'observation-01'
        }
      ],
    next_action: outcome === 'playbook-supported'
      ? 'open-p7'
      : 'review-visual-observation-wording',
    summary_counts: {
      solution_count: 4,
      required_view_count: 6,
      formal_capture_count: 24,
      preference_record_count: 6
    },
    generated_at: '2026-08-30T10:20:00.000Z'
  };
}

function invalidCameraProtocol() {
  const value = structuredClone(P6_CAMERA_PROTOCOL);
  value.formulas[5].view_id = 'front-south';
  return value;
}

function invalidObservationCriteria() {
  const value = structuredClone(readProtocolJson('observation-criteria.json'));
  value.criteria = [...value.criteria, 'roof-score'];
  return value;
}

function invalidReasonTags() {
  const value = structuredClone(readProtocolJson('reason-tags.json'));
  value.reason_tags = [...value.reason_tags, 'weighted-score'];
  return value;
}

function invalidCameraManifestForSchema() {
  const value = validCameraManifest();
  delete value.views[5].entry_offset_blocks;
  return value;
}

function invalidCohortManifestForSchema() {
  const value = validCohortManifest();
  value.solutions = value.solutions.slice(0, 3);
  return value;
}

function invalidCaptureManifestForSchema() {
  const value = validCaptureManifest();
  value.images[0].camera.view_id = 'north-face';
  return value;
}

function invalidObservationForSchema() {
  const value = validObservation();
  value.view_ids = ['entry-eye', 'entry-eye'];
  return value;
}

function invalidComparisonManifestForSchema() {
  const value = validComparisonManifest();
  value.pairs[0] = pair('pair-01', 'solution-C', 'solution-A');
  return value;
}

function invalidPreferenceRecordForSchema() {
  const value = validPreferenceRecord();
  value.reason_tags = ['massing', 'massing'];
  return value;
}

function invalidGateResultForSchema() {
  const value = validGateResult('playbook-supported');
  value.generated_at = '2026-08-30 10:20:00Z';
  return value;
}

async function loadSchemas() {
  const entries = await Promise.all(
    PUBLIC_SCHEMA_FILES.map(async (filename) => [
      filename,
      JSON.parse(await readFile(new URL(filename, SCHEMAS_ROOT), 'utf8'))
    ])
  );
  return new Map(entries);
}

function readProtocolJson(filename) {
  const url = new URL(filename, DOCS_ROOT);
  return JSON.parse(PROTOCOL_CACHE.get(url.href));
}

const PROTOCOL_CACHE = new Map();
for (const filename of [
  'fixed-request.json',
  'visual-settings.json',
  'observation-criteria.json',
  'camera-protocol.json',
  'reason-tags.json'
]) {
  PROTOCOL_CACHE.set(new URL(filename, DOCS_ROOT).href, await readFile(new URL(filename, DOCS_ROOT), 'utf8'));
}

function validateSchemaValue(schema, value, path = '$', rootSchema = schema) {
  const errors = [];
  applySchema(schema, value, path, errors, rootSchema);
  return errors;
}

function applySchema(schema, value, path, errors, rootSchema) {
  if (!schema) return;
  if (schema.$ref) {
    applySchema(resolveRef(rootSchema, schema.$ref), value, path, errors, rootSchema);
    return;
  }
  if (schema.oneOf) {
    const branches = schema.oneOf.map((branch) => validateSchemaValue(branch, value, path, rootSchema));
    const matches = branches.filter((entry) => entry.length === 0).length;
    if (matches !== 1) errors.push(`${path}:oneOf`);
  }
  if (schema.if) {
    const ifErrors = validateSchemaValue(schema.if, value, path, rootSchema);
    if (ifErrors.length === 0 && schema.then) applySchema(schema.then, value, path, errors, rootSchema);
    if (ifErrors.length !== 0 && schema.else) applySchema(schema.else, value, path, errors, rootSchema);
  }
  if (schema.type !== undefined) applyType(schema.type, value, path, errors);
  if (schema.const !== undefined && !deepEqualSchema(value, schema.const)) errors.push(`${path}:const`);
  if (schema.enum && !schema.enum.some((item) => deepEqualSchema(item, value))) errors.push(`${path}:enum`);
  if (schema.pattern && (typeof value !== 'string' || !(new RegExp(schema.pattern, 'u')).test(value))) errors.push(`${path}:pattern`);
  if (schema.format === 'date-time' && (typeof value !== 'string' || !isRfc3339DateTime(value))) errors.push(`${path}:format`);
  if (schema.minLength !== undefined && (typeof value !== 'string' || value.length < schema.minLength)) errors.push(`${path}:minLength`);
  if (schema.maxLength !== undefined && (typeof value !== 'string' || value.length > schema.maxLength)) errors.push(`${path}:maxLength`);
  if (schema.minimum !== undefined && (typeof value !== 'number' || value < schema.minimum)) errors.push(`${path}:minimum`);

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}:minItems`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}:maxItems`);
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const item of value) {
        const encoded = JSON.stringify(item);
        if (seen.has(encoded)) {
          errors.push(`${path}:uniqueItems`);
          break;
        }
        seen.add(encoded);
      }
    }
    if (schema.prefixItems) {
      for (const [index, itemSchema] of schema.prefixItems.entries()) {
        applySchema(itemSchema, value[index], `${path}[${index}]`, errors, rootSchema);
      }
      if (schema.items === false && value.length !== schema.prefixItems.length) errors.push(`${path}:items`);
    } else if (schema.items && schema.items !== false) {
      value.forEach((item, index) => applySchema(schema.items, item, `${path}[${index}]`, errors, rootSchema));
    }
  }

  if (isPlainObject(value)) {
    if (schema.required) {
      for (const key of schema.required) if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}:required`);
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(value)) if (!Object.hasOwn(schema.properties, key)) errors.push(`${path}.${key}:additionalProperties`);
    }
    if (schema.properties) {
      for (const [key, propertySchema] of Object.entries(schema.properties)) {
        if (Object.hasOwn(value, key)) applySchema(propertySchema, value[key], `${path}.${key}`, errors, rootSchema);
      }
    }
  }
}

function applyType(type, value, path, errors) {
  const allowed = Array.isArray(type) ? type : [type];
  const okay = allowed.some((entry) => matchesType(entry, value));
  if (!okay) errors.push(`${path}:type`);
}

function matchesType(type, value) {
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return isPlainObject(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'null') return value === null;
  return typeof value === type;
}

function deepEqualSchema(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function resolveRef(rootSchema, ref) {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported ref: ${ref}`);
  const segments = ref.slice(2).split('/');
  let current = rootSchema;
  for (const segment of segments) current = current[segment];
  return current;
}

function isRfc3339DateTime(value) {
  const expression = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
  return expression.test(value) && !Number.isNaN(Date.parse(value));
}

function hashFor(label) {
  return sha256Independent(label);
}

function sha256Independent(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJsonIndependent(value) {
  return `${JSON.stringify(sortIndependent(value), null, 2)}\n`;
}

function sortIndependent(value) {
  if (Array.isArray(value)) return value.map(sortIndependent);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortIndependent(value[key])])
  );
}

function decimalFor(value) {
  return `${value.toFixed(6)}`;
}

function cameraPurpose(viewId) {
  return {
    'front-south': 'principal-facade-hierarchy',
    'side-east': 'side-facade-depth',
    'quarter-southeast': 'volume-attachment-roof-silhouette',
    'quarter-southwest': 'opposite-volume-relationship',
    'roof-birdseye': 'roof-composition-footprint',
    'entry-eye': 'approach-scale-entrance-legibility'
  }[viewId];
}
