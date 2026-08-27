import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  buildFrozenGeneratorContext,
  compileDesignLayers,
  prepareConstructionDesign
} from '../src/construction/designStages.js';
import { FacadeAgent } from '../src/construction/agents/facadeAgent.js';
import { RoofAgent } from '../src/construction/agents/roofAgent.js';
import { StructureAgent } from '../src/construction/agents/structureAgent.js';
import { deriveBuildSpec as deriveNeutralBuildSpec } from '../src/construction/buildSpec.js';
import { deriveBuildSpec as deriveWorkflowBuildSpec } from '../src/construction/workflow.js';

const HASH = 'a'.repeat(64);
const PROMPT = '建造一座两层中世纪民居，三体块、深色坡屋顶、木框架与石质基座';

test('workflow re-exports the dependency-neutral build-spec implementation', () => {
  assert.equal(deriveWorkflowBuildSpec, deriveNeutralBuildSpec);
});

test('prepareConstructionDesign preserves architect, planner, creative provider order and freezes only canonical context', async () => {
  const root = path.resolve('.tmp', `construction-design-stages-${Date.now()}-${Math.random()}`);
  const calls = [];
  const originalProvider = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = 'must-not-create-a-second-client';
  const llmClient = {
    name: 'configured-test-client',
    isConfigured: () => true,
    async chatJson({ system }) {
      const label = system.includes('建筑架构师') ? 'architect'
        : system.includes('平面规划') ? 'planner'
          : 'creative';
      calls.push(label);
      throw new Error(`force-${label}-fallback`);
    }
  };

  try {
    const prepared = await prepareConstructionDesign({
      prompt: PROMPT,
      mode: 'auto',
      outputDir: root,
      seed: 424242,
      candidateId: 'candidate-01',
      frozenDesignSha256: HASH,
      llmClient
    });

    assert.deepEqual(calls, ['architect', 'planner', 'creative']);
    assert.deepEqual(Object.keys(prepared.frozen_generator_context), [
      'schema_version', 'candidate_id', 'seed', 'frozen_design_sha256', 'architecture',
      'topology', 'creative_design', 'concept', 'build_spec', 'style_preset',
      'material_palette', 'template_knowledge'
    ]);
    const serializedContext = JSON.stringify(prepared.frozen_generator_context);
    assert.equal(serializedContext.includes('configured-test-client'), false);
    assert.equal(serializedContext.includes('force-architect-fallback'), false);
    assert.equal(serializedContext.includes('force-planner-fallback'), false);
    assert.equal(serializedContext.includes('force-creative-fallback'), false);
    assert.equal(Object.isFrozen(prepared.frozen_generator_context), true);
    assert.equal(Object.getPrototypeOf(prepared.frozen_generator_context), Object.prototype);
  } finally {
    if (originalProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = originalProvider;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('buildFrozenGeneratorContext rejects non-canonical persisted values', () => {
  const mutations = [
    (value) => { value.architecture.client = { chatJson() {} }; },
    (value) => { value.architecture.callback = () => {}; },
    (value) => { Object.defineProperty(value.architecture, 'computed', { enumerable: true, get: () => 1 }); },
    (value) => { value.architecture[Symbol('hidden')] = true; },
    (value) => { value.architecture.loop = value; },
    (value) => { value.architecture.grid = new Map([['0,0,0', { block: 'minecraft:stone' }]]); }
  ];

  for (const mutate of mutations) {
    const value = frozenContextInput();
    mutate(value);
    assert.throws(() => buildFrozenGeneratorContext(value), { code: 'P5_DESIGN_INVALID' });
  }
});

test('compileDesignLayers compiles structure, roof, facade in order with exact layer keys', async () => {
  const root = path.resolve('.tmp', `construction-layer-order-${Date.now()}-${Math.random()}`);
  const prepared = await prepareConstructionDesign({ prompt: PROMPT, mode: 'mock', outputDir: root, seed: 424242 });
  const calls = [];
  const originals = [StructureAgent, RoofAgent, FacadeAgent].map((Agent) => Agent.prototype.run);

  StructureAgent.prototype.run = function (...args) {
    calls.push('structure');
    return originals[0].apply(this, args);
  };
  RoofAgent.prototype.run = function (...args) {
    calls.push('roof');
    return originals[1].apply(this, args);
  };
  FacadeAgent.prototype.run = function (...args) {
    calls.push('facade');
    return originals[2].apply(this, args);
  };

  try {
    const compiled = compileDesignLayers({ prepared, layerPayloads: undefined, resolvedEffectsByLayer: {} });
    assert.deepEqual(Object.keys(compiled), ['brief', 'massing', 'structure', 'roof', 'facade', 'runtime']);
    assert.deepEqual(calls, ['structure', 'roof', 'facade']);
    assert.deepEqual(compiled.runtime.architecture, prepared.architecture);
    assert.deepEqual(compiled.runtime.buildSpec, prepared.buildSpec);
    assert.equal(Object.isFrozen(compiled.structure), true);
    assert.equal(compiled.runtime.grid, undefined);
    const persistedRole = compiled.massing.volumes[0].role;
    prepared.architecture.volumes[0].role = 'runtime-mutation';
    assert.equal(compiled.massing.volumes[0].role, persistedRole);
    assert.equal(Object.isFrozen(compiled.massing.volumes[0]), true);
  } finally {
    [StructureAgent, RoofAgent, FacadeAgent].forEach((Agent, index) => { Agent.prototype.run = originals[index]; });
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('compileDesignLayers rejects naked non-empty effects that are not complete resolved operations', async () => {
  const root = path.resolve('.tmp', `construction-layer-effects-${Date.now()}-${Math.random()}`);
  try {
    const prepared = await prepareConstructionDesign({ prompt: PROMPT, mode: 'mock', outputDir: root, seed: 424242 });
    assert.throws(
      () => compileDesignLayers({ prepared, resolvedEffectsByLayer: { massing: [{ kind: 'set-volume-role' }] } }),
      { code: 'P5_REPAIR_INVALID' }
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('compileDesignLayers rejects unsafe or unknown effect maps before compiling layers', async () => {
  const root = path.resolve('.tmp', `construction-layer-effect-map-${Date.now()}-${Math.random()}`);
  try {
    const prepared = await prepareConstructionDesign({ prompt: PROMPT, mode: 'mock', outputDir: root, seed: 424242 });
    const accessorMap = {};
    Object.defineProperty(accessorMap, 'brief', { enumerable: true, get: () => [] });
    const customPrototypeMap = Object.create({});
    customPrototypeMap.brief = [];
    const invalidMaps = [
      { runtime: [{}] },
      { struture: [] },
      { roof: {} },
      accessorMap,
      customPrototypeMap
    ];

    for (const resolvedEffectsByLayer of invalidMaps) {
      assert.throws(
        () => compileDesignLayers({ prepared, resolvedEffectsByLayer }),
        { code: 'P5_REPAIR_INVALID' }
      );
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function frozenContextInput() {
  return {
    schema_version: 1,
    candidate_id: 'candidate-01',
    seed: 424242,
    frozen_design_sha256: HASH,
    architecture: {},
    topology: {},
    creative_design: {},
    concept: null,
    build_spec: {},
    style_preset: {},
    material_palette: {},
    template_knowledge: {}
  };
}
