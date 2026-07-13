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

## Review 2: Lakehouse

| Field | Value |
| --- | --- |
| Case ID | `house-lakehouse` |
| Source group | `mcbuild.org` |
| Source SHA-256 | `626444079b0a9b4ad668b807c8d8b6e46fb8423ad04d02dabb704f857e91d971` |
| Split | `train` (unchanged fixed split) |
| Reviewed by | `stage7-curator-01` |
| Reviewed at | `2026-07-13T08:00:24.041Z` |
| Source attribution | Original designer unknown; page publication account `admin` |
| Governance outcome | `research-only`; license `restricted`; `local-analysis` only |
| Learning areas | Approved: none; blocked: `envelope`, `site`, `space` |
| Canonical front | `north` |
| Semantic outcome | `rejected` |
| Sparse corrections | 0 |
| Evidence reuse | Reused the checked McBuild terms baseline; independently checked this artifact's attribution, previews, and source-bound identity |
| Source/license investigation minutes | 2 |
| Semantic review minutes | 5 |
| Correction minutes | 0 |
| Total review minutes | 7; excludes review-pack generation and dataset rebuild time |

### Evidence

- Source page: <https://mcbuild.org/schematics/11323:lakehouse>
- Site terms, updated 2026-06-28: <https://mcbuild.org/posts/terms>
- The source page publishes the item `By admin` but provides no original designer or schematic-creator attribution.
- The site terms baseline remains unchanged: without prior written permission, it prohibits automated collection, corpus construction, and using service content or data to develop, train, fine-tune, evaluate, or improve AI/ML models, systems, or datasets.

### Semantic decision

The visible facade with the tree on the left, chimney on the right, and lower entrance matches the normalized min-Z projection, recorded as canonical `north`. The extracted plan retains hard blockers for circulation, entrance, floor continuity, and roof. It labels 1,787 cells as vertical circulation across most of the normalized height, including 601 cells that overlap roof labels. Correcting this would require broad relabeling, so no sparse correction was approved and all three learning areas remain blocked.

### Readiness impact

- Explicit pilot outcomes: 2/6
- Training-eligible pilot cases: 0
- Semantic-accepted pilot cases: 0
- Ready for M3 real-data training: no

## Review 3: Tavern

| Field | Value |
| --- | --- |
| Case ID | `house-tavern` |
| Source group | `mcbuild.org` |
| Source SHA-256 | `09a29e7794aa2f8de33487b81b99a789ad470c0519a937098e12a5bd34c7d96b` |
| Split | `train` (unchanged fixed split) |
| Reviewed by | `stage7-curator-01` |
| Reviewed at | `2026-07-13T08:28:01.788Z` |
| Source attribution | Original designer unknown; page publication account `fiavando` |
| Governance outcome | `research-only`; license `restricted`; `local-analysis` only |
| Learning areas | Approved: none; blocked: `envelope`, `site`, `space` |
| Canonical front | `east` |
| Semantic outcome | `rejected` |
| Sparse corrections | 0 |
| Evidence reuse | Reused the checked McBuild terms baseline; independently checked this artifact's attribution, four screenshots, raw directional projections, and source-bound identity |
| Source/license investigation minutes | 3 |
| Semantic review minutes | 8 |
| Correction minutes | 0 |
| Total review minutes | 11; excludes review-pack generation, baseline tests, and dataset rebuild time |

### Evidence

- Source page: <https://mcbuild.org/schematics/18505:tavern>
- Site terms, updated 2026-06-28: <https://mcbuild.org/posts/terms>
- The source page publishes the item `By fiavando` but does not separately identify the original designer or schematic creator.
- The site terms baseline remains unchanged: without prior written permission, it prohibits automated collection, corpus construction, and using service content or data to develop, train, fine-tune, evaluate, or improve AI/ML models, systems, or datasets.

### Semantic decision

The dedicated source front view shows centered double doors, symmetric timber posts, and a dominant gable. These features match the raw +X projection, recorded as canonical `east`; the prior `south` value was only the unreviewed diagnostic default. The 17×17×20 source is sparsely sampled into the 64³ target, leaving all 515 vertical-circulation cells as disconnected singletons across the normalized volume; 224 overlap roof labels and no cell is labeled circulation. The extraction still fails entrance, circulation, usable-space, roof, floor-continuity, and vertical-circulation checks after 1,862 repair actions. Correcting this would require broad relabeling or extractor changes, so no sparse correction was approved and all three learning areas remain blocked.

### Readiness impact

- Explicit pilot outcomes: 3/6
- Training-eligible pilot cases: 0
- Semantic-accepted pilot cases: 0
- Ready for M3 real-data training: no

## Review 4: Watermill

| Field | Value |
| --- | --- |
| Case ID | `house-watermill` |
| Source group | `mcbuild.org` |
| Source SHA-256 | `7c11b9e15f8639be23dc895ce8eef1ff454045fc38e1e8dd37c757b133e70411` |
| Split | `train` (unchanged fixed split) |
| Reviewed by | `stage7-curator-01` |
| Reviewed at | `2026-07-13T08:48:51.299Z` |
| Source attribution | Original designer unknown; page publication account `fiavando` |
| Governance outcome | `research-only`; license `restricted`; `local-analysis` only |
| Learning areas | Approved: none; blocked: `envelope`, `site`, `space` |
| Canonical front | `west` |
| Semantic outcome | `rejected` |
| Sparse corrections | 0 |
| Evidence reuse | Reused the checked McBuild terms baseline; independently checked this artifact's attribution, three screenshots, raw directional projections, and source-bound identity |
| Source/license investigation minutes | Approximately 2 |
| Semantic review minutes | Approximately 5 |
| Correction minutes | 0 |
| Total review minutes | Approximately 7; excludes review-pack generation, tests, and dataset rebuild time |

### Evidence

- Source page: <https://mcbuild.org/schematics/18506:watermill>
- Site terms, updated 2026-06-28: <https://mcbuild.org/posts/terms>
- The source page publishes the item `By fiavando` but does not separately identify the original designer or schematic creator.
- The site terms baseline remains unchanged: without prior written permission, it prohibits automated collection, corpus construction, and using service content or data to develop, train, fine-tune, evaluate, or improve AI/ML models, systems, or datasets.

### Semantic decision

The source front with two upper windows, a ground-level entrance, the cart and water feature on the left, and an attached canopy on the right matches the raw -X projection, recorded as canonical `west`; the prior `south` value was only the unreviewed diagnostic default. The 23×14×15 source is sparsely sampled into the 64³ target, leaving all 80 vertical-circulation cells as disconnected singletons; 11 overlap roof labels and no cell is labeled circulation. The extraction still fails circulation, entrance, floor-continuity, roof, usable-space, and vertical-circulation checks after 1,008 repair actions. Correcting this would require broad relabeling or extractor changes, so no sparse correction was approved and all three learning areas remain blocked.

### Readiness impact

- Explicit pilot outcomes: 4/6
- Training-eligible pilot cases: 0
- Semantic-accepted pilot cases: 0
- Ready for M3 real-data training: no
