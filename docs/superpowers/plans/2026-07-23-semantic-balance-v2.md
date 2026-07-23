# Semantic Balance V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic train-only semantic balancing, compare two fixed objective profiles, and confirm the selected profile on validation and untouched test data without changing the dataset, taxonomy, model topology, or production construction flow.

**Architecture:** A new `semantic_balance.py` module owns profile validation, train-only class-weight calculation, and the canonical weight digest. `training_data.py` owns the optional hybrid mask because it already validates targets and controls mask budgets. The training loop resolves one immutable balance configuration before constructing its checkpoint binding; the loss receives weights only for balanced profiles. Evaluation remains uniformly masked, becomes split-aware, and adds fixed phase-two acceptance and deterministic ablation ranking.

**Tech Stack:** Python 3.12, PyTorch 2.13, NumPy 2.5, pytest, Node.js/npm, JSON checkpoint metadata, existing conda environment `mcagent-stage7`.

## Global Constraints

- Keep token IDs `0..8`, `mapTrainingToken`, prepared sample bytes, source-level split assignments, and `TinyVoxelCompletionModel` parameter shapes unchanged.
- Keep the four existing `training:*` npm commands; extend arguments instead of adding another command.
- Use only train-split `TrainingSample.token_counts` to calculate semantic weights.
- Keep occupancy cross-entropy and validation/test mask selection unchanged.
- Use new run IDs for every experiment; never resume `heldout-7101` or an ablation into the final run.
- Keep generated datasets, checkpoints, reports, and reconstructions under the existing ignored root `/home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.local/training`.
- Do not commit `.local/training`, checkpoints, prepared samples, reconstructions, or generated metrics.
- Run each red test before implementation, observe the expected failure, implement the smallest passing change, rerun the focused test, then run the surrounding test file.
- Commit after each task only when its focused and regression tests pass.
- Do not tune weights, thresholds, step counts, or selection rules after observing ablation or test results.
- The final documentation task removes this plan and its design specification after observed results are recorded in current project documentation.

---

## Task 1: Add the train-only semantic balance value object

**Files:**

- Create: `training/stage7/mcagent_stage7/semantic_balance.py`
- Create: `training/stage7/tests/test_semantic_balance.py`

- [ ] **Step 1: Write failing tests for profile validation, exact weights, and digest**

Add tests that construct lightweight sample records with `token_counts` tuples.
The principal deterministic case uses non-air counts:

```python
COUNTS = (0, 64, 16, 4, 1, 64, 16, 4, 1)
EXPECTED = (1.0, 2.0, 4.0, 4.0, 1.0, 2.0, 4.0, 4.0)
```

The tests must prove:

```python
balance = build_semantic_balance(samples, "weighted")
assert balance.profile == "weighted"
assert balance.class_weights == EXPECTED
assert balance.class_weights_sha256 == hashlib.sha256(
    json.dumps(
        {"source": "semantic-balance-v2", "weights": list(EXPECTED)},
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf8")
).hexdigest()

none = build_semantic_balance(samples_with_missing_classes, "none")
assert none.class_weights == (1.0,) * 8

with pytest.raises(TrainingError, match="SEMANTIC_BALANCE_PROFILE_INVALID"):
    build_semantic_balance(samples, "unknown")

with pytest.raises(TrainingError, match="SEMANTIC_CLASS_SUPPORT_MISSING"):
    build_semantic_balance(samples_with_missing_classes, "weighted")
```

Also test that the constructor rejects the wrong vector length, boolean/NaN/
infinite values, values outside `[1.0, 4.0]`, and a digest that does not match
the exact vector.

- [ ] **Step 2: Run the new test file and verify the expected import failure**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 \
  python -m pytest -q -p no:cacheprovider tests/test_semantic_balance.py
```

Expected: FAIL because `mcagent_stage7.semantic_balance` does not exist.

- [ ] **Step 3: Implement the immutable balance configuration**

Create `semantic_balance.py` with the constants and canonical digest:

```python
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

from .training_data import TOKEN_COUNT, TrainingError


OBJECTIVE_VERSION = "semantic-balance-v2"
SEMANTIC_BALANCE_PROFILES = ("none", "weighted", "weighted-mask")
UNIT_CLASS_WEIGHTS = (1.0,) * (TOKEN_COUNT - 1)


@dataclass(frozen=True)
class SemanticBalance:
    profile: str
    class_weights: tuple[float, ...]
    class_weights_sha256: str


def semantic_class_weights_sha256(weights: tuple[float, ...]) -> str:
    payload = json.dumps(
        {"source": OBJECTIVE_VERSION, "weights": list(weights)},
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf8")
    return hashlib.sha256(payload).hexdigest()
```

Add `SemanticBalance.__post_init__` to validate the profile, require exactly
eight finite numeric weights in `[1.0, 4.0]`, and compare the supplied digest
with `semantic_class_weights_sha256(class_weights)`.

Add
`build_semantic_balance(samples: Iterable[_HasTokenCounts], profile: str)`.
For `none`, return unit weights without requiring every class to occur. For
balanced profiles, aggregate token-count indexes `1..8`, require positive
integer support for every class, and calculate
`min(4.0, max(1.0, math.sqrt(max_count / count)))`. Use integer count
aggregation, explicitly reject malformed token-count vectors, negative/bool
counts, missing classes, and non-finite calculated values. Even though the
frequency formula is specified, simplify
`max(frequency) / frequency[c]` to the exactly equivalent
`max_count / count[c]` to avoid unnecessary floating-point normalization.

- [ ] **Step 4: Run focused and surrounding tests**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 \
  python -m pytest -q -p no:cacheprovider \
  tests/test_semantic_balance.py tests/test_training_data.py
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add training/stage7/mcagent_stage7/semantic_balance.py \
  training/stage7/tests/test_semantic_balance.py
git commit -m "feat(training): derive semantic class weights"
```

---

## Task 2: Add the deterministic hybrid class-aware mask

**Files:**

- Modify: `training/stage7/mcagent_stage7/training_data.py`
- Modify: `training/stage7/tests/test_training_data.py`

- [ ] **Step 1: Add failing mask-behavior tests**

Extend `test_training_data.py` with tests that call:

```python
visible, mask = make_balanced_mask(
    targets,
    seed=7101,
    semantic_balance="weighted-mask",
)
```

Cover all of these cases:

- the same targets and seed produce byte-identical masks;
- a mixed patch selects the exact same total, air, and non-air counts as
  `semantic_balance="none"`;
- a rare present class receives more selected positions than under a uniform
  mask for a fixed constructed target and seed;
- every selected position is unique, proven by the boolean mask count matching
  the selected air plus selected class counts;
- class-quota shortages are redistributed until the original non-air budget is
  filled;
- a fully occupied patch retains the existing 25% total mask count;
- an all-air patch still raises `MASK_CLASS_MISSING`;
- invalid profile strings raise `SEMANTIC_BALANCE_PROFILE_INVALID`;
- omitting `semantic_balance` is exactly equal to explicitly passing `"none"`.

Use synthetic tensors of shape `(1, 32, 32, 32)` and calculate expectations
from target values instead of depending on private helper functions.

- [ ] **Step 2: Run the focused mask tests and verify failure**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 \
  python -m pytest -q -p no:cacheprovider \
  tests/test_training_data.py -k "mask"
```

Expected: FAIL because `make_balanced_mask` does not accept
`semantic_balance`.

- [ ] **Step 3: Extend `make_balanced_mask` without changing the legacy path**

Change the signature to:

```python
def make_balanced_mask(
    targets: torch.Tensor,
    seed: int,
    ratio: float = 0.25,
    semantic_balance: str = "none",
) -> tuple[torch.Tensor, torch.Tensor]:
```

Validate the profile against `("none", "weighted", "weighted-mask")`.
For `none` and `weighted`, leave the current `torch.randperm(non_air)` logic
byte-for-byte equivalent. For `weighted-mask`, call a new private helper named
`_class_aware_non_air_selection` after the existing `non_air_count` has been
calculated. It receives `flattened`, `non_air`, `count`, `seed`, and the
already-advanced `torch.Generator`, then returns one tensor of selected flat
indices.

Implement the approved algorithm exactly:

1. `quota_budget = count // 2`;
2. gather ascending token IDs present in `non_air`;
3. rotate that list by `seed % len(present)`;
4. assign `quota_budget // len(present)` plus the ordered remainder;
5. choose each class's positions with the same generator;
6. redistribute shortages one position at a time in the same cyclic order,
   skipping exhausted classes;
7. fill `count - selected_count` from all unselected non-air positions using
   the same generator;
8. assert the returned tensor length is `count` and
   `torch.unique(result).numel() == count`, otherwise raise
   `MASK_SELECTION_INVALID`.

Do not use Python sets to determine selection order. Keep tensor/device
placement consistent with the input so CPU and CUDA behavior remain valid.

- [ ] **Step 4: Run focused, file-level, and CUDA-guarded tests**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 \
  python -m pytest -q -p no:cacheprovider \
  tests/test_training_data.py -k "mask"
conda run -n mcagent-stage7 --cwd training/stage7 \
  python -m pytest -q -p no:cacheprovider tests/test_training_data.py
```

Expected: PASS; CUDA-only tests may report skipped when CUDA is unavailable.

- [ ] **Step 5: Commit Task 2**

```bash
git add training/stage7/mcagent_stage7/training_data.py \
  training/stage7/tests/test_training_data.py
git commit -m "feat(training): add class-aware semantic mask"
```

---

## Task 3: Weight only the semantic objective

**Files:**

- Modify: `training/stage7/mcagent_stage7/voxel_model.py`
- Modify: `training/stage7/tests/test_voxel_model.py`

- [ ] **Step 1: Write failing weighted-loss tests**

Add tests around a controlled `VoxelModelOutput` and mask proving:

```python
unweighted = voxel_loss(output, targets, mask)
unit_weighted = voxel_loss(
    output,
    targets,
    mask,
    semantic_class_weights=torch.ones(8),
)
rare_weighted = voxel_loss(
    output,
    targets,
    mask,
    semantic_class_weights=torch.tensor(
        [1.0, 1.0, 1.0, 1.0, 4.0, 1.0, 1.0, 1.0]
    ),
)

assert torch.equal(unweighted.occupancy, rare_weighted.occupancy)
assert torch.allclose(unweighted.semantic, unit_weighted.semantic)
assert rare_weighted.semantic != unweighted.semantic
```

The constructed targets must include token 5 and at least one other non-air
class so PyTorch's weighted mean is observable. Add direct error tests for:

- not a tensor;
- wrong shape (anything other than `(8,)`);
- wrong dtype;
- device mismatch;
- NaN/infinite/non-positive values.

- [ ] **Step 2: Run the focused tests and verify the signature failure**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 \
  python -m pytest -q -p no:cacheprovider \
  tests/test_voxel_model.py -k "weight or loss"
```

Expected: FAIL because `voxel_loss` has no `semantic_class_weights` argument.

- [ ] **Step 3: Implement optional semantic weights**

Change the loss signature to:

```python
def voxel_loss(
    output: VoxelModelOutput,
    targets: torch.Tensor,
    mask: torch.Tensor,
    semantic_class_weights: torch.Tensor | None = None,
) -> VoxelLoss:
```

Validate the optional tensor before computing either loss. Require shape
`(TOKEN_COUNT - 1,)`, the same floating dtype and device as semantic logits,
finite positive values, and raise `SEMANTIC_CLASS_WEIGHTS_INVALID` on a direct
contract violation.

Pass only this argument to semantic cross-entropy:

```python
semantic = F.cross_entropy(
    semantic_logits[semantic_mask],
    targets[semantic_mask] - 1,
    weight=semantic_class_weights,
)
```

Leave occupancy cross-entropy untouched. Passing `None` must execute the
existing unweighted path.

- [ ] **Step 4: Run model and full training unit tests**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 \
  python -m pytest -q -p no:cacheprovider \
  tests/test_voxel_model.py tests/test_training_loop.py
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add training/stage7/mcagent_stage7/voxel_model.py \
  training/stage7/tests/test_voxel_model.py
git commit -m "feat(training): weight semantic cross entropy"
```

---

## Task 4: Bind profiles and exact weights to training checkpoints

**Files:**

- Modify: `training/stage7/mcagent_stage7/train.py`
- Modify: `training/stage7/mcagent_stage7/training_loop.py`
- Modify: `training/stage7/mcagent_stage7/training_checkpoint.py`
- Modify: `training/stage7/tests/test_training_commands.py`
- Modify: `training/stage7/tests/test_training_loop.py`
- Modify: `training/stage7/tests/test_training_checkpoint.py`

- [ ] **Step 1: Write failing CLI and training-flow tests**

Extend command tests to assert:

```python
help_text = training_parser().format_help()
assert "--semantic-balance" in help_text
assert set(
    training_parser().parse_args(
        ["--run-id", "x", "--steps", "1"]
    ).semantic_balance
    for _ in [0]
) == {"none"}
```

Add parser rejection coverage for an unknown profile. In the CPU smoke command,
run at least one balanced profile using a fixture created with
`make_training_root(tmp_path, train_count=8)` so every semantic class has
support.

Extend training-loop tests to prove:

- default `none` completes and records eight unit weights;
- `weighted` stores calculated non-unit weights and their digest;
- `weighted-mask` calls the hybrid mask path;
- a balanced profile with missing train support fails before the first step;
- a second invocation with the same binding resumes;
- a profile change on an existing run ID fails before loading state.

- [ ] **Step 2: Write failing checkpoint metadata and legacy tests**

Extend checkpoint helpers to build bindings with:

```python
objective_version="semantic-balance-v2"
semantic_balance="none"
semantic_class_weights=(1.0,) * 8
semantic_class_weights_sha256=semantic_class_weights_sha256((1.0,) * 8)
```

Test:

- save/load round-trips all new fields;
- a changed profile, one changed weight, or changed digest is rejected with a
  direct checkpoint binding mismatch;
- metadata missing all four v2 fields loads only when the requested binding is
  `none` with unit weights;
- the same legacy metadata is rejected for `weighted` or `weighted-mask`;
- partially missing v2 metadata is invalid rather than treated as legacy;
- model version remains `tiny-voxel-completion-v1`.

- [ ] **Step 3: Run the focused tests and verify failures**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 \
  python -m pytest -q -p no:cacheprovider \
  tests/test_training_checkpoint.py \
  tests/test_training_loop.py \
  tests/test_training_commands.py
```

Expected: FAIL because configuration and checkpoint bindings lack the new
fields.

- [ ] **Step 4: Add the CLI/config fields and resolve balance once**

In `train.py`, add:

```python
parser.add_argument(
    "--semantic-balance",
    choices=SEMANTIC_BALANCE_PROFILES,
    default="none",
)
```

Pass it into `TrainingConfig`. In `TrainingConfig`, add
`semantic_balance: str = "none"` and validate it.

In `train_model`, immediately after constructing the train dataset:

```python
balance = build_semantic_balance(
    dataset.samples,
    config.semantic_balance,
)
```

Add all four balance fields to `TrainingCheckpointBinding`. Build the semantic
weight tensor once:

```python
semantic_weights = (
    None
    if balance.profile == "none"
    else torch.tensor(
        balance.class_weights,
        dtype=torch.float32,
        device=device,
    )
)
```

Pass `semantic_balance=config.semantic_balance` to the mask and
`semantic_class_weights=semantic_weights` to `voxel_loss`. Keep the tiny Gate 1
evaluation uniformly masked and unweighted so its metric remains comparable.

- [ ] **Step 5: Implement strict v2 metadata plus complete legacy normalization**

Extend `TrainingCheckpointBinding` with:

```python
objective_version: str
semantic_balance: str
semantic_class_weights: tuple[float, ...]
semantic_class_weights_sha256: str
```

Insert these required fields before the existing defaulted `model_version`
field so the dataclass remains valid. Require `objective_version` to equal
`semantic-balance-v2`, and validate the other three fields by constructing
`SemanticBalance` from them. When saving, serialize the tuple as a JSON list.

Add one reusable metadata parser named
`binding_from_checkpoint_metadata(metadata: dict[str, Any]) ->
TrainingCheckpointBinding`.

Use it later from evaluation instead of duplicating field reads.

Legacy normalization is allowed only when all four new keys are absent. It
normalizes to objective version `semantic-balance-v2`, profile `none`, eight
unit weights, and the canonical unit-weight digest. If one to three keys are
missing, raise `CHECKPOINT_METADATA_INVALID`. During load, require the
normalized saved binding to match the requested binding before reading
`checkpoint.pt` or optimizer state.

Comparison rules are:

- strings and hashes: exact equality;
- class weights: exact element-for-element tuple equality after validating the
  JSON list;
- no approximate float comparison.

- [ ] **Step 6: Run focused and full Python tests**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 \
  python -m pytest -q -p no:cacheprovider \
  tests/test_training_checkpoint.py \
  tests/test_training_loop.py \
  tests/test_training_commands.py
conda run -n mcagent-stage7 --cwd training/stage7 \
  python -m pytest -q -p no:cacheprovider .
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add training/stage7/mcagent_stage7/train.py \
  training/stage7/mcagent_stage7/training_loop.py \
  training/stage7/mcagent_stage7/training_checkpoint.py \
  training/stage7/tests/test_training_commands.py \
  training/stage7/tests/test_training_loop.py \
  training/stage7/tests/test_training_checkpoint.py
git commit -m "feat(training): bind semantic objective to runs"
```

---

## Task 5: Add split-aware evaluation and fixed phase-two decisions

**Files:**

- Modify: `training/stage7/mcagent_stage7/evaluate.py`
- Modify: `training/stage7/mcagent_stage7/status.py`
- Modify: `training/stage7/mcagent_stage7/training_metrics.py`
- Modify: `training/stage7/tests/test_training_commands.py`
- Modify: `training/stage7/tests/test_training_metrics.py`

- [ ] **Step 1: Write failing phase-two metric tests**

Add a `phase2_result(trained, gate2)` test matrix for exact boundaries:

```python
BASELINE_MACRO_F1 = 0.3609670072698868

assert selection_score(0.4, 0.2) == pytest.approx(2 * 0.4 * 0.2 / 0.6)
assert selection_score(0.0, 0.2) == 0.0
assert selection_score(0.4, 0.0) == 0.0
```

Prove:

- macro-F1 equal to the baseline fails; the next representable float above it
  passes;
- token-5 F1 `0.10` passes and the next float below fails;
- occupancy F1 `0.90` passes and the next float below fails;
- predicted/target ratios exactly `0.5` and `2.0` pass, values just outside
  fail;
- `gate2["passed"] is False` makes phase two fail even when all new checks pass.

Add `select_ablation_winner(reports)` tests proving:

- Gate-2-ineligible reports are excluded;
- higher harmonic selection score wins;
- exact score ties prefer higher non-air macro-F1;
- complete ties prefer the lexicographically smaller run ID;
- no eligible reports raises `ABLATION_WINNER_MISSING`;
- reports whose split is not `validation` are rejected.

- [ ] **Step 2: Write failing split/output command tests**

Extend the CPU command smoke test to call `evaluation_main` for the same
completed run first with `--split validation` and then with `--split test`.

Assert:

- help contains `--split`;
- validation defaults to `evaluation.json` and `reconstruction.bin`;
- test writes `evaluation.test.json` and `reconstruction.test.bin`;
- the validation files are unchanged after test evaluation;
- both reports record their exact split;
- both reports contain `selection_score`, `phase2`, and the existing `gate2`;
- both evaluations use the uniform mask even for a `weighted-mask` checkpoint;
- status displays validation and test phase-two results separately when both
  exist.

Use `make_training_root(tmp_path, train_count=8)` and ensure its generated split
contains at least one validation and one test sample with non-air support.

- [ ] **Step 3: Run focused tests and verify failures**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 \
  python -m pytest -q -p no:cacheprovider \
  tests/test_training_metrics.py \
  tests/test_training_commands.py
```

Expected: FAIL because phase-two helpers and `--split` do not exist.

- [ ] **Step 4: Implement the fixed score, acceptance checks, and ranking**

In `training_metrics.py`, add:

```python
BASELINE_NON_AIR_MACRO_F1 = 0.3609670072698868


def selection_score(macro_f1: float, token5_f1: float) -> float:
    # Validate finite, non-negative values.
    return (
        0.0
        if macro_f1 <= 0.0 or token5_f1 <= 0.0
        else 2.0 * macro_f1 * token5_f1 / (macro_f1 + token5_f1)
    )


def phase2_result(
    trained: dict[str, Any],
    gate2: dict[str, Any],
) -> dict[str, Any]:
    macro_f1 = _finite_metric(trained, "non_air_macro_f1")
    token5_f1 = _finite_metric(trained["classes"]["5"], "f1")
    occupancy_f1 = _finite_metric(trained["occupancy"], "f1")
    ratio = _finite_metric(
        gate2,
        "predicted_to_target_non_air_ratio",
    )
    checks = {
        "macro_f1_beats_baseline": (
            macro_f1 > BASELINE_NON_AIR_MACRO_F1
        ),
        "token5_f1_minimum": token5_f1 >= 0.10,
        "occupancy_f1_minimum": occupancy_f1 >= 0.90,
        "non_air_fraction": 0.5 <= ratio <= 2.0,
        "gate2_passed": gate2.get("passed") is True,
    }
    return {
        **checks,
        "non_air_macro_f1": macro_f1,
        "token5_f1": token5_f1,
        "occupancy_f1": occupancy_f1,
        "predicted_to_target_non_air_ratio": ratio,
        "selection_score": selection_score(macro_f1, token5_f1),
        "passed": all(checks.values()),
    }


def select_ablation_winner(
    reports: Iterable[dict[str, Any]],
) -> dict[str, Any]:
    candidates = list(reports)
    if any(report.get("split") != "validation" for report in candidates):
        raise TrainingError("ABLATION_REPORT_SPLIT_INVALID", "validation")
    eligible = [
        report for report in candidates
        if report.get("gate2", {}).get("passed") is True
    ]
    if not eligible:
        raise TrainingError("ABLATION_WINNER_MISSING", "no Gate 2 pass")
    return min(
        eligible,
        key=lambda report: (
            -_finite_metric(report, "selection_score"),
            -_finite_metric(
                report["metrics"]["trained"],
                "non_air_macro_f1",
            ),
            report["run_id"],
        ),
    )
```

`phase2_result` returns every named boolean check, the measured token-5 F1,
macro-F1, occupancy F1, predicted/target ratio, selection score, and aggregate
`passed`. Reuse the ratio already calculated by Gate 2 so the two reports
cannot disagree.

- [ ] **Step 5: Make evaluation split-aware while preserving uniform masks**

Add:

```python
parser.add_argument(
    "--split",
    choices=("validation", "test"),
    default="validation",
)
```

Add `split: str = "validation"` to `evaluate_run`, pass the parsed value from
`main`, rename local `validation` variables to `evaluation_dataset`, instantiate
it with the requested split, and pass `semantic_balance="none"` explicitly to
`make_balanced_mask`.

Load the checkpoint binding via `binding_from_checkpoint_metadata(metadata)`.
Add these report fields:

```python
report = {
    "source": "minecraft-architecture-training-evaluation-v2",
    "run_id": run_id,
    "split": split,
    "seed": seed,
    "device": device,
    "objective_version": binding.objective_version,
    "semantic_balance": binding.semantic_balance,
    "semantic_class_weights": list(binding.semantic_class_weights),
    "semantic_class_weights_sha256": (
        binding.semantic_class_weights_sha256
    ),
    "metrics": metrics,
    "gate2": gate,
    "selection_score": phase2["selection_score"],
    "phase2": phase2,
}
```

Choose output names with a single mapping:

```python
outputs = {
    "validation": ("evaluation.json", "reconstruction.bin"),
    "test": ("evaluation.test.json", "reconstruction.test.bin"),
}
```

No output path may be selected from user-controlled text. Print `split`,
`gate2_passed`, `phase2_passed`, `selection_score`, macro-F1, token-5 F1, and
macro-IoU.

- [ ] **Step 6: Update status without changing the command surface**

Continue treating `evaluation.json` as the latest validation status. If
`evaluation.test.json` exists for the same run, print its Gate 2 and phase-two
results under `test_gate2_passed` and `test_phase2_passed`. Do not let a stale
test report from a different run influence the selected latest run.

- [ ] **Step 7: Run focused and full Python tests**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 \
  python -m pytest -q -p no:cacheprovider \
  tests/test_training_metrics.py \
  tests/test_training_commands.py
conda run -n mcagent-stage7 --cwd training/stage7 \
  python -m pytest -q -p no:cacheprovider .
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add training/stage7/mcagent_stage7/evaluate.py \
  training/stage7/mcagent_stage7/status.py \
  training/stage7/mcagent_stage7/training_metrics.py \
  training/stage7/tests/test_training_commands.py \
  training/stage7/tests/test_training_metrics.py
git commit -m "feat(training): evaluate semantic balance by split"
```

---

## Task 6: Run pre-experiment verification

**Files:**

- Verify only; no expected source changes

- [ ] **Step 1: Confirm repository policy and command surface**

Run:

```bash
git status --short
node --input-type=module -e \
  "import('./package.json',{with:{type:'json'}}).then(({default:p})=>{const n=Object.keys(p.scripts).filter(k=>k.startsWith('training:'));if(n.length!==4)throw new Error(n.join(','));console.log(n.join('\\n'))})"
rg -n "private-research|metadata-only|acknowledgement" \
  README.md docs training src test package.json
```

Expected:

- clean worktree;
- exactly `training:prepare`, `training:train`, `training:evaluate`, and
  `training:status`;
- no reintroduced obsolete approval/private-training contract. If `rg` exits
  1 because it found nothing, that is the expected result.

- [ ] **Step 2: Run the complete Node and Python suites**

Run:

```bash
npm test
npm run test:training
```

Expected: all Node and Python tests pass; record exact test counts in the
implementation notes.

- [ ] **Step 3: Run the required construction smoke test**

Run:

```bash
npm start -- --mode mock --seed 7101 \
  "Build a compact two-story stone and oak house with windows and a stair roof."
```

Expected: command exits 0 and the mock construction flow completes without
using a training checkpoint.

- [ ] **Step 4: Inspect the dataset and existing baseline without mutation**

Run:

```bash
npm run training:status -- \
  --root /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.local/training
```

Verify:

- dataset is prepared;
- split sizes remain train `8260`, validation `1546`, test `1794`;
- `heldout-7101/evaluation.json` still records macro-F1
  `0.3609670072698868`, occupancy F1 `0.919299` (rounded), and Gate 2 pass;
- no v2 run ID already exists. If one exists, stop rather than silently
  resuming it.

---

## Task 7: Run both Gate 1 preflights

**Files:**

- Generate ignored artifacts only:
  `.local/training/runs/tiny-weighted-7101/`
  `.local/training/runs/tiny-weighted-mask-7101/`

- [ ] **Step 1: Run the weighted preflight**

Run:

```bash
npm run training:train -- \
  --root /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.local/training \
  --run-id tiny-weighted-7101 \
  --steps 5000 \
  --batch-size 2 \
  --learning-rate 0.001 \
  --device auto \
  --seed 7101 \
  --tiny-overfit \
  --semantic-balance weighted
```

Expected: `gate1.json` reports `passed: true` at or before step 5000. Inspect
`checkpoint.json` and confirm profile, eight weights, digest, and objective
version.

- [ ] **Step 2: Run the weighted-mask preflight**

Run:

```bash
npm run training:train -- \
  --root /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.local/training \
  --run-id tiny-weighted-mask-7101 \
  --steps 5000 \
  --batch-size 2 \
  --learning-rate 0.001 \
  --device auto \
  --seed 7101 \
  --tiny-overfit \
  --semantic-balance weighted-mask
```

Expected: `gate1.json` reports `passed: true` at or before step 5000 and its
checkpoint binding is correct.

- [ ] **Step 3: Apply the stop rule**

If either profile fails Gate 1, do not run that profile's 10k ablation. Record
the failed step and metrics. If both fail, stop the experiment and document
the failure; do not change the 0.90 Gate 1 threshold or extend the runs.

---

## Task 8: Run and select the two fixed 10k ablations

**Files:**

- Generate ignored artifacts only:
  `.local/training/runs/ablation-weighted-7101/`
  `.local/training/runs/ablation-weighted-mask-7101/`

- [ ] **Step 1: Train each Gate-1-qualified profile from scratch**

Run the applicable commands:

```bash
npm run training:train -- \
  --root /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.local/training \
  --run-id ablation-weighted-7101 \
  --steps 10000 --batch-size 2 --learning-rate 0.001 \
  --device auto --seed 7101 \
  --semantic-balance weighted

npm run training:train -- \
  --root /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.local/training \
  --run-id ablation-weighted-mask-7101 \
  --steps 10000 --batch-size 2 --learning-rate 0.001 \
  --device auto --seed 7101 \
  --semantic-balance weighted-mask
```

Expected: both commands start at step 1 under their new run IDs and finish at
exactly step 10000.

- [ ] **Step 2: Evaluate each surviving ablation on validation only**

Run:

```bash
npm run training:evaluate -- \
  --root /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.local/training \
  --run-id ablation-weighted-7101 \
  --device auto --seed 7101 --split validation

npm run training:evaluate -- \
  --root /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.local/training \
  --run-id ablation-weighted-mask-7101 \
  --device auto --seed 7101 --split validation
```

Expected: each writes only its validation report and reconstruction.

- [ ] **Step 3: Select the winner using the checked-in ranking function**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -c \
  "import json; from pathlib import Path; from mcagent_stage7.training_metrics import select_ablation_winner; root=Path('/home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.local/training/runs'); reports=[json.loads((root/name/'evaluation.json').read_text('utf8')) for name in ('ablation-weighted-7101','ablation-weighted-mask-7101') if (root/name/'evaluation.json').exists()]; winner=select_ablation_winner(reports); print(winner['run_id']); print(winner['semantic_balance']); print(winner['selection_score'])"
```

Eligibility is Gate 2 pass, not phase-two pass. Ordering is higher selection
score, higher macro-F1, then lexicographically smaller run ID. Write down both
runs' Gate 2 result, macro-F1, token-5 F1, selection score, occupancy F1, and
predicted/target ratio.

- [ ] **Step 4: Apply the no-winner stop rule**

If neither report passes Gate 2, stop. Report both results without changing
the thresholds, running test evaluation, or promoting an ineligible profile.

---

## Task 9: Train the selected profile for 50k and confirm both splits

**Files:**

- Generate ignored artifacts only:
  `.local/training/runs/balanced-v2-7101/`

- [ ] **Step 1: Train the selected profile from newly initialized weights**

Run exactly one of these commands. Use the first only if `weighted` won; use
the second only if `weighted-mask` won:

```bash
npm run training:train -- \
  --root /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.local/training \
  --run-id balanced-v2-7101 \
  --steps 50000 \
  --batch-size 2 \
  --learning-rate 0.001 \
  --device auto \
  --seed 7101 \
  --semantic-balance weighted

npm run training:train -- \
  --root /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.local/training \
  --run-id balanced-v2-7101 \
  --steps 50000 \
  --batch-size 2 \
  --learning-rate 0.001 \
  --device auto \
  --seed 7101 \
  --semantic-balance weighted-mask
```

Before running, assert that the run directory does not exist. After running,
assert `completed_steps == target_steps == 50000`, status is `completed`, and
the stored profile/digest match the selected ablation. Do not copy an ablation
checkpoint.

- [ ] **Step 2: Evaluate validation first**

Run:

```bash
npm run training:evaluate -- \
  --root /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.local/training \
  --run-id balanced-v2-7101 \
  --device auto --seed 7101 --split validation
```

Record Gate 2, phase-two aggregate, macro-F1, macro-IoU, token-5 F1, occupancy
F1, ratio, and selection score.

- [ ] **Step 3: Evaluate the untouched test split once**

Run regardless of the validation phase-two result, but do not alter any
configuration between splits:

```bash
npm run training:evaluate -- \
  --root /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.local/training \
  --run-id balanced-v2-7101 \
  --device auto --seed 7101 --split test
```

Confirm validation output files are unchanged, test output files are distinct,
and record the same metrics and decisions. A failed test phase-two result is a
failed confirmation, not permission to select another ablation or tune a
threshold.

- [ ] **Step 4: Report status from the real artifacts**

Run:

```bash
npm run training:status -- \
  --root /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.local/training
```

Expected: latest run `balanced-v2-7101`, completed step 50000, with separate
validation and test Gate 2/phase-two status.

---

## Task 10: Fold observed results into permanent documentation

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/training.md`
- Delete: `docs/superpowers/specs/2026-07-23-semantic-balance-v2-design.md`
- Delete: `docs/superpowers/plans/2026-07-23-semantic-balance-v2.md`

- [ ] **Step 1: Update only with observed values**

Document:

- the unchanged role of the LLM, training model, and construction executor;
- train-only weighting and optional hybrid mask;
- exact selected profile and why it won;
- Gate 1 steps for both profiles;
- both 10k ablation metrics and eligibility;
- `balanced-v2-7101` validation and test metrics;
- every Gate 2 and phase-two pass/fail decision;
- any remaining weak classes or generalization gap;
- artifact location and exact reproduction commands;
- explicit statement that the trained checkpoint is not yet integrated into
  primary Minecraft generation.

Do not claim success when a gate failed. Do not round values so aggressively
that a reader cannot verify a threshold decision.

- [ ] **Step 2: Remove temporary execution documents**

Delete the approved design and this plan only after all durable facts and
commands are represented in `README.md`, `docs/architecture.md`, and
`docs/training.md`. Git history retains the reviewed design and plan.

- [ ] **Step 3: Run documentation and policy checks**

Run:

```bash
rg -n "semantic-balance|balanced-v2-7101|token-5|phase.two" \
  README.md docs/architecture.md docs/training.md
test ! -e docs/superpowers/specs/2026-07-23-semantic-balance-v2-design.md
test ! -e docs/superpowers/plans/2026-07-23-semantic-balance-v2.md
git status --short
```

Expected: permanent documents contain the observed results, temporary files
are absent, and only intended source/test/doc changes are present.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md docs/architecture.md docs/training.md \
  docs/superpowers/specs/2026-07-23-semantic-balance-v2-design.md \
  docs/superpowers/plans/2026-07-23-semantic-balance-v2.md
git commit -m "docs: record semantic balance v2 results"
```

---

## Task 11: Final verification and branch handoff

**Files:**

- Verify only; fix only regressions attributable to this work

- [ ] **Step 1: Run all automated verification**

Run:

```bash
npm test
npm run test:training
npm start -- --mode mock --seed 7101 \
  "Build a compact two-story stone and oak house with windows and a stair roof."
```

Expected: all tests pass and the mock construction smoke command exits 0.

- [ ] **Step 2: Verify repository and artifact boundaries**

Run:

```bash
git status --short
git diff --check
git ls-files .local/training
git log --oneline --decorate -12
```

Expected:

- clean worktree;
- `git diff --check` has no output;
- `git ls-files .local/training` has no output;
- commits are task-scoped and the current branch contains the approved design,
  implementation, tests, observed-result documentation, and the final removal
  of temporary execution documents.

- [ ] **Step 3: Inspect final reports directly**

Read both:

```text
.local/training/runs/balanced-v2-7101/evaluation.json
.local/training/runs/balanced-v2-7101/evaluation.test.json
```

Cross-check every metric and pass/fail claim in the permanent documentation.
Confirm both files bind the same run, objective version, profile, weights,
digest, seed, and model version, while recording different splits.

- [ ] **Step 4: Run the completion workflow**

Use `superpowers:verification-before-completion` before making any completion
claim, then use `superpowers:finishing-a-development-branch` to present the
verified integration options. Do not push or open a pull request unless the
user explicitly authorizes that external change.
