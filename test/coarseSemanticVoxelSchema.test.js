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
