# Stage 7 Private Quality Evaluation Ready Handoff

Date: 2026-07-15

This is the durable continuation record for the implemented, local-only Stage 7 private trainer and held-out quality evaluator. Treat current command output as authoritative and use the recorded values only to detect drift. This handoff does not authorize training and is not permission to publish, upload, share, package, or export private data or artifacts.

## Owner intent and hard boundaries

The owner approved the lightweight CPU design and its implementation. The private corpus is prepared, the trainer and evaluator are verified, and no real private training has started.

Hard boundaries:

- Never push, create a pull request, publish, upload, share, package, or export private sources, prepared volumes, exact metrics, reconstructions, checkpoints, weights, hashes, or generated output.
- Keep every operational artifact below `.local/stage7-private-research/runs/`.
- Do not change Dataset v1/v2/v3. Dataset v3 must remain `ready_for_m3_real_data=false` and `training_eligible_count=0`.
- Do not change normal Node generation, the primary provider, M3 formal-data behavior, or M4 Apply Mode.
- Do not process, crop, tile, rescale, or otherwise modify the 42 deferred oversized buildings. That requires a new readiness-audit design and explicit owner approval.
- Work sequentially. Do not use parallel agents or concurrent private runs.
- Do not start a calibration or substantive training run until the owner explicitly confirms the device and the exact positive step count for that specific run in the current window.
- Do not automatically retry, extend, resume, clean up, or start a second run after any result.
- Interactive output may contain only completion, safety metadata, gate pass/fail, and boundary status. Exact private metrics remain in ignored local artifacts.

## Authoritative implementation state

Main checkout:

- Path: `/home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents`
- Branch: `codex/stage7-dataset-v3-extraction`
- Approved code revision: `739e596dacbf4ecffc1ea9dc8ea6d9b559e6e159`
- Status: clean immediately before this handoff was added.

The approved implementation sequence is:

```text
524492e docs(stage7): design private quality evaluation
570473a docs(stage7): plan private quality evaluation
68c119f feat(stage7): add private evaluation metrics
5bbdd36 feat(stage7): validate private evaluation checkpoints
2cb3624 feat(stage7): evaluate private held-out volumes
739e596 feat(stage7): add metadata-safe private evaluation CLI
```

The implementation adds:

- deterministic masked-only metric accumulation and a strict dual-baseline quality gate;
- training-only add-one-smoothed class-prior estimation;
- safe, manifest-bound, checksum-bound, weights-only checkpoint loading with exact key, shape, dtype, and finite-value checks;
- a CPU-only held-out evaluator using the authoritative 15/7 split, five masks per validation case, mask ratio `0.25`, and seed `7101`;
- aggregate-only local `evaluation.json` output with no per-case records;
- repository-root-relative `.local/` resolution for both private CLIs; and
- metadata-only trainer and evaluator output that suppresses exact private metrics and scrubs operational error details.

## Private corpus state

All private state remains below the Git-ignored, untracked root:

```text
.local/stage7-private-research/
```

Current aggregate facts, intentionally without private filenames, source URLs, raw hashes, prepared hashes, or content:

- 22 active source files and 22 source-manifest records;
- 22 prepared records and 22 categorical `64 x 64 x 64` binary volumes;
- all prepared binaries have the expected `64^3` byte size;
- deterministic split seed `7101`: 15 training cases and 7 validation cases;
- 42 oversized buildings remain untouched in `deferred/oversized/`; and
- `runs/` contains zero artifacts.

The complete Python private preflight passed immediately before this handoff. It checked the acknowledgement, ignored/untracked root, source/prepared bindings, sidecars, token ranges, split uniqueness, formal Dataset hashes, and Dataset v3 false/zero gate without emitting private records.

## Formal Dataset invariants

The exact formal manifest SHA-256 values remain:

```text
v1 fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749
v2 af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654
v3 5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082
```

Dataset v3 gate:

```json
{"ready_for_m3_real_data":false,"training_eligible_count":0}
```

## Verification evidence

Fresh verification at approved code revision `739e596dacbf4ecffc1ea9dc8ea6d9b559e6e159`:

- Full Stage 7 Python suite: 216 collected, all passed.
- Relevant Node boundary/documentation suite: 10 passed, 0 failed.
- Full Node suite: 464 passed, 0 failed.
- Private root: ignored and untracked.
- Private aggregate counts: `22`, `42`, `22`, `22`, `22`, `true`, `15`, `7`, `0`.
- Complete private preflight: passed for all 22 active cases.
- Formal Dataset hashes: exact match.
- Dataset v3 gate: unchanged at false/zero.
- Real private run artifacts: zero.

No real private corpus was used by implementation tests. The evaluator orchestration tests use generated synthetic fixtures only.

## Required read-only continuation protocol

Before any future operational action, run these checks from the main checkout. Stop immediately if any output differs from the recorded invariant.

The handoff commit intentionally follows the approved implementation revision. Verify it without self-reference:

```bash
git status --short
git branch --show-current
git rev-parse HEAD^
git log -1 --format=%s
git diff --name-only HEAD^..HEAD
git ls-files .local/stage7-private-research
git check-ignore -q .local/stage7-private-research
```

Expected results:

- status has no output;
- branch is `codex/stage7-dataset-v3-extraction`;
- `HEAD^` is `739e596dacbf4ecffc1ea9dc8ea6d9b559e6e159`;
- handoff subject is `docs(stage7): hand off private quality evaluation`;
- the handoff commit changes only `docs/superpowers/handoffs/2026-07-15-stage-7-private-quality-evaluation-ready.md`;
- `git ls-files` has no output; and
- `git check-ignore` exits zero.

Verify aggregate corpus counts without printing private records:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node -e "const fs=require('fs'),path=require('path'); const root=path.join(process.cwd(),'.local/stage7-private-research'); const lines=(file)=>fs.readFileSync(file,'utf8').trim().split(/\\n/).filter(Boolean).length; const split=JSON.parse(fs.readFileSync(path.join(root,'splits/split.json'),'utf8')); const prepared=fs.readdirSync(path.join(root,'prepared')).filter((name)=>name.endsWith('.voxels.bin')); console.log(JSON.stringify({source_files:fs.readdirSync(path.join(root,'source')).filter((name)=>name.endsWith('.schematic')).length,deferred_oversized:fs.readdirSync(path.join(root,'deferred/oversized')).filter((name)=>name.endsWith('.schematic')).length,source_records:lines(path.join(root,'manifests/sources.jsonl')),prepared_records:lines(path.join(root,'manifests/prepared.jsonl')),prepared_binary_count:prepared.length,all_prepared_64_cubed:prepared.every((name)=>fs.statSync(path.join(root,'prepared',name)).size===64**3),train_cases:split.train_case_ids.length,validation_cases:split.validation_case_ids.length,run_artifacts:fs.readdirSync(path.join(root,'runs')).length}));"
```

Before the first run, expected output is:

```json
{"source_files":22,"deferred_oversized":42,"source_records":22,"prepared_records":22,"prepared_binary_count":22,"all_prepared_64_cubed":true,"train_cases":15,"validation_cases":7,"run_artifacts":0}
```

After a run, only `run_artifacts` may increase, and only by the explicitly approved run directory and its specified artifacts.

Verify the complete private preflight without emitting private names or hashes:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -c "import json; from pathlib import Path; from mcagent_stage7.private_research import run_private_preflight; result=run_private_preflight(root=Path('../../.local/stage7-private-research'),repo_root=Path('../..')); print(json.dumps({'preflight':'passed','case_count':result.case_count,'dataset_v3_gate':result.dataset_v3_gate},sort_keys=True,separators=(',',':')))"
```

Expected result:

```json
{"case_count":22,"dataset_v3_gate":{"ready_for_m3_real_data":false,"training_eligible_count":0},"preflight":"passed"}
```

Finally, recheck the formal manifests and gate:

```bash
sha256sum mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json
/home/guoba/.nvm/versions/node/v24.18.0/bin/node -e "const m=require('./mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json'); console.log(JSON.stringify({ready_for_m3_real_data:m.ready_for_m3_real_data,training_eligible_count:m.training_eligible_count}));"
```

If any Git state, count, sidecar, split, private binding, formal hash, or gate differs, stop before training and explain only the non-private drift category to the owner.

## First operational gate: five-step CPU calibration

Do not run this section until the owner explicitly approves exactly `device=cpu` and `steps=5` for the calibration in the current window.

Use a fresh run ID, `cpu-calibration-20260715`, only if it does not already exist. Before starting, require at least 8 GiB currently available memory. The approved fixed settings are:

```text
device=cpu
steps=5
batch_size=1
learning_rate=0.001
seed=7101
code_revision=739e596dacbf4ecffc1ea9dc8ea6d9b559e6e159
```

Measure wall time and maximum resident memory with the operating system while keeping trainer stdout metadata-only:

```bash
/usr/bin/time -v npm run train:stage7:private-research -- --root .local/stage7-private-research --run-id cpu-calibration-20260715 --private-research-only --metadata-only --seed 7101 --steps 5 --batch-size 1 --learning-rate 0.001 --device cpu --code-revision 739e596dacbf4ecffc1ea9dc8ea6d9b559e6e159
```

Stop after calibration if available memory was below 8 GiB, peak RSS exceeds 2 GiB, the measurement reports process swap activity, the command is killed or nonzero, a value is non-finite, an artifact escapes the run directory, or any private/formal boundary changes.

The calibration run must contain exactly:

```text
metrics.jsonl
reconstruction.bin
checkpoint.pt
checkpoint_manifest.json
```

Audit only containment, filenames, scope `private-research-only`, distribution `prohibited`, finite-status booleans, checkpoint integrity, and formal boundary status. Do not print exact loss, hashes, tensors, reconstructions, private names, or content. Calibration artifacts remain local and are not evaluated as quality evidence, reused, overwritten, deleted automatically, or treated as the substantive model.

## Converting an overnight window into an exact step budget

After an acceptable calibration, let `W` be the owner-supplied window in seconds and let `S` be the measured calibration wall-clock seconds divided by five. Propose:

```text
floor(0.80 * W / S)
```

Before training, show the owner the fresh substantive run ID, `device=cpu`, proposed positive steps, batch size `1`, learning rate `0.001`, seed `7101`, approved code revision, calibration duration, peak RSS, requested start/end window, and expected finish time. Start only after the owner explicitly confirms `device=cpu` and that exact positive step count.

Do not infer permission from an approximate phrase such as "overnight," from the five-step calibration approval, or from approval of this handoff.

## Substantive training and evaluation commands — do not run yet

After exact owner approval, run only the isolated trainer with a fresh approved run ID. For the concrete example ID `cpu-quality-run`:

```bash
npm run train:stage7:private-research -- --root .local/stage7-private-research --run-id cpu-quality-run --private-research-only --metadata-only --seed 7101 --steps OWNER_APPROVED_POSITIVE_INTEGER --batch-size 1 --learning-rate 0.001 --device cpu --code-revision 739e596dacbf4ecffc1ea9dc8ea6d9b559e6e159
```

Replace only `OWNER_APPROVED_POSITIVE_INTEGER` with the exact approved count. Do not reuse an existing run directory.

After a successful trainer run and aggregate-only artifact audit, run the evaluator once:

```bash
npm run evaluate:stage7:private-research -- --root .local/stage7-private-research --run-id cpu-quality-run --private-research-only --metadata-only --seed 7101 --mask-repeats 5 --mask-ratio 0.25 --device cpu
```

The evaluator must process exactly 35 deterministic held-out masks and add exactly one `evaluation.json`. Interactively report only evaluation completion, quality-gate pass/fail, scope/distribution status, and unchanged formal boundary status. Never print the trained or baseline metric values.

The quality gate passes only if the trained model's supported non-air macro F1 and macro IoU are each strictly greater than both the matching untrained-model baseline and training-only class-prior baseline. Passing or failing is a valid local research result and never authorizes automatic additional training.

## Known limits

- Seven held-out cases support only a small fixed masked-reconstruction comparison, not a claim of general architectural quality.
- This path does not generate complete buildings, follow prompts, select checkpoints by validation, early-stop, resume, or expose an inference/export path.
- Private research never makes these sources eligible for Dataset v3, M3 real-data training, reward labels, public release, primary construction, or M4.
- The 42 deferred oversized buildings remain outside scope.

## Copy/paste prompt for the next operational window

```text
Open /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents and read the complete handoff file:
docs/superpowers/handoffs/2026-07-15-stage-7-private-quality-evaluation-ready.md

Follow its read-only continuation protocol exactly and stop if any invariant drifts. Work sequentially and do not use parallel agents. Do not push, publish, upload, share, package, or export any private data, metrics, reconstructions, checkpoints, weights, hashes, or generated output.

Do not alter Dataset v1/v2/v3, Dataset v3's false/0 gate, normal Node generation, or M4 Apply Mode. Do not process the 42 deferred oversized buildings or add tiling/rescaling.

No real private training had started when this handoff was written. Do not start a run unless I explicitly provide the device and exact positive step count in this new window. Keep every artifact under .local/stage7-private-research/runs/ and expose only aggregate completion/pass-fail/boundary status.
```
