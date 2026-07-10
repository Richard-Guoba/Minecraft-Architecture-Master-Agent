# Stage 7 Coarse Semantic Voxel Generation Design

Date: 2026-07-10

Status: Approved direction, written specification pending final user review

## Summary

Architecture Master Roadmap Stage 7 adds a coarse whole-building semantic voxel layer between concept design and procedural geometry. Its purpose is to let a learned model contribute compositions that are difficult to express with handwritten rules while preserving the existing deterministic CSG, BSP, A*, repair, QA, and datapack pipeline as the buildability authority.

The work will follow a progressive hybrid route:

1. Define a stable `64 x 64 x 64` semantic voxel contract.
2. Prove the contract with a deterministic baseline, converter, repair boundary, and shadow-mode artifacts.
3. Build a reviewed whole-building dataset from raw schematics and generated builds.
4. Train a small conditional 3D model behind the same provider interface.
5. Enable explicit apply mode only after same-seed A/B evaluation demonstrates that accepted learned plans remain buildable, traversable, explainable, and compositionally useful.

Stage 7 never asks a language model or neural model to emit Minecraft block IDs or commands. A generator proposes an untrusted coarse semantic plan. Node.js validation, repair, conversion, procedural synthesis, QA, and fallback determine whether that plan may influence the build.

## Roadmap Alignment

The authoritative requirements are in `docs/roadmap.md`:

- Stage 7 requires a `64^3` semantic voxel generator conditioned on a design brief, dimensions, style, and reference cases.
- NN5 additionally conditions on abstract site tags and reference-case embeddings.
- Output must include low-resolution semantic voxels, massing/room/site sketches, and constraint conflicts.
- A semantic-voxel-to-procedural-plan converter and an automatically collected failure-case set are required.
- Accepted output must remain installable, traversable, and explainable after rule repair.
- Normal generation must remain runnable in Node.js without Python. Python is allowed only for explicitly enabled learning or training workflows.
- Real Minecraft terrain reading, site selection, roads, slopes, and settlement generation remain Stage 8.

## Current Context

The repository has the main prerequisites but not a trainable Stage 7 system:

- Stage 1 provides fixed prompts, scorecards, benchmark reports, a gallery, and feedback artifacts.
- Stage 2 provides Template Knowledge Base v2, case cards, design laws, review controls, and explainable retrieval.
- Stage 3 provides selected or fused concept intent, massing strategy, space-graph strategy, site strategy, and design risks.
- Stage 4 provides six critic tracks and repair directives, but Critic Council currently reports after synthesis rather than rebuilding a failed candidate.
- Stage 5 provides deterministic token-hash embeddings and optional fusion retrieval, not a trained embedding model.
- Stage 6 provides deterministic local semantic patches and local conflict repair, but does not extract raw voxel patches, train a model, or mutate runtime geometry.
- The current corpus has 64 cases. All Template Knowledge Base v2 cases are still pending human review. The roadmap explicitly treats 64 cases as prototype-scale and reserves strong conditional generation claims for a substantially larger corpus.
- The committed homepage records a 10/10, 100/100 mock baseline. That automatic score is saturated and cannot by itself demonstrate that Stage 7 improves composition.
- Stage 5 and Stage 6 commits are on `codex/stage-5-neural-retrieval`, not `origin/main`. Stage 7 implementation must begin from the current Stage 6 HEAD or a branch that contains those commits.

Existing source identifiers such as `stage7-template-case-library-v1` belong to an older template-assimilation numbering scheme. They do not refer to Architecture Master Roadmap Stage 7.

## Chosen Approach

Three approaches were considered:

1. **Progressive hybrid, chosen.** Establish the safe contract and deterministic baseline before dataset construction, training, and explicit runtime application. This produces reviewable value at every milestone and preserves fallback.
2. **Direct `64^3` learned generation, rejected.** It could produce a quick training demo, but the current unreviewed 64-case corpus makes memorization likely and leaves no trusted converter or fallback boundary.
3. **Deterministic-only coarse generation, rejected as the final state.** It is useful as a baseline and adapter test, but it does not satisfy the roadmap requirement that a model participate in composition.

## Scope Decomposition

Stage 7 spans four independently reviewable subprojects. Each subproject receives its own implementation plan and must leave working, testable software.

### Milestone 1: Contract, Baseline, Converter, and Shadow Mode

- Define and validate the canonical whole-building semantic voxel plan.
- Derive a Stage 7 condition record from the selected concept and existing semantic inputs.
- Generate deterministic coarse plans behind the provider interface.
- Read externally generated plan artifacts behind the same interface.
- Repair safe structural defects and report unresolved blockers.
- Convert accepted semantic plans into candidate `architecture`, `buildSpec`, and `topology` inputs.
- Run in shadow mode only: export and evaluate the candidate without changing the primary build.
- Preserve the exact ordered `blueprint.operations` array for a fixed prompt and seed when Stage 7 is disabled.

Milestone 1 is the immediate implementation cycle after this design is approved.

### Milestone 2: Whole-Building Dataset and Review Governance

- Extract real block arrays from raw schematics and map them to the canonical Stage 7 layers.
- Resample each case into the normalized `64^3` representation.
- Store versioned manifests, JSONL metadata, license and source restrictions, and deterministic case-level splits.
- Keep real, synthetic, and augmented examples explicitly separated.
- Permit a case to enter model training only when review state and approved learning areas allow it.

### Milestone 3: Learned Provider

- Add an optional Python/PyTorch training subsystem that is never imported by normal Node.js generation.
- Train a small conditional 3D variational autoencoder as the first learned baseline.
- Produce the same canonical plan artifact as the deterministic and artifact providers.
- Record dataset version, code version, seed, hyperparameters, checkpoint metadata, metrics, and generated failure samples.
- Keep learned results labelled `prototype` while the corpus remains below the roadmap's strong-generation data threshold.

### Milestone 4: Apply Mode and Release Evaluation

- Add explicit apply mode with candidate synthesis and automatic baseline fallback.
- Compare rule-only and Stage 7 results using the same prompt, seed, dimensions, and evaluation scripts.
- Require automated buildability/connectivity checks plus recorded human side-by-side composition review.
- Update user-facing status only after the release gates in this document pass.

## Goals

1. Create one versioned, provider-neutral representation of a coarse whole-building semantic plan.
2. Preserve Concept Studio as the concept-first design layer and procedural JavaScript as the construction authority.
3. Make every generated plan inspectable through conditions, references, evidence, conflicts, repairs, and conversion output.
4. Make invalid, stale, incompatible, or low-confidence learned output safe through deterministic repair and fallback.
5. Establish a real whole-building dataset path without treating hand-authored semantic templates as raw training truth.
6. Support a small local model on RTX 4060-class hardware without making Python or a checkpoint mandatory for normal generation.
7. Measure composition improvement separately from the saturated current buildability scorecard.

## Non-Goals

- Do not generate final Minecraft block IDs, block states, commands, or datapacks directly from the model.
- Do not replace ArchitectAgent, PlannerAgent, Concept Studio, CSG, BSP, A*, repair agents, QA, or Critic Council.
- Do not enable learned generation by default.
- Do not add real-world terrain reading or terrain-conditioned placement; those are Stage 8.
- Do not train a large 3D diffusion model or a high-resolution end-to-end block generator.
- Do not claim generalization from the current 64-case corpus.
- Do not publish raw templates, datasets, or checkpoints whose source license does not allow publication.
- Do not rename the legacy `stage7-template-*` artifacts during Milestone 1; document the distinction and use collision-free names for new work.

## Global Constraints

- The active pipeline remains `construction_method_v1`.
- Minecraft targets remain Java 1.21 and 1.21.1 with datapack `pack_format: 48`.
- Default mock generation remains deterministic and runnable without API keys, Python, model files, or network access.
- Stage 7 mode defaults to `off`.
- All Stage 7 model output is untrusted until schema validation, semantic validation, repair, and procedural conversion succeed.
- No Stage 7 component writes directly into the block grid.
- Human review controls remain authoritative for whether a template may enter training and which learning areas are allowed.
- Stage 7 outputs must record schema, provider, model or baseline, dataset, condition, and seed provenance.
- New source IDs use the `stage7-coarse-semantic-voxel-*` prefix and never reuse `stage7-template-*`.
- New datasets and generated artifacts are reproducible from versioned inputs; raw templates are never modified.

## Architecture

```text
Prompt
  -> ArchitectAgent
  -> buildSpec
  -> Template Knowledge / references
  -> PlannerAgent
  -> Concept Studio selection or fusion
  -> CreativeDesignAgent
  -> Stage7Condition
       -> CoarseVoxelProvider
            -> deterministic baseline       (Milestone 1)
            -> external artifact            (Milestone 1)
            -> learned Python provider       (Milestone 3)
       -> schema validation
       -> semantic validation and repair
       -> derived massing/space/site sketches
       -> semantic voxel -> procedural plan converter
       -> candidate architecture/buildSpec/topology
       -> shadow evaluation                  (Milestone 1)
       -> candidate procedural synthesis     (Milestone 4 apply mode)
            -> Structure / Facade / Roof / Site
            -> CSG / BSP / A*
            -> repair / QA / score / critics
            -> accept candidate or rerun baseline
  -> datapack and review artifacts
```

The Stage 7 boundary is downstream of selected concept and creative design because those stages own design intent. It is upstream of specialist semantic agents and geometry because the Stage 7 converter proposes procedural inputs rather than blocks.

## Canonical Condition Contract

`buildStage7Condition(...)` produces a stable condition record from existing pipeline data:

```json
{
  "source": "stage7-coarse-semantic-voxel-condition-v1",
  "schema_version": 1,
  "prompt": "build a courtyard house",
  "seed": 7101,
  "dimensions": {
    "width": 31,
    "depth": 27,
    "floors": 2,
    "floor_height": 5,
    "total_height": 14,
    "lot_width": 37,
    "lot_depth": 40
  },
  "design": {
    "style_family": "japanese",
    "typology": "residence",
    "footprint": "courtyard",
    "front_side": "south",
    "abstract_site_tags": ["courtyard", "water-edge"],
    "selected_concept_id": "concept-2",
    "massing_strategy": ["courtyard", "stepped-terrace"],
    "space_strategy": ["public-to-private-gradient"],
    "quality_targets": ["clear-entry", "view-axis"]
  },
  "references": [
    {
      "case_id": "house-example",
      "used_for": ["massing", "courtyard"],
      "review_state": "approved",
      "embedding_index_source": "stage5-template-embedding-index-v1",
      "embedding_record_id": "house-example"
    }
  ],
  "constraints": {
    "resolution": [64, 64, 64],
    "max_total_height": 40,
    "minecraft_fill_limit": 32768
  },
  "condition_hash": "sha256-of-canonical-condition"
}
```

The artifact records embedding identifiers and hashes, not full embedding vectors. The provider may load vectors from the referenced index. Reference cases whose review state or approved learning areas disallow the requested use are excluded before the condition is finalized.

Stage 7 abstract site tags describe design intent within a normalized lot. They do not contain sampled Minecraft terrain heights, world coordinates, biome reads, or settlement context.

## Canonical Semantic Voxel Plan

### Resolution and Transform

Every plan is logically a `64 x 64 x 64` grid. The grid is normalized rather than one voxel per Minecraft block.

- Grid X maps across `lot_width`.
- Grid Z maps across `lot_depth`.
- Grid Y maps from the conceptual ground plane through `max(total_height, 1)`.
- `front_side` fixes orientation before any augmentation.
- The converter resamples normalized regions into integer Minecraft block bounds and then applies existing build limits.

This preserves a fixed model shape while allowing builds with different Minecraft dimensions.

### Semantic Layers

One logical cell may carry values in three aligned layers. This prevents structural solids, room-space meaning, and site meaning from competing for one categorical label.

`envelope` values:

- `none`
- `wall`
- `floor`
- `roof`
- `opening`
- `support`

`space` values:

- `outside`
- `public`
- `private`
- `service`
- `circulation`
- `vertical_circulation`
- `void`

`site` values:

- `none`
- `ground`
- `path`
- `courtyard`
- `water`
- `vegetation`

Material selection, detailed roof profiles, facade rhythm, furniture, and local decorative patches remain procedural or Stage 6 responsibilities.

### Encoding

The canonical JSON artifact uses `rle-x-v1` encoding. Runs are sorted by `z`, then `y`, then `x0`. A run has inclusive X bounds and a combined layer tuple:

```json
{
  "x0": 10,
  "x1": 22,
  "y": 8,
  "z": 14,
  "envelope": "floor",
  "space": "public",
  "site": "none",
  "confidence": 0.91,
  "evidence_ids": ["reference:house-example", "condition:concept-2"]
}
```

Rules:

- Coordinates are integers in `[0, 63]`.
- `x0 <= x1`.
- Runs may not overlap in logical grid space.
- Cells whose tuple is `none/outside/none` may be omitted.
- Confidence is finite and clamped to `[0, 1]`.
- Every run has at least one evidence identifier.
- Every run evidence identifier resolves to a record in the top-level `evidence` registry.
- Decoding and re-encoding a canonical plan produces identical ordered runs.

Dense tensors used by Python are derived artifacts, not the canonical interchange format.

### Plan Envelope

```json
{
  "source": "stage7-coarse-semantic-voxel-plan-v1",
  "schema_version": 1,
  "provider": {
    "kind": "deterministic-baseline",
    "name": "stage7-coarse-semantic-voxel-baseline-v1",
    "model_version": null,
    "dataset_version": null
  },
  "condition_hash": "sha256-of-canonical-condition",
  "resolution": [64, 64, 64],
  "encoding": "rle-x-v1",
  "orientation": {
    "front_side": "south",
    "vertical_axis": "y-up"
  },
  "world_transform": {
    "lot_width": 37,
    "lot_depth": 40,
    "total_height": 14,
    "ground_y": 0
  },
  "runs": [],
  "evidence": [],
  "summary": {},
  "derived_sketches": {
    "massing": [],
    "spaces": [],
    "site": []
  },
  "conflicts": [],
  "repairs": [],
  "warnings": []
}
```

Providers emit the condition hash, grid runs, provider metadata, confidence, and evidence. Node.js derives `summary`, `derived_sketches`, and initial conflicts from the grid. Providers do not supply authoritative sketches separately, which avoids contradictions between the grid and sketch fields.

## Provider Boundary

All providers implement the same conceptual interface:

```text
generateCoarseSemanticVoxelPlan({ condition, seed, options }) -> untrusted plan
```

Providers are replaceable and have no access to the Minecraft block grid.

### Deterministic Baseline Provider

Milestone 1 uses existing architecture volumes, topology zones, selected concept directives, and reviewed reference hints to rasterize a reproducible coarse plan. It establishes:

- the minimum contract a learned model must satisfy;
- expected condition adherence;
- converter and repair fixtures;
- fallback behavior;
- a same-seed baseline for later learned-provider evaluation.

The deterministic baseline is not reported as a neural result.

### Artifact Provider

Milestone 1 may read a plan from an explicit path. It validates:

- supported schema and source;
- exact `condition_hash` match;
- provider and dataset provenance;
- canonical run ordering and grid invariants;
- a maximum JSON file size of 32 MiB and at most 262,144 runs, the number of logical cells in a `64^3` grid.

A mismatched artifact is never silently adapted to a different prompt, seed, concept, or dimension set.

### Learned Provider

Milestone 3 adds Python inference behind JSON input/output. The Python subsystem reads a Stage 7 condition and emits an untrusted canonical plan. Node.js applies exactly the same validation, repair, and conversion path used for other providers.

Normal `npm start` never imports PyTorch. Python inference is used only through an explicit Stage 7 provider selection or an offline generation/evaluation command.

## Milestone 1 Components

The first implementation cycle introduces focused Node.js modules under `src/construction/learning/`:

- `coarseSemanticVoxelSchema.js`
  - Owns constants, canonicalization, RLE encode/decode, hashing, and schema validation.
- `coarseSemanticVoxelCondition.js`
  - Builds the condition from prompt, final creative design, buildSpec, topology, selected concept, and reviewed references.
- `coarseSemanticVoxelBaseline.js`
  - Implements the deterministic provider.
- `coarseSemanticVoxelRepair.js`
  - Detects conflicts, applies bounded safe repairs, and classifies unresolved blockers.
- `semanticVoxelProceduralPlan.js`
  - Derives sketches and converts a repaired plan into candidate architecture/buildSpec/topology patches.
- `coarseSemanticVoxelShadow.js`
  - Orchestrates provider, validation, repair, conversion, diagnostics, and shadow artifacts without modifying the primary build.

These modules remain independent of `workflow.js` artifact writing and independent of Python.

## Procedural Plan Conversion

The converter never writes blocks. It returns normalized candidate inputs for existing procedural components.

### Massing Conversion

1. Decode occupied envelope cells.
2. Find connected components with deterministic 6-neighbour connectivity.
3. Remove components already classified as repairable noise.
4. Approximate each accepted component with bounded boxes.
5. Map boxes into normalized `architecture.volumes` using existing `union` and `subtract` semantics.
6. Preserve selected concept and reference provenance on every derived volume.

The first converter uses boxes only. Cylinder fitting, arbitrary meshes, and learned surface details are deferred.

### Space Conversion

1. Group public, private, service, circulation, and vertical-circulation cells by floor.
2. Produce room-zone hints and adjacency edges from shared boundaries.
3. Require at least one public or circulation zone adjacent to a valid exterior opening candidate.
4. Map vertical-circulation regions into stair hints when `floors > 1`.
5. Merge these hints through existing topology normalization rather than bypassing Planner/BSP invariants.

### Site Conversion

The converter derives conceptual courtyard, path, water, and vegetation zones inside the normalized lot. Existing SiteLandscapeAgent decides the detailed procedural implementation. No real terrain height is introduced.

### BuildSpec Conversion

Derived width, depth, floor count, floor height, roof height, lot size, and door side are clamped through the existing build constraints. A candidate may narrow its massing within those limits but may not expand beyond prompt or buildSpec hard constraints.

## Semantic Validation and Repair

Validation occurs before conversion. It checks:

- schema and condition compatibility;
- coordinate bounds, ordering, overlap, and vocabulary;
- at least one connected envelope component;
- non-empty usable space inside the primary envelope;
- floor continuity for occupied upper levels;
- roof coverage above occupied massing;
- at least one entrance candidate;
- circulation presence and vertical circulation for multi-floor designs;
- all conceptual site cells inside the lot;
- confidence and evidence coverage.

Safe repairs are deterministic and bounded:

- merge adjacent identical runs;
- remove isolated components containing eight logical cells or fewer;
- close one-cell envelope gaps that do not block a planned opening;
- add a minimal roof cap above an otherwise valid occupied component;
- clear envelope cells from marked circulation and opening regions;
- clamp conceptual site regions to the lot.

Malformed JSON, unsupported schema, condition mismatch, out-of-bounds coordinates, overlapping runs, invalid vocabulary, and unresolved evidence identifiers are hard schema blockers. They are rejected rather than repaired.

Repair may not invent an entire entrance, room graph, vertical circulation system, or primary massing component. Missing core semantics are blockers and cause shadow rejection or apply-mode fallback.

Every repair records reason, affected cells or runs, evidence, and before/after counts. The original provider output is retained for diagnosis.

Milestone 1 treats confidence as validated diagnostic data because shadow output cannot affect geometry. Milestone 4 learned-model manifests must contain a frozen `min_acceptance_confidence` derived from the validation split. Apply mode rejects a candidate whose mean confidence over non-empty cells is below that manifest value.

## Runtime Modes

The eventual CLI contract has two independent options:

```text
--coarse-voxel-mode off|shadow|apply
--coarse-voxel-provider baseline|artifact|python
```

Additional provider parameters include the explicit artifact path or Python model manifest path.

- `off` is the default and preserves current behavior.
- `shadow` runs Stage 7 validation, repair, and conversion but does not change primary geometry.
- `apply` is introduced only in Milestone 4. It synthesizes a candidate build and accepts it only when all release gates pass; otherwise it reruns the preserved baseline inputs.

Milestone 1 implements `off` and `shadow` with `baseline` and `artifact`. Unsupported mode/provider combinations fail at CLI parsing with a clear message. Runtime provider failure after parsing becomes a recorded Stage 7 rejection and does not abort the normal build.

## Apply-Mode Fallback

Milestone 4 preserves copies of the post-CreativeDesign baseline `architecture`, `buildSpec`, and `topology` before applying a Stage 7 candidate.

Candidate procedural synthesis is isolated from artifact export. It either returns a validated candidate blueprint or a structured failure. On exception, failed Blueprint QA, unresolved blocker, invalid datapack operation, or connectivity failure:

1. Record the candidate failure.
2. Discard candidate grid and procedural state.
3. Rerun synthesis from the preserved baseline semantic inputs.
4. Export the successful baseline build with Stage 7 fallback metadata.

This requires a focused extraction of the downstream synthesis path into a reusable candidate function. It must not introduce a second generation pipeline.

## Failure-Case Corpus

Every rejected shadow or apply candidate writes a local failure record containing:

- prompt, seed, condition hash, dimensions, concept ID, and reference IDs;
- provider, schema, model, dataset, and checkpoint identifiers;
- original canonical plan or a bounded diagnostic excerpt if the source is malformed;
- schema errors, semantic conflicts, repairs, conversion result, and unresolved blockers;
- downstream QA, connectivity, scorecard, critic, or export failure when available;
- fallback status and final baseline artifact paths.

Failure records are written under the run output directory. They are not automatically promoted into a training dataset. Promotion requires review, deduplication, source-license checks, and an explicit dataset-version update.

## Milestone 2 Dataset Design

The canonical dataset root is:

```text
mc_templates/datasets/coarse_semantic_voxels/v1/
  manifest.json
  cases.jsonl
  splits.json
  reports/
```

Large dense tensors and raw-source copies remain local artifacts and are not committed unless their license and repository-size policy allow it.

Each case record includes:

- stable case ID and source file hash;
- source URL, author, license state, and allowed use;
- review state and approved learning areas;
- original block bounds and normalized transform;
- canonical condition and plan artifact paths or hashes;
- real, synthetic, or augmented origin;
- quality, risk, and extraction warnings;
- deterministic split assignment.

Split assignment happens by original `case_id` before rotation, reflection, cropping, or other augmentation. All descendants of one source case remain in the same split. Synthetic procedural builds never enter the real held-out test set.

Training eligibility requires `approved` review state, or `limited` review state whose allowed learning areas explicitly cover each target layer. `pending`, `research-only` without local-training permission, and `rejected` cases are excluded.

## Milestone 3 Model Design

The first learned provider is a small conditional 3D variational autoencoder:

- Inputs: normalized dimensions, style/typology/site tokens, selected-concept tokens, reference embedding summary, and seed/noise.
- Outputs: logits for the envelope, space, and site layers on the `64^3` logical grid plus confidence.
- Internal representation: a lower-resolution latent grid decoded to `64^3` outputs.
- Training losses: class-weighted categorical loss per layer, occupancy Dice loss, and KL regularization.
- Runtime safety: deterministic Node.js validation and repair remain authoritative; differentiable constraints are not trusted as substitutes.
- Hardware strategy: mixed precision, small batches, and gradient accumulation suitable for RTX 4060-class hardware.

The Python subsystem lives under `training/stage7/`. Experiment metadata and small reports live under `models/experiments/stage7/`; large checkpoints are ignored by default.

A model trained on the current corpus is labelled `prototype` and may be used only for pipeline and overfitting diagnostics. Stage 7 is not labelled a completed learned generator until the corpus meets the roadmap's `2000+` strong-generation scale, uses case-disjoint held-out evaluation, and passes Milestone 4 release gates.

## Artifacts

Shadow or apply runs expose reviewable Stage 7 artifacts:

- `stage7_condition.json`
- `stage7_coarse_semantic_plan.raw.json`
- `stage7_coarse_semantic_plan.repaired.json`
- `stage7_coarse_semantic_report.md`
- `stage7_procedural_candidate.json`
- `stage7_failure_case.json` when rejected
- Stage 7 provenance and fallback summary inside `blueprint.json` and `run_report.md`

The report includes provider status, condition hash, semantic layer counts, massing and space summaries, reference evidence, conflicts, repairs, blockers, conversion decisions, and whether the candidate was shadowed, accepted, or rejected.

## Testing Strategy

### Unit Tests

- Canonical condition hashing is stable and changes when prompt, seed, dimensions, concept, or references change.
- RLE encode/decode round-trips and canonical ordering are stable.
- Schema validation rejects overlap, invalid vocabulary, out-of-range coordinates, invalid confidence, missing evidence, and version mismatch.
- The deterministic provider produces identical output for identical inputs.
- Repair performs only the documented bounded operations and records every mutation.
- Core-semantic blockers are not silently invented or discarded.
- Sketch derivation is deterministic and consistent with the repaired grid.
- Conversion produces bounded architecture volumes, room hints, site hints, and buildSpec patches.
- Artifact provider rejects condition mismatch and oversized or malformed artifacts.

### Integration Tests

- Stage 7 `off` preserves existing fixed-seed operations and artifacts except intentional documentation metadata.
- Shadow baseline writes all expected Stage 7 artifacts while primary operations remain unchanged.
- A valid external artifact reaches converted-candidate status in shadow mode.
- Missing or invalid external artifacts record rejection and allow the normal build to complete.
- Existing Architect, Planner, Concept Studio, CSG, BSP, A*, QA, critic, Stage 5, and Stage 6 tests remain green.

### Dataset and Model Tests

- Raw extraction is deterministic for a fixed schematic hash.
- Split assignment is stable and has zero source-case leakage.
- Review and license gates exclude ineligible cases.
- Python training and inference smoke tests operate on a tiny fixture without a GPU.
- A checkpoint manifest and canonical inference artifact are reproducible from a fixed seed.
- Node.js rejects model output that violates the canonical contract.

### Release Evaluation

- Run rule-only and Stage 7 with the same prompt, seed, dimensions, concept count, and evaluation commands.
- Include complex style, courtyard/stepped massing, mixed-height composition, abstract water-edge, and abstract slope-intent prompts.
- Track schema validity, repair burden, conversion success, QA pass, room connectivity, entrance connectivity, datapack export, condition adherence, reference diversity, composition novelty, and human preference.
- Use the existing scorecard as a buildability regression signal, not as the sole Stage 7 quality metric.

## Acceptance Criteria

### Milestone 1

- The canonical condition and plan schemas are versioned, deterministic, and fully validated.
- Deterministic and artifact providers use the same untrusted-plan boundary.
- Converter output is limited to existing semantic/procedural contracts and never writes blocks.
- Shadow mode cannot change primary build operations.
- Missing, stale, or invalid artifacts cannot crash normal generation.
- Every rejection includes a reason and sufficient provenance to reproduce it.
- Focused tests and the full Node.js suite pass.

### Milestone 2

- Every dataset case is traceable to a source hash, review state, allowed learning areas, and license status.
- Train, validation, and test splits are deterministic and case-disjoint before augmentation.
- Raw schematic extraction produces canonical `64^3` plans and review reports.
- Pending, rejected, or disallowed cases cannot enter training.
- Synthetic examples are separately identified and absent from the real held-out test set.

### Milestone 3

- Training and inference are optional, versioned, seed-controlled, and reproducible.
- The learned provider emits the same canonical plan schema as other providers.
- Held-out evaluation reports condition adherence, layer metrics, repair burden, and conversion success against the deterministic baseline.
- Prototype-scale results are clearly labelled and never presented as generalization evidence.

### Milestone 4 and Stage 7 Completion

- Every accepted Stage 7 candidate passes Blueprint QA, room and entrance connectivity, datapack validation, and all hard build constraints.
- Any rejected candidate automatically yields a successful baseline build or an explicit baseline failure unrelated to Stage 7.
- Accepted plans expose conditions, references, provider/model/dataset versions, conflicts, repairs, and conversion decisions.
- On the fixed Stage 7 A/B suite, accepted learned candidates do not reduce automated buildability or connectivity pass rate relative to rule-only.
- In blind paired human review, the learned candidate is preferred for overall composition in at least 60% of valid comparisons.
- A recorded in-world subset confirms datapack installation and traversability; automated graph checks alone are insufficient for the final completion claim.
- The learned corpus contains at least 2000 eligible, traceable source cases with case-disjoint evaluation.
- Stage 7 remains opt-in until all completion gates pass.

## Documentation and Status

Milestone 1 documentation must:

- update `README.md`, `docs/roadmap.md`, and `docs/index.html` to show Stage 7 as in progress, not complete;
- update `AGENT.md` where its next-stage note is stale;
- explain the old `Stage 7A-I` template-assimilation numbering collision;
- document shadow-mode commands and artifacts;
- avoid invented model names, performance, screenshots, or completion claims.

Milestone 4 may mark Stage 7 complete only with links to the versioned evaluation and recorded human/in-world evidence.

## Risks and Controls

### Data Memorization

Control: keep prototype status, enforce source-case splits, separate synthetic data, record nearest-reference similarity, and require the 2000-case completion gate.

### Semantic/Procedural Mismatch

Control: derive sketches from the grid, use one converter, normalize through existing contracts, and reject unresolved core-semantic blockers.

### Runtime Regression

Control: default off, shadow first, fixed-seed parity tests, isolated candidate synthesis, and automatic baseline rerun in apply mode.

### Hidden Loss of Explainability

Control: require condition, evidence, reference, provider, confidence, conflict, repair, and conversion provenance in every accepted artifact.

### Copyright and Redistribution

Control: training eligibility and publication eligibility are separate fields. Research-only local data, derived datasets, and checkpoints are not published without permission.

### Stage 8 Scope Leakage

Control: Stage 7 uses normalized lot and abstract site tags only. Reading real terrain, world coordinates, roads, biomes, slopes, and settlement context remains Stage 8.

## Implementation Sequence

After user review of this specification:

1. Write a detailed TDD implementation plan for Milestone 1 only.
2. Execute Milestone 1 and verify shadow-mode parity and artifacts.
3. Review Milestone 1 evidence before writing the Milestone 2 dataset specification and plan.
4. Review the dataset before writing the Milestone 3 model specification and plan.
5. Review learned-provider evaluation before writing the Milestone 4 apply-mode plan.

This sequence keeps each implementation plan focused, independently testable, and reversible.
