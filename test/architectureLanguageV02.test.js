import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadP7AdvisoryOverlay } from '../src/playbook/knowledge/p7AdvisoryOverlay.js';
import { prepareConstructionDesign } from '../src/construction/designStages.js';
import { runConstructionWorkflow } from '../src/construction/workflow.js';
import {
  applyArchitectureLanguageV02,
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
  const prompt = 'Build a private modern lakeside villa with interlocking volumes, a flat roof terrace, large glass, a sheltered entry, a path, garden, functional interior, and a large-to-small furnishing pass.';

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

test('applies the residential slice through existing semantic planner fields and records each applied operation', async () => {
  const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });
  const plan = compileArchitectureLanguageV02({
    prompt: 'Build a private modern lakeside villa with interlocking volumes, a flat roof terrace, large glass, a sheltered entry, a path, garden, functional interior, and a large-to-small furnishing pass.',
    overlay
  });
  const architecture = {
    roof_rules: { skylights: false },
    facade_rules: { front_side: 'east' },
    site_rules: { boundary: 'open' },
    design_directives: { interior: { color_story: 'quiet' } },
    generation_hints: {
      template_composition_strategy: { active: true, directives: { keep_existing: true } }
    }
  };
  const buildSpec = { roof_style: 'gabled', site: { preserve: true } };

  const applied = applyArchitectureLanguageV02({ plan, architecture, buildSpec });

  assert.equal(applied.architecture.roof_rules.style, 'flat');
  assert.equal(applied.architecture.roof_rules.profile, 'thin-parapet-terrace');
  assert.equal(applied.buildSpec.roof_style, 'flat');
  assert.equal(applied.architecture.generation_hints.template_composition_strategy.directives.preferred_massing_variant,
    'east-offset-glass-wing');
  assert.equal(applied.architecture.generation_hints.template_composition_strategy.directives.lock_preferred_massing_variant, true);
  assert.equal(applied.architecture.generation_hints.template_composition_strategy.directives.keep_existing, true);
  assert.equal(applied.architecture.facade_rules.front_side, 'east');
  assert.equal(applied.architecture.facade_rules.awnings, true);
  assert.equal(applied.architecture.facade_rules.large_glass, true);
  assert.equal(applied.architecture.facade_rules.entry_detail_variant, 'offset-frame');
  assert.equal(applied.architecture.site_rules.route_strategy, 'route-first-grounding');
  assert.equal(applied.architecture.design_directives.interior.color_story, 'quiet');
  assert.equal(applied.architecture.design_directives.interior.space_planning, 'function-before-furnishing');
  assert.equal(applied.architecture.design_directives.interior.furnishing_sequence, 'large-to-small');
  assert.deepEqual(applied.trace.applied_operations.map((row) => row.operation_id), [
    'language:roof:flat-parapet',
    'language:facade:sheltered-entry',
    'language:site:route-first-grounding',
    'language:interior:function-first-zoning',
    'language:interior:large-to-small-pass',
    'language:facade:daylit-window-wall',
    'language:massing:three-volume-interlock',
    'language:facade:private-entry-openness'
  ]);
  assert.equal(applied.trace.applied_operations.every((row) =>
    plan.selected_knowledge_ids.includes(row.knowledge_id)), true);
  assert.doesNotMatch(JSON.stringify(applied.trace), /\b(?:x|y|z|coordinate|block_id|command|repair_operation_id)\b/iu);
  assert.equal(architecture.roof_rules.style, undefined);
  assert.equal(buildSpec.roof_style, 'gabled');
});

test('does not select a flat-roof mapping when the user explicitly requires a pitched roof', async () => {
  const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });

  const plan = compileArchitectureLanguageV02({
    prompt: 'Build a modern villa with a pitched roof and a small roof terrace.',
    overlay
  });

  assert.equal(plan.selected_knowledge_ids.includes('knowledge:p7:modern-flat-roof-option'), false);
});

test('does not select semantics that explicit user constraints reject', async () => {
  const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });
  const cases = [
    ['Build a modern villa without glass.', 'knowledge:p7:daylit-window-wall-integration'],
    ['Build a modern villa with no porch or canopy.', 'knowledge:p7:weather-sheltered-entrance-transition'],
    ['Build a modern single-volume villa with a garage wing.', 'knowledge:p7:modern-interlocking-volume'],
    ['Build a traditional villa, not a modern villa.', 'knowledge:p7:modern-interlocking-volume']
  ];
  for (const [prompt, rejectedId] of cases) {
    const plan = compileArchitectureLanguageV02({ prompt, overlay });
    assert.equal(plan.selected_knowledge_ids.includes(rejectedId), false, prompt);
  }
});

test('rejects forged plan provenance, trace fields, parameters, duplicates, and extra fields', async () => {
  const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });
  const valid = compileArchitectureLanguageV02({ prompt: 'Build a flat roof house.', overlay });
  const mutations = [
    (plan) => { plan.overlay_sha256 = '0'.repeat(64); },
    (plan) => { plan.instructions[0].classification = 'unsupported'; },
    (plan) => { plan.instructions[0].workflow_stage = 'fake\nstage'; },
    (plan) => { plan.instructions[0].parameters.command = 'say forged'; },
    (plan) => { plan.instructions.push(structuredClone(plan.instructions[0])); plan.selected_knowledge_ids.push(plan.selected_knowledge_ids[0]); },
    (plan) => { plan.extra = true; }
  ];
  for (const mutate of mutations) {
    const plan = structuredClone(valid);
    mutate(plan);
    assert.throws(() => applyArchitectureLanguageV02({ plan, architecture: {}, buildSpec: {} }),
      { code: 'ARCHITECTURE_LANGUAGE_INVALID' });
  }
});

test('feeds Architecture Language preferences through the existing semantic agents before deterministic compilation', async (t) => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'architecture-language-design-'));
  t.after(() => fs.rm(outputDir, { recursive: true, force: true }));
  const prompt = 'Build a private modern lakeside villa with interlocking volumes, a flat roof terrace, large glass, a sheltered entry, a path, garden, functional interior, and a large-to-small furnishing pass.';
  const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });
  const architectureLanguage = compileArchitectureLanguageV02({ prompt, overlay });

  const prepared = await prepareConstructionDesign({
    prompt,
    mode: 'mock',
    outputDir,
    cwd: ROOT,
    seed: 7101,
    architectureLanguage
  });

  assert.equal(prepared.architecture.roof_rules.style, 'flat');
  assert.equal(prepared.buildSpec.roof_style, 'flat');
  assert.equal(prepared.creativeDesign.design_axes.massing_variant, 'east-offset-glass-wing');
  assert.deepEqual(prepared.architecture.volumes.map((volume) => volume.id),
    ['main', 'glass-wing', 'view-terrace']);
  assert.equal(prepared.architecture.generation_hints.architecture_language.plan.language_version, '0.2.0');
  assert.equal(prepared.architecture.generation_hints.architecture_language.trace.applied_operations.length, 8);
  assert.equal(prepared.architecture.design_directives.interior.space_planning, 'function-before-furnishing');
  assert.equal(prepared.architecture.design_directives.interior.furnishing_sequence, 'large-to-small');
  assert.equal(prepared.architecture.facade_rules.entry_detail_variant, 'offset-frame');
});

test('exports deterministic knowledge-to-operation traceability beside a portable relative datapack', async (t) => {
  const roots = await Promise.all([0, 1].map(() =>
    fs.mkdtemp(path.join(os.tmpdir(), 'architecture-language-output-'))));
  t.after(() => Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true }))));
  const prompt = 'Build a private modern lakeside villa with interlocking volumes, a flat roof terrace, large glass, a sheltered entry, a path, garden, functional interior, and a large-to-small furnishing pass.';
  const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });
  const architectureLanguage = compileArchitectureLanguageV02({ prompt, overlay });

  const results = [];
  for (const outputDir of roots) {
    results.push(await runConstructionWorkflow({
      prompt,
      mode: 'mock',
      outputDir,
      cwd: ROOT,
      seed: 7101,
      architectureLanguage,
      critics: false
    }));
  }

  assert.deepEqual(results[0].blueprint.architectureLanguage,
    results[1].blueprint.architectureLanguage);
  assert.deepEqual(results[0].blueprint.operations, results[1].blueprint.operations);
  assert.equal(Object.hasOwn(results[0].artifacts, 'architectureLanguage'), false);
  const artifact = JSON.parse(await fs.readFile(results[0].artifacts.blueprint, 'utf8'));
  assert.deepEqual(artifact.architectureLanguage, results[0].blueprint.architectureLanguage);
  const report = await fs.readFile(results[0].artifacts.report, 'utf8');
  assert.match(report, /Architecture Language v0\.2/u);
  assert.match(report, /knowledge:p7:modern-interlocking-volume/u);
  const pack = JSON.parse(await fs.readFile(path.join(results[0].artifacts.datapackDir, 'pack.mcmeta'), 'utf8'));
  assert.equal(pack.pack.pack_format, 48);
  for (const functionName of ['build.mcfunction', 'clear.mcfunction']) {
    const body = await fs.readFile(path.join(results[0].artifacts.datapackDir,
      'data/architect/function', functionName), 'utf8');
    const commands = body.split('\n').filter((line) => line && !line.startsWith('#'));
    assert.ok(commands.length > 0);
    assert.ok(commands.every((line) => /(?:^| )~-?\d*(?: |$)/u.test(line)));
  }
});
