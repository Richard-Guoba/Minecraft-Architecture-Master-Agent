export function taxonomyAssessmentFixture(overrides = {}) {
  return {
    schema_version: 1,
    candidate_id: 'source-a:castle-01',
    revision: 1,
    assessed_at: '2026-07-18',
    assessed_by: 'owner',
    assessment_decision: 'accept',
    reason_codes: [],
    primary_function: 'defensive_military',
    secondary_functions: ['residential'],
    building_type: 'castle',
    building_type_parent: 'fortification',
    style_family: 'medieval',
    style_tags: ['fantasy'],
    environment: 'overworld',
    biome_theme: 'none',
    completeness: 'complete',
    label_confidence: 'high',
    source_group: 'source-a',
    asset_family: 'castle-family-01',
    ...overrides
  };
}

export function policyCaseFixture(overrides = {}) {
  return {
    candidate_id: 'source-a:castle-01',
    primary_function: 'defensive_military',
    style_family: 'medieval',
    scale_bin: 'standard',
    source_group: 'source-a',
    asset_family: 'castle-family-01',
    author_entity: 'author-a',
    near_duplicate_cluster: null,
    exact_duplicate_of: null,
    human_reviewed: true,
    second_reviewed: false,
    batch_id: 'batch-001',
    ...overrides
  };
}

export function splitAssignmentFixture(overrides = {}) {
  return {
    candidate_id: 'source-a:castle-01',
    split: 'train',
    ...overrides
  };
}
