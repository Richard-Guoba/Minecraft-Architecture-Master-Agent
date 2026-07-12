# Stage 7 P1 Author Provenance Design

## Purpose

Stage 7 P1 must record who created and who published each reviewed source, not merely whether a license appears usable. The existing Stage 7 review overlay has source hashes and license evidence but no structured author or uploader fields. This design adds the minimum provenance boundary needed for the six-case pilot and later source-grouped review at 20 and 2000 cases.

## Current Gap

The first pilot case demonstrates why a single unstructured note is insufficient. Its source page distinguishes an original designer from the person who prepared or uploaded the schematic, while the current Dataset v2 record exposes only an empty `source.author`. The Stage 7 overlay cannot carry either identity, and `mergeDatasetReview` cannot propagate them.

Without structured provenance:

- evidence cannot be grouped or reused by author or uploader;
- a later curator cannot tell original authorship from publication identity;
- positive eligibility can be recorded without completing the required author review;
- P5 throughput measurements would understate repeated source investigation.

## Chosen Approach

Extend the existing append-only Stage 7 review overlay instead of using notes-only storage or introducing a separate source registry during the six-case pilot.

The overlay gains three normalized string fields:

- `source_author`: the original designer or creator identified by direct evidence;
- `source_uploader`: the uploader, publisher, or schematic preparer identified by direct evidence;
- `author_evidence`: a concise human-authored statement that cites the page or document used and distinguishes known identities from unresolved attribution.

This is preferred over notes-only storage because it supports grouping and validation. It is preferred over a separate source registry because the pilot is too small to justify a second lineage and merge system. A separate registry may be designed after the twenty-case cycle if repeated source groups demonstrate a clear need.

## Overlay Contract

`source_author`, `source_uploader`, and `author_evidence` are accepted root fields in `stage7_dataset_reviews.jsonl`. The parser trims each value and preserves internal text exactly.

Validation rules are:

- `pending` records may leave all three fields empty.
- Every explicit outcome (`approved`, `limited`, `rejected`, or `research-only`) requires a non-empty `author_evidence`.
- `approved` and `limited` require at least one non-empty identity: `source_author` or `source_uploader`.
- `rejected` and `research-only` may leave both identities empty when the evidence explicitly records that attribution remains unknown.
- The three fields never imply license permission, learning-area approval, semantic acceptance, or eligibility.
- Unknown fields remain strict parser errors.

The existing requirements for reviewer identity, timestamp, source hash, front side, license evidence, and explicit learning-area decisions remain unchanged.

## Dataset v2 Contract

When a validated review is merged into Dataset v2:

- `record.source.author` receives `source_author`;
- `record.source.uploader` receives `source_uploader`;
- `record.source.author_evidence` receives `author_evidence`.

These fields are provenance only. They are not condition tokens, model targets, eligibility switches, or runtime provider inputs.

Dataset v1 remains frozen. The new fields must not appear in Dataset v1 records, and the four recorded Dataset v1 hashes must remain unchanged.

## Review-Pack Contract

Every generated `correction.example.json` and embedded `correction_template` gains blank `source_author`, `source_uploader`, and `author_evidence` fields. The human checklist explicitly asks the reviewer to distinguish original creator, schematic preparer, and uploader when the source page exposes those roles.

Automation leaves all three fields blank. It may display public evidence but must not insert identity conclusions into a positive review record.

## Data Flow

1. The review pack binds the case and source SHA-256.
2. A human inspects the exact source page and authoritative attribution evidence.
3. The human confirms original author, uploader or preparer, and the evidence statement.
4. The strict overlay parser normalizes and validates the record.
5. `mergeDatasetReview` copies the three fields into Dataset v2 source provenance.
6. Dataset validation and readiness evaluation continue independently.
7. Review-effort reporting can group cases by the structured identities without feeding those metrics into training.

## Failure Policy

- An explicit outcome without `author_evidence` is rejected by the parser.
- A positive outcome without either author or uploader identity is rejected.
- Conflicting roles are recorded as distinct values; they are not collapsed into one guessed author.
- When a page names an uploader but not the original creator, the uploader may be recorded while the evidence states that original authorship remains unknown.
- When attribution cannot be verified, the case may receive a fail-closed `rejected` or `research-only` outcome but cannot become positive.
- A source hash change invalidates the entire review, including its author provenance.
- Dataset v1 field or hash drift blocks the implementation.

## Testing

Node.js tests must prove:

- the strict parser accepts and trims the three new fields;
- unknown author-related field names still fail;
- every explicit outcome requires `author_evidence`;
- `approved` and `limited` require `source_author` or `source_uploader`;
- `rejected` and `research-only` may record verified unknown attribution;
- merged Dataset v2 records expose `author`, `uploader`, and `author_evidence`;
- review-pack templates contain blank author fields and no automated identity claims;
- Dataset v1 records omit the new fields;
- the complete test suite passes;
- canonical Dataset v1 retains its four recorded hashes.

## First-Case Application

After implementation, the first pilot record may represent the already gathered evidence as:

- original designer in `source_author`;
- schematic preparer or uploader in `source_uploader`;
- a concise `author_evidence` statement citing the exact source page and its role labels.

The human reviewer still confirms the exact strings. This design does not itself create the review record or decide its license, front side, learning areas, corrections, or status.

## Exit Criteria

- The overlay carries structured author, uploader, and author evidence.
- Fail-closed validation covers explicit and positive outcomes.
- Dataset v2 preserves the fields as source provenance only.
- Review packs prompt for the fields without inventing values.
- Dataset v1 is byte-stable.
- The first pilot can proceed to human confirmation without storing attribution only in notes.

## Non-Goals

This design does not create a global source registry, contact authors, request written permission, change license semantics, alter dataset splits, accept semantic extraction, add training features, or start model training.
