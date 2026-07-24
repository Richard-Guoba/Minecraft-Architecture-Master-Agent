from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

import numpy as np
import torch
from torch.utils.data import Dataset


PATCH_SHAPE = (32, 32, 32)
TOKEN_COUNT = 9
MASK_TOKEN = 9
DATASET_SOURCE = "minecraft-architecture-training-dataset-v1"
PREPARATION_VERSION = "training-voxel-preparation-v1"
SPLITS = ("train", "validation", "test")
_SAMPLE_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,127}$")
_SHA256 = re.compile(r"^[a-f0-9]{64}$")


class TrainingError(ValueError):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(f"{code}: {detail}")
        self.code = code


@dataclass(frozen=True)
class TrainingSample:
    sample_id: str
    source_id: str
    split: str
    path: Path
    sha256: str
    token_counts: tuple[int, ...]
    non_air_count: int


class TrainingPatchDataset(Dataset[torch.Tensor]):
    def __init__(self, root: Path, split: str, seed: int = 7101) -> None:
        self.root = _resolved_directory(root)
        if split not in SPLITS:
            raise TrainingError("SPLIT_INVALID", str(split))
        _validate_seed(seed)
        self.split = split
        self.seed = seed
        manifest = _read_json(
            self.root / "dataset" / "manifest.json",
            "MANIFEST_INVALID",
        )
        split_document = _read_json(
            self.root / "splits" / "split.json",
            "SPLIT_INVALID",
        )
        assignments = _validate_split(split_document)
        _validate_manifest(manifest, split_document, assignments)
        records = [
            _sample_record(self.root, sample, assignments)
            for sample in manifest["samples"]
        ]
        self.samples = tuple(
            sorted(
                (record for record in records if record.split == split),
                key=lambda record: record.sample_id,
            )
        )
        if not self.samples:
            raise TrainingError("SPLIT_SAMPLES_EMPTY", split)
        self.sample_ids = tuple(record.sample_id for record in self.samples)

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int) -> torch.Tensor:
        try:
            sample = self.samples[index]
        except IndexError as error:
            raise IndexError(index) from error
        payload = sample.path.read_bytes()
        expected_size = math.prod(PATCH_SHAPE)
        if len(payload) != expected_size:
            raise TrainingError(
                "SAMPLE_LENGTH_INVALID",
                f"{sample.sample_id}:{len(payload)}",
            )
        digest = hashlib.sha256(payload).hexdigest()
        if digest != sample.sha256:
            raise TrainingError("SAMPLE_HASH_MISMATCH", sample.sample_id)
        values = np.frombuffer(payload, dtype=np.uint8).copy()
        if values.size == 0 or int(values.max()) >= TOKEN_COUNT:
            raise TrainingError("SAMPLE_TOKEN_INVALID", sample.sample_id)
        counts = np.bincount(values, minlength=TOKEN_COUNT)
        non_air_count = int(counts[1:].sum())
        if non_air_count == 0:
            raise TrainingError("SAMPLE_NON_AIR_MISSING", sample.sample_id)
        if (
            tuple(int(value) for value in counts) != sample.token_counts
            or non_air_count != sample.non_air_count
        ):
            raise TrainingError("SAMPLE_COUNTS_MISMATCH", sample.sample_id)
        return torch.from_numpy(values.reshape(PATCH_SHAPE)).long()


def make_balanced_mask(
    targets: torch.Tensor,
    seed: int,
    ratio: float = 0.25,
    semantic_balance: str = "none",
) -> tuple[torch.Tensor, torch.Tensor]:
    _validate_seed(seed)
    if semantic_balance not in ("none", "weighted", "weighted-mask"):
        raise TrainingError(
            "SEMANTIC_BALANCE_PROFILE_INVALID",
            str(semantic_balance),
        )
    if (
        not isinstance(ratio, (int, float))
        or isinstance(ratio, bool)
        or not math.isfinite(float(ratio))
        or not 0.0 < float(ratio) <= 1.0
    ):
        raise TrainingError("MASK_RATIO_INVALID", str(ratio))
    if (
        not isinstance(targets, torch.Tensor)
        or targets.dtype != torch.long
        or targets.ndim != 4
        or tuple(targets.shape[1:]) != PATCH_SHAPE
    ):
        raise TrainingError("MASK_TARGET_INVALID", "shape or dtype")
    if targets.numel() == 0:
        raise TrainingError("MASK_TARGET_INVALID", "empty")
    minimum = int(targets.min())
    maximum = int(targets.max())
    if minimum < 0 or maximum >= TOKEN_COUNT:
        raise TrainingError("MASK_TARGET_INVALID", "token range")

    visible = targets.clone()
    mask = torch.zeros_like(targets, dtype=torch.bool)
    desired = max(1, math.ceil(float(ratio) * math.prod(PATCH_SHAPE) / 2))
    for batch_index in range(targets.shape[0]):
        flattened = targets[batch_index].reshape(-1)
        air = torch.nonzero(flattened == 0, as_tuple=False).flatten()
        non_air = torch.nonzero(flattened != 0, as_tuple=False).flatten()
        if non_air.numel() == 0:
            raise TrainingError(
                "MASK_CLASS_MISSING",
                f"batch_index={batch_index}",
            )
        sample_seed = _mask_seed(seed, batch_index)
        generator = torch.Generator(device=targets.device)
        generator.manual_seed(sample_seed)
        selected_count = min(desired, air.numel(), non_air.numel())
        air_selected = air[
            torch.randperm(
                air.numel(),
                generator=generator,
                device=targets.device,
            )[:selected_count]
        ]
        non_air_count = (
            selected_count
            if air.numel() > 0
            else min(desired * 2, non_air.numel())
        )
        if semantic_balance == "weighted-mask":
            non_air_selected = _class_aware_non_air_selection(
                flattened=flattened,
                non_air=non_air,
                count=non_air_count,
                seed=sample_seed,
                generator=generator,
            )
        else:
            non_air_selected = non_air[
                torch.randperm(
                    non_air.numel(),
                    generator=generator,
                    device=targets.device,
                )[:non_air_count]
            ]
        flat_mask = mask[batch_index].reshape(-1)
        flat_mask[air_selected] = True
        flat_mask[non_air_selected] = True
    visible[mask] = MASK_TOKEN
    return visible, mask


def _class_aware_non_air_selection(
    *,
    flattened: torch.Tensor,
    non_air: torch.Tensor,
    count: int,
    seed: int,
    generator: torch.Generator,
) -> torch.Tensor:
    if (
        type(count) is not int
        or count <= 0
        or count > int(non_air.numel())
    ):
        raise TrainingError("MASK_SELECTION_INVALID", "count")
    present = [
        token
        for token in range(1, TOKEN_COUNT)
        if bool((flattened[non_air] == token).any())
    ]
    if not present:
        raise TrainingError("MASK_SELECTION_INVALID", "classes")
    offset = seed % len(present)
    ordered = present[offset:] + present[:offset]
    quota_budget = count // 2
    base_quota, remainder = divmod(quota_budget, len(ordered))
    quotas = {
        token: base_quota + (index < remainder)
        for index, token in enumerate(ordered)
    }

    shuffled: dict[int, torch.Tensor] = {}
    cursors: dict[int, int] = {}
    selected_chunks: list[torch.Tensor] = []
    for token in ordered:
        positions = non_air[flattened[non_air] == token]
        permutation = torch.randperm(
            positions.numel(),
            generator=generator,
            device=flattened.device,
        )
        shuffled[token] = positions[permutation]
        selected_count = min(quotas[token], int(positions.numel()))
        cursors[token] = selected_count
        if selected_count:
            selected_chunks.append(shuffled[token][:selected_count])

    selected_count = sum(int(chunk.numel()) for chunk in selected_chunks)
    remaining_quota = quota_budget - selected_count
    cycle_index = 0
    while remaining_quota > 0:
        token = ordered[cycle_index % len(ordered)]
        cycle_index += 1
        cursor = cursors[token]
        if cursor >= int(shuffled[token].numel()):
            if cycle_index > len(ordered) * (quota_budget + 1):
                raise TrainingError(
                    "MASK_SELECTION_INVALID",
                    "quota redistribution",
                )
            continue
        selected_chunks.append(shuffled[token][cursor : cursor + 1])
        cursors[token] = cursor + 1
        remaining_quota -= 1

    quota_selected = (
        torch.cat(selected_chunks)
        if selected_chunks
        else torch.empty(
            0,
            dtype=torch.long,
            device=flattened.device,
        )
    )
    selected_flags = torch.zeros_like(flattened, dtype=torch.bool)
    selected_flags[quota_selected] = True
    remaining_positions = non_air[~selected_flags[non_air]]
    fill_count = count - int(quota_selected.numel())
    fill_selected = remaining_positions[
        torch.randperm(
            remaining_positions.numel(),
            generator=generator,
            device=flattened.device,
        )[:fill_count]
    ]
    result = torch.cat((quota_selected, fill_selected))
    if (
        int(result.numel()) != count
        or int(torch.unique(result).numel()) != count
    ):
        raise TrainingError(
            "MASK_SELECTION_INVALID",
            "budget or duplicate",
        )
    return result


def _validate_manifest(
    manifest: dict[str, Any],
    split: dict[str, Any],
    assignments: dict[str, str],
) -> None:
    if manifest.get("source") != DATASET_SOURCE:
        raise TrainingError("MANIFEST_SOURCE_INVALID", str(manifest.get("source")))
    if manifest.get("preparation_version") != PREPARATION_VERSION:
        raise TrainingError(
            "MANIFEST_VERSION_INVALID",
            str(manifest.get("preparation_version")),
        )
    if manifest.get("patch_shape") != list(PATCH_SHAPE):
        raise TrainingError("MANIFEST_SHAPE_INVALID", "patch_shape")
    if manifest.get("patch_stride") != 16:
        raise TrainingError("MANIFEST_STRIDE_INVALID", "patch_stride")
    if manifest.get("seed") != split.get("seed"):
        raise TrainingError("MANIFEST_SPLIT_SEED_MISMATCH", "seed")
    sources = manifest.get("sources")
    samples = manifest.get("samples")
    if not isinstance(sources, list) or not isinstance(samples, list):
        raise TrainingError("MANIFEST_INVALID", "sources or samples")
    source_assignments: dict[str, str] = {}
    for source in sources:
        if not isinstance(source, dict):
            raise TrainingError("MANIFEST_INVALID", "source record")
        source_id = source.get("source_id")
        assignment = source.get("split")
        if (
            not isinstance(source_id, str)
            or source_id in source_assignments
            or assignment not in SPLITS
        ):
            raise TrainingError("MANIFEST_SOURCE_RECORD_INVALID", str(source_id))
        source_assignments[source_id] = assignment
    if source_assignments != assignments:
        raise TrainingError("MANIFEST_SOURCE_ASSIGNMENTS_MISMATCH", "sources")


def _validate_split(document: dict[str, Any]) -> dict[str, str]:
    assignments = document.get("assignments")
    if not isinstance(assignments, dict) or not assignments:
        raise TrainingError("SPLIT_INVALID", "assignments")
    listed: dict[str, str] = {}
    for split in SPLITS:
        source_ids = document.get(f"{split}_source_ids")
        if not isinstance(source_ids, list) or not source_ids:
            raise TrainingError("SPLIT_INVALID", f"{split}_source_ids")
        for source_id in source_ids:
            if not isinstance(source_id, str):
                raise TrainingError("SPLIT_INVALID", f"{split}:source_id")
            if source_id in listed:
                raise TrainingError("SPLIT_LEAKAGE", source_id)
            listed[source_id] = split
    normalized: dict[str, str] = {}
    for source_id, split in assignments.items():
        if not isinstance(source_id, str) or split not in SPLITS:
            raise TrainingError("SPLIT_INVALID", str(source_id))
        normalized[source_id] = split
    if listed != normalized:
        raise TrainingError("SPLIT_ASSIGNMENTS_MISMATCH", "source lists")
    return normalized


def _sample_record(
    root: Path,
    value: object,
    assignments: dict[str, str],
) -> TrainingSample:
    if not isinstance(value, dict):
        raise TrainingError("SAMPLE_RECORD_INVALID", "not an object")
    sample_id = value.get("sample_id")
    source_id = value.get("source_id")
    split = value.get("split")
    sha256 = value.get("sha256")
    if not isinstance(sample_id, str) or not _SAMPLE_ID.fullmatch(sample_id):
        raise TrainingError("SAMPLE_RECORD_INVALID", str(sample_id))
    if not isinstance(source_id, str) or source_id not in assignments:
        raise TrainingError("SAMPLE_SOURCE_INVALID", sample_id)
    if split != assignments[source_id]:
        raise TrainingError("SAMPLE_SPLIT_MISMATCH", sample_id)
    if not isinstance(sha256, str) or not _SHA256.fullmatch(sha256):
        raise TrainingError("SAMPLE_HASH_INVALID", sample_id)
    if value.get("shape") != list(PATCH_SHAPE):
        raise TrainingError("SAMPLE_SHAPE_INVALID", sample_id)
    token_counts = value.get("token_counts")
    non_air_count = value.get("non_air_count")
    if (
        not isinstance(token_counts, list)
        or len(token_counts) != TOKEN_COUNT
        or any(type(count) is not int or count < 0 for count in token_counts)
        or sum(token_counts) != math.prod(PATCH_SHAPE)
        or type(non_air_count) is not int
        or non_air_count < 0
        or non_air_count != sum(token_counts[1:])
    ):
        raise TrainingError("SAMPLE_COUNTS_INVALID", sample_id)
    relative = value.get("file")
    expected = PurePosixPath("dataset", "samples", f"{sample_id}.bin")
    if (
        not isinstance(relative, str)
        or PurePosixPath(relative) != expected
        or PurePosixPath(relative).is_absolute()
    ):
        raise TrainingError("SAMPLE_PATH_INVALID", sample_id)
    sample_path = _safe_file(root, expected, sample_id)
    return TrainingSample(
        sample_id=sample_id,
        source_id=source_id,
        split=split,
        path=sample_path,
        sha256=sha256,
        token_counts=tuple(token_counts),
        non_air_count=non_air_count,
    )


def _resolved_directory(value: Path) -> Path:
    path = Path(value)
    try:
        resolved = path.resolve(strict=True)
    except (OSError, RuntimeError) as error:
        raise TrainingError("TRAINING_ROOT_INVALID", str(path)) from error
    if not resolved.is_dir():
        raise TrainingError("TRAINING_ROOT_INVALID", str(path))
    return resolved


def _safe_file(root: Path, relative: PurePosixPath, sample_id: str) -> Path:
    candidate = root.joinpath(*relative.parts)
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise TrainingError("SAMPLE_PATH_INVALID", sample_id)
    try:
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(root)
    except (OSError, RuntimeError, ValueError) as error:
        raise TrainingError("SAMPLE_PATH_INVALID", sample_id) from error
    if not resolved.is_file():
        raise TrainingError("SAMPLE_PATH_INVALID", sample_id)
    return resolved


def _read_json(path: Path, code: str) -> dict[str, Any]:
    try:
        if path.is_symlink():
            raise TrainingError(code, str(path))
        value = json.loads(path.read_text(encoding="utf8"))
    except TrainingError:
        raise
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise TrainingError(code, str(path)) from error
    if not isinstance(value, dict):
        raise TrainingError(code, str(path))
    return value


def _validate_seed(seed: int) -> None:
    if type(seed) is not int or not 0 <= seed < 2**32:
        raise TrainingError("SEED_INVALID", str(seed))


def _mask_seed(seed: int, batch_index: int) -> int:
    digest = hashlib.sha256(
        f"balanced-training-mask-v1:{seed}:{batch_index}".encode("ascii")
    ).digest()
    return int.from_bytes(digest[:8], "big") % (2**63)
