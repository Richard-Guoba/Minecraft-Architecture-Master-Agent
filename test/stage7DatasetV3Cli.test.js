import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseStage7DatasetArgs } from '../src/buildCoarseSemanticVoxelDataset.js';
import { writeStage7DatasetArtifacts } from '../src/construction/learning/coarseSemanticVoxelDataset.js';

test('Stage 7 dataset CLI accepts v3', () => {
  assert.equal(parseStage7DatasetArgs(['--dataset-version','v3']).datasetVersion,'v3');
});

test('failed v3 source validation leaves an existing canonical target untouched', async (t) => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'stage7-v3-atomic-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const target=path.join(root,'out');
  await fs.mkdir(target,{recursive:true});
  await fs.writeFile(path.join(target,'sentinel.txt'),'unchanged','utf8');
  const knowledgeBase=path.join(root,'kb.json');
  await fs.writeFile(knowledgeBase,JSON.stringify({cases:[{case_id:'bad',file:'../escape.schematic'}]}),'utf8');
  await assert.rejects(
    writeStage7DatasetArtifacts({templateRoot:root,knowledgeBasePath:knowledgeBase,outputDir:target,datasetVersion:'v3'}),
    /escapes template root/
  );
  assert.equal(await fs.readFile(path.join(target,'sentinel.txt'),'utf8'),'unchanged');
  assert.deepEqual((await fs.readdir(target)).sort(),['sentinel.txt']);
});
