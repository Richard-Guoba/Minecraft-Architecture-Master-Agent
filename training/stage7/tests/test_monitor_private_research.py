from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

import mcagent_stage7.monitor_private_research as module
from mcagent_stage7.monitor_private_research import MonitorConfig, render_progress


REPO_ROOT = Path(__file__).resolve().parents[3]


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
