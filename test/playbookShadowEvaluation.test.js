import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createCheckerDefinitions, createCheckerRegistry } from '../src/playbook/shadow/checkerRegistry.js';
import { stableJson, sha256 } from '../src/playbook/shadow/canonical.js';
import { loadShadowCorpus } from '../src/playbook/shadow/corpus.js';
import { evaluateShadowReview } from '../src/playbook/shadow/evaluateReview.js';
import { buildPromptPacket } from '../src/playbook/shadow/promptPacket.js';
import { LAYER_ORDER } from '../src/playbook/shadow/constants.js';

const ROOT = path.resolve(import.meta.dirname, '..');

test('evaluation emits 21 ordered assessments and exact nine-layer coverage', async () => {
  const { corpus, registry, blueprint } = await evaluationFixture('positive');
  const review = evaluateShadowReview({
    blueprint,
    blueprintPath: 'blueprint.json',
    blueprintSha256: sha256(stableJson(blueprint)),
    corpus,
    registry
  });

  assert.equal(review.assessments.length, 21);
  assert.deepEqual(review.assessments.map((item) => item.rule_id), corpus.cards.map((card) => card.rule_id));
  assert.deepEqual(review.coverage.map((row) => row.layer), LAYER_ORDER);
  assert.deepEqual(
    review.coverage.filter((row) => row.status === 'not-covered').map((row) => row.layer),
    ['space', 'materials', 'interior', 'scene']
  );
  assert.equal(Object.hasOwn(review.summary, 'score'), false);
  assert.equal(Object.isFrozen(review), true);
  assert.equal(Object.isFrozen(review.assessments), true);
});

test('only violated core rules receive the reviewed repair', async () => {
  const review = await reviewForFixture('defect');

  for (const assessment of review.assessments) {
    if (assessment.status === 'violated') {
      assert.equal(assessment.teaching_role, 'core-procedure');
      assert.match(assessment.repair_operation_id, /^repair:/u);
      assert.ok(assessment.evidence_json_pointers.length > 0);
      assert.ok(assessment.observations.length > 0);
    } else {
      assert.equal(assessment.repair_operation_id, null);
      assert.equal(assessment.repair_target_layer, null);
      assert.deepEqual(assessment.invalidates_layers, []);
    }
  }
});

test('case patterns cannot be promoted by a malicious checker result', async () => {
  const { corpus, registry, blueprint } = await evaluationFixture('positive');
  const poisoned = replaceCaseChecker(corpus, registry, () => ({
    status: 'violated',
    evidence_json_pointers: ['/architecture/volumes'],
    observations: ['invented-violation'],
    missing_signals: [],
    unknown_ids: []
  }));

  assert.throws(
    () => evaluateShadowReview({
      blueprint,
      blueprintPath: 'blueprint.json',
      blueprintSha256: 'a'.repeat(64),
      corpus,
      registry: poisoned
    }),
    /CHECK_REGISTRY_INCOMPLETE|PLAYBOOK_CORPUS_INVALID/u
  );
});

test('prompt packet is review-bound and excludes blueprint, media, and private data', async () => {
  const { review, corpus, blueprint } = await completedEvaluationFixture();
  blueprint.operations = [{ command: 'setblock 0 0 0 diamond_block' }];
  blueprint.preview = 'screenshot.png';
  blueprint.private_config = { base_url: 'https://example.invalid', API_KEY: 'secret' };

  const packet = buildPromptPacket({
    review,
    cards: corpus.cards,
    blueprintPrompt: blueprint.prompt
  });
  const bytes = stableJson(packet);

  assert.equal(packet.review_hash, sha256(stableJson(review)));
  assert.equal(packet.rules.length, 21);
  assert.equal(bytes.includes(blueprint.prompt), true);
  assert.doesNotMatch(bytes, /setblock|preview|screenshot|\.local\//u);
  assert.doesNotMatch(bytes, /API_KEY|base_url|diamond_block/u);
  assert.equal(Object.isFrozen(packet), true);
  assert.equal(Object.isFrozen(packet.rules), true);
});

test('prompt packet clamps untrusted prose by Unicode code point and fixes its authority fields', async () => {
  const { review, corpus } = await completedEvaluationFixture();
  const cards = structuredClone(corpus.cards);
  cards[0].intent = '😀'.repeat(900);
  cards[0].applicability = Array.from({ length: 13 }, () => 'x'.repeat(900));
  const packet = buildPromptPacket({
    review,
    cards,
    blueprintPrompt: '😀'.repeat(2100)
  });

  assert.deepEqual(Object.keys(packet), [
    'schema_version', 'review_hash', 'playbook_version', 'school_id',
    'allowed_layers', 'authority', 'blueprint_prompt_data', 'rules', 'output_contract'
  ]);
  assert.equal(Array.from(packet.blueprint_prompt_data.value).length, 2000);
  assert.equal(Array.from(packet.rules[0].intent).length, 800);
  assert.equal(packet.rules[0].applicability.length, 12);
  assert.equal(Array.from(packet.rules[0].applicability[0]).length, 800);
  assert.deepEqual(packet.authority.immutable_fields, [
    'rule_ids', 'rule_order', 'statuses', 'repair_operation_ids', 'review_hash'
  ]);
  assert.deepEqual(packet.authority.prohibited_additions, [
    'coordinates', 'block_ids', 'patches', 'scores', 'thresholds'
  ]);
});

async function completedEvaluationFixture() {
  const fixture = await evaluationFixture('positive');
  return {
    ...fixture,
    review: evaluateShadowReview({
      blueprint: fixture.blueprint,
      blueprintPath: 'blueprint.json',
      blueprintSha256: sha256(stableJson(fixture.blueprint)),
      corpus: fixture.corpus,
      registry: fixture.registry
    })
  };
}

async function reviewForFixture(kind) {
  const { corpus, registry, blueprint } = await evaluationFixture(kind);
  return evaluateShadowReview({
    blueprint,
    blueprintPath: 'blueprint.json',
    blueprintSha256: sha256(stableJson(blueprint)),
    corpus,
    registry
  });
}

async function evaluationFixture(kind) {
  return {
    corpus: await loadShadowCorpus({ projectRoot: ROOT }),
    registry: createCheckerRegistry(),
    blueprint: blueprintFixture(kind)
  };
}

function replaceCaseChecker(corpus, registry, evaluate) {
  const caseCard = corpus.cards.find(
    (card) => card.runtime_projection.coverage_status === 'manual-example-only'
  );
  const caseCheckId = caseCard.runtime_projection.observable_checks[0];
  return createCheckerDefinitions().map((checker) => (
    checker.check_id === caseCheckId ? { ...checker, evaluate } : registry.get(checker.check_id)
  ));
}

function blueprintFixture(kind) {
  const defective = kind === 'defect';
  const primary = volume('main', [1, 1, 1], { relation: 'center' }, ['primary-mass'], 'main-building-envelope');
  const left = volume('left', defective ? [2, 1, 1] : [0.4, 0.6, 0.5], { relation: 'attached-west', attach_to: 'main' }, ['secondary-mass']);
  const right = volume('right', defective ? [2, 1, 1] : [0.5, 0.7, 0.4], { relation: 'attached-east', attach_to: 'main' }, ['secondary-mass']);
  return {
    workflow: 'construction_method_v1',
    seed: 7,
    prompt: 'A compact medieval timber house.',
    architecture: {
      style: 'medieval',
      style_family: 'timber-frame',
      typology: 'house',
      volumes: [primary, left, right]
    },
    structure: {
      structural_intent: { floor_count: 2 },
      load_paths: defective ? [] : [{ from: 'roof', through: 'post', to: 'foundation' }]
    },
    roof: { overhang: 1 },
    facade: {}
  };
}

function volume(id, scale, placement, tags, purpose) {
  return { id, shape: 'box', scale, placement, tags, purpose };
}
