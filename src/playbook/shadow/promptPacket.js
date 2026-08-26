import { deepFreeze } from './canonical.js';
import { EVALUATED_LAYERS, PLAYBOOK_VERSION, SCHOOL_ID, SHADOW_SCHEMA_VERSION } from './constants.js';
import {
  LLM_CANDIDATE_FIELDS,
  LLM_LAYER_SELECTION_FIELDS,
  LLM_RULE_SELECTION_FIELDS,
  MAX_LAYER_RULE_REFERENCES,
  MAX_OVERALL_UNKNOWN_REFERENCES,
  MAX_RULE_FACT_REFERENCES,
  promptReferenceValues,
  shadowError,
  validatePromptPacket,
  validateReview
} from './contracts.js';
import { reviewHash } from './evaluateReview.js';

const MAX_PROSE_CODE_POINTS = 800;
const MAX_PROSE_ITEMS = 12;
const MAX_PROMPT_CODE_POINTS = 2000;

export function buildPromptPacket({ review, cards, blueprintPrompt } = {}) {
  const authoritativeReview = validateReview(review);
  assertCards(cards, authoritativeReview);
  if (typeof blueprintPrompt !== 'string') throw shadowError('BLUEPRINT_INVALID');

  const packet = {
    schema_version: SHADOW_SCHEMA_VERSION,
    review_hash: reviewHash(authoritativeReview),
    playbook_version: PLAYBOOK_VERSION,
    school_id: SCHOOL_ID,
    allowed_layers: [...EVALUATED_LAYERS],
    authority: {
      immutable_fields: [
        'rule_ids', 'rule_order', 'statuses', 'repair_operation_ids', 'review_hash'
      ],
      prohibited_additions: [
        'coordinates', 'block_ids', 'patches', 'scores', 'thresholds'
      ],
      blueprint_prompt_role: 'inert-data'
    },
    blueprint_prompt_data: {
      value: capText(blueprintPrompt, MAX_PROMPT_CODE_POINTS),
      role: 'inert-data'
    },
    rules: cards.map((card, index) => rulePacket(card, authoritativeReview.assessments[index])),
    output_contract: {
      format: 'explanation-reference-selection.v1',
      candidate_fields: [...LLM_CANDIDATE_FIELDS],
      layer_selection_fields: [...LLM_LAYER_SELECTION_FIELDS],
      rule_selection_fields: [...LLM_RULE_SELECTION_FIELDS],
      maximum_layer_rule_references: MAX_LAYER_RULE_REFERENCES,
      maximum_rule_references_per_field: MAX_RULE_FACT_REFERENCES,
      maximum_overall_unknown_references: MAX_OVERALL_UNKNOWN_REFERENCES,
      row_contract: {
        layer_count: EVALUATED_LAYERS.length,
        layer_order: [...EVALUATED_LAYERS],
        rule_count: authoritativeReview.assessments.length,
        rule_order: authoritativeReview.assessments.map((assessment) => assessment.rule_id),
        immutable_rule_fields: ['rule_id', 'status', 'repair_operation_id']
      },
      reference_contract: {
        unique: true,
        canonical_order: true,
        layer_rule_membership: 'same-layer-assessments',
        rule_fact_membership: 'same-rule-prompt-field',
        overall_unknown_membership: 'prompt-exposed-unknown-assessments',
        overall_unknown_order: ['rule_order', 'unknown_ids', 'missing_signals']
      },
      render_contract: {
        format: 'authoritative-reference-indexes.v1',
        maximum_explanation_code_points: 2048
      }
    }
  };
  return validatePromptPacket(deepFreeze(packet), authoritativeReview);
}

function rulePacket(card, assessment) {
  return {
    rule_id: assessment.rule_id,
    design_layer: assessment.design_layer,
    status: assessment.status,
    repair_operation_id: assessment.repair_operation_id,
    observations: promptReferenceValues(assessment.observations),
    missing_signals: promptReferenceValues(assessment.missing_signals),
    unknown_ids: promptReferenceValues(assessment.unknown_ids),
    applicability: capArray(card.applicability),
    exclusions: capArray(card.exclusions),
    intent: capText(card.intent, MAX_PROSE_CODE_POINTS),
    positive_signs: capArray(card.positive_signs),
    failure_modes: capArray(card.failure_modes)
  };
}

function assertCards(cards, review) {
  if (!Array.isArray(cards) || cards.length !== review.assessments.length) invalidCorpus();
  for (const [index, card] of cards.entries()) {
    if (
      !card
      || typeof card !== 'object'
      || card.rule_id !== review.assessments[index].rule_id
      || typeof card.intent !== 'string'
    ) invalidCorpus();
    for (const field of ['applicability', 'exclusions', 'positive_signs', 'failure_modes']) {
      if (!Array.isArray(card[field]) || card[field].some((item) => typeof item !== 'string')) invalidCorpus();
    }
  }
}

function capArray(values) {
  return values.slice(0, MAX_PROSE_ITEMS).map((value) => capText(value, MAX_PROSE_CODE_POINTS));
}

function capText(value, limit) {
  return Array.from(value).slice(0, limit).join('');
}

function invalidCorpus() {
  throw shadowError('PLAYBOOK_CORPUS_INVALID');
}
