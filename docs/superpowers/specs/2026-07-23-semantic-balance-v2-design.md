# Semantic Balance V2 Design

## Objective

Improve held-out semantic completion without changing the nine-token taxonomy,
source-level split, source templates, or production construction flow. The
specific defect is that token 5 (`architectural-shape`, currently stairs and
slabs) has validation F1 `0.000174` even though it has 286,253 masked validation
targets.

The second training phase must improve token 5 without sacrificing the useful
occupancy and overall non-air learning demonstrated by `heldout-7101`.

## Baseline Evidence

The seed-7101 dataset contains 8,260 train, 1,546 validation, and 1,794 test
patches. Token 5 represents:

- `0.707%` of non-air train voxels;
- `4.026%` of non-air validation voxels; and
- `5.237%` of non-air test voxels.

The current semantic loss is unweighted cross-entropy. Non-air mask positions
are sampled uniformly, and training visits patches in deterministic sample-ID
order. In the validation confusion matrix, the trained model predicts token 5
only 327 times. It predicts `63.179%` of true token-5 targets as rock, `11.259%`
as air, and `11.046%` as other.

The accepted baseline is:

- non-air macro-F1: `0.360967`;
- non-air macro-IoU: `0.254621`;
- occupancy F1: `0.919299`;
- predicted/target non-air ratio: `1.048654`; and
- token-5 F1: `0.000174`.

## Scope

This phase will:

- preserve tokens `0..8` and their current meanings;
- preserve all source assignments and prepared sample bytes;
- add deterministic train-only class weights;
- add an optional deterministic class-aware non-air mask;
- bind the selected objective profile to checkpoints;
- support separate validation and test reports;
- run two short ablations and one full experiment; and
- keep all datasets, checkpoints, metrics, and reconstructions below
  `.local/training/`.

This phase will not:

- edit or reclassify local templates;
- change `mapTrainingToken`;
- alter the 3D model architecture;
- add a fifth training command;
- use validation or test counts to calculate training weights;
- tune thresholds after seeing new results; or
- connect a learned checkpoint to primary Minecraft generation.

## Objective Profiles

`training:train` gains one option:

```text
--semantic-balance none|weighted|weighted-mask
```

The default is `none`, which preserves the behavior and resume semantics of
existing runs.

The profiles are:

- `none`: uniform semantic cross-entropy and the current uniform non-air mask;
- `weighted`: train-derived semantic class weights with the current mask; and
- `weighted-mask`: the same weights plus the hybrid class-aware mask.

The two ablations compare `weighted` and `weighted-mask`. The existing
`heldout-7101` result is the unchanged baseline.

## Train-Only Semantic Weights

Weights use only `TrainingSample.token_counts` records assigned to `train`.
For each non-air class `c`:

```text
frequency[c] = train_count[c] / sum(train_count[1..8])
weight[c] = clamp(sqrt(max(frequency[1..8]) / frequency[c]), 1.0, 4.0)
```

All eight train counts must be positive. Frequencies and weights are
deterministic. Their digest is SHA-256 over UTF-8 JSON produced with Python
`json.dumps` using `sort_keys=True`, `separators=(",", ":")`, and
`allow_nan=False` for:

```json
{"source":"semantic-balance-v2","weights":[1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0]}
```

The example values above show the payload shape, not the calculated result.
Every calculated weight must be finite and in `[1.0, 4.0]`.

Only semantic cross-entropy receives these weights. Occupancy loss remains
unchanged. The weight vector is moved to the same device as semantic logits
before loss calculation.

## Hybrid Class-Aware Mask

Air selection and the total non-air mask budget remain unchanged. For each
sample in a `weighted-mask` batch:

1. determine the existing non-air selection count;
2. reserve half of that count, rounded down, for class quotas;
3. order the semantic classes present in the patch by applying a seed-derived
   rotation to ascending token IDs;
4. give every present class `floor(quota_budget / present_class_count)`
   positions, then give the first `quota_budget % present_class_count` classes
   in that order one additional position;
5. if a class has fewer voxels than its quota, redistribute the unused
   positions one at a time by cycling through that same order and skipping
   classes with no remaining unselected voxels;
6. fill the other half from all remaining non-air positions using the existing
   deterministic random generator; and
7. never select the same voxel twice.

The resulting mask has the same non-air count as the uniform strategy. Mixed
patches retain equal air and non-air mask counts. Fully occupied patches retain
the existing 25% total mask behavior. All-air samples remain invalid.

Validation and test always use the unchanged uniform balanced mask. This keeps
comparisons with `heldout-7101` valid.

## Training and Checkpoint Binding

`TrainingConfig` and `TrainingCheckpointBinding` gain:

- `semantic_balance`;
- the exact eight semantic class weights; and
- `semantic_class_weights_sha256`.

The checkpoint metadata also records an objective version named
`semantic-balance-v2`. A resume request must match the objective profile and
weight digest. A mismatch raises a direct training error before loading model
or optimizer state.

Legacy checkpoints without these fields may load only when the requested
profile is `none`; they normalize to eight weights of `1.0`. The model version
stays `tiny-voxel-completion-v1` because no parameter shapes change.

Short ablations and the full v2 run use new run IDs and start from newly
initialized weights. No new experiment resumes from `heldout-7101` or from an
ablation checkpoint.

## Evaluation Outputs

`training:evaluate` gains:

```text
--split validation|test
```

The default remains `validation`.

- validation writes `evaluation.json` and `reconstruction.bin` for status
  compatibility;
- test writes `evaluation.test.json` and `reconstruction.test.bin`; and
- each report records its split explicitly.

Every report adds:

```text
selection_score =
  0                                            if macro_f1 <= 0 or token5_f1 <= 0
  2 * macro_f1 * token5_f1 / (macro_f1 + token5_f1) otherwise
```

Every report also records the fixed phase-two acceptance checks:

- non-air macro-F1 strictly greater than `0.3609670072698868`;
- token-5 F1 at least `0.10`;
- occupancy F1 at least `0.90`;
- predicted/target non-air ratio within `[0.5, 2.0]`; and
- every existing Gate 2 check passes.

The validation report chooses an ablation winner by higher
`selection_score`. An exact score tie is broken by higher non-air macro-F1,
then by the lexicographically smaller run ID. Test metrics never participate
in selection.

## Experiment Protocol

All runs use seed 7101, batch size 2, learning rate `0.001`, and device `auto`.

### Preflight

Each profile must pass the existing Gate 1 threshold within 5,000 steps:

```text
tiny-weighted-7101
tiny-weighted-mask-7101
```

Failure stops that profile before its ablation.

### Ablations

Run each surviving profile from scratch for exactly 10,000 steps:

```text
ablation-weighted-7101
ablation-weighted-mask-7101
```

Evaluate both on validation. A profile is eligible to win only if it passes
the existing Gate 2. Select the eligible run using the fixed ordering above.
If neither is eligible, report the result and stop.

### Full Run

Run the selected profile from scratch for exactly 50,000 steps as:

```text
balanced-v2-7101
```

Evaluate validation first, then the untouched test split. Both reports use the
same fixed phase-two thresholds. A test failure is reported as a failed
confirmatory result; it does not trigger threshold changes or an alternative
winner.

## Error Handling

Training stops with a direct error when:

- any train semantic class has zero support;
- a frequency or class weight is non-finite or out of bounds;
- a semantic weight has the wrong length, dtype, or device;
- class-aware selection changes the mask budget or selects duplicates;
- a checkpoint objective profile or weight digest differs;
- a requested evaluation split has no samples or non-air support; or
- a report would overwrite the other split's report or reconstruction.

Interrupted runs retain the existing atomic checkpoint and exact-resume
behavior.

## Testing

Unit tests must prove:

- train-only counts produce the exact deterministic weight vector and digest;
- zero support and non-finite inputs fail directly;
- weighted loss changes rare-class contribution without changing occupancy
  loss;
- hybrid selection is deterministic, preserves counts, contains no
  duplicates, increases selection of a rare present class, and supports fully
  occupied patches;
- `none` preserves the existing mask and loss behavior;
- checkpoint resume accepts identical profiles and rejects profile or digest
  mismatches;
- legacy checkpoints load only under `none`;
- validation and test use the uniform evaluation mask and separate files;
- selection score, tie-breaking, and every acceptance threshold have exact
  boundary tests; and
- command help exposes the new options without adding a training script.

Integration verification must run:

```text
npm test
npm run test:training
npm start -- --mode mock --seed 7101 "<fixed smoke prompt>"
```

Each Gate 1, ablation, full run, validation evaluation, test evaluation, and
status command must report its real result.

## Documentation and Repository Boundary

After the experiments, `README.md`, `docs/architecture.md`, and
`docs/training.md` receive the observed run IDs, metrics, pass/fail decisions,
and remaining weaknesses. No checkpoint or prepared sample is committed.

This specification and its implementation plan are temporary execution
artifacts. They are committed for review and then removed from the final
working tree after the observed results have been folded into the three current
project documents. Git history remains the implementation archive.
