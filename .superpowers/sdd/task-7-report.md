# Task 7 Report

## What you changed in docs/artifacts

- Updated `README.md`:
  - Added the Stage 5 status bullet under `Current Status`.
  - Added Stage 5 retrieval/evaluation/mock commands to the main command block.
- Updated `docs/roadmap.md`:
  - Added the Stage 5 MVP status paragraph under `### Stage 5：神经检索和自动标注`.
- Updated `docs/index.html`:
  - Changed the Stage 5 roadmap card from `Next` to `In progress`.
  - Replaced the Stage 5 summary copy with the artifacts-first neural assist wording from the brief.
- Intentionally regenerated/reviewed Stage 5 analysis artifacts:
  - `mc_templates/analysis/neural_labels.jsonl`
  - `mc_templates/analysis/embedding_index.json`
  - `mc_templates/analysis/retrieval_eval_set.json`
  - `mc_templates/analysis/retrieval_eval_report.md`
- Reverted unrelated tracked analysis artifact churn produced by `npm run analyze:templates -- --offline` so the commit stays scoped to the brief.

## Verification commands run and results

1. Focused Stage 5 tests

```powershell
node --test test/templateNeuralLabels.test.js test/templateEmbeddingIndex.test.js test/templateNeuralRetriever.test.js test/templateExplainableRetriever.test.js test/templateRetrievalEvaluation.test.js test/templateKnowledgeAgent.test.js test/templateKnowledgeBaseV2.test.js test/criticPipeline.test.js
```

Result:
- Exit code `0`
- `61` tests passed, `0` failed

2. Full test suite

```powershell
npm test
```

Result:
- Exit code `0`
- `269` tests passed, `0` failed

3. Offline analysis smoke

```powershell
npm run analyze:templates -- --offline
```

Result:
- Exit code `0`
- Output included `Stage 5 neural labels: 64`
- Output included `Stage 5 embedding cases: 64`
- Confirmed:
  - `mc_templates/analysis/neural_labels.jsonl`
  - `mc_templates/analysis/embedding_index.json`

4. Query smoke

Command from brief:

```powershell
npm run query:templates -- --neural "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
```

Observed result:
- Exit code `1`
- CLI printed usage because `src/queryTemplateKnowledge.js` parses `--neural` as consuming the next token as its value, so the prompt was not left in the positional argument list under this invocation shape.

Equivalent successful smoke run:

```powershell
node src/queryTemplateKnowledge.js --neural true "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
```

Result:
- Exit code `0`
- Output included `mode: fusion`

5. Retrieval evaluation smoke

```powershell
npm run evaluate:retrieval
```

Result:
- Exit code `0`
- Output included `Retrieval evaluation wrote`
- Confirmed:
  - `mc_templates/analysis/retrieval_eval_report.md`
  - `mc_templates/analysis/retrieval_eval_set.json`
- Generated report summary table shows `rule-only-fallback` for all 10 prompts and includes stale/invalid vector plus `label_record_hash` warnings.

6. Runtime smoke with Stage 5 opt-in

```powershell
npm start -- --mode mock --seed 7101 --neural-retrieval "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
```

Result:
- Exit code `0`
- Output directory: `out/2026-07-09-214457458`
- Confirmed artifacts:
  - `blueprint.json`
  - `run_report.md`
  - `architecture_scorecard.json`
  - `architect_datapack/`
- `run_report.md` includes `Retrieval mode: fusion`

7. Runtime smoke without Stage 5 opt-in

```powershell
npm start -- --mode mock --seed 7101 --no-neural-retrieval "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
```

Result:
- Exit code `0`
- Output directory: `out/2026-07-09-214457416`
- Confirmed artifacts:
  - `blueprint.json`
  - `run_report.md`
  - `architecture_scorecard.json`
  - `architect_datapack/`
- `run_report.md` includes `Retrieval mode: rule-only`

## Generated artifacts intentionally committed, if any

- `mc_templates/analysis/neural_labels.jsonl`
- `mc_templates/analysis/embedding_index.json`
- `mc_templates/analysis/retrieval_eval_set.json`
- `mc_templates/analysis/retrieval_eval_report.md`

## Files changed

- `README.md`
- `docs/roadmap.md`
- `docs/index.html`
- `mc_templates/analysis/neural_labels.jsonl`
- `mc_templates/analysis/embedding_index.json`
- `mc_templates/analysis/retrieval_eval_set.json`
- `mc_templates/analysis/retrieval_eval_report.md`

## Self-review findings

- Doc edits match the wording and file targets from the task brief.
- The commit scope was trimmed back to docs plus the four Stage 5 artifacts named in the brief.
- Verification evidence is fresh for this task and covers focused tests, full tests, offline analysis, retrieval query/eval, and runtime smokes.

## Issues or concerns

- The query smoke command in the brief currently fails as written because `src/queryTemplateKnowledge.js` treats `--neural` as a key that consumes the next token as its value. An equivalent command with `--neural true` succeeds and returns `mode: fusion`.
- `npm run evaluate:retrieval` succeeds and writes the requested artifacts, but the generated report shows `rule-only-fallback` across the evaluation set with stale/invalid vector and `label_record_hash` warnings. This differs from the direct query smoke and the `--neural-retrieval` runtime smoke, both of which reached fusion mode.

## Follow-up Fix (2026-07-09)

### Changes made

- Updated `src/queryTemplateKnowledge.js` argument parsing so:
  - `--neural` and `--no-neural` are treated as boolean flags.
  - Value-taking flags remain `--knowledge-base`, `--embedding-index`, `--style`, `--typology`, and `--limit`.
  - Prompt text immediately following `--neural` remains positional prompt input.
- Updated `src/evaluateTemplateRetrieval.js` so the CLI loads sibling `neural_labels.jsonl` beside the selected embedding index when available and passes the parsed records into evaluation.
- Added regression coverage for:
  - `queryTemplateKnowledge({ argv: ['--neural', '<prompt>'] })`
  - evaluation CLI reading matching `embedding_index.json` plus sibling `neural_labels.jsonl` and staying in fusion mode

### Follow-up verification

1. Targeted regression tests

```powershell
node --test test/templateExplainableRetriever.test.js test/templateRetrievalEvaluation.test.js
```

Result:
- Exit code `0`
- `16` tests passed, `0` failed

2. Exact query smoke from the brief

```powershell
npm run query:templates -- --neural "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
```

Result:
- Exit code `0`
- Output included `mode: fusion`

3. Retrieval evaluation smoke after label loading fix

```powershell
npm run evaluate:retrieval
```

Result:
- Exit code `0`
- Output included `Retrieval evaluation wrote`
- Regenerated `mc_templates/analysis/retrieval_eval_report.md` now shows `fusion` for all 10 prompts in the summary table
- The report no longer includes blanket stale-vector or `label_record_hash` fallback warnings when matching artifacts exist

### Remaining concerns after follow-up

- None from the original two Task 7 concerns.
