# Stage 5 Neural Retrieval and Auto Tagging Design

Date: 2026-07-09

## Summary

Stage 5 adds a neural-assist layer to Template Knowledge Base v2. The goal is to reduce manual template labeling work and improve prompt-to-reference retrieval while keeping the main Minecraft construction pipeline deterministic, inspectable, and safe to run without API keys.

The first version is artifacts-first. Offline analysis writes neural label suggestions, a case embedding index, and retrieval evaluation reports. Runtime generation may read those artifacts for fusion ranking, but it never depends on live model calls. If neural artifacts are missing, disabled, stale, or invalid, the system falls back to the current `ExplainableTemplateRetriever` and keeps normal mock mode behavior.

## Current Context

The repository already has the right foundation for Stage 5:

- `case_library.v2.json` contains 64 reviewed-contract case records with tags, knowledge units, risk controls, review status, and retrieval tokens.
- `retrieval_index.v2.json` exposes deterministic token and area indexes.
- `labels.generated.jsonl` contains rule-generated labels from metadata, schematic analysis, spatial scans, furniture mining, and composition grammar.
- `tag_taxonomy.json` defines the normalized tag groups that automatic labeling must target.
- `template_reviews.jsonl` is append-only human review input and is currently the durable place for approval, limitation, or rejection.
- `ExplainableTemplateRetriever` returns 3-8 references with teaches, risk controls, integration targets, and explanations.
- `TemplateKnowledgeAgent` already reads v2 when present and falls back to v1 when needed.
- Stage 3 Concept Studio and Stage 4 Critic Council are already explainable layers around generation, so Stage 5 should preserve that style.

The important gap is that all v2 cases are still `pending`, many auto labels remain unknown taxonomy aliases, and retrieval is mostly lexical/rule-based. Stage 5 should help the human reviewer and improve ranking, not give a model authority to rewrite generation behavior.

## Goals

1. Add a Stage 5 neural artifact builder that writes deterministic neural-assist artifacts during template analysis.
2. Generate normalized tag suggestions with confidence, evidence, and review guidance.
3. Build an embedding index for case retrieval from case cards, knowledge units, tags, and composition evidence.
4. Provide a deterministic embedding fallback so tests and mock mode do not need Python, API keys, or model downloads.
5. Leave room for optional real embedding providers without making runtime generation call them online.
6. Add a neural fusion retriever that combines rule retrieval, embedding similarity, tag matches, review state, risk controls, and diversity.
7. Add a fixed retrieval evaluation set and report comparing rule-only retrieval with neural fusion retrieval.
8. Expose CLI switches for inspecting neural retrieval and disabling it.
9. Keep human review overlays as the only source of final approval, limitation, or rejection.
10. Preserve all current generation behavior when Stage 5 artifacts are absent or disabled.

## Non-Goals

- Do not train a large model in the MVP.
- Do not make Python required for normal generation, tests, or offline mock analysis.
- Do not replace `TemplateKnowledgeAgent` or `ExplainableTemplateRetriever`.
- Do not let model suggestions directly mark a case as `approved`, `limited`, or `rejected`.
- Do not call live embedding or LLM APIs from `npm start`.
- Do not generate voxel patches, room geometry, facade geometry, or Minecraft commands with a neural model in Stage 5.
- Do not add a browser review UI in the MVP.
- Do not expand the template corpus or scrape new templates in this stage.

## Architecture

Stage 5 sits above Template Knowledge Base v2 and below runtime template retrieval:

```text
mc_templates/analysis/case_library.v2.json
mc_templates/analysis/labels.generated.jsonl
mc_templates/curation/tag_taxonomy.json
        |
        v
Stage 5 neural artifact builder
        |
        +--> mc_templates/analysis/neural_labels.jsonl
        +--> mc_templates/analysis/embedding_index.json
        +--> mc_templates/analysis/retrieval_eval_set.json
        +--> mc_templates/analysis/retrieval_eval_report.md
        |
        v
NeuralTemplateRetriever
        |
        v
TemplateKnowledgeAgent fusion mode
        |
        v
blueprint.templateKnowledge.retrieval_explanation
run_report.md template reference section
```

The artifact builder should run from `npm run analyze:templates -- --offline`. It reads existing v2 artifacts and source labels, then writes Stage 5 artifacts. Runtime generation only reads `case_library.v2.json` and `embedding_index.json`; it does not produce embeddings on the fly.

## Files And Modules

New source modules:

- `src/construction/templates/templateNeuralLabels.js`
  - Builds label suggestions from v2 cases, unknown tags, labels.generated records, composition patterns, room evidence, and taxonomy aliases.
  - Does not mutate `case_library.v2.json`.

- `src/construction/templates/templateEmbeddingIndex.js`
  - Builds compact case documents.
  - Computes deterministic fallback vectors.
  - Loads optional provider-generated vectors from the same artifact contract.
  - Exposes cosine similarity query helpers.

- `src/construction/templates/templateNeuralRetriever.js`
  - Wraps `ExplainableTemplateRetriever`.
  - Computes fusion scores.
  - Preserves teaches, risks, integration targets, explanations, diversity, and warnings.

- `src/evaluateTemplateRetrieval.js`
  - Runs a fixed prompt set through rule-only retrieval and neural fusion retrieval.
  - Writes a Markdown comparison report and machine-readable summary.

Updated source modules:

- `src/construction/templates/schematicAnalyzer.js`
  - Calls Stage 5 artifact writers after v2 artifacts are available.

- `src/construction/agents/templateKnowledgeAgent.js`
  - Loads `embedding_index.json` when present.
  - Uses neural fusion only when enabled and valid.
  - Falls back to rule-only v2 retrieval otherwise.

- `src/queryTemplateKnowledge.js`
  - Adds `--neural`, `--no-neural`, and `--embedding-index` switches.
  - Prints whether results came from rule-only or fusion retrieval.

- `src/index.js`
  - Adds runtime flags for explicit neural retrieval control: `--neural-retrieval` and `--no-neural-retrieval`.

- `package.json`
  - Adds `evaluate:retrieval`.

New generated artifacts:

- `mc_templates/analysis/neural_labels.jsonl`
- `mc_templates/analysis/embedding_index.json`
- `mc_templates/analysis/retrieval_eval_set.json`
- `mc_templates/analysis/retrieval_eval_report.md`

New tests:

- `test/templateNeuralLabels.test.js`
- `test/templateEmbeddingIndex.test.js`
- `test/templateNeuralRetriever.test.js`
- `test/templateRetrievalEvaluation.test.js`

## Neural Label Artifact

`neural_labels.jsonl` is append-free generated output. Each line is one suggestion record:

```json
{
  "source": "stage5-neural-labels-v1",
  "schema_version": 1,
  "case_id": "house-a-small-modern-house",
  "file": "House/A Small Modern House - (mcbuild_org).schematic",
  "title": "A Small Modern House",
  "suggested_tags": [
    {
      "group": "facade",
      "id": "large-glass",
      "label": "large glass",
      "confidence": 0.86,
      "source": "deterministic-labeler",
      "evidence": [
        "labels.generated tag glass-emphasis",
        "composition facade pattern large_glass_bands"
      ]
    }
  ],
  "suggested_learning_areas": [
    {
      "area": "facade",
      "confidence": 0.82,
      "evidence": [
        "knowledge unit facade confidence 0.76",
        "large glass facade signal"
      ]
    }
  ],
  "review_guidance": {
    "suggested_status": "limited",
    "approved_learning_areas": ["facade", "massing", "site"],
    "blocked_learning_areas": [],
    "needs_human_review": true,
    "review_priority": "high",
    "reason": "high-value pending case with strong normalized tag suggestions"
  },
  "risk_notes": [
    "Model suggestions do not approve the case. Human review overlay is still required."
  ]
}
```

Rules:

- Suggestions must use taxonomy ids from `tag_taxonomy.json`.
- Unknown aliases can be mapped only when the evidence is explicit enough.
- Confidence is between `0` and `1`.
- Records may recommend review status, but must not edit `template_reviews.jsonl`.
- `review_guidance.suggested_status` can be `approved`, `limited`, `rejected`, `research-only`, or `pending`, but it is advisory only.
- Every suggested tag must include evidence.
- Every risk note must be preserved in reports and evaluation output.

The MVP labeler can be deterministic. Later provider-assisted labeling can write the same schema with `source: "provider-assisted-labeler"` and provider metadata.

## Embedding Index Artifact

`embedding_index.json` contains the retrieval vectors and metadata:

```json
{
  "source": "stage5-template-embedding-index-v1",
  "schema_version": 1,
  "generated_at": "2026-07-09T00:00:00.000Z",
  "embedding_model": {
    "provider": "deterministic-token-vector",
    "model": "token-hash-v1",
    "dimensions": 256,
    "normalized": true
  },
  "inputs": {
    "case_library_v2": "mc_templates/analysis/case_library.v2.json",
    "neural_labels": "mc_templates/analysis/neural_labels.jsonl",
    "tag_taxonomy": "mc_templates/curation/tag_taxonomy.json"
  },
  "case_count": 64,
  "cases": [
    {
      "case_id": "house-a-small-modern-house",
      "title": "A Small Modern House",
      "file": "House/A Small Modern House - (mcbuild_org).schematic",
      "review_status": "pending",
      "document": "modern house facade large-glass water-edge roof terrace interior ...",
      "tokens": ["modern", "house", "large-glass", "water-edge", "facade"],
      "vector": [0.0, 0.125],
      "norm": 1,
      "areas": ["facade", "site", "interior"],
      "risk_penalty": 8,
      "lineage": {
        "case_version": "sha256:...",
        "label_record_hash": "sha256:..."
      }
    }
  ],
  "warnings": []
}
```

Rules:

- Vectors must be normalized for cosine similarity.
- Deterministic fallback vectors must be stable across machines.
- Provider-generated embeddings must use the same case document text and write the same schema.
- Runtime treats vectors as read-only.
- If the index case version does not match the loaded v2 case, runtime ignores that case's vector and emits a warning.
- If too many vectors are stale or invalid, runtime disables fusion and falls back to rule-only retrieval.

## Case Documents

Embedding documents are compact text summaries built from:

- Case title and file stem.
- Identity: category, typology, style family, scale bucket.
- Normalized tags.
- Knowledge unit areas and claims.
- Retrieval search tokens and prompt affinities.
- Composition evidence from labels.generated where available.
- Room candidates and furniture pattern names.
- Risk controls and review flags.

Documents should not include raw schematic block arrays or large JSON payloads. The document is the shared input for deterministic token vectors and optional provider embeddings.

## Deterministic Embedding Fallback

The fallback embedding is a token-hash vector:

1. Normalize English, Chinese, and taxonomy tokens using the same token logic as retrieval where possible.
2. Expand known aliases, such as `waterfront -> water-edge` and `glass -> large-glass`.
3. Hash each token into a fixed 256-dimensional vector bucket.
4. Add weighted values by token source:
   - identity tokens: `1.4`
   - normalized tags: `1.2`
   - knowledge unit areas: `1.1`
   - knowledge unit claims: `0.8`
   - title/file tokens: `0.7`
   - risk tokens: `-0.2` or metadata-only depending on implementation simplicity
5. L2 normalize the vector.

This is not meant to outperform real embeddings. It creates a deterministic baseline, lets fusion and evaluation be built now, and keeps CI stable.

## Optional Provider Embeddings

The MVP should define the provider boundary but does not need to implement every provider.

Recommended contract:

- Offline only: provider calls happen during `npm run analyze:templates` or a dedicated future command.
- Runtime never calls providers.
- Provider output writes `embedding_index.json`.
- Missing credentials produce a clear warning and use deterministic fallback.
- The index records provider and model names.

Possible later providers:

- OpenAI embeddings.
- Zhipu embeddings.
- Local embedding model through an optional Python tool.

Provider support is useful only after deterministic Stage 5 evaluation works.

## Neural Fusion Retrieval

`NeuralTemplateRetriever` consumes:

- `case_library.v2.json`
- `embedding_index.json`
- `neural_labels.jsonl`
- The rule-only result from `ExplainableTemplateRetriever`

It returns the same shape as the current explainable retriever, with extra metadata:

```json
{
  "source": "stage5-neural-template-retriever-v1",
  "active": true,
  "mode": "fusion",
  "fallback_used": false,
  "prompt": "build a lakeside modern villa...",
  "references": [
    {
      "rank": 1,
      "case_id": "house-a-small-modern-house",
      "title": "A Small Modern House",
      "match_score": 91,
      "rule_score": 74,
      "embedding_score": 88,
      "tag_match_score": 82,
      "fusion_explanation": "Rule retrieval matched modern house and water edge; embedding similarity added large-glass facade and roof terrace proximity.",
      "matched_signals": ["token:modern", "tag:large-glass", "embedding:water-edge-site"],
      "teaches": [],
      "risk_controls": [],
      "integration_targets": []
    }
  ],
  "warnings": []
}
```

Initial scoring:

```text
final_score =
  rule_score * 0.45
  + embedding_score * 0.30
  + tag_match_score * 0.15
  + review_bonus
  + diversity_bonus
  - risk_penalty
```

Guidelines:

- Keep rule score as the largest early signal.
- Embedding can promote semantically close cases but should not rescue unsafe cases by itself.
- Tag matches are useful because taxonomy tags are inspectable and align with generator modules.
- Review bonus should prefer approved and limited cases when review overlays exist.
- Risk penalty must preserve v2 risk controls, especially non-residential interiors and monumental-scale warnings.
- Diversity should preserve at least one site/massing and one facade/interior reference when the prompt asks for both.
- Every returned reference must still include teaches and risk controls.

## Runtime Integration

`TemplateKnowledgeAgent` behavior:

1. Load v2 case library as it does today.
2. Try to load `embedding_index.json`.
3. In the Stage 5 MVP, use rule-only v2 retrieval by default for `npm start`.
4. If `--neural-retrieval` or an explicit runtime option enables fusion and the embedding index is valid, call `NeuralTemplateRetriever`.
5. If neural retrieval is disabled by CLI or environment, use rule-only v2 retrieval.
6. If fusion retrieval returns no valid references, use rule-only v2 retrieval.
7. Attach retrieval mode metadata to `templateKnowledge.retrieval_explanation`.
8. Preserve the existing `retrieved`, `recommendations`, design laws, material guidance, and generation hints unless a later verified task deliberately changes them.

No Stage 5 MVP change should let neural retrieval directly rewrite geometry, room layout, material palettes, or datapack commands. The first integration affects explainable references and later guidance only through the existing template knowledge surface.

## CLI

Template query:

```powershell
npm run query:templates -- --neural "build a lakeside modern villa with large glass and refined interior"
npm run query:templates -- --no-neural "build a medieval tavern with cozy interior"
```

Template analysis:

```powershell
npm run analyze:templates -- --offline
```

Retrieval evaluation:

```powershell
npm run evaluate:retrieval
npm run evaluate:retrieval -- --out mc_templates/analysis/retrieval_eval_report.md
```

Runtime generation:

```powershell
npm start -- --mode mock --neural-retrieval "build a lakeside modern villa with large glass and refined interior"
npm start -- --mode mock --no-neural-retrieval "build a lakeside modern villa with large glass and refined interior"
```

The default should be conservative:

- Analysis writes Stage 5 artifacts when inputs exist.
- Query can opt into `--neural` while the feature is being verified.
- Runtime remains rule-only by default in the MVP.
- Runtime uses fusion only when `--neural-retrieval` or an equivalent explicit option is set.
- A later stage can flip the default after retrieval evaluation and mock generation smoke tests show stable improvements.

## Retrieval Evaluation Set

`retrieval_eval_set.json` contains fixed prompts and expected retrieval traits:

```json
{
  "source": "stage5-retrieval-eval-set-v1",
  "schema_version": 1,
  "prompts": [
    {
      "id": "modern-lakeside-villa",
      "prompt": "build a lakeside modern two-floor villa with large glass, a water deck, roof terrace, and refined interior",
      "expected": {
        "typology": ["house"],
        "style": ["modern", "coastal"],
        "site": ["water-edge", "garden"],
        "facade": ["large-glass"],
        "interior": ["furnished", "room-layout-rich"]
      },
      "avoid": {
        "typology": ["arena"],
        "risk_flags": ["arena-not-for-room-mining"]
      }
    }
  ]
}
```

The first set should include 10-20 prompts:

- Modern lakeside villa.
- Japanese tea house with quiet garden.
- Medieval tavern with inhabited interior.
- Gothic castle with public approach and vertical landmark.
- Classical temple with formal axis.
- Compact rustic survival house.
- Public library with interior study spaces.
- Tower landmark with plaza.
- Waterfront hotel or apartment.
- Fantasy terrain-integrated retreat.

Evaluation metrics:

- Top-k expected tag hit rate.
- Unsafe interior reference count.
- Diversity coverage by requested areas.
- Average explanation completeness.
- Rule-only vs fusion rank movement.
- Warnings for missing or stale artifacts.

The goal is not to create a perfect benchmark. The goal is to make retrieval changes visible before they affect generation.

## Reports

`retrieval_eval_report.md` should include:

- Generated timestamp.
- Artifact sources and model names.
- Summary table with rule-only and fusion scores.
- Per-prompt top 5 references.
- Expected tag hits and misses.
- Unsafe or risky references.
- Rank movement notes.
- Recommendations for taxonomy aliases or review overlay candidates.

`run_report.md` should remain compact. If runtime uses fusion retrieval, the template reference section can add one line:

```text
Retrieval mode: neural fusion (deterministic-token-vector, 64 cases).
```

If fallback is used:

```text
Retrieval mode: rule-only fallback. Reason: embedding index missing.
```

## Error Handling

- Missing `case_library.v2.json`: use existing inactive template knowledge behavior.
- Missing `neural_labels.jsonl`: build an empty suggestion map and continue.
- Missing `embedding_index.json`: use rule-only retrieval.
- Invalid JSON artifact: warn and use rule-only retrieval.
- Stale case versions: ignore stale vectors for those cases.
- Too few valid vectors: disable fusion and use rule-only retrieval.
- Missing taxonomy entry: preserve the suggestion as unknown evidence and do not use it as a normalized tag match.
- Provider failure: write deterministic fallback embeddings and include provider failure warnings.
- Retrieval with no fusion candidates: return rule-only result with a warning.

## Testing Strategy

Unit tests:

- Neural label builder maps known aliases to taxonomy ids.
- Neural label builder preserves unknown aliases as review evidence.
- Neural label records include confidence, evidence, review guidance, and risk notes.
- Embedding document builder includes identity, tags, knowledge areas, and key claims.
- Deterministic embedding vectors are stable and normalized.
- Cosine similarity ranks an obviously matching case above an unrelated case.
- Stale vector lineage is detected.
- Neural retriever falls back when the index is missing or invalid.
- Neural retriever returns the same public reference shape as `ExplainableTemplateRetriever`.
- Neural retriever preserves teaches, risk controls, and integration targets.
- Fusion ranking penalizes arena interiors for residential interior prompts.

Integration tests:

- `npm run analyze:templates -- --offline` writes `neural_labels.jsonl` and `embedding_index.json`.
- `npm run query:templates -- --neural "..."` prints fusion mode when artifacts are valid.
- `npm run query:templates -- --no-neural "..."` prints rule-only mode.
- `npm run evaluate:retrieval` writes `retrieval_eval_report.md`.
- A mock pipeline run remains successful when neural artifacts are present.
- A mock pipeline run remains successful when neural artifacts are temporarily absent.

Manual smoke test:

```powershell
npm run analyze:templates -- --offline
npm run query:templates -- --neural "build a lakeside modern two-floor villa with large glass, a water deck, roof terrace, and refined interior"
npm run evaluate:retrieval
npm start -- --mode mock --seed 7101 "build a lakeside modern two-floor villa with large glass, a water deck, roof terrace, and refined interior"
```

Expected smoke result:

- `neural_labels.jsonl` exists.
- `embedding_index.json` exists.
- Query output states fusion mode or an explicit fallback reason.
- Evaluation report compares rule-only and fusion retrieval.
- Mock generation still writes blueprint, datapack, preview, scorecard, concept artifacts when enabled, and critic council artifacts when enabled.
- If fusion is used, `blueprint.templateKnowledge.retrieval_explanation.source` is `stage5-neural-template-retriever-v1`.

## Rollout Plan

1. Add neural label suggestion builder and tests.
2. Add deterministic embedding document and vector builder with tests.
3. Wire Stage 5 artifact writing into offline template analysis.
4. Add neural fusion retriever with fallback tests.
5. Add `query:templates --neural` inspection mode.
6. Add retrieval evaluation set and report command.
7. Wire conservative runtime loading into `TemplateKnowledgeAgent`.
8. Add CLI flag to disable neural retrieval.
9. Run focused tests.
10. Run full `npm test`.
11. Run offline analysis smoke.
12. Run retrieval evaluation smoke.
13. Run one mock generation smoke with neural artifacts present.
14. Run one mock generation smoke with neural retrieval disabled.

## Success Criteria

Stage 5 MVP is complete when:

- Offline analysis writes Stage 5 neural label and embedding artifacts.
- Label suggestions reduce review ambiguity by mapping common unknown aliases into normalized taxonomy suggestions with evidence.
- Retrieval evaluation can compare rule-only and fusion results for at least 10 fixed prompts.
- Fusion retrieval improves or clearly explains rank movement for prompt intent signals such as style, typology, site, facade, and interior.
- Fusion retrieval does not increase unsafe residential interior references from arena or exterior-only cases.
- Runtime generation works without API keys and without neural artifacts.
- Runtime generation can use valid neural artifacts when enabled.
- Existing Template KB v2, Concept Studio, Critic Council, and mock pipeline tests continue to pass.
- The user can inspect whether a result came from neural fusion or rule-only fallback.

## Deferred Work

- Real provider embeddings.
- Local Python embedding model support.
- Fine-tuned tag classifier.
- Human review browser UI.
- Screenshot or visual embedding retrieval.
- Active learning loops that choose the next cases to review from user feedback.
- Neural voxel patch completion, which belongs in Stage 6.
- Replacing deterministic template recommendations with neural recommendations.
