import { createLlmClient } from '../../llm/createLlmClient.js';
import { deepFreeze } from './canonical.js';
import { EVALUATED_LAYERS, SHADOW_SCHEMA_VERSION } from './constants.js';
import { shadowError, validateExplanation, validatePromptPacket, validateReview } from './contracts.js';
import { reviewHash } from './evaluateReview.js';

const MAX_EXPLANATION_CODE_POINTS = 2048;
const MAX_UNKNOWN_ITEMS = 64;
const MAX_PROVIDER_CODE_POINTS = 128;
const LLM_CANDIDATE_FIELDS = Object.freeze([
  'review_hash', 'layer_explanations', 'rule_explanations', 'overall_unknowns'
]);

const SYSTEM_INSTRUCTION = [
  'Explain the supplied deterministic architecture review.',
  'Do not change any rule id, rule order, status, repair operation id, or review hash.',
  'Do not add coordinates, block ids, patches, scores, thresholds, or other fields.',
  'Return JSON with exactly review_hash, layer_explanations, rule_explanations, and overall_unknowns.'
].join(' ');

const defaultFactory = () => createLlmClient();

export async function explainReview({ mode, review, promptPacket, createClient = defaultFactory } = {}) {
  const authoritativeReview = validateReview(review);
  if (mode === 'mock') return validateExplanation(mockExplanation(authoritativeReview), authoritativeReview);
  if (mode !== 'llm') throw shadowError('INVALID_ARGUMENT');

  const packet = validatePromptPacket(promptPacket);
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
    const content = validateLlmCandidateShape(candidate);
    return validateExplanation(deepFreeze({
      schema_version: SHADOW_SCHEMA_VERSION,
      review_hash: content.review_hash,
      mode: 'llm',
      provider,
      status: 'available',
      layer_explanations: content.layer_explanations,
      rule_explanations: content.rule_explanations,
      overall_unknowns: content.overall_unknowns,
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

function validateLlmCandidateShape(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw shadowError('LLM_OUTPUT_INVALID');
  }
  const keys = Object.keys(candidate);
  if (
    keys.length !== LLM_CANDIDATE_FIELDS.length
    || keys.some((key) => !LLM_CANDIDATE_FIELDS.includes(key))
    || LLM_CANDIDATE_FIELDS.some((key) => !Object.hasOwn(candidate, key))
  ) throw shadowError('LLM_OUTPUT_INVALID');
  return candidate;
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
