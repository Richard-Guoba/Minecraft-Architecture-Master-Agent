from __future__ import annotations

import hashlib
import io
import json
import math
import os
import re
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import torch
from torch import nn

from .semantic_balance import (
    OBJECTIVE_VERSION,
    UNIT_CLASS_WEIGHTS,
    UNIT_CLASS_WEIGHTS_SHA256,
    SemanticBalance,
)
from .training_data import TrainingError
from .voxel_model import MODEL_VERSION


CHECKPOINT_SOURCE = "minecraft-architecture-training-checkpoint-v1"
_RUN_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_STATUSES = {"running", "completed", "failed"}
_SEMANTIC_BINDING_KEYS = frozenset(
    {
        "objective_version",
        "semantic_balance",
        "semantic_class_weights",
        "semantic_class_weights_sha256",
    }
)


@dataclass(frozen=True)
class TrainingCheckpointBinding:
    run_id: str
    target_steps: int
    seed: int
    device: str
    batch_size: int
    learning_rate: float
    dataset_manifest_sha256: str
    split_sha256: str
    objective_version: str
    semantic_balance: str
    semantic_class_weights: tuple[float, ...]
    semantic_class_weights_sha256: str
    model_version: str = MODEL_VERSION

    def __post_init__(self) -> None:
        validate_run_id(self.run_id)
        if type(self.target_steps) is not int or self.target_steps <= 0:
            raise TrainingError("CHECKPOINT_BINDING_INVALID", "target_steps")
        if type(self.seed) is not int or not 0 <= self.seed < 2**32:
            raise TrainingError("CHECKPOINT_BINDING_INVALID", "seed")
        if self.device not in {"cpu", "cuda"}:
            raise TrainingError("CHECKPOINT_BINDING_INVALID", "device")
        if type(self.batch_size) is not int or self.batch_size <= 0:
            raise TrainingError("CHECKPOINT_BINDING_INVALID", "batch_size")
        if (
            isinstance(self.learning_rate, bool)
            or not isinstance(self.learning_rate, (int, float))
            or not math.isfinite(float(self.learning_rate))
            or float(self.learning_rate) <= 0.0
        ):
            raise TrainingError("CHECKPOINT_BINDING_INVALID", "learning_rate")
        if (
            not _valid_hash(self.dataset_manifest_sha256)
            or not _valid_hash(self.split_sha256)
            or self.model_version != MODEL_VERSION
        ):
            raise TrainingError("CHECKPOINT_BINDING_INVALID", "version or hash")
        if self.objective_version != OBJECTIVE_VERSION:
            raise TrainingError(
                "CHECKPOINT_BINDING_INVALID",
                "objective_version",
            )
        SemanticBalance(
            profile=self.semantic_balance,
            class_weights=self.semantic_class_weights,
            class_weights_sha256=self.semantic_class_weights_sha256,
        )


@dataclass(frozen=True)
class LoadedTrainingCheckpoint:
    completed_steps: int
    status: str
    metadata: dict[str, Any]


def save_training_checkpoint(
    *,
    root: Path,
    binding: TrainingCheckpointBinding,
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    completed_steps: int,
    status: str,
) -> LoadedTrainingCheckpoint:
    if not isinstance(binding, TrainingCheckpointBinding):
        raise TrainingError("CHECKPOINT_BINDING_INVALID", "type")
    _validate_progress(binding, completed_steps, status)
    model_state = model.state_dict()
    _validate_parameter_values(model_state)
    payload = {
        "model_state": model_state,
        "optimizer_state": optimizer.state_dict(),
        "completed_steps": completed_steps,
        "torch_rng_state": torch.get_rng_state(),
    }
    buffer = io.BytesIO()
    torch.save(payload, buffer)
    checkpoint_bytes = buffer.getvalue()
    checkpoint_sha256 = hashlib.sha256(checkpoint_bytes).hexdigest()
    run_path = resolve_run_path(root, binding.run_id, create=True)
    checkpoint_path = run_path / "checkpoint.pt"
    metadata_path = run_path / "checkpoint.json"
    metadata = {
        "source": CHECKPOINT_SOURCE,
        **asdict(binding),
        "completed_steps": completed_steps,
        "status": status,
        "checkpoint_file": "checkpoint.pt",
        "checkpoint_sha256": checkpoint_sha256,
    }
    atomic_write_bytes(checkpoint_path, checkpoint_bytes)
    atomic_write_json(metadata_path, metadata)
    return LoadedTrainingCheckpoint(
        completed_steps=completed_steps,
        status=status,
        metadata=metadata,
    )


def load_training_checkpoint(
    *,
    root: Path,
    binding: TrainingCheckpointBinding,
    model: nn.Module,
    optimizer: torch.optim.Optimizer | None,
) -> LoadedTrainingCheckpoint:
    if not isinstance(binding, TrainingCheckpointBinding):
        raise TrainingError("CHECKPOINT_BINDING_INVALID", "type")
    run_path = resolve_run_path(root, binding.run_id, create=False)
    metadata_path = _regular_file(run_path / "checkpoint.json")
    checkpoint_path = _regular_file(run_path / "checkpoint.pt")
    metadata = read_json(metadata_path, "CHECKPOINT_METADATA_INVALID")
    _validate_metadata(metadata, binding)
    expected_hash = metadata["checkpoint_sha256"]
    actual_hash = sha256_file(checkpoint_path)
    if actual_hash != expected_hash:
        raise TrainingError("CHECKPOINT_HASH_MISMATCH", binding.run_id)
    try:
        payload = torch.load(
            checkpoint_path,
            map_location="cpu",
            weights_only=True,
        )
    except Exception as error:
        raise TrainingError(
            "CHECKPOINT_PAYLOAD_INVALID",
            binding.run_id,
        ) from error
    if (
        not isinstance(payload, dict)
        or not isinstance(payload.get("model_state"), dict)
        or not isinstance(payload.get("optimizer_state"), dict)
        or payload.get("completed_steps") != metadata["completed_steps"]
    ):
        raise TrainingError("CHECKPOINT_PAYLOAD_INVALID", binding.run_id)
    state = payload["model_state"]
    _validate_parameter_state(state, model.state_dict())
    try:
        model.load_state_dict(state, strict=True)
        if optimizer is not None:
            optimizer.load_state_dict(payload["optimizer_state"])
    except (RuntimeError, ValueError, KeyError) as error:
        raise TrainingError(
            "CHECKPOINT_STATE_INVALID",
            binding.run_id,
        ) from error
    rng_state = payload.get("torch_rng_state")
    if isinstance(rng_state, torch.Tensor):
        torch.set_rng_state(rng_state)
    return LoadedTrainingCheckpoint(
        completed_steps=metadata["completed_steps"],
        status=metadata["status"],
        metadata=metadata,
    )


def dataset_binding_hashes(root: Path) -> tuple[str, str]:
    training_root = resolved_training_root(root)
    manifest = _regular_file(
        training_root / "dataset" / "manifest.json"
    )
    split = _regular_file(training_root / "splits" / "split.json")
    return sha256_file(manifest), sha256_file(split)


def binding_from_checkpoint_metadata(
    metadata: dict[str, Any],
) -> TrainingCheckpointBinding:
    if (
        not isinstance(metadata, dict)
        or metadata.get("source") != CHECKPOINT_SOURCE
    ):
        raise TrainingError("CHECKPOINT_METADATA_INVALID", "source")
    present = _SEMANTIC_BINDING_KEYS.intersection(metadata)
    if present and present != _SEMANTIC_BINDING_KEYS:
        raise TrainingError(
            "CHECKPOINT_METADATA_INVALID",
            "partial semantic binding",
        )
    if present:
        weights = metadata.get("semantic_class_weights")
        if not isinstance(weights, list):
            raise TrainingError(
                "CHECKPOINT_METADATA_INVALID",
                "semantic_class_weights",
            )
        objective_version = metadata.get("objective_version")
        semantic_balance = metadata.get("semantic_balance")
        semantic_class_weights = tuple(weights)
        semantic_class_weights_sha256 = metadata.get(
            "semantic_class_weights_sha256"
        )
    else:
        objective_version = OBJECTIVE_VERSION
        semantic_balance = "none"
        semantic_class_weights = UNIT_CLASS_WEIGHTS
        semantic_class_weights_sha256 = UNIT_CLASS_WEIGHTS_SHA256
    return TrainingCheckpointBinding(
        run_id=metadata.get("run_id"),
        target_steps=metadata.get("target_steps"),
        seed=metadata.get("seed"),
        device=metadata.get("device"),
        batch_size=metadata.get("batch_size"),
        learning_rate=metadata.get("learning_rate"),
        dataset_manifest_sha256=metadata.get(
            "dataset_manifest_sha256"
        ),
        split_sha256=metadata.get("split_sha256"),
        objective_version=objective_version,
        semantic_balance=semantic_balance,
        semantic_class_weights=semantic_class_weights,
        semantic_class_weights_sha256=semantic_class_weights_sha256,
        model_version=metadata.get("model_version"),
    )


def resolve_run_path(root: Path, run_id: str, *, create: bool) -> Path:
    validate_run_id(run_id)
    training_root = resolved_training_root(root)
    runs = training_root / "runs"
    if runs.is_symlink():
        raise TrainingError("RUN_PATH_INVALID", str(runs))
    if create:
        runs.mkdir(exist_ok=True)
    if not runs.is_dir():
        raise TrainingError("RUN_PATH_INVALID", str(runs))
    run = runs / run_id
    if run.is_symlink():
        raise TrainingError("RUN_PATH_INVALID", str(run))
    if create:
        run.mkdir(exist_ok=True)
    if not run.is_dir():
        raise TrainingError("RUN_MISSING", run_id)
    resolved = run.resolve()
    try:
        resolved.relative_to(training_root)
    except ValueError as error:
        raise TrainingError("RUN_PATH_INVALID", run_id) from error
    return resolved


def resolved_training_root(root: Path) -> Path:
    try:
        value = Path(root).resolve(strict=True)
    except (OSError, RuntimeError) as error:
        raise TrainingError("TRAINING_ROOT_INVALID", str(root)) from error
    if not value.is_dir():
        raise TrainingError("TRAINING_ROOT_INVALID", str(root))
    return value


def validate_run_id(run_id: str) -> str:
    if not isinstance(run_id, str) or not _RUN_ID.fullmatch(run_id):
        raise TrainingError("RUN_ID_INVALID", str(run_id))
    return run_id


def atomic_write_json(path: Path, value: object) -> None:
    atomic_write_bytes(
        path,
        (
            json.dumps(value, sort_keys=True, indent=2) + "\n"
        ).encode("utf8"),
    )


def atomic_write_bytes(path: Path, payload: bytes) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(
        prefix=f".{path.name}.tmp-",
        dir=path.parent,
    )
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def read_json(path: Path, code: str) -> dict[str, Any]:
    try:
        value = json.loads(Path(path).read_text(encoding="utf8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise TrainingError(code, str(path)) from error
    if not isinstance(value, dict):
        raise TrainingError(code, str(path))
    return value


def sha256_file(path: Path) -> str:
    try:
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()
    except OSError as error:
        raise TrainingError("PATH_READ_FAILED", str(path)) from error


def _validate_metadata(
    metadata: dict[str, Any],
    binding: TrainingCheckpointBinding,
) -> None:
    saved_binding = binding_from_checkpoint_metadata(metadata)
    if (
        saved_binding.dataset_manifest_sha256
        != binding.dataset_manifest_sha256
        or saved_binding.split_sha256 != binding.split_sha256
    ):
        raise TrainingError("CHECKPOINT_DATASET_MISMATCH", binding.run_id)
    for key, value in asdict(binding).items():
        if key in {"dataset_manifest_sha256", "split_sha256"}:
            continue
        if getattr(saved_binding, key) != value:
            raise TrainingError("CHECKPOINT_CONFIG_MISMATCH", key)
    completed_steps = metadata.get("completed_steps")
    status = metadata.get("status")
    _validate_progress(binding, completed_steps, status)
    if (
        metadata.get("checkpoint_file") != "checkpoint.pt"
        or not _valid_hash(metadata.get("checkpoint_sha256"))
    ):
        raise TrainingError("CHECKPOINT_METADATA_INVALID", "checkpoint")


def _validate_progress(
    binding: TrainingCheckpointBinding,
    completed_steps: object,
    status: object,
) -> None:
    if (
        type(completed_steps) is not int
        or not 0 <= completed_steps <= binding.target_steps
        or status not in _STATUSES
    ):
        raise TrainingError("CHECKPOINT_PROGRESS_INVALID", str(completed_steps))


def _validate_parameter_state(
    state: dict[str, Any],
    expected: dict[str, torch.Tensor],
) -> None:
    if set(state) != set(expected):
        raise TrainingError("CHECKPOINT_PARAMETER_KEYS", "model")
    for key, expected_value in expected.items():
        value = state[key]
        if not isinstance(value, torch.Tensor):
            raise TrainingError("CHECKPOINT_PARAMETER_INVALID", key)
        if value.shape != expected_value.shape:
            raise TrainingError("CHECKPOINT_PARAMETER_SHAPE", key)
        if value.dtype != expected_value.dtype:
            raise TrainingError("CHECKPOINT_PARAMETER_DTYPE", key)
    _validate_parameter_values(state)


def _validate_parameter_values(state: dict[str, torch.Tensor]) -> None:
    for key, value in state.items():
        if (
            value.is_floating_point()
            and not bool(torch.isfinite(value).all())
        ):
            raise TrainingError("CHECKPOINT_PARAMETER_NONFINITE", key)


def _regular_file(path: Path) -> Path:
    if path.is_symlink() or not path.is_file():
        raise TrainingError("CHECKPOINT_FILE_INVALID", str(path))
    return path


def _valid_hash(value: object) -> bool:
    return isinstance(value, str) and bool(_SHA256.fullmatch(value))
