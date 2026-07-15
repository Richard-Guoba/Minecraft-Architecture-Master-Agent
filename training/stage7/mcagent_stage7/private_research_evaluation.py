from __future__ import annotations

import hashlib
import math
from collections.abc import Iterable
from typing import Any

import torch

from .private_research import PrivateResearchError
from .private_research_model import PRIVATE_TOKEN_COUNT


EVALUATION_MASK_NAMESPACE = "stage7-private-research-evaluation-mask-v1"


def derive_evaluation_seed(seed: int, validation_index: int, repeat_index: int) -> int:
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed < 2**32:
        raise PrivateResearchError("EVALUATION_CONFIG_INVALID", "seed")
    if (
        isinstance(validation_index, bool)
        or not isinstance(validation_index, int)
        or validation_index < 0
    ):
        raise PrivateResearchError("EVALUATION_CONFIG_INVALID", "validation_index")
    if (
        isinstance(repeat_index, bool)
        or not isinstance(repeat_index, int)
        or repeat_index < 0
    ):
        raise PrivateResearchError("EVALUATION_CONFIG_INVALID", "repeat_index")
    digest = hashlib.sha256(
        f"{EVALUATION_MASK_NAMESPACE}:{seed}:{validation_index}:{repeat_index}".encode("ascii")
    ).digest()
    return int.from_bytes(digest[:4], "big")


class MetricAccumulator:
    def __init__(self) -> None:
        self.confusion = torch.zeros(
            (PRIVATE_TOKEN_COUNT, PRIVATE_TOKEN_COUNT), dtype=torch.int64
        )
        self.nll_sum = 0.0
        self.masked_count = 0

    def update(
        self,
        *,
        targets: torch.Tensor,
        predictions: torch.Tensor,
        mask: torch.Tensor,
        nll_sum: float,
    ) -> None:
        if targets.dtype != torch.long or predictions.dtype != torch.long:
            raise PrivateResearchError(
                "EVALUATION_TENSOR_INVALID", "target/prediction dtype"
            )
        if (
            targets.shape != predictions.shape
            or targets.shape != mask.shape
            or mask.dtype != torch.bool
        ):
            raise PrivateResearchError("EVALUATION_TENSOR_INVALID", "shape or mask dtype")
        if not bool(mask.any()):
            raise PrivateResearchError("EVALUATION_MASK_EMPTY", "mask")
        selected_targets = targets[mask].to("cpu")
        selected_predictions = predictions[mask].to("cpu")
        if int(selected_targets.min()) < 0 or int(selected_targets.max()) >= PRIVATE_TOKEN_COUNT:
            raise PrivateResearchError("EVALUATION_TENSOR_INVALID", "target range")
        if (
            int(selected_predictions.min()) < 0
            or int(selected_predictions.max()) >= PRIVATE_TOKEN_COUNT
        ):
            raise PrivateResearchError("EVALUATION_TENSOR_INVALID", "prediction range")
        if not math.isfinite(float(nll_sum)) or float(nll_sum) < 0:
            raise PrivateResearchError("EVALUATION_METRIC_NONFINITE", "nll_sum")
        bins = torch.bincount(
            selected_targets * PRIVATE_TOKEN_COUNT + selected_predictions,
            minlength=PRIVATE_TOKEN_COUNT**2,
        ).reshape(PRIVATE_TOKEN_COUNT, PRIVATE_TOKEN_COUNT)
        self.confusion += bins
        self.nll_sum += float(nll_sum)
        self.masked_count += int(selected_targets.numel())

    def summary(self) -> dict[str, Any]:
        if self.masked_count <= 0:
            raise PrivateResearchError("EVALUATION_INCOMPLETE", "no masked predictions")
        supports = self.confusion.sum(dim=1)
        supported = [
            index
            for index in range(1, PRIVATE_TOKEN_COUNT)
            if int(supports[index]) > 0
        ]
        if not supported:
            raise PrivateResearchError(
                "EVALUATION_NO_NON_AIR_SUPPORT", "validation targets"
            )
        f1_values: list[float] = []
        iou_values: list[float] = []
        for index in supported:
            true_positive = float(self.confusion[index, index])
            false_positive = float(self.confusion[:, index].sum()) - true_positive
            false_negative = float(self.confusion[index, :].sum()) - true_positive
            f1_values.append(
                (2 * true_positive)
                / (2 * true_positive + false_positive + false_negative)
            )
            iou_values.append(
                true_positive / (true_positive + false_positive + false_negative)
            )
        summary = {
            "masked_count": self.masked_count,
            "masked_cross_entropy": self.nll_sum / self.masked_count,
            "masked_accuracy": float(self.confusion.diag().sum()) / self.masked_count,
            "non_air_macro_f1": sum(f1_values) / len(f1_values),
            "non_air_macro_iou": sum(iou_values) / len(iou_values),
            "supported_non_air_class_count": len(supported),
            "class_supports": supports.tolist(),
            "confusion_matrix": self.confusion.tolist(),
        }
        if any(
            not math.isfinite(float(summary[key]))
            for key in (
                "masked_cross_entropy",
                "masked_accuracy",
                "non_air_macro_f1",
                "non_air_macro_iou",
            )
        ):
            raise PrivateResearchError("EVALUATION_METRIC_NONFINITE", "summary")
        return summary


def build_class_prior(targets: Iterable[torch.Tensor]) -> torch.Tensor:
    counts = torch.ones(PRIVATE_TOKEN_COUNT, dtype=torch.float64)
    seen = 0
    for target in targets:
        if target.dtype != torch.long or target.numel() == 0:
            raise PrivateResearchError(
                "EVALUATION_TENSOR_INVALID", "class-prior target"
            )
        if int(target.min()) < 0 or int(target.max()) >= PRIVATE_TOKEN_COUNT:
            raise PrivateResearchError(
                "EVALUATION_TENSOR_INVALID", "class-prior range"
            )
        counts += torch.bincount(
            target.reshape(-1).to("cpu"), minlength=PRIVATE_TOKEN_COUNT
        )
        seen += 1
    if seen == 0:
        raise PrivateResearchError("EVALUATION_INCOMPLETE", "empty training split")
    return counts / counts.sum()


def class_prior_nll_sum(
    prior: torch.Tensor, targets: torch.Tensor, mask: torch.Tensor
) -> float:
    if prior.shape != (PRIVATE_TOKEN_COUNT,) or prior.dtype != torch.float64:
        raise PrivateResearchError("EVALUATION_BASELINE_INVALID", "class prior")
    if targets.dtype != torch.long or targets.shape != mask.shape or mask.dtype != torch.bool:
        raise PrivateResearchError("EVALUATION_TENSOR_INVALID", "class-prior batch")
    if not bool(mask.any()):
        raise PrivateResearchError("EVALUATION_MASK_EMPTY", "class-prior mask")
    selected_targets = targets[mask].to("cpu")
    if int(selected_targets.min()) < 0 or int(selected_targets.max()) >= PRIVATE_TOKEN_COUNT:
        raise PrivateResearchError("EVALUATION_TENSOR_INVALID", "class-prior range")
    values = -torch.log(prior[selected_targets]).sum()
    result = float(values.item())
    if not math.isfinite(result):
        raise PrivateResearchError("EVALUATION_METRIC_NONFINITE", "class-prior nll")
    return result


def quality_gate(
    trained: dict[str, Any],
    untrained: dict[str, Any],
    class_prior: dict[str, Any],
) -> dict[str, bool]:
    comparisons = {
        "f1_beats_untrained": (
            trained["non_air_macro_f1"] > untrained["non_air_macro_f1"]
        ),
        "f1_beats_class_prior": (
            trained["non_air_macro_f1"] > class_prior["non_air_macro_f1"]
        ),
        "iou_beats_untrained": (
            trained["non_air_macro_iou"] > untrained["non_air_macro_iou"]
        ),
        "iou_beats_class_prior": (
            trained["non_air_macro_iou"] > class_prior["non_air_macro_iou"]
        ),
    }
    return {**comparisons, "passed": all(comparisons.values())}
