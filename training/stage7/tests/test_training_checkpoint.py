from __future__ import annotations

import hashlib
import json
from dataclasses import replace
from pathlib import Path

import pytest
import torch

import mcagent_stage7.training_checkpoint as checkpoint_module
from mcagent_stage7.training_checkpoint import (
    TrainingCheckpointBinding,
    load_training_checkpoint,
    save_training_checkpoint,
)
from mcagent_stage7.training_data import TrainingError
from mcagent_stage7.semantic_balance import (
    OBJECTIVE_VERSION,
    semantic_class_weights_sha256,
)
from mcagent_stage7.voxel_model import TinyVoxelCompletionModel
from training_test_support import make_training_root, write_json


def test_checkpoint_round_trip_uses_weights_only_and_binds_the_dataset(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = make_training_root(tmp_path)
    model = TinyVoxelCompletionModel()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    binding = _binding(root)
    save_training_checkpoint(
        root=root,
        binding=binding,
        model=model,
        optimizer=optimizer,
        completed_steps=2,
        status="running",
    )
    calls: list[bool] = []
    original_load = torch.load

    def recorded_load(*args: object, **kwargs: object) -> object:
        calls.append(kwargs.get("weights_only") is True)
        return original_load(*args, **kwargs)

    monkeypatch.setattr(torch, "load", recorded_load)
    loaded_model = TinyVoxelCompletionModel()
    loaded_optimizer = torch.optim.Adam(loaded_model.parameters(), lr=0.001)
    loaded = load_training_checkpoint(
        root=root,
        binding=binding,
        model=loaded_model,
        optimizer=loaded_optimizer,
    )

    assert calls == [True]
    assert loaded.completed_steps == 2
    assert loaded.status == "running"
    metadata = json.loads(
        (
            root
            / "runs"
            / binding.run_id
            / "checkpoint.json"
        ).read_text("utf8")
    )
    assert metadata["objective_version"] == OBJECTIVE_VERSION
    assert metadata["semantic_balance"] == "none"
    assert metadata["semantic_class_weights"] == [1.0] * 8
    assert metadata["semantic_class_weights_sha256"] == (
        semantic_class_weights_sha256((1.0,) * 8)
    )
    assert checkpoint_module.binding_from_checkpoint_metadata(
        metadata
    ) == binding
    assert all(
        torch.equal(left, right)
        for left, right in zip(
            model.state_dict().values(),
            loaded_model.state_dict().values(),
            strict=True,
        )
    )


@pytest.mark.parametrize(
    ("mutation", "code"),
    [
        ("nan", "CHECKPOINT_PARAMETER_NONFINITE"),
        ("shape", "CHECKPOINT_PARAMETER_SHAPE"),
    ],
)
def test_checkpoint_loading_rejects_invalid_parameters(
    tmp_path: Path,
    mutation: str,
    code: str,
) -> None:
    root = make_training_root(tmp_path)
    model = TinyVoxelCompletionModel()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    binding = _binding(root)
    save_training_checkpoint(
        root=root,
        binding=binding,
        model=model,
        optimizer=optimizer,
        completed_steps=1,
        status="running",
    )
    run = root / "runs" / binding.run_id
    checkpoint_path = run / "checkpoint.pt"
    payload = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    key = next(iter(payload["model_state"]))
    if mutation == "nan":
        payload["model_state"][key].reshape(-1)[0] = float("nan")
    else:
        payload["model_state"][key] = payload["model_state"][key].reshape(-1)
    torch.save(payload, checkpoint_path)
    metadata = json.loads((run / "checkpoint.json").read_text("utf8"))
    metadata["checkpoint_sha256"] = hashlib.sha256(
        checkpoint_path.read_bytes()
    ).hexdigest()
    write_json(run / "checkpoint.json", metadata)

    with pytest.raises(TrainingError, match=code) as captured:
        load_training_checkpoint(
            root=root,
            binding=binding,
            model=TinyVoxelCompletionModel(),
            optimizer=None,
        )
    assert captured.value.code == code


def test_checkpoint_rejects_hash_mismatch_and_path_escape(
    tmp_path: Path,
) -> None:
    root = make_training_root(tmp_path)
    model = TinyVoxelCompletionModel()
    binding = _binding(root)
    save_training_checkpoint(
        root=root,
        binding=binding,
        model=model,
        optimizer=torch.optim.Adam(model.parameters(), lr=0.001),
        completed_steps=1,
        status="running",
    )
    checkpoint = root / "runs" / binding.run_id / "checkpoint.pt"
    checkpoint.write_bytes(checkpoint.read_bytes() + b"changed")
    with pytest.raises(TrainingError, match="CHECKPOINT_HASH_MISMATCH"):
        load_training_checkpoint(
            root=root,
            binding=binding,
            model=TinyVoxelCompletionModel(),
            optimizer=None,
        )

    with pytest.raises(TrainingError, match="RUN_ID_INVALID"):
        TrainingCheckpointBinding(
            **{**binding.__dict__, "run_id": "../escape"}
        )


def test_checkpoint_rejects_changed_semantic_binding(
    tmp_path: Path,
) -> None:
    root = make_training_root(tmp_path)
    model = TinyVoxelCompletionModel()
    binding = _binding(root)
    save_training_checkpoint(
        root=root,
        binding=binding,
        model=model,
        optimizer=torch.optim.Adam(model.parameters(), lr=0.001),
        completed_steps=1,
        status="running",
    )

    with pytest.raises(
        TrainingError,
        match="CHECKPOINT_CONFIG_MISMATCH",
    ):
        load_training_checkpoint(
            root=root,
            binding=replace(binding, semantic_balance="weighted"),
            model=TinyVoxelCompletionModel(),
            optimizer=None,
        )

    weighted_binding = replace(
        binding,
        run_id="checkpoint-weighted",
        semantic_balance="weighted",
    )
    save_training_checkpoint(
        root=root,
        binding=weighted_binding,
        model=model,
        optimizer=torch.optim.Adam(model.parameters(), lr=0.001),
        completed_steps=1,
        status="running",
    )
    changed_weights = (2.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0)
    with pytest.raises(
        TrainingError,
        match="CHECKPOINT_CONFIG_MISMATCH",
    ):
        load_training_checkpoint(
            root=root,
            binding=replace(
                weighted_binding,
                semantic_class_weights=changed_weights,
                semantic_class_weights_sha256=(
                    semantic_class_weights_sha256(changed_weights)
                ),
            ),
            model=TinyVoxelCompletionModel(),
            optimizer=None,
        )


def test_checkpoint_rejects_a_tampered_semantic_weight_digest(
    tmp_path: Path,
) -> None:
    root = make_training_root(tmp_path)
    model = TinyVoxelCompletionModel()
    binding = _binding(root)
    save_training_checkpoint(
        root=root,
        binding=binding,
        model=model,
        optimizer=torch.optim.Adam(model.parameters(), lr=0.001),
        completed_steps=1,
        status="running",
    )
    metadata_path = root / "runs" / binding.run_id / "checkpoint.json"
    metadata = json.loads(metadata_path.read_text("utf8"))
    metadata["semantic_class_weights_sha256"] = "0" * 64
    write_json(metadata_path, metadata)

    with pytest.raises(
        TrainingError,
        match="SEMANTIC_CLASS_WEIGHTS_DIGEST_MISMATCH",
    ):
        load_training_checkpoint(
            root=root,
            binding=binding,
            model=TinyVoxelCompletionModel(),
            optimizer=None,
        )


def test_legacy_checkpoint_metadata_loads_only_for_none(
    tmp_path: Path,
) -> None:
    root = make_training_root(tmp_path)
    model = TinyVoxelCompletionModel()
    binding = _binding(root)
    save_training_checkpoint(
        root=root,
        binding=binding,
        model=model,
        optimizer=torch.optim.Adam(model.parameters(), lr=0.001),
        completed_steps=1,
        status="running",
    )
    metadata_path = root / "runs" / binding.run_id / "checkpoint.json"
    metadata = json.loads(metadata_path.read_text("utf8"))
    for key in (
        "objective_version",
        "semantic_balance",
        "semantic_class_weights",
        "semantic_class_weights_sha256",
    ):
        del metadata[key]
    write_json(metadata_path, metadata)

    loaded = load_training_checkpoint(
        root=root,
        binding=binding,
        model=TinyVoxelCompletionModel(),
        optimizer=None,
    )
    assert loaded.completed_steps == 1

    with pytest.raises(
        TrainingError,
        match="CHECKPOINT_CONFIG_MISMATCH",
    ):
        load_training_checkpoint(
            root=root,
            binding=replace(binding, semantic_balance="weighted"),
            model=TinyVoxelCompletionModel(),
            optimizer=None,
        )


def test_partially_present_semantic_metadata_is_rejected(
    tmp_path: Path,
) -> None:
    root = make_training_root(tmp_path)
    model = TinyVoxelCompletionModel()
    binding = _binding(root)
    save_training_checkpoint(
        root=root,
        binding=binding,
        model=model,
        optimizer=torch.optim.Adam(model.parameters(), lr=0.001),
        completed_steps=1,
        status="running",
    )
    metadata_path = root / "runs" / binding.run_id / "checkpoint.json"
    metadata = json.loads(metadata_path.read_text("utf8"))
    del metadata["semantic_class_weights_sha256"]
    write_json(metadata_path, metadata)

    with pytest.raises(
        TrainingError,
        match="CHECKPOINT_METADATA_INVALID",
    ):
        load_training_checkpoint(
            root=root,
            binding=binding,
            model=TinyVoxelCompletionModel(),
            optimizer=None,
        )


def _binding(root: Path) -> TrainingCheckpointBinding:
    weights = (1.0,) * 8
    return TrainingCheckpointBinding(
        run_id="checkpoint-test",
        target_steps=3,
        seed=7101,
        device="cpu",
        batch_size=2,
        learning_rate=0.001,
        dataset_manifest_sha256=hashlib.sha256(
            (root / "dataset" / "manifest.json").read_bytes()
        ).hexdigest(),
        split_sha256=hashlib.sha256(
            (root / "splits" / "split.json").read_bytes()
        ).hexdigest(),
        objective_version=OBJECTIVE_VERSION,
        semantic_balance="none",
        semantic_class_weights=weights,
        semantic_class_weights_sha256=(
            semantic_class_weights_sha256(weights)
        ),
    )
