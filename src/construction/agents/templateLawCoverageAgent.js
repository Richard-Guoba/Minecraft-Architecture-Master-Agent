const VERSION = 1;
const SOURCE = 'local-template-law-coverage-agent';

export class TemplateLawCoverageAgent {
  run(blueprint = {}) {
    const context = buildContext(blueprint);
    if (!context.hasLawSignal) {
      return inactiveCoverage('no-template-design-law-runtime');
    }

    const checks = buildChecks(context).filter((check) => check.required);
    const maxScore = round(checks.reduce((sum, check) => sum + check.max_score, 0));
    const score = round(checks.reduce((sum, check) => sum + check.score, 0));
    const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    const gaps = buildGaps(checks);
    const repairDirectives = buildRepairDirectives(gaps);

    return {
      source: SOURCE,
      version: VERSION,
      active: true,
      score,
      max_score: maxScore,
      percent,
      grade: gradeForPercent(percent),
      readiness: readinessForPercent(percent),
      summary: summaryForPercent(percent),
      selected_law_count: context.selectedLawCount,
      interior_law_count: context.interiorLawCount,
      obligation_count: context.obligationCount,
      checks,
      satisfied_count: checks.filter((check) => check.status === 'satisfied').length,
      partial_count: checks.filter((check) => check.status === 'partial').length,
      missing_count: checks.filter((check) => check.status === 'missing').length,
      gaps,
      repair_directives: repairDirectives,
      repair_plan: buildRepairPlan(repairDirectives),
      regeneration_prompt_addendum: repairDirectives.slice(0, 4).map((item) => item.text).join(' '),
      metrics: context.metrics
    };
  }
}

function inactiveCoverage(reason) {
  return {
    source: SOURCE,
    version: VERSION,
    active: false,
    reason,
    score: 0,
    max_score: 100,
    percent: 0,
    grade: 'not-applicable',
    readiness: 'inactive',
    checks: [],
    gaps: [],
    repair_directives: [],
    repair_plan: { active: false, items: [] },
    metrics: {}
  };
}

function buildContext(blueprint = {}) {
  const topologyRuntime = blueprint.topology?.template_design_law_runtime || {};
  const interiorRuntime = blueprint.interior?.template_design_law_runtime || {};
  const runtime = topologyRuntime.active ? topologyRuntime : interiorRuntime;
  const lawPack = blueprint.architecture?.generation_hints?.template_design_law_pack ||
    blueprint.buildSpec?.design?.template_design_law_pack ||
    blueprint.templateKnowledge?.recommendations?.design_law_pack ||
    {};
  const selectedLaws = dedupeLaws([
    ...(runtime.selected_laws || []),
    ...(lawPack.selected_laws || []),
    ...(blueprint.templateKnowledge?.recommendations?.design_laws || [])
  ]);
  const interiorLaws = dedupeLaws([
    ...(runtime.interior_laws || []),
    ...(lawPack.interior_laws || []),
    ...(blueprint.templateKnowledge?.recommendations?.interior_design_laws || [])
  ]);
  const implementationClauses = dedupeStrings([
    ...(runtime.implementation_clauses || []),
    ...(lawPack.implementation_clauses || []),
    ...(blueprint.templateKnowledge?.recommendations?.design_law_clauses || [])
  ]);
  const obligations = dedupeObligations([
    ...(topologyRuntime.room_obligations || []),
    ...(interiorRuntime.room_obligations || [])
  ]);
  const lawText = [
    ...selectedLaws.map(searchTextForLaw),
    ...interiorLaws.map(searchTextForLaw),
    ...implementationClauses
  ].join(' ').toLowerCase();
  const directives = {
    ...(topologyRuntime.topology_directives || {}),
    ...(interiorRuntime.topology_directives || {})
  };
  const modules = blueprint.modules || {};
  const placements = blueprint.decorator?.placements || [];
  const placementRoles = new Set(placements.map((item) => String(item.role || '')));
  const siteSceneTypes = blueprint.site?.template_site_scenes?.scene_types || [];
  const interiorDetails = blueprint.interior?.room_details || [];
  const lawRoomDetails = interiorDetails.filter((detail) => detail.template_design_law?.active);

  const metrics = {
    selected_law_count: selectedLaws.length || Number(lawPack.selected_count || 0),
    interior_law_count: interiorLaws.length || Number(lawPack.interior_selected_count || 0),
    topology_obligation_count: topologyRuntime.room_obligations?.length || 0,
    interior_obligation_count: interiorRuntime.room_obligations?.length || 0,
    room_detail_law_count: lawRoomDetails.length,
    design_law_placement_count: Number(blueprint.decorator?.capability_profile?.template_design_law_placement_count || 0),
    template_pattern_placement_count: Number(blueprint.decorator?.capability_profile?.template_pattern_placement_count || 0),
    template_scene_placement_count: Number(blueprint.decorator?.capability_profile?.template_interior_scene_placement_count || 0),
    template_site_scene_count: Number(blueprint.site?.template_site_scenes?.scene_count || 0),
    template_site_module_cell_count: Object.entries(modules)
      .filter(([name]) => name.startsWith('template_site_'))
      .reduce((sum, [, count]) => sum + Number(count || 0), 0)
  };

  return {
    blueprint,
    runtime,
    lawPack,
    selectedLaws,
    interiorLaws,
    implementationClauses,
    obligations,
    obligationCount: obligations.length,
    selectedLawCount: metrics.selected_law_count,
    interiorLawCount: metrics.interior_law_count,
    lawText,
    directives,
    modules,
    placements,
    placementRoles,
    siteSceneTypes,
    interiorDetails,
    lawRoomDetails,
    hasLawSignal: Boolean(runtime.active || lawPack.active || obligations.length || metrics.design_law_placement_count > 0),
    metrics
  };
}

function buildChecks(ctx) {
  return [
    runtimeCheck(ctx),
    publicViewAxisCheck(ctx),
    waterfrontCheck(ctx),
    foregroundGardenCheck(ctx),
    terrainPlinthCheck(ctx),
    glassViewAxisCheck(ctx),
    roofTerraceCheck(ctx),
    roomIdentityCheck(ctx),
    roomPatternCheck(ctx),
    decoratorExecutionCheck(ctx)
  ];
}

function runtimeCheck(ctx) {
  return check({
    id: 'law-runtime-active',
    label: 'Template law runtime active',
    domain: 'runtime',
    maxScore: 8,
    required: true,
    parts: [
      part(Boolean(ctx.runtime.active), 'runtime-active', 'runtime-inactive'),
      part(ctx.selectedLawCount > 0 || ctx.interiorLawCount > 0, `laws:${ctx.selectedLawCount}/${ctx.interiorLawCount}`, 'no-selected-laws'),
      part(ctx.obligationCount > 0, `obligations:${ctx.obligationCount}`, 'no-room-obligations')
    ],
    repair: {
      id: 'refresh-template-design-laws',
      text: 'Regenerate template analysis and carry design_laws.json into TemplateKnowledgeAgent before generation.',
      targets: ['TemplateKnowledgeAgent', 'PlannerAgent']
    }
  });
}

function publicViewAxisCheck(ctx) {
  const required = Boolean(ctx.directives.public_view_axis || lawMatches(ctx, /site-waterfront-public-threshold|facade-glass-view-axis|view axis|water edge|large glass/i));
  const publicViewRooms = ctx.blueprint.topology?.facade_alignment?.template_design_law_view_rooms ||
    ctx.blueprint.topology?.facade_alignment?.template_public_view_rooms ||
    [];
  return check({
    id: 'public-view-axis',
    label: 'Public rooms anchor the view axis',
    domain: 'space',
    maxScore: 10,
    required,
    parts: [
      part(publicViewRooms.length >= 1, `view-rooms:${publicViewRooms.length}`, 'no-template-view-rooms'),
      part(hasPublicViewExperience(ctx), 'public-view-room-experience', 'no-public-view-experience'),
      part(hasAnyConnection(ctx, ['water_edge', 'view_deck', 'roof_terrace']) || hasRole(ctx, /template-view-seat|template-scene-sofa-primary|design-law-social-anchor/), 'view-threshold-or-facing-furniture', 'no-view-threshold-anchor')
    ],
    repair: {
      id: 'repair-public-view-axis',
      text: 'Align living/dining/lounge with the primary view side and add a visible threshold plus view-facing furniture.',
      targets: ['PlannerAgent', 'OpeningConnectivityAgent', 'DecoratorAgent']
    }
  });
}

function waterfrontCheck(ctx) {
  const required = Boolean(ctx.directives.waterfront_threshold || lawMatches(ctx, /site-waterfront-public-threshold|waterfront|water-edge|lake|reflection basin/i));
  return check({
    id: 'waterfront-threshold',
    label: 'Water edge threshold is built',
    domain: 'site',
    maxScore: 10,
    required,
    parts: [
      part(hasAnyConnection(ctx, ['water_edge', 'water_feature']), 'water-edge-site-connection', 'no-water-edge-site-connection'),
      part(hasSiteScene(ctx, 'water-edge-deck-scene'), 'water-edge-deck-scene', 'no-water-edge-deck-scene'),
      part(countModules(ctx.modules, ['template_site_water_deck', 'template_site_reflection_water', 'template_site_water_edge']) >= 35, 'water-edge-modules', 'water-edge-modules-low')
    ],
    repair: {
      id: 'repair-waterfront-threshold',
      text: 'Add deck or pier modules, reflection water, planting edge, and a public room connection to the water side.',
      targets: ['SiteLandscapeAgent', 'CSGBuilder', 'PlannerAgent']
    }
  });
}

function foregroundGardenCheck(ctx) {
  const required = Boolean(ctx.directives.foreground_garden_sequence || lawMatches(ctx, /site-foreground-garden-rooms|foreground garden|garden rooms|approach scenery/i));
  return check({
    id: 'foreground-garden-sequence',
    label: 'Foreground garden sequence is composed',
    domain: 'site',
    maxScore: 9,
    required,
    parts: [
      part(hasAnyConnection(ctx, ['foreground_garden', 'formal_garden']), 'foreground-garden-connection', 'no-foreground-garden-connection'),
      part(hasSiteScene(ctx, 'forecourt-garden-room-scene'), 'forecourt-garden-room-scene', 'no-forecourt-garden-scene'),
      part(countModules(ctx.modules, ['template_site_garden_room', 'template_site_planting_room', 'template_site_entry_approach', 'template_site_threshold_frame']) >= 35, 'garden-room-modules', 'garden-room-modules-low')
    ],
    repair: {
      id: 'repair-foreground-garden',
      text: 'Compose entry approach as path, planting beds, rocks or low lights instead of scattered plants.',
      targets: ['SiteLandscapeAgent', 'CSGBuilder']
    }
  });
}

function terrainPlinthCheck(ctx) {
  const required = Boolean(ctx.directives.layered_terrain_arrival || lawMatches(ctx, /site-terrain-plinth-sequence|terrain|plinth|non-flat|retaining edge/i));
  return check({
    id: 'terrain-plinth-sequence',
    label: 'Non-flat terrain becomes a plinth sequence',
    domain: 'site',
    maxScore: 9,
    required,
    parts: [
      part(hasAnyConnection(ctx, ['terrain_plinth']) || Boolean(ctx.blueprint.topology?.bsp_hints?.terrain_plinth_sequence), 'terrain-plinth-intent', 'no-terrain-plinth-intent'),
      part(hasSiteScene(ctx, 'terrain-plinth-scene'), 'terrain-plinth-scene', 'no-terrain-plinth-scene'),
      part(countModules(ctx.modules, ['template_site_earth_terrace', 'template_site_stone_plinth', 'template_site_retaining_edge']) >= 60, 'terrain-plinth-modules', 'terrain-plinth-modules-low')
    ],
    repair: {
      id: 'repair-terrain-plinth',
      text: 'Build layered earth and stone terraces, retaining edges, and stepped arrival before the main shell.',
      targets: ['SiteLandscapeAgent', 'CSGBuilder']
    }
  });
}

function glassViewAxisCheck(ctx) {
  const required = Boolean(ctx.directives.large_glass_view_axis || lawMatches(ctx, /facade-glass-view-axis|large glass|glass view|glazing/i));
  const glassRooms = ctx.blueprint.topology?.facade_alignment?.glass_priority_rooms || [];
  return check({
    id: 'glass-view-axis',
    label: 'Large glass is tied to a view axis',
    domain: 'facade',
    maxScore: 9,
    required,
    parts: [
      part(glassRooms.length >= 1, `glass-rooms:${glassRooms.length}`, 'no-glass-priority-rooms'),
      part(Number(ctx.blueprint.opening?.engine_hints?.template_view_opening_count || 0) >= 1 || hasHighViewGlass(ctx), 'view-glass-openings', 'no-view-glass-openings'),
      part(hasRole(ctx, /template-view-seat|template-scene-focal-wall|design-law-public-view-axis|design-law-social-anchor/), 'interior-responds-to-glass', 'interior-not-responding-to-glass')
    ],
    repair: {
      id: 'repair-glass-view-axis',
      text: 'Assign large glass to living, dining, lounge or stair reveal zones and place furniture toward that view.',
      targets: ['FacadeAgent', 'OpeningConnectivityAgent', 'DecoratorAgent']
    }
  });
}

function roofTerraceCheck(ctx) {
  const required = Boolean(ctx.directives.roof_terrace_access_required || lawMatches(ctx, /roof-usable-terrace-system|roof terrace|flat roof terrace|parapet/i));
  const roofElements = ctx.blueprint.roof?.elements || [];
  return check({
    id: 'roof-usable-terrace',
    label: 'Roof terrace is usable, accessible, and edged',
    domain: 'roof',
    maxScore: 9,
    required,
    parts: [
      part(Boolean(ctx.blueprint.topology?.circulation_rules?.roof_terrace_access_required) || hasAnyConnection(ctx, ['roof_terrace']), 'roof-terrace-access-intent', 'no-roof-terrace-access-intent'),
      part(/terrace|parapet/.test(String(ctx.blueprint.roof?.profile || '')) || roofElements.some((item) => /roof-access|roof-garden|parapet|terrace/i.test(`${item.kind || ''} ${item.role || ''}`)), 'roof-terrace-elements', 'roof-terrace-elements-missing'),
      part(countModules(ctx.modules, ['roof_detail', 'roof', 'balcony_railing']) >= 80, 'roof-edge-modules', 'roof-edge-modules-low')
    ],
    repair: {
      id: 'repair-roof-terrace',
      text: 'Add roof access, parapet or rail edge, and at least one planter or seating cluster on flat roofs.',
      targets: ['RoofAgent', 'CSGBuilder', 'DecoratorAgent']
    }
  });
}

function roomIdentityCheck(ctx) {
  const required = Boolean(ctx.obligationCount || lawMatches(ctx, /interior-room-identity-layer-stack|identity stack|focal wall|layered lighting/i));
  const lawClauseRooms = ctx.interiorDetails.filter((detail) =>
    (detail.template_design_law_clause_ids || []).includes('design-law-room-identity-stack') ||
    (detail.semantic_clause_ids || []).includes('design-law-room-identity-stack')
  );
  return check({
    id: 'room-identity-stack',
    label: 'Important rooms receive identity stacks',
    domain: 'interior',
    maxScore: 12,
    required,
    parts: [
      part(Boolean(ctx.blueprint.interior?.engine_hints?.use_template_design_laws), 'interior-engine-uses-design-laws', 'interior-engine-not-using-design-laws'),
      part(ctx.lawRoomDetails.length >= Math.min(4, Math.max(1, ctx.obligationCount)), `law-room-details:${ctx.lawRoomDetails.length}`, 'few-law-room-details'),
      part(lawClauseRooms.length >= Math.min(4, Math.max(1, ctx.obligationCount - 2)), `identity-clause-rooms:${lawClauseRooms.length}`, 'identity-clauses-too-few'),
      part(ctx.metrics.design_law_placement_count >= Math.min(24, Math.max(4, ctx.obligationCount * 2)), `design-law-placements:${ctx.metrics.design_law_placement_count}`, 'design-law-placements-low')
    ],
    repair: {
      id: 'repair-room-identity-stack',
      text: 'For each important room add focal or task wall, functional anchor, storage/display layer, soft detail, and layered light.',
      targets: ['InteriorDetailAgent', 'DecoratorAgent']
    }
  });
}

function roomPatternCheck(ctx) {
  const patternTypes = dedupeStrings(ctx.obligations.flatMap((item) => item.pattern_types || []));
  const required = patternTypes.length > 0 || lawMatches(ctx, /kitchen_work_wall|sleep_niche|social_cluster|library_focus_wall|wet_wall|layered_lighting/i);
  const coveredTypes = patternTypes.filter((pattern) => patternCovered(ctx, pattern));
  return check({
    id: 'room-pattern-execution',
    label: 'Room law patterns become furniture groups',
    domain: 'decorator',
    maxScore: 10,
    required,
    parts: [
      part(Boolean(ctx.blueprint.decorator?.capability_profile?.supports_template_room_patterns), 'template-pattern-layer-active', 'template-pattern-layer-inactive'),
      part(patternTypes.length === 0 || coveredTypes.length >= Math.ceil(patternTypes.length * 0.65), `covered-patterns:${coveredTypes.length}/${patternTypes.length}`, 'pattern-type-coverage-low'),
      part(ctx.metrics.template_pattern_placement_count >= Math.min(50, Math.max(8, patternTypes.length * 5)), `template-pattern-placements:${ctx.metrics.template_pattern_placement_count}`, 'template-pattern-placements-low')
    ],
    repair: {
      id: 'repair-room-pattern-execution',
      text: 'Translate each room law into concrete template-pattern furniture groups with anchors, storage, task lighting, and soft floor frames.',
      targets: ['InteriorDetailAgent', 'DecoratorAgent']
    }
  });
}

function decoratorExecutionCheck(ctx) {
  const required = ctx.obligationCount > 0 || ctx.metrics.design_law_placement_count > 0;
  return check({
    id: 'decorator-design-law-layer',
    label: 'Decorator writes explicit design-law placements',
    domain: 'decorator',
    maxScore: 8,
    required,
    parts: [
      part(Boolean(ctx.blueprint.decorator?.capability_profile?.supports_template_design_laws), 'supports-template-design-laws', 'decorator-design-law-layer-inactive'),
      part(hasRole(ctx, /design-law-focal-wall|design-law-task-light|design-law-social-anchor|design-law-work-wall-light/), 'core-design-law-roles-present', 'core-design-law-roles-missing'),
      part(ctx.metrics.design_law_placement_count >= Math.min(30, Math.max(6, ctx.obligationCount * 2)), `design-law-placement-count:${ctx.metrics.design_law_placement_count}`, 'design-law-placement-count-low')
    ],
    repair: {
      id: 'repair-design-law-decorator-layer',
      text: 'Write visible design-law roles for focal walls, task lights, social anchors, work walls, and garden edges.',
      targets: ['DecoratorAgent']
    }
  });
}

function check({ id, label, domain, maxScore, required, parts = [], repair }) {
  const positive = parts.filter((item) => item.ok).length;
  const ratio = parts.length ? positive / parts.length : 0;
  const score = round(maxScore * ratio);
  const status = ratio >= 0.85 ? 'satisfied' : ratio >= 0.45 ? 'partial' : 'missing';
  return {
    id,
    label,
    domain,
    required: Boolean(required),
    status,
    score,
    max_score: maxScore,
    percent: Math.round(ratio * 100),
    evidence: parts.filter((item) => item.ok).map((item) => item.evidence),
    missing: parts.filter((item) => !item.ok).map((item) => item.missing),
    repair_directive: repair
  };
}

function part(ok, evidence, missing) {
  return { ok: Boolean(ok), evidence, missing };
}

function buildGaps(checks = []) {
  return checks
    .filter((item) => item.status !== 'satisfied')
    .map((item) => ({
      id: item.id,
      label: item.label,
      domain: item.domain,
      severity: item.status === 'missing' ? 'high' : 'medium',
      score: item.score,
      max_score: item.max_score,
      missing: item.missing,
      repair_directive: item.repair_directive
    }))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.score - b.score);
}

function buildRepairDirectives(gaps = []) {
  const directives = [];
  for (const gap of gaps) {
    const directive = gap.repair_directive;
    if (!directive?.id || directives.some((item) => item.id === directive.id)) continue;
    directives.push({
      id: directive.id,
      priority: gap.severity,
      check_id: gap.id,
      domain: gap.domain,
      text: directive.text,
      targets: directive.targets || []
    });
  }
  if (!directives.length) {
    directives.push({
      id: 'preserve-template-law-coverage',
      priority: 'maintain',
      check_id: 'all',
      domain: 'all',
      text: 'Preserve current template law execution and vary details without weakening the verified obligations.',
      targets: ['Workflow']
    });
  }
  return directives;
}

function buildRepairPlan(directives = []) {
  return {
    active: directives.some((item) => item.priority !== 'maintain'),
    item_count: directives.filter((item) => item.priority !== 'maintain').length,
    items: directives
  };
}

function hasPublicViewExperience(ctx) {
  const experiences = ctx.blueprint.interior?.template_room_experience?.room_experiences || [];
  return experiences.some((item) => item.role === 'public-view') ||
    (ctx.blueprint.interior?.template_room_experience?.opening_plan?.public_view_rooms || []).length > 0;
}

function hasHighViewGlass(ctx) {
  return (ctx.blueprint.opening?.window_openings || []).some((item) =>
    item.template_role === 'view-glass' && ['high', 'very-high'].includes(String(item.glazing_ratio || ''))
  );
}

function hasSiteScene(ctx, sceneType) {
  return ctx.siteSceneTypes.includes(sceneType);
}

function hasAnyConnection(ctx, targets = []) {
  const wanted = new Set(targets);
  return (ctx.blueprint.topology?.site_connections || []).some((item) => wanted.has(String(item.to || item.target || '')));
}

function hasRole(ctx, pattern) {
  for (const role of ctx.placementRoles) {
    if (pattern.test(role)) return true;
  }
  return false;
}

function patternCovered(ctx, patternType) {
  const roles = [...ctx.placementRoles].join(' ');
  return {
    kitchen_work_wall: /template-pattern-range|template-pattern-prep|design-law-work-wall-light/.test(roles),
    sleep_niche: /template-pattern-bedside|template-pattern-reading-light|design-law-bedside-soft-light/.test(roles),
    library_focus_wall: /template-pattern-library|template-pattern-desk|design-law-focus-wall-light/.test(roles),
    storage_wall: /template-pattern-storage|design-law-inventory-light/.test(roles),
    wet_wall: /template-pattern-basin|template-pattern-mirror-light|design-law-mirror-light/.test(roles),
    workshop_bench_wall: /template-pattern-workbench|template-pattern-tool-rack|design-law-inventory-light/.test(roles),
    display_wall: /template-pattern-display|design-law-display-anchor/.test(roles),
    social_cluster: /template-pattern-seat|template-pattern-rug|design-law-social-anchor/.test(roles),
    layered_lighting: /template-pattern-layered-light|design-law-accent-light|design-law-task-light/.test(roles),
    plant_corner: /template-pattern-plant|design-law-soft-plant/.test(roles),
    circulation_spine: /template-pattern-wayfinding-light|template-pattern-rail-marker/.test(roles)
  }[patternType] || false;
}

function lawMatches(ctx, pattern) {
  return pattern.test(ctx.lawText);
}

function countModules(modules = {}, names = []) {
  return names.reduce((sum, name) => sum + Number(modules[name] || 0), 0);
}

function searchTextForLaw(law = {}) {
  return [
    law.id,
    law.domain,
    law.rule,
    ...(law.implementation_clauses || []),
    ...(law.prompt_affinities || []),
    ...(law.applies_to || [])
  ].filter(Boolean).join(' ').toLowerCase();
}

function dedupeLaws(laws = []) {
  const byId = new Map();
  for (const law of laws) {
    if (!law?.id || byId.has(law.id)) continue;
    byId.set(law.id, law);
  }
  return [...byId.values()];
}

function dedupeObligations(obligations = []) {
  const byKey = new Map();
  for (const item of obligations) {
    const key = `${item.room_id || item.room_type}:${(item.pattern_types || []).join(',')}`;
    if (byKey.has(key)) continue;
    byKey.set(key, item);
  }
  return [...byKey.values()];
}

function dedupeStrings(values = []) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function severityRank(value) {
  return { high: 3, medium: 2, low: 1, maintain: 0 }[value] || 0;
}

function gradeForPercent(percent) {
  if (percent >= 96) return 'law-perfect';
  if (percent >= 90) return 'law-excellent';
  if (percent >= 80) return 'law-strong';
  if (percent >= 70) return 'law-partial';
  if (percent >= 60) return 'law-basic';
  return 'law-weak';
}

function readinessForPercent(percent) {
  if (percent >= 88) return 'high';
  if (percent >= 75) return 'medium';
  if (percent >= 60) return 'low';
  return 'weak';
}

function summaryForPercent(percent) {
  if (percent >= 90) return 'Template design laws are strongly verified across topology, site, roof, openings, interior, and decorator output.';
  if (percent >= 80) return 'Template design laws are mostly realized; remaining gaps are local and repairable.';
  if (percent >= 70) return 'Template design laws are partly realized, but several obligations need stronger execution.';
  if (percent >= 60) return 'Template law execution is visible but not stable enough for top-tier references.';
  return 'Template law execution is weak; regenerate with stronger law-guided planning and decoration.';
}

function round(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}
