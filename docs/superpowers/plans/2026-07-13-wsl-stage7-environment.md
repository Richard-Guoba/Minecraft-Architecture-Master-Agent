# WSL Stage 7 Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish and verify the canonical WSL2 Node.js/Python/PyTorch development environment before Stage 7 M3 implementation begins.

**Architecture:** Keep the existing Node.js generation runtime independent from a Conda-managed Python 3.12 environment named `mcagent-stage7`. Pin the WSL development runtime, Conda interpreter builds, and CUDA-enabled PyTorch dependency graph, then verify CPU, RTX 4060 CUDA, Node baseline, dataset hashes, Git synchronization, and a clean migration boundary without implementing any M3 model code.

**Tech Stack:** WSL2 Ubuntu 24.04, NVM, Node.js 24.18.0 LTS, npm, Conda, Python 3.12, PyTorch 2.13.0 with CUDA 13.0 wheels, NumPy, pytest.

## Global Constraints

- The canonical clone remains on the WSL Linux filesystem under `/home/guoba`, not `/mnt/c` or `/mnt/d`.
- Normal generation and the complete existing test suite remain Node.js-only.
- Python 3.12 and PyTorch are reserved for explicitly enabled Stage 7 learning work.
- CPU execution is the mandatory acceptance path; CUDA is an additional smoke path.
- Do not implement the M3 loader, model, checkpoint, inference provider, or Apply Mode in this task.
- Do not edit Dataset v1, v2, or v3 artifacts.
- Keep the named Conda environment outside the repository; package caches, checkpoints, and machine-local artifacts remain untracked.

---

### Task 1: Pin the canonical runtimes

**Files:**
- Create: `.nvmrc`
- Modify: `.gitignore`
- Create: `training/stage7/environment.yml`
- Create: `training/stage7/conda-linux-64.lock`
- Create: `training/stage7/requirements.in`
- Create: `training/stage7/requirements-wsl-cu130.lock`

**Interfaces:**
- Consumes: `package.json` Node engine floor and the approved M3 Python 3.12 boundary.
- Produces: an exact Node version and a fully pinned Linux/CUDA Python dependency artifact.

- [x] **Step 1: Install and select Node.js 24.18.0 with NVM**

Run:

```bash
source "$HOME/.nvm/nvm.sh"
nvm install 24.18.0
nvm alias default 24.18.0
nvm use 24.18.0
```

Expected: `node --version` prints `v24.18.0` and `npm --version` succeeds.

- [x] **Step 2: Pin Node and ignore the local Python environment**

Create `.nvmrc` containing `24.18.0`. Keep Python caches and local training output directories ignored. The Conda environment lives outside the repository, and a repository-local `.venv` is not part of the final environment.

- [x] **Step 3: Declare the direct Stage 7 environment inputs**

Create `training/stage7/requirements.in` with:

```text
--index-url https://download.pytorch.org/whl/cu130
--extra-index-url https://pypi.org/simple

numpy==2.5.1
pytest==9.1.1
torch==2.13.0+cu130
```

- [x] **Step 4: Create the Conda-managed Python 3.12 environment and install the pins**

Run:

```bash
conda env create --file training/stage7/environment.yml
conda run -n mcagent-stage7 python -m pip install -r training/stage7/requirements-wsl-cu130.lock
```

Expected: installation exits zero and `python --version` reports Python 3.12.

- [x] **Step 5: Freeze and validate the complete dependency graph**

Generate `training/stage7/requirements-wsl-cu130.lock` from `pip freeze`, preserving the CUDA/PyPI index header, then run:

```bash
conda doctor -n mcagent-stage7
conda run -n mcagent-stage7 python -m pip check
```

Expected: `No broken requirements found.`

### Task 2: Add repeatable environment smoke verification

**Files:**
- Create: `training/stage7/verify_environment.py`
- Test: `training/stage7/verify_environment.py`

**Interfaces:**
- Consumes: the pinned Python environment and optional `--require-cuda` flag.
- Produces: machine-readable runtime/device summaries and a non-zero exit on CPU/autograd/CUDA failure.

- [x] **Step 1: Implement CPU and CUDA smoke checks**

The script must verify Python 3.12, exact PyTorch `2.13.0+cu130`, finite CPU matrix multiplication, CPU autograd, and—when `--require-cuda` is present—CUDA availability, an RTX 4060 device name, a CUDA tensor operation, CUDA synchronization, and finite output.

- [x] **Step 2: Run the mandatory CPU smoke path**

Run:

```bash
conda run -n mcagent-stage7 python training/stage7/verify_environment.py
```

Expected: exit zero with `cpu_smoke: ok`.

- [x] **Step 3: Run the RTX 4060 CUDA smoke path**

Run:

```bash
conda run -n mcagent-stage7 python training/stage7/verify_environment.py --require-cuda
```

Expected: exit zero with `cuda_smoke: ok` and an NVIDIA GeForce RTX 4060 device.

### Task 3: Verify the migrated Node and dataset baseline

**Files:**
- Test: `package-lock.json`
- Test: `test/`
- Test: `mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json`
- Test: `mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json`
- Test: `mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json`

**Interfaces:**
- Consumes: the published branch, package lock, complete Node suite, and committed dataset manifests.
- Produces: migration evidence without rewriting datasets.

- [x] **Step 1: Install Node dependencies from the lockfile**

Run `npm ci` under Node 24.18.0. Expected: exit zero.

- [x] **Step 2: Run the complete Node suite**

Run `npm test`. Expected: all existing tests pass with zero failures.

- [x] **Step 3: Verify committed manifest hashes**

Run `sha256sum` for the v1, v2, and v3 manifests and compare them with the published benchmark evidence. Expected hashes:

```text
v1 fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749
v2 af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654
v3 5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082
```

The older v3 benchmark table records v1/v2 Windows working-tree CRLF hashes. The values above are the published Git/WSL LF bytes and are the canonical migration comparison.

- [x] **Step 4: Verify Git migration identity**

Confirm the remote URL, branch, commit SHA, upstream equality, and absence of unexpected project files.

### Task 4: Document and re-verify the environment

**Files:**
- Create: `docs/wsl-stage7-environment.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: observed successful commands and exact runtime versions.
- Produces: a clean-room setup and verification guide for later M3 work.

- [x] **Step 1: Document setup, pins, smoke commands, and boundaries**

Record the canonical WSL path rule, NVM command, Conda environment creation, lock installation, CPU/CUDA checks, Node test command, expected GPU, and the fact that environment readiness does not authorize real-data training.

- [x] **Step 2: Link the guide from the README**

Add the environment guide to the documentation entry points without changing the project runtime boundary.

- [x] **Step 3: Run final verification from the documented commands**

Run the CPU smoke, CUDA smoke, `pip check`, `npm test`, dataset hashes, and `git diff --check`. Expected: every command exits zero and only intentional documentation/environment files are modified.
