from __future__ import annotations

import hashlib
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

import numpy as np
import torch
from torch.utils.data import Dataset

from .private_research_model import MASK_TOKEN, PRIVATE_SHAPE, PRIVATE_TOKEN_COUNT


PRIVATE_SCOPE = "stage7-private-research-only"
PRIVATE_TAXONOMY_VERSION = "private-raw-material-family-v1"
PRIVATE_MARKERS = {
    "rights_state": "unverified",
    "distribution": "prohibited",
    "purpose": "local-private-research-only",
}
EXPECTED_DATASET_HASHES = {
    "v1": "fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749",
    "v2": "af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654",
    "v3": "5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082",
}
_DATASET_MANIFESTS = {
    version: Path("mc_templates") / "datasets" / "coarse_semantic_voxels" / version / "manifest.json"
    for version in EXPECTED_DATASET_HASHES
}


class PrivateResearchError(ValueError):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(f"{code}: {detail}")
        self.code = code


@dataclass(frozen=True)
class PrivateResearchPreflight:
    root: Path
    case_count: int
    sources_manifest_sha256: str
    prepared_manifest_sha256: str
    split_sha256: str
    dataset_hashes: dict[str, str]
    dataset_v3_gate: dict[str, bool | int]


def run_private_preflight(*, root: Path, repo_root: Path) -> PrivateResearchPreflight:
    repository = _resolved_directory(repo_root, "REPO_ROOT_INVALID")
    private_root = _resolved_private_root(root, repository)
    _validate_acknowledgement(_read_json(_private_candidate(private_root, repository, "PRIVATE_RESEARCH_ACK.json")))
    datasets = _validate_formal_dataset(repository)

    source_records = _read_json_lines(_private_candidate(private_root, repository, "manifests/sources.jsonl"))
    prepared_path = _private_candidate(private_root, repository, "manifests/prepared.jsonl")
    prepared_records = _read_json_lines(prepared_path)
    split_path = _private_candidate(private_root, repository, "splits/split.json")
    split = _read_json(split_path)
    if not prepared_records:
        raise PrivateResearchError("PREPARED_EMPTY", "prepared manifest has no cases")

    sources = _index_source_records(source_records, private_root, repository)
    prepared = _index_prepared_records(prepared_records, sources, private_root, repository)
    _validate_split(split, prepared)
    return PrivateResearchPreflight(
        root=private_root,
        case_count=len(prepared),
        sources_manifest_sha256=_sha256_file(_private_candidate(private_root, repository, "manifests/sources.jsonl")),
        prepared_manifest_sha256=_sha256_file(prepared_path),
        split_sha256=_sha256_file(split_path),
        dataset_hashes=datasets,
        dataset_v3_gate={"ready_for_m3_real_data": False, "training_eligible_count": 0},
    )


class PrivatePreparedDataset(Dataset[tuple[torch.Tensor, torch.Tensor, torch.Tensor]]):
    def __init__(self, *, root: Path, split: str, seed: int, repo_root: Path | None = None) -> None:
        if split not in {"train", "validation"}:
            raise PrivateResearchError("SPLIT_INVALID", str(split))
        _validate_seed(seed)
        repository = _resolved_directory(repo_root) if repo_root is not None else _git_root(root)
        self.preflight = run_private_preflight(root=Path(root), repo_root=repository)
        split_data = _read_json(self.preflight.root / "splits" / "split.json")
        case_ids = split_data[f"{split}_case_ids"]
        if not case_ids:
            raise PrivateResearchError("SPLIT_EMPTY", split)
        records = {record["source_id"]: record for record in _read_json_lines(self.preflight.root / "manifests" / "prepared.jsonl")}
        self._records = tuple(records[case_id] for case_id in case_ids)
        self._root = self.preflight.root
        self._seed = seed

    def __len__(self) -> int:
        return len(self._records)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        if not isinstance(index, int) or not 0 <= index < len(self):
            raise IndexError(index)
        record = self._records[index]
        voxel_path = self._root / record["voxel_path"]
        values = np.frombuffer(voxel_path.read_bytes(), dtype=np.uint8).copy()
        target = torch.from_numpy(values.reshape(PRIVATE_SHAPE)).to(dtype=torch.long)
        visible, mask = make_masked_batch(target.unsqueeze(0), seed=(self._seed + index) % 2**32)
        return target, visible.squeeze(0), mask.squeeze(0)


def make_masked_batch(
    targets: torch.Tensor,
    *,
    seed: int,
    ratio: float = 0.25,
) -> tuple[torch.Tensor, torch.Tensor]:
    if not isinstance(targets, torch.Tensor) or targets.dtype != torch.long:
        raise ValueError("targets must be a torch.long tensor")
    if targets.ndim != 4 or tuple(targets.shape[1:]) != PRIVATE_SHAPE:
        raise ValueError("targets must have shape [batch, 64, 64, 64]")
    if targets.shape[0] <= 0 or int(targets.min()) < 0 or int(targets.max()) >= PRIVATE_TOKEN_COUNT:
        raise ValueError("target token values are out of range")
    _validate_seed(seed)
    if not isinstance(ratio, float) or not 0 < ratio <= 1:
        raise ValueError("ratio must be in (0, 1]")
    generator = torch.Generator(device="cpu").manual_seed(seed)
    mask = torch.rand(targets.shape, generator=generator) < ratio
    if not bool(mask.any()):
        mask.reshape(-1)[0] = True
    visible = targets.clone()
    visible[mask] = MASK_TOKEN
    return visible, mask


def _resolved_directory(path: Path, error_code: str = "REPO_ROOT_INVALID") -> Path:
    candidate = Path(path)
    if candidate.is_symlink() or not candidate.is_dir():
        raise PrivateResearchError(error_code, str(candidate))
    return candidate.resolve()


def _resolved_private_root(root: Path, repository: Path) -> Path:
    candidate = Path(root)
    if candidate.is_symlink() or not candidate.is_dir():
        raise PrivateResearchError("ROOT_INVALID", str(candidate))
    resolved = candidate.resolve()
    _require_inside(repository, resolved, "PATH_OUTSIDE_PRIVATE_ROOT")
    _assert_ignored_untracked(resolved, repository)
    return resolved


def _private_candidate(root: Path, repository: Path, relative: str) -> Path:
    path = PurePosixPath(relative)
    if path.is_absolute() or ".." in path.parts:
        raise PrivateResearchError("PATH_OUTSIDE_PRIVATE_ROOT", relative)
    candidate = root.joinpath(*path.parts)
    if candidate.is_symlink() or not candidate.exists():
        raise PrivateResearchError("PATH_MISSING", str(candidate))
    resolved = candidate.resolve()
    _require_inside(root, resolved, "PATH_OUTSIDE_PRIVATE_ROOT")
    _assert_ignored_untracked(resolved, repository)
    return resolved


def _require_inside(root: Path, candidate: Path, code: str) -> None:
    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise PrivateResearchError(code, str(candidate)) from error


def _assert_ignored_untracked(path: Path, repository: Path) -> None:
    ignored = subprocess.run(
        ["git", "check-ignore", "-q", "--", str(path)], cwd=repository, check=False
    ).returncode == 0
    if not ignored:
        raise PrivateResearchError("PATH_NOT_IGNORED", str(path))
    tracked = subprocess.run(
        ["git", "ls-files", "--error-unmatch", "--", str(path)], cwd=repository, check=False,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    ).returncode == 0
    if tracked:
        raise PrivateResearchError("PATH_GIT_TRACKED", str(path))


def _validate_acknowledgement(acknowledgement: dict[str, Any]) -> None:
    if (
        acknowledgement.get("scope") != PRIVATE_SCOPE
        or acknowledgement.get("distribution_prohibited") is not True
        or acknowledgement.get("dataset_v3_unchanged") is not True
        or acknowledgement.get("m4_apply_mode_unchanged") is not True
    ):
        raise PrivateResearchError("ACK_INVALID", "acknowledgement does not confirm every private boundary")


def _validate_formal_dataset(repository: Path) -> dict[str, str]:
    actual = {version: _sha256_file(repository / relative) for version, relative in _DATASET_MANIFESTS.items()}
    if actual != EXPECTED_DATASET_HASHES:
        raise PrivateResearchError("DATASET_HASH_MISMATCH", json.dumps(actual, sort_keys=True))
    manifest = _read_json(repository / _DATASET_MANIFESTS["v3"])
    if manifest.get("ready_for_m3_real_data") is not False or manifest.get("training_eligible_count") != 0:
        raise PrivateResearchError("DATASET_GATE_CHANGED", "Dataset v3 must stay false/zero")
    return actual


def _index_source_records(
    records: list[dict[str, Any]], root: Path, repository: Path
) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    hashes: set[str] = set()
    for record in records:
        _require_markers(record)
        source_id = _nonempty_string(record.get("source_id"), "SOURCE_MANIFEST_INVALID")
        source_path = _nonempty_string(record.get("source_path"), "SOURCE_MANIFEST_INVALID")
        source_hash = _sha256_string(record.get("content_sha256"), "SOURCE_MANIFEST_INVALID")
        if source_id in indexed or source_hash in hashes:
            raise PrivateResearchError("SOURCE_MANIFEST_INVALID", source_id)
        source_file = _private_candidate(root, repository, source_path)
        if _sha256_file(source_file) != source_hash:
            raise PrivateResearchError("SOURCE_HASH_CHANGED", source_path)
        indexed[source_id] = record
        hashes.add(source_hash)
    return indexed


def _index_prepared_records(
    records: list[dict[str, Any]], sources: dict[str, dict[str, Any]], root: Path, repository: Path
) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    for record in records:
        _require_markers(record)
        source_id = _nonempty_string(record.get("source_id"), "PREPARED_MANIFEST_INVALID")
        source = sources.get(source_id)
        if source is None or source_id in indexed:
            raise PrivateResearchError("PREPARED_MANIFEST_INVALID", source_id)
        source_hash = _sha256_string(record.get("source_sha256"), "PREPARED_MANIFEST_INVALID")
        if source_hash != source.get("content_sha256"):
            raise PrivateResearchError("SOURCE_HASH_CHANGED", source_id)
        if record.get("taxonomy_version") != PRIVATE_TAXONOMY_VERSION or record.get("shape") != list(PRIVATE_SHAPE):
            raise PrivateResearchError("PREPARED_CONTRACT_INVALID", source_id)
        voxel_path = _private_candidate(root, repository, _nonempty_string(record.get("voxel_path"), "PREPARED_MANIFEST_INVALID"))
        metadata_path = _private_candidate(root, repository, _nonempty_string(record.get("metadata_path"), "PREPARED_MANIFEST_INVALID"))
        if _read_json(metadata_path) != record:
            raise PrivateResearchError("METADATA_MISMATCH", source_id)
        if voxel_path.stat().st_size != np.prod(PRIVATE_SHAPE):
            raise PrivateResearchError("VOXEL_SIZE_INVALID", source_id)
        if _sha256_file(voxel_path) != _sha256_string(record.get("voxel_sha256"), "PREPARED_MANIFEST_INVALID"):
            raise PrivateResearchError("VOXEL_HASH_MISMATCH", source_id)
        values = np.frombuffer(voxel_path.read_bytes(), dtype=np.uint8)
        if values.size != np.prod(PRIVATE_SHAPE) or int(values.max()) >= PRIVATE_TOKEN_COUNT:
            raise PrivateResearchError("VOXEL_TOKEN_INVALID", source_id)
        indexed[source_id] = record
    return indexed


def _validate_split(split: dict[str, Any], prepared: dict[str, dict[str, Any]]) -> None:
    keys = ("case_ids", "train_case_ids", "validation_case_ids")
    if any(not isinstance(split.get(key), list) or any(not isinstance(case_id, str) for case_id in split[key]) for key in keys):
        raise PrivateResearchError("SPLIT_INVALID", "case lists")
    case_ids = split["case_ids"]
    train_ids, validation_ids = split["train_case_ids"], split["validation_case_ids"]
    if (
        case_ids != sorted(case_ids)
        or len(case_ids) != len(set(case_ids))
        or set(case_ids) != set(prepared)
        or set(train_ids).intersection(validation_ids)
        or set(train_ids).union(validation_ids) != set(case_ids)
    ):
        raise PrivateResearchError("SPLIT_INVALID", "case membership")
    source_groups = [prepared[case_id]["source_sha256"] for case_id in case_ids]
    if len(source_groups) != len(set(source_groups)):
        raise PrivateResearchError("SPLIT_SOURCE_GROUP_DUPLICATE", "source hash appears in multiple cases")


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text("utf8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PrivateResearchError("JSON_INVALID", str(path)) from error
    if not isinstance(value, dict):
        raise PrivateResearchError("JSON_INVALID", str(path))
    return value


def _read_json_lines(path: Path) -> list[dict[str, Any]]:
    try:
        lines = [line for line in path.read_text("utf8").splitlines() if line]
        records = [json.loads(line) for line in lines]
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PrivateResearchError("MANIFEST_INVALID", str(path)) from error
    if any(not isinstance(record, dict) for record in records):
        raise PrivateResearchError("MANIFEST_INVALID", str(path))
    return records


def _require_markers(record: dict[str, Any]) -> None:
    if any(record.get(key) != value for key, value in PRIVATE_MARKERS.items()):
        raise PrivateResearchError("PRIVATE_MARKERS_INVALID", str(record.get("source_id", "unknown")))


def _nonempty_string(value: Any, code: str) -> str:
    if not isinstance(value, str) or not value:
        raise PrivateResearchError(code, repr(value))
    return value


def _sha256_string(value: Any, code: str) -> str:
    value = _nonempty_string(value, code)
    if len(value) != 64 or any(character not in "0123456789abcdef" for character in value):
        raise PrivateResearchError(code, value)
    return value


def _sha256_file(path: Path) -> str:
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError as error:
        raise PrivateResearchError("PATH_MISSING", str(path)) from error


def _git_root(path: Path) -> Path:
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"], cwd=Path(path), check=False,
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
    )
    if result.returncode != 0 or not result.stdout.strip():
        raise PrivateResearchError("REPO_ROOT_INVALID", str(path))
    return Path(result.stdout.strip())


def _validate_seed(seed: int) -> None:
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed < 2**32:
        raise ValueError("seed must be in 0..4294967295")
