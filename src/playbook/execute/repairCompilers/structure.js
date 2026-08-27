import { EXECUTE_COMPILER_VERSION, EXECUTE_SCHEMA_VERSION, EXECUTABLE_REPAIR_ROWS } from '../constants.js';
import { executeError, validateRepairRequest, validateResolvedPatch } from '../contracts.js';
import { projectStructurePayload, structurePreconditions } from '../repairProjection.js';

const ROW = EXECUTABLE_REPAIR_ROWS.find((row) => row.repair_operation_id === 'repair:structure:connect-support-path');

export function compileStructureRepair({ request, layerPayload } = {}) {
  try {
    request = validateRepairRequest(request);
    if (request.repair_operation_id !== ROW.repair_operation_id || request.variant_id !== ROW.allowed_variant_ids[0]) invalid();
    const projection = projectStructurePayload(layerPayload); const [upper, frame, base] = projection.anchors;
    return validateResolvedPatch({
      schema_version: EXECUTE_SCHEMA_VERSION, compiler_version: EXECUTE_COMPILER_VERSION,
      candidate_id: request.candidate_id, rule_id: request.rule_id, repair_operation_id: request.repair_operation_id,
      variant_id: request.variant_id, target_layer: 'structure', base_checkpoint_sha256: request.base_checkpoint_sha256,
      precondition_hashes: structurePreconditions(projection),
      effects: [{ type: 'set-load-path', from: upper.value, through: frame.value, to: base.value }], invalidates_layers: ROW.invalidates_layers
    });
  } catch (error) {
    if (error?.code === 'P5_REPAIR_INVALID') throw error;
    throw executeError('P5_REPAIR_INVALID');
  }
}
export function chooseDefaultStructureVariant({ repair_operation_id, layerPayload } = {}) { if (repair_operation_id !== ROW.repair_operation_id) invalid(); projectStructurePayload(layerPayload); return ROW.allowed_variant_ids[0]; }
function invalid() { throw executeError('P5_REPAIR_INVALID'); }
