import { failContract } from './contractError.js';
import {
  assertArray,
  assertCell,
  assertEnum,
  assertExactObject,
  assertId,
  assertInteger,
  assertSha256,
  assertString,
  assertUniqueStringArray,
  cloneDocument,
  deepFreeze
} from './validation.js';
import {
  RESIDENTIAL_SCHEMA_VERSION,
  SOURCE_PROFILE_SOURCE
} from './vocabularies.js';

const STATUSES = ['quarantined', 'parsed', 'eligible', 'deferred', 'rejected'];
const EVIDENCE = ['unknown', 'pass', 'fail'];

export function validateSourceProfile(value) {
  const document = cloneDocument(value, 'SourceProfile');
  assertExactObject(document, 'SourceProfile', [
    'source',
    'schema_version',
    'case_id',
    'batch_id',
    'title',
    'origin',
    'artifact',
    'lineage',
    'measurements',
    'fingerprints',
    'evidence',
    'status',
    'decisions'
  ]);
  if (document.source !== SOURCE_PROFILE_SOURCE) {
    failContract(
      'SOURCE_PROFILE_SOURCE_INVALID',
      'SourceProfile.source',
      document.source
    );
  }
  if (document.schema_version !== RESIDENTIAL_SCHEMA_VERSION) {
    failContract(
      'SOURCE_PROFILE_VERSION_INVALID',
      'SourceProfile.schema_version',
      document.schema_version
    );
  }
  assertId(document.case_id, 'SourceProfile.case_id');
  assertId(document.batch_id, 'SourceProfile.batch_id');
  assertString(document.title, 'SourceProfile.title', { maximum: 512 });
  validateOrigin(document.origin);
  validateArtifact(document.artifact);
  validateLineage(document.lineage);
  validateMeasurements(document.measurements);
  validateFingerprints(document.fingerprints, document.artifact.sha256);
  validateEvidence(document.evidence);
  assertEnum(document.status, 'SourceProfile.status', STATUSES);
  validateDecisions(document.decisions, document.status);
  return deepFreeze(document);
}

function validateOrigin(value) {
  assertExactObject(value, 'SourceProfile.origin', [
    'url',
    'author',
    'license_status',
    'license_text',
    'allowed_uses',
    'acquired_at'
  ]);
  assertString(value.url, 'SourceProfile.origin.url', { maximum: 4096 });
  let parsed;
  try {
    parsed = new URL(value.url);
  } catch {
    failContract('SOURCE_PROFILE_URL_INVALID', 'SourceProfile.origin.url', value.url);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    failContract(
      'SOURCE_PROFILE_URL_INVALID',
      'SourceProfile.origin.url',
      parsed.protocol
    );
  }
  assertString(value.author, 'SourceProfile.origin.author', {
    minimum: 0,
    maximum: 512
  });
  assertEnum(
    value.license_status,
    'SourceProfile.origin.license_status',
    ['recorded', 'unknown', 'restricted', 'public_domain']
  );
  assertString(value.license_text, 'SourceProfile.origin.license_text', {
    minimum: 0,
    maximum: 4096
  });
  assertUniqueStringArray(value.allowed_uses, 'SourceProfile.origin.allowed_uses', {
    allowed: ['local-analysis', 'local-training', 'external-release']
  });
  assertTimestamp(value.acquired_at, 'SourceProfile.origin.acquired_at');
}

function validateArtifact(value) {
  assertExactObject(value, 'SourceProfile.artifact', [
    'original_filename', 'format', 'byte_size', 'sha256'
  ]);
  assertString(value.original_filename, 'SourceProfile.artifact.original_filename', {
    maximum: 512
  });
  if (
    value.original_filename.includes('/')
    || value.original_filename.includes('\\')
    || value.original_filename === '.'
    || value.original_filename === '..'
  ) {
    failContract(
      'SOURCE_PROFILE_FILENAME_INVALID',
      'SourceProfile.artifact.original_filename',
      value.original_filename
    );
  }
  assertEnum(value.format, 'SourceProfile.artifact.format', [
    'schem', 'schematic', 'structure_nbt'
  ]);
  assertInteger(value.byte_size, 'SourceProfile.artifact.byte_size', {
    minimum: 1,
    maximum: 64 * 1024 * 1024
  });
  assertSha256(value.sha256, 'SourceProfile.artifact.sha256');
}

function validateLineage(value) {
  assertExactObject(value, 'SourceProfile.lineage', [
    'source_project', 'asset_family'
  ]);
  assertId(value.source_project, 'SourceProfile.lineage.source_project');
  assertId(value.asset_family, 'SourceProfile.lineage.asset_family');
}

function validateMeasurements(value) {
  assertExactObject(value, 'SourceProfile.measurements', ['occupied_bounds']);
  const bounds = value.occupied_bounds;
  assertExactObject(bounds, 'SourceProfile.measurements.occupied_bounds', [
    'min', 'max', 'extent'
  ]);
  assertCell(bounds.min, 'SourceProfile.measurements.occupied_bounds.min');
  assertCell(bounds.max, 'SourceProfile.measurements.occupied_bounds.max');
  assertArray(bounds.extent, 'SourceProfile.measurements.occupied_bounds.extent', {
    minimum: 3,
    maximum: 3
  });
  for (let axis = 0; axis < 3; axis += 1) {
    assertInteger(
      bounds.extent[axis],
      `SourceProfile.measurements.occupied_bounds.extent[${axis}]`,
      { minimum: 1, maximum: 64 }
    );
    if (bounds.max[axis] - bounds.min[axis] + 1 !== bounds.extent[axis]) {
      failContract(
        'SOURCE_PROFILE_BOUNDS_INVALID',
        'SourceProfile.measurements.occupied_bounds',
        `axis ${axis}`
      );
    }
  }
}

function validateFingerprints(value, artifactHash) {
  assertExactObject(value, 'SourceProfile.fingerprints', [
    'exact_sha256', 'structural_sha256'
  ]);
  assertSha256(value.exact_sha256, 'SourceProfile.fingerprints.exact_sha256');
  assertSha256(
    value.structural_sha256,
    'SourceProfile.fingerprints.structural_sha256'
  );
  if (value.exact_sha256 !== artifactHash) {
    failContract(
      'SOURCE_PROFILE_EXACT_HASH_MISMATCH',
      'SourceProfile.fingerprints.exact_sha256',
      `${value.exact_sha256} != ${artifactHash}`
    );
  }
}

function validateEvidence(value) {
  const fields = [
    'complete_residence', 'furnished', 'survival_core', 'supported_content'
  ];
  assertExactObject(value, 'SourceProfile.evidence', fields);
  for (const field of fields) {
    assertEnum(value[field], `SourceProfile.evidence.${field}`, EVIDENCE);
  }
}

function validateDecisions(value, finalStatus) {
  assertArray(value, 'SourceProfile.decisions', { minimum: 1, maximum: 1024 });
  const ids = new Set();
  let previous = null;
  for (let index = 0; index < value.length; index += 1) {
    const decision = value[index];
    const decisionPath = `SourceProfile.decisions[${index}]`;
    assertExactObject(decision, decisionPath, [
      'id', 'at', 'actor', 'action', 'from_status', 'to_status', 'reason'
    ]);
    assertId(decision.id, `${decisionPath}.id`);
    if (ids.has(decision.id)) {
      failContract(
        'SOURCE_PROFILE_DECISION_DUPLICATE',
        `${decisionPath}.id`,
        decision.id
      );
    }
    ids.add(decision.id);
    assertTimestamp(decision.at, `${decisionPath}.at`);
    assertId(decision.actor, `${decisionPath}.actor`);
    assertId(decision.action, `${decisionPath}.action`);
    if (decision.from_status !== previous) {
      failContract(
        'SOURCE_PROFILE_DECISION_DISCONTIGUOUS',
        `${decisionPath}.from_status`,
        `${decision.from_status} != ${previous}`
      );
    }
    assertEnum(decision.to_status, `${decisionPath}.to_status`, STATUSES);
    assertString(decision.reason, `${decisionPath}.reason`, { maximum: 2048 });
    previous = decision.to_status;
  }
  if (previous !== finalStatus) {
    failContract(
      'SOURCE_PROFILE_STATUS_MISMATCH',
      'SourceProfile.status',
      `${finalStatus} != ${previous}`
    );
  }
}

function assertTimestamp(value, valuePath) {
  assertString(value, valuePath, { maximum: 64 });
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || !Number.isFinite(Date.parse(value))
  ) {
    failContract('CONTRACT_TIMESTAMP_INVALID', valuePath, value);
  }
}
