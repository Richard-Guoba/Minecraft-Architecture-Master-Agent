# Stage 7 R3 Metadata-Only 5+3 Nomination Design

**Date:** 2026-07-20  
**Status:** owner-approved for execution through the human quality-review gate  
**Parent:** `docs/superpowers/specs/2026-07-20-stage-7-r3-five-candidate-pilot-design.md`

## 1. Purpose

This stage converts the existing public 30-card discovery set, plus narrowly targeted new public-source research when necessary, into one exact proposal containing five primary Minecraft Java Structure NBT candidates and three named reserves. The result is a metadata-only human-review package. It is not an approved named batch and does not authorize acquisition, parsing, Dataset admission, training, publication, or export.

The selection objective is parser reliability first, followed by publicly reviewable building quality. The five primaries must also preserve source and building-type diversity so that one visual family or repository cannot dominate the pilot.

## 2. Fixed authority and boundaries

The owner authorized local integration of the already verified R3 operational tooling and authorized this nomination work through the point where human quality review is required.

This stage may:

- inspect public project pages, licenses, repository trees, commit and release metadata, preview images, and public popularity or maintenance signals;
- record exact immutable revisions, exact lower-case `.nbt` paths, canonical HTTPS file URLs, and dated evidence URLs; and
- write public metadata-only research artifacts below the ignored `.local/stage7-source-expansion/reports/nomination/` directory.

This stage must not:

- request, download, clone, archive, decode, inspect, hash, prepare, fingerprint, reconstruct, or render any candidate `.nbt` payload;
- create `.local/stage7-source-expansion/manifests/named-batch.json` or any operational readiness, acquisition, preparation, fingerprint, or review ledger;
- touch `.local/stage7-private-research/`, including its 42 deferred oversized buildings and three existing run directories;
- change Dataset v1, v2, or v3, Dataset v3's `false`/`0` gate, normal Node generation, the primary provider, M3, M4, or M4 Apply Mode;
- start or resume training; or
- push, publish, upload, share, package, or export any private or candidate-derived artifact.

All work remains sequential. Any Git, private-corpus, formal Dataset, or public-operational-lane drift stops the stage.

## 3. Selection approach

Three approaches were considered:

1. **Gate-first refresh of the existing pool, then targeted expansion — selected.** Refresh the existing candidates against immutable source state, reject modular or dependent entries, and search for new sources only when diversity or reserve coverage remains insufficient. This minimizes network scope and preserves auditability.
2. **Aesthetic-first selection.** Choose the most attractive preview cards first and audit rights and identity later. This risks spending review effort on candidates that cannot be acquired as standalone vanilla files.
3. **Broad source crawl.** Enumerate hundreds or thousands of assets before choosing eight. This is unnecessary for a five-file parser pilot and would make rights, identity, and quality evidence harder to audit.

The selected approach applies hard gates before scoring and expands the source pool only enough to produce a defensible exact 5+3 proposal.

## 4. Hard metadata gates

A candidate is eligible for ranking only when public metadata establishes all of the following:

1. one stable candidate ID and public display title;
2. an independent public source project and authoritative project URL;
3. a full immutable commit SHA or immutable release identifier;
4. one exact lower-case `.nbt` relative path at that revision;
5. one canonical credential-free HTTPS URL for that exact file at that revision;
6. a same-revision license or authoritative licensing record that covers the asset and permits download, copying, modification, intended local training use, derivative research artifacts, and local retention;
7. no AI/ML prohibition, platform conflict, upstream-rights conflict, no-derivatives condition, or unresolved asset-scope ambiguity;
8. public preview or description evidence sufficient to compare identity and visual quality;
9. metadata evidence that the file is a complete building, not a room, basement, decoration, jigsaw piece, template-pool component, structure-block assembly, or multi-file family; and
10. no declared dependency on mod blocks, external assets, processors, repositories, archives, worlds, or companion files.

Unknown values remain `unknown`. They cannot be inferred into a pass. Public dimensions may remain unknown at nomination time, but evidence suggesting an axis above 64 makes the candidate ineligible for this pilot. Actual bounds remain a later post-acquisition machine gate.

## 5. Rights interpretation

An OSI or Creative Commons license is evaluated from its authoritative text and asset scope, not from a platform badge alone. The nomination record must explain why the exact `.nbt` path is covered at the immutable revision and record applicable notice or attribution obligations.

Permissive licenses may support the intended operations when their scope and provenance are clear. Copyleft or attribution licenses are not automatically rejected, but unresolved obligations for model artifacts or mixed upstream content fail closed. A project-level license cannot cure an unclear third-party asset chain.

This is an engineering rights gate, not a legal opinion. Ambiguity produces rejection or deferral, never an invented permission.

## 6. Ranking and slate construction

Only hard-gate passes receive a weighted score:

| Component | Weight |
| --- | ---: |
| Standalone parsing and vanilla compatibility confidence | 45% |
| Verifiable visual quality and public reception | 30% |
| Contribution to source and building-type diversity | 15% |
| Immutable source stability and reproducibility | 10% |

The exact proposed slate contains five primaries and three reserves and satisfies:

- at least four independent source projects among the five primaries;
- at least four building types among the five primaries;
- no more than two primaries from one source project;
- no more than two primaries of one building type;
- no modular family counted as independent diversity; and
- each reserve bound one-to-one to a named primary with the same functional slot and sufficiently similar parser objective.

Reserve mapping is explicit. A reserve cannot later replace an unrelated primary.

## 7. Evidence freshness and record shape

Every proposed candidate records:

- candidate ID, title, author or organization, source project, source URL, and preview URLs;
- immutable revision, exact relative path, canonical exact-file URL, and evidence-observation time;
- function, form, style, scale, environment, and any unknown labels;
- license identifier, same-revision license URL, asset-scope reasoning, permissions, obligations, author chain, and conflict flags;
- standalone, vanilla, module, jigsaw, dependency, and likely-size findings with evidence URLs and confidence;
- current popularity, reception, maintenance, and preview-quality signals with dated sources;
- all hard-gate decisions, weighted component scores, total score, and concise risks; and
- proposed primary or reserve role plus exact reserve mapping.

All web evidence is refreshed on the nomination date. Mutable project pages may support current popularity and preview quality, but immutable revision and path identity must come from immutable source metadata.

## 8. Local artifacts

The stage writes only these ignored public-metadata artifacts:

```text
.local/stage7-source-expansion/reports/nomination/
├── research-ledger.json
├── research-ledger.md
├── five-plus-three-review.json
└── five-plus-three-review.md
```

`research-ledger` records every refreshed or newly considered candidate and its gate result. `five-plus-three-review` contains exactly the proposed five primaries and three reserves, preview links, evidence links, scores, risks, and a blank owner quality decision. Both JSON files explicitly set:

```json
{
  "metadata_only": true,
  "authorizes_download": false,
  "authorizes_training": false,
  "authorizes_dataset_admission": false
}
```

These are review documents, not operational manifests. They contain no payload bytes, payload hashes, prepared data, fingerprints, generated output, private identifiers, or private metrics.

## 9. Verification and stop condition

Before research, after local tooling integration, and before delivering the review package, verify:

- clean expected Git branch and revision relation;
- both local roots are ignored and untracked;
- private aggregates remain 22 active, 42 deferred, 22 source records, 22 prepared records, 22 exact `64^3` binaries, 15/7 split, and three run directories;
- complete private preflight passes 22 cases;
- formal Dataset hashes remain fixed and Dataset v3 remains false/0; and
- the public operational lane contains no quarantine, prepared, fingerprint, named-batch, readiness, prepared, or pilot-review artifact.

The stage stops when the exact eight-candidate metadata-only review package is ready. The owner then manually judges the previews and either accepts, rejects, or requests replacements. No candidate file is acquired until a later exact-slate approval and a separately written real-pilot execution plan.
