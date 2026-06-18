import test from 'node:test';
import assert from 'node:assert/strict';
import { CandidateSelectionAgent } from '../src/construction/agents/candidateSelectionAgent.js';

test('CandidateSelectionAgent selects the strongest template aesthetic candidate', () => {
  const selection = new CandidateSelectionAgent().run([
    candidate('a', 81, [{ id: 'site-scenes', severity: 'medium', label: '场地园林场景' }], { siteRoles: 8 }),
    candidate('b', 92, [], { siteRoles: 24, interiorPlacements: 60 }),
    candidate('c', 92, [{ id: 'whole-composition', severity: 'low', label: '整体构图落地' }], { siteRoles: 24, interiorPlacements: 60 })
  ], { targetScore: 90 });

  assert.equal(selection.source, 'local-candidate-selection-agent');
  assert.equal(selection.selected_candidate_id, 'b');
  assert.equal(selection.selected_template_score, 92);
  assert.equal(selection.met_target, true);
  assert.equal(selection.ranking[0].candidate_id, 'b');
  assert.ok(selection.reason.includes('b'));
});

test('CandidateSelectionAgent uses template law coverage when available', () => {
  const selection = new CandidateSelectionAgent().run([
    candidate('a', 93, [], { siteRoles: 24, interiorPlacements: 60, lawCoverage: 62, lawGaps: ['waterfront-threshold', 'room-identity-stack'] }),
    candidate('b', 89, [], { siteRoles: 22, interiorPlacements: 55, lawCoverage: 96, lawPlacements: 34 })
  ], { targetScore: 88 });

  assert.equal(selection.selected_candidate_id, 'b');
  assert.equal(selection.selected_law_coverage_score, 96);
  assert.equal(selection.ranking[0].law_coverage_score, 96);
  assert.ok(selection.reason.includes('法则覆盖 96%'));
});

test('CandidateSelectionAgent uses template assimilation audit when available', () => {
  const selection = new CandidateSelectionAgent().run([
    candidate('a', 95, [], { siteRoles: 24, interiorPlacements: 60, lawCoverage: 96, lawPlacements: 34, audit: 72, auditGaps: ['site-terrain-scenes'] }),
    candidate('b', 91, [], { siteRoles: 22, interiorPlacements: 55, lawCoverage: 94, lawPlacements: 30, audit: 98 })
  ], { targetScore: 90 });

  assert.equal(selection.selected_candidate_id, 'b');
  assert.equal(selection.selected_assimilation_score, 98);
  assert.equal(selection.ranking[0].assimilation_score, 98);
  assert.ok(selection.reason.includes('吸收审计 98%'));
});

function candidate(id, score, gaps = [], metrics = {}) {
  const lawCoverageActive = metrics.lawCoverage !== undefined;
  const auditActive = metrics.audit !== undefined;
  return {
    id,
    ok: true,
    seed: Number(id.charCodeAt(0)),
    round: 1,
    index: Number(id.charCodeAt(0)) - 96,
    result: {
      validation: { ok: true },
      blueprint: {
        templateLawCoverage: lawCoverageActive ? {
          active: true,
          percent: metrics.lawCoverage,
          grade: metrics.lawCoverage >= 90 ? 'law-excellent' : 'law-partial',
          missing_count: metrics.lawGaps?.length || 0,
          partial_count: 0,
          gaps: (metrics.lawGaps || []).map((gap) => ({ id: gap })),
          metrics: {
            design_law_placement_count: metrics.lawPlacements || 0
          }
        } : undefined,
        templateAssimilationAudit: auditActive ? {
          active: true,
          percent: metrics.audit,
          score: metrics.audit,
          grade: metrics.audit >= 96 ? 'top-tier-closed-loop' : 'usable',
          gaps: (metrics.auditGaps || []).map((gap) => ({ id: gap, severity: 'high' }))
        } : undefined,
        templateAestheticReview: {
          active: true,
          score,
          grade: score >= 90 ? '优秀' : '还行',
          gaps,
          strengths: [],
          metrics: {
            template_site_module_role_count: metrics.siteRoles || 0,
            template_site_scene_count: metrics.siteScenes || 5,
            template_interior_scene_placement_count: metrics.interiorPlacments || metrics.interiorPlacements || 40,
            template_law_coverage_percent: metrics.lawCoverage || 0,
            template_design_law_placement_count: metrics.lawPlacements || 0
          },
          next_iteration_directives: []
        }
      },
      artifacts: {}
    }
  };
}
