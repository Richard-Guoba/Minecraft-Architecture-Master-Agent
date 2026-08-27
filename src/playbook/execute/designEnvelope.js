import { DESIGN_LAYER_ORDER, EXECUTABLE_REPAIR_ROWS, EXECUTE_SCHEMA_VERSION } from './constants.js';
import { executeError, validateFrozenDesignEnvelope } from './contracts.js';
import { deepFreeze } from '../shadow/canonical.js';
import { createCheckerDefinitions } from '../shadow/checkerRegistry.js';

const SYSTEM_INSTRUCTION = 'Select design intents, reviewed rule IDs, and optional repair variant preferences from the supplied exact lists. Return no patch, path, value, coordinate, block, command, score, threshold, or extra field. Preserve candidate ID, seed, five layer rows, and canonical reviewed order.';
const ENVELOPE_FIELDS = Object.freeze([
  'schema_version', 'candidate_id', 'seed', 'brief_intent', 'layer_intents',
  'selected_rule_ids', 'rejected_rule_ids', 'repair_variant_preferences'
]);
const LAYER_INTENT_FIELDS = Object.freeze(['layer', 'intent']);
const PREFERENCE_FIELDS = Object.freeze(['repair_operation_id', 'variant_id']);
const REPAIR_ORDER = new Map(EXECUTABLE_REPAIR_ROWS.map((row, index) => [row.repair_operation_id, index]));
const CASE_PATTERN_COUNT = 6;
const REVIEWED_REPAIRS = Object.freeze([
  ['repair:massing:resize-or-reposition-volume', ['structure', 'roof', 'facade']],
  ['repair:massing:adjust-volume-overlap', ['structure', 'roof', 'facade']],
  ['repair:massing:strengthen-primary-volume', ['structure', 'roof', 'facade']],
  ['repair:massing:reduce-support-volume-prominence', ['structure', 'roof', 'facade']],
  ['repair:roof:restore-continuous-border', ['facade']], ['repair:roof:change-run-rise-pattern', ['facade']],
  ['repair:roof:add-structural-roof-break', ['facade']], ['repair:facade:rebuild-bay-before-opening', []],
  ['repair:facade:offset-frame-or-infill', []], ['repair:facade:align-partition-to-structure', []],
  ['repair:facade:vary-bay-preserve-motif', []], ['repair:structure:remove-or-support-overhang', ['roof', 'facade']],
  ['repair:structure:connect-support-path', ['roof', 'facade']], ['repair:roof:realign-ridge-or-support', ['facade']],
  ['repair:structure:add-or-widen-base', ['roof', 'facade']], ['repair:massing:move-tower-to-joint', []],
  ['repair:facade:separate-motif-from-bay-template', []], ['repair:facade:connect-or-prune-vegetation', []],
  ['repair:brief:move-detail-budget-to-primary-view', []], ['repair:roof:reduce-dark-secondary-area', []],
  ['repair:brief:restore-unobstructed-scene-depth', []]
]);

export function buildDesignEnvelopePrompt(input = {}) {
  try {
    const { candidateId, seed, prompt, cards } = input;
    const reviewedRules = reviewedRulesFrom(cards);
    assertCandidateSeed(candidateId, seed);
    if (typeof prompt !== 'string') invalid();
    return deepFreeze({
      schema_version: EXECUTE_SCHEMA_VERSION,
      candidate_id: candidateId,
      seed,
      prompt_intent: capCodePoints(prompt, 800),
      reviewed_rules: reviewedRules,
      executable_repair_variants: EXECUTABLE_REPAIR_ROWS.map((row) => ({
        repair_operation_id: row.repair_operation_id,
        allowed_variant_ids: [...row.allowed_variant_ids]
      })),
      required_layers: [...DESIGN_LAYER_ORDER],
      output_contract: {
        fields: [...ENVELOPE_FIELDS],
        layer_intent_fields: [...LAYER_INTENT_FIELDS],
        layer_order: [...DESIGN_LAYER_ORDER],
        rule_id_order: reviewedRules.map((row) => row.rule_id),
        repair_variant_preference_fields: [...PREFERENCE_FIELDS]
      }
    });
  } catch {
    invalid();
  }
}

export async function createFrozenDesignEnvelope(input = {}) {
  try {
    const { mode, candidateId, seed, prompt, cards } = input;
    if (mode === 'mock') {
      const reviewedRules = reviewedRulesFrom(cards);
      assertCandidateSeed(candidateId, seed);
      return validateCandidate(mockEnvelope(candidateId, seed), candidateId, seed, reviewedRules);
    }
    if (mode !== 'llm') invalid();
    const packet = buildDesignEnvelopePrompt({ candidateId, seed, prompt, cards });
    const { client } = input;
    if (!client || typeof client.isConfigured !== 'function' || client.isConfigured() !== true) invalid();
    if (typeof client.chatJson !== 'function') invalid();
    const response = await client.chatJson({ system: SYSTEM_INSTRUCTION, user: packet });
    return validateCandidate(response, candidateId, seed, packet.reviewed_rules);
  } catch {
    invalid();
  }
}

function mockEnvelope(candidateId, seed) {
  return {
    schema_version: EXECUTE_SCHEMA_VERSION,
    candidate_id: candidateId,
    seed,
    brief_intent: 'medieval-residence',
    layer_intents: [
      { layer: 'brief', intent: 'residential-brief' },
      { layer: 'massing', intent: 'three-volume-hierarchy' },
      { layer: 'structure', intent: 'visible-support-path' },
      { layer: 'roof', intent: 'roof-follows-massing' },
      { layer: 'facade', intent: 'frame-before-openings' }
    ],
    selected_rule_ids: ['rule:structure.compose-three-volumes'],
    rejected_rule_ids: [],
    repair_variant_preferences: [
      {
        repair_operation_id: 'repair:massing:strengthen-primary-volume',
        variant_id: 'promote-largest-stable'
      }
    ]
  };
}

function validateCandidate(value, candidateId, seed, reviewedRules) {
  const envelope = validateFrozenDesignEnvelope(value);
  if (envelope.candidate_id !== candidateId || envelope.seed !== seed) invalid();
  const ruleOrder = new Map(reviewedRules.map((row, index) => [row.rule_id, index]));
  assertOrderedRuleSubset(envelope.selected_rule_ids, ruleOrder);
  assertOrderedRuleSubset(envelope.rejected_rule_ids, ruleOrder);
  let previousPreference = -1;
  for (const preference of envelope.repair_variant_preferences) {
    const current = REPAIR_ORDER.get(preference.repair_operation_id);
    if (current === undefined || current <= previousPreference) invalid();
    previousPreference = current;
  }
  return envelope;
}

export function validateReviewedCards(cards) {
  const safeCards = clonePlainData(cards);
  const definitions = createCheckerDefinitions();
  if (!Array.isArray(safeCards) || safeCards.length !== definitions.length) invalid();
  safeCards.forEach((card, index) => {
    if (!card || typeof card !== 'object' || Object.getPrototypeOf(card) !== Object.prototype) invalid();
    const expectedRole = index < definitions.length - CASE_PATTERN_COUNT
      ? 'core-procedure'
      : 'case-pattern';
    const expectedCoverage = expectedRole === 'core-procedure'
      ? 'advisory-partial'
      : 'manual-example-only';
    const projection = card.runtime_projection;
    if (card.rule_id !== definitions[index].rule_id || card.teaching_role !== expectedRole
      || card.design_layer !== definitions[index].design_layer || !projection
      || projection.coverage_status !== expectedCoverage
      || projection.observable_checks?.length !== 1 || projection.observable_checks[0] !== definitions[index].check_id
      || projection.repair_operations?.length !== 1 || projection.repair_operations[0] !== REVIEWED_REPAIRS[index][0]
      || !sameArray(projection.invalidates_layers, REVIEWED_REPAIRS[index][1])) invalid();
  });
  return deepFreeze(safeCards);
}

function reviewedRulesFrom(cards) {
  const safeCards = validateReviewedCards(cards);
  return safeCards.map((card) => ({ rule_id: card.rule_id, teaching_role: card.teaching_role }));
}

function sameArray(left, right) { return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]); }

function clonePlainData(value) {
  const ancestors = new WeakSet();
  const clone = (item) => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) invalid();
      return item;
    }
    if (!item || typeof item !== 'object' || Object.getOwnPropertySymbols(item).length !== 0 || ancestors.has(item)) invalid();
    ancestors.add(item);
    if (Array.isArray(item)) {
      if (Object.getPrototypeOf(item) !== Array.prototype) invalid();
      const names = Object.getOwnPropertyNames(item);
      if (names.length !== item.length + 1 || !names.includes('length')) invalid();
      const result = new Array(item.length);
      for (let index = 0; index < item.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
        result[index] = clone(descriptor.value);
      }
      ancestors.delete(item);
      return result;
    }
    if (Object.getPrototypeOf(item) !== Object.prototype) invalid();
    const result = {};
    for (const key of Object.keys(item)) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
      result[key] = clone(descriptor.value);
    }
    if (Object.getOwnPropertyNames(item).length !== Object.keys(item).length) invalid();
    ancestors.delete(item);
    return result;
  };
  return clone(value);
}

function assertCandidateSeed(candidateId, seed) {
  if (typeof candidateId !== 'string' || !/^candidate-[0-9]{2}$/u.test(candidateId)) invalid();
  if (!Number.isInteger(seed)) invalid();
}

function assertOrderedRuleSubset(values, order) {
  let previous = -1;
  for (const value of values) {
    const current = order.get(value);
    if (current === undefined || current <= previous) invalid();
    previous = current;
  }
}

function capCodePoints(value, maximum) {
  return Array.from(value).slice(0, maximum).join('');
}

function invalid() {
  throw executeError('P5_DESIGN_INVALID');
}
