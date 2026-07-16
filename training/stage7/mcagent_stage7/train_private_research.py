from __future__ import annotations

import argparse
from pathlib import Path
from typing import Sequence

from .private_research import (
    DEFAULT_REPO_ROOT,
    PrivateResearchError,
    resolve_private_cli_paths,
)
from .private_research_training import (
    PrivateTrainConfig,
    PrivateTrainingResult,
    train_private_research,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Train the local-only Stage 7 private-research masked voxel model"
    )
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
    parser.add_argument("--code-revision", default="")
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
        result = train_private_research(
            PrivateTrainConfig(
                root=private_root,
                repo_root=repository,
                seed=arguments.seed,
                steps=arguments.steps,
                batch_size=arguments.batch_size,
                learning_rate=arguments.learning_rate,
                device=arguments.device,
                run_id=arguments.run_id,
                code_revision=arguments.code_revision,
            )
        )
    except PrivateResearchError as error:
        parser.error(error.code if arguments.metadata_only else str(error))
    print("training_scope: private-research-only")
    print("distribution: prohibited")
    print(f"run_complete: {'true' if result.status == 'completed' else 'false'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
