export function candidateFixture(overrides = {}) {
  return {
    schema_version: 1,
    candidate_id: 'source-a:castle-01',
    source_id: 'source-a',
    asset_id: 'castle-01',
    canonical_url: 'https://example.invalid/source-a/castle-01',
    preview_url: 'https://example.invalid/source-a/castle-01/preview',
    author: 'synthetic-author',
    title: 'Synthetic Castle 01',
    observed_at: '2026-07-16',
    published_at: '2025-05-02',
    claimed_format: 'schematic',
    public_dimensions: { x: 40, y: 32, z: 48 },
    building_type: 'castle',
    style: 'medieval',
    signals: {
      popularity: 100,
      reception: 20,
      preview_completeness: 1,
      building_completeness: 1,
      technical_compatibility: 1,
      scarcity: 0.5,
      duplicate_risk: 0
    },
    ...overrides
  };
}

export function rightsFixture(overrides = {}) {
  return {
    schema_version: 1,
    candidate_id: 'source-a:castle-01',
    revision: 1,
    observed_at: '2026-07-16',
    reviewed_by: 'synthetic-reviewer',
    scope: 'asset',
    authoritative_urls: ['https://example.invalid/source-a/license'],
    author_chain: ['synthetic-author'],
    permissions: {
      download: true,
      copy: true,
      transform: true,
      training: true,
      derivative_research_artifacts: true,
      local_retention: true
    },
    conditions: [],
    ai_ml_restriction: false,
    platform_conflict: false,
    upstream_conflict: false,
    conclusion: 'verified',
    reason_codes: [],
    ...overrides
  };
}

export function decisionFixture(overrides = {}) {
  return {
    schema_version: 1,
    candidate_id: 'source-a:castle-01',
    wave: 'discovery',
    revision: 1,
    decided_at: '2026-07-16',
    decided_by: 'owner',
    decision: 'accept',
    ...overrides
  };
}
