import { failPlaybookContract } from '../../contracts/playbookContractError.js';
import { RATING_DIMENSIONS } from './vocabularies.js';

const LOWERCASE_KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export function cloneResourceDocument(value, documentPath = 'ResourceDocument') {
  try {
    return structuredClone(value);
  } catch (error) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_DOCUMENT_UNCLONEABLE',
      documentPath,
      error?.message || 'structured clone failed'
    );
  }
}

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function assertExactObject(value, objectPath, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_OBJECT_INVALID', objectPath, 'expected object'
    );
  }
  const allowed = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_FIELD_UNKNOWN',
        `${objectPath}.${field}`,
        'unknown field'
      );
    }
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_FIELD_REQUIRED',
        `${objectPath}.${field}`,
        'missing field'
      );
    }
  }
  return value;
}

export function assertString(value, valuePath, { minimum = 1, maximum = 512 } = {}) {
  const length = typeof value === 'string' ? Array.from(value).length : 0;
  if (typeof value !== 'string' || length < minimum || length > maximum) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_FIELD_INVALID',
      valuePath,
      `expected string length ${minimum}..${maximum}`
    );
  }
  return value;
}

export function assertTimestamp(value, valuePath) {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (
    !Number.isFinite(parsed)
    || new Date(parsed).toISOString() !== value
  ) {
    failPlaybookContract('PLAYBOOK_RESOURCE_TIMESTAMP_INVALID', valuePath, String(value));
  }
  return value;
}

export function assertHttpsUrl(value, valuePath) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    failPlaybookContract('PLAYBOOK_RESOURCE_URL_INVALID', valuePath, String(value));
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    failPlaybookContract('PLAYBOOK_RESOURCE_URL_INVALID', valuePath, String(value));
  }
  return value;
}

export function assertLowercaseKebabId(value, valuePath) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 64
    || !LOWERCASE_KEBAB_ID.test(value)
  ) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_ID_INVALID', valuePath, 'expected lowercase kebab ID'
    );
  }
  return value;
}

export function assertRelativeResourcePath(value, valuePath) {
  const length = typeof value === 'string' ? Array.from(value).length : 0;
  if (
    typeof value !== 'string'
    || length < 1
    || length > 512
    || value.startsWith('/')
    || value.includes('\\')
    || value.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    failPlaybookContract('PLAYBOOK_RESOURCE_PATH_INVALID', valuePath, String(value));
  }
  return value;
}

export function assertUniqueArray(
  value,
  valuePath,
  { minimum = 0, maximum = 64, validate = () => {} } = {}
) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_ARRAY_INVALID',
      valuePath,
      `expected array length ${minimum}..${maximum}`
    );
  }
  const seen = new Set();
  for (const [index, item] of value.entries()) {
    validate(item, `${valuePath}[${index}]`);
    const key = JSON.stringify(item);
    if (seen.has(key)) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_ARRAY_DUPLICATE', `${valuePath}[${index}]`, key
      );
    }
    seen.add(key);
  }
  return value;
}

export function assertNullable(value, validate) {
  if (value !== null) validate(value);
  return value;
}

export function assertObservationEvidenceUrl(
  status,
  evidenceUrl,
  valuePath,
  { requiredStatuses, requiredCode, forbiddenCode }
) {
  const evidencePath = `${valuePath}.evidence_url`;
  if (requiredStatuses.includes(status) && evidenceUrl === null) {
    failPlaybookContract(
      requiredCode,
      evidencePath,
      `${status} observations require an HTTPS evidence_url`
    );
  }
  if (
    (status === 'unknown' || status === 'not-reviewed')
    && evidenceUrl !== null
  ) {
    failPlaybookContract(
      forbiddenCode,
      evidencePath,
      `${status} observations require null evidence_url`
    );
  }
  assertNullable(evidenceUrl, (url) => assertHttpsUrl(url, evidencePath));
  return evidenceUrl;
}

export function assertSha256(value, valuePath) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_SHA256_INVALID', valuePath, 'expected lowercase SHA-256'
    );
  }
  return value;
}

export function assertRating(value, valuePath) {
  assertExactObject(value, valuePath, ['value', 'reason']);
  if (
    value.value !== 'unknown'
    && (!Number.isInteger(value.value) || value.value < 0 || value.value > 4)
  ) {
    failPlaybookContract('PLAYBOOK_RESOURCE_RATING_INVALID', `${valuePath}.value`, value.value);
  }
  assertString(value.reason, `${valuePath}.reason`, { maximum: 512 });
  return value;
}

export function assertRatings(value, valuePath) {
  assertExactObject(value, valuePath, RATING_DIMENSIONS);
  for (const dimension of RATING_DIMENSIONS) {
    assertRating(value[dimension], `${valuePath}.${dimension}`);
  }
  return value;
}
