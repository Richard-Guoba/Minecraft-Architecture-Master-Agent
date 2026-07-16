from __future__ import annotations

import hashlib
import json
import math
import os
import pickle
import random
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn

from .private_research import PrivateResearchError
from .private_research_model import PRIVATE_SHAPE, TinyMaskedVoxelAutoencoder
from .private_research_runtime import (
    PrivateRunPaths,
    RuntimeServices,
    atomic_write_json,
)


SNAPSHOT_SOURCE = "stage7-private-research-resume-v1"
SNAPSHOT_SCHEMA_VERSION = 1
POINTER_SCHEMA_VERSION = 1
SNAPSHOT_KEYS = {
    "source",
    "schema_version",
    "generation",
    "binding",
    "completed_steps",
    "active_seconds",
    "model_state",
    "optimizer_state",
    "losses",
    "reconstruction",
    "python_rng",
    "numpy_rng",
    "torch_rng",
}
SNAPSHOT_FAULT_STAGES = (
    "snapshot_after_temp_fsync",
    "snapshot_after_temp_validate",
    "snapshot_after_slot_replace",
    "snapshot_after_slot_dir_fsync",
    "snapshot_after_pointer_replace",
)
_POINTER_FIELDS = {
    "schema_version",
    "active_slot",
    "generation",
    "snapshot_sha256",
}
_PYTHON_RNG_FIELDS = {"version", "state", "has_gauss", "gaussian"}
_NUMPY_RNG_FIELDS = {
    "bit_generator",
    "keys",
    "position",
    "has_gauss",
    "cached_gaussian",
}
_SGD_GROUP_FIELDS = {
    "lr",
    "momentum",
    "dampening",
    "weight_decay",
    "nesterov",
    "maximize",
    "foreach",
    "differentiable",
    "fused",
    "params",
}


@dataclass(frozen=True)
class SnapshotPointer:
    schema_version: int
    active_slot: str
    generation: int
    snapshot_sha256: str


@dataclass(frozen=True)
class LoadedResumeSnapshot:
    generation: int
    completed_steps: int
    active_seconds: float
    binding: dict[str, Any]
    model_state: OrderedDict[str, torch.Tensor]
    optimizer_state: dict[str, Any]
    losses: torch.Tensor
    reconstruction: torch.Tensor | None
    python_rng: dict[str, Any]
    numpy_rng: dict[str, Any]
    torch_rng: torch.Tensor


def capture_rng_state() -> tuple[dict[str, Any], dict[str, Any], torch.Tensor]:
    python_state = random.getstate()
    python_gaussian = python_state[2]
    python_rng = {
        "version": int(python_state[0]),
        "state": torch.tensor(python_state[1], dtype=torch.int64),
        "has_gauss": python_gaussian is not None,
        "gaussian": float(python_gaussian) if python_gaussian is not None else 0.0,
    }

    numpy_state = np.random.get_state()
    numpy_rng = {
        "bit_generator": str(numpy_state[0]),
        "keys": torch.from_numpy(
            np.asarray(numpy_state[1], dtype=np.int64).copy()
        ),
        "position": int(numpy_state[2]),
        "has_gauss": bool(numpy_state[3]),
        "cached_gaussian": float(numpy_state[4]),
    }
    torch_rng = torch.get_rng_state().to("cpu", dtype=torch.uint8).clone()
    _validate_python_rng(python_rng)
    _validate_numpy_rng(numpy_rng)
    _validate_torch_rng(torch_rng)
    return python_rng, numpy_rng, torch_rng


def restore_rng_state(
    *,
    python_rng: dict[str, Any],
    numpy_rng: dict[str, Any],
    torch_rng: torch.Tensor,
) -> None:
    _validate_python_rng(python_rng)
    _validate_numpy_rng(numpy_rng)
    _validate_torch_rng(torch_rng)
    python_gaussian = (
        float(python_rng["gaussian"]) if python_rng["has_gauss"] else None
    )
    random.setstate(
        (
            int(python_rng["version"]),
            tuple(int(value) for value in python_rng["state"].tolist()),
            python_gaussian,
        )
    )
    np.random.set_state(
        (
            str(numpy_rng["bit_generator"]),
            numpy_rng["keys"].numpy().astype(np.uint32, copy=True),
            int(numpy_rng["position"]),
            int(bool(numpy_rng["has_gauss"])),
            float(numpy_rng["cached_gaussian"]),
        )
    )
    torch.set_rng_state(torch_rng.clone())


def commit_resume_snapshot(
    *,
    paths: PrivateRunPaths,
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    losses: torch.Tensor,
    reconstruction: torch.Tensor | None,
    completed_steps: int,
    generation: int,
    binding: dict[str, Any],
    active_seconds: float,
    services: RuntimeServices | None = None,
) -> SnapshotPointer:
    runtime_services = services or RuntimeServices()
    python_rng, numpy_rng, torch_rng = capture_rng_state()
    payload = {
        "source": SNAPSHOT_SOURCE,
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "generation": generation,
        "binding": _clone_safe_value(binding),
        "completed_steps": completed_steps,
        "active_seconds": active_seconds,
        "model_state": _cpu_model_state(model),
        "optimizer_state": _clone_safe_value(optimizer.state_dict()),
        "losses": losses.detach().to("cpu").clone(),
        "reconstruction": None
        if reconstruction is None
        else reconstruction.detach().to("cpu").contiguous().clone(),
        "python_rng": python_rng,
        "numpy_rng": numpy_rng,
        "torch_rng": torch_rng,
    }
    _validate_snapshot_payload(payload, expected_binding=binding)
    slot_path = paths.resume_a_path if generation % 2 == 0 else paths.resume_b_path
    temporary = slot_path.with_name(slot_path.name + ".tmp")
    if temporary.is_symlink() or slot_path.is_symlink():
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", str(slot_path))
    try:
        with temporary.open("wb") as handle:
            torch.save(payload, handle)
            handle.flush()
            os.fsync(handle.fileno())
    except OSError as error:
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", str(slot_path)) from error
    runtime_services.fault_hook("snapshot_after_temp_fsync")
    validated = _load_snapshot_file(temporary, expected_binding=binding)
    if validated.generation != generation:
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "generation")
    runtime_services.fault_hook("snapshot_after_temp_validate")
    snapshot_sha256 = _sha256_file(temporary)
    try:
        os.replace(temporary, slot_path)
    except OSError as error:
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", str(slot_path)) from error
    runtime_services.fault_hook("snapshot_after_slot_replace")
    _fsync_directory(paths.runtime_path)
    runtime_services.fault_hook("snapshot_after_slot_dir_fsync")
    pointer = SnapshotPointer(
        schema_version=POINTER_SCHEMA_VERSION,
        active_slot=slot_path.name,
        generation=generation,
        snapshot_sha256=snapshot_sha256,
    )
    atomic_write_json(
        paths.resume_pointer_path,
        {
            "schema_version": pointer.schema_version,
            "active_slot": pointer.active_slot,
            "generation": pointer.generation,
            "snapshot_sha256": pointer.snapshot_sha256,
        },
    )
    runtime_services.fault_hook("snapshot_after_pointer_replace")
    return pointer


def load_latest_resume_snapshot(
    *,
    paths: PrivateRunPaths,
    expected_binding: dict[str, Any],
) -> LoadedResumeSnapshot:
    pointer = _try_read_pointer(paths.resume_pointer_path)
    if pointer is not None:
        selected = _slot_for_name(paths, pointer.active_slot)
        other = (
            paths.resume_b_path
            if selected == paths.resume_a_path
            else paths.resume_a_path
        )
        try:
            if _sha256_file(selected) != pointer.snapshot_sha256:
                raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "pointer hash")
            loaded = _load_snapshot_file(selected, expected_binding=expected_binding)
            if loaded.generation != pointer.generation:
                raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "pointer generation")
            return loaded
        except PrivateResearchError:
            try:
                return _load_snapshot_file(other, expected_binding=expected_binding)
            except PrivateResearchError as error:
                raise PrivateResearchError(
                    "RESUME_SNAPSHOT_INVALID",
                    "pointer and fallback slots",
                ) from error

    valid: list[LoadedResumeSnapshot] = []
    for slot in (paths.resume_a_path, paths.resume_b_path):
        try:
            valid.append(_load_snapshot_file(slot, expected_binding=expected_binding))
        except PrivateResearchError:
            continue
    if not valid:
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "no valid slot")
    highest = max(snapshot.generation for snapshot in valid)
    newest = [snapshot for snapshot in valid if snapshot.generation == highest]
    if len(newest) != 1:
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "generation tie")
    return newest[0]


def restore_model_optimizer(
    snapshot: LoadedResumeSnapshot,
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
) -> None:
    try:
        model.load_state_dict(snapshot.model_state, strict=True)
        optimizer.load_state_dict(snapshot.optimizer_state)
    except (KeyError, RuntimeError, TypeError, ValueError) as error:
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "restore") from error
    restore_rng_state(
        python_rng=snapshot.python_rng,
        numpy_rng=snapshot.numpy_rng,
        torch_rng=snapshot.torch_rng,
    )


def _load_snapshot_file(
    path: Path,
    *,
    expected_binding: dict[str, Any],
) -> LoadedResumeSnapshot:
    if path.is_symlink() or not path.is_file():
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", str(path))
    try:
        payload = torch.load(path, map_location="cpu", weights_only=True)
    except (OSError, RuntimeError, TypeError, ValueError, pickle.UnpicklingError) as error:
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", str(path)) from error
    return _validate_snapshot_payload(payload, expected_binding=expected_binding)


def _validate_snapshot_payload(
    payload: Any,
    *,
    expected_binding: dict[str, Any],
) -> LoadedResumeSnapshot:
    if not isinstance(payload, dict) or set(payload) != SNAPSHOT_KEYS:
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "payload fields")
    if payload.get("source") != SNAPSHOT_SOURCE:
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "source")
    if payload.get("schema_version") != SNAPSHOT_SCHEMA_VERSION:
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "schema_version")
    generation = payload.get("generation")
    if not _is_nonnegative_integer(generation):
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "generation")
    binding = payload.get("binding")
    if not isinstance(binding, dict) or binding != expected_binding:
        raise PrivateResearchError("RESUME_BINDING_MISMATCH", "binding")
    target_steps = binding.get("target_steps")
    completed_steps = payload.get("completed_steps")
    if (
        not _is_positive_integer(target_steps)
        or not _is_nonnegative_integer(completed_steps)
        or completed_steps > target_steps
    ):
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "completed_steps")
    active_seconds = payload.get("active_seconds")
    if not _is_finite_nonnegative(active_seconds):
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "active_seconds")
    losses = payload.get("losses")
    if (
        not isinstance(losses, torch.Tensor)
        or losses.device.type != "cpu"
        or losses.dtype != torch.float64
        or tuple(losses.shape) != (completed_steps,)
        or not bool(torch.isfinite(losses).all())
    ):
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "losses")
    reconstruction = payload.get("reconstruction")
    if completed_steps == 0:
        if reconstruction is not None:
            raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "reconstruction")
    elif (
        not isinstance(reconstruction, torch.Tensor)
        or reconstruction.device.type != "cpu"
        or reconstruction.dtype != torch.uint8
        or tuple(reconstruction.shape) != PRIVATE_SHAPE
        or not reconstruction.is_contiguous()
    ):
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "reconstruction")
    model_state = payload.get("model_state")
    _validate_model_state(model_state)
    optimizer_state = payload.get("optimizer_state")
    _validate_optimizer_state(
        optimizer_state,
        learning_rate=binding.get("learning_rate"),
    )
    python_rng = payload.get("python_rng")
    numpy_rng = payload.get("numpy_rng")
    torch_rng = payload.get("torch_rng")
    _validate_python_rng(python_rng)
    _validate_numpy_rng(numpy_rng)
    _validate_torch_rng(torch_rng)
    return LoadedResumeSnapshot(
        generation=int(generation),
        completed_steps=int(completed_steps),
        active_seconds=float(active_seconds),
        binding=binding,
        model_state=model_state,
        optimizer_state=optimizer_state,
        losses=losses,
        reconstruction=reconstruction,
        python_rng=python_rng,
        numpy_rng=numpy_rng,
        torch_rng=torch_rng,
    )


def _validate_model_state(value: Any) -> None:
    if not isinstance(value, (dict, OrderedDict)):
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "model_state")
    with torch.random.fork_rng(devices=[]):
        expected = TinyMaskedVoxelAutoencoder().state_dict()
    if list(value) != list(expected):
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "model keys")
    for name, expected_tensor in expected.items():
        tensor = value.get(name)
        if (
            not isinstance(tensor, torch.Tensor)
            or tensor.device.type != "cpu"
            or tensor.shape != expected_tensor.shape
            or tensor.dtype != expected_tensor.dtype
            or not bool(torch.isfinite(tensor).all())
        ):
            raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "model " + name)


def _validate_optimizer_state(value: Any, *, learning_rate: Any) -> None:
    if not isinstance(value, dict) or set(value) != {"state", "param_groups"}:
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "optimizer fields")
    state = value.get("state")
    groups = value.get("param_groups")
    if not isinstance(state, dict) or not isinstance(groups, list) or len(groups) != 1:
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "optimizer structure")
    group = groups[0]
    if not isinstance(group, dict) or set(group) != _SGD_GROUP_FIELDS:
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "optimizer group")
    params = group.get("params")
    if (
        not isinstance(params, list)
        or len(params) != 11
        or any(not _is_nonnegative_integer(value) for value in params)
        or len(set(params)) != 11
    ):
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "optimizer params")
    if (
        isinstance(learning_rate, bool)
        or not isinstance(learning_rate, (int, float))
        or not math.isfinite(float(learning_rate))
        or float(group.get("lr", float("nan"))) != float(learning_rate)
    ):
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "optimizer lr")
    _validate_safe_value(value, path="optimizer_state")


def _validate_python_rng(value: Any) -> None:
    if not isinstance(value, dict) or set(value) != _PYTHON_RNG_FIELDS:
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "python_rng")
    if not _is_positive_integer(value.get("version")):
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "python_rng version")
    state = value.get("state")
    if (
        not isinstance(state, torch.Tensor)
        or state.device.type != "cpu"
        or state.dtype != torch.int64
        or state.ndim != 1
        or state.numel() != 625
    ):
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "python_rng state")
    if not isinstance(value.get("has_gauss"), bool):
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "python_rng gaussian")
    if not _is_finite_number(value.get("gaussian")):
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "python_rng gaussian")


def _validate_numpy_rng(value: Any) -> None:
    if not isinstance(value, dict) or set(value) != _NUMPY_RNG_FIELDS:
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "numpy_rng")
    if value.get("bit_generator") != "MT19937":
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "numpy_rng generator")
    keys = value.get("keys")
    if (
        not isinstance(keys, torch.Tensor)
        or keys.device.type != "cpu"
        or keys.dtype != torch.int64
        or keys.ndim != 1
        or keys.numel() != 624
        or bool((keys < 0).any())
        or bool((keys > 2**32 - 1).any())
    ):
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "numpy_rng keys")
    position = value.get("position")
    if not _is_nonnegative_integer(position) or position > 624:
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "numpy_rng position")
    if not isinstance(value.get("has_gauss"), bool):
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "numpy_rng gaussian")
    if not _is_finite_number(value.get("cached_gaussian")):
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "numpy_rng gaussian")


def _validate_torch_rng(value: Any) -> None:
    if (
        not isinstance(value, torch.Tensor)
        or value.device.type != "cpu"
        or value.dtype != torch.uint8
        or value.ndim != 1
        or value.numel() == 0
    ):
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "torch_rng")


def _cpu_model_state(model: nn.Module) -> OrderedDict[str, torch.Tensor]:
    return OrderedDict(
        (name, tensor.detach().to("cpu").clone())
        for name, tensor in model.state_dict().items()
    )


def _clone_safe_value(value: Any) -> Any:
    if isinstance(value, torch.Tensor):
        return value.detach().to("cpu").clone()
    if isinstance(value, dict):
        return {key: _clone_safe_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_clone_safe_value(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_clone_safe_value(item) for item in value)
    if isinstance(value, str):
        return str(value)
    if value is None or isinstance(value, (bool, int)):
        return value
    if isinstance(value, float) and math.isfinite(value):
        return value
    raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "unsafe payload value")


def _validate_safe_value(value: Any, *, path: str) -> None:
    if isinstance(value, torch.Tensor):
        if value.device.type != "cpu" or not bool(torch.isfinite(value).all()):
            raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", path)
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, (int, str)) or isinstance(key, bool):
                raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", path)
            _validate_safe_value(item, path=path)
        return
    if isinstance(value, (list, tuple)):
        for item in value:
            _validate_safe_value(item, path=path)
        return
    if value is None or isinstance(value, (bool, int, str)):
        return
    if isinstance(value, float) and math.isfinite(value):
        return
    raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", path)


def _try_read_pointer(path: Path) -> SnapshotPointer | None:
    if path.is_symlink() or not path.is_file():
        return None
    try:
        value = json.loads(path.read_text("utf8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(value, dict) or set(value) != _POINTER_FIELDS:
        return None
    active_slot = value.get("active_slot")
    generation = value.get("generation")
    snapshot_sha256 = value.get("snapshot_sha256")
    if (
        value.get("schema_version") != POINTER_SCHEMA_VERSION
        or active_slot not in {"resume-a.pt", "resume-b.pt"}
        or not _is_nonnegative_integer(generation)
        or not _is_sha256(snapshot_sha256)
    ):
        return None
    return SnapshotPointer(
        schema_version=POINTER_SCHEMA_VERSION,
        active_slot=active_slot,
        generation=int(generation),
        snapshot_sha256=str(snapshot_sha256),
    )


def _slot_for_name(paths: PrivateRunPaths, name: str) -> Path:
    if name == "resume-a.pt":
        return paths.resume_a_path
    if name == "resume-b.pt":
        return paths.resume_b_path
    raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "slot")


def _sha256_file(path: Path) -> str:
    if path.is_symlink() or not path.is_file():
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", str(path))
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError as error:
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", str(path)) from error


def _fsync_directory(path: Path) -> None:
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    except OSError as error:
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", str(path)) from error


def _is_positive_integer(value: Any) -> bool:
    return not isinstance(value, bool) and isinstance(value, int) and value > 0


def _is_nonnegative_integer(value: Any) -> bool:
    return not isinstance(value, bool) and isinstance(value, int) and value >= 0


def _is_finite_number(value: Any) -> bool:
    return (
        not isinstance(value, bool)
        and isinstance(value, (int, float))
        and math.isfinite(float(value))
    )


def _is_finite_nonnegative(value: Any) -> bool:
    return _is_finite_number(value) and float(value) >= 0.0


def _is_sha256(value: Any) -> bool:
    return (
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value)
    )
