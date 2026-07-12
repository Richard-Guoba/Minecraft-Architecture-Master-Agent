# Stage 7 P1 Author Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:test-driven-development for every behavior change and superpowers:verification-before-completion before claiming success.

**Goal:** Add source creator/uploader provenance to Stage 7 human-review overlays, Dataset v2 records, and review packs without changing Dataset v1 bytes or weakening any readiness rule.

**Architecture:** The append-only human review overlay is the authoritative source of reviewed authorship. It records the original creator, uploader or schematic preparer, and a concise evidence statement separately from license conclusions. Dataset v2 copies those reviewed fields into `source`; Dataset v1 remains structurally and byte-for-byte unchanged. Review packs expose blank prompts only and never infer identity.

**Tech Stack:** Node.js 20+, `node:test`, JSONL review overlays, deterministic Stage 7 dataset/review-pack CLIs, PowerShell SHA-256 verification.

## Constraints

- Pending overlay records may leave all new provenance fields blank.
- Every explicit outcome (`approved`, `limited`, `rejected`, or `research-only`) requires non-empty `author_evidence`.
- Positive outcomes (`approved` or `limited`) additionally require at least one of `source_author` or `source_uploader`.
- Negative/non-training outcomes may leave both identities empty only when `author_evidence` explains that attribution was checked but remains unknown.
- Authorship does not imply license permission, training eligibility, semantic acceptance, or public-release permission.
- Dataset v2 uses `source.author`, `source.uploader`, and `source.author_evidence`.
- Dataset v1 must omit `source.uploader` and `source.author_evidence`, and its canonical hashes must remain unchanged.
- Generated review templates contain blank provenance prompts; automation must not pre-fill a claimed human conclusion.

## File Map

- Modify: `src/construction/learning/stage7DatasetReviewOverlay.js`
- Modify: `src/construction/learning/coarseSemanticVoxelDataset.js`
- Modify: `src/construction/learning/coarseSemanticVoxelDatasetCase.js`
- Modify: `src/construction/learning/stage7DatasetReviewPack.js`
- Test: `test/stage7DatasetReviewOverlay.test.js`
- Test: `test/stage7DatasetCli.test.js`
- Test: `test/stage7DatasetReviewPack.test.js`
- Test: `test/coarseSemanticVoxelDatasetCase.test.js`

---

### Task 1: Extend and Validate the Review Overlay Contract

**Files:**
- Modify: `test/stage7DatasetReviewOverlay.test.js`
- Modify: `src/construction/learning/stage7DatasetReviewOverlay.js`

- [ ] **Step 1: Add failing parser and governance tests**

Extend the complete-review fixture with:

```js
source_author: 'Rizzial',
source_uploader: 'Alterio',
author_evidence: 'The source page says Designed by Rizzial and Schematic by Alterio.',
```

Add tests proving that:

1. all three fields survive parsing and surrounding whitespace is normalized;
2. each explicit outcome rejects blank `author_evidence`;
3. `approved` and `limited` reject a record when both identities are blank;
4. `research-only` accepts blank identities when a non-empty evidence statement documents the unknown attribution;
5. strict unknown-field rejection remains active.

Run:

```powershell
node --test test/stage7DatasetReviewOverlay.test.js
```

Expected: the new assertions fail because the fields are not yet in the overlay schema.

- [ ] **Step 2: Implement the minimal overlay schema change**

Add `source_author`, `source_uploader`, and `author_evidence` to `ROOT_FIELDS`, normalize each as a string, and apply these status-dependent rules after the existing status validation:

```js
const EXPLICIT_STATUSES = new Set(['approved', 'limited', 'rejected', 'research-only']);
const POSITIVE_STATUSES = new Set(['approved', 'limited']);

if (EXPLICIT_STATUSES.has(record.status) && !record.author_evidence) {
  errors.push('author_evidence is required for explicit review outcomes');
}
if (POSITIVE_STATUSES.has(record.status)
  && !record.source_author
  && !record.source_uploader) {
  errors.push('approved or limited reviews require source_author or source_uploader');
}
```

Keep author evidence independent of `license_evidence` and learning-area decisions.

- [ ] **Step 3: Re-run the focused test**

```powershell
node --test test/stage7DatasetReviewOverlay.test.js
```

Expected: all overlay tests pass.

---

### Task 2: Propagate Reviewed Provenance into Dataset v2 Only

**Files:**
- Modify: `test/stage7DatasetCli.test.js`
- Modify: `test/coarseSemanticVoxelDatasetCase.test.js`
- Modify: `src/construction/learning/coarseSemanticVoxelDataset.js`
- Modify: `src/construction/learning/coarseSemanticVoxelDatasetCase.js`

- [ ] **Step 1: Add failing Dataset v2 and v1-isolation tests**

Update the CLI review fixture with the three overlay fields and assert:

```js
assert.equal(result.records[0].source.author, 'Rizzial');
assert.equal(result.records[0].source.uploader, 'Alterio');
assert.equal(
  result.records[0].source.author_evidence,
  'The source page says Designed by Rizzial and Schematic by Alterio.',
);
```

In the dataset-case tests, construct a source record containing `uploader` and `author_evidence`, then prove:

- Dataset v2 preserves both fields.
- Dataset v1 has no own `uploader` or `author_evidence` keys.
- Existing Dataset v1 `author` behavior remains unchanged.

Run:

```powershell
node --test test/stage7DatasetCli.test.js test/coarseSemanticVoxelDatasetCase.test.js
```

Expected: the new v2 assertions fail before implementation.

- [ ] **Step 2: Implement version-gated source fields**

In `buildStage7DatasetCase`, include the new keys only when `datasetVersion === 'v2'`:

```js
...(datasetVersion === 'v2'
  ? {
      uploader: caseRecord.source?.uploader || '',
      author_evidence: caseRecord.source?.author_evidence || '',
    }
  : {}),
```

In `mergeDatasetReview`, copy reviewed values into the v2 source object:

```js
author: review.source_author,
uploader: review.source_uploader,
author_evidence: review.author_evidence,
```

Do not infer missing identities from the URL or from license text.

- [ ] **Step 3: Re-run focused dataset tests**

```powershell
node --test test/stage7DatasetCli.test.js test/coarseSemanticVoxelDatasetCase.test.js
```

Expected: all focused dataset tests pass.

---

### Task 3: Add Blank Provenance Prompts to Review Packs

**Files:**
- Modify: `test/stage7DatasetReviewPack.test.js`
- Modify: `src/construction/learning/stage7DatasetReviewPack.js`

- [ ] **Step 1: Add a failing review-template test**

Assert that generated `review.json` contains exactly blank human-input fields:

```js
assert.equal(review.source_author, '');
assert.equal(review.source_uploader, '');
assert.equal(review.author_evidence, '');
```

Also assert that the Markdown checklist asks the reviewer to distinguish original creator, schematic preparer, and uploader.

Run:

```powershell
node --test test/stage7DatasetReviewPack.test.js
```

Expected: the new template assertions fail.

- [ ] **Step 2: Implement blank template fields and checklist copy**

Add the three empty strings to `blankReviewTemplate`. Update only the human checklist language; do not derive identities from existing case metadata.

- [ ] **Step 3: Re-run the review-pack test**

```powershell
node --test test/stage7DatasetReviewPack.test.js
```

Expected: all review-pack tests pass, including deterministic output checks.

---

### Task 4: Verify Compatibility and Commit the Implementation

**Files:**
- Verify: all modified production and test files
- Verify: `mc_templates/datasets/coarse_semantic_voxels/v1/`

- [ ] **Step 1: Run the complete Node test suite**

```powershell
npm test
```

Expected: every test passes with zero failures.

- [ ] **Step 2: Rebuild canonical Dataset v1 deterministically**

```powershell
$env:SOURCE_DATE_EPOCH = '1783814400'
npm run dataset:stage7 -- --dataset-version v1
```

Expected: successful deterministic rebuild.

- [ ] **Step 3: Verify the four canonical Dataset v1 hashes**

```powershell
$expected = @{
  'manifest.json' = 'fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749'
  'cases.jsonl' = 'c316a5673428830c72291ff0e67a686cd671fdc7ef75e277637c959870a21337'
  'splits.json' = 'edab78808431fa29014f011de29dba5451680e763519713c2bd312be0a192db5'
  'reports/summary.md' = '4dd84270cd6e93e1f854dca95326b6300e4677f2e8e97936ed23a64af2197104'
}
foreach ($name in $expected.Keys) {
  $actual = (Get-FileHash "mc_templates/datasets/coarse_semantic_voxels/v1/$name" -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[$name]) { throw "$name hash changed: $actual" }
}
Write-Output 'Dataset v1 hashes verified.'
```

Expected: `Dataset v1 hashes verified.`

- [ ] **Step 4: Confirm only intended files changed**

```powershell
git status --short
git diff --check
git diff --stat
```

Expected: no whitespace errors and no canonical Dataset v1 diff.

- [ ] **Step 5: Commit the implementation**

```powershell
git add src/construction/learning/stage7DatasetReviewOverlay.js src/construction/learning/coarseSemanticVoxelDataset.js src/construction/learning/coarseSemanticVoxelDatasetCase.js src/construction/learning/stage7DatasetReviewPack.js test/stage7DatasetReviewOverlay.test.js test/stage7DatasetCli.test.js test/stage7DatasetReviewPack.test.js test/coarseSemanticVoxelDatasetCase.test.js
git commit -m "feat(stage7): record reviewed author provenance"
```

Expected: one focused implementation commit, ready for the first real `research-only` case review record.
