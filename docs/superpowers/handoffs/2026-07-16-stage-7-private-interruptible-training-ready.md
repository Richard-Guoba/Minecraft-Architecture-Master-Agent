# Stage 7 Private Interruptible Training Ready Handoff

Date: 2026-07-16
Branch: `codex/stage7-dataset-v3-extraction`
Approved implementation revision: `88fb1a9a548e7af0a93185800b521e1f8b12c40d`

This handoff records an implementation-ready state only. It does not authorize a real private training run. No private data, metric, Loss value, reconstruction, checkpoint, optimizer state, weight, generated output, private hash, source name, case identifier, or source URL may be printed, shared, pushed, published, uploaded, packaged, or exported.

## Verified implementation state

The implementation adds a version-two private run protocol without changing Dataset v1/v2/v3, normal Node generation, the Stage 7 primary provider, or M4 Apply Mode. Implementation and tests used only generated synthetic fixtures below `.tmp/`. No new real private training ran, and the ignored real private run root still contains only the two immutable version-one evidence runs that existed before this work.

Fresh verification at approved implementation revision:

1. Focused interruption, recovery, disclosure, checkpoint, and evaluator suite:

   ```bash
   conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research_runtime.py tests/test_private_research_snapshots.py tests/test_private_research_training_v2.py tests/test_private_research_control_cli.py tests/test_monitor_private_research.py tests/test_private_research_checkpoints.py tests/test_evaluate_private_research.py
   ```

   Result: 68 passed, 0 failed.

2. Complete Stage 7 Python suite:

   ```bash
   npm run test:stage7:m3
   ```

   Result: 269 passed, 0 failed.

3. Relevant Node boundary and provider suite:

   ```bash
   /home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/docsProjectStatus.test.js test/stage7PrivateResearchBoundary.test.js test/stage7PrivateResearchCorpus.test.js test/stage7PrivateResearchCli.test.js test/stage7M3Fixtures.test.js test/stage7PythonProvider.test.js
   ```

   Result: 30 passed, 0 failed.

4. Complete Node suite:

   ```bash
   /home/guoba/.nvm/versions/node/v24.18.0/bin/node --test
   ```

   Result: 465 passed, 0 failed.

Normal sandbox execution can report `EPERM` for Node tests that spawn child processes. The recorded relevant and full Node results used only the narrowly approved normal-child-process execution of the exact commands above.

## Formal Dataset and private aggregate invariants

The formal manifest SHA-256 values remain:

- Dataset v1: `fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749`
- Dataset v2: `af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654`
- Dataset v3: `5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082`

Dataset v3 remains:

```json
{"ready_for_m3_real_data":false,"training_eligible_count":0}
```

The ignored and untracked private root passed full preflight with these aggregate-only values:

- active source files: 22
- deferred oversized buildings: 42
- source manifest records: 22
- prepared manifest records: 22
- prepared binaries: 22, all exactly 64 cubed bytes
- train/validation split: 15/7
- existing run directories: 2
- existing run root artifact counts: `[4,5]`

The existing version-one runs are immutable and non-resumable. Their exact four/five-file evidence remains valid under the preserved v1 checkpoint and evaluator paths. Do not rename, rewrite, migrate, or add runtime files to them.

## Version-two run protocol

A fresh v2 run is bound immutably to its run ID, target steps, seed, batch size, learning rate, CPU device, exact clean Git revision, training-code digest, prepared manifest, split, formal Dataset hashes/gate, and Python/Torch/NumPy versions.

The run root contains only `.runtime/`, `metrics.jsonl`, `reconstruction.bin`, `checkpoint.pt`, and `checkpoint_manifest.json`. The final manifest declares the exact recursive regular-file inventory and the hashes of the checkpoint, metrics, and reconstruction. Unknown files, symlinks, nested runtime directories, temporary files, inventory drift, non-completed state, a non-terminal snapshot, or a hash mismatch fail closed.

`.runtime/` owns:

- `run.lock`
- `run-state.json`
- public `progress.json`
- private `private-progress.json`
- fixed `resume-a.pt` and `resume-b.pt` slots
- `resume-pointer.json`
- optional `pause-request.json`

State transitions are explicit across `initializing`, `running`, `pause_requested`, `paused`, `interrupted`, and `completed`. Finalization is exact-target and idempotent: an existing intended final file must match byte-for-byte or the run stops with a conflict while preserving that file.

Resume snapshots are strict CPU `weights_only=True` payloads containing the exact model, SGD optimizer, finite Loss prefix, latest reconstruction, RNG states, immutable binding, completed step, generation, and active time. Generation zero uses slot A; later snapshots rotate over the inactive fixed slot. A pointer-selected corrupt slot may fall back only to the other validated slot. Snapshots are committed every five active minutes, so sudden power loss can discard at most about five active minutes. The two fixed slots are overwritten rather than accumulated.

Public progress contains state, completed/target steps, percentage, active time, recent throughput, ETA, and snapshot age. Exact current and rolling Loss exist only in the separate private progress file. Default monitoring never opens that file. `--show-private-loss` is allowed only by the owner in a local interactive TTY and refuses redirected or non-TTY output.

At an optimizer-step boundary, RSS at or above 1.5 GiB or any detected swap creates a cooperative pause request. `SIGINT` and `SIGTERM` only set the same pending token; signal handlers perform no file or Torch I/O. A pause is safe only after the matching request ID is acknowledged, the current completed step equals the validated snapshot step, state is `paused`, and the trainer has released `run.lock`. The pause command never kills the process.

Resume accepts only the private root and the same run ID. It has no target-step, device, batch-size, learning-rate, seed, or revision override. It re-runs full preflight and exact repository/code/environment binding checks before restoring the latest valid snapshot. Only a completed v2 run may enter v2 evaluation. Evaluation does not resume or repair a run and reads public completion state without reading or printing private Loss.

## Proposed later run, still blocked

Fresh proposed run ID: `cpu-overnight-v2-20260716`

- device: CPU
- seed: 7101
- batch size: 1
- learning rate: 0.001
- target steps: 185946
- Torch threads: 1
- DataLoader workers: 0
- minimum available memory before start/resume: 8 GiB
- recovery interval: 300 active seconds
- recovery slots: 2 fixed overwritten slots
- cooperative RSS pause threshold: 1.5 GiB
- any swap: cooperative pause

This proposal is not authorization. In the later operational window, do not start until the owner sends exactly:

```text
device=cpu,steps=185946
```

No earlier approval, this handoff, the implementation commits, a time window, or a monitor request substitutes for that new literal approval.

## Later operational continuation protocol

1. Read this entire handoff before taking action.
2. Run the Git protocol below and every formal/private aggregate check from this handoff as read-only commands.
3. Stop on any dirty tree, wrong branch/revision relation, extra handoff path, tracked private root, failed ignore check, failed preflight, Dataset hash/gate drift, changed 22/42/15/7 scope, changed two-run `[4,5]` state, unknown real artifact, or symlink.
4. Present the proposed run ID and fixed CPU, seed 7101, batch 1, learning rate 0.001, 185946-step, five-minute A/B, and 1.5 GiB pause configuration.
5. Wait for the new literal `device=cpu,steps=185946` approval in that operational window.
6. After approval, start only `npm run train:stage7:private-research` with `--metadata-only`, the fresh proposed run ID, and the handoff-approved implementation revision.
7. Give the owner the default local monitor command. Only the owner may add `--show-private-loss` in an interactive IDE terminal.
8. On pause, report safe shutdown only after matching acknowledgement, validated snapshot equality, `paused` state, and released run lock.
9. On completion, audit only containment, exact v2 inventory, scope/distribution, finite-status booleans, checkpoint integrity, formal Dataset hashes/gate, and evaluator completion/gate boolean. Do not expose private metrics or content.
10. Stop after one evaluator run. Do not automatically retry, extend, change device, train again, process oversized buildings, or add tiling, cropping, or rescaling.

## Non-self-referential Git protocol

After this handoff is committed, run exactly:

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

- `git status --short` prints nothing.
- branch is `codex/stage7-dataset-v3-extraction`.
- `HEAD^` is `88fb1a9a548e7af0a93185800b521e1f8b12c40d`.
- subject is `docs(stage7): hand off interruptible private training`.
- the only changed path is `docs/superpowers/handoffs/2026-07-16-stage-7-private-interruptible-training-ready.md`.
- `git ls-files .local/stage7-private-research` prints nothing.
- `git check-ignore -q .local/stage7-private-research` exits zero.

Do not push, publish, upload, share, package, export, or open a pull request from this handoff.
