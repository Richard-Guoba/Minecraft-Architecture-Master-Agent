import { createHash } from 'node:crypto';
import { projectP7AdvisoryKnowledge } from '../knowledge/p7AdvisoryOverlay.js';
import { deepFreeze } from '../shadow/canonical.js';

const LANGUAGE_VERSION = '0.2.0';
const CANONICAL_OVERLAY_SHA256 = '98a09b14c5a29fc76b93f61be016b82edb4a9a8c94cdcf76777533f0c1631c35';
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
  capability('knowledge:p7:connected-mass-addition', CLASSIFICATIONS.PREFERENCE, 'massing', 'language:massing:connected-role-volumes'),
  capability('knowledge:p7:scaled-column-beam-grid', CLASSIFICATIONS.FEASIBLE, 'structure', 'language:structure:derived-bay-grid'),
  capability('knowledge:p7:roof-orientation-massing-fit', CLASSIFICATIONS.FEASIBLE, 'roof', 'language:roof:volume-proportion-axis'),
  capability('knowledge:p7:integrated-facade-bay-layering', CLASSIFICATIONS.FEASIBLE, 'facade', 'language:facade:integrated-bays'),
  capability('knowledge:p7:facade-opening-assembly', CLASSIFICATIONS.FEASIBLE, 'facade', 'language:facade:opening-assembly'),
  capability('knowledge:p7:bounded-facade-pattern-vocabulary', CLASSIFICATIONS.PREFERENCE, 'facade', 'language:facade:bounded-pattern-vocabulary'),
  capability('knowledge:p7:building-foundation-material-continuity', CLASSIFICATIONS.FEASIBLE, 'site', 'language:site:foundation-continuity'),
  capability('knowledge:p7:porous-interior-partition', CLASSIFICATIONS.PREFERENCE, 'interior', 'language:interior:porous-public-partitions'),
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
  ['knowledge:p7:connected-mass-addition', (prompt) =>
    matchesUnnegated(prompt, /connected (?:wings?|masses|volumes)|multi-volume|相连(?:侧翼|体块)|多体块/iu,
      '(?:connected (?:wings?|masses|volumes)|multi-volume|相连(?:侧翼|体块)|多体块)')
      && !/single[- ]volume|单体块/iu.test(prompt)],
  ['knowledge:p7:scaled-column-beam-grid', (prompt) =>
    matchesUnnegated(prompt, /column[ -]beam (?:structural )?grid|structural bays?|visible (?:frame|structure)|柱梁网格|结构开间/iu,
      '(?:column[ -]beam (?:structural )?grid|structural bays?|visible (?:frame|structure)|柱梁网格|结构开间)')],
  ['knowledge:p7:roof-orientation-massing-fit', (prompt) =>
    matchesUnnegated(prompt, /roofs? aligned to each mass|roof (?:axis|orientation)|屋顶轴向|屋脊方向/iu,
      '(?:roofs? aligned to each mass|roof (?:axis|orientation)|屋顶轴向|屋脊方向)')],
  ['knowledge:p7:modern-flat-roof-option', (prompt) =>
    matchesUnnegated(prompt, /(?:flat|terrace) roof|roof terrace|平屋顶|屋顶露台/iu,
      '(?:flat roof|terrace roof|roof terrace|平屋顶|屋顶露台)')
      && !isExplicitlyRejected(prompt, '(?:terrace roof|roof terrace|屋顶露台)')],
  ['knowledge:p7:integrated-facade-bay-layering', (prompt) =>
    matchesUnnegated(prompt, /facade bays?|vertical bays?|立面开间|立面分格/iu,
      '(?:facade bays?|vertical bays?|立面开间|立面分格)')],
  ['knowledge:p7:facade-opening-assembly', (prompt) =>
    matchesUnnegated(prompt, /(?:coherent )?(?:window|opening) assemblies|window frames?|门窗组件|窗框组件/iu,
      '(?:(?:coherent )?(?:window|opening) assemblies|window frames?|门窗组件|窗框组件)')],
  ['knowledge:p7:weather-sheltered-entrance-transition', (prompt) =>
    matchesUnnegated(prompt, /sheltered (?:entry|entrance)|porch|canopy|门廊|雨棚|入口过渡/iu,
      '(?:sheltered (?:entry|entrance)|porch|canopy|门廊|雨棚|入口过渡)')],
  ['knowledge:p7:bounded-facade-pattern-vocabulary', (prompt) =>
    matchesUnnegated(prompt, /bounded pattern vocabulary|restrained facade detail|有限(?:立面)?构件词汇|克制的立面细节/iu,
      '(?:bounded pattern vocabulary|restrained facade detail|有限(?:立面)?构件词汇|克制的立面细节)')],
  ['knowledge:p7:landscape-route-and-grounding', (prompt) =>
    matchesUnnegated(prompt, /lake|lakeside|waterfront|garden|path|route|湖|水边|花园|路径|动线/iu,
      '(?:lake|lakeside|waterfront|garden|path|route|湖|水边|花园|路径|动线)')],
  ['knowledge:p7:building-foundation-material-continuity', (prompt) =>
    matchesUnnegated(prompt, /foundation material continuity|continuous (?:base|foundation)|基础材料连续|建筑基础连续/iu,
      '(?:foundation material continuity|continuous (?:base|foundation)|基础材料连续|建筑基础连续)')],
  ['knowledge:p7:function-led-interior-zoning', (prompt) =>
    matchesUnnegated(prompt, /functional interior|function-led|functional (?:room )?zoning|功能.*(?:室内|分区)|功能分区/iu,
      '(?:functional interior|function-led|functional (?:room )?zoning|功能.*(?:室内|分区)|功能分区)')],
  ['knowledge:p7:porous-interior-partition', (prompt) =>
    matchesUnnegated(prompt, /porous (?:public )?partitions?|open-frame partitions?|通透隔断|开放式隔断/iu,
      '(?:porous (?:public )?partitions?|open-frame partitions?|通透隔断|开放式隔断)')],
  ['knowledge:p7:large-to-small-furnishing-pass', (prompt) =>
    matchesUnnegated(prompt, /large-to-small furnish|largest.*furni(?:ture|shing).*first|由大到小.*家具/iu,
      '(?:large-to-small furnish|largest.*furni(?:ture|shing).*first|由大到小.*家具)')],
  ['knowledge:p7:daylit-window-wall-integration', (prompt) =>
    matchesUnnegated(prompt, /large glass|glass window wall|window wall|panoramic windows?|大面积玻璃|玻璃窗墙/iu,
      '(?:large glass|glass|window wall|windows?|玻璃|窗墙)')],
  ['knowledge:p7:modern-interlocking-volume', (prompt) =>
    matchesUnnegated(prompt, /interlocking volumes?|交错体块|咬合体块/iu,
      '(?:interlocking volumes?|交错体块|咬合体块)')
      && requestsCompatibleThreeVolumeInterlock(prompt)],
  ['knowledge:p7:modern-program-entry-openness', (prompt) =>
    matchesUnnegated(prompt,
      /private(?:\s+\w+){0,4}\s+(?:villa|residence|home)|private entry|screened entry|offset entry|私宅|偏移入口/iu,
      '(?:private entry|screened entry|offset entry|私宅|偏移入口)')]
]);

const PARAMETERS = new Map([
  ['knowledge:p7:connected-mass-addition', { massing_relationship: 'connected-role-volumes' }],
  ['knowledge:p7:scaled-column-beam-grid', { structural_bays: 'dimension-derived-visible-grid' }],
  ['knowledge:p7:roof-orientation-massing-fit', { roof_axis_strategy: 'volume-proportion' }],
  ['knowledge:p7:modern-flat-roof-option', { roof_style: 'flat', roof_profile: 'thin-parapet-terrace' }],
  ['knowledge:p7:weather-sheltered-entrance-transition', { entry_transition: 'supported-canopy' }],
  ['knowledge:p7:integrated-facade-bay-layering', { facade_bays: 'integrated-supported' }],
  ['knowledge:p7:facade-opening-assembly', { opening_assembly: 'sill-lintel-frame' }],
  ['knowledge:p7:bounded-facade-pattern-vocabulary', { facade_pattern: 'bounded-restrained' }],
  ['knowledge:p7:landscape-route-and-grounding', { site_strategy: 'route-first-grounding' }],
  ['knowledge:p7:building-foundation-material-continuity', { foundation_transition: 'material-continuous' }],
  ['knowledge:p7:function-led-interior-zoning', { space_planning: 'function-before-furnishing' }],
  ['knowledge:p7:large-to-small-furnishing-pass', { furnishing_sequence: 'large-to-small' }],
  ['knowledge:p7:porous-interior-partition', { partition_strategy: 'porous-public-solid-private' }],
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
  const selected = catalog.concepts.filter((row) => selectorApplies(row.knowledge_id, prompt));
  return deepFreeze({
    schema_version: 1,
    language_version: LANGUAGE_VERSION,
    school_id: catalog.school_id,
    overlay_sha256: catalog.overlay_sha256,
    prompt_sha256: sha256(prompt),
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

export function isValidArchitectureLanguageV02Plan(plan, prompt) {
  try {
    validatePlan(plan, prompt);
    return true;
  } catch {
    return false;
  }
}

export function applyArchitectureLanguageV02({ prompt, plan, architecture, buildSpec } = {}) {
  plan = validatePlan(plan, prompt);
  if (!isPlainObject(architecture) || !isPlainObject(buildSpec)) invalid();
  const nextArchitecture = canonicalClone(architecture, new Set(), true);
  const nextBuildSpec = canonicalClone(buildSpec, new Set(), true);
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

export function finalizeArchitectureLanguageV02({ prompt, plan, architecture, buildSpec, creativeDesign } = {}) {
  plan = validatePlan(plan, prompt);
  if (!isPlainObject(architecture) || !isPlainObject(buildSpec) || !isPlainObject(creativeDesign)) invalid();
  const nextArchitecture = canonicalClone(architecture, new Set(), true);
  const nextBuildSpec = canonicalClone(buildSpec, new Set(), true);
  const nextCreativeDesign = canonicalClone(creativeDesign, new Set(), true);
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
  if (/compact[^.;,]{0,40}single[- ]volume|single[- ]volume[^.;,]{0,40}(?:compact|residential)|紧凑[^。；，]{0,20}单体块/iu.test(prompt)) {
    const main = (nextArchitecture.volumes || []).find((volume) => volume.id === 'main') || nextArchitecture.volumes?.[0];
    if (main) nextArchitecture.volumes = [main];
    nextCreativeDesign.volume_directives = (nextCreativeDesign.volume_directives || [])
      .filter((row) => row.id === main?.id || row.target_id === main?.id);
  }
  for (const instruction of plan.instructions) {
    if (instruction.operation_id !== 'language:massing:three-volume-interlock') {
      applyInstruction(instruction, nextArchitecture, nextBuildSpec);
      applyCreativeInstruction(instruction, nextCreativeDesign);
    }
  }
  return deepFreeze({ architecture: nextArchitecture, buildSpec: nextBuildSpec, creativeDesign: nextCreativeDesign });
}

function applyInstruction(instruction, architecture, buildSpec) {
  switch (instruction.operation_id) {
    case 'language:massing:connected-role-volumes':
      setCompositionDirectives(architecture, { preserve_connected_role_volumes: true });
      return true;
    case 'language:structure:derived-bay-grid':
      architecture.structural_rules = {
        ...(architecture.structural_rules || {}), visible_bay_grid: true
      };
      return true;
    case 'language:roof:volume-proportion-axis':
      architecture.roof_rules = {
        ...(architecture.roof_rules || {}), style: 'gabled', axis_strategy: 'volume-proportion'
      };
      setDesignDirective(architecture, 'roof', { style: 'gabled', axis_strategy: 'volume-proportion' });
      buildSpec.roof_style = 'gabled';
      return true;
    case 'language:roof:flat-parapet':
      architecture.roof_rules = {
        ...(architecture.roof_rules || {}),
        style: 'flat',
        profile: 'thin-parapet-terrace'
      };
      setDesignDirective(architecture, 'roof', { style: 'flat', profile: 'thin-parapet-terrace' });
      buildSpec.roof_style = 'flat';
      return true;
    case 'language:facade:sheltered-entry':
      architecture.facade_rules = {
        ...(architecture.facade_rules || {}), awnings: true, porch: true
      };
      return true;
    case 'language:facade:integrated-bays':
      architecture.facade_rules = {
        ...(architecture.facade_rules || {}), bay_layering: 'integrated-supported', wall_relief: true
      };
      return true;
    case 'language:facade:opening-assembly':
      architecture.facade_rules = {
        ...(architecture.facade_rules || {}), opening_assembly: 'sill-lintel-frame', window_surrounds: true
      };
      return true;
    case 'language:facade:bounded-pattern-vocabulary':
      architecture.facade_rules = {
        ...(architecture.facade_rules || {}), pattern_vocabulary: 'bounded-restrained', relief_density: 'low'
      };
      setDesignDirective(architecture, 'facade', { relief_density: 'low' });
      return true;
    case 'language:site:route-first-grounding':
      architecture.site_rules = {
        ...(architecture.site_rules || {}), route_strategy: 'route-first-grounding'
      };
      buildSpec.site = { ...(buildSpec.site || {}), route_strategy: 'route-first-grounding' };
      return true;
    case 'language:site:foundation-continuity':
      architecture.site_rules = {
        ...(architecture.site_rules || {}), foundation_transition: 'material-continuous'
      };
      buildSpec.site = { ...(buildSpec.site || {}), foundation_transition: 'material-continuous' };
      return true;
    case 'language:interior:function-first-zoning':
      setInteriorDirective(architecture, 'space_planning', 'function-before-furnishing');
      return true;
    case 'language:interior:large-to-small-pass':
      setInteriorDirective(architecture, 'furnishing_sequence', 'large-to-small');
      return true;
    case 'language:interior:porous-public-partitions':
      setInteriorDirective(architecture, 'partition_strategy', 'porous-public-solid-private');
      return true;
    case 'language:facade:daylit-window-wall':
      architecture.facade_rules = {
        ...(architecture.facade_rules || {}), large_glass: true, glazing_ratio: 'high'
      };
      setDesignDirective(architecture, 'facade', { glazing_ratio: 'high' });
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
      setDesignDirective(architecture, 'facade', { entry_detail_style: 'offset-frame' });
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

function setDesignDirective(architecture, layer, values) {
  architecture.design_directives = {
    ...(architecture.design_directives || {}),
    [layer]: { ...(architecture.design_directives?.[layer] || {}), ...values }
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

function applyCreativeInstruction(instruction, creativeDesign) {
  switch (instruction.operation_id) {
    case 'language:roof:flat-parapet':
      creativeDesign.roof = {
        ...(creativeDesign.roof || {}), style: 'flat', profile: 'thin-parapet-terrace'
      };
      break;
    case 'language:facade:sheltered-entry':
      creativeDesign.facade = { ...(creativeDesign.facade || {}), awnings: true, porch: true };
      break;
    case 'language:facade:daylit-window-wall':
      creativeDesign.facade = { ...(creativeDesign.facade || {}), glazing_ratio: 'high' };
      break;
    case 'language:facade:private-entry-openness':
      creativeDesign.facade = {
        ...(creativeDesign.facade || {}), entry_detail_style: 'offset-frame'
      };
      break;
    default:
      break;
  }
}

function validatePlan(input, prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) invalid();
  const plan = canonicalClone(input);
  if (!isPlainObject(plan) || plan.schema_version !== 1
    || plan.language_version !== LANGUAGE_VERSION
    || plan.school_id !== 'heihui-jileniao'
    || plan.authority !== 'subtitle-derived-advisory-semantic-only'
    || plan.overlay_sha256 !== CANONICAL_OVERLAY_SHA256
    || plan.prompt_sha256 !== sha256(prompt)
    || !Array.isArray(plan.selected_knowledge_ids)
    || !Array.isArray(plan.instructions)
    || plan.instructions.length !== plan.selected_knowledge_ids.length
    || !hasExactKeys(plan, [
      'schema_version', 'language_version', 'school_id', 'overlay_sha256', 'authority',
      'prompt_sha256', 'selected_knowledge_ids', 'instructions'
    ])) invalid();
  const expectedIds = [...SELECTORS.keys()].filter((id) => selectorApplies(id, prompt));
  if (expectedIds.length !== plan.selected_knowledge_ids.length ||
    expectedIds.some((id) => !plan.selected_knowledge_ids.includes(id))) invalid();
  const selectorOrder = [...SELECTORS.keys()];
  let previousIndex = -1;
  plan.instructions.forEach((row, index) => {
    const configured = CAPABILITIES.get(row?.knowledge_id);
    const selectorIndex = selectorOrder.indexOf(row?.knowledge_id);
    if (!isPlainObject(row) || row.knowledge_id !== plan.selected_knowledge_ids[index]
      || !hasExactKeys(row, [
        'knowledge_id', 'classification', 'workflow_stage', 'operation_id', 'parameters'
      ])
      || !configured || selectorIndex <= previousIndex
      || configured.operation_id !== row.operation_id
      || configured.classification !== row.classification
      || configured.workflow_stage !== row.workflow_stage
      || !sameFlatObject(row.parameters, PARAMETERS.get(row.knowledge_id))) invalid();
    previousIndex = selectorIndex;
  });
  return plan;
}

function selectorApplies(knowledgeId, prompt) {
  if (knowledgeId === 'knowledge:p7:modern-flat-roof-option' &&
    matchesUnnegated(prompt, /pitched roof|gabled roof|坡屋顶|人字顶/iu,
      '(?:pitched roof|gabled roof|坡屋顶|人字顶)')) return false;
  return Boolean(SELECTORS.get(knowledgeId)?.(prompt));
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

function hasExactKeys(value, expected) {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function matchesUnnegated(prompt, positive, subjectPattern) {
  return prompt.split(/[.;,\n]/u).some((clause) => {
    if (!positive.test(clause)) return false;
    const before = new RegExp(`\\b(?:no|not|without|avoid|forbid|do not use)\\b[^.;,]{0,32}${subjectPattern}`, 'iu');
    const after = new RegExp(`${subjectPattern}[^.;,]{0,20}\\b(?:forbidden|not allowed)\\b`, 'iu');
    return !before.test(clause) && !after.test(clause) && !/不要.*?(?:平屋顶|屋顶露台|门廊|雨棚|玻璃|窗墙)/iu.test(clause);
  });
}

function isExplicitlyRejected(prompt, subjectPattern) {
  const before = new RegExp(`\\b(?:no|not|without|avoid|forbid|do not use)\\b[^.;,]{0,32}${subjectPattern}`, 'iu');
  const after = new RegExp(`${subjectPattern}[^.;,]{0,20}\\b(?:forbidden|not allowed)\\b`, 'iu');
  return before.test(prompt) || after.test(prompt);
}

function requestsCompatibleThreeVolumeInterlock(prompt) {
  if (/single[- ]volume|garage wing|guest wing|tower|pavilion|annex|outbuilding|单体块|车库侧翼|塔楼|亭|附楼|traditional.*not (?:a )?modern/iu.test(prompt)) return false;
  const cardinal = '(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|dozen|and)';
  const englishCount = prompt.match(new RegExp(`\\b((?:\\d+|${cardinal}(?:[ -]${cardinal})*))\\s+interlocking volumes?`, 'iu'))?.[1];
  if (englishCount && !/^(?:3|three)$/iu.test(englishCount)) return false;
  const chineseCount = prompt.match(/([零〇一二两三四五六七八九十百千万亿\d]+)个?\s*(?:交错体块|咬合体块)/u)?.[1];
  if (chineseCount && !/^(?:3|三)$/u.test(chineseCount)) return false;
  return !/interlocking volumes?\s+(?:with|plus|including)\b/iu.test(prompt);
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sameFlatObject(left, right) {
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const expectedKeys = Object.keys(right);
  if (!hasExactKeys(left, expectedKeys)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(left);
  return expectedKeys.every((key) => !descriptors[key].get && !descriptors[key].set
    && descriptors[key].enumerable && descriptors[key].value === right[key]);
}

function canonicalClone(value, ancestors = new Set(), allowUndefined = false) {
  if (value === undefined && allowUndefined) return value;
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || ancestors.has(value)) invalid();
  if (!Array.isArray(value) && !isPlainObject(value)) invalid();
  if (Array.isArray(value)) {
    const keys = Reflect.ownKeys(value);
    const expected = [...value.keys()].map(String);
    if (keys.length !== expected.length + 1 || !keys.includes('length')
      || expected.some((key) => !keys.includes(key))) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (expected.some((key) => descriptors[key].get || descriptors[key].set
      || !descriptors[key].enumerable)) invalid();
    ancestors.add(value);
    const copy = value.map((item) => canonicalClone(item, ancestors, allowUndefined));
    ancestors.delete(value);
    return copy;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key === 'symbol'
    || descriptors[key].get || descriptors[key].set || !descriptors[key].enumerable)) invalid();
  ancestors.add(value);
  const copy = Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, canonicalClone(item, ancestors, allowUndefined)]));
  ancestors.delete(value);
  return copy;
}

function invalid() {
  const error = new Error('ARCHITECTURE_LANGUAGE_INVALID');
  error.code = 'ARCHITECTURE_LANGUAGE_INVALID';
  throw error;
}
