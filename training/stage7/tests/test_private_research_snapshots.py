from __future__ import annotations

import json
import random
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
import torch

from mcagent_stage7.private_research import PrivateResearchError
from mcagent_stage7.private_research_model import TinyMaskedVoxelAutoencoder
from mcagent_stage7.private_research_runtime import (
    PrivateRunPaths,
    RuntimeServices,
    paths_for_run,
)
from mcagent_stage7.private_research_snapshots import (
    commit_resume_snapshot,
    load_latest_resume_snapshot,
    restore_model_optimizer,
)


def binding() -> dict[str, object]:
    return {
        "run_id": "safe-run",
        "target_steps": 4,
        "seed": 7101,
        "batch_size": 1,
        "learning_rate": 0.001,
        "device": "cpu",
        "code_revision": "a" * 40,
        "training_code_sha256": "b" * 64,
        "prepared_manifest_sha256": "c" * 64,
        "split_sha256": "d" * 64,
        "dataset_hashes": {"v1": "1" * 64, "v2": "2" * 64, "v3": "3" * 64},
        "dataset_v3_gate": {
            "ready_for_m3_real_data": False,
            "training_eligible_count": 0,
        },
        "python_version": "3.12",
        "torch_version": torch.__version__,
        "numpy_version": np.__version__,
    }


def test_snapshot_round_trip_restores_model_optimizer_losses_and_rng(
    tmp_path: Path,
) -> None:
    paths = paths_for_run(tmp_path / "runs" / "safe-run")
    paths.runtime_path.mkdir(parents=True)
    model = TinyMaskedVoxelAutoencoder()
    optimizer = torch.optim.SGD(model.parameters(), lr=0.001)
    losses = torch.tensor([2.0, 1.0], dtype=torch.float64)
    reconstruction = torch.zeros((64, 64, 64), dtype=torch.uint8)
    pointer = commit_resume_snapshot(
        paths=paths,
        model=model,
        optimizer=optimizer,
        losses=losses,
        reconstruction=reconstruction,
        completed_steps=2,
        generation=0,
        binding=binding(),
        active_seconds=5.0,
    )
    expected_python = random.random()
    expected_numpy = float(np.random.random())
    expected_torch = float(torch.rand(()))
    loaded = load_latest_resume_snapshot(paths=paths, expected_binding=binding())
    restored_model = TinyMaskedVoxelAutoencoder()
    restored_optimizer = torch.optim.SGD(restored_model.parameters(), lr=0.001)
    restore_model_optimizer(loaded, restored_model, restored_optimizer)
    assert pointer.active_slot == "resume-a.pt"
    assert loaded.completed_steps == 2
    assert torch.equal(loaded.losses, losses)
    assert torch.equal(loaded.reconstruction, reconstruction)
    assert random.random() == expected_python
    assert float(np.random.random()) == expected_numpy
    assert float(torch.rand(())) == expected_torch


def test_slots_rotate_and_corrupt_active_falls_back_to_previous(
    tmp_path: Path,
) -> None:
    paths = paths_for_run(tmp_path / "runs" / "safe-run")
    paths.runtime_path.mkdir(parents=True)
    model = TinyMaskedVoxelAutoencoder()
    optimizer = torch.optim.SGD(model.parameters(), lr=0.001)
    commit_resume_snapshot(
        paths=paths,
        model=model,
        optimizer=optimizer,
        losses=torch.empty(0, dtype=torch.float64),
        reconstruction=None,
        completed_steps=0,
        generation=0,
        binding=binding(),
        active_seconds=0.0,
    )
    commit_resume_snapshot(
        paths=paths,
        model=model,
        optimizer=optimizer,
        losses=torch.tensor([1.0], dtype=torch.float64),
        reconstruction=torch.zeros((64, 64, 64), dtype=torch.uint8),
        completed_steps=1,
        generation=1,
        binding=binding(),
        active_seconds=1.0,
    )
    paths.resume_b_path.write_bytes(b"corrupt")
    loaded = load_latest_resume_snapshot(paths=paths, expected_binding=binding())
    assert loaded.generation == 0
    assert loaded.completed_steps == 0


def initialized_snapshot_fixture(
    tmp_path: Path,
) -> tuple[PrivateRunPaths, TinyMaskedVoxelAutoencoder, torch.optim.SGD]:
    paths = paths_for_run(tmp_path / "runs" / "safe-run")
    paths.runtime_path.mkdir(parents=True)
    model = TinyMaskedVoxelAutoencoder()
    optimizer = torch.optim.SGD(model.parameters(), lr=0.001)
    commit_resume_snapshot(
        paths=paths,
        model=model,
        optimizer=optimizer,
        losses=torch.empty(0, dtype=torch.float64),
        reconstruction=None,
        completed_steps=0,
        generation=0,
        binding=binding(),
        active_seconds=0.0,
    )
    return paths, model, optimizer


@pytest.mark.parametrize(
    "stage",
    [
        "snapshot_after_temp_fsync",
        "snapshot_after_temp_validate",
        "snapshot_after_slot_replace",
        "snapshot_after_slot_dir_fsync",
        "snapshot_after_pointer_replace",
    ],
)
def test_interruption_at_each_atomic_stage_keeps_a_loadable_slot(
    tmp_path: Path,
    stage: str,
) -> None:
    paths, model, optimizer = initialized_snapshot_fixture(tmp_path)

    def fail(current: str) -> None:
        if current == stage:
            raise RuntimeError(stage)

    with pytest.raises(RuntimeError, match=stage):
        commit_resume_snapshot(
            paths=paths,
            model=model,
            optimizer=optimizer,
            losses=torch.tensor([1.0], dtype=torch.float64),
            reconstruction=torch.zeros((64, 64, 64), dtype=torch.uint8),
            completed_steps=1,
            generation=1,
            binding=binding(),
            active_seconds=1.0,
            services=RuntimeServices(fault_hook=fail),
        )
    loaded = load_latest_resume_snapshot(paths=paths, expected_binding=binding())
    assert loaded.generation in {0, 1}


def test_snapshot_rejects_changed_binding(tmp_path: Path) -> None:
    paths, _, _ = initialized_snapshot_fixture(tmp_path)
    changed = binding()
    changed["target_steps"] = 5
    with pytest.raises(PrivateResearchError, match="RESUME_SNAPSHOT_INVALID"):
        load_latest_resume_snapshot(paths=paths, expected_binding=changed)


def test_snapshot_rejects_nonfinite_loss(tmp_path: Path) -> None:
    paths = paths_for_run(tmp_path / "runs" / "safe-run")
    paths.runtime_path.mkdir(parents=True)
    model = TinyMaskedVoxelAutoencoder()
    optimizer = torch.optim.SGD(model.parameters(), lr=0.001)
    with pytest.raises(PrivateResearchError, match="RESUME_SNAPSHOT_INVALID"):
        commit_resume_snapshot(
            paths=paths,
            model=model,
            optimizer=optimizer,
            losses=torch.tensor([float("nan")], dtype=torch.float64),
            reconstruction=torch.zeros((64, 64, 64), dtype=torch.uint8),
            completed_steps=1,
            generation=0,
            binding=binding(),
            active_seconds=1.0,
        )


def test_snapshot_rejects_invalid_reconstruction(tmp_path: Path) -> None:
    paths = paths_for_run(tmp_path / "runs" / "safe-run")
    paths.runtime_path.mkdir(parents=True)
    model = TinyMaskedVoxelAutoencoder()
    optimizer = torch.optim.SGD(model.parameters(), lr=0.001)
    with pytest.raises(PrivateResearchError, match="RESUME_SNAPSHOT_INVALID"):
        commit_resume_snapshot(
            paths=paths,
            model=model,
            optimizer=optimizer,
            losses=torch.tensor([1.0], dtype=torch.float64),
            reconstruction=torch.zeros((1, 64, 64), dtype=torch.uint8),
            completed_steps=1,
            generation=0,
            binding=binding(),
            active_seconds=1.0,
        )


def test_snapshot_rejects_optimizer_parameter_count_drift(tmp_path: Path) -> None:
    paths = paths_for_run(tmp_path / "runs" / "safe-run")
    paths.runtime_path.mkdir(parents=True)
    model = TinyMaskedVoxelAutoencoder()
    state = torch.optim.SGD(model.parameters(), lr=0.001).state_dict()
    state["param_groups"][0]["params"].pop()
    optimizer = SimpleNamespace(state_dict=lambda: state)
    with pytest.raises(PrivateResearchError, match="RESUME_SNAPSHOT_INVALID"):
        commit_resume_snapshot(
            paths=paths,
            model=model,
            optimizer=optimizer,
            losses=torch.empty(0, dtype=torch.float64),
            reconstruction=None,
            completed_steps=0,
            generation=0,
            binding=binding(),
            active_seconds=0.0,
        )


def test_both_corrupt_slots_are_rejected(tmp_path: Path) -> None:
    paths, model, optimizer = initialized_snapshot_fixture(tmp_path)
    commit_resume_snapshot(
        paths=paths,
        model=model,
        optimizer=optimizer,
        losses=torch.tensor([1.0], dtype=torch.float64),
        reconstruction=torch.zeros((64, 64, 64), dtype=torch.uint8),
        completed_steps=1,
        generation=1,
        binding=binding(),
        active_seconds=1.0,
    )
    paths.resume_a_path.write_bytes(b"corrupt-a")
    paths.resume_b_path.write_bytes(b"corrupt-b")
    with pytest.raises(PrivateResearchError, match="RESUME_SNAPSHOT_INVALID"):
        load_latest_resume_snapshot(paths=paths, expected_binding=binding())


def test_pointer_hash_mismatch_is_rejected_without_another_slot(
    tmp_path: Path,
) -> None:
    paths, _, _ = initialized_snapshot_fixture(tmp_path)
    pointer = json.loads(paths.resume_pointer_path.read_text("utf8"))
    pointer["snapshot_sha256"] = "e" * 64
    paths.resume_pointer_path.write_text(json.dumps(pointer), encoding="utf8")
    with pytest.raises(PrivateResearchError, match="RESUME_SNAPSHOT_INVALID"):
        load_latest_resume_snapshot(paths=paths, expected_binding=binding())


def test_unreadable_pointer_scans_and_uses_the_only_valid_slot(
    tmp_path: Path,
) -> None:
    paths, _, _ = initialized_snapshot_fixture(tmp_path)
    paths.resume_pointer_path.write_text("{", encoding="utf8")
    loaded = load_latest_resume_snapshot(paths=paths, expected_binding=binding())
    assert loaded.generation == 0


class UnsafePayload:
    pass


def test_weights_only_rejection_is_reported_as_invalid_snapshot(
    tmp_path: Path,
) -> None:
    paths = paths_for_run(tmp_path / "runs" / "safe-run")
    paths.runtime_path.mkdir(parents=True)
    torch.save({"unsafe": UnsafePayload()}, paths.resume_a_path)
    paths.resume_pointer_path.write_text("{", encoding="utf8")
    with pytest.raises(PrivateResearchError, match="RESUME_SNAPSHOT_INVALID"):
        load_latest_resume_snapshot(paths=paths, expected_binding=binding())
