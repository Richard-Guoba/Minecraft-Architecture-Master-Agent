import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeStage7Cells, decodeStage7Runs } from '../src/construction/learning/coarseSemanticVoxelSchema.js';
import { rasterizeSchematicToStage7 } from '../src/construction/learning/coarseSemanticVoxelDatasetRasterizer.js';
import { hollowHouseVolumeFixture, reviewedCaseFixture } from './fixtures/stage7DatasetFixtures.js';

test('rasterizer produces deterministic canonical layer cells', () => {
  const first = rasterizeSchematicToStage7({ volume:hollowHouseVolumeFixture(), caseRecord:reviewedCaseFixture() });
  const second = rasterizeSchematicToStage7({ volume:hollowHouseVolumeFixture(), caseRecord:reviewedCaseFixture() });
  assert.deepEqual(first, second);
  assert.ok(first.cells.some((cell) => cell.envelope === 'wall'));
  assert.ok(first.cells.some((cell) => cell.envelope === 'roof'));
  assert.ok(first.cells.some((cell) => cell.envelope === 'opening'));
  assert.ok(first.cells.some((cell) => cell.space === 'public'));
  assert.ok(first.cells.some((cell) => cell.site === 'water'));
  assert.deepEqual(first.normalized_transform.resolution, [64,64,64]);
  const runs = encodeStage7Cells(first.cells);
  assert.deepEqual(encodeStage7Cells(decodeStage7Runs(runs)), runs);
});

test('unreviewed orientation is diagnostic-only and explicitly warned', () => {
  const caseRecord = reviewedCaseFixture();
  caseRecord.review.canonical_front_side = null;
  const result = rasterizeSchematicToStage7({ volume:hollowHouseVolumeFixture(), caseRecord });
  assert.equal(result.normalized_transform.front_side, 'south');
  assert.ok(result.warnings.includes('canonical front side is unreviewed; south used for diagnostics'));
});

test('rasterizer rejects an empty source volume', () => {
  const volume = { source_sha256:'0'.repeat(64), width:2, height:2, length:2, block_count:8, blockAt:()=>({ state:'minecraft:air', name:'air', category:'air', air:true }) };
  assert.throws(() => rasterizeSchematicToStage7({ volume, caseRecord:reviewedCaseFixture() }), /at least one non-air block/);
});
