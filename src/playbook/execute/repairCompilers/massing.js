import { EXECUTE_COMPILER_VERSION, EXECUTE_SCHEMA_VERSION, EXECUTABLE_REPAIR_ROWS } from '../constants.js';
import { executeError, validateRepairRequest, validateResolvedPatch } from '../contracts.js';
import { sha256, stableJson } from '../../shadow/canonical.js';

const ROWS = new Map(EXECUTABLE_REPAIR_ROWS.filter((row) => row.repair_operation_id.startsWith('repair:massing:')).map((row) => [row.repair_operation_id, row]));
const AXES = ['x', 'y', 'z'];

export function compileMassingRepair({ request, layerPayload } = {}) {
  try {
    request = validateRepairRequest(request);
    const row = ROWS.get(request.repair_operation_id);
    const volumes = validateVolumes(layerPayload?.volumes);
    if (!row) invalid();
    let effects;
    switch (request.variant_id) {
      case 'center-primary-and-reattach-secondaries': effects = centerAndAttach(volumes); break;
      case 'differentiate-equal-secondary-scale': effects = differentiate(volumes); break;
      case 'promote-largest-stable': effects = promoteLargest(volumes); break;
      case 'reduce-nondominant-secondary': effects = reduceSecondary(volumes, false); break;
      case 'reduce-attached-support-scale': effects = reduceSecondary(volumes, true); break;
      default: invalid();
    }
    return validateResolvedPatch({
      schema_version: EXECUTE_SCHEMA_VERSION,
      compiler_version: EXECUTE_COMPILER_VERSION,
      candidate_id: request.candidate_id,
      rule_id: request.rule_id,
      repair_operation_id: request.repair_operation_id,
      variant_id: request.variant_id,
      target_layer: 'massing',
      base_checkpoint_sha256: request.base_checkpoint_sha256,
      precondition_hashes: volumes.map((volume) => ({ kind: 'volume', id: volume.id, sha256: semanticHash(volume) })),
      effects,
      invalidates_layers: row.invalidates_layers
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

export function volumeSemanticHash(volume) {
  return semanticHash(validateVolume(volume));
}

function centerAndAttach(volumes) {
  const primary = onlyPrimary(volumes);
  const effects = [];
  for (const volume of volumes) {
    if (volume === primary) {
      if (volume.placement.relation !== 'center' || Object.keys(volume.placement).length !== 1) effects.push({ type: 'set-volume-placement', volume_id: volume.id, placement: { relation: 'center' } });
      continue;
    }
    const suffix = volume.placement.relation.replace(/^(?:detached-|attached-)/u, '');
    if (!suffix || !/^[a-z0-9][a-z0-9-]*$/u.test(suffix)) invalid();
    const placement = { relation: `attached-${suffix}`, attach_to: primary.id };
    if (volume.placement.relation !== placement.relation || volume.placement.attach_to !== primary.id) effects.push({ type: 'set-volume-placement', volume_id: volume.id, placement });
  }
  if (effects.length === 0) invalid();
  return effects;
}

function differentiate(volumes) {
  const primary = onlyPrimary(volumes);
  const secondaries = volumes.filter((volume) => volume !== primary);
  if (!secondaries.every((volume) => volume.role === 'secondary-mass' && volume.placement.relation.startsWith('attached-') && volume.placement.attach_to === primary.id)) invalid();
  if (!volumes.every((volume) => volume.scale.every((value, index) => value === volumes[0].scale[index]))) invalid();
  const axis = secondaries[0].scale.findIndex((value) => value > 1);
  if (axis < 0) invalid();
  return [{ type: 'set-volume-scale-axis', volume_id: secondaries[0].id, axis: AXES[axis], value: secondaries[0].scale[axis] - 1 }];
}

function promoteLargest(volumes) {
  const largest = [...volumes].sort((a, b) => product(b) - product(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
  const effects = volumes.flatMap((volume) => {
    const role = volume === largest ? 'primary-mass' : 'secondary-mass';
    return volume.role === role ? [] : [{ type: 'set-volume-role', volume_id: volume.id, role }];
  });
  if (effects.length === 0) invalid();
  return effects;
}

function reduceSecondary(volumes, supportOnly) {
  const primary = onlyPrimary(volumes);
  const candidate = volumes.find((volume) => volume !== primary
    && product(volume) >= product(primary)
    && (!supportOnly || volume.placement.relation.startsWith('attached-') && volume.placement.attach_to === primary.id));
  if (!candidate) invalid();
  const choices = candidate.scale.flatMap((value, axis) => {
    const other = product(candidate) / value;
    const next = Math.floor((product(primary) - 1) / other);
    return next >= 1 && next < value ? [{ axis, value: next, delta: value - next }] : [];
  }).sort((a, b) => a.delta - b.delta || a.axis - b.axis);
  if (choices.length === 0) invalid();
  const choice = choices[0];
  return [{ type: 'set-volume-scale-axis', volume_id: candidate.id, axis: AXES[choice.axis], value: choice.value }];
}

function validateVolumes(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== 3) invalid();
  const volumes = value.map(validateVolume);
  if (new Set(volumes.map((volume) => volume.id)).size !== volumes.length) invalid();
  return volumes;
}

function validateVolume(value) {
  assertCanonical(value);
  if (!plain(value) || typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,127}$/u.test(value.id)
    || value.shape !== 'box' || !['primary-mass', 'secondary-mass', 'support-volume'].includes(value.role)
    || !Array.isArray(value.scale) || value.scale.length !== 3 || value.scale.some((part) => !Number.isInteger(part) || part <= 0)
    || !plain(value.placement) || typeof value.placement.relation !== 'string'
    || !/^[a-z0-9][a-z0-9-]{0,127}$/u.test(value.placement.relation)) invalid();
  for (const object of [value, value.placement]) {
    if (Object.getOwnPropertySymbols(object).length || Object.getOwnPropertyNames(object).some((key) => !Object.getOwnPropertyDescriptor(object, key)?.value && !Object.hasOwn(Object.getOwnPropertyDescriptor(object, key) || {}, 'value'))) invalid();
  }
  if (value.placement.attach_to !== undefined && (typeof value.placement.attach_to !== 'string' || !/^[a-z0-9][a-z0-9-]{0,127}$/u.test(value.placement.attach_to))) invalid();
  return value;
}

function assertCanonical(value, seen = new WeakSet()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) invalid(); return; }
  if (!value || typeof value !== 'object' || seen.has(value) || Object.getOwnPropertySymbols(value).length) invalid();
  seen.add(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertyNames(value).length !== value.length + 1) invalid();
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid();
      assertCanonical(descriptor.value, seen);
    }
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertyNames(value).length !== Object.keys(value).length) invalid();
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid();
      assertCanonical(descriptor.value, seen);
    }
  }
  seen.delete(value);
}

function onlyPrimary(volumes) {
  const primaries = volumes.filter((volume) => volume.role === 'primary-mass');
  if (primaries.length !== 1) invalid();
  return primaries[0];
}

function semanticHash(volume) {
  return sha256(stableJson({ id: volume.id, role: volume.role, scale: volume.scale, placement: volume.placement }));
}
function product(volume) { return volume.scale.reduce((result, value) => result * value, 1); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function invalid() { throw executeError('P5_REPAIR_INVALID'); }
