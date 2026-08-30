import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  P6_ERROR_CODES,
  P6_FIXED_PROMPT,
  P6_FIXED_REQUEST,
  P6_OBSERVATION_CRITERIA,
  P6_OBSERVATION_RATINGS,
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

const HASH = 'a'.repeat(64);
const DOCS_ROOT = new URL('../docs/architecture-playbook/evaluation/p6-v0.1/', import.meta.url);
const SCHEMAS_ROOT = new URL('./../docs/architecture-playbook/evaluation/p6-v0.1/schemas/', import.meta.url);
const SOURCE_ROOT = new URL('../src/playbook/p6/', import.meta.url);
const FORBIDDEN_SCORE_FIELDS = ['aesthetic_score', 'visual_score', 'weighted_score'];

test('exports the frozen protocol literals, enums, and stable error codes', () => {
  assert.equal(P6_PROTOCOL_VERSION, '0.1.0');
  assert.equal(P6_FIXED_PROMPT, 'Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base');
  assert.equal(P6_FIXED_REQUEST.root_seed, 424242);
  assert.equal(P6_FIXED_REQUEST.minecraft_version, '1.21.9');
  assert.equal(P6_FIXED_REQUEST.mode, 'mock');
  assert.equal(P6_FIXED_REQUEST.candidate_count, 3);
  assert.equal(P6_FIXED_REQUEST.candidate_rounds, 1);
  assert.equal(P6_FIXED_REQUEST.candidate_force_rounds, false);
  assert.deepEqual(P6_VIEW_IDS, [
    'front-south',
    'side-east',
    'quarter-southeast',
    'quarter-southwest',
    'roof-birdseye',
    'entry-eye'
  ]);
  assert.equal(new Set(P6_VIEW_IDS).size, 6);
  assert.deepEqual(P6_OBSERVATION_RATINGS, ['strong', 'usable', 'weak', 'fail', 'unknown']);
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
  assert.deepEqual(P6_ERROR_CODES, [
    'P6_OPTIONS_INVALID',
    'P6_COHORT_INCOMPLETE',
    'P6_AUTHORITY_INVALID',
    'P6_CAMERA_PROTOCOL_INVALID',
    'P6_RENDER_FAILED',
    'P6_CAPTURE_AUTHORIZATION_REQUIRED',
    'P6_CAPTURE_INVALID',
    'P6_OBSERVATION_INVALID',
    'P6_COMPARISON_INVALID',
    'P6_HUMAN_PREFERENCE_REQUIRED',
    'P6_GATE_FAILED',
    'P6_INSTALL_FAILED'
  ]);
  assert.equal(p6Error('P6_CAPTURE_INVALID').code, 'P6_CAPTURE_INVALID');
  assert.equal(sanitizeP6Error(new Error('private'), 'P6_GATE_FAILED').code, 'P6_GATE_FAILED');
  assert.equal(sanitizeP6Error(p6Error('not-public'), 'P6_GATE_FAILED').code, 'P6_GATE_FAILED');
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
  assert.throws(
    () => validateFixedRequest({ ...P6_FIXED_REQUEST, candidate_count: 4 }),
    { code: 'P6_OPTIONS_INVALID' }
  );

  const canonical = canonicalP6(P6_FIXED_REQUEST, validateFixedRequest);
  const independentBytes = stableJsonIndependent(P6_FIXED_REQUEST);
  assert.equal(canonical.bytes, independentBytes);
  assert.equal(canonical.sha256, sha256Independent(independentBytes));
  assert.ok(Object.isFrozen(canonical));
  assert.ok(Object.isFrozen(canonical.value));
});

test('visual settings and camera manifests enforce the fixed six-view protocol', () => {
  const settings = validateVisualSettings(P6_VISUAL_SETTINGS);
  assert.equal(settings.width_px, 1920);
  assert.equal(settings.height_px, 1080);
  assert.equal(settings.horizontal_fov_degrees, 70);
  assert.ok(Object.isFrozen(settings.hidden_overlays));
  assert.throws(
    () => validateVisualSettings({ ...P6_VISUAL_SETTINGS, shader_pack: 'complementary' }),
    { code: 'P6_OPTIONS_INVALID' }
  );

  const manifest = validateCameraManifest(validCameraManifest());
  assert.deepEqual(manifest.views.map((item) => item.view_id), P6_VIEW_IDS);
  assert.equal(manifest.views[0].position.z, '42.000000');
  const duplicate = validCameraManifest();
  duplicate.views[1].view_id = duplicate.views[0].view_id;
  assert.throws(() => validateCameraManifest(duplicate), { code: 'P6_CAMERA_PROTOCOL_INVALID' });

  const drift = validCameraManifest();
  drift.views[5].entry_offset_blocks = 7;
  assert.throws(() => validateCameraManifest(drift), { code: 'P6_CAMERA_PROTOCOL_INVALID' });
});

test('cohort and capture manifests reject drift and preserve the frozen solution grid', () => {
  const cohort = validateCohortManifest(validCohortManifest());
  assert.deepEqual(cohort.solutions.map((item) => item.solution_id), [
    'playbook-candidate-01',
    'playbook-candidate-02',
    'playbook-candidate-03',
    'baseline-current'
  ]);
  assert.equal(cohort.solutions[3].playbook_mode, 'off');
  const missing = validCohortManifest();
  missing.solutions.pop();
  assert.throws(() => validateCohortManifest(missing), { code: 'P6_COHORT_INCOMPLETE' });

  const capture = validateCaptureManifest(validCaptureManifest());
  assert.equal(capture.images.length, 24);
  assert.equal(new Set(capture.images.map((item) => item.screenshot_id)).size, 24);
  const wrongSize = validCaptureManifest();
  wrongSize.images[0].width_px = 1280;
  assert.throws(() => validateCaptureManifest(wrongSize), { code: 'P6_CAPTURE_INVALID' });
  const mixedEnvironment = validCaptureManifest();
  mixedEnvironment.images[5].environment_sha256 = 'b'.repeat(64);
  assert.throws(() => validateCaptureManifest(mixedEnvironment), { code: 'P6_CAPTURE_INVALID' });
});

test('observations, comparisons, and preferences stay categorical and exact', () => {
  const observation = validateObservation(validObservation());
  assert.equal(observation.rating, 'usable');
  assert.equal(observation.reviewer_kind, 'model-assisted');
  const evidenceFree = validObservation();
  evidenceFree.evidence_regions = [];
  assert.throws(() => validateObservation(evidenceFree), { code: 'P6_OBSERVATION_INVALID' });
  const scalarDrift = validObservation();
  scalarDrift.rating = '8';
  assert.throws(() => validateObservation(scalarDrift), { code: 'P6_OBSERVATION_INVALID' });

  const comparison = validateComparisonManifest(validComparisonManifest());
  assert.equal(comparison.pairs.length, 6);
  const duplicatePair = validComparisonManifest();
  duplicatePair.pairs[5] = { ...duplicatePair.pairs[0], pair_id: 'pair-06' };
  assert.throws(() => validateComparisonManifest(duplicatePair), { code: 'P6_COMPARISON_INVALID' });

  const preference = validatePreferenceRecord(validPreferenceRecord());
  assert.equal(preference.choice, 'left');
  assert.equal(preference.reviewer_kind, 'human');
  const unsupportedChoice = validPreferenceRecord();
  unsupportedChoice.choice = 'candidate-01';
  assert.throws(() => validatePreferenceRecord(unsupportedChoice), { code: 'P6_COMPARISON_INVALID' });
  const unsupportedTag = validPreferenceRecord();
  unsupportedTag.reason_tags = ['massing', 'facade-depth'];
  assert.throws(() => validatePreferenceRecord(unsupportedTag), { code: 'P6_COMPARISON_INVALID' });
});

test('gate results remain descriptive and the checked-in schemas stay fail-closed', async () => {
  const gate = validateGateResult(validGateResult());
  assert.equal(gate.outcome, 'inconclusive');
  assert.equal(gate.next_action, 'review-visual-observation-wording');
  const winningGate = validGateResult();
  winningGate.outcome = 'playbook-supported';
  winningGate.next_action = 'open-p7';
  assert.equal(validateGateResult(winningGate).next_action, 'open-p7');
  const scored = validGateResult();
  scored.weighted_score = 0.75;
  assert.throws(() => validateGateResult(scored), { code: 'P6_GATE_FAILED' });

  const schemaFiles = await readdir(SCHEMAS_ROOT);
  assert.deepEqual(schemaFiles.sort(), [
    'camera-manifest.schema.json',
    'capture-manifest.schema.json',
    'cohort-manifest.schema.json',
    'comparison-manifest.schema.json',
    'fixed-request.schema.json',
    'gate-result.schema.json',
    'observation.schema.json',
    'preference-record.schema.json',
    'visual-settings.schema.json'
  ]);

  for (const filename of schemaFiles) {
    const schema = JSON.parse(await readFile(new URL(filename, SCHEMAS_ROOT), 'utf8'));
    assert.equal(schema.type, 'object', filename);
    assert.equal(schema.additionalProperties, false, filename);
    assert.ok(Array.isArray(schema.required) && schema.required.length > 0, filename);
    assert.equal(schema.properties.schema_version?.const, 1, filename);
  }
});

test('checked-in protocol JSON is canonical and hash-bound', async () => {
  const expectedFiles = [
    'fixed-request.json',
    'visual-settings.json',
    'observation-criteria.json',
    'camera-protocol.json',
    'reason-tags.json'
  ];

  for (const filename of expectedFiles) {
    const text = await readFile(new URL(filename, DOCS_ROOT), 'utf8');
    const parsed = JSON.parse(text);
    assert.equal(text, stableJsonIndependent(parsed), filename);
    assert.equal(sha256Independent(text), P6_PROTOCOL_FILE_HASHES[filename], filename);
  }
});

test('P6 protocol sources and checked-in JSON forbid scalar score fields', async () => {
  const sourceFiles = (await readdir(SOURCE_ROOT)).filter((item) => item.endsWith('.js'));
  const docFiles = (await readdir(DOCS_ROOT)).filter((item) => item.endsWith('.json'));

  for (const filename of [...sourceFiles, ...docFiles]) {
    const root = sourceFiles.includes(filename) ? SOURCE_ROOT : DOCS_ROOT;
    const text = await readFile(new URL(filename, root), 'utf8');
    for (const field of FORBIDDEN_SCORE_FIELDS) {
      assert.equal(text.includes(field), false, `${filename}:${field}`);
    }
  }
});

function validCameraManifest() {
  return {
    schema_version: 1,
    protocol_version: P6_PROTOCOL_VERSION,
    solution_id: 'playbook-candidate-01',
    blueprint_sha256: HASH,
    build_function_sha256: HASH,
    request_sha256: HASH,
    settings_sha256: HASH,
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
      cameraView('front-south', '10.000000', '10.300000', '42.000000', '10.000000', '10.300000', '7.000000', 'principal-facade-hierarchy'),
      cameraView('side-east', '48.000000', '10.300000', '7.000000', '10.000000', '10.300000', '7.000000', 'side-facade-depth'),
      cameraView('quarter-southeast', '29.950000', '11.700000', '26.950000', '10.000000', '11.000000', '7.000000', 'volume-attachment-roof-silhouette'),
      cameraView('quarter-southwest', '-9.950000', '11.700000', '26.950000', '10.000000', '11.000000', '7.000000', 'opposite-volume-relationship'),
      cameraView('roof-birdseye', '10.000000', '49.500000', '7.000000', '10.000000', '11.000000', '7.000000', 'roof-composition-footprint'),
      {
        ...cameraView('entry-eye', '10.500000', '6.620000', '22.500000', '10.500000', '5.000000', '14.500000', 'approach-scale-entrance-legibility'),
        entry_offset_blocks: 8
      }
    ]
  };
}

function cameraView(view_id, px, py, pz, tx, ty, tz, purpose) {
  return {
    view_id,
    purpose,
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
    request_sha256: HASH,
    visual_settings_sha256: HASH,
    solutions: [
      cohortSolution('playbook-candidate-01', 'execute', 1),
      cohortSolution('playbook-candidate-02', 'execute', 2),
      cohortSolution('playbook-candidate-03', 'execute', 3),
      cohortSolution('baseline-current', 'off', 0)
    ]
  };
}

function cohortSolution(solution_id, playbook_mode, slot_index) {
  return {
    solution_id,
    playbook_mode,
    slot_index,
    root_seed: 424242,
    prompt_sha256: HASH,
    blueprint_sha256: HASH,
    operation_list_sha256: HASH,
    build_function_sha256: HASH,
    hard_qa_ok: true,
    minecraft_version: '1.21.9'
  };
}

function validCaptureManifest() {
  const environment = {
    minecraft_version: '1.21.9',
    capture_kind: 'minecraft-capture',
    environment_sha256: HASH,
    client_options_sha256: HASH,
    world_identifier_sha256: HASH
  };
  const images = [];
  const solutionIds = [
    'opaque-solution-a',
    'opaque-solution-b',
    'opaque-solution-c',
    'opaque-solution-d'
  ];
  for (const solution_id of solutionIds) {
    for (const view_id of P6_VIEW_IDS) {
      images.push({
        screenshot_id: `shot-${String(images.length + 1).padStart(2, '0')}`,
        solution_id,
        view_id,
        width_px: 1920,
        height_px: 1080,
        environment_sha256: HASH,
        image_sha256: HASH
      });
    }
  }
  return {
    schema_version: 1,
    protocol_version: P6_PROTOCOL_VERSION,
    cohort_sha256: HASH,
    camera_manifest_sha256: HASH,
    request_sha256: HASH,
    visual_settings_sha256: HASH,
    environment,
    images
  };
}

function validObservation() {
  return {
    schema_version: 1,
    protocol_version: P6_PROTOCOL_VERSION,
    observation_id: 'observation-01',
    solution_authority_hash: HASH,
    capture_manifest_hash: HASH,
    view_ids: ['front-south', 'entry-eye'],
    design_layer: 'facade',
    criterion: P6_OBSERVATION_CRITERIA[4],
    rating: 'usable',
    observable_paraphrase: 'Layered timber framing is legible around the entry and upper facade.',
    evidence_regions: [
      {
        screenshot_id: 'shot-01',
        region_kind: 'whole-frame',
        region: null
      }
    ],
    rule_ids: ['rule:facade.offset-frame-for-depth'],
    limitations: ['Lighting does not show interior depth.'],
    reviewer_kind: 'model-assisted',
    reviewed_at: '2026-08-30T10:00:00.000Z'
  };
}

function validComparisonManifest() {
  return {
    schema_version: 1,
    protocol_version: P6_PROTOCOL_VERSION,
    cohort_sha256: HASH,
    capture_manifest_hash: HASH,
    identity_map_sha256: HASH,
    randomization_sha256: HASH,
    solution_codes: [
      'opaque-solution-a',
      'opaque-solution-b',
      'opaque-solution-c',
      'opaque-solution-d'
    ],
    pairs: [
      pair('pair-01', 'opaque-solution-a', 'opaque-solution-b'),
      pair('pair-02', 'opaque-solution-a', 'opaque-solution-c'),
      pair('pair-03', 'opaque-solution-a', 'opaque-solution-d'),
      pair('pair-04', 'opaque-solution-b', 'opaque-solution-c'),
      pair('pair-05', 'opaque-solution-b', 'opaque-solution-d'),
      pair('pair-06', 'opaque-solution-c', 'opaque-solution-d')
    ],
    generated_at: '2026-08-30T10:05:00.000Z'
  };
}

function pair(pair_id, left_code, right_code) {
  return {
    pair_id,
    left_code,
    right_code,
    view_ids: P6_VIEW_IDS
  };
}

function validPreferenceRecord() {
  return {
    schema_version: 1,
    protocol_version: P6_PROTOCOL_VERSION,
    comparison_manifest_hash: HASH,
    pair_id: 'pair-01',
    choice: 'left',
    confidence: 'medium',
    reason_tags: ['massing', 'facade'],
    rationale: 'The left option reads more clearly from the front and quarter views.',
    reviewer_kind: 'human',
    sealed_at: '2026-08-30T10:15:00.000Z'
  };
}

function validGateResult() {
  return {
    schema_version: 1,
    protocol_version: P6_PROTOCOL_VERSION,
    cohort_sha256: HASH,
    capture_manifest_hash: HASH,
    comparison_manifest_hash: HASH,
    sealed_preference_hashes: Array.from({ length: 6 }, (_, index) => `${String(index).repeat(64)}`),
    outcome: 'inconclusive',
    next_action: 'review-visual-observation-wording',
    summary_counts: {
      solution_count: 4,
      required_view_count: 6,
      formal_capture_count: 24,
      preference_record_count: 6
    },
    generated_at: '2026-08-30T10:20:00.000Z'
  };
}

function stableJsonIndependent(value) {
  return `${JSON.stringify(sortIndependent(value), null, 2)}\n`;
}

function sortIndependent(value) {
  if (Array.isArray(value)) return value.map(sortIndependent);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortIndependent(value[key])])
  );
}

function sha256Independent(value) {
  return createHash('sha256').update(value).digest('hex');
}
