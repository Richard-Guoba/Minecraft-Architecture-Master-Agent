import fs from 'node:fs/promises';
import path from 'node:path';
import { readSchematicBlockVolume } from '../templates/schematicBlockVolume.js';
import { buildStage7DatasetCase, renderStage7DatasetCaseReport } from './coarseSemanticVoxelDatasetCase.js';
import { STAGE7_PILOT_CASE_IDS } from './stage7DatasetReviewOverlay.js';

export async function writeStage7DatasetReviewPack({templateRoot='mc_templates',knowledgeBasePath,outputDir='.tmp/stage7-m2-5-review-pack',caseIds=STAGE7_PILOT_CASE_IDS}={}) {
  const root=path.resolve(templateRoot);
  const kbPath=path.resolve(knowledgeBasePath||path.join(root,'analysis','case_library.v2.json'));
  const target=path.resolve(outputDir);
  const requested=[...caseIds].map(String);
  if (!requested.length) throw new Error('Stage 7 review pack requires at least one case');
  if (new Set(requested).size!==requested.length) throw new Error('duplicate case id in Stage 7 review pack');
  const knowledgeBase=JSON.parse(await fs.readFile(kbPath,'utf8'));
  if (!Array.isArray(knowledgeBase?.cases)) throw new Error('Stage 7 review pack knowledge base requires a cases array');
  const byId=new Map(knowledgeBase.cases.map((record)=>[record.case_id,record]));
  for (const id of requested) if (!byId.has(id)) throw new Error(`unknown Stage 7 review pack case id: ${id}`);
  const selected=requested.map((id)=>byId.get(id)).sort((a,b)=>a.case_id.localeCompare(b.case_id));
  const temporary=`${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.rm(temporary,{recursive:true,force:true});
  await fs.mkdir(path.join(temporary,'cases'),{recursive:true});
  const indexCases=[];
  for (const caseRecord of selected) {
    const sourcePath=path.resolve(root,caseRecord.file||'');
    if (!isWithin(root,sourcePath)) throw new Error(`Stage 7 review-pack source escapes template root: ${caseRecord.file}`);
    const volume=await readSchematicBlockVolume(sourcePath);
    const item=buildStage7DatasetCase({volume,caseRecord,datasetVersion:'v1',localArtifactRoot:temporary});
    const relativeDir=path.join('cases',caseRecord.case_id);
    const caseDir=path.join(temporary,relativeDir);
    await fs.mkdir(caseDir,{recursive:true});
    const correctionTemplate=blankReviewTemplate(caseRecord,volume.source_sha256);
    const review={
      source:'stage7-dataset-review-pack-case-v1',schema_version:1,case_id:caseRecord.case_id,
      title:caseRecord.title||caseRecord.case_id,file:caseRecord.file||'',source_sha256:volume.source_sha256,
      source_url:caseRecord.source?.url||'',current_review:structuredClone(caseRecord.review||{status:'pending'}),
      training_blockers:[...(item.record.training?.blockers||[])],semantic_blockers:[...(item.record.extraction?.blockers||[])],
      layer_counts:structuredClone(item.record.extraction?.stats?.layer_counts||{}),
      normalized_transform:structuredClone(item.record.normalized_transform),artifacts:structuredClone(item.record.artifacts),
      review_questions:['Verify source terms and record exact evidence.','Identify the canonical front side.','Approve or block envelope, site, and space separately.','Inspect semantic blockers and add only source-supported sparse corrections.'],
      correction_template:correctionTemplate
    };
    await writeJson(path.join(caseDir,'review.json'),review);
    await writeJson(path.join(caseDir,'plan.raw.json'),item.rawPlan);
    await writeJson(path.join(caseDir,'correction.example.json'),correctionTemplate);
    await fs.writeFile(path.join(caseDir,'report.md'),renderReviewReport(review,item.record),'utf8');
    indexCases.push({case_id:caseRecord.case_id,source_sha256:volume.source_sha256,relative_dir:relativeDir.replaceAll('\\','/'),review_status:caseRecord.review?.status||'pending',semantic_status:item.record.extraction.semantic_status});
  }
  const index={source:'stage7-dataset-review-pack-v1',schema_version:1,generated_at:stableGeneratedAt(),case_count:indexCases.length,cases:indexCases};
  await writeJson(path.join(temporary,'index.json'),index);
  await fs.writeFile(path.join(temporary,'summary.md'),renderSummary(index),'utf8');
  await replaceDirectory(target,temporary);
  return {
    outputDir:target,index,
    cases:indexCases.map((item)=>{const caseDir=path.join(target,item.relative_dir);return {...item,caseDir,reviewPath:path.join(caseDir,'review.json'),planPath:path.join(caseDir,'plan.raw.json'),reportPath:path.join(caseDir,'report.md')};}),
    artifacts:{index:path.join(target,'index.json'),summary:path.join(target,'summary.md')}
  };
}

function blankReviewTemplate(caseRecord,sourceSha256) {
  return {
    record_id:`review-${caseRecord.case_id}-replace-with-unique-id`,case_id:caseRecord.case_id,source_sha256:sourceSha256,
    reviewed_by:'',reviewed_at:'',status:'pending',source_author:'',source_uploader:'',author_evidence:'',
    canonical_front_side:null,license_status:'unknown',allowed_uses:[],
    license_evidence:'',approved_learning_areas:[],blocked_learning_areas:[],semantic_corrections:[],notes:''
  };
}

function renderReviewReport(review,record) {
  return `${renderStage7DatasetCaseReport(record)}\n## Human Review Checklist\n\n- [ ] Original creator, schematic preparer, and uploader evidence captured\n- [ ] Source license terms and exact evidence captured\n- [ ] Human reviewer identity and timestamp recorded\n- [ ] Canonical front side verified\n- [ ] Envelope decision recorded\n- [ ] Site decision recorded\n- [ ] Space decision recorded\n- [ ] Semantic corrections cite visible source evidence\n\nAutomation generated no positive review or license claim.\n`;
}

function renderSummary(index) { return `# Stage 7 M2.5 Review Pack\n\n- Cases: ${index.case_count}\n- Generated at: ${index.generated_at}\n- Positive reviews generated by automation: 0\n\n${index.cases.map((item)=>`- ${item.case_id}: ${item.review_status}; semantic ${item.semantic_status}`).join('\n')}\n`; }
async function writeJson(file,value) { await fs.writeFile(file,`${JSON.stringify(value,null,2)}\n`,'utf8'); }
async function replaceDirectory(target,temporary) { await fs.rm(target,{recursive:true,force:true}); await fs.mkdir(path.dirname(target),{recursive:true}); await fs.rename(temporary,target); }
function isWithin(root,candidate) { return candidate===root||candidate.startsWith(`${root}${path.sep}`); }
function stableGeneratedAt() { const seconds=Number(process.env.SOURCE_DATE_EPOCH); return Number.isFinite(seconds)&&process.env.SOURCE_DATE_EPOCH!==undefined?new Date(seconds*1000).toISOString():'2026-07-12T00:00:00.000Z'; }
