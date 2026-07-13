from __future__ import annotations

import hashlib
from typing import Any

import torch

from .contracts import Stage7ContractError


_SIZE = 64
_NUMERIC_SIZE = 7
_HASH_SIZE = _SIZE - _NUMERIC_SIZE
_NUMERIC_FIELDS = (
    ("width", 64),
    ("depth", 64),
    ("floors", 5),
    ("floor_height", 16),
    ("total_height", 64),
    ("lot_width", 64),
    ("lot_depth", 64),
)
_SCALAR_DESIGN_FIELDS = (
    "style_family",
    "typology",
    "footprint",
    "front_side",
    "selected_concept_id",
)
_LIST_DESIGN_FIELDS = (
    "abstract_site_tags",
    "massing_strategy",
    "space_strategy",
)


class ConditionEncoder:
    def __init__(self, size: int = _SIZE) -> None:
        if size != _SIZE:
            raise ValueError("condition encoder size must be 64")
        self.size = size

    def encode(self, condition: dict[str, Any]) -> torch.Tensor:
        if not isinstance(condition, dict):
            raise Stage7ContractError("condition must be an object")
        dimensions = condition.get("dimensions")
        design = condition.get("design")
        if not isinstance(dimensions, dict) or not isinstance(design, dict):
            raise Stage7ContractError("condition dimensions and design must be objects")

        values = torch.zeros(self.size, dtype=torch.float32)
        for index, (field, denominator) in enumerate(_NUMERIC_FIELDS):
            value = dimensions.get(field)
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise Stage7ContractError(f"condition dimension {field} must be numeric")
            values[index] = float(value) / denominator

        for token in _condition_tokens(condition, design):
            digest = hashlib.sha256(token.encode("utf8")).digest()
            bucket = _NUMERIC_SIZE + digest[0] % _HASH_SIZE
            values[bucket] += 1.0 if digest[1] % 2 == 0 else -1.0

        values[-1] += _stable_seed_value(condition.get("seed"))
        hashed = values[_NUMERIC_SIZE:]
        norm = torch.linalg.vector_norm(hashed)
        if float(norm) > 0:
            hashed.div_(norm)
        return values


def _condition_tokens(condition: dict[str, Any], design: dict[str, Any]) -> list[str]:
    tokens = [_scalar_token(field, design.get(field)) for field in _SCALAR_DESIGN_FIELDS]
    for field in _LIST_DESIGN_FIELDS:
        raw_values = design.get(field)
        if raw_values is None:
            raw_values = []
        if not isinstance(raw_values, list):
            raise Stage7ContractError(f"condition design {field} must be a list")
        tokens.extend(f"{field}:{_token_value(value)}" for value in raw_values)

    references = condition.get("references")
    if not isinstance(references, list):
        raise Stage7ContractError("condition references must be a list")
    for reference in references:
        if not isinstance(reference, dict):
            raise Stage7ContractError("condition reference must be an object")
        tokens.append(_scalar_token("reference_case_id", reference.get("case_id")))
        used_for = reference.get("used_for", [])
        hints = reference.get("hints", [])
        if not isinstance(used_for, list) or not isinstance(hints, list):
            raise Stage7ContractError("condition reference summaries must be lists")
        tokens.extend(f"reference_used_for:{_token_value(value)}" for value in used_for)
        for hint in hints:
            if not isinstance(hint, dict):
                raise Stage7ContractError("condition reference hint must be an object")
            tokens.append(_scalar_token("reference_hint_area", hint.get("area")))
            tokens.append(_scalar_token("reference_hint_claim", hint.get("claim")))
    return sorted(tokens)


def _scalar_token(field: str, value: Any) -> str:
    return f"{field}:{_token_value(value)}"


def _token_value(value: Any) -> str:
    if value is None or value == "":
        return "<unknown>"
    return str(value)


def _stable_seed_value(seed: Any) -> float:
    if isinstance(seed, bool) or not isinstance(seed, int):
        raise Stage7ContractError("condition seed must be an integer")
    digest = hashlib.sha256(f"seed:{seed}".encode("utf8")).digest()
    unsigned = int.from_bytes(digest[:8], "big")
    return (2.0 * unsigned / ((1 << 64) - 1)) - 1.0
