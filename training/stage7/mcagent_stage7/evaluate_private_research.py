from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
import torch.nn.functional as functional

from .private_research import (
    PrivatePreparedDataset,
    PrivateResearchError,
    make_masked_batch,
    resolve_existing_private_run,
    run_private_preflight,
)
from .private_research_checkpoints import load_private_checkpoint
from .private_research_evaluation import (
    MetricAccumulator,
    build_class_prior,
    class_prior_nll_sum,
    derive_evaluation_seed,
    quality_gate,
)
from .private_research_model import TinyMaskedVoxelAutoencoder


EVALUATION_SOURCE = "stage7-private-research-evaluation-v1"
MODEL_NAME = "tiny-masked-voxel-autoencoder-v1"
TRAINING_ARTIFACTS = {
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
    _validate_training_artifacts(run_path, expected_steps)

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
        report_path.write_text(
            json.dumps(report, sort_keys=True, indent=2) + "\n",
            encoding="utf8",
        )
    except OSError as error:
        raise PrivateResearchError("EVALUATION_WRITE_FAILED", report_path.name) from error
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


def _validate_training_artifacts(run_path: Path, expected_steps: int) -> None:
    try:
        entries = list(run_path.iterdir())
    except OSError as error:
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "run directory") from error
    if any(entry.is_symlink() or not entry.is_file() for entry in entries):
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "entry type")
    names = {entry.name for entry in entries}
    if "evaluation.json" in names:
        raise PrivateResearchError("EVALUATION_EXISTS", "evaluation.json")
    if names != TRAINING_ARTIFACTS:
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "artifact set")
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
