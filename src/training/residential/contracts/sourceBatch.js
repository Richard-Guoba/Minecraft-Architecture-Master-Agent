import {
  assertArtifactPath,
  assertArray,
  assertEnum,
  assertExactObject,
  assertId,
  assertString,
  assertUniqueStringArray,
  cloneDocument,
  deepFreeze
} from './validation.js';
import { failContract } from './contractError.js';
import {
  RESIDENTIAL_SCHEMA_VERSION,
  SOURCE_BATCH_SOURCE,
  SOURCE_LANES
} from './vocabularies.js';

export function validateSourceBatchManifest(value) {
  const document = cloneDocument(value, 'SourceBatch');
  assertExactObject(document, 'SourceBatch', [
    'source', 'schema_version', 'batch_id', 'source_project', 'candidates'
  ]);
  if (document.source !== SOURCE_BATCH_SOURCE) {
    failContract('SOURCE_BATCH_SOURCE_INVALID', 'SourceBatch.source', document.source);
  }
  if (document.schema_version !== RESIDENTIAL_SCHEMA_VERSION) {
    failContract(
      'SOURCE_BATCH_VERSION_INVALID',
      'SourceBatch.schema_version',
      document.schema_version
    );
  }
  assertId(document.batch_id, 'SourceBatch.batch_id');
  assertId(document.source_project, 'SourceBatch.source_project');
  assertArray(document.candidates, 'SourceBatch.candidates', {
    minimum: 0,
    maximum: 10_000
  });
  const paths = new Set();
  document.candidates.forEach((candidate, index) => {
    validateSourceCandidate(candidate, `SourceBatch.candidates[${index}]`);
    if (paths.has(candidate.relative_path)) {
      failContract(
        'SOURCE_BATCH_PATH_DUPLICATE',
        `SourceBatch.candidates[${index}].relative_path`,
        candidate.relative_path
      );
    }
    paths.add(candidate.relative_path);
  });
  return deepFreeze(document);
}

export function validateSourceCandidate(
  value,
  candidatePath = 'SourceCandidate'
) {
  assertExactObject(value, candidatePath, [
    'relative_path', 'lane', 'title', 'origin', 'collector_note'
  ]);
  assertArtifactPath(value.relative_path, `${candidatePath}.relative_path`);
  assertEnum(value.lane, `${candidatePath}.lane`, SOURCE_LANES);
  const parts = value.relative_path.split('/');
  if (parts.length !== 2 || parts[0] !== value.lane) {
    failContract(
      'SOURCE_BATCH_LANE_PATH_MISMATCH',
      `${candidatePath}.relative_path`,
      value.relative_path
    );
  }
  assertString(value.title, `${candidatePath}.title`, { maximum: 512 });
  validateOrigin(value.origin, `${candidatePath}.origin`);
  assertString(value.collector_note, `${candidatePath}.collector_note`, {
    minimum: 0,
    maximum: 4096
  });
  return value;
}

function validateOrigin(value, originPath) {
  assertExactObject(value, originPath, [
    'url', 'author', 'license_status', 'license_text',
    'allowed_uses', 'acquired_at'
  ]);
  assertString(value.url, `${originPath}.url`, { maximum: 4096 });
  let parsed;
  try {
    parsed = new URL(value.url);
  } catch {
    failContract('SOURCE_BATCH_URL_INVALID', `${originPath}.url`, value.url);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    failContract('SOURCE_BATCH_URL_INVALID', `${originPath}.url`, parsed.protocol);
  }
  assertString(value.author, `${originPath}.author`, {
    minimum: 0,
    maximum: 512
  });
  assertEnum(value.license_status, `${originPath}.license_status`, [
    'recorded', 'unknown', 'restricted', 'public_domain'
  ]);
  assertString(value.license_text, `${originPath}.license_text`, {
    minimum: 0,
    maximum: 4096
  });
  assertUniqueStringArray(value.allowed_uses, `${originPath}.allowed_uses`, {
    allowed: ['local-analysis', 'local-training', 'external-release']
  });
  assertString(value.acquired_at, `${originPath}.acquired_at`, { maximum: 64 });
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
      .test(value.acquired_at)
    || !Number.isFinite(Date.parse(value.acquired_at))
  ) {
    failContract(
      'CONTRACT_TIMESTAMP_INVALID',
      `${originPath}.acquired_at`,
      value.acquired_at
    );
  }
}
