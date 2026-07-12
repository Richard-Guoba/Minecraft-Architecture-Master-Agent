# Stage 7 Milestone 2.5 Trusted Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fail-closed six-case curation loop that binds human review and sparse semantic corrections to source hashes, generates deterministic review packs and Dataset v2 artifacts, and reports whether at least three cases are truly training-eligible and semantically accepted.

**Architecture:** Add a strict Stage 7-only overlay parser beside the existing general template review parser, and a separate pure correction module beside the M2 dataset case builder. A review-pack writer prepares source-bound artifacts for humans; the existing dataset writer consumes only validated latest reviews, preserves Dataset v1, and writes an atomic versioned v2 index with readiness gates.

**Tech Stack:** Node.js 20+ ESM, built-in `node:test`, `node:assert`, `node:crypto`, `node:fs/promises`, existing schematic reader, Stage 7 schema/repair modules, JSON/JSONL/Markdown. No Python, PyTorch, network service, database, or new npm dependency.

## Global Constraints

- Dataset v1 and its recorded SHA-256 evidence remain byte-identical.
- No automated code may invent `reviewed_by`, license permission, license evidence, canonical front side, or approved learning areas.
- Positive governance remains separate from semantic acceptance; neither may bypass the other.
- Review records bind to the exact lowercase 64-character source SHA-256.
- Split assignment remains `sha256-case-id-v1` and precedes eligibility filtering.
- Large per-case review artifacts remain under `.tmp/`; canonical dataset directories stay lightweight.
- Stage 7 runtime remains `off|shadow`; M2.5 adds no Python provider or apply mode.
- TDD red/green cycles and frequent focused commits are required.

---

### Task 1: Strict Source-Bound Review Overlay

**Files:**
- Create: `src/construction/learning/stage7DatasetReviewOverlay.js`
- Create: `test/stage7DatasetReviewOverlay.test.js`

**Interfaces:**
- Consumes: JSONL text and optional known `{case_id, source_sha256}` identities.
- Produces: `parseStage7DatasetReviewOverlay(text, { knownCases, strict })`, `mergeStage7DatasetReviews(records)`, and `validateStage7DatasetReviewRecord(record)`.

- [ ] **Step 1: Write failing parser and lineage tests**

```js
test('Stage 7 review overlay requires source-bound complete positive reviews', () => {
  const parsed=parseStage7DatasetReviewOverlay(JSON.stringify(completeReview()),{
    knownCases:new Map([['house-tavern','a'.repeat(64)]])
  });
  assert.deepEqual(parsed.errors,[]);
  assert.equal(parsed.records[0].source_sha256,'a'.repeat(64));
  assert.equal(parsed.records[0].semantic_corrections.length,0);
});

test('Stage 7 review overlay rejects stale hashes and incomplete positive reviews', () => {
  const stale=parseStage7DatasetReviewOverlay(JSON.stringify(completeReview()),{
    knownCases:new Map([['house-tavern','b'.repeat(64)]])
  });
  assert.match(stale.errors[0].message,/source hash mismatch/);
  const incomplete=parseStage7DatasetReviewOverlay(JSON.stringify({...completeReview(),reviewed_by:''}));
  assert.match(incomplete.errors[0].message,/reviewed_by/);
});

test('latest review wins while all record ids remain in lineage', () => {
  const first=completeReview({record_id:'r1',reviewed_at:'2026-07-12T00:00:00.000Z'});
  const second=completeReview({record_id:'r2',reviewed_at:'2026-07-12T01:00:00.000Z',status:'rejected'});
  const merged=mergeStage7DatasetReviews([first,second]);
  assert.equal(merged.get('house-tavern').status,'rejected');
  assert.deepEqual(merged.get('house-tavern').review_record_ids,['r1','r2']);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/stage7DatasetReviewOverlay.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage7DatasetReviewOverlay.js`.

- [ ] **Step 3: Implement strict normalization and validation**

```js
export const STAGE7_PILOT_CASE_IDS=Object.freeze([
  'house-a-small-modern-house','house-lakehouse','house-tavern','house-watermill',
  'house-wood-modern-house','temples-japanese-pagoda-plus-tea-house'
]);

export function validateStage7DatasetReviewRecord(record={}, {knownCases}={}) {
  const errors=[];
  if (!record.record_id) errors.push('record_id is required');
  if (!record.case_id) errors.push('case_id is required');
  if (!/^[a-f0-9]{64}$/.test(record.source_sha256||'')) errors.push('source_sha256 must be lowercase SHA-256');
  if (knownCases?.has(record.case_id)&&knownCases.get(record.case_id)!==record.source_sha256) errors.push('source hash mismatch');
  if (['approved','limited'].includes(record.status)) {
    if (!record.reviewed_by) errors.push('positive review requires reviewed_by');
    if (!Number.isFinite(Date.parse(record.reviewed_at))) errors.push('positive review requires reviewed_at');
    if (!record.license_evidence) errors.push('positive review requires license_evidence');
    if (!['north','south','east','west'].includes(record.canonical_front_side)) errors.push('positive review requires canonical_front_side');
  }
  return {ok:errors.length===0,errors};
}
```

Normalization must reject unknown root fields, duplicate `record_id`, unsupported status/license/use/layer values, and corrections that do not have exact keys for their operation.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test test/stage7DatasetReviewOverlay.test.js test/templateReviewOverlay.test.js`

Expected: all tests pass; the legacy overlay behavior remains unchanged.

- [ ] **Step 5: Commit**

```powershell
git add src/construction/learning/stage7DatasetReviewOverlay.js test/stage7DatasetReviewOverlay.test.js
git commit -m "feat: validate stage 7 dataset reviews"
```

### Task 2: Deterministic Sparse Semantic Corrections

**Files:**
- Create: `src/construction/learning/coarseSemanticVoxelDatasetCorrections.js`
- Create: `test/coarseSemanticVoxelDatasetCorrections.test.js`
- Modify: `src/construction/learning/coarseSemanticVoxelDatasetCase.js`
- Modify: `test/coarseSemanticVoxelDatasetCase.test.js`

**Interfaces:**
- Consumes: raster cells and validated `semantic_corrections` records.
- Produces: `applyStage7DatasetCorrections({cells, corrections}) -> {cells, applied}` and correction provenance in dataset records.

- [ ] **Step 1: Write failing pure-function tests**

```js
test('semantic corrections deterministically set and clear canonical cells', () => {
  const result=applyStage7DatasetCorrections({cells:[
    {x:1,y:1,z:1,envelope:'wall',space:'interior',site:'none',confidence:0.8}
  ],corrections:[
    {operation:'set',coordinate:[2,1,1],layer:'envelope',value:'entrance',confidence:1,reason:'reviewed entrance'},
    {operation:'clear',coordinate:[1,1,1],layer:'space',reason:'open exterior'}
  ]});
  assert.deepEqual(result.applied.map(x=>x.operation),['set','clear']);
  assert.equal(result.cells.find(x=>x.x===2).envelope,'entrance');
  assert.equal(result.cells.find(x=>x.x===1).space,'none');
});

test('semantic corrections reject out-of-bounds coordinates and vocabulary', () => {
  assert.throws(()=>applyStage7DatasetCorrections({cells:[],corrections:[
    {operation:'set',coordinate:[64,0,0],layer:'envelope',value:'wall',confidence:1,reason:'bad'}
  ]}),/coordinate/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/coarseSemanticVoxelDatasetCorrections.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement immutable correction application**

```js
const EMPTY={envelope:'empty',space:'none',site:'none'};

export function applyStage7DatasetCorrections({cells=[],corrections=[]}={}) {
  const byCoordinate=new Map(cells.map(cell=>[key(cell),structuredClone(cell)]));
  const applied=[];
  for (const correction of corrections) {
    validateCorrection(correction);
    const [x,y,z]=correction.coordinate;
    const id=`${x},${y},${z}`;
    const cell=byCoordinate.get(id)||{x,y,z,envelope:'empty',space:'none',site:'none',confidence:1};
    cell[correction.layer]=correction.operation==='clear'?EMPTY[correction.layer]:correction.value;
    cell.confidence=correction.operation==='set'?correction.confidence:cell.confidence;
    if (cell.envelope==='empty'&&cell.space==='none'&&cell.site==='none') byCoordinate.delete(id);
    else byCoordinate.set(id,cell);
    applied.push(structuredClone(correction));
  }
  return {cells:[...byCoordinate.values()].sort(compareCells),applied};
}
```

Use canonical vocabularies exported by `coarseSemanticVoxelSchema.js`, require integer coordinates in `[0,63]`, confidence in `[0,1]` for `set`, and non-empty reasons.

- [ ] **Step 4: Integrate corrections before canonical plan creation**

Extend `buildStage7DatasetCase` with `reviewRecord`. Apply corrections to `raster.cells`, then create the raw plan. Record `correction_count`, `review_record_ids`, and a deterministic correction hash. Do not mutate `volume`, `caseRecord`, or `raster.cells`.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test test/coarseSemanticVoxelDatasetCorrections.test.js test/coarseSemanticVoxelDatasetCase.test.js`

Expected: all tests pass.

```powershell
git add src/construction/learning/coarseSemanticVoxelDatasetCorrections.js src/construction/learning/coarseSemanticVoxelDatasetCase.js test/coarseSemanticVoxelDatasetCorrections.test.js test/coarseSemanticVoxelDatasetCase.test.js
git commit -m "feat: apply reviewed stage 7 semantic corrections"
```

### Task 3: Six-Case Review Pack

**Files:**
- Create: `src/construction/learning/stage7DatasetReviewPack.js`
- Create: `src/buildStage7DatasetReviewPack.js`
- Create: `test/stage7DatasetReviewPack.test.js`
- Create: `test/stage7DatasetReviewPackCli.test.js`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: template root, knowledge base, pilot IDs, and local output root.
- Produces: `writeStage7DatasetReviewPack(options)` plus CLI `npm run review-pack:stage7`.

- [ ] **Step 1: Write failing writer and CLI tests**

```js
test('review pack is source-bound and contains no positive review claims', async (t) => {
  const result=await writeStage7DatasetReviewPack(fixture(t));
  const review=JSON.parse(await fs.readFile(result.cases[0].reviewPath,'utf8'));
  assert.match(review.source_sha256,/^[a-f0-9]{64}$/);
  assert.equal(review.current_review.status,'pending');
  assert.equal(review.correction_template.reviewed_by,'');
  assert.equal(review.correction_template.license_status,'unknown');
});
```

CLI help must document `--root`, `--knowledge-base`, `--out`, and repeatable `--case`. Unknown or duplicate pilot IDs exit non-zero.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test test/stage7DatasetReviewPack.test.js test/stage7DatasetReviewPackCli.test.js`

Expected: missing-module failures.

- [ ] **Step 3: Implement deterministic review-pack output**

For each case, reuse `readSchematicBlockVolume` and `buildStage7DatasetCase`; write `review.json`, `report.md`, `plan.raw.json`, and `correction.example.json`. Write a sorted `index.json` and `summary.md` at the pack root. Never fill a positive reviewer or license field.

- [ ] **Step 4: Add the CLI and package script**

```json
"review-pack:stage7": "node src/buildStage7DatasetReviewPack.js"
```

Ignore `.tmp/stage7-m2-5-review-pack/` through the existing `.tmp/` rule; add no broad new ignore rule if `.tmp/` is already ignored.

- [ ] **Step 5: Run tests and commit**

Run: `node --test test/stage7DatasetReviewPack.test.js test/stage7DatasetReviewPackCli.test.js`

Expected: all tests pass.

```powershell
git add package.json .gitignore src/buildStage7DatasetReviewPack.js src/construction/learning/stage7DatasetReviewPack.js test/stage7DatasetReviewPack.test.js test/stage7DatasetReviewPackCli.test.js
git commit -m "feat: generate stage 7 review packs"
```

### Task 4: Overlay-Aware Dataset v2 Builder

**Files:**
- Modify: `src/construction/learning/coarseSemanticVoxelDataset.js`
- Modify: `src/construction/learning/coarseSemanticVoxelDatasetCase.js`
- Modify: `src/buildCoarseSemanticVoxelDataset.js`
- Modify: `test/coarseSemanticVoxelDataset.test.js`
- Modify: `test/stage7DatasetCli.test.js`

**Interfaces:**
- Consumes: `datasetVersion`, optional `reviewOverlayPath`, pilot filters, and readiness thresholds.
- Produces: versioned v1/v2 manifests and atomic output trees without changing v1 defaults.

- [ ] **Step 1: Write failing v2 integration tests**

```js
test('Dataset v2 consumes latest source-bound review and preserves split', async (t) => {
  const fixture=await createFixture(t);
  fixture.datasetVersion='v2';
  fixture.reviewOverlayPath=await writeReviewOverlay(fixture,completeReview());
  const result=await writeStage7DatasetArtifacts(fixture);
  assert.equal(result.manifest.dataset_version,'v2');
  assert.equal(result.manifest.parent_dataset_version,'v1');
  assert.deepEqual(result.records[0].review.review_record_ids,['review-pilot-1']);
  assert.equal(result.records[0].split,assignStage7DatasetSplit({caseId:result.records[0].case_id}));
});

test('Dataset v2 fails closed on stale review source hash', async (t) => {
  const fixture=await createFixture(t);
  fixture.datasetVersion='v2';
  fixture.reviewOverlayPath=await writeReviewOverlay(fixture,completeReview({source_sha256:'f'.repeat(64)}));
  await assert.rejects(writeStage7DatasetArtifacts(fixture),/source hash mismatch/);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test test/coarseSemanticVoxelDataset.test.js test/stage7DatasetCli.test.js`

Expected: FAIL because v2 and overlay options are not supported.

- [ ] **Step 3: Generalize versioned manifest construction**

Replace fixed v1 constants inside builder functions with validated `datasetVersion`. Preserve the current v1 defaults and artifact bytes. For v2 set source `stage7-coarse-semantic-voxel-dataset-v2`, schema version `2`, extractor provenance, `parent_dataset_version: 'v1'`, review coverage, semantic accepted count, and readiness summary.

- [ ] **Step 4: Load and bind the latest review per case**

Read overlay JSONL once, parse strictly, reject duplicate record IDs globally, then select the latest record by `reviewed_at`. Before applying each review, compare `review.source_sha256` with the decoded schematic hash. Merge only normalized review and correction fields; source file and hash remain authoritative from raw input.

- [ ] **Step 5: Extend CLI without changing v1 command behavior**

Add:

```text
--dataset-version v1|v2
--review-overlay <path>
--require-reviewed <integer>
--require-semantic-accepted <integer>
--require-eligible <integer>
```

`v2` defaults to `mc_templates/datasets/coarse_semantic_voxels/v2`; v1 retains its existing path. Positive readiness thresholds are evaluated after atomic artifacts are written so diagnostics remain available.

- [ ] **Step 6: Run focused tests and prove v1 immutability**

Run: `node --test test/stage7DatasetReviewOverlay.test.js test/coarseSemanticVoxelDatasetCorrections.test.js test/coarseSemanticVoxelDatasetCase.test.js test/coarseSemanticVoxelDataset.test.js test/stage7DatasetCli.test.js`

Run: `git diff --exit-code 0e7b7fd -- mc_templates/datasets/coarse_semantic_voxels/v1`

Expected: tests pass and Dataset v1 has no diff from its M2 data commit.

- [ ] **Step 7: Commit**

```powershell
git add src/construction/learning/coarseSemanticVoxelDataset.js src/construction/learning/coarseSemanticVoxelDatasetCase.js src/buildCoarseSemanticVoxelDataset.js test/coarseSemanticVoxelDataset.test.js test/stage7DatasetCli.test.js
git commit -m "feat: build reviewed stage 7 dataset v2"
```

### Task 5: M2.5 Readiness Report and Fail-Closed Gates

**Files:**
- Modify: `src/construction/learning/coarseSemanticVoxelDataset.js`
- Modify: `test/coarseSemanticVoxelDataset.test.js`
- Modify: `test/stage7DatasetCli.test.js`

**Interfaces:**
- Consumes: v2 indexed records and thresholds.
- Produces: `buildStage7DatasetReadiness(indexed, {pilotCaseIds})` and `reports/readiness.md`.

- [ ] **Step 1: Write failing readiness tests**

```js
test('readiness distinguishes engineering completion from trusted-data gate', () => {
  const readiness=buildStage7DatasetReadiness(indexedFixture(),{pilotCaseIds:STAGE7_PILOT_CASE_IDS});
  assert.equal(readiness.pilot_count,6);
  assert.equal(readiness.reviewed_count,6);
  assert.equal(readiness.training_eligible_count,3);
  assert.equal(readiness.semantic_accepted_count,3);
  assert.equal(readiness.ready_for_m3_real_data,true);
});
```

Add negative tests for incomplete review, semantic rejection, and governance-only eligibility.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test test/coarseSemanticVoxelDataset.test.js test/stage7DatasetCli.test.js`

Expected: missing readiness export or missing artifact failures.

- [ ] **Step 3: Implement readiness computation and report**

The report must state pilot totals, explicit outcomes, license states, semantic states, eligible IDs, accepted IDs, intersection IDs, remaining blockers, and `ready_for_m3_real_data`. The flag is true only when all six have explicit outcomes and at least three are both eligible and semantically accepted.

- [ ] **Step 4: Enforce requested CLI gates**

`--require-reviewed 6 --require-semantic-accepted 3 --require-eligible 3` must exit non-zero when unmet and list actual counts. With no requested threshold, generation succeeds and records the blocker.

- [ ] **Step 5: Run tests and commit**

Run: `node --test test/coarseSemanticVoxelDataset.test.js test/stage7DatasetCli.test.js`

Expected: all tests pass.

```powershell
git add src/construction/learning/coarseSemanticVoxelDataset.js test/coarseSemanticVoxelDataset.test.js test/stage7DatasetCli.test.js
git commit -m "feat: report stage 7 data readiness"
```

### Task 6: Generate Pilot Review Pack and Dataset v2 Evidence

**Files:**
- Create: `mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json`
- Create: `mc_templates/datasets/coarse_semantic_voxels/v2/cases.jsonl`
- Create: `mc_templates/datasets/coarse_semantic_voxels/v2/splits.json`
- Create: `mc_templates/datasets/coarse_semantic_voxels/v2/reports/summary.md`
- Create: `mc_templates/datasets/coarse_semantic_voxels/v2/reports/readiness.md`
- Create: `docs/benchmarks/stage7-m2-5-dataset-v2.md`

**Interfaces:**
- Consumes: frozen six-case pilot and any real source-bound review records present at execution time.
- Produces: deterministic canonical v2 evidence and local review packs.

- [ ] **Step 1: Generate the six-case review pack**

```powershell
$env:SOURCE_DATE_EPOCH='1783814400'
npm run review-pack:stage7 -- --out .tmp/stage7-m2-5-review-pack
```

Expected: six sorted cases and no positive review claims generated by automation.

- [ ] **Step 2: Build Dataset v2 twice**

```powershell
npm run dataset:stage7 -- --dataset-version v2 --out mc_templates/datasets/coarse_semantic_voxels/v2 --local-artifacts .tmp/stage7-dataset/v2
npm run dataset:stage7 -- --dataset-version v2 --out .tmp/stage7-m2-5-determinism/index --local-artifacts .tmp/stage7-m2-5-determinism/local
```

Expected: both builds complete. If no human-authored positive review exists, eligible count remains zero and readiness correctly remains false.

- [ ] **Step 3: Compare deterministic hashes**

Compare SHA-256 for both copies of `manifest.json`, `cases.jsonl`, `splits.json`, `reports/summary.md`, and `reports/readiness.md`; every pair must match.

- [ ] **Step 4: Record truthful evidence**

`docs/benchmarks/stage7-m2-5-dataset-v2.md` records commands, input hashes, output hashes, review coverage, semantic acceptance, eligibility, remaining blockers, and whether the three-case external gate was reached. It must not present pending automated templates as human reviews.

- [ ] **Step 5: Commit**

```powershell
git add mc_templates/datasets/coarse_semantic_voxels/v2 docs/benchmarks/stage7-m2-5-dataset-v2.md
git commit -m "data: record stage 7 m2.5 dataset v2"
```

### Task 7: Documentation and Final Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/index.html`
- Modify: `AGENT.md`
- Modify: `test/docsProjectStatus.test.js`

**Interfaces:**
- Consumes: actual v2 readiness evidence.
- Produces: truthful M2.5 status without claiming learned generation or completion.

- [ ] **Step 1: Write failing status assertions**

```js
test('project docs surface Stage 7 M2.5 trusted-data status truthfully', async () => {
  const [readme,roadmap,home,agent]=await Promise.all([
    fs.readFile('README.md','utf8'),fs.readFile('docs/roadmap.md','utf8'),
    fs.readFile('docs/index.html','utf8'),fs.readFile('AGENT.md','utf8')
  ]);
  for (const text of [readme,roadmap,home,agent]) assert.match(text,/Stage 7[^\n]*M2\.5|M2\.5[^\n]*Stage 7/);
  assert.doesNotMatch(readme,/Stage 7[^\n]*complete/i);
});
```

- [ ] **Step 2: Run docs test and verify RED**

Run: `node --test test/docsProjectStatus.test.js`

Expected: FAIL because M2.5 is not yet surfaced.

- [ ] **Step 3: Update status from actual evidence**

Describe M2.5 as review-pack and v2 readiness infrastructure. State exact reviewed, accepted, and eligible counts from committed v2 evidence. Keep Python learned provider assigned to M3 and apply mode assigned to M4.

- [ ] **Step 4: Run all focused tests**

```powershell
node --test test/stage7DatasetReviewOverlay.test.js test/coarseSemanticVoxelDatasetCorrections.test.js test/stage7DatasetReviewPack.test.js test/stage7DatasetReviewPackCli.test.js test/coarseSemanticVoxelDatasetCase.test.js test/coarseSemanticVoxelDataset.test.js test/stage7DatasetCli.test.js test/docsProjectStatus.test.js
```

Expected: all focused tests pass.

- [ ] **Step 5: Run Stage 7 runtime regressions**

Run: `node --test test/stage7Cli.test.js test/stage7Pipeline.test.js`

Expected: all tests pass; runtime remains shadow-only.

- [ ] **Step 6: Run the complete suite and repository hygiene checks**

```powershell
npm test
git diff --check
git status --short
git ls-files .tmp out
```

Expected: full suite passes, no whitespace errors, no uncommitted files, and no tracked temporary artifacts.

- [ ] **Step 7: Commit**

```powershell
git add README.md docs/roadmap.md docs/index.html AGENT.md test/docsProjectStatus.test.js
git commit -m "docs: surface stage 7 m2.5 readiness"
```

## Self-Review Result

- Spec coverage: every design requirement maps to Tasks 1–7.
- Placeholder scan: the plan contains no deferred implementation markers.
- Type consistency: `source_sha256`, `semantic_corrections`, `review_record_ids`, `datasetVersion`, and readiness field names are consistent across producer and consumer tasks.
- Scope: the plan stops before Python, learned inference, apply mode, or runtime geometry changes.
