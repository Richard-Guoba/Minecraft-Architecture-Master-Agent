# Architecture

The project has two independent flows: a production construction flow and a local training flow. Training may produce experimental checkpoints, but it does not alter primary Minecraft generation until its held-out gate passes.

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
-> training
-> evaluation
```

All 64 local schematic templates are considered automatically. Source buildings are fingerprinted and grouped before a deterministic 70/15/15 train/validation/test split. Whole volumes and overlapping patches are derivatives of that already-fixed assignment, so patches from the same building or duplicate group cannot cross splits.

Node.js owns source discovery, bounded parsing, token mapping, fingerprints, split assignment, volume preparation, and canonical dataset artifacts. PyTorch owns patch loading, balanced masks, the occupancy-plus-semantics model, checkpoint/resume, metrics, gates, and reconstructions.

The model predicts two related outputs:

1. occupancy: air or non-air;
2. semantic material family for non-air voxels.

Balanced supervision prevents the majority air class from hiding non-air failure. Gate 1 requires deterministic overfitting of four training patches. Gate 2 measures held-out non-air F1/IoU, improvement over untrained and class-prior baselines, and predicted occupancy calibration.

## Experimental shadow boundary

The optional coarse semantic shadow interface remains an experimental integration boundary. It may compare a deterministic baseline or a validated artifact without changing primary operations. A learned provider is not part of normal generation during this reset.

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
