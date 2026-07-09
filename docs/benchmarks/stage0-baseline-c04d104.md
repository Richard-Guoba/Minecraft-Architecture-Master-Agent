# Stage 0 Baseline Benchmark - c04d104

Date: 2026-07-09

Git baseline: `c04d104 Merge baseline scorecard benchmark`

Command:

```powershell
npm run benchmark:baseline -- --out out/stage0-baseline-c04d104
```

Local artifact root:

```text
out/stage0-baseline-c04d104
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
- Average scorecard: 98/100
- Average base score: 60/60
- Average advanced score: 37.8/40
- Average legacy checklist score: 100%
- Mode: mock
- Minecraft target: 1.21

## Results

| # | Prompt ID | Grade | Scorecard | Base | Advanced | Habitation | Decoration | Rooms | Decor | Weak Dims |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | modern-waterfront-villa | S | 97.7 | 60 | 37.7 | 100% | 100% | 14 | 456 | 1 |
| 2 | european-manor-courtyard | S | 97.9 | 60 | 37.9 | 100% | 100% | 14 | 751 | 1 |
| 3 | japanese-tea-house-water-garden | S | 97.8 | 60 | 37.8 | 100% | 100% | 14 | 419 | 1 |
| 4 | medieval-tavern-home | S | 98.9 | 60 | 38.9 | 100% | 100% | 9 | 296 | 0 |
| 5 | gothic-observation-tower | S | 100 | 60 | 40 | 100% | 100% | 8 | 367 | 0 |
| 6 | alpine-slope-lodge | S | 96.7 | 60 | 36.7 | 100% | 100% | 10 | 289 | 2 |
| 7 | coastal-sunset-retreat | S | 95.3 | 60 | 35.3 | 100% | 100% | 13 | 471 | 2 |
| 8 | chinese-courtyard-house | S | 96.5 | 60 | 36.5 | 100% | 100% | 14 | 590 | 2 |
| 9 | fantasy-wizard-tower | S | 97.8 | 60 | 37.8 | 100% | 100% | 15 | 532 | 1 |
| 10 | small-village-cluster | S | 99.2 | 60 | 39.2 | 100% | 100% | 6 | 86 | 0 |

## Repair Priorities

| # | Dimension | Count | Avg | Action |
|---:|---|---:|---:|---|
| 1 | `advanced.human-comfort-site` | 7 | 72% | Review comfort/site module coverage, especially expected `landscape_path`, `water_feature`, `planting_bed`, and `outdoor_living` signals. |
| 2 | `advanced.surface-site-detail` | 2 | 75% | Strengthen surface, roof, and site-detail module triggers and placement order. |
| 3 | `advanced.resilience-utilities` | 1 | 50% | Route resilience and utility expectations, such as `wind_tie` and `flood_vent`, into structure and CSG modules. |

## Notes

This file records the lightweight benchmark summary for version control. The full generated output remains under `out/stage0-baseline-c04d104/`, which is intentionally ignored because it contains generated datapacks and bulky run artifacts.
