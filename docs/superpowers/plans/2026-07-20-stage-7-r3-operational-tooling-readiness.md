# Stage 7 R3 Operational Tooling Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents: the owner explicitly requires sequential work.

**Goal:** Build and verify the isolated, exact-approval-gated tooling needed to receive and process one owner-approved public Minecraft Java Structure `.nbt` candidate at a time, using synthetic payloads only during this plan.

**Architecture:** Add a strict 5-primary/3-reserve named-batch contract, an operational event/store layer over the R2 state machine, a bounded single-URL HTTPS receiver, idempotent local artifact stores, a deterministic machine pipeline, explicit human final-review records, and a separately named CLI with Git/private/Dataset preflight. Preserve R2's synthetic defaults and reuse its bounded decoder, single-structure adapter, nine-token preparation, and fingerprints; no real candidate is nominated, downloaded, parsed, or approved in this plan.

**Tech Stack:** Node.js 24.18.0 ESM; built-in `node:assert`, `node:crypto`, `node:fs/promises`, `node:path`, `node:test`, `node:url`, `node:util`, Web `fetch`/`Response` streams, and existing Stage 7 source-expansion, private-boundary, R1 admission, and R2 readiness modules; existing `mcagent-stage7` Conda environment only for the read-only private preflight; no new dependency.

## Global Constraints

- Execute sequentially. Do not use subagents, parallel commands, concurrent acquisition, or concurrent training.
- This plan is synthetic-only implementation readiness. Do not make a real network request, nominate an exact real candidate, create a real named-batch approval, download or inspect a real `.nbt`, or mutate operational candidate payload paths.
- Tests create synthetic `.nbt` bytes and mocked `Response` objects only below fresh operating-system temporary roots.
- Do not clone a repository, acquire a directory or archive, extract an archive, authenticate to a source, recursively crawl, fetch a dependency, or expose a caller-supplied general URL.
- Preserve R2's production budgets exactly: 16 MiB raw, 64 MiB inflated, 200:1 compression ratio, depth 32, 1,500,000 entries, 32 KiB per string, `64^3` blocks, 4,096 palette entries, 16,384 block-entity-bearing entries, actual non-air extent at most 64 on each axis, and token 8 at most 10 percent of non-air voxels.
- Do not crop, rotate retained evidence, rescale, tile, split, merge, complete, repair, or assemble any candidate.
- Keep the 22-case private corpus, 42 deferred oversized private buildings, 15/7 split, and three existing local run directories untouched. Never print private filenames, URLs, hashes, losses, metrics, checkpoints, reconstructions, weights, tensors, or outputs.
- Preserve Dataset manifest SHA-256 values `fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749`, `af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654`, and `5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082`.
- Dataset v3 remains exactly `ready_for_m3_real_data=false` and `training_eligible_count=0`.
- Do not change normal Node generation, the primary provider, M3, the private trainer, or M4 Apply Mode.
- Operational results always set `authorizes_training:false` and `authorizes_dataset_admission:false`. Only the exact owner-bound approval object and its `named_batch_approved` readiness event may set `authorizes_acquisition:true`.
- Real public candidate state remains ignored below `.local/stage7-source-expansion/` and never enters Git.
- Do not push, publish, upload, share, package, or export any private data or any candidate payload, prepared artifact, fingerprint, render, metric, model artifact, or generated output.
- Stop this plan after synthetic tooling readiness and a completion handoff. Metadata refresh, the exact 5+3 owner review package, real acquisition, and the five-of-five pilot require a later plan bound to exact candidate IDs.

---

## Scope split

The approved R3 design contains two separately owner-gated deliverables:

1. **This plan:** implement and verify operational tooling with synthetic inputs and zero real payloads.
2. **Later exact-pilot plan:** refresh public metadata, name eight immutable assets, obtain owner approval for that exact 5+3 batch, and run candidates sequentially.

The split is mandatory because the exact candidates, revisions, file paths, evidence hashes, and owner approval do not exist yet. A real-pilot plan containing placeholders would weaken the named-asset gate.

## File map

- Create `src/construction/learning/stage7PilotBatch.js`: named-batch validation, canonical hashing, diversity, exact candidate selection, and reserve eligibility.
- Create `src/construction/learning/stage7PilotFilesystem.js`: containment, no-symlink checks, canonical JSON/JSONL, idempotent atomic writes, and fsync.
- Create `src/construction/learning/stage7PilotReadinessStore.js`: operational hash-chained event ledger.
- Create `src/construction/learning/stage7CandidateAcquisition.js`: one-candidate HTTPS streaming receiver and quarantine placement.
- Create `src/construction/learning/stage7PilotArtifacts.js`: prepared-volume, sidecar, fingerprint, and review-ledger persistence.
- Create `src/construction/learning/stage7PilotReview.js`: strict human decision contract and final transitions.
- Create `src/construction/learning/stage7Pilot.js`: resumable one-candidate orchestration.
- Create `src/construction/learning/stage7PilotPreflight.js`: Git/private/public/Dataset assertions.
- Create `src/runStage7PublicNbtPilot.js`: exact `validate-batch`, `run-candidate`, `record-review`, and `audit` commands.
- Create `test/fixtures/stage7PilotFixtures.js` and focused tests `test/stage7PilotBatch.test.js`, `test/stage7PilotReadiness.test.js`, `test/stage7PilotFilesystem.test.js`, `test/stage7CandidateAcquisition.test.js`, `test/stage7PilotArtifacts.test.js`, `test/stage7Pilot.test.js`, `test/stage7PilotReview.test.js`, `test/stage7PublicNbtPilotCli.test.js`, and `test/stage7PilotBoundary.test.js`.
- Modify `stage7CandidateReadinessState.js`, `stage7CandidateReadinessStore.js`, `stage7ConditionalVoxelPreparation.js`, and `stage7ConditionalFingerprint.js` only to add explicit operational evidence while preserving default R2 synthetic behavior.
- Modify `test/stage7CandidateReadinessBoundary.test.js`, `package.json`, and `README.md` for the new isolated surface.
- Create `docs/superpowers/handoffs/2026-07-20-stage-7-r3-operational-tooling-readiness-complete.md` with aggregate-only completion evidence.

## Mandatory execution opening gate

Run this gate before Task 1 and before modifying implementation files. All commands are read-only. If status, branch, ignored-root state, public operational inventory, private aggregate/preflight, formal hashes, or the false/zero gate differs unexpectedly, stop and report the drift; do not repair it inside R3.

- [ ] **Confirm Git and ignored-root state**

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log -1 --format=%s
git ls-files .local/stage7-private-research
git check-ignore -q .local/stage7-private-research
git ls-files .local/stage7-source-expansion
git check-ignore -q .local/stage7-source-expansion
```

Expected: clean status; branch `codex/stage7-dataset-v3-extraction`; HEAD subject `docs(stage7): plan R3 operational tooling readiness`; both `git ls-files` outputs empty; both ignore checks exit zero.

- [ ] **Confirm private aggregates and formal Dataset invariants without private records**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node -e "const fs=require('fs'),crypto=require('crypto'),path=require('path'); const repo=process.cwd(); const root=path.join(repo,'.local/stage7-private-research'); const lines=(f)=>fs.readFileSync(f,'utf8').trim().split(/\\n/).filter(Boolean).length; const split=JSON.parse(fs.readFileSync(path.join(root,'splits/split.json'),'utf8')); const prepared=fs.readdirSync(path.join(root,'prepared')).filter((n)=>n.endsWith('.voxels.bin')); const hashes=['v1','v2','v3'].map((v)=>[v,crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,'mc_templates/datasets/coarse_semantic_voxels',v,'manifest.json'))).digest('hex')]); const v3=JSON.parse(fs.readFileSync(path.join(repo,'mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json'),'utf8')); console.log(JSON.stringify({source_files:fs.readdirSync(path.join(root,'source')).filter((n)=>n.endsWith('.schematic')).length,deferred_oversized:fs.readdirSync(path.join(root,'deferred/oversized')).filter((n)=>n.endsWith('.schematic')).length,source_records:lines(path.join(root,'manifests/sources.jsonl')),prepared_records:lines(path.join(root,'manifests/prepared.jsonl')),prepared_binary_count:prepared.length,all_prepared_64_cubed:prepared.every((n)=>fs.statSync(path.join(root,'prepared',n)).size===64**3),train_cases:split.train_case_ids.length,validation_cases:split.validation_case_ids.length,run_artifacts:fs.readdirSync(path.join(root,'runs')).length,dataset_hashes:hashes,dataset_v3_gate:{ready_for_m3_real_data:v3.ready_for_m3_real_data,training_eligible_count:v3.training_eligible_count}}));"
```

Expected: 22 active, 42 deferred oversized, 22 source records, 22 prepared records, 22 prepared binaries, all `64^3`, 15 train, 7 validation, three existing run directories, exact formal hashes, and v3 false/zero.

- [ ] **Run complete private preflight without exposing records**

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -c "from pathlib import Path; from mcagent_stage7.private_research import run_private_preflight; p=run_private_preflight(root=Path('../../.local/stage7-private-research'),repo_root=Path('../..')); print({'preflight':'ok','case_count':p.case_count,'dataset_v3_gate':p.dataset_v3_gate})"
```

Expected: `preflight: ok`, case count 22, and v3 false/zero. This must not start or evaluate training.

- [ ] **Confirm R2 operational payload inventory remains zero**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node -e "const fs=require('fs'),path=require('path'); const root=path.resolve('.local/stage7-source-expansion'); const count=(rel)=>{const p=path.join(root,rel); if(!fs.existsSync(p)) return 0; const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).reduce((n,e)=>n+(e.isDirectory()?walk(path.join(d,e.name)):e.isFile()?1:0),0); return walk(p)}; console.log(JSON.stringify({quarantine_files:count('quarantine'),prepared_files:count('prepared'),fingerprint_files:count('fingerprints')}));"
```

Expected: all three counts zero. Existing metadata, evidence, and review-card reports are not payload inventory.

---

### Task 1: Define the exact 5+3 named-batch contract

**Files:**
- Create: `src/construction/learning/stage7PilotBatch.js`
- Create: `test/fixtures/stage7PilotFixtures.js`
- Create: `test/stage7PilotBatch.test.js`

**Interfaces:**
- Consumes: `CANDIDATE_ID_PATTERN`, `LOCAL_ID_PATTERN`, and the R1 state `admission_contract_ready`.
- Produces: `PILOT_BATCH_SCHEMA_VERSION`, `PilotContractError`, `canonicalPilotJson(value)`, `hashPilotValue(value)`, `validatePilotBatchDocument(document)`, `selectPilotCandidate(document, candidateId)`, and `reserveEligible(document, reserveId, readinessRecords)`.
- The validator returns a deeply frozen `{ schema_version, batch, batch_sha256, approval }` clone.

- [ ] **Step 1: Write the synthetic fixture and failing contract tests**

The five primaries use source groups `source-a` through `source-e` and building types `house`, `tower`, `temple`, `ship`, and `ruin`. Three reserves bind respectively to the house, tower, and temple primaries. Each candidate uses a distinct full lowercase 40-character commit SHA, `data/example/structures/<asset>.nbt`, and an immutable raw URL.

Use this exact candidate shape:

```js
{
  candidate_id: 'source-a:house-01',
  role: 'primary',
  reserve_for: null,
  source_id: 'source-a',
  source_group: 'source-a',
  asset_family: 'house-family-01',
  immutable_revision: '1'.repeat(40),
  relative_nbt_path: 'data/example/structures/house-01.nbt',
  canonical_file_url: 'https://raw.example.test/source-a/'
    + '1'.repeat(40) + '/data/example/structures/house-01.nbt',
  approved_redirect_urls: [],
  primary_function: 'residential',
  building_type: 'house',
  style_family: 'rustic',
  environment: 'overworld',
  admission_state: 'admission_contract_ready',
  admission_evidence_sha256: 'a'.repeat(64),
  rights: {
    license_id: 'MIT',
    evidence_url: 'https://example.test/source-a/LICENSE',
    scope: 'repository assets including the named NBT path',
    verified_at: '2026-07-20',
    evidence_sha256: 'b'.repeat(64),
    permissions: {
      download: true, copy: true, transform: true,
      training: true, local_retention: true
    },
    ai_ml_restriction: false,
    platform_conflict: false,
    upstream_conflict: false
  },
  quality: {
    preview_urls: ['https://example.test/source-a/house-01'],
    popularity: 100,
    reception: 10,
    maintenance: 'active',
    owner_quality_decision: 'accept'
  },
  technical: {
    claimed_format: 'minecraft_java_structure_nbt',
    standalone_evidence: 'one complete structure file',
    vanilla_compatible_expected: true,
    external_dependency_expected: false,
    jigsaw_expected: false
  },
  scores: {
    parser_reliability: 1,
    quality: 0.8,
    diversity: 1,
    source_stability: 0.9,
    total: 0.93
  }
}
```

Create the approval document by hashing only the canonical `batch` object:

```js
const batch = {
  batch_id: 'r3-pilot-20260720',
  as_of: '2026-07-20',
  code_revision: 'f'.repeat(40),
  candidates
};
const batchSha256 = hashPilotValue(batch);
return {
  schema_version: 1,
  batch,
  batch_sha256: batchSha256,
  approval: {
    approved_batch_sha256: batchSha256,
    approved_at: '2026-07-20T12:00:00.000Z',
    approved_by: 'owner',
    authorizes_acquisition: true,
    authorizes_training: false,
    authorizes_dataset_admission: false
  }
};
```

Tests assert: exact total score `0.45*parser_reliability + 0.30*quality + 0.15*diversity + 0.10*source_stability`; all rights permissions true; approval binds the batch hash; exact 5+3 roles; at least four primary sources/types with maxima of two; unique same-type reserve bindings; immutable SHA appears in URL; safe lower-case `.nbt` path; and deep freezing. Duplicate ID/URL/path, mutable SHA, unclear rights, conflict flag, score mismatch, unknown key, wrong marker, orphan/fourth reserve, or non-ready admission state must throw a stable error.

- [ ] **Step 2: Run the contract test and verify RED**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PilotBatch.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage7PilotBatch.js`.

- [ ] **Step 3: Implement strict validation and hashing**

Implement these signatures:

```js
export const PILOT_BATCH_SCHEMA_VERSION = 1;
export class PilotContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'PilotContractError';
    this.code = code;
  }
}
export function canonicalPilotJson(value) {
  return `${JSON.stringify(sortKeys(value))}\n`;
}
export function hashPilotValue(value) {
  return createHash('sha256').update(canonicalPilotJson(value)).digest('hex');
}
```

Also export `validatePilotBatchDocument(document)`, `selectPilotCandidate(document, candidateId)`, and `reserveEligible(document, reserveId, readinessRecords)`. Reject unknown/missing keys at every object level. Require `rights.verified_at === batch.as_of`, every permission true, all conflict flags false, score equality within `1e-12`, full SHA and exact URL/path binding, 5+3/diversity/reserve constraints, batch hash equality, and approval hash equality. `reserveEligible` returns true only for an approved reserve whose bound primary is terminal and which has no readiness event of its own. Return deeply frozen structured clones; perform no I/O.

Use these stable codes:

```text
PILOT_DOCUMENT_INVALID
PILOT_BATCH_HASH_INVALID
PILOT_APPROVAL_INVALID
PILOT_CANDIDATE_INVALID
PILOT_CANDIDATE_DUPLICATE
PILOT_RIGHTS_INVALID
PILOT_SCORE_INVALID
PILOT_DIVERSITY_INVALID
PILOT_RESERVE_INVALID
PILOT_CANDIDATE_NOT_APPROVED
PILOT_RESERVE_NOT_ELIGIBLE
```

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PilotBatch.test.js
```

Expected: all batch tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/construction/learning/stage7PilotBatch.js test/fixtures/stage7PilotFixtures.js test/stage7PilotBatch.test.js
git commit -m "feat(stage7): validate exact R3 pilot batches"
```

---

### Task 2: Add operational evidence without changing R2 defaults

**Files:**
- Modify: `src/construction/learning/stage7ConditionalVoxelPreparation.js`
- Modify: `src/construction/learning/stage7ConditionalFingerprint.js`
- Modify: `src/construction/learning/stage7CandidateReadinessState.js`
- Modify: `src/construction/learning/stage7CandidateReadinessStore.js`
- Create: `test/stage7PilotReadiness.test.js`
- Modify: `test/stage7ConditionalVoxelPreparation.test.js`
- Modify: `test/stage7ConditionalFingerprint.test.js`
- Modify: `test/stage7CandidateReadinessStore.test.js`

**Interfaces:**
- `prepareConditionalVolume({ candidateId, contentSha256, volume, evidenceMode = 'synthetic' })` accepts only `synthetic` or `operational`.
- `fingerprintConditionalVolume(prepared)` copies and validates `prepared.record.synthetic_only`.
- `createOperationalReadinessEvent(input)` creates `synthetic_only:false`; acquisition authority is true only for `named_batch_approved`.
- Existing synthetic event hashes, transitions, and temporary store remain compatible.

- [ ] **Step 1: Write failing evidence-mode and event tests**

Add exact assertions:

```js
const operational = prepareConditionalVolume({
  candidateId: ID,
  contentSha256: CONTENT_SHA,
  volume,
  evidenceMode: 'operational'
});
assert.equal(operational.record.synthetic_only, false);
assert.equal(operational.record.authorizes_acquisition, false);
assert.equal(operational.record.authorizes_training, false);
assert.equal(operational.record.authorizes_dataset_admission, false);
assert.equal(fingerprintConditionalVolume(operational).synthetic_only, false);
assert.throws(() => prepareConditionalVolume({
  candidateId: ID, contentSha256: CONTENT_SHA, volume, evidenceMode: 'training'
}), hasCode('EVIDENCE_MODE_INVALID'));
```

Create operational `named_batch_approved`, `acquired_quarantine`, and `pilot_ready` events. Assert only the first authorizes acquisition and none authorize training/Dataset. Passing an operational event to `appendSyntheticReadinessEvent` must fail with `SYNTHETIC_EVENT_REQUIRED`. Existing synthetic integration hashes must remain unchanged.

Also assert these R3-required terminal paths: transport failure from `named_batch_approved` to `quarantined_technical`; post-machine incompleteness from `fingerprinted` to `deferred_incomplete`; post-machine label failure from `fingerprinted` to `deferred_label`; and post-machine quality failure from `fingerprinted` to `rejected_quality`. Exact byte duplication continues to use the existing `fingerprinted` to `rejected_duplicate` path. No other new failure transition is added.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PilotReadiness.test.js test/stage7ConditionalVoxelPreparation.test.js test/stage7ConditionalFingerprint.test.js test/stage7CandidateReadinessStore.test.js
```

Expected: FAIL because operational evidence is not implemented.

- [ ] **Step 3: Implement mode and authority validation**

Before preparation allocation:

```js
const syntheticOnly = evidenceMode === 'synthetic'
  ? true
  : evidenceMode === 'operational'
    ? false
    : fail('EVIDENCE_MODE_INVALID', id);
```

Use `synthetic_only:syntheticOnly`; keep all three authority flags false. Fingerprints inherit the boolean and keep authority false.

Refactor event creation through a private `createReadinessEvent(input, syntheticOnly)` and export:

```js
export function createOperationalReadinessEvent(input) {
  return createReadinessEvent(input, false);
}
```

Marker validation is exact:

```js
const expectedAcquisition = record.synthetic_only === false
  && record.state_after === 'named_batch_approved';
if (typeof record.synthetic_only !== 'boolean'
  || record.authorizes_acquisition !== expectedAcquisition
  || record.authorizes_training !== false
  || record.authorizes_dataset_admission !== false) {
  fail('READINESS_MARKERS_INVALID', id);
}
```

Both synthetic-store read and append reject `synthetic_only !== true` before reducing/writing.

Extend `quarantined_technical` with `named_batch_approved`, and extend `deferred_incomplete`, `deferred_label`, and `rejected_quality` with `fingerprinted`. `rejected_duplicate` already accepts `fingerprinted`. Keep every other forward and failure transition unchanged.

- [ ] **Step 4: Run focused tests and R2 integration**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PilotReadiness.test.js test/stage7CandidateReadinessState.test.js test/stage7CandidateReadinessStore.test.js test/stage7CandidateReadinessIntegration.test.js test/stage7ConditionalVoxelPreparation.test.js test/stage7ConditionalFingerprint.test.js
```

Expected: all pass, including unchanged synthetic binding.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/construction/learning/stage7ConditionalVoxelPreparation.js src/construction/learning/stage7ConditionalFingerprint.js src/construction/learning/stage7CandidateReadinessState.js src/construction/learning/stage7CandidateReadinessStore.js test/stage7PilotReadiness.test.js test/stage7ConditionalVoxelPreparation.test.js test/stage7ConditionalFingerprint.test.js test/stage7CandidateReadinessStore.test.js
git commit -m "feat(stage7): add operational R3 evidence mode"
```

---

### Task 3: Add the contained operational filesystem and readiness ledger

**Files:**
- Create: `src/construction/learning/stage7PilotFilesystem.js`
- Create: `src/construction/learning/stage7PilotReadinessStore.js`
- Create: `test/stage7PilotFilesystem.test.js`
- Extend: `test/stage7PilotReadiness.test.js`

**Interfaces:**
- Produces `PILOT_MANAGED_DIRECTORIES`, `assertPilotRoot(root, deps)`, `ensurePilotLayout(root, deps)`, `readPilotJson(root, relativePath)`, `readPilotJsonl(root, relativePath)`, `writePilotJsonIdempotent(root, relativePath, value)`, `writePilotBytesIdempotent(root, relativePath, bytes, expectedSha256)`, and `appendPilotJsonlIdempotent(root, relativePath, record, identity)`.
- Produces `readPilotReadinessLedger(root)` and `appendPilotReadinessEvent(root, event)`.
- Every helper validates lexical and realpath containment, refuses symlink parents/finals, and uses sibling temporary files, descriptor sync, atomic rename, and directory sync.

- [ ] **Step 1: Write failing filesystem and ledger tests**

Tests use a temporary repository and inject `assertRoot:async value=>path.resolve(value)`. The managed layout is exactly:

```js
export const PILOT_MANAGED_DIRECTORIES = Object.freeze([
  'quarantine', 'prepared', 'fingerprints', 'manifests',
  'reviews', 'reports/pilots'
]);
```

Cover: canonical JSON; byte-identical idempotent write; conflicting existing bytes; canonical JSONL sorting; identical duplicate identity; conflicting duplicate identity; path escape; parent/final symlink; non-regular file; leftover temporary file; rename-failure cleanup; operational event revisions/hash chain; synthetic event refusal; noncanonical/tampered ledger refusal.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PilotFilesystem.test.js test/stage7PilotReadiness.test.js
```

Expected: FAIL with missing filesystem/store modules.

- [ ] **Step 3: Implement contained idempotent writes**

Use `assertSourceExpansionRoot` as the default root assertion. `ensurePilotLayout` creates only the seven managed directories after root validation. Relative paths must match `/^[a-z0-9][a-z0-9._:/-]*$/u` and reject backslashes, empty segments, `.`, and `..`.

`writePilotJsonIdempotent` canonicalizes to UTF-8 bytes and delegates to the same hash-bound write behavior as `writePilotBytesIdempotent`, which implements:

```text
validate SHA-256(bytes) == expectedSha256
if target exists, safely read and return only when bytes/hash match
otherwise write with flag wx to .<basename>.tmp-<pid>, sync, rename, sync parent
on error remove only that exact temporary path and rethrow
```

`appendPilotJsonlIdempotent` reads the entire canonical ledger, returns an identical existing identity, rejects a conflicting identity, sorts by identity, and atomically replaces the complete ledger.

The readiness store uses `manifests/acquisition-events.jsonl`, accepts only `synthetic_only:false`, validates with `validateReadinessEvent`, reduces every candidate, and identifies events by `${candidate_id}:${revision}`.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PilotFilesystem.test.js test/stage7PilotReadiness.test.js
```

Expected: all pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/construction/learning/stage7PilotFilesystem.js src/construction/learning/stage7PilotReadinessStore.js test/stage7PilotFilesystem.test.js test/stage7PilotReadiness.test.js
git commit -m "feat(stage7): contain R3 operational evidence"
```

---

### Task 4: Build the exact single-file HTTPS receiver

**Files:**
- Create: `src/construction/learning/stage7CandidateAcquisition.js`
- Create: `test/stage7CandidateAcquisition.test.js`
- Extend: `test/fixtures/stage7PilotFixtures.js`

**Interfaces:**
- Consumes one validated candidate from `selectPilotCandidate`.
- Produces `acquireApprovedCandidate({ root, candidate, fetchImpl = globalThis.fetch })` returning a frozen R2 receipt plus `relative_path` and `final_url`.
- It has no URL argument separate from the approved candidate.

- [ ] **Step 1: Write failing mocked-transport tests**

Add a helper returning `new Response(stream, { status, headers })`, with a `ReadableStream` emitting caller chunks. The happy path asserts:

```js
const receipt = await acquireApprovedCandidate({
  root,
  candidate: selectPilotCandidate(batch, 'source-a:house-01'),
  fetchImpl
});
assert.equal(receipt.candidate_id, 'source-a:house-01');
assert.match(receipt.relative_path,
  /^quarantine\/source-a:house-01\/[a-f0-9]{64}\.nbt$/u);
assert.deepEqual(await readdir(join(root, 'quarantine', receipt.candidate_id)),
  [`${receipt.content_sha256}.nbt`]);
```

Cover gzip/zlib/uncompressed Compound magic; absent `Content-Length`; declared and observed 16 MiB overflow; empty/missing body; disallowed content type; HTML; ZIP/archive magic; 301/302/303/307/308 to exact approved redirects; relative redirect; loop/>3 hops; cross-policy/non-HTTPS redirect; non-200; stream error; temp cleanup; identical idempotency; conflicting/symlink quarantine refusal.

- [ ] **Step 2: Run the receiver test and verify RED**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7CandidateAcquisition.test.js
```

Expected: FAIL with missing acquisition module.

- [ ] **Step 3: Implement manual redirects and bounded streaming**

The only fetch shape is:

```js
await fetchImpl(currentUrl, {
  method: 'GET',
  redirect: 'manual',
  credentials: 'omit',
  cache: 'no-store',
  referrerPolicy: 'no-referrer',
  headers: { Accept: 'application/octet-stream, application/x-minecraft-nbt' }
});
```

Allowed URLs are the exact canonical URL plus exact approved redirect URLs; require HTTPS and at most three redirects. Accept content types `application/octet-stream`, `application/x-minecraft-nbt`, and `binary/octet-stream` after stripping parameters. Stream with the 16 MiB limit and cancel on overflow. Accept first bytes only for gzip `1f 8b`, zlib beginning `78`, or uncompressed Compound `0a`.

Compute SHA-256, write `quarantine/<candidate-id>/<sha>.nbt` via `writePilotBytesIdempotent`, then call `readQuarantinedNbt` on that exact path. Return safe receipt fields only. Errors use `CandidateReadinessError` and allowlisted counts, status, host, and basename—never bytes or response text.

- [ ] **Step 4: Run receiver and R2 boundary tests**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7CandidateAcquisition.test.js test/stage7CandidateBoundary.test.js test/stage7CandidateReadinessBoundary.test.js
```

Expected: all pass and R2 still has no network surface.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/construction/learning/stage7CandidateAcquisition.js test/stage7CandidateAcquisition.test.js test/fixtures/stage7PilotFixtures.js
git commit -m "feat(stage7): receive exact approved NBT candidates"
```

---

### Task 5: Persist artifacts and run the resumable machine pipeline

**Files:**
- Create: `src/construction/learning/stage7PilotArtifacts.js`
- Create: `src/construction/learning/stage7Pilot.js`
- Create: `test/stage7PilotArtifacts.test.js`
- Create: `test/stage7Pilot.test.js`

**Interfaces:**
- Produces `persistPilotPrepared(root, prepared)`, `appendPilotFingerprint(root, fingerprintRecord)`, `readPilotFingerprints(root)`, and `appendPilotReview(root, reviewRecord)`.
- Produces `runPilotCandidate({ root, batchDocument, candidateId, fetchImpl, recordedAt, recordedBy })`.
- The machine runner returns safe aggregates and stops at `fingerprinted` or a terminal state; it never creates `pilot_ready`.

- [ ] **Step 1: Write failing artifact-store tests**

Assert operational preparation writes exactly:

```text
prepared/<candidate-id>/<preparation-sha256>.voxels.bin
prepared/<candidate-id>/<preparation-sha256>.json
manifests/prepared-cases.jsonl
fingerprints/structural-fingerprints.jsonl
```

The binary is 262,144 bytes and matches `voxel_sha256`. Sidecar/ledgers are canonical and keep `synthetic_only:false`, `authorizes_training:false`, and `authorizes_dataset_admission:false`. Repetition is idempotent. Same identity/different bytes, links, noncanonical ledger, orphan binary/sidecar, or unexpected temp fails closed.

- [ ] **Step 2: Write failing machine-pipeline tests**

With the synthetic batch and mocked fetch, require these sequential states:

```js
[
  'named_batch_approved', 'acquired_quarantine', 'bytes_verified',
  'format_validated', 'structure_validated', 'completeness_validated',
  'prepared', 'fingerprinted'
]
```

Only approval authorizes acquisition; none authorize training/Dataset. Two fresh roots must produce equal content, preparation, voxel, structural, and fingerprint hashes. Safe output contains only ID, state, terminal, dimensions, token aggregates, hashes, and duplicate proposals.

Cover: exact duplicate rejection; near-duplicate proposal without automatic decision; jigsaw/structure-block and command-block technical quarantine; public oversize deferral; >10% token-8 quarantine; malformed/truncated NBT; interruption after quarantine and after prepared persistence; state-driven resume without refetch/overwrite; batch/code/path mismatch; unapproved reserve; and reserve eligibility only after its primary terminal event.

Near-duplicate proposals must preserve the existing R2 thresholds exactly: occupancy similarity at least `0.85` and material-aware similarity at least `0.75`, or structural equivalence. They never become automatic duplicate decisions.

- [ ] **Step 3: Run artifact and pipeline tests and verify RED**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PilotArtifacts.test.js test/stage7Pilot.test.js
```

Expected: FAIL with missing modules.

- [ ] **Step 4: Implement content-addressed artifact persistence**

`persistPilotPrepared` requires operational evidence, exact `64^3` bytes, tokens `0..8`, matching voxel/preparation hashes, and false authority. It writes binary/sidecar idempotently, then indexes by `${candidate_id}:${preparation_sha256}`. On resume it accepts exact existing files and repairs only a missing matching index; it never replaces a conflict.

`appendPilotFingerprint` validates four yaw views, 128-value occupancy/material MinHash arrays per view, exact candidate/content/preparation binding, and operational non-authorization. It indexes by `${candidate_id}:${preparation_sha256}`. `readPilotFingerprints` validates every record before comparison.

- [ ] **Step 5: Implement the state-driven machine sequence**

Implement in this order:

```text
validate batch and exact candidate
reduce operational ledger
no event -> named_batch_approved bound to batch/admission/rights hashes
named_batch_approved -> acquire exact file -> acquired_quarantine
read content-addressed quarantine -> bytes_verified
decodeBoundedNbt -> format_validated
validateVanillaStructureNbt -> structure_validated
if any actual non-air extent exceeds 64 -> deferred_oversized_public and stop
bind approved standalone/admission evidence -> completeness_validated
prepare twice in operational mode; require equal preparation/voxel hashes
persist prepared -> prepared
fingerprint twice; require canonical equality
compare with existing fingerprints
persist fingerprint -> fingerprinted
exact byte duplicate -> rejected_duplicate
otherwise return awaiting_human_review
```

Map `STRUCTURE_EXTERNAL_DEPENDENCY` and `SECURITY_REVIEW_REQUIRED` to `quarantined_technical`; detect actual extent above 64 immediately after `structure_validated` so the legal `deferred_oversized_public` transition occurs before `completeness_validated`; map parser, containment, transport, and material failures to `quarantined_technical`. Never append an illegal transition. Safe errors contain only code and allowlisted detail.

Resume derives the quarantine path from the event content hash, reruns pure R2 stages, verifies existing artifacts, and appends only missing legal events. It must not call fetch after `acquired_quarantine` exists.

- [ ] **Step 6: Run focused machine and R2 tests**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PilotArtifacts.test.js test/stage7Pilot.test.js test/stage7CandidateReadinessIntegration.test.js test/stage7BoundedNbt.test.js test/stage7VanillaStructureNbt.test.js test/stage7ConditionalVoxelPreparation.test.js test/stage7ConditionalFingerprint.test.js
```

Expected: all pass.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/construction/learning/stage7PilotArtifacts.js src/construction/learning/stage7Pilot.js test/stage7PilotArtifacts.test.js test/stage7Pilot.test.js
git commit -m "feat(stage7): run deterministic R3 candidate pipeline"
```

---

### Task 6: Add human final review and five-of-five audit

**Files:**
- Create: `src/construction/learning/stage7PilotReview.js`
- Create: `test/stage7PilotReview.test.js`
- Extend: `src/construction/learning/stage7PilotArtifacts.js`
- Extend: `test/stage7PilotArtifacts.test.js`

**Interfaces:**
- Produces `validatePilotReview(record, { batchDocument, fingerprintRecord, proposals })`, `finalizePilotCandidate({ root, batchDocument, reviewRecord, recordedAt })`, and `auditPilot({ root, batchDocument })`.
- Review binds batch, content, preparation, fingerprint, labels, completeness, identity, quality, and every near-duplicate proposal.

- [ ] **Step 1: Write failing review/finalization tests**

Use this exact accepted record:

```js
{
  schema_version: 1,
  candidate_id: 'source-a:house-01',
  reviewed_at: '2026-07-20T14:00:00.000Z',
  reviewed_by: 'owner',
  batch_sha256: batch.batch_sha256,
  content_sha256: fingerprint.content_sha256,
  preparation_sha256: fingerprint.preparation_sha256,
  fingerprint_sha256: hashPilotValue(fingerprint),
  identity_consistent: true,
  completeness: 'complete',
  quality_decision: 'accept',
  primary_function: 'residential',
  building_type: 'house',
  style_family: 'rustic',
  environment: 'overworld',
  label_confidence: 'high',
  near_duplicate_decisions: [],
  reason_codes: [],
  authorizes_training: false,
  authorizes_dataset_admission: false
}
```

Reject missing/extra fields, wrong hashes, label mismatch, module/fragment, low confidence, identity mismatch, unacknowledged/extra duplicate proposal, accepted review with reasons, rejected review without controlled reason, and authority true.

Accepted review appends review evidence, `duplicate_clustered`, then `pilot_ready`. Both `distinct` and `same_cluster` near-duplicate decisions bind the compared ID and similarities; `same_cluster` records a stable cluster without changing either prepared volume and is not itself an automatic rejection. An owner rejection with `NEAR_DUPLICATE_REJECTED` maps to `rejected_quality`. Identity mismatch maps to `quarantined_technical`, incomplete structure to `deferred_incomplete`, low-confidence label to `deferred_label`, and failed quality to `rejected_quality`, all directly from `fingerprinted`. Exact byte duplicates are already rejected by the machine pipeline. Wrong starting state fails.

Audit requires exactly five ready cases, at least four primary source groups/types, every attempted candidate terminal/ready, unactivated reserves unacquired, no orphan artifacts, complete event chains, and false authority. Four ready returns `complete:false`, never a lower threshold.

- [ ] **Step 2: Run review tests and verify RED**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PilotReview.test.js test/stage7PilotArtifacts.test.js
```

Expected: FAIL with missing review functions.

- [ ] **Step 3: Implement review validation and final transitions**

Compare all identity/hash/label fields with batch/fingerprint, require decisions for the exact proposal set, and deep-freeze a clone. Controlled reject reasons are:

```text
IDENTITY_MISMATCH
INCOMPLETE_BUILDING
QUALITY_REJECTED
LABEL_CONFIDENCE_LOW
NEAR_DUPLICATE_REJECTED
```

`finalizePilotCandidate` persists by `${candidate_id}:${preparation_sha256}`. For a fully accepted distinct sample it appends `duplicate_clustered` with review/fingerprint hashes and then `pilot_ready`; for any controlled failure it appends the exact legal terminal transition described in Step 1 without a success event. It performs no acquisition, parsing, preparation, Dataset, split, or training action.

`auditPilot` validates batch, event ledger, prepared index, fingerprints, and review ledger; returns safe aggregate counts/states and fixed false authority; never reads or returns voxel bytes. Canonically persist the safe result at `reports/pilots/<batch-id>-<audit-sha256>.json` through `writePilotJsonIdempotent`; an identical existing report is idempotent and a conflicting identity fails closed.

- [ ] **Step 4: Run review, pipeline, and state tests**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PilotReview.test.js test/stage7PilotArtifacts.test.js test/stage7Pilot.test.js test/stage7PilotReadiness.test.js
```

Expected: all pass.

- [ ] **Step 5: Commit Task 6**

```bash
git add src/construction/learning/stage7PilotReview.js src/construction/learning/stage7PilotArtifacts.js test/stage7PilotReview.test.js test/stage7PilotArtifacts.test.js
git commit -m "feat(stage7): gate R3 pilot readiness on human review"
```

---

### Task 7: Add mandatory preflight and the isolated one-candidate CLI

**Files:**
- Create: `src/construction/learning/stage7PilotPreflight.js`
- Create: `src/runStage7PublicNbtPilot.js`
- Create: `test/stage7PublicNbtPilotCli.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces `runPilotPreflight({ repositoryRoot, root, batchDocument, execFileImpl })` with safe aggregate bindings.
- Produces `parseStage7PublicNbtPilotArgs(argv)` and `runStage7PublicNbtPilotCli(argv, context)`.
- Commands are exactly `validate-batch`, `run-candidate`, `record-review`, and `audit`.

- [ ] **Step 1: Write failing CLI and preflight tests**

Accepted shapes are exactly:

```bash
npm run pilot:stage7:public-nbt -- validate-batch --root .local/stage7-source-expansion --batch manifests/named-batch.json --public-pilot-only
npm run pilot:stage7:public-nbt -- run-candidate --root .local/stage7-source-expansion --batch manifests/named-batch.json --candidate-id source-a:house-01 --public-pilot-only
npm run pilot:stage7:public-nbt -- record-review --root .local/stage7-source-expansion --batch manifests/named-batch.json --candidate-id source-a:house-01 --input reviews/pilot-review-input.json --public-pilot-only
npm run pilot:stage7:public-nbt -- audit --root .local/stage7-source-expansion --batch manifests/named-batch.json --public-pilot-only
```

Reject duplicate flags, any URL flag, missing candidate ID for candidate/review, candidate ID on batch/audit, alternative batch/input path, missing acknowledgement, unknown command including `run-all`, and any other root.

Preflight tests inject command results. Require clean tracked Git, branch `codex/stage7-dataset-v3-extraction`, `HEAD === batch.code_revision`, `batch.as_of === today`, both local roots ignored/untracked, private aggregate exactly 22/42/22/22/22/true/15/7/3, Python preflight count 22, formal hashes exact, and v3 false/zero. Mismatch stops before fetch/write. The exact-date rule forces rights evidence to be refreshed on every real acquisition day; a next-day resume requires a refreshed batch and new exact owner approval.

CLI tests require preflight before and after mutations; no network/write for validation; only selected ID passed to the machine runner; fixed review input only; audit reads no voxel bytes; stdout contains only command, ID, state/counts, and false training/Dataset markers.

- [ ] **Step 2: Run CLI tests and verify RED**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PublicNbtPilotCli.test.js
```

Expected: FAIL with missing preflight/CLI.

- [ ] **Step 3: Implement the read-only mandatory preflight**

Use `execFile` argument arrays, never shell strings. Run Git status/branch/HEAD/ignore/tracked checks. Accept an injected `today` in tests, default it to the current UTC `YYYY-MM-DD`, and require exact equality with `batch.as_of`. Invoke the private preflight only as:

```js
await execFileImpl('conda', [
  'run', '-n', 'mcagent-stage7', '--cwd', 'training/stage7',
  'python', '-c',
  "from pathlib import Path; from mcagent_stage7.private_research import run_private_preflight; p=run_private_preflight(root=Path('../../.local/stage7-private-research'),repo_root=Path('../..')); print(p.case_count)"
], { cwd: repositoryRoot });
```

Count only aggregate private files/records/split/run directories; validate prepared sizes without emitting names; call `assertFormalDatasetBoundary`; return `{ git_head, private_case_count:22, run_directory_count:3, dataset_hashes, dataset_v3_gate }`. Do not open run contents or emit private IDs/hashes.

- [ ] **Step 4: Implement exact CLI dispatch**

Read only the fixed batch JSON. `validate-batch` performs preflight and no write. Mutating commands call `ensurePilotLayout` only after preflight and exact approval validation. Dispatch `run-candidate` to `runPilotCandidate`, `record-review` to `finalizePilotCandidate`, and `audit` to `auditPilot`. Run postflight in `finally` after anything that could write.

No command accepts URL, revision, NBT path, reserve override, budget override, Dataset path, device, steps, or training option.

Add only:

```json
"pilot:stage7:public-nbt": "node src/runStage7PublicNbtPilot.js"
```

- [ ] **Step 5: Run CLI compatibility tests**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PublicNbtPilotCli.test.js test/stage7ConditionalAdmissionCli.test.js test/stage7SourceExpansionCli.test.js
```

Expected: all pass; metadata-only CLIs stay non-authorizing.

- [ ] **Step 6: Commit Task 7**

```bash
git add src/construction/learning/stage7PilotPreflight.js src/runStage7PublicNbtPilot.js test/stage7PublicNbtPilotCli.test.js package.json
git commit -m "feat(stage7): add isolated R3 public NBT pilot CLI"
```

---

### Task 8: Lock boundaries, document operation, and verify synthetic readiness

**Files:**
- Create: `test/stage7PilotBoundary.test.js`
- Modify: `test/stage7CandidateReadinessBoundary.test.js`
- Modify: `README.md`
- Create: `docs/superpowers/handoffs/2026-07-20-stage-7-r3-operational-tooling-readiness-complete.md`

**Interfaces:**
- Boundary tests prevent future coupling/authority expansion.
- Documentation records exact later 5+3 gate without a real candidate identity or payload.

- [ ] **Step 1: Write the failing R3 boundary test**

Read every R3 file as text and assert:

- only `stage7CandidateAcquisition.js` may contain `fetch(`;
- no R3 file imports Dataset builder/writer, provider, M3, M4, Torch, trainer, checkpoint, generation workflow, generic template NBT parser, archive library, Git client, browser automation, or upload/export client;
- no clone/unzip/TAR/RAR/7z/JAR, `.schem`, `.schematic`, `.litematic`, `.mcstructure`, world save, process-all/run-all, URL CLI option, device, steps, or learning-rate surface;
- every result producer fixes training/Dataset authority false;
- only the exact batch approval object and operational `named_batch_approved` event may authorize acquisition;
- the only new package script is `pilot:stage7:public-nbt`;
- R3 imports R2 algorithms rather than copying them; and
- no tracked real named batch, payload, prepared bytes, fingerprint signature, or candidate-derived report.

Update the R2 boundary test to continue checking its seven modules for no network/download/archive/private/Dataset/Python/trainer/M4 surface and default synthetic outputs. Do not classify the separate R3 receiver as R2.

- [ ] **Step 2: Run boundary tests and verify RED**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PilotBoundary.test.js test/stage7CandidateReadinessBoundary.test.js
```

Expected: documentation/package assertions fail until completed; functional regression is not acceptable.

- [ ] **Step 3: Document commands and non-authorization**

Add `Stage 7 Public NBT Pilot R3` to README with the four exact Task 7 commands and these statements:

```text
R3 accepts one exact owner-approved Minecraft Java Structure .nbt candidate at a time.
The tooling-readiness implementation was tested with synthetic payloads only.
No real 5+3 batch is approved by this implementation.
The CLI cannot accept a general URL, archive, repository, directory, dependency, or process-all request.
All real artifacts remain ignored below .local/stage7-source-expansion/.
pilot_ready does not authorize Dataset admission, a split, training, generation, publication, upload, package, or export.
Training still requires a new literal owner-approved device and positive optimizer-step budget.
```

- [ ] **Step 4: Run focused R3 and compatibility tests**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PilotBatch.test.js test/stage7PilotReadiness.test.js test/stage7PilotFilesystem.test.js test/stage7CandidateAcquisition.test.js test/stage7PilotArtifacts.test.js test/stage7Pilot.test.js test/stage7PilotReview.test.js test/stage7PublicNbtPilotCli.test.js test/stage7PilotBoundary.test.js test/stage7CandidateReadinessBoundary.test.js test/stage7CandidateReadinessIntegration.test.js test/stage7ConditionalAdmissionBoundary.test.js test/stage7ConditionalAdmissionCli.test.js
```

Expected: all pass.

- [ ] **Step 5: Run complete Node suite with pinned Node**

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test
```

Expected: every Node test passes with zero failures/cancellations/skipped boundary tests. Use normal local child-process permission.

- [ ] **Step 6: Run complete Stage 7 Python suite**

```bash
npm run test:stage7:m3
```

Expected: every Python test passes; no trainer or run is started.

- [ ] **Step 7: Repeat complete postflight**

Repeat every Mandatory execution opening-gate command, then run:

```bash
git diff --check
git status --short
git ls-files .local/stage7-source-expansion
```

Expected: private aggregates/preflight and formal boundaries unchanged; three existing private runs; zero operational quarantine/prepared/fingerprint files; nothing under source expansion tracked; only planned tracked changes before their commits.

- [ ] **Step 8: Write aggregate-only completion handoff**

Record branch/commits; focused/full Node and Python pass counts; private aggregate counts without IDs/hashes; formal Dataset hashes and false/zero gate; zero real public payload/prepared/fingerprint files; mocked transport and synthetic NBT only; nothing pushed/trained; and the next gate of metadata-only 5+3 nomination plus separate exact approval/plan.

- [ ] **Step 9: Commit documentation and handoff**

```bash
git add test/stage7PilotBoundary.test.js test/stage7CandidateReadinessBoundary.test.js README.md docs/superpowers/handoffs/2026-07-20-stage-7-r3-operational-tooling-readiness-complete.md
git commit -m "docs(stage7): record R3 tooling readiness"
```

- [ ] **Step 10: Verify final clean state and stop**

```bash
git status --short
git log --oneline -9
```

Expected: clean status and the plan plus eight narrow implementation/documentation commits visible locally. Do not push or begin metadata refresh, named-batch creation, or a real URL run.

## Execution handoff after plan approval

Because the owner requires sequential work and current instructions do not authorize subagents, execute this plan inline with `superpowers:executing-plans`, one task and review checkpoint at a time. A separate session may continue only after rerunning the mandatory opening gate.

After Task 8, stop. The next proposal is metadata-only discovery and exact 5+3 nomination with immutable revisions, exact `.nbt` paths, refreshed rights/training permissions, preview/quality evidence, and risks. It must wait for owner approval before a real-pilot execution plan is written.
