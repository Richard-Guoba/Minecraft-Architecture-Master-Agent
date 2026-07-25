# Residential Learned Renderer

The residential learned renderer is a planned two-stage `HouseSpec -> HouseScene` system. Its long-term role is to learn whole-house structure and room-aware decoration while deterministic code validates Minecraft legality, usability, bounded repairs, and datapack export.

Current implementation status is R2. R1 contracts/workspace and R2 local source intake are implemented. R3 canonical extraction, annotation, datasets, models, training, and production integration are not implemented. R2 is not a trained model, residential dataset, checkpoint, or production provider.

## Local curator workflow

All R2 source data remains local-only below the ignored `.local/residential-model/` root. It is never committed. R2 preserves source files and creates provenance/profile/report records; it does not make any candidate eligible for training.

Start the workspace, create a named source batch, then intake it only after adding files and provenance:

```bash
npm run residential:workspace -- init
npm run residential:workspace -- batch-init \
  --batch-id 2026-07-24-planetminecraft-001 \
  --source-project planetminecraft
npm run residential:workspace -- intake \
  --batch-id 2026-07-24-planetminecraft-001
npm run residential:workspace -- legacy-audit
npm run residential:workspace -- status
```

`batch-init` creates this exact flat two-lane layout. Place every payload exactly once, directly below one lane, and preserve its original extension. Do not add style folders, type folders, nested directories, symlinks, or unlisted files.

```text
.local/residential-model/inbox/2026-07-24-planetminecraft-001/
  batch-manifest.json
  houses/
    oak-cottage.schem
  other-architecture/
    harbor-tower.schematic
```

The lane is the collector's initial claim, not proof. `houses/` is for complete residential-house candidates. `other-architecture/` preserves strong non-residential architecture as reference material, but excludes it from residential training.

### Complete two-candidate manifest

After `batch-init`, replace the empty candidate array with the actual files and source-page provenance. This is a complete schema-valid example; update every value to match the real source. Record the source page, not a search-results URL. When licensing is unclear, write `"unknown"` and leave license text/allowed uses empty rather than guessing.

```json
{
  "source": "residential-source-batch-v1",
  "schema_version": 1,
  "batch_id": "2026-07-24-planetminecraft-001",
  "source_project": "planetminecraft",
  "candidates": [
    {
      "relative_path": "houses/oak-cottage.schem",
      "lane": "houses",
      "title": "Oak Cottage",
      "origin": {
        "url": "https://www.planetminecraft.com/project/oak-cottage-example/",
        "author": "example-builder",
        "license_status": "unknown",
        "license_text": "",
        "allowed_uses": [],
        "acquired_at": "2026-07-24T12:00:00.000Z"
      },
      "collector_note": "Residential candidate; review composition and interiors in R3/R4."
    },
    {
      "relative_path": "other-architecture/harbor-tower.schematic",
      "lane": "other-architecture",
      "title": "Harbor Tower",
      "origin": {
        "url": "https://www.planetminecraft.com/project/harbor-tower-example/",
        "author": "example-builder",
        "license_status": "recorded",
        "license_text": "Local analysis and training permitted by the source page.",
        "allowed_uses": ["local-analysis", "local-training"],
        "acquired_at": "2026-07-24T12:00:00.000Z"
      },
      "collector_note": "Non-residential reference only; do not treat this lane as a house label."
    }
  ]
}
```

## What R2 decides—and does not decide

- Intake validates the complete batch inventory before writing quarantine files, profiles, or reports.
- Supported inputs are `.schem`, `.schematic`, and vanilla structure `.nbt`; unsupported or oversized structures remain deferred and are not cropped or fabricated.
- A successfully parsed house has status `parsed`, not `eligible`. Every residential evidence field remains `unknown` pending R3/R4 extraction, annotation, and review.
- Other architecture is preserved as `deferred/non_residential_reference_only`; it is not residential training data.
- Content duplicates reuse their immutable local identity; provenance is retained without inventing a new identity.
- A completed batch is immutable. To change files, manifest details, or provenance, create a new batch ID rather than editing the completed batch.
- The legacy audit examines existing templates read-only. It reports missing provenance and does not move, rewrite, copy, or automatically admit legacy files.

## Contracts and next work

R1 defines strict version-one contracts for HouseSpec semantic input, HouseScene learned output, SourceProfile provenance/state, review records, and the deterministic workspace manifest. R2 adds strict versioned source-batch, intake-report, and legacy-audit records around local source preservation.

The full approved program design is [design.md](design.md). R3 must decide canonical block/entity extraction and deterministic evidence extraction before annotation and dataset work. No R2 action authorizes model training or production integration.
