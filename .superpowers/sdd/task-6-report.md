# Task 6: Runtime Opt-In Fusion Retrieval

## What I implemented

- Added runtime `neuralRetrieval` opt-in handling to `TemplateKnowledgeAgent`.
- Kept the default runtime behavior rule-only, even when Stage 5 artifacts exist.
- Wired neural fusion retrieval through `runConstructionWorkflow`, `runPipeline`, `runCandidatePipeline`, and the CLI.
- Added CLI flags `--neural-retrieval` and `--no-neural-retrieval`.
- Updated the run report so the template memory section always prints a `Retrieval mode:` line, including fallback state.
- Loaded optional `embedding_index.json` and `neural_labels.jsonl` in the agent without breaking fallback behavior.
- Added focused tests for agent-level default-vs-opt-in retrieval behavior and pipeline report/runtime propagation.

## Tests run and results

- `node --test test/templateKnowledgeAgent.test.js test/criticPipeline.test.js`
  - RED: `4` passed, `2` failed.
  - GREEN: `6` passed, `0` failed.

## TDD Evidence

### RED

Command:

```powershell
node --test test/templateKnowledgeAgent.test.js test/criticPipeline.test.js
```

Output:

```text
✔ pipeline writes critic council artifacts and blueprint metadata by default
✔ pipeline suppresses critic council artifacts when critics are disabled
✔ candidate pipeline passes critic options into candidate runs
✖ pipeline keeps neural retrieval opt-in and reports fallback-safe mode
✔ TemplateKnowledgeAgent uses rule-only retrieval by default even when embedding index exists
✖ TemplateKnowledgeAgent uses neural fusion when explicitly enabled

tests 6
pass 4
fail 2
```

Observed failures:

- `pipeline keeps neural retrieval opt-in and reports fallback-safe mode` failed because the run report did not include `Retrieval mode:`.
- `TemplateKnowledgeAgent uses neural fusion when explicitly enabled` failed because the retrieval source remained `template-explainable-retriever-v1`.

### GREEN

Command:

```powershell
node --test test/templateKnowledgeAgent.test.js test/criticPipeline.test.js
```

Output:

```text
✔ pipeline writes critic council artifacts and blueprint metadata by default
✔ pipeline suppresses critic council artifacts when critics are disabled
✔ candidate pipeline passes critic options into candidate runs
✔ pipeline keeps neural retrieval opt-in and reports fallback-safe mode
✔ TemplateKnowledgeAgent uses rule-only retrieval by default even when embedding index exists
✔ TemplateKnowledgeAgent uses neural fusion when explicitly enabled

tests 6
pass 6
fail 0
```

## Files changed

- `src/construction/agents/templateKnowledgeAgent.js`
- `src/construction/workflow.js`
- `src/pipeline.js`
- `src/index.js`
- `test/templateKnowledgeAgent.test.js`
- `test/criticPipeline.test.js`
- `.superpowers/sdd/task-6-report.md`

## Self-review findings

- Default runtime remains rule-only unless `neuralRetrieval` is explicitly enabled.
- Neural retrieval still falls back safely when Stage 5 artifacts are missing or unusable because `NeuralTemplateRetriever` preserves rule-based output with fallback warnings.
- Mock mode remains intact because the wiring is local-only and does not add any live API dependency.

## Issues or concerns

- None within the scoped Task 6 requirements.

## Reviewer follow-up fix

### What I fixed

- Surfaced malformed `neural_labels.jsonl` as an inspectable neural-runtime fallback instead of silently replacing it with `[]`.
- When `neuralRetrieval` is enabled and neural labels are invalid, `TemplateKnowledgeAgent` now returns rule fallback metadata with a visible warning in `retrieval_explanation.warnings`.
- Preserved rule-only default behavior when neural retrieval is not enabled.
- Strengthened Task 6 coverage so it now proves:
  - fusion activates with valid runtime artifacts,
  - missing embedding index falls back with visible warnings,
  - invalid neural labels fall back with visible warnings,
  - explicit disable keeps rule-only behavior even when valid neural artifacts exist.

### Reviewer fix TDD Evidence

#### RED

Command:

```powershell
node --test test/templateKnowledgeAgent.test.js test/criticPipeline.test.js
```

Output:

```text
✔ pipeline writes critic council artifacts and blueprint metadata by default
✔ pipeline suppresses critic council artifacts when critics are disabled
✔ candidate pipeline passes critic options into candidate runs
✖ pipeline activates fusion retrieval when neural opt-in is enabled and valid artifacts exist
✔ pipeline reports neural fallback mode when embedding artifacts are absent
✔ pipeline keeps rule-only retrieval when neural opt-in is explicitly disabled
✔ TemplateKnowledgeAgent uses rule-only retrieval by default even when embedding index exists
✔ TemplateKnowledgeAgent uses neural fusion when explicitly enabled
✔ TemplateKnowledgeAgent falls back when neural retrieval is enabled without an embedding index
✖ TemplateKnowledgeAgent surfaces invalid neural label artifacts during opted-in neural retrieval
✔ TemplateKnowledgeAgent keeps rule-only retrieval when neural retrieval is explicitly disabled

tests 11
pass 9
fail 2
```

Observed failures:

- The invalid neural-label artifact path still returned fusion instead of a visible fallback.
- The strengthened pipeline fusion test exposed that the fixture-backed runtime assertion needed artifact-consistent labels and index inputs to prove real fusion activation.

#### GREEN

Command:

```powershell
node --test test/templateKnowledgeAgent.test.js test/criticPipeline.test.js
```

Output:

```text
✔ pipeline writes critic council artifacts and blueprint metadata by default
✔ pipeline suppresses critic council artifacts when critics are disabled
✔ candidate pipeline passes critic options into candidate runs
✔ pipeline activates fusion retrieval when neural opt-in is enabled and valid artifacts exist
✔ pipeline reports neural fallback mode when embedding artifacts are absent
✔ pipeline keeps rule-only retrieval when neural opt-in is explicitly disabled
✔ TemplateKnowledgeAgent uses rule-only retrieval by default even when embedding index exists
✔ TemplateKnowledgeAgent uses neural fusion when explicitly enabled
✔ TemplateKnowledgeAgent falls back when neural retrieval is enabled without an embedding index
✔ TemplateKnowledgeAgent surfaces invalid neural label artifacts during opted-in neural retrieval
✔ TemplateKnowledgeAgent keeps rule-only retrieval when neural retrieval is explicitly disabled

tests 11
pass 11
fail 0
```
