import { EXECUTE_COMPILER_VERSION, EXECUTE_SCHEMA_VERSION, EXECUTABLE_REPAIR_ROWS } from '../constants.js';
import { executeError, validateRepairRequest, validateResolvedPatch } from '../contracts.js';
import { massingPreconditions, projectMassingPayload } from '../repairProjection.js';

const ROWS = new Map(EXECUTABLE_REPAIR_ROWS.filter((row) => row.repair_operation_id.startsWith('repair:massing:')).map((row) => [row.repair_operation_id, row]));
const AXES = ['x', 'y', 'z'];

export function compileMassingRepair({ request, layerPayload } = {}) {
  try {
    request = validateRepairRequest(request);
    const row = ROWS.get(request.repair_operation_id);
    const projection = projectMassingPayload(layerPayload);
    if (!row) invalid();
    const compile = {
      'center-primary-and-reattach-secondaries': centerAndAttach,
      'differentiate-equal-secondary-scale': differentiate,
      'promote-largest-stable': promoteLargest,
      'reduce-nondominant-secondary': reduceSecondary,
      'reduce-attached-support-scale': reduceSecondary
    }[request.variant_id];
    if (!compile) invalid();
    return validateResolvedPatch({
      schema_version: EXECUTE_SCHEMA_VERSION, compiler_version: EXECUTE_COMPILER_VERSION,
      candidate_id: request.candidate_id, rule_id: request.rule_id, repair_operation_id: request.repair_operation_id,
      variant_id: request.variant_id, target_layer: 'massing', base_checkpoint_sha256: request.base_checkpoint_sha256,
      precondition_hashes: massingPreconditions(projection), effects: compile(projection.volumes), invalidates_layers: row.invalidates_layers
    });
  } catch (error) {
    if (error?.code === 'P5_REPAIR_INVALID') throw error;
    throw executeError('P5_REPAIR_INVALID');
  }
}

export function chooseDefaultMassingVariant({ repair_operation_id, layerPayload } = {}) {
  const row = ROWS.get(repair_operation_id);
  if (!row) invalid();
  for (const variant_id of row.allowed_variant_ids) {
    try {
      compileMassingRepair({ request: { schema_version: 1, candidate_id: 'candidate-01', rule_id: row.rule_id, repair_operation_id, variant_id, base_checkpoint_sha256: '0'.repeat(64) }, layerPayload });
      return variant_id;
    } catch {}
  }
  invalid();
}

function centerAndAttach(volumes) {
  const primary = onlyPrimary(volumes); const effects = [];
  for (const volume of volumes) {
    if (volume === primary) {
      if (volume.placement.relation !== 'center' || Object.keys(volume.placement).length !== 1) effects.push({ type: 'set-volume-placement', volume_id: volume.id, placement: { relation: 'center' } });
    } else {
      const suffix = volume.placement.relation.replace(/^(?:detached-|attached-)/u, '');
      if (!suffix || !/^[a-z0-9][a-z0-9-]*$/u.test(suffix)) invalid();
      const placement = { relation: `attached-${suffix}`, attach_to: primary.id };
      if (volume.placement.relation !== placement.relation || volume.placement.attach_to !== primary.id) effects.push({ type: 'set-volume-placement', volume_id: volume.id, placement });
    }
  }
  if (!effects.length) invalid(); return effects;
}
function differentiate(volumes) {
  const primary = onlyPrimary(volumes); const secondaries = volumes.filter((volume) => volume !== primary);
  if (!secondaries.every((volume) => volume.role === 'secondary-mass' && volume.placement.relation.startsWith('attached-') && volume.placement.attach_to === primary.id)
    || !volumes.every((volume) => volume.scale_units.every((value, index) => value === volumes[0].scale_units[index]))) invalid();
  const axis = secondaries[0].scale_units.findIndex((value) => value > 1); if (axis < 0) invalid();
  return [{ type: 'set-volume-scale-axis', volume_id: secondaries[0].id, axis: AXES[axis], value: secondaries[0].scale_units[axis] - 1 }];
}
function promoteLargest(volumes) {
  const largest = [...volumes].sort((a, b) => product(a) < product(b) ? 1 : product(a) > product(b) ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0];
  if (volumes.some((volume) => volume !== largest && (!volume.placement.relation.startsWith('attached-') || volume.placement.attach_to !== largest.id))) invalid();
  const effects = volumes.flatMap((volume) => { const role = volume === largest ? 'primary-mass' : 'secondary-mass'; return volume.role === role ? [] : [{ type: 'set-volume-role', volume_id: volume.id, role }]; });
  if (!effects.length) invalid(); return effects;
}
function reduceSecondary(volumes) {
  const primary = onlyPrimary(volumes);
  if (volumes.some((volume) => volume !== primary
    && (!volume.placement.relation.startsWith('attached-') || volume.placement.attach_to !== primary.id))) invalid();
  const candidate = volumes.find((volume) => volume !== primary && product(volume) >= product(primary)
    && volume.role !== 'primary-mass' && volume.placement.relation.startsWith('attached-') && volume.placement.attach_to === primary.id);
  if (!candidate) invalid();
  const choices = candidate.scale_units.flatMap((value, axis) => {
    const other = product(candidate) / BigInt(value); const next = (product(primary) - 1n) / other;
    return next >= 1n && next < BigInt(value) ? [{ axis, value: Number(next), delta: BigInt(value) - next }] : [];
  }).sort((a, b) => a.delta < b.delta ? -1 : a.delta > b.delta ? 1 : a.axis - b.axis);
  if (!choices.length) invalid(); const choice = choices[0];
  return [{ type: 'set-volume-scale-axis', volume_id: candidate.id, axis: AXES[choice.axis], value: choice.value }];
}
function onlyPrimary(volumes) { const values = volumes.filter((volume) => volume.role === 'primary-mass'); if (values.length !== 1) invalid(); return values[0]; }
function product(volume) { return volume.scale_units.reduce((result, value) => result * BigInt(value), 1n); }
function invalid() { throw executeError('P5_REPAIR_INVALID'); }
