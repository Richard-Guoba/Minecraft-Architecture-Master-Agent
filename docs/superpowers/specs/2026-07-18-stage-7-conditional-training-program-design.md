# Stage 7 Conditional Building Training Program Design

**Date:** 2026-07-18

**Status:** conversational design approved by the owner; written specification pending owner review; not authorization to download payloads, admit a Dataset case, implement code, or train

## 1. Purpose

Stage 7 needs a durable path from a small pipeline-validation experiment to a controllable model of complete Minecraft buildings. The program must avoid treating unrelated structures as one undifferentiated distribution: a rustic house, a Nether fortress, a temple, and an industrial windmill may share geometric regularities, but the model must receive explicit function, type, style, environment, material, and scale conditions.

The selected direction is one progressively trained conditional model over complete independent buildings. It begins with dynamic masked reconstruction, advances to high-mask completion, and reaches full-volume generation only after data and evaluation gates justify that transition. Specialist models and an unconditional mixed model remain comparison baselines, not the primary architecture.

This document is a program-level design. It decomposes the work into separately designed and planned subprojects. It does not authorize any operational acquisition or training run.

## 2. Current evidence and baseline

The existing private research lane remains historical evidence only:

- 22 active private cases, with a deterministic 15/7 training/validation split;
- 42 oversized private buildings preserved in `deferred/oversized/`;
- three existing local run directories;
- a nine-token `64 x 64 x 64` representation;
- a `TinyMaskedVoxelAutoencoder` trained for masked reconstruction; and
- a held-out evaluator for masked cross-entropy, accuracy, non-air macro F1, and non-air macro IoU.

That lane proved that the import, preparation, training, interruption, recovery, monitoring, and evaluation boundaries work. It does not prove generalizable building generation. The existing model is unconditional, uses a fixed per-case training mask, and has too little data to separate heterogeneous building families reliably. It is M0, an immutable historical baseline, and will not be extended into the new public-candidate program.

The source-expansion lane currently contains 30 metadata-only public review cards drawn from multiple rights-cleared project families. Those cards are leads, not downloaded training cases. The current cards include incomplete basement modules and candidates whose completeness can only be resolved through later review. Verbal approval of visual quality is not payload-acquisition authorization.

The local hardware baseline is:

- Intel Core i7-14650HX, 12 cores and 24 logical processors;
- 16 GiB system memory;
- NVIDIA GeForce RTX 4060 Laptop GPU with 8 GiB VRAM; and
- ordinary WSL access to the GPU through CUDA 13.0.

CUDA is available outside the Codex device sandbox. No rented GPU is part of this program.

## 3. Immutable boundaries

The following boundaries apply to every subproject and operational gate:

- Do not modify Dataset v1, v2, or v3. Dataset v3 remains `ready_for_m3_real_data=false` and `training_eligible_count=0`.
- Do not modify normal Node generation, the Stage 7 primary provider, or M4 Apply Mode.
- Do not mix the existing 22 private cases, their prepared tensors, split, metrics, checkpoints, reconstructions, or runs into the new public-candidate lane.
- Do not process the 42 deferred oversized private buildings.
- Do not crop, rescale, tile, or silently split any building.
- Do not automatically assemble jigsaw structures, multi-file complexes, or external asset packs.
- Do not push, publish, upload, share, package, or export private data, candidate payloads, metrics, reconstructions, checkpoints, weights, or generated output.
- Keep all operational data below ignored and untracked `.local/` roots. No real building, tensor, model artifact, or private metric enters Git.
- Work sequentially. Do not use parallel agents, concurrent acquisition, or concurrent training.
- Do not begin a training run without a new literal owner-approved device and positive optimizer-step budget.
- Do not move automatically from one data scale, model version, acquisition batch, or training run to the next.

The formal Dataset manifest hashes remain mandatory preflight and postflight assertions:

```text
v1 fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749
v2 af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654
v3 5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082
```

## 4. Approaches considered

### 4.1 Progressive single conditional model — selected

One model shares geometric knowledge across buildings while receiving independent conditions for function, type, style, environment, biome, scale, and material preference. Hierarchical labels allow a rare leaf type to fall back to a supported parent without discarding its metadata. This route uses data most efficiently and supports controllable generation.

Its main risk is condition collapse: the model may ignore labels and learn a broad average distribution. Dynamic high-mask training, shuffled-condition tests, an unconditional baseline, source-isolated evaluation, and human review address that risk.

### 4.2 Separate specialist models — deferred baseline

Separate residential, religious, military, dungeon, or industrial models provide strong isolation but fragment the data. At 100 or 500 total buildings, most specialists would be trained on too few examples and would overfit. Specialist models may be revisited only after the program has enough data per family.

### 4.3 Flat unconditional mixed model — comparison only

An unconditional model is simpler, but it cannot provide type or style control and may converge toward an average building. A parameter-matched unconditional model remains necessary as an experimental baseline. It is not the product direction.

## 5. Program phases

The program advances through six evidence phases:

| Phase | Scale | Objective | Training role |
| --- | ---: | --- | --- |
| P0 | existing private 22 | Preserve historical pipeline evidence | no extension |
| P1 | 30 leads to 100 eligible cases | Prove rights, completeness, taxonomy, parsing, deduplication, balance, and locked splitting | calibration only after snapshot approval |
| P2 | about 100 cases | Prove that structured conditions affect high-mask reconstruction | local CUDA qualification and pilot |
| P3 | about 500 cases | Prove source-disjoint generalization and begin full-mask generation | local overnight CUDA runs |
| P4 | 2,000 or more cases | Prove stable controllable generation across seeds and sources | scale only after gates |
| P5 | later, separately designed | Consider a controlled research consumer | no Node or M4 authorization here |

Each phase has independent data, model, resource, and human-quality gates. A lower training loss alone never advances a phase.

## 6. P1 data taxonomy

### 6.1 Conditional fields

Each candidate records the following independently:

| Field | Contract |
| --- | --- |
| `primary_function` | exactly one approved coarse function |
| `secondary_functions` | zero or more approved auxiliary functions |
| `building_type` | controlled leaf type with a declared parent |
| `style_family` | exactly one approved primary style |
| `style_tags` | zero or more controlled secondary style tags |
| `environment` | controlled spatial environment |
| `biome_theme` | controlled biome theme or `none` |
| `scale_bin` | deterministic `compact`, `standard`, or `large` |
| `material_profile` | deterministic nine-token non-air/material proportions |
| `completeness` | `complete`, `module`, or `fragment` |
| `label_confidence` | `high`, `medium`, or `low` |
| `source_group` | stable source and contribution family identity |
| `asset_family` | stable variant, mirror, derivative, or multipart family identity |

Missing optional conditions use a dedicated `unknown` value. They are never fabricated from filenames alone.

The scale rule uses the largest non-air bounding-box dimension:

- `compact`: at most 24;
- `standard`: 25 through 40; and
- `large`: 41 through 64.

All three dimensions must remain at most 64 regardless of the scale label.

### 6.2 Primary function vocabulary

The eight approved primary functions are:

1. `residential` — houses, cottages, manors, and residences;
2. `religious_public` — temples, shrines, altars, and public halls;
3. `defensive_military` — castles, forts, citadels, and lookout structures;
4. `production_agriculture` — workshops, windmills, farms, and industrial facilities;
5. `transport_infrastructure` — ships, airships, bridges, stations, and infrastructure;
6. `exploration_challenge` — dungeons, catacombs, tombs, and mazes;
7. `monument_ruin` — monuments, ruins, memorials, and megalithic structures; and
8. `fantastical_special` — portals, floating laboratories, and complete special structures that do not fit the first seven.

A castle may use `defensive_military` as its primary function and `residential` as a secondary function. This preserves a useful boundary without denying hybrid buildings.

### 6.3 Training eligibility

A case becomes a training candidate only when all of the following hold:

- the asset or uniform asset-family rights chain is verified and current;
- the owner accepted the named candidate;
- the building is a complete independent structure;
- the format parses deterministically;
- every non-air bounding-box dimension is at most 64;
- all block identifiers resolve, and no more than 10 percent of non-air blocks remain unmapped to a known material-family rule;
- the exact-duplicate check passes;
- any near-duplicate and derivative relationship is recorded;
- human quality review passes;
- label confidence is at least `medium`; and
- the candidate has a stable source group and asset family.

Modules, fragments, multi-building collections that cannot be safely separated, and multipart structures that require assembly remain in a deferred lane. They do not become negative examples.

## 7. P1 balance, deduplication, and locked splits

### 7.1 One-hundred-case snapshot

The target functional allocation is:

| Function | Target |
| --- | ---: |
| residential | 15 |
| religious/public | 15 |
| defensive/military | 15 |
| production/agriculture | 10 |
| transport/infrastructure | 10 |
| exploration/challenge | 15 |
| monument/ruin | 10 |
| fantastical/special | 10 |

A category may vary by three cases from its target, but no category may contain fewer than eight or more than twenty cases. Shortfalls cause continued discovery; another category cannot fill the quota.

Additional gates are:

- at least five independent source projects;
- no source project above 20 percent;
- no asset family above 10 percent;
- at least five primary styles;
- no primary style above 30 percent;
- a scale target of 30 percent compact, 45 percent standard, and 25 percent large;
- zero exact duplicates;
- no more than 10 percent additional near-duplicate variants; and
- human review of every case.

The split is 70 training, 15 validation, and 15 permanently locked test cases.

### 7.2 Five-hundred-case snapshot

At 500 cases:

- every primary function has at least 40 and no more than 100 cases;
- at least 12 independent source projects are present;
- no source project exceeds 15 percent;
- 20 percent of cases receive a second human review; and
- the split is 350 training, 75 validation, and 75 test cases.

The test set contains 50 ordinary group-isolated cases and 25 cases from complete source projects absent from training.

### 7.3 Two-thousand-case snapshot

At 2,000 or more cases:

- every primary function has at least 150 cases;
- at least 30 independent source projects are present;
- no source project exceeds 10 percent;
- no author or controlling entity exceeds 5 percent;
- each new acquisition group is an owner-approved batch of at most 100 candidates;
- at least 10 percent of every batch receives human re-review; and
- the approximate split is 80 percent training, 10 percent validation, and 10 percent test.

At least half of the test set belongs to complete source-project holdouts.

### 7.4 Rare labels and sampling

Fine-grained labels stay in metadata but become model conditions only after the training split contains enough support:

- five training cases at the 100-case stage;
- ten at the 500-case stage; and
- twenty at the 2,000-case stage.

Unsupported leaves fall back to their declared parent condition. Balanced sampling considers primary function, primary style, and scale. No case may be oversampled above three times its natural rate.

Exact byte duplicates are rejected. Structural near-duplicates remain in one stable cluster, never cross a split, count toward the near-duplicate cap, and receive reduced sampling weight. The snapshot builder binds every decision, taxonomy revision, duplicate cluster, split, and prepared tensor by hash.

Once a case has appeared in validation or test, it can never enter training in a later snapshot. Previous snapshot assignments remain locked as the corpus grows.

## 8. P1 acquisition and admission flow

### 8.1 State machine

The only automated forward path is:

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

No tool may skip a state or infer owner approval. Decisions are append-only and superseded by later revisions rather than rewritten.

### 8.2 Isolated components

The source metadata registry, rights ledger, decision recorder, quarantine acquirer, format validator, voxel preparer, taxonomy reviewer, fingerprint engine, snapshot builder, and auditor have separate interfaces and responsibilities.

Operational acquisition and prepared candidate state remain under:

```text
.local/stage7-source-expansion/
```

Downloads enter `quarantine/` first. The validator accepts only allowlisted formats, rejects symbolic links and path escapes, limits decompressed size and NBT complexity, and never executes embedded content. The first program version accepts only independently parseable single structures. It does not assemble jigsaw pools or external assets.

Preparation computes the non-air bounds, preserves the geometry, and deterministically translates and pads the complete structure into a `64 x 64 x 64` nine-token volume. It does not rotate the retained evidence, crop, rescale, tile, or infer missing modules. Deterministic yaw rotations may later be applied in memory as training augmentation; they do not create extra source cases or change split membership.

### 8.3 First operational acquisition sequence

The first payload operation is deliberately narrow:

1. record explicit `Accept`, `Defer`, or `Reject` decisions for the review cards;
2. defer the three known basement modules;
3. re-review `Create Dungeon Base`, house families, and any apparent collection for complete-single-building scope;
4. select five representative named candidates across different sources and formats;
5. revalidate rights immediately before acquisition;
6. obtain a new owner approval for those five exact candidates;
7. acquire and validate them sequentially; and
8. require at least 95 percent parsing success and no boundary drift before proposing ten-candidate batches.

Later pilot batches contain at most ten named candidates until the 100-case snapshot is frozen.

### 8.4 Failure handling

Failures are terminal for automation:

- rights ambiguity or revocation becomes `deferred_rights` before download;
- a module or fragment becomes `deferred_incomplete`;
- a public structure above 64 becomes `deferred_oversized_public` and remains separate from the private 42;
- a parser, type, containment, or unmapped-material failure becomes `quarantined_technical`;
- an exact duplicate becomes `rejected_duplicate`;
- a near-duplicate joins one recorded cluster and receives reduced weight;
- low label confidence becomes `deferred_label`; and
- failed human quality review becomes `rejected_quality`.

Git, private-corpus, formal Dataset, run-root, or false/zero drift stops the whole batch. No failure triggers automatic deletion, repair, retry, replacement download, relaxed rights review, or a different representation.

## 9. P2 conditional model architecture

### 9.1 M1 network

M1 is a dense lightweight conditional 3-D U-Net sized for batch one on the local RTX 4060:

```text
64^3 masked categorical input
  -> token embedding
  -> 16 / 32 / 64 / 96 channel residual encoder
  -> 3-D bottleneck
  -> 96 / 64 / 32 / 16 channel residual decoder with skip connections
  -> 9-class voxel logits
```

The model uses GroupNorm rather than BatchNorm. Downsampling is learned and deterministic. Upsampling uses explicit resize plus convolution rather than an unconstrained transposed-convolution pattern. The initial parameter ceiling is 15 million parameters. The output shape is exactly `[batch, 9, 64, 64, 64]`.

Function, type, style, environment, biome, scale, normalized target bounds, and optional material preference receive separate embeddings. A condition MLP produces per-block FiLM scale and shift values. This is substantially cheaper than dense cross-attention and gives every resolution access to the conditions.

M1 supports `unknown` conditions but does not claim natural-language prompting. A parameter-matched unconditional model uses the same architecture with all condition values set to `unknown`.

### 9.2 Model progression

- M0 is the immutable historical Tiny private model.
- M1 is conditional dynamic masked reconstruction and high-mask completion.
- M2 adds a small share of fully masked training and iterative Mask-Predict generation after the 500-case gate.
- M3, such as a latent or diffusion architecture, is considered only if M2 reaches a measured ceiling on 2,000 or more cases.

M1 and M2 remain isolated research models. They never attach to the Node provider, formal Dataset, or M4.

## 10. Dynamic masking and generation curriculum

Training masks derive from a versioned namespace, case identity, epoch, micro-batch position, and optimizer step. The same case receives different training masks over time. Validation and test use fixed versioned masks that never depend on filenames.

The M1 optimizer-step curriculum is:

1. first 30 percent: 15 to 35 percent random-voxel and small-cuboid masking;
2. middle 40 percent: 30 to 70 percent larger cuboid, wall, roof, and half-space masking; and
3. final 30 percent: 60 to 95 percent large-region masking.

The 100-case stage does not rely on fully masked examples. After the 500-case data and condition-effect gates pass, M2 uses fully masked input for 5 to 10 percent of training batches.

M2 generation starts from a fully masked `64^3` volume. Each deterministic Mask-Predict round fixes only a configured highest-confidence fraction of currently masked voxels, leaves the remainder masked, and repeats until all positions are filled or a fixed round limit is reached. A generation protocol records conditions, seed, confidence schedule, round limit, model hash, and data snapshot hash.

## 11. Loss and optimization

### 11.1 Objective

The approved total loss is:

```text
L = 0.60 * L_token + 0.25 * L_occupancy + 0.15 * L_material
```

- `L_token` is weighted nine-class cross-entropy over masked positions.
- `L_occupancy` is an equal mixture of binary cross-entropy and soft Dice for air versus non-air over masked positions.
- `L_material` is weighted cross-entropy over masked positions whose target is non-air.

Loss is not applied to unmasked positions. The objective therefore cannot be minimized merely by copying visible tokens.

Class frequencies come only from the training split. For class `c`, the raw weight is proportional to `1 / sqrt(frequency_c + epsilon)`. Weights are normalized to mean one and clipped to `[0.5, 3.0]`. The exact frequencies, weights, epsilon, objective version, and component weights enter the run binding.

### 11.2 Optimizer

The M1 default is:

- AdamW;
- learning rate `2e-4`;
- weight decay `1e-4`;
- five percent linear warmup;
- cosine decay to ten percent of the initial learning rate;
- micro-batch size one;
- four-step gradient accumulation for effective batch four; and
- global gradient-norm clipping at `1.0`.

An owner-approved `steps` value always means optimizer steps, not micro-batches.

CUDA automatic mixed precision prefers BF16 after an explicit capability and correctness check. When that check fails, the calibration proposal selects FP16 with GradScaler before the owner approves the run. The approved precision enters the immutable run binding. The run fails before optimization if that bound precision or deterministic operation set is unsupported; it does not silently change precision or disable deterministic behavior after approval.

Validation occurs every five effective epochs, clamped to an interval of 100 through 1,000 optimizer steps. A single `best-validation.pt` is overwritten only when the lexicographic validation tuple improves: higher non-air macro IoU, then higher occupancy IoU, then lower total validation loss.

### 11.3 Numerical refusal behavior

Every optimizer step verifies finite total and component losses, finite gradients, finite parameters, finite optimizer state, a bounded gradient norm, and valid AMP state. Non-finite state, three consecutive AMP-skipped steps, CUDA OOM, a data-binding mismatch, or a recovery mismatch stops the run. The trainer never automatically changes the model, batch, accumulation, precision, device, learning rate, or target steps.

## 12. Local CUDA runtime and time planning

### 12.1 Isolated run root

New conditional runs live below a separate ignored root:

```text
.local/stage7-conditional-research/runs/<run-id>/
```

The root contains only versioned manifests, metadata-safe progress, local loss progress, fixed recovery slots, one overwritten best-validation checkpoint, and final artifacts. It binds its input to an immutable public-candidate snapshot. It does not reference the private 22-case prepared manifest.

### 12.2 Four-level operating sequence

1. A synthetic smoke test exercises forward, backward, AMP, snapshot, monitor, pause, and exact resume without real building data.
2. A real-data 50-optimizer-step calibration requires a new literal `device=cuda,steps=50` approval.
3. A 30-to-60-minute qualification run is proposed only after calibration passes.
4. A six-to-eight-hour overnight run is proposed only after qualification improves validation evidence.

For a user-supplied window `W` seconds and a calibrated median optimizer-step time `S`, the proposed budget is:

```text
floor(0.80 * W / S)
```

The remaining 20 percent covers variation, snapshots, finalization, and evaluation. Before every real run, the owner receives the run ID, data snapshot, code revision, device, exact steps, batch, accumulation, learning rate, precision, calibration evidence, expected duration, and expected completion time. Training begins only after a new literal device-and-step approval.

### 12.3 Resource gates

The RTX 4060 profile requires before start or resume:

- the bound CUDA device and environment are visible;
- at least 6 GiB free VRAM;
- at least 8 GiB available system memory;
- zero active swap usage;
- at least 50 GiB free disk; and
- GPU temperature below 75 degrees Celsius.

During a run:

- PyTorch maximum reserved VRAM must remain at or below 5.5 GiB;
- total GPU memory use must remain at or below 7.2 GiB;
- process RSS must remain below 4 GiB;
- system available memory must remain at or above 4 GiB;
- any swap activity requests a cooperative pause; and
- a temperature at or above 82 degrees Celsius for 60 consecutive seconds requests a cooperative pause; and
- 85 degrees Celsius, CUDA OOM, or a CUDA execution error stops the run.

No limit breach authorizes an automatic fallback.

### 12.4 Snapshot, pause, and resume

Recovery uses two five-active-minute slots:

```text
resume-a.pt
resume-b.pt
```

The inactive slot is replaced, validated, and then selected by an atomically replaced pointer. Only two recovery snapshots exist. `best-validation.pt` is one separately overwritten selection checkpoint. Final artifacts are written only at the exact target.

A pause request is consumed at an optimizer-step boundary. The trainer completes the step, synchronizes CUDA, commits and validates the inactive recovery slot, publishes a matching acknowledgement, and releases the exclusive run lock. Shutdown is safe only after the acknowledgement, snapshot step, run state, and released lock agree.

Resume accepts only the existing root and run ID. It cannot override device, target steps, data snapshot, split, code digest, model, loss, optimizer, batch, accumulation, learning rate, precision, Python, Torch, CUDA, or relevant GPU identity. A mismatch requires a new run; no old artifact is rewritten to appear compatible.

The local interactive monitor shows progress, throughput, ETA, total and component losses, learning rate, gradient norm, GPU memory, and temperature. Loss remains local and is refused on redirected non-interactive output. Runs do not extend, resume, evaluate, or start a following run automatically.

## 13. Evaluation architecture

### 13.1 Reconstruction layer

Fixed test protocols record masked token cross-entropy, occupancy IoU, non-air macro F1, non-air macro IoU, supported per-material performance, and results by small, medium, and large mask range.

The comparison set contains:

- an untrained architecture baseline;
- a training-split class-frequency baseline;
- the parameter-matched unconditional model; and
- a nearest-training-case retrieval baseline.

### 13.2 Condition-effect layer

For each test case and deterministic high mask, the evaluator compares correct conditions, deterministically shuffled conditions, all-`unknown` conditions, and one-field counterfactual conditions. The primary condition-effect test uses 80-to-95-percent masks so visible geometry cannot dominate the labels.

At 500 cases and above, paired bootstrap resampling over test cases produces a 95 percent interval for the correct-versus-shuffled difference. The interval must exclude zero in the favorable direction.

### 13.3 Complete-generation layer

M2 output checks include:

- exact shape and valid token range;
- non-empty and non-solid occupancy;
- target-extent adherence;
- primary connected-component share;
- unsupported and floating-voxel rates;
- anomalous fragment count;
- material-profile range;
- exact and near structural similarity to training cases;
- same-condition diversity across seeds; and
- measurable change under different conditions.

Environment-specific rules apply. Aerial and floating-island conditions are not failed by an ordinary ground-contact rule.

No generated output may exactly match a training structural fingerprint. Diversity is calibrated against leave-one-out training and held-out similarity distributions rather than an arbitrary universal voxel threshold.

### 13.4 Local human blind review

The owner reviews fixed-condition, fixed-seed, fixed-view outputs without seeing the model or baseline identity. At the 100-case M1 stage, these are 90-to-95-percent high-mask completions rather than full generations. M2 full generations enter blind review only after the 500-case M1 gate authorizes M2. The rubric covers structural completeness, function recognizability, style match, material coherence, usability, and novelty.

The minimum review counts are 20 outputs at 100 cases, 50 at 500 cases, and 100 at 2,000 or more cases. Images, structures, scores, and evaluator artifacts remain local and are not shared or uploaded.

## 14. Go/no-go gates

### 14.1 One-hundred-case gate

The program may propose the 500-case stage only when:

- the conditional model beats the parameter-matched unconditional model on at least two of token cross-entropy, occupancy IoU, and non-air macro IoU without a greater-than-five-percent relative regression on the third;
- correct conditions outperform shuffled conditions on the high-mask paired point estimate;
- at least 60 percent of blind-reviewed high-mask completions are structurally acceptable;
- no output is an exact training copy; and
- every data, runtime, artifact, formal Dataset, and private-corpus boundary passes.

This small test set supports a directional pilot conclusion, not a generalization claim.

### 14.2 Five-hundred-case gate

The program may propose M2 full-mask generation only when:

- the correct-condition advantage has a favorable 95 percent paired-bootstrap interval excluding zero;
- source-project holdout performance is no more than 20 percent below ordinary group-isolated test performance on occupancy IoU and non-air macro IoU;
- no boundary drifts.

After M2 is implemented and trained on the locked 500-case snapshot, the program may propose the 2,000-case data stage only when:

- at least 70 percent of blind-reviewed M2 generations are structurally acceptable;
- at least 65 percent have recognizable requested conditions;
- exact-copy, diversity, and condition-collapse checks pass; and
- no boundary drifts.

### 14.3 Two-thousand-case gate

Any later integration design requires:

- stable conclusions across at least three independent training seeds;
- source-project holdout performance no more than 15 percent below ordinary test performance;
- at least 80 percent structurally acceptable blind-reviewed output;
- at least 75 percent recognizable requested conditions;
- simultaneous novelty and diversity passes; and
- a separate owner-approved product-integration design.

Passing this gate still does not authorize Dataset admission, public inference, Node integration, or M4.

### 14.4 Diagnostic decisions

- Good reconstruction with no condition effect sends the program back to labels, FiLM injection, and high-mask training.
- Good ordinary test performance with poor source holdout sends the program back to source diversity, not a larger model.
- Falling loss with poor human quality sends the program back to the objective and generation protocol, not more steps.
- Training-copy behavior sends the program back to deduplication, sampling, and budget reduction.
- Identical output across conditions blocks M2 until condition collapse is resolved.
- Diverse but incoherent output sends the program back to the structural curriculum.

No failure authorizes an automatic retry, scale increase, or relaxed gate.

## 15. Sequential subprojects and deliverables

The program is too broad for one implementation plan. It is divided into ten sequential subprojects:

| Order | Subproject | Required deliverable | Owner gate |
| --- | --- | --- | --- |
| R0 | program design freeze | this reviewed specification | written-spec approval |
| R1 | taxonomy and admission contract | schemas, completeness rules, quotas, split contract, append-only decisions | no payload operation |
| R2 | acquisition and parser readiness | quarantine, allowlists, NBT safety, preparation, fingerprints, synthetic tests | no payload operation |
| R3 | five-case representative pilot | rights refresh, named acquisition, parser and quality audit | exact five-candidate approval |
| R4 | conditional model infrastructure | M1, loss, CUDA trainer, monitor, pause/resume, evaluator using synthetic fixtures | no real training |
| R5 | 100-case snapshot | immutable candidate manifest, prepared hashes, 70/15/15 split | batch and snapshot approvals |
| R6 | 100-case training pilot | calibration, qualification, overnight run, complete P3 report | new device and steps per run |
| R7 | 500-case generalization | source-held-out snapshot and evaluation | 100-case gate and owner approval |
| R8 | M2 complete generation | full-mask curriculum, Mask-Predict, blind review | 500-case gate and owner approval |
| R9 | 2,000-plus scale | multi-seed and source-generalization evidence | M2 500-case generation gate and sequential batch approvals |

Every subproject receives its own design, test-driven implementation plan, verification, local commit, and handoff. The next implementation plan after this program specification covers R1 only.

## 16. Verification strategy

Implementation uses synthetic committed fixtures or minimal public metadata fixtures. No real candidate payload, private record, prepared building tensor, model artifact, generated output, or private metric enters Git or test output.

Each subproject must test its own units and boundaries, then run the relevant complete Stage 7 Python and Node suites. Cross-cutting tests cover:

- legal and illegal state transitions;
- controlled vocabularies, parent fallback, and confidence rules;
- quota, source-cap, style-cap, scale, rare-label, and immutable-split rules;
- exact and near-duplicate grouping without split leakage;
- ignored-root containment, symlink refusal, path-escape refusal, and exact inventories;
- rights revalidation and refusal before acquisition;
- malformed, hostile, unsupported, multipart, unmapped, and oversized input refusal;
- deterministic preparation without crop, scale, tile, or assembly;
- dynamic training masks and fixed evaluation masks;
- parameter-matched conditional/unconditional baselines;
- finite loss components, gradients, optimizer, AMP, and checkpoints;
- exact pause/resume equivalence on the same bound environment;
- GPU resource-gate injection without requiring real resource exhaustion;
- local-only monitoring and loss redirection refusal;
- paired condition and source-holdout evaluation;
- no exact generated copy; and
- unchanged formal Dataset hashes, Dataset v3 false/zero, normal Node generation, M4 status, private preflight, and existing private-run inventory.

Before and after any real batch or run, execute the recorded Git, ignored/untracked root, corpus, sidecar, split, run-inventory, Dataset hash, and false/zero checks. Any unexplained drift stops the operation.

## 17. Explicit non-goals

This design does not add or authorize:

- processing the 42 oversized private buildings;
- cropping, rescaling, tiling, or a large-building representation;
- automatic jigsaw, module, complex, or collection assembly;
- an unlimited crawler, parallel downloader, automatic replacement, payment, mass outreach, or authentication bypass;
- natural-language prompt training;
- a change to the nine-token categorical representation;
- rented or cloud GPU use;
- cloud experiment tracking;
- publication or export of data, metrics, reconstructions, checkpoints, weights, renders, or generated structures;
- formal Dataset admission;
- Dataset v1/v2/v3 changes;
- use of the private 22 cases as public-candidate training data;
- primary-provider, Node-generation, or M4 changes; or
- automatic phase, batch, run, resume, evaluation, or product-integration continuation.

## 18. Approval and next gate

The owner approved the progressive single conditional model, complete-building-only scope, multi-axis taxonomy, eight function groups, 100/500/2,000 balance and split rules, single-direction admission flow, five-case acquisition pilot, M1 architecture, FiLM conditioning, dynamic mask curriculum, three-part loss, AdamW profile, local RTX 4060 runtime, fixed A/B recovery slots, four-layer evaluation, quantitative stage gates, and sequential R0-to-R9 decomposition in conversation on 2026-07-17 and 2026-07-18.

The next gate is owner review of this written specification. After written-spec approval, invoke the writing-plans workflow and create a detailed implementation plan for R1, the taxonomy and admission contract only. Neither this specification nor its local commit authorizes payload acquisition, model implementation, real training, processing oversized buildings, Dataset admission, publication, export, Node integration, or M4.
