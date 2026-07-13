import copy
import json
import subprocess
import sys
from dataclasses import FrozenInstanceError, fields
from pathlib import Path

import pytest
import torch

import mcagent_stage7.infer as infer_module
from mcagent_stage7.contracts import (
    Stage7ContractError,
    canonical_json_bytes,
    condition_hash,
    pretty_json_bytes,
    sha256_bytes,
)
from mcagent_stage7.infer import InferenceResult, infer_condition
from mcagent_stage7.model import TinyConditionalVAE


STAGE7_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = STAGE7_ROOT.parents[1]
VALIDATOR = STAGE7_ROOT / "validate_plan.mjs"
FIXTURE_PLAN = STAGE7_ROOT / "fixtures/m3/cases/one-floor-house/plan.json"


def _rehash(condition):
    value = copy.deepcopy(condition)
    value.pop("condition_hash", None)
    value["condition_hash"] = condition_hash(value)
    return value


def _mutated(condition, dotted_key, value):
    result = copy.deepcopy(condition)
    owner = result
    parts = dotted_key.split(".")
    for part in parts[:-1]:
        owner = owner[part]
    owner[parts[-1]] = value
    return _rehash(result)


def _write_manifest(path, manifest):
    path.write_bytes(pretty_json_bytes(manifest))
    return path


def _cli_arguments(trained_checkpoint, *input_arguments, output="-"):
    return [
        sys.executable,
        "-m",
        "mcagent_stage7.infer",
        "--checkpoint",
        str(trained_checkpoint.checkpoint_path),
        "--manifest",
        str(trained_checkpoint.manifest_path),
        *input_arguments,
        "--output",
        str(output),
    ]


def _plan_keys(value):
    keys = set()
    if isinstance(value, dict):
        keys.update(value)
        for item in value.values():
            keys.update(_plan_keys(item))
    elif isinstance(value, list):
        for item in value:
            keys.update(_plan_keys(item))
    return keys


def test_inference_result_is_the_exact_frozen_python_interface():
    assert [field.name for field in fields(InferenceResult)] == [
        "input_sha256",
        "output_sha256",
        "plan",
    ]
    result = InferenceResult("a" * 64, "b" * 64, {})
    with pytest.raises(FrozenInstanceError):
        result.plan = {"changed": True}


def test_fixture_checkpoint_reloads_and_emits_reproducible_canonical_plan(
    trained_checkpoint,
    fixture_condition,
):
    original_condition = copy.deepcopy(fixture_condition)
    first = infer_condition(
        trained_checkpoint.checkpoint_path,
        trained_checkpoint.manifest_path,
        fixture_condition,
    )
    second = infer_condition(
        trained_checkpoint.checkpoint_path,
        trained_checkpoint.manifest_path,
        fixture_condition,
    )

    assert fixture_condition == original_condition
    assert first == second
    assert first.input_sha256 == sha256_bytes(canonical_json_bytes(fixture_condition))
    assert first.output_sha256 == sha256_bytes(canonical_json_bytes(first.plan))
    assert first.plan["condition_hash"] == fixture_condition["condition_hash"]
    assert first.plan["provider"] == {
        "kind": "learned-python-shadow",
        "name": "stage7-tiny-cvae-v1",
        "model_version": "m3-fixture-v1",
        "dataset_version": "fixture-v1",
        "checkpoint_version": "sha256:" + trained_checkpoint.checkpoint_sha256,
    }
    assert set(first.plan) == {
        "source",
        "schema_version",
        "provider",
        "condition_hash",
        "resolution",
        "encoding",
        "orientation",
        "world_transform",
        "runs",
        "evidence",
        "summary",
        "derived_sketches",
        "conflicts",
        "repairs",
        "warnings",
    }
    assert not {"block_id", "block_ids", "command", "commands", "operations"} & _plan_keys(
        first.plan
    )


def test_inference_loads_strictly_on_cpu_in_eval_inference_mode(
    trained_checkpoint,
    fixture_condition,
    monkeypatch,
):
    observations = {}
    original_load_checkpoint = infer_module.load_checkpoint
    original_load_state_dict = TinyConditionalVAE.load_state_dict
    original_predict = TinyConditionalVAE.predict

    def recording_checkpoint_loader(*args, **kwargs):
        observations["require_scope"] = kwargs.get("require_scope")
        return original_load_checkpoint(*args, **kwargs)

    def recording_state_loader(self, state_dict, strict=True):
        observations["strict"] = strict
        return original_load_state_dict(self, state_dict, strict=strict)

    def recording_predict(self, conditions):
        observations["training"] = self.training
        observations["grad_enabled"] = torch.is_grad_enabled()
        observations["model_device"] = next(self.parameters()).device.type
        observations["condition_device"] = conditions.device.type
        return original_predict(self, conditions)

    def reject_cuda(*_args, **_kwargs):
        raise AssertionError("mandatory inference consulted CUDA")

    monkeypatch.setattr(infer_module, "load_checkpoint", recording_checkpoint_loader)
    monkeypatch.setattr(TinyConditionalVAE, "load_state_dict", recording_state_loader)
    monkeypatch.setattr(TinyConditionalVAE, "predict", recording_predict)
    monkeypatch.setattr(torch.cuda, "is_available", reject_cuda)
    monkeypatch.setattr(torch.cuda, "device_count", reject_cuda)
    monkeypatch.setattr(torch.cuda, "current_device", reject_cuda)

    infer_condition(
        trained_checkpoint.checkpoint_path,
        trained_checkpoint.manifest_path,
        fixture_condition,
    )

    assert observations == {
        "require_scope": "fixture-only",
        "strict": True,
        "training": False,
        "grad_enabled": False,
        "model_device": "cpu",
        "condition_device": "cpu",
    }


@pytest.mark.parametrize(
    ("field", "message"),
    [
        ("massing_volumes", "massing volumes"),
        ("topology_program", "topology program"),
    ],
)
def test_inference_rejects_explicit_null_optional_design_fields_before_checkpoint_load(
    fixture_condition,
    monkeypatch,
    tmp_path,
    field,
    message,
):
    condition = copy.deepcopy(fixture_condition)
    condition["design"][field] = None
    condition = _rehash(condition)

    def reject_checkpoint_load(*_args, **_kwargs):
        raise AssertionError("checkpoint loaded for an invalid condition")

    monkeypatch.setattr(infer_module, "load_checkpoint", reject_checkpoint_load)

    with pytest.raises(Stage7ContractError, match=message):
        infer_condition(
            tmp_path / "missing-checkpoint.pt",
            tmp_path / "missing-manifest.json",
            condition,
        )


@pytest.mark.parametrize("field", ["massing_volumes", "topology_program"])
def test_inference_allows_absent_optional_design_fields(
    trained_checkpoint,
    fixture_condition,
    field,
):
    condition = copy.deepcopy(fixture_condition)
    del condition["design"][field]
    condition = _rehash(condition)

    result = infer_condition(
        trained_checkpoint.checkpoint_path,
        trained_checkpoint.manifest_path,
        condition,
    )

    assert result.plan["condition_hash"] == condition["condition_hash"]


def test_inference_rejects_malformed_or_non_finite_canonical_conditions_before_prediction(
    trained_checkpoint,
    fixture_condition,
    monkeypatch,
):
    def reject_prediction(*_args, **_kwargs):
        raise AssertionError("prediction ran for an invalid condition")

    monkeypatch.setattr(TinyConditionalVAE, "predict", reject_prediction)
    malformed_reference = {
        "case_id": "reference",
        "review_state": "approved",
        "review_confidence": 1,
        "used_for": ["envelope"],
        "hints": [{"area": "envelope", "claim": "wall", "confidence": float("nan")}],
    }
    malformed_conditions = [
        None,
        [],
        _mutated(fixture_condition, "source", "other"),
        _mutated(fixture_condition, "schema_version", 2),
        _mutated(fixture_condition, "schema_version", True),
        _mutated(fixture_condition, "constraints.resolution", [64, 64, 63]),
        _mutated(fixture_condition, "constraints.resolution", (64, 64, 64)),
        _mutated(fixture_condition, "constraints.max_total_height", 0),
        _mutated(fixture_condition, "constraints.minecraft_fill_limit", float("inf")),
        _mutated(fixture_condition, "dimensions.width", True),
        _mutated(fixture_condition, "dimensions.width", 12.5),
        _mutated(fixture_condition, "dimensions.width", float("nan")),
        _mutated(fixture_condition, "dimensions.lot_width", 0),
        _mutated(fixture_condition, "seed", True),
        _mutated(fixture_condition, "seed", 7101.5),
        _mutated(fixture_condition, "prompt", ""),
        _mutated(fixture_condition, "design.front_side", "up"),
        _mutated(fixture_condition, "design.massing_strategy", "compact"),
        _mutated(fixture_condition, "design.topology_program", []),
        _mutated(fixture_condition, "references", {}),
        _mutated(fixture_condition, "references", [malformed_reference]),
        _rehash({**fixture_condition, "extra_non_finite": float("-inf")}),
        {**fixture_condition, "condition_hash": "0" * 64},
        {key: value for key, value in fixture_condition.items() if key != "condition_hash"},
    ]

    for malformed in malformed_conditions:
        with pytest.raises(Stage7ContractError):
            infer_condition(
                trained_checkpoint.checkpoint_path,
                trained_checkpoint.manifest_path,
                malformed,
            )


def test_inference_rejects_missing_corrupt_or_incompatible_checkpoint_artifacts(
    tmp_path,
    trained_checkpoint,
    fixture_condition,
):
    with pytest.raises(Stage7ContractError, match="manifest"):
        infer_condition(
            trained_checkpoint.checkpoint_path,
            tmp_path / "missing-manifest.json",
            fixture_condition,
        )
    corrupt_json_manifest = tmp_path / "corrupt-json-manifest.json"
    corrupt_json_manifest.write_text("{", "utf8")
    with pytest.raises(Stage7ContractError, match="manifest"):
        infer_condition(
            trained_checkpoint.checkpoint_path,
            corrupt_json_manifest,
            fixture_condition,
        )
    with pytest.raises(Stage7ContractError, match="checkpoint"):
        infer_condition(
            tmp_path / "missing" / "checkpoint.pt",
            trained_checkpoint.manifest_path,
            fixture_condition,
        )

    corrupt_checkpoint = tmp_path / "checkpoint.pt"
    corrupt_checkpoint.write_bytes(
        trained_checkpoint.checkpoint_path.read_bytes() + b"corrupt"
    )
    corrupt_manifest = dict(trained_checkpoint.manifest)
    corrupt_manifest_path = _write_manifest(
        tmp_path / "corrupt-manifest.json",
        corrupt_manifest,
    )
    with pytest.raises(Stage7ContractError, match="SHA-256 mismatch"):
        infer_condition(corrupt_checkpoint, corrupt_manifest_path, fixture_condition)

    invalid_payload = tmp_path / "invalid-checkpoint.pt"
    invalid_payload.write_bytes(b"not a torch checkpoint")
    invalid_payload_manifest = dict(trained_checkpoint.manifest)
    invalid_payload_manifest["checkpoint_file"] = invalid_payload.name
    invalid_payload_manifest["checkpoint_sha256"] = sha256_bytes(
        invalid_payload.read_bytes()
    )
    invalid_payload_manifest_path = _write_manifest(
        tmp_path / "invalid-payload-manifest.json",
        invalid_payload_manifest,
    )
    with pytest.raises(Stage7ContractError, match="payload"):
        infer_condition(
            invalid_payload,
            invalid_payload_manifest_path,
            fixture_condition,
        )

    mutations = [
        ("training_scope", "prototype"),
        ("source", "other"),
        ("schema_version", 2),
        ("model_name", "other"),
        ("model_version", "other"),
        ("dataset_version", "v3"),
        ("device", "cuda"),
        ("deterministic_algorithms", False),
    ]
    for index, (field, value) in enumerate(mutations):
        manifest = copy.deepcopy(trained_checkpoint.manifest)
        manifest[field] = value
        manifest_path = _write_manifest(tmp_path / f"manifest-{index}.json", manifest)
        with pytest.raises(Stage7ContractError):
            infer_condition(
                trained_checkpoint.checkpoint_path,
                manifest_path,
                fixture_condition,
            )

    for index, (field, value) in enumerate(
        (("condition_size", 63), ("latent_size", 15), ("coarse_size", 8))
    ):
        manifest = copy.deepcopy(trained_checkpoint.manifest)
        manifest["config"][field] = value
        manifest_path = _write_manifest(tmp_path / f"config-{index}.json", manifest)
        with pytest.raises(Stage7ContractError, match=field):
            infer_condition(
                trained_checkpoint.checkpoint_path,
                manifest_path,
                fixture_condition,
            )


def test_inference_does_not_write_or_replace_checkpoint_artifacts(
    trained_checkpoint,
    fixture_condition,
):
    before_names = sorted(path.name for path in trained_checkpoint.checkpoint_path.parent.iterdir())
    before_checkpoint = trained_checkpoint.checkpoint_path.read_bytes()
    before_manifest = trained_checkpoint.manifest_path.read_bytes()

    infer_condition(
        trained_checkpoint.checkpoint_path,
        trained_checkpoint.manifest_path,
        fixture_condition,
    )

    assert sorted(path.name for path in trained_checkpoint.checkpoint_path.parent.iterdir()) == before_names
    assert trained_checkpoint.checkpoint_path.read_bytes() == before_checkpoint
    assert trained_checkpoint.manifest_path.read_bytes() == before_manifest


def test_inference_python_boundary_has_no_node_real_dataset_or_checkpoint_writer_imports():
    source = Path(infer_module.__file__).read_text("utf8")
    for forbidden in (
        "subprocess",
        "node:",
        "mc_templates",
        "coarse_semantic_voxels/v3",
        "save_checkpoint",
        "torch.save",
    ):
        assert forbidden not in source


def test_inference_cli_uses_stdout_for_one_canonical_json_document_only(
    trained_checkpoint,
    fixture_condition,
):
    result = subprocess.run(
        _cli_arguments(trained_checkpoint, "--stdin"),
        input=json.dumps(fixture_condition),
        text=True,
        capture_output=True,
        check=False,
        cwd=trained_checkpoint.stage7_root,
    )

    assert result.returncode == 0, result.stderr
    plan = json.loads(result.stdout)
    assert result.stdout.encode("utf8") == canonical_json_bytes(plan)
    assert plan["source"] == "stage7-coarse-semantic-voxel-plan-v1"
    assert result.stderr == ""


def test_inference_cli_condition_file_writes_repeatable_canonical_bytes(
    tmp_path,
    trained_checkpoint,
    fixture_condition,
):
    condition_path = tmp_path / "condition.json"
    condition_path.write_bytes(pretty_json_bytes(fixture_condition))
    first_path = tmp_path / "first.json"
    second_path = tmp_path / "second.json"

    for output in (first_path, second_path):
        result = subprocess.run(
            _cli_arguments(
                trained_checkpoint,
                "--condition",
                str(condition_path),
                output=output,
            ),
            text=True,
            capture_output=True,
            check=False,
            cwd=trained_checkpoint.stage7_root,
        )
        assert result.returncode == 0, result.stderr
        assert result.stdout == ""
        assert result.stderr == ""

    plan = json.loads(first_path.read_text("utf8"))
    assert first_path.read_bytes() == second_path.read_bytes() == canonical_json_bytes(plan)


def test_inference_cli_fails_closed_on_input_selection_json_and_artifact_errors(
    tmp_path,
    trained_checkpoint,
    fixture_condition,
):
    condition_path = tmp_path / "condition.json"
    condition_path.write_bytes(pretty_json_bytes(fixture_condition))
    malformed_path = tmp_path / "malformed.json"
    malformed_path.write_text("{", "utf8")
    cases = [
        (_cli_arguments(trained_checkpoint), None),
        (
            _cli_arguments(
                trained_checkpoint,
                "--stdin",
                "--condition",
                str(condition_path),
            ),
            json.dumps(fixture_condition),
        ),
        (_cli_arguments(trained_checkpoint, "--stdin"), "{"),
        (_cli_arguments(trained_checkpoint, "--stdin"), '{"value":NaN}'),
        (
            _cli_arguments(
                trained_checkpoint,
                "--condition",
                str(malformed_path),
            ),
            None,
        ),
    ]

    for index, (arguments, stdin) in enumerate(cases):
        output_path = tmp_path / f"unexpected-{index}.json"
        arguments[-1] = str(output_path)
        result = subprocess.run(
            arguments,
            input=stdin,
            text=True,
            capture_output=True,
            check=False,
            cwd=trained_checkpoint.stage7_root,
        )
        assert result.returncode != 0
        assert result.stdout == ""
        assert result.stderr
        assert not output_path.exists()

    missing_manifest_arguments = _cli_arguments(trained_checkpoint, "--stdin")
    missing_manifest_arguments[
        missing_manifest_arguments.index("--manifest") + 1
    ] = str(tmp_path / "missing.json")
    result = subprocess.run(
        missing_manifest_arguments,
        input=json.dumps(fixture_condition),
        text=True,
        capture_output=True,
        check=False,
        cwd=trained_checkpoint.stage7_root,
    )
    assert result.returncode != 0
    assert result.stdout == ""
    assert "manifest" in result.stderr.lower()


def test_inference_cli_refuses_to_overwrite_checkpoint_or_manifest(
    trained_checkpoint,
    fixture_condition,
):
    checkpoint_bytes = trained_checkpoint.checkpoint_path.read_bytes()
    manifest_bytes = trained_checkpoint.manifest_path.read_bytes()
    for protected_path in (
        trained_checkpoint.checkpoint_path,
        trained_checkpoint.manifest_path,
    ):
        result = subprocess.run(
            _cli_arguments(
                trained_checkpoint,
                "--stdin",
                output=protected_path,
            ),
            input=json.dumps(fixture_condition),
            text=True,
            capture_output=True,
            check=False,
            cwd=trained_checkpoint.stage7_root,
        )
        assert result.returncode != 0
        assert result.stdout == ""
        assert result.stderr
    assert trained_checkpoint.checkpoint_path.read_bytes() == checkpoint_bytes
    assert trained_checkpoint.manifest_path.read_bytes() == manifest_bytes


@pytest.mark.parametrize("artifact_field", ["checkpoint_path", "manifest_path"])
def test_inference_cli_refuses_hardlink_aliases_to_checkpoint_artifacts(
    tmp_path,
    trained_checkpoint,
    fixture_condition,
    artifact_field,
):
    protected_path = getattr(trained_checkpoint, artifact_field)
    alias_path = tmp_path / f"{artifact_field}-alias.json"
    alias_path.hardlink_to(protected_path)
    checkpoint_bytes = trained_checkpoint.checkpoint_path.read_bytes()
    manifest_bytes = trained_checkpoint.manifest_path.read_bytes()
    checkpoint_sha256 = sha256_bytes(checkpoint_bytes)
    manifest_sha256 = sha256_bytes(manifest_bytes)

    result = subprocess.run(
        _cli_arguments(
            trained_checkpoint,
            "--stdin",
            output=alias_path,
        ),
        input=json.dumps(fixture_condition),
        text=True,
        capture_output=True,
        check=False,
        cwd=trained_checkpoint.stage7_root,
    )

    assert result.returncode != 0
    assert result.stdout == ""
    assert "output" in result.stderr.lower()
    assert "checkpoint" in result.stderr.lower()
    assert trained_checkpoint.checkpoint_path.read_bytes() == checkpoint_bytes
    assert trained_checkpoint.manifest_path.read_bytes() == manifest_bytes
    assert sha256_bytes(trained_checkpoint.checkpoint_path.read_bytes()) == checkpoint_sha256
    assert sha256_bytes(trained_checkpoint.manifest_path.read_bytes()) == manifest_sha256


def test_authoritative_node_validator_accepts_a_canonical_fixture_plan():
    condition_path = STAGE7_ROOT / "fixtures/m3/cases/one-floor-house/condition.json"
    condition = json.loads(condition_path.read_text("utf8"))
    plan = json.loads(FIXTURE_PLAN.read_text("utf8"))

    result = subprocess.run(
        ["node", str(VALIDATOR), str(condition_path), str(FIXTURE_PLAN)],
        text=True,
        capture_output=True,
        check=False,
        cwd=REPOSITORY_ROOT,
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {
        "ok": True,
        "condition_hash": condition["condition_hash"],
        "run_count": len(plan["runs"]),
    }
    assert result.stderr == ""


def test_authoritative_node_validator_reports_invalid_json_and_plan_only_on_stderr(
    tmp_path,
):
    condition_path = STAGE7_ROOT / "fixtures/m3/cases/one-floor-house/condition.json"
    malformed_path = tmp_path / "malformed.json"
    malformed_path.write_text("{", "utf8")
    wrong_plan = json.loads(FIXTURE_PLAN.read_text("utf8"))
    wrong_plan["condition_hash"] = "0" * 64
    wrong_plan_path = tmp_path / "wrong-plan.json"
    wrong_plan_path.write_bytes(pretty_json_bytes(wrong_plan))

    for plan_path in (malformed_path, wrong_plan_path):
        result = subprocess.run(
            ["node", str(VALIDATOR), str(condition_path), str(plan_path)],
            text=True,
            capture_output=True,
            check=False,
            cwd=REPOSITORY_ROOT,
        )
        assert result.returncode != 0
        assert result.stdout == ""
        assert result.stderr
