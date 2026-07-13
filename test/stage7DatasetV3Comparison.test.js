import test from 'node:test';
import assert from 'node:assert/strict';
import { createStage7Plan, hashCanonicalValue } from '../src/construction/learning/coarseSemanticVoxelSchema.js';
import {
  analyzeStage7PlanTopology,
  compareStage7PilotDatasets,
  renderStage7DatasetV3Comparison
} from '../src/construction/learning/stage7DatasetV3Comparison.js';

function plan(cells) {
  const payload={
    source:'stage7-coarse-semantic-voxel-condition-v1',schema_version:1,prompt:'comparison',seed:1,
    dimensions:{width:8,depth:8,floors:1,floor_height:4,total_height:6,lot_width:8,lot_depth:8},
    design:{front_side:'south'},references:[],
    constraints:{resolution:[64,64,64],max_total_height:40,minecraft_fill_limit:32768}
  };
  const condition={...payload,condition_hash:hashCanonicalValue(payload)};
  return createStage7Plan({condition,provider:{kind:'dataset-extraction',name:'fixture'},cells,evidence:[]});
}

test('comparison diagnostics count disconnected vertical cells and roof overlap', () => {
  const cells=[
    {x:1,y:1,z:1,envelope:'roof',space:'vertical_circulation',site:'none',confidence:1,evidence_ids:[]},
    {x:3,y:1,z:1,envelope:'roof',space:'vertical_circulation',site:'none',confidence:1,evidence_ids:[]}
  ];
  const result=analyzeStage7PlanTopology(plan(cells));
  assert.equal(result.space.vertical_circulation.component_count,2);
  assert.equal(result.space.vertical_circulation.isolated_component_count,2);
  assert.equal(result.space.vertical_circulation.largest_component,1);
  assert.equal(result.roof_vertical_overlap,2);
  assert.equal(result.entrance_count,0);
  assert.equal(result.floor_level_count,0);
});

test('pilot comparison renders fixed metrics without positive review claims', () => {
  const comparison=compareStage7PilotDatasets({
    pilotCaseIds:['house-fixture'],
    v2Records:[{case_id:'house-fixture',extraction:{repair_count:10,blockers:['missing-circulation']},artifacts:{plan_sha256:'a'.repeat(64)}}],
    v3Records:[{case_id:'house-fixture',extraction:{repair_count:1,repair_classes:['one-cell-envelope-gap'],blockers:[],semantic_status:'pending-review'},artifacts:{plan_sha256:'b'.repeat(64)}}],
    v2Plans:new Map([['house-fixture',plan([])]]),v3Plans:new Map([['house-fixture',plan([])]])
  });
  const markdown=renderStage7DatasetV3Comparison(comparison);
  assert.match(markdown,/house-fixture/);
  assert.match(markdown,/pending-review/);
  assert.match(markdown,/one-cell-envelope-gap/);
  assert.match(markdown,/not-recorded-by-v2/);
  assert.match(markdown,/Diagnostic only/);
  assert.doesNotMatch(markdown,/training approved/i);
});
