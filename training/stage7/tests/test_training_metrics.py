from __future__ import annotations

import math

import pytest
import torch

from mcagent_stage7.training_data import TrainingError
from mcagent_stage7.training_metrics import (
    MetricAccumulator,
    build_baselines,
    gate1_result,
    gate2_result,
)


def test_metric_summary_matches_hand_calculated_confusions() -> None:
    targets = torch.tensor([0, 1, 1, 2, 2, 2], dtype=torch.long)
    predictions = torch.tensor([0, 1, 2, 2, 0, 2], dtype=torch.long)
    mask = torch.ones_like(targets, dtype=torch.bool)
    metrics = MetricAccumulator()

    metrics.update(
        targets=targets,
        predictions=predictions,
        mask=mask,
        occupancy_loss_sum=3.0,
        semantic_loss_sum=5.0,
    )
    summary = metrics.summary()

    assert summary["occupancy_confusion_matrix"] == [[1, 0], [1, 4]]
    assert summary["semantic_confusion_matrix"][0][:3] == [1, 0, 0]
    assert summary["semantic_confusion_matrix"][1][:3] == [0, 1, 1]
    assert summary["semantic_confusion_matrix"][2][:3] == [1, 0, 2]
    assert summary["occupancy"]["precision"] == pytest.approx(1.0)
    assert summary["occupancy"]["recall"] == pytest.approx(0.8)
    assert summary["occupancy"]["f1"] == pytest.approx(8 / 9)
    assert summary["occupancy"]["iou"] == pytest.approx(0.8)
    assert summary["classes"]["1"]["precision"] == pytest.approx(1.0)
    assert summary["classes"]["1"]["recall"] == pytest.approx(0.5)
    assert summary["classes"]["1"]["f1"] == pytest.approx(2 / 3)
    assert summary["classes"]["1"]["iou"] == pytest.approx(0.5)
    assert summary["classes"]["2"]["precision"] == pytest.approx(2 / 3)
    assert summary["classes"]["2"]["recall"] == pytest.approx(2 / 3)
    assert summary["non_air_macro_f1"] == pytest.approx(2 / 3)
    assert summary["non_air_macro_iou"] == pytest.approx(0.5)
    assert summary["supported_non_air_classes"] == [1, 2]
    assert summary["target_non_air_fraction"] == pytest.approx(5 / 6)
    assert summary["predicted_non_air_fraction"] == pytest.approx(4 / 6)
    assert summary["loss_occupancy"] == pytest.approx(0.5)
    assert summary["loss_semantic"] == pytest.approx(1.0)
    assert summary["loss_total"] == pytest.approx(1.5)
    assert all(
        math.isfinite(summary[key])
        for key in ("loss_occupancy", "loss_semantic", "loss_total")
    )


def test_baselines_choose_majority_occupancy_and_non_air_semantics() -> None:
    result = build_baselines(
        [
            torch.tensor([0, 0, 1], dtype=torch.long),
            torch.tensor([0, 2, 2], dtype=torch.long),
        ]
    )
    assert result == {"occupancy_class": 0, "semantic_token": 2}


def test_gate1_uses_the_fixed_non_air_macro_f1_threshold() -> None:
    assert gate1_result({"non_air_macro_f1": 0.90})["passed"] is True
    assert gate1_result({"non_air_macro_f1": 0.899})["passed"] is False


def test_gate2_requires_minimums_baseline_wins_and_occupancy_calibration() -> None:
    trained = {
        "non_air_macro_f1": 0.25,
        "non_air_macro_iou": 0.15,
        "target_non_air_fraction": 0.20,
        "predicted_non_air_fraction": 0.25,
    }
    untrained = {"non_air_macro_f1": 0.10, "non_air_macro_iou": 0.05}
    prior = {"non_air_macro_f1": 0.0, "non_air_macro_iou": 0.0}

    result = gate2_result(trained, untrained, prior)

    assert result["passed"] is True
    assert all(
        result[key] is True
        for key in (
            "f1_minimum",
            "iou_minimum",
            "f1_beats_untrained",
            "f1_beats_prior",
            "iou_beats_untrained",
            "iou_beats_prior",
            "non_air_fraction",
        )
    )
    assert result["predicted_to_target_non_air_ratio"] == pytest.approx(1.25)


def test_gate2_rejects_all_air_predictions_and_zero_target_support() -> None:
    all_air = {
        "non_air_macro_f1": 0.0,
        "non_air_macro_iou": 0.0,
        "target_non_air_fraction": 0.20,
        "predicted_non_air_fraction": 0.0,
    }
    baseline = {"non_air_macro_f1": 0.0, "non_air_macro_iou": 0.0}
    assert gate2_result(all_air, baseline, baseline)["passed"] is False

    no_support = {**all_air, "target_non_air_fraction": 0.0}
    with pytest.raises(
        TrainingError,
        match="EVALUATION_NO_NON_AIR_SUPPORT",
    ):
        gate2_result(no_support, baseline, baseline)


def test_metric_summary_rejects_missing_non_air_support_and_nonfinite_loss() -> None:
    accumulator = MetricAccumulator()
    target = torch.tensor([0], dtype=torch.long)
    accumulator.update(
        targets=target,
        predictions=target,
        mask=torch.ones_like(target, dtype=torch.bool),
        occupancy_loss_sum=0.0,
        semantic_loss_sum=0.0,
    )
    with pytest.raises(
        TrainingError,
        match="EVALUATION_NO_NON_AIR_SUPPORT",
    ):
        accumulator.summary()

    with pytest.raises(TrainingError, match="EVALUATION_LOSS_INVALID"):
        MetricAccumulator().update(
            targets=torch.tensor([1]),
            predictions=torch.tensor([1]),
            mask=torch.tensor([True]),
            occupancy_loss_sum=float("nan"),
            semantic_loss_sum=0.0,
        )
