# Stage 7 R3 Named-Batch Approval and Sequential Pilot Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan sequentially. Do not dispatch parallel agents. The plan has explicit owner gates; stop whenever one is reached.

**Goal:** Convert the owner-approved metadata-only 5+3 slate into a hash-bound named-batch proposal and, only after a second explicit batch approval, run at most one primary Minecraft Java Structure NBT candidate through the existing isolated R3 pilot pipeline.

**Architecture:** The tracked repository receives only this operational plan. The candidate-derived batch draft, approved batch manifest, receipts, quarantine files, preparation records, fingerprints, review records, and pilot reports remain below the ignored `.local/stage7-source-expansion/` root. A payload-free draft is presented to the owner first; the validated `named-batch.json` is written only after the owner approves its exact `batch_sha256`, then the existing one-candidate CLI enforces the mandatory preflight and postflight.

**Tech Stack:** Node.js 24.18.0; the existing `stage7PilotBatch`, `runStage7PublicNbtPilot`, R2 decoder/preparation/fingerprint modules; Conda environment `mcagent-stage7`; Git; credential-free HTTPS for one approved file only.

## Global Constraints

- The owner-approved scope is exactly these five primaries: `thunstructures:lighthouse`, `thunstructures:windmill`, `cottages:oak-cottage`, `more-chinese-structures:tower-1`, and `shrines:small-player-house`; the three reserves are `thunstructures:observatory` for the lighthouse, `shrines:trader-house` for the small residence, and `shrines:watch-tower` for the tower.
- Do not request or retrieve candidate NBT bytes until the owner has approved the computed `batch_sha256` of the exact named batch.
- A primary is processed one at a time. The machine stops at `fingerprinted`; human review is mandatory before a `pilot_ready` decision or the next candidate.
- A reserve may be activated only after its mapped primary has a terminal failure and only with its existing exact approval. Never substitute automatically or process a reserve opportunistically.
- The only allowed network target after named-batch approval is one candidate's canonical immutable HTTPS `.nbt` URL. No clone, archive, directory, general URL, authentication, cookie, companion file, or recursive request is allowed.
- Never touch `.local/stage7-private-research/`, its 42 deferred oversized files, existing private runs, Dataset v1/v2/v3, Dataset v3's `false / 0` real-data gate, normal generation, provider behavior, M3, M4, Apply Mode, or any trainer.
- Candidate-derived files remain ignored and untracked. Do not push, publish, upload, share, package, export, or create a training run.
- Stop immediately on Git, ignored-root, private aggregate, Python preflight, Dataset hash/gate, immutable revision, rights, path, batch hash, or date drift.

---

### Task 1: Re-establish the R3 operational baseline

**Files:**

- Read: `.local/stage7-source-expansion/reports/nomination/five-plus-three-review.json`
- Read: `.local/stage7-source-expansion/reports/nomination/research-ledger.json`
- Read: `src/construction/learning/stage7PilotBatch.js`
- Read: `src/construction/learning/stage7PilotPreflight.js`
- Read: `src/runStage7PublicNbtPilot.js`
- Read: `docs/superpowers/specs/2026-07-20-stage-7-r3-five-candidate-pilot-design.md`
- Create: `docs/superpowers/plans/2026-07-21-stage-7-r3-named-batch-and-pilot.md`

**Interfaces:**

- Consumes the owner scores recorded in the local 5+3 review package and the existing R3 batch validator.
- Produces a clean, code-revision-bound starting point for a payload-free batch draft.

- [ ] **Step 1: Confirm the exact owner-approved composition**

  Parse the local review package and require exactly eight `accept` decisions, each with a score of at least 60. Require five primary IDs and three reserve IDs; bind the three reserve mappings as follows:

  ```text
  thunstructures:observatory -> thunstructures:lighthouse
  shrines:trader-house -> shrines:small-player-house
  shrines:watch-tower -> more-chinese-structures:tower-1
  ```

  This does not create an approval manifest or request any payload.

- [ ] **Step 2: Run the mandatory read-only drift checks**

  Run the existing public-pilot preflight prerequisites without a real batch mutation: clean tracked Git status, expected branch, both `.local` roots ignored and untracked, private aggregate `22/42/22/22/22` with a `15/7` split and three run directories, Python private-preflight count `22`, Dataset v1/v2/v3 SHA-256 values, and Dataset v3 `ready_for_m3_real_data=false` plus `training_eligible_count=0`.

  Expected: every baseline value matches the R3 design; otherwise stop before writing a draft.

- [ ] **Step 3: Verify the pre-existing operational implementation with synthetic tests**

  Run:

  ```bash
  node --test test/stage7PilotBatch.test.js test/stage7PublicNbtPilotCli.test.js test/stage7Pilot.test.js test/stage7PilotReview.test.js test/stage7PilotBoundary.test.js test/stage7PilotFilesystem.test.js test/stage7PilotArtifacts.test.js test/stage7CandidateAcquisition.test.js test/stage7CandidateReadinessIntegration.test.js test/stage7CandidateReadinessStore.test.js test/stage7CandidateReadinessState.test.js test/stage7CandidateReadinessBoundary.test.js
  ```

  Expected: all selected synthetic-only R2/R3 tests pass. No real network request is part of the test suite.

- [ ] **Step 4: Freeze the executable code revision before creating a batch**

  After this tracked plan has been reviewed and committed, require `git status --porcelain=v1 --untracked-files=no` to be empty and record `git rev-parse HEAD` as the exact `batch.code_revision`. Do not reuse an old revision or create a batch while tracked files are dirty.

### Task 2: Refresh evidence and build a payload-free named-batch draft

**Files:**

- Read: `.local/stage7-source-expansion/reports/nomination/five-plus-three-review.json`
- Read: `.local/stage7-source-expansion/reports/nomination/research-ledger.json`
- Create: `.local/stage7-source-expansion/reports/nomination/named-batch-draft.json`
- Create: `.local/stage7-source-expansion/reports/nomination/named-batch-draft.md`

**Interfaces:**

- Consumes the eight approved candidate identities and a clean committed code revision from Task 1.
- Produces an owner-reviewable batch object without an approval block, a payload, a quarantine directory, or an operational event.

- [ ] **Step 1: Refresh only public non-payload evidence on the batch date**

  For every approved entry, recheck its immutable commit, exact lower-case relative path, canonical raw HTTPS URL, same-revision license page, public preview URL, direct one-NBT template declaration, author chain, and declared absence of AI/ML or platform conflicts. Do not open a raw NBT URL, download an NBT body, clone a repository, or inspect binary content.

  Create one canonical JSON evidence object per candidate containing only the refreshed public metadata and hash it with `hashPilotValue`. Use the resulting 64-character digest as both the candidate's `admission_evidence_sha256` and its separately scoped rights-evidence digest only when that evidence object includes the corresponding fields. Otherwise create distinct canonical evidence objects and hashes.

- [ ] **Step 2: Normalize taxonomy labels required by the existing strict batch contract**

  Use the following operational labels so each reserve matches its primary exactly while preserving the more detailed display labels in the review package:

  | Candidate pair or item | `primary_function` | `building_type` |
  | --- | --- | --- |
  | Lighthouse / Observatory | `vertical_landmark` | `vertical_landmark` |
  | Windmill | `rural_utility` | `windmill` |
  | Oak Cottage | `forest_residence` | `cottage` |
  | Tower Variant 1 / Watch Tower | `tower_landmark` | `tower` |
  | Small Player House / Trader House | `compact_residence` | `residence` |

  Use source groups `thunstructures`, `cottages`, `more-chinese-structures`, and `shrines`; all are valid local identifiers. The primary slate then has four source groups and five building types. Use `minecraft_java_structure_nbt`, `true` for expected vanilla compatibility, and `false` for expected external dependency and jigsaw values only where the refreshed public configuration evidence supports them.

- [ ] **Step 3: Form the exact unsigned `batch` object**

  Each of the eight candidates must satisfy the strict `stage7PilotBatch.js` schema with these non-negotiable fields:

  ```text
  candidate_id, role, reserve_for, source_id, source_group, asset_family,
  immutable_revision, relative_nbt_path, canonical_file_url,
  approved_redirect_urls, primary_function, building_type, style_family,
  environment, admission_state, admission_evidence_sha256, rights, quality,
  technical, scores
  ```

  Set `admission_state` to `admission_contract_ready`. Set every required rights permission (`download`, `copy`, `transform`, `training`, and `local_retention`) to `true`; set `ai_ml_restriction`, `platform_conflict`, and `upstream_conflict` to `false` only if the freshly refreshed evidence supports those values. Use an empty `approved_redirect_urls` array unless a specific final HTTPS redirect target was already evidenced without requesting an NBT payload.

  Normalize the existing 0–100 scores to the required 0–1 scale and recompute `total` using exactly `0.45 * parser_reliability + 0.30 * quality + 0.15 * diversity + 0.10 * source_stability`. Do not embed payload hashes, bytes, local paths, prepared data, or training fields.

- [ ] **Step 4: Render the unsigned owner-review draft**

  Store the unsigned batch object and `batch_sha256 = hashPilotValue(batch)` in `named-batch-draft.json`. The companion Markdown must show only: batch ID, UTC date, committed code revision, ordered candidate IDs/titles/roles, reserve bindings, canonical public source links, license identifiers, and the computed batch digest. It must prominently state that the draft has no `approval` block and cannot call the pilot CLI.

- [ ] **Step 5: Validate the draft without creating an operational manifest**

  Use a local Node assertion to require the 5+3 composition, source/type diversity, valid lower-case paths, public HTTPS URLs, fresh evidence date, score arithmetic, and a correctly computed batch hash. Do not create `.local/stage7-source-expansion/manifests/named-batch.json` in this task.

### Task 3: Stop for hash-bound owner approval

**Files:**

- Read: `.local/stage7-source-expansion/reports/nomination/named-batch-draft.json`
- Read: `.local/stage7-source-expansion/reports/nomination/named-batch-draft.md`

**Interfaces:**

- Consumes the validated unsigned draft from Task 2.
- Produces only a human decision; it produces no new candidate-derived file.

- [ ] **Step 1: Present the exact immutable scope**

  Give the owner the clickable local draft, its `batch_sha256`, the five primary IDs, the three reserve bindings, and the exact committed `code_revision`. State that approval will allow at most one selected primary to be acquired, quarantined, parsed, prepared, and fingerprinted; it will not authorize training, Dataset admission, publication, export, or any reserve activation.

- [ ] **Step 2: Obtain a literal approval tied to the printed digest**

  Require the owner to reply with `Approve batch <the exact printed batch_sha256>`. A generic “OK”, an approval of different candidates, an approval of a changed revision, or an approval without the digest fails closed. Stop here until that reply arrives.

### Task 4: Create the approved manifest and validate it without network acquisition

**Files:**

- Read: `.local/stage7-source-expansion/reports/nomination/named-batch-draft.json`
- Create: `.local/stage7-source-expansion/manifests/named-batch.json`

**Interfaces:**

- Consumes the exact owner reply from Task 3 and the unchanged draft batch object.
- Produces the only operational approval artifact accepted by the existing CLI.

- [ ] **Step 1: Bind the owner approval exactly**

  Create the strict document `{schema_version, batch, batch_sha256, approval}`. Copy the unsigned `batch` and computed `batch_sha256` byte-for-byte. Set `approval.approved_batch_sha256` to the same digest, record the approval time in ISO-8601 UTC, record the owner identifier, set `authorizes_acquisition=true`, and set both `authorizes_training=false` and `authorizes_dataset_admission=false`.

- [ ] **Step 2: Run the immutable no-write batch validation command**

  Run:

  ```bash
  npm run pilot:stage7:public-nbt -- validate-batch --root .local/stage7-source-expansion --batch manifests/named-batch.json --public-pilot-only
  ```

  Expected: `candidate_count: 8`, and both training and Dataset-admission authorization values are `false`. This command must complete its complete preflight and write no quarantine, prepared, fingerprint, readiness, review, or report artifact.

- [ ] **Step 3: Re-run the post-validation boundary scan**

  Require clean tracked Git status; both local roots ignored/untracked; unchanged private aggregate and Python preflight; fixed Dataset hashes and v3 false/zero gate; and zero candidate payload, prepared, fingerprint, readiness, review, and pilot-report files. On any drift, preserve the manifest for audit and stop before a network request.

### Task 5: Run one approved primary and stop for its hash-bound human review

**Files:**

- Read: `.local/stage7-source-expansion/manifests/named-batch.json`
- Create: `.local/stage7-source-expansion/quarantine/thunstructures:lighthouse/<content-sha256>.nbt` only if the isolated receiver validates the one approved response
- Create: append-only operational files below `.local/stage7-source-expansion/` only through the existing CLI
- Create: `.local/stage7-source-expansion/reports/pilots/` content-safe machine report only through the existing CLI

**Interfaces:**

- Consumes the validated approved manifest and the existing R3 CLI.
- Produces a content-safe machine summary for exactly `thunstructures:lighthouse`, ending at `fingerprinted` or a terminal safe state.

- [ ] **Step 1: Verify fresh preflight/date/revision before the only allowed request**

  Require the batch date to equal the current UTC date, the batch `code_revision` to equal `HEAD`, the five-plus-three manifest hash to match approval, all rights evidence to match the batch date, and all mandatory Git/private/Dataset boundaries to pass. Do not bypass a date drift by changing the batch after the owner approved its digest; create a new draft and repeat Task 3 instead.

- [ ] **Step 2: Process only the first primary through the bounded CLI**

  Run exactly:

  ```bash
  npm run pilot:stage7:public-nbt -- run-candidate --root .local/stage7-source-expansion --batch manifests/named-batch.json --candidate-id thunstructures:lighthouse --public-pilot-only
  ```

  The receiver may request only the manifest's canonical lighthouse URL. It must enforce credential-free HTTPS, redirects limited to the manifest allow-list, content-type/magic checks, 16 MiB streaming limit, quarantine containment, bounded parsing, complete-single-structure validation, actual `64^3` extent, deterministic preparation, and deterministic fingerprints. It must never fetch a second candidate.

- [ ] **Step 3: Report only the safe machine summary and stop**

  Report candidate ID, state, terminal flag, nine aggregate token counts, duplicate-proposal count, safe reason codes, and unchanged authority booleans. Do not expose bytes, hashes, raw content, local absolute paths, block/entity payloads, or generated reconstruction. If the state is `fingerprinted`, prepare the prescribed human-review input and stop for the owner to decide identity, completeness, labels, quality, and any duplicate proposal. If it is terminal, report the safe failure class and stop before activating any reserve.

### Task 6: Continue only through explicit per-candidate decisions

**Files:**

- Create: `.local/stage7-source-expansion/reviews/pilot-review-input.json` only after a `fingerprinted` machine result
- Create: append-only pilot-review and readiness records only through the existing CLI

**Interfaces:**

- Consumes one candidate's machine result and a later explicit human decision.
- Produces either one `pilot_ready` record, one terminal record, or a stop at the exact reserve gate.

- [ ] **Step 1: Record a human decision only after the owner supplies it**

  For a `fingerprinted` candidate, write the strict review input with the candidate ID, current batch hash, current content/fingerprint bindings, ISO review time, reviewer identifier, and explicit identity/completeness/label/quality/near-duplicate decisions. Then run the sole permitted finalization command for that candidate. Do not infer a human acceptance from the prior metadata score.

- [ ] **Step 2: Select the next action from the state machine**

  If the primary is `pilot_ready`, return to Task 5 for the next unprocessed primary only after a fresh preflight. If the primary is terminal, stop and present the mapped reserve decision; do not acquire the reserve until the owner explicitly authorizes that reserve activation. If any state is non-terminal but not `fingerprinted`, stop for diagnosis rather than retrying a different URL or candidate.

- [ ] **Step 3: Complete R3 only at five-of-five**

  After exactly five `pilot_ready` candidates, run the isolated audit command and the full Node and Stage 7 Python suites. Completion requires five ready samples across at least four source groups and four building types, complete event chains, unchanged private/Dataset boundaries, no acquired unactivated reserve, no tracked candidate artifact, and zero training or Dataset-admission authority. Stop after the audit; any training proposal is a separate owner-approved stage requiring a device and positive optimizer-step budget.

## Plan self-review

- Scope coverage: Tasks 1–2 cover clean baseline, fresh evidence, exact manifest schema, and taxonomy compatibility; Task 3 enforces hash-bound owner authority; Task 4 validates without network; Tasks 5–6 enforce one-candidate processing, human review, reserve failure rules, and completion boundaries.
- Placeholder scan: the only runtime values are cryptographically computed from the exact unsigned batch or emitted by the existing pilot tooling; no task permits guessing, broad acquisition, or a generic URL.
- Interface consistency: the batch fields, approval object, commands, candidate ID, root, and review path match `stage7PilotBatch.js` and `runStage7PublicNbtPilot.js` exactly.

## Execution handoff

This plan intentionally stops twice: first for approval of this operational plan, then for approval of the computed named-batch digest. Execute it inline and sequentially with `superpowers:executing-plans`; do not use subagents.
