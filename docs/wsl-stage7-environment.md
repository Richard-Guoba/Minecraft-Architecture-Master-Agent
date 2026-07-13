# WSL Stage 7 Development Environment

Date verified: 2026-07-13

This is the canonical local development and future training environment for Stage 7 M3 work. The repository must remain on the WSL Linux filesystem, such as `/home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents`, rather than `/mnt/c` or `/mnt/d`. Windows remains the host for Codex Desktop, the Minecraft client, and final in-game acceptance.

Environment readiness does not start M3, authorize real-data training, relax the Dataset v3 readiness gate, or enable learned Apply Mode. Normal Minecraft generation and the complete existing test suite remain Node.js-only.

## Pinned Versions

| Component | Pinned or observed value |
| --- | --- |
| WSL | WSL2, Ubuntu 24.04.3 LTS |
| Node.js | 24.18.0 LTS (`.nvmrc`) |
| npm | 11.16.0 bundled with Node 24.18.0 |
| Conda | 24.11.3 from `/home/guoba/anaconda3` |
| Environment | `mcagent-stage7` at `/home/guoba/anaconda3/envs/mcagent-stage7` |
| Python | 3.12.13, owned by Conda |
| PyTorch | 2.13.0+cu130 |
| PyTorch CUDA runtime | 13.0 |
| NumPy | 2.5.1 |
| pytest | 9.1.1 |
| GPU | NVIDIA GeForce RTX 4060 Laptop GPU, compute capability 8.9 |
| WSL NVIDIA driver | 581.42, reported CUDA capability 13.0 |

`torchvision` and `torchaudio` are intentionally absent: the approved fixture-only M3 design needs tensor, 3D model, optimizer, and autograd functionality from `torch`, not image or audio domain packages. Conda-owned interpreter and packaging builds are fixed in `training/stage7/conda-linux-64.lock`; every pip-owned transitive CUDA and Python dependency is fixed in `training/stage7/requirements-wsl-cu130.lock`.

## Node.js Setup

Install NVM first if it is not already present, then run from the repository root:

```bash
source "$HOME/.nvm/nvm.sh"
nvm install
nvm alias default 24.18.0
nvm use
node --version
npm --version
npm ci
```

Expected runtime output is Node `v24.18.0` and npm `11.16.0`. `package.json` retains the broader runtime engine floor; `.nvmrc` is the reproducible WSL development and test version.

## Python 3.12 and PyTorch Setup

Create the named environment through the existing Anaconda installation. Do not create `training/stage7/.venv`:

```bash
conda env create --file training/stage7/environment.yml
conda run -n mcagent-stage7 \
  python -m pip install -r training/stage7/requirements-wsl-cu130.lock
conda run -n mcagent-stage7 python -m pip check
conda doctor -n mcagent-stage7
```

Expected final line:

```text
No broken requirements found.
```

`environment.yml` declares the canonical name, Python/tooling versions, `defaults` channel, and isolation variables. `conda-linux-64.lock` records exact Linux x86-64 Conda builds. `requirements.in` records the deliberate PyTorch-level choices, while `requirements-wsl-cu130.lock` records the complete pip-owned CUDA 13.0 graph. Update these only as a reviewed dependency change.

For an interactive shell:

```bash
conda activate mcagent-stage7
```

`PYTHONNOUSERSITE=1` prevents user-site leakage, and `PYTHONDONTWRITEBYTECODE=1` prevents verification from rewriting Conda-owned bytecode. Conda owns Python, pip, setuptools, packaging, and wheel; pip owns PyTorch and its Python/CUDA dependency graph.

The PyTorch wheels carry their CUDA runtime libraries, so a separate WSL CUDA toolkit or `nvcc` installation is not required for these smoke checks. The Windows NVIDIA driver exposed through WSL must still be compatible and visible through `nvidia-smi`.

## Mandatory CPU Smoke Test

CPU is the acceptance path even on a GPU-equipped machine:

```bash
conda run -n mcagent-stage7 \
  python -m pytest -q -p no:cacheprovider training/stage7
conda run -n mcagent-stage7 \
  python training/stage7/verify_environment.py
```

Verified output:

```text
python: 3.12.13
torch: 2.13.0+cu130
torch_cuda_runtime: 13.0
cpu_smoke: ok
cuda_smoke: skipped
```

The test performs CPU matrix multiplication and backward propagation, then requires finite loss and gradient values.

## RTX 4060 CUDA Smoke Test

```bash
nvidia-smi
conda run -n mcagent-stage7 \
  python training/stage7/verify_environment.py --require-cuda
```

Verified PyTorch output:

```text
python: 3.12.13
torch: 2.13.0+cu130
torch_cuda_runtime: 13.0
cpu_smoke: ok
cuda_device: NVIDIA GeForce RTX 4060 Laptop GPU
cuda_capability: 8.9
cuda_smoke: ok
```

This path requires `torch.cuda.is_available()`, the expected GPU name, a finite CUDA matrix multiplication, and successful device synchronization. It supplements rather than replaces the CPU gate.

## Node Migration Baseline

Run under the pinned Node version:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use
npm ci
npm test
```

The 2026-07-13 WSL verification passed `422/422` tests with zero failures, cancellations, skips, or todo tests. The migration uncovered and fixed one test-only Windows/npm layout assumption: the package-script test now resolves npm correctly under NVM's Linux layout as well as Windows.

## Dataset and Git Integrity

The manifests in the published commit have these canonical LF SHA-256 values:

```text
fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749  v1/manifest.json
af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654  v2/manifest.json
5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082  v3/manifest.json
```

Verify the current working tree:

```bash
sha256sum \
  mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json \
  mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json \
  mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json

git diff --exit-code HEAD -- \
  mc_templates/datasets/coarse_semantic_voxels/v1 \
  mc_templates/datasets/coarse_semantic_voxels/v2 \
  mc_templates/datasets/coarse_semantic_voxels/v3
```

The original v3 benchmark document recorded v1/v2 hashes from a Windows CRLF working tree. Git stores the files with LF line endings, and converting the current LF files to CRLF reproduces those historical values. WSL migration checks therefore use the published Git/WSL LF hashes above and require a zero dataset diff.

At verification time, branch `codex/stage7-dataset-v3-extraction` and its upstream both pointed to commit `05cb618a6da867c3ab19caf28452827717888286`. Before M3 work, fetch the remote and require `git rev-list --left-right --count HEAD...@{u}` to report `0 0`.

## Environment Hygiene Audit

The 2026-07-13 audit found the following:

- `mcagent-stage7` is healthy: `conda doctor` reports no altered or missing files, `pip check` reports no broken requirements, and Python user-site packages are disabled and absent from `sys.path`.
- The superseded repository-local `training/stage7/.venv` was deleted after Conda CPU/CUDA acceptance. No `.venv`, `__pycache__`, or `.pytest_cache` remains in this repository.
- Conda `base` is not cleanly owned: it contains 104 `pypi`-channel packages, and `conda doctor` reports altered `jupyter_console`/`openpyxl` files plus missing metadata or files in several packages. `pip check` still reports no broken Python requirements. Repairing `base` is separate system maintenance and is not required by this project.
- `summer-research` has both `/home/guoba/anaconda3/envs/summer-research` and `/home/guoba/code/summer-research/.venv` (1.8 GB). Both pass `pip check`; the Conda environment has only generated-bytecode alterations. Their duplication is intentionally left untouched because they belong to another project.
- NVM contains Node 24.16.0 and 24.18.0, while `/usr/bin/node` is 18.19.1. This project always resolves `.nvmrc` to Node 24.18.0; removing other versions requires checking their owning projects first.
- `conda clean --dry-run --all` reports approximately 1.74 GB reclaimable. The pip download cache occupies approximately 7.8 GB. Neither global cache was deleted during project setup.

These findings do not leak into `mcagent-stage7` or the Node baseline. Any cleanup of `base`, `summer-research`, inactive Node versions, or global caches should be handled as a separate explicitly approved maintenance task.
