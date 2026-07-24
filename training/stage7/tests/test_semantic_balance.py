from __future__ import annotations

import hashlib
import json
from types import SimpleNamespace

import pytest

from mcagent_stage7.training_data import TrainingError


COUNTS = (0, 64, 16, 4, 1, 64, 16, 4, 1)
EXPECTED = (1.0, 2.0, 4.0, 4.0, 1.0, 2.0, 4.0, 4.0)


def _sample(
    counts: tuple[int, ...] = COUNTS,
) -> SimpleNamespace:
    return SimpleNamespace(token_counts=counts)


def _semantic_balance_module():
    from mcagent_stage7 import semantic_balance

    return semantic_balance


@pytest.mark.parametrize("profile", ("weighted", "weighted-mask"))
def test_balanced_profiles_derive_exact_weights_and_digest(
    profile: str,
) -> None:
    semantic_balance = _semantic_balance_module()

    balance = semantic_balance.build_semantic_balance(
        (_sample(),),
        profile,
    )

    payload = json.dumps(
        {
            "source": "semantic-balance-v2",
            "weights": list(EXPECTED),
        },
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf8")
    assert balance.profile == profile
    assert balance.class_weights == EXPECTED
    assert balance.class_weights_sha256 == hashlib.sha256(
        payload
    ).hexdigest()


def test_semantic_counts_are_aggregated_before_weights_are_derived() -> None:
    semantic_balance = _semantic_balance_module()
    first = (0, 32, 8, 2, 1, 32, 8, 2, 1)
    second = (0, 32, 8, 2, 0, 32, 8, 2, 0)

    balance = semantic_balance.build_semantic_balance(
        (_sample(first), _sample(second)),
        "weighted",
    )

    assert balance.class_weights == EXPECTED


def test_none_uses_unit_weights_without_requiring_full_support() -> None:
    semantic_balance = _semantic_balance_module()

    balance = semantic_balance.build_semantic_balance(
        (_sample((100, 1, 0, 0, 0, 0, 0, 0, 0)),),
        "none",
    )

    assert balance.profile == "none"
    assert balance.class_weights == (1.0,) * 8
    assert balance.class_weights_sha256 == (
        semantic_balance.semantic_class_weights_sha256((1.0,) * 8)
    )


def test_none_balance_value_rejects_non_unit_weights() -> None:
    semantic_balance = _semantic_balance_module()
    weights = (2.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0)

    with pytest.raises(
        TrainingError,
        match="SEMANTIC_CLASS_WEIGHTS_INVALID",
    ):
        semantic_balance.SemanticBalance(
            profile="none",
            class_weights=weights,
            class_weights_sha256=(
                semantic_balance.semantic_class_weights_sha256(weights)
            ),
        )


def test_unknown_profile_is_rejected() -> None:
    semantic_balance = _semantic_balance_module()

    with pytest.raises(
        TrainingError,
        match="SEMANTIC_BALANCE_PROFILE_INVALID",
    ):
        semantic_balance.build_semantic_balance((_sample(),), "unknown")


@pytest.mark.parametrize("profile", ("weighted", "weighted-mask"))
def test_balanced_profiles_require_support_for_every_class(
    profile: str,
) -> None:
    semantic_balance = _semantic_balance_module()

    with pytest.raises(
        TrainingError,
        match="SEMANTIC_CLASS_SUPPORT_MISSING",
    ):
        semantic_balance.build_semantic_balance(
            (_sample((100, 1, 1, 1, 1, 0, 1, 1, 1)),),
            profile,
        )


@pytest.mark.parametrize(
    "counts",
    (
        (0, 1, 1),
        (0, 1, 1, 1, 1, 1, 1, 1, -1),
        (0, 1, 1, 1, 1, 1, 1, 1, True),
        (0, 1, 1, 1, 1, 1, 1, 1, 1.0),
    ),
)
def test_malformed_semantic_counts_are_rejected(
    counts: tuple[object, ...],
) -> None:
    semantic_balance = _semantic_balance_module()

    with pytest.raises(
        TrainingError,
        match="SEMANTIC_CLASS_COUNTS_INVALID",
    ):
        semantic_balance.build_semantic_balance(
            (_sample(counts),),
            "weighted",
        )


@pytest.mark.parametrize(
    "weights",
    (
        (1.0,) * 7,
        (1.0, 1.0, 1.0, 1.0, True, 1.0, 1.0, 1.0),
        (1.0, 1.0, 1.0, 1.0, float("nan"), 1.0, 1.0, 1.0),
        (1.0, 1.0, 1.0, 1.0, float("inf"), 1.0, 1.0, 1.0),
        (1.0, 1.0, 1.0, 1.0, 0.99, 1.0, 1.0, 1.0),
        (1.0, 1.0, 1.0, 1.0, 4.01, 1.0, 1.0, 1.0),
    ),
)
def test_balance_value_rejects_invalid_weight_vectors(
    weights: tuple[object, ...],
) -> None:
    semantic_balance = _semantic_balance_module()

    with pytest.raises(
        TrainingError,
        match="SEMANTIC_CLASS_WEIGHTS_INVALID",
    ):
        semantic_balance.SemanticBalance(
            profile="weighted",
            class_weights=weights,
            class_weights_sha256="0" * 64,
        )


def test_balance_value_rejects_a_digest_for_different_weights() -> None:
    semantic_balance = _semantic_balance_module()

    with pytest.raises(
        TrainingError,
        match="SEMANTIC_CLASS_WEIGHTS_DIGEST_MISMATCH",
    ):
        semantic_balance.SemanticBalance(
            profile="weighted",
            class_weights=EXPECTED,
            class_weights_sha256=(
                semantic_balance.semantic_class_weights_sha256(
                    (1.0,) * 8
                )
            ),
        )
