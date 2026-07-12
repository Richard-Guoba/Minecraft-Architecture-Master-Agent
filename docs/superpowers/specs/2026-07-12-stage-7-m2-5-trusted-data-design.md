# Stage 7 Milestone 2.5 Trusted Data Design

## Purpose

Stage 7 M2.5 turns the deterministic but entirely ineligible Dataset v1 into a reviewable trusted-data loop. The first loop is limited to six named pilot cases and must preserve the fail-closed governance established in M2. It prepares evidence and tooling for human decisions; it never invents a reviewer, permission, author, license conclusion, canonical front side, or approved learning area.

## Current State

Dataset v1 contains 64 traceable real cases with deterministic `64^3` extraction and case-disjoint splits. All 64 cases are `pending`, have `unknown` license status, lack a reviewed canonical front side, and are training-ineligible. All 64 extracted plans are schema-valid but semantic repair rejects them, most often for missing entrance, circulation, floor continuity, roof, vertical circulation, or usable space.

The six pilot cases are:

- `house-a-small-modern-house`
- `house-lakehouse`
- `house-tavern`
- `house-watermill`
- `house-wood-modern-house`
- `temples-japanese-pagoda-plus-tea-house`

## Chosen Approach

M2.5 uses a hybrid six-case pilot. License/source evidence, human semantic review, and extractor diagnostics advance together. A license-only pass could spend review effort on semantically unusable cases; an extractor-only pass could overfit cases that may never be permitted for training. The hybrid loop minimizes both risks and produces a reusable curation boundary before the corpus grows.

## Scope

M2.5 delivers:

1. A versioned, append-only Stage 7 curation overlay format.
2. A deterministic review-pack generator for the six pilot cases.
3. Source-hash binding and stale-review rejection.
4. Explicit human semantic corrections with provenance.
5. A corrected-plan path that reuses the canonical Stage 7 validator and repair boundary.
6. Dataset v2 generation and an M2.5 readiness report.
7. CLI gates for pilot review coverage, semantic acceptance, and training eligibility.

M2.5 does not add Python, PyTorch, training, inference, learned providers, runtime apply mode, or any claim that Stage 7 generalizes.

## Architecture

### Curation Overlay

`mc_templates/curation/stage7_dataset_reviews.jsonl` is append-only. Each record binds a `record_id` and `case_id` to the exact `source_sha256`, reviewer identity, timestamp, review status, canonical front side, approved and blocked Stage 7 layers, license status, allowed uses, license evidence, notes, and optional semantic correction operations.

The parser is strict for Stage 7 records. A positive review requires a non-empty human `reviewed_by`, valid ISO timestamp, non-empty license evidence, reviewed front side, and explicit decisions for all three target layers. `approved` and `limited` do not imply training permission: `local-training` and a supported license state remain separate requirements. Invalid JSON, duplicate `record_id`, unknown fields, unsupported correction operations, or a source-hash mismatch fail closed.

### Review Pack

The review-pack generator consumes Dataset v1 metadata, the raw schematics, and local deterministic extraction. For each pilot case it writes a lightweight directory containing:

- `review.json`: immutable source identity, review questions, current blockers, layer counts, transform, and artifact hashes;
- `report.md`: readable checklist and semantic diagnostics;
- `plan.raw.json`: the canonical extracted plan required to inspect or author corrections;
- `correction.example.json`: a source-bound example record with no positive review claims.

The canonical repository records only a compact review-pack index and report. Large per-case plans remain under `.tmp/stage7-m2-5-review-pack/` and are ignored.

### Semantic Corrections

Corrections are explicit sparse operations over canonical Stage 7 cells:

- `set`: set one layer at one `[x,y,z]` coordinate to a vocabulary value and confidence;
- `clear`: set one layer at one coordinate to that layer's empty value.

Every operation records a short human reason. Corrections are applied after deterministic rasterization and before canonical plan creation. They never edit source schematics or Dataset v1. Corrected plans pass the same schema validation, bounded repair, and conversion checks as every other Stage 7 provider. Corrections cannot suppress blockers, override license decisions, alter splits, or mark a case eligible directly.

### Dataset v2

Dataset v2 rebuilds all selected cases from raw source plus the latest valid source-bound review. It records Dataset v1 lineage, review record IDs, correction count, corrected plan hash, semantic status, and training blockers. Split assignment remains `sha256-case-id-v1`; no case moves between train, validation, and test because of review or correction.

Dataset v1 remains immutable. Dataset v2 is written atomically under `mc_templates/datasets/coarse_semantic_voxels/v2/` with manifest, JSONL cases, split assignments, and reports.

## Data Flow

1. Select the frozen six-case pilot.
2. Re-extract each source schematic with the M2 deterministic extractor.
3. Write the source-bound review pack and diagnostics.
4. A human curator inspects the source terms and semantic artifacts and appends review records.
5. Parse and validate the overlay; reject malformed, stale, incomplete, or unsupported records.
6. Apply traceable sparse corrections to reviewed cases.
7. Re-run canonical validation and bounded repair.
8. Build Dataset v2 with unchanged case-level splits.
9. Report review coverage, license decisions, semantic acceptance, training eligibility, and remaining blockers.

## Failure Policy

- Missing or invalid review files behave as no positive review.
- Source-hash mismatch marks the record stale and prevents its use.
- `unknown`, `prohibited`, or missing `local-training` permission remains ineligible.
- A missing human identity, timestamp, front side, license evidence, or layer decision prevents positive eligibility.
- Invalid corrections reject that review record; they are never partially applied.
- Semantic rejection remains a training blocker even when governance otherwise passes.
- Failure to reach the pilot target exits non-zero only when the caller explicitly requests the readiness gate.
- No automated process writes a positive reviewer identity or license conclusion.

## Testing

Node.js `node:test` coverage includes strict overlay parsing, append-only lineage, duplicate IDs, source-hash staleness, positive-review completeness, correction bounds and vocabulary, deterministic correction application, immutable Dataset v1, stable splits, deterministic v2 artifacts, CLI failure gates, and a tiny fixture that reaches eligibility only with a complete human-authored review.

Full `npm test` remains mandatory. Two independent Dataset v2 builds must produce identical manifest, cases, splits, and summary hashes for the same overlay and `SOURCE_DATE_EPOCH`.

## Exit Criteria

The first M2.5 cycle is successful when:

- all six pilot cases have explicit review outcomes;
- at least three pilot cases are both `training.eligible=true` and `extraction.semantic_status=accepted`;
- no positive case lacks source hash, reviewer identity, timestamp, license evidence, front side, or explicit layer decisions;
- Dataset v1 is unchanged;
- Dataset v2 is reproducible and case-disjoint;
- ineligible cases remain present with explicit blockers;
- focused and full Node.js test suites pass.

If external source terms or human review prevent three positive cases, the engineering cycle may still complete, but M2.5 remains externally blocked and M3 real-data training must not start.

## Status and Handoff

M2.5 is a data-readiness bridge, not an Architecture Master Roadmap milestone that changes runtime behavior. Documentation continues to describe Stage 7 as in progress. M3 begins only after the trusted-data gate is satisfied or is explicitly scoped to fixture-only pipeline smoke tests labelled `prototype`.
