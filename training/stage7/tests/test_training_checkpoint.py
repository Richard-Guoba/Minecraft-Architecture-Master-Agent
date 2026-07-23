from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
import torch

from mcagent_stage7.training_checkpoint import (
    TrainingCheckpointBinding,
    load_training_checkpoint,
    save_training_checkpoint,
)
from mcagent_stage7.training_data import TrainingError
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


def _binding(root: Path) -> TrainingCheckpointBinding:
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
    )
