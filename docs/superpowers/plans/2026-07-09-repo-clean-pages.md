# Repo Clean Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition the repository from legacy showcase packaging to a clean long-term Architecture Master Agent project without changing generation behavior.

**Architecture:** Delete showcase-only artifacts, keep long-lived runtime/template/benchmark assets, and rebuild the default GitHub entry points around the active pipeline and roadmap. Static GitHub Pages remains framework-free under `docs/`.

**Tech Stack:** Node.js ESM, static HTML/CSS, GitHub Pages from `docs/`, built-in `node:test`.

## Global Constraints

- Do not change `src/construction` generation behavior.
- Do not commit generated `out/` artifacts or local secrets.
- Remove legacy showcase reports, screenshots, checklist, and tests.
- Keep benchmark summaries, roadmap, architecture docs, template memory, and all runtime tests.
- Verify with `npm test` and a static HTML link check.

---

### Task 1: Remove Legacy Showcase Packaging

**Files:**
- Delete: `SUBMISSION.md`
- Delete: `course_submission/`
- Delete: `scripts/build_course_report.py`
- Delete: `test/courseSubmissionDocs.test.js`
- Delete: `docs/assets/course-showcase.css`
- Delete: `docs/assets/run-screenshots/`
- Delete: `docs/recommended-prompts.md`
- Delete: `docs/superpowers/plans/2026-06-27-course-submission-showcase.md`
- Delete: `docs/superpowers/specs/2026-06-27-course-submission-showcase-design.md`
- Move: `docs/super-agent-architecture.md` to `docs/architecture.md`
- Move: `docs/architecture-master-roadmap.md` to `docs/roadmap.md`

**Interfaces:**
- Consumes: existing tracked legacy showcase files.
- Produces: a repository tree with no showcase default surface.

- [x] **Step 1: Delete tracked showcase-only files**

Run:

```powershell
git rm SUBMISSION.md scripts/build_course_report.py test/courseSubmissionDocs.test.js docs/assets/course-showcase.css docs/recommended-prompts.md
git rm -r course_submission docs/assets/run-screenshots
```

Expected: git records deletions only for legacy showcase packaging files.

- [x] **Step 2: Rename long-term docs**

Run:

```powershell
git mv docs/super-agent-architecture.md docs/architecture.md
git mv docs/architecture-master-roadmap.md docs/roadmap.md
```

Expected: long-term docs have short stable names.

### Task 2: Rebuild Repository Entry Points

**Files:**
- Modify: `README.md`
- Modify: `AGENT.md`
- Modify: `docs/index.html`
- Create: `docs/assets/site.css`
- Create: `docs/project-map.md`

**Interfaces:**
- Consumes: `docs/assets/architecture-flow.svg`, benchmark docs, package scripts.
- Produces: clean GitHub README and Pages homepage.

- [x] **Step 1: Rewrite `README.md`**

Expected content focuses on project vision, quick start, current status, repository map, commands, boundaries, and next stages.

- [x] **Step 2: Rewrite `docs/index.html` and create `docs/assets/site.css`**

Expected content contains no legacy showcase language and links only to long-term project docs.

- [x] **Step 3: Update `AGENT.md`**

Expected content describes the long-term project and keeps operational guardrails.

### Task 3: Verify And Commit

**Files:**
- Test: `package.json`
- Test: `docs/index.html`
- Test: repository links

**Interfaces:**
- Consumes: final docs and test suite.
- Produces: verified commit on `codex/repo-clean-pages`.

- [x] **Step 1: Search for stale legacy links**

Run:

```powershell
rg "course_submission|SUBMISSION|课程项目提交入口|course-showcase|run-screenshots" -n . --glob '!node_modules/**' --glob '!out/**' --glob '!mc_templates/**'
```

Expected: no active README/site/test references remain.

- [x] **Step 2: Run tests**

Run:

```powershell
npm test
```

Expected: all tests pass.

- [x] **Step 3: Commit**

Run:

```powershell
git add -A
git commit -m "docs: clean long-term project pages"
```

Expected: one commit containing docs cleanup and static site refresh.
