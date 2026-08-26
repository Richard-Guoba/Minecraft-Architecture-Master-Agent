import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createCheckerDefinitions, createCheckerRegistry, validateCheckerRegistry } from '../src/playbook/shadow/checkerRegistry.js';
import { loadShadowCorpus } from '../src/playbook/shadow/corpus.js';

const ROOT = path.resolve(import.meta.dirname, '..');

test('registry binds every reviewed check exactly once in corpus order', async () => {
  const corpus = await loadShadowCorpus({ projectRoot: ROOT });
  const registry = validateCheckerRegistry(corpus.cards, createCheckerRegistry());

  assert.equal(registry.size, 21);
  assert.deepEqual(
    [...registry.keys()],
    corpus.cards.map((card) => card.runtime_projection.observable_checks[0])
  );
});

test('registry fails closed on a missing, duplicate, wrong-rule, or wrong-layer checker', async () => {
  const corpus = await loadShadowCorpus({ projectRoot: ROOT });

  for (const mutate of [removeFirst, duplicateFirst, changeRuleId, changeLayer]) {
    assert.throws(
      () => validateCheckerRegistry(corpus.cards, mutate(createCheckerDefinitions())),
      /CHECK_REGISTRY_INCOMPLETE/u
    );
  }
});

function removeFirst(definitions) {
  return definitions.slice(1);
}

function duplicateFirst(definitions) {
  return [...definitions, { ...definitions[0] }];
}

function changeRuleId(definitions) {
  return [{ ...definitions[0], rule_id: 'rule:wrong.binding' }, ...definitions.slice(1)];
}

function changeLayer(definitions) {
  return [{ ...definitions[0], design_layer: 'roof' }, ...definitions.slice(1)];
}
