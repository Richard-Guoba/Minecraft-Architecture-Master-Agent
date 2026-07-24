# Local Training

## Policy

All 64 local templates may be used for local training without per-file approval. Local experimentation does not wait on legacy dataset versions, review queues, owner acknowledgements, or admission states.

Local use and external distribution are separate decisions. Data, prepared samples, checkpoints, metrics, and reconstructions remain local by default. An external release or share of a concrete artifact receives a separate license and distribution review at that time.

## Current evidence

The active preparation and experiments use seed 7101.

- All 64 local sources were accepted; none were rejected.
- Preparation produced 22 centered `64 x 64 x 64` whole volumes and 11,600 non-empty `32 x 32 x 32` patches.
- The source split is 45/10/9 buildings, producing 8,260/1,546/1,794 train/validation/test patches.

The original `heldout-7101` run is the fixed phase-two reference. It completed 50,000 CUDA steps and passed Gate 2 on validation with non-air macro-F1 `0.3609670072698868`, macro-IoU `0.2546205642375849`, occupancy F1 `0.9192990194788946`, predicted/target non-air ratio `1.0486544273338727`, and token-5 F1 `0.00017447135180403378`.

Semantic-balance v2 produced the following observed sequence:

| Stage | Run/profile | Steps | Gate 1 | Gate 2 | Phase 2 | Macro-F1 | Macro-IoU | Token-5 F1 | Occupancy F1 | Ratio | Selection score |
| --- | --- | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny | `tiny-weighted-7101` / `weighted` | 3,000 | pass | not run | not run | `0.9013636889848812` | not used | `0.4444444444444444` | not used | not used | not used |
| tiny | `tiny-weighted-mask-7101` / `weighted-mask` | 1,200 | pass | not run | not run | `0.9101720776820412` | not used | `0.9230769230769231` | not used | not used | not used |
| ablation | `ablation-weighted-7101` / `weighted` | 10,000 | not run | pass | fail | `0.3388761805168455` | `0.23862992699977656` | `0.001203955655459904` | `0.9052963665139913` | `1.0089535827073497` | `0.0023993867952769453` |
| ablation | `ablation-weighted-mask-7101` / `weighted-mask` | 10,000 | not run | pass | fail | `0.30537566155135276` | `0.2112248793898191` | `0.014867589729802393` | `0.9044532638463015` | `1.0544892420023828` | `0.028354696195776935` |

Both ablations were eligible because winner selection requires Gate 2, not phase two. `weighted-mask` won because its harmonic macro/token-5 selection score was higher. The final run started from scratch with that profile; it did not resume the 10,000-step ablation.

| `balanced-v2-7101` split | Gate 2 | Phase 2 | Macro-F1 | Macro-IoU | Token-5 F1 | Occupancy F1 | Predicted/target ratio | Selection score |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| validation | pass | fail | `0.3490899391110659` | `0.24316051389931825` | `0.03951562683042623` | `0.9136144860272776` | `1.0509388160786985` | `0.07099490575102044` |
| untouched test | fail | fail | `0.16200967268508154` | `0.09846695595695945` | `0.04201084182123149` | `0.9417519966617621` | `1.0247792240757456` | `0.06672037612641002` |

The validation run missed phase two because macro-F1 did not strictly exceed `0.3609670072698868` and token-5 F1 did not reach `0.10`; occupancy and ratio checks passed. Test Gate 2 failed its `0.20` macro-F1 and `0.10` macro-IoU minimums, although it still beat both baselines and passed occupancy calibration. Test occupancy stayed strong, but semantic generalization fell sharply. Test F1 was weakest for glass/token 4 (`0.006902941710261121`), other/token 8 (`0.03756438237395286`), architectural shape/token 5 (`0.04201084182123149`), and rock/token 2 (`0.1028905634345362`).

This is evidence of useful learning, not a production-quality architecture model. The checkpoint is not integrated into primary Minecraft generation.

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

The exact semantic-balance v2 reproduction sequence is:

```bash
npm run training:prepare -- --source-root mc_templates --root .local/training --seed 7101
npm run training:train -- --root .local/training --run-id tiny-weighted-7101 --tiny-overfit --steps 5000 --batch-size 2 --learning-rate 0.001 --device auto --seed 7101 --semantic-balance weighted
npm run training:train -- --root .local/training --run-id tiny-weighted-mask-7101 --tiny-overfit --steps 5000 --batch-size 2 --learning-rate 0.001 --device auto --seed 7101 --semantic-balance weighted-mask
npm run training:train -- --root .local/training --run-id ablation-weighted-7101 --steps 10000 --batch-size 2 --learning-rate 0.001 --device auto --seed 7101 --semantic-balance weighted
npm run training:evaluate -- --root .local/training --run-id ablation-weighted-7101 --device auto --seed 7101 --split validation
npm run training:train -- --root .local/training --run-id ablation-weighted-mask-7101 --steps 10000 --batch-size 2 --learning-rate 0.001 --device auto --seed 7101 --semantic-balance weighted-mask
npm run training:evaluate -- --root .local/training --run-id ablation-weighted-mask-7101 --device auto --seed 7101 --split validation
npm run training:train -- --root .local/training --run-id balanced-v2-7101 --steps 50000 --batch-size 2 --learning-rate 0.001 --device auto --seed 7101 --semantic-balance weighted-mask
npm run training:evaluate -- --root .local/training --run-id balanced-v2-7101 --device auto --seed 7101 --split validation
npm run training:evaluate -- --root .local/training --run-id balanced-v2-7101 --device auto --seed 7101 --split test
npm run training:status -- --root .local/training
```

Preparation and source splitting are implemented in Node.js. Training uses PyTorch in the Conda environment `mcagent-stage7`.

The model input is a masked voxel patch. Its outputs are air/non-air occupancy logits and semantic-family logits for non-air voxels. It learns local completion; it does not replace the LLM's semantic design role or the Node.js executor's exact geometry and datapack generation.

`--semantic-balance` supports three profiles:

- `none`: unit semantic weights and the original uniform mask;
- `weighted`: train-only semantic class weights and the original uniform mask;
- `weighted-mask`: the same weights plus deterministic class quotas followed by uniform fill, without changing the total mask budget.

For semantic tokens 1 through 8, training derives
`clamp(sqrt(max(train_count[1..8]) / train_count[c]), 1, 4)`. Seed 7101 produced:

```text
[1.095598162630594, 1.0, 3.75509778719343, 4.0,
 4.0, 2.2177610628766744, 3.691122876680541, 1.781107282195446]
```

The canonical weight digest is `c1b96e67a857a91c79cb589a2c1b040b88624f3f094e6ca6ec6135830e434c8d`. Weighting applies only to semantic cross-entropy; occupancy loss is unchanged. Validation and test always use the original uniform evaluation mask, so the profiles are compared under the same evaluation distribution.

Checkpoints bind the model to the dataset hash, split hash, objective version, profile, exact weights, and weight digest and support exact resume. Legacy checkpoints are valid only with `none` and unit weights.

Evaluation reports occupancy and per-class confusion matrices, precision, recall, F1, IoU, loss averages, target/predicted non-air fractions, and supported non-air macro metrics. It compares the trained model with an untrained model and a class-prior baseline. Validation writes `evaluation.json` and `reconstruction.bin`; test writes `evaluation.test.json` and `reconstruction.test.bin`, leaving validation artifacts unchanged.

## Progress gates

Gate 1 is a four-patch deterministic tiny-overfit check:

- supported non-air macro-F1 must be at least 0.90;
- the run may use at most 5,000 optimizer steps.

Gate 2 is held-out validation:

- supported non-air macro-F1 at least 0.20;
- supported non-air macro-IoU at least 0.10;
- both metrics strictly beat the untrained and class-prior baselines;
- predicted non-air fraction is between 0.5 and 2.0 times the target fraction.

Thresholds were fixed before the experiment. The original reference, both v2 ablations, and the final v2 validation report passed every Gate 2 check; the untouched v2 test report did not. Passing proves that a model learned beyond the baselines on that split; it does not automatically place the checkpoint in primary generation.

Phase two adds all of these requirements:

- Gate 2 passes;
- non-air macro-F1 strictly exceeds the fixed `heldout-7101` reference `0.3609670072698868`;
- token-5 architectural-shape F1 is at least `0.10`;
- occupancy F1 is at least `0.90`;
- predicted/target non-air ratio remains in `[0.5, 2.0]`.

For ablation selection, only Gate-2-passing reports are eligible. Candidates are ranked by the harmonic mean of non-air macro-F1 and token-5 F1, then macro-F1, then lexicographically smaller run ID. Both v2 ablations passed Gate 2, and `weighted-mask` won this fixed ranking. Neither ablation nor the final 50,000-step run passed phase two.

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
