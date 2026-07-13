import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readSchematicBlockVolume } from '../templates/schematicBlockVolume.js';
import { STAGE7_DATASET_EXTRACTOR, STAGE7_DATASET_EXTRACTOR_V3, buildStage7DatasetCase, renderStage7DatasetCaseReport } from './coarseSemanticVoxelDatasetCase.js';
import { STAGE7_PILOT_CASE_IDS, mergeStage7DatasetReviews, parseStage7DatasetReviewOverlay } from './stage7DatasetReviewOverlay.js';

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

export function buildStage7DatasetIndex({records=[],generatedAt=stableGeneratedAt(),datasetVersion=STAGE7_DATASET_VERSION}={}) {
  const config=datasetConfig(datasetVersion);
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
    source:config.source,schema_version:config.schemaVersion,dataset_version:datasetVersion,
    ...(config.parent?{parent_dataset_version:config.parent}:{}),
    generated_at:generatedAt,extractor:config.extractor,split_algorithm:STAGE7_DATASET_SPLIT_ALGORITHM,
    case_count:sorted.length,training_eligible_count:trainingCaseIds.length,training_case_ids:trainingCaseIds,
    origin_counts:countBy(sorted,'origin'),split_counts:countBy(sorted,'split'),
    artifacts:{cases:'cases.jsonl',splits:'splits.json',reports:'reports/',...(config.readiness?{readiness:'reports/readiness.md'}:{})}
  };
  const result={manifest,records:sorted,splits};
  if (config.readiness) {
    result.readiness=buildStage7DatasetReadiness(result);
    manifest.reviewed_count=result.readiness.reviewed_count;
    manifest.semantic_accepted_count=result.readiness.semantic_accepted_count;
    manifest.ready_for_m3_real_data=result.readiness.ready_for_m3_real_data;
  }
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
    if (!record?.source||!Object.hasOwn(record.source,'license_status')||!Array.isArray(record.source.allowed_uses)||!Object.hasOwn(record.source,'license_evidence')) errors.push(`missing license provenance: ${id}`);
    if (!Array.isArray(record?.normalized_transform?.resolution)||record.normalized_transform.resolution.join(',')!=='64,64,64') errors.push(`missing normalized transform: ${id}`);
    if (!/^[a-f0-9]{64}$/.test(record?.artifacts?.condition_sha256||'')) errors.push(`missing condition hash: ${id}`);
    if (!/^[a-f0-9]{64}$/.test(record?.artifacts?.plan_sha256||'')) errors.push(`missing plan hash: ${id}`);
    if (splits?.assignments?.[id]!==record?.split) errors.push(`split assignment mismatch: ${id}`);
    if (manifest.dataset_version==='v3') {
      if (!/^[a-f0-9]{64}$/.test(record?.artifacts?.review_plan_sha256||'')) errors.push(`missing v3 review plan hash: ${id}`);
      if (record?.extraction?.extractor_version!==STAGE7_DATASET_EXTRACTOR_V3) errors.push(`missing v3 extractor version: ${id}`);
      if (!['accepted','rejected','pending-review'].includes(record?.extraction?.semantic_status)) errors.push(`invalid v3 semantic status: ${id}`);
      if (!['accepted','rejected'].includes(record?.extraction?.automated_semantic_status)) errors.push(`invalid v3 automated semantic status: ${id}`);
      if (!Array.isArray(record?.extraction?.repair_classes)||!Array.isArray(record?.extraction?.repair_audit)) errors.push(`missing v3 repair diagnostics: ${id}`);
      if (!record?.extraction?.topology||typeof record.extraction.topology!=='object') errors.push(`missing v3 topology diagnostics: ${id}`);
      if (record?.training?.eligible&&record.extraction.semantic_status!=='accepted') errors.push(`v3 eligible case lacks plan-bound semantic acceptance: ${id}`);
    }
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
  let config;
  try { config=datasetConfig(manifest.dataset_version); } catch { config=null; }
  if (!config||manifest.source!==config.source) errors.push('unsupported dataset source');
  if (!config||manifest.schema_version!==config.schemaVersion) errors.push('unsupported dataset schema version');
  if (config) for (const record of records) if (record.dataset_version!==manifest.dataset_version) errors.push(`dataset version mismatch: ${record.case_id}`);
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

export function buildStage7DatasetReadiness({records=[]}={}, {pilotCaseIds=STAGE7_PILOT_CASE_IDS}={}) {
  const ids=[...new Set(pilotCaseIds.map(String))];
  const byId=new Map(records.map((record)=>[record.case_id,record]));
  const pilot=ids.map((id)=>byId.get(id)).filter(Boolean);
  const explicitStatuses=new Set(['approved','limited','rejected','research-only']);
  const reviewed=pilot.filter((record)=>explicitStatuses.has(record.review?.status)&&Boolean(record.review?.reviewed_by)&&Number.isFinite(Date.parse(record.review?.reviewed_at)));
  const accepted=pilot.filter((record)=>record.extraction?.semantic_status==='accepted');
  const eligible=pilot.filter((record)=>record.training?.eligible);
  const intersection=pilot.filter((record)=>record.training?.eligible&&record.extraction?.semantic_status==='accepted');
  const blockers={};
  for (const record of pilot) for (const blocker of record.training?.blockers||[]) blockers[blocker]=(blockers[blocker]||0)+1;
  return {
    source:'stage7-dataset-readiness-v1',schema_version:1,pilot_case_ids:ids,pilot_count:ids.length,present_count:pilot.length,
    reviewed_count:reviewed.length,semantic_accepted_count:accepted.length,training_eligible_count:eligible.length,
    eligible_semantic_accepted_count:intersection.length,eligible_semantic_accepted_case_ids:intersection.map((record)=>record.case_id).sort(),
    remaining_blockers:Object.fromEntries(Object.entries(blockers).sort(([a],[b])=>a.localeCompare(b))),
    ready_for_m3_real_data:pilot.length===ids.length&&reviewed.length===ids.length&&intersection.length>=3
  };
}

export function renderStage7DatasetReadiness(readiness={}) {
  const blockers=Object.entries(readiness.remaining_blockers||{}).map(([key,count])=>`| ${key} | ${count} |`).join('\n')||'| none | 0 |';
  return `# Stage 7 M2.5 Data Readiness\n\n- Pilot cases: ${readiness.pilot_count||0}\n- Present: ${readiness.present_count||0}\n- Explicit review outcomes: ${readiness.reviewed_count||0}\n- Semantic accepted: ${readiness.semantic_accepted_count||0}\n- Training eligible: ${readiness.training_eligible_count||0}\n- Eligible and semantic accepted: ${readiness.eligible_semantic_accepted_count||0}\n- Ready for M3 real data: ${readiness.ready_for_m3_real_data?'yes':'no'}\n\n## Remaining Blockers\n\n| Blocker | Count |\n| --- | ---: |\n${blockers}\n`;
}

export async function writeStage7DatasetArtifacts({templateRoot='mc_templates',knowledgeBasePath,outputDir,localArtifactRoot='.tmp/stage7-dataset/v1',caseIds=[],requireEligible=0,requireReviewed=0,requireSemanticAccepted=0,datasetVersion=STAGE7_DATASET_VERSION,reviewOverlayPath}={}) {
  const config=datasetConfig(datasetVersion);
  const root=path.resolve(templateRoot);
  const kbPath=path.resolve(knowledgeBasePath||path.join(root,'analysis','case_library.v2.json'));
  const target=path.resolve(outputDir||path.join(root,'datasets','coarse_semantic_voxels',datasetVersion));
  const localRoot=path.resolve(localArtifactRoot);
  const required=Number(requireEligible);
  if (!Number.isInteger(required)||required<0) throw new Error('requireEligible must be a non-negative integer');
  const requiredReviewed=nonNegativeInteger(requireReviewed,'requireReviewed');
  const requiredSemanticAccepted=nonNegativeInteger(requireSemanticAccepted,'requireSemanticAccepted');
  const requested=[...caseIds].map(String);
  if (new Set(requested).size!==requested.length) throw new Error('duplicate case id in Stage 7 dataset filter');
  const knowledgeBase=JSON.parse(await fs.readFile(kbPath,'utf8'));
  if (!knowledgeBase||!Array.isArray(knowledgeBase.cases)) throw new Error('Stage 7 dataset knowledge base requires a cases array');
  const byId=new Map(knowledgeBase.cases.map((record)=>[record.case_id,record]));
  for (const id of requested) if (!byId.has(id)) throw new Error(`unknown Stage 7 dataset case id: ${id}`);
  const selected=(requested.length?requested.map((id)=>byId.get(id)):knowledgeBase.cases).sort((a,b)=>String(a.case_id).localeCompare(String(b.case_id)));
  let reviews=new Map();
  if (reviewOverlayPath) {
    const parsed=parseStage7DatasetReviewOverlay(await fs.readFile(path.resolve(reviewOverlayPath),'utf8'),{strict:true});
    reviews=mergeStage7DatasetReviews(parsed.records);
  }
  const records=[];
  for (const caseRecord of selected) {
    const sourcePath=path.resolve(root,caseRecord.file||'');
    if (!isWithin(root,sourcePath)) throw new Error(`Stage 7 source path escapes template root: ${caseRecord.file}`);
    const volume=await readSchematicBlockVolume(sourcePath);
    const reviewRecord=reviews.get(caseRecord.case_id)||null;
    if (reviewRecord&&reviewRecord.source_sha256!==volume.source_sha256) throw new Error(`source hash mismatch for ${caseRecord.case_id}`);
    const reviewedCase=reviewRecord?mergeDatasetReview(caseRecord,reviewRecord):caseRecord;
    const item=buildStage7DatasetCase({volume,caseRecord:reviewedCase,reviewRecord,datasetVersion,localArtifactRoot:localRoot});
    const caseDir=path.join(localRoot,'cases',item.record.case_id);
    await fs.mkdir(caseDir,{recursive:true});
    await writeJson(path.join(caseDir,'condition.json'),item.condition);
    await writeJson(path.join(caseDir,'plan.raw.json'),item.rawPlan);
    if (item.repairedPlan) await writeJson(path.join(caseDir,'plan.repaired.json'),item.repairedPlan);
    records.push(item.record);
  }
  const indexed=buildStage7DatasetIndex({records,datasetVersion});
  const validation=validateStage7Dataset(indexed);
  if (!validation.ok) throw new Error(`invalid Stage 7 dataset: ${validation.errors.join('; ')}`);
  for (const record of indexed.records) {
    const caseDir=path.join(localRoot,'cases',record.case_id);
    await fs.writeFile(path.join(caseDir,'report.md'),renderStage7DatasetCaseReport(record),'utf8');
  }
  await writeCanonicalDirectory(target,indexed);
  const reviewedCount=indexed.readiness?.reviewed_count||0;
  const semanticAcceptedCount=indexed.readiness?.semantic_accepted_count||0;
  if (reviewedCount<requiredReviewed) throw new Error(`Stage 7 dataset requires ${requiredReviewed} reviewed cases, found ${reviewedCount}`);
  if (semanticAcceptedCount<requiredSemanticAccepted) throw new Error(`Stage 7 dataset requires ${requiredSemanticAccepted} semantic-accepted cases, found ${semanticAcceptedCount}`);
  if (indexed.manifest.training_eligible_count<required) throw new Error(`Stage 7 dataset requires ${required} eligible cases, found ${indexed.manifest.training_eligible_count}`);
  return {
    ...indexed,outputDir:target,localArtifactRoot:localRoot,
    artifacts:{manifest:path.join(target,'manifest.json'),cases:path.join(target,'cases.jsonl'),splits:path.join(target,'splits.json'),report:path.join(target,'reports','summary.md')}
  };
}

function datasetConfig(version) {
  if (version==='v1') return {source:STAGE7_DATASET_SOURCE,schemaVersion:STAGE7_DATASET_SCHEMA_VERSION,extractor:STAGE7_DATASET_EXTRACTOR,parent:null,readiness:false};
  if (version==='v2') return {source:'stage7-coarse-semantic-voxel-dataset-v2',schemaVersion:2,extractor:STAGE7_DATASET_EXTRACTOR,parent:'v1',readiness:true};
  if (version==='v3') return {source:'stage7-coarse-semantic-voxel-dataset-v3',schemaVersion:3,extractor:STAGE7_DATASET_EXTRACTOR_V3,parent:'v2',readiness:true};
  throw new Error(`unsupported Stage 7 dataset version: ${version}`);
}

function mergeDatasetReview(caseRecord,review) {
  return {
    ...caseRecord,
    source:{
      ...caseRecord.source,author:review.source_author,uploader:review.source_uploader,author_evidence:review.author_evidence,
      license_status:review.license_status,allowed_uses:[...review.allowed_uses],license_evidence:review.license_evidence,
      public_release_allowed:review.allowed_uses.includes('public-release')
    },
    review:{...caseRecord.review,status:review.status,reviewed_by:review.reviewed_by,reviewed_at:review.reviewed_at,approved_learning_areas:[...review.approved_learning_areas],blocked_learning_areas:[...review.blocked_learning_areas],canonical_front_side:review.canonical_front_side,review_record_ids:[...(review.review_record_ids||[review.record_id])]}
  };
}

async function writeCanonicalDirectory(target,indexed) {
  const parent=path.dirname(target);
  const base=path.basename(target);
  await fs.mkdir(parent,{recursive:true});
  const nonce=`${process.pid}-${Date.now()}`;
  const temporary=path.join(parent,`.${base}.tmp-${nonce}`);
  const backup=path.join(parent,`.${base}.backup-${nonce}`);
  ensureChild(parent,temporary); ensureChild(parent,backup);
  await fs.mkdir(path.join(temporary,'reports'),{recursive:true});
  await writeJson(path.join(temporary,'manifest.json'),indexed.manifest);
  await fs.writeFile(path.join(temporary,'cases.jsonl'),stage7DatasetCasesJsonl(indexed.records),'utf8');
  await writeJson(path.join(temporary,'splits.json'),indexed.splits);
  await fs.writeFile(path.join(temporary,'reports','summary.md'),renderStage7DatasetReport(indexed),'utf8');
  if (indexed.readiness) await fs.writeFile(path.join(temporary,'reports','readiness.md'),renderStage7DatasetReadiness(indexed.readiness),'utf8');
  let backedUp=false;
  try {
    if (await exists(target)) { await fs.rename(target,backup); backedUp=true; }
    await fs.rename(temporary,target);
    if (backedUp) await fs.rm(backup,{recursive:true,force:true});
  } catch (error) {
    if (backedUp&&!(await exists(target))&&await exists(backup)) await fs.rename(backup,target);
    if (await exists(temporary)) await fs.rm(temporary,{recursive:true,force:true});
    throw error;
  }
}

async function writeJson(file,value) { await fs.writeFile(file,`${JSON.stringify(value,null,2)}\n`,'utf8'); }
async function exists(file) { try { await fs.stat(file); return true; } catch (error) { if (error.code==='ENOENT') return false; throw error; } }
function isWithin(root,candidate) { return candidate===root||candidate.startsWith(`${root}${path.sep}`); }
function ensureChild(parent,candidate) { if (!candidate.startsWith(`${path.resolve(parent)}${path.sep}`)) throw new Error(`unsafe Stage 7 dataset path: ${candidate}`); }

function stableGeneratedAt() {
  const seconds=Number(process.env.SOURCE_DATE_EPOCH);
  return Number.isFinite(seconds)&&process.env.SOURCE_DATE_EPOCH!==undefined?new Date(seconds*1000).toISOString():'2026-07-12T00:00:00.000Z';
}
function countBy(records,field) { const result={}; for (const record of records) { const key=record[field]||'unknown'; result[key]=(result[key]||0)+1; } return result; }
function countNested(records,owner,field) { const result={}; for (const record of records) { const key=record?.[owner]?.[field]||'unknown'; result[key]=(result[key]||0)+1; } return result; }
function nonNegativeInteger(value,name) { const parsed=Number(value); if (!Number.isInteger(parsed)||parsed<0) throw new Error(`${name} must be a non-negative integer`); return parsed; }
