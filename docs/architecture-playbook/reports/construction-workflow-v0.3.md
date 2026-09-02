# Construction Workflow v0.3 Implementation Report

Date: 2026-09-02

## Outcome

Construction Workflow v0.3 keeps Architecture Language v0.2 as the prompt/hash-bound semantic authority and makes its selected operations observable in the existing `construction_method_v1` grid. It adds no second generator, no absolute build origin, no world management, and no new P5 repair operation.

The audited metadata-only handoffs are now executable:

- function-first zoning changes BSP to `function-first-weighted` ordering;
- porous public partitions create collision-safe open-plan thresholds while private boundaries remain solid;
- large-to-small furnishing reserves cells for function-bearing furniture before storage/work pieces, lighting, and small accents;
- route-first grounding creates a door/path-width-derived stone threshold joined to the existing entrance path;
- a visible structural-bay request changes dimension-derived column spacing and therefore actual frame cells;
- roof orientation uses each volume's proportions to choose the long ridge axis and changes gabled roof cells;
- facade bay/opening/bounded-vocabulary semantics activate existing relief, sill/lintel/frame, and restrained-density builders;
- an explicit compact single-volume constraint survives CreativeDesign and removes unrelated template additions.

## Capability matrix result

All 123 canonical P7 concepts remain classified exactly once. The v0.3 counts are:

| Classification | Count |
| --- | ---: |
| already-executable | 4 |
| feasible-deterministic-mapping | 9 |
| bounded-parameter-or-planner-preference | 7 |
| qa-check-only | 6 |
| advisory-only | 89 |
| unsupported | 8 |

The newly bound concepts are connected mass additions, scaled column-beam grids, volume-proportion roof orientation, integrated facade bays, opening assemblies, bounded facade vocabulary, foundation continuity, and porous partitions. Connected-mass and bounded-vocabulary decisions remain preferences around existing compilers; they are not arbitrary-coordinate operations.

The eight unsupported geometry concepts remain unchanged: diagonal envelope/frame, diagonal unit wall, bounded diagonal accent, alternating conical rise, slope-sequence curve, quarter-circle profile, revolved pointed frame, and pointed rise profile. P7 QA/advisory rows still cannot enter the frozen P5 repair registry.

## Result trace and QA

When Architecture Language is active, `blueprint.constructionWorkflow` is derived after deterministic construction. Each row records:

`knowledge_id -> Architecture Language operation -> workflow stage -> result kind -> actual evidence -> satisfied`

For example:

`knowledge:p7:scaled-column-beam-grid -> language:structure:derived-bay-grid -> structure -> module-and-agent-result -> structural_frame > 0`

`BlueprintQAAgent` recomputes satisfaction from blueprint modules, volume IDs, BSP results, roof component axes, and decorator passes. It does not trust a stored `satisfied: true`; a forged row with no frame modules fails the new hard `construction-workflow` check.

The only new repair is `workflow-v0.3-entry-threshold`. It runs only when route-first grounding and a main door exist but the threshold is absent. Its cells derive from building footprint, door side, and door/path width. It is idempotent and local, and never calls the P5 registry.

## Deterministic scenario evidence

All scenarios use mock mode, seed 7101, and no Minecraft world path.

| Scenario | Selected rows | Volumes | Grid cells | Operations | Notable modules | Blueprint SHA-256 |
| --- | ---: | --- | ---: | ---: | --- | --- |
| Modern lakeside villa | 9 | `main`, `glass-wing`, `view-terrace` | 9260 | 1258 | frame 578; roof 1158; roof detail 205; windows 516; threshold 5 | `850582e87a29e387748449fe1fb0f9801fd56a16ee2a969aaaf74982295aceaf` |
| Medieval multi-volume residence | 7 | 8 connected role volumes | 9428 | 1343 | frame 421; roof 3330; windows 512; facade detail 201; threshold 3 | `90129ba5be0affd1669cd01c03779a69e5873022a56aa496b3e2d959f28b4543` |
| Compact residential building | 4 | `main` only | 3731 | 612 | frame 121; roof 641; windows 126; facade detail 76; threshold 3 | `39eac4be953ca2dab11a250d6d63ebf659bef135a2accca37488f8024495c506` |

Each scenario test generates the v0.3 form twice and compares blueprint bytes, operations, and result rows. It also generates the same prompt/seed without Architecture Language and proves the operation stream differs: modern mass roles are locked to three volumes; medieval frame density and roof axes change; compact template additions collapse to the requested main volume.

Every generated `pack.mcmeta` is format 48. Every coordinate operand in `build.mcfunction` and `clear.mcfunction` is relative (`~`). The runtime needs no absolute origin: copy `architect_datapack/`, stand at the desired origin, `/reload`, then `/function architect:run`.

## Compatibility

The v0.3 blueprint fields, semantic agent fields, roof axes, and QA stats are emitted only when their language semantics are active. Architecture Language absent/playbook-off runs therefore retain the frozen pre-P5 bytes. Mock mode remains API-key-free, the existing function directory stays `data/architect/function/`, and P5 rules, repair compilers, registry, eligibility, and transaction code are unchanged.

Visual or historical-quality claims remain outside automatic authority. The workflow verifies deterministic spatial/geometry consequences, not a fabricated human visual review.
