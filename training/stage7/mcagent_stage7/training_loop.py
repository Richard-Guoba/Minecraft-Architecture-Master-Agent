from __future__ import annotations

import hashlib
import json
import math
import os
import random
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn.functional as F

from .training_checkpoint import (
    TrainingCheckpointBinding,
    atomic_write_json,
    dataset_binding_hashes,
    load_training_checkpoint,
    resolve_run_path,
    save_training_checkpoint,
    validate_run_id,
)
from .training_metrics import MetricAccumulator, gate1_result
from .training_data import (
    TrainingError,
    TrainingPatchDataset,
    make_balanced_mask,
)
from .voxel_model import (
    TinyVoxelCompletionModel,
    predict_tokens,
    voxel_loss,
)


@dataclass(frozen=True)
class TrainingConfig:
    root: Path
    run_id: str
    steps: int
    batch_size: int = 2
    learning_rate: float = 0.001
    device: str = "cpu"
    seed: int = 7101
    tiny_overfit: bool = False

    def __post_init__(self) -> None:
        validate_run_id(self.run_id)
        if type(self.steps) is not int or self.steps <= 0:
            raise TrainingError("TRAINING_CONFIG_INVALID", "steps")
        if type(self.batch_size) is not int or self.batch_size <= 0:
            raise TrainingError("TRAINING_CONFIG_INVALID", "batch_size")
        if (
            isinstance(self.learning_rate, bool)
            or not isinstance(self.learning_rate, (int, float))
            or not math.isfinite(float(self.learning_rate))
            or float(self.learning_rate) <= 0.0
        ):
            raise TrainingError("TRAINING_CONFIG_INVALID", "learning_rate")
        if self.device not in {"cpu", "cuda"}:
            raise TrainingError("TRAINING_CONFIG_INVALID", "device")
        if type(self.seed) is not int or not 0 <= self.seed < 2**32:
            raise TrainingError("TRAINING_CONFIG_INVALID", "seed")
        if type(self.tiny_overfit) is not bool:
            raise TrainingError("TRAINING_CONFIG_INVALID", "tiny_overfit")


@dataclass(frozen=True)
class TrainingRunResult:
    run_path: Path
    completed_steps: int
    target_steps: int
    status: str


def train_model(
    config: TrainingConfig,
    *,
    after_step: Callable[[int], None] | None = None,
) -> TrainingRunResult:
    if not isinstance(config, TrainingConfig):
        raise TrainingError("TRAINING_CONFIG_INVALID", "type")
    if config.device == "cuda" and not torch.cuda.is_available():
        raise TrainingError("TRAINING_DEVICE_UNAVAILABLE", "cuda")
    _configure_determinism(config.seed)
    dataset = TrainingPatchDataset(
        Path(config.root),
        split="train",
        seed=config.seed,
    )
    manifest_hash, split_hash = dataset_binding_hashes(config.root)
    binding = TrainingCheckpointBinding(
        run_id=config.run_id,
        target_steps=config.steps,
        seed=config.seed,
        device=config.device,
        batch_size=config.batch_size,
        learning_rate=float(config.learning_rate),
        dataset_manifest_sha256=manifest_hash,
        split_sha256=split_hash,
    )
    run_path = resolve_run_path(config.root, config.run_id, create=True)
    checkpoint_path = run_path / "checkpoint.pt"
    metadata_path = run_path / "checkpoint.json"
    if checkpoint_path.exists() != metadata_path.exists():
        raise TrainingError("CHECKPOINT_INCOMPLETE", config.run_id)

    device = torch.device(config.device)
    model = TinyVoxelCompletionModel().to(device)
    optimizer = torch.optim.Adam(
        model.parameters(),
        lr=float(config.learning_rate),
    )
    completed_steps = 0
    status = "running"
    if checkpoint_path.exists():
        loaded = load_training_checkpoint(
            root=config.root,
            binding=binding,
            model=model,
            optimizer=optimizer,
        )
        completed_steps = loaded.completed_steps
        status = loaded.status
        _optimizer_to(optimizer, device)
    metrics_path = run_path / "metrics.jsonl"
    _reconcile_metrics(metrics_path, completed_steps)
    if status == "completed":
        return TrainingRunResult(
            run_path=run_path,
            completed_steps=completed_steps,
            target_steps=config.steps,
            status=status,
        )
    if status == "failed":
        raise TrainingError("TRAINING_RUN_FAILED", config.run_id)

    model.train()
    for step in range(completed_steps + 1, config.steps + 1):
        targets = _training_batch(dataset, config, step)
        visible, mask = make_balanced_mask(
            targets,
            seed=_step_seed(config.seed, step),
        )
        targets = targets.to(device)
        visible = visible.to(device)
        mask = mask.to(device)
        optimizer.zero_grad(set_to_none=True)
        losses = voxel_loss(model(visible), targets, mask)
        losses.total.backward()
        optimizer.step()
        _append_metric(
            metrics_path,
            {
                "step": step,
                "loss_total": float(losses.total.detach().cpu()),
                "loss_occupancy": float(losses.occupancy.detach().cpu()),
                "loss_semantic": float(losses.semantic.detach().cpu()),
            },
        )
        gate = None
        if config.tiny_overfit and (
            step % 100 == 0 or step == config.steps
        ):
            gate = _evaluate_tiny_gate(
                model=model,
                dataset=dataset,
                config=config,
                step=step,
                device=device,
            )
            atomic_write_json(run_path / "gate1.json", gate)
        if gate is not None and gate["passed"]:
            status = "completed"
        elif config.tiny_overfit and step == config.steps:
            status = "failed"
        else:
            status = "completed" if step == config.steps else "running"
        save_training_checkpoint(
            root=config.root,
            binding=binding,
            model=model,
            optimizer=optimizer,
            completed_steps=step,
            status=status,
        )
        completed_steps = step
        if after_step is not None:
            after_step(step)
        if gate is not None and gate["passed"]:
            break
        if status == "failed":
            raise TrainingError("GATE1_FAILED", config.run_id)

    return TrainingRunResult(
        run_path=run_path,
        completed_steps=completed_steps,
        target_steps=config.steps,
        status=status,
    )


def _training_batch(
    dataset: TrainingPatchDataset,
    config: TrainingConfig,
    step: int,
) -> torch.Tensor:
    pool_size = min(4, len(dataset)) if config.tiny_overfit else len(dataset)
    offset = config.seed % pool_size
    start = offset + (step - 1) * config.batch_size
    indices = [
        (start + index) % pool_size
        for index in range(config.batch_size)
    ]
    return torch.stack([dataset[index] for index in indices])


def _configure_determinism(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.use_deterministic_algorithms(True)
    torch.set_num_threads(1)


def _step_seed(seed: int, step: int) -> int:
    digest = hashlib.sha256(
        f"training-step-mask-v1:{seed}:{step}".encode("ascii")
    ).digest()
    return int.from_bytes(digest[:4], "big")


def _append_metric(path: Path, value: dict[str, Any]) -> None:
    payload = (
        json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n"
    ).encode("utf8")
    descriptor = os.open(
        path,
        os.O_WRONLY | os.O_CREAT | os.O_APPEND,
        0o600,
    )
    try:
        os.write(descriptor, payload)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _reconcile_metrics(path: Path, completed_steps: int) -> None:
    if not path.exists():
        if completed_steps != 0:
            raise TrainingError("TRAINING_METRICS_INCOMPLETE", "missing")
        return
    try:
        records = [
            json.loads(line)
            for line in path.read_text(encoding="utf8").splitlines()
            if line
        ]
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise TrainingError("TRAINING_METRICS_INVALID", str(path)) from error
    steps = [record.get("step") for record in records]
    if (
        any(type(step) is not int for step in steps)
        or steps[:completed_steps] != list(range(1, completed_steps + 1))
    ):
        raise TrainingError("TRAINING_METRICS_INVALID", "step sequence")
    if len(records) < completed_steps:
        raise TrainingError("TRAINING_METRICS_INCOMPLETE", "step sequence")
    if len(records) > completed_steps:
        retained = records[:completed_steps]
        path.write_text(
            "".join(
                json.dumps(record, sort_keys=True, separators=(",", ":"))
                + "\n"
                for record in retained
            ),
            encoding="utf8",
        )


def _optimizer_to(
    optimizer: torch.optim.Optimizer,
    device: torch.device,
) -> None:
    for state in optimizer.state.values():
        for key, value in state.items():
            if isinstance(value, torch.Tensor):
                state[key] = value.to(device)


def _evaluate_tiny_gate(
    *,
    model: TinyVoxelCompletionModel,
    dataset: TrainingPatchDataset,
    config: TrainingConfig,
    step: int,
    device: torch.device,
) -> dict[str, Any]:
    accumulator = MetricAccumulator()
    was_training = model.training
    model.eval()
    with torch.no_grad():
        for index in range(min(4, len(dataset))):
            targets = dataset[index].unsqueeze(0)
            visible, mask = make_balanced_mask(
                targets,
                seed=_step_seed(config.seed, index + 1),
            )
            targets = targets.to(device)
            visible = visible.to(device)
            mask = mask.to(device)
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
                output.semantic_logits.permute(0, 2, 3, 4, 1)[
                    semantic_mask
                ],
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
    if was_training:
        model.train()
    metrics = accumulator.summary()
    gate = gate1_result(metrics)
    return {
        "source": "minecraft-architecture-training-gate1-v1",
        "step": step,
        "metrics": metrics,
        **gate,
    }
