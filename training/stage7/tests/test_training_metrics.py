from __future__ import annotations

import math

import pytest
import torch

import mcagent_stage7.training_metrics as training_metrics
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


def test_selection_score_uses_the_fixed_harmonic_mean() -> None:
    assert training_metrics.selection_score(0.4, 0.2) == pytest.approx(
        2 * 0.4 * 0.2 / 0.6
    )
    assert training_metrics.selection_score(0.0, 0.2) == 0.0
    assert training_metrics.selection_score(0.4, 0.0) == 0.0

    for invalid in (-0.1, float("nan"), float("inf")):
        with pytest.raises(
            TrainingError,
            match="EVALUATION_METRIC_INVALID",
        ):
            training_metrics.selection_score(invalid, 0.2)


def test_phase2_uses_exact_acceptance_boundaries() -> None:
    baseline = training_metrics.BASELINE_NON_AIR_MACRO_F1
    passing = training_metrics.phase2_result(
        _phase2_metrics(
            macro_f1=math.nextafter(baseline, math.inf),
            token5_f1=0.10,
            occupancy_f1=0.90,
        ),
        _phase2_gate(ratio=0.5),
    )

    assert passing["macro_f1_beats_baseline"] is True
    assert passing["token5_f1_minimum"] is True
    assert passing["occupancy_f1_minimum"] is True
    assert passing["non_air_fraction"] is True
    assert passing["gate2_passed"] is True
    assert passing["passed"] is True

    assert training_metrics.phase2_result(
        _phase2_metrics(baseline, 0.10, 0.90),
        _phase2_gate(ratio=2.0),
    )["macro_f1_beats_baseline"] is False
    assert training_metrics.phase2_result(
        _phase2_metrics(
            math.nextafter(baseline, math.inf),
            math.nextafter(0.10, -math.inf),
            0.90,
        ),
        _phase2_gate(),
    )["token5_f1_minimum"] is False
    assert training_metrics.phase2_result(
        _phase2_metrics(
            math.nextafter(baseline, math.inf),
            0.10,
            math.nextafter(0.90, -math.inf),
        ),
        _phase2_gate(),
    )["occupancy_f1_minimum"] is False
    assert training_metrics.phase2_result(
        _phase2_metrics(
            math.nextafter(baseline, math.inf),
            0.10,
            0.90,
        ),
        _phase2_gate(ratio=math.nextafter(0.5, -math.inf)),
    )["non_air_fraction"] is False
    assert training_metrics.phase2_result(
        _phase2_metrics(
            math.nextafter(baseline, math.inf),
            0.10,
            0.90,
        ),
        _phase2_gate(ratio=math.nextafter(2.0, math.inf)),
    )["non_air_fraction"] is False


def test_phase2_requires_the_existing_gate2_to_pass() -> None:
    result = training_metrics.phase2_result(
        _phase2_metrics(0.5, 0.2, 0.95),
        _phase2_gate(passed=False),
    )

    assert result["gate2_passed"] is False
    assert result["passed"] is False


def test_ablation_winner_uses_score_macro_and_lexicographic_order() -> None:
    ineligible = _ablation_report(
        "ineligible",
        score=0.99,
        macro_f1=0.99,
        gate2_passed=False,
    )
    lower = _ablation_report("lower", score=0.20, macro_f1=0.60)
    higher = _ablation_report("higher", score=0.30, macro_f1=0.40)
    assert training_metrics.select_ablation_winner(
        (ineligible, lower, higher)
    )["run_id"] == "higher"

    macro_tie_break = _ablation_report(
        "macro-winner",
        score=0.30,
        macro_f1=0.50,
    )
    assert training_metrics.select_ablation_winner(
        (higher, macro_tie_break)
    )["run_id"] == "macro-winner"

    lexical_later = _ablation_report(
        "z-run",
        score=0.30,
        macro_f1=0.50,
    )
    lexical_earlier = _ablation_report(
        "a-run",
        score=0.30,
        macro_f1=0.50,
    )
    assert training_metrics.select_ablation_winner(
        (lexical_later, lexical_earlier)
    )["run_id"] == "a-run"


def test_ablation_winner_rejects_no_eligible_or_non_validation_reports() -> None:
    with pytest.raises(
        TrainingError,
        match="ABLATION_WINNER_MISSING",
    ):
        training_metrics.select_ablation_winner(
            (
                _ablation_report(
                    "failed",
                    score=0.5,
                    macro_f1=0.5,
                    gate2_passed=False,
                ),
            )
        )

    report = _ablation_report("test-report", score=0.5, macro_f1=0.5)
    report["split"] = "test"
    with pytest.raises(
        TrainingError,
        match="ABLATION_REPORT_SPLIT_INVALID",
    ):
        training_metrics.select_ablation_winner((report,))


def _phase2_metrics(
    macro_f1: float,
    token5_f1: float,
    occupancy_f1: float,
) -> dict[str, object]:
    return {
        "non_air_macro_f1": macro_f1,
        "classes": {"5": {"f1": token5_f1}},
        "occupancy": {"f1": occupancy_f1},
    }


def _phase2_gate(
    *,
    ratio: float = 1.0,
    passed: bool = True,
) -> dict[str, object]:
    return {
        "passed": passed,
        "predicted_to_target_non_air_ratio": ratio,
    }


def _ablation_report(
    run_id: str,
    *,
    score: float,
    macro_f1: float,
    gate2_passed: bool = True,
) -> dict[str, object]:
    return {
        "run_id": run_id,
        "split": "validation",
        "selection_score": score,
        "gate2": {"passed": gate2_passed},
        "metrics": {
            "trained": {"non_air_macro_f1": macro_f1},
        },
    }
