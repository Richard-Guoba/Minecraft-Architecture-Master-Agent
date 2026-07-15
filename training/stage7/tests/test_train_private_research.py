from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import pytest

from mcagent_stage7.private_research import PrivateResearchError
from mcagent_stage7.train_private_research import PrivateTrainConfig, train_private_research


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_one_step_private_smoke_run_writes_only_private_non_distributable_artifacts() -> None:
    root = make_ready_private_root()

    artifacts = train_private_research(
        PrivateTrainConfig(
            root=root,
            repo_root=REPO_ROOT,
            seed=7101,
            steps=1,
            batch_size=2,
            learning_rate=1e-3,
            device="cpu",
            run_id="smoke",
            code_revision="test",
        )
    )

    assert artifacts.checkpoint_path.is_relative_to(root / "runs")
    assert artifacts.manifest["training_scope"] == "private-research-only"
    assert artifacts.manifest["distribution"] == "prohibited"
    assert artifacts.manifest["config"]["batch_size"] == 2
    assert artifacts.final_loss > 0
    assert (root / "runs" / "smoke" / "reconstruction.bin").stat().st_size == 64 ** 3


def test_trainer_refuses_output_outside_private_root() -> None:
    root = make_ready_private_root()
    config = PrivateTrainConfig(
        root=root,
        repo_root=REPO_ROOT,
        seed=7101,
        steps=1,
        batch_size=1,
        learning_rate=1e-3,
        device="cpu",
        run_id="../escape",
        code_revision="test",
    )

    with pytest.raises(PrivateResearchError, match="RUN_ID_INVALID|PATH_OUTSIDE_PRIVATE_ROOT"):
        train_private_research(config)


def make_ready_private_root() -> Path:
    root = REPO_ROOT / ".tmp" / "stage7-private-research-trainer-test"
    shutil.rmtree(root, ignore_errors=True)
    for name in ("source", "manifests", "prepared", "splits", "runs"):
        (root / name).mkdir(parents=True, exist_ok=True)
    (root / "PRIVATE_RESEARCH_ACK.json").write_text(json.dumps({
        "scope": "stage7-private-research-only", "distribution_prohibited": True,
        "dataset_v3_unchanged": True, "m4_apply_mode_unchanged": True,
        "acknowledged_at": "2026-07-15T00:00:00.000Z", "acknowledged_by": "test-owner",
    }))
    records = []
    source_records = []
    for index in range(2):
        case_id = f"pr-test-{index}"
        source_path = root / "source" / f"test-{index}.schematic"
        source_bytes = f"synthetic-private-source-{index}".encode("ascii")
        source_path.write_bytes(source_bytes)
        source_sha = hashlib.sha256(source_bytes).hexdigest()
        voxels = bytes([index + 1]) * (64 ** 3)
        voxel_path = root / "prepared" / f"{case_id}.voxels.bin"
        voxel_path.write_bytes(voxels)
        record = {
            "source_id": case_id, "source_sha256": source_sha,
            "taxonomy_version": "private-raw-material-family-v1", "shape": [64, 64, 64],
            "voxel_path": f"prepared/{case_id}.voxels.bin", "metadata_path": f"prepared/{case_id}.json",
            "voxel_sha256": hashlib.sha256(voxels).hexdigest(), "rights_state": "unverified",
            "distribution": "prohibited", "purpose": "local-private-research-only",
        }
        (root / "prepared" / f"{case_id}.json").write_text(json.dumps(record))
        records.append(record)
        source_records.append({
            "source_id": case_id, "source_path": f"source/test-{index}.schematic",
            "content_sha256": source_sha, "rights_state": "unverified", "distribution": "prohibited",
            "purpose": "local-private-research-only",
        })
    (root / "manifests" / "sources.jsonl").write_text("".join(json.dumps(record) + "\n" for record in source_records))
    (root / "manifests" / "prepared.jsonl").write_text("".join(json.dumps(record) + "\n" for record in records))
    (root / "splits" / "split.json").write_text(json.dumps({
        "case_ids": ["pr-test-0", "pr-test-1"], "train_case_ids": ["pr-test-0", "pr-test-1"],
        "validation_case_ids": [],
    }))
    return root
