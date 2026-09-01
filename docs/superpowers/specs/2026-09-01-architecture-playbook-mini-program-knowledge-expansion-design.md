# Architecture Playbook Mini-Program Knowledge Expansion Design

**Date:** 2026-09-01

**Status:** Approved direction; implementation planning pending

**Scope:** Expand the single-school Architecture Playbook while preserving the existing portable-datapack mini-program workflow

## 1. Decision

The product remains a datapack generator, not a Minecraft world automation or capture system.

The user-facing workflow is:

```text
building request
→ semantic planning informed by the Architecture Playbook
→ deterministic JavaScript geometry, validation, repair, and export
→ portable architect_datapack/
→ user chooses a Minecraft world
→ user stands at the desired build origin
→ /reload
→ /function architect:run
```

Generated Minecraft commands use relative coordinates. Generation therefore requires neither a world path nor a plot origin. Installing a datapack through `--world`, `--datapacks-dir`, or a named quick target remains an optional convenience; it is not part of the core generation contract.

The previously implemented P6 fixed-view and blind-comparison subsystem remains available as optional evaluation infrastructure. Formal P6 Minecraft capture, world identity, and human blind-comparison completion no longer block starting P7 knowledge expansion. P7 promotion instead uses the lightweight chapter gate defined below. No existing P6 evidence or implementation is deleted.

## 2. Goals

1. Process the remaining 44 episodes of 黑辉极乐鸟《极乐鸟的建筑课堂》 chapter by chapter.
2. Preserve traceability from course evidence to public notes, rule cards, playbook versions, and executable design behavior.
3. Expand only the knowledge and design-layer mappings that can be represented honestly by the current mini program.
4. Keep ordinary generation simple: one prompt produces a portable datapack that builds relative to the player's chosen position.
5. Make long-running study and test jobs restartable and memory-bounded.
6. Preserve the existing six-episode golden flow and normal `playbook=off` behavior.

## 3. Non-goals

- Launching Minecraft, selecting a world, choosing a plot, moving a player, or executing build commands automatically.
- Requiring a disposable world, world hash, fixed plot coordinates, or formal screenshots before studying another chapter.
- Feeding raw transcripts directly to the production generator.
- Letting an LLM emit whole-house block coordinates.
- Treating every course statement as executable.
- Combining other creators or generic architectural knowledge into the primary school.
- Claiming aesthetic improvement without recorded comparative evidence.
- Deleting or weakening the existing optional P6 evaluation implementation.

## 4. Stable Mini-Program Contract

### 4.1 Input

The existing CLI accepts a Chinese or English building request and generation options. `npm start` remains the normal entry point. `npm run playbook:execute` remains the opt-in playbook-controlled entry point until a later reviewed promotion changes its default.

### 4.2 Output

Every successful run produces an ignored run directory containing at least:

```text
blueprint.json
architect_datapack/
raw_build.mcfunction
preview.html
run_report.md
architecture_scorecard.json
```

`architect_datapack/` is portable. Its `architect:build`, `architect:clear`, and `architect:run` functions use relative coordinates. The user may copy it into any compatible world's `datapacks` directory and choose placement at execution time.

### 4.3 In-game use

The supported manual flow is:

1. Copy or install `architect_datapack/` into the chosen world's `datapacks/` directory.
2. Enter that world and stand at the intended build origin.
3. Run `/reload`.
4. Run `/function architect:run`.

`/reload` never builds. `architect:run` clears the generated footprint relative to the executor and then builds at that same origin.

### 4.4 Safety

Generation without an installation option must not inspect or mutate a Minecraft world. Optional installation must remain separately requested and must not choose an in-world location. Automated tests use disposable POSIX destinations and never a real save.

## 5. Knowledge Expansion Architecture

The knowledge path remains evidence-first:

```text
course manifest
→ local source snapshot
→ timestamped ASR draft
→ teaching-event detection
→ visually reviewed evidence
→ original episode notes
→ EvidenceNotes
→ candidate rule cards
→ chapter review
→ reviewed playbook version
→ shadow guidance
→ feasible executable mappings
→ datapack generation regressions
```

Raw media, full transcripts, frames, contact sheets, provider output, and working evidence stay under `.local/architecture-playbook/`. Only original paraphrased notes, permissible indexes, reviewed rules, compiled playbook artifacts, schemas, and reports may be tracked.

Every knowledge statement is classified as `fact`, `author_claim`, `inference`, or `contrast`. A visual detail not stated by the author is `observed_demo`. Unclear terminology, values, applicability, or intent remains `unknown` or `unresolved`. No numerical threshold is invented merely to make a rule executable.

## 6. Chapter Processing

The remaining curriculum is processed in this order:

1. foundational tools, blocks, modularity, and color;
2. complete structure;
3. complete roofs;
4. complete walls and facades;
5. landscaping and terrain;
6. interiors;
7. advanced architecture;
8. style-specific and specialist cases.

One chapter is the maximum promotion unit. Each chapter has a durable progress record containing:

- manifest episode IDs;
- source availability and hashes;
- ASR and visual-review status;
- note, evidence, and rule counts;
- unresolved terminology and claims;
- rule conflicts, exceptions, and supersession;
- current compiled playbook version;
- shadow, executable, generator, and datapack regression status;
- next exact action.

Interrupted work resumes from the last verified artifact. A failed chapter does not corrupt or replace the last passing playbook version.

## 7. Rule Promotion and Runtime Boundaries

Rules have separate knowledge and runtime states.

1. **Documented:** supported by traceable evidence and useful to a human reader.
2. **Advisory:** available to deterministic shadow review without changing generation.
3. **Executable:** mapped to a reviewed semantic design-layer operation with deterministic validation and repair behavior.

Promotion is never automatic merely because an episode was processed. A rule can remain documented or advisory indefinitely when the generator cannot express it safely.

Executable knowledge operates on semantic layers such as brief, massing, structure, roof, facade, site, and interior. Local JavaScript continues to own dimensions, coordinates, block legality, collision handling, paths, QA, repairs, and datapack export.

## 8. Lightweight Chapter Gate

A chapter may become the current playbook version when all of the following pass:

1. Episode identities match the 50-episode manifest.
2. Public notes are original, traceable, and contain no raw transcript substitute.
3. Evidence classifications and uncertainties are explicit.
4. Rule IDs, evidence links, conflicts, exceptions, and supersession validate.
5. The playbook compiler reproduces canonical managed artifacts with zero drift.
6. The six-episode golden corpus remains valid.
7. P4 shadow regressions pass.
8. P5 executable regressions pass for every affected executable layer.
9. Fixed prompt generation succeeds in mock mode and exports a valid portable datapack.
10. `playbook=off` compatibility tests pass.

Optional offline fixed-view renders or user-supplied Minecraft screenshots may identify quality regressions. They can block promotion when they provide concrete contradictory evidence, but their absence alone does not block processing the next chapter. No synthetic human preference is generated.

## 9. Quality Feedback Loop

The mini program uses three levels of feedback:

- **Always required:** schema, provenance, deterministic compilation, hard QA, generator, and datapack regressions.
- **Chapter-sensitive:** shadow and executable cases for the design layers changed by that chapter.
- **Optional/manual:** preview inspection, Minecraft placement tests, screenshots, and human comparisons.

When a user manually tests a datapack, the relevant record is the run hash, playbook version, prompt, seed, Minecraft version, and observed issue. World paths and coordinates are not needed in tracked evidence. A confirmed issue becomes a reproducible fixture or bounded rule/mapping correction before promotion continues.

## 10. Memory and Operational Safety

Node.js tests run only through `npm test -- ...`. The supported runner retains its 1536 MiB heap limit, test concurrency of at most two, and Linux systemd hard scope (`MemoryHigh=4G`, `MemoryMax=6G`, `MemorySwapMax=512M`). The full suite is not used for initial diagnosis.

Course processing is bounded by episode and chapter. Media decoding, ASR, keyframe extraction, and evidence compilation use restartable steps rather than retaining an entire chapter in memory. Large source or derivative bytes are streamed or processed sequentially. A failed or unavailable hard-memory backend stops the job rather than silently using an unbounded fallback.

## 11. Error Handling

- Missing media or credentials records an evidenced unavailable/blocking state without fabricating notes.
- Hash or identity mismatch fails the affected episode and preserves prior verified artifacts.
- Invalid evidence or rules fail the chapter gate with bounded error codes and exact local diagnostics.
- Unsupported executable mappings remain advisory rather than being approximated.
- Generator or datapack regression pins the previous passing playbook version.
- Optional manual visual failures open a correction task; they do not authorize world automation.

## 12. Testing Strategy

Implementation follows test-driven development. Required coverage includes:

- manifest-to-chapter assignment and complete/no-duplicate accounting;
- restart from each durable episode/chapter checkpoint;
- evidence classification and traceability validation;
- conflict, exception, and supersession lineage;
- deterministic rule and manual compilation;
- default-off and six-episode golden compatibility;
- affected P4/P5 layer behavior;
- fixed-prompt mock generation and portable datapack contents;
- relative-coordinate build, clear, and run functions;
- generation without world access;
- bounded-memory behavior for chapter-scale inputs.

The narrowest relevant suite runs first. Full verification runs only after scoped tests and reviews are clean.

## 13. Delivery Sequence

1. Update the program documentation and roadmap so P6 formal capture is optional rather than a P7 prerequisite.
2. Create the durable P7 chapter ledger and deterministic manifest assignment.
3. Build or extend restartable episode acquisition, ASR, event, evidence, and note commands only where the six-episode tools lack required capability.
4. Process the first remaining chapter as the operational proof.
5. Review and compile its rules into the next playbook version.
6. Add only feasible advisory or executable mappings.
7. Run the lightweight chapter gate and fixed-prompt datapack smoke generation.
8. Repeat chapter by chapter while retaining the last passing playbook version.
9. Produce Playbook v1 only after all 50 episodes satisfy the final evidence and regression requirements.

## 14. Acceptance Criteria

This design is successful when:

- a normal prompt still produces a portable datapack without a world or coordinates;
- the user can choose placement by standing at the desired origin and invoking `architect:run`;
- the course can advance chapter by chapter without formal P6 world capture;
- every promoted rule remains traceable and honestly scoped;
- executable knowledge changes only reviewed semantic design layers;
- failures preserve the last passing playbook version;
- test and processing jobs remain within the required memory boundaries;
- no world is opened or changed by the knowledge-expansion workflow.
