const SELECTION_VERSION = 1;

export class CandidateSelectionAgent {
  run(candidates = [], options = {}) {
    const rows = (Array.isArray(candidates) ? candidates : []).map((candidate) => scoreCandidate(candidate));
    const successful = rows.filter((row) => row.ok);
    const selected = successful
      .slice()
      .sort(compareCandidateRows)[0];

    return {
      source: 'local-candidate-selection-agent',
      version: SELECTION_VERSION,
      active: rows.length > 0,
      strategy: 'template-aesthetic-plus-template-law-coverage-plus-assimilation-audit',
      target_score: Number(options.targetScore || 95),
      candidate_count: rows.length,
      successful_count: successful.length,
      failed_count: rows.length - successful.length,
      selected_candidate_id: selected?.candidate_id,
      selected_seed: selected?.seed,
      selected_round: selected?.round,
      selected_index: selected?.index,
      selected_template_score: selected?.template_score || 0,
      selected_law_coverage_score: selected?.law_coverage_score || 0,
      selected_assimilation_score: selected?.assimilation_score || 0,
      selected_selection_score: selected?.selection_score || 0,
      selected_grade: selected?.grade || 'none',
      met_target: selected ? targetMet(selected, options) : false,
      reason: selected ? selectionReason(selected, rows) : 'no successful candidate',
      candidates: rows.sort((a, b) => a.round - b.round || a.index - b.index),
      ranking: successful.slice().sort(compareCandidateRows).map((row, order) => ({
        rank: order + 1,
        candidate_id: row.candidate_id,
        seed: row.seed,
        round: row.round,
        index: row.index,
        template_score: row.template_score,
        law_coverage_score: row.law_coverage_score,
        law_coverage_grade: row.law_coverage_grade,
        assimilation_score: row.assimilation_score,
        assimilation_grade: row.assimilation_grade,
        selection_score: row.selection_score,
        grade: row.grade,
        gap_ids: row.gap_ids,
        output_dir: row.output_dir
      })),
      next_iteration_directives: selected?.next_iteration_directives || [],
      regeneration_prompt_addendum: selected?.regeneration_prompt_addendum || ''
    };
  }
}

function scoreCandidate(candidate = {}) {
  const result = candidate.result || {};
  const blueprint = result.blueprint || candidate.blueprint || {};
  const review = blueprint.templateAestheticReview || candidate.templateAestheticReview || {};
  const lawCoverage = blueprint.templateLawCoverage || candidate.templateLawCoverage || {};
  const assimilationAudit = blueprint.templateAssimilationAudit || candidate.templateAssimilationAudit || {};
  const validationOk = candidate.ok !== false && (result.validation?.ok ?? candidate.validation?.ok ?? true);
  const metrics = review.metrics || {};
  const gaps = Array.isArray(review.gaps) ? review.gaps : [];
  const highGapCount = gaps.filter((gap) => gap.severity === 'high').length;
  const mediumGapCount = gaps.filter((gap) => gap.severity === 'medium').length;
  const lowGapCount = gaps.filter((gap) => gap.severity === 'low').length;
  const templateScore = review.active ? Number(review.score || 0) : 0;
  const lawCoverageActive = Boolean(lawCoverage.active);
  const lawCoverageScore = lawCoverageActive ? Number(lawCoverage.percent ?? lawCoverage.score ?? 0) : 0;
  const assimilationActive = Boolean(assimilationAudit.active);
  const assimilationScore = assimilationActive ? Number(assimilationAudit.percent ?? assimilationAudit.score ?? 0) : 0;
  const tieBreakBonus = Math.min(1.5, Number(metrics.template_interior_scene_placement_count || 0) / 80) +
    Math.min(1.5, Number(metrics.template_site_module_role_count || 0) / 18) +
    Math.min(1, Number(metrics.template_site_scene_count || 0) / 5) +
    (lawCoverageActive ? Math.min(1.5, Number(lawCoverage.metrics?.design_law_placement_count || metrics.template_design_law_placement_count || 0) / 28) : 0);
  const baseScore = assimilationActive
    ? templateScore * 0.62 + (lawCoverageActive ? lawCoverageScore * 0.16 : templateScore * 0.16) + assimilationScore * 0.22
    : (lawCoverageActive ? templateScore * 0.82 + lawCoverageScore * 0.18 : templateScore);
  const gapPenalty = highGapCount * 8 + mediumGapCount * 3 + lowGapCount * 0.6;
  const lawGapPenalty = lawCoverageActive
    ? Number(lawCoverage.missing_count || 0) * 3 + Number(lawCoverage.partial_count || 0) * 0.8
    : 0;
  const auditGapPenalty = assimilationActive
    ? Number((assimilationAudit.gaps || []).filter((gap) => gap.severity === 'high').length || 0) * 4 +
      Number((assimilationAudit.gaps || []).filter((gap) => gap.severity === 'medium').length || 0) * 1.5
    : 0;
  const failurePenalty = validationOk ? 0 : 80;
  const selectionScore = round(baseScore + tieBreakBonus - gapPenalty - lawGapPenalty - auditGapPenalty - failurePenalty);

  return {
    candidate_id: candidate.id || `r${candidate.round || 1}-c${candidate.index || 1}-seed-${candidate.seed ?? 'unknown'}`,
    ok: Boolean(validationOk && review.active !== false && !candidate.error),
    round: Number(candidate.round || 1),
    index: Number(candidate.index || 1),
    seed: candidate.seed ?? result.seed ?? blueprint.seed,
    seed_source: result.seedSource || blueprint.seedSource || candidate.seedSource || 'candidate',
    prompt: candidate.prompt || result.prompt || blueprint.prompt || '',
    output_dir: result.outputDir || candidate.outputDir,
    report: result.artifacts?.report || candidate.artifacts?.report,
    preview: result.artifacts?.previewHtml || candidate.artifacts?.previewHtml,
    datapack_dir: result.artifacts?.datapackDir || candidate.artifacts?.datapackDir,
    template_score: round(templateScore),
    law_coverage_active: lawCoverageActive,
    law_coverage_score: round(lawCoverageScore),
    law_coverage_grade: lawCoverage.grade || 'not-applicable',
    law_coverage_gap_count: (lawCoverage.gaps || []).length,
    law_coverage_gap_ids: (lawCoverage.gaps || []).map((gap) => gap.id),
    assimilation_active: assimilationActive,
    assimilation_score: round(assimilationScore),
    assimilation_grade: assimilationAudit.grade || 'not-applicable',
    assimilation_gap_count: (assimilationAudit.gaps || []).length,
    assimilation_gap_ids: (assimilationAudit.gaps || []).map((gap) => gap.id),
    selection_score: selectionScore,
    grade: review.grade || 'none',
    readiness: review.readiness || 'unknown',
    gap_count: gaps.length,
    high_gap_count: highGapCount,
    medium_gap_count: mediumGapCount,
    low_gap_count: lowGapCount,
    gap_ids: gaps.map((gap) => gap.id),
    top_gap_labels: gaps.slice(0, 3).map((gap) => gap.label),
    strengths: (review.strengths || []).slice(0, 5).map((item) => item.id),
    next_iteration_directives: review.next_iteration_directives || [],
    regeneration_prompt_addendum: review.regeneration_prompt_addendum || '',
    metrics: {
      template_space_plan_active: Boolean(metrics.template_space_plan_active),
      template_room_experience_count: Number(metrics.template_room_experience_count || 0),
      template_interior_scene_count: Number(metrics.template_interior_scene_count || 0),
      template_site_scene_count: Number(metrics.template_site_scene_count || 0),
      template_site_module_role_count: Number(metrics.template_site_module_role_count || 0),
      template_site_module_cell_count: Number(metrics.template_site_module_cell_count || 0),
      template_experience_placement_count: Number(metrics.template_experience_placement_count || 0),
      template_interior_scene_placement_count: Number(metrics.template_interior_scene_placement_count || 0),
      template_law_coverage_percent: Number(metrics.template_law_coverage_percent || lawCoverageScore || 0),
      template_design_law_placement_count: Number(metrics.template_design_law_placement_count || lawCoverage.metrics?.design_law_placement_count || 0),
      template_assimilation_percent: assimilationScore
    },
    error: candidate.error ? String(candidate.error.message || candidate.error) : undefined
  };
}

function compareCandidateRows(a, b) {
  return Number(b.ok) - Number(a.ok) ||
    Number(b.selection_score || 0) - Number(a.selection_score || 0) ||
    Number(b.template_score || 0) - Number(a.template_score || 0) ||
    Number(b.assimilation_score || 0) - Number(a.assimilation_score || 0) ||
    Number(b.law_coverage_score || 0) - Number(a.law_coverage_score || 0) ||
    Number(a.high_gap_count || 0) - Number(b.high_gap_count || 0) ||
    Number(a.medium_gap_count || 0) - Number(b.medium_gap_count || 0) ||
    Number(b.metrics?.template_site_module_cell_count || 0) - Number(a.metrics?.template_site_module_cell_count || 0) ||
    Number(a.index || 0) - Number(b.index || 0);
}

function selectionReason(selected, rows) {
  const competitors = rows.filter((row) => row.candidate_id !== selected.candidate_id && row.ok);
  const nearest = competitors.sort(compareCandidateRows)[0];
  if (!nearest) {
    return `选择 ${selected.candidate_id}，它是唯一成功候选，模板审美分 ${selected.template_score}/100，吸收审计 ${selected.assimilation_score || 0}%。`;
  }
  if (Number(selected.selection_score || 0) === Number(nearest.selection_score || 0)) {
    return `选择 ${selected.candidate_id}，模板审美分 ${selected.template_score}/100，法则覆盖 ${selected.law_coverage_score || 0}%，吸收审计 ${selected.assimilation_score || 0}%，择优分 ${selected.selection_score}；它与 ${nearest.candidate_id} 同分，按更早轮次和候选顺序作为稳定选择。`;
  }
  return `选择 ${selected.candidate_id}，模板审美分 ${selected.template_score}/100，法则覆盖 ${selected.law_coverage_score || 0}%，吸收审计 ${selected.assimilation_score || 0}%，择优分 ${selected.selection_score}，优于下一候选 ${nearest.candidate_id} 的 ${nearest.selection_score}。`;
}

function targetMet(selected, options = {}) {
  const target = Number(options.targetScore || 95);
  const templateMet = Number(selected.template_score || 0) >= target;
  const auditMet = !selected.assimilation_active || Number(selected.assimilation_score || 0) >= Math.max(80, target - 8);
  if (!selected.law_coverage_active) return templateMet;
  return templateMet && auditMet && Number(selected.law_coverage_score || 0) >= Math.max(75, target - 10);
}

function round(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}
