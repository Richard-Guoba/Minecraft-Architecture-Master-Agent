const COUNCIL_VERSION = 1;
const SOURCE = 'stage4-critic-council-v1';

const SEVERITY_WEIGHT = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1
};

const SCORE_PENALTY = {
  critical: 35,
  high: 20,
  medium: 10,
  low: 3,
  info: 0
};

export class CriticCouncilAgent {
  run(context = {}) {
    const ctx = normalizeContext(context);
    const critics = [
      buildabilityCritic(ctx),
      connectivityCritic(ctx),
      habitationCritic(ctx),
      styleCritic(ctx),
      compositionCritic(ctx),
      siteCritic(ctx)
    ].map(normalizeCritic);
    const findings = critics.flatMap((critic) =>
      critic.findings.map((finding) => ({ ...finding, critic_id: critic.id, critic_label: critic.label }))
    );
    const topFindings = findings.slice().sort(compareFindings).slice(0, 8);
    const repairDirectives = buildRepairDirectives(topFindings);
    const nextIterationDirectives = buildNextIterationDirectives(repairDirectives);
    const readiness = readinessForFindings(findings);
    const overallScore = scoreForFindings(findings);
    const criticalCount = findings.filter((finding) => finding.severity === 'critical').length;
    const warningCount = findings.filter((finding) => ['medium', 'high', 'critical'].includes(finding.severity)).length;
    const satisfiedCount = critics.reduce((sum, critic) => sum + critic.satisfied.length, 0);

    return {
      source: SOURCE,
      version: COUNCIL_VERSION,
      active: true,
      summary: summaryFor(readiness, overallScore, criticalCount, warningCount),
      readiness,
      overall_score: overallScore,
      critic_count: critics.length,
      critical_count: criticalCount,
      warning_count: warningCount,
      satisfied_count: satisfiedCount,
      critics,
      top_findings: topFindings,
      repair_directives: repairDirectives,
      next_iteration_directives: nextIterationDirectives,
      warnings: []
    };
  }
}

export function severityRank(severity) {
  return SEVERITY_WEIGHT[String(severity || 'info')] || SEVERITY_WEIGHT.info;
}

export function readinessForFindings(findings = []) {
  if (findings.some((finding) => finding.severity === 'critical')) return 'blocked';
  if (findings.some((finding) => finding.severity === 'high')) return 'needs-repair';
  if (findings.some((finding) => finding.severity === 'medium')) return 'watch';
  return 'clear';
}

export function scoreForFindings(findings = []) {
  const penalty = findings.reduce((sum, finding) => sum + (SCORE_PENALTY[finding.severity] || 0), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

function normalizeContext(context = {}) {
  const blueprint = context.blueprint || {};
  return {
    blueprint,
    validation: context.validation || {},
    architectureScorecard: context.architectureScorecard || {},
    scorecard: context.architectureScorecard?.scorecard || blueprint.architectureScorecard || {},
    prompt: String(blueprint.prompt || context.prompt || '')
  };
}

function normalizeCritic(critic = {}) {
  const findings = Array.isArray(critic.findings) ? critic.findings.map(normalizeFinding) : [];
  const satisfied = Array.isArray(critic.satisfied) ? critic.satisfied.map(normalizeSatisfied) : [];
  const status = findings.some((finding) => ['critical', 'high'].includes(finding.severity))
    ? 'fail'
    : findings.some((finding) => finding.severity === 'medium')
      ? 'warn'
      : 'pass';
  return {
    id: critic.id,
    label: critic.label,
    status,
    score: scoreForFindings(findings),
    summary: critic.summary || summaryForCritic(critic.id, status, findings, satisfied),
    findings,
    satisfied
  };
}

function normalizeFinding(item = {}) {
  const severity = ['critical', 'high', 'medium', 'low', 'info'].includes(String(item.severity))
    ? String(item.severity)
    : 'info';
  return {
    id: normalizeId(item.id || 'critic-finding'),
    severity,
    message: String(item.message || item.id || 'Critic finding'),
    evidence: normalizeStringArray(item.evidence),
    repair_hint: String(item.repair_hint || 'Review the related agent output and preserve build validity.'),
    owner: String(item.owner || 'Workflow')
  };
}

function normalizeSatisfied(item = {}) {
  return {
    id: normalizeId(item.id || 'satisfied-check'),
    message: String(item.message || item.id || 'Satisfied check'),
    evidence: normalizeStringArray(item.evidence)
  };
}

function finding(id, severity, message, evidence = [], repairHint = 'Review related design directives.', owner = 'Workflow') {
  return { id, severity, message, evidence: normalizeStringArray(evidence), repair_hint: repairHint, owner };
}

function satisfied(id, message, evidence = []) {
  return { id, message, evidence: normalizeStringArray(evidence) };
}

function buildabilityCritic(ctx) {
  const { blueprint, validation } = ctx;
  const findings = [];
  const satisfiedChecks = [];
  if (!validation.ok) {
    findings.push(finding(
      'blueprint-validation-failed',
      'critical',
      'Blueprint validation failed before export.',
      validation.errors || [],
      'Fix validation errors before exporting or scoring the build.',
      'BlueprintQAAgent'
    ));
  } else {
    satisfiedChecks.push(satisfied('blueprint-validation-passed', 'Blueprint validation passed.', ['validation.ok=true']));
  }
  if (!Array.isArray(blueprint.operations) || blueprint.operations.length === 0) {
    findings.push(finding('operation-count-missing', 'critical', 'No export operations were recorded.', ['operations=0'], 'Ensure the optimizer receives a non-empty grid.', 'BlueprintOptimizerAgent'));
  } else {
    satisfiedChecks.push(satisfied('operation-count-present', 'Export operations are present.', [`operations=${blueprint.operations.length}`]));
  }
  const operationCount = Number(blueprint.geometry?.exporter?.operationCount || blueprint.operations?.length || 0);
  if (operationCount > 1800) {
    findings.push(finding('command-volume-high', 'medium', 'Optimized command count is high for interactive use.', [`operationCount=${operationCount}`], 'Review volume fragmentation and command compression.', 'BlueprintOptimizerAgent'));
  } else if (operationCount > 0) {
    satisfiedChecks.push(satisfied('command-volume-controlled', 'Optimized command count is controlled.', [`operationCount=${operationCount}`]));
  }
  if (!blueprint.bounds || Number(blueprint.bounds.maxX) <= Number(blueprint.bounds.minX) || Number(blueprint.bounds.maxZ) <= Number(blueprint.bounds.minZ)) {
    findings.push(finding('invalid-bounds', 'high', 'Blueprint bounds are missing or degenerate.', [JSON.stringify(blueprint.bounds || {})], 'Preserve valid CSG bounds before export.', 'CSGBuilder'));
  } else {
    satisfiedChecks.push(satisfied('bounds-present', 'Blueprint bounds are valid.', [`bounds=${blueprint.bounds.minX},${blueprint.bounds.maxX},${blueprint.bounds.minZ},${blueprint.bounds.maxZ}`]));
  }
  return { id: 'buildability', label: 'BuildabilityCritic', findings, satisfied: satisfiedChecks };
}

function connectivityCritic(ctx) {
  const { blueprint, validation } = ctx;
  const findings = [];
  const satisfiedChecks = [];
  const reachable = Number(validation.stats?.circulation?.reachableRoomCount || 0);
  const roomCount = Number(validation.stats?.rooms?.roomCount || blueprint.layout?.rooms?.length || 0);
  if (!blueprint.paths?.mainDoor && !blueprint.opening?.main_entry) {
    findings.push(finding('missing-exterior-entry', 'critical', 'No exterior entry was recorded.', ['mainDoor missing'], 'Create a reachable main entry and path.', 'OpeningConnectivityAgent'));
  } else {
    satisfiedChecks.push(satisfied('exterior-entry-present', 'Exterior entry is present.', [blueprint.opening?.main_entry?.side || blueprint.paths?.mainDoor?.side || 'entry']));
  }
  if (roomCount > 0 && reachable < roomCount) {
    findings.push(finding('unreachable-rooms', 'critical', 'Some generated rooms are not reachable.', [`reachable=${reachable}`, `rooms=${roomCount}`], 'Repair doors, soft boundaries, or path graph.', 'AStarPathfinder'));
  } else if (roomCount > 0) {
    satisfiedChecks.push(satisfied('rooms-reachable', 'All generated rooms are reachable.', [`reachable=${reachable}`, `rooms=${roomCount}`]));
  }
  if (Number(blueprint.buildSpec?.floors || 1) > 1 && !blueprint.paths?.stairs?.length && Number(blueprint.geometry?.pathfinder?.stairCount || 0) === 0) {
    findings.push(finding('missing-stairs-for-multifloor', 'critical', 'Multi-floor building has no stair evidence.', [`floors=${blueprint.buildSpec?.floors}`], 'Place a stair core and verify floor openings.', 'AStarPathfinder'));
  } else {
    satisfiedChecks.push(satisfied('vertical-circulation-present', 'Vertical circulation evidence is present or unnecessary.', [`floors=${blueprint.buildSpec?.floors || 1}`]));
  }
  return { id: 'connectivity', label: 'ConnectivityCritic', findings, satisfied: satisfiedChecks };
}

function habitationCritic(ctx) {
  const { blueprint, scorecard, validation } = ctx;
  const findings = [];
  const satisfiedChecks = [];
  const typology = String(blueprint.buildSpec?.typology || blueprint.architecture?.typology || '');
  const residential = /house|villa|manor|lodge|cabin|住宅|别墅/.test(typology);
  const roomTypes = (blueprint.topology?.nodes || []).map((node) => String(node.type || node.id || '').toLowerCase());
  if (residential && !roomTypes.some((type) => /bed|卧|sleep/.test(type))) {
    findings.push(finding('missing-sleeping-room', 'high', 'Residential program lacks a sleeping room.', [`typology=${typology}`], 'Add or preserve at least one bedroom-like private room.', 'PlannerAgent'));
  } else {
    satisfiedChecks.push(satisfied('residential-program-covered', 'Residential room program has sleeping/private coverage when required.', [typology || 'general']));
  }
  const placements = blueprint.decorator?.placements?.length || validationDecoratorCount(validation);
  if (placements <= 0) {
    findings.push(finding('thin-room-identity', 'medium', 'No decoration placements were recorded.', ['decorator placements=0'], 'Run room specialists and preserve room identity props.', 'DecoratorAgent'));
  } else {
    satisfiedChecks.push(satisfied('decorations-present', 'Functional decoration placements are present.', [`placements=${placements}`]));
  }
  if (Number(blueprint.interiorClearanceRepair?.removed_count || 0) > Math.max(12, roomTypes.length * 3)) {
    findings.push(finding('clearance-cleanup-high', 'medium', 'Interior clearance repair removed many blockers.', [`removed=${blueprint.interiorClearanceRepair.removed_count}`], 'Reduce bulky central furniture and keep circulation spines clear.', 'InteriorClearanceRepairAgent'));
  } else {
    satisfiedChecks.push(satisfied('clearance-controlled', 'Interior clearance cleanup is controlled.', [`removed=${blueprint.interiorClearanceRepair?.removed_count || 0}`]));
  }
  if (Number(scorecard.totalScore || 0) >= 90) {
    satisfiedChecks.push(satisfied('habitation-score-strong', 'Architecture scorecard is strong.', [`score=${scorecard.totalScore}`]));
  }
  return { id: 'habitation', label: 'HabitationCritic', findings, satisfied: satisfiedChecks };
}

function styleCritic(ctx) {
  const { blueprint } = ctx;
  const findings = [];
  const satisfiedChecks = [];
  const styleFamily = String(blueprint.architecture?.style_family || blueprint.buildSpec?.style_family || 'general');
  const palette = String(blueprint.materialPalette?.palette || '');
  if (styleFamily === 'modern' && palette && !/glass|concrete|stone|quartz|modern/.test(palette)) {
    findings.push(finding('style-family-mismatch', 'medium', 'Material palette may not support the requested modern style.', [`style=${styleFamily}`, `palette=${palette}`], 'Re-select materials consistent with the style family.', 'MaterialPaletteAgent'));
  } else {
    satisfiedChecks.push(satisfied('style-family-preserved', 'Style family and material palette are compatible.', [`style=${styleFamily}`, `palette=${palette || 'auto'}`]));
  }
  if (/平屋顶|平顶|屋顶露台/.test(ctx.prompt) && blueprint.roof?.style && blueprint.roof.style !== 'flat') {
    findings.push(finding('roof-profile-contradiction', 'high', 'Roof style contradicts an explicit flat roof or roof terrace request.', [`roof=${blueprint.roof.style}`], 'Preserve explicit roof request in CreativeDesignAgent and RoofAgent.', 'RoofAgent'));
  } else {
    satisfiedChecks.push(satisfied('roof-request-compatible', 'Roof expression does not contradict explicit prompt roof intent.', [blueprint.roof?.style || 'auto']));
  }
  const aesthetic = blueprint.templateAestheticReview || {};
  if (aesthetic.active && Number(aesthetic.score || 0) < 80) {
    findings.push(finding('template-aesthetic-weak', 'medium', 'Template aesthetic review score is below target.', [`score=${aesthetic.score}`], 'Apply template review directives before export.', 'TemplateAestheticReviewAgent'));
  } else if (aesthetic.active) {
    satisfiedChecks.push(satisfied('template-aesthetic-strong', 'Template aesthetic review is strong.', [`score=${aesthetic.score}`]));
  }
  return { id: 'style', label: 'StyleCritic', findings, satisfied: satisfiedChecks };
}

function compositionCritic(ctx) {
  const { blueprint } = ctx;
  const findings = [];
  const satisfiedChecks = [];
  const estimated = Number(blueprint.creativeDesign?.authority?.estimated_llm_decision_share || 0);
  if (estimated > 0 && estimated < 0.7) {
    findings.push(finding('low-design-authority', 'medium', 'Creative design authority is below the project target.', [`estimated=${estimated}`], 'Move more massing, facade, site, or topology choices into CreativeDesignAgent.', 'CreativeDesignAgent'));
  } else {
    satisfiedChecks.push(satisfied('design-authority-met', 'Creative design authority target is met or not applicable.', [`estimated=${estimated || 'n/a'}`]));
  }
  const concept = blueprint.conceptStudio || {};
  const creativeConcept = blueprint.creativeDesign?.concept_studio || {};
  if (concept.active && concept.selected_concept_id && creativeConcept.selected_concept_id !== concept.selected_concept_id) {
    findings.push(finding('concept-not-reflected', 'high', 'Selected concept is not reflected in CreativeDesign metadata.', [`selected=${concept.selected_concept_id}`, `creative=${creativeConcept.selected_concept_id || 'none'}`], 'Apply selected concept patch before creative design normalization.', 'CreativeDesignAgent'));
  } else if (concept.active) {
    satisfiedChecks.push(satisfied('concept-reflected', 'Selected concept is reflected in creative design.', [concept.selected_concept_id]));
  }
  const audit = blueprint.templateAssimilationAudit || {};
  if (audit.active && Number(audit.percent || 0) < 90) {
    findings.push(finding('template-assimilation-gap', 'medium', 'Template assimilation audit has remaining gaps.', [`percent=${audit.percent}`], 'Follow assimilation audit next-iteration directives.', 'TemplateAssimilationAuditAgent'));
  } else if (audit.active) {
    satisfiedChecks.push(satisfied('template-assimilation-strong', 'Template assimilation is strong.', [`percent=${audit.percent}`]));
  }
  return { id: 'composition', label: 'CompositionCritic', findings, satisfied: satisfiedChecks };
}

function siteCritic(ctx) {
  const { blueprint } = ctx;
  const findings = [];
  const satisfiedChecks = [];
  const zones = blueprint.site?.zones || [];
  const zoneText = zones.join(' ').toLowerCase();
  if ((blueprint.buildSpec?.site?.water_feature || /湖|水|water|lake/.test(ctx.prompt)) && !/water|水/.test(zoneText)) {
    findings.push(finding('missing-water-edge', 'medium', 'Prompt or build spec requests water, but no water-edge site zone is present.', zones, 'Add a water-edge, reflection basin, or deck transition zone.', 'SiteLandscapeAgent'));
  } else {
    satisfiedChecks.push(satisfied('water-edge-covered', 'Water-edge request is covered or not required.', zones));
  }
  if (!zones.some((zone) => /entry|path|approach/.test(String(zone)))) {
    findings.push(finding('missing-entry-approach', 'medium', 'Site plan lacks an entry path or approach sequence.', zones, 'Add entry-path or approach modules that connect terrain to the main door.', 'SiteLandscapeAgent'));
  } else {
    satisfiedChecks.push(satisfied('entry-approach-present', 'Entry approach is represented in site zones.', zones));
  }
  const lawCoverage = blueprint.templateLawCoverage || {};
  if (lawCoverage.active && (lawCoverage.gaps || []).some((gap) => String(gap.domain || gap.id || '').includes('site'))) {
    findings.push(finding('site-law-gap', 'medium', 'Template law coverage reports site gaps.', (lawCoverage.gaps || []).map((gap) => gap.id), 'Apply site law repair directives.', 'TemplateLawAutoRepairAgent'));
  } else if (lawCoverage.active) {
    satisfiedChecks.push(satisfied('site-laws-covered', 'Template site laws have no reported gaps.', [`coverage=${lawCoverage.percent}`]));
  }
  return { id: 'site', label: 'SiteCritic', findings, satisfied: satisfiedChecks };
}

function buildRepairDirectives(findings = []) {
  return findings
    .filter((item) => ['medium', 'high', 'critical'].includes(item.severity))
    .slice(0, 8)
    .map((item) => ({
      id: `repair-${item.id}`,
      priority: item.severity,
      target_agent: item.owner,
      instruction: item.repair_hint,
      evidence: item.evidence,
      source_finding_id: item.id,
      critic_id: item.critic_id
    }));
}

function buildNextIterationDirectives(repairDirectives = []) {
  if (!repairDirectives.length) {
    return [{
      id: 'preserve-current-quality',
      priority: 'maintain',
      instruction: 'Preserve current critic coverage, template quality, concept execution, connectivity, and site composition while varying details.',
      target_agents: ['CreativeDesignAgent', 'SiteLandscapeAgent', 'DecoratorAgent']
    }];
  }
  return repairDirectives.slice(0, 5).map((directive) => ({
    id: `next-${directive.source_finding_id}`,
    priority: directive.priority,
    instruction: directive.instruction,
    target_agents: [directive.target_agent]
  }));
}

function compareFindings(a, b) {
  return severityRank(b.severity) - severityRank(a.severity) || String(a.id).localeCompare(String(b.id));
}

function summaryFor(readiness, score, criticalCount, warningCount) {
  if (readiness === 'blocked') return `Critic Council found ${criticalCount} critical issue(s); score ${score}/100.`;
  if (readiness === 'needs-repair') return `Critic Council found high-priority repair work; score ${score}/100.`;
  if (readiness === 'watch') return `Critic Council found ${warningCount} warning(s) to watch; score ${score}/100.`;
  return `Critic Council found no blocking issues; score ${score}/100.`;
}

function summaryForCritic(id, status, findings, satisfiedChecks) {
  if (status === 'pass') return `${id} passed ${satisfiedChecks.length} check(s).`;
  return `${id} reported ${findings.length} finding(s).`;
}

function validationDecoratorCount(validation = {}) {
  return Number(validation.stats?.semantic?.decoratorPlacements || 0);
}

function normalizeStringArray(value = []) {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null).map((item) => String(item));
  if (value === undefined || value === null || value === '') return [];
  return [String(value)];
}

function normalizeId(value) {
  return String(value || 'item')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}
