# Stage 2 Template Knowledge Base 2.0 Design

Date: 2026-07-09

## Summary

Stage 2 upgrades the template system from generated analysis files into a governed architectural memory. The system will keep the current template analyzer and runtime knowledge agent, then add a versioned v2 knowledge layer on top: normalized case cards, human review overlays, high-value ranking, and explainable retrieval.

The first production goal is not to collect more templates. The first goal is to make the existing 64 templates trustworthy enough that any prompt can retrieve 3-8 relevant references and explain what each reference contributes, what it must not teach, and which generator modules should consume it.

## Current Context

The repository already has useful template assets:

- Raw local schematic templates under `mc_templates/<category>/`.
- Generated analysis under `mc_templates/analysis/`.
- `template_index.json` with automatic template statistics and profiles.
- `case_library.json` with Stage 7A/7B case cards.
- `retrieval_index.json` and `semantic_clauses.jsonl`.
- `design_laws.json` and `interior_laws.jsonl`.
- Runtime consumption through `TemplateKnowledgeAgent`.

Current strengths:

- The analyzer can parse template metadata, dimensions, block categories, terrain signals, interior signals, spatial evidence, furniture groups, and composition grammar.
- Case cards already expose learnable areas, review flags, risk controls, semantic clauses, and prompt affinities.
- The generator already consumes template knowledge for materials, massing, facade, roof, site, interior clauses, and design-law coverage.

Current gaps:

- Case cards are generated artifacts, not durable reviewed records.
- Human review is implied by flags, but there is no first-class review workflow.
- Labels are not normalized into a stable taxonomy with confidence and provenance.
- Retrieval is embedded in `TemplateKnowledgeAgent` and is hard to inspect independently.
- Retrieval explanations are not explicit enough for reports or future Concept Studio use.
- Priority ranking does not clearly separate global quality, prompt match, area-specific usefulness, review state, and risk.

## Goals

1. Define a stable `case_library.v2.json` contract.
2. Add a review overlay workflow that never requires editing generated JSON by hand.
3. Produce a high-value template priority list for review and generation.
4. Add an explainable retriever that returns 3-8 references for any prompt.
5. Preserve current generation behavior until the v2 retriever is verified.
6. Keep default operation runnable without API keys.
7. Make every v2 artifact reproducible from source templates, generated v1 analysis, and review overlays.

## Non-Goals

- Do not reorganize the raw template directory layout in this stage.
- Do not train a neural model in this stage.
- Do not require Minecraft rendering or screenshots for the first v2 pass.
- Do not replace `TemplateKnowledgeAgent` immediately.
- Do not scrape or download new templates as part of the first implementation.
- Do not expose uncertain-license templates as public dataset artifacts.

## Architecture

Stage 2 adds a v2 layer above the existing analyzer:

```text
mc_templates/<category>/*.schematic
        |
        v
existing analyzer
        |
        v
mc_templates/analysis/template_index.json
mc_templates/analysis/case_library.json
mc_templates/analysis/design_laws.json
        |
        v
review overlay merge
        |
        v
mc_templates/analysis/case_library.v2.json
mc_templates/analysis/retrieval_index.v2.json
mc_templates/analysis/template_priority_report.md
mc_templates/analysis/template_review_queue.md
        |
        v
ExplainableTemplateRetriever
        |
        v
TemplateKnowledgeAgent v2 adapter and run reports
```

The v2 builder is deterministic. It reads existing generated analysis plus human overlays, then writes versioned derived artifacts. Human edits live outside generated files.

## Files And Modules

New human-maintained files:

- `mc_templates/curation/template_reviews.jsonl`
- `mc_templates/curation/tag_taxonomy.json`

New generated artifacts:

- `mc_templates/analysis/case_library.v2.json`
- `mc_templates/analysis/retrieval_index.v2.json`
- `mc_templates/analysis/template_priority_report.md`
- `mc_templates/analysis/template_review_queue.md`

New source modules:

- `src/construction/templates/templateKnowledgeBaseV2.js`
- `src/construction/templates/templateReviewOverlay.js`
- `src/construction/templates/templateTagTaxonomy.js`
- `src/construction/templates/templateExplainableRetriever.js`
- `src/queryTemplateKnowledge.js`

Updated source modules:

- `src/construction/templates/schematicAnalyzer.js`
- `src/construction/agents/templateKnowledgeAgent.js`
- `src/construction/workflow.js`
- `package.json`

New tests:

- `test/templateKnowledgeBaseV2.test.js`
- `test/templateReviewOverlay.test.js`
- `test/templateExplainableRetriever.test.js`

## Data Contract

`case_library.v2.json` has this top-level shape:

```json
{
  "source": "template-knowledge-base-v2",
  "schema_version": 2,
  "generated_at": "2026-07-09T00:00:00.000Z",
  "knowledge_base_id": "sha256-input-hash",
  "inputs": {
    "case_library": "mc_templates/analysis/case_library.json",
    "template_index": "mc_templates/analysis/template_index.json",
    "design_laws": "mc_templates/analysis/design_laws.json",
    "review_overlay": "mc_templates/curation/template_reviews.jsonl",
    "tag_taxonomy": "mc_templates/curation/tag_taxonomy.json"
  },
  "summary": {},
  "cases": []
}
```

Each v2 case has this shape:

```json
{
  "case_id": "house-tavern",
  "case_version": "sha256-case-hash",
  "title": "Tavern",
  "file": "House/Tavern - (mcbuild_org).schematic",
  "identity": {
    "category": "House",
    "typology": "house",
    "style_family": "medieval",
    "scale_bucket": "medium"
  },
  "source": {
    "url": "https://example.test/source",
    "note": "curated source note",
    "license_status": "research-only",
    "author": "",
    "public_release_allowed": false
  },
  "review": {
    "status": "pending",
    "reviewed_by": "",
    "reviewed_at": "",
    "confidence": 0,
    "notes": "",
    "approved_learning_areas": [],
    "blocked_learning_areas": [],
    "manual_tags": [],
    "risk_overrides": []
  },
  "tags": {
    "typology": [],
    "style": [],
    "site": [],
    "massing": [],
    "roof": [],
    "facade": [],
    "interior": [],
    "quality": [],
    "room_types": []
  },
  "knowledge_units": [],
  "priority": {
    "global_score": 0,
    "area_scores": {},
    "review_bonus": 0,
    "risk_penalty": 0,
    "high_value_rank_reason": []
  },
  "retrieval": {
    "search_tokens": [],
    "prompt_affinities": [],
    "diversity_slots": [],
    "explanation_seeds": []
  },
  "risk_controls": [],
  "lineage": {
    "v1_case_id": "house-tavern",
    "input_hashes": {},
    "review_record_ids": []
  }
}
```

### Tag Records

Tags are normalized records, not raw strings:

```json
{
  "id": "water-edge",
  "label": "water edge",
  "confidence": 0.88,
  "source": "auto-composition",
  "evidence": "water_edge composition pattern and water block ratio"
}
```

Allowed tag groups:

- `typology`: house, castle, tower, temple, public-building, arena, scene-building.
- `style`: modern, medieval, japanese, classical, gothic, coastal, rustic, fantasy, general.
- `site`: flat, terrain-integrated, garden, water-edge, courtyard, forest, urban, island, slope.
- `massing`: compact-block, long-bar, asymmetric-wings, balanced-axis, courtyard-or-void, vertical-landmark, stepped-terraces.
- `roof`: flat-terrace, tower-cap, layered-eaves, deep-overhang, stepped-roofline, pitched-roof.
- `facade`: large-glass, formal-symmetry, vertical-slots, micro-depth-trim, rail-balcony, lit-depth-points.
- `interior`: furnished, room-layout-rich, furniture-pattern-rich, study-library, vertical-circulation, sparse-interior.
- `quality`: high-value-reference, needs-scale-normalization, research-only, review-before-deep-mining, exterior-only.
- `room_types`: living, kitchen, bedroom, bathroom, study, storage, workshop, corridor-or-gallery, entry-or-lobby, tower-room, chapel-or-ceremonial-hall.

The taxonomy starts small and explicit. New tags require adding entries to `tag_taxonomy.json` and tests.

### Knowledge Units

Knowledge units are the core memory objects. Each unit states what a case can teach:

```json
{
  "id": "house-tavern:interior:social-cluster",
  "area": "interior",
  "claim": "Use clustered seating and focal wall details to make the living room read as inhabited.",
  "evidence": [
    "furniture_group_reference score 80",
    "social_cluster furniture pattern"
  ],
  "confidence": 0.82,
  "use_as": [
    "interior room identity",
    "decorator pattern guidance"
  ],
  "avoid_when": [
    "prompt asks for unfurnished shell",
    "room footprint is too narrow for furniture clusters"
  ],
  "integration_targets": [
    "InteriorDetailAgent",
    "DecoratorAgent"
  ],
  "source_fields": [
    "case_profile.phase3_pattern_evidence",
    "semantic_clauses"
  ]
}
```

Knowledge areas:

- `site`
- `massing`
- `facade`
- `roof`
- `space-planning`
- `interior`
- `materials`
- `risk`

## Review Overlay Workflow

Human review is append-only JSONL:

```json
{
  "record_id": "review-2026-07-09-house-tavern-001",
  "case_id": "house-tavern",
  "reviewed_by": "human",
  "reviewed_at": "2026-07-09T00:00:00.000Z",
  "status": "approved",
  "confidence": 0.9,
  "approved_learning_areas": ["interior", "site", "massing"],
  "blocked_learning_areas": [],
  "manual_tags": [
    { "group": "quality", "id": "high-value-reference", "confidence": 0.9, "evidence": "manual review" }
  ],
  "risk_overrides": [],
  "notes": "Useful residential interior and tavern atmosphere reference."
}
```

Review statuses:

- `pending`: no human decision yet.
- `approved`: safe for normal retrieval in approved areas.
- `limited`: usable only in explicitly approved areas.
- `rejected`: kept for provenance but excluded from retrieval.
- `research-only`: usable locally, not for public dataset release.

Merge rules:

1. Automatic evidence is preserved.
2. The newest valid review record for a case controls `review.status`.
3. Manual approved areas add retrieval weight.
4. Manual blocked areas remove corresponding knowledge units from normal retrieval.
5. Manual risk overrides add or suppress risk controls, but never remove source/license warnings.
6. Invalid overlay lines are reported with line numbers and do not break the whole build unless strict mode is enabled.

The review queue is generated from:

- Missing source URL or weak text metadata.
- High automatic score with unresolved review flags.
- Cases used frequently by retrieval.
- Non-residential templates that might be useful for site/massing but risky for interiors.
- Templates with strong interior signals but low confidence or noisy spatial segmentation.

## Explainable Retrieval

The new `ExplainableTemplateRetriever` consumes `case_library.v2.json`.

Input:

```json
{
  "prompt": "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰",
  "context": {
    "style_family": "modern",
    "typology": "house"
  },
  "limit": 8
}
```

Output:

```json
{
  "source": "template-explainable-retriever-v1",
  "active": true,
  "prompt": "...",
  "references": [
    {
      "rank": 1,
      "case_id": "house-a-small-modern-house",
      "title": "A Small Modern House",
      "file": "House/A Small Modern House - (mcbuild_org).schematic",
      "match_score": 86,
      "diversity_slot": "modern-house-water-glass",
      "matched_signals": [
        "style:modern",
        "typology:house",
        "facade:large-glass",
        "site:water-edge"
      ],
      "teaches": [
        {
          "area": "facade",
          "claim": "Large glass should serve view-facing rooms instead of random wall fill.",
          "confidence": 0.84
        }
      ],
      "risk_controls": [
        "change exact dimensions and detail placement; do not copy block-for-block"
      ],
      "integration_targets": [
        "TemplateSpacePlanningStrategy",
        "FacadeAgent",
        "DecoratorAgent"
      ],
      "explanation": "Matches modern residential style, glass facade, and water-edge scene. Best used for facade rhythm and view-facing public rooms."
    }
  ],
  "warnings": []
}
```

Ranking formula:

```text
match_score =
  prompt_token_score
  + style_typology_score
  + area_relevance_score
  + knowledge_unit_score
  + review_bonus
  + diversity_bonus
  - risk_penalty
```

Retrieval constraints:

- Return 3-8 references when at least 3 usable cases exist.
- Prefer reviewed `approved` and `limited` cases.
- Allow `pending` cases only when risk controls are clear.
- Exclude `rejected` cases.
- For residential interior prompts, do not use arena or exterior-only cases as interior references.
- Keep diversity across areas: at least one site/massing reference and one interior/facade reference when the prompt asks for both.
- Every returned reference must include at least one `teaches` item and one risk/control statement.

If fewer than 3 safe cases match strongly, the retriever backfills from high-value general cases and adds a warning explaining the weaker match.

## Integration With Generation

The first implementation keeps the existing `TemplateKnowledgeAgent` public behavior stable.

Integration phases:

1. Build v2 artifacts without changing runtime generation.
2. Add `npm run query:templates -- "prompt"` for retrieval inspection.
3. Let `TemplateKnowledgeAgent` load v2 when available and fall back to v1 otherwise.
4. Add retrieved explanations to `blueprint.templateKnowledge.retrieval_explanation`.
5. Render a short reference section in `run_report.md`.
6. Use v2 knowledge units to replace selected v1 semantic clause selection only after tests show equivalent or better behavior.

Report section:

```text
## 模板参考记忆

- A Small Modern House: 匹配 modern house / large glass / water edge. 学习立面视线玻璃和屋顶露台边界；不复制尺寸和窗位。
- Tavern: 学习室内 focal wall、社交家具组和入口氛围；不用于现代材料。
```

## Error Handling

- Missing v2 artifacts: runtime falls back to existing v1 template knowledge.
- Missing review overlay: builder treats all cases as `pending`.
- Invalid review line: builder reports line number and continues in non-strict mode.
- Missing taxonomy tag: builder preserves raw evidence but records `unknown_tag_count` and emits a review warning.
- Retrieval with no case library: returns inactive result with reason.
- Retrieval with too few safe cases: returns fewer references only if the library truly has fewer than 3 usable cases, with warnings.

## Testing Strategy

Unit tests:

- Overlay parser accepts valid JSONL review records.
- Overlay parser reports invalid lines with line numbers.
- Newest review record wins for status and review fields.
- Manual approved areas boost corresponding knowledge units.
- Manual blocked areas suppress corresponding knowledge units.
- Taxonomy rejects unknown tag IDs unless they are preserved as raw evidence warnings.
- v2 builder emits stable `schema_version: 2`, `knowledge_base_id`, `case_version`, and summary counts.
- v2 builder converts v1 semantic clauses and profiles into knowledge units.
- Retriever returns 3-8 references for representative modern, medieval, Japanese, castle, tower, and waterfront prompts.
- Retriever excludes arena interior references for residential prompts.
- Retriever includes explanation, teaches, risk controls, and integration targets for every returned reference.

Integration tests:

- `npm run analyze:templates -- --offline` writes v2 artifacts.
- `TemplateKnowledgeAgent` loads v2 when present and v1 when absent.
- A mock pipeline run includes template retrieval explanations in the blueprint and report.
- Existing template assimilation tests continue to pass.

Manual smoke test:

```powershell
npm run analyze:templates -- --offline
npm run query:templates -- "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
npm start -- --mode mock --seed 7101 "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
```

Expected smoke result:

- `case_library.v2.json` exists.
- `retrieval_index.v2.json` exists.
- `template_review_queue.md` lists cases needing human review.
- `npm run query:templates` prints 3-8 explained references.
- `run_report.md` contains `模板参考记忆`.
- The generated blueprint has 3-8 explained references.

## Rollout Plan

1. Add taxonomy and review overlay parser.
2. Add v2 case builder and generated reports.
3. Add explainable retriever with fixture tests.
4. Wire analyzer to emit v2 artifacts.
5. Wire runtime to read v2 with v1 fallback.
6. Add report rendering.
7. Run targeted tests.
8. Run full `npm test`.
9. Run one offline analysis smoke test and one mock generation smoke test.

## Success Criteria

Stage 2 first version is complete when:

- `case_library.v2.json` is generated deterministically.
- Human review overlays can approve, limit, or reject cases without editing generated artifacts.
- `template_review_queue.md` prioritizes the cases a human should inspect first.
- `template_priority_report.md` ranks high-value references by learning area and risk.
- Given any benchmark prompt, the retriever returns 3-8 references or a clear warning explaining why fewer are safe.
- Each returned reference explains what it teaches and what must be avoided.
- Runtime generation still works in `--mode mock` without API keys.
- Existing tests pass.

## Deferred Work

These are intentionally outside the first Stage 2 implementation:

- Rendering screenshots for human review.
- Training embedding, classification, or visual scoring models.
- Adding a browser review UI.
- Expanding the template corpus beyond the existing local set.
- Replacing design-law distillation with v2 knowledge units.

The v2 contract leaves room for those later stages without requiring them now.
