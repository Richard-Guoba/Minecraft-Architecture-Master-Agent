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
- Automatic preparation accepts all 64 sources and produces 11,600 non-empty patches. The source split is 45 train, 10 validation, and 9 test buildings.
- The replacement model passed its four-patch overfit gate at step 2,300 with non-air macro-F1 `0.9054`.
- The 50,000-step held-out run passed Gate 2 with validation non-air macro-F1 `0.3610`, macro-IoU `0.2546`, and occupancy F1 `0.9193`.
- The checkpoint remains experimental and outside primary generation. Its clearest measured weakness is the architectural-shape class.
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

The supported local workflow is:

```bash
npm run training:prepare -- --source-root mc_templates --root .local/training --seed 7101
npm run training:train -- --root .local/training --run-id heldout-7101 --steps 50000
npm run training:evaluate -- --root .local/training --run-id heldout-7101
npm run training:status -- --root .local/training
```

Preparation, training, resume, held-out evaluation, and status reporting are implemented. See [docs/training.md](docs/training.md) for the observed results, fixed gates, model limits, and local artifact rules.

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
- Passing the held-out gate proves useful learning, not production readiness. Integrating a checkpoint into primary generation remains a separate engineering decision.
