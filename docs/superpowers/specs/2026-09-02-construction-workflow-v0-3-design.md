# Construction Workflow v0.3 Design

**Date:** 2026-09-02

## Goal and boundary

Construction Workflow v0.3 turns the bounded Architecture Language v0.2 plan into observable construction decisions in the existing `construction_method_v1` pipeline. It does not ingest more subtitles, create a second generator, emit absolute world coordinates, or grant P7 advisory knowledge P5 repair authority.

The workflow remains:

`knowledge -> Architecture Language v0.2 -> existing design stage -> existing deterministic operation -> grid/module result -> QA -> bounded local repair -> export`

P5 reviewed rules, the repair registry, the one-repair budget, playbook-off behavior, frozen/golden fixtures, mock mode, Java 1.21/1.21.1 format 48, and relative-coordinate export remain authoritative and unchanged.

## Audited handoff gaps

Architecture Language v0.2 already reaches real geometry for the three-volume modern composition, roof profile, glazing, facade depth, and entry treatment. Three selected fields stop before geometry:

- `site_rules.route_strategy` is written but the Site agent and CSG path/grounding builder ignore it.
- `design_directives.interior.space_planning` is written but BSP does not derive split/adjacency choices from it.
- `design_directives.interior.furnishing_sequence` is written but Decorator uses its fixed decoration-first ordering.

The existing roof and structure builders create real modules, but Architecture Language lacks bounded selectors for a medieval multi-volume roof/frame. Existing QA proves general validity but does not prove that each selected language operation survived into its responsible plan and result module.

## Capability matrix

| Concern | Canonical knowledge | v0.2 state | v0.3 executable mapping | Result evidence | Repair authority |
| --- | --- | --- | --- | --- | --- |
| Massing | `connected-mass-addition`, `modern-interlocking-volume` | modern interlock executable; connected additions advisory | preserve connected role-bearing volumes; medieval prompt selects existing multi-volume topology without fixed dimensions | connected `shell.volumeBoxes`; no detached-volume QA error | existing geometry only |
| Structure | `scaled-column-beam-grid`, `visual-support-check` | grid implicit; support QA-only | set bounded frame-grid intent; existing Structure agent derives bays/supports from spans | `structural_frame`/`roof_frame` modules and workflow result row | QA-only local check |
| Roof | `roof-orientation-massing-fit`, `compound-roof-seam-cleanup`, `even-span-roof-closure` | roof geometry exists; checks classified only | choose ridge axis/profile from volume proportions; render each connected volume with the existing roof builder | roof modules per eligible volume; seam/closure checks | no P7 repair request |
| Facade | `integrated-facade-bay-layering`, `facade-opening-assembly`, `scale-appropriate-entry-opening` | depth hierarchy exists | enable existing bay/depth/opening/entry hints from the brief and building scale | facade relief, surrounds/sills/entry-detail modules | no P7 repair request |
| Interior | `function-led-interior-zoning`, `porous-interior-partition`, `large-to-small-furnishing-pass` | language fields metadata-only | BSP consumes function/porosity hints; Decorator orders footprint-bearing furniture before small accents | split strategy, soft-boundary modules, ordered placement trace and actual furniture | bounded collision-safe placement only |
| Site | `landscape-route-and-grounding`, `building-foundation-material-continuity` | route field metadata-only | Site agent emits route/threshold/grounding intent; CSG derives width/extent from main door and footprint | connected `entry_path` plus `entry_threshold`/`foundation_transition` modules | one idempotent local missing-threshold repair |
| QA | six existing QA-only concepts plus workflow handoffs | generic hard QA | validate selected operation -> responsible-plan signal -> expected module/result; fail closed on missing handoff | `constructionWorkflow` trace and `construction-workflow` QA check | remains separate from P5 |

Unsupported diagonal, revolved, conical, circle-profile, and arbitrary curve concepts remain unsupported. All unlisted canonical entries remain advisory-only unless the v0.2 catalog explicitly classifies them otherwise.

## Scenario selection

Three deterministic mock briefs exercise different slices:

1. Modern lakeside: three connected masses, flat/parapet roof, daylight facade, private sheltered entry, route grounding, function-first zoning, and large-to-small furnishing.
2. Medieval multi-volume: connected volumes, scaled visible frame, proportion-derived pitched roof axes, compound roof checks, facade bays/opening assemblies, and material-continuous grounding.
3. Compact residential: one compact mass, restrained facade/opening vocabulary, function-first zoning, porous boundary only where circulation remains valid, and a short derived entry transition. It must not acquire extra masses merely to satisfy the language.

Selection is conservative, prompt-bound, canonical-order, and negation-aware. Semantic plans contain no block IDs, commands, or coordinates.

## Runtime and trace contract

The authoritative `blueprint.constructionWorkflow` object has a version, scenario classification, and canonical rows. Each row contains the selected knowledge ID, existing language operation ID, responsible workflow stage, a bounded result kind, evidence counters/identifiers, and `satisfied`. It is derived after geometry and decoration, not accepted from an LLM.

`BlueprintQAAgent` validates those rows against the blueprint itself. A forged success flag cannot hide absent modules. The human report renders `knowledge -> language -> stage -> operation -> result` without creating a second writable authority.

## Bounded repair

Only one new local repair is allowed: when route-first grounding was selected, a main door exists, and the deterministic site handoff omitted its adjacent threshold, add a footprint/door-derived `entry_threshold` cell sequence. It is idempotent, remains inside the generated relative grid, records before/after evidence, and does not enter or modify the P5 repair registry. No numeric architectural rule is inferred from subtitles.

## Verification

Every behavior begins with a failing test. Focused unit and workflow tests cover handoffs, deterministic modules, QA failure detection, idempotent repair, negation, and three same-seed scenarios. Compatibility covers playbook-off, P5/golden fixtures, mock mode, format 48, relative commands, and no world writes. Final verification runs the complete suite through `npm test` under the required hard memory scope, followed by independent specification and quality/security reviews.
