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
