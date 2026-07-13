# Stage 7 Dataset v3 and Fixture-Only M3 Foundation Design

Date: 2026-07-13

Status: Approved design, written specification pending final user review

## Purpose

This design defines the next technical-first Stage 7 slice after the six-case P1 pilot. It fixes the coarse semantic extraction defect in a new immutable Dataset v3 line, proves the new extractor with controlled fixtures and v2/v3 diagnostics, and then establishes a fixture-only Python/PyTorch M3 training and inference path. It is preparation for later prototype and P5-scale training, not authorization to train on the reviewed real cases.

## Current State

- Dataset v1 and Dataset v2 are committed, independently reproducible, and treated as immutable historical versions.
- All six frozen pilot cases have explicit human outcomes from `stage7-curator-01`.
- The pilot readiness report is 6/6 explicit outcomes, 0 semantic-accepted, and 0 training-eligible.
- All six outcomes are `research-only`, permit `local-analysis` only, and block `envelope`, `site`, and `space` learning.
- The strict P1 command exits non-zero because no case satisfies the semantic and license gates.
- The current sparse rasterizer maps small source schematics into isolated cells in the `64^3` target. It consequently misclassifies many roof stair blocks as disconnected vertical circulation and leaves core topology absent.
- The complete Node.js suite contains 388 passing tests at the start of this design.
- Real-data training remains prohibited until the readiness gate reports at least three cases that are both semantic-accepted and training-eligible.

## Chosen Approach

Create Dataset v3 beside the frozen v1 and v2 trees. Dataset v3 uses a new interval-partition transform, geometry-first semantic evidence, and topology-derived circulation. It first proves correctness on synthetic positive and negative fixtures, then generates local v2/v3 diagnostics for the six pilot sources. Only after the v3 contract is stable does the project create the fixture-only M3 environment.

The alternatives were rejected:

1. Editing v2 in place would invalidate its committed hashes and audit history.
2. Correcting the sparse v2 plans manually would require broad labels rather than sparse, reviewable corrections and would not scale to 20 or 2000 cases.

## Scope Decomposition

The technical-first slice has two sequential subprojects with separate implementation plans and commits.

### Subproject A: Dataset v3 Extraction Foundation

- Implement the new deterministic grid transform.
- Produce dense `envelope`, `site`, and `space` evidence.
- Derive entrance and circulation semantics from topology rather than block names alone.
- Add bounded repair, hard validation, diagnostics, fixtures, and Dataset v3 artifacts.
- Compare the six pilot sources under v2 and v3 without changing their training eligibility.

### Subproject B: Fixture-Only M3 Foundation

- Create the independent Python/PyTorch environment under `training/stage7/`.
- Load only explicitly eligible real Dataset v3 cases in normal mode.
- Provide an explicit, separately rooted fixture mode for smoke testing.
- Implement condition encoding, three target decoders, a tiny conditional 3D VAE smoke path, reproducible checkpoint metadata, Python inference JSON, and a Node.js shadow adapter.
- Ensure fixture checkpoints can never enter Apply Mode.

Subproject A is implemented and reviewed before Subproject B begins. The shared design records their interface now so the extractor does not accidentally optimize for a private Python representation.

## Immutable Version Boundary

- No implementation step may edit any file under `mc_templates/datasets/coarse_semantic_voxels/v1/` or `v2/`.
- Dataset v3 is written under `mc_templates/datasets/coarse_semantic_voxels/v3/`.
- v1 and v2 manifest hashes are checked before and after every v3 canonical build.
- Local dense artifacts remain outside the committed versioned tree unless repository and license policy explicitly permits them.
- Dataset v3 reuses stable case IDs and fixed case-disjoint split assignments. It does not silently move a source between train, validation, and test.

## Dataset v3 Extraction Architecture

The extraction data flow is:

```text
immutable schematic
  -> decoded block volume
  -> interval-partition grid transform
  -> per-cell geometric evidence
  -> three raw semantic layers
  -> topology derivation
  -> bounded repair and validation
  -> canonical Dataset v3 case and diagnostics
```

### `GridTransformV3`

`GridTransformV3` owns only coordinate mapping. It does not assign building semantics.

For a source axis of length `N <= 64`, source cell `i` maps to the inclusive target interval:

```text
start = floor(i * 64 / N)
end   = floor((i + 1) * 64 / N) - 1
```

These intervals partition the full target axis without gaps or overlap and give every source cell at least one target cell.

For `N > 64`, target cell `j` aggregates the inclusive source interval:

```text
start = floor(j * N / 64)
end   = floor((j + 1) * N / 64) - 1
```

This also partitions the source axis without omission. Three-dimensional mappings are Cartesian products of the axis intervals. Mapping is integer-only, stable across platforms, and records source size, occupied size, ground alignment, vertical axis, reviewed canonical front, and transform version.

### `SemanticEvidenceV3`

Every decoded source block first contributes geometry evidence rather than a final space label. Evidence includes:

- solid occupancy and material category;
- opening candidates such as doors and gates;
- transparent opening candidates such as windows;
- stair, slab, ladder, fence, vegetation, water, earth, and light candidates;
- exterior exposure and height relative to reviewed ground.

For downsampling, a target cell counts all contributing source evidence. Each semantic layer chooses the label with greatest contributing volume. Ties use a documented, layer-specific canonical label order. Opening and vertical-circulation labels are not selected by this vote alone; they require topology confirmation.

### `SemanticClassifierV3`

The classifier emits independent raw layers:

- `envelope`: `none`, `wall`, `opening`, `support`, `floor`, or `roof`;
- `site`: `none`, `ground`, `path`, `water`, or `vegetation`;
- `space`: `outside`, `public`, `private`, `service`, `circulation`, `vertical_circulation`, or `entrance`.

Roof classification uses exterior exposure, height, support below, and massing coverage. A stair-shaped roof block remains roof evidence. A stair or ladder becomes vertical circulation only when it participates in a connected traversable sequence between accepted floor regions.

### `TopologyBuilderV3`

Topology is derived after dense layer construction.

- The primary envelope is selected with deterministic six-neighbour connected components.
- Interior free space is flood-filled separately from outside space.
- Floor regions require support and bounded continuity inside the primary envelope.
- An entrance requires an exterior opening candidate adjacent to both outside approach space and traversable interior space.
- Horizontal circulation is the connected traversable space that links an accepted entrance to usable space regions.
- Vertical circulation requires a physically supported stair or ladder sequence that connects accepted floor regions on different levels.
- Detached decoration, roof stairs, tree canopies, and auxiliary structures cannot donate entrance or circulation semantics to the primary envelope.

### `SemanticValidatorV3`

The validator reports schema validity and hard semantic blockers. It checks:

- canonical coordinates, vocabulary, ordering, and non-overlap;
- a bounded number of massing components and a valid primary envelope;
- roof coverage above occupied massing;
- floor continuity for every occupied level;
- usable interior space;
- an exterior-connected entrance;
- horizontal circulation from entrance to usable space;
- vertical circulation between occupied levels when more than one floor exists;
- site cells inside the normalized lot;
- conflicting or impossible combinations across the three layers.

Validation reports component counts, largest component sizes, overlap errors, source evidence coverage, repair burden, and every unresolved blocker.

## Repair and Failure Policy

Repairs are deterministic, bounded, and recorded with reason, before value, after value, affected coordinates, and evidence.

Allowed repairs are limited to canonical run merging, removal of documented tiny noise components, one-cell geometric closure where no opening or circulation is blocked, and clearing impossible cross-layer collisions. Each repair class has an explicit cell budget in configuration and tests.

Repair may not invent:

- a primary massing component;
- an entrance;
- a room or usable-space region;
- horizontal circulation;
- a vertical circulation core;
- permission to learn from a layer.

Exceeding any repair budget or retaining a hard blocker results in `semantic_status: rejected`. A semantically rejected case remains a valid, traceable Dataset v3 record but cannot enter training. Semantic rejection does not fail the dataset build. The writer stages output in a temporary directory and replaces the canonical tree only after schema, source binding, artifact hashes, manifest, split, and readiness-report consistency validate for every case, so an infrastructure or integrity failure cannot leave a partially updated dataset.

## Review and Governance Boundary

Source-bound governance evidence remains reusable across dataset versions:

- source author and uploader;
- source hash and URL;
- license status and allowed uses;
- canonical front side.

Semantic approval is extraction-specific. Dataset v3 therefore treats every real case as not semantically approved until an append-only v3 review record binds the human conclusion to both the source SHA-256 and the v3 plan SHA-256. A v1/v2 semantic conclusion does not automatically transfer to v3.

The review schema will support a versioned review scope containing `dataset_version`, `extractor_version`, and `plan_sha256`. Existing review records remain valid historical governance evidence. Until a v3-specific record exists, the case stays training-ineligible even if its source license would otherwise permit training.

The six pilot cases retain `research-only`, `local-analysis`-only governance in v3. Improved diagnostic metrics cannot grant `local-training`, approve a learning area, or change semantic status without a new human decision.

## Fixture Suite

The committed fixture suite contains small, source-independent constructions with explicit expected semantics.

### Positive Fixtures

- A one-floor house with continuous walls, roof, floor, exterior door, interior usable space, and approach path.
- A two-floor house with two accepted floor regions and one continuous supported stair core.
- A site fixture with ground, path, water, and vegetation regions inside the lot.
- A source larger than 64 cells on one axis that preserves the expected coarse massing after deterministic aggregation.

### Negative Fixtures

- Roofs built from stair blocks that must not create vertical circulation.
- Disconnected stair blocks that do not link two floor regions.
- A sealed house with no exterior-connected entrance.
- An upper occupied level with a discontinuous floor.
- A detached pavilion or tree that cannot become the primary entrance or vertical core.
- A case whose required repair exceeds the configured budget and remains rejected.

Fixture source sizes cover axes of length 1, 17, 23, 64, 66, and 128. Golden artifacts record canonical layer counts, blocker sets, transform metadata, and output hashes.

## Dataset v3 Acceptance Criteria

- The interval transform partitions every tested source and target axis exactly once, stays inside `0..63`, and produces no scaling-induced singleton gaps for `N <= 64`.
- Positive fixtures pass the intended entrance, roof, floor, usable-space, horizontal-circulation, and vertical-circulation checks.
- Each negative fixture fails with its exact expected blocker and is not converted into a false positive by repair.
- Repeated builds with the same source hashes, configuration, review overlay, and fixed epoch produce byte-identical `manifest.json`, `cases.jsonl`, `splits.json`, and reports.
- v1 and v2 versioned files remain byte-identical to their pre-v3 hashes.
- Existing fixed split assignments remain unchanged and case-disjoint.
- All existing Node.js tests and the new v3 unit, golden, integration, CLI, and failure-atomicity tests pass.
- Six-pilot v2/v3 comparison reports component fragmentation, roof/vertical overlap, entrance and circulation counts, repair burden, blocker changes, and plan hashes without making a positive review claim.
- The readiness gate remains non-zero until at least three v3 plan-bound cases are both semantic-accepted and training-eligible.

## Six-Pilot v2/v3 Comparison

After fixture acceptance, the six reviewed sources are rebuilt locally through v3. The comparison report includes:

- isolated and total connected-component counts per semantic class;
- largest component size;
- roof cells mislabeled or overlapping vertical-circulation cells;
- entrance, circulation, and vertical-core counts;
- floor and roof continuity measures;
- repair count and repair classes;
- remaining blockers;
- v2 and v3 plan SHA-256 values.

This comparison is diagnostic. It may demonstrate that the technical defect is fixed, but it cannot override McBuild restrictions or the six human `research-only` conclusions.

## Fixture-Only M3 Architecture

Subproject B begins only after Dataset v3 fixture acceptance and review of the six-pilot comparison.

### Python Environment

`training/stage7/` owns an independent pinned Python environment and never becomes an import dependency of normal Node.js generation. It contains a `pyproject.toml`, a deterministic lock or fully pinned requirements artifact, environment setup instructions, and CPU-compatible test commands. CUDA is optional and is not required for smoke verification.

### Dataset Loader

Normal loader mode reads Dataset v3 metadata and admits a real case only when all of the following are true:

- `training.eligible` is true;
- semantic status is accepted;
- the permitted learning areas cover every requested target layer;
- the review is bound to the exact v3 plan hash;
- the local target artifact hash matches the committed case record.

Fixture mode is enabled only by an explicit flag and reads a separate committed tiny fixture root. Fixture records use `origin: synthetic-fixture`, cannot share paths with real data, and never count toward readiness or evaluation metrics.

### Model Inputs and Targets

The condition encoder produces deterministic tokens for normalized dimensions, style, typology, abstract site tags, selected concept, approved reference summaries, and seed/noise. Unknown or omitted categories use explicit stable tokens.

Targets are three independent categorical tensors for `envelope`, `space`, and `site` on the canonical `64^3` grid. Decoding produces the existing canonical Stage 7 plan schema; Python does not emit Minecraft block IDs or commands.

### Tiny Conditional 3D VAE Smoke Path

The first model is deliberately small. The smoke test proves only that:

- one fixture batch loads on CPU;
- forward loss is finite;
- backward propagation updates parameters;
- fixed-seed loss and artifact metadata are reproducible within documented deterministic settings;
- a checkpoint saves and reloads;
- inference emits valid canonical JSON.

Fixture smoke results are not reported as model quality or generalization evidence.

### Reproducibility Artifacts

Every run records:

- fixture or dataset version and manifest hash;
- code revision;
- Python and PyTorch versions;
- seed and deterministic settings;
- normalized configuration;
- metrics JSONL;
- checkpoint SHA-256;
- checkpoint manifest;
- inference input and output hashes.

Large checkpoints remain ignored. Small fixture checkpoints may be committed only when repository policy permits and the manifest marks them `fixture-only`.

### Python Inference and Node.js Shadow Adapter

Python inference accepts a Stage 7 condition JSON document and returns an untrusted canonical Stage 7 plan JSON document. Node.js applies the existing schema validation, repair, conversion, and reporting path.

The learned provider remains `shadow-only`. It cannot change primary geometry. Fixture checkpoints carry `training_scope: fixture-only`; provider selection and any future Apply Mode reject that scope before inference. Provider failure records a Stage 7 rejection and normal rule-only generation continues.

## M3 Fixture Acceptance Criteria

- A clean documented CPU environment can run the tiny fixture test without a GPU.
- The loader rejects pending, research-only, rejected, wrong-layer, stale-plan, and hash-mismatched real cases.
- Fixture mode cannot read the real case root or affect readiness counts.
- Fixed seed and configuration reproduce the checkpoint manifest and canonical inference artifact under the documented deterministic environment.
- Python output passes Node.js schema validation or produces an explicit rejection; it never bypasses repair or conversion.
- Shadow mode leaves the ordered primary blueprint operations unchanged.
- Fixture checkpoints are rejected by Apply Mode and cannot be presented as prototype real-data training.

## Testing Strategy

### Node.js

- Interval-partition unit tests for all boundary axis lengths.
- Evidence reduction and canonical tie-order tests.
- Roof-stair, entrance, circulation, vertical-core, detached-component, and repair-budget tests.
- Dataset v3 writer, review-binding, fixed-split, readiness, deterministic build, and atomic-failure tests.
- v1/v2 immutable-hash regression tests.
- Shadow adapter and fixture-checkpoint rejection tests.
- The complete existing Node.js suite remains green.

### Python

- Condition vocabulary and encoding tests.
- Dataset eligibility, plan binding, artifact hash, and layer-scope tests.
- Three-layer target decode and round-trip tests.
- CPU forward, backward, checkpoint reload, and inference smoke tests.
- Fixed-seed manifest and inference artifact reproducibility tests.

### Cross-Runtime

- Python inference output validates under the Node.js canonical schema.
- Condition and plan hashes agree across the JSON boundary.
- Invalid, oversized, stale, or fixture-scoped output fails closed and preserves rule-only generation.

## Schedule for One Developer

- Dataset v3 transform, evidence, topology, fixtures, and tests: 2 to 3 working days.
- Six-pilot v2/v3 comparison and review report: approximately 1 working day.
- Fixture-only M3 environment, loader, model smoke path, inference, and shadow adapter: 2 to 3 working days.
- Total expected technical slice: 5 to 7 working days, excluding dependency download problems or new semantic defects discovered by the fixture suite.

The work is sequential for one developer. License candidate collection may continue as a low-intensity separate queue, but it does not interrupt the Dataset v3 critical path.

## Exit Criteria

### Subproject A Complete

- Dataset v1 and v2 remain byte-identical.
- Dataset v3 builds deterministically and atomically.
- Positive and negative fixtures satisfy all expected semantic outcomes.
- The six-pilot comparison demonstrates whether the sparse-scaling defect and roof-stair misclassification are resolved without making a training claim.
- The complete Node.js suite passes.
- No real case becomes eligible without a v3 plan-bound human review.

### Subproject B Complete

- The independent CPU fixture environment is reproducible.
- The Dataset v3 loader fails closed for every ineligible or stale real case.
- The tiny conditional 3D VAE completes the fixture smoke path and emits a reproducible manifest and canonical inference JSON.
- Node.js consumes the JSON through the existing shadow-only safety boundary.
- Fixture checkpoints cannot enter Apply Mode.

## Non-Goals

This design does not:

- obtain new source permissions or approve new real cases;
- train on any of the six McBuild pilot cases;
- claim held-out performance or generalization;
- create Dataset v3 semantic approvals automatically;
- implement real-data prototype training;
- change deterministic baseline geometry;
- enable learned Apply Mode;
- modify Minecraft worlds, datapacks, or Stage 8 terrain behavior;
- lower any readiness, semantic, QA, connectivity, or licensing threshold.

## Implementation Transition

After final user review of this written specification:

1. Write a detailed TDD implementation plan for Subproject A only.
2. Implement and review Dataset v3 extraction and the six-pilot comparison.
3. Write a separate TDD implementation plan for Subproject B against the accepted Dataset v3 interface.
4. Implement fixture-only M3 and review its reproducibility and shadow evidence.
5. Resume permission-first candidate expansion without permitting real-data training until the unchanged readiness gate exits zero.
