# Stage 2 Template Knowledge Base 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a governed Template Knowledge Base v2 that merges automatic template analysis with human review overlays, emits versioned artifacts, and returns 3-8 explainable references for any prompt.

**Architecture:** Keep the existing analyzer and `TemplateKnowledgeAgent` behavior stable, then add a deterministic v2 layer above the existing `case_library.json`. The v2 layer reads v1 analysis plus curation overlays, writes `case_library.v2.json` and reports, powers an independent explainable retriever, and is surfaced in generation reports with v1 fallback.

**Tech Stack:** Node.js ESM, built-in `node:test`, `node:fs/promises`, `node:crypto`, existing template analyzer, existing construction workflow.

## Global Constraints

- Preserve the current `construction_method_v1` pipeline.
- Keep default generation runnable without API keys in `--mode mock`.
- Do not make Python required for normal generation.
- Target Minecraft Java 1.21 / 1.21.1 and datapack `pack_format: 48`.
- Do not reorganize the raw template directory layout in this stage.
- Do not train a neural model in this stage.
- Do not require Minecraft rendering or screenshots for the first v2 pass.
- Do not scrape or download new templates as part of the first implementation.
- Human edits live in `mc_templates/curation/`; generated v2 artifacts live in `mc_templates/analysis/`.
- Use TDD: write failing tests before production code.
- Do not commit `out/`, `.tmp/`, `.env`, generated datapacks, or local secrets.

---

## Scope Check

The spec contains several layers, but they are sequential parts of one data path rather than independent products:

1. Review and taxonomy primitives.
2. v2 case library builder.
3. v2 artifact emission.
4. Explainable retrieval.
5. Runtime/report integration.

This plan keeps them in one sequence so each task builds on the previous task and produces testable software.

## File Structure

Create or modify these files:

- `mc_templates/curation/tag_taxonomy.json`: human-maintained allowed tag groups and tag ids.
- `mc_templates/curation/template_reviews.jsonl`: append-only human review overlay. The initial file may be empty.
- `src/construction/templates/templateTagTaxonomy.js`: default taxonomy loading and tag validation.
- `src/construction/templates/templateReviewOverlay.js`: JSONL parser, record validation, newest-record merge.
- `src/construction/templates/templateKnowledgeBaseV2.js`: v2 builder, knowledge-unit extraction, priority scoring, retrieval-index builder, report renderers, artifact writer.
- `src/construction/templates/templateExplainableRetriever.js`: prompt-to-case scoring, safe filtering, diversity selection, reference explanations.
- `src/construction/templates/schematicAnalyzer.js`: call v2 artifact writer after v1 case library and design laws are built.
- `src/queryTemplateKnowledge.js`: CLI for inspecting retrieval explanations.
- `src/construction/agents/templateKnowledgeAgent.js`: load v2 when present and expose retrieval explanations with v1 fallback.
- `src/construction/workflow.js`: render a short `模板参考记忆` section in `run_report.md`.
- `package.json`: add `query:templates` script.
- `test/templateReviewOverlay.test.js`: taxonomy and review overlay tests.
- `test/templateKnowledgeBaseV2.test.js`: builder, artifact writer, and report tests.
- `test/templateExplainableRetriever.test.js`: retriever and CLI tests.
- `test/templateCaseLibrary.test.js`: extend existing runtime template-knowledge fixture tests.
- `test/pipeline.test.js`: extend report integration assertions if this file is present and already covers workflow reports.

---

### Task 1: Tag Taxonomy And Review Overlay Parser

**Files:**
- Create: `mc_templates/curation/tag_taxonomy.json`
- Create: `mc_templates/curation/template_reviews.jsonl`
- Create: `src/construction/templates/templateTagTaxonomy.js`
- Create: `src/construction/templates/templateReviewOverlay.js`
- Create: `test/templateReviewOverlay.test.js`

**Interfaces:**
- Produces: `DEFAULT_TAG_TAXONOMY`
- Produces: `loadTagTaxonomy(filePath?: string): Promise<object>`
- Produces: `validateTagRecord(tag: object, taxonomy?: object): { ok: boolean, normalized?: object, error?: string }`
- Produces: `parseTemplateReviewOverlay(text: string, options?: { strict?: boolean, taxonomy?: object }): { records: object[], errors: object[] }`
- Produces: `mergeReviewRecords(records: object[]): Map<string, object>`
- Produces: `defaultReviewForCase(caseId: string): object`

- [ ] **Step 1: Write the failing review overlay tests**

Create `test/templateReviewOverlay.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TAG_TAXONOMY,
  validateTagRecord,
  loadTagTaxonomy
} from '../src/construction/templates/templateTagTaxonomy.js';
import {
  parseTemplateReviewOverlay,
  mergeReviewRecords,
  defaultReviewForCase
} from '../src/construction/templates/templateReviewOverlay.js';

test('tag taxonomy validates known tags and rejects unknown tags', async () => {
  const taxonomy = await loadTagTaxonomy();
  assert.deepEqual(Object.keys(taxonomy.groups).sort(), Object.keys(DEFAULT_TAG_TAXONOMY.groups).sort());

  const valid = validateTagRecord({
    group: 'quality',
    id: 'high-value-reference',
    confidence: 0.9,
    evidence: 'manual review'
  }, taxonomy);
  assert.equal(valid.ok, true);
  assert.equal(valid.normalized.group, 'quality');
  assert.equal(valid.normalized.id, 'high-value-reference');
  assert.equal(valid.normalized.confidence, 0.9);

  const invalid = validateTagRecord({ group: 'quality', id: 'unknown-quality' }, taxonomy);
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /unknown tag/i);
});

test('review overlay parser accepts valid lines and reports invalid lines', () => {
  const text = [
    JSON.stringify({
      record_id: 'review-1',
      case_id: 'house-tavern',
      reviewed_by: 'human',
      reviewed_at: '2026-07-09T00:00:00.000Z',
      status: 'approved',
      confidence: 0.9,
      approved_learning_areas: ['interior', 'site'],
      blocked_learning_areas: [],
      manual_tags: [{ group: 'quality', id: 'high-value-reference', confidence: 0.9, evidence: 'manual review' }],
      risk_overrides: [],
      notes: 'Useful tavern interior.'
    }),
    '{bad json',
    JSON.stringify({
      record_id: 'review-2',
      case_id: 'house-empty',
      reviewed_by: 'human',
      reviewed_at: '2026-07-09T00:01:00.000Z',
      status: 'rejected',
      confidence: 0.8
    })
  ].join('\n');

  const parsed = parseTemplateReviewOverlay(text);
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.errors[0].line, 2);
  assert.match(parsed.errors[0].message, /invalid json/i);
});

test('review overlay merge uses newest record per case and preserves lineage', () => {
  const parsed = parseTemplateReviewOverlay([
    JSON.stringify({
      record_id: 'review-old',
      case_id: 'house-tavern',
      reviewed_by: 'human',
      reviewed_at: '2026-07-09T00:00:00.000Z',
      status: 'limited',
      confidence: 0.5,
      approved_learning_areas: ['site'],
      blocked_learning_areas: ['interior']
    }),
    JSON.stringify({
      record_id: 'review-new',
      case_id: 'house-tavern',
      reviewed_by: 'human',
      reviewed_at: '2026-07-09T01:00:00.000Z',
      status: 'approved',
      confidence: 0.95,
      approved_learning_areas: ['interior', 'site'],
      blocked_learning_areas: []
    })
  ].join('\n'));

  const merged = mergeReviewRecords(parsed.records);
  const review = merged.get('house-tavern');
  assert.equal(review.status, 'approved');
  assert.equal(review.confidence, 0.95);
  assert.deepEqual(review.review_record_ids, ['review-old', 'review-new']);
  assert.deepEqual(review.approved_learning_areas, ['interior', 'site']);
  assert.deepEqual(review.blocked_learning_areas, []);
});

test('default review marks unreviewed cases pending', () => {
  const review = defaultReviewForCase('house-watermill');
  assert.equal(review.status, 'pending');
  assert.equal(review.confidence, 0);
  assert.deepEqual(review.approved_learning_areas, []);
  assert.deepEqual(review.blocked_learning_areas, []);
  assert.deepEqual(review.review_record_ids, []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/templateReviewOverlay.test.js`

Expected: FAIL with `Cannot find module '../src/construction/templates/templateTagTaxonomy.js'`.

- [ ] **Step 3: Add the default taxonomy file**

Create `mc_templates/curation/tag_taxonomy.json`:

```json
{
  "schema_version": 1,
  "groups": {
    "typology": ["house", "castle", "tower", "temple", "public-building", "arena", "scene-building"],
    "style": ["modern", "medieval", "japanese", "classical", "gothic", "coastal", "rustic", "fantasy", "general"],
    "site": ["flat", "terrain-integrated", "garden", "water-edge", "courtyard", "forest", "urban", "island", "slope"],
    "massing": ["compact-block", "long-bar", "asymmetric-wings", "balanced-axis", "courtyard-or-void", "vertical-landmark", "stepped-terraces"],
    "roof": ["flat-terrace", "tower-cap", "layered-eaves", "deep-overhang", "stepped-roofline", "pitched-roof"],
    "facade": ["large-glass", "formal-symmetry", "vertical-slots", "micro-depth-trim", "rail-balcony", "lit-depth-points"],
    "interior": ["furnished", "room-layout-rich", "furniture-pattern-rich", "study-library", "vertical-circulation", "sparse-interior"],
    "quality": ["high-value-reference", "needs-scale-normalization", "research-only", "review-before-deep-mining", "exterior-only"],
    "room_types": ["living", "kitchen", "bedroom", "bathroom", "study", "storage", "workshop", "corridor-or-gallery", "entry-or-lobby", "tower-room", "chapel-or-ceremonial-hall"]
  }
}
```

Create an empty `mc_templates/curation/template_reviews.jsonl` file. Git can track this zero-byte file.

- [ ] **Step 4: Implement taxonomy loading and validation**

Create `src/construction/templates/templateTagTaxonomy.js` with:

```js
import fs from 'node:fs/promises';

export const DEFAULT_TAG_TAXONOMY = Object.freeze({
  schema_version: 1,
  groups: {
    typology: ['house', 'castle', 'tower', 'temple', 'public-building', 'arena', 'scene-building'],
    style: ['modern', 'medieval', 'japanese', 'classical', 'gothic', 'coastal', 'rustic', 'fantasy', 'general'],
    site: ['flat', 'terrain-integrated', 'garden', 'water-edge', 'courtyard', 'forest', 'urban', 'island', 'slope'],
    massing: ['compact-block', 'long-bar', 'asymmetric-wings', 'balanced-axis', 'courtyard-or-void', 'vertical-landmark', 'stepped-terraces'],
    roof: ['flat-terrace', 'tower-cap', 'layered-eaves', 'deep-overhang', 'stepped-roofline', 'pitched-roof'],
    facade: ['large-glass', 'formal-symmetry', 'vertical-slots', 'micro-depth-trim', 'rail-balcony', 'lit-depth-points'],
    interior: ['furnished', 'room-layout-rich', 'furniture-pattern-rich', 'study-library', 'vertical-circulation', 'sparse-interior'],
    quality: ['high-value-reference', 'needs-scale-normalization', 'research-only', 'review-before-deep-mining', 'exterior-only'],
    room_types: ['living', 'kitchen', 'bedroom', 'bathroom', 'study', 'storage', 'workshop', 'corridor-or-gallery', 'entry-or-lobby', 'tower-room', 'chapel-or-ceremonial-hall']
  }
});

export async function loadTagTaxonomy(filePath) {
  if (!filePath) return cloneTaxonomy(DEFAULT_TAG_TAXONOMY);
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return normalizeTaxonomy(parsed);
  } catch (error) {
    if (error.code === 'ENOENT') return cloneTaxonomy(DEFAULT_TAG_TAXONOMY);
    throw error;
  }
}

export function validateTagRecord(tag = {}, taxonomy = DEFAULT_TAG_TAXONOMY) {
  const group = String(tag.group || '').trim();
  const id = String(tag.id || '').trim();
  const allowed = taxonomy.groups?.[group] || [];
  if (!group || !id) return { ok: false, error: 'tag requires group and id' };
  if (!allowed.includes(id)) return { ok: false, error: `unknown tag ${group}:${id}` };
  return {
    ok: true,
    normalized: {
      group,
      id,
      label: tag.label || id.replaceAll('-', ' '),
      confidence: clamp01(tag.confidence === undefined ? 1 : tag.confidence),
      source: tag.source || 'manual',
      evidence: tag.evidence || ''
    }
  };
}

function normalizeTaxonomy(value = {}) {
  const groups = {};
  for (const [group, ids] of Object.entries(value.groups || {})) {
    groups[group] = [...new Set((ids || []).map((item) => String(item).trim()).filter(Boolean))].sort();
  }
  return {
    schema_version: Number(value.schema_version || 1),
    groups
  };
}

function cloneTaxonomy(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp01(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0, Math.min(1, parsed));
}
```

- [ ] **Step 5: Implement review overlay parsing and merging**

Create `src/construction/templates/templateReviewOverlay.js` with:

```js
import { DEFAULT_TAG_TAXONOMY, validateTagRecord } from './templateTagTaxonomy.js';

const VALID_STATUSES = new Set(['pending', 'approved', 'limited', 'rejected', 'research-only']);
const VALID_AREAS = new Set(['site', 'massing', 'facade', 'roof', 'space-planning', 'interior', 'materials', 'risk']);

export function parseTemplateReviewOverlay(text = '', options = {}) {
  const strict = Boolean(options.strict);
  const taxonomy = options.taxonomy || DEFAULT_TAG_TAXONOMY;
  const records = [];
  const errors = [];
  const lines = String(text || '').split(/\r?\n/u);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const raw = JSON.parse(trimmed);
      const normalized = normalizeReviewRecord(raw, taxonomy);
      records.push(normalized);
    } catch (error) {
      const message = error instanceof SyntaxError ? `invalid json: ${error.message}` : error.message;
      errors.push({ line: lineNumber, message });
      if (strict) throw new Error(`Invalid review overlay line ${lineNumber}: ${message}`);
    }
  });

  return { records, errors };
}

export function mergeReviewRecords(records = []) {
  const byCase = new Map();
  const allIds = new Map();
  for (const record of records) {
    const caseId = record.case_id;
    const ids = allIds.get(caseId) || [];
    ids.push(record.record_id);
    allIds.set(caseId, ids);
    const current = byCase.get(caseId);
    if (!current || String(record.reviewed_at || '').localeCompare(String(current.reviewed_at || '')) >= 0) {
      byCase.set(caseId, { ...record });
    }
  }
  for (const [caseId, record] of byCase.entries()) {
    byCase.set(caseId, {
      ...record,
      review_record_ids: allIds.get(caseId) || [record.record_id]
    });
  }
  return byCase;
}

export function defaultReviewForCase(caseId) {
  return {
    case_id: caseId,
    status: 'pending',
    reviewed_by: '',
    reviewed_at: '',
    confidence: 0,
    notes: '',
    approved_learning_areas: [],
    blocked_learning_areas: [],
    manual_tags: [],
    risk_overrides: [],
    review_record_ids: []
  };
}

function normalizeReviewRecord(raw = {}, taxonomy) {
  const recordId = String(raw.record_id || '').trim();
  const caseId = String(raw.case_id || '').trim();
  const status = String(raw.status || 'pending').trim();
  if (!recordId) throw new Error('review record requires record_id');
  if (!caseId) throw new Error('review record requires case_id');
  if (!VALID_STATUSES.has(status)) throw new Error(`invalid review status ${status}`);
  return {
    record_id: recordId,
    case_id: caseId,
    reviewed_by: String(raw.reviewed_by || '').trim(),
    reviewed_at: String(raw.reviewed_at || '').trim(),
    status,
    confidence: clamp01(raw.confidence === undefined ? 0 : raw.confidence),
    approved_learning_areas: normalizeAreas(raw.approved_learning_areas),
    blocked_learning_areas: normalizeAreas(raw.blocked_learning_areas),
    manual_tags: normalizeTags(raw.manual_tags, taxonomy),
    risk_overrides: Array.isArray(raw.risk_overrides) ? raw.risk_overrides.map(String).filter(Boolean) : [],
    notes: String(raw.notes || '')
  };
}

function normalizeAreas(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => String(item).trim()).filter((item) => VALID_AREAS.has(item)))].sort();
}

function normalizeTags(value, taxonomy) {
  const result = [];
  for (const tag of Array.isArray(value) ? value : []) {
    const validation = validateTagRecord(tag, taxonomy);
    if (validation.ok) result.push(validation.normalized);
  }
  return result;
}

function clamp01(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test test/templateReviewOverlay.test.js`

Expected: PASS with 4 passing subtests.

- [ ] **Step 7: Commit Task 1**

Run:

```powershell
git add mc_templates/curation/tag_taxonomy.json mc_templates/curation/template_reviews.jsonl src/construction/templates/templateTagTaxonomy.js src/construction/templates/templateReviewOverlay.js test/templateReviewOverlay.test.js
git commit -m "feat: add template review overlays"
```

Expected: commit succeeds.

---

### Task 2: Knowledge Base V2 Builder, Priority Report, And Review Queue

**Files:**
- Create: `src/construction/templates/templateKnowledgeBaseV2.js`
- Create: `test/templateKnowledgeBaseV2.test.js`

**Interfaces:**
- Consumes: `parseTemplateReviewOverlay()`, `mergeReviewRecords()`, `defaultReviewForCase()` from `templateReviewOverlay.js`
- Consumes: `DEFAULT_TAG_TAXONOMY`, `validateTagRecord()` from `templateTagTaxonomy.js`
- Produces: `buildTemplateKnowledgeBaseV2(options: object): object`
- Produces: `buildTemplateRetrievalIndexV2(knowledgeBase: object): object`
- Produces: `renderTemplatePriorityReport(knowledgeBase: object): string`
- Produces: `renderTemplateReviewQueue(knowledgeBase: object): string`
- Produces: `writeTemplateKnowledgeBaseV2Artifacts(options: object): Promise<object>`

- [ ] **Step 1: Write the failing builder tests**

Create `test/templateKnowledgeBaseV2.test.js`:

```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTemplateKnowledgeBaseV2,
  buildTemplateRetrievalIndexV2,
  renderTemplatePriorityReport,
  renderTemplateReviewQueue,
  writeTemplateKnowledgeBaseV2Artifacts
} from '../src/construction/templates/templateKnowledgeBaseV2.js';
import { parseTemplateReviewOverlay, mergeReviewRecords } from '../src/construction/templates/templateReviewOverlay.js';

test('knowledge base v2 converts v1 cases into reviewed knowledge units', () => {
  const reviewOverlay = mergeReviewRecords(parseTemplateReviewOverlay(JSON.stringify({
    record_id: 'review-modern-1',
    case_id: 'house-modern-lake-villa',
    reviewed_by: 'human',
    reviewed_at: '2026-07-09T00:00:00.000Z',
    status: 'approved',
    confidence: 0.9,
    approved_learning_areas: ['site', 'facade', 'interior'],
    blocked_learning_areas: [],
    manual_tags: [{ group: 'quality', id: 'high-value-reference', confidence: 0.9, evidence: 'manual review' }]
  })).records);

  const kb = buildTemplateKnowledgeBaseV2({
    generatedAt: '2026-07-09T00:00:00.000Z',
    caseLibrary: caseLibraryFixture(),
    templateIndex: templateIndexFixture(),
    reviewOverlay
  });

  assert.equal(kb.source, 'template-knowledge-base-v2');
  assert.equal(kb.schema_version, 2);
  assert.equal(kb.summary.case_count, 2);
  assert.equal(kb.summary.review_status_counts.approved, 1);
  assert.equal(kb.summary.review_status_counts.pending, 1);
  assert.ok(kb.knowledge_base_id.startsWith('sha256:'));

  const modern = kb.cases.find((item) => item.case_id === 'house-modern-lake-villa');
  assert.equal(modern.review.status, 'approved');
  assert.ok(modern.case_version.startsWith('sha256:'));
  assert.ok(modern.tags.site.some((tag) => tag.id === 'water-edge'));
  assert.ok(modern.tags.quality.some((tag) => tag.id === 'high-value-reference'));
  assert.ok(modern.knowledge_units.some((unit) => unit.area === 'site'));
  assert.ok(modern.knowledge_units.some((unit) => unit.area === 'facade'));
  assert.ok(modern.knowledge_units.some((unit) => unit.area === 'interior'));
  assert.ok(modern.priority.global_score > 70);
  assert.ok(modern.retrieval.search_tokens.includes('modern'));
  assert.ok(modern.retrieval.explanation_seeds.length > 0);
});

test('knowledge base v2 suppresses blocked learning areas and ranks review queue', () => {
  const overlay = mergeReviewRecords(parseTemplateReviewOverlay(JSON.stringify({
    record_id: 'review-arena-1',
    case_id: 'arenas-amphitheatre-arena',
    reviewed_by: 'human',
    reviewed_at: '2026-07-09T00:00:00.000Z',
    status: 'limited',
    confidence: 0.75,
    approved_learning_areas: ['site', 'massing'],
    blocked_learning_areas: ['interior']
  })).records);

  const kb = buildTemplateKnowledgeBaseV2({
    generatedAt: '2026-07-09T00:00:00.000Z',
    caseLibrary: caseLibraryFixture(),
    templateIndex: templateIndexFixture(),
    reviewOverlay: overlay
  });

  const arena = kb.cases.find((item) => item.case_id === 'arenas-amphitheatre-arena');
  assert.equal(arena.review.status, 'limited');
  assert.ok(arena.knowledge_units.some((unit) => unit.area === 'site'));
  assert.equal(arena.knowledge_units.some((unit) => unit.area === 'interior'), false);
  assert.ok(arena.risk_controls.some((item) => /do not mine domestic rooms/i.test(item)));

  const queue = renderTemplateReviewQueue(kb);
  assert.match(queue, /Template Review Queue/);
  assert.match(queue, /Amphitheatre Arena/);
  assert.match(queue, /arena-not-for-room-mining/);
});

test('knowledge base v2 builds retrieval index and markdown reports', () => {
  const kb = buildTemplateKnowledgeBaseV2({
    generatedAt: '2026-07-09T00:00:00.000Z',
    caseLibrary: caseLibraryFixture(),
    templateIndex: templateIndexFixture()
  });
  const index = buildTemplateRetrievalIndexV2(kb);
  assert.equal(index.source, 'template-retrieval-index-v2');
  assert.equal(index.schema_version, 2);
  assert.equal(index.case_count, 2);
  assert.ok(index.token_to_cases.modern.includes('house-modern-lake-villa'));
  assert.ok(index.area_to_cases.site.includes('house-modern-lake-villa'));

  const priorityReport = renderTemplatePriorityReport(kb);
  assert.match(priorityReport, /Template Priority Report/);
  assert.match(priorityReport, /Modern Lake Villa/);
});

test('knowledge base v2 artifact writer writes json and reports', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-kb-v2-'));
  const result = await writeTemplateKnowledgeBaseV2Artifacts({
    outputDir: root,
    generatedAt: '2026-07-09T00:00:00.000Z',
    caseLibrary: caseLibraryFixture(),
    templateIndex: templateIndexFixture()
  });

  assert.ok(result.knowledgeBaseFile.endsWith('case_library.v2.json'));
  assert.ok(result.retrievalIndexFile.endsWith('retrieval_index.v2.json'));
  assert.ok(result.priorityReportFile.endsWith('template_priority_report.md'));
  assert.ok(result.reviewQueueFile.endsWith('template_review_queue.md'));

  const writtenKb = JSON.parse(await fs.readFile(result.knowledgeBaseFile, 'utf8'));
  assert.equal(writtenKb.schema_version, 2);
  const queue = await fs.readFile(result.reviewQueueFile, 'utf8');
  assert.match(queue, /Template Review Queue/);
});

function caseLibraryFixture() {
  return {
    source: 'stage7-template-case-library-v1',
    cases: [
      {
        case_id: 'house-modern-lake-villa',
        title: 'Modern Lake Villa',
        file: 'House/Modern Lake Villa.schematic',
        category: 'House',
        style_family: 'modern',
        typology: 'house',
        study_priority: 'high',
        overall_reference_score: 92,
        tags: ['water-edge', 'landscape-composition', 'glass-emphasis', 'furnished-interior'],
        quality_tags: ['site-rich-reference', 'interior-rich-reference'],
        learning_roles: [
          { role: 'water_edge', score: 90, evidence: 'water edge' },
          { role: 'garden_scene', score: 85, evidence: 'garden' },
          { role: 'facade_detail', score: 80, evidence: 'glass facade' },
          { role: 'interior_reference', score: 88, evidence: 'furnished interior' }
        ],
        learnable_areas: [
          { area: 'site-water-edge', priority: 'high', role: 'water_edge', evidence: 'water edge', next_phase: 'phase2-site-pattern-mining' },
          { area: 'facade', priority: 'high', role: 'facade_detail', evidence: 'glass facade', next_phase: 'phase2-facade-motif-mining' },
          { area: 'interior', priority: 'high', role: 'interior_reference', evidence: 'furnished interior', next_phase: 'phase2-room-segmentation' }
        ],
        review_flags: [],
        risk_controls: ['safe for normal template retrieval according to current evidence'],
        feature_card: {
          scale: { bucket: 'large', width: 34, height: 18, length: 28 },
          site: { integrated: true, terrain_profile: 'non-flat-integrated', landscape_features: ['garden-composition', 'water-edge'], water_ratio: 0.02 },
          facade_roof: { glass_ratio: 0.09, facade_patterns: ['large_glass_bands'], roof_patterns: ['flat_terrace_or_platform'] },
          interior: { furnished_likelihood: 'high', room_candidates: [{ room_type: 'living' }, { room_type: 'kitchen' }] },
          composition: { massing: ['long_bar'], roof: ['flat_terrace_or_platform'], site: ['water_edge'], facade: ['large_glass_bands'] }
        },
        semantic_clauses: [
          'site: connect public rooms to a water edge, reflection basin, deck, or waterfront threshold',
          'facade: make large glass serve a view axis, not just a random wall material',
          'interior: build room identity from focal walls, storage bands, task zones, textiles, plants, and layered lighting'
        ],
        retrieval: { tokens: ['modern', 'lake', 'villa', 'water-edge', 'large-glass'], prompt_affinities: ['modern', 'house', 'waterfront', 'large-glass', 'interior'] }
      },
      {
        case_id: 'arenas-amphitheatre-arena',
        title: 'Amphitheatre Arena',
        file: 'Arenas/Amphitheatre Arena.schematic',
        category: 'Arenas',
        style_family: 'classical',
        typology: 'arena',
        study_priority: 'low',
        overall_reference_score: 40,
        tags: ['terrain-integrated'],
        quality_tags: ['review-before-deep-mining'],
        learning_roles: [
          { role: 'terrain_base', score: 80, evidence: 'terrain' },
          { role: 'interior_reference', score: 60, evidence: 'non residential interior noise' }
        ],
        learnable_areas: [
          { area: 'site-terrain', priority: 'high', role: 'terrain_base', evidence: 'terrain', next_phase: 'phase2-site-pattern-mining' },
          { area: 'interior', priority: 'medium', role: 'interior_reference', evidence: 'noisy interior', next_phase: 'manual-review' }
        ],
        review_flags: ['arena-not-for-room-mining', 'non-residential-interior-noise'],
        risk_controls: ['use this case for exterior, site, public approach, or seating rhythm; do not mine domestic rooms'],
        feature_card: {
          scale: { bucket: 'monumental', width: 64, height: 28, length: 64 },
          site: { integrated: true, terrain_profile: 'non-flat-integrated', landscape_features: ['garden-composition'], water_ratio: 0 },
          composition: { massing: ['vertical_landmark'], site: ['foreground_scene'] },
          interior: { furnished_likelihood: 'medium', room_candidates: [{ room_type: 'entry_or_lobby' }] }
        },
        semantic_clauses: [
          'site: treat terrain as part of the architecture with rock/earth plinths, retaining edges, and stepped arrival',
          'massing: use a vertical accent or tower-like marker as an arrival/view focus',
          'interior: build room identity from focal walls, storage bands, task zones, textiles, plants, and layered lighting'
        ],
        retrieval: { tokens: ['classical', 'arena', 'terrain'], prompt_affinities: ['classical', 'arena', 'terrain'] }
      }
    ]
  };
}

function templateIndexFixture() {
  return { corpus: { template_count: 2 }, templates: [] };
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/templateKnowledgeBaseV2.test.js`

Expected: FAIL with `Cannot find module '../src/construction/templates/templateKnowledgeBaseV2.js'`.

- [ ] **Step 3: Implement the v2 builder public API**

Create `src/construction/templates/templateKnowledgeBaseV2.js` with these exported functions and deterministic behavior:

```js
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { defaultReviewForCase } from './templateReviewOverlay.js';

const SOURCE = 'template-knowledge-base-v2';
const SCHEMA_VERSION = 2;
const RETRIEVAL_SOURCE = 'template-retrieval-index-v2';

export function buildTemplateKnowledgeBaseV2({
  generatedAt = new Date().toISOString(),
  caseLibrary = {},
  templateIndex = {},
  designLawBook = {},
  reviewOverlay = new Map(),
  inputs = {}
} = {}) {
  const cases = (caseLibrary.cases || []).map((card) => buildCaseV2(card, reviewOverlay.get(card.case_id) || defaultReviewForCase(card.case_id)));
  const summary = summarizeCases(cases, caseLibrary, templateIndex);
  const base = {
    source: SOURCE,
    schema_version: SCHEMA_VERSION,
    generated_at: generatedAt,
    knowledge_base_id: '',
    inputs: {
      case_library: inputs.case_library || 'mc_templates/analysis/case_library.json',
      template_index: inputs.template_index || 'mc_templates/analysis/template_index.json',
      design_laws: inputs.design_laws || 'mc_templates/analysis/design_laws.json',
      review_overlay: inputs.review_overlay || 'mc_templates/curation/template_reviews.jsonl',
      tag_taxonomy: inputs.tag_taxonomy || 'mc_templates/curation/tag_taxonomy.json'
    },
    summary,
    cases,
    design_law_source: designLawBook.source || ''
  };
  base.knowledge_base_id = `sha256:${hashJson({ cases, summary, inputs: base.inputs })}`;
  return base;
}

export function buildTemplateRetrievalIndexV2(knowledgeBase = {}) {
  const tokenToCases = {};
  const areaToCases = {};
  for (const item of knowledgeBase.cases || []) {
    for (const token of item.retrieval?.search_tokens || []) addIndex(tokenToCases, token, item.case_id);
    for (const unit of item.knowledge_units || []) addIndex(areaToCases, unit.area, item.case_id);
  }
  return {
    source: RETRIEVAL_SOURCE,
    schema_version: SCHEMA_VERSION,
    case_count: (knowledgeBase.cases || []).length,
    token_count: Object.keys(tokenToCases).length,
    token_to_cases: sortIndex(tokenToCases),
    area_to_cases: sortIndex(areaToCases),
    cases: (knowledgeBase.cases || []).map((item) => ({
      case_id: item.case_id,
      title: item.title,
      file: item.file,
      score: item.priority.global_score,
      review_status: item.review.status,
      tokens: item.retrieval.search_tokens,
      areas: [...new Set((item.knowledge_units || []).map((unit) => unit.area))].sort(),
      risk_controls: item.risk_controls
    }))
  };
}

export function renderTemplatePriorityReport(knowledgeBase = {}) {
  const rows = [...(knowledgeBase.cases || [])]
    .sort((a, b) => b.priority.global_score - a.priority.global_score || a.title.localeCompare(b.title))
    .map((item, index) => `| ${index + 1} | ${item.title} | ${item.identity.style_family} | ${item.identity.typology} | ${item.review.status} | ${item.priority.global_score} | ${Object.keys(item.priority.area_scores).join(', ')} | ${(item.priority.high_value_rank_reason || []).join('; ')} |`)
    .join('\n');
  return `# Template Priority Report\n\nGenerated: ${knowledgeBase.generated_at || ''}\n\n| Rank | Case | Style | Typology | Review | Score | Areas | Reason |\n| --- | --- | --- | --- | --- | ---: | --- | --- |\n${rows || '| - | none | - | - | - | 0 | - | - |'}\n`;
}

export function renderTemplateReviewQueue(knowledgeBase = {}) {
  const rows = [...(knowledgeBase.cases || [])]
    .filter((item) => item.review.status === 'pending' || (item.review.status === 'limited') || item.review_flags?.length)
    .sort((a, b) => b.priority.risk_penalty - a.priority.risk_penalty || b.priority.global_score - a.priority.global_score)
    .map((item, index) => `| ${index + 1} | ${item.title} | ${item.review.status} | ${item.priority.global_score} | ${(item.review_flags || []).join(', ') || '-'} | ${(item.risk_controls || []).slice(0, 2).join('; ')} |`)
    .join('\n');
  return `# Template Review Queue\n\nGenerated: ${knowledgeBase.generated_at || ''}\n\n| Rank | Case | Review | Score | Flags | Risk Controls |\n| --- | --- | --- | ---: | --- | --- |\n${rows || '| - | none | - | 0 | - | - |'}\n`;
}

export async function writeTemplateKnowledgeBaseV2Artifacts({
  outputDir,
  generatedAt,
  caseLibrary,
  templateIndex,
  designLawBook,
  reviewOverlay,
  inputs
} = {}) {
  const knowledgeBase = buildTemplateKnowledgeBaseV2({ generatedAt, caseLibrary, templateIndex, designLawBook, reviewOverlay, inputs });
  const retrievalIndex = buildTemplateRetrievalIndexV2(knowledgeBase);
  await fs.mkdir(outputDir, { recursive: true });
  const knowledgeBaseFile = path.join(outputDir, 'case_library.v2.json');
  const retrievalIndexFile = path.join(outputDir, 'retrieval_index.v2.json');
  const priorityReportFile = path.join(outputDir, 'template_priority_report.md');
  const reviewQueueFile = path.join(outputDir, 'template_review_queue.md');
  await fs.writeFile(knowledgeBaseFile, `${JSON.stringify(knowledgeBase, null, 2)}\n`, 'utf8');
  await fs.writeFile(retrievalIndexFile, `${JSON.stringify(retrievalIndex, null, 2)}\n`, 'utf8');
  await fs.writeFile(priorityReportFile, renderTemplatePriorityReport(knowledgeBase), 'utf8');
  await fs.writeFile(reviewQueueFile, renderTemplateReviewQueue(knowledgeBase), 'utf8');
  return { knowledgeBase, retrievalIndex, knowledgeBaseFile, retrievalIndexFile, priorityReportFile, reviewQueueFile };
}
```

Add helper functions in the same file:

```js
function buildCaseV2(card = {}, review = {}) {
  const blocked = new Set(review.blocked_learning_areas || []);
  const tags = buildTags(card, review);
  const knowledgeUnits = buildKnowledgeUnits(card).filter((unit) => !blocked.has(unit.area));
  const riskControls = [...new Set([...(card.risk_controls || []), ...riskControlsFromFlags(card.review_flags || [])])];
  const priority = buildPriority(card, review, knowledgeUnits, riskControls);
  const result = {
    case_id: card.case_id,
    case_version: '',
    title: card.title || card.case_id,
    file: card.file,
    identity: {
      category: card.category || '',
      typology: card.typology || 'building',
      style_family: card.style_family || 'general',
      scale_bucket: card.feature_card?.scale?.bucket || 'unknown'
    },
    source: {
      url: card.source_url || '',
      note: card.source_note || '',
      license_status: review.status === 'research-only' ? 'research-only' : 'unknown',
      author: '',
      public_release_allowed: false
    },
    review: {
      status: review.status || 'pending',
      reviewed_by: review.reviewed_by || '',
      reviewed_at: review.reviewed_at || '',
      confidence: Number(review.confidence || 0),
      notes: review.notes || '',
      approved_learning_areas: review.approved_learning_areas || [],
      blocked_learning_areas: review.blocked_learning_areas || [],
      manual_tags: review.manual_tags || [],
      risk_overrides: review.risk_overrides || [],
      review_record_ids: review.review_record_ids || []
    },
    tags,
    knowledge_units: knowledgeUnits,
    priority,
    retrieval: buildRetrieval(card, tags, knowledgeUnits),
    risk_controls: riskControls,
    review_flags: card.review_flags || [],
    lineage: {
      v1_case_id: card.case_id,
      input_hashes: { v1_case: `sha256:${hashJson(card)}` },
      review_record_ids: review.review_record_ids || []
    }
  };
  result.case_version = `sha256:${hashJson({ ...result, case_version: '' })}`;
  return result;
}

function buildKnowledgeUnits(card = {}) {
  const units = [];
  const add = (area, claim, evidence, confidence, useAs, targets) => {
    units.push({
      id: `${card.case_id}:${area}:${slug(claim).slice(0, 48)}`,
      area,
      claim,
      evidence: Array.isArray(evidence) ? evidence : [evidence],
      confidence,
      use_as: useAs,
      avoid_when: avoidWhenFor(card, area),
      integration_targets: targets,
      source_fields: ['case_library.semantic_clauses', 'case_library.feature_card', 'case_library.learning_roles']
    });
  };
  for (const clause of card.semantic_clauses || []) {
    if (/site|water|terrain|garden/i.test(clause)) add('site', clause, 'semantic clause', 0.78, ['site composition'], ['TemplateSiteSceneStrategy']);
    if (/massing|vertical|courtyard|wing/i.test(clause)) add('massing', clause, 'semantic clause', 0.72, ['massing guidance'], ['ArchitectAgent', 'TemplateSpacePlanningStrategy']);
    if (/facade|glass|wall/i.test(clause)) add('facade', clause, 'semantic clause', 0.76, ['facade rhythm'], ['FacadeAgent']);
    if (/roof|terrace|eaves/i.test(clause)) add('roof', clause, 'semantic clause', 0.74, ['roof profile'], ['RoofAgent']);
    if (/interior|room|focal|lighting|furniture/i.test(clause)) add('interior', clause, 'semantic clause', 0.8, ['room identity', 'decorator pattern guidance'], ['InteriorDetailAgent', 'DecoratorAgent']);
  }
  for (const area of card.learnable_areas || []) {
    const normalizedArea = normalizeArea(area.area || area.role);
    add(normalizedArea, `${card.title} teaches ${normalizedArea} through ${area.evidence || area.role}`, area.evidence || area.role, priorityConfidence(area.priority), [area.next_phase || normalizedArea], integrationTargets(normalizedArea));
  }
  return dedupeById(units);
}
```

The helper set must also include `buildTags`, `buildPriority`, `buildRetrieval`, `riskControlsFromFlags`, `normalizeArea`, `integrationTargets`, `summarizeCases`, `addIndex`, `sortIndex`, `hashJson`, `slug`, `dedupeById`, `priorityConfidence`, and `avoidWhenFor`. Keep each helper small and pure.

- [ ] **Step 4: Run the builder test to verify it passes**

Run: `node --test test/templateKnowledgeBaseV2.test.js`

Expected: PASS with 4 passing subtests.

- [ ] **Step 5: Commit Task 2**

Run:

```powershell
git add src/construction/templates/templateKnowledgeBaseV2.js test/templateKnowledgeBaseV2.test.js
git commit -m "feat: build template knowledge base v2"
```

Expected: commit succeeds.

---

### Task 3: Analyzer Integration For V2 Artifacts

**Files:**
- Modify: `src/construction/templates/schematicAnalyzer.js`
- Modify: `src/analyzeTemplateCorpus.js`
- Modify: `test/templateKnowledgeBaseV2.test.js`

**Interfaces:**
- Consumes: `writeTemplateKnowledgeBaseV2Artifacts()` from `templateKnowledgeBaseV2.js`
- Produces: `result.knowledgeBaseV2`
- Produces files under `outputDir`: `case_library.v2.json`, `retrieval_index.v2.json`, `template_priority_report.md`, `template_review_queue.md`

- [ ] **Step 1: Add the artifact writer integration test**

Extend `test/templateKnowledgeBaseV2.test.js` with:

```js
test('knowledge base v2 artifact writer result shape is analyzer-friendly', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-kb-v2-analyzer-'));
  const result = await writeTemplateKnowledgeBaseV2Artifacts({
    outputDir: root,
    generatedAt: '2026-07-09T00:00:00.000Z',
    caseLibrary: caseLibraryFixture(),
    templateIndex: templateIndexFixture(),
    designLawBook: { source: 'stage7-design-law-book-v1' }
  });

  assert.deepEqual(Object.keys(result).sort(), [
    'knowledgeBase',
    'knowledgeBaseFile',
    'priorityReportFile',
    'retrievalIndex',
    'retrievalIndexFile',
    'reviewQueueFile'
  ].sort());
  assert.equal(result.knowledgeBase.summary.case_count, 2);
  assert.equal(result.retrievalIndex.case_count, 2);
});
```

- [ ] **Step 2: Run the targeted test**

Run: `node --test test/templateKnowledgeBaseV2.test.js`

Expected: PASS before modifying the analyzer, proving the writer is ready for integration.

- [ ] **Step 3: Modify `schematicAnalyzer.js` to emit v2 artifacts**

In `src/construction/templates/schematicAnalyzer.js`:

1. Import `readFile` from `node:fs/promises` only if the file does not already have a suitable `fs` helper.
2. Import `parseTemplateReviewOverlay` and `mergeReviewRecords`.
3. Import `writeTemplateKnowledgeBaseV2Artifacts`.
4. After `caseLibrary` and `designLawBook` are created and written, read `mc_templates/curation/template_reviews.jsonl` if it exists.
5. Build `reviewOverlay = mergeReviewRecords(parseTemplateReviewOverlay(reviewText).records)`.
6. Call `writeTemplateKnowledgeBaseV2Artifacts({ outputDir: absoluteOutput, generatedAt, caseLibrary, templateIndex: { corpus, templates }, designLawBook, reviewOverlay, inputs })`.
7. Include `knowledgeBaseV2` in the returned `analyzeTemplateCorpus()` result.

The new return field must look like:

```js
knowledgeBaseV2: {
  summary: knowledgeBaseV2Result.knowledgeBase.summary,
  artifacts: {
    knowledgeBase: knowledgeBaseV2Result.knowledgeBaseFile,
    retrievalIndex: knowledgeBaseV2Result.retrievalIndexFile,
    priorityReport: knowledgeBaseV2Result.priorityReportFile,
    reviewQueue: knowledgeBaseV2Result.reviewQueueFile
  }
}
```

- [ ] **Step 4: Update `analyzeTemplateCorpus.js` console output**

In `src/analyzeTemplateCorpus.js`, after the existing Stage 7C output lines, add:

```js
if (result.knowledgeBaseV2?.summary) {
  console.log(`Stage 2 KB v2 cases: ${result.knowledgeBaseV2.summary.case_count}.`);
  console.log(`Stage 2 KB v2 review statuses: ${JSON.stringify(result.knowledgeBaseV2.summary.review_status_counts || {})}.`);
  console.log(`Stage 2 KB v2 case library: ${result.knowledgeBaseV2.artifacts.knowledgeBase}.`);
  console.log(`Stage 2 KB v2 retrieval index: ${result.knowledgeBaseV2.artifacts.retrievalIndex}.`);
  console.log(`Stage 2 KB v2 review queue: ${result.knowledgeBaseV2.artifacts.reviewQueue}.`);
}
```

- [ ] **Step 5: Run targeted tests**

Run:

```powershell
node --test test/templateReviewOverlay.test.js test/templateKnowledgeBaseV2.test.js
```

Expected: PASS for both files.

- [ ] **Step 6: Run offline analyzer smoke**

Run:

```powershell
npm run analyze:templates -- --offline
```

Expected: command exits `0` and prints lines beginning with `Stage 2 KB v2`.

Then inspect:

```powershell
Test-Path mc_templates\analysis\case_library.v2.json
Test-Path mc_templates\analysis\retrieval_index.v2.json
Test-Path mc_templates\analysis\template_priority_report.md
Test-Path mc_templates\analysis\template_review_queue.md
```

Expected: all four commands print `True`.

- [ ] **Step 7: Commit Task 3**

Run:

```powershell
git add src/construction/templates/schematicAnalyzer.js src/analyzeTemplateCorpus.js test/templateKnowledgeBaseV2.test.js mc_templates/analysis/case_library.v2.json mc_templates/analysis/retrieval_index.v2.json mc_templates/analysis/template_priority_report.md mc_templates/analysis/template_review_queue.md
git commit -m "feat: emit template knowledge base v2 artifacts"
```

Expected: commit succeeds. If generated analysis artifacts are intentionally excluded by `.gitignore`, stage only source and test files and mention that the smoke test generated the artifacts locally.

---

### Task 4: Explainable Retriever And Query CLI

**Files:**
- Create: `src/construction/templates/templateExplainableRetriever.js`
- Create: `src/queryTemplateKnowledge.js`
- Create: `test/templateExplainableRetriever.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `case_library.v2.json` shape from Task 2
- Produces: `new ExplainableTemplateRetriever({ knowledgeBase }).run({ prompt, context, limit }): object`
- Produces: `queryTemplateKnowledge({ argv, cwd, stdout, stderr }): Promise<number>`
- Produces script: `npm run query:templates -- "prompt"`

- [ ] **Step 1: Write the failing retriever tests**

Create `test/templateExplainableRetriever.test.js`:

```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ExplainableTemplateRetriever } from '../src/construction/templates/templateExplainableRetriever.js';

test('explainable retriever returns ranked references with explanations', () => {
  const retriever = new ExplainableTemplateRetriever({ knowledgeBase: knowledgeBaseFixture() });
  const result = retriever.run({
    prompt: '建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰',
    context: { style_family: 'modern', typology: 'house' },
    limit: 8
  });

  assert.equal(result.source, 'template-explainable-retriever-v1');
  assert.equal(result.active, true);
  assert.ok(result.references.length >= 3);
  assert.ok(result.references.length <= 8);
  assert.equal(result.references[0].case_id, 'house-modern-lake-villa');
  for (const item of result.references) {
    assert.ok(item.match_score > 0);
    assert.ok(item.matched_signals.length > 0);
    assert.ok(item.teaches.length > 0);
    assert.ok(item.risk_controls.length > 0);
    assert.ok(item.integration_targets.length > 0);
    assert.match(item.explanation, /Matches|Backfilled|匹配/i);
  }
});

test('explainable retriever excludes rejected cases and arena interiors for residential prompts', () => {
  const retriever = new ExplainableTemplateRetriever({ knowledgeBase: knowledgeBaseFixture() });
  const result = retriever.run({
    prompt: '建一个住宅，重点要室内家具、卧室、客厅和厨房',
    context: { typology: 'house' },
    limit: 8
  });

  assert.equal(result.references.some((item) => item.case_id === 'house-rejected'), false);
  const arena = result.references.find((item) => item.case_id === 'arenas-amphitheatre-arena');
  if (arena) {
    assert.equal(arena.teaches.some((unit) => unit.area === 'interior'), false);
  }
});

test('queryTemplateKnowledge CLI prints explained references from a provided v2 file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-query-kb-'));
  const kbFile = path.join(root, 'case_library.v2.json');
  await fs.writeFile(kbFile, `${JSON.stringify(knowledgeBaseFixture(), null, 2)}\n`, 'utf8');

  const result = spawnSync(process.execPath, [
    'src/queryTemplateKnowledge.js',
    '--knowledge-base',
    kbFile,
    '建一个湖边现代两层别墅，带大玻璃和精致内饰'
  ], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Template references/);
  assert.match(result.stdout, /Modern Lake Villa/);
  assert.match(result.stdout, /teaches/);
});

function knowledgeBaseFixture() {
  const unit = (id, area, claim, targets = ['TemplateKnowledgeAgent']) => ({
    id,
    area,
    claim,
    evidence: [`${area} evidence`],
    confidence: 0.85,
    use_as: [`${area} guidance`],
    avoid_when: ['do not copy block-for-block'],
    integration_targets: targets,
    source_fields: ['fixture']
  });
  return {
    source: 'template-knowledge-base-v2',
    schema_version: 2,
    cases: [
      {
        case_id: 'house-modern-lake-villa',
        title: 'Modern Lake Villa',
        file: 'House/Modern Lake Villa.schematic',
        identity: { style_family: 'modern', typology: 'house', category: 'House', scale_bucket: 'large' },
        review: { status: 'approved', confidence: 0.9 },
        tags: {
          style: [{ id: 'modern' }],
          typology: [{ id: 'house' }],
          site: [{ id: 'water-edge' }],
          facade: [{ id: 'large-glass' }],
          interior: [{ id: 'furnished' }],
          quality: [{ id: 'high-value-reference' }]
        },
        knowledge_units: [
          unit('lake-site', 'site', 'Connect public rooms to a water edge and deck.', ['TemplateSiteSceneStrategy']),
          unit('lake-facade', 'facade', 'Large glass should serve view-facing rooms.', ['FacadeAgent']),
          unit('lake-interior', 'interior', 'Use focal walls and layered lighting for inhabited rooms.', ['InteriorDetailAgent', 'DecoratorAgent'])
        ],
        priority: { global_score: 92, area_scores: { site: 90, facade: 86, interior: 84 }, risk_penalty: 0 },
        retrieval: { search_tokens: ['modern', 'lake', 'villa', 'water-edge', 'large-glass', 'interior'], prompt_affinities: ['modern', 'house', 'waterfront', 'large-glass', 'interior'], diversity_slots: ['site', 'facade', 'interior'], explanation_seeds: ['modern waterfront villa'] },
        risk_controls: ['change exact dimensions and detail placement; do not copy block-for-block']
      },
      {
        case_id: 'house-tavern',
        title: 'Tavern',
        file: 'House/Tavern.schematic',
        identity: { style_family: 'medieval', typology: 'house', category: 'House', scale_bucket: 'medium' },
        review: { status: 'pending', confidence: 0 },
        tags: { style: [{ id: 'medieval' }], typology: [{ id: 'house' }], interior: [{ id: 'furnished' }] },
        knowledge_units: [unit('tavern-interior', 'interior', 'Use social clusters and focal wall details.', ['InteriorDetailAgent', 'DecoratorAgent'])],
        priority: { global_score: 80, area_scores: { interior: 90 }, risk_penalty: 0 },
        retrieval: { search_tokens: ['tavern', 'house', 'interior', 'living'], prompt_affinities: ['house', 'interior'], diversity_slots: ['interior'], explanation_seeds: ['furnished residential interior'] },
        risk_controls: ['safe for normal template retrieval according to current evidence']
      },
      {
        case_id: 'house-watermill',
        title: 'Watermill',
        file: 'House/Watermill.schematic',
        identity: { style_family: 'coastal', typology: 'house', category: 'House', scale_bucket: 'medium' },
        review: { status: 'pending', confidence: 0 },
        tags: { style: [{ id: 'coastal' }], typology: [{ id: 'house' }], site: [{ id: 'water-edge' }] },
        knowledge_units: [unit('watermill-site', 'site', 'Use water edge transitions and foreground scene.', ['TemplateSiteSceneStrategy'])],
        priority: { global_score: 78, area_scores: { site: 88 }, risk_penalty: 0 },
        retrieval: { search_tokens: ['watermill', 'water-edge', 'coastal', 'house'], prompt_affinities: ['house', 'waterfront'], diversity_slots: ['site'], explanation_seeds: ['coastal water edge'] },
        risk_controls: ['scale details into the requested footprint']
      },
      {
        case_id: 'arenas-amphitheatre-arena',
        title: 'Amphitheatre Arena',
        file: 'Arenas/Amphitheatre Arena.schematic',
        identity: { style_family: 'classical', typology: 'arena', category: 'Arenas', scale_bucket: 'monumental' },
        review: { status: 'limited', confidence: 0.75, approved_learning_areas: ['site', 'massing'], blocked_learning_areas: ['interior'] },
        tags: { style: [{ id: 'classical' }], typology: [{ id: 'arena' }], site: [{ id: 'terrain-integrated' }] },
        knowledge_units: [unit('arena-site', 'site', 'Use terrain plinths and stepped arrival.', ['TemplateSiteSceneStrategy'])],
        priority: { global_score: 48, area_scores: { site: 82 }, risk_penalty: 20 },
        retrieval: { search_tokens: ['arena', 'terrain', 'classical'], prompt_affinities: ['terrain'], diversity_slots: ['site'], explanation_seeds: ['terrain plinth'] },
        risk_controls: ['use this case for exterior, site, public approach, or seating rhythm; do not mine domestic rooms']
      },
      {
        case_id: 'house-rejected',
        title: 'Rejected House',
        file: 'House/Rejected.schematic',
        identity: { style_family: 'modern', typology: 'house', category: 'House', scale_bucket: 'medium' },
        review: { status: 'rejected', confidence: 1 },
        tags: { style: [{ id: 'modern' }], typology: [{ id: 'house' }] },
        knowledge_units: [unit('rejected-site', 'site', 'Rejected case should not appear.')],
        priority: { global_score: 100, area_scores: { site: 100 }, risk_penalty: 0 },
        retrieval: { search_tokens: ['modern', 'house'], prompt_affinities: ['modern', 'house'], diversity_slots: ['site'], explanation_seeds: ['rejected'] },
        risk_controls: ['excluded by manual review']
      }
    ]
  };
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/templateExplainableRetriever.test.js`

Expected: FAIL with `Cannot find module '../src/construction/templates/templateExplainableRetriever.js'`.

- [ ] **Step 3: Implement the explainable retriever**

Create `src/construction/templates/templateExplainableRetriever.js`:

```js
const SOURCE = 'template-explainable-retriever-v1';

export class ExplainableTemplateRetriever {
  constructor({ knowledgeBase } = {}) {
    this.knowledgeBase = knowledgeBase || {};
  }

  run({ prompt = '', context = {}, limit = 8 } = {}) {
    const cases = Array.isArray(this.knowledgeBase.cases) ? this.knowledgeBase.cases : [];
    if (!cases.length) return inactive('case library v2 not found or empty', prompt);
    const promptTokens = tokenSet(prompt, context);
    const scored = cases
      .filter((item) => item.review?.status !== 'rejected')
      .map((item) => scoreCase(item, promptTokens, context))
      .filter((item) => item.match_score > 0)
      .sort((a, b) => b.match_score - a.match_score || a.title.localeCompare(b.title));
    const selected = selectDiverse(scored, clampLimit(limit));
    const backfilled = backfillIfNeeded(selected, scored, clampLimit(limit));
    return {
      source: SOURCE,
      active: backfilled.length > 0,
      prompt,
      references: backfilled.map((item, index) => explainReference(item, index + 1, promptTokens, context)),
      warnings: warningsFor(backfilled, scored)
    };
  }
}

function inactive(reason, prompt) {
  return { source: SOURCE, active: false, prompt, references: [], warnings: [reason] };
}
```

Add helper functions in the same file:

```js
function scoreCase(item, promptTokens, context) {
  const tokens = new Set([...(item.retrieval?.search_tokens || []), ...(item.retrieval?.prompt_affinities || [])].map(normalizeToken));
  const matched = [...promptTokens].filter((token) => tokens.has(token) || tokens.has(aliasToken(token)));
  const style = normalizeToken(context.style_family || context.style || '');
  const typology = normalizeToken(context.typology || '');
  const styleScore = style && normalizeToken(item.identity?.style_family) === style ? 18 : 0;
  const typologyScore = typology && normalizeToken(item.identity?.typology) === typology ? 14 : 0;
  const unitScore = Math.min(24, (item.knowledge_units || []).length * 4);
  const reviewBonus = item.review?.status === 'approved' ? 14 : item.review?.status === 'limited' ? 4 : 0;
  const riskPenalty = Number(item.priority?.risk_penalty || 0);
  return {
    ...item,
    match_score: Math.max(0, Math.round(matched.length * 8 + styleScore + typologyScore + unitScore + reviewBonus + Number(item.priority?.global_score || 0) * 0.18 - riskPenalty)),
    matched_signals: matched.map((token) => `token:${token}`)
  };
}

function explainReference(item, rank, promptTokens, context) {
  const residentialInterior = wantsResidentialInterior(promptTokens, context);
  const teaches = (item.knowledge_units || [])
    .filter((unit) => !(residentialInterior && item.identity?.typology === 'arena' && unit.area === 'interior'))
    .slice(0, 4)
    .map((unit) => ({ area: unit.area, claim: unit.claim, confidence: unit.confidence }));
  const targets = [...new Set((item.knowledge_units || []).flatMap((unit) => unit.integration_targets || []))].slice(0, 8);
  return {
    rank,
    case_id: item.case_id,
    title: item.title,
    file: item.file,
    match_score: item.match_score,
    diversity_slot: diversitySlot(item),
    matched_signals: item.matched_signals,
    teaches: teaches.length ? teaches : [{ area: 'risk', claim: 'Use only as a weak general reference because no safe knowledge units matched.', confidence: 0.3 }],
    risk_controls: item.risk_controls?.length ? item.risk_controls : ['change exact dimensions, room order, and detail placement so the result is not a block-for-block copy'],
    integration_targets: targets.length ? targets : ['TemplateKnowledgeAgent'],
    explanation: `${item.match_score >= 45 ? 'Matches' : 'Backfilled'} ${[item.identity?.style_family, item.identity?.typology, ...(item.retrieval?.explanation_seeds || [])].filter(Boolean).join(', ')}. Best used for ${teaches.map((unit) => unit.area).join(', ') || 'risk-controlled inspiration'}.`
  };
}
```

Include helpers `tokenSet`, `normalizeToken`, `aliasToken`, `selectDiverse`, `backfillIfNeeded`, `warningsFor`, `wantsResidentialInterior`, `diversitySlot`, and `clampLimit`. Keep all helper data local to the module.

- [ ] **Step 4: Implement the query CLI**

Create `src/queryTemplateKnowledge.js`:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { ExplainableTemplateRetriever } from './construction/templates/templateExplainableRetriever.js';

export async function queryTemplateKnowledge({ argv = process.argv.slice(2), cwd = process.cwd(), stdout = process.stdout, stderr = process.stderr } = {}) {
  const args = parseArgs(argv);
  const prompt = args._.join(' ').trim();
  const kbFile = path.resolve(cwd, args['knowledge-base'] || path.join('mc_templates', 'analysis', 'case_library.v2.json'));
  if (!prompt) {
    stderr.write('Usage: node src/queryTemplateKnowledge.js [--knowledge-base path] "prompt"\n');
    return 1;
  }
  let knowledgeBase;
  try {
    knowledgeBase = JSON.parse(await fs.readFile(kbFile, 'utf8'));
  } catch (error) {
    stderr.write(`Could not read knowledge base: ${kbFile}\n${error.message}\n`);
    return 1;
  }
  const result = new ExplainableTemplateRetriever({ knowledgeBase }).run({
    prompt,
    context: { style_family: args.style || '', typology: args.typology || '' },
    limit: args.limit ? Number(args.limit) : 8
  });
  stdout.write(renderResult(result));
  return result.active ? 0 : 1;
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[index + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        index += 1;
      } else {
        result[key] = 'true';
      }
    } else {
      result._.push(arg);
    }
  }
  return result;
}

function renderResult(result) {
  const lines = ['# Template references', ''];
  for (const ref of result.references || []) {
    lines.push(`${ref.rank}. ${ref.title} (${ref.case_id}) score=${ref.match_score}`);
    lines.push(`   teaches: ${ref.teaches.map((item) => `${item.area}: ${item.claim}`).join(' | ')}`);
    lines.push(`   risks: ${ref.risk_controls.join(' | ')}`);
  }
  for (const warning of result.warnings || []) lines.push(`warning: ${warning}`);
  return `${lines.join('\n')}\n`;
}

if (import.meta.url === `file://${process.argv[1].replaceAll('\\', '/')}` || process.argv[1]?.endsWith('queryTemplateKnowledge.js')) {
  const exitCode = await queryTemplateKnowledge();
  process.exitCode = exitCode;
}
```

- [ ] **Step 5: Add the npm script**

Modify `package.json` scripts:

```json
"query:templates": "node src/queryTemplateKnowledge.js"
```

Keep the existing scripts unchanged.

- [ ] **Step 6: Run the retriever tests**

Run: `node --test test/templateExplainableRetriever.test.js`

Expected: PASS with 3 passing subtests.

- [ ] **Step 7: Run the query smoke command**

Run:

```powershell
npm run query:templates -- "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
```

Expected: command exits `0` and prints `# Template references` plus 3-8 ranked references.

- [ ] **Step 8: Commit Task 4**

Run:

```powershell
git add src/construction/templates/templateExplainableRetriever.js src/queryTemplateKnowledge.js test/templateExplainableRetriever.test.js package.json package-lock.json
git commit -m "feat: add explainable template retrieval"
```

Expected: commit succeeds. If `package-lock.json` is unchanged, omit it from `git add`.

---

### Task 5: Runtime V2 Adapter And Report Section

**Files:**
- Modify: `src/construction/agents/templateKnowledgeAgent.js`
- Modify: `src/construction/workflow.js`
- Modify: `test/templateCaseLibrary.test.js`
- Modify: `test/pipeline.test.js`

**Interfaces:**
- Consumes: `ExplainableTemplateRetriever`
- Produces: `templateKnowledge.knowledge_base_version`
- Produces: `templateKnowledge.retrieval_explanation`
- Produces: `blueprint.templateKnowledge.retrieval_explanation`
- Produces report section: `## 模板参考记忆`

- [ ] **Step 1: Extend TemplateKnowledgeAgent tests**

In `test/templateCaseLibrary.test.js`, extend `TemplateKnowledgeAgent carries stage 7 case clauses into recommendations` by writing a v2 file next to the existing temporary `case_library.json`:

```js
await fs.writeFile(path.join(root, 'case_library.v2.json'), `${JSON.stringify({
  source: 'template-knowledge-base-v2',
  schema_version: 2,
  cases: [
    {
      case_id: 'house-modern-lake-villa',
      title: 'Modern Lake Villa',
      file: 'House/Modern Lake Villa.schematic',
      identity: { style_family: 'modern', typology: 'house', category: 'House', scale_bucket: 'large' },
      review: { status: 'approved', confidence: 0.9 },
      tags: { style: [{ id: 'modern' }], typology: [{ id: 'house' }], site: [{ id: 'water-edge' }], facade: [{ id: 'large-glass' }] },
      knowledge_units: [
        {
          id: 'lake-site',
          area: 'site',
          claim: 'Connect public rooms to a water edge and deck.',
          evidence: ['fixture'],
          confidence: 0.85,
          use_as: ['site composition'],
          avoid_when: ['do not copy block-for-block'],
          integration_targets: ['TemplateSiteSceneStrategy'],
          source_fields: ['fixture']
        }
      ],
      priority: { global_score: 92, area_scores: { site: 90 }, risk_penalty: 0 },
      retrieval: { search_tokens: ['modern', 'lake', 'villa', 'water-edge'], prompt_affinities: ['modern', 'house', 'waterfront'], diversity_slots: ['site'], explanation_seeds: ['modern waterfront villa'] },
      risk_controls: ['change exact dimensions and detail placement; do not copy block-for-block']
    }
  ]
}, null, 2)}\n`, 'utf8');
```

Add assertions after the existing `knowledge` assertions:

```js
assert.equal(knowledge.knowledge_base_version, 2);
assert.ok(knowledge.retrieval_explanation.active);
assert.ok(knowledge.retrieval_explanation.references.length >= 1);
assert.equal(knowledge.retrieval_explanation.references[0].case_id, 'house-modern-lake-villa');
assert.ok(knowledge.retrieval_explanation.references[0].teaches.length > 0);
```

- [ ] **Step 2: Run the extended TemplateKnowledgeAgent test to verify it fails**

Run: `node --test test/templateCaseLibrary.test.js`

Expected: FAIL because `knowledge.knowledge_base_version` and `knowledge.retrieval_explanation` do not exist.

- [ ] **Step 3: Load v2 knowledge in TemplateKnowledgeAgent**

In `src/construction/agents/templateKnowledgeAgent.js`:

1. Import `ExplainableTemplateRetriever`.
2. In `loadCorpus()`, after reading `case_library.json`, try to read `case_library.v2.json`.
3. Store it as `corpus.case_library_v2`.
4. In `run()`, after `recommendations` and `designLawPack` are built, run:

```js
const retrievalExplanation = corpus.case_library_v2
  ? new ExplainableTemplateRetriever({ knowledgeBase: corpus.case_library_v2 }).run({
      prompt,
      context: {
        style_family: recommendations.style_family,
        typology: recommendations.typology
      },
      limit: 8
    })
  : {
      source: 'template-explainable-retriever-v1',
      active: false,
      prompt,
      references: [],
      warnings: ['case library v2 not found; using v1 template knowledge']
    };
```

5. Add these fields to the returned object:

```js
knowledge_base_version: corpus.case_library_v2 ? 2 : 1,
retrieval_explanation: retrievalExplanation,
```

Do not change existing `retrieved` and `recommendations` behavior in this task.

- [ ] **Step 4: Run TemplateKnowledgeAgent tests**

Run: `node --test test/templateCaseLibrary.test.js`

Expected: PASS.

- [ ] **Step 5: Extend workflow report test**

If `test/pipeline.test.js` has an assertion block for `run_report.md`, add:

```js
assert.match(report, /模板参考记忆/);
assert.match(report, /参考案例|Template references|Modern|House|模板/);
```

If that test fixture does not load v2 artifacts, assert the fallback line instead:

```js
assert.match(report, /模板参考记忆/);
assert.match(report, /v2 not found|未启用|using v1/i);
```

- [ ] **Step 6: Run workflow report test to verify it fails**

Run: `node --test test/pipeline.test.js`

Expected: FAIL because `run_report.md` does not contain `模板参考记忆`.

- [ ] **Step 7: Render the report section**

In `src/construction/workflow.js`, find the Markdown report renderer. Add a helper:

```js
function renderTemplateMemorySection(blueprint = {}) {
  const explanation = blueprint.templateKnowledge?.retrieval_explanation || {};
  const refs = explanation.references || [];
  if (!refs.length) {
    const reason = (explanation.warnings || []).join('; ') || '模板知识库 v2 未启用，当前使用 v1 模板知识。';
    return `## 模板参考记忆\n\n- ${reason}\n`;
  }
  return `## 模板参考记忆\n\n${refs.slice(0, 8).map((item) => {
    const teaches = (item.teaches || []).slice(0, 2).map((unit) => `${unit.area}: ${unit.claim}`).join('；');
    const risks = (item.risk_controls || []).slice(0, 1).join('；');
    return `- ${item.title}: 匹配 ${(item.matched_signals || []).slice(0, 4).join(' / ') || item.diversity_slot}。学习 ${teaches || '通用构图参考'}；控制 ${risks || '不复制原模板细节'}。`;
  }).join('\n')}\n`;
}
```

Add the helper output to the existing `run_report.md` content after the template score/knowledge lines and before artifact links.

- [ ] **Step 8: Run runtime tests**

Run:

```powershell
node --test test/templateCaseLibrary.test.js test/pipeline.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit Task 5**

Run:

```powershell
git add src/construction/agents/templateKnowledgeAgent.js src/construction/workflow.js test/templateCaseLibrary.test.js test/pipeline.test.js
git commit -m "feat: surface template memory explanations"
```

Expected: commit succeeds.

---

### Task 6: Full Verification And Stage 2 Smoke Test

**Files:**
- No new source files unless verification exposes a defect.

**Interfaces:**
- Verifies: `npm test`
- Verifies: `npm run analyze:templates -- --offline`
- Verifies: `npm run query:templates -- "prompt"`
- Verifies: `npm start -- --mode mock --seed 7101 "prompt"`

- [ ] **Step 1: Run focused Stage 2 tests**

Run:

```powershell
node --test test/templateReviewOverlay.test.js test/templateKnowledgeBaseV2.test.js test/templateExplainableRetriever.test.js test/templateCaseLibrary.test.js
```

Expected: all tests pass with exit code `0`.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: all tests pass with exit code `0`.

- [ ] **Step 3: Refresh offline template analysis**

Run:

```powershell
npm run analyze:templates -- --offline
```

Expected: command exits `0`, prints existing Stage 7 lines, and prints:

```text
Stage 2 KB v2 cases: 64.
Stage 2 KB v2 case library: <path>\case_library.v2.json.
Stage 2 KB v2 retrieval index: <path>\retrieval_index.v2.json.
```

- [ ] **Step 4: Inspect v2 artifacts**

Run:

```powershell
Get-Content mc_templates\analysis\case_library.v2.json -Raw | ConvertFrom-Json | Select-Object source,schema_version
Get-Content mc_templates\analysis\template_review_queue.md -TotalCount 20
Get-Content mc_templates\analysis\template_priority_report.md -TotalCount 20
```

Expected:

- `source` is `template-knowledge-base-v2`.
- `schema_version` is `2`.
- Both Markdown reports have title lines.

- [ ] **Step 5: Run query smoke**

Run:

```powershell
npm run query:templates -- "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
```

Expected: command exits `0` and prints `# Template references` plus 3-8 ranked references with `teaches` and `risks` lines.

- [ ] **Step 6: Run generation smoke**

Run:

```powershell
npm start -- --mode mock --seed 7101 "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
```

Expected: command exits `0` and prints an `out/<timestamp>` path.

- [ ] **Step 7: Inspect generated report**

Use the output directory from Step 6:

```powershell
Select-String -Path <outputDir>\run_report.md -Pattern "模板参考记忆|学习|控制"
```

Expected: report includes `模板参考记忆` and at least one reference line, or a clear fallback line if v2 artifacts were unavailable.

- [ ] **Step 8: Check git status**

Run: `git status --short`

Expected: only intentional Stage 2 files are changed. Generated `out/` directories must not be staged.

- [ ] **Step 9: Commit verification fixes or final generated artifacts**

If Step 3 produced tracked generated analysis artifacts that should be committed, run:

```powershell
git add mc_templates/analysis/case_library.v2.json mc_templates/analysis/retrieval_index.v2.json mc_templates/analysis/template_priority_report.md mc_templates/analysis/template_review_queue.md
git commit -m "data: refresh template knowledge base v2"
```

If the generated artifacts are ignored or intentionally local, do not commit them. Record their local paths in the final response.

---

## Completion Criteria

Implementation is complete only after fresh verification shows:

- `npm test` exits `0`.
- `npm run analyze:templates -- --offline` exits `0`.
- `case_library.v2.json` and `retrieval_index.v2.json` are generated locally.
- `npm run query:templates -- "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"` exits `0`.
- Mock generation exits `0`.
- The generated `run_report.md` contains `模板参考记忆`.
- `git status --short` contains no accidental `out/`, `.tmp/`, `.env`, or unrelated files staged for commit.
