import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateIntakeReport,
  validateLegacyAuditReport,
  validateSourceBatchManifest
} from '../src/training/residential/contracts/index.js';
import {
  validIntakeReportFixture,
  validLegacyAuditReportFixture,
  validSourceBatchManifestFixture
} from './fixtures/residentialContractFixtures.js';

test('source batch accepts exactly the two physical lanes', () => {
  const result = validateSourceBatchManifest(validSourceBatchManifestFixture());
  assert.ok(Object.isFrozen(result));
  assert.equal(result.candidates[0].lane, 'houses');
  assert.equal(result.candidates[1].lane, 'other-architecture');
});

test('source batch rejects lane mismatches, duplicate paths, and guessed fields', () => {
  const mismatch = validSourceBatchManifestFixture();
  mismatch.candidates[0].lane = 'other-architecture';
  assert.throws(
    () => validateSourceBatchManifest(mismatch),
    /SOURCE_BATCH_LANE_PATH_MISMATCH/u
  );

  const duplicate = validSourceBatchManifestFixture();
  duplicate.candidates[1].relative_path = duplicate.candidates[0].relative_path;
  duplicate.candidates[1].lane = 'houses';
  assert.throws(
    () => validateSourceBatchManifest(duplicate),
    /SOURCE_BATCH_PATH_DUPLICATE/u
  );

  const unknown = validSourceBatchManifestFixture();
  unknown.candidates[0].style = 'modern';
  assert.throws(
    () => validateSourceBatchManifest(unknown),
    /CONTRACT_FIELD_UNKNOWN/u
  );
});

test('source batch rejects unsafe paths and invalid provenance', () => {
  for (const relativePath of [
    '../house.schem',
    '/house.schem',
    'houses/../../house.schem',
    'houses/modern/house.schem',
    'House/house.schem',
    'houses\\house.schem'
  ]) {
    const manifest = validSourceBatchManifestFixture();
    manifest.candidates[0].relative_path = relativePath;
    assert.throws(
      () => validateSourceBatchManifest(manifest),
      /CONTRACT_ARTIFACT_PATH_INVALID|SOURCE_BATCH_LANE_PATH_MISMATCH/u,
      relativePath
    );
  }

  const origin = validSourceBatchManifestFixture();
  origin.candidates[0].origin.url = 'file:///tmp/source.schem';
  assert.throws(
    () => validateSourceBatchManifest(origin),
    /SOURCE_BATCH_URL_INVALID/u
  );
});

test('intake report validates summary counts and nullable profile paths', () => {
  const result = validateIntakeReport(validIntakeReportFixture());
  assert.equal(result.summary.candidate_count, 2);
  assert.equal(result.candidates[1].source_profile_file, null);

  const badCount = validIntakeReportFixture();
  badCount.summary.deferred_count = 0;
  assert.throws(
    () => validateIntakeReport(badCount),
    /INTAKE_REPORT_SUMMARY_MISMATCH/u
  );
});

test('legacy report retains missing provenance without fabricating a profile', () => {
  const result = validateLegacyAuditReport(validLegacyAuditReportFixture());
  assert.equal(result.candidates[0].source_url, null);
  assert.equal(result.candidates[0].reason, 'missing_provenance');
  assert.equal(Object.hasOwn(result.candidates[0], 'source_profile_file'), false);
});
