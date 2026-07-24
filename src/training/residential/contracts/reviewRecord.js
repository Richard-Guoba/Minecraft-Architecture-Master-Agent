import { failContract } from './contractError.js';
import {
  assertArray,
  assertEnum,
  assertExactObject,
  assertId,
  assertInteger,
  assertString,
  cloneDocument,
  deepFreeze
} from './validation.js';
import {
  RESIDENTIAL_SCHEMA_VERSION,
  REVIEW_RECORD_SOURCE
} from './vocabularies.js';

export function validateReviewRecord(value) {
  const document = cloneDocument(value, 'ReviewRecord');
  assertExactObject(document, 'ReviewRecord', [
    'source',
    'schema_version',
    'review_id',
    'case_id',
    'annotation_revision',
    'kind',
    'status',
    'reviewer',
    'reviewed_at',
    'field_decisions',
    'notes'
  ]);
  if (document.source !== REVIEW_RECORD_SOURCE) {
    failContract(
      'REVIEW_RECORD_SOURCE_INVALID',
      'ReviewRecord.source',
      document.source
    );
  }
  if (document.schema_version !== RESIDENTIAL_SCHEMA_VERSION) {
    failContract(
      'REVIEW_RECORD_VERSION_INVALID',
      'ReviewRecord.schema_version',
      document.schema_version
    );
  }
  assertId(document.review_id, 'ReviewRecord.review_id');
  assertId(document.case_id, 'ReviewRecord.case_id');
  assertInteger(
    document.annotation_revision,
    'ReviewRecord.annotation_revision',
    { minimum: 1, maximum: Number.MAX_SAFE_INTEGER }
  );
  assertEnum(document.kind, 'ReviewRecord.kind', [
    'golden', 'selective', 'audit'
  ]);
  assertEnum(document.status, 'ReviewRecord.status', [
    'pending', 'accepted', 'correction_required', 'rejected'
  ]);
  validateFieldDecisions(document.field_decisions);
  if (document.status === 'pending') {
    if (document.reviewer !== '') {
      failContract(
        'REVIEW_RECORD_PENDING_REVIEWER',
        'ReviewRecord.reviewer',
        document.reviewer
      );
    }
    if (document.reviewed_at !== null || document.field_decisions.length !== 0) {
      failContract(
        'REVIEW_RECORD_PENDING_EVIDENCE',
        'ReviewRecord',
        'pending review must be empty'
      );
    }
  } else {
    assertString(document.reviewer, 'ReviewRecord.reviewer', { maximum: 128 });
    assertTimestamp(document.reviewed_at, 'ReviewRecord.reviewed_at');
  }
  assertString(document.notes, 'ReviewRecord.notes', {
    minimum: 0,
    maximum: 4096
  });
  return deepFreeze(document);
}

function validateFieldDecisions(value) {
  assertArray(value, 'ReviewRecord.field_decisions', { maximum: 4096 });
  for (let index = 0; index < value.length; index += 1) {
    const decision = value[index];
    const decisionPath = `ReviewRecord.field_decisions[${index}]`;
    assertExactObject(decision, decisionPath, [
      'path', 'action', 'value', 'reason'
    ]);
    assertString(decision.path, `${decisionPath}.path`, { maximum: 512 });
    assertEnum(decision.action, `${decisionPath}.action`, [
      'confirm', 'correct', 'reject', 'defer'
    ]);
    if (
      decision.value !== null
      && typeof decision.value !== 'string'
      && typeof decision.value !== 'number'
      && typeof decision.value !== 'boolean'
    ) {
      failContract(
        'REVIEW_RECORD_VALUE_INVALID',
        `${decisionPath}.value`,
        typeof decision.value
      );
    }
    assertString(decision.reason, `${decisionPath}.reason`, { maximum: 2048 });
  }
}

function assertTimestamp(value, valuePath) {
  assertString(value, valuePath, { maximum: 64 });
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || !Number.isFinite(Date.parse(value))
  ) {
    failContract('CONTRACT_TIMESTAMP_INVALID', valuePath, value);
  }
}
