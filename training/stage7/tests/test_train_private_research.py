from __future__ import annotations

from pathlib import Path

import pytest

from mcagent_stage7.private_research import PrivateResearchError
from mcagent_stage7.train_private_research import PrivateTrainConfig, train_private_research
from private_research_test_support import (
    bypass_repository_identity,
    make_ready_private_root,
)


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_one_step_private_smoke_run_writes_only_private_non_distributable_artifacts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = make_ready_private_root("legacy-smoke")
    bypass_repository_identity(monkeypatch)

    result = train_private_research(
        PrivateTrainConfig(
            root=root,
            repo_root=REPO_ROOT,
            seed=7101,
            steps=1,
            batch_size=1,
            learning_rate=1e-3,
            device="cpu",
            run_id="smoke",
            code_revision="a" * 40,
        )
    )

    assert result.status == "completed"
    assert result.completed_steps == 1
    assert result.manifest is not None
    assert result.manifest["training_scope"] == "private-research-only"
    assert result.manifest["distribution"] == "prohibited"
    assert result.manifest["config"]["batch_size"] == 1
    assert result.run_path.is_relative_to(root / "runs")
    assert (result.run_path / "reconstruction.bin").stat().st_size == 64**3
    assert (result.run_path / ".runtime" / "run-state.json").is_file()


def test_trainer_refuses_output_outside_private_root() -> None:
    root = make_ready_private_root("escape")
    config = PrivateTrainConfig(
        root=root,
        repo_root=REPO_ROOT,
        seed=7101,
        steps=1,
        batch_size=1,
        learning_rate=1e-3,
        device="cpu",
        run_id="../escape",
        code_revision="a" * 40,
    )

    with pytest.raises(PrivateResearchError, match="RUN_ID_INVALID|PATH_OUTSIDE_PRIVATE_ROOT"):
        train_private_research(config)


def test_trainer_metadata_only_never_prints_loss(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    import mcagent_stage7.train_private_research as module

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
    monkeypatch.setattr(module, "train_private_research", lambda config: fake)
    assert (
        module.main(
            [
                "--root",
                ".tmp/private",
                "--run-id",
                "safe",
                "--private-research-only",
                "--metadata-only",
                "--steps",
                "1",
                "--device",
                "cpu",
                "--code-revision",
                "a" * 40,
            ]
        )
        == 0
    )
    output = capsys.readouterr().out
    assert "training_scope: private-research-only" in output
    assert "distribution: prohibited" in output
    assert "run_complete: true" in output
    assert "final_loss" not in output


def test_trainer_cli_resolves_dot_local_from_repository_root(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import mcagent_stage7.train_private_research as module

    captured: list[module.PrivateTrainConfig] = []
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
    monkeypatch.setattr(
        module,
        "train_private_research",
        lambda config: captured.append(config) or fake,
    )
    assert (
        module.main(
            [
                "--root",
                ".local/stage7-private-research",
                "--run-id",
                "safe",
                "--private-research-only",
                "--metadata-only",
                "--steps",
                "1",
                "--device",
                "cpu",
                "--code-revision",
                "a" * 40,
            ]
        )
        == 0
    )
    assert captured[0].repo_root == REPO_ROOT
    assert captured[0].root == REPO_ROOT / ".local" / "stage7-private-research"


def test_trainer_metadata_only_scrubs_private_error_detail(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    import mcagent_stage7.train_private_research as module

    def fail(config: module.PrivateTrainConfig) -> module.PrivateTrainingResult:
        raise module.PrivateResearchError(
            "SOURCE_HASH_CHANGED",
            "secret-name.schematic",
        )

    monkeypatch.setattr(module, "train_private_research", fail)
    with pytest.raises(SystemExit):
        module.main(
            [
                "--root",
                ".tmp/private",
                "--run-id",
                "safe",
                "--private-research-only",
                "--metadata-only",
                "--steps",
                "1",
                "--device",
                "cpu",
                "--code-revision",
                "a" * 40,
            ]
        )
    error = capsys.readouterr().err
    assert "SOURCE_HASH_CHANGED" in error
    assert "secret-name.schematic" not in error
