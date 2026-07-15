# Stage 7 Private-Research Training Next-Window Handoff

Date: 2026-07-15

This is the durable continuation record for the private, local-only Stage 7 research corpus. Treat current command output as authoritative and use the recorded values only to detect drift. It is not permission to publish data, weights, outputs, or checkpoints.

## User intent and hard boundaries

The owner has selected a private local-research path for the existing Minecraft templates. The current task is complete through **training preparation**; no private training run has started.

Hard boundaries:

- Do not push, create a pull request, upload, share, package, or publish any private source, prepared volume, metric, reconstruction, checkpoint, weight, or output.
- Do not change Dataset v1/v2/v3 files. Dataset v3 must remain `ready_for_m3_real_data=false` and `training_eligible_count=0`.
- Do not enable or implement M4 Apply Mode, primary-provider behavior, or public inference/export from the private model.
- Keep normal Node generation Python-independent.
- Work sequentially and do not dispatch parallel agents unless the owner explicitly changes that instruction.
- Do not begin a real private training run until the owner explicitly says to start and gives a training budget: device (`cpu` or `cuda`) and positive `steps`. A stated batch size and learning rate are also required if the owner wants values other than the documented defaults.
- Before new feature code, present a readiness-audit design and wait for owner approval. A future large-building tiling capability is new feature work and is not authorized by this handoff.

## Authoritative Git state at handoff

Main checkout:

- Path: `/home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents`
- Branch: `codex/stage7-dataset-v3-extraction`
- HEAD: `7aa0e29472940e5650a7fbeafa115960b12f04d8`
- Status: clean when this handoff was written.
- Latest relevant merge: `7aa0e29 merge(stage7): reject duplicate private imports`.

The merge includes `b35e0cd fix(stage7): reject duplicate private imports`, with a regression test proving that two identical files at different paths in the same import batch fail with `DUPLICATE_SOURCE` before a manifest is written.

## Private corpus state

All private state is below the Git-ignored and untracked root:

```text
.local/stage7-private-research/
```

The owner acknowledgement exists locally and records `stage7-private-research-only`, distribution prohibition, unchanged Dataset v3, and unchanged M4 status.

Current corpus facts, intentionally without listing private filenames, source URLs, raw hashes, or prepared hashes:

- 64 original schematic files were copied locally from the project's existing template collection only after the owner selected the private research route.
- 22 sources have non-air bounds within `64 × 64 × 64`; they are the active corpus.
- 42 oversized sources are preserved, not deleted, in `deferred/oversized/`. They are excluded from the active source manifest and must not be silently scaled, cropped, or tiled.
- The active source manifest has 22 records. Every record remains `rights_state: unverified`, `distribution: prohibited`, and `purpose: local-private-research-only`.
- The prepared manifest has 22 records, each a 262,144-byte categorical `64³` volume with a source-bound sidecar hash.
- Deterministic source-group split with seed `7101`: 15 training cases and 7 validation cases.
- `runs/` exists but contains zero artifacts. No real private training has occurred.

The corpus preflight was executed successfully: it checked the acknowledgement, ignored/untracked root, source and prepared hashes, sidecars, token ranges, split uniqueness, Dataset manifest hashes, and Dataset v3 false/zero gate. A sample train case loaded as `torch.int64`, shape `(64, 64, 64)`, with mask token `9`.

## Formal Dataset invariants

At handoff, the exact formal manifest SHA-256 values are:

```text
v1 fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749
v2 af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654
v3 5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082
```

Dataset v3 gate:

```json
{"ready_for_m3_real_data":false,"training_eligible_count":0}
```

## Required read-only continuation protocol

Before any action in the next window, run these read-only checks from the main checkout:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline -6
git ls-files .local/stage7-private-research
git check-ignore -q .local/stage7-private-research
```

Then verify corpus counts and formal boundaries without printing private records:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node -e "const fs=require('fs'),crypto=require('crypto'),path=require('path'); const repo=process.cwd(); const root=path.join(repo,'.local/stage7-private-research'); const lines=(f)=>fs.readFileSync(f,'utf8').trim().split(/\\n/).filter(Boolean).length; const split=JSON.parse(fs.readFileSync(path.join(root,'splits/split.json'),'utf8')); const prepared=fs.readdirSync(path.join(root,'prepared')).filter((n)=>n.endsWith('.voxels.bin')); const hashes=['v1','v2','v3'].map((v)=>[v,crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,'mc_templates/datasets/coarse_semantic_voxels',v,'manifest.json'))).digest('hex']); const v3=JSON.parse(fs.readFileSync(path.join(repo,'mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json'),'utf8')); console.log(JSON.stringify({source_files:fs.readdirSync(path.join(root,'source')).filter((n)=>n.endsWith('.schematic')).length,deferred_oversized:fs.readdirSync(path.join(root,'deferred/oversized')).filter((n)=>n.endsWith('.schematic')).length,source_records:lines(path.join(root,'manifests/sources.jsonl')),prepared_records:lines(path.join(root,'manifests/prepared.jsonl')),prepared_binary_count:prepared.length,all_prepared_64_cubed:prepared.every((n)=>fs.statSync(path.join(root,'prepared',n)).size===64**3),train_cases:split.train_case_ids.length,validation_cases:split.validation_case_ids.length,run_artifacts:fs.readdirSync(path.join(root,'runs')).length,dataset_hashes:hashes,dataset_v3_gate:{ready_for_m3_real_data:v3.ready_for_m3_real_data,training_eligible_count:v3.training_eligible_count}}));"
```

Expected counts are `22`, `42`, `22`, `22`, `22`, `true`, `15`, `7`, and `0`, in that order. If any Git, private-root, hash, gate, count, sidecar, or split check differs, stop before training and explain the drift to the owner.

## Training command — do not run yet

The trainer is intentionally separate from the import/preparation CLI. It is local-only and requires an explicit acknowledgement flag:

```bash
npm run train:stage7:private-research -- --root .local/stage7-private-research --run-id <owner-approved-id> --private-research-only --seed 7101 --steps <owner-approved-positive-integer> --batch-size <owner-approved-positive-integer> --learning-rate <owner-approved-positive-number> --device <cpu-or-cuda> --code-revision <owner-approved-label>
```

Before running it, obtain the owner’s explicit budget. Prefer a safe initial CPU run, use a fresh safe `run-id` matching `^[a-z0-9][a-z0-9_-]{0,63}$`, and do not reuse an existing run directory. The trainer runs the full preflight before output creation and rechecks the formal Dataset boundary after writing artifacts.

After a training run, inspect only aggregate local metadata: run-directory containment, manifest scope `private-research-only`, manifest distribution `prohibited`, finite metrics, checkpoint hash, and unchanged formal Dataset hashes/gate. Do not expose or commit private source content, model weights, reconstruction bytes, or raw hashes.

## Known scope limits

- This 22-case corpus is a pipeline-validation / small private experiment set, not enough evidence for a strong generalizable architectural model.
- The 42 deferred large buildings require a separately designed and owner-approved large-building partitioning strategy. Do not rescale them or make arbitrary crops.
- This private research path never makes the existing 64 templates eligible for Dataset v3, M3 real-data training, evaluation, reward-label creation, public model release, or M4.

## Verified evidence

After the duplicate-import fix and active-corpus preparation:

- Full Node suite: 464 passed, 0 failed, run with normal local child-process permission.
- Full Stage 7 M3 Python suite: passed.
- Private corpus import/preparation completed for the active 22 cases.
- Python private preflight and one-case tensor loading completed without running an optimizer or creating run artifacts.

Node CLI tests can report false failures in the restricted sandbox because nested `spawnSync` receives `EPERM`. When such tests are needed, use Node 24.18.0 at `/home/guoba/.nvm/versions/node/v24.18.0/bin/node` and request narrowly scoped normal child-process permission. This is an environment limitation, not a reason to weaken tests.

## Copy/paste prompt for the next window

```text
Open /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents and read the complete handoff file:
docs/superpowers/handoffs/2026-07-15-stage-7-private-research-training-next-window.md

Follow its continuation protocol exactly. Start by running all Git and private-corpus checks as read-only commands and stop if any recorded invariant drifts. Work sequentially; do not use parallel agents.

The active private corpus is already prepared but no real private training has started. Do not push, publish, upload, share, package, or export any private data, metrics, reconstructions, checkpoints, weights, or generated output. Do not alter Dataset v1/v2/v3, Dataset v3’s false/0 gate, normal Node generation, or M4 Apply Mode.

Do not start training unless I explicitly provide a device and step budget in this new window. If I do, run only the isolated private trainer, keep all artifacts under .local/stage7-private-research/runs/, then verify its manifest scope/distribution and formal Dataset hashes/gate without exposing private content. Do not process the 42 deferred oversized buildings or add tiling/rescaling without a new readiness-audit design and my approval.
```
