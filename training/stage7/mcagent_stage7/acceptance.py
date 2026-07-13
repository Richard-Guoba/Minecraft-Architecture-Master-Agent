from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import verify_environment

from .contracts import (
    Stage7ContractError,
    canonical_json_bytes,
    sha256_bytes,
)
from .infer import InferenceResult, infer_condition
from .train_fixture import RunArtifacts, TrainConfig, train_fixture


ACCEPTANCE_SOURCE = "stage7-m3-fixture-acceptance-v1"
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
STAGE7_ROOT = Path(__file__).resolve().parents[1]
DATASET_V3_MANIFEST = (
    REPOSITORY_ROOT
    / "mc_templates"
    / "datasets"
    / "coarse_semantic_voxels"
    / "v3"
    / "manifest.json"
)
VALIDATE_PLAN = STAGE7_ROOT / "validate_plan.mjs"
_CONDITION_RELATIVE_PATH = Path("cases/one-floor-house/condition.json")
_PIPELINE_SCRIPT = """
import path from 'node:path';
import { runPipeline } from './src/pipeline.js';
const [outRoot, seedText, checkpoint] = process.argv.slice(1);
const stage7 = checkpoint ? {
  coarseVoxelMode: 'shadow',
  coarseVoxelProvider: 'python',
  coarseVoxelCheckpoint: checkpoint,
  coarseVoxelCheckpointManifest: path.join(path.dirname(checkpoint), 'checkpoint_manifest.json'),
  coarseVoxelPythonExecutable: process.env.STAGE7_PYTHON_EXECUTABLE
} : {};
const result = await runPipeline({
  prompt: 'Build a deterministic two-floor modern lakeside house with a courtyard, large glass frontage, and a water-edge deck.',
  mode: 'mock',
  mcVersion: '1.21',
  outRoot,
  cwd: process.cwd(),
  seed: Number(seedText),
  concepts: 0,
  critics: false,
  neuralRetrieval: false,
  ...stage7
});
console.log(JSON.stringify({
  blueprint_path: result.artifacts.blueprint,
  stage7_status: result.stage7?.status ?? 'off',
  stage7_training_scope: result.blueprint.stage7?.training_scope ?? null,
  stage7_fallback: result.blueprint.stage7?.fallback ?? null
}));
""".strip()


class AcceptanceError(RuntimeError):
    pass


@dataclass(frozen=True)
class AcceptanceConfig:
    fixture_root: Path
    output_root: Path
    seed: int
    steps: int
    code_revision: str | None = None


def run_acceptance(config: AcceptanceConfig) -> dict[str, Any]:
    config = _validated_config(config)
    gate = _read_closed_real_data_gate(DATASET_V3_MANIFEST)
    verify_environment.verify_cpu()
    code_revision = config.code_revision or _git_revision()
    fixture_manifest = _read_json_object(
        config.fixture_root / "manifest.json",
        "fixture manifest",
    )
    fixture_cases = fixture_manifest.get("cases")
    if (
        fixture_manifest.get("fixture_only") is not True
        or fixture_manifest.get("readiness_contribution") != 0
        or not isinstance(fixture_cases, list)
        or not fixture_cases
    ):
        raise AcceptanceError("fixture manifest is not a fixture-only M3 dataset")

    config.output_root.mkdir(parents=True, exist_ok=True)
    train_config = TrainConfig(
        fixture_root=config.fixture_root,
        seed=config.seed,
        steps=config.steps,
        learning_rate=1e-3,
        device="cpu",
        code_revision=code_revision,
    )
    first_run = train_fixture(train_config, config.output_root / "run-a")
    second_run = train_fixture(train_config, config.output_root / "run-b")
    training = _compare_training_runs(first_run, second_run)

    condition_path = config.fixture_root / _CONDITION_RELATIVE_PATH
    condition = _read_json_object(condition_path, "fixture condition")
    first_inference = infer_condition(
        first_run.checkpoint_path,
        first_run.manifest_path,
        condition,
    )
    second_inference = infer_condition(
        second_run.checkpoint_path,
        second_run.manifest_path,
        condition,
    )
    inference = _compare_inference_runs(first_inference, second_inference)
    first_plan_path = first_run.checkpoint_path.parent / "inference_plan.json"
    second_plan_path = second_run.checkpoint_path.parent / "inference_plan.json"
    first_plan_path.write_bytes(canonical_json_bytes(first_inference.plan))
    second_plan_path.write_bytes(canonical_json_bytes(second_inference.plan))

    node_executable = _node_executable()
    node_version = _node_version(node_executable)
    first_validation = _validate_plan(
        node_executable,
        condition_path,
        first_plan_path,
    )
    second_validation = _validate_plan(
        node_executable,
        condition_path,
        second_plan_path,
    )
    if first_validation != second_validation:
        raise AcceptanceError("Node plan validation results differ across runs")

    node_boundary = _run_node_boundary(
        node_executable=node_executable,
        output_root=config.output_root,
        seed=config.seed,
        checkpoint_path=first_run.checkpoint_path,
    )
    result = {
        "source": ACCEPTANCE_SOURCE,
        "schema_version": 1,
        "code_revision": code_revision,
        "cpu_smoke": "ok",
        "training_scope": "fixture-only",
        "fixture_only": True,
        "fixture_case_count": len(fixture_cases),
        "real_training_started": False,
        "dataset_v3_ready_for_m3_real_data": gate["ready_for_m3_real_data"],
        "dataset_v3_training_eligible_count": gate["training_eligible_count"],
        **training,
        **inference,
        "node_executable": Path(node_executable).name,
        "node_version": node_version,
        "node_schema_valid": True,
        "node_validation_count": 2,
        "node_schema_run_count": first_validation["run_count"],
        **node_boundary,
        "apply_mode_available": False,
    }
    acceptance_path = config.output_root / "acceptance.json"
    acceptance_path.write_bytes(canonical_json_bytes(result))
    return result


def _validated_config(config: AcceptanceConfig) -> AcceptanceConfig:
    if not isinstance(config, AcceptanceConfig):
        raise AcceptanceError("config must be AcceptanceConfig")
    if not isinstance(config.fixture_root, (str, Path)):
        raise AcceptanceError("fixture_root must be a path")
    if not isinstance(config.output_root, (str, Path)):
        raise AcceptanceError("output_root must be a path")
    if type(config.seed) is not int or not 0 <= config.seed < 2**32:
        raise AcceptanceError("seed must be an integer in 0..4294967295")
    if type(config.steps) is not int or config.steps <= 0:
        raise AcceptanceError("steps must be a positive integer")
    if config.code_revision is not None and (
        not isinstance(config.code_revision, str) or not config.code_revision.strip()
    ):
        raise AcceptanceError("code_revision must be a non-empty string when supplied")
    return AcceptanceConfig(
        fixture_root=Path(config.fixture_root).resolve(),
        output_root=Path(config.output_root).resolve(),
        seed=config.seed,
        steps=config.steps,
        code_revision=config.code_revision.strip() if config.code_revision else None,
    )


def _read_closed_real_data_gate(path: Path) -> dict[str, Any]:
    manifest = _read_json_object(path, "Dataset v3 manifest")
    ready = manifest.get("ready_for_m3_real_data")
    eligible = manifest.get("training_eligible_count")
    if ready is not False or type(eligible) is not int or eligible != 0:
        raise AcceptanceError(
            "Dataset v3 real-data gate must remain ready_for_m3_real_data=false "
            "and training_eligible_count=0"
        )
    return {
        "ready_for_m3_real_data": ready,
        "training_eligible_count": eligible,
    }


def _compare_training_runs(
    first: RunArtifacts,
    second: RunArtifacts,
) -> dict[str, Any]:
    first_parameters = _read_parameter_hashes(first.metrics_path)
    second_parameters = _read_parameter_hashes(second.metrics_path)
    comparisons = (
        ("checkpoint SHA-256", first.checkpoint_sha256, second.checkpoint_sha256),
        ("manifest SHA-256", first.manifest_sha256, second.manifest_sha256),
        ("metrics SHA-256", first.metrics_sha256, second.metrics_sha256),
        ("parameter hashes", first_parameters, second_parameters),
        ("final loss", first.final_loss, second.final_loss),
    )
    for label, first_value, second_value in comparisons:
        if first_value != second_value:
            raise AcceptanceError(f"cross-run training {label} mismatch")
    return {
        "checkpoint_reproducible": True,
        "checkpoint_manifest_reproducible": True,
        "metrics_reproducible": True,
        "parameter_hashes_reproducible": True,
        "final_loss_reproducible": True,
        "checkpoint_sha256": first.checkpoint_sha256,
        "checkpoint_manifest_sha256": first.manifest_sha256,
        "metrics_sha256": first.metrics_sha256,
        "parameter_sha256": first_parameters[-1],
        "parameter_hash_sequence_sha256": sha256_bytes(
            canonical_json_bytes(list(first_parameters))
        ),
        "training_step_count": len(first_parameters),
        "final_loss": first.final_loss,
    }


def _read_parameter_hashes(path: Path) -> tuple[str, ...]:
    try:
        lines = Path(path).read_text("utf8").splitlines()
    except (OSError, UnicodeError) as error:
        raise AcceptanceError("training metrics cannot be read") from error
    hashes: list[str] = []
    for index, line in enumerate(lines, start=1):
        try:
            metric = json.loads(line)
        except json.JSONDecodeError as error:
            raise AcceptanceError("training metrics contain invalid JSON") from error
        parameter_hash = metric.get("parameter_sha256") if isinstance(metric, dict) else None
        if (
            not isinstance(parameter_hash, str)
            or len(parameter_hash) != 64
            or any(character not in "0123456789abcdef" for character in parameter_hash)
            or metric.get("step") != index
        ):
            raise AcceptanceError("training metrics contain invalid parameter hashes")
        hashes.append(parameter_hash)
    if not hashes:
        raise AcceptanceError("training metrics contain no parameter hashes")
    return tuple(hashes)


def _compare_inference_runs(
    first: InferenceResult,
    second: InferenceResult,
) -> dict[str, Any]:
    if first.input_sha256 != second.input_sha256:
        raise AcceptanceError("cross-run inference input SHA-256 mismatch")
    if first.output_sha256 != second.output_sha256:
        raise AcceptanceError("cross-run inference output SHA-256 mismatch")
    if canonical_json_bytes(first.plan) != canonical_json_bytes(second.plan):
        raise AcceptanceError("cross-run inference canonical plan mismatch")
    return {
        "inference_reproducible": True,
        "inference_input_sha256": first.input_sha256,
        "inference_output_sha256": first.output_sha256,
        "canonical_plan_sha256": sha256_bytes(canonical_json_bytes(first.plan)),
    }


def _validate_plan(
    node_executable: str,
    condition_path: Path,
    plan_path: Path,
) -> dict[str, Any]:
    completed = _run_process(
        [
            node_executable,
            str(VALIDATE_PLAN),
            str(condition_path),
            str(plan_path),
        ],
        cwd=REPOSITORY_ROOT,
        timeout=30,
    )
    return _parse_node_validation(completed)


def _parse_node_validation(
    completed: subprocess.CompletedProcess[Any],
) -> dict[str, Any]:
    stdout = _process_text(completed.stdout, "Node plan validation stdout")
    stderr = _process_text(completed.stderr, "Node plan validation stderr")
    if completed.returncode != 0:
        detail = stderr.strip() or stdout.strip() or f"exit {completed.returncode}"
        raise AcceptanceError(f"Node plan validation failed: {detail}")
    try:
        value = json.loads(stdout)
    except json.JSONDecodeError as error:
        raise AcceptanceError("Node plan validation returned invalid JSON") from error
    if (
        not isinstance(value, dict)
        or value.get("ok") is not True
        or type(value.get("run_count")) is not int
        or value["run_count"] < 0
    ):
        raise AcceptanceError("Node plan validation did not return ok true")
    return value


def _run_node_boundary(
    *,
    node_executable: str,
    output_root: Path,
    seed: int,
    checkpoint_path: Path,
) -> dict[str, Any]:
    baseline = _run_node_build(
        node_executable=node_executable,
        output_root=output_root / "node-rule-only",
        seed=seed,
        checkpoint_path=None,
    )
    shadow = _run_node_build(
        node_executable=node_executable,
        output_root=output_root / "node-python-shadow",
        seed=seed,
        checkpoint_path=checkpoint_path,
    )
    baseline_blueprint = _read_json_object(
        Path(baseline["blueprint_path"]),
        "rule-only blueprint",
    )
    shadow_blueprint = _read_json_object(
        Path(shadow["blueprint_path"]),
        "Python-shadow blueprint",
    )
    baseline_operations = baseline_blueprint.get("operations")
    shadow_operations = shadow_blueprint.get("operations")
    operation_evidence = _compare_primary_operations(
        baseline_operations,
        shadow_operations,
    )
    if shadow.get("stage7_status") not in {"converted", "rejected"}:
        raise AcceptanceError("Python shadow build returned an invalid Stage 7 status")
    if shadow.get("stage7_training_scope") != "fixture-only":
        raise AcceptanceError("Python shadow build lost fixture-only checkpoint scope")
    return {
        **operation_evidence,
        "shadow_status": shadow["stage7_status"],
        "shadow_fallback": shadow.get("stage7_fallback"),
    }


def _run_node_build(
    *,
    node_executable: str,
    output_root: Path,
    seed: int,
    checkpoint_path: Path | None,
) -> dict[str, Any]:
    output_root.mkdir(parents=True, exist_ok=True)
    command = [
        node_executable,
        "--input-type=module",
        "--eval",
        _PIPELINE_SCRIPT,
        str(output_root),
        str(seed),
        str(checkpoint_path) if checkpoint_path is not None else "",
    ]
    environment = os.environ.copy()
    environment["STAGE7_PYTHON_EXECUTABLE"] = sys.executable
    completed = _run_process(
        command,
        cwd=REPOSITORY_ROOT,
        timeout=120,
        environment=environment,
    )
    stdout = _process_text(completed.stdout, "Node build stdout")
    stderr = _process_text(completed.stderr, "Node build stderr")
    if completed.returncode != 0:
        detail = stderr.strip() or stdout.strip() or f"exit {completed.returncode}"
        raise AcceptanceError(f"Node build failed: {detail}")
    try:
        value = json.loads(stdout)
    except json.JSONDecodeError as error:
        raise AcceptanceError("Node build returned invalid JSON") from error
    if not isinstance(value, dict) or not isinstance(value.get("blueprint_path"), str):
        raise AcceptanceError("Node build returned an invalid result")
    return value


def _compare_primary_operations(
    baseline_operations: Any,
    shadow_operations: Any,
) -> dict[str, Any]:
    if not isinstance(baseline_operations, list) or not isinstance(shadow_operations, list):
        raise AcceptanceError("Node blueprints must contain primary operations arrays")
    if baseline_operations != shadow_operations:
        raise AcceptanceError("Python shadow changed ordered primary operations")
    operations_bytes = canonical_json_bytes(baseline_operations)
    return {
        "shadow_operation_parity": True,
        "primary_geometry_changed": False,
        "primary_operation_count": len(baseline_operations),
        "primary_operations_sha256": sha256_bytes(operations_bytes),
    }


def _node_executable() -> str:
    executable = shutil.which("node")
    if executable is None:
        raise AcceptanceError("repository Node runtime is unavailable")
    return executable


def _node_version(node_executable: str) -> str:
    completed = _run_process(
        [node_executable, "--version"],
        cwd=REPOSITORY_ROOT,
        timeout=10,
    )
    stdout = _process_text(completed.stdout, "Node version stdout").strip()
    stderr = _process_text(completed.stderr, "Node version stderr").strip()
    if completed.returncode != 0 or not stdout.startswith("v"):
        raise AcceptanceError(
            f"Node version check failed: {stderr or stdout or completed.returncode}"
        )
    return stdout.removeprefix("v")


def _git_revision() -> str:
    environment = os.environ.copy()
    environment["GIT_TERMINAL_PROMPT"] = "0"
    completed = _run_process(
        ["git", "rev-parse", "HEAD"],
        cwd=REPOSITORY_ROOT,
        timeout=10,
        environment=environment,
    )
    stdout = _process_text(completed.stdout, "git revision stdout").strip()
    stderr = _process_text(completed.stderr, "git revision stderr").strip()
    if (
        completed.returncode != 0
        or len(stdout) not in {40, 64}
        or any(character not in "0123456789abcdef" for character in stdout)
    ):
        raise AcceptanceError(
            f"git rev-parse HEAD failed: {stderr or stdout or completed.returncode}"
        )
    return stdout


def _run_process(
    command: list[str],
    *,
    cwd: Path,
    timeout: int,
    environment: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[bytes]:
    try:
        return subprocess.run(
            command,
            cwd=cwd,
            env=environment,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=timeout,
            shell=False,
        )
    except subprocess.TimeoutExpired as error:
        raise AcceptanceError(
            f"subprocess timed out after {timeout} seconds: {command[0]}"
        ) from error
    except OSError as error:
        raise AcceptanceError(f"subprocess could not start: {command[0]}") from error


def _process_text(value: Any, label: str) -> str:
    if isinstance(value, str):
        return value
    if not isinstance(value, bytes):
        raise AcceptanceError(f"{label} must be UTF-8 text")
    try:
        return value.decode("utf8", errors="strict")
    except UnicodeDecodeError as error:
        raise AcceptanceError(f"{label} is not valid UTF-8") from error


def _read_json_object(path: Path, label: str) -> dict[str, Any]:
    try:
        raw = Path(path).read_text("utf8")
        value = json.loads(raw)
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise AcceptanceError(f"{label} cannot be read as JSON") from error
    if not isinstance(value, dict):
        raise AcceptanceError(f"{label} must be a JSON object")
    return value


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run Stage 7 M3 fixture-only CPU acceptance"
    )
    parser.add_argument("--fixture-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--steps", type=int, required=True)
    parser.add_argument("--code-revision")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    try:
        result = run_acceptance(AcceptanceConfig(
            fixture_root=arguments.fixture_root,
            output_root=arguments.output,
            seed=arguments.seed,
            steps=arguments.steps,
            code_revision=arguments.code_revision,
        ))
    except (AcceptanceError, Stage7ContractError, ValueError, RuntimeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    sys.stdout.buffer.write(canonical_json_bytes(result) + b"\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
