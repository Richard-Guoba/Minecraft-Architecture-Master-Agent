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
    PrivateResumeConfig,
    SignalPauseToken,
    cooperative_signal_handlers,
    resume_private_training,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Resume the same Stage 7 private-research training run"
    )
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--private-research-only", action="store_true")
    parser.add_argument("--metadata-only", action="store_true")
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    arguments = parser.parse_args(argv)
    if not arguments.private_research_only:
        parser.error("--private-research-only acknowledgement is required")
    if not arguments.metadata_only:
        parser.error("--metadata-only is required")
    root, repository = resolve_private_cli_paths(
        root=arguments.root,
        repo_root=arguments.repo_root,
    )
    token = SignalPauseToken()
    try:
        with cooperative_signal_handlers(token):
            result = resume_private_training(
                PrivateResumeConfig(
                    root=root,
                    repo_root=repository,
                    run_id=arguments.run_id,
                ),
                pause_signal=token,
            )
    except PrivateResearchError as error:
        parser.error(error.code)
    _print_result(result.status, result.completed_steps, result.target_steps)
    return 0


def _print_result(status: str, completed_steps: int, target_steps: int) -> None:
    print("training_scope: private-research-only")
    print("distribution: prohibited")
    print(f"run_state: {status}")
    print(f"completed_steps: {completed_steps}")
    print(f"target_steps: {target_steps}")
    print(f"run_complete: {'true' if status == 'completed' else 'false'}")


if __name__ == "__main__":
    raise SystemExit(main())
