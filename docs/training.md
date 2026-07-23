# Local Training

## Policy

All 64 local templates may be used for local training without per-file approval. Local experimentation does not wait on legacy dataset versions, review queues, owner acknowledgements, or admission states.

Local use and external distribution are separate decisions. Data, prepared samples, checkpoints, metrics, and reconstructions remain local by default. An external release or share of a concrete artifact receives a separate license and distribution review at that time.

## Current evidence

The repository contains 64 local schematic sources.

- 22 sources previously fit a centered `64 x 64 x 64` whole-building preparation path.
- 42 oversized sources were deferred by that old whole-volume-only path.
- Three local training attempts were recorded.
- The largest run reached 185,946 optimizer steps.
- Held-out non-air macro-F1 and macro-IoU were both zero.
- More than 96% of evaluation voxels were air, and the model collapsed to predicting air everywhere.

The old runs prove that data loading, optimization, and checkpoint plumbing executed. They do not prove useful structure learning.

## Data preparation

Every `.schematic` or `.schem` source below `mc_templates/` is discovered recursively, bounded, decoded, hashed, tokenized, and fingerprinted. Technical failures are reported rather than converted into approval tasks.

The categorical vocabulary is:

```text
0 air
1 earth
2 rock
3 wood
4 glass
5 architectural shape
6 detail
7 water
8 other
```

If occupied extents fit, a source produces a centered `64 x 64 x 64` whole volume. Every accepted source also produces non-empty `32 x 32 x 32` patches with stride 16. Oversized buildings use overlapping patches and are not rescaled.

## Split and leakage prevention

Source buildings are split before patch extraction or augmentation. Exact-byte and structural duplicates stay in one group. With seed 7101, the deterministic target is 70% train, 15% validation, and 15% test; for 64 unique sources that is 45/10/9.

Every whole volume and patch inherits its source assignment. No derivative may decide or change a split.

## Training and evaluation

The replacement command surface is:

```bash
npm run training:prepare
npm run training:train
npm run training:evaluate
npm run training:status
```

Preparation and source splitting are implemented in Node.js. Training uses PyTorch in the Conda environment `mcagent-stage7`.

The model has an air/non-air occupancy head and a non-air semantic head. Masks select both air and non-air positions so semantic supervision cannot disappear under the air majority. Checkpoints bind the model to dataset and split hashes and support exact resume.

Evaluation reports occupancy and per-class confusion matrices, precision, recall, F1, IoU, loss averages, target/predicted non-air fractions, and supported non-air macro metrics. It compares the trained model with an untrained model and a class-prior baseline.

## Progress gates

Gate 1 is a four-patch deterministic tiny-overfit check:

- supported non-air macro-F1 must be at least 0.90;
- the run may use at most 5,000 optimizer steps.

Gate 2 is held-out validation:

- supported non-air macro-F1 at least 0.20;
- supported non-air macro-IoU at least 0.10;
- both metrics strictly beat the untrained and class-prior baselines;
- predicted non-air fraction is between 0.5 and 2.0 times the target fraction.

Thresholds are fixed before the experiment. A failed Gate 2 is reported honestly and keeps the model outside primary generation.

## Local artifacts

The reset writes new artifacts only below:

```text
.local/training/
  dataset/
  splits/
  reports/
  runs/
```

This root is ignored by Git. Existing `.local/stage7-private-research/` and `.local/stage7-source-expansion/` evidence is preserved in place and is not read, rewritten, moved, published, or deleted by the reset.

## External release

Before publishing or sharing a dataset, source-derived sample, checkpoint, reconstruction, or packaged model, review the exact outbound artifact for license and distribution constraints. That release review does not block private local training.
