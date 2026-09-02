import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { loadP7AdvisoryOverlay } from '../src/playbook/knowledge/p7AdvisoryOverlay.js';
import {
  classifyP7ArchitectureLanguage,
  compileArchitectureLanguageV02
} from '../src/playbook/runtime/architectureLanguageV02.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const ALLOWED_CLASSIFICATIONS = [
  'already-executable',
  'feasible-deterministic-mapping',
  'bounded-parameter-or-planner-preference',
  'qa-check-only',
  'advisory-only',
  'unsupported'
];

test('classifies every canonical P7 concept exactly once without promoting advisory knowledge to repair authority', async () => {
  const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });

  const catalog = classifyP7ArchitectureLanguage(overlay);

  assert.equal(catalog.schema_version, 1);
  assert.equal(catalog.language_version, '0.2.0');
  assert.equal(catalog.overlay_sha256,
    '98a09b14c5a29fc76b93f61be016b82edb4a9a8c94cdcf76777533f0c1631c35');
  assert.equal(catalog.concepts.length, 123);
  assert.equal(new Set(catalog.concepts.map((row) => row.knowledge_id)).size, 123);
  assert.ok(catalog.concepts.every((row) => ALLOWED_CLASSIFICATIONS.includes(row.classification)));
  assert.ok(catalog.concepts.every((row) => !String(row.operation_id).startsWith('repair:')));
  assert.equal(catalog.concepts.find((row) =>
    row.knowledge_id === 'knowledge:p7:modern-flat-roof-option').classification,
  'feasible-deterministic-mapping');
  assert.equal(catalog.concepts.find((row) =>
    row.knowledge_id === 'knowledge:p7:function-led-interior-zoning').classification,
  'bounded-parameter-or-planner-preference');
  assert.equal(catalog.concepts.find((row) =>
    row.knowledge_id === 'knowledge:p7:diagonal-envelope-and-roof-frame').classification,
  'unsupported');
  assert.ok(Object.isFrozen(catalog));
  assert.ok(Object.isFrozen(catalog.concepts));
});

test('selects a bounded residential slice in canonical overlay order with semantic fields only', async () => {
  const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });
  const prompt = 'Build a modern lakeside villa with interlocking volumes, a flat roof terrace, large glass, a sheltered entry, a path, garden, and functional interior.';

  const plan = compileArchitectureLanguageV02({ prompt, overlay });

  assert.equal(plan.schema_version, 1);
  assert.equal(plan.language_version, '0.2.0');
  assert.equal(plan.school_id, 'heihui-jileniao');
  assert.deepEqual(plan.selected_knowledge_ids, [
    'knowledge:p7:modern-flat-roof-option',
    'knowledge:p7:weather-sheltered-entrance-transition',
    'knowledge:p7:landscape-route-and-grounding',
    'knowledge:p7:function-led-interior-zoning',
    'knowledge:p7:large-to-small-furnishing-pass',
    'knowledge:p7:daylit-window-wall-integration',
    'knowledge:p7:modern-interlocking-volume',
    'knowledge:p7:modern-program-entry-openness'
  ]);
  assert.deepEqual(plan.instructions.map((row) => row.knowledge_id), plan.selected_knowledge_ids);
  assert.ok(plan.instructions.every((row) => row.workflow_stage));
  assert.doesNotMatch(JSON.stringify(plan), /\b(?:x|y|z|coordinate|block_id|command|repair_operation_id)\b/iu);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.instructions));
});

test('rejects non-canonical advisory input instead of compiling guessed knowledge', async () => {
  const overlay = structuredClone(await loadP7AdvisoryOverlay({ projectRoot: ROOT }));
  overlay.entries[0].knowledge_id = 'knowledge:p7:fabricated';

  assert.throws(
    () => compileArchitectureLanguageV02({ prompt: 'Build a house', overlay }),
    { code: 'ARCHITECTURE_LANGUAGE_INVALID' }
  );
});
