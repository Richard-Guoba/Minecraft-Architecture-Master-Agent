# Architecture Language v0.2 Implementation Plan

**Goal:** Connect the P7 advisory overlay to `construction_method_v1` through a bounded, versioned semantic plan while preserving P5 authority, playbook-off bytes, and portable relative-coordinate export.

**Architecture:** A pure runtime module validates and classifies all 123 P7 entries, selects only prompt-relevant residential knowledge, and emits semantic instructions with relative roles and constraints. A whitelist adapter applies supported instructions to existing architecture/build-spec planning seams before the current planner and deterministic compilers run. The resulting plan and applied-operation trace travel inside existing architecture semantics, are authoritative in `blueprint.json`, and are projected into `run_report.md`; advisory and QA-only rows never enter P5 repair compilation.

**Spec:** `docs/superpowers/specs/2026-09-01-architecture-playbook-mini-program-knowledge-expansion-design.md`

## Global constraints

- Keep `construction_method_v1` as the only generator and do not emit arbitrary absolute coordinates.
- Keep P5 reviewed rules and repair registry unchanged.
- Keep playbook-off and the frozen six-episode behavior unchanged.
- Load only the checked-in heihui-jileniao P7 overlay and verify its canonical hash.
- Generate Minecraft Java 1.21/1.21.1 format-48 portable datapacks with relative commands.
- Run Node tests only as `npm test -- <files> --test-reporter=spec` under the hard memory backend.

### Task 1: Capability catalog and relevant-knowledge selection

**Files:**
- Create: `src/playbook/runtime/architectureLanguageV02.js`
- Test: `test/architectureLanguageV02.test.js`

- [x] Write a failing test proving all 123 overlay entries receive exactly one allowed executable/preference/check/advisory/unsupported classification, unknown overlays fail closed, and a modern lakeside residential brief selects only literal known IDs in overlay order.
- [x] Run the narrow test and confirm the missing module failure.
- [x] Implement the exact schema, overlay validation boundary, explicit capability overrides, conservative advisory default, keyword/relationship selector, and deep-frozen output.
- [x] Re-run the narrow test and commit the green capability boundary.

### Task 2: Existing-workflow semantic adapter

**Files:**
- Modify: `src/playbook/runtime/architectureLanguageV02.js`
- Modify: `src/construction/designStages.js`
- Test: `test/architectureLanguageV02.test.js`

- [x] Add failing behavior tests showing the selected modern waterfront slice locks the existing `east-offset-glass-wing` massing preference, requests the existing flat/parapet roof semantics, preserves user constraints, contains no coordinate/block/command fields, and produces stable applied-operation rows.
- [x] Apply only whitelisted semantic patches before the existing planner/creative-design stages; leave unimplemented concepts as preferences, QA-only, advisory-only, or unsupported.
- [x] Re-run the narrow tests and commit the adapter.

### Task 3: Execute integration and trace artifacts

**Files:**
- Modify: `src/playbook/execute/orchestrator.js`
- Modify: `src/construction/workflow.js`
- Test: `test/architectureLanguageV02.test.js`
- Test: `test/playbookExecuteOrchestrator.test.js`

- [x] Add failing integration tests proving execute mock loads the canonical overlay, the same prompt/seed yields identical language and blueprint semantics, the plan records knowledge-to-stage-to-operation traceability, and reports expose the exact selected IDs.
- [x] Build the language plan once per candidate, pass it through existing architecture semantics, keep its authoritative trace in the blueprint, and project a human-readable view into the report.
- [x] Ensure the datapack compiler consumes only the resulting validated semantic runtime and remains relative-coordinate only.
- [x] Re-run focused execute and export tests and commit the integration.

### Task 4: Compatibility, generation evidence, and documentation

**Files:**
- Modify: `docs/architecture-playbook/README.md`
- Modify: `docs/architecture-playbook/manual/p7-expansion-v0.2.md`
- Create: `docs/architecture-playbook/reports/architecture-language-v0.2.md`
- Test: `test/playbookExecuteOffCompatibility.test.js`
- Test: `test/playbookV01Compiler.test.js`

- [x] Run focused off-mode and six-episode golden regressions.
- [x] Run two identical playbook-on mock generations and one playbook-off generation for the representative residential brief.
- [x] Reopen blueprint, its embedded language trace, report, pack metadata, and function files; compare hashes and verify all commands are relative.
- [x] Document the exact capability categories, executable mappings, evidence artifacts, compatibility boundary, and remaining unsupported work.
- [x] Commit documentation and evidence descriptions without committing `out/`.

### Task 5: Review and final verification

- [x] Request an independent specification review against the governing designs and this plan.
- [x] Request an independent quality/security review of the diff and artifact boundaries.
- [x] Fix every valid critical or important finding with a failing test first.
- [x] Run the complete relevant test set, representative mock commands, artifact inspection, and `git status`.
- [x] Commit the final clean checkpoint and report exact commands, results, hashes, commits, remaining work, and one next command.
