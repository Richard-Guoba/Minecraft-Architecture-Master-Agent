from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Sequence

from .training_paths import resolve_cli_root


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Show local voxel training progress."
    )
    parser.add_argument("--root", type=Path, default=Path(".local/training"))
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    root = resolve_cli_root(arguments.root)
    manifest = _json_or_none(root / "dataset" / "manifest.json")
    split = _json_or_none(root / "splits" / "split.json")
    if manifest is None or split is None:
        print("dataset_status=not_prepared")
        return 0
    sources = manifest.get("sources", [])
    samples = manifest.get("samples", [])
    print("dataset_status=prepared")
    print(f"source_count={len(sources)}")
    print(f"sample_count={len(samples)}")
    for name in ("train", "validation", "test"):
        source_count = len(split.get(f"{name}_source_ids", []))
        sample_count = sum(
            sample.get("split") == name
            for sample in samples
            if isinstance(sample, dict)
        )
        print(f"{name}_source_count={source_count}")
        print(f"{name}_sample_count={sample_count}")
    runs = _run_documents(root)
    if not runs:
        print("run_status=no_runs")
        return 0
    latest_id, latest = max(
        runs.items(),
        key=lambda item: (
            item[1]["path"].stat().st_mtime_ns,
            item[0],
        ),
    )
    print(f"latest_run_id={latest_id}")
    print(f"run_status={latest['document'].get('status', 'unknown')}")
    print(
        f"completed_steps={latest['document'].get('completed_steps', 0)}"
    )
    print(f"target_steps={latest['document'].get('target_steps', 0)}")
    latest_run = root / "runs" / latest_id
    gate = _json_or_none(latest_run / "gate1.json")
    evaluation = _evaluation_for_run(
        latest_run / "evaluation.json",
        latest_id,
    )
    test_evaluation = _evaluation_for_run(
        latest_run / "evaluation.test.json",
        latest_id,
    )
    print(
        "gate1_passed="
        + (
            str(gate.get("passed")).lower()
            if gate is not None
            else "not_run"
        )
    )
    print(
        "gate2_passed="
        + _section_passed(evaluation, "gate2")
    )
    print(
        "phase2_passed="
        + _section_passed(evaluation, "phase2")
    )
    print(
        "test_gate2_passed="
        + _section_passed(test_evaluation, "gate2")
    )
    print(
        "test_phase2_passed="
        + _section_passed(test_evaluation, "phase2")
    )
    return 0


def _run_documents(root: Path) -> dict[str, dict[str, Any]]:
    runs_root = root / "runs"
    if not runs_root.is_dir() or runs_root.is_symlink():
        return {}
    output = {}
    for run in runs_root.iterdir():
        checkpoint = run / "checkpoint.json"
        document = _json_or_none(checkpoint)
        if run.is_dir() and not run.is_symlink() and document is not None:
            output[run.name] = {"path": checkpoint, "document": document}
    return output


def _evaluation_for_run(
    path: Path,
    run_id: str,
) -> dict[str, Any] | None:
    document = _json_or_none(path)
    if document is None or document.get("run_id") != run_id:
        return None
    return document


def _section_passed(
    document: dict[str, Any] | None,
    section: str,
) -> str:
    if document is None:
        return "not_run"
    value = document.get(section)
    if not isinstance(value, dict) or type(value.get("passed")) is not bool:
        return "not_run"
    return str(value["passed"]).lower()


def _json_or_none(path: Path) -> dict[str, Any] | None:
    try:
        if path.is_symlink():
            return None
        value = json.loads(path.read_text(encoding="utf8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


if __name__ == "__main__":
    raise SystemExit(main())
