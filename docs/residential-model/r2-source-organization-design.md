# R2 Source Organization Design

## Status

Approved design checkpoint for the R2 source-intake milestone.

This document supplements the residential model master design. It decides how
newly collected structures and the repository's legacy templates are organized
before parsing, eligibility review, annotation, or training. It does not
implement the intake tooling.

## 1. Decision

Use two physical intake lanes and keep detailed classification in metadata:

```text
.local/residential-model/inbox/
  <batch-id>/
    batch-manifest.json
    houses/
    other-architecture/
```

- `houses/` contains structures that the collector believes are complete
  residential-house candidates.
- `other-architecture/` contains excellent non-residential structures worth
  preserving as architectural references.
- Style, period, size, material palette, building subtype, and similar
  properties do not create additional physical folders. They become reviewed
  metadata in later milestones.

The residential program remains house-first. A file's physical lane records
the collector's intent; it does not determine training eligibility.

## 2. Goals

The organization must:

- make it fast for the owner to collect hundreds of promising structures;
- keep the first 50-100 golden houses easy to identify and review;
- preserve exceptional non-residential architecture without contaminating the
  residential training set;
- avoid repeated moves and duplicate copies when a structure has several
  styles or roles;
- retain provenance and license information next to every downloaded
  candidate;
- admit the existing 64 templates through the same evidence-based review;
- preserve immutable original bytes after intake; and
- provide deterministic boundaries for later parsing, annotation, snapshot,
  split, and training stages.

## 3. Non-goals

R2 source organization does not:

- search websites or download structures automatically;
- scrape pages or infer permission to use a file;
- label rooms, objects, decorations, or architectural style;
- repair, crop, rescale, rotate, or edit source structures;
- decide golden-set membership;
- create training, validation, or test splits;
- add non-residential examples to residential training;
- move or reorganize the existing `mc_templates/` tree; or
- train or select a model.

Those responsibilities remain in their later milestones.

## 4. Alternatives considered

### 4.1 Only `House/` and `Others/`

This is easy to understand, but `Others/` becomes an unsearchable mixed
archive. It also encourages future users to create ad hoc subfolders when the
collection grows.

### 4.2 One physical folder per type or style

Folders such as `Modern/`, `Medieval/`, `Castle/`, and `Temple/` appear useful
initially, but a single structure can match several labels. The result is
ambiguous placement, duplicate files, repeated moves as classification
improves, and folder names being mistaken for reviewed truth.

### 4.3 Two lanes plus metadata

This is the selected approach. The two folders answer the only question the
collector must answer immediately: "Is this intended as a residential-house
candidate or as a non-residential architectural reference?" All richer
classification can evolve independently in metadata.

## 5. Batch layout and naming

Every collection session is a named batch:

```text
.local/residential-model/inbox/
  2026-07-24-planetminecraft-001/
    batch-manifest.json
    houses/
      woodland-cottage.schem
      compact-survival-home.nbt
    other-architecture/
      riverside-clock-tower.schematic
```

A batch ID must be stable, lowercase, and safe to use as a contract ID. The
recommended pattern is:

```text
<yyyy-mm-dd>-<source-name>-<sequence>
```

The original filename and extension must be retained. A downloaded file must
not be renamed to imitate a supported format.

Each candidate occurs once within a batch. A collector must not copy the same
file into both lanes. If the correct lane is uncertain, place it in
`other-architecture/` and record the uncertainty in the manifest rather than
duplicating it.

## 6. Lane semantics

### 6.1 `houses/`

This lane means only that the collector intends the file to be reviewed as a
complete residence. It is not an assertion that the file:

- is furnished;
- is survival-ready;
- fits the `64 x 64 x 64` boundary;
- uses supported content;
- has sufficient provenance or training permission;
- parses successfully;
- is unique; or
- meets the visual-quality threshold.

Those properties are evidence gathered during intake and review.

A residential candidate should be a complete, independently usable house,
not a fragment, façade, empty shell, neighborhood, or inseparable multi-house
collection.

### 6.2 `other-architecture/`

This lane stores high-quality castles, temples, towers, hotels, public
buildings, arenas, monuments, infrastructure, and other non-residential work
that may later inform a separate architecture program.

These files may be inventoried, hashed, safely parsed, and profiled. They are
reference-only for the residential program. A successfully processed item in
this lane receives:

- `status: "deferred"`; and
- the decision reason `non_residential_reference_only`.

`deferred_non_residential` is not a valid status and must not be introduced.
The valid R1 statuses remain `quarantined`, `parsed`, `eligible`, `deferred`,
and `rejected`.

No item in `other-architecture/` can become residential-training eligible
automatically. A future human-reviewed reclassification must append a
decision, retain the original lane and hashes as provenance, and never rewrite
the immutable quarantined bytes.

### 6.3 Folder names are claims, not truth

The intake process records the submitted lane before inspecting content. If a
castle is placed under `houses/`, it is still deferred as
`non_residential_reference_only`. If a residence is placed under
`other-architecture/`, it remains reference-only until explicitly reviewed
and reclassified. Physical location alone never grants eligibility.

## 7. Batch manifest

`batch-manifest.json` is the pre-parse inventory and provenance record. It
must describe every candidate, including files whose format cannot yet be
represented by `SourceProfile` v1.

At minimum, each manifest candidate records:

- relative path below the batch root;
- submitted lane;
- title;
- source page URL;
- claimed author or an explicit unknown value;
- acquisition timestamp;
- license status and captured license text;
- allowed-use evidence;
- optional collector note; and
- the filename exactly as downloaded.

The manifest must not embed source bytes. Candidate paths are relative,
normalized, and confined to exactly one approved lane. Absolute paths,
traversal segments, symlinks, unknown top-level lanes, and unlisted payloads
are rejected by intake validation.

The implementation plan will define and test the exact versioned manifest
schema. This design does not silently add an `intake_lane` field to the strict
R1 `SourceProfile` schema.

## 8. Manifest-to-profile boundary

There are two deliberately different records:

1. The batch manifest represents every collected candidate before trust or
   parser support is known.
2. `SourceProfile` represents a candidate after the current strict contract
   can express its supported format, bounded measurements, and fingerprints.

This distinction resolves a current contract limitation: `SourceProfile` v1
accepts only `schem`, `schematic`, and `structure_nbt` artifacts and requires
parsed bounds and fingerprints. An unsupported `.litematic`, for example,
cannot honestly be encoded as a valid v1 profile.

Until a separately reviewed contract revision exists:

- every file remains represented in the manifest and intake report;
- supported, safely parsed files receive a `SourceProfile`;
- unsupported files remain preserved and are reported as deferred intake
  candidates with reason `unsupported_format`;
- filenames and extensions are never changed to bypass this boundary; and
- tooling must not emit an invalid or fabricated `SourceProfile`.

## 9. Intake flow

The intended R2 flow is:

```text
manual download plus provenance capture
  -> named batch and submitted lane
  -> manifest validation
  -> immutable quarantine copy
  -> byte and path safety checks
  -> bounded format parse
  -> exact and structural fingerprints
  -> SourceProfile when representable
  -> eligibility, deferral, or rejection decision
```

The original inbox payload is not a training artifact. Downstream work uses
the immutable quarantined identity and its verified derivatives.

### 9.1 Decision precedence

The following precedence prevents a convenient lane label from hiding a more
important failure:

1. Unsafe, malformed, path-escaping, or integrity-failing input is rejected.
2. Safe but unsupported, oversized, inseparable, or insufficiently documented
   input is deferred with its specific reason.
3. Valid non-residential architecture is deferred as
   `non_residential_reference_only`.
4. A house candidate becomes eligible only after every residential criterion
   passes.

Exact duplicates are not admitted as additional eligible cases. Structural
derivatives are grouped under stable lineage before any future dataset split.

## 10. Residential eligibility

Only a file submitted or explicitly reclassified as a house can be considered
for residential eligibility. It must also satisfy the master-design criteria:

- one complete, independently usable residence;
- meaningful furnishing and decoration evidence;
- the required survival core, or valid capacity to support it;
- occupied extents no greater than `64 x 64 x 64`;
- safe parsing within bounded resource limits;
- supported blocks, block entities, and attached entities;
- sufficient provenance and recorded local-training permission;
- no exact duplicate;
- recorded derivative family;
- lossless canonical extraction for supported content;
- labels at the required confidence or human-confirmation level; and
- the required visual-quality review.

The existing `SourceProfile.evidence` fields remain:

```text
complete_residence
furnished
survival_core
supported_content
```

The lane does not pre-fill these fields as `pass`. Evidence begins as unknown
and is advanced only by the appropriate parser, reviewer, or validated
derivation.

## 11. Metadata belongs outside the folder tree

Later R3 and R4 records may classify a candidate by:

- architectural style or period;
- residential subtype;
- non-residential typology;
- footprint and height;
- floor count;
- material palette;
- roof, façade, window, and entrance patterns;
- biome or site relationship;
- room program and circulation;
- furnishing density;
- decoration groups such as lighting, paintings, plants, rugs, trophies, and
  storage displays;
- survival functions;
- quality and confidence; and
- approved learning roles.

These are multi-valued, reviewable facts. They must not be inferred from
physical subfolder names or used to create duplicate source copies.

## 12. Legacy templates

The existing tree remains unchanged:

```text
mc_templates/
  Arenas/
  Buildings/
  Castles/
  House/
  Temples/
  Tower/
```

R2 inventories all 64 legacy templates, not only files currently under
`mc_templates/House/`. Existing folder names are submitted category hints,
not eligibility decisions.

For each legacy template:

- retain its current path and bytes;
- create a logical intake candidate without copying or moving the source;
- recover and record available provenance;
- apply the same safety, parsing, fingerprint, completeness, furnishing,
  survival, size, content, permission, and quality checks;
- admit only verified residential houses to the residential candidate pool;
  and
- preserve qualifying non-residential work as deferred reference material.

This mixes useful old work with new sources at the profile and review layers,
not by merging or rearranging their physical folders.

## 13. Dataset boundaries

The two-lane organization does not itself create a dataset.

- Only `eligible` residential profiles can proceed to R3/R4 annotation and
  golden review.
- Only approved annotated residential cases can enter a frozen R5 dataset
  snapshot.
- Non-residential references are excluded from residential snapshots by
  contract, not by a best-effort filename filter.
- Exact duplicates and derivative families are resolved before split
  assignment.
- The original submitted lane, provenance, hashes, and decision history remain
  auditable after every later transition.

## 14. Collector workflow

For each downloaded structure, the owner:

1. Creates or selects one named batch.
2. Saves the source page URL, title, author, acquisition time, license text or
   unknown status, and allowed-use evidence in the batch manifest.
3. Places the file once in `houses/` if it appears to be one complete
   residence; otherwise places high-quality architecture in
   `other-architecture/`.
4. Preserves the downloaded filename and extension.
5. Does not unpack, rewrite, repair, crop, or duplicate the source merely to
   make intake pass.

The owner does not need to master every architectural category during
collection. Detailed style, room, furnishing, and decoration judgments are
intentionally deferred to assisted analysis and review.

## 15. Error and ambiguity handling

- Missing or uncertain license information is recorded as unknown, never
  guessed.
- Missing required provenance defers local-training eligibility.
- Unsupported formats remain preserved and visible in reports.
- Oversized structures are deferred; they are not silently cropped or split.
- Multi-house collections remain deferred until a separately authorized,
  provenance-preserving separation workflow exists.
- Symlinks, traversal, escaping paths, malformed content, and parser resource
  violations do not enter the trusted source store.
- An ambiguous house-versus-other judgment defaults to reference-only until
  human review.
- Repeated downloads are detected by exact hash even when filenames differ.

## 16. R2 acceptance criteria

The later R2 implementation is acceptable only when tests demonstrate that:

- a valid named batch with either approved lane can be inventoried;
- every listed candidate retains its submitted lane and provenance;
- missing manifest entries and unlisted payloads are reported;
- unknown lanes, absolute paths, traversal, and symlinks are rejected;
- source bytes become immutable identities rather than editable training
  inputs;
- exact duplicates are detected across new batches and legacy templates;
- bounded parsers cannot exceed defined byte, nesting, palette, entity, and
  volume limits;
- unsupported formats are preserved and deferred without fabricated profiles;
- a non-residential candidate cannot receive `eligible` status;
- a house-lane candidate receives no automatic evidence passes;
- all 64 legacy templates are examined without being moved or modified;
- intake writes only below the configured local residential-model root; and
- rerunning the same batch is deterministic and does not create duplicate
  identities or conflicting decisions.

## 17. Relationship to later work

This design freezes only the source-organization boundary. The next document,
after review of this checkpoint, will be the executable R2 implementation plan
for:

- the versioned batch-manifest contract;
- safe inventory and quarantine;
- bounded parser adapters;
- fingerprint and lineage records;
- intake reports;
- legacy-template logical import; and
- the test matrix for all transitions.

R3 will address canonical extraction and metadata drafting. R4 will address
golden review and approved annotation. Neither is pulled into R2 merely
because its future metadata is named here.
