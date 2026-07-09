# Stage 4 Critic Council Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Stage 4 Critic Council so every normal run can produce a deterministic multi-critic review, repair directives, compact blueprint metadata, and user-facing report artifacts.

**Architecture:** Add one focused `CriticCouncilAgent` that reads the final blueprint and existing validation/scorecard/template/concept signals. Wire it into `runConstructionWorkflow` after final validation and scoring, export `critic_council.json`, add a Stage 4 report section, expose `--no-critics`, and update README/GitHub Pages roadmap after verification.

**Tech Stack:** Node.js ESM, built-in `node:test`, existing filesystem helpers, existing construction workflow/pipeline/CLI, static HTML under `docs/`.

## Global Constraints

- Minecraft target remains Java 1.21 / 1.21.1 datapacks with `pack_format: 48`.
- Normal generation must remain Node.js only; Python is not required.
- Mock mode must stay deterministic and API-key-free.
- Critic Council must not mutate the voxel grid, blueprint geometry, or datapack commands in Stage 4 MVP.
- Default generation should run critics unless `--no-critics` or `critics: false` is passed.
- Do not train or call neural networks in Stage 4.
- Do not add a browser UI or interactive concept/critic selection.
- Use TDD for behavior changes: write failing tests first, run red, implement, run green.
- Do not commit generated `out/`, `.tmp/`, local credentials, or unrelated files.

---

## File Structure

- Create `src/construction/agents/criticCouncilAgent.js`
  - Owns Stage 4 critic data model, severity/readiness scoring, six critic tracks, aggregation, repair directives, and next-iteration directives.
- Create `test/criticCouncilAgent.test.js`
  - Unit tests for deterministic structure, readiness scoring, repair directive creation, and clean-run preserve guidance.
- Create `test/criticPipeline.test.js`
  - Integration tests for default artifact export and `critics: false` suppression.
- Modify `src/construction/workflow.js`
  - Import and run `CriticCouncilAgent`, attach compact metadata, export JSON, render report section, and return `criticCouncil`.
- Modify `src/pipeline.js`
  - Add `critics = true` option and pass it through single-run and candidate pipelines.
- Modify `src/index.js`
  - Parse `--no-critics`, pass `critics`, update help text and console summary.
- Modify `README.md`
  - Update status, quick start, output artifact list, pipeline overview, and development direction.
- Modify `docs/index.html`
  - Update command examples, metrics, capabilities, and roadmap state.
- Modify `docs/roadmap.md`
  - Add Stage 4 MVP status note under the Stage 4 section.

---

### Task 1: Critic Council Agent

**Files:**
- Create: `src/construction/agents/criticCouncilAgent.js`
- Test: `test/criticCouncilAgent.test.js`

**Interfaces:**
- Consumes: `{ blueprint, validation, architectureScorecard }`
- Produces: `new CriticCouncilAgent().run(context)` returning `{ source, version, active, readiness, overall_score, critics, top_findings, repair_directives, next_iteration_directives, warnings }`
- Exports: `CriticCouncilAgent`, `severityRank`, `readinessForFindings`, `scoreForFindings`

- [ ] **Step 1: Write failing tests for deterministic critic structure**

Add `test/criticCouncilAgent.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CriticCouncilAgent,
  readinessForFindings,
  scoreForFindings,
  severityRank
} from '../src/construction/agents/criticCouncilAgent.js';

test('CriticCouncilAgent returns six deterministic critic tracks for a clean blueprint', () => {
  const council = new CriticCouncilAgent().run(cleanContext());

  assert.equal(council.source, 'stage4-critic-council-v1');
  assert.equal(council.version, 1);
  assert.equal(council.active, true);
  assert.equal(council.critic_count, 6);
  assert.deepEqual(council.critics.map((critic) => critic.id), [
    'buildability',
    'connectivity',
    'habitation',
    'style',
    'composition',
    'site'
  ]);
  assert.equal(council.readiness, 'clear');
  assert.equal(council.critical_count, 0);
  assert.equal(council.warning_count, 0);
  assert.ok(council.overall_score >= 95);
  assert.ok(council.satisfied_count >= 6);
  assert.ok(council.next_iteration_directives.some((item) => item.id === 'preserve-current-quality'));
});

test('CriticCouncilAgent readiness and score follow severity rules', () => {
  const findings = [
    finding('minor-note', 'low'),
    finding('site-gap', 'medium'),
    finding('build-risk', 'high')
  ];

  assert.equal(severityRank('critical') > severityRank('high'), true);
  assert.equal(readinessForFindings(findings), 'needs-repair');
  assert.equal(scoreForFindings(findings), 67);
  assert.equal(readinessForFindings([finding('blocked', 'critical')]), 'blocked');
  assert.equal(scoreForFindings([finding('blocked', 'critical')]), 65);
});

test('CriticCouncilAgent converts important findings into repair directives', () => {
  const context = cleanContext();
  context.blueprint.site.zones = [];
  context.blueprint.site.template_site_scenes = { active: true, readiness: 'weak', scene_count: 0, scene_types: [] };
  context.blueprint.buildSpec.site.water_feature = true;

  const council = new CriticCouncilAgent().run(context);

  assert.equal(council.readiness, 'watch');
  assert.ok(council.top_findings.some((item) => item.id === 'missing-water-edge'));
  assert.ok(council.repair_directives.some((item) => item.id === 'repair-missing-water-edge'));
});

function finding(id, severity) {
  return {
    id,
    severity,
    message: id,
    evidence: [id],
    repair_hint: `repair ${id}`,
    owner: 'TestAgent'
  };
}

function cleanContext() {
  const blueprint = {
    prompt: '建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰',
    buildSpec: {
      typology: 'villa',
      floors: 2,
      roof_style: 'flat',
      facade: { large_glass: true, glazing_ratio: 'high' },
      site: { water_feature: true, patio: true, outdoor_seating: true, planting_beds: true }
    },
    architecture: {
      style: '现代',
      style_family: 'modern',
      typology: 'villa',
      materials: { wall: 'minecraft:white_concrete', glass: 'minecraft:glass' },
      volumes: [{ id: 'main', role: '主体外壳', shape: 'box', boolean_mode: 'union' }]
    },
    topology: {
      nodes: [
        { id: 'entry', type: 'entry', floor: 0 },
        { id: 'living', type: 'living', floor: 0 },
        { id: 'kitchen', type: 'kitchen', floor: 0 },
        { id: 'bedroom', type: 'bedroom', floor: 1 },
        { id: 'stairs', type: 'stairs', floor: 0 }
      ],
      edges: [{ from: 'entry', to: 'living' }, { from: 'living', to: 'kitchen' }, { from: 'living', to: 'stairs' }]
    },
    creativeDesign: {
      signature: 'concept-a-view-courtyard/waterfront-stepped-estate',
      concept_studio: { active: true, selected_concept_id: 'concept-a-view-courtyard' },
      authority: { target_llm_decision_share: 0.7, estimated_llm_decision_share: 0.74 },
      design_axes: { massing_variant: 'waterfront-stepped-estate' },
      topology: { public_core: 'living', split_strategy: 'open-plan-weighted' }
    },
    conceptStudio: {
      active: true,
      selected_concept_id: 'concept-a-view-courtyard',
      selected_archetype: 'view-courtyard'
    },
    materialPalette: { palette: 'stone-concrete-glass', roles: ['wall', 'glass'], block_catalog: { blockCount: 1060 } },
    facade: { window_system: { rhythm: 'corner-window-bands' }, facade_elements: ['view-glass-frame'] },
    roof: { style: 'flat', profile: 'thin-parapet-terrace', elements: [{ kind: 'roof-garden' }] },
    site: {
      mood: 'reflecting-water-edge',
      zones: ['entry-path', 'water-edge', 'patio-transition', 'outdoor-living'],
      template_site_scenes: { active: true, readiness: 'high', scene_count: 3, scene_types: ['water-edge-deck-scene'] }
    },
    opening: { main_entry: { side: 'south' }, engine_hints: { planned_opening_count: 8 } },
    interior: { room_count: 5, room_details: [{ room_id: 'living' }, { room_id: 'bedroom' }], lighting_strategy: 'room-center-and-task-lighting' },
    decorator: { placements: [{ room_id: 'living' }, { room_id: 'bedroom' }] },
    layout: { rooms: [{ id: 'entry' }, { id: 'living' }, { id: 'kitchen' }, { id: 'bedroom' }, { id: 'stairs' }] },
    paths: { mainDoor: { side: 'south' }, openedEdges: [{ from: 'entry', to: 'living' }], stairs: [{ x: 1, y: 1, z: 1 }] },
    operations: [{ kind: 'setblock', at: { x: 0, y: 0, z: 0 }, block: 'minecraft:white_concrete' }],
    bounds: { minX: 0, minY: 0, minZ: 0, maxX: 20, maxY: 12, maxZ: 20 },
    geometry: {
      exporter: { inputCellCount: 1000, naiveOperationCount: 300, operationCount: 120, compressionRatio: 2.5, topModules: [] },
      pathfinder: { openedDoorCount: 5, stairCount: 6 },
      bsp: { roomCount: 5 }
    },
    templateLawCoverage: { active: true, percent: 100, grade: 'law-perfect', gaps: [], repair_directives: [] },
    templateAestheticReview: { active: true, score: 99, max_score: 100, grade: '无可挑剔', gaps: [], next_iteration_directives: [] },
    templateAssimilationAudit: {
      active: true,
      percent: 100,
      grade: 'top-tier-closed-loop',
      readiness: 'top-tier-ready',
      gaps: [],
      stage_progress: { completed_count: 6, total_count: 6 }
    },
    interiorClearanceRepair: { active: true, removed_count: 1, checked_room_count: 5 },
    architectureScorecard: { totalScore: 100, maxScore: 100, grade: 'S', redFlagCount: 0, weakCheckCount: 0 }
  };

  return {
    blueprint,
    validation: {
      ok: true,
      errors: [],
      warnings: [],
      checks: [{ id: 'valid-blocks', ok: true }, { id: 'entry-reachable', ok: true }],
      stats: {
        operationCount: 120,
        bounds: { width: 21, height: 13, depth: 21 },
        circulation: { reachableRoomCount: 5 },
        rooms: { roomCount: 5 },
        semantic: { decoratorPlacements: 2 }
      }
    },
    architectureScorecard: {
      scorecard: { totalScore: 100, maxScore: 100, grade: 'S', dimensions: [] },
      redFlags: [],
      weakChecks: [],
      passedChecks: 115,
      totalChecks: 115
    }
  };
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
node --test test/criticCouncilAgent.test.js
```

Expected: FAIL with module not found for `criticCouncilAgent.js`.

- [ ] **Step 3: Implement `CriticCouncilAgent`**

Create `src/construction/agents/criticCouncilAgent.js` with these exact public exports and structure:

```js
const COUNCIL_VERSION = 1;
const SOURCE = 'stage4-critic-council-v1';

const CRITIC_IDS = [
  'buildability',
  'connectivity',
  'habitation',
  'style',
  'composition',
  'site'
];

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
    const nextIterationDirectives = buildNextIterationDirectives(topFindings, repairDirectives);
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
```

Continue the same file with helper functions:

```js
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

function normalizeFinding(finding = {}) {
  const severity = ['critical', 'high', 'medium', 'low', 'info'].includes(String(finding.severity))
    ? String(finding.severity)
    : 'info';
  return {
    id: normalizeId(finding.id || 'critic-finding'),
    severity,
    message: String(finding.message || finding.id || 'Critic finding'),
    evidence: normalizeStringArray(finding.evidence),
    repair_hint: String(finding.repair_hint || 'Review the related agent output and preserve build validity.'),
    owner: String(finding.owner || 'Workflow')
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
```

Add the six critic functions in the same file:

```js
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
  const { blueprint, scorecard } = ctx;
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
  const placements = blueprint.decorator?.placements?.length || validationDecoratorCount(ctx.validation);
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
```

Finish the helper section:

```js
function buildRepairDirectives(findings = []) {
  return findings
    .filter((finding) => ['medium', 'high', 'critical'].includes(finding.severity))
    .slice(0, 8)
    .map((finding) => ({
      id: `repair-${finding.id}`,
      priority: finding.severity,
      target_agent: finding.owner,
      instruction: finding.repair_hint,
      evidence: finding.evidence,
      source_finding_id: finding.id,
      critic_id: finding.critic_id
    }));
}

function buildNextIterationDirectives(findings = [], repairDirectives = []) {
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
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run:

```powershell
node --test test/criticCouncilAgent.test.js
```

Expected: PASS with 3 tests.

- [ ] **Step 5: Commit Task 1**

```powershell
git add src/construction/agents/criticCouncilAgent.js test/criticCouncilAgent.test.js
git commit -m "feat: add critic council agent"
```

---

### Task 2: Workflow Artifacts And Report Integration

**Files:**
- Modify: `src/construction/workflow.js`
- Test: `test/criticPipeline.test.js`

**Interfaces:**
- Consumes: `CriticCouncilAgent.run({ blueprint, validation, architectureScorecard })`
- Produces: `result.criticCouncil`, `blueprint.criticCouncil`, `artifacts.criticCouncil`, `critic_council.json`, and `## Stage 4 Critic Council` report section.

- [ ] **Step 1: Write failing integration tests**

Create `test/criticPipeline.test.js`:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../src/pipeline.js';

test('pipeline writes critic council artifacts and blueprint metadata by default', async () => {
  const root = path.resolve('.tmp', `architect-critic-pipeline-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 7101,
      concepts: 3,
      conceptStrategy: 'select'
    });

    assert.equal(result.validation.ok, true);
    assert.equal(result.criticCouncil.active, true);
    assert.equal(result.criticCouncil.critic_count, 6);
    assert.equal(result.blueprint.criticCouncil.active, true);
    assert.equal(result.blueprint.criticCouncil.readiness, result.criticCouncil.readiness);
    assert.ok(result.artifacts.criticCouncil.endsWith('critic_council.json'));

    const criticJson = JSON.parse(await fs.readFile(result.artifacts.criticCouncil, 'utf8'));
    const runReport = await fs.readFile(result.artifacts.report, 'utf8');
    const blueprintJson = JSON.parse(await fs.readFile(result.artifacts.blueprint, 'utf8'));
    assert.equal(criticJson.source, 'stage4-critic-council-v1');
    assert.equal(criticJson.critics.length, 6);
    assert.equal(blueprintJson.criticCouncil.active, true);
    assert.match(runReport, /## Stage 4 Critic Council/);
    assert.match(runReport, /Readiness:/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('pipeline suppresses critic council artifacts when critics are disabled', async () => {
  const root = path.resolve('.tmp', `architect-critic-off-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个欧式大房子',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 1,
      critics: false
    });

    assert.equal(result.criticCouncil, undefined);
    assert.equal(result.blueprint.criticCouncil, undefined);
    assert.equal(result.artifacts.criticCouncil, undefined);
    const runReport = await fs.readFile(result.artifacts.report, 'utf8');
    assert.doesNotMatch(runReport, /## Stage 4 Critic Council/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
node --test test/criticPipeline.test.js
```

Expected: FAIL because `result.criticCouncil` is undefined.

- [ ] **Step 3: Import and run the council in `workflow.js`**

At the top of `src/construction/workflow.js`, add:

```js
import { CriticCouncilAgent } from './agents/criticCouncilAgent.js';
```

In `runConstructionWorkflow` parameters, add:

```js
  critics = true,
```

After:

```js
  blueprint.architectureScorecard = compactArchitectureScorecard(architectureScorecard);
```

insert:

```js
  const criticCouncil = critics
    ? new CriticCouncilAgent().run({ blueprint, validation, architectureScorecard })
    : undefined;
  if (criticCouncil?.active) {
    blueprint.criticCouncil = compactCriticCouncil(criticCouncil);
  }
```

In the `exportArtifacts` call, add:

```js
    criticCouncil,
```

In the returned result object after `architectureScorecard,`, add:

```js
    ...(criticCouncil?.active ? { criticCouncil } : {}),
```

- [ ] **Step 4: Export `critic_council.json`**

Change `exportArtifacts` signature:

```js
async function exportArtifacts({ outputDir, blueprint, conceptStudio, criticCouncil, architectureScorecard, validation, prompt, mcVersion, autoBuild, minecraftDir, world, datapacksDir }) {
```

After concept paths, add:

```js
  const criticCouncilPath = criticCouncil?.active ? path.join(outputDir, 'critic_council.json') : undefined;
```

After concept writes, add:

```js
  if (criticCouncilPath) await writeJson(criticCouncilPath, serializeCriticCouncil(criticCouncil));
```

In returned artifacts, add:

```js
    ...(criticCouncilPath ? { criticCouncil: criticCouncilPath } : {}),
```

- [ ] **Step 5: Add report and compact helpers**

Before `serializeConceptStudio`, add:

```js
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
```

In `renderReport`, after:

```js
  const conceptStudioSection = renderConceptStudioSection(blueprint);
```

add:

```js
  const criticCouncilSection = renderCriticCouncilSection(blueprint);
```

Replace:

```js
${conceptStudioSection}
## 结构框架 JSON
```

with:

```js
${conceptStudioSection}${criticCouncilSection}
## 结构框架 JSON
```

- [ ] **Step 6: Run integration tests to verify they pass**

Run:

```powershell
node --test test/criticCouncilAgent.test.js test/criticPipeline.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```powershell
git add src/construction/workflow.js test/criticPipeline.test.js
git commit -m "feat: export critic council artifacts"
```

---

### Task 3: Pipeline And CLI Switch

**Files:**
- Modify: `src/pipeline.js`
- Modify: `src/index.js`
- Test: `test/criticPipeline.test.js`

**Interfaces:**
- Consumes: `critics` boolean from CLI and `runPipeline`
- Produces: default-on critics for single and candidate runs; `--no-critics` disables them.

- [ ] **Step 1: Extend failing integration test for candidate pass-through**

Append to `test/criticPipeline.test.js`:

```js
test('candidate pipeline passes critic options into candidate runs', async () => {
  const root = path.resolve('.tmp', `architect-critic-candidate-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个湖边现代别墅，带大玻璃、水边平台和前景花园',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 8111,
      candidates: 2,
      candidateTargetScore: 100,
      candidateForceRounds: true,
      critics: false
    });

    assert.equal(result.candidateSelection.active, true);
    assert.equal(result.criticCouncil, undefined);
    assert.equal(result.blueprint.criticCouncil, undefined);
    assert.equal(result.artifacts.criticCouncil, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test test/criticPipeline.test.js
```

Expected: FAIL because candidate runs still produce critic council output when `critics: false` is requested.

- [ ] **Step 3: Pass `critics` through `pipeline.js`**

In `runPipeline` parameter list, add:

```js
  critics = true,
```

When calling `runCandidatePipeline`, add:

```js
      critics
```

When calling `runConstructionWorkflow`, add:

```js
    critics
```

In `runCandidatePipeline` parameter list, add:

```js
  critics = true,
```

Inside candidate `runConstructionWorkflow`, add:

```js
          critics
```

- [ ] **Step 4: Add CLI parsing and help**

In `src/index.js` default options, add:

```js
    critics: true,
```

In `parseArgs`, before `--minecraft-dir`, add:

```js
    } else if (arg === '--no-critics') {
      options.critics = false;
```

In `printHelp`, after concept strategy, add:

```text
  --no-critics              Disable Stage 4 Critic Council report and critic_council.json.
```

In the `runPipeline` call, add:

```js
    critics: options.critics,
```

After the Concept Studio console block, add:

```js
  if (result.criticCouncil) {
    console.log(`Critic Council: ${result.criticCouncil.readiness} / ${result.criticCouncil.overall_score}/100 / ${result.criticCouncil.warning_count} warnings`);
    console.log(`批评报告: ${result.artifacts.criticCouncil}`);
  }
```

- [ ] **Step 5: Run focused tests and CLI help check**

Run:

```powershell
node --test test/criticPipeline.test.js test/conceptPipeline.test.js
node src/index.js --help | Select-String -Pattern "no-critics|concepts|concept-strategy"
```

Expected:

- Tests PASS.
- Help output includes `--no-critics`, `--concepts`, and `--concept-strategy`.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/pipeline.js src/index.js test/criticPipeline.test.js
git commit -m "feat: add critic council cli switch"
```

---

### Task 4: README And GitHub Pages Status Update

**Files:**
- Modify: `README.md`
- Modify: `docs/index.html`
- Modify: `docs/roadmap.md`

**Interfaces:**
- Consumes: implemented Stage 3 and Stage 4 status.
- Produces: docs that show Stage 3 complete, Stage 4 Critic Council implemented/current, and Stage 5 as next neural stage.

- [ ] **Step 1: Update README status and examples**

In `README.md`, replace the current status block:

```markdown
- Knowledge layer: Template Knowledge Base v2 with reviewed case cards and explainable retrieval
- Benchmark readiness: 10/10 baseline prompts generated, average scorecard 100/100, red flags 0, repair priority queue empty
- Next major stage: Stage 3 Concept Studio, where one prompt produces multiple explainable design concepts before construction
```

with:

```markdown
- Knowledge layer: Template Knowledge Base v2 with reviewed case cards, explainable retrieval, and design laws
- Concept layer: Stage 3 Concept Studio can generate, select, or fuse multiple explainable design concepts before construction
- Critique layer: Stage 4 Critic Council summarizes buildability, connectivity, habitation, style, composition, and site findings
- Benchmark readiness: 10/10 baseline prompts generated, average scorecard 100/100, red flags 0, repair priority queue empty
- Next major stage: Stage 5 neural retrieval and automatic tagging
```

Replace the quick-start command:

```powershell
npm start -- --mode mock "建一个湖边现代两层别墅，带大玻璃、水边平台和前景花园"
```

with:

```powershell
npm start -- --mode mock --concepts 3 "建一个湖边现代两层别墅，带大玻璃、水边平台和前景花园"
```

In the output artifact list, add:

```text
concept_studio.json
concept_studio_report.md
critic_council.json
```

In the pipeline list, insert:

```text
-> ConceptStudioAgent: multi-concept design options, selection, or conservative fusion
```

before CreativeDesignAgent, and change the QA line to:

```text
-> QA/Repair/Optimizer/Evaluation/Critic Council: validation, repair hints, command compression, scorecard, multi-critic review
```

In Main Commands, add:

```powershell
npm start -- --mode mock --seed 7101 --concepts 3 --concept-strategy fuse "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
npm start -- --mode mock --no-critics "建一个欧式大房子"
```

In Development Direction, replace items 3-5 with:

```markdown
3. Preserve Stage 3 Concept Studio as the concept-first planning layer.
4. Use Stage 4 Critic Council findings to guide repair priorities.
5. Use neural models later for retrieval, tagging, parameter prediction, and local semantic-voxel patch completion.
```

- [ ] **Step 2: Update GitHub Pages roadmap and metrics**

In `docs/index.html`, update the first terminal command to include concepts:

```html
<pre class="terminal"><code><span>$</span> npm start -- --mode mock --concepts 3 "建一个湖边现代两层别墅，带大玻璃、水边平台和前景花园"</code></pre>
```

Update metric cards:

```html
<article>
  <span>Latest Stage</span>
  <strong>Stage 4 Critic Council</strong>
  <em>default-on review layer</em>
</article>
<article>
  <span>Tests Passing</span>
  <strong>update after final npm test</strong>
  <em>node --test</em>
</article>
```

During implementation, replace `update after final npm test` with the final passing count from `npm test`.

In Current Capabilities, add these list items:

```html
<li><strong>Concept Studio</strong><span>Generates, ranks, selects, or fuses multiple explainable concepts before construction.</span></li>
<li><strong>Critic Council</strong><span>Buildability, connectivity, habitation, style, composition, and site critics produce repair guidance.</span></li>
```

Update the roadmap list:

```html
<li class="done"><span></span><div><strong>Stage 1 - Baseline Readiness</strong><em>Completed</em><p>Stable benchmark floor, scorecard, and repair closure evidence.</p></div></li>
<li class="done"><span></span><div><strong>Stage 2 - Template KB v2</strong><em>Completed</em><p>Reviewed knowledge units, retrieval explanations, and design laws.</p></div></li>
<li class="done"><span></span><div><strong>Stage 3 - Concept Studio</strong><em>Completed</em><p>Generate, compare, select, or fuse explainable design concepts per prompt.</p></div></li>
<li class="done"><span></span><div><strong>Stage 4 - Critic Council</strong><em>Completed</em><p>Separate critics summarize buildability, habitation, style, composition, connectivity, and site repair guidance.</p></div></li>
<li class="active"><span></span><div><strong>Stage 5 - Neural Retrieval</strong><em>Next</em><p>Use neural models for retrieval, tagging, and parameter prediction without replacing the deterministic builder.</p></div></li>
```

- [ ] **Step 3: Add roadmap status note**

In `docs/roadmap.md`, under `### Stage 4：Critic Council 和自动修复闭环`, after the success criteria block, add:

```markdown
当前 MVP 状态：Stage 4 首版以默认开启的 Critic Council 落地。它汇总 buildability、connectivity、habitation、style、composition 和 site 六类 critic，输出 `critic_council.json`、run report 小节、compact blueprint metadata、repair directives 和 next-iteration directives。首版不做无限重建循环，后续可以把高优先级 repair directives 接入候选选择或多轮自动修复。
```

- [ ] **Step 4: Run text checks**

Run:

```powershell
Select-String -Path README.md,docs/index.html,docs/roadmap.md -Pattern "Stage 3|Stage 4|Critic Council|no-critics|critic_council"
```

Expected: output shows Stage 3 complete/Concept Studio, Stage 4/Critic Council, `--no-critics`, and `critic_council.json`.

- [ ] **Step 5: Commit Task 4**

```powershell
git add README.md docs/index.html docs/roadmap.md
git commit -m "docs: update roadmap for critic council"
```

---

### Task 5: Final Verification And Smoke Tests

**Files:**
- No source changes unless verification exposes a bug.

**Interfaces:**
- Confirms all tasks are integrated and Stage 3 still works with Stage 4 enabled.

- [ ] **Step 1: Run focused Stage 4 and Stage 3 tests**

Run:

```powershell
node --test test/criticCouncilAgent.test.js test/criticPipeline.test.js test/conceptStudioAgent.test.js test/conceptSelectionAgent.test.js test/conceptFusionAgent.test.js test/conceptCreativeDesign.test.js test/conceptPipeline.test.js
```

Expected: PASS with all Stage 3 and Stage 4 tests.

- [ ] **Step 2: Run full test suite**

Run:

```powershell
npm test
```

Expected: PASS. Record the final test count and update `docs/index.html` metric if it changed from the value inserted in Task 4.

- [ ] **Step 3: Run default Stage 4 smoke with Stage 3 enabled**

Run:

```powershell
npm start -- --mode mock --seed 7101 --concepts 3 "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
```

Expected:

- CLI prints `Concept Studio: ...`
- CLI prints `Critic Council: ...`
- Output directory contains `critic_council.json`
- `run_report.md` contains `## Stage 4 Critic Council`

- [ ] **Step 4: Inspect latest critic artifact**

Run:

```powershell
$latest = Get-ChildItem out -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$critic = Get-Content -Raw (Join-Path $latest.FullName 'critic_council.json') | ConvertFrom-Json
[PSCustomObject]@{
  source = $critic.source
  readiness = $critic.readiness
  score = $critic.overall_score
  critics = $critic.critic_count
  critical = $critic.critical_count
  warnings = $critic.warning_count
} | ConvertTo-Json
Get-Content (Join-Path $latest.FullName 'run_report.md') | Select-String -Pattern 'Stage 4 Critic Council' -Context 0,8
```

Expected:

- `source` is `stage4-critic-council-v1`
- `critics` is `6`
- report section is present

- [ ] **Step 5: Run disabled-critics smoke**

Run:

```powershell
npm start -- --mode mock --seed 7101 --no-critics "建一个欧式大房子"
```

Expected:

- CLI does not print `Critic Council:`
- latest output directory does not contain `critic_council.json`
- `run_report.md` does not contain `## Stage 4 Critic Council`

- [ ] **Step 6: Update docs metric if final test count changed**

If `npm test` reports a different number than the value in `docs/index.html`, edit the metric to:

```html
<strong>227 / 227</strong>
```

Use the actual count reported by `npm test`; `227 / 227` is the expected count if only the Stage 4 tests from this plan are added.

Then run:

```powershell
Select-String -Path docs/index.html -Pattern "Tests Passing|227 / 227"
```

Expected: docs display the actual final pass count.

- [ ] **Step 7: Final git status and commit any verification doc correction**

Run:

```powershell
git status --short
```

If only `docs/index.html` changed from the final test count correction:

```powershell
git add docs/index.html
git commit -m "docs: record final critic council test count"
```

Expected: no uncommitted source changes remain except ignored `out/` artifacts.

- [ ] **Step 8: Completion summary**

Collect:

- branch name
- commit list
- focused test result
- full `npm test` result
- default smoke output directory
- disabled smoke output directory
- artifact names verified

Use the finishing-a-development-branch skill before offering merge/PR options.

---

## Self-Review Notes

- Spec coverage: Tasks cover agent, workflow artifacts, report section, pipeline/CLI switch, README/GitHub Pages, and verification.
- Placeholder scan: No unfinished placeholders or unspecified implementation steps remain.
- Type consistency: `criticCouncil`, `critic_council.json`, `CriticCouncilAgent.run`, `compactCriticCouncil`, and `renderCriticCouncilSection` names are consistent across tasks.
