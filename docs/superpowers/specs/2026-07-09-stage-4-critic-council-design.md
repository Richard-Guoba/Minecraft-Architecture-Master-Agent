# Stage 4 Critic Council Design

Date: 2026-07-09

## Summary

Stage 4 adds a Critic Council after blueprint generation. The council reads the finished blueprint, validation, scorecard, template reviews, concept studio output, and agent plans, then emits one structured critique report with prioritized issues, satisfied checks, repair directives, and next-iteration guidance.

This first version is an evaluation-and-guidance MVP. It does not replace the existing geometry engine, QA validator, template repair agents, candidate pipeline, or scorecard. It organizes the existing evidence into separate critic voices and creates a clearer bridge from "what is weak" to "what should be repaired next."

## Current Context

The repository already has most of the raw signals Stage 4 needs:

- `BlueprintQAAgent` validates block legality, connectivity, bounds, entrances, stairs, and integrated agent contracts.
- `ConstructionEvaluationAgent` writes the 60 + 40 architecture scorecard and habitation/decoration metrics.
- `TemplateAestheticReviewAgent`, `TemplateLawCoverageAgent`, `TemplateLawAutoRepairAgent`, `TemplateAssimilationAuditAgent`, `TemplateInteriorDensityRepairAgent`, and `InteriorClearanceRepairAgent` already produce detailed template-quality signals.
- `ConceptStudioAgent`, `ConceptSelectionAgent`, and `ConceptFusionAgent` now generate, select, or fuse explainable design concepts before construction.
- `run_report.md`, `blueprint.json`, `architecture_scorecard.json`, preview HTML, and datapack artifacts already form the user-visible output surface.

Stage 4 should therefore consolidate and interpret existing signals instead of inventing a second validator.

## Goals

1. Add `CriticCouncilAgent` as a post-blueprint semantic review layer.
2. Provide at least six critic tracks: buildability, connectivity, habitation, style, composition, and site.
3. Produce deterministic JSON in mock mode with stable priorities and evidence.
4. Generate `critic_council.json` whenever critics are enabled.
5. Add a Stage 4 section to `run_report.md`.
6. Store compact critic metadata in `blueprint.json`.
7. Convert important findings into `repair_directives` and `next_iteration_directives`.
8. Add a CLI switch to disable critics when needed.
9. Update README and GitHub Pages roadmap so Stage 3 is complete and Stage 4 is current or complete after implementation.
10. Preserve current behavior and build geometry. Critic Council should not mutate the grid in the MVP.

## Non-Goals

- Do not add an infinite rebuild loop.
- Do not make the council call an LLM in the first version.
- Do not add browser UI or interactive critic review.
- Do not replace `BlueprintQAAgent` or `ConstructionEvaluationAgent`.
- Do not train neural networks in Stage 4.
- Do not make the generated Minecraft datapack depend on critic output.

## Architecture

Stage 4 adds one main agent:

```text
CriticCouncilAgent
  -> BuildabilityCritic
  -> ConnectivityCritic
  -> HabitationCritic
  -> StyleCritic
  -> CompositionCritic
  -> SiteCritic
  -> aggregate findings, satisfied checks, repair directives, next iteration directives
```

The first implementation can keep the critic classes or helper functions in one focused module, `src/construction/agents/criticCouncilAgent.js`, because the critics share the same compact blueprint context. If the module becomes too large in later stages, each critic can be split into its own file.

The workflow should run the council after final blueprint validation and after the existing scorecard/template reviews have been attached to the blueprint. That gives critics access to final geometry counts, room layout, template law coverage, aesthetic review, assimilation audit, concept studio summary, and validation results.

## Data Model

`CriticCouncilAgent.run(context)` returns:

```js
{
  source: 'stage4-critic-council-v1',
  version: 1,
  active: true,
  summary: '...',
  readiness: 'clear' | 'watch' | 'needs-repair' | 'blocked',
  overall_score: 0,
  critic_count: 6,
  critical_count: 0,
  warning_count: 0,
  satisfied_count: 0,
  critics: [
    {
      id: 'buildability',
      label: 'BuildabilityCritic',
      status: 'pass' | 'warn' | 'fail',
      score: 0,
      summary: '...',
      findings: [
        {
          id: 'command-volume-high',
          severity: 'info' | 'low' | 'medium' | 'high' | 'critical',
          message: '...',
          evidence: ['...'],
          repair_hint: '...',
          owner: 'BlueprintOptimizerAgent'
        }
      ],
      satisfied: [
        {
          id: 'valid-block-catalog',
          message: 'All operation blocks pass catalog validation.',
          evidence: ['validation ok']
        }
      ]
    }
  ],
  top_findings: [],
  repair_directives: [
    {
      id: 'repair-site-path-legibility',
      priority: 'low' | 'medium' | 'high' | 'critical',
      target_agent: 'SiteLandscapeAgent',
      instruction: '...',
      evidence: ['...']
    }
  ],
  next_iteration_directives: [
    {
      id: 'preserve-current-quality',
      priority: 'maintain',
      instruction: '...',
      target_agents: ['CreativeDesignAgent']
    }
  ],
  warnings: []
}
```

Severity ordering:

```text
critical > high > medium > low > info
```

Readiness rules:

- `blocked`: any critical finding.
- `needs-repair`: no critical findings, but at least one high finding.
- `watch`: no high or critical findings, but at least one medium finding.
- `clear`: only low/info findings or no findings.

Overall score starts at 100 and subtracts:

- critical: 35
- high: 20
- medium: 10
- low: 3
- info: 0

The score is clamped to 0-100.

## Critic Tracks

### BuildabilityCritic

Purpose: confirm the generated artifact remains buildable and export-friendly.

Inputs:

- `validation`
- `blueprint.operations`
- `blueprint.geometry.bounds`
- `blueprint.exporter`
- `architectureScorecard`

Primary checks:

- Blueprint validation passed.
- Operation count is present and nonzero.
- Optimizer compression evidence exists.
- Bounds are nonzero and within project constraints.
- No illegal block or oversized fill warning leaked into validation.

Example findings:

- `blueprint-validation-failed`
- `operation-count-missing`
- `command-volume-high`

### ConnectivityCritic

Purpose: review entrance, room reachability, stairs, door plans, and route evidence.

Inputs:

- `validation`
- `blueprint.opening`
- `blueprint.paths`
- `blueprint.layout`
- `blueprint.topology`

Primary checks:

- Exterior entry exists.
- Reachable rooms match generated rooms.
- Multi-floor buildings have stair evidence.
- Interior doors or soft boundaries connect topology edges.

Example findings:

- `missing-exterior-entry`
- `unreachable-rooms`
- `missing-stairs-for-multifloor`

### HabitationCritic

Purpose: review whether the building feels usable as a residence or requested program.

Inputs:

- `blueprint.layout`
- `blueprint.interior`
- `blueprint.decorator`
- `blueprint.interiorClearanceRepair`
- `architectureScorecard`

Primary checks:

- Required residential functions are present when typology is house/villa/manor/lodge/cabin.
- Important rooms have functional decoration.
- Interior clearance repair did not need excessive cleanup.
- Decoration density is not empty or overwhelming.

Example findings:

- `missing-sleeping-room`
- `thin-room-identity`
- `clearance-cleanup-high`

### StyleCritic

Purpose: review style coherence across materials, roof, facade, site, and interior.

Inputs:

- `blueprint.architecture`
- `blueprint.materialPalette`
- `blueprint.facade`
- `blueprint.roof`
- `blueprint.interior`
- `templateAestheticReview`

Primary checks:

- Requested style family is preserved.
- Roof profile does not contradict explicit prompt roof.
- Facade rhythm and material palette are consistent.
- Template aesthetic score is not below threshold when template guidance is active.

Example findings:

- `style-family-mismatch`
- `roof-profile-contradiction`
- `template-aesthetic-weak`

### CompositionCritic

Purpose: review massing hierarchy, concept execution, reference transfer, and visual design intent.

Inputs:

- `blueprint.creativeDesign`
- `blueprint.conceptStudio`
- `blueprint.architecture`
- `templateAssimilationAudit`
- `templateKnowledge`

Primary checks:

- Creative design authority remains at or above the project target.
- Concept Studio selection is reflected in creative design when active.
- Template assimilation audit is strong when template guidance is active.
- Massing variant and public-core placement are explainable.

Example findings:

- `concept-not-reflected`
- `low-design-authority`
- `template-assimilation-gap`

### SiteCritic

Purpose: review landscape, approach sequence, water/garden/deck requirements, and terrain integration.

Inputs:

- `blueprint.site`
- `blueprint.paths`
- `blueprint.buildSpec`
- `blueprint.prompt`
- `templateLawCoverage`

Primary checks:

- Prompted water/garden/patio/site features have corresponding site modules.
- Entry path and foreground sequence exist.
- Template site laws are covered when active.
- Site zones are not empty for prompts that request exterior experience.

Example findings:

- `missing-water-edge`
- `missing-entry-approach`
- `site-law-gap`

## Workflow Integration

`runConstructionWorkflow` should add:

1. A new option `critics = true`.
2. A council run after:
   - final `blueprint.templateLawCoverage`
   - `blueprint.templateAestheticReview`
   - `blueprint.templateAssimilationAudit`
   - `validation`
   - `architectureScorecard`
3. `blueprint.criticCouncil = compactCriticCouncil(criticCouncil)` when active.
4. `result.criticCouncil` when active.
5. `exportArtifacts` writes `critic_council.json`.
6. `renderReport` includes `## Stage 4 Critic Council`.

The council should not run before final validation, because it needs the final blueprint state. It should not mutate the blueprint grid in the MVP.

## CLI and Pipeline

Default:

- Critics are enabled by default.
- `--no-critics` disables Stage 4 output.

Reasoning:

- Critic Council is an evaluation/report layer and should not change geometry.
- Default-on makes reports more useful without surprising users with different builds.
- A disable flag helps benchmark comparisons and debugging.

Pipeline options:

```js
runPipeline({
  critics: true
})
```

Candidate pipeline:

- Pass `critics` into every candidate run.
- Candidate selection can ignore council scores in the MVP to avoid changing candidate behavior unexpectedly.
- A later Stage 4.5 can add critic-aware candidate selection once the council report is stable.

## Artifacts

When active, export:

```text
critic_council.json
```

Add to `artifacts`:

```js
{
  criticCouncil: '<outputDir>/critic_council.json'
}
```

Add to `run_report.md`:

```markdown
## Stage 4 Critic Council

- Readiness: clear
- Overall score: 100/100
- Critics: 6
- Critical findings: 0
- Warnings: 0
- Top findings: none
- Repair directives: preserve-current-quality
```

Compact `blueprint.criticCouncil` should include:

- `source`
- `version`
- `active`
- `readiness`
- `overall_score`
- `critical_count`
- `warning_count`
- top critic statuses
- top findings
- repair directives

## GitHub Pages and README Updates

After implementation and verification:

- README current status should say Stage 3 Concept Studio is implemented and Stage 4 Critic Council is the current or newly completed stage.
- README quick start should mention `--concepts` and `--no-critics`.
- `docs/index.html` roadmap should mark Stage 1, Stage 2, and Stage 3 as completed.
- `docs/index.html` should show Stage 4 as active during implementation or completed after verification.
- `docs/roadmap.md` can keep the long-term stage descriptions, but should include a short status note near the Stage 4 section when the MVP is done.

## Testing Strategy

Use TDD for every behavior change.

Focused tests:

- `test/criticCouncilAgent.test.js`
  - council returns six critics with deterministic structure
  - readiness and overall score follow severity rules
  - council converts high/medium findings into repair directives
  - clean baseline blueprint produces mostly pass statuses and preserve directives

- `test/criticPipeline.test.js`
  - default pipeline writes `critic_council.json`
  - `run_report.md` contains `## Stage 4 Critic Council`
  - `blueprint.criticCouncil` exists when active
  - `--no-critics` or `critics: false` suppresses council artifacts

- CLI smoke:
  - `npm start -- --mode mock --seed 7101 --concepts 3 "<prompt>"`
  - `npm start -- --mode mock --seed 7101 --no-critics "<prompt>"`

Full verification:

- `npm test`
- Stage 3 select/fuse smoke still works
- Stage 4 default smoke writes critic artifacts
- GitHub Pages/README text updated

## Completion Criteria

Stage 4 MVP is complete when:

- `CriticCouncilAgent` exists and emits deterministic structured JSON.
- At least six critic tracks run in mock mode.
- Council output is attached to workflow result and compact blueprint metadata.
- `critic_council.json` is exported.
- `run_report.md` includes Stage 4 summary.
- CLI supports `--no-critics`.
- README and GitHub Pages roadmap are updated.
- Default Stage 3 behavior remains valid with critics enabled.
- `npm test` passes.
- Smoke tests prove both enabled and disabled critic modes.

## Deferred Work

- Multi-pass automatic rebuild loop.
- Critic-aware candidate selection.
- LLM-written natural-language critique.
- Browser critic dashboard.
- Persisted issue history across runs.
- Learning from repeated critic findings.
- Neural critic models or learned repair prediction.
