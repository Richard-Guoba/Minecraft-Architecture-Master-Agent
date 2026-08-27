import { DESIGN_LAYER_ORDER, EXECUTE_COMPILER_VERSION, EXECUTE_SCHEMA_VERSION } from './constants.js';
import {
  executeError,
  validateChainManifest,
  validateFrozenDesignEnvelope,
  validateRepairRequest,
  validateRepairTransaction
} from './contracts.js';
import { executableViolations } from './eligibility.js';
import { createExecutableRepairRegistry } from './repairRegistry.js';
import { deepFreeze, sha256, stableJson } from '../shadow/canonical.js';
import { volumeSemanticHash } from './repairCompilers/massing.js';
import { structuralAnchorHash, validateStructuralAnchors } from './repairCompilers/structure.js';

export function buildRepairTransaction({
  candidateId, review, frozenDesign, baseChainSha256, acceptedChain, layerPayloads
} = {}) {
  try {
    acceptedChain = validateChainManifest(acceptedChain);
    frozenDesign = validateFrozenDesignEnvelope(frozenDesign);
    if (acceptedChain.candidate_id !== candidateId || sha256(stableJson(acceptedChain)) !== baseChainSha256
      || acceptedChain.frozen_design_sha256 !== sha256(stableJson(frozenDesign))
      || acceptedChain.p4_review_sha256 !== sha256(stableJson(review))) stale();
    if (acceptedChain.eligibility.repair_budget_used !== 0) invalid();
    const checkpointHashes = new Map(acceptedChain.checkpoint_hashes.map((row) => [row.layer, row.checkpoint_sha256]));
    if (checkpointHashes.size !== DESIGN_LAYER_ORDER.length) invalid();
    const preferences = validatePreferences(frozenDesign.repair_variant_preferences);
    const violations = executableViolations(review);
    if (violations.length === 0) invalid();
    const registry = createExecutableRepairRegistry();
    const operations = [];
    for (const violation of violations) {
      const definition = registry.get(violation.repair_operation_id);
      if (!definition) invalid();
      const targetLayer = violation.repair_operation_id.startsWith('repair:massing:') ? 'massing' : definition.design_layer;
      const layerPayload = layerPayloads?.[targetLayer];
      const selected = preferences.get(violation.repair_operation_id);
      const variantId = selected ?? definition.chooseDefault({ repair_operation_id: violation.repair_operation_id, layerPayload });
      const request = validateRepairRequest({
        schema_version: EXECUTE_SCHEMA_VERSION,
        candidate_id: candidateId,
        rule_id: violation.rule_id,
        repair_operation_id: violation.repair_operation_id,
        variant_id: variantId,
        base_checkpoint_sha256: checkpointHashes.get(targetLayer)
      });
      operations.push(definition.compile({ request, layerPayload }));
    }
    operations.sort((left, right) => DESIGN_LAYER_ORDER.indexOf(left.target_layer) - DESIGN_LAYER_ORDER.indexOf(right.target_layer)
      || violations.findIndex((row) => row.rule_id === left.rule_id) - violations.findIndex((row) => row.rule_id === right.rule_id));
    rejectConflicts(operations);
    const earliest_target_layer = operations[0].target_layer;
    const invalidated = new Set(operations.flatMap((patch) => patch.invalidates_layers));
    const invalidates_layers = DESIGN_LAYER_ORDER.filter((layer) => invalidated.has(layer));
    return validateRepairTransaction({
      schema_version: EXECUTE_SCHEMA_VERSION,
      compiler_version: EXECUTE_COMPILER_VERSION,
      candidate_id: candidateId,
      base_chain_sha256: baseChainSha256,
      repair_budget: 1,
      earliest_target_layer,
      operations,
      invalidates_layers
    });
  } catch (error) {
    if (['P5_REPAIR_INVALID', 'P5_REPAIR_CONFLICT', 'P5_STALE_BASE', 'P5_AUTHORITY_INVALID'].includes(error?.code)) throw error;
    throw executeError('P5_REPAIR_INVALID');
  }
}

export function applyLayerEffects({ layer, payload, effects, preconditionHashes } = {}) {
  try {
    if (!['massing', 'structure'].includes(layer)) invalid();
    const clone = canonicalClone(payload);
    validatePreconditions(layer, clone, preconditionHashes);
    const synthetic = {
      schema_version: 1, compiler_version: 1, candidate_id: 'candidate-01',
      rule_id: layer === 'massing' ? 'rule:structure.compose-three-volumes' : 'rule:medieval.show-load-path',
      repair_operation_id: layer === 'massing' ? 'repair:massing:resize-or-reposition-volume' : 'repair:structure:connect-support-path',
      variant_id: layer === 'massing' ? 'center-primary-and-reattach-secondaries' : 'connect-known-structural-anchors',
      target_layer: layer, base_checkpoint_sha256: '0'.repeat(64), precondition_hashes: preconditionHashes,
      effects, invalidates_layers: layer === 'massing' ? ['structure', 'roof', 'facade'] : ['roof', 'facade']
    };
    // Reuse the exact effect/precondition validator; tuple metadata is local and discarded.
    validateRepairTransaction({ schema_version: 1, compiler_version: 1, candidate_id: 'candidate-01', base_chain_sha256: '0'.repeat(64), repair_budget: 1, earliest_target_layer: layer, operations: [synthetic], invalidates_layers: synthetic.invalidates_layers });
    rejectEffectConflicts(effects);
    for (const effect of effects) applyEffect(layer, clone, effect);
    revalidateLayer(layer, clone);
    return deepFreeze(canonicalClone(clone));
  } catch (error) {
    if (['P5_REPAIR_INVALID', 'P5_REPAIR_CONFLICT', 'P5_STALE_BASE'].includes(error?.code)) throw error;
    throw executeError('P5_REPAIR_INVALID');
  }
}

function revalidateLayer(layer, payload) {
  if (layer === 'massing') {
    if (!Array.isArray(payload.volumes) || payload.volumes.length !== 3
      || new Set(payload.volumes.map((volume) => volume.id)).size !== 3) invalid();
    for (const volume of payload.volumes) volumeSemanticHash(volume);
    return;
  }
  validateStructuralAnchors(payload.structural_anchors);
  if (!Array.isArray(payload.load_paths) || payload.load_paths.length === 0) invalid();
  for (const path of payload.load_paths) {
    if (!path || Object.getPrototypeOf(path) !== Object.prototype || !sameKeys(path, ['from', 'through', 'to'])
      || ['from', 'through', 'to'].some((key) => typeof path[key] !== 'string' || path[key].length === 0 || path[key].length > 128)) invalid();
  }
}

function rejectEffectConflicts(effects) {
  const fields = new Set();
  for (const effect of effects) {
    const key = effect.type === 'set-volume-role' ? `massing:volumes:${effect.volume_id}:role`
      : effect.type === 'set-volume-placement' ? `massing:volumes:${effect.volume_id}:placement`
        : effect.type === 'set-volume-scale-axis' ? `massing:volumes:${effect.volume_id}:scale:${effect.axis}`
          : effect.type === 'set-load-path' ? 'structure:load_paths' : `unknown:${fields.size}`;
    if (fields.has(key)) throw executeError('P5_REPAIR_CONFLICT');
    fields.add(key);
  }
}

function validatePreferences(value) {
  if (!Array.isArray(value)) invalid();
  const result = new Map();
  for (const row of value) {
    if (!row || Object.getPrototypeOf(row) !== Object.prototype || !sameKeys(row, ['repair_operation_id', 'variant_id'])
      || Object.values(Object.getOwnPropertyDescriptors(row)).some((descriptor) => !Object.hasOwn(descriptor, 'value'))
      || result.has(row.repair_operation_id)) invalid();
    result.set(row.repair_operation_id, row.variant_id);
  }
  return result;
}

function rejectConflicts(operations) {
  const fields = new Set();
  for (const patch of operations) for (const effect of patch.effects) {
    const key = effect.type === 'set-volume-role' ? `massing:volumes:${effect.volume_id}:role`
      : effect.type === 'set-volume-placement' ? `massing:volumes:${effect.volume_id}:placement`
        : effect.type === 'set-volume-scale-axis' ? `massing:volumes:${effect.volume_id}:scale:${effect.axis}`
          : 'structure:load_paths';
    if (fields.has(key)) throw executeError('P5_REPAIR_CONFLICT');
    fields.add(key);
  }
}

function validatePreconditions(layer, payload, rows) {
  if (!Array.isArray(rows) || rows.length === 0) invalid();
  if (layer === 'massing') {
    if (!Array.isArray(payload.volumes) || rows.length !== payload.volumes.length) stale();
    for (const row of rows) {
      const matches = payload.volumes.filter((volume) => volume?.id === row.id);
      if (row.kind !== 'volume' || matches.length !== 1 || volumeSemanticHash(matches[0]) !== row.sha256) stale();
    }
  } else {
    let anchors;
    try { anchors = validateStructuralAnchors(payload.structural_anchors); } catch { stale(); }
    if (rows.length !== 3) stale();
    for (const [index, kind] of ['upper', 'frame', 'base'].entries()) {
      const row = rows[index];
      if (row.kind !== 'structural-anchor' || row.id !== anchors[kind].id || row.sha256 !== structuralAnchorHash(kind, anchors[kind])) stale();
    }
  }
}

function applyEffect(layer, payload, effect) {
  if (effect.type.startsWith('set-volume-')) {
    if (layer !== 'massing' || !Array.isArray(payload.volumes)) invalid();
    const matches = payload.volumes.filter((volume) => volume.id === effect.volume_id);
    if (matches.length !== 1) invalid();
    const volume = matches[0];
    if (effect.type === 'set-volume-role') volume.role = effect.role;
    else if (effect.type === 'set-volume-placement') volume.placement = canonicalClone(effect.placement);
    else volume.scale[['x', 'y', 'z'].indexOf(effect.axis)] = effect.value;
  } else if (effect.type === 'set-load-path') {
    if (layer !== 'structure') invalid();
    payload.load_paths = [{ from: effect.from, through: effect.through, to: effect.to }];
  } else invalid();
}

function canonicalClone(value) {
  const seen = new WeakSet();
  const clone = (item) => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') { if (!Number.isFinite(item)) invalid(); return item; }
    if (!item || typeof item !== 'object' || seen.has(item) || Object.getOwnPropertySymbols(item).length) invalid();
    seen.add(item);
    if (Array.isArray(item)) {
      if (Object.getPrototypeOf(item) !== Array.prototype || Object.getOwnPropertyNames(item).length !== item.length + 1) invalid();
      const output = item.map((_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index)); if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid(); return clone(descriptor.value);
      }); seen.delete(item); return output;
    }
    if (Object.getPrototypeOf(item) !== Object.prototype || Object.getOwnPropertyNames(item).length !== Object.keys(item).length) invalid();
    const output = {};
    for (const key of Object.keys(item)) { const descriptor = Object.getOwnPropertyDescriptor(item, key); if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid(); output[key] = clone(descriptor.value); }
    seen.delete(item); return output;
  };
  return clone(value);
}
function sameKeys(value, expected) { const keys = Object.keys(value); return keys.length === expected.length && keys.every((key) => expected.includes(key)); }
function invalid() { throw executeError('P5_REPAIR_INVALID'); }
function stale() { throw executeError('P5_STALE_BASE'); }
