# Stage 7 R3 Five-Candidate Public NBT Pilot Design

**Date:** 2026-07-20
**Status:** owner-approved conversational design; written specification awaiting owner review
**Program parent:** `docs/superpowers/specs/2026-07-18-stage-7-conditional-training-program-design.md`
**R2 predecessor:** `docs/superpowers/specs/2026-07-20-stage-7-r2-acquisition-parser-readiness-design.md`

## 1. Purpose

R3 is the first bounded operational pilot for public Minecraft Java Structure NBT candidates. It must end with exactly five locally retained `pilot_ready` samples that prove the R2 quarantine, parser, preparation, and fingerprint path works across multiple independent sources and building categories.

R3 optimizes for parser reliability before aesthetic rank. A candidate must be an exact, independently parseable, single-file `.nbt` asset with no jigsaw assembly, missing components, or external mod dependency. The final five must cover at least four independent sources and four building types. Their labels remain separate evidence; cross-category parser validation does not authorize mixing unlike buildings in one training distribution.

R3 is not Dataset admission or training. It does not create a split, choose sampling weights, train a model, evaluate a checkpoint, generate a structure, or change an existing production path.

## 2. Owner decisions and authority

The owner approved the following decisions in conversation on 2026-07-20:

1. parser reliability is the first-pilot objective;
2. the five accepted samples should span building categories and independent sources;
3. only clearly scoped open licenses may pass the rights gate;
4. the approval slate contains five primary candidates plus three exact named reserves;
5. R3 succeeds only after five of five samples pass every machine and human gate;
6. candidate selection uses a gate-first funnel rather than aesthetic-first or source-quota-first selection; and
7. the six design sections covering stages, candidate records, isolated processing, acceptance, tools, and execution are approved.

This approval authorizes writing and committing this design specification only. It does not authorize implementation, network acquisition, payload inspection, or processing a real candidate. After the owner reviews this written specification, a separate implementation plan must be written and approved. The later exact 5+3 candidate slate requires another explicit owner approval before any `.nbt` payload is requested.

## 3. Non-authorization and fixed boundaries

R3 never authorizes:

- a download before both the R3 implementation gate and exact named-batch approval;
- a repository clone, directory acquisition, archive download, archive extraction, dependency fetch, authenticated source, or recursive crawl;
- acquisition of a candidate outside the approved 5+3 slate;
- automatic substitution of a candidate or automatic expansion of the candidate pool;
- processing, tiling, cropping, rescaling, splitting, or assembling any oversized or modular building;
- processing any of the 42 deferred oversized private buildings;
- a change to Dataset v1, v2, or v3;
- a change to Dataset v3's `ready_for_m3_real_data=false` and `training_eligible_count=0` gate;
- a change to normal Node generation, the primary provider, M3, M4, or M4 Apply Mode;
- a training run without a later new literal owner-approved device and positive optimizer-step budget; or
- pushing, publishing, uploading, sharing, packaging, or exporting any private data, metric, reconstruction, checkpoint, weight, output, public payload, prepared volume, or fingerprint.

All operational payload and candidate-derived state remains below the ignored `.local/stage7-source-expansion/` root. All work remains sequential. No parallel agent, concurrent acquisition, or concurrent training is permitted.

## 4. Preserved baseline and mandatory drift stop

The formal Dataset manifest SHA-256 values remain:

```text
v1 fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749
v2 af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654
v3 5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082
```

Dataset v3 must remain:

```json
{"ready_for_m3_real_data":false,"training_eligible_count":0}
```

The private lane remains outside R3. Its aggregate baseline is 22 active sources, 42 deferred oversized sources, 22 source records, 22 prepared records, 22 prepared `64^3` binaries, a 15/7 train/validation split, and three existing local run directories. Private filenames, URLs, source hashes, prepared hashes, losses, metrics, checkpoints, reconstructions, weights, and output remain undisclosed and untouched.

At R3 design time, the operational public lane contains zero quarantine payload files, zero prepared files, and zero fingerprint files. Before each mutation and after each real-candidate operation, R3 must verify Git state, ignored-root containment, private aggregate and preflight state, the three formal Dataset hashes, and the v3 false/zero gate. Any unaccounted drift stops execution before further network or payload action.

## 5. Stage gates

R3 is divided into six ordered stages:

1. **Candidate discovery:** inspect only public pages, repository trees, licenses, immutable revisions, and metadata. Do not request `.nbt` payload bytes.
2. **Gate-first screening:** reject unclear license scope, mutable-only identity, missing exact `.nbt` path, modular or jigsaw evidence, external mod dependency, and weak standalone evidence.
3. **Owner review package:** produce five primary and three exact named reserve records with preview links, evidence, rank, and risk. Stop for owner review.
4. **Isolated acquisition and parsing:** after exact approval, acquire and process one primary candidate at a time below `.local/stage7-source-expansion/`.
5. **Controlled reserve activation:** activate only the approved reserve linked to a primary that reached a terminal failure state.
6. **Five-of-five audit:** finish only when exactly five candidates are `pilot_ready` and every attempted candidate has a complete append-only result.

License drift, immutable-revision drift, path drift, baseline drift, or approval mismatch stops the flow. Passing one stage never implicitly authorizes the next owner-gated stage.

## 6. Candidate discovery and selection contract

### 6.1 Hard discovery gates

A proposed candidate must have:

- one stable candidate ID;
- an independent public source project;
- an immutable commit SHA or immutable release version;
- one exact lower-case `.nbt` relative path and corresponding canonical single-file URL;
- an open license whose evidence at the same immutable revision clearly covers the candidate asset, permits download, reproduction, modification, and use, and contains no restriction incompatible with the intended future local machine-learning training use;
- public preview or description evidence sufficient for the owner to review quality and identity;
- evidence that the file represents an independently parseable building rather than a room, basement, fragment, or jigsaw component; and
- no declared external mod, asset, processor-list, template-pool, world-save, or multi-file dependency.

Sources with display-only terms, no-derivatives conditions, unclear file coverage, or other unresolved use restrictions fail closed. R3 records evidence and obligations; it does not manufacture a legal conclusion when the source is ambiguous.

### 6.2 Candidate record

Every primary and reserve record includes:

- candidate ID, display title, source project, source URL, immutable revision, exact relative path, and canonical file URL;
- building function, form, style, scale, environment, source series, and a flag for any unknown label;
- license identifier, same-revision evidence URL, asset-scope explanation, obligations, verification time, and evidence hash;
- dated public quality evidence such as downloads, stars, ratings, maintenance status, and preview links;
- standalone, vanilla compatibility, module, jigsaw, and dependency evidence with explicit confidence and risk notes;
- normalized selection scores and reasons;
- primary or reserve role and an exact primary-to-reserve relationship; and
- the owner's explicit `approve` or `reject` decision with optional notes.

Unknown metadata remains `unknown`; automation must not infer an author, license scope, building type, or completeness conclusion.

### 6.3 Gate-first rank

Only candidates that pass the hard rights and identity gates receive a rank:

| Component | Weight |
| --- | ---: |
| Independent parsing and vanilla compatibility confidence | 45% |
| Verifiable quality and popularity | 30% |
| Contribution to building-type and source diversity | 15% |
| Source stability and reproducibility | 10% |

The selected 5+3 slate must satisfy:

- at least four independent source projects and four building types among the five primaries;
- no more than two primaries from one source;
- no more than two primaries of one building type;
- no attempt to count modules from one family as independent diversity; and
- exactly three primaries have one specifically named, same-category reserve each; a reserve binds to only that primary and cannot fill an unrelated slot.

The current 30-card metadata set is a discovery input, not an acquisition authority. Its rights, versions, paths, format, and standalone evidence must be refreshed before a candidate can enter the 5+3 approval package.

## 7. Exact named-batch approval

The local approval manifest contains exactly five primaries and three reserves. Each entry binds the fields in Section 6, and the manifest binds its complete ordered candidate set, schema version, evidence hashes, creation time, and owner approval record.

The batch validator must reject:

- an absent, ambiguous, or differently scoped owner approval;
- a candidate, source revision, path, URL, role, or primary-to-reserve relationship not covered by that approval;
- duplicate IDs, duplicate exact paths, mutable revisions, non-HTTPS file URLs, or non-`.nbt` targets;
- more or fewer than five primaries and three reserves;
- a slate that violates source or type diversity; or
- a claim that approval authorizes training, Dataset admission, publication, or export.

The manifest does not contain a payload SHA-256 before acquisition. Immutable source revision plus exact path defines pre-acquisition identity; the validated byte SHA-256 is appended after receipt. The real-payload command always requires one explicit candidate ID and has no process-all mode.

## 8. Minimal acquisition boundary

After named-batch approval, the acquisition component may request only the selected candidate's exact canonical `.nbt` URL. It must:

- use HTTPS without credentials, cookies, tokens, or interactive authentication;
- pin the approved immutable revision and exact path;
- accept redirects only when the resulting HTTPS host and full target remain within the candidate's explicitly approved redirect policy;
- enforce the 16 MiB raw limit while streaming, including when `Content-Length` is absent, and reject a declared or observed overflow before unbounded buffering;
- refuse archives, HTML error bodies, repositories, directories, content-type or magic mismatches, and extra companion files;
- write only to a new temporary file inside the approved candidate quarantine directory;
- validate containment, type, stable identity, byte length, and hash through the existing R2 boundary before atomic placement; and
- record a safe receipt without exposing payload contents.

The component has no clone, archive, recursion, authentication, upload, or general URL mode. A network error or validation error is terminal for that attempt and cannot fall back to another source or decoder.

## 9. Per-candidate processing flow

Each approved primary is processed serially:

1. rerun Git, private, Dataset, ignored-root, and public-lane preflight;
2. revalidate license evidence, immutable revision, exact path, and named-batch binding on the acquisition date;
3. acquire the single approved file into quarantine;
4. record the validated raw byte SHA-256 and safe receipt;
5. run the existing R2 bounded NBT decoder;
6. validate the single Java Structure NBT contract;
7. validate standalone/completeness evidence and actual non-air bounds;
8. map materials and prepare the deterministic centered `64^3` volume;
9. compute exact, structural, yaw-equivalent, and MinHash fingerprints;
10. repeat parsing and preparation and require identical bytes and hashes;
11. perform human completeness, label, quality, and near-duplicate decisions; and
12. append the resulting state, then rerun the complete postflight before selecting the next candidate.

No stage silently calls a later stage after failure. Failed payloads remain quarantined for audit and are not automatically deleted, repaired, reacquired, remapped, or reinterpreted.

## 10. Machine acceptance gates

R3 preserves the implemented R2 budgets and semantics:

| Gate | Maximum or rule |
| --- | --- |
| Raw `.nbt` bytes | 16 MiB |
| Inflated NBT bytes | 64 MiB |
| Compression ratio | 200:1 |
| NBT nesting depth | 32 |
| Total tags and container entries | 1,500,000 |
| One decoded string | 32 KiB |
| Java Structure block entries | 262,144 (`64^3`) |
| Palette entries | 4,096 |
| Block-entity-bearing entries | 16,384 |
| Actual non-air extent | at most 64 on each axis |
| Token 8 proportion | at most 10% of non-air voxels |

The candidate must also:

- be a completely consumed gzip, zlib, or uncompressed Compound-root Java Structure NBT;
- contain one valid `size`, one palette, and one unambiguous block list;
- have valid resource identifiers, coordinates, palette references, and unique positions;
- be non-empty and require no external structure, pool, processor, mod, or asset;
- contain no jigsaw or structure-block dependency;
- pass command-block security review rather than being admitted automatically;
- preserve every non-air relationship without crop, rotation, scale, tile, split, or assembly; and
- reproduce byte-identical prepared output and identical fingerprints on repeated processing.

Unknown identifiers map to token 8. Exceeding the 10 percent limit creates a mapping deferral and produces no formal prepared artifact. No limit may be increased inside R3 to make a candidate pass.

## 11. Duplicate and human acceptance gates

Equal raw byte SHA-256 is an exact duplicate and is rejected automatically. Structural and yaw fingerprints support comparison without changing the retained source orientation. A pair becomes a near-duplicate proposal when its best yaw comparison estimates both:

- occupancy similarity of at least 0.85; and
- material-aware similarity of at least 0.75.

A near-duplicate proposal is evidence only. A human must accept or reject the relationship.

After all machine gates pass, the human review must confirm that:

- the single file represents a semantically complete building rather than a module;
- public preview evidence and acquired candidate identity are consistent;
- function, form, style, scale, and environment labels are justified or explicitly unknown;
- the sample meets the pilot's quality floor; and
- any near-duplicate relationship has an explicit decision.

Only a candidate with complete machine evidence and explicit human decisions can enter `pilot_ready`. That state does not mean `training_candidate`, Dataset membership, split membership, or training eligibility.

## 12. Reserve activation and failure states

A primary must first reach a terminal failure state before its linked reserve can be activated explicitly. Activation requires a fresh preflight and the exact reserve's existing owner approval. A reserve cannot be swapped between categories or used to exceed the approved 5+3 scope.

Failure states remain compatible with R2:

- rights ambiguity or change: `deferred_rights`;
- module, fragment, or external assembly: `deferred_incomplete`;
- actual non-air extent above 64: `deferred_oversized_public`;
- containment, transport, parser, type, resource, command-block, or material failure: `quarantined_technical` with a safe reason code;
- exact byte duplicate: `rejected_duplicate`;
- unresolved label: `deferred_label`; and
- failed human quality review: `rejected_quality`.

If a primary and its applicable approved reserve cannot produce the required slot, R3 stops and returns to a new metadata-only candidate design and approval. It does not lower a threshold or search automatically.

## 13. Implementation architecture

R3 adds four isolated responsibilities beside the existing R2 modules:

1. **Named-batch validator:** validates exact candidates, evidence bindings, roles, diversity, and owner authority.
2. **Minimal HTTPS receiver:** retrieves only one approved immutable `.nbt` URL under strict transport and byte budgets.
3. **R2 pilot orchestrator:** explicitly passes one validated artifact through the existing boundary, decoder, adapter, preparer, fingerprint, and event interfaces.
4. **Local audit reporter:** emits content-safe per-candidate and aggregate results.

The implementation plan may adjust filenames to repository conventions, but it must not weaken those boundaries. Existing R2 parsing, preparation, and fingerprint semantics should be reused rather than forked. No existing generic NBT parser, private-research module, Dataset reader/writer, provider, M3, M4, trainer, or generator path may be changed to accept R3 payloads.

The future local state is contained below:

```text
.local/stage7-source-expansion/
├── quarantine/<candidate-id>/<content-sha256>.nbt
├── prepared/<candidate-id>/<preparation-hash>.voxels.bin
├── fingerprints/structural-fingerprints.jsonl
├── manifests/named-batch.json
├── manifests/acquisition-events.jsonl
├── manifests/prepared-cases.jsonl
└── reports/pilots/
```

Temporary writes remain below the same root, use fixed safe names, and are committed with atomic replacement. Unexpected files, links, path escapes, approval mismatches, or event-chain races block progress.

Tracked Git content may contain only the approved design, implementation plan, source code, synthetic fixtures generated by tests, tests, and boundary documentation. It must not contain a real approval manifest, candidate payload, prepared volume, fingerprint, candidate-derived render, or real-pilot report.

## 14. Event and reporting contract

R3 uses R2's append-only, hash-chained readiness events. Operational records set `synthetic_only=false`, but authority flags remain false unless the exact owner-gated transition is represented. `pilot_ready` must always retain:

```text
authorizes_training=false
authorizes_dataset_admission=false
```

The owner-visible report may contain:

- candidate ID and public display title;
- source project, building category, and approval role;
- stage and stable reason code;
- byte count and validated hashes;
- declared and actual dimensions;
- nine aggregate token counts and proportions;
- exact or near-duplicate decision;
- mapping, parser, adapter, preparation, and fingerprint versions; and
- preflight/postflight pass status.

It must not contain raw NBT bytes, byte excerpts, command data, sign or book text, entity or block-entity payloads, generated reconstructions, an absolute private path, or any private-lane identifier, URL, hash, metric, or artifact.

## 15. Synthetic-first test strategy

Before any candidate discovery is converted into an approval slate, the implementation must pass synthetic tests using temporary roots, generated `.nbt` files, and local mocked transport. Tests must cover:

- exact 5+3 manifest structure, diversity, role, primary-to-reserve, evidence, immutable-revision, and approval validation;
- missing, altered, replayed, or over-broad owner approval;
- explicit one-candidate selection and the absence of a process-all path;
- allowed exact URL receipt, byte streaming, safe redirects, refused cross-policy redirects, truncation, timeout, non-NBT, archive, HTML, and raw-byte overflow;
- all existing R2 boundary, decoder, adapter, preparation, fingerprint, and state cases;
- refusal to activate a reserve before its primary reaches a terminal state;
- interruption before receipt, after quarantine, and between processing events;
- deterministic retry that resumes only from validated state without overwriting evidence;
- content-safe errors and reports;
- no write outside the temporary public root; and
- unchanged private, Dataset, provider, M3, M4, and generation boundaries.

The complete Node suite and complete Stage 7 Python suite must pass after focused tests. No real network test or real payload is required to prove implementation readiness.

## 16. Operational execution sequence

After this design is reviewed:

1. write and obtain approval for a detailed R3 implementation plan;
2. implement the isolated tools with test-driven development and synthetic data only;
3. run focused, full Node, full Python, Git, private, Dataset, and public-lane zero-payload verification;
4. refresh metadata-only evidence and build the exact 5+3 review package;
5. stop and obtain the owner's explicit approval for those exact eight assets;
6. revalidate all evidence and process one primary candidate;
7. postflight and report its safe result before processing the next primary;
8. activate an approved reserve only after an eligible primary terminal failure;
9. repeat until five samples are `pilot_ready` or the approved slate is unable to reach five; and
10. run the completion audit and stop at R3.

The owner can interrupt between candidates. Resume requires the same approved code, batch hash, evidence bindings, and complete fresh preflight. R3 never runs concurrently with a private training mutation or another candidate acquisition.

## 17. Completion gate

R3 completes only when fresh evidence proves all of the following:

1. exactly five candidates are `pilot_ready`;
2. those five span at least four source projects and four building types;
3. every attempted primary and reserve has a complete hash-chained result;
4. every retained prepared sample passes the exact machine and human gates;
5. repeated processing produces identical prepared bytes and fingerprints;
6. every unactivated reserve remains unacquired;
7. all failed payloads remain only in quarantine with terminal safe records;
8. the full Node and Stage 7 Python suites pass;
9. private aggregates and preflight remain unchanged;
10. Dataset v1/v2/v3 hashes and the v3 false/zero gate remain unchanged;
11. normal Node generation, the primary provider, M3, and M4 remain unchanged;
12. Git contains no real candidate-derived artifact; and
13. no training, Dataset admission, split, publication, upload, package, export, or generated output occurred.

If the approved 5+3 slate cannot yield five accepted samples, R3 is incomplete. The result is an evidence-backed stop, not permission to relax gates or select more candidates.

## 18. Next owner gates

After the owner reviews this written specification, use the `superpowers:writing-plans` workflow to produce the detailed R3 implementation plan. The plan must preserve synthetic-first development, sequential execution, explicit checkpoints, test-driven implementation, and narrow commits.

Approval of the implementation plan will still not authorize a real acquisition. After synthetic readiness is complete, the owner must separately review and approve the exact 5+3 candidate package. R3 must stop again after the five-of-five pilot report. Any taxonomy admission, Dataset construction, split design, category-conditioned training, or new training run belongs to a later separately designed and owner-approved stage.
