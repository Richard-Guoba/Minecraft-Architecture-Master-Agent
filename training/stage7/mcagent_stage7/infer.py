from __future__ import annotations

import argparse
import copy
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import torch

from .checkpoints import TRAINING_SCOPE, load_checkpoint
from .contracts import (
    CONDITION_SOURCE,
    RESOLUTION,
    SCHEMA_VERSION,
    Stage7ContractError,
    canonical_json_bytes,
    condition_hash,
    sha256_bytes,
)
from .encoding import ConditionEncoder
from .model import TinyConditionalVAE
from .tensors import PlanTargets, predictions_to_plan


_DIMENSION_FIELDS = (
    "width",
    "depth",
    "floors",
    "floor_height",
    "total_height",
    "lot_width",
    "lot_depth",
)
_DESIGN_LIST_FIELDS = (
    "abstract_site_tags",
    "massing_strategy",
    "space_strategy",
)
_FRONT_SIDES = {"north", "south", "east", "west"}


@dataclass(frozen=True)
class InferenceResult:
    input_sha256: str
    output_sha256: str
    plan: dict[str, Any]


def infer_condition(
    checkpoint_path: Path,
    manifest_path: Path,
    condition: dict[str, Any],
) -> InferenceResult:
    input_bytes = _validated_condition_bytes(condition)
    loaded = load_checkpoint(
        Path(checkpoint_path),
        Path(manifest_path),
        require_scope=TRAINING_SCOPE,
    )
    config = loaded.manifest["config"]
    model = TinyConditionalVAE(
        condition_size=config["condition_size"],
        latent_size=config["latent_size"],
        coarse_size=config["coarse_size"],
    ).cpu()
    model.load_state_dict(loaded.state_dict, strict=True)
    model.eval()

    encoder = ConditionEncoder(size=config["condition_size"])
    with torch.inference_mode():
        encoded = encoder.encode(condition).unsqueeze(0).cpu()
        predictions = _single_prediction(model.predict(encoded))

    checkpoint_sha256 = loaded.manifest["checkpoint_sha256"]
    plan = predictions_to_plan(
        predictions,
        condition,
        {
            "kind": "learned-python-shadow",
            "name": loaded.manifest["model_name"],
            "model_version": loaded.manifest["model_version"],
            "dataset_version": loaded.manifest["dataset_version"],
            "checkpoint_version": f"sha256:{checkpoint_sha256}",
        },
    )
    output_bytes = canonical_json_bytes(plan)
    return InferenceResult(
        input_sha256=sha256_bytes(input_bytes),
        output_sha256=sha256_bytes(output_bytes),
        plan=plan,
    )


def _validated_condition_bytes(condition: Any) -> bytes:
    if not isinstance(condition, dict):
        raise Stage7ContractError("condition must be an object")
    _validate_json_value(condition)
    if condition.get("source") != CONDITION_SOURCE:
        raise Stage7ContractError("unsupported Stage 7 condition source")
    if type(condition.get("schema_version")) is not int or condition["schema_version"] != SCHEMA_VERSION:
        raise Stage7ContractError("unsupported Stage 7 condition schema version")
    if not isinstance(condition.get("prompt"), str) or not condition["prompt"].strip():
        raise Stage7ContractError("condition prompt is required")
    if type(condition.get("seed")) is not int:
        raise Stage7ContractError("condition seed must be an integer")

    dimensions = condition.get("dimensions")
    if not isinstance(dimensions, dict):
        raise Stage7ContractError("condition dimensions must be an object")
    for field in _DIMENSION_FIELDS:
        value = dimensions.get(field)
        if type(value) is not int or value <= 0:
            raise Stage7ContractError(
                f"condition dimension {field} must be a positive integer"
            )
    if dimensions["floors"] > 5:
        raise Stage7ContractError("condition floors must be within 1..5")
    if dimensions["width"] > dimensions["lot_width"]:
        raise Stage7ContractError("condition width cannot exceed lot width")
    if dimensions["depth"] > dimensions["lot_depth"]:
        raise Stage7ContractError("condition depth cannot exceed lot depth")

    constraints = condition.get("constraints")
    if not isinstance(constraints, dict):
        raise Stage7ContractError("condition constraints must be an object")
    resolution = constraints.get("resolution")
    if (
        not isinstance(resolution, list)
        or len(resolution) != 3
        or any(type(value) is not int for value in resolution)
        or resolution != list(RESOLUTION)
    ):
        raise Stage7ContractError("condition resolution must be 64 x 64 x 64")
    for field in ("max_total_height", "minecraft_fill_limit"):
        value = constraints.get(field)
        if type(value) is not int or value <= 0:
            raise Stage7ContractError(f"condition {field} must be a positive integer")
    if dimensions["total_height"] > constraints["max_total_height"]:
        raise Stage7ContractError("condition total_height cannot exceed max_total_height")

    design = condition.get("design")
    if not isinstance(design, dict):
        raise Stage7ContractError("condition design must be an object")
    if design.get("front_side") not in _FRONT_SIDES:
        raise Stage7ContractError("condition front_side is invalid")
    for field in _DESIGN_LIST_FIELDS:
        value = design.get(field)
        if value is not None and not isinstance(value, list):
            raise Stage7ContractError(f"condition design {field} must be a list")
    _validate_massing_volumes(design.get("massing_volumes"))
    _validate_topology_program(design.get("topology_program"))
    _validate_references(condition.get("references"))

    supplied_hash = condition.get("condition_hash")
    if not isinstance(supplied_hash, str) or len(supplied_hash) != 64 or any(
        character not in "0123456789abcdef" for character in supplied_hash
    ):
        raise Stage7ContractError("condition hash must be a lowercase SHA-256")
    payload = copy.deepcopy(condition)
    del payload["condition_hash"]
    if condition_hash(payload) != supplied_hash:
        raise Stage7ContractError("condition hash mismatch")
    return canonical_json_bytes(condition)


def _validate_json_value(value: Any, active: set[int] | None = None) -> None:
    if active is None:
        active = set()
    if value is None or isinstance(value, (str, bool, int)):
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise Stage7ContractError("condition numeric values must be finite")
        return
    if isinstance(value, (dict, list)):
        identity = id(value)
        if identity in active:
            raise Stage7ContractError("condition must not contain recursive values")
        active.add(identity)
        try:
            if isinstance(value, dict):
                for key, item in value.items():
                    if not isinstance(key, str):
                        raise Stage7ContractError("condition object keys must be strings")
                    _validate_json_value(item, active)
            else:
                for item in value:
                    _validate_json_value(item, active)
        finally:
            active.remove(identity)
        return
    raise Stage7ContractError("condition must contain only canonical JSON values")


def _validate_massing_volumes(value: Any) -> None:
    if value is None:
        return
    if not isinstance(value, list) or len(value) > 16:
        raise Stage7ContractError("condition massing volumes are invalid")
    for item in value:
        if (
            not isinstance(item, dict)
            or not isinstance(item.get("id"), str)
            or not isinstance(item.get("scale"), list)
            or len(item["scale"]) != 3
            or any(
                isinstance(component, bool)
                or not isinstance(component, (int, float))
                or not math.isfinite(component)
                for component in item["scale"]
            )
        ):
            raise Stage7ContractError("condition massing volumes are invalid")


def _validate_topology_program(value: Any) -> None:
    if value is None:
        return
    if (
        not isinstance(value, dict)
        or not isinstance(value.get("nodes"), list)
        or not isinstance(value.get("edges"), list)
        or not isinstance(value.get("zoning"), dict)
    ):
        raise Stage7ContractError("condition topology program is invalid")


def _validate_references(value: Any) -> None:
    if not isinstance(value, list):
        raise Stage7ContractError("condition references must be a list")
    case_ids: set[str] = set()
    for reference in value:
        if not isinstance(reference, dict):
            raise Stage7ContractError("condition reference must be an object")
        case_id = reference.get("case_id")
        if not isinstance(case_id, str) or not case_id.strip():
            raise Stage7ContractError("condition reference case_id is required")
        if case_id.strip() in case_ids:
            raise Stage7ContractError("condition reference case_ids must be unique")
        case_ids.add(case_id.strip())
        if reference.get("review_state") not in {"approved", "limited"}:
            raise Stage7ContractError("condition reference review_state is invalid")
        confidence = reference.get("review_confidence")
        if (
            isinstance(confidence, bool)
            or not isinstance(confidence, (int, float))
            or not math.isfinite(confidence)
            or not 0 <= confidence <= 1
        ):
            raise Stage7ContractError("condition reference review_confidence is invalid")
        used_for = reference.get("used_for")
        if (
            not isinstance(used_for, list)
            or not used_for
            or any(not isinstance(item, str) or not item for item in used_for)
        ):
            raise Stage7ContractError("condition reference used_for is invalid")
        hints = reference.get("hints")
        if not isinstance(hints, list):
            raise Stage7ContractError("condition reference hints must be a list")
        for hint in hints:
            hint_confidence = hint.get("confidence") if isinstance(hint, dict) else None
            if (
                not isinstance(hint, dict)
                or not isinstance(hint.get("area"), str)
                or not isinstance(hint.get("claim"), str)
                or isinstance(hint_confidence, bool)
                or not isinstance(hint_confidence, (int, float))
                or not math.isfinite(hint_confidence)
                or not 0 <= hint_confidence <= 1
            ):
                raise Stage7ContractError("condition reference hints are invalid")
        if reference.get("embedding_index_source") and (
            not reference.get("embedding_record_id")
            or not _is_prefixed_sha256(reference.get("embedding_index_hash"))
            or not _is_prefixed_sha256(reference.get("embedding_record_hash"))
        ):
            raise Stage7ContractError("condition embedding reference lineage is incomplete")


def _is_prefixed_sha256(value: Any) -> bool:
    return (
        isinstance(value, str)
        and value.startswith("sha256:")
        and len(value) == 71
        and all(character in "0123456789abcdef" for character in value[7:])
    )


def _single_prediction(predictions: PlanTargets) -> PlanTargets:
    if not isinstance(predictions, PlanTargets):
        raise Stage7ContractError("model prediction must be PlanTargets")
    tensors: dict[str, torch.Tensor] = {}
    for layer in ("envelope", "space", "site"):
        tensor = getattr(predictions, layer)
        if not isinstance(tensor, torch.Tensor) or tuple(tensor.shape) != (1, *RESOLUTION):
            raise Stage7ContractError(
                f"model prediction {layer} shape must be 1 x 64 x 64 x 64"
            )
        tensors[layer] = tensor[0].detach().cpu()
    return PlanTargets(**tensors)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run fixture-only Stage 7 M3 semantic inference"
    )
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--stdin", action="store_true")
    inputs.add_argument("--condition", type=Path)
    parser.add_argument("--output", required=True)
    return parser


def _read_condition(arguments: argparse.Namespace) -> Any:
    if arguments.stdin:
        raw = sys.stdin.read()
    else:
        raw = arguments.condition.read_text("utf8")

    def reject_constant(value: str) -> None:
        raise ValueError(f"non-finite JSON number is not allowed: {value}")

    return json.loads(raw, parse_constant=reject_constant)


def _write_output(
    output: str,
    data: bytes,
    checkpoint_path: Path,
    manifest_path: Path,
) -> None:
    if output == "-":
        sys.stdout.buffer.write(data)
        return
    output_path = Path(output)
    protected = {
        checkpoint_path.resolve(strict=False),
        manifest_path.resolve(strict=False),
    }
    if output_path.resolve(strict=False) in protected:
        raise Stage7ContractError("output must not replace checkpoint artifacts")
    output_path.write_bytes(data)


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    try:
        condition = _read_condition(arguments)
        result = infer_condition(
            arguments.checkpoint,
            arguments.manifest,
            condition,
        )
        _write_output(
            arguments.output,
            canonical_json_bytes(result.plan),
            arguments.checkpoint,
            arguments.manifest,
        )
    except (OSError, UnicodeError, ValueError, RuntimeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
