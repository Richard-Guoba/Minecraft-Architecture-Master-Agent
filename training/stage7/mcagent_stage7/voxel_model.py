from __future__ import annotations

from dataclasses import dataclass

import torch
import torch.nn.functional as F
from torch import nn

from .training_data import MASK_TOKEN, PATCH_SHAPE, TOKEN_COUNT, TrainingError


MODEL_VERSION = "tiny-voxel-completion-v1"


@dataclass(frozen=True)
class VoxelModelOutput:
    occupancy_logits: torch.Tensor
    semantic_logits: torch.Tensor


@dataclass(frozen=True)
class VoxelLoss:
    total: torch.Tensor
    occupancy: torch.Tensor
    semantic: torch.Tensor


class TinyVoxelCompletionModel(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.embedding = nn.Embedding(10, 8)
        self.encoder = nn.Sequential(
            nn.Conv3d(8, 16, 3, stride=2, padding=1),
            nn.SiLU(),
            nn.Conv3d(16, 24, 3, stride=2, padding=1),
            nn.SiLU(),
        )
        self.decoder = nn.Sequential(
            nn.ConvTranspose3d(24, 16, 4, stride=2, padding=1),
            nn.SiLU(),
            nn.ConvTranspose3d(16, 12, 4, stride=2, padding=1),
            nn.SiLU(),
        )
        self.occupancy_head = nn.Conv3d(12, 2, 1)
        self.semantic_head = nn.Conv3d(12, 8, 1)

    def forward(self, visible: torch.Tensor) -> VoxelModelOutput:
        _validate_visible(visible)
        features = self.embedding(visible).permute(0, 4, 1, 2, 3)
        decoded = self.decoder(self.encoder(features))
        return VoxelModelOutput(
            occupancy_logits=self.occupancy_head(decoded),
            semantic_logits=self.semantic_head(decoded),
        )


def voxel_loss(
    output: VoxelModelOutput,
    targets: torch.Tensor,
    mask: torch.Tensor,
) -> VoxelLoss:
    _validate_loss_inputs(output, targets, mask)
    selected = mask
    occupancy_targets = (targets != 0).long()
    occupancy = F.cross_entropy(
        output.occupancy_logits.permute(0, 2, 3, 4, 1)[selected],
        occupancy_targets[selected],
    )
    semantic_selected = selected & (targets != 0)
    if not bool(semantic_selected.any()):
        raise TrainingError("SEMANTIC_SUPERVISION_EMPTY", "mask")
    semantic = F.cross_entropy(
        output.semantic_logits.permute(0, 2, 3, 4, 1)[semantic_selected],
        targets[semantic_selected] - 1,
    )
    total = occupancy + semantic
    if not all(
        bool(torch.isfinite(component))
        for component in (total, occupancy, semantic)
    ):
        raise TrainingError("LOSS_NONFINITE", "voxel loss")
    return VoxelLoss(
        total=total,
        occupancy=occupancy,
        semantic=semantic,
    )


def predict_tokens(output: VoxelModelOutput) -> torch.Tensor:
    batch_size = _validate_output(output)
    if (
        not bool(torch.isfinite(output.occupancy_logits).all())
        or not bool(torch.isfinite(output.semantic_logits).all())
    ):
        raise TrainingError("MODEL_OUTPUT_NONFINITE", "logits")
    occupancy = output.occupancy_logits.argmax(dim=1)
    semantics = output.semantic_logits.argmax(dim=1) + 1
    predictions = torch.where(
        occupancy == 0,
        torch.zeros_like(semantics),
        semantics,
    )
    expected = (batch_size, *PATCH_SHAPE)
    if tuple(predictions.shape) != expected:
        raise TrainingError("MODEL_OUTPUT_INVALID", "prediction shape")
    return predictions.long()


def _validate_visible(visible: torch.Tensor) -> None:
    if (
        not isinstance(visible, torch.Tensor)
        or visible.dtype != torch.long
        or visible.ndim != 4
        or visible.shape[0] <= 0
        or tuple(visible.shape[1:]) != PATCH_SHAPE
    ):
        raise TrainingError("MODEL_INPUT_INVALID", "shape or dtype")
    if int(visible.min()) < 0 or int(visible.max()) > MASK_TOKEN:
        raise TrainingError("MODEL_INPUT_INVALID", "token range")


def _validate_loss_inputs(
    output: VoxelModelOutput,
    targets: torch.Tensor,
    mask: torch.Tensor,
) -> None:
    batch_size = _validate_output(output)
    expected = (batch_size, *PATCH_SHAPE)
    if (
        not isinstance(targets, torch.Tensor)
        or targets.dtype != torch.long
        or tuple(targets.shape) != expected
        or int(targets.min()) < 0
        or int(targets.max()) >= TOKEN_COUNT
    ):
        raise TrainingError("LOSS_TARGET_INVALID", "shape, dtype, or range")
    if (
        not isinstance(mask, torch.Tensor)
        or mask.dtype != torch.bool
        or tuple(mask.shape) != expected
        or not bool(mask.any())
    ):
        raise TrainingError("LOSS_MASK_INVALID", "shape, dtype, or empty")
    if (
        output.occupancy_logits.device != targets.device
        or output.semantic_logits.device != targets.device
        or mask.device != targets.device
    ):
        raise TrainingError("LOSS_DEVICE_MISMATCH", "output, target, or mask")


def _validate_output(output: VoxelModelOutput) -> int:
    if not isinstance(output, VoxelModelOutput):
        raise TrainingError("MODEL_OUTPUT_INVALID", "type")
    occupancy = output.occupancy_logits
    semantic = output.semantic_logits
    if (
        not isinstance(occupancy, torch.Tensor)
        or not isinstance(semantic, torch.Tensor)
        or occupancy.ndim != 5
        or semantic.ndim != 5
        or occupancy.shape[0] <= 0
        or tuple(occupancy.shape[1:]) != (2, *PATCH_SHAPE)
        or tuple(semantic.shape) != (
            occupancy.shape[0],
            8,
            *PATCH_SHAPE,
        )
        or not occupancy.is_floating_point()
        or not semantic.is_floating_point()
    ):
        raise TrainingError("MODEL_OUTPUT_INVALID", "shape or dtype")
    return int(occupancy.shape[0])
