import {
  assertArray,
  assertEnum,
  assertExactObject,
  assertInteger,
  assertNullable,
  assertSha256,
  assertString,
  cloneDocument,
  deepFreeze
} from './validation.js';
import { failContract } from './contractError.js';
import {
  LEGACY_AUDIT_REPORT_SOURCE,
  RESIDENTIAL_SCHEMA_VERSION,
  SOURCE_LANES
} from './vocabularies.js';

export function validateLegacyAuditReport(value) {
  const document = cloneDocument(value, 'LegacyAuditReport');
  assertExactObject(document, 'LegacyAuditReport', [
    'source', 'schema_version', 'root', 'inventory_sha256',
    'summary', 'candidates'
  ]);
  if (document.source !== LEGACY_AUDIT_REPORT_SOURCE) {
    failContract(
      'LEGACY_AUDIT_SOURCE_INVALID',
      'LegacyAuditReport.source',
      document.source
    );
  }
  if (document.schema_version !== RESIDENTIAL_SCHEMA_VERSION) {
    failContract(
      'LEGACY_AUDIT_VERSION_INVALID',
      'LegacyAuditReport.schema_version',
      document.schema_version
    );
  }
  if (document.root !== 'mc_templates') {
    failContract('LEGACY_AUDIT_ROOT_INVALID', 'LegacyAuditReport.root', document.root);
  }
  assertSha256(document.inventory_sha256, 'LegacyAuditReport.inventory_sha256');
  assertArray(document.candidates, 'LegacyAuditReport.candidates', {
    maximum: 10_000
  });
  document.candidates.forEach((candidate, index) => {
    const itemPath = `LegacyAuditReport.candidates[${index}]`;
    assertExactObject(candidate, itemPath, [
      'relative_path', 'title', 'folder_hint', 'lane_hint', 'source_url',
      'artifact_sha256', 'occupied_extent', 'duplicate_of', 'outcome', 'reason'
    ]);
    assertString(candidate.relative_path, `${itemPath}.relative_path`, {
      maximum: 4096
    });
    assertString(candidate.title, `${itemPath}.title`, { maximum: 512 });
    assertString(candidate.folder_hint, `${itemPath}.folder_hint`, {
      maximum: 128
    });
    assertEnum(candidate.lane_hint, `${itemPath}.lane_hint`, SOURCE_LANES);
    assertNullable(candidate.source_url, (url) => {
      assertString(url, `${itemPath}.source_url`, { maximum: 4096 });
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        failContract('LEGACY_AUDIT_URL_INVALID', `${itemPath}.source_url`, url);
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        failContract(
          'LEGACY_AUDIT_URL_INVALID',
          `${itemPath}.source_url`,
          parsed.protocol
        );
      }
    });
    assertNullable(
      candidate.artifact_sha256,
      (hash) => assertSha256(hash, `${itemPath}.artifact_sha256`)
    );
    assertNullable(candidate.occupied_extent, (extent) => {
      assertArray(extent, `${itemPath}.occupied_extent`, {
        minimum: 3,
        maximum: 3
      });
      extent.forEach((axis, axisIndex) => {
        assertInteger(axis, `${itemPath}.occupied_extent[${axisIndex}]`, {
          minimum: 1
        });
      });
    });
    assertNullable(candidate.duplicate_of, (reference) => {
      assertString(reference, `${itemPath}.duplicate_of`, { maximum: 4096 });
    });
    assertEnum(candidate.outcome, `${itemPath}.outcome`, [
      'parsed', 'deferred', 'rejected'
    ]);
    assertString(candidate.reason, `${itemPath}.reason`, { maximum: 128 });
  });
  validateLegacySummary(document.summary, document.candidates);
  return deepFreeze(document);
}

function validateLegacySummary(summary, candidates) {
  const fields = [
    'candidate_count', 'house_hint_count', 'other_hint_count',
    'parsed_count', 'deferred_count', 'rejected_count',
    'duplicate_count', 'missing_provenance_count'
  ];
  assertExactObject(summary, 'LegacyAuditReport.summary', fields);
  const expected = {
    candidate_count: candidates.length,
    house_hint_count: candidates.filter((item) => item.lane_hint === 'houses').length,
    other_hint_count: candidates.filter(
      (item) => item.lane_hint === 'other-architecture'
    ).length,
    parsed_count: candidates.filter((item) => item.outcome === 'parsed').length,
    deferred_count: candidates.filter((item) => item.outcome === 'deferred').length,
    rejected_count: candidates.filter((item) => item.outcome === 'rejected').length,
    duplicate_count: candidates.filter(
      (item) => item.reason === 'exact_duplicate'
    ).length,
    missing_provenance_count: candidates.filter(
      (item) => item.reason === 'missing_provenance'
    ).length
  };
  for (const field of fields) {
    assertInteger(summary[field], `LegacyAuditReport.summary.${field}`, {
      minimum: 0
    });
    if (summary[field] !== expected[field]) {
      failContract(
        'LEGACY_AUDIT_SUMMARY_MISMATCH',
        `LegacyAuditReport.summary.${field}`,
        `${summary[field]} != ${expected[field]}`
      );
    }
  }
}
