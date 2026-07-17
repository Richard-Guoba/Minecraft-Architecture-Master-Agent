const WEIGHTS = Object.freeze({
  popularity: 30,
  reception: 20,
  preview_completeness: 15,
  building_completeness: 15,
  technical_compatibility: 10,
  scarcity: 10
});

const LANE_ORDER = Object.freeze({
  ranked: 0,
  low_evidence: 1,
  unranked: 2,
  deferred_oversized: 3
});

export function rankRightsVerifiedCandidates({ candidates, rightsResults }) {
  const allowed = new Set(
    rightsResults
      .filter((result) => result.rights_verified === true)
      .map((result) => result.candidate_id)
  );
  const verified = candidates.filter((candidate) => allowed.has(candidate.candidate_id));
  const scorable = verified.filter((candidate) => candidate.oversized !== true);
  const rows = verified.map((candidate) => scoreCandidate(candidate, scorable));
  rows.sort((left, right) =>
    LANE_ORDER[left.lane] - LANE_ORDER[right.lane]
      || (right.score ?? Number.NEGATIVE_INFINITY) - (left.score ?? Number.NEGATIVE_INFINITY)
      || right.coverage - left.coverage
      || left.candidate_id.localeCompare(right.candidate_id)
  );
  return Object.freeze(rows.map((row) => deepFreeze(row)));
}

function scoreCandidate(candidate, candidates) {
  if (candidate.oversized === true) {
    return {
      candidate_id: candidate.candidate_id,
      source_id: candidate.source_id,
      candidate: structuredClone(candidate),
      score: null,
      coverage: 0,
      lane: 'deferred_oversized',
      review_eligible: false,
      percentiles: { popularity: null, reception: null },
      duplicate_penalty: null
    };
  }

  const normalized = {
    popularity: percentile(candidate, candidates, 'popularity'),
    reception: percentile(candidate, candidates, 'reception'),
    preview_completeness: candidate.signals.preview_completeness,
    building_completeness: candidate.signals.building_completeness,
    technical_compatibility: candidate.signals.technical_compatibility,
    scarcity: candidate.signals.scarcity
  };
  const present = Object.entries(normalized).filter(([, value]) => value !== null);
  const coverage = present.reduce((sum, [name]) => sum + WEIGHTS[name], 0);
  const weighted = coverage === 0
    ? 0
    : present.reduce((sum, [name, value]) => sum + value * WEIGHTS[name], 0) / coverage * 100;
  const duplicatePenalty = 25 * (candidate.signals.duplicate_risk ?? 0);
  const score = Math.max(0, Math.min(100, weighted - duplicatePenalty));

  return {
    candidate_id: candidate.candidate_id,
    source_id: candidate.source_id,
    candidate: structuredClone(candidate),
    score: coverage === 0 ? null : round(score),
    coverage,
    lane: coverage === 0 ? 'unranked' : coverage < 60 ? 'low_evidence' : 'ranked',
    review_eligible: true,
    percentiles: {
      popularity: normalized.popularity,
      reception: normalized.reception
    },
    duplicate_penalty: round(duplicatePenalty)
  };
}

function percentile(candidate, candidates, signal) {
  const own = candidate.signals[signal];
  if (own === null) return null;
  const source = candidates.filter((item) =>
    item.source_id === candidate.source_id && item.signals[signal] !== null
  );
  const year = candidate.published_at?.slice(0, 4) ?? null;
  const cohort = year === null
    ? []
    : source.filter((item) => item.published_at?.startsWith(year));
  const population = cohort.length >= 10 ? cohort : source;
  if (population.length === 0) return null;
  const below = population.filter((item) => item.signals[signal] < own).length;
  const equal = population.filter((item) => item.signals[signal] === own).length;
  return round((below + equal / 2) / population.length);
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
