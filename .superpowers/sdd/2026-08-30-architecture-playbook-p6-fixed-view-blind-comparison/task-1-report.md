# Task 1 Report

## Status

DONE

## Changed Files

- `src/playbook/p6/constants.js`
- `src/playbook/p6/contracts.js`
- `docs/architecture-playbook/evaluation/p6-v0.1/fixed-request.json`
- `docs/architecture-playbook/evaluation/p6-v0.1/visual-settings.json`
- `docs/architecture-playbook/evaluation/p6-v0.1/observation-criteria.json`
- `docs/architecture-playbook/evaluation/p6-v0.1/camera-protocol.json`
- `docs/architecture-playbook/evaluation/p6-v0.1/reason-tags.json`
- `docs/architecture-playbook/evaluation/p6-v0.1/schemas/fixed-request.schema.json`
- `docs/architecture-playbook/evaluation/p6-v0.1/schemas/visual-settings.schema.json`
- `docs/architecture-playbook/evaluation/p6-v0.1/schemas/camera-manifest.schema.json`
- `docs/architecture-playbook/evaluation/p6-v0.1/schemas/cohort-manifest.schema.json`
- `docs/architecture-playbook/evaluation/p6-v0.1/schemas/capture-manifest.schema.json`
- `docs/architecture-playbook/evaluation/p6-v0.1/schemas/observation.schema.json`
- `docs/architecture-playbook/evaluation/p6-v0.1/schemas/comparison-manifest.schema.json`
- `docs/architecture-playbook/evaluation/p6-v0.1/schemas/preference-record.schema.json`
- `docs/architecture-playbook/evaluation/p6-v0.1/schemas/gate-result.schema.json`
- `test/playbookP6Contracts.test.js`

## RED Evidence

Command:

```bash
node --test --test-isolation=none test/playbookP6Contracts.test.js
```

Result:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.worktrees/architecture-playbook-p6/src/playbook/p6/constants.js'
```

This is the expected initial RED because the new P6 contract surface did not exist yet.

## GREEN Evidence

Focused contract suite:

```bash
node --test --test-isolation=none test/playbookP6Contracts.test.js
```

Result before commit:

```text
8 tests, 8 passed, 0 failed
```

Diff hygiene before commit:

```bash
git diff --check
git diff --cached --check
```

Result:

```text
No diff-check errors.
```

Commit:

```bash
git commit -m "feat: define P6 evaluation protocol contracts"
```

Result:

```text
[agent/architecture-playbook-p6 7e7008c] feat: define P6 evaluation protocol contracts
```

## Design Notes

- Added a local P6 validator module that reuses only `deepFreeze`, `stableJson`, and `sha256` from `src/playbook/shadow/canonical.js`.
- Kept P6 one-way: no P4 or P5 imports, no pipeline integration, no generated outputs, no live calls, and no world-mutating behavior.
- Froze the approved prompt, seed, version, visual settings, six view IDs, categorical observation ratings, three preference values, and ASCII machine reason tag `facade`.
- Added one checked-in JSON Schema per persisted public contract named in the preflight ruling.
- Bound the checked-in protocol JSON files to stable SHA-256 hashes exported from `src/playbook/p6/constants.js`.
- Added a guard test that scans `src/playbook/p6/` and `docs/architecture-playbook/evaluation/p6-v0.1/` for forbidden scalar-score fields.

## Self-Review

- Verified RED first from missing-module failure, then GREEN after minimal implementation.
- Rechecked the approved spec for the exact prompt, root seed `424242`, Minecraft `1.21.9`, `mode=mock`, `candidate_count=3`, `candidate_rounds=1`, `candidate_force_rounds=false`, the six required view IDs, categorical-only ratings, and the reason-tag vocabulary.
- Confirmed public errors stay on stable codes only through `P6ContractError`, `p6Error`, and `sanitizeP6Error`.
- Confirmed all persisted public contract validators reject unknown fields and return frozen canonical objects.
- Confirmed the checked-in protocol JSON files are canonical `stableJson` bytes and that their exported hashes match the file contents.

## Commit Hash

`7e7008c`

## Concerns

- JSON Schema captures the public shape and fail-closed field policy, while some cross-record invariants such as pairwise uniqueness and full capture-grid coverage remain enforced in runtime validators rather than schema keywords alone.

## Fix Round 1

### Changed Behavior

- Added the missing persisted-protocol schemas: `camera-protocol.schema.json`, `observation-criteria.schema.json`, and `reason-tags.schema.json`.
- Tightened `validateCaptureManifest()` to require the approved shared environment payload plus per-image opaque screenshot IDs, camera position/orientation, build-function hash, and image hash.
- Tightened `validateGateResult()` to require an exact `failures` array and to forbid `open-p7` unless the outcome is `playbook-supported` with zero failures.
- Removed public `rawCode` / `detail` leakage from `P6ContractError`; the public error surface now carries only the stable code semantics.
- Enforced the checked-in `fixed-request.json` and `visual-settings.json` SHA-256 authorities in camera, cohort, and capture validators.
- Tightened published schemas to mirror more runtime behavior, including fixed camera order, required entry-eye offset, comparison pair positions, reason-tag uniqueness, and observation region conditionals.
- Extended `test/playbookP6Contracts.test.js` with representative valid/invalid schema-instance validation and expanded the forbidden-score scan to include `schemas/`.

### Covering Test Files

- `test/playbookP6Contracts.test.js`

### RED Evidence

Command:

```bash
node --test --test-isolation=none test/playbookP6Contracts.test.js
```

Output:

```text
pass 2
fail 6

failing tests:
- exports frozen literals and public errors without private detail leakage
- visual settings and camera manifests enforce fixed authority hashes and six-view ordering
- cohort and capture manifests preserve frozen authorities and require complete capture metadata
- observations, comparisons, preferences, and gate results stay exact and categorical
- checked-in protocol JSON is canonical, hash-bound, and every persisted public contract has a schema
- public schemas accept representative valid instances and reject representative invalid ones
```

This RED run proved the reviewed gaps were still present before the repair.

### GREEN Evidence

Command:

```bash
node --test --test-isolation=none test/playbookP6Contracts.test.js
```

Output:

```text
8 tests, 8 passed, 0 failed
```

Command:

```bash
git diff --check
```

Output:

```text
[no output]
```

### Commit

```text
5d4508347e8fa624cd943d74a9782f77ecf74a84
```

Commit:

```bash
git commit -m "fix: tighten P6 public contracts"
```

Output:

```text
[agent/architecture-playbook-p6 2ec757b] fix: tighten P6 public contracts
```

Post-commit verification:

```bash
node --test --test-isolation=none test/playbookP6Contracts.test.js
git rev-parse HEAD
```

Output:

```text
8 tests, 8 passed, 0 failed
2ec757b25d3fed89087f6ab3a490acdc11763bcc
```

### Notes

- No new dependency was added for schema validation. The focused test helper validates the subset of JSON Schema keywords used by these public contracts, including `$ref`, `prefixItems`, `uniqueItems`, `oneOf`, and `if`/`then`/`else`.
- Remaining invariants that JSON Schema still does not fully encode are the cross-record ones that depend on relationships between sibling values across arrays, such as exact `(solution, view)` grid coverage and solution-code-to-pair binding; runtime validators remain authoritative for those checks.

## Fix Round 2

### Changed Behavior

- Relaxed runtime validation for `observation.view_ids` and `preference.reason_tags` from ordered subsets to unique allowed subsets, with `observation.view_ids` remaining non-empty as required by the approved contract while `preference.reason_tags` remains optionally empty.
- Replaced comparison manifest public solution identifiers with the fixed opaque alias vocabulary `solution-A` through `solution-D`, and bound the six pair slots to the exact unordered alias pairs with either left/right orientation accepted per slot.
- Tightened `gate-result.schema.json` to enforce the same `outcome` / `next_action` / `failures` coupling already enforced at runtime.
- Tightened the local schema-format helper so root-level constraints still apply when a schema also uses `oneOf`, and so `date-time` rejects non-RFC3339 strings such as `2026-08-30 10:20:00Z`.

### Covering Test Files

- `test/playbookP6Contracts.test.js`

### RED Evidence

Command:

```bash
node --test --test-isolation=none test/playbookP6Contracts.test.js
```

Output:

```text
file:///home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.worktrees/architecture-playbook-p6/test/playbookP6Contracts.test.js:14
  P6_COMPARISON_ALIASES,
  ^^^^^^^^^^^^^^^^^^^^^
SyntaxError: The requested module '../src/playbook/p6/constants.js' does not provide an export named 'P6_COMPARISON_ALIASES'
```

This RED run showed the new comparison-alias contract coverage was absent before the repair.

### GREEN Evidence

Command:

```bash
node --test --test-isolation=none test/playbookP6Contracts.test.js
```

Output:

```text
✔ exports frozen literals and public errors without private detail leakage (0.95903ms)
✔ fixed request is exact, immutable, and canonical (3.93405ms)
✔ visual settings and camera manifests enforce fixed authority hashes and six-view ordering (1.233301ms)
✔ cohort and capture manifests preserve frozen authorities and require complete capture metadata (3.374652ms)
✔ observations, comparisons, preferences, and gate results stay exact and categorical (2.052256ms)
✔ checked-in protocol JSON is canonical, hash-bound, and every persisted public contract has a schema (2.110362ms)
✔ public schemas accept representative valid instances and reject representative invalid ones (5.093214ms)
✔ P6 sources, public protocol JSON, and public schemas forbid scalar score fields (4.18432ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 41.477141
```

Command:

```bash
git diff --check
```

Output:

```text
[no output]
```

### Scoped Boundary Note

- Task 1 does not derive camera formulas from cohort bounds. This round keeps the manifest contract exact for slot order, purposes, decimal vectors, FOV/settings authority, and the entry-eye offset conditional. Task 3 is responsible for deriving and testing formula values from cohort bounds.

### Commit

```text
4d5a2d34c45b3b75f3e99bcae105b41e0e504e1c
```

### Post-commit Verification

Command:

```bash
node --test --test-isolation=none test/playbookP6Contracts.test.js
git rev-parse HEAD
```

Output:

```text
✔ exports frozen literals and public errors without private detail leakage (1.412135ms)
✔ fixed request is exact, immutable, and canonical (4.04498ms)
✔ visual settings and camera manifests enforce fixed authority hashes and six-view ordering (1.578384ms)
✔ cohort and capture manifests preserve frozen authorities and require complete capture metadata (3.399585ms)
✔ observations, comparisons, preferences, and gate results stay exact and categorical (2.155941ms)
✔ checked-in protocol JSON is canonical, hash-bound, and every persisted public contract has a schema (2.411347ms)
✔ public schemas accept representative valid instances and reject representative invalid ones (5.147888ms)
✔ P6 sources, public protocol JSON, and public schemas forbid scalar score fields (3.389702ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 41.603048
4d5a2d34c45b3b75f3e99bcae105b41e0e504e1c
```

## Fix Round 3

### Changed Behavior

- Tightened runtime observation validation so `view_ids` must be a non-empty unique subset of the allowed screenshot view vocabulary.
- Kept runtime preference validation aligned with the approved spec by continuing to allow `reason_tags: []`, while still rejecting duplicates and unknown tags.
- Corrected the Fix Round 2 report wording so it no longer describes preference reason tags as non-empty.

### Covering Test Files

- `test/playbookP6Contracts.test.js`

### RED Evidence

Command:

```bash
node --test --test-isolation=none test/playbookP6Contracts.test.js
```

Output:

```text
✔ exports frozen literals and public errors without private detail leakage (1.07171ms)
✔ fixed request is exact, immutable, and canonical (0.636907ms)
✔ visual settings and camera manifests enforce fixed authority hashes and six-view ordering (0.989422ms)
✔ cohort and capture manifests preserve frozen authorities and require complete capture metadata (2.690472ms)
✖ observations, comparisons, preferences, and gate results stay exact and categorical (0.993833ms)
✔ checked-in protocol JSON is canonical, hash-bound, and every persisted public contract has a schema (2.220376ms)
✔ public schemas accept representative valid instances and reject representative invalid ones (5.280488ms)
✔ P6 sources, public protocol JSON, and public schemas forbid scalar score fields (3.929742ms)
ℹ tests 8
ℹ suites 0
ℹ pass 7
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 33.149384

✖ failing tests:

test at test/playbookP6Contracts.test.js:195:1
✖ observations, comparisons, preferences, and gate results stay exact and categorical (0.993833ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
```

This RED run showed runtime still accepted `observation.view_ids: []` before the validator repair.

### GREEN Evidence

Command:

```bash
node --test --test-isolation=none test/playbookP6Contracts.test.js
```

Output:

```text
✔ exports frozen literals and public errors without private detail leakage (1.233184ms)
✔ fixed request is exact, immutable, and canonical (0.760051ms)
✔ visual settings and camera manifests enforce fixed authority hashes and six-view ordering (1.173825ms)
✔ cohort and capture manifests preserve frozen authorities and require complete capture metadata (3.883135ms)
✔ observations, comparisons, preferences, and gate results stay exact and categorical (2.13294ms)
✔ checked-in protocol JSON is canonical, hash-bound, and every persisted public contract has a schema (1.890406ms)
✔ public schemas accept representative valid instances and reject representative invalid ones (5.617811ms)
✔ P6 sources, public protocol JSON, and public schemas forbid scalar score fields (4.262033ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 45.508938
```

Command:

```bash
git diff --check
```

Output:

```text
[no output]
```
