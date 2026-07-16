from __future__ import annotations

import hashlib
import io
import json
import math
import os
import zipfile
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

import torch
from torch import nn

from .private_research import (
    PRIVATE_TAXONOMY_VERSION,
    PrivateResearchError,
    PrivateResearchPreflight,
    validate_private_run_id,
)
from .private_research_model import TinyMaskedVoxelAutoencoder


PRIVATE_CHECKPOINT_SOURCE = "stage7-private-research-checkpoint-v1"
PRIVATE_CHECKPOINT_SOURCE_V2 = "stage7-private-research-checkpoint-v2"

_V2_BINDING_FIELDS = {
    "run_id",
    "target_steps",
    "seed",
    "batch_size",
    "learning_rate",
    "device",
    "code_revision",
    "training_code_sha256",
    "prepared_manifest_sha256",
    "split_sha256",
    "dataset_hashes",
    "dataset_v3_gate",
    "python_version",
    "torch_version",
    "numpy_version",
}
_V2_MANIFEST_FIELDS = {
    "source",
    "schema_version",
    "run_schema_version",
    "training_scope",
    "distribution",
    "private_research_only",
    "input_manifest_sha256",
    "prepared_taxonomy_version",
    "split_sha256",
    "seed",
    "device",
    "code_revision",
    "training_code_sha256",
    "config",
    "completed_steps",
    "artifact_inventory",
    "checkpoint_file",
    "checkpoint_sha256",
    "metrics_file",
    "metrics_sha256",
    "reconstruction_file",
    "reconstruction_sha256",
}
_V2_REQUIRED_ARTIFACTS = {
    ".runtime/private-progress.json",
    ".runtime/progress.json",
    ".runtime/resume-a.pt",
    ".runtime/resume-b.pt",
    ".runtime/resume-pointer.json",
    ".runtime/run-state.json",
    ".runtime/run.lock",
    "checkpoint.pt",
    "checkpoint_manifest.json",
    "metrics.jsonl",
    "reconstruction.bin",
}


@dataclass(frozen=True)
class LoadedPrivateCheckpoint:
    model: TinyMaskedVoxelAutoencoder
    manifest: dict[str, Any]
    checkpoint_sha256: str


def save_private_checkpoint(
    *,
    model: nn.Module,
    checkpoint_path: Path,
    manifest_path: Path,
    input_manifest_sha256: str,
    split_sha256: str,
    seed: int,
    device: str,
    code_revision: str,
    training_config: dict[str, int | float],
) -> dict[str, Any]:
    if not isinstance(model, nn.Module):
        raise PrivateResearchError("CHECKPOINT_MODEL_INVALID", "model must be a torch module")
    _require_sha256(input_manifest_sha256, "input_manifest_sha256")
    _require_sha256(split_sha256, "split_sha256")
    if not isinstance(seed, int) or not 0 <= seed < 2**32:
        raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", "seed")
    if device not in {"cpu", "cuda"}:
        raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", "device")
    if not isinstance(code_revision, str) or not code_revision.strip():
        raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", "code_revision")
    if not isinstance(training_config, dict) or set(training_config) != {"steps", "batch_size", "learning_rate"}:
        raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", "training_config")

    state_dict = _ordered_cpu_state_dict(model)
    checkpoint_path = Path(checkpoint_path)
    manifest_path = Path(manifest_path)
    torch.save(state_dict, checkpoint_path, _use_new_zipfile_serialization=False)
    checkpoint_sha256 = _sha256_file(checkpoint_path)
    manifest = {
        "source": PRIVATE_CHECKPOINT_SOURCE,
        "schema_version": 1,
        "training_scope": "private-research-only",
        "distribution": "prohibited",
        "private_research_only": True,
        "input_manifest_sha256": input_manifest_sha256,
        "prepared_taxonomy_version": PRIVATE_TAXONOMY_VERSION,
        "split_sha256": split_sha256,
        "seed": seed,
        "device": device,
        "code_revision": code_revision,
        "config": dict(training_config),
        "checkpoint_file": checkpoint_path.name,
        "checkpoint_sha256": checkpoint_sha256,
    }
    manifest_path.write_text(_canonical_json(manifest), encoding="utf8")
    return manifest


def save_private_checkpoint_v2(
    *,
    model: nn.Module,
    checkpoint_path: Path,
    manifest_path: Path,
    binding: dict[str, Any],
    completed_steps: int,
    artifact_inventory: list[str],
    metrics_sha256: str,
    reconstruction_sha256: str,
) -> dict[str, Any]:
    _validate_v2_binding(binding)
    if completed_steps != binding.get("target_steps"):
        raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", "completed_steps")
    _validate_artifact_inventory(artifact_inventory)
    _require_sha256(metrics_sha256, "metrics_sha256")
    _require_sha256(reconstruction_sha256, "reconstruction_sha256")
    checkpoint_path = Path(checkpoint_path)
    manifest_path = Path(manifest_path)
    if checkpoint_path.name != "checkpoint.pt":
        raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", "checkpoint_path")
    if manifest_path.name != "checkpoint_manifest.json":
        raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", "manifest_path")
    state_dict = _ordered_cpu_state_dict(model)
    _atomic_torch_save(state_dict, checkpoint_path)
    checkpoint_sha256 = _sha256_file(checkpoint_path)
    manifest = {
        "source": PRIVATE_CHECKPOINT_SOURCE_V2,
        "schema_version": 2,
        "run_schema_version": 2,
        "training_scope": "private-research-only",
        "distribution": "prohibited",
        "private_research_only": True,
        "input_manifest_sha256": binding["prepared_manifest_sha256"],
        "prepared_taxonomy_version": PRIVATE_TAXONOMY_VERSION,
        "split_sha256": binding["split_sha256"],
        "seed": binding["seed"],
        "device": binding["device"],
        "code_revision": binding["code_revision"],
        "training_code_sha256": binding["training_code_sha256"],
        "config": {
            "steps": binding["target_steps"],
            "batch_size": binding["batch_size"],
            "learning_rate": binding["learning_rate"],
        },
        "completed_steps": completed_steps,
        "artifact_inventory": list(artifact_inventory),
        "checkpoint_file": checkpoint_path.name,
        "checkpoint_sha256": checkpoint_sha256,
        "metrics_file": "metrics.jsonl",
        "metrics_sha256": metrics_sha256,
        "reconstruction_file": "reconstruction.bin",
        "reconstruction_sha256": reconstruction_sha256,
    }
    _validate_v2_manifest(
        manifest,
        checkpoint_name=checkpoint_path.name,
        preflight=None,
    )
    _atomic_manifest_write(manifest, manifest_path)
    return manifest


def load_private_checkpoint(
    *,
    checkpoint_path: Path,
    manifest_path: Path,
    preflight: PrivateResearchPreflight,
    device: str = "cpu",
) -> LoadedPrivateCheckpoint:
    if device != "cpu":
        raise PrivateResearchError("EVALUATION_CONFIG_INVALID", "device")
    checkpoint_path = Path(checkpoint_path)
    manifest_path = Path(manifest_path)
    manifest = _read_manifest(manifest_path)
    source = manifest.get("source")
    schema_version = manifest.get("schema_version")
    if source == PRIVATE_CHECKPOINT_SOURCE and schema_version == 1:
        return _load_private_checkpoint_v1(
            checkpoint_path=checkpoint_path,
            manifest=manifest,
            preflight=preflight,
            device=device,
        )
    if source == PRIVATE_CHECKPOINT_SOURCE_V2 and schema_version == 2:
        return _load_private_checkpoint_v2(
            checkpoint_path=checkpoint_path,
            manifest=manifest,
            preflight=preflight,
            device=device,
        )
    raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", "source/schema")


def _load_private_checkpoint_v1(
    *,
    checkpoint_path: Path,
    manifest: dict[str, Any],
    preflight: PrivateResearchPreflight,
    device: str,
) -> LoadedPrivateCheckpoint:
    required = {
        "source",
        "schema_version",
        "training_scope",
        "distribution",
        "private_research_only",
        "input_manifest_sha256",
        "prepared_taxonomy_version",
        "split_sha256",
        "seed",
        "device",
        "code_revision",
        "config",
        "checkpoint_file",
        "checkpoint_sha256",
    }
    if set(manifest) != required:
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", "fields")
    if (
        manifest["source"] != PRIVATE_CHECKPOINT_SOURCE
        or manifest["schema_version"] != 1
        or manifest["training_scope"] != "private-research-only"
        or manifest["distribution"] != "prohibited"
        or manifest["private_research_only"] is not True
        or manifest["prepared_taxonomy_version"] != PRIVATE_TAXONOMY_VERSION
        or manifest["input_manifest_sha256"] != preflight.prepared_manifest_sha256
        or manifest["split_sha256"] != preflight.split_sha256
        or manifest["checkpoint_file"] != checkpoint_path.name
    ):
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", "boundary")
    training_config = manifest["config"]
    if (
        isinstance(manifest["seed"], bool)
        or not isinstance(manifest["seed"], int)
        or not 0 <= manifest["seed"] < 2**32
        or not isinstance(manifest["device"], str)
        or manifest["device"] not in {"cpu", "cuda"}
        or not isinstance(manifest["code_revision"], str)
        or not manifest["code_revision"].strip()
        or not isinstance(training_config, dict)
        or set(training_config) != {"steps", "batch_size", "learning_rate"}
        or isinstance(training_config["steps"], bool)
        or not isinstance(training_config["steps"], int)
        or training_config["steps"] <= 0
        or isinstance(training_config["batch_size"], bool)
        or not isinstance(training_config["batch_size"], int)
        or training_config["batch_size"] <= 0
        or isinstance(training_config["learning_rate"], bool)
        or not isinstance(training_config["learning_rate"], (int, float))
        or not math.isfinite(float(training_config["learning_rate"]))
        or float(training_config["learning_rate"]) <= 0
    ):
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", "configuration")
    expected_model, actual_hash = _load_checkpoint_model(
        checkpoint_path=checkpoint_path,
        expected_sha256=manifest["checkpoint_sha256"],
        device=device,
    )
    return LoadedPrivateCheckpoint(
        model=expected_model,
        manifest=manifest,
        checkpoint_sha256=actual_hash,
    )


def _load_private_checkpoint_v2(
    *,
    checkpoint_path: Path,
    manifest: dict[str, Any],
    preflight: PrivateResearchPreflight,
    device: str,
) -> LoadedPrivateCheckpoint:
    _validate_v2_manifest(
        manifest,
        checkpoint_name=checkpoint_path.name,
        preflight=preflight,
    )
    expected_model, actual_hash = _load_checkpoint_model(
        checkpoint_path=checkpoint_path,
        expected_sha256=manifest["checkpoint_sha256"],
        device=device,
    )
    return LoadedPrivateCheckpoint(
        model=expected_model,
        manifest=manifest,
        checkpoint_sha256=actual_hash,
    )


def _validate_v2_binding(binding: Any) -> None:
    if not isinstance(binding, dict) or set(binding) != _V2_BINDING_FIELDS:
        raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", "binding fields")
    try:
        validate_private_run_id(binding["run_id"])
    except PrivateResearchError as error:
        raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", "run_id") from error
    if (
        not _is_positive_integer(binding["target_steps"])
        or isinstance(binding["seed"], bool)
        or not isinstance(binding["seed"], int)
        or not 0 <= binding["seed"] < 2**32
        or not _is_positive_integer(binding["batch_size"])
        or not _is_finite_positive(binding["learning_rate"])
        or binding["device"] != "cpu"
        or not _is_sha1(binding["code_revision"])
        or not _is_sha256(binding["training_code_sha256"])
        or not _is_sha256(binding["prepared_manifest_sha256"])
        or not _is_sha256(binding["split_sha256"])
    ):
        raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", "binding values")
    dataset_hashes = binding["dataset_hashes"]
    if (
        not isinstance(dataset_hashes, dict)
        or set(dataset_hashes) != {"v1", "v2", "v3"}
        or any(not _is_sha256(value) for value in dataset_hashes.values())
    ):
        raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", "dataset_hashes")
    if binding["dataset_v3_gate"] != {
        "ready_for_m3_real_data": False,
        "training_eligible_count": 0,
    }:
        raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", "dataset_v3_gate")
    for field in ("python_version", "torch_version", "numpy_version"):
        if not isinstance(binding[field], str) or not binding[field]:
            raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", field)


def _validate_v2_manifest(
    manifest: Any,
    *,
    checkpoint_name: str,
    preflight: PrivateResearchPreflight | None,
) -> None:
    if not isinstance(manifest, dict) or set(manifest) != _V2_MANIFEST_FIELDS:
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", "fields")
    config = manifest.get("config")
    if (
        manifest.get("source") != PRIVATE_CHECKPOINT_SOURCE_V2
        or manifest.get("schema_version") != 2
        or manifest.get("run_schema_version") != 2
        or manifest.get("training_scope") != "private-research-only"
        or manifest.get("distribution") != "prohibited"
        or manifest.get("private_research_only") is not True
        or manifest.get("prepared_taxonomy_version") != PRIVATE_TAXONOMY_VERSION
        or manifest.get("device") != "cpu"
        or manifest.get("checkpoint_file") != checkpoint_name
        or manifest.get("metrics_file") != "metrics.jsonl"
        or manifest.get("reconstruction_file") != "reconstruction.bin"
    ):
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", "boundary")
    if (
        not _is_sha256(manifest.get("input_manifest_sha256"))
        or not _is_sha256(manifest.get("split_sha256"))
        or not _is_sha256(manifest.get("training_code_sha256"))
        or not _is_sha256(manifest.get("checkpoint_sha256"))
        or not _is_sha256(manifest.get("metrics_sha256"))
        or not _is_sha256(manifest.get("reconstruction_sha256"))
        or isinstance(manifest.get("seed"), bool)
        or not isinstance(manifest.get("seed"), int)
        or not 0 <= manifest["seed"] < 2**32
        or not _is_sha1(manifest.get("code_revision"))
        or not isinstance(config, dict)
        or set(config) != {"steps", "batch_size", "learning_rate"}
        or not _is_positive_integer(config.get("steps"))
        or not _is_positive_integer(config.get("batch_size"))
        or not _is_finite_positive(config.get("learning_rate"))
        or manifest.get("completed_steps") != config.get("steps")
    ):
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", "configuration")
    try:
        _validate_artifact_inventory(manifest["artifact_inventory"])
    except PrivateResearchError as error:
        raise PrivateResearchError(
            "CHECKPOINT_MANIFEST_INVALID",
            "artifact_inventory",
        ) from error
    if preflight is not None and (
        manifest["input_manifest_sha256"] != preflight.prepared_manifest_sha256
        or manifest["split_sha256"] != preflight.split_sha256
    ):
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", "preflight binding")


def _validate_artifact_inventory(value: Any) -> None:
    if (
        not isinstance(value, list)
        or any(not isinstance(item, str) for item in value)
        or value != sorted(set(value))
        or not _V2_REQUIRED_ARTIFACTS.issubset(value)
    ):
        raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", "artifact_inventory")
    for item in value:
        path = PurePosixPath(item)
        if (
            not item
            or "\\" in item
            or path.is_absolute()
            or ".." in path.parts
            or path.as_posix() != item
        ):
            raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", "artifact_inventory")


def _load_checkpoint_model(
    *,
    checkpoint_path: Path,
    expected_sha256: str,
    device: str,
) -> tuple[TinyMaskedVoxelAutoencoder, str]:
    actual_hash = _sha256_file(checkpoint_path)
    if actual_hash != expected_sha256:
        raise PrivateResearchError("CHECKPOINT_HASH_MISMATCH", checkpoint_path.name)
    expected_model = TinyMaskedVoxelAutoencoder()
    expected_state = expected_model.state_dict()
    try:
        state = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    except Exception as error:
        raise PrivateResearchError(
            "CHECKPOINT_MODEL_INVALID",
            "weights-only load",
        ) from error
    if not isinstance(state, dict) or set(state) != set(expected_state):
        raise PrivateResearchError("CHECKPOINT_MODEL_INVALID", "state keys")
    for name, expected in expected_state.items():
        value = state[name]
        if (
            not isinstance(value, torch.Tensor)
            or value.device.type != "cpu"
            or value.shape != expected.shape
            or value.dtype != expected.dtype
            or not value.is_floating_point()
            or not bool(torch.isfinite(value).all())
        ):
            raise PrivateResearchError("CHECKPOINT_MODEL_INVALID", name)
    try:
        expected_model.load_state_dict(state, strict=True)
    except RuntimeError as error:
        raise PrivateResearchError("CHECKPOINT_MODEL_INVALID", "state load") from error
    expected_model.to(torch.device(device)).eval()
    return expected_model, actual_hash


def _atomic_torch_save(
    state_dict: OrderedDict[str, torch.Tensor],
    checkpoint_path: Path,
) -> None:
    temporary = checkpoint_path.with_name(checkpoint_path.name + ".tmp")
    if temporary.is_symlink() or checkpoint_path.is_symlink():
        raise PrivateResearchError("CHECKPOINT_MODEL_INVALID", checkpoint_path.name)
    try:
        raw = io.BytesIO()
        torch.save(state_dict, raw)
        canonical_bytes = _canonical_torch_zip(raw.getvalue())
        if checkpoint_path.exists():
            if not checkpoint_path.is_file():
                raise PrivateResearchError(
                    "FINAL_ARTIFACT_CONFLICT",
                    checkpoint_path.name,
                )
            if checkpoint_path.read_bytes() != canonical_bytes:
                raise PrivateResearchError(
                    "FINAL_ARTIFACT_CONFLICT",
                    checkpoint_path.name,
                )
            validation_path = checkpoint_path
        else:
            with temporary.open("wb") as handle:
                handle.write(canonical_bytes)
                handle.flush()
                os.fsync(handle.fileno())
            validation_path = temporary
        loaded = torch.load(validation_path, map_location="cpu", weights_only=True)
        if not isinstance(loaded, dict) or list(loaded) != list(state_dict):
            raise PrivateResearchError("CHECKPOINT_MODEL_INVALID", "temporary state")
        for name, expected in state_dict.items():
            if not torch.equal(loaded[name], expected):
                raise PrivateResearchError("CHECKPOINT_MODEL_INVALID", name)
        if validation_path == temporary:
            os.replace(temporary, checkpoint_path)
            _fsync_directory(checkpoint_path.parent)
    except PrivateResearchError:
        raise
    except Exception as error:
        raise PrivateResearchError(
            "CHECKPOINT_MODEL_INVALID",
            checkpoint_path.name,
        ) from error


def _canonical_torch_zip(payload: bytes) -> bytes:
    source_buffer = io.BytesIO(payload)
    target_buffer = io.BytesIO()
    try:
        with zipfile.ZipFile(source_buffer, "r") as source:
            with zipfile.ZipFile(
                target_buffer,
                "w",
                compression=zipfile.ZIP_STORED,
            ) as target:
                for name in source.namelist():
                    info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                    info.compress_type = zipfile.ZIP_STORED
                    info.external_attr = 0o600 << 16
                    target.writestr(info, source.read(name))
    except (OSError, zipfile.BadZipFile) as error:
        raise PrivateResearchError(
            "CHECKPOINT_MODEL_INVALID",
            "canonical serialization",
        ) from error
    return target_buffer.getvalue()


def _atomic_manifest_write(manifest: dict[str, Any], manifest_path: Path) -> None:
    temporary = manifest_path.with_name(manifest_path.name + ".tmp")
    if temporary.is_symlink() or manifest_path.is_symlink():
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", manifest_path.name)
    try:
        payload = _canonical_json(manifest).encode("utf8")
        if manifest_path.exists():
            if not manifest_path.is_file() or manifest_path.read_bytes() != payload:
                raise PrivateResearchError(
                    "FINAL_ARTIFACT_CONFLICT",
                    manifest_path.name,
                )
            validation_path = manifest_path
        else:
            with temporary.open("wb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            validation_path = temporary
        if _read_manifest(validation_path) != manifest:
            raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", "temporary")
        if validation_path == temporary:
            os.replace(temporary, manifest_path)
            _fsync_directory(manifest_path.parent)
    except PrivateResearchError:
        raise
    except OSError as error:
        raise PrivateResearchError(
            "CHECKPOINT_MANIFEST_INVALID",
            manifest_path.name,
        ) from error


def _fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _ordered_cpu_state_dict(model: nn.Module) -> OrderedDict[str, torch.Tensor]:
    result: OrderedDict[str, torch.Tensor] = OrderedDict()
    for name, value in model.state_dict().items():
        if not isinstance(value, torch.Tensor) or not value.is_floating_point() or not bool(torch.isfinite(value).all()):
            raise PrivateResearchError("CHECKPOINT_MODEL_INVALID", name)
        result[name] = value.detach().cpu().contiguous().clone()
    return result


def _read_manifest(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text("utf8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", path.name) from error
    if not isinstance(value, dict):
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", path.name)
    return value


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _require_sha256(value: str, field: str) -> None:
    if not isinstance(value, str) or len(value) != 64 or any(character not in "0123456789abcdef" for character in value):
        raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", field)


def _canonical_json(value: dict[str, Any]) -> str:
    return json.dumps(value, sort_keys=True, indent=2) + "\n"


def _is_positive_integer(value: Any) -> bool:
    return not isinstance(value, bool) and isinstance(value, int) and value > 0


def _is_finite_positive(value: Any) -> bool:
    return (
        not isinstance(value, bool)
        and isinstance(value, (int, float))
        and math.isfinite(float(value))
        and float(value) > 0.0
    )


def _is_sha1(value: Any) -> bool:
    return (
        isinstance(value, str)
        and len(value) == 40
        and all(character in "0123456789abcdef" for character in value)
    )


def _is_sha256(value: Any) -> bool:
    return (
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value)
    )
