import { ENVELOPE_VALUES, SITE_VALUES, SPACE_VALUES } from './coarseSemanticVoxelSchema.js';

const EMPTY=Object.freeze({envelope:'none',space:'outside',site:'none'});
const VOCABULARY={envelope:new Set(ENVELOPE_VALUES),space:new Set(SPACE_VALUES),site:new Set(SITE_VALUES)};

export function applyStage7DatasetCorrections({cells=[],corrections=[],evidenceId}={}) {
  if (corrections.length&&!String(evidenceId||'').trim()) throw new Error('Stage 7 semantic corrections require an evidenceId');
  const byCoordinate=new Map();
  for (const input of cells) {
    const cell=structuredClone(input);
    const id=key(cell.x,cell.y,cell.z);
    if (byCoordinate.has(id)) throw new Error(`duplicate Stage 7 correction input cell: ${id}`);
    byCoordinate.set(id,cell);
  }
  const applied=[];
  for (const input of corrections) {
    const correction=structuredClone(input);
    validateCorrection(correction);
    const [x,y,z]=correction.coordinate;
    const id=key(x,y,z);
    const cell=byCoordinate.get(id)||{x,y,z,...EMPTY,confidence:1,evidence_ids:[]};
    cell[correction.layer]=correction.operation==='clear'?EMPTY[correction.layer]:correction.value;
    if (correction.operation==='set') cell.confidence=correction.confidence;
    cell.evidence_ids=[...new Set([...(cell.evidence_ids||[]),String(evidenceId)])].sort();
    if (isEmpty(cell)) byCoordinate.delete(id); else byCoordinate.set(id,cell);
    applied.push(correction);
  }
  return {cells:[...byCoordinate.values()].sort(compareCells),applied};
}

function validateCorrection(correction) {
  if (!['set','clear'].includes(correction?.operation)) throw new Error(`invalid correction operation ${correction?.operation||'missing'}`);
  if (!Array.isArray(correction.coordinate)||correction.coordinate.length!==3||correction.coordinate.some((value)=>!Number.isInteger(value)||value<0||value>63)) throw new Error('correction coordinate must contain three integers in [0,63]');
  if (!VOCABULARY[correction.layer]) throw new Error(`invalid correction layer ${correction.layer||'missing'}`);
  if (!String(correction.reason||'').trim()) throw new Error('correction reason is required');
  if (correction.operation==='set') {
    if (!VOCABULARY[correction.layer].has(correction.value)) throw new Error(`invalid ${correction.layer} correction value ${correction.value}`);
    if (!Number.isFinite(correction.confidence)||correction.confidence<0||correction.confidence>1) throw new Error('correction confidence must be in [0,1]');
  }
}

function isEmpty(cell) { return cell.envelope===EMPTY.envelope&&cell.space===EMPTY.space&&cell.site===EMPTY.site; }
function key(x,y,z) { return `${x},${y},${z}`; }
function compareCells(left,right) { return left.z-right.z||left.y-right.y||left.x-right.x; }
