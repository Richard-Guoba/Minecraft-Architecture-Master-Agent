import { createHash } from 'node:crypto';
import { STAGE7_DATASET_EXTRACTOR } from './coarseSemanticVoxelDatasetCase.js';

export const STAGE7_DATASET_SOURCE='stage7-coarse-semantic-voxel-dataset-v1';
export const STAGE7_DATASET_SCHEMA_VERSION=1;
export const STAGE7_DATASET_VERSION='v1';
export const STAGE7_DATASET_SPLIT_ALGORITHM='sha256-case-id-v1';
export const STAGE7_SPLIT_RATIOS=Object.freeze({train:80,validation:10,test:10});

export function assignStage7DatasetSplit({caseId,origin='real',parentSplit}={}) {
  if (origin==='augmented') {
    if (!['train','validation','test'].includes(parentSplit)) throw new Error('augmented case requires parentSplit');
    return parentSplit;
  }
  if (origin==='synthetic') return 'train';
  if (origin!=='real') throw new Error(`unsupported Stage 7 dataset origin: ${origin}`);
  if (!caseId) throw new Error('Stage 7 dataset split requires caseId');
  const bucket=Number.parseInt(createHash('sha256').update(String(caseId)).digest('hex').slice(0,8),16)%100;
  return bucket<80?'train':bucket<90?'validation':'test';
}

export function buildStage7DatasetIndex({records=[],generatedAt=stableGeneratedAt()}={}) {
  const sorted=[...records].map((record)=>structuredClone(record)).sort((a,b)=>String(a.case_id).localeCompare(String(b.case_id)));
  const ids=new Set();
  for (const record of sorted) {
    if (!record.case_id||ids.has(record.case_id)) throw new Error(`duplicate Stage 7 dataset case id: ${record.case_id||'missing'}`);
    ids.add(record.case_id);
  }
  const sourceSplits=new Map();
  for (const record of sorted.filter((item)=>item.origin!=='augmented')) {
    record.split=assignStage7DatasetSplit({caseId:record.case_id,origin:record.origin});
    sourceSplits.set(record.case_id,record.split);
  }
  for (const record of sorted.filter((item)=>item.origin==='augmented')) {
    record.split=assignStage7DatasetSplit({caseId:record.case_id,origin:record.origin,parentSplit:sourceSplits.get(record.parent_case_id)});
  }
  const assignments=Object.fromEntries(sorted.map((record)=>[record.case_id,record.split]));
  const splits={source:'stage7-coarse-semantic-voxel-splits-v1',schema_version:1,algorithm:STAGE7_DATASET_SPLIT_ALGORITHM,ratios:{...STAGE7_SPLIT_RATIOS},assignments};
  const trainingCaseIds=sorted.filter((record)=>record.training?.eligible).map((record)=>record.case_id).sort();
  const manifest={
    source:STAGE7_DATASET_SOURCE,schema_version:STAGE7_DATASET_SCHEMA_VERSION,dataset_version:STAGE7_DATASET_VERSION,
    generated_at:generatedAt,extractor:STAGE7_DATASET_EXTRACTOR,split_algorithm:STAGE7_DATASET_SPLIT_ALGORITHM,
    case_count:sorted.length,training_eligible_count:trainingCaseIds.length,training_case_ids:trainingCaseIds,
    origin_counts:countBy(sorted,'origin'),split_counts:countBy(sorted,'split'),
    artifacts:{cases:'cases.jsonl',splits:'splits.json',reports:'reports/'}
  };
  const result={manifest,records:sorted,splits};
  const validation=validateStage7Dataset(result);
  if (!validation.ok) throw new Error(`invalid Stage 7 dataset index: ${validation.errors.join('; ')}`);
  return result;
}

export function validateStage7Dataset({manifest={},records=[],splits={}}={}) {
  const errors=[];
  const ids=new Set();
  const byId=new Map();
  for (const record of Array.isArray(records)?records:[]) {
    const id=String(record?.case_id||'');
    if (!id) errors.push('dataset case id is required');
    else if (ids.has(id)) errors.push(`duplicate case id: ${id}`);
    else { ids.add(id); byId.set(id,record); }
    if (!/^[a-f0-9]{64}$/.test(record?.source?.sha256||'')) errors.push(`invalid source SHA-256: ${id||'unknown'}`);
    if (!['real','synthetic','augmented'].includes(record?.origin)) errors.push(`unsupported origin: ${id||'unknown'}`);
    if (!['train','validation','test'].includes(record?.split)) errors.push(`unsupported split: ${id||'unknown'}`);
    if (record?.origin==='synthetic'&&record.split!=='train') errors.push(`synthetic case cannot enter held-out split: ${id}`);
    if (!record?.review||!Object.hasOwn(record.review,'status')||!Array.isArray(record.review.approved_learning_areas)) errors.push(`missing review provenance: ${id}`);
    if (!record?.source||!Object.hasOwn(record.source,'license_status')||!Array.isArray(record.source.allowed_uses)) errors.push(`missing license provenance: ${id}`);
    if (!Array.isArray(record?.normalized_transform?.resolution)||record.normalized_transform.resolution.join(',')!=='64,64,64') errors.push(`missing normalized transform: ${id}`);
    if (!/^[a-f0-9]{64}$/.test(record?.artifacts?.condition_sha256||'')) errors.push(`missing condition hash: ${id}`);
    if (!/^[a-f0-9]{64}$/.test(record?.artifacts?.plan_sha256||'')) errors.push(`missing plan hash: ${id}`);
    if (splits?.assignments?.[id]!==record?.split) errors.push(`split assignment mismatch: ${id}`);
  }
  for (const record of Array.isArray(records)?records:[]) {
    if (record?.origin!=='augmented') continue;
    const parent=byId.get(record.parent_case_id);
    if (!parent||parent.split!==record.split) errors.push(`source-case leakage: ${record.case_id}`);
  }
  for (const id of manifest.training_case_ids||[]) {
    const record=byId.get(id);
    if (!record?.training?.eligible) errors.push(`ineligible training case: ${id}`);
  }
  if (Number(manifest.case_count)!==(Array.isArray(records)?records.length:0)) errors.push('manifest case count mismatch');
  const eligible=(Array.isArray(records)?records:[]).filter((record)=>record?.training?.eligible).length;
  if (Number(manifest.training_eligible_count)!==eligible) errors.push('manifest training eligible count mismatch');
  if (manifest.source!==STAGE7_DATASET_SOURCE) errors.push('unsupported dataset source');
  if (manifest.schema_version!==STAGE7_DATASET_SCHEMA_VERSION) errors.push('unsupported dataset schema version');
  return {ok:errors.length===0,errors:[...new Set(errors)].sort()};
}

export function stage7DatasetCasesJsonl(records=[]) {
  const values=[...records].sort((a,b)=>String(a.case_id).localeCompare(String(b.case_id)));
  return values.length?`${values.map((record)=>JSON.stringify(record)).join('\n')}\n`:'';
}

export function renderStage7DatasetReport({manifest={},records=[]}={}) {
  const blockers={};
  for (const record of records) for (const blocker of record.training?.blockers||[]) blockers[blocker]=(blockers[blocker]||0)+1;
  const blockerRows=Object.entries(blockers).sort(([a],[b])=>a.localeCompare(b)).map(([key,count])=>`| ${key} | ${count} |`).join('\n')||'| none | 0 |';
  return `# Stage 7 M2 Dataset ${manifest.dataset_version||'v1'}\n\n- Cases: ${manifest.case_count||0}\n- Training eligible: ${manifest.training_eligible_count||0}\n- Origins: ${JSON.stringify(manifest.origin_counts||{})}\n- Splits: ${JSON.stringify(manifest.split_counts||{})}\n- Review states: ${JSON.stringify(countNested(records,'review','status'))}\n- License states: ${JSON.stringify(countNested(records,'source','license_status'))}\n- Semantic status: ${JSON.stringify(countNested(records,'extraction','semantic_status'))}\n\n## Training Blockers\n\n| Blocker | Count |\n| --- | ---: |\n${blockerRows}\n`;
}

function stableGeneratedAt() {
  const seconds=Number(process.env.SOURCE_DATE_EPOCH);
  return Number.isFinite(seconds)&&process.env.SOURCE_DATE_EPOCH!==undefined?new Date(seconds*1000).toISOString():'2026-07-12T00:00:00.000Z';
}
function countBy(records,field) { const result={}; for (const record of records) { const key=record[field]||'unknown'; result[key]=(result[key]||0)+1; } return result; }
function countNested(records,owner,field) { const result={}; for (const record of records) { const key=record?.[owner]?.[field]||'unknown'; result[key]=(result[key]||0)+1; } return result; }
