import { hashPilotValue } from '../../src/construction/learning/stage7PilotBatch.js';

const DEFINITIONS = Object.freeze([
  ['source-a', 'house-01', 'primary', null, 'residential', 'house', 'rustic', '1'],
  ['source-b', 'tower-01', 'primary', null, 'defensive_military', 'tower', 'medieval', '2'],
  ['source-c', 'temple-01', 'primary', null, 'religious_public', 'temple', 'classical', '3'],
  ['source-d', 'ship-01', 'primary', null, 'transport_infrastructure', 'ship', 'nautical', '4'],
  ['source-e', 'ruin-01', 'primary', null, 'monument_ruin', 'ruin', 'ancient', '5'],
  ['source-f', 'house-02', 'reserve', 'source-a:house-01', 'residential', 'house', 'rustic', '6'],
  ['source-g', 'tower-02', 'reserve', 'source-b:tower-01', 'defensive_military', 'tower', 'medieval', '7'],
  ['source-h', 'temple-02', 'reserve', 'source-c:temple-01', 'religious_public', 'temple', 'classical', '8']
]);

export function pilotCandidateFixture({
  sourceId = 'source-a',
  assetId = 'house-01',
  role = 'primary',
  reserveFor = null,
  primaryFunction = 'residential',
  buildingType = 'house',
  styleFamily = 'rustic',
  revisionCharacter = '1',
  ...overrides
} = {}) {
  const immutableRevision = revisionCharacter.repeat(40);
  const relativePath = `data/example/structures/${assetId}.nbt`;
  const base = {
    candidate_id: `${sourceId}:${assetId}`,
    role,
    reserve_for: reserveFor,
    source_id: sourceId,
    source_group: sourceId,
    asset_family: `${assetId}-family`,
    immutable_revision: immutableRevision,
    relative_nbt_path: relativePath,
    canonical_file_url: `https://raw.example.test/${sourceId}/${immutableRevision}/${relativePath}`,
    approved_redirect_urls: [],
    primary_function: primaryFunction,
    building_type: buildingType,
    style_family: styleFamily,
    environment: 'overworld',
    admission_state: 'admission_contract_ready',
    admission_evidence_sha256: revisionCharacter.repeat(64),
    rights: {
      license_id: 'MIT',
      evidence_url: `https://example.test/${sourceId}/LICENSE`,
      scope: 'repository assets including the named NBT path',
      verified_at: '2026-07-20',
      evidence_sha256: revisionCharacter.repeat(64),
      permissions: {
        download: true,
        copy: true,
        transform: true,
        training: true,
        local_retention: true
      },
      ai_ml_restriction: false,
      platform_conflict: false,
      upstream_conflict: false
    },
    quality: {
      preview_urls: [`https://example.test/${sourceId}/${assetId}`],
      popularity: 100,
      reception: 10,
      maintenance: 'active',
      owner_quality_decision: 'accept'
    },
    technical: {
      claimed_format: 'minecraft_java_structure_nbt',
      standalone_evidence: 'one complete structure file',
      vanilla_compatible_expected: true,
      external_dependency_expected: false,
      jigsaw_expected: false
    },
    scores: {
      parser_reliability: 1,
      quality: 0.8,
      diversity: 1,
      source_stability: 0.9,
      total: 0.93
    }
  };
  return mergeCandidate(base, overrides);
}

export function pilotBatchFixture(overrides = {}) {
  const candidates = DEFINITIONS.map(([
    sourceId, assetId, role, reserveFor, primaryFunction,
    buildingType, styleFamily, revisionCharacter
  ]) => pilotCandidateFixture({
    sourceId,
    assetId,
    role,
    reserveFor,
    primaryFunction,
    buildingType,
    styleFamily,
    revisionCharacter
  }));
  const batch = {
    batch_id: 'r3-pilot-20260720',
    as_of: '2026-07-20',
    code_revision: 'f'.repeat(40),
    candidates,
    ...(overrides.batch || {})
  };
  const batchSha256 = hashPilotValue(batch);
  return {
    schema_version: 1,
    batch,
    batch_sha256: batchSha256,
    approval: {
      approved_batch_sha256: batchSha256,
      approved_at: '2026-07-20T12:00:00.000Z',
      approved_by: 'owner',
      authorizes_acquisition: true,
      authorizes_training: false,
      authorizes_dataset_admission: false,
      ...(overrides.approval || {})
    },
    ...(overrides.document || {})
  };
}

export function resignPilotBatch(document) {
  const copy = structuredClone(document);
  copy.batch_sha256 = hashPilotValue(copy.batch);
  copy.approval.approved_batch_sha256 = copy.batch_sha256;
  return copy;
}

function mergeCandidate(base, overrides) {
  const copy = structuredClone(base);
  for (const [key, value] of Object.entries(overrides)) {
    if (['rights', 'quality', 'technical', 'scores'].includes(key)
      && value && typeof value === 'object' && !Array.isArray(value)) {
      copy[key] = { ...copy[key], ...structuredClone(value) };
    } else {
      copy[key] = structuredClone(value);
    }
  }
  if (overrides.rights?.permissions) {
    copy.rights.permissions = {
      ...base.rights.permissions,
      ...structuredClone(overrides.rights.permissions)
    };
  }
  return copy;
}
