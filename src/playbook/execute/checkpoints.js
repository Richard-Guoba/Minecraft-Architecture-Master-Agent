import { DESIGN_LAYER_ORDER, EXECUTE_SCHEMA_VERSION } from './constants.js';
import {
  executeError,
  validateChainManifest,
  validateCheckpointEnvelope,
  validateCheckpointPayload,
  validateEligibilityRecord
} from './contracts.js';
import { sha256, stableJson } from '../shadow/canonical.js';

const CHECKPOINT_INPUT_FIELDS = Object.freeze([
  'build_id', 'candidate_id', 'layer', 'revision', 'status', 'preceding_envelopes',
  'selected_rule_ids', 'rejected_rule_ids', 'design_intent', 'recipe_fragment',
  'field_patches', 'compiled_artifact_hashes', 'hard_qa', 'design_review',
  'invalidates_downstream', 'replay_origin'
]);
const CHAIN_INPUT_FIELDS = Object.freeze([
  'candidate_id', 'chain_revision', 'parent_chain_sha256', 'checkpoint_envelopes',
  'frozen_design_sha256', 'frozen_generator_context_sha256', 'blueprint_sha256',
  'hard_qa_sha256', 'p4_review_sha256', 'repair_transaction_sha256', 'eligibility',
  'created_from'
]);

export function createCheckpointEnvelope(input) {
  assertExactInput(input, CHECKPOINT_INPUT_FIELDS, 'P5_CHECKPOINT_INVALID');
  const preceding = upstreamRows(input.layer, input.candidate_id, input.preceding_envelopes);
  const checkpoint = validateCheckpointPayload({
    schema_version: EXECUTE_SCHEMA_VERSION,
    playbook_version: '0.1.0',
    build_id: input.build_id,
    candidate_id: input.candidate_id,
    layer: input.layer,
    revision: input.revision,
    status: input.status,
    upstream_accepted_hashes: preceding,
    selected_rule_ids: input.selected_rule_ids,
    rejected_rule_ids: input.rejected_rule_ids,
    design_intent: input.design_intent,
    recipe_fragment: input.recipe_fragment,
    field_patches: input.field_patches,
    compiled_artifact_hashes: input.compiled_artifact_hashes,
    hard_qa: input.hard_qa,
    design_review: input.design_review,
    invalidates_downstream: input.invalidates_downstream,
    replay_origin: input.replay_origin
  });
  return validateCheckpointEnvelope({
    checkpoint_sha256: sha256(stableJson(checkpoint)),
    checkpoint
  });
}

export function checkpointBytes(envelope) {
  const validated = validateCheckpointEnvelope(envelope);
  return Buffer.from(stableJson(validated.checkpoint), 'utf8');
}

export function createChainManifest(input) {
  assertExactInput(input, CHAIN_INPUT_FIELDS, 'P5_CHECKPOINT_INVALID');
  const checkpoints = fullCheckpointEnvelopes(input.candidate_id, input.checkpoint_envelopes);
  const finalCheckpoint = checkpoints.at(-1).checkpoint;
  const eligibility = createEligibilityRecord(input.eligibility);
  if (
    finalCheckpoint.hard_qa.hard_qa_sha256 !== input.hard_qa_sha256
    || finalCheckpoint.design_review.p4_review_sha256 !== input.p4_review_sha256
    || finalCheckpoint.hard_qa.hard_qa_ok !== eligibility.hard_qa_ok
  ) failCheckpoint();
  assertCheckpointOrigins(input, checkpoints);
  return validateChainManifest({
    schema_version: EXECUTE_SCHEMA_VERSION,
    candidate_id: input.candidate_id,
    chain_revision: input.chain_revision,
    parent_chain_sha256: input.parent_chain_sha256,
    checkpoint_hashes: checkpoints.map(({ checkpoint, checkpoint_sha256 }) => ({
      layer: checkpoint.layer,
      checkpoint_sha256
    })),
    frozen_design_sha256: input.frozen_design_sha256,
    frozen_generator_context_sha256: input.frozen_generator_context_sha256,
    blueprint_sha256: input.blueprint_sha256,
    hard_qa_sha256: input.hard_qa_sha256,
    p4_review_sha256: input.p4_review_sha256,
    repair_transaction_sha256: input.repair_transaction_sha256,
    eligibility,
    created_from: input.created_from
  });
}

export function chainManifestBytes(manifest) {
  return Buffer.from(stableJson(validateChainManifest(manifest)), 'utf8');
}

export function chainManifestHash(manifest) {
  return sha256(chainManifestBytes(manifest));
}

export function createEligibilityRecord(input) {
  return validateEligibilityRecord(input);
}

function upstreamRows(layer, candidateId, envelopes) {
  const index = DESIGN_LAYER_ORDER.indexOf(layer);
  if (index < 0 || !Array.isArray(envelopes) || envelopes.length !== index) failCheckpoint();
  return validateEnvelopeSequence(envelopes, candidateId).map(({ checkpoint, checkpoint_sha256 }) => ({
    layer: checkpoint.layer,
    checkpoint_sha256
  }));
}

function fullCheckpointEnvelopes(candidateId, envelopes) {
  if (!Array.isArray(envelopes) || envelopes.length !== DESIGN_LAYER_ORDER.length) failCheckpoint();
  return validateEnvelopeSequence(envelopes, candidateId);
}

function validateEnvelopeSequence(envelopes, candidateId) {
  const validated = [];
  for (const [position, envelope] of envelopes.entries()) {
    const current = validateEnvelopeForLayer(envelope, DESIGN_LAYER_ORDER[position], candidateId);
    const expectedUpstream = validated.map(({ checkpoint, checkpoint_sha256 }) => ({
      layer: checkpoint.layer,
      checkpoint_sha256
    }));
    if (!sameLayerHashes(current.checkpoint.upstream_accepted_hashes, expectedUpstream)) failCheckpoint();
    validated.push(current);
  }
  return validated;
}

function validateEnvelopeForLayer(envelope, layer, candidateId) {
  let validated;
  try {
    validated = validateCheckpointEnvelope(envelope);
  } catch {
    failCheckpoint();
  }
  if (
    validated.checkpoint.layer !== layer
    || validated.checkpoint.candidate_id !== candidateId
    || validated.checkpoint.status !== 'accepted'
  ) failCheckpoint();
  return validated;
}

function assertCheckpointOrigins(input, checkpoints) {
  if (input.created_from === 'initial') {
    if (checkpoints.some(({ checkpoint }) => checkpoint.replay_origin !== null)) failCheckpoint();
    return;
  }
  let replayStart = -1;
  for (const [index, { checkpoint }] of checkpoints.entries()) {
    const origin = checkpoint.replay_origin;
    if (origin === null) {
      if (replayStart >= 0) failCheckpoint();
      continue;
    }
    if (replayStart < 0) replayStart = index;
    if (
      origin.base_chain_sha256 !== input.parent_chain_sha256
      || origin.repair_transaction_sha256 !== input.repair_transaction_sha256
    ) failCheckpoint();
  }
  if (replayStart < 0) failCheckpoint();
}

function sameLayerHashes(left, right) {
  return left.length === right.length && left.every((row, index) => (
    row.layer === right[index].layer && row.checkpoint_sha256 === right[index].checkpoint_sha256
  ));
}

function assertExactInput(value, fields, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw executeError(code);
  }
  if (Object.getOwnPropertySymbols(value).length !== 0 || Object.getOwnPropertyNames(value).length !== fields.length) {
    throw executeError(code);
  }
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw executeError(code);
  }
}

function failCheckpoint() {
  throw executeError('P5_CHECKPOINT_INVALID');
}
