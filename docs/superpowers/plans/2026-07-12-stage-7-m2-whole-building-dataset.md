# Stage 7 Milestone 2 Whole-Building Dataset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, review-governed pipeline that extracts raw schematic block arrays into traceable canonical Stage 7 `64^3` whole-building semantic voxel cases, writes a versioned dataset manifest and case-disjoint splits, and prevents unreviewed or unlicensed cases from entering training.

**Architecture:** Keep raw NBT decoding in Node.js and expose it through a reusable immutable block-volume adapter. A Stage 7 dataset extractor classifies and resamples each source volume into the existing provider-neutral condition/plan contract, while a separate governance module decides training eligibility from human review and license metadata. A dataset builder writes only lightweight manifests, JSONL records, split assignments, and review reports to the canonical dataset root; raw sources and large per-case artifacts remain local and ignored.

**Tech Stack:** Node.js 20+ ESM, built-in `node:test`, `node:assert`, `node:crypto`, `node:fs/promises`, the existing NBT parser, and the existing Stage 7 schema/repair modules. No Python, PyTorch, network service, database, or new npm dependency.

## Global Constraints

- The active pipeline remains `construction_method_v1`.
- Minecraft targets remain Java 1.21 and 1.21.1 with datapack `pack_format: 48`.
- Default mock generation remains deterministic and runnable without API keys, Python, model files, or network access.
- Stage 7 mode defaults to `off`.
- All Stage 7 model output is untrusted until schema validation, semantic validation, repair, and procedural conversion succeed.
- No Stage 7 component writes directly into the block grid.
- Human review controls remain authoritative for whether a template may enter training and which learning areas are allowed.
- Stage 7 outputs must record schema, provider, model or baseline, dataset, condition, and seed provenance.
- New source IDs use the `stage7-coarse-semantic-voxel-*` prefix and never reuse `stage7-template-*`.
- New datasets and generated artifacts are reproducible from versioned inputs; raw templates are never modified.
- Raw schematic files, dense tensors, checkpoints, and unrestricted copies of extracted plans are not committed unless their source license and repository-size policy explicitly allow publication.
- Milestone 2 does not add Python, PyTorch, a learned provider, `apply` mode, candidate geometry mutation, or Stage 8 terrain reads.

## Milestone Boundary

This plan is one independently reviewable subproject. It ends when the repository can build and validate Dataset v1, prove deterministic case-level extraction and splits, and report that the current 64-case corpus has zero training-eligible cases until human review and license records say otherwise. Milestone 3 training is a separate plan and must consume only the eligible case list emitted here.

## File and Responsibility Map

| File | Responsibility |
| --- | --- |
| `src/construction/templates/schematicBlockVolume.js` | Decode supported schematic formats once and expose bounded coordinate/index access plus a source SHA-256. |
| `src/construction/templates/schematicAnalyzer.js` | Reuse the block-volume adapter without changing existing Template Knowledge Base output. |
| `src/construction/templates/templateReviewOverlay.js` | Parse authoritative Stage 7 layer, canonical orientation, license, and allowed-use review fields. |
| `src/construction/templates/templateKnowledgeBaseV2.js` | Carry normalized governance fields into each case record. |
| `src/construction/learning/coarseSemanticVoxelDatasetGovernance.js` | Evaluate whether a case may be extracted, published as metadata, or admitted to training. |
| `src/construction/learning/coarseSemanticVoxelDatasetRasterizer.js` | Infer conservative envelope/space/site labels and deterministically resample them to `64^3`. |
| `src/construction/learning/coarseSemanticVoxelDatasetCase.js` | Build and validate one canonical Stage 7 condition/plan pair and its lightweight dataset case record. |
| `src/construction/learning/coarseSemanticVoxelDataset.js` | Build the versioned manifest, deterministic split map, JSONL, reports, and on-disk dataset layout. |
| `src/buildCoarseSemanticVoxelDataset.js` | Offline CLI entry point; never runs from normal `npm start`. |
| `mc_templates/datasets/coarse_semantic_voxels/v1/` | Canonical lightweight Dataset v1 manifest, cases, splits, and reports. |
| `.tmp/stage7-dataset/v1/` | Ignored local condition/plan artifacts used for diagnosis and later training preparation. |

## Fixed Dataset Contracts

Use these exact values throughout the tasks:

```js
export const STAGE7_DATASET_SOURCE = 'stage7-coarse-semantic-voxel-dataset-v1';
export const STAGE7_DATASET_SCHEMA_VERSION = 1;
export const STAGE7_DATASET_VERSION = 'v1';
export const STAGE7_DATASET_EXTRACTOR = 'stage7-coarse-semantic-voxel-schematic-extractor-v1';
export const STAGE7_DATASET_SPLIT_ALGORITHM = 'sha256-case-id-v1';
export const STAGE7_TARGET_LAYERS = Object.freeze(['envelope', 'site', 'space']);
export const STAGE7_SPLIT_RATIOS = Object.freeze({ train: 80, validation: 10, test: 10 });
```

The lightweight `cases.jsonl` record shape is:

```js
{
  case_id: 'house-a-small-modern-house',
  case_version: 'sha256:<knowledge-case-hash>',
  dataset_version: 'v1',
  origin: 'real',
  parent_case_id: null,
  split: 'train',
  source: {
    file: 'House/A Small Modern House - (mcbuild_org).schematic',
    sha256: '<64 hex chars>',
    url: 'https://mcbuild.org/schematics/16786:a-small-modern-house',
    author: '',
    license_status: 'unknown',
    allowed_uses: [],
    public_release_allowed: false
  },
  review: {
    status: 'pending',
    reviewed_by: '',
    reviewed_at: '',
    approved_learning_areas: [],
    blocked_learning_areas: [],
    canonical_front_side: null,
    review_record_ids: []
  },
  training: {
    eligible: false,
    permitted_layers: [],
    blockers: ['license-not-training-approved', 'review-status-pending']
  },
  original_bounds: { min_x: 0, min_y: 0, min_z: 0, max_x: 15, max_y: 9, max_z: 17 },
  normalized_transform: {
    resolution: [64, 64, 64],
    source_size: [16, 10, 18],
    occupied_size: [16, 10, 18],
    ground_y: 0,
    front_side: 'south'
  },
  artifacts: {
    condition_sha256: '<64 hex chars>',
    plan_sha256: '<64 hex chars>',
    repaired_plan_sha256: null,
    local_condition_path: '.tmp/stage7-dataset/v1/cases/house-a-small-modern-house/condition.json',
    local_plan_path: '.tmp/stage7-dataset/v1/cases/house-a-small-modern-house/plan.raw.json',
    local_repaired_plan_path: null
  },
  extraction: {
    schema_valid: true,
    semantic_status: 'rejected',
    run_count: 120,
    repair_count: 0,
    blockers: ['missing-entrance'],
    warnings: ['canonical front side is unreviewed; south used for diagnostics']
  }
}
```

Paths stored in JSON use `/` separators on Windows and Unix. `cases.jsonl` never embeds a dense tensor, raw block array, or copied schematic.

---

### Task 1: Extend Human Review and License Governance

**Files:**
- Modify: `src/construction/templates/templateReviewOverlay.js`
- Modify: `src/construction/templates/templateKnowledgeBaseV2.js`
- Create: `src/construction/learning/coarseSemanticVoxelDatasetGovernance.js`
- Modify: `test/templateReviewOverlay.test.js`
- Create: `test/coarseSemanticVoxelDatasetGovernance.test.js`

**Interfaces:**
- Consumes: existing `parseTemplateReviewOverlay(text, options)`, `mergeReviewRecords(records)`, and Template Knowledge Base v2 case records.
- Produces: `evaluateStage7DatasetEligibility({ caseRecord, requestedLayers }) -> { eligible, permitted_layers, blockers }` and normalized review fields `canonical_front_side`, `license_status`, `allowed_uses`, and `license_evidence`.

- [ ] **Step 1: Add failing review-overlay tests for governance fields**

Append tests that parse one valid reviewed record and reject unsupported values:

```js
test('review overlay normalizes Stage 7 dataset governance fields', () => {
  const parsed = parseTemplateReviewOverlay(JSON.stringify({
    record_id: 'review-stage7-house',
    case_id: 'house-a-small-modern-house',
    reviewed_by: 'curator',
    reviewed_at: '2026-07-12T00:00:00.000Z',
    status: 'limited',
    confidence: 0.95,
    approved_learning_areas: ['envelope', 'space'],
    blocked_learning_areas: ['site'],
    canonical_front_side: 'south',
    license_status: 'restricted',
    allowed_uses: ['local-analysis', 'local-training'],
    license_evidence: 'Source terms reviewed on 2026-07-12.'
  }));

  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.records[0].canonical_front_side, 'south');
  assert.equal(parsed.records[0].license_status, 'restricted');
  assert.deepEqual(parsed.records[0].allowed_uses, ['local-analysis', 'local-training']);
  assert.deepEqual(parsed.records[0].approved_learning_areas, ['envelope', 'space']);
});

test('review overlay rejects invalid Stage 7 governance values', () => {
  const parsed = parseTemplateReviewOverlay(JSON.stringify({
    record_id: 'review-stage7-invalid',
    case_id: 'house-invalid',
    status: 'approved',
    canonical_front_side: 'up',
    license_status: 'probably-free',
    allowed_uses: ['upload-anywhere']
  }));

  assert.equal(parsed.records.length, 0);
  assert.equal(parsed.errors.length, 1);
  assert.match(parsed.errors[0].message, /canonical_front_side|license_status|allowed_uses/);
});
```

- [ ] **Step 2: Run the review-overlay tests and verify failure**

Run: `node --test test/templateReviewOverlay.test.js`

Expected: FAIL because Stage 7 areas and governance fields are not normalized or rejected yet.

- [ ] **Step 3: Normalize the new fields without weakening existing review behavior**

In `templateReviewOverlay.js`, extend the accepted areas and add strict enumerations:

```js
const VALID_AREAS = new Set([
  'site', 'massing', 'facade', 'roof', 'space-planning', 'interior', 'materials', 'risk',
  'envelope', 'space'
]);
const VALID_FRONT_SIDES = new Set(['north', 'south', 'east', 'west']);
const VALID_LICENSE_STATUSES = new Set(['unknown', 'verified', 'restricted', 'prohibited']);
const VALID_ALLOWED_USES = new Set(['local-analysis', 'local-training', 'derived-metadata', 'public-release']);
```

Normalize the fields with these rules:

```js
function normalizeOptionalEnum(value, allowed, field) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim();
  if (!allowed.has(normalized)) throw new Error(`invalid ${field} ${normalized}`);
  return normalized;
}

function normalizeAllowedUses(value) {
  const uses = [...new Set((Array.isArray(value) ? value : []).map((item) => String(item).trim()))].sort();
  for (const use of uses) {
    if (!VALID_ALLOWED_USES.has(use)) throw new Error(`invalid allowed_uses value ${use}`);
  }
  return uses;
}
```

Add the following properties to both `normalizeReviewRecord(...)` and `defaultReviewForCase(...)`:

```js
canonical_front_side: normalizeOptionalEnum(raw.canonical_front_side, VALID_FRONT_SIDES, 'canonical_front_side'),
license_status: normalizeOptionalEnum(raw.license_status, VALID_LICENSE_STATUSES, 'license_status') || 'unknown',
allowed_uses: normalizeAllowedUses(raw.allowed_uses),
license_evidence: String(raw.license_evidence || '').trim()
```

For the default record use `canonical_front_side: null`, `license_status: 'unknown'`, `allowed_uses: []`, and `license_evidence: ''`.

- [ ] **Step 4: Carry authoritative governance into Knowledge Base v2 cases**

In `templateKnowledgeBaseV2.js`, replace the `source` and `review` properties inside `buildCaseV2(...)` with the following exact fields. A non-empty review overlay is the only source of positive license permission:

```js
source: {
  url: card.source_url || '',
  note: card.source_note || '',
  license_status: review.license_status || 'unknown',
  author: '',
  allowed_uses: [...new Set(review.allowed_uses || [])].sort(),
  public_release_allowed: (review.allowed_uses || []).includes('public-release'),
  license_evidence: review.license_evidence || ''
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
  review_record_ids: review.review_record_ids || [],
  canonical_front_side: review.canonical_front_side || null,
  license_status: review.license_status || 'unknown',
  allowed_uses: [...new Set(review.allowed_uses || [])].sort(),
  license_evidence: review.license_evidence || ''
}
```

Do not infer `local-training` or `public-release` from a source URL, filename, author, or existing local file.

- [ ] **Step 5: Add failing eligibility tests**

Create `test/coarseSemanticVoxelDatasetGovernance.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStage7DatasetEligibility } from '../src/construction/learning/coarseSemanticVoxelDatasetGovernance.js';

const approved = {
  case_id: 'house-reviewed',
  source: { license_status: 'restricted', allowed_uses: ['local-analysis', 'local-training'] },
  review: {
    status: 'limited',
    approved_learning_areas: ['envelope', 'site', 'space'],
    blocked_learning_areas: [],
    canonical_front_side: 'south',
    reviewed_by: 'curator',
    reviewed_at: '2026-07-12T00:00:00.000Z'
  }
};

test('limited reviewed case is eligible only for explicitly approved Stage 7 layers', () => {
  const eligible = evaluateStage7DatasetEligibility({ caseRecord: approved });
  assert.equal(eligible.eligible, true);
  assert.deepEqual(eligible.permitted_layers, ['envelope', 'site', 'space']);
  assert.deepEqual(eligible.blockers, []);

  const blocked = evaluateStage7DatasetEligibility({
    caseRecord: { ...approved, review: { ...approved.review, approved_learning_areas: ['envelope', 'site'] } }
  });
  assert.equal(blocked.eligible, false);
  assert.ok(blocked.blockers.includes('learning-area-space-not-approved'));
});

test('pending or unknown-license cases never enter training', () => {
  const result = evaluateStage7DatasetEligibility({
    caseRecord: {
      case_id: 'house-pending',
      source: { license_status: 'unknown', allowed_uses: [] },
      review: { status: 'pending', approved_learning_areas: [], blocked_learning_areas: [], canonical_front_side: null }
    }
  });
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('review-status-pending'));
  assert.ok(result.blockers.includes('license-not-training-approved'));
  assert.ok(result.blockers.includes('canonical-front-side-unreviewed'));
});
```

- [ ] **Step 6: Implement the deterministic eligibility gate**

Create `coarseSemanticVoxelDatasetGovernance.js` with exact sorted output:

```js
export const STAGE7_TARGET_LAYERS = Object.freeze(['envelope', 'site', 'space']);

export function evaluateStage7DatasetEligibility({ caseRecord = {}, requestedLayers = STAGE7_TARGET_LAYERS } = {}) {
  const review = caseRecord.review || {};
  const source = caseRecord.source || {};
  const requested = [...new Set(requestedLayers.map(String))].sort();
  const approved = new Set(review.approved_learning_areas || []);
  const blocked = new Set(review.blocked_learning_areas || []);
  const permitted = requested.filter((layer) => !blocked.has(layer) && (review.status === 'approved' || approved.has(layer)));
  const blockers = [];

  if (!['approved', 'limited'].includes(review.status)) blockers.push(`review-status-${review.status || 'missing'}`);
  if (!source.allowed_uses?.includes('local-training') || !['verified', 'restricted'].includes(source.license_status)) {
    blockers.push('license-not-training-approved');
  }
  if (!['north', 'south', 'east', 'west'].includes(review.canonical_front_side)) blockers.push('canonical-front-side-unreviewed');
  for (const layer of requested) {
    if (blocked.has(layer)) blockers.push(`learning-area-${layer}-blocked`);
    else if (!permitted.includes(layer)) blockers.push(`learning-area-${layer}-not-approved`);
  }

  return {
    eligible: blockers.length === 0,
    permitted_layers: permitted.sort(),
    blockers: [...new Set(blockers)].sort()
  };
}
```

- [ ] **Step 7: Run focused and regression tests**

Run: `node --test test/templateReviewOverlay.test.js test/templateKnowledgeBaseV2.test.js test/coarseSemanticVoxelDatasetGovernance.test.js`

Expected: PASS with no changed behavior in existing retrieval governance tests.

- [ ] **Step 8: Commit the governance boundary**

```bash
git add src/construction/templates/templateReviewOverlay.js src/construction/templates/templateKnowledgeBaseV2.js src/construction/learning/coarseSemanticVoxelDatasetGovernance.js test/templateReviewOverlay.test.js test/coarseSemanticVoxelDatasetGovernance.test.js
git commit -m "feat: govern stage 7 dataset eligibility"
```

---

### Task 2: Extract a Reusable Immutable Schematic Block Volume

**Files:**
- Create: `src/construction/templates/schematicBlockVolume.js`
- Modify: `src/construction/templates/schematicAnalyzer.js`
- Create: `test/schematicBlockVolume.test.js`
- Modify: `test/templateKnowledgeBaseV2.test.js`

**Interfaces:**
- Consumes: `parseNbt(buffer)` from `src/construction/templates/nbt.js` and all three currently supported formats: classic `Blocks`, Sponge `BlockData`, and region palette schematics.
- Produces: `decodeSchematicBlockVolume(buffer)` and `readSchematicBlockVolume(filePath)`, returning `{ source_sha256, root_name, format, width, height, length, materials, block_count, blockAt(x,y,z), blockAtIndex(index) }`.

- [ ] **Step 1: Write block-volume contract tests using a real repository fixture**

Create `test/schematicBlockVolume.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  readSchematicBlockVolume,
  decodeSchematicBlockVolume
} from '../src/construction/templates/schematicBlockVolume.js';

const FIXTURE = path.resolve('mc_templates/House/A Small Modern House - (mcbuild_org).schematic');

test('schematic block volume exposes stable hash, dimensions, and bounded block access', async () => {
  const bytes = await fs.readFile(FIXTURE);
  const volume = await readSchematicBlockVolume(FIXTURE);
  assert.equal(volume.source_sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.ok(volume.width > 0 && volume.height > 0 && volume.length > 0);
  assert.equal(volume.block_count, volume.width * volume.height * volume.length);
  assert.deepEqual(volume.blockAt(-1, 0, 0), { state: 'minecraft:air', name: 'air', category: 'air', air: true });
  assert.deepEqual(volume.blockAt(volume.width, 0, 0), { state: 'minecraft:air', name: 'air', category: 'air', air: true });
  assert.equal(typeof volume.blockAtIndex(0).state, 'string');
});

test('schematic block volume rejects malformed NBT without partial output', () => {
  assert.throws(() => decodeSchematicBlockVolume(Buffer.from('not nbt')), /NBT|schematic|Unexpected end/);
});
```

- [ ] **Step 2: Run the new test and verify module-not-found failure**

Run: `node --test test/schematicBlockVolume.test.js`

Expected: FAIL because `schematicBlockVolume.js` does not exist.

- [ ] **Step 3: Move format decoding behind one immutable adapter**

Move the existing `normalizeSchematicRoot`, Sponge palette, varint, region palette, packed-state, block-state-name, block lookup, block-name, and block-category helpers from `schematicAnalyzer.js` into `schematicBlockVolume.js` without changing their decoding logic. Export only these public functions:

```js
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseNbt } from './nbt.js';

const AIR = Object.freeze({ state: 'minecraft:air', name: 'air', category: 'air', air: true });

export function decodeSchematicBlockVolume(buffer) {
  const parsed = parseNbt(buffer);
  const schematic = normalizeSchematicRoot(parsed.value);
  const sourceSha256 = createHash('sha256').update(buffer).digest('hex');
  const blockAtIndex = (index) => index >= 0 && index < schematic.blockCount ? decodeBlockAt(schematic, index) : AIR;
  const blockAt = (x, y, z) => {
    if (![x, y, z].every(Number.isInteger) || x < 0 || y < 0 || z < 0 || x >= schematic.width || y >= schematic.height || z >= schematic.length) return AIR;
    return blockAtIndex(y * schematic.length * schematic.width + z * schematic.width + x);
  };
  return Object.freeze({
    source_sha256: sourceSha256,
    root_name: parsed.name,
    format: schematic.format,
    width: schematic.width,
    height: schematic.height,
    length: schematic.length,
    materials: schematic.materials,
    block_count: schematic.blockCount,
    blockAt,
    blockAtIndex
  });
}

export async function readSchematicBlockVolume(filePath) {
  return decodeSchematicBlockVolume(await fs.readFile(filePath));
}
```

`decodeBlockAt(...)` must return exactly `{ state, name, category, air }`; strip block-state properties from `name` while preserving the full state string in `state`.

- [ ] **Step 4: Make the existing analyzer consume the adapter**

Replace direct NBT reading in `analyzeSchematicFile(...)` with:

```js
const schematic = await readSchematicBlockVolume(filePath);
const voxels = analyzeVoxels(schematic);
voxels.spatial_layout = analyzeSpatialLayout(schematic, {
  blockAt: (index) => schematic.blockAtIndex(index),
  interiorSignalCategories
});
```

Update analyzer helpers to call `schematic.blockAtIndex(index)` and use `block_count`; keep the serialized `template.schematic` output byte-compatible apart from no intentional field additions. Do not expose block arrays in Template Knowledge Base artifacts.

- [ ] **Step 5: Run focused decoding and corpus regression tests**

Run: `node --test test/schematicBlockVolume.test.js test/templateKnowledgeBaseV2.test.js test/templateCompositionMiner.test.js test/templateSpatialAnalyzer.test.js`

Expected: PASS, including `knowledge base v2 artifact generation is byte-stable for unchanged inputs`.

- [ ] **Step 6: Run offline single-corpus smoke test**

Run: `npm run analyze:templates -- --offline --max-pages 0`

Expected: exit `0`; existing Stage 5 and Stage 6 artifacts are still reported. Revert any generated `mc_templates/analysis/` differences unless they are byte-for-byte identical and already tracked.

- [ ] **Step 7: Commit the reusable decoder**

```bash
git add src/construction/templates/schematicBlockVolume.js src/construction/templates/schematicAnalyzer.js test/schematicBlockVolume.test.js test/templateKnowledgeBaseV2.test.js
git commit -m "refactor: expose immutable schematic block volumes"
```

---

### Task 3: Deterministically Rasterize Envelope, Space, and Site Layers

**Files:**
- Create: `src/construction/learning/coarseSemanticVoxelDatasetRasterizer.js`
- Create: `test/coarseSemanticVoxelDatasetRasterizer.test.js`
- Create: `test/fixtures/stage7DatasetFixtures.js`

**Interfaces:**
- Consumes: a block volume from Task 2 and a Knowledge Base v2 case record from Task 1.
- Produces: `rasterizeSchematicToStage7({ volume, caseRecord }) -> { cells, original_bounds, normalized_transform, stats, warnings }`, where `cells` are accepted by `encodeStage7Cells(...)`.

- [ ] **Step 1: Write a deterministic hollow-house fixture and failing tests**

Create `test/fixtures/stage7DatasetFixtures.js` with an in-memory volume fixture rather than writing NBT, then import it from the rasterizer test:

```js
export function hollowHouseVolumeFixture() {
  const width = 9, height = 7, length = 9;
  const blocks = new Map();
  const set = (x, y, z, state) => blocks.set(`${x},${y},${z}`, state);
  for (let x = 1; x <= 7; x += 1) for (let z = 1; z <= 7; z += 1) {
    set(x, 1, z, 'minecraft:oak_planks');
    set(x, 5, z, 'minecraft:oak_slab');
  }
  for (let y = 2; y <= 4; y += 1) for (let i = 1; i <= 7; i += 1) {
    set(1, y, i, 'minecraft:oak_planks');
    set(7, y, i, 'minecraft:oak_planks');
    set(i, y, 1, 'minecraft:oak_planks');
    set(i, y, 7, 'minecraft:oak_planks');
  }
  set(4, 2, 7, 'minecraft:oak_door[half=lower]');
  set(4, 3, 7, 'minecraft:oak_door[half=upper]');
  for (let x = 0; x < width; x += 1) set(x, 0, 8, x < 4 ? 'minecraft:water' : 'minecraft:grass_block');
  return {
    source_sha256: 'a'.repeat(64), width, height, length, block_count: width * height * length,
    blockAt(x, y, z) {
      const state = blocks.get(`${x},${y},${z}`) || 'minecraft:air';
      const name = state.replace(/^minecraft:/, '').replace(/\[.*$/, '');
      return { state, name, category: /water/.test(name) ? 'water' : /grass/.test(name) ? 'earth' : state === 'minecraft:air' ? 'air' : 'structure', air: state === 'minecraft:air' };
    }
  };
}

export function pendingCaseFixture() {
  return {
    case_id: 'house-hollow', title: 'Hollow House', file: 'House/Hollow House.schematic',
    case_version: `sha256:${'b'.repeat(64)}`,
    identity: { style_family: 'rustic', typology: 'house' },
    source: { url: 'https://example.invalid/hollow-house', author: '', license_status: 'unknown', allowed_uses: [], public_release_allowed: false },
    review: { status: 'pending', reviewed_by: '', reviewed_at: '', approved_learning_areas: [], blocked_learning_areas: [], canonical_front_side: null, review_record_ids: [] }
  };
}

export function reviewedCaseFixture() {
  const value = pendingCaseFixture();
  return {
    ...value,
    source: { ...value.source, license_status: 'restricted', allowed_uses: ['local-analysis', 'local-training'] },
    review: { ...value.review, status: 'limited', reviewed_by: 'fixture-curator', reviewed_at: '2026-07-12T00:00:00.000Z', approved_learning_areas: ['envelope', 'site', 'space'], canonical_front_side: 'south', review_record_ids: ['fixture-review'] }
  };
}
```

Create `test/coarseSemanticVoxelDatasetRasterizer.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { rasterizeSchematicToStage7 } from '../src/construction/learning/coarseSemanticVoxelDatasetRasterizer.js';
import { hollowHouseVolumeFixture } from './fixtures/stage7DatasetFixtures.js';

const reviewedCase = {
  case_id: 'house-hollow',
  identity: { style_family: 'rustic', typology: 'house' },
  review: { canonical_front_side: 'south' }
};

test('rasterizer produces deterministic canonical layer cells', () => {
  const first = rasterizeSchematicToStage7({ volume: hollowHouseVolumeFixture(), caseRecord: reviewedCase });
  const second = rasterizeSchematicToStage7({ volume: hollowHouseVolumeFixture(), caseRecord: reviewedCase });
  assert.deepEqual(first, second);
  assert.ok(first.cells.some((cell) => cell.envelope === 'wall'));
  assert.ok(first.cells.some((cell) => cell.envelope === 'roof'));
  assert.ok(first.cells.some((cell) => cell.envelope === 'opening'));
  assert.ok(first.cells.some((cell) => cell.space === 'public'));
  assert.ok(first.cells.some((cell) => cell.site === 'water'));
  assert.deepEqual(first.normalized_transform.resolution, [64, 64, 64]);
});

test('unreviewed orientation is diagnostic-only and explicitly warned', () => {
  const result = rasterizeSchematicToStage7({
    volume: hollowHouseVolumeFixture(),
    caseRecord: { ...reviewedCase, review: { canonical_front_side: null } }
  });
  assert.equal(result.normalized_transform.front_side, 'south');
  assert.ok(result.warnings.includes('canonical front side is unreviewed; south used for diagnostics'));
});
```

- [ ] **Step 2: Run the rasterizer tests and verify failure**

Run: `node --test test/coarseSemanticVoxelDatasetRasterizer.test.js`

Expected: FAIL because the rasterizer module does not exist.

- [ ] **Step 3: Implement occupied bounds and normalized coordinate mapping**

Use source occupied bounds, not the full schematic padding. Map inclusive source coordinates with:

```js
function gridCoordinate(value, min, size) {
  if (size <= 1) return 0;
  return Math.max(0, Math.min(63, Math.floor(((value - min) * 64) / size)));
}

function sourceBounds(volume) {
  const bounds = { min_x: Infinity, min_y: Infinity, min_z: Infinity, max_x: -1, max_y: -1, max_z: -1 };
  for (let y = 0; y < volume.height; y += 1) for (let z = 0; z < volume.length; z += 1) for (let x = 0; x < volume.width; x += 1) {
    if (volume.blockAt(x, y, z).air) continue;
    bounds.min_x = Math.min(bounds.min_x, x); bounds.max_x = Math.max(bounds.max_x, x);
    bounds.min_y = Math.min(bounds.min_y, y); bounds.max_y = Math.max(bounds.max_y, y);
    bounds.min_z = Math.min(bounds.min_z, z); bounds.max_z = Math.max(bounds.max_z, z);
  }
  if (bounds.max_x < 0) throw new Error('Stage 7 dataset extraction requires at least one non-air block');
  return bounds;
}
```

Record both original volume size and occupied size. Never rotate source blocks silently; `canonical_front_side` defines semantic orientation and later augmentation remains outside M2 extraction.

- [ ] **Step 4: Implement conservative source semantic classification**

Use these ordered rules before resampling:

1. Water blocks become `site: water`.
2. Leaves, logs used as vegetation, flowers, crops, vines, and saplings become `site: vegetation` unless they are inside the enclosed building envelope.
3. Dirt, grass, sand, gravel, mud, clay, snow ground, and path blocks become `site: ground` or `site: path`.
4. Doors, trapdoors used as openings, glass panes, and glass blocks on the exterior boundary become `envelope: opening`.
5. Man-made solids adjacent to exterior air above become `envelope: roof`; those adjacent to exterior air horizontally become `wall`; those below enclosed air become `floor`; remaining solids become `support`.
6. Flood-fill air from a one-cell padded boundary. Air not reached by this flood is enclosed space.
7. Enclosed ground-level components touching an opening become `public`; enclosed upper components become `private`; components smaller than 8 percent of enclosed air become `service`; one-cell or two-cell wide connectors become `circulation`.
8. Enclosed cells adjacent to stairs, ladders, scaffolding, or elevators become `vertical_circulation`.
9. Unresolved enclosed cells become `void`, never a guessed room type.

Represent each classified source sample as `{ x, y, z, envelope, space, site, confidence }`. Use confidence `1` for direct block identity, `0.85` for exterior-air geometry, `0.7` for enclosed-space zoning, and `0.55` for unresolved `void`.

- [ ] **Step 5: Implement deterministic collision reduction into `64^3` cells**

For source samples mapping to the same grid coordinate, count labels independently per layer and choose by count, then the fixed priority order:

```js
const ENVELOPE_PRIORITY = ['opening', 'roof', 'wall', 'floor', 'support', 'none'];
const SPACE_PRIORITY = ['vertical_circulation', 'circulation', 'public', 'private', 'service', 'void', 'outside'];
const SITE_PRIORITY = ['water', 'path', 'courtyard', 'vegetation', 'ground', 'none'];

function chooseLabel(counts, priority) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || priority.indexOf(a[0]) - priority.indexOf(b[0]))[0]?.[0] || priority.at(-1);
}
```

Emit cells sorted by `z`, then `y`, then `x`, omit `none/outside/none`, clamp mean confidence to `[0,1]`, and attach `evidence_ids: [\`source:${caseRecord.case_id}\`]`. Return bounded counts in `stats` so reports do not need to decode runs again.

- [ ] **Step 6: Run focused tests and Stage 7 schema round-trip**

Add this assertion to the first test:

```js
const runs = encodeStage7Cells(first.cells);
assert.deepEqual(encodeStage7Cells(decodeStage7Runs(runs)), runs);
```

Run: `node --test test/coarseSemanticVoxelDatasetRasterizer.test.js test/coarseSemanticVoxelSchema.test.js`

Expected: PASS; two runs of the fixture are deeply equal.

- [ ] **Step 7: Commit the rasterizer**

```bash
git add src/construction/learning/coarseSemanticVoxelDatasetRasterizer.js test/coarseSemanticVoxelDatasetRasterizer.test.js test/fixtures/stage7DatasetFixtures.js
git commit -m "feat: rasterize schematic semantics for stage 7"
```

---

### Task 4: Build One Canonical Dataset Case and Diagnostic Report

**Files:**
- Create: `src/construction/learning/coarseSemanticVoxelDatasetCase.js`
- Create: `test/coarseSemanticVoxelDatasetCase.test.js`

**Interfaces:**
- Consumes: `rasterizeSchematicToStage7(...)`, `evaluateStage7DatasetEligibility(...)`, `createStage7Plan(...)`, `validateStage7Condition(...)`, `validateStage7Plan(...)`, and `repairCoarseSemanticVoxelPlan(...)`.
- Produces: `buildStage7DatasetCase({ volume, caseRecord, datasetVersion, localArtifactRoot }) -> { condition, rawPlan, repairedPlan, record, report }` and `renderStage7DatasetCaseReport(record) -> string`. `repairedPlan` is `repair.plan` only when repair is accepted; otherwise it is `null`. The initial record has `split: null`.

- [ ] **Step 1: Write failing canonical case tests**

Import `hollowHouseVolumeFixture`, `pendingCaseFixture`, and `reviewedCaseFixture` from `test/fixtures/stage7DatasetFixtures.js`. Test both pending and reviewed governance:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStage7DatasetCase } from '../src/construction/learning/coarseSemanticVoxelDatasetCase.js';
import { validateStage7Condition, validateStage7Plan } from '../src/construction/learning/coarseSemanticVoxelSchema.js';
import { hollowHouseVolumeFixture, pendingCaseFixture, reviewedCaseFixture } from './fixtures/stage7DatasetFixtures.js';

test('dataset case emits canonical artifacts while pending review stays training-ineligible', () => {
  const result = buildStage7DatasetCase({
    volume: hollowHouseVolumeFixture(),
    caseRecord: pendingCaseFixture(),
    datasetVersion: 'v1',
    localArtifactRoot: '.tmp/stage7-dataset/v1'
  });
  assert.equal(validateStage7Condition(result.condition).ok, true);
  assert.equal(validateStage7Plan(result.rawPlan, { condition: result.condition }).ok, true);
  assert.equal(result.record.training.eligible, false);
  assert.ok(result.record.training.blockers.includes('review-status-pending'));
  assert.equal(result.record.source.sha256, 'a'.repeat(64));
  assert.match(result.report, /Training eligible: no/);
});

test('dataset case hashes are deterministic and provider provenance is complete', () => {
  const input = {
    volume: hollowHouseVolumeFixture(),
    caseRecord: reviewedCaseFixture(),
    datasetVersion: 'v1',
    localArtifactRoot: '.tmp/stage7-dataset/v1'
  };
  const first = buildStage7DatasetCase(input);
  const second = buildStage7DatasetCase(input);
  assert.equal(first.record.artifacts.condition_sha256, second.record.artifacts.condition_sha256);
  assert.equal(first.record.artifacts.plan_sha256, second.record.artifacts.plan_sha256);
  assert.deepEqual(first.rawPlan.provider, {
    kind: 'dataset-extraction',
    name: 'stage7-coarse-semantic-voxel-schematic-extractor-v1',
    model_version: null,
    dataset_version: 'v1'
  });
});
```

- [ ] **Step 2: Run the dataset-case tests and verify failure**

Run: `node --test test/coarseSemanticVoxelDatasetCase.test.js`

Expected: FAIL because the case builder module does not exist.

- [ ] **Step 3: Build a deterministic dataset condition**

Construct a normal Stage 7 condition with no self-reference in `references`. Derive `seed` from the first eight source-hash characters, clamp estimated floors to `1..5`, and hash the condition with `hashCanonicalValue`:

```js
function buildDatasetCondition({ caseRecord, raster, volume }) {
  const occupied = raster.normalized_transform.occupied_size;
  const frontSide = raster.normalized_transform.front_side;
  const condition = {
    source: STAGE7_CONDITION_SOURCE,
    schema_version: STAGE7_SCHEMA_VERSION,
    prompt: `reference schematic: ${caseRecord.title || caseRecord.case_id}`,
    seed: Number.parseInt(volume.source_sha256.slice(0, 8), 16),
    dimensions: {
      width: Math.max(1, occupied[0]), depth: Math.max(1, occupied[2]),
      floors: Math.max(1, Math.min(5, Math.round(occupied[1] / 4))),
      floor_height: 4, total_height: Math.max(1, occupied[1]),
      lot_width: Math.max(1, volume.width), lot_depth: Math.max(1, volume.length)
    },
    design: {
      style_family: caseRecord.identity?.style_family || 'general',
      typology: caseRecord.identity?.typology || 'building',
      footprint: 'source-derived', front_side: frontSide,
      abstract_site_tags: [], selected_concept_id: null,
      massing_strategy: [], space_strategy: [], quality_targets: ['source-traceability']
    },
    references: [],
    constraints: { resolution: [64, 64, 64], max_total_height: Math.max(40, occupied[1]), minecraft_fill_limit: 32768 }
  };
  condition.condition_hash = hashCanonicalValue(condition);
  return condition;
}
```

- [ ] **Step 4: Build the raw plan, repair diagnostics, and training decision**

Create evidence and the canonical plan through existing Stage 7 APIs:

```js
const evidence = [{
  id: `source:${caseRecord.case_id}`,
  kind: 'raw-schematic',
  source_id: volume.source_sha256,
  detail: caseRecord.file || caseRecord.source?.file || ''
}];
const rawPlan = createStage7Plan({
  condition,
  provider: {
    kind: 'dataset-extraction',
    name: STAGE7_DATASET_EXTRACTOR,
    model_version: null,
    dataset_version: datasetVersion
  },
  cells: raster.cells,
  evidence
});
const schema = validateStage7Plan(rawPlan, { condition });
if (!schema.ok) throw new Error(`invalid extracted Stage 7 plan: ${schema.errors.join('; ')}`);
const repair = repairCoarseSemanticVoxelPlan({ plan: rawPlan, condition });
const governance = evaluateStage7DatasetEligibility({ caseRecord });
const trainingBlockers = [...governance.blockers];
if (!repair.accepted) trainingBlockers.push('semantic-validation-rejected');
```

The raw plan remains the source-derived truth. The repaired plan is a separately hashed candidate and is never silently substituted for raw extraction.

- [ ] **Step 5: Build the lightweight record and Markdown report**

Normalize paths with `.replaceAll('\\', '/')`. The record must use the fixed contract at the top of this plan. Compute `condition_sha256`, `plan_sha256`, and optional `repaired_plan_sha256` with `hashCanonicalValue`. Set final `training.eligible` only when governance is eligible and repair is accepted.

Export `renderStage7DatasetCaseReport(record)`. The initial report must contain these headings and values; before Task 5 assigns a split it prints `Split: unassigned`:

```markdown
# Stage 7 M2 Dataset Case: <case_id>

- Source SHA-256: <hash>
- Review status: <status>
- License status: <status>
- Training eligible: yes|no
- Split: <train|validation|test|unassigned>

## Transform
## Semantic Counts
## Schema Validation
## Repairs
## Blockers
## Warnings
```

- [ ] **Step 6: Run focused case, schema, and repair tests**

Run: `node --test test/coarseSemanticVoxelDatasetCase.test.js test/coarseSemanticVoxelSchema.test.js test/coarseSemanticVoxelRepair.test.js`

Expected: PASS; pending review remains a structured ineligible record rather than an exception.

- [ ] **Step 7: Commit canonical case extraction**

```bash
git add src/construction/learning/coarseSemanticVoxelDatasetCase.js test/coarseSemanticVoxelDatasetCase.test.js
git commit -m "feat: build canonical stage 7 dataset cases"
```

---

### Task 5: Build Dataset Manifest, Stable Splits, and Validation

**Files:**
- Create: `src/construction/learning/coarseSemanticVoxelDataset.js`
- Create: `test/coarseSemanticVoxelDataset.test.js`

**Interfaces:**
- Consumes: lightweight records from `buildStage7DatasetCase(...)`.
- Produces: `assignStage7DatasetSplit({ caseId, origin, parentSplit }) -> string`, `buildStage7DatasetIndex({ records, generatedAt }) -> { manifest, records, splits }`, `validateStage7Dataset({ manifest, records, splits }) -> { ok, errors }`, `stage7DatasetCasesJsonl(records) -> string`, and `renderStage7DatasetReport({ manifest, records, splits }) -> string`.

- [ ] **Step 1: Write failing deterministic split tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignStage7DatasetSplit,
  buildStage7DatasetIndex,
  validateStage7Dataset
} from '../src/construction/learning/coarseSemanticVoxelDataset.js';

function datasetRecordFixture() {
  return {
    case_id: 'house-source', case_version: `sha256:${'b'.repeat(64)}`, dataset_version: 'v1',
    origin: 'real', parent_case_id: null, split: 'train',
    source: { file: 'House/Source.schematic', sha256: 'a'.repeat(64), url: '', author: '', license_status: 'restricted', allowed_uses: ['local-training'], public_release_allowed: false },
    review: { status: 'approved', reviewed_by: 'fixture', reviewed_at: '2026-07-12T00:00:00.000Z', approved_learning_areas: ['envelope', 'site', 'space'], blocked_learning_areas: [], canonical_front_side: 'south', review_record_ids: ['fixture-review'] },
    training: { eligible: true, permitted_layers: ['envelope', 'site', 'space'], blockers: [] },
    original_bounds: { min_x: 0, min_y: 0, min_z: 0, max_x: 8, max_y: 6, max_z: 8 },
    normalized_transform: { resolution: [64, 64, 64], source_size: [9, 7, 9], occupied_size: [9, 7, 9], ground_y: 0, front_side: 'south' },
    artifacts: { condition_sha256: 'c'.repeat(64), plan_sha256: 'd'.repeat(64), repaired_plan_sha256: null, local_condition_path: '.tmp/condition.json', local_plan_path: '.tmp/plan.json', local_repaired_plan_path: null },
    extraction: { schema_valid: true, semantic_status: 'accepted', run_count: 4, repair_count: 0, blockers: [], warnings: [] }
  };
}

function datasetIndexFixture() {
  const built = buildStage7DatasetIndex({ records: [datasetRecordFixture()], generatedAt: '2026-07-12T00:00:00.000Z' });
  return structuredClone(built);
}

test('real case split is stable and descendants never cross source-case boundaries', () => {
  const first = assignStage7DatasetSplit({ caseId: 'house-a-small-modern-house', origin: 'real' });
  const second = assignStage7DatasetSplit({ caseId: 'house-a-small-modern-house', origin: 'real' });
  assert.equal(first, second);
  assert.ok(['train', 'validation', 'test'].includes(first));
  assert.equal(assignStage7DatasetSplit({ caseId: 'house-a-small-modern-house:rot90', origin: 'augmented', parentSplit: first }), first);
  assert.equal(assignStage7DatasetSplit({ caseId: 'synthetic-baseline-1', origin: 'synthetic' }), 'train');
});

test('dataset validation rejects leakage and ineligible training membership', () => {
  const fixture = datasetIndexFixture();
  fixture.records[0].training.eligible = false;
  fixture.manifest.training_case_ids = [fixture.records[0].case_id];
  const differentSplit = fixture.records[0].split === 'train' ? 'test' : 'train';
  fixture.splits.assignments['house-source-child'] = differentSplit;
  fixture.records.push({ ...fixture.records[0], case_id: 'house-source-child', origin: 'augmented', parent_case_id: fixture.records[0].case_id, split: differentSplit });
  const result = validateStage7Dataset(fixture);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => /ineligible training case/gi.test(item)));
  assert.ok(result.errors.some((item) => /source-case leakage/gi.test(item)));
});
```

- [ ] **Step 2: Run dataset tests and verify failure**

Run: `node --test test/coarseSemanticVoxelDataset.test.js`

Expected: FAIL because the dataset index module does not exist.

- [ ] **Step 3: Implement SHA-256 case-level split assignment**

Use the first 32 bits of `sha256(caseId)` modulo 100:

```js
export function assignStage7DatasetSplit({ caseId, origin = 'real', parentSplit } = {}) {
  if (origin === 'augmented') {
    if (!['train', 'validation', 'test'].includes(parentSplit)) throw new Error('augmented case requires parentSplit');
    return parentSplit;
  }
  if (origin === 'synthetic') return 'train';
  if (origin !== 'real') throw new Error(`unsupported Stage 7 dataset origin: ${origin}`);
  const bucket = Number.parseInt(createHash('sha256').update(String(caseId)).digest('hex').slice(0, 8), 16) % 100;
  return bucket < 80 ? 'train' : bucket < 90 ? 'validation' : 'test';
}
```

Assign every real source case before eligibility filtering. Approval changes may change `training_case_ids`, but they must never change the case's split.

- [ ] **Step 4: Implement manifest and split objects**

Sort records by `case_id`; reject duplicates. `buildStage7DatasetIndex(...)` assigns every real source split first, then resolves augmented records from their parent's assigned split, and returns newly cloned records rather than mutating its input. Build:

```js
const splits = {
  source: 'stage7-coarse-semantic-voxel-splits-v1',
  schema_version: 1,
  algorithm: STAGE7_DATASET_SPLIT_ALGORITHM,
  ratios: STAGE7_SPLIT_RATIOS,
  assignments: Object.fromEntries(records.map((record) => [record.case_id, record.split]))
};
const trainingCaseIds = records.filter((record) => record.training.eligible).map((record) => record.case_id).sort();
const manifest = {
  source: STAGE7_DATASET_SOURCE,
  schema_version: STAGE7_DATASET_SCHEMA_VERSION,
  dataset_version: STAGE7_DATASET_VERSION,
  generated_at: generatedAt,
  extractor: STAGE7_DATASET_EXTRACTOR,
  split_algorithm: STAGE7_DATASET_SPLIT_ALGORITHM,
  case_count: records.length,
  training_eligible_count: trainingCaseIds.length,
  training_case_ids: trainingCaseIds,
  origin_counts: countByOrigin(records),
  split_counts: countBySplit(records),
  artifacts: { cases: 'cases.jsonl', splits: 'splits.json', reports: 'reports/' }
};
return { manifest, records: assignedRecords, splits };
```

Use `SOURCE_DATE_EPOCH` when present; otherwise use the fixed Dataset v1 generation time `2026-07-12T00:00:00.000Z` so unchanged inputs produce byte-identical artifacts.

- [ ] **Step 5: Validate the complete dataset contract**

`validateStage7Dataset(...)` must report, without throwing:

- duplicate case IDs;
- missing or malformed source SHA-256;
- unsupported origin or split;
- augmented cases with a missing parent or a different split;
- synthetic cases in validation or test;
- `training_case_ids` containing an ineligible or unknown case;
- missing review, license, transform, condition hash, or plan hash provenance;
- manifest counts that disagree with records;
- split assignments that disagree with record splits.

Return `{ ok, errors: [...new Set(errors)].sort() }`.

- [ ] **Step 6: Render stable JSONL and summary report**

`stage7DatasetCasesJsonl(records)` must serialize sorted records one per line with a final newline. `renderStage7DatasetReport(...)` must include case, origin, split, eligibility, review-state, license-state, schema-valid, and semantic-status counts plus a table of every blocker and its count.

- [ ] **Step 7: Run dataset and governance tests**

Run: `node --test test/coarseSemanticVoxelDataset.test.js test/coarseSemanticVoxelDatasetGovernance.test.js test/coarseSemanticVoxelDatasetCase.test.js`

Expected: PASS with zero leakage and stable repeated output.

- [ ] **Step 8: Commit the dataset index**

```bash
git add src/construction/learning/coarseSemanticVoxelDataset.js test/coarseSemanticVoxelDataset.test.js
git commit -m "feat: index and split stage 7 dataset cases"
```

---

### Task 6: Write Dataset v1 Artifacts and Offline CLI

**Files:**
- Modify: `src/construction/learning/coarseSemanticVoxelDataset.js`
- Create: `src/buildCoarseSemanticVoxelDataset.js`
- Create: `test/stage7DatasetCli.test.js`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: raw template root, `case_library.v2.json`, Task 2 block-volume reader, Task 4 case builder, and Task 5 dataset index.
- Produces: `writeStage7DatasetArtifacts({ templateRoot, knowledgeBasePath, outputDir, localArtifactRoot, caseIds, requireEligible })` and the package command `npm run dataset:stage7`.

- [ ] **Step 1: Write failing writer and CLI tests in temporary directories**

Use one copied real schematic and a temporary Knowledge Base v2 record. The record stays `pending/unknown` to prove the default gate:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeStage7DatasetArtifacts } from '../src/construction/learning/coarseSemanticVoxelDataset.js';
import { pendingCaseFixture } from './fixtures/stage7DatasetFixtures.js';

async function createStage7DatasetCorpusFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-m2-dataset-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const templateRoot = path.join(root, 'mc_templates');
  const houseDir = path.join(templateRoot, 'House');
  const outputDir = path.join(root, 'index');
  const localArtifactRoot = path.join(root, 'local');
  const knowledgeBasePath = path.join(root, 'case_library.v2.json');
  await fs.mkdir(houseDir, { recursive: true });
  const file = 'House/A Small Modern House - (mcbuild_org).schematic';
  await fs.copyFile(path.resolve('mc_templates', file), path.join(templateRoot, file));
  const base = pendingCaseFixture();
  const record = {
    ...base,
    case_id: 'house-a-small-modern-house', title: 'A Small Modern House', file,
    source: { ...base.source, url: 'https://mcbuild.org/schematics/16786:a-small-modern-house' }
  };
  await fs.writeFile(knowledgeBasePath, `${JSON.stringify({ source: 'template-knowledge-base-v2', schema_version: 2, cases: [record] }, null, 2)}\n`, 'utf8');
  return { root, templateRoot, outputDir, localArtifactRoot, knowledgeBasePath };
}

function runDatasetCli(args) {
  return spawnSync(process.execPath, ['src/buildCoarseSemanticVoxelDataset.js', ...args], {
    cwd: process.cwd(), encoding: 'utf8'
  });
}

test('Stage 7 dataset writer emits lightweight canonical layout with zero false eligibility', async (t) => {
  const fixture = await createStage7DatasetCorpusFixture(t);
  const result = await writeStage7DatasetArtifacts({
    templateRoot: fixture.templateRoot,
    knowledgeBasePath: fixture.knowledgeBasePath,
    outputDir: fixture.outputDir,
    localArtifactRoot: fixture.localArtifactRoot
  });
  assert.equal(result.manifest.case_count, 1);
  assert.equal(result.manifest.training_eligible_count, 0);
  assert.deepEqual((await fs.readdir(fixture.outputDir)).sort(), ['cases.jsonl', 'manifest.json', 'reports', 'splits.json']);
  assert.ok((await fs.stat(path.join(fixture.localArtifactRoot, 'cases', 'house-a-small-modern-house', 'plan.raw.json'))).isFile());
  const cases = await fs.readFile(path.join(fixture.outputDir, 'cases.jsonl'), 'utf8');
  assert.equal(cases.includes('block_array'), false);
  assert.equal(cases.includes('Blocks'), false);
});

test('Stage 7 dataset CLI fails when the caller requires unavailable eligible cases', async (t) => {
  const fixture = await createStage7DatasetCorpusFixture(t);
  const result = runDatasetCli(['--root', fixture.templateRoot, '--knowledge-base', fixture.knowledgeBasePath, '--out', fixture.outputDir, '--local-artifacts', fixture.localArtifactRoot, '--require-eligible', '1']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires 1 eligible cases, found 0/);
});
```

- [ ] **Step 2: Run writer and CLI tests and verify failure**

Run: `node --test test/stage7DatasetCli.test.js`

Expected: FAIL because the writer and CLI do not exist.

- [ ] **Step 3: Implement atomic lightweight and local artifact writes**

In `writeStage7DatasetArtifacts(...)`:

1. Read and validate the Knowledge Base JSON root and case array.
2. Apply optional exact `caseIds`; unknown requested IDs are errors.
3. For each selected case, resolve `case.file` below `templateRoot`; reject traversal outside that root.
4. Read the immutable volume and build one dataset case.
5. Pass all extracted records to `buildStage7DatasetIndex(...)`; use its returned records with assigned splits before reading `training_case_ids`.
6. Write each local condition/raw/repaired plan under `localArtifactRoot/cases/<case_id>/`, then regenerate the per-case report with `renderStage7DatasetCaseReport(assignedRecord)` so its split is final.
7. Build and validate manifest, records, and splits.
8. Write `manifest.json`, `cases.jsonl`, `splits.json`, and `reports/summary.md` to a sibling temporary directory whose resolved path is inside the output parent.
9. After validation, rename an existing target to a sibling backup, rename the temporary directory to the target, then remove the verified backup. If the second rename fails, restore the backup before rethrowing. Never recursively remove a path until `path.resolve(candidate).startsWith(path.resolve(outputParent) + path.sep)` has passed.

Return:

```js
{
  manifest,
  records,
  splits,
  outputDir: path.resolve(outputDir),
  localArtifactRoot: path.resolve(localArtifactRoot),
  artifacts: {
    manifest: path.resolve(outputDir, 'manifest.json'),
    cases: path.resolve(outputDir, 'cases.jsonl'),
    splits: path.resolve(outputDir, 'splits.json'),
    report: path.resolve(outputDir, 'reports', 'summary.md')
  }
}
```

- [ ] **Step 4: Implement strict offline CLI parsing**

Support these exact options:

```text
--root <path>                 default mc_templates
--knowledge-base <path>       default <root>/analysis/case_library.v2.json
--out <path>                  default <root>/datasets/coarse_semantic_voxels/v1
--local-artifacts <path>      default .tmp/stage7-dataset/v1
--case <case-id>              repeatable exact case filter
--require-eligible <integer>  default 0
--help
```

Reject unknown flags, missing values, negative/non-integer `--require-eligible`, missing files, and duplicate case IDs. Print:

```text
Stage 7 M2 dataset: <absolute manifest path>
Cases: <count>
Training eligible: <count>
Splits: train=<count>, validation=<count>, test=<count>
Local diagnostic artifacts: <absolute path>
```

Exit nonzero after artifact validation if `training_eligible_count < requireEligible`.

- [ ] **Step 5: Add package script and ignore local artifacts**

Add:

```json
"dataset:stage7": "node src/buildCoarseSemanticVoxelDataset.js"
```

Ensure `.gitignore` contains:

```gitignore
.tmp/stage7-dataset/
mc_templates/datasets/coarse_semantic_voxels/*/local/
```

Do not ignore `manifest.json`, `cases.jsonl`, `splits.json`, or `reports/`.

- [ ] **Step 6: Run focused writer and CLI tests**

Run: `node --test test/stage7DatasetCli.test.js test/coarseSemanticVoxelDataset.test.js test/coarseSemanticVoxelDatasetCase.test.js`

Expected: PASS; the temporary fixture yields one ineligible real case and four lightweight canonical output entries.

- [ ] **Step 7: Run CLI help and a one-case repository smoke test**

Run: `npm run dataset:stage7 -- --help`

Expected: exit `0` and list all seven options above.

Run:

```powershell
npm run dataset:stage7 -- --case house-a-small-modern-house --out .tmp/stage7-m2-smoke/index --local-artifacts .tmp/stage7-m2-smoke/local
```

Expected: exit `0`, `Cases: 1`, and `Training eligible: 0` while the repository review remains pending and license remains unknown.

- [ ] **Step 8: Commit writer and CLI**

```bash
git add src/construction/learning/coarseSemanticVoxelDataset.js src/buildCoarseSemanticVoxelDataset.js test/stage7DatasetCli.test.js package.json .gitignore
git commit -m "feat: write stage 7 dataset v1 artifacts"
```

---

### Task 7: Build and Audit the Current 64-Case Corpus Without Inventing Approval

**Files:**
- Create: `mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json`
- Create: `mc_templates/datasets/coarse_semantic_voxels/v1/cases.jsonl`
- Create: `mc_templates/datasets/coarse_semantic_voxels/v1/splits.json`
- Create: `mc_templates/datasets/coarse_semantic_voxels/v1/reports/summary.md`
- Create: `docs/benchmarks/stage7-m2-dataset-v1.md`
- Modify only with human-supplied facts: `mc_templates/curation/template_reviews.jsonl`

**Interfaces:**
- Consumes: the Task 6 CLI and the current 64 Knowledge Base v2 cases.
- Produces: the committed lightweight Dataset v1 index and a benchmark record that distinguishes extraction coverage from training eligibility.

- [ ] **Step 1: Regenerate prerequisite template metadata offline**

Run: `npm run analyze:templates -- --offline`

Expected: exit `0`; Knowledge Base v2 contains 64 cases. Inspect `git diff -- mc_templates/analysis` and retain only deterministic expected changes caused by Task 1 governance fields.

- [ ] **Step 2: Build the complete Dataset v1 index with no minimum eligibility claim**

Run:

```powershell
$env:SOURCE_DATE_EPOCH='1783814400'
npm run dataset:stage7 -- --require-eligible 0
```

Expected: exit `0`, `Cases: 64`; with the current repository facts it must report `Training eligible: 0`. If it reports a positive number before human governance records are added, stop and treat that as a gate defect.

- [ ] **Step 3: Build a second output tree and compare byte hashes**

Run the builder with the same `SOURCE_DATE_EPOCH` but a separate ignored output root, then compare every lightweight artifact:

```powershell
npm run dataset:stage7 -- --require-eligible 0 --out .tmp/stage7-m2-determinism/index --local-artifacts .tmp/stage7-m2-determinism/local
$pairs = @(
  @('mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json', '.tmp/stage7-m2-determinism/index/manifest.json'),
  @('mc_templates/datasets/coarse_semantic_voxels/v1/cases.jsonl', '.tmp/stage7-m2-determinism/index/cases.jsonl'),
  @('mc_templates/datasets/coarse_semantic_voxels/v1/splits.json', '.tmp/stage7-m2-determinism/index/splits.json'),
  @('mc_templates/datasets/coarse_semantic_voxels/v1/reports/summary.md', '.tmp/stage7-m2-determinism/index/reports/summary.md')
)
foreach ($pair in $pairs) {
  $canonical = (Get-FileHash -LiteralPath $pair[0] -Algorithm SHA256).Hash
  $repeat = (Get-FileHash -LiteralPath $pair[1] -Algorithm SHA256).Hash
  if ($canonical -ne $repeat) { throw "Non-deterministic Stage 7 dataset artifact: $($pair[0])" }
  "$($pair[0]) $canonical"
}
```

Expected: exit `0`; all four pairs match. Copy the four printed canonical hashes into `docs/benchmarks/stage7-m2-dataset-v1.md`.

- [ ] **Step 4: Record extraction and governance evidence**

Write `docs/benchmarks/stage7-m2-dataset-v1.md` with exact command output and these sections:

```markdown
# Stage 7 M2 Dataset v1 Evidence

## Inputs
## Reproduction Commands
## Artifact SHA-256
## Extraction Coverage
## Review and License States
## Training Eligibility
## Split and Leakage Validation
## Known Extraction Warnings
## Human Review Checkpoint
```

The Human Review Checkpoint must state that Codex did not infer or invent license permissions. List these six suggested pilot candidates by case ID for later curator review, without changing their status:

- `house-a-small-modern-house`
- `house-lakehouse`
- `house-tavern`
- `house-watermill`
- `house-wood-modern-house`
- `temples-japanese-pagoda-plus-tea-house`

- [ ] **Step 5: Human curator checkpoint before any positive eligibility count**

A human must verify source terms and inspect extracted layer reports before adding records to `mc_templates/curation/template_reviews.jsonl`. Each positive training record must contain a real reviewer, timestamp, review state, canonical front side, approved Stage 7 layers, license status, allowed uses, and license evidence. The agent must not generate those factual decisions.

After human records exist, run:

```powershell
npm run analyze:templates -- --offline
npm run dataset:stage7 -- --require-eligible 1
```

Expected: success only if at least one case independently passes review, license, layer, schema, and semantic gates. A failure is the correct outcome when no case passes all gates.

- [ ] **Step 6: Stage and inspect lightweight evidence only**

First inspect the unstaged scope, then stage only the five lightweight evidence files:

```powershell
git status --short
git diff --stat
git add mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json mc_templates/datasets/coarse_semantic_voxels/v1/cases.jsonl mc_templates/datasets/coarse_semantic_voxels/v1/splits.json mc_templates/datasets/coarse_semantic_voxels/v1/reports/summary.md docs/benchmarks/stage7-m2-dataset-v1.md
git diff --cached --stat
git diff --cached -- mc_templates/datasets/coarse_semantic_voxels/v1/cases.jsonl
```

Expected: the staged JSONL contains hashes, metadata, and paths but no raw block array or dense tensor. Then commit:

```bash
git commit -m "data: record stage 7 dataset v1 index"
```

Do not stage `.tmp/stage7-dataset/`, copied schematics, dense tensors, or a review overlay containing unverified facts.

---

### Task 8: Mark M2 Active, Preserve M1 Runtime Safety, and Complete Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/index.html`
- Modify: `AGENT.md`
- Modify: `test/docsProjectStatus.test.js`
- Modify: `test/stage7Cli.test.js` only if help text adds the offline dataset command; runtime Stage 7 mode/provider options remain unchanged.

**Interfaces:**
- Consumes: Dataset v1 evidence from Task 7.
- Produces: truthful user-facing status: M1 shadow boundary complete, M2 dataset/review governance active or complete according to recorded evidence, M3/M4 not started.

- [ ] **Step 1: Write failing status tests before changing documentation**

Update `test/docsProjectStatus.test.js` to require all four user-facing documents to state:

```js
assert.match(readme, /Stage 7 Milestone 2/);
assert.match(roadmap, /Stage 7 M2|Milestone 2/);
assert.match(home, /Stage 7 M2 Whole-Building Dataset/);
assert.match(agent, /当前阶段：Stage 7 Milestone 2/);
for (const text of [readme, roadmap, home, agent]) {
  assert.match(text, /review|审核/i);
  assert.match(text, /license|许可/i);
  assert.doesNotMatch(text, /Stage 7 complete|Stage 7 已完成/i);
}
```

- [ ] **Step 2: Run the documentation test and verify failure**

Run: `node --test test/docsProjectStatus.test.js`

Expected: FAIL because documents still identify M1 as active.

- [ ] **Step 3: Update status without claiming a learned generator**

Document:

- M1 `off|shadow` and `baseline|artifact` remain unchanged;
- M2 extracts raw schematics into a local canonical `64^3` dataset path;
- `manifest.json`, `cases.jsonl`, `splits.json`, and reports are reviewable lightweight artifacts;
- current eligible count comes from the committed manifest and may be zero;
- pending, rejected, unlicensed, or layer-disallowed cases cannot enter training;
- Python learned provider remains M3 and `apply` remains M4;
- legacy `stage7-template-*` names are unrelated to Architecture Master Stage 7 milestones.

Add the offline command:

```powershell
npm run dataset:stage7 -- --require-eligible 0
```

- [ ] **Step 4: Prove M1 runtime CLI remains unchanged**

Run: `node --test test/stage7Cli.test.js test/stage7Pipeline.test.js`

Expected: PASS; `--coarse-voxel-provider python` and `--coarse-voxel-mode apply` are still rejected as reserved for M3/M4, and Stage 7 defaults to `off`.

- [ ] **Step 5: Run all focused M2 tests**

Run:

```powershell
node --test test/templateReviewOverlay.test.js test/schematicBlockVolume.test.js test/coarseSemanticVoxelDatasetGovernance.test.js test/coarseSemanticVoxelDatasetRasterizer.test.js test/coarseSemanticVoxelDatasetCase.test.js test/coarseSemanticVoxelDataset.test.js test/stage7DatasetCli.test.js test/docsProjectStatus.test.js
```

Expected: PASS with no skipped tests.

- [ ] **Step 6: Run the complete Node.js suite**

Run: `npm test`

Expected: all tests pass; no failures, cancellations, skips, or todos.

- [ ] **Step 7: Verify repository scope and generated-file policy**

Run:

```powershell
git status --short
git diff --check
git ls-files .tmp out
```

Expected: no `.tmp` or `out` files are tracked; `git diff --check` has no output; only M2 code, tests, lightweight dataset index, benchmark, and status documentation are changed.

- [ ] **Step 8: Commit documentation and final verification evidence**

```bash
git add README.md docs/roadmap.md docs/index.html AGENT.md test/docsProjectStatus.test.js
git commit -m "docs: surface stage 7 milestone 2 status"
```

## M2 Acceptance Checklist

- [ ] Every dataset record has a stable case ID, source SHA-256, review state, approved/blocked learning areas, license state, allowed uses, origin, transform, condition hash, plan hash, and deterministic split.
- [ ] Raw schematic extraction is deterministic for a fixed source SHA-256.
- [ ] Canonical output is `64 x 64 x 64`, uses the existing Stage 7 vocabulary and `rle-x-v1`, and passes schema validation.
- [ ] Train/validation/test assignment happens by original case ID before augmentation.
- [ ] Augmented descendants cannot cross their source-case split.
- [ ] Synthetic examples are identified and cannot enter the real validation/test set.
- [ ] Pending, rejected, prohibited, unknown-license, or layer-disallowed cases cannot enter `training_case_ids`.
- [ ] Current corpus reports zero eligible cases until human records explicitly permit training.
- [ ] Large local artifacts and raw source copies remain ignored.
- [ ] Normal `npm start` does not import the dataset builder, NBT corpus, Python, or model code.
- [ ] M1 `off` behavior preserves fixed-seed primary operations.
- [ ] Focused M2 tests and the complete Node.js suite pass.
- [ ] README, roadmap, homepage, and AGENT status agree and do not mark Stage 7 complete.

## Explicit Deferrals to Later Plans

- Python/PyTorch training and inference belong to Stage 7 Milestone 3.
- Checkpoints, hyperparameter manifests, GPU execution, and learned metrics belong to Stage 7 Milestone 3.
- Candidate geometry application, isolated synthesis, automatic baseline fallback, A/B evaluation, blind preference review, and in-world validation belong to Stage 7 Milestone 4.
- The 2000+ eligible-case completion threshold is a Stage 7 completion gate, not a reason to weaken M2 review or license controls.
