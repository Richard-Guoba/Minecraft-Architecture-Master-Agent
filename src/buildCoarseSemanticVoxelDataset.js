import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeStage7DatasetArtifacts } from './construction/learning/coarseSemanticVoxelDataset.js';

export function parseStage7DatasetArgs(argv=[]) {
  const options={root:'mc_templates',knowledgeBase:'',out:'',localArtifacts:'.tmp/stage7-dataset/v1',caseIds:[],requireEligible:0,help:false};
  for (let index=0;index<argv.length;index+=1) {
    const flag=argv[index];
    if (flag==='--help') { options.help=true; continue; }
    if (flag==='--case') { const value=requireValue(argv,++index,flag); if (options.caseIds.includes(value)) throw new Error(`duplicate case id: ${value}`); options.caseIds.push(value); continue; }
    if (flag==='--root') { options.root=requireValue(argv,++index,flag); continue; }
    if (flag==='--knowledge-base') { options.knowledgeBase=requireValue(argv,++index,flag); continue; }
    if (flag==='--out') { options.out=requireValue(argv,++index,flag); continue; }
    if (flag==='--local-artifacts') { options.localArtifacts=requireValue(argv,++index,flag); continue; }
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
    outputDir:options.out?path.resolve(options.out):path.join(root,'datasets','coarse_semantic_voxels','v1'),
    localArtifactRoot:path.resolve(options.localArtifacts),caseIds:options.caseIds,requireEligible:options.requireEligible
  });
  const counts=result.manifest.split_counts||{};
  console.log(`Stage 7 M2 dataset: ${result.artifacts.manifest}`);
  console.log(`Cases: ${result.manifest.case_count}`);
  console.log(`Training eligible: ${result.manifest.training_eligible_count}`);
  console.log(`Splits: train=${counts.train||0}, validation=${counts.validation||0}, test=${counts.test||0}`);
  console.log(`Local diagnostic artifacts: ${result.localArtifactRoot}`);
}

function requireValue(argv,index,flag) { const value=argv[index]; if (!value||value.startsWith('--')) throw new Error(`${flag} requires a value`); return value; }
function helpText() { return `Usage: npm run dataset:stage7 -- [options]\n\n  --root <path>\n  --knowledge-base <path>\n  --out <path>\n  --local-artifacts <path>\n  --case <case-id>\n  --require-eligible <integer>\n  --help`; }

const isMain=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if (isMain) main().catch((error)=>{ console.error(error.message); process.exitCode=1; });
