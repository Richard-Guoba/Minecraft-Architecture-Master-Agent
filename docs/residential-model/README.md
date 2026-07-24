# Residential Learned Renderer

The residential learned renderer is a planned two-stage `HouseSpec -> HouseScene` system. Its long-term role is to learn whole-house structure and room-aware decoration while deterministic code validates Minecraft legality, usability, bounded repairs, and datapack export.

Current implementation status is R1: contracts and local workspace. R1 is not a trained model, source-ingestion pipeline, dataset, checkpoint, or production provider.

## Current commands

Inspect status without creating or changing the local workspace:

```bash
npm run residential:workspace -- status
```

Initialize the exact ignored local root when it does not already exist:

```bash
npm run residential:workspace -- init
```

The root is `.local/residential-model/`. Real houses, source profiles, annotations, reviews, snapshots, runs, and reports remain local and ignored.

## Contracts

R1 defines strict version-one contracts for:

- HouseSpec semantic input;
- HouseScene learned output;
- SourceProfile provenance and state;
- golden/selective/audit review records; and
- the deterministic workspace manifest.

The full approved program design is [design.md](design.md). Later work proceeds through separate gated implementation plans. R2 source intake and R6 model infrastructure are outside R1.
