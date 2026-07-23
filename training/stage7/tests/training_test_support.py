from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np

from mcagent_stage7.training_data import PATCH_SHAPE


def make_training_root(tmp_path: Path, train_count: int = 4) -> Path:
    root = tmp_path / "training"
    samples_directory = root / "dataset" / "samples"
    samples_directory.mkdir(parents=True)
    (root / "splits").mkdir()
    source_splits = {
        **{f"source-train-{index}": "train" for index in range(train_count)},
        "source-validation": "validation",
        "source-test": "test",
    }
    samples = []
    for index, (source_id, split) in enumerate(source_splits.items()):
        sample_id = f"sample-{split}-{index}"
        values = np.zeros(PATCH_SHAPE, dtype=np.uint8)
        token = index % 8 + 1
        values[
            2 + index % 3 : 8 + index % 3,
            3:9,
            4:10,
        ] = token
        payload = values.tobytes()
        (samples_directory / f"{sample_id}.bin").write_bytes(payload)
        counts = np.bincount(values.reshape(-1), minlength=9).tolist()
        samples.append(
            {
                "file": f"dataset/samples/{sample_id}.bin",
                "sample_id": sample_id,
                "source_id": source_id,
                "split": split,
                "sha256": hashlib.sha256(payload).hexdigest(),
                "shape": list(PATCH_SHAPE),
                "token_counts": counts,
                "non_air_count": int(sum(counts[1:])),
                "origin": {"x": 0, "y": 0, "z": 0},
            }
        )
    assignments = dict(sorted(source_splits.items()))
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
            {"source_id": source_id, "split": split}
            for source_id, split in assignments.items()
        ],
        "samples": sorted(samples, key=lambda sample: sample["sample_id"]),
    }
    split = {
        "seed": 7101,
        "train_source_ids": sorted(
            source_id
            for source_id, value in assignments.items()
            if value == "train"
        ),
        "validation_source_ids": ["source-validation"],
        "test_source_ids": ["source-test"],
        "assignments": assignments,
    }
    write_json(root / "dataset" / "manifest.json", manifest)
    write_json(root / "splits" / "split.json", split)
    return root


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, sort_keys=True, indent=2) + "\n",
        encoding="utf8",
    )
