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

test('explanation must preserve review hash, rule order, status, and repair IDs', () => {
  const review = validateReview(validReviewFixture());
  const explanation = validExplanationFixture(review);
  explanation.rule_explanations[0].status = 'violated';
  assert.throws(
    () => validateExplanation(explanation, review),
    /LLM_AUTHORITY_VIOLATION/u
  );
});

test('prompt packets and manifests reject unmanaged paths and unknown fields', () => {
  const review = validateReview(validReviewFixture());
  const promptPacket = validPromptPacketFixture(review);
  const manifest = validManifestFixture();
  assert.equal(validatePromptPacket(promptPacket), promptPacket);
  assert.equal(validateManifest(manifest), manifest);
  assert.throws(
    () => validatePromptPacket({ ...promptPacket, blueprint_path: '/tmp/blueprint.json' }),
    /BLUEPRINT_INVALID/u
  );
  assert.throws(
    () => validateManifest({ ...manifest, extra: true }),
    /SHADOW_OUTPUT_OWNERSHIP/u
  );
});

function validReviewFixture() {
  const assessments = Array.from({ length: 21 }, (_, index) => {
    const casePattern = index >= 15;
    const violated = index === 1;
    const unknown = casePattern || index === 2;
    const status = violated ? 'violated' : unknown ? 'unknown' : 'satisfied';
    const layer = LAYERS[index % 5];
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
    coverage: LAYERS.map((layer) => ({
      layer,
      status: ['brief', 'massing', 'structure', 'roof', 'facade'].includes(layer)
        ? 'advisory-partial'
        : 'not-covered'
    })),
    assessments,
    summary: {
      by_layer: {
        brief: counts(3, 0, 2),
        massing: counts(2, 1, 1),
        space: counts(2, 0, 2),
        structure: counts(3, 0, 1),
        roof: counts(3, 0, 1),
        facade: counts(),
        materials: counts(),
        interior: counts(),
        scene: counts()
      },
      global: counts(13, 1, 7),
      core_rule_count: 15,
      case_pattern_count: 6,
      missing_evidence_count: 7
    }
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
      explanation: `${layer} explanation`
    })),
    rule_explanations: review.assessments.map((assessment) => ({
      rule_id: assessment.rule_id,
      status: assessment.status,
      repair_operation_id: assessment.repair_operation_id,
      explanation: 'Authoritative observations and missing signals are preserved.'
    })),
    overall_unknowns: ['visual-evidence'],
    error_code: null
  };
}

function validPromptPacketFixture(review) {
  return {
    review_hash: sha256(stableJson(review)),
    school_id: 'heihui-jileniao',
    playbook_version: '0.1.0',
    allowed_layers: ['brief', 'massing', 'structure', 'roof', 'facade'],
    rules: review.assessments.map((assessment) => ({
      rule_id: assessment.rule_id,
      status: assessment.status,
      observations: assessment.observations,
      missing_signals: assessment.missing_signals,
      repair_operation_id: assessment.repair_operation_id,
      applicability_conditions: ['structured blueprint evidence is present'],
      exclusion_conditions: [],
      intent: 'Preserve the admitted design teaching.',
      positive_signals: ['structured evidence'],
      failure_modes: ['missing evidence']
    })),
    authority: 'Use rule IDs, statuses, and repair IDs exactly as supplied.',
    output_schema: 'explanation.json v1',
    blueprint_prompt: 'Build a small house.'
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
    managed_files: [
      'manifest.json', 'review.json', 'prompt-packet.json', 'explanation.json', 'report.md'
    ],
    file_sha256: {
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
