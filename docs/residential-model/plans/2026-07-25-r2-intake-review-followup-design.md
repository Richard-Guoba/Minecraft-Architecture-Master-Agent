# R2 Intake Review Follow-up Design

**Status:** Approved for implementation planning on 2026-07-25

## Goal

Close the four Important findings remaining on draft pull request #6 without
changing R2's role, expanding into R3, or touching locally collected source
files.

R2 remains a local, evidence-honest intake boundary. Houses are never
automatically eligible, residential evidence remains unknown, and a completed
batch is immutable.

## Scope

This follow-up changes only:

1. current-batch exact-duplicate ordering;
2. intake-report lane/reason validation;
3. completed-report verification against current payload identities; and
4. occupied-extent deferral before structural fingerprinting.

It does not add room extraction, decoration recognition, annotations,
datasets, model training, or production construction behavior.

## Chosen Approach

Use targeted boundary corrections in the existing R2 modules.

This is preferred over a pipeline rewrite because the four failures have
separate, reproducible ownership boundaries:

- duplicate ordering belongs in batch orchestration;
- lane/reason consistency belongs in the report contract;
- completed-report identity verification belongs at the report recovery
  boundary; and
- extent deferral belongs between measurement and fingerprint generation.

A broader orchestration rewrite would increase regression risk without
improving the R2 interface. Weakening report caching would conflict with the
approved immutable-batch behavior.

## Data Flow

The corrected intake order is:

```text
validate complete inventory
→ safely inspect current payload identities
→ validate any completed report against the manifest and current identities
→ read and quarantine new candidate bytes
→ detect hashes already observed earlier in the current batch
→ parse and measure supported geometry
→ defer when any occupied axis exceeds 64
→ fingerprint geometry within the R2 extent
→ create profiles and publish the final report
```

All processing remains sequential and deterministic in lexical candidate-path
order.

## Component Design

### Current-batch exact duplicates

After a candidate is safely read, hashed, and quarantined, orchestration checks
whether its hash was already observed earlier in the same run. This check
occurs before format dispatch, parsing, occupied-extent deferral, malformed
rejection, or profile recovery.

The first observation retains its normal outcome. Every later observation
returns:

```text
duplicate/exact_duplicate
```

It reuses the first observation's case ID. It reuses the first profile path
when one exists and otherwise records a null profile path. Genuine interrupted
recovery still applies to the first current-run observation when a same-batch
profile exists but no completed report does.

### Lane-bound report semantics

The strict intake-report validator binds residential lifecycle reasons to the
submitted lane:

- `parsed/residential_candidate_requires_review` requires `houses`;
- `deferred/non_residential_reference_only` requires
  `other-architecture`.

All existing identity, profile-path, outcome/reason, uniqueness, and summary
invariants remain enforced. Duplicate and error outcomes remain valid in
either lane.

### Completed-report payload identity

A completed report is returned only after the current inventory and payload
state agree with it.

For each observation carrying `artifact_sha256`, the current payload is read
through the existing no-follow bounded candidate boundary and hashed. Any
missing, changed, unsafe, or differently hashed payload fails closed with:

```text
INTAKE_BATCH_ALREADY_RECORDED
```

For observations without an artifact identity, the safe read is repeated and
must reproduce the same pre-quarantine outcome class. A newly readable payload
or a different outcome also fails closed.

The completed report is never rewritten. The curator must restore the original
payload or create a new batch ID, matching the approved immutable-batch rule.

### Extent deferral before fingerprinting

Artifact normalization continues to parse supported input and measure non-air
occupied bounds before fingerprinting.

When an optional R2 occupied-axis limit is supplied and any measured axis
exceeds 64, the parser raises a stable measurement-stage signal:

```text
SOURCE_OCCUPIED_BOUNDS_LIMIT
```

Batch intake and legacy audit map that signal to:

```text
deferred/occupied_bounds_exceed_64
```

No fingerprint or `SourceProfile` is produced for that observation. The
existing 262,144 occupied-entry cap remains independent: dense sources that
exceed it still return `deferred/parser_limit`.

This ordering allows sparse, very long structures to receive the honest extent
decision without entering the fingerprint module's 16-bit extent contract.

## Error and Recovery Rules

- Changed completed payload: reject the batch as already recorded.
- Same-batch later duplicate: reuse identity and report exact duplicate.
- Lane/reason mismatch: reject report contract validation.
- Occupied axis above 64: quarantine, then defer without profile or
  fingerprint.
- Occupied entries above 262,144: defer as parser limit.
- Unsafe source read: preserve the existing malformed/unsafe mapping.
- Unchanged completed batch: return the original byte-identical report.

No correction mutates a completed report, an existing immutable quarantine
case, a legacy template, or `.local/` collection files.

## Test Design

Each correction follows RED, GREEN, and focused compatibility verification.

Required regressions:

1. Two identical supported `65 × 1 × 1` candidates in different lanes:
   first defers for extent, second reports exact duplicate with the same case
   ID and null profile.
2. Identical malformed or unsupported same-batch candidates:
   later observations report exact duplicate without repeating downstream
   processing.
3. A `houses` observation using the non-residential reason is rejected.
4. An `other-architecture` observation using the residential parsed reason is
   rejected.
5. Replacing a payload after a completed report causes
   `INTAKE_BATCH_ALREADY_RECORDED` and no new writes.
6. An unchanged completed batch remains byte-identical and idempotent.
7. A sparse one-region `65,536 × 1 × 1` artifact with 65,536 occupied entries
   defers for occupied extent instead of raising
   `FINGERPRINT_EXTENT_INVALID`.
8. Dense 64-cube acceptance and 262,145-entry parser-limit behavior remain
   unchanged.
9. Stage 7 compatibility tests, all focused R2 tests, the full Node suite, and
   the read-only 64-template legacy audit remain green.

## Repository and PR Boundaries

- Work continues on `agent/residential-r2-source-intake`.
- Draft PR #6 remains draft until independent review is clean.
- The local batch under `.local/residential-model/` is ignored and untouched.
- No `mc_templates/` content is copied, moved, rewritten, or committed.
- No package dependency or Stage 7 command changes are permitted.
