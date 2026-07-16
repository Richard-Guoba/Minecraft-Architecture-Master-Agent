from __future__ import annotations

import hashlib
import json
import math
import platform
import random
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Protocol

import numpy as np
import torch

from .private_research import (
    PrivatePreparedDataset,
    PrivateResearchError,
    PrivateResearchPreflight,
    resolve_existing_private_run,
    run_private_preflight,
    validate_private_run_id,
)
from .private_research_checkpoints import (
    load_private_checkpoint,
    save_private_checkpoint_v2,
)
from .private_research_model import (
    PRIVATE_SHAPE,
    TinyMaskedVoxelAutoencoder,
    masked_reconstruction_loss,
)
from .private_research_runtime import (
    MIN_AVAILABLE_BYTES,
    RSS_PAUSE_BYTES,
    PrivateRunPaths,
    PrivateRunState,
    RuntimeServices,
    acknowledge_pause,
    atomic_write_bytes,
    compute_training_code_sha256,
    create_initial_state,
    hold_run_lock,
    paths_for_run,
    publish_progress,
    read_pause_request,
    read_public_progress,
    read_run_state,
    request_pause,
    require_repository_identity,
    transition_state,
    write_run_state,
)
from .private_research_snapshots import (
    LoadedResumeSnapshot,
    SnapshotPointer,
    commit_resume_snapshot,
    load_latest_resume_snapshot,
    restore_model_optimizer,
)


CHECKPOINT_INTERVAL_SECONDS = 300.0


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
    code_revision: str = ""


@dataclass(frozen=True)
class PrivateResumeConfig:
    root: Path
    repo_root: Path
    run_id: str


@dataclass(frozen=True)
class PrivateTrainingResult:
    run_path: Path
    status: str
    completed_steps: int
    target_steps: int
    manifest: dict[str, Any] | None


class PauseSignal(Protocol):
    def consume(self) -> str | None:
        raise NotImplementedError


class NoPauseSignal:
    def consume(self) -> str | None:
        return None


def start_private_training(
    config: PrivateTrainConfig,
    *,
    services: RuntimeServices | None = None,
    pause_signal: PauseSignal | None = None,
) -> PrivateTrainingResult:
    runtime_services = services or RuntimeServices()
    signal = pause_signal or NoPauseSignal()
    _validate_fresh_config(config)
    repository = Path(config.repo_root)
    preflight = run_private_preflight(root=Path(config.root), repo_root=repository)
    require_repository_identity(repository, config.code_revision)
    training_code_sha256 = compute_training_code_sha256(repository)
    resources = runtime_services.resources()
    if resources.available_bytes < MIN_AVAILABLE_BYTES:
        raise PrivateResearchError("AVAILABLE_MEMORY_LOW", "preflight")
    if resources.swap_bytes > 0:
        raise PrivateResearchError("SWAP_DETECTED", "preflight")
    binding = _make_binding(
        config=config,
        preflight=preflight,
        training_code_sha256=training_code_sha256,
    )
    run_root = preflight.root / "runs"
    if run_root.is_symlink() or not run_root.is_dir():
        raise PrivateResearchError("PATH_MISSING", str(run_root))
    run_path = run_root / config.run_id
    if run_path.exists() or run_path.is_symlink():
        raise PrivateResearchError("RUN_EXISTS", config.run_id)
    run_path.mkdir()
    paths = paths_for_run(run_path)
    paths.runtime_path.mkdir()
    with hold_run_lock(paths):
        state = create_initial_state(
            run_id=config.run_id,
            binding=binding,
            target_steps=config.steps,
        )
        write_run_state(paths, state)
        _set_deterministic_state(config.seed)
        dataset = PrivatePreparedDataset(
            root=preflight.root,
            split="train",
            seed=config.seed,
            repo_root=repository,
        )
        model = TinyMaskedVoxelAutoencoder().to(torch.device(config.device))
        optimizer = torch.optim.SGD(
            model.parameters(),
            lr=float(config.learning_rate),
        )
        losses = torch.empty(config.steps, dtype=torch.float64)
        pointer = commit_resume_snapshot(
            paths=paths,
            model=model,
            optimizer=optimizer,
            losses=losses[:0].clone(),
            reconstruction=None,
            completed_steps=0,
            generation=0,
            binding=binding,
            active_seconds=0.0,
            services=runtime_services,
        )
        state = transition_state(
            state,
            "running",
            snapshot_generation=pointer.generation,
            snapshot_steps=0,
        )
        write_run_state(paths, state)
        return _run_training_loop(
            paths=paths,
            state=state,
            preflight=preflight,
            repo_root=repository,
            dataset=dataset,
            model=model,
            optimizer=optimizer,
            losses=losses,
            reconstruction=None,
            pointer=pointer,
            completed_steps=0,
            snapshot_active_seconds=0.0,
            services=runtime_services,
            pause_signal=signal,
        )


def resume_private_training(
    config: PrivateResumeConfig,
    *,
    services: RuntimeServices | None = None,
    pause_signal: PauseSignal | None = None,
) -> PrivateTrainingResult:
    if not isinstance(config, PrivateResumeConfig):
        raise PrivateResearchError("CONFIG_INVALID", "resume config")
    validate_private_run_id(config.run_id)
    runtime_services = services or RuntimeServices()
    signal = pause_signal or NoPauseSignal()
    repository = Path(config.repo_root)
    preflight = run_private_preflight(root=Path(config.root), repo_root=repository)
    run_path = resolve_existing_private_run(
        root=preflight.root,
        repo_root=repository,
        run_id=config.run_id,
    )
    paths = paths_for_run(run_path)
    state = read_run_state(paths)
    recover_completed_publication = False
    if state.status == "completed":
        try:
            recover_completed_publication = (
                read_public_progress(paths)["state"] != "completed"
            )
        except PrivateResearchError:
            recover_completed_publication = True
        if not recover_completed_publication:
            raise PrivateResearchError("RUN_ALREADY_COMPLETED", config.run_id)
    _validate_resume_binding(
        state=state,
        preflight=preflight,
        repo_root=repository,
        run_id=config.run_id,
    )
    if recover_completed_publication:
        with hold_run_lock(paths):
            return _recover_completed_publication(
                paths=paths,
                state=state,
                preflight=preflight,
                services=runtime_services,
            )
    resources = runtime_services.resources()
    if resources.available_bytes < MIN_AVAILABLE_BYTES:
        raise PrivateResearchError("AVAILABLE_MEMORY_LOW", "resume")
    if resources.swap_bytes > 0:
        raise PrivateResearchError("SWAP_DETECTED", "resume")
    with hold_run_lock(paths):
        snapshot = load_latest_resume_snapshot(
            paths=paths,
            expected_binding=state.binding,
        )
        if snapshot.generation > state.snapshot_generation + 1:
            raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "generation ahead")
        lost_steps = max(0, state.completed_steps - snapshot.completed_steps)
        if state.status in {"initializing", "running", "pause_requested"}:
            state = transition_state(
                state,
                "interrupted",
                completed_steps=snapshot.completed_steps,
                snapshot_steps=snapshot.completed_steps,
                snapshot_generation=snapshot.generation,
                active_seconds=snapshot.active_seconds,
                lost_steps_on_last_resume=lost_steps,
                paused_at_epoch_seconds=None,
            )
            write_run_state(paths, state)
        paused_seconds = state.paused_seconds
        if state.status == "paused" and state.paused_at_epoch_seconds is not None:
            paused_seconds += max(
                0.0,
                runtime_services.wall_time() - state.paused_at_epoch_seconds,
            )
        dataset = PrivatePreparedDataset(
            root=preflight.root,
            split="train",
            seed=int(state.binding["seed"]),
            repo_root=repository,
        )
        model = TinyMaskedVoxelAutoencoder().to(torch.device("cpu"))
        optimizer = torch.optim.SGD(
            model.parameters(),
            lr=float(state.binding["learning_rate"]),
        )
        restore_model_optimizer(snapshot, model, optimizer)
        losses = torch.empty(state.target_steps, dtype=torch.float64)
        losses[: snapshot.completed_steps] = snapshot.losses
        running_state = transition_state(
            state,
            "running",
            completed_steps=snapshot.completed_steps,
            snapshot_steps=snapshot.completed_steps,
            snapshot_generation=snapshot.generation,
            active_seconds=snapshot.active_seconds,
            paused_seconds=paused_seconds,
            paused_at_epoch_seconds=None,
            lost_steps_on_last_resume=lost_steps,
        )
        write_run_state(paths, running_state)
        if snapshot.completed_steps > 0:
            _publish_training_progress(
                paths=paths,
                state="running",
                completed_steps=snapshot.completed_steps,
                target_steps=running_state.target_steps,
                active_seconds=snapshot.active_seconds,
                recent_steps_per_second=0.0,
                eta_seconds=0.0,
                snapshot_age_seconds=0.0,
                losses=losses,
            )
        if snapshot.completed_steps == running_state.target_steps:
            return _finalize_exact_target(
                paths=paths,
                state=running_state,
                preflight=preflight,
                repo_root=repository,
                model=model,
                losses=losses,
                reconstruction=snapshot.reconstruction,
                services=runtime_services,
            )
        return _run_training_loop(
            paths=paths,
            state=running_state,
            preflight=preflight,
            repo_root=repository,
            dataset=dataset,
            model=model,
            optimizer=optimizer,
            losses=losses,
            reconstruction=snapshot.reconstruction,
            pointer=SnapshotPointer(
                schema_version=1,
                active_slot=(
                    "resume-a.pt"
                    if snapshot.generation % 2 == 0
                    else "resume-b.pt"
                ),
                generation=snapshot.generation,
                snapshot_sha256="0" * 64,
            ),
            completed_steps=snapshot.completed_steps,
            snapshot_active_seconds=snapshot.active_seconds,
            services=runtime_services,
            pause_signal=signal,
        )


def train_private_research(
    config: PrivateTrainConfig,
    services: RuntimeServices | None = None,
) -> PrivateTrainingResult:
    return start_private_training(config, services=services)


def _run_training_loop(
    *,
    paths: PrivateRunPaths,
    state: PrivateRunState,
    preflight: PrivateResearchPreflight,
    repo_root: Path,
    dataset: PrivatePreparedDataset,
    model: TinyMaskedVoxelAutoencoder,
    optimizer: torch.optim.SGD,
    losses: torch.Tensor,
    reconstruction: torch.Tensor | None,
    pointer: SnapshotPointer,
    completed_steps: int,
    snapshot_active_seconds: float,
    services: RuntimeServices,
    pause_signal: PauseSignal,
) -> PrivateTrainingResult:
    binding = state.binding
    target_steps = state.target_steps
    batch_size = int(binding["batch_size"])
    device = torch.device(str(binding["device"]))
    session_started = services.monotonic()
    last_snapshot_time = session_started
    last_publish_time = session_started
    last_publish_steps = completed_steps
    model.train()
    for step_index in range(completed_steps, target_steps):
        batch = [
            dataset[(step_index * batch_size + offset) % len(dataset)]
            for offset in range(batch_size)
        ]
        targets = torch.stack([item[0] for item in batch]).to(device)
        visible = torch.stack([item[1] for item in batch]).to(device)
        mask = torch.stack([item[2] for item in batch]).to(device)
        optimizer.zero_grad(set_to_none=True)
        logits = model(visible)
        loss = masked_reconstruction_loss(logits, targets, mask)
        loss.backward()
        _require_finite_gradients(model)
        optimizer.step()
        loss_value = _finite_scalar(loss)
        losses[step_index] = loss_value
        reconstruction = (
            logits.detach()
            .argmax(dim=1)[0]
            .to("cpu", dtype=torch.uint8)
            .contiguous()
        )
        completed_steps = step_index + 1
        services.after_step(paths, completed_steps)
        resources = services.resources()
        signal_reason = pause_signal.consume()
        pause_reason = _poll_pause_reason(paths, resources, signal_reason)
        now = services.monotonic()
        active_seconds = snapshot_active_seconds + max(0.0, now - session_started)
        snapshot_due = now - last_snapshot_time >= CHECKPOINT_INTERVAL_SECONDS
        target_reached = completed_steps == target_steps
        if snapshot_due or pause_reason is not None or target_reached:
            pointer = commit_resume_snapshot(
                paths=paths,
                model=model,
                optimizer=optimizer,
                losses=losses[:completed_steps].clone(),
                reconstruction=reconstruction,
                completed_steps=completed_steps,
                generation=pointer.generation + 1,
                binding=binding,
                active_seconds=active_seconds,
                services=services,
            )
            last_snapshot_time = services.monotonic()
            state = replace(
                state,
                completed_steps=completed_steps,
                snapshot_steps=completed_steps,
                snapshot_generation=pointer.generation,
                active_seconds=active_seconds,
            )
            write_run_state(paths, state)
        publish_due = now - last_publish_time >= 1.0
        if publish_due or pause_reason is not None or target_reached:
            elapsed = max(0.0, now - last_publish_time)
            recent_speed = (
                (completed_steps - last_publish_steps) / elapsed
                if elapsed > 0.0
                else 0.0
            )
            eta = (
                (target_steps - completed_steps) / recent_speed
                if recent_speed > 0.0
                else 0.0
            )
            _publish_training_progress(
                paths=paths,
                state=state.status,
                completed_steps=completed_steps,
                target_steps=target_steps,
                active_seconds=active_seconds,
                recent_steps_per_second=recent_speed,
                eta_seconds=eta,
                snapshot_age_seconds=max(
                    0.0,
                    services.monotonic() - last_snapshot_time,
                ),
                losses=losses,
            )
            last_publish_time = now
            last_publish_steps = completed_steps
        if target_reached:
            return _finalize_exact_target(
                paths=paths,
                state=state,
                preflight=preflight,
                repo_root=repo_root,
                model=model,
                losses=losses,
                reconstruction=reconstruction,
                services=services,
            )
        if pause_reason is not None:
            return _finish_pause(
                paths=paths,
                state=state,
                pause_reason=pause_reason,
                completed_steps=completed_steps,
                target_steps=target_steps,
                active_seconds=active_seconds,
                losses=losses,
                services=services,
            )
    raise PrivateResearchError("TRAINING_STATE_INVALID", "loop exhausted")


def _finalize_exact_target(
    *,
    paths: PrivateRunPaths,
    state: PrivateRunState,
    preflight: PrivateResearchPreflight,
    repo_root: Path,
    model: TinyMaskedVoxelAutoencoder,
    losses: torch.Tensor,
    reconstruction: torch.Tensor | None,
    services: RuntimeServices,
) -> PrivateTrainingResult:
    if reconstruction is None or tuple(reconstruction.shape) != PRIVATE_SHAPE:
        raise PrivateResearchError("RECONSTRUCTION_INVALID", "terminal")
    require_repository_identity(repo_root, str(state.binding["code_revision"]))
    current_preflight = run_private_preflight(root=preflight.root, repo_root=repo_root)
    _require_same_preflight(current_preflight, state.binding)
    target_steps = state.target_steps
    completed_losses = losses[:target_steps].clone()
    if not bool(torch.isfinite(completed_losses).all()):
        raise PrivateResearchError("LOSS_NONFINITE", "finalization")
    metrics_bytes = b"".join(
        _canonical_json_bytes(
            {
                "step": index + 1,
                "masked_reconstruction_loss": float(completed_losses[index].item()),
            }
        )
        for index in range(target_steps)
    )
    reconstruction_bytes = reconstruction.contiguous().numpy().tobytes()
    if len(reconstruction_bytes) != 64**3:
        raise PrivateResearchError("RECONSTRUCTION_INVALID", "size")
    metrics_path = paths.run_path / "metrics.jsonl"
    reconstruction_path = paths.run_path / "reconstruction.bin"
    _write_or_verify_final(metrics_path, metrics_bytes)
    services.fault_hook("final_after_metrics_replace")
    _write_or_verify_final(reconstruction_path, reconstruction_bytes)
    services.fault_hook("final_after_reconstruction_replace")
    artifact_inventory = sorted(
        _current_regular_inventory(paths.run_path)
        | {"checkpoint.pt", "checkpoint_manifest.json"}
    )
    checkpoint_path = paths.run_path / "checkpoint.pt"
    manifest_path = paths.run_path / "checkpoint_manifest.json"
    manifest = save_private_checkpoint_v2(
        model=model,
        checkpoint_path=checkpoint_path,
        manifest_path=manifest_path,
        binding=state.binding,
        completed_steps=target_steps,
        artifact_inventory=artifact_inventory,
        metrics_sha256=hashlib.sha256(metrics_bytes).hexdigest(),
        reconstruction_sha256=hashlib.sha256(reconstruction_bytes).hexdigest(),
    )
    services.fault_hook("final_after_checkpoint_replace")
    services.fault_hook("final_after_manifest_replace")
    load_private_checkpoint(
        checkpoint_path=checkpoint_path,
        manifest_path=manifest_path,
        preflight=current_preflight,
        device="cpu",
    )
    completed_state = transition_state(
        state,
        "completed",
        completed_steps=target_steps,
        snapshot_steps=target_steps,
        paused_at_epoch_seconds=None,
    )
    write_run_state(paths, completed_state)
    services.fault_hook("final_after_completed_state_replace")
    _publish_training_progress(
        paths=paths,
        state="completed",
        completed_steps=target_steps,
        target_steps=target_steps,
        active_seconds=completed_state.active_seconds,
        recent_steps_per_second=0.0,
        eta_seconds=0.0,
        snapshot_age_seconds=0.0,
        losses=completed_losses,
    )
    run_private_preflight(root=preflight.root, repo_root=repo_root)
    return PrivateTrainingResult(
        run_path=paths.run_path,
        status="completed",
        completed_steps=target_steps,
        target_steps=target_steps,
        manifest=manifest,
    )


def _recover_completed_publication(
    *,
    paths: PrivateRunPaths,
    state: PrivateRunState,
    preflight: PrivateResearchPreflight,
    services: RuntimeServices,
) -> PrivateTrainingResult:
    snapshot = load_latest_resume_snapshot(
        paths=paths,
        expected_binding=state.binding,
    )
    if (
        snapshot.completed_steps != state.target_steps
        or snapshot.reconstruction is None
    ):
        raise PrivateResearchError("RESUME_SNAPSHOT_INVALID", "completed recovery")
    loaded = load_private_checkpoint(
        checkpoint_path=paths.run_path / "checkpoint.pt",
        manifest_path=paths.run_path / "checkpoint_manifest.json",
        preflight=preflight,
        device="cpu",
    )
    manifest = loaded.manifest
    for file_field, hash_field in (
        ("metrics_file", "metrics_sha256"),
        ("reconstruction_file", "reconstruction_sha256"),
    ):
        path = paths.run_path / str(manifest[file_field])
        if path.is_symlink() or not path.is_file():
            raise PrivateResearchError("FINAL_ARTIFACT_CONFLICT", path.name)
        if hashlib.sha256(path.read_bytes()).hexdigest() != manifest[hash_field]:
            raise PrivateResearchError("FINAL_ARTIFACT_CONFLICT", path.name)
    _publish_training_progress(
        paths=paths,
        state="completed",
        completed_steps=state.target_steps,
        target_steps=state.target_steps,
        active_seconds=state.active_seconds,
        recent_steps_per_second=0.0,
        eta_seconds=0.0,
        snapshot_age_seconds=0.0,
        losses=snapshot.losses,
    )
    return PrivateTrainingResult(
        run_path=paths.run_path,
        status="completed",
        completed_steps=state.target_steps,
        target_steps=state.target_steps,
        manifest=manifest,
    )


def _validate_fresh_config(config: PrivateTrainConfig) -> None:
    if not isinstance(config, PrivateTrainConfig):
        raise PrivateResearchError("CONFIG_INVALID", "config")
    validate_private_run_id(config.run_id)
    if config.seed != 7101 or isinstance(config.seed, bool):
        raise PrivateResearchError("CONFIG_INVALID", "seed")
    if not _is_positive_integer(config.steps):
        raise PrivateResearchError("CONFIG_INVALID", "steps")
    if config.batch_size != 1 or isinstance(config.batch_size, bool):
        raise PrivateResearchError("CONFIG_INVALID", "batch_size")
    if (
        isinstance(config.learning_rate, bool)
        or not isinstance(config.learning_rate, (int, float))
        or float(config.learning_rate) != 0.001
    ):
        raise PrivateResearchError("CONFIG_INVALID", "learning_rate")
    if config.device != "cpu":
        raise PrivateResearchError("CONFIG_INVALID", "device")
    if not _is_sha1(config.code_revision):
        raise PrivateResearchError("CONFIG_INVALID", "code_revision")


def _finish_pause(
    *,
    paths: PrivateRunPaths,
    state: PrivateRunState,
    pause_reason: str,
    completed_steps: int,
    target_steps: int,
    active_seconds: float,
    losses: torch.Tensor,
    services: RuntimeServices,
) -> PrivateTrainingResult:
    request_id = request_pause(paths, reason=pause_reason)
    request = read_pause_request(paths)
    recorded_reason = str(request["reason"])
    requested_state = transition_state(
        state,
        "pause_requested",
        completed_steps=completed_steps,
        snapshot_steps=completed_steps,
        pause_request_id=request_id,
        pause_reason=recorded_reason,
        active_seconds=active_seconds,
    )
    write_run_state(paths, requested_state)
    _publish_training_progress(
        paths=paths,
        state="pause_requested",
        completed_steps=completed_steps,
        target_steps=target_steps,
        active_seconds=active_seconds,
        recent_steps_per_second=0.0,
        eta_seconds=0.0,
        snapshot_age_seconds=0.0,
        losses=losses,
    )
    acknowledge_pause(paths, request_id=request_id)
    paused_state = transition_state(
        requested_state,
        "paused",
        pause_acknowledged_id=request_id,
        paused_at_epoch_seconds=services.wall_time(),
    )
    write_run_state(paths, paused_state)
    _publish_training_progress(
        paths=paths,
        state="paused",
        completed_steps=completed_steps,
        target_steps=target_steps,
        active_seconds=active_seconds,
        recent_steps_per_second=0.0,
        eta_seconds=0.0,
        snapshot_age_seconds=0.0,
        losses=losses,
    )
    return PrivateTrainingResult(
        run_path=paths.run_path,
        status="paused",
        completed_steps=completed_steps,
        target_steps=target_steps,
        manifest=None,
    )


def _validate_resume_binding(
    *,
    state: PrivateRunState,
    preflight: PrivateResearchPreflight,
    repo_root: Path,
    run_id: str,
) -> None:
    binding = state.binding
    expected_fields = {
        "run_id",
        "target_steps",
        "seed",
        "batch_size",
        "learning_rate",
        "device",
        "code_revision",
        "training_code_sha256",
        "prepared_manifest_sha256",
        "split_sha256",
        "dataset_hashes",
        "dataset_v3_gate",
        "python_version",
        "torch_version",
        "numpy_version",
    }
    if set(binding) != expected_fields:
        raise PrivateResearchError("RESUME_BINDING_MISMATCH", "fields")
    if (
        binding["run_id"] != run_id
        or binding["target_steps"] != state.target_steps
        or binding["seed"] != 7101
        or binding["batch_size"] != 1
        or float(binding["learning_rate"]) != 0.001
        or binding["device"] != "cpu"
        or binding["python_version"] != platform.python_version()
        or binding["torch_version"] != str(torch.__version__)
        or binding["numpy_version"] != np.__version__
    ):
        raise PrivateResearchError("RESUME_BINDING_MISMATCH", "configuration")
    require_repository_identity(repo_root, str(binding["code_revision"]))
    if compute_training_code_sha256(repo_root) != binding["training_code_sha256"]:
        raise PrivateResearchError("RESUME_BINDING_MISMATCH", "training code")
    _require_same_preflight(preflight, binding)


def _make_binding(
    *,
    config: PrivateTrainConfig,
    preflight: PrivateResearchPreflight,
    training_code_sha256: str,
) -> dict[str, Any]:
    return {
        "run_id": config.run_id,
        "target_steps": config.steps,
        "seed": config.seed,
        "batch_size": config.batch_size,
        "learning_rate": float(config.learning_rate),
        "device": config.device,
        "code_revision": config.code_revision,
        "training_code_sha256": training_code_sha256,
        "prepared_manifest_sha256": preflight.prepared_manifest_sha256,
        "split_sha256": preflight.split_sha256,
        "dataset_hashes": dict(preflight.dataset_hashes),
        "dataset_v3_gate": dict(preflight.dataset_v3_gate),
        "python_version": platform.python_version(),
        "torch_version": str(torch.__version__),
        "numpy_version": np.__version__,
    }


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


def _poll_pause_reason(
    paths: PrivateRunPaths,
    resources: Any,
    signal_reason: str | None,
) -> str | None:
    if resources.swap_bytes > 0:
        return "swap_detected"
    if resources.rss_bytes >= RSS_PAUSE_BYTES:
        return "memory_limit"
    if signal_reason is not None:
        if signal_reason != "signal":
            raise PrivateResearchError("PAUSE_REQUEST_INVALID", signal_reason)
        return "signal"
    if paths.pause_request_path.is_file() and not paths.pause_request_path.is_symlink():
        request = read_pause_request(paths)
        if request["request_id"] > request["acknowledged_id"]:
            return str(request["reason"])
    return None


def _publish_training_progress(
    *,
    paths: PrivateRunPaths,
    state: str,
    completed_steps: int,
    target_steps: int,
    active_seconds: float,
    recent_steps_per_second: float,
    eta_seconds: float,
    snapshot_age_seconds: float,
    losses: torch.Tensor,
) -> None:
    if completed_steps <= 0:
        raise PrivateResearchError("PROGRESS_INVALID", "completed_steps")
    current_loss = float(losses[completed_steps - 1].item())
    rolling_start = max(0, completed_steps - 100)
    rolling_loss = float(losses[rolling_start:completed_steps].mean().item())
    publish_progress(
        paths,
        state=state,
        completed_steps=completed_steps,
        target_steps=target_steps,
        active_seconds=active_seconds,
        recent_steps_per_second=recent_steps_per_second,
        eta_seconds=eta_seconds,
        snapshot_age_seconds=snapshot_age_seconds,
        current_loss=current_loss,
        rolling_loss=rolling_loss,
    )


def _require_same_preflight(
    preflight: PrivateResearchPreflight,
    binding: dict[str, Any],
) -> None:
    if (
        preflight.prepared_manifest_sha256 != binding["prepared_manifest_sha256"]
        or preflight.split_sha256 != binding["split_sha256"]
        or preflight.dataset_hashes != binding["dataset_hashes"]
        or preflight.dataset_v3_gate != binding["dataset_v3_gate"]
    ):
        raise PrivateResearchError("RESUME_BINDING_MISMATCH", "preflight")


def _current_regular_inventory(run_path: Path) -> set[str]:
    result: set[str] = set()
    for path in run_path.rglob("*"):
        if path.is_symlink():
            raise PrivateResearchError("RUN_ARTIFACT_INVALID", str(path))
        if path.is_file():
            result.add(path.relative_to(run_path).as_posix())
        elif path.is_dir() and path != run_path / ".runtime":
            raise PrivateResearchError("RUN_ARTIFACT_INVALID", str(path))
    return result


def _write_or_verify_final(path: Path, payload: bytes) -> None:
    if path.exists() or path.is_symlink():
        if path.is_symlink() or not path.is_file():
            raise PrivateResearchError("FINAL_ARTIFACT_CONFLICT", path.name)
        try:
            existing = path.read_bytes()
        except OSError as error:
            raise PrivateResearchError("FINAL_ARTIFACT_CONFLICT", path.name) from error
        if existing != payload:
            raise PrivateResearchError("FINAL_ARTIFACT_CONFLICT", path.name)
        return
    atomic_write_bytes(path, payload)


def _canonical_json_bytes(value: dict[str, Any]) -> bytes:
    return (
        json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n"
    ).encode("utf8")


def _is_positive_integer(value: Any) -> bool:
    return not isinstance(value, bool) and isinstance(value, int) and value > 0


def _is_sha1(value: Any) -> bool:
    return (
        isinstance(value, str)
        and len(value) == 40
        and all(character in "0123456789abcdef" for character in value)
    )
