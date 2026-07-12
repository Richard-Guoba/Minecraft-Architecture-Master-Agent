import test from 'node:test';
import assert from 'node:assert/strict';
import { applyStage7DatasetCorrections } from '../src/construction/learning/coarseSemanticVoxelDatasetCorrections.js';

test('semantic corrections deterministically set and clear canonical cells', () => {
  const input=[{x:1,y:1,z:1,envelope:'wall',space:'public',site:'none',confidence:0.8,evidence_ids:['source:fixture']}];
  const corrections=[
    {operation:'set',coordinate:[2,1,1],layer:'envelope',value:'opening',confidence:1,reason:'Reviewed entrance.'},
    {operation:'clear',coordinate:[1,1,1],layer:'space',reason:'Reviewed exterior void.'}
  ];
  const first=applyStage7DatasetCorrections({cells:input,corrections,evidenceId:'review:r1'});
  const second=applyStage7DatasetCorrections({cells:input,corrections,evidenceId:'review:r1'});
  assert.deepEqual(first,second);
  assert.deepEqual(first.applied.map((item)=>item.operation),['set','clear']);
  assert.equal(first.cells.find((item)=>item.x===2).envelope,'opening');
  assert.equal(first.cells.find((item)=>item.x===1).space,'outside');
  assert.deepEqual(first.cells.find((item)=>item.x===2).evidence_ids,['review:r1']);
  assert.equal(input.length,1);
  assert.equal(input[0].space,'public');
});

test('semantic corrections reject bounds, vocabulary, and missing reasons', () => {
  assert.throws(()=>applyStage7DatasetCorrections({cells:[],evidenceId:'review:invalid',corrections:[
    {operation:'set',coordinate:[64,0,0],layer:'envelope',value:'wall',confidence:1,reason:'Bad coordinate.'}
  ]}),/coordinate/);
  assert.throws(()=>applyStage7DatasetCorrections({cells:[],evidenceId:'review:invalid',corrections:[
    {operation:'set',coordinate:[1,0,0],layer:'envelope',value:'entrance',confidence:1,reason:'Bad vocabulary.'}
  ]}),/value/);
  assert.throws(()=>applyStage7DatasetCorrections({cells:[],evidenceId:'review:invalid',corrections:[
    {operation:'clear',coordinate:[1,0,0],layer:'site',reason:''}
  ]}),/reason/);
});

test('clearing the last semantic value removes the logical cell', () => {
  const result=applyStage7DatasetCorrections({cells:[
    {x:3,y:2,z:1,envelope:'none',space:'outside',site:'path',confidence:0.9,evidence_ids:['source:fixture']}
  ],corrections:[{operation:'clear',coordinate:[3,2,1],layer:'site',reason:'No path on review.'}],evidenceId:'review:r2'});
  assert.deepEqual(result.cells,[]);
});
