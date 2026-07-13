from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from .contracts import (
    CONDITION_SOURCE,
    ENCODING,
    ENVELOPE_VALUES,
    PLAN_SOURCE,
    RESOLUTION,
    SCHEMA_VERSION,
    SITE_VALUES,
    SPACE_VALUES,
    Stage7ContractError,
    condition_hash,
    pretty_json_bytes,
    sha256_file,
)


FIXTURE_SOURCE = "stage7-m3-fixture-dataset-v1"
PROVIDER = {
    "kind": "synthetic-fixture",
    "name": "stage7-m3-fixture-generator-v1",
    "model_version": None,
    "dataset_version": "fixture-v1",
    "checkpoint_version": None,
}
CASE_SPECS = (
    {"case_id": "one-floor-house", "seed": 7101, "floors": 1},
    {"case_id": "two-floor-house", "seed": 7102, "floors": 2},
)


def build_fixture_root(root: Path) -> dict[str, Any]:
    root = Path(root)
    records = []
    for spec in CASE_SPECS:
        case_id = spec["case_id"]
        condition_relative = Path("cases") / case_id / "condition.json"
        plan_relative = Path("cases") / case_id / "plan.json"
        condition_path = _output_path(root, condition_relative)
        plan_path = _output_path(root, plan_relative)
        condition = _build_condition(case_id=case_id, seed=spec["seed"], floors=spec["floors"])
        plan = _build_plan(condition=condition, case_id=case_id)
        _write_json(condition_path, condition)
        _write_json(plan_path, plan)
        records.append(
            {
                "case_id": case_id,
                "condition_path": condition_relative.as_posix(),
                "condition_sha256": sha256_file(condition_path),
                "fixture_only": True,
                "origin": "synthetic-fixture",
                "plan_path": plan_relative.as_posix(),
                "plan_sha256": sha256_file(plan_path),
                "readiness_contribution": 0,
            }
        )

    manifest = {
        "source": FIXTURE_SOURCE,
        "schema_version": SCHEMA_VERSION,
        "fixture_only": True,
        "readiness_contribution": 0,
        "cases": sorted(records, key=lambda record: record["case_id"]),
    }
    _write_json(_output_path(root, Path("manifest.json")), manifest)
    return manifest


def _build_condition(*, case_id: str, seed: int, floors: int) -> dict[str, Any]:
    floor_height = 4
    payload = {
        "source": CONDITION_SOURCE,
        "schema_version": SCHEMA_VERSION,
        "prompt": f"Synthetic fixture for {case_id}",
        "seed": seed,
        "dimensions": {
            "width": 12,
            "depth": 10,
            "floors": floors,
            "floor_height": floor_height,
            "total_height": floors * floor_height + 1,
            "lot_width": 24,
            "lot_depth": 20,
        },
        "design": {
            "style_family": "unknown",
            "typology": "house",
            "footprint": "rectangle",
            "front_side": "south",
            "abstract_site_tags": ["unknown"],
            "selected_concept_id": "unknown",
            "massing_strategy": ["unknown"],
            "space_strategy": ["unknown"],
            "quality_targets": ["unknown"],
            "massing_volumes": [],
            "topology_program": {"nodes": [], "edges": [], "zoning": {}},
        },
        "references": [],
        "constraints": {
            "resolution": list(RESOLUTION),
            "max_total_height": 40,
            "minecraft_fill_limit": 32768,
        },
    }
    return {**payload, "condition_hash": condition_hash(payload)}


def _build_plan(*, condition: dict[str, Any], case_id: str) -> dict[str, Any]:
    evidence_id = f"fixture:{case_id}"
    cells = _fixture_cells(floors=condition["dimensions"]["floors"], evidence_id=evidence_id)
    return {
        "source": PLAN_SOURCE,
        "schema_version": SCHEMA_VERSION,
        "provider": dict(PROVIDER),
        "condition_hash": condition["condition_hash"],
        "resolution": list(RESOLUTION),
        "encoding": ENCODING,
        "orientation": {"front_side": condition["design"]["front_side"], "vertical_axis": "y-up"},
        "world_transform": {
            "lot_width": condition["dimensions"]["lot_width"],
            "lot_depth": condition["dimensions"]["lot_depth"],
            "total_height": condition["dimensions"]["total_height"],
            "ground_y": 0,
        },
        "runs": _encode_cells(cells),
        "evidence": [
            {
                "id": evidence_id,
                "kind": "synthetic-fixture",
                "source_id": case_id,
                "detail": "Source-independent committed Stage 7 M3 fixture",
            }
        ],
        "summary": {},
        "derived_sketches": {"massing": [], "spaces": [], "site": []},
        "conflicts": [],
        "repairs": [],
        "warnings": [],
    }


def _fixture_cells(*, floors: int, evidence_id: str) -> list[dict[str, Any]]:
    cells: dict[tuple[int, int, int], dict[str, Any]] = {}
    for z in range(2, 22):
        for x in range(2, 26):
            site = "path" if 12 <= x <= 13 and z >= 15 else "ground"
            _put_cell(cells, x=x, y=0, z=z, site=site, evidence_id=evidence_id)

    x_min, x_max = 8, 19
    z_min, z_max = 6, 15
    for floor in range(floors):
        floor_y = 1 + floor * 4
        for y in range(floor_y, floor_y + 4):
            for z in range(z_min, z_max + 1):
                for x in range(x_min, x_max + 1):
                    boundary = x in (x_min, x_max) or z in (z_min, z_max)
                    envelope = "floor" if y == floor_y else ("wall" if boundary else "none")
                    space = _space_value(x=x, z=z, floor=floor, floors=floors)
                    if boundary and y > floor_y:
                        space = "outside"
                    if z == z_max and x in (13, 14) and y == floor_y + 1:
                        envelope = "opening"
                        space = "circulation"
                    _put_cell(
                        cells,
                        x=x,
                        y=y,
                        z=z,
                        envelope=envelope,
                        space=space,
                        evidence_id=evidence_id,
                    )

    roof_y = 1 + floors * 4
    for z in range(z_min, z_max + 1):
        for x in range(x_min, x_max + 1):
            _put_cell(cells, x=x, y=roof_y, z=z, envelope="roof", evidence_id=evidence_id)
    return list(cells.values())


def _space_value(*, x: int, z: int, floor: int, floors: int) -> str:
    if floors > 1 and 17 <= x <= 18 and 12 <= z <= 13:
        return "vertical_circulation"
    if x in (13, 14) and z >= 13:
        return "circulation"
    if x >= 17 and z <= 9:
        return "service"
    if floor > 0 or z <= 10:
        return "private"
    return "public"


def _put_cell(
    cells: dict[tuple[int, int, int], dict[str, Any]],
    *,
    x: int,
    y: int,
    z: int,
    envelope: str = "none",
    space: str = "outside",
    site: str = "none",
    evidence_id: str,
) -> None:
    if envelope not in ENVELOPE_VALUES or space not in SPACE_VALUES or site not in SITE_VALUES:
        raise Stage7ContractError("fixture cell uses a value outside the Stage 7 vocabularies")
    key = (x, y, z)
    if key in cells:
        raise Stage7ContractError(f"duplicate fixture cell: {x},{y},{z}")
    cells[key] = {
        "x": x,
        "y": y,
        "z": z,
        "envelope": envelope,
        "space": space,
        "site": site,
        "confidence": 1,
        "evidence_ids": [evidence_id],
    }


def _encode_cells(cells: list[dict[str, Any]]) -> list[dict[str, Any]]:
    runs: list[dict[str, Any]] = []
    for cell in sorted(cells, key=lambda item: (item["z"], item["y"], item["x"])):
        previous = runs[-1] if runs else None
        if (
            previous
            and previous["z"] == cell["z"]
            and previous["y"] == cell["y"]
            and previous["x1"] + 1 == cell["x"]
            and all(previous[field] == cell[field] for field in ("envelope", "space", "site", "confidence", "evidence_ids"))
        ):
            previous["x1"] = cell["x"]
            continue
        runs.append(
            {
                "x0": cell["x"],
                "x1": cell["x"],
                "y": cell["y"],
                "z": cell["z"],
                "envelope": cell["envelope"],
                "space": cell["space"],
                "site": cell["site"],
                "confidence": cell["confidence"],
                "evidence_ids": list(cell["evidence_ids"]),
            }
        )
    return runs


def _output_path(root: Path, relative: Path) -> Path:
    resolved_root = root.resolve()
    resolved_path = (root / relative).resolve()
    if not resolved_path.is_relative_to(resolved_root):
        raise Stage7ContractError(f"fixture output escapes root: {relative}")
    return resolved_path


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(pretty_json_bytes(value))


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate committed Stage 7 M3 fixtures")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = build_fixture_root(args.output)
    print(f"fixture_cases: {len(manifest['cases'])}")


if __name__ == "__main__":
    main()
