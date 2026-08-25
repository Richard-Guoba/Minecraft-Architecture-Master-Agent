export function resourceCatalogFixture() {
  return {
    schema_version: 1,
    catalog_id: 'architecture-playbook-resource-catalog',
    updated_at: '2026-08-25T00:00:00.000Z',
    sources: [
      {
        source_id: 'example-source',
        title: 'Example source',
        lifecycle_status: 'registered',
        profile_path: 'sources/example-source/source.json',
        assessment_path: null
      }
    ]
  };
}

export function resourceSourceProfileFixture(overrides = {}) {
  return {
    schema_version: 1,
    source_id: 'example-source',
    title: 'Example source',
    canonical_url: 'https://example.com/resources',
    alternate_urls: ['https://www.example.com/resources'],
    registered_at: '2026-08-20T00:00:00.000Z',
    last_checked_at: '2026-08-25T00:00:00.000Z',
    source_type: 'case-catalog',
    operator: {
      name: 'Example operator',
      url: 'https://example.com/',
      basis: 'direct-page'
    },
    publisher: {
      name: 'Example publisher',
      url: null,
      basis: 'unverified'
    },
    creator_model: 'multi-creator',
    platform_is_school: false,
    content_hierarchy: ['collection', 'case'],
    content_unit_types: ['article'],
    representation_modes: ['text', 'images'],
    access_methods: ['web'],
    requires_login: 'unknown',
    client_rendered: false,
    robots_observation: accessObservationFixture(),
    api_access: accessObservationFixture(),
    artifact_access: accessObservationFixture(),
    availability_status: 'reachable',
    access_notes: ['Public collection pages are reachable.'],
    styles: ['modern'],
    building_types: ['house'],
    difficulty_levels: ['intermediate'],
    scale_range: ['small'],
    game_editions: ['Java Edition'],
    game_versions: ['1.21'],
    game_modes: ['survival'],
    design_layers: ['facade'],
    knowledge_modes: ['design-principles', 'reference-case'],
    public_access: rightsObservationFixture(),
    local_analysis: rightsObservationFixture(),
    automated_retrieval: rightsObservationFixture(),
    artifact_download: rightsObservationFixture(),
    model_training: rightsObservationFixture(),
    external_redistribution: rightsObservationFixture(),
    extractable_fields: ['materials'],
    suitable_ai_operations: ['summarization'],
    prohibited_operations: [],
    adapter_requirements: [],
    risk_flags: ['rights-unknown'],
    lifecycle_status: 'assessed',
    assessment: {
      path: 'sources/example-source/assessment.md',
      sha256: 'a'.repeat(64),
      completed_at: '2026-08-25T00:00:00.000Z',
      probe_ids: ['probe-one', 'probe-two', 'probe-three', 'probe-four', 'probe-five'],
      recommendation: 'recommend-defer',
      ratings: {
        principles: { value: 3, reason: 'It describes reusable design principles.' },
        construction_sequence: { value: 2, reason: 'It includes some construction ordering.' },
        reference_case: { value: 4, reason: 'It provides clear reference cases.' },
        materials: { value: 3, reason: 'It identifies common materials.' },
        survival_constraints: { value: 'unknown', reason: 'The source does not state survival constraints.' },
        evaluation: { value: 2, reason: 'It offers limited visual evaluation guidance.' },
        provenance: { value: 2, reason: 'Publisher attribution is partially observed.' },
        access_stability: { value: 3, reason: 'The pages are currently reachable.' },
        rights_clarity: { value: 1, reason: 'Reuse rights remain unknown.' }
      },
      risk_flags: ['rights-unknown']
    },
    decision_history: [],
    ...overrides
  };
}

function accessObservationFixture() {
  return {
    status: 'unknown',
    evidence_url: null,
    checked_at: '2026-08-25T00:00:00.000Z',
    note: 'No observation has been verified yet.'
  };
}

function rightsObservationFixture() {
  return {
    status: 'unknown',
    evidence_url: null,
    checked_at: '2026-08-25T00:00:00.000Z',
    note: 'No rights evidence has been verified yet.'
  };
}
