import copy
import json
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest
import torch

from mcagent_stage7.contracts import ENVELOPE_VALUES, SITE_VALUES, SPACE_VALUES
from mcagent_stage7.tensors import PlanTargets, plan_to_targets, predictions_to_plan


FIXTURE_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "m3"
DEFAULT_LABELS = {"envelope": "none", "space": "outside", "site": "none"}
CHECKPOINT = "sha256:" + "a" * 64
PROVIDER = {
    "kind": "learned-python-shadow",
    "name": "stage7-tiny-cvae-v1",
    "model_version": "m3-fixture-v1",
    "dataset_version": "fixture-v1",
    "checkpoint_version": CHECKPOINT,
}


def _read_fixture(name: str) -> dict:
    return json.loads(
        (FIXTURE_ROOT / f"cases/one-floor-house/{name}.json").read_text("utf8")
    )


def _single_run_plan(**changes) -> dict:
    plan = _read_fixture("plan")
    run = {
        "x0": 3,
        "x1": 5,
        "y": 7,
        "z": 11,
        "envelope": "wall",
        "space": "private",
        "site": "path",
        "confidence": 1,
        "evidence_ids": [plan["evidence"][0]["id"]],
    }
    run.update(changes)
    plan["runs"] = [run]
    return plan


def _empty_targets() -> PlanTargets:
    return PlanTargets(
        envelope=torch.zeros((64, 64, 64), dtype=torch.long),
        space=torch.zeros((64, 64, 64), dtype=torch.long),
        site=torch.zeros((64, 64, 64), dtype=torch.long),
    )


def test_plan_expands_to_three_independent_64_cubed_targets():
    targets = plan_to_targets(_read_fixture("plan"))
    assert targets.envelope.shape == (64, 64, 64)
    assert targets.space.shape == (64, 64, 64)
    assert targets.site.shape == (64, 64, 64)
    assert targets.envelope.dtype == targets.space.dtype == targets.site.dtype == torch.long
    assert int(targets.envelope.min()) == 0
    assert int(targets.envelope.max()) < len(ENVELOPE_VALUES)
    assert int(targets.space.max()) < len(SPACE_VALUES)
    assert int(targets.site.max()) < len(SITE_VALUES)


def test_plan_expands_inclusive_x_runs_at_y_z_x_indices():
    targets = plan_to_targets(_single_run_plan())
    assert torch.equal(
        targets.envelope[7, 11, 3:6],
        torch.full((3,), ENVELOPE_VALUES.index("wall"), dtype=torch.long),
    )
    assert torch.equal(
        targets.space[7, 11, 3:6],
        torch.full((3,), SPACE_VALUES.index("private"), dtype=torch.long),
    )
    assert torch.equal(
        targets.site[7, 11, 3:6],
        torch.full((3,), SITE_VALUES.index("path"), dtype=torch.long),
    )
    assert int(torch.count_nonzero(targets.envelope)) == 3


def test_plan_targets_are_frozen_and_compare_all_three_layers():
    first = _empty_targets()
    second = _empty_targets()
    assert first.equal(second)
    second.site[0, 0, 0] = 1
    assert not first.equal(second)
    assert not first.equal(object())
    with pytest.raises(FrozenInstanceError):
        first.site = torch.ones((64, 64, 64), dtype=torch.long)


@pytest.mark.parametrize(
    "runs",
    [
        None,
        {},
        [None],
        [{"x0": 0}],
    ],
)
def test_plan_rejects_malformed_rle(runs):
    plan = _read_fixture("plan")
    plan["runs"] = runs
    with pytest.raises(ValueError, match="runs|run"):
        plan_to_targets(plan)


@pytest.mark.parametrize(
    "changes",
    [
        {"x0": -1},
        {"x1": 64},
        {"y": 64},
        {"z": -1},
        {"x0": 6, "x1": 5},
        {"y": 7.0},
    ],
)
def test_plan_rejects_out_of_range_or_noninteger_coordinates(changes):
    with pytest.raises(ValueError, match="coordinates"):
        plan_to_targets(_single_run_plan(**changes))


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("envelope", "glass"),
        ("space", "bedroom"),
        ("site", "lava"),
        ("envelope", None),
        ("envelope", []),
    ],
)
def test_plan_rejects_invalid_layer_labels(field, value):
    with pytest.raises(ValueError, match=f"invalid {field}"):
        plan_to_targets(_single_run_plan(**{field: value}))


def test_plan_rejects_overlapping_runs():
    plan = _single_run_plan()
    overlap = copy.deepcopy(plan["runs"][0])
    overlap.update(x0=5, x1=8)
    plan["runs"].append(overlap)
    with pytest.raises(ValueError, match="overlap"):
        plan_to_targets(plan)


def test_plan_rejects_noncanonical_z_y_x_order():
    plan = _single_run_plan()
    earlier = copy.deepcopy(plan["runs"][0])
    earlier.update(x0=0, x1=1, z=10)
    plan["runs"].append(earlier)
    with pytest.raises(ValueError, match="canonical z/y/x"):
        plan_to_targets(plan)


def test_predictions_decode_to_canonical_rle_and_preserve_layer_indices():
    condition = _read_fixture("condition")
    source = _read_fixture("plan")
    targets = plan_to_targets(source)
    decoded = predictions_to_plan(targets, condition, provider=PROVIDER)
    assert plan_to_targets(decoded).equal(targets)
    assert decoded["condition_hash"] == condition["condition_hash"]
    assert decoded["summary"] == {}
    assert decoded["derived_sketches"] == {"massing": [], "spaces": [], "site": []}
    assert decoded["conflicts"] == decoded["repairs"] == decoded["warnings"] == []


def test_predictions_omit_defaults_and_merge_only_identical_adjacent_x_cells():
    condition = _read_fixture("condition")
    targets = _empty_targets()
    targets.envelope[2, 1, 3:6] = ENVELOPE_VALUES.index("wall")
    targets.space[2, 1, 3:5] = SPACE_VALUES.index("private")

    decoded = predictions_to_plan(targets, condition, provider=PROVIDER)

    assert [(run["x0"], run["x1"]) for run in decoded["runs"]] == [(3, 4), (5, 5)]
    assert decoded["runs"][0]["space"] == "private"
    assert decoded["runs"][1]["space"] == "outside"
    assert all(
        any(run[field] != DEFAULT_LABELS[field] for field in DEFAULT_LABELS)
        for run in decoded["runs"]
    )
    assert decoded["runs"][0]["z"] == 1
    assert decoded["runs"][0]["y"] == 2


def test_predictions_emit_canonical_z_y_x_order():
    condition = _read_fixture("condition")
    targets = _empty_targets()
    targets.site[5, 8, 9] = SITE_VALUES.index("path")
    targets.site[6, 7, 2] = SITE_VALUES.index("path")
    targets.site[4, 8, 1] = SITE_VALUES.index("path")

    decoded = predictions_to_plan(targets, condition, provider=PROVIDER)

    assert [(run["z"], run["y"], run["x0"]) for run in decoded["runs"]] == [
        (7, 6, 2),
        (8, 4, 1),
        (8, 5, 9),
    ]


def test_predictions_copy_condition_transform_and_bind_one_checkpoint_evidence():
    condition = _read_fixture("condition")
    targets = _empty_targets()
    targets.site[0, 0, 0] = SITE_VALUES.index("ground")

    decoded = predictions_to_plan(targets, condition, provider=PROVIDER)

    assert decoded["provider"] == PROVIDER
    assert decoded["orientation"] == {
        "front_side": condition["design"]["front_side"],
        "vertical_axis": "y-up",
    }
    assert decoded["world_transform"] == {
        "lot_width": condition["dimensions"]["lot_width"],
        "lot_depth": condition["dimensions"]["lot_depth"],
        "total_height": condition["dimensions"]["total_height"],
        "ground_y": 0,
    }
    assert len(decoded["evidence"]) == 1
    assert decoded["evidence"][0]["source_id"] == CHECKPOINT
    assert {evidence_id for run in decoded["runs"] for evidence_id in run["evidence_ids"]} == {
        decoded["evidence"][0]["id"]
    }


@pytest.mark.parametrize(
    ("field", "replacement", "message"),
    [
        ("envelope", torch.zeros((64, 64), dtype=torch.long), "shape"),
        ("space", torch.zeros((64, 64, 64), dtype=torch.float32), "dtype"),
        ("site", torch.full((64, 64, 64), len(SITE_VALUES), dtype=torch.long), "range"),
    ],
)
def test_predictions_reject_invalid_tensor_contracts(field, replacement, message):
    targets = _empty_targets()
    invalid = PlanTargets(
        envelope=replacement if field == "envelope" else targets.envelope,
        space=replacement if field == "space" else targets.space,
        site=replacement if field == "site" else targets.site,
    )
    with pytest.raises(ValueError, match=message):
        predictions_to_plan(invalid, _read_fixture("condition"), provider=PROVIDER)


def test_predictions_require_checkpoint_bound_provider_metadata():
    provider = dict(PROVIDER)
    provider["checkpoint_version"] = None
    with pytest.raises(ValueError, match="checkpoint_version"):
        predictions_to_plan(_empty_targets(), _read_fixture("condition"), provider=provider)
