from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import torch

from .contracts import (
    ENCODING,
    ENVELOPE_VALUES,
    PLAN_SOURCE,
    RESOLUTION,
    SCHEMA_VERSION,
    SITE_VALUES,
    SPACE_VALUES,
    Stage7ContractError,
)


_LAYER_VALUES = {
    "envelope": ENVELOPE_VALUES,
    "space": SPACE_VALUES,
    "site": SITE_VALUES,
}
_VALUE_INDICES = {
    layer: {value: index for index, value in enumerate(values)}
    for layer, values in _LAYER_VALUES.items()
}
_PROVIDER_FIELDS = (
    "kind",
    "name",
    "model_version",
    "dataset_version",
    "checkpoint_version",
)


@dataclass(frozen=True)
class PlanTargets:
    envelope: torch.Tensor
    space: torch.Tensor
    site: torch.Tensor

    def equal(self, other: object) -> bool:
        return isinstance(other, PlanTargets) and all(
            torch.equal(getattr(self, layer), getattr(other, layer))
            for layer in _LAYER_VALUES
        )


def plan_to_targets(plan: dict[str, Any]) -> PlanTargets:
    if not isinstance(plan, dict):
        raise Stage7ContractError("plan must be an object")
    if plan.get("source") != PLAN_SOURCE or plan.get("schema_version") != SCHEMA_VERSION:
        raise Stage7ContractError("unsupported Stage 7 plan contract")
    if plan.get("resolution") != list(RESOLUTION):
        raise Stage7ContractError("plan resolution must be 64 x 64 x 64")
    if plan.get("encoding") != ENCODING:
        raise Stage7ContractError("unsupported Stage 7 grid encoding")
    runs = plan.get("runs")
    if not isinstance(runs, list):
        raise Stage7ContractError("plan runs must be a list")

    targets = PlanTargets(
        envelope=torch.zeros(RESOLUTION, dtype=torch.long),
        space=torch.zeros(RESOLUTION, dtype=torch.long),
        site=torch.zeros(RESOLUTION, dtype=torch.long),
    )
    occupied = torch.zeros(RESOLUTION, dtype=torch.bool)
    previous_key: tuple[int, int, int, int] | None = None

    for index, run in enumerate(runs):
        if not isinstance(run, dict):
            raise Stage7ContractError(f"plan run {index} must be an object")
        x0, x1, y, z = (run.get(field) for field in ("x0", "x1", "y", "z"))
        coordinates = (x0, x1, y, z)
        if (
            any(type(value) is not int for value in coordinates)
            or not (0 <= x0 <= x1 < RESOLUTION[0])
            or not (0 <= y < RESOLUTION[1])
            or not (0 <= z < RESOLUTION[2])
        ):
            raise Stage7ContractError(f"plan run {index} coordinates must be integers inside 0..63")

        key = (z, y, x0, x1)
        if previous_key is not None and previous_key > key:
            raise Stage7ContractError("plan runs must use canonical z/y/x order")
        previous_key = key

        indices: dict[str, int] = {}
        for layer, value_indices in _VALUE_INDICES.items():
            value = run.get(layer)
            if not isinstance(value, str) or value not in value_indices:
                raise Stage7ContractError(f"invalid {layer} value: {value}")
            indices[layer] = value_indices[value]

        if bool(occupied[y, z, x0 : x1 + 1].any()):
            raise Stage7ContractError(f"plan runs overlap at y={y}, z={z}, x={x0}..{x1}")
        occupied[y, z, x0 : x1 + 1] = True
        for layer in _LAYER_VALUES:
            getattr(targets, layer)[y, z, x0 : x1 + 1] = indices[layer]
    return targets


def predictions_to_plan(
    predictions: PlanTargets,
    condition: dict[str, Any],
    provider: dict[str, Any],
) -> dict[str, Any]:
    tensors = _validated_prediction_tensors(predictions)
    provider_metadata = _validated_provider(provider)
    orientation, world_transform = _condition_transform(condition)

    checkpoint = provider_metadata["checkpoint_version"]
    evidence_id = f"checkpoint:{checkpoint}"
    runs: list[dict[str, Any]] = []
    envelope = tensors["envelope"]
    space = tensors["space"]
    site = tensors["site"]

    for z in range(RESOLUTION[2]):
        for y in range(RESOLUTION[1]):
            x = 0
            while x < RESOLUTION[0]:
                labels = (
                    int(envelope[y, z, x]),
                    int(space[y, z, x]),
                    int(site[y, z, x]),
                )
                if labels == (0, 0, 0):
                    x += 1
                    continue
                x0 = x
                x += 1
                while x < RESOLUTION[0] and (
                    int(envelope[y, z, x]),
                    int(space[y, z, x]),
                    int(site[y, z, x]),
                ) == labels:
                    x += 1
                runs.append(
                    {
                        "x0": x0,
                        "x1": x - 1,
                        "y": y,
                        "z": z,
                        "envelope": ENVELOPE_VALUES[labels[0]],
                        "space": SPACE_VALUES[labels[1]],
                        "site": SITE_VALUES[labels[2]],
                        "confidence": 1,
                        "evidence_ids": [evidence_id],
                    }
                )

    return {
        "source": PLAN_SOURCE,
        "schema_version": SCHEMA_VERSION,
        "provider": provider_metadata,
        "condition_hash": condition["condition_hash"],
        "resolution": list(RESOLUTION),
        "encoding": ENCODING,
        "orientation": orientation,
        "world_transform": world_transform,
        "runs": runs,
        "evidence": [
            {
                "id": evidence_id,
                "kind": "model-checkpoint",
                "source_id": checkpoint,
                "detail": "Stage 7 semantic predictions from the bound model checkpoint",
            }
        ],
        "summary": {},
        "derived_sketches": {"massing": [], "spaces": [], "site": []},
        "conflicts": [],
        "repairs": [],
        "warnings": [],
    }


def _validated_prediction_tensors(predictions: PlanTargets) -> dict[str, torch.Tensor]:
    if not isinstance(predictions, PlanTargets):
        raise Stage7ContractError("predictions must be PlanTargets")
    tensors: dict[str, torch.Tensor] = {}
    for layer, values in _LAYER_VALUES.items():
        tensor = getattr(predictions, layer)
        if not isinstance(tensor, torch.Tensor):
            raise Stage7ContractError(f"prediction {layer} must be a tensor")
        if tuple(tensor.shape) != RESOLUTION:
            raise Stage7ContractError(f"prediction {layer} shape must be 64 x 64 x 64")
        if tensor.dtype != torch.long:
            raise Stage7ContractError(f"prediction {layer} dtype must be torch.long")
        if int(tensor.min()) < 0 or int(tensor.max()) >= len(values):
            raise Stage7ContractError(f"prediction {layer} values are outside the canonical range")
        tensors[layer] = tensor.detach().cpu()
    return tensors


def _validated_provider(provider: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(provider, dict):
        raise Stage7ContractError("provider must be an object")
    unknown = set(provider) - set(_PROVIDER_FIELDS)
    if unknown:
        raise Stage7ContractError(f"unknown provider field: {sorted(unknown)[0]}")
    metadata = {field: provider.get(field) for field in _PROVIDER_FIELDS}
    if not isinstance(metadata["kind"], str) or not metadata["kind"]:
        raise Stage7ContractError("provider kind is required")
    if not isinstance(metadata["name"], str) or not metadata["name"]:
        raise Stage7ContractError("provider name is required")
    for field in ("model_version", "dataset_version"):
        if metadata[field] is not None and not isinstance(metadata[field], str):
            raise Stage7ContractError(f"provider {field} must be a string or null")
    if not isinstance(metadata["checkpoint_version"], str) or not metadata["checkpoint_version"]:
        raise Stage7ContractError("provider checkpoint_version is required")
    return metadata


def _condition_transform(condition: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    if not isinstance(condition, dict):
        raise Stage7ContractError("condition must be an object")
    design = condition.get("design")
    dimensions = condition.get("dimensions")
    condition_hash = condition.get("condition_hash")
    if not isinstance(condition_hash, str) or not condition_hash:
        raise Stage7ContractError("condition_hash is required")
    if not isinstance(design, dict) or not isinstance(dimensions, dict):
        raise Stage7ContractError("condition design and dimensions must be objects")
    front_side = design.get("front_side")
    if front_side not in ("north", "south", "east", "west"):
        raise Stage7ContractError("condition front_side is invalid")
    transform: dict[str, Any] = {"ground_y": 0}
    for field in ("lot_width", "lot_depth", "total_height"):
        value = dimensions.get(field)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
            raise Stage7ContractError(f"condition dimension {field} is invalid")
        transform[field] = value
    return (
        {"front_side": front_side, "vertical_axis": "y-up"},
        {
            "lot_width": transform["lot_width"],
            "lot_depth": transform["lot_depth"],
            "total_height": transform["total_height"],
            "ground_y": transform["ground_y"],
        },
    )
