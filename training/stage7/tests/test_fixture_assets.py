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
