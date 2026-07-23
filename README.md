# Minecraft Architecture Master Agent

Minecraft Architecture Master Agent turns Chinese or English building requests into runnable Minecraft Java datapacks. Language models may describe design intent, while local code owns geometry, paths, interiors, validation, repair, scoring, and export.

[Architecture](docs/architecture.md) · [Local training](docs/training.md) · [Static homepage](docs/index.html)

## What it does

The active `construction_method_v1` pipeline separates semantic planning from block placement:

```text
Prompt
-> semantic agents
-> deterministic CSG / BSP / A* geometry
-> interiors, site, QA, repair, and evaluation
-> Minecraft Java datapack, preview, and reports
```

The LLM does not need to emit exact block coordinates. The Node.js runtime turns semantic JSON into validated Minecraft geometry and commands.

## Current status

- Normal mock generation is deterministic and does not need an API key or Python.
- The generator targets Minecraft Java 1.21 / 1.21.1 and datapack `pack_format: 48`.
- The repository contains 64 local schematic templates. Every one may be used for local training without per-file approval.
- Earlier local training reached 185,946 optimizer steps but collapsed to all-air predictions. That run proved plumbing, not useful learning.
- The training path is being replaced with automatic source preparation, leakage-safe splitting, balanced non-air learning, checkpointing, and explicit progress gates.
- Training artifacts remain local by default. A separate license and distribution review happens only before a concrete artifact is shared externally.

## Quick start

Requirements: Node.js 20+ and npm.

```bash
npm install
npm test
npm start -- --mode mock --seed 7101 "建一个湖边现代两层别墅，带大玻璃、水边平台和前景花园"
```

Mock mode is the safest reproducible end-to-end check. For LLM mode, copy `.env.example` to `.env`, add provider credentials, then run:

```bash
npm start -- --mode llm "建一个日式茶屋住宅，深檐木格栅，水景庭院，动线安静"
```

## Generate a datapack

A run writes an ignored directory below `out/` containing the main artifacts:

```text
blueprint.json
architect_datapack/
raw_build.mcfunction
preview.html
run_report.md
architecture_scorecard.json
```

Copy `architect_datapack/` into a world's `datapacks` directory, then run:

```text
/reload
/function architect:run
```

`/reload` refreshes datapacks. `architect:run` clears the previous generated build and executes the new one.

## Local training

The replacement training workflow has one target command surface:

```bash
npm run training:prepare -- --source-root mc_templates --output-root .local/training --seed 7101
npm run training:train -- --root .local/training --run-id held-out-7101 --steps 50000
npm run training:evaluate -- --root .local/training --run-id held-out-7101
npm run training:status -- --root .local/training
```

These commands are the interface being implemented by the current reset; until that implementation lands, the construction pipeline remains the supported executable path. See [docs/training.md](docs/training.md) for data preparation, split, model, metrics, and artifact rules.

## Repository map

```text
src/
  construction/       active generation and evaluation pipeline
  training/           reusable local data preparation code
  llm/                provider adapters and JSON parsing
  lib/                shared filesystem and Minecraft helpers
training/stage7/      optional Conda/PyTorch training package
test/                 Node.js tests
mc_templates/         64 local source schematics and analysis assets
docs/
  architecture.md     current system structure
  training.md         current local-training contract
  index.html          static project homepage
```

## Project boundaries

- This project exports datapacks; it is not a Mineflayer player bot and does not collect survival resources.
- Normal generation requires Node.js, not Python. Training uses the Conda environment `mcagent-stage7`; do not create a repository-local `.venv`.
- Secrets, `.env`, `out/`, `.local/`, checkpoints, prepared datasets, and reconstructions must not be committed.
- Existing `.local/` data is preserved. Project cleanup must not delete, move, publish, or overwrite it.
- The learned model stays outside primary generation until held-out metrics pass the documented gate.
