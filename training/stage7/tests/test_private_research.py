from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import torch

from mcagent_stage7.private_research import (
    PrivatePreparedDataset,
    run_private_preflight,
    make_masked_batch,
)


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_masked_batch_is_deterministic_and_never_empty() -> None:
    targets = torch.zeros((1, 64, 64, 64), dtype=torch.long)

    visible_a, mask_a = make_masked_batch(targets, seed=7101)
    visible_b, mask_b = make_masked_batch(targets, seed=7101)

    assert mask_a.any()
    assert torch.equal(mask_a, mask_b)
    assert torch.equal(visible_a, visible_b)
    assert torch.equal(visible_a[mask_a], torch.full_like(visible_a[mask_a], 9))


def test_private_preflight_loads_hash_bound_train_case_from_ignored_root() -> None:
    root = make_ready_private_root()

    preflight = run_private_preflight(root=root, repo_root=REPO_ROOT)
    dataset = PrivatePreparedDataset(root=root, split="train", seed=7101)
    targets, visible, mask = dataset[0]

    assert preflight.case_count == 1
    assert preflight.dataset_v3_gate == {"ready_for_m3_real_data": False, "training_eligible_count": 0}
    assert targets.shape == visible.shape == mask.shape == (64, 64, 64)
    assert mask.any() and int(visible[mask][0]) == 9


def make_ready_private_root() -> Path:
    root = REPO_ROOT / ".tmp" / "stage7-private-research-python-test"
    shutil.rmtree(root, ignore_errors=True)
    for name in ("source", "manifests", "prepared", "splits", "runs"):
        (root / name).mkdir(parents=True, exist_ok=True)
    (root / "PRIVATE_RESEARCH_ACK.json").write_text(json.dumps({
        "scope": "stage7-private-research-only", "distribution_prohibited": True,
        "dataset_v3_unchanged": True, "m4_apply_mode_unchanged": True,
        "acknowledged_at": "2026-07-15T00:00:00.000Z", "acknowledged_by": "test-owner",
    }))
    source_bytes = b"synthetic-private-source-for-contract-test"
    source_sha = hashlib.sha256(source_bytes).hexdigest()
    (root / "source" / "test.schematic").write_bytes(source_bytes)
    voxels = bytes(64 ** 3)
    voxel_sha = hashlib.sha256(voxels).hexdigest()
    (root / "prepared" / "pr-test.voxels.bin").write_bytes(voxels)
    metadata = {"source_id": "pr-test", "source_sha256": source_sha, "taxonomy_version": "private-raw-material-family-v1", "shape": [64, 64, 64], "voxel_path": "prepared/pr-test.voxels.bin", "metadata_path": "prepared/pr-test.json", "voxel_sha256": voxel_sha, "rights_state": "unverified", "distribution": "prohibited", "purpose": "local-private-research-only"}
    (root / "prepared" / "pr-test.json").write_text(json.dumps(metadata))
    (root / "manifests" / "sources.jsonl").write_text(json.dumps({"source_id": "pr-test", "source_path": "source/test.schematic", "content_sha256": source_sha, "rights_state": "unverified", "distribution": "prohibited", "purpose": "local-private-research-only"}) + "\n")
    (root / "manifests" / "prepared.jsonl").write_text(json.dumps(metadata) + "\n")
    (root / "splits" / "split.json").write_text(json.dumps({"case_ids": ["pr-test"], "train_case_ids": ["pr-test"], "validation_case_ids": []}))
    return root
