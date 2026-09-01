# Architecture Playbook P7 Knowledge Expansion Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all 50 manifest episodes addressable through restartable chapter work while keeping portable, relative-coordinate datapack generation as the unchanged product workflow.

**Architecture:** Add deterministic chapter assignment and a private restartable progress ledger beside the existing course/evidence contracts. Generalize the six-episode evidence CLI to resolve any approved manifest episode, then expose a read-only chapter status command. This plan builds the P7 operating foundation only; each chapter's media review, notes, rule synthesis, and runtime promotion is a separate evidence checkpoint.

**Tech Stack:** Node.js 20+ ESM, JSON contracts, built-in `node:test` through the hard-capped `npm test -- ...` entry point.

**Spec:** `docs/superpowers/specs/2026-09-01-architecture-playbook-mini-program-knowledge-expansion-design.md`

## Global Constraints

- The primary school is exactly `heihui-jileniao`; no other creator or generic knowledge may enter its rules.
- Raw media, transcripts, frames, provider output, and working evidence remain under `.local/architecture-playbook/` and untracked.
- Generation without explicit installation options must not inspect or mutate a Minecraft world.
- The generated `architect_datapack/` retains relative-coordinate `architect:clear`, `architect:build`, and `architect:run` functions.
- Formal P6 capture is optional QA and does not block P7 chapter work.
- Node tests run only through the `npm test --` script with the mandatory hard-memory backend; never use direct `node --test` or soft fallback.
- Run the narrowest test first; do not use the full suite to diagnose failures.
- Existing six-episode artifacts and `playbook=off` behavior remain byte-compatible unless a separately approved migration says otherwise.

---

### Task 1: Freeze the Eight-Chapter Assignment

**Files:**
- Create: `src/playbook/course/chapterPlan.js`
- Create: `docs/architecture-playbook/course/chapter-plan-v1.json`
- Create: `test/playbookChapterPlan.test.js`

**Interfaces:**
- Consumes: `validateCourseManifest(value)` from `src/playbook/contracts/courseManifest.js`.
- Produces: `buildChapterPlan(courseManifest, { createdAt })`, `validateChapterPlan(value, courseManifest)`, and `getChapterEpisodeIdentity({ chapterPlan, courseManifest, bvid })`.

- [ ] **Step 1: Write failing chapter assignment tests**

```js
test('chapter plan assigns every manifest episode exactly once', () => {
  const plan = buildChapterPlan(courseManifest, {
    createdAt: '2026-09-01T00:00:00.000Z'
  });
  assert.deepEqual(plan.chapters.map(row => row.episodes.map(episode => episode.course_order)), [
    [1, 2, 3, 4, 5, 6, 7],
    [8, 9, 10, 11, 12],
    [13, 14, 15],
    [16, 17, 18, 19, 20],
    [21, 22, 23, 24, 25, 26, 27, 28, 29],
    [30, 31, 32, 33, 34, 35, 36],
    [37, 38, 39, 40, 41, 42],
    [43, 44, 45, 46, 47, 48, 49, 50]
  ]);
  assert.equal(new Set(plan.chapters.flatMap(row => row.episodes.map(episode => episode.bvid))).size, 50);
});

test('chapter validation rejects omission, duplication, reordering, and source drift', () => {
  const corruptions = [];
  const omitted = structuredClone(validPlan);
  omitted.chapters[0].episodes.pop();
  corruptions.push(omitted);
  const duplicated = structuredClone(validPlan);
  duplicated.chapters[1].episodes[0] = structuredClone(duplicated.chapters[0].episodes[0]);
  corruptions.push(duplicated);
  const reordered = structuredClone(validPlan);
  [reordered.chapters[0].episodes[0], reordered.chapters[0].episodes[1]] =
    [reordered.chapters[0].episodes[1], reordered.chapters[0].episodes[0]];
  corruptions.push(reordered);
  const drifted = structuredClone(validPlan);
  drifted.chapters[0].episodes[0].metadata_fingerprint_sha256 = '0'.repeat(64);
  corruptions.push(drifted);
  for (const corrupted of corruptions) {
    assert.throws(() => validateChapterPlan(corrupted, courseManifest), {
      code: 'PLAYBOOK_CHAPTER_PLAN_INVALID'
    });
  }
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- test/playbookChapterPlan.test.js --test-reporter=spec`

Expected: FAIL because `chapterPlan.js` does not exist.

- [ ] **Step 3: Implement the exact chapter contract**

Use these immutable chapter IDs and order ranges:

```js
const CHAPTERS = Object.freeze([
  ['foundations-tools-blocks-modularity-color', 1, 7],
  ['complete-structure', 8, 12],
  ['complete-roofs', 13, 15],
  ['complete-walls-facades', 16, 20],
  ['landscaping-terrain', 21, 29],
  ['interiors', 30, 36],
  ['advanced-architecture', 37, 42],
  ['style-specialist-cases', 43, 50]
]);
```

The checked-in plan must bind `source_manifest_id`, `source_snapshot_sha256`, each episode's order/BVID/CID/duration/fingerprint, exact counts, and exact total duration. Validators reject unknown fields and freeze returned values.

- [ ] **Step 4: Generate the canonical checked-in plan and rerun tests**

Run: `npm test -- test/playbookChapterPlan.test.js test/playbookCourseManifest.test.js test/playbookPilotEpisodeSet.test.js --test-reporter=spec`

Expected: PASS with 50 unique assigned episodes and unchanged pilot tests.

- [ ] **Step 5: Commit**

```bash
git add src/playbook/course/chapterPlan.js docs/architecture-playbook/course/chapter-plan-v1.json test/playbookChapterPlan.test.js
git commit -m "feat: freeze P7 course chapter plan"
```

---

### Task 2: Add a Private Restartable Chapter Ledger

**Files:**
- Create: `src/playbook/course/chapterLedger.js`
- Create: `test/playbookChapterLedger.test.js`

**Interfaces:**
- Consumes: a validated chapter plan and existing private-path helpers in `src/playbook/storage/privatePlaybookPath.js`.
- Produces: `createChapterLedger({ chapterPlan })`, `readChapterLedger({ projectRoot })`, and `advanceEpisodeStage({ projectRoot, bvid, expectedStage, nextStage, evidence })`.

- [ ] **Step 1: Write failing ledger state-machine tests**

```js
const STAGES = [
  'pending', 'media-verified', 'asr-complete', 'events-indexed',
  'visual-reviewed', 'evidence-packed', 'notes-reviewed', 'rules-reviewed'
];

test('ledger advances one episode by compare-and-swap and survives reopen', async t => {
  const first = await advanceEpisodeStage({
    projectRoot: t.root,
    bvid: firstBvid,
    expectedStage: 'pending',
    nextStage: 'media-verified',
    evidence: { media_sha256: HASH, byte_size: 1234 }
  });
  assert.equal(first.episodes[firstBvid].stage, 'media-verified');
  assert.deepEqual(await readChapterLedger({ projectRoot: t.root }), first);
});

test('ledger rejects skipped stages, stale writers, unknown episodes, and paths outside private storage', async t => {
  await assert.rejects(() => advanceEpisodeStage({
    projectRoot: t.root, bvid: firstBvid,
    expectedStage: 'pending', nextStage: 'asr-complete', evidence: {}
  }), { code: 'PLAYBOOK_CHAPTER_STAGE_INVALID' });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- test/playbookChapterLedger.test.js --test-reporter=spec`

Expected: FAIL because the ledger module does not exist.

- [ ] **Step 3: Implement canonical private ledger publication**

Store the ledger at `.local/architecture-playbook/work/p7/chapter-ledger.json`. Bind the chapter-plan SHA-256, all 50 BVIDs, current stage, evidence hashes/counts, unresolved count, and last completed action. Write a sibling exclusive stage, sync it, compare the current ledger hash to the caller's expected hash, and rename without exposing source paths in public errors. Never write media or transcript text into the ledger.

- [ ] **Step 4: Cover interrupted and conflicting publication**

Add tests proving a pre-rename failure leaves the old ledger byte-identical, a stale expected hash fails closed, same-byte replay returns `unchanged`, and a symlinked private ancestor is rejected.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- test/playbookChapterLedger.test.js test/playbookPrivatePath.test.js --test-reporter=spec`

Expected: PASS.

```bash
git add src/playbook/course/chapterLedger.js test/playbookChapterLedger.test.js
git commit -m "feat: add restartable P7 chapter ledger"
```

---

### Task 3: Generalize Episode Resolution Beyond the Pilot Six

**Files:**
- Modify: `src/runArchitecturePlaybookEvidence.js`
- Modify: `src/playbook/course/episodeMedia.js`
- Create: `test/playbookP7EvidenceCli.test.js`
- Modify: `test/architecturePlaybookEvidenceCli.test.js`

**Interfaces:**
- Consumes: `getChapterEpisodeIdentity({ chapterPlan, courseManifest, bvid })` from Task 1.
- Produces: `parseArchitecturePlaybookEvidenceArgs(argv, { projectRoot, courseManifest, chapterPlan })` for all 50 approved episodes while retaining the same `media|transcribe|frames|pack` commands.

- [ ] **Step 1: Write failing non-pilot resolution tests**

```js
test('evidence CLI admits a manifest-bound non-pilot episode', () => {
  const parsed = parseArchitecturePlaybookEvidenceArgs([
    'media', '--bvid', 'BV1iVLbzcEfG'
  ], { projectRoot, courseManifest, chapterPlan });
  assert.equal(parsed.episode.course_order, 5);
  assert.equal(parsed.episode.bvid, 'BV1iVLbzcEfG');
});

test('evidence CLI rejects unknown BVID and manifest fingerprint drift', () => {
  assert.throws(() => parseArchitecturePlaybookEvidenceArgs([
    'media', '--bvid', 'BV1aaaaaaaaaa'
  ], { projectRoot, courseManifest, chapterPlan }), {
    code: 'PLAYBOOK_CHAPTER_EPISODE_INVALID'
  });
  const drifted = structuredClone(courseManifest);
  drifted.episodes[4].metadata_fingerprint_sha256 = '0'.repeat(64);
  assert.throws(() => parseArchitecturePlaybookEvidenceArgs([
    'media', '--bvid', 'BV1iVLbzcEfG'
  ], { projectRoot, courseManifest: drifted, chapterPlan }), {
    code: 'PLAYBOOK_CHAPTER_SOURCE_DRIFT'
  });
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `npm test -- test/playbookP7EvidenceCli.test.js --test-reporter=spec`

Expected: FAIL because the current CLI calls `getPilotEpisodeIdentity`.

- [ ] **Step 3: Replace pilot-only resolution with chapter authority**

Load the checked-in course manifest and chapter plan from fixed repository paths, validate both, and resolve one exact episode identity. Preserve the media acquisition contract fields `bvid`, `cid`, `duration_seconds`, and `metadata_fingerprint_sha256`; add `course_order` and `chapter_id` only to orchestration metadata, not to network requests.

- [ ] **Step 4: Preserve the six-episode golden behavior**

Update old parser tests to assert that all six prior BVIDs resolve to the same identity bytes used by the pilot flow. Add a negative test proving a modified checked-in chapter plan cannot silently redirect an episode.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- test/playbookP7EvidenceCli.test.js test/architecturePlaybookEvidenceCli.test.js test/playbookPilotEpisodeSet.test.js --test-reporter=spec`

Expected: PASS.

```bash
git add src/runArchitecturePlaybookEvidence.js src/playbook/course/episodeMedia.js test/playbookP7EvidenceCli.test.js test/architecturePlaybookEvidenceCli.test.js
git commit -m "feat: admit all P7 manifest episodes"
```

---

### Task 4: Add Chapter Status and Next-Action CLI

**Files:**
- Create: `src/runArchitecturePlaybookChapter.js`
- Modify: `package.json`
- Create: `test/playbookChapterCli.test.js`

**Interfaces:**
- Consumes: Task 1 chapter plan and Task 2 ledger.
- Produces: `npm run playbook:chapter -- status [--chapter CHAPTER_ID]` and `npm run playbook:chapter -- next --chapter CHAPTER_ID`.

- [ ] **Step 1: Write failing CLI tests**

```js
test('status reports exact counts without private paths or transcript text', async t => {
  const result = await runChapterCli(['status', '--chapter', 'foundations-tools-blocks-modularity-color'], deps(t));
  assert.deepEqual(result, {
    chapter_id: 'foundations-tools-blocks-modularity-color',
    episode_count: 7,
    completed_count: 0,
    remaining_count: 7,
    next_bvid: 'BV1guoPYkExk',
    next_stage: 'media-verified'
  });
  assert.doesNotMatch(JSON.stringify(result), /\.local|transcript|https?:/u);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- test/playbookChapterCli.test.js --test-reporter=spec`

Expected: FAIL because the CLI does not exist.

- [ ] **Step 3: Implement strict parsing and deterministic summaries**

Support only `status` and `next`, with an optional single `--chapter` for status and required single `--chapter` for next. `next` returns one exact BVID and one exact command, for example:

```text
npm run playbook:evidence -- media --bvid BV1guoPYkExk
```

The CLI reads state only. Evidence commands advance the ledger only after their existing output has been reopened and hash-validated.

- [ ] **Step 4: Add package script, run tests, and commit**

Add:

```json
"playbook:chapter": "node src/runArchitecturePlaybookChapter.js"
```

Run: `npm test -- test/playbookChapterCli.test.js test/playbookChapterLedger.test.js --test-reporter=spec`

Expected: PASS.

```bash
git add src/runArchitecturePlaybookChapter.js package.json test/playbookChapterCli.test.js
git commit -m "feat: expose P7 chapter progress"
```

---

### Task 5: Document the Simplified Product and P7 Gate

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture-playbook/README.md`
- Modify: `docs/architecture-playbook/reports/p6-fixed-view-blind-comparison.md`
- Create: `docs/architecture-playbook/reports/p7-knowledge-expansion-foundation.md`
- Test: `test/playbookP7Documentation.test.js`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: one consistent public operating contract: generate portable datapack, choose placement in game, process chapters without formal P6 capture.

- [ ] **Step 1: Write a failing documentation contract test**

```js
test('public docs describe player-chosen placement and nonblocking P6 consistently', async () => {
  const docs = [
    'README.md',
    'docs/architecture-playbook/README.md',
    'docs/architecture-playbook/reports/p6-fixed-view-blind-comparison.md',
    'docs/architecture-playbook/reports/p7-knowledge-expansion-foundation.md'
  ];
  for (const file of docs) {
    const text = await fs.readFile(file, 'utf8');
    assert.match(text, /\/function architect:run/u);
    assert.match(text, /P6.*optional|optional.*P6/isu);
    assert.doesNotMatch(text, /P7 is not allowed|P6.*prerequisite before.*P7/isu);
  }
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- test/playbookP7Documentation.test.js --test-reporter=spec`

Expected: FAIL because current docs still state that P7 is blocked.

- [ ] **Step 3: Update only the product/roadmap boundary**

Document that the user copies the generated datapack, stands at the chosen origin, and runs `/reload` then `/function architect:run`. Preserve P6's evidence hashes and implementation history, label formal capture optional, and replace its report's `P7 is not allowed` statement with the lightweight chapter gate. Do not claim that P6 comparison completed.

- [ ] **Step 4: Publish the foundation report**

Record the exact chapter-plan hash, ledger schema, commands, tests, remaining 44 count, first chapter ID, limitations, and next exact evidence command. Do not include private paths, URLs from media acquisition, transcripts, or frames.

- [ ] **Step 5: Run focused checks and commit**

Run: `npm test -- test/playbookP7Documentation.test.js test/playbookChapterPlan.test.js test/playbookChapterCli.test.js --test-reporter=spec`

Run: `npm run playbook:manual -- check`

Expected: tests PASS and `managed_artifact_drift_count=0`.

```bash
git add README.md docs/architecture-playbook/README.md docs/architecture-playbook/reports/p6-fixed-view-blind-comparison.md docs/architecture-playbook/reports/p7-knowledge-expansion-foundation.md test/playbookP7Documentation.test.js
git commit -m "docs: open lightweight P7 chapter workflow"
```

---

### Task 6: Verify the Foundation and Produce the First Operational Checkpoint

**Files:**
- Modify only if evidence requires correction: files from Tasks 1-5.
- Generated/private only: `.local/architecture-playbook/work/p7/chapter-ledger.json`.

**Interfaces:**
- Consumes: the completed P7 foundation.
- Produces: a clean branch ready to process the first chapter's seven episodes one at a time.

- [ ] **Step 1: Initialize and inspect the private ledger**

Run: `npm run playbook:chapter -- status --chapter foundations-tools-blocks-modularity-color`

Expected: 7 episodes, 0 completed, first BVID `BV1guoPYkExk`, and no private path in output.

- [ ] **Step 2: Verify the unchanged portable datapack workflow**

Run:

```bash
npm start -- --mode mock --mc-version 1.21.9 --seed 424242 --out /tmp/p7-portable-smoke "Build a compact medieval residence"
```

Expected: successful ignored/disposable output with `architect_datapack/data/architect/function/{clear,build,run}.mcfunction`; no world access.

- [ ] **Step 3: Verify relative commands**

Inspect the generated functions and assert every build/clear coordinate begins with `~`, `run.mcfunction` calls clear before build, and no absolute world path occurs in the datapack tree.

- [ ] **Step 4: Run complete supported verification**

Run:

```bash
npm test -- --test-reporter=dot
npm run playbook:manual -- check
git diff --check
git status --short
git ls-files 'out/**' '.local/**'
```

Expected: exit 0; no OOM; drift 0; clean status; no tracked generated/private artifacts.

- [ ] **Step 5: Request independent reviews**

Request one specification-compliance review and a separate code-quality/security review. Resolve all Critical and Important findings with fresh TDD fix rounds, rerun scoped tests, then rerun Step 4.

- [ ] **Step 6: Verify the reviewed checkpoint is clean**

Each review fix round must commit its own exact production and test files with message `fix: close P7 foundation review findings`. If no correction is required, create no commit.

Run: `git status --short`

Expected: no output.
