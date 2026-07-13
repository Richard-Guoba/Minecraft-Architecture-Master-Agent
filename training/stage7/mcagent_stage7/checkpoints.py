from __future__ import annotations

import hashlib
import json
import math
import platform
import re
import struct
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

import torch
from torch import nn

from .contracts import Stage7ContractError, canonical_json_bytes, pretty_json_bytes, sha256_file
from .model import TinyConditionalVAE


CHECKPOINT_SOURCE = "stage7-m3-checkpoint-manifest-v1"
CHECKPOINT_SCHEMA_VERSION = 1
TRAINING_SCOPE = "fixture-only"
MODEL_NAME = "stage7-tiny-cvae-v1"
MODEL_VERSION = "m3-fixture-v1"
DATASET_VERSION = "fixture-v1"
CONDITION_SIZE = 64
LATENT_SIZE = 16
COARSE_SIZE = 16
_SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$")
_MANIFEST_FIELDS = {
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
_CONFIG_FIELDS = {
    "condition_size",
    "latent_size",
    "coarse_size",
    "steps",
    "learning_rate",
}


class CheckpointError(Stage7ContractError):
    pass


class CheckpointScopeError(CheckpointError):
    pass


class CheckpointIntegrityError(CheckpointError):
    pass


class CheckpointCompatibilityError(CheckpointError):
    pass


@dataclass(frozen=True)
class LoadedCheckpoint:
    state_dict: OrderedDict[str, torch.Tensor]
    manifest: dict[str, Any]


def parameter_sha256(
    model_or_state_dict: nn.Module | Mapping[str, torch.Tensor],
) -> str:
    if isinstance(model_or_state_dict, nn.Module):
        state_dict = model_or_state_dict.state_dict()
    elif isinstance(model_or_state_dict, Mapping):
        state_dict = model_or_state_dict
    else:
        raise CheckpointCompatibilityError("parameters must be a model or state_dict")

    digest = hashlib.sha256()
    for name, tensor in state_dict.items():
        if not isinstance(name, str) or not isinstance(tensor, torch.Tensor):
            raise CheckpointCompatibilityError("state_dict must map names to tensors")
        if tensor.device.type != "cpu":
            raise CheckpointCompatibilityError("parameter SHA-256 requires CPU tensors")
        contiguous = tensor.detach().contiguous()
        descriptor = {
            "dtype": str(contiguous.dtype),
            "name": name,
            "shape": list(contiguous.shape),
        }
        digest.update(canonical_json_bytes(descriptor))
        digest.update(b"\0")
        digest.update(contiguous.numpy().tobytes(order="C"))
        digest.update(b"\0")
    return digest.hexdigest()


def save_checkpoint(
    *,
    model: nn.Module,
    checkpoint_path: Path,
    manifest_path: Path,
    dataset_manifest_sha256: str,
    config: Any,
    code_revision: str,
) -> dict[str, Any]:
    _validate_sha256(dataset_manifest_sha256, "dataset_manifest_sha256")
    seed, steps, learning_rate = _validate_run_config(config)
    if not isinstance(code_revision, str) or not code_revision.strip():
        raise CheckpointCompatibilityError("code_revision must be a non-empty string")
    if not isinstance(model, nn.Module):
        raise CheckpointCompatibilityError("model must be a torch module")

    state_dict, storage_key = _ordered_cpu_state_dict(model)
    checkpoint_path = Path(checkpoint_path)
    manifest_path = Path(manifest_path)
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        state_dict,
        checkpoint_path,
        _use_new_zipfile_serialization=False,
    )
    _canonicalize_legacy_storage_key(
        checkpoint_path,
        storage_key,
        expected_occurrences=len(state_dict) + 1,
    )
    checkpoint_sha256 = sha256_file(checkpoint_path)
    _validate_sha256(checkpoint_sha256, "checkpoint_sha256")

    manifest = {
        "source": CHECKPOINT_SOURCE,
        "schema_version": CHECKPOINT_SCHEMA_VERSION,
        "training_scope": TRAINING_SCOPE,
        "model_name": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "dataset_version": DATASET_VERSION,
        "dataset_manifest_sha256": dataset_manifest_sha256,
        "code_revision": code_revision,
        "python_version": platform.python_version(),
        "torch_version": torch.__version__,
        "seed": seed,
        "device": "cpu",
        "deterministic_algorithms": True,
        "config": {
            "condition_size": CONDITION_SIZE,
            "latent_size": LATENT_SIZE,
            "coarse_size": COARSE_SIZE,
            "steps": steps,
            "learning_rate": learning_rate,
        },
        "checkpoint_file": checkpoint_path.name,
        "checkpoint_sha256": checkpoint_sha256,
    }
    manifest_path.write_bytes(pretty_json_bytes(manifest))
    return manifest


def load_checkpoint(
    checkpoint_path: Path,
    manifest_path: Path,
    *,
    require_scope: str | None = None,
    expected_dataset_manifest_sha256: str | None = None,
    expected_config: Mapping[str, Any] | None = None,
) -> LoadedCheckpoint:
    checkpoint_path = Path(checkpoint_path)
    manifest_path = Path(manifest_path)
    manifest = _read_manifest(manifest_path)
    _validate_manifest(
        manifest,
        checkpoint_path=checkpoint_path,
        require_scope=require_scope,
        expected_dataset_manifest_sha256=expected_dataset_manifest_sha256,
        expected_config=expected_config,
    )

    try:
        actual_checkpoint_sha256 = sha256_file(checkpoint_path)
    except OSError as error:
        raise CheckpointIntegrityError("cannot read checkpoint file") from error
    if actual_checkpoint_sha256 != manifest["checkpoint_sha256"]:
        raise CheckpointIntegrityError("checkpoint SHA-256 mismatch")

    try:
        payload = torch.load(checkpoint_path, weights_only=True)
    except Exception as error:
        raise CheckpointIntegrityError("checkpoint payload cannot be loaded") from error
    state_dict = _validate_loaded_state_dict(payload)
    return LoadedCheckpoint(state_dict=state_dict, manifest=manifest)


def _ordered_cpu_state_dict(
    model: nn.Module,
) -> tuple[OrderedDict[str, torch.Tensor], str]:
    source = model.state_dict()
    for tensor in source.values():
        if not isinstance(tensor, torch.Tensor):
            raise CheckpointCompatibilityError("model state_dict must contain only tensors")
        if tensor.device.type != "cpu":
            raise CheckpointCompatibilityError("checkpoint state_dict must contain only CPU tensors")
        if tensor.dtype != torch.float32:
            raise CheckpointCompatibilityError("checkpoint state_dict must contain float32 tensors")
        if tensor.is_floating_point() and not bool(torch.isfinite(tensor).all()):
            raise CheckpointCompatibilityError("checkpoint state_dict tensors must be finite")

    flat = torch.empty(sum(tensor.numel() for tensor in source.values()), dtype=torch.float32)
    ordered: OrderedDict[str, torch.Tensor] = OrderedDict()
    offset = 0
    for name, tensor in source.items():
        count = tensor.numel()
        view = flat[offset : offset + count].view(tensor.shape)
        view.copy_(tensor.detach())
        ordered[name] = view
        offset += count
    storage_key = str(flat.untyped_storage()._cdata)
    return ordered, storage_key


def _canonicalize_legacy_storage_key(
    path: Path,
    storage_key: str,
    *,
    expected_occurrences: int,
) -> None:
    raw = path.read_bytes()
    encoded = storage_key.encode("ascii")
    old = b"X" + struct.pack("<I", len(encoded)) + encoded
    canonical = b"0000000000000001"
    new = b"X" + struct.pack("<I", len(canonical)) + canonical
    if raw.count(old) != expected_occurrences:
        raise CheckpointIntegrityError("legacy checkpoint storage binding is not canonicalizable")
    path.write_bytes(raw.replace(old, new))


def _read_manifest(path: Path) -> dict[str, Any]:
    try:
        manifest = json.loads(path.read_bytes())
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise CheckpointIntegrityError("checkpoint manifest cannot be read") from error
    if not isinstance(manifest, dict):
        raise CheckpointIntegrityError("checkpoint manifest must be a JSON object")
    return manifest


def _validate_manifest(
    manifest: dict[str, Any],
    *,
    checkpoint_path: Path,
    require_scope: str | None,
    expected_dataset_manifest_sha256: str | None,
    expected_config: Mapping[str, Any] | None,
) -> None:
    missing = _MANIFEST_FIELDS - set(manifest)
    unknown = set(manifest) - _MANIFEST_FIELDS
    if missing or unknown:
        detail = sorted(missing or unknown)[0]
        raise CheckpointCompatibilityError(f"checkpoint manifest field mismatch: {detail}")
    _require_equal(manifest, "source", CHECKPOINT_SOURCE)
    _require_equal(manifest, "schema_version", CHECKPOINT_SCHEMA_VERSION)

    scope = manifest.get("training_scope")
    if require_scope is not None and scope != require_scope:
        raise CheckpointScopeError(
            f"checkpoint training_scope must be {require_scope}, got {scope!r}"
        )
    if scope != TRAINING_SCOPE:
        raise CheckpointScopeError(
            f"checkpoint training_scope must be {TRAINING_SCOPE}, got {scope!r}"
        )

    _require_equal(manifest, "model_name", MODEL_NAME)
    _require_equal(manifest, "model_version", MODEL_VERSION)
    _require_equal(manifest, "dataset_version", DATASET_VERSION)
    _require_equal(manifest, "device", "cpu")
    _require_equal(manifest, "deterministic_algorithms", True)
    if manifest.get("checkpoint_file") != checkpoint_path.name:
        raise CheckpointIntegrityError("checkpoint_file does not bind the checkpoint basename")
    _validate_sha256(manifest.get("dataset_manifest_sha256"), "dataset_manifest_sha256")
    _validate_sha256(manifest.get("checkpoint_sha256"), "checkpoint_sha256")

    if expected_dataset_manifest_sha256 is not None:
        _validate_sha256(
            expected_dataset_manifest_sha256,
            "expected dataset_manifest_sha256",
        )
        if manifest["dataset_manifest_sha256"] != expected_dataset_manifest_sha256:
            raise CheckpointIntegrityError("dataset manifest SHA-256 mismatch")

    if not isinstance(manifest.get("code_revision"), str) or not manifest[
        "code_revision"
    ].strip():
        raise CheckpointCompatibilityError("code_revision must be a non-empty string")
    for field in ("python_version", "torch_version"):
        if not isinstance(manifest.get(field), str) or not manifest[field]:
            raise CheckpointCompatibilityError(f"{field} must be a non-empty string")
    _validate_seed(manifest.get("seed"))
    config = _validated_manifest_config(manifest.get("config"))
    if expected_config is not None and dict(expected_config) != config:
        raise CheckpointCompatibilityError("checkpoint config does not match expected config")


def _validated_manifest_config(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != _CONFIG_FIELDS:
        raise CheckpointCompatibilityError("checkpoint config fields are incompatible")
    for field, expected in (
        ("condition_size", CONDITION_SIZE),
        ("latent_size", LATENT_SIZE),
        ("coarse_size", COARSE_SIZE),
    ):
        if value.get(field) != expected:
            raise CheckpointCompatibilityError(
                f"checkpoint config {field} must be {expected}"
            )
    _validate_steps(value.get("steps"))
    _validate_learning_rate(value.get("learning_rate"))
    return dict(value)


def _validate_loaded_state_dict(payload: Any) -> OrderedDict[str, torch.Tensor]:
    if not isinstance(payload, OrderedDict):
        raise CheckpointCompatibilityError("checkpoint payload must be an ordered state_dict")
    for name, tensor in payload.items():
        if not isinstance(name, str) or not isinstance(tensor, torch.Tensor):
            raise CheckpointCompatibilityError("checkpoint state_dict must map names to tensors")
        if tensor.device.type != "cpu":
            raise CheckpointCompatibilityError("checkpoint state_dict must contain only CPU tensors")
        if tensor.is_floating_point() and not bool(torch.isfinite(tensor).all()):
            raise CheckpointCompatibilityError("checkpoint state_dict tensors must be finite")

    with torch.random.fork_rng(devices=[]):
        expected = TinyConditionalVAE(
            condition_size=CONDITION_SIZE,
            latent_size=LATENT_SIZE,
            coarse_size=COARSE_SIZE,
        ).cpu().state_dict()
    if tuple(payload) != tuple(expected):
        raise CheckpointCompatibilityError("checkpoint state_dict keys are incompatible")
    for name, expected_tensor in expected.items():
        tensor = payload[name]
        if tensor.shape != expected_tensor.shape or tensor.dtype != expected_tensor.dtype:
            raise CheckpointCompatibilityError(
                f"checkpoint state_dict tensor is incompatible: {name}"
            )
    return OrderedDict((name, tensor.detach().contiguous()) for name, tensor in payload.items())


def _validate_run_config(config: Any) -> tuple[int, int, float]:
    try:
        seed = config.seed
        steps = config.steps
        learning_rate = config.learning_rate
    except AttributeError as error:
        raise CheckpointCompatibilityError("checkpoint config is missing required values") from error
    _validate_seed(seed)
    _validate_steps(steps)
    _validate_learning_rate(learning_rate)
    return seed, steps, learning_rate


def _validate_seed(seed: Any) -> None:
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed < 2**32:
        raise CheckpointCompatibilityError("seed must be an integer in 0..4294967295")


def _validate_steps(steps: Any) -> None:
    if isinstance(steps, bool) or not isinstance(steps, int):
        raise CheckpointCompatibilityError("steps must be an integer")
    if steps <= 0:
        raise CheckpointCompatibilityError("steps must be positive")


def _validate_learning_rate(learning_rate: Any) -> None:
    if isinstance(learning_rate, bool) or not isinstance(learning_rate, (int, float)):
        raise CheckpointCompatibilityError("learning_rate must be numeric")
    if not math.isfinite(learning_rate):
        raise CheckpointCompatibilityError("learning_rate must be finite")
    if learning_rate <= 0:
        raise CheckpointCompatibilityError("learning_rate must be positive")


def _validate_sha256(value: Any, field: str) -> None:
    if not isinstance(value, str) or _SHA256_PATTERN.fullmatch(value) is None:
        raise CheckpointIntegrityError(f"{field} must be a lowercase SHA-256")


def _require_equal(manifest: dict[str, Any], field: str, expected: Any) -> None:
    if manifest.get(field) != expected:
        raise CheckpointCompatibilityError(
            f"checkpoint manifest {field} must be {expected!r}"
        )
