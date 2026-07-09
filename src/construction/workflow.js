import fs from 'node:fs/promises';
import path from 'node:path';
import { ConstructionArchitectAgent } from './agents/architectAgent.js';
import { ConstructionPlannerAgent } from './agents/plannerAgent.js';
import { CreativeDesignAgent, applyCreativeDesign } from './agents/creativeDesignAgent.js';
import { StylePresetMemoryAgent } from './agents/stylePresetMemoryAgent.js';
import { MaterialPaletteAgent } from './agents/materialPaletteAgent.js';
import { FacadeAgent } from './agents/facadeAgent.js';
import { RoofAgent } from './agents/roofAgent.js';
import { SiteLandscapeAgent } from './agents/siteLandscapeAgent.js';
import { StructureAgent } from './agents/structureAgent.js';
import { InteriorDetailAgent } from './agents/interiorDetailAgent.js';
import { OpeningConnectivityAgent } from './agents/openingConnectivityAgent.js';
import { ConstraintRepairAgent } from './agents/constraintRepairAgent.js';
import { ConstructionDecoratorAgent } from './agents/decoratorAgent.js';
import { BlueprintOptimizerAgent } from './agents/blueprintOptimizerAgent.js';
import { BlueprintQAAgent } from './agents/blueprintQaAgent.js';
import { VisualizationAgent } from './agents/visualizationAgent.js';
import { TemplateKnowledgeAgent, applyTemplateKnowledgeToArchitecture, applyTemplateKnowledgeToBuildSpec } from './agents/templateKnowledgeAgent.js';
import { TemplateAestheticReviewAgent } from './agents/templateAestheticReviewAgent.js';
import { TemplateLawCoverageAgent } from './agents/templateLawCoverageAgent.js';
import { TemplateLawAutoRepairAgent } from './agents/templateLawAutoRepairAgent.js';
import { TemplateAssimilationAuditAgent } from './agents/templateAssimilationAuditAgent.js';
import { TemplateInteriorDensityRepairAgent } from './agents/templateInteriorDensityRepairAgent.js';
import { InteriorClearanceRepairAgent } from './agents/interiorClearanceRepairAgent.js';
import { ConstructionEvaluationAgent } from './agents/constructionEvaluationAgent.js';
import { ConceptStudioAgent } from './agents/conceptStudioAgent.js';
import { ConceptSelectionAgent } from './agents/conceptSelectionAgent.js';
import { ConceptFusionAgent } from './agents/conceptFusionAgent.js';
import { CriticCouncilAgent } from './agents/criticCouncilAgent.js';
import { CSGBuilder, computeBounds } from './engine/csgBuilder.js';
import { BSPPartitioner } from './engine/bspPartitioner.js';
import { AStarPathfinder } from './engine/pathfinder.js';
import { createLlmClient } from '../llm/createLlmClient.js';
import { ensureDir, writeJson } from '../lib/fs.js';
import { resolveWorldDir } from '../lib/minecraftWorlds.js';
import { detectDoorSide, detectFloors, detectScale } from './agents/architectAgent.js';

export async function runConstructionWorkflow({
  prompt,
  mode = 'mock',
  mcVersion = '1.21',
  outputDir,
  seed,
  seedSource = seed === undefined ? 'none' : 'manual',
  cwd = process.cwd(),
  minecraftDir,
  world,
  datapacksDir,
  autoBuild = false,
  conceptCount = 0,
  conceptStrategy = 'select',
  critics = true
}) {
  if (!prompt || !prompt.trim()) throw new Error('Prompt is required.');

  await ensureDir(outputDir);
  const llmClient = createLlmClient({ cwd });
  const llmProvider = mode === 'mock' ? 'disabled-by-mock-mode' : llmClient.name;

  let architecture = await new ConstructionArchitectAgent({ llmClient, mode }).run(prompt);
  const stylePreset = new StylePresetMemoryAgent().run(prompt, architecture);
  const materialPalette = new MaterialPaletteAgent().run(prompt, architecture, stylePreset);
  architecture = {
    ...architecture,
    materials: materialPalette.materials,
    generation_hints: {
      ...(architecture.generation_hints || {}),
      style_preset: stylePreset.id,
      material_palette: materialPalette.palette
    }
  };
  let buildSpec = deriveBuildSpec(prompt, architecture, seed);
  const templateKnowledge = new TemplateKnowledgeAgent({ cwd }).run(prompt, architecture, buildSpec);
  architecture = applyTemplateKnowledgeToArchitecture(architecture, templateKnowledge);
  if (architecture.generation_hints?.template_material_patch) {
    materialPalette.materials = architecture.materials;
    materialPalette.template_material_guidance = architecture.generation_hints.template_material_guidance;
    materialPalette.template_material_patch = architecture.generation_hints.template_material_patch;
    materialPalette.roles = Object.keys(materialPalette.materials || {}).sort();
  }
  buildSpec = applyTemplateKnowledgeToBuildSpec(buildSpec, templateKnowledge);
  let topology = await new ConstructionPlannerAgent({ llmClient, mode }).run(prompt, architecture, buildSpec);
  const conceptStudio = await runConceptStudio({
    prompt,
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
    prompt,
    architecture,
    buildSpec,
    topology,
    { conceptStudio }
  );
  ({ architecture, buildSpec, topology, creativeDesign } = applyCreativeDesign({ architecture, buildSpec, topology, creativeDesign, prompt }));
  const llmUsage = summarizeLlmUsage({ mode, llmProvider, architecture, topology, creativeDesign });
  const structure = new StructureAgent().run(architecture, buildSpec, topology);
  const facade = new FacadeAgent().run(prompt, architecture, buildSpec, topology, materialPalette, stylePreset);
  const roof = new RoofAgent().run(prompt, architecture, buildSpec, structure, facade, materialPalette, stylePreset);
  const site = new SiteLandscapeAgent().run(prompt, architecture, buildSpec, topology, materialPalette, stylePreset);
  const shell = new CSGBuilder(buildSpec, architecture.materials).generateShell(architecture, { structure, facade, roof, site });
  const layout = new BSPPartitioner(buildSpec, architecture.materials).fitRooms(shell, topology);
  const opening = new OpeningConnectivityAgent().run(prompt, architecture, buildSpec, topology, shell, layout, facade);
  const paths = new AStarPathfinder(buildSpec, architecture.materials).connect(shell, layout, topology, opening);
  const interior = new InteriorDetailAgent().run(layout.rooms, architecture, buildSpec, topology, materialPalette, stylePreset);
  const decorator = new ConstructionDecoratorAgent().run(layout.rooms, architecture.materials, {
    grid: shell.grid,
    buildSpec,
    architecture,
    topology,
    paths,
    materialPalette,
    facade,
    roof,
    site,
    opening,
    interior
  });
  const preRepair = new ConstraintRepairAgent().run({
    grid: shell.grid,
    buildSpec,
    architecture,
    topology,
    structure,
    facade,
    roof,
    site,
    opening,
    interior,
    layout,
    paths,
    decorator
  });
  const preBounds = computeBounds(shell.grid);
  const preBlueprint = buildBlueprint({
    prompt,
    architecture,
    topology,
    creativeDesign,
    conceptStudio,
    stylePreset,
    materialPalette,
    templateKnowledge,
    structure,
    facade,
    roof,
    site,
    opening,
    interior,
    repair: preRepair,
    templateLawAutoRepair: undefined,
    templateInteriorDensityRepair: undefined,
    interiorClearanceRepair: undefined,
    buildSpec,
    shell,
    layout,
    paths,
    decorator,
    exporter: { source: 'pre-template-law-auto-repair' },
    operations: [],
    bounds: preBounds,
    llmProvider,
    llmUsage,
    seedSource,
    seed
  });
  const preTemplateLawCoverage = new TemplateLawCoverageAgent().run(preBlueprint);
  const templateLawAutoRepair = new TemplateLawAutoRepairAgent().run({
    grid: shell.grid,
    blueprint: preBlueprint,
    coverage: preTemplateLawCoverage,
    buildSpec,
    architecture,
    topology,
    site,
    roof,
    opening,
    interior,
    decorator,
    layout
  });
  let templateInteriorDensityRepair = new TemplateInteriorDensityRepairAgent().run({
    grid: shell.grid,
    blueprint: preBlueprint,
    architecture,
    topology,
    interior,
    decorator,
    layout
  });
  const interiorClearanceRepair = new InteriorClearanceRepairAgent().run({
    grid: shell.grid,
    layout,
    decorator
  });
  const postClearanceInteriorDensityRepair = new TemplateInteriorDensityRepairAgent().run({
    grid: shell.grid,
    blueprint: preBlueprint,
    architecture,
    topology,
    interior,
    decorator,
    layout
  });
  templateInteriorDensityRepair = mergeTemplateInteriorDensityRepairs(
    templateInteriorDensityRepair,
    postClearanceInteriorDensityRepair
  );
  const repair = new ConstraintRepairAgent().run({
    grid: shell.grid,
    buildSpec,
    architecture,
    topology,
    structure,
    facade,
    roof,
    site,
    opening,
    interior,
    layout,
    paths,
    decorator,
    templateLawAutoRepair,
    templateInteriorDensityRepair,
    interiorClearanceRepair
  });
  const bounds = computeBounds(shell.grid);
  const exportPlan = new BlueprintOptimizerAgent().run(shell.grid, {
    maxFillVolume: buildSpec.constraints?.minecraft_fill_limit
  });
  const operations = exportPlan.operations;
  const blueprint = buildBlueprint({
    prompt,
    architecture,
    topology,
    creativeDesign,
    conceptStudio,
    stylePreset,
    materialPalette,
    templateKnowledge,
    structure,
    facade,
    roof,
    site,
    opening,
    interior,
    repair,
    templateLawAutoRepair,
    templateInteriorDensityRepair,
    interiorClearanceRepair,
    buildSpec,
    shell,
    layout,
    paths,
    decorator,
    exporter: exportPlan.optimizer,
    operations,
    bounds,
    llmProvider,
    llmUsage,
    seedSource,
    seed
  });
  blueprint.templateLawCoverage = new TemplateLawCoverageAgent().run(blueprint);
  if (blueprint.templateLawAutoRepair) {
    blueprint.templateLawAutoRepair.coverage_after = compactTemplateLawCoverage(blueprint.templateLawCoverage);
  }
  blueprint.templateAestheticReview = new TemplateAestheticReviewAgent().run(blueprint);
  blueprint.templateAssimilationAudit = new TemplateAssimilationAuditAgent().run(blueprint);
  const validation = validateBlueprint(blueprint);
  if (!validation.ok) throw new Error(`Blueprint validation failed: ${validation.errors.join('; ')}`);
  const architectureScorecard = new ConstructionEvaluationAgent().run({
    workflow: 'construction_method_v1',
    runtime: 'nodejs',
    prompt,
    outputDir,
    mode,
    seed,
    seedSource,
    llmProvider,
    llmUsage,
    mcVersion,
    architecture,
    topology,
    buildSpec,
    geometry: blueprint.geometry,
    blueprint,
    validation,
    artifacts: {
      previewHtml: path.join(outputDir, 'preview.html')
    }
  });
  blueprint.architectureScorecard = compactArchitectureScorecard(architectureScorecard);
  const criticCouncil = critics
    ? new CriticCouncilAgent().run({ blueprint, validation, architectureScorecard })
    : undefined;
  if (criticCouncil?.active) {
    blueprint.criticCouncil = compactCriticCouncil(criticCouncil);
  }

  const artifacts = await exportArtifacts({
    outputDir,
    blueprint,
    conceptStudio,
    criticCouncil,
    architectureScorecard,
    validation,
    prompt,
    mcVersion,
    autoBuild,
    minecraftDir,
    world,
    datapacksDir
  });

  return {
    workflow: 'construction_method_v1',
    runtime: 'nodejs',
    prompt,
    outputDir,
    mode,
    seed,
    seedSource,
    llmProvider,
    llmUsage,
    mcVersion,
    architecture,
    topology,
    creativeDesign,
    ...(conceptStudio?.active ? { conceptStudio } : {}),
    stylePreset,
    materialPalette,
    templateKnowledge,
    buildSpec,
    structure,
    facade,
    roof,
    site,
    opening,
    interior,
    repair,
    templateLawAutoRepair: blueprint.templateLawAutoRepair,
    templateLawCoverage: blueprint.templateLawCoverage,
    templateAestheticReview: blueprint.templateAestheticReview,
    templateAssimilationAudit: blueprint.templateAssimilationAudit,
    templateInteriorDensityRepair: blueprint.templateInteriorDensityRepair,
    interiorClearanceRepair: blueprint.interiorClearanceRepair,
    architectureScorecard,
    ...(criticCouncil?.active ? { criticCouncil } : {}),
    geometry: blueprint.geometry,
    blueprint,
    validation,
    artifacts
  };
}

export function deriveBuildSpec(prompt, architecture, seed) {
  const normalizedArchitecture = architecture || {};
  const scale = detectScale(prompt);
  const footprint = normalizeFootprint(normalizedArchitecture.footprint);
  const style = String(normalizedArchitecture.style || '通用');
  const styleFamily = String(normalizedArchitecture.style_family || normalizedArchitecture.styleFamily || 'general');
  const typology = String(normalizedArchitecture.typology || inferTypology(prompt, style));
  const defaults = defaultBuildDimensions({ scale, footprint, style, styleFamily, typology });
  const seedVariation = createSeedVariation(seed, { scale, typology });
  const explicitDimensions = parseDimensions(prompt, defaults.width, defaults.depth, {
    minWidth: defaults.min_width,
    maxWidth: defaults.max_width,
    minDepth: defaults.min_depth,
    maxDepth: defaults.max_depth
  });
  const dimensions = applySeedDimensionVariation(explicitDimensions, defaults, seedVariation, typology);
  const floorHeight = deriveFloorHeight(prompt, normalizedArchitecture, defaults);
  const floors = deriveFloorCount(prompt, normalizedArchitecture, scale, typology);
  const roofHeight = deriveRoofHeight(prompt, normalizedArchitecture, defaults, floors, floorHeight);
  const wallHeight = floors * floorHeight;
  const gardenDepth = deriveGardenDepth(prompt, normalizedArchitecture, defaults, seedVariation);
  const shellThickness = deriveShellThickness(prompt, normalizedArchitecture);
  const doorSide = normalizeSide(String(normalizedArchitecture.facade_rules?.front_side || detectDoorSide(prompt)));
  const doorWidth = deriveDoorWidth(prompt, normalizedArchitecture, scale, typology);
  const doorHeight = deriveDoorHeight(prompt, normalizedArchitecture, floorHeight, scale, typology);
  const facadeRules = normalizedArchitecture.facade_rules || {};
  const roofRules = normalizedArchitecture.roof_rules || {};
  const siteRules = normalizedArchitecture.site_rules || {};

  return {
    scale,
    style,
    style_family: styleFamily,
    typology,
    footprint,
    width: dimensions.width,
    depth: dimensions.depth,
    floors,
    floor_height: floorHeight,
    wall_height: wallHeight,
    roof_height: roofHeight,
    total_height: wallHeight + roofHeight,
    garden_depth: gardenDepth.value,
    shell_thickness: shellThickness,
    door_side: doorSide,
    door_width: doorWidth,
    door_height: doorHeight,
    roof_style: String(roofRules.style || defaults.roof_style),
    roof_overhang: clampNumber(Number(roofRules.overhang ?? defaults.roof_overhang), 0, 4, defaults.roof_overhang),
    lot: {
      width: dimensions.width + defaults.side_setback * 2,
      depth: dimensions.depth + gardenDepth.value + defaults.rear_setback,
      side_setback: defaults.side_setback,
      front_setback: gardenDepth.value,
      rear_setback: defaults.rear_setback
    },
    seed,
    seed_variation: seedVariation,
    structural: {
      system: normalizedArchitecture.structural_rules?.system || 'standard-shell',
      shell_thickness: shellThickness,
      span_strategy: normalizedArchitecture.structural_rules?.span_strategy || 'room-scale-spans',
      supports: normalizedArchitecture.structural_rules?.primary_supports || 'load-bearing-walls'
    },
    facade: {
      symmetry: Boolean(facadeRules.symmetry),
      large_glass: Boolean(facadeRules.large_glass),
      glazing_ratio: String(facadeRules.glazing_ratio || 'medium'),
      porch: Boolean(facadeRules.porch),
      arches: Boolean(facadeRules.arches || facadeRules.pointed_arches),
      screens: Boolean(facadeRules.screen),
      balcony: Boolean(facadeRules.balcony)
    },
    site: {
      formal_garden: Boolean(siteRules.formal_garden),
      water_feature: Boolean(siteRules.water_feature),
      dry_garden: Boolean(siteRules.dry_garden),
      patio: Boolean(siteRules.patio),
      enclosed_courtyard: Boolean(siteRules.enclosed_courtyard),
      landscape_mood: String(siteRules.landscape_mood || 'simple')
    },
    modules: {
      preferred: normalizeStringArray(normalizedArchitecture.generation_hints?.preferred_modules),
      future_engine_features: normalizeStringArray(normalizedArchitecture.generation_hints?.future_engine_features)
    },
    constraints: {
      max_width: defaults.max_width,
      max_depth: defaults.max_depth,
      max_floors: 5,
      max_total_height: 40,
      minecraft_fill_limit: 32768
    },
    source: {
      dimensions: explicitDimensions.source,
      width: explicitDimensions.width_source,
      depth: explicitDimensions.depth_source,
      garden_depth: gardenDepth.source,
      floors: deriveFloorCountSource(prompt, normalizedArchitecture),
      floor_height: hasNumberAfter(prompt, /层高\s*([一二三四五六七八九十两\d]{1,3})/i) ? 'prompt' : 'default',
      roof_height: hasNumberAfter(prompt, /屋顶(?:高|高度)\s*([一二三四五六七八九十两\d]{1,3})/i) ? 'prompt' : 'architecture-or-default',
      semantic_architecture: normalizedArchitecture.source || 'unknown'
    }
  };
}

function parseDimensions(prompt, defaultWidth, defaultDepth, limits = {}) {
  const pair = prompt.match(/(?:尺寸|大小|占地|地基)?\s*([一二三四五六七八九十两\d]{1,3})\s*(?:x|X|×|\*)\s*([一二三四五六七八九十两\d]{1,3})/);
  const widthBefore = prompt.match(/([一二三四五六七八九十两\d]{1,3})\s*(?:格|块|米|m)?\s*宽/);
  const depthBefore = prompt.match(/([一二三四五六七八九十两\d]{1,3})\s*(?:格|块|米|m)?\s*(?:深|长)/);
  const widthAfter = prompt.match(/宽(?:度)?\s*([一二三四五六七八九十两\d]{1,3})/);
  const depthAfter = prompt.match(/(?:深|深度|长|长度)\s*([一二三四五六七八九十两\d]{1,3})/);
  const rawWidth = parseNumberToken(pair?.[1]) ?? parseNumberToken(widthAfter?.[1]) ?? parseNumberToken(widthBefore?.[1]);
  const rawDepth = parseNumberToken(pair?.[2]) ?? parseNumberToken(depthAfter?.[1]) ?? parseNumberToken(depthBefore?.[1]);
  const minWidth = limits.minWidth ?? 11;
  const maxWidth = limits.maxWidth ?? 45;
  const minDepth = limits.minDepth ?? 11;
  const maxDepth = limits.maxDepth ?? 45;
  const widthFromPrompt = rawWidth !== undefined;
  const depthFromPrompt = rawDepth !== undefined;
  return {
    width: clampNumber(rawWidth ?? defaultWidth, minWidth, maxWidth, defaultWidth),
    depth: clampNumber(rawDepth ?? defaultDepth, minDepth, maxDepth, defaultDepth),
    source: widthFromPrompt || depthFromPrompt ? 'prompt' : 'default',
    width_source: widthFromPrompt ? 'prompt' : 'default',
    depth_source: depthFromPrompt ? 'prompt' : 'default'
  };
}

function applySeedDimensionVariation(dimensions, defaults, variation, typology) {
  const compactTypology = ['cabin', 'treehouse', 'lodge'].includes(typology);
  const minWidth = Math.max(defaults.min_width, defaults.width - 4);
  const maxWidth = compactTypology ? defaults.width : Math.min(defaults.max_width, defaults.width + 4);
  const minDepth = Math.max(defaults.min_depth, defaults.depth - 4);
  const maxDepth = compactTypology ? defaults.depth : Math.min(defaults.max_depth, defaults.depth + 4);
  return {
    ...dimensions,
    width: dimensions.width_source === 'default'
      ? clampNumber(dimensions.width + variation.width_delta, minWidth, maxWidth, dimensions.width)
      : dimensions.width,
    depth: dimensions.depth_source === 'default'
      ? clampNumber(dimensions.depth + variation.depth_delta, minDepth, maxDepth, dimensions.depth)
      : dimensions.depth
  };
}

function createSeedVariation(seed, context = {}) {
  const parsed = Number(seed);
  if (!Number.isFinite(parsed)) {
    return {
      source: 'none',
      width_delta: 0,
      depth_delta: 0,
      garden_delta: 0
    };
  }

  const seedInt = Math.abs(Math.trunc(parsed));
  const compactTypology = ['cabin', 'treehouse', 'lodge'].includes(context.typology);
  const dimensionSteps = compactTypology
    ? [-2, 0, 0]
    : context.scale === 'large'
      ? [-4, -2, 0, 2, 4]
      : [-2, 0, 2];
  const gardenSteps = [-1, 0, 1];

  return {
    source: 'seed',
    width_delta: dimensionSteps[seedInt % dimensionSteps.length],
    depth_delta: dimensionSteps[Math.floor(seedInt / dimensionSteps.length) % dimensionSteps.length],
    garden_delta: gardenSteps[Math.floor(seedInt / (dimensionSteps.length * dimensionSteps.length)) % gardenSteps.length]
  };
}

function buildBlueprint({ prompt, architecture, topology, creativeDesign, conceptStudio, stylePreset, materialPalette, templateKnowledge, structure, facade, roof, site, opening, interior, repair, templateLawAutoRepair, templateInteriorDensityRepair, interiorClearanceRepair, buildSpec, shell, layout, paths, decorator, exporter, operations, bounds, llmProvider, llmUsage, seedSource, seed }) {
  return {
    version: 4,
    workflow: 'construction_method_v1',
    runtime: 'nodejs',
    prompt,
    seed,
    seedSource,
    llmProvider,
    llmUsage,
    philosophy: architecture.philosophy,
    buildSpec,
    architecture,
    topology,
    creativeDesign,
    ...(conceptStudio?.active ? { conceptStudio: compactConceptStudio(conceptStudio) } : {}),
    stylePreset,
    materialPalette,
    templateKnowledge,
    structure,
    facade,
    roof,
    site,
    opening,
    interior,
    repair,
    templateLawAutoRepair,
    templateInteriorDensityRepair,
    interiorClearanceRepair,
    geometry: {
      engine: 'pure JavaScript CSG + BSP + A* voxel engine',
      csg: shell.csg,
      structure: shell.csg.structure || summarizeStructure(structure),
      facade: shell.csg.facade || summarizeFacade(facade),
      roof: shell.csg.roof || shell.csg.roofPlan || summarizeRoof(roof),
      site: shell.csg.site || shell.csg.sitePlan || summarizeSite(site),
      bsp: layout.bsp,
      pathfinder: paths.pathfinder,
      exporter,
      gridCellCount: shell.grid.size
    },
    shell: {
      bounds,
      interiorSpaces: shell.interiorSpaces,
      volumeBoxes: shell.volumeBoxes.map((box) => ({
        id: box.id,
        role: box.role,
        shape: box.shape,
        module: box.module,
        bounds: {
          minX: box.min_x,
          maxX: box.max_x,
          minY: box.min_y,
          maxY: box.max_y,
          minZ: box.min_z,
          maxZ: box.max_z
        }
      }))
    },
    layout: {
      rooms: layout.rooms,
      interiorDoors: layout.interiorDoors,
      floorOpenings: layout.floorOpenings
    },
    paths: {
      mainDoor: paths.mainDoor,
      openedEdges: paths.openedEdges,
      stairs: paths.stairs
    },
    decorator,
    modules: moduleCounts(shell.grid),
    bounds,
    operations,
    constraints: [
      'LLM outputs semantic JSON only.',
      'Zhipu API is the default LLM channel; Codex CLI and OpenAI-compatible HTTP APIs are preserved.',
      'CreativeDesignAgent owns design variation; local JavaScript algorithms safely voxelize and validate it.',
      'construction_method_v1 is the only active generation pipeline.',
      'Python is not required.'
    ]
  };
}

function moduleCounts(grid) {
  const counts = {};
  for (const cell of grid.values()) counts[cell.module] = (counts[cell.module] || 0) + 1;
  return counts;
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
  const stage = {
    agent,
    source: decisionSource || source,
    called,
    used
  };
  if (output?.llm_error) stage.error = String(output.llm_error);
  return stage;
}

function compactTemplateLawCoverage(coverage = {}) {
  return {
    active: Boolean(coverage.active),
    percent: coverage.percent || 0,
    grade: coverage.grade || 'not-applicable',
    satisfied_count: coverage.satisfied_count || 0,
    partial_count: coverage.partial_count || 0,
    missing_count: coverage.missing_count || 0,
    gap_ids: (coverage.gaps || []).map((gap) => gap.id)
  };
}

function mergeTemplateInteriorDensityRepairs(beforeClearance = {}, afterClearance = {}) {
  const phases = [
    { phase: 'before-clearance', repair: beforeClearance },
    { phase: 'after-clearance', repair: afterClearance }
  ].filter((item) => item.repair && (item.repair.active || item.repair.reason));
  const active = phases.some((item) => item.repair.active);
  const primary = beforeClearance?.source ? beforeClearance : afterClearance;
  const finalRepair = afterClearance?.source ? afterClearance : beforeClearance;
  const placements = phases.flatMap((item) => item.repair.placements || []);
  const applied = phases.flatMap((item) =>
    (item.repair.applied || []).map((entry) => ({ ...entry, phase: item.phase }))
  );
  return {
    ...primary,
    active,
    reason: active ? 'template-interior-density-repaired' : (finalRepair.reason || primary.reason || 'template-interior-density-already-satisfied'),
    targets: finalRepair.targets || primary.targets,
    before: beforeClearance.before || finalRepair.before,
    after: finalRepair.after || beforeClearance.after,
    applied_count: applied.length,
    grid_patch_count: phases.reduce((sum, item) => sum + Number(item.repair.grid_patch_count || 0), 0),
    placement_count: placements.length,
    applied,
    placements,
    phases: phases.map((item) => ({
      phase: item.phase,
      active: Boolean(item.repair.active),
      reason: item.repair.reason,
      before: item.repair.before,
      after: item.repair.after,
      placement_count: item.repair.placement_count || 0,
      grid_patch_count: item.repair.grid_patch_count || 0
    })),
    engine_hints: {
      ...(primary.engine_hints || {}),
      post_clearance_top_up: Boolean(afterClearance?.active),
      mutates_grid_before_export: phases.some((item) => item.repair.engine_hints?.mutates_grid_before_export),
      mutates_decorator_profile: phases.some((item) => item.repair.engine_hints?.mutates_decorator_profile),
      repairs_template_assimilation_audit_track: 'interior-scene-density'
    }
  };
}

export function formatLlmUsage(usage = {}) {
  const stages = Array.isArray(usage.stages) ? usage.stages : [];
  if (usage.used) {
    const usedStages = stages.filter((stage) => stage.used).map((stage) => stage.agent).join('、') || '部分阶段';
    const fallbackStages = stages.filter((stage) => stage.called && !stage.used).map((stage) => stage.agent);
    return fallbackStages.length
      ? `已调用并采用 ${usedStages}；${fallbackStages.join('、')} 回退到本地规则`
      : `已调用并采用 ${usedStages}`;
  }
  if (usage.called) return '尝试调用，但结果不可用，已回退到本地规则';
  return '未调用，使用本地规则';
}

function summarizeStructure(structure = {}) {
  return {
    system: structure.system || 'standard-shell',
    foundationStrategy: structure.foundation?.strategy || 'unknown',
    supportElementCount: Array.isArray(structure.support_elements) ? structure.support_elements.length : 0,
    bracingElementCount: Array.isArray(structure.bracing_elements) ? structure.bracing_elements.length : 0,
    reinforcementElementCount: Array.isArray(structure.reinforcement_elements) ? structure.reinforcement_elements.length : 0,
    loadPathCount: Array.isArray(structure.load_paths) ? structure.load_paths.length : 0
  };
}

function summarizeFacade(facade = {}) {
  return {
    rhythm: facade.window_system?.rhythm || 'balanced',
    glazingRatio: facade.window_system?.glazing_ratio || 'medium',
    elementCount: Array.isArray(facade.facade_elements) ? facade.facade_elements.length : 0,
    frontSide: facade.front_side || 'south'
  };
}

function summarizeRoof(roof = {}) {
  return {
    style: roof.style || 'gabled',
    profile: roof.profile || 'style-default',
    elementCount: Array.isArray(roof.elements) ? roof.elements.length : 0,
    drainage: roof.drainage || 'unknown'
  };
}

function summarizeSite(site = {}) {
  return {
    mood: site.mood || 'simple',
    zoneCount: Array.isArray(site.zones) ? site.zones.length : 0,
    boundary: site.boundary || 'open-setback',
    terrain: site.terrain_response || 'flat-lot'
  };
}

function validateBlueprint(blueprint) {
  return new BlueprintQAAgent().run(blueprint);
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

async function exportArtifacts({ outputDir, blueprint, conceptStudio, criticCouncil, architectureScorecard, validation, prompt, mcVersion, autoBuild, minecraftDir, world, datapacksDir }) {
  const datapackDir = path.join(outputDir, 'architect_datapack');
  const functionDir = path.join(datapackDir, 'data', 'architect', 'function');
  await ensureDir(functionDir);

  const buildCommands = blueprint.operations.map(operationToCommand);
  const buildPath = path.join(functionDir, 'build.mcfunction');
  const clearPath = path.join(functionDir, 'clear.mcfunction');
  const runPath = path.join(functionDir, 'run.mcfunction');
  const blueprintPath = path.join(outputDir, 'blueprint.json');
  const rawPath = path.join(outputDir, 'raw_build.mcfunction');
  const previewPath = path.join(outputDir, 'preview.html');
  const reportPath = path.join(outputDir, 'run_report.md');
  const architectureScorecardPath = path.join(outputDir, 'architecture_scorecard.json');
  const conceptStudioPath = conceptStudio?.active ? path.join(outputDir, 'concept_studio.json') : undefined;
  const conceptStudioReportPath = conceptStudio?.active ? path.join(outputDir, 'concept_studio_report.md') : undefined;
  const criticCouncilPath = criticCouncil?.active ? path.join(outputDir, 'critic_council.json') : undefined;

  await writeJson(blueprintPath, blueprint);
  await writeJson(architectureScorecardPath, architectureScorecard);
  if (conceptStudioPath) await writeJson(conceptStudioPath, serializeConceptStudio(conceptStudio));
  if (conceptStudioReportPath) await fs.writeFile(conceptStudioReportPath, renderConceptStudioReport(conceptStudio), 'utf8');
  if (criticCouncilPath) await writeJson(criticCouncilPath, serializeCriticCouncil(criticCouncil));
  await writeJson(path.join(datapackDir, 'pack.mcmeta'), {
    pack: {
      pack_format: packFormatFor(mcVersion),
      description: 'AI Minecraft Architect construction_method_v1 nodejs'
    }
  });
  await fs.writeFile(buildPath, `${['# Generated by MC Architect Agent construction_method_v1', '# Run with: /function architect:build', ...buildCommands].join('\n')}\n`, 'utf8');
  await fs.writeFile(clearPath, `${['# Clear the generated build area', '# Run with: /function architect:clear', clearCommandForBounds(blueprint.bounds)].join('\n')}\n`, 'utf8');
  await fs.writeFile(runPath, `${[
    '# One-command build entrypoint',
    '# Run with: /function architect:run',
    '# /reload only refreshes the datapack and does not build.',
    'function architect:clear',
    'function architect:build',
    'tellraw @a [{"text":"AI Architect 建造完成。","color":"green"}]'
  ].join('\n')}\n`, 'utf8');
  await fs.writeFile(rawPath, `${buildCommands.join('\n')}\n`, 'utf8');
  await fs.writeFile(previewPath, new VisualizationAgent().render({ prompt, blueprint, validation }), 'utf8');

  const installedDatapackDir = await installDatapack(datapackDir, minecraftDir, world, datapacksDir);
  await fs.writeFile(reportPath, renderReport({ prompt, blueprint, architectureScorecard, validation, mcVersion, autoBuild, datapackDir, buildPath, clearPath, runPath, rawPath, previewPath, installedDatapackDir }), 'utf8');

  return {
    blueprint: blueprintPath,
    architectureScorecard: architectureScorecardPath,
    datapackDir,
    buildFunction: buildPath,
    clearFunction: clearPath,
    runFunction: runPath,
    rawBuild: rawPath,
    previewHtml: previewPath,
    report: reportPath,
    ...(conceptStudioPath ? { conceptStudio: conceptStudioPath, conceptStudioReport: conceptStudioReportPath } : {}),
    ...(criticCouncilPath ? { criticCouncil: criticCouncilPath } : {}),
    installedDatapackDir
  };
}

function operationToCommand(operation) {
  if (operation.kind === 'fill') {
    return `fill ${rel(operation.from.x)} ${rel(operation.from.y)} ${rel(operation.from.z)} ${rel(operation.to.x)} ${rel(operation.to.y)} ${rel(operation.to.z)} ${operation.block}`;
  }
  return `setblock ${rel(operation.at.x)} ${rel(operation.at.y)} ${rel(operation.at.z)} ${operation.block}`;
}

function clearCommandForBounds(bounds, padding = 2) {
  return `fill ${rel(bounds.minX - padding)} ${rel(Math.max(0, bounds.minY))} ${rel(bounds.minZ - padding)} ${rel(bounds.maxX + padding)} ${rel(bounds.maxY + padding)} ${rel(bounds.maxZ + padding)} minecraft:air`;
}

function rel(value) {
  return value === 0 ? '~' : `~${value}`;
}

async function installDatapack(datapackDir, minecraftDir, world, datapacksDir) {
  if (datapacksDir) {
    const targetDir = path.join(path.resolve(datapacksDir), 'architect_datapack');
    await fs.rm(targetDir, { recursive: true, force: true });
    await ensureDir(path.dirname(targetDir));
    await fs.cp(datapackDir, targetDir, { recursive: true });
    return targetDir;
  }
  if (!world) return undefined;
  const worldDir = await resolveWorldDir({ minecraftDir, world });
  const targetDir = path.join(worldDir, 'datapacks', 'architect_datapack');
  await fs.rm(targetDir, { recursive: true, force: true });
  await ensureDir(path.dirname(targetDir));
  await fs.cp(datapackDir, targetDir, { recursive: true });
  return targetDir;
}

function renderReport({ prompt, blueprint, architectureScorecard, validation, mcVersion, autoBuild, datapackDir, buildPath, clearPath, runPath, rawPath, previewPath, installedDatapackDir }) {
  const architecture = blueprint.architecture;
  const topology = blueprint.topology;
  const geometry = blueprint.geometry;
  const volumes = architecture.volumes.map((item) => `${item.role}(${item.shape}/${item.boolean_mode})`).join('、');
  const rooms = topology.nodes.map((item) => `${item.label}(F${item.floor}/${item.type})`).join('、');
  const warnings = validation.warnings.map((item) => `- ${item}`).join('\n') || '- 无';
  const passedChecks = validation.checks.filter((item) => item.ok).length;
  const totalChecks = validation.checks.length;
  const installLine = installedDatapackDir ? `- 已安装到世界：${installedDatapackDir}\n` : '';
  const materialCatalogCount = blueprint.materialPalette?.block_catalog?.blockCount || 0;
  const materialControllableCount = blueprint.materialPalette?.controllableBlockCount || 0;
  const templateComposition = blueprint.templateKnowledge?.recommendations?.composition_strategy || {};
  const templateCompositionDirectives = templateComposition.directives || {};
  const templateCompositionLine = templateComposition.readiness
    ? `- 模板构图策略：${templateComposition.readiness}，体块 ${templateCompositionDirectives.preferred_massing_variant || 'auto'}，立面 ${templateCompositionDirectives.preferred_facade_rhythm || 'auto'}，屋顶 ${templateCompositionDirectives.preferred_roof_profile || 'auto'}，场地 ${templateCompositionDirectives.preferred_site_mood || 'auto'}`
    : '- 模板构图策略：未启用';
  const sourceFusionPolicy = blueprint.templateKnowledge?.recommendations?.source_fusion_policy || {};
  const sourceFusionLine = sourceFusionPolicy.active
    ? `- 模板融合控制：参考 ${sourceFusionPolicy.retrieved_source_count || 0} 个案例，Top占比 ${Math.round(Number(sourceFusionPolicy.top_source_share || 0) * 100)}%，复制风险 ${sourceFusionPolicy.copy_risk || 'low'}，融合 ${(sourceFusionPolicy.source_blend || []).slice(0, 3).map((item) => item.title).join('、') || 'auto'}`
    : '- 模板融合控制：未启用';
  const templateSpacePlan = topology.template_space_plan || {};
  const templateSpaceLine = templateSpacePlan.active
    ? `- 模板空间规划：${templateSpacePlan.readiness || 'unknown'}，视线侧 ${templateSpacePlan.view_side || 'auto'}，服务侧 ${templateSpacePlan.service_side || 'auto'}，安静侧 ${templateSpacePlan.quiet_side || 'auto'}，序列 ${(templateSpacePlan.entry_sequence?.thresholds || []).join(' > ') || 'auto'}`
    : '- 模板空间规划：未启用';
  const templateRoomExperience = blueprint.interior?.template_room_experience || blueprint.opening?.template_room_experience || {};
  const templateRoomExperienceLine = templateRoomExperience.active
    ? `- 模板房间体验：${templateRoomExperience.readiness || 'unknown'}，主窗侧 ${templateRoomExperience.view_side || 'auto'}，体验房间 ${(templateRoomExperience.room_experiences || []).length}，观景房间 ${(templateRoomExperience.opening_plan?.public_view_rooms || []).join('、') || '无'}`
    : '- 模板房间体验：未启用';
  const templateInteriorScenes = blueprint.interior?.template_interior_scenes || {};
  const templateInteriorScenesLine = templateInteriorScenes.active
    ? `- 模板内饰场景：${templateInteriorScenes.readiness || 'unknown'}，场景房间 ${templateInteriorScenes.room_scene_count || 0}，类型 ${(templateInteriorScenes.scene_types || []).join('、') || 'auto'}`
    : '- 模板内饰场景：未启用';
  const templateSiteScenes = blueprint.site?.template_site_scenes || {};
  const templateSiteScenesLine = templateSiteScenes.active
    ? `- 模板场地场景：${templateSiteScenes.readiness || 'unknown'}，场景 ${templateSiteScenes.scene_count || 0}，类型 ${(templateSiteScenes.scene_types || []).join('、') || 'auto'}`
    : '- 模板场地场景：未启用';
  const templateAestheticReview = blueprint.templateAestheticReview || {};
  const templateAestheticLine = templateAestheticReview.active
    ? `- 模板审美评分：${templateAestheticReview.score}/${templateAestheticReview.max_score}（${templateAestheticReview.grade}），短板 ${(templateAestheticReview.gaps || []).slice(0, 3).map((item) => item.label).join('、') || '无'}`
    : '- 模板审美评分：未启用';
  const templateReflectionLine = templateAestheticReview.active
    ? `- 模板反省闭环：${(templateAestheticReview.next_iteration_directives || []).slice(0, 3).map((item) => item.id).join('、') || '保持当前质量'}`
    : '- 模板反省闭环：未启用';
  const templateLawCoverage = blueprint.templateLawCoverage || {};
  const templateLawAutoRepair = blueprint.templateLawAutoRepair || {};
  const templateInteriorDensityRepair = blueprint.templateInteriorDensityRepair || {};
  const interiorClearanceRepair = blueprint.interiorClearanceRepair || {};
  const templateLawAutoRepairLine = templateLawAutoRepair.active
    ? `- 模板法则自动补强：执行 ${templateLawAutoRepair.applied_count || 0} 项，补方块 ${templateLawAutoRepair.grid_patch_count || 0}，补摆件 ${templateLawAutoRepair.placement_count || 0}，覆盖率 ${templateLawAutoRepair.coverage_before?.percent || 0}% -> ${templateLawAutoRepair.coverage_after?.percent || templateLawCoverage.percent || 0}%`
    : `- 模板法则自动补强：${templateLawAutoRepair.reason || '未触发'}`;
  const templateInteriorDensityLine = templateInteriorDensityRepair.active
    ? `- 模板内饰密度封顶：补强 ${templateInteriorDensityRepair.applied_count || 0} 类，补方块 ${templateInteriorDensityRepair.grid_patch_count || 0}，补摆件 ${templateInteriorDensityRepair.placement_count || 0}，pattern ${templateInteriorDensityRepair.before?.pattern || 0}->${templateInteriorDensityRepair.after?.pattern || 0}，design-law ${templateInteriorDensityRepair.before?.designLaw || 0}->${templateInteriorDensityRepair.after?.designLaw || 0}`
    : `- 模板内饰密度封顶：${templateInteriorDensityRepair.reason || '未触发'}`;
  const interiorClearanceLine = interiorClearanceRepair.active
    ? `- 一层室内净空保护：清理 ${interiorClearanceRepair.removed_count || 0} 个阻塞方块，检查 ${interiorClearanceRepair.checked_room_count || 0} 个房间`
    : `- 一层室内净空保护：${interiorClearanceRepair.reason || '未触发'}`;
  const templateLawCoverageLine = templateLawCoverage.active
    ? `- 模板法则覆盖率：${templateLawCoverage.percent}%（${templateLawCoverage.grade}），检查 ${templateLawCoverage.satisfied_count || 0}/${(templateLawCoverage.checks || []).length}，缺口 ${(templateLawCoverage.gaps || []).slice(0, 3).map((item) => item.id).join('、') || '无'}`
    : '- 模板法则覆盖率：未启用';
  const templateLawRepairLine = templateLawCoverage.active
    ? `- 模板法则补强闭环：${(templateLawCoverage.repair_directives || []).slice(0, 3).map((item) => item.id).join('、') || '保持当前覆盖'}`
    : '- 模板法则补强闭环：未启用';
  const templateAssimilationAudit = blueprint.templateAssimilationAudit || {};
  const templateAssimilationLine = templateAssimilationAudit.active
    ? `- 模板吸收总审计：${templateAssimilationAudit.percent}%（${templateAssimilationAudit.grade}），距顶级闭环 ${templateAssimilationAudit.top_tier_distance ?? 100} 分，阶段 ${templateAssimilationAudit.stage_progress?.completed_count || 0}/${templateAssimilationAudit.stage_progress?.total_count || 0}，短板 ${(templateAssimilationAudit.gaps || []).slice(0, 3).map((item) => item.id).join('、') || '无'}`
    : '- 模板吸收总审计：未启用';
  const scorecard = architectureScorecard?.scorecard || blueprint.architectureScorecard || {};
  const scorecardWeakDimensions = (scorecard.dimensions || [])
    .filter((item) => Number(item.percent) < 80)
    .sort((a, b) => Number(a.percent) - Number(b.percent))
    .slice(0, 3)
    .map((item) => `${item.label} ${item.percent}%`)
    .join('、') || '无明显短板';
  const scorecardRedFlags = (architectureScorecard?.redFlags || [])
    .slice(0, 3)
    .map((item) => `${item.category}:${item.label}`)
    .join('；') || '无';
  const usage = [
    '1. 如果刚复制或更新了数据包，先运行 /reload。这个命令只刷新数据包，不会建造。',
    '2. 站在目标位置运行 /function architect:run。它会自动 clear + build。'
  ].join('\n');
  const conceptStudioSection = renderConceptStudioSection(blueprint);
  const criticCouncilSection = renderCriticCouncilSection(blueprint);

  return `# Minecraft 建筑智能体运行报告

## 输入需求

${prompt}

## PDF 流程对齐

- ArchitectAgent：生成第一步外壳 JSON，只包含 style/materials/volumes 等语义字段。
- StylePresetMemoryAgent：匹配可复用风格预设，给材料/立面/屋顶/场地 agent 提供共同语境。
- MaterialPaletteAgent：加载 Minecraft Java 1.21.1 方块注册表（${materialCatalogCount} 个），生成主材、点缀、栏杆、灯光、景观和完整 catalog 材料池。
- PlannerAgent：生成第二步房间拓扑 JSON，只包含 nodes/edges/circulation/bsp hints。
- CreativeDesignAgent：生成主控设计决策 JSON，决定体块变化、平面排序、立面节奏、屋顶表达、场地和室内色彩；本地几何只负责安全落地与校验。
- StructureAgent：生成结构框架 JSON，只包含 foundation/supports/bracing/load paths 等语义字段。
- FacadeAgent / RoofAgent / SiteLandscapeAgent：生成外立面、屋顶和场地细节 JSON。
- OpeningConnectivityAgent：生成入口、窗洞、内部阈值和竖向开口计划。
- InteriorDetailAgent：生成房间级室内细节计划，房间功能专家和建筑风格专家各掌握 50+ 室内方块，并叠加缤纷软装层，DecoratorAgent 负责写入方块。
- TemplateLawAutoRepairAgent：在导出前执行模板法则覆盖率预检，自动补强缺失的场地、屋顶和内饰法则落块。
- TemplateInteriorDensityRepairAgent：在导出前补足复杂类型的内饰场景、体验、pattern 和 design-law 摆件密度。
- InteriorClearanceRepairAgent：在导出前清理一层房间头部净空里的过量阻塞方块，避免家具或旧细节挤占可通行空间。
- TemplateAssimilationAuditAgent：汇总 7A-7F 的案例、法则、审美、补强和真实落块证据，输出距离顶级模板的剩余差距。
- ConstraintRepairAgent：导出前做约束检查与修复建议。
- GeometryEngine：本地纯 JavaScript CSG + BSP + A* 按设计决策生成合法坐标、门洞和楼梯。
- Export：将网格转成 Minecraft 函数命令。
- 旧 Requirement/Designer/Blueprint/Super agent 流程：已移除。
- Python：未使用。
- LLM 通道：${blueprint.llmProvider}
- LLM 调用：${formatLlmUsage(blueprint.llmUsage)}
- Seed：${blueprint.seed ?? 'none'} (${blueprint.seedSource || 'unknown'})

## 建筑语义 JSON

- 来源：${architecture.source}
- 风格：${architecture.style}
- 预设：${blueprint.stylePreset?.id || 'none'}
- 体块：${volumes}
- 材质：${Object.entries(architecture.materials).map(([key, value]) => `${key}=${value}`).join(', ')}
- 材料调色板：${blueprint.materialPalette?.palette || 'unknown'}，材料角色 ${blueprint.materialPalette?.roles?.length || 0} 个，可控方块 ${materialControllableCount} 个，校验目录 ${materialCatalogCount} 个

## 拓扑 JSON

- 来源：${topology.source}
- 房间节点：${rooms}
- 边数量：${topology.edges.length}

## 创意设计决策

- 来源：${blueprint.creativeDesign?.decision_source || blueprint.creativeDesign?.source || 'unknown'}
- 签名：${blueprint.creativeDesign?.signature || 'none'}
- 设计选择权目标：${Math.round(Number(blueprint.creativeDesign?.authority?.target_llm_decision_share || 0) * 100)}%
- 估算设计选择权：${Math.round(Number(blueprint.creativeDesign?.authority?.estimated_llm_decision_share || 0) * 100)}%
- 体块变体：${blueprint.creativeDesign?.design_axes?.massing_variant || 'unknown'}
- 平面切分：${blueprint.creativeDesign?.topology?.split_strategy || topology.bsp_hints?.split_strategy || 'weighted'}
${templateCompositionLine}
${sourceFusionLine}
${templateSpaceLine}
${templateRoomExperienceLine}
${templateInteriorScenesLine}
${templateSiteScenesLine}
${templateAestheticLine}
${templateReflectionLine}
${templateLawAutoRepairLine}
${templateInteriorDensityLine}
${interiorClearanceLine}
${templateLawCoverageLine}
${templateLawRepairLine}
${templateAssimilationLine}

${conceptStudioSection}${criticCouncilSection}
## 结构框架 JSON

- 来源：${blueprint.structure?.source || 'unknown'}
- 系统：${blueprint.structure?.system || geometry.structure?.system || 'standard-shell'}
- 基础：${blueprint.structure?.foundation?.strategy || geometry.structure?.foundationStrategy || 'unknown'}
- 支撑元素：${blueprint.structure?.support_elements?.length || 0} 个
- 加固/斜撑：${(blueprint.structure?.reinforcement_elements?.length || 0) + (blueprint.structure?.bracing_elements?.length || 0)} 个
- 荷载路径：${blueprint.structure?.load_paths?.map((item) => item.id).join('、') || '未记录'}

## 表皮与场地 JSON

- FacadeAgent：${blueprint.facade?.window_system?.rhythm || 'balanced'}，元素 ${blueprint.facade?.facade_elements?.join('、') || '无'}
- RoofAgent：${blueprint.roof?.style || geometry.roof?.style || 'unknown'} / ${blueprint.roof?.profile || geometry.roof?.profile || 'style-default'}，元素 ${blueprint.roof?.elements?.map((item) => item.kind).join('、') || '无'}
- SiteLandscapeAgent：${blueprint.site?.mood || geometry.site?.mood || 'simple'}，区域 ${blueprint.site?.zones?.join('、') || '无'}
- OpeningConnectivityAgent：主入口 ${blueprint.opening?.main_entry?.side || 'south'}，计划开口 ${blueprint.opening?.engine_hints?.planned_opening_count || 0}
- InteriorDetailAgent：房间细节 ${blueprint.interior?.room_count || 0} 个，灯光 ${blueprint.interior?.lighting_strategy || 'unknown'}，专家 ${blueprint.interior?.room_specialists?.map((item) => `${item.label || item.id}(${item.block_count || 0})`).join('、') || '无'}
- TemplateLawAutoRepairAgent：${templateLawAutoRepair.active ? `执行 ${templateLawAutoRepair.applied_count || 0} 项，补强 ${(templateLawAutoRepair.applied || []).map((item) => item.id).join('、') || '无'}` : (templateLawAutoRepair.reason || '未触发')}
- TemplateInteriorDensityRepairAgent：${templateInteriorDensityRepair.active ? `执行 ${templateInteriorDensityRepair.applied_count || 0} 类，补强 ${(templateInteriorDensityRepair.applied || []).map((item) => item.id).join('、') || '无'}` : (templateInteriorDensityRepair.reason || '未触发')}
- InteriorClearanceRepairAgent：${interiorClearanceRepair.active ? `清理 ${interiorClearanceRepair.removed_count || 0} 个阻塞点` : (interiorClearanceRepair.reason || '未触发')}
- TemplateAssimilationAuditAgent：${templateAssimilationAudit.active ? `${templateAssimilationAudit.percent}% / ${templateAssimilationAudit.readiness}，下一步 ${(templateAssimilationAudit.next_iteration_directives || []).slice(0, 2).map((item) => item.id).join('、') || '保持'}` : (templateAssimilationAudit.reason || '未启用')}
- ConstraintRepairAgent：${blueprint.repair?.ok ? '通过' : '需关注'}，建议 ${blueprint.repair?.suggestions?.join('；') || '无'}

## 几何结果

- 引擎：${geometry.engine}
- CSG：体块 ${geometry.csg.volumeCount} 个，实体格 ${geometry.csg.solidCellCount}，表面格 ${geometry.csg.surfaceCellCount}
- Structure：支撑 ${geometry.structure.supportElementCount}，斜撑 ${geometry.structure.bracingElementCount}，加固 ${geometry.structure.reinforcementElementCount}
- Facade/Roof/Site：立面元素 ${geometry.facade.elementCount}，屋顶元素 ${geometry.roof.elementCount}，场地区域 ${geometry.site.zoneCount}
- BSP：房间 ${geometry.bsp.roomCount} 个，节点 ${geometry.bsp.nodeCount}，边 ${geometry.bsp.edgeCount}
- A*：开洞 ${geometry.pathfinder.openedDoorCount} 处，楼梯块 ${geometry.pathfinder.stairCount} 个
- Exporter：网格 ${geometry.exporter.inputCellCount} 格，朴素命令 ${geometry.exporter.naiveOperationCount} 条，优化后 ${geometry.exporter.operationCount} 条，压缩倍率 ${geometry.exporter.compressionRatio}x
- 模块 Top：${geometry.exporter.topModules.slice(0, 8).map((item) => `${item.name}=${item.count}`).join('、')}

## 校验

- 状态：${validation.ok ? '通过' : '未通过'}
- 命令数：${validation.stats.operationCount}
- 建筑尺寸：${validation.stats.bounds.width} x ${validation.stats.bounds.height} x ${validation.stats.bounds.depth}
- QA：${passedChecks}/${totalChecks} 项通过，入口可达房间 ${validation.stats.circulation.reachableRoomCount}/${validation.stats.rooms.roomCount}，装饰 ${validation.stats.semantic.decoratorPlacements} 个
- 警告：
${warnings}

## 建筑大师评分

- 总分：${scorecard.totalScore || 0}/${scorecard.maxScore || 100}（${scorecard.grade || 'D'}）
- 基础分：${scorecard.baseScore || 0}/${scorecard.baseMaxScore || 60}
- 高级分：${scorecard.advancedScore || 0}/${scorecard.advancedMaxScore || 40}
- 检查项：${architectureScorecard?.passedChecks || 0}/${architectureScorecard?.totalChecks || 0} 通过
- 主要短板：${scorecardWeakDimensions}
- 高优先级红旗：${scorecardRedFlags}
- 评分文件：${path.join(path.dirname(previewPath), 'architecture_scorecard.json')}

${renderTemplateMemorySection(blueprint)}

## 输出文件

- 数据包目录：${datapackDir}
- 建造函数：${buildPath}
- 清理函数：${clearPath}
- 一键建造函数：${runPath}
- 原始 mcfunction：${rawPath}
- 预览 HTML：${previewPath}
${installLine}
## Minecraft Java ${mcVersion} 使用步骤

${usage}

说明：mcfunction 文件内部命令不带斜杠，这是 Minecraft 数据包函数的正常格式。
`;
}

function renderTemplateMemorySection(blueprint = {}) {
  const explanation = blueprint.templateKnowledge?.retrieval_explanation || {};
  const refs = explanation.references || [];
  if (!refs.length) {
    const reason = (explanation.warnings || []).join('; ') || '模板知识库 v2 未启用，当前使用 v1 模板知识。';
    return `## 模板参考记忆\n\n- ${reason}\n`;
  }
  return `## 模板参考记忆\n\n${refs.slice(0, 8).map((item) => {
    const teaches = (item.teaches || []).slice(0, 2).map((unit) => `${unit.area}: ${unit.claim}`).join('；');
    const risks = (item.risk_controls || []).slice(0, 1).join('；');
    return `- ${item.title}: 匹配 ${(item.matched_signals || []).slice(0, 4).join(' / ') || item.diversity_slot}。学习 ${teaches || '通用构图参考'}；控制 ${risks || '不复制原模板细节'}。`;
  }).join('\n')}\n`;
}

function serializeCriticCouncil(criticCouncil = {}) {
  return {
    source: criticCouncil.source,
    version: criticCouncil.version,
    active: Boolean(criticCouncil.active),
    summary: criticCouncil.summary,
    readiness: criticCouncil.readiness,
    overall_score: criticCouncil.overall_score,
    critic_count: criticCouncil.critic_count,
    critical_count: criticCouncil.critical_count,
    warning_count: criticCouncil.warning_count,
    satisfied_count: criticCouncil.satisfied_count,
    critics: criticCouncil.critics || [],
    top_findings: criticCouncil.top_findings || [],
    repair_directives: criticCouncil.repair_directives || [],
    next_iteration_directives: criticCouncil.next_iteration_directives || [],
    warnings: criticCouncil.warnings || []
  };
}

function renderCriticCouncilSection(blueprint = {}) {
  const council = blueprint.criticCouncil;
  if (!council?.active) return '';
  const topFindings = (council.top_findings || [])
    .slice(0, 3)
    .map((item) => `${item.id}(${item.severity})`)
    .join('、') || 'none';
  const repairDirectives = (council.repair_directives || [])
    .slice(0, 3)
    .map((item) => item.id)
    .join('、') || 'preserve-current-quality';
  const criticStatuses = (council.critics || [])
    .map((critic) => `${critic.id}:${critic.status}`)
    .join('、') || 'none';
  return `## Stage 4 Critic Council

- Readiness: ${council.readiness || 'unknown'}
- Overall score: ${council.overall_score || 0}/100
- Critics: ${council.critic_count || 0}
- Critical findings: ${council.critical_count || 0}
- Warnings: ${council.warning_count || 0}
- Critic statuses: ${criticStatuses}
- Top findings: ${topFindings}
- Repair directives: ${repairDirectives}
- Summary: ${council.summary || 'none'}
`;
}

function compactCriticCouncil(criticCouncil = {}) {
  return {
    source: criticCouncil.source,
    version: criticCouncil.version,
    active: Boolean(criticCouncil.active),
    readiness: criticCouncil.readiness,
    overall_score: criticCouncil.overall_score,
    critic_count: criticCouncil.critic_count,
    critical_count: criticCouncil.critical_count,
    warning_count: criticCouncil.warning_count,
    summary: criticCouncil.summary,
    critics: (criticCouncil.critics || []).map((critic) => ({
      id: critic.id,
      label: critic.label,
      status: critic.status,
      score: critic.score,
      finding_count: (critic.findings || []).length,
      satisfied_count: (critic.satisfied || []).length
    })),
    top_findings: (criticCouncil.top_findings || []).slice(0, 8),
    repair_directives: (criticCouncil.repair_directives || []).slice(0, 8),
    next_iteration_directives: (criticCouncil.next_iteration_directives || []).slice(0, 8),
    warnings: criticCouncil.warnings || []
  };
}

function serializeConceptStudio(conceptStudio = {}) {
  return {
    source: conceptStudio.source,
    version: conceptStudio.version,
    active: Boolean(conceptStudio.active),
    prompt: conceptStudio.prompt,
    strategy: conceptStudio.strategy,
    concept_count: conceptStudio.concept_count,
    selected_concept_id: conceptStudio.selected_concept_id,
    fused_concept_id: conceptStudio.fused_concept_id,
    selection: conceptStudio.selection,
    fusion: conceptStudio.fusion ? {
      source: conceptStudio.fusion.source,
      version: conceptStudio.fusion.version,
      active: conceptStudio.fusion.active,
      strategy: conceptStudio.fusion.strategy,
      base_concept_id: conceptStudio.fusion.base_concept_id,
      donor_concept_id: conceptStudio.fusion.donor_concept_id,
      adopted_elements: conceptStudio.fusion.adopted_elements,
      rejected_conflicts: conceptStudio.fusion.rejected_conflicts
    } : undefined,
    concepts: conceptStudio.concepts || [],
    selectedConcept: conceptStudio.selectedConcept,
    warnings: conceptStudio.warnings || []
  };
}

function renderConceptStudioReport(conceptStudio = {}) {
  const ranking = (conceptStudio.selection?.ranking || []).map((item) =>
    `| ${item.rank} | ${item.concept_id} | ${item.archetype} | ${item.selection_score} | ${item.prompt_match_score} | ${item.reference_evidence_score} | ${item.risk_penalty} |`
  ).join('\n') || '| - | - | - | - | - | - | - |';
  const cards = (conceptStudio.concepts || []).map((concept) => {
    const refs = (concept.reference_strategy || []).map((ref) => `  - ${ref.title}: ${(ref.used_for || []).join(', ') || 'general'}; ${(ref.teaches || []).slice(0, 2).join(' / ') || 'reference'}`).join('\n') || '  - none';
    const risks = (concept.risks || []).map((risk) => `  - ${risk.id} (${risk.severity}): ${risk.text} -> ${risk.mitigation}`).join('\n') || '  - none';
    return `## ${concept.title}

- ID: ${concept.id}
- Archetype: ${concept.archetype}
- Summary: ${concept.summary}
- Quality targets: ${(concept.quality_targets || []).join(', ') || 'none'}
- Patch: massing=${concept.creative_design_patch?.massing_variant || 'auto'}, facade=${concept.creative_design_patch?.facade?.window_rhythm || 'auto'}, roof=${concept.creative_design_patch?.roof?.profile || 'auto'}, site=${concept.creative_design_patch?.site?.mood || 'auto'}

### References

${refs}

### Risks

${risks}`;
  }).join('\n\n');
  return `# Stage 3 Concept Studio

- Strategy: ${conceptStudio.strategy || 'select'}
- Concepts: ${conceptStudio.concept_count || 0}
- Selected: ${conceptStudio.selectedConcept?.title || conceptStudio.selected_concept_id || 'none'}
- Selected ID: ${conceptStudio.selected_concept_id || 'none'}
- Reason: ${conceptStudio.selection?.reason || 'none'}
- Warnings: ${(conceptStudio.warnings || []).join('; ') || 'none'}

## Ranking

| Rank | Concept | Archetype | Score | Prompt | References | Risk Penalty |
| ---: | --- | --- | ---: | ---: | ---: | ---: |
${ranking}

${cards}
`;
}

function renderConceptStudioSection(blueprint = {}) {
  const concept = blueprint.conceptStudio;
  if (!concept?.active) return '';
  const alternatives = (concept.selection_summary?.ranking || [])
    .filter((item) => item.concept_id !== concept.selected_concept_id)
    .slice(0, 3)
    .map((item) => `${item.concept_id}(${item.selection_score})`)
    .join('、') || '无';
  return `## Stage 3 Concept Studio

- Strategy: ${concept.strategy || 'select'}
- Concepts: ${concept.concept_count || 0}
- Selected: ${concept.selected_title || concept.selected_concept_id || 'none'}
- Selected ID: ${concept.selected_concept_id || 'none'}
- Reason: ${concept.selection_summary?.reason || 'none'}
- Compared alternatives: ${alternatives}
`;
}

function compactConceptStudio(conceptStudio = {}) {
  return {
    source: conceptStudio.source,
    version: conceptStudio.version,
    active: Boolean(conceptStudio.active),
    strategy: conceptStudio.strategy,
    concept_count: conceptStudio.concept_count,
    selected_concept_id: conceptStudio.selected_concept_id,
    fused_concept_id: conceptStudio.fused_concept_id,
    selected_title: conceptStudio.selectedConcept?.title,
    selected_archetype: conceptStudio.selectedConcept?.archetype,
    selection_summary: conceptStudio.selection ? {
      source: conceptStudio.selection.source,
      strategy: conceptStudio.selection.strategy,
      selected_concept_id: conceptStudio.selection.selected_concept_id,
      selected_selection_score: conceptStudio.selection.selected_selection_score,
      reason: conceptStudio.selection.reason,
      ranking: (conceptStudio.selection.ranking || []).slice(0, 5)
    } : undefined,
    warnings: conceptStudio.warnings || []
  };
}

function compactArchitectureScorecard(evaluation = {}) {
  const scorecard = evaluation.scorecard || {};
  return {
    source: evaluation.source,
    version: evaluation.version,
    totalScore: scorecard.totalScore || 0,
    maxScore: scorecard.maxScore || 100,
    percent: scorecard.percent || evaluation.percent || 0,
    grade: scorecard.grade || evaluation.grade || 'D',
    baseScore: scorecard.baseScore || 0,
    baseMaxScore: scorecard.baseMaxScore || 60,
    advancedScore: scorecard.advancedScore || 0,
    advancedMaxScore: scorecard.advancedMaxScore || 40,
    passedChecks: evaluation.passedChecks || 0,
    totalChecks: evaluation.totalChecks || 0,
    redFlagCount: Array.isArray(evaluation.redFlags) ? evaluation.redFlags.length : 0,
    weakCheckCount: Array.isArray(evaluation.weakChecks) ? evaluation.weakChecks.length : 0,
    weakestDimensions: (scorecard.dimensions || [])
      .slice()
      .sort((a, b) => Number(a.percent) - Number(b.percent))
      .slice(0, 5)
      .map((item) => ({
        id: item.id,
        label: item.label,
        percent: item.percent,
        points: item.points,
        maxPoints: item.maxPoints
      }))
  };
}

function defaultBuildDimensions({ scale, footprint, style, styleFamily, typology }) {
  const base = {
    small: { width: 15, depth: 13, garden_depth: 5 },
    medium: { width: 19, depth: 15, garden_depth: 6 },
    large: { width: 27, depth: 23, garden_depth: 9 }
  }[scale] || { width: 19, depth: 15, garden_depth: 6 };

  const defaults = {
    ...base,
    min_width: 11,
    max_width: 45,
    min_depth: 11,
    max_depth: 45,
    floor_height: ['industrial', 'modern', 'futuristic', 'cyberpunk', 'greenhouse-house'].includes(styleFamily) ? 6 : 5,
    roof_height: style === '欧式' || style === '哥特' ? 6 : ['日式', '热带', '北欧', '雪山', '树屋'].includes(style) ? 4 : 3,
    roof_style: 'gabled',
    roof_overhang: ['japanese', 'tropical', 'chinese-courtyard'].includes(styleFamily) ? 2 : 1,
    side_setback: scale === 'large' ? 4 : 2,
    rear_setback: scale === 'large' ? 4 : 2
  };

  if (footprint === 'winged') {
    defaults.width += scale === 'large' ? 2 : 1;
    defaults.min_width = Math.max(defaults.min_width, 21);
    defaults.min_depth = Math.max(defaults.min_depth, 17);
  } else if (footprint === 'courtyard') {
    defaults.width += scale === 'small' ? 0 : 2;
    defaults.depth += 2;
    defaults.garden_depth += 1;
    defaults.min_width = Math.max(defaults.min_width, 17);
    defaults.min_depth = Math.max(defaults.min_depth, 15);
    defaults.rear_setback += 1;
  } else if (footprint === 'l-shape') {
    defaults.width += 2;
    defaults.min_width = Math.max(defaults.min_width, 17);
  } else if (footprint === 'compact-tower') {
    defaults.width = Math.max(styleFamily === 'treehouse' ? 13 : 15, Math.min(defaults.width, styleFamily === 'treehouse' ? 17 : 21));
    defaults.depth = Math.max(styleFamily === 'treehouse' ? 13 : 15, Math.min(defaults.depth, styleFamily === 'treehouse' ? 17 : 21));
    defaults.roof_height += 2;
  }

  if (typology === 'castle') {
    defaults.width = Math.max(defaults.width, 29);
    defaults.depth = Math.max(defaults.depth, 25);
    defaults.roof_height = Math.max(defaults.roof_height, 7);
    defaults.garden_depth = Math.max(defaults.garden_depth, 8);
  } else if (['cabin', 'treehouse', 'lodge'].includes(typology)) {
    defaults.width = Math.min(defaults.width, 17);
    defaults.depth = Math.min(defaults.depth, 15);
    if (typology === 'treehouse') defaults.garden_depth = Math.max(defaults.garden_depth, 7);
  } else if (typology === 'earth-shelter') {
    defaults.width = Math.max(defaults.width, 21);
    defaults.depth = Math.max(defaults.depth, 17);
    defaults.garden_depth = Math.max(defaults.garden_depth, 7);
  } else if (typology === 'villa') {
    defaults.width = Math.max(defaults.width, 25);
    defaults.depth = Math.max(defaults.depth, 19);
  }

  if (['desert', 'mediterranean', 'subterranean'].includes(styleFamily)) {
    defaults.floor_height = 5;
    defaults.roof_height = 2;
    defaults.roof_style = 'flat';
  } else if (['modern', 'industrial', 'futuristic', 'cyberpunk', 'cliffside', 'greenhouse-house'].includes(styleFamily)) {
    defaults.roof_style = 'flat';
    defaults.roof_height = Math.min(defaults.roof_height, 3);
  } else if (styleFamily === 'coastal') {
    defaults.roof_style = 'hipped';
    defaults.roof_height = Math.max(defaults.roof_height, 3);
    defaults.roof_overhang = Math.max(defaults.roof_overhang, 1);
    defaults.garden_depth = Math.max(defaults.garden_depth, 7);
  } else if (styleFamily === 'alpine') {
    defaults.roof_style = 'gabled';
    defaults.roof_height = Math.max(defaults.roof_height, 5);
    defaults.roof_overhang = Math.max(defaults.roof_overhang, 2);
  } else if (styleFamily === 'treehouse') {
    defaults.roof_style = 'hipped';
    defaults.roof_height = Math.max(defaults.roof_height, 5);
    defaults.side_setback = Math.max(defaults.side_setback, 3);
  } else if (styleFamily === 'japanese') {
    defaults.roof_style = 'hipped';
  } else if (styleFamily === 'chinese-courtyard') {
    defaults.roof_style = 'pagoda';
  }

  return defaults;
}

function deriveFloorCount(prompt, architecture, scale, typology) {
  const explicit = parseFloorCount(prompt);
  if (explicit !== undefined) return explicit;
  const semanticFloors = Number(architecture.envelope_rules?.floors || architecture.massing_rules?.floors);
  if (Number.isFinite(semanticFloors)) return clampNumber(semanticFloors, 1, 5, detectFloors(prompt, scale));
  if (typology === 'castle') return 3;
  if (typology === 'cabin') return 1;
  return detectFloors(prompt, scale);
}

function deriveFloorCountSource(prompt, architecture) {
  if (parseFloorCount(prompt) !== undefined) return 'prompt';
  if (architecture.envelope_rules?.floors || architecture.massing_rules?.floors) return 'architecture';
  return 'default';
}

function deriveFloorHeight(prompt, architecture, defaults) {
  const explicit = extractNumber(prompt, /层高\s*([一二三四五六七八九十两\d]{1,3})/i);
  const semantic = Number(architecture.envelope_rules?.floor_height || architecture.envelope_rules?.floorHeight);
  const value = explicit ?? (Number.isFinite(semantic) ? semantic : defaults.floor_height);
  return clampNumber(value, 4, 8, defaults.floor_height);
}

function deriveRoofHeight(prompt, architecture, defaults, floors, floorHeight) {
  const explicit = extractNumber(prompt, /屋顶(?:高|高度)\s*([一二三四五六七八九十两\d]{1,3})/i);
  const semantic = Number(architecture.roof_rules?.height || architecture.roof_rules?.roof_height);
  const style = String(architecture.roof_rules?.style || defaults.roof_style);
  let value = explicit ?? (Number.isFinite(semantic) ? semantic : defaults.roof_height);
  if (style === 'flat') value = Math.min(value, 3);
  if (architecture.roof_rules?.vertical_accent) value = Math.max(value, 5);
  const maxTotalRoof = Math.max(2, 40 - floors * floorHeight);
  return clampNumber(value, 1, Math.min(9, maxTotalRoof), defaults.roof_height);
}

function deriveGardenDepth(prompt, architecture, defaults, variation = createSeedVariation()) {
  const explicit = extractNumber(prompt, /(?:庭院|院子|花园|前院|后院)(?:深|长度)?\s*([一二三四五六七八九十两\d]{1,3})/i);
  const semantic = Number(architecture.site_rules?.garden_depth || architecture.site_rules?.gardenDepth);
  const source = explicit !== undefined ? 'prompt' : Number.isFinite(semantic) ? 'architecture' : 'default';
  let value = explicit ?? (Number.isFinite(semantic) ? semantic : defaults.garden_depth);
  if (architecture.site_rules?.formal_garden) value = Math.max(value, 8);
  if (architecture.site_rules?.dry_garden) value = Math.max(value, 6);
  if (architecture.site_rules?.water_feature) value = Math.max(value, 7);
  if (source === 'default') value += variation.garden_delta;
  return {
    value: clampNumber(value, 3, 18, defaults.garden_depth),
    source
  };
}

function deriveShellThickness(prompt, architecture) {
  const explicit = extractNumber(prompt, /(?:墙厚|厚墙|墙体厚度)\s*([一二三四五六七八九十两\d]{1,3})/i);
  const semantic = Number(architecture.envelope_rules?.shell_thickness || architecture.envelope_rules?.shellThickness);
  const styleFamily = String(architecture.style_family || architecture.styleFamily || '');
  const thickByText = /厚墙|双层墙|夯土|土坯|城堡|堡垒|地下|地堡|半地下|掩体/.test(prompt) || styleFamily === 'subterranean';
  const value = explicit ?? (Number.isFinite(semantic) ? semantic : thickByText ? 2 : 1);
  return clampNumber(value, 1, 3, 1);
}

function deriveDoorWidth(prompt, architecture, scale, typology) {
  const explicit = extractNumber(prompt, /(?:门宽|大门宽度|入口宽度)\s*([一二三四五六七八九十两\d]{1,3})/i);
  if (explicit !== undefined) return clampNumber(explicit, 1, 4, 2);
  if (/三开门|三格门/.test(prompt)) return 3;
  if (/双开门|大门|拱门|门厅|门廊|城堡|宫殿/.test(prompt) || scale === 'large' || ['castle', 'manor'].includes(typology)) return 2;
  if (architecture.facade_rules?.porch || architecture.facade_rules?.arches) return 2;
  return 1;
}

function deriveDoorHeight(prompt, architecture, floorHeight, scale, typology) {
  const explicit = extractNumber(prompt, /(?:门高|入口高度|大门高度)\s*([一二三四五六七八九十两\d]{1,3})/i);
  if (explicit !== undefined) return clampNumber(explicit, 2, Math.max(2, floorHeight - 1), 3);
  if (/高门|拱门|尖拱|门厅|城堡|宫殿/.test(prompt) || architecture.facade_rules?.arches || typology === 'castle') {
    return clampNumber(4, 2, Math.max(2, floorHeight - 1), 3);
  }
  if (scale === 'large') return clampNumber(3, 2, Math.max(2, floorHeight - 1), 3);
  return 2;
}

function inferTypology(prompt, style) {
  if (/树屋|树上|treehouse|tree house/i.test(prompt) || style === '树屋') return 'treehouse';
  if (/地下|地堡|半地下|掩体|洞穴住宅|地下基地|bunker|underground/i.test(prompt) || style === '地下') return 'earth-shelter';
  if (/温室住宅|玻璃温室|花房住宅|greenhouse house/i.test(prompt) || style === '温室住宅') return 'greenhouse-house';
  if (/悬崖|峭壁|山崖|cliffside|悬挑住宅/i.test(prompt) || style === '悬崖') return 'cliffside-house';
  if (/别墅|villa/i.test(prompt)) return 'villa';
  if (/庄园|manor/i.test(prompt)) return 'manor';
  if (/城堡|堡垒|castle/i.test(prompt)) return 'castle';
  if (/小屋|木屋|cabin|lodge/i.test(prompt) || style === '木屋') return style === '雪山' ? 'lodge' : 'cabin';
  if (/庭院|合院|四合院|courtyard/i.test(prompt)) return 'courtyard-house';
  if (/农舍|farm/i.test(prompt)) return 'farmhouse';
  if (style === '海滨') return 'beach-house';
  if (style === '雪山') return 'lodge';
  return 'house';
}

function normalizeFootprint(value) {
  const text = String(value || 'rectangle').toLowerCase();
  if (['rectangle', 'l-shape', 'winged', 'courtyard', 'compact-tower'].includes(text)) return text;
  return 'rectangle';
}

function parseFloorCount(prompt) {
  const match = prompt.match(/([一二三四五六七八九十两\d]{1,3})\s*(?:层|楼)/);
  const value = parseNumberToken(match?.[1]);
  if (value === undefined) return undefined;
  return clampNumber(value, 1, 5, 2);
}

function extractNumber(prompt, pattern) {
  const match = prompt.match(pattern);
  return parseNumberToken(match?.[1]);
}

function hasNumberAfter(prompt, pattern) {
  return extractNumber(prompt, pattern) !== undefined;
}

function parseNumberToken(value) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return Math.round(numeric);
  return parseChineseNumberToken(text);
}

function parseChineseNumberToken(text) {
  const digits = new Map([
    ['零', 0],
    ['一', 1],
    ['二', 2],
    ['两', 2],
    ['三', 3],
    ['四', 4],
    ['五', 5],
    ['六', 6],
    ['七', 7],
    ['八', 8],
    ['九', 9]
  ]);
  if (digits.has(text)) return digits.get(text);
  if (!text.includes('十')) return undefined;
  const [tensRaw, onesRaw] = text.split('十');
  const tens = tensRaw ? digits.get(tensRaw) : 1;
  const ones = onesRaw ? digits.get(onesRaw) : 0;
  if (!Number.isFinite(tens) || !Number.isFinite(ones)) return undefined;
  return tens * 10 + ones;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value) return [String(value)];
  return [];
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeSide(value) {
  const text = value.toLowerCase();
  if (['north', 'south', 'east', 'west'].includes(text)) return text;
  if (text.includes('北')) return 'north';
  if (text.includes('东')) return 'east';
  if (text.includes('西')) return 'west';
  return 'south';
}

function packFormatFor(version) {
  return String(version).startsWith('1.21') ? 48 : 26;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
