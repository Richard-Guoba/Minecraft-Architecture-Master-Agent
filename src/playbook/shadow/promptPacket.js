import { deepFreeze } from './canonical.js';
import { EVALUATED_LAYERS, PLAYBOOK_VERSION, SCHOOL_ID, SHADOW_SCHEMA_VERSION } from './constants.js';
import { shadowError, validatePromptPacket, validateReview } from './contracts.js';
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
      format: 'explanation.json.v1',
      permitted_rule_fields: ['rule_id', 'status', 'repair_operation_id', 'explanation']
    }
  };
  return validatePromptPacket(deepFreeze(packet));
}

function rulePacket(card, assessment) {
  return {
    rule_id: assessment.rule_id,
    status: assessment.status,
    repair_operation_id: assessment.repair_operation_id,
    observations: capArray(assessment.observations),
    missing_signals: capArray(assessment.missing_signals),
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
