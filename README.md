# Minecraft Architecture Master Agent

Minecraft Architecture Master Agent is a Node.js research and engineering project for turning natural-language building requests into Minecraft Java datapacks. The system keeps language-model output at the semantic planning layer, then uses deterministic local geometry, routing, decoration, validation, scoring, and export code to produce runnable builds.

The long-term goal is not a one-shot prompt-to-block toy. The project is being shaped into a hybrid architecture agent that can retrieve references, propose concepts, build, critique, repair, benchmark, and learn from its own runs.

[Static Homepage Source](docs/index.html) | [Architecture](docs/architecture.md) | [Roadmap](docs/roadmap.md) | [WSL Stage 7 Environment](docs/wsl-stage7-environment.md) | [Stage 7 M3 Fixture Guide](training/stage7/README.md) | [Stage 7 M3 Benchmark](docs/benchmarks/stage7-m3-fixture-foundation.md) | [Stage 1 Baseline](docs/benchmarks/stage1-readiness-baseline.md)

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
- Coarse semantic voxel layer: Stage 7 Milestone 1 defines the provider-neutral `64^3` shadow contract; M2/M2.5 establish governed extraction and review; immutable Dataset v3 fixes the coarse extraction foundation; and M3 adds a fixture-only CPU training/inference smoke path behind the existing Node shadow boundary.
- Active stage: **Stage 7 M3 fixture-only foundation**. The committed two-case synthetic fixture path reproduces checkpoints and canonical inference, Node revalidates the untrusted plan, and Python shadow preserves ordered primary geometry. Dataset v3 remains `ready_for_m3_real_data=false` with `training_eligible_count=0`, so real training is prohibited and M4 Apply Mode is unavailable. See the [benchmark evidence](docs/benchmarks/stage7-m3-fixture-foundation.md).
- Real-case readiness audit: `npm run audit:stage7:readiness -- --out <directory>` reads the fixed six Dataset v3 pilots and existing review evidence into canonical JSON/Markdown blockers. It is advisory-only, writes outside Dataset roots, and cannot authorize training.
- Previous milestone record: the earlier line “Active stage: Stage 7 Milestone 2.5” described the trusted-data review-pack phase. Its real-case result remains 0 reviewed training approvals because all six explicit outcomes are research-only, not training-approved.

## Quick Start

The canonical Stage 7 development environment is WSL2 Ubuntu on the Linux filesystem. Use the repository `.nvmrc` for Node.js and the Conda environment named `mcagent-stage7` for Python/PyTorch work; do not create a repository-local `.venv`. Follow the [WSL Stage 7 environment guide](docs/wsl-stage7-environment.md) and [fixture workflow](training/stage7/README.md). Normal Node generation and `npm test` remain Python-independent.

```bash
conda env create --file training/stage7/environment.yml
conda run -n mcagent-stage7 python -m pip install -r training/stage7/requirements-wsl-cu130.lock
conda run -n mcagent-stage7 python training/stage7/verify_environment.py
npm run test:stage7:m3
npm run accept:stage7:m3 -- --fixture-root fixtures/m3 --output runs/m3-acceptance --seed 7101 --steps 2
```

```powershell
npm install
npm test
npm run analyze:templates -- --offline
npm run dataset:stage7 -- --require-eligible 0
npm run review-pack:stage7 -- --out .tmp/stage7-m2-5-review-pack
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
-> Stage 7 M1-M3 Shadow + immutable Datasets v1/v2/v3: governed real cases stay gate-closed while the fixture-only Python provider remains untrusted and cannot change primary operations
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
training/stage7/             Optional fixture-only Python/PyTorch M3 subsystem
```

See [docs/project-map.md](docs/project-map.md) for a more detailed guide.

## Main Commands

```powershell
npm test
npm run test:stage7:m3
npm run accept:stage7:m3 -- --fixture-root fixtures/m3 --output runs/m3-acceptance --seed 7101 --steps 2
npm run benchmark:baseline -- --out out/stage1-readiness-baseline
npm run query:templates -- "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
npm run analyze:templates -- --offline
npm run query:patches -- --dataset mc_templates/analysis/semantic_patch_dataset.json --limit 5
npm start -- --mode mock --seed 7101 --concepts 3 --concept-strategy fuse "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
npm start -- --mode mock --no-critics "建一个欧式大房子"
npm start -- --help
npm start -- --list-prompts
```

## Stage 7 Source-Expansion Metadata Pilot

The source-expansion pilot is a local, metadata-only audit for identifying public candidates that may be worth human review. Initialize the exact ignored root, then run each review wave with an explicit observation date:

```bash
npm run audit:stage7:sources -- init --root .local/stage7-source-expansion
npm run audit:stage7:sources -- discovery --root .local/stage7-source-expansion --as-of YYYY-MM-DD --metadata-only
npm run audit:stage7:sources -- yield --root .local/stage7-source-expansion --as-of YYYY-MM-DD --metadata-only
npm run audit:stage7:sources -- finalize --root .local/stage7-source-expansion --as-of YYYY-MM-DD --metadata-only
```

The operator manually supplies only these four JSONL inputs under that root:

- `metadata/candidates.jsonl`
- `evidence/rights.jsonl`
- `reviews/discovery-decisions.jsonl`
- `reviews/yield-decisions.jsonl`

Discovery selects up to 30 review cards with at most 5 per source. Yield selects up to 20 unseen cards only from sources accepted in discovery, with at most 15 total cards per source across both waves. Rights evidence is fail-closed, human-reviewed, and no more than 30 days old. Review cards link to canonical public pages and public preview pages; they do not download or copy preview images.

This workflow does not authorize download, Dataset admission, or training. Human acceptance only supports a later acquisition-design review; it is not permission to acquire or process an asset. The 42 deferred oversized private buildings, normal Node generation, M4 Apply Mode, and Dataset v1/v2/v3 remain outside this workflow and unchanged.

### Stage 7 Conditional Admission R1

R1 adds a metadata-only controlled taxonomy and pre-acquisition admission audit. Prepare one assessment at the exact ignored-root input path, append it as the next revision, then create a fresh dated audit:

```bash
npm run audit:stage7:conditional-admission -- record --root .local/stage7-source-expansion --input reviews/taxonomy-input.json --metadata-only
npm run audit:stage7:conditional-admission -- audit --root .local/stage7-source-expansion --as-of YYYY-MM-DD --metadata-only
```

The audit consumes the existing candidate and rights ledgers, both review-decision ledgers, and `reviews/conditional-taxonomy.jsonl`. It validates the eight controlled primary functions, complete-building rule, label confidence, building-type parent, style, environment, biome, source group, and asset family. It also exposes pure future 100/500/2,000 balance and locked-split contracts for later snapshot builders.

`admission_contract_ready` means only that the metadata contract can enter a later named acquisition proposal. It does not authorize download, Dataset admission, or training. R1 has no downloader, payload reader, parser, voxel preparer, model, or trainer.

## Boundaries

- This repository produces Minecraft datapacks; it is not a Mineflayer real-time player bot.
- It does not download Minecraft or simulate survival-mode resource gathering.
- Generated `out/` artifacts, local credentials, and temporary files are intentionally not committed.
- Python is optional for the explicitly selected Stage 7 M3 fixture-only training/inference and shadow workflow; normal Node generation does not require it.
- Fixture loss is a plumbing signal only, not evidence of model quality, accuracy, preference, or generalization.
- Dataset v3 remains `ready_for_m3_real_data=false` and `training_eligible_count=0`. Pending, research-only, unlicensed, stale-plan, layer-disallowed, or semantically rejected real cases cannot enter training.
- Python emits provider-neutral semantic layers only—never Minecraft blocks, commands, or blueprint operations. Node keeps immutable checkpoint/manifest snapshots, strict UTF-8 parsing, schema/repair/conversion/rejection, and exact rule-only fallback. M4 Apply Mode remains unavailable.
- Stage 7 Python shadow does not change primary geometry, whether its learned semantic candidate converts or rejects.
- Legacy `stage7-template-*` source identifiers refer to the older template-assimilation sequence, not Architecture Master Roadmap Stage 7.

## Development Direction

The project has moved past early showcase packaging. Current work should optimize for long-term capability:

1. Keep the benchmark and scorecard stable.
2. Make reference retrieval and template memory more useful.
3. Preserve Stage 3 Concept Studio as the concept-first planning layer.
4. Use Stage 4 Critic Council findings to guide repair priorities.
5. Keep Stage 5 neural retrieval optional and artifact-gated so rule-only generation remains reliable.
6. Use Stage 6 semantic patch artifacts as the reviewable bridge toward future learned roof, facade, interior, and courtyard detail completion.
7. Preserve the Stage 7 M3 fixture-only foundation and immutable v1/v2/v3 datasets while obtaining at least three truly eligible, exact-v3-plan-bound real cases before any separate real-data training proposal; keep Apply Mode reserved for M4.
