# Construction Workflow v0.3 Implementation Plan

**Goal:** Make Architecture Language v0.2 materially affect massing, structure, roof, facade, interior, and site geometry, with deterministic result traceability, hard QA, and one bounded local repair.

**Spec:** `docs/superpowers/specs/2026-09-02-construction-workflow-v0-3-design.md`

## Constraints

- Extend `construction_method_v1`; do not introduce a parallel generator.
- Keep P5 rules/registry/budget, playbook-off, golden behavior, mock mode, format 48, and relative coordinates unchanged.
- Derive geometry from current build/volume/door/room dimensions; do not invent subtitle thresholds.
- Run Node tests only as `npm test -- <test arguments>` with the Linux hard-memory backend.

### Task 1: Language capabilities and semantic handoffs

- [x] Write failing selector/application tests for medieval and compact slices and explicit negations.
- [x] Promote only capabilities backed by existing deterministic agents.
- [x] Feed structure, roof, facade, BSP, decorator, and site through existing semantic fields.
- [x] Run focused tests and commit.

### Task 2: Geometry and ordering

- [x] Write failing tests for derived structural bays, per-volume roof evidence, facade assemblies, function-first/porous partitions, furniture-first ordering, and route grounding.
- [x] Implement the smallest changes in existing agents/builders.
- [x] Prove same seed/prompt yields identical operations and evidence.
- [x] Run focused tests and commit.

### Task 3: Construction trace, QA, and bounded repair

- [x] Write failing tests that detect a broken selected-operation handoff and a missing route threshold.
- [x] Derive authoritative result rows from runtime plans and actual modules.
- [x] Add the hard workflow QA check and one idempotent threshold repair.
- [x] Render result trace in the existing report and commit.

### Task 4: Three-scenario evidence and compatibility

- [x] Generate modern lakeside, medieval multi-volume, and compact residential mock scenarios twice each.
- [x] Compare operations, module counts, workflow rows, QA, scorecards, and artifact hashes.
- [x] Run focused P5, off-mode, golden, format-48, relative-command, and no-world-write regressions.
- [x] Write the v0.3 implementation report and commit.

### Task 5: Review and final verification

- [ ] Request independent specification review.
- [ ] Request independent quality/security review.
- [ ] Resolve every valid critical/important finding with a failing test first.
- [ ] Run the full test suite, final scenario checks, and clean-worktree verification.
- [ ] Commit all scoped work and report exact evidence and next command; do not push without a new explicit request.
