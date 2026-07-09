# Stage 3 Concept Studio Design

Date: 2026-07-09

## Summary

Stage 3 adds a Concept Studio before construction. For one user prompt, the system will generate several explainable design concepts, compare their trade-offs, select or lightly fuse one concept, and then send only the selected concept into the existing construction workflow.

The first version is a concept-first MVP. It does not replace the current CSG, BSP, A*, decoration, repair, evaluation, datapack, or preview pipeline. It adds a new semantic planning layer that turns Stage 2 template knowledge into multiple architectural directions before the existing `CreativeDesignAgent` commits to a single buildable design.

The goal is to make the system act more like an architect: explore options first, explain them, then build the strongest one.

## Current Context

The repository already has most of the infrastructure Stage 3 needs:

- `TemplateKnowledgeAgent` loads Template Knowledge Base v2 and returns explainable references.
- `ExplainableTemplateRetriever` can return references with `teaches`, risks, and integration targets.
- `CreativeDesignAgent` already owns design variation through massing, topology, facade, roof, site, and interior decisions.
- `DesignVariationEvaluationAgent` can measure same-prompt variation across generated results.
- `CandidateSelectionAgent` can rank fully built candidates by template aesthetic review, design-law coverage, and assimilation audit.
- `runPipeline` already supports multi-candidate construction, but those candidates are full builds rather than explicit pre-build concepts.

Stage 3 should therefore extend the existing workflow instead of introducing a parallel generator.

## Goals

1. Generate 3-5 concept cards for a single prompt before construction.
2. Make every concept explainable: design intent, template references, transferred knowledge, risks, and expected trade-offs.
3. Select one concept automatically by default.
4. Optionally fuse the strongest compatible parts of the top concepts.
5. Convert the selected concept into a `CreativeDesignAgent`-compatible patch.
6. Build only the selected or fused concept in the MVP.
7. Write `concept_studio.json`, `concept_studio_report.md`, and a concise section in `run_report.md`.
8. Keep default single-build behavior unchanged when Stage 3 is disabled.
9. Keep mock mode deterministic and runnable without API keys.
10. Provide benchmark evidence that Stage 3 does not regress build validity or current scorecards.

## Non-Goals

- Do not build a browser UI in the first Stage 3 version.
- Do not train neural retrieval or generation models.
- Do not require rendering screenshots to select a concept.
- Do not build all concepts by default.
- Do not replace `CandidateSelectionAgent`; it remains useful for later full multi-build optimization.
- Do not let an LLM output exact block coordinates.
- Do not change Minecraft Java version, datapack format, or export paths.

## Recommended Approach

Use a concept-first MVP:

```text
Prompt
-> existing ArchitectAgent / PlannerAgent / TemplateKnowledgeAgent
-> ConceptStudioAgent
-> ConceptSelectionAgent
-> optional ConceptFusion
-> CreativeDesignAgent with selected concept context
-> existing construction workflow
-> concept studio artifacts and report sections
```

Only the selected concept enters full construction. This keeps the first version fast enough for normal development while still producing visible design reasoning.

## Alternatives Considered

### Full Multi-Build

Build every concept, score each result, then pick the best. This gives stronger evidence but is slower and duplicates work already covered by the candidate pipeline. It is better as a Stage 3.5 or benchmark mode.

### Browser Concept Studio

Show concept cards and diagrams in a UI and let the user choose. This would improve experience, but it makes Stage 3 depend on frontend work. The MVP should first prove the concept contract and selection quality.

### LLM-Only Concept Selection

Ask the LLM to pick a concept directly. This is easy but weakens determinism and makes mock mode less meaningful. The MVP should use a local selector with clear scoring evidence, while LLM mode may enrich concept text.

## Architecture

Stage 3 adds three source modules and updates the workflow and CLI.

New modules:

- `src/construction/agents/conceptStudioAgent.js`
- `src/construction/agents/conceptSelectionAgent.js`
- `src/construction/agents/conceptFusionAgent.js`

Updated modules:

- `src/construction/workflow.js`
- `src/pipeline.js`
- `src/index.js`

New tests:

- `test/conceptStudioAgent.test.js`
- `test/conceptSelectionAgent.test.js`
- `test/conceptFusionAgent.test.js`
- `test/conceptPipeline.test.js`

The workflow update should be narrow. Concept Studio runs after architecture, topology, template knowledge, and build-spec normalization are available, but before `CreativeDesignAgent` finalizes design directives.

## Data Contract

`concept_studio.json` has this top-level shape:

```json
{
  "source": "local-concept-studio",
  "version": 1,
  "active": true,
  "prompt": "建一个湖边现代两层别墅...",
  "strategy": "select",
  "concept_count": 3,
  "selected_concept_id": "concept-a-view-courtyard",
  "fused_concept_id": "",
  "selection": {},
  "concepts": [],
  "warnings": []
}
```

Each concept card has this shape:

```json
{
  "id": "concept-a-view-courtyard",
  "title": "水景庭院视线方案",
  "archetype": "view-courtyard",
  "summary": "把主要公共空间朝向水景和庭院，强调平台、玻璃和安静动线。",
  "design_intent": [
    "让客厅、餐厅和平台形成连续视线",
    "用前景花园强化入口层次"
  ],
  "reference_strategy": [
    {
      "case_id": "house-a-small-modern-house",
      "title": "A Small Modern House",
      "used_for": ["facade", "site"],
      "teaches": ["Large glass should serve view-facing rooms."],
      "risk_control": "change exact dimensions and detail placement"
    }
  ],
  "massing_plan": {
    "variant_hint": "waterfront-stepped-estate",
    "composition_bias": "front-threshold",
    "key_moves": ["water-edge deck", "offset glass hall", "roof lounge"]
  },
  "space_graph_strategy": {
    "public_core": "living",
    "split_strategy": "open-plan-weighted",
    "priority_rooms": ["living", "dining", "kitchen", "study"]
  },
  "facade_strategy": {
    "window_rhythm": "corner-window-bands",
    "glazing_ratio": "high",
    "entry_detail_style": "recessed-glass-portal"
  },
  "roof_strategy": {
    "profile": "thin-parapet-terrace",
    "style": "flat",
    "roof_terrace": true
  },
  "site_strategy": {
    "mood": "reflecting-water-edge",
    "patio": true,
    "water_feature": true,
    "planting_beds": true
  },
  "interior_strategy": {
    "decor_density": "layered",
    "display_strategy": "long-wall-gallery",
    "room_identity_focus": ["living", "kitchen", "study"]
  },
  "quality_targets": [
    "clear entry sequence",
    "view-facing public rooms",
    "template-level facade depth"
  ],
  "risks": [
    {
      "id": "over-glazing",
      "severity": "medium",
      "text": "High glass ratio may weaken structural rhythm.",
      "mitigation": "Use thick surrounds and alternating solid bays."
    }
  ],
  "creative_design_patch": {
    "massing_variant": "waterfront-stepped-estate",
    "facade": {},
    "roof": {},
    "site": {},
    "interior": {},
    "topology": {}
  }
}
```

The `creative_design_patch` is the bridge to existing construction. It must only contain semantic directives that can be merged into `CreativeDesignAgent` output. It must not contain block coordinates.

## ConceptStudioAgent

`ConceptStudioAgent` creates concept cards from:

- prompt
- architecture summary
- topology summary
- build spec
- template knowledge
- template retrieval explanations
- seed

Mock mode should be deterministic and produce archetype-diverse concepts. The initial archetype pool should include:

- `view-courtyard`: water, garden, and public room views.
- `formal-axis`: stronger symmetry, entry sequence, and composed approach.
- `compact-patio`: smaller footprint, patio niche, and efficient interiors.
- `vertical-landmark`: tower/lookout accent and stronger silhouette.
- `dual-wing-estate`: larger paired wings and family-living emphasis.

The agent should pick concepts that match the prompt. For example, a lakefront modern villa should prefer `view-courtyard`, `compact-patio`, and `dual-wing-estate` over `formal-axis` unless the prompt asks for a manor or ceremonial building.

LLM mode may rewrite titles, summaries, and intent, but must preserve the normalized schema. If LLM output fails validation, the workflow falls back to deterministic mock concepts.

## ConceptSelectionAgent

`ConceptSelectionAgent` scores concepts before construction. The selector should be local and deterministic.

Recommended score structure:

```text
selection_score =
  prompt_match_score
  + reference_evidence_score
  + buildability_prior_score
  + diversity_role_score
  + quality_target_score
  - risk_penalty
```

Inputs:

- concept cards
- prompt
- template retrieval explanation
- build spec constraints
- architecture style and typology

Output:

```json
{
  "source": "local-concept-selection-agent",
  "version": 1,
  "selected_concept_id": "concept-a-view-courtyard",
  "strategy": "highest-local-score",
  "reason": "选择水景庭院视线方案，因为它最匹配湖边、玻璃、平台和精致室内需求。",
  "ranking": [
    {
      "rank": 1,
      "concept_id": "concept-a-view-courtyard",
      "selection_score": 91,
      "prompt_match_score": 30,
      "reference_evidence_score": 22,
      "buildability_prior_score": 18,
      "quality_target_score": 16,
      "risk_penalty": 3
    }
  ],
  "warnings": []
}
```

The selector should prefer concepts that:

- satisfy explicit prompt constraints
- use at least one relevant Stage 2 reference
- include risk mitigations
- fit the requested style and typology
- can be expressed through existing `CreativeDesignAgent` fields

## ConceptFusionAgent

Fusion is optional in the MVP. It should run only when `--concept-strategy fuse` is requested.

Fusion should be conservative:

- Start from the top-ranked concept.
- Pull at most two compatible strengths from the next concept.
- Do not mix conflicting roof styles, massing archetypes, or public-core strategies.
- Preserve explicit prompt constraints.
- Record every adopted element and every rejected conflict.

Fusion output is another concept card with `source_concept_ids`, `adopted_elements`, and `rejected_conflicts`.

## Integration With CreativeDesignAgent

`CreativeDesignAgent.run` should receive concept context:

```json
{
  "conceptStudio": {
    "active": true,
    "selectedConcept": {},
    "selection": {}
  }
}
```

The deterministic fallback should be able to lock or bias these fields:

- `design_axes.massing_variant`
- `facade.window_rhythm`
- `facade.glazing_ratio`
- `facade.entry_detail_style`
- `roof.profile`
- `roof.style`
- `roof.roof_terrace`
- `site.mood`
- `site.water_feature`
- `site.patio`
- `interior.decor_density`
- `interior.display_strategy`
- `topology.split_strategy`
- `topology.public_core`

If a concept patch references an unsupported value, the normalizer should downgrade it to the nearest existing option and record a warning.

## CLI

Add optional flags:

```powershell
npm start -- --mode mock --concepts 3 "建一个湖边现代两层别墅..."
npm start -- --mode mock --concepts 5 --concept-strategy fuse "建一个湖边现代两层别墅..."
```

Flag behavior:

- `--concepts <n>` enables Concept Studio with `n` concepts, clamped to `2-5`.
- `--concept-strategy select|fuse` controls whether to select one concept or fuse top concepts.
- Omitted flags preserve current behavior.
- If `--concepts` and `--candidates` are both requested, pass Concept Studio options into each candidate run. Each candidate records its selected concept, and the existing candidate-selection pipeline remains authoritative for the final built result.

## Artifacts

When active, Stage 3 writes:

```text
out/<timestamp>/
  concept_studio.json
  concept_studio_report.md
```

For candidate mode, each candidate can include the selected concept in its blueprint, but the root candidate-selection report should not duplicate every concept card in full. It should link to candidate concept artifacts instead.

The final `blueprint.json` should include:

```json
{
  "conceptStudio": {
    "active": true,
    "selected_concept_id": "concept-a-view-courtyard",
    "strategy": "select",
    "selection_summary": {},
    "concept_count": 3
  }
}
```

The full concept cards may be included in the blueprint if their size stays small. If they become large, store only the summary in the blueprint and keep the full cards in `concept_studio.json`.

## Report

`concept_studio_report.md` should include:

- prompt
- strategy
- selected concept
- selection reason
- ranking table
- concept cards
- reference sources used by each concept
- risks and mitigations
- selected concept's build directives

`run_report.md` should include a concise section:

```text
## Stage 3 Concept Studio

- Strategy: select
- Concepts: 3
- Selected: 水景庭院视线方案
- Reason: matches lakefront, large glass, water deck, and detailed interior goals.
- Compared alternatives: formal entry axis, compact patio scheme.
```

## Error Handling

- If `--concepts` is omitted, Stage 3 is inactive.
- If template knowledge is inactive, concepts still generate from prompt and seed, with a warning.
- If fewer than two concepts can be produced, disable Concept Studio for that run and use the normal pipeline.
- If LLM concept generation fails in auto mode, fall back to deterministic concepts.
- If selected concept patch fails normalization, keep the concept explanation but remove unsupported patch fields.
- If fusion creates conflicts, fall back to the top selected concept.
- If candidate mode is active and one candidate fails, existing candidate error handling remains authoritative.

## Testing Strategy

Unit tests:

- `ConceptStudioAgent` returns deterministic concepts in mock mode.
- Concept IDs are stable for the same prompt and seed.
- Concepts contain required sections and no coordinate-level block placement.
- Concepts use retrieval references when available.
- `ConceptSelectionAgent` chooses the strongest prompt-matching concept.
- `ConceptSelectionAgent` penalizes unsupported or risky concepts.
- `ConceptFusionAgent` merges compatible strengths and records rejected conflicts.
- Concept patches normalize to supported `CreativeDesignAgent` fields.

Integration tests:

- `runPipeline` with `--concepts 3` produces `concept_studio.json`.
- The final blueprint includes selected concept metadata.
- `run_report.md` includes a Stage 3 section.
- Default `npm start -- --mode mock "prompt"` remains unchanged when concepts are not enabled.
- Candidate mode can run with concepts without breaking existing candidate selection artifacts.

Manual smoke test:

```powershell
npm test
npm start -- --mode mock --seed 7101 --concepts 3 "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
npm start -- --mode mock --seed 7101 --concepts 3 --concept-strategy fuse "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
```

Expected smoke result:

- `concept_studio.json` exists.
- `concept_studio_report.md` exists.
- `blueprint.json` records the selected concept.
- `run_report.md` has a Stage 3 section.
- datapack export and command validation still pass.

## Benchmark Plan

Run the fixed benchmark prompt set in two modes:

1. Current baseline with Stage 3 disabled.
2. Stage 3 enabled with `--concepts 3 --concept-strategy select`.

Track:

- build success rate
- scorecard total
- template aesthetic score
- design-law coverage
- assimilation audit
- red flags
- concept selection score
- concept diversity score
- report readability

Success requires:

- no buildability regression
- no increase in red flags
- average scorecard does not drop
- at least half of benchmark prompts show clearer design intent in reports
- selected concepts are visibly different from rejected concepts in their semantic directives

## Rollout Plan

1. Add concept data normalizers and fixtures.
2. Implement `ConceptStudioAgent` deterministic mock mode.
3. Implement `ConceptSelectionAgent`.
4. Implement conservative `ConceptFusionAgent`.
5. Wire Concept Studio into `runConstructionWorkflow`.
6. Add CLI flags.
7. Add artifacts and report rendering.
8. Add targeted unit tests.
9. Add integration tests.
10. Run `npm test`.
11. Run one mock select smoke test.
12. Run one mock fuse smoke test.
13. Run benchmark comparison.

## Success Criteria

Stage 3 MVP is complete when:

- A single prompt can produce 3-5 concept cards before construction.
- Every concept has design intent, reference strategy, risks, and a buildable semantic patch.
- Automatic selection produces a readable reason and ranking.
- The selected or fused concept drives `CreativeDesignAgent` output.
- Final artifacts include concept JSON, concept report, blueprint metadata, and run-report summary.
- Mock mode remains deterministic and API-key-free.
- Default runs without `--concepts` preserve current behavior.
- Tests pass.
- Benchmark comparison shows no regression and at least one measurable gain in explainability or design quality.

## Deferred Work

- Browser-based concept gallery.
- Human interactive concept selection.
- Full multi-build concept comparison.
- Rendered thumbnail generation.
- Neural concept generation or text-case embedding.
- Persistent user taste memory.
- Learning from rejected concepts.
