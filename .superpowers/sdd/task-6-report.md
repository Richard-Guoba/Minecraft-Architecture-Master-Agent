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
