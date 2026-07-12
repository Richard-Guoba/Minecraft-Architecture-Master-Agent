import test from 'node:test';
import assert from 'node:assert/strict';
import { assignStage7DatasetSplit, buildStage7DatasetIndex, buildStage7DatasetReadiness, validateStage7Dataset, stage7DatasetCasesJsonl, renderStage7DatasetReport } from '../src/construction/learning/coarseSemanticVoxelDataset.js';

function datasetRecordFixture() {
  return {
    case_id:'house-source',case_version:`sha256:${'b'.repeat(64)}`,dataset_version:'v1',origin:'real',parent_case_id:null,split:null,
    source:{file:'House/Source.schematic',sha256:'a'.repeat(64),url:'',author:'',license_status:'restricted',allowed_uses:['local-training'],public_release_allowed:false,license_evidence:'fixture license record'},
    review:{status:'approved',reviewed_by:'fixture',reviewed_at:'2026-07-12T00:00:00.000Z',approved_learning_areas:['envelope','site','space'],blocked_learning_areas:[],canonical_front_side:'south',review_record_ids:['fixture-review']},
    training:{eligible:true,permitted_layers:['envelope','site','space'],blockers:[]},
    original_bounds:{min_x:0,min_y:0,min_z:0,max_x:8,max_y:6,max_z:8},
    normalized_transform:{resolution:[64,64,64],source_size:[9,7,9],occupied_size:[9,7,9],ground_y:0,front_side:'south'},
    artifacts:{condition_sha256:'c'.repeat(64),plan_sha256:'d'.repeat(64),repaired_plan_sha256:null,local_condition_path:'cases/house-source/condition.json',local_plan_path:'cases/house-source/plan.raw.json',local_repaired_plan_path:null},
    extraction:{schema_valid:true,semantic_status:'accepted',run_count:4,repair_count:0,blockers:[],warnings:[]}
  };
}

test('real case split is stable and descendants never cross source-case boundaries', () => {
  const first=assignStage7DatasetSplit({caseId:'house-a-small-modern-house',origin:'real'});
  assert.equal(first,assignStage7DatasetSplit({caseId:'house-a-small-modern-house',origin:'real'}));
  assert.ok(['train','validation','test'].includes(first));
  assert.equal(assignStage7DatasetSplit({caseId:'house-child',origin:'augmented',parentSplit:first}),first);
  assert.equal(assignStage7DatasetSplit({caseId:'synthetic-1',origin:'synthetic'}),'train');
});

test('dataset index is deterministic and renders stable JSONL and report', () => {
  const first=buildStage7DatasetIndex({records:[datasetRecordFixture()],generatedAt:'2026-07-12T00:00:00.000Z'});
  const second=buildStage7DatasetIndex({records:[datasetRecordFixture()],generatedAt:'2026-07-12T00:00:00.000Z'});
  assert.deepEqual(first,second);
  assert.equal(validateStage7Dataset(first).ok,true);
  assert.match(stage7DatasetCasesJsonl(first.records),/house-source/);
  assert.match(renderStage7DatasetReport(first),/Training eligible: 1/);
});

test('dataset validation rejects leakage and ineligible training membership', () => {
  const fixture=buildStage7DatasetIndex({records:[datasetRecordFixture()],generatedAt:'2026-07-12T00:00:00.000Z'});
  fixture.records[0].training.eligible=false;
  fixture.manifest.training_case_ids=[fixture.records[0].case_id];
  const different=fixture.records[0].split==='train'?'test':'train';
  fixture.records.push({...fixture.records[0],case_id:'house-source-child',origin:'augmented',parent_case_id:fixture.records[0].case_id,split:different});
  fixture.splits.assignments['house-source-child']=different;
  const result=validateStage7Dataset(fixture);
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((item)=>/ineligible training case/i.test(item)));
  assert.ok(result.errors.some((item)=>/source-case leakage/i.test(item)));
});

test('dataset validation rejects synthetic held-out cases and malformed provenance', () => {
  const record={...datasetRecordFixture(),case_id:'synthetic-bad',origin:'synthetic',source:{...datasetRecordFixture().source,sha256:'bad'},split:'test'};
  const fixture={manifest:{source:'stage7-coarse-semantic-voxel-dataset-v1',schema_version:1,dataset_version:'v1',case_count:1,training_eligible_count:0,training_case_ids:[]},records:[record],splits:{assignments:{'synthetic-bad':'test'}}};
  const result=validateStage7Dataset(fixture);
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((item)=>/synthetic case.*held-out/i.test(item)));
  assert.ok(result.errors.some((item)=>/source SHA-256/i.test(item)));
});

test('readiness requires six explicit outcomes and three eligible semantic accepts', () => {
  const ids=['pilot-1','pilot-2','pilot-3','pilot-4','pilot-5','pilot-6'];
  const records=ids.map((caseId,index)=>{
    const positive=index<3;
    return {...datasetRecordFixture(),case_id:caseId,dataset_version:'v2',
      review:{...datasetRecordFixture().review,status:positive?'limited':'rejected'},
      training:{...datasetRecordFixture().training,eligible:positive,blockers:positive?[]:['review-status-rejected']},
      extraction:{...datasetRecordFixture().extraction,semantic_status:positive?'accepted':'rejected'}
    };
  });
  const indexed=buildStage7DatasetIndex({records,datasetVersion:'v2'});
  const readiness=buildStage7DatasetReadiness(indexed,{pilotCaseIds:ids});
  assert.equal(readiness.pilot_count,6);
  assert.equal(readiness.reviewed_count,6);
  assert.equal(readiness.training_eligible_count,3);
  assert.equal(readiness.semantic_accepted_count,3);
  assert.equal(readiness.ready_for_m3_real_data,true);
  records[0].review.status='pending';
  const blocked=buildStage7DatasetReadiness(buildStage7DatasetIndex({records,datasetVersion:'v2'}),{pilotCaseIds:ids});
  assert.equal(blocked.ready_for_m3_real_data,false);
});
