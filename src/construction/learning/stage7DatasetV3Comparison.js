import { decodeStage7Runs } from './coarseSemanticVoxelSchema.js';

const NEIGHBOURS=Object.freeze([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]);

export function analyzeStage7PlanTopology(plan) {
  const cells=decodeStage7Runs(plan?.runs||[]);
  const result={
    envelope:{},space:{},site:{},roof_vertical_overlap:0,entrance_count:0,
    circulation_count:0,vertical_core_count:0,floor_level_count:0,roof_coverage_ratio:0
  };
  for (const [layer,ignored] of [['envelope','none'],['space','outside'],['site','none']]) {
    const values=[...new Set(cells.map((cell)=>cell[layer]).filter((value)=>value!==ignored))].sort();
    for (const value of values) {
      const selected=cells.filter((cell)=>cell[layer]===value);
      const sizes=componentSizes(selected);
      result[layer][value]={
        cell_count:selected.length,
        component_count:sizes.length,
        isolated_component_count:sizes.filter((size)=>size===1).length,
        largest_component:sizes[0]||0
      };
    }
  }
  result.roof_vertical_overlap=cells.filter((cell)=>cell.envelope==='roof'&&cell.space==='vertical_circulation').length;
  result.entrance_count=cells.filter((cell)=>cell.envelope==='opening'&&cell.space==='circulation').length;
  result.circulation_count=cells.filter((cell)=>cell.space==='circulation').length;
  result.vertical_core_count=cells.filter((cell)=>cell.space==='vertical_circulation').length;
  result.floor_level_count=new Set(cells.filter((cell)=>cell.envelope==='floor').map((cell)=>cell.y)).size;
  result.roof_coverage_ratio=roofCoverageRatio(cells);
  return result;
}

export function compareStage7PilotDatasets({pilotCaseIds=[],v2Records=[],v3Records=[],v2Plans=new Map(),v3Plans=new Map()}={}) {
  const v2=new Map(v2Records.map((record)=>[record.case_id,record]));
  const v3=new Map(v3Records.map((record)=>[record.case_id,record]));
  return {
    source:'stage7-dataset-v2-v3-pilot-comparison-v1',schema_version:1,
    cases:[...pilotCaseIds].map(String).sort().map((caseId)=>({
      case_id:caseId,
      v2:summary(v2.get(caseId),analyzeStage7PlanTopology(v2Plans.get(caseId))),
      v3:summary(v3.get(caseId),analyzeStage7PlanTopology(v3Plans.get(caseId)))
    }))
  };
}

export function renderStage7DatasetV3Comparison(comparison={}) {
  const rows=(comparison.cases||[]).map((item)=>{
    const v2=renderSummary(item.v2);
    const v3=renderSummary(item.v3);
    return `| ${escapeCell(item.case_id)} | ${v2.planHash} | ${v3.planHash} | ${v2.semantic} / ${v3.semantic} | ${v2.components} / ${v3.components} | ${v2.isolated} / ${v3.isolated} | ${v2.largestVertical} / ${v3.largestVertical} | ${v2.entrances} / ${v3.entrances} | ${v2.circulation} / ${v3.circulation} | ${v2.vertical} / ${v3.vertical} | ${v2.floors} / ${v3.floors} | ${v2.roofCoverage} / ${v3.roofCoverage} | ${v2.roofOverlap} / ${v3.roofOverlap} | ${v2.repairs} / ${v3.repairs} | ${v2.repairClasses} / ${v3.repairClasses} | ${v2.blockers} / ${v3.blockers} |`;
  });
  return `# Stage 7 Dataset v2/v3 Pilot Comparison

- Source: ${comparison.source||'stage7-dataset-v2-v3-pilot-comparison-v1'}
- Schema version: ${comparison.schema_version||1}
- Value order in paired columns: v2 / v3

| Case | v2 plan SHA-256 | v3 plan SHA-256 | Semantic status | Components | Isolated components | Largest vertical component | Entrance cells | Circulation cells | Vertical cells | Floor levels | Roof coverage | Roof/vertical overlap | Repairs | Repair classes | Blockers |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
${rows.join('\n')}

Diagnostic only: metric improvement does not transfer license permission, approve a learning area, or create a positive semantic review.`;
}

function componentSizes(cells) {
  const byKey=new Map(cells.map((cell)=>[keyOf(cell),cell]));
  const remaining=new Set(byKey.keys());
  const sizes=[];
  for (const start of [...remaining].sort()) {
    if (!remaining.has(start)) continue;
    const queue=[start];
    remaining.delete(start);
    for (let head=0;head<queue.length;head+=1) {
      const cell=byKey.get(queue[head]);
      for (const [dx,dy,dz] of NEIGHBOURS) {
        const next=`${cell.x+dx},${cell.y+dy},${cell.z+dz}`;
        if (remaining.delete(next)) queue.push(next);
      }
    }
    sizes.push(queue.length);
  }
  return sizes.sort((a,b)=>b-a);
}

function roofCoverageRatio(cells) {
  const massing=new Map();
  const roof=new Set();
  for (const cell of cells) {
    const key=`${cell.x},${cell.z}`;
    if (['wall','floor','support'].includes(cell.envelope)) massing.set(key,Math.max(massing.get(key)??-1,cell.y));
    if (cell.envelope==='roof') roof.add(key);
  }
  if (!massing.size) return 0;
  return Number(([...massing.keys()].filter((key)=>roof.has(key)).length/massing.size).toFixed(4));
}

function summary(record,topology) {
  return {
    plan_sha256:record?.artifacts?.plan_sha256||'',
    semantic_status:record?.extraction?.semantic_status||'missing',
    repair_count:record?.extraction?.repair_count||0,
    repair_classes:[...(record?.extraction?.repair_classes||['not-recorded-by-v2'])].sort(),
    blockers:[...(record?.extraction?.blockers||[])].sort(),
    topology
  };
}

function renderSummary(value={}) {
  const topology=value.topology||{};
  return {
    planHash:escapeCell(value.plan_sha256||'missing'),
    semantic:escapeCell(value.semantic_status||'missing'),
    components:totalMetric(topology,'component_count'),
    isolated:totalMetric(topology,'isolated_component_count'),
    largestVertical:topology.space?.vertical_circulation?.largest_component||0,
    entrances:topology.entrance_count||0,
    circulation:topology.circulation_count||0,
    vertical:topology.vertical_core_count||0,
    floors:topology.floor_level_count||0,
    roofCoverage:topology.roof_coverage_ratio||0,
    roofOverlap:topology.roof_vertical_overlap||0,
    repairs:value.repair_count||0,
    repairClasses:escapeCell((value.repair_classes||[]).join(', ')||'none'),
    blockers:escapeCell((value.blockers||[]).join(', ')||'none')
  };
}

function totalMetric(topology,field) {
  let total=0;
  for (const layer of ['envelope','space','site']) for (const metrics of Object.values(topology?.[layer]||{})) total+=metrics[field]||0;
  return total;
}

function escapeCell(value) { return String(value).replaceAll('|','\\|').replaceAll('\n',' '); }
function keyOf(cell) { return `${cell.x},${cell.y},${cell.z}`; }
