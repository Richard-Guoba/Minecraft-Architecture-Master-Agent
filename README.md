# Minecraft Architecture Master Agent

Minecraft Architecture Master Agent is a Node.js research and engineering project for turning natural-language building requests into Minecraft Java datapacks. The system keeps language-model output at the semantic planning layer, then uses deterministic local geometry, routing, decoration, validation, scoring, and export code to produce runnable builds.

The long-term goal is not a one-shot prompt-to-block toy. The project is being shaped into a hybrid architecture agent that can retrieve references, propose concepts, build, critique, repair, benchmark, and learn from its own runs.

[Static Homepage Source](docs/index.html) | [Architecture](docs/architecture.md) | [Roadmap](docs/roadmap.md) | [Stage 1 Baseline](docs/benchmarks/stage1-readiness-baseline.md)

The static homepage lives in `docs/index.html`, so GitHub Pages can be enabled from the `docs/` folder without adding a frontend build step.

## Current Status

- Main pipeline: `construction_method_v1`
- Target: Minecraft Java 1.21 / 1.21.1 datapacks
- Runtime: Node.js ESM, no Python required for normal generation
- Knowledge layer: Template Knowledge Base v2 with reviewed case cards, explainable retrieval, and design laws
- Neural assist layer: Stage 5 artifacts can suggest labels, build deterministic embedding indexes, evaluate retrieval, and opt into fusion retrieval without changing default mock behavior
- Semantic patch layer: Stage 6 builds deterministic semantic voxel patch datasets, inspection reports, ranked training candidates, and a read-only `query:patches` review CLI
- Concept layer: Stage 3 Concept Studio can generate, select, or fuse multiple explainable design concepts before construction
- Critique layer: Stage 4 Critic Council summarizes buildability, connectivity, habitation, style, composition, and site findings
- Benchmark readiness: 10/10 baseline prompts generated, average scorecard 100/100, red flags 0, repair priority queue empty
- Coarse semantic voxel layer: Stage 7 Milestone 1 defines a provider-neutral `64^3` contract, deterministic baseline, bounded repair, procedural candidate converter, and artifact provider
- Active stage: Stage 7 Milestone 1 is shadow-only; it exports review artifacts and failure records but does not change primary geometry

## Quick Start

```powershell
npm install
npm test
npm run analyze:templates -- --offline
npm run evaluate:retrieval
npm run query:templates -- --neural "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
npm run query:patches -- --dataset mc_templates/analysis/semantic_patch_dataset.json --category facade --band high
npm start -- --mode mock --seed 7101 --concepts 3 --coarse-voxel-mode shadow --coarse-voxel-provider baseline "建一个湖边带庭院的两层日式住宅"
npm start -- --mode mock --concepts 3 "建一个湖边现代两层别墅，带大玻璃、水边平台和前景花园"
npm start -- --mode mock --neural-retrieval "建一个湖边现代两层别墅，带大玻璃和精致内饰"
```

Mock mode is deterministic and does not need an API key. It is the safest way to check the full local pipeline.

To use an LLM provider, copy `.env.example` to `.env`, fill in the provider settings, then run:

```powershell
npm start -- --mode llm "建一个日式茶屋住宅，深檐木格栅，水景庭院，动线安静"
```

The output is written under `out/<timestamp>/`:

```text
blueprint.json
architect_datapack/
raw_build.mcfunction
preview.html
run_report.md
architecture_scorecard.json
concept_studio.json
concept_studio_report.md
critic_council.json
stage7_condition.json
stage7_coarse_semantic_plan.raw.json
stage7_coarse_semantic_plan.repaired.json
stage7_coarse_semantic_report.md
stage7_procedural_candidate.json
stage7_failure_case.json          only when shadow rejects a candidate
```

To build in Minecraft, copy `architect_datapack/` into a world's `datapacks` folder, then run:

```text
/reload
/function architect:run
```

## What The System Does

The pipeline separates design intent from block placement:

```text
Prompt
-> ArchitectAgent: style, massing, materials, facade, roof, site semantics
-> PlannerAgent: room graph, circulation, privacy, functional topology
-> ConceptStudioAgent: multi-concept design options, selection, or conservative fusion
-> CreativeDesignAgent: design variation and template-guided composition
-> Stage 7 M1 Shadow: condition -> untrusted coarse voxels -> validation/repair -> procedural candidate; primary geometry unchanged
-> Structure/Facade/Roof/Site agents: specialist semantic plans
-> CSGBuilder: shell, volumes, roofs, facade, site, structure modules
-> BSPPartitioner: room rectangles and floor organization
-> AStarPathfinder: doors, entry path, stairs, room connectivity
-> InteriorDetailAgent + DecoratorAgent: room-fit furnishings and style layers
-> QA/Repair/Optimizer/Evaluation/Critic Council: validation, repair hints, command compression, scorecard, multi-critic review
-> Datapack, preview, report, benchmark artifacts
```

The LLM never has to output exact XYZ block coordinates. It produces semantic JSON; local JavaScript turns that into legal Minecraft geometry.

## Repository Map

```text
src/
  construction/              Active generation, evaluation, template, and export pipeline
  llm/                       Provider adapters and JSON parsing helpers
  lib/                       Shared filesystem and Minecraft-world helpers
test/                        Node test suite for agents, geometry, templates, reports, and benchmarks
mc_templates/
  analysis/                  Generated template analysis, design laws, KB v2 artifacts
  curation/                  Human review overlay and tag taxonomy
docs/
  index.html                 GitHub Pages project homepage
  architecture.md            System architecture overview
  roadmap.md                 Long-term Architecture Master roadmap
  benchmarks/                Versioned benchmark summaries
  parameter-tree/            Parameter tree viewer and example
```

See [docs/project-map.md](docs/project-map.md) for a more detailed guide.

## Main Commands

```powershell
npm test
npm run benchmark:baseline -- --out out/stage1-readiness-baseline
npm run query:templates -- "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
npm run analyze:templates -- --offline
npm run query:patches -- --dataset mc_templates/analysis/semantic_patch_dataset.json --limit 5
npm start -- --mode mock --seed 7101 --concepts 3 --concept-strategy fuse "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
npm start -- --mode mock --no-critics "建一个欧式大房子"
npm start -- --help
npm start -- --list-prompts
```

## Boundaries

- This repository produces Minecraft datapacks; it is not a Mineflayer real-time player bot.
- It does not download Minecraft or simulate survival-mode resource gathering.
- Generated `out/` artifacts, local credentials, and temporary files are intentionally not committed.
- Python is reserved for optional future learning/training workflows, not for normal generation.
- Stage 7 Milestone 1 does not train a model, invoke Python, or apply candidate geometry.
- Legacy `stage7-template-*` source identifiers refer to the older template-assimilation sequence, not Architecture Master Roadmap Stage 7.

## Development Direction

The project has moved past early showcase packaging. Current work should optimize for long-term capability:

1. Keep the benchmark and scorecard stable.
2. Make reference retrieval and template memory more useful.
3. Preserve Stage 3 Concept Studio as the concept-first planning layer.
4. Use Stage 4 Critic Council findings to guide repair priorities.
5. Keep Stage 5 neural retrieval optional and artifact-gated so rule-only generation remains reliable.
6. Use Stage 6 semantic patch artifacts as the reviewable bridge toward future learned roof, facade, interior, and courtyard detail completion.
7. Use Stage 7 M1 shadow artifacts to validate the whole-building semantic contract before raw dataset extraction or model training.
