from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

import mcagent_stage7.training_loop as training_loop
from mcagent_stage7.training_data import TrainingError
from mcagent_stage7.training_loop import TrainingConfig, train_model
from training_test_support import make_training_root, write_json


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


def test_default_training_records_the_none_objective_binding(
    tmp_path: Path,
) -> None:
    root = make_training_root(tmp_path)

    result = train_model(
        TrainingConfig(
            root=root,
            run_id="default-balance",
            steps=1,
            device="cpu",
        )
    )

    metadata = json.loads(
        (result.run_path / "checkpoint.json").read_text("utf8")
    )
    assert metadata["objective_version"] == "semantic-balance-v2"
    assert metadata["semantic_balance"] == "none"
    assert metadata["semantic_class_weights"] == [1.0] * 8
    assert len(metadata["semantic_class_weights_sha256"]) == 64


def test_weighted_training_records_train_derived_weights(
    tmp_path: Path,
) -> None:
    root = _imbalanced_training_root(tmp_path)

    result = train_model(
        TrainingConfig(
            root=root,
            run_id="weighted-balance",
            steps=1,
            device="cpu",
            semantic_balance="weighted",
        )
    )

    metadata = json.loads(
        (result.run_path / "checkpoint.json").read_text("utf8")
    )
    assert metadata["semantic_balance"] == "weighted"
    assert metadata["semantic_class_weights"] == [
        4.0,
        1.0,
        1.0,
        1.0,
        1.0,
        1.0,
        1.0,
        1.0,
    ]


def test_weighted_mask_training_uses_the_class_aware_strategy(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = _imbalanced_training_root(tmp_path)
    strategies: list[str] = []
    real_make_balanced_mask = training_loop.make_balanced_mask

    def recording_mask(*args: object, **kwargs: object):
        strategies.append(str(kwargs.get("semantic_balance")))
        return real_make_balanced_mask(*args, **kwargs)

    monkeypatch.setattr(
        training_loop,
        "make_balanced_mask",
        recording_mask,
    )

    train_model(
        TrainingConfig(
            root=root,
            run_id="weighted-mask-balance",
            steps=1,
            device="cpu",
            semantic_balance="weighted-mask",
        )
    )

    assert strategies == ["weighted-mask"]


def test_balanced_training_rejects_missing_train_class_support(
    tmp_path: Path,
) -> None:
    root = make_training_root(tmp_path)

    with pytest.raises(
        TrainingError,
        match="SEMANTIC_CLASS_SUPPORT_MISSING",
    ):
        train_model(
            TrainingConfig(
                root=root,
                run_id="missing-support",
                steps=1,
                device="cpu",
                semantic_balance="weighted",
            )
        )
    assert not (root / "runs" / "missing-support").exists()


def test_resume_rejects_a_changed_semantic_profile(
    tmp_path: Path,
) -> None:
    root = _imbalanced_training_root(tmp_path)
    weighted = TrainingConfig(
        root=root,
        run_id="profile-binding",
        steps=1,
        device="cpu",
        semantic_balance="weighted",
    )
    train_model(weighted)

    with pytest.raises(
        TrainingError,
        match="CHECKPOINT_CONFIG_MISMATCH",
    ):
        train_model(
            TrainingConfig(
                root=root,
                run_id="profile-binding",
                steps=1,
                device="cpu",
                semantic_balance="weighted-mask",
            )
        )


def _imbalanced_training_root(tmp_path: Path) -> Path:
    root = make_training_root(tmp_path, train_count=8)
    manifest_path = root / "dataset" / "manifest.json"
    manifest = json.loads(manifest_path.read_text("utf8"))
    sample = next(
        value
        for value in manifest["samples"]
        if value["split"] == "train"
        and value["token_counts"][1] > 0
    )
    sample_path = root / sample["file"]
    payload = bytearray(sample_path.read_bytes())
    positions = [
        index
        for index, value in enumerate(payload)
        if value == 1
    ]
    for index in positions[1:]:
        payload[index] = 0
    sample_path.write_bytes(payload)
    removed = len(positions) - 1
    sample["sha256"] = hashlib.sha256(payload).hexdigest()
    sample["token_counts"][0] += removed
    sample["token_counts"][1] = 1
    sample["non_air_count"] -= removed
    write_json(manifest_path, manifest)
    return root
