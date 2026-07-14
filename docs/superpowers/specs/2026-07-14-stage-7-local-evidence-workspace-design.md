# Stage 7 Local Evidence Workspace Design

Date: 2026-07-14

## Purpose

Prepare a local, Git-ignored workspace that lets a human reviewer fill only the provenance, licensing, and review decisions needed by the existing six-pilot Stage 7 readiness audit. The workspace must preserve every committed Dataset and review record and must not authorize training.

## Scope

The preparation has three outputs, all under `.tmp/`:

| Output | Location | Contents |
| --- | --- | --- |
| Local v3 artifacts | `.tmp/stage7-dataset/v3/` | Deterministically generated `plan.raw.json` files from the existing v3 builder, including the six pilot paths expected by the audit. |
| Human evidence workspace | `.tmp/stage7-readiness-evidence/` | A README and one Markdown intake form per fixed pilot case. |
| Baseline audit | `.tmp/stage7-readiness-audit-baseline/` | The audit's canonical JSON and Markdown report, marked advisory-only. |

The fixed pilots are `house-a-small-modern-house`, `house-lakehouse`, `house-tavern`, `house-watermill`, `house-wood-modern-house`, and `temples-japanese-pagoda-plus-tea-house`.

## Data flow and boundaries

The existing `dataset:stage7` command may read the committed template and review metadata and write only an independently generated v3 index under `.tmp/stage7-readiness-workspace/index/` plus local artifacts under `.tmp/stage7-dataset/v3/`. It is not a trainer and must run with `--dataset-version v3`, the existing review overlay, and `--require-eligible 0`.

Each intake form pre-populates only values already committed in the Dataset v3 record: case ID, current review/semantic/eligibility status, source hash, expected canonical plan hash, and expected local plan path. It leaves these human-owned fields visibly blank:

- creator/uploader provenance and source evidence;
- license terms and the explicit basis for `local-training`;
- reviewer identity, role, date, and decision;
- canonical front side;
- permitted and blocked learning layers;
- semantic acceptance conclusion and supporting observations.

The forms are evidence staging only. They do not update `stage7_dataset_reviews.jsonl`, Dataset v3 case records, training eligibility, or the gate.

The baseline audit reads the existing Dataset v3 root, the existing overlay, and the local artifact root. It writes its report outside every Dataset root. It remains advisory-only even if every form is later completed.

## Error handling and verification

If v3 artifact materialization fails, the preparation stops and does not claim that plans were verified. If a generated plan's canonical hash differs from its committed v3 record, the baseline audit must retain its blocker. Missing human evidence is represented as an explicit blank field, never inferred.

After preparation, verify all of the following:

1. Dataset v1/v2/v3 manifest hashes remain unchanged and there is no Dataset diff.
2. Dataset v3 still records `ready_for_m3_real_data: false` and `training_eligible_count: 0`.
3. The audit report includes `advisory_only: true`, `mutates_dataset: false`, and `authorizes_training: false`.
4. No trainer, Python process, provider, push, gate change, or M4 Apply Mode action was invoked.

## Non-goals

This work does not collect external evidence, make a human review decision, edit any committed record, change the Dataset v3 gate, perform real-data training, or start M4. Any later proposal to integrate completed human evidence requires a separate approved design and explicit authorization.
