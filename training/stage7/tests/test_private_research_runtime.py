from __future__ import annotations

import json
import subprocess
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
    publish_progress,
    request_pause,
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
    requested = transition_state(
        running,
        "pause_requested",
        pause_request_id=1,
        pause_reason="owner",
    )
    paused = transition_state(
        requested,
        "paused",
        pause_acknowledged_id=1,
        paused_at_epoch_seconds=1000.0,
    )
    assert transition_state(
        paused,
        "running",
        paused_at_epoch_seconds=None,
    ).status == "running"
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


def test_repository_identity_requires_clean_exact_head(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import mcagent_stage7.private_research_runtime as module

    calls: list[tuple[str, ...]] = []

    def fake_run(
        command: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
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
