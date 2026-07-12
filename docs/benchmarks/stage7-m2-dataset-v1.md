# Stage 7 M2 Dataset v1 Evidence

## Inputs

- Source branch baseline: `7d645f5` (`Merge Stage 7 M1 coarse semantic voxel shadow`)
- Raw schematic cases: 64
- Knowledge base: `mc_templates/analysis/case_library.v2.json`
- Dataset schema: `stage7-coarse-semantic-voxel-dataset-v1`
- Extractor: `stage7-coarse-semantic-voxel-schematic-extractor-v1`
- Fixed generation time: `SOURCE_DATE_EPOCH=1783814400` (`2026-07-12T00:00:00.000Z`)

## Reproduction Commands

```powershell
$env:SOURCE_DATE_EPOCH='1783814400'
npm run dataset:stage7 -- --require-eligible 0
npm run dataset:stage7 -- --require-eligible 0 --out .tmp/stage7-m2-determinism/index --local-artifacts .tmp/stage7-m2-determinism/local
```

Both commands completed with 64 cases, 0 training-eligible cases, and split counts `train=56`, `validation=3`, `test=5`.

## Artifact SHA-256

| Artifact | SHA-256 |
| --- | --- |
| `manifest.json` | `fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749` |
| `cases.jsonl` | `c316a5673428830c72291ff0e67a686cd671fdc7ef75e277637c959870a21337` |
| `splits.json` | `edab78808431fa29014f011de29dba5451680e763519713c2bd312be0a192db5` |
| `reports/summary.md` | `4dd84270cd6e93e1f854dca95326b6300e4677f2e8e97936ed23a64af2197104` |

The canonical and independent temporary output trees produced identical hashes for all four files.

## Extraction Coverage

- Canonical schema-valid plans: 64/64
- Semantic repair accepted: 0/64
- Run count: minimum 481, maximum 71,376, mean 12,877.86
- Origin counts: 64 real, 0 synthetic, 0 augmented
- Import failures during the preceding 64-template offline analyzer smoke: 0

The extracted raw plans are retained locally for diagnosis. Semantic rejection does not discard the canonical source-derived plan or abort Dataset v1 generation.

## Review and License States

- Review state `pending`: 64
- License state `unknown`: 64
- Canonical front side reviewed: 0
- Explicit `local-training` permission: 0

## Training Eligibility

Training-eligible cases: 0. Every case is blocked by pending review, unknown training permission, unreviewed orientation, and unapproved Stage 7 layers. No case ID appears in `manifest.training_case_ids`.

## Split and Leakage Validation

- Algorithm: `sha256-case-id-v1`
- Train: 56
- Validation: 3
- Test: 5
- Split assignment occurs before eligibility filtering.
- Dataset v1 contains no augmented descendants or synthetic held-out cases.
- Two independent builds produced byte-identical `splits.json` output.

## Known Extraction Warnings

The raw extractor is deliberately conservative. Current semantic blockers are:

| Blocker | Cases |
| --- | ---: |
| missing circulation | 64 |
| missing entrance | 64 |
| missing floor continuity | 63 |
| missing vertical circulation | 37 |
| missing roof | 36 |
| too many massing components | 32 |
| missing usable space | 23 |

These results are extraction diagnostics, not model-quality claims. Milestone 2 preserves them for review and later label refinement.

## Human Review Checkpoint

Codex did not infer or invent license permissions, reviewer identities, canonical front sides, or approved learning areas. A human curator must verify source terms and inspect the extracted layer report before adding a positive training review.

Suggested pilot review candidates:

- `house-a-small-modern-house`
- `house-lakehouse`
- `house-tavern`
- `house-watermill`
- `house-wood-modern-house`
- `temples-japanese-pagoda-plus-tea-house`

Until such records exist, `npm run dataset:stage7 -- --require-eligible 1` must fail.
