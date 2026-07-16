from __future__ import annotations

import signal
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

import mcagent_stage7.pause_private_research as pause_module
import mcagent_stage7.resume_private_research as resume_module
import mcagent_stage7.train_private_research as train_module
from mcagent_stage7.private_research_runtime import PrivateRunState, paths_for_run, read_run_state
from mcagent_stage7.private_research_training import (
    SignalPauseToken,
    cooperative_signal_handlers,
    start_private_training,
)
from private_research_test_support import (
    bypass_repository_identity,
    lightweight_services,
    make_config,
    make_ready_private_root,
)


REPO_ROOT = Path(__file__).resolve().parents[3]


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


def test_resume_cli_prints_only_six_metadata_lines(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(
        resume_module,
        "resume_private_training",
        lambda config, pause_signal: SimpleNamespace(
            status="paused",
            completed_steps=2,
            target_steps=10,
        ),
    )
    assert resume_module.main([
        "--root", ".tmp/private",
        "--run-id", "safe",
        "--private-research-only",
        "--metadata-only",
    ]) == 0
    assert capsys.readouterr().out.splitlines() == [
        "training_scope: private-research-only",
        "distribution: prohibited",
        "run_state: paused",
        "completed_steps: 2",
        "target_steps: 10",
        "run_complete: false",
    ]


def test_signal_handler_pauses_at_the_next_validated_step_boundary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = make_ready_private_root("signal")
    bypass_repository_identity(monkeypatch)
    installed: dict[int, Any] = {}

    def fake_signal(number: int, handler: Any) -> Any:
        previous = installed.get(number, signal.SIG_DFL)
        installed[number] = handler
        return previous

    monkeypatch.setattr(signal, "signal", fake_signal)
    token = SignalPauseToken()
    with cooperative_signal_handlers(token):
        installed[signal.SIGTERM](signal.SIGTERM, None)
        result = start_private_training(
            make_config(root, "signal", steps=3),
            services=lightweight_services(),
            pause_signal=token,
        )
    assert result.status == "paused"
    assert result.completed_steps == 1
    state = read_run_state(paths_for_run(result.run_path))
    assert state.pause_reason == "signal"
    assert state.snapshot_steps == 1


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
