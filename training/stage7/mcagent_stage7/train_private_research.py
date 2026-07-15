from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import numpy as np
import torch

from .private_research import (
    DEFAULT_REPO_ROOT,
    PrivatePreparedDataset,
    PrivateResearchError,
    resolve_private_cli_paths,
    run_private_preflight,
    validate_private_run_id,
)
from .private_research_checkpoints import save_private_checkpoint
from .private_research_model import TinyMaskedVoxelAutoencoder, masked_reconstruction_loss


@dataclass(frozen=True)
class PrivateTrainConfig:
    root: Path
    repo_root: Path
    seed: int = 7101
    steps: int = 1
    batch_size: int = 1
    learning_rate: float = 1e-3
    device: str = "cpu"
    run_id: str = "private-run"
    code_revision: str = "unspecified"


@dataclass(frozen=True)
class PrivateRunArtifacts:
    checkpoint_path: Path
    manifest_path: Path
    metrics_path: Path
    reconstruction_path: Path
    manifest: dict[str, Any]
    final_loss: float


def train_private_research(config: PrivateTrainConfig) -> PrivateRunArtifacts:
    _validate_config(config)
    preflight = run_private_preflight(root=Path(config.root), repo_root=Path(config.repo_root))
    run_root = preflight.root / "runs"
    if run_root.is_symlink() or not run_root.is_dir():
        raise PrivateResearchError("PATH_MISSING", str(run_root))
    run_path = run_root / config.run_id
    if run_path.exists() or run_path.is_symlink():
        raise PrivateResearchError("RUN_EXISTS", config.run_id)
    run_path.mkdir()

    _set_deterministic_state(config.seed)
    device = torch.device(config.device)
    dataset = PrivatePreparedDataset(root=preflight.root, split="train", seed=config.seed, repo_root=Path(config.repo_root))
    model = TinyMaskedVoxelAutoencoder().to(device)
    optimizer = torch.optim.SGD(model.parameters(), lr=float(config.learning_rate))
    metrics: list[dict[str, Any]] = []
    reconstruction = b""
    model.train()
    for step in range(config.steps):
        batch = [dataset[(step * config.batch_size + offset) % len(dataset)] for offset in range(config.batch_size)]
        targets = torch.stack([item[0] for item in batch]).to(device)
        visible = torch.stack([item[1] for item in batch]).to(device)
        mask = torch.stack([item[2] for item in batch]).to(device)
        optimizer.zero_grad(set_to_none=True)
        logits = model(visible)
        loss = masked_reconstruction_loss(logits, targets, mask)
        loss.backward()
        _require_finite_gradients(model)
        optimizer.step()
        final_loss = _finite_scalar(loss)
        metrics.append({"step": step + 1, "masked_reconstruction_loss": final_loss})
        reconstruction = logits.detach().argmax(dim=1)[0].to("cpu", dtype=torch.uint8).contiguous().numpy().tobytes()

    metrics_path = run_path / "metrics.jsonl"
    metrics_path.write_text("".join(_canonical_json(metric).rstrip("\n") + "\n" for metric in metrics), encoding="utf8")
    reconstruction_path = run_path / "reconstruction.bin"
    reconstruction_path.write_bytes(reconstruction)
    checkpoint_path = run_path / "checkpoint.pt"
    manifest_path = run_path / "checkpoint_manifest.json"
    manifest = save_private_checkpoint(
        model=model,
        checkpoint_path=checkpoint_path,
        manifest_path=manifest_path,
        input_manifest_sha256=preflight.prepared_manifest_sha256,
        split_sha256=preflight.split_sha256,
        seed=config.seed,
        device=config.device,
        code_revision=config.code_revision,
        training_config={
            "steps": config.steps,
            "batch_size": config.batch_size,
            "learning_rate": float(config.learning_rate),
        },
    )
    run_private_preflight(root=preflight.root, repo_root=Path(config.repo_root))
    return PrivateRunArtifacts(
        checkpoint_path=checkpoint_path,
        manifest_path=manifest_path,
        metrics_path=metrics_path,
        reconstruction_path=reconstruction_path,
        manifest=manifest,
        final_loss=metrics[-1]["masked_reconstruction_loss"],
    )


def _validate_config(config: PrivateTrainConfig) -> None:
    if not isinstance(config, PrivateTrainConfig):
        raise PrivateResearchError("CONFIG_INVALID", "config must be PrivateTrainConfig")
    validate_private_run_id(config.run_id)
    if isinstance(config.seed, bool) or not isinstance(config.seed, int) or not 0 <= config.seed < 2**32:
        raise PrivateResearchError("CONFIG_INVALID", "seed")
    if isinstance(config.steps, bool) or not isinstance(config.steps, int) or config.steps <= 0:
        raise PrivateResearchError("CONFIG_INVALID", "steps")
    if isinstance(config.batch_size, bool) or not isinstance(config.batch_size, int) or config.batch_size <= 0:
        raise PrivateResearchError("CONFIG_INVALID", "batch_size")
    if isinstance(config.learning_rate, bool) or not isinstance(config.learning_rate, (int, float)) or not math.isfinite(config.learning_rate) or config.learning_rate <= 0:
        raise PrivateResearchError("CONFIG_INVALID", "learning_rate")
    if config.device not in {"cpu", "cuda"}:
        raise PrivateResearchError("CONFIG_INVALID", "device")
    if config.device == "cuda" and not torch.cuda.is_available():
        raise PrivateResearchError("CUDA_UNAVAILABLE", "cuda")
    if not isinstance(config.code_revision, str) or not config.code_revision.strip():
        raise PrivateResearchError("CONFIG_INVALID", "code_revision")


def _set_deterministic_state(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.use_deterministic_algorithms(True)
    torch.set_num_threads(1)


def _require_finite_gradients(model: torch.nn.Module) -> None:
    for name, parameter in model.named_parameters():
        if parameter.grad is not None and not bool(torch.isfinite(parameter.grad).all()):
            raise PrivateResearchError("GRADIENT_NONFINITE", name)


def _finite_scalar(value: torch.Tensor) -> float:
    result = float(value.detach().cpu().item())
    if not math.isfinite(result):
        raise PrivateResearchError("LOSS_NONFINITE", "masked reconstruction")
    return result


def _canonical_json(value: dict[str, Any]) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Train the local-only Stage 7 private-research masked voxel model")
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--private-research-only", action="store_true")
    parser.add_argument("--metadata-only", action="store_true")
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    parser.add_argument("--seed", type=int, default=7101)
    parser.add_argument("--steps", type=int, default=1)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--code-revision", default="unspecified")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    arguments = parser.parse_args(argv)
    if not arguments.private_research_only:
        parser.error("--private-research-only acknowledgement is required")
    private_root, repository = resolve_private_cli_paths(
        root=arguments.root,
        repo_root=arguments.repo_root,
    )
    try:
        artifacts = train_private_research(
            PrivateTrainConfig(
                root=private_root, repo_root=repository, seed=arguments.seed,
                steps=arguments.steps, batch_size=arguments.batch_size,
                learning_rate=arguments.learning_rate, device=arguments.device,
                run_id=arguments.run_id, code_revision=arguments.code_revision,
            )
        )
    except PrivateResearchError as error:
        parser.error(error.code if arguments.metadata_only else str(error))
    print(f"training_scope: {artifacts.manifest['training_scope']}")
    print(f"distribution: {artifacts.manifest['distribution']}")
    print("run_complete: true")
    if not arguments.metadata_only:
        print(f"final_loss: {artifacts.final_loss}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
