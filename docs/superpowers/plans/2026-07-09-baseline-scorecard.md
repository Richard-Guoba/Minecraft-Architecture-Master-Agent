# Baseline Benchmark and Architecture Scorecard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every single construction run emit a reusable `architecture_scorecard.json`, surface the scorecard in `run_report.md`, and add a fixed 10-prompt baseline benchmark suite for long-term Architecture Master comparisons.

**Architecture:** Reuse the existing `ConstructionEvaluationAgent` instead of inventing a second scoring system. The workflow will run evaluation after blueprint validation, write a compact scorecard artifact during export, and include scorecard highlights in the Markdown report. A new prompt suite module will define the frozen Stage 0 baseline prompts separately from the broader evaluation suites.

**Tech Stack:** Node.js ESM, built-in `node:test`, existing construction workflow, existing `ConstructionEvaluationAgent`, existing JSON artifact helpers.

## Global Constraints

- Preserve the current `construction_method_v1` pipeline.
- Keep default generation runnable without API keys in `--mode mock`.
- Do not make Python required for normal generation.
- Target Minecraft Java 1.21 / 1.21.1 and datapack `pack_format: 48`.
- Use TDD: write failing tests before production code.
- Do not commit `out/`, `.tmp/`, `.env`, generated datapacks, or local secrets.

---

### Task 1: Scorecard Artifact and Report Integration

**Files:**
- Modify: `src/construction/workflow.js`
- Modify: `test/pipeline.test.js`

**Interfaces:**
- Consumes: `new ConstructionEvaluationAgent().run(resultOrBlueprintLikeObject)` from `src/construction/agents/constructionEvaluationAgent.js`
- Produces: `result.architectureScorecard`, `result.blueprint.architectureScorecard`, `result.artifacts.architectureScorecard`
- Produces artifact: `<outputDir>/architecture_scorecard.json`

- [ ] **Step 1: Write the failing test**

Add assertions to `test/pipeline.test.js` inside `runs the construction-method workflow as the single active pipeline`:

```js
assert.ok(result.architectureScorecard);
assert.equal(result.architectureScorecard.source, 'local-construction-evaluation-agent');
assert.equal(result.architectureScorecard.scorecard.maxScore, 100);
assert.ok(result.architectureScorecard.scorecard.dimensions.length > 10);
assert.ok(result.blueprint.architectureScorecard);
assert.equal(result.blueprint.architectureScorecard.totalScore, result.architectureScorecard.scorecard.totalScore);
assert.ok(result.artifacts.architectureScorecard.endsWith('architecture_scorecard.json'));

const scorecard = JSON.parse(await fs.readFile(result.artifacts.architectureScorecard, 'utf8'));
assert.equal(scorecard.source, 'local-construction-evaluation-agent');
assert.equal(scorecard.scorecard.maxScore, 100);
assert.ok(scorecard.metrics.rooms >= 3);
assert.ok(scorecard.weakChecks);

assert.match(report, /建筑大师评分/);
assert.match(report, /总分：/);
assert.match(report, /基础分：/);
assert.match(report, /高级分：/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/pipeline.test.js`

Expected: FAIL because `result.architectureScorecard`, `result.artifacts.architectureScorecard`, and the report section do not exist yet.

- [ ] **Step 3: Implement minimal production code**

In `src/construction/workflow.js`:

1. Import `ConstructionEvaluationAgent`.
2. After `validateBlueprint(blueprint)`, create `const architectureScorecard = new ConstructionEvaluationAgent().run({ ... })`.
3. Attach a compact summary to `blueprint.architectureScorecard`.
4. Pass the full evaluation to `exportArtifacts`.
5. Write `<outputDir>/architecture_scorecard.json`.
6. Add `architectureScorecard` to returned artifacts and returned workflow result.
7. Render a new `## 建筑大师评分` section in `run_report.md`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/pipeline.test.js`

Expected: PASS.

---

### Task 2: Frozen Stage 0 Benchmark Prompt Suite

**Files:**
- Create: `src/construction/baselineBenchmarkSuite.js`
- Modify: `test/constructionEvaluationAgent.test.js`

**Interfaces:**
- Produces: `BASELINE_BENCHMARK_PROMPTS`, an array of 10 prompt records `{ id, seed, focus, prompt }`

- [ ] **Step 1: Write the failing test**

Add to `test/constructionEvaluationAgent.test.js`:

```js
import { BASELINE_BENCHMARK_PROMPTS } from '../src/construction/baselineBenchmarkSuite.js';

test('baseline benchmark suite freezes ten Architecture Master prompts', () => {
  const ids = new Set(BASELINE_BENCHMARK_PROMPTS.map((item) => item.id));
  const seeds = new Set(BASELINE_BENCHMARK_PROMPTS.map((item) => item.seed));
  const focusTags = new Set(BASELINE_BENCHMARK_PROMPTS.flatMap((item) => item.focus));

  assert.equal(BASELINE_BENCHMARK_PROMPTS.length, 10);
  assert.equal(ids.size, 10);
  assert.equal(seeds.size, 10);
  assert.ok(focusTags.has('visual-composition'));
  assert.ok(focusTags.has('space-planning'));
  assert.ok(focusTags.has('site-integration'));
  assert.ok(focusTags.has('creative-narrative'));
  assert.ok(BASELINE_BENCHMARK_PROMPTS.every((item) => item.prompt.length >= 35));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/constructionEvaluationAgent.test.js`

Expected: FAIL because `baselineBenchmarkSuite.js` does not exist.

- [ ] **Step 3: Implement minimal production code**

Create `src/construction/baselineBenchmarkSuite.js` with 10 fixed prompts:

1. modern-waterfront-villa
2. european-manor-courtyard
3. japanese-tea-house-water-garden
4. medieval-tavern-home
5. gothic-observation-tower
6. alpine-slope-lodge
7. coastal-sunset-retreat
8. chinese-courtyard-house
9. fantasy-wizard-tower
10. small-village-cluster

Each prompt must include a stable seed and focus tags covering visual composition, space planning, site integration, and creative narrative.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/constructionEvaluationAgent.test.js`

Expected: PASS.

---

### Task 3: Scorecard Smoke Effect Report

**Files:**
- No source file changes required unless smoke testing reveals an issue.

**Interfaces:**
- Consumes: `npm start -- --mode mock --seed 7101 "prompt"`
- Produces: a real output directory with `architecture_scorecard.json` and `run_report.md`

- [ ] **Step 1: Run a representative baseline prompt**

Run:

```powershell
npm start -- --mode mock --seed 7101 "建一个湖边现代两层别墅，宽31深21，大玻璃窗，开放客厅，厨房，三间卧室，书房，面向湖景的露台，场地要有水边步道和前景花园。"
```

Expected: command exits `0` and prints an `out/<timestamp>` directory.

- [ ] **Step 2: Inspect scorecard**

Run:

```powershell
Get-Content <outputDir>\architecture_scorecard.json -Raw
```

Expected: JSON includes `scorecard.totalScore`, `scorecard.baseScore`, `scorecard.advancedScore`, `metrics`, `weakChecks`, and `redFlags`.

- [ ] **Step 3: Inspect report**

Run:

```powershell
Select-String -Path <outputDir>\run_report.md -Pattern "建筑大师评分|总分|基础分|高级分"
```

Expected: report contains the scorecard summary lines.

---

### Task 4: Full Verification and Commit

**Files:**
- Modify only files changed by Tasks 1-2.

**Interfaces:**
- Verifies: full `npm test`
- Commits: scorecard and baseline suite work

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: all tests pass with `0` failures.

- [ ] **Step 2: Check git status**

Run: `git status --short`

Expected: only intentional source, test, and plan files are changed.

- [ ] **Step 3: Commit**

Run:

```powershell
git add docs/superpowers/plans/2026-07-09-baseline-scorecard.md src/construction/workflow.js src/construction/baselineBenchmarkSuite.js test/pipeline.test.js test/constructionEvaluationAgent.test.js
git commit -m "feat: emit architecture scorecards"
```

Expected: commit succeeds.
