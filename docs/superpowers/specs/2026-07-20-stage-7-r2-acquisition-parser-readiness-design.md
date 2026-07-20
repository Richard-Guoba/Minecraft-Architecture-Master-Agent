# Stage 7 R2 Acquisition and Parser Readiness Design

**Date:** 2026-07-20
**Status:** owner-approved conversational design; written specification awaiting owner review
**Program parent:** `docs/superpowers/specs/2026-07-18-stage-7-conditional-training-program-design.md`
**R1 predecessor:** `docs/superpowers/plans/2026-07-18-stage-7-r1-conditional-admission-contract.md`

## 1. Purpose

R2 builds and verifies the isolated safety boundary needed before the program can acquire its first five named public candidates. It defines quarantine containment, bounded NBT decoding, one format adapter, deterministic nine-token preparation, structural fingerprints, append-only readiness events, and synthetic tests.

R2 is a readiness subproject, not a payload operation. It must not download, copy, inspect, parse, prepare, or fingerprint any real public candidate. It must not record a real acquisition approval or turn any candidate into a Dataset or training case.

The selected first-format strategy is deliberately narrow:

- implement one shared fail-closed safety core;
- implement only the Minecraft Java Structure NBT adapter needed by the current first-pilot candidates;
- allow the first five-candidate pilot to use one physical format when those candidates span multiple independent sources and building categories; and
- add later format adapters only through separately reviewed extensions to the same safety interface.

This direction was selected because all 30 current metadata-only review cards describe Java Structure NBT assets or NBT families. The existing `.schematic` and `.schem` decoder does not decode those assets. Implementing unused `.litematic`, `.mcstructure`, or additional schematic adapters in R2 would expand attack surface without improving the first operational pilot.

## 2. Authority and non-authorization

The owner approved the following R2 design sections in conversation on 2026-07-20:

1. scope and architecture;
2. security budgets and rejection policy;
3. geometry preparation and material mapping;
4. fingerprints, duplicate handling, and append-only state transitions; and
5. implementation isolation, synthetic tests, and completion gates.

That approval authorizes writing this specification. It does not yet authorize implementation. After the owner reviews this written specification, a separate R2 implementation plan must be written and approved before source code changes begin.

This specification never authorizes:

- a real candidate download, clone, archive extraction, preview fetch, or payload inspection;
- a real taxonomy, acquisition, duplicate-cluster, quality, Dataset, or split decision;
- a training run, trainer calibration, checkpoint load, model evaluation, generation, or inference;
- processing the 42 deferred oversized private buildings;
- cropping, rescaling, tiling, or automatically assembling any building;
- a change to Dataset v1, v2, or v3;
- a change to Dataset v3's `ready_for_m3_real_data=false` and `training_eligible_count=0` gate;
- a change to normal Node generation, the primary provider, M3, or M4 Apply Mode; or
- pushing, publishing, uploading, sharing, packaging, or exporting any private or public payload, metric, reconstruction, checkpoint, weight, render, or generated output.

All work remains sequential. No parallel agent, concurrent acquisition, or concurrent training is permitted.

## 3. Current evidence and fixed boundaries

The active private lane remains historical local-only evidence and is not an R2 input. At design time its aggregate boundary is:

- 22 active private sources and prepared volumes;
- 42 private oversized files preserved separately;
- a deterministic 15/7 train/validation split; and
- three existing local run directories.

Private filenames, source URLs, raw hashes, prepared hashes, metrics, checkpoints, and outputs remain undisclosed and untouched.

The formal Dataset manifest hashes remain mandatory preflight and postflight assertions:

```text
v1 fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749
v2 af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654
v3 5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082
```

Dataset v3 must remain:

```json
{"ready_for_m3_real_data":false,"training_eligible_count":0}
```

Any Git, ignored-root, private aggregate, formal hash, false/zero gate, or split drift stops R2 before further action.

## 4. Goals and non-goals

### 4.1 Goals

R2 must provide:

- a quarantine-only regular-file boundary below the ignored source-expansion root;
- a bounded, complete-consumption NBT decoder that refuses ambiguous or resource-hostile data;
- an allowlisted Java Structure NBT adapter for independently parseable single structures;
- actual non-air bound validation without crop, scale, tile, or assembly;
- deterministic translation and padding into the approved `64 x 64 x 64` nine-token representation;
- versioned block-material mapping with an explicit unmapped threshold;
- exact-byte, normalized-structure, and near-duplicate fingerprints;
- append-only candidate readiness events with legal transition checks and hash chaining;
- typed, content-safe failure reporting; and
- synthetic normal, boundary, hostile, determinism, and end-to-end tests.

### 4.2 Non-goals

R2 does not provide:

- an HTTP client, Git client, crawler, downloader, archive extractor, or acquisition CLI;
- an operational command capable of bypassing exact named-candidate approval;
- automatic completeness, rights, taxonomy, quality, or legal conclusions;
- jigsaw-pool resolution, multi-file assembly, external asset loading, or dependency fetching;
- `.schematic`, `.schem`, `.litematic`, `.mcstructure`, Bedrock, world-save, or modpack ingestion in the new candidate lane;
- a visual renderer or review pack containing a real structure;
- a candidate snapshot, split assignment, sampling weight, model, trainer, or evaluator; or
- any automatic transition into R3.

## 5. Architecture and data flow

The future single-candidate R3 data flow is:

```text
admission-contract-ready metadata
  -> exact named-batch approval
  -> quarantine-only file receipt
  -> stable file-descriptor read and byte SHA-256
  -> bounded NBT decode
  -> Java Structure NBT validation
  -> scope, completeness-evidence, size, and material checks
  -> deterministic 64^3 preparation
  -> exact and structural fingerprints
  -> append-only pilot audit result
```

R2 implements and tests the pure/local contracts behind that flow using synthetic files under an operating-system temporary directory. R2 never executes the future operational flow against `.local/stage7-source-expansion/`.

The architecture has seven isolated responsibilities:

1. **Candidate boundary** validates the ignored root, quarantine containment, file type, stable file identity, size, and allowed extension.
2. **Bounded NBT decoder** validates compression, resource budgets, NBT grammar, unique compound names, strict strings, and complete byte consumption.
3. **Java Structure adapter** validates one deterministic palette and one independently parseable block volume.
4. **Voxel preparer** computes tight bounds, applies the versioned material mapping, and emits a deterministic nine-token volume.
5. **Fingerprint engine** computes byte, structural, yaw-equivalent, and MinHash signatures without changing retained evidence.
6. **Readiness reducer** permits only legal forward or terminal transitions and never infers human approval.
7. **Readiness store** writes canonical synthetic event records with revisions, previous-event hashes, event hashes, and atomic replacement.

No component may silently call a later component after failure. A caller explicitly passes the validated output from one stage to the next.

## 6. Filesystem and quarantine boundary

Future operational candidate state is contained below:

```text
.local/stage7-source-expansion/
├── quarantine/<candidate-id>/<content-sha256>.nbt
├── prepared/<candidate-id>/<preparation-hash>.voxels.bin
├── manifests/acquisition-events.jsonl
├── manifests/prepared-cases.jsonl
├── fingerprints/structural-fingerprints.jsonl
└── reports/pilots/
```

R2 must not create or write those operational paths. Tests create an equivalent tree below a fresh temporary root and remove it through the test harness.

The boundary accepts only a caller-supplied absolute root that has already passed the source-expansion ignored-root contract. Each candidate path must then pass all of the following checks:

- lexical resolution remains below the exact root;
- canonical `realpath` resolution remains below the exact root;
- every expected parent is a real directory rather than a symbolic link;
- the final entry is a regular file rather than a directory, device, FIFO, socket, or symbolic link;
- the final basename uses the exact lower-case `.nbt` allowlisted extension;
- the file is opened with no-follow semantics where the platform exposes them;
- `lstat`, opened-descriptor `fstat`, and post-read `fstat` identify the same stable file;
- the byte length read matches the stable descriptor size and the configured raw-byte limit; and
- hashing is performed over the same bytes passed to the bounded decoder.

The implementation must not open a path first and validate it later. It validates containment and type, opens the file safely, then reads and hashes through the validated descriptor.

R2 and the first R3 pilot refuse ZIP, TAR, RAR, 7z, JAR, repository clones, directory acquisitions, and archive URLs. R3 may acquire only the exact single `.nbt` asset named in an owner-approved batch record. Archive support would require a new design and approval.

## 7. Resource budgets

The production defaults are conservative for the owner's local computer:

| Budget | Maximum |
| --- | ---: |
| raw `.nbt` bytes | 16 MiB |
| inflated NBT bytes | 64 MiB |
| compression ratio | 200:1 |
| NBT nesting depth | 32 |
| total tags and container entries | 1,500,000 |
| one decoded string | 32 KiB |
| Java Structure `blocks` entries | 262,144 (`64^3`) |
| palette entries | 4,096 |
| block-entity-bearing entries | 16,384 |
| actual non-air extent per axis | 64 |

Tests may inject smaller limits to exercise every refusal without allocating production-size buffers.

The decoder checks declared lengths before allocating or iterating. A list or array whose declared work would exceed any remaining byte, node, or container budget fails immediately. gzip or zlib inflation uses a hard output limit; crossing it terminates decode. After inflation, the decoder also checks the configured compression-ratio limit.

No resource failure falls back to unbounded parsing, a larger limit, a different decoder, or partial data.

## 8. Bounded NBT decoding contract

R2 adds an isolated Stage 7 decoder rather than changing the behavior of the existing general `src/construction/templates/nbt.js` parser. This avoids altering the private research path, existing Schematic analysis, or normal Node generation.

The bounded decoder accepts only a `Buffer` plus an explicit immutable budget object. It supports the standard NBT scalar, array, list, and compound tag types needed by Java Structure NBT. It must:

- recognize gzip, zlib, or uncompressed NBT by bytes rather than trusting the filename;
- reject other compression and container formats;
- require a Compound root;
- enforce depth, decoded-byte, node, container-entry, string, list, and array budgets before work;
- decode strings as strict UTF-8 and reject invalid sequences;
- reject negative lengths, impossible lengths, unknown tag types, malformed list element types, premature termination, and integer overflow;
- reject duplicate field names within one Compound rather than silently overwriting them;
- consume the complete inflated input and reject non-NBT trailing bytes; and
- return immutable values or a read-only interface so later stages cannot mutate parsed evidence.

The decoder never interprets or executes a string, command, entity payload, block-entity payload, data component, function, loot table, or external reference. Content-safe errors expose only a standard reason code, stage, candidate ID, counts, dimensions, hashes, and path basename.

## 9. Java Structure NBT adapter

The first adapter accepts the ordinary Minecraft Java Structure NBT shape with:

- one `size` list containing three positive integer dimensions;
- one `palette` list of Compound entries;
- one `blocks` list of Compound entries; and
- optional `entities` and per-block `nbt` data that are counted but never exported into the voxel representation.

Each palette entry must contain a valid block resource identifier and may contain a bounded property Compound of scalar strings. Each block entry must contain:

- a palette `state` integer in range;
- one three-integer `pos` coordinate; and
- at most one optional bounded block-entity Compound.

All coordinates must be non-negative and fall within the declared `size`. Duplicate coordinates are rejected when they conflict. Identical duplicate coordinates are also refused as ambiguous input rather than silently collapsed. The adapter must not allocate a dense array based on an untrusted declared size; it validates the bounded block list first.

The first adapter refuses or defers:

- the alternative multi-palette representation;
- a missing or empty required field;
- an all-air structure;
- an out-of-range coordinate or palette reference;
- jigsaw or structure-block dependencies;
- any need to load a template pool, processor list, second structure, data pack, mod asset, or external file; and
- evidence that the file is a room, basement, component, fragment, or other module rather than an independent structure.

The adapter can prove that one file is independently parseable. It cannot prove visual or semantic completeness. R1 metadata and a later R3 human review remain mandatory. Known module candidates remain deferred.

Command-block identifiers produce a safe-review deferral. Their command data is neither returned in reports nor interpreted. Entities and block entities do not become training channels; only their corresponding placed block identifier may affect the nine-token voxel.

## 10. Geometry validation and preparation

The adapter computes the minimum and maximum coordinate of every non-air block. Those actual non-air bounds, not the public metadata dimensions or raw NBT `size`, control admission.

Preparation follows these rules:

- discard only empty source padding outside the tight non-air bounds;
- preserve every non-air coordinate relationship and material token;
- reject an empty structure;
- set `deferred_oversized_public` when any actual extent exceeds 64;
- keep public oversized candidates separate from the 42 private oversized buildings;
- never crop a non-air block;
- never scale, resample, tile, split, infer, complete, merge, or assemble a structure;
- never rotate the retained source evidence; and
- deterministically translate the tight volume into `64 x 64 x 64` using
  `offset = floor((64 - extent) / 2)` independently on X, Y, and Z.

Removing pure-air source margins is canonical translation, not building crop. The original declared dimensions, actual tight bounds, source orientation, and translation offsets remain in the local metadata.

Given identical source bytes, parser version, adapter version, mapping version, and preparation version, the output bytes and all hashes must be identical across repeated runs. Training-time yaw augmentation remains a later in-memory R4/R6 concern and never creates a new source case or split member.

## 11. Nine-token material mapping

R2 preserves the approved representation:

| Token | Meaning |
| ---: | --- |
| 0 | air |
| 1 | earth |
| 2 | rock or masonry |
| 3 | wood |
| 4 | glass |
| 5 | stairs or slabs |
| 6 | architectural detail |
| 7 | water |
| 8 | other or unmapped |

All palette identifiers must first resolve as valid resource identifiers. A versioned mapping registry assigns exact identifiers or explicitly reviewed identifier families to a token. `minecraft:*` mappings use reviewed rules. Mod-namespace identifiers require an explicit reviewed mapping before they may become tokens 1 through 7.

Name fragments may generate a review suggestion, but an unreviewed heuristic never becomes a final mapping rule. Unknown identifiers become token 8 and remain visible in aggregate local counts. No error or Markdown report prints embedded block-entity data.

The preparation gate is:

- 100 percent of referenced palette indices resolve to valid identifiers; and
- token 8 occupies no more than 10 percent of non-air voxels.

If token 8 exceeds 10 percent, preparation stops with a mapping deferral and produces no formal prepared artifact. A later reviewed mapping revision may allow a new preparation revision; it may not rewrite an old result.

Every prepared record binds:

- raw byte SHA-256;
- declared and actual dimensions;
- translation offsets and source orientation;
- all nine token counts and proportions;
- mapped and token-8 voxel counts;
- mapping version and mapping SHA-256;
- parser, adapter, and preparation versions; and
- prepared voxel SHA-256.

R2 creates such records only for synthetic fixtures in temporary roots.

## 12. Fingerprints and duplicate handling

### 12.1 Raw-byte identity

`content_sha256` hashes the exact validated file bytes. An equal hash is an exact duplicate and becomes `rejected_duplicate`. Candidate name, URL, source project, or filename differences do not override byte identity.

### 12.2 Normalized structural identity

The structural serializer contains sorted tight-bound-relative non-air coordinates and nine-token values. It excludes source padding, NBT Compound order, file metadata, entities, and block-entity payloads. It produces:

- one source-orientation structure SHA-256; and
- four deterministic yaw-view SHA-256 values, with the lexicographically lowest retained as the yaw-canonical structural hash.

Yaw views exist only for duplicate analysis. They do not rotate or replace the retained prepared volume. Equal structural hashes with different raw bytes create a strong near-duplicate proposal; only raw-byte equality causes automatic duplicate rejection.

### 12.3 Near-duplicate MinHash

The fingerprint engine creates 128-value MinHash signatures for:

- the tight-bound-relative occupied-coordinate set; and
- the tight-bound-relative `(coordinate, token)` set.

It computes those signatures for four horizontal yaw views without scaling, tiling, resampling, or processing an oversized structure. Fixed seeds derive from the fingerprint-version identifier. LSH uses 32 bands of four values to propose candidate comparisons as the corpus grows.

A pair becomes `near_duplicate_proposed` when the best yaw comparison estimates:

- occupancy similarity of at least 0.85; and
- material-aware similarity of at least 0.75.

That result is evidence, not a decision. A human reviewer must confirm or reject the relationship through an append-only event. A confirmed cluster receives a stable ID derived from its first confirmed relationship. Later members do not rename it. A later cluster merge adds a superseding merge event and keeps earlier IDs as aliases.

Confirmed cluster members must never cross a future Dataset split. They count toward the approved near-duplicate cap. R2 does not assign a split or sampling weight; R5 will apply the snapshot policy and reduced-weight rule.

## 13. Readiness state machine

The program-level canonical path remains:

```text
metadata_discovered
  -> rights_verified
  -> human_accepted
  -> named_batch_approved
  -> acquired_quarantine
  -> format_validated
  -> completeness_validated
  -> taxonomy_reviewed
  -> duplicate_clustered
  -> quality_reviewed
  -> training_candidate
  -> split_locked
```

R1's `admission_contract_ready` is metadata-only evidence that a candidate may be proposed for a future named batch. It does not create `named_batch_approved`.

R2 introduces evidence events between canonical states without changing their meaning:

```text
admission_contract_ready
  -> named_batch_approved              [owner-only, future R3]
  -> acquired_quarantine               [future R3]
     -> bytes_verified
  -> format_validated
     -> structure_validated
  -> completeness_validated            [includes future human confirmation]
     -> prepared
     -> fingerprinted
  -> duplicate_clustered               [includes human near-duplicate decision]
  -> pilot_ready                        [R3 report status only]
```

`pilot_ready` does not equal `training_candidate`, Dataset admission, or split assignment. The later canonical `quality_reviewed` and `training_candidate` transitions remain outside R2 and R3 readiness output.

Failure is terminal for automation and uses the parent-program states:

- rights ambiguity or revocation: `deferred_rights`;
- module, fragment, or external assembly: `deferred_incomplete`;
- actual extent above 64: `deferred_oversized_public`;
- parser, type, containment, resource, or material failure: `quarantined_technical` with a safe reason code;
- exact byte duplicate: `rejected_duplicate`;
- low label confidence: `deferred_label`; and
- failed human quality review: `rejected_quality`.

Command-block presence uses `quarantined_technical` with a `SECURITY_REVIEW_REQUIRED` reason until an explicit later human decision. No terminal state automatically deletes, repairs, retries, reacquires, substitutes, relabels, or relaxes a candidate.

Every forward transition requires exactly the previous legal state and its evidence hash. No API may infer owner or human approval. R2 tests synthetic transitions but cannot append an operational `named_batch_approved` event.

## 14. Append-only event and artifact contracts

Each readiness event contains at least:

```text
schema_version
candidate_id
revision
event_type
state_before
state_after
recorded_at
recorded_by
reason_codes
evidence_hashes
previous_event_sha256
event_sha256
synthetic_only
authorizes_acquisition
authorizes_training
authorizes_dataset_admission
```

R2 records always declare:

```text
synthetic_only=true
authorizes_acquisition=false
authorizes_training=false
authorizes_dataset_admission=false
```

Canonical JSON serialization excludes `event_sha256` while computing that field and binds every other field. Revisions begin at one, increase contiguously per candidate, and must have exactly one latest record. Store writes use a sibling temporary file, descriptor sync, atomic replacement, and parent-directory sync where supported. A revision or previous-hash race fails rather than overwriting.

Prepared and fingerprint records are content-addressed. The operational R3 design will decide retention and owner-visible audit commands. R2 does not add a real-payload CLI.

## 15. Error model

All R2 boundary, parser, adapter, preparation, fingerprint, and state failures use one typed error family containing:

```text
code + stage + candidate_id + safe_detail
```

`safe_detail` is a structured allowlist, not an arbitrary caught exception string. It may contain:

- a path basename;
- a byte, tag, list, palette, block, or entity count;
- declared or actual dimensions;
- an allowlisted format name;
- a hash; or
- an expected and observed state name.

It must not contain:

- NBT string values other than an already validated block resource identifier where a local JSON record explicitly requires it;
- command, entity, block-entity, loot, text, sign, book, or external-reference content;
- raw byte excerpts;
- a private filename, URL, hash, metric, or artifact; or
- an absolute path in an owner-facing report.

Errors are stable reason codes suitable for tests and aggregate audits. No catch block converts a refusal into a warning or partial success.

## 16. Proposed implementation isolation

The later implementation plan should keep R2 in focused modules beside the existing Stage 7 learning contracts:

- `src/construction/learning/stage7CandidateBoundary.js`
- `src/construction/learning/stage7BoundedNbt.js`
- `src/construction/learning/stage7VanillaStructureNbt.js`
- `src/construction/learning/stage7ConditionalVoxelPreparation.js`
- `src/construction/learning/stage7ConditionalFingerprint.js`
- `src/construction/learning/stage7CandidateReadinessState.js`
- `src/construction/learning/stage7CandidateReadinessStore.js`

The detailed plan may adjust names to match established repository conventions, but it must preserve the responsibility boundaries. It must not modify the existing generic NBT parser, private research corpus, private trainer, formal Dataset readers or manifests, normal provider path, or M4.

R2 adds no runtime or development dependency. It uses Node 24.18.0 built-ins for filesystem containment, cryptographic hashing, compression, strict text decoding, canonical records, and tests.

## 17. Synthetic test strategy

### 17.1 Boundary tests

Synthetic temporary roots cover:

- valid in-root regular files;
- lexical and canonical path escape;
- final and parent symbolic links;
- directory and non-regular final entries where supported;
- disallowed extension and disguised archive bytes;
- raw-size refusal; and
- stable-identity mismatch around an opened descriptor.

### 17.2 Bounded NBT tests

Programmatically generated fixtures cover:

- valid gzip, zlib, and uncompressed roots;
- invalid compression, root type, tag type, UTF-8, and duplicate Compound names;
- truncated and trailing bytes;
- negative, impossible, or over-budget strings, arrays, lists, tags, and containers;
- nesting-depth and total-node refusal;
- inflated-byte and compression-ratio refusal; and
- huge declared lengths rejected before allocation or iteration.

### 17.3 Java Structure adapter tests

Fixtures cover:

- a minimal complete single structure;
- optional entities and bounded block-entity data ignored safely;
- missing `size`, `palette`, or `blocks`;
- empty, multi-palette, out-of-bounds, duplicate-coordinate, and palette-index failures;
- jigsaw, structure-block, command-block, module, and external-dependency deferral evidence; and
- actual bounds independent of empty declared padding.

### 17.4 Preparation tests

Fixtures cover:

- exact X/Y/Z centering for even and odd slack;
- repeated deterministic byte identity;
- no non-air loss;
- exact `64 x 64 x 64` byte length and token range;
- each nine-token mapping class;
- valid resource identifiers and mod namespaces;
- token-8 ratios immediately below, at, and above 10 percent;
- axis extents 1, 64, and 65; and
- refusal without a prepared artifact on any blocker.

### 17.5 Fingerprint tests

Fixtures prove:

- raw-byte equality despite different candidate metadata;
- normalized equality despite NBT field order or empty padding differences;
- source-orientation preservation;
- yaw-canonical equality for horizontal rotations;
- strong proposals for controlled light variants;
- no proposal for clearly unrelated structures;
- deterministic 128-value signatures and LSH buckets; and
- no scale, resample, tile, or oversized input path.

### 17.6 State and store tests

Fixtures cover:

- every legal transition;
- skipped, reversed, repeated, or approval-inferred transitions;
- terminal failure behavior;
- contiguous revision and unique-latest requirements;
- previous-event and event hash validation;
- tamper detection;
- atomic replacement failure behavior; and
- mandatory non-authorizing markers.

### 17.7 End-to-end synthetic test

One test runs a synthetic `.nbt` file through:

```text
temporary quarantine
  -> stable read and hash
  -> bounded decode
  -> adapter validation
  -> deterministic preparation
  -> fingerprints
  -> synthetic audit events
```

It asserts exact output hashes across two runs and asserts that no file was written outside the temporary root.

## 18. Verification and R2 completion gate

Implementation is not complete until all of the following are freshly verified in sequence:

1. focused R2 unit and integration tests pass;
2. the complete Node test suite passes with pinned Node 24.18.0;
3. the complete Stage 7 Python test suite passes;
4. Dataset v1/v2/v3 hashes match the fixed values in this document;
5. Dataset v3 remains false/zero;
6. private aggregate counts remain 22 active, 42 deferred oversized, 22 source records, 22 prepared records, 22 `64^3` binaries, 15/7 split, and three existing run directories;
7. `.local/stage7-source-expansion/` contains no new real payload or prepared artifact from R2;
8. Git contains only the approved R2 plan, source, synthetic tests, and boundary documentation;
9. no real taxonomy, acquisition, parsing, duplicate, Dataset, split, training, publication, or export action occurred; and
10. the completion report gives aggregate counts and formal hashes without exposing content.

Any failure stops execution. The implementation may fix an R2 test or code defect through the reviewed plan, but it may not weaken a limit, omit a boundary test, touch the private lane, or advance to R3 automatically.

## 19. R3 owner gate

R2 completion only proves local parser and boundary readiness with synthetic evidence. The next operational proposal must:

1. identify exactly five candidates by stable candidate ID and canonical single-file URL;
2. use only `admission_contract_ready` candidates;
3. revalidate rights immediately before acquisition;
4. span multiple independent source projects and building categories;
5. allow all five to be Java Structure NBT in this first pilot;
6. record their expected scope, format, completeness evidence, and known mod dependency risk;
7. obtain a new explicit owner approval for those exact five assets; and
8. acquire and validate them sequentially under a separately reviewed R3 plan.

No approval of this R2 design is approval of those candidates. No R3 result is training authorization. Real training still requires the later program gates plus a new literal owner-approved device and positive optimizer-step budget for each run.

## 20. Next step

After owner review of this written specification, use the `superpowers:writing-plans` workflow to create the detailed R2 implementation plan only. The plan must use test-driven development, sequential task execution, explicit verification checkpoints, and one narrowly scoped commit per completed task. It must stop after R2 completion and must not nominate, acquire, or parse the real five-candidate pilot.
