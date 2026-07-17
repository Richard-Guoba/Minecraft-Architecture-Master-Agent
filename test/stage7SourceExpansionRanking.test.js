import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDiscoveryRecord } from '../src/construction/learning/stage7SourceExpansionContracts.js';
import { rankRightsVerifiedCandidates } from '../src/construction/learning/stage7SourceExpansionRanking.js';
import { candidateFixture } from './fixtures/stage7SourceExpansionFixtures.js';

test('ranking is source-relative, coverage-aware, and deterministic', () => {
  const candidates = [
    makeCandidate('source-a', 'item-b', { popularity: 10 }),
    makeCandidate('source-a', 'item-a', { popularity: 100 })
  ];
  const rightsResults = verifiedRights(candidates);

  const first = rankRightsVerifiedCandidates({ candidates, rightsResults });
  const second = rankRightsVerifiedCandidates({
    candidates: [...candidates].reverse(),
    rightsResults: [...rightsResults].reverse()
  });

  assert.deepEqual(first, second);
  assert.equal(first[0].candidate_id, 'source-a:item-a');
  assert.equal(first[0].lane, 'ranked');
  assert.equal(first[0].coverage, 100);
  assert.equal(first[0].percentiles.popularity, 0.75);
  assert.equal(first[1].percentiles.popularity, 0.25);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first[0]), true);
});

test('percentiles never compare popularity across different sources', () => {
  const candidates = [
    makeCandidate('source-a', 'low', { popularity: 1 }),
    makeCandidate('source-a', 'high', { popularity: 2 }),
    makeCandidate('source-b', 'huge', { popularity: 10_000 })
  ];
  const ranked = rankRightsVerifiedCandidates({ candidates, rightsResults: verifiedRights(candidates) });
  const byId = new Map(ranked.map((row) => [row.candidate_id, row]));

  assert.equal(byId.get('source-a:high').percentiles.popularity, 0.75);
  assert.equal(byId.get('source-a:low').percentiles.popularity, 0.25);
  assert.equal(byId.get('source-b:huge').percentiles.popularity, 0.5);
});

test('a same-year cohort is used only when at least ten comparable records exist', () => {
  const tenIn2025 = Array.from({ length: 10 }, (_, index) =>
    makeCandidate('source-a', `year-${String(index + 1).padStart(2, '0')}`, {
      popularity: index + 1
    }, { published_at: '2025-01-01' })
  );
  const oldOutlier = makeCandidate(
    'source-a',
    'old-outlier',
    { popularity: 1_000 },
    { published_at: '2024-01-01' }
  );
  const full = [...tenIn2025, oldOutlier];
  const fullRows = rankRightsVerifiedCandidates({ candidates: full, rightsResults: verifiedRights(full) });
  assert.equal(find(fullRows, 'source-a:year-10').percentiles.popularity, 0.95);

  const nineIn2025 = tenIn2025.slice(0, 9);
  const fallback = [...nineIn2025, oldOutlier];
  const fallbackRows = rankRightsVerifiedCandidates({
    candidates: fallback,
    rightsResults: verifiedRights(fallback)
  });
  assert.equal(find(fallbackRows, 'source-a:year-09').percentiles.popularity, 0.85);
});

test('tied source metrics receive the same midpoint percentile', () => {
  const candidates = [
    makeCandidate('source-a', 'item-a', { popularity: 5, reception: 7 }),
    makeCandidate('source-a', 'item-b', { popularity: 5, reception: 7 })
  ];
  const rows = rankRightsVerifiedCandidates({ candidates, rightsResults: verifiedRights(candidates) });

  assert.deepEqual(rows.map((row) => row.percentiles), [
    { popularity: 0.5, reception: 0.5 },
    { popularity: 0.5, reception: 0.5 }
  ]);
  assert.deepEqual(rows.map((row) => row.candidate_id), ['source-a:item-a', 'source-a:item-b']);
});

test('partial evidence reports weighted coverage and a low-evidence lane', () => {
  const candidate = makeCandidate('source-a', 'partial', {
    popularity: null,
    reception: null,
    preview_completeness: 1,
    building_completeness: null,
    technical_compatibility: null,
    scarcity: null,
    duplicate_risk: 0
  });
  const [row] = rankRightsVerifiedCandidates({
    candidates: [candidate],
    rightsResults: verifiedRights([candidate])
  });

  assert.equal(row.coverage, 15);
  assert.equal(row.score, 100);
  assert.equal(row.lane, 'low_evidence');
  assert.equal(row.review_eligible, true);
});

test('signal-free candidates remain reviewable but unranked without a fabricated score', () => {
  const candidate = makeCandidate('source-a', 'unknown', {
    popularity: null,
    reception: null,
    preview_completeness: null,
    building_completeness: null,
    technical_compatibility: null,
    scarcity: null,
    duplicate_risk: null
  });
  const [row] = rankRightsVerifiedCandidates({
    candidates: [candidate],
    rightsResults: verifiedRights([candidate])
  });

  assert.equal(row.coverage, 0);
  assert.equal(row.score, null);
  assert.equal(row.lane, 'unranked');
  assert.equal(row.review_eligible, true);
  assert.deepEqual(row.percentiles, { popularity: null, reception: null });
});

test('duplicate risk applies a bounded score penalty', () => {
  const clean = makeCandidate('source-a', 'clean', { duplicate_risk: 0 });
  const risky = makeCandidate('source-a', 'risky', { duplicate_risk: 1 });
  const candidates = [clean, risky];
  const rows = rankRightsVerifiedCandidates({ candidates, rightsResults: verifiedRights(candidates) });

  const cleanRow = find(rows, clean.candidate_id);
  const riskyRow = find(rows, risky.candidate_id);
  assert.equal(cleanRow.duplicate_penalty, 0);
  assert.equal(riskyRow.duplicate_penalty, 25);
  assert.equal(cleanRow.score - riskyRow.score, 25);
});

test('rights-failed candidates are excluded from every ranking lane', () => {
  const allowed = makeCandidate('source-a', 'allowed');
  const denied = makeCandidate('source-a', 'denied', { popularity: 1_000 });
  const rows = rankRightsVerifiedCandidates({
    candidates: [denied, allowed],
    rightsResults: [
      { candidate_id: allowed.candidate_id, rights_verified: true },
      { candidate_id: denied.candidate_id, rights_verified: false }
    ]
  });

  assert.deepEqual(rows.map((row) => row.candidate_id), [allowed.candidate_id]);
});

test('known oversized public candidates are metadata-deferred and never scored or reviewable', () => {
  const oversized = validateDiscoveryRecord(candidateFixture({
    public_dimensions: { x: 65, y: 64, z: 64 }
  }));
  const [row] = rankRightsVerifiedCandidates({
    candidates: [oversized],
    rightsResults: verifiedRights([oversized])
  });

  assert.equal(row.lane, 'deferred_oversized');
  assert.equal(row.review_eligible, false);
  assert.equal(row.score, null);
  assert.equal(row.coverage, 0);
  assert.equal(row.duplicate_penalty, null);
  assert.deepEqual(row.percentiles, { popularity: null, reception: null });
});

test('lane, score, coverage, then candidate ID define deterministic ordering', () => {
  const rankedB = makeCandidate('source-a', 'ranked-b');
  const rankedA = makeCandidate('source-a', 'ranked-a');
  const low = makeCandidate('source-b', 'low', {
    popularity: null,
    reception: null,
    preview_completeness: 0.2,
    building_completeness: null,
    technical_compatibility: null,
    scarcity: null,
    duplicate_risk: 0
  });
  const unknown = makeCandidate('source-c', 'unknown', {
    popularity: null,
    reception: null,
    preview_completeness: null,
    building_completeness: null,
    technical_compatibility: null,
    scarcity: null,
    duplicate_risk: null
  });
  const oversized = validateDiscoveryRecord(candidateFixture({
    candidate_id: 'source-d:large',
    source_id: 'source-d',
    asset_id: 'large',
    public_dimensions: { x: 100, y: 1, z: 1 }
  }));
  const candidates = [oversized, unknown, low, rankedB, rankedA];
  const rows = rankRightsVerifiedCandidates({ candidates, rightsResults: verifiedRights(candidates) });

  assert.deepEqual(rows.map((row) => row.candidate_id), [
    'source-a:ranked-a',
    'source-a:ranked-b',
    'source-b:low',
    'source-c:unknown',
    'source-d:large'
  ]);
});

function makeCandidate(sourceId, assetId, signalOverrides = {}, candidateOverrides = {}) {
  return validateDiscoveryRecord(candidateFixture({
    candidate_id: `${sourceId}:${assetId}`,
    source_id: sourceId,
    asset_id: assetId,
    signals: { ...candidateFixture().signals, ...signalOverrides },
    ...candidateOverrides
  }));
}

function verifiedRights(candidates) {
  return candidates.map((candidate) => ({
    candidate_id: candidate.candidate_id,
    rights_verified: true
  }));
}

function find(rows, candidateId) {
  return rows.find((row) => row.candidate_id === candidateId);
}
