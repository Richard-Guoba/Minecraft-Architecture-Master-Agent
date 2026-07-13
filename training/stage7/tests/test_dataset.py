import json
import shutil
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


def test_fixture_mode_validates_artifact_hashes(tmp_path):
    fixture_root = tmp_path / "m3"
    shutil.copytree(FIXTURES, fixture_root)
    dataset = Stage7Dataset.from_fixtures(fixture_root)
    plan_path = fixture_root / "cases" / "one-floor-house" / "plan.json"
    plan_path.write_bytes(plan_path.read_bytes() + b"\n")

    with pytest.raises(DatasetGateError) as error:
        dataset.load_case("one-floor-house", ("envelope",))

    assert error.value.code == "artifact-hash-mismatch"


def test_fixture_mode_freezes_a_relative_root_at_construction(tmp_path, monkeypatch):
    monkeypatch.chdir(FIXTURES.parent)
    dataset = Stage7Dataset.from_fixtures(Path("m3"))
    monkeypatch.chdir(tmp_path)

    assert dataset.load_case("one-floor-house", ("envelope",)).origin == "synthetic-fixture"


def test_fixture_mode_rejects_a_real_origin_record(tmp_path):
    fixture_root = tmp_path / "m3"
    shutil.copytree(FIXTURES, fixture_root)
    manifest_path = fixture_root / "manifest.json"
    manifest = json.loads(manifest_path.read_text("utf8"))
    manifest["cases"][0]["origin"] = "real"
    manifest_path.write_text(json.dumps(manifest), "utf8")

    with pytest.raises(DatasetGateError) as error:
        Stage7Dataset.from_fixtures(fixture_root)

    assert error.value.code == "wrong-origin"


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


@pytest.mark.parametrize(
    ("mutations", "expected"),
    [
        ({"training.eligible": False, "review.status": "pending"}, "not-training-eligible"),
        ({"review.status": "pending", "source.allowed_uses": []}, "review-not-approved"),
        ({"source.allowed_uses": [], "extraction.semantic_status": "rejected"}, "license-not-training-approved"),
        (
            {"extraction.semantic_status": "rejected", "training.permitted_layers": ["envelope"]},
            "semantic-not-accepted",
        ),
        (
            {"training.permitted_layers": ["envelope"], "artifacts.review_plan_sha256": "0" * 64},
            "layer-not-permitted",
        ),
        (
            {"artifacts.review_plan_sha256": "0" * 64, "artifacts.local_plan_path": "../escape.json"},
            "stale-review-plan",
        ),
        (
            {
                "artifacts.review_plan_sha256": "1" * 64,
                "artifacts.plan_sha256": "1" * 64,
                "artifacts.local_plan_path": "../escape.json",
            },
            "unsafe-artifact-path",
        ),
    ],
)
def test_real_mode_applies_admission_gates_in_order(eligible_real_dataset, mutations, expected):
    dataset, case_id = eligible_real_dataset(mutations)

    with pytest.raises(DatasetGateError) as error:
        dataset.load_case(case_id, ("envelope", "space", "site"))

    assert error.value.code == expected


def test_real_mode_loads_an_eligible_approved_case(eligible_real_dataset):
    dataset, case_id = eligible_real_dataset({})

    case = dataset.load_case(case_id, ("envelope", "space", "site"))

    assert case.case_id == case_id
    assert case.origin == "real"
    assert case.requested_layers == ("envelope", "space", "site")
    assert case.plan["source"] == "stage7-coarse-semantic-voxel-plan-v1"


def test_real_mode_loads_a_limited_case_when_every_requested_layer_is_approved(eligible_real_dataset):
    dataset, case_id = eligible_real_dataset({"review.status": "limited"})

    assert dataset.load_case(case_id, ("envelope", "space", "site")).origin == "real"


def test_real_mode_rejects_unknown_requested_layers(eligible_real_dataset):
    dataset, case_id = eligible_real_dataset({})

    with pytest.raises(DatasetGateError) as error:
        dataset.load_case(case_id, ("blocks",))

    assert error.value.code == "layer-not-permitted"


def test_real_mode_checks_hash_before_parsing_artifact_json(eligible_real_dataset, tmp_path):
    dataset, case_id = eligible_real_dataset({})
    plan_path = next(tmp_path.glob("artifacts-*/cases/eligible-real/plan.json"))
    plan_path.write_bytes(b"{")

    with pytest.raises(DatasetGateError) as error:
        dataset.load_case(case_id, ("envelope", "space", "site"))

    assert error.value.code == "artifact-hash-mismatch"


def test_real_mode_rejects_a_synthetic_fixture_origin_record(eligible_real_dataset):
    with pytest.raises(DatasetGateError) as error:
        eligible_real_dataset({"origin": "synthetic-fixture"})

    assert error.value.code == "wrong-origin"


@pytest.mark.parametrize("artifact_root", [FIXTURES, FIXTURES / "cases"])
def test_real_mode_rejects_fixture_artifact_roots(artifact_root):
    with pytest.raises(DatasetGateError) as error:
        Stage7Dataset.from_real(V3, artifact_root)

    assert error.value.code == "wrong-origin"


def test_real_mode_rejects_fixture_plan_beneath_a_parent_artifact_root(tmp_path):
    fixture_case = json.loads((FIXTURES / "manifest.json").read_text("utf8"))["cases"][0]
    artifact_root = FIXTURES.parents[1]
    fixture_plan = FIXTURES / fixture_case["plan_path"]
    record = {
        "case_id": "one-floor-house",
        "dataset_version": "v3",
        "origin": "real",
        "source": {"allowed_uses": ["local-training"]},
        "review": {"status": "approved", "approved_learning_areas": ["envelope", "space", "site"]},
        "training": {"eligible": True, "permitted_layers": ["envelope", "space", "site"]},
        "artifacts": {
            "review_plan_sha256": fixture_case["plan_sha256"],
            "plan_sha256": fixture_case["plan_sha256"],
            "local_plan_path": fixture_plan.relative_to(artifact_root).as_posix(),
        },
        "extraction": {"semantic_status": "accepted"},
    }
    index_root = tmp_path / "index"
    index_root.mkdir()
    (index_root / "manifest.json").write_text(json.dumps({
        "source": "stage7-coarse-semantic-voxel-dataset-v3",
        "dataset_version": "v3",
        "training_eligible_count": 1,
    }), "utf8")
    (index_root / "cases.jsonl").write_text(json.dumps(record) + "\n", "utf8")
    dataset = Stage7Dataset.from_real(index_root, artifact_root)

    with pytest.raises(DatasetGateError) as error:
        dataset.load_case("one-floor-house", ("envelope", "space", "site"))

    assert error.value.code == "wrong-origin"


def test_real_mode_rejects_artifact_path_escape(eligible_real_dataset):
    dataset, case_id = eligible_real_dataset({"artifacts.local_plan_path": "../escape.json"})

    with pytest.raises(DatasetGateError) as error:
        dataset.load_case(case_id, ("envelope", "space", "site"))

    assert error.value.code == "unsafe-artifact-path"


def test_real_mode_freezes_a_relative_artifact_root_at_construction(tmp_path, monkeypatch):
    fixture_case = json.loads((FIXTURES / "manifest.json").read_text("utf8"))["cases"][0]
    record = {
        "case_id": "one-floor-house",
        "dataset_version": "v3",
        "origin": "real",
        "source": {"allowed_uses": ["local-training"]},
        "review": {"status": "approved", "approved_learning_areas": ["envelope", "space", "site"]},
        "training": {"eligible": True, "permitted_layers": ["envelope", "space", "site"]},
        "artifacts": {
            "review_plan_sha256": fixture_case["plan_sha256"],
            "plan_sha256": fixture_case["plan_sha256"],
            "local_plan_path": fixture_case["plan_path"],
        },
        "extraction": {"semantic_status": "accepted"},
    }
    index_root = tmp_path / "index"
    index_root.mkdir()
    (index_root / "manifest.json").write_text(json.dumps({
        "source": "stage7-coarse-semantic-voxel-dataset-v3",
        "dataset_version": "v3",
        "training_eligible_count": 1,
    }), "utf8")
    (index_root / "cases.jsonl").write_text(json.dumps(record) + "\n", "utf8")

    monkeypatch.chdir(tmp_path)
    dataset = Stage7Dataset.from_real(index_root, Path("m3"))
    monkeypatch.chdir(FIXTURES.parent)

    with pytest.raises(DatasetGateError) as error:
        dataset.load_case("one-floor-house", ("envelope", "space", "site"))

    assert error.value.code == "artifact-hash-mismatch"
