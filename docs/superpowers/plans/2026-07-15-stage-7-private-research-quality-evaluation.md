# Stage 7 Private-Research Quality Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagent-driven development or dispatch parallel agents: the project owner requires sequential execution.

**Goal:** Add a deterministic, aggregate-only held-out evaluator and metadata-safe operational path for resource-bounded Stage 7 private-research training.

**Architecture:** Keep optimization in the existing isolated private trainer and add a separate post-training evaluator. Pure metric and baseline functions live in one focused module; checkpoint validation remains with private checkpoint code; orchestration and CLI behavior live in a separate evaluator module. All real artifacts remain under the ignored private root, while committed tests create synthetic volumes only below `.tmp/`.

**Tech Stack:** Python 3.12, PyTorch 2.13, NumPy 2.5, pytest 9; Node.js 24 package scripts and Markdown documentation; no new dependencies, network services, experiment trackers, or export paths.

## Global Constraints

- Keep Dataset v1/v2/v3 byte-identical with SHA-256 values `fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749`, `af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654`, and `5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082`.
- Keep Dataset v3 `ready_for_m3_real_data=false` and `training_eligible_count=0`; do not change M3 or enable M4 Apply Mode.
- Do not change normal Node generation or make it Python-dependent.
- All private inputs, exact metrics, reconstructions, checkpoints, weights, hashes, and generated outputs stay below `.local/stage7-private-research/` and are never pushed, published, uploaded, shared, packaged, or exported.
- Interactive commands may report only safety metadata, completion, quality-gate pass/fail, and formal-boundary status; never print exact private metrics, filenames, case IDs, source URLs, raw hashes, reconstructions, or weights.
- Do not alter the prepared 22-case corpus, its 15/7 split, or the 42 deferred oversized sources. Add no tiling, cropping, rescaling, or oversized-source processing.
- Use CPU, batch size `1`, learning rate `0.001`, seed `7101`, five deterministic masks per validation case, mask ratio `0.25`, and single-volume no-gradient evaluation for the first operational design.
- Do not run a real private training command during implementation. A later run requires a fresh owner-confirmed device and exact positive step count.
- Work sequentially with TDD and local commits. Do not push or open a pull request.
- Use only committed synthetic fixtures in tests. Never copy a real private record, volume, metric, checkpoint, or reconstruction into Git or terminal output.

---

## File structure

| Path | Responsibility |
|---|---|
| `training/stage7/mcagent_stage7/private_research_evaluation.py` | Pure deterministic mask seeds, aggregate metric accumulation, training-only class priors, and strict dual-baseline gate. |
| `training/stage7/mcagent_stage7/private_research.py` | Adds shared repository-relative CLI path, safe private run-ID, and existing-run resolution helpers. |
| `training/stage7/mcagent_stage7/private_research_checkpoints.py` | Adds checksum-bound, weights-only loading of the exact private model state. |
| `training/stage7/mcagent_stage7/evaluate_private_research.py` | Validates one completed private run, evaluates trained and baseline models, writes aggregate `evaluation.json`, and exposes the metadata-only CLI. |
| `training/stage7/mcagent_stage7/train_private_research.py` | Adds metadata-only stdout and error-code behavior without changing training or artifacts. |
| `training/stage7/tests/test_private_research_evaluation.py` | Unit tests for seeds, metrics, priors, absent classes, ties, and quality gate. |
| `training/stage7/tests/test_private_research_checkpoints.py` | Safe-load, checksum, state shape/dtype, finite-value, and run-boundary tests. |
| `training/stage7/tests/test_evaluate_private_research.py` | Synthetic 15/7 end-to-end evaluator, report schema, aggregate-only output, and refusal tests. |
| `training/stage7/tests/test_train_private_research.py` | Metadata-only trainer stdout and scrubbed error tests. |
| `package.json` | Adds the explicit private evaluation script. |
| `training/stage7/README.md` | Documents evaluation, time-to-step calibration, local-only metrics, and the no-training-without-budget gate. |
| `docs/superpowers/handoffs/2026-07-15-stage-7-private-quality-evaluation-ready.md` | Durable post-verification continuation protocol using an exact code-baseline relation that avoids the self-referential handoff-commit problem. |

## Task 1: Add deterministic aggregate metrics and baselines

**Files:**
- Create: `training/stage7/mcagent_stage7/private_research_evaluation.py`
- Create: `training/stage7/tests/test_private_research_evaluation.py`

**Interfaces:**
- Consumes: `PrivateResearchError`, `PRIVATE_TOKEN_COUNT`, and categorical PyTorch tensors.
- Produces: `derive_evaluation_seed(seed: int, validation_index: int, repeat_index: int) -> int`, `MetricAccumulator.update(targets: torch.Tensor, predictions: torch.Tensor, mask: torch.Tensor, nll_sum: float) -> None`, `MetricAccumulator.summary() -> dict[str, object]`, `build_class_prior(targets: Iterable[torch.Tensor]) -> torch.Tensor`, `class_prior_nll_sum(prior: torch.Tensor, targets: torch.Tensor, mask: torch.Tensor) -> float`, and `quality_gate(trained: dict[str, object], untrained: dict[str, object], class_prior: dict[str, object]) -> dict[str, bool]`.

- [ ] **Step 1: Write failing metric and baseline tests**

```python
from __future__ import annotations

import pytest
import torch

from mcagent_stage7.private_research import PrivateResearchError
from mcagent_stage7.private_research_evaluation import (
    MetricAccumulator,
    build_class_prior,
    class_prior_nll_sum,
    derive_evaluation_seed,
    quality_gate,
)


def test_evaluation_seed_has_a_stable_golden_value() -> None:
    assert derive_evaluation_seed(7101, 0, 0) == 1998645050
    assert derive_evaluation_seed(7101, 0, 1) != 1998645050


def test_metric_accumulator_reports_masked_non_air_macro_scores() -> None:
    targets = torch.tensor([0, 1, 1, 2], dtype=torch.long)
    predictions = torch.tensor([0, 1, 2, 2], dtype=torch.long)
    mask = torch.ones(4, dtype=torch.bool)
    accumulator = MetricAccumulator()
    accumulator.update(targets=targets, predictions=predictions, mask=mask, nll_sum=4.0)

    summary = accumulator.summary()

    assert summary["masked_count"] == 4
    assert summary["masked_cross_entropy"] == pytest.approx(1.0)
    assert summary["masked_accuracy"] == pytest.approx(0.75)
    assert summary["non_air_macro_f1"] == pytest.approx(2.0 / 3.0)
    assert summary["non_air_macro_iou"] == pytest.approx(0.5)
    assert summary["supported_non_air_class_count"] == 2


def test_metric_accumulator_rejects_no_non_air_support() -> None:
    accumulator = MetricAccumulator()
    values = torch.zeros(4, dtype=torch.long)
    accumulator.update(targets=values, predictions=values, mask=torch.ones(4, dtype=torch.bool), nll_sum=0.0)
    with pytest.raises(PrivateResearchError, match="EVALUATION_NO_NON_AIR_SUPPORT"):
        accumulator.summary()


def test_class_prior_is_train_only_add_one_smoothed_and_finite() -> None:
    prior = build_class_prior([torch.tensor([0, 0, 1], dtype=torch.long)])
    assert prior.shape == (9,)
    assert prior.tolist()[:3] == pytest.approx([3 / 12, 2 / 12, 1 / 12])
    assert float(prior.sum()) == pytest.approx(1.0)
    assert class_prior_nll_sum(prior, torch.tensor([0, 1]), torch.tensor([True, True])) > 0


def test_quality_gate_requires_both_metrics_to_strictly_beat_both_baselines() -> None:
    trained = {"non_air_macro_f1": 0.4, "non_air_macro_iou": 0.3}
    untrained = {"non_air_macro_f1": 0.2, "non_air_macro_iou": 0.1}
    prior = {"non_air_macro_f1": 0.0, "non_air_macro_iou": 0.0}
    assert quality_gate(trained, untrained, prior) == {
        "f1_beats_untrained": True,
        "f1_beats_class_prior": True,
        "iou_beats_untrained": True,
        "iou_beats_class_prior": True,
        "passed": True,
    }
    assert quality_gate(untrained, untrained, prior)["passed"] is False
```

- [ ] **Step 2: Run the focused test and verify the module is absent**

Run: `conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research_evaluation.py`

Expected: FAIL during collection with `ModuleNotFoundError: No module named 'mcagent_stage7.private_research_evaluation'`.

- [ ] **Step 3: Implement deterministic seeds, aggregate metrics, priors, and gate**

```python
from __future__ import annotations

import hashlib
import math
from collections.abc import Iterable
from typing import Any

import torch

from .private_research import PrivateResearchError
from .private_research_model import PRIVATE_TOKEN_COUNT


EVALUATION_MASK_NAMESPACE = "stage7-private-research-evaluation-mask-v1"


def derive_evaluation_seed(seed: int, validation_index: int, repeat_index: int) -> int:
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed < 2**32:
        raise PrivateResearchError("EVALUATION_CONFIG_INVALID", "seed")
    if isinstance(validation_index, bool) or not isinstance(validation_index, int) or validation_index < 0:
        raise PrivateResearchError("EVALUATION_CONFIG_INVALID", "validation_index")
    if isinstance(repeat_index, bool) or not isinstance(repeat_index, int) or repeat_index < 0:
        raise PrivateResearchError("EVALUATION_CONFIG_INVALID", "repeat_index")
    digest = hashlib.sha256(
        f"{EVALUATION_MASK_NAMESPACE}:{seed}:{validation_index}:{repeat_index}".encode("ascii")
    ).digest()
    return int.from_bytes(digest[:4], "big")


class MetricAccumulator:
    def __init__(self) -> None:
        self.confusion = torch.zeros((PRIVATE_TOKEN_COUNT, PRIVATE_TOKEN_COUNT), dtype=torch.int64)
        self.nll_sum = 0.0
        self.masked_count = 0

    def update(
        self,
        *,
        targets: torch.Tensor,
        predictions: torch.Tensor,
        mask: torch.Tensor,
        nll_sum: float,
    ) -> None:
        if targets.dtype != torch.long or predictions.dtype != torch.long:
            raise PrivateResearchError("EVALUATION_TENSOR_INVALID", "target/prediction dtype")
        if targets.shape != predictions.shape or targets.shape != mask.shape or mask.dtype != torch.bool:
            raise PrivateResearchError("EVALUATION_TENSOR_INVALID", "shape or mask dtype")
        if not bool(mask.any()):
            raise PrivateResearchError("EVALUATION_MASK_EMPTY", "mask")
        selected_targets = targets[mask].to("cpu")
        selected_predictions = predictions[mask].to("cpu")
        if int(selected_targets.min()) < 0 or int(selected_targets.max()) >= PRIVATE_TOKEN_COUNT:
            raise PrivateResearchError("EVALUATION_TENSOR_INVALID", "target range")
        if int(selected_predictions.min()) < 0 or int(selected_predictions.max()) >= PRIVATE_TOKEN_COUNT:
            raise PrivateResearchError("EVALUATION_TENSOR_INVALID", "prediction range")
        if not math.isfinite(float(nll_sum)) or float(nll_sum) < 0:
            raise PrivateResearchError("EVALUATION_METRIC_NONFINITE", "nll_sum")
        bins = torch.bincount(
            selected_targets * PRIVATE_TOKEN_COUNT + selected_predictions,
            minlength=PRIVATE_TOKEN_COUNT**2,
        ).reshape(PRIVATE_TOKEN_COUNT, PRIVATE_TOKEN_COUNT)
        self.confusion += bins
        self.nll_sum += float(nll_sum)
        self.masked_count += int(selected_targets.numel())

    def summary(self) -> dict[str, Any]:
        if self.masked_count <= 0:
            raise PrivateResearchError("EVALUATION_INCOMPLETE", "no masked predictions")
        supports = self.confusion.sum(dim=1)
        supported = [index for index in range(1, PRIVATE_TOKEN_COUNT) if int(supports[index]) > 0]
        if not supported:
            raise PrivateResearchError("EVALUATION_NO_NON_AIR_SUPPORT", "validation targets")
        f1_values: list[float] = []
        iou_values: list[float] = []
        for index in supported:
            true_positive = float(self.confusion[index, index])
            false_positive = float(self.confusion[:, index].sum()) - true_positive
            false_negative = float(self.confusion[index, :].sum()) - true_positive
            f1_values.append((2 * true_positive) / (2 * true_positive + false_positive + false_negative))
            iou_values.append(true_positive / (true_positive + false_positive + false_negative))
        summary = {
            "masked_count": self.masked_count,
            "masked_cross_entropy": self.nll_sum / self.masked_count,
            "masked_accuracy": float(self.confusion.diag().sum()) / self.masked_count,
            "non_air_macro_f1": sum(f1_values) / len(f1_values),
            "non_air_macro_iou": sum(iou_values) / len(iou_values),
            "supported_non_air_class_count": len(supported),
            "class_supports": supports.tolist(),
            "confusion_matrix": self.confusion.tolist(),
        }
        if any(not math.isfinite(float(summary[key])) for key in (
            "masked_cross_entropy", "masked_accuracy", "non_air_macro_f1", "non_air_macro_iou"
        )):
            raise PrivateResearchError("EVALUATION_METRIC_NONFINITE", "summary")
        return summary


def build_class_prior(targets: Iterable[torch.Tensor]) -> torch.Tensor:
    counts = torch.ones(PRIVATE_TOKEN_COUNT, dtype=torch.float64)
    seen = 0
    for target in targets:
        if target.dtype != torch.long or target.numel() == 0:
            raise PrivateResearchError("EVALUATION_TENSOR_INVALID", "class-prior target")
        if int(target.min()) < 0 or int(target.max()) >= PRIVATE_TOKEN_COUNT:
            raise PrivateResearchError("EVALUATION_TENSOR_INVALID", "class-prior range")
        counts += torch.bincount(target.reshape(-1).to("cpu"), minlength=PRIVATE_TOKEN_COUNT)
        seen += 1
    if seen == 0:
        raise PrivateResearchError("EVALUATION_INCOMPLETE", "empty training split")
    return counts / counts.sum()


def class_prior_nll_sum(prior: torch.Tensor, targets: torch.Tensor, mask: torch.Tensor) -> float:
    if prior.shape != (PRIVATE_TOKEN_COUNT,) or prior.dtype != torch.float64:
        raise PrivateResearchError("EVALUATION_BASELINE_INVALID", "class prior")
    values = -torch.log(prior[targets[mask].to("cpu")]).sum()
    result = float(values.item())
    if not math.isfinite(result):
        raise PrivateResearchError("EVALUATION_METRIC_NONFINITE", "class-prior nll")
    return result


def quality_gate(
    trained: dict[str, Any], untrained: dict[str, Any], class_prior: dict[str, Any]
) -> dict[str, bool]:
    comparisons = {
        "f1_beats_untrained": trained["non_air_macro_f1"] > untrained["non_air_macro_f1"],
        "f1_beats_class_prior": trained["non_air_macro_f1"] > class_prior["non_air_macro_f1"],
        "iou_beats_untrained": trained["non_air_macro_iou"] > untrained["non_air_macro_iou"],
        "iou_beats_class_prior": trained["non_air_macro_iou"] > class_prior["non_air_macro_iou"],
    }
    return {**comparisons, "passed": all(comparisons.values())}
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research_evaluation.py`

Expected: `5 passed` and exit code `0`.

- [ ] **Step 5: Commit the metric task**

```bash
git add training/stage7/mcagent_stage7/private_research_evaluation.py training/stage7/tests/test_private_research_evaluation.py
git commit -m "feat(stage7): add private evaluation metrics"
```

## Task 2: Add shared run containment and safe private checkpoint loading

**Files:**
- Modify: `training/stage7/mcagent_stage7/private_research.py`
- Modify: `training/stage7/mcagent_stage7/private_research_checkpoints.py`
- Create: `training/stage7/tests/test_private_research_checkpoints.py`
- Modify: `training/stage7/mcagent_stage7/train_private_research.py`

**Interfaces:**
- Produces: `DEFAULT_REPO_ROOT`, `resolve_private_cli_paths(root: Path, repo_root: Path) -> tuple[Path, Path]`, `validate_private_run_id(run_id: str) -> str`, `resolve_existing_private_run(root: Path, repo_root: Path, run_id: str) -> Path`, `LoadedPrivateCheckpoint`, and `load_private_checkpoint(checkpoint_path: Path, manifest_path: Path, preflight: PrivateResearchPreflight, device: str = "cpu") -> LoadedPrivateCheckpoint`.
- Changes the trainer only to consume the shared run-ID validator; optimization and its four artifacts remain unchanged.

- [ ] **Step 1: Write failing run-boundary and checkpoint-load tests**

```python
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
import torch

from mcagent_stage7.private_research import (
    DEFAULT_REPO_ROOT,
    PrivateResearchError,
    PrivateResearchPreflight,
    resolve_private_cli_paths,
    resolve_existing_private_run,
    validate_private_run_id,
)
from mcagent_stage7.private_research_checkpoints import (
    load_private_checkpoint,
    save_private_checkpoint,
)
from mcagent_stage7.private_research_model import TinyMaskedVoxelAutoencoder


def test_run_id_and_existing_run_resolution_reject_escape(tmp_path: Path) -> None:
    assert validate_private_run_id("cpu-quality-run") == "cpu-quality-run"
    with pytest.raises(PrivateResearchError, match="RUN_ID_INVALID"):
        validate_private_run_id("../escape")


def test_private_cli_root_is_resolved_from_repository_not_python_cwd() -> None:
    private_root, repo_root = resolve_private_cli_paths(
        root=Path(".local/stage7-private-research"), repo_root=DEFAULT_REPO_ROOT
    )
    assert repo_root == Path(__file__).resolve().parents[3]
    assert private_root == repo_root / ".local" / "stage7-private-research"


def test_safe_loader_binds_manifest_hashes_and_exact_model_state(tmp_path: Path) -> None:
    checkpoint = tmp_path / "checkpoint.pt"
    manifest_path = tmp_path / "checkpoint_manifest.json"
    input_hash = hashlib.sha256(b"prepared").hexdigest()
    split_hash = hashlib.sha256(b"split").hexdigest()
    save_private_checkpoint(
        model=TinyMaskedVoxelAutoencoder(), checkpoint_path=checkpoint, manifest_path=manifest_path,
        input_manifest_sha256=input_hash, split_sha256=split_hash, seed=7101, device="cpu",
        code_revision="test", training_config={"steps": 1, "batch_size": 1, "learning_rate": 0.001},
    )
    preflight = PrivateResearchPreflight(
        root=tmp_path, case_count=22, sources_manifest_sha256="0" * 64,
        prepared_manifest_sha256=input_hash, split_sha256=split_hash,
        dataset_hashes={"v1": "1" * 64, "v2": "2" * 64, "v3": "3" * 64},
        dataset_v3_gate={"ready_for_m3_real_data": False, "training_eligible_count": 0},
    )

    loaded = load_private_checkpoint(
        checkpoint_path=checkpoint, manifest_path=manifest_path, preflight=preflight, device="cpu"
    )

    assert loaded.manifest["training_scope"] == "private-research-only"
    assert loaded.manifest["distribution"] == "prohibited"
    assert loaded.checkpoint_sha256 == hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    assert loaded.model.training is False


def test_safe_loader_rejects_changed_checkpoint_hash(tmp_path: Path) -> None:
    checkpoint, manifest_path, preflight = make_checkpoint(tmp_path)
    checkpoint.write_bytes(checkpoint.read_bytes() + b"changed")
    with pytest.raises(PrivateResearchError, match="CHECKPOINT_HASH_MISMATCH"):
        load_private_checkpoint(
            checkpoint_path=checkpoint, manifest_path=manifest_path, preflight=preflight, device="cpu"
        )


@pytest.mark.parametrize("mutation", ["shape", "dtype", "nonfinite"])
def test_safe_loader_rejects_invalid_state(tmp_path: Path, mutation: str) -> None:
    checkpoint, manifest_path, preflight = make_checkpoint(tmp_path)
    state = torch.load(checkpoint, map_location="cpu", weights_only=True)
    first_name = next(iter(state))
    if mutation == "shape":
        state[first_name] = state[first_name].reshape(-1)
    elif mutation == "dtype":
        state[first_name] = state[first_name].to(torch.float64)
    else:
        state[first_name] = torch.full_like(state[first_name], float("nan"))
    torch.save(state, checkpoint, _use_new_zipfile_serialization=False)
    manifest = json.loads(manifest_path.read_text("utf8"))
    manifest["checkpoint_sha256"] = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    manifest_path.write_text(json.dumps(manifest), encoding="utf8")
    with pytest.raises(PrivateResearchError, match="CHECKPOINT_MODEL_INVALID"):
        load_private_checkpoint(
            checkpoint_path=checkpoint, manifest_path=manifest_path, preflight=preflight, device="cpu"
        )


def test_safe_loader_rejects_invalid_training_configuration(tmp_path: Path) -> None:
    checkpoint, manifest_path, preflight = make_checkpoint(tmp_path)
    manifest = json.loads(manifest_path.read_text("utf8"))
    manifest["config"]["steps"] = 0
    manifest_path.write_text(json.dumps(manifest), encoding="utf8")
    with pytest.raises(PrivateResearchError, match="CHECKPOINT_MANIFEST_INVALID"):
        load_private_checkpoint(
            checkpoint_path=checkpoint, manifest_path=manifest_path, preflight=preflight, device="cpu"
        )
```

Add this complete helper to the same test file:

```python
def make_checkpoint(tmp_path: Path) -> tuple[Path, Path, PrivateResearchPreflight]:
    checkpoint = tmp_path / "checkpoint.pt"
    manifest_path = tmp_path / "checkpoint_manifest.json"
    input_hash = hashlib.sha256(b"prepared").hexdigest()
    split_hash = hashlib.sha256(b"split").hexdigest()
    save_private_checkpoint(
        model=TinyMaskedVoxelAutoencoder(), checkpoint_path=checkpoint, manifest_path=manifest_path,
        input_manifest_sha256=input_hash, split_sha256=split_hash, seed=7101, device="cpu",
        code_revision="test", training_config={"steps": 1, "batch_size": 1, "learning_rate": 0.001},
    )
    preflight = PrivateResearchPreflight(
        root=tmp_path, case_count=22, sources_manifest_sha256="0" * 64,
        prepared_manifest_sha256=input_hash, split_sha256=split_hash,
        dataset_hashes={"v1": "1" * 64, "v2": "2" * 64, "v3": "3" * 64},
        dataset_v3_gate={"ready_for_m3_real_data": False, "training_eligible_count": 0},
    )
    return checkpoint, manifest_path, preflight
```

- [ ] **Step 2: Run the focused checkpoint tests and verify the imports fail**

Run: `conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research_checkpoints.py`

Expected: FAIL during collection because `resolve_existing_private_run`, `validate_private_run_id`, and `load_private_checkpoint` do not exist.

- [ ] **Step 3: Add repository-relative CLI paths, shared run IDs, and existing-run resolution**

Add to `private_research.py` and replace the trainer's private `_RUN_ID` check with `validate_private_run_id(config.run_id)`:

```python
DEFAULT_REPO_ROOT = Path(__file__).resolve().parents[3]
PRIVATE_RUN_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def resolve_private_cli_paths(*, root: Path, repo_root: Path) -> tuple[Path, Path]:
    repository = Path(repo_root).resolve()
    candidate = Path(root)
    private_root = candidate.resolve() if candidate.is_absolute() else (repository / candidate).resolve()
    return private_root, repository


def validate_private_run_id(run_id: str) -> str:
    if not isinstance(run_id, str) or not PRIVATE_RUN_ID.fullmatch(run_id):
        raise PrivateResearchError("RUN_ID_INVALID", str(run_id))
    return run_id


def resolve_existing_private_run(*, root: Path, repo_root: Path, run_id: str) -> Path:
    validate_private_run_id(run_id)
    repository = _resolved_directory(repo_root)
    private_root = _resolved_private_root(root, repository)
    run_path = _private_candidate(private_root, repository, f"runs/{run_id}")
    if not run_path.is_dir():
        raise PrivateResearchError("RUN_MISSING", run_id)
    return run_path
```

Import `re` in `private_research.py`. Remove `re` and `_RUN_ID` from `train_private_research.py`; import `validate_private_run_id` there. Do not change trainer path creation, model, optimizer, ordering, defaults, or artifacts.

- [ ] **Step 4: Implement exact checksum-bound weights-only loading**

Add this surface to `private_research_checkpoints.py`:

```python
@dataclass(frozen=True)
class LoadedPrivateCheckpoint:
    model: TinyMaskedVoxelAutoencoder
    manifest: dict[str, Any]
    checkpoint_sha256: str


def load_private_checkpoint(
    *,
    checkpoint_path: Path,
    manifest_path: Path,
    preflight: PrivateResearchPreflight,
    device: str = "cpu",
) -> LoadedPrivateCheckpoint:
    if device != "cpu":
        raise PrivateResearchError("EVALUATION_CONFIG_INVALID", "device")
    checkpoint_path = Path(checkpoint_path)
    manifest_path = Path(manifest_path)
    manifest = _read_manifest(manifest_path)
    required = {
        "source", "schema_version", "training_scope", "distribution", "private_research_only",
        "input_manifest_sha256", "prepared_taxonomy_version", "split_sha256", "seed", "device",
        "code_revision", "config", "checkpoint_file", "checkpoint_sha256",
    }
    if set(manifest) != required:
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", "fields")
    if (
        manifest["source"] != PRIVATE_CHECKPOINT_SOURCE
        or manifest["schema_version"] != 1
        or manifest["training_scope"] != "private-research-only"
        or manifest["distribution"] != "prohibited"
        or manifest["private_research_only"] is not True
        or manifest["prepared_taxonomy_version"] != PRIVATE_TAXONOMY_VERSION
        or manifest["input_manifest_sha256"] != preflight.prepared_manifest_sha256
        or manifest["split_sha256"] != preflight.split_sha256
        or manifest["checkpoint_file"] != checkpoint_path.name
    ):
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", "boundary")
    training_config = manifest["config"]
    if (
        isinstance(manifest["seed"], bool)
        or not isinstance(manifest["seed"], int)
        or not 0 <= manifest["seed"] < 2**32
        or not isinstance(manifest["device"], str)
        or manifest["device"] not in {"cpu", "cuda"}
        or not isinstance(manifest["code_revision"], str)
        or not manifest["code_revision"].strip()
        or not isinstance(training_config, dict)
        or set(training_config) != {"steps", "batch_size", "learning_rate"}
        or isinstance(training_config["steps"], bool)
        or not isinstance(training_config["steps"], int)
        or training_config["steps"] <= 0
        or isinstance(training_config["batch_size"], bool)
        or not isinstance(training_config["batch_size"], int)
        or training_config["batch_size"] <= 0
        or isinstance(training_config["learning_rate"], bool)
        or not isinstance(training_config["learning_rate"], (int, float))
        or not math.isfinite(float(training_config["learning_rate"]))
        or float(training_config["learning_rate"]) <= 0
    ):
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", "configuration")
    actual_hash = _sha256_file(checkpoint_path)
    if actual_hash != manifest["checkpoint_sha256"]:
        raise PrivateResearchError("CHECKPOINT_HASH_MISMATCH", checkpoint_path.name)
    expected_model = TinyMaskedVoxelAutoencoder()
    expected_state = expected_model.state_dict()
    try:
        state = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    except Exception as error:
        raise PrivateResearchError("CHECKPOINT_MODEL_INVALID", "weights-only load") from error
    if not isinstance(state, dict) or set(state) != set(expected_state):
        raise PrivateResearchError("CHECKPOINT_MODEL_INVALID", "state keys")
    for name, expected in expected_state.items():
        value = state[name]
        if (
            not isinstance(value, torch.Tensor)
            or value.shape != expected.shape
            or value.dtype != expected.dtype
            or not value.is_floating_point()
            or not bool(torch.isfinite(value).all())
        ):
            raise PrivateResearchError("CHECKPOINT_MODEL_INVALID", name)
    try:
        expected_model.load_state_dict(state, strict=True)
    except RuntimeError as error:
        raise PrivateResearchError("CHECKPOINT_MODEL_INVALID", "state load") from error
    expected_model.to(torch.device(device)).eval()
    return LoadedPrivateCheckpoint(model=expected_model, manifest=manifest, checkpoint_sha256=actual_hash)


def _read_manifest(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text("utf8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", path.name) from error
    if not isinstance(value, dict):
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", path.name)
    return value
```

Import `dataclass`, `math`, `PrivateResearchPreflight`, and `TinyMaskedVoxelAutoencoder`. Retain `save_private_checkpoint` unchanged.

- [ ] **Step 5: Run checkpoint, trainer, and model regression tests**

Run: `conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research_checkpoints.py tests/test_train_private_research.py tests/test_private_research_model.py`

Expected: all tests pass with no change to the existing four training artifacts.

- [ ] **Step 6: Commit the containment and safe-load task**

```bash
git add training/stage7/mcagent_stage7/private_research.py training/stage7/mcagent_stage7/private_research_checkpoints.py training/stage7/mcagent_stage7/train_private_research.py training/stage7/tests/test_private_research_checkpoints.py
git commit -m "feat(stage7): validate private evaluation checkpoints"
```

## Task 3: Build aggregate-only held-out evaluation orchestration

**Files:**
- Create: `training/stage7/mcagent_stage7/evaluate_private_research.py`
- Create: `training/stage7/tests/test_evaluate_private_research.py`

**Interfaces:**
- Consumes: Task 1 metric functions, Task 2 safe checkpoint loader and run resolver, `PrivatePreparedDataset`, `make_masked_batch`, and the existing preflight.
- Produces: `PrivateEvaluationConfig`, `PrivateEvaluationArtifacts`, and `evaluate_private_research(config) -> PrivateEvaluationArtifacts`.

- [ ] **Step 1: Write a synthetic 15/7 end-to-end evaluator test**

```python
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import pytest
import torch

from mcagent_stage7.evaluate_private_research import (
    PrivateEvaluationConfig,
    evaluate_private_research,
)
from mcagent_stage7.private_research import PrivateResearchError, run_private_preflight
from mcagent_stage7.private_research_checkpoints import save_private_checkpoint
from mcagent_stage7.private_research_model import TinyMaskedVoxelAutoencoder


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_evaluator_writes_one_aggregate_report_for_exactly_35_evaluations(monkeypatch: pytest.MonkeyPatch) -> None:
    root = make_ready_evaluation_root()

    def fast_forward(self: TinyMaskedVoxelAutoencoder, visible: torch.Tensor) -> torch.Tensor:
        logits = torch.zeros((visible.shape[0], 9, 64, 64, 64), dtype=torch.float32)
        logits[:, 1] = 1.0
        return logits

    monkeypatch.setattr(TinyMaskedVoxelAutoencoder, "forward", fast_forward)
    artifacts = evaluate_private_research(PrivateEvaluationConfig(
        root=root, repo_root=REPO_ROOT, run_id="quality", seed=7101,
        mask_repeats=5, mask_ratio=0.25, device="cpu",
    ))

    report_text = artifacts.report_path.read_text("utf8")
    report = json.loads(report_text)
    assert artifacts.report_path == root / "runs" / "quality" / "evaluation.json"
    assert report["training_scope"] == "private-research-only"
    assert report["distribution"] == "prohibited"
    assert report["evaluation_config"]["evaluated_case_count"] == 7
    assert report["evaluation_config"]["completed_evaluations"] == 35
    assert set(report["metrics"]) == {"trained", "untrained", "class_prior"}
    assert {entry.name for entry in (root / "runs" / "quality").iterdir()} == {
        "metrics.jsonl", "reconstruction.bin", "checkpoint.pt",
        "checkpoint_manifest.json", "evaluation.json",
    }
    assert "pr-eval" not in report_text
    assert str(root) not in report_text


def test_evaluator_refuses_to_overwrite_or_accept_extra_run_artifacts() -> None:
    root = make_ready_evaluation_root()
    report = root / "runs" / "quality" / "evaluation.json"
    report.write_text("{}", encoding="utf8")
    with pytest.raises(PrivateResearchError, match="EVALUATION_EXISTS"):
        evaluate_private_research(PrivateEvaluationConfig(
            root=root, repo_root=REPO_ROOT, run_id="quality"
        ))


def test_evaluator_refuses_an_extra_training_artifact() -> None:
    root = make_ready_evaluation_root()
    (root / "runs" / "quality" / "extra.log").write_text("unexpected", encoding="utf8")
    with pytest.raises(PrivateResearchError, match="RUN_ARTIFACT_INVALID"):
        evaluate_private_research(PrivateEvaluationConfig(
            root=root, repo_root=REPO_ROOT, run_id="quality"
        ))


def test_evaluator_refuses_a_symlinked_run_directory() -> None:
    root = make_ready_evaluation_root()
    (root / "runs" / "alias").symlink_to(root / "runs" / "quality", target_is_directory=True)
    with pytest.raises(PrivateResearchError, match="PATH_MISSING"):
        evaluate_private_research(PrivateEvaluationConfig(
            root=root, repo_root=REPO_ROOT, run_id="alias"
        ))


def make_ready_evaluation_root() -> Path:
    root = REPO_ROOT / ".tmp" / "stage7-private-evaluation-test"
    shutil.rmtree(root, ignore_errors=True)
    for name in ("source", "manifests", "prepared", "splits", "runs"):
        (root / name).mkdir(parents=True, exist_ok=True)
    (root / "PRIVATE_RESEARCH_ACK.json").write_text(json.dumps({
        "scope": "stage7-private-research-only", "distribution_prohibited": True,
        "dataset_v3_unchanged": True, "m4_apply_mode_unchanged": True,
        "acknowledged_at": "2026-07-15T00:00:00.000Z", "acknowledged_by": "test-owner",
    }), encoding="utf8")
    source_records: list[dict[str, object]] = []
    prepared_records: list[dict[str, object]] = []
    case_ids = [f"pr-eval-{index:02d}" for index in range(22)]
    for index, case_id in enumerate(case_ids):
        source_bytes = f"synthetic-evaluation-source-{index}".encode("ascii")
        source_sha = hashlib.sha256(source_bytes).hexdigest()
        source_path = root / "source" / f"case-{index:02d}.schematic"
        source_path.write_bytes(source_bytes)
        voxels = bytes([(index % 8) + 1]) * (64 ** 3)
        voxel_path = root / "prepared" / f"{case_id}.voxels.bin"
        voxel_path.write_bytes(voxels)
        record = {
            "source_id": case_id, "source_sha256": source_sha,
            "taxonomy_version": "private-raw-material-family-v1", "shape": [64, 64, 64],
            "voxel_path": f"prepared/{case_id}.voxels.bin", "metadata_path": f"prepared/{case_id}.json",
            "voxel_sha256": hashlib.sha256(voxels).hexdigest(), "rights_state": "unverified",
            "distribution": "prohibited", "purpose": "local-private-research-only",
        }
        (root / "prepared" / f"{case_id}.json").write_text(json.dumps(record), encoding="utf8")
        prepared_records.append(record)
        source_records.append({
            "source_id": case_id, "source_path": f"source/case-{index:02d}.schematic",
            "content_sha256": source_sha, "rights_state": "unverified",
            "distribution": "prohibited", "purpose": "local-private-research-only",
        })
    (root / "manifests" / "sources.jsonl").write_text(
        "".join(json.dumps(record) + "\n" for record in source_records), encoding="utf8"
    )
    (root / "manifests" / "prepared.jsonl").write_text(
        "".join(json.dumps(record) + "\n" for record in prepared_records), encoding="utf8"
    )
    (root / "splits" / "split.json").write_text(json.dumps({
        "case_ids": case_ids, "train_case_ids": case_ids[:15], "validation_case_ids": case_ids[15:],
    }), encoding="utf8")
    preflight = run_private_preflight(root=root, repo_root=REPO_ROOT)
    run_path = root / "runs" / "quality"
    run_path.mkdir()
    save_private_checkpoint(
        model=TinyMaskedVoxelAutoencoder(), checkpoint_path=run_path / "checkpoint.pt",
        manifest_path=run_path / "checkpoint_manifest.json",
        input_manifest_sha256=preflight.prepared_manifest_sha256,
        split_sha256=preflight.split_sha256, seed=7101, device="cpu", code_revision="test",
        training_config={"steps": 1, "batch_size": 1, "learning_rate": 0.001},
    )
    (run_path / "metrics.jsonl").write_text(
        json.dumps({"step": 1, "masked_reconstruction_loss": 1.0}) + "\n", encoding="utf8"
    )
    (run_path / "reconstruction.bin").write_bytes(bytes(64 ** 3))
    return root
```

- [ ] **Step 2: Run the evaluator test and verify the module is absent**

Run: `conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_evaluate_private_research.py`

Expected: FAIL during collection with `ModuleNotFoundError: No module named 'mcagent_stage7.evaluate_private_research'`.

- [ ] **Step 3: Define evaluator configuration, artifact validation, and model accumulation**

Create `evaluate_private_research.py` with these exact public records and helpers:

```python
from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import torch
import torch.nn.functional as functional

from .private_research import (
    PrivatePreparedDataset, PrivateResearchError, make_masked_batch,
    resolve_existing_private_run, run_private_preflight,
)
from .private_research_checkpoints import load_private_checkpoint
from .private_research_evaluation import (
    MetricAccumulator, build_class_prior, class_prior_nll_sum,
    derive_evaluation_seed, quality_gate,
)
from .private_research_model import PRIVATE_SHAPE, PRIVATE_TOKEN_COUNT, TinyMaskedVoxelAutoencoder


EVALUATION_SOURCE = "stage7-private-research-evaluation-v1"
MODEL_NAME = "tiny-masked-voxel-autoencoder-v1"
TRAINING_ARTIFACTS = {
    "metrics.jsonl", "reconstruction.bin", "checkpoint.pt", "checkpoint_manifest.json"
}


@dataclass(frozen=True)
class PrivateEvaluationConfig:
    root: Path
    repo_root: Path
    run_id: str
    seed: int = 7101
    mask_repeats: int = 5
    mask_ratio: float = 0.25
    device: str = "cpu"


@dataclass(frozen=True)
class PrivateEvaluationArtifacts:
    report_path: Path
    report: dict[str, Any]
    quality_gate_passed: bool


def _validate_config(config: PrivateEvaluationConfig) -> None:
    if not isinstance(config, PrivateEvaluationConfig):
        raise PrivateResearchError("EVALUATION_CONFIG_INVALID", "config")
    if config.device != "cpu" or config.seed != 7101:
        raise PrivateResearchError("EVALUATION_CONFIG_INVALID", "device or seed")
    if config.mask_repeats != 5 or config.mask_ratio != 0.25:
        raise PrivateResearchError("EVALUATION_CONFIG_INVALID", "mask protocol")


def _validate_training_artifacts(run_path: Path, expected_steps: int) -> None:
    try:
        entries = list(run_path.iterdir())
    except OSError as error:
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "run directory") from error
    if any(entry.is_symlink() or not entry.is_file() for entry in entries):
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "entry type")
    names = {entry.name for entry in entries}
    if "evaluation.json" in names:
        raise PrivateResearchError("EVALUATION_EXISTS", "evaluation.json")
    if names != TRAINING_ARTIFACTS:
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "artifact set")
    try:
        reconstruction_size = (run_path / "reconstruction.bin").stat().st_size
        lines = (run_path / "metrics.jsonl").read_text("utf8").splitlines()
    except (OSError, UnicodeDecodeError) as error:
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "artifact read") from error
    if reconstruction_size != 64 ** 3:
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "reconstruction size")
    if len(lines) != expected_steps:
        raise PrivateResearchError("RUN_ARTIFACT_INVALID", "metrics count")
    for index, line in enumerate(lines, start=1):
        try:
            metric = json.loads(line)
        except json.JSONDecodeError as error:
            raise PrivateResearchError("RUN_ARTIFACT_INVALID", "metrics JSON") from error
        if (
            metric.get("step") != index
            or set(metric) != {"step", "masked_reconstruction_loss"}
            or not isinstance(metric["masked_reconstruction_loss"], (int, float))
            or not math.isfinite(float(metric["masked_reconstruction_loss"]))
        ):
            raise PrivateResearchError("RUN_ARTIFACT_INVALID", "metrics row")


def _update_model(
    accumulator: MetricAccumulator,
    model: TinyMaskedVoxelAutoencoder,
    targets: torch.Tensor,
    visible: torch.Tensor,
    mask: torch.Tensor,
) -> None:
    logits = model(visible)
    masked_logits = logits.permute(0, 2, 3, 4, 1)[mask]
    masked_targets = targets[mask]
    nll_sum = float(functional.cross_entropy(masked_logits, masked_targets, reduction="sum").item())
    predictions = logits.argmax(dim=1)
    accumulator.update(targets=targets, predictions=predictions, mask=mask, nll_sum=nll_sum)
```

- [ ] **Step 4: Implement the complete train-only prior and 35-pass evaluation flow**

```python
def evaluate_private_research(config: PrivateEvaluationConfig) -> PrivateEvaluationArtifacts:
    _validate_config(config)
    torch.manual_seed(config.seed)
    torch.use_deterministic_algorithms(True)
    torch.set_num_threads(1)
    preflight = run_private_preflight(root=Path(config.root), repo_root=Path(config.repo_root))
    run_path = resolve_existing_private_run(
        root=preflight.root, repo_root=Path(config.repo_root), run_id=config.run_id
    )
    report_path = run_path / "evaluation.json"
    if report_path.exists() or report_path.is_symlink():
        raise PrivateResearchError("EVALUATION_EXISTS", report_path.name)
    manifest_path = run_path / "checkpoint_manifest.json"
    checkpoint_path = run_path / "checkpoint.pt"
    loaded = load_private_checkpoint(
        checkpoint_path=checkpoint_path, manifest_path=manifest_path,
        preflight=preflight, device=config.device,
    )
    if loaded.manifest["seed"] != config.seed or loaded.manifest["device"] != "cpu":
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", "evaluation seed or device")
    expected_steps = loaded.manifest["config"].get("steps")
    if isinstance(expected_steps, bool) or not isinstance(expected_steps, int) or expected_steps <= 0:
        raise PrivateResearchError("CHECKPOINT_MANIFEST_INVALID", "steps")
    _validate_training_artifacts(run_path, expected_steps)

    train_dataset = PrivatePreparedDataset(
        root=preflight.root, split="train", seed=config.seed, repo_root=Path(config.repo_root)
    )
    validation_dataset = PrivatePreparedDataset(
        root=preflight.root, split="validation", seed=config.seed, repo_root=Path(config.repo_root)
    )
    if len(train_dataset) != 15 or len(validation_dataset) != 7:
        raise PrivateResearchError("EVALUATION_SPLIT_INVALID", "expected 15 train and 7 validation")
    prior = build_class_prior(train_dataset[index][0] for index in range(len(train_dataset)))
    prior_prediction = int(prior.argmax().item())

    torch.manual_seed(config.seed)
    untrained = TinyMaskedVoxelAutoencoder().to(torch.device(config.device)).eval()
    trained_accumulator = MetricAccumulator()
    untrained_accumulator = MetricAccumulator()
    prior_accumulator = MetricAccumulator()
    completed = 0
    with torch.no_grad():
        for validation_index in range(len(validation_dataset)):
            target = validation_dataset[validation_index][0].unsqueeze(0).to(torch.device(config.device))
            for repeat_index in range(config.mask_repeats):
                mask_seed = derive_evaluation_seed(config.seed, validation_index, repeat_index)
                visible, mask = make_masked_batch(target.to("cpu"), seed=mask_seed, ratio=config.mask_ratio)
                visible = visible.to(torch.device(config.device))
                mask = mask.to(torch.device(config.device))
                _update_model(trained_accumulator, loaded.model, target, visible, mask)
                _update_model(untrained_accumulator, untrained, target, visible, mask)
                prior_predictions = torch.full_like(target, prior_prediction)
                prior_accumulator.update(
                    targets=target, predictions=prior_predictions, mask=mask,
                    nll_sum=class_prior_nll_sum(prior, target.to("cpu"), mask.to("cpu")),
                )
                completed += 1
    if completed != 35:
        raise PrivateResearchError("EVALUATION_INCOMPLETE", str(completed))

    metrics = {
        "trained": trained_accumulator.summary(),
        "untrained": untrained_accumulator.summary(),
        "class_prior": prior_accumulator.summary(),
    }
    gate = quality_gate(metrics["trained"], metrics["untrained"], metrics["class_prior"])
    postflight = run_private_preflight(root=preflight.root, repo_root=Path(config.repo_root))
    report = {
        "source": EVALUATION_SOURCE,
        "schema_version": 1,
        "training_scope": "private-research-only",
        "distribution": "prohibited",
        "private_research_only": True,
        "model_name": MODEL_NAME,
        "checkpoint_file": checkpoint_path.name,
        "checkpoint_sha256": loaded.checkpoint_sha256,
        "prepared_manifest_sha256": postflight.prepared_manifest_sha256,
        "split_sha256": postflight.split_sha256,
        "evaluation_config": {
            "device": config.device, "seed": config.seed, "mask_ratio": config.mask_ratio,
            "mask_repeats": config.mask_repeats, "evaluated_case_count": len(validation_dataset),
            "completed_evaluations": completed,
        },
        "metrics": metrics,
        "quality_gate": gate,
        "finite_and_complete": True,
        "dataset_hashes": postflight.dataset_hashes,
        "dataset_v3_gate": postflight.dataset_v3_gate,
    }
    try:
        report_path.write_text(json.dumps(report, sort_keys=True, indent=2) + "\n", encoding="utf8")
    except OSError as error:
        raise PrivateResearchError("EVALUATION_WRITE_FAILED", report_path.name) from error
    run_private_preflight(root=preflight.root, repo_root=Path(config.repo_root))
    return PrivateEvaluationArtifacts(
        report_path=report_path, report=report, quality_gate_passed=gate["passed"]
    )
```

Do not add per-case output, a reconstruction reader, inference export, early stopping, or checkpoint selection.

- [ ] **Step 5: Run the evaluator and metric tests**

Run: `conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_evaluate_private_research.py tests/test_private_research_evaluation.py tests/test_private_research_checkpoints.py`

Expected: all tests pass; the synthetic report has exactly 35 completed evaluations and contains no synthetic case ID or absolute root path.

- [ ] **Step 6: Commit the evaluator orchestration task**

```bash
git add training/stage7/mcagent_stage7/evaluate_private_research.py training/stage7/tests/test_evaluate_private_research.py
git commit -m "feat(stage7): evaluate private held-out volumes"
```

## Task 4: Add metadata-safe CLIs, package script, and operator documentation

**Files:**
- Modify: `training/stage7/mcagent_stage7/evaluate_private_research.py`
- Modify: `training/stage7/mcagent_stage7/train_private_research.py`
- Modify: `training/stage7/tests/test_evaluate_private_research.py`
- Modify: `training/stage7/tests/test_train_private_research.py`
- Modify: `package.json`
- Modify: `training/stage7/README.md`

**Interfaces:**
- Produces: repository-root-relative `.local/` resolution for both private CLIs, `npm run evaluate:stage7:private-research`, required `--private-research-only` and `--metadata-only` evaluator flags, and metadata-only trainer output.
- Preserves: existing non-metadata trainer output for compatibility, existing optimizer and artifacts, all Node generation behavior, and all M3/M4 boundaries.

- [ ] **Step 1: Write failing metadata-output CLI tests**

Add these tests with monkeypatched training/evaluation functions so no real private run or optimizer executes:

```python
def test_trainer_metadata_only_never_prints_loss(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    import mcagent_stage7.train_private_research as module
    fake = module.PrivateRunArtifacts(
        checkpoint_path=Path("checkpoint.pt"), manifest_path=Path("checkpoint_manifest.json"),
        metrics_path=Path("metrics.jsonl"), reconstruction_path=Path("reconstruction.bin"),
        manifest={"training_scope": "private-research-only", "distribution": "prohibited"},
        final_loss=123.456,
    )
    monkeypatch.setattr(module, "train_private_research", lambda config: fake)
    assert module.main([
        "--root", ".tmp/private", "--run-id", "safe", "--private-research-only",
        "--metadata-only", "--steps", "1", "--device", "cpu",
    ]) == 0
    output = capsys.readouterr().out
    assert "training_scope: private-research-only" in output
    assert "distribution: prohibited" in output
    assert "run_complete: true" in output
    assert "123.456" not in output and "final_loss" not in output


def test_trainer_cli_resolves_dot_local_from_repository_root(monkeypatch: pytest.MonkeyPatch) -> None:
    import mcagent_stage7.train_private_research as module
    captured: list[module.PrivateTrainConfig] = []
    fake = module.PrivateRunArtifacts(
        checkpoint_path=Path("checkpoint.pt"), manifest_path=Path("checkpoint_manifest.json"),
        metrics_path=Path("metrics.jsonl"), reconstruction_path=Path("reconstruction.bin"),
        manifest={"training_scope": "private-research-only", "distribution": "prohibited"},
        final_loss=1.0,
    )
    monkeypatch.setattr(module, "train_private_research", lambda config: captured.append(config) or fake)
    assert module.main([
        "--root", ".local/stage7-private-research", "--run-id", "safe",
        "--private-research-only", "--metadata-only", "--steps", "1", "--device", "cpu",
    ]) == 0
    assert captured[0].repo_root == Path(__file__).resolve().parents[3]
    assert captured[0].root == captured[0].repo_root / ".local" / "stage7-private-research"


def test_evaluator_cli_prints_only_safety_and_gate_booleans(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    import mcagent_stage7.evaluate_private_research as module
    fake = module.PrivateEvaluationArtifacts(
        report_path=Path("evaluation.json"),
        report={"training_scope": "private-research-only", "distribution": "prohibited"},
        quality_gate_passed=False,
    )
    monkeypatch.setattr(module, "evaluate_private_research", lambda config: fake)
    assert module.main([
        "--root", ".tmp/private", "--run-id", "safe", "--private-research-only",
        "--metadata-only", "--seed", "7101", "--mask-repeats", "5",
        "--mask-ratio", "0.25", "--device", "cpu",
    ]) == 0
    assert capsys.readouterr().out.splitlines() == [
        "training_scope: private-research-only",
        "distribution: prohibited",
        "evaluation_complete: true",
        "quality_gate_passed: false",
    ]
```

Add this complete error test:

```python
def test_trainer_metadata_only_scrubs_private_error_detail(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    import mcagent_stage7.train_private_research as module

    def fail(config: module.PrivateTrainConfig) -> module.PrivateRunArtifacts:
        raise module.PrivateResearchError("SOURCE_HASH_CHANGED", "secret-name.schematic")

    monkeypatch.setattr(module, "train_private_research", fail)
    with pytest.raises(SystemExit):
        module.main([
            "--root", ".tmp/private", "--run-id", "safe", "--private-research-only",
            "--metadata-only", "--steps", "1", "--device", "cpu",
        ])
    error = capsys.readouterr().err
    assert "SOURCE_HASH_CHANGED" in error
    assert "secret-name.schematic" not in error
```

- [ ] **Step 2: Run the two CLI test files and verify the new arguments fail**

Run: `conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_train_private_research.py tests/test_evaluate_private_research.py`

Expected: FAIL because `--metadata-only` and the evaluator `main` function are absent.

- [ ] **Step 3: Add repository-relative paths, metadata-only trainer output, and scrubbed operational errors**

In `train_private_research.py`, import `DEFAULT_REPO_ROOT` and `resolve_private_cli_paths`, change `--repo-root` to `default=DEFAULT_REPO_ROOT`, add `parser.add_argument("--metadata-only", action="store_true")`, and resolve paths before constructing the config:

```python
    private_root, repository = resolve_private_cli_paths(
        root=arguments.root, repo_root=arguments.repo_root
    )
```

Pass `root=private_root` and `repo_root=repository` to `PrivateTrainConfig`, then replace the end of `main` with:

```python
    except PrivateResearchError as error:
        parser.error(error.code if arguments.metadata_only else str(error))
    print(f"training_scope: {artifacts.manifest['training_scope']}")
    print(f"distribution: {artifacts.manifest['distribution']}")
    print("run_complete: true")
    if not arguments.metadata_only:
        print(f"final_loss: {artifacts.final_loss}")
    return 0
```

The metadata flag changes stdout and error detail only. Do not change training defaults, model, optimizer, data order, run directory, checkpoint bytes, metrics file, or reconstruction file.

- [ ] **Step 4: Add the evaluator CLI with mandatory safety flags**

Import `DEFAULT_REPO_ROOT` and `resolve_private_cli_paths` from `private_research`, then append to `evaluate_private_research.py`:

```python
def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Evaluate the local-only Stage 7 private-research model")
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--private-research-only", action="store_true")
    parser.add_argument("--metadata-only", action="store_true")
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    parser.add_argument("--seed", type=int, default=7101)
    parser.add_argument("--mask-repeats", type=int, default=5)
    parser.add_argument("--mask-ratio", type=float, default=0.25)
    parser.add_argument("--device", choices=("cpu",), default="cpu")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    arguments = parser.parse_args(argv)
    if not arguments.private_research_only:
        parser.error("--private-research-only acknowledgement is required")
    if not arguments.metadata_only:
        parser.error("--metadata-only is required")
    private_root, repository = resolve_private_cli_paths(
        root=arguments.root, repo_root=arguments.repo_root
    )
    try:
        artifacts = evaluate_private_research(PrivateEvaluationConfig(
            root=private_root, repo_root=repository, run_id=arguments.run_id,
            seed=arguments.seed, mask_repeats=arguments.mask_repeats,
            mask_ratio=arguments.mask_ratio, device=arguments.device,
        ))
    except PrivateResearchError as error:
        parser.error(error.code)
    print(f"training_scope: {artifacts.report['training_scope']}")
    print(f"distribution: {artifacts.report['distribution']}")
    print("evaluation_complete: true")
    print(f"quality_gate_passed: {str(artifacts.quality_gate_passed).lower()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: Add the package command and exact operator documentation**

Add this script to `package.json` without modifying normal generation scripts:

```json
"evaluate:stage7:private-research": "conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.evaluate_private_research"
```

Add to `training/stage7/README.md`:

````markdown
### Private held-out quality evaluation

The evaluator is separate from optimization. It uses the existing 15/7 private split, evaluates five deterministic 25% masks per validation case, and compares non-air macro F1/IoU against an untrained model and a training-only add-one-smoothed class-prior baseline. Exact metrics remain only in `runs/cpu-quality-run/evaluation.json`; stdout reports only scope, distribution, completion, and quality-gate pass/fail.

Before any overnight run, obtain explicit owner approval for `device=cpu` and `steps=5`, run a fresh five-step batch-one calibration under `/usr/bin/time -v`, and require at least 8 GiB available memory and no more than 2 GiB maximum resident memory. For a later owner-supplied window of `W` seconds, use `floor(0.80 * W / (calibration_seconds / 5))` as the proposed steps, then obtain explicit approval of that exact positive step count.

Evaluation command for a completed substantive private run:

```bash
npm run evaluate:stage7:private-research -- --root .local/stage7-private-research --run-id cpu-quality-run --private-research-only --metadata-only --seed 7101 --mask-repeats 5 --mask-ratio 0.25 --device cpu
```

This command never exports inference, samples, metrics, checkpoints, or weights and never changes Dataset v1/v2/v3, Dataset v3's false/zero gate, normal Node generation, or M4 Apply Mode.
````

- [ ] **Step 6: Run CLI, evaluator, trainer, and documentation tests**

Run: `conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_train_private_research.py tests/test_evaluate_private_research.py tests/test_private_research_evaluation.py tests/test_private_research_checkpoints.py`

Expected: all focused Python tests pass and captured stdout contains no numeric private metric.

Run: `/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/docsProjectStatus.test.js`

Expected: documentation/project-status tests pass without changing normal Node generation.

- [ ] **Step 7: Commit the metadata-safe CLI task**

```bash
git add package.json training/stage7/README.md training/stage7/mcagent_stage7/evaluate_private_research.py training/stage7/mcagent_stage7/train_private_research.py training/stage7/tests/test_evaluate_private_research.py training/stage7/tests/test_train_private_research.py
git commit -m "feat(stage7): add metadata-safe private evaluation CLI"
```

## Task 5: Verify the readiness boundary and write a non-self-referential handoff

**Files:**
- Create: `docs/superpowers/handoffs/2026-07-15-stage-7-private-quality-evaluation-ready.md`

**Interfaces:**
- Consumes: all implementation commits and their verified tests.
- Produces: a durable continuation record for later five-step calibration and time-budgeted training; it authorizes neither run by itself.

- [ ] **Step 1: Run the complete Stage 7 Python suite**

Run: `npm run test:stage7:m3`

Expected: every Stage 7 Python test passes with exit code `0`; no private-root record or metric appears in output.

- [ ] **Step 2: Run the relevant private and normal Node boundary tests**

Run: `/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PrivateResearchBoundary.test.js test/stage7PrivateResearchCorpus.test.js test/stage7PrivateResearchCli.test.js test/docsProjectStatus.test.js`

Expected: all selected Node tests pass. If nested `spawnSync` receives sandbox `EPERM`, rerun this exact Node command with narrowly scoped normal child-process permission; do not weaken or skip tests.

- [ ] **Step 3: Run the full Node suite**

Run: `/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test`

Expected: the full Node suite passes with zero failures. Request narrowly scoped normal child-process permission only if the documented sandbox `EPERM` occurs.

- [ ] **Step 4: Verify formal Dataset hashes and gate without modifying files**

Run:

```bash
sha256sum mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json
```

Expected, in order:

```text
fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749
af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654
5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082
```

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node -e "const m=require('./mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json'); console.log(JSON.stringify({ready_for_m3_real_data:m.ready_for_m3_real_data,training_eligible_count:m.training_eligible_count}));"
```

Expected: `{"ready_for_m3_real_data":false,"training_eligible_count":0}`.

- [ ] **Step 5: Verify aggregate private corpus invariants without printing records**

Run: `git ls-files .local/stage7-private-research`

Expected: no output.

Run: `git check-ignore -q .local/stage7-private-research`

Expected: exit code `0` and no output.

Run:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node -e "const fs=require('fs'),path=require('path'); const root=path.join(process.cwd(),'.local/stage7-private-research'); const lines=(file)=>fs.readFileSync(file,'utf8').trim().split(/\n/).filter(Boolean).length; const split=JSON.parse(fs.readFileSync(path.join(root,'splits/split.json'),'utf8')); const prepared=fs.readdirSync(path.join(root,'prepared')).filter((name)=>name.endsWith('.voxels.bin')); console.log(JSON.stringify({source_files:fs.readdirSync(path.join(root,'source')).filter((name)=>name.endsWith('.schematic')).length,deferred_oversized:fs.readdirSync(path.join(root,'deferred/oversized')).filter((name)=>name.endsWith('.schematic')).length,source_records:lines(path.join(root,'manifests/sources.jsonl')),prepared_records:lines(path.join(root,'manifests/prepared.jsonl')),prepared_binary_count:prepared.length,all_prepared_64_cubed:prepared.every((name)=>fs.statSync(path.join(root,'prepared',name)).size===64**3),train_cases:split.train_case_ids.length,validation_cases:split.validation_case_ids.length,run_artifacts:fs.readdirSync(path.join(root,'runs')).length}));"
```

Expected:

```json
{"source_files":22,"deferred_oversized":42,"source_records":22,"prepared_records":22,"prepared_binary_count":22,"all_prepared_64_cubed":true,"train_cases":15,"validation_cases":7,"run_artifacts":0}
```

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -c "import json; from pathlib import Path; from mcagent_stage7.private_research import run_private_preflight; result=run_private_preflight(root=Path('../../.local/stage7-private-research'),repo_root=Path('../..')); print(json.dumps({'preflight':'passed','case_count':result.case_count,'dataset_v3_gate':result.dataset_v3_gate},sort_keys=True,separators=(',',':')))"
```

Expected:

```json
{"case_count":22,"dataset_v3_gate":{"ready_for_m3_real_data":false,"training_eligible_count":0},"preflight":"passed"}
```

The Python preflight proves source/prepared hashes, markers, sidecars, token bounds, split uniqueness, and formal Dataset boundaries without printing private records. Stop if any command differs. Do not print manifest rows, private filenames, source URLs, or raw hashes.

- [ ] **Step 6: Record the exact code baseline before creating the handoff**

Run: `git status --short`

Expected: no output.

Run: `git rev-parse HEAD`

Expected: one 40-character lowercase commit hash. Save this literal value as the handoff's `approved_code_revision`; do not describe the later handoff commit as the code revision.

- [ ] **Step 7: Write the durable handoff with an exact parent-relation protocol**

Create `docs/superpowers/handoffs/2026-07-15-stage-7-private-quality-evaluation-ready.md`. It must contain:

- the literal `approved_code_revision` captured in Step 6;
- the exact branch name and clean status;
- the verified test commands and pass counts from Steps 1–3;
- only aggregate private counts and formal Dataset hashes/gate from Steps 4–5;
- the metadata-only trainer and evaluator commands with concrete safe example run IDs;
- the five-step CPU calibration resource gates and time-window formula;
- a statement that no real training ran during implementation;
- the continuing prohibition on private export, Dataset changes, M4, and the 42 deferred oversized sources; and
- this continuation protocol, which avoids requiring a handoff file to contain its own impossible commit hash:

```bash
git status --short
git branch --show-current
git rev-parse HEAD^
git log -1 --format=%s
git diff --name-only HEAD^..HEAD
```

The protocol expects a clean status, the recorded branch, `HEAD^` equal to the literal `approved_code_revision`, subject `docs(stage7): hand off private quality evaluation`, and the diff-name output to contain only `docs/superpowers/handoffs/2026-07-15-stage-7-private-quality-evaluation-ready.md`. Any mismatch stops before private checks or training.

- [ ] **Step 8: Check and commit the handoff only**

Run: `git diff --check`

Expected: no output.

```bash
git add docs/superpowers/handoffs/2026-07-15-stage-7-private-quality-evaluation-ready.md
git commit -m "docs(stage7): hand off private quality evaluation"
```

- [ ] **Step 9: Prove the committed handoff relation and clean tree**

Run: `git status --short`

Expected: no output.

Run: `git rev-parse HEAD^`

Expected: exactly the `approved_code_revision` recorded in the handoff.

Run: `git log -1 --format=%s`

Expected: `docs(stage7): hand off private quality evaluation`.

Run: `git diff --name-only HEAD^..HEAD`

Expected: `docs/superpowers/handoffs/2026-07-15-stage-7-private-quality-evaluation-ready.md` and no other path.

## Post-implementation operational gate

Implementation completion does not start training. In a new operational turn:

1. Read the complete new handoff and run its Git relation checks exactly.
2. Run all aggregate private and formal Dataset checks read-only; stop on any drift.
3. Obtain explicit owner confirmation of `device=cpu` and `steps=5` for one fresh calibration run.
4. Require at least 8 GiB available memory, run batch `1`, learning rate `0.001`, seed `7101`, metadata-only output, and system time/RSS measurement.
5. Stop if peak RSS exceeds 2 GiB, the process reports swap activity, any value is non-finite, or any boundary changes.
6. Ask the owner for the exact overnight start/end time, calculate proposed steps with `floor(0.80 * W / (calibration_seconds / 5))`, and obtain explicit approval of that exact positive count.
7. Run the substantive trainer once, then the evaluator once, audit only local aggregate metadata, recheck formal hashes/gate, and stop without automatic retraining.
