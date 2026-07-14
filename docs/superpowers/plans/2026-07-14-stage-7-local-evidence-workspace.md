# Stage 7 Local Evidence Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not dispatch agents: the user explicitly requires sequential execution.

**Goal:** Create a local, Git-ignored evidence workspace with prefilled six-pilot intake forms, deterministic v3 plan artifacts, and an advisory baseline audit.

**Architecture:** Reuse the existing Node-only v3 Dataset builder to materialize local artifacts under .tmp/, never at a committed Dataset path. Static Markdown forms stage human evidence separately from committed review records. The existing readiness CLI then reads immutable inputs and local artifacts and writes an advisory report outside Dataset roots.

**Tech Stack:** Node.js 24.18.0, npm run dataset:stage7, npm run audit:stage7:readiness, sha256sum, Git read-only verification, and Markdown files created with apply_patch.

## Global Constraints

- Execute sequentially; do not use agents or parallel commands.
- Write generated files only under .tmp/stage7-dataset/v3/, .tmp/stage7-readiness-workspace/, .tmp/stage7-readiness-evidence/, and .tmp/stage7-readiness-audit-baseline/.
- Never write mc_templates/datasets/coarse_semantic_voxels/{v1,v2,v3} or mc_templates/curation/stage7_dataset_reviews.jsonl.
- Keep Dataset v3 ready_for_m3_real_data false and training_eligible_count zero.
- Do not run a trainer, import Python, call a provider, push, change a gate, or enable M4 Apply Mode.
- Treat all current evidence as restricted/research-only until an authorized human provides new written evidence; no template may claim approval.

---

### Task 1: Capture immutable baseline and materialize local v3 plans

**Files:**
- Create (ignored): .tmp/stage7-readiness-workspace/index/
- Create (ignored): .tmp/stage7-dataset/v3/cases/house-a-small-modern-house/plan.raw.json
- Create (ignored): .tmp/stage7-dataset/v3/cases/house-lakehouse/plan.raw.json
- Create (ignored): .tmp/stage7-dataset/v3/cases/house-tavern/plan.raw.json
- Create (ignored): .tmp/stage7-dataset/v3/cases/house-watermill/plan.raw.json
- Create (ignored): .tmp/stage7-dataset/v3/cases/house-wood-modern-house/plan.raw.json
- Create (ignored): .tmp/stage7-dataset/v3/cases/temples-japanese-pagoda-plus-tea-house/plan.raw.json

**Interfaces:**
- Consumes: committed templates, mc_templates/curation/stage7_dataset_reviews.jsonl, and the existing v3 builder.
- Produces: local plans for the six fixed pilots at the paths stored in committed Dataset v3 records.

- [ ] **Step 1: Record protected manifest hashes and gate before generating files**

    sha256sum mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json
    /home/guoba/.nvm/versions/node/v24.18.0/bin/node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json','utf8')); console.log(JSON.stringify({ready_for_m3_real_data:m.ready_for_m3_real_data,training_eligible_count:m.training_eligible_count}));"

Expected: hashes fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749, af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654, and 5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082; gate JSON is {"ready_for_m3_real_data":false,"training_eligible_count":0}.

- [ ] **Step 2: Verify every intended .tmp target is absent before invoking the builder**

    test ! -e .tmp/stage7-dataset/v3
    test ! -e .tmp/stage7-readiness-workspace/index

Expected: both commands exit 0. If either target exists, stop without deleting or replacing it.

- [ ] **Step 3: Materialize v3 artifacts only in the approved ignored paths**

    /home/guoba/.nvm/versions/node/v24.18.0/bin/npm run dataset:stage7 -- --dataset-version v3 --review-overlay mc_templates/curation/stage7_dataset_reviews.jsonl --require-eligible 0 --out .tmp/stage7-readiness-workspace/index --local-artifacts .tmp/stage7-dataset/v3

Expected: the Node-only command completes without training and creates local artifacts. It must not target a mc_templates/datasets/ path.

- [ ] **Step 4: Verify the six expected plan files exist**

    for id in house-a-small-modern-house house-lakehouse house-tavern house-watermill house-wood-modern-house temples-japanese-pagoda-plus-tea-house; do test -f ".tmp/stage7-dataset/v3/cases/$id/plan.raw.json"; done

Expected: exit 0.

### Task 2: Create human-only prefilled intake forms

**Files:**
- Create (ignored): .tmp/stage7-readiness-evidence/README.md
- Create (ignored): .tmp/stage7-readiness-evidence/house-a-small-modern-house.md
- Create (ignored): .tmp/stage7-readiness-evidence/house-lakehouse.md
- Create (ignored): .tmp/stage7-readiness-evidence/house-tavern.md
- Create (ignored): .tmp/stage7-readiness-evidence/house-watermill.md
- Create (ignored): .tmp/stage7-readiness-evidence/house-wood-modern-house.md
- Create (ignored): .tmp/stage7-readiness-evidence/temples-japanese-pagoda-plus-tea-house.md

**Interfaces:**
- Consumes: immutable fields from each committed v3 case record.
- Produces: Markdown evidence forms that distinguish copied facts from human-required evidence and never imply an approval.

- [ ] **Step 1: Create the workspace README with fill instructions and boundaries**

Use apply_patch to create .tmp/stage7-readiness-evidence/README.md. It must state that the directory is local staging only; no form changes Dataset/review/gate; the human must supply written permission for local-training; and the form is not a training authorization.

- [ ] **Step 2: Create six forms with copied baseline facts and blank human fields**

Use apply_patch to create one form per file listed above. Every form must include its exact case ID; source file, URL, source SHA-256, author/uploader information, current restricted local-analysis permission, current research-only review, existing canonical front, blocked envelope/site/space layers, rejected semantic status, expected plan SHA-256, and local plan path.

Every form must include visibly blank fields for a rights-holder's written permission, reviewer identity/role/date, revised human review decision, permitted/blocked layers, semantic acceptance decision, and notes. Every form must say: Current committed status is not approval. Do not edit Dataset or review overlay from this form.

- [ ] **Step 3: Verify all forms are present and contain no positive authorization claim**

    test -f .tmp/stage7-readiness-evidence/README.md
    for id in house-a-small-modern-house house-lakehouse house-tavern house-watermill house-wood-modern-house temples-japanese-pagoda-plus-tea-house; do test -f ".tmp/stage7-readiness-evidence/$id.md"; done
    ! rg -n 'training is authorized|gate is open|M4 enabled' .tmp/stage7-readiness-evidence

Expected: all checks exit 0.

### Task 3: Generate and inspect the advisory baseline report

**Files:**
- Create (ignored): .tmp/stage7-readiness-audit-baseline/stage7-real-case-readiness-audit.json
- Create (ignored): .tmp/stage7-readiness-audit-baseline/stage7-real-case-readiness-audit.md

**Interfaces:**
- Consumes: committed Dataset v3 records, committed review overlay, and .tmp/stage7-dataset/v3/ local plans.
- Produces: a canonical blocker report only; no Dataset or review mutation.

- [ ] **Step 1: Confirm the audit output target is absent**

    test ! -e .tmp/stage7-readiness-audit-baseline

Expected: exit 0; otherwise stop without deleting or replacing it.

- [ ] **Step 2: Run the readiness audit with an explicit local artifact root and safe output path**

    /home/guoba/.nvm/versions/node/v24.18.0/bin/npm run audit:stage7:readiness -- --artifact-root .tmp/stage7-dataset/v3 --out .tmp/stage7-readiness-audit-baseline

Expected: exit code 0 because the inputs are valid and the six per-case blockers are advisory findings; both report files are created. The report must still show every gate contribution as false. Exit code 2 is reserved for global input failures, such as a missing or malformed required input.

- [ ] **Step 3: Verify the three mandatory safety claims in the JSON report**

    /home/guoba/.nvm/versions/node/v24.18.0/bin/node -e "const fs=require('fs'); const a=JSON.parse(fs.readFileSync('.tmp/stage7-readiness-audit-baseline/stage7-real-case-readiness-audit.json','utf8')); const c={advisory_only:a.advisory_only,mutates_dataset:a.mutates_dataset,authorizes_training:a.authorizes_training}; console.log(JSON.stringify(c)); if (!c.advisory_only||c.mutates_dataset||c.authorizes_training) process.exitCode=1;"

Expected: {"advisory_only":true,"mutates_dataset":false,"authorizes_training":false}.

### Task 4: Re-verify immutable boundaries and hand off the forms

**Files:**
- Verify only: committed Dataset v1/v2/v3 and the review overlay.

**Interfaces:**
- Consumes: baseline hashes from Task 1 and generated local files.
- Produces: evidence that preparation left protected inputs unchanged, plus exact paths for the human reviewer.

- [ ] **Step 1: Re-check Dataset bytes, Git diff, and gate after all local generation**

    sha256sum mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json
    git diff --exit-code -- mc_templates/datasets/coarse_semantic_voxels/v1 mc_templates/datasets/coarse_semantic_voxels/v2 mc_templates/datasets/coarse_semantic_voxels/v3 mc_templates/curation/stage7_dataset_reviews.jsonl
    /home/guoba/.nvm/versions/node/v24.18.0/bin/node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json','utf8')); console.log(JSON.stringify({ready_for_m3_real_data:m.ready_for_m3_real_data,training_eligible_count:m.training_eligible_count}));"

Expected: all Task 1 hashes exactly match, Git diff exits 0, and the gate JSON remains {"ready_for_m3_real_data":false,"training_eligible_count":0}.

- [ ] **Step 2: Hand off only the six human forms and the baseline report**

Report .tmp/stage7-readiness-evidence/, the six Markdown filenames, and .tmp/stage7-readiness-audit-baseline/. State that forms do not alter committed evidence and that a separately approved design is required before any future review/Dataset/gate integration.
