import copy
import json
from pathlib import Path

import pytest
import torch

from mcagent_stage7.encoding import ConditionEncoder


FIXTURE_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "m3"


def _condition() -> dict:
    return json.loads(
        (FIXTURE_ROOT / "cases/one-floor-house/condition.json").read_text("utf8")
    )


def test_condition_encoding_is_fixed_width_and_deterministic():
    condition = _condition()
    encoder = ConditionEncoder(size=64)
    first = encoder.encode(condition)
    second = encoder.encode(condition)
    assert first.shape == (64,)
    assert first.dtype == torch.float32
    assert torch.equal(first, second)
    assert torch.isfinite(first).all()


def test_numeric_slots_use_the_documented_normalization():
    encoded = ConditionEncoder(size=64).encode(_condition())
    expected = torch.tensor(
        [12 / 64, 10 / 64, 1 / 5, 4 / 16, 5 / 64, 24 / 64, 20 / 64],
        dtype=torch.float32,
    )
    assert torch.equal(encoded[:7], expected)
    assert torch.linalg.vector_norm(encoded[7:]) == pytest.approx(1.0)


def test_unknown_categories_and_reference_summaries_have_stable_distinct_tokens():
    encoder = ConditionEncoder(size=64)
    base = _condition()
    base["design"]["style_family"] = None
    base["design"]["typology"] = None
    base["references"] = []
    referenced = copy.deepcopy(base)
    referenced["design"]["style_family"] = "modern"
    referenced["design"]["typology"] = "house"
    referenced["references"] = [
        {
            "case_id": "reviewed-a",
            "review_state": "approved",
            "used_for": ["envelope"],
            "hints": [
                {
                    "area": "envelope",
                    "claim": "stepped massing",
                    "confidence": 0.9,
                }
            ],
        }
    ]
    assert torch.equal(encoder.encode(base), encoder.encode(base))
    assert not torch.equal(encoder.encode(base), encoder.encode(referenced))


def test_token_collection_is_stable_under_category_and_reference_reordering():
    encoder = ConditionEncoder(size=64)
    left = _condition()
    left["design"]["abstract_site_tags"] = ["sloped", "wooded"]
    left["design"]["massing_strategy"] = ["courtyard", "stepped"]
    left["design"]["space_strategy"] = ["service-core", "open-plan"]
    left["references"] = [
        {
            "case_id": "reviewed-b",
            "review_state": "limited",
            "used_for": ["site", "space"],
            "hints": [
                {"area": "site", "claim": "retain slope", "confidence": 0.8},
                {"area": "space", "claim": "compact core", "confidence": 0.7},
            ],
        },
        {
            "case_id": "reviewed-a",
            "review_state": "approved",
            "used_for": ["envelope"],
            "hints": [
                {"area": "envelope", "claim": "stepped massing", "confidence": 0.9}
            ],
        },
    ]
    right = copy.deepcopy(left)
    for field in ("abstract_site_tags", "massing_strategy", "space_strategy"):
        right["design"][field].reverse()
    right["references"].reverse()
    right["references"][1]["used_for"].reverse()
    right["references"][1]["hints"].reverse()

    assert torch.equal(encoder.encode(left), encoder.encode(right))


def test_seed_is_stable_and_does_not_consume_torch_random_state():
    encoder = ConditionEncoder(size=64)
    first = _condition()
    second = copy.deepcopy(first)
    second["seed"] += 1

    before = torch.random.get_rng_state().clone()
    first_encoded = encoder.encode(first)
    after = torch.random.get_rng_state()

    assert torch.equal(before, after)
    assert torch.equal(first_encoded[:7], encoder.encode(second)[:7])
    assert not torch.equal(first_encoded[7:], encoder.encode(second)[7:])
    assert -1 <= float(first_encoded[-1]) <= 1


def test_condition_encoder_rejects_noncanonical_width():
    with pytest.raises(ValueError, match="size must be 64"):
        ConditionEncoder(size=63)
