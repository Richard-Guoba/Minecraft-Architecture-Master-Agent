import { createHash } from 'node:crypto';

export const STAGE7_CONDITION_SOURCE = 'stage7-coarse-semantic-voxel-condition-v1';
export const STAGE7_PLAN_SOURCE = 'stage7-coarse-semantic-voxel-plan-v1';
export const STAGE7_SCHEMA_VERSION = 1;
export const STAGE7_RESOLUTION = Object.freeze([64, 64, 64]);
export const STAGE7_ENCODING = 'rle-x-v1';
export const ENVELOPE_VALUES = Object.freeze(['none', 'wall', 'floor', 'roof', 'opening', 'support']);
export const SPACE_VALUES = Object.freeze(['outside', 'public', 'private', 'service', 'circulation', 'vertical_circulation', 'void']);
export const SITE_VALUES = Object.freeze(['none', 'ground', 'path', 'courtyard', 'water', 'vegetation']);
export const MAX_STAGE7_RUNS = 64 * 64 * 64;

const ENVELOPE_SET = new Set(ENVELOPE_VALUES);
const SPACE_SET = new Set(SPACE_VALUES);
const SITE_SET = new Set(SITE_VALUES);
const PLAN_FIELDS = new Set(['source', 'schema_version', 'provider', 'condition_hash', 'resolution', 'encoding', 'orientation', 'world_transform', 'runs', 'evidence', 'summary', 'derived_sketches', 'conflicts', 'repairs', 'warnings']);
const PROVIDER_FIELDS = new Set(['kind', 'name', 'model_version', 'dataset_version', 'checkpoint_version']);
const ORIENTATION_FIELDS = new Set(['front_side', 'vertical_axis']);
const TRANSFORM_FIELDS = new Set(['lot_width', 'lot_depth', 'total_height', 'ground_y']);
const DERIVED_SKETCH_FIELDS = new Set(['massing', 'spaces', 'site']);
const RUN_FIELDS = new Set(['x0', 'x1', 'y', 'z', 'envelope', 'space', 'site', 'confidence', 'evidence_ids']);
const EVIDENCE_FIELDS = new Set(['id', 'kind', 'source_id', 'detail']);

export function canonicalStringify(value) {
  return JSON.stringify(normalizeForHash(value));
}

export function hashCanonicalValue(value) {
  return createHash('sha256').update(canonicalStringify(value)).digest('hex');
}

export function encodeStage7Cells(cells = []) {
  const normalized = cells.map(normalizeCell).sort(compareCells);
  const seen = new Set();
  const runs = [];

  for (const current of normalized) {
    const key = cellKey(current.x, current.y, current.z);
    if (seen.has(key)) throw new Error(`duplicate Stage 7 cell: ${key}`);
    seen.add(key);
    const previous = runs.at(-1);
    if (previous && previous.y === current.y && previous.z === current.z && previous.x1 + 1 === current.x && sameRunTuple(previous, current)) {
      previous.x1 = current.x;
      continue;
    }
    runs.push({
      x0: current.x,
      x1: current.x,
      y: current.y,
      z: current.z,
      envelope: current.envelope,
      space: current.space,
      site: current.site,
      confidence: current.confidence,
      evidence_ids: current.evidence_ids
    });
  }
  return runs;
}

export function decodeStage7Runs(runs = []) {
  const cells = [];
  for (const raw of runs) {
    const run = normalizeRun(raw);
    for (let x = run.x0; x <= run.x1; x += 1) {
      cells.push({
        x,
        y: run.y,
        z: run.z,
        envelope: run.envelope,
        space: run.space,
        site: run.site,
        confidence: run.confidence,
        evidence_ids: [...run.evidence_ids]
      });
    }
  }
  return cells.sort(compareCells);
}

export function createStage7Plan({ condition = {}, provider = {}, cells = [], evidence = [] } = {}) {
  return {
    source: STAGE7_PLAN_SOURCE,
    schema_version: STAGE7_SCHEMA_VERSION,
    provider: {
      kind: String(provider.kind || 'unknown'),
      name: String(provider.name || 'unknown'),
      model_version: provider.model_version ?? null,
      dataset_version: provider.dataset_version ?? null
    },
    condition_hash: String(condition.condition_hash || ''),
    resolution: [...STAGE7_RESOLUTION],
    encoding: STAGE7_ENCODING,
    orientation: {
      front_side: String(condition.design?.front_side || 'south'),
      vertical_axis: 'y-up'
    },
    world_transform: {
      lot_width: finiteNumber(condition.dimensions?.lot_width, 1),
      lot_depth: finiteNumber(condition.dimensions?.lot_depth, 1),
      total_height: finiteNumber(condition.dimensions?.total_height, 1),
      ground_y: 0
    },
    runs: encodeStage7Cells(cells),
    evidence: evidence.map(normalizeEvidence).sort((a, b) => a.id.localeCompare(b.id)),
    summary: {},
    derived_sketches: { massing: [], spaces: [], site: [] },
    conflicts: [],
    repairs: [],
    warnings: []
  };
}

export function validateStage7Condition(condition = {}) {
  try {
    return validateStage7ConditionValue(condition);
  } catch {
    return { ok: false, errors: ['condition input could not be safely validated'] };
  }
}

function validateStage7ConditionValue(condition = {}) {
  condition = condition && typeof condition === 'object' && !Array.isArray(condition) ? condition : {};
  const errors = [];
  const dimensions = condition.dimensions && typeof condition.dimensions === 'object' ? condition.dimensions : {};
  const constraints = condition.constraints && typeof condition.constraints === 'object' ? condition.constraints : {};
  const references = Array.isArray(condition.references) ? condition.references : [];

  if (condition.source !== STAGE7_CONDITION_SOURCE) errors.push('unsupported Stage 7 condition source');
  if (condition.schema_version !== STAGE7_SCHEMA_VERSION) errors.push('unsupported Stage 7 condition schema version');
  if (typeof condition.prompt !== 'string' || !condition.prompt.trim()) errors.push('condition prompt is required');
  if (!Number.isInteger(condition.seed)) errors.push('condition seed must be an integer');
  for (const field of ['width', 'depth', 'floors', 'floor_height', 'total_height', 'lot_width', 'lot_depth']) {
    if (!Number.isInteger(dimensions[field]) || dimensions[field] <= 0) errors.push(`condition dimension ${field} must be a positive integer`);
  }
  if (Number.isInteger(dimensions.floors) && dimensions.floors > 5) errors.push('condition floors must be within the Milestone 1 range 1..5');
  if (Number.isInteger(dimensions.width) && Number.isInteger(dimensions.lot_width) && dimensions.width > dimensions.lot_width) errors.push('condition width cannot exceed lot width');
  if (Number.isInteger(dimensions.depth) && Number.isInteger(dimensions.lot_depth) && dimensions.depth > dimensions.lot_depth) errors.push('condition depth cannot exceed lot depth');
  if (!condition.design || typeof condition.design !== 'object' || Array.isArray(condition.design)) errors.push('condition design must be an object');
  if (!['north', 'south', 'east', 'west'].includes(condition.design?.front_side)) errors.push('condition front side must be north, south, east, or west');
  if (condition.design?.massing_volumes !== undefined && (!Array.isArray(condition.design.massing_volumes) || condition.design.massing_volumes.length > 16 || condition.design.massing_volumes.some((item) => !isPlainObject(item) || typeof item.id !== 'string' || !Array.isArray(item.scale) || item.scale.length !== 3 || item.scale.some((value) => !Number.isFinite(value))))) errors.push('condition massing volumes are invalid');
  if (condition.design?.topology_program !== undefined && (!isPlainObject(condition.design.topology_program) || !Array.isArray(condition.design.topology_program.nodes) || !Array.isArray(condition.design.topology_program.edges) || !isPlainObject(condition.design.topology_program.zoning))) errors.push('condition topology program is invalid');
  if (!Array.isArray(condition.references)) errors.push('condition references must be an array');
  const referenceIds = new Set();
  for (const reference of references) {
    const caseId = typeof reference?.case_id === 'string' ? reference.case_id.trim() : '';
    if (!caseId) errors.push('reference case id is required');
    else if (referenceIds.has(caseId)) errors.push(`duplicate reference case id: ${caseId}`);
    else referenceIds.add(caseId);
    if (!['approved', 'limited'].includes(reference?.review_state)) errors.push('reference review state must be approved or limited');
    if (typeof reference?.review_confidence !== 'number' || !Number.isFinite(reference.review_confidence) || reference.review_confidence < 0 || reference.review_confidence > 1) errors.push('reference review confidence must be within 0..1');
    if (!Array.isArray(reference?.used_for) || !reference.used_for.length || reference.used_for.some((item) => typeof item !== 'string' || !item)) errors.push(`reference used_for is required: ${caseId || 'unknown'}`);
    if (!Array.isArray(reference?.hints) || reference.hints.some((item) => !isPlainObject(item) || typeof item.area !== 'string' || typeof item.claim !== 'string' || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1)) errors.push(`reference hints are invalid: ${caseId || 'unknown'}`);
    if (reference?.embedding_index_source && (
      !reference.embedding_record_id ||
      !/^sha256:[a-f0-9]{64}$/.test(reference.embedding_index_hash || '') ||
      !/^sha256:[a-f0-9]{64}$/.test(reference.embedding_record_hash || '')
    )) errors.push(`embedding reference lineage is incomplete: ${caseId || 'unknown'}`);
  }
  if (!sameArray(constraints.resolution, STAGE7_RESOLUTION)) errors.push('condition resolution must be 64 x 64 x 64');
  if (!Number.isInteger(constraints.max_total_height) || constraints.max_total_height <= 0) errors.push('condition max_total_height must be a positive integer');
  if (Number.isInteger(dimensions.total_height) && Number.isInteger(constraints.max_total_height) && dimensions.total_height > constraints.max_total_height) errors.push('condition total_height cannot exceed max_total_height');
  if (!Number.isInteger(constraints.minecraft_fill_limit) || constraints.minecraft_fill_limit <= 0) errors.push('condition minecraft_fill_limit must be a positive integer');
  if (typeof condition.condition_hash !== 'string' || !/^[a-f0-9]{64}$/.test(condition.condition_hash)) {
    errors.push('condition hash must be a sha256 hex string');
  } else {
    const payload = structuredClone(condition);
    delete payload.condition_hash;
    if (hashCanonicalValue(payload) !== condition.condition_hash) errors.push('condition hash mismatch');
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function validateStage7Plan(plan = {}, options = {}) {
  try {
    return validateStage7PlanValue(plan, options);
  } catch {
    return {
      ok: false,
      errors: ['plan input could not be safely validated'],
      warnings: [],
      stats: { run_count: 0, cell_count: 0, evidence_count: 0 }
    };
  }
}

function validateStage7PlanValue(plan = {}, { condition, conditionHash = condition?.condition_hash, maxRuns = MAX_STAGE7_RUNS, allowDerived = false } = {}) {
  plan = plan && typeof plan === 'object' && !Array.isArray(plan) ? plan : {};
  const errors = [];
  const warnings = [];
  const runs = Array.isArray(plan.runs) ? plan.runs : [];
  const evidence = Array.isArray(plan.evidence) ? plan.evidence : [];
  const evidenceIds = new Set();
  const occupied = new Set();
  let cellCount = 0;
  let coordinatesSafeToDecode = true;

  for (const field of unknownFields(plan, PLAN_FIELDS)) errors.push(`unknown Stage 7 plan field: ${field}`);

  if (plan.source !== STAGE7_PLAN_SOURCE) errors.push('unsupported Stage 7 plan source');
  if (plan.schema_version !== STAGE7_SCHEMA_VERSION) errors.push('unsupported Stage 7 schema version');
  if (!sameArray(plan.resolution, STAGE7_RESOLUTION)) errors.push('resolution must be 64 x 64 x 64');
  if (plan.encoding !== STAGE7_ENCODING) errors.push('unsupported Stage 7 grid encoding');
  if (typeof plan.provider?.kind !== 'string' || !plan.provider.kind || typeof plan.provider?.name !== 'string' || !plan.provider.name) errors.push('provider kind and name are required');
  for (const field of unknownFields(plan.provider, PROVIDER_FIELDS)) errors.push(`unknown provider field: ${field}`);
  if (!Object.hasOwn(plan.provider || {}, 'model_version') || !Object.hasOwn(plan.provider || {}, 'dataset_version')) errors.push('provider model and dataset provenance fields are required');
  for (const field of ['model_version', 'dataset_version', 'checkpoint_version']) {
    if (plan.provider?.[field] !== undefined && plan.provider[field] !== null && typeof plan.provider[field] !== 'string') errors.push(`provider ${field} must be a string or null`);
  }
  if (typeof plan.condition_hash !== 'string' || !/^[a-f0-9]{64}$/.test(plan.condition_hash)) errors.push('condition hash must be a sha256 hex string');
  if (conditionHash && plan.condition_hash !== conditionHash) errors.push('condition hash mismatch');
  if (!Array.isArray(plan.runs)) errors.push('runs must be an array');
  if (!Array.isArray(plan.evidence)) errors.push('evidence must be an array');
  if (!plan.summary || typeof plan.summary !== 'object' || Array.isArray(plan.summary)) errors.push('summary must be an object');
  if (!plan.derived_sketches || !['massing', 'spaces', 'site'].every((field) => Array.isArray(plan.derived_sketches[field]))) errors.push('derived sketches must contain massing, spaces, and site arrays');
  for (const field of unknownFields(plan.derived_sketches, DERIVED_SKETCH_FIELDS)) errors.push(`unknown derived sketch field: ${field}`);
  for (const field of ['conflicts', 'repairs', 'warnings']) {
    if (!Array.isArray(plan[field])) errors.push(`${field} must be an array`);
  }
  if (!allowDerived && (
    Object.keys(isPlainObject(plan.summary) ? plan.summary : {}).length ||
    ['massing', 'spaces', 'site'].some((field) => Array.isArray(plan.derived_sketches?.[field]) && plan.derived_sketches[field].length) ||
    ['conflicts', 'repairs', 'warnings'].some((field) => Array.isArray(plan[field]) && plan[field].length)
  )) errors.push('provider-supplied derived fields must be empty before repair');
  for (const field of unknownFields(plan.orientation, ORIENTATION_FIELDS)) errors.push(`unknown orientation field: ${field}`);
  for (const field of unknownFields(plan.world_transform, TRANSFORM_FIELDS)) errors.push(`unknown world transform field: ${field}`);
  const runsAreObjects = runs.every((item) => item && typeof item === 'object' && !Array.isArray(item));
  if (!runsAreObjects) errors.push('every run must be an object');
  if (!['north', 'south', 'east', 'west'].includes(plan.orientation?.front_side) || plan.orientation?.vertical_axis !== 'y-up') errors.push('invalid Stage 7 orientation');
  for (const field of ['lot_width', 'lot_depth', 'total_height']) {
    if (!Number.isFinite(plan.world_transform?.[field]) || plan.world_transform[field] <= 0) errors.push(`invalid world transform field: ${field}`);
  }
  if (!Number.isFinite(plan.world_transform?.ground_y)) errors.push('invalid world transform field: ground_y');
  if (condition) {
    if (plan.orientation?.front_side !== condition.design?.front_side) errors.push('plan orientation does not match condition');
    for (const [planField, conditionField] of [['lot_width', 'lot_width'], ['lot_depth', 'lot_depth'], ['total_height', 'total_height']]) {
      if (Number(plan.world_transform?.[planField]) !== Number(condition.dimensions?.[conditionField])) errors.push(`plan world transform does not match condition: ${planField}`);
    }
  }
  for (const item of evidence) {
    for (const field of unknownFields(item, EVIDENCE_FIELDS)) errors.push(`unknown evidence field: ${field}`);
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!id || typeof item?.kind !== 'string' || !item.kind || typeof item?.source_id !== 'string' || !item.source_id) errors.push('evidence records require id, kind, and source_id');
    if (item?.detail !== undefined && typeof item.detail !== 'string') errors.push(`evidence detail must be a string: ${id || 'unknown'}`);
    if (id && evidenceIds.has(id)) errors.push(`duplicate evidence id: ${id}`);
    if (id) evidenceIds.add(id);
  }
  if (runs.length > maxRuns) errors.push(`run count exceeds limit: ${maxRuns}`);
  if (runsAreObjects && !isCanonicalRunOrder(runs)) errors.push('runs are not in canonical z/y/x order');

  for (const raw of runs) {
    for (const field of unknownFields(raw, RUN_FIELDS)) errors.push(`unknown run field: ${field}`);
    const run = normalizeRun(raw);
    const coordinatesValid = [raw?.x0, raw?.x1, raw?.y, raw?.z].every(Number.isInteger) && raw.x0 >= 0 && raw.x1 <= 63 && raw.y >= 0 && raw.y <= 63 && raw.z >= 0 && raw.z <= 63 && raw.x0 <= raw.x1;
    if (!coordinatesValid) {
      errors.push('run coordinates must be integers inside 0..63');
      coordinatesSafeToDecode = false;
    }
    if (typeof raw?.envelope !== 'string' || !ENVELOPE_SET.has(raw.envelope)) errors.push(`invalid envelope value: ${String(raw?.envelope)}`);
    if (typeof raw?.space !== 'string' || !SPACE_SET.has(raw.space)) errors.push(`invalid space value: ${String(raw?.space)}`);
    if (typeof raw?.site !== 'string' || !SITE_SET.has(raw.site)) errors.push(`invalid site value: ${String(raw?.site)}`);
    if (typeof raw?.confidence !== 'number' || !Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1) errors.push('run confidence must be within 0..1');
    if (!Array.isArray(raw?.evidence_ids) || !raw.evidence_ids.length || raw.evidence_ids.some((id) => typeof id !== 'string' || !id)) errors.push('run evidence ids are required');
    for (const id of run.evidence_ids) {
      if (!evidenceIds.has(id)) errors.push(`run evidence id is unresolved: ${id}`);
    }
    if (coordinatesValid) {
      const expandedLength = run.x1 - run.x0 + 1;
      if (cellCount + expandedLength > MAX_STAGE7_RUNS) {
        errors.push(`decoded cell count exceeds logical grid limit: ${MAX_STAGE7_RUNS}`);
        coordinatesSafeToDecode = false;
        continue;
      }
      for (let x = run.x0; x <= run.x1 && x <= 63; x += 1) {
        const key = cellKey(x, run.y, run.z);
        if (occupied.has(key)) errors.push(`runs overlap at ${key}`);
        occupied.add(key);
        cellCount += 1;
      }
    }
  }

  if (coordinatesSafeToDecode && errors.length === 0 && runs.length) {
    try {
      const canonicalRuns = encodeStage7Cells(decodeStage7Runs(runs));
      if (canonicalStringify(canonicalRuns) !== canonicalStringify(runs)) warnings.push('runs require canonical re-encoding');
    } catch (error) {
      errors.push(`runs cannot be canonicalized: ${error.message}`);
    }
  }

  if (!runs.length) warnings.push('plan contains no semantic runs');
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    warnings,
    stats: {
      run_count: runs.length,
      cell_count: cellCount,
      evidence_count: evidenceIds.size
    }
  };
}

function normalizeForHash(value) {
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeForHash(item)])
    );
  }
  return value;
}

function normalizeCell(cell = {}) {
  const raw = cell && typeof cell === 'object' && !Array.isArray(cell) ? cell : {};
  return {
    x: Number(raw.x),
    y: Number(raw.y),
    z: Number(raw.z),
    envelope: String(raw.envelope || 'none'),
    space: String(raw.space || 'outside'),
    site: String(raw.site || 'none'),
    confidence: Number(raw.confidence ?? 1),
    evidence_ids: [...new Set((Array.isArray(raw.evidence_ids) ? raw.evidence_ids : []).map(String).filter(Boolean))].sort()
  };
}

function normalizeRun(run = {}) {
  const raw = run && typeof run === 'object' && !Array.isArray(run) ? run : {};
  return {
    x0: Number(raw.x0),
    x1: Number(raw.x1),
    y: Number(raw.y),
    z: Number(raw.z),
    envelope: String(raw.envelope || 'none'),
    space: String(raw.space || 'outside'),
    site: String(raw.site || 'none'),
    confidence: Number(raw.confidence),
    evidence_ids: [...new Set((Array.isArray(raw.evidence_ids) ? raw.evidence_ids : []).map(String).filter(Boolean))].sort()
  };
}

function normalizeEvidence(item = {}) {
  const raw = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
  return {
    id: String(raw.id || ''),
    kind: String(raw.kind || 'unknown'),
    source_id: String(raw.source_id || ''),
    detail: raw.detail === undefined ? undefined : String(raw.detail)
  };
}

function compareCells(left, right) {
  return left.z - right.z || left.y - right.y || left.x - right.x;
}

function compareRuns(left, right) {
  return Number(left.z) - Number(right.z) || Number(left.y) - Number(right.y) || Number(left.x0) - Number(right.x0) || Number(left.x1) - Number(right.x1);
}

function isCanonicalRunOrder(runs) {
  return runs.every((run, index) => index === 0 || compareRuns(runs[index - 1], run) <= 0);
}

function sameRunTuple(run, cell) {
  return run.envelope === cell.envelope &&
    run.space === cell.space &&
    run.site === cell.site &&
    run.confidence === cell.confidence &&
    sameArray(run.evidence_ids, cell.evidence_ids);
}

function sameArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function cellKey(x, y, z) {
  return `${x},${y},${z}`;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unknownFields(value, allowed) {
  return isPlainObject(value) ? Object.keys(value).filter((field) => !allowed.has(field)).sort() : [];
}
