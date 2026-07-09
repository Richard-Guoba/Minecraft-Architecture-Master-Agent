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
