# Task 4 Report: Explainable Retriever And Query CLI

## Scope

- Added [src/construction/templates/templateExplainableRetriever.js](D:/PKU/Others/MC_CONSTRUCTION_AGENT/Minecraft-Constructing-Agents/.worktrees/stage-2-template-kb-v2/src/construction/templates/templateExplainableRetriever.js)
- Added [src/queryTemplateKnowledge.js](D:/PKU/Others/MC_CONSTRUCTION_AGENT/Minecraft-Constructing-Agents/.worktrees/stage-2-template-kb-v2/src/queryTemplateKnowledge.js)
- Added [test/templateExplainableRetriever.test.js](D:/PKU/Others/MC_CONSTRUCTION_AGENT/Minecraft-Constructing-Agents/.worktrees/stage-2-template-kb-v2/test/templateExplainableRetriever.test.js)
- Updated [package.json](D:/PKU/Others/MC_CONSTRUCTION_AGENT/Minecraft-Constructing-Agents/.worktrees/stage-2-template-kb-v2/package.json)

## TDD Record

### RED

Command:

```powershell
node --test test/templateExplainableRetriever.test.js
```

Observed failure:

- Exit code `1`
- `ERR_MODULE_NOT_FOUND`
- Missing module: `src/construction/templates/templateExplainableRetriever.js`

This matched the brief's expected initial failure.

### GREEN

Implemented:

- `ExplainableTemplateRetriever#run({ prompt, context, limit })`
- local scoring, token normalization, alias expansion, diversity selection, explanation generation
- `queryTemplateKnowledge({ argv, cwd, stdout, stderr })`
- `npm run query:templates`

## Verification

### Focused test run

Command:

```powershell
node --test test/templateExplainableRetriever.test.js
```

Result:

- Exit code `0`
- `3` tests passed

### Query smoke

Command:

```powershell
npm run query:templates -- "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
```

Result:

- Exit code `0`
- Printed `# Template references`
- Printed `8` ranked references from the repo KB

## Notes On Implementation

- The retriever filters rejected cases before scoring.
- Residential-interior prompts suppress arena interior teaching units in explanations.
- Prompt tokenization includes lightweight English/Chinese hint mapping so the CLI can retrieve from English-tagged KB data using Chinese prompts.
- Diversity selection prefers one top case per slot before backfilling to the requested limit.

## Self-Review

- The fixture-driven contract is satisfied exactly for source string, activation, ranking, and CLI output shape.
- The real-KB smoke run succeeded, but some returned `teaches` lines reflect noisy upstream `knowledge_units` content from the current KB rather than a formatting bug in this task's renderer.
- `package-lock.json` did not change and was left untouched.

## Commit

Planned commit message:

```text
feat: add explainable template retrieval
```
