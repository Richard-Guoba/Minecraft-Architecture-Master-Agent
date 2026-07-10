# Stage 7 Milestone 1 Coarse Semantic Voxel Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Stage 7 Milestone 1 provider-neutral `64^3` semantic voxel contract, deterministic baseline, bounded repair, procedural-plan converter, artifact provider, and shadow-mode workflow without changing primary Minecraft geometry.

**Architecture:** Add six focused Node.js modules under `src/construction/learning/`. The selected concept and final CreativeDesign output become a canonical condition; a baseline or artifact provider emits an untrusted RLE plan; Node.js validates, repairs, derives sketches, and converts it into candidate semantic inputs. Milestone 1 runs only in `off` or `shadow` mode, so the existing CSG/BSP/A* path remains authoritative and the ordered `blueprint.operations` output is identical for the same prompt and seed.

**Tech Stack:** Node.js 20+ ESM, built-in `node:test`, built-in `node:crypto`, built-in `fs/path`, existing Architect/Planner/Concept/Template Knowledge contracts, no Python, no model checkpoint, no network calls.

## Global Constraints

- The active pipeline remains `construction_method_v1`.
- Minecraft targets remain Java 1.21 and 1.21.1 with datapack `pack_format: 48`.
- Default mock generation remains deterministic and runnable without API keys, Python, model files, or network access.
- Stage 7 mode defaults to `off`.
- Milestone 1 supports `off` and `shadow` only; `apply` and `python` are rejected as reserved for later milestones.
- All Stage 7 provider output is untrusted until schema validation, semantic validation, repair, and procedural conversion succeed.
- No Stage 7 component writes into the Minecraft block grid or mutates the primary `architecture`, `buildSpec`, or `topology` objects.
- Human review metadata controls which template references may enter the Stage 7 condition.
- New source IDs use the `stage7-coarse-semantic-voxel-*` prefix and never reuse `stage7-template-*`.
- Shadow mode must preserve the exact ordered `blueprint.operations` array for a fixed prompt and seed.
- Do not add Python, PyTorch, model checkpoints, raw schematic extraction, dataset directories, apply mode, or Stage 8 terrain reads.
- Do not commit `.env`, `out/`, `.tmp/`, local credentials, generated datapacks, or local failure artifacts.
- Before implementation, run `git fetch origin`, confirm the worktree is clean, and verify the execution branch contains commit `f7f359b` plus the Stage 5/6 commits. Stop rather than starting from `main` if those commits are absent.
- At execution time, create or verify an isolated worktree using `superpowers:using-git-worktrees` before changing code.

---

## File Structure

### New runtime modules

- `src/construction/learning/coarseSemanticVoxelSchema.js`
  - Owns constants, canonical JSON hashing, RLE encode/decode, plan construction, and hard schema validation.
- `src/construction/learning/coarseSemanticVoxelCondition.js`
  - Builds the versioned condition from final semantic pipeline inputs and reviewed references.
- `src/construction/learning/coarseSemanticVoxelBaseline.js`
  - Rasterizes a deterministic, evidence-bearing coarse plan for adapter and fallback evaluation.
- `src/construction/learning/coarseSemanticVoxelRepair.js`
  - Runs semantic checks, applies only the documented bounded repairs, and returns blockers.
- `src/construction/learning/semanticVoxelProceduralPlan.js`
  - Derives massing/space/site sketches and returns normalized candidate architecture/buildSpec/topology values.
- `src/construction/learning/coarseSemanticVoxelShadow.js`
  - Selects baseline or artifact provider, enforces file limits, orchestrates validation/repair/conversion, and renders shadow diagnostics.

### New tests

- `test/coarseSemanticVoxelSchema.test.js`
- `test/coarseSemanticVoxelCondition.test.js`
- `test/coarseSemanticVoxelBaseline.test.js`
- `test/coarseSemanticVoxelRepair.test.js`
- `test/semanticVoxelProceduralPlan.test.js`
- `test/coarseSemanticVoxelShadow.test.js`
- `test/stage7Pipeline.test.js`
- `test/stage7Cli.test.js`

### Existing files modified

- `src/construction/templates/templateExplainableRetriever.js`
- `src/construction/templates/templateEmbeddingIndex.js`
- `src/construction/templates/templateNeuralRetriever.js`
- `test/templateEmbeddingIndex.test.js`
- `test/templateExplainableRetriever.test.js`
- `test/templateNeuralRetriever.test.js`
- `src/construction/workflow.js`
- `src/pipeline.js`
- `src/index.js`
- `README.md`
- `AGENT.md`
- `docs/roadmap.md`
- `docs/index.html`
- `test/docsProjectStatus.test.js`

---

### Task 1: Canonical Condition Hashing, RLE, and Hard Schema Validation

**Files:**
- Create: `src/construction/learning/coarseSemanticVoxelSchema.js`
- Create: `test/coarseSemanticVoxelSchema.test.js`

**Interfaces:**
- Consumes: plain JavaScript condition objects, cell arrays, provider metadata, and evidence records.
- Produces:
  - `STAGE7_CONDITION_SOURCE`
  - `STAGE7_PLAN_SOURCE`
  - `STAGE7_SCHEMA_VERSION`
  - `STAGE7_RESOLUTION`
  - `STAGE7_ENCODING`
  - `ENVELOPE_VALUES`, `SPACE_VALUES`, `SITE_VALUES`
  - `canonicalStringify(value) -> string`
  - `hashCanonicalValue(value) -> sha256 hex string`
  - `encodeStage7Cells(cells) -> canonical RLE run[]`
  - `decodeStage7Runs(runs) -> canonical cell[]`
  - `createStage7Plan({ condition, provider, cells, evidence }) -> plan`
  - `validateStage7Condition(condition) -> { ok, errors }`
  - `validateStage7Plan(plan, { condition?, conditionHash?, maxRuns?, allowDerived? }) -> { ok, errors, warnings, stats }`

- [ ] **Step 1: Write failing schema tests**

Create `test/coarseSemanticVoxelSchema.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE7_PLAN_SOURCE,
  STAGE7_SCHEMA_VERSION,
  canonicalStringify,
  createStage7Plan,
  decodeStage7Runs,
  encodeStage7Cells,
  hashCanonicalValue,
  validateStage7Condition,
  validateStage7Plan
} from '../src/construction/learning/coarseSemanticVoxelSchema.js';

test('canonical Stage 7 hashing ignores object key order but preserves array order', () => {
  const left = { z: 1, nested: { b: 2, a: 1 }, list: ['a', 'b'] };
  const right = { list: ['a', 'b'], nested: { a: 1, b: 2 }, z: 1 };
  const different = { list: ['b', 'a'], nested: { a: 1, b: 2 }, z: 1 };

  assert.equal(canonicalStringify(left), canonicalStringify(right));
  assert.equal(hashCanonicalValue(left), hashCanonicalValue(right));
  assert.notEqual(hashCanonicalValue(left), hashCanonicalValue(different));
});

test('Stage 7 condition validation rejects stale hashes, invalid dimensions, and bad reference lineage', () => {
  const condition = conditionFixture();
  assert.equal(validateStage7Condition(condition).ok, true);

  const invalid = structuredClone(condition);
  invalid.source = 'wrong-condition-source';
  invalid.prompt = 'changed after hashing';
  invalid.dimensions.width = 0;
  invalid.dimensions.floors = 6;
  invalid.dimensions.total_height = 41;
  invalid.references = [{ case_id: '', review_state: 'pending', used_for: [] }];
  const result = validateStage7Condition(invalid);
  assert.equal(result.ok, false);
  for (const message of [
    'unsupported Stage 7 condition source',
    'condition hash mismatch',
    'condition dimension width must be a positive integer',
    'condition floors must be within the Milestone 1 range 1..5',
    'condition total_height cannot exceed max_total_height',
    'reference case id is required',
    'reference review state must be approved or limited'
  ]) assert.ok(result.errors.includes(message), `missing condition error: ${message}`);
});

test('Stage 7 cell encoding merges adjacent X cells and round-trips canonically', () => {
  const cells = [
    cell(2, 1, 4, { envelope: 'wall' }),
    cell(0, 1, 4, { envelope: 'wall' }),
    cell(1, 1, 4, { envelope: 'wall' }),
    cell(3, 1, 4, { envelope: 'opening', space: 'circulation' })
  ];

  const runs = encodeStage7Cells(cells);
  assert.deepEqual(runs.map(({ x0, x1, envelope }) => ({ x0, x1, envelope })), [
    { x0: 0, x1: 2, envelope: 'wall' },
    { x0: 3, x1: 3, envelope: 'opening' }
  ]);
  assert.deepEqual(encodeStage7Cells(decodeStage7Runs(runs)), runs);
});

test('Stage 7 plan validation accepts a canonical evidence-bearing plan', () => {
  const condition = conditionFixture();
  const plan = createStage7Plan({
    condition,
    provider: {
      kind: 'deterministic-baseline',
      name: 'stage7-coarse-semantic-voxel-baseline-v1',
      model_version: null,
      dataset_version: null
    },
    evidence: evidenceFixture(),
    cells: [
      cell(2, 1, 4, { envelope: 'wall' }),
      cell(3, 1, 4, { envelope: 'opening', space: 'circulation' }),
      cell(2, 2, 4, { envelope: 'roof' })
    ]
  });

  const result = validateStage7Plan(plan, { condition });
  assert.equal(plan.source, STAGE7_PLAN_SOURCE);
  assert.equal(plan.schema_version, STAGE7_SCHEMA_VERSION);
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.deepEqual(result.errors, []);
  assert.equal(result.stats.cell_count, 3);
});

test('Stage 7 plan validation rejects hard schema blockers', () => {
  assert.equal(validateStage7Plan(null).ok, false);
  const condition = conditionFixture();
  const base = createStage7Plan({
    condition,
    provider: { kind: 'artifact', name: 'fixture-artifact' },
    evidence: evidenceFixture(),
    cells: [cell(1, 1, 1, { envelope: 'wall' })]
  });
  const invalid = structuredClone(base);
  invalid.source = 'stage7-template-case-library-v1';
  invalid.schema_version = 99;
  invalid.resolution = [32, 32, 32];
  invalid.runs.push({ ...invalid.runs[0], x0: 1, x1: 2 });
  invalid.runs[0].evidence_ids = ['missing:evidence'];
  invalid.runs[1].evidence_ids = [];
  invalid.evidence.push(structuredClone(invalid.evidence[0]));
  invalid.provider = { kind: 'artifact', name: 'fixture-artifact' };
  invalid.orientation.vertical_axis = 'z-up';
  invalid.world_transform.lot_width = 0;

  const result = validateStage7Plan(invalid, { condition, conditionHash: 'different-condition' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('unsupported Stage 7 plan source'));
  assert.ok(result.errors.includes('unsupported Stage 7 schema version'));
  assert.ok(result.errors.includes('resolution must be 64 x 64 x 64'));
  assert.ok(result.errors.includes('condition hash mismatch'));
  assert.ok(result.errors.includes('runs overlap at 1,1,1'));
  assert.ok(result.errors.includes('run evidence id is unresolved: missing:evidence'));
  assert.ok(result.errors.includes('run evidence ids are required'));
  assert.ok(result.errors.includes('duplicate evidence id: condition:fixture'));
  assert.ok(result.errors.includes('provider model and dataset provenance fields are required'));
  assert.ok(result.errors.includes('invalid Stage 7 orientation'));
  assert.ok(result.errors.includes('invalid world transform field: lot_width'));

  const nullRun = validateStage7Plan({ ...base, runs: [null] });
  assert.ok(nullRun.errors.includes('every run must be an object'));

  const expanded = structuredClone(base);
  expanded.runs = Array.from({ length: 4097 }, (_, index) => ({
    ...base.runs[0],
    x0: 0,
    x1: 63,
    y: index % 64,
    z: Math.floor(index / 64) % 64
  }));
  const expandedResult = validateStage7Plan(expanded, { maxRuns: 5000 });
  assert.ok(expandedResult.errors.includes('decoded cell count exceeds logical grid limit: 262144'));
});

test('Stage 7 plan validation rejects noncanonical order and invalid cell fields', () => {
  const condition = conditionFixture();
  const plan = createStage7Plan({
    condition,
    provider: { kind: 'artifact', name: 'fixture-artifact' },
    evidence: evidenceFixture(),
    cells: [
      cell(1, 0, 2, { envelope: 'wall' }),
      cell(1, 0, 1, { envelope: 'wall' })
    ]
  });
  const invalid = structuredClone(plan);
  invalid.runs.reverse();
  invalid.runs[0].x0 = String(invalid.runs[0].x0);
  delete invalid.runs[0].site;
  invalid.runs[0].space = 'bedroom';
  invalid.runs[0].confidence = 2;
  invalid.runs[0].evidence_ids = 'not-an-array';

  const result = validateStage7Plan(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('runs are not in canonical z/y/x order'));
  assert.ok(result.errors.includes('run coordinates must be integers inside 0..63'));
  assert.ok(result.errors.includes('invalid site value: undefined'));
  assert.ok(result.errors.includes('invalid space value: bedroom'));
  assert.ok(result.errors.includes('run confidence must be within 0..1'));
});

function conditionFixture() {
  const payload = {
    source: 'stage7-coarse-semantic-voxel-condition-v1',
    schema_version: 1,
    prompt: 'fixture',
    seed: 7,
    dimensions: { width: 20, depth: 18, floors: 1, floor_height: 5, total_height: 8, lot_width: 26, lot_depth: 28 },
    design: { front_side: 'south' },
    references: [],
    constraints: { resolution: [64, 64, 64], max_total_height: 40, minecraft_fill_limit: 32768 }
  };
  return { ...payload, condition_hash: hashCanonicalValue(payload) };
}

function evidenceFixture() {
  return [{ id: 'condition:fixture', kind: 'condition', source_id: 'fixture' }];
}

function cell(x, y, z, values = {}) {
  return {
    x,
    y,
    z,
    envelope: values.envelope || 'none',
    space: values.space || 'outside',
    site: values.site || 'none',
    confidence: values.confidence ?? 1,
    evidence_ids: values.evidence_ids || ['condition:fixture']
  };
}
```

- [ ] **Step 2: Run the schema test to verify it fails**

Run:

```powershell
node --test test/coarseSemanticVoxelSchema.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `coarseSemanticVoxelSchema.js`.

- [ ] **Step 3: Implement the canonical schema module**

Create `src/construction/learning/coarseSemanticVoxelSchema.js`:

```js
import { createHash } from 'node:crypto';

export const STAGE7_CONDITION_SOURCE = 'stage7-coarse-semantic-voxel-condition-v1';
export const STAGE7_PLAN_SOURCE = 'stage7-coarse-semantic-voxel-plan-v1';
export const STAGE7_SCHEMA_VERSION = 1;
export const STAGE7_RESOLUTION = Object.freeze([64, 64, 64]);
export const STAGE7_ENCODING = 'rle-x-v1';
export const ENVELOPE_VALUES = Object.freeze(['none', 'wall', 'floor', 'roof', 'opening', 'support']);
export const SPACE_VALUES = Object.freeze(['outside', 'public', 'private', 'service', 'circulation', 'vertical_circulation', 'void']);
export const SITE_VALUES = Object.freeze(['none', 'ground', 'path', 'courtyard', 'water', 'vegetation']);
export const MAX_STAGE7_RUNS = 64 * 64 * 64;

const ENVELOPE_SET = new Set(ENVELOPE_VALUES);
const SPACE_SET = new Set(SPACE_VALUES);
const SITE_SET = new Set(SITE_VALUES);
const PLAN_FIELDS = new Set(['source', 'schema_version', 'provider', 'condition_hash', 'resolution', 'encoding', 'orientation', 'world_transform', 'runs', 'evidence', 'summary', 'derived_sketches', 'conflicts', 'repairs', 'warnings']);
const PROVIDER_FIELDS = new Set(['kind', 'name', 'model_version', 'dataset_version', 'checkpoint_version']);
const ORIENTATION_FIELDS = new Set(['front_side', 'vertical_axis']);
const TRANSFORM_FIELDS = new Set(['lot_width', 'lot_depth', 'total_height', 'ground_y']);
const DERIVED_SKETCH_FIELDS = new Set(['massing', 'spaces', 'site']);
const RUN_FIELDS = new Set(['x0', 'x1', 'y', 'z', 'envelope', 'space', 'site', 'confidence', 'evidence_ids']);
const EVIDENCE_FIELDS = new Set(['id', 'kind', 'source_id', 'detail']);

export function canonicalStringify(value) {
  return JSON.stringify(normalizeForHash(value));
}

export function hashCanonicalValue(value) {
  return createHash('sha256').update(canonicalStringify(value)).digest('hex');
}

export function encodeStage7Cells(cells = []) {
  const normalized = cells.map(normalizeCell).sort(compareCells);
  const seen = new Set();
  const runs = [];

  for (const current of normalized) {
    const key = cellKey(current.x, current.y, current.z);
    if (seen.has(key)) throw new Error(`duplicate Stage 7 cell: ${key}`);
    seen.add(key);
    const previous = runs.at(-1);
    if (previous && previous.y === current.y && previous.z === current.z && previous.x1 + 1 === current.x && sameRunTuple(previous, current)) {
      previous.x1 = current.x;
      continue;
    }
    runs.push({
      x0: current.x,
      x1: current.x,
      y: current.y,
      z: current.z,
      envelope: current.envelope,
      space: current.space,
      site: current.site,
      confidence: current.confidence,
      evidence_ids: current.evidence_ids
    });
  }
  return runs;
}

export function decodeStage7Runs(runs = []) {
  const cells = [];
  for (const raw of runs) {
    const run = normalizeRun(raw);
    for (let x = run.x0; x <= run.x1; x += 1) {
      cells.push({
        x,
        y: run.y,
        z: run.z,
        envelope: run.envelope,
        space: run.space,
        site: run.site,
        confidence: run.confidence,
        evidence_ids: [...run.evidence_ids]
      });
    }
  }
  return cells.sort(compareCells);
}

export function createStage7Plan({ condition = {}, provider = {}, cells = [], evidence = [] } = {}) {
  return {
    source: STAGE7_PLAN_SOURCE,
    schema_version: STAGE7_SCHEMA_VERSION,
    provider: {
      kind: String(provider.kind || 'unknown'),
      name: String(provider.name || 'unknown'),
      model_version: provider.model_version ?? null,
      dataset_version: provider.dataset_version ?? null
    },
    condition_hash: String(condition.condition_hash || ''),
    resolution: [...STAGE7_RESOLUTION],
    encoding: STAGE7_ENCODING,
    orientation: {
      front_side: String(condition.design?.front_side || 'south'),
      vertical_axis: 'y-up'
    },
    world_transform: {
      lot_width: finiteNumber(condition.dimensions?.lot_width, 1),
      lot_depth: finiteNumber(condition.dimensions?.lot_depth, 1),
      total_height: finiteNumber(condition.dimensions?.total_height, 1),
      ground_y: 0
    },
    runs: encodeStage7Cells(cells),
    evidence: evidence.map(normalizeEvidence).sort((a, b) => a.id.localeCompare(b.id)),
    summary: {},
    derived_sketches: { massing: [], spaces: [], site: [] },
    conflicts: [],
    repairs: [],
    warnings: []
  };
}

export function validateStage7Condition(condition = {}) {
  condition = condition && typeof condition === 'object' && !Array.isArray(condition) ? condition : {};
  const errors = [];
  const dimensions = condition.dimensions && typeof condition.dimensions === 'object' ? condition.dimensions : {};
  const constraints = condition.constraints && typeof condition.constraints === 'object' ? condition.constraints : {};
  const references = Array.isArray(condition.references) ? condition.references : [];

  if (condition.source !== STAGE7_CONDITION_SOURCE) errors.push('unsupported Stage 7 condition source');
  if (condition.schema_version !== STAGE7_SCHEMA_VERSION) errors.push('unsupported Stage 7 condition schema version');
  if (typeof condition.prompt !== 'string' || !condition.prompt.trim()) errors.push('condition prompt is required');
  if (!Number.isInteger(condition.seed)) errors.push('condition seed must be an integer');
  for (const field of ['width', 'depth', 'floors', 'floor_height', 'total_height', 'lot_width', 'lot_depth']) {
    if (!Number.isInteger(dimensions[field]) || dimensions[field] <= 0) errors.push(`condition dimension ${field} must be a positive integer`);
  }
  if (Number.isInteger(dimensions.floors) && dimensions.floors > 5) errors.push('condition floors must be within the Milestone 1 range 1..5');
  if (Number.isInteger(dimensions.width) && Number.isInteger(dimensions.lot_width) && dimensions.width > dimensions.lot_width) errors.push('condition width cannot exceed lot width');
  if (Number.isInteger(dimensions.depth) && Number.isInteger(dimensions.lot_depth) && dimensions.depth > dimensions.lot_depth) errors.push('condition depth cannot exceed lot depth');
  if (!condition.design || typeof condition.design !== 'object' || Array.isArray(condition.design)) errors.push('condition design must be an object');
  if (!['north', 'south', 'east', 'west'].includes(condition.design?.front_side)) errors.push('condition front side must be north, south, east, or west');
  if (condition.design?.massing_volumes !== undefined && (!Array.isArray(condition.design.massing_volumes) || condition.design.massing_volumes.length > 16 || condition.design.massing_volumes.some((item) => !isPlainObject(item) || typeof item.id !== 'string' || !Array.isArray(item.scale) || item.scale.length !== 3 || item.scale.some((value) => !Number.isFinite(value))))) errors.push('condition massing volumes are invalid');
  if (condition.design?.topology_program !== undefined && (!isPlainObject(condition.design.topology_program) || !Array.isArray(condition.design.topology_program.nodes) || !Array.isArray(condition.design.topology_program.edges) || !isPlainObject(condition.design.topology_program.zoning))) errors.push('condition topology program is invalid');
  if (!Array.isArray(condition.references)) errors.push('condition references must be an array');
  const referenceIds = new Set();
  for (const reference of references) {
    const caseId = typeof reference?.case_id === 'string' ? reference.case_id.trim() : '';
    if (!caseId) errors.push('reference case id is required');
    else if (referenceIds.has(caseId)) errors.push(`duplicate reference case id: ${caseId}`);
    else referenceIds.add(caseId);
    if (!['approved', 'limited'].includes(reference?.review_state)) errors.push('reference review state must be approved or limited');
    if (!Array.isArray(reference?.used_for) || !reference.used_for.length || reference.used_for.some((item) => typeof item !== 'string' || !item)) errors.push(`reference used_for is required: ${caseId || 'unknown'}`);
    if (!Array.isArray(reference?.hints) || reference.hints.some((item) => !isPlainObject(item) || typeof item.area !== 'string' || typeof item.claim !== 'string' || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1)) errors.push(`reference hints are invalid: ${caseId || 'unknown'}`);
    if (reference?.embedding_index_source && (
      !reference.embedding_record_id ||
      !/^sha256:[a-f0-9]{64}$/.test(reference.embedding_index_hash || '') ||
      !/^sha256:[a-f0-9]{64}$/.test(reference.embedding_record_hash || '')
    )) errors.push(`embedding reference lineage is incomplete: ${caseId || 'unknown'}`);
  }
  if (!sameArray(constraints.resolution, STAGE7_RESOLUTION)) errors.push('condition resolution must be 64 x 64 x 64');
  if (!Number.isInteger(constraints.max_total_height) || constraints.max_total_height <= 0) errors.push('condition max_total_height must be a positive integer');
  if (Number.isInteger(dimensions.total_height) && Number.isInteger(constraints.max_total_height) && dimensions.total_height > constraints.max_total_height) errors.push('condition total_height cannot exceed max_total_height');
  if (!Number.isInteger(constraints.minecraft_fill_limit) || constraints.minecraft_fill_limit <= 0) errors.push('condition minecraft_fill_limit must be a positive integer');
  if (typeof condition.condition_hash !== 'string' || !/^[a-f0-9]{64}$/.test(condition.condition_hash)) {
    errors.push('condition hash must be a sha256 hex string');
  } else {
    const payload = structuredClone(condition);
    delete payload.condition_hash;
    if (hashCanonicalValue(payload) !== condition.condition_hash) errors.push('condition hash mismatch');
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function validateStage7Plan(plan = {}, { condition, conditionHash = condition?.condition_hash, maxRuns = MAX_STAGE7_RUNS, allowDerived = false } = {}) {
  plan = plan && typeof plan === 'object' && !Array.isArray(plan) ? plan : {};
  const errors = [];
  const warnings = [];
  const runs = Array.isArray(plan.runs) ? plan.runs : [];
  const evidence = Array.isArray(plan.evidence) ? plan.evidence : [];
  const evidenceIds = new Set();
  const occupied = new Set();
  let cellCount = 0;
  let coordinatesSafeToDecode = true;

  for (const field of unknownFields(plan, PLAN_FIELDS)) errors.push(`unknown Stage 7 plan field: ${field}`);

  if (plan.source !== STAGE7_PLAN_SOURCE) errors.push('unsupported Stage 7 plan source');
  if (Number(plan.schema_version) !== STAGE7_SCHEMA_VERSION) errors.push('unsupported Stage 7 schema version');
  if (!sameArray(plan.resolution, STAGE7_RESOLUTION)) errors.push('resolution must be 64 x 64 x 64');
  if (plan.encoding !== STAGE7_ENCODING) errors.push('unsupported Stage 7 grid encoding');
  if (typeof plan.provider?.kind !== 'string' || !plan.provider.kind || typeof plan.provider?.name !== 'string' || !plan.provider.name) errors.push('provider kind and name are required');
  for (const field of unknownFields(plan.provider, PROVIDER_FIELDS)) errors.push(`unknown provider field: ${field}`);
  if (!Object.hasOwn(plan.provider || {}, 'model_version') || !Object.hasOwn(plan.provider || {}, 'dataset_version')) errors.push('provider model and dataset provenance fields are required');
  for (const field of ['model_version', 'dataset_version', 'checkpoint_version']) {
    if (plan.provider?.[field] !== undefined && plan.provider[field] !== null && typeof plan.provider[field] !== 'string') errors.push(`provider ${field} must be a string or null`);
  }
  if (typeof plan.condition_hash !== 'string' || !/^[a-f0-9]{64}$/.test(plan.condition_hash)) errors.push('condition hash must be a sha256 hex string');
  if (conditionHash && plan.condition_hash !== conditionHash) errors.push('condition hash mismatch');
  if (!Array.isArray(plan.runs)) errors.push('runs must be an array');
  if (!Array.isArray(plan.evidence)) errors.push('evidence must be an array');
  if (!plan.summary || typeof plan.summary !== 'object' || Array.isArray(plan.summary)) errors.push('summary must be an object');
  if (!plan.derived_sketches || !['massing', 'spaces', 'site'].every((field) => Array.isArray(plan.derived_sketches[field]))) errors.push('derived sketches must contain massing, spaces, and site arrays');
  for (const field of unknownFields(plan.derived_sketches, DERIVED_SKETCH_FIELDS)) errors.push(`unknown derived sketch field: ${field}`);
  for (const field of ['conflicts', 'repairs', 'warnings']) {
    if (!Array.isArray(plan[field])) errors.push(`${field} must be an array`);
  }
  if (!allowDerived && (
    Object.keys(isPlainObject(plan.summary) ? plan.summary : {}).length ||
    ['massing', 'spaces', 'site'].some((field) => Array.isArray(plan.derived_sketches?.[field]) && plan.derived_sketches[field].length) ||
    ['conflicts', 'repairs', 'warnings'].some((field) => Array.isArray(plan[field]) && plan[field].length)
  )) errors.push('provider-supplied derived fields must be empty before repair');
  for (const field of unknownFields(plan.orientation, ORIENTATION_FIELDS)) errors.push(`unknown orientation field: ${field}`);
  for (const field of unknownFields(plan.world_transform, TRANSFORM_FIELDS)) errors.push(`unknown world transform field: ${field}`);
  const runsAreObjects = runs.every((item) => item && typeof item === 'object' && !Array.isArray(item));
  if (!runsAreObjects) errors.push('every run must be an object');
  if (!['north', 'south', 'east', 'west'].includes(plan.orientation?.front_side) || plan.orientation?.vertical_axis !== 'y-up') errors.push('invalid Stage 7 orientation');
  for (const field of ['lot_width', 'lot_depth', 'total_height']) {
    if (!Number.isFinite(plan.world_transform?.[field]) || plan.world_transform[field] <= 0) errors.push(`invalid world transform field: ${field}`);
  }
  if (!Number.isFinite(plan.world_transform?.ground_y)) errors.push('invalid world transform field: ground_y');
  if (condition) {
    if (plan.orientation?.front_side !== condition.design?.front_side) errors.push('plan orientation does not match condition');
    for (const [planField, conditionField] of [['lot_width', 'lot_width'], ['lot_depth', 'lot_depth'], ['total_height', 'total_height']]) {
      if (Number(plan.world_transform?.[planField]) !== Number(condition.dimensions?.[conditionField])) errors.push(`plan world transform does not match condition: ${planField}`);
    }
  }
  for (const item of evidence) {
    for (const field of unknownFields(item, EVIDENCE_FIELDS)) errors.push(`unknown evidence field: ${field}`);
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!id || typeof item?.kind !== 'string' || !item.kind || typeof item?.source_id !== 'string' || !item.source_id) errors.push('evidence records require id, kind, and source_id');
    if (item?.detail !== undefined && typeof item.detail !== 'string') errors.push(`evidence detail must be a string: ${id || 'unknown'}`);
    if (id && evidenceIds.has(id)) errors.push(`duplicate evidence id: ${id}`);
    if (id) evidenceIds.add(id);
  }
  if (runs.length > maxRuns) errors.push(`run count exceeds limit: ${maxRuns}`);
  if (runsAreObjects && !isCanonicalRunOrder(runs)) errors.push('runs are not in canonical z/y/x order');

  for (const raw of runs) {
    for (const field of unknownFields(raw, RUN_FIELDS)) errors.push(`unknown run field: ${field}`);
    const run = normalizeRun(raw);
    const coordinatesValid = [raw?.x0, raw?.x1, raw?.y, raw?.z].every(Number.isInteger) && raw.x0 >= 0 && raw.x1 <= 63 && raw.y >= 0 && raw.y <= 63 && raw.z >= 0 && raw.z <= 63 && raw.x0 <= raw.x1;
    if (!coordinatesValid) {
      errors.push('run coordinates must be integers inside 0..63');
      coordinatesSafeToDecode = false;
    }
    if (typeof raw?.envelope !== 'string' || !ENVELOPE_SET.has(raw.envelope)) errors.push(`invalid envelope value: ${String(raw?.envelope)}`);
    if (typeof raw?.space !== 'string' || !SPACE_SET.has(raw.space)) errors.push(`invalid space value: ${String(raw?.space)}`);
    if (typeof raw?.site !== 'string' || !SITE_SET.has(raw.site)) errors.push(`invalid site value: ${String(raw?.site)}`);
    if (typeof raw?.confidence !== 'number' || !Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1) errors.push('run confidence must be within 0..1');
    if (!Array.isArray(raw?.evidence_ids) || !raw.evidence_ids.length || raw.evidence_ids.some((id) => typeof id !== 'string' || !id)) errors.push('run evidence ids are required');
    for (const id of run.evidence_ids) {
      if (!evidenceIds.has(id)) errors.push(`run evidence id is unresolved: ${id}`);
    }
    if (coordinatesValid) {
      const expandedLength = run.x1 - run.x0 + 1;
      if (cellCount + expandedLength > MAX_STAGE7_RUNS) {
        errors.push(`decoded cell count exceeds logical grid limit: ${MAX_STAGE7_RUNS}`);
        coordinatesSafeToDecode = false;
        continue;
      }
      for (let x = run.x0; x <= run.x1 && x <= 63; x += 1) {
        const key = cellKey(x, run.y, run.z);
        if (occupied.has(key)) errors.push(`runs overlap at ${key}`);
        occupied.add(key);
        cellCount += 1;
      }
    }
  }

  if (coordinatesSafeToDecode && errors.length === 0 && runs.length) {
    try {
      const canonicalRuns = encodeStage7Cells(decodeStage7Runs(runs));
      if (canonicalStringify(canonicalRuns) !== canonicalStringify(runs)) warnings.push('runs require canonical re-encoding');
    } catch (error) {
      errors.push(`runs cannot be canonicalized: ${error.message}`);
    }
  }

  if (!runs.length) warnings.push('plan contains no semantic runs');
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    warnings,
    stats: {
      run_count: runs.length,
      cell_count: cellCount,
      evidence_count: evidenceIds.size
    }
  };
}

function normalizeForHash(value) {
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeForHash(item)])
    );
  }
  return value;
}

function normalizeCell(cell = {}) {
  const raw = cell && typeof cell === 'object' && !Array.isArray(cell) ? cell : {};
  return {
    x: Number(raw.x),
    y: Number(raw.y),
    z: Number(raw.z),
    envelope: String(raw.envelope || 'none'),
    space: String(raw.space || 'outside'),
    site: String(raw.site || 'none'),
    confidence: Number(raw.confidence ?? 1),
    evidence_ids: [...new Set((Array.isArray(raw.evidence_ids) ? raw.evidence_ids : []).map(String).filter(Boolean))].sort()
  };
}

function normalizeRun(run = {}) {
  const raw = run && typeof run === 'object' && !Array.isArray(run) ? run : {};
  return {
    x0: Number(raw.x0),
    x1: Number(raw.x1),
    y: Number(raw.y),
    z: Number(raw.z),
    envelope: String(raw.envelope || 'none'),
    space: String(raw.space || 'outside'),
    site: String(raw.site || 'none'),
    confidence: Number(raw.confidence),
    evidence_ids: [...new Set((Array.isArray(raw.evidence_ids) ? raw.evidence_ids : []).map(String).filter(Boolean))].sort()
  };
}

function normalizeEvidence(item = {}) {
  const raw = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
  return {
    id: String(raw.id || ''),
    kind: String(raw.kind || 'unknown'),
    source_id: String(raw.source_id || ''),
    detail: raw.detail === undefined ? undefined : String(raw.detail)
  };
}

function compareCells(left, right) {
  return left.z - right.z || left.y - right.y || left.x - right.x;
}

function compareRuns(left, right) {
  return Number(left.z) - Number(right.z) || Number(left.y) - Number(right.y) || Number(left.x0) - Number(right.x0) || Number(left.x1) - Number(right.x1);
}

function isCanonicalRunOrder(runs) {
  return runs.every((run, index) => index === 0 || compareRuns(runs[index - 1], run) <= 0);
}

function sameRunTuple(run, cell) {
  return run.envelope === cell.envelope &&
    run.space === cell.space &&
    run.site === cell.site &&
    run.confidence === cell.confidence &&
    sameArray(run.evidence_ids, cell.evidence_ids);
}

function sameArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function cellKey(x, y, z) {
  return `${x},${y},${z}`;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unknownFields(value, allowed) {
  return isPlainObject(value) ? Object.keys(value).filter((field) => !allowed.has(field)).sort() : [];
}
```

- [ ] **Step 4: Run the schema test and verify it passes**

Run:

```powershell
node --test test/coarseSemanticVoxelSchema.test.js
```

Expected: PASS, 6 tests, 0 failures.

- [ ] **Step 5: Commit the schema boundary**

```powershell
git add src/construction/learning/coarseSemanticVoxelSchema.js test/coarseSemanticVoxelSchema.test.js
git commit -m "feat: define stage 7 coarse voxel schema"
```

---

### Task 2: Reviewed Reference Provenance and Canonical Stage 7 Conditions

**Files:**
- Create: `src/construction/learning/coarseSemanticVoxelCondition.js`
- Create: `test/coarseSemanticVoxelCondition.test.js`
- Modify: `src/construction/templates/templateEmbeddingIndex.js`
- Modify: `src/construction/templates/templateExplainableRetriever.js:98-121`
- Modify: `src/construction/templates/templateNeuralRetriever.js:83-103`
- Modify: `test/templateEmbeddingIndex.test.js`
- Modify: `test/templateExplainableRetriever.test.js:50-63`
- Modify: `test/templateNeuralRetriever.test.js:6-32`

**Interfaces:**
- Consumes: final post-CreativeDesign `architecture`, `buildSpec`, `topology`, `creativeDesign`, full `conceptStudio`, `templateKnowledge`, prompt, and seed.
- Produces:
  - Explainable and neural reference rows with `review_state`, `review_confidence`, `approved_learning_areas`, and `blocked_learning_areas`.
  - `buildStage7Condition(input) -> canonical condition with condition_hash`.
- Depends on: `STAGE7_CONDITION_SOURCE`, `STAGE7_SCHEMA_VERSION`, `STAGE7_RESOLUTION`, and `hashCanonicalValue` from Task 1.

- [ ] **Step 1: Write failing condition and provenance tests**

Create `test/coarseSemanticVoxelCondition.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStage7Condition } from '../src/construction/learning/coarseSemanticVoxelCondition.js';

test('Stage 7 condition captures final design semantics and only reviewed references', () => {
  const condition = buildStage7Condition(conditionInput());

  assert.equal(condition.source, 'stage7-coarse-semantic-voxel-condition-v1');
  assert.equal(condition.schema_version, 1);
  assert.equal(condition.seed, 7101);
  assert.deepEqual(condition.constraints.resolution, [64, 64, 64]);
  assert.equal(condition.design.selected_concept_id, 'concept-b-view-courtyard');
  assert.ok(condition.design.massing_strategy.includes('courtyard'));
  assert.ok(condition.design.abstract_site_tags.includes('water-edge'));
  assert.ok(condition.design.abstract_site_tags.includes('courtyard'));
  assert.equal(condition.design.massing_volumes.length, 2);
  assert.deepEqual(condition.design.topology_program.nodes.map((item) => item.id), ['entry', 'living']);
  assert.deepEqual(condition.references.map((item) => item.case_id), ['approved-house', 'limited-site-house']);
  assert.deepEqual(condition.references[1].used_for, ['site']);
  assert.ok(condition.references[0].hints.some((item) => item.area === 'massing' && /massing lesson/.test(item.claim)));
  assert.equal(condition.references.some((item) => item.case_id === 'pending-house'), false);
  assert.equal(condition.condition_hash.length, 64);
  assert.equal(Object.hasOwn(condition, 'world_coordinates'), false);
});

test('Stage 7 condition hash changes with seed, selected concept, or reviewed references', () => {
  const base = conditionInput();
  const first = buildStage7Condition(base);
  const second = buildStage7Condition({ ...base, seed: 7102 });
  const third = buildStage7Condition({
    ...base,
    conceptStudio: { ...base.conceptStudio, selected_concept_id: 'concept-a-axis' }
  });
  const fourth = buildStage7Condition({
    ...base,
    templateKnowledge: {
      retrieval_explanation: {
        source: 'template-explainable-retriever-v1',
        references: base.templateKnowledge.retrieval_explanation.references.slice(0, 1)
      }
    }
  });
  const fifth = buildStage7Condition({ ...base, prompt: `${base.prompt}，增加观景塔` });
  const sixth = buildStage7Condition({ ...base, buildSpec: { ...base.buildSpec, width: base.buildSpec.width - 2 } });
  const seventhInput = structuredClone(base);
  seventhInput.templateKnowledge.retrieval_explanation.embedding_index_hash = `sha256:${'d'.repeat(64)}`;
  const seventh = buildStage7Condition(seventhInput);
  const eighth = buildStage7Condition({
    ...base,
    architecture: {
      ...base.architecture,
      volumes: [...base.architecture.volumes, { id: 'tower', role: 'view tower', shape: 'box', scale: [0.25, 1.4, 0.25], placement: { relation: 'attached-east', attach_to: 'main' }, boolean_mode: 'union', tags: ['vertical-accent'] }]
    }
  });
  const ninth = buildStage7Condition({
    ...base,
    topology: {
      ...base.topology,
      nodes: base.topology.nodes.map((item) => item.id === 'living' ? { ...item, weight: 2.4, zone: 'public' } : item)
    }
  });

  assert.notEqual(first.condition_hash, second.condition_hash);
  assert.notEqual(first.condition_hash, third.condition_hash);
  assert.notEqual(first.condition_hash, fourth.condition_hash);
  assert.notEqual(first.condition_hash, fifth.condition_hash);
  assert.notEqual(first.condition_hash, sixth.condition_hash);
  assert.notEqual(first.condition_hash, seventh.condition_hash);
  assert.notEqual(first.condition_hash, eighth.condition_hash);
  assert.notEqual(first.condition_hash, ninth.condition_hash);
});

test('limited references without an approved matching learning area are excluded', () => {
  const input = conditionInput();
  input.templateKnowledge.retrieval_explanation.references = [{
    case_id: 'limited-interior-only',
    title: 'Limited Interior Only',
    review_state: 'limited',
    approved_learning_areas: ['site'],
    blocked_learning_areas: ['interior'],
    teaches: [{ area: 'interior', claim: 'blocked', confidence: 0.9 }],
    risk_controls: ['do not use interior']
  }];

  const condition = buildStage7Condition(input);
  assert.deepEqual(condition.references, []);
});

function conditionInput() {
  const selectedConcept = {
    id: 'concept-b-view-courtyard',
    massing_plan: { variant_hint: 'courtyard', key_moves: ['view-axis', 'stepped-terrace'] },
    space_graph_strategy: { public_core: 'living', split_strategy: 'view-facing' },
    site_strategy: { mood: 'waterfront-garden', water_feature: true },
    quality_targets: ['clear-entry', 'view-axis']
  };
  return {
    prompt: '在湖边建一座带水景庭院的两层日式住宅',
    seed: 7101,
    architecture: {
      style: '日式',
      style_family: 'japanese',
      typology: 'house',
      footprint: 'courtyard',
      facade_rules: { front_side: 'south' },
      site_rules: { water_feature: true, enclosed_courtyard: true, landscape_mood: 'waterfront-garden' },
      massing_rules: { creative_variant: 'courtyard' },
      volumes: [
        { id: 'main', role: 'main house', shape: 'box', scale: [1, 1, 1], placement: { relation: 'center' }, boolean_mode: 'union', tags: ['primary-mass'] },
        { id: 'garden-wing', role: 'garden wing', shape: 'box', scale: [0.45, 0.75, 0.55], placement: { relation: 'attached-west', attach_to: 'main' }, boolean_mode: 'union', tags: ['secondary-mass'] }
      ]
    },
    buildSpec: {
      width: 31,
      depth: 27,
      floors: 2,
      floor_height: 5,
      total_height: 14,
      door_side: 'south',
      lot: { width: 37, depth: 40 },
      constraints: { max_total_height: 40, minecraft_fill_limit: 32768 }
    },
    topology: {
      nodes: [{ id: 'entry', type: 'entry', floor: 0, weight: 0.8, zone: 'public' }, { id: 'living', type: 'living', floor: 0, weight: 1.4, zone: 'public' }],
      edges: [{ from: 'entry', to: 'living', relation: 'connected' }],
      zoning: { public: ['entry', 'living'], private: [], service: [], circulation: [], outdoor: [] },
      bsp_hints: { split_strategy: 'view-facing' }
    },
    creativeDesign: {
      signature: 'courtyard/view-axis/deep-eaves',
      design_axes: { massing_variant: 'courtyard', split_strategy: 'view-facing', composition_bias: 'view-facing' },
      topology: { split_strategy: 'view-facing', public_core_position: 'view-facing' },
      site: { mood: 'waterfront-garden', water_feature: true }
    },
    conceptStudio: {
      active: true,
      selected_concept_id: selectedConcept.id,
      selectedConcept,
      concepts: [selectedConcept, { id: 'concept-a-axis' }]
    },
    templateKnowledge: {
      retrieval_explanation: {
        source: 'stage5-neural-template-retriever-v1',
        embedding_index_hash: `sha256:${'a'.repeat(64)}`,
        references: [
          reference('approved-house', 'approved', ['massing', 'site'], []),
          reference('limited-site-house', 'limited', ['site'], ['interior']),
          reference('pending-house', 'pending', [], [])
        ]
      }
    }
  };
}

function reference(caseId, reviewState, approved, blocked) {
  return {
    case_id: caseId,
    title: caseId,
    rank: caseId === 'approved-house' ? 1 : 2,
    match_score: 80,
    embedding_score: 75,
    embedding_record_hash: `sha256:${(caseId === 'approved-house' ? 'b' : 'c').repeat(64)}`,
    review_state: reviewState,
    review_confidence: reviewState === 'pending' ? 0 : 0.9,
    approved_learning_areas: approved,
    blocked_learning_areas: blocked,
    teaches: [
      { area: 'massing', claim: 'massing lesson', confidence: 0.9 },
      { area: 'site', claim: 'site lesson', confidence: 0.85 },
      { area: 'interior', claim: 'interior lesson', confidence: 0.8 }
    ],
    risk_controls: ['change exact dimensions and details']
  };
}
```

In `test/templateExplainableRetriever.test.js`, extend the existing limited-review test after the `integration_targets` assertion:

```js
  assert.equal(limited.review_state, 'limited');
  assert.equal(limited.review_confidence, 0.6);
  assert.deepEqual(limited.approved_learning_areas, ['site']);
  assert.deepEqual(limited.blocked_learning_areas, ['interior']);
```

In `test/templateNeuralRetriever.test.js`, extend the first test after the `risk_controls` assertion:

```js
  assert.equal(result.references[0].review_state, 'approved');
  assert.equal(result.references[0].review_confidence, 0.9);
  assert.deepEqual(result.references[0].approved_learning_areas, []);
  assert.deepEqual(result.references[0].blocked_learning_areas, []);
  assert.match(result.embedding_index_hash, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.references[0].embedding_record_hash, /^sha256:[a-f0-9]{64}$/);
```

In `test/templateEmbeddingIndex.test.js`, extend `query tie-breaking is deterministic with equal scores` by repeating its query:

```js
  const repeated = queryEmbeddingIndex({ index, prompt: 'unmatched-token', limit: 2 });
  assert.match(matches[0].embedding_record_hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(matches[0].embedding_record_hash, repeated[0].embedding_record_hash);
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```powershell
node --test test/coarseSemanticVoxelCondition.test.js test/templateEmbeddingIndex.test.js test/templateExplainableRetriever.test.js test/templateNeuralRetriever.test.js
```

Expected: FAIL because `coarseSemanticVoxelCondition.js` is missing and reference rows do not expose review provenance.

- [ ] **Step 3: Add review and embedding-lineage provenance to retrieval output**

In `src/construction/templates/templateEmbeddingIndex.js`, export stable hashes and include each record hash in query output:

```js
export function hashEmbeddingIndex(index = {}) {
  return `sha256:${hashJson(index)}`;
}

export function hashEmbeddingRecord(record = {}) {
  return `sha256:${hashJson(record)}`;
}
```

Inside the object returned for each row by `queryEmbeddingIndex`, add:

```js
      embedding_record_hash: hashEmbeddingRecord(item),
```

In `src/construction/templates/templateExplainableRetriever.js`, add these fields immediately after `file: item.file` inside `explainReference`:

```js
    review_state: String(item.review?.status || 'pending'),
    review_confidence: Number(item.review?.confidence || 0),
    approved_learning_areas: normalizeStringArray(item.review?.approved_learning_areas),
    blocked_learning_areas: normalizeStringArray(item.review?.blocked_learning_areas),
```

Add this helper near the other normalization helpers in the same file:

```js
function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}
```

In `src/construction/templates/templateNeuralRetriever.js`, import `hashEmbeddingIndex` beside the existing embedding helpers, add `embedding_index_hash: hashEmbeddingIndex(this.embeddingIndex)` to the successful top-level result, and add this field to the fused reference returned around `embedding_score`:

```js
          embedding_record_hash: embedding?.embedding_record_hash,
```

Then add these fields immediately after `file: caseRecord.file` inside `explainFromCase`:

```js
    review_state: String(caseRecord.review?.status || 'pending'),
    review_confidence: Number(caseRecord.review?.confidence || 0),
    approved_learning_areas: normalizeStringArray(caseRecord.review?.approved_learning_areas),
    blocked_learning_areas: normalizeStringArray(caseRecord.review?.blocked_learning_areas),
```

Add this helper near the bottom of the same file:

```js
function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}
```

- [ ] **Step 4: Implement canonical condition construction**

Create `src/construction/learning/coarseSemanticVoxelCondition.js`:

```js
import { EMBEDDING_INDEX_SOURCE } from '../templates/templateEmbeddingIndex.js';
import {
  STAGE7_CONDITION_SOURCE,
  STAGE7_RESOLUTION,
  STAGE7_SCHEMA_VERSION,
  hashCanonicalValue,
  validateStage7Condition
} from './coarseSemanticVoxelSchema.js';

const REVIEWED_STATES = new Set(['approved', 'limited']);

export function buildStage7Condition({
  prompt = '',
  seed,
  architecture = {},
  buildSpec = {},
  topology = {},
  creativeDesign = {},
  conceptStudio = {},
  templateKnowledge = {}
} = {}) {
  const selectedConceptId = String(
    conceptStudio.selected_concept_id ||
    creativeDesign.concept_studio?.selected_concept_id ||
    ''
  );
  const selectedConcept = conceptStudio.selectedConcept ||
    (conceptStudio.concepts || []).find((item) => item.id === selectedConceptId) ||
    {};
  const payload = {
    source: STAGE7_CONDITION_SOURCE,
    schema_version: STAGE7_SCHEMA_VERSION,
    prompt: String(prompt || '').trim(),
    seed: integer(seed, 0),
    dimensions: {
      width: integer(buildSpec.width, 1),
      depth: integer(buildSpec.depth, 1),
      floors: integer(buildSpec.floors, 1),
      floor_height: integer(buildSpec.floor_height, 1),
      total_height: integer(buildSpec.total_height, 1),
      lot_width: integer(buildSpec.lot?.width, buildSpec.width || 1),
      lot_depth: integer(buildSpec.lot?.depth, buildSpec.depth || 1)
    },
    design: {
      style_family: String(architecture.style_family || architecture.style || 'general'),
      typology: String(architecture.typology || buildSpec.typology || 'house'),
      footprint: String(architecture.footprint || buildSpec.footprint || 'rectangle'),
      front_side: String(buildSpec.door_side || architecture.facade_rules?.front_side || 'south'),
      abstract_site_tags: abstractSiteTags({ prompt, architecture, creativeDesign, selectedConcept }),
      selected_concept_id: selectedConceptId,
      massing_strategy: massingStrategy({ architecture, creativeDesign, selectedConcept }),
      space_strategy: spaceStrategy({ topology, creativeDesign, selectedConcept }),
      quality_targets: stringArray(selectedConcept.quality_targets),
      massing_volumes: normalizeMassingVolumes(architecture.volumes),
      topology_program: normalizeTopologyProgram(topology)
    },
    references: reviewedReferences(templateKnowledge.retrieval_explanation || {}),
    constraints: {
      resolution: [...STAGE7_RESOLUTION],
      max_total_height: integer(buildSpec.constraints?.max_total_height, 40),
      minecraft_fill_limit: integer(buildSpec.constraints?.minecraft_fill_limit, 32768)
    }
  };
  const condition = { ...payload, condition_hash: hashCanonicalValue(payload) };
  const validation = validateStage7Condition(condition);
  if (!validation.ok) throw new Error(`invalid Stage 7 condition: ${validation.errors.join('; ')}`);
  return condition;
}

function reviewedReferences(explanation = {}) {
  const neural = explanation.source === 'stage5-neural-template-retriever-v1';
  return (explanation.references || [])
    .map((reference) => normalizeReference(reference, neural, explanation.embedding_index_hash))
    .filter(Boolean)
    .sort((left, right) => left.rank - right.rank || left.case_id.localeCompare(right.case_id))
    .slice(0, 8);
}

function normalizeReference(reference = {}, neural = false, embeddingIndexHash) {
  const reviewState = String(reference.review_state || 'pending');
  if (!REVIEWED_STATES.has(reviewState)) return undefined;
  const approved = stringArray(reference.approved_learning_areas);
  const blocked = new Set(stringArray(reference.blocked_learning_areas));
  const teaches = Array.isArray(reference.teaches) ? reference.teaches : [];
  const usedFor = [...new Set(teaches
    .map((item) => String(item?.area || '').trim())
    .filter(Boolean)
    .filter((area) => !blocked.has(area))
    .filter((area) => reviewState === 'approved' || approved.includes(area))
  )].sort();
  if (!usedFor.length) return undefined;
  const hints = teaches
    .filter((item) => usedFor.includes(String(item?.area || '').trim()))
    .map((item) => ({
      area: String(item.area),
      claim: String(item.claim || ''),
      confidence: Math.max(0, Math.min(1, finite(item.confidence, 0)))
    }))
    .filter((item) => item.claim)
    .sort((left, right) => left.area.localeCompare(right.area) || left.claim.localeCompare(right.claim));
  return {
    case_id: String(reference.case_id || ''),
    title: String(reference.title || reference.case_id || ''),
    rank: integer(reference.rank, 999),
    match_score: integer(reference.match_score, 0),
    review_state: reviewState,
    review_confidence: finite(reference.review_confidence, 0),
    approved_learning_areas: approved,
    blocked_learning_areas: [...blocked].sort(),
    used_for: usedFor,
    hints,
    risk_controls: stringArray(reference.risk_controls),
    embedding_index_source: neural && Number(reference.embedding_score) > 0 ? EMBEDDING_INDEX_SOURCE : undefined,
    embedding_index_hash: neural && Number(reference.embedding_score) > 0 ? String(embeddingIndexHash || '') : undefined,
    embedding_record_id: neural && Number(reference.embedding_score) > 0 ? String(reference.case_id || '') : undefined,
    embedding_record_hash: neural && Number(reference.embedding_score) > 0 ? String(reference.embedding_record_hash || '') : undefined
  };
}

function abstractSiteTags({ prompt = '', architecture = {}, creativeDesign = {}, selectedConcept = {} } = {}) {
  const tags = [];
  const site = {
    ...(architecture.site_rules || {}),
    ...(creativeDesign.site || {}),
    ...(selectedConcept.site_strategy || {})
  };
  const footprint = String(architecture.footprint || '');
  if (site.water_feature || /湖|水边|滨水|water|lake/i.test(prompt)) tags.push('water-edge');
  if (site.enclosed_courtyard || footprint === 'courtyard' || /庭院|courtyard/i.test(prompt)) tags.push('courtyard');
  if (site.dry_garden) tags.push('dry-garden');
  if (site.patio) tags.push('patio');
  if (site.planting_beds || /花园|garden|forest|森林/i.test(prompt)) tags.push('vegetation');
  if (/坡|山地|山坡|slope|hillside/i.test(prompt)) tags.push('slope-intent');
  const mood = token(site.mood || site.landscape_mood);
  if (mood && mood !== 'simple') tags.push(`mood:${mood}`);
  return [...new Set(tags)].sort();
}

function massingStrategy({ architecture = {}, creativeDesign = {}, selectedConcept = {} } = {}) {
  return uniqueStrings([
    architecture.massing_rules?.creative_variant,
    creativeDesign.design_axes?.massing_variant,
    selectedConcept.massing_plan?.variant_hint,
    ...stringArray(selectedConcept.massing_plan?.key_moves)
  ]);
}

function spaceStrategy({ topology = {}, creativeDesign = {}, selectedConcept = {} } = {}) {
  return uniqueStrings([
    topology.bsp_hints?.split_strategy,
    creativeDesign.design_axes?.split_strategy,
    creativeDesign.topology?.public_core_position,
    selectedConcept.space_graph_strategy?.public_core,
    selectedConcept.space_graph_strategy?.split_strategy
  ]);
}

function normalizeMassingVolumes(volumes) {
  return (Array.isArray(volumes) ? volumes : []).slice(0, 16).map((item, index) => ({
    id: String(item?.id || `volume-${index + 1}`),
    role: String(item?.role || ''),
    shape: String(item?.shape || 'box'),
    scale: (Array.isArray(item?.scale) ? item.scale : [1, 1, 1]).slice(0, 3).map((value) => finite(value, 1)),
    placement: {
      relation: String(item?.placement?.relation || 'center'),
      attach_to: item?.placement?.attach_to ? String(item.placement.attach_to) : undefined
    },
    boolean_mode: String(item?.boolean_mode || 'union'),
    tags: stringArray(item?.tags).sort()
  })).sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeTopologyProgram(topology) {
  return {
    nodes: (topology.nodes || []).map((item) => ({
      id: String(item?.id || ''),
      type: String(item?.type || 'room'),
      floor: integer(item?.floor, 0),
      weight: finite(item?.weight, 1),
      privacy: String(item?.privacy || ''),
      zone: String(item?.zone || item?.privacy || 'public')
    })).filter((item) => item.id).sort((left, right) => left.id.localeCompare(right.id)),
    edges: (topology.edges || []).map((item) => ({ from: String(item?.from || ''), to: String(item?.to || ''), relation: String(item?.relation || 'connected') }))
      .filter((item) => item.from && item.to)
      .sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to) || left.relation.localeCompare(right.relation)),
    zoning: Object.fromEntries(Object.entries(topology.zoning || {}).sort(([left], [right]) => left.localeCompare(right)).map(([key, ids]) => [key, stringArray(ids).sort()]))
  };
}

function uniqueStrings(values) {
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value]).map((value) => String(value || '').trim()).filter(Boolean))];
}

function stringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function token(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-').replace(/^-|-$/g, '');
}

function integer(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : Math.trunc(fallback);
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
```

- [ ] **Step 5: Run focused condition and retrieval tests**

Run:

```powershell
node --test test/coarseSemanticVoxelCondition.test.js test/templateEmbeddingIndex.test.js test/templateExplainableRetriever.test.js test/templateNeuralRetriever.test.js
```

Expected: PASS, including the new provenance and condition-hash cases.

- [ ] **Step 6: Commit the condition boundary**

```powershell
git add src/construction/learning/coarseSemanticVoxelCondition.js src/construction/templates/templateEmbeddingIndex.js src/construction/templates/templateExplainableRetriever.js src/construction/templates/templateNeuralRetriever.js test/coarseSemanticVoxelCondition.test.js test/templateEmbeddingIndex.test.js test/templateExplainableRetriever.test.js test/templateNeuralRetriever.test.js
git commit -m "feat: build reviewed stage 7 conditions"
```

---

### Task 3: Deterministic Coarse Semantic Voxel Baseline Provider

**Files:**
- Create: `src/construction/learning/coarseSemanticVoxelBaseline.js`
- Create: `test/coarseSemanticVoxelBaseline.test.js`

**Interfaces:**
- Consumes: canonical condition from `buildStage7Condition`.
- Produces:
  - `STAGE7_BASELINE_SOURCE`
  - `generateDeterministicCoarseSemanticVoxelPlan({ condition, seed, options }) -> canonical untrusted plan`
  - `deterministicCoarseSemanticVoxelProvider.generate({ condition, seed, options }) -> Promise<untrusted plan>`
- Depends on: `createStage7Plan`, `decodeStage7Runs`, and canonical schema constants from Task 1.

- [ ] **Step 1: Write failing deterministic baseline tests**

Create `test/coarseSemanticVoxelBaseline.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStage7Condition } from '../src/construction/learning/coarseSemanticVoxelCondition.js';
import { generateDeterministicCoarseSemanticVoxelPlan } from '../src/construction/learning/coarseSemanticVoxelBaseline.js';
import { decodeStage7Runs, hashCanonicalValue, validateStage7Plan } from '../src/construction/learning/coarseSemanticVoxelSchema.js';

test('deterministic Stage 7 baseline emits a valid reproducible whole-building plan', () => {
  const condition = fixtureCondition();
  const first = generateDeterministicCoarseSemanticVoxelPlan({ condition });
  const second = generateDeterministicCoarseSemanticVoxelPlan({ condition });
  const validation = validateStage7Plan(first, { conditionHash: condition.condition_hash });

  assert.deepEqual(first, second);
  assert.equal(first.provider.kind, 'deterministic-baseline');
  assert.equal(first.provider.name, 'stage7-coarse-semantic-voxel-baseline-v1');
  assert.equal(validation.ok, true, validation.errors.join('; '));
  assert.ok(validation.stats.cell_count > 1000);
});

test('deterministic Stage 7 baseline covers envelope, space, site, entrance, and vertical circulation semantics', () => {
  const plan = generateDeterministicCoarseSemanticVoxelPlan({ condition: fixtureCondition() });
  const cells = decodeStage7Runs(plan.runs);

  for (const role of ['wall', 'floor', 'roof', 'opening']) {
    assert.ok(cells.some((cell) => cell.envelope === role), `missing envelope role ${role}`);
  }
  for (const role of ['public', 'private', 'service', 'circulation', 'vertical_circulation']) {
    assert.ok(cells.some((cell) => cell.space === role), `missing space role ${role}`);
  }
  for (const role of ['ground', 'path', 'courtyard', 'water', 'vegetation']) {
    assert.ok(cells.some((cell) => cell.site === role), `missing site role ${role}`);
  }
  assert.ok(plan.evidence.some((item) => item.kind === 'condition'));
  assert.ok(plan.evidence.some((item) => item.kind === 'reference'));
});

test('deterministic Stage 7 baseline changes seed-controlled zoning without changing schema', () => {
  const firstCondition = fixtureCondition(7101);
  const secondCondition = fixtureCondition(7102);
  const first = generateDeterministicCoarseSemanticVoxelPlan({ condition: firstCondition });
  const second = generateDeterministicCoarseSemanticVoxelPlan({ condition: secondCondition });

  assert.notDeepEqual(first.runs, second.runs);
  assert.equal(validateStage7Plan(first, { conditionHash: firstCondition.condition_hash }).ok, true);
  assert.equal(validateStage7Plan(second, { conditionHash: secondCondition.condition_hash }).ok, true);
});

test('deterministic Stage 7 baseline preserves requested floor layers for one through five floors', () => {
  for (let floors = 1; floors <= 5; floors += 1) {
    const condition = fixtureCondition(7101, floors);
    const plan = generateDeterministicCoarseSemanticVoxelPlan({ condition });
    const cells = decodeStage7Runs(plan.runs);
    const floorLevels = new Set(cells.filter((cell) => cell.envelope === 'floor').map((cell) => cell.y));
    assert.equal(floorLevels.size, floors, `floor layer mismatch for ${floors} floors`);
    assert.ok(cells.some((cell) => cell.envelope === 'roof'), `missing roof for ${floors} floors`);
    assert.equal(validateStage7Plan(plan, { conditionHash: condition.condition_hash }).ok, true);
  }
});

test('baseline follows space-strategy signals and scopes reviewed evidence to approved layers', () => {
  const base = fixtureCondition(7101, 1);
  const changedPayload = structuredClone(base);
  delete changedPayload.condition_hash;
  changedPayload.design.space_strategy = ['public-west'];
  const changed = { ...changedPayload, condition_hash: hashCanonicalValue(changedPayload) };
  const volumePayload = structuredClone(base);
  delete volumePayload.condition_hash;
  volumePayload.design.massing_volumes = [{ id: 'wing', role: 'wing', shape: 'box', scale: [1, 0.7, 0.4], placement: { relation: 'attached-east', attach_to: 'main' }, boolean_mode: 'union', tags: ['secondary-mass'] }];
  const volumeChanged = { ...volumePayload, condition_hash: hashCanonicalValue(volumePayload) };
  const topologyPayload = structuredClone(base);
  delete topologyPayload.condition_hash;
  topologyPayload.design.topology_program = { nodes: [{ id: 'service-core', type: 'service', floor: 0, weight: 8, privacy: 'service', zone: 'service' }], edges: [], zoning: { service: ['service-core'] } };
  const topologyChanged = { ...topologyPayload, condition_hash: hashCanonicalValue(topologyPayload) };
  const baseCells = decodeStage7Runs(generateDeterministicCoarseSemanticVoxelPlan({ condition: base }).runs);
  const basePlan = generateDeterministicCoarseSemanticVoxelPlan({ condition: base });
  const changedCells = decodeStage7Runs(generateDeterministicCoarseSemanticVoxelPlan({ condition: changed }).runs);
  const averagePublicX = (cells) => {
    const values = cells.filter((cell) => cell.space === 'public').map((cell) => cell.x);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };
  assert.ok(averagePublicX(changedCells) < averagePublicX(baseCells) - 3);
  assert.notDeepEqual(generateDeterministicCoarseSemanticVoxelPlan({ condition: volumeChanged }).runs, basePlan.runs);
  assert.notDeepEqual(generateDeterministicCoarseSemanticVoxelPlan({ condition: topologyChanged }).runs, basePlan.runs);

  const referenceId = 'reference:approved-courtyard-house';
  assert.ok(baseCells.some((cell) => cell.envelope !== 'none' && cell.evidence_ids.includes(referenceId)));
  assert.equal(baseCells.some((cell) => cell.space !== 'outside' && cell.envelope === 'none' && cell.evidence_ids.includes(referenceId)), false);
  assert.equal(baseCells.some((cell) => cell.site !== 'none' && cell.evidence_ids.includes(referenceId)), false);
});

function fixtureCondition(seed = 7101, floors = 2) {
  return buildStage7Condition({
    prompt: '湖边带水景庭院的两层日式住宅，有花园和观景轴线',
    seed,
    architecture: {
      style: '日式',
      style_family: 'japanese',
      typology: 'house',
      footprint: 'courtyard',
      facade_rules: { front_side: 'south' },
      site_rules: { water_feature: true, enclosed_courtyard: true, planting_beds: true },
      massing_rules: { creative_variant: 'stepped-terrace' }
    },
    buildSpec: {
      width: 31,
      depth: 27,
      floors,
      floor_height: 5,
      total_height: floors * 5 + 4,
      door_side: 'south',
      lot: { width: 37, depth: 40 },
      constraints: { max_total_height: 40, minecraft_fill_limit: 32768 }
    },
    topology: { bsp_hints: { split_strategy: 'view-facing' } },
    creativeDesign: {
      design_axes: { massing_variant: 'stepped-terrace', split_strategy: 'view-facing' },
      topology: { public_core_position: 'view-facing' },
      site: { water_feature: true }
    },
    conceptStudio: {
      selected_concept_id: 'concept-courtyard',
      selectedConcept: {
        id: 'concept-courtyard',
        massing_plan: { variant_hint: 'courtyard', key_moves: ['stepped-terrace'] },
        space_graph_strategy: { public_core: 'living' },
        quality_targets: ['clear-entry']
      }
    },
    templateKnowledge: {
      retrieval_explanation: {
        source: 'template-explainable-retriever-v1',
        references: [{
          case_id: 'approved-courtyard-house',
          title: 'Approved Courtyard House',
          rank: 1,
          match_score: 90,
          review_state: 'approved',
          review_confidence: 0.9,
          approved_learning_areas: [],
          blocked_learning_areas: [],
          teaches: [{ area: 'massing', claim: 'courtyard massing', confidence: 0.9 }],
          risk_controls: ['change dimensions']
        }]
      }
    }
  });
}
```

- [ ] **Step 2: Run the baseline test to verify it fails**

Run:

```powershell
node --test test/coarseSemanticVoxelBaseline.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `coarseSemanticVoxelBaseline.js`.

- [ ] **Step 3: Implement the deterministic baseline provider**

Create `src/construction/learning/coarseSemanticVoxelBaseline.js`:

```js
import { createStage7Plan } from './coarseSemanticVoxelSchema.js';

export const STAGE7_BASELINE_SOURCE = 'stage7-coarse-semantic-voxel-baseline-v1';

export const deterministicCoarseSemanticVoxelProvider = Object.freeze({
  id: 'baseline',
  async generate(input = {}) {
    return generateDeterministicCoarseSemanticVoxelPlan(input);
  }
});

export function generateDeterministicCoarseSemanticVoxelPlan({ condition = {}, seed = condition.seed, options = {} } = {}) {
  if (Number(seed) !== Number(condition.seed)) throw new Error('baseline provider seed must match the canonical condition');
  void options;
  const cells = new Map();
  const evidence = evidenceFor(condition);
  const evidenceIds = evidenceIdsByLayer(condition);
  const bounds = normalizedBuildingBounds(condition);
  const floors = clampInt(condition.dimensions?.floors, 1, 5, 1);
  const baseY = 4;
  const roofY = 58;
  const floorSpan = Math.max(6, Math.floor((roofY - baseY) / floors));
  const strategies = new Set((condition.design?.massing_strategy || []).map(normalizeToken));
  const referenceHints = (condition.references || []).flatMap((item) => item.hints || []).map((item) => normalizeToken(item.claim));
  const courtyard = condition.design?.footprint === 'courtyard' || strategies.has('courtyard') || referenceHints.some((item) => item.includes('courtyard'));
  const stepped = [...strategies, ...referenceHints].some((item) => item.includes('step') || item.includes('terrace'));
  const courtyardBox = courtyard ? insetBox(bounds, Math.max(4, Math.floor((bounds.x1 - bounds.x0 + 1) * 0.35)), Math.max(4, Math.floor((bounds.z1 - bounds.z0 + 1) * 0.35))) : undefined;

  addSiteLayer(cells, condition, bounds, courtyardBox, evidenceIds.site);
  for (let floor = 0; floor < floors; floor += 1) {
    const inset = floorInset(bounds, floor, stepped);
    const floorBounds = {
      x0: bounds.x0 + inset,
      x1: bounds.x1 - inset,
      z0: bounds.z0 + inset,
      z1: bounds.z1 - inset
    };
    const y0 = baseY + floor * floorSpan;
    const y1 = floor === floors - 1 ? roofY - 1 : baseY + (floor + 1) * floorSpan - 1;
    addFloor(cells, floorBounds, courtyardBox, y0, evidenceIds.envelope);
    addStructuralSupportColumns(cells, floorBounds, baseY, y0, evidenceIds.envelope);
    addEnvelopeAndSpaces(cells, floorBounds, courtyardBox, y0, y1, floor, floors, condition, evidenceIds);
  }
  const topInset = floorInset(bounds, floors - 1, stepped);
  addRoof(cells, stepped ? {
    x0: bounds.x0 + topInset,
    x1: bounds.x1 - topInset,
    z0: bounds.z0 + topInset,
    z1: bounds.z1 - topInset
  } : bounds, courtyardBox, roofY, evidenceIds.envelope);
  addEntrance(cells, bounds, condition.design?.front_side || 'south', baseY, [...new Set([...evidenceIds.envelope, ...evidenceIds.space])]);
  if (floors > 1) addVerticalCore(cells, bounds, courtyardBox, baseY, roofY, evidenceIds.space);

  return createStage7Plan({
    condition,
    provider: {
      kind: 'deterministic-baseline',
      name: STAGE7_BASELINE_SOURCE,
      model_version: null,
      dataset_version: null
    },
    cells: [...cells.values()],
    evidence
  });
}

function normalizedBuildingBounds(condition) {
  const secondary = (condition.design?.massing_volumes || []).filter((item) => item.boolean_mode !== 'subtract' && item.placement?.relation !== 'center');
  const widthExtension = secondary.filter((item) => /east|west/i.test(item.placement?.relation || '')).reduce((sum, item) => sum + Number(item.scale?.[0] || 0), 0);
  const depthExtension = secondary.filter((item) => /north|south/i.test(item.placement?.relation || '')).reduce((sum, item) => sum + Number(item.scale?.[2] || 0), 0);
  const widthRatio = clamp(Number(condition.dimensions?.width || 1) / Math.max(1, Number(condition.dimensions?.lot_width || 1)) + Math.min(0.1, widthExtension * 0.04), 0.25, 0.9);
  const depthRatio = clamp(Number(condition.dimensions?.depth || 1) / Math.max(1, Number(condition.dimensions?.lot_depth || 1)) + Math.min(0.1, depthExtension * 0.04), 0.25, 0.9);
  const width = clampInt(Math.round(64 * widthRatio), 20, 56, 40);
  const depth = clampInt(Math.round(64 * depthRatio), 20, 56, 40);
  const x0 = Math.floor((64 - width) / 2);
  const z0 = Math.floor((64 - depth) / 2);
  return { x0, x1: x0 + width - 1, z0, z1: z0 + depth - 1 };
}

function floorInset(bounds, floor, stepped) {
  if (!stepped) return 0;
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const maxInset = Math.max(0, Math.floor((Math.min(width, depth) - 12) / 2));
  return Math.min(floor * 2, maxInset);
}

function addSiteLayer(cells, condition, building, courtyard, evidenceIds) {
  for (let z = 0; z < 64; z += 1) {
    for (let x = 0; x < 64; x += 1) put(cells, x, 0, z, { site: 'ground' }, evidenceIds);
  }
  if ((condition.design?.abstract_site_tags || []).includes('water-edge')) {
    for (let z = 0; z <= 4; z += 1) {
      for (let x = 0; x < 64; x += 1) put(cells, x, 0, z, { site: 'water' }, evidenceIds);
    }
  }
  for (let x = 1; x < 63; x += 6) {
    put(cells, x, 0, 6, { site: 'vegetation' }, evidenceIds);
    put(cells, x, 0, 62, { site: 'vegetation' }, evidenceIds);
  }
  if (courtyard) {
    for (let z = courtyard.z0; z <= courtyard.z1; z += 1) {
      for (let x = courtyard.x0; x <= courtyard.x1; x += 1) put(cells, x, 0, z, { site: 'courtyard' }, evidenceIds);
    }
  }
  const door = entrancePoint(building, condition.design?.front_side || 'south');
  for (const point of pathToLotEdge(door, condition.design?.front_side || 'south')) put(cells, point.x, 0, point.z, { site: 'path' }, evidenceIds);
}

function addFloor(cells, bounds, courtyard, y, evidenceIds) {
  for (let z = bounds.z0; z <= bounds.z1; z += 1) {
    for (let x = bounds.x0; x <= bounds.x1; x += 1) {
      if (inside(x, z, courtyard)) continue;
      put(cells, x, y, z, { envelope: 'floor' }, evidenceIds);
    }
  }
}

function addStructuralSupportColumns(cells, bounds, baseY, floorY, evidenceIds) {
  if (floorY <= baseY) return;
  const corners = [
    [bounds.x0, bounds.z0],
    [bounds.x1, bounds.z0],
    [bounds.x0, bounds.z1],
    [bounds.x1, bounds.z1]
  ];
  for (const [x, z] of corners) {
    for (let y = baseY + 1; y <= floorY; y += 1) put(cells, x, y, z, { envelope: 'support' }, evidenceIds);
  }
}

function addEnvelopeAndSpaces(cells, bounds, courtyard, y0, y1, floor, floors, condition, evidenceIds) {
  for (let y = y0 + 1; y <= y1; y += 1) {
    for (let z = bounds.z0; z <= bounds.z1; z += 1) {
      for (let x = bounds.x0; x <= bounds.x1; x += 1) {
        if (inside(x, z, courtyard)) continue;
        if (x === bounds.x0 || x === bounds.x1 || z === bounds.z0 || z === bounds.z1) {
          put(cells, x, y, z, { envelope: 'wall' }, evidenceIds.envelope);
        } else {
          put(cells, x, y, z, { space: zoneFor(x, z, bounds, floor, floors, condition) }, evidenceIds.space);
        }
      }
    }
  }
}

function addRoof(cells, bounds, courtyard, y, evidenceIds) {
  for (let z = bounds.z0; z <= bounds.z1; z += 1) {
    for (let x = bounds.x0; x <= bounds.x1; x += 1) {
      if (inside(x, z, courtyard)) continue;
      put(cells, x, y, z, { envelope: 'roof' }, evidenceIds);
    }
  }
}

function addEntrance(cells, bounds, frontSide, baseY, evidenceIds) {
  const point = entrancePoint(bounds, frontSide);
  for (let y = baseY + 1; y <= baseY + 3; y += 1) {
    put(cells, point.x, y, point.z, { envelope: 'opening', space: 'circulation' }, evidenceIds);
  }
}

function addVerticalCore(cells, bounds, courtyard, baseY, roofY, evidenceIds) {
  const centerX = Math.floor((bounds.x0 + bounds.x1) / 2);
  const centerZ = Math.floor((bounds.z0 + bounds.z1) / 2);
  const candidates = [
    { x: centerX, z: centerZ },
    { x: centerX + 1, z: centerZ },
    { x: centerX, z: centerZ + 1 },
    { x: centerX + 1, z: centerZ + 1 }
  ].map((point) => inside(point.x, point.z, courtyard) ? { x: courtyard.x0 - 2, z: point.z } : point);
  for (let y = baseY + 1; y < roofY; y += 1) {
    for (const point of candidates) put(cells, point.x, y, point.z, { space: 'vertical_circulation' }, evidenceIds);
  }
}

function zoneFor(x, z, bounds, floor, floors, condition) {
  const centerX = Math.floor((bounds.x0 + bounds.x1) / 2);
  const centerZ = Math.floor((bounds.z0 + bounds.z1) / 2);
  const strategy = [...(condition.design?.space_strategy || []), ...(condition.design?.quality_targets || [])].map(normalizeToken).join(' ');
  const programNodes = condition.design?.topology_program?.nodes || [];
  const totalProgramWeight = programNodes.reduce((sum, item) => sum + Math.max(0, Number(item.weight || 0)), 0);
  const serviceProgramWeight = programNodes.filter((item) => item.zone === 'service' || item.privacy === 'service').reduce((sum, item) => sum + Math.max(0, Number(item.weight || 0)), 0);
  const serviceWidth = clampInt(2 + Math.round(totalProgramWeight ? (serviceProgramWeight / totalProgramWeight) * 8 : 0), 2, 6, 3);
  const corridorRadius = strategy.includes('clear-entry') ? 2 : 1;
  if (Math.abs(x - centerX) <= corridorRadius || Math.abs(z - centerZ) <= corridorRadius) return 'circulation';
  const serviceOnWest = Math.abs(Number(condition.seed || 0)) % 2 === 1;
  const serviceEdge = serviceOnWest ? x <= bounds.x0 + serviceWidth : x >= bounds.x1 - serviceWidth;
  if (serviceEdge) return 'service';
  if (floor > 0 || floors === 1 && z < centerZ) return 'private';
  if (strategy.includes('public-west')) return x < centerX ? 'public' : 'private';
  if (strategy.includes('public-east')) return x > centerX ? 'public' : 'private';
  if (strategy.includes('public-north')) return z < centerZ ? 'public' : 'private';
  return z >= centerZ ? 'public' : 'private';
}

function evidenceFor(condition) {
  return [
    { id: `condition:${condition.condition_hash}`, kind: 'condition', source_id: condition.condition_hash },
    ...(condition.references || []).map((reference) => ({
      id: `reference:${reference.case_id}`,
      kind: 'reference',
      source_id: reference.case_id,
      detail: reference.used_for.join(',')
    }))
  ];
}

function evidenceIdsByLayer(condition) {
  const conditionId = `condition:${condition.condition_hash}`;
  const references = condition.references || [];
  const idsFor = (areas) => [
    conditionId,
    ...references
      .filter((reference) => (reference.used_for || []).some((area) => areas.includes(area)))
      .map((reference) => `reference:${reference.case_id}`)
  ].sort();
  return {
    envelope: idsFor(['massing', 'structure', 'facade', 'roof']),
    space: idsFor(['space', 'planning', 'circulation', 'interior']),
    site: idsFor(['site', 'landscape', 'courtyard', 'water'])
  };
}

function put(cells, x, y, z, values, evidenceIds) {
  if (![x, y, z].every((value) => Number.isInteger(value) && value >= 0 && value < 64)) return;
  const key = `${x},${y},${z}`;
  const current = cells.get(key) || { x, y, z, envelope: 'none', space: 'outside', site: 'none', confidence: 1, evidence_ids: [] };
  cells.set(key, {
    ...current,
    ...values,
    evidence_ids: [...new Set([...current.evidence_ids, ...evidenceIds])].sort()
  });
}

function entrancePoint(bounds, frontSide) {
  const centerX = Math.floor((bounds.x0 + bounds.x1) / 2);
  const centerZ = Math.floor((bounds.z0 + bounds.z1) / 2);
  if (frontSide === 'north') return { x: centerX, z: bounds.z0 };
  if (frontSide === 'east') return { x: bounds.x1, z: centerZ };
  if (frontSide === 'west') return { x: bounds.x0, z: centerZ };
  return { x: centerX, z: bounds.z1 };
}

function pathToLotEdge(point, frontSide) {
  const points = [];
  if (frontSide === 'north') for (let z = point.z; z >= 0; z -= 1) points.push({ x: point.x, z });
  else if (frontSide === 'east') for (let x = point.x; x < 64; x += 1) points.push({ x, z: point.z });
  else if (frontSide === 'west') for (let x = point.x; x >= 0; x -= 1) points.push({ x, z: point.z });
  else for (let z = point.z; z < 64; z += 1) points.push({ x: point.x, z });
  return points;
}

function insetBox(bounds, width, depth) {
  const centerX = Math.floor((bounds.x0 + bounds.x1) / 2);
  const centerZ = Math.floor((bounds.z0 + bounds.z1) / 2);
  return {
    x0: centerX - Math.floor(width / 2),
    x1: centerX + Math.ceil(width / 2) - 1,
    z0: centerZ - Math.floor(depth / 2),
    z1: centerZ + Math.ceil(depth / 2) - 1
  };
}

function inside(x, z, box) {
  return Boolean(box) && x >= box.x0 && x <= box.x1 && z >= box.z0 && z <= box.z1;
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? Math.round(number) : fallback));
}
```

- [ ] **Step 4: Run the baseline tests**

Run:

```powershell
node --test test/coarseSemanticVoxelBaseline.test.js
```

Expected: PASS, 5 tests, 0 failures.

- [ ] **Step 5: Run schema and condition regressions together**

Run:

```powershell
node --test test/coarseSemanticVoxelSchema.test.js test/coarseSemanticVoxelCondition.test.js test/coarseSemanticVoxelBaseline.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the deterministic provider**

```powershell
git add src/construction/learning/coarseSemanticVoxelBaseline.js test/coarseSemanticVoxelBaseline.test.js
git commit -m "feat: add stage 7 coarse voxel baseline"
```

---

### Task 4: Semantic Validation, Bounded Repair, and Blocker Classification

**Files:**
- Create: `src/construction/learning/coarseSemanticVoxelRepair.js`
- Create: `test/coarseSemanticVoxelRepair.test.js`

**Interfaces:**
- Consumes: untrusted canonical plan plus its exact condition.
- Produces:
  - `STAGE7_REPAIR_SOURCE`
  - `MAX_STAGE7_MASSING_COMPONENTS`
  - `repairCoarseSemanticVoxelPlan({ plan, condition }) -> { source, active, accepted, plan?, validation, conflicts, repairs, blockers, warnings, summary }`
- Depends on: Task 1 schema validation and RLE functions.
- Contract: hard schema errors are rejected; safe repair never invents a primary mass, entrance, room graph, or vertical core.
- Lot-boundary rule: the entire normalized X/Z domain is the conceptual lot in M1. Site coordinates outside `0..63` are hard schema blockers; valid site cells therefore need no lossy post-schema clamp, and derived site boxes remain bounded by construction.

- [ ] **Step 1: Write failing repair tests**

Create `test/coarseSemanticVoxelRepair.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStage7Plan,
  decodeStage7Runs,
  hashCanonicalValue
} from '../src/construction/learning/coarseSemanticVoxelSchema.js';
import { repairCoarseSemanticVoxelPlan } from '../src/construction/learning/coarseSemanticVoxelRepair.js';

test('Stage 7 repair removes noise, closes a one-cell wall gap, adds a roof, and clears circulation collisions', () => {
  const condition = conditionFixture(2);
  const plan = planFixture(condition, { includeRoof: false, includeEntrance: true, includeVertical: true, includeNoise: true, includeGap: true, includeCollision: true });
  const result = repairCoarseSemanticVoxelPlan({ plan, condition });
  const cells = decodeStage7Runs(result.plan.runs);

  assert.equal(result.accepted, true, result.blockers.map((item) => item.message).join('; '));
  for (const reason of ['isolated-component', 'one-cell-envelope-gap', 'missing-roof-cap', 'circulation-envelope-conflict']) {
    assert.ok(result.repairs.some((item) => item.reason === reason), `missing repair ${reason}`);
  }
  for (const item of result.repairs) {
    assert.ok(Array.isArray(item.evidence_ids));
    assert.ok(Number.isInteger(item.before_cell_count));
    assert.ok(Number.isInteger(item.after_cell_count));
  }
  assert.equal(cells.some((cell) => cell.x === 60 && cell.y === 60 && cell.z === 60 && cell.envelope === 'wall'), false);
  assert.ok(cells.some((cell) => cell.x === 6 && cell.y === 3 && cell.z === 4 && cell.envelope === 'wall'));
  assert.ok(cells.some((cell) => cell.envelope === 'roof'));
  assert.ok(cells.some((cell) => cell.x === 5 && cell.y === 3 && cell.z === 5 && cell.envelope === 'opening'));
});

test('Stage 7 repair rejects hard schema blockers without mutating the plan', () => {
  const condition = conditionFixture(1);
  const plan = planFixture(condition, { includeRoof: true, includeEntrance: true });
  plan.condition_hash = 'wrong';
  plan.runs[0].x1 = 64;

  const result = repairCoarseSemanticVoxelPlan({ plan, condition });
  assert.equal(result.accepted, false);
  assert.equal(result.plan, undefined);
  assert.ok(result.blockers.some((item) => item.id === 'hard-schema'));
  assert.ok(result.validation.errors.includes('condition hash mismatch'));
  assert.ok(result.validation.errors.includes('run coordinates must be integers inside 0..63'));
});

test('Stage 7 repair reports missing entrance, circulation, and vertical core instead of inventing them', () => {
  const condition = conditionFixture(2);
  const plan = planFixture(condition, { includeRoof: true, includeEntrance: false, includeVertical: false });
  const result = repairCoarseSemanticVoxelPlan({ plan, condition });

  assert.equal(result.accepted, false);
  assert.ok(result.blockers.some((item) => item.id === 'missing-entrance'));
  assert.ok(result.blockers.some((item) => item.id === 'missing-circulation'));
  assert.ok(result.blockers.some((item) => item.id === 'missing-vertical-circulation'));
  assert.equal(result.repairs.some((item) => /entrance|vertical/.test(item.reason)), false);
});

test('Stage 7 repair is deterministic for the same plan and condition', () => {
  const condition = conditionFixture(1);
  const plan = planFixture(condition, { includeRoof: false, includeEntrance: true, includeGap: true });
  const splitIndex = plan.runs.findIndex((run) => run.x1 > run.x0);
  const split = plan.runs[splitIndex];
  plan.runs.splice(splitIndex, 1,
    { ...split, x1: split.x0 },
    { ...split, x0: split.x0 + 1 }
  );
  const first = repairCoarseSemanticVoxelPlan({ plan, condition });
  const second = repairCoarseSemanticVoxelPlan({ plan, condition });
  assert.ok(first.repairs.some((item) => item.reason === 'merge-adjacent-runs'));
  assert.deepEqual(first, second);
});

test('detached components cannot donate entrance or vertical-core semantics to the primary envelope', () => {
  const condition = conditionFixture(2);
  const base = planFixture(condition, { includeRoof: true, includeEntrance: false, includeVertical: false });
  const cells = decodeStage7Runs(base.runs);
  for (let y = 2; y <= 12; y += 1) cells.push(cell(45, y, 45, { envelope: 'support', space: 'vertical_circulation' }));
  cells.push(cell(45, 3, 46, { envelope: 'opening', space: 'circulation' }));
  const spoofed = createStage7Plan({ condition, provider: base.provider, cells: mergeFixtureCells(cells), evidence: base.evidence });

  const result = repairCoarseSemanticVoxelPlan({ plan: spoofed, condition });
  assert.equal(result.accepted, false);
  assert.ok(result.blockers.some((item) => item.id === 'missing-entrance'));
  assert.ok(result.blockers.some((item) => item.id === 'missing-vertical-circulation'));
});

test('repair handles ten thousand valid isolated cells with a bounded component scan', () => {
  const condition = conditionFixture(1);
  const cells = [];
  collect: for (let y = 0; y < 64; y += 2) {
    for (let z = 0; z < 64; z += 2) {
      for (let x = 0; x < 64; x += 2) {
        cells.push(cell(x, y, z, { envelope: 'wall' }));
        if (cells.length === 10000) break collect;
      }
    }
  }
  const plan = createStage7Plan({
    condition,
    provider: { kind: 'artifact', name: 'large-component-fixture' },
    cells,
    evidence: [{ id: 'condition:repair', kind: 'condition', source_id: condition.condition_hash }]
  });
  const result = repairCoarseSemanticVoxelPlan({ plan, condition });
  assert.equal(result.accepted, false);
  assert.equal(result.repairs.filter((item) => item.reason === 'isolated-component').length, 9999);
});

test('repair rejects more massing components than the bounded converter contract can represent', () => {
  const condition = conditionFixture(1);
  const base = planFixture(condition, { includeRoof: true, includeEntrance: true });
  const cells = decodeStage7Runs(base.runs);
  for (let index = 0; index < 16; index += 1) {
    const x0 = 20 + (index % 4) * 10;
    const z0 = 20 + Math.floor(index / 4) * 10;
    for (let x = x0; x < x0 + 3; x += 1) {
      for (let z = z0; z < z0 + 3; z += 1) cells.push(cell(x, 2, z, { envelope: 'wall' }));
    }
  }
  const plan = createStage7Plan({ condition, provider: base.provider, cells: mergeFixtureCells(cells), evidence: base.evidence });
  const result = repairCoarseSemanticVoxelPlan({ plan, condition });
  assert.equal(result.accepted, false);
  assert.ok(result.blockers.some((item) => item.id === 'too-many-massing-components'));
});

function conditionFixture(floors) {
  const payload = {
    source: 'stage7-coarse-semantic-voxel-condition-v1',
    schema_version: 1,
    prompt: 'repair fixture',
    seed: 7,
    dimensions: { width: 20, depth: 18, floors, floor_height: 5, total_height: floors * 5 + 4, lot_width: 26, lot_depth: 28 },
    design: { front_side: 'south' },
    references: [],
    constraints: { resolution: [64, 64, 64], max_total_height: 40, minecraft_fill_limit: 32768 }
  };
  return { ...payload, condition_hash: hashCanonicalValue(payload) };
}

function planFixture(condition, options = {}) {
  const cells = [];
  const evidence = [{ id: 'condition:repair', kind: 'condition', source_id: condition.condition_hash }];
  for (let x = 4; x <= 10; x += 1) {
    cells.push(cell(x, 2, 4, { envelope: 'floor' }));
    cells.push(cell(x, 7, 4, { envelope: 'floor' }));
    if (!(options.includeGap && x === 6)) cells.push(cell(x, 3, 4, { envelope: 'wall' }));
    cells.push(cell(x, 3, 10, { envelope: 'wall' }));
  }
  for (let y = 3; y <= 7; y += 1) cells.push(cell(4, y, 4, { envelope: 'support' }));
  for (let x = 4; x <= 10; x += 1) {
    for (let z = 5; z <= 10; z += 1) {
      cells.push(cell(x, 2, z, { envelope: 'floor' }));
      cells.push(cell(x, 7, z, { envelope: 'floor' }));
    }
  }
  for (let z = 5; z <= 9; z += 1) {
    cells.push(cell(4, 3, z, { envelope: 'wall' }));
    cells.push(cell(10, 3, z, { envelope: 'wall' }));
  }
  for (let x = 5; x <= 9; x += 1) {
    for (let z = 5; z <= 9; z += 1) cells.push(cell(x, 3, z, { space: x <= 6 ? 'public' : 'private' }));
  }
  if (options.includeEntrance) cells.push(cell(7, 3, 10, { envelope: 'opening', space: 'circulation' }));
  if (options.includeVertical) {
    // Anchor the fixture core to both floor layers so the upper floor is not
    // mistaken for removable isolated noise before collision clearing runs.
    for (let y = 3; y <= 7; y += 1) cells.push(cell(7, y, 4, { envelope: 'support', space: 'vertical_circulation' }));
  }
  if (options.includeCollision) cells.push(cell(5, 3, 5, { envelope: 'wall', space: 'circulation' }));
  if (options.includeRoof) cells.push(cell(7, 8, 7, { envelope: 'roof' }));
  if (options.includeNoise) cells.push(cell(60, 60, 60, { envelope: 'wall' }));
  return createStage7Plan({
    condition,
    provider: { kind: 'artifact', name: 'repair-fixture' },
    cells: mergeFixtureCells(cells),
    evidence
  });
}

function mergeFixtureCells(cells) {
  const merged = new Map();
  for (const item of cells) {
    const key = `${item.x},${item.y},${item.z}`;
    const current = merged.get(key) || cell(item.x, item.y, item.z);
    merged.set(key, { ...current, ...item, evidence_ids: ['condition:repair'] });
  }
  return [...merged.values()];
}

function cell(x, y, z, values = {}) {
  return {
    x,
    y,
    z,
    envelope: values.envelope || 'none',
    space: values.space || 'outside',
    site: values.site || 'none',
    confidence: 1,
    evidence_ids: ['condition:repair']
  };
}
```

- [ ] **Step 2: Run the repair test to verify it fails**

Run:

```powershell
node --test test/coarseSemanticVoxelRepair.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `coarseSemanticVoxelRepair.js`.

- [ ] **Step 3: Implement semantic validation and bounded repair**

Create `src/construction/learning/coarseSemanticVoxelRepair.js`:

```js
import {
  canonicalStringify,
  decodeStage7Runs,
  encodeStage7Cells,
  validateStage7Plan
} from './coarseSemanticVoxelSchema.js';

export const STAGE7_REPAIR_SOURCE = 'stage7-coarse-semantic-voxel-repair-v1';
export const MAX_STAGE7_MASSING_COMPONENTS = 16;

const SOLID_ENVELOPE = new Set(['wall', 'floor', 'roof', 'support']);
const USABLE_SPACE = new Set(['public', 'private', 'service', 'circulation', 'vertical_circulation']);
const NEIGHBORS_6 = Object.freeze([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]);

export function repairCoarseSemanticVoxelPlan({ plan = {}, condition = {} } = {}) {
  const validation = validateStage7Plan(plan, { condition });
  if (!validation.ok) {
    return {
      source: STAGE7_REPAIR_SOURCE,
      active: true,
      accepted: false,
      plan: undefined,
      validation,
      conflicts: validation.errors.map((message) => conflict('hard-schema', 'blocker', message)),
      repairs: [],
      blockers: [conflict('hard-schema', 'blocker', validation.errors.join('; '))],
      warnings: validation.warnings,
      summary: { input_run_count: Array.isArray(plan.runs) ? plan.runs.length : 0, output_run_count: 0 }
    };
  }

  const decoded = decodeStage7Runs(plan.runs);
  const cells = new Map(decoded.map((cell) => [keyOf(cell), { ...cell, evidence_ids: [...cell.evidence_ids] }]));
  const repairs = [];
  const canonicalInputRuns = encodeStage7Cells(decoded);
  if (canonicalStringify(canonicalInputRuns) !== canonicalStringify(plan.runs)) {
    const reason = canonicalInputRuns.length < plan.runs.length ? 'merge-adjacent-runs' : 'canonicalize-run-tuples';
    repairs.push(repair(reason, [], evidenceOf(decoded), decoded.length, decoded.length, {
      input_run_count: plan.runs.length,
      output_run_count: canonicalInputRuns.length
    }));
  }
  removeIsolatedComponents(cells, repairs);
  closeOneCellWallGaps(cells, repairs);
  clearCirculationEnvelopeConflicts(cells, repairs);
  addMissingRoofCap(cells, repairs, plan);

  const outputCells = [...cells.values()].filter(hasSemanticValue).sort(compareCells);
  const semantic = semanticConflicts(outputCells, condition);
  const repairedPlan = {
    ...structuredClone(plan),
    runs: encodeStage7Cells(outputCells),
    summary: { ...summarize(outputCells), validated_entrance_cells: semantic.entranceKeys },
    conflicts: semantic.conflicts,
    repairs,
    warnings: [...new Set([...(plan.warnings || []), ...semantic.warnings])]
  };
  const outputValidation = validateStage7Plan(repairedPlan, { condition, allowDerived: true });
  const blockers = [...semantic.blockers];
  if (!outputValidation.ok) blockers.push(conflict('post-repair-schema', 'blocker', outputValidation.errors.join('; ')));

  return {
    source: STAGE7_REPAIR_SOURCE,
    active: true,
    accepted: blockers.length === 0,
    plan: repairedPlan,
    validation: outputValidation,
    conflicts: semantic.conflicts,
    repairs,
    blockers,
    warnings: repairedPlan.warnings,
    summary: {
      input_run_count: plan.runs.length,
      output_run_count: repairedPlan.runs.length,
      input_cell_count: validation.stats.cell_count,
      output_cell_count: outputValidation.stats.cell_count,
      repair_count: repairs.length,
      blocker_count: blockers.length
    }
  };
}

function removeIsolatedComponents(cells, repairs) {
  const components = connectedComponents(cells, (cell) => SOLID_ENVELOPE.has(cell.envelope));
  if (!components.length) return;
  const primary = components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))[0];
  const primaryKey = new Set(primary);
  for (const component of components) {
    if (component === primary || component.some((key) => primaryKey.has(key)) || component.length > 8) continue;
    const evidenceIds = evidenceOf(component.map((key) => cells.get(key)));
    for (const key of component) {
      const cell = cells.get(key);
      cells.set(key, { ...cell, envelope: 'none' });
    }
    repairs.push(repair('isolated-component', component, evidenceIds, component.length, 0, { removed_cell_count: component.length }));
  }
}

function closeOneCellWallGaps(cells, repairs) {
  const additions = [];
  for (const cell of cells.values()) {
    if (!['wall', 'support'].includes(cell.envelope)) continue;
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const gapKey = `${cell.x + dx},${cell.y},${cell.z + dz}`;
      const farKey = `${cell.x + dx * 2},${cell.y},${cell.z + dz * 2}`;
      const gap = cells.get(gapKey);
      const far = cells.get(farKey);
      if (!far || !['wall', 'support'].includes(far.envelope)) continue;
      if (gap?.envelope && gap.envelope !== 'none') continue;
      if (['circulation', 'vertical_circulation'].includes(gap?.space)) continue;
      additions.push({
        x: cell.x + dx,
        y: cell.y,
        z: cell.z + dz,
        evidence_ids: [...new Set([...cell.evidence_ids, ...far.evidence_ids])].sort()
      });
    }
  }
  for (const item of uniquePoints(additions)) {
    const key = keyOf(item);
    const current = cells.get(key) || emptyCell(item.x, item.y, item.z, item.evidence_ids);
    cells.set(key, { ...current, envelope: 'wall', evidence_ids: item.evidence_ids });
    repairs.push(repair('one-cell-envelope-gap', [key], item.evidence_ids, 0, 1, { added_cell_count: 1 }));
  }
}

function clearCirculationEnvelopeConflicts(cells, repairs) {
  for (const [key, cell] of cells) {
    if (!['circulation', 'vertical_circulation'].includes(cell.space)) continue;
    const blocked = ['wall', 'support'].includes(cell.envelope) ||
      (cell.space === 'vertical_circulation' && cell.envelope === 'floor');
    if (!blocked) continue;
    const replacement = cell.envelope === 'floor' ? 'none' : 'opening';
    cells.set(key, { ...cell, envelope: replacement });
    repairs.push(repair('circulation-envelope-conflict', [key], cell.evidence_ids, 1, 1, {
      before_envelope: cell.envelope,
      after_envelope: replacement
    }));
  }
}

function addMissingRoofCap(cells, repairs, plan) {
  const components = connectedComponents(cells, (cell) => ['wall', 'floor', 'support'].includes(cell.envelope))
    .filter((component) => component.length > 8)
    .sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
  if (!components.length) return;
  const existingRoof = new Map([...cells.values()]
    .filter((cell) => cell.envelope === 'roof')
    .map((cell) => [`${cell.x},${cell.z}`, cell.y]));
  const added = [];
  for (const component of components) {
    const projection = new Map();
    for (const key of component) {
      const cell = cells.get(key);
      const projectionKey = `${cell.x},${cell.z}`;
      if (!projection.has(projectionKey) || projection.get(projectionKey).y < cell.y) projection.set(projectionKey, cell);
    }
    for (const [projectionKey, cell] of projection) {
      if (Number(existingRoof.get(projectionKey)) > cell.y || cell.y >= 63) continue;
      const key = `${cell.x},${cell.y + 1},${cell.z}`;
      const current = cells.get(key) || emptyCell(cell.x, cell.y + 1, cell.z, cell.evidence_ids);
      cells.set(key, { ...current, envelope: 'roof' });
      existingRoof.set(projectionKey, cell.y + 1);
      added.push(key);
    }
  }
  if (added.length) {
    repairs.push(repair('missing-roof-cap', added, evidenceOf(added.map((key) => cells.get(key))), 0, added.length, {
      added_cell_count: added.length,
      provider: plan.provider?.name
    }));
  }
}

function semanticConflicts(cells, condition) {
  const conflicts = [];
  const blockers = [];
  const warnings = [];
  const byKey = new Map(cells.map((cell) => [keyOf(cell), cell]));
  const solid = cells.filter((cell) => SOLID_ENVELOPE.has(cell.envelope));
  const usable = cells.filter((cell) => USABLE_SPACE.has(cell.space));
  const opening = cells.filter((cell) => cell.envelope === 'opening');
  const solidComponents = connectedComponents(byKey, (cell) => SOLID_ENVELOPE.has(cell.envelope))
    .sort((left, right) => right.length - left.length || left[0].localeCompare(right[0]));
  const primaryKeys = new Set(solidComponents[0] || []);
  const primarySolid = solid.filter((cell) => primaryKeys.has(keyOf(cell)));
  const nonRoofSolid = primarySolid.filter((cell) => cell.envelope !== 'roof');
  const primaryBounds = boundsOf(nonRoofSolid);
  const usableInside = usable.filter((cell) => insideBounds(cell, primaryBounds));
  const usableMap = new Map(usableInside.map((cell) => [keyOf(cell), cell]));
  const usableComponents = connectedComponents(usableMap, () => true)
    .sort((left, right) => right.length - left.length || left[0].localeCompare(right[0]));
  const primaryUsableKeys = new Set(usableComponents[0] || []);
  const primaryUsable = usableInside.filter((cell) => primaryUsableKeys.has(keyOf(cell)));
  const circulation = primaryUsable.filter((cell) => cell.space === 'circulation');
  const vertical = primaryUsable.filter((cell) => cell.space === 'vertical_circulation');
  const roof = primarySolid.filter((cell) => cell.envelope === 'roof');
  const floorLevels = new Set(primarySolid.filter((cell) => cell.envelope === 'floor').map((cell) => cell.y));
  const entranceCells = opening.filter((cell) =>
    onHorizontalBoundary(cell, primaryBounds) &&
    touchesPrimaryEnvelope(cell, primaryKeys) &&
    (primaryUsableKeys.has(keyOf(cell)) || neighbourKeyInSet(cell, primaryUsableKeys)) &&
    (cell.space === 'circulation' || neighbourHasSpace(cell, cells, 'circulation'))
  );
  const entrance = entranceCells.length > 0;
  const roofCoverage = roofCoverageRatio(nonRoofSolid, roof);
  const requestedFloors = Math.max(1, Number(condition.dimensions?.floors || 1));
  const sortedFloorLevels = [...floorLevels].sort((left, right) => left - right).slice(0, requestedFloors);
  const verticalContinuity = requestedFloors <= 1 || verticalPathCoversFloors(vertical, sortedFloorLevels);

  requireCondition(primarySolid.length > 0, 'missing-primary-envelope', 'primary envelope is missing');
  requireCondition(solidComponents.length <= MAX_STAGE7_MASSING_COMPONENTS, 'too-many-massing-components', `massing component count exceeds ${MAX_STAGE7_MASSING_COMPONENTS}`);
  requireCondition(primaryUsable.length > 0, 'missing-usable-space', 'connected usable space inside the primary envelope is missing');
  requireCondition(entrance, 'missing-entrance', 'an opening connected to circulation is required');
  requireCondition(circulation.length > 0, 'missing-circulation', 'circulation space is required');
  requireCondition(requestedFloors <= 1 || vertical.length > 0, 'missing-vertical-circulation', 'multi-floor plans require vertical circulation');
  requireCondition(roofCoverage >= 0.5, 'missing-roof', `roof coverage above occupied massing is insufficient: ${roofCoverage}`);
  requireCondition(floorLevels.size >= requestedFloors && verticalContinuity, 'missing-floor-continuity', 'each requested floor requires a floor layer connected by vertical circulation');
  if (cells.some((cell) => cell.site !== 'none' && (cell.x < 0 || cell.x > 63 || cell.z < 0 || cell.z > 63))) {
    requireCondition(false, 'site-outside-lot', 'conceptual site cells must remain inside the normalized lot');
  }
  return { conflicts, blockers, warnings, entranceKeys: entranceCells.map(keyOf).sort() };

  function requireCondition(ok, id, message) {
    if (ok) return;
    const item = conflict(id, 'blocker', message);
    conflicts.push(item);
    blockers.push(item);
  }
}

function connectedComponents(cells, predicate) {
  const remaining = new Set([...cells.entries()].filter(([, cell]) => predicate(cell)).map(([key]) => key));
  const components = [];
  const starts = [...remaining].sort();
  for (const start of starts) {
    if (!remaining.has(start)) continue;
    const queue = [start];
    const component = [];
    remaining.delete(start);
    for (let head = 0; head < queue.length; head += 1) {
      const key = queue[head];
      component.push(key);
      const cell = cells.get(key);
      for (const [dx, dy, dz] of NEIGHBORS_6) {
        const neighbour = `${cell.x + dx},${cell.y + dy},${cell.z + dz}`;
        if (!remaining.has(neighbour)) continue;
        remaining.delete(neighbour);
        queue.push(neighbour);
      }
    }
    components.push(component.sort());
  }
  return components;
}

function neighbourHasSpace(cell, cells, role) {
  const byKey = new Map(cells.map((item) => [keyOf(item), item]));
  return NEIGHBORS_6.some(([dx, dy, dz]) => byKey.get(`${cell.x + dx},${cell.y + dy},${cell.z + dz}`)?.space === role);
}

function onHorizontalBoundary(cell, bounds) {
  return Boolean(bounds) && (cell.x === bounds.minX || cell.x === bounds.maxX || cell.z === bounds.minZ || cell.z === bounds.maxZ);
}

function touchesPrimaryEnvelope(cell, primaryKeys) {
  return NEIGHBORS_6.some(([dx, dy, dz]) => primaryKeys.has(`${cell.x + dx},${cell.y + dy},${cell.z + dz}`));
}

function neighbourKeyInSet(cell, keys) {
  return NEIGHBORS_6.some(([dx, dy, dz]) => keys.has(`${cell.x + dx},${cell.y + dy},${cell.z + dz}`));
}

function verticalPathCoversFloors(verticalCells, floorLevels) {
  if (floorLevels.length < 2 || !verticalCells.length) return false;
  const verticalMap = new Map(verticalCells.map((cell) => [keyOf(cell), cell]));
  return connectedComponents(verticalMap, () => true).some((component) => {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const key of component) {
      const y = verticalMap.get(key).y;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return minY <= floorLevels[0] + 1 && maxY >= floorLevels.at(-1);
  });
}

function roofCoverageRatio(massing, roof) {
  const columns = new Map();
  for (const cell of massing) {
    const key = `${cell.x},${cell.z}`;
    if (!columns.has(key) || columns.get(key) < cell.y) columns.set(key, cell.y);
  }
  if (!columns.size) return 0;
  const covered = new Set();
  for (const cell of roof) {
    const key = `${cell.x},${cell.z}`;
    if (columns.has(key) && cell.y > columns.get(key)) covered.add(key);
  }
  return Number((covered.size / columns.size).toFixed(4));
}

function summarize(cells) {
  const envelope = countBy(cells, 'envelope');
  const space = countBy(cells, 'space');
  const site = countBy(cells, 'site');
  const confidenceValues = cells.map((cell) => Number(cell.confidence)).filter(Number.isFinite);
  return {
    cell_count: cells.length,
    envelope_counts: envelope,
    space_counts: space,
    site_counts: site,
    mean_confidence: confidenceValues.length ? Number((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length).toFixed(4)) : 0
  };
}

function countBy(cells, field) {
  const counts = {};
  for (const cell of cells) {
    const value = cell[field];
    if (value === 'none' || value === 'outside') continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function boundsOf(cells) {
  if (!cells.length) return undefined;
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const cell of cells) {
    bounds.minX = Math.min(bounds.minX, cell.x);
    bounds.maxX = Math.max(bounds.maxX, cell.x);
    bounds.minY = Math.min(bounds.minY, cell.y);
    bounds.maxY = Math.max(bounds.maxY, cell.y);
    bounds.minZ = Math.min(bounds.minZ, cell.z);
    bounds.maxZ = Math.max(bounds.maxZ, cell.z);
  }
  return bounds;
}

function insideBounds(cell, bounds) {
  return Boolean(bounds) && cell.x >= bounds.minX && cell.x <= bounds.maxX && cell.y >= bounds.minY && cell.y <= bounds.maxY && cell.z >= bounds.minZ && cell.z <= bounds.maxZ;
}

function repair(reason, cells, evidenceIds, beforeCellCount, afterCellCount, details) {
  return {
    reason,
    cells: [...cells].sort(),
    evidence_ids: [...new Set(evidenceIds || [])].sort(),
    before_cell_count: beforeCellCount,
    after_cell_count: afterCellCount,
    details
  };
}

function conflict(id, severity, message) {
  return { id, severity, message };
}

function emptyCell(x, y, z, evidenceIds) {
  return { x, y, z, envelope: 'none', space: 'outside', site: 'none', confidence: 1, evidence_ids: [...evidenceIds] };
}

function evidenceOf(cells) {
  return [...new Set(cells.flatMap((cell) => cell?.evidence_ids || []))].sort();
}

function hasSemanticValue(cell) {
  return cell.envelope !== 'none' || cell.space !== 'outside' || cell.site !== 'none';
}

function uniquePoints(points) {
  return [...new Map(points.map((point) => [keyOf(point), point])).values()].sort(compareCells);
}

function keyOf(cell) {
  return `${cell.x},${cell.y},${cell.z}`;
}

function compareCells(left, right) {
  return left.z - right.z || left.y - right.y || left.x - right.x;
}
```

- [ ] **Step 4: Run repair tests and fix only documented repair behavior**

Run:

```powershell
node --test test/coarseSemanticVoxelRepair.test.js
```

Expected: PASS, 7 tests, 0 failures.

- [ ] **Step 5: Run Stage 7 unit regressions**

Run:

```powershell
node --test test/coarseSemanticVoxelSchema.test.js test/coarseSemanticVoxelCondition.test.js test/coarseSemanticVoxelBaseline.test.js test/coarseSemanticVoxelRepair.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the repair boundary**

```powershell
git add src/construction/learning/coarseSemanticVoxelRepair.js test/coarseSemanticVoxelRepair.test.js
git commit -m "feat: repair stage 7 coarse voxel plans"
```

---

### Task 5: Derived Sketches and Semantic-Voxel-to-Procedural-Plan Conversion

**Files:**
- Create: `src/construction/learning/semanticVoxelProceduralPlan.js`
- Create: `test/semanticVoxelProceduralPlan.test.js`

**Interfaces:**
- Consumes: accepted repaired plan, exact condition, and immutable baseline `architecture`, `buildSpec`, and `topology`.
- Produces:
  - `STAGE7_CONVERTER_SOURCE`
  - `deriveStage7Sketches({ plan, condition }) -> { massing, spaces, site }`
  - `convertSemanticVoxelPlanToProceduralPlan({ plan, condition, architecture, buildSpec, topology, prompt }) -> candidate`
- Depends on: repaired plan from Task 4 and existing exported `normalizeArchitecture` / `normalizeTopology` functions.
- Contract: candidate contains semantic inputs only; no grid, operations, Minecraft commands, or direct XYZ fields in architecture volumes.

- [ ] **Step 1: Write failing converter tests**

Create `test/semanticVoxelProceduralPlan.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStage7Condition } from '../src/construction/learning/coarseSemanticVoxelCondition.js';
import { generateDeterministicCoarseSemanticVoxelPlan } from '../src/construction/learning/coarseSemanticVoxelBaseline.js';
import { repairCoarseSemanticVoxelPlan } from '../src/construction/learning/coarseSemanticVoxelRepair.js';
import { decodeStage7Runs, encodeStage7Cells } from '../src/construction/learning/coarseSemanticVoxelSchema.js';
import {
  convertSemanticVoxelPlanToProceduralPlan,
  deriveStage7Sketches
} from '../src/construction/learning/semanticVoxelProceduralPlan.js';

test('Stage 7 converter derives massing, space, and site sketches from the repaired grid', () => {
  const fixture = conversionFixture();
  const repaired = repairedFixture(fixture.condition);
  const sketches = deriveStage7Sketches({ plan: repaired.plan, condition: fixture.condition });
  const cells = decodeStage7Runs(repaired.plan.runs);

  assert.ok(sketches.massing.length >= 1);
  assert.ok(sketches.spaces.some((item) => item.role === 'public'));
  assert.ok(sketches.spaces.some((item) => item.role === 'vertical_circulation'));
  assert.ok(sketches.site.some((item) => item.role === 'courtyard'));
  assert.ok(sketches.site.some((item) => item.role === 'water'));
  assert.ok(sketches.massing.every((item) => item.bounds.minX >= 0 && item.bounds.maxX <= 63));
  assert.equal(sketches.massing.reduce((sum, item) => sum + item.cell_count, 0), cells.filter((cell) => ['wall', 'floor', 'roof', 'support'].includes(cell.envelope)).length);
  assert.ok(sketches.spaces.some((item) => item.adjacent_zone_ids.length > 0));
});

test('Stage 7 converter returns normalized candidate semantic inputs without mutating baselines', () => {
  const fixture = conversionFixture();
  const originalArchitecture = structuredClone(fixture.architecture);
  const originalBuildSpec = structuredClone(fixture.buildSpec);
  const originalTopology = structuredClone(fixture.topology);
  const repaired = repairedFixture(fixture.condition);
  const candidate = convertSemanticVoxelPlanToProceduralPlan({
    plan: repaired.plan,
    condition: fixture.condition,
    architecture: fixture.architecture,
    buildSpec: fixture.buildSpec,
    topology: fixture.topology,
    prompt: fixture.prompt
  });

  assert.equal(candidate.source, 'stage7-coarse-semantic-voxel-procedural-plan-v1');
  assert.equal(candidate.active, true);
  assert.equal(candidate.architecture.source, 'stage7-shadow-candidate');
  assert.equal(candidate.architecture.volumes[0].id, 'main');
  assert.ok(candidate.architecture.volumes.some((item) => item.boolean_mode === 'subtract' && item.tags.includes('courtyard-void')));
  assert.equal(candidate.architecture.volumes.filter((item) => item.boolean_mode === 'union').length, candidate.sketches.massing.length);
  assert.ok(candidate.architecture.volumes.every((item) => Array.isArray(item.scale) && item.placement));
  assert.ok(candidate.architecture.volumes.every((item) => item.tags.includes('stage7-concept:concept-courtyard')));
  assert.ok(candidate.architecture.volumes.every((item) => !Object.hasOwn(item, 'x') && !Object.hasOwn(item, 'y') && !Object.hasOwn(item, 'z')));
  assert.ok(candidate.buildSpec.width <= fixture.buildSpec.width);
  assert.ok(candidate.buildSpec.depth <= fixture.buildSpec.depth);
  for (const field of ['floors', 'floor_height', 'roof_height', 'total_height']) assert.ok(candidate.buildSpec[field] <= fixture.buildSpec[field]);
  assert.ok(candidate.buildSpec.lot.width <= fixture.buildSpec.lot.width);
  assert.ok(candidate.buildSpec.lot.depth <= fixture.buildSpec.lot.depth);
  assert.equal(candidate.buildSpec.lot.side_setback, fixture.buildSpec.lot.side_setback);
  assert.equal(candidate.buildSpec.lot.front_setback, fixture.buildSpec.lot.front_setback);
  assert.equal(candidate.buildSpec.lot.rear_setback, fixture.buildSpec.lot.rear_setback);
  assert.equal(candidate.buildSpec.door_side, fixture.buildSpec.door_side);
  assert.deepEqual(candidate.topology.nodes.map((item) => item.id), fixture.topology.nodes.map((item) => item.id));
  assert.ok(candidate.topology.bsp_hints.stage7_space_zones.length > 0);
  assert.ok(candidate.topology.bsp_hints.stage7_space_zone_edges.length > 0);
  assert.ok(candidate.topology.bsp_hints.stage7_stair_hints.length > 0);
  assert.ok(candidate.topology.bsp_hints.stage7_entrance_hints.length > 0);
  assert.equal(candidate.topology.bsp_hints.stage7_entrance_hints.length, repaired.plan.summary.validated_entrance_cells.length);
  assert.equal(Object.hasOwn(candidate, 'grid'), false);
  assert.equal(Object.hasOwn(candidate, 'operations'), false);
  assert.equal(Object.hasOwn(candidate, 'plan'), false);
  assert.equal(Object.hasOwn(candidate.plan_provenance, 'runs'), false);
  assert.deepEqual(fixture.architecture, originalArchitecture);
  assert.deepEqual(fixture.buildSpec, originalBuildSpec);
  assert.deepEqual(fixture.topology, originalTopology);

  const noisyPlan = structuredClone(repaired.plan);
  const noisyCells = decodeStage7Runs(noisyPlan.runs);
  let internalOpenings = 0;
  for (const cell of noisyCells) {
    if (cell.envelope !== 'none' || cell.space !== 'public' || internalOpenings >= 20) continue;
    cell.envelope = 'opening';
    internalOpenings += 1;
  }
  noisyPlan.runs = encodeStage7Cells(noisyCells);
  const noisyCandidate = convertSemanticVoxelPlanToProceduralPlan({
    plan: noisyPlan,
    condition: fixture.condition,
    architecture: fixture.architecture,
    buildSpec: fixture.buildSpec,
    topology: fixture.topology,
    prompt: fixture.prompt
  });
  assert.equal(internalOpenings, 20);
  assert.equal(noisyCandidate.topology.bsp_hints.stage7_entrance_hints.length, repaired.plan.summary.validated_entrance_cells.length);
});

test('Stage 7 converter is deterministic and rejects plans with unresolved blockers', () => {
  const fixture = conversionFixture();
  const repaired = repairedFixture(fixture.condition);
  const input = {
    plan: repaired.plan,
    condition: fixture.condition,
    architecture: fixture.architecture,
    buildSpec: fixture.buildSpec,
    topology: fixture.topology,
    prompt: fixture.prompt
  };
  assert.deepEqual(
    convertSemanticVoxelPlanToProceduralPlan(input),
    convertSemanticVoxelPlanToProceduralPlan(input)
  );

  const blocked = structuredClone(repaired.plan);
  blocked.conflicts = [{ id: 'missing-entrance', severity: 'blocker', message: 'missing entrance' }];
  assert.throws(
    () => convertSemanticVoxelPlanToProceduralPlan({ ...input, plan: blocked }),
    /unresolved Stage 7 blockers: missing-entrance/
  );
});

function repairedFixture(condition) {
  const result = repairCoarseSemanticVoxelPlan({
    plan: generateDeterministicCoarseSemanticVoxelPlan({ condition }),
    condition
  });
  assert.equal(result.accepted, true, result.blockers.map((item) => item.message).join('; '));
  return result;
}

function conversionFixture() {
  const prompt = '湖边带庭院的两层日式住宅';
  const architecture = {
    source: 'fallback',
    style: '日式',
    style_family: 'japanese',
    typology: 'house',
    philosophy: 'semantic fixture',
    footprint: 'courtyard',
    materials: { wall: 'minecraft:stripped_birch_wood', floor: 'minecraft:bamboo_planks' },
    volumes: [{ id: 'main', role: '主体', shape: 'box', scale: [1, 1, 1], placement: { relation: 'center' }, boolean_mode: 'union', tags: ['primary-mass'] }],
    envelope_rules: { hollow_shell: true },
    facade_rules: { front_side: 'south' },
    roof_rules: { style: 'hipped' },
    site_rules: { water_feature: true, enclosed_courtyard: true },
    massing_rules: { creative_variant: 'courtyard' },
    structural_rules: {},
    detail_rules: {},
    generation_hints: {}
  };
  const buildSpec = {
    width: 31,
    depth: 27,
    floors: 2,
    floor_height: 5,
    total_height: 14,
    wall_height: 10,
    roof_height: 4,
    door_side: 'south',
    footprint: 'courtyard',
    lot: { width: 37, depth: 40, side_setback: 3, front_setback: 4, rear_setback: 3 },
    constraints: { max_total_height: 40, minecraft_fill_limit: 32768 }
  };
  const topology = {
    source: 'fallback',
    nodes: [
      { id: 'entry', label: '入口', type: 'entry', floor: 0, weight: 0.8, privacy: 'public', zone: 'public', tags: [] },
      { id: 'living', label: '起居', type: 'living', floor: 0, weight: 1.5, privacy: 'public', zone: 'public', tags: [] },
      { id: 'bedroom', label: '卧室', type: 'bedroom', floor: 1, weight: 1.2, privacy: 'private', zone: 'private', tags: [] },
      { id: 'stairs', label: '楼梯', type: 'stairs', floor: 0, weight: 0.8, privacy: 'circulation', zone: 'circulation', tags: [] }
    ],
    edges: [
      { from: 'entry', to: 'living', relation: 'connected' },
      { from: 'living', to: 'stairs', relation: 'connected' },
      { from: 'stairs', to: 'bedroom', relation: 'vertical' }
    ],
    floor_program: [],
    zoning: { public: ['entry', 'living'], private: ['bedroom'], service: [], circulation: ['stairs'], outdoor: [] },
    circulation_rules: { entry_node: 'entry', connect_all_rooms: true },
    facade_alignment: {},
    site_connections: [],
    bsp_hints: { split_strategy: 'weighted' }
  };
  const condition = buildStage7Condition({
    prompt,
    seed: 7101,
    architecture,
    buildSpec,
    topology,
    creativeDesign: {
      design_axes: { massing_variant: 'courtyard', split_strategy: 'weighted' },
      topology: { public_core_position: 'center' },
      site: { water_feature: true }
    },
    conceptStudio: {
      selected_concept_id: 'concept-courtyard',
      selectedConcept: { id: 'concept-courtyard', massing_plan: { variant_hint: 'courtyard' }, quality_targets: ['clear-entry'] }
    },
    templateKnowledge: { retrieval_explanation: { references: [] } }
  });
  return { prompt, architecture, buildSpec, topology, condition };
}
```

- [ ] **Step 2: Run the converter test to verify it fails**

Run:

```powershell
node --test test/semanticVoxelProceduralPlan.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `semanticVoxelProceduralPlan.js`.

- [ ] **Step 3: Implement sketch derivation and semantic conversion**

Create `src/construction/learning/semanticVoxelProceduralPlan.js`:

```js
import { normalizeArchitecture } from '../agents/architectAgent.js';
import { normalizeTopology } from '../agents/plannerAgent.js';
import { decodeStage7Runs } from './coarseSemanticVoxelSchema.js';

export const STAGE7_CONVERTER_SOURCE = 'stage7-coarse-semantic-voxel-procedural-plan-v1';

const MASSING_ROLES = new Set(['wall', 'floor', 'roof', 'support']);
const SPACE_ROLES = new Set(['public', 'private', 'service', 'circulation', 'vertical_circulation', 'void']);
const SITE_ROLES = new Set(['ground', 'path', 'courtyard', 'water', 'vegetation']);
const NEIGHBORS_6 = Object.freeze([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]);

export function deriveStage7Sketches({ plan = {}, condition = {} } = {}) {
  const cells = decodeStage7Runs(plan.runs || []);
  const massing = connectedComponents(cells.filter((cell) => MASSING_ROLES.has(cell.envelope)))
    .map((component, index) => sketch(`massing-${index + 1}`, 'massing', component))
    .sort((left, right) => right.cell_count - left.cell_count || left.id.localeCompare(right.id));
  massing.forEach((item, index) => { item.id = `massing-${index + 1}`; item.primary = index === 0; });

  const floors = Math.max(1, Number(condition.dimensions?.floors || 1));
  const floorLevels = detectedFloorLevels(cells, floors);
  const spaceCells = cells.filter((cell) => SPACE_ROLES.has(cell.space));
  const spaceRecords = connectedComponentsByKey(
    spaceCells,
    (cell) => `${cell.space}:F${floorForY(cell.y, floorLevels)}`
  ).map((group) => ({
    role: group[0].space,
    floor: floorForY(group[0].y, floorLevels),
    group,
    bounds: boundsOf(group)
  })).sort((left, right) => left.floor - right.floor || left.role.localeCompare(right.role) || compareBounds(left.bounds, right.bounds));
  const cellToSpace = new Map();
  const spaces = spaceRecords.map((record, index) => {
    const item = { ...sketch(`space-${index + 1}`, record.role, record.group), floor: record.floor, adjacent_zone_ids: [] };
    for (const cell of record.group) cellToSpace.set(keyOf(cell), item.id);
    return item;
  });
  const adjacency = new Map(spaces.map((item) => [item.id, new Set()]));
  for (const cell of spaceCells) {
    const from = cellToSpace.get(keyOf(cell));
    for (const [dx, dy, dz] of NEIGHBORS_6) {
      const to = cellToSpace.get(`${cell.x + dx},${cell.y + dy},${cell.z + dz}`);
      if (to && to !== from) adjacency.get(from).add(to);
    }
  }
  for (const item of spaces) item.adjacent_zone_ids = [...adjacency.get(item.id)].sort();
  const site = groupedSketches(
    cells.filter((cell) => SITE_ROLES.has(cell.site)),
    (cell) => cell.site,
    (group, role, index) => sketch(`site-${index + 1}`, role, group)
  );
  return { massing, spaces, site };
}

export function convertSemanticVoxelPlanToProceduralPlan({
  plan = {},
  condition = {},
  architecture = {},
  buildSpec = {},
  topology = {},
  prompt = ''
} = {}) {
  const blockers = (plan.conflicts || []).filter((item) => item.severity === 'blocker');
  if (blockers.length) throw new Error(`unresolved Stage 7 blockers: ${blockers.map((item) => item.id).join(', ')}`);
  const sketches = deriveStage7Sketches({ plan, condition });
  if (!sketches.massing.length) throw new Error('Stage 7 conversion requires a massing sketch');

  const volumes = volumesFromMassing(sketches, condition);
  const candidateArchitecture = normalizeArchitecture({
    ...architecture,
    footprint: condition.design?.footprint || architecture.footprint,
    volumes,
    generation_hints: {
      ...(architecture.generation_hints || {}),
      stage7_shadow_condition_hash: condition.condition_hash,
      stage7_shadow_massing_count: sketches.massing.length
    }
  }, 'stage7-shadow-candidate', architecture);
  const primary = sketches.massing[0];
  const candidateBuildSpec = deriveCandidateBuildSpec({ buildSpec, condition, primary, sketches });
  const candidateNodes = (topology.nodes || []).map((node) => tagNodeWithSpaceSketch(node, sketches.spaces));
  const entryId = candidateNodes.find((node) => node.type === 'entry' || node.id === 'entry')?.id;
  const stage7SiteConnections = entryId
    ? sketches.site.filter((item) => ['path', 'courtyard', 'water'].includes(item.role)).map((item) => ({ from: entryId, to: `stage7-${item.id}`, relation: `conceptual-${item.role}` }))
    : [];
  const stage7SpaceZoneEdges = uniqueSpaceEdges(sketches.spaces);
  const stage7StairHints = sketches.spaces
    .filter((item) => item.role === 'vertical_circulation')
    .map((item) => ({ zone_id: item.id, floor: item.floor, bounds: item.bounds }));
  const candidateCells = new Map(decodeStage7Runs(plan.runs).map((cell) => [keyOf(cell), cell]));
  const validatedEntranceKeys = Array.isArray(plan.summary?.validated_entrance_cells) ? plan.summary.validated_entrance_cells : [];
  if (!validatedEntranceKeys.length) throw new Error('Stage 7 conversion requires validated exterior entrance cells');
  const stage7EntranceHints = validatedEntranceKeys
    .map((key) => candidateCells.get(key))
    .filter(Boolean)
    .map((cell) => ({ side: condition.design?.front_side, grid: { x: cell.x, y: cell.y, z: cell.z } }));
  const candidateTopology = normalizeTopology({
    ...topology,
    nodes: candidateNodes,
    site_connections: [...(topology.site_connections || []), ...stage7SiteConnections],
    bsp_hints: {
      ...(topology.bsp_hints || {}),
      stage7_space_zones: sketches.spaces.map((item) => ({
        id: item.id,
        role: item.role,
        floor: item.floor,
        weight: zoneWeight(item),
        bounds: item.bounds,
        adjacent_zone_ids: item.adjacent_zone_ids
      })),
      stage7_space_zone_edges: stage7SpaceZoneEdges,
      stage7_stair_hints: stage7StairHints,
      stage7_entrance_hints: stage7EntranceHints
    }
  }, 'stage7-shadow-candidate', topology, candidateBuildSpec, { prompt, architecture: candidateArchitecture });

  return {
    source: STAGE7_CONVERTER_SOURCE,
    active: true,
    condition_hash: condition.condition_hash,
    plan_provenance: {
      source: plan.source,
      schema_version: plan.schema_version,
      condition_hash: plan.condition_hash,
      provider: structuredClone(plan.provider),
      run_count: Array.isArray(plan.runs) ? plan.runs.length : 0,
      repair_count: Array.isArray(plan.repairs) ? plan.repairs.length : 0
    },
    architecture: candidateArchitecture,
    buildSpec: candidateBuildSpec,
    topology: candidateTopology,
    sketches,
    warnings: volumes.some((item) => item.boolean_mode === 'subtract')
      ? ['courtyard subtract volume is shadow-only until apply-mode synthesis is implemented']
      : []
  };
}

function volumesFromMassing(sketches, condition) {
  const primary = sketches.massing[0];
  const evidenceTags = provenanceTags(condition);
  const volumes = [{
    id: 'main',
    role: 'Stage 7 primary mass',
    shape: 'box',
    scale: [1, 1, 1],
    placement: { relation: 'center' },
    boolean_mode: 'union',
    tags: ['stage7-shadow', 'primary-mass', ...evidenceTags],
    purpose: 'stage7-primary-building-envelope'
  }];
  for (const item of sketches.massing.slice(1)) {
    volumes.push({
      id: item.id,
      role: `Stage 7 attached mass ${item.id}`,
      shape: 'box',
      scale: relativeScale(item.bounds, primary.bounds),
      placement: { relation: relationToPrimary(item.bounds, primary.bounds), attach_to: 'main' },
      boolean_mode: 'union',
      tags: ['stage7-shadow', 'attached-mass', ...evidenceTags],
      purpose: 'stage7-secondary-building-envelope'
    });
  }
  const courtyard = sketches.site.find((item) => item.role === 'courtyard' && overlaps2d(item.bounds, primary.bounds));
  if (courtyard) {
    volumes.push({
      id: 'stage7-courtyard-void',
      role: 'Stage 7 conceptual courtyard void',
      shape: 'box',
      scale: relativeScale(courtyard.bounds, primary.bounds),
      placement: { relation: 'center', attach_to: 'main' },
      boolean_mode: 'subtract',
      tags: ['stage7-shadow', 'courtyard-void', ...evidenceTags],
      purpose: 'stage7-conceptual-courtyard'
    });
  }
  return volumes;
}

function provenanceTags(condition = {}) {
  return [
    condition.condition_hash ? `stage7-condition:${condition.condition_hash}` : undefined,
    condition.design?.selected_concept_id ? `stage7-concept:${condition.design.selected_concept_id}` : undefined,
    ...(condition.references || []).map((item) => `stage7-reference:${item.case_id}`)
  ].filter(Boolean).sort();
}

function tagNodeWithSpaceSketch(node, spaces) {
  const zone = String(node.zone || node.privacy || 'public');
  const role = node.type === 'stairs' ? 'vertical_circulation' : zone;
  const matches = spaces.filter((item) => item.role === role && Number(item.floor) === Number(node.floor || 0));
  const selected = matches.sort((left, right) => right.cell_count - left.cell_count)[0];
  return {
    ...node,
    tags: [...new Set([...(node.tags || []), ...(selected ? [`stage7-zone:${selected.id}`] : [])])],
    weight: selected ? Math.max(Number(node.weight || 1), zoneWeight(selected)) : node.weight
  };
}

function connectedComponents(cells) {
  const byKey = new Map(cells.map((cell) => [keyOf(cell), cell]));
  const remaining = new Set(byKey.keys());
  const components = [];
  const starts = [...remaining].sort();
  for (const start of starts) {
    if (!remaining.has(start)) continue;
    const queue = [start];
    const group = [];
    remaining.delete(start);
    for (let head = 0; head < queue.length; head += 1) {
      const key = queue[head];
      const cell = byKey.get(key);
      group.push(cell);
      for (const [dx, dy, dz] of NEIGHBORS_6) {
        const neighbour = `${cell.x + dx},${cell.y + dy},${cell.z + dz}`;
        if (!remaining.has(neighbour)) continue;
        remaining.delete(neighbour);
        queue.push(neighbour);
      }
    }
    components.push(group);
  }
  return components;
}

function connectedComponentsByKey(cells, groupKey) {
  const byKey = new Map(cells.map((cell) => [keyOf(cell), cell]));
  const remaining = new Set(byKey.keys());
  const groups = [];
  const starts = [...remaining].sort();
  for (const start of starts) {
    if (!remaining.has(start)) continue;
    const expected = groupKey(byKey.get(start));
    const queue = [start];
    const group = [];
    remaining.delete(start);
    for (let head = 0; head < queue.length; head += 1) {
      const key = queue[head];
      const cell = byKey.get(key);
      group.push(cell);
      for (const [dx, dy, dz] of NEIGHBORS_6) {
        const neighbour = `${cell.x + dx},${cell.y + dy},${cell.z + dz}`;
        if (!remaining.has(neighbour) || groupKey(byKey.get(neighbour)) !== expected) continue;
        remaining.delete(neighbour);
        queue.push(neighbour);
      }
    }
    groups.push(group);
  }
  return groups;
}

function groupedSketches(cells, keyFor, build) {
  const groups = new Map();
  for (const cell of cells) {
    const key = keyFor(cell);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(cell);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, group], index) => build(group, key, index));
}

function deriveCandidateBuildSpec({ buildSpec, condition, primary, sketches }) {
  const baseline = structuredClone(buildSpec);
  const projectedWidth = projectBlocks(size(primary.bounds, 'X'), condition.dimensions?.lot_width);
  const projectedDepth = projectBlocks(size(primary.bounds, 'Z'), condition.dimensions?.lot_depth);
  const floors = boundedPositiveInt(condition.dimensions?.floors, baseline.floors, 1);
  const floorHeight = boundedPositiveInt(condition.dimensions?.floor_height, baseline.floor_height, 3);
  const roofHeight = boundedPositiveInt(baseline.roof_height, baseline.roof_height, 1);
  const totalHeight = Math.min(Number(baseline.total_height || floors * floorHeight + roofHeight), floors * floorHeight + roofHeight);
  const minimumWidth = Math.max(11, Number(baseline.constraints?.min_width || 11));
  const minimumDepth = Math.max(11, Number(baseline.constraints?.min_depth || 11));
  return {
    ...baseline,
    width: boundedPositiveInt(projectedWidth, baseline.width, minimumWidth),
    depth: boundedPositiveInt(projectedDepth, baseline.depth, minimumDepth),
    floors,
    floor_height: floorHeight,
    wall_height: Math.min(Number(baseline.wall_height || floors * floorHeight), floors * floorHeight),
    roof_height: roofHeight,
    total_height: totalHeight,
    door_side: ['north', 'south', 'east', 'west'].includes(condition.design?.front_side) ? condition.design.front_side : baseline.door_side,
    lot: {
      ...structuredClone(baseline.lot || {}),
      width: boundedPositiveInt(condition.dimensions?.lot_width, baseline.lot?.width, 1),
      depth: boundedPositiveInt(condition.dimensions?.lot_depth, baseline.lot?.depth, 1)
    },
    stage7_shadow: {
      source: STAGE7_CONVERTER_SOURCE,
      condition_hash: condition.condition_hash,
      massing_count: sketches.massing.length,
      space_zone_count: sketches.spaces.length,
      site_zone_count: sketches.site.length
    }
  };
}

function uniqueSpaceEdges(spaces) {
  const edges = new Map();
  for (const item of spaces) {
    for (const adjacent of item.adjacent_zone_ids || []) {
      const [from, to] = [item.id, adjacent].sort();
      edges.set(`${from}|${to}`, { from, to, relation: 'shared-boundary' });
    }
  }
  return [...edges.values()].sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to));
}

function sketch(id, role, cells) {
  return { id, role, cell_count: cells.length, bounds: boundsOf(cells) };
}

function boundsOf(cells) {
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const cell of cells) {
    bounds.minX = Math.min(bounds.minX, cell.x);
    bounds.maxX = Math.max(bounds.maxX, cell.x);
    bounds.minY = Math.min(bounds.minY, cell.y);
    bounds.maxY = Math.max(bounds.maxY, cell.y);
    bounds.minZ = Math.min(bounds.minZ, cell.z);
    bounds.maxZ = Math.max(bounds.maxZ, cell.z);
  }
  return bounds;
}

function compareBounds(left, right) {
  return left.minY - right.minY || left.minZ - right.minZ || left.minX - right.minX || left.maxY - right.maxY || left.maxZ - right.maxZ || left.maxX - right.maxX;
}

function relativeScale(bounds, primary) {
  return [
    clampRatio(size(bounds, 'X') / size(primary, 'X'), 0.1, 1.4),
    clampRatio(size(bounds, 'Y') / size(primary, 'Y'), 0.2, 1.6),
    clampRatio(size(bounds, 'Z') / size(primary, 'Z'), 0.1, 1.4)
  ];
}

function relationToPrimary(bounds, primary) {
  const dx = center(bounds, 'X') - center(primary, 'X');
  const dz = center(bounds, 'Z') - center(primary, 'Z');
  if (Math.abs(dx) >= Math.abs(dz)) return dx < 0 ? 'attached-west' : 'attached-east';
  return dz < 0 ? 'attached-north' : 'attached-south';
}

function projectBlocks(gridSize, lotSize) {
  return Math.max(1, Math.round((Number(gridSize) / 64) * Math.max(1, Number(lotSize || 1))));
}

function boundedPositiveInt(value, ceiling, minimum) {
  const upper = Math.max(minimum, Math.trunc(Number(ceiling) || minimum));
  return Math.max(minimum, Math.min(upper, Math.trunc(Number(value) || upper)));
}

function detectedFloorLevels(cells, requestedFloors) {
  const levels = [...new Set(cells.filter((cell) => cell.envelope === 'floor').map((cell) => cell.y))].sort((left, right) => left - right);
  if (levels.length) return levels.slice(0, requestedFloors);
  return Array.from({ length: requestedFloors }, (_, index) => Math.floor((index * 64) / requestedFloors));
}

function floorForY(y, floorLevels) {
  let floor = 0;
  for (let index = 1; index < floorLevels.length; index += 1) {
    if (Number(y) >= floorLevels[index]) floor = index;
  }
  return floor;
}

function zoneWeight(item) {
  return Number(Math.max(0.2, Math.min(3, item.cell_count / 2000)).toFixed(3));
}

function overlaps2d(left, right) {
  return left.minX <= right.maxX && left.maxX >= right.minX && left.minZ <= right.maxZ && left.maxZ >= right.minZ;
}

function size(bounds, axis) {
  return bounds[`max${axis}`] - bounds[`min${axis}`] + 1;
}

function center(bounds, axis) {
  return (bounds[`min${axis}`] + bounds[`max${axis}`]) / 2;
}

function clampRatio(value, min, max) {
  return Number(Math.max(min, Math.min(max, value)).toFixed(4));
}

function keyOf(cell) {
  return `${cell.x},${cell.y},${cell.z}`;
}
```

- [ ] **Step 4: Run converter tests**

Run:

```powershell
node --test test/semanticVoxelProceduralPlan.test.js
```

Expected: PASS, 3 tests, 0 failures.

- [ ] **Step 5: Run repair/converter regressions together**

Run:

```powershell
node --test test/coarseSemanticVoxelRepair.test.js test/semanticVoxelProceduralPlan.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the converter**

```powershell
git add src/construction/learning/semanticVoxelProceduralPlan.js test/semanticVoxelProceduralPlan.test.js
git commit -m "feat: convert stage 7 voxels to procedural plans"
```

---

### Task 6: Artifact Provider, Shadow Orchestration, Reports, and Failure Records

**Files:**
- Create: `src/construction/learning/coarseSemanticVoxelShadow.js`
- Create: `test/coarseSemanticVoxelShadow.test.js`

**Interfaces:**
- Consumes: `off|shadow` mode, `baseline|artifact` provider, optional artifact path, and final semantic pipeline inputs.
- Produces:
  - `STAGE7_SHADOW_SOURCE`
  - `STAGE7_FAILURE_SOURCE`
  - `MAX_STAGE7_ARTIFACT_BYTES`
  - `createArtifactCoarseSemanticVoxelProvider({ artifactPath }) -> provider adapter`
  - `selectCoarseSemanticVoxelProvider(name, options) -> provider adapter`
  - `runCoarseSemanticVoxelShadow(input) -> Promise<shadow result>`
  - `renderCoarseSemanticVoxelShadowReport(result) -> markdown`
  - `compactCoarseSemanticVoxelShadow(result) -> blueprint-safe metadata`
- Depends on: Tasks 2-5.
- Contract: provider and conversion errors become a structured rejection; they never abort normal generation.

- [ ] **Step 1: Write failing shadow-orchestration tests**

Create `test/coarseSemanticVoxelShadow.test.js`:

```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStage7Condition } from '../src/construction/learning/coarseSemanticVoxelCondition.js';
import { generateDeterministicCoarseSemanticVoxelPlan } from '../src/construction/learning/coarseSemanticVoxelBaseline.js';
import {
  MAX_STAGE7_ARTIFACT_BYTES,
  compactCoarseSemanticVoxelShadow,
  createArtifactCoarseSemanticVoxelProvider,
  renderCoarseSemanticVoxelShadowReport,
  runCoarseSemanticVoxelShadow,
  selectCoarseSemanticVoxelProvider
} from '../src/construction/learning/coarseSemanticVoxelShadow.js';

test('Stage 7 off mode returns inactive without constructing shadow artifacts', async () => {
  const result = await runCoarseSemanticVoxelShadow({ ...shadowInput(), mode: 'off' });
  assert.deepEqual(result, {
    source: 'stage7-coarse-semantic-voxel-shadow-v1',
    active: false,
    mode: 'off',
    provider: 'baseline',
    status: 'disabled',
    reason: 'Stage 7 coarse voxel mode is off'
  });
});

test('Stage 7 baseline provider reaches converted shadow status with a readable report', async () => {
  assert.equal(typeof selectCoarseSemanticVoxelProvider('baseline').generate, 'function');
  const result = await runCoarseSemanticVoxelShadow({ ...shadowInput(), mode: 'shadow', provider: 'baseline' });
  const report = renderCoarseSemanticVoxelShadowReport(result);
  const compact = compactCoarseSemanticVoxelShadow(result);

  assert.equal(result.active, true);
  assert.equal(result.status, 'converted');
  assert.equal(result.repair.accepted, true);
  assert.ok(result.rawPlan.runs.length > 0);
  assert.ok(result.repairedPlan.derived_sketches.massing.length > 0);
  assert.equal(result.failureCase, undefined);
    assert.match(report, /# Stage 7 Milestone 1 Coarse Semantic Voxel Shadow/);
    assert.match(report, /Status: converted/);
    assert.match(report, /## Semantic Layers/);
    assert.match(report, /## Reference Evidence/);
    assert.match(report, /## Conflicts/);
    assert.match(report, /## Conversion Decision/);
  assert.equal(compact.condition_hash, result.condition.condition_hash);
  assert.equal(Object.hasOwn(compact, 'rawPlan'), false);
});

test('Stage 7 artifact provider accepts a matching canonical artifact', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-artifact-provider-'));
  try {
    const input = shadowInput();
    const condition = buildStage7Condition(input);
    const artifact = generateDeterministicCoarseSemanticVoxelPlan({ condition });
    artifact.provider = { kind: 'artifact', name: 'external-stage7-fixture', model_version: null, dataset_version: null };
    const artifactPath = path.join(root, 'plan.json');
    await fs.writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    assert.equal(typeof createArtifactCoarseSemanticVoxelProvider({ artifactPath }).generate, 'function');

    const result = await runCoarseSemanticVoxelShadow({ ...input, mode: 'shadow', provider: 'artifact', artifactPath });
    assert.equal(result.status, 'converted');
    assert.equal(result.rawPlan.provider.name, 'external-stage7-fixture');
    assert.equal(result.condition.condition_hash, artifact.condition_hash);
    assert.match(result.providerProvenance.sha256, /^[a-f0-9]{64}$/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Stage 7 artifact failures become reproducible rejections instead of thrown workflow errors', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-artifact-rejection-'));
  try {
    const input = shadowInput();
    const condition = buildStage7Condition(input);
    const artifact = generateDeterministicCoarseSemanticVoxelPlan({ condition });
    artifact.condition_hash = 'wrong-condition';
    const artifactPath = path.join(root, 'wrong.json');
    await fs.writeFile(artifactPath, `${JSON.stringify(artifact)}\n`, 'utf8');
    const malformedPath = path.join(root, 'malformed.json');
    await fs.writeFile(malformedPath, '{"source":', 'utf8');

    const mismatch = await runCoarseSemanticVoxelShadow({ ...input, mode: 'shadow', provider: 'artifact', artifactPath });
    const missing = await runCoarseSemanticVoxelShadow({ ...input, mode: 'shadow', provider: 'artifact', artifactPath: path.join(root, 'missing.json') });
    const malformed = await runCoarseSemanticVoxelShadow({ ...input, mode: 'shadow', provider: 'artifact', artifactPath: malformedPath });
    assert.equal(mismatch.status, 'rejected');
    assert.ok(mismatch.failureCase.blockers.some((item) => /condition hash mismatch/.test(item.message)));
    assert.equal(missing.status, 'rejected');
    assert.match(missing.failureCase.provider_error, /ENOENT|Could not read Stage 7 artifact/);
    assert.equal(malformed.status, 'rejected');
    assert.match(malformed.failureCase.provider_error, /Could not parse Stage 7 artifact/);
    assert.equal(malformed.failureCase.failure_stage, 'provider');
    assert.match(malformed.failureCase.artifact.sha256, /^[a-f0-9]{64}$/);
    assert.equal(malformed.failureCase.artifact.malformed_excerpt, '{"source":');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Stage 7 artifact provider rejects files larger than 32 MiB before parsing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-artifact-size-'));
  try {
    const artifactPath = path.join(root, 'oversized.json');
    await fs.writeFile(artifactPath, '{}', 'utf8');
    await fs.truncate(artifactPath, MAX_STAGE7_ARTIFACT_BYTES + 1);
    const result = await runCoarseSemanticVoxelShadow({ ...shadowInput(), mode: 'shadow', provider: 'artifact', artifactPath });
    assert.equal(result.status, 'rejected');
    assert.match(result.failureCase.provider_error, /exceeds 33554432 bytes/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function shadowInput() {
  return {
    prompt: '建一个带庭院和花园的两层日式住宅',
    seed: 7101,
    architecture: {
      source: 'fallback',
      style: '日式',
      style_family: 'japanese',
      typology: 'house',
      footprint: 'courtyard',
      materials: { wall: 'minecraft:stripped_birch_wood', floor: 'minecraft:bamboo_planks' },
      volumes: [{ id: 'main', role: '主体', shape: 'box', scale: [1, 1, 1], placement: { relation: 'center' }, boolean_mode: 'union' }],
      envelope_rules: {},
      facade_rules: { front_side: 'south' },
      roof_rules: {},
      site_rules: { enclosed_courtyard: true, planting_beds: true },
      massing_rules: { creative_variant: 'courtyard' },
      structural_rules: {},
      detail_rules: {},
      generation_hints: {}
    },
    buildSpec: {
      width: 25,
      depth: 23,
      floors: 2,
      floor_height: 5,
      wall_height: 10,
      roof_height: 4,
      total_height: 14,
      door_side: 'south',
      lot: { width: 31, depth: 34 },
      constraints: { max_total_height: 40, minecraft_fill_limit: 32768 }
    },
    topology: {
      source: 'fallback',
      nodes: [
        { id: 'entry', label: '入口', type: 'entry', floor: 0, weight: 0.8, privacy: 'public', zone: 'public' },
        { id: 'living', label: '起居', type: 'living', floor: 0, weight: 1.4, privacy: 'public', zone: 'public' },
        { id: 'bedroom', label: '卧室', type: 'bedroom', floor: 1, weight: 1.2, privacy: 'private', zone: 'private' },
        { id: 'stairs', label: '楼梯', type: 'stairs', floor: 0, weight: 0.8, privacy: 'circulation', zone: 'circulation' }
      ],
      edges: [{ from: 'entry', to: 'living', relation: 'connected' }, { from: 'living', to: 'stairs', relation: 'connected' }, { from: 'stairs', to: 'bedroom', relation: 'vertical' }],
      circulation_rules: { entry_node: 'entry' },
      bsp_hints: { split_strategy: 'weighted' },
      site_connections: []
    },
    creativeDesign: {
      design_axes: { massing_variant: 'courtyard', split_strategy: 'weighted' },
      topology: { public_core_position: 'center' },
      site: { planting_beds: true }
    },
    conceptStudio: {
      selected_concept_id: 'concept-courtyard',
      selectedConcept: { id: 'concept-courtyard', massing_plan: { variant_hint: 'courtyard' }, quality_targets: ['clear-entry'] }
    },
    templateKnowledge: { retrieval_explanation: { references: [] } }
  };
}
```

- [ ] **Step 2: Run the shadow test to verify it fails**

Run:

```powershell
node --test test/coarseSemanticVoxelShadow.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `coarseSemanticVoxelShadow.js`.

- [ ] **Step 3: Implement the provider and shadow orchestrator**

Create `src/construction/learning/coarseSemanticVoxelShadow.js`:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildStage7Condition } from './coarseSemanticVoxelCondition.js';
import { deterministicCoarseSemanticVoxelProvider } from './coarseSemanticVoxelBaseline.js';
import { repairCoarseSemanticVoxelPlan } from './coarseSemanticVoxelRepair.js';
import { hashCanonicalValue } from './coarseSemanticVoxelSchema.js';
import { convertSemanticVoxelPlanToProceduralPlan } from './semanticVoxelProceduralPlan.js';

export const STAGE7_SHADOW_SOURCE = 'stage7-coarse-semantic-voxel-shadow-v1';
export const STAGE7_FAILURE_SOURCE = 'stage7-coarse-semantic-voxel-failure-v1';
export const MAX_STAGE7_ARTIFACT_BYTES = 32 * 1024 * 1024;

export function createArtifactCoarseSemanticVoxelProvider({ artifactPath } = {}) {
  return Object.freeze({
    id: 'artifact',
    async generate({ options = {} } = {}) {
      return readArtifact(options.artifactPath || artifactPath);
    }
  });
}

export function selectCoarseSemanticVoxelProvider(name, options = {}) {
  if (name === 'baseline') return deterministicCoarseSemanticVoxelProvider;
  if (name === 'artifact') return createArtifactCoarseSemanticVoxelProvider(options);
  throw new Error(`unsupported Milestone 1 coarse voxel provider: ${name}`);
}

export async function runCoarseSemanticVoxelShadow({
  mode = 'off',
  provider = 'baseline',
  artifactPath,
  prompt = '',
  seed,
  architecture = {},
  buildSpec = {},
  topology = {},
  creativeDesign = {},
  conceptStudio = {},
  templateKnowledge = {}
} = {}) {
  if (mode === 'off') {
    return {
      source: STAGE7_SHADOW_SOURCE,
      active: false,
      mode: 'off',
      provider: 'baseline',
      status: 'disabled',
      reason: 'Stage 7 coarse voxel mode is off'
    };
  }

  const input = { prompt, seed, architecture, buildSpec, topology, creativeDesign, conceptStudio, templateKnowledge };
  let condition;
  let rawPlan;
  let repair;
  let failureStage = 'condition';
  try {
    condition = buildStage7Condition(input);
    if (mode !== 'shadow') throw new Error(`unsupported Milestone 1 coarse voxel mode: ${mode}`);
    failureStage = 'provider';
    const providerAdapter = selectCoarseSemanticVoxelProvider(provider, { artifactPath });
    rawPlan = await providerAdapter.generate({ condition, seed, options: { artifactPath } });
    failureStage = 'semantic-validation';
    repair = repairCoarseSemanticVoxelPlan({ plan: rawPlan, condition });
    if (!repair.accepted) {
      return rejectedResult({ mode, provider, condition, prompt, seed, artifactPath, rawPlan, repair, failureStage });
    }
    failureStage = 'conversion';
    const candidate = convertSemanticVoxelPlanToProceduralPlan({ plan: repair.plan, condition, architecture, buildSpec, topology, prompt });
    const repairedPlan = { ...structuredClone(repair.plan), derived_sketches: candidate.sketches };
    const result = {
      source: STAGE7_SHADOW_SOURCE,
      active: true,
      mode,
      provider,
      providerProvenance: rawPlan.__stage7ArtifactProvenance || {
        provider_name: rawPlan.provider?.name,
        model_version: rawPlan.provider?.model_version ?? null,
        dataset_version: rawPlan.provider?.dataset_version ?? null
      },
      status: 'converted',
      condition,
      rawPlan,
      repairedPlan,
      repair,
      candidate,
      failureCase: undefined,
      warnings: [...new Set([...(repair.warnings || []), ...(candidate.warnings || [])])]
    };
    return { ...result, report: renderCoarseSemanticVoxelShadowReport(result) };
  } catch (error) {
    return rejectedResult({ mode, provider, condition, prompt, seed, artifactPath, rawPlan, repair, error, failureStage });
  }
}

export function compactCoarseSemanticVoxelShadow(result = {}) {
  if (!result.active) return undefined;
  return {
    source: result.source,
    active: true,
    mode: result.mode,
    provider: result.provider,
    status: result.status,
    condition_hash: result.condition?.condition_hash,
    artifact_sha256: result.providerProvenance?.sha256,
    selected_concept_id: result.condition?.design?.selected_concept_id,
    reference_ids: (result.condition?.references || []).map((item) => item.case_id),
    raw_run_count: result.rawPlan?.runs?.length || 0,
    repaired_run_count: result.repairedPlan?.runs?.length || 0,
    repair_count: result.repair?.repairs?.length || 0,
    blocker_count: result.repair?.blockers?.length || result.failureCase?.blockers?.length || 0,
    massing_count: result.candidate?.sketches?.massing?.length || 0,
    space_zone_count: result.candidate?.sketches?.spaces?.length || 0,
    site_zone_count: result.candidate?.sketches?.site?.length || 0,
    warnings: result.warnings || [],
    fallback: result.status === 'rejected' ? 'primary-build-unchanged' : 'not-needed'
  };
}

export function renderCoarseSemanticVoxelShadowReport(result = {}) {
  const condition = result.condition || {};
  const repair = result.repair || {};
  const sketches = result.candidate?.sketches || { massing: [], spaces: [], site: [] };
  const blockers = repair.blockers?.length ? repair.blockers : result.failureCase?.blockers || [];
  const conflicts = repair.conflicts || [];
  const summary = result.repairedPlan?.summary || {};
  const repairRows = (repair.repairs || []).map((item) => `- ${item.reason}: ${item.cells.length} cell(s)`).join('\n') || '- none';
  const blockerRows = blockers.map((item) => `- ${item.id}: ${item.message}`).join('\n') || '- none';
  const conflictRows = conflicts.map((item) => `- ${item.id} [${item.severity}]: ${item.message}`).join('\n') || '- none';
  const referenceRows = (condition.references || []).map((item) => `- ${item.case_id}: ${(item.used_for || []).join(', ') || 'unspecified'}`).join('\n') || '- none';
  return `# Stage 7 Milestone 1 Coarse Semantic Voxel Shadow

- Mode: ${result.mode || 'off'}
- Provider: ${result.provider || 'baseline'}
- Status: ${result.status || 'unknown'}
- Condition hash: ${condition.condition_hash || 'not-created'}
- Artifact sha256: ${result.providerProvenance?.sha256 || result.failureCase?.artifact?.sha256 || 'not-applicable'}
- Selected concept: ${condition.design?.selected_concept_id || 'none'}
- References: ${(condition.references || []).map((item) => item.case_id).join(', ') || 'none'}
- Raw runs: ${result.rawPlan?.runs?.length || 0}
- Repaired runs: ${result.repairedPlan?.runs?.length || 0}
- Massing sketches: ${sketches.massing.length}
- Space sketches: ${sketches.spaces.length}
- Site sketches: ${sketches.site.length}
- Primary geometry changed: no

## Semantic Layers

- Envelope: ${JSON.stringify(summary.envelope_counts || {})}
- Space: ${JSON.stringify(summary.space_counts || {})}
- Site: ${JSON.stringify(summary.site_counts || {})}
- Mean confidence: ${summary.mean_confidence ?? 'not-available'}

## Reference Evidence

${referenceRows}

## Conflicts

${conflictRows}

## Repairs

${repairRows}

## Blockers

${blockerRows}

## Warnings

${(result.warnings || []).map((item) => `- ${item}`).join('\n') || '- none'}

## Conversion Decision

- Result: ${result.status === 'converted' ? 'candidate semantic inputs exported for shadow review' : `rejected during ${result.failureCase?.failure_stage || 'unknown stage'}`}
- Candidate applied to primary geometry: no
`;
}

async function readArtifact(artifactPath) {
  if (!artifactPath) throw new Error('Stage 7 artifact provider requires an artifact path');
  const absolutePath = path.resolve(artifactPath);
  let stats;
  try {
    stats = await fs.stat(absolutePath);
  } catch (error) {
    throw new Error(`Could not read Stage 7 artifact: ${error.message}`);
  }
  if (stats.size > MAX_STAGE7_ARTIFACT_BYTES) {
    const error = new Error(`Stage 7 artifact exceeds ${MAX_STAGE7_ARTIFACT_BYTES} bytes`);
    error.artifact = { path: absolutePath, byte_size: stats.size };
    throw error;
  }
  const text = await fs.readFile(absolutePath, 'utf8');
  const artifact = {
    path: absolutePath,
    byte_size: stats.size,
    sha256: createHash('sha256').update(text).digest('hex')
  };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      const error = new Error('Stage 7 artifact root must be an object');
      error.artifact = artifact;
      throw error;
    }
    Object.defineProperty(parsed, '__stage7ArtifactProvenance', { value: artifact, enumerable: false });
    return parsed;
  } catch (error) {
    if (error.artifact) throw error;
    const wrapped = new Error(`Could not parse Stage 7 artifact: ${error.message}`);
    wrapped.artifact = {
      ...artifact,
      malformed_excerpt: text.slice(0, 4096)
    };
    throw wrapped;
  }
}

function rejectedResult({ mode, provider, condition, prompt, seed, artifactPath, rawPlan, repair, error, failureStage } = {}) {
  const blockers = repair?.blockers?.length
    ? repair.blockers
    : [{ id: 'provider-or-converter-error', severity: 'blocker', message: String(error?.message || 'Stage 7 shadow rejected') }];
  const artifact = error?.artifact || rawPlan?.__stage7ArtifactProvenance || (artifactPath ? { path: path.resolve(artifactPath) } : undefined);
  const retainRawPlan = provider === 'baseline' || repair?.validation?.ok ? rawPlan : undefined;
  const failureCase = {
    source: STAGE7_FAILURE_SOURCE,
    prompt: String(prompt || ''),
    seed,
    condition_hash: condition?.condition_hash,
    dimensions: structuredClone(condition?.dimensions || {}),
    selected_concept_id: condition?.design?.selected_concept_id,
    reference_ids: (condition?.references || []).map((item) => item.case_id),
    provider,
    provider_name: safeString(rawPlan?.provider?.name),
    provider_metadata: safeProviderMetadata(rawPlan?.provider),
    artifact,
    failure_stage: failureStage || 'unknown',
    schema_source: safeString(rawPlan?.source),
    schema_version: Number.isInteger(rawPlan?.schema_version) ? rawPlan.schema_version : undefined,
    raw_plan_hash: artifact?.sha256 || safeCanonicalHash(retainRawPlan),
    model_version: safeString(rawPlan?.provider?.model_version) ?? null,
    dataset_version: safeString(rawPlan?.provider?.dataset_version) ?? null,
    checkpoint_version: safeString(rawPlan?.provider?.checkpoint_version) ?? null,
    provider_error: error?.message,
    schema_errors: repair?.validation?.errors || [],
    conflicts: repair?.conflicts || [],
    repairs: repair?.repairs || [],
    conversion_result: failureStage === 'conversion'
      ? { status: 'failed', message: error?.message || 'conversion failed' }
      : { status: 'not-run' },
    blockers,
    fallback: 'primary-build-unchanged'
  };
  const result = {
    source: STAGE7_SHADOW_SOURCE,
    active: true,
    mode,
    provider,
    status: 'rejected',
    condition,
    rawPlan: retainRawPlan,
    rawArtifactSource: artifact?.path && Number.isFinite(artifact.byte_size) && artifact.byte_size <= MAX_STAGE7_ARTIFACT_BYTES ? artifact.path : undefined,
    repairedPlan: repair?.plan,
    repair,
    candidate: undefined,
    failureCase,
    warnings: [...new Set([...(repair?.warnings || []), error?.message].filter(Boolean))]
  };
  return { ...result, report: renderCoarseSemanticVoxelShadowReport(result) };
}

function safeCanonicalHash(value) {
  if (!value || typeof value !== 'object') return undefined;
  try {
    return hashCanonicalValue(value);
  } catch {
    return undefined;
  }
}

function safeProviderMetadata(provider) {
  return {
    kind: safeString(provider?.kind),
    name: safeString(provider?.name),
    model_version: safeString(provider?.model_version) ?? null,
    dataset_version: safeString(provider?.dataset_version) ?? null,
    checkpoint_version: safeString(provider?.checkpoint_version) ?? null
  };
}

function safeString(value) {
  return typeof value === 'string' ? value : undefined;
}
```

- [ ] **Step 4: Run shadow-orchestration tests**

Run:

```powershell
node --test test/coarseSemanticVoxelShadow.test.js
```

Expected: PASS, 5 tests, 0 failures.

- [ ] **Step 5: Run all Stage 7 module tests**

Run:

```powershell
node --test test/coarseSemanticVoxelSchema.test.js test/coarseSemanticVoxelCondition.test.js test/coarseSemanticVoxelBaseline.test.js test/coarseSemanticVoxelRepair.test.js test/semanticVoxelProceduralPlan.test.js test/coarseSemanticVoxelShadow.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the shadow boundary**

```powershell
git add src/construction/learning/coarseSemanticVoxelShadow.js test/coarseSemanticVoxelShadow.test.js
git commit -m "feat: add stage 7 coarse voxel shadow mode"
```

---

### Task 7: Workflow/Pipeline Integration, Shadow Artifacts, and Fixed-Seed Parity

**Files:**
- Create: `test/stage7Pipeline.test.js`
- Modify: `src/construction/workflow.js:1-55, 97-106, 144-175, 241-272, 310-363, 539-620, 814-872, 907-1130`
- Modify: `src/pipeline.js:12-110, 138-154`

**Interfaces:**
- Consumes: `coarseVoxelMode`, `coarseVoxelProvider`, and `coarseVoxelPlan` programmatic options.
- Produces:
  - Full `result.stage7` only when shadow mode is active.
  - Compact `blueprint.stage7` only when shadow mode is active.
  - Artifact paths `stage7Condition`, `stage7RawPlan`, `stage7RepairedPlan`, `stage7Report`, `stage7Candidate`, and optional `stage7FailureCase`.
- Depends on: `runCoarseSemanticVoxelShadow` and `compactCoarseSemanticVoxelShadow` from Task 6.
- Contract: `off` and `shadow` have identical ordered primary `blueprint.operations` for the same prompt and seed.

- [ ] **Step 1: Write failing pipeline parity and artifact tests**

Create `test/stage7Pipeline.test.js`:

```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runCandidatePipeline, runPipeline } from '../src/pipeline.js';

const PROMPT = '建一个湖边现代两层别墅，带大玻璃、水边平台、庭院和精致内饰';

test('Stage 7 defaults off and explicit off preserve exact fixed-seed operations', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-off-parity-'));
  try {
    const baseline = await runFixture(path.join(root, 'baseline'));
    const explicitOff = await runFixture(path.join(root, 'explicit-off'), { coarseVoxelMode: 'off' });
    assert.deepEqual(explicitOff.blueprint.operations, baseline.blueprint.operations);
    assert.equal(baseline.stage7, undefined);
    assert.equal(explicitOff.stage7, undefined);
    assert.equal(baseline.blueprint.stage7, undefined);
    assert.equal(explicitOff.artifacts.stage7Condition, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Stage 7 baseline shadow writes review artifacts without changing primary operations', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-shadow-parity-'));
  try {
    const baseline = await runFixture(path.join(root, 'baseline'));
    const shadow = await runFixture(path.join(root, 'shadow'), {
      coarseVoxelMode: 'shadow',
      coarseVoxelProvider: 'baseline'
    });
    assert.equal(shadow.validation.ok, true);
    assert.equal(shadow.stage7.status, 'converted');
    assert.equal(shadow.blueprint.stage7.status, 'converted');
    assert.deepEqual(shadow.blueprint.operations, baseline.blueprint.operations);
    for (const key of ['stage7Condition', 'stage7RawPlan', 'stage7RepairedPlan', 'stage7Report', 'stage7Candidate']) {
      assert.ok(shadow.artifacts[key], `missing artifact ${key}`);
      await fs.access(shadow.artifacts[key]);
    }
    assert.equal(shadow.artifacts.stage7FailureCase, undefined);
    const report = await fs.readFile(shadow.artifacts.report, 'utf8');
    const stage7Report = await fs.readFile(shadow.artifacts.stage7Report, 'utf8');
    const savedBlueprint = JSON.parse(await fs.readFile(shadow.artifacts.blueprint, 'utf8'));
    assert.match(report, /## Stage 7 Milestone 1 Shadow/);
    assert.match(stage7Report, /Primary geometry changed: no/);
    assert.equal(savedBlueprint.stage7.condition_hash, shadow.stage7.condition.condition_hash);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a matching external artifact reaches converted status through the full pipeline', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-valid-artifact-pipeline-'));
  try {
    const baseline = await runFixture(path.join(root, 'baseline'), {
      coarseVoxelMode: 'shadow',
      coarseVoxelProvider: 'baseline'
    });
    const artifact = await runFixture(path.join(root, 'artifact'), {
      coarseVoxelMode: 'shadow',
      coarseVoxelProvider: 'artifact',
      coarseVoxelPlan: baseline.artifacts.stage7RawPlan
    });
    assert.equal(artifact.stage7.status, 'converted');
    assert.equal(artifact.stage7.condition.condition_hash, baseline.stage7.condition.condition_hash);
    assert.deepEqual(artifact.blueprint.operations, baseline.blueprint.operations);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Stage 7 invalid artifacts record failure while the normal build succeeds unchanged', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-rejected-pipeline-'));
  try {
    const artifactPath = path.join(root, 'invalid-plan.json');
    await fs.writeFile(artifactPath, '{"source":"wrong"}\n', 'utf8');
    const baseline = await runFixture(path.join(root, 'baseline'));
    const rejected = await runFixture(path.join(root, 'rejected'), {
      coarseVoxelMode: 'shadow',
      coarseVoxelProvider: 'artifact',
      coarseVoxelPlan: artifactPath
    });
    assert.equal(rejected.validation.ok, true);
    assert.equal(rejected.stage7.status, 'rejected');
    assert.equal(rejected.blueprint.stage7.fallback, 'primary-build-unchanged');
    assert.deepEqual(rejected.blueprint.operations, baseline.blueprint.operations);
    assert.ok(rejected.artifacts.stage7FailureCase);
    const failure = JSON.parse(await fs.readFile(rejected.artifacts.stage7FailureCase, 'utf8'));
    assert.equal(failure.fallback, 'primary-build-unchanged');
    assert.ok(failure.blockers.length > 0);
    assert.equal(failure.baseline_artifact_paths.blueprint, 'blueprint.json');
    assert.equal(failure.baseline_artifact_paths.run_report, 'run_report.md');
    assert.equal(failure.diagnostic_artifact_paths.raw_plan, 'stage7_coarse_semantic_plan.raw.json');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('deep unknown artifact fields reject without recursive hashing or raw-plan serialization crashes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-deep-artifact-pipeline-'));
  try {
    const baseline = await runFixture(path.join(root, 'baseline'), {
      coarseVoxelMode: 'shadow',
      coarseVoxelProvider: 'baseline'
    });
    const canonical = (await fs.readFile(baseline.artifacts.stage7RawPlan, 'utf8')).trim();
    const nested = `${'{"x":'.repeat(5000)}0${'}'.repeat(5000)}`;
    const artifactPath = path.join(root, 'deep-unknown.json');
    await fs.writeFile(artifactPath, `${canonical.slice(0, -1)},"unknown":${nested}}\n`, 'utf8');

    const rejected = await runFixture(path.join(root, 'rejected'), {
      coarseVoxelMode: 'shadow',
      coarseVoxelProvider: 'artifact',
      coarseVoxelPlan: artifactPath
    });
    assert.equal(rejected.validation.ok, true);
    assert.equal(rejected.stage7.status, 'rejected');
    assert.deepEqual(rejected.blueprint.operations, baseline.blueprint.operations);
    assert.equal(rejected.stage7.rawPlan, undefined);
    assert.match(rejected.stage7.failureCase.raw_plan_hash, /^[a-f0-9]{64}$/);
    assert.ok(rejected.stage7.failureCase.blockers.some((item) => /unknown Stage 7 plan field: unknown/.test(item.message)));
    assert.ok(rejected.artifacts.stage7RawPlan);
    assert.equal(await fs.readFile(rejected.artifacts.stage7RawPlan, 'utf8'), await fs.readFile(artifactPath, 'utf8'));

    const providerArtifactPath = path.join(root, 'deep-provider-unknown.json');
    const providerToken = '"provider": {';
    assert.ok(canonical.includes(providerToken));
    await fs.writeFile(providerArtifactPath, `${canonical.replace(providerToken, `${providerToken}\n    "junk": ${nested},`)}\n`, 'utf8');
    const providerRejected = await runFixture(path.join(root, 'provider-rejected'), {
      coarseVoxelMode: 'shadow',
      coarseVoxelProvider: 'artifact',
      coarseVoxelPlan: providerArtifactPath
    });
    assert.equal(providerRejected.stage7.status, 'rejected');
    assert.equal(providerRejected.stage7.rawPlan, undefined);
    assert.deepEqual(providerRejected.blueprint.operations, baseline.blueprint.operations);
    assert.ok(providerRejected.stage7.failureCase.blockers.some((item) => /unknown provider field: junk/.test(item.message)));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('candidate pipeline forwards Stage 7 shadow options to candidate runs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-candidate-pipeline-'));
  try {
    const result = await runPipeline({
      prompt: PROMPT,
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(root, 'out'),
      cwd: process.cwd(),
      seed: 7101,
      candidates: 2,
      candidateTargetScore: 100,
      candidateForceRounds: true,
      concepts: 2,
      coarseVoxelMode: 'shadow',
      coarseVoxelProvider: 'baseline'
    });
    assert.equal(result.candidateSelection.active, true);
    assert.equal(result.stage7.active, true);
    assert.equal(result.stage7.status, 'converted');
    assert.ok(result.artifacts.stage7Report);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('artifact provider rejects multi-candidate execution because one plan has one condition hash', async () => {
  const input = {
      prompt: PROMPT,
      mode: 'mock',
      mcVersion: '1.21',
      outRoot: path.join(os.tmpdir(), 'stage7-artifact-multi-invalid'),
      cwd: process.cwd(),
      seed: 7101,
      candidates: 2,
      coarseVoxelMode: 'shadow',
      coarseVoxelProvider: 'artifact',
      coarseVoxelPlan: 'fixture.json'
  };
  await assert.rejects(
    runPipeline(input),
    /artifact provider supports exactly one candidate and one round/
  );
  await assert.rejects(
    runCandidatePipeline(input),
    /artifact provider supports exactly one candidate and one round/
  );
});

function runFixture(outRoot, stage7 = {}) {
  return runPipeline({
    prompt: PROMPT,
    mode: 'mock',
    mcVersion: '1.21',
    outRoot,
    cwd: process.cwd(),
    seed: 7101,
    concepts: 3,
    conceptStrategy: 'select',
    ...stage7
  });
}
```

- [ ] **Step 2: Run the pipeline test to verify it fails**

Run:

```powershell
node --test test/stage7Pipeline.test.js
```

Expected: FAIL because Stage 7 options and artifacts are not connected to the pipeline.

- [ ] **Step 3: Thread Stage 7 options through single and candidate pipelines**

In both `runPipeline` and `runCandidatePipeline` parameter lists in `src/pipeline.js`, add:

```js
  coarseVoxelMode = 'off',
  coarseVoxelProvider = 'baseline',
  coarseVoxelPlan,
```

Immediately after `candidateCount` and `roundCount` are derived in both `runPipeline` and the directly exported `runCandidatePipeline`, call:

```js
  assertStage7CandidateCompatibility({ coarseVoxelMode, coarseVoxelProvider, candidateCount, roundCount });
```

Add this shared helper near the other pipeline option normalizers:

```js
function assertStage7CandidateCompatibility({ coarseVoxelMode, coarseVoxelProvider, candidateCount, roundCount }) {
  if (coarseVoxelMode === 'shadow' && coarseVoxelProvider === 'artifact' && (candidateCount > 1 || roundCount > 1)) {
    throw new Error('Stage 7 M1 artifact provider supports exactly one candidate and one round because each plan is bound to one condition hash.');
  }
}
```

Add these fields to the `runCandidatePipeline` call made by `runPipeline`:

```js
      coarseVoxelMode,
      coarseVoxelProvider,
      coarseVoxelPlan,
```

Add these fields to the direct `runConstructionWorkflow` call in `runPipeline`:

```js
    coarseVoxelMode,
    coarseVoxelProvider,
    coarseVoxelPlan,
```

Add these fields to every candidate `runConstructionWorkflow` call inside `runCandidatePipeline`:

```js
          coarseVoxelMode,
          coarseVoxelProvider,
          coarseVoxelPlan,
```

- [ ] **Step 4: Run Stage 7 shadow immediately after final CreativeDesign semantics**

Add this import to `src/construction/workflow.js`:

```js
import {
  compactCoarseSemanticVoxelShadow,
  runCoarseSemanticVoxelShadow
} from './learning/coarseSemanticVoxelShadow.js';
```

Extend `runConstructionWorkflow` parameters after `neuralRetrieval`:

```js
  neuralRetrieval = false,
  coarseVoxelMode = 'off',
  coarseVoxelProvider = 'baseline',
  coarseVoxelPlan
```

Immediately after `applyCreativeDesign` and before `summarizeLlmUsage`, insert:

```js
  const stage7Shadow = await runCoarseSemanticVoxelShadow({
    mode: coarseVoxelMode,
    provider: coarseVoxelProvider,
    artifactPath: coarseVoxelPlan,
    prompt,
    seed,
    architecture,
    buildSpec,
    topology,
    creativeDesign,
    conceptStudio,
    templateKnowledge
  });
```

Pass `stage7Shadow` into both `buildBlueprint` calls, immediately after `conceptStudio`:

```js
    stage7Shadow,
```

Extend the `buildBlueprint` signature to accept `stage7Shadow`, then add this field immediately after compact Concept Studio metadata:

```js
    ...(stage7Shadow?.active ? { stage7: compactCoarseSemanticVoxelShadow(stage7Shadow) } : {}),
```

Pass `stage7Shadow` to `exportArtifacts`:

```js
    stage7Shadow,
```

Add full shadow state to the returned workflow result immediately after Concept Studio state:

```js
    ...(stage7Shadow?.active ? { stage7: stage7Shadow } : {}),
```

- [ ] **Step 5: Persist Stage 7 artifacts without changing datapack export**

Extend the `exportArtifacts` signature in `src/construction/workflow.js` with `stage7Shadow`.

After the Critic Council path declarations, add:

```js
  const stage7ConditionPath = stage7Shadow?.condition ? path.join(outputDir, 'stage7_condition.json') : undefined;
  const stage7RawPlanPath = stage7Shadow?.rawPlan || stage7Shadow?.rawArtifactSource ? path.join(outputDir, 'stage7_coarse_semantic_plan.raw.json') : undefined;
  const stage7RepairedPlanPath = stage7Shadow?.repairedPlan ? path.join(outputDir, 'stage7_coarse_semantic_plan.repaired.json') : undefined;
  const stage7ReportPath = stage7Shadow?.active ? path.join(outputDir, 'stage7_coarse_semantic_report.md') : undefined;
  const stage7CandidatePath = stage7Shadow?.candidate ? path.join(outputDir, 'stage7_procedural_candidate.json') : undefined;
  const stage7FailureCasePath = stage7Shadow?.failureCase ? path.join(outputDir, 'stage7_failure_case.json') : undefined;
```

After existing optional Concept Studio and Critic Council writes, add:

```js
  if (stage7ConditionPath) await writeJson(stage7ConditionPath, stage7Shadow.condition);
  if (stage7RawPlanPath && stage7Shadow.rawPlan) await writeJson(stage7RawPlanPath, stage7Shadow.rawPlan);
  else if (stage7RawPlanPath && stage7Shadow.rawArtifactSource) await fs.copyFile(stage7Shadow.rawArtifactSource, stage7RawPlanPath);
  if (stage7RepairedPlanPath) await writeJson(stage7RepairedPlanPath, stage7Shadow.repairedPlan);
  if (stage7ReportPath) await fs.writeFile(stage7ReportPath, stage7Shadow.report, 'utf8');
  if (stage7CandidatePath) await writeJson(stage7CandidatePath, stage7Shadow.candidate);
  if (stage7FailureCasePath) {
    await writeJson(stage7FailureCasePath, {
      ...stage7Shadow.failureCase,
      baseline_artifact_paths: {
        blueprint: path.relative(outputDir, blueprintPath),
        run_report: path.relative(outputDir, reportPath),
        datapack: path.relative(outputDir, datapackDir)
      },
      diagnostic_artifact_paths: {
        condition: stage7ConditionPath ? path.relative(outputDir, stage7ConditionPath) : undefined,
        raw_plan: stage7RawPlanPath ? path.relative(outputDir, stage7RawPlanPath) : undefined,
        repaired_plan: stage7RepairedPlanPath ? path.relative(outputDir, stage7RepairedPlanPath) : undefined,
        stage7_report: stage7ReportPath ? path.relative(outputDir, stage7ReportPath) : undefined
      }
    });
  }
```

Add these conditional fields to the artifact return object:

```js
    ...(stage7ConditionPath ? { stage7Condition: stage7ConditionPath } : {}),
    ...(stage7RawPlanPath ? { stage7RawPlan: stage7RawPlanPath } : {}),
    ...(stage7RepairedPlanPath ? { stage7RepairedPlan: stage7RepairedPlanPath } : {}),
    ...(stage7ReportPath ? { stage7Report: stage7ReportPath } : {}),
    ...(stage7CandidatePath ? { stage7Candidate: stage7CandidatePath } : {}),
    ...(stage7FailureCasePath ? { stage7FailureCase: stage7FailureCasePath } : {}),
```

- [ ] **Step 6: Add compact Stage 7 state to the main run report**

Near `renderConceptStudioSection` and `renderCriticCouncilSection`, add:

```js
function renderStage7ShadowSection(blueprint = {}) {
  const stage7 = blueprint.stage7;
  if (!stage7?.active) return '';
  return `## Stage 7 Milestone 1 Shadow

- Mode: ${stage7.mode}
- Provider: ${stage7.provider}
- Status: ${stage7.status}
- Condition hash: ${stage7.condition_hash}
- Artifact sha256: ${stage7.artifact_sha256 || 'not-applicable'}
- Selected concept: ${stage7.selected_concept_id || 'none'}
- References: ${(stage7.reference_ids || []).join(', ') || 'none'}
- Runs: ${stage7.raw_run_count} raw / ${stage7.repaired_run_count} repaired
- Repairs: ${stage7.repair_count}
- Blockers: ${stage7.blocker_count}
- Sketches: ${stage7.massing_count} massing / ${stage7.space_zone_count} space / ${stage7.site_zone_count} site
- Fallback: ${stage7.fallback}
- Primary geometry changed: no

`;
}
```

Inside `renderReport`, declare:

```js
  const stage7ShadowSection = renderStage7ShadowSection(blueprint);
```

Insert it between the Concept Studio and Critic Council sections in the report template:

```js
${conceptStudioSection}${stage7ShadowSection}${criticCouncilSection}
```

- [ ] **Step 7: Run focused integration tests**

Run:

```powershell
node --test test/stage7Pipeline.test.js test/pipeline.test.js test/conceptPipeline.test.js test/criticPipeline.test.js
```

Expected: PASS. The Stage 7 parity assertions must compare the full ordered operations arrays.

- [ ] **Step 8: Commit pipeline integration**

```powershell
git add src/construction/workflow.js src/pipeline.js test/stage7Pipeline.test.js
git commit -m "feat: integrate stage 7 shadow artifacts"
```

---

### Task 8: Milestone 1 CLI Contract and Validation

**Files:**
- Create: `test/stage7Cli.test.js`
- Modify: `src/index.js:18-117, 130-173, 217-236, 238-265`

**Interfaces:**
- Consumes:
  - `--coarse-voxel-mode off|shadow`
  - `--coarse-voxel-provider baseline|artifact`
  - `--coarse-voxel-plan <path>` for artifact provider only.
- Produces: validated `coarseVoxelMode`, `coarseVoxelProvider`, and `coarseVoxelPlan` pipeline options plus user-facing artifact output.
- Contract: `apply` and `python` fail before generation with milestone-specific messages.

- [ ] **Step 1: Write failing CLI contract tests**

Create `test/stage7Cli.test.js`:

```js
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

test('main CLI help documents Stage 7 Milestone 1 shadow options', () => {
  const result = runCli(['--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--coarse-voxel-mode off\|shadow/);
  assert.match(result.stdout, /--coarse-voxel-provider baseline\|artifact/);
  assert.match(result.stdout, /--coarse-voxel-plan <path>/);
  assert.match(result.stdout, /does not change primary geometry/);
});

test('main CLI rejects apply mode and python provider during Milestone 1', () => {
  const apply = runCli(['--coarse-voxel-mode', 'apply', 'fixture']);
  const python = runCli(['--coarse-voxel-mode', 'shadow', '--coarse-voxel-provider', 'python', 'fixture']);
  assert.equal(apply.status, 1);
  assert.match(apply.stderr, /apply mode is reserved for Stage 7 Milestone 4/);
  assert.equal(python.status, 1);
  assert.match(python.stderr, /python provider is reserved for Stage 7 Milestone 3/);
});

test('main CLI enforces artifact-provider path combinations before generation', () => {
  const missing = runCli(['--coarse-voxel-mode', 'shadow', '--coarse-voxel-provider', 'artifact', 'fixture']);
  const unused = runCli(['--coarse-voxel-mode', 'off', '--coarse-voxel-plan', 'plan.json', 'fixture']);
  const baselinePlan = runCli(['--coarse-voxel-mode', 'shadow', '--coarse-voxel-provider', 'baseline', '--coarse-voxel-plan', 'plan.json', 'fixture']);
  const multiCandidate = runCli(['--candidates', '2', '--coarse-voxel-mode', 'shadow', '--coarse-voxel-provider', 'artifact', '--coarse-voxel-plan', 'plan.json', 'fixture']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /artifact provider requires --coarse-voxel-plan/);
  assert.equal(unused.status, 1);
  assert.match(unused.stderr, /Stage 7 provider options require shadow mode/);
  assert.equal(baselinePlan.status, 1);
  assert.match(baselinePlan.stderr, /--coarse-voxel-plan is only valid with the artifact provider/);
  assert.equal(multiCandidate.status, 1);
  assert.match(multiCandidate.stderr, /artifact provider supports exactly one candidate and one round/);
});

function runCli(args) {
  return spawnSync(process.execPath, ['src/index.js', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
}
```

- [ ] **Step 2: Run the CLI tests to verify they fail**

Run:

```powershell
node --test test/stage7Cli.test.js
```

Expected: FAIL because Stage 7 CLI options and help text do not exist.

- [ ] **Step 3: Parse and validate Milestone 1 options**

In the default `options` object inside `parseArgs` in `src/index.js`, add:

```js
    coarseVoxelMode: 'off',
    coarseVoxelProvider: 'baseline',
    coarseVoxelPlan: undefined,
```

Add these branches immediately after the Stage 5 neural-retrieval branches:

```js
    } else if (arg === '--coarse-voxel-mode') {
      const value = argv[++i];
      if (value === 'apply') throw new Error('Stage 7 apply mode is reserved for Stage 7 Milestone 4.');
      if (!['off', 'shadow'].includes(value)) throw new Error(`无效 Stage 7 coarse voxel mode: ${value}`);
      options.coarseVoxelMode = value;
    } else if (arg === '--coarse-voxel-provider') {
      const value = argv[++i];
      if (value === 'python') throw new Error('Stage 7 python provider is reserved for Stage 7 Milestone 3.');
      if (!['baseline', 'artifact'].includes(value)) throw new Error(`无效 Stage 7 coarse voxel provider: ${value}`);
      options.coarseVoxelProvider = value;
    } else if (arg === '--coarse-voxel-plan') {
      const value = argv[++i];
      if (!value) throw new Error('--coarse-voxel-plan requires a path.');
      options.coarseVoxelPlan = path.resolve(value);
```

Before `parseArgs` returns, call:

```js
  validateCoarseVoxelOptions(options);
```

Add this helper after `parseArgs`:

```js
function validateCoarseVoxelOptions(options) {
  if (options.coarseVoxelMode === 'off' && (options.coarseVoxelProvider !== 'baseline' || options.coarseVoxelPlan)) {
    throw new Error('Stage 7 provider options require shadow mode.');
  }
  if (options.coarseVoxelMode === 'shadow' && options.coarseVoxelProvider === 'artifact' && !options.coarseVoxelPlan) {
    throw new Error('Stage 7 artifact provider requires --coarse-voxel-plan.');
  }
  if (options.coarseVoxelProvider === 'baseline' && options.coarseVoxelPlan) {
    throw new Error('--coarse-voxel-plan is only valid with the artifact provider.');
  }
  if (options.coarseVoxelMode === 'shadow' && options.coarseVoxelProvider === 'artifact' && (options.candidates > 1 || options.candidateRounds > 1)) {
    throw new Error('Stage 7 M1 artifact provider supports exactly one candidate and one round because each plan is bound to one condition hash.');
  }
}
```

- [ ] **Step 4: Pass options into the pipeline and print shadow status**

Add these fields to the `runPipeline` call in `main`:

```js
    coarseVoxelMode: options.coarseVoxelMode,
    coarseVoxelProvider: options.coarseVoxelProvider,
    coarseVoxelPlan: options.coarseVoxelPlan,
```

After Concept Studio console output, add:

```js
  if (result.stage7) {
    console.log(`Stage 7 Shadow: ${result.stage7.status} / ${result.stage7.provider} / geometry unchanged`);
    console.log(`Stage 7 报告: ${result.artifacts.stage7Report}`);
    if (result.artifacts.stage7FailureCase) console.log(`Stage 7 失败案例: ${result.artifacts.stage7FailureCase}`);
  }
```

- [ ] **Step 5: Document the CLI options in help output**

Add these lines after the neural-retrieval options in `printHelp`:

```text
  --coarse-voxel-mode off|shadow       Stage 7 M1 mode. Defaults to off; shadow does not change primary geometry.
  --coarse-voxel-provider baseline|artifact  Select deterministic baseline or a canonical external plan.
  --coarse-voxel-plan <path>           Canonical Stage 7 plan path required by the artifact provider.
```

Add this line to the workflow explanation:

```text
  Stage 7 M1: optional coarse semantic voxel shadow runs after CreativeDesign and before geometry.
```

- [ ] **Step 6: Run CLI and pipeline option tests**

Run:

```powershell
node --test test/stage7Cli.test.js test/stage7Pipeline.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit the CLI contract**

```powershell
git add src/index.js test/stage7Cli.test.js
git commit -m "feat: expose stage 7 shadow cli"
```

---

### Task 9: Stage 7 M1 Status Documentation and Naming-Clash Warning

**Files:**
- Modify: `README.md:11-35, 45-83, 122-138`
- Modify: `AGENT.md:70-92`
- Modify: `docs/roadmap.md:660-674`
- Modify: `docs/index.html:122-195`
- Modify: `test/docsProjectStatus.test.js`

**Interfaces:**
- Consumes: verified Milestone 1 CLI/artifact names from Tasks 7-8.
- Produces: truthful project status identifying Stage 7 as M1 shadow-only and distinguishing it from legacy `Stage 7A-I` template-assimilation source IDs.
- Contract: do not claim a trained model, apply mode, runtime geometry improvement, or Stage 7 completion.

- [ ] **Step 1: Replace Stage 6-only documentation assertions with failing Stage 7 M1 assertions**

Update `test/docsProjectStatus.test.js` without dropping its Stage 5/6 regression coverage. Replace the stale fixed-count/current-stage assertions, retain the semantic-patch/query assertions, and add the Stage 7 test so the file becomes:

```js
import fs from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('project docs retain completed Stage 5 and Stage 6 capabilities', async () => {
  const [home, readme, roadmap] = await Promise.all([
    fs.readFile('docs/index.html', 'utf8'),
    fs.readFile('README.md', 'utf8'),
    fs.readFile('docs/roadmap.md', 'utf8')
  ]);

  assert.match(home, /Full Node Suite/);
  assert.match(home, /Semantic patch dataset/);
  assert.match(home, /query:patches/);
  assert.match(home, /Stage 5 - Neural Retrieval[\s\S]*Completed/);
  assert.match(home, /Stage 6 - Semantic Patch Completion[\s\S]*Completed/);
  assert.match(readme, /Semantic patch layer:/);
  assert.match(readme, /npm run query:patches/);
  assert.match(roadmap, /当前 MVP 状态：Stage 6/);
  assert.match(roadmap, /semantic_patch_dataset\.json/);
  assert.match(roadmap, /query:patches/);
});

test('project docs surface Stage 7 M1 as shadow-only work in progress', async () => {
  const [home, readme, roadmap, agent] = await Promise.all([
    fs.readFile('docs/index.html', 'utf8'),
    fs.readFile('README.md', 'utf8'),
    fs.readFile('docs/roadmap.md', 'utf8'),
    fs.readFile('AGENT.md', 'utf8')
  ]);

  assert.match(home, /Stage 7 M1 Coarse Semantic Voxel Shadow/);
  assert.match(home, /Full Node Suite/);
  assert.match(home, /Stage 6 - Semantic Patch Completion[\s\S]*Completed/);
  assert.match(home, /Stage 7 - Coarse Semantic Voxels[\s\S]*In Progress/);
  assert.match(home, /shadow-only/i);

  assert.match(readme, /Active stage: Stage 7 Milestone 1/);
  assert.match(readme, /--coarse-voxel-mode shadow/);
  assert.match(readme, /stage7_coarse_semantic_plan\.repaired\.json/);
  assert.match(readme, /does not change primary geometry/i);

  assert.match(roadmap, /当前 M1 状态：Stage 7/);
  assert.match(roadmap, /shadow mode/);
  assert.match(roadmap, /stage7-template-\*/);

  assert.match(agent, /当前阶段：Stage 7 Milestone 1/);
  assert.doesNotMatch(agent, /下一阶段：Stage 3 Concept Studio/);
});
```

- [ ] **Step 2: Run the docs status test to verify it fails**

Run:

```powershell
node --test test/docsProjectStatus.test.js
```

Expected: FAIL because user-facing files still identify Stage 6 as active and `AGENT.md` still points to Stage 3.

- [ ] **Step 3: Update README with shadow-only usage and artifacts**

In `README.md` Current Status, retain existing Stage 1-6 facts and replace the active-stage line with:

```markdown
- Coarse semantic voxel layer: Stage 7 Milestone 1 defines a provider-neutral `64^3` contract, deterministic baseline, bounded repair, procedural candidate converter, and artifact provider
- Active stage: Stage 7 Milestone 1 is shadow-only; it exports review artifacts and failure records but does not change primary geometry
```

Add this command to Quick Start:

```powershell
npm start -- --mode mock --seed 7101 --concepts 3 --coarse-voxel-mode shadow --coarse-voxel-provider baseline "建一个湖边带庭院的两层日式住宅"
```

Extend the output tree with:

```text
stage7_condition.json
stage7_coarse_semantic_plan.raw.json
stage7_coarse_semantic_plan.repaired.json
stage7_coarse_semantic_report.md
stage7_procedural_candidate.json
stage7_failure_case.json          only when shadow rejects a candidate
```

Insert this pipeline line after CreativeDesignAgent:

```text
-> Stage 7 M1 Shadow: condition -> untrusted coarse voxels -> validation/repair -> procedural candidate; primary geometry unchanged
```

Add these boundary bullets:

```markdown
- Stage 7 Milestone 1 does not train a model, invoke Python, or apply candidate geometry.
- Legacy `stage7-template-*` source identifiers refer to the older template-assimilation sequence, not Architecture Master Roadmap Stage 7.
```

Add this Development Direction item:

```markdown
7. Use Stage 7 M1 shadow artifacts to validate the whole-building semantic contract before raw dataset extraction or model training.
```

- [ ] **Step 4: Update roadmap and agent collaboration status**

In `docs/roadmap.md`, immediately below the Stage 7 goal, insert:

```markdown
当前 M1 状态：Stage 7 首版采用 shadow mode。它定义 `64^3` 三层语义体素契约、deterministic baseline、artifact provider、bounded repair 和 semantic voxel -> procedural candidate 转换器；默认 `off`，显式启用时只输出审查产物和失败案例，不改变主建造 operations。Python、raw schematic 整栋数据集、learned provider 和 apply mode 分别保留给后续里程碑。仓库里的 `stage7-template-*` 是更早的模板吸收编号，不代表本路线图 Stage 7 已完成。
```

In `AGENT.md`, replace the stale next-stage bullet with a current-stage statement:

```markdown
- 当前阶段：Stage 7 Milestone 1 已建立 shadow-only 的整栋粗语义体素契约、deterministic baseline、repair 和 procedural candidate 转换边界；先审阅 M1 证据，再决定是否进入 Milestone 2。
```

Add this boundary to the current capability section:

```markdown
- Stage 7 M1 仅观察和导出候选，不训练模型、不调用 Python、不修改主建造 operations。
```

- [ ] **Step 5: Update GitHub Pages status without invented metrics**

In the first metric card in `docs/index.html`, use:

```html
<article>
  <span>Latest Stage</span>
  <strong>Stage 7 M1 Coarse Semantic Voxel Shadow</strong>
  <em>shadow-only contract and converter</em>
</article>
```

Replace the fixed `291 / 291` test card with:

```html
<article>
  <span>Test Gate</span>
  <strong>Full Node Suite</strong>
  <em>npm test, zero failures required</em>
</article>
```

Add this Current Capabilities item after the Stage 6 semantic patch item:

```html
<li><strong>Stage 7 coarse semantic voxel shadow</strong><span>Provider-neutral 64³ condition/plan artifacts, deterministic baseline, repair diagnostics, and procedural candidates without changing primary geometry.</span></li>
```

Change the Stage 6 roadmap item class from `active` to `done`, then append:

```html
<li class="active"><span></span><div><strong>Stage 7 - Coarse Semantic Voxels</strong><em>In Progress</em><p>Milestone 1 is shadow-only: contract, deterministic provider, artifact validation, repair, conversion, and failure evidence.</p></div></li>
```

In the pipeline list, insert this item after concept development and renumber following items so the list remains consecutive:

```html
<li><span>5</span><div><strong>Shadow coarse semantics</strong><p>Build, validate, repair, and convert a Stage 7 candidate while preserving the primary construction path.</p></div></li>
```

- [ ] **Step 6: Run docs and CLI status tests**

Run:

```powershell
node --test test/docsProjectStatus.test.js test/stage7Cli.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit truthful Stage 7 status**

```powershell
git add README.md AGENT.md docs/roadmap.md docs/index.html test/docsProjectStatus.test.js
git commit -m "docs: surface stage 7 shadow status"
```

---

### Task 10: Milestone 1 Verification and Shadow Smoke Evidence

**Files:**
- Verify only; do not create committed output artifacts.

**Interfaces:**
- Consumes: all Milestone 1 modules, workflow integration, CLI, and documentation.
- Produces: fresh test and smoke evidence proving shadow isolation, fallback safety, and repository cleanliness.

- [ ] **Step 1: Run all Stage 7 focused tests**

Run:

```powershell
node --test test/coarseSemanticVoxelSchema.test.js test/coarseSemanticVoxelCondition.test.js test/coarseSemanticVoxelBaseline.test.js test/coarseSemanticVoxelRepair.test.js test/semanticVoxelProceduralPlan.test.js test/coarseSemanticVoxelShadow.test.js test/stage7Pipeline.test.js test/stage7Cli.test.js test/docsProjectStatus.test.js
```

Expected: PASS with 0 failures.

- [ ] **Step 2: Run affected pipeline and learning regressions**

Run:

```powershell
node --test test/pipeline.test.js test/conceptPipeline.test.js test/criticPipeline.test.js test/candidatePipeline.test.js test/architectAgent.test.js test/plannerAgent.test.js test/csgBuilder.test.js test/blueprintQaAgent.test.js test/templateEmbeddingIndex.test.js test/templateExplainableRetriever.test.js test/templateNeuralRetriever.test.js test/templateSemanticPatchDataset.test.js test/templateSemanticPatchCompleter.test.js
```

Expected: PASS with 0 failures.

- [ ] **Step 3: Run the full Node.js suite**

Run:

```powershell
npm test
```

Expected: exit code 0 and 0 failures. Record the actual test count in the handoff; do not hard-code it into the homepage.

- [ ] **Step 4: Run a real CLI shadow smoke in ignored `.tmp` output**

Run:

```powershell
npm start -- --mode mock --seed 7101 --concepts 3 --concept-strategy select --coarse-voxel-mode shadow --coarse-voxel-provider baseline --out .tmp/stage7-m1-smoke "建一个湖边带水景庭院的两层日式住宅，深檐、观景轴线和安静动线"
```

Expected: exit code 0, console reports `Stage 7 Shadow: converted / baseline / geometry unchanged`, and the normal datapack is produced.

- [ ] **Step 5: Inspect smoke artifacts and compact blueprint metadata**

Run:

```powershell
$run = Get-ChildItem '.tmp\stage7-m1-smoke' -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $run) { throw 'Stage 7 smoke output directory missing' }
$required = @(
  'blueprint.json',
  'stage7_condition.json',
  'stage7_coarse_semantic_plan.raw.json',
  'stage7_coarse_semantic_plan.repaired.json',
  'stage7_coarse_semantic_report.md',
  'stage7_procedural_candidate.json',
  'architect_datapack\data\architect\function\build.mcfunction'
)
foreach ($relative in $required) {
  $target = Join-Path $run.FullName $relative
  if (-not (Test-Path -LiteralPath $target)) { throw "missing smoke artifact: $relative" }
}
$blueprint = Get-Content -Raw (Join-Path $run.FullName 'blueprint.json') | ConvertFrom-Json
if ($blueprint.stage7.status -ne 'converted') { throw "unexpected Stage 7 status: $($blueprint.stage7.status)" }
if ($blueprint.stage7.fallback -ne 'not-needed') { throw "unexpected Stage 7 fallback: $($blueprint.stage7.fallback)" }
"stage7-smoke: PASS ($($run.FullName))"
```

Expected: prints `stage7-smoke: PASS`.

- [ ] **Step 6: Verify no generated or unrelated files are staged**

Run:

```powershell
git diff --check
git status --short
```

Expected: `git diff --check` exits 0. `git status --short` contains no `.tmp/`, `out/`, credentials, model files, dataset files, or unrelated modifications.

- [ ] **Step 7: Review the Milestone 1 commit sequence**

Run:

```powershell
git log --oneline -10
```

Expected: focused commits for schema, condition, baseline, repair, converter, shadow boundary, workflow integration, CLI, and documentation. If verification required a code fix, rerun the failing command and `npm test`, then commit only that fix with a narrowly scoped `fix:` message.

---

## Self-Review Checklist

- Spec coverage:
  - Task 1 covers canonical `64^3` layers, RLE, hashing, provenance, and hard schema blockers.
  - Task 2 covers selected concept/final design conditions and human-review-controlled references.
  - Task 3 covers the deterministic baseline provider and evidence-bearing whole-building plans.
  - Task 4 covers bounded repair, semantic blockers, reproducibility, and no invented core semantics.
  - Task 5 covers derived massing/space/site sketches and semantic-only procedural candidates.
  - Task 6 covers artifact limits, shared provider boundary, reports, and failure records.
  - Tasks 7-8 cover default-off/shadow-only runtime integration, candidate pipeline propagation, CLI validation, artifact export, and exact operations parity.
  - Tasks 9-10 cover truthful status, the legacy naming collision, full regression, and smoke evidence.
- Milestone boundary: no task adds raw schematic dataset extraction, Python, PyTorch, learned providers, apply mode, candidate geometry mutation, or Stage 8 terrain reads.
- Type consistency:
  - Pipeline option names are `coarseVoxelMode`, `coarseVoxelProvider`, and `coarseVoxelPlan` from CLI through candidate pipeline and workflow.
  - Runtime mode values are `off|shadow`; provider values are `baseline|artifact`.
  - Full workflow state is `stage7`; compact blueprint state is also `stage7`; artifact keys use the `stage7*` camelCase prefix.
  - Condition field is `condition_hash`; source IDs consistently use `stage7-coarse-semantic-voxel-*`.
  - Shadow status values are `disabled|converted|rejected`; fallback values are `not-needed|primary-build-unchanged`.
- Boundary consistency:
  - Baseline and artifact adapters expose the same async `generate({ condition, seed, options })` provider method.
  - Candidate procedural output contains only semantic inputs, compact plan provenance, sketches, and hints; raw/repaired RLE grids stay in their dedicated artifacts.
  - Condition/plan validators are total over malformed JSON-shaped values, cap decoded work at the logical `64^3` cell count, and avoid quadratic component scans.
  - A single artifact cannot be reused across multiple candidate conditions; both exported pipeline entry points and the CLI reject that configuration.
- Safety consistency: only Milestone 4 may apply candidate geometry; every Milestone 1 test treats the existing operations array as authoritative.
- Documentation consistency: Stage 7 is `In Progress`, M1 is `shadow-only`, Stage 6 remains completed, and no learned-model claim appears.
- Placeholder scan: every implementation step contains concrete code, commands, and expected output; no deferred fill-in markers remain.

## Execution Handoff

Plan execution must stop for review after each task commit. The recommended execution mode is subagent-driven development with a fresh implementer per task and specification/compliance review before advancing.
