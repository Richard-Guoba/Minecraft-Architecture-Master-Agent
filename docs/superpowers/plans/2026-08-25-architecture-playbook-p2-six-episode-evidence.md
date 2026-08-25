# Architecture Playbook P2 Six-Episode Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce six reconstructable, school-isolated evidence packs whose public notes, rule candidates, counterexamples, conflicts, and unknowns all trace back to private timestamped language-and-image evidence.

**Architecture:** Keep copyrighted media, complete ASR text, source frames, and draft EvidenceNotes under `.local/architecture-playbook/`. Commit only deterministic contracts, processing tools, episode identities, original short paraphrases, compact visual descriptions, candidate knowledge, and aggregate reports. Process each episode independently through `media -> transcript -> event frames -> evidence pack`; then compile the six accepted packs into public candidate knowledge without granting the playbook runtime authority.

**Tech Stack:** Node.js 20 ESM and `node:test`; Python 3 with the already private-installed `faster-whisper`, PyAV, and Pillow toolchain; Bilibili public metadata/playback responses; JSON/JSONL and Markdown artifacts.

**Spec:** `docs/superpowers/specs/2026-08-24-architecture-playbook-program-design.md`

## Global Constraints

- The only primary school is `heihui-jileniao`; P2 must contain no other author or school.
- The pilot set is exactly six BVIDs and 7,381 seconds: `BV1fNkgYBEyy`, `BV1HhEuzZEyZ`, `BV1WhkbYeE5k`, `BV1HTCaY6EDt`, `BV1WsZcYZEMQ`, and `BV1jbdUYCEjG`.
- Source media, full/near-full transcripts, source frames, private human review, and unreleased EvidenceNote packs remain under `.local/architecture-playbook/` and outside Git.
- ASR output remains `draft_transcript`; unresolved words, numbers, negations, boundaries, materials, and dimensions are never silently repaired.
- Event frames are selected from teaching transitions or comparisons, not fixed-interval sampling.
- A shape-related public candidate requires both timestamped language evidence and a visually reviewed frame reference.
- P2 creates only `observed` or `candidate` knowledge. It does not create `reviewed`, `executable`, or `validated` rules and does not alter the production generator.
- Every production-code behavior change follows red-green-refactor TDD. Each task ends with a focused verification and a commit.

---

### Task 1: Freeze the Six-Episode Pilot Set

**Files:**
- Create: `src/playbook/course/pilotEpisodeSet.js`
- Create: `test/playbookPilotEpisodeSet.test.js`
- Create: `docs/architecture-playbook/course/pilot-episodes.json`
- Modify: `src/playbook/course/index.js` if the barrel exists; otherwise do not create a barrel solely for this task.

**Interfaces:**
- Consumes: `validateCourseManifest(value)` from `src/playbook/contracts/courseManifest.js`.
- Produces: `buildPilotEpisodeSet(courseManifest, { createdAt }): Readonly<PilotEpisodeSet>` and `validatePilotEpisodeSet(value): Readonly<PilotEpisodeSet>`.
- `PilotEpisodeSet` contains only stable course identity, the six ordered episode identities, their roles, durations, fingerprints, and a total duration; it contains no media URLs or transcript text.

- [ ] **Step 1: Write the failing contract tests**

```js
test('pilot set selects the approved six episodes in curriculum order', () => {
  const pilot = buildPilotEpisodeSet(courseManifestFixture(), {
    createdAt: '2026-08-25T12:00:00.000Z'
  });
  assert.deepEqual(pilot.episodes.map((episode) => episode.bvid), [
    'BV1fNkgYBEyy', 'BV1HhEuzZEyZ', 'BV1WhkbYeE5k',
    'BV1HTCaY6EDt', 'BV1WsZcYZEMQ', 'BV1jbdUYCEjG'
  ]);
  assert.equal(pilot.total_duration_seconds, 7381);
});

test('pilot set rejects source identity or school drift', () => {
  const pilot = structuredClone(pilotEpisodeSetFixture());
  pilot.episodes[0].metadata_fingerprint_sha256 = '0'.repeat(64);
  assert.throws(() => validatePilotEpisodeSet(pilot), /PILOT_SOURCE_DRIFT/u);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/playbookPilotEpisodeSet.test.js`

Expected: FAIL because `pilotEpisodeSet.js` does not exist.

- [ ] **Step 3: Implement the strict pilot-set builder and validator**

Use an immutable internal table with the six BVIDs and roles. Validate exact fields, exact order, `school_id`, positive durations, SHA-256 fingerprints, total 7,381 seconds, and exact correspondence with the validated 50-episode manifest. Deep-freeze the returned clone.

- [ ] **Step 4: Verify GREEN and generate the public pilot index**

Run: `node --test test/playbookPilotEpisodeSet.test.js`

Then generate `pilot-episodes.json` from the committed course manifest with a fixed `created_at`; rerun the same command and require byte-identical output.

- [ ] **Step 5: Commit**

```bash
git add src/playbook/course/pilotEpisodeSet.js test/playbookPilotEpisodeSet.test.js docs/architecture-playbook/course/pilot-episodes.json
git commit -m "feat(playbook): freeze six-episode evidence pilot"
```

### Task 2: Enforce Evidence and Candidate-Knowledge Contracts

**Files:**
- Create: `src/playbook/contracts/evidenceNote.js`
- Create: `src/playbook/contracts/playbookRuleCandidate.js`
- Create: `src/playbook/contracts/ruleConflict.js`
- Modify: `src/playbook/contracts/index.js`
- Modify: `docs/architecture-playbook/rules/schemas/evidence-note.schema.json`
- Create: `docs/architecture-playbook/rules/schemas/playbook-rule-candidate.schema.json`
- Create: `docs/architecture-playbook/rules/schemas/rule-conflict.schema.json`
- Create: `test/playbookEvidenceContracts.test.js`

**Interfaces:**
- Produces: `validateEvidenceNote(value, context)`, `validatePlaybookRuleCandidate(value, context)`, and `validateRuleConflict(value, context)`.
- `context` is `{ pilotEpisodeSet, evidenceIds?, candidateRuleIds? }`; validators reject wrong schools, unknown BVIDs, mismatched fingerprints, dangling evidence IDs, and cross-school conflicts.
- Candidate maturity is limited to `observed | candidate`; `review_status` is limited to `draft | unresolved | needs-owner-review` during P2.

- [ ] **Step 1: Write failing tests for truthful evidence boundaries**

```js
test('reviewed visual shape claims require language and reviewed frame evidence', () => {
  const note = evidenceNoteFixture({
    statement_type: 'author_claim',
    design_layers: ['massing'],
    language_evidence: [{ start_ms: 82000, end_ms: 91000 }],
    visual_evidence: []
  });
  assert.throws(
    () => validateEvidenceNote(note, evidenceContext()),
    /EVIDENCE_VISUAL_REQUIRED/u
  );
});

test('candidate rule cannot claim executable maturity in P2', () => {
  const rule = ruleCandidateFixture({ maturity: 'executable' });
  assert.throws(
    () => validatePlaybookRuleCandidate(rule, evidenceContext()),
    /RULE_MATURITY_INVALID/u
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/playbookEvidenceContracts.test.js`

Expected: FAIL because the three validator modules do not exist.

- [ ] **Step 3: Implement minimal strict validators**

EvidenceNotes must add `design_layers`, `language_evidence`, and `visual_evidence`. Each language range must lie inside `time_range_ms`; each visual reference contains `frame_id`, `actual_ms`, `frame_index_sha256`, and `review_status: visually-reviewed`. Enforce `end > start`, nonempty original paraphrases, explicit `unknown` confidence, unique IDs, and no extra fields.

Rule candidates must contain source evidence IDs, applicability, prerequisites, exclusions, action, unknown-capable parameters, positive signs, failure modes, repairs, author reason, confidence, maturity, and review status. RuleConflict stores both IDs and resolution `conditional-difference | unresolved | superseded`, with `superseded` forbidden unless an explicit author-update EvidenceNote is referenced.

- [ ] **Step 4: Run tests and validate the JSON Schemas against the same fixtures**

Run: `node --test test/playbookEvidenceContracts.test.js`

Expected: PASS with cloned, deeply frozen validated documents and stable contract errors.

- [ ] **Step 5: Commit**

```bash
git add src/playbook/contracts docs/architecture-playbook/rules/schemas test/playbookEvidenceContracts.test.js
git commit -m "feat(playbook): validate evidence and rule candidates"
```

### Task 3: Add Safe, Episode-Scoped Media Acquisition

**Files:**
- Create: `src/playbook/storage/privatePlaybookPath.js`
- Create: `src/playbook/course/episodeMedia.js`
- Create: `src/runArchitecturePlaybookEvidence.js`
- Create: `test/playbookPrivatePath.test.js`
- Create: `test/architecturePlaybookEvidenceCli.test.js`
- Modify: `src/runArchitecturePlaybookCourse.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `resolvePrivatePlaybookPath(relativePath, { projectRoot, kind, createParent })` with realpath/symlink containment checks shared by both CLIs.
- Produces: `resolveEpisodePlayback({ episode, fetchImpl })` and `acquireEpisodeMedia({ episode, projectRoot, fetchImpl, replace })`.
- CLI: `npm run playbook:evidence -- media --bvid <BV> [--replace]` writes only `.local/architecture-playbook/sources/<BV>/source-360p.mp4` and `media-index.json`.

- [ ] **Step 1: Write failing path and media tests**

```js
test('media acquisition rejects a symlink escape before fetching bytes', async (t) => {
  const roots = await escapedPrivateRootFixture(t);
  await assert.rejects(
    acquireEpisodeMedia({
      episode: pilotEpisodeFixture(),
      projectRoot: roots.project,
      fetchImpl: unreachableFetch
    }),
    /PLAYBOOK_PRIVATE_PATH_ESCAPE/u
  );
});

test('media acquisition streams exact bytes and records their hash', async () => {
  const result = await acquireEpisodeMedia(mediaFixture());
  assert.equal(result.media_index.sha256, sha256(MEDIA_BYTES));
  assert.equal(result.media_index.bvid, 'BV1fNkgYBEyy');
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/playbookPrivatePath.test.js test/architecturePlaybookEvidenceCli.test.js`

Expected: FAIL because the storage module, media module, and CLI do not exist.

- [ ] **Step 3: Extract the existing private-path guard without behavior drift**

Move the lexical and realpath containment logic from `runArchitecturePlaybookCourse.js` into `privatePlaybookPath.js`; use it from both CLIs. Re-run `test/architecturePlaybookCourseCli.test.js` before implementing network behavior.

- [ ] **Step 4: Implement playback parsing and atomic media streaming**

Resolve the approved episode from `pilot-episodes.json`, request the direct-view and playurl responses, accept only the expected BVID/CID and an HTTPS 360p MP4 resource, stream to a unique temporary file, hash while writing, validate nonzero size, then rename atomically. Refuse different existing bytes unless `--replace` is explicit. Store response observations and hashes, never expiring playback URLs.

- [ ] **Step 5: Verify GREEN**

Run: `node --test test/playbookPrivatePath.test.js test/architecturePlaybookCourseCli.test.js test/architecturePlaybookEvidenceCli.test.js`

- [ ] **Step 6: Commit**

```bash
git add src/playbook/storage src/playbook/course/episodeMedia.js src/runArchitecturePlaybookCourse.js src/runArchitecturePlaybookEvidence.js test/playbookPrivatePath.test.js test/architecturePlaybookCourseCli.test.js test/architecturePlaybookEvidenceCli.test.js package.json
git commit -m "feat(playbook): acquire pilot media safely"
```

### Task 4: Generalize the Local ASR and Event-Frame Pipeline

**Files:**
- Create: `scripts/architecture-playbook/transcribe_episode.py`
- Create: `scripts/architecture-playbook/extract_event_frames.py`
- Create: `src/playbook/course/localEvidenceProcessor.js`
- Create: `test/playbookLocalEvidenceProcessor.test.js`
- Modify: `src/runArchitecturePlaybookEvidence.js`

**Interfaces:**
- Produces: `buildTranscriptionCommand({ bvid, projectRoot }): { command, args, env }` and `buildFrameExtractionCommand({ bvid, projectRoot }): { command, args, env }`.
- CLI: `playbook:evidence transcribe --bvid <BV>` writes a private `draft-transcript.json` with source hash, exact processor config, word timestamps, and stable segment-index hash.
- CLI: `playbook:evidence frames --bvid <BV>` consumes a private reviewed `event-candidates.json` and writes an event frame index plus contact sheet.

- [ ] **Step 1: Read `test-driven-development/writing-good-tests.md`, then write failing command and boundary tests**

```js
test('transcription command pins the private model and processor configuration', () => {
  const command = buildTranscriptionCommand({
    bvid: 'BV1fNkgYBEyy', projectRoot: ROOT
  });
  assert.match(command.args.join(' '), /--model small/u);
  assert.match(command.args.join(' '), /--compute-type int8/u);
});

test('frame extraction refuses unreviewed or fixed-interval candidates', async () => {
  await assert.rejects(
    runFrameExtraction(unreviewedCandidateFixture()),
    /EVENT_CANDIDATES_NOT_REVIEWED/u
  );
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/playbookLocalEvidenceProcessor.test.js`

Expected: FAIL because `localEvidenceProcessor.js` does not exist.

- [ ] **Step 3: Implement the generic ASR adapter**

Parameterize the proven P1 processor by BVID. It must read the corresponding `media-index.json`, verify the source hash before transcription, use `faster-whisper small`, Chinese, CPU int8, beam size 5, word timestamps, VAD, and condition-on-previous-text, and refuse silent overwrite. It must not print transcript text to stdout.

- [ ] **Step 4: Implement reviewed event-candidate extraction**

`event-candidates.json` contains `candidate_id`, a timestamp anchored to transcript segment IDs, a short event label, a selection reason (`topic-transition | comparison | construction-step | counterexample | conclusion`), and `review_status: reviewed`. The frame extractor seeks only those reviewed events with PyAV, writes hashes and dimensions, and produces a contact sheet for visual review.

- [ ] **Step 5: Verify GREEN without requiring a model download**

Run: `node --test test/playbookLocalEvidenceProcessor.test.js`

The automated test uses small generated fixture media and a fixture transcript; the real ASR invocation remains an explicit integration step.

- [ ] **Step 6: Commit**

```bash
git add scripts/architecture-playbook src/playbook/course/localEvidenceProcessor.js src/runArchitecturePlaybookEvidence.js test/playbookLocalEvidenceProcessor.test.js
git commit -m "feat(playbook): generalize local evidence processing"
```

### Task 5: Build Deterministic Per-Episode Evidence Packs

**Files:**
- Create: `src/playbook/knowledge/evidencePack.js`
- Create: `test/playbookEvidencePack.test.js`
- Modify: `src/runArchitecturePlaybookEvidence.js`

**Interfaces:**
- Produces: `buildEvidencePack({ episode, mediaIndex, transcript, frameIndex, terminologyReview, notes }): Readonly<EvidencePack>`.
- Produces: `summarizeEvidencePack(pack)` containing hashes, counts, review status, and coverage only—never complete transcript text or local absolute paths.
- CLI: `playbook:evidence pack --bvid <BV>` writes `.local/architecture-playbook/evidence/<BV>/evidence-index.json` atomically.

- [ ] **Step 1: Write failing determinism, traceability, and leakage tests**

```js
test('evidence pack is byte-stable and every note traces to current inputs', () => {
  const first = buildEvidencePack(evidencePackFixture());
  const second = buildEvidencePack(evidencePackFixture());
  assert.equal(first.index_sha256, second.index_sha256);
  assert.equal(first.notes[0].source_metadata_fingerprint_sha256,
    first.inputs.metadata_fingerprint_sha256);
});

test('public summary excludes transcript text and absolute private paths', () => {
  const summary = JSON.stringify(summarizeEvidencePack(buildEvidencePack(evidencePackFixture())));
  assert.doesNotMatch(summary, /segments|\/home\/|draft-transcript/u);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/playbookEvidencePack.test.js`

Expected: FAIL because `evidencePack.js` does not exist.

- [ ] **Step 3: Implement pack validation and canonical hashing**

Verify the media hash chain, transcript segment hash, event-frame hash, terminology-review hash, episode fingerprint, note ranges, note evidence references, and unique IDs. Canonically hash inputs, processor policy, and validated notes. `accepted_for_public_candidates` is true only when every shape claim has both evidence modes and every unresolved term remains explicitly attached.

- [ ] **Step 4: Verify GREEN**

Run: `node --test test/playbookEvidencePack.test.js test/playbookEvidenceContracts.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/playbook/knowledge/evidencePack.js src/runArchitecturePlaybookEvidence.js test/playbookEvidencePack.test.js
git commit -m "feat(playbook): compile reconstructable evidence packs"
```

### Task 6: Process and Review the Six Episodes

**Files:**
- Private create/modify: `.local/architecture-playbook/sources/<BV>/...`
- Private create/modify: `.local/architecture-playbook/transcripts/<BV>/...`
- Private create/modify: `.local/architecture-playbook/frames/<BV>/...`
- Private create/modify: `.local/architecture-playbook/evidence/<BV>/...`
- Create: `docs/architecture-playbook/course/notes/heihui-jileniao/<BV>.md` for each of the six BVIDs.
- Create: `docs/architecture-playbook/rules/schools/heihui-jileniao/candidates-v0.1.jsonl`
- Create: `docs/architecture-playbook/rules/schools/heihui-jileniao/conflicts-v0.1.json`
- Create: `docs/architecture-playbook/rules/schools/heihui-jileniao/unknowns-v0.1.json`

**Interfaces:**
- Consumes the four CLIs from Tasks 3–5 and the validators from Task 2.
- Produces six private evidence packs and public, compact knowledge artifacts validated against their pack summaries.

- [ ] **Step 1: Acquire the five missing media files**

Run `npm run playbook:evidence -- media --bvid <BV>` separately for the five BVIDs not already cached. After each download, verify BVID, CID, byte size, media SHA-256, observed duration, and private ignore status before proceeding to the next.

- [ ] **Step 2: Transcribe one short and one style-specific episode first**

Process `BV1fNkgYBEyy` and `BV1WsZcYZEMQ`. Confirm language probability, duration tolerance, timestamp monotonicity, nonempty segment count, and source-hash equality. If either fails, stop the batch and record the stable reason rather than processing the remaining three new transcripts.

- [ ] **Step 3: Transcribe the remaining three new episodes**

Process `BV1WhkbYeE5k`, `BV1HTCaY6EDt`, and `BV1jbdUYCEjG`. Reuse the already verified P1 transcript for `BV1HhEuzZEyZ` only after its media and processor hashes pass the current validator.

- [ ] **Step 4: Create and review teaching-event candidates per episode**

Select candidates from topic transitions, comparisons, construction steps, explicit counterexamples, and conclusions. Each candidate cites transcript segment IDs and is checked for negations, dimensions, material/block names, and lesson-specific terms. Mark doubtful candidates `unresolved`; do not extract them as supporting visual evidence.

- [ ] **Step 5: Extract contact sheets and visually review every retained frame**

Record whether the frame actually shows the claimed massing, structure, roof, facade, comparison, or failure. A talking-head/menu/loading frame is rejected. Keep the rejection reason in the private frame review so reruns do not reselect it.

- [ ] **Step 6: Draft EvidenceNotes and public episode notes**

For each accepted segment, write a short original paraphrase and a literal visible-demo description. Separate `fact`, `author_claim`, and project `inference`. Public Markdown contains only short paraphrases, timestamp ranges, evidence IDs, review status, coverage gaps, and unknowns—not contiguous transcript excerpts.

- [ ] **Step 7: Compile candidate rules, counterexamples, conflicts, and unknowns**

Create only candidates supported by validated EvidenceNotes. Counterexamples use candidate records whose `intent` is `failure-boundary` and cite the visible failed/contrasted state. If two lessons differ, preserve both candidates and create a conflict record; do not average their conditions. Unknowns include the exact episode/time range, category, impact, and what owner review would resolve.

- [ ] **Step 8: Run the six-pack acceptance audit**

Require exactly six pack summaries, no duplicate evidence/rule IDs, no non-primary school, no dangling references, no source text leakage, and language-plus-image support for every shape claim. Packs may pass with unresolved items, but unresolved evidence cannot produce a confident candidate action.

- [ ] **Step 9: Commit only public artifacts**

```bash
git add docs/architecture-playbook/course/notes/heihui-jileniao docs/architecture-playbook/rules/schools/heihui-jileniao
git commit -m "docs(playbook): distill six-episode evidence candidates"
```

Before committing, `git ls-files .local/architecture-playbook` must print nothing and every private artifact must match `.gitignore`.

### Task 7: Publish the P2 Gate Report

**Files:**
- Create: `docs/architecture-playbook/reports/p2-six-episode-evidence.md`
- Modify: `docs/architecture-playbook/README.md`
- Create: `test/playbookP2EvidenceAudit.test.js`

**Interfaces:**
- Produces an automated public audit over the six notes, candidate JSONL, conflicts, unknowns, private pack summaries, and pilot set.
- The report opens P3 only when every P2 acceptance condition is evidenced; otherwise it lists episode-specific blockers and leaves P3 closed.

- [ ] **Step 1: Write the failing end-to-end P2 audit test**

```js
test('P2 public knowledge has six traceable school-isolated evidence packs', () => {
  const audit = auditP2Evidence({ projectRoot: ROOT });
  assert.equal(audit.episode_count, 6);
  assert.equal(audit.cross_school_count, 0);
  assert.equal(audit.dangling_reference_count, 0);
  assert.equal(audit.shape_claims_without_dual_evidence, 0);
  assert.equal(audit.transcript_leak_count, 0);
  assert.equal(audit.gate.status, 'passed');
});
```

- [ ] **Step 2: Run the audit and verify RED**

Run: `node --test test/playbookP2EvidenceAudit.test.js`

Expected: FAIL until all six packs and public knowledge artifacts satisfy the gate.

- [ ] **Step 3: Implement the minimal audit and write the factual report**

Report per-episode media/transcript/frame/note status, counts of facts/author claims/inferences/candidates/counterexamples/conflicts/unknowns, all unresolved high-impact terms, and the exact P3 decision. Never claim architectural mastery or visual superiority from P2.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
node --test test/playbook*.test.js test/architecturePlaybookCourseCli.test.js test/architecturePlaybookEvidenceCli.test.js
npm test
git diff --check
git ls-files .local/architecture-playbook
```

Expected: all tests pass; `git diff --check` is silent; `git ls-files` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture-playbook/README.md docs/architecture-playbook/reports/p2-six-episode-evidence.md test/playbookP2EvidenceAudit.test.js src/playbook
git commit -m "feat(playbook): complete six-episode evidence gate"
```

## Review Checkpoints

- Checkpoint A, after Task 2: the public contracts prevent invented maturity and cross-school leakage.
- Checkpoint B, after Task 5: one episode can be reconstructed without committing source material.
- Checkpoint C, after the first two new transcripts in Task 6: decide whether the ASR quality and processing time justify completing the remaining three.
- Checkpoint D, after Task 7: P3 opens only from an automated audit plus explicit unresolved-item report.

## Definition of Done

- Six exact pilot episodes have reconstructable private evidence packs.
- Six public episode notes contain only original paraphrases and evidence references.
- Every public candidate or counterexample traces to validated EvidenceNotes from `heihui-jileniao`.
- Every shape claim has timestamped language plus a visually reviewed frame.
- Conflicts and unknowns remain explicit; no missing detail is supplied from general LLM knowledge.
- No private media, transcript, frame set, or unreleased evidence pack is tracked by Git.
- The production generator is byte-for-byte behaviorally unchanged when playbook processing is not invoked.
- The P2 report states either an evidenced pass opening P3 or an exact per-episode blocker.
