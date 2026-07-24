from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Protocol

from .training_data import TOKEN_COUNT, TrainingError


OBJECTIVE_VERSION = "semantic-balance-v2"
SEMANTIC_BALANCE_PROFILES = ("none", "weighted", "weighted-mask")
UNIT_CLASS_WEIGHTS = (1.0,) * (TOKEN_COUNT - 1)


class _HasTokenCounts(Protocol):
    token_counts: tuple[int, ...]


@dataclass(frozen=True)
class SemanticBalance:
    profile: str
    class_weights: tuple[float, ...]
    class_weights_sha256: str

    def __post_init__(self) -> None:
        if self.profile not in SEMANTIC_BALANCE_PROFILES:
            raise TrainingError(
                "SEMANTIC_BALANCE_PROFILE_INVALID",
                str(self.profile),
            )
        if (
            not isinstance(self.class_weights, tuple)
            or len(self.class_weights) != TOKEN_COUNT - 1
            or any(
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(float(value))
                or not 1.0 <= float(value) <= 4.0
                for value in self.class_weights
            )
        ):
            raise TrainingError(
                "SEMANTIC_CLASS_WEIGHTS_INVALID",
                "expected eight finite weights in [1.0, 4.0]",
            )
        if (
            self.profile == "none"
            and tuple(float(value) for value in self.class_weights)
            != UNIT_CLASS_WEIGHTS
        ):
            raise TrainingError(
                "SEMANTIC_CLASS_WEIGHTS_INVALID",
                "none requires unit weights",
            )
        if self.class_weights_sha256 != semantic_class_weights_sha256(
            self.class_weights
        ):
            raise TrainingError(
                "SEMANTIC_CLASS_WEIGHTS_DIGEST_MISMATCH",
                str(self.class_weights_sha256),
            )


def semantic_class_weights_sha256(
    weights: tuple[float, ...],
) -> str:
    payload = json.dumps(
        {"source": OBJECTIVE_VERSION, "weights": list(weights)},
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf8")
    return hashlib.sha256(payload).hexdigest()


UNIT_CLASS_WEIGHTS_SHA256 = semantic_class_weights_sha256(
    UNIT_CLASS_WEIGHTS
)


def build_semantic_balance(
    samples: Iterable[_HasTokenCounts],
    profile: str,
) -> SemanticBalance:
    if profile not in SEMANTIC_BALANCE_PROFILES:
        raise TrainingError(
            "SEMANTIC_BALANCE_PROFILE_INVALID",
            str(profile),
        )
    counts = [0] * (TOKEN_COUNT - 1)
    seen = 0
    for sample in samples:
        token_counts = getattr(sample, "token_counts", None)
        if (
            not isinstance(token_counts, tuple)
            or len(token_counts) != TOKEN_COUNT
            or any(
                type(value) is not int or value < 0
                for value in token_counts
            )
        ):
            raise TrainingError(
                "SEMANTIC_CLASS_COUNTS_INVALID",
                f"sample_index={seen}",
            )
        for index, value in enumerate(token_counts[1:]):
            counts[index] += value
        seen += 1
    if seen == 0:
        raise TrainingError(
            "SEMANTIC_CLASS_COUNTS_INVALID",
            "empty samples",
        )

    if profile == "none":
        weights = UNIT_CLASS_WEIGHTS
    else:
        missing = [
            str(index + 1)
            for index, count in enumerate(counts)
            if count == 0
        ]
        if missing:
            raise TrainingError(
                "SEMANTIC_CLASS_SUPPORT_MISSING",
                ",".join(missing),
            )
        maximum = max(counts)
        try:
            weights = tuple(
                min(
                    4.0,
                    max(1.0, math.sqrt(maximum / count)),
                )
                for count in counts
            )
        except (OverflowError, ValueError, ZeroDivisionError) as error:
            raise TrainingError(
                "SEMANTIC_CLASS_WEIGHTS_INVALID",
                "calculation failed",
            ) from error
        if any(not math.isfinite(weight) for weight in weights):
            raise TrainingError(
                "SEMANTIC_CLASS_WEIGHTS_INVALID",
                "non-finite calculation",
            )

    return SemanticBalance(
        profile=profile,
        class_weights=weights,
        class_weights_sha256=semantic_class_weights_sha256(weights),
    )
