import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeStage7DatasetReviews,
  parseStage7DatasetReviewOverlay,
  validateStage7DatasetReviewRecord
} from '../src/construction/learning/stage7DatasetReviewOverlay.js';

const HASH='a'.repeat(64);

function completeReview(overrides={}) {
  return {
    record_id:'review-pilot-1',case_id:'house-tavern',source_sha256:HASH,
    reviewed_by:'human-curator',reviewed_at:'2026-07-12T00:00:00.000Z',status:'limited',
    canonical_front_side:'south',license_status:'restricted',
    allowed_uses:['local-analysis','local-training'],license_evidence:'Terms captured by the human curator.',
    approved_learning_areas:['envelope','space','site'],blocked_learning_areas:[],
    semantic_corrections:[],notes:'Pilot review.',...overrides
  };
}

test('Stage 7 review overlay accepts a source-bound complete positive review', () => {
  const parsed=parseStage7DatasetReviewOverlay(JSON.stringify(completeReview()),{
    knownCases:new Map([['house-tavern',HASH]])
  });
  assert.deepEqual(parsed.errors,[]);
  assert.equal(parsed.records[0].source_sha256,HASH);
  assert.deepEqual(parsed.records[0].semantic_corrections,[]);
  assert.deepEqual(parsed.records[0].approved_learning_areas,['envelope','site','space']);
});

test('Stage 7 review overlay rejects stale hashes and incomplete positive reviews', () => {
  const stale=parseStage7DatasetReviewOverlay(JSON.stringify(completeReview()),{
    knownCases:new Map([['house-tavern','b'.repeat(64)]])
  });
  assert.match(stale.errors[0].message,/source hash mismatch/);
  const incomplete=parseStage7DatasetReviewOverlay(JSON.stringify(completeReview({reviewed_by:''})));
  assert.match(incomplete.errors[0].message,/reviewed_by/);
});

test('Stage 7 review overlay validates sparse correction shapes', () => {
  const record=completeReview({semantic_corrections:[
    {operation:'set',coordinate:[2,1,1],layer:'envelope',value:'opening',confidence:1,reason:'Reviewed entrance.'},
    {operation:'clear',coordinate:[1,1,1],layer:'space',reason:'Reviewed exterior void.'}
  ]});
  assert.equal(validateStage7DatasetReviewRecord(record).ok,true);
  const invalid=parseStage7DatasetReviewOverlay(JSON.stringify(completeReview({semantic_corrections:[
    {operation:'set',coordinate:[64,0,0],layer:'envelope',value:'wall',confidence:1,reason:'Out of bounds.'}
  ]})));
  assert.match(invalid.errors[0].message,/coordinate/);
});

test('Stage 7 review overlay rejects duplicate record ids and unknown fields', () => {
  const duplicate=parseStage7DatasetReviewOverlay([JSON.stringify(completeReview()),JSON.stringify(completeReview())].join('\n'));
  assert.match(duplicate.errors[0].message,/duplicate record_id/);
  const unknown=parseStage7DatasetReviewOverlay(JSON.stringify(completeReview({invented_permission:true})));
  assert.match(unknown.errors[0].message,/unknown review field/);
});

test('latest review wins while all record ids remain in lineage', () => {
  const first=completeReview({record_id:'r1',reviewed_at:'2026-07-12T00:00:00.000Z'});
  const second=completeReview({record_id:'r2',reviewed_at:'2026-07-12T01:00:00.000Z',status:'rejected',approved_learning_areas:[]});
  const merged=mergeStage7DatasetReviews([first,second]);
  assert.equal(merged.get('house-tavern').status,'rejected');
  assert.deepEqual(merged.get('house-tavern').review_record_ids,['r1','r2']);
});
