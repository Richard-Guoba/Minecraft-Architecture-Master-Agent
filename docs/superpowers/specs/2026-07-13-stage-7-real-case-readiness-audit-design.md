# Stage 7 Real-Case Readiness Audit Design

Date: 2026-07-13

## Purpose

Add a deterministic, read-only Stage 7 audit for the six fixed Dataset v3 pilot cases. The audit explains why each case cannot contribute to M3 real-data readiness without granting approval, changing a Dataset artifact, loading real tensors, starting training, or changing M4 Apply Mode.

The audit is advisory evidence. It is not a reviewer, a Dataset builder, a training gate setter, or a provider.

## Scope and non-goals

The tool reads only committed Dataset v3 metadata, the existing review overlay, and an optional local artifact root. It writes JSON and Markdown reports only to an explicitly selected output directory outside every Dataset v1/v2/v3 root.

It does not:

- modify `mc_templates/datasets/coarse_semantic_voxels/{v1,v2,v3}` or any review overlay;
- create reviews, approvals, license evidence, canonical fronts, semantic acceptance, or training eligibility;
- import Python, load a real-data tensor, create a checkpoint, invoke a trainer, or invoke a provider;
- alter `ready_for_m3_real_data`, `training_eligible_count`, case records, primary operations, or Stage 7 M4 Apply Mode;
- add a runtime dependency.

The first release audits exactly `STAGE7_PILOT_CASE_IDS`, in that declared order. It rejects a caller-supplied case selector rather than silently broadening or narrowing the audit.

## Inputs and trust boundary

The audit accepts these paths:

| Input | Default | Role |
| --- | --- | --- |
| Dataset root | `mc_templates/datasets/coarse_semantic_voxels/v3` | immutable `manifest.json`, `cases.jsonl`, and `splits.json` |
| Review overlay | `mc_templates/curation/stage7_dataset_reviews.jsonl` | existing human review records only |
| Artifact root | `.tmp/stage7-dataset/v3` | optional local plan artifacts referred to by v3 records |
| Output directory | required | JSON and Markdown report destination |

Every supplied path is resolved from the process working directory. The audit rejects a path that escapes its declared root, a symbolic link at any required file boundary, a non-regular file, invalid UTF-8, malformed JSON/JSONL, duplicate pilot record, missing pilot, invalid overlay record, or ambiguous latest review. It records the normalized repository-relative path and SHA-256 of every successfully read input byte sequence. Absolute paths, host names, timestamps, and environment values never enter the report.

The existing strict `parseStage7DatasetReviewOverlay`, `mergeStage7DatasetReviews`, `evaluateStage7V3ReviewScope`, `hashCanonicalValue`, and `STAGE7_PILOT_CASE_IDS` contracts remain authoritative. The audit composes these pure contracts; it does not create a second permissive parser or a second readiness algorithm.

## Architecture

### Pure audit module

`src/construction/learning/stage7RealCaseReadinessAudit.js` has one responsibility: load validated evidence, derive a canonical audit object, and render Markdown from that object.

Its public interface is:

```js
export async function auditStage7RealCaseReadiness(options = {});
export function renderStage7RealCaseReadinessMarkdown(audit = {});
export function canonicalizeStage7RealCaseReadinessAudit(audit = {});
```

`auditStage7RealCaseReadiness` returns a fully deterministic object. It contains `advisory_only: true`, `mutates_dataset: false`, and `authorizes_training: false` at the root, even for malformed or incomplete evidence. Fatal input failures are represented by sorted global blocker objects; no case can contribute to readiness when a global failure exists.

Each evidence assertion contains:

```json
{
  "code": "LICENSE_LOCAL_TRAINING_NOT_ALLOWED",
  "severity": "blocker",
  "source": {
    "path": "mc_templates/datasets/coarse_semantic_voxels/v3/cases.jsonl",
    "sha256": "<input-byte-sha256>",
    "pointer": "/case_id=house-a-small-modern-house/source/allowed_uses"
  },
  "expected": "contains local-training",
  "actual": ["local-analysis"]
}
```

Arrays are sorted by the fixed pilot order and then code. Object properties are constructed in documented canonical order. `canonicalizeStage7RealCaseReadinessAudit` serializes with a trailing newline; the Markdown renderer consumes only this audit object and contains no independent eligibility logic.

### Thin CLI

`src/auditStage7RealCaseReadiness.js` parses `--dataset-root`, `--review-overlay`, `--artifact-root`, `--out`, and `--help`. It requires `--out`, rejects an output directory inside a Dataset v1/v2/v3 root, and writes exactly:

```text
<out>/stage7-real-case-readiness-audit.json
<out>/stage7-real-case-readiness-audit.md
```

The CLI uses a sibling temporary directory and rename to avoid a partial pair of reports. It exits non-zero for fatal input evidence, but may still write the canonical fail-closed report if the output location itself is safe. It never writes an input path.

`package.json` receives `audit:stage7:readiness`, invoking this Node-only CLI. Normal Node generation remains Python-independent.

## Stable blocker vocabulary

The following codes are part of the v1 output contract. A case emits each applicable code at most once.

| Category | Codes |
| --- | --- |
| Input safety | `INPUT_PATH_ESCAPE`, `INPUT_SYMLINK`, `INPUT_NOT_REGULAR_FILE`, `INPUT_INVALID_UTF8`, `INPUT_INVALID_JSON`, `INPUT_INVALID_JSONL`, `INPUT_DUPLICATE_PILOT`, `INPUT_MISSING_PILOT`, `INPUT_AMBIGUOUS_REVIEW` |
| Reviewer | `REVIEWER_IDENTITY_MISSING`, `REVIEW_DECISION_NOT_POSITIVE` |
| License | `LICENSE_EVIDENCE_MISSING`, `LICENSE_LOCAL_TRAINING_NOT_ALLOWED` |
| Canonical front | `CANONICAL_FRONT_MISSING` |
| Learning layers | `LEARNING_LAYER_ENVELOPE_NOT_APPROVED`, `LEARNING_LAYER_SPACE_NOT_APPROVED`, `LEARNING_LAYER_SITE_NOT_APPROVED` |
| Semantics | `SEMANTIC_ACCEPTANCE_NOT_ACCEPTED` |
| Exact v3 binding | `V3_REVIEW_UNBOUND`, `V3_REVIEW_SOURCE_MISMATCH`, `V3_REVIEW_EXTRACTOR_MISMATCH`, `V3_REVIEW_PLAN_MISMATCH`, `V3_REVIEW_LAYERS_REJECTED` |
| Local artifact | `LOCAL_ARTIFACT_ROOT_MISSING`, `LOCAL_ARTIFACT_PATH_ESCAPE`, `LOCAL_ARTIFACT_MISSING`, `LOCAL_ARTIFACT_INVALID_JSON`, `LOCAL_ARTIFACT_CANONICAL_HASH_MISMATCH` |
| Gate | `DATASET_GATE_CLOSED`, `GATE_CASE_NOT_ELIGIBLE`, `GATE_THRESHOLD_UNMET` |

For an existing local plan, the report records both its raw-byte SHA-256 and the canonical object hash. The latter must equal the record's `plan_sha256`; this avoids falsely treating JSON formatting bytes as the Dataset plan identity. If the local artifact root is absent, the audit emits the root/missing artifact blockers instead of inventing an artifact hash.

## Readiness semantics

The audit reports the committed Dataset v3 manifest gate verbatim. It may calculate an explanatory `gate_contribution` for each case only as the conjunction of existing evidence; it does not calculate, write, or recommend a new manifest gate value.

`gate_contribution` is false whenever a case is not already both `training.eligible` and `extraction.semantic_status === 'accepted'`, or any audit blocker exists. The summary includes the manifest's immutable false/zero values, the current observed eligible-and-accepted count, and the existing threshold of three. `authorizes_training` is always false, regardless of any hypothetical all-green inputs.

## Failure handling

All uncertainty is fail-closed. Missing, malformed, stale, conflicting, ambiguous, out-of-root, or mismatched evidence produces a stable blocker and a false contribution. The audit never falls back to a default front side, an inferred approval, an inferred license permission, an inferred reviewer decision, or an unverified artifact.

The renderer labels reports as advisory and preserves the exact source evidence for each negative conclusion. Human action wording may say that evidence is missing, but it must never say an approval was granted or that training may begin.

## Test strategy

`test/stage7RealCaseReadinessAudit.test.js` uses temporary fixture trees and the real pure module. It proves:

1. the six-pilot output is deterministic byte-for-byte for JSON and Markdown and has the three mandatory false claims;
2. each stable blocker category is emitted from its concrete malformed, stale, absent, or mismatched evidence condition;
3. source paths, byte hashes, and JSON pointers accompany every assertion;
4. review identity, decision, license, canonical front, three layers, semantic status, exact v3 binding, and local plan canonical hash are independently checked;
5. `--out` cannot be a Dataset root, input paths cannot escape, and symlinks/non-regular files fail closed;
6. the audit never imports Python or invokes a training/provider process;
7. bytes of every Dataset v1/v2/v3 file, the v3 gate values, and all six pilot records are identical before and after both module and CLI runs; and
8. the existing full Node suite remains green.

No M3 adversarial hardening beyond evidence directly exercised by this audit is included in this subproject. That remains a separate, later decision.
