# Stage 7 R3 Metadata-Only 5+3 Nomination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This plan must be executed inline and sequentially; the owner prohibited parallel agents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce one exact metadata-only proposal of five primary and three named-reserve public Minecraft Java Structure NBT candidates, then stop for owner visual-quality review without acquiring any candidate payload.

**Architecture:** Refresh the existing discovery pool through a hard-gate evidence funnel, add narrowly targeted public candidates only when source/type/reserve coverage is insufficient, score only eligible entries, and render a separate review package below the ignored public metadata root. Tracked files contain only this design and plan; all dated public research records remain local and non-operational.

**Tech Stack:** Public web pages and repository metadata, JSON and Markdown, Node.js 24.18.0 for content-safe local validation, Git for local documentation history, existing Python private preflight for boundary verification.

## Global Constraints

- Work sequentially and do not dispatch parallel agents.
- Do not request, download, clone, archive, decode, inspect, hash, prepare, fingerprint, reconstruct, or render a candidate `.nbt` payload.
- Do not create an operational named batch, readiness ledger, prepared ledger, fingerprint ledger, pilot-review ledger, quarantine payload, or pilot report.
- Do not touch `.local/stage7-private-research/`, its 42 deferred oversized buildings, or its existing runs.
- Do not change Dataset v1/v2/v3, Dataset v3's `ready_for_m3_real_data=false` and `training_eligible_count=0` gate, normal Node generation, the primary provider, M3, M4, or M4 Apply Mode.
- Do not start or resume training.
- Do not push, publish, upload, share, package, or export private or candidate-derived artifacts.
- Stop on any Git, ignored-root, private-preflight, private-aggregate, Dataset-hash, v3-gate, or public-operational-lane drift.
- The research outputs explicitly set `metadata_only=true`, `authorizes_download=false`, `authorizes_training=false`, and `authorizes_dataset_admission=false`.

---

### Task 1: Establish the research baseline

**Files:**
- Read: `docs/superpowers/specs/2026-07-20-stage-7-r3-metadata-nomination-design.md`
- Read: `.local/stage7-source-expansion/metadata/candidates.jsonl`
- Read: `.local/stage7-source-expansion/evidence/rights.jsonl`
- Read: `.local/stage7-source-expansion/reports/discovery/review-cards.json`
- Create: `.local/stage7-source-expansion/reports/nomination/research-ledger.json`
- Create: `.local/stage7-source-expansion/reports/nomination/research-ledger.md`

**Interfaces:**
- Consumes: the integrated R3 revision, existing 32 metadata candidates, 32 rights records, and 30 review cards.
- Produces: a fresh metadata-only ledger with a dated baseline and one provisional record per considered candidate.

- [ ] **Step 1: Re-run the mandatory read-only boundary checks**

Run the Git, ignore, aggregate-only private/public, formal Dataset, and complete Python private-preflight commands documented in the completion handoff. Expected: clean branch; private 22/42/22/22/22, 15/7, three run directories; 22-case preflight; fixed v1/v2/v3 hashes; v3 false/0; empty public operational lane.

- [ ] **Step 2: Inventory the existing discovery pool without changing it**

Read the candidate, rights, ranking, and review-card artifacts. Record source counts, building-type counts, exact-file versus directory/page identities, obvious modular/dependency flags, and existing evidence dates. Do not edit these predecessor artifacts.

- [ ] **Step 3: Initialize the new local research ledger**

Create the nomination directory and write JSON with this top-level shape:

```json
{
  "schema_version": 1,
  "as_of": "2026-07-20",
  "metadata_only": true,
  "authorizes_download": false,
  "authorizes_training": false,
  "authorizes_dataset_admission": false,
  "source_discovery_count": 0,
  "records": []
}
```

The Markdown companion must state the same non-authorization and summarize only public metadata.

- [ ] **Step 4: Validate the baseline ledger**

Run a Node read-only assertion that parses the JSON, requires the four authority flags, requires an array of records, and rejects any key named `payload_sha256`, `prepared_hash`, `fingerprint`, `training_eligible`, or `dataset_case_id`. Expected: exit code 0.

### Task 2: Refresh and hard-gate the existing candidate pool

**Files:**
- Modify: `.local/stage7-source-expansion/reports/nomination/research-ledger.json`
- Modify: `.local/stage7-source-expansion/reports/nomination/research-ledger.md`

**Interfaces:**
- Consumes: Task 1's provisional ledger and public authoritative web evidence.
- Produces: complete hard-gate results for every promising exact-file candidate in the existing pool and explicit rejections for known modules, directories, dependencies, or mutable-only identities.

- [ ] **Step 1: Reject structurally ineligible existing records first**

Mark directory identities, project-only identities, explicit basement/room/module records, known jigsaw or multi-file families, Create-dependent assets, and any non-exact `.nbt` path as ineligible. Record stable reason codes such as `not_exact_file`, `modular_family`, `component_only`, `external_dependency`, or `mutable_identity`.

- [ ] **Step 2: Resolve immutable source identity for each remaining record**

Use public repository and release metadata to record one full immutable commit SHA or immutable release identifier, the exact lower-case `.nbt` path at that revision, and one canonical credential-free HTTPS exact-file URL. Do not open raw or download endpoints and do not inspect file contents.

- [ ] **Step 3: Refresh rights evidence at the same immutable revision**

Record license identifier, authoritative same-revision license URL, why the exact asset path is covered, known author chain, required notices or attribution, and individual permission flags for download, copy, transform, intended local training use, derivative research artifacts, and local retention. Record AI/ML, platform, and upstream conflict flags. Any ambiguity fails closed.

- [ ] **Step 4: Refresh standalone and vanilla evidence**

Inspect repository trees, data-pack worldgen declarations, project descriptions, issue documentation, and previews without retrieving the `.nbt` bytes. Record whether metadata indicates a single complete building, a jigsaw/template-pool member, a fragment, an external processor dependency, or mod-specific blocks. Unknown standalone status fails the hard gate.

- [ ] **Step 5: Refresh public quality and stability evidence**

Record dated preview URLs, public download/star/follower or rating signals, last-maintained evidence, and concise visible-quality notes. Mutable popularity values are evidence only and never define identity.

- [ ] **Step 6: Write explicit hard-gate decisions**

Each record receives `eligible` or `ineligible`, all ten gate booleans, evidence URLs, confidence, and reason codes. Only `eligible` records advance to ranking.

### Task 3: Add narrowly targeted candidates only if required

**Files:**
- Modify: `.local/stage7-source-expansion/reports/nomination/research-ledger.json`
- Modify: `.local/stage7-source-expansion/reports/nomination/research-ledger.md`

**Interfaces:**
- Consumes: eligible records from Task 2 and the 5+3 diversity/reserve constraints.
- Produces: the smallest additional public candidate set necessary to make a compliant exact slate possible.

- [ ] **Step 1: Compute coverage gaps**

Determine whether the eligible set can supply five primaries from at least four sources and four building types plus three same-function reserves. If it can, do not expand the pool.

- [ ] **Step 2: Search only for missing slots**

For each gap, search authoritative repositories and official project pages for standalone vanilla Java Structure `.nbt` files under clearly scoped open licenses. Prefer active repositories with public previews and exact immutable paths. Exclude archives, world saves, schematic formats, mod-block dependencies, template pools, and sources prohibiting AI use.

- [ ] **Step 3: Apply the complete Task 2 evidence refresh to each new record**

New candidates receive exactly the same immutable identity, rights, standalone, vanilla, quality, stability, and hard-gate fields. Do not lower a gate because the existing pool lacks diversity.

- [ ] **Step 4: Stop expansion once a robust slate is possible**

Require at least one extra eligible alternative beyond each contested source/type constraint when available, but do not build a broad crawl. Record why the search stopped.

### Task 4: Score candidates and construct the exact 5+3 proposal

**Files:**
- Modify: `.local/stage7-source-expansion/reports/nomination/research-ledger.json`
- Modify: `.local/stage7-source-expansion/reports/nomination/research-ledger.md`
- Create: `.local/stage7-source-expansion/reports/nomination/five-plus-three-review.json`
- Create: `.local/stage7-source-expansion/reports/nomination/five-plus-three-review.md`

**Interfaces:**
- Consumes: all eligible hard-gated records.
- Produces: exactly five proposed primaries, exactly three proposed reserves, and explicit one-to-one reserve mappings.

- [ ] **Step 1: Score eligible records with the fixed weights**

For every eligible record, record four normalized 0–100 components and compute:

```text
total = 0.45 * parser_confidence
      + 0.30 * quality_reception
      + 0.15 * diversity_contribution
      + 0.10 * source_stability
```

Round only the displayed total to two decimals; retain component integers and the formula inputs.

- [ ] **Step 2: Select five primaries under the diversity caps**

Choose the highest defensible gate-passing combination that covers at least four source projects and four building types, with no more than two primaries from one source or type. Prefer visibly complete buildings and avoid concentrating special-environment monuments at the expense of ordinary architecture.

- [ ] **Step 3: Bind three reserves**

Choose exactly three reserves. Each names one primary, occupies the same functional/parser slot, comes from an approved exact identity, and cannot be reused for another primary. Record the match rationale and any residual risk.

- [ ] **Step 4: Render the JSON review package**

Use this top-level contract:

```json
{
  "schema_version": 1,
  "as_of": "2026-07-20",
  "metadata_only": true,
  "authorizes_download": false,
  "authorizes_training": false,
  "authorizes_dataset_admission": false,
  "selection_objective": "parser-reliability-first",
  "primaries": [],
  "reserves": [],
  "owner_quality_review": {
    "status": "pending",
    "decisions": []
  }
}
```

Every entry includes public preview links, public evidence links, immutable identity, rights summary, building labels, score components, risks, and role. Do not include payload or candidate-derived fields.

- [ ] **Step 5: Render the human-readable review cards**

Order the Markdown as five primaries followed by three reserves. For each card show title, intended slot, source/type/style, preview links, immutable source page, rights evidence, why it passed, score, risks, and blank `Accept / Replace / Reject` quality decision. State prominently that opening previews does not authorize a download.

### Task 5: Validate the review package and stop at the owner gate

**Files:**
- Read: `.local/stage7-source-expansion/reports/nomination/research-ledger.json`
- Read: `.local/stage7-source-expansion/reports/nomination/five-plus-three-review.json`
- Read: `.local/stage7-source-expansion/reports/nomination/five-plus-three-review.md`

**Interfaces:**
- Consumes: Task 4's exact proposal.
- Produces: an internally consistent metadata-only package ready for owner visual-quality review and no later-stage artifact.

- [ ] **Step 1: Validate exact cardinality and diversity**

Run a local Node assertion requiring five unique primary IDs, three unique reserve IDs, at least four primary source IDs, at least four primary building types, source/type caps of two, and exactly three one-to-one reserve mappings to existing primary IDs. Expected: exit code 0.

- [ ] **Step 2: Validate authority and identity fields**

Require every entry to have a full immutable revision, exact lower-case `.nbt` relative path, HTTPS exact-file URL, same-revision license evidence, all hard-gate passes, current evidence time, and no unresolved conflict flag. Require all authority flags to remain false except `metadata_only=true`. Expected: exit code 0.

- [ ] **Step 3: Scan for forbidden content and operational artifacts**

Assert the review JSON contains none of these keys: `payload_sha256`, `raw_bytes`, `prepared_hash`, `fingerprint`, `dataset_case_id`, `training_eligible`, `checkpoint`, `weight`, or `reconstruction`. Confirm the public operational lane is still empty and there is no named batch or operational ledger. Expected: exit code 0.

- [ ] **Step 4: Re-run complete postflight boundaries**

Repeat the exact Git, ignore, aggregate-only private/public, formal Dataset, and Python private-preflight checks from Task 1. Expected: all baselines unchanged; documentation commits are the only tracked changes made by this stage.

- [ ] **Step 5: Deliver the manual quality-review gate**

Provide the owner a clickable link to `five-plus-three-review.md`, summarize the exact 5+3 composition and residual risks, and ask for `Accept`, `Replace`, or `Reject` decisions. Stop. Do not create a named batch, write a real-pilot execution plan, or acquire any candidate until the owner explicitly approves the exact slate.
