# Architecture Playbook P1 Course Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic 50-episode source ledger for the Bilibili course and prove, on episode `BV1HhEuzZEyZ`, which media, transcript, timestamp, frame, terminology, and evidence-package operations are currently reproducible.

**Architecture:** Keep fetched platform responses and all media-derived artifacts under the ignored `.local/architecture-playbook/` boundary. Convert an explicit local API snapshot into a strict, stable, committed manifest through pure JavaScript; tests never call the live platform. Treat the media probe as a capability report until audio, frames, and transcripts have real local evidence.

**Tech Stack:** Node.js 20+ ES modules, built-in `node:test`, built-in `fetch`, `crypto`, and `fs`; Bilibili public metadata API; optional local-only media tools discovered at runtime.

**Spec:** `docs/superpowers/specs/2026-08-24-architecture-playbook-program-design.md`

## Global Constraints

- Minecraft target remains Java 1.21 / 1.21.1; P1 must not alter generation behavior.
- The primary school is only `heihui-jileniao` / 黑辉极乐鸟; no external author content is merged.
- Raw API snapshots, source media, audio, transcripts, frames, and evidence drafts stay under `.local/architecture-playbook/` and are never committed.
- Git contains only stable metadata, original summaries, schemas, reports, and source links/time ranges.
- The fixed technical probe episode is `BV1HhEuzZEyZ` (`1.2 结构主次`).
- Unknown, inaccessible, or unverified properties remain explicit; no guessed transcript, timestamp, visual fact, rights grant, or building rule is allowed.
- Tests are offline and deterministic. The live network is only an acquisition adapter whose output becomes an explicit local snapshot.

---

### Task 1: Align the repository policy test with the approved active plan

**Files:**
- Modify: `test/projectPolicy.test.js`

**Interfaces:**
- Consumes: tracked paths returned by `git ls-files`.
- Produces: a policy assertion that rejects retired Stage 7 governance archives while allowing the active architecture-playbook spec and plan.

- [ ] **Step 1: Replace the obsolete directory-absence assertion with an allowlisted active-program assertion**

```js
test('process documents are limited to the active architecture playbook program', () => {
  const tracked = execFileSync('git', ['ls-files', 'docs/superpowers'], {
    cwd: ROOT,
    encoding: 'utf8'
  }).trim().split('\n').filter(Boolean);
  assert.ok(tracked.length >= 1);
  for (const relative of tracked) {
    assert.match(
      relative,
      /^docs\/superpowers\/(?:plans|specs)\/\d{4}-\d{2}-\d{2}-architecture-playbook-[a-z0-9-]+\.md$/u,
      relative
    );
  }
});
```

- [ ] **Step 2: Run the focused policy test outside the restrictive subprocess sandbox**

Run: `node --test test/projectPolicy.test.js`

Expected: PASS for all five policy tests; a non-playbook file under `docs/superpowers/` would fail the new assertion.

- [ ] **Step 3: Commit the policy alignment together with the P1 implementation plan**

```bash
git add test/projectPolicy.test.js docs/superpowers/plans/2026-08-25-architecture-playbook-p1-course-probe.md
git commit -m "docs(playbook): plan deterministic course probe"
```

### Task 2: Define and validate the committed CourseManifest contract

**Files:**
- Create: `src/playbook/contracts/playbookContractError.js`
- Create: `src/playbook/contracts/courseManifest.js`
- Create: `src/playbook/contracts/index.js`
- Create: `test/playbookCourseManifest.test.js`

**Interfaces:**
- Consumes: a plain JavaScript manifest object.
- Produces: `validateCourseManifest(value): Readonly<CourseManifest>` and `PLAYBOOK_COURSE_MANIFEST_VERSION`.

- [ ] **Step 1: Write failing contract tests**

The test fixture must contain two hand-written episodes and assert that validation freezes the clone, preserves order, rejects duplicate BV IDs, rejects a mismatched declared count, rejects an author other than `351448296`, and rejects `external_release_status` other than `not-authorized`.

Run: `node --test test/playbookCourseManifest.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/playbook/contracts/index.js`.

- [ ] **Step 2: Implement the minimal strict contract**

The top-level fields are exactly:

```text
schema_version / manifest_id / captured_at / source_snapshot_sha256
course / rights / episodes
```

Each episode is exactly:

```text
order / episode_id / bvid / aid / cid / season_episode_id
curriculum_title / published_title / duration_seconds / published_at
canonical_url / source_status / rights / metadata_fingerprint_sha256
processing
```

Reject unknown fields, duplicate stable identities, non-contiguous order, invalid BV IDs, count mismatch, non-HTTPS canonical URLs, unsafe rights escalation, and a technical probe other than `BV1HhEuzZEyZ`. Clone before validation and deep-freeze the result.

- [ ] **Step 3: Run the contract tests**

Run: `node --test test/playbookCourseManifest.test.js`

Expected: PASS.

- [ ] **Step 4: Commit the contract**

```bash
git add src/playbook/contracts test/playbookCourseManifest.test.js
git commit -m "feat(playbook): validate course manifests"
```

### Task 3: Convert a Bilibili season snapshot into deterministic metadata

**Files:**
- Create: `src/playbook/course/bilibiliCourseSnapshot.js`
- Create: `test/bilibiliCourseSnapshot.test.js`
- Create: `test/fixtures/bilibiliCourseSnapshotFixture.js`

**Interfaces:**
- Consumes: `buildCourseManifestFromBilibiliSnapshot(snapshot, options)` where options contain `capturedAt`, `sourceUrl`, and `expectedEpisodeCount`.
- Produces: a validated CourseManifest with stable episode order and SHA-256 fingerprints.

- [ ] **Step 1: Write a failing mapper test with a complete synthetic platform shape**

The fixture must mirror `data.ugc_season.sections[].episodes[]`, including `arc`, `page`, author, rights, dates, durations, IDs, and BV IDs. Assert literal values for the first and second mapped episodes, canonical URLs, rights states, technical-probe assignment, and byte-identical JSON for repeated calls.

Run: `node --test test/bilibiliCourseSnapshot.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 2: Implement the pure mapper**

Flatten sections in source order. Derive `published_title` from `page.part`, not the curriculum label. Hash canonical JSON containing only stable metadata; exclude view/like/reply statistics. Record platform flags as observations, not licenses:

```js
{
  public_access_observed: true,
  api_download_flag: Boolean(episode.arc.rights.download),
  no_reprint_flag: Boolean(episode.arc.rights.no_reprint),
  local_analysis_status: 'project-authorized',
  training_status: 'not-reviewed',
  external_release_status: 'not-authorized'
}
```

- [ ] **Step 3: Run mapper and contract tests**

Run: `node --test test/bilibiliCourseSnapshot.test.js test/playbookCourseManifest.test.js`

Expected: PASS.

- [ ] **Step 4: Commit the mapper**

```bash
git add src/playbook/course test/bilibiliCourseSnapshot.test.js test/fixtures/bilibiliCourseSnapshotFixture.js
git commit -m "feat(playbook): map bilibili course snapshots"
```

### Task 4: Add an offline-first course acquisition CLI and generate the 50-episode ledger

**Files:**
- Create: `src/runArchitecturePlaybookCourse.js`
- Modify: `package.json`
- Create: `test/architecturePlaybookCourseCli.test.js`
- Create: `docs/architecture-playbook/course/course-manifest.json`
- Local only: `.local/architecture-playbook/work/bilibili-season-4369851.json`

**Interfaces:**
- Consumes: `fetch --bvid <BV> --snapshot <local-path>` and `manifest --snapshot <local-path> --output <repo-path> --captured-at <ISO>`.
- Produces: an atomic local snapshot or stable committed manifest; never mixes acquisition and conversion in one implicit action.

- [ ] **Step 1: Write failing parser, path-boundary, and CLI integration tests**

Assert that fetch targets must remain under `.local/architecture-playbook/`, committed manifest output must equal `docs/architecture-playbook/course/course-manifest.json`, unknown flags fail, an existing different raw snapshot is not overwritten without `--replace`, and offline conversion writes byte-stable JSON ending in one newline.

Run: `node --test test/architecturePlaybookCourseCli.test.js`

Expected: FAIL because the runner does not exist.

- [ ] **Step 2: Implement the minimal CLI using built-in fetch and atomic rename**

Add the package command:

```json
"playbook:course": "node src/runArchitecturePlaybookCourse.js"
```

Fetch only `https://api.bilibili.com/x/web-interface/view?bvid=<BV>` and store the verbatim response locally. The manifest command reads the snapshot, computes its SHA-256, calls the pure mapper, and refuses any course ID, author ID, or episode count outside the P1 contract.

- [ ] **Step 3: Run focused tests**

Run: `node --test test/architecturePlaybookCourseCli.test.js test/bilibiliCourseSnapshot.test.js test/playbookCourseManifest.test.js`

Expected: PASS.

- [ ] **Step 4: Fetch the current local snapshot**

Run:

```bash
npm run playbook:course -- fetch --bvid BV1HhEuzZEyZ --snapshot .local/architecture-playbook/work/bilibili-season-4369851.json
```

Expected: `snapshot_status=created`, course ID `4369851`, episode count `50`; no media content is downloaded.

- [ ] **Step 5: Generate and validate the committed manifest**

Run:

```bash
npm run playbook:course -- manifest --snapshot .local/architecture-playbook/work/bilibili-season-4369851.json --output docs/architecture-playbook/course/course-manifest.json --captured-at 2026-08-25T00:00:00.000Z
```

Expected: exactly 50 unique episodes, contiguous order, primary author `351448296`, technical probe `BV1HhEuzZEyZ`, no source transcript or image content.

- [ ] **Step 6: Commit the CLI and manifest**

```bash
git add package.json package-lock.json src/runArchitecturePlaybookCourse.js test/architecturePlaybookCourseCli.test.js docs/architecture-playbook/course/course-manifest.json
git commit -m "feat(playbook): record fifty-episode course manifest"
```

### Task 5: Define the EvidenceNote draft and run the single-episode capability probe

**Files:**
- Create: `docs/architecture-playbook/rules/schemas/evidence-note.schema.json`
- Create: `src/playbook/course/probeCapabilities.js`
- Create: `test/playbookProbeCapabilities.test.js`
- Create: `docs/architecture-playbook/reports/p1-course-manifest-and-probe.md`
- Local only: `.local/architecture-playbook/evidence/BV1HhEuzZEyZ/probe-capabilities.json`

**Interfaces:**
- Consumes: manifest episode, discovered executable paths, subtitle metadata, and explicit local artifact paths.
- Produces: `buildProbeCapabilityReport(input)` plus an evidence schema that distinguishes `fact`, `author_claim`, `inference`, and `contrast`.

- [ ] **Step 1: Write failing capability-report tests**

Assert that missing `yt-dlp`, `ffmpeg`, ASR, transcript, and frames yield explicit `blocked`/`unavailable` states; metadata access alone cannot mark transcription, timestamp alignment, frame extraction, terminology review, or evidence reconstruction as passed. Assert that no local artifact path appears in the public summary.

Run: `node --test test/playbookProbeCapabilities.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 2: Implement the minimal capability report**

Probe states are `passed`, `blocked`, `unavailable`, `unresolved`, or `not-run`. A stage can be `passed` only when its declared local evidence exists and its prerequisite stages passed. The public projection includes status, reason codes, hashes, counts, and next actions, but strips raw text and absolute/local paths.

- [ ] **Step 3: Write the EvidenceNote JSON Schema draft**

Require stable evidence ID, episode BV ID, millisecond time range, statement type, original paraphrase, observed-demo description, supported rule candidate IDs, confidence, unresolved terms, and review status. Forbid additional properties. Do not include full transcript text or screenshot bytes.

- [ ] **Step 4: Record the current honest probe result**

At minimum, record that public metadata and stable episode identity passed, subtitle list is empty, and this environment initially lacks `yt-dlp`, `ffmpeg`, and ASR. If a minimal local-only toolchain is installed during this task, rerun and replace only the ignored private capability record; the public report must preserve both the initial limitation and final evidence-backed status.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test test/playbookProbeCapabilities.test.js`

Expected: PASS.

```bash
git add docs/architecture-playbook/rules/schemas/evidence-note.schema.json src/playbook/course/probeCapabilities.js test/playbookProbeCapabilities.test.js docs/architecture-playbook/reports/p1-course-manifest-and-probe.md
git commit -m "feat(playbook): report single-episode probe capabilities"
```

### Task 6: Verify P1 and update the stable project entry

**Files:**
- Modify: `docs/architecture-playbook/README.md`

**Interfaces:**
- Consumes: manifest, focused test results, probe report, and ignored-boundary checks.
- Produces: an accurate P1 status and explicit P2 gate decision.

- [ ] **Step 1: Run all playbook and policy tests**

Run:

```bash
node --test test/projectPolicy.test.js test/playbookCourseManifest.test.js test/bilibiliCourseSnapshot.test.js test/architecturePlaybookCourseCli.test.js test/playbookProbeCapabilities.test.js
```

Expected: PASS.

- [ ] **Step 2: Verify the private/public boundary**

Run:

```bash
git check-ignore .local/architecture-playbook/work/bilibili-season-4369851.json
git ls-files .local/architecture-playbook
```

Expected: the snapshot is ignored and `git ls-files` emits nothing.

- [ ] **Step 3: Run the complete regression suite outside the restrictive subprocess sandbox**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 4: Update the README with exact outcomes**

Record the 50-episode manifest path, capture date, technical probe status, unresolved media-tool or transcript limitations, and whether P2 is open. Do not say the probe passed unless every acceptance condition in spec section 8.2 is evidenced.

- [ ] **Step 5: Commit and inspect the final diff**

```bash
git add docs/architecture-playbook/README.md
git commit -m "docs(playbook): report P1 course probe status"
git status --short
git log --oneline -6
```

Expected: clean working tree and a contiguous P1 commit series.
