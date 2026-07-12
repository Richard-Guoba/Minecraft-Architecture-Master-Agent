import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeStage7DatasetArtifacts } from './construction/learning/coarseSemanticVoxelDataset.js';

export function parseStage7DatasetArgs(argv=[]) {
  const options={root:'mc_templates',knowledgeBase:'',out:'',localArtifacts:'',datasetVersion:'v1',reviewOverlay:'',caseIds:[],requireEligible:0,requireReviewed:0,requireSemanticAccepted:0,help:false};
  for (let index=0;index<argv.length;index+=1) {
    const flag=argv[index];
    if (flag==='--help') { options.help=true; continue; }
    if (flag==='--case') { const value=requireValue(argv,++index,flag); if (options.caseIds.includes(value)) throw new Error(`duplicate case id: ${value}`); options.caseIds.push(value); continue; }
    if (flag==='--root') { options.root=requireValue(argv,++index,flag); continue; }
    if (flag==='--knowledge-base') { options.knowledgeBase=requireValue(argv,++index,flag); continue; }
    if (flag==='--out') { options.out=requireValue(argv,++index,flag); continue; }
    if (flag==='--local-artifacts') { options.localArtifacts=requireValue(argv,++index,flag); continue; }
    if (flag==='--dataset-version') { const value=requireValue(argv,++index,flag); if (!['v1','v2'].includes(value)) throw new Error('--dataset-version must be v1 or v2'); options.datasetVersion=value; continue; }
    if (flag==='--review-overlay') { options.reviewOverlay=requireValue(argv,++index,flag); continue; }
    if (flag==='--require-reviewed') { options.requireReviewed=requireCount(argv,++index,flag); continue; }
    if (flag==='--require-semantic-accepted') { options.requireSemanticAccepted=requireCount(argv,++index,flag); continue; }
    if (flag==='--require-eligible') {
      const value=requireValue(argv,++index,flag); const parsed=Number(value);
      if (!Number.isInteger(parsed)||parsed<0) throw new Error('--require-eligible must be a non-negative integer');
      options.requireEligible=parsed; continue;
    }
    throw new Error(`unknown Stage 7 dataset option: ${flag}`);
  }
  return options;
}

export async function main(argv=process.argv.slice(2)) {
  const options=parseStage7DatasetArgs(argv);
  if (options.help) { console.log(helpText()); return; }
  const root=path.resolve(options.root);
  const result=await writeStage7DatasetArtifacts({
    templateRoot:root,
    knowledgeBasePath:options.knowledgeBase?path.resolve(options.knowledgeBase):path.join(root,'analysis','case_library.v2.json'),
    outputDir:options.out?path.resolve(options.out):path.join(root,'datasets','coarse_semantic_voxels',options.datasetVersion),
    localArtifactRoot:path.resolve(options.localArtifacts||path.join('.tmp','stage7-dataset',options.datasetVersion)),
    datasetVersion:options.datasetVersion,reviewOverlayPath:options.reviewOverlay?path.resolve(options.reviewOverlay):undefined,
    caseIds:options.caseIds,requireEligible:options.requireEligible,requireReviewed:options.requireReviewed,requireSemanticAccepted:options.requireSemanticAccepted
  });
  const counts=result.manifest.split_counts||{};
  console.log(`Stage 7 M2 dataset: ${result.artifacts.manifest}`);
  console.log(`Cases: ${result.manifest.case_count}`);
  console.log(`Training eligible: ${result.manifest.training_eligible_count}`);
  console.log(`Splits: train=${counts.train||0}, validation=${counts.validation||0}, test=${counts.test||0}`);
  console.log(`Local diagnostic artifacts: ${result.localArtifactRoot}`);
}

function requireValue(argv,index,flag) { const value=argv[index]; if (!value||value.startsWith('--')) throw new Error(`${flag} requires a value`); return value; }
function requireCount(argv,index,flag) { const value=requireValue(argv,index,flag); const parsed=Number(value); if (!Number.isInteger(parsed)||parsed<0) throw new Error(`${flag} must be a non-negative integer`); return parsed; }
function helpText() { return `Usage: npm run dataset:stage7 -- [options]\n\n  --root <path>\n  --knowledge-base <path>\n  --out <path>\n  --local-artifacts <path>\n  --dataset-version v1|v2\n  --review-overlay <path>\n  --case <case-id>\n  --require-reviewed <integer>\n  --require-semantic-accepted <integer>\n  --require-eligible <integer>\n  --help`; }

const isMain=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if (isMain) main().catch((error)=>{ console.error(error.message); process.exitCode=1; });
