import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeStage7DatasetArtifacts } from '../src/construction/learning/coarseSemanticVoxelDataset.js';
import { pendingCaseFixture } from './fixtures/stage7DatasetFixtures.js';

async function createFixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'stage7-m2-dataset-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const templateRoot=path.join(root,'mc_templates'); const houseDir=path.join(templateRoot,'House');
  const outputDir=path.join(root,'index'); const localArtifactRoot=path.join(root,'local'); const knowledgeBasePath=path.join(root,'case_library.v2.json');
  await fs.mkdir(houseDir,{recursive:true});
  const file='House/A Small Modern House - (mcbuild_org).schematic';
  await fs.copyFile(path.resolve('mc_templates',file),path.join(templateRoot,file));
  const base=pendingCaseFixture();
  const record={...base,case_id:'house-a-small-modern-house',title:'A Small Modern House',file,source:{...base.source,url:'https://mcbuild.org/schematics/16786:a-small-modern-house'}};
  await fs.writeFile(knowledgeBasePath,`${JSON.stringify({source:'template-knowledge-base-v2',schema_version:2,cases:[record]},null,2)}\n`,'utf8');
  return {root,templateRoot,outputDir,localArtifactRoot,knowledgeBasePath};
}

function runCli(args) { return spawnSync(process.execPath,['src/buildCoarseSemanticVoxelDataset.js',...args],{cwd:process.cwd(),encoding:'utf8'}); }

test('Stage 7 dataset writer emits lightweight canonical layout with zero false eligibility', async (t) => {
  const fixture=await createFixture(t);
  const result=await writeStage7DatasetArtifacts(fixture);
  assert.equal(result.manifest.case_count,1);
  assert.equal(result.manifest.training_eligible_count,0);
  assert.deepEqual((await fs.readdir(fixture.outputDir)).sort(),['cases.jsonl','manifest.json','reports','splits.json']);
  assert.ok((await fs.stat(path.join(fixture.localArtifactRoot,'cases','house-a-small-modern-house','plan.raw.json'))).isFile());
  const cases=await fs.readFile(path.join(fixture.outputDir,'cases.jsonl'),'utf8');
  assert.equal(cases.includes('block_array'),false);
  assert.equal(cases.includes('Blocks'),false);
});

test('Stage 7 dataset CLI fails when required eligible cases are unavailable', async (t) => {
  const fixture=await createFixture(t);
  const result=runCli(['--root',fixture.templateRoot,'--knowledge-base',fixture.knowledgeBasePath,'--out',fixture.outputDir,'--local-artifacts',fixture.localArtifactRoot,'--require-eligible','1']);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/requires 1 eligible cases, found 0/);
});

test('Stage 7 dataset CLI documents options and rejects duplicate cases', () => {
  const help=runCli(['--help']);
  assert.equal(help.status,0,help.stderr);
  assert.match(help.stdout,/--require-eligible/);
  assert.match(help.stdout,/--local-artifacts/);
  const invalid=runCli(['--case','a','--case','a']);
  assert.notEqual(invalid.status,0);
  assert.match(invalid.stderr,/duplicate case id/i);
});
