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
- connected additions receive bounded role-volume joints, while facade bay/opening/foundation semantics emit dedicated geometry modules instead of relying on ambient cells;
- bounded-vocabulary semantics activate the existing restrained-density builder;
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

### Stage handoff matrix

| Architecture Language concept | Current agent/builder | Previous effect | Audited missing handoff | v0.3 deterministic operation | QA condition | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `modern-interlocking-volume`, `connected-mass-addition` | Architect / CreativeDesign / CSG | modern three-volume lock already built; generic connected addition was advisory | compact/single-volume intent could be overwritten by template additions | preserve selected role volumes, add dimension-derived joints, and finalize an explicit compact single-volume constraint before CSG | required IDs and dedicated `volume_joint` cells; general spatial QA still rejects detached boxes | implemented |
| `scaled-column-beam-grid` | StructureAgent / CSG structural details | grids appeared only from style, floors, or long spans | selected language could not request or size visible bays | dimension-derived visible spacing and existing column/ring/roof-frame modules | column-grid hint plus `structural_frame` cells | implemented |
| `roof-orientation-massing-fit` | RoofAgent / CSG roof builder | every gable used the same fixed axis | volume proportions were ignored | choose long ridge axis independently for each eligible volume and voxelize on that axis | component-axis row plus roof cells | implemented |
| `integrated-facade-bay-layering`, `facade-opening-assembly`, `bounded-facade-pattern-vocabulary` | FacadeAgent / CSG facade details | depth and surrounds existed but were not language-selectable | selected bay/vocabulary intent stopped at advisory text | derive supported bay piers and sill/lintel/jamb assemblies from facade dimensions; apply low bounded density | facade hints plus dedicated `facade_bay` / `opening_assembly` cells and windows | implemented |
| `function-led-interior-zoning`, `porous-interior-partition` | Planner / BSP | fields were stored only in architecture directives | BSP read only planner hints | merge validated semantic hints into function-first ordering and public soft-boundary decisions | BSP semantic values, room geometry, open-plan threshold count, connectivity QA | implemented |
| `large-to-small-furnishing-pass` | DecoratorAgent | fixed lighting/accent-first planning order | semantic sequence was ignored | stable pass ordering reserves function-bearing furniture before secondary and small layers | pass order plus actual placed furniture | implemented |
| `landscape-route-and-grounding`, `building-foundation-material-continuity` | SiteLandscapeAgent / CSG site | generic path existed; route strategy was metadata-only | no explicit door-to-path threshold/grounding result | derive threshold from the actual main-door coordinate and derive a material-continuous perimeter from footprint/shell thickness | adjacent path plus `entry_threshold`; dedicated `foundation_transition` cells | implemented; bounded fallback repair |
| six QA-only concepts | BlueprintQAAgent / ConstraintRepairAgent | existing general geometry checks remain active | QA-only concepts must not become repair authority | keep them classified as QA only; validate selected executable result rows as an exact derived sidecar | hard `construction-workflow` check | unchanged QA authority; no P5 repair |

The eight unsupported geometry concepts remain unchanged: diagonal envelope/frame, diagonal unit wall, bounded diagonal accent, alternating conical rise, slope-sequence curve, quarter-circle profile, revolved pointed frame, and pointed rise profile. P7 QA/advisory rows still cannot enter the frozen P5 repair registry.

## Result trace and QA

When Architecture Language is active, `blueprint.constructionWorkflow` is derived after deterministic construction. Each row records:

`knowledge_id -> Architecture Language operation -> workflow stage -> result kind -> actual evidence -> satisfied`

For example:

`knowledge:p7:scaled-column-beam-grid -> language:structure:derived-bay-grid -> structure -> module-and-agent-result -> structural_frame > 0`

`BlueprintQAAgent` rebuilds the complete sidecar from the prompt-bound applied-operation trace and final blueprint, then requires exact schema, authority, ordering, provenance, evidence, counts, and satisfaction. The plan is also revalidated against the original prompt's complete selector set, and the plan/trace rows use exact shapes. It does not trust a stored `satisfied: true`, and deleting or forging the sidecar fails the hard `construction-workflow` check.

Geometry evidence is recomputed rather than accepted by count alone: every connected-role joint must match the bounds-derived endpoints and have a continuous exported line; subtract volumes are excluded consistently; foundation coverage must name every non-subtract volume; and the complete threshold record must match the actual door/path width with every recorded point present in final operations.

The only new repair is `workflow-v0.3-entry-threshold`. It runs only when route-first grounding and a main door exist but the threshold is absent. Its cells derive from the actual main-door coordinate, door side, and door/path width; its record includes before/after module counts. It is idempotent and local, and never calls the P5 registry.

## Deterministic scenario evidence

All scenarios use mock mode, seed 7101, and no Minecraft world path.

| Scenario | Selected rows | Volumes | Grid cells | Operations | Notable modules | Blueprint SHA-256 |
| --- | ---: | --- | ---: | ---: | --- | --- |
| Modern lakeside villa | 9 | `main`, `glass-wing`, `view-terrace` | 9260 | 1258 | frame 578; roof 1158; windows 516; threshold 10 | `7d7e81795ba5516a5ddf2e3f13d050f876fe6741d2f86843cee57a3e25de156b` |
| Medieval multi-volume residence | 8 | 8 connected role volumes | 9509 | 1355 | frame 419; roof 3324; bay 29; opening 269; joint 7; foundation transition 184; threshold 8 | `3b55205eb3eb3db307efe74616589bfcae4b23e64f4e7c71c1469c0a09e8de72` |
| Compact residential building | 4 | `main` only | 3731 | 612 | frame 121; roof 641; windows 126; facade detail 76; threshold 8 | `bd940b0974e20d22d6baa11c77d7bf74b9bcd0850595a39a44b319a04da4c61b` |

Each scenario test generates the v0.3 form twice and compares blueprint bytes, operations, and result rows. It also generates the same prompt/seed without Architecture Language and proves the operation stream differs: modern mass roles are locked to three volumes; medieval frame density and roof axes change; compact template additions collapse to the requested main volume.

Every generated `pack.mcmeta` is format 48. Every coordinate operand in `build.mcfunction` and `clear.mcfunction` is relative (`~`). The runtime needs no absolute origin: copy `architect_datapack/`, stand at the desired origin, `/reload`, then `/function architect:run`.

## Compatibility

The v0.3 blueprint fields, semantic agent fields, roof axes, and QA stats are emitted only when their language semantics are active. Architecture Language absent/playbook-off runs therefore retain the frozen pre-P5 bytes. Mock mode remains API-key-free, the existing function directory stays `data/architect/function/`, and P5 rules, repair compilers, registry, eligibility, and transaction code are unchanged.

Visual or historical-quality claims remain outside automatic authority. The workflow verifies deterministic spatial/geometry consequences, not a fabricated human visual review.

## Verification record

- Focused v0.3: `npm test -- test/constructionWorkflowV03.test.js --test-reporter=spec` — 21 passed, 0 failed.
- Language plus v0.3: `npm test -- test/architectureLanguageV02.test.js test/constructionWorkflowV03.test.js --test-reporter=spec` — 32 passed, 0 failed.
- Related workflow, geometry, compatibility, P5-boundary, and documentation regression — 141 passed, 0 failed:

```text
npm test -- test/architectureLanguageV02.test.js test/constructionWorkflowV03.test.js test/structureAgent.test.js test/bspPartitioner.test.js test/decoratorAgent.test.js test/blueprintQaAgent.test.js test/csgBuilder.test.js test/pipeline.test.js test/projectPolicy.test.js test/playbookExecuteOffCompatibility.test.js test/playbookP7Documentation.test.js test/playbookP7AdvisoryOverlay.test.js test/playbookExecuteRepairRegistry.test.js test/playbookExecuteRepairCompilers.test.js test/playbookExecuteRepairTransaction.test.js test/playbookExecuteContracts.test.js --test-reporter=spec
```
- All Node test commands used `scripts/runNodeTests.js` through `npm test` and the required Linux systemd hard-memory scope. No soft fallback was enabled.
