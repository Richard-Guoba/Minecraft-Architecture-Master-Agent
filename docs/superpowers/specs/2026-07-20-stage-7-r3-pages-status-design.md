# Stage 7 R3 GitHub Pages Status Design

**Date:** 2026-07-20  
**Status:** approved for implementation

## Goal

Refresh the English GitHub Pages homepage so its Stage 7 description matches the repository's public, verifiable state before the current branch is published and fast-forwarded to `main`.

## Truth constraints

- Keep the existing project name, layout, commands, completed Stage 1–6 claims, and M3 fixture-only foundation.
- Describe R3 as *public NBT pilot tooling ready*, not as a completed public acquisition or training run.
- State that the next public-data task is a metadata-only slate of five primary and three reserve candidates.
- State that Dataset v3 real-data admission remains `false / 0` and that the site makes no claim about private experiment quality or metrics.
- Do not add candidate names, private source details, private run counts, metrics, checkpoints, URLs, or generated assets.
- Do not change runtime code, dataset gates, or GitHub Pages infrastructure.

## Page changes

`docs/index.html` will receive four aligned English copy updates:

1. The document metadata and hero copy will describe the hybrid construction pipeline plus its auditable, gated Stage 7 research lane.
2. The latest-stage metric will identify R3 public-pilot tooling readiness, the pending `5+3` metadata nomination, and the still-closed formal real-data gate.
3. The Stage 7 capability list will retain M3 fixture-only evidence and add the exact R3 bounded-pilot readiness boundary.
4. The Stage 7 roadmap item will describe the progression from fixture validation to R3 tooling, while explicitly reserving acquisition, human review, Dataset admission, and training for later authorized stages.

## Regression protection

`test/docsProjectStatus.test.js` will assert the new public R3 wording alongside the existing completed Stage 5/6 and Stage 7 governance assertions. The existing Node test suite remains the verification command for this static documentation change.

## Publishing sequence

After the static-page test succeeds, commit only the page, its test, and this design/implementation documentation. Push the current branch, fast-forward `main` to that verified branch tip, and push `main`. This sequence requires an authenticated GitHub CLI and a clean worktree; it creates no generated artifacts or pull request.
