from __future__ import annotations

import pytest

from mcagent_stage7.private_research import PrivateResearchError
from mcagent_stage7.private_research_runtime import (
    MIN_AVAILABLE_BYTES,
    RSS_PAUSE_BYTES,
    PrivateRunPaths,
    ResourceSample,
    paths_for_run,
    read_run_state,
    request_pause,
)
from mcagent_stage7.private_research_training import (
    PrivateResumeConfig,
    PrivateTrainConfig,
    resume_private_training,
    start_private_training,
)
from private_research_test_support import (
    REPO_ROOT,
    bypass_repository_identity,
    lightweight_services,
    make_config,
    make_ready_private_root,
)


def test_fresh_v2_run_completes_with_runtime_and_final_artifacts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = make_ready_private_root("complete")
    bypass_repository_identity(monkeypatch)
    result = start_private_training(
        PrivateTrainConfig(
            root=root,
            repo_root=REPO_ROOT,
            seed=7101,
            steps=3,
            batch_size=1,
            learning_rate=0.001,
            device="cpu",
            run_id="complete",
            code_revision="a" * 40,
        ),
        services=lightweight_services(),
    )
    run = root / "runs" / "complete"
    assert result.status == "completed"
    assert result.completed_steps == 3
    assert {entry.name for entry in run.iterdir()} == {
        ".runtime",
        "metrics.jsonl",
        "reconstruction.bin",
        "checkpoint.pt",
        "checkpoint_manifest.json",
    }
    state = read_run_state(paths_for_run(run))
    assert state.status == "completed"
    assert state.snapshot_steps == 3
    assert len((run / "metrics.jsonl").read_text("utf8").splitlines()) == 3


def test_fresh_run_refuses_less_than_eight_gib_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = make_ready_private_root("low-memory")
    bypass_repository_identity(monkeypatch)
    services = lightweight_services(
        resources=lambda: ResourceSample(
            rss_bytes=100 * 1024**2,
            swap_bytes=0,
            available_bytes=MIN_AVAILABLE_BYTES - 1,
        )
    )
    with pytest.raises(PrivateResearchError, match="AVAILABLE_MEMORY_LOW"):
        start_private_training(make_config(root, "low-memory", steps=1), services=services)
    assert not (root / "runs" / "low-memory").exists()


def test_pause_then_resume_matches_uninterrupted_outputs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = make_ready_private_root("equivalence")
    bypass_repository_identity(monkeypatch)
    uninterrupted = start_private_training(
        make_config(root, "uninterrupted", steps=4),
        services=lightweight_services(),
    )
    assert uninterrupted.status == "completed"

    def request_after_two(paths: PrivateRunPaths, step: int) -> None:
        if step == 2:
            request_pause(paths, reason="owner")

    paused = start_private_training(
        make_config(root, "resumed", steps=4),
        services=lightweight_services(after_step=request_after_two),
    )
    assert paused.status == "paused"
    assert paused.completed_steps == 2
    resumed = resume_private_training(
        PrivateResumeConfig(root=root, repo_root=REPO_ROOT, run_id="resumed"),
        services=lightweight_services(),
    )
    assert resumed.status == "completed"
    for name in ("checkpoint.pt", "metrics.jsonl", "reconstruction.bin"):
        assert (root / "runs" / "uninterrupted" / name).read_bytes() == (
            root / "runs" / "resumed" / name
        ).read_bytes()


def test_rss_limit_pauses_after_current_step_with_valid_snapshot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = make_ready_private_root("rss")
    bypass_repository_identity(monkeypatch)
    samples = iter(
        [
            ResourceSample(100, 0, MIN_AVAILABLE_BYTES),
            ResourceSample(RSS_PAUSE_BYTES, 0, MIN_AVAILABLE_BYTES),
        ]
    )
    result = start_private_training(
        make_config(root, "rss", steps=4),
        services=lightweight_services(resources=lambda: next(samples)),
    )
    assert result.status == "paused"
    assert result.completed_steps == 1
    state = read_run_state(paths_for_run(result.run_path))
    assert state.pause_reason == "memory_limit"
    assert state.snapshot_steps == 1


@pytest.mark.parametrize(
    "stage",
    [
        "final_after_metrics_replace",
        "final_after_reconstruction_replace",
        "final_after_checkpoint_replace",
        "final_after_manifest_replace",
        "final_after_completed_state_replace",
    ],
)
def test_finalization_interruption_resumes_without_an_extra_step(
    monkeypatch: pytest.MonkeyPatch,
    stage: str,
) -> None:
    root = make_ready_private_root("final-" + stage.removeprefix("final_after_"))
    bypass_repository_identity(monkeypatch)
    optimized_steps: list[int] = []

    def after_step(paths: PrivateRunPaths, step: int) -> None:
        optimized_steps.append(step)

    def fail(current: str) -> None:
        if current == stage:
            raise RuntimeError(stage)

    with pytest.raises(RuntimeError, match=stage):
        start_private_training(
            make_config(root, "interrupted", steps=3),
            services=lightweight_services(after_step=after_step, fault_hook=fail),
        )
    assert optimized_steps == [1, 2, 3]
    resumed = resume_private_training(
        PrivateResumeConfig(root=root, repo_root=REPO_ROOT, run_id="interrupted"),
        services=lightweight_services(after_step=after_step),
    )
    assert resumed.status == "completed"
    assert optimized_steps == [1, 2, 3]
    assert len((resumed.run_path / "metrics.jsonl").read_text("utf8").splitlines()) == 3


def test_conflicting_partial_final_file_is_preserved(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = make_ready_private_root("final-conflict")
    bypass_repository_identity(monkeypatch)

    def fail(current: str) -> None:
        if current == "final_after_metrics_replace":
            raise RuntimeError(current)

    with pytest.raises(RuntimeError, match="final_after_metrics_replace"):
        start_private_training(
            make_config(root, "conflict", steps=2),
            services=lightweight_services(fault_hook=fail),
        )
    metrics_path = root / "runs" / "conflict" / "metrics.jsonl"
    conflict = b"synthetic-conflict\n"
    metrics_path.write_bytes(conflict)
    with pytest.raises(PrivateResearchError, match="FINAL_ARTIFACT_CONFLICT"):
        resume_private_training(
            PrivateResumeConfig(root=root, repo_root=REPO_ROOT, run_id="conflict"),
            services=lightweight_services(),
        )
    assert metrics_path.read_bytes() == conflict
