import path from 'node:path';
import { applyStage7DatasetCorrections } from './coarseSemanticVoxelDatasetCorrections.js';
import { evaluateStage7DatasetEligibility } from './coarseSemanticVoxelDatasetGovernance.js';
import { rasterizeSchematicToStage7 } from './coarseSemanticVoxelDatasetRasterizer.js';
import { repairCoarseSemanticVoxelPlan } from './coarseSemanticVoxelRepair.js';
import {
  STAGE7_CONDITION_SOURCE, STAGE7_SCHEMA_VERSION, createStage7Plan,
  hashCanonicalValue, validateStage7Condition, validateStage7Plan
} from './coarseSemanticVoxelSchema.js';

export const STAGE7_DATASET_EXTRACTOR='stage7-coarse-semantic-voxel-schematic-extractor-v1';

export function buildStage7DatasetCase({volume,caseRecord={},reviewRecord=null,datasetVersion='v1',localArtifactRoot='.tmp/stage7-dataset/v1'}={}) {
  if (!/^[a-f0-9]{64}$/.test(volume?.source_sha256||'')) throw new Error('Stage 7 dataset source SHA-256 must be 64 lowercase hex characters');
  if (!caseRecord.case_id) throw new Error('Stage 7 dataset case requires case_id');
  const raster=rasterizeSchematicToStage7({volume,caseRecord});
  const corrections=reviewRecord?.semantic_corrections||[];
  if (corrections.length&&!reviewRecord?.record_id) throw new Error('Stage 7 semantic corrections require review record provenance');
  const correctionEvidenceId=corrections.length?`review:${reviewRecord.record_id}`:null;
  const corrected=applyStage7DatasetCorrections({cells:raster.cells,corrections,evidenceId:correctionEvidenceId});
  const condition=buildDatasetCondition({caseRecord,raster,volume});
  const conditionValidation=validateStage7Condition(condition);
  if (!conditionValidation.ok) throw new Error(`invalid extracted Stage 7 condition: ${conditionValidation.errors.join('; ')}`);
  const rawPlan=createStage7Plan({
    condition,
    provider:{kind:'dataset-extraction',name:STAGE7_DATASET_EXTRACTOR,model_version:null,dataset_version:datasetVersion},
    cells:corrected.cells,
    evidence:[
      {id:`source:${caseRecord.case_id}`,kind:'raw-schematic',source_id:volume.source_sha256,detail:caseRecord.file||caseRecord.source?.file||''},
      ...(corrections.length?[{id:correctionEvidenceId,kind:'human-semantic-correction',source_id:reviewRecord.record_id,detail:`${corrections.length} reviewed sparse correction(s)`}]:[])
    ]
  });
  const schema=validateStage7Plan(rawPlan,{condition});
  if (!schema.ok) throw new Error(`invalid extracted Stage 7 plan: ${schema.errors.join('; ')}`);
  const repair=repairCoarseSemanticVoxelPlan({plan:rawPlan,condition});
  const governance=evaluateStage7DatasetEligibility({caseRecord});
  const trainingBlockers=[...governance.blockers];
  if (!repair.accepted) trainingBlockers.push('semantic-validation-rejected');
  const paths=artifactPaths(caseRecord.case_id);
  const record={
    case_id:caseRecord.case_id,
    case_version:caseRecord.case_version||`sha256:${hashCanonicalValue(caseRecord)}`,
    dataset_version:datasetVersion,
    origin:'real',parent_case_id:null,split:null,
    source:{
      file:caseRecord.file||caseRecord.source?.file||'',sha256:volume.source_sha256,
      url:caseRecord.source?.url||'',author:caseRecord.source?.author||'',
      license_status:caseRecord.source?.license_status||'unknown',
      allowed_uses:[...new Set(caseRecord.source?.allowed_uses||[])].sort(),
      public_release_allowed:Boolean(caseRecord.source?.public_release_allowed),
      license_evidence:caseRecord.source?.license_evidence||caseRecord.review?.license_evidence||''
    },
    review:{
      status:caseRecord.review?.status||'pending',reviewed_by:caseRecord.review?.reviewed_by||'',reviewed_at:caseRecord.review?.reviewed_at||'',
      approved_learning_areas:[...new Set(caseRecord.review?.approved_learning_areas||[])].sort(),
      blocked_learning_areas:[...new Set(caseRecord.review?.blocked_learning_areas||[])].sort(),
      canonical_front_side:caseRecord.review?.canonical_front_side||null,
      review_record_ids:[...new Set(caseRecord.review?.review_record_ids||[])].sort()
    },
    training:{eligible:governance.eligible&&repair.accepted,permitted_layers:governance.permitted_layers,blockers:[...new Set(trainingBlockers)].sort()},
    original_bounds:raster.original_bounds,
    normalized_transform:raster.normalized_transform,
    artifacts:{
      condition_sha256:hashCanonicalValue(condition),plan_sha256:hashCanonicalValue(rawPlan),
      repaired_plan_sha256:repair.accepted?hashCanonicalValue(repair.plan):null,
      local_condition_path:paths.condition,local_plan_path:paths.rawPlan,
      local_repaired_plan_path:repair.accepted?paths.repairedPlan:null
    },
    extraction:{
      schema_valid:schema.ok,semantic_status:repair.accepted?'accepted':'rejected',run_count:rawPlan.runs.length,
      ...(datasetVersion==='v2'?{
        correction_count:corrected.applied.length,
        correction_sha256:corrected.applied.length?hashCanonicalValue(corrected.applied):null
      }:{}),
      repair_count:repair.repairs?.length||0,blockers:(repair.blockers||[]).map((item)=>item.id||String(item)).sort(),
      warnings:[...new Set([...(raster.warnings||[]),...(repair.warnings||[])])].sort(),stats:raster.stats
    }
  };
  return {condition,rawPlan,repairedPlan:repair.accepted?repair.plan:null,record,report:renderStage7DatasetCaseReport(record),localArtifactRoot:path.resolve(localArtifactRoot)};
}

export function renderStage7DatasetCaseReport(record={}) {
  const lines=(values=[])=>values.length?values.map((value)=>`- ${value}`).join('\n'):'- none';
  return `# Stage 7 M2 Dataset Case: ${record.case_id||'unknown'}\n\n- Source SHA-256: ${record.source?.sha256||'missing'}\n- Review status: ${record.review?.status||'missing'}\n- License status: ${record.source?.license_status||'unknown'}\n- Training eligible: ${record.training?.eligible?'yes':'no'}\n- Split: ${record.split||'unassigned'}\n\n## Transform\n\n\`${JSON.stringify(record.normalized_transform||{})}\`\n\n## Semantic Counts\n\n\`${JSON.stringify(record.extraction?.stats?.layer_counts||{})}\`\n\n## Schema Validation\n\n- Valid: ${record.extraction?.schema_valid?'yes':'no'}\n\n## Repairs\n\n- Count: ${record.extraction?.repair_count||0}\n\n## Blockers\n\n${lines(record.training?.blockers)}\n\n## Warnings\n\n${lines(record.extraction?.warnings)}\n`;
}

function buildDatasetCondition({caseRecord,raster,volume}) {
  const occupied=raster.normalized_transform.occupied_size;
  const condition={
    source:STAGE7_CONDITION_SOURCE,schema_version:STAGE7_SCHEMA_VERSION,
    prompt:`reference schematic: ${caseRecord.title||caseRecord.case_id}`,
    seed:Number.parseInt(volume.source_sha256.slice(0,8),16),
    dimensions:{width:Math.max(1,occupied[0]),depth:Math.max(1,occupied[2]),floors:Math.max(1,Math.min(5,Math.round(occupied[1]/4))),floor_height:4,total_height:Math.max(1,occupied[1]),lot_width:Math.max(1,volume.width),lot_depth:Math.max(1,volume.length)},
    design:{style_family:caseRecord.identity?.style_family||'general',typology:caseRecord.identity?.typology||'building',footprint:'source-derived',front_side:raster.normalized_transform.front_side,abstract_site_tags:[],selected_concept_id:null,massing_strategy:[],space_strategy:[],quality_targets:['source-traceability']},
    references:[],constraints:{resolution:[64,64,64],max_total_height:Math.max(40,occupied[1]),minecraft_fill_limit:32768}
  };
  condition.condition_hash=hashCanonicalValue(condition);
  return condition;
}

function artifactPaths(caseId) {
  const root=path.posix.join('cases',caseId);
  return {condition:path.posix.join(root,'condition.json'),rawPlan:path.posix.join(root,'plan.raw.json'),repairedPlan:path.posix.join(root,'plan.repaired.json')};
}
