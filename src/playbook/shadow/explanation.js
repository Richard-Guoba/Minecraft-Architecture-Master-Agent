import { createLlmClient } from '../../llm/createLlmClient.js';
import { deepFreeze } from './canonical.js';
import { EVALUATED_LAYERS, SHADOW_SCHEMA_VERSION } from './constants.js';
import {
  renderLlmLayerExplanation,
  renderLlmRuleExplanation,
  shadowError,
  validateExplanation,
  validateLlmCandidate,
  validatePromptPacket,
  validateReview
} from './contracts.js';
import { reviewHash } from './evaluateReview.js';

const MAX_EXPLANATION_CODE_POINTS = 2048;
const MAX_UNKNOWN_ITEMS = 64;
const MAX_PROVIDER_CODE_POINTS = 128;
const SYSTEM_INSTRUCTION = [
  'Select authoritative references from the supplied deterministic architecture review.',
  'Return no explanation prose and copy only exact rule or fact references present in the packet.',
  'Preserve every required row, rule id, rule order, status, repair operation id, and review hash.',
  'Return exactly five layer rows and 21 rule rows in the published order.',
  'Every selected reference must be unique, canonically ordered, and satisfy the published membership and overall-unknown ordering rules.',
  'Follow output_contract exactly and do not add fields.'
].join(' ');

const defaultFactory = () => createLlmClient();

export async function explainReview({ mode, review, promptPacket, createClient = defaultFactory } = {}) {
  const authoritativeReview = validateReview(review);
  if (mode === 'mock') return validateExplanation(mockExplanation(authoritativeReview), authoritativeReview);
  if (mode !== 'llm') throw shadowError('INVALID_ARGUMENT');

  const packet = validatePromptPacket(promptPacket, authoritativeReview);
  if (packet.review_hash !== reviewHash(authoritativeReview)) throw shadowError('BLUEPRINT_INVALID');

  let client;
  try {
    client = createClient();
    if (!client?.isConfigured()) return unavailable(authoritativeReview, 'LLM_UNCONFIGURED', null);
  } catch {
    return unavailable(authoritativeReview, 'LLM_UNCONFIGURED', null);
  }

  const provider = boundedProvider(client);
  let candidate;
  try {
    candidate = await client.chatJson({ system: SYSTEM_INSTRUCTION, user: packet });
  } catch {
    return unavailable(authoritativeReview, 'LLM_REQUEST_FAILED', provider);
  }

  try {
    const selection = validateLlmCandidate(candidate, authoritativeReview, packet);
    return validateExplanation(deepFreeze({
      schema_version: SHADOW_SCHEMA_VERSION,
      review_hash: selection.review_hash,
      mode: 'llm',
      provider,
      status: 'available',
      layer_explanations: selection.layer_selections.map((item) => ({
        layer: item.layer,
        explanation: renderLlmLayerExplanation(item)
      })),
      rule_explanations: selection.rule_selections.map((item) => ({
        rule_id: item.rule_id,
        status: item.status,
        repair_operation_id: item.repair_operation_id,
        explanation: renderLlmRuleExplanation(item)
      })),
      overall_unknowns: selection.overall_unknowns,
      error_code: null
    }), authoritativeReview);
  } catch (error) {
    const code = error?.code === 'LLM_AUTHORITY_VIOLATION'
      ? 'LLM_AUTHORITY_VIOLATION'
      : 'LLM_OUTPUT_INVALID';
    return unavailable(authoritativeReview, code, provider);
  }
}

function mockExplanation(review) {
  return deepFreeze({
    schema_version: SHADOW_SCHEMA_VERSION,
    review_hash: reviewHash(review),
    mode: 'mock',
    provider: 'mock',
    status: 'available',
    layer_explanations: EVALUATED_LAYERS.map((layer) => mockLayerExplanation(layer, review.assessments)),
    rule_explanations: review.assessments.map(mockRuleExplanation),
    overall_unknowns: stableUnknowns(review),
    error_code: null
  });
}

function mockLayerExplanation(layer, assessments) {
  const statuses = assessments
    .filter((assessment) => assessment.design_layer === layer)
    .map((assessment) => assessment.status);
  return { layer, explanation: capText(`${layer}：${statuses.join('；')}`, MAX_EXPLANATION_CODE_POINTS) };
}

function mockRuleExplanation(assessment) {
  const evidence = assessment.observations.length > 0
    ? assessment.observations.join('；')
    : `缺少：${assessment.missing_signals.join('；')}`;
  return {
    rule_id: assessment.rule_id,
    status: assessment.status,
    repair_operation_id: assessment.repair_operation_id,
    explanation: capText(`${assessment.status}：${evidence}`, MAX_EXPLANATION_CODE_POINTS)
  };
}

function stableUnknowns(review) {
  const unknowns = [];
  for (const assessment of review.assessments) {
    if (assessment.status !== 'unknown') continue;
    for (const value of [...assessment.unknown_ids, ...assessment.missing_signals]) {
      const bounded = capText(value, MAX_EXPLANATION_CODE_POINTS);
      if (!unknowns.includes(bounded)) unknowns.push(bounded);
      if (unknowns.length === MAX_UNKNOWN_ITEMS) return unknowns;
    }
  }
  return unknowns;
}

function unavailable(review, errorCode, provider) {
  return validateExplanation(deepFreeze({
    schema_version: SHADOW_SCHEMA_VERSION,
    review_hash: reviewHash(review),
    mode: 'llm',
    provider,
    status: 'unavailable',
    layer_explanations: EVALUATED_LAYERS.map((layer) => ({ layer, explanation: '' })),
    rule_explanations: review.assessments.map((assessment) => ({
      rule_id: assessment.rule_id,
      status: assessment.status,
      repair_operation_id: assessment.repair_operation_id,
      explanation: ''
    })),
    overall_unknowns: [],
    error_code: errorCode
  }), review);
}

function boundedProvider(client) {
  if (typeof client?.name !== 'string' || client.name.length === 0) return null;
  return capText(client.name, MAX_PROVIDER_CODE_POINTS) || null;
}

function capText(value, limit) {
  return Array.from(value).slice(0, limit).join('');
}
