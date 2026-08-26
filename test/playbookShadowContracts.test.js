import assert from 'node:assert/strict';
import test from 'node:test';
import {
  stableJson,
  sha256
} from '../src/playbook/shadow/canonical.js';
import {
  validateExplanation,
  validateManifest,
  validatePromptPacket,
  validateReview
} from '../src/playbook/shadow/contracts.js';

const HASH = 'a'.repeat(64);
const LAYERS = [
  'brief', 'massing', 'space', 'structure', 'roof',
  'facade', 'materials', 'interior', 'scene'
];

test('stableJson sorts object keys recursively and emits one newline', () => {
  const bytes = stableJson({ z: 1, a: { y: 2, x: 3 } });
  assert.equal(bytes, '{\n  "a": {\n    "x": 3,\n    "y": 2\n  },\n  "z": 1\n}\n');
  assert.equal(sha256(bytes).length, 64);
});

test('review contract rejects unknown fields and a case-pattern repair', () => {
  const review = validReviewFixture();
  assert.throws(
    () => validateReview({ ...review, score: 99 }),
    /BLUEPRINT_INVALID|PLAYBOOK_CORPUS_INVALID/u
  );
  review.assessments[15].repair_operation_id = 'repair:massing:move-tower-to-joint';
  assert.throws(() => validateReview(review), /case-pattern/u);
});

test('review contract accepts only the fixed blueprint.json input path', () => {
  for (const blueprintPath of ['other.json', 'C:/tmp/blueprint.json']) {
    const review = validReviewFixture();
    review.input.blueprint_path = blueprintPath;
    assert.throws(
      () => validateReview(review),
      /BLUEPRINT_INVALID: blueprint-path/u
    );
  }
});

test('review contract permits distinct unknown IDs longer than explanation text limits', () => {
  const review = validReviewFixture();
  const cappedUnknown = `unknown:${'a'.repeat(2040)}`;
  review.assessments[2].unknown_ids = [`${cappedUnknown}-first`, `${cappedUnknown}-second`];

  assert.deepEqual(validateReview(review).assessments[2].unknown_ids, [
    `${cappedUnknown}-first`,
    `${cappedUnknown}-second`
  ]);
});

test('explanation must preserve review hash, rule order, status, and repair IDs', () => {
  const review = validateReview(validReviewFixture());
  const explanation = validExplanationFixture(review);
  explanation.rule_explanations[0].status = 'violated';
  assert.throws(
    () => validateExplanation(explanation, review),
    /LLM_AUTHORITY_VIOLATION/u
  );
});

test('manifest accepts only the fixed managed_paths field', () => {
  const review = validateReview(validReviewFixture());
  const promptPacket = validPromptPacketFixture(review);
  const manifest = validManifestFixture();
  assert.equal(validatePromptPacket(promptPacket), promptPacket);
  assert.equal(validateManifest(manifest), manifest);
  assert.throws(
    () => validatePromptPacket({ ...promptPacket, blueprint_path: '/tmp/blueprint.json' }),
    /BLUEPRINT_INVALID/u
  );
  const legacyManifest = { ...manifest, managed_files: manifest.managed_paths };
  delete legacyManifest.managed_paths;
  assert.throws(() => validateManifest(legacyManifest), /SHADOW_OUTPUT_OWNERSHIP/u);

  const legacyHashField = { ...manifest, file_sha256: manifest.artifact_hashes };
  delete legacyHashField.artifact_hashes;
  assert.throws(() => validateManifest(legacyHashField), /SHADOW_OUTPUT_OWNERSHIP/u);
});

test('prompt output contract rejects drift in published row, membership, and render constraints', () => {
  const review = validateReview(validReviewFixture());
  const variants = [
    (packet) => { packet.output_contract.row_contract.layer_count = 4; },
    (packet) => { packet.output_contract.row_contract.rule_order.reverse(); },
    (packet) => { packet.output_contract.reference_contract.unique = false; },
    (packet) => {
      packet.output_contract.reference_contract.rule_fact_membership = 'any-rule';
    },
    (packet) => {
      packet.output_contract.reference_contract.overall_unknown_order.reverse();
    },
    (packet) => {
      packet.output_contract.render_contract.maximum_explanation_code_points = 4096;
    }
  ];

  for (const mutate of variants) {
    const packet = validPromptPacketFixture(review);
    mutate(packet);
    assert.throws(() => validatePromptPacket(packet, review), /BLUEPRINT_INVALID/u);
  }
});

test('review rejects invalidated layers on non-violated assessments', () => {
  const review = validReviewFixture();
  review.assessments[0].invalidates_layers = ['roof'];
  assert.throws(() => validateReview(review), /PLAYBOOK_CORPUS_INVALID/u);
});

test('review requires exactly fifteen core procedures and six case patterns', () => {
  const review = validReviewFixture();
  review.assessments[0].teaching_role = 'case-pattern';
  review.assessments[0].admission_status = 'manual-example-only';
  review.assessments[0].status = 'unknown';
  review.assessments[0].observations = [];
  review.assessments[0].missing_signals = ['visual-evidence'];
  assert.throws(() => validateReview(review), /PLAYBOOK_CORPUS_INVALID/u);
});

test('review rejects even violated rules assigned to non-covered layers', () => {
  const review = validReviewFixture();
  review.assessments[1].design_layer = 'space';
  assert.throws(() => validateReview(review), /PLAYBOOK_CORPUS_INVALID/u);
});

function validReviewFixture() {
  const assessments = Array.from({ length: 21 }, (_, index) => {
    const casePattern = index >= 15;
    const violated = index === 1;
    const unknown = casePattern || index === 2;
    const status = violated ? 'violated' : unknown ? 'unknown' : 'satisfied';
    const layer = ['brief', 'massing', 'structure', 'roof', 'facade'][index % 5];
    return {
      rule_id: `rule:${String(index + 1).padStart(2, '0')}`,
      rule_version: 1,
      teaching_role: casePattern ? 'case-pattern' : 'core-procedure',
      admission_status: casePattern ? 'manual-example-only' : 'admitted-advisory',
      design_layer: layer,
      check_id: `check:${String(index + 1).padStart(2, '0')}`,
      checker_kind: unknown ? 'evidence-required' : 'structural',
      status,
      evidence_json_pointers: violated ? ['/layout/rooms/0'] : [],
      observations: violated || status === 'satisfied' ? ['structured observation'] : [],
      missing_signals: unknown ? ['visual-evidence'] : [],
      unknown_ids: [],
      repair_operation_id: violated ? 'repair:massing:adjust-volume' : null,
      repair_target_layer: violated ? 'massing' : null,
      invalidates_layers: violated ? ['roof', 'facade'] : []
    };
  });
  return {
    schema_version: 1,
    evaluator_version: '0.1.0',
    playbook_version: '0.1.0',
    school_id: 'heihui-jileniao',
    input: {
      blueprint_path: 'blueprint.json',
      blueprint_sha256: HASH,
      workflow: 'construction_method_v1',
      seed: 7
    },
    rule_corpus_sha256: HASH,
    coverage: LAYERS.map((layer) => coverageFor(layer, assessments)),
    assessments,
    summary: summaryFor(assessments)
  };
}

function validExplanationFixture(review) {
  return {
    schema_version: 1,
    review_hash: sha256(stableJson(review)),
    mode: 'mock',
    provider: null,
    status: 'available',
    layer_explanations: ['brief', 'massing', 'structure', 'roof', 'facade'].map((layer) => ({
      layer,
      explanation: `${layer}：${review.assessments
        .filter((assessment) => assessment.design_layer === layer)
        .map((assessment) => assessment.status)
        .join('；')}`
    })),
    rule_explanations: review.assessments.map((assessment) => ({
      rule_id: assessment.rule_id,
      status: assessment.status,
      repair_operation_id: assessment.repair_operation_id,
      explanation: `${assessment.status}：${assessment.observations.length > 0
        ? assessment.observations.join('；')
        : `缺少：${assessment.missing_signals.join('；')}`}`
    })),
    overall_unknowns: ['visual-evidence'],
    error_code: null
  };
}

function validPromptPacketFixture(review) {
  return {
    schema_version: 1,
    review_hash: sha256(stableJson(review)),
    playbook_version: '0.1.0',
    school_id: 'heihui-jileniao',
    allowed_layers: ['brief', 'massing', 'structure', 'roof', 'facade'],
    authority: {
      immutable_fields: ['rule_ids', 'rule_order', 'statuses', 'repair_operation_ids', 'review_hash'],
      prohibited_additions: ['coordinates', 'block_ids', 'patches', 'scores', 'thresholds'],
      blueprint_prompt_role: 'inert-data'
    },
    blueprint_prompt_data: { value: 'Build a small house.', role: 'inert-data' },
    rules: review.assessments.map((assessment) => ({
      rule_id: assessment.rule_id,
      design_layer: assessment.design_layer,
      status: assessment.status,
      repair_operation_id: assessment.repair_operation_id,
      observations: assessment.observations,
      missing_signals: assessment.missing_signals,
      unknown_ids: assessment.unknown_ids,
      applicability: ['structured blueprint evidence is present'],
      exclusions: [],
      intent: 'Preserve the admitted design teaching.',
      positive_signs: ['structured evidence'],
      failure_modes: ['missing evidence']
    })),
    output_contract: {
      format: 'explanation-reference-selection.v1',
      candidate_fields: [
        'review_hash', 'layer_selections', 'rule_selections', 'overall_unknown_references'
      ],
      layer_selection_fields: ['layer', 'selected_rule_ids'],
      rule_selection_fields: [
        'rule_id', 'status', 'repair_operation_id', 'selected_observations',
        'selected_missing_signals', 'selected_unknown_ids'
      ],
      maximum_layer_rule_references: 21,
      maximum_rule_references_per_field: 12,
      maximum_overall_unknown_references: 64,
      row_contract: {
        layer_count: 5,
        layer_order: ['brief', 'massing', 'structure', 'roof', 'facade'],
        rule_count: 21,
        rule_order: review.assessments.map((assessment) => assessment.rule_id),
        immutable_rule_fields: ['rule_id', 'status', 'repair_operation_id']
      },
      reference_contract: {
        unique: true,
        canonical_order: true,
        layer_rule_membership: 'same-layer-assessments',
        rule_fact_membership: 'same-rule-prompt-field',
        overall_unknown_membership: 'prompt-exposed-unknown-assessments',
        overall_unknown_order: ['rule_order', 'unknown_ids', 'missing_signals']
      },
      render_contract: {
        format: 'authoritative-reference-indexes.v1',
        maximum_explanation_code_points: 2048
      }
    }
  };
}

function validManifestFixture() {
  return {
    schema_version: 1,
    evaluator_version: '0.1.0',
    playbook_version: '0.1.0',
    school_id: 'heihui-jileniao',
    blueprint_sha256: HASH,
    rule_corpus_sha256: HASH,
    mode: 'mock',
    explanation_status: 'available',
    managed_paths: [
      'manifest.json', 'review.json', 'prompt-packet.json', 'explanation.json', 'report.md'
    ],
    artifact_hashes: {
      'review.json': HASH,
      'prompt-packet.json': HASH,
      'explanation.json': HASH,
      'report.md': HASH
    }
  };
}

function counts(satisfied = 0, violated = 0, unknown = 0, notApplicable = 0) {
  return { satisfied, violated, unknown, 'not-applicable': notApplicable };
}

function coverageFor(layer, assessments) {
  const layerAssessments = assessments.filter((assessment) => assessment.design_layer === layer);
  return {
    layer,
    status: ['brief', 'massing', 'structure', 'roof', 'facade'].includes(layer)
      ? 'advisory-partial'
      : 'not-covered',
    rule_ids: layerAssessments.map((assessment) => assessment.rule_id),
    unknown_ids: [],
    assessment_counts: statusCounts(layerAssessments)
  };
}

function summaryFor(assessments) {
  return {
    assessment_count: assessments.length,
    core_procedure_count: 15,
    case_pattern_count: 6,
    status_counts: statusCounts(assessments),
    layer_status_counts: LAYERS.map((layer) => ({
      layer,
      ...statusCounts(assessments.filter((assessment) => assessment.design_layer === layer))
    })),
    missing_evidence_rule_count: assessments.filter((assessment) => assessment.status === 'unknown').length
  };
}

function statusCounts(assessments) {
  const result = counts();
  for (const assessment of assessments) result[assessment.status] += 1;
  return result;
}
