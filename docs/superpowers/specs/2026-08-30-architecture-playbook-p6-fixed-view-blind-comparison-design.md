# Architecture Playbook P6 Fixed-View and Blind-Comparison Design

**Date:** 2026-08-30  
**Status:** Approved
**Scope:** Complete the six-episode Playbook v0.1 visual-evaluation prerequisite before P7 course expansion

## 1. Decision Summary

P6 will add a hybrid visual-evaluation path around the existing P5 executable design loop:

1. a deterministic offline renderer and six-view manifest provide automated, repeatable visual-regression evidence;
2. a separately authorized disposable Minecraft world provides the formal human-comparison captures;
3. visual observations cite specific image evidence and use bounded categorical judgments rather than a synthetic aesthetic score;
4. four anonymous solutions—three playbook candidates and one `playbook=off` baseline—produce all six pairwise A/B/tie decisions;
5. the result opens P7 only after the full evidence package is complete, regardless of which solution wins.

P6 does not change the playbook rules, add new evidence thresholds, modify the P5 candidate selector, or claim aesthetic improvement before the human blind records exist.

## 2. Starting State

The verified starting point is commit `70ef9b1`:

- P1–P5 are complete under their published boundaries.
- The six pilot episodes produced 21 reviewed rules, 15 core programs, and six case patterns.
- P5 creates three candidate slots, five design-layer checkpoints, at most one bounded repair per candidate, and an immutable selection generation.
- Existing `preview.html` files show floor plans and QA data. They are not exterior renders and cannot satisfy P6.
- No fixed-view manifest, capture contract, visual observation report, anonymous comparison manifest, or human `PreferenceRecord` exists.
- A real P5 run may contain an incomplete candidate slot. P6 must reject such a cohort rather than silently replace it.

## 3. Goals

- Freeze a reproducible four-solution evaluation cohort.
- Produce exactly six required exterior views for every solution under one camera protocol.
- Bind every image to its candidate, blueprint, build operations, renderer or Minecraft environment, and protocol version by SHA-256.
- Separate hard QA, rule eligibility, visual observation, and human preference authority.
- Collect all six unordered pairs among four solutions with independently randomized left/right order.
- Produce an explicit next action whether playbook candidates win, lose, or tie.
- Freeze the P6 fixture so every P7 chapter can run the same non-regression check.
- Keep all real generated worlds, datapacks, screenshots, and private identity mappings out of Git.

## 4. Non-Goals

- No bulk processing of the remaining 44 episodes.
- No changes to the 21 v0.1 rules or their maturity.
- No new executable repair operations.
- No visual or playbook scalar score.
- No use of the existing structural `templateAestheticReviewAgent` as image evidence.
- No live model call in automated tests.
- No installation into an existing user world.
- No automatic inference of human aesthetic preference.
- No claim that an offline renderer exactly reproduces Minecraft lighting or texture behavior.

## 5. Evaluation Cohort

### 5.1 Frozen request

P6 v0.1 uses one canonical request:

```text
Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base
```

The root seed is `424242`. The request bytes, seed, generator commit, playbook corpus hash, rule version, Minecraft target, and all option values are recorded before generation. Changing any one creates a new protocol version and cannot overwrite the original cohort.

The initial target is Minecraft Java `1.21.9`. Its datapack must use the required `min_format: 88` and `max_format: 88` metadata and the `minecraft:iron_chain` block ID at serialization.

### 5.2 Four solutions

The cohort contains:

- `playbook-candidate-01`;
- `playbook-candidate-02`;
- `playbook-candidate-03`;
- `baseline-current` generated with `playbook=off`.

The three playbook solutions come from one deterministic P5 run with `mode=mock`, three candidate slots, one candidate round, and the frozen root seed. The baseline uses the same prompt, root seed, generator commit, Minecraft target, and non-playbook options.

P5 selection rank is recorded but does not change which three candidate slots enter P6. P6 compares the fixed cohort, not only the P5 winner.

### 5.3 Cohort preflight

Before rendering, every solution must have:

- one canonical blueprint;
- one canonical operation list and build function;
- passing hard QA;
- stable bounds and a resolved south-facing main entry;
- no symlinked or non-regular authority files;
- SHA-256 bindings from the cohort manifest to every input;
- for playbook candidates, a complete current chain and all five P5 checkpoints;
- for the baseline, explicit `playbook=off` provenance.

Rule eligibility is recorded separately. A hard-QA-valid playbook candidate may carry unresolved or violated advisory rules, but the report must expose that state. A missing candidate blueprint, failed hard QA, missing checkpoint, hash mismatch, or unresolved entry orientation blocks the cohort. P6 never fills a missing slot from another run.

If the current P5 path cannot produce all three preflight-valid slots from the frozen request, P6 stops with `P6_COHORT_INCOMPLETE`. Correcting the P5 generation or fixture is then a separately reviewed task; the evaluator cannot manufacture a replacement.

## 6. Architecture and Dependency Direction

New code lives under:

```text
src/playbook/p6/
  contracts.js          strict P6 data contracts and stable error codes
  cohort.js             read-only cohort discovery and provenance binding
  cameras.js            fixed six-view camera derivation
  offlineRenderer.js    deterministic reference rendering
  captures.js           Minecraft capture-session and imported-image validation
  observations.js       bounded image-grounded visual observation records
  comparisons.js        anonymization, pair generation, and PreferenceRecord validation
  report.js             deterministic gate and operating reports
  storage.js            owned output publication under an ignored run directory

src/runArchitecturePlaybookP6.js
test/playbookP6*.test.js
```

P6 is a consumer of frozen P5 artifacts. P5 must never import P6 code, image data, preference records, or visual conclusions. Existing P4/P5 dependency gates remain in force and gain explicit tests proving this one-way dependency.

The P6 CLI writes only beneath a caller-supplied P5 run directory or a disposable test root. It does not become part of the default construction pipeline and does not change `npm start` or `playbook=off` behavior.

## 7. Fixed Six-View Protocol

### 7.1 Canonical orientation

Every cohort blueprint must expose a main entry on the south side. Rendering preserves the building geometry and world axes; it does not rotate individual solutions to find a better angle. A solution without an unambiguous south-facing entry fails preflight.

Let:

- `C = (centerX, centerY, centerZ)` be the center of the inclusive blueprint bounds;
- `W`, `H`, and `D` be the inclusive width, height, and depth;
- `R = max(W, D)`;
- `eyeY = minY + max(2, 0.45 * H)`;
- `far = max(12, 1.35 * R)`.

Camera values are stored as decimal strings rounded to six places before hashing.

### 7.2 Required views

| View ID | Position | Target | Purpose |
| --- | --- | --- | --- |
| `front-south` | `(centerX, eyeY, maxZ + far)` | `(centerX, eyeY, centerZ)` | principal façade and hierarchy |
| `side-east` | `(maxX + far, eyeY, centerZ)` | `(centerX, eyeY, centerZ)` | side façade and depth |
| `quarter-southeast` | `(maxX + 0.95R, eyeY + 0.10H, maxZ + 0.95R)` | `C` | volume attachment and roof silhouette |
| `quarter-southwest` | `(minX - 0.95R, eyeY + 0.10H, maxZ + 0.95R)` | `C` | opposite volume relationship |
| `roof-birdseye` | `(centerX, maxY + max(16, 1.50R), centerZ)` | `C` | roof composition and footprint |
| `entry-eye` | eight blocks south of the main-entry center at player eye height | main-entry center | approach, scale, and entrance legibility |

The renderer may increase distance uniformly if a bounds-framing calculation proves clipping, but it must do so for the same view across all four solutions and record the derived distance. It cannot choose candidate-specific artistic angles.

### 7.3 Frozen visual settings

Required settings are:

- 1920×1080 output;
- horizontal FOV 70 degrees;
- 16:9 aspect ratio;
- clear weather;
- time 6000;
- default Minecraft textures with no shader pack;
- fancy graphics;
- clouds off;
- entities and particles absent from the evaluation plot;
- GUI, hand, crosshair, chat, subtitles, and debug overlays hidden;
- identical render distance and client options for all solutions.

The capture manifest records the exact game version, client options hash, resource-pack list, viewport, FOV, time, weather, camera position, camera orientation, world identifier hash, build-function hash, and image hash.

Night views are outside P6 v0.1 and cannot replace a required view.

## 8. Hybrid Rendering and Capture

### 8.1 Deterministic offline reference

The offline renderer consumes canonical blueprint operations and the fixed camera manifest. It produces six PNG files per solution without reading a Minecraft world. It uses a frozen material-role palette and deterministic lighting sufficient to expose massing, roof, façade rhythm, and entry location.

Offline images support:

- camera math tests;
- crop and framing checks;
- byte-stable visual regression in the supported renderer environment;
- early detection of missing or empty geometry;
- P7 chapter non-regression.

They are clearly labeled `reference-render` and are not evidence that Minecraft itself displayed the build correctly.

### 8.2 Formal Minecraft capture

The formal blind comparison uses screenshots captured in Minecraft Java 1.21.9 from an explicitly authorized disposable world. The P6 tooling may prepare validated datapacks, camera commands, build anchors, and a capture checklist, but it must stop before creating or changing a world unless the user authorizes that exact disposable target.

The capture session uses four isolated plots with identical ground, spacing, biome, and lighting conditions. Installation uses the existing hardened P5 installer without weakening its POSIX or ownership guarantees. Automated tests use disposable POSIX directories, never WSL v9fs or the real build-lab world.

Imported screenshots are accepted only when:

- all 24 required `(solution, view)` combinations exist exactly once;
- each file is a regular PNG within the owned capture root;
- dimensions are exactly 1920×1080;
- hashes and capture metadata are complete;
- no filename or embedded public label reveals candidate identity;
- all captures use one environment hash.

## 9. Visual Observation Contract

Visual review is downstream of passing hard QA and successful capture. It cannot change geometry, eligibility, P5 selection, or preference truth.

Each observation contains:

```text
observation_id
solution_authority_hash
capture_manifest_hash
view_ids
design_layer
criterion
rating: strong | usable | weak | fail | unknown
observable_paraphrase
evidence_regions
rule_ids
limitations
reviewer_kind: human | model-assisted
reviewed_at
```

Criteria are limited to:

- massing hierarchy;
- structural legibility;
- silhouette;
- roof composition;
- façade rhythm and depth;
- material-role legibility;
- detail density;
- scene integration;
- style consistency.

An observation must cite at least one screenshot ID and a bounded region or whole-frame statement. Hidden intent, historical authenticity, structural engineering truth, and unseen interiors cannot be inferred from an exterior image. If the image does not establish the criterion, the rating is `unknown`.

No rating is converted into a scalar or used to preselect the human winner.

## 10. Anonymous Blind Comparison

### 10.1 Identity separation

The comparison compiler assigns four random opaque solution codes and stores the identity map only in a private file under the ignored P6 run. Public comparison pages and filenames contain no candidate number, baseline label, P5 rank, rule status, path, prompt transcript, or provider information.

The identity map is hash-bound to the cohort and is revealed only after all six valid preference records are sealed.

### 10.2 Pair coverage and order

Four solutions produce exactly six unordered pairs. The compiler:

1. enumerates all six pairs once;
2. shuffles pair presentation order from a private randomization seed;
3. randomizes left/right order independently for each pair;
4. presents the same six aligned views for left and right;
5. records the comparison manifest hash with every response.

The user chooses `left`, `right`, or `tie`, plus:

- confidence: `low`, `medium`, or `high`;
- zero or more reason tags from a frozen vocabulary;
- optional original free-text rationale.

Reason tags cover massing, hierarchy, silhouette, roof, façade, materials, detail, scene, style consistency, and capture uncertainty. They describe the preference; they do not manufacture a rule conclusion.

### 10.3 Human authority

Only the user supplies preference choices. A model may describe visible differences or validate record structure but cannot fill missing choices, break ties, or relabel a result to favor the playbook.

P6 pauses at `P6_HUMAN_PREFERENCE_REQUIRED` until all six records exist. Partial records remain private drafts and cannot open P7.

## 11. Gate Decision and Next Actions

P6 passes when:

- the frozen cohort contains four preflight-valid solutions;
- the six-view protocol reproduces from the manifest;
- 24 offline reference images and 24 formal Minecraft captures validate;
- every non-`unknown` visual conclusion cites visible evidence;
- all six pairwise human records validate against one comparison manifest;
- identity reveal and preference aggregation are deterministic;
- a hash-bound, sealed gate report states the outcome, failures, and next action;
- P4, P5, `playbook=off`, and six-episode golden regressions remain passing;
- Git tracks no generated world, datapack, private mapping, or real capture output.

The gate report may conclude:

- `playbook-supported`: preference records support at least one playbook solution over the baseline;
- `inconclusive`: ties, low confidence, or mixed evidence do not support a directional claim;
- `baseline-supported`: the baseline is preferred over all playbook solutions;
- `capture-invalid`: visual evidence is not comparable.

These labels are descriptive, not statistical proof of general quality.

If the baseline is supported or the outcome is inconclusive, the next action must target one of:

- rule-to-checker mapping;
- executable design-layer expression;
- frozen cohort generation;
- camera/capture validity;
- visual observation wording.

P7 cannot be opened by adding more episodes to hide a P6 failure. After the correction loop, the same frozen prompt and comparison protocol are rerun as a new, lineage-linked P6 generation.

## 12. Storage and Publication

Checked-in P6 definitions live under:

```text
docs/architecture-playbook/evaluation/p6-v0.1/
  fixed-request.json
  camera-protocol.json
  reason-tags.json
  schemas/
```

Checked-in evidence after completion is limited to original reports, hashes, counts, frozen protocol files, and permissible derived summaries:

```text
docs/architecture-playbook/reports/p6-fixed-view-blind-comparison.md
```

Ignored real outputs live under:

```text
out/<run>/playbook-p6/
  cohort/
  reference-renders/
  capture-session/
  minecraft-captures/
  observations/
  blind-comparison/
  gate/
```

The anonymous identity map, partial preference drafts, worlds, datapacks, screenshots, provider material, and rendered buildings remain untracked. The final public report may reveal aggregate identities after sealing, but it does not publish private free-text feedback unless the user approves it.

## 13. Failure Model

Stable public failure codes are:

- `P6_OPTIONS_INVALID`;
- `P6_COHORT_INCOMPLETE`;
- `P6_AUTHORITY_INVALID`;
- `P6_CAMERA_PROTOCOL_INVALID`;
- `P6_RENDER_FAILED`;
- `P6_CAPTURE_AUTHORIZATION_REQUIRED`;
- `P6_CAPTURE_INVALID`;
- `P6_OBSERVATION_INVALID`;
- `P6_COMPARISON_INVALID`;
- `P6_HUMAN_PREFERENCE_REQUIRED`;
- `P6_GATE_FAILED`;
- `P6_INSTALL_FAILED`.

Public errors contain only the stable code. Private reports may contain bounded, sanitized facts and hashes, never complete prompts from providers, environment values, absolute private paths, or world contents.

Existing valid P6 generations are immutable. A failed replacement leaves the previous generation and pointer unchanged. Cleanup may delete only objects created and identity-bound by the current P6 invocation.

## 14. Testing Strategy

Implementation follows TDD. Tests use synthetic blueprints, tiny deterministic operation sets, generated PNG fixtures, and disposable POSIX directories.

### 14.1 Contracts and authority

- reject unknown fields, invalid enums, duplicate IDs, dangling hashes, and wrong school/version bindings;
- reject symlinks, directories in place of files, path escapes, foreign files, and authority drift;
- prove P5 never imports P6 and P6 never grants authority back to P5;
- prove generated and private outputs remain ignored.

### 14.2 Cohort

- accept exactly three playbook candidates plus one off baseline;
- reject missing slots, cross-run substitution, failed hard QA, missing checkpoints, and mixed prompts/seeds/commits;
- preserve rule eligibility as separate evidence rather than an aesthetic filter;
- prove cohort compilation is byte-stable.

### 14.3 Cameras and offline rendering

- derive literal expected camera vectors from hand-checked bounds;
- prove translations preserve relative camera geometry;
- reject unresolved entry orientation and clipped framing;
- verify exactly six 1920×1080 PNGs per solution;
- compare renderer output hashes in the frozen supported environment;
- prove rendering cannot mutate source blueprints or P5 artifacts.

### 14.4 Capture import

- reject missing, duplicate, mislabeled, wrong-size, corrupt, identity-leaking, or mixed-environment images;
- test capture preparation only in disposable directories;
- assert no automated test resolves or writes the real build-lab path;
- require explicit authorization before a world-mutating command can be emitted or run.

### 14.5 Observations and preferences

- reject non-`unknown` observations without screenshot evidence;
- reject scalar scores and unsupported criteria;
- enumerate exactly six unordered pairs;
- prove private-seed pair and side randomization is deterministic;
- reject duplicate, missing, unrecognized, unsealed, or identity-mismatched preference records;
- prove no model or default can supply a human choice.

### 14.6 Compatibility and regression

- exact P4 and P5 focused gates;
- `playbook=off` byte-compatibility fixture;
- P3 managed-artifact drift check;
- full repository regression;
- 1.21, 1.21.1, and 1.21.9 datapack compatibility checks;
- repository hygiene and ignored-output checks.

## 15. P7 Integration

P6 completion freezes:

- the canonical request bytes and root seed;
- the cohort and camera protocol schemas;
- the six view IDs and environment settings;
- the observation vocabulary;
- the comparison and preference contracts;
- the initial passing or corrective P6 generation.

Every P7 chapter must rerun the same P4 shadow, P5 executable, P6 offline visual, and golden-flow tests before promoting its playbook version. Formal Minecraft and human comparisons are required when a chapter enables a new design layer, materially changes visible output, or the frozen regression detects a change that cannot be classified from offline evidence. A failed chapter remains unpromoted and the last passing playbook version stays pinned.

## 16. Implementation Order

After written-spec approval, the implementation plan will split P6 into reviewable checkpoints:

1. contracts, fixed request, and cohort preflight;
2. camera protocol and deterministic offline renderer;
3. capture-session preparation and PNG import validation;
4. image-grounded observation records;
5. anonymization and six-pair preference collection;
6. gate report, compatibility suite, and public operating report;
7. explicitly authorized disposable-world capture and the human blind choices.

Every checkpoint uses a fresh implementer and separate specification and code-quality reviewers. No implementer approves its own work.
