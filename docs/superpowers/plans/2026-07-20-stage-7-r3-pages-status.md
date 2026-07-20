# Stage 7 R3 Pages Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an accurate English GitHub Pages description of Stage 7 R3 readiness and fast-forward the verified branch to `main`.

**Architecture:** This is a static-documentation change. `docs/index.html` remains the GitHub Pages entry point and gains truthful R3 copy at the existing metadata, metric, capability, and roadmap surfaces. `test/docsProjectStatus.test.js` guards the exact public status wording without changing runtime, dataset, or Pages deployment behavior.

**Tech Stack:** Static HTML, Node.js built-in test runner, Git, GitHub CLI.

## Global Constraints

- Keep the existing project name, layout, commands, completed Stage 1–6 claims, and M3 fixture-only foundation.
- Describe R3 as public NBT pilot tooling ready, not as completed public acquisition or training.
- State that the next public-data task is a metadata-only five-primary, three-reserve nomination.
- State Dataset v3's formal real-data admission gate as `false / 0`; claim no private experiment quality or metrics.
- Do not disclose candidate names, private source details, private run counts, metrics, checkpoints, URLs, or generated assets.
- Do not change runtime code, dataset gates, or GitHub Pages infrastructure.

---

### Task 1: Protect the public R3 status with a failing documentation test

**Files:**
- Modify: `test/docsProjectStatus.test.js:43-64`

**Interfaces:**
- Consumes: the UTF-8 contents of `docs/index.html` as `home`.
- Produces: assertions that require the planned R3 labels and prevent removal of the public training boundary.

- [ ] **Step 1: Add the failing assertions to the Stage 7 documentation test**

Add these four assertions immediately after the existing `assert.match(home, /review|governance/i);` line in the second test:

```js
  assert.match(home, /Stage 7 R3 Public Pilot Tooling Ready/);
  assert.match(home, /5 primary \+ 3 reserve nomination pending/);
  assert.match(home, /public NBT pilot tooling/);
  assert.match(home, /does not authorize acquisition, Dataset admission, or training/i);
```

- [ ] **Step 2: Run the focused test and verify it fails before the page is changed**

Run: `node --test test/docsProjectStatus.test.js`

Expected: exit code `1`; the new R3 wording is absent from the current homepage.

### Task 2: Refresh the English GitHub Pages status copy

**Files:**
- Modify: `docs/index.html:6,45-47,125-130,184-186,201-202`
- Test: `test/docsProjectStatus.test.js`

**Interfaces:**
- Consumes: Task 1's public-status assertions and the approved wording constraints.
- Produces: an English homepage whose R3 statements all describe the same gated state.

- [ ] **Step 1: Update the metadata description and hero paragraph**

Replace the `meta name="description"` content with:

```html
A hybrid semantic-agent and deterministic-geometry pipeline for generating Minecraft Java architecture datapacks from natural language, with an auditable, gated Stage 7 research lane.
```

Replace the `hero-copy` paragraph with:

```html
Research project exploring how semantic agents, deterministic geometry, template memory, semantic patch artifacts, benchmarking, and repair loops can turn natural-language prompts into runnable Minecraft Java datapacks. Stage 7 keeps learned research auditable: M3 fixture validation is complete, R3 public NBT pilot tooling is ready, and real-data training remains explicitly gated.
```

- [ ] **Step 2: Replace the Latest Stage metric card**

Replace the first `metric-strip` article with:

```html
<article>
  <span>Latest Stage</span>
  <strong>Stage 7 R3 Public Pilot Tooling Ready</strong>
  <em>5 primary + 3 reserve nomination pending; Dataset v3 real-data gate false / 0 reviewed training approvals</em>
  <a href="superpowers/handoffs/2026-07-20-stage-7-r3-operational-tooling-readiness-complete.md">R3 readiness handoff</a>
</article>
```

- [ ] **Step 3: Add the R3 capability immediately after the M3 capability**

Insert this list item after the existing `Stage 7 M3 fixture-only foundation` list item:

```html
<li><strong>Stage 7 R3 public NBT pilot</strong><span>Strict public NBT pilot tooling is ready for an exact five-primary, three-reserve slate. The next step is metadata-only nomination; tooling readiness does not authorize acquisition, Dataset admission, or training.</span></li>
```

- [ ] **Step 4: Replace the Stage 7 roadmap paragraph**

Replace the active Stage 7 paragraph with:

```html
<p>M3 validates fixture-only CPU plumbing and shadow parity; R3 public NBT pilot tooling is now ready. The next public-data task is a metadata-only 5+3 nomination, while acquisition, human review, Dataset admission, and real-data training remain separately gated. <a href="benchmarks/stage7-m3-fixture-foundation.md">View M3 benchmark evidence.</a></p>
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run: `node --test test/docsProjectStatus.test.js`

Expected: exit code `0`; all documentation-status tests pass.

### Task 3: Verify, commit, publish, and fast-forward `main`

**Files:**
- Modify: `docs/index.html`
- Modify: `test/docsProjectStatus.test.js`
- Create: `docs/superpowers/plans/2026-07-20-stage-7-r3-pages-status.md`

**Interfaces:**
- Consumes: the passing focused test from Task 2 and a clean, authenticated Git repository.
- Produces: a commit on `codex/stage7-dataset-v3-extraction`, the same verified commit on `origin/main`, and no generated artifacts.

- [ ] **Step 1: Run static and full-suite verification**

Run:

```bash
git diff --check
npm test
```

Expected: `git diff --check` is silent and `npm test` exits `0` with no failures.

- [ ] **Step 2: Inspect the release scope before staging**

Run:

```bash
git status --short
git diff -- docs/index.html test/docsProjectStatus.test.js docs/superpowers/plans/2026-07-20-stage-7-r3-pages-status.md
```

Expected: only the homepage, its test, and this implementation plan are uncommitted; the design document is already committed separately.

- [ ] **Step 3: Commit the verified homepage update**

Run:

```bash
git add docs/index.html test/docsProjectStatus.test.js docs/superpowers/plans/2026-07-20-stage-7-r3-pages-status.md
git commit -m "docs: refresh R3 Pages status"
```

Expected: one new commit contains only the reviewed public documentation, regression test, and plan.

- [ ] **Step 4: Authenticate and push the source branch**

Run:

```bash
gh auth status
git push -u origin codex/stage7-dataset-v3-extraction
```

Expected: GitHub CLI reports the active authenticated account; the source branch is updated on `origin`.

- [ ] **Step 5: Fast-forward and push `main`**

Run:

```bash
git switch main
git merge --ff-only codex/stage7-dataset-v3-extraction
git push origin main
git status -sb
```

Expected: `main` fast-forwards without a merge commit, `origin/main` points to the verified homepage commit, and the final status shows `main` tracking `origin/main` with no worktree changes.
