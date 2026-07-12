import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStage7DatasetCase, renderStage7DatasetCaseReport } from '../src/construction/learning/coarseSemanticVoxelDatasetCase.js';
import { decodeStage7Runs, validateStage7Condition, validateStage7Plan } from '../src/construction/learning/coarseSemanticVoxelSchema.js';
import { hollowHouseVolumeFixture, pendingCaseFixture, reviewedCaseFixture } from './fixtures/stage7DatasetFixtures.js';

test('dataset case emits canonical artifacts while pending review stays training-ineligible', () => {
  const result=buildStage7DatasetCase({ volume:hollowHouseVolumeFixture(), caseRecord:pendingCaseFixture(), datasetVersion:'v1', localArtifactRoot:'.tmp/stage7-dataset/v1' });
  assert.equal(validateStage7Condition(result.condition).ok,true);
  assert.equal(validateStage7Plan(result.rawPlan,{condition:result.condition}).ok,true);
  assert.equal(result.record.training.eligible,false);
  assert.ok(result.record.training.blockers.includes('review-status-pending'));
  assert.equal(result.record.source.sha256,'a'.repeat(64));
  assert.match(result.report,/Training eligible: no/);
  assert.match(result.report,/Split: unassigned/);
});

test('Dataset v1 records remain frozen without v2 correction metadata', () => {
  const fixture=pendingCaseFixture();
  const caseRecord={...fixture,source:{...fixture.source,author:'Rizzial',uploader:'Alterio',author_evidence:'Reviewed source attribution.'}};
  const result=buildStage7DatasetCase({ volume:hollowHouseVolumeFixture(), caseRecord, datasetVersion:'v1', localArtifactRoot:'.tmp/stage7-dataset/v1' });
  assert.equal(Object.hasOwn(result.record.extraction,'correction_count'),false);
  assert.equal(Object.hasOwn(result.record.extraction,'correction_sha256'),false);
  assert.equal(result.record.source.author,'Rizzial');
  assert.equal(Object.hasOwn(result.record.source,'uploader'),false);
  assert.equal(Object.hasOwn(result.record.source,'author_evidence'),false);
});

test('Dataset v2 records preserve reviewed creator and uploader provenance', () => {
  const fixture=pendingCaseFixture();
  const caseRecord={...fixture,source:{...fixture.source,author:'Rizzial',uploader:'Alterio',author_evidence:'Reviewed source attribution.'}};
  const result=buildStage7DatasetCase({volume:hollowHouseVolumeFixture(),caseRecord,datasetVersion:'v2'});
  assert.equal(result.record.source.author,'Rizzial');
  assert.equal(result.record.source.uploader,'Alterio');
  assert.equal(result.record.source.author_evidence,'Reviewed source attribution.');
});

test('dataset case hashes are deterministic and provider provenance is complete', () => {
  const input={ volume:hollowHouseVolumeFixture(), caseRecord:reviewedCaseFixture(), datasetVersion:'v1', localArtifactRoot:'.tmp/stage7-dataset/v1' };
  const first=buildStage7DatasetCase(input); const second=buildStage7DatasetCase(input);
  assert.equal(first.record.artifacts.condition_sha256,second.record.artifacts.condition_sha256);
  assert.equal(first.record.artifacts.plan_sha256,second.record.artifacts.plan_sha256);
  assert.deepEqual(first.rawPlan.provider,{ kind:'dataset-extraction', name:'stage7-coarse-semantic-voxel-schematic-extractor-v1', model_version:null, dataset_version:'v1' });
  assert.equal(first.record.source.license_evidence,'fixture license record');
  const assigned={...first.record,split:'validation'};
  assert.match(renderStage7DatasetCaseReport(assigned),/Split: validation/);
});

test('dataset case rejects invalid source hashes', () => {
  const volume={...hollowHouseVolumeFixture(),source_sha256:'bad'};
  assert.throws(()=>buildStage7DatasetCase({volume,caseRecord:pendingCaseFixture(),datasetVersion:'v1'}),/source SHA-256/);
});

test('dataset case applies reviewed corrections before plan hashing and records provenance', () => {
  const reviewRecord={
    record_id:'review-correction-1',review_record_ids:['review-correction-1'],
    semantic_corrections:[{operation:'set',coordinate:[2,1,1],layer:'envelope',value:'opening',confidence:1,reason:'Reviewed entrance.'}]
  };
  const result=buildStage7DatasetCase({volume:hollowHouseVolumeFixture(),caseRecord:reviewedCaseFixture(),reviewRecord,datasetVersion:'v2'});
  const cell=decodeStage7Runs(result.rawPlan.runs).find((item)=>item.x===2&&item.y===1&&item.z===1);
  assert.equal(cell.envelope,'opening');
  assert.ok(cell.evidence_ids.includes('review:review-correction-1'));
  assert.equal(result.record.extraction.correction_count,1);
  assert.match(result.record.extraction.correction_sha256,/^[a-f0-9]{64}$/);
  assert.ok(result.rawPlan.evidence.some((item)=>item.id==='review:review-correction-1'));
});
