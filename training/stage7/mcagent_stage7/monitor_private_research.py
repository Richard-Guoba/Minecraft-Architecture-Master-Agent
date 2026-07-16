from __future__ import annotations

import argparse
import math
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from .private_research import (
    DEFAULT_REPO_ROOT,
    PrivateResearchError,
    resolve_existing_private_run,
    resolve_private_cli_paths,
    run_private_preflight,
)
from .private_research_runtime import (
    paths_for_run,
    read_private_progress,
    read_public_progress,
)


@dataclass(frozen=True)
class MonitorConfig:
    root: Path
    repo_root: Path
    run_id: str
    show_private_loss: bool = False
    once: bool = False
    refresh_seconds: float = 1.0
    width: int = 30


def render_progress(
    public_progress: dict[str, Any],
    *,
    private_progress: dict[str, Any] | None,
    width: int,
) -> str:
    percent = min(100.0, max(0.0, float(public_progress["percent"])))
    filled = min(width, max(0, int(width * percent / 100.0)))
    bar = "#" * filled + "-" * (width - filled)
    result = (
        f"[{bar}] "
        f"{public_progress['completed_steps']}/{public_progress['target_steps']} "
        f"{percent:.1f}% "
        f"state {public_progress['state']} "
        f"active {_duration(float(public_progress['active_seconds']))} "
        f"speed {float(public_progress['recent_steps_per_second']):.2f} step/s "
        f"ETA {_duration(float(public_progress['eta_seconds']))} "
        f"snapshot {_duration(float(public_progress['snapshot_age_seconds']))}"
    )
    if private_progress is not None:
        result += (
            f" loss {float(private_progress['current_loss']):.6f}"
            f" avg100 {float(private_progress['rolling_100_loss']):.6f}"
        )
    return result


def monitor_private_research(config: MonitorConfig) -> int:
    _validate_config(config)
    if config.show_private_loss and not sys.stdout.isatty():
        raise PrivateResearchError(
            "PRIVATE_LOSS_REQUIRES_TTY",
            "stdout must be interactive",
        )
    preflight = run_private_preflight(root=config.root, repo_root=config.repo_root)
    run_path = resolve_existing_private_run(
        root=preflight.root,
        repo_root=config.repo_root,
        run_id=config.run_id,
    )
    paths = paths_for_run(run_path)
    while True:
        public = read_public_progress(paths)
        private = (
            read_private_progress(paths)
            if config.show_private_loss
            else None
        )
        line = render_progress(
            public,
            private_progress=private,
            width=config.width,
        )
        terminal = public["state"] in {"paused", "interrupted", "completed"}
        sys.stdout.write("\r" + line + ("\n" if config.once or terminal else ""))
        sys.stdout.flush()
        if config.once or terminal:
            return 0
        time.sleep(config.refresh_seconds)


def _validate_config(config: MonitorConfig) -> None:
    if not isinstance(config, MonitorConfig):
        raise PrivateResearchError("CONFIG_INVALID", "monitor config")
    if (
        isinstance(config.refresh_seconds, bool)
        or not isinstance(config.refresh_seconds, (int, float))
        or not math.isfinite(float(config.refresh_seconds))
        or float(config.refresh_seconds) <= 0.0
    ):
        raise PrivateResearchError("CONFIG_INVALID", "refresh_seconds")
    if (
        isinstance(config.width, bool)
        or not isinstance(config.width, int)
        or not 10 <= config.width <= 80
    ):
        raise PrivateResearchError("CONFIG_INVALID", "width")
    if not isinstance(config.show_private_loss, bool) or not isinstance(config.once, bool):
        raise PrivateResearchError("CONFIG_INVALID", "monitor flags")


def _duration(seconds: float) -> str:
    if not math.isfinite(seconds) or seconds < 0.0:
        raise PrivateResearchError("PROGRESS_INVALID", "duration")
    total = int(seconds)
    hours, remainder = divmod(total, 3600)
    minutes, remaining_seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{remaining_seconds:02d}"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Monitor local Stage 7 private-research training progress"
    )
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--private-research-only", action="store_true")
    parser.add_argument("--show-private-loss", action="store_true")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    arguments = parser.parse_args(argv)
    if not arguments.private_research_only:
        parser.error("--private-research-only acknowledgement is required")
    if arguments.show_private_loss and not sys.stdout.isatty():
        parser.error("PRIVATE_LOSS_REQUIRES_TTY")
    root, repository = resolve_private_cli_paths(
        root=arguments.root,
        repo_root=arguments.repo_root,
    )
    try:
        return monitor_private_research(
            MonitorConfig(
                root=root,
                repo_root=repository,
                run_id=arguments.run_id,
                show_private_loss=arguments.show_private_loss,
                once=arguments.once,
                refresh_seconds=1.0,
                width=30,
            )
        )
    except PrivateResearchError as error:
        parser.error(error.code)


if __name__ == "__main__":
    raise SystemExit(main())
