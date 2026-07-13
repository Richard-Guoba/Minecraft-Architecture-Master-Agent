from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .contracts import LAYERS, Stage7ContractError, sha256_bytes
from .fixture_assets import FIXTURE_SOURCE


REAL_DATASET_SOURCE = "stage7-coarse-semantic-voxel-dataset-v3"
REAL_DATASET_VERSION = "v3"
FIXTURE_ORIGIN = "synthetic-fixture"
REAL_ORIGIN = "real"
FIXTURE_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "m3"


@dataclass(frozen=True)
class Stage7Case:
    case_id: str
    origin: str
    condition: dict[str, Any]
    plan: dict[str, Any]
    requested_layers: tuple[str, ...]


class DatasetGateError(Stage7ContractError):
    def __init__(self, code: str, case_id: str) -> None:
        self.code = code
        self.case_id = case_id
        super().__init__(f"{code}: {case_id}")


class Stage7Dataset:
    def __init__(
        self,
        *,
        mode: str,
        root: Path,
        artifact_root: Path,
        records: dict[str, dict[str, Any]],
        readiness_contribution: int,
    ) -> None:
        self.mode = mode
        self.readiness_contribution = readiness_contribution
        self._root = root
        self._artifact_root = artifact_root
        self._records = records

    @classmethod
    def from_fixtures(cls, root: Path) -> Stage7Dataset:
        root = Path(root).resolve()
        manifest = _read_json(root / "manifest.json", "fixture manifest")
        if (
            manifest.get("source") != FIXTURE_SOURCE
            or manifest.get("fixture_only") is not True
            or manifest.get("readiness_contribution") != 0
        ):
            raise Stage7ContractError("invalid Stage 7 M3 fixture manifest")

        records = _records_by_case_id(manifest.get("cases"), "fixture manifest")
        for case_id, record in records.items():
            if record.get("origin") != FIXTURE_ORIGIN:
                raise DatasetGateError("wrong-origin", case_id)
            if record.get("fixture_only") is not True or record.get("readiness_contribution") != 0:
                raise Stage7ContractError(f"invalid fixture-only metadata: {case_id}")

        return cls(
            mode="fixture",
            root=root,
            artifact_root=root,
            records=records,
            readiness_contribution=0,
        )

    @classmethod
    def from_real(cls, index_root: Path, artifact_root: Path) -> Stage7Dataset:
        index_root = Path(index_root).resolve()
        artifact_root = Path(artifact_root).resolve()
        if _is_equal_to_or_inside(artifact_root, FIXTURE_ROOT):
            raise DatasetGateError("wrong-origin", "<dataset>")

        manifest = _read_json(index_root / "manifest.json", "Dataset v3 manifest")
        if (
            manifest.get("source") != REAL_DATASET_SOURCE
            or manifest.get("dataset_version") != REAL_DATASET_VERSION
        ):
            raise Stage7ContractError("invalid Stage 7 Dataset v3 manifest")

        records = _read_jsonl_records(index_root / "cases.jsonl")
        for case_id, record in records.items():
            if record.get("dataset_version") != REAL_DATASET_VERSION:
                raise Stage7ContractError(f"invalid Dataset v3 record version: {case_id}")
            if record.get("origin") != REAL_ORIGIN:
                raise DatasetGateError("wrong-origin", case_id)

        return cls(
            mode="real",
            root=index_root,
            artifact_root=artifact_root,
            records=records,
            readiness_contribution=int(manifest.get("training_eligible_count", 0)),
        )

    @property
    def case_ids(self) -> tuple[str, ...]:
        return tuple(sorted(self._records))

    def load_case(self, case_id: str, requested_layers: tuple[str, ...]) -> Stage7Case:
        layers = tuple(requested_layers)
        if any(layer not in LAYERS for layer in layers) or (
            self.mode == "real"
            and (len(layers) != len(LAYERS) or set(layers) != set(LAYERS))
        ):
            raise DatasetGateError("layer-not-permitted", case_id)

        try:
            record = self._records[case_id]
        except KeyError as error:
            raise Stage7ContractError(f"unknown Stage 7 case: {case_id}") from error

        if self.mode == "fixture":
            return self._load_fixture_case(record, layers)
        return self._load_real_case(record, layers)

    def _load_fixture_case(
        self,
        record: dict[str, Any],
        requested_layers: tuple[str, ...],
    ) -> Stage7Case:
        case_id = record["case_id"]
        condition = _load_hashed_json(
            root=self._root,
            relative=record.get("condition_path"),
            expected_sha256=record.get("condition_sha256"),
            case_id=case_id,
        )
        plan = _load_hashed_json(
            root=self._root,
            relative=record.get("plan_path"),
            expected_sha256=record.get("plan_sha256"),
            case_id=case_id,
        )
        return Stage7Case(
            case_id=case_id,
            origin=FIXTURE_ORIGIN,
            condition=condition,
            plan=plan,
            requested_layers=requested_layers,
        )

    def _load_real_case(
        self,
        record: dict[str, Any],
        requested_layers: tuple[str, ...],
    ) -> Stage7Case:
        case_id = record["case_id"]
        training = record.get("training")
        review = record.get("review")
        source = record.get("source")
        extraction = record.get("extraction")
        artifacts = record.get("artifacts")

        if not isinstance(training, dict) or training.get("eligible") is not True:
            raise DatasetGateError("not-training-eligible", case_id)
        if not isinstance(review, dict) or review.get("status") not in ("approved", "limited"):
            raise DatasetGateError("review-not-approved", case_id)
        if not isinstance(source, dict) or not _list_contains(source.get("allowed_uses"), "local-training"):
            raise DatasetGateError("license-not-training-approved", case_id)
        if not isinstance(extraction, dict) or extraction.get("semantic_status") != "accepted":
            raise DatasetGateError("semantic-not-accepted", case_id)
        if (
            not _lists_cover(training.get("permitted_layers"), requested_layers)
            or not _lists_cover(review.get("approved_learning_areas"), requested_layers)
        ):
            raise DatasetGateError("layer-not-permitted", case_id)
        if not isinstance(artifacts, dict) or (
            artifacts.get("review_plan_sha256") != artifacts.get("plan_sha256")
            or not isinstance(artifacts.get("plan_sha256"), str)
        ):
            raise DatasetGateError("stale-review-plan", case_id)

        plan = _load_hashed_json(
            root=self._artifact_root,
            relative=artifacts.get("local_plan_path"),
            expected_sha256=artifacts["plan_sha256"],
            case_id=case_id,
            forbidden_root=FIXTURE_ROOT,
        )
        return Stage7Case(
            case_id=case_id,
            origin=REAL_ORIGIN,
            condition={},
            plan=plan,
            requested_layers=requested_layers,
        )


def _read_json(path: Path, description: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_bytes())
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise Stage7ContractError(f"cannot read {description}: {path}") from error
    if not isinstance(value, dict):
        raise Stage7ContractError(f"{description} must be a JSON object")
    return value


def _read_jsonl_records(path: Path) -> dict[str, dict[str, Any]]:
    try:
        lines = path.read_bytes().splitlines()
        values = [json.loads(line) for line in lines if line.strip()]
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise Stage7ContractError(f"cannot read Dataset v3 records: {path}") from error
    return _records_by_case_id(values, "Dataset v3 records")


def _records_by_case_id(value: Any, description: str) -> dict[str, dict[str, Any]]:
    if not isinstance(value, list):
        raise Stage7ContractError(f"{description} must contain a record list")
    records: dict[str, dict[str, Any]] = {}
    for record in value:
        if not isinstance(record, dict) or not isinstance(record.get("case_id"), str):
            raise Stage7ContractError(f"{description} contains an invalid case record")
        case_id = record["case_id"]
        if not case_id or case_id in records:
            raise Stage7ContractError(f"{description} contains an invalid or duplicate case_id")
        records[case_id] = record
    return records


def _is_equal_to_or_inside(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


def _list_contains(value: Any, item: str) -> bool:
    return isinstance(value, list) and item in value


def _lists_cover(value: Any, requested: tuple[str, ...]) -> bool:
    return isinstance(value, list) and all(layer in value for layer in requested)


def _load_hashed_json(
    *,
    root: Path,
    relative: Any,
    expected_sha256: Any,
    case_id: str,
    forbidden_root: Path | None = None,
) -> dict[str, Any]:
    if not isinstance(relative, str) or not relative:
        raise DatasetGateError("unsafe-artifact-path", case_id)
    resolved_root = root.resolve()
    try:
        path = (root / relative).resolve()
        path.relative_to(resolved_root)
    except (OSError, ValueError):
        raise DatasetGateError("unsafe-artifact-path", case_id) from None
    if forbidden_root is not None and _is_equal_to_or_inside(path, forbidden_root):
        raise DatasetGateError("wrong-origin", case_id)

    try:
        artifact_bytes = path.read_bytes()
    except OSError:
        raise DatasetGateError("artifact-hash-mismatch", case_id) from None
    if not isinstance(expected_sha256, str) or sha256_bytes(artifact_bytes) != expected_sha256:
        raise DatasetGateError("artifact-hash-mismatch", case_id)

    try:
        value = json.loads(artifact_bytes)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise Stage7ContractError(f"artifact is not valid JSON: {case_id}") from error
    if not isinstance(value, dict):
        raise Stage7ContractError(f"artifact must be a JSON object: {case_id}")
    return value
