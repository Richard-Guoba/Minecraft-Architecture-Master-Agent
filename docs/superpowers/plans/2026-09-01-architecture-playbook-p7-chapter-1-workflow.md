# Architecture Playbook P7 Chapter 1 Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse the six-episode evidence pipeline for every manifest-approved episode, advance the restartable ledger only from reopened hash-valid artifacts, and process `BV1guoPYkExk` sequentially to the first genuine visual-review boundary.

**Architecture:** Keep the checked-in chapter plan as the sole source of episode identity and pass that validated identity through the existing media, ASR, frame, and evidence-pack adapters. Add one episode-scoped artifact verifier that reopens canonical private artifacts, recomputes their hashes/counts, and performs the adjacent compare-and-swap ledger transition. Machine-producing evidence commands may invoke that verifier after successful output; reviewed event selection, visual approval, notes approval, and rule approval remain explicit actions and are never inferred.

**Tech Stack:** Node.js 20+ ESM, built-in `node:test` through the hard-capped `npm test -- ...` runner, Python 3.12 with the existing private `faster-whisper`, PyAV, and Pillow toolchain, JSON/JSONL, and Markdown.

**Spec:** `docs/superpowers/specs/2026-09-01-architecture-playbook-mini-program-knowledge-expansion-design.md`

## Global Constraints

- The primary school is exactly `heihui-jileniao`; no other creator or generic knowledge enters Chapter 1 artifacts.
- Raw media, transcripts, frames, contact sheets, and working evidence remain under `.local/architecture-playbook/` and untracked.
- The six-episode P2 corpus and `playbook=off` behavior remain compatible.
- Generation without explicit installation options does not inspect or mutate a Minecraft world.
- Generated `architect:clear`, `architect:build`, and `architect:run` functions retain relative coordinates.
- A stage transition occurs only after the exact canonical artifact has been reopened and its bytes, identity, hash lineage, and count validated.
- `event-candidates.json` must already carry explicit reviewed selection; extracted frames start `pending`; no command changes them to `visually-reviewed` automatically.
- Node tests run only as `npm test -- <narrow files> --test-reporter=spec`; direct `node --test` and soft-memory fallback are forbidden.
- Media, ASR, and frame work runs one episode at a time with concurrency one.

---

### Task 1: Generalize the Proven Episode Adapters Without Changing the Pilot Six

**Files:**
- Modify: `src/playbook/course/episodeMedia.js`
- Modify: `src/playbook/course/localEvidenceProcessor.js`
- Modify: `src/playbook/contracts/evidenceNote.js`
- Modify: `src/playbook/knowledge/evidencePack.js`
- Modify: `src/runArchitecturePlaybookEvidence.js`
- Modify: `test/architecturePlaybookEvidenceCli.test.js`
- Modify: `test/playbookLocalEvidenceProcessor.test.js`
- Modify: `test/playbookEvidencePack.test.js`

**Interfaces:**
- Consumes: the frozen `episode` returned by `getChapterEpisodeIdentity({ chapterPlan, courseManifest, bvid })`.
- Produces: the existing `acquireEpisodeMedia`, `runTranscription`, `runFrameExtraction`, and `compileLocalEvidencePack` behavior for a supplied approved episode.
- Preserves: pilot callers that pass a six-episode identity and `validateEvidenceNote(..., { pilotEpisodeSet })`.

- [ ] **Step 1: Write failing non-pilot adapter tests**

Add tests using the literal Chapter 1 identity:

```js
const CHAPTER_EPISODE = Object.freeze({
  chapter_id: 'foundations-tools-blocks-modularity-color',
  course_order: 1,
  bvid: 'BV1guoPYkExk',
  cid: 29440478157,
  duration_seconds: 205,
  metadata_fingerprint_sha256:
    'f6e8fbeae57aacbf478dff3484ebdd163deec9bc5fcf0c7dddbec9ec45d2600b'
});
```

Prove media acquisition accepts that exact supplied identity, ASR/frame command construction accepts it without consulting the pilot table, and an EvidencePack can validate one note against `{ approvedEpisodes: [CHAPTER_EPISODE] }`. The production mutations caught are reintroducing `getPilotEpisodeIdentity()` in any processing adapter or accepting a mismatched fingerprint.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
npm test -- test/architecturePlaybookEvidenceCli.test.js test/playbookLocalEvidenceProcessor.test.js test/playbookEvidencePack.test.js --test-reporter=spec
```

Expected: FAIL with `PLAYBOOK_PILOT_BVID_INVALID` for `BV1guoPYkExk`.

- [ ] **Step 3: Pass the manifest-bound identity through existing adapters**

Remove pilot lookup from adapter internals when an `episode` is supplied. Validate exact `bvid`, `cid`, positive duration, course order, lowercase SHA-256 fingerprint, and optional fixed Chapter 1 ID before filesystem or network work. Keep the pilot fallback only for existing direct six-episode API calls.

Generalize evidence validation with this additive context:

```js
validateEvidenceNote(note, {
  approvedEpisodes: [episode]
});
```

`pilotEpisodeSet` remains accepted and validated for P2/P3 callers. `compileLocalEvidencePack({ bvid, episode, projectRoot })` uses the supplied episode and does not require the episode to appear in `pilot-episodes.json`.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the same three test files. Expected: PASS, including all legacy pilot cases and the new Chapter 1 fixtures.

- [ ] **Step 5: Commit**

```bash
git add src/playbook/course/episodeMedia.js src/playbook/course/localEvidenceProcessor.js src/playbook/contracts/evidenceNote.js src/playbook/knowledge/evidencePack.js src/runArchitecturePlaybookEvidence.js test/architecturePlaybookEvidenceCli.test.js test/playbookLocalEvidenceProcessor.test.js test/playbookEvidencePack.test.js
git commit -m "feat: generalize P7 episode evidence adapters"
```

---

### Task 2: Verify Canonical Artifacts Before Every Ledger Transition

**Files:**
- Create: `src/playbook/course/chapterArtifactVerifier.js`
- Modify: `src/runArchitecturePlaybookChapter.js`
- Modify: `src/runArchitecturePlaybookEvidence.js`
- Create: `test/playbookChapterArtifactVerifier.test.js`
- Modify: `test/playbookChapterCli.test.js`

**Interfaces:**
- Produces: `verifyAndAdvanceEpisode({ projectRoot, episode, expectedCurrentStage })`.
- Produces CLI: `npm run playbook:chapter -- advance --bvid <BV>` for an explicitly prepared artifact.
- Machine commands `media`, `transcribe`, and `pack` call the same verifier after writing, while `frames` stops before visual approval.

- [ ] **Step 1: Write failing reopen-and-hash tests**

Use a real temporary project root and real canonical files. Assert these literal transitions:

```js
pending -> media-verified
media-verified -> asr-complete
asr-complete -> events-indexed
events-indexed -> visual-reviewed
visual-reviewed -> evidence-packed
```

The verifier must derive, rather than accept from CLI input:

```js
{ media_sha256, byte_size }
{ segment_index_sha256, segment_count }
{ event_index_sha256, event_count }
{ visual_review_sha256, reviewed_frame_count }
{ evidence_pack_sha256, evidence_count }
```

Add negative cases for changed media bytes, a transcript source-hash mismatch, noncanonical event candidates, any `pending` frame, a changed frame byte, and an EvidencePack hash mismatch. Assert the ledger bytes and SHA remain unchanged after each failure.

- [ ] **Step 2: Run the narrow verifier test and confirm RED**

Run:

```bash
npm test -- test/playbookChapterArtifactVerifier.test.js --test-reporter=spec
```

Expected: FAIL because `chapterArtifactVerifier.js` does not exist.

- [ ] **Step 3: Implement streaming and canonical validation**

For media and individual frame bytes, hash from read handles in bounded chunks. For JSON artifacts, read one episode artifact, validate exact fields and lineage using the existing validators, and hash the exact reopened bytes where the ledger field represents review/publication. Read the ledger only after artifact validation, require its episode stage to equal `expectedCurrentStage`, and call `advanceEpisodeStage` with its reopened `ledger_sha256`.

The visual transition requires every frame record to say `visually-reviewed`, every referenced JPEG to be a regular no-follow file with the recorded SHA-256/dimensions, and the recomputed canonical frame index hash to match. The verifier never writes review status.

- [ ] **Step 4: Add strict CLI advancement and evidence-command integration**

Extend chapter parsing only with:

```text
advance --bvid <approved BVID>
```

Resolve the BVID through the checked-in manifest/chapter plan, verify the artifact for the ledger's current stage, and return only public stage/hash/count data. Successful `media`, `transcribe`, and `pack` main-command execution calls the same API. `frames` reports extracted pending frames but leaves the ledger at `events-indexed`.

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
npm test -- test/playbookChapterArtifactVerifier.test.js test/playbookChapterCli.test.js test/architecturePlaybookEvidenceCli.test.js test/playbookChapterLedger.test.js --test-reporter=spec
```

Expected: PASS.

```bash
git add src/playbook/course/chapterArtifactVerifier.js src/runArchitecturePlaybookChapter.js src/runArchitecturePlaybookEvidence.js test/playbookChapterArtifactVerifier.test.js test/playbookChapterCli.test.js test/architecturePlaybookEvidenceCli.test.js
git commit -m "feat: advance P7 ledger from verified artifacts"
```

---

### Task 3: Make Human Review Boundaries Explicit and Restartable

**Files:**
- Modify: `src/playbook/course/chapterArtifactVerifier.js`
- Modify: `src/runArchitecturePlaybookChapter.js`
- Modify: `test/playbookChapterArtifactVerifier.test.js`
- Modify: `test/playbookChapterCli.test.js`
- Modify: `docs/architecture-playbook/README.md`

**Interfaces:**
- Consumes private review receipts at `.local/architecture-playbook/evidence/<BV>/notes-review.json` and `rules-review.json` only after a reviewer creates them.
- Produces ledger transitions `evidence-packed -> notes-reviewed` and `notes-reviewed -> rules-reviewed`.

- [ ] **Step 1: Write failing receipt-binding tests**

The notes receipt binds the exact checked-in note bytes:

```json
{
  "schema_version": 1,
  "bvid": "BV1guoPYkExk",
  "artifact": "docs/architecture-playbook/course/notes/heihui-jileniao/BV1guoPYkExk.md",
  "artifact_sha256": "<lowercase SHA-256>",
  "item_count": 1,
  "review_status": "reviewed"
}
```

The rules receipt has the same fields and binds an episode-scoped reviewed JSONL under `docs/architecture-playbook/rules/schools/heihui-jileniao/episodes/<BV>.jsonl`. Test rejection of `pending`, wrong BVID, wrong school path, changed bytes, symlinks, duplicate rule IDs, evidence IDs outside the episode pack, and any creator other than `heihui-jileniao`.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
npm test -- test/playbookChapterArtifactVerifier.test.js --test-reporter=spec
```

Expected: FAIL because review receipts are not recognized.

- [ ] **Step 3: Implement exact receipt verification**

Reopen the receipt, then reopen the exact repository-relative artifact with no symlink components. Recompute `artifact_sha256`, parse/count the artifact, and validate its episode/evidence/school scope. The verifier records only `{ notes_sha256, note_count }` or `{ rules_sha256, rule_count }`; it never creates a receipt or changes `review_status`.

- [ ] **Step 4: Expose deterministic next actions without pretending review exists**

For `asr-complete`, `events-indexed`, `evidence-packed`, and `notes-reviewed`, `next` returns the required canonical artifact/review action plus the exact `advance` command, without private absolute paths or source content. Documentation states that the command fails until the reviewer-created artifact is valid.

- [ ] **Step 5: Run focused tests and commit**

```bash
npm test -- test/playbookChapterArtifactVerifier.test.js test/playbookChapterCli.test.js test/playbookP2EvidenceAudit.test.js --test-reporter=spec
git add src/playbook/course/chapterArtifactVerifier.js src/runArchitecturePlaybookChapter.js test/playbookChapterArtifactVerifier.test.js test/playbookChapterCli.test.js docs/architecture-playbook/README.md
git commit -m "feat: bind P7 human review checkpoints"
```

---

### Task 4: Process `BV1guoPYkExk` Sequentially and Stop Honestly

**Files:**
- Private only: `.local/architecture-playbook/sources/BV1guoPYkExk/...`
- Private only: `.local/architecture-playbook/transcripts/BV1guoPYkExk/...`
- Private only: `.local/architecture-playbook/evidence/BV1guoPYkExk/event-candidates.json`
- Private only: `.local/architecture-playbook/frames/BV1guoPYkExk/...`
- Create only after actual review permits: `docs/architecture-playbook/course/notes/heihui-jileniao/BV1guoPYkExk.md`
- Create only after actual review permits: `docs/architecture-playbook/rules/schools/heihui-jileniao/episodes/BV1guoPYkExk.jsonl`
- Create/update: `docs/architecture-playbook/reports/p7-chapter-1-progress.md`

**Interfaces:**
- Consumes the verified commands from Tasks 1–3.
- Produces durable private evidence state and a public progress report containing only hashes, counts, stages, blockers, tests, and the next exact command.

- [ ] **Step 1: Acquire and verify media**

Run exactly:

```bash
npm run playbook:evidence -- media --bvid BV1guoPYkExk
```

Confirm the command reopens the media bytes and advances only to `media-verified`.

- [ ] **Step 2: Transcribe and verify ASR**

Run exactly:

```bash
npm run playbook:evidence -- transcribe --bvid BV1guoPYkExk
```

Confirm source hash equality, monotonic timestamps, nonempty segment count, and ledger stage `asr-complete` without printing transcript text publicly.

- [ ] **Step 3: Review transcript-derived teaching events**

Read only this episode's transcript. Create a compact `event-candidates.json` only for genuine teaching transitions/comparisons/construction steps, with exact segment lineage. If the episode contains no defensible teaching event, record that blocker instead of inventing one. Run:

```bash
npm run playbook:chapter -- advance --bvid BV1guoPYkExk
```

Expected: `events-indexed` only after the reviewed event artifact validates.

- [ ] **Step 4: Extract frames and stop at the visual-review gate**

Run:

```bash
npm run playbook:evidence -- frames --bvid BV1guoPYkExk
```

Confirm every extracted frame remains `pending` and the ledger remains `events-indexed`. Do not edit statuses, create a visual approval, compile an EvidencePack, or publish notes/rules without genuine review.

- [ ] **Step 5: Verify compatibility and portable generation**

Run focused suites for P2 golden evidence, P4/P5 affected contracts, `playbook=off`, and datapack portability. Run one fixed-prompt mock generation without any world argument and inspect `architect:clear`, `architect:build`, and `architect:run` for relative coordinates.

- [ ] **Step 6: Independently review specification compliance and quality/security**

Perform two separate read-only passes over the final diff: first map every change to this plan/spec and identify scope gaps; then inspect private-data leakage, symlink/hash/TOCTOU behavior, ledger CAS, school isolation, memory bounds, and world-access regressions. Fix findings with new failing tests before implementation changes.

- [ ] **Step 7: Publish and commit the exact checkpoint**

The report states the final ledger stage, artifact hashes/counts safe for publication, whether visual review blocks further work, test commands/results, generation run identity, and the exact next command. It makes no aesthetic or human-review claim.

```bash
git add docs/architecture-playbook/reports/p7-chapter-1-progress.md
git commit -m "docs: record P7 Chapter 1 evidence checkpoint"
```
