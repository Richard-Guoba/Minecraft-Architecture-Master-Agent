from __future__ import annotations

import argparse
import json
import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import numpy as np
import torch

from .checkpoints import parameter_sha256, save_checkpoint
from .contracts import LAYERS, Stage7ContractError, canonical_json_bytes, sha256_file
from .dataset import FIXTURE_ORIGIN, Stage7Dataset
from .encoding import ConditionEncoder
from .model import LossOutput, TinyConditionalVAE, model_loss
from .tensors import PlanTargets, plan_to_targets


STAGE7_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class TrainConfig:
    fixture_root: Path
    seed: int
    steps: int
    learning_rate: float
    device: str
    code_revision: str


@dataclass(frozen=True)
class RunArtifacts:
    stage7_root: Path
    checkpoint_path: Path
    manifest_path: Path
    metrics_path: Path
    manifest: dict[str, Any]
    checkpoint_sha256: str
    manifest_sha256: str
    metrics_sha256: str
    final_loss: float


def train_fixture(config: TrainConfig, output: Path) -> RunArtifacts:
    _validate_config(config)
    output = Path(output)

    random.seed(config.seed)
    np.random.seed(config.seed)
    torch.manual_seed(config.seed)
    torch.use_deterministic_algorithms(True)
    torch.set_num_threads(1)

    dataset = Stage7Dataset.from_fixtures(Path(config.fixture_root))
    if dataset.mode != "fixture" or dataset.readiness_contribution != 0:
        raise ValueError("fixture trainer requires a fixture-only Stage7Dataset")
    case_ids = _manifest_case_order(Path(config.fixture_root))
    if not case_ids or set(case_ids) != set(dataset.case_ids):
        raise Stage7ContractError("fixture manifest case order does not bind the dataset")

    model = TinyConditionalVAE(
        condition_size=64,
        latent_size=16,
        coarse_size=16,
    ).cpu()
    optimizer = torch.optim.SGD(model.parameters(), lr=config.learning_rate)
    encoder = ConditionEncoder(size=64)
    metrics: list[dict[str, Any]] = []

    model.train()
    for index in range(config.steps):
        case_id = case_ids[index % len(case_ids)]
        case = dataset.load_case(case_id, tuple(LAYERS))
        if case.origin != FIXTURE_ORIGIN:
            raise ValueError("fixture trainer accepts synthetic fixture cases only")
        conditions = encoder.encode(case.condition).unsqueeze(0).cpu()
        targets = _batch_one(plan_to_targets(case.plan))

        optimizer.zero_grad(set_to_none=True)
        loss = model_loss(model(conditions, targets), targets)
        _require_finite_loss(loss)
        loss.total.backward()
        _require_finite_gradients(model)
        optimizer.step()

        metric = {
            "step": index + 1,
            "total_loss": _scalar(loss.total),
            "envelope_loss": _scalar(loss.envelope),
            "space_loss": _scalar(loss.space),
            "site_loss": _scalar(loss.site),
            "dice_loss": _scalar(loss.dice),
            "kl_loss": _scalar(loss.kl),
            "parameter_sha256": parameter_sha256(model),
        }
        metrics.append(metric)

    output.mkdir(parents=True, exist_ok=True)
    metrics_path = output / "metrics.jsonl"
    metrics_path.write_bytes(
        b"".join(canonical_json_bytes(metric) + b"\n" for metric in metrics)
    )
    checkpoint_path = output / "checkpoint.pt"
    manifest_path = output / "checkpoint_manifest.json"
    manifest = save_checkpoint(
        model=model,
        checkpoint_path=checkpoint_path,
        manifest_path=manifest_path,
        dataset_manifest_sha256=sha256_file(Path(config.fixture_root) / "manifest.json"),
        config=config,
        code_revision=config.code_revision,
    )
    return RunArtifacts(
        stage7_root=STAGE7_ROOT,
        checkpoint_path=checkpoint_path,
        manifest_path=manifest_path,
        metrics_path=metrics_path,
        manifest=manifest,
        checkpoint_sha256=manifest["checkpoint_sha256"],
        manifest_sha256=sha256_file(manifest_path),
        metrics_sha256=sha256_file(metrics_path),
        final_loss=metrics[-1]["total_loss"],
    )


def _validate_config(config: TrainConfig) -> None:
    if not isinstance(config, TrainConfig):
        raise ValueError("config must be TrainConfig")
    if isinstance(config.seed, bool) or not isinstance(config.seed, int):
        raise ValueError("seed must be an integer")
    if not 0 <= config.seed < 2**32:
        raise ValueError("seed must be in 0..4294967295")
    if isinstance(config.steps, bool) or not isinstance(config.steps, int):
        raise ValueError("steps must be an integer")
    if config.steps <= 0:
        raise ValueError("steps must be positive")
    if isinstance(config.learning_rate, bool) or not isinstance(
        config.learning_rate, (int, float)
    ):
        raise ValueError("learning_rate must be numeric")
    if not math.isfinite(config.learning_rate):
        raise ValueError("learning_rate must be finite")
    if config.learning_rate <= 0:
        raise ValueError("learning_rate must be positive")
    if config.device != "cpu":
        raise ValueError("device must be cpu for fixture acceptance training")
    if not isinstance(config.code_revision, str) or not config.code_revision.strip():
        raise ValueError("code_revision must be a non-empty string")
    if not isinstance(config.fixture_root, (str, Path)):
        raise ValueError("fixture_root must be a path")


def _manifest_case_order(fixture_root: Path) -> tuple[str, ...]:
    try:
        manifest = json.loads((fixture_root / "manifest.json").read_bytes())
        records = manifest["cases"]
        case_ids = tuple(record["case_id"] for record in records)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError) as error:
        raise Stage7ContractError("fixture manifest has no valid case order") from error
    if (
        not case_ids
        or any(not isinstance(case_id, str) or not case_id for case_id in case_ids)
        or len(set(case_ids)) != len(case_ids)
    ):
        raise Stage7ContractError("fixture manifest has no valid case order")
    return case_ids


def _batch_one(targets: PlanTargets) -> PlanTargets:
    return PlanTargets(
        envelope=targets.envelope.unsqueeze(0).cpu(),
        space=targets.space.unsqueeze(0).cpu(),
        site=targets.site.unsqueeze(0).cpu(),
    )


def _require_finite_loss(loss: LossOutput) -> None:
    if not isinstance(loss, LossOutput):
        raise ValueError("model loss must be LossOutput")
    for name in ("total", "envelope", "space", "site", "dice", "kl"):
        value = getattr(loss, name)
        if not isinstance(value, torch.Tensor) or value.numel() != 1:
            raise ValueError(f"loss component {name} must be a scalar tensor")
        if not bool(torch.isfinite(value.detach()).all()):
            raise ValueError(f"loss component {name} must be finite")


def _require_finite_gradients(model: torch.nn.Module) -> None:
    for name, parameter in model.named_parameters():
        gradient = parameter.grad
        if gradient is not None and not bool(torch.isfinite(gradient).all()):
            raise ValueError(f"gradient must be finite: {name}")


def _scalar(value: torch.Tensor) -> float:
    scalar = float(value.detach().cpu().item())
    if not math.isfinite(scalar):
        raise ValueError("metric loss must be finite")
    return scalar


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Train the Stage 7 fixture-only M3 model")
    parser.add_argument("--fixture-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=7101)
    parser.add_argument("--steps", type=int, default=2)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--code-revision", default="unspecified")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    arguments = parser.parse_args(argv)
    try:
        artifacts = train_fixture(
            TrainConfig(
                fixture_root=arguments.fixture_root,
                seed=arguments.seed,
                steps=arguments.steps,
                learning_rate=arguments.learning_rate,
                device=arguments.device,
                code_revision=arguments.code_revision,
            ),
            arguments.output,
        )
    except (ValueError, Stage7ContractError) as error:
        parser.error(str(error))
    print(f"training_scope: {artifacts.manifest['training_scope']}")
    print(f"device: {artifacts.manifest['device']}")
    print(f"final_loss: {artifacts.final_loss}")
    print(f"checkpoint_sha256: {artifacts.checkpoint_sha256}")
    print(f"manifest_sha256: {artifacts.manifest_sha256}")
    print(f"metrics_sha256: {artifacts.metrics_sha256}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
