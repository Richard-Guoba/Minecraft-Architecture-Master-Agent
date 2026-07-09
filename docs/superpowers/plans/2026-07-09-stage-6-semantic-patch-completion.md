# Stage 6 Semantic Patch Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic Stage 6 semantic voxel patch dataset and completion layer for roof, facade, interior, and courtyard details.

**Architecture:** Add two focused Node.js ESM modules. `templateSemanticPatchDataset.js` turns Template KB v2 cases and Stage 5 labels into stable semantic patch records. `templateSemanticPatchCompleter.js` selects and repairs patches without mutating the main Minecraft generation pipeline.

**Tech Stack:** Node.js 20+ ESM, built-in `node:test`, built-in `fs/path`, existing Template KB v2 and Stage 5 label shapes, no Python, no live model calls.

## Global Constraints

- Runtime generation must remain deterministic and safe without API keys.
- Stage 6 MVP must not alter datapack output by default.
- Patch completion must be inspectable and fallback-safe.
- The MVP must cover `roof`, `facade`, `interior`, and `courtyard` categories.
- Every semantic voxel must carry evidence.
- No raw schematic block arrays are required in this first slice.

---

## File Structure

- Create `src/construction/templates/templateSemanticPatchDataset.js`
  - Defines Stage 6 dataset constants, patch category helpers, dataset construction, JSONL rendering, and optional artifact writing.

- Create `src/construction/templates/templateSemanticPatchCompleter.js`
  - Defines completion constants, patch scoring, context token matching, and post-completion conflict repair.

- Create `test/templateSemanticPatchDataset.test.js`
  - Verifies four-category dataset construction, stable ids, evidence, and JSONL parseability.

- Create `test/templateSemanticPatchCompleter.test.js`
  - Verifies selection, scoring, repair behavior, and fallback-safe inactive results.

---

### Task 1: Semantic Patch Dataset

**Files:**
- Create: `src/construction/templates/templateSemanticPatchDataset.js`
- Test: `test/templateSemanticPatchDataset.test.js`

**Interfaces:**
- Consumes: Template KB v2 cases with `identity`, `tags`, `knowledge_units`, `retrieval`, and `risk_controls`.
- Consumes: optional Stage 5 neural label records with `suggested_tags` and `suggested_learning_areas`.
- Produces:
  - `PATCH_DATASET_SOURCE`
  - `PATCH_DATASET_SCHEMA_VERSION`
  - `PATCH_CATEGORIES`
  - `buildSemanticVoxelPatchDataset({ knowledgeBase, neuralLabels, generatedAt })`
  - `semanticPatchDatasetJsonl(dataset)`
  - `writeSemanticVoxelPatchDatasetArtifact({ outputDir, knowledgeBase, neuralLabels, generatedAt })`

- [x] **Step 1: Write the failing test**

Create `test/templateSemanticPatchDataset.test.js` with assertions for:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PATCH_CATEGORIES,
  buildSemanticVoxelPatchDataset,
  semanticPatchDatasetJsonl
} from '../src/construction/templates/templateSemanticPatchDataset.js';

test('semantic patch dataset builds all four Stage 6 categories from knowledge cases', () => {
  const dataset = buildSemanticVoxelPatchDataset({
    knowledgeBase: knowledgeBaseFixture(),
    neuralLabels: neuralLabelsFixture(),
    generatedAt: '2026-07-09T00:00:00.000Z'
  });

  assert.equal(dataset.source, 'stage6-semantic-voxel-patch-dataset-v1');
  assert.equal(dataset.schema_version, 1);
  assert.deepEqual(dataset.categories, PATCH_CATEGORIES);
  assert.deepEqual([...new Set(dataset.patches.map((patch) => patch.category))].sort(), PATCH_CATEGORIES);
  assert.equal(dataset.patch_count, dataset.patches.length);
  assert.ok(dataset.patches.every((patch) => patch.semantic_voxels.length > 0));
  assert.ok(dataset.patches.every((patch) => patch.semantic_voxels.every((voxel) => voxel.evidence.length > 0)));
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test test/templateSemanticPatchDataset.test.js
```

Expected: FAIL because `templateSemanticPatchDataset.js` does not exist.

- [x] **Step 3: Implement the dataset module**

Implement deterministic category detection and semantic voxel templates:

```js
export const PATCH_DATASET_SOURCE = 'stage6-semantic-voxel-patch-dataset-v1';
export const PATCH_DATASET_SCHEMA_VERSION = 1;
export const PATCH_CATEGORIES = Object.freeze(['courtyard', 'facade', 'interior', 'roof']);
```

`buildSemanticVoxelPatchDataset` must sort patches by `category`, `case_id`, and `patch_id`, dedupe ids, and compute `patch_count`.

- [x] **Step 4: Run focused test**

Run:

```powershell
node --test test/templateSemanticPatchDataset.test.js
```

Expected: PASS.

---

### Task 2: Semantic Patch Completion And Repair

**Files:**
- Create: `src/construction/templates/templateSemanticPatchCompleter.js`
- Test: `test/templateSemanticPatchCompleter.test.js`

**Interfaces:**
- Consumes: dataset from `buildSemanticVoxelPatchDataset`.
- Produces:
  - `PATCH_COMPLETER_SOURCE`
  - `completeSemanticVoxelPatch({ dataset, category, context, constraints })`
  - `repairSemanticVoxelPatchConflicts({ patch, constraints })`

- [x] **Step 1: Write the failing tests**

Create tests that assert:

- modern `facade` context selects the large-glass modern facade patch.
- blocked roles remove matching voxels and report repairs.
- clearance boxes remove solid/furniture voxels but preserve air/opening voxels.
- unknown categories return inactive completion with warnings.

- [x] **Step 2: Run tests to verify they fail**

Run:

```powershell
node --test test/templateSemanticPatchCompleter.test.js
```

Expected: FAIL because `templateSemanticPatchCompleter.js` does not exist.

- [x] **Step 3: Implement the completer**

Implement scoring:

```text
score =
  style match +25
  typology match +15
  requested tag match +10 each
  prompt token match +6 each
  average voxel confidence * 20
  risk penalty up to -20
```

Implement repairs:

- remove voxels outside `dimensions`.
- remove voxels with roles in `blocked_roles`.
- remove `solid` or `furniture` voxels inside `clearance_boxes`.
- preserve `air` and `replaceable` voxels in clearance boxes.

- [x] **Step 4: Run focused tests**

Run:

```powershell
node --test test/templateSemanticPatchDataset.test.js test/templateSemanticPatchCompleter.test.js
```

Expected: PASS.

---

### Task 3: Verification

**Files:**
- No new source files.

**Interfaces:**
- Consumes: Task 1 and Task 2 modules.
- Produces: verified Stage 6 MVP baseline.

- [x] **Step 1: Run Stage 6 focused tests**

Run:

```powershell
node --test test/templateSemanticPatchDataset.test.js test/templateSemanticPatchCompleter.test.js
```

Expected: PASS.

- [x] **Step 2: Run template-focused regression tests**

Run:

```powershell
node --test test/templateNeuralRetriever.test.js test/templateEmbeddingIndex.test.js test/templateKnowledgeAgent.test.js
```

Expected: PASS.

- [x] **Step 3: Run full suite**

Run:

```powershell
npm test
```

Expected: PASS.

## Self-Review Checklist

- Spec coverage: Tasks cover dataset schema, four patch categories, deterministic completion, conflict repair, and fallback safety.
- Placeholder scan: The plan has no placeholder markers or unbounded implementation notes.
- Type consistency: Dataset and completer function names match across tasks.
- Runtime safety: No task wires patch completion into datapack generation by default.
