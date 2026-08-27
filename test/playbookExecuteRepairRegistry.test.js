import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { loadShadowCorpus } from '../src/playbook/shadow/corpus.js';
import { createCheckerDefinitions } from '../src/playbook/shadow/checkerRegistry.js';
import {
  createExecutableRepairRegistry,
  validateExecutableRepairRegistry
} from '../src/playbook/execute/repairRegistry.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXPECTED = [
  ['repair:massing:resize-or-reposition-volume', ['center-primary-and-reattach-secondaries', 'differentiate-equal-secondary-scale']],
  ['repair:massing:strengthen-primary-volume', ['promote-largest-stable', 'reduce-nondominant-secondary']],
  ['repair:massing:reduce-support-volume-prominence', ['reduce-attached-support-scale']],
  ['repair:structure:connect-support-path', ['connect-known-structural-anchors']]
];

test('registry exposes only the four reviewed operation and variant pairs', async () => {
  const corpus = await loadShadowCorpus({ projectRoot: ROOT });
  const registry = validateExecutableRepairRegistry({
    cards: corpus.cards,
    checkerDefinitions: createCheckerDefinitions(),
    registry: createExecutableRepairRegistry()
  });
  assert.deepEqual([...registry].map(([id, row]) => [id, row.allowed_variant_ids]), EXPECTED);
  assert.equal(Object.isFrozen([...registry.values()][0]), true);
});

test('registry rejects missing, extra, duplicate, replaced, or wrongly bound authority', async () => {
  const corpus = await loadShadowCorpus({ projectRoot: ROOT });
  const definitions = createCheckerDefinitions();
  const rows = [...createExecutableRepairRegistry().values()];
  const mutations = [
    rows.slice(1),
    [...rows, { ...rows[0], repair_operation_id: 'repair:massing:extra' }],
    [...rows, { ...rows[0] }],
    [{ ...rows[0], rule_id: rows[1].rule_id }, ...rows.slice(1)],
    [{ ...rows[0], check_id: rows[1].check_id }, ...rows.slice(1)],
    [{ ...rows[0], design_layer: 'roof' }, ...rows.slice(1)],
    [{ ...rows[0], invalidates_layers: ['roof'] }, ...rows.slice(1)],
    [{ ...rows[0], compiler_version: 2 }, ...rows.slice(1)],
    [{ ...rows[0], compile: () => null }, ...rows.slice(1)],
    [{ ...rows[0], allowed_variant_ids: [...rows[0].allowed_variant_ids, 'runtime-added'] }, ...rows.slice(1)]
  ];
  for (const registry of mutations) {
    assert.throws(
      () => validateExecutableRepairRegistry({ cards: corpus.cards, checkerDefinitions: definitions, registry }),
      { code: 'P5_AUTHORITY_INVALID' }
    );
  }
  const evidenceRequired = definitions.map((row, index) => index === 0 ? { ...row, kind: 'evidence-required' } : row);
  assert.throws(() => validateExecutableRepairRegistry({ cards: corpus.cards, checkerDefinitions: evidenceRequired, registry: rows }), { code: 'P5_AUTHORITY_INVALID' });
  const caseCards = structuredClone(corpus.cards);
  caseCards[0].teaching_role = 'case-pattern';
  assert.throws(() => validateExecutableRepairRegistry({ cards: caseCards, checkerDefinitions: definitions, registry: rows }), { code: 'P5_AUTHORITY_INVALID' });
});

test('registry map methods cannot mutate or leak the backing map', () => {
  const registry = createExecutableRepairRegistry();
  assert.throws(() => registry.set('repair:massing:extra', [...registry.values()][0]), TypeError);
  assert.throws(() => registry.clear(), TypeError);
  assert.throws(() => registry.forEach((row, id, received) => {
    assert.equal(received, registry);
    received.delete(id);
  }), TypeError);
  assert.equal(registry.size, 4);
});
