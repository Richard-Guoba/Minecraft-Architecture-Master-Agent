from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import pytest
import torch

from mcagent_stage7.evaluate_private_research import (
    PrivateEvaluationConfig,
    evaluate_private_research,
)
from mcagent_stage7.private_research import PrivateResearchError, run_private_preflight
from mcagent_stage7.private_research_checkpoints import save_private_checkpoint
from mcagent_stage7.private_research_model import TinyMaskedVoxelAutoencoder


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_evaluator_writes_one_aggregate_report_for_exactly_35_evaluations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = make_ready_evaluation_root()

    def fast_forward(
        self: TinyMaskedVoxelAutoencoder,
        visible: torch.Tensor,
    ) -> torch.Tensor:
        logits = torch.zeros(
            (visible.shape[0], 9, 64, 64, 64),
            dtype=torch.float32,
            device=visible.device,
        )
        logits[:, 1] = 1.0
        return logits

    monkeypatch.setattr(TinyMaskedVoxelAutoencoder, "forward", fast_forward)
    artifacts = evaluate_private_research(
        PrivateEvaluationConfig(
            root=root,
            repo_root=REPO_ROOT,
            run_id="quality",
            seed=7101,
            mask_repeats=5,
            mask_ratio=0.25,
            device="cpu",
        )
    )

    report_text = artifacts.report_path.read_text("utf8")
    report = json.loads(report_text)
    assert artifacts.report_path == root / "runs" / "quality" / "evaluation.json"
    assert report["training_scope"] == "private-research-only"
    assert report["distribution"] == "prohibited"
    assert report["evaluation_config"]["evaluated_case_count"] == 7
    assert report["evaluation_config"]["completed_evaluations"] == 35
    assert set(report["metrics"]) == {"trained", "untrained", "class_prior"}
    assert {entry.name for entry in (root / "runs" / "quality").iterdir()} == {
        "metrics.jsonl",
        "reconstruction.bin",
        "checkpoint.pt",
        "checkpoint_manifest.json",
        "evaluation.json",
    }
    assert "pr-eval" not in report_text
    assert str(root) not in report_text


def test_evaluator_refuses_to_overwrite_an_evaluation() -> None:
    root = make_ready_evaluation_root()
    report = root / "runs" / "quality" / "evaluation.json"
    report.write_text("{}", encoding="utf8")
    with pytest.raises(PrivateResearchError, match="EVALUATION_EXISTS"):
        evaluate_private_research(
            PrivateEvaluationConfig(
                root=root,
                repo_root=REPO_ROOT,
                run_id="quality",
            )
        )


def test_evaluator_refuses_an_extra_training_artifact() -> None:
    root = make_ready_evaluation_root()
    (root / "runs" / "quality" / "extra.log").write_text(
        "unexpected",
        encoding="utf8",
    )
    with pytest.raises(PrivateResearchError, match="RUN_ARTIFACT_INVALID"):
        evaluate_private_research(
            PrivateEvaluationConfig(
                root=root,
                repo_root=REPO_ROOT,
                run_id="quality",
            )
        )


def test_evaluator_refuses_a_symlinked_run_directory() -> None:
    root = make_ready_evaluation_root()
    (root / "runs" / "alias").symlink_to(
        root / "runs" / "quality",
        target_is_directory=True,
    )
    with pytest.raises(PrivateResearchError, match="PATH_MISSING"):
        evaluate_private_research(
            PrivateEvaluationConfig(
                root=root,
                repo_root=REPO_ROOT,
                run_id="alias",
            )
        )


def make_ready_evaluation_root() -> Path:
    root = REPO_ROOT / ".tmp" / "stage7-private-evaluation-test"
    shutil.rmtree(root, ignore_errors=True)
    for name in ("source", "manifests", "prepared", "splits", "runs"):
        (root / name).mkdir(parents=True, exist_ok=True)
    (root / "PRIVATE_RESEARCH_ACK.json").write_text(
        json.dumps(
            {
                "scope": "stage7-private-research-only",
                "distribution_prohibited": True,
                "dataset_v3_unchanged": True,
                "m4_apply_mode_unchanged": True,
                "acknowledged_at": "2026-07-15T00:00:00.000Z",
                "acknowledged_by": "test-owner",
            }
        ),
        encoding="utf8",
    )
    source_records: list[dict[str, object]] = []
    prepared_records: list[dict[str, object]] = []
    case_ids = [f"pr-eval-{index:02d}" for index in range(22)]
    for index, case_id in enumerate(case_ids):
        source_bytes = f"synthetic-evaluation-source-{index}".encode("ascii")
        source_sha = hashlib.sha256(source_bytes).hexdigest()
        source_path = root / "source" / f"case-{index:02d}.schematic"
        source_path.write_bytes(source_bytes)
        voxels = bytes([(index % 8) + 1]) * (64**3)
        voxel_path = root / "prepared" / f"{case_id}.voxels.bin"
        voxel_path.write_bytes(voxels)
        record = {
            "source_id": case_id,
            "source_sha256": source_sha,
            "taxonomy_version": "private-raw-material-family-v1",
            "shape": [64, 64, 64],
            "voxel_path": f"prepared/{case_id}.voxels.bin",
            "metadata_path": f"prepared/{case_id}.json",
            "voxel_sha256": hashlib.sha256(voxels).hexdigest(),
            "rights_state": "unverified",
            "distribution": "prohibited",
            "purpose": "local-private-research-only",
        }
        (root / "prepared" / f"{case_id}.json").write_text(
            json.dumps(record),
            encoding="utf8",
        )
        prepared_records.append(record)
        source_records.append(
            {
                "source_id": case_id,
                "source_path": f"source/case-{index:02d}.schematic",
                "content_sha256": source_sha,
                "rights_state": "unverified",
                "distribution": "prohibited",
                "purpose": "local-private-research-only",
            }
        )
    (root / "manifests" / "sources.jsonl").write_text(
        "".join(json.dumps(record) + "\n" for record in source_records),
        encoding="utf8",
    )
    (root / "manifests" / "prepared.jsonl").write_text(
        "".join(json.dumps(record) + "\n" for record in prepared_records),
        encoding="utf8",
    )
    (root / "splits" / "split.json").write_text(
        json.dumps(
            {
                "case_ids": case_ids,
                "train_case_ids": case_ids[:15],
                "validation_case_ids": case_ids[15:],
            }
        ),
        encoding="utf8",
    )
    preflight = run_private_preflight(root=root, repo_root=REPO_ROOT)
    run_path = root / "runs" / "quality"
    run_path.mkdir()
    save_private_checkpoint(
        model=TinyMaskedVoxelAutoencoder(),
        checkpoint_path=run_path / "checkpoint.pt",
        manifest_path=run_path / "checkpoint_manifest.json",
        input_manifest_sha256=preflight.prepared_manifest_sha256,
        split_sha256=preflight.split_sha256,
        seed=7101,
        device="cpu",
        code_revision="test",
        training_config={"steps": 1, "batch_size": 1, "learning_rate": 0.001},
    )
    (run_path / "metrics.jsonl").write_text(
        json.dumps({"step": 1, "masked_reconstruction_loss": 1.0}) + "\n",
        encoding="utf8",
    )
    (run_path / "reconstruction.bin").write_bytes(bytes(64**3))
    return root
