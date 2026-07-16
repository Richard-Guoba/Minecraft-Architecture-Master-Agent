from __future__ import annotations

import argparse
import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Sequence

import torch
import torch.nn.functional as functional

from .private_research import (
    DEFAULT_REPO_ROOT,
    PrivatePreparedDataset,
    PrivateResearchError,
    make_masked_batch,
    resolve_existing_private_run,
    resolve_private_cli_paths,
    run_private_preflight,
)
from .private_research_checkpoints import (
    PRIVATE_CHECKPOINT_SOURCE,
    PRIVATE_CHECKPOINT_SOURCE_V2,
    load_private_checkpoint,
)
from .private_research_evaluation import (
    MetricAccumulator,
    build_class_prior,
    class_prior_nll_sum,
    derive_evaluation_seed,
    quality_gate,
)
from .private_research_model import TinyMaskedVoxelAutoencoder
from .private_research_runtime import (
    atomic_write_bytes,
    paths_for_run,
    read_pause_request,
    read_public_progress,
    read_run_state,
)
from .private_research_snapshots import load_latest_resume_snapshot


EVALUATION_SOURCE = "stage7-private-research-evaluation-v1"
MODEL_NAME = "tiny-masked-voxel-autoencoder-v1"
TRAINING_ARTIFACTS_V1 = {
    "metrics.jsonl",
    "reconstruction.bin",
    "checkpoint.pt",
    "checkpoint_manifest.json",
}


@dataclass(frozen=True)
class PrivateEvaluationConfig:
    root: Path
    repo_root: Path
    run_id: str
    seed: int = 7101
    mask_repeats: int = 5
    mask_ratio: float = 0.25
    device: str = "cpu"


@dataclass(frozen=True)
class PrivateEvaluationArtifacts:
    report_path: Path
    report: dict[str, Any]
    quality_gate_passed: bool


def evaluate_private_research(
    config: PrivateEvaluationConfig,
) -> PrivateEvaluationArtifacts:
    _validate_config(config)
    torch.manual_seed(config.seed)
    torch.use_deterministic_algorithms(True)
    torch.set_num_threads(1)
    preflight = run_private_preflight(
        root=Path(config.root),
        repo_root=Path(config.repo_root),
    )
    run_path = resolve_existing_private_run(
        root=preflight.root,
        repo_root=Path(config.repo_root),
        run_id=config.run_id,
    )
    report_path = run_path / "evaluation.json"
    if report_path.exists() or report_path.is_symlink():
        raise PrivateResearchError("EVALUATION_EXISTS", report_path.name)
    manifest_path = run_path / "checkpoint_manifest.json"
    checkpoint_path = run_path / "checkpoint.pt"
    loaded = load_private_checkpoint(
        checkpoint_path=checkpoint_path,
        manifest_path=manifest_path,
        preflight=preflight,
        device=config.device,
    )
    if loaded.manifest["seed"] != config.seed or loaded.manifest["device"] != "cpu":
        raise PrivateResearchError(
            "CHECKPOINT_MANIFEST_INVALID", "evaluation seed or device"
        )
    expected_steps = loaded.manifest["config"].get("steps")
    if (
        isinstance(expected_steps, bool)
        or not isinstance(expected_steps, int)
        or expected_steps <= 0
    ):
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", "steps")
    _validate_training_artifacts(
        run_path,
        expected_steps=expected_steps,
        manifest=loaded.manifest,
    )

    train_dataset = PrivatePreparedDataset(
        root=preflight.root,
        split="train",
        seed=config.seed,
        repo_root=Path(config.repo_root),
    )
    validation_dataset = PrivatePreparedDataset(
        root=preflight.root,
        split="validation",
        seed=config.seed,
        repo_root=Path(config.repo_root),
    )
    if len(train_dataset) != 15 or len(validation_dataset) != 7:
        raise PrivateResearchError(
            "EVALUATION_SPLIT_INVALID", "expected 15 train and 7 validation"
        )
    prior = build_class_prior(
        train_dataset[index][0] for index in range(len(train_dataset))
    )
    prior_prediction = int(prior.argmax().item())

    torch.manual_seed(config.seed)
    untrained = TinyMaskedVoxelAutoencoder().to(torch.device(config.device)).eval()
    trained_accumulator = MetricAccumulator()
    untrained_accumulator = MetricAccumulator()
    prior_accumulator = MetricAccumulator()
    completed = 0
    with torch.no_grad():
        for validation_index in range(len(validation_dataset)):
            target = (
                validation_dataset[validation_index][0]
                .unsqueeze(0)
                .to(torch.device(config.device))
            )
            for repeat_index in range(config.mask_repeats):
                mask_seed = derive_evaluation_seed(
                    config.seed,
                    validation_index,
                    repeat_index,
                )
                visible, mask = make_masked_batch(
                    target.to("cpu"),
                    seed=mask_seed,
                    ratio=config.mask_ratio,
                )
                visible = visible.to(torch.device(config.device))
                mask = mask.to(torch.device(config.device))
                _update_model(
                    trained_accumulator,
                    loaded.model,
                    target,
                    visible,
                    mask,
                )
                _update_model(
                    untrained_accumulator,
                    untrained,
                    target,
                    visible,
                    mask,
                )
                prior_predictions = torch.full_like(target, prior_prediction)
                prior_accumulator.update(
                    targets=target,
                    predictions=prior_predictions,
                    mask=mask,
                    nll_sum=class_prior_nll_sum(
                        prior,
                        target.to("cpu"),
                        mask.to("cpu"),
                    ),
                )
                completed += 1
    if completed != 35:
        raise PrivateResearchError("EVALUATION_INCOMPLETE", str(completed))

    metrics = {
        "trained": trained_accumulator.summary(),
        "untrained": untrained_accumulator.summary(),
        "class_prior": prior_accumulator.summary(),
    }
    gate = quality_gate(
        metrics["trained"],
        metrics["untrained"],
        metrics["class_prior"],
    )
    postflight = run_private_preflight(
        root=preflight.root,
        repo_root=Path(config.repo_root),
    )
    report = {
        "source": EVALUATION_SOURCE,
        "schema_version": 1,
        "training_scope": "private-research-only",
        "distribution": "prohibited",
        "private_research_only": True,
        "model_name": MODEL_NAME,
        "checkpoint_file": checkpoint_path.name,
        "checkpoint_sha256": loaded.checkpoint_sha256,
        "prepared_manifest_sha256": postflight.prepared_manifest_sha256,
        "split_sha256": postflight.split_sha256,
        "evaluation_config": {
            "device": config.device,
            "seed": config.seed,
            "mask_ratio": config.mask_ratio,
            "mask_repeats": config.mask_repeats,
            "evaluated_case_count": len(validation_dataset),
            "completed_evaluations": completed,
        },
        "metrics": metrics,
        "quality_gate": gate,
        "finite_and_complete": True,
        "dataset_hashes": postflight.dataset_hashes,
        "dataset_v3_gate": postflight.dataset_v3_gate,
    }
    try:
        atomic_write_bytes(
            report_path,
            (json.dumps(report, sort_keys=True, indent=2) + "\n").encode("utf8"),
        )
    except PrivateResearchError as error:
        raise PrivateResearchError("EVALUATION_WRITE_FAILED", report_path.name) from error
    _validate_training_artifacts(
        run_path,
        expected_steps=expected_steps,
        manifest=loaded.manifest,
        allow_evaluation=True,
    )
    run_private_preflight(
        root=preflight.root,
        repo_root=Path(config.repo_root),
    )
    return PrivateEvaluationArtifacts(
        report_path=report_path,
        report=report,
        quality_gate_passed=gate["passed"],
    )


def _validate_config(config: PrivateEvaluationConfig) -> None:
    if not isinstance(config, PrivateEvaluationConfig):
        raise PrivateResearchError("EVALUATION_CONFIG_INVALID", "config")
    if config.device != "cpu" or config.seed != 7101:
        raise PrivateResearchError("EVALUATION_CONFIG_INVALID", "device or seed")
    if config.mask_repeats != 5 or config.mask_ratio != 0.25:
        raise PrivateResearchError("EVALUATION_CONFIG_INVALID", "mask protocol")


def _detect_run_schema(manifest_path: Path) -> int:
    path = Path(manifest_path)
    if path.is_symlink() or not path.is_file():
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", path.name)
    try:
        manifest = json.loads(path.read_text("utf8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", path.name) from error
    if not isinstance(manifest, dict):
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", path.name)
    pair = (manifest.get("source"), manifest.get("schema_version"))
    if pair == (PRIVATE_CHECKPOINT_SOURCE, 1):
        return 1
    if pair == (PRIVATE_CHECKPOINT_SOURCE_V2, 2):
        return 2
    raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", "source/schema")


def _validate_training_artifacts(
    run_path: Path,
    expected_steps: int,
    manifest: dict[str, Any],
    *,
    allow_evaluation: bool = False,
) -> None:
    pair = (manifest.get("source"), manifest.get("schema_version"))
    if pair == (PRIVATE_CHECKPOINT_SOURCE, 1):
        _validate_v1_training_artifacts(
            run_path,
            expected_steps=expected_steps,
            allow_evaluation=allow_evaluation,
        )
        return
    if pair == (PRIVATE_CHECKPOINT_SOURCE_V2, 2):
        _validate_v2_training_artifacts(
            run_path,
            expected_steps=expected_steps,
            manifest=manifest,
            allow_evaluation=allow_evaluation,
        )
        return
    raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", "source/schema")


def _validate_v1_training_artifacts(
    run_path: Path,
    *,
    expected_steps: int,
    allow_evaluation: bool,
) -> None:
    try:
        entries = list(run_path.iterdir())
    except OSError as error:
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "run directory") from error
    if any(entry.is_symlink() or not entry.is_file() for entry in entries):
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "entry type")
    names = {entry.name for entry in entries}
    if "evaluation.json" in names and not allow_evaluation:
        raise PrivateResearchError("EVALUATION_EXISTS", "evaluation.json")
    expected = set(TRAINING_ARTIFACTS_V1)
    if allow_evaluation:
        expected.add("evaluation.json")
    if names != expected:
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "artifact set")
    _validate_metrics_and_reconstruction(
        run_path,
        expected_steps=expected_steps,
        require_canonical_metrics=False,
    )


def _validate_v2_training_artifacts(
    run_path: Path,
    *,
    expected_steps: int,
    manifest: dict[str, Any],
    allow_evaluation: bool,
) -> None:
    if (
        manifest.get("source") != PRIVATE_CHECKPOINT_SOURCE_V2
        or manifest.get("schema_version") != 2
        or manifest.get("completed_steps") != expected_steps
    ):
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", "v2 completion")
    declared = manifest.get("artifact_inventory")
    if (
        not isinstance(declared, list)
        or any(not isinstance(item, str) for item in declared)
        or declared != sorted(set(declared))
    ):
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "declared inventory")
    for item in declared:
        relative = PurePosixPath(item)
        if (
            not item
            or "\\" in item
            or relative.is_absolute()
            or ".." in relative.parts
            or relative.as_posix() != item
        ):
            raise PrivateResearchError("RUN_ARTIFACT_INVALID", "declared path")
    runtime_path = run_path / ".runtime"
    if runtime_path.is_symlink() or not runtime_path.is_dir():
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "runtime directory")
    actual = _recursive_regular_inventory(run_path)
    expected_inventory = set(declared)
    if allow_evaluation:
        expected_inventory.add("evaluation.json")
    if actual != expected_inventory:
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "artifact inventory")
    if any(name.endswith(".tmp") for name in actual):
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "temporary artifact")
    paths = paths_for_run(run_path)
    state = read_run_state(paths)
    if (
        state.status != "completed"
        or state.completed_steps != expected_steps
        or state.snapshot_steps != expected_steps
        or state.target_steps != expected_steps
    ):
        raise PrivateResearchError("RUN_NOT_COMPLETED", state.status)
    snapshot = load_latest_resume_snapshot(
        paths=paths,
        expected_binding=state.binding,
    )
    if snapshot.completed_steps != expected_steps:
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "terminal snapshot")
    if ".runtime/pause-request.json" in declared:
        request = read_pause_request(paths)
        if (
            request["request_id"] != request["acknowledged_id"]
            or request["acknowledged_state"] != "paused"
            or request["acknowledged_id"] != state.pause_acknowledged_id
        ):
            raise PrivateResearchError("RUN_ARTIFACT_INVALID", "pause request")
    for file_field, hash_field in (
        ("checkpoint_file", "checkpoint_sha256"),
        ("metrics_file", "metrics_sha256"),
        ("reconstruction_file", "reconstruction_sha256"),
    ):
        relative = manifest.get(file_field)
        expected_hash = manifest.get(hash_field)
        if (
            not isinstance(relative, str)
            or not isinstance(expected_hash, str)
            or len(expected_hash) != 64
        ):
            raise PrivateResearchError("RUN_ARTIFACT_INVALID", hash_field)
        path = run_path / relative
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected_hash:
            raise PrivateResearchError("RUN_ARTIFACT_INVALID", hash_field)
    _validate_metrics_and_reconstruction(
        run_path,
        expected_steps=expected_steps,
        require_canonical_metrics=True,
    )
    public_progress = read_public_progress(paths)
    if (
        public_progress["state"] != "completed"
        or public_progress["completed_steps"] != expected_steps
        or public_progress["target_steps"] != expected_steps
    ):
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "completed progress")


def _recursive_regular_inventory(run_path: Path) -> set[str]:
    result: set[str] = set()
    try:
        entries = list(run_path.rglob("*"))
    except OSError as error:
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "run directory") from error
    for entry in entries:
        if entry.is_symlink():
            raise PrivateResearchError("RUN_ARTIFACT_INVALID", "symbolic link")
        if entry.is_dir():
            if entry != run_path / ".runtime":
                raise PrivateResearchError("RUN_ARTIFACT_INVALID", "nested directory")
            continue
        if not entry.is_file():
            raise PrivateResearchError("RUN_ARTIFACT_INVALID", "entry type")
        result.add(entry.relative_to(run_path).as_posix())
    return result


def _validate_metrics_and_reconstruction(
    run_path: Path,
    *,
    expected_steps: int,
    require_canonical_metrics: bool,
) -> None:
    try:
        reconstruction_size = (run_path / "reconstruction.bin").stat().st_size
        lines = (run_path / "metrics.jsonl").read_text("utf8").splitlines()
    except (OSError, UnicodeDecodeError) as error:
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "artifact read") from error
    if reconstruction_size != 64**3:
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "reconstruction size")
    if len(lines) != expected_steps:
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "metrics count")
    for index, line in enumerate(lines, start=1):
        try:
            metric = json.loads(line)
        except json.JSONDecodeError as error:
            raise PrivateResearchError("RUN_ARTIFACT_INVALID", "metrics JSON") from error
        if (
            metric.get("step") != index
            or set(metric) != {"step", "masked_reconstruction_loss"}
            or not isinstance(metric["masked_reconstruction_loss"], (int, float))
            or isinstance(metric["masked_reconstruction_loss"], bool)
            or not math.isfinite(float(metric["masked_reconstruction_loss"]))
        ):
            raise PrivateResearchError("RUN_ARTIFACT_INVALID", "metrics row")
        if require_canonical_metrics:
            canonical = json.dumps(metric, sort_keys=True, separators=(",", ":"))
            if line != canonical:
                raise PrivateResearchError("RUN_ARTIFACT_INVALID", "metrics canonical")


def _update_model(
    accumulator: MetricAccumulator,
    model: TinyMaskedVoxelAutoencoder,
    targets: torch.Tensor,
    visible: torch.Tensor,
    mask: torch.Tensor,
) -> None:
    logits = model(visible)
    masked_logits = logits.permute(0, 2, 3, 4, 1)[mask]
    masked_targets = targets[mask]
    nll_sum = float(
        functional.cross_entropy(
            masked_logits,
            masked_targets,
            reduction="sum",
        ).item()
    )
    predictions = logits.argmax(dim=1)
    accumulator.update(
        targets=targets,
        predictions=predictions,
        mask=mask,
        nll_sum=nll_sum,
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Evaluate the local-only Stage 7 private-research model"
    )
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--private-research-only", action="store_true")
    parser.add_argument("--metadata-only", action="store_true")
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    parser.add_argument("--seed", type=int, default=7101)
    parser.add_argument("--mask-repeats", type=int, default=5)
    parser.add_argument("--mask-ratio", type=float, default=0.25)
    parser.add_argument("--device", choices=("cpu",), default="cpu")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    arguments = parser.parse_args(argv)
    if not arguments.private_research_only:
        parser.error("--private-research-only acknowledgement is required")
    if not arguments.metadata_only:
        parser.error("--metadata-only is required")
    private_root, repository = resolve_private_cli_paths(
        root=arguments.root,
        repo_root=arguments.repo_root,
    )
    try:
        artifacts = evaluate_private_research(
            PrivateEvaluationConfig(
                root=private_root,
                repo_root=repository,
                run_id=arguments.run_id,
                seed=arguments.seed,
                mask_repeats=arguments.mask_repeats,
                mask_ratio=arguments.mask_ratio,
                device=arguments.device,
            )
        )
    except PrivateResearchError as error:
        parser.error(error.code)
    print(f"training_scope: {artifacts.report['training_scope']}")
    print(f"distribution: {artifacts.report['distribution']}")
    print("evaluation_complete: true")
    print(f"quality_gate_passed: {str(artifacts.quality_gate_passed).lower()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
