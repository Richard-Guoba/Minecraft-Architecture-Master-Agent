# Stage 7 P0 M2.5 Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the complete Stage 7 M2/M2.5 trusted-data branch into `main` and prove that its 382-test baseline, Dataset v1, Dataset v2, review pack, and fail-closed readiness behavior are reproducible.

**Architecture:** Preserve the feature branch's individual commits with a normal merge into the reviewed local `main`. Treat all generated data as untrusted until full tests, fixed-epoch artifact hashes, an independent second build, and the expected non-zero real-data readiness gate have been verified.

**Tech Stack:** Git, Node.js 20+, npm, Node.js `node:test`, PowerShell `Get-FileHash`, Stage 7 JavaScript dataset and review-pack CLIs.

## Global Constraints

- Target runtime remains Minecraft Java 1.21 / 1.21.1 with datapack `pack_format: 48`.
- Normal Windows runtime remains Node.js 20+ and must not acquire a Python dependency.
- `main` may contain the approved design and plan commits; any other uncommitted or unexpected divergent work blocks the merge.
- Preserve M2/M2.5 commit history; do not squash or rewrite the feature branch.
- Use `SOURCE_DATE_EPOCH=1783814400` for all P0 reproducibility evidence.
- Dataset v1 is immutable; any Dataset v1 byte or hash drift is a hard failure.
- Generated `.tmp/`, `out/`, `.env`, secrets, logs, and local diagnostic artifacts must not be committed.
- Automation must generate zero positive human review or license claims.
- P0 must leave real-data training blocked because the six pilot cases still have no human outcomes.
- P1 human review and P2 Python/PyTorch work are outside this plan.

## File Map

- Existing feature branch: `codex/stage-7-m2-dataset` — source of all M2/M2.5 code, tests, data indexes, and benchmark evidence.
- Existing specification: `docs/superpowers/specs/2026-07-12-stage-7-p0-p1-scale-ready-integration-design.md` — approved P0/P1 behavior and gates.
- Existing evidence: `docs/benchmarks/stage7-m2-dataset-v1.md` — authoritative Dataset v1 hashes.
- Existing evidence: `docs/benchmarks/stage7-m2-5-dataset-v2.md` — authoritative Dataset v2 hashes and readiness state.
- Generated canonical tree: `mc_templates/datasets/coarse_semantic_voxels/v1/` — immutable Dataset v1 versioned output.
- Generated canonical tree: `mc_templates/datasets/coarse_semantic_voxels/v2/` — Dataset v2 pre-review output.
- Generated ignored trees: `.tmp/stage7-p0-repro/` — independent reproduction outputs and review packs.
- No new runtime source file is created by P0.

---

### Task 1: Verify Integration Preconditions and Merge M2.5

**Files:**
- Merge: all paths changed by `codex/stage-7-m2-dataset`
- Preserve: `docs/superpowers/specs/2026-07-12-stage-7-p0-p1-scale-ready-integration-design.md`
- Preserve: `docs/superpowers/plans/2026-07-12-stage-7-p0-m2-5-integration.md`

**Interfaces:**
- Consumes: local `main`, `origin/main`, and `codex/stage-7-m2-dataset` Git refs.
- Produces: one normal merge commit on `main` whose second parent is the M2.5 branch tip `06eeca8ec148f7d25a430cdcee7b106b74b44022`.

- [ ] **Step 1: Fetch the authoritative remote refs**

Run:

```powershell
git fetch origin
```

Expected: exit code 0 with no working-tree changes.

- [ ] **Step 2: Verify the current branch and working tree**

Run:

```powershell
git branch --show-current
git status --short --branch
git rev-list --left-right --count origin/main...main
git rev-parse codex/stage-7-m2-dataset
```

Expected:

- current branch is `main`;
- no status lines appear below the `## main...origin/main` header;
- `main` is ahead only by the approved design and implementation-plan commits and is not behind `origin/main`;
- the M2.5 branch resolves to `06eeca8ec148f7d25a430cdcee7b106b74b44022`.

- [ ] **Step 3: Re-run the conflict preview against the actual current merge base**

Run:

```powershell
$base = git merge-base main codex/stage-7-m2-dataset
$preview = git merge-tree $base main codex/stage-7-m2-dataset
$conflicts = $preview | Select-String -Pattern '<<<<<<<|changed in both|CONFLICT'
if ($conflicts) { $conflicts; throw 'P0 merge preview contains conflicts.' }
```

Expected: exit code 0 and no conflict lines.

- [ ] **Step 4: Merge while preserving feature history**

Run:

```powershell
git merge --no-ff codex/stage-7-m2-dataset -m "Merge Stage 7 M2.5 trusted data loop"
```

Expected: exit code 0 and a merge commit; no manual conflict resolution is required.

- [ ] **Step 5: Verify the merge graph and cleanliness**

Run:

```powershell
git show --no-patch --format='%H%n%P%n%s' HEAD
git status --short
```

Expected:

- subject is `Merge Stage 7 M2.5 trusted data loop`;
- the commit has exactly two parents;
- the second parent is `06eeca8ec148f7d25a430cdcee7b106b74b44022`;
- `git status --short` prints nothing.

---

### Task 2: Verify the Complete Node.js Regression Baseline

**Files:**
- Test: `test/**/*.test.js`
- Read: `package.json`
- Read: merged Stage 7 source under `src/construction/learning/`

**Interfaces:**
- Consumes: the merged Node.js source and `npm test` script.
- Produces: fresh evidence that the integrated tree passes exactly 382 tests.

- [ ] **Step 1: Confirm the merged Stage 7 CLI entries**

Run:

```powershell
node -e "const p=require('./package.json'); for (const k of ['dataset:stage7','review-pack:stage7']) { if (!p.scripts[k]) throw new Error('missing '+k); console.log(k+'='+p.scripts[k]); }"
```

Expected:

```text
dataset:stage7=node src/buildCoarseSemanticVoxelDataset.js
review-pack:stage7=node src/buildStage7DatasetReviewPack.js
```

- [ ] **Step 2: Run the complete test suite**

Run:

```powershell
npm test
```

Expected final summary:

```text
tests 382
pass 382
fail 0
cancelled 0
skipped 0
todo 0
```

- [ ] **Step 3: Verify tests left no tracked changes**

Run:

```powershell
git status --short
```

Expected: no output.

---

### Task 3: Reproduce Dataset v1 and Dataset v2

**Files:**
- Verify: `mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json`
- Verify: `mc_templates/datasets/coarse_semantic_voxels/v1/cases.jsonl`
- Verify: `mc_templates/datasets/coarse_semantic_voxels/v1/splits.json`
- Verify: `mc_templates/datasets/coarse_semantic_voxels/v1/reports/summary.md`
- Verify: `mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json`
- Verify: `mc_templates/datasets/coarse_semantic_voxels/v2/cases.jsonl`
- Verify: `mc_templates/datasets/coarse_semantic_voxels/v2/splits.json`
- Verify: `mc_templates/datasets/coarse_semantic_voxels/v2/reports/summary.md`
- Verify: `mc_templates/datasets/coarse_semantic_voxels/v2/reports/readiness.md`
- Generate ignored: `.tmp/stage7-p0-repro/dataset-v1/`
- Generate ignored: `.tmp/stage7-p0-repro/dataset-v2/`

**Interfaces:**
- Consumes: raw schematics, `mc_templates/analysis/case_library.v2.json`, the default Stage 7 review overlay, and fixed generation epoch `1783814400`.
- Produces: canonical and independent Dataset v1/v2 builds with byte-identical versioned files.

- [ ] **Step 1: Set the fixed epoch and rebuild canonical Dataset v1**

Run:

```powershell
$env:SOURCE_DATE_EPOCH = '1783814400'
npm run dataset:stage7 -- --dataset-version v1 --require-eligible 0
```

Expected: 64 cases, 0 training eligible, and splits `train=56, validation=3, test=5`.

- [ ] **Step 2: Build an independent Dataset v1 tree**

Run:

```powershell
npm run dataset:stage7 -- --dataset-version v1 --require-eligible 0 --out .tmp/stage7-p0-repro/dataset-v1 --local-artifacts .tmp/stage7-p0-repro/local-v1
```

Expected: the same 64 cases, eligibility count, and split counts.

- [ ] **Step 3: Rebuild canonical Dataset v2**

Run:

```powershell
npm run dataset:stage7 -- --dataset-version v2 --require-eligible 0
```

Expected: 64 cases, 0 training eligible, and splits `train=56, validation=3, test=5`.

- [ ] **Step 4: Build an independent Dataset v2 tree**

Run:

```powershell
npm run dataset:stage7 -- --dataset-version v2 --require-eligible 0 --out .tmp/stage7-p0-repro/dataset-v2 --local-artifacts .tmp/stage7-p0-repro/local-v2
```

Expected: the same 64 cases, eligibility count, and split counts.

- [ ] **Step 5: Verify all recorded canonical SHA-256 values**

Run:

```powershell
$expected = [ordered]@{
  'mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json' = 'fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749'
  'mc_templates/datasets/coarse_semantic_voxels/v1/cases.jsonl' = 'c316a5673428830c72291ff0e67a686cd671fdc7ef75e277637c959870a21337'
  'mc_templates/datasets/coarse_semantic_voxels/v1/splits.json' = 'edab78808431fa29014f011de29dba5451680e763519713c2bd312be0a192db5'
  'mc_templates/datasets/coarse_semantic_voxels/v1/reports/summary.md' = '4dd84270cd6e93e1f854dca95326b6300e4677f2e8e97936ed23a64af2197104'
  'mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json' = '7412c100577831449c6403a8ed59ba4716a48f49fef1b8455462ed0416dd19fc'
  'mc_templates/datasets/coarse_semantic_voxels/v2/cases.jsonl' = 'eaa350059eb62367a9fa44ecadaf7dae6aed138e64a446809f14f35fd4fa4e09'
  'mc_templates/datasets/coarse_semantic_voxels/v2/splits.json' = 'edab78808431fa29014f011de29dba5451680e763519713c2bd312be0a192db5'
  'mc_templates/datasets/coarse_semantic_voxels/v2/reports/summary.md' = 'c1194f6bad86b2bafeb0c41471ebe037cb0e3da9959aefd70349263d0bc84ff0'
  'mc_templates/datasets/coarse_semantic_voxels/v2/reports/readiness.md' = 'ae3ef93990586855d16bf97af93eab70c9187b005a944558e5c33edb7c9223a6'
}
foreach ($item in $expected.GetEnumerator()) {
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $item.Key).Hash.ToLowerInvariant()
  if ($actual -ne $item.Value) { throw "Hash mismatch: $($item.Key) expected $($item.Value) actual $actual" }
  Write-Output "$actual  $($item.Key)"
}
```

Expected: nine hash lines and exit code 0.

- [ ] **Step 6: Compare canonical and independent dataset files byte-for-byte**

Run:

```powershell
$pairs = @(
  @('mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json', '.tmp/stage7-p0-repro/dataset-v1/manifest.json'),
  @('mc_templates/datasets/coarse_semantic_voxels/v1/cases.jsonl', '.tmp/stage7-p0-repro/dataset-v1/cases.jsonl'),
  @('mc_templates/datasets/coarse_semantic_voxels/v1/splits.json', '.tmp/stage7-p0-repro/dataset-v1/splits.json'),
  @('mc_templates/datasets/coarse_semantic_voxels/v1/reports/summary.md', '.tmp/stage7-p0-repro/dataset-v1/reports/summary.md'),
  @('mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json', '.tmp/stage7-p0-repro/dataset-v2/manifest.json'),
  @('mc_templates/datasets/coarse_semantic_voxels/v2/cases.jsonl', '.tmp/stage7-p0-repro/dataset-v2/cases.jsonl'),
  @('mc_templates/datasets/coarse_semantic_voxels/v2/splits.json', '.tmp/stage7-p0-repro/dataset-v2/splits.json'),
  @('mc_templates/datasets/coarse_semantic_voxels/v2/reports/summary.md', '.tmp/stage7-p0-repro/dataset-v2/reports/summary.md'),
  @('mc_templates/datasets/coarse_semantic_voxels/v2/reports/readiness.md', '.tmp/stage7-p0-repro/dataset-v2/reports/readiness.md')
)
foreach ($pair in $pairs) {
  $left = (Get-FileHash -Algorithm SHA256 -LiteralPath $pair[0]).Hash
  $right = (Get-FileHash -Algorithm SHA256 -LiteralPath $pair[1]).Hash
  if ($left -ne $right) { throw "Independent build mismatch: $($pair[0]) vs $($pair[1])" }
}
Write-Output 'Dataset v1/v2 independent reproduction: 9/9 files identical.'
```

Expected: `Dataset v1/v2 independent reproduction: 9/9 files identical.`

- [ ] **Step 7: Confirm canonical rebuilds made no tracked changes**

Run:

```powershell
git diff --exit-code -- mc_templates/datasets/coarse_semantic_voxels/v1 mc_templates/datasets/coarse_semantic_voxels/v2
```

Expected: exit code 0 and no diff.

---

### Task 4: Reproduce the Review Pack and Prove Fail-Closed Readiness

**Files:**
- Generate ignored: `.tmp/stage7-p0-repro/review-pack-a/`
- Generate ignored: `.tmp/stage7-p0-repro/review-pack-b/`
- Verify: `mc_templates/datasets/coarse_semantic_voxels/v2/reports/readiness.md`

**Interfaces:**
- Consumes: the fixed six pilot IDs, raw schematics, Dataset v1 extraction, and fixed epoch.
- Produces: two byte-identical 26-file review packs and evidence that the real-data gate remains non-zero.

- [ ] **Step 1: Generate two independent review packs**

Run:

```powershell
$env:SOURCE_DATE_EPOCH = '1783814400'
npm run review-pack:stage7 -- --out .tmp/stage7-p0-repro/review-pack-a
npm run review-pack:stage7 -- --out .tmp/stage7-p0-repro/review-pack-b
```

Expected for both runs:

```text
Cases: 6
Positive reviews generated by automation: 0
```

- [ ] **Step 2: Compare every review-pack file by relative path and SHA-256**

Run:

```powershell
$aRoot = (Resolve-Path '.tmp/stage7-p0-repro/review-pack-a').Path
$bRoot = (Resolve-Path '.tmp/stage7-p0-repro/review-pack-b').Path
$a = @(Get-ChildItem -Recurse -File $aRoot | ForEach-Object {
  [pscustomobject]@{
    RelativePath = $_.FullName.Substring($aRoot.Length + 1).Replace('\', '/')
    Hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
  }
} | Sort-Object RelativePath)
$b = @(Get-ChildItem -Recurse -File $bRoot | ForEach-Object {
  [pscustomobject]@{
    RelativePath = $_.FullName.Substring($bRoot.Length + 1).Replace('\', '/')
    Hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
  }
} | Sort-Object RelativePath)
if ($a.Count -ne 26 -or $b.Count -ne 26) { throw "Expected 26 review-pack files per build; found $($a.Count) and $($b.Count)." }
$delta = @(Compare-Object -ReferenceObject $a -DifferenceObject $b -Property RelativePath, Hash)
if ($delta.Count) { $delta; throw 'Review-pack builds differ.' }
Write-Output 'Review-pack independent reproduction: 26/26 files identical.'
```

Expected: `Review-pack independent reproduction: 26/26 files identical.`

- [ ] **Step 3: Verify the review pack contains no positive automated claims**

Run:

```powershell
$index = Get-Content -Raw '.tmp/stage7-p0-repro/review-pack-a/index.json' | ConvertFrom-Json
if ($index.case_count -ne 6) { throw "Expected six pilot cases, found $($index.case_count)." }
$reviews = Get-ChildItem -Recurse -Filter review.json '.tmp/stage7-p0-repro/review-pack-a' | ForEach-Object { Get-Content -Raw $_.FullName | ConvertFrom-Json }
$positive = @($reviews | Where-Object {
  $_.correction_template.status -ne 'pending' -or
  $_.correction_template.reviewed_by -ne '' -or
  $_.correction_template.license_status -ne 'unknown' -or
  @($_.correction_template.allowed_uses).Count -ne 0
})
if ($positive.Count) { throw 'Automation generated a positive review claim.' }
Write-Output 'Review-pack governance: 6/6 blank human decisions; 0 positive automated claims.'
```

Expected: `Review-pack governance: 6/6 blank human decisions; 0 positive automated claims.`

- [ ] **Step 4: Run the real-data readiness gate and require it to fail closed**

Run:

```powershell
npm run dataset:stage7 -- --dataset-version v2 --out .tmp/stage7-p0-repro/readiness-check --local-artifacts .tmp/stage7-p0-repro/readiness-local --require-reviewed 6 --require-semantic-accepted 3 --require-eligible 3
if ($LASTEXITCODE -eq 0) { throw 'P0 unexpectedly opened the M3 real-data readiness gate.' }
Write-Output 'Real-data readiness remains correctly blocked before human review.'
```

Expected: the dataset command exits non-zero because it finds 0 reviewed, 0 semantic-accepted, and 0 eligible pilot cases; the wrapper prints the confirmation line and exits zero.

- [ ] **Step 5: Verify the committed readiness report remains false**

Run:

```powershell
$manifest = Get-Content -Raw 'mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json' | ConvertFrom-Json
if ($manifest.reviewed_count -ne 0) { throw "Expected reviewed_count=0, found $($manifest.reviewed_count)." }
if ($manifest.semantic_accepted_count -ne 0) { throw "Expected semantic_accepted_count=0, found $($manifest.semantic_accepted_count)." }
if ($manifest.training_eligible_count -ne 0) { throw "Expected training_eligible_count=0, found $($manifest.training_eligible_count)." }
if ($manifest.ready_for_m3_real_data -ne $false) { throw 'Expected ready_for_m3_real_data=false.' }
Write-Output 'Dataset v2 readiness: reviewed=0 semantic-accepted=0 eligible=0 ready=false.'
```

Expected: the exact confirmation line above.

---

### Task 5: Close P0 and Hand Off to P1

**Files:**
- Read: `README.md`
- Read: `AGENT.md`
- Read: `docs/roadmap.md`
- Read: `docs/index.html`
- Read: `docs/benchmarks/stage7-m2-dataset-v1.md`
- Read: `docs/benchmarks/stage7-m2-5-dataset-v2.md`

**Interfaces:**
- Consumes: verification results from Tasks 1-4.
- Produces: a clean integrated `main` and a P1 starting state with real-data training still blocked.

- [ ] **Step 1: Verify project documentation describes M2.5 as in progress**

Run:

```powershell
rg -n "M2\.5|382|human|人工|license|许可|training|训练" README.md AGENT.md docs/roadmap.md docs/index.html docs/benchmarks/stage7-m2-dataset-v1.md docs/benchmarks/stage7-m2-5-dataset-v2.md
```

Expected: M2.5, human/license review, and blocked real-data training are visible; no document claims Stage 7 learned generation is complete.

- [ ] **Step 2: Verify no tracked output drift**

Run:

```powershell
git diff --exit-code
git status --short
```

Expected: both commands produce no diff or status entries.

- [ ] **Step 3: Record the integrated head for the handoff**

Run:

```powershell
git log --oneline --decorate -5
git show --stat --oneline --summary HEAD
```

Expected: `HEAD` is the M2.5 merge commit, the M2.5 feature tip is reachable from `main`, and the approved design and plan commits are also in `main` history.

- [ ] **Step 4: Declare the P0 exit state**

Record all of the following in the execution handoff:

```text
P0 complete
- M2.5 history merged into main
- Node.js tests: 382/382 pass
- Dataset v1 recorded hashes: 4/4 match
- Dataset v2 recorded hashes: 5/5 match
- Independent dataset reproduction: 9/9 files identical
- Independent review-pack reproduction: 26/26 files identical
- Positive reviews generated by automation: 0
- M3 real-data readiness: blocked as expected
- Working tree: clean
```

Expected: every line is backed by fresh command output from Tasks 1-4. If any line cannot be supported, P0 remains incomplete.
