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
