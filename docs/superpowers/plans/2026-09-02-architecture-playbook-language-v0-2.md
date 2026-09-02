# Architecture Language v0.2 Implementation Plan

**Goal:** Connect the P7 advisory overlay to `construction_method_v1` through a bounded, versioned semantic plan while preserving P5 authority, playbook-off bytes, and portable relative-coordinate export.

**Architecture:** A pure runtime module validates and classifies all 123 P7 entries, selects only prompt-relevant residential knowledge, and emits semantic instructions with relative roles and constraints. A whitelist adapter applies supported instructions to existing architecture/build-spec planning seams before the current planner and deterministic compilers run. The resulting plan and applied-operation trace travel inside existing architecture semantics and are projected into `blueprint.json`, `architecture_language.json`, and `run_report.md`; advisory and QA-only rows never enter P5 repair compilation.

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

- [ ] Write a failing test proving all 123 overlay entries receive exactly one allowed executable/preference/check/advisory/unsupported classification, unknown overlays fail closed, and a modern lakeside residential brief selects only literal known IDs in overlay order.
- [ ] Run the narrow test and confirm the missing module failure.
- [ ] Implement the exact schema, overlay validation boundary, explicit capability overrides, conservative advisory default, keyword/relationship selector, and deep-frozen output.
- [ ] Re-run the narrow test and commit the green capability boundary.

### Task 2: Existing-workflow semantic adapter

**Files:**
- Modify: `src/playbook/runtime/architectureLanguageV02.js`
- Modify: `src/construction/designStages.js`
- Test: `test/architectureLanguageV02.test.js`

- [ ] Add failing behavior tests showing the selected modern waterfront slice locks the existing `waterfront-stepped-estate` massing preference, requests the existing flat/parapet roof semantics, preserves user constraints, contains no coordinate/block/command fields, and produces stable applied-operation rows.
- [ ] Apply only whitelisted semantic patches before the existing planner/creative-design stages; leave unimplemented concepts as preferences, QA-only, advisory-only, or unsupported.
- [ ] Re-run the narrow tests and commit the adapter.

### Task 3: Execute integration and trace artifacts

**Files:**
- Modify: `src/playbook/execute/orchestrator.js`
- Modify: `src/construction/workflow.js`
- Test: `test/architectureLanguageV02.test.js`
- Test: `test/playbookExecuteOrchestrator.test.js`

- [ ] Add failing integration tests proving execute mock loads the canonical overlay, the same prompt/seed yields identical language and blueprint semantics, the plan records knowledge-to-stage-to-operation traceability, and reports expose the exact selected IDs.
- [ ] Build the language plan once per candidate, pass it through existing architecture semantics, project it into blueprint/report, and write `architecture_language.json` beside existing artifacts.
- [ ] Ensure the datapack compiler consumes only the resulting validated semantic runtime and remains relative-coordinate only.
- [ ] Re-run focused execute and export tests and commit the integration.

### Task 4: Compatibility, generation evidence, and documentation

**Files:**
- Modify: `docs/architecture-playbook/README.md`
- Modify: `docs/architecture-playbook/manual/p7-expansion-v0.2.md`
- Create: `docs/architecture-playbook/reports/architecture-language-v0.2.md`
- Test: `test/playbookExecuteOffCompatibility.test.js`
- Test: `test/playbookV01Compiler.test.js`

- [ ] Run focused off-mode and six-episode golden regressions.
- [ ] Run two identical playbook-on mock generations and one playbook-off generation for the representative residential brief.
- [ ] Reopen blueprint, language, report, pack metadata, and function files; compare hashes and verify all commands are relative.
- [ ] Document the exact capability categories, executable mappings, evidence artifacts, compatibility boundary, and remaining unsupported work.
- [ ] Commit documentation and evidence descriptions without committing `out/`.

### Task 5: Review and final verification

- [ ] Request an independent specification review against the governing designs and this plan.
- [ ] Request an independent quality/security review of the diff and artifact boundaries.
- [ ] Fix every valid critical or important finding with a failing test first.
- [ ] Run the complete relevant test set, representative mock commands, artifact inspection, and `git status`.
- [ ] Commit the final clean checkpoint and report exact commands, results, hashes, commits, remaining work, and one next command.
