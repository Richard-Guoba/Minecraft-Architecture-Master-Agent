# Minecraft Architecture Playbook P5 — Minimal Executable Design Layer

Date: 2026-08-27  
Status: approved design, ready for implementation planning  
Base: P4 reviewed head `ece476d39f63b5d0d4e6489a0f3154464b2496bd`

## 1. Purpose

P5 turns the reviewed playbook from a read-only shadow reviewer into an opt-in,
bounded design-layer controller. It generates exactly three medieval-residence
candidates, records replayable checkpoints for the five covered design layers,
uses deterministic P4 results as an eligibility gate, performs at most one
allowlisted repair transaction per candidate, and selects an eligible candidate
through the existing deterministic ranking path.

P5 is not a visual-quality claim. It does not add cameras, image models,
aesthetic scoring, blind comparisons, or human-preference conclusions. Those
remain P6.

## 2. Binding product decisions

The approved decisions are:

1. P5 is strictly opt-in. The omitted/default mode is `off`; the executable mode
   is `execute`.
2. `playbook=off` preserves the existing production generator byte-for-byte,
   including provider calls, seeds, errors, outputs, ranking, and installation.
3. An executable P5 run creates exactly three candidates.
4. Only the fifteen reviewed `core-procedure` rows can affect P5 eligibility.
   The six `case-pattern` rows never accept, reject, repair, or rank a candidate.
5. Within the fifteen core rows, only a deterministic `violated` result can
   trigger repair or rejection. `satisfied` is eligibility evidence but adds no
   score. `unknown` and `not-applicable` are neutral.
6. Only repair operations whose P4 checker is currently structural and
   decidable are executable in P5 v0.1. Evidence-required rules remain honest
   `unknown` and cannot be made executable by inventing thresholds.
7. Each candidate receives at most one repair transaction. The transaction may
   contain multiple non-conflicting executable repairs and replays from the
   earliest affected layer.
8. Initial candidate design may use the existing `mock` or `llm` provider mode.
   After the initial provider-derived design envelope is frozen, repair and
   replay make zero new provider calls.
9. Repair authority remains local. A model may select only a pre-published
   `variant_id`; local deterministic code resolves it to typed field changes.
10. Hard QA, playbook eligibility, and candidate ranking are separate
    authorities:
    - `BlueprintQAAgent` decides construction legality;
    - the deterministic P4 review decides playbook eligibility;
    - the existing `CandidateSelectionAgent` ranks otherwise eligible rows.
11. Checkpoints and candidate-chain versions are immutable. Promotion changes an
    atomic pointer; it never edits an accepted revision in place.
12. If no candidate is both hard-QA-valid and playbook-eligible, P5 fails closed,
    retains evidence, and installs no datapack.

## 3. Scope

### 3.1 Included

- A generator-facing `playbook` option with exact values `off` and `execute`.
- Exactly three stable-seed candidates in executable mode.
- Replayable checkpoints for:

  ```text
  brief -> massing -> structure -> roof -> facade
  ```

- A frozen, bounded initial design envelope for each candidate.
- Deterministic P4 review without LLM explanation authority.
- Four existing structural P4 checks as the only executable v0.1 repair
  boundary.
- Typed repair variants, conflict detection, one repair budget, invalidation,
  deterministic replay, rollback, and selection.
- Immutable per-candidate evidence and a final P5 selection report.
- Exact compatibility gates for the off path.

### 3.2 Excluded

- Visual input, screenshots, render-based checks, camera protocols, image models,
  aesthetic scores, preference models, blind A/B tests, or quality-improvement
  claims.
- New course evidence, new rules, new thresholds, or promotion of case patterns.
- Execution of the eleven evidence-required core checkers.
- General JSON Patch, arbitrary JSON Pointer paths, arbitrary values, raw block
  edits, voxel patches, Minecraft coordinates, or direct command generation by
  an LLM.
- Changes to `space`, `materials`, `interior`, or `scene` design authority.
- More than three candidates, more than one repair transaction per candidate,
  iterative self-reflection rounds, or repeated provider calls during replay.
- Automatic world/datapack installation before final selection.
- Publication of real run outputs, private playbook material, or provider
  transcripts.

## 4. Existing system and required seam

The current `runCandidatePipeline()` already generates stable-seed candidates,
runs `runConstructionWorkflow()`, ranks successful outputs, and installs only
the selected datapack. The workflow, however, is a single procedural function;
it does not expose immutable design-layer inputs or replay boundaries.

P5 must refactor the workflow into pure, testable stage functions while keeping
the same algorithms and the same off-path call order. It must not create a
parallel generator.

The current `RoofAgent.run()` signature accepts a `facade` argument but does not
read it. P5 removes this false dependency from the internal replay interface and
establishes the approved order `structure -> roof -> facade`. Compatibility
adapters may retain the old public call shape until all existing callers are
migrated, but the off-path output must remain identical.

The downstream production compiler remains authoritative for space planning,
materials, interior, scene, CSG, BSP, pathfinding, decoration, repairs,
voxelization, command optimization, export, and hard QA.

## 5. Public invocation contract

### 5.1 Pipeline option

`runPipeline()` and `runCandidatePipeline()` receive:

```js
playbook = 'off'
```

Allowed values are exactly:

```text
off
execute
```

Omitted and explicit `off` are equivalent. Any other value fails before an
output directory, provider client, or world path is created.

The top-level CLI exposes the corresponding exact option:

```text
--playbook off|execute
```

### 5.2 Executable-mode option rules

In `execute` mode:

- omitted `candidates` means three;
- explicit `candidates` must equal three;
- omitted `candidateRounds` means one;
- explicit `candidateRounds` must equal one;
- `candidateForceRounds` must be false;
- the existing candidate target score remains a ranking input only and cannot
  override P5 eligibility;
- the Stage 7 artifact-provider restriction remains binding and therefore
  rejects combinations that cannot provide one artifact bound independently to
  each of the three candidates;
- world/datapack installation arguments are withheld from every candidate run
  and replay, then applied once to the final selected result.

In `off` mode, all existing candidate count, round count, reflection, target,
Stage 7 compatibility, and installation semantics remain unchanged.

## 6. P5 architecture

### 6.1 Orchestrator

A new executable-playbook orchestrator owns only:

- exact candidate count and stable candidate identity;
- initial design-envelope capture and validation;
- checkpoint creation and hashing;
- deterministic P4 review invocation;
- repair selection validation and local compilation;
- repair-budget accounting;
- dependency invalidation and replay dispatch;
- hard-QA and eligibility evaluation;
- immutable evidence installation;
- filtering eligible candidates before existing ranking;
- final selected-artifact revalidation and installation.

It does not implement architecture, geometry, room planning, materials,
decoration, command generation, visual review, or scoring.

### 6.2 Data flow

```text
prompt + base seed + existing generator options
  -> exactly three stable candidate seeds
  -> existing initial provider/design work
  -> validated frozen design envelope per candidate
  -> initial five-layer checkpoint chain
  -> existing downstream compiler
  -> BlueprintQAAgent
  -> deterministic P4 review
  -> optional one repair transaction
  -> earliest-target replay through facade and downstream compiler
  -> BlueprintQAAgent + deterministic P4 re-review
  -> eligibility filter
  -> existing CandidateSelectionAgent
  -> final hash/authority revalidation
  -> atomic result publication and optional selected datapack installation
```

Each candidate is independent. A candidate failure does not stop the other two
unless the failure proves a run-wide authority problem such as invalid corpus,
invalid executable registry, or unsafe output ownership.

## 7. Design-layer contracts

### 7.1 Layer order and ownership

The P5 v0.1 layer order is fixed:

```text
brief
massing
structure
roof
facade
```

The layer dependency graph is deliberately linear for v0.1. Later phases may
introduce a richer DAG only through a new approved schema version.

Layer ownership is:

- `brief`: normalized prompt intent, typology, style family, hard constraints,
  selected/rejected rule IDs, and precommitted repair-variant preferences;
- `massing`: build dimensions, volume identities, roles, scales, placements,
  primary/secondary relationships, and massing recipe;
- `structure`: structural intent, frames, support paths, overhang intent, and
  base strategy;
- `roof`: profile, height, overhang, ridge intent, elements, and edge treatment;
- `facade`: frame/bay/opening intent, depth layers, variation axes, elements,
  and facade recipe.

The checkpoints store design semantics and compiler references, not voxel grids,
Minecraft commands, raw provider responses, or unconstrained provider prose.

### 7.2 Stage interface

Every stage behaves as a pure function over validated values:

```js
compileLayer({
  frozenDesign,
  acceptedUpstream,
  previousLayer,
  resolvedPatch,
  generatorContext
}) -> validatedLayerPayload
```

`generatorContext` contains only already-normalized deterministic inputs such as
seed, Minecraft version, material palette, and validated existing agent outputs.
It cannot contain a provider client, raw provider response, filesystem handle,
world path, or mutable grid.

The exact exported functions may be layer-specific, but they must share the same
authority boundary and return plain canonicalizable data.

### 7.3 Downstream invalidation

The exact invalidation table is:

| Changed layer | Invalidated layers |
| --- | --- |
| `brief` | `massing`, `structure`, `roof`, `facade` |
| `massing` | `structure`, `roof`, `facade` |
| `structure` | `roof`, `facade` |
| `roof` | `facade` |
| `facade` | none |

A replay must reject any checkpoint whose declared invalidation list differs
from this table. No repair can invalidate an upstream layer.

## 8. Frozen initial design envelope

Each candidate receives one validated P5 design envelope. In mock mode it is
created locally. In LLM mode its P5-specific choices are produced through the
existing provider path under an exact wrapper-controlled schema.

The envelope contains only:

```text
schema_version
candidate_id
seed
brief_intent
layer_intents[brief,massing,structure,roof,facade]
selected_rule_ids
rejected_rule_ids
repair_variant_preferences
```

All rule IDs must belong to the exact reviewed corpus. Case patterns may appear
only as non-authoritative explanatory intent and cannot appear in executable
repair preferences. Repair preferences map an executable
`repair_operation_id` to one published `variant_id` and contain no patch fields.

This precommit lets an initial LLM choose among bounded variants without a new
post-review provider call. If a preference is omitted, the deterministic default
variant is used. Unknown fields, IDs, operations, variants, duplicates,
reordering, overlong text, or candidate/seed drift invalidate the entire
candidate envelope.

After validation the envelope is deeply frozen and hash-bound to the candidate.

The existing workflow also produces normalized provider-derived architecture,
topology, creative-design, and optional concept data. P5 records only the
validated forms already consumed by the production generator in a separate
`frozen_generator_context` payload. That payload is schema-checked, canonical,
hash-bound to the candidate and envelope, and contains no raw response, client,
credentials, or transport metadata. Deterministic local derivatives such as the
build spec, style preset, material palette, and template-knowledge projection
are either recomputed from those frozen inputs or stored with independent
hashes. Replay cannot substitute or extend this context.

## 9. Checkpoint contract

### 9.1 Canonical checkpoint payload

Every checkpoint payload contains exactly:

```text
schema_version
playbook_version
build_id
candidate_id
layer
revision
status
upstream_accepted_hashes
selected_rule_ids
rejected_rule_ids
design_intent
recipe_fragment
field_patches
compiled_artifact_hashes
hard_qa
design_review
invalidates_downstream
replay_origin
```

Allowed status values are:

```text
draft
reviewing
accepted
rework_required
superseded
failed
```

Status describes the lifecycle of that immutable revision. A transition creates
a new revision record; it never edits an existing checkpoint file. Candidate
eligibility is a separate computed result and must not be inferred from the word
`accepted` alone.

An `accepted` checkpoint means its schema, upstream hashes, compiler output, and
hard-QA contribution are valid inputs for deterministic replay. Its stored P4
review may still require a bounded rework before the candidate becomes eligible.
This distinction allows P5 to roll back a failed repair to the last structurally
accepted chain while still refusing to rank that chain if it has unresolved
violations.

### 9.2 Hash envelope

The checkpoint content hash is not stored inside the bytes it hashes. The
storage envelope is:

```json
{
  "checkpoint_sha256": "<sha256 of canonical checkpoint payload>",
  "checkpoint": {}
}
```

Canonical JSON uses the P4 stable serializer and UTF-8 bytes with one trailing
newline. Validation recomputes the hash before every use.

`upstream_accepted_hashes` is an exact ordered array of
`{ layer, checkpoint_sha256 }` rows for the checkpoint's preceding transitive
inputs. Missing, extra, reordered, stale, or mismatched rows fail closed.

### 9.3 Candidate chain manifest

Each immutable chain manifest records:

```text
schema_version
candidate_id
chain_revision
parent_chain_sha256
checkpoint_hashes[{layer,checkpoint_sha256} x 5]
frozen_design_sha256
frozen_generator_context_sha256
blueprint_sha256
hard_qa_sha256
p4_review_sha256
repair_transaction_sha256
eligibility
created_from
```

`eligibility` contains hard-QA status, unresolved violated core rule IDs,
neutral unknown/not-applicable IDs, repair budget used, and one of:

```text
eligible
hard-qa-failed
unresolved-core-violation
repair-invalid
replay-failed
```

It contains no numeric playbook score.

## 10. P4 authority inside P5

P5 consumes the deterministic review contract and reviewed corpus from P4. It
does not use LLM explanation text for eligibility or repair.

The fifteen core procedures are considered for eligibility. The six case
patterns are retained in evidence but are always neutral.

P5 v0.1 has exactly four decidable structural checks:

| Check | Rule | Executable repair operation |
| --- | --- | --- |
| `check:massing:three-volume-composition` | `rule:structure.compose-three-volumes` | `repair:massing:resize-or-reposition-volume` |
| `check:massing:primary-secondary-hierarchy` | `rule:structure.create-primary-secondary-hierarchy` | `repair:massing:strengthen-primary-volume` |
| `check:massing:subordinate-support-volume` | `rule:structure.keep-support-volumes-subordinate` | `repair:massing:reduce-support-volume-prominence` |
| `check:structure:visible-load-path` | `rule:medieval.show-load-path` | `repair:structure:connect-support-path` |

The other eleven core rules remain evidence-required. If they return `unknown`,
they are neutral. If future corpus/checker versions make one decidable, P5 must
still reject its repair until a separately reviewed compiler entry exists.

P5 validates the exact tuple:

```text
rule_id
check_id
design_layer
repair_operation_id
invalidates_layers
compiler_version
allowed_variant_ids
```

No runtime map may add or replace entries outside the checked-in registry.

## 11. Repair contract

### 11.1 Frozen provider preference and wrapper-owned request

The provider never returns a patch. Its initial frozen preference is only:

```json
{
  "repair_operation_id": "repair:massing:strengthen-primary-volume",
  "variant_id": "promote-largest-stable"
}
```

At repair time the wrapper constructs the authoritative request locally from the
frozen preference and current review. It is not sent to a provider:

```json
{
  "schema_version": 1,
  "candidate_id": "candidate-01",
  "rule_id": "rule:structure.create-primary-secondary-hierarchy",
  "repair_operation_id": "repair:massing:strengthen-primary-volume",
  "variant_id": "promote-largest-stable",
  "base_checkpoint_sha256": "<exact accepted checkpoint hash>"
}
```

Candidate ID, rule ID, operation ID, base hash, and allowed variants are local
authority. A model cannot override them.

### 11.2 Resolved patch

General JSON Patch is forbidden. A local compiler emits a typed resolved patch:

```text
schema_version
compiler_version
candidate_id
rule_id
repair_operation_id
variant_id
target_layer
base_checkpoint_sha256
precondition_hashes
effects
invalidates_layers
```

`effects` uses operation-specific typed records. It cannot contain arbitrary
JSON Pointer paths, block IDs, coordinates, commands, executable code, or
unbounded strings.

`base_checkpoint_sha256` binds the operation to the checkpoint observed in the
original reviewed chain. A multi-layer transaction may first replay an upstream
layer, so a later operation is not required to match that obsolete checkpoint
as its live input. Instead, `precondition_hashes` bind the exact semantic anchor
records observed originally, and the compiler revalidates those anchors against
the freshly replayed layer before applying the later effect. Missing, changed,
or ambiguous anchors reject the whole transaction. This permits one atomic
massing-plus-structure transaction without treating an intentionally invalidated
structure checkpoint as current authority.

### 11.3 v0.1 variants

The exact variant IDs and safe semantics are:

#### `repair:massing:resize-or-reposition-volume`

- `center-primary-and-reattach-secondaries`: valid only when exactly three
  well-formed boxes and one primary already exist; centers the primary and
  reattaches the two non-primary volumes using their existing stable IDs.
- `differentiate-equal-secondary-scale`: valid only when exactly three
  well-formed boxes already exist and equality is the only failing condition;
  minimally decreases one positive integer secondary dimension while preserving
  every hard bound.

It cannot add or delete a mass, invent an ID, or repair malformed geometry.

#### `repair:massing:strengthen-primary-volume`

- `promote-largest-stable`: chooses the unique largest valid volume, or the
  lexicographically first stable ID on an exact tie, as primary and demotes the
  others to secondary roles.
- `reduce-nondominant-secondary`: minimally decreases an offending secondary's
  positive integer scale until its volume is strictly below the existing
  primary, without applying an unreviewed aesthetic ratio.

#### `repair:massing:reduce-support-volume-prominence`

- `reduce-attached-support-scale`: minimally decreases an attached support
  volume's positive integer scale until its volume is strictly below the
  primary. The compiler preserves its ID, attachment target, and relation.

Although the reviewed rule is assigned to the structure layer, this operation
edits massing-owned volume semantics. Its `target_layer` is therefore `massing`,
and it invalidates `structure`, `roof`, and `facade`, matching the reviewed
runtime projection.

#### `repair:structure:connect-support-path`

- `connect-known-structural-anchors`: completes a semantic load path only from
  already compiled roof/upper-mass, frame, and base anchor identifiers. If any
  required anchor is unavailable, ambiguous, or malformed, the operation is
  non-repairable. It cannot invent coordinates or decorative supports.

### 11.4 Transaction ordering and conflicts

All executable violations from the authoritative review are collected before
repair. Operations are ordered by target-layer order and then reviewed corpus
order.

The transaction is rejected if:

- any operation or variant is unknown;
- any base/precondition hash is stale;
- any operation is non-repairable for the actual input;
- two effects write the same owned semantic field, even if their proposed values
  happen to match;
- an effect crosses layer ownership;
- invalidation differs from the fixed graph;
- canonical serialization or validation fails.

No partial repair transaction is applied.

## 12. Replay

Replay begins at the earliest target layer in the resolved transaction. It uses:

- the frozen initial design envelope;
- the exact accepted upstream checkpoint hashes;
- the resolved local patch;
- deterministic generator context captured from the initial candidate;
- the original candidate seed.

Replay must not create or invoke an LLM client. Tests inject a client factory that
throws on creation to prove this boundary.

Every target/downstream layer receives a new revision. Upstream checkpoint bytes
and hashes remain identical. After facade replay, the existing downstream
compiler regenerates the complete blueprint, geometry, operations, datapack,
preview, and QA artifacts from the new chain. P5 then runs a new deterministic
P4 review over the exact regenerated blueprint bytes.

A repaired candidate is eligible only when:

- hard QA passes;
- the P4 review is hash-bound to the regenerated blueprint;
- no decidable core assessment is `violated`;
- all checkpoint and artifact hashes validate;
- the one-repair budget is not exceeded.

New or remaining violations reject the candidate. There is no second repair
attempt.

## 13. Selection

P5 does not create a playbook score.

The orchestrator first marks every candidate as eligible or ineligible using
hard QA and P4. It then passes only eligible candidate records to the existing
`CandidateSelectionAgent` without changing that agent's ranking formula or
tie-break order.

The P5 selection artifact separately records all three candidates and their
eligibility reasons. An ineligible row may appear in the audit report but cannot
enter the ranker's successful set.

If no candidate is eligible, the stable run result is
`P5_NO_ELIGIBLE_CANDIDATE`. No datapack or world state is changed.

Before installation, P5 reopens and validates the selected candidate's current
chain manifest, checkpoint hashes, blueprint hash, hard-QA result, P4 review
hash, and datapack artifact hash. Any mismatch fails closed.

## 14. Storage and artifact topology

P5 artifacts live only below the ignored run directory:

```text
out/<run>/playbook-execute/
  manifest.json                         current selection pointer
  candidates/
    candidate-01/
      current-chain.json                current chain pointer
      frozen/
        frozen-design.json
        frozen-generator-context.json
      chains/
        chain-0001.json
        chain-0002.json
      checkpoints/
        brief/r0001.json
        massing/r0001.json
        structure/r0001.json
        roof/r0001.json
        facade/r0001.json
      blueprints/
        chain-0001.json
      reviews/
        chain-0001-hard-qa.json
        chain-0001-review.json
      repairs/
        attempt-01-request.json
        attempt-01-patch.json
        attempt-01-result.json
      failures/
    candidate-02/
    candidate-03/
  selection-generations/
    selection-<manifest-sha256>/
      manifest.json
      selection.json
      selection-report.md

out/<run>/candidate-work/
  <selected candidate workspace only after successful completion>
```

Names are fixed, ASCII, and generated locally. Run IDs and candidate IDs cannot
come from provider content.

All authoritative JSON is canonical and body hashes live in manifests. Every
versioned body is immutable and read-only after promotion; the managed current
pointer is replaced only through the atomic protocol below.

Candidate immutable bodies are written, validated, made read-only, and synced
before publication. All versioned bodies retain their original inode after
promotion. `current-chain.json` is the only replaceable candidate file: it is a
canonical `{ schema_version, candidate_id, chain_revision, chain_sha256 }`
pointer whose single same-directory atomic replacement makes either the complete
old or complete new chain authoritative.

Selection publication first writes one immutable, complete generation and then
replaces only the root `manifest.json` pointer. That pointer canonically binds
the generation path and generation-manifest hash. Root `selection.json` and
`selection-report.md` are logical compatibility names resolved through the
pointer; they are never independently mutated current files. Replay workspace
is run-owned, never placed in a global temporary directory, and final cleanup
retains only the selected successful workspace.

P5 must preserve unknown existing files and refuse unowned output. It must reject
symlinked path components, traversal, control characters, malformed manifests,
unexpected managed files, hash drift, and source swaps. Storage can reuse the
reviewed P4 primitives only through a generalized, equally strict owned-artifact
API; it cannot weaken P4's behavior.

## 15. Failure and rollback semantics

Candidate-local failures use stable public codes and retain sanitized evidence:

```text
P5_DESIGN_INVALID
P5_CHECKPOINT_INVALID
P5_REPAIR_INVALID
P5_REPAIR_CONFLICT
P5_STALE_BASE
P5_REPLAY_FAILED
P5_HARD_QA_FAILED
P5_CORE_VIOLATION
P5_INSTALL_FAILED
```

Run-wide failures additionally include:

```text
P5_MODE_INVALID
P5_OPTIONS_INCOMPATIBLE
P5_AUTHORITY_INVALID
P5_OUTPUT_OWNERSHIP
P5_NO_ELIGIBLE_CANDIDATE
```

Raw exception messages, paths outside the run, provider bodies, environment
values, and input blueprint bytes never enter stable public errors.

On replay, QA, review, hashing, sync, rename, or pointer-promotion failure:

- the prior complete accepted chain remains current;
- the proposed revision is never made current;
- failure evidence records only the stable code and authoritative hashes;
- no selected datapack is installed;
- no pre-existing world or unrelated run byte changes;
- the candidate becomes ineligible if its current accepted chain still has an
  unresolved core violation.

This is rollback to the latest structurally accepted chain, not permission to
rank a playbook-ineligible chain.

## 16. Compatibility boundary

P5 changes may refactor internal workflow code, but `playbook=off` is a strict
compatibility surface.

For fixed mock inputs and seeds, tests must pin pre-P5 values for:

- provider-client creation and call order;
- architecture, build spec, topology, and agent outputs;
- blueprint canonical bytes;
- command/datapack bytes;
- preview and report bytes where timestamps/paths are normalized by existing
  contracts;
- candidate seeds and ranking;
- selected candidate identity;
- returned result shape;
- errors and installation behavior.

The compatibility fixtures are generated once from base commit `ece476d` and
checked in as original test data, not regenerated by P5 production code.

Executable-mode files or fields must not appear in an off-mode result.

## 17. Test strategy

Implementation uses TDD. Tests assert literal contracts and independent
expected values; production validators or serializers cannot compute their own
expected results.

### 17.1 Contract tests

- Exact mode, frozen-design, checkpoint, chain, eligibility, repair-request,
  resolved-patch, and selection schemas.
- Unknown/missing/extra/reordered fields, wrong types, Unicode limits,
  duplicates, stale hashes, wrong candidate IDs, and corpus drift.
- Canonical bytes and independent SHA-256 vectors.
- Exact five-layer order and invalidation table.

### 17.2 Off-path compatibility tests

- Omitted mode and explicit `off` match frozen `ece476d` fixtures.
- Single-candidate and multi-candidate paths retain exact seeds and outputs.
- Mock and injected-LLM call traces are unchanged.
- Existing Stage 7, concept, critic, auto-build, world, and datapack option
  behavior remains unchanged.

### 17.3 Candidate and authority tests

- Executable mode creates exactly three candidates.
- Invalid count/round/force combinations fail before output or provider use.
- Only fifteen core rows participate in eligibility.
- Case patterns and neutral states cannot change eligibility or rank.
- P4 review bytes bind to exact candidate blueprint bytes and exact corpus hash.
- No playbook score exists in public or internal selection contracts.

### 17.4 Repair tests

- Each published variant has positive, inapplicable, malformed, boundary, and
  mutation-resistant tests.
- General paths, arbitrary values, coordinates, blocks, commands, invented IDs,
  and extra fields are rejected.
- Multiple operations are ordered canonically.
- Same-field writes conflict; no partial transaction survives.
- Non-executable/evidence-required rules cannot reach a compiler.
- One candidate cannot consume a second repair budget.

### 17.5 Replay and rollback tests

- Target and downstream hashes change; every upstream byte and hash remains
  identical.
- Replay attempts to create a provider client fail the test.
- Same frozen input, patch, and seed reproduce identical checkpoints, blueprint,
  operations, and datapack bytes.
- Injected failure at every staging, write, chmod, sync, rename, validation, QA,
  review, and pointer-promotion boundary leaves the old pointer unchanged.
- A failed repair retains evidence and rolls back to the latest accepted chain.
- At least one fixture proves massing replay invalidates exactly structure, roof,
  and facade.
- At least one fixture proves structure replay preserves brief/massing and
  invalidates exactly roof/facade.

### 17.6 Selection and mutation tests

- Hard-QA failure is ineligible regardless of score.
- Unresolved core violation is ineligible regardless of score.
- Eligible candidates retain the exact existing ranking order.
- No eligible candidate produces `P5_NO_ELIGIBLE_CANDIDATE` and no install.
- Selected artifacts are revalidated immediately before installation.
- Existing world and unrelated run snapshots are byte-identical before/after
  every rejected path.

### 17.7 Dependency and phase gates

- P5 may import existing production construction modules and P4 deterministic
  review modules.
- P4 remains unable to import construction/pipeline/world modules.
- P5 cannot import visual evaluators, image/model clients, camera/blind-selection
  code, or any future P6 module.
- No real `out/`, `.local/`, provider transcript, checkpoint, or world artifact is
  tracked.

## 18. Acceptance gate

P5 is complete only when one checked-in fixture suite proves all of the
following:

1. Omitted/`off` mode is byte-compatible with the P4 base for single and
   candidate generation.
2. Executable mode produces exactly three candidate evidence trees and exactly
   five checkpoint layers per candidate.
3. Every ranked candidate passes `BlueprintQAAgent` and has no unresolved
   decidable core violation.
4. At least one candidate undergoes one bounded repair whose replay changes only
   the target layer and downstream layers.
5. At least one injected repair failure leaves the prior accepted chain current
   and preserves a sanitized failure record.
6. Repair/replay creates no provider client and is byte-reproducible.
7. If no candidate qualifies, no world/datapack or unrelated run byte changes.
8. Every playbook-driven decision cites an exact reviewed rule ID; existing
   generator behavior not owned by P5 is explicitly labeled
   `existing-heuristic`.
9. All candidate outputs pass the existing hard QA before selection.
10. The selected candidate replays from checkpoints to identical blueprint and
    construction artifact hashes.
11. Full P4 and repository regression suites pass.
12. Public documentation states that P5 proves a minimal executable,
    deterministic control loop only. It makes no visual or aesthetic improvement
    claim and leaves P6 closed.

## 19. Documentation and public claims

P5 completion updates:

- `docs/architecture-playbook/README.md` with the opt-in command, artifact paths,
  current executable rule boundary, and off-mode guarantee;
- a P5 phase report with exact test counts, fixture outcomes, replay hashes, and
  remaining unknown rules;
- the project status documentation without changing P6 or residential-model
  claims.

The report must state:

- which four repairs are executable;
- which eleven core rules remain evidence-required;
- that case patterns are non-authoritative;
- that eligibility is not an aesthetic score;
- that three generated candidates do not demonstrate improved quality;
- that fixed-view rendering and blind comparison remain P6.

## 20. Implementation sequencing constraint

The implementation plan must preserve independently reviewable boundaries:

1. contracts and frozen compatibility fixtures;
2. pure design-layer seams with off-path parity;
3. checkpoint hashing and immutable storage;
4. deterministic P4 eligibility adapter;
5. typed repair registry and compilers;
6. replay and rollback;
7. three-candidate orchestration and existing-ranker integration;
8. CLI, dependency gates, fixtures, and public evidence.

No later task may weaken an earlier authority contract to make an integration
test pass. Every task uses focused RED/GREEN tests, a reviewed completion commit,
and full regression proportional to its dependency surface.
