# Course Submission Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a strong course-submission package for the Minecraft Constructing Agents project: a polished Chinese report, a GitHub Pages-style showcase site, refreshed README entry points, and a concise submission checklist.

**Architecture:** Keep the source repository runnable and clean while adding presentation-layer documentation under `docs/` and submission instructions at the repository root. Generate local binary deliverables under `course_submission/` without committing temporary files or secrets. Treat missing screenshots as explicit real-result placeholders with instructions for later replacement.

**Tech Stack:** Node.js native test runner, static HTML/CSS for `docs/`, Python `python-docx` and `reportlab` for report generation, Poppler for PDF rendering checks, existing npm scripts for project verification.

---

## File Structure

- Create `test/courseSubmissionDocs.test.js`: checks that the showcase site and submission checklist expose required course-project information.
- Create `docs/index.html`: GitHub Pages-style showcase page for instructors.
- Create `docs/assets/course-showcase.css`: restrained engineering-showcase styling for `docs/index.html`.
- Create `docs/assets/architecture-flow.svg`: static architecture visual used by the website and report.
- Modify `README.md`: add a short course-submission entry near the top and link the website/checklist.
- Create `SUBMISSION.md`: final submission checklist with GitHub link, site entry, report location, run commands, tests, and AI-assistance disclosure.
- Create `scripts/build_course_report.py`: deterministic report builder that emits DOCX and PDF from the same structured content.
- Create local output directory `course_submission/`: final DOCX/PDF and optional QA renders. Binary report artifacts may remain local if repository hygiene argues against committing them.
- Keep `out/`, `.tmp/`, `.env`, API keys, and the course PDF out of commits.

## Task 1: Add Documentation Presence Tests

**Files:**
- Create: `test/courseSubmissionDocs.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/courseSubmissionDocs.test.js` with Node's built-in test runner. The test should read `docs/index.html`, `SUBMISSION.md`, and `README.md`, then assert that each required submission signal exists.

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function readUtf8(path) {
  return readFile(path, 'utf8');
}

test('course showcase site exposes project, architecture, results, and reproduction signals', async () => {
  const html = await readUtf8('docs/index.html');

  assert.match(html, /Minecraft Constructing Agents/);
  assert.match(html, /大语言模型与信息决策/);
  assert.match(html, /LLM 语义智能体/);
  assert.match(html, /CSG/);
  assert.match(html, /BSP/);
  assert.match(html, /A\*/);
  assert.match(html, /173 passed/);
  assert.match(html, /真实截图/);
  assert.match(html, /npm start -- --mode mock/);
});

test('submission checklist names deliverables, authors, commands, and AI assistance boundary', async () => {
  const text = await readUtf8('SUBMISSION.md');

  assert.match(text, /龙想/);
  assert.match(text, /2300011196/);
  assert.match(text, /石宇宸/);
  assert.match(text, /2300011051/);
  assert.match(text, /GitHub/);
  assert.match(text, /docs\/index.html/);
  assert.match(text, /npm test/);
  assert.match(text, /AI 辅助/);
});

test('readme links the course submission entry points', async () => {
  const readme = await readUtf8('README.md');

  assert.match(readme, /课程项目提交入口/);
  assert.match(readme, /docs\/index.html/);
  assert.match(readme, /SUBMISSION.md/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- test/courseSubmissionDocs.test.js
```

Expected: the command fails because `docs/index.html` and `SUBMISSION.md` do not exist yet, or because README does not yet contain the new submission entry points.

- [ ] **Step 3: Commit only if the test file is intentionally kept separate**

Do not commit yet unless a checkpoint is needed. This task's test is expected to become green after Tasks 2 and 3.

## Task 2: Build The GitHub Pages Showcase Site

**Files:**
- Create: `docs/index.html`
- Create: `docs/assets/course-showcase.css`
- Create: `docs/assets/architecture-flow.svg`

- [ ] **Step 1: Create the architecture visual**

Create `docs/assets/architecture-flow.svg` as an accessible SVG diagram with these nodes in order:

```text
中文需求 -> ArchitectAgent / PlannerAgent -> TemplateKnowledgeAgent -> CSG / BSP / A* -> Decorator / QA / Optimizer -> Minecraft Datapack
```

The visual must include `role="img"`, a `<title>`, and a `<desc>` explaining the hybrid architecture.

- [ ] **Step 2: Create the site stylesheet**

Create `docs/assets/course-showcase.css` with:

- a neutral engineering palette, not a one-hue theme;
- responsive two-column sections that collapse cleanly on mobile;
- cards only for repeated metric/result items, not nested page sections;
- stable dimensions for screenshot placeholders and metric cards;
- no decorative gradient orbs or bokeh elements.

Minimum selectors required:

```css
:root
body
.topbar
.hero
.hero__content
.hero__visual
.button-row
.button
.section
.grid
.metric-grid
.metric-card
.timeline
.timeline-item
.artifact-frame
.placeholder-shot
.code-block
@media (max-width: 760px)
```

- [ ] **Step 3: Create `docs/index.html`**

The page must include:

- `<title>Minecraft Constructing Agents - 课程项目展示</title>`;
- one top navigation bar with links to repository sections;
- first viewport project name and real quick-start command;
- architecture section using `docs/assets/architecture-flow.svg`;
- results section with `173 passed`, latest known output directory, and explicit screenshot placeholder;
- iteration section based on git milestones from 2026-05-28 to 2026-06-19;
- reproduction section with `npm install`, `npm test`, `npm start -- --mode mock "建一个欧式大房子"`, `/reload`, `/function architect:run`;
- honest boundary and AI-assistance notes.

Use visible Chinese prose, but keep it concise. Do not claim Minecraft screenshot evidence exists; use text such as `此处可补充真实 Minecraft 游戏内截图`.

- [ ] **Step 4: Run the documentation test**

Run:

```powershell
npm test -- test/courseSubmissionDocs.test.js
```

Expected: the site-related assertions pass, README and `SUBMISSION.md` assertions may still fail until Task 3.

## Task 3: Add Submission Checklist And README Entry

**Files:**
- Create: `SUBMISSION.md`
- Modify: `README.md`

- [ ] **Step 1: Create `SUBMISSION.md`**

The checklist must include:

- project name and members;
- GitHub repository URL;
- website entry `docs/index.html`;
- local report deliverables `course_submission/Minecraft_Constructing_Agents_课程报告.docx` and `.pdf`;
- command table for install, test, mock generation, template analysis, and Minecraft datapack use;
- latest verified test result `173 passed / 0 failed`;
- note that final in-game screenshots can be supplemented later;
- AI-assistance disclosure.

- [ ] **Step 2: Update README top section**

Add a short `课程项目提交入口` section after the one-sentence overview. It must link:

- `[项目展示页](docs/index.html)`
- `[提交清单](SUBMISSION.md)`
- `https://github.com/CityC196/Minecraft-Constructing-Agents`

Keep the rest of README intact except for minor wording needed to connect the new entry points.

- [ ] **Step 3: Run the documentation test**

Run:

```powershell
npm test -- test/courseSubmissionDocs.test.js
```

Expected: all three tests in `courseSubmissionDocs.test.js` pass.

- [ ] **Step 4: Run the full project tests**

Run:

```powershell
npm test
```

Expected: `174` or more tests pass, `0 failed`. The exact count may increase by the new documentation tests.

## Task 4: Build The Chinese Course Report Generator

**Files:**
- Create: `scripts/build_course_report.py`
- Create directory at runtime: `course_submission/`
- Create at runtime: `course_submission/Minecraft_Constructing_Agents_课程报告.docx`
- Create at runtime: `course_submission/Minecraft_Constructing_Agents_课程报告.pdf`

- [ ] **Step 1: Check Python document dependencies**

Run:

```powershell
@'
import docx
import reportlab
print('python-docx ok')
print('reportlab ok')
'@ | & 'C:\Users\29440\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -
```

Expected: both imports succeed. If one import fails, install only the missing package into the bundled runtime or use a local fallback that does not modify project dependencies.

- [ ] **Step 2: Create `scripts/build_course_report.py`**

The script must:

- use `python-docx` to build a DOCX with `standard_business_brief`-style tokens: US Letter, 1 inch margins, Calibri body 11 pt, H1 blue 16 pt, H2 blue 13 pt, body spacing 6 pt;
- use `reportlab` to build a matching PDF from the same report content;
- register a Chinese-capable font from the Windows font directory, preferring Microsoft YaHei, SimSun, or SimHei;
- include a cover page with member names and GitHub URL;
- include all report sections from the approved design;
- include `docs/assets/architecture-flow.svg` in the report if conversion is practical, otherwise include the same architecture as text;
- include explicit screenshot placeholders instead of fabricated images;
- write all outputs to `course_submission/`;
- print generated output paths.

- [ ] **Step 3: Run the report builder**

Run:

```powershell
& 'C:\Users\29440\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/build_course_report.py
```

Expected: DOCX and PDF are generated under `course_submission/`, and the script exits with code `0`.

- [ ] **Step 4: Check PDF page count**

Run:

```powershell
& 'C:\texlive\2025\bin\windows\pdfinfo.exe' 'course_submission\Minecraft_Constructing_Agents_课程报告.pdf'
```

Expected: `Pages:` is `15` or lower.

- [ ] **Step 5: Render PDF pages for visual QA**

Run:

```powershell
New-Item -ItemType Directory -Force '.tmp\course_report_pdf_render' | Out-Null
& 'C:\texlive\2025\bin\windows\pdftoppm.exe' -png 'course_submission\Minecraft_Constructing_Agents_课程报告.pdf' '.tmp\course_report_pdf_render\report-page'
```

Expected: one PNG per PDF page appears in `.tmp/course_report_pdf_render/`.

- [ ] **Step 6: Inspect rendered PDF pages**

Open the generated PNGs and check:

- Chinese text renders correctly;
- page count stays under 15;
- no clipped text or overlapping tables;
- screenshot placeholders are visibly marked as placeholders;
- headings, bullets, and tables are readable.

Fix `scripts/build_course_report.py` and regenerate until the rendered PDF is clean.

## Task 5: Validate The DOCX Structure

**Files:**
- Read: `course_submission/Minecraft_Constructing_Agents_课程报告.docx`

- [ ] **Step 1: Try DOCX render QA if LibreOffice is available**

Run:

```powershell
where.exe soffice
```

If `soffice` exists, render the DOCX with the document skill renderer:

```powershell
& 'C:\Users\29440\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' 'C:\Users\29440\.codex\plugins\cache\openai-primary-runtime\documents\26.623.12021\skills\documents\render_docx.py' 'course_submission\Minecraft_Constructing_Agents_课程报告.docx' --output_dir '.tmp\course_report_docx_render' --emit_pdf
```

If `soffice` is not available, record that DOCX visual QA could not be performed locally and rely on structural checks plus PDF render QA.

- [ ] **Step 2: Run structural DOCX checks**

Run:

```powershell
@'
from pathlib import Path
from docx import Document
p = Path('course_submission/Minecraft_Constructing_Agents_课程报告.docx')
doc = Document(p)
texts = '\n'.join(para.text for para in doc.paragraphs)
required = ['Minecraft 建筑生成多智能体系统', '龙想', '石宇宸', 'LLM 语义智能体', 'CSG', 'BSP', 'A*', '173 passed', 'AI 辅助']
missing = [item for item in required if item not in texts]
if missing:
    raise SystemExit(f'missing required text: {missing}')
print(f'paragraphs={len(doc.paragraphs)} tables={len(doc.tables)}')
'@ | & 'C:\Users\29440\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -
```

Expected: no missing required text, with a paragraph/table count printed.

## Task 6: Visual QA The Website

**Files:**
- Read: `docs/index.html`
- Read: `docs/assets/course-showcase.css`

- [ ] **Step 1: Serve the repository locally**

Run:

```powershell
npx http-server . -p 8765
```

If port `8765` is already in use, use `8766`.

- [ ] **Step 2: Open and inspect**

Open:

```text
http://127.0.0.1:8765/docs/index.html
```

Check desktop and mobile widths:

- no text overlap;
- architecture SVG loads;
- code blocks fit;
- screenshot placeholder is clearly labeled;
- first viewport communicates the project name, course, and quick-start command.

- [ ] **Step 3: Fix CSS or HTML if inspection finds layout defects**

Adjust only `docs/index.html` or `docs/assets/course-showcase.css`, then repeat Step 2.

## Task 7: Final Verification And Commit

**Files:**
- All changed source, docs, and generated report artifacts selected for commit.

- [ ] **Step 1: Run full verification**

Run:

```powershell
npm test
& 'C:\texlive\2025\bin\windows\pdfinfo.exe' 'course_submission\Minecraft_Constructing_Agents_课程报告.pdf'
```

Expected:

- npm test reports all tests passing and zero failures;
- `pdfinfo` reports 15 pages or fewer.

- [ ] **Step 2: Review git status**

Run:

```powershell
git status --short
```

Expected:

- no `.env`, `out/`, `.tmp/`, course PDF, or API key files appear;
- report PDF may be ignored by `.gitignore`; if the user wants it tracked, add it with `git add -f`.

- [ ] **Step 3: Stage intended files**

Stage:

```powershell
git add README.md SUBMISSION.md docs/index.html docs/assets/course-showcase.css docs/assets/architecture-flow.svg test/courseSubmissionDocs.test.js scripts/build_course_report.py
git add course_submission/Minecraft_Constructing_Agents_课程报告.docx
```

If and only if committing the PDF is desired:

```powershell
git add -f course_submission/Minecraft_Constructing_Agents_课程报告.pdf
```

- [ ] **Step 4: Commit**

Run:

```powershell
git commit -m "Add course submission showcase package"
```

Expected: a commit is created on `codex/course-submission-showcase`.

- [ ] **Step 5: Final status**

Run:

```powershell
git status --short --branch
```

Expected: branch is clean except for intentionally untracked or ignored local QA artifacts.
