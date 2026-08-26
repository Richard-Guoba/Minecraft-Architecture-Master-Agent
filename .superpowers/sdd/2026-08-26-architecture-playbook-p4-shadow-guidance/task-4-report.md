# Task 4 report: authoritative review and bounded prompt packet

## Delivered

- `evaluateShadowReview()` compiles the P3 corpus and validated checker registry into a deterministic, deep-frozen 21-assessment review.
- The review preserves corpus order, emits all nine coverage layers, carries P3 coverage IDs and unknown IDs, and attaches repairs, repair targets, and downstream invalidations only to violated core procedures.
- Case-pattern checker results are bounded to `unknown` or `not-applicable`; any attempted promotion fails closed.
- `buildPromptPacket()` produces a review-hash-bound, deep-frozen packet with only whitelisted review and rule data plus the original prompt as `inert-data`.
- The packet clamps prose to 800 Unicode code points, prose arrays to 12 entries, and prompt data to 2,000 Unicode code points. It forbids additions of coordinates, block IDs, patches, scores, and thresholds.

## Verification

- RED: `node --test test/playbookShadowEvaluation.test.js` initially failed with `ERR_MODULE_NOT_FOUND` for `evaluateReview.js`.
- Focused shadow suites pass, including corpus/projection, checker registry, checker, contract, evaluation, prompt-boundary, deep-freeze, and Unicode-limit cases.
- `npm test` passes outside the sandbox. The unsandboxed run was necessary because one pre-existing CLI test uses `child_process`; the sandbox blocks that child spawn before execution.
- `git diff --check` passes.
- The new shadow modules have no construction or pipeline imports.

## Scope boundary

No blueprint mutation, visual/media input, private/config data, score, quality claim, coordinate, block ID, or patch generation was added.

## Fix round 1: exact blueprint input path

- RED: after adding direct-contract and evaluator boundary cases for `other.json` and `C:/tmp/blueprint.json`, `node --test test/playbookShadowEvaluation.test.js test/playbookShadowContracts.test.js` exited non-zero. The individual failures were `AssertionError: Missing expected exception`, proving both values were accepted before the fix.
- GREEN: replaced the generic relative-path predicate with the exact `blueprint_path === 'blueprint.json'` requirement. `node --test test/playbookShadowEvaluation.test.js test/playbookShadowContracts.test.js` passed: 2 test files, 2 passing, 0 failing.
