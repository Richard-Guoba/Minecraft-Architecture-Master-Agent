import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createCheckerRegistry } from '../src/playbook/shadow/checkerRegistry.js';
import { stableJson, sha256 } from '../src/playbook/shadow/canonical.js';
import { loadShadowCorpus } from '../src/playbook/shadow/corpus.js';
import { validateExplanation } from '../src/playbook/shadow/contracts.js';
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

test('mock explanation deduplicates unknown IDs after bounding their text', async () => {
  const fixture = await explanationFixture();
  const review = structuredClone(fixture.review);
  const unknownAssessments = review.assessments.filter((assessment) => assessment.status === 'unknown');
  const cappedUnknown = `unknown:${'a'.repeat(2040)}`;
  unknownAssessments[0].unknown_ids = [`${cappedUnknown}-first`];
  unknownAssessments[1].unknown_ids = [`${cappedUnknown}-second`];

  const result = await explainReview({ mode: 'mock', review });

  assert.equal(result.status, 'available');
  assert.equal(result.overall_unknowns.filter((item) => item === cappedUnknown).length, 1);
});

test('valid reference-only LLM candidate is accepted and wrapper-rendered', async () => {
  const fixture = await explanationFixture();
  const payload = validLlmSelection(fixture.review, fixture.promptPacket);
  const result = await explainReview({
    mode: 'llm',
    ...fixture,
    createClient: () => fakeClient(payload)
  });

  assert.equal(result.status, 'available');
  assert.equal(result.provider, 'fixture-llm');
  assert.equal(Object.hasOwn(result, 'layer_selections'), false);
  assert.equal(Object.hasOwn(result, 'rule_selections'), false);
  assert.equal(result.rule_explanations[0].explanation.includes('Explanation for'), false);
  assert.match(result.rule_explanations[0].explanation, /^(?:satisfied|violated|unknown|not-applicable)：/u);
  const multiSignalIndex = fixture.promptPacket.rules.findIndex((rule) => rule.missing_signals.length >= 2);
  assert.equal(
    result.rule_explanations[multiSignalIndex].explanation.includes(
      fixture.promptPacket.rules[multiSignalIndex].missing_signals[0]
    ),
    true
  );
  assert.equal(
    result.rule_explanations[multiSignalIndex].explanation.includes(
      fixture.promptPacket.rules[multiSignalIndex].missing_signals[1]
    ),
    false
  );
});

test('LLM authority changes discard the whole explanation but preserve review and prompt bytes', async () => {
  const fixture = await explanationFixture();
  const reviewBefore = stableJson(fixture.review);
  const promptBefore = stableJson(fixture.promptPacket);
  const payload = validLlmSelection(fixture.review, fixture.promptPacket);
  payload.rule_selections[0].repair_operation_id = 'repair:invented';
  const result = await explainReview({
    mode: 'llm',
    ...fixture,
    createClient: () => fakeClient(payload)
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.error_code, 'LLM_AUTHORITY_VIOLATION');
  assert.equal(stableJson(fixture.review), reviewBefore);
  assert.equal(stableJson(fixture.promptPacket), promptBefore);
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
  const payload = validLlmSelection(fixture.review, fixture.promptPacket);
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

test('missing or malformed candidate fields are output-invalid', async () => {
  const fixture = await explanationFixture();
  const variants = [
    (payload) => { delete payload.overall_unknown_references; },
    (payload) => { payload.layer_selections[0].selected_rule_ids = 'rule:not-an-array'; },
    (payload) => { payload.rule_selections[0].selected_observations = null; },
    (payload) => { payload.rule_selections[0].unexpected = []; }
  ];

  for (const mutate of variants) {
    const payload = validLlmSelection(fixture.review, fixture.promptPacket);
    mutate(payload);
    const result = await explainReview({
      mode: 'llm', ...fixture, createClient: () => fakeClient(payload)
    });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.error_code, 'LLM_OUTPUT_INVALID');
    assertUnavailableAuthority(result, fixture.review);
  }
});

test('missing, added, reordered, status-drift, repair-drift, and hash-drift LLM rules are authority violations', async () => {
  const fixture = await explanationFixture();
  const variants = [
    (payload) => { payload.rule_selections.pop(); },
    (payload) => { payload.rule_selections.push({ ...payload.rule_selections[0], rule_id: 'rule:invented' }); },
    (payload) => { [payload.rule_selections[0], payload.rule_selections[1]] = [payload.rule_selections[1], payload.rule_selections[0]]; },
    (payload) => {
      payload.rule_selections[0].status = payload.rule_selections[0].status === 'unknown'
        ? 'satisfied'
        : 'unknown';
    },
    (payload) => { payload.rule_selections[0].repair_operation_id = 'repair:invented'; },
    (payload) => { payload.review_hash = 'b'.repeat(64); }
  ];

  for (const mutate of variants) {
    const payload = validLlmSelection(fixture.review, fixture.promptPacket);
    mutate(payload);
    const result = await explainReview({
      mode: 'llm', ...fixture, createClient: () => fakeClient(payload)
    });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.error_code, 'LLM_AUTHORITY_VIOLATION');
    assertUnavailableAuthority(result, fixture.review);
  }
});

test('legacy LLM prose candidates with prohibited authority additions are invalid', async (t) => {
  for (const [name, prohibitedText] of [
    ['invented identifier', 'The unresolved source is unknown:invented-by-model.'],
    ['coordinates', 'Place the support at x=12, y=64, z=-3.'],
    ['block ID', 'Use minecraft:diamond_block for emphasis.'],
    ['patch', 'Apply patch [{"op":"replace","path":"/architecture/volumes/0"}].'],
    ['score', 'The architectural score is 0.92.'],
    ['threshold', 'Treat the wall as blank when threshold=0.75.']
  ]) {
    await t.test(name, async () => {
      const fixture = await explanationFixture();
      const payload = legacyLlmPayload(fixture.review);
      payload.layer_explanations[0].explanation = prohibitedText;

      const result = await explainReview({
        mode: 'llm', ...fixture, createClient: () => fakeClient(payload)
      });

      assert.equal(result.status, 'unavailable');
      assert.equal(result.error_code, 'LLM_OUTPUT_INVALID');
      assert.equal(JSON.stringify(result).includes(prohibitedText), false);
      assertUnavailableAuthority(result, fixture.review);
    });
  }
});

test('alternate wording and arbitrary LLM prose cannot reach an available explanation', async (t) => {
  for (const [name, prohibitedText] of [
    ['bare coordinates', 'Place the support at 12, 64, -3.'],
    ['imperative JSON path patch', 'Replace /architecture/volumes/0 with a wider mass.'],
    ['natural-language score', 'I would rate this 9 out of 10.'],
    ['natural-language threshold', 'The facade is too plain when wider than 12 blocks.'],
    ['arbitrary invented prose', 'This invented design claim has no authoritative source.'],
    ['invented path', 'Inspect /architecture/invented/secret for the answer.']
  ]) {
    await t.test(name, async () => {
      const fixture = await explanationFixture();
      const payload = legacyLlmPayload(fixture.review);
      payload.layer_explanations[0].explanation = prohibitedText;

      const result = await explainReview({
        mode: 'llm', ...fixture, createClient: () => fakeClient(payload)
      });

      assert.equal(result.status, 'unavailable');
      assert.equal(result.error_code, 'LLM_OUTPUT_INVALID');
      assert.equal(JSON.stringify(result).includes(prohibitedText), false);
      assertUnavailableAuthority(result, fixture.review);
    });
  }
});

test('public explanation validation rejects non-wrapper LLM prose', async () => {
  const fixture = await explanationFixture();
  const result = await explainReview({
    mode: 'llm',
    ...fixture,
    createClient: () => fakeClient(validLlmSelection(fixture.review, fixture.promptPacket))
  });
  assert.equal(result.status, 'available');
  const bypass = structuredClone(result);
  bypass.layer_explanations[0].explanation = 'Place the support at 12, 64, -3.';

  assert.throws(
    () => validateExplanation(bypass, fixture.review),
    /LLM_AUTHORITY_VIOLATION/u
  );
});

test('LLM overall unknowns must quote authoritative unknown or missing-signal values', async () => {
  const fixture = await explanationFixture();
  const payload = validLlmSelection(fixture.review, fixture.promptPacket);
  payload.overall_unknown_references = ['unknown:invented-by-model'];

  const result = await explainReview({
    mode: 'llm', ...fixture, createClient: () => fakeClient(payload)
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.error_code, 'LLM_AUTHORITY_VIOLATION');
  assertUnavailableAuthority(result, fixture.review);
});

test('overall unknown references must be unique and canonically ordered', async () => {
  const fixture = await explanationFixture();
  const authoritative = [];
  for (const rule of fixture.promptPacket.rules) {
    if (rule.status !== 'unknown') continue;
    for (const value of [...rule.unknown_ids, ...rule.missing_signals]) {
      if (!authoritative.includes(value)) authoritative.push(value);
    }
  }
  assert.ok(authoritative.length >= 2);

  for (const selected of [
    [authoritative[0], authoritative[0]],
    [authoritative[1], authoritative[0]]
  ]) {
    const payload = validLlmSelection(fixture.review, fixture.promptPacket);
    payload.overall_unknown_references = selected;
    const result = await explainReview({
      mode: 'llm', ...fixture, createClient: () => fakeClient(payload)
    });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.error_code, 'LLM_AUTHORITY_VIOLATION');
    assertUnavailableAuthority(result, fixture.review);
  }
});

test('selected rule references must belong to the corresponding authoritative assessment', async () => {
  const fixture = await explanationFixture();
  const payload = validLlmSelection(fixture.review, fixture.promptPacket);
  const targetIndex = fixture.promptPacket.rules.findIndex((rule) => rule.missing_signals.length > 0);
  const foreignIndex = fixture.promptPacket.rules.findIndex((rule, index) => (
    index !== targetIndex
    && rule.missing_signals.some((value) => !fixture.promptPacket.rules[targetIndex].missing_signals.includes(value))
  ));
  payload.rule_selections[targetIndex].selected_observations = [];
  payload.rule_selections[targetIndex].selected_missing_signals = [
    fixture.promptPacket.rules[foreignIndex].missing_signals[0]
  ];

  const result = await explainReview({
    mode: 'llm', ...fixture, createClient: () => fakeClient(payload)
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.error_code, 'LLM_AUTHORITY_VIOLATION');
  assertUnavailableAuthority(result, fixture.review);
});

test('selected layer rule references must belong to the corresponding layer', async () => {
  const fixture = await explanationFixture();
  const payload = validLlmSelection(fixture.review, fixture.promptPacket);
  const foreignRule = fixture.review.assessments.find((assessment) => (
    assessment.design_layer !== payload.layer_selections[0].layer
  ));
  payload.layer_selections[0].selected_rule_ids = [foreignRule.rule_id];

  const result = await explainReview({
    mode: 'llm', ...fixture, createClient: () => fakeClient(payload)
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.error_code, 'LLM_AUTHORITY_VIOLATION');
  assertUnavailableAuthority(result, fixture.review);
});

test('duplicate and reordered reference selections are authority violations', async () => {
  const fixture = await explanationFixture();
  const sourceIndex = fixture.promptPacket.rules.findIndex((rule) => rule.missing_signals.length >= 2);
  const variants = [
    (payload) => {
      const selected = payload.rule_selections[sourceIndex].selected_missing_signals;
      selected.push(selected[0]);
    },
    (payload) => {
      payload.rule_selections[sourceIndex].selected_missing_signals = [
        ...fixture.promptPacket.rules[sourceIndex].missing_signals.slice(0, 2)
      ].reverse();
    },
    (payload) => {
      const layer = payload.layer_selections.find((item) => (
        fixture.review.assessments.filter((assessment) => assessment.design_layer === item.layer).length >= 2
      ));
      const ids = fixture.review.assessments
        .filter((assessment) => assessment.design_layer === layer.layer)
        .slice(0, 2)
        .map((assessment) => assessment.rule_id);
      layer.selected_rule_ids = [ids[0], ids[0]];
    },
    (payload) => {
      const layer = payload.layer_selections.find((item) => (
        fixture.review.assessments.filter((assessment) => assessment.design_layer === item.layer).length >= 2
      ));
      layer.selected_rule_ids = fixture.review.assessments
        .filter((assessment) => assessment.design_layer === layer.layer)
        .slice(0, 2)
        .map((assessment) => assessment.rule_id)
        .reverse();
    }
  ];

  for (const mutate of variants) {
    const payload = validLlmSelection(fixture.review, fixture.promptPacket);
    mutate(payload);
    const result = await explainReview({
      mode: 'llm', ...fixture, createClient: () => fakeClient(payload)
    });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.error_code, 'LLM_AUTHORITY_VIOLATION');
    assertUnavailableAuthority(result, fixture.review);
  }
});

test('missing, extra, and reordered layer selection rows are authority violations', async () => {
  const fixture = await explanationFixture();
  const variants = [
    (payload) => { payload.layer_selections.pop(); },
    (payload) => { payload.layer_selections.push(structuredClone(payload.layer_selections[0])); },
    (payload) => {
      [payload.layer_selections[0], payload.layer_selections[1]] = [
        payload.layer_selections[1], payload.layer_selections[0]
      ];
    }
  ];

  for (const mutate of variants) {
    const payload = validLlmSelection(fixture.review, fixture.promptPacket);
    mutate(payload);
    const result = await explainReview({
      mode: 'llm', ...fixture, createClient: () => fakeClient(payload)
    });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.error_code, 'LLM_AUTHORITY_VIOLATION');
    assertUnavailableAuthority(result, fixture.review);
  }
});

test('invented candidate references never reach the wrapper-rendered explanation', async () => {
  const fixture = await explanationFixture();
  for (const invented of [
    '12, 64, -3',
    'Replace /architecture/volumes/0 with a wider mass.',
    'rate this 9 out of 10',
    'wider than 12 blocks',
    'arbitrary invented natural-language prose',
    'minecraft:diamond_block',
    'unknown:invented-by-model',
    '/architecture/invented/path'
  ]) {
    const payload = validLlmSelection(fixture.review, fixture.promptPacket);
    payload.rule_selections[0].selected_observations = [invented];
    payload.rule_selections[0].selected_missing_signals = [];
    const result = await explainReview({
      mode: 'llm', ...fixture, createClient: () => fakeClient(payload)
    });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.error_code, 'LLM_AUTHORITY_VIOLATION');
    assert.equal(JSON.stringify(result).includes(invented), false);
    assertUnavailableAuthority(result, fixture.review);
  }
});

test('the same validated reference selection produces deterministic explanation bytes', async () => {
  const fixture = await explanationFixture();
  const payload = validLlmSelection(fixture.review, fixture.promptPacket);
  const first = await explainReview({
    mode: 'llm', ...fixture, createClient: () => fakeClient(structuredClone(payload))
  });
  const second = await explainReview({
    mode: 'llm', ...fixture, createClient: () => fakeClient(structuredClone(payload))
  });

  assert.equal(first.status, 'available');
  assert.equal(second.status, 'available');
  assert.equal(stableJson(first), stableJson(second));
});

test('wrapper rendering resolves a bounded prompt reference back to the authoritative review fact', async () => {
  const fixture = await explanationFixture();
  const review = structuredClone(fixture.review);
  const ruleIndex = review.assessments.findIndex((assessment) => (
    assessment.status === 'unknown' && assessment.missing_signals.length > 0
  ));
  const authoritativeSignal = `signal-${'a'.repeat(900)}`;
  review.assessments[ruleIndex].missing_signals[0] = authoritativeSignal;
  const promptPacket = buildPromptPacket({
    review,
    cards: fixture.cards,
    blueprintPrompt: 'A compact medieval timber house.'
  });
  const payload = validLlmSelection(review, promptPacket);

  const result = await explainReview({
    mode: 'llm', review, promptPacket, createClient: () => fakeClient(payload)
  });

  assert.equal(Array.from(promptPacket.rules[ruleIndex].missing_signals[0]).length, 800);
  assert.equal(result.status, 'available');
  assert.equal(result.rule_explanations[ruleIndex].explanation.includes(authoritativeSignal), true);
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
    cards: corpus.cards,
    promptPacket: buildPromptPacket({
      review,
      cards: corpus.cards,
      blueprintPrompt: blueprint.prompt
    })
  };
}

function validLlmSelection(review, promptPacket) {
  const firstUnknown = promptPacket.rules
    .filter((rule) => rule.status === 'unknown')
    .flatMap((rule) => [...(rule.unknown_ids ?? []), ...rule.missing_signals])[0];
  return {
    review_hash: sha256(stableJson(review)),
    layer_selections: LAYERS.map((layer) => ({
      layer,
      selected_rule_ids: review.assessments
        .filter((assessment) => assessment.design_layer === layer)
        .slice(0, 1)
        .map((assessment) => assessment.rule_id)
    })),
    rule_selections: promptPacket.rules.map((rule) => ({
      rule_id: rule.rule_id,
      status: rule.status,
      repair_operation_id: rule.repair_operation_id,
      selected_observations: rule.observations.slice(0, 1),
      selected_missing_signals: rule.observations.length === 0
        ? rule.missing_signals.slice(0, 1)
        : [],
      selected_unknown_ids: (rule.unknown_ids ?? []).slice(0, 1)
    })),
    overall_unknown_references: firstUnknown ? [firstUnknown] : []
  };
}

function legacyLlmPayload(review) {
  const authoritativeUnknown = review.assessments
    .filter((assessment) => assessment.status === 'unknown')
    .flatMap((assessment) => [...assessment.unknown_ids, ...assessment.missing_signals])[0];
  return {
    review_hash: sha256(stableJson(review)),
    layer_explanations: LAYERS.map((layer) => ({ layer, explanation: `${layer} explanation` })),
    rule_explanations: review.assessments.map((assessment) => ({
      rule_id: assessment.rule_id,
      status: assessment.status,
      repair_operation_id: assessment.repair_operation_id,
      explanation: `Explanation for ${assessment.rule_id}`
    })),
    overall_unknowns: authoritativeUnknown ? [authoritativeUnknown] : []
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
