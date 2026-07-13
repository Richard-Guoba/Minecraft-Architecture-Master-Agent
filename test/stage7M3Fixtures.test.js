import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStage7Condition, validateStage7Plan } from '../src/construction/learning/coarseSemanticVoxelSchema.js';

for (const caseId of ['one-floor-house', 'two-floor-house']) {
  test(`M3 fixture ${caseId} uses the canonical Stage 7 condition and plan contracts`, async () => {
    const root = path.join(process.cwd(), 'training', 'stage7', 'fixtures', 'm3', 'cases', caseId);
    const condition = JSON.parse(await fs.readFile(path.join(root, 'condition.json'), 'utf8'));
    const plan = JSON.parse(await fs.readFile(path.join(root, 'plan.json'), 'utf8'));
    assert.deepEqual(validateStage7Condition(condition), { ok: true, errors: [] });
    const validation = validateStage7Plan(plan, { condition });
    assert.equal(validation.ok, true, validation.errors.join('; '));
    assert.equal(plan.encoding, 'rle-x-v1');
    assert.deepEqual(plan.summary, {});
    assert.deepEqual(plan.derived_sketches, { massing: [], spaces: [], site: [] });
    assert.deepEqual(plan.conflicts, []);
    assert.deepEqual(plan.repairs, []);
    assert.deepEqual(plan.warnings, []);
  });
}
