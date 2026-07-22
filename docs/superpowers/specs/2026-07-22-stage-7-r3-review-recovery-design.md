# Stage 7 R3 Stale Review Recovery Design

## Purpose

Allow one already-`fingerprinted` R3 candidate to receive its delayed, hash-bound human review after the batch day has passed. The recovery must not permit a new acquisition, a reserve activation, a Dataset admission, training, or Apply Mode.

## Root cause

The public-NBT CLI runs `runPilotPreflight` before every command. That preflight requires `batch.as_of` to equal the current UTC day and `HEAD` to equal `batch.code_revision`. An already-fingerprinted candidate is itself bound to the original batch hash, so replacing the batch cannot make its review valid. A corrective code commit also changes `HEAD`, making the original batch unavailable to the current `record-review` command.

## Chosen approach

Add one internal preflight profile, selected only by the exact `record-review` command. The profile permits a past batch date and a committed descendant of the original approved revision. It never accepts a future batch date. All other commands keep their existing exact-date and exact-`HEAD` requirements.

The review finalizer remains the authority for the candidate state and binds the review to the original batch, content, preparation, fingerprint, labels, and duplicate proposals. It therefore accepts only an existing `fingerprinted` candidate; it cannot acquire, parse, prepare, or fingerprint a new candidate.

## Required behavior

- `validate-batch`, `run-candidate`, and `audit` reject a batch whose date is not today or whose code revision is not exactly `HEAD`.
- The CLI passes `reviewRecovery: true` to preflight only for `record-review`.
- With `reviewRecovery: true`, preflight accepts a date only when `batch.as_of < today`, and accepts a code revision only when `git merge-base --is-ancestor batch.code_revision HEAD` succeeds.
- The recovery profile still requires a clean tracked worktree, the expected branch, ignored public and private roots, the private aggregate and Python preflight, and the immutable Dataset v1/v2/v3 boundary with Dataset v3 `false` / `0` gate.
- Preflight remains both before and after `record-review`; the same recovery profile applies to the postflight.
- The existing `finalizePilotCandidate` contract continues to require an already-fingerprinted candidate and exact original batch/fingerprint bindings.
- No CLI option, environment variable, or user-controlled argument exposes the recovery profile.
- The final summary continues to report both training and Dataset-admission authority as `false`.

## Verification

Tests must prove all of the following:

1. A delayed `record-review` invokes preflight with the internal recovery profile both before and after finalization.
2. Normal command paths do not receive that profile.
3. A past batch date and descendant code revision are accepted only under the recovery profile.
4. A future batch date and a non-descendant code revision are rejected even under the recovery profile.
5. Existing review-finalization tests still reject any candidate that is not already fingerprinted or whose bindings do not match.

## Non-goals

- No batch rewrite, new manifest, acquisition retry, candidate substitution, or reserve activation.
- No modification to Dataset v1/v2/v3, normal generation, Stage 7 M3, M4 Apply Mode, private research, trainer behavior, or external APIs.
