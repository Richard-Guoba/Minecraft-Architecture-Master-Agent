import json
import re
import subprocess
from dataclasses import FrozenInstanceError
from pathlib import Path
from types import SimpleNamespace

import pytest

import mcagent_stage7.acceptance as acceptance
from mcagent_stage7.acceptance import AcceptanceConfig, run_acceptance


def test_benchmark_evidence_replay_pins_recorded_revision_and_hashes():
    benchmark = (
        Path(__file__).resolve().parents[3]
        / "docs/benchmarks/stage7-m3-fixture-foundation.md"
    ).read_text("utf8")

    recorded_revision = re.search(
        r"Recorded code revision: `([0-9a-f]{40})`\.", benchmark
    )
    assert recorded_revision is not None

    mandatory = re.search(
        r"## Mandatory acceptance\n(?P<body>.*?)\n## Immutable evidence replay",
        benchmark,
        re.DOTALL,
    )
    assert mandatory is not None
    assert "records the current `HEAD`" in mandatory["body"]
    mandatory_command = re.search(
        r"```bash\n(?P<command>[^\n]+)\n```", mandatory["body"]
    )
    assert mandatory_command is not None
    assert mandatory_command["command"] == (
        "npm run accept:stage7:m3 -- --fixture-root fixtures/m3 "
        "--output runs/m3-acceptance --seed 7101 --steps 2"
    )

    replay = re.search(
        r"## Immutable evidence replay\n(?P<body>.*?)\n## Reproducibility hashes",
        benchmark,
        re.DOTALL,
    )
    assert replay is not None
    replay_revision = re.search(
        r"--code-revision ([0-9a-f]{40})(?:\s|$)", replay["body"]
    )
    assert replay_revision is not None
    assert replay_revision[1] == recorded_revision[1]

    acceptance_hash = re.search(
        r"Acceptance JSON \| `([0-9a-f]{64})`", replay["body"]
    )
    manifest_hashes = re.findall(
        r"Checkpoint manifest \| `([0-9a-f]{64})`", benchmark
    )
    assert acceptance_hash is not None
    assert len(manifest_hashes) == 2
    assert len(set(manifest_hashes)) == 1


def test_acceptance_runs_twice_and_validates_the_node_boundary(tmp_path, fixture_root):
    result = run_acceptance(AcceptanceConfig(
        fixture_root=fixture_root,
        output_root=tmp_path,
        seed=7101,
        steps=2,
        code_revision="test-revision",
    ))
    assert result["source"] == "stage7-m3-fixture-acceptance-v1"
    assert result["cpu_smoke"] == "ok"
    assert result["checkpoint_reproducible"] is True
    assert result["inference_reproducible"] is True
    assert result["node_schema_valid"] is True
    assert result["primary_geometry_changed"] is False
    assert result["training_scope"] == "fixture-only"
    assert result["real_training_started"] is False


def test_acceptance_config_is_frozen(tmp_path, fixture_root):
    config = AcceptanceConfig(
        fixture_root=fixture_root,
        output_root=tmp_path,
        seed=7101,
        steps=2,
        code_revision="test-revision",
    )
    with pytest.raises(FrozenInstanceError):
        config.seed = 7102


@pytest.mark.parametrize(
    "gate_update",
    [
        {"ready_for_m3_real_data": True},
        {"training_eligible_count": 1},
    ],
)
def test_acceptance_aborts_before_training_when_the_real_data_gate_drifts(
    tmp_path, fixture_root, monkeypatch, gate_update
):
    manifest_path = tmp_path / "manifest.json"
    manifest = {
        "ready_for_m3_real_data": False,
        "training_eligible_count": 0,
        **gate_update,
    }
    manifest_path.write_text(json.dumps(manifest), "utf8")
    monkeypatch.setattr(acceptance, "DATASET_V3_MANIFEST", manifest_path)
    output_root = tmp_path / "acceptance"

    with pytest.raises(acceptance.AcceptanceError, match="real-data gate"):
        run_acceptance(AcceptanceConfig(
            fixture_root=fixture_root,
            output_root=output_root,
            seed=7101,
            steps=2,
            code_revision="test-revision",
        ))

    assert not output_root.exists()


@pytest.mark.parametrize(
    ("field", "replacement", "message"),
    [
        ("checkpoint_sha256", "b" * 64, "checkpoint SHA-256"),
        ("manifest_sha256", "c" * 64, "manifest SHA-256"),
        ("metrics_sha256", "d" * 64, "metrics SHA-256"),
        ("final_loss", 99.0, "final loss"),
    ],
)
def test_acceptance_rejects_every_cross_run_training_mismatch(
    tmp_path, field, replacement, message
):
    first_metrics = tmp_path / "first.jsonl"
    second_metrics = tmp_path / "second.jsonl"
    metric = {"step": 1, "parameter_sha256": "a" * 64}
    first_metrics.write_text(json.dumps(metric) + "\n", "utf8")
    second_metrics.write_text(json.dumps(metric) + "\n", "utf8")
    values = {
        "checkpoint_sha256": "1" * 64,
        "manifest_sha256": "2" * 64,
        "metrics_sha256": "3" * 64,
        "final_loss": 1.25,
    }
    first = SimpleNamespace(metrics_path=first_metrics, **values)
    second_values = {**values, field: replacement}
    second = SimpleNamespace(metrics_path=second_metrics, **second_values)

    with pytest.raises(acceptance.AcceptanceError, match=message):
        acceptance._compare_training_runs(first, second)


def test_acceptance_rejects_cross_run_parameter_hash_mismatch(tmp_path):
    first_metrics = tmp_path / "first.jsonl"
    second_metrics = tmp_path / "second.jsonl"
    first_metrics.write_text(
        json.dumps({"step": 1, "parameter_sha256": "a" * 64}) + "\n",
        "utf8",
    )
    second_metrics.write_text(
        json.dumps({"step": 1, "parameter_sha256": "b" * 64}) + "\n",
        "utf8",
    )
    values = {
        "checkpoint_sha256": "1" * 64,
        "manifest_sha256": "2" * 64,
        "metrics_sha256": "3" * 64,
        "final_loss": 1.25,
    }

    with pytest.raises(acceptance.AcceptanceError, match="parameter hashes"):
        acceptance._compare_training_runs(
            SimpleNamespace(metrics_path=first_metrics, **values),
            SimpleNamespace(metrics_path=second_metrics, **values),
        )


@pytest.mark.parametrize("field", ["input_sha256", "output_sha256", "plan"])
def test_acceptance_rejects_every_cross_run_inference_mismatch(field):
    values = {
        "input_sha256": "1" * 64,
        "output_sha256": "2" * 64,
        "plan": {"source": "plan-a"},
    }
    replacements = {
        "input_sha256": "3" * 64,
        "output_sha256": "4" * 64,
        "plan": {"source": "plan-b"},
    }

    with pytest.raises(acceptance.AcceptanceError, match="inference"):
        acceptance._compare_inference_runs(
            SimpleNamespace(**values),
            SimpleNamespace(**{**values, field: replacements[field]}),
        )


@pytest.mark.parametrize(
    "completed",
    [
        subprocess.CompletedProcess(["node"], 0, '{"ok":false}', ""),
        subprocess.CompletedProcess(["node"], 0, "not-json", ""),
        subprocess.CompletedProcess(["node"], 1, "", "invalid plan"),
    ],
)
def test_acceptance_rejects_invalid_node_validation_results(completed):
    with pytest.raises(acceptance.AcceptanceError, match="Node plan validation"):
        acceptance._parse_node_validation(completed)


def test_acceptance_rejects_primary_operation_drift():
    baseline = [{"kind": "setblock", "x": 1, "y": 2, "z": 3}]
    shadow = [{"kind": "setblock", "x": 2, "y": 2, "z": 3}]

    with pytest.raises(acceptance.AcceptanceError, match="primary operations"):
        acceptance._compare_primary_operations(baseline, shadow)
