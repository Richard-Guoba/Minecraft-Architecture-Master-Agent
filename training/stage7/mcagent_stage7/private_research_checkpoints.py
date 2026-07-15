from __future__ import annotations

import hashlib
import json
import math
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
from torch import nn

from .private_research import (
    PRIVATE_TAXONOMY_VERSION,
    PrivateResearchError,
    PrivateResearchPreflight,
)
from .private_research_model import TinyMaskedVoxelAutoencoder


PRIVATE_CHECKPOINT_SOURCE = "stage7-private-research-checkpoint-v1"


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
    actual_hash = _sha256_file(checkpoint_path)
    if actual_hash != manifest["checkpoint_sha256"]:
        raise PrivateResearchError("CHECKPOINT_HASH_MISMATCH", checkpoint_path.name)
    expected_model = TinyMaskedVoxelAutoencoder()
    expected_state = expected_model.state_dict()
    try:
        state = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    except Exception as error:
        raise PrivateResearchError(
            "CHECKPOINT_MODEL_INVALID", "weights-only load"
        ) from error
    if not isinstance(state, dict) or set(state) != set(expected_state):
        raise PrivateResearchError("CHECKPOINT_MODEL_INVALID", "state keys")
    for name, expected in expected_state.items():
        value = state[name]
        if (
            not isinstance(value, torch.Tensor)
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
    return LoadedPrivateCheckpoint(
        model=expected_model,
        manifest=manifest,
        checkpoint_sha256=actual_hash,
    )


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
