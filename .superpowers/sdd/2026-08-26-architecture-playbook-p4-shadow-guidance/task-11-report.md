# Remediation Task 11 Report: Structurally Safe LLM Explanation Authority

## Outcome

Replaced the bypassable free-prose blacklist boundary with a strict reference-selection contract. The LLM can now select only canonical rule IDs and authoritative assessment references already exposed in the deterministic prompt packet. The wrapper maps every accepted selection back to the authoritative review and renders the public `Explanation` locally. No model-authored explanation prose or raw candidate field is copied into `explanation.json`.

The final public artifact shape remains unchanged: exact review hash, five ordered layer rows, 21 ordered rule/status/repair rows, `mode`, bounded `provider`, `status`, `error_code`, and `overall_unknowns`. The five managed artifact names, manifest/storage/CLI behavior, Level-A read-only boundary, deterministic review authority, and report behavior are unchanged.

## Root-cause investigation

The previous internal candidate duplicated public `layer_explanations`, `rule_explanations`, and `overall_unknowns`. `explainReview()` copied those model strings directly into the final artifact, and `validateExplanation()` attempted to reject unsafe semantics using phrase-specific regular expressions for coordinates, patches, scores, thresholds, block IDs, and identifier-like strings.

The hypothesis was: free prose is an unbounded semantic domain, so a lexical blacklist can recognize known spellings but cannot establish authority. Equivalent wording that omits a recognized keyword or delimiter will pass while carrying the same unauthorized claim. The reproduction confirmed the hypothesis:

```text
node test/playbookShadowExplanation.test.js
tests 23
pass 15
fail 8
```

Each alternate wording reached an `available` explanation under the old validator:

- `12, 64, -3`
- `Replace /architecture/volumes/0 with a wider mass.`
- `rate this 9 out of 10`
- `wider than 12 blocks`
- arbitrary invented natural-language prose
- an invented `/architecture/...` path

The direct `validateExplanation()` regression also failed with `Missing expected exception`, proving that the public validator was a second acceptance path for non-wrapper prose. Inspection of the prior candidate and public contracts showed the structural mismatch: the candidate was nominally constrained by exact row fields but its `explanation` values remained arbitrary strings.

## TDD evidence

### RED: reference-only contract and authority cases

After replacing the test fixture with the wished-for selection API and adding authority regressions, the old implementation produced:

```text
node test/playbookShadowExplanation.test.js
tests 29
pass 5
fail 24
```

The failures were behavior-specific:

- valid reference-only selection was `unavailable` instead of `available`;
- legacy prose candidates were still accepted or classified by blacklist semantics instead of exact-shape `LLM_OUTPUT_INVALID`;
- missing/added/reordered authority rows and hash/status/repair drift returned `LLM_OUTPUT_INVALID` instead of `LLM_AUTHORITY_VIOLATION` under the new contract;
- wrong-rule and wrong-layer references, duplicate/reordered subsets, missing/extra/reordered layer rows, invented references, and invalid overall unknown references all lacked the required reference-authority behavior;
- direct public validation still accepted non-wrapper prose.

The deterministic-bytes regression was tightened to require both calls to be `available`, preventing two identical unavailable fallbacks from satisfying the test.

### GREEN: case-by-case closure

The final focused command was:

```text
node --test --test-isolation=none \
  test/playbookShadowExplanation.test.js \
  test/playbookShadowContracts.test.js \
  test/playbookShadowEvaluation.test.js \
  test/playbookShadowRun.test.js
tests 54
pass 54
fail 0
```

It proves:

- all six original blacklist spellings and all six alternate phrasings degrade to unavailable and persist none of the raw text;
- malformed/legacy candidate shapes are `LLM_OUTPUT_INVALID`;
- valid reference-only candidates are accepted and wrapper-rendered;
- exact five-layer and 21-rule authority rows cannot be omitted, added, or reordered;
- status, repair, or review-hash drift is `LLM_AUTHORITY_VIOLATION`;
- selected rule IDs must belong to their layer;
- observation, missing-signal, and unknown-ID selections must belong to their corresponding rule;
- per-rule and overall selections are unique, bounded, and canonically ordered;
- invented prose, coordinates, patches, scores, thresholds, paths, block IDs, identifiers, and unknown IDs cannot enter a rendered explanation;
- the same validated selection produces identical bytes;
- unselected prompt data is not persisted;
- bounded prompt references are resolved back to authoritative review facts before local rendering;
- `validateExplanation()` rejects arbitrary non-wrapper LLM prose;
- invalid output preserves review and prompt bytes and contains no raw candidate text;
- mock mode creates no client and remains deterministic.

## Exact internal candidate schema

The sole accepted candidate is:

```text
{
  review_hash,
  layer_selections: [
    { layer, selected_rule_ids }
  ],
  rule_selections: [
    {
      rule_id,
      status,
      repair_operation_id,
      selected_observations,
      selected_missing_signals,
      selected_unknown_ids
    }
  ],
  overall_unknown_references
}
```

Contract bounds and authority rules:

- exactly five layer rows in `brief / massing / structure / roof / facade` order;
- at most 21 selected rule references per layer, further restricted to the canonical subset of that layer's assessment IDs;
- exactly 21 rule rows in review order with immutable rule ID, status, and repair ID;
- at most 12 selected references per rule field, each a unique canonical subset of the corresponding prompt/review field;
- at most 64 overall unknown references, as a unique canonical subset of unknown IDs then missing signals from authoritative `unknown` assessments;
- exact top-level and nested fields, with no explanation text field.

`prompt-packet.json.output_contract` publishes those exact candidate, layer-row, and rule-row field lists plus the three bounds. Prompt rule rows now include authoritative `design_layer` and bounded `unknown_ids`, allowing the model to select only data it was actually shown. Prompt validation also cross-checks every rule ID, layer, status, repair, observation, missing signal, and unknown ID against the review before invocation.

## Deterministic rendering and final validation

`validateLlmCandidate()` converts selected prompt values to canonical indexes and then resolves those indexes against the authoritative review. `explainReview()` renders layer and rule text from that normalized selection only. Candidate objects, provider exceptions, unselected prompt facts, and raw model text are never persisted.

Available LLM layer text has the fixed local form `<layer>：rule_ids=<canonical JSON array>`. Available LLM rule text has the fixed local form `<status>：references=<canonical JSON object>`. `validateExplanation()` parses and revalidates those local forms as canonical authoritative subsets. Mock text retains its previous deterministic local templates and is now checked for exact equality against a locally recomputed mock explanation, so changing `mode` cannot reopen an arbitrary-prose path.

The previous coordinate/patch/score/threshold/identifier regexes were removed. The informational `authority.prohibited_additions` prompt data remains defense in depth, but correctness does not depend on it.

## Compatibility effects

- Public `Explanation`, manifest, storage, CLI, report, and five-artifact topology are unchanged.
- Deterministic `review.json` authority and its 21 rows are unchanged.
- `mock` still creates no client; its `explanation.json` rendering is unchanged and byte-stable for fixed input.
- `prompt-packet.json` intentionally changes because its rule rows now expose `design_layer`/`unknown_ids` and its `output_contract` accurately describes reference selection.
- LLM clients or fixtures that return the former prose candidate now safely degrade with `LLM_OUTPUT_INVALID`; they must adopt the new selection schema.
- No dependency, coordinate, patch, block-generation, score, threshold, generator, visual-input, or mutation capability was added.

The public P4 design and evidence report were corrected to state that the model selects references and the wrapper renders text locally.

## Verification

Exact 11-file P4 suite, run with required subprocess permission:

```text
node --test --test-isolation=none \
  test/playbookShadowContracts.test.js \
  test/playbookShadowCorpusProjection.test.js \
  test/playbookShadowCheckerRegistry.test.js \
  test/playbookShadowCheckers.test.js \
  test/playbookShadowEvaluation.test.js \
  test/playbookShadowExplanation.test.js \
  test/playbookShadowStorage.test.js \
  test/playbookShadowRun.test.js \
  test/architecturePlaybookShadowCli.test.js \
  test/playbookShadowGate.test.js \
  test/docsProjectStatus.test.js
tests 180
pass 180
fail 0
```

The unprivileged run reproduced the known managed-sandbox CLI child-process restriction in `top-level CLI emits only a safe stable error code`; the same exact command passed with the required subprocess permission.

Dependency gate:

```text
node --test --test-isolation=none test/playbookShadowGate.test.js
tests 27
pass 27
fail 0
```

Managed P3 corpus gate:

```text
npm run playbook:manual -- check
playbook_status=current
playbook_version=0.1.0
reviewed_rule_count=21
core_procedure_count=15
case_pattern_count=6
artifact_count=5
managed_artifact_drift_count=0
```

Full repository regression, run with required subprocess permission. The normal `npm test` reporter completed, and a final compact reporter run preserved the process exit through `pipefail` while counting one dot per test:

```text
npm test -- --test-reporter=dot
tests 1027
exit 0
```

## Self-review

The final diff was checked against every Task 11 requirement. Mutation review confirmed that the tests fail for a restored prose candidate, direct candidate forwarding, missing wrapper rendering, wrong-rule or wrong-layer lookup, removed uniqueness/order checks, authority-row drift, unvalidated overall unknowns, raw invalid-candidate retention, mock client creation, prompt schema drift, and a reopened direct `validateExplanation()` prose path.

No unrelated source or runtime output was added. `git diff --check` passes, and `git ls-files out .local/architecture-playbook` remains empty.

## Concerns

The internal provider candidate contract is intentionally breaking: any external fixture or configured provider prompt that still emits free-form explanation rows will degrade safely until updated to the published reference-selection schema. No remaining safety concern was found within the requested boundary.

---

## Fix round 1: exact public/wrapper parity and bounded rendering

### Findings and root-cause hypothesis

The first implementation closed the free-prose boundary but left three structural mismatches:

1. Candidate-wide overall unknowns were chosen from the first 12 prompt-exposed values per field, while `validateExplanation()` accepted the larger review-wide unknown set. A thirteenth missing signal therefore existed in the public validator's authority universe even though the provider could not select it.
2. Public rule text was parsed and subset-checked, but was not reconstructed with the wrapper renderer. Canonical JSON bytes alone do not impose object key order, so a reversed-key object could pass.
3. Candidate values were bounded in the prompt, then resolved to review strings as long as 2,048 code points and embedded in one rule explanation. Consequently, a valid selection could exceed the final 2,048-code-point text limit and degrade.

The hypothesis was that all three defects came from representing the public explanation with resolved strings while independently reimplementing candidate authority in the public validator. The correction therefore needed one bounded normalized representation and exact re-rendering, not more lexical filtering.

### RED evidence

Each narrow regression failed against the prior implementation for its intended reason:

```text
node --test --test-isolation=none \
  --test-name-pattern='outside the prompt-bounded universe' \
  test/playbookShadowExplanation.test.js
tests 1; pass 0; fail 1
Missing expected exception

node --test --test-isolation=none \
  --test-name-pattern='non-canonical rendered rule key order' \
  test/playbookShadowExplanation.test.js
tests 1; pass 0; fail 1
Missing expected exception

node --test --test-isolation=none \
  --test-name-pattern='maximum-length review fact' \
  test/playbookShadowExplanation.test.js
tests 1; pass 0; fail 1
actual 'unavailable'; expected 'available'

node --test --test-isolation=none \
  --test-name-pattern='clamps untrusted prose' \
  test/playbookShadowEvaluation.test.js
tests 1; pass 0; fail 1
published row/reference/render contracts were absent
```

During implementation, comparison of the prompt and review universes exposed one adjacent parity case: two distinct review strings can truncate to the same 800-code-point prompt value, so the later index is not provider-selectable. Its regression also failed RED with `Missing expected exception` before the public validator adopted the same selectable-index set.

### Corrected contracts

The provider candidate schema remains reference-only and unchanged. `output_contract` now strictly publishes and validates:

- `row_contract`: mandatory layer count 5 and exact layer order; mandatory rule count 21 and exact rule order; immutable `rule_id`, `status`, and `repair_operation_id` row fields;
- `reference_contract`: uniqueness, canonical ordering, same-layer rule membership, same-rule prompt-field membership, prompt-exposed unknown-assessment membership, and exact `rule_order / unknown_ids / missing_signals` overall ordering;
- `render_contract`: `authoritative-reference-indexes.v1` with a 2,048-code-point explanation maximum.

The system instruction now states the five/21 row requirements and the published uniqueness, canonical-order, membership, and overall-unknown constraints explicitly.

After candidate validation, local normalized layer/rule selections contain only canonical zero-based indexes into their bounded authoritative reference lists. The wrapper renders fixed forms:

```text
<layer>：rule_indexes=<canonical JSON array>
<status>：reference_indexes={"observations":[],"missing_signals":[],"unknown_ids":[]}
```

The fixed row/field maxima make every valid index rendering far shorter than 2,048 code points, independent of resolved review-string length. The public validator parses these forms, validates index reachability against the same first-12 prompt universe (including truncation aliases), invokes the same render functions, and requires exact text equality. Public overall unknowns are validated against the same prompt-bounded unknown universe as candidate validation, rather than all review unknowns. Mock templates and final authority rows/artifacts are unchanged.

No free-prose blacklist was added or restored.

### GREEN and verification evidence

Focused explanation/contracts/evaluation/run suites:

```text
node --test --test-isolation=none \
  test/playbookShadowExplanation.test.js \
  test/playbookShadowContracts.test.js \
  test/playbookShadowEvaluation.test.js \
  test/playbookShadowRun.test.js
tests 58
pass 58
fail 0
```

Exact 11-file P4 suite with CLI subprocess permission:

```text
tests 184
pass 184
fail 0
```

The first sandboxed P4 run reproduced the known CLI subprocess restriction only (`top-level CLI emits only a safe stable error code`: empty child stderr); the permissioned exact rerun passed 184/184.

Dependency gate:

```text
node --test --test-isolation=none test/playbookShadowGate.test.js
tests 27
pass 27
fail 0
```

Managed P3 check:

```text
npm run playbook:manual -- check
playbook_status=current
playbook_version=0.1.0
reviewed_rule_count=21
core_procedure_count=15
case_pattern_count=6
artifact_count=5
managed_artifact_drift_count=0
```

Full repository regression with subprocess permission and the dot reporter:

```text
npm test -- --test-reporter=dot
dot_count 1029
exit 0
```

### Fix-round self-review and concerns

The diff was reviewed for wrapper/public authority symmetry, prompt truncation and duplicate aliases, zero/negative/non-integer/reordered indexes, canonical object key order, five/21 row invariants, field membership, overall ordering, unavailable degradation, mock stability, and output/report claim accuracy. `git diff --check` passes. No generated run output is tracked.

The public LLM explanation text intentionally changes from resolved reference strings to bounded reference indexes; its outer `Explanation` schema, five authority layer rows, 21 authority rule rows, mock rendering, artifacts, manifest/storage/CLI contracts, deterministic review, and Level-A boundary remain unchanged. No remaining safety concern was found within the requested boundary.
