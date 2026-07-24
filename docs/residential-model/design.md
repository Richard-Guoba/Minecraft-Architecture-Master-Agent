# Residential Learned House Renderer Program Design

**Date:** 2026-07-24

**Status:** approved in conversation; written specification pending owner review

**Scope:** program-level design for a residential `HouseSpec -> HouseScene` learned renderer. Each implementation subproject receives its own detailed plan and evidence gate.

## 1. Purpose

The project needs a clear reason to train a model. Training is not an independent goal, and a lower model loss is not useful unless the learned system removes a real limitation from the Minecraft construction workflow.

The selected product goal is:

```text
User request
-> LLM produces a detailed semantic HouseSpec JSON
-> a learned structure renderer generates the whole-house spatial design
-> a learned decoration renderer invents and places survival-ready room scenes
-> deterministic code validates, performs bounded local repair, resolves exact blocks, and exports a datapack
```

The trained system replaces hand-authored architectural placement rules as the primary source of geometry and decoration. Deterministic code remains necessary, but its role changes from architect to building inspector, Minecraft adapter, and exporter.

Version one specializes in complete, furnished, survival-ready residential houses. It does not attempt to model arenas, temples, fortresses, industrial buildings, or every Minecraft structure type.

## 2. Current project evidence and diagnosis

### 2.1 Current production flow

The active `construction_method_v1` production path is:

```text
Prompt
-> Architect / Planner / CreativeDesign semantic JSON
-> deterministic CSG / BSP / A* geometry
-> deterministic interiors and decoration
-> QA / repair / optimizer
-> Minecraft Java datapack
```

This path is executable and testable, but its output quality is limited by the architectural knowledge encoded in fixed JavaScript rules. Improving it requires the author to translate increasingly subtle architectural and decorative judgment into technical placement rules. The rules also encourage repeated spatial patterns.

### 2.2 Current trained model

The current PyTorch model is `TinyVoxelCompletionModel`. Its input is a partially masked `32 x 32 x 32` voxel patch. Its outputs are:

1. air versus non-air occupancy at masked positions; and
2. one of eight broad non-air semantic material families.

It does not receive HouseSpec JSON, generate a complete requested house, identify rooms, generate survival functions, or preserve individual decorations. Decorations are collapsed into broad `detail` or `other` categories.

The latest `balanced-v2-7101` experiment provides useful negative and positive evidence:

- masked local occupancy can be learned;
- validation occupancy F1 was strong;
- source-level test semantic generalization remained weak;
- architectural-shape and rare-detail performance remained poor; and
- the checkpoint is not connected to primary generation.

The current checkpoint therefore remains an experimental baseline for data loading, training mechanics, resume, metrics, and local completion. It is not the starting product architecture and is not automatically reused as a weight initialization.

### 2.3 Historical conditional experiment

The repository history also contains a small conditional VAE foundation that encoded a condition vector and predicted coarse envelope, space, and site layers. That experiment established useful interface ideas, including a condition hash, a canonical `64^3` plan, validation, repair, and shadow comparison. It did not produce exact furnished residential scenes and was fixture-scale rather than a production model.

The new program reuses proven boundary ideas, not old quality claims.

## 3. Approved decisions

The owner approved the following decisions in conversation:

- The trained system is a core renderer, not merely a scorer, retriever, or optional patch completer.
- The LLM emits detailed semantic requirements but no block or object coordinates.
- Learned models own exact architecture, room realization, facade composition, circulation, optional object inventory, and decoration placement.
- Deterministic code owns validity, bounded repair, exact block-state resolution, optimization, export, and truthful fallback.
- Output uses architectural and material roles rather than requiring the models to predict every exact Minecraft block state.
- Decoration is a first-class objective and includes blocks, attached objects, and entities.
- The renderer may invent suitable decorations from room and style context.
- Version one supports complete furnished residential houses only.
- Every accepted generated house is survival-ready and functionally usable.
- The maximum version-one canvas is `64 x 64 x 64` blocks.
- The same explicit seed reproduces the same result; normal generation creates and records a fresh seed by default.
- The system uses two coordinated learned stages: structure first and room-aware decoration second.
- A larger paired dataset is a foundational deliverable.
- The first 50-100 accepted houses form a fully reviewed golden set.
- Later data uses confidence-based selective review and deterministic random audits rather than complete manual review.
- The target training device is the RTX 4060 Laptop GPU visible to WSL, with 8,188 MiB VRAM.
- Long final runs may last one or several days but must support exact atomic resume.

## 4. Approaches considered

### 4.1 One monolithic dense `64^3` model

A single model could consume HouseSpec and generate structure, rooms, and decorations in one output.

Advantages:

- one end-to-end learned mapping;
- no explicit boundary between structure and decoration; and
- maximum theoretical coupling between all decisions.

Disadvantages:

- air and large structural surfaces dominate sparse decoration;
- training and debugging failures are difficult to isolate;
- dense full-resolution activation memory is poorly matched to an 8 GB GPU;
- individual paintings, item frames, heads, lights, and object relationships are poorly represented by one flat cell label; and
- it demands substantially more paired data before useful behavior appears.

This approach is rejected for version one.

### 4.2 Hierarchical learned renderer

The selected architecture has:

1. a HouseSpec-conditioned whole-house structure renderer operating through a compressed discrete 3-D representation; and
2. a room-aware, object-centric decoration renderer operating with full-resolution local evidence.

Advantages:

- learned models still own all creative spatial decisions;
- decoration receives a dedicated representation and loss;
- each stage has interpretable targets and independent evaluation;
- compressed whole-house generation and local decoration fit the target GPU better; and
- structure and decoration datasets can mature at different rates without reverting to fixed architectural design rules.

Risks:

- structure errors can propagate into decoration;
- two contracts and two checkpoints must stay compatible; and
- inference and evaluation are more complex.

These risks are handled through versioned contracts, predicted-structure mixing during decoration training, joint runtime validation, and checkpoint manifests.

### 4.3 Deterministic shell plus learned decoration

The existing CSG/BSP/A* flow could keep generating the building while a model decorates rooms.

Advantages:

- lowest data and compute requirement;
- quickest route to more varied interiors; and
- strongest early structural reliability.

Disadvantage:

- it preserves the fixed architecture system that motivated this project.

This remains a useful comparison baseline, not the product direction.

## 5. Production architecture and authority

### 5.1 Generation flow

```text
User prompt
-> LLM HouseSpec v1
-> HouseSpec validator
-> learned structure renderer
-> learned decoration renderer
-> HouseScene v1
-> deterministic semantic and Minecraft validation
-> bounded repair or learned regeneration
-> palette/block-state resolver
-> operation optimizer
-> Minecraft Java 1.21.1 datapack
```

### 5.2 Learned authority

The learned stages own:

- exact massing and volume composition;
- room geometry and realization of adjacency requirements;
- entrance, corridor, vertical circulation, door, window, stair, and opening placement;
- facade rhythm, roof expression, and immediate site composition;
- the optional object inventory appropriate to each room;
- furniture grouping, focal points, lighting composition, decorative density, and exact placement;
- placement and orientation of attached objects and decorative entities; and
- seed-controlled variation under stable HouseSpec constraints.

### 5.3 Deterministic authority

Deterministic code owns:

- JSON/schema, vocabulary, dimension, and manifest validation;
- legal Minecraft Java 1.21.1 block IDs, states, block entities, attachments, and entity syntax;
- entrance and room reachability;
- stair continuity between occupied floors;
- door, window, station, and furniture clearance;
- support and collision checks;
- required survival-function checks;
- bounded local repair;
- architectural/material role to exact block family resolution;
- Minecraft command optimization and datapack `pack_format: 48` serialization;
- complete provenance, failure, repair, and fallback reporting; and
- deterministic replay when an explicit seed is provided.

### 5.4 Hard repair boundary

Allowed repair examples:

- rotate or shift one invalid object within its valid local placement set;
- clear a small obstruction from required interaction or circulation clearance;
- repair an illegal orientation or block-state combination;
- add a missing local attachment support;
- remove an unsafe optional decoration while recording the removal; and
- merge or normalize an equivalent representation without changing design intent.

Forbidden repair examples:

- redraw the room plan;
- invent a missing entrance or stair system;
- redesign the facade or roof;
- furnish an empty room through deterministic room templates;
- synthesize a missing required survival program with fixed placement rules; or
- turn a rejected learned shell into a deterministic house while reporting learned success.

A blocker outside the bounded repair set causes learned regeneration or honest rejection.

## 6. HouseSpec v1

### 6.1 Contract purpose

HouseSpec is detailed enough to state the design program and hard constraints. It intentionally excludes voxel coordinates, object anchors, block commands, and finalized geometry.

The canonical source identifier is:

```text
residential-housespec-v1
```

Required top-level fields are:

```text
source
schema_version
minecraft_version
request
generation
envelope
style
palette
rooms
relationships
facade
roof
site
survival
decoration
constraints
```

### 6.2 Identity and generation

`source` is `residential-housespec-v1`.

`schema_version` is integer `1`.

`minecraft_version` is `1.21.1` for version one.

`request` contains a stable request ID, original prompt, language, and normalized residential typology.

`generation` contains:

- a signed 32-bit integer seed;
- the seed source, either `automatic` or `explicit`;
- a requested candidate count of one for a single renderer call; and
- a variation policy stating which semantic requirements must remain invariant.

Normal runtime creates a fresh automatic seed for every request and records it. Explicit reuse reproduces the same sampling protocol.

### 6.3 Envelope

`envelope` contains:

- `max_width`, `max_depth`, and `max_height`, each an integer from 1 through 64;
- `floors`, an integer from 1 through 5;
- `floor_height_range`, an inclusive integer pair;
- `front_side`, one of `north`, `south`, `east`, or `west`;
- `site_required`, a boolean; and
- setback and immediate-site requirements expressed as numeric ranges rather than coordinates.

The model may generate smaller occupied bounds but may not exceed any maximum.

### 6.4 Rooms and relationships

Each room contains:

- stable `id`;
- controlled residential `type`;
- zero-based `floor`;
- `required`;
- `target_area`, an inclusive `[minimum, maximum]` block-area range;
- `importance`;
- `privacy`;
- `daylight`;
- `decoration_density`;
- required, preferred, and forbidden functions;
- required, preferred, and forbidden object roles; and
- optional mood and focal-point descriptions.

Version-one room types include:

```text
entry
living_room
dining_room
kitchen
bedroom
primary_bedroom
bathroom
study
storage
utility
workshop
stairs
corridor
landing
balcony
porch
garage
sunroom
```

Each relationship names `from`, `to`, and one controlled kind:

```text
connected
adjacent
near
separated
above
below
opens_to
shares_daylight_side
```

Relationships express requirements, not final coordinates.

### 6.5 Style, palette, facade, roof, and site

`style` records a controlled residential style family, secondary style tags, mood, symmetry preference, ornament level, and composition intent.

`palette` maps versioned material roles to validated base Minecraft block families. It does not provide directional states. Required roles are:

```text
foundation
wall_primary
wall_secondary
floor_primary
ceiling_primary
roof_primary
trim_primary
wood_primary
glass_primary
door_primary
stair_primary
fabric_primary
light_primary
accent_primary
landscape_primary
```

`facade`, `roof`, and `site` describe semantic goals such as rhythm, transparency, overhang, roof character, entrance emphasis, garden mood, water preference, and immediate approach. They do not contain final cell positions.

### 6.6 Survival contract

Every HouseSpec requires:

```text
reachable_entrance
connected_required_rooms
connected_occupied_floors
bed
storage
crafting
cooking_or_smelting
safe_lighting
usable_clearance
```

The contract may also request a furnace, smoker, blast furnace, food storage, enchanting, brewing, armor storage, or other survival functions.

### 6.7 Decoration contract

`decoration` contains:

- default and per-room density;
- required, preferred, and forbidden object roles;
- thematic tags;
- focal-point intent;
- symmetry and clustering preferences;
- `invent_optional_objects: true`; and
- maximum clutter and minimum circulation-clearance policies.

The learned decorator may invent optional objects consistent with room type, style, palette, and survival usability.

## 7. HouseScene v1

### 7.1 Artifact boundary

HouseScene is the canonical learned output. The runtime object may contain tensors in memory. The durable artifact uses a JSON manifest plus compressed binary grids and an object-instance document; it does not expand all `64^3` cells into a huge JSON array.

The canonical source identifier is:

```text
residential-housescene-v1
```

### 7.2 Dense layers

The `64 x 64 x 64` canvas contains aligned categorical layers:

1. `structure_role`;
2. `room_id`;
3. `space_role`; and
4. `material_role`.

The version-one structural-role vocabulary is:

```text
air
outside
ground
foundation
floor
wall
ceiling
roof_full
roof_stair
roof_slab
opening
door
window
stair
ladder
railing
support
water
circulation_reserve
interaction_reserve
```

The version-one space-role vocabulary is:

```text
outside
room
circulation
vertical_circulation
void
site
```

The material-role vocabulary is versioned and references the HouseSpec palette. Material roles remain separate from structural roles so the same learned composition can use different valid palettes.

### 7.3 Object instances

Sparse furniture, survival functions, decoration, and attached entities are represented as object instances rather than collapsed into one generic voxel class.

Each object contains:

- stable object `id`;
- controlled `role`;
- `room_id`;
- integer `anchor`;
- `facing`;
- attachment type;
- occupied, support, and interaction-clearance cells;
- material role;
- optional group ID;
- required/optional status;
- generation confidence; and
- model-stage provenance.

Version-one functional and decorative roles include:

```text
bed
storage
crafting
furnace
smoker
blast_furnace
cooking_surface
table
seating
bookshelf
shelf
lighting
utility
food_display
carpet
rug
plant
flower_pot
painting
item_frame
mob_head
wall_ornament
curtain
screen
banner
candle
lantern
sculpture
display_object
exterior_ornament
```

Objects that are blocks, block entities, or entities share the semantic object contract but use different exact-block resolver adapters.

### 7.4 Scene groups

Objects may belong to learned groups such as:

```text
bed_ensemble
cooking_station
crafting_station
dining_set
reading_corner
gallery_wall
storage_wall
lighting_cluster
planting_cluster
entrance_composition
```

Group labels allow evaluation of coherent scenes rather than only isolated object accuracy.

### 7.5 Generation evidence

Every HouseScene manifest records:

- HouseSpec hash;
- seed and sampling protocol;
- structure and decoration model versions;
- checkpoint hashes;
- dataset and split hashes;
- vocabulary versions;
- per-stage confidence summaries;
- raw and repaired artifact hashes;
- repair delta;
- validation result; and
- fallback status.

## 8. Residential data program

### 8.1 Source role

The owner locates promising complete furnished residential structures and places them into named local inbox batches with the source URL and available author/license context.

The project tooling:

- inventories the inbox;
- creates immutable local source records;
- validates provenance and local-training eligibility metadata;
- parses and fingerprints candidates;
- extracts canonical evidence;
- drafts labels;
- supports review;
- freezes dataset snapshots; and
- reports reasons for every acceptance, deferral, or rejection.

No implementation step automatically searches websites, downloads new payloads, publishes data, or shares a derived artifact.

### 8.2 Local roots

All real inputs and derived artifacts remain below:

```text
.local/residential-model/
  inbox/
  quarantine/
  sources/
  annotations/
  reviews/
    golden/
    selective/
  snapshots/
  runs/
  reports/
```

This root is ignored by Git. Cleanup must not delete, move, overwrite, publish, or expose existing `.local/` content.

### 8.3 SourceProfile

Every candidate receives a local SourceProfile containing:

- stable case and batch IDs;
- source URL;
- title and claimed author;
- license text or status;
- allowed use evidence;
- acquisition timestamp;
- original filename and format;
- byte size and SHA-256 hash;
- source project and asset-family identity;
- parser result;
- occupied bounds;
- exact and structural fingerprints;
- completeness, residential, furnishing, and survival evidence;
- eligibility state and reason;
- review status; and
- append-only decision history.

The immutable source bytes are never edited in place.

### 8.4 Format boundary

The first intake implementation supports formats for which the repository has or adds a bounded parser and exact round-trip fixtures:

- Sponge/WorldEdit `.schem`;
- legacy `.schematic`; and
- vanilla Java structure `.nbt`.

Unsupported formats, including `.litematic` until a separately tested parser exists, are deferred with their source profile intact. Files are never renamed to bypass format validation.

### 8.5 Training eligibility

A case is eligible only when:

- it is one complete, independently usable residential house;
- it contains meaningful furnishing and decoration evidence;
- it contains or can validly support the required survival core;
- all occupied extents fit within `64 x 64 x 64`;
- it parses within bounded size and NBT-complexity limits;
- its relevant blocks, block entities, and attached entities resolve;
- its source and local-training-use record is present;
- it is not an exact duplicate;
- its derivative family is recorded;
- its canonical extraction is lossless for supported content;
- its labels reach the required confidence or human confirmation; and
- it passes visual-quality review at the required review level.

Oversized cases are deferred. They are not cropped, rescaled, tiled, or silently split into independent houses.

Multipart complexes, fragments, empty shells, unfurnished houses, and multi-house collections that cannot be separated without manual reconstruction are deferred.

### 8.6 Canonical extraction

Extraction preserves:

- exact block IDs and properties;
- block entities;
- supported attached entities;
- local occupied bounds;
- translation into the `64^3` canvas;
- canonical front direction;
- room and enclosure evidence;
- openings, stairs, supports, and circulation evidence;
- support surfaces;
- object candidates;
- interaction clearance candidates;
- survival-station evidence; and
- material-to-role evidence.

The original source remains unchanged. Rotation augmentation happens only after the source split is frozen.

### 8.7 Annotation

Each label field records provenance:

```text
parsed
derived
llm_draft
human_confirmed
human_corrected
```

Each non-human label records confidence and evidence references.

The annotation path is:

```text
canonical extraction
-> deterministic feature evidence
-> LLM HouseSpec and room/object draft
-> schema and consistency validation
-> confidence triage
-> golden or selective review
-> immutable approved annotation revision
```

The LLM may interpret style, room purpose, grouping, and design intent. It may not rewrite the canonical house output to match its description.

### 8.8 Golden and selective review

The first 50-100 eligible houses form the golden set. Every golden case receives synchronized review of:

- source rendering;
- canonical block rendering;
- inferred room map;
- object and decoration instances;
- survival functions;
- generated HouseSpec;
- low-confidence evidence; and
- final corrections.

After the annotation pipeline reaches the gold quality gate, expansion review includes:

- every low-confidence case;
- every novel object, style, format, or source family;
- every automatic consistency failure;
- every near-duplicate or derivative ambiguity; and
- a deterministic 5-10% random audit of otherwise accepted cases.

This makes the owner a quality reviewer rather than a manual annotator for thousands of cases.

### 8.9 Dataset snapshots and leakage prevention

Each snapshot freezes:

- accepted case IDs and annotation revisions;
- source and derivative groups;
- vocabulary and schema versions;
- canonical target hashes;
- split assignments;
- augmentation namespace;
- dataset manifest hash; and
- aggregate class, room, style, size, source, and quality reports.

The source-family split is `70/15/15` for train/validation/test.

Complete source and derivative families are split before rotations, palette changes, room extraction, crops, or other augmentation. Every derivative inherits the source assignment.

Once a case enters validation or test, it never enters training in a later snapshot. Test remains untouched until the predeclared test gate.

### 8.10 Data scale stages

- `50` reviewed houses: minimum golden foundation and pipeline coverage.
- `100` reviewed houses: gold pilot snapshot and early held-out learning evidence.
- approximately `500` houses: selective-review conditional-completion program.
- approximately `2,000+` houses: full-generation and source-generalization program after earlier gates pass.

Synthetic and current deterministic-generator houses may be used as fixtures, baselines, or auxiliary experiments. They do not count as independent real authored houses and do not dominate the training distribution.

## 9. Learned model design

### 9.1 Structured HouseSpec encoder

The condition encoder does not flatten the JSON into one hash vector.

It uses:

- separate categorical embeddings for style, room type, relation type, palette role, facade, roof, site, and survival fields;
- normalized numeric embeddings for bounds, floors, area ranges, density, and other continuous values;
- a set/graph encoder over room nodes and relationship edges;
- pooled global condition tokens; and
- classifier-free condition dropout during training.

The encoded condition is available to every scale of the structure generator and to the decoration model.

### 9.2 Structure representation autoencoder

A lightweight 3-D discrete autoencoder learns:

```text
64^3 aligned HouseScene structure layers
<-> compact discrete latent grid
```

The encoder and decoder use small residual 3-D convolution blocks, GroupNorm, early downsampling, and multi-head categorical reconstruction.

R6 evaluates fixed `8^3` and `16^3` latent candidates. The selected latent is the smallest candidate that:

- reaches G0 reconstruction thresholds;
- preserves openings, stairs, room boundaries, and rare supported roles;
- stays below the resource gate; and
- produces a stable codebook without collapse.

This is a measured architecture-selection step, not a post-training change.

Autoencoder losses include:

- weighted structural-role cross-entropy;
- occupancy binary cross-entropy and soft Dice;
- room/space-role cross-entropy;
- material-role cross-entropy;
- boundary, opening, stair, and support auxiliary losses; and
- discrete codebook commitment and usage regularization.

Class statistics come only from the train split.

### 9.3 Conditional latent generator

The structure generator predicts masked discrete latent tokens from HouseSpec conditions.

It uses a conditional 3-D latent U-Net with FiLM-style condition injection and global room-graph context. It trains with dynamic masks:

1. low random and cuboid masks;
2. larger region, floor, facade, roof, and room masks;
3. high-mask completion; and
4. fully masked starts only after G2 authorizes full generation.

Generation uses iterative seeded Mask-Predict:

- start from the configured mask state;
- predict every unresolved latent token;
- commit the configured highest-confidence fraction;
- leave lower-confidence positions masked;
- repeat to a fixed round limit; and
- record the complete confidence schedule and seed.

The same model and protocol must reproduce output for an explicit seed.

### 9.4 Decoration renderer

The decoration renderer is object-centric because decoration is sparse and includes non-block entities.

Its inputs are:

- the HouseSpec;
- the generated structural and room layers;
- the target room identity and mask;
- nearby walls, openings, supports, and circulation/interaction reserves;
- the room's required and preferred objects;
- global house context; and
- a deterministic decoration sub-seed derived from the house seed and room ID.

It uses:

- a room/global context encoder;
- full-resolution local support-surface features around proposed placements; and
- an autoregressive object decoder.

The canonical sequence order is:

```text
scene group
-> support surface
-> spatial anchor
-> object role
-> facing / attachment
-> occupied and clearance extent
-> material role
-> STOP
```

The decoder learns both object inventory and placement. A `STOP` token terminates each variable-length room scene.

Decoration losses include:

- object-role and group cross-entropy;
- object-count loss;
- anchor-coordinate loss;
- facing and attachment loss;
- support and footprint loss;
- required-object coverage loss;
- collision and circulation-clearance penalties;
- interaction-clearance loss; and
- room/style appropriateness contrastive loss.

Training begins with ground-truth structure and room evidence. It progressively mixes frozen predicted structures so the decorator learns realistic upstream errors.

### 9.5 Parameter and resource contract

The target device is:

```text
NVIDIA GeForce RTX 4060 Laptop GPU
8,188 MiB VRAM
WSL
```

The first implementation uses:

- mixed precision;
- batch size one;
- gradient accumulation;
- activation checkpointing;
- early 3-D downsampling;
- compact discrete structure latents;
- object-centric decoration rather than a dense decoration grid;
- bounded worker and prefetch counts; and
- a maximum steady-state target of 7.2 GiB during calibration.

Each learned stage has an initial 30-million-parameter ceiling. A larger model requires a separately reviewed resource and evidence decision.

The Conda environment remains `mcagent-stage7` unless a separately approved environment migration changes the project-wide training contract. No repository-local `.venv` is created.

### 9.6 Exact resume

Each atomic checkpoint binds:

- model and objective versions;
- HouseSpec, HouseScene, SourceProfile, and vocabulary versions;
- dataset, split, and train-statistics hashes;
- weights;
- optimizer and scheduler state;
- mixed-precision scaler state;
- gradient-accumulation position;
- sampler and data-order state;
- Python, NumPy, CPU Torch, and CUDA RNG states;
- epoch and optimizer step;
- best-gate state; and
- code revision.

Resume must reproduce the next batch and optimizer update. Loading weights while changing data, objective, vocabulary, or accumulation position is a new run, not an exact resume.

## 10. Training curriculum

### P0: Pipeline truth

Use synthetic fixtures and four reviewed cases to verify:

- schema-to-tensor encoding;
- model forward/backward behavior;
- finite losses;
- overfit capacity;
- seeded generation;
- exact resume;
- decoding;
- HouseScene serialization; and
- validation/error paths.

### P1: Gold learning

Use the locked 50-100-case gold snapshot to train:

- structure reconstruction;
- conditional masked completion;
- teacher-forced decoration; and
- parameter-matched untrained, frequency-prior, and unconditional baselines.

P1 does not claim useful full generation.

### P2: Conditional completion

After expansion toward 500 cases:

- train dynamic low-to-high structure masks;
- test correct, shuffled, unknown, and counterfactual conditions;
- mix predicted structures into decoration training;
- evaluate high-mask completion; and
- run blind room-scene review.

Only G2 authorizes fully masked generation work.

### P3: Full generation

Add fully masked latent starts and the fixed seeded Mask-Predict protocol. Evaluate:

- hard structural validity;
- survival readiness;
- HouseSpec adherence;
- decoration coherence;
- repair size;
- rejection rate;
- exact copying; and
- multi-seed diversity.

Only G3 authorizes scale toward 2,000+.

### P4: Scale and integration evidence

Train and evaluate on an expanded, locked, source-balanced snapshot. Run the untouched source-held-out test, blind comparison against the current generator, resource calibration, offline inference, and shadow-mode soak.

Only G4 authorizes a separate apply-mode implementation decision.

## 11. Validation and failure handling

### 11.1 Per-house hard gates

Every accepted learned house must satisfy:

- all required rooms exist within requested bounds and floors;
- entrance reaches every required room;
- stairs connect every occupied floor;
- doors, stairs, beds, storage, and required stations have usable clearance;
- bed, storage, crafting, cooking/smelting, and safe lighting exist and are accessible;
- all blocks, block states, block entities, attachments, and entities are valid for Minecraft Java 1.21.1;
- no unresolved overlap, unsupported required object, out-of-bounds cell, or invalid command remains; and
- the final HouseScene matches the accepted repair boundary and manifest.

### 11.2 Runtime failure path

```text
generate with recorded seed
-> validate raw HouseScene
-> apply bounded repair
-> validate repaired HouseScene
-> if a decoration-only blocker remains, regenerate that room once
-> if blockers remain, generate a fresh full candidate
-> allow at most three full candidates
-> reject learned generation honestly
-> during guarded integration only, run preserved deterministic fallback
```

No failure automatically increases model size, training steps, repair authority, or retry count.

### 11.3 Failure corpus

Every rejection records:

- prompt and HouseSpec;
- seed and sampling protocol;
- model/data/checkpoint hashes;
- raw HouseScene or bounded diagnostic artifact;
- validation errors;
- repairs;
- room retry and full-candidate count;
- unresolved blockers;
- resource measurements;
- fallback result; and
- final artifact provenance.

Failure records remain local and are not automatically promoted into training.

## 12. Evaluation architecture

### 12.1 Structure metrics

- occupancy precision, recall, F1, and IoU;
- supported structural-role macro F1 and macro IoU;
- per-role confusion, precision, recall, F1, and IoU;
- room/space macro F1;
- boundary, opening, window, door, stair, and support F1;
- envelope connectivity and enclosure;
- roof coverage;
- floor continuity;
- room-graph requirement satisfaction; and
- predicted/target occupied-volume calibration.

### 12.2 Decoration metrics

- object-role and object-count set precision, recall, and F1;
- anchor, facing, attachment, support, and footprint accuracy;
- required-object recall;
- support validity;
- collision and obstruction rates;
- walking and interaction-clearance rates;
- scene-group completeness;
- room appropriateness; and
- survival-core coverage before and after repair.

### 12.3 Condition and generation metrics

- correct versus shuffled HouseSpec conditions;
- correct versus all-unknown conditions;
- one-field counterfactual response;
- same-spec multi-seed diversity;
- stability of hard requirements across seeds;
- exact source-fingerprint copy rate;
- nearest-neighbor similarity to training and held-out houses;
- raw and repaired hard-gate acceptance;
- repair volume;
- rejection and retry rates; and
- blind human ratings for structural completeness, room plausibility, survival usability, style match, decoration coherence, richness, and novelty.

### 12.4 Runtime metrics

- peak VRAM;
- wall-clock step and generation time;
- seed replay equality;
- checkpoint resume equality;
- validator and repair latency;
- datapack command count and validity;
- Minecraft execution result; and
- shadow/apply/fallback provenance accuracy.

## 13. Evidence gates

### G0: Pipeline truth

Four synthetic or reviewed cases must reach:

- structure occupancy IoU at least `0.98`;
- supported structural-role macro F1 at least `0.95`;
- required-object recall `1.00`;
- teacher-forced decoration token accuracy at least `0.98`;
- finite loss components;
- deterministic explicit-seed replay; and
- exact next-step resume equivalence.

### G1: Gold learning

On the locked 50-100-case source split:

- both learned stages beat their untrained, frequency-prior, and parameter-matched unconditional baselines on their declared primary held-out metrics;
- correct HouseSpec conditions beat shuffled conditions on the paired point estimate;
- source, derivative, and augmentation leakage audits pass; and
- reconstruction and review artifacts are interpretable.

G1 proves learnability, not full-generation readiness.

### G2: Conditional completion

At approximately 500 eligible houses:

- the correct-condition advantage has a favorable 95% paired-bootstrap interval excluding zero;
- at least 80% of high-mask completed structures pass hard structural checks;
- at least 90% of required survival objects are generated before repair;
- at least 70% of blind-reviewed room scenes are coherent and usable; and
- resource and exact-resume gates pass.

G2 authorizes full-mask generation development.

### G3: Full generation

Before scaling beyond the 500-case generator:

- at least 70% of raw full generations pass all hard gates;
- at least 90% pass after bounded repair;
- every accepted house has 100% survival-core coverage;
- at least 70% of blind-reviewed houses are architecturally and decoratively acceptable;
- at least 65% clearly express the requested conditions;
- exact training-copy count is zero; and
- multi-seed diversity falls inside the calibrated held-out-house similarity range while hard constraints remain stable.

G3 authorizes expansion toward 2,000+ cases.

### G4: Apply readiness

On a 2,000+ snapshot and untouched source-held-out test:

- G3 validity and survival thresholds remain satisfied;
- the learned system wins at least 60% of blind paired comparisons against the current generator for decoration and overall house quality, with a favorable confidence interval;
- explicit seeds reproduce output;
- the full inference path stays within the 8 GB resource contract;
- shadow-mode soak tests complete without changing baseline geometry or artifacts; and
- failure, repair, rejection, and fallback provenance is accurate.

Passing G4 authorizes a separate guarded apply-mode implementation plan. It does not activate a checkpoint automatically.

## 14. Repository organization

Tracked code and test boundaries:

```text
src/training/residential/
  contracts/
  intake/
  extraction/
  annotation/
  snapshots/

training/residential/
  mcagent_residential/
    data/
    models/
    training/
    evaluation/
  tests/

test/
  residential*.test.js

docs/residential-model/
  design.md
  plans/
```

The existing `src/training/` preparation code and `training/stage7/` package remain intact during early residential work. Reusable mechanics may be extracted only when a focused task has tests proving compatibility.

Production integration code is deferred to R11 and will live behind a separate provider boundary under `src/construction/learning/`.

## 15. Sequential subprojects

### R1: Contracts and local workspace

Deliver:

- HouseSpec, HouseScene, SourceProfile, review, vocabulary, and error contracts;
- `.local/residential-model/` path rules;
- validators;
- synthetic valid and invalid fixtures;
- atomic local initialization;
- inventory/status reporting; and
- tests proving no current production or `.local` mutation outside the new root.

### R2: Safe source intake

Deliver:

- named inbox batches;
- immutable quarantine;
- source profiles and provenance;
- format allowlist and bounded parsing;
- exact and structural fingerprints;
- derivative-family grouping;
- eligibility state machine; and
- intake reports.

### R3: Canonical extraction

Deliver:

- lossless supported block, block-entity, and attached-entity representation;
- canvas transform and front direction;
- structural/material roles;
- room and support evidence;
- survival-station and object detection;
- interaction-clearance evidence; and
- extraction reports.

### R4: Annotation and golden review

Deliver:

- LLM draft HouseSpec;
- room, object, group, and decoration inference;
- field-level evidence and confidence;
- synchronized visual review;
- immutable human corrections;
- selective-review triage; and
- a completed 50-100-case gold set.

### R5: Dataset snapshot v1

Deliver:

- canonical paired targets;
- source/derivative group locking;
- 70/15/15 split;
- manifest and hashes;
- class/style/room/object reports;
- leakage audit; and
- dataset card.

### R6: Model infrastructure

Deliver:

- structured condition encoder;
- discrete 3-D autoencoder;
- conditional masked latent generator;
- room-aware object decoder;
- losses and baselines;
- resource calibration;
- atomic exact-resume checkpoints;
- evaluators; and
- fixture-only G0 evidence.

### R7: Gold pilot

Deliver:

- owner-approved local runs on the locked gold snapshot;
- G1 evaluation;
- reconstruction and decoration artifacts;
- baseline comparison; and
- a go/no-go diagnosis.

### R8: Selective-review expansion

Deliver:

- approximately 500 eligible houses;
- audit evidence;
- new locked snapshot;
- predicted-structure decoration training;
- conditional-completion experiments; and
- G2 evaluation.

### R9: Full generation

Deliver:

- fully masked latent generation;
- fixed Mask-Predict protocol;
- multi-seed evaluation;
- blind review;
- failure analysis; and
- G3 evidence.

### R10: Scale and source generalization

Deliver:

- approximately 2,000+ eligible houses;
- locked source-held-out test;
- scale-aware training;
- comparison with the current generator;
- G4 offline and shadow evidence; and
- a production recommendation.

### R11: Guarded production integration

Deliver:

- Python inference provider;
- HouseScene runtime loader;
- validation and bounded repair;
- role/block-state resolver;
- failure corpus;
- shadow mode;
- soak tests;
- guarded apply mode; and
- preserved deterministic fallback with truthful provenance.

## 16. Testing strategy

Every behavior change follows test-driven development.

Node tests cover:

- contracts and unknown-field rejection;
- path containment and symlink rejection;
- atomic initialization and writes;
- source profile state transitions;
- bounded parsing;
- fingerprints and derivative grouping;
- role and object extraction;
- snapshot determinism and leakage prevention;
- runtime validation and repair boundaries;
- exact-block resolution; and
- unchanged existing generation.

Python tests cover:

- HouseSpec encoding;
- grid and object dataset loading;
- model input/output shapes and finite values;
- loss components and empty-supervision refusal;
- masking determinism;
- condition dropout;
- seeded generation;
- exact resume;
- resource-calibration refusal;
- structure, decoration, condition, generation, and gate metrics; and
- checkpoint/schema/data incompatibility.

End-to-end tests cover:

- a synthetic residential source through SourceProfile, extraction, annotation, snapshot, model fixture, HouseScene, validation, resolution, and datapack export;
- rejected malformed and unsafe sources;
- blocked learned candidates;
- bounded repair deltas;
- fresh automatic seeds and explicit replay; and
- shadow mode leaving primary geometry unchanged.

Before meaningful Node changes, run `npm test`. Before meaningful model changes, run the complete Conda training test suite. Long real runs begin only after small overfit, resource, resume, and held-out gates pass.

## 17. Risks and mitigations

### Decoration sparsity

Risk: walls and air overwhelm rare objects.

Mitigation: object-centric decoration targets, balanced room/object sampling, dedicated losses, required-object recall, and scene-group evaluation.

### Condition collapse

Risk: the generator ignores HouseSpec and produces an average house.

Mitigation: explicit structured encoding, high-mask training, condition dropout, shuffled/unknown/counterfactual tests, and G2 condition-effect confidence intervals.

### Source overfitting and copying

Risk: the model memorizes a small set of houses or derivative variants.

Mitigation: source-family splits, permanent test locking, fingerprint checks, nearest-neighbor evaluation, exact-copy refusal, and staged scale gates.

### Automatic label errors

Risk: LLM or heuristic annotations teach incorrect room and decoration semantics.

Mitigation: field-level provenance/confidence, 50-100 fully reviewed cases, selective uncertainty review, deterministic random audits, and gold-based annotator evaluation.

### Upstream structure errors

Risk: the decorator only works with perfect ground-truth rooms.

Mitigation: predicted-structure mixing, room retry, joint HouseScene validation, and separate raw/repaired metrics.

### Repair hiding weak learning

Risk: deterministic code silently becomes the architect again.

Mitigation: strict repair allowlist, raw-versus-repaired metrics, repair volume, blocker-based rejection, and explicit fallback provenance.

### 8 GB resource ceiling

Risk: full 3-D activations or long object sequences exceed memory.

Mitigation: discrete latents, early downsampling, object-centric decoding, batch one, mixed precision, accumulation, checkpointing, a 7.2 GiB calibration target, and an initial 30-million-parameter ceiling per stage.

### Dataset preparation workload

Risk: manual review of thousands of houses becomes the bottleneck.

Mitigation: automated evidence extraction, LLM drafts, gold calibration, uncertainty triage, novelty routing, and 5-10% random audit.

## 18. Non-goals

This design does not authorize or include:

- immediate replacement of `construction_method_v1`;
- automatic activation of any checkpoint;
- a single model for every Minecraft building type;
- structures larger than `64^3`;
- cropping or rescaling oversized houses;
- live Mineflayer control or survival resource collection;
- automatic web search or source downloading;
- automatic publication or sharing of source-derived data or checkpoints;
- a repository-local Python virtual environment;
- deterministic architectural templates masquerading as repair;
- removal of the current local-training baseline; or
- one implementation plan covering R1 through R11 as a single unsafe change.

## 19. Ownership and next gate

The owner's recurring role is to:

- identify promising complete furnished residential sources;
- preserve source URL and author/license context;
- review the 50-100 golden cases and selected uncertain/audit cases;
- approve long training budgets; and
- judge blind architectural and decorative quality.

The implementation role is to:

- build the organization, contracts, intake, extraction, annotation, review, snapshot, training, evaluation, and integration tooling;
- preserve current generation and local evidence;
- report evidence and stop at each gate; and
- keep code, tests, specifications, and actual project status consistent.

The immediate next implementation scope is R1 only: contracts and local workspace. After the owner approves this written specification, create a detailed implementation plan for R1. Do not begin R2 intake, model implementation, real source processing, or training as part of that plan.
