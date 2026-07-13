import json
import math
import random
import re
import subprocess
import sys
from dataclasses import FrozenInstanceError, fields
from pathlib import Path

import numpy as np
import pytest
import torch

from mcagent_stage7.contracts import canonical_json_bytes, sha256_file
from mcagent_stage7.dataset import Stage7Dataset
from mcagent_stage7.encoding import ConditionEncoder
from mcagent_stage7.model import LossOutput
from mcagent_stage7.train_fixture import RunArtifacts, TrainConfig, train_fixture


STAGE7_ROOT = Path(__file__).resolve().parents[1]
SHA256 = re.compile(r"^[a-f0-9]{64}$")
METRIC_FIELDS = {
    "step",
    "total_loss",
    "envelope_loss",
    "space_loss",
    "site_loss",
    "dice_loss",
    "kl_loss",
    "parameter_sha256",
}


def _config(fixture_root, **overrides):
    values = {
        "fixture_root": fixture_root,
        "seed": 7101,
        "steps": 2,
        "learning_rate": 1e-3,
        "device": "cpu",
        "code_revision": "test-revision",
    }
    values.update(overrides)
    return TrainConfig(**values)


def test_train_config_and_run_artifacts_are_exact_frozen_interfaces(
    fixture_root, trained_checkpoint
):
    assert [field.name for field in fields(TrainConfig)] == [
        "fixture_root",
        "seed",
        "steps",
        "learning_rate",
        "device",
        "code_revision",
    ]
    assert [field.name for field in fields(RunArtifacts)] == [
        "stage7_root",
        "checkpoint_path",
        "manifest_path",
        "metrics_path",
        "manifest",
        "checkpoint_sha256",
        "manifest_sha256",
        "metrics_sha256",
        "final_loss",
    ]
    with pytest.raises(FrozenInstanceError):
        _config(fixture_root).steps = 3
    with pytest.raises(FrozenInstanceError):
        trained_checkpoint.final_loss = 0


def test_fixed_seed_fixture_training_is_reproducible(tmp_path, fixture_root):
    config = _config(fixture_root)
    first = train_fixture(config, tmp_path / "first")
    second = train_fixture(config, tmp_path / "second")

    assert first.checkpoint_sha256 == second.checkpoint_sha256
    assert first.manifest_sha256 == second.manifest_sha256
    assert first.metrics_sha256 == second.metrics_sha256
    assert first.final_loss == second.final_loss
    assert first.stage7_root == STAGE7_ROOT
    assert first.checkpoint_path.name == "checkpoint.pt"
    assert first.manifest_path.name == "checkpoint_manifest.json"
    assert first.metrics_path.name == "metrics.jsonl"
    assert first.checkpoint_sha256 == sha256_file(first.checkpoint_path)
    assert first.manifest_sha256 == sha256_file(first.manifest_path)
    assert first.metrics_sha256 == sha256_file(first.metrics_path)

    manifest = json.loads(first.manifest_path.read_text("utf8"))
    assert manifest["training_scope"] == "fixture-only"
    assert manifest["dataset_version"] == "fixture-v1"
    assert manifest["device"] == "cpu"
    assert manifest["seed"] == 7101
    assert manifest["checkpoint_sha256"] == first.checkpoint_sha256
    assert "quality" not in manifest
    assert "generalization" not in manifest


def test_metrics_are_one_canonical_complete_object_per_optimizer_step(
    trained_checkpoint,
):
    raw_lines = trained_checkpoint.metrics_path.read_bytes().splitlines(keepends=True)
    assert len(raw_lines) == 2
    metrics = []
    for index, line in enumerate(raw_lines, start=1):
        assert line.endswith(b"\n")
        metric = json.loads(line)
        assert line == canonical_json_bytes(metric) + b"\n"
        assert set(metric) == METRIC_FIELDS
        assert metric["step"] == index
        assert all(
            math.isfinite(metric[field])
            for field in (
                "total_loss",
                "envelope_loss",
                "space_loss",
                "site_loss",
                "dice_loss",
                "kl_loss",
            )
        )
        assert SHA256.fullmatch(metric["parameter_sha256"])
        metrics.append(metric)
    assert trained_checkpoint.final_loss == metrics[-1]["total_loss"]


def test_training_uses_manifest_order_batch_one_without_shuffle(
    tmp_path, fixture_root, monkeypatch
):
    loaded_case_ids = []
    loaded_batch_shapes = []
    original_constructor = Stage7Dataset.from_fixtures.__func__

    def recording_constructor(cls, root):
        dataset = original_constructor(cls, root)
        original_load_case = dataset.load_case

        def recording_load_case(case_id, requested_layers):
            loaded_case_ids.append(case_id)
            case = original_load_case(case_id, requested_layers)
            loaded_batch_shapes.append(
                ConditionEncoder().encode(case.condition).unsqueeze(0).shape
            )
            return case

        dataset.load_case = recording_load_case
        return dataset

    monkeypatch.setattr(Stage7Dataset, "from_fixtures", classmethod(recording_constructor))
    train_fixture(_config(fixture_root, steps=3), tmp_path / "ordered")

    manifest = json.loads((fixture_root / "manifest.json").read_text("utf8"))
    expected = [record["case_id"] for record in manifest["cases"]]
    assert loaded_case_ids == [expected[0], expected[1], expected[0]]
    assert loaded_batch_shapes == [torch.Size([1, 64])] * 3


def test_training_sets_all_seeds_and_cpu_determinism(
    tmp_path, fixture_root, monkeypatch
):
    calls = []
    original_random_seed = random.seed
    original_numpy_seed = np.random.seed
    original_torch_seed = torch.manual_seed
    original_determinism = torch.use_deterministic_algorithms
    original_threads = torch.set_num_threads

    monkeypatch.setattr(random, "seed", lambda value: (calls.append(("python", value)), original_random_seed(value))[1])
    monkeypatch.setattr(np.random, "seed", lambda value: (calls.append(("numpy", value)), original_numpy_seed(value))[1])
    monkeypatch.setattr(torch, "manual_seed", lambda value: (calls.append(("torch", value)), original_torch_seed(value))[1])
    monkeypatch.setattr(
        torch,
        "use_deterministic_algorithms",
        lambda value: (calls.append(("deterministic", value)), original_determinism(value))[1],
    )
    monkeypatch.setattr(
        torch,
        "set_num_threads",
        lambda value: (calls.append(("threads", value)), original_threads(value))[1],
    )

    train_fixture(_config(fixture_root, steps=1), tmp_path / "seeded")

    assert ("python", 7101) in calls
    assert ("numpy", 7101) in calls
    assert ("torch", 7101) in calls
    assert ("deterministic", True) in calls
    assert ("threads", 1) in calls


def test_mandatory_training_path_never_consults_cuda(
    tmp_path, fixture_root, monkeypatch
):
    def reject_cuda(*_args, **_kwargs):
        raise AssertionError("fixture trainer consulted CUDA")

    monkeypatch.setattr(torch.cuda, "is_available", reject_cuda)
    monkeypatch.setattr(torch.cuda, "device_count", reject_cuda)
    monkeypatch.setattr(torch.cuda, "current_device", reject_cuda)

    artifacts = train_fixture(_config(fixture_root, steps=1), tmp_path / "cpu-only")
    assert artifacts.manifest["device"] == "cpu"


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"steps": 0}, "steps.*positive"),
        ({"steps": -1}, "steps.*positive"),
        ({"steps": 1.5}, "steps.*integer"),
        ({"learning_rate": 0}, "learning_rate.*positive"),
        ({"learning_rate": -1e-3}, "learning_rate.*positive"),
        ({"learning_rate": float("nan")}, "learning_rate.*finite"),
        ({"learning_rate": float("inf")}, "learning_rate.*finite"),
        ({"seed": -1}, "seed"),
        ({"seed": 2**32}, "seed"),
        ({"device": "cuda"}, "device.*cpu"),
        ({"code_revision": ""}, "code_revision"),
    ],
)
def test_training_rejects_invalid_config_before_writing(
    tmp_path, fixture_root, overrides, message
):
    output = tmp_path / "invalid"
    with pytest.raises(ValueError, match=message):
        train_fixture(_config(fixture_root, **overrides), output)
    assert not output.exists()


def test_training_rejects_a_non_fixture_dataset(
    tmp_path, fixture_root, monkeypatch
):
    monkeypatch.setattr(
        Stage7Dataset,
        "from_fixtures",
        classmethod(lambda _cls, _root: type("Dataset", (), {"mode": "real"})()),
    )
    with pytest.raises(ValueError, match="fixture-only"):
        train_fixture(_config(fixture_root), tmp_path / "wrong-origin")


def test_training_rejects_non_finite_loss(
    tmp_path, fixture_root, monkeypatch
):
    def non_finite_loss(output, _targets):
        finite = output.envelope_logits.sum() * 0
        return LossOutput(
            total=finite + float("nan"),
            envelope=finite,
            space=finite,
            site=finite,
            dice=finite,
            kl=finite,
        )

    monkeypatch.setattr("mcagent_stage7.train_fixture.model_loss", non_finite_loss)
    with pytest.raises(ValueError, match="loss.*finite"):
        train_fixture(_config(fixture_root, steps=1), tmp_path / "non-finite-loss")


def test_training_rejects_non_finite_gradients(
    tmp_path, fixture_root, monkeypatch
):
    def non_finite_gradient_loss(output, _targets):
        output.envelope_logits.register_hook(
            lambda gradient: torch.full_like(gradient, float("nan"))
        )
        total = output.envelope_logits.sum()
        zero = total.detach() * 0
        return LossOutput(
            total=total,
            envelope=zero,
            space=zero,
            site=zero,
            dice=zero,
            kl=zero,
        )

    monkeypatch.setattr(
        "mcagent_stage7.train_fixture.model_loss", non_finite_gradient_loss
    )
    with pytest.raises(ValueError, match="gradient.*finite"):
        train_fixture(_config(fixture_root, steps=1), tmp_path / "non-finite-gradients")


def test_cli_rejects_cuda_explicitly_without_creating_output(tmp_path, fixture_root):
    output = tmp_path / "cuda"
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "mcagent_stage7.train_fixture",
            "--fixture-root",
            str(fixture_root),
            "--output",
            str(output),
            "--seed",
            "7101",
            "--steps",
            "1",
            "--learning-rate",
            "0.001",
            "--device",
            "cuda",
            "--code-revision",
            "test-revision",
        ],
        cwd=STAGE7_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode != 0
    assert "device" in result.stderr.lower()
    assert "cpu" in result.stderr.lower()
    assert not output.exists()
