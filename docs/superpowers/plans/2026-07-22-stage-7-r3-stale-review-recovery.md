# Stage 7 R3 Stale Review Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not dispatch parallel agents because the operational root is shared and contains one active candidate state.

**Goal:** Permit a delayed, hash-bound `record-review` for an already-fingerprinted R3 candidate without relaxing acquisition or data-governance gates.

**Architecture:** The CLI selects an internal `reviewRecovery` preflight profile only for its exact `record-review` command. `runPilotPreflight` continues to require same-day/exact-HEAD for every normal command; the recovery profile permits only a past date and a Git descendant of the original batch revision. Existing review finalization remains responsible for proving the candidate is fingerprinted and that every batch, content, preparation, fingerprint, label, and duplicate binding is exact.

**Tech Stack:** Node.js ESM, `node:test`, existing `runPilotPreflight`, `runStage7PublicNbtPilotCli`, and Git ancestry checks.

## Global Constraints

- No user-facing CLI flag, environment variable, or alternate command may select recovery mode.
- `validate-batch`, `run-candidate`, and `audit` retain the current exact-date and exact-`HEAD` preflight requirements.
- Recovery accepts `batch.as_of < today` only; it rejects same-command future dates.
- Recovery accepts a code revision only when `git merge-base --is-ancestor batch.code_revision HEAD` succeeds.
- Every existing root, branch, ignored-root, private aggregate, Python, Dataset hash, and Dataset v3 `ready_for_m3_real_data=false` / `training_eligible_count=0` check remains before and after the review write.
- No change may authorize acquisition, training, Dataset admission, normal-generation behavior, M3, or M4 Apply Mode.

---

### Task 1: Specify the recovery boundary with failing CLI and preflight tests

**Files:**
- Modify: `test/stage7PublicNbtPilotCli.test.js`

**Interfaces:**
- Consumes: `runStage7PublicNbtPilotCli(argv, context)` and `runPilotPreflight(input)`.
- Produces: regression tests that require recovery only for `record-review` and require date/ancestry rejection outside that exact recovery case.

- [ ] **Step 1: Make the CLI test assert its desired internal preflight input**

In `CLI preflights validation without writes and mutating commands before and after writes`, extend the existing assertions so `validate-batch`, `run-candidate`, and `audit` receive no `reviewRecovery` property, while both `record-review` preflight calls receive:

```js
{ reviewRecovery: true }
```

Keep the exact call order unchanged: the review still performs `read`, preflight, layout, review-file read, finalization, and postflight.

- [ ] **Step 2: Add a failing direct preflight test for the allowed recovery case**

Add a test named `preflight permits only a past descendant batch for review recovery`. Build `pilotBatchFixture()` with its 2026-07-20 batch date, run it with `today: '2026-07-21'`, `reviewRecovery: true`, and a command double that returns a distinct 40-character `HEAD` and succeeds only for:

```js
['merge-base', '--is-ancestor', batch.batch.code_revision, descendantHead]
```

Assert that the preflight result contains `git_head: descendantHead` and that the ancestry command was called once.

- [ ] **Step 3: Add failing rejection tests**

In the same test, assert these cases reject before Python runs:

```js
// A future batch date remains a PREFLIGHT_DATE_DRIFT even in recovery mode.
const future = pilotBatchFixture({ batch: { as_of: '2026-07-22' } });

// A past batch with an ancestry command failure remains GIT_HEAD_DRIFT.
const stale = pilotBatchFixture();
```

Run both with `today: '2026-07-21'`, `reviewRecovery: true`, a distinct descendant-head response, and respectively a successful or failing `merge-base` response. Assert neither rejected case calls `conda`.

- [ ] **Step 4: Run the focused test to verify RED**

Run:

```bash
node --test test/stage7PublicNbtPilotCli.test.js
```

Expected: the new recovery tests fail because `reviewRecovery` is not yet forwarded by the CLI and `runPilotPreflight` still rejects every non-today date or non-identical HEAD.

### Task 2: Implement the internal recovery profile and turn the tests green

**Files:**
- Modify: `src/runStage7PublicNbtPilot.js`
- Modify: `src/construction/learning/stage7PilotPreflight.js`
- Test: `test/stage7PublicNbtPilotCli.test.js`

**Interfaces:**
- Consumes: the parsed immutable CLI command and the validated `batchDocument`.
- Produces: `runPilotPreflight({ ..., reviewRecovery: boolean })`, with recovery mode reachable only from the `record-review` branch of `runStage7PublicNbtPilotCli`.

- [ ] **Step 1: Forward a non-user-controlled recovery bit from the CLI**

Replace the preflight input construction in `runStage7PublicNbtPilotCli` with:

```js
const preflightInput = {
  repositoryRoot,
  root,
  batchDocument,
  reviewRecovery: options.command === 'record-review'
};
```

Do not alter `parseStage7PublicNbtPilotArgs`; no new command-line option is allowed. Both existing `preflight(preflightInput)` calls must reuse the same object.

- [ ] **Step 2: Add the default-false preflight parameter**

Extend the `runPilotPreflight` parameter object with:

```js
reviewRecovery = false
```

Immediately after validating the batch, compute:

```js
const allowsPastBatch = reviewRecovery === true && batch.batch.as_of < today;
```

Replace the exact-date rejection with:

```js
if (batch.batch.as_of !== today && !allowsPastBatch) {
  fail('PREFLIGHT_DATE_DRIFT', 'batch-as-of');
}
```

This keeps an equal date normal and rejects any future date because its lexical ISO date value is greater than `today`.

- [ ] **Step 3: Gate code-revision drift on Git ancestry only in recovery**

After reading `HEAD`, retain exact equality for the normal case. For a different `HEAD`, permit it only when recovery is active and this existing safe boolean helper succeeds:

```js
const descendant = reviewRecovery === true && await gitSucceeds(
  execFileImpl,
  repository,
  ['merge-base', '--is-ancestor', batch.batch.code_revision, head]
);
if (head !== batch.batch.code_revision && !descendant) {
  fail('GIT_HEAD_DRIFT', 'batch-code-revision');
}
```

Leave all subsequent preflight checks and the returned `git_head` unchanged. The caller has no way to use this branch except the exact `record-review` command, and `finalizePilotCandidate` continues to reject every candidate state other than `fingerprinted` or its idempotent post-review state.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run:

```bash
node --test test/stage7PublicNbtPilotCli.test.js
```

Expected: every test passes; the normal command assertions prove no acquisition or audit path receives recovery mode, and the rejection cases prove future/non-descendant batches remain blocked.

- [ ] **Step 5: Run the complete R2/R3 Node boundary suite**

Run:

```bash
node --test test/stage7PilotBatch.test.js test/stage7PublicNbtPilotCli.test.js test/stage7Pilot.test.js test/stage7PilotReview.test.js test/stage7PilotBoundary.test.js test/stage7PilotFilesystem.test.js test/stage7PilotArtifacts.test.js test/stage7CandidateAcquisition.test.js test/stage7CandidateReadinessIntegration.test.js test/stage7CandidateReadinessStore.test.js test/stage7CandidateReadinessState.test.js test/stage7CandidateReadinessBoundary.test.js
```

Expected: all selected tests pass with no network request and no changed authority flags.

- [ ] **Step 6: Commit the implementation**

```bash
git add src/runStage7PublicNbtPilot.js src/construction/learning/stage7PilotPreflight.js test/stage7PublicNbtPilotCli.test.js
git commit -m "fix(stage7): recover stale fingerprint review"
```

### Task 3: Finalize the owner-approved lighthouse review under the recovered boundary

**Files:**
- Create: `.local/stage7-source-expansion/reviews/pilot-review-input.json`
- Create: append-only review and readiness records through the existing public-NBT CLI

**Interfaces:**
- Consumes: the immutable 2026-07-21 approved batch, the already-fingerprinted lighthouse, and the owner’s recorded decisions: identity consistent, complete, high-confidence labels, accepted quality, and no near duplicate.
- Produces: a `pilot_ready` state only; both training and Dataset-admission authority remain false.

- [ ] **Step 1: Construct the strict review input from existing bound records**

Read the batch, lighthouse fingerprint, and duplicate proposals. Create the exact fixed review path with `reviewed_by: 'owner'`, current ISO UTC review time, original batch/content/preparation/fingerprint hashes, the batch’s exact taxonomy labels, `identity_consistent: true`, `completeness: 'complete'`, `quality_decision: 'accept'`, `label_confidence: 'high'`, an empty `near_duplicate_decisions` array when no proposal exists, `reason_codes: []`, and both authority booleans `false`.

- [ ] **Step 2: Finalize only the lighthouse**

Run:

```bash
npm run pilot:stage7:public-nbt -- record-review --root .local/stage7-source-expansion --batch manifests/named-batch.json --candidate-id thunstructures:lighthouse --input reviews/pilot-review-input.json --public-pilot-only
```

Expected: the safe CLI summary reports `candidate_id: thunstructures:lighthouse`, `state: pilot_ready`, `terminal: false`, and both authority booleans `false`.

- [ ] **Step 3: Report the stop point**

Report the safe finalization summary and stop. Do not process the windmill in this task: the original batch remains date-stale for `run-candidate`, so a fresh current-day batch and new hash-bound owner approval are still required before any second acquisition.

## Plan self-review

- Spec coverage: Task 1 covers the internal-only recovery boundary and rejection cases; Task 2 implements it without new CLI surface and verifies the complete R2/R3 suite; Task 3 uses the existing finalizer to bind the owner-approved lighthouse review.
- Placeholder scan: no runtime field is unspecified; every production change, command, expected result, and review decision is explicit.
- Type consistency: `reviewRecovery` is a boolean defaulting to `false` in `runPilotPreflight` and is supplied only from the parsed `record-review` command in the CLI.
