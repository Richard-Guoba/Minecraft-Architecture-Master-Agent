import json
import re
from collections import OrderedDict
from pathlib import Path
from types import SimpleNamespace

import pytest
import torch

from mcagent_stage7.checkpoints import (
    CheckpointCompatibilityError,
    CheckpointIntegrityError,
    CheckpointScopeError,
    load_checkpoint,
    parameter_sha256,
    save_checkpoint,
)
from mcagent_stage7.contracts import pretty_json_bytes, sha256_file
from mcagent_stage7.model import TinyConditionalVAE


SHA256 = re.compile(r"^[a-f0-9]{64}$")
MANIFEST_FIELDS = {
    "source",
    "schema_version",
    "training_scope",
    "model_name",
    "model_version",
    "dataset_version",
    "dataset_manifest_sha256",
    "code_revision",
    "python_version",
    "torch_version",
    "seed",
    "device",
    "deterministic_algorithms",
    "config",
    "checkpoint_file",
    "checkpoint_sha256",
}
MODEL_CONFIG = {
    "condition_size": 64,
    "latent_size": 16,
    "coarse_size": 16,
    "steps": 2,
    "learning_rate": 1e-3,
}


def _write_manifest(path: Path, manifest: dict) -> Path:
    path.write_bytes(pretty_json_bytes(manifest))
    return path


def _save_direct_checkpoint(path: Path, state_dict: OrderedDict) -> str:
    torch.save(state_dict, path, _use_new_zipfile_serialization=False)
    return sha256_file(path)


def test_checkpoint_manifest_has_the_exact_fixture_only_mapping(trained_checkpoint):
    manifest = trained_checkpoint.manifest

    assert set(manifest) == MANIFEST_FIELDS
    assert manifest == json.loads(trained_checkpoint.manifest_path.read_text("utf8"))
    assert manifest["source"] == "stage7-m3-checkpoint-manifest-v1"
    assert manifest["schema_version"] == 1
    assert manifest["training_scope"] == "fixture-only"
    assert manifest["model_name"] == "stage7-tiny-cvae-v1"
    assert manifest["model_version"] == "m3-fixture-v1"
    assert manifest["dataset_version"] == "fixture-v1"
    assert manifest["code_revision"] == "test-revision"
    assert manifest["seed"] == 7101
    assert manifest["device"] == "cpu"
    assert manifest["deterministic_algorithms"] is True
    assert manifest["config"] == MODEL_CONFIG
    assert manifest["checkpoint_file"] == "checkpoint.pt"
    assert SHA256.fullmatch(manifest["dataset_manifest_sha256"])
    assert SHA256.fullmatch(manifest["checkpoint_sha256"])
    assert manifest["checkpoint_sha256"] == sha256_file(trained_checkpoint.checkpoint_path)

    serialized = json.dumps(manifest).lower()
    for forbidden in (
        "timestamp",
        "hostname",
        "cuda",
        "quality",
        "generalization",
        "git_status",
        "dirty",
    ):
        assert forbidden not in serialized
    assert str(trained_checkpoint.stage7_root.resolve()) not in serialized
    assert str(trained_checkpoint.checkpoint_path.parent.resolve()) not in serialized


def test_save_checkpoint_uses_legacy_serialization_with_ordered_cpu_tensors(
    tmp_path, monkeypatch
):
    model = TinyConditionalVAE().cpu()
    checkpoint_path = tmp_path / "checkpoint.pt"
    manifest_path = tmp_path / "checkpoint_manifest.json"
    calls = []
    original_save = torch.save

    def recording_save(payload, path, **kwargs):
        calls.append((payload, Path(path), kwargs))
        return original_save(payload, path, **kwargs)

    monkeypatch.setattr("mcagent_stage7.checkpoints.torch.save", recording_save)
    manifest = save_checkpoint(
        model=model,
        checkpoint_path=checkpoint_path,
        manifest_path=manifest_path,
        dataset_manifest_sha256="a" * 64,
        config=SimpleNamespace(seed=7101, steps=2, learning_rate=1e-3),
        code_revision="test-revision",
    )

    assert len(calls) == 1
    payload, saved_path, kwargs = calls[0]
    assert isinstance(payload, OrderedDict)
    assert tuple(payload) == tuple(model.state_dict())
    assert all(tensor.device.type == "cpu" for tensor in payload.values())
    assert saved_path == checkpoint_path
    assert kwargs == {"_use_new_zipfile_serialization": False}
    assert manifest["checkpoint_sha256"] == sha256_file(checkpoint_path)
    assert manifest_path.read_bytes() == pretty_json_bytes(manifest)


def test_parameter_sha256_is_ordered_stable_and_sensitive_to_parameters():
    torch.manual_seed(7101)
    model = TinyConditionalVAE().cpu()
    first = parameter_sha256(model)
    second = parameter_sha256(model)
    assert SHA256.fullmatch(first)
    assert first == second

    with torch.no_grad():
        next(model.parameters()).view(-1)[0].add_(1)
    assert parameter_sha256(model) != first


def test_load_checkpoint_returns_bound_cpu_state_dict(trained_checkpoint):
    loaded = load_checkpoint(
        trained_checkpoint.checkpoint_path,
        trained_checkpoint.manifest_path,
        require_scope="fixture-only",
        expected_dataset_manifest_sha256=trained_checkpoint.manifest[
            "dataset_manifest_sha256"
        ],
    )

    assert loaded.manifest == trained_checkpoint.manifest
    assert isinstance(loaded.state_dict, OrderedDict)
    assert all(tensor.device.type == "cpu" for tensor in loaded.state_dict.values())
    model = TinyConditionalVAE().cpu()
    model.load_state_dict(loaded.state_dict, strict=True)
    assert parameter_sha256(model) == parameter_sha256(loaded.state_dict)


def test_m3_loader_rejects_any_non_fixture_checkpoint(tmp_path, trained_checkpoint):
    manifest = dict(trained_checkpoint.manifest)
    manifest["training_scope"] = "prototype"
    manifest_path = _write_manifest(tmp_path / "checkpoint_manifest.json", manifest)
    with pytest.raises(CheckpointScopeError, match="fixture-only"):
        load_checkpoint(
            trained_checkpoint.checkpoint_path,
            manifest_path,
            require_scope="fixture-only",
        )


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        ({"source": "other"}, "source"),
        ({"schema_version": 2}, "schema_version"),
        ({"model_name": "other"}, "model_name"),
        ({"model_version": "other"}, "model_version"),
        ({"dataset_version": "v3"}, "dataset_version"),
        ({"device": "cuda"}, "device"),
        ({"deterministic_algorithms": False}, "deterministic"),
        ({"checkpoint_file": "other.pt"}, "checkpoint_file"),
        ({"dataset_manifest_sha256": "A" * 64}, "dataset_manifest_sha256"),
        ({"checkpoint_sha256": "not-a-hash"}, "checkpoint_sha256"),
        ({"config": {**MODEL_CONFIG, "condition_size": 63}}, "condition_size"),
        ({"config": {**MODEL_CONFIG, "latent_size": 15}}, "latent_size"),
        ({"config": {**MODEL_CONFIG, "coarse_size": 8}}, "coarse_size"),
        ({"config": {**MODEL_CONFIG, "steps": 0}}, "steps"),
        ({"config": {**MODEL_CONFIG, "learning_rate": 0}}, "learning_rate"),
    ],
)
def test_loader_fails_closed_on_manifest_and_config_incompatibility(
    tmp_path, trained_checkpoint, mutation, message
):
    manifest = dict(trained_checkpoint.manifest)
    manifest.update(mutation)
    manifest_path = _write_manifest(tmp_path / "checkpoint_manifest.json", manifest)

    with pytest.raises((CheckpointCompatibilityError, CheckpointIntegrityError), match=message):
        load_checkpoint(trained_checkpoint.checkpoint_path, manifest_path)


def test_loader_rejects_checkpoint_hash_mismatch(tmp_path, trained_checkpoint):
    checkpoint_path = tmp_path / "checkpoint.pt"
    checkpoint_path.write_bytes(trained_checkpoint.checkpoint_path.read_bytes() + b"tampered")
    manifest = dict(trained_checkpoint.manifest)
    manifest["checkpoint_file"] = checkpoint_path.name
    manifest_path = _write_manifest(tmp_path / "checkpoint_manifest.json", manifest)

    with pytest.raises(CheckpointIntegrityError, match="checkpoint SHA-256 mismatch"):
        load_checkpoint(checkpoint_path, manifest_path)


def test_loader_rejects_dataset_manifest_binding_mismatch(trained_checkpoint):
    with pytest.raises(CheckpointIntegrityError, match="dataset manifest SHA-256 mismatch"):
        load_checkpoint(
            trained_checkpoint.checkpoint_path,
            trained_checkpoint.manifest_path,
            expected_dataset_manifest_sha256="f" * 64,
        )


def test_loader_rejects_model_state_incompatibility(tmp_path, trained_checkpoint):
    state_dict = torch.load(
        trained_checkpoint.checkpoint_path,
        map_location="cpu",
        weights_only=True,
    )
    state_dict.pop(next(iter(state_dict)))
    checkpoint_path = tmp_path / "checkpoint.pt"
    checkpoint_sha256 = _save_direct_checkpoint(checkpoint_path, state_dict)
    manifest = dict(trained_checkpoint.manifest)
    manifest["checkpoint_sha256"] = checkpoint_sha256
    manifest_path = _write_manifest(tmp_path / "checkpoint_manifest.json", manifest)

    with pytest.raises(CheckpointCompatibilityError, match="state_dict"):
        load_checkpoint(checkpoint_path, manifest_path)


def test_loader_rejects_non_cpu_checkpoint_tensors(monkeypatch, trained_checkpoint):
    state_dict = torch.load(
        trained_checkpoint.checkpoint_path,
        map_location="cpu",
        weights_only=True,
    )
    name = next(iter(state_dict))
    state_dict[name] = state_dict[name].to("meta")
    monkeypatch.setattr("mcagent_stage7.checkpoints.torch.load", lambda *_args, **_kwargs: state_dict)

    with pytest.raises(CheckpointCompatibilityError, match="CPU"):
        load_checkpoint(
            trained_checkpoint.checkpoint_path,
            trained_checkpoint.manifest_path,
        )


def test_save_checkpoint_rejects_non_cpu_model(tmp_path):
    model = TinyConditionalVAE().to("meta")
    with pytest.raises(CheckpointCompatibilityError, match="CPU"):
        save_checkpoint(
            model=model,
            checkpoint_path=tmp_path / "checkpoint.pt",
            manifest_path=tmp_path / "checkpoint_manifest.json",
            dataset_manifest_sha256="a" * 64,
            config=SimpleNamespace(seed=7101, steps=2, learning_rate=1e-3),
            code_revision="test-revision",
        )
