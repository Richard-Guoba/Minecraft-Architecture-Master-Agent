from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pytest
import torch

from mcagent_stage7.training_data import (
    MASK_TOKEN,
    PATCH_SHAPE,
    TrainingError,
    TrainingPatchDataset,
    make_balanced_mask,
)


def test_dataset_loads_a_valid_train_patch_and_balances_the_mask(
    tmp_path: Path,
) -> None:
    root = _dataset_root(tmp_path)
    dataset = TrainingPatchDataset(root, split="train", seed=7101)

    target = dataset[0]
    visible, mask = make_balanced_mask(target.unsqueeze(0), seed=7101)

    assert len(dataset) == 1
    assert dataset.sample_ids == ("sample-a",)
    assert target.dtype == torch.long
    assert target.shape == PATCH_SHAPE
    assert visible.shape == target.unsqueeze(0).shape
    assert mask.shape == target.unsqueeze(0).shape
    assert mask.dtype == torch.bool
    assert torch.any(mask & (target.unsqueeze(0) == 0))
    assert torch.any(mask & (target.unsqueeze(0) != 0))
    assert torch.all(visible[mask] == MASK_TOKEN)
    assert torch.equal(visible[~mask], target.unsqueeze(0)[~mask])
    assert torch.equal(
        make_balanced_mask(target.unsqueeze(0), seed=7101)[1],
        mask,
    )
    assert int((mask & (target.unsqueeze(0) == 0)).sum()) == int(
        (mask & (target.unsqueeze(0) != 0)).sum()
    )


@pytest.mark.parametrize(
    ("mutation", "code"),
    [
        ("wrong_length", "SAMPLE_LENGTH_INVALID"),
        ("hash_mismatch", "SAMPLE_HASH_MISMATCH"),
        ("token_out_of_range", "SAMPLE_TOKEN_INVALID"),
        ("no_non_air", "SAMPLE_NON_AIR_MISSING"),
    ],
)
def test_dataset_rejects_invalid_sample_bytes(
    tmp_path: Path,
    mutation: str,
    code: str,
) -> None:
    root = _dataset_root(tmp_path)
    path = root / "dataset" / "samples" / "sample-a.bin"
    values = bytearray(path.read_bytes())
    if mutation == "wrong_length":
        path.write_bytes(values[:-1])
    elif mutation == "hash_mismatch":
        values[-1] = 2
        path.write_bytes(values)
    elif mutation == "token_out_of_range":
        values[0] = 10
        path.write_bytes(values)
        _update_sample_hash(root, values)
    else:
        values[:] = bytes(len(values))
        path.write_bytes(values)
        _update_sample_hash(root, values, non_air_count=0)

    dataset = TrainingPatchDataset(root, split="train", seed=7101)
    with pytest.raises(TrainingError, match=code) as captured:
        _ = dataset[0]
    assert captured.value.code == code


def test_dataset_rejects_a_sample_path_escape(tmp_path: Path) -> None:
    root = _dataset_root(tmp_path)
    manifest = _read_json(root / "dataset" / "manifest.json")
    manifest["samples"][0]["file"] = "../outside.bin"
    _write_json(root / "dataset" / "manifest.json", manifest)

    with pytest.raises(TrainingError, match="SAMPLE_PATH_INVALID") as captured:
        TrainingPatchDataset(root, split="train", seed=7101)
    assert captured.value.code == "SAMPLE_PATH_INVALID"


def test_dataset_rejects_source_split_leakage(tmp_path: Path) -> None:
    root = _dataset_root(tmp_path)
    split = _read_json(root / "splits" / "split.json")
    split["validation_source_ids"].append("source-a")
    _write_json(root / "splits" / "split.json", split)

    with pytest.raises(TrainingError, match="SPLIT_LEAKAGE") as captured:
        TrainingPatchDataset(root, split="train", seed=7101)
    assert captured.value.code == "SPLIT_LEAKAGE"


def test_dataset_rejects_manifest_and_assignment_mismatches(
    tmp_path: Path,
) -> None:
    root = _dataset_root(tmp_path)
    manifest = _read_json(root / "dataset" / "manifest.json")
    manifest["source"] = "retired-dataset"
    _write_json(root / "dataset" / "manifest.json", manifest)
    with pytest.raises(TrainingError, match="MANIFEST_SOURCE_INVALID"):
        TrainingPatchDataset(root, split="train", seed=7101)

    root = _dataset_root(tmp_path / "assignment")
    manifest = _read_json(root / "dataset" / "manifest.json")
    manifest["samples"][0]["split"] = "validation"
    _write_json(root / "dataset" / "manifest.json", manifest)
    with pytest.raises(TrainingError, match="SAMPLE_SPLIT_MISMATCH"):
        TrainingPatchDataset(root, split="train", seed=7101)


def test_balanced_mask_requires_non_air_supervision() -> None:
    all_air = torch.zeros((1, *PATCH_SHAPE), dtype=torch.long)
    with pytest.raises(TrainingError, match="MASK_CLASS_MISSING"):
        make_balanced_mask(all_air, seed=7101)


def test_balanced_mask_accepts_a_fully_occupied_patch() -> None:
    target = torch.full((1, *PATCH_SHAPE), 2, dtype=torch.long)

    visible, mask = make_balanced_mask(target, seed=7101)

    assert int(mask.sum()) == int(0.25 * np.prod(PATCH_SHAPE))
    assert torch.all(visible[mask] == MASK_TOKEN)
    assert torch.equal(visible[~mask], target[~mask])


def _dataset_root(tmp_path: Path) -> Path:
    root = tmp_path / "training"
    samples = root / "dataset" / "samples"
    samples.mkdir(parents=True)
    (root / "splits").mkdir()
    values = np.zeros(PATCH_SHAPE, dtype=np.uint8)
    values[0, 0, 0] = 2
    values[1, 1, 1] = 3
    values[2, 2, 2] = 4
    payload = values.tobytes()
    (samples / "sample-a.bin").write_bytes(payload)
    counts = np.bincount(values.reshape(-1), minlength=9).tolist()
    manifest = {
        "source": "minecraft-architecture-training-dataset-v1",
        "preparation_version": "training-voxel-preparation-v1",
        "token_names": [
            "air",
            "earth",
            "rock",
            "wood",
            "glass",
            "architectural-shape",
            "detail",
            "water",
            "other",
        ],
        "patch_shape": list(PATCH_SHAPE),
        "patch_stride": 16,
        "seed": 7101,
        "sources": [
            {"source_id": "source-a", "split": "train"},
            {"source_id": "source-b", "split": "validation"},
            {"source_id": "source-c", "split": "test"},
        ],
        "samples": [
            {
                "file": "dataset/samples/sample-a.bin",
                "sample_id": "sample-a",
                "source_id": "source-a",
                "split": "train",
                "sha256": hashlib.sha256(payload).hexdigest(),
                "shape": list(PATCH_SHAPE),
                "token_counts": counts,
                "non_air_count": 3,
                "origin": {"x": 0, "y": 0, "z": 0},
            }
        ],
    }
    split = {
        "seed": 7101,
        "train_source_ids": ["source-a"],
        "validation_source_ids": ["source-b"],
        "test_source_ids": ["source-c"],
        "assignments": {
            "source-a": "train",
            "source-b": "validation",
            "source-c": "test",
        },
    }
    _write_json(root / "dataset" / "manifest.json", manifest)
    _write_json(root / "splits" / "split.json", split)
    return root


def _update_sample_hash(
    root: Path,
    payload: bytes | bytearray,
    *,
    non_air_count: int | None = None,
) -> None:
    manifest_path = root / "dataset" / "manifest.json"
    manifest = _read_json(manifest_path)
    manifest["samples"][0]["sha256"] = hashlib.sha256(payload).hexdigest()
    if non_air_count is not None:
        manifest["samples"][0]["non_air_count"] = non_air_count
        manifest["samples"][0]["token_counts"] = [
            len(payload),
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
        ]
    _write_json(manifest_path, manifest)


def _read_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf8"))


def _write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, sort_keys=True, indent=2) + "\n",
        encoding="utf8",
    )
