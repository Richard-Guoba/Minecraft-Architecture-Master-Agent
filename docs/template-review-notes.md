# Template Review Notes

## Baseline Run

Command:

```powershell
npm run evaluate:template-assimilation -- --limit 3 --out .tmp\template-baseline --strict --min-audit 80
```

Result:

| Prompt | Audit | Law | Aesthetic | Notes |
|---|---:|---:|---:|---|
| modern-lake-villa | 100% | 100% | 98.2 | Template chain is fully connected in mock mode. |
| classical-manor-garden | 100% | 100% | 98.2 | Formal garden and interior laws are satisfied. |
| japanese-courtyard-house | 100% | 100% | 98.2 | Courtyard, threshold, and interior scene checks pass. |

Interpretation:

The automatic audit is already optimistic. Treat these scores as evidence that the template runtime is wired up, not as proof that every build looks beautiful from the player camera.

## Full Regression After Curated Prompt Integration

Command:

```powershell
npm run evaluate:template-assimilation -- --limit 36 --out .tmp\template-full-regression --strict --min-audit 88
```

Result:

- Total prompts: 36
- Successful generations: 36
- Average audit: 100%
- Average law coverage: 100%
- Top-tier ready: 36/36
- Aesthetic range observed: 94.2 to 99.2

Notes:

- The curated prompt library is wired into the same closed-loop audit as the original generalization prompts.
- `modern-waterfront-villa-reference` now resolves to modern style throughout architecture, buildSpec, template recommendation, and report output.
- Automatic scores are excellent; the next quality frontier is visual inspection and scale/readability review in Minecraft.

## Human Review Rubric

Score each generated build from 1 to 5.

### First View

Questions:

- Does the building have an immediate identity?
- Is there a foreground composition before the wall starts?
- Does the path, garden, water, or terrain guide the eye?

Target:

- 4 or higher for curated prompts.

### Site Integration

Questions:

- Is the lot more than a flat plate?
- Are terrain, rocks, water, planting, and entry sequence connected?
- Does the site support the building's style?

Target:

- 4 or higher when the prompt mentions terrain, garden, water, cliff, hill, courtyard, or forecourt.

### Silhouette

Questions:

- Can the style be recognized from the outline?
- Is there a tower, wing, roof, terrace, courtyard void, or glass volume that gives the build memory?
- Does the roof match the style?

Target:

- 4 or higher for classical, gothic, Japanese, medieval, fantasy, and modern estate prompts.

### Facade Depth

Questions:

- Are windows framed rather than simply punched?
- Are there useful layers such as columns, trims, sills, rails, awnings, screens, or flower boxes?
- Are large glass areas connected to interior and site logic?

Target:

- 3 or higher for every prompt.
- 4 or higher for curated prompts.

### Interior Believability

Questions:

- Does each important room have an identity stack?
- Are furniture groups arranged around a view, focal wall, or function?
- Is there a clear circulation spine?

Target:

- 4 or higher for any prompt that asks for rich interior scenes.

### Minecraft Readability

Questions:

- Do block choices read well at Minecraft scale?
- Are micro-details visible without becoming noisy?
- Does the build still feel constructible and navigable?

Target:

- 3 or higher for every prompt.

### Non-Copying Behavior

Questions:

- Does the result borrow grammar rather than copy a reference?
- Are at least three sources visible in the idea mix?
- Has any monumental reference been normalized to the requested scale?

Target:

- 4 or higher for curated prompts.

## Review Sampling Plan

For each major change:

1. Run a 3-prompt smoke test.
2. Generate one curated prompt from each bucket: modern, classical, Japanese, medieval/gothic, terrain-integrated, compact.
3. Open `preview.html` for a quick layout check.
4. Inspect the datapack in Minecraft for at least two representative builds.
5. Record visible failures here before changing code.

## First Curated Prompt Set

Use these as the first human review batch:

| ID | What To Look For |
|---|---|
| modern-waterfront-villa-reference | Water-facing public core, glass wing, roof terrace, non-flat site. |
| classical-axis-manor-reference | Formal axis, paired wings, foreground garden rooms, rich public interiors. |
| japanese-courtyard-retreat-reference | Low layered eaves, entry threshold, dry garden, courtyard-facing rooms. |
| medieval-spruce-home-reference | Timber and stone depth, warm interiors, compact silhouette. |
| gothic-hill-manor-reference | Vertical accent, stone plinth, pointed facade rhythm, ceremonial hall. |
| cave-hillside-luxury-reference | Real terrain embed, lightwell, sunken court, interior clarity. |

## Known Risk

- Automatic audit can hit 100% before visual quality is perfect.
- Title-based retrieval is helpful for curated prompts, but overuse can increase single-source dominance.
- Monumental templates can overwhelm residential scale unless the prompt explicitly says to normalize them.
- Interior density can pass by count while still needing better room composition.

## Next Manual Notes

## Structural Review After Curated Prompt Integration

Reviewed representative generated blueprints from:

```powershell
npm run evaluate:template-assimilation -- --limit 6 --out .tmp\template-curated-regression-visual-fixes-v3 --strict --min-audit 88
```

Result:

- 6/6 generated successfully.
- Average audit: 100%.
- Average law coverage: 100%.
- Top-tier ready: 6/6.
- Aesthetic range: 94.5 to 99.0.

Findings and fixes:

- `medieval-spruce-home-reference` was initially classified too modern because "villa" and broad timber signals were leaking into the wrong style path. Added rustic/medieval/spruce recognition while preserving explicit Nordic priority.
- Classical, medieval, and gothic prompts were inheriting flat or east-Asian roof profiles from broad corpus laws. Roof profile adoption is now gated by style family, explicit prompt signals, and compatible roof grammar.
- Gothic tower caps now drive vertical massing rather than automatically forcing flat roofs or Japanese-like layered eaves.
- Japanese layered-eave prompts now lock the low layered eave profile when the prompt explicitly asks for layered/deep eaves.
- Creative roof variation now respects strong pitched-roof families when no flat roof is requested.

Representative field check after fixes:

| ID | Style | Roof | Template Profile | Fusion |
|---|---|---|---|---|
| modern-waterfront-villa-reference | modern villa | flat | thin-parapet-terrace | 6 sources, low copy risk |
| classical-axis-manor-reference | classical villa | hipped | style default | 6 sources, low copy risk |
| japanese-courtyard-retreat-reference | Japanese courtyard-house | hipped | low-layered-eaves | 6 sources, low copy risk |
| medieval-spruce-home-reference | rustic house | gabled | style default | 6 sources, low copy risk |
| gothic-hill-manor-reference | gothic castle/manor | gabled | style default | 6 sources, low copy risk |
| sandstone-oasis-mansion-reference | desert courtyard-house | flat | thin-parapet-terrace | 6 sources, low copy risk |

## Final Regression Snapshot

Command:

```powershell
npm run evaluate:template-assimilation -- --limit 36 --out .tmp\template-full-regression-final --strict --min-audit 88
```

Result:

- Total prompts: 36.
- Successful generations: 36.
- Average audit: 100%.
- Average law coverage: 100%.
- Top-tier ready: 36/36.
- Aesthetic range: 94.2 to 99.2.

Remaining manual next step: inspect at least two generated datapacks inside Minecraft for player-camera scale, block readability, and path feel.
