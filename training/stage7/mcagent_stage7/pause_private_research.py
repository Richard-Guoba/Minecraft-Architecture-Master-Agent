from __future__ import annotations

import argparse
import math
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from .private_research import (
    DEFAULT_REPO_ROOT,
    PrivateResearchError,
    resolve_existing_private_run,
    resolve_private_cli_paths,
    run_private_preflight,
)
from .private_research_runtime import (
    PrivateRunPaths,
    hold_run_lock,
    paths_for_run,
    read_run_state,
    request_pause,
)


@dataclass(frozen=True)
class PauseConfig:
    root: Path
    repo_root: Path
    run_id: str
    timeout_seconds: float = 120.0


def pause_private_research(config: PauseConfig) -> str:
    if not isinstance(config, PauseConfig):
        raise PrivateResearchError("CONFIG_INVALID", "pause config")
    if (
        isinstance(config.timeout_seconds, bool)
        or not isinstance(config.timeout_seconds, (int, float))
        or not math.isfinite(float(config.timeout_seconds))
        or float(config.timeout_seconds) < 0.0
    ):
        raise PrivateResearchError("CONFIG_INVALID", "timeout_seconds")
    preflight = run_private_preflight(root=config.root, repo_root=config.repo_root)
    run_path = resolve_existing_private_run(
        root=preflight.root,
        repo_root=config.repo_root,
        run_id=config.run_id,
    )
    paths = paths_for_run(run_path)
    initial = read_run_state(paths)
    if initial.status in {"initializing", "completed"}:
        raise PrivateResearchError("PAUSE_STATE_INVALID", initial.status)
    request_id = request_pause(paths, reason="owner")
    deadline = time.monotonic() + float(config.timeout_seconds)
    while True:
        state = read_run_state(paths)
        if (
            state.status == "paused"
            and state.pause_request_id == request_id
            and state.pause_acknowledged_id == request_id
            and state.snapshot_steps == state.completed_steps
            and _run_lock_is_free(paths)
        ):
            return "paused"
        if time.monotonic() >= deadline:
            raise PrivateResearchError("PAUSE_TIMEOUT", config.run_id)
        time.sleep(0.25)


def _run_lock_is_free(paths: PrivateRunPaths) -> bool:
    try:
        with hold_run_lock(paths):
            return True
    except PrivateResearchError as error:
        if error.code == "RUN_LOCKED":
            return False
        raise


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Request a safe Stage 7 private-research training pause"
    )
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--private-research-only", action="store_true")
    parser.add_argument("--metadata-only", action="store_true")
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    parser.add_argument("--timeout-seconds", type=float, default=120.0)
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
    try:
        state = pause_private_research(
            PauseConfig(
                root=root,
                repo_root=repository,
                run_id=arguments.run_id,
                timeout_seconds=arguments.timeout_seconds,
            )
        )
    except PrivateResearchError as error:
        parser.error(error.code)
    print("training_scope: private-research-only")
    print("distribution: prohibited")
    print("pause_confirmed: true")
    print(f"run_state: {state}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
