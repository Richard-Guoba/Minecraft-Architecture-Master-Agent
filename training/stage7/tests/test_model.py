import json
from dataclasses import fields
from pathlib import Path

import pytest
import torch
import torch.nn.functional as F
from torch import nn

from mcagent_stage7.encoding import ConditionEncoder
from mcagent_stage7.model import LossOutput, ModelOutput, TinyConditionalVAE, model_loss
from mcagent_stage7.tensors import PlanTargets, plan_to_targets


FIXTURE_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "m3"
CANONICAL_SHAPE = (64, 64, 64)
COARSE_SHAPE = (16, 16, 16)


@pytest.fixture(scope="module")
def fixture_batch():
    condition = json.loads(
        (FIXTURE_ROOT / "cases/one-floor-house/condition.json").read_text("utf8")
    )
    plan = json.loads(
        (FIXTURE_ROOT / "cases/one-floor-house/plan.json").read_text("utf8")
    )
    targets = plan_to_targets(plan)
    return (
        ConditionEncoder(size=64).encode(condition).unsqueeze(0),
        PlanTargets(
            envelope=targets.envelope.unsqueeze(0),
            space=targets.space.unsqueeze(0),
            site=targets.site.unsqueeze(0),
        ),
    )


def _new_model() -> TinyConditionalVAE:
    return TinyConditionalVAE(condition_size=64, latent_size=16, coarse_size=16).cpu()


def _replace_target(targets: PlanTargets, layer: str, value: torch.Tensor) -> PlanTargets:
    return PlanTargets(
        envelope=value if layer == "envelope" else targets.envelope,
        space=value if layer == "space" else targets.space,
        site=value if layer == "site" else targets.site,
    )


def test_model_and_loss_outputs_expose_the_exact_public_components():
    assert [field.name for field in fields(ModelOutput)] == [
        "envelope_logits",
        "space_logits",
        "site_logits",
        "posterior_mu",
        "posterior_logvar",
        "prior_mu",
        "prior_logvar",
    ]
    assert [field.name for field in fields(LossOutput)] == [
        "total",
        "envelope",
        "space",
        "site",
        "dice",
        "kl",
    ]


def test_tiny_cvae_uses_the_exact_requested_topology():
    model = _new_model()

    target_layers = list(model.target_encoder)
    assert isinstance(target_layers[0], nn.Conv3d)
    assert (target_layers[0].in_channels, target_layers[0].out_channels) == (19, 16)
    assert target_layers[0].kernel_size == (3, 3, 3)
    assert target_layers[0].stride == (2, 2, 2)
    assert target_layers[0].padding == (1, 1, 1)
    assert isinstance(target_layers[1], nn.SiLU)
    assert isinstance(target_layers[2], nn.Conv3d)
    assert (target_layers[2].in_channels, target_layers[2].out_channels) == (16, 32)
    assert target_layers[2].kernel_size == (3, 3, 3)
    assert target_layers[2].stride == (2, 2, 2)
    assert target_layers[2].padding == (1, 1, 1)
    assert isinstance(target_layers[3], nn.SiLU)

    condition_layers = list(model.condition_projection)
    assert isinstance(condition_layers[0], nn.Linear)
    assert (condition_layers[0].in_features, condition_layers[0].out_features) == (64, 32)
    assert isinstance(condition_layers[1], nn.SiLU)
    assert (model.prior_mu.in_features, model.prior_mu.out_features) == (32, 16)
    assert (model.prior_logvar.in_features, model.prior_logvar.out_features) == (32, 16)
    assert (model.posterior_mu.in_features, model.posterior_mu.out_features) == (2080, 16)
    assert (model.posterior_logvar.in_features, model.posterior_logvar.out_features) == (2080, 16)
    assert (model.decoder_projection.in_features, model.decoder_projection.out_features) == (
        48,
        32 * 4 * 4 * 4,
    )

    decoder_layers = list(model.decoder)
    assert isinstance(decoder_layers[0], nn.ConvTranspose3d)
    assert (decoder_layers[0].in_channels, decoder_layers[0].out_channels) == (32, 16)
    assert decoder_layers[0].kernel_size == (4, 4, 4)
    assert decoder_layers[0].stride == (2, 2, 2)
    assert decoder_layers[0].padding == (1, 1, 1)
    assert isinstance(decoder_layers[1], nn.SiLU)
    assert isinstance(decoder_layers[2], nn.ConvTranspose3d)
    assert (decoder_layers[2].in_channels, decoder_layers[2].out_channels) == (16, 16)
    assert decoder_layers[2].kernel_size == (4, 4, 4)
    assert decoder_layers[2].stride == (2, 2, 2)
    assert decoder_layers[2].padding == (1, 1, 1)
    assert isinstance(decoder_layers[3], nn.SiLU)
    assert (model.envelope_head.in_channels, model.envelope_head.out_channels) == (16, 6)
    assert (model.space_head.in_channels, model.space_head.out_channels) == (16, 7)
    assert (model.site_head.in_channels, model.site_head.out_channels) == (16, 6)
    assert model.envelope_head.kernel_size == (1, 1, 1)
    assert model.space_head.kernel_size == (1, 1, 1)
    assert model.site_head.kernel_size == (1, 1, 1)


@pytest.mark.parametrize(
    ("arguments", "message"),
    [
        ({"condition_size": 63, "latent_size": 16, "coarse_size": 16}, "condition_size.*64"),
        ({"condition_size": 64, "latent_size": 15, "coarse_size": 16}, "latent_size.*16"),
        ({"condition_size": 64, "latent_size": 16, "coarse_size": 8}, "coarse_size.*16"),
    ],
)
def test_tiny_cvae_rejects_dimensions_that_change_the_fixed_topology(arguments, message):
    with pytest.raises(ValueError, match=message):
        TinyConditionalVAE(**arguments)


def test_target_encoder_receives_19_nearest_downsampled_one_hot_channels():
    conditions = torch.zeros((1, 64), dtype=torch.float32)
    envelope = torch.zeros((1, *CANONICAL_SHAPE), dtype=torch.long)
    space = torch.zeros((1, *CANONICAL_SHAPE), dtype=torch.long)
    site = torch.zeros((1, *CANONICAL_SHAPE), dtype=torch.long)
    envelope[0, 0, 0, 0] = 5
    space[0, 0, 0, 0] = 2
    site[0, 0, 0, 0] = 4
    targets = PlanTargets(envelope=envelope, space=space, site=site)
    captured = []
    model = _new_model()
    handle = model.target_encoder[0].register_forward_pre_hook(
        lambda _module, arguments: captured.append(arguments[0].detach().clone())
    )
    try:
        model(conditions, targets)
    finally:
        handle.remove()

    encoded = captured[0]
    assert encoded.shape == (1, 19, *COARSE_SHAPE)
    assert encoded.dtype == torch.float32
    assert torch.equal(encoded.sum(dim=1), torch.full((1, *COARSE_SHAPE), 3.0))
    assert encoded[0, 5, 0, 0, 0] == 1
    assert encoded[0, 6 + 2, 0, 0, 0] == 1
    assert encoded[0, 6 + 7 + 4, 0, 0, 0] == 1


def test_tiny_cvae_has_three_heads_and_updates_parameters_on_cpu(fixture_batch):
    conditions, targets = fixture_batch
    torch.manual_seed(7101)
    model = _new_model()
    before = {name: value.detach().clone() for name, value in model.named_parameters()}
    output = model(conditions, targets)

    assert output.envelope_logits.shape == (1, 6, *COARSE_SHAPE)
    assert output.space_logits.shape == (1, 7, *COARSE_SHAPE)
    assert output.site_logits.shape == (1, 6, *COARSE_SHAPE)
    loss = model_loss(output, targets)
    assert torch.isfinite(loss.total)

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    optimizer.zero_grad(set_to_none=True)
    loss.total.backward()
    assert all(
        parameter.grad is None or torch.isfinite(parameter.grad).all()
        for parameter in model.parameters()
    )
    optimizer.step()
    assert any(
        not torch.equal(before[name], value)
        for name, value in model.named_parameters()
    )


def test_training_forward_reparameterizes_the_conditional_posterior(monkeypatch, fixture_batch):
    conditions, targets = fixture_batch
    model = _new_model().train()
    decoder_inputs = []
    handle = model.decoder_projection.register_forward_pre_hook(
        lambda _module, arguments: decoder_inputs.append(arguments[0].detach().clone())
    )
    monkeypatch.setattr(torch, "randn_like", lambda value: torch.ones_like(value))
    try:
        output = model(conditions, targets)
    finally:
        handle.remove()

    expected_latent = output.posterior_mu + torch.exp(0.5 * output.posterior_logvar)
    assert torch.allclose(decoder_inputs[0][:, :16], expected_latent)


def test_prior_and_posterior_logvars_are_both_clamped(fixture_batch):
    conditions, targets = fixture_batch
    model = _new_model()
    with torch.no_grad():
        model.prior_logvar.weight.zero_()
        model.prior_logvar.bias.fill_(100)
        model.posterior_logvar.weight.zero_()
        model.posterior_logvar.bias.fill_(-100)

    output = model(conditions, targets)

    assert torch.equal(output.prior_logvar, torch.full_like(output.prior_logvar, 12))
    assert torch.equal(output.posterior_logvar, torch.full_like(output.posterior_logvar, -12))


def test_predict_uses_prior_mean_and_returns_canonical_long_indices(monkeypatch, fixture_batch):
    conditions, _targets = fixture_batch
    model = _new_model().eval()
    decoder_inputs = []
    handle = model.decoder_projection.register_forward_pre_hook(
        lambda _module, arguments: decoder_inputs.append(arguments[0].detach().clone())
    )

    def reject_sampling(_value):
        raise AssertionError("predict must not sample a latent")

    monkeypatch.setattr(torch, "randn_like", reject_sampling)
    try:
        predictions = model.predict(conditions)
    finally:
        handle.remove()

    with torch.no_grad():
        expected_prior_mu = model.prior_mu(model.condition_projection(conditions))
    assert torch.equal(decoder_inputs[0][:, :16], expected_prior_mu)
    for layer, upper_bound in (("envelope", 6), ("space", 7), ("site", 6)):
        prediction = getattr(predictions, layer)
        assert prediction.shape == (1, *CANONICAL_SHAPE)
        assert prediction.dtype == torch.long
        assert prediction.device.type == "cpu"
        assert 0 <= int(prediction.min()) <= int(prediction.max()) < upper_bound


def test_identical_weights_and_inputs_produce_identical_predictions(fixture_batch):
    conditions, _targets = fixture_batch
    torch.manual_seed(7101)
    first = _new_model().eval()
    second = _new_model().eval()
    second.load_state_dict(first.state_dict())

    first_predictions = first.predict(conditions)
    torch.manual_seed(9999)
    second_predictions = second.predict(conditions)

    assert first_predictions.equal(second_predictions)


def test_mandatory_cpu_path_does_not_consult_cuda(monkeypatch, fixture_batch):
    conditions, targets = fixture_batch

    def reject_cuda(*_args, **_kwargs):
        raise AssertionError("mandatory CPU path consulted CUDA")

    monkeypatch.setattr(torch.cuda, "is_available", reject_cuda)
    monkeypatch.setattr(torch.cuda, "device_count", reject_cuda)
    monkeypatch.setattr(torch.cuda, "current_device", reject_cuda)
    model = _new_model()
    output = model(conditions, targets)
    loss = model_loss(output, targets)
    predictions = model.predict(conditions)

    assert output.envelope_logits.device.type == "cpu"
    assert loss.total.device.type == "cpu"
    assert predictions.envelope.device.type == "cpu"


@pytest.mark.parametrize(
    ("conditions", "message"),
    [
        (torch.zeros(64), "condition.*2 dimensions"),
        (torch.zeros((1, 63)), "condition.*64"),
        (torch.zeros((0, 64)), "condition batch.*positive"),
        (torch.zeros((1, 64), dtype=torch.float64), "condition dtype.*float32"),
        (torch.full((1, 64), float("nan")), "condition.*finite"),
        (torch.full((1, 64), float("inf")), "condition.*finite"),
    ],
)
def test_forward_rejects_invalid_condition_contracts(conditions, message, fixture_batch):
    _valid_conditions, targets = fixture_batch
    with pytest.raises(ValueError, match=message):
        _new_model()(conditions, targets)


@pytest.mark.parametrize(
    ("layer", "replacement", "message"),
    [
        ("envelope", torch.zeros((64, 64, 64), dtype=torch.long), "envelope.*4 dimensions"),
        ("space", torch.zeros((1, 64, 64, 63), dtype=torch.long), "space.*64 x 64 x 64"),
        ("site", torch.zeros((1, 64, 64, 64), dtype=torch.int32), "site dtype.*long"),
        ("envelope", torch.full((1, 64, 64, 64), -1, dtype=torch.long), "envelope values.*0.*5"),
        ("space", torch.full((1, 64, 64, 64), 7, dtype=torch.long), "space values.*0.*6"),
        ("site", torch.full((1, 64, 64, 64), 6, dtype=torch.long), "site values.*0.*5"),
        ("site", torch.zeros((2, 64, 64, 64), dtype=torch.long), "site batch.*condition batch"),
    ],
)
def test_forward_rejects_invalid_target_contracts(layer, replacement, message, fixture_batch):
    conditions, targets = fixture_batch
    invalid = _replace_target(targets, layer, replacement)
    with pytest.raises(ValueError, match=message):
        _new_model()(conditions, invalid)


def test_forward_rejects_target_device_mismatch_without_requiring_cuda(fixture_batch):
    conditions, targets = fixture_batch
    meta_site = torch.empty((1, *CANONICAL_SHAPE), dtype=torch.long, device="meta")
    invalid = _replace_target(targets, "site", meta_site)
    with pytest.raises(ValueError, match="site device.*condition device"):
        _new_model()(conditions, invalid)


def test_model_loss_returns_unweighted_components_and_exact_weighted_total(fixture_batch):
    conditions, targets = fixture_batch
    torch.manual_seed(7101)
    output = _new_model()(conditions, targets)
    loss = model_loss(output, targets)

    coarse_targets = {
        layer: F.interpolate(
            getattr(targets, layer).unsqueeze(1).float(),
            size=COARSE_SHAPE,
            mode="nearest",
        ).squeeze(1).long()
        for layer in ("envelope", "space", "site")
    }
    assert torch.allclose(
        loss.envelope,
        F.cross_entropy(output.envelope_logits, coarse_targets["envelope"]),
    )
    assert torch.allclose(loss.space, F.cross_entropy(output.space_logits, coarse_targets["space"]))
    assert torch.allclose(loss.site, F.cross_entropy(output.site_logits, coarse_targets["site"]))
    assert 0 <= float(loss.dice.detach()) <= 1
    assert float(loss.kl.detach()) >= 0
    assert torch.allclose(
        loss.total,
        loss.envelope + loss.space + loss.site + 0.25 * loss.dice + 0.001 * loss.kl,
    )


def test_model_loss_uses_conditional_gaussian_kl(fixture_batch):
    conditions, targets = fixture_batch
    output = _new_model()(conditions, targets)
    posterior_mu = torch.ones_like(output.posterior_mu)
    posterior_logvar = torch.zeros_like(output.posterior_logvar)
    prior_mu = torch.zeros_like(output.prior_mu)
    prior_logvar = torch.zeros_like(output.prior_logvar)
    controlled = ModelOutput(
        envelope_logits=output.envelope_logits,
        space_logits=output.space_logits,
        site_logits=output.site_logits,
        posterior_mu=posterior_mu,
        posterior_logvar=posterior_logvar,
        prior_mu=prior_mu,
        prior_logvar=prior_logvar,
    )

    loss = model_loss(controlled, targets)

    assert torch.allclose(loss.kl, torch.tensor(0.5, dtype=loss.kl.dtype))


@pytest.mark.parametrize(
    ("field", "message"),
    [
        ("envelope_logits", "envelope_logits.*finite"),
        ("posterior_mu", "posterior_mu.*finite"),
        ("prior_logvar", "prior_logvar.*finite"),
    ],
)
def test_model_loss_rejects_non_finite_outputs(field, message, fixture_batch):
    conditions, targets = fixture_batch
    output = _new_model()(conditions, targets)
    values = {name: getattr(output, name).detach().clone() for name in (
        "envelope_logits",
        "space_logits",
        "site_logits",
        "posterior_mu",
        "posterior_logvar",
        "prior_mu",
        "prior_logvar",
    )}
    values[field].reshape(-1)[0] = float("nan")

    with pytest.raises(ValueError, match=message):
        model_loss(ModelOutput(**values), targets)


def test_model_loss_rejects_logvars_outside_the_clamped_contract(fixture_batch):
    conditions, targets = fixture_batch
    output = _new_model()(conditions, targets)
    values = {name: getattr(output, name) for name in (
        "envelope_logits",
        "space_logits",
        "site_logits",
        "posterior_mu",
        "posterior_logvar",
        "prior_mu",
        "prior_logvar",
    )}
    values["posterior_logvar"] = torch.full_like(output.posterior_logvar, 12.1)

    with pytest.raises(ValueError, match=r"posterior_logvar.*\[-12, 12\]"):
        model_loss(ModelOutput(**values), targets)
