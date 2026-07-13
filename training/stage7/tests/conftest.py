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
