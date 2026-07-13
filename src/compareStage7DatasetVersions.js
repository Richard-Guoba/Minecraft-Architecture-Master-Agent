import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGE7_PILOT_CASE_IDS } from './construction/learning/stage7DatasetReviewOverlay.js';
import {
  compareStage7PilotDatasets,
  renderStage7DatasetV3Comparison
} from './construction/learning/stage7DatasetV3Comparison.js';

export const STAGE7_COMPARISON_HELP_TEXT=`Usage: npm run compare:stage7-datasets -- [options]\n\n  --v2-index <path>\n  --v3-index <path>\n  --v2-local <path>\n  --v3-local <path>\n  --out <path>\n  --help\n\nThe comparison always uses the fixed six Stage 7 pilot cases.`;
const REQUIRED_FLAGS=Object.freeze(['v2Index','v3Index','v2Local','v3Local','out']);

export function parseStage7ComparisonArgs(argv=[]) {
  const names=new Map([['--v2-index','v2Index'],['--v3-index','v3Index'],['--v2-local','v2Local'],['--v3-local','v3Local'],['--out','out']]);
  const options={help:false};
  for (let index=0;index<argv.length;index+=1) {
    const flag=argv[index];
    if (flag==='--help') { options.help=true; continue; }
    const name=names.get(flag);
    if (!name) throw new Error(`unknown option: ${flag}`);
    const value=argv[++index];
    if (!value||value.startsWith('--')) throw new Error(`${flag} requires a value`);
    options[name]=value;
  }
  if (!options.help) for (const name of REQUIRED_FLAGS) if (!options[name]) throw new Error(`missing required option: ${name}`);
  return options;
}

export async function main(argv=process.argv.slice(2)) {
  const options=parseStage7ComparisonArgs(argv);
  if (options.help) { console.log(STAGE7_COMPARISON_HELP_TEXT); return; }
  const v2Records=await readJsonl(path.resolve(options.v2Index));
  const v3Records=await readJsonl(path.resolve(options.v3Index));
  requirePilotRecords(v2Records,'v2');
  requirePilotRecords(v3Records,'v3');
  const v2Plans=await readPilotPlans(path.resolve(options.v2Local),'v2');
  const v3Plans=await readPilotPlans(path.resolve(options.v3Local),'v3');
  const comparison=compareStage7PilotDatasets({
    pilotCaseIds:STAGE7_PILOT_CASE_IDS,v2Records,v3Records,v2Plans,v3Plans
  });
  const output=path.resolve(options.out);
  await fs.mkdir(path.dirname(output),{recursive:true});
  const markdown=renderStage7DatasetV3Comparison(comparison).replace(/\n+$/u,'');
  await fs.writeFile(output,`${markdown}\n`,'utf8');
  console.log(`Stage 7 v2/v3 pilot comparison: ${output}`);
}

async function readJsonl(file) {
  const text=await fs.readFile(file,'utf8');
  return text.split(/\r?\n/u).filter((line)=>line.trim()).map((line,index)=>{
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`invalid JSONL at ${file}:${index+1}: ${error.message}`); }
  });
}

function requirePilotRecords(records,label) {
  const ids=new Set(records.map((record)=>record?.case_id));
  for (const caseId of STAGE7_PILOT_CASE_IDS) if (!ids.has(caseId)) throw new Error(`missing ${label} record for Stage 7 pilot: ${caseId}`);
}

async function readPilotPlans(root,label) {
  const plans=new Map();
  for (const caseId of STAGE7_PILOT_CASE_IDS) {
    const file=path.join(root,'cases',caseId,'plan.raw.json');
    try { plans.set(caseId,JSON.parse(await fs.readFile(file,'utf8'))); }
    catch (error) { throw new Error(`missing or invalid ${label} plan for Stage 7 pilot ${caseId}: ${error.message}`); }
  }
  return plans;
}

const isMain=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if (isMain) main().catch((error)=>{ console.error(error.message); process.exitCode=1; });
