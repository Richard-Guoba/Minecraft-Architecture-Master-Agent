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

test('intake report accepts only the legitimate R2 outcome shapes', () => {
  const shapes = [
    {
      name: 'raw parser limit before quarantine',
      apply(candidate) {
        Object.assign(candidate, {
          case_id: null,
          artifact_sha256: null,
          source_profile_file: null,
          outcome: 'deferred',
          reason: 'parser_limit'
        });
      }
    },
    {
      name: 'parser limit after quarantine',
      apply(candidate) {
        Object.assign(candidate, {
          source_profile_file: null,
          outcome: 'deferred',
          reason: 'parser_limit'
        });
      }
    },
    {
      name: 'unsafe read before quarantine',
      apply(candidate) {
        Object.assign(candidate, {
          case_id: null,
          artifact_sha256: null,
          source_profile_file: null,
          outcome: 'rejected',
          reason: 'malformed_or_unsafe_source'
        });
      }
    },
    {
      name: 'malformed parser result after quarantine',
      apply(candidate) {
        Object.assign(candidate, {
          source_profile_file: null,
          outcome: 'rejected',
          reason: 'malformed_or_unsafe_source'
        });
      }
    },
    {
      name: 'unsupported source after quarantine',
      apply(candidate) {
        Object.assign(candidate, {
          source_profile_file: null,
          outcome: 'deferred',
          reason: 'unsupported_format'
        });
      }
    },
    {
      name: 'duplicate without a first profile',
      apply(candidate) {
        Object.assign(candidate, {
          source_profile_file: null,
          outcome: 'duplicate',
          reason: 'exact_duplicate'
        });
      }
    },
    {
      name: 'duplicate reusing the first profile',
      apply(candidate) {
        Object.assign(candidate, {
          source_profile_file: `sources/${candidate.case_id}.json`,
          outcome: 'duplicate',
          reason: 'exact_duplicate'
        });
      }
    },
    {
      name: 'non-residential parsed reference profile',
      apply(candidate) {
        Object.assign(candidate, {
          source_profile_file: `sources/${candidate.case_id}.json`,
          outcome: 'deferred',
          reason: 'non_residential_reference_only'
        });
      }
    }
  ];
  for (const shape of shapes) {
    const report = validIntakeReportFixture();
    shape.apply(report.candidates[1]);
    refreshSummary(report);
    assert.doesNotThrow(
      () => validateIntakeReport(report),
      shape.name
    );
  }
});

test('intake report binds residential lifecycle reasons to submitted lanes', () => {
  const houseAsReference = validIntakeReportFixture();
  Object.assign(houseAsReference.candidates[0], {
    outcome: 'deferred',
    reason: 'non_residential_reference_only'
  });
  refreshSummary(houseAsReference);
  assert.throws(
    () => validateIntakeReport(houseAsReference),
    /INTAKE_REPORT_LANE_REASON_INVALID/u
  );

  const otherAsHouse = validIntakeReportFixture();
  Object.assign(otherAsHouse.candidates[1], {
    source_profile_file:
      `sources/${otherAsHouse.candidates[1].case_id}.json`,
    outcome: 'parsed',
    reason: 'residential_candidate_requires_review'
  });
  refreshSummary(otherAsHouse);
  assert.throws(
    () => validateIntakeReport(otherAsHouse),
    /INTAKE_REPORT_LANE_REASON_INVALID/u
  );
});

test('intake report rejects invalid outcome, identity, and profile relationships', () => {
  const mutations = [
    {
      name: 'outcome and reason pair',
      code: /INTAKE_REPORT_OUTCOME_REASON_INVALID/u,
      apply(report) {
        report.candidates[0].reason = 'parser_limit';
      }
    },
    {
      name: 'parsed candidate without identity or profile',
      code: /INTAKE_REPORT_IDENTITY_INVALID/u,
      apply(report) {
        Object.assign(report.candidates[0], {
          case_id: null,
          artifact_sha256: null,
          source_profile_file: null
        });
      }
    },
    {
      name: 'half-present exact identity',
      code: /INTAKE_REPORT_IDENTITY_INVALID/u,
      apply(report) {
        report.candidates[0].case_id = null;
      }
    },
    {
      name: 'unsupported source without quarantined identity',
      code: /INTAKE_REPORT_IDENTITY_INVALID/u,
      apply(report) {
        Object.assign(report.candidates[1], {
          case_id: null,
          artifact_sha256: null,
          outcome: 'deferred',
          reason: 'unsupported_format'
        });
      }
    },
    {
      name: 'non-residential reference without profile',
      code: /INTAKE_REPORT_IDENTITY_INVALID/u,
      apply(report) {
        report.candidates[1].reason = 'non_residential_reference_only';
      }
    },
    {
      name: 'case ID not derived from exact hash',
      code: /INTAKE_REPORT_CASE_ID_MISMATCH/u,
      apply(report) {
        report.candidates[0].case_id = `case-${'c'.repeat(24)}`;
        report.candidates[0].source_profile_file =
          `sources/case-${'c'.repeat(24)}.json`;
      }
    },
    {
      name: 'profile path not exact for case',
      code: /INTAKE_REPORT_PROFILE_PATH_INVALID/u,
      apply(report) {
        report.candidates[0].source_profile_file = 'sources/unrelated.json';
      }
    }
  ];
  for (const mutation of mutations) {
    const report = validIntakeReportFixture();
    mutation.apply(report);
    refreshSummary(report);
    assert.throws(
      () => validateIntakeReport(report),
      mutation.code,
      mutation.name
    );
  }
});

test('intake report rejects duplicate observations and submitted paths', () => {
  const observation = validIntakeReportFixture();
  observation.candidates[1].observation_id =
    observation.candidates[0].observation_id;
  assert.throws(
    () => validateIntakeReport(observation),
    /INTAKE_REPORT_OBSERVATION_DUPLICATE/u
  );

  const submitted = validIntakeReportFixture();
  submitted.candidates[1].submitted =
    structuredClone(submitted.candidates[0].submitted);
  assert.throws(
    () => validateIntakeReport(submitted),
    /INTAKE_REPORT_SUBMITTED_PATH_DUPLICATE/u
  );
});

test('legacy report retains missing provenance without fabricating a profile', () => {
  const result = validateLegacyAuditReport(validLegacyAuditReportFixture());
  assert.equal(result.candidates[0].source_url, null);
  assert.equal(result.candidates[0].reason, 'missing_provenance');
  assert.equal(Object.hasOwn(result.candidates[0], 'source_profile_file'), false);
});

function refreshSummary(report) {
  report.summary = {
    candidate_count: report.candidates.length,
    quarantined_count: report.candidates.filter(
      (item) => item.case_id !== null
    ).length,
    parsed_count: report.candidates.filter(
      (item) => item.outcome === 'parsed'
    ).length,
    deferred_count: report.candidates.filter(
      (item) => item.outcome === 'deferred'
    ).length,
    rejected_count: report.candidates.filter(
      (item) => item.outcome === 'rejected'
    ).length,
    duplicate_count: report.candidates.filter(
      (item) => item.outcome === 'duplicate'
    ).length,
    source_profile_count: report.candidates.filter(
      (item) => item.source_profile_file !== null
    ).length
  };
}
