# Conda Stage 7 Environment Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the repository-local Stage 7 `venv` with a Conda-managed Python 3.12 environment named `mcagent-stage7`, preserve the pinned PyTorch/CUDA stack, and audit the wider WSL development environment for stale or conflicting environments.

**Architecture:** Conda owns the Python interpreter and named environment under `/home/guoba/anaconda3/envs/mcagent-stage7`; the repository owns a portable `environment.yml`, an exact Linux Conda package artifact, and the existing fully pinned pip/PyTorch lock. Verification always runs with `conda run -n mcagent-stage7`, and the old repository `.venv` is deleted only after CPU, CUDA, dependency, and test gates pass.

**Tech Stack:** Conda 24.11.3, Python 3.12, pip 26.1.2, PyTorch 2.13.0+cu130, CUDA 13.0 wheels, Node.js 24.18.0 LTS, WSL2 Ubuntu 24.04.

## Global Constraints

- The Conda environment name is exactly `mcagent-stage7`.
- The environment is managed under the existing Anaconda installation at `/home/guoba/anaconda3`.
- `PYTHONNOUSERSITE=1` prevents user-site packages from leaking into Stage 7 verification.
- `PYTHONDONTWRITEBYTECODE=1` prevents verification from rewriting Conda-owned bytecode files.
- CPU execution remains mandatory; RTX 4060 CUDA verification remains an additional gate.
- The old `training/stage7/.venv` is removed only after the Conda environment passes all Python smoke checks.
- Do not delete or modify the unrelated `summer-research` Conda environment or its project-local `.venv`.
- Do not clean global Conda caches or uninstall inactive Node versions without a separate user decision.
- Do not implement Stage 7 M3 loader, model, inference, or training behavior.

---

### Task 1: Create and lock `mcagent-stage7`

**Files:**
- Create: `training/stage7/environment.yml`
- Create: `training/stage7/conda-linux-64.lock`
- Test: `training/stage7/test_verify_environment.py`
- Test: `training/stage7/verify_environment.py`

**Interfaces:**
- Consumes: `training/stage7/requirements-wsl-cu130.lock` and `/home/guoba/anaconda3/bin/conda`.
- Produces: named Conda environment `mcagent-stage7`, portable environment declaration, and exact Conda package URLs.

- [x] **Step 1: Declare the named Conda environment**

Create `training/stage7/environment.yml` with:

```yaml
name: mcagent-stage7
channels:
  - defaults
dependencies:
  - python=3.12.13
  - pip=26.1.2
  - setuptools=82.0.1
  - packaging=26.0
  - wheel=0.47.0
variables:
  PYTHONDONTWRITEBYTECODE: "1"
  PYTHONNOUSERSITE: "1"
```

- [x] **Step 2: Create the Conda interpreter environment**

Run:

```bash
/home/guoba/anaconda3/bin/conda env create --file training/stage7/environment.yml
```

Expected: `/home/guoba/anaconda3/envs/mcagent-stage7/bin/python` exists and reports Python 3.12.

- [x] **Step 3: Install the pinned Python/PyTorch graph**

Run:

```bash
/home/guoba/anaconda3/bin/conda run -n mcagent-stage7 \
  python -m pip install -r training/stage7/requirements-wsl-cu130.lock
/home/guoba/anaconda3/bin/conda run -n mcagent-stage7 python -m pip check
```

Expected: PyTorch `2.13.0+cu130` installs and pip reports `No broken requirements found.`

- [x] **Step 4: Verify CPU and CUDA before removing the old environment**

Run:

```bash
/home/guoba/anaconda3/bin/conda run -n mcagent-stage7 \
  python -m pytest -q -p no:cacheprovider training/stage7
/home/guoba/anaconda3/bin/conda run -n mcagent-stage7 \
  python training/stage7/verify_environment.py
/home/guoba/anaconda3/bin/conda run -n mcagent-stage7 \
  python training/stage7/verify_environment.py --require-cuda
```

Expected: Python test passes, CPU smoke is `ok`, and CUDA identifies the RTX 4060 with capability 8.9.

- [x] **Step 5: Record the exact Conda package build set**

Capture `conda list --explicit -n mcagent-stage7` in `training/stage7/conda-linux-64.lock` and verify every URL belongs to the configured `defaults` channel.

### Task 2: Make project instructions Conda-native

**Files:**
- Modify: `.gitignore`
- Modify: `AGENT.md`
- Modify: `README.md`
- Modify: `docs/wsl-stage7-environment.md`
- Modify: `docs/superpowers/plans/2026-07-13-wsl-stage7-environment.md`

**Interfaces:**
- Consumes: the verified Conda environment name and observed package versions.
- Produces: one canonical environment name and one consistent command path in every active project instruction.

- [x] **Step 1: Remove the repository-local venv convention**

Remove `training/stage7/.venv/` from `.gitignore`; keep Python caches, checkpoints, and run outputs ignored.

- [x] **Step 2: Write `mcagent-stage7` into project-level instructions**

Add the Conda environment name, creation command, activation command, and `conda run` smoke commands to `AGENT.md`, `README.md`, and `docs/wsl-stage7-environment.md`.

- [x] **Step 3: Correct the original WSL environment plan**

Replace its `venv` location and commands with the final Conda-owned environment, without changing the no-M3 and no-real-training boundaries.

### Task 3: Remove superseded local state

**Files:**
- Remove local ignored directory: `training/stage7/.venv`
- Remove local ignored caches created by verification: `.pytest_cache`, `training/stage7/__pycache__`

**Interfaces:**
- Consumes: successful Task 1 CPU/CUDA evidence.
- Produces: one Stage 7 Python environment instead of parallel Conda and `venv` copies.

- [x] **Step 1: Delete only the superseded Stage 7 venv**

Run:

```bash
rm -rf training/stage7/.venv
```

Expected: the directory is absent while `/home/guoba/anaconda3/envs/mcagent-stage7` remains usable.

- [x] **Step 2: Remove task-generated Python caches**

Delete `.pytest_cache` and `training/stage7/__pycache__`, then run the Python verification with `-p no:cacheprovider` so the repository remains cache-clean.

### Task 4: Audit the wider WSL environment

**Files:**
- Test only: Conda environments, project-local virtual environments, NVM installations, Python package health, Conda cache inventory, Git working tree.

**Interfaces:**
- Consumes: `/home/guoba` environment metadata.
- Produces: an evidence-backed hygiene report that distinguishes project-owned cleanup from unrelated environments requiring user choice.

- [x] **Step 1: Run Conda health checks**

Run `conda doctor` and `python -m pip check` for `base`, `summer-research`, and `mcagent-stage7`; separately run `pip check` for `/home/guoba/code/summer-research/.venv` if it still exists.

- [x] **Step 2: Inventory duplicate or stale environments**

List all Conda environments, home-directory `pyvenv.cfg` files, NVM Node installations, system Node, and inactive versions. Do not remove unrelated entries.

- [x] **Step 3: Inventory reclaimable caches and project residue**

Run `conda clean --dry-run --all`, report reclaimable size, and verify the project has no `.venv`, `.pytest_cache`, unexpected `node_modules`, or unignored training outputs.

- [x] **Step 4: Run final project gates**

Run the Conda CPU/CUDA smoke paths, Python test, `pip check`, Node `npm ci && npm test`, dataset HEAD-byte comparison, upstream comparison, and `git diff --check`.
