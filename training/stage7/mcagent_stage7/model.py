from __future__ import annotations

from dataclasses import dataclass

import torch
import torch.nn.functional as F
from torch import nn

from .contracts import ENVELOPE_VALUES, RESOLUTION, SITE_VALUES, SPACE_VALUES
from .tensors import PlanTargets


_CONDITION_SIZE = 64
_LATENT_SIZE = 16
_COARSE_SIZE = 16
_CONDITION_EMBEDDING_SIZE = 32
_ENCODED_CHANNELS = 32
_ENCODED_SIZE = 4
_LOGVAR_MIN = -12.0
_LOGVAR_MAX = 12.0
_LAYER_CLASSES = {
    "envelope": len(ENVELOPE_VALUES),
    "space": len(SPACE_VALUES),
    "site": len(SITE_VALUES),
}


@dataclass(frozen=True)
class ModelOutput:
    envelope_logits: torch.Tensor
    space_logits: torch.Tensor
    site_logits: torch.Tensor
    posterior_mu: torch.Tensor
    posterior_logvar: torch.Tensor
    prior_mu: torch.Tensor
    prior_logvar: torch.Tensor


@dataclass(frozen=True)
class LossOutput:
    total: torch.Tensor
    envelope: torch.Tensor
    space: torch.Tensor
    site: torch.Tensor
    dice: torch.Tensor
    kl: torch.Tensor


class TinyConditionalVAE(nn.Module):
    def __init__(
        self,
        condition_size: int = _CONDITION_SIZE,
        latent_size: int = _LATENT_SIZE,
        coarse_size: int = _COARSE_SIZE,
    ) -> None:
        super().__init__()
        if condition_size != _CONDITION_SIZE:
            raise ValueError("condition_size must be 64 for the fixed M3 topology")
        if latent_size != _LATENT_SIZE:
            raise ValueError("latent_size must be 16 for the fixed M3 topology")
        if coarse_size != _COARSE_SIZE:
            raise ValueError("coarse_size must be 16 for the fixed M3 topology")

        self.condition_size = condition_size
        self.latent_size = latent_size
        self.coarse_size = coarse_size

        self.target_encoder = nn.Sequential(
            nn.Conv3d(19, 16, 3, stride=2, padding=1),
            nn.SiLU(),
            nn.Conv3d(16, 32, 3, stride=2, padding=1),
            nn.SiLU(),
        )
        self.condition_projection = nn.Sequential(
            nn.Linear(condition_size, _CONDITION_EMBEDDING_SIZE),
            nn.SiLU(),
        )
        self.prior_mu = nn.Linear(_CONDITION_EMBEDDING_SIZE, latent_size)
        self.prior_logvar = nn.Linear(_CONDITION_EMBEDDING_SIZE, latent_size)

        encoded_features = _ENCODED_CHANNELS * _ENCODED_SIZE**3
        posterior_features = encoded_features + _CONDITION_EMBEDDING_SIZE
        self.posterior_mu = nn.Linear(posterior_features, latent_size)
        self.posterior_logvar = nn.Linear(posterior_features, latent_size)

        self.decoder_projection = nn.Linear(
            latent_size + _CONDITION_EMBEDDING_SIZE,
            encoded_features,
        )
        self.decoder = nn.Sequential(
            nn.ConvTranspose3d(32, 16, 4, stride=2, padding=1),
            nn.SiLU(),
            nn.ConvTranspose3d(16, 16, 4, stride=2, padding=1),
            nn.SiLU(),
        )
        self.envelope_head = nn.Conv3d(16, len(ENVELOPE_VALUES), 1)
        self.space_head = nn.Conv3d(16, len(SPACE_VALUES), 1)
        self.site_head = nn.Conv3d(16, len(SITE_VALUES), 1)

    def forward(self, conditions: torch.Tensor, targets: PlanTargets) -> ModelOutput:
        _validate_conditions(conditions, self.condition_size, _module_device(self))
        _validate_targets(targets, conditions.shape[0], conditions.device)

        condition_embedding = self.condition_projection(conditions)
        prior_mu = self.prior_mu(condition_embedding)
        prior_logvar = self.prior_logvar(condition_embedding).clamp(
            _LOGVAR_MIN,
            _LOGVAR_MAX,
        )

        coarse_targets = _one_hot_coarse_targets(targets, conditions.dtype, self.coarse_size)
        encoded_targets = self.target_encoder(coarse_targets).flatten(start_dim=1)
        posterior_input = torch.cat((encoded_targets, condition_embedding), dim=1)
        posterior_mu = self.posterior_mu(posterior_input)
        posterior_logvar = self.posterior_logvar(posterior_input).clamp(
            _LOGVAR_MIN,
            _LOGVAR_MAX,
        )
        latent = posterior_mu + torch.exp(0.5 * posterior_logvar) * torch.randn_like(
            posterior_mu
        )
        envelope_logits, space_logits, site_logits = self._decode(
            latent,
            condition_embedding,
        )
        return ModelOutput(
            envelope_logits=envelope_logits,
            space_logits=space_logits,
            site_logits=site_logits,
            posterior_mu=posterior_mu,
            posterior_logvar=posterior_logvar,
            prior_mu=prior_mu,
            prior_logvar=prior_logvar,
        )

    @torch.no_grad()
    def predict(self, conditions: torch.Tensor) -> PlanTargets:
        _validate_conditions(conditions, self.condition_size, _module_device(self))
        condition_embedding = self.condition_projection(conditions)
        prior_mu = self.prior_mu(condition_embedding)
        logits = self._decode(prior_mu, condition_embedding)
        predictions = [
            F.interpolate(
                layer_logits.argmax(dim=1, keepdim=True).to(dtype=torch.float32),
                size=RESOLUTION,
                mode="nearest",
            )
            .squeeze(1)
            .to(dtype=torch.long)
            for layer_logits in logits
        ]
        return PlanTargets(
            envelope=predictions[0],
            space=predictions[1],
            site=predictions[2],
        )

    def _decode(
        self,
        latent: torch.Tensor,
        condition_embedding: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        decoded = self.decoder_projection(
            torch.cat((latent, condition_embedding), dim=1)
        ).reshape(-1, _ENCODED_CHANNELS, _ENCODED_SIZE, _ENCODED_SIZE, _ENCODED_SIZE)
        decoded = self.decoder(decoded)
        return (
            self.envelope_head(decoded),
            self.space_head(decoded),
            self.site_head(decoded),
        )


def model_loss(output: ModelOutput, targets: PlanTargets) -> LossOutput:
    batch_size, device, dtype = _validate_model_output(output)
    _validate_targets(targets, batch_size, device)
    coarse_targets = _coarse_label_targets(targets, dtype)

    envelope = F.cross_entropy(output.envelope_logits, coarse_targets["envelope"])
    space = F.cross_entropy(output.space_logits, coarse_targets["space"])
    site = F.cross_entropy(output.site_logits, coarse_targets["site"])

    occupancy_probabilities = []
    occupancy_targets = []
    for layer in _LAYER_CLASSES:
        logits = getattr(output, f"{layer}_logits")
        occupancy_probabilities.append(1.0 - logits.softmax(dim=1)[:, 0])
        occupancy_targets.append((coarse_targets[layer] != 0).to(dtype=dtype))
    occupancy_probability = torch.stack(occupancy_probabilities, dim=1)
    occupancy_target = torch.stack(occupancy_targets, dim=1)
    smooth = torch.finfo(dtype).eps
    intersection = (occupancy_probability * occupancy_target).sum()
    dice = 1.0 - (2.0 * intersection + smooth) / (
        occupancy_probability.sum() + occupancy_target.sum() + smooth
    )

    posterior_variance_ratio = torch.exp(
        output.posterior_logvar - output.prior_logvar
    )
    posterior_mean_delta = (
        (output.posterior_mu - output.prior_mu).square()
        * torch.exp(-output.prior_logvar)
    )
    kl = 0.5 * (
        output.prior_logvar
        - output.posterior_logvar
        + posterior_variance_ratio
        + posterior_mean_delta
        - 1.0
    ).mean()

    components = {
        "envelope": envelope,
        "space": space,
        "site": site,
        "dice": dice,
        "kl": kl,
    }
    for name, component in components.items():
        if not bool(torch.isfinite(component)):
            raise ValueError(f"model loss component {name} must be finite")
    total = envelope + space + site + 0.25 * dice + 0.001 * kl
    if not bool(torch.isfinite(total)):
        raise ValueError("model loss total must be finite")
    return LossOutput(
        total=total,
        envelope=envelope,
        space=space,
        site=site,
        dice=dice,
        kl=kl,
    )


def _module_device(module: nn.Module) -> torch.device:
    return next(module.parameters()).device


def _validate_conditions(
    conditions: torch.Tensor,
    condition_size: int,
    model_device: torch.device,
) -> None:
    if not isinstance(conditions, torch.Tensor):
        raise ValueError("condition input must be a torch.Tensor")
    if conditions.ndim != 2:
        raise ValueError("condition input must have 2 dimensions: [batch, 64]")
    if conditions.shape[0] <= 0:
        raise ValueError("condition batch size must be positive")
    if conditions.shape[1] != condition_size:
        raise ValueError(f"condition feature dimension must be {condition_size}")
    if conditions.dtype != torch.float32:
        raise ValueError("condition dtype must be torch.float32")
    if conditions.device != model_device:
        raise ValueError(
            f"condition device {conditions.device} must match model device {model_device}"
        )
    if not bool(torch.isfinite(conditions).all()):
        raise ValueError("condition values must all be finite")


def _validate_targets(
    targets: PlanTargets,
    batch_size: int,
    device: torch.device,
) -> None:
    if not isinstance(targets, PlanTargets):
        raise ValueError("targets must be PlanTargets")
    for layer, classes in _LAYER_CLASSES.items():
        target = getattr(targets, layer)
        if not isinstance(target, torch.Tensor):
            raise ValueError(f"target {layer} must be a torch.Tensor")
        if target.ndim != 4:
            raise ValueError(
                f"target {layer} must have 4 dimensions: [batch, 64, 64, 64]"
            )
        if tuple(target.shape[1:]) != RESOLUTION:
            raise ValueError(f"target {layer} shape must be batch x 64 x 64 x 64")
        if target.dtype != torch.long:
            raise ValueError(f"target {layer} dtype must be torch.long")
        if target.shape[0] != batch_size:
            raise ValueError(
                f"target {layer} batch must match condition batch {batch_size}"
            )
        if target.device != device:
            raise ValueError(
                f"target {layer} device {target.device} must match condition device {device}"
            )
        minimum = int(target.min())
        maximum = int(target.max())
        if minimum < 0 or maximum >= classes:
            raise ValueError(
                f"target {layer} values must be in the range 0..{classes - 1}"
            )


def _one_hot_coarse_targets(
    targets: PlanTargets,
    dtype: torch.dtype,
    coarse_size: int,
) -> torch.Tensor:
    one_hot_layers = [
        F.one_hot(getattr(targets, layer), num_classes=classes)
        .permute(0, 4, 1, 2, 3)
        .to(dtype=dtype)
        for layer, classes in _LAYER_CLASSES.items()
    ]
    return F.interpolate(
        torch.cat(one_hot_layers, dim=1),
        size=(coarse_size, coarse_size, coarse_size),
        mode="nearest",
    )


def _coarse_label_targets(
    targets: PlanTargets,
    dtype: torch.dtype,
) -> dict[str, torch.Tensor]:
    return {
        layer: F.interpolate(
            getattr(targets, layer).unsqueeze(1).to(dtype=dtype),
            size=(_COARSE_SIZE, _COARSE_SIZE, _COARSE_SIZE),
            mode="nearest",
        )
        .squeeze(1)
        .to(dtype=torch.long)
        for layer in _LAYER_CLASSES
    }


def _validate_model_output(
    output: ModelOutput,
) -> tuple[int, torch.device, torch.dtype]:
    if not isinstance(output, ModelOutput):
        raise ValueError("output must be ModelOutput")
    tensor_names = (
        "envelope_logits",
        "space_logits",
        "site_logits",
        "posterior_mu",
        "posterior_logvar",
        "prior_mu",
        "prior_logvar",
    )
    for name in tensor_names:
        if not isinstance(getattr(output, name), torch.Tensor):
            raise ValueError(f"model output {name} must be a torch.Tensor")

    batch_size = output.envelope_logits.shape[0]
    if batch_size <= 0:
        raise ValueError("model output batch size must be positive")
    device = output.envelope_logits.device
    dtype = output.envelope_logits.dtype
    if not dtype.is_floating_point:
        raise ValueError("model output logits dtype must be floating point")

    for layer, classes in _LAYER_CLASSES.items():
        name = f"{layer}_logits"
        logits = getattr(output, name)
        expected = (batch_size, classes, _COARSE_SIZE, _COARSE_SIZE, _COARSE_SIZE)
        if tuple(logits.shape) != expected:
            raise ValueError(f"model output {name} shape must be {expected}")
        _validate_output_tensor(name, logits, device, dtype)

    for name in ("posterior_mu", "posterior_logvar", "prior_mu", "prior_logvar"):
        value = getattr(output, name)
        if tuple(value.shape) != (batch_size, _LATENT_SIZE):
            raise ValueError(
                f"model output {name} shape must be ({batch_size}, {_LATENT_SIZE})"
            )
        _validate_output_tensor(name, value, device, dtype)
    for name in ("posterior_logvar", "prior_logvar"):
        value = getattr(output, name)
        if bool((value < _LOGVAR_MIN).any()) or bool((value > _LOGVAR_MAX).any()):
            raise ValueError(f"model output {name} must be clamped to [-12, 12]")
    return batch_size, device, dtype


def _validate_output_tensor(
    name: str,
    value: torch.Tensor,
    device: torch.device,
    dtype: torch.dtype,
) -> None:
    if value.device != device:
        raise ValueError(f"model output {name} device must match logits device {device}")
    if value.dtype != dtype:
        raise ValueError(f"model output {name} dtype must match logits dtype {dtype}")
    if not bool(torch.isfinite(value).all()):
        raise ValueError(f"model output {name} values must be finite")
