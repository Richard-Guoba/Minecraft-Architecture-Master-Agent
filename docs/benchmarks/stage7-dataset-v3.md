# Stage 7 Dataset v3 Extraction Foundation Evidence

## Scope

- Parent dataset: `v2`
- Dataset schema: `stage7-coarse-semantic-voxel-dataset-v3`
- Extractor: `stage7-coarse-semantic-voxel-schematic-extractor-v3`
- Grid transform: `stage7-interval-partition-v1`
- Target resolution: `64 x 64 x 64`
- Raw schematic cases: 64
- Frozen pilot review records: 6, all human-recorded `research-only`
- Fixed generation time: `SOURCE_DATE_EPOCH=1783814400` (`2026-07-12T00:00:00.000Z`)

This subproject establishes the accepted Dataset v3 extraction, review-binding, validation, publication, and comparison interfaces. It does not create the separate Python/PyTorch M3 fixture environment.

## Reproduction Commands

Canonical build:

```powershell
$env:SOURCE_DATE_EPOCH='1783814400'
npm run dataset:stage7 -- --dataset-version v3 --review-overlay mc_templates/curation/stage7_dataset_reviews.jsonl --require-eligible 0
```

Independent build:

```powershell
$env:SOURCE_DATE_EPOCH='1783814400'
npm run dataset:stage7 -- --dataset-version v3 --review-overlay mc_templates/curation/stage7_dataset_reviews.jsonl --require-eligible 0 --out .tmp/stage7-v3-reproduction/index --local-artifacts .tmp/stage7-v3-reproduction/local
```

Both builds completed with 64 cases, zero training-eligible cases, and fixed split counts `train=56`, `validation=3`, `test=5`. Recursive relative-file-list and SHA-256 comparison found no canonical/independent differences.

## Canonical Artifact SHA-256

| Artifact | SHA-256 |
| --- | --- |
| `manifest.json` | `5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082` |
| `cases.jsonl` | `33f9756f2e71b8fa035d46eaadb48f97ceea28917b8cd5a1a0236058b28c5ea6` |
| `splits.json` | `edab78808431fa29014f011de29dba5451680e763519713c2bd312be0a192db5` |
| `reports/summary.md` | `1f8cb8d2d3cc28eb51ed597abb39caab7f78378b4c26c68ab8cb81d5f36ca21f` |
| `reports/readiness.md` | `0e59f246c13ba31041b510d358db82d17e9ad1fe8c4194533253128b677e8ed6` |

The independent output produced the same five hashes.

## Dataset v1/v2 Immutability

Frozen inventories were captured before the v3 writer change and compared before, during, and after canonical v3 publication. All nine tracked v1/v2 files remained byte-identical:

The hashes below are the original Windows working-tree hashes and include CRLF line endings. Git stores the published files with canonical LF line endings; the WSL migration check therefore compares the working tree directly with `HEAD` and records the published LF manifest hashes as `fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749` for v1 and `af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654` for v2. Converting the published LF files to CRLF reproduces every historical value in this table, so the difference is line-ending representation rather than dataset drift.

| Version | Artifact | SHA-256 |
| --- | --- | --- |
| v1 | `cases.jsonl` | `622d39be6545423f7e59b422b99c373679c98165e75432eab852f1a8a03daf77` |
| v1 | `manifest.json` | `c33892ba6d2d9687ae09feced9d5cbaf84512639b59b177865ca45df1d0159f8` |
| v1 | `reports/summary.md` | `2bf8f2f93c0e393e191db35859b8d28e26b5e2a63947fb7e3555044eca239c46` |
| v1 | `splits.json` | `6227bfc1d2f2ecc274f1f2633d73451381f0fc8f299c08553d30d0557682afcf` |
| v2 | `cases.jsonl` | `4690b381e748b5c1b4acdb887da39c8480800b8a2189134f54f332390525ab47` |
| v2 | `manifest.json` | `4d9f271fb8fdfe013213a35fc1f588f5930dac4a3ea7c5f9ca9496af0047489b` |
| v2 | `reports/readiness.md` | `9fbd2406dc75a852397ac4bfc8054d2984f273c1b7e3d8eec03746948912746d` |
| v2 | `reports/summary.md` | `f3367bb83732e389dddae817d4070bd1aa3309e64f95424637c576ecaff76aee` |
| v2 | `splits.json` | `6227bfc1d2f2ecc274f1f2633d73451381f0fc8f299c08553d30d0557682afcf` |

## Verification

- Focused Dataset v3 suite: 58 passed, 0 failed, 0 cancelled, 0 skipped.
- Complete Node.js suite: 422 passed, 0 failed, 0 cancelled, 0 skipped.
- The real `arenas-tennis-court` regression proves that more than five topology candidate floors remain diagnostic while the generated M1 condition stays within its supported 1–5 floor range.
- The one-floor golden fixture fixes transform metadata, semantic layer counts, topology, blockers, and review-plan hash.

## Current Readiness and Blockers

- Pilot cases present: 6/6
- Explicit human review outcomes: 6/6
- Review outcome: 6 `research-only`, 0 positive training reviews
- Automated semantic accepted: 0/64
- Plan-bound semantic accepted: 0/64
- Training eligible: 0/64
- Ready for M3 real-data training: no

The strict gate command was:

```powershell
$env:SOURCE_DATE_EPOCH='1783814400'
npm run dataset:stage7 -- --dataset-version v3 --review-overlay mc_templates/curation/stage7_dataset_reviews.jsonl --require-reviewed 6 --require-semantic-accepted 3 --require-eligible 3 --out .tmp/stage7-v3-strict/index --local-artifacts .tmp/stage7-v3-strict/local
```

It exited `1` with `reviewed=6`, `semantic_accepted=0`, and `eligible=0`; the CLI reported `Stage 7 dataset requires 3 semantic-accepted cases, found 0`.

Across all 64 cases, the dominant extraction blockers are missing entrance (63), missing floor continuity (57), missing vertical circulation (57), v3 repair-policy budget exceeded (57), missing circulation (52), and too many massing components (45). Governance remains fail-closed: all 64 lack training permission and all 64 lack an exact positive v3 plan-bound semantic review.

## Six-Pilot Diagnostic Comparison

The deterministic comparison is recorded in [stage7-dataset-v2-v3-pilot-comparison.md](stage7-dataset-v2-v3-pilot-comparison.md). It compares v2/v3 plan hashes, connected components, entrances, circulation, vertical cores, floor levels, roof coverage, roof/vertical overlap, repair burden, and blockers. These metrics are diagnostic only and do not transfer license permission or create semantic acceptance.

## Training Boundary

No Python or PyTorch environment, model, checkpoint, checkpoint manifest, or real-data training run was created. Automation did not generate a reviewer identity, positive license decision, approved learning area, or positive semantic review. The Dataset v3 interface is now stable enough to plan Subproject B—the fixture-only M3 training/inference foundation—while real data remains blocked by the readiness gate.
