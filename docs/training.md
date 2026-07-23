# Local Training

## Policy

All 64 local templates may be used for local training without per-file approval. Local experimentation does not wait on legacy dataset versions, review queues, owner acknowledgements, or admission states.

Local use and external distribution are separate decisions. Data, prepared samples, checkpoints, metrics, and reconstructions remain local by default. An external release or share of a concrete artifact receives a separate license and distribution review at that time.

## Current evidence

The active preparation and training run uses seed 7101.

- All 64 local sources were accepted; none were rejected.
- Preparation produced 22 centered `64 x 64 x 64` whole volumes and 11,600 non-empty `32 x 32 x 32` patches.
- The source split is 45/10/9 buildings, producing 8,260/1,546/1,794 train/validation/test patches.
- Gate 1 passed at step 2,300 with non-air macro-F1 `0.9054`.
- The held-out run completed 50,000 optimizer steps on CUDA.
- Gate 2 passed with validation non-air macro-F1 `0.3610`, macro-IoU `0.2546`, and occupancy F1 `0.9193`.
- The trained model beat the untrained macro-F1 baseline (`0.0093`) and class-prior baseline (`0.0`). Its predicted/target non-air ratio was `1.0487`.

This is the first run in the repository that demonstrates useful held-out non-air learning. It is not a production-quality architecture model: the architectural-shape class remains near zero F1 and needs targeted data or objective work.

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
npm run training:prepare -- --source-root mc_templates --root .local/training --seed 7101
npm run training:train -- --root .local/training --run-id tiny-overfit-7101 --tiny-overfit --steps 5000 --batch-size 2 --learning-rate 0.001 --device auto --seed 7101
npm run training:train -- --root .local/training --run-id heldout-7101 --steps 50000 --batch-size 2 --learning-rate 0.001 --device auto --seed 7101
npm run training:evaluate -- --root .local/training --run-id heldout-7101 --device auto --seed 7101
npm run training:status -- --root .local/training
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

Thresholds were fixed before the experiment. The seed-7101 run passed every Gate 2 check. Passing proves that the model learned beyond the baselines; it does not automatically place the checkpoint in primary generation.

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
