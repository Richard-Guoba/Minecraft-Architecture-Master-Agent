# Residential Renderer R2 Source Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe, deterministic residential source-intake workflow that organizes new downloads into two lanes, preserves immutable local identities and provenance, parses supported Minecraft structures within explicit limits, produces honest `SourceProfile` records and reports, and audits all 64 legacy templates without moving or copying them.

**Architecture:** Extend the existing Node.js residential package with strict source-batch and report contracts plus focused modules for batch scaffolding, inventory, bounded artifact parsing, content-addressed quarantine, profile creation, and legacy audit. New batch intake is write-capable only below `.local/residential-model/`; legacy audit is read-only with respect to `mc_templates/`. R2 stops at `parsed` or `deferred`: it never infers residential quality, marks a house `eligible`, creates annotations or datasets, or changes the production generator.

**Tech Stack:** Node.js 20+ ES modules, built-in `node:test`, `node:assert/strict`, `node:crypto`, `node:fs/promises`, `node:path`, existing residential R1 contracts/workspace code, existing bounded NBT and vanilla structure adapters, and existing categorical structural fingerprints. No new npm or Python dependency.

## Global Constraints

- Target Minecraft Java version remains exactly `1.21.1`; datapack `pack_format` remains `48`.
- New collection uses exactly two submitted lanes: `houses` and `other-architecture`.
- A folder lane is a collector claim, never eligibility evidence.
- Detailed style, type, scale, material, furnishing, decoration, quality, and learning-role classification remains metadata for R3/R4, not new physical subfolders.
- Supported R2 profile formats are exactly Sponge/WorldEdit `.schem`, legacy `.schematic`, and vanilla Java structure `.nbt`.
- Unsupported formats, including `.litematic`, remain preserved and reported as `unsupported_format`; their extensions are never changed.
- `SourceProfile` statuses remain exactly `quarantined`, `parsed`, `eligible`, `deferred`, and `rejected`.
- Non-residential references use `status: "deferred"` with decision reason `non_residential_reference_only`; do not add a `deferred_non_residential` status.
- R2 never emits `status: "eligible"`. Residential completeness, furnishing, survival core, and supported-content evidence remain `unknown`.
- Version-one residential output resolution remains `64 x 64 x 64`; sources whose occupied extent exceeds any axis of 64 are deferred and never cropped, rescaled, tiled, or split.
- Every new payload and derivative remains below `.local/residential-model/`, which is ignored by Git.
- Existing `.local/` content must not be deleted, moved, overwritten, published, exposed, or scanned by a broad recursive cleanup.
- Legacy `mc_templates/` files remain at their current paths and byte content. R2 legacy audit does not copy, move, rename, rewrite, or quarantine them.
- All 64 supported legacy templates are examined. Existing folder names are hints only; `mc_templates/House/` is not an automatic admission boundary.
- Exact-byte identities are content-addressed. A rerun of an unchanged batch returns the existing report and does not add identities, decisions, or writes.
- A changed manifest may not reuse a completed batch ID.
- Source bytes are read through a no-follow regular-file boundary with a raw limit of 64 MiB.
- NBT limits are explicit: 128 MiB inflated bytes, compression ratio at most 200, nesting depth at most 32, string length at most 32 KiB, palette entries at most 4,096, block entities at most 16,384, attached entities at most 16,384, and inspected volume cells at most 16,777,216.
- Manifest validation and path inventory finish before quarantine or report writes begin.
- No source URL, author, license, acquisition time, or permission is guessed. Missing legacy provenance remains visibly deferred.
- `package.json` continues exposing exactly four `training:*` scripts. R2 extends `residential:workspace`; it does not add another training command.
- `construction_method_v1`, the current Stage 7 preparation/training workflow, and primary generation remain unchanged.
- Do not create a repository-local `.venv`; existing training remains in Conda environment `mcagent-stage7`.
- Every behavior change begins with a failing test, receives the minimum implementation, passes its focused tests, and ends with a scoped commit.

---

## File Structure

### New tracked files

```text
src/training/residential/
  intake/
    canonicalJson.js
    batch.js
    limits.js
    schematicArtifact.js
    artifactParser.js
    storage.js
    profileBuilder.js
    intakeBatch.js
    legacyAudit.js
    index.js
  contracts/
    sourceBatch.js
    intakeReport.js
    legacyAuditReport.js

test/
  fixtures/
    residentialIntakeFixtures.js
  residentialSourceBatchContracts.test.js
  residentialSourceBatch.test.js
  residentialSchematicArtifact.test.js
  residentialArtifactParser.test.js
  residentialIntakeStorage.test.js
  residentialBatchIntake.test.js
  residentialLegacyAudit.test.js
  residentialIntakeIntegration.test.js
```

### Existing files modified

```text
src/training/boundedNbt.js
src/training/residential/contracts/vocabularies.js
src/training/residential/contracts/index.js
src/runResidentialWorkspace.js

test/trainingBoundedNbt.test.js
test/fixtures/residentialContractFixtures.js
test/residentialContractCore.test.js
test/residentialWorkspaceCli.test.js
test/docsProjectStatus.test.js

README.md
docs/architecture.md
docs/residential-model/README.md
```

### Responsibility map

| Unit | Responsibility | Must not do |
| --- | --- | --- |
| `contracts/sourceBatch.js` | Validate the pre-parse two-lane manifest and provenance | Read source files or infer provenance |
| `contracts/intakeReport.js` | Validate deterministic new-batch outcomes and summary counts | Mutate profiles or source bytes |
| `contracts/legacyAuditReport.js` | Validate read-only legacy audit evidence, including missing provenance | Pretend a legacy audit is a `SourceProfile` |
| `intake/canonicalJson.js` | Stable key-sorted JSON bytes and SHA-256 | Read or write files |
| `intake/batch.js` | Atomically scaffold and safely inventory one named batch | Parse NBT or quarantine bytes |
| `intake/limits.js` | Freeze all R2 raw, inflated, parser, palette, entity, and volume limits | Apply status decisions |
| `intake/schematicArtifact.js` | Convert bounded NBT for `.schem`/`.schematic` into a validated block-volume interface | Read paths or write artifacts |
| `intake/artifactParser.js` | Dispatch formats, measure occupied bounds, tokenize blocks, and fingerprint | Decide residential quality |
| `intake/storage.js` | No-follow reads, immutable content-addressed quarantine, and write-once JSON | Overwrite existing local evidence |
| `intake/profileBuilder.js` | Build valid parsed/deferred R1 `SourceProfile` documents | Invent evidence or emit `eligible` |
| `intake/intakeBatch.js` | Orchestrate validated inventory through quarantine, parsing, profiles, and report | Search/download sources or modify inbox files |
| `intake/legacyAudit.js` | Audit all tracked legacy templates and consume existing URL hints | Move/copy templates or create false provenance |
| `runResidentialWorkspace.js` | Parse and render the five residential workspace commands | Add training or production-generation actions |

### On-disk local layout after R2

```text
.local/residential-model/
  inbox/
    <batch-id>/
      batch-manifest.json
      houses/
      other-architecture/
  quarantine/
    case-<first-24-sha256-characters>/
      identity.json
      payload
      fingerprint.json
  sources/
    case-<first-24-sha256-characters>.json
  reports/
    intake-<batch-id>.json
    legacy-audit.json
```

The `quarantine/` case directory represents one exact byte identity. A second
observation of those bytes remains visible in its batch report but does not
create another payload or `SourceProfile`.

---

### Task 1: Strict source-batch and report contracts

**Files:**

- Modify: `src/training/residential/contracts/vocabularies.js`
- Create: `src/training/residential/contracts/sourceBatch.js`
- Create: `src/training/residential/contracts/intakeReport.js`
- Create: `src/training/residential/contracts/legacyAuditReport.js`
- Modify: `src/training/residential/contracts/index.js`
- Modify: `test/fixtures/residentialContractFixtures.js`
- Create: `test/residentialSourceBatchContracts.test.js`
- Modify: `test/residentialContractCore.test.js`

**Interfaces:**

- Produces: `SOURCE_BATCH_SOURCE = "residential-source-batch-v1"`
- Produces: `INTAKE_REPORT_SOURCE = "residential-intake-report-v1"`
- Produces: `LEGACY_AUDIT_REPORT_SOURCE = "residential-legacy-audit-v1"`
- Produces: `SOURCE_LANES = Object.freeze(["houses", "other-architecture"])`
- Produces: `validateSourceBatchManifest(value)`
- Produces: `validateSourceCandidate(value, path?)`
- Produces: `validateIntakeReport(value)`
- Produces: `validateLegacyAuditReport(value)`
- Consumes: R1 validation helpers and `RESIDENTIAL_SCHEMA_VERSION`

- [ ] **Step 1: Write failing contract tests**

Create `test/residentialSourceBatchContracts.test.js`:

```js
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
  assert.equal(
    result.candidates[1].lane,
    'other-architecture'
  );
});

test('source batch rejects lane mismatches, duplicate paths, and guessed fields', () => {
  const mismatch = validSourceBatchManifestFixture();
  mismatch.candidates[0].lane = 'other-architecture';
  assert.throws(
    () => validateSourceBatchManifest(mismatch),
    /SOURCE_BATCH_LANE_PATH_MISMATCH/u
  );

  const duplicate = validSourceBatchManifestFixture();
  duplicate.candidates[1].relative_path =
    duplicate.candidates[0].relative_path;
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
  assert.equal(
    Object.hasOwn(result.candidates[0], 'source_profile_file'),
    false
  );
});
```

Append these fixtures to `test/fixtures/residentialContractFixtures.js`:

```js
export function validSourceBatchManifestFixture() {
  return {
    source: 'residential-source-batch-v1',
    schema_version: 1,
    batch_id: '2026-07-24-fixture-001',
    source_project: 'fixture-project',
    candidates: [
      {
        relative_path: 'houses/warm-house.schem',
        lane: 'houses',
        title: 'Warm Survival House',
        origin: {
          url: 'https://example.invalid/warm-house',
          author: 'Fixture Builder',
          license_status: 'recorded',
          license_text: 'Local training allowed.',
          allowed_uses: ['local-analysis', 'local-training'],
          acquired_at: '2026-07-24T12:00:00.000Z'
        },
        collector_note: 'Complete furnished residence.'
      },
      {
        relative_path: 'other-architecture/clock-tower.schematic',
        lane: 'other-architecture',
        title: 'Clock Tower',
        origin: {
          url: 'https://example.invalid/clock-tower',
          author: '',
          license_status: 'unknown',
          license_text: '',
          allowed_uses: ['local-analysis'],
          acquired_at: '2026-07-24T12:01:00.000Z'
        },
        collector_note: 'Reference-only landmark.'
      }
    ]
  };
}

export function validIntakeReportFixture() {
  const manifest = validSourceBatchManifestFixture();
  return {
    source: 'residential-intake-report-v1',
    schema_version: 1,
    operation: 'batch_intake',
    batch_id: manifest.batch_id,
    source_project: manifest.source_project,
    manifest_sha256: 'd'.repeat(64),
    summary: {
      candidate_count: 2,
      quarantined_count: 2,
      parsed_count: 1,
      deferred_count: 1,
      rejected_count: 0,
      duplicate_count: 0,
      source_profile_count: 1
    },
    candidates: [
      {
        observation_id: 'observation-house-001',
        submitted: manifest.candidates[0],
        case_id: 'case-' + 'a'.repeat(24),
        artifact_sha256: 'a'.repeat(64),
        source_profile_file:
          'sources/case-' + 'a'.repeat(24) + '.json',
        outcome: 'parsed',
        reason: 'residential_candidate_requires_review'
      },
      {
        observation_id: 'observation-tower-001',
        submitted: manifest.candidates[1],
        case_id: 'case-' + 'b'.repeat(24),
        artifact_sha256: 'b'.repeat(64),
        source_profile_file: null,
        outcome: 'deferred',
        reason: 'occupied_bounds_exceed_64'
      }
    ]
  };
}

export function validLegacyAuditReportFixture() {
  return {
    source: 'residential-legacy-audit-v1',
    schema_version: 1,
    root: 'mc_templates',
    inventory_sha256: 'e'.repeat(64),
    summary: {
      candidate_count: 1,
      house_hint_count: 1,
      other_hint_count: 0,
      parsed_count: 0,
      deferred_count: 1,
      rejected_count: 0,
      duplicate_count: 0,
      missing_provenance_count: 1
    },
    candidates: [
      {
        relative_path: 'House/Fixture House.schematic',
        title: 'Fixture House',
        folder_hint: 'House',
        lane_hint: 'houses',
        source_url: null,
        artifact_sha256: 'f'.repeat(64),
        occupied_extent: [12, 8, 10],
        duplicate_of: null,
        outcome: 'deferred',
        reason: 'missing_provenance'
      }
    ]
  };
}
```

- [ ] **Step 2: Run the contract tests and verify failure**

Run:

```bash
node --test test/residentialSourceBatchContracts.test.js test/residentialContractCore.test.js
```

Expected: FAIL because the new constants, fixtures, and validators are not yet exported.

- [ ] **Step 3: Add source constants and strict manifest validation**

Append to `src/training/residential/contracts/vocabularies.js`:

```js
export const SOURCE_BATCH_SOURCE = 'residential-source-batch-v1';
export const INTAKE_REPORT_SOURCE = 'residential-intake-report-v1';
export const LEGACY_AUDIT_REPORT_SOURCE = 'residential-legacy-audit-v1';
export const SOURCE_LANES = frozen(['houses', 'other-architecture']);
```

Create `src/training/residential/contracts/sourceBatch.js` with:

```js
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
```

- [ ] **Step 4: Add deterministic report validators**

Create `src/training/residential/contracts/intakeReport.js`:

```js
import {
  assertArtifactPath,
  assertArray,
  assertEnum,
  assertExactObject,
  assertId,
  assertInteger,
  assertNullable,
  assertSha256,
  assertString,
  cloneDocument,
  deepFreeze
} from './validation.js';
import { failContract } from './contractError.js';
import { validateSourceCandidate } from './sourceBatch.js';
import {
  INTAKE_REPORT_SOURCE,
  RESIDENTIAL_SCHEMA_VERSION
} from './vocabularies.js';

const OUTCOMES = ['parsed', 'deferred', 'rejected', 'duplicate'];

export function validateIntakeReport(value) {
  const document = cloneDocument(value, 'IntakeReport');
  assertExactObject(document, 'IntakeReport', [
    'source', 'schema_version', 'operation', 'batch_id', 'source_project',
    'manifest_sha256', 'summary', 'candidates'
  ]);
  if (document.source !== INTAKE_REPORT_SOURCE) {
    failContract('INTAKE_REPORT_SOURCE_INVALID', 'IntakeReport.source', document.source);
  }
  if (document.schema_version !== RESIDENTIAL_SCHEMA_VERSION) {
    failContract(
      'INTAKE_REPORT_VERSION_INVALID',
      'IntakeReport.schema_version',
      document.schema_version
    );
  }
  assertEnum(document.operation, 'IntakeReport.operation', ['batch_intake']);
  assertId(document.batch_id, 'IntakeReport.batch_id');
  assertId(document.source_project, 'IntakeReport.source_project');
  assertSha256(document.manifest_sha256, 'IntakeReport.manifest_sha256');
  assertArray(document.candidates, 'IntakeReport.candidates', {
    maximum: 10_000
  });
  const observations = new Set();
  document.candidates.forEach((candidate, index) => {
    const itemPath = `IntakeReport.candidates[${index}]`;
    assertExactObject(candidate, itemPath, [
      'observation_id', 'submitted', 'case_id', 'artifact_sha256',
      'source_profile_file', 'outcome', 'reason'
    ]);
    assertId(candidate.observation_id, `${itemPath}.observation_id`);
    if (observations.has(candidate.observation_id)) {
      failContract(
        'INTAKE_REPORT_OBSERVATION_DUPLICATE',
        `${itemPath}.observation_id`,
        candidate.observation_id
      );
    }
    observations.add(candidate.observation_id);
    validateSourceCandidate(candidate.submitted, `${itemPath}.submitted`);
    assertNullable(candidate.case_id, (item) => assertId(item, `${itemPath}.case_id`));
    assertNullable(
      candidate.artifact_sha256,
      (item) => assertSha256(item, `${itemPath}.artifact_sha256`)
    );
    assertNullable(candidate.source_profile_file, (item) => {
      assertArtifactPath(item, `${itemPath}.source_profile_file`);
      if (!item.startsWith('sources/')) {
        failContract(
          'INTAKE_REPORT_PROFILE_PATH_INVALID',
          `${itemPath}.source_profile_file`,
          item
        );
      }
    });
    assertEnum(candidate.outcome, `${itemPath}.outcome`, OUTCOMES);
    assertId(candidate.reason, `${itemPath}.reason`);
  });
  validateSummary(document.summary, document.candidates);
  return deepFreeze(document);
}

function validateSummary(summary, candidates) {
  const path = 'IntakeReport.summary';
  const fields = [
    'candidate_count', 'quarantined_count', 'parsed_count', 'deferred_count',
    'rejected_count', 'duplicate_count', 'source_profile_count'
  ];
  assertExactObject(summary, path, fields);
  fields.forEach((field) => {
    assertInteger(summary[field], `${path}.${field}`, { minimum: 0 });
  });
  const expected = {
    candidate_count: candidates.length,
    quarantined_count: candidates.filter((item) => item.case_id !== null).length,
    parsed_count: candidates.filter((item) => item.outcome === 'parsed').length,
    deferred_count: candidates.filter((item) => item.outcome === 'deferred').length,
    rejected_count: candidates.filter((item) => item.outcome === 'rejected').length,
    duplicate_count: candidates.filter((item) => item.outcome === 'duplicate').length,
    source_profile_count: candidates.filter(
      (item) => item.source_profile_file !== null
    ).length
  };
  for (const field of fields) {
    if (summary[field] !== expected[field]) {
      failContract(
        'INTAKE_REPORT_SUMMARY_MISMATCH',
        `${path}.${field}`,
        `${summary[field]} != ${expected[field]}`
      );
    }
  }
}
```

Create `src/training/residential/contracts/legacyAuditReport.js` with the
same strict-clone/freeze pattern and these exact candidate fields:

```js
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
          minimum: 1,
          maximum: 65_535
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
```

- [ ] **Step 5: Export the contracts and verify focused tests**

Add the three validators to
`src/training/residential/contracts/index.js`. Extend
`test/residentialContractCore.test.js` to assert that the three source
constants and `SOURCE_LANES` are frozen and exact.

Run:

```bash
node --test test/residentialSourceBatchContracts.test.js test/residentialContractCore.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the contract slice**

```bash
git add src/training/residential/contracts test/fixtures/residentialContractFixtures.js test/residentialSourceBatchContracts.test.js test/residentialContractCore.test.js
git commit -m "feat(residential): define R2 source intake contracts"
```

---

### Task 2: Atomic batch scaffolding and safe inventory

**Files:**

- Create: `src/training/residential/intake/canonicalJson.js`
- Create: `src/training/residential/intake/batch.js`
- Create: `src/training/residential/intake/index.js`
- Create: `test/residentialSourceBatch.test.js`

**Interfaces:**

- Consumes: `validateSourceBatchManifest`, `validateResidentialWorkspaceRoot`, and the initialized R1 workspace
- Produces: `canonicalJson(value): string`
- Produces: `canonicalSha256(value): string`
- Produces: `initializeSourceBatch({ root, batchId, sourceProject, projectRoot }): Promise<BatchInventory>`
- Produces: `inventorySourceBatch({ root, batchId, projectRoot }): Promise<BatchInventory>`
- `BatchInventory` contains `batch_path`, `manifest`, `manifest_sha256`, and sorted candidates with absolute and relative paths

- [ ] **Step 1: Write failing batch lifecycle and path-safety tests**

Create `test/residentialSourceBatch.test.js`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  initializeResidentialWorkspace
} from '../src/training/residential/workspace/index.js';
import {
  initializeSourceBatch,
  inventorySourceBatch
} from '../src/training/residential/intake/index.js';
import {
  validSourceBatchManifestFixture
} from './fixtures/residentialContractFixtures.js';

async function fixture(t) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-batch-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  await fs.mkdir(path.join(projectRoot, '.local'));
  const root = path.join(projectRoot, '.local', 'residential-model');
  await initializeResidentialWorkspace({ root, projectRoot });
  return { projectRoot, root };
}

test('batch initialization is atomic and creates exactly two lanes', async (t) => {
  const local = await fixture(t);
  const first = await initializeSourceBatch({
    ...local,
    batchId: '2026-07-24-fixture-001',
    sourceProject: 'fixture-project'
  });
  const second = await initializeSourceBatch({
    ...local,
    batchId: '2026-07-24-fixture-001',
    sourceProject: 'fixture-project'
  });
  assert.deepEqual(second, first);
  assert.deepEqual(
    await fs.readdir(first.batch_path),
    ['batch-manifest.json', 'houses', 'other-architecture']
  );
  assert.deepEqual(first.manifest.candidates, []);
});

test('inventory requires listed regular files and rejects unlisted payloads', async (t) => {
  const local = await fixture(t);
  const initialized = await initializeSourceBatch({
    ...local,
    batchId: '2026-07-24-fixture-001',
    sourceProject: 'fixture-project'
  });
  const manifest = validSourceBatchManifestFixture();
  await fs.writeFile(
    path.join(initialized.batch_path, 'batch-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
  await fs.writeFile(
    path.join(initialized.batch_path, manifest.candidates[0].relative_path),
    'house'
  );
  await fs.writeFile(
    path.join(initialized.batch_path, manifest.candidates[1].relative_path),
    'tower'
  );
  const inventory = await inventorySourceBatch({
    ...local,
    batchId: manifest.batch_id
  });
  assert.deepEqual(
    inventory.candidates.map((item) => item.relative_path),
    manifest.candidates.map((item) => item.relative_path).sort()
  );

  await fs.writeFile(
    path.join(initialized.batch_path, 'houses', 'unlisted.schem'),
    'unlisted'
  );
  await assert.rejects(
    inventorySourceBatch({ ...local, batchId: manifest.batch_id }),
    /SOURCE_BATCH_UNLISTED_PAYLOAD/u
  );
});

test('inventory rejects missing files, symlinks, and unknown root entries before writes', async (t) => {
  const local = await fixture(t);
  const initialized = await initializeSourceBatch({
    ...local,
    batchId: '2026-07-24-fixture-001',
    sourceProject: 'fixture-project'
  });
  const manifest = validSourceBatchManifestFixture();
  await fs.writeFile(
    path.join(initialized.batch_path, 'batch-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
  await fs.writeFile(
    path.join(initialized.batch_path, manifest.candidates[1].relative_path),
    'tower'
  );
  await fs.symlink(
    manifest.candidates[1].relative_path,
    path.join(initialized.batch_path, manifest.candidates[0].relative_path)
  );
  await assert.rejects(
    inventorySourceBatch({ ...local, batchId: manifest.batch_id }),
    /SOURCE_BATCH_SYMLINK/u
  );
  await fs.unlink(
    path.join(initialized.batch_path, manifest.candidates[0].relative_path)
  );
  await fs.mkdir(path.join(initialized.batch_path, 'modern'));
  await assert.rejects(
    inventorySourceBatch({ ...local, batchId: manifest.batch_id }),
    /SOURCE_BATCH_ROOT_ENTRY_INVALID/u
  );
});
```

- [ ] **Step 2: Run the batch tests and verify failure**

Run:

```bash
node --test test/residentialSourceBatch.test.js
```

Expected: FAIL because the intake package and batch functions do not exist.

- [ ] **Step 3: Implement canonical JSON**

Create `src/training/residential/intake/canonicalJson.js`:

```js
import { createHash } from 'node:crypto';

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

export function canonicalSha256(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortValue(child)])
    );
  }
  return value;
}
```

- [ ] **Step 4: Implement atomic batch creation and complete inventory**

Create `src/training/residential/intake/batch.js` around these exact rules:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { failContract } from '../contracts/contractError.js';
import {
  SOURCE_BATCH_SOURCE,
  SOURCE_LANES,
  RESIDENTIAL_SCHEMA_VERSION
} from '../contracts/vocabularies.js';
import {
  validateSourceBatchManifest
} from '../contracts/sourceBatch.js';
import {
  readResidentialWorkspaceStatus,
  validateResidentialWorkspaceRoot
} from '../workspace/index.js';
import { canonicalSha256 } from './canonicalJson.js';

export async function initializeSourceBatch(options) {
  const root = await readyRoot(options);
  const seed = validateSourceBatchManifest({
    source: SOURCE_BATCH_SOURCE,
    schema_version: RESIDENTIAL_SCHEMA_VERSION,
    batch_id: options.batchId,
    source_project: options.sourceProject,
    candidates: []
  });
  const target = path.join(root, 'inbox', seed.batch_id);
  const existing = await safeLstat(target);
  if (existing) {
    const inventory = await inventorySourceBatch(options);
    if (inventory.manifest.source_project !== seed.source_project) {
      failContract(
        'SOURCE_BATCH_CONFLICT',
        'SourceBatch.source_project',
        inventory.manifest.source_project
      );
    }
    return inventory;
  }
  const temporary = await fs.mkdtemp(
    path.join(root, 'inbox', `.${seed.batch_id}.tmp-`)
  );
  let cleanup = true;
  try {
    for (const lane of SOURCE_LANES) {
      await fs.mkdir(path.join(temporary, lane));
    }
    await writeExclusive(
      path.join(temporary, 'batch-manifest.json'),
      JSON.stringify(seed, null, 2) + '\n'
    );
    try {
      await fs.rename(temporary, target);
      cleanup = false;
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
    }
  } finally {
    if (cleanup) {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  }
  return inventorySourceBatch(options);
}

export async function inventorySourceBatch(options) {
  const root = await readyRoot(options);
  const batchId = String(options.batchId || '');
  if (!/^[a-z0-9][a-z0-9_.:-]{0,127}$/u.test(batchId)) {
    failContract('CONTRACT_ID_INVALID', 'SourceBatch.batch_id', batchId);
  }
  const batchPath = path.join(root, 'inbox', batchId);
  const batchEntry = await safeLstat(batchPath);
  if (!batchEntry?.isDirectory() || batchEntry.isSymbolicLink()) {
    failContract('SOURCE_BATCH_DIRECTORY_INVALID', 'SourceBatch.directory', batchPath);
  }
  await validateRootEntries(batchPath);
  const manifestPath = path.join(batchPath, 'batch-manifest.json');
  const manifestEntry = await safeLstat(manifestPath);
  if (!manifestEntry?.isFile() || manifestEntry.isSymbolicLink()) {
    failContract('SOURCE_BATCH_MANIFEST_INVALID', 'SourceBatch.manifest', manifestPath);
  }
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    failContract(
      'SOURCE_BATCH_MANIFEST_INVALID',
      'SourceBatch.manifest',
      error?.message || 'invalid JSON'
    );
  }
  const manifest = validateSourceBatchManifest(raw);
  if (manifest.batch_id !== batchId) {
    failContract(
      'SOURCE_BATCH_ID_MISMATCH',
      'SourceBatch.batch_id',
      `${manifest.batch_id} != ${batchId}`
    );
  }
  const discovered = [];
  for (const lane of SOURCE_LANES) {
    const entries = await fs.readdir(path.join(batchPath, lane), {
      withFileTypes: true
    });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = `${lane}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        failContract('SOURCE_BATCH_SYMLINK', 'SourceBatch.payload', relative);
      }
      if (!entry.isFile()) {
        failContract(
          'SOURCE_BATCH_NESTED_DIRECTORY',
          'SourceBatch.payload',
          relative
        );
      }
      discovered.push(relative);
    }
  }
  discovered.sort((left, right) => left.localeCompare(right));
  const listed = manifest.candidates
    .map((item) => item.relative_path)
    .sort((left, right) => left.localeCompare(right));
  for (const relative of discovered) {
    if (!listed.includes(relative)) {
      failContract(
        'SOURCE_BATCH_UNLISTED_PAYLOAD',
        'SourceBatch.candidates',
        relative
      );
    }
  }
  for (const relative of listed) {
    if (!discovered.includes(relative)) {
      failContract(
        'SOURCE_BATCH_PAYLOAD_MISSING',
        'SourceBatch.candidates',
        relative
      );
    }
  }
  const byPath = new Map(
    manifest.candidates.map((item) => [item.relative_path, item])
  );
  return Object.freeze({
    batch_path: batchPath,
    manifest,
    manifest_sha256: canonicalSha256(manifest),
    candidates: Object.freeze(listed.map((relative) => Object.freeze({
      relative_path: relative,
      absolute_path: path.join(batchPath, ...relative.split('/')),
      submitted: byPath.get(relative)
    })))
  });
}
```

Add private helpers that:

- require `readResidentialWorkspaceStatus(...).state === "ready"`;
- accept only `batch-manifest.json`, `houses`, and `other-architecture` at
  the batch root;
- inspect both flat lane directories in lexical order and reject nested
  directories;
- reject every symlink with `SOURCE_BATCH_SYMLINK`;
- reject non-regular payload entries with `SOURCE_BATCH_ENTRY_INVALID`;
- normalize discovered paths with `/`; and
- use `fs.open(file, "wx", 0o600)` for the initial manifest.

These helpers contain no parser call and no write below `quarantine/`,
`sources/`, or `reports/`.

- [ ] **Step 5: Export the intake batch API and verify tests**

Create `src/training/residential/intake/index.js`:

```js
export {
  canonicalJson,
  canonicalSha256
} from './canonicalJson.js';
export {
  initializeSourceBatch,
  inventorySourceBatch
} from './batch.js';
```

Run:

```bash
node --test test/residentialSourceBatch.test.js test/residentialWorkspace.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the safe batch slice**

```bash
git add src/training/residential/intake test/residentialSourceBatch.test.js
git commit -m "feat(residential): add safe two-lane source batches"
```

---

### Task 3: Materialized bounded NBT arrays and schematic adapter

**Files:**

- Modify: `src/training/boundedNbt.js`
- Modify: `test/trainingBoundedNbt.test.js`
- Create: `src/training/residential/intake/limits.js`
- Create: `src/training/residential/intake/schematicArtifact.js`
- Create: `test/fixtures/residentialIntakeFixtures.js`
- Create: `test/residentialSchematicArtifact.test.js`

**Interfaces:**

- Consumes: existing `decodeBoundedNbt`, `TrainingDataError`, and categorical block naming rules
- Produces: optional `materializeArrays: true` for bounded byte/int/long NBT arrays; default descriptor behavior remains unchanged
- Produces: frozen `RESIDENTIAL_INTAKE_LIMITS`
- Produces: `decodeResidentialSchematic(bytes, { sourceId, format, limits? })`
- The schematic result exposes `format`, `declared_size`, `block_count`, `block_entity_count`, `entity_count`, and `blockAtIndex(index)`

- [ ] **Step 1: Add failing bounded-array and schematic tests**

Append to `test/trainingBoundedNbt.test.js`:

```js
test('bounded decoder materializes arrays only when explicitly requested', () => {
  const byteArray = Buffer.from([
    10, 0, 0,
    7, 0, 6, ...Buffer.from('Blocks'),
    0, 0, 0, 3, 1, 2, 3,
    0
  ]);
  const described = decodeBoundedNbt(byteArray, { sourceId: ID });
  const materialized = decodeBoundedNbt(byteArray, {
    sourceId: ID,
    materializeArrays: true
  });
  assert.equal(described.value.Blocks.nbt_array, 'byte');
  assert.deepEqual(materialized.value.Blocks, Buffer.from([1, 2, 3]));
});
```

Create `test/residentialSchematicArtifact.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeResidentialSchematic
} from '../src/training/residential/intake/schematicArtifact.js';
import {
  classicSchematic,
  spongeSchematic
} from './fixtures/residentialIntakeFixtures.js';

test('residential adapter decodes bounded legacy and Sponge schematics', () => {
  const legacy = decodeResidentialSchematic(classicSchematic(), {
    sourceId: 'fixture-legacy',
    format: 'schematic'
  });
  assert.deepEqual(legacy.declared_size, { x: 2, y: 2, z: 2 });
  assert.equal(legacy.blockAtIndex(0).name, 'stone');

  const sponge = decodeResidentialSchematic(spongeSchematic(), {
    sourceId: 'fixture-sponge',
    format: 'schem'
  });
  assert.equal(sponge.blockAtIndex(0).canonical_state, 'minecraft:oak_planks');
  assert.equal(sponge.blockAtIndex(1).air, true);
});

test('residential adapter rejects bad palette data and over-budget volume', () => {
  assert.throws(
    () => decodeResidentialSchematic(
      spongeSchematic({ width: 65_536, height: 1, length: 1 }),
      { sourceId: 'bad-volume', format: 'schem' }
    ),
    /SCHEMATIC_VOLUME_LIMIT|SCHEMATIC_DIMENSIONS_INVALID/u
  );
  assert.throws(
    () => decodeResidentialSchematic(
      spongeSchematic({ palette: { 'minecraft:stone': 2 } }),
      { sourceId: 'bad-palette', format: 'schem' }
    ),
    /SCHEMATIC_PALETTE_INVALID/u
  );
});
```

Create `test/fixtures/residentialIntakeFixtures.js` with deterministic NBT
encoders for:

- classic `Width`, `Height`, `Length`, and `Blocks`;
- Sponge `Width`, `Height`, `Length`, `Palette`, and varint `BlockData`;
- vanilla structure `size`, `palette`, and sparse `blocks`; and
- a `writeBatchFixture(...)` helper used by Tasks 6-9.

Reuse the explicit tag encoders from
`test/fixtures/stage7CandidateReadinessFixtures.js`; do not import test code
from production modules.

- [ ] **Step 2: Run parser tests and verify failure**

Run:

```bash
node --test test/trainingBoundedNbt.test.js test/residentialSchematicArtifact.test.js
```

Expected: FAIL because array materialization and the residential schematic
adapter do not exist.

- [ ] **Step 3: Add opt-in bounded array materialization**

Change `decodeBoundedNbt` to accept `materializeArrays = false`, pass it into
`Reader`, and replace `arrayDescriptor` with:

```js
arrayValue(kind, width) {
  const length = this.length('NBT_ARRAY_LENGTH_INVALID');
  this.charge(length);
  const byteLength = length * width;
  if (!Number.isSafeInteger(byteLength)) {
    fail('NBT_ARRAY_LENGTH_INVALID', this.sourceId);
  }
  this.ensure(byteLength);
  const start = this.offset;
  this.offset += byteLength;
  const bytes = this.buffer.subarray(start, this.offset);
  if (!this.materializeArrays) {
    return Object.freeze({
      nbt_array: kind,
      length,
      sha256: createHash('sha256').update(bytes).digest('hex')
    });
  }
  if (kind === 'byte') return Buffer.from(bytes);
  const output = [];
  for (let offset = 0; offset < bytes.length; offset += width) {
    output.push(
      kind === 'int'
        ? bytes.readInt32BE(offset)
        : bytes.readBigInt64BE(offset)
    );
  }
  return Object.freeze(output);
}
```

The default remains descriptors, so existing callers and memory behavior do
not change. `payload()` calls `arrayValue("byte", 1)`,
`arrayValue("int", 4)`, or `arrayValue("long", 8)`.

- [ ] **Step 4: Define exact R2 parser limits**

Create `src/training/residential/intake/limits.js`:

```js
export const RESIDENTIAL_INTAKE_LIMITS = Object.freeze({
  maxRawBytes: 64 * 1024 * 1024,
  maxInflatedBytes: 128 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxDepth: 32,
  maxEntries: 20_000_000,
  maxStringBytes: 32 * 1024,
  maxBlocks: 16_777_216,
  maxPaletteEntries: 4096,
  maxBlockEntities: 16_384,
  maxEntities: 16_384
});
```

- [ ] **Step 5: Implement the residential schematic adapter**

Create `src/training/residential/intake/schematicArtifact.js`. Its public
function first calls:

```js
const decoded = decodeBoundedNbt(bytes, {
  sourceId,
  limits,
  materializeArrays: true
});
```

Then it recognizes exactly:

1. legacy roots with positive `Width`, `Height`, `Length`, and byte-array
   `Blocks`;
2. Sponge roots with those dimensions, a plain-object `Palette`, and
   byte-array `BlockData`; and
3. region roots with one region, `Size`, `BlockStatePalette`, and
   materialized `BlockStates`.

For every recognized form:

- multiply dimensions with `Number.isSafeInteger`;
- reject volume above `limits.maxBlocks` as `SCHEMATIC_VOLUME_LIMIT`;
- require palette indices to be contiguous from zero;
- require decoded block count to equal the declared volume;
- reject truncated, overlong, or unterminated Sponge varints;
- reject palette size above `limits.maxPaletteEntries`;
- reject block/entity counts above their limits;
- reject command blocks, jigsaw blocks, and structure blocks with the same
  security codes used by the vanilla structure adapter; and
- return frozen block records containing `canonical_state`, `name`,
  `category`, and `air`.

Use this exact varint termination rule:

```js
function decodeVarints(bytes, expected, sourceId) {
  const values = new Uint32Array(expected);
  let offset = 0;
  for (let index = 0; index < expected; index += 1) {
    let value = 0;
    let shift = 0;
    let terminated = false;
    while (offset < bytes.length && shift <= 28) {
      const byte = bytes[offset++];
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        terminated = true;
        break;
      }
      shift += 7;
    }
    if (!terminated) fail('SCHEMATIC_BLOCK_DATA_INVALID', sourceId);
    values[index] = value >>> 0;
  }
  if (offset !== bytes.length) {
    fail('SCHEMATIC_BLOCK_DATA_INVALID', sourceId);
  }
  return values;
}
```

Use a local `fail(code, sourceId, metadata)` that throws
`TrainingDataError` with `stage: "schematic"`.

- [ ] **Step 6: Verify parser tests and existing compatibility**

Run:

```bash
node --test test/trainingBoundedNbt.test.js test/residentialSchematicArtifact.test.js test/schematicBlockVolume.test.js test/trainingSourceCatalog.test.js
```

Expected: PASS. The last two prove that the older Stage 7 schematic path is
unchanged.

- [ ] **Step 7: Commit the bounded parser slice**

```bash
git add src/training/boundedNbt.js src/training/residential/intake/limits.js src/training/residential/intake/schematicArtifact.js test/trainingBoundedNbt.test.js test/fixtures/residentialIntakeFixtures.js test/residentialSchematicArtifact.test.js
git commit -m "feat(residential): add bounded schematic intake adapter"
```

---

### Task 4: Unified artifact measurement and fingerprints

**Files:**

- Create: `src/training/residential/intake/artifactParser.js`
- Modify: `src/training/residential/intake/index.js`
- Create: `test/residentialArtifactParser.test.js`

**Interfaces:**

- Consumes: `decodeResidentialSchematic`, `decodeBoundedNbt`, `validateVanillaStructureNbt`, `mapTrainingToken`, and `fingerprintCategoricalEntries`
- Produces: `supportedResidentialFormat(filename): "schem" | "schematic" | "structure_nbt" | null`
- Produces: `parseResidentialArtifact({ bytes, originalFilename, sourceId, limits? })`
- Parser output contains exact hash, format, byte size, declared size, occupied bounds, entity counts, and the full existing structural fingerprint

- [ ] **Step 1: Write failing dispatch, bounds, and format tests**

Create `test/residentialArtifactParser.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseResidentialArtifact,
  supportedResidentialFormat
} from '../src/training/residential/intake/index.js';
import {
  classicSchematic,
  vanillaStructure
} from './fixtures/residentialIntakeFixtures.js';

test('format dispatch follows the original extension exactly', () => {
  assert.equal(supportedResidentialFormat('house.schem'), 'schem');
  assert.equal(supportedResidentialFormat('house.schematic'), 'schematic');
  assert.equal(supportedResidentialFormat('house.nbt'), 'structure_nbt');
  assert.equal(supportedResidentialFormat('house.litematic'), null);
  assert.equal(supportedResidentialFormat('house.schem.zip'), null);
});

test('artifact parser measures tight bounds and stable fingerprints', () => {
  const first = parseResidentialArtifact({
    bytes: classicSchematic(),
    originalFilename: 'fixture.schematic',
    sourceId: 'fixture-artifact'
  });
  const second = parseResidentialArtifact({
    bytes: classicSchematic(),
    originalFilename: 'fixture.schematic',
    sourceId: 'fixture-artifact'
  });
  assert.deepEqual(second, first);
  assert.deepEqual(first.occupied_bounds.extent, [1, 1, 1]);
  assert.match(first.exact_sha256, /^[a-f0-9]{64}$/u);
  assert.equal(
    first.structural_fingerprint.content_sha256,
    first.exact_sha256
  );
});

test('artifact parser supports sparse vanilla structures and rejects renamed data', () => {
  const result = parseResidentialArtifact({
    bytes: vanillaStructure(),
    originalFilename: 'fixture.nbt',
    sourceId: 'fixture-structure'
  });
  assert.equal(result.format, 'structure_nbt');
  assert.ok(result.occupied_bounds.extent.every((axis) => axis > 0));

  assert.throws(
    () => parseResidentialArtifact({
      bytes: classicSchematic(),
      originalFilename: 'renamed.nbt',
      sourceId: 'renamed-source'
    }),
    /STRUCTURE_FIELDS_INVALID/u
  );
});

test('unsupported extensions are deferred by a stable parser error', () => {
  assert.throws(
    () => parseResidentialArtifact({
      bytes: Buffer.from('fixture'),
      originalFilename: 'fixture.litematic',
      sourceId: 'unsupported-source'
    }),
    (error) => error.code === 'ARTIFACT_FORMAT_UNSUPPORTED'
  );
});
```

- [ ] **Step 2: Run artifact tests and verify failure**

Run:

```bash
node --test test/residentialArtifactParser.test.js
```

Expected: FAIL because the unified parser functions do not exist.

- [ ] **Step 3: Implement exact extension dispatch and normalized volume scanning**

Create `src/training/residential/intake/artifactParser.js` with:

```js
import { createHash } from 'node:crypto';
import path from 'node:path';
import { decodeBoundedNbt } from '../../boundedNbt.js';
import {
  fingerprintCategoricalEntries
} from '../../structuralFingerprint.js';
import { mapTrainingToken } from '../../tokenTaxonomy.js';
import {
  isAirIdentifier,
  validateVanillaStructureNbt
} from '../../vanillaStructureNbt.js';
import { TrainingDataError } from '../../trainingError.js';
import { RESIDENTIAL_INTAKE_LIMITS } from './limits.js';
import { decodeResidentialSchematic } from './schematicArtifact.js';

const FORMATS = new Map([
  ['.schem', 'schem'],
  ['.schematic', 'schematic'],
  ['.nbt', 'structure_nbt']
]);

export function supportedResidentialFormat(filename) {
  return FORMATS.get(path.extname(String(filename)).toLowerCase()) ?? null;
}

export function parseResidentialArtifact({
  bytes,
  originalFilename,
  sourceId,
  limits = RESIDENTIAL_INTAKE_LIMITS
}) {
  const format = supportedResidentialFormat(originalFilename);
  if (!format) {
    throw new TrainingDataError(
      'ARTIFACT_FORMAT_UNSUPPORTED',
      String(originalFilename),
      { stage: 'format', source_id: sourceId }
    );
  }
  const exactSha256 = createHash('sha256').update(bytes).digest('hex');
  const normalized = format === 'structure_nbt'
    ? fromVanilla(bytes, sourceId, limits)
    : fromSchematic(bytes, sourceId, format, limits);
  const measured = measure(normalized, sourceId);
  const fingerprint = fingerprintCategoricalEntries({
    sourceId,
    contentSha256: exactSha256,
    extent: {
      x: measured.occupied_bounds.extent[0],
      y: measured.occupied_bounds.extent[1],
      z: measured.occupied_bounds.extent[2]
    },
    entries: measured.tight_entries
  });
  return deepFreeze({
    format,
    byte_size: bytes.length,
    exact_sha256: exactSha256,
    declared_size: [
      normalized.declared_size.x,
      normalized.declared_size.y,
      normalized.declared_size.z
    ],
    source_occupied_bounds: measured.source_occupied_bounds,
    occupied_bounds: measured.occupied_bounds,
    block_entity_count: normalized.block_entity_count,
    entity_count: normalized.entity_count,
    structural_fingerprint: fingerprint
  });
}
```

Implement `fromSchematic` by iterating `blockAtIndex(0..block_count-1)`.
Implement `fromVanilla` by iterating validated sparse blocks and resolving
their canonical palette state. Both normalize to records
`{ x, y, z, token }`, excluding air. For vanilla category mapping, use exact
name patterns already used by the current schematic block classifier:
glass/pane, light sources, vegetation, fences, stairs, slabs, openings,
decoration/storage/furniture, earth, rock, wood, water, and other.

`measure()` must:

- reject an empty non-air set as `SOURCE_EMPTY`;
- calculate source-space min/max;
- expose those padded coordinates as `source_occupied_bounds`;
- return array bounds;
- translate every non-air entry to a tight zero-based coordinate; and
- preserve only tokens 1 through 8.

The parser retains raw padded coordinates only in
`source_occupied_bounds`. The returned `occupied_bounds` is normalized to the
tight origin required by the R1 `SourceProfile` contract:

```js
{
  min: [0, 0, 0],
  max: [extent.x - 1, extent.y - 1, extent.z - 1],
  extent: [extent.x, extent.y, extent.z]
}
```

The full parser result includes both `source_occupied_bounds` and normalized
`occupied_bounds`; `SourceProfile` receives only the normalized value.

- [ ] **Step 4: Export and verify unified parsing**

Export `RESIDENTIAL_INTAKE_LIMITS`, `supportedResidentialFormat`, and
`parseResidentialArtifact` from `intake/index.js`.

Run:

```bash
node --test test/residentialArtifactParser.test.js test/trainingVanillaStructureNbt.test.js test/trainingStructuralFingerprint.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit the artifact-analysis slice**

```bash
git add src/training/residential/intake test/residentialArtifactParser.test.js
git commit -m "feat(residential): parse and fingerprint intake artifacts"
```

---

### Task 5: Immutable content-addressed quarantine and write-once JSON

**Files:**

- Create: `src/training/residential/intake/storage.js`
- Modify: `src/training/residential/intake/index.js`
- Create: `test/residentialIntakeStorage.test.js`

**Interfaces:**

- Consumes: initialized workspace root and `RESIDENTIAL_INTAKE_LIMITS.maxRawBytes`
- Produces: `caseIdFromSha256(sha256): string`
- Produces: `readCandidateBytes(filePath, { maxBytes? }): Promise<Buffer>`
- Produces: `quarantineArtifact({ root, bytes, sha256 }): Promise<{ case_id, directory, created }>`
- Produces: `writeJsonOnceOrVerify(filePath, value): Promise<"created" | "verified">`
- Never follows a payload symlink or overwrites an existing file

- [ ] **Step 1: Write failing immutable-storage tests**

Create `test/residentialIntakeStorage.test.js`:

```js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  caseIdFromSha256,
  quarantineArtifact,
  readCandidateBytes,
  writeJsonOnceOrVerify
} from '../src/training/residential/intake/index.js';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-storage-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'quarantine'));
  return root;
}

test('quarantine creates one immutable content identity and verifies reruns', async (t) => {
  const root = await fixture(t);
  const bytes = Buffer.from('immutable fixture');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const first = await quarantineArtifact({ root, bytes, sha256 });
  const second = await quarantineArtifact({ root, bytes, sha256 });
  assert.equal(first.case_id, caseIdFromSha256(sha256));
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.deepEqual(
    await fs.readFile(path.join(first.directory, 'payload')),
    bytes
  );
});

test('quarantine rejects an existing conflicting identity', async (t) => {
  const root = await fixture(t);
  const bytes = Buffer.from('expected');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const caseId = caseIdFromSha256(sha256);
  await fs.mkdir(path.join(root, 'quarantine', caseId));
  await fs.writeFile(
    path.join(root, 'quarantine', caseId, 'payload'),
    'conflict'
  );
  await assert.rejects(
    quarantineArtifact({ root, bytes, sha256 }),
    /QUARANTINE_CONFLICT/u
  );
});

test('candidate reads reject symlinks and raw-byte overflow', async (t) => {
  const root = await fixture(t);
  const source = path.join(root, 'source.schem');
  const link = path.join(root, 'link.schem');
  await fs.writeFile(source, '1234');
  await fs.symlink(source, link);
  await assert.rejects(readCandidateBytes(link), /SOURCE_FILE_SYMLINK/u);
  await assert.rejects(
    readCandidateBytes(source, { maxBytes: 3 }),
    /RAW_BYTES_LIMIT/u
  );
});

test('write-once JSON accepts identical canonical content and rejects changes', async (t) => {
  const root = await fixture(t);
  const file = path.join(root, 'report.json');
  assert.equal(await writeJsonOnceOrVerify(file, { b: 2, a: 1 }), 'created');
  assert.equal(await writeJsonOnceOrVerify(file, { a: 1, b: 2 }), 'verified');
  await assert.rejects(
    writeJsonOnceOrVerify(file, { a: 1, b: 3 }),
    /IMMUTABLE_JSON_CONFLICT/u
  );
});
```

- [ ] **Step 2: Run the storage tests and verify failure**

Run:

```bash
node --test test/residentialIntakeStorage.test.js
```

Expected: FAIL because storage functions do not exist.

- [ ] **Step 3: Implement no-follow reads and stable case IDs**

Create `src/training/residential/intake/storage.js`. Use
`fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW)` and verify
`handle.stat().isFile()` before reading. Reject:

- symlink/open `ELOOP` as `SOURCE_FILE_SYMLINK`;
- a non-regular file as `SOURCE_FILE_NOT_REGULAR`;
- zero bytes as `SOURCE_FILE_EMPTY`; and
- `size > maxBytes` as `RAW_BYTES_LIMIT`.

Define:

```js
export function caseIdFromSha256(value) {
  if (!/^[a-f0-9]{64}$/u.test(value || '')) {
    throw new TrainingDataError('SOURCE_HASH_INVALID', String(value));
  }
  return `case-${value.slice(0, 24)}`;
}
```

- [ ] **Step 4: Implement atomic immutable quarantine**

`quarantineArtifact` must:

1. verify the caller-provided SHA-256 against `bytes`;
2. use `<root>/quarantine/<case-id>`;
3. if the directory exists, reject symlinks, validate exact
   `identity.json`, rehash `payload`, and return `created: false`;
4. otherwise create a temporary sibling directory with `fs.mkdtemp`;
5. write `payload` with mode `0o400`;
6. write canonical `identity.json` with mode `0o400`:

```js
{
  source: 'residential-quarantine-identity-v1',
  schema_version: 1,
  case_id: caseId,
  sha256,
  byte_size: bytes.length
}
```

7. sync both file handles;
8. atomically rename the temporary directory to the case directory; and
9. if another process won the rename race, validate the winner and return
   `created: false`.

Cleanup may remove only the exact temporary directory created by this call.

- [ ] **Step 5: Implement canonical write-once JSON and verify tests**

`writeJsonOnceOrVerify` obtains sorted data with
`JSON.parse(canonicalJson(value))`, then writes
`JSON.stringify(sorted, null, 2) + "\n"` with `"wx"`. On `EEXIST`,
it parses the existing file, canonicalizes both values, and returns
`"verified"` only when they match. A symlink, malformed existing JSON, or
different canonical value throws `IMMUTABLE_JSON_CONFLICT`.

Export all storage functions from `intake/index.js`.

Run:

```bash
node --test test/residentialIntakeStorage.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the immutable-storage slice**

```bash
git add src/training/residential/intake/storage.js src/training/residential/intake/index.js test/residentialIntakeStorage.test.js
git commit -m "feat(residential): add immutable source quarantine"
```

---

### Task 6: SourceProfile building and batch-intake orchestration

**Files:**

- Create: `src/training/residential/intake/profileBuilder.js`
- Create: `src/training/residential/intake/intakeBatch.js`
- Modify: `src/training/residential/intake/index.js`
- Create: `test/residentialBatchIntake.test.js`

**Interfaces:**

- Consumes: validated batch inventory, immutable storage, unified parser, R1 `validateSourceProfile`, and R2 report validator
- Produces: `buildSourceProfile({ manifest, candidate, caseId, artifact, actor, at })`
- Produces: `intakeResidentialBatch({ root, batchId, projectRoot, actor?, clock? })`
- New residential sources finish `parsed`; non-residential sources finish `deferred`; no R2 path emits `eligible`

- [ ] **Step 1: Write failing lifecycle, idempotency, and decision tests**

Create `test/residentialBatchIntake.test.js` using
`writeBatchFixture(...)`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  initializeResidentialWorkspace
} from '../src/training/residential/workspace/index.js';
import {
  initializeSourceBatch,
  intakeResidentialBatch
} from '../src/training/residential/intake/index.js';
import {
  classicSchematic,
  writeBatchFixture
} from './fixtures/residentialIntakeFixtures.js';

async function fixture(t) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-intake-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  await fs.mkdir(path.join(projectRoot, '.local'));
  const root = path.join(projectRoot, '.local', 'residential-model');
  await initializeResidentialWorkspace({ root, projectRoot });
  await initializeSourceBatch({
    root,
    projectRoot,
    batchId: '2026-07-24-fixture-001',
    sourceProject: 'fixture-project'
  });
  return { projectRoot, root };
}

test('batch intake leaves house evidence unknown and defers other architecture', async (t) => {
  const local = await fixture(t);
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001',
    houseBytes: classicSchematic(),
    otherBytes: classicSchematic({ blockId: 5 })
  });
  const report = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001',
    clock: () => new Date('2026-07-24T14:00:00.000Z')
  });
  assert.equal(report.summary.parsed_count, 1);
  assert.equal(report.summary.deferred_count, 1);

  const profiles = await fs.readdir(path.join(local.root, 'sources'));
  assert.equal(profiles.length, 2);
  const values = await Promise.all(
    profiles.map(async (name) => JSON.parse(
      await fs.readFile(path.join(local.root, 'sources', name), 'utf8')
    ))
  );
  const house = values.find((item) => item.title.includes('House'));
  const other = values.find((item) => item.title.includes('Tower'));
  assert.equal(house.status, 'parsed');
  assert.deepEqual(house.evidence, {
    complete_residence: 'unknown',
    furnished: 'unknown',
    survival_core: 'unknown',
    supported_content: 'unknown'
  });
  assert.equal(other.status, 'deferred');
  assert.equal(
    other.decisions.at(-1).reason,
    'non_residential_reference_only'
  );
  assert.equal(values.some((item) => item.status === 'eligible'), false);
});

test('unchanged intake rerun returns byte-identical report and no new decisions', async (t) => {
  const local = await fixture(t);
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001',
    houseBytes: classicSchematic(),
    otherBytes: classicSchematic({ blockId: 5 })
  });
  const first = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001',
    clock: () => new Date('2026-07-24T14:00:00.000Z')
  });
  const before = await fs.readFile(
    path.join(local.root, 'reports', 'intake-2026-07-24-fixture-001.json')
  );
  const second = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001',
    clock: () => new Date('2030-01-01T00:00:00.000Z')
  });
  const after = await fs.readFile(
    path.join(local.root, 'reports', 'intake-2026-07-24-fixture-001.json')
  );
  assert.deepEqual(second, first);
  assert.deepEqual(after, before);
});

test('unsupported and oversized candidates are preserved without fabricated profiles', async (t) => {
  const local = await fixture(t);
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001',
    houseFilename: 'future-house.litematic',
    houseBytes: Buffer.from('unsupported'),
    otherBytes: classicSchematic({
      width: 65,
      height: 1,
      length: 1,
      blocks: [1, ...Array(63).fill(0), 1]
    })
  });
  const report = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001'
  });
  assert.deepEqual(
    report.candidates.map((item) => item.reason).sort(),
    ['occupied_bounds_exceed_64', 'unsupported_format']
  );
  assert.equal(report.summary.source_profile_count, 0);
  assert.equal(report.summary.quarantined_count, 2);
});

test('a completed batch ID cannot be reused with changed manifest content', async (t) => {
  const local = await fixture(t);
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001',
    houseBytes: classicSchematic(),
    otherBytes: classicSchematic({ blockId: 5 })
  });
  await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001'
  });
  const manifestFile = path.join(
    local.root,
    'inbox',
    '2026-07-24-fixture-001',
    'batch-manifest.json'
  );
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  manifest.candidates[0].collector_note = 'changed after intake';
  await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  await assert.rejects(
    intakeResidentialBatch({
      ...local,
      batchId: '2026-07-24-fixture-001'
    }),
    /INTAKE_BATCH_ALREADY_RECORDED/u
  );
});
```

- [ ] **Step 2: Run batch-intake tests and verify failure**

Run:

```bash
node --test test/residentialBatchIntake.test.js
```

Expected: FAIL because profile building and orchestration do not exist.

- [ ] **Step 3: Implement deterministic `SourceProfile` construction**

Create `src/training/residential/intake/profileBuilder.js`:

```js
import { createHash } from 'node:crypto';
import {
  SOURCE_PROFILE_SOURCE,
  RESIDENTIAL_SCHEMA_VERSION
} from '../contracts/vocabularies.js';
import { validateSourceProfile } from '../contracts/sourceProfile.js';

export function buildSourceProfile({
  manifest,
  candidate,
  caseId,
  artifact,
  actor = 'r2-intake',
  at
}) {
  const firstAt = new Date(at);
  const decision = (action, fromStatus, toStatus, reason, offset) => ({
    id: decisionId(caseId, action),
    at: new Date(firstAt.getTime() + offset).toISOString(),
    actor,
    action,
    from_status: fromStatus,
    to_status: toStatus,
    reason
  });
  const decisions = [
    decision('quarantine', null, 'quarantined', 'immutable source recorded', 0),
    decision('parse', 'quarantined', 'parsed', 'bounded source parsed', 1)
  ];
  if (candidate.lane === 'other-architecture') {
    decisions.push(decision(
      'defer_reference',
      'parsed',
      'deferred',
      'non_residential_reference_only',
      2
    ));
  }
  return validateSourceProfile({
    source: SOURCE_PROFILE_SOURCE,
    schema_version: RESIDENTIAL_SCHEMA_VERSION,
    case_id: caseId,
    batch_id: manifest.batch_id,
    title: candidate.title,
    origin: candidate.origin,
    artifact: {
      original_filename: candidate.relative_path.split('/').at(-1),
      format: artifact.format,
      byte_size: artifact.byte_size,
      sha256: artifact.exact_sha256
    },
    lineage: {
      source_project: manifest.source_project,
      asset_family:
        `family-${artifact.structural_fingerprint.yaw_canonical_sha256.slice(0, 24)}`
    },
    measurements: {
      occupied_bounds: artifact.occupied_bounds
    },
    fingerprints: {
      exact_sha256: artifact.exact_sha256,
      structural_sha256:
        artifact.structural_fingerprint.yaw_canonical_sha256
    },
    evidence: {
      complete_residence: 'unknown',
      furnished: 'unknown',
      survival_core: 'unknown',
      supported_content: 'unknown'
    },
    status: candidate.lane === 'houses' ? 'parsed' : 'deferred',
    decisions
  });
}

function decisionId(caseId, action) {
  return `decision-${createHash('sha256')
    .update(`${caseId}\0${action}`)
    .digest('hex')
    .slice(0, 24)}`;
}
```

- [ ] **Step 4: Implement report-first idempotency and per-candidate outcomes**

Create `src/training/residential/intake/intakeBatch.js` with this order:

1. `inventorySourceBatch` validates the complete batch.
2. If `reports/intake-<batch-id>.json` exists, validate it. Return it only
   when `manifest_sha256` matches; otherwise throw
   `INTAKE_BATCH_ALREADY_RECORDED`.
3. For each sorted candidate, read through `readCandidateBytes`.
4. Hash and quarantine before parsing.
5. If the extension is unsupported, return `deferred/unsupported_format`
   without a profile.
6. Parse supported input and write its full fingerprint to
   `quarantine/<case-id>/fingerprint.json` with `writeJsonOnceOrVerify`.
7. If any occupied extent is greater than 64, return
   `deferred/occupied_bounds_exceed_64` without a profile.
8. If `sources/<case-id>.json` already exists from another batch, validate
   it and return `duplicate/exact_duplicate` without modifying it.
9. Also inspect validated prior intake reports for the same exact artifact
   hash. This detects duplicates whose first observation was unsupported or
   otherwise had no `SourceProfile`; return `duplicate/exact_duplicate`
   without fabricating a profile.
10. Otherwise build and write the `SourceProfile`.
11. Map parser resource-limit errors to `deferred/parser_limit`; map unsafe
    or malformed parser errors to `rejected/malformed_or_unsafe_source`.
12. Build, validate, and write the report only after every candidate has an
    outcome.

Use this observation ID:

```js
function observationId(batchId, relativePath) {
  return `observation-${createHash('sha256')
    .update(`${batchId}\0${relativePath}`)
    .digest('hex')
    .slice(0, 24)}`;
}
```

Build summary values directly from candidates, then pass the complete result
through `validateIntakeReport`. A candidate has:

```js
{
  observation_id: observationId(...),
  submitted: candidate.submitted,
  case_id: quarantine.case_id,
  artifact_sha256: sha256,
  source_profile_file: profileRelativePathOrNull,
  outcome,
  reason
}
```

The default clock is `() => new Date()`, called once per newly created
profile. Validate the actor with the existing ID grammar.

- [ ] **Step 5: Export and verify lifecycle tests**

Export `buildSourceProfile` and `intakeResidentialBatch` from
`intake/index.js`.

Run:

```bash
node --test test/residentialBatchIntake.test.js test/residentialSourceReviewContracts.test.js test/residentialWorkspace.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the batch-intake slice**

```bash
git add src/training/residential/intake test/residentialBatchIntake.test.js
git commit -m "feat(residential): ingest source batches into profiles"
```

---

### Task 7: Read-only logical audit of all 64 legacy templates

**Files:**

- Create: `src/training/residential/intake/legacyAudit.js`
- Modify: `src/training/residential/intake/index.js`
- Create: `test/residentialLegacyAudit.test.js`

**Interfaces:**

- Consumes: project-root `mc_templates/`, optional existing `analysis/labels.generated.jsonl`, unified artifact parser, and immutable report writer
- Produces: `auditLegacyTemplates({ root, projectRoot, legacyRoot?, metadataFile? })`
- Writes only `.local/residential-model/reports/legacy-audit.json`
- Does not create quarantine payloads or `SourceProfile` files for legacy templates

- [ ] **Step 1: Write failing legacy scope and immutability tests**

Create `test/residentialLegacyAudit.test.js`:

```js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  initializeResidentialWorkspace
} from '../src/training/residential/workspace/index.js';
import {
  auditLegacyTemplates,
  quarantineArtifact
} from '../src/training/residential/intake/index.js';
import {
  classicSchematic
} from './fixtures/residentialIntakeFixtures.js';

async function fixture(t) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-legacy-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  const legacyRoot = path.join(projectRoot, 'mc_templates');
  await fs.mkdir(path.join(projectRoot, '.local'));
  await fs.mkdir(path.join(legacyRoot, 'House'), { recursive: true });
  await fs.mkdir(path.join(legacyRoot, 'Tower'), { recursive: true });
  await fs.mkdir(path.join(legacyRoot, 'analysis'), { recursive: true });
  await fs.writeFile(
    path.join(legacyRoot, 'House', 'House.schematic'),
    classicSchematic()
  );
  await fs.writeFile(
    path.join(legacyRoot, 'Tower', 'Tower.schematic'),
    classicSchematic({ blockId: 5 })
  );
  await fs.writeFile(
    path.join(legacyRoot, 'analysis', 'labels.generated.jsonl'),
    JSON.stringify({
      file: 'Tower/Tower.schematic',
      title: 'Tower',
      source: 'https://example.invalid/tower'
    }) + '\n'
  );
  const root = path.join(projectRoot, '.local', 'residential-model');
  await initializeResidentialWorkspace({ root, projectRoot });
  return { projectRoot, legacyRoot, root };
}

test('legacy audit examines every supported template and treats folders as hints', async (t) => {
  const local = await fixture(t);
  const report = await auditLegacyTemplates(local);
  assert.equal(report.summary.candidate_count, 2);
  assert.equal(report.summary.house_hint_count, 1);
  assert.equal(report.summary.other_hint_count, 1);
  assert.equal(
    report.candidates.find((item) => item.folder_hint === 'Tower').reason,
    'non_residential_reference_only'
  );
  assert.equal(
    report.candidates.find((item) => item.folder_hint === 'House').reason,
    'missing_provenance'
  );
});

test('legacy audit does not copy, move, rewrite, or profile templates', async (t) => {
  const local = await fixture(t);
  const before = await snapshot(local.legacyRoot);
  await auditLegacyTemplates(local);
  const after = await snapshot(local.legacyRoot);
  assert.deepEqual(after, before);
  assert.deepEqual(
    await fs.readdir(path.join(local.root, 'quarantine')),
    []
  );
  assert.deepEqual(await fs.readdir(path.join(local.root, 'sources')), []);
});

test('legacy audit is confined to project mc_templates and deterministic', async (t) => {
  const local = await fixture(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-legacy-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await assert.rejects(
    auditLegacyTemplates({ ...local, legacyRoot: outside }),
    /LEGACY_ROOT_OUTSIDE_PROJECT/u
  );
  const first = await auditLegacyTemplates(local);
  const second = await auditLegacyTemplates(local);
  assert.deepEqual(second, first);
});

test('legacy audit detects duplicates within legacy and against new quarantine', async (t) => {
  const local = await fixture(t);
  const duplicate = path.join(
    local.legacyRoot,
    'House',
    'ZZ Duplicate House.schematic'
  );
  await fs.writeFile(
    duplicate,
    await fs.readFile(
      path.join(local.legacyRoot, 'House', 'House.schematic')
    )
  );
  const towerBytes = await fs.readFile(
    path.join(local.legacyRoot, 'Tower', 'Tower.schematic')
  );
  await quarantineArtifact({
    root: local.root,
    bytes: towerBytes,
    sha256: createHash('sha256').update(towerBytes).digest('hex')
  });
  const report = await auditLegacyTemplates(local);
  assert.equal(report.summary.duplicate_count, 2);
  const detected = report.candidates.find(
    (item) => item.relative_path === 'House/ZZ Duplicate House.schematic'
  );
  assert.equal(detected.reason, 'exact_duplicate');
  assert.equal(
    detected.duplicate_of,
    'legacy:House/House.schematic'
  );
  assert.match(
    report.candidates.find(
      (item) => item.relative_path === 'Tower/Tower.schematic'
    ).duplicate_of,
    /^case-[a-f0-9]{24}$/u
  );
});

async function snapshot(root) {
  const output = [];
  await visit(root, '');
  return output;
  async function visit(directory, relative) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const childRelative = path.posix.join(relative, entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute, childRelative);
      else output.push([
        childRelative,
        (await fs.readFile(absolute)).toString('base64')
      ]);
    }
  }
}
```

- [ ] **Step 2: Run legacy tests and verify failure**

Run:

```bash
node --test test/residentialLegacyAudit.test.js
```

Expected: FAIL because the audit function does not exist.

- [ ] **Step 3: Implement confined discovery and existing metadata lookup**

Create `src/training/residential/intake/legacyAudit.js`. Resolve
`legacyRoot` to exactly `path.join(projectRoot, "mc_templates")`; any other
path throws `LEGACY_ROOT_OUTSIDE_PROJECT`.

Discovery:

- recursively visits only that root;
- includes `.schem`, `.schematic`, and `.nbt`;
- sorts lexical relative paths;
- records a supported-extension symlink as rejected without following it;
- ignores `analysis/`, `curation/`, and non-source extensions; and
- derives `folder_hint` from the first path segment and `lane_hint` as
  `houses` only when the first segment is exactly `House`.

Metadata:

- reads `analysis/labels.generated.jsonl` when present;
- accepts one JSON object per non-empty line;
- keys records by normalized `file`;
- accepts `source_url` or `source` only when it is an HTTP(S) URL;
- uses the metadata title when present, otherwise strips the extension and
  `" - (mcbuild_org)"` suffix; and
- leaves missing or non-HTTP sources as `null`.

- [ ] **Step 4: Implement audit outcomes and immutable reporting**

For each regular source:

1. read without following links;
2. parse and fingerprint with `parseResidentialArtifact`;
3. choose the first matching reason in this order:
   - malformed/unsafe parser error: `rejected/malformed_or_unsafe_source`;
   - parser resource limit: `deferred/parser_limit`;
   - exact hash already present in an earlier sorted legacy candidate:
     `deferred/exact_duplicate` with
     `duplicate_of: "legacy:<relative-path>"`;
   - exact hash already present under the new-source quarantine:
     `deferred/exact_duplicate` with
     `duplicate_of: "case-<hash-prefix>"`;
   - any occupied axis above 64: `deferred/occupied_bounds_exceed_64`;
   - missing HTTP(S) URL: `deferred/missing_provenance`;
   - non-house hint: `deferred/non_residential_reference_only`;
   - otherwise: `parsed/residential_candidate_requires_review`;
4. include exact hash, occupied extent, and nullable `duplicate_of`.

Calculate `inventory_sha256` from canonical JSON of the sorted candidate
records before adding the summary. Validate the report with
`validateLegacyAuditReport`, then write or verify
`reports/legacy-audit.json`.

No function in this module may call `quarantineArtifact`,
`buildSourceProfile`, `fs.copyFile`, `fs.rename`, or a write method whose
path is below `legacyRoot`.

- [ ] **Step 5: Verify fixture and real-corpus read-only coverage**

Run:

```bash
node --test test/residentialLegacyAudit.test.js
node -e "import('./src/training/residential/intake/index.js').then(async ({auditLegacyTemplates}) => { const report = await auditLegacyTemplates({ root: '.local/residential-model', projectRoot: process.cwd() }); if (report.summary.candidate_count !== 64) process.exit(1); console.log(report.summary); })"
```

Expected:

- focused tests PASS;
- the local command reports `candidate_count: 64`;
- no path under `mc_templates/` changes; and
- real report data remains ignored below `.local/residential-model/`.

If `.local/residential-model/` is not initialized, initialize it with the
existing `residential:workspace -- init` command first. Do not remove or
replace an existing workspace.

- [ ] **Step 6: Commit the legacy-audit slice**

```bash
git add src/training/residential/intake/legacyAudit.js src/training/residential/intake/index.js test/residentialLegacyAudit.test.js
git commit -m "feat(residential): audit legacy templates without mutation"
```

---

### Task 8: Residential workspace CLI for batch creation and intake

**Files:**

- Modify: `src/runResidentialWorkspace.js`
- Modify: `test/residentialWorkspaceCli.test.js`

**Interfaces:**

- Consumes: `initializeSourceBatch`, `intakeResidentialBatch`, and `auditLegacyTemplates`
- Produces commands: `init`, `status`, `batch-init`, `intake`, `legacy-audit`
- `batch-init` requires `--batch-id` and `--source-project`
- `intake` requires `--batch-id`
- Every command accepts optional `--root`; no other option is accepted

- [ ] **Step 1: Write failing CLI parser and process tests**

Replace the first parser test in `test/residentialWorkspaceCli.test.js` with:

```js
test('residential workspace parser enforces command-specific options', () => {
  assert.equal(
    parseResidentialWorkspaceArgs(['init'], { cwd: ROOT }).command,
    'init'
  );
  assert.deepEqual(
    parseResidentialWorkspaceArgs([
      'batch-init',
      '--batch-id', '2026-07-24-fixture-001',
      '--source-project', 'fixture-project'
    ], { cwd: ROOT }),
    {
      command: 'batch-init',
      root: path.join(ROOT, '.local', 'residential-model'),
      batchId: '2026-07-24-fixture-001',
      sourceProject: 'fixture-project'
    }
  );
  assert.throws(
    () => parseResidentialWorkspaceArgs(['intake'], { cwd: ROOT }),
    /ARGUMENT_REQUIRED/u
  );
  assert.throws(
    () => parseResidentialWorkspaceArgs([
      'legacy-audit', '--batch-id', 'not-allowed'
    ], { cwd: ROOT }),
    /ARGUMENT_NOT_ALLOWED/u
  );
  assert.throws(
    () => parseResidentialWorkspaceArgs(['train'], { cwd: ROOT }),
    /ARGUMENT_COMMAND_INVALID/u
  );
});
```

Add a process test that:

1. creates a fixture project and initializes the workspace;
2. runs `batch-init`;
3. writes a valid manifest and two fixture payloads;
4. runs `intake`;
5. runs `legacy-audit` against a two-file fixture `mc_templates`;
6. checks stable key/value output and exit code zero.

Expected intake output keys:

```text
intake_status=complete
batch_id=2026-07-24-fixture-001
candidate_count=2
parsed_count=1
deferred_count=1
rejected_count=0
duplicate_count=0
source_profile_count=2
```

- [ ] **Step 2: Run CLI tests and verify failure**

Run:

```bash
node --test test/residentialWorkspaceCli.test.js
```

Expected: FAIL because only `init` and `status` are currently supported.

- [ ] **Step 3: Implement discriminated CLI parsing**

In `src/runResidentialWorkspace.js`, define:

```js
const COMMAND_OPTIONS = Object.freeze({
  init: new Set(['--root']),
  status: new Set(['--root']),
  'batch-init': new Set(['--root', '--batch-id', '--source-project']),
  intake: new Set(['--root', '--batch-id']),
  'legacy-audit': new Set(['--root'])
});
```

Parse duplicate/missing values as today, then:

- reject an option not in the selected set as `ARGUMENT_NOT_ALLOWED`;
- require `--batch-id` and `--source-project` for `batch-init`;
- require `--batch-id` for `intake`;
- return camel-case `batchId` and `sourceProject` only for commands that use
  them; and
- keep the existing root resolution and project-root confinement.

- [ ] **Step 4: Dispatch commands and render stable output**

Refactor `main()` to dispatch:

```js
if (options.command === 'init') {
  return printWorkspace(await initializeResidentialWorkspace(context));
}
if (options.command === 'status') {
  return printWorkspace(await readResidentialWorkspaceStatus(context));
}
if (options.command === 'batch-init') {
  return printBatch(await initializeSourceBatch({
    ...context,
    batchId: options.batchId,
    sourceProject: options.sourceProject
  }));
}
if (options.command === 'intake') {
  return printIntake(await intakeResidentialBatch({
    ...context,
    batchId: options.batchId
  }));
}
return printLegacy(await auditLegacyTemplates(context));
```

Print only stable identifiers and counts. Do not print absolute candidate
paths, source URLs, authors, license text, or payload content.

- [ ] **Step 5: Verify CLI and package-policy compatibility**

Run:

```bash
node --test test/residentialWorkspaceCli.test.js test/projectPolicy.test.js
```

Expected: PASS. `package.json` remains unchanged and still has exactly four
`training:*` scripts.

- [ ] **Step 6: Commit the CLI slice**

```bash
git add src/runResidentialWorkspace.js test/residentialWorkspaceCli.test.js
git commit -m "feat(residential): expose R2 intake commands"
```

---

### Task 9: Cross-module safety proof, current documentation, and full verification

**Files:**

- Create: `test/residentialIntakeIntegration.test.js`
- Modify: `test/docsProjectStatus.test.js`
- Modify: `docs/residential-model/README.md`
- Modify: `docs/architecture.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: every R2 public interface and CLI command
- Produces: one end-to-end regression proving validation-before-write, duplicate handling, profile status boundaries, legacy immutability, and local-only outputs
- Produces: current user instructions for creating batches, adding provenance, intaking new files, and auditing legacy files

- [ ] **Step 1: Write the failing end-to-end safety test**

Create `test/residentialIntakeIntegration.test.js`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  initializeResidentialWorkspace
} from '../src/training/residential/workspace/index.js';
import {
  initializeSourceBatch,
  intakeResidentialBatch
} from '../src/training/residential/intake/index.js';
import {
  classicSchematic,
  writeBatchFixture
} from './fixtures/residentialIntakeFixtures.js';

test('R2 validates first, preserves identities, and never auto-admits a house', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-e2e-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  await fs.mkdir(path.join(projectRoot, '.local'));
  const root = path.join(projectRoot, '.local', 'residential-model');
  await initializeResidentialWorkspace({ root, projectRoot });

  for (const batchId of ['batch-first', 'batch-duplicate']) {
    await initializeSourceBatch({
      root,
      projectRoot,
      batchId,
      sourceProject: 'fixture-project'
    });
    await writeBatchFixture({
      root,
      projectRoot,
      batchId,
      houseBytes: classicSchematic(),
      otherBytes: classicSchematic({ blockId: batchId === 'batch-first' ? 5 : 1 })
    });
  }

  const first = await intakeResidentialBatch({
    root,
    projectRoot,
    batchId: 'batch-first',
    clock: () => new Date('2026-07-24T15:00:00.000Z')
  });
  const second = await intakeResidentialBatch({
    root,
    projectRoot,
    batchId: 'batch-duplicate',
    clock: () => new Date('2026-07-24T15:01:00.000Z')
  });
  assert.ok(first.summary.source_profile_count > 0);
  assert.ok(second.summary.duplicate_count > 0);

  const profiles = await fs.readdir(path.join(root, 'sources'));
  for (const name of profiles) {
    const profile = JSON.parse(
      await fs.readFile(path.join(root, 'sources', name), 'utf8')
    );
    assert.notEqual(profile.status, 'eligible');
    assert.equal(profile.evidence.complete_residence, 'unknown');
  }
});

test('invalid inventory produces no quarantine, profile, or report writes', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-preflight-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  await fs.mkdir(path.join(projectRoot, '.local'));
  const root = path.join(projectRoot, '.local', 'residential-model');
  await initializeResidentialWorkspace({ root, projectRoot });
  const batch = await initializeSourceBatch({
    root,
    projectRoot,
    batchId: 'invalid-batch',
    sourceProject: 'fixture-project'
  });
  await fs.writeFile(
    path.join(batch.batch_path, 'houses', 'unlisted.schematic'),
    classicSchematic()
  );
  await assert.rejects(
    intakeResidentialBatch({
      root,
      projectRoot,
      batchId: 'invalid-batch'
    }),
    /SOURCE_BATCH_UNLISTED_PAYLOAD/u
  );
  assert.deepEqual(await fs.readdir(path.join(root, 'quarantine')), []);
  assert.deepEqual(await fs.readdir(path.join(root, 'sources')), []);
  assert.deepEqual(await fs.readdir(path.join(root, 'reports')), []);
});
```

- [ ] **Step 2: Run the integration test and correct any boundary failures**

Run:

```bash
node --test test/residentialIntakeIntegration.test.js
```

Expected: PASS after Tasks 1-8. If it fails, change the smallest owning R2
module and add the focused regression there before rerunning this test.

- [ ] **Step 3: Update the residential user workflow**

Update `docs/residential-model/README.md` so current status is R2 and document:

```bash
npm run residential:workspace -- init
npm run residential:workspace -- batch-init \
  --batch-id 2026-07-24-planetminecraft-001 \
  --source-project planetminecraft
npm run residential:workspace -- intake \
  --batch-id 2026-07-24-planetminecraft-001
npm run residential:workspace -- legacy-audit
npm run residential:workspace -- status
```

Include a complete two-candidate `batch-manifest.json` example matching the
Task 1 schema. State plainly:

- place each payload once under `houses/` or `other-architecture/`;
- preserve the original extension;
- use unknown license status instead of guessing;
- record the source page rather than a search-results URL;
- a parsed house still needs R3/R4 evidence and review;
- other architecture is preserved but excluded from residential training;
- unsupported and oversized structures remain deferred;
- `.local/` data is never committed; and
- changing a completed batch requires a new batch ID.

- [ ] **Step 4: Update current project status without rewriting historical evidence**

In `README.md` and `docs/architecture.md`, change the residential renderer
status from R1-only to:

```text
R1 contracts/workspace and R2 local source intake are implemented.
R3 canonical extraction, annotation, datasets, models, training, and
production integration are not implemented.
```

Keep the existing Stage 7 experiment results and commands unchanged.

Extend `test/docsProjectStatus.test.js` to require:

- the residential README names the two lanes;
- it includes `batch-init`, `intake`, and `legacy-audit`;
- the root README states R2 source intake is local-only;
- no current document claims a residential dataset or checkpoint exists; and
- `docs/superpowers/` remains absent.

- [ ] **Step 5: Run focused R2 tests**

Run:

```bash
node --test \
  test/residentialContractCore.test.js \
  test/residentialSourceBatchContracts.test.js \
  test/residentialWorkspace.test.js \
  test/residentialSourceBatch.test.js \
  test/residentialSchematicArtifact.test.js \
  test/residentialArtifactParser.test.js \
  test/residentialIntakeStorage.test.js \
  test/residentialBatchIntake.test.js \
  test/residentialLegacyAudit.test.js \
  test/residentialIntakeIntegration.test.js \
  test/residentialWorkspaceCli.test.js \
  test/docsProjectStatus.test.js \
  test/projectPolicy.test.js
```

Expected: PASS.

- [ ] **Step 6: Run compatibility and full regression tests**

Run:

```bash
node --test \
  test/trainingBoundedNbt.test.js \
  test/trainingVanillaStructureNbt.test.js \
  test/trainingStructuralFingerprint.test.js \
  test/schematicBlockVolume.test.js \
  test/trainingSourceCatalog.test.js
npm test
```

Expected: all focused compatibility tests and the complete Node.js suite PASS.

- [ ] **Step 7: Verify repository and local-data boundaries**

Run:

```bash
git diff --check
git status --short
git diff --name-only -- mc_templates .local
```

Expected:

- no whitespace errors;
- only the planned tracked R2 code, tests, and current docs are changed;
- no `mc_templates/` file is changed;
- no `.local/` artifact is tracked or appears in the diff; and
- no secret, downloaded payload, profile, report, or quarantine file is staged.

- [ ] **Step 8: Commit documentation and final verification coverage**

```bash
git add test/residentialIntakeIntegration.test.js test/docsProjectStatus.test.js README.md docs/architecture.md docs/residential-model/README.md
git commit -m "docs(residential): document the R2 intake workflow"
```

---

## Completion Evidence

R2 is complete only when the implementation branch contains evidence for all
of the following:

- strict versioned source-batch, intake-report, and legacy-audit contracts;
- atomic creation of a named batch with exactly two physical lanes;
- full preflight detection of missing, unlisted, unsafe, and symlink entries;
- explicit bounded parsing for all three supported formats;
- honest preservation and reporting of unsupported formats;
- content-addressed immutable quarantine for new sources;
- stable exact and yaw-canonical structural fingerprints;
- valid `SourceProfile` output for representable parsed/deferred sources;
- zero automatically eligible houses and zero automatic evidence passes;
- non-residential `deferred/non_residential_reference_only` behavior;
- oversized deferral without cropping or fabricated profiles;
- exact rerun idempotency and completed-batch manifest conflict detection;
- exact duplicate identity reuse across batches;
- exact duplicate detection within legacy and between legacy and new
  quarantine identities;
- read-only examination of all 64 legacy templates;
- missing legacy provenance reported rather than guessed;
- no legacy move, copy, rename, rewrite, or automatic residential admission;
- stable local-only CLI output;
- unchanged four-command Stage 7 training surface;
- updated current project documentation; and
- a passing full Node.js test suite.

R2 completion does not authorize R3 extraction or annotation. The next design
checkpoint must decide the canonical block/entity representation and
deterministic evidence extraction before an implementation plan touches room,
object, decoration, or HouseSpec annotation.
