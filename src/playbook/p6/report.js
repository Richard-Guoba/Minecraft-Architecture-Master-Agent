import { deepFreeze, sha256, stableJson } from '../shadow/canonical.js';
import {
  P6_MINECRAFT_VERSION,
  P6_OBSERVATION_CRITERIA,
  P6_ERROR_CODES,
  P6_PROTOCOL_VERSION,
  P6_SCHEMA_VERSION,
  P6_VIEW_IDS
} from './constants.js';
import {
  validateCaptureManifest,
  validateCohortManifest,
  validateComparisonManifest,
  validatePreferenceRecord
} from './contracts.js';
import { compileObservationSet } from './observations.js';

const HASH = /^[a-f0-9]{64}$/u;
const SOLUTION_IDS = Object.freeze([
  'playbook-candidate-01', 'playbook-candidate-02', 'playbook-candidate-03', 'baseline-current'
]);
const REGRESSION_FIELDS = Object.freeze(['p4', 'p5', 'playbook_off', 'six_episode_golden']);
const EVIDENCE_HASH_FIELDS = Object.freeze([
  'cohort', 'reference_renders', 'formal_captures', 'observations',
  'comparisons', 'sealed_preferences', 'private_reveal', 'regressions'
]);
const GATE_FIELDS = Object.freeze([
  'schema_version', 'protocol_version', 'status', 'p7_allowed', 'outcome',
  'failures', 'next_action', 'advice', 'summary_counts'
]);
const SUMMARY_FIELDS = Object.freeze([
  'solution_count', 'required_view_count', 'reference_image_count', 'formal_capture_count',
  'observation_count', 'comparison_count', 'preference_record_count'
]);
const COLLECT_ADVICE = Object.freeze({
  kind: 'collect-p6-evidence',
  message: 'Collect and validate every listed prerequisite before interpreting a preference outcome.'
});
const START_ADVICE = Object.freeze({
  kind: 'start-p7',
  message: 'The complete categorical evidence supports at least one playbook solution over the baseline.'
});
const REVIEW_ADVICE = Object.freeze({
  kind: 'review-p5-evidence',
  message: 'Review cited weak/fail observations and their bound P5 artifacts before adding episodes or changing the playbook.'
});

export function evaluateP6Gate(evidence) {
  const failures = [];
  const fail = (stage, code) => {
    if (!failures.some(row => row.stage === stage)) failures.push({ stage, code });
  };
  const value = plain(evidence) ? evidence : {};
  let cohort;
  let captureManifest;
  let comparisonManifest;

  try {
    cohort = validateCohortManifest(value.cohort);
    if (stableJson(cohort.solutions.map(row => row.solution_id)) !== stableJson(SOLUTION_IDS)
      || cohort.solutions.some(row => row.hard_qa_ok !== true)) fail('cohort', 'P6_COHORT_INCOMPLETE');
  } catch { fail('cohort', 'P6_COHORT_INCOMPLETE'); }

  if (!validReferences(value.referenceManifest, cohort)) fail('reference-renders', 'P6_RENDER_FAILED');

  try {
    captureManifest = validateCaptureManifest(value.captureManifest);
    if (!cohort || captureManifest.cohort_sha256 !== sha256(stableJson(cohort))
      || !exactSolutionViews(captureManifest.images, 'solution_id', row => row.camera?.view_id)) {
      fail('formal-captures', 'P6_CAPTURE_INVALID');
    }
  } catch { fail('formal-captures', 'P6_CAPTURE_INVALID'); }
  if (captureManifest && value.referenceManifest?.camera_manifest_sha256
    !== captureManifest.camera_manifest_sha256) fail('reference-renders', 'P6_RENDER_FAILED');
  if (!validEnvironment(captureManifest?.environment)) fail('environment', 'P6_CAPTURE_INVALID');

  if (!validObservationSet(value.observationSet, cohort, captureManifest)) {
    fail('observations', 'P6_OBSERVATION_INVALID');
  }

  try {
    comparisonManifest = validateComparisonManifest(value.comparisonManifest);
    if (!cohort || !captureManifest
      || comparisonManifest.cohort_sha256 !== sha256(stableJson(cohort))
      || comparisonManifest.capture_manifest_hash !== sha256(stableJson(captureManifest))) {
      fail('comparisons', 'P6_COMPARISON_INVALID');
    }
  } catch { fail('comparisons', 'P6_COMPARISON_INVALID'); }

  if (!validSealedPreferences(value.sealedPreferences, comparisonManifest)) {
    fail('sealed-preferences', 'P6_HUMAN_PREFERENCE_REQUIRED');
  }
  if (!validReveal(value.revealedResults, value.sealedPreferences)) {
    fail('private-reveal', 'P6_COMPARISON_INVALID');
  }
  if (!validRegressions(value.regressions)) fail('regressions', 'P6_GATE_FAILED');

  const complete = failures.length === 0;
  const outcome = complete ? categoricalOutcome(value.revealedResults) : 'not-evaluated';
  const advice = !complete
    ? COLLECT_ADVICE
    : outcome === 'playbook-supported'
    ? START_ADVICE
    : REVIEW_ADVICE;
  return deepFreeze({
    schema_version: P6_SCHEMA_VERSION,
    protocol_version: P6_PROTOCOL_VERSION,
    status: complete ? 'pass' : 'blocked',
    p7_allowed: complete,
    outcome,
    failures,
    next_action: complete
      ? { kind: 'start-p7' }
      : { kind: 'collect-p6-evidence', stages: failures.map(row => row.stage) },
    advice,
    summary_counts: {
      solution_count: cohort?.solutions?.length ?? 0,
      required_view_count: P6_VIEW_IDS.length,
      reference_image_count: Array.isArray(value.referenceManifest?.images) ? value.referenceManifest.images.length : 0,
      formal_capture_count: Array.isArray(captureManifest?.images) ? captureManifest.images.length : 0,
      observation_count: Number.isInteger(value.observationSet?.observation_count) ? value.observationSet.observation_count : 0,
      comparison_count: Array.isArray(comparisonManifest?.pairs) ? comparisonManifest.pairs.length : 0,
      preference_record_count: Array.isArray(value.sealedPreferences?.records) ? value.sealedPreferences.records.length : 0
    }
  });
}

export function renderP6Report({ gate, evidenceHashes } = {}) {
  if (!validGate(gate) || !plain(evidenceHashes)
    || !sameExactKeys(evidenceHashes, EVIDENCE_HASH_FIELDS)
    || Object.values(evidenceHashes).some(value => !HASH.test(value))) {
    throw new TypeError('P6_GATE_FAILED');
  }
  const lines = [
    '# P6 fixed-view blind-comparison report', '',
    `Status: ${gate.status}`, `P7 allowed: ${gate.p7_allowed ? 'yes' : 'no'}`,
    `Outcome: ${gate.outcome}`, `Next action: ${gate.next_action?.kind ?? 'collect-p6-evidence'}`, '',
    gate.advice?.message ?? '', '', '## Evidence SHA-256', ''
  ];
  for (const field of EVIDENCE_HASH_FIELDS) lines.push(`- ${field}: ${evidenceHashes[field]}`);
  lines.push('', '## Blocking prerequisites', '');
  if (gate.failures?.length) {
    for (const failure of gate.failures) lines.push(`- ${failure.stage}: ${failure.code}`);
  } else lines.push('- none');
  lines.push('', 'This is a categorical protocol result, not a scalar rating or a statistical claim.', '');
  return lines.join('\n');
}

function validGate(value) {
  if (!plain(value) || !sameExactKeys(value, GATE_FIELDS)
    || value.schema_version !== P6_SCHEMA_VERSION || value.protocol_version !== P6_PROTOCOL_VERSION
    || !['pass', 'blocked'].includes(value.status) || value.p7_allowed !== (value.status === 'pass')
    || !['playbook-supported', 'baseline-supported', 'inconclusive', 'not-evaluated'].includes(value.outcome)
    || !Array.isArray(value.failures) || !plain(value.next_action) || !plain(value.advice)
    || !plain(value.summary_counts) || !sameExactKeys(value.summary_counts, SUMMARY_FIELDS)
    || SUMMARY_FIELDS.some(field => !Number.isSafeInteger(value.summary_counts[field]) || value.summary_counts[field] < 0)) return false;
  if (value.failures.some(row => !plain(row) || !sameExactKeys(row, ['stage', 'code'])
    || typeof row.stage !== 'string' || !P6_ERROR_CODES.includes(row.code))) return false;
  const expectedNext = value.status === 'pass'
    ? { kind: 'start-p7' }
    : { kind: 'collect-p6-evidence', stages: value.failures.map(row => row.stage) };
  const expectedAdvice = value.status === 'blocked' ? COLLECT_ADVICE
    : value.outcome === 'playbook-supported' ? START_ADVICE : REVIEW_ADVICE;
  return (value.status === 'blocked') === (value.outcome === 'not-evaluated')
    && (value.status === 'blocked') === (value.failures.length > 0)
    && stableJson(value.next_action) === stableJson(expectedNext)
    && stableJson(value.advice) === stableJson(expectedAdvice);
}

function validReferences(value, cohort) {
  if (!plain(value) || !cohort
    || !sameExactKeys(value, ['schema_version', 'kind', 'cohort_input_sha256', 'camera_manifest_sha256', 'images'])
    || value.schema_version !== 1 || value.kind !== 'reference-render'
    || !HASH.test(value.cohort_input_sha256) || !HASH.test(value.camera_manifest_sha256)
    || !exactSolutionViews(value.images, 'solution_id', row => row.view_id)) return false;
  const expected = new Map(cohort.solutions.map(row => [row.solution_id, row]));
  const filenames = new Set();
  for (const row of value.images) {
    if (!plain(row) || !sameExactKeys(row, ['filename', 'image_sha256', 'view_id', 'solution_id', 'width', 'height'])
      || !expected.has(row.solution_id) || !P6_VIEW_IDS.includes(row.view_id)
      || typeof row.filename !== 'string' || row.filename.length === 0 || filenames.has(row.filename)
      || !HASH.test(row.image_sha256) || row.width !== 1920 || row.height !== 1080) return false;
    filenames.add(row.filename);
  }
  return true;
}

function exactSolutionViews(rows, solutionField, viewOf) {
  if (!Array.isArray(rows) || rows.length !== 24) return false;
  const actual = rows.map(row => `${row?.[solutionField]}/${viewOf(row)}`);
  const expected = SOLUTION_IDS.flatMap((_, index) => P6_VIEW_IDS.map(view => `${OPAQUE_OR_REAL(rows, index)}/${view}`));
  return new Set(actual).size === 24 && actual.every(item => expected.includes(item));
}

function OPAQUE_OR_REAL(rows, index) {
  const ids = new Set(rows.map(row => row?.solution_id));
  return ids.has(SOLUTION_IDS[index]) ? SOLUTION_IDS[index] : `opaque-solution-${['alpha', 'bravo', 'charlie', 'delta'][index]}`;
}

function validEnvironment(value) {
  return plain(value) && value.minecraft_version === P6_MINECRAFT_VERSION
    && HASH.test(value.client_options_sha256) && HASH.test(value.world_identifier_sha256)
    && Array.isArray(value.resource_pack_ids) && value.resource_pack_ids.length === 1
    && value.resource_pack_ids[0] === 'vanilla' && plain(value.viewport)
    && value.viewport.width_px === 1920 && value.viewport.height_px === 1080
    && value.viewport.aspect_ratio === '16:9' && value.horizontal_fov_degrees === 70
    && value.time_of_day === 6000 && value.weather === 'clear';
}

function validObservationSet(value, cohort, captureManifest) {
  try {
    if (!plain(value) || !cohort || !captureManifest || value.status !== 'complete'
      || value.gate_ready !== true || value.observation_count !== 4 * P6_OBSERVATION_CRITERIA.length
      || value.required_observation_count !== 4 * P6_OBSERVATION_CRITERIA.length) return false;
    return stableJson(compileObservationSet({ cohort, captureManifest, observations: value.observations }))
      === stableJson(value);
  } catch { return false; }
}

function validSealedPreferences(value, comparisonManifest) {
  try {
    if (!plain(value) || !comparisonManifest || value.status !== 'sealed'
      || !sameExactKeys(value, [
        'schema_version', 'protocol_version', 'status', 'comparison_manifest_hash',
        'identity_map_sha256', 'reviewer_pseudonym', 'pairs', 'records', 'sealed_preference_hashes'
      ])
      || value.schema_version !== P6_SCHEMA_VERSION || value.protocol_version !== P6_PROTOCOL_VERSION
      || !HASH.test(value.identity_map_sha256)
      || value.comparison_manifest_hash !== sha256(stableJson(comparisonManifest))
      || !Array.isArray(value.records) || value.records.length !== 6
      || !Array.isArray(value.pairs) || stableJson(value.pairs) !== stableJson(comparisonManifest.pairs)
      || !Array.isArray(value.sealed_preference_hashes) || value.sealed_preference_hashes.length !== 6) return false;
    for (let index = 0; index < 6; index += 1) {
      const record = validatePreferenceRecord(value.records[index]);
      if (record.pair_id !== comparisonManifest.pairs[index].pair_id
        || value.sealed_preference_hashes[index] !== sha256(stableJson(record))) return false;
    }
    return true;
  } catch { return false; }
}

function validReveal(value, sealed) {
  if (!plain(value) || !plain(sealed)
    || !sameExactKeys(value, ['categorical_counts', 'pair_decisions'])
    || !plain(value.categorical_counts)
    || !sameExactKeys(value.categorical_counts, ['left', 'right', 'tie'])
    || !Array.isArray(value.pair_decisions) || value.pair_decisions.length !== 6
    || !Array.isArray(sealed.records) || sealed.records.length !== 6) return false;
  const counts = { left: 0, right: 0, tie: 0 };
  const unorderedPairs = new Set();
  for (let index = 0; index < 6; index += 1) {
    const row = value.pair_decisions[index];
    const record = sealed.records[index];
    if (!plain(row) || !sameExactKeys(row, [
      'pair_id', 'left_solution_id', 'right_solution_id', 'decision',
      'preferred_solution_id', 'confidence', 'reason_tags'
    ]) || row.pair_id !== record.pair_id || row.decision !== record.choice
      || !SOLUTION_IDS.includes(row.left_solution_id) || !SOLUTION_IDS.includes(row.right_solution_id)
      || row.left_solution_id === row.right_solution_id
      || row.preferred_solution_id !== (row.decision === 'left' ? row.left_solution_id : row.decision === 'right' ? row.right_solution_id : null)
      || row.confidence !== record.confidence || stableJson(row.reason_tags) !== stableJson(record.reason_tags)) return false;
    counts[row.decision] += 1;
    unorderedPairs.add([row.left_solution_id, row.right_solution_id].sort().join('/'));
  }
  return unorderedPairs.size === 6
    && stableJson(counts) === stableJson(value.categorical_counts);
}

function validRegressions(value) {
  return plain(value) && sameExactKeys(value, REGRESSION_FIELDS)
    && REGRESSION_FIELDS.every(field => value[field] === 'pass');
}

function categoricalOutcome(reveal) {
  const baselinePairs = reveal.pair_decisions.filter(row => (
    row.left_solution_id === 'baseline-current' || row.right_solution_id === 'baseline-current'
  ));
  const baselineWins = baselinePairs.filter(row => row.preferred_solution_id === 'baseline-current').length;
  const playbookWins = baselinePairs.filter(row => row.preferred_solution_id !== null
    && row.preferred_solution_id !== 'baseline-current').length;
  if (baselinePairs.length === 3 && baselineWins === 3) return 'baseline-supported';
  if (playbookWins > 0 && baselineWins === 0) return 'playbook-supported';
  return 'inconclusive';
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
function sameExactKeys(value, fields) {
  return stableJson(Object.keys(value).sort()) === stableJson([...fields].sort());
}
