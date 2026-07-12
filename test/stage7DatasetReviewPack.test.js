import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeStage7DatasetReviewPack } from '../src/construction/learning/stage7DatasetReviewPack.js';
import { pendingCaseFixture } from './fixtures/stage7DatasetFixtures.js';

async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'stage7-review-pack-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const record={...pendingCaseFixture(),case_id:'house-a-small-modern-house',file:'House/A Small Modern House - (mcbuild_org).schematic'};
  const knowledgeBasePath=path.join(root,'case_library.v2.json');
  await fs.writeFile(knowledgeBasePath,`${JSON.stringify({source:'template-knowledge-base-v2',schema_version:2,cases:[record]},null,2)}\n`,'utf8');
  return {templateRoot:path.resolve('mc_templates'),knowledgeBasePath,outputDir:path.join(root,'pack'),caseIds:[record.case_id]};
}

test('review pack is source-bound and contains no positive review claims', async (t) => {
  const result=await writeStage7DatasetReviewPack(await fixture(t));
  assert.equal(result.index.case_count,1);
  const review=JSON.parse(await fs.readFile(result.cases[0].reviewPath,'utf8'));
  assert.match(review.source_sha256,/^[a-f0-9]{64}$/);
  assert.equal(review.current_review.status,'pending');
  assert.equal(review.correction_template.reviewed_by,'');
  assert.equal(review.correction_template.license_status,'unknown');
  assert.deepEqual(review.correction_template.semantic_corrections,[]);
  assert.deepEqual((await fs.readdir(result.cases[0].caseDir)).sort(),['correction.example.json','plan.raw.json','report.md','review.json']);
});

test('review pack output is deterministic for a fixed source date epoch', async (t) => {
  const input=await fixture(t);
  const previous=process.env.SOURCE_DATE_EPOCH;
  process.env.SOURCE_DATE_EPOCH='1783814400';
  t.after(()=>{ if(previous===undefined) delete process.env.SOURCE_DATE_EPOCH; else process.env.SOURCE_DATE_EPOCH=previous; });
  const first=await writeStage7DatasetReviewPack(input);
  const firstIndex=await fs.readFile(first.artifacts.index,'utf8');
  const second=await writeStage7DatasetReviewPack({...input,outputDir:path.join(path.dirname(input.outputDir),'pack-2')});
  assert.equal(await fs.readFile(second.artifacts.index,'utf8'),firstIndex);
});
