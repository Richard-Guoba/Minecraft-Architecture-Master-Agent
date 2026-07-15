# Stage 7 Private-Research Pretraining Isolation Design

**Date:** 2026-07-15
**Status:** approved for planning; not an authorization to start a training run
**Owner decision:** the project owner has chosen a local-only research path for externally obtained Minecraft building templates and has committed that raw inputs, derived samples, checkpoints, and weights will not be pushed, shared, or published.

## 1. Purpose

The project needs a way to explore a large, visually selected collection of Minecraft buildings before it has a corpus with independently verified training permissions. The first model should learn raw architectural form: massing, silhouettes, roofs, façades, block-material combinations, and common building proportions.

This design creates a separately governed **private-research pretraining** path. It is not Dataset v3, does not make any source training-eligible, and cannot promote its model or outputs into the normal Stage 7 architecture agent.

The design deliberately separates two claims:

1. the project owner may choose to run a private local experiment at their own risk; and
2. a dataset or model has verified rights suitable for release.

Only the first claim is in scope here. The second remains false for private-research material.

## 2. Immutable boundaries

The implementation must preserve all of these boundaries:

- Dataset v1, v2, and v3 are immutable. Their committed bytes and hashes must not change.
- Dataset v3 remains `ready_for_m3_real_data=false` and `training_eligible_count=0`.
- The M3 fixture-only package remains fixture-only. No private-research data is accepted by its real-data loader, and its acceptance command remains unable to start real-data training.
- Stage 7 M4 Apply Mode remains unavailable.
- Private-research inputs, derived cases, logs, checkpoints, weights, and generated samples are local-only and must never enter Git, a remote experiment service, a release package, or a primary construction operation.
- The implementation makes no claim that an external source is authorised, public-domain, legally cleared, or safe to distribute. It records `rights_state: "unverified"` unless a later, separate evidence process establishes otherwise.
- The importer does not download or scrape sources. The owner manually places locally obtained files in the private input directory.

This is an engineering containment policy, not legal advice and not a determination of copyright status.

## 3. Approaches considered

### A. Separate, Git-ignored private-research workflow — selected

A new local-only workflow receives raw template files, records their provenance and content hashes, prepares bounded raw voxel volumes, and trains a model whose outputs remain in the same local boundary.

It preserves the existing release-oriented Dataset v3 path and makes the experimental risk visible rather than silently relabelling external inputs as approved data.

### B. Add unverified inputs to Dataset v3 — rejected

This would make the formal Dataset v3 manifest ambiguous, conflict with its immutable false/zero readiness gate, and risk accidental use in future release-oriented work.

### C. Put all experiments in a separate repository — rejected for now

This has the strongest physical separation, but loses the project’s existing test and format tooling. The selected workflow achieves a clear local boundary while retaining one codebase. A future move to a separate repository remains possible if the private corpus becomes large or needs different access control.

## 4. Local filesystem contract

All private-research state lives beneath this directory, which is Git-ignored as a whole:

```text
.local/stage7-private-research/
  PRIVATE_RESEARCH_ACK.json
  source/               manually supplied original template files
  manifests/            private source, hash, and import records
  prepared/             canonical raw voxel volumes
  splits/               deterministic train/validation split records
  runs/                 checkpoints, metrics, logs, and generated samples
```

`PRIVATE_RESEARCH_ACK.json` is a local, ignored acknowledgement created by the project owner. It contains:

```json
{
  "scope": "stage7-private-research-only",
  "distribution_prohibited": true,
  "dataset_v3_unchanged": true,
  "m4_apply_mode_unchanged": true,
  "acknowledged_at": "<ISO-8601 timestamp>",
  "acknowledged_by": "<owner-supplied local identifier>"
}
```

The command-line tools must require this acknowledgement before preparing or training private data. The acknowledgement is not a licence and must not be copied into a public artifact.

The private root is a containment boundary, not a security boundary against a user deliberately bypassing it. Tools will fail closed if a required input or output is outside the private root, resolves through a symbolic link outside that root, or is a Git-tracked path. Tools will also verify that all private paths are ignored by Git before proceeding.

## 5. Provenance and import contract

The first importer supports only locally supplied `.schem` and `.schematic` files. Unsupported formats, including `.litematic`, are rejected with a stable error until a separate design approves a parser.

For every accepted source file, an ignored manifest record contains at least:

```json
{
  "source_id": "stable-local-id",
  "source_path": "source/<relative-path>",
  "source_url": "owner-entered URL or empty string",
  "obtained_at": "ISO-8601 timestamp",
  "content_sha256": "hex SHA-256",
  "format": "schem | schematic",
  "rights_state": "unverified",
  "distribution": "prohibited",
  "purpose": "local-private-research-only"
}
```

The importer must:

1. enumerate files in stable lexical order;
2. reject duplicate content hashes instead of inflating the corpus;
3. reject malformed files, oversized decompressed payloads, unsafe NBT structures, non-finite dimensions, and path escapes;
4. produce a deterministic import report from the manifest records; and
5. never alter, copy into, or derive a Dataset v1/v2/v3 record.

The owner remains responsible for keeping the original external-source URL and any available author information accurate. Blank or unknown provenance stays blank or unknown; the implementation must not infer it.

## 6. Raw-structure representation

The first model deliberately avoids claims about room semantics, entrances, canonical fronts, or human-approved decomposition.

For an imported building, the preparer computes its non-air bounding box and accepts it only when every dimension is at most `64`. It pads the building into a deterministic `64 × 64 × 64` volume without rescaling block geometry. Larger structures are rejected in this first version; they are not silently scaled, cropped, tiled, or split.

Each non-air block maps through a separately versioned private taxonomy into these coarse values:

```text
air, terrain, structural-stone, structural-wood, glass,
roof, decorative, fluid, other-solid
```

The mapping and its version are stored with each prepared case. It is an engineering representation for local pretraining, not a semantic annotation of the original building. It does not reuse or change the Dataset v3 semantic layers (`envelope`, `space`, `site`).

## 7. First model and data flow

The initial model is a private 3-D masked reconstruction model over the bounded categorical raw volumes. Its task is to reconstruct masked voxels from visible surrounding geometry and material-family context.

```text
manually supplied source files
  -> validated private import manifest
  -> bounded raw voxel preparation
  -> hash-deduplicated, deterministic source-group split
  -> private masked-reconstruction training
  -> private-only checkpoint and reconstruction samples
```

This model can learn architectural regularities without requiring algorithmic room labels. It is not a prompt-following architecture agent and must not be wired to the authoritative Node construction provider, M3 shadow provider, M4 Apply Mode, or primary operations.

Prepared-case and split records use stable IDs derived from the source content hash and preparation-taxonomy version. All random operations are seeded and recorded. A source group may appear in exactly one split to avoid near-identical copies of a building leaking between train and validation.

## 8. Training protocol

All private-research commands default to offline operation. They do not fetch data, contact experiment trackers, upload metrics, or send checkpoints. The implementation must not require a cloud account or remote service.

Before a run, the trainer performs a preflight check that verifies:

1. the owner acknowledgement exists and has the required true flags;
2. every selected input, manifest, prepared case, split, and output directory is inside the ignored private root;
3. every selected case has `rights_state: "unverified"`, `distribution: "prohibited"`, and the required local-only purpose marker;
4. Dataset v1/v2/v3 hashes exactly match the known committed values;
5. Dataset v3 remains false/zero and M4 remains unavailable; and
6. no input or output path is Git-tracked or escapes through a symlink.

The first operational run is a CPU-bounded smoke run over a small owner-selected subset. A larger run requires a new explicit run command with a recorded sample count, device selection, disk estimate, seed, and run identifier. Both kinds of run write only below `runs/`.

Every checkpoint and metrics record includes the input-manifest hash, prepared-taxonomy version, split hash, seed, `distribution: "prohibited"`, and `private_research_only: true`.

## 9. Required refusal behaviour

The private workflow must reject rather than repair or reinterpret:

- missing or malformed acknowledgement;
- tracked, non-ignored, out-of-root, or symlink-escaping paths;
- an attempt to write outside the private root;
- source data that is already a Dataset v1/v2/v3 case;
- unsupported source format or malformed/oversized template;
- duplicate source content;
- a missing, changed, or mismatched source/prepared/split hash;
- an attempt to enable M4, modify a Dataset manifest, use Dataset v3 as input, or attach a private checkpoint to the primary construction pipeline; and
- any request for network download, upload, publishing, or export from this workflow.

An error report must name the violated boundary without fabricating a permission decision.

## 10. Verification strategy

Implementation uses fixtures only for committed automated tests. No external template enters Git as a test fixture.

Focused tests must prove that the workflow:

- accepts only an acknowledged, local, ignored, bounded, valid fixture input;
- records deterministic source and prepared hashes;
- rejects duplicate files, unsupported formats, malformed payloads, oversize dimensions, tracked paths, non-ignored paths, path escapes, and symlink escapes;
- generates deterministic, source-group-disjoint splits;
- writes all generated files inside the private root;
- verifies unchanged Dataset v1/v2/v3 bytes and the false/zero Dataset v3 gate before and after each command;
- rejects M3/M4/primary-provider integration; and
- labels every private checkpoint and report as non-distributable private research.

The full existing Node and Python suites run at implementation and release boundaries. They must keep passing without changing M3 fixture acceptance evidence.

## 11. Non-goals

This design does not:

- grant copyright permission, adjudicate fair use/fair dealing, or replace legal advice;
- download or select external sources automatically;
- make a private source training-eligible for Dataset v3;
- generate architectural semantic labels, floor plans, canonical fronts, or quality scores;
- create a public dataset, release model, or commercial model;
- improve the primary agent automatically; or
- start a training run simply because this document exists.

## 12. Approval and next gate

The owner approved this design in conversation on 2026-07-15 and committed to the local-only, no-push, no-sharing, no-publication boundary.

The next step is to write a detailed TDD implementation plan. Implementation begins only after the owner reviews this committed specification. Running the first private-research training command remains a later, separate operational action after implementation, test verification, local source import, and preflight success.
