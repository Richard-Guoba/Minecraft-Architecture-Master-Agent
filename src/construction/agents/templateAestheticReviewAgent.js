const REVIEW_VERSION = 1;

const SCORE_DIMENSIONS = [
  dimension('template-knowledge', '模板案例吸收', 12, reviewTemplateKnowledge),
  dimension('whole-composition', '整体构图落地', 16, reviewWholeComposition),
  dimension('space-plan', '空间序列与朝向', 14, reviewSpacePlan),
  dimension('view-openings', '视线与开口体验', 12, reviewViewOpenings),
  dimension('interior-scenes', '室内场景组合', 18, reviewInteriorScenes),
  dimension('site-scenes', '场地园林场景', 18, reviewSiteScenes),
  dimension('implementation-density', '真实落块与反馈闭环', 10, reviewImplementationDensity)
];

export class TemplateAestheticReviewAgent {
  run(blueprint = {}) {
    const hasTemplateSignal = Boolean(
      blueprint.templateKnowledge?.active ||
      blueprint.templateKnowledge?.recommendations?.composition_strategy?.readiness ||
      blueprint.topology?.template_space_plan?.active ||
      blueprint.templateLawCoverage?.active ||
      blueprint.interior?.template_room_experience?.active ||
      blueprint.interior?.template_interior_scenes?.active ||
      blueprint.site?.template_site_scenes?.active
    );

    if (!hasTemplateSignal) {
      return {
        source: 'local-template-aesthetic-review-agent',
        version: REVIEW_VERSION,
        active: false,
        reason: 'no-template-guided-generation',
        score: 0,
        max_score: 100,
        percent: 0,
        grade: 'not-applicable',
        readiness: 'inactive',
        dimensions: [],
        strengths: [],
        gaps: [],
        next_iteration_directives: [],
        regeneration_prompt_addendum: ''
      };
    }

    const dimensions = SCORE_DIMENSIONS.map((item) => scoreDimension(item, blueprint));
    const score = round(dimensions.reduce((sum, item) => sum + item.score, 0));
    const percent = Math.round(score);
    const gaps = buildGaps(dimensions, blueprint);
    const strengths = buildStrengths(dimensions, blueprint);
    const nextIterationDirectives = buildNextIterationDirectives(gaps, dimensions, blueprint);

    return {
      source: 'local-template-aesthetic-review-agent',
      version: REVIEW_VERSION,
      active: true,
      score,
      max_score: 100,
      percent,
      grade: gradeForPercent(percent),
      readiness: readinessForPercent(percent),
      summary: summaryForPercent(percent),
      dimensions,
      strengths,
      gaps,
      next_iteration_directives: nextIterationDirectives,
      regeneration_prompt_addendum: promptAddendum(nextIterationDirectives),
      metrics: reviewMetrics(blueprint)
    };
  }
}

function dimension(id, label, maxScore, reviewer) {
  return { id, label, max_score: maxScore, reviewer };
}

function scoreDimension(config, blueprint) {
  const result = config.reviewer(blueprint);
  const rawScore = clamp(Number(result.score || 0), 0, config.max_score);
  return {
    id: config.id,
    label: config.label,
    score: round(rawScore),
    max_score: config.max_score,
    percent: Math.round((rawScore / config.max_score) * 100),
    status: statusForRatio(rawScore / config.max_score),
    evidence: result.evidence || [],
    missing: result.missing || [],
    directives: result.directives || []
  };
}

function reviewTemplateKnowledge(blueprint) {
  const knowledge = blueprint.templateKnowledge || {};
  const recommendations = knowledge.recommendations || {};
  const composition = recommendations.composition_strategy || {};
  const retrievedCount = Array.isArray(knowledge.retrieved) ? knowledge.retrieved.length : Number(knowledge.retrieved_count || 0);
  const landscapeFeatures = recommendations.landscape_features || [];
  const roomGuidance = recommendations.room_pattern_guidance || [];
  const evidence = [];
  const missing = [];
  let score = 0;

  if (knowledge.active) {
    score += 3;
    evidence.push('template-knowledge-active');
  } else {
    missing.push('template-knowledge-inactive');
  }
  if (retrievedCount > 0) {
    score += Math.min(3, retrievedCount);
    evidence.push(`retrieved:${retrievedCount}`);
  } else {
    missing.push('no-retrieved-template-cases');
  }
  if (composition.readiness === 'high') {
    score += 3;
    evidence.push('composition-readiness-high');
  } else if (composition.readiness) {
    score += 1.5;
    evidence.push(`composition-readiness:${composition.readiness}`);
  } else {
    missing.push('no-composition-strategy');
  }
  if (landscapeFeatures.length >= 3) {
    score += 1.5;
    evidence.push(`landscape-features:${landscapeFeatures.length}`);
  } else {
    missing.push('few-landscape-template-features');
  }
  if (roomGuidance.length || recommendations.template_interior_pattern_strength) {
    score += 1.5;
    evidence.push('room-pattern-guidance-present');
  } else {
    missing.push('no-room-pattern-guidance');
  }

  return {
    score,
    evidence,
    missing,
    directives: missing.includes('no-room-pattern-guidance') ? ['mine-more-furnished-room-patterns'] : []
  };
}

function reviewWholeComposition(blueprint) {
  const composition = blueprint.templateKnowledge?.recommendations?.composition_strategy || {};
  const directives = composition.directives || {};
  const creativeSignature = String(blueprint.creativeDesign?.signature || '');
  const facadeRhythm = blueprint.facade?.window_system?.rhythm;
  const roofProfile = blueprint.roof?.profile;
  const siteMood = blueprint.site?.mood;
  const modules = blueprint.modules || {};
  const evidence = [];
  const missing = [];
  let score = 0;

  if (composition.readiness === 'high') {
    score += 3;
    evidence.push('whole-composition-source-high');
  } else if (composition.readiness) {
    score += 1.5;
    evidence.push(`whole-composition-source:${composition.readiness}`);
  } else {
    missing.push('composition-strategy-not-ready');
  }
  if (/template-composition/.test(creativeSignature)) {
    score += 2.5;
    evidence.push('creative-design-used-template-composition');
  } else {
    missing.push('creative-signature-missing-template-composition');
  }
  if (directives.preferred_facade_rhythm && facadeRhythm) {
    score += facadeRhythm === directives.preferred_facade_rhythm ? 2.5 : 1.5;
    evidence.push(`facade:${facadeRhythm}`);
  } else {
    missing.push('facade-rhythm-not-linked');
  }
  if (directives.preferred_roof_profile && roofProfile) {
    score += roofProfile === directives.preferred_roof_profile ? 2 : 1.2;
    evidence.push(`roof:${roofProfile}`);
  } else {
    missing.push('roof-profile-not-linked');
  }
  if (directives.preferred_site_mood && siteMood) {
    score += siteMood === directives.preferred_site_mood ? 2 : 1.2;
    evidence.push(`site:${siteMood}`);
  } else {
    missing.push('site-mood-not-linked');
  }
  if (countModules(modules, ['template_view_deck', 'template_view_frame', 'template_entry_frame', 'template_approach_path']) >= 20) {
    score += 2;
    evidence.push('legacy-template-composition-modules-present');
  } else {
    missing.push('few-template-composition-modules');
  }
  if (blueprint.architecture?.massing_rules?.template_use_wings || directives.use_wings) {
    score += 2;
    evidence.push('wing-or-offset-massing-intent');
  } else {
    missing.push('no-wing-or-offset-massing-intent');
  }

  return {
    score,
    evidence,
    missing,
    directives: missing.includes('few-template-composition-modules') ? ['increase-template-composition-modules'] : []
  };
}

function reviewSpacePlan(blueprint) {
  const plan = blueprint.topology?.template_space_plan || {};
  const bsp = blueprint.geometry?.bsp?.templateSpacePlanning || blueprint.layout?.bsp?.templateSpacePlanning || {};
  const evidence = [];
  const missing = [];
  let score = 0;

  if (plan.active) {
    score += 3;
    evidence.push(`space-plan:${plan.readiness || 'active'}`);
  } else {
    missing.push('template-space-plan-inactive');
  }
  if (plan.view_side && plan.service_side && plan.quiet_side) {
    score += 2.5;
    evidence.push(`sides:${plan.view_side}/${plan.service_side}/${plan.quiet_side}`);
  } else {
    missing.push('view-service-quiet-sides-missing');
  }
  const thresholds = plan.entry_sequence?.thresholds || [];
  if (thresholds.length >= 5) {
    score += 2.5;
    evidence.push(`entry-sequence:${thresholds.join('>')}`);
  } else {
    missing.push('entry-sequence-too-shallow');
  }
  if ((plan.site_connections || blueprint.topology?.site_connections || []).some((item) => /^template-/.test(String(item.relation || '')))) {
    score += 2;
    evidence.push('template-site-connections-present');
  } else {
    missing.push('no-template-site-connections');
  }
  if (bsp.active || blueprint.geometry?.bsp?.templateSpacePlanning?.active) {
    score += 2;
    evidence.push('bsp-template-placement-active');
  } else {
    missing.push('bsp-template-placement-not-recorded');
  }
  if (blueprint.geometry?.bsp?.unassignedPlannerNodes?.includes?.('living') === false || !Array.isArray(blueprint.geometry?.bsp?.unassignedPlannerNodes)) {
    score += 2;
    evidence.push('public-core-assigned');
  } else {
    missing.push('public-core-unassigned-risk');
  }

  return {
    score,
    evidence,
    missing,
    directives: missing.includes('entry-sequence-too-shallow') ? ['strengthen-entry-to-view-threshold-sequence'] : []
  };
}

function reviewViewOpenings(blueprint) {
  const experience = blueprint.interior?.template_room_experience || blueprint.opening?.template_room_experience || {};
  const opening = blueprint.opening || {};
  const evidence = [];
  const missing = [];
  let score = 0;

  if (experience.active) {
    score += 2.5;
    evidence.push(`room-experience:${experience.readiness || 'active'}`);
  } else {
    missing.push('template-room-experience-inactive');
  }
  const publicViewRooms = experience.opening_plan?.public_view_rooms || [];
  if (publicViewRooms.length >= 2) {
    score += 2;
    evidence.push(`public-view-rooms:${publicViewRooms.length}`);
  } else if (publicViewRooms.length) {
    score += 1;
    evidence.push(`public-view-rooms:${publicViewRooms.length}`);
  } else {
    missing.push('no-public-view-rooms');
  }
  const viewGlass = (opening.window_openings || []).filter((item) => item.template_role === 'view-glass');
  if (viewGlass.length && viewGlass.some((item) => item.glazing_ratio === 'high')) {
    score += 2.5;
    evidence.push('high-view-glass-opening');
  } else {
    missing.push('view-glass-window-group-missing');
  }
  const thresholds = opening.view_thresholds || [];
  if (thresholds.length >= Math.min(2, publicViewRooms.length || 2)) {
    score += 2;
    evidence.push(`view-thresholds:${thresholds.length}`);
  } else {
    missing.push('view-thresholds-too-few');
  }
  if (Number(opening.engine_hints?.template_view_opening_count || 0) >= 1) {
    score += 1.5;
    evidence.push(`template-view-openings:${opening.engine_hints.template_view_opening_count}`);
  } else {
    missing.push('template-view-opening-count-zero');
  }
  const roles = new Set((blueprint.decorator?.placements || []).map((item) => item.role));
  if (roles.has('template-view-seat') || roles.has('template-scene-sofa-primary')) {
    score += 1.5;
    evidence.push('interior-furniture-faces-view');
  } else {
    missing.push('no-view-facing-interior-anchor');
  }

  return {
    score,
    evidence,
    missing,
    directives: missing.includes('view-glass-window-group-missing') ? ['increase-view-glass-and-thresholds'] : []
  };
}

function reviewInteriorScenes(blueprint) {
  const scenes = blueprint.interior?.template_interior_scenes || {};
  const profile = blueprint.decorator?.capability_profile || {};
  const placements = blueprint.decorator?.placements || [];
  const scenePlacements = placements.filter((item) => String(item.role || '').startsWith('template-scene-'));
  const sceneTypes = scenes.scene_types || [];
  const evidence = [];
  const missing = [];
  let score = 0;

  if (scenes.active) {
    score += 3;
    evidence.push(`interior-scenes:${scenes.readiness || 'active'}`);
  } else {
    missing.push('template-interior-scenes-inactive');
  }
  if (Number(scenes.room_scene_count || 0) >= 5) {
    score += 3;
    evidence.push(`scene-room-count:${scenes.room_scene_count}`);
  } else {
    score += Math.min(2, Number(scenes.room_scene_count || 0) * 0.4);
    missing.push('few-room-scenes');
  }
  const requiredScenes = ['view-lounge-scene', 'kitchen-island-scene', 'sleep-suite-scene', 'study-reading-scene'];
  const missingSceneTypes = requiredScenes.filter((type) => !sceneTypes.includes(type));
  score += (requiredScenes.length - missingSceneTypes.length) * 1.5;
  if (!missingSceneTypes.length) evidence.push('core-interior-scene-types-present');
  else missing.push(`missing-scene-types:${missingSceneTypes.join(',')}`);
  if (Number(profile.template_interior_scene_placement_count || scenePlacements.length) >= 35) {
    score += 3;
    evidence.push(`template-scene-placements:${profile.template_interior_scene_placement_count || scenePlacements.length}`);
  } else {
    score += Math.min(2, Number(profile.template_interior_scene_placement_count || scenePlacements.length) / 18);
    missing.push('template-scene-placements-too-low');
  }
  const uniqueSceneRoles = new Set(scenePlacements.map((item) => item.role));
  if (uniqueSceneRoles.size >= 14) {
    score += 2;
    evidence.push(`unique-scene-roles:${uniqueSceneRoles.size}`);
  } else {
    missing.push('interior-scene-role-variety-low');
  }
  if (profile.supports_template_room_experience) {
    score += 1;
    evidence.push('room-experience-layer-still-present');
  } else {
    missing.push('room-experience-layer-not-placed');
  }

  return {
    score,
    evidence,
    missing,
    directives: missing.includes('template-scene-placements-too-low') ? ['increase-room-scale-furniture-groups'] : []
  };
}

function reviewSiteScenes(blueprint) {
  const siteScenes = blueprint.site?.template_site_scenes || {};
  const modules = blueprint.modules || {};
  const templateSiteModuleNames = Object.keys(modules).filter((name) => name.startsWith('template_site_'));
  const sceneTypes = siteScenes.scene_types || [];
  const evidence = [];
  const missing = [];
  let score = 0;

  if (siteScenes.active) {
    score += 3;
    evidence.push(`site-scenes:${siteScenes.readiness || 'active'}`);
  } else {
    missing.push('template-site-scenes-inactive');
  }
  if (Number(siteScenes.scene_count || 0) >= 5) {
    score += 3;
    evidence.push(`site-scene-count:${siteScenes.scene_count}`);
  } else {
    score += Math.min(2, Number(siteScenes.scene_count || 0) * 0.5);
    missing.push('few-template-site-scenes');
  }
  const requiredScenes = ['entry-approach-scene', 'terrain-plinth-scene', 'forecourt-garden-room-scene', 'water-edge-deck-scene', 'grove-edge-scene'];
  const missingSceneTypes = requiredScenes.filter((type) => !sceneTypes.includes(type));
  score += (requiredScenes.length - missingSceneTypes.length) * 1.4;
  if (!missingSceneTypes.length) evidence.push('core-site-scene-types-present');
  else missing.push(`missing-site-scene-types:${missingSceneTypes.join(',')}`);
  if (templateSiteModuleNames.length >= 18) {
    score += 2.5;
    evidence.push(`template-site-module-variety:${templateSiteModuleNames.length}`);
  } else {
    missing.push('template-site-module-variety-low');
  }
  if (countModules(modules, ['template_site_earth_terrace', 'template_site_stone_plinth', 'template_site_retaining_edge']) >= 80) {
    score += 1.5;
    evidence.push('non-flat-terrain-base-realized');
  } else {
    missing.push('terrain-base-too-light');
  }
  if (countModules(modules, ['template_site_reflection_water', 'template_site_water_deck', 'template_site_water_edge']) >= 40) {
    score += 1;
    evidence.push('water-edge-deck-realized');
  } else {
    missing.push('water-edge-scene-too-light');
  }

  return {
    score,
    evidence,
    missing,
    directives: missing.includes('few-template-site-scenes') ? ['increase-site-scene-coverage'] : []
  };
}

function reviewImplementationDensity(blueprint) {
  const modules = blueprint.modules || {};
  const decoratorProfile = blueprint.decorator?.capability_profile || {};
  const exportCount = (blueprint.operations || []).length;
  const evidence = [];
  const missing = [];
  let score = 0;

  const templateModuleTotal = Object.entries(modules)
    .filter(([name]) => name.startsWith('template_') || name.startsWith('template-site') || name.startsWith('template_site_'))
    .reduce((sum, [, count]) => sum + Number(count || 0), 0);
  if (templateModuleTotal >= 120) {
    score += 2.5;
    evidence.push(`template-module-cells:${templateModuleTotal}`);
  } else {
    missing.push('template-module-density-low');
  }
  if (Number(decoratorProfile.template_experience_placement_count || 0) >= 20) {
    score += 1.5;
    evidence.push(`template-experience-placements:${decoratorProfile.template_experience_placement_count}`);
  } else {
    missing.push('template-experience-placements-low');
  }
  if (Number(decoratorProfile.template_interior_scene_placement_count || 0) >= 35) {
    score += 1.5;
    evidence.push(`template-interior-scene-placements:${decoratorProfile.template_interior_scene_placement_count}`);
  } else {
    missing.push('template-interior-scene-placements-low');
  }
  if (blueprint.site?.template_site_scenes?.active && Number(blueprint.geometry?.site?.templateSiteSceneCount || 0) >= 3) {
    score += 1.5;
    evidence.push(`template-site-scenes:${blueprint.geometry.site.templateSiteSceneCount}`);
  } else {
    missing.push('template-site-scenes-not-in-geometry-summary');
  }
  if (exportCount > 0 && blueprint.geometry?.exporter?.coverageOk !== false) {
    score += 1;
    evidence.push(`exported-operations:${exportCount}`);
  } else {
    missing.push('export-coverage-risk');
  }
  if (blueprint.repair?.ok === true) {
    score += 1;
    evidence.push('repair-agent-ok');
  } else {
    missing.push('repair-agent-attention');
  }
  if (blueprint.templateKnowledge?.gap_priorities?.length || blueprint.templateKnowledge?.recommendations?.corpus_gap_priorities?.length) {
    score += 1;
    evidence.push('corpus-gap-priorities-available');
  } else {
    missing.push('no-corpus-gap-priorities');
  }
  if (blueprint.templateLawCoverage?.active && Number(blueprint.templateLawCoverage.percent || 0) >= 85) {
    score += 1;
    evidence.push(`template-law-coverage:${blueprint.templateLawCoverage.percent}`);
  } else if (blueprint.templateLawCoverage?.active) {
    missing.push('template-law-coverage-needs-repair');
  }

  return {
    score,
    evidence,
    missing,
    directives: missing.includes('template-module-density-low') ? ['raise-template-detail-density'] : []
  };
}

function buildGaps(dimensions, blueprint) {
  const gaps = [];
  for (const item of dimensions) {
    if (item.percent >= 85) continue;
    gaps.push({
      id: item.id,
      label: item.label,
      severity: item.percent < 55 ? 'high' : item.percent < 72 ? 'medium' : 'low',
      score: item.score,
      max_score: item.max_score,
      missing: item.missing,
      recommendation: recommendationForDimension(item.id, item.missing, blueprint)
    });
  }
  return gaps.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.score - b.score);
}

function buildStrengths(dimensions, blueprint) {
  return dimensions
    .filter((item) => item.percent >= 85)
    .map((item) => ({
      id: item.id,
      label: item.label,
      score: item.score,
      max_score: item.max_score,
      evidence: item.evidence.slice(0, 4),
      takeaway: strengthTakeaway(item.id, blueprint)
    }));
}

function buildNextIterationDirectives(gaps, dimensions, blueprint) {
  const directives = [];
  const add = (id, priority, text, targets = []) => {
    if (directives.some((item) => item.id === id)) return;
    directives.push({ id, priority, text, targets });
  };

  for (const gap of gaps) {
    if (gap.id === 'template-knowledge') add('mine-richer-template-evidence', gap.severity, '补充更多带室内、场地、构图标签的顶级模板案例。', ['TemplateKnowledgeAgent']);
    if (gap.id === 'whole-composition') add('tighten-whole-composition', gap.severity, '让体块、立面、屋顶和场地继续共享同一个模板构图意图。', ['CreativeDesignAgent', 'FacadeAgent', 'RoofAgent', 'SiteLandscapeAgent']);
    if (gap.id === 'space-plan') add('strengthen-template-space-plan', gap.severity, '强化入口压缩、公共核心朝景观、服务侧退让、安静侧退台的空间序列。', ['PlannerAgent', 'BSPPartitioner']);
    if (gap.id === 'view-openings') add('increase-view-thresholds', gap.severity, '增加公共房间到景观/平台的开口、视线阈值和面景家具锚点。', ['OpeningConnectivityAgent', 'DecoratorAgent']);
    if (gap.id === 'interior-scenes') add('add-room-scale-scene-groups', gap.severity, '把更多房间组织成完整家具组合，而不是单个家具点。', ['InteriorDetailAgent', 'DecoratorAgent']);
    if (gap.id === 'site-scenes') add('add-landscape-scene-groups', gap.severity, '增强前景花园、非平坦地形、水边平台、树丛边界的组合场景。', ['SiteLandscapeAgent', 'CSGBuilder']);
    if (gap.id === 'implementation-density') add('raise-template-implementation-density', gap.severity, '把模板语义转化为更多可见的真实方块模块，并保留反馈指标。', ['CSGBuilder', 'DecoratorAgent', 'WorkflowReport']);
  }

  if (!directives.length) {
    add('preserve-template-quality', 'maintain', '保持当前模板构图、空间、内饰和场地场景链路，并在下一轮增加细节变化而不是重做骨架。', ['CreativeDesignAgent']);
  }

  return directives;
}

function reviewMetrics(blueprint) {
  const modules = blueprint.modules || {};
  const templateSiteModuleNames = Object.keys(modules).filter((name) => name.startsWith('template_site_'));
  return {
    retrieved_template_count: blueprint.templateKnowledge?.retrieved?.length || 0,
    template_space_plan_active: Boolean(blueprint.topology?.template_space_plan?.active),
    template_room_experience_count: (blueprint.interior?.template_room_experience?.room_experiences || []).length,
    template_interior_scene_count: blueprint.interior?.template_interior_scenes?.room_scene_count || 0,
    template_site_scene_count: blueprint.site?.template_site_scenes?.scene_count || 0,
    template_site_module_role_count: templateSiteModuleNames.length,
    template_site_module_cell_count: templateSiteModuleNames.reduce((sum, name) => sum + Number(modules[name] || 0), 0),
    template_experience_placement_count: blueprint.decorator?.capability_profile?.template_experience_placement_count || 0,
    template_interior_scene_placement_count: blueprint.decorator?.capability_profile?.template_interior_scene_placement_count || 0,
    template_law_coverage_percent: blueprint.templateLawCoverage?.active ? Number(blueprint.templateLawCoverage.percent || 0) : 0,
    template_law_coverage_grade: blueprint.templateLawCoverage?.grade || 'not-applicable',
    template_law_missing_count: blueprint.templateLawCoverage?.missing_count || 0,
    template_design_law_placement_count: blueprint.decorator?.capability_profile?.template_design_law_placement_count || 0
  };
}

function promptAddendum(directives = []) {
  if (!directives.length) return '';
  return directives
    .slice(0, 4)
    .map((item) => item.text)
    .join(' ');
}

function recommendationForDimension(id, missing = []) {
  const note = missing.length ? `缺口：${missing.slice(0, 3).join('、')}` : '缺口较小，继续保持。';
  return {
    'template-knowledge': `${note} 优先补充同风格、同场地和有完整室内的高质量模板。`,
    'whole-composition': `${note} 下一轮要让体块、立面、屋顶、场地共享同一构图语法。`,
    'space-plan': `${note} 强化从前景到入口再到观景核心的空间顺序。`,
    'view-openings': `${note} 增加观景窗、平台门和面景家具之间的关系。`,
    'interior-scenes': `${note} 增加房间级家具组合件和场景锚点。`,
    'site-scenes': `${note} 增加地形、花园、水边、树丛的组合场景落块。`,
    'implementation-density': `${note} 把语义策略转化成更多真实模块，并保留可验证指标。`
  }[id] || note;
}

function strengthTakeaway(id) {
  return {
    'template-knowledge': '模板案例已经能提供有效参考。',
    'whole-composition': '整体构图已经能贯穿多个 agent。',
    'space-plan': '空间序列已经接近模板语法。',
    'view-openings': '观景和开口关系已经被房间体验吸收。',
    'interior-scenes': '室内已经从家具清单升级为场景组合。',
    'site-scenes': '场地已经从平面装饰升级为园林/地形场景。',
    'implementation-density': '模板语义已经大量转成真实方块。'
  }[id] || '表现稳定。';
}

function summaryForPercent(percent) {
  if (percent >= 90) return '模板吸收链路很强，已经能稳定生成接近顶级案例语法的建筑。';
  if (percent >= 80) return '模板吸收链路优秀，主要短板集中在少数场景密度或细节丰富度。';
  if (percent >= 70) return '模板吸收链路可用，但仍需要补齐构图、内饰或场地中的明显短板。';
  if (percent >= 60) return '模板吸收已初步建立，但离顶级案例仍有明显差距。';
  return '模板吸收不足，需要回到案例挖掘和语义落地。';
}

function gradeForPercent(percent) {
  if (percent >= 95) return '无可挑剔';
  if (percent >= 90) return '优秀';
  if (percent >= 80) return '能应对大部分情况';
  if (percent >= 70) return '还行';
  if (percent >= 60) return '初步完成';
  return '需要补强';
}

function readinessForPercent(percent) {
  if (percent >= 88) return 'high';
  if (percent >= 72) return 'medium';
  if (percent >= 55) return 'low';
  return 'weak';
}

function statusForRatio(ratio) {
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

function round(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
