from __future__ import annotations

import argparse
from pathlib import Path
from typing import Sequence

import torch

from .semantic_balance import SEMANTIC_BALANCE_PROFILES
from .training_data import TrainingError
from .training_loop import TrainingConfig, train_model
from .training_paths import resolve_cli_root


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Train the local voxel completion model."
    )
    parser.add_argument("--root", type=Path, default=Path(".local/training"))
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--steps", type=_positive_int, required=True)
    parser.add_argument("--batch-size", type=_positive_int, default=2)
    parser.add_argument("--learning-rate", type=_positive_float, default=0.001)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--seed", type=_uint32, default=7101)
    parser.add_argument("--tiny-overfit", action="store_true")
    parser.add_argument(
        "--semantic-balance",
        choices=SEMANTIC_BALANCE_PROFILES,
        default="none",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    device = (
        "cuda"
        if arguments.device == "auto" and torch.cuda.is_available()
        else "cpu"
        if arguments.device == "auto"
        else arguments.device
    )
    result = train_model(
        TrainingConfig(
            root=resolve_cli_root(arguments.root),
            run_id=arguments.run_id,
            steps=arguments.steps,
            batch_size=arguments.batch_size,
            learning_rate=arguments.learning_rate,
            device=device,
            seed=arguments.seed,
            tiny_overfit=arguments.tiny_overfit,
            semantic_balance=arguments.semantic_balance,
        )
    )
    print(f"run_id={arguments.run_id}")
    print(f"status={result.status}")
    print(f"completed_steps={result.completed_steps}")
    print(f"target_steps={result.target_steps}")
    print(f"device={device}")
    print(f"semantic_balance={arguments.semantic_balance}")
    return 0


def _positive_int(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("expected a positive integer") from error
    if parsed <= 0:
        raise argparse.ArgumentTypeError("expected a positive integer")
    return parsed


def _positive_float(value: str) -> float:
    try:
        parsed = float(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("expected a positive number") from error
    if not 0.0 < parsed < float("inf"):
        raise argparse.ArgumentTypeError("expected a positive number")
    return parsed


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
