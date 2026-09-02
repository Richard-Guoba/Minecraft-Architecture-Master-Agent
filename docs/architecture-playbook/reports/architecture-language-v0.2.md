# Architecture Language v0.2 Implementation Report

Date: 2026-09-02

## Product boundary

Architecture Language v0.2 is a versioned, bounded semantic plan between the canonical P7 advisory overlay and the existing `construction_method_v1` workflow. It contains the overlay hash, an exact prompt hash, school, selected knowledge IDs, classified instructions, semantic parameters, workflow stages, and applied-operation trace. The prompt binding prevents reuse against a different user brief. It contains no arbitrary world coordinates, Minecraft commands, block IDs, JSON patches, or P5 repair requests.

The runtime validates the canonical heihui-jileniao overlay before selection. Both mock and LLM execute use it. LLM mode still uses the existing bounded design envelope; mock mode keeps that frozen envelope unchanged and receives Architecture Language through a separate local deterministic channel.

## Complete capability classification

`classifyP7ArchitectureLanguage()` emits one row for every one of the 123 canonical entries. Tests reject missing, duplicated, fabricated, reordered-authority, and hash-drift input. The current counts are:

| Classification | Count | Current boundary |
| --- | ---: | --- |
| already-executable | 4 | Existing relative volume transforms, shell-before-interior ordering, facade depth layers, and planner/BSP/A* stairs |
| feasible-deterministic-mapping | 4 | New bounded roof, entrance, daylight-opening, and three-volume interlock adapters |
| bounded-parameter-or-planner-preference | 4 | Route grounding, function-first zoning, large-to-small furnishing, and private entry openness |
| qa-check-only | 6 | Visible support, void fragmentation, roof seams, even-span closure, roof-detail hierarchy, and foreground occlusion; never repair authority |
| advisory-only | 97 | Retained as explicit guidance because no reviewed deterministic compiler/check exists |
| unsupported | 8 | Diagonal envelopes/unit walls/accents, circle profiles, conical and revolved pointed roofs |

The eight unsupported IDs are `diagonal-envelope-and-roof-frame`, `diagonal-unit-wall`, `bounded-diagonal-accent`, `alternating-conical-roof-rise`, `slope-sequence-curve`, `quarter-profile-circle`, `revolved-pointed-roof-frame`, and `pointed-roof-rise-profile`, all under the `knowledge:p7:` namespace. Every remaining row is individually represented by the canonical ordered runtime catalog; conservative defaulting is `advisory-only`, never executable.

## Residential vertical slice

The representative modern lakeside villa selects eight entries in canonical overlay order:

1. `knowledge:p7:modern-flat-roof-option` → roof → `language:roof:flat-parapet`
2. `knowledge:p7:weather-sheltered-entrance-transition` → facade → `language:facade:sheltered-entry`
3. `knowledge:p7:landscape-route-and-grounding` → site → `language:site:route-first-grounding`
4. `knowledge:p7:function-led-interior-zoning` → interior → `language:interior:function-first-zoning`
5. `knowledge:p7:large-to-small-furnishing-pass` → interior → `language:interior:large-to-small-pass`
6. `knowledge:p7:daylit-window-wall-integration` → facade → `language:facade:daylit-window-wall`
7. `knowledge:p7:modern-interlocking-volume` → massing → `language:massing:three-volume-interlock`
8. `knowledge:p7:modern-program-entry-openness` → facade → `language:facade:private-entry-openness`

The massing adapter uses the existing `east-offset-glass-wing` creative variant and finalizes the semantic roles as `main`, `glass-wing`, and `view-terrace`. This is deliberately compatible with the frozen P5 three-volume rule. An earlier five-part waterfront mapping was rejected by real P5 eligibility and replaced after a failing regression test; no P5 threshold or repair authority changed.

## Workflow connection and evidence

The applied plan modifies only existing architecture and build-spec semantic fields. Existing semantic agents then run normally, followed by Structure/Roof/Facade agents, CSG, BSP, A*, site/interior/detail agents, hard QA, the existing bounded repair layers, evaluation, and datapack export.

Each selected run writes:

- `blueprint.json#architectureLanguage`: the authoritative selected plan and applied-operation trace beside resulting semantics;
- `run_report.md`: human-readable knowledge → stage → operation rows;
- `architect_datapack/`: unchanged format-48 relative-coordinate output.

Two seed-7101 execute mock runs selected `candidate-02` with identical chain SHA-256 `8f4d6b0fc680a9ff1d731f14a3738366f3a743a3a1b193721589c19414c9d523`. Their blueprint SHA-256 was `162a5a7615c0851cb88d6c4559cc52f00c2b1876e31446bfd7788f5003eb0076`; a sorted compact projection of `blueprint.json#architectureLanguage` hashed to `7b5cab6f56075a18de6b4c6f17adc65036d2df4a7387e97c498174307f518b40`; and all four datapack files were byte-identical. Keeping one trace at the blueprint's top-level authority avoids both a second writable artifact and an ambiguous nested copy.

The compared off-mode seed-7101 run contains no `architectureLanguage` field and retains the ordinary template-driven six-volume result for the same brief. The on-mode result contains the bounded three-volume interlock. Explicit negations and incompatible constraints suppress mappings instead of overriding the user brief. This is an explainable opt-in difference, not a claim of aesthetic superiority.

`pack.mcmeta` reports format 48. Automated and manual inspection confirms every coordinate operand in `build.mcfunction` and `clear.mcfunction` begins with `~`; `run.mcfunction` calls only `architect:clear`, `architect:build`, and the completion message. No world was opened or modified.

## Authority and remaining work

The six-episode reviewed corpus, its 21 rule IDs, four P5 repair compilers, eligibility rules, and one-repair budget are unchanged. Advisory/QA-only Architecture Language rows cannot reach `repairTransaction` or the repair registry. Playbook-off does not load or emit Architecture Language.

Remaining work is to promote additional concepts only when an existing capability can be bound honestly or a new deterministic compiler/check is designed with independent tests. Priority candidates are compound-roof seam QA, terrain-responsive paths, facade bay hierarchy, and porous interior partitions. Visual claims still require the optional P6/human review boundary.
