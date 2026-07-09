# Stage 1 Readiness Baseline

Date: 2026-07-09

Git branch: `codex/stage1-human-comfort-site`

Command:

```powershell
npm run benchmark:baseline -- --out out/stage1-readiness-baseline
```

Local artifact root:

```text
out/stage1-readiness-baseline
```

Artifacts generated locally:

- `baseline_benchmark_summary.json`
- `baseline_benchmark_report.md`
- `baseline_benchmark_table.csv`
- `gallery.html`
- `human_feedback_template.json`
- `runs/` with 10 generated prompt outputs

## Summary

- Total prompts: 10
- Successful generations: 10
- Failed generations: 0
- Red flags: 0
- Average scorecard: 100/100
- Average base score: 60/60
- Average advanced score: 39.8/40
- Average legacy checklist score: 100%
- Repair priority queue: empty
- Mode: mock
- Minecraft target: 1.21

## Results

| # | Prompt ID | Grade | Scorecard | Base | Advanced | Habitation | Decoration | Rooms | Decor | Weak Dims |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | modern-waterfront-villa | S | 100 | 60 | 40 | 100% | 100% | 14 | 456 | 0 |
| 2 | european-manor-courtyard | S | 100 | 60 | 40 | 100% | 100% | 14 | 751 | 0 |
| 3 | japanese-tea-house-water-garden | S | 100 | 60 | 40 | 100% | 100% | 14 | 419 | 0 |
| 4 | medieval-tavern-home | S | 100 | 60 | 40 | 100% | 100% | 9 | 296 | 0 |
| 5 | gothic-observation-tower | S | 100 | 60 | 40 | 100% | 100% | 8 | 367 | 0 |
| 6 | alpine-slope-lodge | S | 98.9 | 60 | 38.9 | 100% | 100% | 10 | 289 | 0 |
| 7 | coastal-sunset-retreat | S | 100 | 60 | 40 | 100% | 100% | 13 | 471 | 0 |
| 8 | chinese-courtyard-house | S | 98.9 | 60 | 38.9 | 100% | 100% | 14 | 590 | 0 |
| 9 | fantasy-wizard-tower | S | 100 | 60 | 40 | 100% | 100% | 15 | 532 | 0 |
| 10 | small-village-cluster | S | 100 | 60 | 40 | 100% | 100% | 6 | 86 | 0 |

## Repair Closure

| Stage 0 priority | Stage 0 count | Stage 1 count | Closure |
|---|---:|---:|---|
| `advanced.human-comfort-site` | 7 | 0 | Patio and outdoor seating now produce `outdoor_living`; full workflow keeps `landscape_path` evidence alongside `entry_path`. |
| `advanced.surface-site-detail` | 2 | 0 | Entry approach semantics remain visible after pathfinding and template site composition. |
| `advanced.resilience-utilities` | 1 | 0 | Coastal flood resilience now leaves `flood_vent` modules after facade/site detailing. |

## Notes

This file records the lightweight Stage 1 readiness summary for version control. The full generated output remains under `out/stage1-readiness-baseline/`, which is intentionally ignored because it contains generated datapacks and bulky run artifacts.
