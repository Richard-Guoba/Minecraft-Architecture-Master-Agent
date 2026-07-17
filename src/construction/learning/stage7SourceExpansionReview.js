import { SourceExpansionContractError } from './stage7SourceExpansionContracts.js';

export function selectDiscoveryWave(ranked, { limit = 30, perSource = 5 } = {}) {
  const counts = new Map();
  const selected = [];
  for (const row of ranked) {
    if (row.review_eligible !== true) continue;
    const count = counts.get(row.source_id) || 0;
    if (count >= perSource) continue;
    selected.push(row);
    counts.set(row.source_id, count + 1);
    if (selected.length === limit) break;
  }
  return Object.freeze(selected);
}

export function selectYieldWave({
  ranked,
  discoveryCards,
  discoveryDecisions,
  limit = 20,
  totalPerSource = 15
}) {
  const accepted = applyReviewDecisions({
    cards: discoveryCards,
    decisions: discoveryDecisions,
    wave: 'discovery'
  }).filter((item) => item.state === 'human_accepted');
  const scoreById = new Map(discoveryCards.map((row) => [row.candidate_id, row.score]));
  const sourceStats = new Map();
  for (const item of accepted) {
    const current = sourceStats.get(item.source_id) || { accepted: 0, scoreTotal: 0 };
    current.accepted += 1;
    current.scoreTotal += scoreById.get(item.candidate_id) ?? 0;
    sourceStats.set(item.source_id, current);
  }
  const sourceOrder = [...sourceStats.entries()]
    .sort((left, right) =>
      right[1].accepted - left[1].accepted
        || right[1].scoreTotal / right[1].accepted - left[1].scoreTotal / left[1].accepted
        || left[0].localeCompare(right[0])
    )
    .map(([sourceId]) => sourceId);
  const priorIds = new Set(discoveryCards.map((row) => row.candidate_id));
  const totalCounts = countBySource(discoveryCards);
  const selected = [];
  for (const sourceId of sourceOrder) {
    const available = ranked.filter((row) =>
      row.review_eligible === true
        && row.source_id === sourceId
        && !priorIds.has(row.candidate_id)
    );
    for (const row of available) {
      if ((totalCounts.get(sourceId) || 0) >= totalPerSource) break;
      selected.push(row);
      totalCounts.set(sourceId, (totalCounts.get(sourceId) || 0) + 1);
      if (selected.length === limit) return Object.freeze(selected);
    }
  }
  return Object.freeze(selected);
}

export function applyReviewDecisions({ cards, decisions, wave }) {
  const cardIds = new Set(cards.map((card) => card.candidate_id));
  const latest = latestDecisionMap(decisions, wave);
  for (const candidateId of latest.keys()) {
    if (!cardIds.has(candidateId)) {
      throw new SourceExpansionContractError('DECISION_OUTSIDE_WAVE', candidateId);
    }
  }
  return Object.freeze(cards.map((card) => {
    const decision = latest.get(card.candidate_id) || null;
    return Object.freeze({
      candidate_id: card.candidate_id,
      source_id: card.source_id,
      decision_revision: decision?.revision ?? null,
      decision: decision?.decision ?? 'pending',
      state: decision?.decision === 'accept'
        ? 'human_accepted'
        : decision?.decision === 'reject'
          ? 'rejected'
          : decision?.decision === 'defer'
            ? 'deferred'
            : 'human_review_pending'
    });
  }));
}

export function buildFinalReviewSummary({
  discovery,
  yieldCards,
  discoveryDecisions,
  yieldDecisions
}) {
  const reviewed = Object.freeze([
    ...applyReviewDecisions({
      cards: discovery,
      decisions: discoveryDecisions,
      wave: 'discovery'
    }),
    ...applyReviewDecisions({
      cards: yieldCards,
      decisions: yieldDecisions,
      wave: 'yield'
    })
  ]);
  const accepted = reviewed.filter((item) => item.state === 'human_accepted');
  const acceptedBySource = countBySource(accepted);
  const hasTenFromOneSource = [...acceptedBySource.values()].some((count) => count >= 10);
  return Object.freeze({
    source: 'stage7-source-expansion-metadata-pilot-v1',
    metadata_only: true,
    authorizes_download: false,
    authorizes_training: false,
    discovery_card_count: discovery.length,
    yield_card_count: yieldCards.length,
    accepted_count: accepted.length,
    has_twenty_accepted: accepted.length >= 20,
    has_ten_from_one_source: hasTenFromOneSource,
    ready_for_acquisition_design_review: accepted.length >= 20 && hasTenFromOneSource,
    states: reviewed
  });
}

export function canonicalSourceExpansionJson(value) {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

export function renderSourceExpansionCardsMarkdown({ wave, cards, rightsByCandidate }) {
  const sections = cards.map((card, index) => {
    const candidate = card.candidate;
    const rights = rightsByCandidate.get(card.candidate_id);
    if (!rights) {
      throw new SourceExpansionContractError('RIGHTS_MISSING', card.candidate_id);
    }
    const dimensions = candidate.public_dimensions === null
      ? 'unknown'
      : `${candidate.public_dimensions.x} × ${candidate.public_dimensions.y} × ${candidate.public_dimensions.z}`;
    const evidenceLinks = rights.authoritative_urls
      .map((url, evidenceIndex) => markdownLink(`Rights evidence ${evidenceIndex + 1}`, url))
      .join(', ');
    const conditions = rights.conditions.length === 0
      ? 'none recorded'
      : rights.conditions.map(escapeMarkdown).join('; ');
    const warnings = rights.reason_codes.length === 0
      ? 'none recorded'
      : rights.reason_codes.map(escapeMarkdown).join('; ');

    return `## ${index + 1}. ${escapeMarkdown(candidate.title)}

- Candidate: ${escapeMarkdown(card.candidate_id)}
- Author: ${escapeMarkdown(candidate.author)}
- Source: ${escapeMarkdown(card.source_id)}
- Type / style: ${escapeMarkdown(candidate.building_type)} / ${escapeMarkdown(candidate.style)}
- Public dimensions: ${dimensions}
- Score: ${formatMetric(card.score)}
- Coverage: ${card.coverage}%
- Lane: ${escapeMarkdown(card.lane)}
- Popularity percentile: ${formatMetric(card.percentiles.popularity)}
- Reception percentile: ${formatMetric(card.percentiles.reception)}
- Duplicate penalty: ${formatMetric(card.duplicate_penalty)}
- Rights scope / revision: ${escapeMarkdown(rights.scope)} / ${rights.revision}
- Rights evidence: ${evidenceLinks}
- Conditions: ${conditions}
- Warnings: ${warnings}
- ${markdownLink('Canonical source', candidate.canonical_url)}
- ${markdownLink('Public preview', candidate.preview_url)}
- Owner decision: Accept / Defer / Reject
`;
  });

  return `# Stage 7 Source-Expansion ${escapeMarkdown(wave)} Review Cards

This is a metadata-only human-review pack. It does not authorize download, Dataset admission, or training.

${sections.join('\n')}`;
}

export function renderFinalReviewSummaryMarkdown(summary) {
  const acceptedBySource = countBySource(
    summary.states.filter((item) => item.state === 'human_accepted')
  );
  const rows = [...acceptedBySource.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceId, count]) => `| ${escapeMarkdown(sourceId)} | ${count} |`)
    .join('\n') || '| none | 0 |';
  return `# Stage 7 Source-Expansion Metadata Pilot Summary

- Metadata only: yes
- Authorizes download: no
- Authorizes training: no
- Discovery cards: ${summary.discovery_card_count}
- Yield cards: ${summary.yield_card_count}
- Accepted candidates: ${summary.accepted_count}
- At least 20 accepted: ${summary.has_twenty_accepted ? 'yes' : 'no'}
- At least 10 from one source: ${summary.has_ten_from_one_source ? 'yes' : 'no'}

| Source | Accepted |
| --- | ---: |
${rows}

This report does not authorize download, Dataset admission, or training.
`;
}

function latestDecisionMap(decisions, wave) {
  const grouped = new Map();
  for (const decision of decisions) {
    if (decision.wave !== wave) {
      throw new SourceExpansionContractError('DECISION_WAVE_MISMATCH', decision.candidate_id);
    }
    const records = grouped.get(decision.candidate_id) || [];
    records.push(decision);
    grouped.set(decision.candidate_id, records);
  }
  const latest = new Map();
  for (const [candidateId, records] of grouped) {
    const revision = Math.max(...records.map((record) => record.revision));
    const matches = records.filter((record) => record.revision === revision);
    if (matches.length !== 1) {
      throw new SourceExpansionContractError('DECISION_REVISION_AMBIGUOUS', candidateId);
    }
    latest.set(candidateId, matches[0]);
  }
  return latest;
}

function countBySource(items) {
  const counts = new Map();
  for (const item of items) {
    counts.set(item.source_id, (counts.get(item.source_id) || 0) + 1);
  }
  return counts;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sortKeys(value[key])])
    );
  }
  return value;
}

function markdownLink(label, value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new SourceExpansionContractError('URL_INVALID', label);
  }
  if (parsed.protocol !== 'https:') {
    throw new SourceExpansionContractError('URL_NOT_HTTPS', label);
  }
  const destination = parsed.href.replaceAll('(', '%28').replaceAll(')', '%29');
  return `[${escapeMarkdown(label)}](${destination})`;
}

function formatMetric(value) {
  return value === null ? 'unknown' : String(value);
}

function escapeMarkdown(value) {
  return String(value).replace(/[\\`*_{}\[\]()#+.!|>\-]/gu, '\\$&');
}
