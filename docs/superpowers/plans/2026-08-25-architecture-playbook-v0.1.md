# Architecture Playbook v0.1 P3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile the 21 P2 evidence candidates into a deterministic, advisory-only Minecraft architecture playbook v0.1 with reviewed rule cards, a human manual, terminology, a coverage matrix, and an automated P3 gate.

**Architecture:** A strict P3 admission policy supplies editorial organization and inert future-runtime projections without changing any P2 architectural claim. A deterministic compiler reads only committed P2 public artifacts, derives immutable `ReviewedRuleCard` records, renders five managed public artifacts, and verifies them byte-for-byte through a read-only `check` command. Nothing imports or mutates the production construction pipeline.

**Tech Stack:** Node.js 20+ ESM, `node:test`, canonical JSON/JSONL, generated Markdown, atomic filesystem writes, existing P2 validators and `loadP2PublicCorpus`.

**Spec:** `docs/superpowers/specs/2026-08-25-architecture-playbook-v0.1-design.md`

## Global Constraints

- The only school is `heihui-jileniao`; human-facing copy uses 黑辉极乐鸟.
- P3 consumes committed P2 public artifacts only and never reads `.local/architecture-playbook/`.
- Exactly 21 candidates are admitted: 15 `core-procedure`, 6 `case-pattern`.
- Every reviewed card remains `authority: advisory`, `maturity: candidate`, `admission_status: admitted-advisory`, and `effect_validation_status: not-tested`.
- P3 knowledge coverage is partial for `brief`, `massing`, `structure`, `roof`, and `facade`; runtime authority remains `none` for every layer.
- `space`, `materials`, `interior`, and `scene` stay `not-covered`.
- P3 does not modify `src/construction/`, `src/pipeline.js`, or `src/index.js`.
- Managed outputs contain no private paths, full transcripts, source frames, absolute filesystem paths, or invented numeric parameters.
- Every production-code behavior is developed red-green-refactor and every task ends in a focused verification and commit.

## File Map

| Path | Responsibility |
| --- | --- |
| `src/playbook/manual/p3AdmissionPolicy.js` | Validate the exact editorial policy, allowed paths, terminology, and layer coverage. |
| `src/playbook/manual/reviewedRuleCard.js` | Hash P2 candidates and derive/validate immutable advisory P3 cards. |
| `src/playbook/manual/playbookV01Compiler.js` | Build the five deterministic artifacts and expose the P3 audit. |
| `src/runArchitecturePlaybookManual.js` | Parse `build/check`, install managed outputs atomically with rollback, and print safe summaries. |
| `docs/architecture-playbook/rules/schools/heihui-jileniao/admission-v0.1.json` | The only human-edited P3 organization and projection policy. |
| `docs/architecture-playbook/manual/v0.1.md` | Generated human-readable playbook. |
| `docs/architecture-playbook/manual/terminology-v0.1.json` | Generated resolved and unresolved terminology. |
| `docs/architecture-playbook/manual/coverage-v0.1.json` | Generated nine-layer coverage matrix. |
| `docs/architecture-playbook/rules/schools/heihui-jileniao/reviewed-rules-v0.1.jsonl` | Generated 21-card rule deck. |
| `docs/architecture-playbook/rules/schools/heihui-jileniao/rule-index-v0.1.json` | Generated indexes and source-corpus hash. |
| `docs/architecture-playbook/reports/p3-playbook-v0.1.md` | Factual P3 gate report. |
| `test/playbookP3AdmissionPolicy.test.js` | Admission-policy boundary tests. |
| `test/playbookReviewedRuleCard.test.js` | Rule derivation and immutability tests. |
| `test/playbookV01Compiler.test.js` | Determinism, rendering, managed-write, and drift tests. |
| `test/playbookP3Gate.test.js` | End-to-end checked-in P3 audit. |

---

### Task 1: Freeze and Validate the P3 Admission Policy

**Files:**
- Create: `src/playbook/manual/p3AdmissionPolicy.js`
- Create: `test/playbookP3AdmissionPolicy.test.js`
- Create: `docs/architecture-playbook/rules/schools/heihui-jileniao/admission-v0.1.json`

**Interfaces:**
- Consumes: `candidateRuleIds: Set<string>` from the P2 public corpus.
- Produces: `validateP3AdmissionPolicy(value, { candidateRuleIds }): Readonly<P3AdmissionPolicy>`.
- Exports: `P3_ALLOWED_FIELD_PATHS`, `P3_LAYER_ORDER`, and `P3_MANAGED_ARTIFACT_PATHS` as deeply frozen constants.

- [ ] **Step 1: Write the failing policy tests**

Create tests that establish the exact boundary:

```js
test('P3 admission covers all candidates as fifteen core and six case rules', () => {
  const policy = validateP3AdmissionPolicy(policyFixture(), {
    candidateRuleIds: new Set(CANDIDATE_IDS)
  });
  assert.equal(policy.rule_admissions.length, 21);
  assert.equal(policy.rule_admissions.filter(
    (item) => item.teaching_role === 'core-procedure'
  ).length, 15);
  assert.equal(policy.rule_admissions.filter(
    (item) => item.teaching_role === 'case-pattern'
  ).length, 6);
  assert.equal(Object.isFrozen(policy.rule_admissions[0].runtime_projection), true);
});

test('P3 admission rejects executable authority and uncovered projection paths', () => {
  const authority = policyFixture();
  authority.rule_admissions[0].decision = 'executable';
  assert.throws(
    () => validateP3AdmissionPolicy(authority, policyContext()),
    /PLAYBOOK_P3_ADMISSION_DECISION_INVALID/u
  );

  const layer = policyFixture();
  layer.rule_admissions[0].runtime_projection.proposal_fields = ['materials.palette'];
  assert.throws(
    () => validateP3AdmissionPolicy(layer, policyContext()),
    /PLAYBOOK_P3_PROJECTION_FIELD_INVALID/u
  );
});
```

Also reject missing, duplicate, or unknown rule IDs; reordered/duplicate chapters; 14/7 role drift; duplicate projection entries; invalid check/repair identifiers; runtime authority other than `none`; and terminology references to unknown rule IDs.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/playbookP3AdmissionPolicy.test.js`

Expected: FAIL because `src/playbook/manual/p3AdmissionPolicy.js` does not exist.

- [ ] **Step 3: Implement the strict policy validator**

Implement exact-field validation, stable error codes, structured cloning, and recursive freezing. Freeze these exact constants:

```js
export const P3_LAYER_ORDER = Object.freeze([
  'brief', 'massing', 'space', 'structure', 'roof',
  'facade', 'materials', 'interior', 'scene'
]);

export const P3_MANAGED_ARTIFACT_PATHS = Object.freeze([
  'docs/architecture-playbook/manual/v0.1.md',
  'docs/architecture-playbook/manual/terminology-v0.1.json',
  'docs/architecture-playbook/manual/coverage-v0.1.json',
  'docs/architecture-playbook/rules/schools/heihui-jileniao/reviewed-rules-v0.1.jsonl',
  'docs/architecture-playbook/rules/schools/heihui-jileniao/rule-index-v0.1.json'
]);
```

The allowed field paths are the 28 exact paths listed in Design §7.3. Check identifiers match `^check:(brief|massing|structure|roof|facade):[a-z0-9][a-z0-9-]*$`; repairs use the equivalent `repair:` prefix.

- [ ] **Step 4: Author the complete admission policy**

Use the ten chapters in Design §7.1 and the following exact rule mapping:

| Rule | Role | Chapters | Coverage | Input signals | Proposal fields | Check | Repair | Invalidates |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `rule:structure.compose-three-volumes` | core | massing-foundations | advisory-partial | `brief.prompt`, `massing.volumes` | `massing.primary_volume_id`, `massing.secondary_volume_ids`, `massing.volume_relations` | `check:massing:three-volume-composition` | `repair:massing:resize-or-reposition-volume` | structure, roof, facade |
| `rule:structure.layer-volumes-to-reduce-blankness` | core | massing-foundations, failure-and-repair | advisory-partial | `brief.primary_viewpoint`, `massing.volumes`, `massing.blank_plane_regions` | `massing.volume_relations` | `check:massing:continuous-blank-plane` | `repair:massing:adjust-volume-overlap` | structure, roof, facade |
| `rule:structure.create-primary-secondary-hierarchy` | core | hierarchy-and-structure | advisory-partial | `massing.volumes` | `massing.primary_volume_id`, `massing.secondary_volume_ids` | `check:massing:primary-secondary-hierarchy` | `repair:massing:strengthen-primary-volume` | structure, roof, facade |
| `rule:structure.keep-support-volumes-subordinate` | core | hierarchy-and-structure | advisory-partial | `massing.primary_volume_id`, `massing.secondary_volume_ids` | `massing.volume_relations` | `check:massing:subordinate-support-volume` | `repair:massing:reduce-support-volume-prominence` | structure, roof, facade |
| `rule:roof.border-with-material-contrast` | core | roof-form | advisory-partial | `roof.profile`, `roof.surface_regions` | `roof.border_role` | `check:roof:border-readability` | `repair:roof:restore-continuous-border` | facade |
| `rule:roof.scale-slope-to-massing` | core | roof-form | advisory-partial | `massing.volumes`, `roof.span` | `roof.slope_pattern`, `roof.profile` | `check:roof:slope-massing-fit` | `repair:roof:change-run-rise-pattern` | facade |
| `rule:roof.break-large-flat-plane` | core | roof-form, failure-and-repair | advisory-partial | `roof.surface_regions`, `massing.volume_relations` | `roof.secondary_roofs`, `roof.profile` | `check:roof:large-flat-plane` | `repair:roof:add-structural-roof-break` | facade |
| `rule:facade.frame-before-openings` | core | facade-layers | advisory-partial | `structure.frames`, `facade.bay_grid` | `facade.openings` | `check:facade:opening-inside-frame` | `repair:facade:rebuild-bay-before-opening` | none |
| `rule:facade.offset-frame-for-depth` | core | facade-layers | advisory-partial | `facade.bay_grid`, `facade.frame_depth`, `facade.infill_depth` | `facade.frame_depth`, `facade.infill_depth` | `check:facade:frame-infill-depth` | `repair:facade:offset-frame-or-infill` | none |
| `rule:facade.partition-large-wall` | core | facade-layers | advisory-partial | `structure.frames`, `facade.bay_grid` | `facade.bay_grid`, `facade.openings` | `check:facade:large-wall-partition` | `repair:facade:align-partition-to-structure` | none |
| `rule:facade.break-repetitive-bays` | core | facade-layers, failure-and-repair | advisory-partial | `facade.bay_grid`, `facade.motif_signatures` | `facade.variation_axes` | `check:facade:repetitive-bay-signature` | `repair:facade:vary-bay-preserve-motif` | none |
| `rule:medieval.extend-only-needed-facades` | core | medieval-residence | advisory-partial | `brief.prompt`, `structure.overhangs`, `massing.volumes` | `structure.overhangs`, `structure.support_paths` | `check:structure:purposeful-overhang` | `repair:structure:remove-or-support-overhang` | roof, facade |
| `rule:medieval.show-load-path` | core | medieval-residence, failure-and-repair | advisory-partial | `structure.frames`, `structure.load_paths`, `structure.overhangs` | `structure.support_paths` | `check:structure:visible-load-path` | `repair:structure:connect-support-path` | roof, facade |
| `rule:medieval.align-roof-with-overhang` | core | medieval-residence, roof-form | advisory-partial | `structure.overhangs`, `structure.support_paths`, `roof.ridge_axis` | `roof.ridge_axis`, `roof.profile` | `check:roof:overhang-axis-alignment` | `repair:roof:realign-ridge-or-support` | facade |
| `rule:medieval.use-stone-base-for-height` | core | medieval-residence | advisory-partial | `massing.volumes`, `structure.load_paths` | `structure.base_strategy`, `structure.support_paths` | `check:structure:tall-timber-base-weight` | `repair:structure:add-or-widen-base` | roof, facade |
| `rule:case.join-crossed-massing-with-tower` | case | complete-case | manual-example-only | `massing.volumes`, `massing.volume_relations` | `massing.volume_relations`, `massing.primary_volume_id` | `check:massing:tower-joint-continuity` | `repair:massing:move-tower-to-joint` | none |
| `rule:case.repeat-motif-for-unity` | case | complete-case, failure-and-repair | manual-example-only | `facade.bay_grid`, `facade.motif_signatures` | `facade.motif_signatures`, `facade.variation_axes` | `check:facade:motif-unity-with-bay-variation` | `repair:facade:separate-motif-from-bay-template` | none |
| `rule:case.use-greenery-as-composition` | case | complete-case | manual-example-only | `brief.primary_viewpoint`, `facade.vegetation_path` | `facade.vegetation_path` | `check:facade:connected-vegetation-path` | `repair:facade:connect-or-prune-vegetation` | none |
| `rule:case.allocate-detail-by-viewpoint` | case | complete-case, agent-workflow | manual-example-only | `brief.primary_viewpoint`, `brief.detail_budget` | `brief.detail_budget` | `check:brief:viewpoint-detail-allocation` | `repair:brief:move-detail-budget-to-primary-view` | none |
| `rule:case.balance-warm-mass-with-dark-roof` | case | complete-case | manual-example-only | `roof.surface_regions`, `facade.motif_signatures` | `roof.border_role`, `roof.surface_regions` | `check:roof:warm-dark-visual-balance` | `repair:roof:reduce-dark-secondary-area` | none |
| `rule:case.compose-context-depth` | case | complete-case | manual-example-only | `brief.primary_viewpoint`, `brief.scene_intent` | `brief.scene_intent` | `check:brief:foreground-background-intent` | `repair:brief:restore-unobstructed-scene-depth` | none |

In JSON, use `teaching_role: core-procedure|case-pattern`, use the full chapter IDs, and encode `none` invalidation as `[]`.

Add the 15 resolved terms and five unresolved groups from Design §10. Add all nine coverage rows from Design §11 with `runtime_authority: none`.

- [ ] **Step 5: Verify GREEN**

Run: `node --test test/playbookP3AdmissionPolicy.test.js`

Expected: all policy contract, mapping, terminology, and coverage tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/playbook/manual/p3AdmissionPolicy.js test/playbookP3AdmissionPolicy.test.js docs/architecture-playbook/rules/schools/heihui-jileniao/admission-v0.1.json
git commit -m "feat(playbook): freeze v0.1 admission policy"
```

### Task 2: Derive Immutable Reviewed Rule Cards

**Files:**
- Create: `src/playbook/manual/reviewedRuleCard.js`
- Create: `test/playbookReviewedRuleCard.test.js`

**Interfaces:**
- Consumes: one validated P2 `PlaybookRuleCandidate` and its validated P3 admission.
- Produces: `deriveReviewedRuleCard(candidate, admission, { playbookVersion }): Readonly<ReviewedRuleCard>`.
- Produces: `validateReviewedRuleCard(value, { candidate, admission }): Readonly<ReviewedRuleCard>`.
- Produces: `buildReviewedRuleCards(candidates, policy): ReadonlyArray<ReviewedRuleCard>`.

- [ ] **Step 1: Write failing lineage and authority tests**

```js
test('reviewed card preserves candidate content and adds advisory metadata', () => {
  const card = deriveReviewedRuleCard(candidateFixture(), admissionFixture(), {
    playbookVersion: '0.1.0'
  });
  assert.equal(card.rule_id, candidateFixture().rule_id);
  assert.deepEqual(card.action, candidateFixture().action);
  assert.deepEqual(card.evidence_ids, candidateFixture().evidence_ids);
  assert.equal(card.authority, 'advisory');
  assert.equal(card.maturity, 'candidate');
  assert.equal(card.effect_validation_status, 'not-tested');
  assert.match(card.source_candidate_sha256, /^[a-f0-9]{64}$/u);
});

test('reviewed card rejects changed architectural claims', () => {
  const card = structuredClone(reviewedCardFixture());
  card.action = 'Invented replacement action';
  assert.throws(
    () => validateReviewedRuleCard(card, cardContext()),
    /PLAYBOOK_P3_CANDIDATE_CONTENT_DRIFT/u
  );
});
```

Also test stable hashing across object-key order, deep freezing, unique output rule IDs, exact 21-card order matching candidate JSONL, rejection of executable authority, and rejection of a policy/candidate rule-ID mismatch.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/playbookReviewedRuleCard.test.js`

Expected: FAIL because `reviewedRuleCard.js` does not exist.

- [ ] **Step 3: Implement canonical candidate hashing and derivation**

Use recursively key-sorted JSON for `source_candidate_sha256`. Copy these fields exactly from the candidate: source episodes, evidence IDs, claim type, design layer, intent, applicability, prerequisites, exclusions, action, parameters, implementation hints, positive signs, failure modes, repairs, author reason, confidence, and conflict IDs.

Add only the fixed P3 fields and the four policy fields (`teaching_role`, `chapter_ids`, `runtime_projection`, `editorial_note`). Reject unknown fields and freeze every nested array/object.

- [ ] **Step 4: Verify GREEN and contract interaction**

Run:

```bash
node --test test/playbookReviewedRuleCard.test.js test/playbookEvidenceContracts.test.js test/playbookP3AdmissionPolicy.test.js
```

Expected: P2 contracts and P3 derivation all pass without changing P2 candidates.

- [ ] **Step 5: Commit**

```bash
git add src/playbook/manual/reviewedRuleCard.js test/playbookReviewedRuleCard.test.js
git commit -m "feat(playbook): derive advisory reviewed rule cards"
```

### Task 3: Build the Deterministic Playbook v0.1 Compiler

**Files:**
- Create: `src/playbook/manual/playbookV01Compiler.js`
- Create: `test/playbookV01Compiler.test.js`

**Interfaces:**
- Consumes: `{ corpus, policy }` validated by Tasks 1–2.
- Produces: `compilePlaybookV01({ corpus, policy }): Readonly<PlaybookCompilation>`.
- Produces: `renderPlaybookManual({ cards, terminology, coverage, corpus, policy }): string`.
- Produces: `auditPlaybookV01(compilation, { managedArtifactDriftCount = 0 } = {}): Readonly<P3Audit>`.
- `PlaybookCompilation.artifacts` is an object keyed by the five exact managed relative paths, with UTF-8 strings ending in one newline.

- [ ] **Step 1: Write failing compiler tests**

```js
test('compiler emits five stable artifacts with all twenty-one rules', async () => {
  const input = await checkedInCompilerFixture();
  const first = compilePlaybookV01(input);
  const second = compilePlaybookV01(input);
  assert.deepEqual(first.artifacts, second.artifacts);
  assert.equal(first.summary.reviewed_rule_count, 21);
  assert.equal(first.summary.core_procedure_count, 15);
  assert.equal(first.summary.case_pattern_count, 6);
  assert.deepEqual(
    Object.keys(first.artifacts).sort(),
    [...P3_MANAGED_ARTIFACT_PATHS].sort()
  );
});

test('manual exposes rule and evidence lineage without private leakage', async () => {
  const compilation = compilePlaybookV01(await checkedInCompilerFixture());
  const manual = compilation.artifacts['docs/architecture-playbook/manual/v0.1.md'];
  for (const card of compilation.cards) {
    assert.match(manual, new RegExp(escapeRegExp(card.rule_id), 'u'));
    for (const evidenceId of card.evidence_ids) {
      assert.match(manual, new RegExp(escapeRegExp(evidenceId), 'u'));
    }
  }
  assert.doesNotMatch(manual, /\.local\/|draft-transcript|"segments"|"words"|\/home\//u);
});
```

Add tests for exact chapter order, 15 resolved terms, five unresolved groups, nine coverage rows, preserved conflict `conflict:motif-unity-vs-bay-repetition`, all layers having `runtime_authority: none`, exact source-corpus hash changes, canonical JSONL, and the gate counters from Design §15.4.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/playbookV01Compiler.test.js`

Expected: FAIL because `playbookV01Compiler.js` does not exist.

- [ ] **Step 3: Implement compilation and stable hashes**

Load no files inside the pure compiler. Calculate `source_corpus_hash` over these already-validated values in this order: P2 evidence index, candidates, conflicts, unknowns, P3 policy. Use canonical key sorting while preserving array order.

Build reviewed cards in candidate JSONL order. Render JSON with two-space indentation and one newline; render JSONL with one canonical object per line and one final newline.

- [ ] **Step 4: Render the human manual**

Use all ten policy chapters. For every rule section render:

```markdown
### <intent> (`<rule_id>`)

- 类型：核心程序 / 案例模式
- 层：`<design_layer>`
- 权限：建议；效果尚未验证
- 证据：`<evidence_id>`（课次 `<BVID>`）
- 适用：...
- 前置：...
- 动作：...
- 观察：...
- 失败：...
- 修复：...
```

The failure-and-repair chapter indexes rules already explained instead of duplicating claims. The agent-workflow chapter describes only read → match → propose → observe → recommend; it states that P3 cannot apply patches. The unknown chapter includes all seven P2 unknown IDs and the five unresolved terminology groups.

- [ ] **Step 5: Implement the pure audit**

Return exact counters:

```js
{
  p2_gate_status: 'passed',
  reviewed_rule_count: 21,
  core_procedure_count: 15,
  case_pattern_count: 6,
  dangling_reference_count: 0,
  cross_school_count: 0,
  authority_escalation_count: 0,
  maturity_escalation_count: 0,
  covered_runtime_layer_count: 0,
  public_leak_count: 0,
  managed_artifact_drift_count: 0,
  gate: { status: 'passed', next_phase: 'P4', blocker_codes: [] }
}
```

Derive every compiler-owned counter from compiled objects; do not hardcode zero before inspecting the artifacts. The pure compiler defaults `managedArtifactDriftCount` to zero for in-memory tests, while the checked-in audit in Task 6 must pass the actual result returned by `checkManagedPlaybookArtifacts`.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
node --test test/playbookV01Compiler.test.js test/playbookReviewedRuleCard.test.js test/playbookP3AdmissionPolicy.test.js
```

Expected: compiler determinism, content, leakage, coverage, and audit tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/playbook/manual/playbookV01Compiler.js test/playbookV01Compiler.test.js
git commit -m "feat(playbook): compile deterministic playbook v0.1"
```

### Task 4: Add Safe Build and Check Commands

**Files:**
- Create: `src/runArchitecturePlaybookManual.js`
- Create: `test/architecturePlaybookManualCli.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `parseArchitecturePlaybookManualArgs(argv): { command: 'build'|'check' }`.
- Produces: `writeManagedPlaybookArtifacts({ projectRoot, artifacts, fsImpl? }): Promise<WriteSummary>`.
- Produces: `checkManagedPlaybookArtifacts({ projectRoot, artifacts }): Promise<CheckSummary>`.
- CLI obtains `corpus` from `loadP2PublicCorpus`, validates `admission-v0.1.json`, compiles in memory, then executes the selected command.

- [ ] **Step 1: Write failing CLI and rollback tests**

```js
test('manual CLI accepts build and check only', () => {
  assert.deepEqual(parseArchitecturePlaybookManualArgs(['build']), { command: 'build' });
  assert.deepEqual(parseArchitecturePlaybookManualArgs(['check']), { command: 'check' });
  assert.throws(
    () => parseArchitecturePlaybookManualArgs(['build', '--output', '/tmp/x']),
    /PLAYBOOK_MANUAL_ARGUMENT_INVALID/u
  );
});

test('managed writer restores installed files after a later rename failure', async () => {
  const fixture = await managedWriteFixture();
  await assert.rejects(
    writeManagedPlaybookArtifacts({
      ...fixture,
      fsImpl: failOnThirdInstallFs(fixture.fsImpl)
    }),
    /PLAYBOOK_MANUAL_INSTALL_FAILED/u
  );
  assert.deepEqual(await fixture.readAll(), fixture.originalBytes);
});
```

Also test lexical path containment, symlink escapes, missing/drifted `check` targets, no writes during `check`, fixed output order, safe stdout with counts/hashes only, and no private paths in errors.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/architecturePlaybookManualCli.test.js`

Expected: FAIL because the CLI module does not exist.

- [ ] **Step 3: Implement parsing, compilation loading, and fixed-path containment**

Reuse `resolvePrivatePlaybookPath` only for its algorithm if it can be generalized without naming or behavior confusion; otherwise implement a small fixed-public-target guard inside the CLI. The guard must resolve the project root, reject symlink parents escaping it, and accept only exact members of `P3_MANAGED_ARTIFACT_PATHS`.

Do not accept output flags, arbitrary paths, overwrite flags, or network options.

- [ ] **Step 4: Implement staged write, rollback, and check**

Before installation, read all originals and record missing targets. Write all temporary siblings with `wx`, sync and close them. Install in fixed path order. On failure, restore prior bytes with temporary siblings and atomic renames; remove targets that originally did not exist. If rollback fails, throw `PLAYBOOK_MANUAL_ROLLBACK_FAILED` with only managed relative paths.

`check` recompiles and byte-compares every target. Return sorted drift paths; the CLI exits nonzero with `PLAYBOOK_MANUAL_ARTIFACT_DRIFT` when any differ.

- [ ] **Step 5: Add package script and verify GREEN**

Add:

```json
"playbook:manual": "node src/runArchitecturePlaybookManual.js"
```

Run:

```bash
node --test test/architecturePlaybookManualCli.test.js test/architecturePlaybookEvidenceCli.test.js test/architecturePlaybookCourseCli.test.js
```

Expected: all three playbook CLIs pass and the existing private-path behavior remains unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/runArchitecturePlaybookManual.js test/architecturePlaybookManualCli.test.js package.json
git commit -m "feat(playbook): build and check managed manual artifacts"
```

### Task 5: Generate and Audit the Checked-In Playbook v0.1

**Files:**
- Create: `docs/architecture-playbook/manual/v0.1.md`
- Create: `docs/architecture-playbook/manual/terminology-v0.1.json`
- Create: `docs/architecture-playbook/manual/coverage-v0.1.json`
- Create: `docs/architecture-playbook/rules/schools/heihui-jileniao/reviewed-rules-v0.1.jsonl`
- Create: `docs/architecture-playbook/rules/schools/heihui-jileniao/rule-index-v0.1.json`

**Interfaces:**
- Consumes: the checked-in P2 corpus and `admission-v0.1.json` through the Task 4 CLI.
- Produces: the five byte-stable managed artifacts accepted by `playbook:manual check`.

- [ ] **Step 1: Build the managed artifacts**

Run: `npm run playbook:manual -- build`

Expected safe summary:

```text
playbook_status=created
playbook_version=0.1.0
reviewed_rule_count=21
core_procedure_count=15
case_pattern_count=6
artifact_count=5
```

- [ ] **Step 2: Check byte stability**

Run twice:

```bash
npm run playbook:manual -- check
npm run playbook:manual -- build
```

The first reports zero drift; the second reports `unchanged` for all five targets.

- [ ] **Step 3: Inspect public boundaries**

Run:

```bash
rg -n '\.local/architecture-playbook|draft-transcript|"segments"|"words"|/home/' docs/architecture-playbook/manual docs/architecture-playbook/rules/schools/heihui-jileniao/reviewed-rules-v0.1.jsonl docs/architecture-playbook/rules/schools/heihui-jileniao/rule-index-v0.1.json
git ls-files .local/architecture-playbook
```

Both commands must print nothing. Then manually check one card from each of massing, structure, roof, facade, medieval, and case-pattern groups against its P2 candidate.

- [ ] **Step 4: Run focused compilation verification**

Run:

```bash
node --test test/playbookP3AdmissionPolicy.test.js test/playbookReviewedRuleCard.test.js test/playbookV01Compiler.test.js test/architecturePlaybookManualCli.test.js
npm run playbook:manual -- check
git diff --check
```

Expected: all focused tests pass, managed artifacts have zero drift, and the diff check is silent.

- [ ] **Step 5: Commit generated public artifacts only**

```bash
git add docs/architecture-playbook/manual docs/architecture-playbook/rules/schools/heihui-jileniao/reviewed-rules-v0.1.jsonl docs/architecture-playbook/rules/schools/heihui-jileniao/rule-index-v0.1.json
git commit -m "docs(playbook): publish architecture playbook v0.1"
```

### Task 6: Publish the P3 Gate Report

**Files:**
- Create: `test/playbookP3Gate.test.js`
- Create: `docs/architecture-playbook/reports/p3-playbook-v0.1.md`
- Modify: `docs/architecture-playbook/README.md`

**Interfaces:**
- Consumes: checked-in P2 corpus, P3 admission policy, and five checked managed artifacts.
- Produces: `auditCheckedInPlaybookV01({ projectRoot }): Promise<Readonly<P3Audit>>` from `playbookV01Compiler.js`.
- Opens P4 only when every counter in Design §15.4 equals its required value.

- [ ] **Step 1: Write the failing end-to-end gate test**

```js
test('P3 checked-in playbook passes with no runtime authority', async () => {
  const audit = await auditCheckedInPlaybookV01({ projectRoot: ROOT });
  assert.equal(audit.p2_gate_status, 'passed');
  assert.equal(audit.reviewed_rule_count, 21);
  assert.equal(audit.core_procedure_count, 15);
  assert.equal(audit.case_pattern_count, 6);
  assert.equal(audit.dangling_reference_count, 0);
  assert.equal(audit.cross_school_count, 0);
  assert.equal(audit.authority_escalation_count, 0);
  assert.equal(audit.maturity_escalation_count, 0);
  assert.equal(audit.covered_runtime_layer_count, 0);
  assert.equal(audit.public_leak_count, 0);
  assert.equal(audit.managed_artifact_drift_count, 0);
  assert.equal(audit.gate.status, 'passed');
  assert.equal(audit.gate.next_phase, 'P4');
});
```

Also assert `src/playbook/manual` has no imports from `construction`, all five managed paths are tracked, and the four `not-covered` layers are present in both the coverage JSON and manual.

- [ ] **Step 2: Run the gate test and verify RED**

Run: `node --test test/playbookP3Gate.test.js`

Expected: FAIL until `auditCheckedInPlaybookV01` and the report-facing audit are complete.

- [ ] **Step 3: Implement the checked-in audit**

Load and validate the corpus and policy, compile in memory, call `checkManagedPlaybookArtifacts`, then call the pure audit with the drift count. Scan the five artifacts for leakage markers and scan imports under `src/playbook/manual/` for `construction/`. Return one immutable audit object; no writes.

- [ ] **Step 4: Write the factual report and update README**

The report includes source-corpus hash, counts by chapter/layer/role, terminology counts, nine-layer coverage, the one conflict, seven unknowns, exact test evidence, and the P4 decision. State explicitly that P3 has not generated or visually improved a house.

README current status links the manual, rule deck, coverage matrix, P3 report, design, and implementation plan.

- [ ] **Step 5: Run fresh focused and full verification**

Run:

```bash
node --test test/playbook*.test.js test/architecturePlaybookCourseCli.test.js test/architecturePlaybookEvidenceCli.test.js test/architecturePlaybookManualCli.test.js
npm run playbook:manual -- check
npm test
git diff --check
git ls-files .local/architecture-playbook
git status --short
```

Expected: all tests pass; manual check reports zero drift; diff check is silent; no private artifacts are tracked; status contains only intended P3 report/README/test/source changes before commit.

- [ ] **Step 6: Commit the P3 gate**

```bash
git add test/playbookP3Gate.test.js docs/architecture-playbook/reports/p3-playbook-v0.1.md docs/architecture-playbook/README.md src/playbook/manual/playbookV01Compiler.js
git commit -m "feat(playbook): complete playbook v0.1 gate"
```

## Review Checkpoints

- Checkpoint A, after Task 1: the policy maps all 21 candidates without architectural-content edits or authority escalation.
- Checkpoint B, after Task 3: the pure compiler emits deterministic in-memory artifacts and a truthful gate.
- Checkpoint C, after Task 5: the five checked-in artifacts rebuild byte-for-byte and leak no private source material.
- Checkpoint D, after Task 6: P4 opens only from the automated checked-in gate.

## Definition of Done

- The exact 21 P2 candidates derive into 21 immutable P3 cards with stable source hashes.
- Exactly 15 cards are core procedures and 6 are case patterns.
- Every card retains its conditions, action, observables, failure modes, repairs, evidence IDs, episode IDs, confidence, and conflicts.
- The human manual contains all ten chapters and every core claim links to a rule and Evidence ID.
- Terminology contains 15 resolved terms and five explicit unresolved groups without silent ASR repair.
- Coverage reports five `advisory-partial` knowledge layers, four `not-covered` layers, and zero runtime-authorized layers.
- The five managed artifacts are deterministic and accepted by the read-only check command.
- No P3 module imports or changes the production construction pipeline.
- No private media, transcript, frame, EvidencePack, private path, or source text is tracked.
- The P3 factual report states either an evidenced pass opening P4 or exact stable blocker codes.
