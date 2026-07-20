# Stage 7 Public NBT Pilot R3 — Operational Tooling Readiness Handoff

Date: 2026-07-20

Status: synthetic operational-tooling readiness is complete and verified. This status is not permission for a real acquisition.

## Scope and hard boundary

The Stage 7 Public NBT Pilot R3 tooling accepts one exact owner-approved Minecraft Java Structure `.nbt` candidate at a time. The tooling-readiness implementation was tested with synthetic payloads only. No real 5+3 batch is approved by this implementation.

The CLI has no general URL, archive, repository, directory, dependency, authentication, process-all, Dataset, device, optimizer-step, or training surface. Real operational artifacts, if separately approved later, remain ignored below `.local/stage7-source-expansion/`.

pilot_ready does not authorize Dataset admission, a split, training, generation, publication, upload, package, or export. Training still requires a new literal owner-approved device and positive optimizer-step budget.

No real network request, candidate payload, prepared volume, fingerprint, candidate-derived report, training action, push, publication, upload, package, or export was authorized or performed by this tooling-readiness implementation.

## Implemented isolation

- Strict exact 5-primary plus 3-reserve batch and owner-approval binding.
- Manual-redirect, credential-free, 16 MiB bounded single-file HTTPS receiver.
- Contained content-addressed quarantine, prepared artifacts, canonical ledgers, and atomic writes.
- Direct reuse of the R2 bounded decoder, Java Structure validator, deterministic `64^3` mapper, fingerprinting, and readiness state machine.
- State-driven resume without refetch after `acquired_quarantine`.
- Human review binding for identity, completeness, labels, quality, and every near-duplicate proposal.
- Completion audit requiring exactly five `pilot_ready` samples with source/type diversity.
- Mandatory preflight/postflight for Git, aggregate-only private invariants, Python private preflight count, formal Dataset hashes, and Dataset v3 false/zero.

All operational, prepared, fingerprint, review, audit, and CLI results keep `authorizes_training=false` and `authorizes_dataset_admission=false`. Only the exact approved batch and the operational `named_batch_approved` readiness event authorize one selected acquisition.

## Local implementation history before the final documentation commit

- Base design: `a2a0504` — `docs(stage7): design R3 five-candidate pilot`
- Approved plan: `26ddc26` — `docs(stage7): plan R3 operational tooling readiness`
- Task 1: `28f1bb3` — strict exact 5+3 contract
- Task 2: `8ddcb8d` — operational evidence mode
- Task 3: `c48d453` — contained filesystem and readiness ledger
- Task 4: `f8ddb73` — exact approved NBT receiver
- Task 5: `bfaed87` — deterministic resumable machine pipeline
- Task 6: `fb52d2a` — human review and five-of-five audit
- Task 7: `c20b1de` — mandatory preflight and isolated CLI

Tooling branch: `codex/stage7-r3-tooling-readiness`. Nothing has been pushed.

## Final verification evidence

Observed on 2026-07-20:

- Focused R3 and compatibility suite: 13 test files passed, 0 failed.
- Complete Node suite with `/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test`: 645 tests passed, 0 failed, 0 cancelled, 0 skipped.
- The first restricted-sandbox Node invocation produced eight known child-process false failures. Direct inspection confirmed empty subprocess output, and the authoritative rerun with normal local child-process permission passed 645/645.
- Complete Stage 7 Python suite through `npm run test:stage7:m3`: 269 tests passed, exit code 0. No trainer or optimizer ran.
- Main checkout: clean; branch `codex/stage7-dataset-v3-extraction`; HEAD `26ddc26ed4f542e3e173747f21553d29310c466e`; both local roots ignored and untracked.
- Private aggregate remained: 22 active source files, 42 deferred oversized files, 22 source records, 22 prepared records, 22 prepared binaries, every prepared binary exactly 262,144 bytes, split 15/7, and 3 pre-existing run directories.
- Python private preflight returned 22 cases. No private filename, ID, URL, content, source/prepared hash, run metric, checkpoint, weight, or reconstruction was emitted.
- Formal Dataset manifest SHA-256 values remained:
  - v1 `fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749`
  - v2 `af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654`
  - v3 `5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082`
- Dataset v3 remained `ready_for_m3_real_data=false` and `training_eligible_count=0`.
- Public R3 operational state remained empty: 0 quarantine files, 0 prepared files, 0 fingerprint files, no named batch, no readiness ledger, no prepared ledger, no pilot-review ledger, and 0 pilot report files.
- All receiver tests used injected `Response` streams and generated synthetic NBT. No real network request or real candidate content was used.
- Nothing was pushed, published, uploaded, shared, packaged, exported, or trained in this tooling-readiness work.

The implementation worktree contained only the planned tracked source, test, README, and handoff changes before the final documentation commit. `git diff --check` passed and `.local/stage7-source-expansion` had no tracked entries.

## Next owner gate

Stop after tooling readiness. The next work is metadata-only discovery and nomination of an exact 5+3 slate with immutable revisions, exact `.nbt` paths, refreshed download/copy/transform/training/local-retention permissions, public preview and quality evidence, and explicit risks.

That exact slate requires a separate owner review and approval. Only after approval may a new real-pilot execution plan be written. Do not acquire a real URL, process a candidate, activate a reserve, alter a threshold, handle the 42 deferred oversized private buildings, add tiling/rescaling, admit anything to a Dataset or split, or start training under this handoff.
