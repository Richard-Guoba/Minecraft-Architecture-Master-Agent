from __future__ import annotations

import hashlib
import json
from collections import OrderedDict
from pathlib import Path
from typing import Any

import torch
from torch import nn

from .private_research import PRIVATE_TAXONOMY_VERSION, PrivateResearchError


PRIVATE_CHECKPOINT_SOURCE = "stage7-private-research-checkpoint-v1"


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


def _ordered_cpu_state_dict(model: nn.Module) -> OrderedDict[str, torch.Tensor]:
    result: OrderedDict[str, torch.Tensor] = OrderedDict()
    for name, value in model.state_dict().items():
        if not isinstance(value, torch.Tensor) or not value.is_floating_point() or not bool(torch.isfinite(value).all()):
            raise PrivateResearchError("CHECKPOINT_MODEL_INVALID", name)
        result[name] = value.detach().cpu().contiguous().clone()
    return result


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _require_sha256(value: str, field: str) -> None:
    if not isinstance(value, str) or len(value) != 64 or any(character not in "0123456789abcdef" for character in value):
        raise PrivateResearchError("CHECKPOINT_CONFIG_INVALID", field)


def _canonical_json(value: dict[str, Any]) -> str:
    return json.dumps(value, sort_keys=True, indent=2) + "\n"
