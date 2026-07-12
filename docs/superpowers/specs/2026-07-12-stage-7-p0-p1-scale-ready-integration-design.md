# Stage 7 P0-P1 Scale-Ready Integration Design

## Purpose

This design defines the first execution slice after Stage 7 Milestone 2.5: integrate the trusted-data loop into `main`, then complete the six-case human review pilot without weakening any readiness gate. The work is deliberately structured to measure and reduce the effort required for a future single-reviewer corpus of 2000 or more eligible, traceable cases.

## Current State

- At design discovery, `main` was clean and aligned with `origin/main` at the Stage 7 M1 integration baseline. The committed copy of this design intentionally makes local `main` one reviewed documentation commit ahead before P0 begins.
- `codex/stage-7-m2-dataset` contains M2 and M2.5 in an isolated worktree.
- A read-only merge scan reports no textual conflicts.
- The M2.5 branch passes all 382 Node.js tests.
- Dataset v1 contains 64 traceable real cases and remains immutable.
- Dataset v2 and the six-case review pack have fixed reproduction commands and recorded SHA-256 hashes.
- The six pilot cases are present, but current readiness is 0/6 reviewed, 0/6 semantic-accepted, and 0/6 training-eligible.

## Chosen Approach

Use a scale-ready incremental workflow:

1. Integrate M2.5 without rewriting its history.
2. Prove the committed dataset and review artifacts are reproducible on `main`.
3. Review one pilot case at a time and rebuild Dataset v2 after every accepted review record.
4. Record review effort and evidence reuse during the pilot.
5. Use measured throughput from the six-case and later twenty-case cycles to plan the 2000-case P5 effort.

This approach is preferred over prototype-first training because it avoids building training assumptions on unmeasured curation work. It is preferred over training-infrastructure-first execution because real review records should validate the data boundary before that boundary becomes a Python loader contract.

## Scope

### P0: Integrate M2.5

P0 includes:

- fetch `origin` and verify that `main` has no uncommitted or unexpected divergent work; the approved design commit is expected local history;
- merge `codex/stage-7-m2-dataset` into `main` with a normal merge that preserves its commits;
- run the complete Node.js test suite and require exactly 382 passing tests with zero failures;
- rebuild Dataset v1, Dataset v2, and the six-case review pack with `SOURCE_DATE_EPOCH=1783814400`;
- create a second independent temporary build and compare the versioned artifact hashes;
- confirm Dataset v1 retains its recorded hashes;
- confirm Dataset v2 and the review pack reproduce their recorded hashes;
- confirm generated scratch artifacts remain ignored and the worktree is clean;
- retain documentation that describes Stage 7 as in progress and real-data training as gated.

P0 does not edit review outcomes, create positive license claims, start Python work, or train a model.

### P1: Six-Case Human Review

P1 includes one complete review cycle for each frozen pilot case:

- `house-a-small-modern-house`;
- `house-lakehouse`;
- `house-tavern`;
- `house-watermill`;
- `house-wood-modern-house`;
- `temples-japanese-pagoda-plus-tea-house`.

For every case, the human reviewer decides and records:

- source URL or other traceable source identity;
- author or publisher identity;
- license status and whether local training is explicitly permitted;
- concrete license evidence;
- canonical building front side;
- an explicit allow or block decision for `envelope`, `site`, and `space` learning;
- semantic acceptance or the sparse semantic corrections required for acceptance.

Automation may collect, display, hash, validate, and bind evidence. It must not invent a reviewer identity, author, permission, license conclusion, front side, approved learning area, or positive semantic outcome.

P1 does not lower the exit thresholds when a pilot is unusable. It expands the candidate queue while preserving rejected and ineligible cases with explicit blockers.

## Components and Boundaries

### Integration Boundary

The merge preserves the existing M2/M2.5 commits so dataset schema and governance changes remain auditable. The design document is independent of the feature branch and may merge before it without changing M2.5 runtime behavior.

### Reproduction Boundary

Canonical, committed outputs are compared against a separate temporary output tree. Dataset v1 and Dataset v2 comparisons cover `manifest.json`, `cases.jsonl`, `splits.json`, and all committed reports. Review-pack comparison covers its committed index and report plus deterministic per-case artifact hashes reported by the generator.

The fixed epoch is part of the reproducibility contract. A build without that epoch is not accepted as hash evidence.

### Human Review Boundary

The append-only, source-hash-bound review overlay is the sole positive governance input. Each review is applied only to the exact schematic hash it inspected. A later source change makes the review stale rather than silently transferring its conclusions.

### Semantic Correction Boundary

Corrections remain sparse `set` or `clear` operations over canonical Stage 7 cells. Every operation requires a short human reason and retains review provenance. Corrections cannot change split assignment, source identity, license permission, or eligibility directly. The corrected plan must pass the same schema, validation, repair, and conversion boundaries used by every Stage 7 provider.

### P5 Measurement Boundary

The pilot records the following operational measurements outside model-training artifacts:

- total elapsed review time per case;
- source and license investigation time;
- semantic inspection time;
- sparse correction authoring time and correction count;
- source or license evidence group used;
- whether evidence was reused from a previously reviewed case;
- final governance and semantic outcome.

These measurements are workflow evidence, not model features. They must not enter condition encoding or learned targets.

## Data Flow

### P0

1. Synchronize repository references and verify a clean `main`.
2. Merge the M2.5 branch while preserving its history.
3. Run all tests.
4. Generate canonical Dataset v1, Dataset v2, and review-pack outputs with the fixed epoch.
5. Generate the same artifacts into an independent temporary tree.
6. Compare hashes against both the canonical tree and committed benchmark records.
7. Inspect status and accept P0 only when no unintended files remain.

### P1

1. Select the next unresolved pilot case.
2. Inspect the source-bound review pack and raw semantic plan.
3. Gather source, author, and license evidence for human review.
4. Record the human governance and orientation decisions.
5. Inspect semantic layers and add only necessary sparse corrections.
6. Append the completed source-bound review record.
7. Rebuild Dataset v2 and run focused validation.
8. Record review-effort measurements.
9. Continue to the next case or select a replacement candidate if the current case cannot become eligible.
10. Run the full readiness gate after all six pilot outcomes are explicit.

## Failure Policy

- Uncommitted changes or unexpected divergence on `main` stop P0 before merge. The approved design commit is not treated as unexpected divergence.
- Any merge conflict is resolved explicitly and followed by the complete verification sequence.
- Any failed test or artifact hash mismatch prevents P0 completion.
- Dataset v1 hash drift is a hard blocker because v1 is immutable.
- Missing or ambiguous license evidence keeps a case training-ineligible.
- Missing `local-training` permission keeps a case training-ineligible even if semantic extraction is accepted.
- A source hash mismatch makes the review stale and unusable.
- Invalid or partially applicable corrections reject the review record; they are never partially applied.
- Semantic rejection remains a blocker even when governance otherwise permits training.
- Fewer than three eligible and semantic-accepted cases expands the candidate pool; it never lowers the thresholds.
- Fixture-only M3 work may proceed while P1 is incomplete, but no real Dataset v2 case may enter training until the readiness command exits zero.

## Testing and Verification

### P0 Verification

- `npm test` reports 382 passed, 0 failed, 0 skipped, and 0 cancelled.
- Dataset v1 rebuild matches all hashes recorded in `docs/benchmarks/stage7-m2-dataset-v1.md`.
- Dataset v2 rebuild matches all hashes recorded in `docs/benchmarks/stage7-m2-5-dataset-v2.md`.
- A second independent build produces byte-identical versioned outputs.
- The review-pack command produces six source-bound cases and zero automated positive review claims.
- `git status --short` is empty after ignored temporary outputs are removed or left ignored.

### Per-Case P1 Verification

- focused overlay, correction, review-pack, dataset, and CLI tests pass;
- the review record matches the current source SHA-256;
- every positive record has a real reviewer identity, ISO timestamp, evidence, front side, and three explicit layer decisions;
- Dataset v2 rebuild is deterministic after the append-only review;
- ineligible cases remain in the dataset with explicit blockers.

### P1 Exit Gate

The authoritative readiness command is:

```powershell
npm run dataset:stage7 -- --dataset-version v2 --require-reviewed 6 --require-semantic-accepted 3 --require-eligible 3
```

It must exit zero with:

- six of six explicit human review outcomes;
- at least three semantic-accepted cases;
- at least three training-eligible cases;
- at least three cases that are both semantic-accepted and training-eligible;
- no positive case missing required provenance or governance evidence.

## Single-Reviewer Schedule

- P0 integration and verification: 0.5 to 1 working day.
- Initial six-case review: 1 to 3 working days when evidence is readily available; up to 1 to 2 weeks if replacement candidates or difficult source terms are required.
- Fixture-only P2 planning and implementation may overlap P1 after P0.
- The first real-data prototype remains blocked until the P1 gate passes.
- P5 receives no fixed completion date until the six-case and twenty-case cycles yield measured per-case throughput.

The intended pace is sustainable rather than deadline-driven. A case with unclear rights is allowed to remain ineligible indefinitely without being treated as an engineering failure.

## Preparing for 2000+ Cases

The six-case pilot validates correctness. The twenty-case expansion validates repeatability and produces the first useful throughput estimate. Before P5 scales beyond that point, the workflow should support source-grouped queues, reusable source-level evidence, deterministic candidate prioritization, resumable review state, and aggregate blocker and throughput reporting.

Those scale features are not added speculatively during P0. They are derived from observed pilot friction and receive a separate design and implementation plan before the large corpus campaign.

## Exit Criteria

### P0 Complete

- M2.5 is present on `main` with auditable commit history.
- The complete 382-test suite passes.
- Dataset v1, Dataset v2, and review-pack evidence are independently reproducible.
- Dataset v1 is unchanged.
- The repository is clean and ready for continued development.

### P1 Complete

- Six pilot cases have real human outcomes.
- At least three cases are training-eligible.
- At least three cases are semantic-accepted.
- At least three cases satisfy both conditions.
- The readiness command exits zero.
- Pilot effort measurements are sufficient to plan the twenty-case review cycle.

## Non-Goals

This design does not implement the Python/PyTorch environment, Dataset v2 loader, condition encoding, target decoding, model training, Python inference, learned-provider adapter, Stage 7 apply mode, or a claim of held-out generalization. Each belongs to a later independently approved specification.
