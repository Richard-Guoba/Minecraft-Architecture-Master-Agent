from __future__ import annotations

import json
from pathlib import Path

import pytest

from mcagent_stage7.training_data import TrainingError
from mcagent_stage7.training_loop import TrainingConfig, train_model
from training_test_support import make_training_root


class IntentionalStop(RuntimeError):
    pass


def test_interrupted_training_resumes_without_duplicate_optimizer_steps(
    tmp_path: Path,
) -> None:
    root = make_training_root(tmp_path)
    config = TrainingConfig(
        root=root,
        run_id="resume-smoke",
        steps=3,
        batch_size=2,
        learning_rate=0.001,
        device="cpu",
        seed=7101,
    )
    optimized_steps: list[int] = []

    def stop_after_two(step: int) -> None:
        optimized_steps.append(step)
        if step == 2:
            raise IntentionalStop("stop after checkpoint")

    with pytest.raises(IntentionalStop):
        train_model(config, after_step=stop_after_two)
    result = train_model(config, after_step=optimized_steps.append)

    assert optimized_steps == [1, 2, 3]
    assert result.completed_steps == 3
    assert result.target_steps == 3
    assert result.status == "completed"
    lines = [
        json.loads(line)
        for line in (
            root / "runs" / "resume-smoke" / "metrics.jsonl"
        ).read_text("utf8").splitlines()
    ]
    assert [line["step"] for line in lines] == [1, 2, 3]
    checkpoint = json.loads(
        (root / "runs" / "resume-smoke" / "checkpoint.json").read_text(
            "utf8"
        )
    )
    assert checkpoint["completed_steps"] == 3
    assert checkpoint["status"] == "completed"


def test_resume_rejects_a_changed_dataset_binding(tmp_path: Path) -> None:
    root = make_training_root(tmp_path)
    config = TrainingConfig(
        root=root,
        run_id="dataset-binding",
        steps=3,
        batch_size=2,
        learning_rate=0.001,
        device="cpu",
        seed=7101,
    )

    def stop_after_one(step: int) -> None:
        if step == 1:
            raise IntentionalStop

    with pytest.raises(IntentionalStop):
        train_model(config, after_step=stop_after_one)
    manifest = root / "dataset" / "manifest.json"
    manifest.write_text(manifest.read_text("utf8") + "\n", encoding="utf8")

    with pytest.raises(
        TrainingError,
        match="CHECKPOINT_DATASET_MISMATCH",
    ):
        train_model(config)


def test_training_configuration_rejects_invalid_values(tmp_path: Path) -> None:
    root = make_training_root(tmp_path)
    with pytest.raises(TrainingError, match="TRAINING_CONFIG_INVALID"):
        TrainingConfig(
            root=root,
            run_id="bad",
            steps=0,
            batch_size=2,
            learning_rate=0.001,
            device="cpu",
            seed=7101,
        )


def test_tiny_overfit_writes_a_failed_gate_instead_of_claiming_success(
    tmp_path: Path,
) -> None:
    root = make_training_root(tmp_path)
    config = TrainingConfig(
        root=root,
        run_id="tiny-one-step",
        steps=1,
        batch_size=2,
        learning_rate=0.001,
        device="cpu",
        seed=7101,
        tiny_overfit=True,
    )

    with pytest.raises(TrainingError, match="GATE1_FAILED"):
        train_model(config)

    run = root / "runs" / "tiny-one-step"
    gate = json.loads((run / "gate1.json").read_text("utf8"))
    checkpoint = json.loads((run / "checkpoint.json").read_text("utf8"))
    assert gate["passed"] is False
    assert checkpoint["status"] == "failed"
    assert checkpoint["completed_steps"] == 1
