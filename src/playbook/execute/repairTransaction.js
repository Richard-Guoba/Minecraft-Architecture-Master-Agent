import { DESIGN_LAYER_ORDER, EXECUTE_COMPILER_VERSION, EXECUTE_SCHEMA_VERSION } from './constants.js';
import {
  executeError, validateChainManifest, validateCheckpointEnvelope, validateFrozenDesignEnvelope,
  validateRepairRequest, validateRepairTransaction, validateResolvedPatch
} from './contracts.js';
import { executableViolations } from './eligibility.js';
import { createExecutableRepairRegistry } from './repairRegistry.js';
import { deepFreeze, sha256, stableJson } from '../shadow/canonical.js';
import {
  applySemanticRole, canonicalClone, projectMassingPayload, projectStructurePayload, unitsToScale
} from './repairProjection.js';

export function buildRepairTransaction(input = {}) {
  try {
    if (Object.hasOwn(input, 'layerPayloads')) invalid();
    const { candidateId, review, frozenDesign: frozenDesignInput, baseChainSha256, acceptedChain: acceptedChainInput, checkpointEnvelopes } = input;
    let acceptedChain = acceptedChainInput;
    let frozenDesign = frozenDesignInput;
    acceptedChain = validateChainManifest(acceptedChain);
    frozenDesign = validateFrozenDesignEnvelope(frozenDesign);
    if (acceptedChain.candidate_id !== candidateId || sha256(stableJson(acceptedChain)) !== baseChainSha256
      || acceptedChain.frozen_design_sha256 !== sha256(stableJson(frozenDesign))
      || acceptedChain.p4_review_sha256 !== sha256(stableJson(review))) stale();
    if (acceptedChain.eligibility.repair_budget_used !== 0) invalid();
    const payloads = acceptedPayloads(checkpointEnvelopes, acceptedChain, candidateId);
    const preferences = new Map(frozenDesign.repair_variant_preferences.map((row) => [row.repair_operation_id, row.variant_id]));
    const violations = executableViolations(review); if (!violations.length) invalid();
    const registry = createExecutableRepairRegistry(); const operations = [];
    for (const violation of violations) {
      const definition = registry.get(violation.repair_operation_id); if (!definition) invalid();
      const targetLayer = violation.repair_operation_id.startsWith('repair:massing:') ? 'massing' : definition.design_layer;
      const layerPayload = payloads.get(targetLayer); const selected = preferences.get(violation.repair_operation_id);
      const variantId = selected ?? definition.chooseDefault({ repair_operation_id: violation.repair_operation_id, layerPayload });
      const request = validateRepairRequest({
        schema_version: EXECUTE_SCHEMA_VERSION, candidate_id: candidateId, rule_id: violation.rule_id,
        repair_operation_id: violation.repair_operation_id, variant_id: variantId,
        base_checkpoint_sha256: acceptedChain.checkpoint_hashes[DESIGN_LAYER_ORDER.indexOf(targetLayer)].checkpoint_sha256
      });
      operations.push(definition.compile({ request, layerPayload }));
    }
    operations.sort((left, right) => DESIGN_LAYER_ORDER.indexOf(left.target_layer) - DESIGN_LAYER_ORDER.indexOf(right.target_layer)
      || violations.findIndex((row) => row.rule_id === left.rule_id) - violations.findIndex((row) => row.rule_id === right.rule_id));
    const invalidated = new Set(operations.flatMap((patch) => patch.invalidates_layers));
    return validateRepairTransaction({
      schema_version: EXECUTE_SCHEMA_VERSION, compiler_version: EXECUTE_COMPILER_VERSION,
      candidate_id: candidateId, base_chain_sha256: baseChainSha256, repair_budget: 1,
      earliest_target_layer: operations[0].target_layer, operations,
      invalidates_layers: DESIGN_LAYER_ORDER.filter((layer) => invalidated.has(layer))
    });
  } catch (error) {
    if (['P5_REPAIR_INVALID', 'P5_REPAIR_CONFLICT', 'P5_STALE_BASE', 'P5_AUTHORITY_INVALID', 'P5_CHECKPOINT_INVALID'].includes(error?.code)) throw error;
    throw executeError('P5_REPAIR_INVALID');
  }
}

export function applyLayerEffects({ payload, operations } = {}) {
  try {
    if (!Array.isArray(operations) || !operations.length) invalid();
    const validated = operations.map(validateResolvedPatch);
    const targetLayer = validated[0].target_layer;
    const registry = createExecutableRepairRegistry();
    const registryOrder = new Map([...registry.keys()].map((operationId, index) => [operationId, index]));
    let previousOrder = -1;
    for (const patch of validated) {
      const operationOrder = registryOrder.get(patch.repair_operation_id);
      const order = operationOrder === undefined
        ? -1
        : DESIGN_LAYER_ORDER.indexOf(patch.target_layer) * registryOrder.size + operationOrder;
      if (patch.target_layer !== targetLayer || patch.candidate_id !== validated[0].candidate_id
        || patch.base_checkpoint_sha256 !== validated[0].base_checkpoint_sha256 || order <= previousOrder) invalid();
      previousOrder = order;
    }
    assertNoConflicts(validated);
    for (const patch of validated) {
      const request = validateRepairRequest({
        schema_version: patch.schema_version, candidate_id: patch.candidate_id, rule_id: patch.rule_id,
        repair_operation_id: patch.repair_operation_id, variant_id: patch.variant_id,
        base_checkpoint_sha256: patch.base_checkpoint_sha256
      });
      const compiler = registry.get(patch.repair_operation_id)?.compile; if (!compiler) invalid();
      let recompiled;
      try { recompiled = compiler({ request, layerPayload: payload }); } catch { stale(); }
      if (stableJson(recompiled.precondition_hashes) !== stableJson(patch.precondition_hashes)) stale();
      if (stableJson(recompiled) !== stableJson(patch)) invalid();
    }
    const clone = canonicalClone(payload);
    if (targetLayer === 'massing') applyMassing(clone, validated);
    else if (targetLayer === 'structure') applyStructure(clone, validated);
    else invalid();
    return deepFreeze(canonicalClone(clone));
  } catch (error) {
    if (['P5_REPAIR_INVALID', 'P5_REPAIR_CONFLICT', 'P5_STALE_BASE'].includes(error?.code)) throw error;
    throw executeError('P5_REPAIR_INVALID');
  }
}

function acceptedPayloads(envelopes, chain, candidateId) {
  if (!Array.isArray(envelopes) || Object.getPrototypeOf(envelopes) !== Array.prototype
    || envelopes.length !== DESIGN_LAYER_ORDER.length || Object.getOwnPropertyNames(envelopes).length !== envelopes.length + 1) checkpointInvalid();
  const output = new Map(); const preceding = [];
  for (const [index, raw] of envelopes.entries()) {
    const descriptor = Object.getOwnPropertyDescriptor(envelopes, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) checkpointInvalid();
    const envelope = validateCheckpointEnvelope(raw); const checkpoint = envelope.checkpoint;
    if (checkpoint.layer !== DESIGN_LAYER_ORDER[index] || checkpoint.candidate_id !== candidateId || checkpoint.status !== 'accepted'
      || envelope.checkpoint_sha256 !== chain.checkpoint_hashes[index].checkpoint_sha256
      || checkpoint.upstream_accepted_hashes.length !== preceding.length
      || checkpoint.upstream_accepted_hashes.some((row, position) => row.layer !== preceding[position].layer || row.checkpoint_sha256 !== preceding[position].checkpoint_sha256)) checkpointInvalid();
    preceding.push({ layer: checkpoint.layer, checkpoint_sha256: envelope.checkpoint_sha256 });
    output.set(checkpoint.layer, checkpoint.recipe_fragment.payload);
  }
  return output;
}

function applyMassing(payload, operations) {
  const projection = projectMassingPayload(payload); const byId = new Map(payload.volumes.map((volume) => [volume.id, volume]));
  for (const patch of operations) for (const effect of patch.effects) {
    const volume = byId.get(effect.volume_id); if (!volume) invalid();
    if (effect.type === 'set-volume-role') applySemanticRole(volume, effect.role);
    else if (effect.type === 'set-volume-placement') volume.placement = canonicalClone(effect.placement);
    else if (effect.type === 'set-volume-scale-axis') volume.scale[['x', 'y', 'z'].indexOf(effect.axis)] = unitsToScale(effect.value, projection.precision);
    else invalid();
  }
  const after = projectMassingPayload(payload);
  const primaries = after.volumes.filter((volume) => volume.role === 'primary-mass');
  if (primaries.length !== 1) invalid();
  const primary = primaries[0];
  const ids = new Set(after.volumes.map((volume) => volume.id));
  for (const volume of after.volumes) if (volume !== primary && (!volume.placement.relation.startsWith('attached-') || volume.placement.attach_to !== primary.id || !ids.has(volume.placement.attach_to))) invalid();
}

function applyStructure(payload, operations) {
  projectStructurePayload(payload);
  for (const patch of operations) for (const effect of patch.effects) {
    if (effect.type !== 'set-load-path') invalid();
    payload.load_paths = [{ from: effect.from, through: effect.through, to: effect.to }];
  }
  const projection = projectStructurePayload(payload);
  const [upper, frame, base] = projection.anchors;
  if (payload.load_paths.length !== 1 || payload.load_paths[0].from !== upper.value || payload.load_paths[0].through !== frame.value || payload.load_paths[0].to !== base.value) invalid();
}

function assertNoConflicts(operations) {
  const fields = new Set();
  for (const patch of operations) for (const effect of patch.effects) {
    const field = effect.type === 'set-volume-role' ? `role:${effect.volume_id}`
      : effect.type === 'set-volume-placement' ? `placement:${effect.volume_id}`
        : effect.type === 'set-volume-scale-axis' ? `scale:${effect.volume_id}:${effect.axis}` : 'load_paths';
    if (fields.has(field)) throw executeError('P5_REPAIR_CONFLICT'); fields.add(field);
  }
}
function invalid() { throw executeError('P5_REPAIR_INVALID'); }
function stale() { throw executeError('P5_STALE_BASE'); }
function checkpointInvalid() { throw executeError('P5_CHECKPOINT_INVALID'); }
