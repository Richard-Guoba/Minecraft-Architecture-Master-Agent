from __future__ import annotations

import fcntl
import hashlib
import json
import math
import os
import subprocess
import time
from contextlib import contextmanager
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Any, Callable, Iterator

from .private_research import PrivateResearchError, validate_private_run_id


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

_RUN_STATE_FIELDS = {
    "schema_version",
    "status",
    "run_id",
    "binding",
    "completed_steps",
    "snapshot_steps",
    "target_steps",
    "snapshot_generation",
    "pause_request_id",
    "pause_acknowledged_id",
    "active_seconds",
    "paused_seconds",
    "paused_at_epoch_seconds",
    "pause_reason",
    "lost_steps_on_last_resume",
}
_PAUSE_FIELDS = {
    "schema_version",
    "request_id",
    "reason",
    "acknowledged_id",
    "acknowledged_state",
}
_PAUSE_REASONS = {"owner", "signal", "memory_limit", "swap_detected"}
_PUBLIC_PROGRESS_FIELDS = {
    "schema_version",
    "state",
    "completed_steps",
    "target_steps",
    "percent",
    "active_seconds",
    "recent_steps_per_second",
    "eta_seconds",
    "snapshot_age_seconds",
}
_PRIVATE_PROGRESS_FIELDS = {
    "schema_version",
    "current_loss",
    "rolling_100_loss",
}

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


@dataclass(frozen=True)
class ResourceSample:
    rss_bytes: int
    swap_bytes: int
    available_bytes: int


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


def create_initial_state(
    *,
    run_id: str,
    binding: dict[str, Any],
    target_steps: int,
) -> PrivateRunState:
    state = PrivateRunState(
        schema_version=RUN_SCHEMA_VERSION,
        status="initializing",
        run_id=run_id,
        binding=binding,
        completed_steps=0,
        snapshot_steps=0,
        target_steps=target_steps,
        snapshot_generation=-1,
        pause_request_id=0,
        pause_acknowledged_id=0,
        active_seconds=0.0,
        paused_seconds=0.0,
        paused_at_epoch_seconds=None,
        pause_reason=None,
        lost_steps_on_last_resume=0,
    )
    _validate_state(state)
    return state


def read_run_state(paths: PrivateRunPaths) -> PrivateRunState:
    value = _read_json(paths.state_path, code="RUN_STATE_INVALID")
    if set(value) != _RUN_STATE_FIELDS:
        raise PrivateResearchError("RUN_STATE_INVALID", "field set")
    try:
        state = PrivateRunState(**value)
    except TypeError as error:
        raise PrivateResearchError("RUN_STATE_INVALID", "field types") from error
    _validate_state(state)
    return state


def write_run_state(paths: PrivateRunPaths, state: PrivateRunState) -> None:
    _validate_state(state)
    atomic_write_json(paths.state_path, asdict(state))


def transition_state(
    state: PrivateRunState,
    target: str,
    **changes: Any,
) -> PrivateRunState:
    if target not in LEGAL_TRANSITIONS.get(state.status, frozenset()):
        raise PrivateResearchError(
            "RUN_STATE_TRANSITION_INVALID",
            state.status + "->" + target,
        )
    result = replace(state, status=target, **changes)
    _validate_state(result)
    return result


def atomic_write_bytes(path: Path, payload: bytes) -> None:
    target = Path(path)
    temporary = target.with_name(target.name + ".tmp")
    try:
        with temporary.open("wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
        _fsync_directory(target.parent)
    except OSError as error:
        raise PrivateResearchError("ATOMIC_WRITE_FAILED", str(target)) from error


def atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    try:
        payload = (
            json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n"
        ).encode("utf8")
    except (TypeError, ValueError) as error:
        raise PrivateResearchError("JSON_INVALID", str(path)) from error
    atomic_write_bytes(path, payload)


@contextmanager
def hold_run_lock(paths: PrivateRunPaths) -> Iterator[None]:
    try:
        handle = paths.run_lock_path.open("a+b")
    except OSError as error:
        raise PrivateResearchError("RUN_LOCK_INVALID", str(paths.run_lock_path)) from error
    try:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise PrivateResearchError("RUN_LOCKED", str(paths.run_path)) from error
        yield
    finally:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        finally:
            handle.close()


def request_pause(paths: PrivateRunPaths, *, reason: str) -> int:
    if reason not in _PAUSE_REASONS:
        raise PrivateResearchError("PAUSE_REQUEST_INVALID", str(reason))
    with _hold_control_lock(paths):
        if paths.pause_request_path.exists():
            request = read_pause_request(paths)
            if request["request_id"] > request["acknowledged_id"]:
                return int(request["request_id"])
            request_id = int(request["request_id"]) + 1
        else:
            request_id = 1
        atomic_write_json(
            paths.pause_request_path,
            {
                "schema_version": PAUSE_SCHEMA_VERSION,
                "request_id": request_id,
                "reason": reason,
                "acknowledged_id": request_id - 1,
                "acknowledged_state": None,
            },
        )
        return request_id


def read_pause_request(paths: PrivateRunPaths) -> dict[str, Any]:
    value = _read_json(paths.pause_request_path, code="PAUSE_REQUEST_INVALID")
    _validate_pause_request(value)
    return value


def acknowledge_pause(paths: PrivateRunPaths, *, request_id: int) -> None:
    with _hold_control_lock(paths):
        request = read_pause_request(paths)
        if request["request_id"] != request_id:
            raise PrivateResearchError("PAUSE_REQUEST_INVALID", "request_id")
        acknowledged = dict(request)
        acknowledged["acknowledged_id"] = request_id
        acknowledged["acknowledged_state"] = "paused"
        _validate_pause_request(acknowledged)
        atomic_write_json(paths.pause_request_path, acknowledged)


def require_repository_identity(repo_root: Path, code_revision: str) -> str:
    if not _is_sha1(code_revision):
        raise PrivateResearchError("CODE_REVISION_MISMATCH", str(code_revision))
    repository = Path(repo_root)
    status = _run_git(repository, ["git", "status", "--porcelain"])
    if status.stdout:
        raise PrivateResearchError("REPOSITORY_DIRTY", "working tree has changes")
    head = _run_git(repository, ["git", "rev-parse", "HEAD"]).stdout.strip()
    if head != code_revision:
        raise PrivateResearchError("CODE_REVISION_MISMATCH", head)
    return head


def compute_training_code_sha256(repo_root: Path) -> str:
    repository = Path(repo_root)
    digest = hashlib.sha256()
    for relative in TRAINING_CODE_PATHS:
        path = repository / relative
        try:
            payload = path.read_bytes()
        except OSError as error:
            raise PrivateResearchError("TRAINING_CODE_INVALID", relative) from error
        digest.update(relative.encode("utf8"))
        digest.update(b"\0")
        digest.update(payload)
        digest.update(b"\0")
    return digest.hexdigest()


def publish_progress(
    paths: PrivateRunPaths,
    *,
    state: str,
    completed_steps: int,
    target_steps: int,
    active_seconds: float,
    recent_steps_per_second: float,
    eta_seconds: float,
    snapshot_age_seconds: float,
    current_loss: float,
    rolling_loss: float,
) -> None:
    public = {
        "schema_version": PUBLIC_PROGRESS_SCHEMA_VERSION,
        "state": state,
        "completed_steps": completed_steps,
        "target_steps": target_steps,
        "percent": 100.0 * completed_steps / target_steps
        if _is_positive_integer(target_steps)
        else float("nan"),
        "active_seconds": active_seconds,
        "recent_steps_per_second": recent_steps_per_second,
        "eta_seconds": eta_seconds,
        "snapshot_age_seconds": snapshot_age_seconds,
    }
    private = {
        "schema_version": PRIVATE_PROGRESS_SCHEMA_VERSION,
        "current_loss": current_loss,
        "rolling_100_loss": rolling_loss,
    }
    _validate_public_progress(public)
    _validate_private_progress(private)
    atomic_write_json(paths.progress_path, public)
    atomic_write_json(paths.private_progress_path, private)


def read_public_progress(paths: PrivateRunPaths) -> dict[str, Any]:
    value = _read_json(paths.progress_path, code="PROGRESS_INVALID")
    _validate_public_progress(value)
    return value


def read_private_progress(paths: PrivateRunPaths) -> dict[str, Any]:
    value = _read_json(paths.private_progress_path, code="PRIVATE_PROGRESS_INVALID")
    _validate_private_progress(value)
    return value


def sample_resources() -> ResourceSample:
    status = _read_proc_kib(Path("/proc/self/status"), ("VmRSS", "VmSwap"))
    memory = _read_proc_kib(Path("/proc/meminfo"), ("MemAvailable",))
    return ResourceSample(
        rss_bytes=status["VmRSS"] * 1024,
        swap_bytes=status["VmSwap"] * 1024,
        available_bytes=memory["MemAvailable"] * 1024,
    )


@dataclass(frozen=True)
class RuntimeServices:
    monotonic: Callable[[], float] = time.monotonic
    wall_time: Callable[[], float] = time.time
    sleep: Callable[[float], None] = time.sleep
    resources: Callable[[], ResourceSample] = sample_resources
    fault_hook: Callable[[str], None] = lambda stage: None
    after_step: Callable[[PrivateRunPaths, int], None] = lambda paths, step: None


def _validate_state(state: PrivateRunState) -> None:
    if state.schema_version != RUN_SCHEMA_VERSION:
        raise PrivateResearchError("RUN_STATE_INVALID", "schema_version")
    if state.status not in LEGAL_TRANSITIONS:
        raise PrivateResearchError("RUN_STATE_INVALID", "status")
    validate_private_run_id(state.run_id)
    if not isinstance(state.binding, dict):
        raise PrivateResearchError("RUN_STATE_INVALID", "binding")
    if not _is_positive_integer(state.target_steps):
        raise PrivateResearchError("RUN_STATE_INVALID", "target_steps")
    if not _is_nonnegative_integer(state.completed_steps):
        raise PrivateResearchError("RUN_STATE_INVALID", "completed_steps")
    if not _is_nonnegative_integer(state.snapshot_steps):
        raise PrivateResearchError("RUN_STATE_INVALID", "snapshot_steps")
    if not state.snapshot_steps <= state.completed_steps <= state.target_steps:
        raise PrivateResearchError("RUN_STATE_INVALID", "step ordering")
    if (
        isinstance(state.snapshot_generation, bool)
        or not isinstance(state.snapshot_generation, int)
        or state.snapshot_generation < -1
    ):
        raise PrivateResearchError("RUN_STATE_INVALID", "snapshot_generation")
    if not _is_nonnegative_integer(state.pause_request_id):
        raise PrivateResearchError("RUN_STATE_INVALID", "pause_request_id")
    if not _is_nonnegative_integer(state.pause_acknowledged_id):
        raise PrivateResearchError("RUN_STATE_INVALID", "pause_acknowledged_id")
    if state.pause_acknowledged_id > state.pause_request_id:
        raise PrivateResearchError("RUN_STATE_INVALID", "pause ids")
    if not _is_finite_nonnegative(state.active_seconds):
        raise PrivateResearchError("RUN_STATE_INVALID", "active_seconds")
    if not _is_finite_nonnegative(state.paused_seconds):
        raise PrivateResearchError("RUN_STATE_INVALID", "paused_seconds")
    if (
        state.paused_at_epoch_seconds is not None
        and not _is_finite_nonnegative(state.paused_at_epoch_seconds)
    ):
        raise PrivateResearchError("RUN_STATE_INVALID", "paused_at_epoch_seconds")
    if state.pause_reason is not None and state.pause_reason not in _PAUSE_REASONS:
        raise PrivateResearchError("RUN_STATE_INVALID", "pause_reason")
    if not _is_nonnegative_integer(state.lost_steps_on_last_resume):
        raise PrivateResearchError("RUN_STATE_INVALID", "lost_steps_on_last_resume")
    if state.status == "pause_requested" and (
        state.pause_request_id <= state.pause_acknowledged_id
        or state.pause_reason is None
    ):
        raise PrivateResearchError("RUN_STATE_INVALID", "pause_requested")
    if state.status == "paused" and (
        state.pause_request_id != state.pause_acknowledged_id
        or state.pause_request_id <= 0
        or state.snapshot_steps != state.completed_steps
        or state.pause_reason is None
        or state.paused_at_epoch_seconds is None
    ):
        raise PrivateResearchError("RUN_STATE_INVALID", "paused")
    if state.status == "completed" and (
        state.completed_steps != state.target_steps
        or state.snapshot_steps != state.target_steps
        or state.paused_at_epoch_seconds is not None
    ):
        raise PrivateResearchError("RUN_STATE_INVALID", "completed")


def _validate_pause_request(value: dict[str, Any]) -> None:
    if set(value) != _PAUSE_FIELDS:
        raise PrivateResearchError("PAUSE_REQUEST_INVALID", "field set")
    request_id = value.get("request_id")
    acknowledged_id = value.get("acknowledged_id")
    if value.get("schema_version") != PAUSE_SCHEMA_VERSION:
        raise PrivateResearchError("PAUSE_REQUEST_INVALID", "schema_version")
    if not _is_positive_integer(request_id):
        raise PrivateResearchError("PAUSE_REQUEST_INVALID", "request_id")
    if not _is_nonnegative_integer(acknowledged_id):
        raise PrivateResearchError("PAUSE_REQUEST_INVALID", "acknowledged_id")
    if acknowledged_id > request_id:
        raise PrivateResearchError("PAUSE_REQUEST_INVALID", "request ids")
    if value.get("reason") not in _PAUSE_REASONS:
        raise PrivateResearchError("PAUSE_REQUEST_INVALID", "reason")
    acknowledged_state = value.get("acknowledged_state")
    if acknowledged_id == request_id:
        if acknowledged_state != "paused":
            raise PrivateResearchError("PAUSE_REQUEST_INVALID", "acknowledged_state")
    elif acknowledged_state is not None:
        raise PrivateResearchError("PAUSE_REQUEST_INVALID", "acknowledged_state")


def _validate_public_progress(value: dict[str, Any]) -> None:
    if set(value) != _PUBLIC_PROGRESS_FIELDS:
        raise PrivateResearchError("PROGRESS_INVALID", "field set")
    if value.get("schema_version") != PUBLIC_PROGRESS_SCHEMA_VERSION:
        raise PrivateResearchError("PROGRESS_INVALID", "schema_version")
    if value.get("state") not in LEGAL_TRANSITIONS:
        raise PrivateResearchError("PROGRESS_INVALID", "state")
    completed_steps = value.get("completed_steps")
    target_steps = value.get("target_steps")
    if not _is_nonnegative_integer(completed_steps):
        raise PrivateResearchError("PROGRESS_INVALID", "completed_steps")
    if not _is_positive_integer(target_steps):
        raise PrivateResearchError("PROGRESS_INVALID", "target_steps")
    if completed_steps > target_steps:
        raise PrivateResearchError("PROGRESS_INVALID", "step ordering")
    for field in (
        "percent",
        "active_seconds",
        "recent_steps_per_second",
        "eta_seconds",
        "snapshot_age_seconds",
    ):
        if not _is_finite_nonnegative(value.get(field)):
            raise PrivateResearchError("PROGRESS_INVALID", field)
    expected_percent = 100.0 * completed_steps / target_steps
    if float(value["percent"]) != expected_percent:
        raise PrivateResearchError("PROGRESS_INVALID", "percent")


def _validate_private_progress(value: dict[str, Any]) -> None:
    if set(value) != _PRIVATE_PROGRESS_FIELDS:
        raise PrivateResearchError("PRIVATE_PROGRESS_INVALID", "field set")
    if value.get("schema_version") != PRIVATE_PROGRESS_SCHEMA_VERSION:
        raise PrivateResearchError("PRIVATE_PROGRESS_INVALID", "schema_version")
    for field in ("current_loss", "rolling_100_loss"):
        if not _is_finite_nonnegative(value.get(field)):
            raise PrivateResearchError("PRIVATE_PROGRESS_INVALID", field)


@contextmanager
def _hold_control_lock(paths: PrivateRunPaths) -> Iterator[None]:
    try:
        descriptor = os.open(paths.runtime_path, os.O_RDONLY | os.O_DIRECTORY)
    except OSError as error:
        raise PrivateResearchError("PAUSE_REQUEST_INVALID", str(paths.runtime_path)) from error
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def _read_json(path: Path, *, code: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text("utf8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PrivateResearchError(code, str(path)) from error
    if not isinstance(value, dict):
        raise PrivateResearchError(code, str(path))
    return value


def _read_proc_kib(path: Path, fields: tuple[str, ...]) -> dict[str, int]:
    try:
        lines = path.read_text("utf8").splitlines()
    except (OSError, UnicodeDecodeError) as error:
        raise PrivateResearchError("RESOURCE_STATUS_INVALID", str(path)) from error
    values: dict[str, int] = {}
    requested = set(fields)
    for line in lines:
        pieces = line.split()
        if not pieces:
            continue
        name = pieces[0].removesuffix(":")
        if name not in requested:
            continue
        if name in values or len(pieces) != 3 or pieces[2] != "kB":
            raise PrivateResearchError("RESOURCE_STATUS_INVALID", name)
        try:
            amount = int(pieces[1])
        except ValueError as error:
            raise PrivateResearchError("RESOURCE_STATUS_INVALID", name) from error
        if amount < 0:
            raise PrivateResearchError("RESOURCE_STATUS_INVALID", name)
        values[name] = amount
    if set(values) != requested:
        raise PrivateResearchError("RESOURCE_STATUS_INVALID", str(path))
    return values


def _run_git(
    repository: Path,
    command: list[str],
) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(
            command,
            cwd=repository,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except OSError as error:
        raise PrivateResearchError("REPOSITORY_IDENTITY_FAILED", str(repository)) from error
    if result.returncode != 0:
        raise PrivateResearchError(
            "REPOSITORY_IDENTITY_FAILED",
            result.stderr.strip() or command[-1],
        )
    return result


def _fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _is_positive_integer(value: Any) -> bool:
    return not isinstance(value, bool) and isinstance(value, int) and value > 0


def _is_nonnegative_integer(value: Any) -> bool:
    return not isinstance(value, bool) and isinstance(value, int) and value >= 0


def _is_finite_nonnegative(value: Any) -> bool:
    return (
        not isinstance(value, bool)
        and isinstance(value, (int, float))
        and math.isfinite(float(value))
        and float(value) >= 0.0
    )


def _is_sha1(value: Any) -> bool:
    return (
        isinstance(value, str)
        and len(value) == 40
        and all(character in "0123456789abcdef" for character in value)
    )
