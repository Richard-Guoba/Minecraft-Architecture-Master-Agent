# Architecture

The project has two independent flows: a production construction flow and a local training flow. Training a checkpoint does not change the production generator.

## Construction flow

```text
Prompt
-> semantic agents
-> deterministic geometry
-> QA and repair
-> datapack
```

`construction_method_v1` is the active generator. Architect and planning agents describe style, massing, materials, room topology, circulation, facade, roof, structure, and site intent. Local Node.js code then owns the build:

- CSG creates shells, volumes, roofs, facade elements, site work, and structural modules.
- BSP partitions usable interiors into room rectangles.
- A* connects the entrance, rooms, stairs, and attached volumes.
- Interior and decoration agents place functional room details.
- QA, repair, optimization, evaluation, and critics validate the result.
- Export writes Minecraft Java 1.21 / 1.21.1 functions using datapack `pack_format: 48`.

The LLM never needs to emit exact XYZ block coordinates. Invalid or incomplete semantic output can be normalized or rejected before geometry is exported.

## Local training flow

```text
Local templates
-> automatic preparation
-> source-level split
-> masked voxel patches
-> occupancy and semantic completion training
-> validation or test evaluation
```

All 64 local schematic templates are considered automatically. Source buildings are fingerprinted and grouped before a deterministic 70/15/15 train/validation/test split. Whole volumes and overlapping patches are derivatives of that already-fixed assignment, so patches from the same building or duplicate group cannot cross splits.

Node.js owns source discovery, bounded parsing, token mapping, fingerprints, split assignment, volume preparation, and canonical dataset artifacts. PyTorch owns patch loading, balanced masks, the occupancy-plus-semantics model, checkpoint/resume, metrics, gates, and reconstructions.

Each training example supplies a partially masked `32 x 32 x 32` voxel patch. The model predicts two related outputs for the masked positions:

1. occupancy: air or non-air;
2. semantic material family for non-air voxels.

This model learns local statistical completion. It does not decide the requested style, room program, massing, or exact build commands. The division of responsibility remains:

```text
LLM semantic agents          decide what kind of house is intended
PyTorch completion model    predicts missing occupancy/material semantics
Node.js construction code   computes exact geometry, validates it, and exports commands
```

Semantic-balance v2 changes only training supervision. The `weighted` profile applies train-split class weights to semantic cross-entropy. The `weighted-mask` profile applies the same loss weights and also reserves semantic mask positions by class before filling the unchanged total mask budget uniformly. Occupancy loss is unweighted, and validation/test evaluation always uses the legacy uniform mask.

With seed 7101, preparation accepted all 64 sources and produced 11,600 patches. Both v2 profiles passed Gate 1: `weighted` at step 3,000 with macro-F1 `0.9013636890`, and `weighted-mask` at step 1,200 with `0.9101720777`. Both 10,000-step ablations passed Gate 2. The fixed harmonic ranking selected `weighted-mask` because its macro/token-5 score was `0.0283546962`, compared with `0.0023993868` for `weighted`.

The selected profile was then trained from scratch for 50,000 CPU steps as `balanced-v2-7101`. Validation passed Gate 2 but failed phase two: macro-F1 `0.3490899391`, token-5 F1 `0.0395156268`, occupancy F1 `0.9136144860`, and predicted/target non-air ratio `1.0509388161`. The untouched test split failed Gate 2 and phase two with macro-F1 `0.1620096727`, token-5 F1 `0.0420108418`, occupancy F1 `0.9417519967`, and ratio `1.0247792241`.

## Experimental shadow boundary

The optional coarse semantic shadow interface remains the integration boundary. It may compare a checkpoint with deterministic output without changing primary operations. `balanced-v2-7101` is not part of normal generation: it missed both phase-two semantic thresholds on validation, failed Gate 2 on the untouched test split, and showed especially weak test F1 for glass/token 4 (`0.0069029417`), architectural shape/token 5 (`0.0420108418`), and other/token 8 (`0.0375643824`).

## Ownership boundaries

```text
Node.js                     PyTorch
--------------------------  -----------------------------
schematic/NBT parsing       balanced masking
token taxonomy              completion model
source fingerprints         optimizer and checkpoints
source-level split          evaluation metrics and gates
whole and patch artifacts   reconstruction output
```

Generated construction artifacts go below `out/`. Training data, checkpoints, metrics, and reconstructions go below `.local/training/`. Neither root is committed. Existing `.local/` content must not be deleted, moved, published, or overwritten by cleanup work.

## Runtime boundaries

- Normal generation requires Node.js 20+ and works in mock mode without API keys.
- Python is optional for normal generation and is used only by the local training workflow.
- The training environment remains the Conda environment `mcagent-stage7`.
- The project exports datapacks; it does not control a live Mineflayer player or gather survival resources.
