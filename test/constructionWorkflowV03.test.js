import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { loadP7AdvisoryOverlay } from '../src/playbook/knowledge/p7AdvisoryOverlay.js';
import {
  applyArchitectureLanguageV02,
  compileArchitectureLanguageV02
} from '../src/playbook/runtime/architectureLanguageV02.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const MEDIEVAL_PROMPT = 'Build a broad medieval multi-volume residence with connected wings, a visible column beam structural grid, compound pitched roofs aligned to each mass, facade bays and coherent window assemblies, a sheltered entrance, connected interior circulation, and foundation material continuity.';
const COMPACT_PROMPT = 'Build a compact single-volume residential house with functional room zoning, connected doors and stairs, porous public partitions, a short entrance path, and restrained facade detail using a bounded pattern vocabulary.';

test('selects a bounded medieval construction slice in canonical order', async () => {
  const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });
  const plan = compileArchitectureLanguageV02({ prompt: MEDIEVAL_PROMPT, overlay });

  assert.deepEqual(plan.selected_knowledge_ids.filter((id) => [
    'knowledge:p7:connected-mass-addition',
    'knowledge:p7:scaled-column-beam-grid',
    'knowledge:p7:roof-orientation-massing-fit',
    'knowledge:p7:integrated-facade-bay-layering',
    'knowledge:p7:facade-opening-assembly',
    'knowledge:p7:building-foundation-material-continuity'
  ].includes(id)), [
    'knowledge:p7:connected-mass-addition',
    'knowledge:p7:scaled-column-beam-grid',
    'knowledge:p7:roof-orientation-massing-fit',
    'knowledge:p7:integrated-facade-bay-layering',
    'knowledge:p7:facade-opening-assembly',
    'knowledge:p7:building-foundation-material-continuity'
  ]);

  const applied = applyArchitectureLanguageV02({
    prompt: MEDIEVAL_PROMPT,
    plan,
    architecture: { structural_rules: {}, roof_rules: {}, facade_rules: {}, site_rules: {} },
    buildSpec: { site: {} }
  });
  assert.equal(applied.architecture.structural_rules.visible_bay_grid, true);
  assert.equal(applied.architecture.roof_rules.axis_strategy, 'volume-proportion');
  assert.equal(applied.architecture.facade_rules.bay_layering, 'integrated-supported');
  assert.equal(applied.architecture.facade_rules.opening_assembly, 'sill-lintel-frame');
  assert.equal(applied.architecture.site_rules.foundation_transition, 'material-continuous');
});

test('selects compact zoning, porous partitions, restrained facade, and route handoffs', async () => {
  const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });
  const plan = compileArchitectureLanguageV02({ prompt: COMPACT_PROMPT, overlay });
  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:bounded-facade-pattern-vocabulary'), true);
  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:landscape-route-and-grounding'), true);
  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:function-led-interior-zoning'), true);
  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:porous-interior-partition'), true);
  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:connected-mass-addition'), false);

  const applied = applyArchitectureLanguageV02({
    prompt: COMPACT_PROMPT,
    plan,
    architecture: { facade_rules: {}, site_rules: {}, design_directives: {} },
    buildSpec: { site: {} }
  });
  assert.equal(applied.architecture.facade_rules.pattern_vocabulary, 'bounded-restrained');
  assert.equal(applied.architecture.design_directives.interior.space_planning, 'function-before-furnishing');
  assert.equal(applied.architecture.design_directives.interior.partition_strategy, 'porous-public-solid-private');
  assert.equal(applied.architecture.site_rules.route_strategy, 'route-first-grounding');
});

test('explicit negation suppresses new construction operations without suppressing unrelated clauses', async () => {
  const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });
  const plan = compileArchitectureLanguageV02({
    prompt: 'Build a medieval home with no visible structural grid, avoid facade bays, no porous partitions, but use coherent window assemblies.',
    overlay
  });

  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:scaled-column-beam-grid'), false);
  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:integrated-facade-bay-layering'), false);
  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:porous-interior-partition'), false);
  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:facade-opening-assembly'), true);
});
