import { EXECUTE_COMPILER_VERSION, EXECUTE_SCHEMA_VERSION, EXECUTABLE_REPAIR_ROWS } from '../constants.js';
import { executeError, validateRepairRequest, validateResolvedPatch } from '../contracts.js';
import { sha256, stableJson } from '../../shadow/canonical.js';

const ROW = EXECUTABLE_REPAIR_ROWS.find((row) => row.repair_operation_id === 'repair:structure:connect-support-path');
const KEYS = ['upper', 'frame', 'base'];
const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[a-z0-9][a-z0-9-]{0,127}$/u;

export function compileStructureRepair({ request, layerPayload } = {}) {
  try {
    request = validateRepairRequest(request);
    if (request.repair_operation_id !== ROW.repair_operation_id || request.variant_id !== ROW.allowed_variant_ids[0]) invalid();
    const anchors = validateStructuralAnchors(layerPayload?.structural_anchors);
    return validateResolvedPatch({
      schema_version: EXECUTE_SCHEMA_VERSION,
      compiler_version: EXECUTE_COMPILER_VERSION,
      candidate_id: request.candidate_id,
      rule_id: request.rule_id,
      repair_operation_id: request.repair_operation_id,
      variant_id: request.variant_id,
      target_layer: 'structure',
      base_checkpoint_sha256: request.base_checkpoint_sha256,
      precondition_hashes: KEYS.map((kind) => ({ kind: 'structural-anchor', id: anchors[kind].id, sha256: structuralAnchorHash(kind, anchors[kind]) })),
      effects: [{ type: 'set-load-path', from: anchors.upper.id, through: anchors.frame.id, to: anchors.base.id }],
      invalidates_layers: ROW.invalidates_layers
    });
  } catch (error) {
    if (error?.code === 'P5_REPAIR_INVALID') throw error;
    throw executeError('P5_REPAIR_INVALID');
  }
}

export function chooseDefaultStructureVariant({ repair_operation_id, layerPayload } = {}) {
  if (repair_operation_id !== ROW.repair_operation_id) invalid();
  validateStructuralAnchors(layerPayload?.structural_anchors);
  return ROW.allowed_variant_ids[0];
}

export function validateStructuralAnchors(value) {
  if (!plain(value) || !sameKeys(value, KEYS)) invalid();
  const ids = new Set();
  for (const key of KEYS) {
    const anchor = value[key];
    if (!plain(anchor) || !sameKeys(anchor, ['id', 'hash'])) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(anchor);
    if (!Object.values(descriptors).every((descriptor) => Object.hasOwn(descriptor, 'value'))
      || typeof anchor.id !== 'string' || !ID.test(anchor.id) || ids.has(anchor.id)
      || typeof anchor.hash !== 'string' || !HASH.test(anchor.hash)) invalid();
    ids.add(anchor.id);
  }
  return value;
}

export function structuralAnchorHash(kind, anchor) {
  if (!KEYS.includes(kind)) invalid();
  return sha256(stableJson({ kind, id: anchor.id, hash: anchor.hash }));
}

function sameKeys(value, keys) { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)) && Object.getOwnPropertyNames(value).length === actual.length && Object.getOwnPropertySymbols(value).length === 0; }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function invalid() { throw executeError('P5_REPAIR_INVALID'); }
