from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

from mcagent_stage7.private_research_runtime import (
    MIN_AVAILABLE_BYTES,
    ResourceSample,
    RuntimeServices,
)
from mcagent_stage7.private_research_training import PrivateTrainConfig


REPO_ROOT = Path(__file__).resolve().parents[3]


def make_ready_private_root(
    name: str,
    *,
    case_count: int = 2,
    validation_count: int = 0,
) -> Path:
    root = REPO_ROOT / ".tmp" / ("stage7-private-v2-" + name)
    shutil.rmtree(root, ignore_errors=True)
    for directory in ("source", "manifests", "prepared", "splits", "runs"):
        (root / directory).mkdir(parents=True, exist_ok=True)
    (root / "PRIVATE_RESEARCH_ACK.json").write_text(
        json.dumps({
            "scope": "stage7-private-research-only",
            "distribution_prohibited": True,
            "dataset_v3_unchanged": True,
            "m4_apply_mode_unchanged": True,
            "acknowledged_at": "2026-07-16T00:00:00.000Z",
            "acknowledged_by": "synthetic-test-owner",
        }),
        encoding="utf8",
    )
    source_records: list[dict[str, object]] = []
    prepared_records: list[dict[str, object]] = []
    case_ids = [f"synthetic-v2-{index:02d}" for index in range(case_count)]
    for index, case_id in enumerate(case_ids):
        source_bytes = ("synthetic-v2-source-" + str(index)).encode("ascii")
        source_sha = hashlib.sha256(source_bytes).hexdigest()
        source_path = root / "source" / ("case-" + str(index) + ".schematic")
        source_path.write_bytes(source_bytes)
        voxels = bytes([(index % 8) + 1]) * (64**3)
        voxel_path = root / "prepared" / (case_id + ".voxels.bin")
        voxel_path.write_bytes(voxels)
        record = {
            "source_id": case_id,
            "source_sha256": source_sha,
            "taxonomy_version": "private-raw-material-family-v1",
            "shape": [64, 64, 64],
            "voxel_path": "prepared/" + case_id + ".voxels.bin",
            "metadata_path": "prepared/" + case_id + ".json",
            "voxel_sha256": hashlib.sha256(voxels).hexdigest(),
            "rights_state": "unverified",
            "distribution": "prohibited",
            "purpose": "local-private-research-only",
        }
        (root / "prepared" / (case_id + ".json")).write_text(
            json.dumps(record),
            encoding="utf8",
        )
        prepared_records.append(record)
        source_records.append({
            "source_id": case_id,
            "source_path": "source/case-" + str(index) + ".schematic",
            "content_sha256": source_sha,
            "rights_state": "unverified",
            "distribution": "prohibited",
            "purpose": "local-private-research-only",
        })
    (root / "manifests" / "sources.jsonl").write_text(
        "".join(json.dumps(record) + "\n" for record in source_records),
        encoding="utf8",
    )
    (root / "manifests" / "prepared.jsonl").write_text(
        "".join(json.dumps(record) + "\n" for record in prepared_records),
        encoding="utf8",
    )
    split_at = case_count - validation_count
    (root / "splits" / "split.json").write_text(
        json.dumps({
            "case_ids": case_ids,
            "train_case_ids": case_ids[:split_at],
            "validation_case_ids": case_ids[split_at:],
        }),
        encoding="utf8",
    )
    return root


def make_config(root: Path, run_id: str, *, steps: int) -> PrivateTrainConfig:
    return PrivateTrainConfig(
        root=root,
        repo_root=REPO_ROOT,
        seed=7101,
        steps=steps,
        batch_size=1,
        learning_rate=0.001,
        device="cpu",
        run_id=run_id,
        code_revision="a" * 40,
    )


def lightweight_services(**overrides: Any) -> RuntimeServices:
    values: dict[str, Any] = {
        "monotonic": lambda: 0.0,
        "wall_time": lambda: 1000.0,
        "sleep": lambda seconds: None,
        "resources": lambda: ResourceSample(
            rss_bytes=100 * 1024**2,
            swap_bytes=0,
            available_bytes=MIN_AVAILABLE_BYTES,
        ),
        "fault_hook": lambda stage: None,
        "after_step": lambda paths, step: None,
    }
    values.update(overrides)
    return RuntimeServices(**values)


def bypass_repository_identity(monkeypatch: Any) -> None:
    import mcagent_stage7.private_research_training as module

    monkeypatch.setattr(
        module,
        "require_repository_identity",
        lambda repo_root, code_revision: code_revision,
    )
    monkeypatch.setattr(
        module,
        "compute_training_code_sha256",
        lambda repo_root: "b" * 64,
    )
