const SOURCE = 'local-template-assimilation-audit-agent';
const VERSION = 1;

const TRACKS = [
  track('corpus-abstraction', 'Corpus abstraction', 14, scoreCorpusAbstraction),
  track('law-runtime', 'Design law runtime', 16, scoreLawRuntime),
  track('spatial-composition', 'Spatial composition', 16, scoreSpatialComposition),
  track('site-terrain-scenes', 'Site and terrain scenes', 16, scoreSiteTerrainScenes),
  track('interior-scene-density', 'Interior scene density', 16, scoreInteriorSceneDensity),
  track('verification-closure', 'Verification closure', 22, scoreVerificationClosure)
];

export class TemplateAssimilationAuditAgent {
  run(blueprint = {}) {
    const hasTemplateSignal = Boolean(
      blueprint.templateKnowledge?.active ||
      blueprint.templateAestheticReview?.active ||
      blueprint.templateLawCoverage?.active ||
      blueprint.topology?.template_design_law_runtime?.active ||
      blueprint.topology?.template_space_plan?.active ||
      blueprint.site?.template_site_scenes?.active ||
      blueprint.interior?.template_interior_scenes?.active
    );

    if (!hasTemplateSignal) {
      return inactiveAudit('no-template-assimilation-signal');
    }

    const context = buildContext(blueprint);
    const tracks = TRACKS.map((item) => scoreTrack(item, context));
    const score = round(tracks.reduce((sum, item) => sum + item.score, 0));
    const percent = Math.round(score);
    const stageProgress = buildStageProgress(context);
    const gaps = buildGaps(tracks, stageProgress);
    const strengths = buildStrengths(tracks);
    const nextIterationDirectives = buildNextIterationDirectives(gaps, context);

    return {
      source: SOURCE,
      version: VERSION,
      active: true,
      score,
      max_score: 100,
      percent,
      grade: gradeForPercent(percent),
      readiness: readinessForPercent(percent),
      top_tier_distance: round(Math.max(0, 100 - score)),
      summary: summaryForPercent(percent, stageProgress),
      stage_progress: stageProgress,
      tracks,
      strengths,
      gaps,
      next_iteration_directives: nextIterationDirectives,
      regeneration_prompt_addendum: nextIterationDirectives
        .filter((item) => item.priority !== 'maintain')
        .slice(0, 4)
        .map((item) => item.text)
        .join(' '),
      metrics: context.metrics
    };
  }
}

function inactiveAudit(reason) {
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
    top_tier_distance: 100,
    stage_progress: { completed_count: 0, total_count: 6, percent: 0, items: [] },
    tracks: [],
    strengths: [],
    gaps: [],
    next_iteration_directives: [],
    regeneration_prompt_addendum: '',
    metrics: {}
  };
}

function track(id, label, maxScore, scorer) {
  return { id, label, max_score: maxScore, scorer };
}

function scoreTrack(config, context) {
  const result = config.scorer(context);
  const rawScore = clamp(Number(result.score || 0), 0, config.max_score);
  return {
    id: config.id,
    label: config.label,
    score: round(rawScore),
    max_score: config.max_score,
    percent: Math.round((rawScore / config.max_score) * 100),
    status: statusForRatio(rawScore / config.max_score),
    evidence: result.evidence || [],
    missing: result.missing || []
  };
}

function buildContext(blueprint = {}) {
  const recommendations = blueprint.templateKnowledge?.recommendations || {};
  const composition = recommendations.composition_strategy || {};
  const lawCoverage = blueprint.templateLawCoverage || {};
  const aesthetic = blueprint.templateAestheticReview || {};
  const autoRepair = blueprint.templateLawAutoRepair || {};
  const decoratorProfile = blueprint.decorator?.capability_profile || {};
  const topologyRuntime = blueprint.topology?.template_design_law_runtime || {};
  const interiorRuntime = blueprint.interior?.template_design_law_runtime || {};
  const modules = blueprint.modules || {};
  const templateSiteModuleNames = Object.keys(modules).filter((name) => name.startsWith('template_site_'));
  const roomDetails = blueprint.interior?.room_details || [];
  const lawRoomDetails = roomDetails.filter((item) => item.template_design_law?.active);
  const obligations = [
    ...(topologyRuntime.room_obligations || []),
    ...(interiorRuntime.room_obligations || [])
  ];
  const metrics = {
    retrieved_template_count: blueprint.templateKnowledge?.retrieved?.length || Number(blueprint.templateKnowledge?.retrieved_count || 0),
    selected_law_count: selectedLawCount(topologyRuntime, recommendations),
    interior_law_count: interiorLawCount(topologyRuntime, interiorRuntime, recommendations),
    obligation_count: obligations.length,
    law_room_detail_count: lawRoomDetails.length,
    template_site_module_role_count: templateSiteModuleNames.length,
    template_site_module_cell_count: templateSiteModuleNames.reduce((sum, name) => sum + Number(modules[name] || 0), 0),
    terrain_module_cell_count: countModules(modules, ['template_site_earth_terrace', 'template_site_stone_plinth', 'template_site_retaining_edge']),
    water_module_cell_count: countModules(modules, ['template_site_reflection_water', 'template_site_water_deck', 'template_site_water_edge']),
    garden_module_cell_count: countModules(modules, ['template_site_garden_room', 'template_site_planting_room', 'template_site_entry_approach', 'template_site_threshold_frame']),
    roof_detail_cell_count: Number(modules.roof_detail || 0),
    template_pattern_placement_count: Number(decoratorProfile.template_pattern_placement_count || 0),
    template_design_law_placement_count: Number(decoratorProfile.template_design_law_placement_count || 0),
    template_experience_placement_count: Number(decoratorProfile.template_experience_placement_count || 0),
    template_interior_scene_placement_count: Number(decoratorProfile.template_interior_scene_placement_count || 0),
    template_site_scene_count: Number(blueprint.site?.template_site_scenes?.scene_count || 0),
    template_interior_scene_count: Number(blueprint.interior?.template_interior_scenes?.room_scene_count || 0),
    template_law_coverage_percent: lawCoverage.active ? Number(lawCoverage.percent || 0) : 0,
    template_aesthetic_percent: aesthetic.active ? Number(aesthetic.percent ?? aesthetic.score ?? 0) : 0,
    auto_repair_grid_patch_count: Number(autoRepair.grid_patch_count || 0),
    auto_repair_placement_count: Number(autoRepair.placement_count || 0),
    validation_ok: blueprint.repair?.ok === true
  };

  return {
    blueprint,
    recommendations,
    composition,
    lawCoverage,
    aesthetic,
    autoRepair,
    decoratorProfile,
    topologyRuntime,
    interiorRuntime,
    obligations,
    modules,
    metrics
  };
}

function scoreCorpusAbstraction(ctx) {
  const evidence = [];
  const missing = [];
  let score = 0;
  if (ctx.blueprint.templateKnowledge?.active) {
    score += 2.5;
    evidence.push('template-knowledge-active');
  } else {
    missing.push('template-knowledge-inactive');
  }
  if (ctx.metrics.retrieved_template_count >= 3) {
    score += 2.5;
    evidence.push(`retrieved:${ctx.metrics.retrieved_template_count}`);
  } else if (ctx.metrics.retrieved_template_count > 0) {
    score += 1.5;
    evidence.push(`retrieved:${ctx.metrics.retrieved_template_count}`);
  } else {
    missing.push('no-retrieved-template-cases');
  }
  if (ctx.composition.readiness === 'high') {
    score += 2.5;
    evidence.push('composition-strategy-high');
  } else if (ctx.composition.readiness) {
    score += 1.5;
    evidence.push(`composition-strategy:${ctx.composition.readiness}`);
  } else {
    missing.push('composition-strategy-missing');
  }
  if (ctx.recommendations.design_law_pack?.active || ctx.metrics.selected_law_count > 0) {
    score += 2.5;
    evidence.push(`design-laws:${ctx.metrics.selected_law_count}`);
  } else {
    missing.push('design-law-pack-missing');
  }
  if ((ctx.recommendations.room_pattern_guidance || []).length || ctx.recommendations.template_interior_pattern_strength) {
    score += 2;
    evidence.push('room-pattern-guidance-present');
  } else {
    missing.push('room-pattern-guidance-missing');
  }
  if ((ctx.recommendations.landscape_features || []).length >= 3 || ctx.metrics.template_site_scene_count >= 3) {
    score += 2;
    evidence.push('landscape-case-features-present');
  } else {
    missing.push('landscape-case-features-thin');
  }
  return { score, evidence, missing };
}

function scoreLawRuntime(ctx) {
  const evidence = [];
  const missing = [];
  let score = 0;
  if (ctx.topologyRuntime.active || ctx.interiorRuntime.active) {
    score += 3;
    evidence.push('law-runtime-active');
  } else {
    missing.push('law-runtime-inactive');
  }
  if (ctx.metrics.selected_law_count >= 6) {
    score += 3;
    evidence.push(`selected-laws:${ctx.metrics.selected_law_count}`);
  } else if (ctx.metrics.selected_law_count > 0) {
    score += 1.5;
    evidence.push(`selected-laws:${ctx.metrics.selected_law_count}`);
  } else {
    missing.push('selected-laws-empty');
  }
  if (ctx.metrics.obligation_count >= 4) {
    score += 3;
    evidence.push(`room-obligations:${ctx.metrics.obligation_count}`);
  } else if (ctx.metrics.obligation_count > 0) {
    score += 1.5;
    evidence.push(`room-obligations:${ctx.metrics.obligation_count}`);
  } else {
    missing.push('room-obligations-empty');
  }
  const directives = ctx.topologyRuntime.topology_directives || {};
  const directiveCount = Object.values(directives).filter(Boolean).length;
  if (directiveCount >= 5) {
    score += 2.5;
    evidence.push(`topology-directives:${directiveCount}`);
  } else {
    missing.push('topology-directives-thin');
  }
  if (ctx.metrics.law_room_detail_count >= Math.min(4, Math.max(1, ctx.metrics.obligation_count))) {
    score += 2.5;
    evidence.push(`law-room-details:${ctx.metrics.law_room_detail_count}`);
  } else {
    missing.push('law-room-details-low');
  }
  if (ctx.blueprint.interior?.engine_hints?.use_template_design_laws) {
    score += 2;
    evidence.push('interior-engine-uses-design-laws');
  } else {
    missing.push('interior-engine-not-using-laws');
  }
  return { score, evidence, missing };
}

function scoreSpatialComposition(ctx) {
  const blueprint = ctx.blueprint;
  const plan = blueprint.topology?.template_space_plan || {};
  const experience = blueprint.interior?.template_room_experience || blueprint.opening?.template_room_experience || {};
  const evidence = [];
  const missing = [];
  let score = 0;
  if (ctx.composition.readiness === 'high') {
    score += 2.5;
    evidence.push('whole-composition-high');
  } else if (ctx.composition.readiness) {
    score += 1.2;
    evidence.push(`whole-composition:${ctx.composition.readiness}`);
  } else {
    missing.push('whole-composition-missing');
  }
  if (plan.active) {
    score += 2.5;
    evidence.push('template-space-plan-active');
  } else {
    missing.push('template-space-plan-inactive');
  }
  if ((plan.entry_sequence?.thresholds || []).length >= 5) {
    score += 2;
    evidence.push(`entry-thresholds:${plan.entry_sequence.thresholds.length}`);
  } else {
    missing.push('entry-threshold-sequence-shallow');
  }
  if ((blueprint.topology?.site_connections || []).filter((item) => /^template-|template-design-law/.test(String(item.relation || ''))).length >= 3) {
    score += 2.5;
    evidence.push('template-site-connections-present');
  } else {
    missing.push('template-site-connections-low');
  }
  if (experience.active && (experience.opening_plan?.public_view_rooms || []).length >= 1) {
    score += 2.5;
    evidence.push('public-view-room-experience');
  } else {
    missing.push('public-view-room-experience-missing');
  }
  if (Number(blueprint.opening?.engine_hints?.template_view_opening_count || 0) >= 1 ||
      (blueprint.opening?.window_openings || []).some((item) => item.template_role === 'view-glass')) {
    score += 2;
    evidence.push('view-glass-axis-present');
  } else {
    missing.push('view-glass-axis-missing');
  }
  if (blueprint.geometry?.bsp?.templateSpacePlanning?.active || blueprint.layout?.bsp?.templateSpacePlanning?.active) {
    score += 2;
    evidence.push('bsp-template-placement-recorded');
  } else {
    missing.push('bsp-template-placement-not-recorded');
  }
  return { score, evidence, missing };
}

function scoreSiteTerrainScenes(ctx) {
  const siteScenes = ctx.blueprint.site?.template_site_scenes || {};
  const evidence = [];
  const missing = [];
  let score = 0;
  if (siteScenes.active) {
    score += 2.5;
    evidence.push('template-site-scenes-active');
  } else {
    missing.push('template-site-scenes-inactive');
  }
  if (ctx.metrics.template_site_scene_count >= 5) {
    score += 2.5;
    evidence.push(`site-scenes:${ctx.metrics.template_site_scene_count}`);
  } else {
    missing.push('site-scene-count-low');
  }
  if (ctx.metrics.template_site_module_role_count >= 18) {
    score += 2.5;
    evidence.push(`site-module-roles:${ctx.metrics.template_site_module_role_count}`);
  } else {
    missing.push('site-module-variety-low');
  }
  if (ctx.metrics.template_site_module_cell_count >= 220) {
    score += 2.5;
    evidence.push(`site-module-cells:${ctx.metrics.template_site_module_cell_count}`);
  } else if (ctx.metrics.template_site_module_cell_count >= 120) {
    score += 1.5;
    evidence.push(`site-module-cells:${ctx.metrics.template_site_module_cell_count}`);
  } else {
    missing.push('site-module-density-low');
  }
  if (ctx.metrics.terrain_module_cell_count >= 60) {
    score += 2;
    evidence.push(`terrain-cells:${ctx.metrics.terrain_module_cell_count}`);
  } else {
    missing.push('terrain-plinth-density-low');
  }
  if (ctx.metrics.water_module_cell_count >= 35) {
    score += 2;
    evidence.push(`water-edge-cells:${ctx.metrics.water_module_cell_count}`);
  } else {
    missing.push('water-edge-density-low');
  }
  if (ctx.metrics.garden_module_cell_count >= 35) {
    score += 2;
    evidence.push(`garden-cells:${ctx.metrics.garden_module_cell_count}`);
  } else {
    missing.push('garden-room-density-low');
  }
  return { score, evidence, missing };
}

function scoreInteriorSceneDensity(ctx) {
  const scenes = ctx.blueprint.interior?.template_interior_scenes || {};
  const evidence = [];
  const missing = [];
  let score = 0;
  if (scenes.active) {
    score += 2.5;
    evidence.push('template-interior-scenes-active');
  } else {
    missing.push('template-interior-scenes-inactive');
  }
  if (ctx.metrics.template_interior_scene_count >= 5) {
    score += 2.5;
    evidence.push(`interior-scenes:${ctx.metrics.template_interior_scene_count}`);
  } else {
    missing.push('interior-scene-count-low');
  }
  if (ctx.metrics.template_interior_scene_placement_count >= 35) {
    score += 2.5;
    evidence.push(`scene-placements:${ctx.metrics.template_interior_scene_placement_count}`);
  } else {
    missing.push('scene-placement-density-low');
  }
  if (ctx.metrics.template_experience_placement_count >= 20) {
    score += 2;
    evidence.push(`experience-placements:${ctx.metrics.template_experience_placement_count}`);
  } else {
    missing.push('experience-placement-density-low');
  }
  if (ctx.metrics.template_pattern_placement_count >= Math.min(50, Math.max(8, ctx.metrics.obligation_count * 5))) {
    score += 2.5;
    evidence.push(`pattern-placements:${ctx.metrics.template_pattern_placement_count}`);
  } else {
    missing.push('pattern-placement-density-low');
  }
  if (ctx.metrics.template_design_law_placement_count >= Math.min(30, Math.max(6, ctx.metrics.obligation_count * 2))) {
    score += 2.5;
    evidence.push(`design-law-placements:${ctx.metrics.template_design_law_placement_count}`);
  } else {
    missing.push('design-law-placement-density-low');
  }
  if (ctx.decoratorProfile.supports_template_room_patterns && ctx.decoratorProfile.supports_template_design_laws) {
    score += 1.5;
    evidence.push('decorator-template-capabilities-active');
  } else {
    missing.push('decorator-template-capabilities-incomplete');
  }
  return { score, evidence, missing };
}

function scoreVerificationClosure(ctx) {
  const evidence = [];
  const missing = [];
  let score = 0;
  if (ctx.lawCoverage.active) {
    score += Math.min(5, Number(ctx.lawCoverage.percent || 0) / 20);
    evidence.push(`law-coverage:${ctx.lawCoverage.percent || 0}`);
    if (Number(ctx.lawCoverage.percent || 0) < 90) missing.push('law-coverage-below-excellent');
  } else {
    missing.push('law-coverage-inactive');
  }
  if (ctx.aesthetic.active) {
    score += Math.min(5, Number(ctx.aesthetic.percent ?? ctx.aesthetic.score ?? 0) / 20);
    evidence.push(`aesthetic:${ctx.aesthetic.percent ?? ctx.aesthetic.score ?? 0}`);
    if (Number(ctx.aesthetic.percent ?? ctx.aesthetic.score ?? 0) < 90) missing.push('aesthetic-below-excellent');
  } else {
    missing.push('aesthetic-review-inactive');
  }
  if ((ctx.lawCoverage.gaps || []).length === 0 && Number(ctx.lawCoverage.missing_count || 0) === 0) {
    score += 3;
    evidence.push('law-gaps-closed');
  } else {
    missing.push('law-gaps-open');
  }
  if ((ctx.aesthetic.gaps || []).filter((item) => item.severity === 'high').length === 0) {
    score += 2;
    evidence.push('no-high-aesthetic-gap');
  } else {
    missing.push('high-aesthetic-gap-open');
  }
  if (ctx.autoRepair.active || ctx.autoRepair.reason === 'template-law-coverage-already-satisfied') {
    score += 2.5;
    evidence.push(ctx.autoRepair.active ? 'auto-repair-applied' : 'auto-repair-not-needed');
  } else if (ctx.autoRepair.source) {
    score += 1;
    evidence.push(`auto-repair:${ctx.autoRepair.reason || 'recorded'}`);
  } else {
    missing.push('auto-repair-not-recorded');
  }
  if (ctx.blueprint.repair?.ok === true) {
    score += 2;
    evidence.push('constraint-repair-ok');
  } else {
    missing.push('constraint-repair-needs-attention');
  }
  if (ctx.blueprint.geometry?.exporter?.coverageOk !== false && (ctx.blueprint.operations || []).length > 0) {
    score += 1.5;
    evidence.push(`exported-operations:${(ctx.blueprint.operations || []).length}`);
  } else {
    missing.push('export-coverage-risk');
  }
  if ((ctx.aesthetic.next_iteration_directives || []).length || (ctx.lawCoverage.repair_directives || []).length) {
    score += 1;
    evidence.push('feedback-directives-present');
  } else {
    missing.push('feedback-directives-missing');
  }
  return { score, evidence, missing };
}

function buildStageProgress(ctx) {
  const stages = [
    stage('7A/7B', 'case-library-and-semantic-clauses', ctx.blueprint.templateKnowledge?.active && ctx.metrics.retrieved_template_count > 0),
    stage('7C', 'design-law-distillation', ctx.recommendations.design_law_pack?.active || ctx.metrics.selected_law_count > 0),
    stage('7D', 'design-law-runtime-injection', ctx.topologyRuntime.active || ctx.interiorRuntime.active),
    stage('7E', 'law-coverage-verification', ctx.lawCoverage.active),
    stage('7F', 'auto-repair-before-export', Boolean(ctx.autoRepair.source)),
    stage('7G', 'assimilation-audit', true)
  ];
  const completed = stages.filter((item) => item.completed).length;
  return {
    completed_count: completed,
    total_count: stages.length,
    percent: Math.round((completed / stages.length) * 100),
    items: stages
  };
}

function stage(id, label, completed) {
  return {
    id,
    label,
    completed: Boolean(completed),
    status: completed ? 'complete' : 'missing'
  };
}

function buildGaps(tracks = [], stageProgress = {}) {
  const gaps = tracks
    .filter((item) => item.percent < 85)
    .map((item) => ({
      id: item.id,
      label: item.label,
      severity: item.percent < 55 ? 'high' : item.percent < 72 ? 'medium' : 'low',
      score: item.score,
      max_score: item.max_score,
      percent: item.percent,
      missing: item.missing
    }));
  const missingStages = (stageProgress.items || []).filter((item) => !item.completed);
  for (const item of missingStages) {
    gaps.push({
      id: `stage-${item.id}`,
      label: item.label,
      severity: 'high',
      score: 0,
      max_score: 1,
      percent: 0,
      missing: [`stage-${item.id}-not-complete`]
    });
  }
  return gaps.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.percent - b.percent);
}

function buildStrengths(tracks = []) {
  return tracks
    .filter((item) => item.percent >= 85)
    .map((item) => ({
      id: item.id,
      label: item.label,
      score: item.score,
      max_score: item.max_score,
      percent: item.percent,
      evidence: item.evidence.slice(0, 5)
    }));
}

function buildNextIterationDirectives(gaps = [], ctx) {
  const directives = [];
  const add = (id, priority, text, targets = []) => {
    if (directives.some((item) => item.id === id)) return;
    directives.push({ id, priority, text, targets });
  };
  for (const gap of gaps) {
    if (gap.id === 'corpus-abstraction') add('expand-tagged-template-corpus', gap.severity, 'Add or relabel more top-tier templates with clear composition, site, and interior evidence.', ['TemplateKnowledgeAgent']);
    if (gap.id === 'law-runtime') add('strengthen-design-law-runtime', gap.severity, 'Carry more distilled laws into topology, room obligations, and interior law details.', ['PlannerAgent', 'InteriorDetailAgent']);
    if (gap.id === 'spatial-composition') add('tighten-spatial-template-grammar', gap.severity, 'Strengthen entry sequence, public view axis, and template site connections.', ['PlannerAgent', 'BSPPartitioner', 'OpeningConnectivityAgent']);
    if (gap.id === 'site-terrain-scenes') add('increase-site-terrain-scenes', gap.severity, 'Increase non-flat terrain, foreground garden, water edge, and roof/site scene density.', ['SiteLandscapeAgent', 'CSGBuilder']);
    if (gap.id === 'interior-scene-density') add('increase-interior-scene-density', gap.severity, 'Convert more room laws into complete furniture scenes, pattern groups, and design-law placements.', ['InteriorDetailAgent', 'DecoratorAgent']);
    if (gap.id === 'verification-closure') add('close-verification-feedback-loop', gap.severity, 'Resolve remaining law or aesthetic gaps before selecting the final candidate.', ['TemplateLawCoverageAgent', 'TemplateLawAutoRepairAgent', 'TemplateAestheticReviewAgent']);
    if (gap.id.startsWith('stage-')) add('complete-template-absorption-stage', gap.severity, `Complete missing template absorption stage ${gap.id.replace('stage-', '')}.`, ['Workflow']);
  }
  for (const directive of ctx.lawCoverage.repair_directives || []) {
    if (directive.priority === 'maintain') continue;
    add(directive.id, directive.priority || 'medium', directive.text, directive.targets || []);
  }
  for (const directive of ctx.aesthetic.next_iteration_directives || []) {
    if (directive.priority === 'maintain') continue;
    add(directive.id, directive.priority || 'medium', directive.text, directive.targets || []);
  }
  if (!directives.length) {
    add('preserve-top-tier-template-assimilation', 'maintain', 'Preserve the current top-tier template absorption chain and vary details without weakening verified law coverage.', ['Workflow']);
  }
  return directives;
}

function selectedLawCount(topologyRuntime = {}, recommendations = {}) {
  return (topologyRuntime.selected_laws || []).length ||
    (recommendations.design_law_pack?.selected_laws || []).length ||
    (recommendations.design_laws || []).length ||
    Number(recommendations.design_law_pack?.selected_count || 0);
}

function interiorLawCount(topologyRuntime = {}, interiorRuntime = {}, recommendations = {}) {
  return (topologyRuntime.interior_laws || []).length ||
    (interiorRuntime.interior_laws || []).length ||
    (recommendations.design_law_pack?.interior_laws || []).length ||
    (recommendations.interior_design_laws || []).length ||
    Number(recommendations.design_law_pack?.interior_selected_count || 0);
}

function summaryForPercent(percent, stageProgress = {}) {
  const stageText = `${stageProgress.completed_count || 0}/${stageProgress.total_count || 0}`;
  if (percent >= 96) return `Template assimilation is effectively closed-loop and top-tier ready; stages complete ${stageText}.`;
  if (percent >= 90) return `Template assimilation is excellent with only local residual risks; stages complete ${stageText}.`;
  if (percent >= 80) return `Template assimilation is strong but still has visible weak tracks; stages complete ${stageText}.`;
  if (percent >= 70) return `Template assimilation is usable, but important tracks need another pass; stages complete ${stageText}.`;
  if (percent >= 60) return `Template assimilation is established but not stable enough for top-tier output; stages complete ${stageText}.`;
  return `Template assimilation is still weak; stages complete ${stageText}.`;
}

function gradeForPercent(percent) {
  if (percent >= 96) return 'top-tier-closed-loop';
  if (percent >= 90) return 'excellent';
  if (percent >= 80) return 'strong';
  if (percent >= 70) return 'usable';
  if (percent >= 60) return 'basic';
  return 'weak';
}

function readinessForPercent(percent) {
  if (percent >= 96) return 'top-tier-ready';
  if (percent >= 88) return 'high';
  if (percent >= 75) return 'medium';
  if (percent >= 60) return 'low';
  return 'weak';
}

function statusForRatio(ratio) {
  if (ratio >= 0.9) return 'excellent';
  if (ratio >= 0.85) return 'strong';
  if (ratio >= 0.7) return 'usable';
  if (ratio >= 0.55) return 'thin';
  return 'gap';
}

function severityRank(severity) {
  return { high: 3, medium: 2, low: 1, maintain: 0 }[severity] || 0;
}

function countModules(modules = {}, names = []) {
  return names.reduce((sum, name) => sum + Number(modules[name] || 0), 0);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}
