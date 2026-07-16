# Stage 7 M3 Fixture-Only Foundation

This directory contains the optional Python/PyTorch subsystem for the **Stage 7 M3 fixture-only foundation**. It proves CPU training, checkpoint, inference, Node schema validation, and shadow-operation plumbing against two committed synthetic fixtures. It is not M3 real-data training, and it provides no evidence of accuracy, preference, generalization, or model quality.

Normal Minecraft generation remains Node.js-only. Python is optional unless the `python` Stage 7 shadow provider or one of the explicit commands below is selected. Python emits only provider-neutral `envelope`, `space`, and `site` semantic plans; it emits no Minecraft blocks, commands, or primary blueprint operations. Apply Mode remains unavailable until Stage 7 M4.

## Platform and environment

Use WSL2 Ubuntu with the repository on the Linux filesystem (for example, `~/projects/Minecraft-Constructing-Agents`), not under `/mnt/c` or `/mnt/d`. Use the Conda environment named `mcagent-stage7`; do not create a repository-local `.venv`. The committed environment and lock files pin Python 3.12.13, NumPy 2.5.1, PyTorch 2.13.0+cu130, and pytest 9.1.1. Node.js 24.18.0 from the repository `.nvmrc` is the evidence runtime, while the project runtime floor remains Node.js 20+.

From the repository root, create or update the environment and verify it:

```bash
conda env update --name mcagent-stage7 --file training/stage7/environment.yml --prune
conda run -n mcagent-stage7 python -m pip install -r training/stage7/requirements-wsl-cu130.lock
conda run -n mcagent-stage7 python -m pip check
conda run -n mcagent-stage7 python training/stage7/verify_environment.py
npm run test:stage7:m3
```

The CPU verification is mandatory. CUDA is optional acceleration and is deliberately separate from acceptance:

```bash
conda run -n mcagent-stage7 python training/stage7/verify_environment.py --require-cuda
```

## Fixture workflow

The committed fixture root is `training/stage7/fixtures/m3/`. It contains two source-independent cases, has `origin: synthetic-fixture`, `fixture_only: true`, and contributes `0` to readiness. Local checkpoints and run artifacts belong under the ignored roots `training/stage7/checkpoints/` and `training/stage7/runs/`.

Train the two-case fixture smoke model:

```bash
npm run train:stage7:fixture -- --fixture-root fixtures/m3 --output runs/m3-fixture-smoke --seed 7101 --steps 2 --learning-rate 0.001 --device cpu --code-revision local-smoke
```

Run Python inference and then the authoritative Node plan validator:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.infer --checkpoint runs/m3-fixture-smoke/checkpoint.pt --manifest runs/m3-fixture-smoke/checkpoint_manifest.json --condition fixtures/m3/cases/one-floor-house/condition.json --output runs/m3-fixture-smoke/inference.json
node training/stage7/validate_plan.mjs training/stage7/fixtures/m3/cases/one-floor-house/condition.json training/stage7/runs/m3-fixture-smoke/inference.json
```

Run mandatory cross-runtime CPU acceptance:

```bash
npm run accept:stage7:m3 -- --fixture-root fixtures/m3 --output runs/m3-acceptance --seed 7101 --steps 2
```

Acceptance trains two isolated identical fixture runs, compares checkpoint, manifest, metrics, parameter, loss, and canonical inference hashes, validates both plans in Node, and compares the exact ordered `blueprint.operations` from fixed-seed rule-only and Python-shadow builds. The Node provider takes immutable checkpoint/manifest snapshots, rejects invalid UTF-8 or lineage, and uses `STAGE7_PYTHON_EXECUTABLE` only for the explicitly selected shadow run. A shadow candidate may convert or reject; in both cases the primary operations must remain identical. No Apply behavior is exercised.

Fixture loss is a plumbing signal only. It is not quality evidence and must not be reported as accuracy, model quality, preference, or generalization.

## Private-research corpus preparation

The separate private-research path is local-only experimentation for manually supplied external templates. It is not Dataset v3, does not make any source training-eligible, does not change M3 fixture-only behavior, and may never be used for release, sharing, M4 Apply Mode, or primary construction operations.

Initialize an ignored local root and then create `PRIVATE_RESEARCH_ACK.json` yourself from the printed template. The command intentionally never writes that acknowledgement for you:

```bash
npm run private-research:stage7 -- init --root .local/stage7-private-research
```

After you manually place only `.schem` or `.schematic` files in `.local/stage7-private-research/source/`, import their local hashes and prepare bounded 64³ raw volumes:

```bash
npm run private-research:stage7 -- import --root .local/stage7-private-research --obtained-at 2026-07-15T00:00:00.000Z
npm run private-research:stage7 -- prepare --root .local/stage7-private-research --seed 7101
```

The commands never download a source, upload metrics, call Python, or train a model. They reject missing acknowledgement, Git-tracked or non-ignored paths, symbolic-link escapes, unsupported formats, changed source hashes, duplicate content at different paths, malformed NBT, and buildings whose non-air bounds exceed 64³. Private files remain marked `unverified`, `prohibited`, and `local-private-research-only`.

The separately named trainer is deliberately offline and isolated. It rechecks the acknowledgement, source and prepared hashes, split, exact Git revision, training-code digest, formal Dataset v1/v2/v3 hashes, and Dataset v3's `false`/`0` gate. A version-two run stores its final files and a `.runtime/` state directory only below `.local/stage7-private-research/runs/RUN_ID/`. It has no upload, export, M3, M4, or primary-provider behavior.

No command in this document authorizes a real run. A later operational window must first verify the committed handoff and obtain the owner's new literal approval `device=cpu,steps=185946`. Only then may the operator substitute a fresh `RUN_ID` and the handoff-approved 40-character `APPROVED_CODE_REVISION` in this template:

```bash
npm run train:stage7:private-research -- --root .local/stage7-private-research --run-id RUN_ID --private-research-only --metadata-only --seed 7101 --steps 185946 --batch-size 1 --learning-rate 0.001 --device cpu --code-revision APPROVED_CODE_REVISION
```

The trainer uses one CPU thread, batch size one, no DataLoader workers, and no full-corpus preload. It requires at least 8 GiB available memory before a fresh run or resume. At an optimizer-step boundary, RSS at 1.5 GiB or any detected swap requests a cooperative pause. `SIGINT` and `SIGTERM` request the same safe pause; they do not perform Torch or file I/O inside the signal handler.

Recovery snapshots are committed every five active minutes into exactly two overwritten slots, A and B. A power loss can therefore discard at most about five active minutes of work. The pause command reports success only after the matching request is acknowledged, the current step is present in a validated snapshot, run state is `paused`, and the trainer has released its run lock. Resume accepts only the private root and the same `RUN_ID`; it has no step, device, batch-size, or learning-rate override.

Use the local read-only monitor from an IDE terminal:

```bash
npm run monitor:stage7:private-research -- --root .local/stage7-private-research --run-id RUN_ID --private-research-only
npm run monitor:stage7:private-research -- --root .local/stage7-private-research --run-id RUN_ID --private-research-only --show-private-loss
npm run pause:stage7:private-research -- --root .local/stage7-private-research --run-id RUN_ID --private-research-only --metadata-only
npm run resume:stage7:private-research -- --root .local/stage7-private-research --run-id RUN_ID --private-research-only --metadata-only
```

The default monitor reads only public progress and never opens the private Loss file. `--show-private-loss` is an explicit local-only option and refuses non-interactive, piped, or redirected stdout. Exact Loss, metrics, reconstructions, checkpoints, weights, optimizer state, and generated output remain prohibited from sharing or export.

For version two, evaluation is allowed only after run state, terminal snapshot, hashes, and declared inventory all prove completion. The two existing version-one private runs retain their immutable four/five-file evidence and evaluator compatibility, but they cannot resume. Neither version may change Dataset readiness, make an unverified source eligible, feed normal Node generation, or produce an M4 artifact.

### Private held-out quality evaluation

The evaluator is separate from optimization. It uses the existing 15/7 private split, evaluates five deterministic 25% masks per validation case, and compares non-air macro F1/IoU against an untrained model and a training-only add-one-smoothed class-prior baseline. Exact metrics remain only in the selected run's local `evaluation.json`; stdout reports only scope, distribution, completion, and quality-gate pass/fail.

The current proposed overnight configuration is CPU, seed 7101, batch size 1, learning rate 0.001, and 185946 steps. It remains blocked until the later operational window receives exactly `device=cpu,steps=185946`; prior approvals, this README, and the implementation commits are not operational authorization.

Evaluate a completed substantive private run with metadata-safe stdout:

```bash
npm run evaluate:stage7:private-research -- --root .local/stage7-private-research --run-id RUN_ID --private-research-only --metadata-only --seed 7101 --mask-repeats 5 --mask-ratio 0.25 --device cpu
```

This command never exports inference, samples, metrics, checkpoints, or weights and never changes Dataset v1/v2/v3, Dataset v3's false/zero gate, normal Node generation, or M4 Apply Mode.

## Real-data gate

Fixture loading and real Dataset v3 loading are separate constructors with separate origins and roots. Normal real-data admission requires all of the following before tensor data is read:

- `load_case` requests each canonical target layer (`envelope`, `space`, and `site`) exactly once; empty, partial, unknown, or duplicate real-mode requests fail closed because the current loader returns a complete three-layer plan and the model trains all three heads;
- `training.eligible` is true;
- review status is approved or limited for every requested learning area;
- source permissions include `local-training`;
- extraction semantic status is accepted;
- both training and reviewed layer lists cover all of `envelope`, `space`, and `site`;
- the review plan SHA-256 equals the exact Dataset v3 plan SHA-256;
- the artifact path stays inside the configured real artifact root;
- the local artifact SHA-256 matches the committed record.

Fixture mode retains its existing per-layer request behavior for isolated synthetic smoke tests.

The immutable Dataset v3 manifest currently has `ready_for_m3_real_data=false` and `training_eligible_count=0`. Real training is prohibited. The acceptance command reads that committed manifest before creating output and aborts unless those values are exactly `false` and `0`; it can never silently turn into a real-data training command. Dataset v1, v2, and v3 remain immutable.

## Artifact contracts

`checkpoint_manifest.json` records these fields: `source`, `schema_version`, `training_scope`, `model_name`, `model_version`, `dataset_version`, `dataset_manifest_sha256`, `code_revision`, `python_version`, `torch_version`, `seed`, `device`, `deterministic_algorithms`, normalized `config`, `checkpoint_file`, and `checkpoint_sha256`. The scope is always `fixture-only`; there is no timestamp, hostname, absolute path, CUDA device, quality score, or mutable Git state.

Python inference returns `input_sha256`, `output_sha256`, and a canonical Stage 7 plan. The plan provider records `kind`, `name`, `model_version`, `dataset_version`, and `checkpoint_version`; the plan binds the condition through `condition_hash`. The acceptance manifest at `training/stage7/runs/m3-acceptance/acceptance.json` records the reproducibility booleans and hashes, Node validation status/counts, Dataset v3 gate values, shadow status, ordered-operation count/hash/parity, `training_scope: fixture-only`, and `real_training_started: false`.

See the [Stage 7 M3 fixture foundation benchmark](../../docs/benchmarks/stage7-m3-fixture-foundation.md) for the verified command results and limitations.
