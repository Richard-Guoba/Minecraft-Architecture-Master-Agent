from __future__ import annotations

import math
from collections.abc import Iterable
from typing import Any

import torch

from .training_data import TOKEN_COUNT, TrainingError


BASELINE_NON_AIR_MACRO_F1 = 0.3609670072698868


class MetricAccumulator:
    def __init__(self) -> None:
        self.semantic_confusion = torch.zeros(
            (TOKEN_COUNT, TOKEN_COUNT),
            dtype=torch.int64,
        )
        self.occupancy_confusion = torch.zeros((2, 2), dtype=torch.int64)
        self.occupancy_loss_sum = 0.0
        self.semantic_loss_sum = 0.0
        self.masked_count = 0
        self.masked_non_air_count = 0

    def update(
        self,
        *,
        targets: torch.Tensor,
        predictions: torch.Tensor,
        mask: torch.Tensor,
        occupancy_loss_sum: float,
        semantic_loss_sum: float,
    ) -> None:
        _validate_metric_tensors(targets, predictions, mask)
        if any(
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(float(value))
            or float(value) < 0.0
            for value in (occupancy_loss_sum, semantic_loss_sum)
        ):
            raise TrainingError("EVALUATION_LOSS_INVALID", "loss sums")
        selected_targets = targets[mask].to("cpu")
        selected_predictions = predictions[mask].to("cpu")
        semantic_bins = torch.bincount(
            selected_targets * TOKEN_COUNT + selected_predictions,
            minlength=TOKEN_COUNT**2,
        ).reshape(TOKEN_COUNT, TOKEN_COUNT)
        target_occupancy = (selected_targets != 0).long()
        predicted_occupancy = (selected_predictions != 0).long()
        occupancy_bins = torch.bincount(
            target_occupancy * 2 + predicted_occupancy,
            minlength=4,
        ).reshape(2, 2)
        self.semantic_confusion += semantic_bins
        self.occupancy_confusion += occupancy_bins
        self.occupancy_loss_sum += float(occupancy_loss_sum)
        self.semantic_loss_sum += float(semantic_loss_sum)
        self.masked_count += int(selected_targets.numel())
        self.masked_non_air_count += int(target_occupancy.sum())

    def summary(self) -> dict[str, Any]:
        if self.masked_count <= 0:
            raise TrainingError("EVALUATION_INCOMPLETE", "no predictions")
        supports = self.semantic_confusion.sum(dim=1)
        supported = [
            index
            for index in range(1, TOKEN_COUNT)
            if int(supports[index]) > 0
        ]
        if not supported or self.masked_non_air_count <= 0:
            raise TrainingError(
                "EVALUATION_NO_NON_AIR_SUPPORT",
                "validation targets",
            )
        classes = {
            str(index): _class_metrics(self.semantic_confusion, index)
            for index in range(TOKEN_COUNT)
        }
        occupancy = _class_metrics(self.occupancy_confusion, 1)
        macro = {
            name: sum(classes[str(index)][name] for index in supported)
            / len(supported)
            for name in ("precision", "recall", "f1", "iou")
        }
        occupancy_loss = self.occupancy_loss_sum / self.masked_count
        semantic_loss = (
            self.semantic_loss_sum / self.masked_non_air_count
        )
        result = {
            "masked_voxel_count": self.masked_count,
            "masked_non_air_count": self.masked_non_air_count,
            "occupancy_confusion_matrix": self.occupancy_confusion.tolist(),
            "semantic_confusion_matrix": self.semantic_confusion.tolist(),
            "occupancy": occupancy,
            "classes": classes,
            "supported_non_air_classes": supported,
            "non_air_macro_precision": macro["precision"],
            "non_air_macro_recall": macro["recall"],
            "non_air_macro_f1": macro["f1"],
            "non_air_macro_iou": macro["iou"],
            "target_non_air_fraction": (
                self.masked_non_air_count / self.masked_count
            ),
            "predicted_non_air_fraction": (
                int(self.occupancy_confusion[:, 1].sum())
                / self.masked_count
            ),
            "loss_occupancy": occupancy_loss,
            "loss_semantic": semantic_loss,
            "loss_total": occupancy_loss + semantic_loss,
        }
        _assert_finite_summary(result)
        return result


def build_baselines(
    targets: Iterable[torch.Tensor],
) -> dict[str, int]:
    occupancy_counts = torch.zeros(2, dtype=torch.int64)
    semantic_counts = torch.zeros(TOKEN_COUNT - 1, dtype=torch.int64)
    seen = 0
    for target in targets:
        if (
            not isinstance(target, torch.Tensor)
            or target.dtype != torch.long
            or target.numel() == 0
            or int(target.min()) < 0
            or int(target.max()) >= TOKEN_COUNT
        ):
            raise TrainingError("EVALUATION_TENSOR_INVALID", "baseline target")
        flattened = target.reshape(-1).to("cpu")
        occupancy_counts += torch.bincount(
            (flattened != 0).long(),
            minlength=2,
        )
        non_air = flattened[flattened != 0]
        if non_air.numel() > 0:
            semantic_counts += torch.bincount(
                non_air - 1,
                minlength=TOKEN_COUNT - 1,
            )
        seen += 1
    if seen == 0:
        raise TrainingError("EVALUATION_INCOMPLETE", "empty training split")
    if int(semantic_counts.sum()) == 0:
        raise TrainingError(
            "EVALUATION_NO_NON_AIR_SUPPORT",
            "training targets",
        )
    return {
        "occupancy_class": int(occupancy_counts.argmax()),
        "semantic_token": int(semantic_counts.argmax()) + 1,
    }


def gate1_result(metrics: dict[str, Any]) -> dict[str, Any]:
    value = _finite_metric(metrics, "non_air_macro_f1")
    return {
        "non_air_macro_f1": value,
        "minimum": 0.90,
        "passed": value >= 0.90,
    }


def gate2_result(
    trained: dict[str, Any],
    untrained: dict[str, Any],
    class_prior: dict[str, Any],
) -> dict[str, Any]:
    trained_f1 = _finite_metric(trained, "non_air_macro_f1")
    trained_iou = _finite_metric(trained, "non_air_macro_iou")
    target_fraction = _finite_metric(trained, "target_non_air_fraction")
    predicted_fraction = _finite_metric(
        trained,
        "predicted_non_air_fraction",
    )
    if target_fraction <= 0.0:
        raise TrainingError(
            "EVALUATION_NO_NON_AIR_SUPPORT",
            "target fraction",
        )
    ratio = predicted_fraction / target_fraction
    checks = {
        "f1_minimum": trained_f1 >= 0.20,
        "iou_minimum": trained_iou >= 0.10,
        "f1_beats_untrained": trained_f1
        > _finite_metric(untrained, "non_air_macro_f1"),
        "f1_beats_prior": trained_f1
        > _finite_metric(class_prior, "non_air_macro_f1"),
        "iou_beats_untrained": trained_iou
        > _finite_metric(untrained, "non_air_macro_iou"),
        "iou_beats_prior": trained_iou
        > _finite_metric(class_prior, "non_air_macro_iou"),
        "non_air_fraction": 0.5 <= ratio <= 2.0,
    }
    return {
        **checks,
        "predicted_to_target_non_air_ratio": ratio,
        "passed": all(checks.values()),
    }


def selection_score(macro_f1: float, token5_f1: float) -> float:
    macro = _nonnegative_metric(macro_f1, "non_air_macro_f1")
    token5 = _nonnegative_metric(token5_f1, "token5_f1")
    if macro <= 0.0 or token5 <= 0.0:
        return 0.0
    return 2.0 * macro * token5 / (macro + token5)


def phase2_result(
    trained: dict[str, Any],
    gate2: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(trained, dict) or not isinstance(gate2, dict):
        raise TrainingError(
            "EVALUATION_METRIC_INVALID",
            "phase2",
        )
    classes = trained.get("classes")
    occupancy = trained.get("occupancy")
    if (
        not isinstance(classes, dict)
        or not isinstance(classes.get("5"), dict)
        or not isinstance(occupancy, dict)
    ):
        raise TrainingError(
            "EVALUATION_METRIC_INVALID",
            "phase2 classes",
        )
    macro_f1 = _nonnegative_metric(
        trained.get("non_air_macro_f1"),
        "non_air_macro_f1",
    )
    token5_f1 = _nonnegative_metric(
        classes["5"].get("f1"),
        "token5_f1",
    )
    occupancy_f1 = _nonnegative_metric(
        occupancy.get("f1"),
        "occupancy_f1",
    )
    ratio = _nonnegative_metric(
        gate2.get("predicted_to_target_non_air_ratio"),
        "predicted_to_target_non_air_ratio",
    )
    checks = {
        "macro_f1_beats_baseline": (
            macro_f1 > BASELINE_NON_AIR_MACRO_F1
        ),
        "token5_f1_minimum": token5_f1 >= 0.10,
        "occupancy_f1_minimum": occupancy_f1 >= 0.90,
        "non_air_fraction": 0.5 <= ratio <= 2.0,
        "gate2_passed": gate2.get("passed") is True,
    }
    return {
        **checks,
        "non_air_macro_f1": macro_f1,
        "token5_f1": token5_f1,
        "occupancy_f1": occupancy_f1,
        "predicted_to_target_non_air_ratio": ratio,
        "selection_score": selection_score(macro_f1, token5_f1),
        "passed": all(checks.values()),
    }


def select_ablation_winner(
    reports: Iterable[dict[str, Any]],
) -> dict[str, Any]:
    candidates = list(reports)
    ranked: list[tuple[float, float, str, dict[str, Any]]] = []
    for report in candidates:
        if not isinstance(report, dict):
            raise TrainingError(
                "ABLATION_REPORT_INVALID",
                "report",
            )
        if report.get("split") != "validation":
            raise TrainingError(
                "ABLATION_REPORT_SPLIT_INVALID",
                str(report.get("split")),
            )
        run_id = report.get("run_id")
        gate2 = report.get("gate2")
        metrics = report.get("metrics")
        if (
            not isinstance(run_id, str)
            or not run_id
            or not isinstance(gate2, dict)
            or not isinstance(metrics, dict)
            or not isinstance(metrics.get("trained"), dict)
        ):
            raise TrainingError(
                "ABLATION_REPORT_INVALID",
                str(run_id),
            )
        score = _nonnegative_metric(
            report.get("selection_score"),
            "selection_score",
        )
        macro_f1 = _nonnegative_metric(
            metrics["trained"].get("non_air_macro_f1"),
            "non_air_macro_f1",
        )
        if gate2.get("passed") is True:
            ranked.append((score, macro_f1, run_id, report))
    if not ranked:
        raise TrainingError(
            "ABLATION_WINNER_MISSING",
            "no Gate 2 pass",
        )
    return min(
        ranked,
        key=lambda item: (-item[0], -item[1], item[2]),
    )[3]


def _class_metrics(confusion: torch.Tensor, index: int) -> dict[str, Any]:
    true_positive = int(confusion[index, index])
    false_positive = int(confusion[:, index].sum()) - true_positive
    false_negative = int(confusion[index, :].sum()) - true_positive
    support = int(confusion[index, :].sum())
    precision_denominator = true_positive + false_positive
    recall_denominator = true_positive + false_negative
    f1_denominator = 2 * true_positive + false_positive + false_negative
    iou_denominator = true_positive + false_positive + false_negative
    return {
        "support": support,
        "precision": (
            true_positive / precision_denominator
            if precision_denominator
            else 0.0
        ),
        "recall": (
            true_positive / recall_denominator
            if recall_denominator
            else 0.0
        ),
        "f1": (
            2 * true_positive / f1_denominator
            if f1_denominator
            else 0.0
        ),
        "iou": (
            true_positive / iou_denominator
            if iou_denominator
            else 0.0
        ),
    }


def _validate_metric_tensors(
    targets: torch.Tensor,
    predictions: torch.Tensor,
    mask: torch.Tensor,
) -> None:
    if (
        not isinstance(targets, torch.Tensor)
        or not isinstance(predictions, torch.Tensor)
        or targets.dtype != torch.long
        or predictions.dtype != torch.long
        or targets.shape != predictions.shape
        or targets.numel() == 0
        or int(targets.min()) < 0
        or int(targets.max()) >= TOKEN_COUNT
        or int(predictions.min()) < 0
        or int(predictions.max()) >= TOKEN_COUNT
    ):
        raise TrainingError("EVALUATION_TENSOR_INVALID", "target or prediction")
    if (
        not isinstance(mask, torch.Tensor)
        or mask.dtype != torch.bool
        or mask.shape != targets.shape
        or not bool(mask.any())
    ):
        raise TrainingError("EVALUATION_MASK_INVALID", "mask")


def _finite_metric(metrics: dict[str, Any], key: str) -> float:
    value = metrics.get(key)
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(float(value))
    ):
        raise TrainingError("EVALUATION_METRIC_INVALID", key)
    return float(value)


def _nonnegative_metric(value: object, key: str) -> float:
    parsed = _finite_metric({key: value}, key)
    if parsed < 0.0:
        raise TrainingError("EVALUATION_METRIC_INVALID", key)
    return parsed


def _assert_finite_summary(summary: dict[str, Any]) -> None:
    keys = (
        "non_air_macro_precision",
        "non_air_macro_recall",
        "non_air_macro_f1",
        "non_air_macro_iou",
        "target_non_air_fraction",
        "predicted_non_air_fraction",
        "loss_occupancy",
        "loss_semantic",
        "loss_total",
    )
    if any(not math.isfinite(float(summary[key])) for key in keys):
        raise TrainingError("EVALUATION_METRIC_NONFINITE", "summary")
