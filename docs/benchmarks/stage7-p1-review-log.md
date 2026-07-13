# Stage 7 P1 Human Review Log

This log records human curation operations and governance outcomes. It is not a model input and does not grant any training or redistribution permission.

## Review 1: A Small Modern House

| Field | Value |
| --- | --- |
| Case ID | `house-a-small-modern-house` |
| Source group | `mcbuild.org` |
| Source SHA-256 | `e602703d076cfa70903c10925f4dddd1000109ab1afacb46a57368461c9b4b55` |
| Split | `train` (unchanged fixed split) |
| Reviewed by | `stage7-curator-01` |
| Reviewed at | `2026-07-13T07:40:06.966Z` |
| Source attribution | Designed by Rizzial; schematic and publication by Alterio |
| Governance outcome | `research-only`; license `restricted`; `local-analysis` only |
| Learning areas | Approved: none; blocked: `envelope`, `site`, `space` |
| Canonical front | `north` |
| Semantic outcome | `rejected` |
| Sparse corrections | 0 |
| Evidence reuse | New source-group terms baseline; recheck the terms date for every later McBuild review and review artifact attribution separately |
| Source/license investigation minutes | Not reliably measured because evidence collection preceded creation of this timing log |
| Semantic review minutes | Not reliably measured because orientation and semantic inspection preceded creation of this timing log |
| Correction minutes | 0 |
| Total review minutes | Not reported; implementation, test, and dataset rebuild time is intentionally excluded from human-review throughput |

### Evidence

- Source page: <https://mcbuild.org/schematics/16786:a-small-modern-house>
- Site terms, updated 2026-06-28: <https://mcbuild.org/posts/terms>
- The source page distinguishes the original designer (`Rizzial`) from the schematic preparer and publisher (`Alterio`).
- Sections 4 and 5 of the site terms permit personal non-commercial use but, without prior written permission, prohibit automated collection, corpus construction, and using service content or data to develop, train, fine-tune, evaluate, or improve AI/ML models, systems, or datasets.

### Semantic decision

The visible primary facade aligns with the normalized min-Z projection, recorded as canonical `north`. The extracted plan retains hard blockers for entrance, circulation, floor continuity, roof, usable space, and vertical circulation. Broad relabeling would be required to overcome them, so no sparse correction was approved and all three learning areas remain blocked.

### Readiness impact

- Explicit pilot outcomes: 1/6
- Training-eligible pilot cases: 0
- Semantic-accepted pilot cases: 0
- Ready for M3 real-data training: no

For the remaining pilot cases, start a review timer before evidence collection and record source/license, semantic inspection, and correction time separately.
