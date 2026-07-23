# Governance Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the retired Dataset/R1/R2/R3 governance surface and replace contradictory project documentation with a concise, training-first current state while keeping normal Minecraft generation and reusable parsers working.

**Architecture:** Delete public commands, pure-governance modules, tracked governed Dataset artifacts, dedicated tests, and historical documents in dependency-safe slices. Preserve the normal construction path, the coarse semantic shadow interface, schematic parsing, and the small set of R2 parsing/voxel helpers that the training reset plan will rename and decouple.

**Tech Stack:** Node.js 20+ ESM, `node:test`, Markdown, static HTML, Git.

## Global Constraints

- Every existing local template may be used for local training without per-file approval.
- Local training does not depend on Dataset v1/v2/v3, R1/R2/R3, human review, or owner acknowledgement gates.
- License and distribution review occurs only before an artifact is published or shared externally.
- Do not delete, rewrite, move, publish, or expose anything below `.local/`.
- Preserve `construction_method_v1`, mock-mode generation, and the optional coarse semantic shadow boundary.
- Preserve `src/construction/templates/schematicBlockVolume.js`.
- Preserve `stage7BoundedNbt.js`, `stage7VanillaStructureNbt.js`, `stage7ConditionalVoxelPreparation.js`, and `stage7ConditionalFingerprint.js` until the training reset plan moves and renames them.
- Preserve the transitive parser dependencies `stage7CandidateBoundary.js`, `stage7SourceExpansionBoundary.js`, and `stage7SourceExpansionContracts.js` temporarily; they are removed by the training reset plan.
- Keep Node.js `>=20`, Minecraft Java 1.21/1.21.1, and datapack `pack_format: 48`.
- Keep the Conda environment name `mcagent-stage7` during this cleanup.
- Before editing, run `git fetch origin`, confirm how `HEAD` relates to `origin/main`, and stop rather than overwriting unrelated local changes.

---

### Task 1: Add a Current-Policy Contract Test

**Files:**
- Create: `test/projectPolicy.test.js`
- Modify: `package.json`
- Delete: `src/auditStage7ConditionalAdmission.js`
- Delete: `src/auditStage7RealCaseReadiness.js`
- Delete: `src/auditStage7SourceExpansion.js`
- Delete: `src/buildCoarseSemanticVoxelDataset.js`
- Delete: `src/buildStage7DatasetReviewPack.js`
- Delete: `src/compareStage7DatasetVersions.js`
- Delete: `src/runStage7PublicNbtPilot.js`
- Delete: `test/stage7ConditionalAdmissionCli.test.js`
- Delete: `test/stage7DatasetCli.test.js`
- Delete: `test/stage7DatasetReviewPackCli.test.js`
- Delete: `test/stage7DatasetV3Cli.test.js`
- Delete: `test/stage7PublicNbtPilotCli.test.js`
- Delete: `test/stage7RealCaseReadinessAudit.test.js`
- Delete: `test/stage7SourceExpansionCli.test.js`

**Interfaces:**
- Consumes: `package.json`, `README.md`, `AGENT.md`, `docs/architecture.md`, `docs/training.md`, and the tracked file list.
- Produces: a regression contract that names the retired scripts and forbidden current-policy phrases.

- [ ] **Step 1: Write the failing policy test**

Create `test/projectPolicy.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RETIRED_SCRIPTS = [
  'dataset:stage7',
  'review-pack:stage7',
  'compare:stage7-datasets',
  'audit:stage7:readiness',
  'audit:stage7:sources',
  'audit:stage7:conditional-admission',
  'pilot:stage7:public-nbt'
];

test('retired governance commands are absent', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const name of RETIRED_SCRIPTS) {
    assert.equal(packageJson.scripts[name], undefined, name);
  }
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run:

```bash
node --test test/projectPolicy.test.js
```

Expected: FAIL because retired scripts still exist.

- [ ] **Step 3: Remove the seven retired scripts**

Delete these exact properties from `package.json`:

```json
"dataset:stage7": "node src/buildCoarseSemanticVoxelDataset.js",
"review-pack:stage7": "node src/buildStage7DatasetReviewPack.js",
"compare:stage7-datasets": "node src/compareStage7DatasetVersions.js",
"audit:stage7:readiness": "node src/auditStage7RealCaseReadiness.js",
"audit:stage7:sources": "node src/auditStage7SourceExpansion.js",
"audit:stage7:conditional-admission": "node src/auditStage7ConditionalAdmission.js",
"pilot:stage7:public-nbt": "node src/runStage7PublicNbtPilot.js"
```

Do not change normal generation scripts or the transitional private-training scripts in this task.

- [ ] **Step 4: Delete the retired entry-point and CLI-test files**

Delete every file marked **Delete** in this task's **Files** section. Do not delete `src/runStage7PrivateResearch.js`; the training reset plan replaces it only after the new commands exist.

- [ ] **Step 5: Run the script contract test**

Run:

```bash
node --test --test-name-pattern="retired governance commands" test/projectPolicy.test.js
```

Expected: PASS.

- [ ] **Step 6: Verify no package script points to a missing file**

Run:

```bash
node -e "const p=require('./package.json'); for (const [k,v] of Object.entries(p.scripts)) if (/node src\\//.test(v)) { const f=v.match(/node (src\\/[^ ]+)/)[1]; require('node:fs').accessSync(f); }"
```

Expected: exit 0 with no output.

- [ ] **Step 7: Commit the green command-policy slice**

```bash
git add package.json src test/projectPolicy.test.js test/stage7ConditionalAdmissionCli.test.js test/stage7DatasetCli.test.js test/stage7DatasetReviewPackCli.test.js test/stage7DatasetV3Cli.test.js test/stage7PublicNbtPilotCli.test.js test/stage7RealCaseReadinessAudit.test.js test/stage7SourceExpansionCli.test.js
git commit -m "refactor: remove retired governance commands"
```

---

### Task 2: Delete Pure Governance Modules and Tests

**Files:**
- Delete: `src/construction/learning/coarseSemanticVoxelDataset.js`
- Delete: `src/construction/learning/coarseSemanticVoxelDatasetCase.js`
- Delete: `src/construction/learning/coarseSemanticVoxelDatasetCorrections.js`
- Delete: `src/construction/learning/coarseSemanticVoxelDatasetGovernance.js`
- Delete: `src/construction/learning/coarseSemanticVoxelDatasetRasterizer.js`
- Delete: `src/construction/learning/coarseSemanticVoxelDatasetRasterizerV3.js`
- Delete: `src/construction/learning/stage7CandidateAcquisition.js`
- Delete: `src/construction/learning/stage7CandidateReadinessState.js`
- Delete: `src/construction/learning/stage7CandidateReadinessStore.js`
- Delete: `src/construction/learning/stage7ConditionalAdmission.js`
- Delete: `src/construction/learning/stage7ConditionalAdmissionStore.js`
- Delete: `src/construction/learning/stage7ConditionalSnapshotPolicy.js`
- Delete: `src/construction/learning/stage7ConditionalTaxonomy.js`
- Delete: `src/construction/learning/stage7DatasetReviewOverlay.js`
- Delete: `src/construction/learning/stage7DatasetReviewPack.js`
- Delete: `src/construction/learning/stage7DatasetReviewScopeV3.js`
- Delete: `src/construction/learning/stage7DatasetV3Comparison.js`
- Delete: `src/construction/learning/stage7GridTransformV3.js`
- Delete: `src/construction/learning/stage7Pilot.js`
- Delete: `src/construction/learning/stage7PilotArtifacts.js`
- Delete: `src/construction/learning/stage7PilotBatch.js`
- Delete: `src/construction/learning/stage7PilotFilesystem.js`
- Delete: `src/construction/learning/stage7PilotPreflight.js`
- Delete: `src/construction/learning/stage7PilotReadinessStore.js`
- Delete: `src/construction/learning/stage7PilotReview.js`
- Delete: `src/construction/learning/stage7RealCaseReadinessAudit.js`
- Delete: `src/construction/learning/stage7SemanticEvidenceV3.js`
- Delete: `src/construction/learning/stage7SemanticTopologyV3.js`
- Delete: `src/construction/learning/stage7SemanticValidatorV3.js`
- Delete: `src/construction/learning/stage7SourceExpansionRanking.js`
- Delete: `src/construction/learning/stage7SourceExpansionReview.js`
- Delete: `src/construction/learning/stage7SourceExpansionRights.js`
- Delete: the correspondingly named `test/*.test.js` files listed below.

**Interfaces:**
- Consumes: no runtime consumers; Task 2 removed every public entry point.
- Produces: a learning directory without Dataset eligibility, review, admission, readiness, or pilot orchestration.

- [ ] **Step 1: Prove the retained runtime does not import the deletion set**

Run:

```bash
rg -n "coarseSemanticVoxelDataset|stage7CandidateAcquisition|stage7CandidateReadiness|stage7ConditionalAdmission|stage7DatasetReview|stage7Pilot|stage7RealCaseReadiness|stage7SemanticEvidenceV3|stage7SemanticTopologyV3|stage7SemanticValidatorV3|stage7SourceExpansionRanking|stage7SourceExpansionReview|stage7SourceExpansionRights" src --glob '!src/construction/learning/**'
```

Expected: no matches. If a match remains outside a file being deleted, stop and update this plan rather than deleting its dependency.

- [ ] **Step 2: Delete the pure-governance modules**

Delete every production file listed in this task's **Files** section.

- [ ] **Step 3: Delete their dedicated tests**

Delete these exact files:

```text
test/coarseSemanticVoxelDataset.test.js
test/coarseSemanticVoxelDatasetCase.test.js
test/coarseSemanticVoxelDatasetCorrections.test.js
test/coarseSemanticVoxelDatasetGovernance.test.js
test/coarseSemanticVoxelDatasetRasterizer.test.js
test/coarseSemanticVoxelDatasetV3.test.js
test/stage7CandidateAcquisition.test.js
test/stage7CandidateReadinessBoundary.test.js
test/stage7CandidateReadinessIntegration.test.js
test/stage7CandidateReadinessState.test.js
test/stage7CandidateReadinessStore.test.js
test/stage7ConditionalAdmission.test.js
test/stage7ConditionalAdmissionBoundary.test.js
test/stage7ConditionalAdmissionStore.test.js
test/stage7ConditionalSnapshotPolicy.test.js
test/stage7ConditionalTaxonomy.test.js
test/stage7DatasetReviewOverlay.test.js
test/stage7DatasetReviewPack.test.js
test/stage7DatasetReviewScopeV3.test.js
test/stage7DatasetV3Comparison.test.js
test/stage7GridTransformV3.test.js
test/stage7Pilot.test.js
test/stage7PilotArtifacts.test.js
test/stage7PilotBatch.test.js
test/stage7PilotBoundary.test.js
test/stage7PilotFilesystem.test.js
test/stage7PilotReadiness.test.js
test/stage7PilotReview.test.js
test/stage7SemanticEvidenceV3.test.js
test/stage7SemanticTopologyV3.test.js
test/stage7SemanticValidatorV3.test.js
test/stage7SourceExpansionRanking.test.js
test/stage7SourceExpansionReview.test.js
test/stage7SourceExpansionRights.test.js
```

Keep the bounded-NBT, vanilla-structure, candidate-boundary, source-expansion-contract, fingerprint, and conditional-voxel tests until the training reset extracts their reusable behavior.

- [ ] **Step 4: Run the retained learning tests**

Run:

```bash
node --test test/coarseSemanticVoxelBaseline.test.js test/coarseSemanticVoxelCondition.test.js test/coarseSemanticVoxelRepair.test.js test/coarseSemanticVoxelSchema.test.js test/coarseSemanticVoxelShadow.test.js test/stage7BoundedNbt.test.js test/stage7CandidateBoundary.test.js test/stage7ConditionalFingerprint.test.js test/stage7ConditionalVoxelPreparation.test.js test/stage7SourceExpansionContracts.test.js test/stage7VanillaStructureNbt.test.js
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/construction/learning test
git commit -m "refactor: retire governed dataset and pilot modules"
```

---

### Task 3: Remove Tracked Governed Dataset Artifacts

**Files:**
- Modify: `test/projectPolicy.test.js`
- Delete: `mc_templates/curation/stage7_dataset_reviews.jsonl`
- Delete: `mc_templates/datasets/coarse_semantic_voxels/v1/cases.jsonl`
- Delete: `mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json`
- Delete: `mc_templates/datasets/coarse_semantic_voxels/v1/reports/summary.md`
- Delete: `mc_templates/datasets/coarse_semantic_voxels/v1/splits.json`
- Delete: `mc_templates/datasets/coarse_semantic_voxels/v2/cases.jsonl`
- Delete: `mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json`
- Delete: `mc_templates/datasets/coarse_semantic_voxels/v2/reports/readiness.md`
- Delete: `mc_templates/datasets/coarse_semantic_voxels/v2/reports/summary.md`
- Delete: `mc_templates/datasets/coarse_semantic_voxels/v2/splits.json`
- Delete: `mc_templates/datasets/coarse_semantic_voxels/v3/cases.jsonl`
- Delete: `mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json`
- Delete: `mc_templates/datasets/coarse_semantic_voxels/v3/reports/readiness.md`
- Delete: `mc_templates/datasets/coarse_semantic_voxels/v3/reports/summary.md`
- Delete: `mc_templates/datasets/coarse_semantic_voxels/v3/splits.json`

**Interfaces:**
- Consumes: none; Task 2 removed the governed Dataset readers.
- Produces: no tracked artifact that can be mistaken for the active training dataset.

- [ ] **Step 1: Write the failing tracked-artifact policy test**

Add:

```js
import { execFileSync } from 'node:child_process';

test('retired governed dataset artifacts are not tracked', () => {
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  assert.doesNotMatch(tracked, /^mc_templates\/datasets\/coarse_semantic_voxels\//mu);
  assert.doesNotMatch(tracked, /^mc_templates\/curation\/stage7_dataset_reviews\.jsonl$/mu);
});
```

- [ ] **Step 2: Run to verify RED**

Run:

```bash
node --test --test-name-pattern="retired governed dataset artifacts" test/projectPolicy.test.js
```

Expected: FAIL because the governed artifacts are still tracked.

- [ ] **Step 3: Delete the governed artifacts**

Delete only the tracked files listed above. Do not touch `mc_templates` source templates, `.local/stage7-private-research`, or `.local/stage7-source-expansion`.

- [ ] **Step 4: Run the artifact policy test**

Run:

```bash
node --test --test-name-pattern="retired governed dataset artifacts" test/projectPolicy.test.js
```

Expected: PASS.

- [ ] **Step 5: Verify local artifacts still exist and remain ignored**

Run:

```bash
git check-ignore -q .local/stage7-private-research .local/stage7-source-expansion
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add mc_templates test/projectPolicy.test.js
git commit -m "chore: remove retired governed dataset artifacts"
```

---

### Task 4: Replace Contradictory Project Documentation

**Files:**
- Modify: `README.md`
- Modify: `AGENT.md`
- Modify: `docs/architecture.md`
- Modify: `docs/index.html`
- Modify: `test/docsProjectStatus.test.js`
- Modify: `test/projectPolicy.test.js`
- Create: `docs/training.md`
- Delete: `docs/project-map.md`
- Delete: `docs/roadmap.md`
- Delete: `docs/wsl-stage7-environment.md`
- Delete: `training/stage7/README.md`
- Delete: `docs/benchmarks/stage7-dataset-v2-v3-pilot-comparison.md`
- Delete: `docs/benchmarks/stage7-dataset-v3.md`
- Delete: `docs/benchmarks/stage7-m2-5-dataset-v2.md`
- Delete: `docs/benchmarks/stage7-m2-dataset-v1.md`
- Delete: `docs/benchmarks/stage7-m3-fixture-foundation.md`
- Delete: `docs/benchmarks/stage7-p1-review-log.md`
- Delete: `docs/benchmarks/stage7-private-research-pretraining.md`
- Delete: every historical file below `docs/superpowers/handoffs/`
- Delete: every pre-2026-07-23 file below `docs/superpowers/specs/`
- Delete: every pre-2026-07-23 file below `docs/superpowers/plans/`

**Interfaces:**
- Consumes: the policy contract from Task 1 and the actual command/module state from Tasks 2-3.
- Produces: concise current documentation with one local-training policy.

- [ ] **Step 1: Write the failing current-document tests**

Add to `test/projectPolicy.test.js`:

```js
const CURRENT_DOCS = [
  'README.md',
  'AGENT.md',
  'docs/architecture.md',
  'docs/training.md'
];
const FORBIDDEN_POLICY = /ready_for_m3_real_data|training_eligible_count|Dataset v[123].*(?:required|gate|approval)|R[123].*(?:approval|admission)|real-data training is prohibited/iu;

test('current project documents use the training-first policy', () => {
  for (const relative of CURRENT_DOCS) {
    const text = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.doesNotMatch(text, FORBIDDEN_POLICY, relative);
  }
  const training = fs.readFileSync(path.join(ROOT, 'docs/training.md'), 'utf8');
  assert.match(training, /all 64 local templates/iu);
  assert.match(training, /external release/iu);
});
```

Replace the obsolete Stage 7 status test in `test/docsProjectStatus.test.js` with:

```js
test('project docs describe the active construction and training-first paths', () => {
  const readme = read('README.md');
  const architecture = read('docs/architecture.md');
  const training = read('docs/training.md');
  assert.match(readme, /construction_method_v1/u);
  assert.match(readme, /training:prepare/u);
  assert.match(architecture, /deterministic geometry/iu);
  assert.match(training, /local training/iu);
});
```

- [ ] **Step 2: Run to verify RED**

Run:

```bash
node --test test/projectPolicy.test.js test/docsProjectStatus.test.js
```

Expected: FAIL because `docs/training.md` is absent and current docs contain retired policy.

- [ ] **Step 3: Rewrite `README.md` around current behavior**

Use these top-level sections and no Stage/R/milestone status narrative:

```markdown
# Minecraft Architecture Master Agent

## What it does
## Current status
## Quick start
## Generate a datapack
## Local training
## Repository map
## Project boundaries
```

State that `construction_method_v1` remains the normal generator, all 64 local templates may be used for local training, and external distribution receives a separate release review. Describe the four training commands as the target command surface being implemented by the immediately following training reset plan; do not claim that they already execute until that plan lands.

- [ ] **Step 4: Rewrite `docs/architecture.md`**

Describe exactly two independent flows:

```text
Prompt -> semantic agents -> deterministic geometry -> QA/repair -> datapack
Local templates -> automatic preparation -> source-level split -> training -> evaluation
```

Retain the optional coarse semantic shadow interface as an experimental integration boundary. Remove Dataset versioning, human eligibility, public acquisition, and Apply Mode milestone language.

- [ ] **Step 5: Create `docs/training.md`**

Include these normative sections:

```markdown
# Local Training
## Policy
## Current evidence
## Data preparation
## Split and leakage prevention
## Training and evaluation
## Progress gates
## Local artifacts
## External release
```

Record the known 64-source, 22-prepared, 42-oversized, 185,946-step, and all-air-collapse facts. State that `.local/` data is preserved and that the training reset plan will create `.local/training/`.

- [ ] **Step 6: Rewrite `AGENT.md` and the static homepage**

In `AGENT.md`, keep the construction pipeline, Minecraft version, Node/Conda environment, secrets, testing, and Git-safety instructions. Replace the obsolete Stage 7 status and prohibition block with:

```markdown
## 本地训练原则

- 所有现有本地模板均可直接用于本地训练，无需逐文件审批。
- 本地训练与 Dataset v1/v2/v3、R1/R2/R3 和人工准入状态无关。
- 数据、权重和重建结果默认保留在 `.local/`。
- 只有准备对外发布或分享具体产物时才进行许可与分发检查。
```

Update `docs/index.html` to summarize the same current status and link only to README, `docs/architecture.md`, and `docs/training.md`.

- [ ] **Step 7: Delete obsolete documents**

Delete every file listed in this task. Preserve:

```text
docs/benchmarks/stage0-baseline-c04d104.md
docs/benchmarks/stage1-readiness-baseline.md
docs/parameter-tree/**
docs/assets/**
docs/superpowers/specs/2026-07-23-training-first-project-reset-design.md
docs/superpowers/plans/2026-07-23-governance-cleanup.md
docs/superpowers/plans/2026-07-23-training-pipeline-reset.md
```

The three 2026-07-23 implementation artifacts remain temporarily so the reset can be executed; the training reset plan removes them from the final tree.

- [ ] **Step 8: Run documentation policy tests**

Run:

```bash
node --test test/projectPolicy.test.js test/docsProjectStatus.test.js
```

Expected: all tests pass.

- [ ] **Step 9: Check for obsolete current-policy references**

Run:

```bash
rg -n "ready_for_m3_real_data|training_eligible_count|audit:stage7|pilot:stage7|Dataset v[123].*(gate|approval|required)|R[123].*(admission|approval)" README.md AGENT.md docs/index.html docs/architecture.md docs/training.md package.json
```

Expected: no matches.

- [ ] **Step 10: Commit**

```bash
git add README.md AGENT.md docs training/stage7/README.md test
git commit -m "docs: establish training-first project truth"
```

---

### Task 5: Verify the Cleaned Repository

**Files:**
- Modify only if verification exposes a dangling retired reference.

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: a clean, regression-tested governance cleanup ready for the training reset plan.

- [ ] **Step 1: Check imports and tracked paths**

Run:

```bash
rg -n "auditStage7|buildStage7DatasetReviewPack|buildCoarseSemanticVoxelDataset|compareStage7DatasetVersions|runStage7PublicNbtPilot|stage7Pilot|stage7ConditionalAdmission|stage7DatasetReview" src test package.json
```

Expected: no matches.

- [ ] **Step 2: Run the complete Node suite**

Run:

```bash
npm test
```

Expected: all tests pass. If restricted execution produces known child-process false failures, rerun the same command with normal local child-process permission and record both results.

- [ ] **Step 3: Run normal mock generation**

Run:

```bash
npm start -- --mode mock --seed 7101 "建一个湖边现代两层别墅，带大玻璃、水边平台和前景花园"
```

Expected: exit 0 and a datapack/report output under `out/`; do not commit the generated output.

- [ ] **Step 4: Verify ignored local roots were not modified by the cleanup**

Run:

```bash
git status --short --ignored .local/stage7-private-research .local/stage7-source-expansion
```

Expected: only ignored (`!!`) entries and no tracked changes.

- [ ] **Step 5: Run diff hygiene checks**

Run:

```bash
git diff --check HEAD~5..HEAD
```

Expected: exit 0.

- [ ] **Step 6: Commit any verification-only reference fix**

If Step 1 exposed a dangling reference and it was corrected:

```bash
git add -u src test package.json
git commit -m "fix: remove final retired governance references"
```

If no correction was necessary, do not create an empty commit.
