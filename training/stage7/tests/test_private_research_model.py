from __future__ import annotations

import pytest
import torch

from mcagent_stage7.private_research_model import (
    TinyMaskedVoxelAutoencoder,
    masked_reconstruction_loss,
)


def test_masked_voxel_autoencoder_returns_logits_for_every_private_token() -> None:
    model = TinyMaskedVoxelAutoencoder()
    visible = torch.zeros((1, 64, 64, 64), dtype=torch.long)

    logits = model(visible)

    assert logits.shape == (1, 9, 64, 64, 64)
    assert torch.isfinite(logits).all()


def test_masked_reconstruction_loss_requires_a_nonempty_mask() -> None:
    logits = torch.zeros((1, 9, 64, 64, 64), dtype=torch.float32)
    targets = torch.zeros((1, 64, 64, 64), dtype=torch.long)
    mask = torch.zeros((1, 64, 64, 64), dtype=torch.bool)

    with pytest.raises(ValueError, match="non-empty"):
        masked_reconstruction_loss(logits, targets, mask)
