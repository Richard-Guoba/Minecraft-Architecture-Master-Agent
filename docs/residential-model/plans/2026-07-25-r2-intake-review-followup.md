# R2 Intake Review Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four remaining Important review findings on draft PR #6 while preserving immutable batches, honest R2 outcomes, local-only data, and Stage 7 compatibility.

**Architecture:** Keep the existing R2 modules and correct the owning boundaries. The intake report contract binds lifecycle reasons to lanes; orchestration checks current-run hashes immediately after quarantine and validates completed reports against current payload state; artifact parsing measures an optional occupied-axis limit before fingerprinting; legacy audit consumes the same measurement signal while preserving duplicate precedence.

**Tech Stack:** Node.js ES modules, `node:test`, filesystem-backed integration fixtures, existing residential contracts and intake APIs, Git/GitHub draft PR workflow.

## Global Constraints

- Work only in `agent/residential-r2-source-intake` and update draft PR #6.
- Follow strict RED → GREEN → REFACTOR for every production behavior change.
- A completed batch with changed payload content must fail with `INTAKE_BATCH_ALREADY_RECORDED`; it is never rewritten.
- Houses never become automatically eligible and all residential evidence remains `unknown`.
- Other architecture remains reference-only and excluded from residential training.
- Do not modify or stage `.local/`, `mc_templates/`, downloaded payloads, reports, profiles, quarantine cases, or secrets.
- Do not add dependencies, change package scripts, or implement R3 extraction, annotation, datasets, training, or production integration.
- Preserve the existing 262,144 occupied-entry limit and all Stage 7 behavior.
- Keep `docs/superpowers/` absent; design and plan documents live under `docs/residential-model/plans/`.

---

### Task 1: Bind intake lifecycle reasons to submitted lanes

**Files:**

- Modify: `src/training/residential/contracts/intakeReport.js`
- Modify: `test/residentialSourceBatchContracts.test.js`

**Interfaces:**

- Consumes: `validateSourceCandidate(...)`, existing `OUTCOME_BY_REASON`, and `failContract(...)`.
- Produces: `validateIntakeReport(...)` rejects residential/reference reasons whose submitted lane is incompatible.
- Error code: `INTAKE_REPORT_LANE_REASON_INVALID`.

- [ ] **Step 1: Add failing contract regressions**

Append a test with hand-derived invalid documents:

```js
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
```

These documents remain valid for identity, profile path, summary, and
outcome/reason shape, so only missing lane binding can make the test fail.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test test/residentialSourceBatchContracts.test.js
```

Expected: FAIL because both invalid reports are currently accepted.

- [ ] **Step 3: Add the minimal lane/reason validator**

Call this helper after the outcome/reason pair check and before relationship
validation:

```js
function validateCandidateLaneReason(candidate, itemPath) {
  const expectedLane = {
    residential_candidate_requires_review: 'houses',
    non_residential_reference_only: 'other-architecture'
  }[candidate.reason];
  if (expectedLane && candidate.submitted.lane !== expectedLane) {
    failContract(
      'INTAKE_REPORT_LANE_REASON_INVALID',
      `${itemPath}.reason`,
      `${candidate.submitted.lane}/${candidate.reason}`
    );
  }
}
```

Do not constrain duplicate, parser, malformed, unsupported, or extent outcomes
to one lane.

- [ ] **Step 4: Verify GREEN and adjacent contracts**

Run:

```bash
node --test \
  test/residentialSourceBatchContracts.test.js \
  test/residentialSourceReviewContracts.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/training/residential/contracts/intakeReport.js \
  test/residentialSourceBatchContracts.test.js
git commit -m "fix(residential): bind intake reasons to source lanes"
```

---

### Task 2: Verify completed payloads and deduplicate before downstream processing

**Files:**

- Modify: `src/training/residential/intake/intakeBatch.js`
- Modify: `test/residentialBatchIntake.test.js`

**Interfaces:**

- Consumes: sorted batch inventory, `readCandidateBytes(...)`, SHA-256,
  `parserOutcome(...)`, `parserReason(...)`, and recorded intake reports.
- Produces: current-run `Map<sha256, { case_id, source_profile_file }>`;
  later same-run observations return `duplicate/exact_duplicate` immediately
  after quarantine.
- Produces: asynchronous completed-report verification against current payload
  identity or the same reproducible pre-quarantine outcome class.

- [ ] **Step 1: Add a failing pre-profile duplicate regression**

Use one supported 65-cell payload in both lanes:

```js
test('same-batch pre-profile outcomes deduplicate before parsing again', async (t) => {
  const local = await fixture(t);
  const bytes = classicSchematic({
    width: 65,
    height: 1,
    length: 1,
    blocks: [1, ...Array(63).fill(0), 1]
  });
  await writeBatchFixture({
    ...local,
    batchId: '2026-07-24-fixture-001',
    houseBytes: bytes,
    otherBytes: bytes
  });
  const report = await intakeResidentialBatch({
    ...local,
    batchId: '2026-07-24-fixture-001'
  });
  assert.deepEqual(
    report.candidates.map((item) => [
      item.outcome,
      item.reason,
      item.source_profile_file
    ]),
    [
      ['deferred', 'occupied_bounds_exceed_64', null],
      ['duplicate', 'exact_duplicate', null]
    ]
  );
  assert.equal(report.candidates[1].case_id, report.candidates[0].case_id);
});
```

Add a second test using identical `Buffer.from('malformed nbt')` payloads with
supported `.schematic` filenames. Assert the first observation is
`rejected/malformed_or_unsafe_source` and the second is
`duplicate/exact_duplicate` with the same case ID and a null profile.

Add a third test using identical bytes and unsupported `.litematic` filenames
in both lanes. Assert the first observation remains
`deferred/unsupported_format` and the second is
`duplicate/exact_duplicate` with the same case ID and a null profile. This
locks the early duplicate boundary independently of format dispatch.

- [ ] **Step 2: Add failing completed-report payload regressions**

Create a valid report, save its bytes and output-directory listings, then
replace the house payload with different valid schematic bytes:

```js
await fs.writeFile(housePath, classicSchematic({ blockId: 4 }));
await assert.rejects(
  intakeResidentialBatch({ ...local, batchId }),
  /INTAKE_BATCH_ALREADY_RECORDED/u
);
assert.deepEqual(await fs.readFile(reportPath), reportBefore);
assert.deepEqual(await fs.readdir(path.join(local.root, 'sources')), sourcesBefore);
assert.deepEqual(
  await fs.readdir(path.join(local.root, 'quarantine')),
  quarantineBefore
);
```

Add a null-identity case: complete a batch containing the existing sparse
`RAW_BYTES_LIMIT` fixture, verify an unchanged rerun returns the same report,
replace the oversized payload with readable schematic bytes, and require
`INTAKE_BATCH_ALREADY_RECORDED`.

- [ ] **Step 3: Verify RED and root causes**

Run:

```bash
node --test test/residentialBatchIntake.test.js
```

Expected failures:

- the second oversized/malformed candidate repeats the first outcome instead
  of becoming a duplicate;
- a completed report returns despite changed current payload bytes.

- [ ] **Step 4: Move current-run duplicate state to an observation map**

Replace `currentRunHashes` with a map populated only after each completed
candidate outcome:

```js
const currentRunObservations = new Map();

// after intakeCandidate returns
if (
  outcome.artifact_sha256 !== null
  && !currentRunObservations.has(outcome.artifact_sha256)
) {
  currentRunObservations.set(outcome.artifact_sha256, Object.freeze({
    case_id: outcome.case_id,
    source_profile_file: outcome.source_profile_file
  }));
}
```

Immediately after quarantine constructs `common`, return a duplicate when the
map already contains the hash:

```js
const currentObservation = currentRunObservations.get(sha256);
if (currentObservation) {
  return candidateOutcome(base, {
    ...common,
    source_profile_file: currentObservation.source_profile_file,
    outcome: 'duplicate',
    reason: 'exact_duplicate'
  });
}
```

Remove the later `currentRunHashes` branch. Preserve prior-report duplicate
handling and exact same-batch interrupted profile recovery for a first
observation whose hash is absent from the current-run map.

- [ ] **Step 5: Bind completed reports to current payload state**

Make `validateRecordedReportInventory(...)` asynchronous and await it before
returning a completed report.

For each already matched submitted candidate:

```js
async function validateRecordedCandidatePayload(observed, expected, batchId) {
  try {
    const bytes = await readCandidateBytes(expected.absolute_path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (observed.artifact_sha256 !== sha256) failRecordedReport(batchId);
  } catch (error) {
    if (
      !(error instanceof TrainingDataError)
      || observed.artifact_sha256 !== null
      || observed.outcome !== parserOutcome(error)
      || observed.reason !== parserReason(error)
    ) {
      failRecordedReport(batchId);
    }
  }
}
```

A readable payload can never match an observation whose artifact hash is null.
Any unsafe/missing/changed payload for an identity-bearing observation fails
closed. Do not write or repair the existing report.

- [ ] **Step 6: Verify GREEN and recovery compatibility**

Run:

```bash
node --test \
  test/residentialBatchIntake.test.js \
  test/residentialIntakeIntegration.test.js \
  test/residentialIntakeStorage.test.js
```

Expected: PASS, including unchanged reruns, interrupted profile recovery,
cross-batch duplicates, unsupported observations, and the new regressions.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/training/residential/intake/intakeBatch.js \
  test/residentialBatchIntake.test.js
git commit -m "fix(residential): verify and deduplicate intake payloads"
```

---

### Task 3: Defer oversized occupied bounds before fingerprinting

**Files:**

- Modify: `src/training/residential/intake/artifactParser.js`
- Modify: `src/training/residential/intake/intakeBatch.js`
- Modify: `src/training/residential/intake/legacyAudit.js`
- Modify: `test/residentialArtifactParser.test.js`
- Modify: `test/residentialBatchIntake.test.js`
- Modify: `test/residentialLegacyAudit.test.js`

**Interfaces:**

- Extends: `parseResidentialArtifact({ ..., occupiedExtentLimit? })`.
- Produces: `SOURCE_OCCUPIED_BOUNDS_LIMIT` with measurement-stage metadata
  containing `occupied_extent`, `max_extent`, and `exact_sha256` before
  `fingerprintCategoricalEntries(...)` is called.
- Intake and legacy audit pass `occupiedExtentLimit: 64` and map this signal to
  `deferred/occupied_bounds_exceed_64`.

- [ ] **Step 1: Add a failing parser-order regression**

Use a sparse but long one-region artifact whose occupied entry count stays
below 262,144:

```js
test('occupied extent is reported before the fingerprint extent contract', () => {
  const states = Array(65_536).fill(0);
  assert.throws(
    () => parseResidentialArtifact({
      bytes: regionSchematic({
        size: [65_536, 1, 1],
        palette: ['minecraft:stone'],
        states
      }),
      originalFilename: 'long-sparse.schem',
      sourceId: 'long-sparse',
      occupiedExtentLimit: 64
    }),
    (error) => (
      error.code === 'SOURCE_OCCUPIED_BOUNDS_LIMIT'
      && error.metadata.stage === 'measurement'
      && error.metadata.occupied_extent[0] === 65_536
      && /^[a-f0-9]{64}$/u.test(error.metadata.exact_sha256)
    )
  );
});
```

Expected current failure: `FINGERPRINT_EXTENT_INVALID`.

- [ ] **Step 2: Add failing intake and legacy outcome regressions**

For intake, submit the same long region as a house candidate and assert:

```js
assert.deepEqual(
  [candidate.outcome, candidate.reason, candidate.source_profile_file],
  ['deferred', 'occupied_bounds_exceed_64', null]
);
```

Assert the quarantine case contains `identity.json` and `payload`, but no
`fingerprint.json`.

For legacy audit, add a long region fixture under `House/`. Assert the record
retains its SHA-256 and occupied extent, applies legacy/new-source duplicate
precedence when applicable, and otherwise returns
`deferred/occupied_bounds_exceed_64`.

- [ ] **Step 3: Verify RED**

Run:

```bash
node --test \
  test/residentialArtifactParser.test.js \
  test/residentialBatchIntake.test.js \
  test/residentialLegacyAudit.test.js
```

Expected: FAIL because fingerprinting runs before the occupied-axis decision.

- [ ] **Step 4: Emit the measurement signal before fingerprinting**

Extend the parser input and insert this check immediately after `measure(...)`:

```js
if (
  occupiedExtentLimit !== null
  && measured.occupied_bounds.extent.some(
    (axis) => axis > occupiedExtentLimit
  )
) {
  throw new TrainingDataError(
    'SOURCE_OCCUPIED_BOUNDS_LIMIT',
    `artifact:${sourceId}`,
    {
      stage: 'measurement',
      source_id: sourceId,
      occupied_extent: measured.occupied_bounds.extent,
      max_extent: occupiedExtentLimit,
      exact_sha256: exactSha256
    }
  );
}
```

The default remains `null`, preserving direct parser callers that do not ask
for an R2 extent decision. The signal must occur before tight entries enter the
fingerprint function.

- [ ] **Step 5: Map the signal in batch intake**

Pass `occupiedExtentLimit: 64`. In the parse catch, handle the signal before
generic parser-limit/malformed mapping:

```js
if (error.code === 'SOURCE_OCCUPIED_BOUNDS_LIMIT') {
  return candidateOutcome(base, {
    ...common,
    source_profile_file: null,
    outcome: 'deferred',
    reason: 'occupied_bounds_exceed_64'
  });
}
```

Remove the post-fingerprint extent branch. This ensures no fingerprint file is
written for an oversized observation.

- [ ] **Step 6: Preserve legacy duplicate precedence and extent evidence**

Pass `occupiedExtentLimit: 64` from legacy audit. When the measurement signal
is caught, construct:

```js
const common = {
  artifact_sha256: error.metadata.exact_sha256,
  occupied_extent: error.metadata.occupied_extent,
  duplicate_of: null
};
```

Apply the existing first-seen legacy duplicate check, verified quarantine
duplicate check, and then `deferred/occupied_bounds_exceed_64`. Keep malformed
and parser-limit catch behavior unchanged for all other errors.

- [ ] **Step 7: Verify GREEN and memory/security boundaries**

Run:

```bash
node --test \
  test/residentialArtifactParser.test.js \
  test/residentialBatchIntake.test.js \
  test/residentialLegacyAudit.test.js \
  test/residentialSchematicArtifact.test.js \
  test/residentialIntakeStorage.test.js
```

Expected: PASS. Confirm dense 64-cube acceptance, 262,145-entry controlled
limit, signed-region reversal, entity/security limits, and sealed quarantine
validation remain green.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/training/residential/intake/artifactParser.js \
  src/training/residential/intake/intakeBatch.js \
  src/training/residential/intake/legacyAudit.js \
  test/residentialArtifactParser.test.js \
  test/residentialBatchIntake.test.js \
  test/residentialLegacyAudit.test.js
git commit -m "fix(residential): defer bounds before fingerprinting"
```

---

### Task 4: Prove the branch and update draft PR #6

**Files:**

- Modify only if a cross-module regression requires a focused test:
  `test/residentialIntakeIntegration.test.js`
- Read-only verification: `mc_templates/`, `.local/`, package policy, and
  Stage 7 compatibility tests.
- External update: draft PR #6 body and pushed head branch.

**Interfaces:**

- Consumes: all corrected R2 public interfaces and CLI commands.
- Produces: clean independent review, green full suite, unchanged protected
  paths, pushed commits, and an accurate draft PR description with the four
  resolved blockers removed.

- [ ] **Step 1: Run the focused R2 suite**

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

Expected: PASS. If managed child-process restrictions produce `EPERM`, verify
those subprocess files in the unrestricted full run rather than changing code.

- [ ] **Step 2: Run Stage 7 compatibility**

```bash
node --test \
  test/trainingBoundedNbt.test.js \
  test/trainingVanillaStructureNbt.test.js \
  test/trainingStructuralFingerprint.test.js \
  test/schematicBlockVolume.test.js \
  test/trainingSourceCatalog.test.js
```

Expected: PASS.

- [ ] **Step 3: Run the full suite on the exact integration head**

```bash
npm test -- --test-reporter=dot
```

Expected: all tests pass, including CLI and Git policy subprocess tests.

- [ ] **Step 4: Recheck all 64 legacy templates read-only**

Run the full legacy audit over a byte-for-byte temporary copy of the tracked
corpus so the user's immutable local report cannot conflict:

```bash
node --input-type=module -e "import fs from 'node:fs/promises'; import os from 'node:os'; import path from 'node:path'; import { initializeResidentialWorkspace } from './src/training/residential/workspace/index.js'; import { auditLegacyTemplates } from './src/training/residential/intake/index.js'; const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-real-corpus-')); try { await fs.cp('mc_templates', path.join(projectRoot, 'mc_templates'), { recursive: true }); const root = path.join(projectRoot, '.local', 'residential-model'); await initializeResidentialWorkspace({ root, projectRoot }); const report = await auditLegacyTemplates({ root, projectRoot }); if (report.summary.candidate_count !== 64) throw new Error('expected 64 legacy candidates'); console.log(JSON.stringify(report.summary)); } finally { await fs.rm(projectRoot, { recursive: true, force: true }); }"
git status --short -- mc_templates
```

Expected: the audit reports exactly 64 candidates and Git reports no tracked
or untracked change below `mc_templates/`. The temporary report is removed
with its unique temporary project; `.local/residential-model/` is not read or
written by this verification.

- [ ] **Step 5: Verify repository boundaries**

```bash
git diff --check
git status --short
git diff --name-only -- mc_templates .local package.json
test ! -e docs/superpowers
```

Expected: clean diff, only planned tracked files, no protected-path changes,
and no downloaded/local artifacts staged.

- [ ] **Step 6: Request independent whole-follow-up review**

Review the full range beginning at design commit `4de8615` through the final
implementation head. Require explicit confirmation that all four Important
findings are resolved and no new Critical/Important issue exists. Fix any
validated task-level findings through the plan's review loop before publishing.

- [ ] **Step 7: Push and update draft PR #6**

```bash
git push origin agent/residential-r2-source-intake
gh pr view 6 --json isDraft,baseRefName,headRefName,headRefOid,url
```

Update the PR body to replace the four-blocker section with the resolved
behavior and final test counts. Keep the PR draft unless the user explicitly
requests ready-for-review status.

---

## Completion Evidence

The follow-up is complete only when:

- later same-batch pre-profile observations are exact duplicates;
- lane/reason inversions fail strict report validation;
- changed completed payloads fail closed and unchanged reruns remain
  byte-identical;
- sparse occupied extents above 64 defer before fingerprinting;
- dense entry caps, security limits, signed regions, and Stage 7 remain green;
- all 64 legacy templates are examined read-only;
- `.local/`, `mc_templates/`, and package policy remain unchanged;
- independent review reports no open Critical or Important issue; and
- draft PR #6 points to the verified head and accurately describes the result.
