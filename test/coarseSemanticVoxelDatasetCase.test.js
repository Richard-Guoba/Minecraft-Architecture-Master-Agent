import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStage7DatasetCase, renderStage7DatasetCaseReport } from '../src/construction/learning/coarseSemanticVoxelDatasetCase.js';
import { validateStage7Condition, validateStage7Plan } from '../src/construction/learning/coarseSemanticVoxelSchema.js';
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

test('dataset case hashes are deterministic and provider provenance is complete', () => {
  const input={ volume:hollowHouseVolumeFixture(), caseRecord:reviewedCaseFixture(), datasetVersion:'v1', localArtifactRoot:'.tmp/stage7-dataset/v1' };
  const first=buildStage7DatasetCase(input); const second=buildStage7DatasetCase(input);
  assert.equal(first.record.artifacts.condition_sha256,second.record.artifacts.condition_sha256);
  assert.equal(first.record.artifacts.plan_sha256,second.record.artifacts.plan_sha256);
  assert.deepEqual(first.rawPlan.provider,{ kind:'dataset-extraction', name:'stage7-coarse-semantic-voxel-schematic-extractor-v1', model_version:null, dataset_version:'v1' });
  const assigned={...first.record,split:'validation'};
  assert.match(renderStage7DatasetCaseReport(assigned),/Split: validation/);
});

test('dataset case rejects invalid source hashes', () => {
  const volume={...hollowHouseVolumeFixture(),source_sha256:'bad'};
  assert.throws(()=>buildStage7DatasetCase({volume,caseRecord:pendingCaseFixture(),datasetVersion:'v1'}),/source SHA-256/);
});
