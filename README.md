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
- The generator targets Minecraft Java 1.21 / 1.21.1 with datapack `pack_format: 48`. Minecraft Java 1.21.9 uses the required `min_format: 88` / `max_format: 88` metadata and its renamed `minecraft:iron_chain` block ID.
- The repository contains 64 local schematic templates. Every one may be used for local training without per-file approval.
- Automatic preparation accepts all 64 sources and produces 11,600 non-empty patches. The source split is 45 train, 10 validation, and 9 test buildings.
- The original `heldout-7101` reference passed Gate 2 with validation non-air macro-F1 `0.3609670073`.
- Semantic-balance v2 compared weighted loss with weighted loss plus class-aware masking. Both passed the four-patch Gate 1; `weighted-mask` won the fixed 10,000-step ablation ranking.
- The from-scratch 50,000-step `balanced-v2-7101` run passed validation Gate 2 but failed the stricter phase-two gate: macro-F1 was `0.3490899391` and architectural-shape/token-5 F1 was `0.0395156268`.
- On the untouched test split, the same checkpoint failed Gate 2 and phase two with macro-F1 `0.1620096727`, exposing a material source-level generalization gap.
- The checkpoint remains experimental and is not part of primary generation. The LLM still describes the house; deterministic Node.js code still turns that intent into exact geometry and datapack commands.
- Training artifacts remain local by default. A separate license and distribution review happens only before a concrete artifact is shared externally.
- Architecture Playbook P5 is available as an opt-in, default-off deterministic design loop. It creates three candidates, validates five design layers, permits at most one reviewed repair per candidate, and filters eligibility before the existing ranker. Replay is rebuilt from persisted hash-bound authority. Candidate and selection publication use immutable bodies plus one recoverable current pointer. Directory creation records the exact new inode synchronously before the first asynchronous boundary, then requires the retained no-follow handle, boundary-returned handle, and named entry to match before no-replace promotion. Candidate and selection pointer stages retain their exclusive-open handles through first named read and publication. Cleanup moves exact owned entries into capability-private retirement journals; after the last injectable removal boundary it revalidates authority and inode immediately beside a non-yielding unlink/rmdir. The final datapack installer creates each stage file through a trusted synchronous exclusive open, immediately binds the returned descriptor and inode before any injected or asynchronous callback, and reconciles post-effect open, partial/full write, sync, and close failures before cleaning exact created topology, so foreign replacements are neither installed nor deleted. These guarantees cover every documented JavaScript asynchronous and fault-injection interval. They trust Node's native bindings and assume no hostile same-UID writer races adjacent synchronous syscalls; standard Node/POSIX offers neither a `mkdir` that returns a retained directory descriptor nor inode-conditional `unlink`/`rmdir`. A failed pre-install run retains no candidate workspace; cleanup after an externally committed disposable install cannot relabel that install as failed. P5 creates no playbook score and does not prove quality or aesthetic improvement. P6 visual evaluation and blind comparison remain closed.
- P6 preparation is an opt-in, offline-only prerequisite. It admits the frozen P5 and baseline authorities, publishes hash-bound cohort/camera data, and generates 24 deterministic `reference-render` PNGs. These are not formal Minecraft evidence and do not prove that Minecraft displayed the builds correctly.

## Residential learned renderer

The approved next-generation direction is a residential `HouseSpec -> HouseScene` learned renderer with separate structure and room-decoration stages. Its current implementation scope is contracts and local workspace only; it is not trained or connected to production. See [the residential renderer design](docs/residential-model/design.md).

## Quick start

Requirements: Node.js 20+ and npm.

```bash
npm install
npm test
npm start -- --mode mock --seed 7101 "建一个湖边现代两层别墅，带大玻璃、水边平台和前景花园"
npm run playbook:execute -- --mode mock --seed 424242 "Build a two-story medieval residence with three volumes, a dark pitched roof, timber framing, and a stone base"
```

Mock mode is the safest reproducible end-to-end check. For LLM mode, copy `.env.example` to `.env`, add provider credentials, then run:

```bash
npm start -- --mode llm "建一个日式茶屋住宅，深檐木格栅，水景庭院，动线安静"
```

To use your locally installed and authenticated Codex CLI for the P5 design loop:

```bash
codex
npm run playbook:execute -- --mode llm --llm-provider codex "Build a compact medieval stone gatehouse"
```

The first command is a setup check: complete local sign-in if Codex requests it, then exit the interactive session. The workflow enforces `codex exec --sandbox read-only --ephemeral --color never`, sends each agent prompt through standard input, and uses the model selected by your local Codex configuration. Codex cannot modify the repository through this channel, and ephemeral execution does not persist session rollout files, but prompt context is sent through your logged-in Codex service account.

`CODEX_ARGS` may add safe optional `codex exec` flags such as `--model`, but it cannot replace the enforced read-only/ephemeral flags, grant writable directories, bypass the sandbox, or replace the final-output protocol. The adapter accepts at most 1 MiB from the final JSON output file and validates that it contains a top-level JSON object.

The Codex adapter distinguishes these failures:

- `CODEX_UNAVAILABLE`: install Codex or put `codex` on `PATH`.
- `CODEX_SETUP_REQUIRED`: run `codex` and complete sign-in.
- `CODEX_TIMEOUT`: increase `CODEX_TIMEOUT_MS`; the default is 600000 ms per request.
- `CODEX_EXECUTION_FAILED`: run `codex` directly to verify the local installation.
- `CODEX_PROTOCOL_INVALID`: update Codex and retry; the workflow requires a JSON object.
- `CODEX_CONFIGURATION_INVALID`: remove unsafe or protocol-conflicting values from `CODEX_ARGS`.

The P5 command preserves P5's public error boundary, so a design-stage provider failure is reported as `P5_DESIGN_INVALID`. If that occurs, perform the `codex` setup check above before retrying.

## P6 reference preparation (offline only)

After producing the exact frozen P5 run and its matching baseline authority, prepare the P6 reference package under a disposable ignored run directory:

```bash
npm run playbook:p6 -- prepare \
  --playbook-run /absolute/path/to/p5-run \
  --baseline-run /absolute/path/to/baseline-run \
  --run-dir /absolute/path/to/p6-run
```

The command never launches, installs, opens, or changes Minecraft or any world. It writes only the owned `playbook-p6/` output beneath `--run-dir` (normally `out/<run>/playbook-p6/`); `out/`, `.local/architecture-playbook/`, worlds, datapacks, screenshots, reference images, and private comparison material are ignored and must remain untracked. Its `reference-render` images are deterministic offline checks, not the required formal Minecraft captures.

Formal screenshots are a later, separate checkpoint: they require explicit authorization for one exact disposable world, its expected identity hash, and a human-run capture/import step. The blind-comparison step then waits for human A/B/tie choices; no command invents a preference or opens P7 without those records. In this release, `capture` always stops with `P6_CAPTURE_AUTHORIZATION_REQUIRED`, even if authorization-looking flags are supplied.

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
npm run training:train -- --root .local/training --run-id balanced-v2-7101 --steps 50000 --batch-size 2 --learning-rate 0.001 --device auto --seed 7101 --semantic-balance weighted-mask
npm run training:evaluate -- --root .local/training --run-id balanced-v2-7101 --device auto --seed 7101 --split validation
npm run training:status -- --root .local/training
```

Preparation, training, resume, split-specific evaluation, and status reporting are implemented. See [docs/training.md](docs/training.md) for the full ablation sequence, untouched-test command, observed results, fixed gates, model limits, and local artifact rules.

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
