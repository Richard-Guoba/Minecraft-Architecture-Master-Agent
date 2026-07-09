# Task 5: Query CLI and Retrieval Evaluation

## What I implemented

- Added neural retrieval support to `src/queryTemplateKnowledge.js`.
- The CLI now supports `--neural`, loads the embedding index when requested, and prefers sibling `neural_labels.jsonl` when present.
- The CLI output now reports `mode` and `fallback` status.
- Created `src/evaluateTemplateRetrieval.js` with:
  - `DEFAULT_RETRIEVAL_EVAL_SET`
  - `evaluateTemplateRetrieval()`
  - `renderRetrievalEvalReport()`
  - `writeRetrievalEvalArtifacts()`
- Added the `evaluate:retrieval` npm script.
- Added retrieval evaluation tests and the neural CLI regression test.

## Tests run and results

- `node --test test/templateExplainableRetriever.test.js test/templateRetrievalEvaluation.test.js`
- `node --test test/templateEmbeddingIndex.test.js test/templateNeuralLabels.test.js test/templateNeuralRetriever.test.js test/templateExplainableRetriever.test.js test/templateRetrievalEvaluation.test.js`

Both runs passed.

## TDD Evidence

### RED

Command:

```powershell
node --test test/templateExplainableRetriever.test.js test/templateRetrievalEvaluation.test.js
```

Observed failures:

- `queryTemplateKnowledge CLI can print neural fusion references` failed because output did not include `mode: fusion`.
- `test/templateRetrievalEvaluation.test.js` failed with `ERR_MODULE_NOT_FOUND` for `src/evaluateTemplateRetrieval.js`.

### GREEN

Command:

```powershell
node --test test/templateEmbeddingIndex.test.js test/templateNeuralLabels.test.js test/templateNeuralRetriever.test.js test/templateExplainableRetriever.test.js test/templateRetrievalEvaluation.test.js
```

Result:

- `36` tests passed, `0` failed.

## Files changed

- `src/queryTemplateKnowledge.js`
- `src/evaluateTemplateRetrieval.js`
- `package.json`
- `test/templateExplainableRetriever.test.js`
- `test/templateRetrievalEvaluation.test.js`
- `.superpowers/sdd/task-5-report.md`

## Self-review findings

- The neural CLI path now preserves the existing explainable behavior when `--neural` is not supplied.
- The evaluation module uses the same retriever interfaces as the rest of Stage 5 and falls back to a built index when one is not supplied.
- The report output includes the prompt-level comparison tables and per-prompt sections required by the brief.

## Issues or concerns

- None noted from the implemented task scope.

## Fix: retrieval evaluation fallback safety

- Resolved the CLI wrapper so `npm run evaluate:retrieval` no longer aborts when the default `mc_templates/analysis/embedding_index.json` file is missing.
- Updated the query CLI usage text to document `--no-neural`.

### Fix TDD Evidence

#### RED

Command:

```powershell
node --test test/templateRetrievalEvaluation.test.js
```

Observed failure:

- `evaluate:retrieval CLI falls back when the default embedding index is missing` failed because `src/evaluateTemplateRetrieval.js` exited with status `1` when `mc_templates/analysis/embedding_index.json` was absent.

#### GREEN

Commands:

```powershell
node --test test/templateExplainableRetriever.test.js test/templateRetrievalEvaluation.test.js
node --test test/templateEmbeddingIndex.test.js test/templateNeuralLabels.test.js test/templateNeuralRetriever.test.js test/templateExplainableRetriever.test.js test/templateRetrievalEvaluation.test.js
```

Results:

- `14` tests passed, `0` failed in the focused Stage 5 slice.
- `38` tests passed, `0` failed in the broader relevant Stage 5 slice.
