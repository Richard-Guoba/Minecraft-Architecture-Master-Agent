import { projectP7AdvisoryKnowledge } from '../knowledge/p7AdvisoryOverlay.js';
import { deepFreeze } from '../shadow/canonical.js';

const LANGUAGE_VERSION = '0.2.0';
const CLASSIFICATIONS = Object.freeze({
  ALREADY: 'already-executable',
  FEASIBLE: 'feasible-deterministic-mapping',
  PREFERENCE: 'bounded-parameter-or-planner-preference',
  QA: 'qa-check-only',
  ADVISORY: 'advisory-only',
  UNSUPPORTED: 'unsupported'
});

const CAPABILITIES = new Map([
  capability('knowledge:p7:relative-module-transform', CLASSIFICATIONS.ALREADY, 'massing', 'existing:relative-volume-transform'),
  capability('knowledge:p7:exterior-before-interior', CLASSIFICATIONS.ALREADY, 'interior', 'existing:shell-before-interior'),
  capability('knowledge:p7:frame-planned-interior-stairs', CLASSIFICATIONS.ALREADY, 'circulation', 'existing:planner-bsp-astar-stairs'),
  capability('knowledge:p7:facade-depth-hierarchy', CLASSIFICATIONS.ALREADY, 'facade', 'existing:facade-depth-layers'),
  capability('knowledge:p7:modern-flat-roof-option', CLASSIFICATIONS.FEASIBLE, 'roof', 'language:roof:flat-parapet'),
  capability('knowledge:p7:weather-sheltered-entrance-transition', CLASSIFICATIONS.FEASIBLE, 'facade', 'language:facade:sheltered-entry'),
  capability('knowledge:p7:daylit-window-wall-integration', CLASSIFICATIONS.FEASIBLE, 'facade', 'language:facade:daylit-window-wall'),
  capability('knowledge:p7:modern-interlocking-volume', CLASSIFICATIONS.FEASIBLE, 'massing', 'language:massing:three-volume-interlock'),
  capability('knowledge:p7:landscape-route-and-grounding', CLASSIFICATIONS.PREFERENCE, 'site', 'language:site:route-first-grounding'),
  capability('knowledge:p7:function-led-interior-zoning', CLASSIFICATIONS.PREFERENCE, 'interior', 'language:interior:function-first-zoning'),
  capability('knowledge:p7:large-to-small-furnishing-pass', CLASSIFICATIONS.PREFERENCE, 'interior', 'language:interior:large-to-small-pass'),
  capability('knowledge:p7:modern-program-entry-openness', CLASSIFICATIONS.PREFERENCE, 'facade', 'language:facade:private-entry-openness'),
  capability('knowledge:p7:visual-support-check', CLASSIFICATIONS.QA, 'qa', 'check:language:visible-support'),
  capability('knowledge:p7:void-fragmentation-control', CLASSIFICATIONS.QA, 'qa', 'check:language:void-fragmentation'),
  capability('knowledge:p7:compound-roof-seam-cleanup', CLASSIFICATIONS.QA, 'qa', 'check:language:roof-seam'),
  capability('knowledge:p7:even-span-roof-closure', CLASSIFICATIONS.QA, 'qa', 'check:language:roof-closure'),
  capability('knowledge:p7:roof-detail-density-contrast', CLASSIFICATIONS.QA, 'qa', 'check:language:roof-detail-hierarchy'),
  capability('knowledge:p7:bounded-foreground-occlusion', CLASSIFICATIONS.QA, 'qa', 'check:language:foreground-occlusion'),
  capability('knowledge:p7:advisory-not-universal-style-truth', CLASSIFICATIONS.ADVISORY, 'brief', null),
  capability('knowledge:p7:diagonal-envelope-and-roof-frame', CLASSIFICATIONS.UNSUPPORTED, 'massing', null),
  capability('knowledge:p7:diagonal-unit-wall', CLASSIFICATIONS.UNSUPPORTED, 'facade', null),
  capability('knowledge:p7:bounded-diagonal-accent', CLASSIFICATIONS.UNSUPPORTED, 'massing', null),
  capability('knowledge:p7:alternating-conical-roof-rise', CLASSIFICATIONS.UNSUPPORTED, 'roof', null),
  capability('knowledge:p7:slope-sequence-curve', CLASSIFICATIONS.UNSUPPORTED, 'massing', null),
  capability('knowledge:p7:quarter-profile-circle', CLASSIFICATIONS.UNSUPPORTED, 'massing', null),
  capability('knowledge:p7:revolved-pointed-roof-frame', CLASSIFICATIONS.UNSUPPORTED, 'roof', null),
  capability('knowledge:p7:pointed-roof-rise-profile', CLASSIFICATIONS.UNSUPPORTED, 'roof', null)
]);

const SELECTORS = new Map([
  ['knowledge:p7:modern-flat-roof-option', /(?:flat|terrace) roof|roof terrace|平屋顶|屋顶露台/iu],
  ['knowledge:p7:weather-sheltered-entrance-transition', /sheltered entry|porch|canopy|门廊|雨棚|入口过渡/iu],
  ['knowledge:p7:landscape-route-and-grounding', /lake|lakeside|waterfront|garden|path|湖|水边|花园|路径/iu],
  ['knowledge:p7:function-led-interior-zoning', /villa|residen|house|home|interior|别墅|住宅|室内/iu],
  ['knowledge:p7:large-to-small-furnishing-pass', /interior|furnish|家具|室内/iu],
  ['knowledge:p7:daylit-window-wall-integration', /glass|window|daylight|玻璃|窗|采光/iu],
  ['knowledge:p7:modern-interlocking-volume', /(?:modern|现代).*(?:villa|residen|house|building|别墅|住宅|建筑)|interlocking volume|交错体块/iu],
  ['knowledge:p7:modern-program-entry-openness', /(?:modern|现代).*(?:villa|private|别墅|私宅)/iu]
]);

const PARAMETERS = new Map([
  ['knowledge:p7:modern-flat-roof-option', { roof_style: 'flat', roof_profile: 'thin-parapet-terrace' }],
  ['knowledge:p7:weather-sheltered-entrance-transition', { entry_transition: 'supported-canopy' }],
  ['knowledge:p7:landscape-route-and-grounding', { site_strategy: 'route-first-grounding' }],
  ['knowledge:p7:function-led-interior-zoning', { space_planning: 'function-before-furnishing' }],
  ['knowledge:p7:large-to-small-furnishing-pass', { furnishing_sequence: 'large-to-small' }],
  ['knowledge:p7:daylit-window-wall-integration', { facade_opening_strategy: 'daylit-window-wall' }],
  ['knowledge:p7:modern-interlocking-volume', { massing_variant: 'east-offset-glass-wing' }],
  ['knowledge:p7:modern-program-entry-openness', { entry_openness: 'private-offset-screened' }]
]);

export function classifyP7ArchitectureLanguage(overlay) {
  const advisory = validatedAdvisory(overlay);
  return deepFreeze({
    schema_version: 1,
    language_version: LANGUAGE_VERSION,
    school_id: 'heihui-jileniao',
    overlay_sha256: advisory.overlay_sha256,
    concepts: advisory.entries.map((entry) => {
      const configured = CAPABILITIES.get(entry.knowledge_id);
      return {
        knowledge_id: entry.knowledge_id,
        classification: configured?.classification || CLASSIFICATIONS.ADVISORY,
        workflow_stage: configured?.workflow_stage || defaultStage(entry.design_layers),
        operation_id: configured?.operation_id || null
      };
    })
  });
}

export function compileArchitectureLanguageV02({ prompt, overlay } = {}) {
  if (typeof prompt !== 'string' || !prompt.trim()) invalid();
  const catalog = classifyP7ArchitectureLanguage(overlay);
  const pitchedRoofRequired = /pitched roof|gabled roof|坡屋顶|人字顶/iu.test(prompt);
  const selected = catalog.concepts.filter((row) => {
    if (row.knowledge_id === 'knowledge:p7:modern-flat-roof-option' && pitchedRoofRequired) return false;
    return SELECTORS.get(row.knowledge_id)?.test(prompt);
  });
  return deepFreeze({
    schema_version: 1,
    language_version: LANGUAGE_VERSION,
    school_id: catalog.school_id,
    overlay_sha256: catalog.overlay_sha256,
    authority: 'subtitle-derived-advisory-semantic-only',
    selected_knowledge_ids: selected.map((row) => row.knowledge_id),
    instructions: selected.map((row) => ({
      knowledge_id: row.knowledge_id,
      classification: row.classification,
      workflow_stage: row.workflow_stage,
      operation_id: row.operation_id,
      parameters: PARAMETERS.get(row.knowledge_id) || {}
    }))
  });
}

export function applyArchitectureLanguageV02({ plan, architecture, buildSpec } = {}) {
  validatePlan(plan);
  if (!isPlainObject(architecture) || !isPlainObject(buildSpec)) invalid();
  const nextArchitecture = structuredClone(architecture);
  const nextBuildSpec = structuredClone(buildSpec);
  const appliedOperations = [];
  for (const instruction of plan.instructions) {
    const applied = applyInstruction(instruction, nextArchitecture, nextBuildSpec);
    if (!applied) continue;
    appliedOperations.push({
      knowledge_id: instruction.knowledge_id,
      workflow_stage: instruction.workflow_stage,
      operation_id: instruction.operation_id,
      status: 'applied'
    });
  }
  const trace = {
    schema_version: 1,
    language_version: LANGUAGE_VERSION,
    overlay_sha256: plan.overlay_sha256,
    selected_knowledge_ids: [...plan.selected_knowledge_ids],
    applied_operations: appliedOperations
  };
  nextArchitecture.generation_hints = {
    ...(nextArchitecture.generation_hints || {}),
    architecture_language: { plan, trace }
  };
  return deepFreeze({ architecture: nextArchitecture, buildSpec: nextBuildSpec, trace });
}

export function finalizeArchitectureLanguageV02({ plan, architecture, creativeDesign } = {}) {
  validatePlan(plan);
  if (!isPlainObject(architecture) || !isPlainObject(creativeDesign)) invalid();
  const nextArchitecture = structuredClone(architecture);
  const nextCreativeDesign = structuredClone(creativeDesign);
  const needsThreeVolumeInterlock = plan.instructions.some((row) =>
    row.operation_id === 'language:massing:three-volume-interlock');
  if (needsThreeVolumeInterlock) {
    const byId = new Map((nextArchitecture.volumes || []).map((volume) => [volume.id, volume]));
    const requiredIds = ['main', 'glass-wing', 'view-terrace'];
    if (requiredIds.some((id) => !byId.has(id))) invalid();
    nextArchitecture.volumes = requiredIds.map((id) => byId.get(id));
    nextCreativeDesign.volume_directives = (nextCreativeDesign.volume_directives || [])
      .filter((row) => requiredIds.includes(row.id) || requiredIds.includes(row.target_id));
  }
  return deepFreeze({ architecture: nextArchitecture, creativeDesign: nextCreativeDesign });
}

function applyInstruction(instruction, architecture, buildSpec) {
  switch (instruction.operation_id) {
    case 'language:roof:flat-parapet':
      architecture.roof_rules = {
        ...(architecture.roof_rules || {}),
        style: 'flat',
        profile: 'thin-parapet-terrace'
      };
      buildSpec.roof_style = 'flat';
      return true;
    case 'language:facade:sheltered-entry':
      architecture.facade_rules = {
        ...(architecture.facade_rules || {}), awnings: true, porch: true
      };
      return true;
    case 'language:site:route-first-grounding':
      architecture.site_rules = {
        ...(architecture.site_rules || {}), route_strategy: 'route-first-grounding'
      };
      buildSpec.site = { ...(buildSpec.site || {}), route_strategy: 'route-first-grounding' };
      return true;
    case 'language:interior:function-first-zoning':
      setInteriorDirective(architecture, 'space_planning', 'function-before-furnishing');
      return true;
    case 'language:interior:large-to-small-pass':
      setInteriorDirective(architecture, 'furnishing_sequence', 'large-to-small');
      return true;
    case 'language:facade:daylit-window-wall':
      architecture.facade_rules = {
        ...(architecture.facade_rules || {}), large_glass: true, glazing_ratio: 'high'
      };
      return true;
    case 'language:massing:three-volume-interlock':
      setCompositionDirectives(architecture, {
        preferred_massing_variant: 'east-offset-glass-wing',
        lock_preferred_massing_variant: true,
        massing_intent: 'modern-waterfront'
      });
      return true;
    case 'language:facade:private-entry-openness':
      architecture.facade_rules = {
        ...(architecture.facade_rules || {}), entry_detail_variant: 'offset-frame'
      };
      return true;
    case null:
      return false;
    default:
      invalid();
  }
}

function setInteriorDirective(architecture, key, value) {
  architecture.design_directives = {
    ...(architecture.design_directives || {}),
    interior: { ...(architecture.design_directives?.interior || {}), [key]: value }
  };
}

function setCompositionDirectives(architecture, directives) {
  const strategy = architecture.generation_hints?.template_composition_strategy || {};
  const nextStrategy = {
    ...strategy,
    active: true,
    directives: { ...(strategy.directives || {}), ...directives }
  };
  architecture.generation_hints = {
    ...(architecture.generation_hints || {}), template_composition_strategy: nextStrategy
  };
  architecture.roof_rules = {
    ...(architecture.roof_rules || {}), template_composition_strategy: nextStrategy
  };
}

function validatePlan(plan) {
  if (!isPlainObject(plan) || plan.schema_version !== 1
    || plan.language_version !== LANGUAGE_VERSION
    || plan.school_id !== 'heihui-jileniao'
    || plan.authority !== 'subtitle-derived-advisory-semantic-only'
    || !/^[a-f0-9]{64}$/u.test(plan.overlay_sha256)
    || !Array.isArray(plan.selected_knowledge_ids)
    || !Array.isArray(plan.instructions)
    || plan.instructions.length !== plan.selected_knowledge_ids.length) invalid();
  plan.instructions.forEach((row, index) => {
    if (!isPlainObject(row) || row.knowledge_id !== plan.selected_knowledge_ids[index]
      || !CAPABILITIES.has(row.knowledge_id)
      || CAPABILITIES.get(row.knowledge_id).operation_id !== row.operation_id) invalid();
  });
}

function validatedAdvisory(overlay) {
  try {
    return projectP7AdvisoryKnowledge(overlay);
  } catch {
    invalid();
  }
}

function capability(knowledge_id, classification, workflow_stage, operation_id) {
  return [knowledge_id, Object.freeze({ classification, workflow_stage, operation_id })];
}

function defaultStage(layers) {
  if (layers.includes('facade')) return 'facade';
  if (layers.includes('roof')) return 'roof';
  if (layers.includes('structure')) return 'structure';
  if (layers.includes('massing')) return 'massing';
  return 'brief';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function invalid() {
  const error = new Error('ARCHITECTURE_LANGUAGE_INVALID');
  error.code = 'ARCHITECTURE_LANGUAGE_INVALID';
  throw error;
}
