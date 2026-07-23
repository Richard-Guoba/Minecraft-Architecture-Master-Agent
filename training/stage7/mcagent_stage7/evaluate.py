from __future__ import annotations

import argparse
import hashlib
import math
from pathlib import Path
from typing import Any, Sequence

import torch
import torch.nn.functional as F

from .training_checkpoint import (
    TrainingCheckpointBinding,
    atomic_write_bytes,
    atomic_write_json,
    load_training_checkpoint,
    read_json,
    resolve_run_path,
)
from .training_data import (
    TOKEN_COUNT,
    TrainingError,
    TrainingPatchDataset,
    make_balanced_mask,
)
from .training_metrics import MetricAccumulator, gate2_result
from .training_paths import resolve_cli_root
from .voxel_model import TinyVoxelCompletionModel, predict_tokens


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Evaluate a voxel completion run on held-out patches."
    )
    parser.add_argument("--root", type=Path, default=Path(".local/training"))
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--seed", type=_uint32, default=7101)
    return parser


def evaluate_run(
    *,
    root: Path,
    run_id: str,
    device: str,
    seed: int,
) -> dict[str, Any]:
    if device == "cuda" and not torch.cuda.is_available():
        raise TrainingError("TRAINING_DEVICE_UNAVAILABLE", "cuda")
    run_path = resolve_run_path(root, run_id, create=False)
    metadata = read_json(
        run_path / "checkpoint.json",
        "CHECKPOINT_METADATA_INVALID",
    )
    if metadata.get("status") != "completed":
        raise TrainingError("EVALUATION_RUN_INCOMPLETE", run_id)
    binding = TrainingCheckpointBinding(
        run_id=run_id,
        target_steps=metadata.get("target_steps"),
        seed=metadata.get("seed"),
        device=metadata.get("device"),
        batch_size=metadata.get("batch_size"),
        learning_rate=metadata.get("learning_rate"),
        dataset_manifest_sha256=metadata.get("dataset_manifest_sha256"),
        split_sha256=metadata.get("split_sha256"),
        model_version=metadata.get("model_version"),
    )
    torch.manual_seed(seed)
    torch.use_deterministic_algorithms(True)
    torch.set_num_threads(1)
    evaluation_device = torch.device(device)
    trained = TinyVoxelCompletionModel().to(evaluation_device)
    load_training_checkpoint(
        root=root,
        binding=binding,
        model=trained,
        optimizer=None,
    )
    torch.manual_seed(7101)
    untrained = TinyVoxelCompletionModel().to(evaluation_device)
    validation = TrainingPatchDataset(root, split="validation", seed=seed)
    training = TrainingPatchDataset(root, split="train", seed=seed)
    prior = _training_prior(training)
    accumulators = {
        "trained": MetricAccumulator(),
        "untrained": MetricAccumulator(),
        "class_prior": MetricAccumulator(),
    }
    reconstruction: bytes | None = None
    trained.eval()
    untrained.eval()
    with torch.no_grad():
        for batch_index, start in enumerate(
            range(0, len(validation), binding.batch_size)
        ):
            stop = min(start + binding.batch_size, len(validation))
            targets = torch.stack(
                [validation[index] for index in range(start, stop)]
            )
            visible, mask = make_balanced_mask(
                targets,
                seed=_evaluation_seed(seed, batch_index),
            )
            targets = targets.to(evaluation_device)
            visible = visible.to(evaluation_device)
            mask = mask.to(evaluation_device)
            trained_predictions = _update_model_metrics(
                model=trained,
                targets=targets,
                visible=visible,
                mask=mask,
                accumulator=accumulators["trained"],
            )
            _update_model_metrics(
                model=untrained,
                targets=targets,
                visible=visible,
                mask=mask,
                accumulator=accumulators["untrained"],
            )
            prior_predictions = torch.full_like(
                targets,
                prior["semantic_token"],
            )
            if prior["occupancy_class"] == 0:
                prior_predictions.zero_()
            occupancy_targets = (targets != 0).long()
            semantic_mask = mask & (targets != 0)
            occupancy_loss = -torch.log(
                prior["occupancy_probabilities"][occupancy_targets[mask]]
            ).sum()
            semantic_loss = -torch.log(
                prior["semantic_probabilities"][
                    targets[semantic_mask] - 1
                ]
            ).sum()
            accumulators["class_prior"].update(
                targets=targets,
                predictions=prior_predictions,
                mask=mask,
                occupancy_loss_sum=float(occupancy_loss.cpu()),
                semantic_loss_sum=float(semantic_loss.cpu()),
            )
            if reconstruction is None:
                completed = torch.where(
                    mask,
                    trained_predictions,
                    targets,
                )
                reconstruction = (
                    completed[0].to("cpu", dtype=torch.uint8).numpy().tobytes()
                )
    metrics = {
        name: accumulator.summary()
        for name, accumulator in accumulators.items()
    }
    gate = gate2_result(
        metrics["trained"],
        metrics["untrained"],
        metrics["class_prior"],
    )
    report = {
        "source": "minecraft-architecture-training-evaluation-v1",
        "run_id": run_id,
        "seed": seed,
        "device": device,
        "metrics": metrics,
        "gate2": gate,
    }
    if reconstruction is None or len(reconstruction) != 32**3:
        raise TrainingError("EVALUATION_RECONSTRUCTION_INVALID", run_id)
    atomic_write_bytes(run_path / "reconstruction.bin", reconstruction)
    atomic_write_json(run_path / "evaluation.json", report)
    return report


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    device = (
        "cuda"
        if arguments.device == "auto" and torch.cuda.is_available()
        else "cpu"
        if arguments.device == "auto"
        else arguments.device
    )
    report = evaluate_run(
        root=resolve_cli_root(arguments.root),
        run_id=arguments.run_id,
        device=device,
        seed=arguments.seed,
    )
    print(f"run_id={arguments.run_id}")
    print(f"gate2_passed={str(report['gate2']['passed']).lower()}")
    print(
        "non_air_macro_f1="
        f"{report['metrics']['trained']['non_air_macro_f1']:.6f}"
    )
    print(
        "non_air_macro_iou="
        f"{report['metrics']['trained']['non_air_macro_iou']:.6f}"
    )
    return 0


def _update_model_metrics(
    *,
    model: TinyVoxelCompletionModel,
    targets: torch.Tensor,
    visible: torch.Tensor,
    mask: torch.Tensor,
    accumulator: MetricAccumulator,
) -> torch.Tensor:
    output = model(visible)
    predictions = predict_tokens(output)
    occupancy_targets = (targets != 0).long()
    occupancy_sum = F.cross_entropy(
        output.occupancy_logits.permute(0, 2, 3, 4, 1)[mask],
        occupancy_targets[mask],
        reduction="sum",
    )
    semantic_mask = mask & (targets != 0)
    semantic_sum = F.cross_entropy(
        output.semantic_logits.permute(0, 2, 3, 4, 1)[semantic_mask],
        targets[semantic_mask] - 1,
        reduction="sum",
    )
    accumulator.update(
        targets=targets,
        predictions=predictions,
        mask=mask,
        occupancy_loss_sum=float(occupancy_sum.cpu()),
        semantic_loss_sum=float(semantic_sum.cpu()),
    )
    return predictions


def _training_prior(dataset: TrainingPatchDataset) -> dict[str, Any]:
    occupancy = torch.ones(2, dtype=torch.float64)
    semantic = torch.ones(TOKEN_COUNT - 1, dtype=torch.float64)
    for sample in dataset.samples:
        occupancy[0] += sample.token_counts[0]
        occupancy[1] += sum(sample.token_counts[1:])
        semantic += torch.tensor(
            sample.token_counts[1:],
            dtype=torch.float64,
        )
    return {
        "occupancy_class": int(occupancy.argmax()),
        "semantic_token": int(semantic.argmax()) + 1,
        "occupancy_probabilities": (
            occupancy / occupancy.sum()
        ),
        "semantic_probabilities": semantic / semantic.sum(),
    }


def _evaluation_seed(seed: int, batch_index: int) -> int:
    digest = hashlib.sha256(
        f"training-evaluation-mask-v1:{seed}:{batch_index}".encode("ascii")
    ).digest()
    return int.from_bytes(digest[:4], "big")


def _uint32(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("expected UINT32") from error
    if not 0 <= parsed < 2**32:
        raise argparse.ArgumentTypeError("expected UINT32")
    return parsed


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except TrainingError as error:
        print(f"{error.code}: {error}", flush=True)
        raise SystemExit(1) from None
