from __future__ import annotations

import pytest
import torch

from mcagent_stage7.private_research import PrivateResearchError
from mcagent_stage7.private_research_evaluation import (
    MetricAccumulator,
    build_class_prior,
    class_prior_nll_sum,
    derive_evaluation_seed,
    quality_gate,
)


def test_evaluation_seed_has_a_stable_golden_value() -> None:
    assert derive_evaluation_seed(7101, 0, 0) == 1998645050
    assert derive_evaluation_seed(7101, 0, 1) != 1998645050


def test_metric_accumulator_reports_masked_non_air_macro_scores() -> None:
    targets = torch.tensor([0, 1, 1, 2], dtype=torch.long)
    predictions = torch.tensor([0, 1, 2, 2], dtype=torch.long)
    mask = torch.ones(4, dtype=torch.bool)
    accumulator = MetricAccumulator()
    accumulator.update(targets=targets, predictions=predictions, mask=mask, nll_sum=4.0)

    summary = accumulator.summary()

    assert summary["masked_count"] == 4
    assert summary["masked_cross_entropy"] == pytest.approx(1.0)
    assert summary["masked_accuracy"] == pytest.approx(0.75)
    assert summary["non_air_macro_f1"] == pytest.approx(2.0 / 3.0)
    assert summary["non_air_macro_iou"] == pytest.approx(0.5)
    assert summary["supported_non_air_class_count"] == 2


def test_metric_accumulator_rejects_no_non_air_support() -> None:
    accumulator = MetricAccumulator()
    values = torch.zeros(4, dtype=torch.long)
    accumulator.update(
        targets=values,
        predictions=values,
        mask=torch.ones(4, dtype=torch.bool),
        nll_sum=0.0,
    )
    with pytest.raises(PrivateResearchError, match="EVALUATION_NO_NON_AIR_SUPPORT"):
        accumulator.summary()


def test_class_prior_is_train_only_add_one_smoothed_and_finite() -> None:
    prior = build_class_prior([torch.tensor([0, 0, 1], dtype=torch.long)])
    assert prior.shape == (9,)
    assert prior.tolist()[:3] == pytest.approx([3 / 12, 2 / 12, 1 / 12])
    assert float(prior.sum()) == pytest.approx(1.0)
    assert (
        class_prior_nll_sum(
            prior,
            torch.tensor([0, 1]),
            torch.tensor([True, True]),
        )
        > 0
    )


def test_quality_gate_requires_both_metrics_to_strictly_beat_both_baselines() -> None:
    trained = {"non_air_macro_f1": 0.4, "non_air_macro_iou": 0.3}
    untrained = {"non_air_macro_f1": 0.2, "non_air_macro_iou": 0.1}
    prior = {"non_air_macro_f1": 0.0, "non_air_macro_iou": 0.0}
    assert quality_gate(trained, untrained, prior) == {
        "f1_beats_untrained": True,
        "f1_beats_class_prior": True,
        "iou_beats_untrained": True,
        "iou_beats_class_prior": True,
        "passed": True,
    }
    assert quality_gate(untrained, untrained, prior)["passed"] is False
