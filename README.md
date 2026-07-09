# Minecraft Architecture Master Agent

Minecraft Architecture Master Agent is a Node.js research and engineering project for turning natural-language building requests into Minecraft Java datapacks. The system keeps language-model output at the semantic planning layer, then uses deterministic local geometry, routing, decoration, validation, scoring, and export code to produce runnable builds.

The long-term goal is not a one-shot prompt-to-block toy. The project is being shaped into a hybrid architecture agent that can retrieve references, propose concepts, build, critique, repair, benchmark, and learn from its own runs.

[Project Site](https://cityc196.github.io/Minecraft-Constructing-Agents/) | [Homepage Source](docs/index.html) | [Architecture](docs/architecture.md) | [Roadmap](docs/roadmap.md) | [Stage 1 Baseline](docs/benchmarks/stage1-readiness-baseline.md)

## Current Status

- Main pipeline: `construction_method_v1`
- Target: Minecraft Java 1.21 / 1.21.1 datapacks
- Runtime: Node.js ESM, no Python required for normal generation
- Knowledge layer: Template Knowledge Base v2 with reviewed case cards and explainable retrieval
- Benchmark readiness: 10/10 baseline prompts generated, average scorecard 100/100, red flags 0, repair priority queue empty
- Next major stage: Stage 3 Concept Studio, where one prompt produces multiple explainable design concepts before construction

## Quick Start

```powershell
npm install
npm test
npm start -- --mode mock "建一个湖边现代两层别墅，带大玻璃、水边平台和前景花园"
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
-> CreativeDesignAgent: design variation and template-guided composition
-> Structure/Facade/Roof/Site agents: specialist semantic plans
-> CSGBuilder: shell, volumes, roofs, facade, site, structure modules
-> BSPPartitioner: room rectangles and floor organization
-> AStarPathfinder: doors, entry path, stairs, room connectivity
-> InteriorDetailAgent + DecoratorAgent: room-fit furnishings and style layers
-> QA/Repair/Optimizer/Evaluation: validation, repair hints, command compression, scorecard
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
npm start -- --help
npm start -- --list-prompts
```

## Boundaries

- This repository produces Minecraft datapacks; it is not a Mineflayer real-time player bot.
- It does not download Minecraft or simulate survival-mode resource gathering.
- Generated `out/` artifacts, local credentials, and temporary files are intentionally not committed.
- Python is reserved for optional future learning/training workflows, not for normal generation.

## Development Direction

The project has moved past early showcase packaging. Current work should optimize for long-term capability:

1. Keep the benchmark and scorecard stable.
2. Make reference retrieval and template memory more useful.
3. Add Stage 3 Concept Studio for multi-concept design selection.
4. Add richer critic/repair loops.
5. Use neural models later for retrieval, tagging, parameter prediction, and local semantic-voxel patch completion.
