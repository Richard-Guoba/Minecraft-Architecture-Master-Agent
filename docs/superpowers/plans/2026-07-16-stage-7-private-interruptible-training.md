# Stage 7 Private-Research Interruptible Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking. Do not use subagent-driven development or dispatch parallel agents: the project owner requires sequential execution.

**Goal:** Add a resource-light, deterministic Stage 7 private trainer that can publish a local progress bar and opt-in loss, pause safely at an optimizer-step boundary, rotate two five-minute recovery snapshots, and resume the same version-two run without changing its configuration.

**Architecture:** Keep the existing private corpus preflight and model isolated, but move long-running orchestration out of the CLI into focused runtime, snapshot, and training modules. A cooperative file protocol under each run's .runtime directory owns state, progress, pause requests, locking, and two atomic snapshot slots. The final checkpoint/evaluator contract branches explicitly by manifest schema so the two existing version-one runs remain immutable and valid.

**Tech Stack:** Python 3.12, PyTorch 2.13, NumPy 2.5, pytest 9, Linux fcntl and /proc resource readings, Node.js 24 package scripts, and Markdown documentation. Add no dependency, network service, experiment tracker, uploader, export path, process manager, or cloud integration.

## Global Constraints

- Keep Dataset v1/v2/v3 byte-identical with SHA-256 values fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749, af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654, and 5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082.
- Keep Dataset v3 ready_for_m3_real_data=false and training_eligible_count=0. Do not alter M3, normal Node generation, the primary provider, or M4 Apply Mode.
- Keep private sources and prepared volumes below .local/stage7-private-research/. Keep every runtime file, exact loss, metric, reconstruction, checkpoint, optimizer state, weight, private hash, and generated output created here below .local/stage7-private-research/runs/.
- Never push, publish, upload, share, package, or export private data or artifacts. Do not open a pull request.
- Keep the active corpus at 22 cases, its split at 15/7, and all 42 deferred oversized buildings untouched. Add no tiling, cropping, rescaling, or oversized-building processing.
- Preserve the existing cpu-calibration-20260715 and cpu-quality-20260715-2300 run directories byte-for-byte. They remain version-one, non-resumable evidence.
- Use CPU, batch size 1, learning rate 0.001, seed 7101, deterministic algorithms, one Torch thread, zero DataLoader workers, and no full-corpus preload for the planned overnight run.
- Fix the recovery interval at 300 active seconds, use exactly two overwritten slots, and cooperatively pause at or above 1.5 GiB RSS.
- Default CLI and Codex-facing output must not read or print exact loss. Only the owner's interactive local monitor may use --show-private-loss, and it must refuse non-TTY or redirected output.
- Do not run real private training during implementation. Synthetic tests may create ignored data only below .tmp/. A real run remains blocked until the owner later sends exactly device=cpu,steps=185946 in the operational window.
- Work sequentially with TDD and one local commit per task. Run every red test before implementation and every green test after it.

---

## File structure

| Path | Responsibility |
|---|---|
| training/stage7/mcagent_stage7/private_research_runtime.py | Version-two paths, state schema, legal transitions, atomic JSON/bytes, directory and run locks, pause request/acknowledgement, repository identity, progress, and Linux resource readings. |
| training/stage7/mcagent_stage7/private_research_snapshots.py | Strict weights-only resume payload, RNG encoding, optimizer/model validation, two-slot rotation, pointer commit, and fallback. |
| training/stage7/mcagent_stage7/private_research_training.py | Fresh initialization, resumable training loop, periodic snapshots, memory/signal pause, deterministic restoration, and idempotent exact-target finalization. |
| training/stage7/mcagent_stage7/train_private_research.py | Fresh-run metadata-only CLI and compatibility exports for training configuration/result types. |
| training/stage7/mcagent_stage7/pause_private_research.py | Metadata-safe cooperative pause request that waits for durable acknowledgement. |
| training/stage7/mcagent_stage7/resume_private_research.py | Metadata-only same-run resume CLI with no configuration overrides. |
| training/stage7/mcagent_stage7/monitor_private_research.py | Read-only local progress bar and explicit interactive loss display. |
| training/stage7/mcagent_stage7/private_research_checkpoints.py | Preserve v1 final checkpoints and add v2 final manifest/checkpoint save/load validation. |
| training/stage7/mcagent_stage7/evaluate_private_research.py | Preserve exact v1 artifact validation and add completed-only v2 artifact validation. |
| training/stage7/tests/test_private_research_runtime.py | State, atomic write, lock, pause, repository identity, and resource tests. |
| training/stage7/tests/test_private_research_snapshots.py | RNG, payload, slot rotation, corruption, and atomic interruption tests. |
| training/stage7/tests/private_research_test_support.py | Shared generated synthetic private roots, deterministic configs, and runtime-service seams; contains no real private data. |
| training/stage7/tests/test_private_research_training_v2.py | Synthetic fresh, pause, resume, memory, deterministic equivalence, and finalization tests. |
| training/stage7/tests/test_private_research_control_cli.py | Train, pause, resume, signal, acknowledgement, timeout, and scrubbed-output tests. |
| training/stage7/tests/test_monitor_private_research.py | Progress rendering, read-only behavior, loss opt-in, and TTY refusal tests. |
| training/stage7/tests/test_private_research_checkpoints.py | Existing v1 regression tests plus strict v2 final checkpoint tests. |
| training/stage7/tests/test_evaluate_private_research.py | Existing v1 evaluator regressions plus exact completed v2 artifact tests. |
| package.json | Add pause, resume, and monitor package scripts without changing normal Node scripts. |
| training/stage7/README.md | Document v2 lifecycle, local progress/loss, pause, resume, memory limit, and the operational approval gate. |
| docs/superpowers/handoffs/2026-07-16-stage-7-private-interruptible-training-ready.md | Durable post-verification continuation and exact implementation-baseline protocol. |

## Task 1: Add the version-two runtime state and cooperative control primitives

**Files:**
- Create: training/stage7/mcagent_stage7/private_research_runtime.py
- Create: training/stage7/tests/test_private_research_runtime.py

**Interfaces:**
- Consumes: PrivateResearchError, PrivateResearchPreflight, validate_private_run_id, pathlib.Path, Linux fcntl, subprocess Git, /proc/self/status, and /proc/meminfo.
- Produces: PrivateRunPaths, PrivateRunState, RuntimeServices, ResourceSample, paths_for_run(), create_initial_state(), read_run_state(), write_run_state(), transition_state(), hold_run_lock(), request_pause(), read_pause_request(), acknowledge_pause(), publish_progress(), read_public_progress(), read_private_progress(), require_repository_identity(), compute_training_code_sha256(), and sample_resources().

- [ ] **Step 1: Write failing state, lock, and pause tests**

~~~python
from __future__ import annotations

import json
import subprocess
from dataclasses import replace
from pathlib import Path

import pytest

from mcagent_stage7.private_research import PrivateResearchError
from mcagent_stage7.private_research_runtime import (
    PrivateRunState,
    hold_run_lock,
    paths_for_run,
    read_pause_request,
    read_private_progress,
    read_public_progress,
    read_run_state,
    request_pause,
    publish_progress,
    transition_state,
    write_run_state,
)


def state_for_test() -> PrivateRunState:
    return PrivateRunState(
        schema_version=2,
        status="initializing",
        run_id="safe-run",
        binding={"target_steps": 10, "device": "cpu"},
        completed_steps=0,
        snapshot_steps=0,
        target_steps=10,
        snapshot_generation=-1,
        pause_request_id=0,
        pause_acknowledged_id=0,
        active_seconds=0.0,
        paused_seconds=0.0,
        paused_at_epoch_seconds=None,
        pause_reason=None,
        lost_steps_on_last_resume=0,
    )


def test_state_round_trip_and_transition_table(tmp_path: Path) -> None:
    paths = paths_for_run(tmp_path / "runs" / "safe-run")
    paths.runtime_path.mkdir(parents=True)
    state = state_for_test()
    write_run_state(paths, state)
    assert read_run_state(paths) == state
    running = transition_state(state, "running")
    requested = transition_state(running, "pause_requested")
    paused = transition_state(requested, "paused")
    assert transition_state(paused, "running").status == "running"
    with pytest.raises(PrivateResearchError, match="RUN_STATE_TRANSITION_INVALID"):
        transition_state(state, "completed")


def test_run_lock_refuses_a_second_writer(tmp_path: Path) -> None:
    paths = paths_for_run(tmp_path / "runs" / "safe-run")
    paths.runtime_path.mkdir(parents=True)
    with hold_run_lock(paths):
        with pytest.raises(PrivateResearchError, match="RUN_LOCKED"):
            with hold_run_lock(paths):
                raise AssertionError("unreachable")


def test_pause_requests_are_monotonic_and_atomic(tmp_path: Path) -> None:
    paths = paths_for_run(tmp_path / "runs" / "safe-run")
    paths.runtime_path.mkdir(parents=True)
    assert request_pause(paths, reason="owner") == 1
    assert request_pause(paths, reason="owner") == 1
    request = read_pause_request(paths)
    assert request == {
        "schema_version": 1,
        "request_id": 1,
        "reason": "owner",
        "acknowledged_id": 0,
        "acknowledged_state": None,
    }
    assert not paths.pause_request_path.with_name("pause-request.json.tmp").exists()
~~~

- [ ] **Step 2: Run the focused test and verify the module is absent**

Run:

~~~bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research_runtime.py
~~~

Expected: collection fails with ModuleNotFoundError for mcagent_stage7.private_research_runtime.

- [ ] **Step 3: Implement exact paths, state schema, transitions, atomic writes, and locks**

Create these public data structures and constants:

~~~python
RUN_SCHEMA_VERSION = 2
PAUSE_SCHEMA_VERSION = 1
PUBLIC_PROGRESS_SCHEMA_VERSION = 1
PRIVATE_PROGRESS_SCHEMA_VERSION = 1
RSS_PAUSE_BYTES = 1536 * 1024 * 1024
MIN_AVAILABLE_BYTES = 8 * 1024 * 1024 * 1024
LEGAL_TRANSITIONS = {
    "initializing": frozenset({"running", "interrupted"}),
    "running": frozenset({"pause_requested", "interrupted", "completed"}),
    "pause_requested": frozenset({"paused", "interrupted"}),
    "paused": frozenset({"running"}),
    "interrupted": frozenset({"running"}),
    "completed": frozenset(),
}


@dataclass(frozen=True)
class PrivateRunPaths:
    run_path: Path
    runtime_path: Path
    run_lock_path: Path
    state_path: Path
    progress_path: Path
    private_progress_path: Path
    pause_request_path: Path
    resume_a_path: Path
    resume_b_path: Path
    resume_pointer_path: Path


@dataclass(frozen=True)
class PrivateRunState:
    schema_version: int
    status: str
    run_id: str
    binding: dict[str, Any]
    completed_steps: int
    snapshot_steps: int
    target_steps: int
    snapshot_generation: int
    pause_request_id: int
    pause_acknowledged_id: int
    active_seconds: float
    paused_seconds: float
    paused_at_epoch_seconds: float | None
    pause_reason: str | None
    lost_steps_on_last_resume: int


def paths_for_run(run_path: Path) -> PrivateRunPaths:
    run = Path(run_path)
    runtime = run / ".runtime"
    return PrivateRunPaths(
        run_path=run,
        runtime_path=runtime,
        run_lock_path=runtime / "run.lock",
        state_path=runtime / "run-state.json",
        progress_path=runtime / "progress.json",
        private_progress_path=runtime / "private-progress.json",
        pause_request_path=runtime / "pause-request.json",
        resume_a_path=runtime / "resume-a.pt",
        resume_b_path=runtime / "resume-b.pt",
        resume_pointer_path=runtime / "resume-pointer.json",
    )


def transition_state(state: PrivateRunState, target: str, **changes: Any) -> PrivateRunState:
    if target not in LEGAL_TRANSITIONS.get(state.status, frozenset()):
        raise PrivateResearchError(
            "RUN_STATE_TRANSITION_INVALID",
            state.status + "->" + target,
        )
    result = replace(state, status=target, **changes)
    _validate_state(result)
    return result
~~~

Implement _validate_state() with exact field-set loading and these rules: schema version is 2; status is in LEGAL_TRANSITIONS; run_id passes validate_private_run_id(); binding is a dict; target_steps is a positive non-bool integer; completed_steps and snapshot_steps are non-bool integers satisfying 0 <= snapshot_steps <= completed_steps <= target_steps; snapshot_generation is an integer at least -1; request and acknowledgement IDs are integers satisfying 0 <= acknowledged <= request; active and paused seconds are finite nonnegative numbers; paused_at_epoch_seconds is None or a finite nonnegative number; pause_reason is None or one of owner, signal, memory_limit, and swap_detected; lost_steps_on_last_resume is a nonnegative integer. pause_requested requires request_id > acknowledged_id and a non-None reason. paused requires request_id=acknowledged_id>0, snapshot_steps=completed_steps, a non-None reason, and a non-None paused_at_epoch_seconds. completed requires completed_steps=snapshot_steps=target_steps and paused_at_epoch_seconds=None.

Use canonical JSON with sort_keys=True, separators=(",", ":"), and one trailing newline. Implement atomic_write_bytes() by writing to the fixed sibling name filename + ".tmp", flushing, fsyncing the file, calling os.replace(), and fsyncing the parent directory. Reusing the fixed temporary filename intentionally consumes a prior interrupted temporary write; no run directory is deleted or recreated.

Implement hold_run_lock() with fcntl.flock(handle, LOCK_EX | LOCK_NB) on .runtime/run.lock and map BlockingIOError to RUN_LOCKED. Implement a short control lock by flocking an open file descriptor for the .runtime directory; use it only while reading and replacing pause-request.json so two pause writers cannot race.

- [ ] **Step 4: Add failing repository, progress, and resource tests**

~~~python
def test_repository_identity_requires_clean_exact_head(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import mcagent_stage7.private_research_runtime as module

    calls: list[tuple[str, str, str]] = []

    def fake_run(command: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(tuple(command))
        output = "a" * 40 + "\n" if command[1:3] == ["rev-parse", "HEAD"] else ""
        return subprocess.CompletedProcess(command, 0, output, "")

    monkeypatch.setattr(module.subprocess, "run", fake_run)
    assert module.require_repository_identity(tmp_path, "a" * 40) == "a" * 40
    assert calls == [
        ("git", "status", "--porcelain"),
        ("git", "rev-parse", "HEAD"),
    ]


def test_public_progress_excludes_loss_and_private_progress_contains_it(
    tmp_path: Path,
) -> None:
    paths = paths_for_run(tmp_path / "runs" / "safe-run")
    paths.runtime_path.mkdir(parents=True)
    publish_progress(
        paths,
        state="running",
        completed_steps=4,
        target_steps=10,
        active_seconds=2.0,
        recent_steps_per_second=2.0,
        eta_seconds=3.0,
        snapshot_age_seconds=1.0,
        current_loss=1.25,
        rolling_loss=1.5,
    )
    public = read_public_progress(paths)
    private = read_private_progress(paths)
    assert "loss" not in json.dumps(public)
    assert private["current_loss"] == 1.25
    assert private["rolling_100_loss"] == 1.5


def test_resource_parser_reports_rss_swap_and_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import mcagent_stage7.private_research_runtime as module

    contents = {
        Path("/proc/self/status"): "VmRSS:\t800000 kB\nVmSwap:\t0 kB\n",
        Path("/proc/meminfo"): "MemAvailable:   9000000 kB\n",
    }
    monkeypatch.setattr(
        module.Path,
        "read_text",
        lambda self, encoding="utf8": contents[self],
    )
    sample = module.sample_resources()
    assert sample.rss_bytes == 800000 * 1024
    assert sample.swap_bytes == 0
    assert sample.available_bytes == 9000000 * 1024
~~~

- [ ] **Step 5: Implement repository identity, code digest, progress, pause acknowledgement, and resources**

require_repository_identity() must run git status --porcelain and reject any output with REPOSITORY_DIRTY, then run git rev-parse HEAD and require exact equality with a 40-character lowercase requested revision or raise CODE_REVISION_MISMATCH.

compute_training_code_sha256() must hash the UTF-8 relative path, a NUL byte, the file bytes, and a NUL byte for each path in this fixed lexical tuple:

~~~python
TRAINING_CODE_PATHS = (
    "training/stage7/mcagent_stage7/private_research.py",
    "training/stage7/mcagent_stage7/private_research_checkpoints.py",
    "training/stage7/mcagent_stage7/private_research_model.py",
    "training/stage7/mcagent_stage7/private_research_runtime.py",
    "training/stage7/mcagent_stage7/private_research_snapshots.py",
    "training/stage7/mcagent_stage7/private_research_training.py",
    "training/stage7/mcagent_stage7/train_private_research.py",
    "training/stage7/mcagent_stage7/pause_private_research.py",
    "training/stage7/mcagent_stage7/resume_private_research.py",
)
~~~

request_pause() must return any existing unacknowledged request ID unchanged, otherwise increment the last request ID and atomically write the exact five-field schema from the test. acknowledge_pause() must require an exact current request ID, preserve reason, and atomically set acknowledged_id and acknowledged_state="paused".

publish_progress() must atomically write separate public and private files. Validate every numeric value as finite and nonnegative; current and rolling loss must be finite. Never copy loss into the public dict.

~~~python
@dataclass(frozen=True)
class ResourceSample:
    rss_bytes: int
    swap_bytes: int
    available_bytes: int


@dataclass(frozen=True)
class RuntimeServices:
    monotonic: Callable[[], float] = time.monotonic
    wall_time: Callable[[], float] = time.time
    sleep: Callable[[float], None] = time.sleep
    resources: Callable[[], ResourceSample] = sample_resources
    fault_hook: Callable[[str], None] = lambda stage: None
    after_step: Callable[[PrivateRunPaths, int], None] = lambda paths, step: None
~~~

Parse VmRSS, VmSwap, and MemAvailable as integer kB lines and multiply by 1024. Missing, duplicate, negative, or malformed fields raise RESOURCE_STATUS_INVALID. RuntimeServices is the sole clock/resource/fault seam used by later synthetic tests.

- [ ] **Step 6: Run focused tests**

Run:

~~~bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research_runtime.py
~~~

Expected: all runtime tests pass.

- [ ] **Step 7: Commit runtime state**

~~~bash
git add training/stage7/mcagent_stage7/private_research_runtime.py training/stage7/tests/test_private_research_runtime.py
git commit -m "feat(stage7): add private run-state protocol"
~~~

## Task 2: Add strict two-slot recovery snapshots

**Files:**
- Create: training/stage7/mcagent_stage7/private_research_snapshots.py
- Create: training/stage7/tests/test_private_research_snapshots.py

**Interfaces:**
- Consumes: PrivateRunPaths, RuntimeServices, atomic_write_bytes(), atomic_write_json(), TinyMaskedVoxelAutoencoder, torch.optim.SGD, and the immutable binding dict.
- Produces: LoadedResumeSnapshot, SnapshotPointer, capture_rng_state(), restore_rng_state(), commit_resume_snapshot(), load_latest_resume_snapshot(), and restore_model_optimizer().

- [ ] **Step 1: Write failing round-trip, RNG, and rotation tests**

~~~python
from __future__ import annotations

import random
from pathlib import Path

import numpy as np
import pytest
import torch

from mcagent_stage7.private_research import PrivateResearchError
from mcagent_stage7.private_research_model import TinyMaskedVoxelAutoencoder
from mcagent_stage7.private_research_runtime import paths_for_run
from mcagent_stage7.private_research_runtime import (
    PrivateRunPaths,
    RuntimeServices,
)
from mcagent_stage7.private_research_snapshots import (
    commit_resume_snapshot,
    load_latest_resume_snapshot,
    restore_model_optimizer,
)


def binding() -> dict[str, object]:
    return {
        "run_id": "safe-run",
        "target_steps": 4,
        "seed": 7101,
        "batch_size": 1,
        "learning_rate": 0.001,
        "device": "cpu",
        "code_revision": "a" * 40,
        "training_code_sha256": "b" * 64,
        "prepared_manifest_sha256": "c" * 64,
        "split_sha256": "d" * 64,
        "dataset_hashes": {"v1": "1" * 64, "v2": "2" * 64, "v3": "3" * 64},
        "dataset_v3_gate": {
            "ready_for_m3_real_data": False,
            "training_eligible_count": 0,
        },
        "python_version": "3.12",
        "torch_version": torch.__version__,
        "numpy_version": np.__version__,
    }


def test_snapshot_round_trip_restores_model_optimizer_losses_and_rng(
    tmp_path: Path,
) -> None:
    paths = paths_for_run(tmp_path / "runs" / "safe-run")
    paths.runtime_path.mkdir(parents=True)
    model = TinyMaskedVoxelAutoencoder()
    optimizer = torch.optim.SGD(model.parameters(), lr=0.001)
    losses = torch.tensor([2.0, 1.0], dtype=torch.float64)
    reconstruction = torch.zeros((64, 64, 64), dtype=torch.uint8)
    pointer = commit_resume_snapshot(
        paths=paths,
        model=model,
        optimizer=optimizer,
        losses=losses,
        reconstruction=reconstruction,
        completed_steps=2,
        generation=0,
        binding=binding(),
        active_seconds=5.0,
    )
    expected_python = random.random()
    expected_numpy = float(np.random.random())
    expected_torch = float(torch.rand(()))
    loaded = load_latest_resume_snapshot(paths=paths, expected_binding=binding())
    restored_model = TinyMaskedVoxelAutoencoder()
    restored_optimizer = torch.optim.SGD(restored_model.parameters(), lr=0.001)
    restore_model_optimizer(loaded, restored_model, restored_optimizer)
    assert pointer.active_slot == "resume-a.pt"
    assert loaded.completed_steps == 2
    assert torch.equal(loaded.losses, losses)
    assert torch.equal(loaded.reconstruction, reconstruction)
    assert random.random() == expected_python
    assert float(np.random.random()) == expected_numpy
    assert float(torch.rand(())) == expected_torch


def test_slots_rotate_and_corrupt_active_falls_back_to_previous(
    tmp_path: Path,
) -> None:
    paths = paths_for_run(tmp_path / "runs" / "safe-run")
    paths.runtime_path.mkdir(parents=True)
    model = TinyMaskedVoxelAutoencoder()
    optimizer = torch.optim.SGD(model.parameters(), lr=0.001)
    commit_resume_snapshot(
        paths=paths, model=model, optimizer=optimizer,
        losses=torch.empty(0, dtype=torch.float64), reconstruction=None,
        completed_steps=0, generation=0, binding=binding(), active_seconds=0.0,
    )
    commit_resume_snapshot(
        paths=paths, model=model, optimizer=optimizer,
        losses=torch.tensor([1.0], dtype=torch.float64), reconstruction=torch.zeros((64, 64, 64), dtype=torch.uint8),
        completed_steps=1, generation=1, binding=binding(), active_seconds=1.0,
    )
    paths.resume_b_path.write_bytes(b"corrupt")
    loaded = load_latest_resume_snapshot(paths=paths, expected_binding=binding())
    assert loaded.generation == 0
    assert loaded.completed_steps == 0


def initialized_snapshot_fixture(
    tmp_path: Path,
) -> tuple[PrivateRunPaths, TinyMaskedVoxelAutoencoder, torch.optim.SGD]:
    paths = paths_for_run(tmp_path / "runs" / "safe-run")
    paths.runtime_path.mkdir(parents=True)
    model = TinyMaskedVoxelAutoencoder()
    optimizer = torch.optim.SGD(model.parameters(), lr=0.001)
    commit_resume_snapshot(
        paths=paths,
        model=model,
        optimizer=optimizer,
        losses=torch.empty(0, dtype=torch.float64),
        reconstruction=None,
        completed_steps=0,
        generation=0,
        binding=binding(),
        active_seconds=0.0,
    )
    return paths, model, optimizer
~~~

- [ ] **Step 2: Run the focused test and verify the module is absent**

Run:

~~~bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research_snapshots.py
~~~

Expected: collection fails with ModuleNotFoundError for mcagent_stage7.private_research_snapshots.

- [ ] **Step 3: Implement the exact safe payload and RNG encoding**

Use these exact dataclasses and payload keys:

~~~python
SNAPSHOT_SOURCE = "stage7-private-research-resume-v1"
SNAPSHOT_SCHEMA_VERSION = 1
POINTER_SCHEMA_VERSION = 1
SNAPSHOT_KEYS = {
    "source", "schema_version", "generation", "binding", "completed_steps",
    "active_seconds", "model_state", "optimizer_state", "losses",
    "reconstruction", "python_rng", "numpy_rng", "torch_rng",
}


@dataclass(frozen=True)
class SnapshotPointer:
    schema_version: int
    active_slot: str
    generation: int
    snapshot_sha256: str


@dataclass(frozen=True)
class LoadedResumeSnapshot:
    generation: int
    completed_steps: int
    active_seconds: float
    binding: dict[str, Any]
    model_state: OrderedDict[str, torch.Tensor]
    optimizer_state: dict[str, Any]
    losses: torch.Tensor
    reconstruction: torch.Tensor | None
    python_rng: dict[str, Any]
    numpy_rng: dict[str, Any]
    torch_rng: torch.Tensor
~~~

Encode Python random state as version, an int64 state tensor, has_gauss, and gaussian. Encode NumPy MT19937 state as bit_generator, a copied int64 keys tensor, position, has_gauss, and cached_gaussian. Store Torch CPU RNG as a cloned uint8 tensor. restore_rng_state() must restore all three only after model and optimizer construction and loading.

Validate exactly: source/schema, binding deep equality, generation >= 0, 0 <= completed_steps <= target_steps, loss tensor shape equals completed_steps and dtype float64 with all finite values, reconstruction is absent only at completed_steps zero and otherwise is contiguous uint8 shape (64,64,64), model keys/shapes/dtypes/finite values equal TinyMaskedVoxelAutoencoder.state_dict(), optimizer top-level keys are state and param_groups, one SGD group has exactly the ten installed PyTorch keys, its params list has exactly eleven unique integer parameter IDs, learning rate equals the binding, and every nested value is a primitive or finite tensor accepted by weights-only loading.

- [ ] **Step 4: Implement atomic rotation and strict fallback**

commit_resume_snapshot() must choose resume-a.pt for generation zero and the inactive fixed slot thereafter. Write filename + ".tmp", fsync, load it with torch.load(map_location="cpu", weights_only=True), run the full validator, hash the validated temporary file, os.replace it, fsync .runtime, then atomically replace resume-pointer.json. Invoke RuntimeServices.fault_hook() at these exact stages:

~~~python
SNAPSHOT_FAULT_STAGES = (
    "snapshot_after_temp_fsync",
    "snapshot_after_temp_validate",
    "snapshot_after_slot_replace",
    "snapshot_after_slot_dir_fsync",
    "snapshot_after_pointer_replace",
)
~~~

load_latest_resume_snapshot() must try a valid pointer-selected slot first. If the pointer is valid but its slot fails, try only the other fixed slot. If the pointer is unreadable, validate all existing fixed slots and select the unique highest valid generation. If no slot passes, raise RESUME_SNAPSHOT_INVALID. Never repair, delete, or rewrite a slot during load.

- [ ] **Step 5: Add interruption-matrix tests**

~~~python
@pytest.mark.parametrize(
    "stage",
    [
        "snapshot_after_temp_fsync",
        "snapshot_after_temp_validate",
        "snapshot_after_slot_replace",
        "snapshot_after_slot_dir_fsync",
        "snapshot_after_pointer_replace",
    ],
)
def test_interruption_at_each_atomic_stage_keeps_a_loadable_slot(
    tmp_path: Path,
    stage: str,
) -> None:
    paths, model, optimizer = initialized_snapshot_fixture(tmp_path)

    def fail(current: str) -> None:
        if current == stage:
            raise RuntimeError(stage)

    with pytest.raises(RuntimeError, match=stage):
        commit_resume_snapshot(
            paths=paths, model=model, optimizer=optimizer,
            losses=torch.tensor([1.0], dtype=torch.float64), reconstruction=torch.zeros((64, 64, 64), dtype=torch.uint8),
            completed_steps=1, generation=1, binding=binding(), active_seconds=1.0,
            services=RuntimeServices(fault_hook=fail),
        )
    loaded = load_latest_resume_snapshot(paths=paths, expected_binding=binding())
    assert loaded.generation in {0, 1}
~~~

Also add tests for changed binding, non-finite loss, invalid reconstruction, optimizer parameter-count drift, both slots corrupt, pointer hash mismatch, unreadable pointer with one valid slot, and weights-only load rejection.

- [ ] **Step 6: Run focused tests**

Run:

~~~bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research_runtime.py tests/test_private_research_snapshots.py
~~~

Expected: all runtime and snapshot tests pass.

- [ ] **Step 7: Commit snapshots**

~~~bash
git add training/stage7/mcagent_stage7/private_research_snapshots.py training/stage7/tests/test_private_research_snapshots.py
git commit -m "feat(stage7): add rotating private resume snapshots"
~~~

## Task 3: Version the final checkpoint and manifest contract

**Files:**
- Modify: training/stage7/mcagent_stage7/private_research_checkpoints.py
- Modify: training/stage7/tests/test_private_research_checkpoints.py

**Interfaces:**
- Consumes: the existing v1 save/load path, v2 binding, completed step count, and declared artifact inventory.
- Produces: PRIVATE_CHECKPOINT_SOURCE_V2, save_private_checkpoint_v2(), and load_private_checkpoint() branching strictly between schema 1 and schema 2.

- [ ] **Step 1: Add failing v1 compatibility and v2 manifest tests**

Extend the existing test imports with:

~~~python
import numpy as np

from mcagent_stage7.private_research_checkpoints import (
    save_private_checkpoint_v2,
)
~~~

~~~python
def test_v1_checkpoint_contract_remains_unchanged(tmp_path: Path) -> None:
    checkpoint, manifest_path, preflight = make_checkpoint(tmp_path)
    manifest = json.loads(manifest_path.read_text("utf8"))
    assert manifest["source"] == "stage7-private-research-checkpoint-v1"
    assert manifest["schema_version"] == 1
    assert load_private_checkpoint(
        checkpoint_path=checkpoint,
        manifest_path=manifest_path,
        preflight=preflight,
        device="cpu",
    ).manifest == manifest


def test_v2_checkpoint_declares_exact_artifact_inventory(tmp_path: Path) -> None:
    checkpoint = tmp_path / "checkpoint.pt"
    manifest_path = tmp_path / "checkpoint_manifest.json"
    inventory = [
        ".runtime/private-progress.json",
        ".runtime/progress.json",
        ".runtime/resume-a.pt",
        ".runtime/resume-b.pt",
        ".runtime/resume-pointer.json",
        ".runtime/run-state.json",
        ".runtime/run.lock",
        "checkpoint.pt",
        "checkpoint_manifest.json",
        "metrics.jsonl",
        "reconstruction.bin",
    ]
    manifest = save_private_checkpoint_v2(
        model=TinyMaskedVoxelAutoencoder(),
        checkpoint_path=checkpoint,
        manifest_path=manifest_path,
        binding=make_v2_binding(),
        completed_steps=4,
        artifact_inventory=inventory,
        metrics_sha256=hashlib.sha256(b"metrics").hexdigest(),
        reconstruction_sha256=hashlib.sha256(b"reconstruction").hexdigest(),
    )
    assert manifest["source"] == "stage7-private-research-checkpoint-v2"
    assert manifest["schema_version"] == 2
    assert manifest["completed_steps"] == 4
    assert manifest["artifact_inventory"] == inventory


def make_v2_binding() -> dict[str, object]:
    return {
        "run_id": "safe-run",
        "target_steps": 4,
        "seed": 7101,
        "batch_size": 1,
        "learning_rate": 0.001,
        "device": "cpu",
        "code_revision": "a" * 40,
        "training_code_sha256": "b" * 64,
        "prepared_manifest_sha256": hashlib.sha256(b"prepared").hexdigest(),
        "split_sha256": hashlib.sha256(b"split").hexdigest(),
        "dataset_hashes": {"v1": "1" * 64, "v2": "2" * 64, "v3": "3" * 64},
        "dataset_v3_gate": {
            "ready_for_m3_real_data": False,
            "training_eligible_count": 0,
        },
        "python_version": "3.12",
        "torch_version": str(torch.__version__),
        "numpy_version": np.__version__,
    }
~~~

- [ ] **Step 2: Run the focused checkpoint test and verify the new function is absent**

Run:

~~~bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research_checkpoints.py
~~~

Expected: collection fails because save_private_checkpoint_v2 is missing.

- [ ] **Step 3: Implement v2 save and strict load branching**

Keep save_private_checkpoint() and the v1 required-field set byte-for-byte compatible. Add:

~~~python
PRIVATE_CHECKPOINT_SOURCE_V2 = "stage7-private-research-checkpoint-v2"


def save_private_checkpoint_v2(
    *,
    model: nn.Module,
    checkpoint_path: Path,
    manifest_path: Path,
    binding: dict[str, Any],
    completed_steps: int,
    artifact_inventory: list[str],
    metrics_sha256: str,
    reconstruction_sha256: str,
) -> dict[str, Any]:
    if completed_steps != binding.get("target_steps"):
        raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", "completed_steps")
    if artifact_inventory != sorted(set(artifact_inventory)):
        raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", "artifact_inventory")
    state_dict = _ordered_cpu_state_dict(model)
    _atomic_torch_save(state_dict, checkpoint_path)
    checkpoint_sha256 = _sha256_file(checkpoint_path)
    manifest = {
        "source": PRIVATE_CHECKPOINT_SOURCE_V2,
        "schema_version": 2,
        "run_schema_version": 2,
        "training_scope": "private-research-only",
        "distribution": "prohibited",
        "private_research_only": True,
        "input_manifest_sha256": binding["prepared_manifest_sha256"],
        "prepared_taxonomy_version": PRIVATE_TAXONOMY_VERSION,
        "split_sha256": binding["split_sha256"],
        "seed": binding["seed"],
        "device": binding["device"],
        "code_revision": binding["code_revision"],
        "training_code_sha256": binding["training_code_sha256"],
        "config": {
            "steps": binding["target_steps"],
            "batch_size": binding["batch_size"],
            "learning_rate": binding["learning_rate"],
        },
        "completed_steps": completed_steps,
        "artifact_inventory": artifact_inventory,
        "checkpoint_file": checkpoint_path.name,
        "checkpoint_sha256": checkpoint_sha256,
        "metrics_file": "metrics.jsonl",
        "metrics_sha256": metrics_sha256,
        "reconstruction_file": "reconstruction.bin",
        "reconstruction_sha256": reconstruction_sha256,
    }
    _atomic_manifest_write(manifest, manifest_path)
    return manifest
~~~

_atomic_torch_save() and _atomic_manifest_write() must use the final path's fixed .tmp sibling, fsync the temporary file, validate the temporary checkpoint/JSON, os.replace the final path, and fsync the parent directory. The manifest always records the final checkpoint_path.name, never a temporary name. The production finalizer passes final checkpoint.pt and checkpoint_manifest.json paths directly.

load_private_checkpoint() must read source/schema first, call the unchanged v1 validator for v1, and call a new exact v2 validator for v2. Reject mixed source/schema pairs. V2 must validate every field above, complete-step equality, exact preflight prepared/split bindings, sorted safe relative inventory, three SHA-256 strings, model state keys/shapes/dtypes/finiteness, and CPU-only evaluation. It must not require or mutate .runtime files; evaluator orchestration owns that check.

- [ ] **Step 4: Run checkpoint tests**

Run:

~~~bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research_checkpoints.py
~~~

Expected: all existing v1 and new v2 tests pass.

- [ ] **Step 5: Commit the versioned final contract**

~~~bash
git add training/stage7/mcagent_stage7/private_research_checkpoints.py training/stage7/tests/test_private_research_checkpoints.py
git commit -m "feat(stage7): version private final checkpoints"
~~~

## Task 4: Implement fresh, interruptible, deterministic training and resume

**Files:**
- Create: training/stage7/mcagent_stage7/private_research_training.py
- Modify: training/stage7/mcagent_stage7/train_private_research.py
- Modify: training/stage7/tests/test_train_private_research.py
- Create: training/stage7/tests/private_research_test_support.py
- Create: training/stage7/tests/test_private_research_training_v2.py

**Interfaces:**
- Consumes: run_private_preflight(), PrivatePreparedDataset, TinyMaskedVoxelAutoencoder, runtime state/control, resume snapshots, v2 final checkpoint save, and RuntimeServices.
- Produces: PrivateTrainConfig, PrivateResumeConfig, PrivateTrainingResult, start_private_training(), resume_private_training(), install_pause_signal_handlers(), and the compatibility function train_private_research().

- [ ] **Step 1: Write failing fresh-run and exact-artifact tests**

First create training/stage7/tests/private_research_test_support.py with these exact helpers. The volume and source bytes are generated synthetic fixtures only:

~~~python
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

from mcagent_stage7.private_research_runtime import (
    MIN_AVAILABLE_BYTES,
    ResourceSample,
    RuntimeServices,
)
from mcagent_stage7.private_research_training import PrivateTrainConfig


REPO_ROOT = Path(__file__).resolve().parents[3]


def make_ready_private_root(
    name: str,
    *,
    case_count: int = 2,
    validation_count: int = 0,
) -> Path:
    root = REPO_ROOT / ".tmp" / ("stage7-private-v2-" + name)
    shutil.rmtree(root, ignore_errors=True)
    for directory in ("source", "manifests", "prepared", "splits", "runs"):
        (root / directory).mkdir(parents=True, exist_ok=True)
    (root / "PRIVATE_RESEARCH_ACK.json").write_text(
        json.dumps({
            "scope": "stage7-private-research-only",
            "distribution_prohibited": True,
            "dataset_v3_unchanged": True,
            "m4_apply_mode_unchanged": True,
            "acknowledged_at": "2026-07-16T00:00:00.000Z",
            "acknowledged_by": "synthetic-test-owner",
        }),
        encoding="utf8",
    )
    source_records: list[dict[str, object]] = []
    prepared_records: list[dict[str, object]] = []
    case_ids = [f"synthetic-v2-{index:02d}" for index in range(case_count)]
    for index, case_id in enumerate(case_ids):
        source_bytes = ("synthetic-v2-source-" + str(index)).encode("ascii")
        source_sha = hashlib.sha256(source_bytes).hexdigest()
        source_path = root / "source" / ("case-" + str(index) + ".schematic")
        source_path.write_bytes(source_bytes)
        voxels = bytes([(index % 8) + 1]) * (64**3)
        voxel_path = root / "prepared" / (case_id + ".voxels.bin")
        voxel_path.write_bytes(voxels)
        record = {
            "source_id": case_id,
            "source_sha256": source_sha,
            "taxonomy_version": "private-raw-material-family-v1",
            "shape": [64, 64, 64],
            "voxel_path": "prepared/" + case_id + ".voxels.bin",
            "metadata_path": "prepared/" + case_id + ".json",
            "voxel_sha256": hashlib.sha256(voxels).hexdigest(),
            "rights_state": "unverified",
            "distribution": "prohibited",
            "purpose": "local-private-research-only",
        }
        (root / "prepared" / (case_id + ".json")).write_text(
            json.dumps(record),
            encoding="utf8",
        )
        prepared_records.append(record)
        source_records.append({
            "source_id": case_id,
            "source_path": "source/case-" + str(index) + ".schematic",
            "content_sha256": source_sha,
            "rights_state": "unverified",
            "distribution": "prohibited",
            "purpose": "local-private-research-only",
        })
    (root / "manifests" / "sources.jsonl").write_text(
        "".join(json.dumps(record) + "\n" for record in source_records),
        encoding="utf8",
    )
    (root / "manifests" / "prepared.jsonl").write_text(
        "".join(json.dumps(record) + "\n" for record in prepared_records),
        encoding="utf8",
    )
    split_at = case_count - validation_count
    (root / "splits" / "split.json").write_text(
        json.dumps({
            "case_ids": case_ids,
            "train_case_ids": case_ids[:split_at],
            "validation_case_ids": case_ids[split_at:],
        }),
        encoding="utf8",
    )
    return root


def make_config(root: Path, run_id: str, *, steps: int) -> PrivateTrainConfig:
    return PrivateTrainConfig(
        root=root,
        repo_root=REPO_ROOT,
        seed=7101,
        steps=steps,
        batch_size=1,
        learning_rate=0.001,
        device="cpu",
        run_id=run_id,
        code_revision="a" * 40,
    )


def lightweight_services(**overrides: Any) -> RuntimeServices:
    values: dict[str, Any] = {
        "monotonic": lambda: 0.0,
        "wall_time": lambda: 1000.0,
        "sleep": lambda seconds: None,
        "resources": lambda: ResourceSample(
            rss_bytes=100 * 1024**2,
            swap_bytes=0,
            available_bytes=MIN_AVAILABLE_BYTES,
        ),
        "fault_hook": lambda stage: None,
        "after_step": lambda paths, step: None,
    }
    values.update(overrides)
    return RuntimeServices(**values)


def bypass_repository_identity(monkeypatch: Any) -> None:
    import mcagent_stage7.private_research_training as module

    monkeypatch.setattr(
        module,
        "require_repository_identity",
        lambda repo_root, code_revision: code_revision,
    )
    monkeypatch.setattr(
        module,
        "compute_training_code_sha256",
        lambda repo_root: "b" * 64,
    )
~~~

In test_private_research_training_v2.py import the shared helpers and production interfaces explicitly:

~~~python
from pathlib import Path

import pytest

from mcagent_stage7.private_research import PrivateResearchError
from mcagent_stage7.private_research_runtime import (
    MIN_AVAILABLE_BYTES,
    RSS_PAUSE_BYTES,
    PrivateRunPaths,
    ResourceSample,
    paths_for_run,
    read_run_state,
    request_pause,
)
from mcagent_stage7.private_research_training import (
    PrivateResumeConfig,
    start_private_training,
    resume_private_training,
)
from private_research_test_support import (
    REPO_ROOT,
    bypass_repository_identity,
    lightweight_services,
    make_config,
    make_ready_private_root,
)
~~~

~~~python
def test_fresh_v2_run_completes_with_runtime_and_final_artifacts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = make_ready_private_root("complete")
    bypass_repository_identity(monkeypatch)
    result = start_private_training(
        PrivateTrainConfig(
            root=root,
            repo_root=REPO_ROOT,
            seed=7101,
            steps=3,
            batch_size=1,
            learning_rate=0.001,
            device="cpu",
            run_id="complete",
            code_revision="a" * 40,
        ),
        services=lightweight_services(),
    )
    run = root / "runs" / "complete"
    assert result.status == "completed"
    assert result.completed_steps == 3
    assert {entry.name for entry in run.iterdir()} == {
        ".runtime",
        "metrics.jsonl",
        "reconstruction.bin",
        "checkpoint.pt",
        "checkpoint_manifest.json",
    }
    state = read_run_state(paths_for_run(run))
    assert state.status == "completed"
    assert state.snapshot_steps == 3
    assert len((run / "metrics.jsonl").read_text("utf8").splitlines()) == 3


def test_fresh_run_refuses_less_than_eight_gib_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = make_ready_private_root("low-memory")
    bypass_repository_identity(monkeypatch)
    services = lightweight_services(
        resources=lambda: ResourceSample(
            rss_bytes=100 * 1024**2,
            swap_bytes=0,
            available_bytes=MIN_AVAILABLE_BYTES - 1,
        )
    )
    with pytest.raises(PrivateResearchError, match="AVAILABLE_MEMORY_LOW"):
        start_private_training(make_config(root, "low-memory", steps=1), services=services)
    assert not (root / "runs" / "low-memory").exists()
~~~

- [ ] **Step 2: Run the v2 training test and verify the module is absent**

Run:

~~~bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research_training_v2.py
~~~

Expected: collection fails with ModuleNotFoundError for mcagent_stage7.private_research_training.

- [ ] **Step 3: Implement configurations, immutable binding, and fresh initialization**

~~~python
CHECKPOINT_INTERVAL_SECONDS = 300.0


@dataclass(frozen=True)
class PrivateTrainConfig:
    root: Path
    repo_root: Path
    seed: int = 7101
    steps: int = 1
    batch_size: int = 1
    learning_rate: float = 1e-3
    device: str = "cpu"
    run_id: str = "private-run"
    code_revision: str = ""


@dataclass(frozen=True)
class PrivateResumeConfig:
    root: Path
    repo_root: Path
    run_id: str


@dataclass(frozen=True)
class PrivateTrainingResult:
    run_path: Path
    status: str
    completed_steps: int
    target_steps: int
    manifest: dict[str, Any] | None


class PauseSignal(Protocol):
    def consume(self) -> str | None:
        raise NotImplementedError


class NoPauseSignal:
    def consume(self) -> str | None:
        return None
~~~

Validate fresh configuration exactly as before, plus require CPU, seed 7101, batch size 1, learning rate 0.001, and a 40-character lowercase code revision. Before creating a run directory, run full private preflight, require clean exact repository identity, compute the fixed training-code digest, and require ResourceSample.available_bytes >= MIN_AVAILABLE_BYTES and swap_bytes == 0.

The binding dict must contain exactly:

~~~python
{
    "run_id": config.run_id,
    "target_steps": config.steps,
    "seed": config.seed,
    "batch_size": config.batch_size,
    "learning_rate": float(config.learning_rate),
    "device": config.device,
    "code_revision": config.code_revision,
    "training_code_sha256": compute_training_code_sha256(config.repo_root),
    "prepared_manifest_sha256": preflight.prepared_manifest_sha256,
    "split_sha256": preflight.split_sha256,
    "dataset_hashes": preflight.dataset_hashes,
    "dataset_v3_gate": preflight.dataset_v3_gate,
    "python_version": platform.python_version(),
    "torch_version": str(torch.__version__),
    "numpy_version": np.__version__,
}
~~~

After all pre-creation checks pass: create run_path with no parents, create .runtime, acquire run.lock, write initializing state, seed Python/NumPy/Torch, build the train dataset/model/SGD optimizer, allocate torch.empty(config.steps, dtype=torch.float64), commit generation-zero resume-a.pt with no reconstruction, transition to running, and enter the shared loop.

- [ ] **Step 4: Implement the step loop, periodic snapshot, progress, and pause ordering**

start_private_training() and resume_private_training() accept pause_signal: PauseSignal = NoPauseSignal(). The shared loop must use this order for every logical step:

~~~python
for step_index in range(completed_steps, target_steps):
    batch = [
        dataset[(step_index * batch_size + offset) % len(dataset)]
        for offset in range(batch_size)
    ]
    targets = torch.stack([item[0] for item in batch]).to(device)
    visible = torch.stack([item[1] for item in batch]).to(device)
    mask = torch.stack([item[2] for item in batch]).to(device)
    optimizer.zero_grad(set_to_none=True)
    logits = model(visible)
    loss = masked_reconstruction_loss(logits, targets, mask)
    loss.backward()
    _require_finite_gradients(model)
    optimizer.step()
    loss_value = _finite_scalar(loss)
    losses[step_index] = loss_value
    reconstruction = (
        logits.detach().argmax(dim=1)[0]
        .to("cpu", dtype=torch.uint8).contiguous()
    )
    completed_steps = step_index + 1
    services.after_step(paths, completed_steps)
    resources = services.resources()
    pause_reason = _poll_pause_reason(paths, resources, signal_token)
    snapshot_due = services.monotonic() - last_snapshot_time >= 300.0
    target_reached = completed_steps == target_steps
    if snapshot_due or pause_reason is not None or target_reached:
        pointer = commit_resume_snapshot(
            paths=paths, model=model, optimizer=optimizer,
            losses=losses[:completed_steps].clone(),
            reconstruction=reconstruction,
            completed_steps=completed_steps,
            generation=pointer.generation + 1,
            binding=binding,
            active_seconds=active_seconds,
            services=services,
        )
        last_snapshot_time = services.monotonic()
    _publish_if_due()
    if target_reached:
        return _finalize_exact_target()
    if pause_reason is not None:
        return _finish_pause(pause_reason)
~~~

Resource order is exact: swap_bytes > 0 requests swap_detected; otherwise rss_bytes >= RSS_PAUSE_BYTES requests memory_limit; otherwise a signal token requests signal; otherwise an unacknowledged pause-request.json requests its recorded owner reason. Target completion takes precedence after the terminal snapshot.

Public/private progress may be written at most once per second and once on every state transition. Public progress contains state, steps, percentage, active seconds, recent throughput, ETA, and snapshot age. Private progress contains only current and rolling-100 finite loss. run-state completed_steps may reflect the last one-second publication; snapshot_steps always reflects the durable slot and is authoritative for resume.

Track active time as snapshot_active_seconds plus max(0.0, services.monotonic() - session_started_monotonic). Never add inactive time to throughput or ETA. For signal, memory_limit, or swap_detected, create an internal pause request through request_pause() before acknowledgement. _finish_pause() must transition running to pause_requested, ensure the current completed step is in the validated snapshot, acknowledge that exact request ID, transition pause_requested to paused with paused_at_epoch_seconds=services.wall_time(), publish paused progress, and return only after the run-lock context exits.

- [ ] **Step 5: Write failing pause/resume equivalence and memory tests**

~~~python
def test_pause_then_resume_matches_uninterrupted_outputs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = make_ready_private_root("equivalence")
    bypass_repository_identity(monkeypatch)
    uninterrupted = start_private_training(
        make_config(root, "uninterrupted", steps=4),
        services=lightweight_services(),
    )

    def request_after_two(paths: PrivateRunPaths, step: int) -> None:
        if step == 2:
            request_pause(paths, reason="owner")

    paused = start_private_training(
        make_config(root, "resumed", steps=4),
        services=lightweight_services(after_step=request_after_two),
    )
    assert paused.status == "paused"
    assert paused.completed_steps == 2
    resumed = resume_private_training(
        PrivateResumeConfig(root=root, repo_root=REPO_ROOT, run_id="resumed"),
        services=lightweight_services(),
    )
    assert resumed.status == "completed"
    for name in ("checkpoint.pt", "metrics.jsonl", "reconstruction.bin"):
        assert (root / "runs" / "uninterrupted" / name).read_bytes() == (
            root / "runs" / "resumed" / name
        ).read_bytes()


def test_rss_limit_pauses_after_current_step_with_valid_snapshot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = make_ready_private_root("rss")
    bypass_repository_identity(monkeypatch)
    samples = iter(
        [
            ResourceSample(100, 0, MIN_AVAILABLE_BYTES),
            ResourceSample(RSS_PAUSE_BYTES, 0, MIN_AVAILABLE_BYTES),
        ]
    )
    result = start_private_training(
        make_config(root, "rss", steps=4),
        services=lightweight_services(resources=lambda: next(samples)),
    )
    assert result.status == "paused"
    assert result.completed_steps == 1
    state = read_run_state(paths_for_run(result.run_path))
    assert state.pause_reason == "memory_limit"
    assert state.snapshot_steps == 1
~~~

- [ ] **Step 6: Implement exact resume**

resume_private_training() must run full private preflight before opening snapshots; resolve the existing non-symlink run; read and validate schema-two state; reject completed state; require current repository HEAD/clean status, code digest, Python/Torch/NumPy versions, prepared/split/Dataset/gate values, and every immutable binding field to match; acquire run.lock; load the latest strict snapshot; map stale initializing, running, or pause_requested state to interrupted only after a valid snapshot is available; calculate lost_steps_on_last_resume as max(0, state.completed_steps - snapshot.completed_steps); accept a snapshot generation one greater than run-state when interruption occurred after pointer commit but before state publication; construct model and SGD optimizer; load model/optimizer; allocate the target-sized float64 loss tensor; copy the snapshot prefix; restore RNG after construction/loading; restore reconstruction and active seconds. If the prior state was paused, add max(0.0, services.wall_time() - paused_at_epoch_seconds) to paused_seconds. Clear paused_at_epoch_seconds, transition to running, then call the same shared loop with the original target and no override.

If snapshot.completed_steps equals target_steps, skip optimization and run idempotent finalization from the terminal snapshot. Resume accepts only root, repo_root, and run_id.

- [ ] **Step 7: Implement idempotent exact-target finalization**

Finalization must re-run repository identity and full private preflight. Atomically write canonical one-row-per-step metrics from the finite loss tensor, reconstruction bytes of size 64**3, checkpoint.pt, and checkpoint_manifest.json. For every already-present final file after an interrupted finalization, compute the intended bytes or hash and preserve an exact match; raise FINAL_ARTIFACT_CONFLICT on a mismatch.

Build the sorted artifact inventory from regular non-symlink files. It must contain run.lock, run-state.json, progress.json, private-progress.json, resume-a.pt, resume-b.pt, resume-pointer.json, optional pause-request.json, and the four final root files. Write checkpoint_manifest.json last, validate it through load_private_checkpoint(), transition run-state to completed, publish completed progress, re-run private preflight, and return a completed result. No evaluation occurs here.

Expose train_private_research(config, services=None) as a compatibility alias for start_private_training(). Update existing trainer tests to expect PrivateTrainingResult and to keep synthetic private roots below .tmp/.

In test_train_private_research.py, change the smoke configuration to batch_size=1 and code_revision="a" * 40, call bypass_repository_identity(monkeypatch), and assert:

~~~python
assert result.status == "completed"
assert result.completed_steps == 1
assert result.manifest is not None
assert result.manifest["training_scope"] == "private-research-only"
assert result.manifest["distribution"] == "prohibited"
assert (result.run_path / "reconstruction.bin").stat().st_size == 64**3
assert (result.run_path / ".runtime" / "run-state.json").is_file()
~~~

Replace CLI fakes based on PrivateRunArtifacts with:

~~~python
fake = module.PrivateTrainingResult(
    run_path=Path(".tmp/private/runs/safe"),
    status="completed",
    completed_steps=1,
    target_steps=1,
    manifest={
        "training_scope": "private-research-only",
        "distribution": "prohibited",
    },
)
~~~

Every CLI test supplies --metadata-only and --code-revision followed by 40 lowercase a characters. Keep the private-error-detail assertion unchanged.

- [ ] **Step 8: Add finalization interruption tests**

Inject failures after metrics replace, reconstruction replace, checkpoint replace, manifest replace, and completed-state replace. For each stage, resume the same run and assert exact target completion without an extra metric row or optimizer step. Add a conflicting-partial-file test that raises FINAL_ARTIFACT_CONFLICT and leaves the file untouched.

- [ ] **Step 9: Run focused training tests**

Run:

~~~bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_train_private_research.py tests/test_private_research_runtime.py tests/test_private_research_snapshots.py tests/test_private_research_training_v2.py
~~~

Expected: all focused training/runtime/snapshot tests pass, including byte-identical uninterrupted and resumed final outputs.

- [ ] **Step 10: Commit the interruptible engine**

~~~bash
git add training/stage7/mcagent_stage7/private_research_training.py training/stage7/mcagent_stage7/train_private_research.py training/stage7/tests/private_research_test_support.py training/stage7/tests/test_train_private_research.py training/stage7/tests/test_private_research_training_v2.py
git commit -m "feat(stage7): make private training interruptible"
~~~

## Task 5: Add metadata-safe train, pause, resume, and signal CLIs

**Files:**
- Modify: training/stage7/mcagent_stage7/private_research_training.py
- Modify: training/stage7/mcagent_stage7/train_private_research.py
- Create: training/stage7/mcagent_stage7/pause_private_research.py
- Create: training/stage7/mcagent_stage7/resume_private_research.py
- Create: training/stage7/tests/test_private_research_control_cli.py

**Interfaces:**
- Consumes: start_private_training(), resume_private_training(), request_pause(), read_run_state(), hold_run_lock state, RuntimeServices.sleep(), and signal.signal().
- Produces: train main(), pause_private_research(), pause main(), resume main(), and cooperative_signal_handlers().

- [ ] **Step 1: Write failing CLI acknowledgement, timeout, and scrub tests**

Create the test module with these imports before the test bodies:

~~~python
from pathlib import Path
from types import SimpleNamespace

import pytest

import mcagent_stage7.pause_private_research as pause_module
import mcagent_stage7.resume_private_research as resume_module
import mcagent_stage7.train_private_research as train_module
from mcagent_stage7.private_research_runtime import PrivateRunState


REPO_ROOT = Path(__file__).resolve().parents[3]
~~~

~~~python
def test_train_cli_requires_metadata_only() -> None:
    with pytest.raises(SystemExit):
        train_module.main([
            "--root", ".tmp/private", "--run-id", "safe",
            "--private-research-only", "--steps", "1", "--device", "cpu",
            "--code-revision", "a" * 40,
        ])


def test_pause_waits_for_matching_acknowledgement(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    fake_root = Path(".tmp/private").resolve()
    monkeypatch.setattr(
        pause_module,
        "run_private_preflight",
        lambda root, repo_root: SimpleNamespace(root=fake_root),
    )
    monkeypatch.setattr(
        pause_module,
        "resolve_existing_private_run",
        lambda root, repo_root, run_id: fake_root / "runs" / run_id,
    )
    states = iter([
        make_state(status="running", request=1, acknowledged=0),
        make_state(status="paused", request=1, acknowledged=1),
    ])
    monkeypatch.setattr(pause_module, "request_pause", lambda paths, reason: 1)
    monkeypatch.setattr(pause_module, "read_run_state", lambda paths: next(states))
    monkeypatch.setattr(pause_module, "_run_lock_is_free", lambda paths: True)
    assert pause_module.main(safe_pause_args()) == 0
    assert capsys.readouterr().out.splitlines() == [
        "training_scope: private-research-only",
        "distribution: prohibited",
        "pause_confirmed: true",
        "run_state: paused",
    ]


def test_pause_timeout_never_claims_safe_snapshot(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    fake_root = Path(".tmp/private").resolve()
    monkeypatch.setattr(
        pause_module,
        "run_private_preflight",
        lambda root, repo_root: SimpleNamespace(root=fake_root),
    )
    monkeypatch.setattr(
        pause_module,
        "resolve_existing_private_run",
        lambda root, repo_root, run_id: fake_root / "runs" / run_id,
    )
    monkeypatch.setattr(pause_module, "request_pause", lambda paths, reason: 1)
    monkeypatch.setattr(
        pause_module,
        "read_run_state",
        lambda paths: make_state(status="running", request=1, acknowledged=0),
    )
    with pytest.raises(SystemExit):
        pause_module.main(safe_pause_args(timeout="0"))
    output = capsys.readouterr()
    assert "pause_confirmed: true" not in output.out
    assert "PAUSE_TIMEOUT" in output.err


def test_resume_cli_has_no_step_device_or_learning_rate_options() -> None:
    options = {action.dest for action in resume_module._parser()._actions}
    assert "steps" not in options
    assert "device" not in options
    assert "batch_size" not in options
    assert "learning_rate" not in options


def make_state(
    *,
    status: str,
    request: int,
    acknowledged: int,
) -> PrivateRunState:
    return PrivateRunState(
        schema_version=2,
        status=status,
        run_id="safe",
        binding={"target_steps": 10, "device": "cpu"},
        completed_steps=2,
        snapshot_steps=2,
        target_steps=10,
        snapshot_generation=1,
        pause_request_id=request,
        pause_acknowledged_id=acknowledged,
        active_seconds=1.0,
        paused_seconds=0.0,
        paused_at_epoch_seconds=1000.0 if status == "paused" else None,
        pause_reason="owner" if request else None,
        lost_steps_on_last_resume=0,
    )


def safe_pause_args(*, timeout: str = "120") -> list[str]:
    return [
        "--root", ".tmp/private",
        "--run-id", "safe",
        "--private-research-only",
        "--metadata-only",
        "--timeout-seconds", timeout,
    ]
~~~

- [ ] **Step 2: Run the focused test and verify pause/resume modules are absent**

Run:

~~~bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research_control_cli.py
~~~

Expected: collection fails because pause_private_research and resume_private_research are absent.

- [ ] **Step 3: Implement exact metadata-only CLIs**

Fresh train CLI must require --private-research-only and --metadata-only, make --code-revision required, and print only:

~~~text
training_scope: private-research-only
distribution: prohibited
run_state: paused|completed
completed_steps: INTEGER
target_steps: INTEGER
run_complete: true|false
~~~

It must never print final_loss. In metadata-only error mode, print only PrivateResearchError.code through argparse.error().

Pause CLI arguments are root, run-id, private-research-only, metadata-only, repo-root, and timeout-seconds defaulting to 120. It performs preflight and existing-run resolution, rejects completed/initializing, calls request_pause(reason="owner"), then polls state at 0.25-second intervals. Success requires matching acknowledgement, state paused, and a nonblocking run-lock acquisition proving the trainer released the lock. Timeout raises PAUSE_TIMEOUT and never kills a process.

Resume CLI arguments are root, run-id, private-research-only, metadata-only, and repo-root only. It calls resume_private_training() and prints the same six metadata lines as train.

- [ ] **Step 4: Implement cooperative signals**

Add SignalPauseToken and cooperative_signal_handlers() to private_research_training.py so both train and resume CLIs import one implementation. SignalPauseToken has request(reason), consume(), and thread-safe Event storage. cooperative_signal_handlers(token) must temporarily install handlers for SIGINT and SIGTERM that only call token.request("signal"), restore the prior handlers in finally, and never perform file or Torch I/O inside a signal handler. Train and resume CLIs pass the token into the training engine. Repeated signals keep the same pending reason; SIGKILL remains unhandled.

Add tests that invoke the captured handler, assert no SystemExit, and assert the next step boundary returns paused with a validated snapshot.

- [ ] **Step 5: Run control and trainer tests**

Run:

~~~bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research_control_cli.py tests/test_train_private_research.py tests/test_private_research_training_v2.py
~~~

Expected: all control and trainer tests pass; captured stdout contains no loss.

- [ ] **Step 6: Commit control CLIs**

~~~bash
git add training/stage7/mcagent_stage7/private_research_training.py training/stage7/mcagent_stage7/train_private_research.py training/stage7/mcagent_stage7/pause_private_research.py training/stage7/mcagent_stage7/resume_private_research.py training/stage7/tests/test_private_research_control_cli.py
git commit -m "feat(stage7): add private pause and resume commands"
~~~

## Task 6: Add the local read-only progress and loss monitor

**Files:**
- Create: training/stage7/mcagent_stage7/monitor_private_research.py
- Create: training/stage7/tests/test_monitor_private_research.py

**Interfaces:**
- Consumes: full private preflight, existing-run resolution, read_public_progress(), optional read_private_progress(), sys.stdout.isatty(), and a one-second follow loop.
- Produces: render_progress(), monitor_private_research(), and monitor main().

- [ ] **Step 1: Write failing rendering and disclosure tests**

Create the test module with:

~~~python
from pathlib import Path
from types import SimpleNamespace

import pytest

import mcagent_stage7.monitor_private_research as module
from mcagent_stage7.monitor_private_research import MonitorConfig, render_progress


REPO_ROOT = Path(__file__).resolve().parents[3]
~~~

~~~python
def public_progress() -> dict[str, object]:
    return {
        "schema_version": 1,
        "state": "running",
        "completed_steps": 50,
        "target_steps": 100,
        "percent": 50.0,
        "active_seconds": 10.0,
        "recent_steps_per_second": 5.0,
        "eta_seconds": 10.0,
        "snapshot_age_seconds": 2.0,
    }


def test_default_render_has_progress_but_no_loss() -> None:
    output = render_progress(public_progress(), private_progress=None, width=20)
    assert "[##########----------]" in output
    assert "50/100" in output
    assert "loss" not in output.lower()


def test_opt_in_render_shows_current_and_rolling_loss() -> None:
    output = render_progress(
        public_progress(),
        private_progress={
            "schema_version": 1,
            "current_loss": 1.25,
            "rolling_100_loss": 1.5,
        },
        width=20,
    )
    assert "loss 1.250000" in output
    assert "avg100 1.500000" in output


def test_default_monitor_never_reads_private_progress(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_root = Path(".tmp/private").resolve()
    monkeypatch.setattr(
        module,
        "run_private_preflight",
        lambda root, repo_root: SimpleNamespace(root=fake_root),
    )
    monkeypatch.setattr(
        module,
        "resolve_existing_private_run",
        lambda root, repo_root, run_id: fake_root / "runs" / run_id,
    )
    monkeypatch.setattr(module, "read_public_progress", lambda paths: public_progress())
    monkeypatch.setattr(
        module,
        "read_private_progress",
        lambda paths: pytest.fail("private loss file was opened"),
    )
    assert module.monitor_private_research(fake_config(show_private_loss=False, once=True)) == 0


def test_loss_mode_refuses_non_tty(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(module.sys.stdout, "isatty", lambda: False)
    with pytest.raises(SystemExit):
        module.main(safe_monitor_args(show_loss=True))
    assert "PRIVATE_LOSS_REQUIRES_TTY" in capsys.readouterr().err


def fake_config(
    *,
    show_private_loss: bool,
    once: bool,
) -> MonitorConfig:
    return MonitorConfig(
        root=Path(".tmp/private"),
        repo_root=REPO_ROOT,
        run_id="safe",
        show_private_loss=show_private_loss,
        once=once,
        refresh_seconds=1.0,
        width=20,
    )


def safe_monitor_args(*, show_loss: bool) -> list[str]:
    values = [
        "--root", ".tmp/private",
        "--run-id", "safe",
        "--private-research-only",
        "--once",
    ]
    if show_loss:
        values.append("--show-private-loss")
    return values
~~~

- [ ] **Step 2: Run the focused test and verify the module is absent**

Run:

~~~bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_monitor_private_research.py
~~~

Expected: collection fails with ModuleNotFoundError for monitor_private_research.

- [ ] **Step 3: Implement the read-only monitor**

Use this exact configuration:

~~~python
@dataclass(frozen=True)
class MonitorConfig:
    root: Path
    repo_root: Path
    run_id: str
    show_private_loss: bool = False
    once: bool = False
    refresh_seconds: float = 1.0
    width: int = 30
~~~

Validate refresh_seconds as a finite positive number and width as a non-bool integer in 10..80. The CLI requires --private-research-only; supports --show-private-loss and --once; fixes refresh at one second and width 30 in normal use; and scrubs PrivateResearchError detail.

render_progress() must clamp the filled bar to 0..width, use # and -, format completed/target, percentage with one decimal, active duration, recent speed with two decimals, ETA, snapshot age, and state. When private progress is provided, append loss and avg100 with six decimal places. Do not write monitor output to any file.

monitor_private_research() performs full preflight and safe existing-run resolution, reads public progress, conditionally reads private progress only after a TTY check, writes one carriage-returned line, and follows until paused, interrupted, or completed. --once renders one line and exits. Missing/corrupt progress fails closed without reading snapshot or metrics files.

- [ ] **Step 4: Run monitor tests**

Run:

~~~bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_monitor_private_research.py
~~~

Expected: all monitor tests pass.

- [ ] **Step 5: Commit the monitor**

~~~bash
git add training/stage7/mcagent_stage7/monitor_private_research.py training/stage7/tests/test_monitor_private_research.py
git commit -m "feat(stage7): add local private training monitor"
~~~

## Task 7: Preserve v1 evaluation and validate only completed v2 runs

**Files:**
- Modify: training/stage7/mcagent_stage7/evaluate_private_research.py
- Modify: training/stage7/tests/test_evaluate_private_research.py

**Interfaces:**
- Consumes: loaded manifest schema/source, v1 exact four-file set, v2 declared inventory, strict runtime state/pointer/snapshot validation, final file hashes, and existing 35-mask evaluator.
- Produces: _validate_v1_training_artifacts(), _validate_v2_training_artifacts(), and unchanged metadata-only evaluator output.

- [ ] **Step 1: Add failing v1 regression and completed-v2 tests**

Extend the evaluator test imports with:

~~~python
from dataclasses import replace

from mcagent_stage7.evaluate_private_research import (
    _detect_run_schema,
    _validate_training_artifacts,
)
from mcagent_stage7.private_research_runtime import (
    paths_for_run,
    read_run_state,
    write_run_state,
)
from mcagent_stage7.private_research_training import start_private_training
from private_research_test_support import (
    bypass_repository_identity,
    lightweight_services,
    make_config,
    make_ready_private_root,
)
~~~

~~~python
def test_v1_evaluator_artifact_contract_stays_exact() -> None:
    root = make_ready_evaluation_root()
    run = root / "runs" / "quality"
    assert _detect_run_schema(run / "checkpoint_manifest.json") == 1
    _validate_training_artifacts(run, expected_steps=1, manifest=json.loads(
        (run / "checkpoint_manifest.json").read_text("utf8")
    ))


def test_v2_evaluator_accepts_only_completed_declared_inventory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = make_ready_v2_evaluation_root(monkeypatch)
    run = root / "runs" / "quality-v2"
    manifest = json.loads((run / "checkpoint_manifest.json").read_text("utf8"))
    _validate_training_artifacts(run, expected_steps=3, manifest=manifest)
    assert read_run_state(paths_for_run(run)).status == "completed"


@pytest.mark.parametrize("state", ["paused", "interrupted", "running"])
def test_v2_evaluator_refuses_noncompleted_state(
    monkeypatch: pytest.MonkeyPatch,
    state: str,
) -> None:
    root = make_ready_v2_evaluation_root(monkeypatch)
    run = root / "runs" / "quality-v2"
    paths = paths_for_run(run)
    original = read_run_state(paths)
    changes: dict[str, object] = {"status": state}
    if state == "paused":
        changes.update({
            "pause_request_id": 1,
            "pause_acknowledged_id": 1,
            "pause_reason": "owner",
        })
    write_run_state(paths, replace(original, **changes))
    with pytest.raises(PrivateResearchError, match="RUN_NOT_COMPLETED"):
        evaluate_private_research(
            PrivateEvaluationConfig(root=root, repo_root=REPO_ROOT, run_id="quality-v2")
        )


def test_v2_evaluator_refuses_unknown_or_temporary_artifact(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = make_ready_v2_evaluation_root(monkeypatch)
    extra = root / "runs" / "quality-v2" / ".runtime" / "resume-a.pt.tmp"
    extra.write_bytes(b"partial")
    with pytest.raises(PrivateResearchError, match="RUN_ARTIFACT_INVALID"):
        evaluate_private_research(
            PrivateEvaluationConfig(root=root, repo_root=REPO_ROOT, run_id="quality-v2")
        )


def make_ready_v2_evaluation_root(
    monkeypatch: pytest.MonkeyPatch,
) -> Path:
    root = make_ready_private_root(
        "evaluation",
        case_count=22,
        validation_count=7,
    )
    bypass_repository_identity(monkeypatch)
    result = start_private_training(
        make_config(root, "quality-v2", steps=3),
        services=lightweight_services(),
    )
    assert result.status == "completed"
    return root
~~~

- [ ] **Step 2: Run evaluator tests and verify v2 fails**

Run:

~~~bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_evaluate_private_research.py
~~~

Expected: existing v1 tests pass until new v2 tests fail because the evaluator rejects the .runtime directory.

- [ ] **Step 3: Split artifact validation by explicit manifest version**

Rename TRAINING_ARTIFACTS to TRAINING_ARTIFACTS_V1 and preserve _validate_v1_training_artifacts() behavior exactly: every root entry is a regular file, names equal the four v1 names, reconstruction is 64**3 bytes, and metrics has one finite canonical row per expected step.

For v2, require:

1. manifest source/schema exactly v2/2 and completed_steps equals config steps;
2. .runtime is a real non-symlink directory and all declared paths are safe relative paths;
3. the actual recursive regular-file inventory equals manifest artifact_inventory before evaluation and equals that inventory plus evaluation.json after evaluation;
4. no symlink, directory below .runtime, unknown file, or filename ending .tmp exists;
5. run-state schema 2, status completed, completed_steps=snapshot_steps=target_steps=expected_steps;
6. resume-pointer and its selected terminal snapshot pass the strict loader and report expected_steps;
7. pause-request.json, when declared, has request_id equal acknowledged_id and acknowledged_state paused;
8. checkpoint, metrics, and reconstruction hashes match the manifest;
9. metrics and reconstruction pass the existing row/size checks; and
10. progress says completed without reading or printing private-progress loss.

Add allow_evaluation: bool=False to the shared artifact validator. Before evaluation, require the exact v1 or v2 training inventory without evaluation.json. After atomically writing evaluation.json, call the validator again with allow_evaluation=True and require exactly the version-specific training inventory plus evaluation.json. The evaluator still prints only scope, distribution, completion, and gate boolean. It must not resume, mutate runtime state, delete temp files, or evaluate paused/interrupted runs.

- [ ] **Step 4: Run checkpoint, training, and evaluator tests**

Run:

~~~bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research_checkpoints.py tests/test_private_research_training_v2.py tests/test_evaluate_private_research.py tests/test_private_research_evaluation.py
~~~

Expected: all v1/v2 checkpoint, training, metric, and evaluator tests pass.

- [ ] **Step 5: Commit evaluator compatibility**

~~~bash
git add training/stage7/mcagent_stage7/evaluate_private_research.py training/stage7/tests/test_evaluate_private_research.py
git commit -m "feat(stage7): evaluate completed v2 private runs"
~~~

## Task 8: Wire package scripts and document the operator workflow

**Files:**
- Modify: package.json
- Modify: training/stage7/README.md
- Modify: test/docsProjectStatus.test.js

**Interfaces:**
- Consumes: the four Python CLIs and approved operational design.
- Produces: stable npm commands and documentation that never authorizes a run by itself.

- [ ] **Step 1: Add a failing package/documentation status test**

Add assertions that package.json contains exactly:

~~~javascript
assert.equal(
  pkg.scripts['pause:stage7:private-research'],
  'conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.pause_private_research',
);
assert.equal(
  pkg.scripts['resume:stage7:private-research'],
  'conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.resume_private_research',
);
assert.equal(
  pkg.scripts['monitor:stage7:private-research'],
  'conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.monitor_private_research',
);
~~~

Also assert README contains --show-private-loss, five-minute/two-slot recovery, the 1.5 GiB pause, and the literal future approval string device=cpu,steps=185946.

- [ ] **Step 2: Run the documentation test and verify it fails**

Run:

~~~bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/docsProjectStatus.test.js
~~~

Expected: FAIL because the three scripts and workflow text are absent.

- [ ] **Step 3: Add package scripts**

Add these three scripts adjacent to train/evaluate without modifying any normal Node command:

~~~json
"pause:stage7:private-research": "conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.pause_private_research",
"resume:stage7:private-research": "conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.resume_private_research",
"monitor:stage7:private-research": "conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.monitor_private_research"
~~~

- [ ] **Step 4: Document exact local commands and boundaries**

README must show:

~~~bash
npm run monitor:stage7:private-research -- --root .local/stage7-private-research --run-id RUN_ID --private-research-only
npm run monitor:stage7:private-research -- --root .local/stage7-private-research --run-id RUN_ID --private-research-only --show-private-loss
npm run pause:stage7:private-research -- --root .local/stage7-private-research --run-id RUN_ID --private-research-only --metadata-only
npm run resume:stage7:private-research -- --root .local/stage7-private-research --run-id RUN_ID --private-research-only --metadata-only
~~~

Explain that loss mode is local interactive TTY only; pause success means snapshot validated and lock released; power loss may discard at most about five active minutes; snapshots overwrite fixed A/B slots; resume accepts no configuration override; RSS at 1.5 GiB or any swap requests pause; only completed v2 runs can be evaluated; the two v1 runs cannot resume; and no real run starts until the owner later sends device=cpu,steps=185946.

Use RUN_ID as documentation syntax, not a concrete operational approval. Do not include any exact private loss, private hash, filename, case ID, source URL, tensor, checkpoint content, or reconstruction content.

- [ ] **Step 5: Run CLI, Python, and documentation tests**

Run:

~~~bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research_runtime.py tests/test_private_research_snapshots.py tests/test_private_research_checkpoints.py tests/test_private_research_training_v2.py tests/test_private_research_control_cli.py tests/test_monitor_private_research.py tests/test_train_private_research.py tests/test_evaluate_private_research.py
~~~

Expected: all focused Python tests pass.

Run:

~~~bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/docsProjectStatus.test.js test/stage7PrivateResearchBoundary.test.js test/stage7PrivateResearchCorpus.test.js test/stage7PrivateResearchCli.test.js
~~~

Expected: all selected Node tests pass. If the sandbox returns EPERM from nested spawnSync, rerun this exact command with narrowly scoped child-process permission; do not skip or weaken it.

- [ ] **Step 6: Commit scripts and docs**

~~~bash
git add package.json training/stage7/README.md test/docsProjectStatus.test.js
git commit -m "docs(stage7): document interruptible private training"
~~~

## Task 9: Verify every boundary and create the durable operational handoff

**Files:**
- Create: docs/superpowers/handoffs/2026-07-16-stage-7-private-interruptible-training-ready.md

**Interfaces:**
- Consumes: all implementation commits and fresh verification evidence.
- Produces: a non-self-referential continuation record for a later owner-approved CPU 185,946-step run; the handoff does not authorize training.

- [ ] **Step 1: Run all focused interruption and disclosure tests**

Run:

~~~bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research_runtime.py tests/test_private_research_snapshots.py tests/test_private_research_training_v2.py tests/test_private_research_control_cli.py tests/test_monitor_private_research.py tests/test_private_research_checkpoints.py tests/test_evaluate_private_research.py
~~~

Expected: all focused tests pass, including every atomic fault stage, deterministic pause/resume equivalence, v1 compatibility, non-TTY loss refusal, and exact-target finalization.

- [ ] **Step 2: Run the complete Stage 7 Python suite**

Run:

~~~bash
npm run test:stage7:m3
~~~

Expected: every Stage 7 Python test passes with exit code 0 and no real private record or exact metric in output.

- [ ] **Step 3: Run the relevant and full Node suites**

Run:

~~~bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/docsProjectStatus.test.js test/stage7PrivateResearchBoundary.test.js test/stage7PrivateResearchCorpus.test.js test/stage7PrivateResearchCli.test.js test/stage7M3Fixtures.test.js test/stage7PythonProvider.test.js
~~~

Expected: all selected Node tests pass.

Run:

~~~bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test
~~~

Expected: the full Node suite passes with zero failures. Use narrowly scoped normal child-process permission only for the documented nested-spawn EPERM.

- [ ] **Step 4: Prove formal Dataset hashes and gate**

Run:

~~~bash
sha256sum mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json
~~~

Expected in order:

~~~text
fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749
af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654
5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082
~~~

Run:

~~~bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json','utf8')); console.log(JSON.stringify({ready_for_m3_real_data:m.ready_for_m3_real_data,training_eligible_count:m.training_eligible_count}));"
~~~

Expected: {"ready_for_m3_real_data":false,"training_eligible_count":0}.

- [ ] **Step 5: Prove aggregate private invariants without exposing content**

Run:

~~~bash
git ls-files .local/stage7-private-research
git check-ignore -q .local/stage7-private-research
~~~

Expected: ls-files has no output and check-ignore exits zero.

Run:

~~~bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node -e "const fs=require('fs'),path=require('path'); const root=path.join(process.cwd(),'.local/stage7-private-research'); const lines=(file)=>fs.readFileSync(file,'utf8').trim().split(/\n/).filter(Boolean).length; const split=JSON.parse(fs.readFileSync(path.join(root,'splits/split.json'),'utf8')); const prepared=fs.readdirSync(path.join(root,'prepared')).filter((name)=>name.endsWith('.voxels.bin')); const runArtifactCounts=fs.readdirSync(path.join(root,'runs'),{withFileTypes:true}).filter((entry)=>entry.isDirectory()).map((entry)=>fs.readdirSync(path.join(root,'runs',entry.name)).length).sort((a,b)=>a-b); console.log(JSON.stringify({source_files:fs.readdirSync(path.join(root,'source')).filter((name)=>name.endsWith('.schematic')).length,deferred_oversized:fs.readdirSync(path.join(root,'deferred/oversized')).filter((name)=>name.endsWith('.schematic')).length,source_records:lines(path.join(root,'manifests/sources.jsonl')),prepared_records:lines(path.join(root,'manifests/prepared.jsonl')),prepared_binary_count:prepared.length,all_prepared_64_cubed:prepared.every((name)=>fs.statSync(path.join(root,'prepared',name)).size===64**3),train_cases:split.train_case_ids.length,validation_cases:split.validation_case_ids.length,run_directory_count:runArtifactCounts.length,run_artifact_counts:runArtifactCounts}));"
~~~

Expected: {"source_files":22,"deferred_oversized":42,"source_records":22,"prepared_records":22,"prepared_binary_count":22,"all_prepared_64_cubed":true,"train_cases":15,"validation_cases":7,"run_directory_count":2,"run_artifact_counts":[4,5]}. Print no run names or private records.

Run:

~~~bash
conda run -n mcagent-stage7 --cwd training/stage7 python -c "import json; from pathlib import Path; from mcagent_stage7.private_research import run_private_preflight; result=run_private_preflight(root=Path('../../.local/stage7-private-research'),repo_root=Path('../..')); print(json.dumps({'preflight':'passed','case_count':result.case_count,'dataset_v3_gate':result.dataset_v3_gate},sort_keys=True,separators=(',',':')))"
~~~

Expected: {"case_count":22,"dataset_v3_gate":{"ready_for_m3_real_data":false,"training_eligible_count":0},"preflight":"passed"}.

- [ ] **Step 6: Record the exact implementation baseline**

Run git status --short and require no output. Run git rev-parse HEAD and copy that literal 40-character lowercase hash into the handoff as approved_code_revision. This hash is the implementation parent, not the later handoff commit.

- [ ] **Step 7: Write the durable handoff**

The handoff must record:

- approved_code_revision and branch codex/stage7-dataset-v3-extraction;
- every test command and actual pass count from Steps 1-3;
- only the aggregate private counts and formal Dataset hashes/gate from Steps 4-5;
- the exact v2 artifact/state protocol, five-minute A/B snapshots, 1.5 GiB pause, interactive local loss rule, pause acknowledgement, and same-run resume rule;
- the immutable v1 4/5-artifact run state;
- a concrete fresh proposed run ID, CPU, seed 7101, batch 1, learning rate 0.001, and target 185946;
- an explicit statement that implementation tests used only synthetic .tmp fixtures and no new real private training ran;
- the prohibition on export, Dataset changes, normal Node changes, M4, and all 42 deferred buildings;
- the requirement to obtain a new literal device=cpu,steps=185946 approval before starting; and
- this non-self-referential Git protocol:

~~~bash
git status --short
git branch --show-current
git rev-parse HEAD^
git log -1 --format=%s
git diff --name-only HEAD^..HEAD
git ls-files .local/stage7-private-research
git check-ignore -q .local/stage7-private-research
~~~

Expected: clean status; recorded branch; HEAD^ equals approved_code_revision; subject docs(stage7): hand off interruptible private training; the handoff commit changes only docs/superpowers/handoffs/2026-07-16-stage-7-private-interruptible-training-ready.md; private ls-files is empty; private root is ignored.

- [ ] **Step 8: Check and commit only the handoff**

Run git diff --check and require no output.

~~~bash
git add docs/superpowers/handoffs/2026-07-16-stage-7-private-interruptible-training-ready.md
git commit -m "docs(stage7): hand off interruptible private training"
~~~

- [ ] **Step 9: Prove the committed handoff relation and clean tree**

Run the exact seven-command handoff Git protocol from Step 7. Require every expected value and no extra changed path. Stop if anything differs.

## Post-implementation operational gate

Implementation completion still does not start training. In the later operational turn:

1. Read the complete new handoff and run every Git/private/formal check read-only.
2. Stop on any drift, unknown artifact, private-root tracking, failed preflight, changed Dataset hash/gate, changed 22/42/15/7 scope, or changed existing v1 run.
3. Present the fresh run ID and fixed CPU, seed 7101, batch 1, learning rate 0.001, 185946 steps, five-minute A/B snapshots, and 1.5 GiB pause.
4. Wait for the owner to send exactly device=cpu,steps=185946 in that operational window.
5. Start only npm run train:stage7:private-research with metadata-only output and the handoff-approved code revision.
6. Give the owner the local monitor command. Only the owner may add --show-private-loss in an interactive IDE terminal.
7. On a pause command, report safe shutdown only after matching acknowledgement, validated snapshot, paused state, and released run lock.
8. On completion, audit only containment, exact v2 inventory, scope/distribution, finite-status booleans, checkpoint integrity, Dataset hashes/gate, and evaluation completion/gate boolean.
9. Stop after one evaluator run. Do not automatically retry, extend, change device, train again, process oversized buildings, or expose private metrics/content.
