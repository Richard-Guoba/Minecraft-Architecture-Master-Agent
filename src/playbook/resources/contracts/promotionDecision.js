import { failPlaybookContract } from '../../contracts/playbookContractError.js';
import { DECISIONS, RESOURCE_SCHEMA_VERSION } from './vocabularies.js';
import {
  assertExactObject,
  assertLowercaseKebabId,
  assertRelativeResourcePath,
  assertSha256,
  assertString,
  assertTimestamp,
  assertUniqueArray,
  cloneResourceDocument,
  deepFreeze
} from './validation.js';

export const PROMOTION_DECISION_FIELDS = Object.freeze([
  'schema_version', 'decision_id', 'source_id', 'decision', 'decided_by', 'decided_at',
  'assessment_path', 'assessment_sha256', 'probe_ids', 'conditions', 'reason'
]);

export function validateResourcePromotionDecision(value) {
  const decision = cloneResourceDocument(value, 'ResourcePromotionDecision');
  assertExactObject(decision, 'ResourcePromotionDecision', PROMOTION_DECISION_FIELDS);
  if (decision.schema_version !== RESOURCE_SCHEMA_VERSION) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_VERSION_INVALID',
      'ResourcePromotionDecision.schema_version',
      decision.schema_version
    );
  }
  assertLowercaseKebabId(decision.decision_id, 'ResourcePromotionDecision.decision_id');
  assertLowercaseKebabId(decision.source_id, 'ResourcePromotionDecision.source_id');
  assertDecision(decision.decision);
  if (decision.decided_by !== 'project-owner') {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_DECIDER_INVALID',
      'ResourcePromotionDecision.decided_by',
      decision.decided_by
    );
  }
  assertTimestamp(decision.decided_at, 'ResourcePromotionDecision.decided_at');
  assertRelativeResourcePath(decision.assessment_path, 'ResourcePromotionDecision.assessment_path');
  if (decision.assessment_path !== `sources/${decision.source_id}/assessment.md`) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_DECISION_SOURCE_MISMATCH',
      'ResourcePromotionDecision.assessment_path',
      decision.assessment_path
    );
  }
  assertSha256(decision.assessment_sha256, 'ResourcePromotionDecision.assessment_sha256');
  assertUniqueArray(decision.probe_ids, 'ResourcePromotionDecision.probe_ids', {
    minimum: 3,
    maximum: 5,
    validate: assertLowercaseKebabId
  });
  assertOrderedOriginalStrings(decision.conditions, 'ResourcePromotionDecision.conditions');
  assertString(decision.reason, 'ResourcePromotionDecision.reason', { maximum: 512 });
  return deepFreeze(decision);
}

function assertDecision(value) {
  if (!DECISIONS.includes(value)) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_DECISION_INVALID',
      'ResourcePromotionDecision.decision',
      value
    );
  }
}

function assertOrderedOriginalStrings(value, valuePath) {
  if (!Array.isArray(value) || value.length > 32) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_ARRAY_INVALID',
      valuePath,
      'expected array length 0..32'
    );
  }
  for (const [index, item] of value.entries()) {
    assertString(item, `${valuePath}[${index}]`, { maximum: 256 });
  }
}
