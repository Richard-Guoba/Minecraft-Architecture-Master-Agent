import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createCheckerRegistry } from '../src/playbook/shadow/checkerRegistry.js';
import { stableJson, sha256 } from '../src/playbook/shadow/canonical.js';
import { loadShadowCorpus } from '../src/playbook/shadow/corpus.js';
import { evaluateShadowReview } from '../src/playbook/shadow/evaluateReview.js';
import { explainReview } from '../src/playbook/shadow/explanation.js';
import { buildPromptPacket } from '../src/playbook/shadow/promptPacket.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const LAYERS = ['brief', 'massing', 'structure', 'roof', 'facade'];

test('mock explanation is deterministic and never creates a client', async () => {
  const fixture = await explanationFixture();
  let factoryCalls = 0;
  const first = await explainReview({
    mode: 'mock',
    ...fixture,
    createClient: () => {
      factoryCalls += 1;
      throw new Error('must not run');
    }
  });
  const second = await explainReview({ mode: 'mock', ...fixture });

  assert.equal(factoryCalls, 0);
  assert.equal(stableJson(first), stableJson(second));
  assert.equal(first.status, 'available');
  assert.equal(first.provider, 'mock');
});

test('valid LLM explanation is accepted', async () => {
  const fixture = await explanationFixture();
  const result = await explainReview({
    mode: 'llm',
    ...fixture,
    createClient: () => fakeClient(validLlmPayload(fixture.review))
  });

  assert.equal(result.status, 'available');
  assert.equal(result.provider, 'fixture-llm');
});

test('LLM authority changes discard the whole explanation but preserve review bytes', async () => {
  const fixture = await explanationFixture();
  const before = stableJson(fixture.review);
  const payload = validLlmPayload(fixture.review);
  payload.rule_explanations[0].repair_operation_id = 'repair:invented';
  const result = await explainReview({
    mode: 'llm',
    ...fixture,
    createClient: () => fakeClient(payload)
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.error_code, 'LLM_AUTHORITY_VIOLATION');
  assert.equal(stableJson(fixture.review), before);
  assert.equal(JSON.stringify(result).includes('repair:invented'), false);
  assertUnavailableAuthority(result, fixture.review);
});

test('unconfigured and rejected LLM clients degrade without retaining failure details', async () => {
  const fixture = await explanationFixture();
  const unconfigured = await explainReview({
    mode: 'llm',
    ...fixture,
    createClient: () => ({ name: 'fixture-llm', isConfigured: () => false })
  });
  const rejected = await explainReview({
    mode: 'llm',
    ...fixture,
    createClient: () => ({
      name: 'fixture-llm',
      isConfigured: () => true,
      chatJson: async () => { throw new Error('raw provider response: secret-token'); }
    })
  });

  assert.equal(unconfigured.error_code, 'LLM_UNCONFIGURED');
  assert.equal(unconfigured.provider, null);
  assertUnavailableAuthority(unconfigured, fixture.review);
  assert.equal(rejected.error_code, 'LLM_REQUEST_FAILED');
  assert.equal(rejected.provider, 'fixture-llm');
  assert.equal(JSON.stringify(rejected).includes('secret-token'), false);
  assertUnavailableAuthority(rejected, fixture.review);
});

test('malformed LLM output and unknown output fields discard the entire explanation', async () => {
  const fixture = await explanationFixture();
  const malformed = await explainReview({
    mode: 'llm', ...fixture, createClient: () => fakeClient([])
  });
  const payload = validLlmPayload(fixture.review);
  payload.unrecognized = 'model-overreach';
  const unknownField = await explainReview({
    mode: 'llm', ...fixture, createClient: () => fakeClient(payload)
  });

  for (const result of [malformed, unknownField]) {
    assert.equal(result.status, 'unavailable');
    assert.equal(result.error_code, 'LLM_OUTPUT_INVALID');
    assertUnavailableAuthority(result, fixture.review);
  }
});

test('missing, added, reordered, status-drift, repair-drift, and hash-drift LLM rules are authority violations', async () => {
  const fixture = await explanationFixture();
  const variants = [
    (payload) => { payload.rule_explanations.pop(); },
    (payload) => { payload.rule_explanations.push({ ...payload.rule_explanations[0], rule_id: 'rule:invented' }); },
    (payload) => { [payload.rule_explanations[0], payload.rule_explanations[1]] = [payload.rule_explanations[1], payload.rule_explanations[0]]; },
    (payload) => {
      payload.rule_explanations[0].status = payload.rule_explanations[0].status === 'unknown'
        ? 'satisfied'
        : 'unknown';
    },
    (payload) => { payload.rule_explanations[0].repair_operation_id = 'repair:invented'; },
    (payload) => { payload.review_hash = 'b'.repeat(64); }
  ];

  for (const mutate of variants) {
    const payload = validLlmPayload(fixture.review);
    mutate(payload);
    const result = await explainReview({
      mode: 'llm', ...fixture, createClient: () => fakeClient(payload)
    });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.error_code, 'LLM_AUTHORITY_VIOLATION');
    assertUnavailableAuthority(result, fixture.review);
  }
});

async function explanationFixture() {
  const corpus = await loadShadowCorpus({ projectRoot: ROOT });
  const blueprint = blueprintFixture();
  const review = evaluateShadowReview({
    blueprint,
    blueprintPath: 'blueprint.json',
    blueprintSha256: sha256(stableJson(blueprint)),
    corpus,
    registry: createCheckerRegistry()
  });
  return {
    review,
    promptPacket: buildPromptPacket({
      review,
      cards: corpus.cards,
      blueprintPrompt: blueprint.prompt
    })
  };
}

function validLlmPayload(review) {
  return {
    review_hash: sha256(stableJson(review)),
    layer_explanations: LAYERS.map((layer) => ({ layer, explanation: `${layer} explanation` })),
    rule_explanations: review.assessments.map((assessment) => ({
      rule_id: assessment.rule_id,
      status: assessment.status,
      repair_operation_id: assessment.repair_operation_id,
      explanation: `Explanation for ${assessment.rule_id}`
    })),
    overall_unknowns: ['visual-evidence']
  };
}

function fakeClient(payload) {
  return {
    name: 'fixture-llm',
    isConfigured: () => true,
    chatJson: async () => payload
  };
}

function assertUnavailableAuthority(result, review) {
  assert.deepEqual(
    result.rule_explanations.map(({ rule_id, status, repair_operation_id }) => ({ rule_id, status, repair_operation_id })),
    review.assessments.map(({ rule_id, status, repair_operation_id }) => ({ rule_id, status, repair_operation_id }))
  );
  assert.deepEqual(result.rule_explanations.map((item) => item.explanation), Array(21).fill(''));
  assert.deepEqual(result.layer_explanations, LAYERS.map((layer) => ({ layer, explanation: '' })));
  assert.deepEqual(result.overall_unknowns, []);
}

function blueprintFixture() {
  return {
    workflow: 'construction_method_v1',
    seed: 7,
    prompt: 'A compact medieval timber house.',
    architecture: {
      style: 'medieval',
      style_family: 'timber-frame',
      typology: 'house',
      volumes: [
        volume('main', [1, 1, 1], { relation: 'center' }, ['primary-mass'], 'main-building-envelope'),
        volume('left', [0.4, 0.6, 0.5], { relation: 'attached-west', attach_to: 'main' }, ['secondary-mass']),
        volume('right', [0.5, 0.7, 0.4], { relation: 'attached-east', attach_to: 'main' }, ['secondary-mass'])
      ]
    },
    structure: {
      structural_intent: { floor_count: 2 },
      load_paths: [{ from: 'roof', through: 'post', to: 'foundation' }]
    },
    roof: { overhang: 1 },
    facade: {}
  };
}

function volume(id, scale, placement, tags, purpose) {
  return { id, shape: 'box', scale, placement, tags, purpose };
}
