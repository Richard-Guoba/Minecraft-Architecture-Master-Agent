# Training-First Project Reset Design

Date: 2026-07-23

## Purpose

Reset the project around measurable model-training progress. The current repository mixes working generation code, reusable data tooling, experimental model code, several generations of Dataset governance, public-candidate approval workflows, and dozens of historical design and handoff documents. Those layers contradict each other and make completed optimizer work appear unusable.

The replacement policy is simple:

- Every existing local template may be used for local training without per-file approval.
- Local training does not depend on Dataset v1/v2/v3, R1/R2/R3, human review, or owner acknowledgement gates.
- Data, weights, and reconstructions remain local by default.
- License and distribution review occurs only before an artifact is published or shared externally.
- Progress means that a model learns non-air structure on held-out data, not that a governance workflow completed.

## Current Evidence

The repository already contains useful foundations:

- 64 local schematic templates;
- 22 prepared whole-building `64 x 64 x 64` volumes;
- 42 oversized templates that were deferred rather than trained;
- a deterministic 15/7 train/validation split;
- NBT and schematic parsing, categorical voxel conversion, checkpointing, evaluation, pause, and resume code; and
- three local training runs, including one that completed 185,946 optimizer steps.

The largest run did not learn useful structure. More than 96% of evaluated voxels were air, the trained model predicted air everywhere, and its supported non-air macro-F1 and macro-IoU were both zero. The reset must therefore remove governance overhead and fix the training objective, sampling, and evaluation loop.

## Scope

This reset has two sequential workstreams:

1. Retire obsolete governance and establish a small set of current documentation.
2. Replace the collapsed local-training loop with a training-first data and evaluation pipeline.

The normal Minecraft construction pipeline and its Stage 1-6 capabilities remain in scope for regression protection, not redesign. Reusable coarse semantic schemas, validation, repair, and conversion interfaces may remain where they provide a future model-integration boundary. The reset does not immediately inject a learned model into primary generation.

## Governance Retirement

### Remove from the current tree

Remove documentation, CLI entry points, implementation modules, and dedicated tests whose only purpose is one of the following:

- Dataset v1/v2/v3 eligibility and immutable-gate enforcement;
- `ready_for_m3_real_data` or `training_eligible_count` checks;
- M2/M2.5 human review packs;
- R1 conditional admission;
- R2 acquisition/parser readiness as a governed program;
- R3 named-batch, public-NBT pilot, stale-review recovery, and candidate approval;
- source-expansion metadata nomination and rights-ranking workflows;
- private-research acknowledgements and per-run owner/device/step authorization;
- hidden-metric or metadata-only output restrictions; or
- historical plans, specs, handoffs, and benchmarks that define those retired policies.

Remove package scripts and README, homepage, roadmap, project-map, and test references that advertise or require the retired programs.

### Preserve reusable mechanics

Retain or extract the implementation that directly supports local training:

- bounded NBT and schematic decoding;
- vanilla structure validation where it protects parser correctness;
- block-to-token mapping;
- deterministic voxel and patch preparation;
- structural fingerprinting and automatic duplicate detection;
- source-group-aware splitting;
- PyTorch datasets and models;
- checkpoint validation;
- pause and resume;
- metric calculation; and
- normal Node generation and its tests.

Reusable code must be renamed or moved when its public interface still expresses obsolete governance concepts. A retained parser must be callable as a parser, not through an admission or approval workflow.

### Preserve local artifacts

Do not delete, rewrite, publish, or move the existing ignored roots during cleanup. Existing sources, prepared volumes, checkpoints, evaluations, and public-pilot artifacts remain recoverable diagnostic evidence. The new system writes new artifacts below `.local/training/` and may import source material through an explicit read-only path.

### Final documentation structure

The final current tree has three project-level sources of truth:

- `README.md`: purpose, current status, quick start, and supported commands;
- `docs/architecture.md`: the active construction and training architecture; and
- `docs/training.md`: local-data policy, preparation, training, evaluation, and external-release boundary.

Component-local documentation may remain when it explains a live component, such as the parameter-tree viewer. It must not define project-level training policy.

Historical `docs/superpowers/specs`, `docs/superpowers/plans`, and `docs/superpowers/handoffs` are removed from the final working tree after this reset is implemented. Git history is the archive, including this design and its implementation plan.

## Training Data Pipeline

### Source policy

All 64 existing local templates are accepted as local experiment sources. Preparation performs automatic technical validation; it does not ask for legal, curator, or owner approval. Invalid or unreadable inputs are reported and skipped without blocking valid sources.

### Whole buildings and oversized buildings

- A building whose occupied bounds fit within `64 x 64 x 64` produces a centered whole-building sample.
- Every accepted building also produces occupied `32 x 32 x 32` training patches with a stride of 16 voxels.
- An oversized building produces those overlapping structural patches instead of being rescaled or discarded.
- Patch extraction prioritizes occupied regions and includes a bounded amount of surrounding air.
- Every sample records its source-building ID, transform, occupied bounds, token counts, and preparation version.
- Empty and near-empty patches are rejected automatically.

Whole-building samples preserve complete small-building evidence for inspection and future full-building work. The first replacement model trains on the uniform `32 x 32 x 32` patches. Deterministic yaw rotations may augment training patches only after the source-building split.

### Leakage prevention

Split source buildings before patch extraction or augmentation. All whole samples, patches, rotations, and other derivatives of one source building remain in exactly one of train, validation, or test.

Use a deterministic 70/15/15 source-building split with a recorded seed. If integer rounding would leave a partition empty, allocate at least one source to each partition before distributing the remainder. Duplicate groups are assigned as one unit.

### Artifact root

New preparation writes only below:

```text
.local/training/
  dataset/
  splits/
  runs/
  reports/
```

The root is ignored by Git. Preparation outputs a readable summary with source counts, accepted and rejected counts, whole-sample and patch counts, split counts, duplicate groups, token distribution, and rejection reasons.

## Model and Objective

The first replacement model remains intentionally small. Its purpose is to prove that the data and objective can learn structure before capacity or prompt conditioning is expanded.

Replace the single imbalanced nine-class reconstruction objective with two coupled predictions:

1. occupancy: air versus non-air;
2. semantics: the non-air token class, evaluated and optimized only at non-air target positions.

Training masks and mini-batches balance air, occupied surfaces, occupied interiors, and supported rare classes. The loss reports occupancy and semantic components separately. It must not obtain a low total loss solely by predicting air.

The first model is a local reconstruction or completion model. Prompt conditioning, full-building generation, and primary-pipeline integration are deferred until the validation gate succeeds.

## Commands

Expose only four supported training commands:

```text
npm run training:prepare
npm run training:train
npm run training:evaluate
npm run training:status
```

- `training:prepare` validates sources, splits buildings, extracts samples, and writes the dataset report.
- `training:train` starts or resumes a run from explicit normal training options without acknowledgement or approval flags.
- `training:evaluate` writes and prints complete metrics and representative local reconstruction locations.
- `training:status` reports dataset state, active or latest run state, completed steps, and the latest evaluation decision.

The commands may accept practical options such as source path, output root, seed, device, step count, batch size, and learning rate. No option may reintroduce Dataset eligibility, human review, owner acknowledgement, or per-run authorization.

## Visible Metrics and Progress Gates

All local metrics are visible to the operator. Evaluation reports at least:

- occupancy precision, recall, F1, and IoU;
- supported non-air macro-F1 and macro-IoU;
- per-class support, precision, recall, F1, and IoU;
- masked and unmasked confusion matrices;
- occupancy and semantic losses;
- predicted and target non-air fractions; and
- comparisons with an untrained model and a class-prior baseline.

Training proceeds through two gates.

### Gate 1: tiny overfit

Train on four deterministic `32 x 32 x 32` training patches and evaluate on those same four patches. Supported non-air macro-F1 must reach at least `0.90`. Failure blocks a larger run and is treated as an objective, model, or data-pipeline bug.

### Gate 2: held-out learning

On the deterministic validation split:

- supported non-air macro-F1 is at least `0.20`;
- supported non-air macro-IoU is at least `0.10`;
- both metrics strictly exceed the untrained model and class-prior baselines; and
- the predicted non-air fraction is between `0.5` and `2.0` times the validation target fraction.

Passing Gate 2 means only that the model has begun to learn held-out structure. It does not authorize automatic insertion into the Minecraft construction pipeline.

## Errors and Recovery

- A corrupt or unsupported source is isolated in the preparation report while other sources continue.
- A duplicate or leaked source group is a hard preparation error because it invalidates evaluation.
- Non-finite loss, empty semantic supervision, or all-air prediction is a hard training or evaluation failure with a direct diagnostic.
- Checkpoints remain atomic, resumable, and bound to a preparation version and split hash.
- Interrupted runs resume without repeating completed optimizer steps.
- Existing ignored artifacts are never overwritten by the new commands.

## Test Strategy

Retain regression coverage for the normal Minecraft generation path. Replace retired governance tests with tests that prove current behavior:

- bounded schematic/NBT parsing;
- deterministic whole-building and oversized-patch extraction;
- automatic rejection reporting;
- structural deduplication;
- source-building-level split isolation;
- balanced mask and batch sampling;
- finite occupancy and semantic losses;
- deterministic four-sample overfit behavior;
- complete metric and baseline calculation;
- checkpoint interruption and resume;
- the four supported command interfaces; and
- absence of retired approval commands and documentation references.

The complete Node suite and Stage 7 Python suite must pass after cleanup. A focused training smoke test must run without network access.

## External Release Boundary

Local use and external release are separate concerns.

Local preparation, training, evaluation, checkpointing, and reconstruction require no per-template approval. Before any source data, prepared dataset, reconstruction, checkpoint, weight, or derivative asset is published or shared externally, a separate release review must identify the intended artifacts and verify their applicable licenses and distribution conditions.

The release review is not part of normal training commands and must not block local experimentation.

## Completion Criteria

The reset is complete when:

1. the retired governance documents, commands, code paths, and dedicated tests are absent;
2. the three project-level sources of truth agree with each other;
3. all 64 local templates are considered by the automatic preparation pipeline;
4. oversized sources produce patches or explicit technical rejection reasons;
5. the four training commands are the only supported local-training workflow;
6. Gate 1 passes;
7. Gate 2 has been executed and reports its real result without suppressing metrics;
8. normal Minecraft generation remains regression-clean; and
9. no existing ignored local artifact has been deleted, published, or overwritten.
