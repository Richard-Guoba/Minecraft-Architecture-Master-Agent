import { ENVELOPE_VALUES, SITE_VALUES, SPACE_VALUES } from './coarseSemanticVoxelSchema.js';

export const STAGE7_PILOT_CASE_IDS=Object.freeze([
  'house-a-small-modern-house','house-lakehouse','house-tavern','house-watermill',
  'house-wood-modern-house','temples-japanese-pagoda-plus-tea-house'
]);

const ROOT_FIELDS=new Set([
  'record_id','case_id','source_sha256','reviewed_by','reviewed_at','status','canonical_front_side',
  'source_author','source_uploader','author_evidence',
  'license_status','allowed_uses','license_evidence','approved_learning_areas','blocked_learning_areas',
  'semantic_corrections','notes','dataset_version','extractor_version','plan_sha256'
]);
const STATUSES=new Set(['pending','approved','limited','rejected','research-only']);
const EXPLICIT_STATUSES=new Set(['approved','limited','rejected','research-only']);
const POSITIVE_STATUSES=new Set(['approved','limited']);
const LICENSE_STATUSES=new Set(['unknown','verified','restricted','prohibited']);
const ALLOWED_USES=new Set(['local-analysis','local-training','derived-metadata','public-release']);
const TARGET_LAYERS=new Set(['envelope','site','space']);
const FRONT_SIDES=new Set(['north','south','east','west']);
const VOCABULARY={envelope:new Set(ENVELOPE_VALUES),space:new Set(SPACE_VALUES),site:new Set(SITE_VALUES)};

export function parseStage7DatasetReviewOverlay(text='',options={}) {
  const records=[]; const errors=[]; const recordIds=new Set();
  String(text||'').split(/\r?\n/u).forEach((line,index)=>{
    if (!line.trim()) return;
    try {
      const raw=JSON.parse(line);
      const record=normalizeRecord(raw);
      if (recordIds.has(record.record_id)) throw new Error(`duplicate record_id ${record.record_id}`);
      recordIds.add(record.record_id);
      const validation=validateStage7DatasetReviewRecord(record,options);
      if (!validation.ok) throw new Error(validation.errors.join('; '));
      records.push(record);
    } catch (error) {
      const message=error instanceof SyntaxError?`invalid json: ${error.message}`:error.message;
      errors.push({line:index+1,message});
      if (options.strict) throw new Error(`Invalid Stage 7 dataset review line ${index+1}: ${message}`);
    }
  });
  return {records,errors};
}

export function validateStage7DatasetReviewRecord(record={}, {knownCases}={}) {
  const errors=[];
  if (!record.record_id) errors.push('record_id is required');
  if (!record.case_id) errors.push('case_id is required');
  if (!/^[a-f0-9]{64}$/.test(record.source_sha256||'')) errors.push('source_sha256 must be lowercase SHA-256');
  if (knownCases?.has(record.case_id)) {
    const known=knownCases.get(record.case_id);
    const expected=typeof known==='string'?known:known?.source_sha256||known?.sha256;
    if (expected&&expected!==record.source_sha256) errors.push(`source hash mismatch for ${record.case_id}`);
  }
  if (!STATUSES.has(record.status)) errors.push(`invalid status ${record.status||'missing'}`);
  if (EXPLICIT_STATUSES.has(record.status)&&!record.author_evidence) errors.push('author_evidence is required for explicit review outcomes');
  if (POSITIVE_STATUSES.has(record.status)&&!record.source_author&&!record.source_uploader) errors.push('approved or limited reviews require source_author or source_uploader');
  if (!LICENSE_STATUSES.has(record.license_status)) errors.push(`invalid license_status ${record.license_status||'missing'}`);
  if (record.canonical_front_side!==null&&!FRONT_SIDES.has(record.canonical_front_side)) errors.push(`invalid canonical_front_side ${record.canonical_front_side}`);
  for (const use of record.allowed_uses||[]) if (!ALLOWED_USES.has(use)) errors.push(`invalid allowed_uses value ${use}`);
  for (const layer of [...(record.approved_learning_areas||[]),...(record.blocked_learning_areas||[])]) {
    if (!TARGET_LAYERS.has(layer)) errors.push(`invalid Stage 7 learning area ${layer}`);
  }
  const approved=new Set(record.approved_learning_areas||[]); const blocked=new Set(record.blocked_learning_areas||[]);
  for (const layer of approved) if (blocked.has(layer)) errors.push(`learning area cannot be approved and blocked: ${layer}`);
  const scoped=[record.dataset_version,record.extractor_version,record.plan_sha256];
  if (scoped.some(Boolean)&&!scoped.every(Boolean)) errors.push('review scope requires dataset_version, extractor_version, and plan_sha256');
  if (record.plan_sha256&&!/^[a-f0-9]{64}$/.test(record.plan_sha256)) errors.push('plan_sha256 must be lowercase SHA-256');
  if (record.dataset_version&&record.dataset_version!=='v3') errors.push(`unsupported review dataset_version ${record.dataset_version}`);
  if (scoped.every(Boolean)) {
    if (!record.reviewed_by) errors.push('scoped semantic review requires reviewed_by');
    if (!Number.isFinite(Date.parse(record.reviewed_at))) errors.push('scoped semantic review requires reviewed_at');
    for (const layer of TARGET_LAYERS) if (!approved.has(layer)&&!blocked.has(layer)) errors.push(`scoped semantic review requires an explicit ${layer} decision`);
  }
  if (['approved','limited'].includes(record.status)) {
    if (!record.reviewed_by) errors.push('positive review requires reviewed_by');
    if (!Number.isFinite(Date.parse(record.reviewed_at))) errors.push('positive review requires reviewed_at');
    if (!record.license_evidence) errors.push('positive review requires license_evidence');
    if (!FRONT_SIDES.has(record.canonical_front_side)) errors.push('positive review requires canonical_front_side');
    for (const layer of TARGET_LAYERS) if (!approved.has(layer)&&!blocked.has(layer)) errors.push(`positive review requires an explicit ${layer} decision`);
  }
  if ((record.semantic_corrections||[]).length) {
    if (!record.reviewed_by) errors.push('semantic corrections require reviewed_by');
    if (!Number.isFinite(Date.parse(record.reviewed_at))) errors.push('semantic corrections require reviewed_at');
  }
  for (const correction of record.semantic_corrections||[]) {
    try { validateCorrection(correction); } catch (error) { errors.push(error.message); }
  }
  return {ok:errors.length===0,errors:[...new Set(errors)].sort()};
}

export function mergeStage7DatasetReviews(records=[]) {
  const byCase=new Map(); const lineage=new Map();
  for (const input of records) {
    const record=structuredClone(input);
    const ids=lineage.get(record.case_id)||[]; ids.push(record.record_id); lineage.set(record.case_id,ids);
    const current=byCase.get(record.case_id);
    if (!current||record.reviewed_at.localeCompare(current.reviewed_at)>=0) byCase.set(record.case_id,record);
  }
  for (const [caseId,record] of byCase) byCase.set(caseId,{...record,review_record_ids:[...lineage.get(caseId)]});
  return byCase;
}

function normalizeRecord(raw) {
  if (!raw||Array.isArray(raw)||typeof raw!=='object') throw new Error('review record root must be an object');
  for (const field of Object.keys(raw)) if (!ROOT_FIELDS.has(field)) throw new Error(`unknown review field ${field}`);
  return {
    record_id:String(raw.record_id||'').trim(),case_id:String(raw.case_id||'').trim(),
    source_sha256:String(raw.source_sha256||'').trim().toLowerCase(),reviewed_by:String(raw.reviewed_by||'').trim(),
    reviewed_at:String(raw.reviewed_at||'').trim(),status:String(raw.status||'pending').trim(),
    source_author:String(raw.source_author||'').trim(),source_uploader:String(raw.source_uploader||'').trim(),
    author_evidence:String(raw.author_evidence||'').trim(),
    canonical_front_side:raw.canonical_front_side?String(raw.canonical_front_side).trim():null,
    license_status:String(raw.license_status||'unknown').trim(),allowed_uses:sortedUnique(raw.allowed_uses),
    license_evidence:String(raw.license_evidence||'').trim(),approved_learning_areas:sortedUnique(raw.approved_learning_areas),
    blocked_learning_areas:sortedUnique(raw.blocked_learning_areas),
    semantic_corrections:(Array.isArray(raw.semantic_corrections)?raw.semantic_corrections:[]).map(normalizeCorrection),
    notes:String(raw.notes||''),
    dataset_version:raw.dataset_version?String(raw.dataset_version).trim():null,
    extractor_version:raw.extractor_version?String(raw.extractor_version).trim():null,
    plan_sha256:raw.plan_sha256?String(raw.plan_sha256).trim().toLowerCase():null
  };
}

function normalizeCorrection(raw) {
  if (!raw||Array.isArray(raw)||typeof raw!=='object') throw new Error('semantic correction must be an object');
  const operation=String(raw.operation||'');
  const expected=operation==='set'?new Set(['operation','coordinate','layer','value','confidence','reason']):new Set(['operation','coordinate','layer','reason']);
  for (const field of Object.keys(raw)) if (!expected.has(field)) throw new Error(`unknown ${operation||'semantic'} correction field ${field}`);
  const normalized={operation,coordinate:Array.isArray(raw.coordinate)?raw.coordinate.map(Number):[],layer:String(raw.layer||''),reason:String(raw.reason||'').trim()};
  if (operation==='set') { normalized.value=String(raw.value||''); normalized.confidence=Number(raw.confidence); }
  return normalized;
}

function validateCorrection(correction) {
  if (!['set','clear'].includes(correction.operation)) throw new Error(`invalid correction operation ${correction.operation||'missing'}`);
  if (!Array.isArray(correction.coordinate)||correction.coordinate.length!==3||correction.coordinate.some((value)=>!Number.isInteger(value)||value<0||value>63)) throw new Error('correction coordinate must contain three integers in [0,63]');
  if (!TARGET_LAYERS.has(correction.layer)) throw new Error(`invalid correction layer ${correction.layer}`);
  if (!correction.reason) throw new Error('correction reason is required');
  if (correction.operation==='set') {
    if (!VOCABULARY[correction.layer].has(correction.value)) throw new Error(`invalid ${correction.layer} correction value ${correction.value}`);
    if (!Number.isFinite(correction.confidence)||correction.confidence<0||correction.confidence>1) throw new Error('correction confidence must be in [0,1]');
  }
}

function sortedUnique(value) { return [...new Set((Array.isArray(value)?value:[]).map(String).map((item)=>item.trim()).filter(Boolean))].sort(); }
