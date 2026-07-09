# Project Map

This repository is organized around one active construction pipeline and a small set of long-lived support assets.

## Active Runtime

- `src/index.js` is the CLI entry point.
- `src/construction/workflow.js` orchestrates generation, validation, export, reports, and scorecards.
- `src/construction/agents/` contains semantic agents for architecture, planning, materials, structure, facade, roof, site, interiors, templates, QA, repair, and evaluation.
- `src/construction/engine/` contains deterministic geometry and routing code: CSG, BSP, pathfinding, and GDMC client support.
- `src/construction/templates/` contains template analysis, review overlays, knowledge base v2, and explainable retrieval.
- `src/llm/` contains provider selection, environment loading, and JSON repair helpers.
- `src/lib/` contains shared filesystem and Minecraft-world utilities.

## Tests And Benchmarks

- `test/` is the full Node test suite.
- `src/construction/baselineBenchmarkSuite.js` freezes the 10 Architecture Master baseline prompts.
- `src/runBaselineBenchmark.js` runs the baseline and writes report, gallery, CSV, JSON, and feedback artifacts.
- `docs/benchmarks/` stores lightweight benchmark summaries that are safe to commit.
- `out/` stores full generated benchmark/build artifacts and is intentionally ignored.

## Template Memory

- `mc_templates/analysis/` stores generated analysis artifacts, including case libraries, retrieval indexes, design laws, and knowledge base v2 outputs.
- `mc_templates/curation/` stores human-maintained review overlays and tag taxonomy.
- Raw schematic templates stay under `mc_templates/<category>/`.

## Documentation

- `README.md` is the GitHub repository entry.
- `docs/index.html` is the GitHub Pages homepage.
- `docs/architecture.md` explains the current active architecture.
- `docs/roadmap.md` describes the long-term Architecture Master direction.
- `docs/parameter-tree/` contains a small standalone parameter-tree viewer.

## Removed Legacy Material

Legacy showcase pages, reports, screenshots, and checklist files were removed from the main tree. The useful engineering history remains in git history, benchmark summaries, roadmap notes, and architecture docs.
