# Stage 5 Neural Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Stage 5 neural-assist template memory so offline analysis writes label suggestions and deterministic embedding artifacts, query/evaluation can inspect fusion retrieval, and runtime can opt into neural fusion with rule-only fallback.

**Architecture:** Add three focused template modules: `templateNeuralLabels.js` for advisory tag/review suggestions, `templateEmbeddingIndex.js` for deterministic token-vector indexes, and `templateNeuralRetriever.js` for fusion ranking over the existing `ExplainableTemplateRetriever`. Wire artifact generation into offline template analysis, expose query/evaluation CLIs, and pass an explicit runtime option through `index.js -> pipeline.js -> workflow.js -> TemplateKnowledgeAgent`.

**Tech Stack:** Node.js 20+ ESM, built-in `node:test`, built-in `fs/path/crypto`, existing Template KB v2 artifacts, no Python, no online model calls in runtime.

## Global Constraints

- The main Minecraft construction pipeline must remain deterministic, inspectable, and safe to run without API keys.
- Runtime generation may read neural artifacts for fusion ranking, but it never depends on live model calls.
- If neural artifacts are missing, disabled, stale, or invalid, the system falls back to the current `ExplainableTemplateRetriever` and keeps normal mock mode behavior.
- Keep human review overlays as the only source of final approval, limitation, or rejection.
- Do not make Python required for normal generation, tests, or offline mock analysis.
- Do not let model suggestions directly mark a case as `approved`, `limited`, or `rejected`.
- Do not call live embedding or LLM APIs from `npm start`.
- No Stage 5 MVP change should let neural retrieval directly rewrite geometry, room layout, material palettes, or datapack commands.
- Runtime remains rule-only by default in the MVP.
- Runtime uses fusion only when `--neural-retrieval` or an equivalent explicit option is set.

---

## File Structure

- Create `src/construction/templates/templateNeuralLabels.js`
  - Owns Stage 5 label suggestion records, generated-label JSONL parsing, taxonomy alias mapping, review guidance, and artifact writing.

- Create `src/construction/templates/templateEmbeddingIndex.js`
  - Owns case document creation, deterministic token vectors, index writing, vector validation, and cosine query helpers.

- Create `src/construction/templates/templateNeuralRetriever.js`
  - Owns fusion retrieval and fallback around `ExplainableTemplateRetriever`.

- Create `src/evaluateTemplateRetrieval.js`
  - Owns fixed retrieval evaluation set creation, report rendering, and CLI execution.

- Modify `src/construction/templates/schematicAnalyzer.js`
  - Writes Stage 5 artifacts after Template KB v2 artifacts.

- Modify `src/analyzeTemplateCorpus.js`
  - Prints Stage 5 artifact paths when offline analysis writes them.

- Modify `src/queryTemplateKnowledge.js`
  - Adds `--neural`, `--no-neural`, and `--embedding-index`.

- Modify `src/construction/agents/templateKnowledgeAgent.js`
  - Loads `embedding_index.json`, accepts `neuralRetrieval`, and chooses rule-only or fusion retrieval.

- Modify `src/construction/workflow.js`
  - Accepts `neuralRetrieval`, passes it to `TemplateKnowledgeAgent`, and adds retrieval mode to the run report template section.

- Modify `src/pipeline.js`
  - Passes `neuralRetrieval` through single and candidate runs.

- Modify `src/index.js`
  - Parses `--neural-retrieval` and `--no-neural-retrieval`, updates help text, and passes the option.

- Modify `package.json`
  - Adds `evaluate:retrieval`.

- Create tests:
  - `test/templateNeuralLabels.test.js`
  - `test/templateEmbeddingIndex.test.js`
  - `test/templateNeuralRetriever.test.js`
  - `test/templateRetrievalEvaluation.test.js`
  - Add focused assertions to `test/templateExplainableRetriever.test.js` or a new query test for `--neural`.
  - Add focused assertions to `test/criticPipeline.test.js` or a new pipeline test for runtime opt-in fallback.

---

### Task 1: Neural Label Suggestion Artifact

**Files:**
- Create: `src/construction/templates/templateNeuralLabels.js`
- Test: `test/templateNeuralLabels.test.js`

**Interfaces:**
- Consumes: `DEFAULT_TAG_TAXONOMY` and `validateTagRecord(tag, taxonomy)` from `src/construction/templates/templateTagTaxonomy.js`.
- Produces:
  - `parseGeneratedLabelsJsonl(text: string): { records: object[], errors: object[] }`
  - `buildNeuralLabelRecords({ knowledgeBase, generatedLabels, taxonomy }): object[]`
  - `writeNeuralLabelArtifacts({ outputDir, knowledgeBase, generatedLabels, taxonomy }): Promise<{ records, file }>`
  - `neuralLabelsJsonl(records: object[]): string`

- [ ] **Step 1: Write the failing tests**

Create `test/templateNeuralLabels.test.js`:

```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNeuralLabelRecords,
  neuralLabelsJsonl,
  parseGeneratedLabelsJsonl,
  writeNeuralLabelArtifacts
} from '../src/construction/templates/templateNeuralLabels.js';

test('neural label builder maps known generated aliases into normalized taxonomy suggestions', () => {
  const records = buildNeuralLabelRecords({
    knowledgeBase: knowledgeBaseFixture(),
    generatedLabels: [generatedLabelFixture()]
  });

  const modern = records.find((item) => item.case_id === 'house-modern-lake-villa');
  assert.ok(modern);
  assert.equal(modern.source, 'stage5-neural-labels-v1');
  assert.equal(modern.schema_version, 1);
  assert.equal(modern.review_guidance.suggested_status, 'limited');
  assert.equal(modern.review_guidance.needs_human_review, true);
  assert.deepEqual(modern.review_guidance.approved_learning_areas.sort(), ['facade', 'interior', 'site'].sort());
  assert.ok(modern.risk_notes.some((item) => /Human review overlay/i.test(item)));

  const tagKeys = modern.suggested_tags.map((tag) => `${tag.group}:${tag.id}`).sort();
  assert.ok(tagKeys.includes('facade:large-glass'));
  assert.ok(tagKeys.includes('interior:furnished'));
  assert.ok(tagKeys.includes('site:water-edge'));
  assert.ok(tagKeys.includes('site:garden'));
  assert.ok(tagKeys.includes('quality:high-value-reference'));
  assert.equal(modern.suggested_tags.every((tag) => tag.confidence > 0 && tag.confidence <= 1), true);
  assert.equal(modern.suggested_tags.every((tag) => tag.evidence.length > 0), true);
});

test('neural label builder preserves unknown aliases as review evidence', () => {
  const records = buildNeuralLabelRecords({
    knowledgeBase: knowledgeBaseFixture(),
    generatedLabels: [{
      ...generatedLabelFixture(),
      tags: ['glass-emphasis', 'strange-new-shape'],
      quality_tags: ['unmapped-quality-signal']
    }]
  });

  const modern = records.find((item) => item.case_id === 'house-modern-lake-villa');
  assert.ok(modern.unknown_suggestions.some((item) => item.raw === 'strange-new-shape'));
  assert.ok(modern.unknown_suggestions.some((item) => item.raw === 'unmapped-quality-signal'));
  assert.equal(modern.review_guidance.review_priority, 'high');
});

test('generated labels jsonl parser reports invalid lines without discarding valid records', () => {
  const parsed = parseGeneratedLabelsJsonl([
    JSON.stringify(generatedLabelFixture()),
    '{bad json',
    ''
  ].join('\n'));

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.errors[0].line, 2);
});

test('neural label artifact writer writes stable jsonl', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-neural-labels-'));
  try {
    const result = await writeNeuralLabelArtifacts({
      outputDir: root,
      knowledgeBase: knowledgeBaseFixture(),
      generatedLabels: [generatedLabelFixture()]
    });

    assert.ok(result.file.endsWith('neural_labels.jsonl'));
    const text = await fs.readFile(result.file, 'utf8');
    assert.match(text, /stage5-neural-labels-v1/);
    assert.equal(parseGeneratedLabelsJsonl(text).records.length, 1);
    assert.equal(neuralLabelsJsonl(result.records).endsWith('\n'), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function knowledgeBaseFixture() {
  return {
    source: 'template-knowledge-base-v2',
    schema_version: 2,
    cases: [
      {
        case_id: 'house-modern-lake-villa',
        title: 'Modern Lake Villa',
        file: 'House/Modern Lake Villa.schematic',
        identity: { category: 'House', typology: 'house', style_family: 'modern', scale_bucket: 'medium' },
        review: { status: 'pending', approved_learning_areas: [], blocked_learning_areas: [] },
        tags: {
          typology: [{ group: 'typology', id: 'house' }],
          style: [{ group: 'style', id: 'modern' }],
          site: [{ group: 'site', id: 'water-edge' }],
          facade: [],
          interior: [],
          quality: [],
          room_types: []
        },
        unknown_tags: [{ raw: 'glass-emphasis', reason: 'unmapped-tag-alias' }],
        knowledge_units: [
          { id: 'site', area: 'site', claim: 'Use water edge deck transitions.', confidence: 0.82 },
          { id: 'facade', area: 'facade', claim: 'Use large view glass.', confidence: 0.81 },
          { id: 'interior', area: 'interior', claim: 'Use layered lighting.', confidence: 0.79 }
        ],
        priority: { global_score: 88, risk_penalty: 8 },
        risk_controls: ['change exact dimensions and detail placement; do not copy block-for-block'],
        review_priority_signals: ['pending-review', 'unknown-taxonomy-tags']
      }
    ]
  };
}

function generatedLabelFixture() {
  return {
    file: 'House/Modern Lake Villa.schematic',
    title: 'Modern Lake Villa',
    style_family: 'modern',
    typology: 'house',
    tags: ['glass-emphasis', 'landscape-composition', 'water-edge'],
    quality_tags: ['interior-rich-reference', 'site-rich-reference'],
    learning_roles: ['interior_reference', 'water_edge', 'facade_detail'],
    composition_patterns: {
      facade: ['large_glass_bands'],
      site: ['foreground_scene', 'water_edge'],
      roof: ['flat_terrace_or_platform']
    },
    room_reference_candidates: ['living', 'bedroom']
  };
}
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node --test test/templateNeuralLabels.test.js
```

Expected: FAIL with `Cannot find module '../src/construction/templates/templateNeuralLabels.js'`.

- [ ] **Step 3: Implement the neural label module**

Create `src/construction/templates/templateNeuralLabels.js` with:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_TAG_TAXONOMY, validateTagRecord } from './templateTagTaxonomy.js';

export const NEURAL_LABEL_SOURCE = 'stage5-neural-labels-v1';
export const NEURAL_LABEL_SCHEMA_VERSION = 1;

const TAG_ALIASES = Object.freeze({
  'glass-emphasis': { group: 'facade', id: 'large-glass', confidence: 0.86 },
  'large-glass-or-panel-grid': { group: 'facade', id: 'large-glass', confidence: 0.82 },
  'landscape-composition': { group: 'site', id: 'garden', confidence: 0.8 },
  'terrain-integrated': { group: 'site', id: 'terrain-integrated', confidence: 0.86 },
  'water-edge': { group: 'site', id: 'water-edge', confidence: 0.9 },
  'waterfront-learning': { group: 'site', id: 'water-edge', confidence: 0.82 },
  'furnished-interior': { group: 'interior', id: 'furnished', confidence: 0.84 },
  'interior-rich-reference': { group: 'interior', id: 'room-layout-rich', confidence: 0.8 },
  'layered-interior': { group: 'interior', id: 'room-layout-rich', confidence: 0.74 },
  'furniture-pattern-rich': { group: 'interior', id: 'furniture-pattern-rich', confidence: 0.84 },
  'phase3-furniture-pattern-ready': { group: 'interior', id: 'furniture-pattern-rich', confidence: 0.82 },
  'vertical-circulation-reference': { group: 'interior', id: 'vertical-circulation', confidence: 0.78 },
  'library-study-reference': { group: 'interior', id: 'study-library', confidence: 0.78 },
  'facade-detail-rich': { group: 'quality', id: 'high-value-reference', confidence: 0.72 },
  'site-rich-reference': { group: 'quality', id: 'high-value-reference', confidence: 0.76 },
  'massing-usable': { group: 'quality', id: 'high-value-reference', confidence: 0.7 },
  'review-before-deep-mining': { group: 'quality', id: 'review-before-deep-mining', confidence: 0.88 },
  'exterior-only-reference': { group: 'quality', id: 'exterior-only', confidence: 0.88 },
  'micro-block-detailing': { group: 'facade', id: 'micro-depth-trim', confidence: 0.72 },
  'rail-and-fence-detail': { group: 'facade', id: 'rail-balcony', confidence: 0.7 },
  'formal-axis': { group: 'massing', id: 'balanced-axis', confidence: 0.76 },
  'vertical-icon': { group: 'massing', id: 'vertical-landmark', confidence: 0.78 }
});

const COMPOSITION_ALIASES = Object.freeze({
  large_glass_bands: { group: 'facade', id: 'large-glass', confidence: 0.88 },
  micro_depth_trim: { group: 'facade', id: 'micro-depth-trim', confidence: 0.82 },
  rail_balcony_edges: { group: 'facade', id: 'rail-balcony', confidence: 0.82 },
  lit_depth_points: { group: 'facade', id: 'lit-depth-points', confidence: 0.78 },
  formal_symmetry: { group: 'facade', id: 'formal-symmetry', confidence: 0.8 },
  terrain_plinth: { group: 'site', id: 'terrain-integrated', confidence: 0.84 },
  layered_terrain_base: { group: 'site', id: 'terrain-integrated', confidence: 0.82 },
  water_edge: { group: 'site', id: 'water-edge', confidence: 0.9 },
  waterfront_deck_massing: { group: 'site', id: 'water-edge', confidence: 0.86 },
  foreground_scene: { group: 'site', id: 'garden', confidence: 0.78 },
  garden_forecourt: { group: 'site', id: 'garden', confidence: 0.82 },
  courtyard_or_void: { group: 'massing', id: 'courtyard-or-void', confidence: 0.82 },
  compact_block: { group: 'massing', id: 'compact-block', confidence: 0.78 },
  long_bar: { group: 'massing', id: 'long-bar', confidence: 0.78 },
  balanced_axis: { group: 'massing', id: 'balanced-axis', confidence: 0.78 },
  vertical_landmark: { group: 'massing', id: 'vertical-landmark', confidence: 0.84 },
  stepped_terraces: { group: 'massing', id: 'stepped-terraces', confidence: 0.82 },
  flat_terrace_or_platform: { group: 'roof', id: 'flat-terrace', confidence: 0.82 },
  tower_cap: { group: 'roof', id: 'tower-cap', confidence: 0.78 },
  layered_eaves: { group: 'roof', id: 'layered-eaves', confidence: 0.82 },
  deep_overhang_edges: { group: 'roof', id: 'deep-overhang', confidence: 0.78 },
  stepped_roofline: { group: 'roof', id: 'stepped-roofline', confidence: 0.82 }
});

const ROOM_ALIASES = Object.freeze({
  living_or_hall: 'living',
  entry_or_lobby: 'entry-or-lobby',
  corridor_or_gallery: 'corridor-or-gallery',
  great_hall: 'chapel-or-ceremonial-hall',
  stairs_or_vertical_hall: 'corridor-or-gallery'
});

export function parseGeneratedLabelsJsonl(text = '') {
  const records = [];
  const errors = [];
  const lines = String(text || '').split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      errors.push({ line: index + 1, message: error.message });
    }
  }
  return { records, errors };
}

export function buildNeuralLabelRecords({
  knowledgeBase = {},
  generatedLabels = [],
  taxonomy = DEFAULT_TAG_TAXONOMY
} = {}) {
  const labelsByFile = new Map((generatedLabels || []).map((item) => [normalizePath(item.file), item]));
  return (knowledgeBase.cases || []).map((caseRecord) => {
    const generated = labelsByFile.get(normalizePath(caseRecord.file)) || {};
    return buildRecord(caseRecord, generated, taxonomy);
  });
}

export async function writeNeuralLabelArtifacts({
  outputDir,
  knowledgeBase = {},
  generatedLabels = [],
  taxonomy = DEFAULT_TAG_TAXONOMY
} = {}) {
  const records = buildNeuralLabelRecords({ knowledgeBase, generatedLabels, taxonomy });
  await fs.mkdir(outputDir, { recursive: true });
  const file = path.join(outputDir, 'neural_labels.jsonl');
  await fs.writeFile(file, neuralLabelsJsonl(records), 'utf8');
  return { records, file };
}

export function neuralLabelsJsonl(records = []) {
  return `${(records || []).map((item) => JSON.stringify(item)).join('\n')}\n`;
}

function buildRecord(caseRecord = {}, generated = {}, taxonomy = DEFAULT_TAG_TAXONOMY) {
  const suggestions = [];
  const unknown = [];
  const addSuggestion = (candidate, evidence) => {
    if (!candidate?.group || !candidate?.id) {
      if (candidate?.raw) unknown.push({ raw: candidate.raw, evidence, reason: 'unmapped-alias' });
      return;
    }
    const validation = validateTagRecord({
      group: candidate.group,
      id: candidate.id,
      confidence: candidate.confidence,
      source: 'deterministic-labeler',
      evidence
    }, taxonomy);
    if (!validation.ok) {
      unknown.push({ raw: candidate.raw || `${candidate.group}:${candidate.id}`, evidence, reason: validation.error });
      return;
    }
    const tag = {
      ...validation.normalized,
      evidence: Array.isArray(evidence) ? evidence : [String(evidence || '').trim()].filter(Boolean)
    };
    const existing = suggestions.find((item) => item.group === tag.group && item.id === tag.id);
    if (!existing) {
      suggestions.push(tag);
      return;
    }
    existing.confidence = Math.max(existing.confidence, tag.confidence);
    existing.evidence = [...new Set([...existing.evidence, ...tag.evidence])];
  };

  for (const tag of existingTags(caseRecord)) {
    addSuggestion({ group: tag.group, id: tag.id, confidence: Math.min(1, Number(tag.confidence || 0.72)) }, `existing v2 tag ${tag.group}:${tag.id}`);
  }
  for (const raw of stringArray(generated.tags)) addAlias(raw, `labels.generated tag ${raw}`, addSuggestion, unknown);
  for (const raw of stringArray(generated.quality_tags)) addAlias(raw, `labels.generated quality tag ${raw}`, addSuggestion, unknown);
  for (const raw of stringArray(generated.learning_roles)) addLearningRole(raw, addSuggestion, unknown);
  for (const raw of caseRecord.unknown_tags || []) addAlias(raw.raw || raw.id || raw, `case unknown tag ${raw.raw || raw.id || raw}`, addSuggestion, unknown);
  for (const [group, values] of Object.entries(generated.composition_patterns || {})) {
    for (const raw of stringArray(values)) addComposition(raw, group, addSuggestion, unknown);
  }
  for (const room of stringArray(generated.room_reference_candidates)) addRoom(room, addSuggestion, unknown);

  const learningAreas = suggestedLearningAreas(caseRecord, suggestions);
  const guidance = reviewGuidance(caseRecord, suggestions, learningAreas, unknown);
  return {
    source: NEURAL_LABEL_SOURCE,
    schema_version: NEURAL_LABEL_SCHEMA_VERSION,
    case_id: caseRecord.case_id,
    file: caseRecord.file,
    title: caseRecord.title || caseRecord.case_id,
    suggested_tags: suggestions.sort(sortTags),
    suggested_learning_areas: learningAreas,
    unknown_suggestions: unknown,
    review_guidance: guidance,
    risk_notes: [
      'Model suggestions do not approve the case. Human review overlay is still required.'
    ]
  };
}

function addAlias(raw, evidence, addSuggestion, unknown) {
  const key = normalizeToken(raw);
  const mapped = TAG_ALIASES[key];
  if (mapped) addSuggestion({ ...mapped, raw }, evidence);
  else unknown.push({ raw: String(raw || ''), evidence: [evidence], reason: 'unmapped-alias' });
}

function addComposition(raw, group, addSuggestion, unknown) {
  const key = normalizeToken(raw).replaceAll('-', '_');
  const mapped = COMPOSITION_ALIASES[key];
  if (mapped) addSuggestion({ ...mapped, raw }, `composition ${group} pattern ${raw}`);
  else unknown.push({ raw: String(raw || ''), evidence: [`composition ${group} pattern ${raw}`], reason: 'unmapped-composition-pattern' });
}

function addLearningRole(raw, addSuggestion, unknown) {
  const key = normalizeToken(raw).replaceAll('-', '_');
  if (key.includes('interior')) addSuggestion({ group: 'interior', id: 'furnished', confidence: 0.76, raw }, `learning role ${raw}`);
  else if (key.includes('water_edge')) addSuggestion({ group: 'site', id: 'water-edge', confidence: 0.82, raw }, `learning role ${raw}`);
  else if (key.includes('garden')) addSuggestion({ group: 'site', id: 'garden', confidence: 0.78, raw }, `learning role ${raw}`);
  else if (key.includes('terrain')) addSuggestion({ group: 'site', id: 'terrain-integrated', confidence: 0.78, raw }, `learning role ${raw}`);
  else if (key.includes('facade')) addSuggestion({ group: 'facade', id: 'micro-depth-trim', confidence: 0.68, raw }, `learning role ${raw}`);
  else unknown.push({ raw: String(raw || ''), evidence: [`learning role ${raw}`], reason: 'unmapped-learning-role' });
}

function addRoom(raw, addSuggestion, unknown) {
  const id = ROOM_ALIASES[normalizeToken(raw).replaceAll('-', '_')] || normalizeToken(raw);
  if (!id) return;
  addSuggestion({ group: 'room_types', id, confidence: 0.72, raw }, `room reference candidate ${raw}`);
}

function suggestedLearningAreas(caseRecord = {}, suggestions = []) {
  const areas = new Map();
  for (const unit of caseRecord.knowledge_units || []) {
    const area = normalizeToken(unit.area);
    if (!area) continue;
    areas.set(area, {
      area,
      confidence: Math.max(Number(areas.get(area)?.confidence || 0), Number(unit.confidence || 0.65)),
      evidence: [`knowledge unit ${area} confidence ${Number(unit.confidence || 0.65)}`]
    });
  }
  for (const tag of suggestions) {
    const area = tagGroupToArea(tag.group);
    if (!area) continue;
    const existing = areas.get(area);
    if (existing) {
      existing.confidence = Math.max(existing.confidence, tag.confidence);
      existing.evidence.push(`suggested tag ${tag.group}:${tag.id}`);
    } else {
      areas.set(area, { area, confidence: tag.confidence, evidence: [`suggested tag ${tag.group}:${tag.id}`] });
    }
  }
  return [...areas.values()]
    .map((item) => ({ ...item, confidence: round01(item.confidence), evidence: [...new Set(item.evidence)] }))
    .sort((a, b) => a.area.localeCompare(b.area));
}

function reviewGuidance(caseRecord = {}, suggestions = [], learningAreas = [], unknown = []) {
  const safeAreas = learningAreas
    .filter((item) => item.confidence >= 0.72 && item.area !== 'risk')
    .map((item) => item.area)
    .sort();
  const riskPenalty = Number(caseRecord.priority?.risk_penalty || 0);
  const reviewSignals = caseRecord.review_priority_signals || [];
  const needsHumanReview = caseRecord.review?.status === 'pending' || unknown.length > 0 || reviewSignals.length > 0;
  const suggestedStatus = riskPenalty >= 18 ? 'limited' : safeAreas.length >= 2 ? 'limited' : 'pending';
  return {
    suggested_status: suggestedStatus,
    approved_learning_areas: safeAreas,
    blocked_learning_areas: riskPenalty >= 18 ? ['interior'] : [],
    needs_human_review: needsHumanReview,
    review_priority: unknown.length || Number(caseRecord.priority?.global_score || 0) >= 80 ? 'high' : 'normal',
    reason: needsHumanReview
      ? 'pending or ambiguous case with Stage 5 label suggestions'
      : 'case has enough deterministic evidence for low-priority review'
  };
}

function existingTags(caseRecord = {}) {
  return Object.entries(caseRecord.tags || {}).flatMap(([group, values]) =>
    (Array.isArray(values) ? values : []).map((tag) => ({ ...tag, group: tag.group || group }))
  );
}

function tagGroupToArea(group) {
  if (['site', 'massing', 'facade', 'roof', 'interior'].includes(group)) return group;
  if (group === 'room_types') return 'interior';
  return '';
}

function stringArray(value) {
  if (Array.isArray(value)) return value.flatMap((item) => stringArray(item));
  if (value === undefined || value === null) return [];
  return [String(value).trim()].filter(Boolean);
}

function normalizePath(value = '') {
  return String(value || '').replaceAll('\\', '/').toLowerCase();
}

function normalizeToken(value = '') {
  return String(value || '').trim().toLowerCase().replaceAll('_', '-');
}

function sortTags(a, b) {
  return a.group.localeCompare(b.group) || a.id.localeCompare(b.id);
}

function round01(value) {
  return Math.round(Math.max(0, Math.min(1, Number(value || 0))) * 100) / 100;
}
```

- [ ] **Step 4: Run the task test**

Run:

```powershell
node --test test/templateNeuralLabels.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/construction/templates/templateNeuralLabels.js test/templateNeuralLabels.test.js
git commit -m "feat: add stage 5 neural label suggestions"
```

---

### Task 2: Deterministic Embedding Index

**Files:**
- Create: `src/construction/templates/templateEmbeddingIndex.js`
- Test: `test/templateEmbeddingIndex.test.js`

**Interfaces:**
- Consumes: neural label records from Task 1.
- Produces:
  - `buildCaseEmbeddingDocument(caseRecord, labelRecord): { document, tokens, areas, risk_penalty }`
  - `vectorizeText(text: string, options?: { dimensions?: number }): number[]`
  - `buildTemplateEmbeddingIndex({ knowledgeBase, neuralLabels, generatedAt, dimensions }): object`
  - `queryEmbeddingIndex({ index, prompt, limit }): object[]`
  - `validateEmbeddingIndex(index, knowledgeBase): { ok, validCaseIds, staleCaseIds, warnings }`
  - `writeTemplateEmbeddingIndexArtifact({ outputDir, knowledgeBase, neuralLabels, generatedAt }): Promise<{ index, file }>`

- [ ] **Step 1: Write the failing tests**

Create `test/templateEmbeddingIndex.test.js`:

```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCaseEmbeddingDocument,
  buildTemplateEmbeddingIndex,
  queryEmbeddingIndex,
  validateEmbeddingIndex,
  vectorizeText,
  writeTemplateEmbeddingIndexArtifact
} from '../src/construction/templates/templateEmbeddingIndex.js';

test('case embedding document includes identity, tags, learning areas, and suggestions', () => {
  const document = buildCaseEmbeddingDocument(caseFixture(), neuralLabelFixture());

  assert.match(document.document, /Modern Lake Villa/);
  assert.match(document.document, /modern/);
  assert.match(document.document, /water-edge/);
  assert.match(document.document, /large-glass/);
  assert.ok(document.tokens.includes('modern'));
  assert.ok(document.tokens.includes('large-glass'));
  assert.ok(document.areas.includes('facade'));
  assert.equal(document.risk_penalty, 8);
});

test('deterministic token vectors are stable and normalized', () => {
  const first = vectorizeText('modern house large glass water edge', { dimensions: 32 });
  const second = vectorizeText('modern house large glass water edge', { dimensions: 32 });
  const norm = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));

  assert.deepEqual(first, second);
  assert.equal(first.length, 32);
  assert.ok(Math.abs(norm - 1) < 0.000001);
});

test('embedding index query ranks matching cases above unrelated cases', () => {
  const index = buildTemplateEmbeddingIndex({
    knowledgeBase: { cases: [caseFixture(), tavernFixture()] },
    neuralLabels: [neuralLabelFixture()],
    generatedAt: '2026-07-09T00:00:00.000Z',
    dimensions: 64
  });

  const matches = queryEmbeddingIndex({
    index,
    prompt: 'lakeside modern villa with large glass and water deck',
    limit: 2
  });

  assert.equal(matches[0].case_id, 'house-modern-lake-villa');
  assert.ok(matches[0].embedding_score > matches[1].embedding_score);
});

test('embedding validation detects stale case versions', () => {
  const index = buildTemplateEmbeddingIndex({
    knowledgeBase: { cases: [caseFixture()] },
    neuralLabels: [neuralLabelFixture()],
    generatedAt: '2026-07-09T00:00:00.000Z',
    dimensions: 32
  });
  const changed = { ...caseFixture(), case_version: 'sha256:changed' };

  const validation = validateEmbeddingIndex(index, { cases: [changed] });

  assert.equal(validation.ok, false);
  assert.deepEqual(validation.staleCaseIds, ['house-modern-lake-villa']);
  assert.ok(validation.warnings.some((item) => /stale/i.test(item)));
});

test('embedding artifact writer persists index json', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-embedding-index-'));
  try {
    const result = await writeTemplateEmbeddingIndexArtifact({
      outputDir: root,
      knowledgeBase: { cases: [caseFixture()] },
      neuralLabels: [neuralLabelFixture()],
      generatedAt: '2026-07-09T00:00:00.000Z'
    });

    const parsed = JSON.parse(await fs.readFile(result.file, 'utf8'));
    assert.equal(parsed.source, 'stage5-template-embedding-index-v1');
    assert.equal(parsed.case_count, 1);
    assert.equal(parsed.cases[0].case_id, 'house-modern-lake-villa');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function caseFixture() {
  return {
    case_id: 'house-modern-lake-villa',
    case_version: 'sha256:modern',
    title: 'Modern Lake Villa',
    file: 'House/Modern Lake Villa.schematic',
    identity: { category: 'House', typology: 'house', style_family: 'modern', scale_bucket: 'medium' },
    review: { status: 'pending' },
    tags: {
      typology: [{ id: 'house' }],
      style: [{ id: 'modern' }],
      site: [{ id: 'water-edge' }],
      facade: [{ id: 'large-glass' }]
    },
    knowledge_units: [
      { area: 'site', claim: 'Use water edge deck transitions.' },
      { area: 'facade', claim: 'Use large view glass.' }
    ],
    retrieval: { search_tokens: ['modern', 'house', 'water-edge'], prompt_affinities: ['large-glass'] },
    priority: { risk_penalty: 8 },
    risk_controls: ['do not copy exact dimensions'],
    review_flags: []
  };
}

function tavernFixture() {
  return {
    ...caseFixture(),
    case_id: 'house-tavern',
    case_version: 'sha256:tavern',
    title: 'Medieval Tavern',
    file: 'House/Tavern.schematic',
    identity: { category: 'House', typology: 'house', style_family: 'medieval', scale_bucket: 'medium' },
    tags: { typology: [{ id: 'house' }], style: [{ id: 'medieval' }], interior: [{ id: 'furnished' }] },
    knowledge_units: [{ area: 'interior', claim: 'Use social furniture clusters.' }],
    retrieval: { search_tokens: ['medieval', 'tavern', 'interior'], prompt_affinities: ['furnished'] },
    priority: { risk_penalty: 0 }
  };
}

function neuralLabelFixture() {
  return {
    case_id: 'house-modern-lake-villa',
    suggested_tags: [
      { group: 'facade', id: 'large-glass', confidence: 0.86, evidence: ['fixture'] },
      { group: 'site', id: 'water-edge', confidence: 0.9, evidence: ['fixture'] }
    ],
    suggested_learning_areas: [
      { area: 'facade', confidence: 0.86, evidence: ['fixture'] },
      { area: 'site', confidence: 0.9, evidence: ['fixture'] }
    ]
  };
}
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node --test test/templateEmbeddingIndex.test.js
```

Expected: FAIL with `Cannot find module '../src/construction/templates/templateEmbeddingIndex.js'`.

- [ ] **Step 3: Implement the embedding index module**

Create `src/construction/templates/templateEmbeddingIndex.js` with:

```js
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const EMBEDDING_INDEX_SOURCE = 'stage5-template-embedding-index-v1';
export const EMBEDDING_INDEX_SCHEMA_VERSION = 1;
const DEFAULT_DIMENSIONS = 256;

const TOKEN_ALIASES = Object.freeze({
  waterfront: 'water-edge',
  lakefront: 'water-edge',
  lakeside: 'water-edge',
  lake: 'water-edge',
  glass: 'large-glass',
  windows: 'large-glass',
  window: 'large-glass',
  villa: 'house',
  home: 'house',
  residence: 'house',
  furnished: 'interior'
});

export function buildCaseEmbeddingDocument(caseRecord = {}, labelRecord = {}) {
  const tokens = new Set();
  const parts = [];
  const add = (value, weightLabel = '') => {
    for (const token of tokenize(value)) {
      tokens.add(token);
      parts.push(weightLabel ? `${weightLabel}:${token}` : token);
    }
  };

  add(caseRecord.title, 'title');
  add(caseRecord.file, 'file');
  add(caseRecord.identity?.category, 'identity');
  add(caseRecord.identity?.typology, 'identity');
  add(caseRecord.identity?.style_family, 'identity');
  add(caseRecord.identity?.scale_bucket, 'identity');

  for (const [group, values] of Object.entries(caseRecord.tags || {})) {
    for (const tag of Array.isArray(values) ? values : []) {
      add(group, 'tag-group');
      add(tag.id || tag.label, 'tag');
    }
  }
  for (const tag of labelRecord.suggested_tags || []) {
    add(tag.group, 'suggested-tag-group');
    add(tag.id, 'suggested-tag');
  }
  for (const unit of caseRecord.knowledge_units || []) {
    add(unit.area, 'area');
    add(unit.claim, 'claim');
  }
  for (const area of labelRecord.suggested_learning_areas || []) add(area.area, 'suggested-area');
  for (const token of caseRecord.retrieval?.search_tokens || []) add(token, 'search');
  for (const token of caseRecord.retrieval?.prompt_affinities || []) add(token, 'affinity');
  for (const risk of caseRecord.risk_controls || []) add(risk, 'risk');
  for (const flag of caseRecord.review_flags || []) add(flag, 'review-flag');

  return {
    document: parts.join(' '),
    tokens: [...tokens].sort(),
    areas: [...new Set([
      ...(caseRecord.knowledge_units || []).map((unit) => normalizeToken(unit.area)),
      ...(labelRecord.suggested_learning_areas || []).map((area) => normalizeToken(area.area))
    ].filter(Boolean))].sort(),
    risk_penalty: Number(caseRecord.priority?.risk_penalty || 0)
  };
}

export function vectorizeText(text = '', { dimensions = DEFAULT_DIMENSIONS } = {}) {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (const token of tokenize(text)) {
    const bucket = hashToken(token) % dimensions;
    const sign = hashToken(`sign:${token}`) % 2 === 0 ? 1 : -1;
    vector[bucket] += sign * tokenWeight(token);
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return vector;
  return vector.map((value) => round(value / norm));
}

export function buildTemplateEmbeddingIndex({
  knowledgeBase = {},
  neuralLabels = [],
  generatedAt = stableGeneratedAt(),
  dimensions = DEFAULT_DIMENSIONS
} = {}) {
  const labelsByCase = new Map((neuralLabels || []).map((item) => [item.case_id, item]));
  const cases = (knowledgeBase.cases || []).map((caseRecord) => {
    const labelRecord = labelsByCase.get(caseRecord.case_id) || {};
    const document = buildCaseEmbeddingDocument(caseRecord, labelRecord);
    const vector = vectorizeText(document.document, { dimensions });
    return {
      case_id: caseRecord.case_id,
      title: caseRecord.title || caseRecord.case_id,
      file: caseRecord.file,
      review_status: caseRecord.review?.status || 'pending',
      document: document.document,
      tokens: document.tokens,
      vector,
      norm: 1,
      areas: document.areas,
      risk_penalty: document.risk_penalty,
      lineage: {
        case_version: caseRecord.case_version || '',
        label_record_hash: `sha256:${hashJson(labelRecord)}`
      }
    };
  });
  return {
    source: EMBEDDING_INDEX_SOURCE,
    schema_version: EMBEDDING_INDEX_SCHEMA_VERSION,
    generated_at: generatedAt,
    embedding_model: {
      provider: 'deterministic-token-vector',
      model: 'token-hash-v1',
      dimensions,
      normalized: true
    },
    inputs: {
      case_library_v2: 'mc_templates/analysis/case_library.v2.json',
      neural_labels: 'mc_templates/analysis/neural_labels.jsonl',
      tag_taxonomy: 'mc_templates/curation/tag_taxonomy.json'
    },
    case_count: cases.length,
    cases,
    warnings: []
  };
}

export function queryEmbeddingIndex({ index = {}, prompt = '', limit = 8 } = {}) {
  const dimensions = Number(index.embedding_model?.dimensions || DEFAULT_DIMENSIONS);
  const queryVector = vectorizeText(prompt, { dimensions });
  return (index.cases || [])
    .filter((item) => Array.isArray(item.vector) && item.vector.length === dimensions)
    .map((item) => ({
      case_id: item.case_id,
      title: item.title,
      embedding_score: Math.max(0, Math.round(cosine(queryVector, item.vector) * 100)),
      areas: item.areas || [],
      tokens: item.tokens || [],
      risk_penalty: Number(item.risk_penalty || 0)
    }))
    .sort((a, b) => b.embedding_score - a.embedding_score || a.title.localeCompare(b.title))
    .slice(0, clampLimit(limit));
}

export function validateEmbeddingIndex(index = {}, knowledgeBase = {}) {
  const cases = new Map((knowledgeBase.cases || []).map((item) => [item.case_id, item]));
  const validCaseIds = [];
  const staleCaseIds = [];
  const warnings = [];
  const dimensions = Number(index.embedding_model?.dimensions || 0);
  if (index.source !== EMBEDDING_INDEX_SOURCE) warnings.push('embedding index source is not stage5-template-embedding-index-v1');
  if (!dimensions) warnings.push('embedding index dimensions missing');
  for (const item of index.cases || []) {
    const current = cases.get(item.case_id);
    const vectorOk = Array.isArray(item.vector) && item.vector.length === dimensions;
    if (!current || !vectorOk || item.lineage?.case_version !== (current.case_version || '')) {
      staleCaseIds.push(item.case_id);
      continue;
    }
    validCaseIds.push(item.case_id);
  }
  if (staleCaseIds.length) warnings.push(`stale or invalid vectors: ${staleCaseIds.join(', ')}`);
  return {
    ok: warnings.length === 0 && validCaseIds.length > 0,
    validCaseIds,
    staleCaseIds,
    warnings
  };
}

export async function writeTemplateEmbeddingIndexArtifact({
  outputDir,
  knowledgeBase = {},
  neuralLabels = [],
  generatedAt = stableGeneratedAt(),
  dimensions = DEFAULT_DIMENSIONS
} = {}) {
  const index = buildTemplateEmbeddingIndex({ knowledgeBase, neuralLabels, generatedAt, dimensions });
  await fs.mkdir(outputDir, { recursive: true });
  const file = path.join(outputDir, 'embedding_index.json');
  await fs.writeFile(file, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  return { index, file };
}

function tokenize(value = '') {
  const raw = String(value || '').toLowerCase().replaceAll('_', '-');
  const base = raw
    .split(/[^\p{Letter}\p{Number}-]+/gu)
    .map((item) => normalizeToken(item))
    .filter(Boolean);
  const expanded = [];
  for (const token of base) {
    expanded.push(token);
    if (TOKEN_ALIASES[token]) expanded.push(TOKEN_ALIASES[token]);
  }
  return [...new Set(expanded)];
}

function normalizeToken(value = '') {
  return String(value || '').trim().toLowerCase().replaceAll('_', '-').replace(/^-|-$/g, '');
}

function tokenWeight(token = '') {
  if (token.includes(':identity')) return 1.4;
  if (token.includes('large-glass') || token.includes('water-edge')) return 1.3;
  if (token.length >= 8) return 1.1;
  return 1;
}

function hashToken(token) {
  const hash = crypto.createHash('sha256').update(String(token)).digest();
  return hash.readUInt32BE(0);
}

function cosine(a = [], b = []) {
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let index = 0; index < length; index += 1) sum += Number(a[index] || 0) * Number(b[index] || 0);
  return sum;
}

function hashJson(value) {
  return crypto.createHash('sha256').update(JSON.stringify(sortValue(value))).digest('hex');
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map((item) => sortValue(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function clampLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 8;
  return Math.max(1, Math.min(8, Math.trunc(number)));
}

function round(value) {
  return Math.round(Number(value || 0) * 1000000) / 1000000;
}

function stableGeneratedAt() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch !== undefined) {
    const seconds = Number(epoch);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  }
  return '2026-07-09T00:00:00.000Z';
}
```

- [ ] **Step 4: Run the task test**

Run:

```powershell
node --test test/templateEmbeddingIndex.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/construction/templates/templateEmbeddingIndex.js test/templateEmbeddingIndex.test.js
git commit -m "feat: add deterministic template embedding index"
```

---

### Task 3: Offline Analysis Writes Stage 5 Artifacts

**Files:**
- Modify: `src/construction/templates/schematicAnalyzer.js:1-245`
- Modify: `src/analyzeTemplateCorpus.js:1-60`
- Test: `test/templateKnowledgeBaseV2.test.js`

**Interfaces:**
- Consumes: `writeNeuralLabelArtifacts` from Task 1 and `writeTemplateEmbeddingIndexArtifact` from Task 2.
- Produces: `result.stage5` from `analyzeTemplateCorpus`, with `artifacts.neuralLabels` and `artifacts.embeddingIndex`.

- [ ] **Step 1: Add a failing integration assertion**

In `test/templateKnowledgeBaseV2.test.js`, add imports if missing:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
```

Add this test near the existing artifact-generation tests:

```js
test('analyzeTemplateCorpus writes Stage 5 neural artifacts after KB v2', async () => {
  const root = path.resolve('.tmp', `template-stage5-analysis-${Date.now()}`);
  const templatesRoot = path.join(root, 'mc_templates');
  const houseDir = path.join(templatesRoot, 'House');
  await fs.mkdir(houseDir, { recursive: true });
  await fs.writeFile(path.join(houseDir, 'data.txt'), 'A Small Modern House https://mcbuild.org/schematics/example\n', 'utf8');

  const source = path.join(process.cwd(), 'mc_templates', 'House', 'A Small Modern House - (mcbuild_org).schematic');
  const target = path.join(houseDir, 'A Small Modern House - (mcbuild_org).schematic');
  await fs.copyFile(source, target);

  try {
    const { analyzeTemplateCorpus } = await import('../src/construction/templates/schematicAnalyzer.js');
    const result = await analyzeTemplateCorpus({
      rootDir: templatesRoot,
      outputDir: path.join(templatesRoot, 'analysis'),
      fetchPages: false,
      continueOnError: false,
      cwd: process.cwd()
    });

    assert.ok(result.stage5.artifacts.neuralLabels.endsWith('neural_labels.jsonl'));
    assert.ok(result.stage5.artifacts.embeddingIndex.endsWith('embedding_index.json'));
    const labels = await fs.readFile(result.stage5.artifacts.neuralLabels, 'utf8');
    const index = JSON.parse(await fs.readFile(result.stage5.artifacts.embeddingIndex, 'utf8'));
    assert.match(labels, /stage5-neural-labels-v1/);
    assert.equal(index.source, 'stage5-template-embedding-index-v1');
    assert.equal(index.case_count, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the failing integration test**

Run:

```powershell
node --test test/templateKnowledgeBaseV2.test.js
```

Expected: FAIL because `result.stage5` is undefined.

- [ ] **Step 3: Wire artifact writing into the analyzer**

In `src/construction/templates/schematicAnalyzer.js`, add imports:

```js
import { writeNeuralLabelArtifacts } from './templateNeuralLabels.js';
import { writeTemplateEmbeddingIndexArtifact } from './templateEmbeddingIndex.js';
```

After the `writeTemplateKnowledgeBaseV2Artifacts` call that assigns `knowledgeBaseV2Result`, add:

```js
  const neuralLabelResult = await writeNeuralLabelArtifacts({
    outputDir: absoluteOutput,
    knowledgeBase: knowledgeBaseV2Result.knowledgeBase,
    generatedLabels: labels,
    taxonomy
  });
  const embeddingIndexResult = await writeTemplateEmbeddingIndexArtifact({
    outputDir: absoluteOutput,
    knowledgeBase: knowledgeBaseV2Result.knowledgeBase,
    neuralLabels: neuralLabelResult.records,
    generatedAt: stableTemplateKnowledgeBaseV2GeneratedAt()
  });
```

In the returned object, after `knowledgeBaseV2`, add:

```js
    stage5: {
      summary: {
        neural_label_count: neuralLabelResult.records.length,
        embedding_case_count: embeddingIndexResult.index.case_count,
        embedding_model: embeddingIndexResult.index.embedding_model
      },
      artifacts: {
        neuralLabels: neuralLabelResult.file,
        embeddingIndex: embeddingIndexResult.file
      }
    },
```

- [ ] **Step 4: Print Stage 5 artifact paths from the analysis CLI**

In `src/analyzeTemplateCorpus.js`, after the existing Stage 2 KB v2 logging block, add:

```js
if (result.stage5?.summary) {
  console.log(`Stage 5 neural labels: ${result.stage5.summary.neural_label_count}.`);
  console.log(`Stage 5 embedding cases: ${result.stage5.summary.embedding_case_count}.`);
  console.log(`Stage 5 embedding model: ${result.stage5.summary.embedding_model.provider}/${result.stage5.summary.embedding_model.model}.`);
  console.log(`Stage 5 neural labels file: ${result.stage5.artifacts.neuralLabels}.`);
  console.log(`Stage 5 embedding index: ${result.stage5.artifacts.embeddingIndex}.`);
}
```

- [ ] **Step 5: Run the task tests**

Run:

```powershell
node --test test/templateNeuralLabels.test.js test/templateEmbeddingIndex.test.js test/templateKnowledgeBaseV2.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/construction/templates/schematicAnalyzer.js src/analyzeTemplateCorpus.js test/templateKnowledgeBaseV2.test.js
git commit -m "feat: write stage 5 template artifacts"
```

---

### Task 4: Neural Fusion Retriever

**Files:**
- Create: `src/construction/templates/templateNeuralRetriever.js`
- Test: `test/templateNeuralRetriever.test.js`

**Interfaces:**
- Consumes: `ExplainableTemplateRetriever` and embedding helpers from Tasks 2.
- Produces:
  - `NeuralTemplateRetriever`
  - `run({ prompt, context, limit }): object` with source `stage5-neural-template-retriever-v1`

- [ ] **Step 1: Write the failing tests**

Create `test/templateNeuralRetriever.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTemplateEmbeddingIndex } from '../src/construction/templates/templateEmbeddingIndex.js';
import { NeuralTemplateRetriever } from '../src/construction/templates/templateNeuralRetriever.js';

test('neural retriever returns fusion result with rule and embedding scores', () => {
  const knowledgeBase = knowledgeBaseFixture();
  const embeddingIndex = buildTemplateEmbeddingIndex({
    knowledgeBase,
    neuralLabels: neuralLabelsFixture(),
    generatedAt: '2026-07-09T00:00:00.000Z',
    dimensions: 64
  });

  const result = new NeuralTemplateRetriever({ knowledgeBase, embeddingIndex, neuralLabels: neuralLabelsFixture() }).run({
    prompt: 'build a lakeside modern villa with large glass and refined interior',
    context: { style_family: 'modern', typology: 'house' },
    limit: 8
  });

  assert.equal(result.source, 'stage5-neural-template-retriever-v1');
  assert.equal(result.active, true);
  assert.equal(result.mode, 'fusion');
  assert.equal(result.fallback_used, false);
  assert.equal(result.references[0].case_id, 'house-modern-lake-villa');
  assert.ok(result.references[0].rule_score > 0);
  assert.ok(result.references[0].embedding_score > 0);
  assert.ok(result.references[0].tag_match_score > 0);
  assert.match(result.references[0].fusion_explanation, /fusion/i);
  assert.ok(result.references[0].teaches.length > 0);
  assert.ok(result.references[0].risk_controls.length > 0);
});

test('neural retriever falls back to rule-only when embedding index is missing', () => {
  const knowledgeBase = knowledgeBaseFixture();
  const result = new NeuralTemplateRetriever({ knowledgeBase }).run({
    prompt: 'build a lakeside modern villa with large glass',
    context: { style_family: 'modern', typology: 'house' },
    limit: 8
  });

  assert.equal(result.source, 'template-explainable-retriever-v1');
  assert.equal(result.mode, 'rule-only-fallback');
  assert.equal(result.fallback_used, true);
  assert.ok(result.warnings.some((item) => /embedding index missing/i.test(item)));
});

test('neural retriever does not promote arena interiors for residential interior prompts', () => {
  const knowledgeBase = knowledgeBaseFixture();
  const embeddingIndex = buildTemplateEmbeddingIndex({
    knowledgeBase,
    neuralLabels: neuralLabelsFixture(),
    generatedAt: '2026-07-09T00:00:00.000Z',
    dimensions: 64
  });

  const result = new NeuralTemplateRetriever({ knowledgeBase, embeddingIndex, neuralLabels: neuralLabelsFixture() }).run({
    prompt: 'residential house interior with living room bedroom kitchen furniture',
    context: { typology: 'house' },
    limit: 8
  });

  const arena = result.references.find((item) => item.case_id === 'arenas-amphitheatre-arena');
  if (arena) assert.equal(arena.teaches.some((item) => item.area === 'interior'), false);
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
        case_version: 'sha256:modern',
        title: 'Modern Lake Villa',
        file: 'House/Modern Lake Villa.schematic',
        identity: { style_family: 'modern', typology: 'house', category: 'House', scale_bucket: 'large' },
        review: { status: 'approved', confidence: 0.9 },
        tags: { style: [{ id: 'modern' }], typology: [{ id: 'house' }], site: [{ id: 'water-edge' }], facade: [{ id: 'large-glass' }], interior: [{ id: 'furnished' }] },
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
        case_id: 'arenas-amphitheatre-arena',
        case_version: 'sha256:arena',
        title: 'Amphitheatre Arena',
        file: 'Arenas/Amphitheatre Arena.schematic',
        identity: { style_family: 'classical', typology: 'arena', category: 'Arenas', scale_bucket: 'monumental' },
        review: { status: 'limited', confidence: 0.75, approved_learning_areas: ['site', 'massing'], blocked_learning_areas: ['interior'] },
        tags: { style: [{ id: 'classical' }], typology: [{ id: 'arena' }], site: [{ id: 'terrain-integrated' }] },
        knowledge_units: [unit('arena-site', 'site', 'Use terrain plinths and stepped arrival.', ['TemplateSiteSceneStrategy'])],
        priority: { global_score: 48, area_scores: { site: 82 }, risk_penalty: 20 },
        retrieval: { search_tokens: ['arena', 'terrain', 'classical', 'interior'], prompt_affinities: ['terrain', 'interior'], diversity_slots: ['site'], explanation_seeds: ['terrain plinth'] },
        risk_controls: ['use this case for exterior, site, public approach, or seating rhythm; do not mine domestic rooms']
      }
    ]
  };
}

function neuralLabelsFixture() {
  return [
    {
      case_id: 'house-modern-lake-villa',
      suggested_tags: [
        { group: 'facade', id: 'large-glass', confidence: 0.86, evidence: ['fixture'] },
        { group: 'site', id: 'water-edge', confidence: 0.9, evidence: ['fixture'] }
      ],
      suggested_learning_areas: [{ area: 'site', confidence: 0.9, evidence: ['fixture'] }]
    }
  ];
}
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node --test test/templateNeuralRetriever.test.js
```

Expected: FAIL with `Cannot find module '../src/construction/templates/templateNeuralRetriever.js'`.

- [ ] **Step 3: Implement the neural retriever**

Create `src/construction/templates/templateNeuralRetriever.js` with:

```js
import { ExplainableTemplateRetriever } from './templateExplainableRetriever.js';
import { queryEmbeddingIndex, validateEmbeddingIndex } from './templateEmbeddingIndex.js';

export const NEURAL_RETRIEVER_SOURCE = 'stage5-neural-template-retriever-v1';

export class NeuralTemplateRetriever {
  constructor({ knowledgeBase, embeddingIndex, neuralLabels = [] } = {}) {
    this.knowledgeBase = knowledgeBase || {};
    this.embeddingIndex = embeddingIndex;
    this.neuralLabels = Array.isArray(neuralLabels) ? neuralLabels : [];
  }

  run({ prompt = '', context = {}, limit = 8 } = {}) {
    const rule = new ExplainableTemplateRetriever({ knowledgeBase: this.knowledgeBase }).run({ prompt, context, limit });
    if (!this.embeddingIndex) return fallback(rule, 'embedding index missing');

    const validation = validateEmbeddingIndex(this.embeddingIndex, this.knowledgeBase);
    if (!validation.ok) return fallback(rule, validation.warnings.join('; ') || 'embedding index invalid');

    const embeddingMatches = queryEmbeddingIndex({ index: this.embeddingIndex, prompt, limit: 8 });
    const labelsByCase = new Map(this.neuralLabels.map((item) => [item.case_id, item]));
    const embeddingByCase = new Map(embeddingMatches.map((item) => [item.case_id, item]));
    const ruleByCase = new Map((rule.references || []).map((item) => [item.case_id, item]));
    const caseById = new Map((this.knowledgeBase.cases || []).map((item) => [item.case_id, item]));
    const ids = [...new Set([...ruleByCase.keys(), ...embeddingByCase.keys()])];
    const promptTokens = tokenSet(prompt, context);

    const fused = ids.map((caseId) => {
      const caseRecord = caseById.get(caseId) || {};
      const ruleRef = ruleByCase.get(caseId);
      const embedding = embeddingByCase.get(caseId);
      const labelRecord = labelsByCase.get(caseId) || {};
      const ruleScore = Number(ruleRef?.match_score || 0);
      const embeddingScore = Number(embedding?.embedding_score || 0);
      const tagMatchScore = scoreTagMatch(caseRecord, labelRecord, promptTokens);
      const reviewBonus = reviewBonusFor(caseRecord.review?.status);
      const diversityBonus = diversityBonusFor(caseRecord, promptTokens);
      const riskPenalty = Number(caseRecord.priority?.risk_penalty || embedding?.risk_penalty || 0);
      const matchScore = Math.max(0, Math.round(
        ruleScore * 0.45 +
        embeddingScore * 0.30 +
        tagMatchScore * 0.15 +
        reviewBonus +
        diversityBonus -
        riskPenalty
      ));
      const ref = ruleRef || explainFromCase(caseRecord, embedding);
      return {
        ...ref,
        match_score: matchScore,
        rule_score: ruleScore,
        embedding_score: embeddingScore,
        tag_match_score: tagMatchScore,
        fusion_explanation: `Neural fusion combined rule=${ruleScore}, embedding=${embeddingScore}, tag=${tagMatchScore}, review=${reviewBonus}, diversity=${diversityBonus}, risk=${riskPenalty}.`,
        matched_signals: [...new Set([...(ref.matched_signals || []), ...matchedTagSignals(caseRecord, labelRecord, promptTokens)])]
      };
    })
      .filter((item) => item.match_score > 0)
      .sort((a, b) => b.match_score - a.match_score || a.title.localeCompare(b.title))
      .slice(0, clampLimit(limit));

    if (!fused.length) return fallback(rule, 'fusion produced no references');
    return {
      source: NEURAL_RETRIEVER_SOURCE,
      active: true,
      mode: 'fusion',
      fallback_used: false,
      prompt,
      references: fused.map((item, index) => ({ ...item, rank: index + 1 })),
      warnings: rule.warnings || []
    };
  }
}

function fallback(rule, reason) {
  return {
    ...rule,
    mode: 'rule-only-fallback',
    fallback_used: true,
    warnings: [...(rule.warnings || []), reason].filter(Boolean)
  };
}

function explainFromCase(caseRecord = {}, embedding = {}) {
  const units = (caseRecord.knowledge_units || []).slice(0, 4);
  return {
    rank: 0,
    case_id: caseRecord.case_id,
    title: caseRecord.title || caseRecord.case_id,
    file: caseRecord.file,
    match_score: Number(embedding?.embedding_score || 0),
    diversity_slot: (caseRecord.retrieval?.diversity_slots || ['general'])[0],
    matched_signals: ['embedding:semantic-similarity'],
    teaches: units.length
      ? units.map((unit) => ({ area: unit.area, claim: unit.claim, confidence: unit.confidence || 0.7 }))
      : [{ area: 'risk', claim: 'Use as weak inspiration only because no knowledge units are available.', confidence: 0.3 }],
    risk_controls: caseRecord.risk_controls?.length
      ? caseRecord.risk_controls
      : ['change exact dimensions, room order, and detail placement so the result is not a block-for-block copy'],
    integration_targets: [...new Set(units.flatMap((unit) => unit.integration_targets || []))].slice(0, 8),
    explanation: `Embedding matched ${caseRecord.title || caseRecord.case_id}.`
  };
}

function scoreTagMatch(caseRecord = {}, labelRecord = {}, promptTokens = new Set()) {
  const tags = allTags(caseRecord, labelRecord);
  let score = 0;
  for (const tag of tags) {
    if (promptTokens.has(tag.id) || promptTokens.has(tag.group)) score += Math.round(Number(tag.confidence || 0.7) * 20);
  }
  return Math.min(100, score);
}

function matchedTagSignals(caseRecord = {}, labelRecord = {}, promptTokens = new Set()) {
  return allTags(caseRecord, labelRecord)
    .filter((tag) => promptTokens.has(tag.id) || promptTokens.has(tag.group))
    .map((tag) => `tag:${tag.group}:${tag.id}`);
}

function allTags(caseRecord = {}, labelRecord = {}) {
  const existing = Object.entries(caseRecord.tags || {}).flatMap(([group, values]) =>
    (Array.isArray(values) ? values : []).map((tag) => ({ group: tag.group || group, id: tag.id, confidence: tag.confidence || 0.7 }))
  );
  const suggested = (labelRecord.suggested_tags || []).map((tag) => ({ group: tag.group, id: tag.id, confidence: tag.confidence || 0.7 }));
  return [...existing, ...suggested].filter((tag) => tag.group && tag.id);
}

function tokenSet(prompt = '', context = {}) {
  const text = `${prompt} ${context.style_family || ''} ${context.style || ''} ${context.typology || ''}`.toLowerCase();
  const tokens = new Set(text.split(/[^\p{Letter}\p{Number}-]+/gu).map((item) => item.trim()).filter(Boolean));
  if (/湖|水|lake|water|waterfront|lakeside/.test(text)) tokens.add('water-edge');
  if (/glass|玻璃|window/.test(text)) tokens.add('large-glass');
  if (/interior|内饰|家具|living|bedroom|kitchen/.test(text)) tokens.add('interior');
  if (/garden|花园|庭院/.test(text)) tokens.add('garden');
  if (/roof|露台|terrace/.test(text)) tokens.add('roof');
  return tokens;
}

function reviewBonusFor(status = '') {
  if (status === 'approved') return 10;
  if (status === 'limited') return 3;
  if (status === 'rejected') return -100;
  return 0;
}

function diversityBonusFor(caseRecord = {}, promptTokens = new Set()) {
  const areas = new Set((caseRecord.knowledge_units || []).map((unit) => unit.area));
  let bonus = 0;
  if (promptTokens.has('water-edge') && areas.has('site')) bonus += 3;
  if (promptTokens.has('large-glass') && areas.has('facade')) bonus += 3;
  if (promptTokens.has('interior') && areas.has('interior')) bonus += 3;
  return bonus;
}

function clampLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 8;
  return Math.max(1, Math.min(8, Math.trunc(number)));
}
```

- [ ] **Step 4: Run the task test**

Run:

```powershell
node --test test/templateNeuralRetriever.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/construction/templates/templateNeuralRetriever.js test/templateNeuralRetriever.test.js
git commit -m "feat: add neural fusion template retriever"
```

---

### Task 5: Query CLI and Retrieval Evaluation

**Files:**
- Modify: `src/queryTemplateKnowledge.js:1-80`
- Create: `src/evaluateTemplateRetrieval.js`
- Modify: `package.json:5-15`
- Test: `test/templateRetrievalEvaluation.test.js`
- Test: `test/templateExplainableRetriever.test.js`

**Interfaces:**
- Consumes: `NeuralTemplateRetriever`, `ExplainableTemplateRetriever`, and `buildTemplateEmbeddingIndex`.
- Produces: `npm run evaluate:retrieval`, `query:templates --neural`, and `retrieval_eval_report.md`.

- [ ] **Step 1: Add failing query CLI test**

In `test/templateExplainableRetriever.test.js`, add this test after existing query CLI tests:

```js
test('queryTemplateKnowledge CLI can print neural fusion references', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-query-neural-kb-'));
  const kbFile = path.join(root, 'case_library.v2.json');
  const indexFile = path.join(root, 'embedding_index.json');
  const knowledgeBase = knowledgeBaseFixture();
  const { buildTemplateEmbeddingIndex } = await import('../src/construction/templates/templateEmbeddingIndex.js');
  await fs.writeFile(kbFile, `${JSON.stringify(knowledgeBase, null, 2)}\n`, 'utf8');
  await fs.writeFile(indexFile, `${JSON.stringify(buildTemplateEmbeddingIndex({ knowledgeBase }), null, 2)}\n`, 'utf8');

  const result = spawnSync(process.execPath, [
    'src/queryTemplateKnowledge.js',
    '--neural',
    '--knowledge-base',
    kbFile,
    '--embedding-index',
    indexFile,
    '建一个湖边现代两层别墅，带大玻璃和精致内饰'
  ], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /mode: fusion/);
  assert.match(result.stdout, /Modern Lake Villa/);
});
```

- [ ] **Step 2: Add failing retrieval evaluation tests**

Create `test/templateRetrievalEvaluation.test.js`:

```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildTemplateEmbeddingIndex } from '../src/construction/templates/templateEmbeddingIndex.js';
import {
  DEFAULT_RETRIEVAL_EVAL_SET,
  evaluateTemplateRetrieval,
  renderRetrievalEvalReport,
  writeRetrievalEvalArtifacts
} from '../src/evaluateTemplateRetrieval.js';

test('retrieval evaluation compares rule and neural results', () => {
  const result = evaluateTemplateRetrieval({
    knowledgeBase: knowledgeBaseFixture(),
    embeddingIndex: embeddingIndexFixture(),
    evalSet: DEFAULT_RETRIEVAL_EVAL_SET
  });

  assert.equal(result.source, 'stage5-template-retrieval-eval-v1');
  assert.ok(result.prompts.length >= 10);
  assert.ok(result.prompts[0].rule_top.length > 0);
  assert.ok(result.prompts[0].fusion_top.length > 0);
});

test('retrieval evaluation report renders prompt sections', () => {
  const result = evaluateTemplateRetrieval({
    knowledgeBase: knowledgeBaseFixture(),
    embeddingIndex: embeddingIndexFixture(),
    evalSet: DEFAULT_RETRIEVAL_EVAL_SET
  });
  const report = renderRetrievalEvalReport(result);

  assert.match(report, /# Stage 5 Retrieval Evaluation/);
  assert.match(report, /modern-lakeside-villa/);
  assert.match(report, /Rule top/);
  assert.match(report, /Fusion top/);
});

test('evaluate:retrieval CLI writes report with provided artifacts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-retrieval-eval-'));
  try {
    const kbFile = path.join(root, 'case_library.v2.json');
    const indexFile = path.join(root, 'embedding_index.json');
    const reportFile = path.join(root, 'retrieval_eval_report.md');
    await fs.writeFile(kbFile, `${JSON.stringify(knowledgeBaseFixture(), null, 2)}\n`, 'utf8');
    await fs.writeFile(indexFile, `${JSON.stringify(embeddingIndexFixture(), null, 2)}\n`, 'utf8');

    const result = spawnSync(process.execPath, [
      'src/evaluateTemplateRetrieval.js',
      '--knowledge-base',
      kbFile,
      '--embedding-index',
      indexFile,
      '--out',
      reportFile
    ], { cwd: process.cwd(), encoding: 'utf8' });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Retrieval evaluation wrote/);
    assert.match(await fs.readFile(reportFile, 'utf8'), /Stage 5 Retrieval Evaluation/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('writeRetrievalEvalArtifacts writes eval set and report', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-retrieval-artifacts-'));
  try {
    const result = await writeRetrievalEvalArtifacts({
      outputDir: root,
      knowledgeBase: knowledgeBaseFixture(),
      embeddingIndex: embeddingIndexFixture()
    });
    assert.ok(result.evalSetFile.endsWith('retrieval_eval_set.json'));
    assert.ok(result.reportFile.endsWith('retrieval_eval_report.md'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function knowledgeBaseFixture() {
  return {
    source: 'template-knowledge-base-v2',
    schema_version: 2,
    cases: [{
      case_id: 'house-modern-lake-villa',
      case_version: 'sha256:modern',
      title: 'Modern Lake Villa',
      file: 'House/Modern Lake Villa.schematic',
      identity: { style_family: 'modern', typology: 'house', category: 'House', scale_bucket: 'large' },
      review: { status: 'approved', confidence: 0.9 },
      tags: { style: [{ id: 'modern' }], typology: [{ id: 'house' }], site: [{ id: 'water-edge' }], facade: [{ id: 'large-glass' }], interior: [{ id: 'furnished' }] },
      knowledge_units: [
        { id: 'site', area: 'site', claim: 'Connect public rooms to a water edge and deck.', confidence: 0.85, integration_targets: ['TemplateSiteSceneStrategy'] },
        { id: 'facade', area: 'facade', claim: 'Large glass should serve view-facing rooms.', confidence: 0.85, integration_targets: ['FacadeAgent'] }
      ],
      priority: { global_score: 92, area_scores: { site: 90, facade: 86 }, risk_penalty: 0 },
      retrieval: { search_tokens: ['modern', 'lake', 'villa', 'water-edge', 'large-glass', 'interior'], prompt_affinities: ['modern', 'house', 'waterfront', 'large-glass', 'interior'], diversity_slots: ['site', 'facade'], explanation_seeds: ['modern waterfront villa'] },
      risk_controls: ['change exact dimensions and detail placement; do not copy block-for-block']
    }]
  };
}

function embeddingIndexFixture() {
  const knowledgeBase = knowledgeBaseFixture();
  return buildTemplateEmbeddingIndex({ knowledgeBase, dimensions: 64 });
}
```

- [ ] **Step 3: Run the failing tests**

Run:

```powershell
node --test test/templateExplainableRetriever.test.js test/templateRetrievalEvaluation.test.js
```

Expected: FAIL because `src/evaluateTemplateRetrieval.js` does not exist and `queryTemplateKnowledge` does not support `--neural`.

- [ ] **Step 4: Update the query CLI**

In `src/queryTemplateKnowledge.js`, import the neural retriever:

```js
import { NeuralTemplateRetriever } from './construction/templates/templateNeuralRetriever.js';
```

After reading `knowledgeBase`, add optional embedding index loading:

```js
  let embeddingIndex;
  const neuralEnabled = args.neural === 'true' && args['no-neural'] !== 'true';
  const embeddingIndexFile = path.resolve(cwd, args['embedding-index'] || path.join('mc_templates', 'analysis', 'embedding_index.json'));
  if (neuralEnabled) {
    try {
      embeddingIndex = JSON.parse(await fs.readFile(embeddingIndexFile, 'utf8'));
    } catch (error) {
      embeddingIndex = undefined;
    }
  }
```

Replace the current block that constructs `ExplainableTemplateRetriever` and calls `.run({ prompt, context: { style_family: args.style || '', typology: args.typology || '' }, limit: args.limit ? Number(args.limit) : 8 })` with:

```js
  const retriever = neuralEnabled
    ? new NeuralTemplateRetriever({ knowledgeBase, embeddingIndex })
    : new ExplainableTemplateRetriever({ knowledgeBase });
  const result = retriever.run({
    prompt,
    context: { style_family: args.style || '', typology: args.typology || '' },
    limit: args.limit ? Number(args.limit) : 8
  });
```

In `renderResult(result)`, after the header lines, add:

```js
  lines.push(`mode: ${result.mode || 'rule-only'}`);
  if (result.fallback_used) lines.push('fallback: true');
  lines.push('');
```

Update the usage line:

```js
    stderr.write('Usage: node src/queryTemplateKnowledge.js [--neural] [--knowledge-base path] [--embedding-index path] "prompt"\n');
```

- [ ] **Step 5: Create retrieval evaluation CLI**

Create `src/evaluateTemplateRetrieval.js` with:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExplainableTemplateRetriever } from './construction/templates/templateExplainableRetriever.js';
import { NeuralTemplateRetriever } from './construction/templates/templateNeuralRetriever.js';

const __filename = fileURLToPath(import.meta.url);

export const DEFAULT_RETRIEVAL_EVAL_SET = {
  source: 'stage5-retrieval-eval-set-v1',
  schema_version: 1,
  prompts: [
    { id: 'modern-lakeside-villa', prompt: 'build a lakeside modern two-floor villa with large glass, a water deck, roof terrace, and refined interior', expected: { typology: ['house'], style: ['modern', 'coastal'], site: ['water-edge', 'garden'], facade: ['large-glass'], interior: ['furnished', 'room-layout-rich'] }, avoid: { typology: ['arena'], risk_flags: ['arena-not-for-room-mining'] } },
    { id: 'japanese-tea-house', prompt: 'build a quiet Japanese tea house with deep eaves, wood lattice, water garden, and calm circulation', expected: { typology: ['house', 'temple'], style: ['japanese'], site: ['garden', 'water-edge'], roof: ['layered-eaves', 'deep-overhang'] }, avoid: { typology: ['arena'] } },
    { id: 'medieval-tavern', prompt: 'build a medieval tavern house with cozy inhabited interior, kitchen, storage, and social seating', expected: { typology: ['house'], style: ['medieval', 'rustic'], interior: ['furnished', 'furniture-pattern-rich'] }, avoid: { typology: ['arena'] } },
    { id: 'gothic-castle', prompt: 'build a gothic castle with a vertical landmark, public approach, formal entry, and layered stone facade', expected: { typology: ['castle'], style: ['gothic', 'medieval'], massing: ['vertical-landmark'], facade: ['formal-symmetry'] }, avoid: { typology: ['arena'] } },
    { id: 'classical-temple-axis', prompt: 'build a classical temple with formal axis, balanced massing, steps, and ceremonial hall', expected: { typology: ['temple'], style: ['classical'], massing: ['balanced-axis'], room_types: ['chapel-or-ceremonial-hall'] }, avoid: { typology: ['arena'] } },
    { id: 'rustic-survival-house', prompt: 'build a compact rustic survival house with storage, warm interior, garden beds, and pitched roof', expected: { typology: ['house'], style: ['rustic', 'medieval'], interior: ['furnished'], site: ['garden'], roof: ['pitched-roof'] }, avoid: { typology: ['arena'] } },
    { id: 'public-library-study', prompt: 'build a public library with study rooms, bookshelves, vertical circulation, and detailed facade', expected: { typology: ['public-building'], interior: ['study-library', 'vertical-circulation'], facade: ['micro-depth-trim'] }, avoid: { typology: ['arena'] } },
    { id: 'tower-plaza', prompt: 'build a tower landmark with a small plaza, vertical silhouette, and clear approach sequence', expected: { typology: ['tower'], massing: ['vertical-landmark'], site: ['urban', 'garden'] }, avoid: { typology: ['arena'] } },
    { id: 'waterfront-hotel', prompt: 'build a waterfront hotel with glass facade, terraces, public lobby, and water edge arrival', expected: { typology: ['public-building'], style: ['modern', 'coastal'], site: ['water-edge'], facade: ['large-glass'], roof: ['flat-terrace'] }, avoid: { typology: ['arena'] } },
    { id: 'fantasy-terrain-retreat', prompt: 'build a fantasy terrain-integrated retreat with layered rock base, garden forecourt, and stepped terraces', expected: { style: ['fantasy'], site: ['terrain-integrated', 'garden'], massing: ['stepped-terraces'] }, avoid: { typology: ['arena'] } }
  ]
};

export function evaluateTemplateRetrieval({ knowledgeBase = {}, embeddingIndex, evalSet = DEFAULT_RETRIEVAL_EVAL_SET } = {}) {
  const prompts = (evalSet.prompts || []).map((item) => {
    const context = inferContext(item);
    const rule = new ExplainableTemplateRetriever({ knowledgeBase }).run({ prompt: item.prompt, context, limit: 8 });
    const fusion = new NeuralTemplateRetriever({ knowledgeBase, embeddingIndex }).run({ prompt: item.prompt, context, limit: 8 });
    return {
      id: item.id,
      prompt: item.prompt,
      expected: item.expected,
      avoid: item.avoid,
      rule_top: summarizeRefs(rule.references),
      fusion_top: summarizeRefs(fusion.references),
      rule_hit_count: countHits(rule.references, item.expected),
      fusion_hit_count: countHits(fusion.references, item.expected),
      unsafe_rule_count: countUnsafe(rule.references, item.avoid),
      unsafe_fusion_count: countUnsafe(fusion.references, item.avoid),
      fusion_mode: fusion.mode || 'fusion',
      warnings: [...(rule.warnings || []), ...(fusion.warnings || [])]
    };
  });
  return {
    source: 'stage5-template-retrieval-eval-v1',
    generated_at: new Date().toISOString(),
    prompt_count: prompts.length,
    prompts
  };
}

export function renderRetrievalEvalReport(result = {}) {
  const lines = [
    '# Stage 5 Retrieval Evaluation',
    '',
    `Generated: ${result.generated_at || ''}`,
    `Prompts: ${result.prompt_count || 0}`,
    '',
    '| Prompt | Rule hits | Fusion hits | Rule unsafe | Fusion unsafe | Mode |',
    '| --- | ---: | ---: | ---: | ---: | --- |'
  ];
  for (const item of result.prompts || []) {
    lines.push(`| ${item.id} | ${item.rule_hit_count} | ${item.fusion_hit_count} | ${item.unsafe_rule_count} | ${item.unsafe_fusion_count} | ${item.fusion_mode} |`);
  }
  for (const item of result.prompts || []) {
    lines.push('', `## ${item.id}`, '', item.prompt, '', `Rule top: ${item.rule_top.map((ref) => `${ref.rank}.${ref.title}`).join(', ') || 'none'}`, '', `Fusion top: ${item.fusion_top.map((ref) => `${ref.rank}.${ref.title}`).join(', ') || 'none'}`);
    if (item.warnings.length) lines.push('', `Warnings: ${item.warnings.join('; ')}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function writeRetrievalEvalArtifacts({ outputDir, knowledgeBase = {}, embeddingIndex, evalSet = DEFAULT_RETRIEVAL_EVAL_SET, outFile } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const result = evaluateTemplateRetrieval({ knowledgeBase, embeddingIndex, evalSet });
  const evalSetFile = path.join(outputDir, 'retrieval_eval_set.json');
  const reportFile = outFile || path.join(outputDir, 'retrieval_eval_report.md');
  await fs.writeFile(evalSetFile, `${JSON.stringify(evalSet, null, 2)}\n`, 'utf8');
  await fs.writeFile(reportFile, renderRetrievalEvalReport(result), 'utf8');
  return { result, evalSetFile, reportFile };
}

async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const args = parseArgs(argv);
  const kbFile = path.resolve(cwd, args['knowledge-base'] || path.join('mc_templates', 'analysis', 'case_library.v2.json'));
  const indexFile = path.resolve(cwd, args['embedding-index'] || path.join('mc_templates', 'analysis', 'embedding_index.json'));
  const outFile = path.resolve(cwd, args.out || path.join('mc_templates', 'analysis', 'retrieval_eval_report.md'));
  const knowledgeBase = JSON.parse(await fs.readFile(kbFile, 'utf8'));
  const embeddingIndex = JSON.parse(await fs.readFile(indexFile, 'utf8'));
  const outputDir = path.dirname(outFile);
  const result = await writeRetrievalEvalArtifacts({ outputDir, knowledgeBase, embeddingIndex, outFile });
  console.log(`Retrieval evaluation wrote ${result.reportFile}.`);
  console.log(`Retrieval eval set wrote ${result.evalSetFile}.`);
  return 0;
}

function summarizeRefs(refs = []) {
  return refs.slice(0, 5).map((ref) => ({
    rank: ref.rank,
    case_id: ref.case_id,
    title: ref.title,
    match_score: ref.match_score,
    matched_signals: ref.matched_signals || [],
    teaches: ref.teaches || [],
    risk_controls: ref.risk_controls || []
  }));
}

function countHits(refs = [], expected = {}) {
  const expectedTokens = new Set(Object.values(expected).flat());
  let count = 0;
  for (const ref of refs || []) {
    const text = JSON.stringify(ref).toLowerCase();
    for (const token of expectedTokens) if (text.includes(String(token).toLowerCase())) count += 1;
  }
  return count;
}

function countUnsafe(refs = [], avoid = {}) {
  const avoidTokens = new Set(Object.values(avoid).flat());
  let count = 0;
  for (const ref of refs || []) {
    const text = JSON.stringify(ref).toLowerCase();
    for (const token of avoidTokens) if (text.includes(String(token).toLowerCase())) count += 1;
  }
  return count;
}

function inferContext(item = {}) {
  return {
    style_family: item.expected?.style?.[0] || '',
    typology: item.expected?.typology?.[0] || ''
  };
}

function parseArgs(argv = []) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = 'true';
    }
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const exitCode = await main();
  process.exitCode = exitCode;
}
```

- [ ] **Step 6: Add package script**

In `package.json`, add:

```json
"evaluate:retrieval": "node src/evaluateTemplateRetrieval.js"
```

Keep the JSON valid by adding a comma to the previous script entry.

- [ ] **Step 7: Run the task tests**

Run:

```powershell
node --test test/templateExplainableRetriever.test.js test/templateRetrievalEvaluation.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/queryTemplateKnowledge.js src/evaluateTemplateRetrieval.js package.json test/templateExplainableRetriever.test.js test/templateRetrievalEvaluation.test.js
git commit -m "feat: add stage 5 retrieval inspection"
```

---

### Task 6: Runtime Opt-In Fusion Retrieval

**Files:**
- Modify: `src/construction/agents/templateKnowledgeAgent.js:1-75`
- Modify: `src/construction/workflow.js:39-82` and `src/construction/workflow.js:1131-1145`
- Modify: `src/pipeline.js:10-80` and `src/pipeline.js:90-150`
- Modify: `src/index.js:18-145` and `src/index.js:210-225`
- Test: `test/templateKnowledgeAgent.test.js`
- Test: `test/criticPipeline.test.js`

**Interfaces:**
- Consumes: `NeuralTemplateRetriever`.
- Produces: explicit runtime option `neuralRetrieval`, CLI flags `--neural-retrieval` and `--no-neural-retrieval`, report mode line.

- [ ] **Step 1: Add failing TemplateKnowledgeAgent tests**

In `test/templateKnowledgeAgent.test.js`, add tests that create temporary analysis artifacts:

```js
test('TemplateKnowledgeAgent uses rule-only retrieval by default even when embedding index exists', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-template-agent-rule-default-'));
  try {
    await writeAgentAnalysisFixture(root);
    const agent = new TemplateKnowledgeAgent({
      cwd: root,
      analysisFile: path.join(root, 'mc_templates', 'analysis', 'template_index.json')
    });
    const result = agent.run('build a lakeside modern villa with large glass', { style_family: 'modern', typology: 'house' }, { typology: 'house' });

    assert.equal(result.retrieval_explanation.source, 'template-explainable-retriever-v1');
    assert.equal(result.retrieval_explanation.mode || 'rule-only', 'rule-only');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('TemplateKnowledgeAgent uses neural fusion when explicitly enabled', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-template-agent-neural-'));
  try {
    await writeAgentAnalysisFixture(root);
    const agent = new TemplateKnowledgeAgent({
      cwd: root,
      analysisFile: path.join(root, 'mc_templates', 'analysis', 'template_index.json'),
      neuralRetrieval: true
    });
    const result = agent.run('build a lakeside modern villa with large glass', { style_family: 'modern', typology: 'house' }, { typology: 'house' });

    assert.equal(result.retrieval_explanation.source, 'stage5-neural-template-retriever-v1');
    assert.equal(result.retrieval_explanation.mode, 'fusion');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
```

Add helper functions to the same test file:

```js
async function writeAgentAnalysisFixture(root) {
  const analysisDir = path.join(root, 'mc_templates', 'analysis');
  await fs.mkdir(analysisDir, { recursive: true });
  const knowledgeBase = agentKnowledgeBaseFixture();
  const { buildTemplateEmbeddingIndex } = await import('../src/construction/templates/templateEmbeddingIndex.js');
  await fs.writeFile(path.join(analysisDir, 'template_index.json'), `${JSON.stringify({
    generated_at: '2026-07-09T00:00:00.000Z',
    corpus: {},
    templates: [{
      file: 'House/Modern Lake Villa.schematic',
      title: 'Modern Lake Villa',
      category: 'House',
      style_family: 'modern',
      typology: 'house',
      quality: 5,
      tags: ['modern', 'water-edge', 'large-glass'],
      analysis: { dimensions: { width: 20, length: 18, height: 12 }, terrain: {}, detail_metrics: {} },
      case_profile: { case_id: 'house-modern-lake-villa', quality_tags: [], learning_roles: [], overall_reference_score: 90 },
      recommendations: {}
    }],
    import_errors: []
  }, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(analysisDir, 'case_library.json'), `${JSON.stringify({ cases: [] }, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(analysisDir, 'case_library.v2.json'), `${JSON.stringify(knowledgeBase, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(analysisDir, 'embedding_index.json'), `${JSON.stringify(buildTemplateEmbeddingIndex({ knowledgeBase }), null, 2)}\n`, 'utf8');
}

function agentKnowledgeBaseFixture() {
  return {
    source: 'template-knowledge-base-v2',
    schema_version: 2,
    cases: [{
      case_id: 'house-modern-lake-villa',
      case_version: 'sha256:modern',
      title: 'Modern Lake Villa',
      file: 'House/Modern Lake Villa.schematic',
      identity: { style_family: 'modern', typology: 'house', category: 'House', scale_bucket: 'large' },
      review: { status: 'approved', confidence: 0.9 },
      tags: { style: [{ id: 'modern' }], typology: [{ id: 'house' }], site: [{ id: 'water-edge' }], facade: [{ id: 'large-glass' }] },
      knowledge_units: [{ id: 'facade', area: 'facade', claim: 'Large glass should serve view-facing rooms.', confidence: 0.85, integration_targets: ['FacadeAgent'] }],
      priority: { global_score: 92, area_scores: { facade: 86 }, risk_penalty: 0 },
      retrieval: { search_tokens: ['modern', 'lake', 'villa', 'water-edge', 'large-glass'], prompt_affinities: ['modern', 'house', 'waterfront', 'large-glass'], diversity_slots: ['facade'], explanation_seeds: ['modern waterfront villa'] },
      risk_controls: ['change exact dimensions and detail placement; do not copy block-for-block']
    }]
  };
}
```

- [ ] **Step 2: Add failing pipeline test**

In `test/criticPipeline.test.js`, add:

```js
test('pipeline keeps neural retrieval opt-in and reports fallback-safe mode', async () => {
  const root = path.resolve('.tmp', `architect-neural-runtime-${Date.now()}`);
  try {
    const result = await runPipeline({
      prompt: '建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰',
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 7101,
      concepts: 0,
      neuralRetrieval: true
    });

    assert.equal(result.validation.ok, true);
    assert.ok(['stage5-neural-template-retriever-v1', 'template-explainable-retriever-v1'].includes(result.blueprint.templateKnowledge.retrieval_explanation.source));
    const runReport = await fs.readFile(result.artifacts.report, 'utf8');
    assert.match(runReport, /Retrieval mode:/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Run the failing tests**

Run:

```powershell
node --test test/templateKnowledgeAgent.test.js test/criticPipeline.test.js
```

Expected: FAIL because `TemplateKnowledgeAgent` constructor ignores `neuralRetrieval`, `runPipeline` does not accept it, and reports do not print retrieval mode.

- [ ] **Step 4: Update TemplateKnowledgeAgent**

In `src/construction/agents/templateKnowledgeAgent.js`, add import:

```js
import { NeuralTemplateRetriever } from '../templates/templateNeuralRetriever.js';
```

Change the constructor:

```js
  constructor({ cwd = process.cwd(), analysisFile = DEFAULT_ANALYSIS_FILE, neuralRetrieval = false } = {}) {
    this.cwd = cwd;
    this.analysisFile = path.resolve(cwd, analysisFile);
    this.neuralRetrieval = Boolean(neuralRetrieval);
  }
```

Replace the current `const retrievalExplanation` ternary block that calls `new ExplainableTemplateRetriever({ knowledgeBase: corpus.case_library_v2 }).run({ prompt, context, limit: 8 })` when v2 exists and returns the inactive warning object otherwise with:

```js
    const retrievalContext = {
      style_family: recommendations.style_family,
      typology: recommendations.typology
    };
    const retrievalExplanation = corpus.case_library_v2
      ? this.buildRetrievalExplanation(corpus, prompt, retrievalContext)
      : {
          source: 'template-explainable-retriever-v1',
          active: false,
          prompt,
          mode: 'rule-only',
          references: [],
          warnings: [corpus.case_library_v2_error || 'case library v2 not found; using v1 template knowledge']
        };
```

Add this method inside the class after the `run(prompt = '', architecture = {}, buildSpec = {})` method:

```js
  buildRetrievalExplanation(corpus, prompt, context) {
    if (this.neuralRetrieval) {
      return new NeuralTemplateRetriever({
        knowledgeBase: corpus.case_library_v2,
        embeddingIndex: corpus.embedding_index,
        neuralLabels: corpus.neural_labels || []
      }).run({ prompt, context, limit: 8 });
    }
    return {
      ...new ExplainableTemplateRetriever({ knowledgeBase: corpus.case_library_v2 }).run({ prompt, context, limit: 8 }),
      mode: 'rule-only'
    };
  }
```

In `loadCorpus()`, after loading `case_library.v2.json`, add:

```js
      const embeddingIndexFile = path.join(path.dirname(this.analysisFile), 'embedding_index.json');
      if (fs.existsSync(embeddingIndexFile)) {
        try {
          corpus.embedding_index = JSON.parse(fs.readFileSync(embeddingIndexFile, 'utf8'));
        } catch {
          corpus.embedding_index_error = 'embedding index not usable; using rule-only template retrieval';
        }
      }
      const neuralLabelsFile = path.join(path.dirname(this.analysisFile), 'neural_labels.jsonl');
      if (fs.existsSync(neuralLabelsFile)) {
        try {
          corpus.neural_labels = fs.readFileSync(neuralLabelsFile, 'utf8')
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => JSON.parse(line));
        } catch {
          corpus.neural_labels = [];
        }
      }
```

In `inactiveKnowledge`, include `mode: 'rule-only'` in both retrieval explanation branches.

- [ ] **Step 5: Pass runtime option through workflow and pipeline**

In `src/construction/workflow.js`, add parameter:

```js
  neuralRetrieval = false
```

Then change:

```js
  const templateKnowledge = new TemplateKnowledgeAgent({ cwd, neuralRetrieval }).run(prompt, architecture, buildSpec);
```

In `src/pipeline.js`, add `neuralRetrieval = false` to `runPipeline` and `runCandidatePipeline` parameters. Pass it into every `runConstructionWorkflow` call:

```js
          neuralRetrieval
```

and:

```js
    neuralRetrieval
```

Also pass it from `runPipeline` into `runCandidatePipeline`.

- [ ] **Step 6: Add CLI flags**

In `src/index.js`, add default option:

```js
    neuralRetrieval: false,
```

In `parseArgs`, after `--no-critics`, add:

```js
    } else if (arg === '--neural-retrieval') {
      options.neuralRetrieval = true;
    } else if (arg === '--no-neural-retrieval') {
      options.neuralRetrieval = false;
```

In `printHelp`, add:

```text
  --neural-retrieval        Opt into Stage 5 neural fusion retrieval when embedding artifacts are valid.
  --no-neural-retrieval     Keep Stage 5 retrieval disabled. This is the default MVP behavior.
```

In the `runPipeline` call, add:

```js
    neuralRetrieval: options.neuralRetrieval,
```

- [ ] **Step 7: Add retrieval mode to run report**

In `src/construction/workflow.js`, update `renderTemplateMemorySection` so the active branch begins with a mode line:

```js
function renderTemplateMemorySection(blueprint = {}) {
  const explanation = blueprint.templateKnowledge?.retrieval_explanation || {};
  const refs = explanation.references || [];
  const mode = explanation.mode || (explanation.source === 'stage5-neural-template-retriever-v1' ? 'fusion' : 'rule-only');
  const fallback = explanation.fallback_used ? ' fallback' : '';
  const modeLine = `Retrieval mode: ${mode}${fallback}.`;
  if (!refs.length) {
    const reason = explanation.warnings?.join('; ') || blueprint.templateKnowledge?.reason || 'no template references';
    return `## 模板参考记忆\n\n- ${modeLine}\n- ${reason}\n`;
  }
  return `## 模板参考记忆\n\n- ${modeLine}\n${refs.slice(0, 8).map((item) => {
    const teaches = (item.teaches || []).slice(0, 2).map((unit) => `${unit.area}: ${unit.claim}`).join('；') || 'general reference';
    const risks = (item.risk_controls || []).slice(0, 1).join('；') || 'do not copy block-for-block';
    return `- ${item.title}: ${teaches}；risk: ${risks}`;
  }).join('\n')}\n`;
}
```

Keep the existing teaches/risk formatting if it has extra local wording, but include `modeLine`.

- [ ] **Step 8: Run the task tests**

Run:

```powershell
node --test test/templateKnowledgeAgent.test.js test/criticPipeline.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add src/construction/agents/templateKnowledgeAgent.js src/construction/workflow.js src/pipeline.js src/index.js test/templateKnowledgeAgent.test.js test/criticPipeline.test.js
git commit -m "feat: wire stage 5 retrieval opt-in"
```

---

### Task 7: Final Verification and Documentation Touches

**Files:**
- Modify: `README.md:45-80`
- Modify: `docs/roadmap.md:621-640`
- Modify: `docs/index.html:180-185`
- Test: no new test file; this task runs full verification.

**Interfaces:**
- Consumes: all Stage 5 modules and CLI scripts.
- Produces: docs that expose Stage 5 commands and status.

- [ ] **Step 1: Update README command list**

In `README.md`, add Stage 5 commands to the main commands block:

```powershell
npm run evaluate:retrieval
npm run query:templates -- --neural "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
npm start -- --mode mock --neural-retrieval "建一个湖边现代两层别墅，带大玻璃和精致内饰"
```

Add one status bullet under Current Status:

```md
- Neural assist layer: Stage 5 artifacts can suggest labels, build deterministic embedding indexes, evaluate retrieval, and opt into fusion retrieval without changing default mock behavior
```

- [ ] **Step 2: Update roadmap Stage 5 status**

In `docs/roadmap.md`, under `### Stage 5：神经检索和自动标注`, add:

```md
当前 MVP 状态：Stage 5 首版采用 artifacts-first 策略。离线分析生成 `neural_labels.jsonl` 和 `embedding_index.json`，查询和评估命令可以比较 rule-only 与 fusion retrieval；主生成流程默认仍使用规则检索，只有显式 `--neural-retrieval` 时才读取 Stage 5 fusion，并在 artifact 缺失或失效时回退。
```

- [ ] **Step 3: Update GitHub Pages roadmap card**

In `docs/index.html`, change the Stage 5 item from "Next" to active/current wording:

```html
<li class="active"><span></span><div><strong>Stage 5 - Neural Retrieval</strong><em>In progress</em><p>Artifacts-first neural assist suggests labels, builds deterministic embedding indexes, and evaluates fusion retrieval while default generation remains rule-only.</p></div></li>
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
node --test test/templateNeuralLabels.test.js test/templateEmbeddingIndex.test.js test/templateNeuralRetriever.test.js test/templateExplainableRetriever.test.js test/templateRetrievalEvaluation.test.js test/templateKnowledgeAgent.test.js test/templateKnowledgeBaseV2.test.js test/criticPipeline.test.js
```

Expected: PASS.

- [ ] **Step 5: Run full tests**

Run:

```powershell
npm test
```

Expected: PASS.

- [ ] **Step 6: Run offline analysis smoke**

Run:

```powershell
npm run analyze:templates -- --offline
```

Expected:

- Output includes `Stage 5 neural labels`.
- Output includes `Stage 5 embedding cases`.
- `mc_templates/analysis/neural_labels.jsonl` exists.
- `mc_templates/analysis/embedding_index.json` exists.

- [ ] **Step 7: Run query and evaluation smoke**

Run:

```powershell
npm run query:templates -- --neural "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
npm run evaluate:retrieval
```

Expected:

- Query output includes `mode: fusion` or `mode: rule-only-fallback` with a clear warning.
- Evaluation output says `Retrieval evaluation wrote`.
- `mc_templates/analysis/retrieval_eval_report.md` exists.
- `mc_templates/analysis/retrieval_eval_set.json` exists.

- [ ] **Step 8: Run runtime smoke with and without Stage 5**

Run:

```powershell
npm start -- --mode mock --seed 7101 --neural-retrieval "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
npm start -- --mode mock --seed 7101 --no-neural-retrieval "建一个湖边现代两层别墅，带大玻璃、水边平台、屋顶露台和精致内饰"
```

Expected:

- Both runs complete successfully.
- Both runs write `blueprint.json`, `run_report.md`, `architecture_scorecard.json`, and datapack artifacts.
- The first run report includes `Retrieval mode: fusion` or `Retrieval mode: rule-only-fallback`.
- The second run report includes `Retrieval mode: rule-only`.

- [ ] **Step 9: Commit docs and generated Stage 5 source artifacts only if intended**

Do not commit `out/` runtime outputs. Generated analysis artifacts under `mc_templates/analysis/` are already tracked in this repository; commit Stage 5 analysis artifacts only if they were intentionally regenerated and reviewed.

```powershell
git status --short
git add README.md docs/roadmap.md docs/index.html package.json package-lock.json
git add mc_templates/analysis/neural_labels.jsonl mc_templates/analysis/embedding_index.json mc_templates/analysis/retrieval_eval_set.json mc_templates/analysis/retrieval_eval_report.md
git commit -m "docs: update stage 5 neural retrieval status"
```

If `package-lock.json` did not change, omit it from `git add`.

---

## Self-Review Checklist

- Spec coverage: Tasks 1-7 cover neural labels, embedding index, offline artifact writing, fusion retrieval, query CLI, evaluation CLI, explicit runtime opt-in, fallback behavior, report mode, tests, and documentation.
- Dependency boundary: No task adds Python, online runtime calls, or required model credentials.
- Runtime safety: Task 6 keeps `npm start` rule-only by default and requires explicit `--neural-retrieval`.
- Human review boundary: Task 1 writes advisory label records and never edits `template_reviews.jsonl`.
- Type consistency: `neuralRetrieval` is the option name through CLI, pipeline, workflow, and `TemplateKnowledgeAgent`.
- Source IDs:
  - `stage5-neural-labels-v1`
  - `stage5-template-embedding-index-v1`
  - `stage5-neural-template-retriever-v1`
  - `stage5-template-retrieval-eval-v1`
