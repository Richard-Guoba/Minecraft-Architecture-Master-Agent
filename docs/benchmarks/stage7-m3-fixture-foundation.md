# Stage 7 M3 Fixture-Only Foundation Evidence

Date: 2026-07-13

Scope: **Stage 7 M3 fixture-only foundation**. This evidence covers CPU plumbing, reproducibility, authoritative Node validation, and shadow-operation parity for two committed synthetic fixtures. It is not real-data training and makes no accuracy, quality, preference, or generalization claim.

## Environment

- Repository runtime: Node.js `24.18.0` from `.nvmrc`.
- Conda environment: `mcagent-stage7`.
- Python: `3.12.13`.
- PyTorch: `2.13.0+cu130`; compiled CUDA runtime `13.0`.
- Mandatory device: CPU. `cpu_smoke: ok`; CUDA acceptance was skipped.
- `python -m pip check`: `No broken requirements found.`
- Recorded code revision: `5af6e03180366adec982279af832ed9b66a92015`.

## Mandatory acceptance

Command, run from the repository root with Node.js 24.18.0 active:

```bash
npm run accept:stage7:m3 -- --fixture-root fixtures/m3 --output runs/m3-acceptance --seed 7101 --steps 2
```

This is the normal acceptance workflow. Without `--code-revision`, it records the current `HEAD`. Because that revision is included in both `acceptance.json` and the checkpoint manifest, their whole-file hashes change when the repository revision changes. This moving command is intentionally separate from the immutable evidence replay below.

| Evidence | Result |
| --- | --- |
| Source | `stage7-m3-fixture-acceptance-v1` |
| Schema | `1` |
| Fixture cases | `2` |
| Training scope | `fixture-only` |
| Real training started | `false` |
| CPU smoke | `ok` |
| Training steps | `2` |
| Checkpoint reproducible | `true` |
| Checkpoint manifest reproducible | `true` |
| Metrics reproducible | `true` |
| Parameter hashes reproducible | `true` |
| Final loss reproducible | `true` |
| Inference reproducible | `true` |
| Node schema valid | `true` for both plans |
| Node validation count | `2` |
| Canonical plan run count | `4096` |
| Shadow status | `rejected` |
| Shadow fallback | `primary-build-unchanged` |
| Ordered operation parity | `true` |
| Primary geometry changed | `false` |
| Primary operation count | `1081` |
| Apply Mode available | `false` |

The learned semantic candidate was schema-valid but rejected later by the existing Node semantic repair/conversion boundary. That is an accepted shadow outcome: the normal build completed, fallback stayed `primary-build-unchanged`, and the exact ordered primary operations matched the fixed-seed rule-only build.

## Immutable evidence replay

The published evidence pins the revision explicitly, breaking circular drift when this benchmark itself is committed. Run from any later reviewed `HEAD` with Node.js 24.18.0 active:

```bash
npm run accept:stage7:m3 -- --fixture-root fixtures/m3 --output runs/m3-acceptance-evidence-5af6e03 --seed 7101 --steps 2 --code-revision 5af6e03180366adec982279af832ed9b66a92015
```

Result: exit `0`. The replay output is ignored at `training/stage7/runs/m3-acceptance-evidence-5af6e03/`.

| Evidence file | SHA-256 |
| --- | --- |
| Acceptance JSON | `ab91df7b6ecf76ec942dab86c5cdee0ff4e870016abb4684855e51a6a64bc3f5` |
| Checkpoint manifest | `4c90298c3615d9af892b275acc7b1f1d0a809d247efdf32cca95709c7de0071e` |

## Reproducibility hashes

| Artifact | SHA-256 |
| --- | --- |
| Fixture manifest | `e7e704eaf09ff1e230882f4825297f853eeecc2a5d6abf58315f4bb60f3b2be6` |
| Checkpoint | `938c3d031765ef921b8a8e77f2d069f2a80507eab698167f727b6bc60065d302` |
| Checkpoint manifest | `4c90298c3615d9af892b275acc7b1f1d0a809d247efdf32cca95709c7de0071e` |
| Metrics JSONL | `69fd73d91f94377c1d035095c586b73c4ef4b420895e0f28aee55fe7aa7370c0` |
| Final parameter state | `1dbb85a63e60545c9b3a49cb15a44d116013204e001b0b1aa00a77d4ce967036` |
| Ordered parameter-hash sequence | `909e5c74c9a8cce40e73c93060790e4c0b28f72290fd519b5e51dd95e2e7abac` |
| Inference input | `a808d624a22fefb945bc8c378edbeb245e72988ac3656e9634fc5c7213ce00c0` |
| Inference output / canonical plan | `d17a8f99bc390ed11f621854f80c070b270a6b6319a03c7e2679a6902b34c6ae` |
| Ordered primary operations | `3499ee8ed27dc991161e9acca64848de151b886617d945a1012d126addd5a447` |

The reproduced fixture final loss was `5.666982173919678`. This value is a deterministic plumbing signal only. It is not a quality metric and must not be compared or reported as model performance.

## Test evidence

| Command | Result |
| --- | --- |
| `conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q -p no:cacheprovider tests/test_acceptance.py` | `17` passed; includes benchmark consistency, gate drift, all training/inference mismatch classes, invalid Node results, and primary-operation drift |
| `npm run test:stage7:m3` | `182` passed, `0` failed |
| `node --test test/stage7PythonProvider.test.js test/stage7Cli.test.js test/stage7Pipeline.test.js test/coarseSemanticVoxelSchema.test.js test/coarseSemanticVoxelShadow.test.js` | `43` passed, `0` failed/skipped/cancelled/todo |
| `npm test` | `445` passed, `0` failed/skipped/cancelled/todo |
| `node test/docsProjectStatus.test.js` | `2` passed, `0` failed |

Normal `npm test` remained Python-independent. Cross-runtime Python execution occurred only in the explicit M3 acceptance path. The provider continued to use immutable checkpoint/manifest snapshots, strict UTF-8 parsing, fixture-only lineage checks, argument-list subprocesses, and bounded output/time limits.

## Real-data gate and immutability

The committed Dataset v3 manifest reported exactly:

```text
ready_for_m3_real_data=false
training_eligible_count=0
```

Acceptance checked those values before creating output and recorded `real_training_started=false`. Dataset manifest hashes remained:

```text
fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749  v1/manifest.json
af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654  v2/manifest.json
5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082  v3/manifest.json
```

`git diff --exit-code HEAD -- mc_templates/datasets/coarse_semantic_voxels/v1 mc_templates/datasets/coarse_semantic_voxels/v2 mc_templates/datasets/coarse_semantic_voxels/v3` exited `0`. Acceptance runs, checkpoints, plans, and caches remained ignored.

## Limitations

- Only two synthetic fixtures were used; they contribute zero readiness and evaluation cases.
- No real Dataset v3 tensor was read or trained.
- The fixture loss is plumbing-only and cannot support accuracy, quality, preference, or generalization claims.
- Python emits only provider-neutral Stage 7 semantic plans, never Minecraft blocks, commands, or primary operations.
- A schema-valid inference can still be rejected by Node semantic validation/repair/conversion, as this run demonstrated.
- Normal Node generation remains usable without Python.
- `ready_for_m3_real_data` remains false, `training_eligible_count` remains zero, and M4 Apply Mode remains unavailable.
