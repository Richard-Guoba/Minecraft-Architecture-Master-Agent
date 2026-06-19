# Template Assimilation Plan

Generated for the 64 local Minecraft reference templates under `mc_templates/`.

## Goal

Use the template corpus as a design grammar library, not as a block-for-block memory store. The generator should be able to recreate the recognizable strengths of the references through curated prompts while still producing new residential-scale designs.

## Current Corpus

- Templates: 64
- Import errors: 0
- Categories: Arenas, Buildings, Castles, House, Temples, Tower
- House templates: 30
- Terrain-integrated references: 58
- Garden or scene references: 47
- Water-edge references: 32
- Case library cards: 64
- Semantic clauses: 1539
- Design laws: 91
- Interior laws: 76

## Template Capability Map

### Site And Arrival

The strongest references do not place a house on an empty rectangle. They compose the first view with terrain, path, garden, water, stairs, retaining edges, trees, and threshold frames.

Reusable grammar:

- Foreground garden as an approach room
- Rock or earth plinth under the building
- Water edge aligned to public rooms
- Path compression before entry reveal
- Planting pockets around retaining walls
- Courtyard or patio used as spatial focus

Primary references:

- Japanese temple - (mcbuild_org)
- Tavern
- Beach Hotel
- Wood Modern House
- A Small Modern House
- Watermill
- Gotic castle

### Massing And Silhouette

Top references have a memorable profile: towers, offset wings, layered pavilions, terraces, long bars, vertical accents, or compact lodge forms.

Reusable grammar:

- Modern offset glass wing
- Formal axis manor with paired wings
- Low courtyard pavilion
- Corner tower or lookout accent
- Compact timber house with deep roof
- Hillside or cave house embedded in terrain
- Monumental references normalized into residential scale

### Roof Language

Roof form carries style. The project should avoid treating roof as a generic cap.

Reusable grammar:

- Thin parapet terrace for modern waterfront builds
- Low layered eaves for Japanese or Chinese courtyard builds
- Steep gables for medieval, alpine, gothic, and rustic builds
- Tower cap or vertical roof accent for gothic/fantasy references
- Green or bermed roof for cave and hillside homes

### Facade Depth

The corpus uses small blocks to create readable depth: stairs, slabs, fences, panes, lights, vines, plants, walls, and rails.

Reusable grammar:

- Large glass frame with deep surround
- Quiet punched window grid for classical forms
- Vertical slot rhythm for gothic/tower forms
- Wood beam and stone plinth for medieval houses
- Screen-grid openings for Japanese courtyard houses
- Window boxes, rails, awnings, and entry threshold details

### Interior Scenes

The best templates are useful because they show room-scale patterns, not just furniture lists.

Reusable grammar:

- Living room social cluster facing a view or focal wall
- Entry reveals stair, landmark, main room, or view
- Kitchen work wall plus table or island
- Bedroom sleep niche with side lighting
- Study reading wall or library focus
- Storage/display layer, textiles/plants, and layered lighting in every important room
- Clear circulation spine through long rooms

## Stage Roadmap

### Stage 1: Baseline

Status: complete.

Commands:

```powershell
npm run analyze:templates -- --offline
npm run evaluate:template-assimilation -- --limit 3 --out .tmp\template-baseline --strict --min-audit 80
```

Result:

- 64 templates analyzed
- Import errors: 0
- Baseline limit-3 audit: 100%
- Law coverage: 100%
- Aesthetic score: 98.2

Interpretation: the current automatic loop is already strong, so new work should focus on prompt controllability, retrieval transparency, non-copying controls, and curated usage.

### Stage 2: Template Understanding Map

Status: complete in this document.

The corpus is organized into site, massing, roof, facade, and interior grammar. This is the layer humans should read when deciding what a prompt is trying to borrow.

### Stage 3: Curated Prompt Library

Status: implemented.

File:

- `src/construction/curatedTemplatePromptLibrary.js`

Each curated prompt profile contains:

- `id`
- `seed`
- `style`
- `typology`
- `focus`
- `inspiration_cases`
- `retrieval_tokens`
- `user_prompt`
- `grammar.site_composition`
- `grammar.massing_grammar`
- `grammar.roof_grammar`
- `grammar.facade_grammar`
- `grammar.interior_grammar`
- `negative_controls`
- `expected_audit_signals`

The first curated set contains 12 synthesis prompts:

- `modern-waterfront-villa-reference`
- `classical-axis-manor-reference`
- `japanese-courtyard-retreat-reference`
- `medieval-spruce-home-reference`
- `gothic-hill-manor-reference`
- `sandstone-oasis-mansion-reference`
- `cave-hillside-luxury-reference`
- `glass-estate-slope-reference`
- `watermill-riverside-home-reference`
- `urban-loft-apartment-reference`
- `fantasy-sky-retreat-reference`
- `compact-small-modern-reference`

### Stage 4: Retrieval Binding

Status: implemented.

Changes:

- Curated prompts include explicit inspiration case names and retrieval tokens.
- `TemplateKnowledgeAgent` now gives an exact-title score bonus when prompt text names a template.
- `TemplateKnowledgeAgent` now records `source_fusion_policy`.

Expected effect:

- A curated prompt can steer retrieval toward the intended references.
- The generated `blueprint.json` and `run_report.md` expose which sources were blended.

### Stage 5: Runtime Generation Strengthening

Status: existing pipeline retained, with prompt-level guidance added.

Current active agents already consume template guidance:

- `CreativeDesignAgent` uses template composition for massing, facade, roof, and site.
- `TemplateSpacePlanningStrategy` places view, service, quiet, entry, and site connections.
- `SiteLandscapeAgent` turns terrain, garden, water, grove, and approach grammar into site scenes.
- `RoofAgent` respects template roof profiles.
- `FacadeAgent` respects large glass, facade depth, and rhythm directives.
- `InteriorDetailAgent` and `DecoratorAgent` place room experiences, template patterns, and design-law objects.
- `TemplateLawAutoRepairAgent` and `TemplateInteriorDensityRepairAgent` close missing coverage before export.

### Stage 6: Non-Copying Control

Status: implemented as prompt obligations and source-fusion metadata.

Default curated prompt controls:

- Do not copy any single template plan, dimensions, or silhouette one-to-one.
- Blend at least three reference cases.
- Normalize monumental references to residential scale.
- Do not produce an empty shell.
- Do not treat site as a flat plate.

Runtime metadata:

- `source_fusion_policy.min_source_cases`
- `source_fusion_policy.top_source_share`
- `source_fusion_policy.copy_risk`
- `source_fusion_policy.expected_variation_axes`

### Stage 7: Regression Suite

Status: expanded.

The Stage 7H prompt suite now includes:

- 12 curated synthesis prompts
- 24 existing generalization prompts
- 36 total prompts

Command:

```powershell
npm run evaluate:template-assimilation -- --limit 6 --out out/template-assimilation-smoke --strict --min-audit 88
```

Full regression command:

```powershell
npm run evaluate:template-assimilation -- --limit 36 --out .tmp\template-full-regression --strict --min-audit 88
```

Final checked run:

```powershell
npm run evaluate:template-assimilation -- --limit 36 --out .tmp\template-full-regression-final --strict --min-audit 88
```

Result:

- 36/36 generated successfully
- Average audit: 100%
- Average law coverage: 100%
- Top-tier ready: 36/36
- Aesthetic range: 94.2 to 99.2

### Stage 8: Structural Review

Status: implemented.

The first representative review found roof-language cross-contamination: broad corpus laws were allowing flat roofs or East-Asian layered eaves to leak into classical, medieval, and gothic prompts. The runtime now treats roof templates as style-compatible grammar:

- Explicit roof terrace prompts can lock `thin-parapet-terrace`.
- Japanese or East-Asian layered-eave prompts can lock `low-layered-eaves`.
- Gothic tower caps drive vertical massing, not flat-roof replacement.
- Rustic, medieval, gothic, classical, alpine, Nordic, Victorian, and farmhouse families keep pitched roof variants unless the user explicitly asks for a flat roof.
- Bare `villa` no longer forces classical style; explicit modern waterfront villa prompts remain modern.

Representative review output:

```powershell
npm run evaluate:template-assimilation -- --limit 6 --out .tmp\template-curated-regression-visual-fixes-v3 --strict --min-audit 88
```

Result:

- 6/6 generated successfully
- Average audit: 100%
- Average law coverage: 100%
- Top-tier ready: 6/6

Latest full mock regression:

- Total prompts: 36
- Successful generations: 36
- Average assimilation audit: 100%
- Average template law coverage: 100%
- Top-tier ready: 36/36

### Stage 8: Human Aesthetic Review

Status: process defined in `docs/template-review-notes.md`.

Use human review to check what automatic scoring cannot fully judge:

- First-view composition
- Site integration
- Silhouette specificity
- Facade depth
- Interior believability
- Minecraft block readability
- Non-copying behavior

### Stage 9: Usage Surface

Status: implemented.

List curated prompts:

```powershell
npm start -- --list-prompts
```

Run a curated prompt:

```powershell
npm start -- --prompt-id modern-waterfront-villa-reference
```

Run a curated prompt with extra user additions:

```powershell
npm start -- --prompt-id japanese-courtyard-retreat-reference "加一个面向水景的小茶亭，整体控制在两层以内"
```

The curated prompt seed is used by default for reproducibility. Pass `--seed` to intentionally vary it.

## Acceptance Targets

- Average template assimilation audit: at least 90%
- Template law coverage: at least 90%
- Template aesthetic score: at least 85
- Top-tier-ready share: at least 60%
- No import errors
- No severe validation errors
- Curated prompts retrieve their intended reference families
- Reports expose source fusion and copy risk

## Next Improvement Backlog

- Add a visual similarity guard that compares generated massing proportions against top retrieved templates.
- Add prompt-specific expected case assertions for the 12 curated profiles.
- Add screenshot-based or preview-based human review sampling.
- Expand curated prompts from 12 to 24 once the first set has been visually inspected in Minecraft.
