import { ConstructionArchitectAgent } from './agents/architectAgent.js';
import { ConstructionPlannerAgent } from './agents/plannerAgent.js';
import { CreativeDesignAgent, applyCreativeDesign } from './agents/creativeDesignAgent.js';
import { StylePresetMemoryAgent } from './agents/stylePresetMemoryAgent.js';
import { MaterialPaletteAgent } from './agents/materialPaletteAgent.js';
import { FacadeAgent } from './agents/facadeAgent.js';
import { RoofAgent } from './agents/roofAgent.js';
import { StructureAgent } from './agents/structureAgent.js';
import {
  TemplateKnowledgeAgent,
  applyTemplateKnowledgeToArchitecture,
  applyTemplateKnowledgeToBuildSpec
} from './agents/templateKnowledgeAgent.js';
import { ConceptStudioAgent } from './agents/conceptStudioAgent.js';
import { ConceptSelectionAgent } from './agents/conceptSelectionAgent.js';
import { ConceptFusionAgent } from './agents/conceptFusionAgent.js';
import { runCoarseSemanticVoxelShadow } from './learning/coarseSemanticVoxelShadow.js';
import { createLlmClient } from '../llm/createLlmClient.js';
import { ensureDir } from '../lib/fs.js';
import { executeError, validateFrozenGeneratorContext, validateResolvedPatch } from '../playbook/execute/contracts.js';
import { DESIGN_LAYER_ORDER } from '../playbook/execute/constants.js';
import { deriveBuildSpec } from './buildSpec.js';
import { applyLayerEffects } from '../playbook/execute/repairTransaction.js';
import {
  applyArchitectureLanguageV02,
  finalizeArchitectureLanguageV02
} from '../playbook/runtime/architectureLanguageV02.js';

export async function prepareConstructionDesign({
  prompt,
  mode = 'mock',
  llmProvider: requestedLlmProvider,
  mcVersion = '1.21',
  outputDir,
  seed,
  seedSource = seed === undefined ? 'none' : 'manual',
  cwd = process.cwd(),
  conceptCount = 0,
  conceptStrategy = 'select',
  critics = true,
  neuralRetrieval = false,
  coarseVoxelMode = 'off',
  coarseVoxelProvider = 'baseline',
  coarseVoxelPlan,
  candidateId,
  frozenDesignSha256,
  frozenDesign,
  architectureLanguage,
  llmClient: injectedLlmClient
} = {}) {
  if (!prompt || !prompt.trim()) throw new Error('Prompt is required.');
  const designPrompt = buildPlaybookGuidedPrompt({ prompt, mode, frozenDesign });

  await ensureDir(outputDir);
  const llmClient = injectedLlmClient || createLlmClient({
    cwd,
    provider: requestedLlmProvider
  });
  const llmProvider = mode === 'mock' ? 'disabled-by-mock-mode' : llmClient.name;

  let architecture = await new ConstructionArchitectAgent({ llmClient, mode }).run(designPrompt);
  const stylePreset = new StylePresetMemoryAgent().run(designPrompt, architecture);
  const materialPalette = new MaterialPaletteAgent().run(designPrompt, architecture, stylePreset);
  architecture = {
    ...architecture,
    materials: materialPalette.materials,
    generation_hints: {
      ...(architecture.generation_hints || {}),
      style_preset: stylePreset.id,
      material_palette: materialPalette.palette
    }
  };
  let buildSpec = deriveBuildSpec(designPrompt, architecture, seed);
  const templateKnowledge = new TemplateKnowledgeAgent({ cwd, neuralRetrieval }).run(designPrompt, architecture, buildSpec);
  architecture = applyTemplateKnowledgeToArchitecture(architecture, templateKnowledge);
  if (architecture.generation_hints?.template_material_patch) {
    materialPalette.materials = architecture.materials;
    materialPalette.template_material_guidance = architecture.generation_hints.template_material_guidance;
    materialPalette.template_material_patch = architecture.generation_hints.template_material_patch;
    materialPalette.roles = Object.keys(materialPalette.materials || {}).sort();
  }
  buildSpec = applyTemplateKnowledgeToBuildSpec(buildSpec, templateKnowledge);
  if (architectureLanguage !== undefined) {
    const appliedLanguage = applyArchitectureLanguageV02({
      plan: architectureLanguage,
      architecture,
      buildSpec
    });
    architecture = appliedLanguage.architecture;
    buildSpec = appliedLanguage.buildSpec;
  }
  let topology = await new ConstructionPlannerAgent({ llmClient, mode }).run(designPrompt, architecture, buildSpec);
  const conceptStudio = await runConceptStudio({
    prompt: designPrompt,
    mode,
    llmClient,
    architecture,
    buildSpec,
    topology,
    templateKnowledge,
    conceptCount,
    conceptStrategy,
    seed
  });
  let creativeDesign = await new CreativeDesignAgent({ llmClient, mode }).run(
    designPrompt,
    architecture,
    buildSpec,
    topology,
    { conceptStudio }
  );
  ({ architecture, buildSpec, topology, creativeDesign } = applyCreativeDesign({
    architecture, buildSpec, topology, creativeDesign, prompt: designPrompt
  }));
  if (architectureLanguage !== undefined) {
    const finalizedLanguage = finalizeArchitectureLanguageV02({
      plan: architectureLanguage,
      architecture,
      creativeDesign
    });
    architecture = finalizedLanguage.architecture;
    creativeDesign = finalizedLanguage.creativeDesign;
  }
  const stage7Shadow = await runCoarseSemanticVoxelShadow({
    mode: coarseVoxelMode,
    provider: coarseVoxelProvider,
    artifactPath: coarseVoxelPlan,
    prompt: designPrompt,
    seed,
    architecture,
    buildSpec,
    topology,
    creativeDesign,
    conceptStudio,
    templateKnowledge
  });
  const llmUsage = summarizeLlmUsage({ mode, llmProvider, architecture, topology, creativeDesign });

  const prepared = {
    prompt,
    mode,
    mcVersion,
    outputDir,
    seed,
    seedSource,
    cwd,
    conceptCount,
    conceptStrategy,
    critics,
    neuralRetrieval,
    coarseVoxelMode,
    coarseVoxelProvider,
    coarseVoxelPlan,
    llmClient,
    llmProvider,
    llmUsage,
    architecture,
    topology,
    creativeDesign,
    conceptStudio,
    stylePreset,
    materialPalette,
    templateKnowledge,
    buildSpec,
    stage7Shadow
  };
  if (frozenDesign !== undefined) prepared.frozenDesign = frozenDesign;

  if (candidateId !== undefined || frozenDesignSha256 !== undefined || frozenDesign !== undefined) {
    const persistedLlmProvider = mode === 'mock' ? 'disabled-by-mock-mode' : 'configured-provider';
    prepared.frozen_generator_context = buildFrozenGeneratorContext({
      schema_version: 1,
      candidate_id: candidateId,
      seed,
      frozen_design_sha256: frozenDesignSha256,
      architecture,
      topology,
      creative_design: creativeDesign,
      concept_studio: conceptStudio || null,
      stage7_shadow: stage7Shadow || null,
      build_spec: buildSpec,
      style_preset: stylePreset,
      material_palette: materialPalette,
      template_knowledge: templateKnowledge,
      prompt,
      mode,
      mc_version: mcVersion,
      seed_source: seedSource,
      concept_count: clampConceptCount(conceptCount),
      concept_strategy: conceptStrategy,
      critics: Boolean(critics),
      neural_retrieval: Boolean(neuralRetrieval),
      coarse_voxel_mode: coarseVoxelMode,
      coarse_voxel_provider: coarseVoxelProvider,
      coarse_voxel_plan: null,
      llm_provider: persistedLlmProvider,
      llm_usage: projectPersistedLlmUsage(llmUsage, persistedLlmProvider)
    });
    Object.assign(prepared, preparedFromFrozenGeneratorContext(prepared.frozen_generator_context, { outputDir, cwd }));
  }

  return prepared;
}

export function buildPlaybookGuidedPrompt({ prompt, mode, frozenDesign } = {}) {
  if (typeof prompt !== 'string' || mode === 'mock' || !frozenDesign) return prompt;
  const authority = frozenDesign.advisory_overlay_sha256;
  if (typeof authority !== 'string' || !Array.isArray(frozenDesign.layer_intents)) return prompt;
  return [
    prompt,
    '',
    'Architecture playbook design intent guidance (advisory; preserve the user request):',
    `advisory_overlay_sha256=${authority}`,
    `brief_intent=${frozenDesign.brief_intent}`,
    ...frozenDesign.layer_intents.map((row) => `${row.layer}_intent=${row.intent}`)
  ].join('\n');
}

export function buildFrozenGeneratorContext(value) {
  try {
    return validateFrozenGeneratorContext(canonicalClone(value, {
      omitKeys: new Set(['llm_error', 'rawArtifactSource'])
    }));
  } catch {
    throw executeError('P5_DESIGN_INVALID');
  }
}

export function preparedFromFrozenGeneratorContext(context, { outputDir, cwd } = {}) {
  const value = validateFrozenGeneratorContext(context);
  return {
    prompt: value.prompt,
    mode: value.mode,
    mcVersion: value.mc_version,
    outputDir,
    seed: value.seed,
    seedSource: value.seed_source,
    cwd,
    conceptCount: value.concept_count,
    conceptStrategy: value.concept_strategy,
    critics: value.critics,
    neuralRetrieval: value.neural_retrieval,
    coarseVoxelMode: value.coarse_voxel_mode,
    coarseVoxelProvider: value.coarse_voxel_provider,
    coarseVoxelPlan: undefined,
    llmProvider: value.llm_provider,
    llmUsage: value.llm_usage,
    architecture: value.architecture,
    topology: value.topology,
    creativeDesign: value.creative_design,
    conceptStudio: value.concept_studio || undefined,
    stage7Shadow: value.stage7_shadow || undefined,
    buildSpec: value.build_spec,
    stylePreset: value.style_preset,
    materialPalette: value.material_palette,
    templateKnowledge: value.template_knowledge,
    frozen_generator_context: value
  };
}

export function compileDesignLayers({ prepared, layerPayloads, resolvedEffectsByLayer = {} }) {
  resolvedEffectsByLayer = validateResolvedEffectsByLayer(resolvedEffectsByLayer);
  const briefResult = compileBriefLayer({
    prepared,
    previousLayer: layerPayloads?.brief,
    effects: resolvedEffectsByLayer.brief || []
  });
  const massingResult = compileMassingLayer({
    prepared,
    brief: briefResult,
    previousLayer: layerPayloads?.massing,
    effects: resolvedEffectsByLayer.massing || []
  });
  const structureResult = compileStructureLayer({
    prepared,
    brief: briefResult,
    massing: massingResult,
    previousLayer: layerPayloads?.structure,
    effects: resolvedEffectsByLayer.structure || []
  });
  const roofResult = compileRoofLayer({
    prepared,
    brief: briefResult,
    massing: massingResult,
    structure: structureResult,
    previousLayer: layerPayloads?.roof,
    effects: resolvedEffectsByLayer.roof || []
  });
  const facadeResult = compileFacadeLayer({
    prepared,
    brief: briefResult,
    massing: massingResult,
    structure: structureResult,
    roof: roofResult,
    previousLayer: layerPayloads?.facade,
    effects: resolvedEffectsByLayer.facade || []
  });

  return {
    brief: briefResult.payload,
    massing: massingResult.payload,
    structure: structureResult.payload,
    roof: roofResult.payload,
    facade: facadeResult.payload,
    runtime: {
      architecture: massingResult.runtime.architecture,
      topology: briefResult.runtime.topology,
      creativeDesign: briefResult.runtime.creativeDesign,
      buildSpec: massingResult.runtime.buildSpec,
      structure: structureResult.runtime,
      roof: roofResult.runtime,
      facade: facadeResult.runtime
    }
  };
}

export async function compileDesignLayersForReplay({
  prepared, layerPayloads, resolvedEffectsByLayer = {}, replayStartLayer, faultInjector
}) {
  const resolved = validateResolvedEffectsByLayer(resolvedEffectsByLayer);
  const start = DESIGN_LAYER_ORDER.indexOf(replayStartLayer);
  if (start < 0 || faultInjector !== undefined && typeof faultInjector !== 'function') {
    throw executeError('P5_REPAIR_INVALID');
  }
  const compile = async (layer, fn, args) => {
    const index = DESIGN_LAYER_ORDER.indexOf(layer);
    if (index >= start && faultInjector) await faultInjector(`compile-${layer}`, layer);
    let result = fn({ ...args, effects: [] });
    const operations = resolved[layer] || [];
    if (operations.length > 0) {
      if (index < start) throw executeError('P5_REPAIR_INVALID');
      if (faultInjector) await faultInjector('apply-effects', layer);
      const payload = applyLayerEffects({ payload: result.payload, operations });
      if (layer === 'massing') {
        result = { payload, runtime: { architecture: { ...args.brief.runtime.architecture, volumes: payload.volumes }, buildSpec: payload.build_spec } };
      } else if (layer === 'structure') result = { payload, runtime: payload };
      else throw executeError('P5_REPAIR_INVALID');
    }
    return result;
  };
  const brief = await compile('brief', compileBriefLayer, { prepared, previousLayer: layerPayloads?.brief });
  const massing = await compile('massing', compileMassingLayer, { prepared, brief, previousLayer: layerPayloads?.massing });
  const structure = await compile('structure', compileStructureLayer, { prepared, brief, massing, previousLayer: layerPayloads?.structure });
  const roof = await compile('roof', compileRoofLayer, { prepared, brief, massing, structure, previousLayer: layerPayloads?.roof });
  const facade = await compile('facade', compileFacadeLayer, { prepared, brief, massing, structure, roof, previousLayer: layerPayloads?.facade });
  return {
    brief: brief.payload, massing: massing.payload, structure: structure.payload,
    roof: roof.payload, facade: facade.payload,
    runtime: {
      architecture: massing.runtime.architecture, topology: brief.runtime.topology,
      creativeDesign: brief.runtime.creativeDesign, buildSpec: massing.runtime.buildSpec,
      structure: structure.runtime, roof: roof.runtime, facade: facade.runtime
    }
  };
}

export function compileBriefLayer({ prepared, previousLayer, effects = [] }) {
  let payload = validateLayerPayload(previousLayer || {
    prompt: prepared.prompt,
    typology: prepared.architecture.typology,
    style_family: prepared.architecture.style_family,
    footprint: prepared.architecture.footprint,
    constraints: prepared.buildSpec.constraints || {},
    selected_rule_ids: prepared.frozenDesign?.selected_rule_ids || [],
    rejected_rule_ids: prepared.frozenDesign?.rejected_rule_ids || [],
    repair_variant_preferences: prepared.frozenDesign?.repair_variant_preferences || []
  });
  payload = applyResolvedOperations('brief', payload, effects);
  return {
    payload,
    runtime: {
      architecture: prepared.architecture,
      topology: prepared.topology,
      creativeDesign: prepared.creativeDesign
    }
  };
}

export function compileMassingLayer({ prepared, brief, previousLayer, effects = [] }) {
  let payload = validateLayerPayload(previousLayer || {
    volumes: brief.runtime.architecture.volumes,
    build_spec: prepared.buildSpec
  });
  payload = applyResolvedOperations('massing', payload, effects);
  return {
    payload,
    runtime: previousLayer || effects.length > 0
      ? {
          architecture: { ...brief.runtime.architecture, volumes: payload.volumes },
          buildSpec: payload.build_spec
        }
      : {
          architecture: brief.runtime.architecture,
          buildSpec: prepared.buildSpec
        }
  };
}

export function compileStructureLayer({ prepared, brief, massing, previousLayer, effects = [] }) {
  let runtime = validateLayerPayload(previousLayer || new StructureAgent().run(
    massing.runtime.architecture,
    massing.runtime.buildSpec,
    brief.runtime.topology
  ));
  runtime = applyResolvedOperations('structure', runtime, effects);
  return { payload: runtime, runtime };
}

export function compileRoofLayer({ prepared, brief, massing, structure, previousLayer, effects = [] }) {
  let runtime = validateLayerPayload(previousLayer || new RoofAgent().run(
    prepared.prompt,
    massing.runtime.architecture,
    massing.runtime.buildSpec,
    structure.runtime,
    prepared.materialPalette,
    prepared.stylePreset
  ));
  runtime = applyResolvedOperations('roof', runtime, effects);
  return { payload: runtime, runtime };
}

export function compileFacadeLayer({ prepared, brief, massing, structure, roof, previousLayer, effects = [] }) {
  let runtime = validateLayerPayload(previousLayer || new FacadeAgent().run(
    prepared.prompt,
    massing.runtime.architecture,
    massing.runtime.buildSpec,
    brief.runtime.topology,
    prepared.materialPalette,
    prepared.stylePreset
  ));
  runtime = applyResolvedOperations('facade', runtime, effects);
  return { payload: runtime, runtime };
}

function applyResolvedOperations(layer, payload, operations) {
  if (!Array.isArray(operations)) throw executeError('P5_REPAIR_INVALID');
  if (operations.length === 0) return payload;
  if (operations.some((operation) => validateResolvedPatch(operation).target_layer !== layer)) {
    throw executeError('P5_REPAIR_INVALID');
  }
  return applyLayerEffects({ payload, operations });
}

function validateResolvedEffectsByLayer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw executeError('P5_REPAIR_INVALID');
  }
  if (Object.getOwnPropertySymbols(value).length !== 0 || Object.getOwnPropertyNames(value).length !== Object.keys(value).length) {
    throw executeError('P5_REPAIR_INVALID');
  }
  const output = {};
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!DESIGN_LAYER_ORDER.includes(key) || !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw executeError('P5_REPAIR_INVALID');
    }
    const effects = descriptor.value;
    if (!Array.isArray(effects) || Object.getPrototypeOf(effects) !== Array.prototype) {
      throw executeError('P5_REPAIR_INVALID');
    }
    if (Object.getOwnPropertySymbols(effects).length !== 0 || Object.getOwnPropertyNames(effects).length !== effects.length + 1) {
      throw executeError('P5_REPAIR_INVALID');
    }
    output[key] = Object.freeze(effects.map((effect) => validateResolvedPatch(effect)));
  }
  return Object.freeze(output);
}

function validateLayerPayload(value) {
  try {
    return canonicalClone(value);
  } catch {
    throw executeError('P5_DESIGN_INVALID');
  }
}

function canonicalClone(value, { omitKeys = new Set() } = {}) {
  const ancestors = new WeakSet();
  const clone = (item) => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError('non-finite');
      return item;
    }
    if (!item || typeof item !== 'object' || ancestors.has(item) || Object.getOwnPropertySymbols(item).length > 0) {
      throw new TypeError('non-canonical');
    }
    ancestors.add(item);
    if (Array.isArray(item)) {
      if (Object.getPrototypeOf(item) !== Array.prototype) throw new TypeError('array-prototype');
      const names = Object.getOwnPropertyNames(item);
      if (names.length !== item.length + 1 || !names.includes('length')) throw new TypeError('array-properties');
      const output = item.map((_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError('array-accessor');
        return clone(descriptor.value);
      });
      ancestors.delete(item);
      return Object.freeze(output);
    }
    if (Object.getPrototypeOf(item) !== Object.prototype) throw new TypeError('object-prototype');
    const output = {};
    for (const key of Object.keys(item)) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError('object-accessor');
      if (descriptor.value === undefined || omitKeys.has(key)) continue;
      output[key] = clone(descriptor.value);
    }
    if (Object.getOwnPropertyNames(item).length !== Object.keys(item).length) throw new TypeError('hidden-properties');
    ancestors.delete(item);
    return Object.freeze(output);
  };
  return clone(value);
}

async function runConceptStudio({ prompt, mode, llmClient, architecture, buildSpec, topology, templateKnowledge, conceptCount = 0, conceptStrategy = 'select', seed }) {
  const count = clampConceptCount(conceptCount);
  if (count < 2) return undefined;
  const base = await new ConceptStudioAgent({ llmClient, mode }).run(
    prompt,
    architecture,
    buildSpec,
    topology,
    templateKnowledge,
    { count, strategy: conceptStrategy, seed }
  );
  if (!base.active || base.concepts.length < 2) return base;
  const selection = new ConceptSelectionAgent().run(base.concepts, {
    prompt,
    architecture,
    buildSpec,
    templateKnowledge
  });
  let selectedConcept = base.concepts.find((item) => item.id === selection.selected_concept_id);
  let fusion;
  if (String(base.strategy) === 'fuse') {
    fusion = new ConceptFusionAgent().run(base.concepts, selection, { prompt, architecture, buildSpec });
    if (fusion.active && fusion.concept) selectedConcept = fusion.concept;
  }
  return {
    ...base,
    selected_concept_id: selectedConcept?.id || selection.selected_concept_id,
    fused_concept_id: fusion?.active ? fusion.concept?.id : undefined,
    selection,
    fusion,
    selectedConcept,
    warnings: [...(base.warnings || []), ...(selection.warnings || []), ...(fusion?.warnings || [])]
  };
}

function clampConceptCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 2) return 0;
  return Math.max(2, Math.min(5, Math.round(number)));
}

function summarizeLlmUsage({ mode, llmProvider, architecture, topology, creativeDesign }) {
  const stages = [
    summarizeLlmStage('ArchitectAgent', architecture),
    summarizeLlmStage('PlannerAgent', topology),
    summarizeLlmStage('CreativeDesignAgent', creativeDesign)
  ];
  const called = stages.some((stage) => stage.called);
  const used = stages.some((stage) => stage.used);
  const failedStages = stages.filter((stage) => stage.error);
  return {
    mode,
    provider: llmProvider,
    called,
    used,
    status: used ? 'used' : called ? 'fallback-after-error' : 'not-called',
    stages,
    errors: failedStages.map((stage) => `${stage.agent}: ${stage.error}`)
  };
}

function summarizeLlmStage(agent, output = {}) {
  const source = String(output?.source || 'unknown');
  const decisionSource = String(output?.decision_source || '');
  const called = source === 'llm' || source === 'fallback-after-llm-error' || decisionSource === 'llm' || decisionSource === 'fallback-after-llm-error';
  const used = source === 'llm' || decisionSource === 'llm';
  const stage = { agent, source: decisionSource || source, called, used };
  if (output?.llm_error) stage.error = String(output.llm_error);
  return stage;
}

function projectPersistedLlmUsage(usage, provider) {
  const stages = Array.isArray(usage?.stages) ? usage.stages.map((stage) => ({
    agent: String(stage.agent),
    source: String(stage.source),
    called: Boolean(stage.called),
    used: Boolean(stage.used),
    ...(stage.error ? { error: 'provider-error' } : {})
  })) : [];
  return {
    mode: String(usage?.mode || 'mock'),
    provider,
    called: Boolean(usage?.called),
    used: Boolean(usage?.used),
    status: String(usage?.status || 'not-called'),
    stages,
    errors: stages.filter((stage) => stage.error).map((stage) => `${stage.agent}: provider-error`)
  };
}
