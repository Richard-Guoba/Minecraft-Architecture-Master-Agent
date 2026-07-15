from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import pytest
import torch

from mcagent_stage7.private_research import (
    DEFAULT_REPO_ROOT,
    PrivateResearchError,
    PrivateResearchPreflight,
    resolve_existing_private_run,
    resolve_private_cli_paths,
    validate_private_run_id,
)
from mcagent_stage7.private_research_checkpoints import (
    load_private_checkpoint,
    save_private_checkpoint,
)
from mcagent_stage7.private_research_model import TinyMaskedVoxelAutoencoder


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_run_id_rejects_escape() -> None:
    assert validate_private_run_id("cpu-quality-run") == "cpu-quality-run"
    with pytest.raises(PrivateResearchError, match="RUN_ID_INVALID"):
        validate_private_run_id("../escape")


def test_private_cli_root_is_resolved_from_repository_not_python_cwd() -> None:
    private_root, repo_root = resolve_private_cli_paths(
        root=Path(".local/stage7-private-research"),
        repo_root=DEFAULT_REPO_ROOT,
    )
    assert repo_root == REPO_ROOT
    assert private_root == repo_root / ".local" / "stage7-private-research"


def test_existing_run_resolution_rejects_a_symlink() -> None:
    root = REPO_ROOT / ".tmp" / "stage7-private-run-resolution-test"
    shutil.rmtree(root, ignore_errors=True)
    run_path = root / "runs" / "safe"
    run_path.mkdir(parents=True)
    assert resolve_existing_private_run(
        root=root,
        repo_root=REPO_ROOT,
        run_id="safe",
    ) == run_path.resolve()
    (root / "runs" / "alias").symlink_to(run_path, target_is_directory=True)
    with pytest.raises(PrivateResearchError, match="PATH_MISSING"):
        resolve_existing_private_run(
            root=root,
            repo_root=REPO_ROOT,
            run_id="alias",
        )


def test_safe_loader_binds_manifest_hashes_and_exact_model_state(tmp_path: Path) -> None:
    checkpoint, manifest_path, preflight = make_checkpoint(tmp_path)

    loaded = load_private_checkpoint(
        checkpoint_path=checkpoint,
        manifest_path=manifest_path,
        preflight=preflight,
        device="cpu",
    )

    assert loaded.manifest["training_scope"] == "private-research-only"
    assert loaded.manifest["distribution"] == "prohibited"
    assert loaded.checkpoint_sha256 == hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    assert loaded.model.training is False


def test_safe_loader_rejects_changed_checkpoint_hash(tmp_path: Path) -> None:
    checkpoint, manifest_path, preflight = make_checkpoint(tmp_path)
    checkpoint.write_bytes(checkpoint.read_bytes() + b"changed")
    with pytest.raises(PrivateResearchError, match="CHECKPOINT_HASH_MISMATCH"):
        load_private_checkpoint(
            checkpoint_path=checkpoint,
            manifest_path=manifest_path,
            preflight=preflight,
            device="cpu",
        )


@pytest.mark.parametrize("mutation", ["shape", "dtype", "nonfinite"])
def test_safe_loader_rejects_invalid_state(
    tmp_path: Path,
    mutation: str,
) -> None:
    checkpoint, manifest_path, preflight = make_checkpoint(tmp_path)
    state = torch.load(checkpoint, map_location="cpu", weights_only=True)
    first_name = next(iter(state))
    if mutation == "shape":
        state[first_name] = state[first_name].reshape(-1)
    elif mutation == "dtype":
        state[first_name] = state[first_name].to(torch.float64)
    else:
        state[first_name] = torch.full_like(state[first_name], float("nan"))
    torch.save(state, checkpoint, _use_new_zipfile_serialization=False)
    rewrite_checkpoint_hash(checkpoint, manifest_path)
    with pytest.raises(PrivateResearchError, match="CHECKPOINT_MODEL_INVALID"):
        load_private_checkpoint(
            checkpoint_path=checkpoint,
            manifest_path=manifest_path,
            preflight=preflight,
            device="cpu",
        )


def test_safe_loader_rejects_invalid_training_configuration(tmp_path: Path) -> None:
    checkpoint, manifest_path, preflight = make_checkpoint(tmp_path)
    manifest = json.loads(manifest_path.read_text("utf8"))
    manifest["config"]["steps"] = 0
    manifest_path.write_text(json.dumps(manifest), encoding="utf8")
    with pytest.raises(PrivateResearchError, match="CHECKPOINT_MANIFEST_INVALID"):
        load_private_checkpoint(
            checkpoint_path=checkpoint,
            manifest_path=manifest_path,
            preflight=preflight,
            device="cpu",
        )


def make_checkpoint(tmp_path: Path) -> tuple[Path, Path, PrivateResearchPreflight]:
    checkpoint = tmp_path / "checkpoint.pt"
    manifest_path = tmp_path / "checkpoint_manifest.json"
    input_hash = hashlib.sha256(b"prepared").hexdigest()
    split_hash = hashlib.sha256(b"split").hexdigest()
    save_private_checkpoint(
        model=TinyMaskedVoxelAutoencoder(),
        checkpoint_path=checkpoint,
        manifest_path=manifest_path,
        input_manifest_sha256=input_hash,
        split_sha256=split_hash,
        seed=7101,
        device="cpu",
        code_revision="test",
        training_config={"steps": 1, "batch_size": 1, "learning_rate": 0.001},
    )
    preflight = PrivateResearchPreflight(
        root=tmp_path,
        case_count=22,
        sources_manifest_sha256="0" * 64,
        prepared_manifest_sha256=input_hash,
        split_sha256=split_hash,
        dataset_hashes={"v1": "1" * 64, "v2": "2" * 64, "v3": "3" * 64},
        dataset_v3_gate={
            "ready_for_m3_real_data": False,
            "training_eligible_count": 0,
        },
    )
    return checkpoint, manifest_path, preflight


def rewrite_checkpoint_hash(checkpoint: Path, manifest_path: Path) -> None:
    manifest = json.loads(manifest_path.read_text("utf8"))
    manifest["checkpoint_sha256"] = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    manifest_path.write_text(json.dumps(manifest), encoding="utf8")
