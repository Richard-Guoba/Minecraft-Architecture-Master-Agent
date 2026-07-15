from __future__ import annotations

import torch
import torch.nn.functional as functional
from torch import nn


PRIVATE_TOKEN_COUNT = 9
PRIVATE_SHAPE = (64, 64, 64)
MASK_TOKEN = PRIVATE_TOKEN_COUNT


class TinyMaskedVoxelAutoencoder(nn.Module):
    def __init__(self, token_count: int = PRIVATE_TOKEN_COUNT) -> None:
        super().__init__()
        if token_count != PRIVATE_TOKEN_COUNT:
            raise ValueError("private token count must be 9")
        self.token_count = token_count
        self.embedding = nn.Embedding(token_count + 1, 8)
        self.encoder = nn.Sequential(
            nn.Conv3d(8, 12, 3, stride=2, padding=1), nn.SiLU(),
            nn.Conv3d(12, 16, 3, stride=2, padding=1), nn.SiLU(),
        )
        self.decoder = nn.Sequential(
            nn.ConvTranspose3d(16, 12, 4, stride=2, padding=1), nn.SiLU(),
            nn.ConvTranspose3d(12, 8, 4, stride=2, padding=1), nn.SiLU(),
        )
        self.head = nn.Conv3d(8, token_count, 1)

    def forward(self, visible: torch.Tensor) -> torch.Tensor:
        _validate_visible(visible)
        features = self.embedding(visible).permute(0, 4, 1, 2, 3)
        return self.head(self.decoder(self.encoder(features)))


def masked_reconstruction_loss(logits: torch.Tensor, targets: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    _validate_visible(targets, max_token=PRIVATE_TOKEN_COUNT - 1)
    if logits.shape != (targets.shape[0], PRIVATE_TOKEN_COUNT, *PRIVATE_SHAPE):
        raise ValueError("logits must have shape [batch, 9, 64, 64, 64]")
    if mask.shape != targets.shape or mask.dtype != torch.bool:
        raise ValueError("mask must be a boolean tensor matching targets")
    if not bool(mask.any()):
        raise ValueError("mask must be non-empty")
    loss = functional.cross_entropy(logits.permute(0, 2, 3, 4, 1)[mask], targets[mask])
    if not bool(torch.isfinite(loss)):
        raise ValueError("masked reconstruction loss must be finite")
    return loss


def _validate_visible(visible: torch.Tensor, max_token: int = MASK_TOKEN) -> None:
    if not isinstance(visible, torch.Tensor) or visible.dtype != torch.long:
        raise ValueError("visible tokens must be a torch.long tensor")
    if visible.ndim != 4 or tuple(visible.shape[1:]) != PRIVATE_SHAPE:
        raise ValueError("visible tokens must have shape [batch, 64, 64, 64]")
    if visible.shape[0] <= 0 or int(visible.min()) < 0 or int(visible.max()) > max_token:
        raise ValueError("visible token values are out of range")
