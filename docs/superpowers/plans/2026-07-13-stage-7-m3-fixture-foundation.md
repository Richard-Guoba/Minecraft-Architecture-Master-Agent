# Stage 7 Fixture-Only M3 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the fixture-only Stage 7 M3 Python/PyTorch training and inference foundation, then connect it to the existing Node.js shadow boundary without authorizing real-data training or Apply Mode.

**Architecture:** Keep Python under `training/stage7/` as an optional, pinned subsystem. A governance-aware loader has separate constructors for real Dataset v3 data and committed synthetic fixtures; a deterministic encoder and three-layer tensor codec feed a tiny conditional 3D VAE; deterministic training writes a fixture-scoped checkpoint manifest; inference emits the existing canonical Stage 7 plan JSON; Node.js treats that JSON as untrusted input and routes it through the existing validation, repair, conversion, rejection, and fallback path.

**Tech Stack:** WSL2 Ubuntu, Node.js 24.18.0 via `.nvmrc` (project floor remains Node.js 20+), Python 3.12.13, NumPy 2.5.1, PyTorch 2.13.0+cu130, pytest 9.1.1, Node.js ESM, built-in `node:test`, built-in `child_process`, canonical JSON and SHA-256.

## Global Constraints

- The approved scope is fixture-only M3; `mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json` currently reports `training_eligible_count: 0` and `ready_for_m3_real_data: false`.
- No real Dataset v3 case may be trained unless it is `training.eligible`, semantic-accepted, approved for every requested layer, bound to the exact v3 plan hash, and backed by a matching local artifact hash.
- Fixture records use `origin: synthetic-fixture`, live under `training/stage7/fixtures/m3/`, and never contribute to Dataset v3 readiness or evaluation counts.
- The canonical semantic grid is exactly `64 x 64 x 64`; vocabulary and RLE ordering must match `src/construction/learning/coarseSemanticVoxelSchema.js`.
- Python output contains semantic layers only; it never emits Minecraft block IDs, commands, or primary build operations.
- The learned provider is `shadow` only. `apply` remains rejected until Stage 7 M4, and fixture checkpoints must be rejected by any Apply Mode path.
- Normal Node.js generation and `npm test` remain Python-independent. Cross-runtime acceptance is an explicit WSL command.
- CPU is the mandatory acceptance path. CUDA smoke is optional and cannot replace CPU acceptance.
- The named Conda environment remains `mcagent-stage7`; no repository-local `.venv` may be created.
- Checkpoints and run outputs remain ignored under `training/stage7/checkpoints/` and `training/stage7/runs/`.
- Dataset v1, v2, and v3 committed files must remain byte-identical throughout M3.
- Every task follows red-green-refactor TDD and ends with a focused commit after its tests pass.

---

## File Map

### Python package and fixture ownership

- Create `training/stage7/pyproject.toml`: package metadata, Python floor, pinned runtime dependencies, pytest configuration.
- Create `training/stage7/mcagent_stage7/__init__.py`: public package version only.
- Create `training/stage7/mcagent_stage7/contracts.py`: canonical JSON, SHA-256, semantic vocabulary, resolution, and typed contract errors.
- Create `training/stage7/mcagent_stage7/fixture_assets.py`: deterministic source-independent fixture condition/plan generator.
- Create `training/stage7/mcagent_stage7/dataset.py`: separate real/fixture loaders and fail-closed eligibility gates.
- Create `training/stage7/mcagent_stage7/encoding.py`: deterministic condition tokens and fixed-width condition vectors.
- Create `training/stage7/mcagent_stage7/tensors.py`: RLE-to-tensor and tensor-to-canonical-plan conversion.
- Create `training/stage7/mcagent_stage7/model.py`: tiny conditional 3D VAE and loss.
- Create `training/stage7/mcagent_stage7/checkpoints.py`: deterministic checkpoint serialization and manifest validation.
- Create `training/stage7/mcagent_stage7/train_fixture.py`: fixture-only trainer CLI.
- Create `training/stage7/mcagent_stage7/infer.py`: stdin/file inference CLI.
- Create `training/stage7/mcagent_stage7/acceptance.py`: two-run CPU reproducibility and Node boundary acceptance.
- Create `training/stage7/validate_plan.mjs`: authoritative Node schema validation for Python output.
- Create `training/stage7/fixtures/m3/manifest.json` and `training/stage7/fixtures/m3/cases/*`: generated, committed synthetic fixtures.
- Create `training/stage7/tests/`: focused Python tests mirroring package responsibilities.

### Node.js shadow integration

- Create `src/construction/learning/pythonCoarseSemanticVoxelProvider.js`: checkpoint-scope validation, bounded Python invocation, JSON parsing, and provenance.
- Modify `src/construction/learning/coarseSemanticVoxelShadow.js`: select the Python provider and preserve rejection/fallback semantics.
- Modify `src/construction/workflow.js`: pass the checkpoint and Python execution options into Stage 7 shadow.
- Modify `src/pipeline.js`: propagate M3 provider options without changing default behavior.
- Modify `src/index.js`: allow `python` only in shadow mode and require `--coarse-voxel-checkpoint`.
- Create `test/stage7PythonProvider.test.js`: provider unit, failure, scope, and operation-parity coverage.
- Modify `test/stage7Cli.test.js` and `test/stage7Pipeline.test.js`: M3 CLI contract and shadow-only integration.

### Documentation and evidence

- Create `training/stage7/README.md`: pinned setup, test, train, infer, and acceptance commands.
- Create `docs/benchmarks/stage7-m3-fixture-foundation.md`: exact fixture-only evidence and limitations.
- Modify `README.md`, `AGENT.md`, `docs/roadmap.md`, and `docs/index.html`: M3 fixture status, real-data gate, and M4 boundary.
- Modify `package.json`: explicit Python test/train/acceptance scripts without adding Python to the normal Node test path.

---

### Task 1: Establish the Python Package and Committed Fixture Boundary

**Files:**
- Create: `training/stage7/pyproject.toml`
- Create: `training/stage7/mcagent_stage7/__init__.py`
- Create: `training/stage7/mcagent_stage7/contracts.py`
- Create: `training/stage7/mcagent_stage7/fixture_assets.py`
- Create: `training/stage7/fixtures/m3/manifest.json`
- Create: `training/stage7/fixtures/m3/cases/one-floor-house/condition.json`
- Create: `training/stage7/fixtures/m3/cases/one-floor-house/plan.json`
- Create: `training/stage7/fixtures/m3/cases/two-floor-house/condition.json`
- Create: `training/stage7/fixtures/m3/cases/two-floor-house/plan.json`
- Create: `training/stage7/tests/test_fixture_assets.py`
- Create: `test/stage7M3Fixtures.test.js`

**Interfaces:**
- Consumes: Stage 7 constants from `src/construction/learning/coarseSemanticVoxelSchema.js` copied exactly into Python contract constants.
- Produces: `canonical_json_bytes(value) -> bytes`, `sha256_bytes(data) -> str`, `sha256_file(path) -> str`, `build_fixture_root(root: Path) -> dict`, and a committed fixture manifest whose records point only inside `training/stage7/fixtures/m3/`.

- [ ] **Step 1: Write the failing package and fixture contract test**

```python
# training/stage7/tests/test_fixture_assets.py
import json
from pathlib import Path

from mcagent_stage7.contracts import RESOLUTION, canonical_json_bytes, sha256_file
from mcagent_stage7.fixture_assets import build_fixture_root


STAGE7_ROOT = Path(__file__).resolve().parents[1]
FIXTURE_ROOT = STAGE7_ROOT / "fixtures" / "m3"


def test_fixture_root_is_deterministic_and_separate_from_real_dataset(tmp_path):
    generated = tmp_path / "m3"
    manifest = build_fixture_root(generated)

    assert RESOLUTION == (64, 64, 64)
    assert manifest["source"] == "stage7-m3-fixture-dataset-v1"
    assert manifest["fixture_only"] is True
    assert manifest["readiness_contribution"] == 0
    assert [case["case_id"] for case in manifest["cases"]] == [
        "one-floor-house",
        "two-floor-house",
    ]
    assert all(case["origin"] == "synthetic-fixture" for case in manifest["cases"])
    assert "mc_templates/datasets" not in canonical_json_bytes(manifest).decode("utf8")

    for relative in [
        "manifest.json",
        "cases/one-floor-house/condition.json",
        "cases/one-floor-house/plan.json",
        "cases/two-floor-house/condition.json",
        "cases/two-floor-house/plan.json",
    ]:
        assert (generated / relative).read_bytes() == (FIXTURE_ROOT / relative).read_bytes()


def test_fixture_manifest_hashes_bind_every_condition_and_plan():
    manifest = json.loads((FIXTURE_ROOT / "manifest.json").read_text("utf8"))
    for case in manifest["cases"]:
        assert sha256_file(FIXTURE_ROOT / case["condition_path"]) == case["condition_sha256"]
        assert sha256_file(FIXTURE_ROOT / case["plan_path"]) == case["plan_sha256"]
```

- [ ] **Step 2: Run the test and verify the package is absent**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q -p no:cacheprovider tests/test_fixture_assets.py
```

Expected: collection fails with `ModuleNotFoundError: No module named 'mcagent_stage7'`.

- [ ] **Step 3: Add package metadata and canonical contract utilities**

```toml
# training/stage7/pyproject.toml
[build-system]
requires = ["setuptools==82.0.1", "wheel==0.47.0"]
build-backend = "setuptools.build_meta"

[project]
name = "mcagent-stage7"
version = "0.3.0"
requires-python = ">=3.12,<3.13"
dependencies = [
  "numpy==2.5.1",
  "torch==2.13.0+cu130",
]

[tool.setuptools]
packages = ["mcagent_stage7"]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-q -p no:cacheprovider"
```

```python
# training/stage7/mcagent_stage7/contracts.py
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


RESOLUTION = (64, 64, 64)
CONDITION_SOURCE = "stage7-coarse-semantic-voxel-condition-v1"
PLAN_SOURCE = "stage7-coarse-semantic-voxel-plan-v1"
SCHEMA_VERSION = 1
ENCODING = "rle-x-v1"
ENVELOPE_VALUES = ("none", "wall", "floor", "roof", "opening", "support")
SPACE_VALUES = ("outside", "public", "private", "service", "circulation", "vertical_circulation", "void")
SITE_VALUES = ("none", "ground", "path", "courtyard", "water", "vegetation")
LAYERS = ("envelope", "space", "site")


class Stage7ContractError(ValueError):
    pass


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf8")


def pretty_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf8")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def condition_hash(condition_without_hash: dict[str, Any]) -> str:
    return sha256_bytes(canonical_json_bytes(condition_without_hash))
```

`training/stage7/mcagent_stage7/__init__.py` exports only `__version__ = "0.3.0"`.

- [ ] **Step 4: Implement the deterministic fixture writer and generate committed assets**

Implement `build_fixture_root(root)` so it:

1. Creates two valid Stage 7 conditions with seeds `7101` and `7102`, normalized dimensions, explicit unknown tokens where optional categories are absent, no references, and a Node-compatible `condition_hash` computed before adding that field.
2. Builds source-independent one-floor and two-floor semantic cells; encodes cells in canonical `z`, then `y`, then `x` RLE order; uses only the three canonical vocabularies; attaches one evidence record `fixture:<case_id>` to every run.
3. Writes plans with provider metadata `{kind: "synthetic-fixture", name: "stage7-m3-fixture-generator-v1", model_version: null, dataset_version: "fixture-v1", checkpoint_version: null}` and empty provider-derived fields.
4. Writes sorted manifest records with relative paths, file SHA-256 values, `origin: synthetic-fixture`, `fixture_only: true`, and `readiness_contribution: 0`.
5. Uses `pretty_json_bytes` for every file and rejects any output path that escapes `root`.

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.fixture_assets --output fixtures/m3
```

Expected: exactly five committed JSON files are written and the final line is `fixture_cases: 2`.

- [ ] **Step 5: Run the focused test**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q -p no:cacheprovider tests/test_fixture_assets.py
```

Expected: `2 passed`.

- [ ] **Step 6: Verify both fixture plans under the authoritative Node schema**

```javascript
// test/stage7M3Fixtures.test.js
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStage7Condition, validateStage7Plan } from '../src/construction/learning/coarseSemanticVoxelSchema.js';

for (const caseId of ['one-floor-house', 'two-floor-house']) {
  test(`M3 fixture ${caseId} uses the canonical Stage 7 condition and plan contracts`, async () => {
    const root = path.join(process.cwd(), 'training', 'stage7', 'fixtures', 'm3', 'cases', caseId);
    const condition = JSON.parse(await fs.readFile(path.join(root, 'condition.json'), 'utf8'));
    const plan = JSON.parse(await fs.readFile(path.join(root, 'plan.json'), 'utf8'));
    assert.deepEqual(validateStage7Condition(condition), { ok: true, errors: [] });
    const validation = validateStage7Plan(plan, { condition });
    assert.equal(validation.ok, true, validation.errors.join('; '));
    assert.equal(plan.encoding, 'rle-x-v1');
    assert.deepEqual(plan.summary, {});
    assert.deepEqual(plan.derived_sketches, { massing: [], spaces: [], site: [] });
    assert.deepEqual(plan.conflicts, []);
    assert.deepEqual(plan.repairs, []);
    assert.deepEqual(plan.warnings, []);
  });
}
```

Run:

```bash
node --test test/stage7M3Fixtures.test.js
```

Expected: `2` tests pass; both plans validate, use `rle-x-v1`, and contain no provider-derived content.

- [ ] **Step 7: Commit the package and fixture boundary**

```bash
git add training/stage7/pyproject.toml training/stage7/mcagent_stage7 training/stage7/fixtures/m3 training/stage7/tests/test_fixture_assets.py test/stage7M3Fixtures.test.js
git commit -m "feat(stage7): add isolated M3 fixture package"
```

---

### Task 2: Implement the Fail-Closed Dataset v3 Loader

**Files:**
- Create: `training/stage7/mcagent_stage7/dataset.py`
- Create: `training/stage7/tests/conftest.py`
- Create: `training/stage7/tests/test_dataset.py`

**Interfaces:**
- Consumes: fixture manifest from Task 1 and committed Dataset v3 `manifest.json`/`cases.jsonl` records.
- Produces: `Stage7Case`, `Stage7Dataset.from_fixtures(root)`, `Stage7Dataset.from_real(index_root, artifact_root)`, `case_ids`, and `load_case(case_id, requested_layers) -> Stage7Case`.
- Raises: `DatasetGateError(code, case_id)` with stable codes `not-training-eligible`, `review-not-approved`, `license-not-training-approved`, `semantic-not-accepted`, `layer-not-permitted`, `stale-review-plan`, `artifact-hash-mismatch`, `wrong-origin`, and `unsafe-artifact-path`.

- [ ] **Step 1: Write failing real-data gate and fixture-isolation tests**

```python
# training/stage7/tests/test_dataset.py
import json
from pathlib import Path

import pytest

from mcagent_stage7.dataset import DatasetGateError, Stage7Dataset


ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "training" / "stage7" / "fixtures" / "m3"
V3 = ROOT / "mc_templates" / "datasets" / "coarse_semantic_voxels" / "v3"


def test_fixture_mode_loads_only_synthetic_fixture_cases():
    dataset = Stage7Dataset.from_fixtures(FIXTURES)
    assert dataset.mode == "fixture"
    assert dataset.readiness_contribution == 0
    assert dataset.case_ids == ("one-floor-house", "two-floor-house")
    assert dataset.load_case("one-floor-house", ("envelope", "space", "site")).origin == "synthetic-fixture"


def test_real_mode_rejects_the_current_ineligible_v3_case_before_artifact_access(tmp_path):
    first = json.loads((V3 / "cases.jsonl").read_text("utf8").splitlines()[0])
    dataset = Stage7Dataset.from_real(V3, tmp_path)
    with pytest.raises(DatasetGateError, match="not-training-eligible") as error:
        dataset.load_case(first["case_id"], ("envelope",))
    assert error.value.code == "not-training-eligible"


@pytest.mark.parametrize(
    ("mutation", "expected"),
    [
        ({"training.eligible": False}, "not-training-eligible"),
        ({"review.status": "pending"}, "review-not-approved"),
        ({"review.status": "research-only"}, "review-not-approved"),
        ({"source.allowed_uses": ["local-analysis"]}, "license-not-training-approved"),
        ({"extraction.semantic_status": "rejected"}, "semantic-not-accepted"),
        ({"training.permitted_layers": ["envelope"]}, "layer-not-permitted"),
        ({"review.approved_learning_areas": ["envelope"]}, "layer-not-permitted"),
        ({"artifacts.review_plan_sha256": "0" * 64}, "stale-review-plan"),
        ({"artifacts.review_plan_sha256": "1" * 64, "artifacts.plan_sha256": "1" * 64}, "artifact-hash-mismatch"),
    ],
)
def test_real_mode_has_a_stable_rejection_for_each_gate(eligible_real_dataset, mutation, expected):
    dataset, case_id = eligible_real_dataset(mutation)
    with pytest.raises(DatasetGateError) as error:
        dataset.load_case(case_id, ("envelope", "space", "site"))
    assert error.value.code == expected
```

The `eligible_real_dataset` fixture writes one temporary `cases.jsonl`, one temporary `manifest.json`, and one local plan; it starts from a fully eligible, accepted, plan-bound record and applies the dotted-key mutation before constructing `Stage7Dataset.from_real`.

Create it in `training/stage7/tests/conftest.py` with this exact data flow:

```python
import copy
import json
from pathlib import Path

import pytest

from mcagent_stage7.contracts import pretty_json_bytes, sha256_bytes
from mcagent_stage7.dataset import Stage7Dataset


STAGE7_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def fixture_root() -> Path:
    return STAGE7_ROOT / "fixtures" / "m3"


@pytest.fixture
def fixture_condition(fixture_root: Path) -> dict:
    return json.loads((fixture_root / "cases/one-floor-house/condition.json").read_text("utf8"))


@pytest.fixture
def eligible_real_dataset(tmp_path, fixture_root):
    source_plan = json.loads((fixture_root / "cases/one-floor-house/plan.json").read_text("utf8"))
    plan_bytes = pretty_json_bytes(source_plan)
    plan_sha256 = sha256_bytes(plan_bytes)

    def factory(mutations):
        index_root = tmp_path / f"index-{len(list(tmp_path.iterdir()))}"
        artifact_root = tmp_path / f"artifacts-{len(list(tmp_path.iterdir()))}"
        plan_path = artifact_root / "cases" / "eligible-real" / "plan.json"
        plan_path.parent.mkdir(parents=True)
        plan_path.write_bytes(plan_bytes)
        record = {
            "case_id": "eligible-real",
            "dataset_version": "v3",
            "origin": "real",
            "source": {"allowed_uses": ["local-training"]},
            "review": {"status": "approved", "approved_learning_areas": ["envelope", "space", "site"]},
            "training": {"eligible": True, "permitted_layers": ["envelope", "space", "site"], "blockers": []},
            "artifacts": {
                "review_plan_sha256": plan_sha256,
                "plan_sha256": plan_sha256,
                "local_plan_path": "cases/eligible-real/plan.json",
            },
            "extraction": {"semantic_status": "accepted"},
        }
        for dotted_key, value in mutations.items():
            owner = record
            parts = dotted_key.split(".")
            for part in parts[:-1]:
                owner = owner[part]
            owner[parts[-1]] = value
        index_root.mkdir(parents=True)
        (index_root / "manifest.json").write_bytes(pretty_json_bytes({
            "source": "stage7-coarse-semantic-voxel-dataset-v3",
            "schema_version": 3,
            "dataset_version": "v3",
            "training_eligible_count": int(record["training"]["eligible"]),
        }))
        (index_root / "cases.jsonl").write_text(json.dumps(record, separators=(",", ":")) + "\n", "utf8")
        return Stage7Dataset.from_real(index_root, artifact_root), record["case_id"]

    return factory
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q -p no:cacheprovider tests/test_dataset.py
```

Expected: import fails because `mcagent_stage7.dataset` does not exist.

- [ ] **Step 3: Implement separate constructors and ordered admission gates**

The public types are a frozen `Stage7Case` dataclass with `case_id: str`, `origin: str`, `condition: dict[str, Any]`, `plan: dict[str, Any]`, and `requested_layers: tuple[str, ...]`; a `DatasetGateError(Stage7ContractError)` carrying public `code` and `case_id` attributes; and a `Stage7Dataset` exposing the exact signatures `from_fixtures(root: Path) -> Stage7Dataset`, `from_real(index_root: Path, artifact_root: Path) -> Stage7Dataset`, and `load_case(case_id: str, requested_layers: tuple[str, ...]) -> Stage7Case`.

Implement the method bodies with these exact rules:

- `from_fixtures` requires manifest source `stage7-m3-fixture-dataset-v1`, `fixture_only is True`, `readiness_contribution == 0`, and every record origin `synthetic-fixture`.
- `from_real` requires dataset source `stage7-coarse-semantic-voxel-dataset-v3`, version `v3`, and rejects an artifact root equal to or inside the fixture root.
- `load_case` validates requested layers against `("envelope", "space", "site")` and applies the real gates in the order asserted by the parameterized test: training flag, approved/limited review state, `local-training` permission, semantic acceptance, both permitted-layer lists, exact review-plan binding, safe artifact path, then artifact hash.
- The plan path is resolved under `artifact_root`; `Path.resolve().relative_to(artifact_root.resolve())` must succeed before reading.
- The loader computes SHA-256 from the artifact bytes before parsing JSON.
- Fixture mode validates file hashes from its own manifest but never reads Dataset v3 readiness files.

- [ ] **Step 4: Run all loader tests**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q -p no:cacheprovider tests/test_dataset.py
```

Expected: all tests pass, including pending, research-only, rejected, wrong-layer, stale-plan, hash-mismatch, wrong-origin, and path-escape cases.

- [ ] **Step 5: Commit the governance loader**

```bash
git add training/stage7/mcagent_stage7/dataset.py training/stage7/tests/conftest.py training/stage7/tests/test_dataset.py
git commit -m "feat(stage7): gate M3 dataset loading"
```

---

### Task 3: Encode Conditions and Three Semantic Target Tensors

**Files:**
- Create: `training/stage7/mcagent_stage7/encoding.py`
- Create: `training/stage7/mcagent_stage7/tensors.py`
- Create: `training/stage7/tests/test_encoding.py`
- Create: `training/stage7/tests/test_tensors.py`

**Interfaces:**
- Consumes: `Stage7Case.condition`, `Stage7Case.plan`, and canonical vocabularies from `contracts.py`.
- Produces: `ConditionEncoder(size=64).encode(condition) -> torch.FloatTensor[64]`, `PlanTargets(envelope, space, site)`, `plan_to_targets(plan)`, and `predictions_to_plan(predictions, condition, provider)`.

- [ ] **Step 1: Write failing deterministic encoding tests**

```python
# training/stage7/tests/test_encoding.py
import copy
import json
from pathlib import Path

import torch

from mcagent_stage7.encoding import ConditionEncoder


FIXTURE_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "m3"


def test_condition_encoding_is_fixed_width_and_deterministic():
    condition = json.loads((FIXTURE_ROOT / "cases/one-floor-house/condition.json").read_text("utf8"))
    encoder = ConditionEncoder(size=64)
    first = encoder.encode(condition)
    second = encoder.encode(condition)
    assert first.shape == (64,)
    assert first.dtype == torch.float32
    assert torch.equal(first, second)
    assert torch.isfinite(first).all()


def test_unknown_categories_and_reference_summaries_have_stable_distinct_tokens():
    encoder = ConditionEncoder(size=64)
    base = json.loads((FIXTURE_ROOT / "cases/one-floor-house/condition.json").read_text("utf8"))
    base["design"]["style_family"] = None
    base["design"]["typology"] = None
    base["references"] = []
    referenced = copy.deepcopy(base)
    referenced["design"]["style_family"] = "modern"
    referenced["design"]["typology"] = "house"
    referenced["references"] = [{
        "case_id": "reviewed-a",
        "used_for": ["envelope"],
        "hints": [{"area": "envelope", "claim": "stepped massing", "confidence": 0.9}],
    }]
    assert torch.equal(encoder.encode(base), encoder.encode(base))
    assert not torch.equal(encoder.encode(base), encoder.encode(referenced))
```

- [ ] **Step 2: Write failing RLE tensor round-trip tests**

```python
# training/stage7/tests/test_tensors.py
import json
from pathlib import Path

import torch

from mcagent_stage7.contracts import ENVELOPE_VALUES, SITE_VALUES, SPACE_VALUES
from mcagent_stage7.tensors import plan_to_targets, predictions_to_plan


FIXTURE_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "m3"


def test_plan_expands_to_three_independent_64_cubed_targets():
    plan = json.loads((FIXTURE_ROOT / "cases/one-floor-house/plan.json").read_text("utf8"))
    targets = plan_to_targets(plan)
    assert targets.envelope.shape == (64, 64, 64)
    assert targets.space.shape == (64, 64, 64)
    assert targets.site.shape == (64, 64, 64)
    assert targets.envelope.dtype == targets.space.dtype == targets.site.dtype == torch.long
    assert int(targets.envelope.min()) == 0
    assert int(targets.envelope.max()) < len(ENVELOPE_VALUES)
    assert int(targets.space.max()) < len(SPACE_VALUES)
    assert int(targets.site.max()) < len(SITE_VALUES)


def test_predictions_decode_to_canonical_rle_and_preserve_layer_indices():
    condition = json.loads((FIXTURE_ROOT / "cases/one-floor-house/condition.json").read_text("utf8"))
    source = json.loads((FIXTURE_ROOT / "cases/one-floor-house/plan.json").read_text("utf8"))
    targets = plan_to_targets(source)
    decoded = predictions_to_plan(
        targets,
        condition,
        provider={
            "kind": "learned-python-shadow",
            "name": "stage7-tiny-cvae-v1",
            "model_version": "m3-fixture-v1",
            "dataset_version": "fixture-v1",
            "checkpoint_version": "sha256:" + "a" * 64,
        },
    )
    assert plan_to_targets(decoded).equal(targets)
    assert decoded["condition_hash"] == condition["condition_hash"]
    assert decoded["summary"] == {}
    assert decoded["derived_sketches"] == {"massing": [], "spaces": [], "site": []}
    assert decoded["conflicts"] == decoded["repairs"] == decoded["warnings"] == []
```

- [ ] **Step 3: Run the tests and verify the modules are absent**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q -p no:cacheprovider tests/test_encoding.py tests/test_tensors.py
```

Expected: collection fails for the two missing modules.

- [ ] **Step 4: Implement the deterministic 64-value condition encoder**

Use indices `0..6` for normalized numeric dimensions:

```python
width / 64
depth / 64
floors / 5
floor_height / 16
total_height / 64
lot_width / 64
lot_depth / 64
```

Use indices `7..63` as a signed hashing vector. Build sorted tokens for style, typology, footprint, front side, abstract site tags, selected concept, massing strategy, space strategy, approved reference `case_id`, reference `used_for`, and reference hint area/claim. Missing scalar values emit `<field>:<unknown>`. Hash each UTF-8 token with SHA-256, select `7 + digest[0] % 57`, add `+1` when `digest[1]` is even and `-1` otherwise, then L2-normalize the hashed portion when nonzero. Encode `seed` into the last hashed bucket as a stable signed value in `[-1, 1]` without calling a random generator.

- [ ] **Step 5: Implement canonical tensor conversion**

`PlanTargets` is a frozen dataclass with an `equal(other)` method using `torch.equal` for all three tensors. `plan_to_targets` initializes `envelope=none`, `space=outside`, and `site=none`, then expands each inclusive `x0..x1` run at tensor index `[y, z, x]`. It rejects overlaps, out-of-range coordinates, invalid labels, and noncanonical run order.

`predictions_to_plan` omits all-default cells, merges adjacent x cells only when all three labels match, emits one evidence record bound to the checkpoint, and orders runs by `z`, then `y`, then `x0`. It copies orientation and world transform from the condition and leaves every provider-derived field empty.

- [ ] **Step 6: Run Python tests and authoritative Node validation**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q -p no:cacheprovider tests/test_encoding.py tests/test_tensors.py
```

Expected: all encoding and tensor tests pass. Then validate the decoded fixture artifact with `validateStage7Plan({ condition })`; expected `ok: true` and no unknown provider field errors.

- [ ] **Step 7: Commit encoding and tensor contracts**

```bash
git add training/stage7/mcagent_stage7/encoding.py training/stage7/mcagent_stage7/tensors.py training/stage7/tests/test_encoding.py training/stage7/tests/test_tensors.py
git commit -m "feat(stage7): encode M3 conditions and targets"
```

---

### Task 4: Build the Tiny Conditional 3D VAE Smoke Model

**Files:**
- Create: `training/stage7/mcagent_stage7/model.py`
- Create: `training/stage7/tests/test_model.py`

**Interfaces:**
- Consumes: `torch.FloatTensor[batch, 64]` conditions and three `LongTensor[batch, 64, 64, 64]` targets.
- Produces: `TinyConditionalVAE`, `ModelOutput(envelope_logits, space_logits, site_logits, posterior_mu, posterior_logvar, prior_mu, prior_logvar)`, `LossOutput(total, envelope, space, site, dice, kl)`, and `model_loss(output, targets)`.

- [ ] **Step 1: Write the failing CPU forward/backward test**

```python
# training/stage7/tests/test_model.py
import json
from pathlib import Path

import pytest
import torch

from mcagent_stage7.encoding import ConditionEncoder
from mcagent_stage7.model import TinyConditionalVAE, model_loss
from mcagent_stage7.tensors import PlanTargets, plan_to_targets


FIXTURE_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "m3"


@pytest.fixture
def fixture_batch():
    condition = json.loads((FIXTURE_ROOT / "cases/one-floor-house/condition.json").read_text("utf8"))
    plan = json.loads((FIXTURE_ROOT / "cases/one-floor-house/plan.json").read_text("utf8"))
    targets = plan_to_targets(plan)
    return (
        ConditionEncoder(size=64).encode(condition).unsqueeze(0),
        PlanTargets(
            envelope=targets.envelope.unsqueeze(0),
            space=targets.space.unsqueeze(0),
            site=targets.site.unsqueeze(0),
        ),
    )


def test_tiny_cvae_has_three_heads_and_updates_parameters_on_cpu(fixture_batch):
    conditions, targets = fixture_batch
    torch.manual_seed(7101)
    model = TinyConditionalVAE(condition_size=64, latent_size=16, coarse_size=16).cpu()
    before = {name: value.detach().clone() for name, value in model.named_parameters()}
    output = model(conditions, targets)

    assert output.envelope_logits.shape == (1, 6, 16, 16, 16)
    assert output.space_logits.shape == (1, 7, 16, 16, 16)
    assert output.site_logits.shape == (1, 6, 16, 16, 16)
    loss = model_loss(output, targets)
    assert torch.isfinite(loss.total)

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    optimizer.zero_grad(set_to_none=True)
    loss.total.backward()
    assert all(parameter.grad is None or torch.isfinite(parameter.grad).all() for parameter in model.parameters())
    optimizer.step()
    assert any(not torch.equal(before[name], value) for name, value in model.named_parameters())
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q -p no:cacheprovider tests/test_model.py
```

Expected: import fails because `mcagent_stage7.model` does not exist.

- [ ] **Step 3: Implement the deliberately small architecture**

Use this exact topology:

- Convert the three full-resolution targets to one-hot channels, concatenate `6 + 7 + 6 = 19` channels, and nearest-downsample to `16^3`.
- Encoder: `Conv3d(19, 16, 3, stride=2, padding=1)`, SiLU, `Conv3d(16, 32, 3, stride=2, padding=1)`, SiLU, flatten.
- Project the 64-value condition through `Linear(64, 32)` plus SiLU. A condition-only prior uses separate `Linear(32, 16)` heads for `prior_mu` and `prior_logvar`.
- Concatenate the condition embedding with the flattened `32 x 4 x 4 x 4` target encoder output. Separate `Linear(2080, 16)` heads produce `posterior_mu` and `posterior_logvar`; clamp both log-variance tensors to `[-12, 12]`.
- Decoder input is `[latent, condition_embedding]`; use `Linear(48, 32 x 4 x 4 x 4)`, reshape, then two `ConvTranspose3d` blocks to return to `16^3`.
- The decoder uses `ConvTranspose3d(32, 16, 4, stride=2, padding=1)`, SiLU, then `ConvTranspose3d(16, 16, 4, stride=2, padding=1)`, SiLU. Three heads `Conv3d(16, 6, 1)`, `Conv3d(16, 7, 1)`, and `Conv3d(16, 6, 1)` emit envelope, space, and site logits.
- Training samples from the posterior. `predict(condition)` has no target input and uses the deterministic condition-only `prior_mu`; it takes argmax per head and nearest-upsamples label indices to the canonical `64^3` grid.

The loss is the sum of three categorical cross-entropies, an occupancy Dice loss over all non-default labels with weight `0.25`, and conditional KL divergence `KL(q(z|targets, condition) || p(z|condition))` with weight `0.001`. Return every component separately.

- [ ] **Step 4: Add determinism and validation tests**

Add tests proving identical weights and inputs produce identical `predict` tensors, malformed shapes fail with explicit dimension messages, finite loss is required, and no CUDA device is consulted in the mandatory path.

- [ ] **Step 5: Run the focused model tests**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q -p no:cacheprovider tests/test_model.py
```

Expected: forward, backward, deterministic prediction, and invalid-shape tests all pass on CPU.

- [ ] **Step 6: Commit the model smoke path**

```bash
git add training/stage7/mcagent_stage7/model.py training/stage7/tests/test_model.py
git commit -m "feat(stage7): add tiny conditional voxel VAE"
```

---

### Task 5: Add Reproducible Fixture Training and Checkpoint Manifests

**Files:**
- Create: `training/stage7/mcagent_stage7/checkpoints.py`
- Create: `training/stage7/mcagent_stage7/train_fixture.py`
- Modify: `training/stage7/tests/conftest.py`
- Create: `training/stage7/tests/test_checkpoints.py`
- Create: `training/stage7/tests/test_train_fixture.py`

**Interfaces:**
- Consumes: fixture dataset, encoder, tensors, and model from Tasks 1–4.
- Produces: `train_fixture(config) -> RunArtifacts`, `save_checkpoint`, `load_checkpoint`, `checkpoint.pt`, `checkpoint_manifest.json`, `metrics.jsonl`, and stable SHA-256 values.

- [ ] **Step 1: Write failing checkpoint scope and reproducibility tests**

```python
# training/stage7/tests/test_train_fixture.py
import json

from mcagent_stage7.train_fixture import TrainConfig, train_fixture


def test_fixed_seed_fixture_training_is_reproducible(tmp_path, fixture_root):
    config = TrainConfig(
        fixture_root=fixture_root,
        seed=7101,
        steps=2,
        learning_rate=1e-3,
        device="cpu",
        code_revision="test-revision",
    )
    first = train_fixture(config, tmp_path / "first")
    second = train_fixture(config, tmp_path / "second")

    assert first.checkpoint_sha256 == second.checkpoint_sha256
    assert first.manifest_sha256 == second.manifest_sha256
    assert first.metrics_sha256 == second.metrics_sha256
    assert first.final_loss == second.final_loss

    manifest = json.loads(first.manifest_path.read_text("utf8"))
    assert manifest["training_scope"] == "fixture-only"
    assert manifest["dataset_version"] == "fixture-v1"
    assert manifest["device"] == "cpu"
    assert manifest["seed"] == 7101
    assert manifest["checkpoint_sha256"] == first.checkpoint_sha256
    assert "quality" not in manifest
    assert "generalization" not in manifest
```

```python
# training/stage7/tests/test_checkpoints.py
import pytest

from mcagent_stage7.checkpoints import CheckpointScopeError, load_checkpoint
from mcagent_stage7.contracts import pretty_json_bytes


def test_m3_loader_rejects_any_non_fixture_checkpoint(tmp_path, trained_checkpoint):
    manifest = dict(trained_checkpoint.manifest)
    manifest["training_scope"] = "prototype"
    manifest_path = tmp_path / "checkpoint_manifest.json"
    manifest_path.write_bytes(pretty_json_bytes(manifest))
    with pytest.raises(CheckpointScopeError, match="fixture-only"):
        load_checkpoint(trained_checkpoint.checkpoint_path, manifest_path, require_scope="fixture-only")
```

Extend `training/stage7/tests/conftest.py` with a session-local trained artifact fixture:

```python
from mcagent_stage7.train_fixture import TrainConfig, train_fixture


@pytest.fixture
def trained_checkpoint(tmp_path, fixture_root):
    return train_fixture(
        TrainConfig(
            fixture_root=fixture_root,
            seed=7101,
            steps=2,
            learning_rate=1e-3,
            device="cpu",
            code_revision="test-revision",
        ),
        tmp_path / "trained",
    )
```

- [ ] **Step 2: Run tests and verify the modules are absent**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q -p no:cacheprovider tests/test_checkpoints.py tests/test_train_fixture.py
```

Expected: collection fails for the missing modules.

- [ ] **Step 3: Implement deterministic checkpoint serialization**

`save_checkpoint` must save an ordered CPU-only state dict using `torch.save(payload, checkpoint_path, _use_new_zipfile_serialization=False)`, compute the file SHA-256, and build the manifest with this exact field mapping:

```python
manifest = {
    "source": "stage7-m3-checkpoint-manifest-v1",
    "schema_version": 1,
    "training_scope": "fixture-only",
    "model_name": "stage7-tiny-cvae-v1",
    "model_version": "m3-fixture-v1",
    "dataset_version": "fixture-v1",
    "dataset_manifest_sha256": dataset_manifest_sha256,
    "code_revision": code_revision,
    "python_version": platform.python_version(),
    "torch_version": torch.__version__,
    "seed": config.seed,
    "device": "cpu",
    "deterministic_algorithms": True,
    "config": {
        "condition_size": 64,
        "latent_size": 16,
        "coarse_size": 16,
        "steps": config.steps,
        "learning_rate": config.learning_rate,
    },
    "checkpoint_file": checkpoint_path.name,
    "checkpoint_sha256": checkpoint_sha256,
}
```

Validate both SHA-256 fields with `^[a-f0-9]{64}$`. The manifest must contain no timestamp, absolute path, hostname, CUDA device, or mutable Git status so identical inputs remain byte-identical.

- [ ] **Step 4: Implement fixture-only training**

`TrainConfig` is a frozen dataclass. `train_fixture` must:

1. Reject any dataset not opened through `Stage7Dataset.from_fixtures`.
2. Set Python, NumPy, and Torch seeds; call `torch.use_deterministic_algorithms(True)`; set Torch thread count to one for the acceptance run.
3. Load cases in manifest order with batch size one and no shuffle.
4. Run exactly `steps` optimizer updates on CPU, rejecting non-finite losses or gradients.
5. Write one canonical JSON object per metrics line with step, total loss, component losses, and parameter SHA-256.
6. Save the checkpoint and canonical manifest through `checkpoints.py`.
7. Return a frozen `RunArtifacts` dataclass with `stage7_root`, `checkpoint_path`, `manifest_path`, `metrics_path`, parsed `manifest`, `checkpoint_sha256`, `manifest_sha256`, `metrics_sha256`, and `final_loss`.

The CLI accepts `--fixture-root`, `--output`, `--seed`, `--steps`, `--learning-rate`, `--device cpu`, and `--code-revision`. It refuses `--device cuda` in the fixture acceptance command; optional CUDA exploration remains outside the acceptance artifact.

- [ ] **Step 5: Run reproducibility tests twice**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q -p no:cacheprovider tests/test_checkpoints.py tests/test_train_fixture.py
```

Expected: both independently trained outputs have equal checkpoint, manifest, and metrics hashes.

- [ ] **Step 6: Run the fixture trainer manually**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.train_fixture --fixture-root fixtures/m3 --output runs/m3-fixture-smoke --seed 7101 --steps 2 --learning-rate 0.001 --device cpu --code-revision local-smoke
```

Expected: exit zero; final lines include `training_scope: fixture-only`, `device: cpu`, a finite final loss, and three SHA-256 values. `git status --short` must not show run or checkpoint artifacts.

- [ ] **Step 7: Commit training and checkpoint support**

```bash
git add training/stage7/mcagent_stage7/checkpoints.py training/stage7/mcagent_stage7/train_fixture.py training/stage7/tests/conftest.py training/stage7/tests/test_checkpoints.py training/stage7/tests/test_train_fixture.py
git commit -m "feat(stage7): train reproducible fixture checkpoints"
```

---

### Task 6: Emit Canonical Python Inference and Validate It in Node.js

**Files:**
- Create: `training/stage7/mcagent_stage7/infer.py`
- Create: `training/stage7/validate_plan.mjs`
- Create: `training/stage7/tests/test_infer.py`

**Interfaces:**
- Consumes: a fixture-only checkpoint manifest plus a Stage 7 condition on stdin or from `--condition`.
- Produces: one canonical Stage 7 plan on stdout or at `--output`, plus `InferenceResult(input_sha256, output_sha256, plan)` for Python callers.

- [ ] **Step 1: Write failing checkpoint reload and inference tests**

```python
# training/stage7/tests/test_infer.py
import json
import subprocess
import sys

from mcagent_stage7.infer import infer_condition


def test_fixture_checkpoint_reloads_and_emits_reproducible_plan(trained_checkpoint, fixture_condition):
    first = infer_condition(trained_checkpoint.checkpoint_path, trained_checkpoint.manifest_path, fixture_condition)
    second = infer_condition(trained_checkpoint.checkpoint_path, trained_checkpoint.manifest_path, fixture_condition)
    assert first.input_sha256 == second.input_sha256
    assert first.output_sha256 == second.output_sha256
    assert first.plan == second.plan
    assert first.plan["condition_hash"] == fixture_condition["condition_hash"]
    assert first.plan["provider"]["kind"] == "learned-python-shadow"
    assert first.plan["provider"]["checkpoint_version"] == "sha256:" + trained_checkpoint.checkpoint_sha256


def test_inference_cli_uses_stdout_for_json_only(trained_checkpoint, fixture_condition):
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "mcagent_stage7.infer",
            "--checkpoint",
            str(trained_checkpoint.checkpoint_path),
            "--manifest",
            str(trained_checkpoint.manifest_path),
            "--stdin",
            "--output",
            "-",
        ],
        input=json.dumps(fixture_condition),
        text=True,
        capture_output=True,
        check=False,
        cwd=trained_checkpoint.stage7_root,
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["source"] == "stage7-coarse-semantic-voxel-plan-v1"
    assert result.stderr == ""
```

- [ ] **Step 2: Run tests and verify inference is absent**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q -p no:cacheprovider tests/test_infer.py
```

Expected: import fails because `mcagent_stage7.infer` does not exist.

- [ ] **Step 3: Implement manifest-checked deterministic inference**

`infer_condition` must validate the condition source, schema version, `64^3` resolution, and canonical condition hash; load the checkpoint with `require_scope="fixture-only"`; reconstruct `TinyConditionalVAE` from manifest config; run `model.eval()` inside `torch.inference_mode()`; convert predictions through `predictions_to_plan`; and hash canonical input/output bytes. It must never import Node modules, read real Dataset v3 artifacts, or write a checkpoint.

The CLI writes only JSON to stdout when `--output -`; diagnostics and errors go to stderr with a nonzero exit. It rejects a missing manifest, checkpoint hash mismatch, wrong training scope, incompatible model version, and malformed condition.

- [ ] **Step 4: Add the authoritative Node validator**

```javascript
// training/stage7/validate_plan.mjs
import fs from 'node:fs/promises';
import { validateStage7Condition, validateStage7Plan } from '../../src/construction/learning/coarseSemanticVoxelSchema.js';

const [conditionPath, planPath] = process.argv.slice(2);
if (!conditionPath || !planPath) throw new Error('usage: node training/stage7/validate_plan.mjs <condition.json> <plan.json>');
const condition = JSON.parse(await fs.readFile(conditionPath, 'utf8'));
const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
const conditionValidation = validateStage7Condition(condition);
if (!conditionValidation.ok) throw new Error(`invalid condition: ${conditionValidation.errors.join('; ')}`);
const planValidation = validateStage7Plan(plan, { condition });
if (!planValidation.ok) throw new Error(`invalid plan: ${planValidation.errors.join('; ')}`);
console.log(JSON.stringify({ ok: true, condition_hash: condition.condition_hash, run_count: planValidation.stats.run_count }));
```

- [ ] **Step 5: Run Python inference and Node validation**

Train into a temporary ignored run directory, infer the one-floor fixture condition to `inference.json`, then run:

```bash
node training/stage7/validate_plan.mjs training/stage7/fixtures/m3/cases/one-floor-house/condition.json training/stage7/runs/m3-fixture-smoke/inference.json
```

Expected: the validator prints a JSON object with `ok: true`, the fixture condition hash, and an integer run count. If semantic repair later rejects the generated content, the canonical schema result remains explicit and the Node shadow path must record that rejection.

- [ ] **Step 6: Run all focused Python inference tests**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q -p no:cacheprovider tests/test_infer.py
```

Expected: checkpoint reload, repeated inference hash, CLI stdout, invalid-scope, corrupt-checkpoint, and malformed-condition tests pass.

- [ ] **Step 7: Commit inference and Node validation**

```bash
git add training/stage7/mcagent_stage7/infer.py training/stage7/validate_plan.mjs training/stage7/tests/test_infer.py
git commit -m "feat(stage7): emit canonical M3 inference plans"
```

---

### Task 7: Connect the Python Provider to the Existing Shadow-Only Node Boundary

**Files:**
- Create: `src/construction/learning/pythonCoarseSemanticVoxelProvider.js`
- Modify: `src/construction/learning/coarseSemanticVoxelShadow.js:1-17`
- Modify: `src/construction/workflow.js:37-108`
- Modify: `src/pipeline.js:10-66,76-132,447-454`
- Modify: `src/index.js:18-145,168-201`
- Create: `test/stage7PythonProvider.test.js`
- Modify: `test/stage7Cli.test.js:5-38`
- Modify: `test/stage7Pipeline.test.js:23-65`

**Interfaces:**
- Consumes: `coarseVoxelCheckpoint`, optional internal `coarseVoxelPythonExecutable`, and the existing Stage 7 condition.
- Produces: `createPythonCoarseSemanticVoxelProvider(options)` with provider id `python`; raw canonical plan JSON plus non-enumerable invocation provenance; unchanged repair/conversion/fallback behavior.

- [ ] **Step 1: Write failing Node provider tests with an injected process runner**

```javascript
// test/stage7PythonProvider.test.js
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPythonCoarseSemanticVoxelProvider } from '../src/construction/learning/pythonCoarseSemanticVoxelProvider.js';

const fixtureRoot = path.join(process.cwd(), 'training', 'stage7', 'fixtures', 'm3', 'cases', 'one-floor-house');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function validCondition() {
  return JSON.parse(readFileSync(path.join(fixtureRoot, 'condition.json'), 'utf8'));
}

function validPlanFor() {
  const plan = JSON.parse(readFileSync(path.join(fixtureRoot, 'plan.json'), 'utf8'));
  plan.provider = {
    kind: 'learned-python-shadow',
    name: 'stage7-tiny-cvae-v1',
    model_version: 'm3-fixture-v1',
    dataset_version: 'fixture-v1',
    checkpoint_version: 'sha256:' + sha256('fixture-checkpoint')
  };
  return plan;
}

test('python provider accepts only fixture-scoped M3 checkpoint manifests', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-python-provider-'));
  try {
    const checkpoint = path.join(root, 'checkpoint.pt');
    const manifest = path.join(root, 'checkpoint_manifest.json');
    await fs.writeFile(checkpoint, 'fixture-checkpoint', 'utf8');
    await fs.writeFile(manifest, JSON.stringify({
      source: 'stage7-m3-checkpoint-manifest-v1',
      schema_version: 1,
      training_scope: 'fixture-only',
      model_name: 'stage7-tiny-cvae-v1',
      model_version: 'm3-fixture-v1',
      dataset_version: 'fixture-v1',
      checkpoint_file: 'checkpoint.pt',
      checkpoint_sha256: sha256('fixture-checkpoint')
    }), 'utf8');
    const provider = createPythonCoarseSemanticVoxelProvider({
      checkpointPath: checkpoint,
      manifestPath: manifest,
      invoke: async ({ condition }) => JSON.stringify(validPlanFor(condition))
    });
    const plan = await provider.generate({ condition: validCondition() });
    assert.equal(plan.provider.kind, 'learned-python-shadow');
    assert.equal(plan.__stage7PythonProvenance.training_scope, 'fixture-only');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('python provider fails closed on scope, timeout, oversized stdout, and malformed JSON', async () => {
  for (const failure of ['scope', 'timeout', 'oversized', 'malformed']) {
    await assert.rejects(runFailure(failure), /fixture-only|timed out|output limit|parse/);
  }
});

async function runFailure(kind) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `stage7-python-${kind}-`));
  const checkpoint = path.join(root, 'checkpoint.pt');
  const manifest = path.join(root, 'checkpoint_manifest.json');
  await fs.writeFile(checkpoint, 'fixture-checkpoint', 'utf8');
  await fs.writeFile(manifest, JSON.stringify({
    source: 'stage7-m3-checkpoint-manifest-v1',
    schema_version: 1,
    training_scope: kind === 'scope' ? 'prototype' : 'fixture-only',
    model_name: 'stage7-tiny-cvae-v1',
    model_version: 'm3-fixture-v1',
    dataset_version: 'fixture-v1',
    checkpoint_file: 'checkpoint.pt',
    checkpoint_sha256: sha256('fixture-checkpoint')
  }), 'utf8');
  const provider = createPythonCoarseSemanticVoxelProvider({
    checkpointPath: checkpoint,
    manifestPath: manifest,
    invoke: async () => {
      if (kind === 'timeout') throw new Error('python provider timed out');
      if (kind === 'oversized') return 'x'.repeat(32 * 1024 * 1024 + 1);
      if (kind === 'malformed') return '{';
      return JSON.stringify(validPlanFor());
    }
  });
  try {
    return await provider.generate({ condition: validCondition() });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}
```

- [ ] **Step 2: Update CLI tests before production code**

Replace the old “python reserved for M3” expectation with these assertions:

```javascript
const missingCheckpoint = runCli(['--coarse-voxel-mode', 'shadow', '--coarse-voxel-provider', 'python', 'fixture']);
assert.equal(missingCheckpoint.status, 1);
assert.match(missingCheckpoint.stderr, /python provider requires --coarse-voxel-checkpoint/);

const apply = runCli(['--coarse-voxel-mode', 'apply', '--coarse-voxel-provider', 'python', '--coarse-voxel-checkpoint', 'checkpoint.pt', 'fixture']);
assert.equal(apply.status, 1);
assert.match(apply.stderr, /apply mode is reserved for Stage 7 Milestone 4/);
```

The help test must match `baseline|artifact|python`, `--coarse-voxel-checkpoint <path>`, `fixture-only`, and `shadow does not change primary geometry`.

- [ ] **Step 3: Run Node tests and verify they fail**

Run:

```bash
node --test test/stage7PythonProvider.test.js test/stage7Cli.test.js test/stage7Pipeline.test.js
```

Expected: the new provider module is missing and the CLI still rejects `python` as reserved.

- [ ] **Step 4: Implement the bounded Python provider**

`createPythonCoarseSemanticVoxelProvider` must:

1. Resolve checkpoint and manifest paths and require both inside files, not directories.
2. Parse the manifest before process launch; require source/version, `training_scope: fixture-only`, checkpoint basename match, and checkpoint SHA-256 match.
3. Invoke either the injected `invoke` function or the default command. The default command uses `STAGE7_PYTHON_EXECUTABLE` when set; otherwise it runs `conda run --no-capture-output -n mcagent-stage7 python -m mcagent_stage7.infer` with `cwd=training/stage7`.
4. Pass the canonical condition JSON through stdin and explicit checkpoint/manifest arguments; never interpolate shell text.
5. Enforce a 60-second timeout and 32 MiB stdout/stderr limits.
6. Parse one JSON object, reject arrays or trailing non-whitespace output, and attach non-enumerable provenance containing checkpoint hash, manifest hash, model/dataset versions, training scope, executable kind, duration, and byte count.

Export `resolvePythonInvocation` separately for argument-list tests. Use `execFile` or `spawn` without `shell: true`.

- [ ] **Step 5: Route `python` through the existing shadow runner**

Import the new provider in `coarseSemanticVoxelShadow.js`. Extend `selectCoarseSemanticVoxelProvider(name, options)` with a `python` branch and pass `checkpointPath`, `manifestPath`, and internal executable options. Keep `runCoarseSemanticVoxelShadow` mode validation at `shadow`; do not add an Apply branch. Use `rawPlan.__stage7PythonProvenance || rawPlan.__stage7ArtifactProvenance || rawPlan.provider` for provenance so repair, conversion, report rendering, and rejection remain shared.

Normalize provenance explicitly: artifact providers expose `sha256`; Python providers expose `checkpoint_sha256`, `manifest_sha256`, and `training_scope`. `compactCoarseSemanticVoxelShadow` adds `checkpoint_sha256` and `training_scope` without relabelling the checkpoint as an artifact. The Markdown report prints both artifact and checkpoint provenance. Python provider exceptions attach `stage7PythonProvenance`; `reject` copies it into `failureCase.provider_metadata` so timeout, scope, hash, parse, schema, and conversion failures remain diagnosable even when no raw plan exists.

Extend pipeline/workflow argument objects with:

```javascript
coarseVoxelCheckpoint,
coarseVoxelCheckpointManifest,
coarseVoxelPythonExecutable
```

The CLI exposes only `--coarse-voxel-checkpoint <path>` and derives the sibling manifest as `checkpoint_manifest.json`. The executable override remains environment/internal-test configuration. Validation rules are:

- provider options require `shadow` mode;
- artifact requires `--coarse-voxel-plan` and rejects checkpoint options;
- python requires checkpoint, rejects plan, and may run multiple candidates because each condition is inferred independently;
- baseline rejects both plan and checkpoint;
- apply always fails before provider launch.

- [ ] **Step 6: Add pipeline operation-parity and rejection tests**

Use an injected Python provider runner in the test path to return a canonical plan. Assert both converted and rejected Python shadow results preserve exact ordered `blueprint.operations` from the fixed-seed rule-only run. Assert provider timeout, malformed output, scope mismatch, and Node schema rejection all produce `stage7_failure_case.json`, `fallback: primary-build-unchanged`, and a successful normal build.

- [ ] **Step 7: Run focused Node tests**

Run:

```bash
node --test test/stage7PythonProvider.test.js test/stage7Cli.test.js test/stage7Pipeline.test.js test/coarseSemanticVoxelSchema.test.js test/coarseSemanticVoxelShadow.test.js
```

Expected: all focused tests pass; help exposes M3 Python shadow; apply remains unavailable; default and explicit off behavior remain byte-for-byte operation-equivalent.

- [ ] **Step 8: Commit the Node shadow adapter**

```bash
git add src/construction/learning/pythonCoarseSemanticVoxelProvider.js src/construction/learning/coarseSemanticVoxelShadow.js src/construction/workflow.js src/pipeline.js src/index.js test/stage7PythonProvider.test.js test/stage7Cli.test.js test/stage7Pipeline.test.js
git commit -m "feat(stage7): connect M3 python shadow provider"
```

---

### Task 8: Add Cross-Runtime Acceptance, Documentation, and Final Evidence

**Files:**
- Create: `training/stage7/mcagent_stage7/acceptance.py`
- Create: `training/stage7/tests/test_acceptance.py`
- Create: `training/stage7/README.md`
- Create: `docs/benchmarks/stage7-m3-fixture-foundation.md`
- Modify: `package.json:5-24`
- Modify: `README.md:19-30,145-165`
- Modify: `AGENT.md:85-105`
- Modify: `docs/roadmap.md:650-685`
- Modify: `docs/index.html:115-135,190-205`

**Interfaces:**
- Consumes: all M3 components and the unchanged Node Stage 7 safety boundary.
- Produces: one mandatory CPU acceptance command, reproducibility report JSON, Node schema result, shadow parity evidence, and accurate fixture-only project documentation.

- [ ] **Step 1: Write the failing acceptance orchestration test**

```python
# training/stage7/tests/test_acceptance.py
from mcagent_stage7.acceptance import AcceptanceConfig, run_acceptance


def test_acceptance_runs_twice_and_validates_the_node_boundary(tmp_path, fixture_root):
    result = run_acceptance(AcceptanceConfig(
        fixture_root=fixture_root,
        output_root=tmp_path,
        seed=7101,
        steps=2,
        code_revision="test-revision",
    ))
    assert result["source"] == "stage7-m3-fixture-acceptance-v1"
    assert result["cpu_smoke"] == "ok"
    assert result["checkpoint_reproducible"] is True
    assert result["inference_reproducible"] is True
    assert result["node_schema_valid"] is True
    assert result["primary_geometry_changed"] is False
    assert result["training_scope"] == "fixture-only"
    assert result["real_training_started"] is False
```

- [ ] **Step 2: Run the acceptance test and verify the orchestrator is absent**

Run:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q -p no:cacheprovider tests/test_acceptance.py
```

Expected: import fails because `mcagent_stage7.acceptance` does not exist.

- [ ] **Step 3: Implement the two-run acceptance command**

`run_acceptance` must:

1. Call the existing `verify_environment.verify_cpu()` without requiring CUDA.
2. Train two isolated runs using identical config and compare checkpoint, manifest, metrics, and parameter hashes.
3. Infer the same committed condition from both checkpoints and compare canonical output hashes.
4. Write both inference plans, call `node training/stage7/validate_plan.mjs`, parse its JSON, and require `ok: true`.
5. Launch one fixed-seed Node rule-only build and one Python shadow build with `STAGE7_PYTHON_EXECUTABLE=sys.executable`; compare ordered blueprint operations and require equality even when learned semantic repair rejects the candidate.
6. Read Dataset v3 `manifest.json` and require `ready_for_m3_real_data is False` and `training_eligible_count == 0`; abort if either changes so the fixture acceptance cannot silently become a real-data training command.
7. Write `acceptance.json` using canonical JSON with hashes and explicit booleans. Do not report accuracy, generalization, preference, or model quality.

The CLI accepts `--fixture-root`, `--output`, `--seed`, `--steps`, and optional `--code-revision`, prints the acceptance JSON, and exits nonzero on any mismatch. When the revision is omitted it records `git rev-parse HEAD`; tests pass an explicit revision so temporary worktree state cannot alter golden hashes.

- [ ] **Step 4: Add explicit package scripts**

Add these scripts without changing `"test": "node --test"`:

```json
"test:stage7:m3": "conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q -p no:cacheprovider .",
"train:stage7:fixture": "conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.train_fixture",
"accept:stage7:m3": "conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.acceptance"
```

- [ ] **Step 5: Document the exact fixture-only workflow**

`training/stage7/README.md` must include:

- WSL Linux filesystem and Conda environment requirements;
- `conda env update`, `pip check`, CPU verification, Python tests, fixture training, inference, and acceptance commands;
- the committed fixture root and ignored run/checkpoint roots;
- normal loader gates and the current real-data prohibition;
- checkpoint and inference manifest fields;
- direct statement that fixture loss is a plumbing signal, not quality evidence;
- direct statement that Python remains optional for normal Node generation;
- optional CUDA verification as a separate, non-acceptance command.

Update project status documents to say “Stage 7 M3 fixture-only foundation” rather than “M3 real-data training.” Keep `ready_for_m3_real_data=false`, keep M4 Apply Mode unavailable, and link the benchmark document.

- [ ] **Step 6: Run the mandatory CPU M3 acceptance**

Run:

```bash
npm run accept:stage7:m3 -- --fixture-root fixtures/m3 --output runs/m3-acceptance --seed 7101 --steps 2
```

Expected final fields:

```text
cpu_smoke: ok
checkpoint_reproducible: true
inference_reproducible: true
node_schema_valid: true
primary_geometry_changed: false
training_scope: fixture-only
real_training_started: false
```

- [ ] **Step 7: Run all Python tests**

Run:

```bash
npm run test:stage7:m3
```

Expected: every Python environment, fixture, loader, encoder, tensor, model, checkpoint, training, inference, and acceptance test passes on CPU with zero failures.

- [ ] **Step 8: Run focused and full Node verification**

Run:

```bash
node --test test/stage7PythonProvider.test.js test/stage7Cli.test.js test/stage7Pipeline.test.js test/coarseSemanticVoxelSchema.test.js test/coarseSemanticVoxelShadow.test.js
npm test
```

Expected: focused tests and the complete Node suite pass with zero failures, cancellations, skips, or todo results. Normal Node tests must not launch Conda or import PyTorch.

- [ ] **Step 9: Verify dataset immutability and workspace hygiene**

Run:

```bash
sha256sum mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json
git diff --exit-code HEAD -- mc_templates/datasets/coarse_semantic_voxels/v1 mc_templates/datasets/coarse_semantic_voxels/v2 mc_templates/datasets/coarse_semantic_voxels/v3
git status --short
```

Expected manifest hashes:

```text
fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749  v1/manifest.json
af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654  v2/manifest.json
5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082  v3/manifest.json
```

No ignored checkpoint, run output, cache, `.venv`, real plan artifact, or dataset mutation may appear in the commit.

- [ ] **Step 10: Record evidence and commit the completed fixture foundation**

Write `docs/benchmarks/stage7-m3-fixture-foundation.md` with exact command results, test totals, hashes, fixture case count, checkpoint/inference reproducibility booleans, Node validation result, shadow operation parity, current Dataset v3 gate values, and limitations. Then commit:

```bash
git add training/stage7/mcagent_stage7/acceptance.py training/stage7/tests/test_acceptance.py training/stage7/README.md package.json README.md AGENT.md docs/roadmap.md docs/index.html docs/benchmarks/stage7-m3-fixture-foundation.md
git commit -m "feat(stage7): complete M3 fixture foundation"
```

---

## Final Review Checklist

- [ ] `git rev-list --left-right --count HEAD...@{u}` was `0 0` before implementation began.
- [ ] The real Dataset v3 loader rejects every disallowed state before training reads tensor data.
- [ ] Fixture and real roots have distinct constructors, origins, paths, and readiness behavior.
- [ ] Conditions include deterministic unknown/category/reference/seed encoding.
- [ ] Targets use three independent canonical `64^3` categorical tensors.
- [ ] The tiny model demonstrates finite CPU forward/backward and a real parameter update.
- [ ] Checkpoint, manifest, metrics, and inference hashes reproduce across two isolated runs.
- [ ] Python inference emits the provider-neutral Stage 7 plan schema and no Minecraft operations.
- [ ] Node revalidates, repairs, converts, or explicitly rejects every learned plan.
- [ ] Python shadow preserves ordered primary blueprint operations.
- [ ] Apply Mode remains unavailable and fixture checkpoints cannot be mistaken for real-data prototypes.
- [ ] Normal Node generation and `npm test` remain Python-independent.
- [ ] Full Python, focused Node, full Node, dataset-hash, and hygiene checks pass.
- [ ] Documentation states fixture-only limitations and keeps the real-data gate closed.
