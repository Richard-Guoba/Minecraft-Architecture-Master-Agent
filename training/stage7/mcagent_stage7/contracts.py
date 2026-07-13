from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


RESOLUTION = (64, 64, 64)
CONDITION_SOURCE = "stage7-coarse-semantic-voxel-condition-v1"
PLAN_SOURCE = "stage7-coarse-semantic-voxel-plan-v1"
SCHEMA_VERSION = 1
ENCODING = "rle-x-v1"
ENVELOPE_VALUES = ("none", "wall", "floor", "roof", "opening", "support")
SPACE_VALUES = ("outside", "public", "private", "service", "circulation", "vertical_circulation", "void")
SITE_VALUES = ("none", "ground", "path", "courtyard", "water", "vegetation")
LAYERS = ("envelope", "space", "site")


class Stage7ContractError(ValueError):
    pass


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf8")


def pretty_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf8")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def condition_hash(condition_without_hash: dict[str, Any]) -> str:
    return sha256_bytes(canonical_json_bytes(condition_without_hash))
