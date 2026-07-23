from __future__ import annotations

import json
from pathlib import Path

import pytest
import torch

import mcagent_stage7.evaluate as evaluation_module
import mcagent_stage7.status as status_module
from mcagent_stage7.evaluate import (
    build_parser as evaluation_parser,
    main as evaluation_main,
)
from mcagent_stage7.status import (
    build_parser as status_parser,
    main as status_main,
)
from mcagent_stage7.training_paths import REPOSITORY_ROOT, resolve_cli_root
from mcagent_stage7.train import (
    build_parser as training_parser,
    main as training_main,
)
from training_test_support import make_training_root


REPO_ROOT = Path(__file__).resolve().parents[3]
PROHIBITED = (
    "private",
    "acknowledgement",
    "metadata-only",
    "Dataset",
    "R1",
    "R2",
    "R3",
)


def test_command_help_exposes_only_the_new_local_training_contract() -> None:
    helps = [
        training_parser().format_help(),
        evaluation_parser().format_help(),
        status_parser().format_help(),
    ]
    for help_text in helps:
        for prohibited in PROHIBITED:
            assert prohibited not in help_text
    assert "--tiny-overfit" in helps[0]
    assert "--semantic-balance" in helps[0]
    assert "--run-id" in helps[0]
    assert "--run-id" in helps[1]
    assert "--split" in helps[1]
    assert "--root" in helps[2]


def test_training_command_defaults_to_none_and_rejects_unknown_balance() -> None:
    arguments = training_parser().parse_args(
        ["--run-id", "parser-test", "--steps", "1"]
    )
    assert arguments.semantic_balance == "none"

    with pytest.raises(SystemExit):
        training_parser().parse_args(
            [
                "--run-id",
                "parser-test",
                "--steps",
                "1",
                "--semantic-balance",
                "unknown",
            ]
        )


def test_evaluation_command_defaults_to_validation_and_rejects_unknown_split() -> None:
    arguments = evaluation_parser().parse_args(["--run-id", "parser-test"])
    assert arguments.split == "validation"

    with pytest.raises(SystemExit):
        evaluation_parser().parse_args(
            ["--run-id", "parser-test", "--split", "training"]
        )


def test_relative_training_root_is_resolved_from_the_repository() -> None:
    assert resolve_cli_root(Path(".local/training")) == (
        REPOSITORY_ROOT / ".local" / "training"
    )


def test_train_evaluate_and_status_commands_complete_a_cpu_smoke_run(
    tmp_path: Path,
    capsys,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = make_training_root(tmp_path, train_count=8)

    assert training_main(
        [
            "--root",
            str(root),
            "--run-id",
            "command-smoke",
            "--steps",
            "3",
            "--batch-size",
            "2",
            "--device",
            "cpu",
            "--semantic-balance",
            "weighted-mask",
        ]
    ) == 0
    assert "completed_steps=3" in capsys.readouterr().out

    evaluation_strategies: list[str] = []
    real_make_balanced_mask = evaluation_module.make_balanced_mask

    def recording_mask(*args: object, **kwargs: object):
        evaluation_strategies.append(
            str(kwargs.get("semantic_balance"))
        )
        return real_make_balanced_mask(*args, **kwargs)

    monkeypatch.setattr(
        evaluation_module,
        "make_balanced_mask",
        recording_mask,
    )
    assert evaluation_main(
        [
            "--root",
            str(root),
            "--run-id",
            "command-smoke",
            "--device",
            "cpu",
            "--seed",
            "7101",
        ]
    ) == 0
    validation_output = capsys.readouterr().out
    assert "split=validation" in validation_output
    assert "gate2_passed=" in validation_output
    assert "phase2_passed=" in validation_output
    run = root / "runs" / "command-smoke"
    validation_report_path = run / "evaluation.json"
    validation_reconstruction_path = run / "reconstruction.bin"
    validation_report_bytes = validation_report_path.read_bytes()
    validation_reconstruction_bytes = (
        validation_reconstruction_path.read_bytes()
    )
    report = json.loads(validation_report_bytes)
    checkpoint = json.loads((run / "checkpoint.json").read_text("utf8"))
    assert checkpoint["semantic_balance"] == "weighted-mask"
    assert len(checkpoint["semantic_class_weights"]) == 8
    assert report["split"] == "validation"
    assert report["semantic_balance"] == "weighted-mask"
    assert isinstance(report["selection_score"], float)
    assert isinstance(report["phase2"]["passed"], bool)
    assert set(report["metrics"]) == {"trained", "untrained", "class_prior"}
    assert isinstance(report["gate2"]["passed"], bool)
    assert validation_reconstruction_path.stat().st_size == 32**3

    assert evaluation_main(
        [
            "--root",
            str(root),
            "--run-id",
            "command-smoke",
            "--device",
            "cpu",
            "--seed",
            "7101",
            "--split",
            "test",
        ]
    ) == 0
    test_output = capsys.readouterr().out
    assert "split=test" in test_output
    assert validation_report_path.read_bytes() == validation_report_bytes
    assert (
        validation_reconstruction_path.read_bytes()
        == validation_reconstruction_bytes
    )
    test_report = json.loads(
        (run / "evaluation.test.json").read_text("utf8")
    )
    assert test_report["split"] == "test"
    assert (run / "reconstruction.test.bin").stat().st_size == 32**3
    assert evaluation_strategies == ["none", "none"]

    assert status_main(["--root", str(root)]) == 0
    output = capsys.readouterr().out
    assert "dataset_status=prepared" in output
    assert "latest_run_id=command-smoke" in output
    assert "completed_steps=3" in output
    assert "gate2_passed=" in output
    assert "phase2_passed=" in output
    assert "test_gate2_passed=" in output
    assert "test_phase2_passed=" in output


def test_status_reports_an_unprepared_root_without_a_traceback(
    tmp_path: Path,
    capsys,
) -> None:
    root = tmp_path / "empty"
    root.mkdir()
    assert status_main(["--root", str(root)]) == 0
    assert capsys.readouterr().out == "dataset_status=not_prepared\n"


def test_status_rejects_an_evaluation_bound_to_another_run(
    tmp_path: Path,
) -> None:
    path = tmp_path / "evaluation.json"
    path.write_text(
        json.dumps({"run_id": "stale-run"}),
        encoding="utf8",
    )

    assert status_module._evaluation_for_run(
        path,
        "latest-run",
    ) is None


@pytest.mark.skipif(not torch.cuda.is_available(), reason="CUDA unavailable")
def test_evaluation_keeps_class_prior_probabilities_on_cuda(
    tmp_path: Path,
) -> None:
    root = make_training_root(tmp_path)
    assert training_main(
        [
            "--root",
            str(root),
            "--run-id",
            "cuda-evaluation",
            "--steps",
            "1",
            "--device",
            "cpu",
        ]
    ) == 0

    assert evaluation_main(
        [
            "--root",
            str(root),
            "--run-id",
            "cuda-evaluation",
            "--device",
            "cuda",
        ]
    ) == 0


def test_package_scripts_expose_exactly_the_replacement_training_commands() -> None:
    package = json.loads((REPO_ROOT / "package.json").read_text("utf8"))
    scripts = package["scripts"]
    expected = {
        "training:prepare": "node src/runTrainingPrepare.js",
        "training:train": (
            "conda run -n mcagent-stage7 --cwd training/stage7 "
            "python -m mcagent_stage7.train"
        ),
        "training:evaluate": (
            "conda run -n mcagent-stage7 --cwd training/stage7 "
            "python -m mcagent_stage7.evaluate"
        ),
        "training:status": (
            "conda run -n mcagent-stage7 --cwd training/stage7 "
            "python -m mcagent_stage7.status"
        ),
        "test:training": (
            "conda run -n mcagent-stage7 --cwd training/stage7 "
            "python -m pytest -q -p no:cacheprovider ."
        ),
    }
    for name, command in expected.items():
        assert scripts[name] == command
    assert not any(
        "private-research" in name or "fixture" in name
        for name in scripts
    )
