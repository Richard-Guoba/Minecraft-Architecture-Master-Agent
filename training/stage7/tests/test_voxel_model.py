from __future__ import annotations

import pytest
import torch

from mcagent_stage7.training_data import MASK_TOKEN, PATCH_SHAPE, TrainingError
from mcagent_stage7.voxel_model import (
    TinyVoxelCompletionModel,
    VoxelModelOutput,
    predict_tokens,
    voxel_loss,
)


def test_model_emits_two_heads_and_finite_coupled_loss() -> None:
    torch.manual_seed(7101)
    targets = torch.zeros((2, *PATCH_SHAPE), dtype=torch.long)
    targets[:, 2:6, 3:7, 4:8] = 2
    mask = torch.zeros_like(targets, dtype=torch.bool)
    mask[:, 2:6, 3:7, 4:8] = True
    mask[:, 10:14, 10:14, 10:14] = True
    visible = targets.clone()
    visible[mask] = MASK_TOKEN

    model = TinyVoxelCompletionModel()
    output = model(visible)
    loss = voxel_loss(output, targets, mask)

    assert output.occupancy_logits.shape == (2, 2, *PATCH_SHAPE)
    assert output.semantic_logits.shape == (2, 8, *PATCH_SHAPE)
    assert torch.isfinite(loss.total)
    assert torch.isfinite(loss.occupancy)
    assert torch.isfinite(loss.semantic)
    assert torch.allclose(loss.total, loss.occupancy + loss.semantic)


def test_semantic_loss_survives_an_all_air_occupancy_prediction() -> None:
    targets = torch.zeros((1, *PATCH_SHAPE), dtype=torch.long)
    targets[0, 0, 0, 0] = 4
    mask = torch.zeros_like(targets, dtype=torch.bool)
    mask[0, 0, 0, 0] = True
    occupancy_logits = torch.zeros((1, 2, *PATCH_SHAPE))
    occupancy_logits[:, 0] = 10.0
    semantic_logits = torch.zeros((1, 8, *PATCH_SHAPE))
    output = VoxelModelOutput(occupancy_logits, semantic_logits)

    loss = voxel_loss(output, targets, mask)
    predictions = predict_tokens(output)

    assert float(loss.semantic) > 0.0
    assert torch.all(predictions == 0)


def test_prediction_uses_semantics_only_where_occupancy_selects_non_air() -> None:
    occupancy_logits = torch.zeros((1, 2, *PATCH_SHAPE))
    occupancy_logits[:, 0] = 1.0
    occupancy_logits[0, 1, 0, 0, 0] = 3.0
    semantic_logits = torch.zeros((1, 8, *PATCH_SHAPE))
    semantic_logits[0, 5, 0, 0, 0] = 4.0

    predictions = predict_tokens(
        VoxelModelOutput(occupancy_logits, semantic_logits)
    )

    assert predictions.dtype == torch.long
    assert predictions.shape == (1, *PATCH_SHAPE)
    assert predictions[0, 0, 0, 0].item() == 6
    assert torch.count_nonzero(predictions).item() == 1


def test_loss_requires_masked_non_air_semantic_supervision() -> None:
    targets = torch.zeros((1, *PATCH_SHAPE), dtype=torch.long)
    mask = torch.zeros_like(targets, dtype=torch.bool)
    mask[0, 0, 0, 0] = True
    output = VoxelModelOutput(
        torch.zeros((1, 2, *PATCH_SHAPE)),
        torch.zeros((1, 8, *PATCH_SHAPE)),
    )

    with pytest.raises(
        TrainingError,
        match="SEMANTIC_SUPERVISION_EMPTY",
    ) as captured:
        voxel_loss(output, targets, mask)
    assert captured.value.code == "SEMANTIC_SUPERVISION_EMPTY"


def test_semantic_weights_change_only_the_semantic_objective() -> None:
    output, targets, mask = _weighted_loss_case()

    unweighted = voxel_loss(output, targets, mask)
    unit_weighted = voxel_loss(
        output,
        targets,
        mask,
        semantic_class_weights=torch.ones(8),
    )
    weights = torch.ones(8)
    weights[4] = 4.0
    rare_weighted = voxel_loss(
        output,
        targets,
        mask,
        semantic_class_weights=weights,
    )

    assert torch.equal(unweighted.occupancy, rare_weighted.occupancy)
    assert torch.allclose(unweighted.semantic, unit_weighted.semantic)
    assert rare_weighted.semantic > unweighted.semantic
    assert torch.allclose(
        rare_weighted.total,
        rare_weighted.occupancy + rare_weighted.semantic,
    )


@pytest.mark.parametrize(
    "weights",
    (
        "not-a-tensor",
        torch.ones(7),
        torch.ones(8, dtype=torch.float64),
        torch.tensor(
            [1.0, 1.0, 1.0, 1.0, float("nan"), 1.0, 1.0, 1.0]
        ),
        torch.tensor(
            [1.0, 1.0, 1.0, 1.0, float("inf"), 1.0, 1.0, 1.0]
        ),
        torch.tensor(
            [1.0, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0, 1.0]
        ),
    ),
)
def test_semantic_loss_rejects_invalid_class_weights(
    weights: object,
) -> None:
    output, targets, mask = _weighted_loss_case()

    with pytest.raises(
        TrainingError,
        match="SEMANTIC_CLASS_WEIGHTS_INVALID",
    ):
        voxel_loss(
            output,
            targets,
            mask,
            semantic_class_weights=weights,
        )


def test_semantic_loss_rejects_class_weights_on_another_device() -> None:
    output, targets, mask = _weighted_loss_case()

    with pytest.raises(
        TrainingError,
        match="SEMANTIC_CLASS_WEIGHTS_INVALID",
    ):
        voxel_loss(
            output,
            targets,
            mask,
            semantic_class_weights=torch.ones(8, device="meta"),
        )


def test_model_and_loss_reject_invalid_tensors() -> None:
    model = TinyVoxelCompletionModel()
    with pytest.raises(TrainingError, match="MODEL_INPUT_INVALID"):
        model(torch.zeros((1, *PATCH_SHAPE), dtype=torch.float32))

    targets = torch.zeros((1, *PATCH_SHAPE), dtype=torch.long)
    targets[0, 0, 0, 0] = 1
    mask = torch.zeros_like(targets, dtype=torch.bool)
    mask[0, 0, 0, 0] = True
    output = VoxelModelOutput(
        torch.full((1, 2, *PATCH_SHAPE), float("nan")),
        torch.zeros((1, 8, *PATCH_SHAPE)),
    )
    with pytest.raises(TrainingError, match="LOSS_NONFINITE"):
        voxel_loss(output, targets, mask)


def _weighted_loss_case() -> tuple[
    VoxelModelOutput,
    torch.Tensor,
    torch.Tensor,
]:
    targets = torch.zeros((1, *PATCH_SHAPE), dtype=torch.long)
    targets[0, 0, 0, 0] = 5
    targets[0, 0, 0, 1] = 2
    mask = torch.zeros_like(targets, dtype=torch.bool)
    mask[0, 0, 0, 0] = True
    mask[0, 0, 0, 1] = True
    occupancy_logits = torch.zeros((1, 2, *PATCH_SHAPE))
    semantic_logits = torch.zeros((1, 8, *PATCH_SHAPE))
    semantic_logits[0, 4, 0, 0, 0] = -4.0
    semantic_logits[0, 1, 0, 0, 1] = 4.0
    return (
        VoxelModelOutput(occupancy_logits, semantic_logits),
        targets,
        mask,
    )
