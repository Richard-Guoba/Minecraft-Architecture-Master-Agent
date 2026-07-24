import path from 'node:path';
import { failContract } from './contractError.js';

const ID = /^[a-z0-9][a-z0-9_.:-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export function cloneDocument(value, documentPath = 'document') {
  try {
    return structuredClone(value);
  } catch (error) {
    failContract(
      'CONTRACT_DOCUMENT_UNCLONEABLE',
      documentPath,
      error?.message || 'structured clone failed'
    );
  }
}

export function deepFreeze(value) {
  if (
    value
    && typeof value === 'object'
    && !Object.isFrozen(value)
  ) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function assertExactObject(
  value,
  objectPath,
  allowedFields,
  requiredFields = allowedFields
) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
  ) {
    failContract('CONTRACT_OBJECT_INVALID', objectPath, 'expected object');
  }
  const allowed = new Set(allowedFields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      failContract(
        'CONTRACT_FIELD_UNKNOWN',
        `${objectPath}.${field}`,
        'unknown field'
      );
    }
  }
  for (const field of requiredFields) {
    if (!Object.hasOwn(value, field)) {
      failContract(
        'CONTRACT_FIELD_REQUIRED',
        `${objectPath}.${field}`,
        'missing field'
      );
    }
  }
  return value;
}

export function assertString(
  value,
  valuePath,
  { minimum = 1, maximum = 4096 } = {}
) {
  if (
    typeof value !== 'string'
    || value.length < minimum
    || value.length > maximum
  ) {
    failContract(
      'CONTRACT_STRING_INVALID',
      valuePath,
      `expected string length ${minimum}..${maximum}`
    );
  }
  return value;
}

export function assertBoolean(value, valuePath) {
  if (typeof value !== 'boolean') {
    failContract('CONTRACT_BOOLEAN_INVALID', valuePath, 'expected boolean');
  }
  return value;
}

export function assertInteger(
  value,
  valuePath,
  { minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER } = {}
) {
  if (
    !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    failContract(
      'CONTRACT_INTEGER_INVALID',
      valuePath,
      `expected safe integer ${minimum}..${maximum}`
    );
  }
  return value;
}

export function assertFiniteNumber(
  value,
  valuePath,
  { minimum = -Infinity, maximum = Infinity } = {}
) {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < minimum
    || value > maximum
  ) {
    failContract(
      'CONTRACT_NUMBER_INVALID',
      valuePath,
      `expected finite number ${minimum}..${maximum}`
    );
  }
  return value;
}

export function assertEnum(value, valuePath, values) {
  if (!values.includes(value)) {
    failContract(
      'CONTRACT_ENUM_INVALID',
      valuePath,
      `expected one of ${values.join(',')}`
    );
  }
  return value;
}

export function assertArray(
  value,
  valuePath,
  { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}
) {
  if (
    !Array.isArray(value)
    || value.length < minimum
    || value.length > maximum
  ) {
    failContract(
      'CONTRACT_ARRAY_INVALID',
      valuePath,
      `expected array length ${minimum}..${maximum}`
    );
  }
  return value;
}

export function assertUniqueStringArray(
  value,
  valuePath,
  { allowed, minimum = 0, maximum = 256 } = {}
) {
  assertArray(value, valuePath, { minimum, maximum });
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const itemPath = `${valuePath}[${index}]`;
    assertString(value[index], itemPath, { maximum: 128 });
    if (allowed) assertEnum(value[index], itemPath, allowed);
    if (seen.has(value[index])) {
      failContract('CONTRACT_ARRAY_DUPLICATE', itemPath, value[index]);
    }
    seen.add(value[index]);
  }
  return value;
}

export function assertIntegerPair(
  value,
  valuePath,
  { minimum, maximum }
) {
  assertArray(value, valuePath, { minimum: 2, maximum: 2 });
  assertInteger(value[0], `${valuePath}[0]`, { minimum, maximum });
  assertInteger(value[1], `${valuePath}[1]`, { minimum, maximum });
  if (value[0] > value[1]) {
    failContract(
      'CONTRACT_RANGE_REVERSED',
      valuePath,
      `${value[0]} > ${value[1]}`
    );
  }
  return value;
}

export function assertCell(value, valuePath) {
  assertArray(value, valuePath, { minimum: 3, maximum: 3 });
  for (let axis = 0; axis < 3; axis += 1) {
    if (
      !Number.isSafeInteger(value[axis])
      || value[axis] < 0
      || value[axis] > 63
    ) {
      failContract(
        'CONTRACT_CELL_INVALID',
        `${valuePath}[${axis}]`,
        'expected integer 0..63'
      );
    }
  }
  return value;
}

export function assertSha256(value, valuePath) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    failContract(
      'CONTRACT_SHA256_INVALID',
      valuePath,
      'expected lowercase SHA-256'
    );
  }
  return value;
}

export function assertId(value, valuePath) {
  if (typeof value !== 'string' || !ID.test(value)) {
    failContract(
      'CONTRACT_ID_INVALID',
      valuePath,
      'expected stable lowercase identifier'
    );
  }
  return value;
}

export function assertArtifactPath(value, valuePath) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\\')
    || path.posix.isAbsolute(value)
    || value === '.'
    || value.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    failContract(
      'CONTRACT_ARTIFACT_PATH_INVALID',
      valuePath,
      String(value)
    );
  }
  return value;
}

export function assertNullable(value, validate) {
  if (value !== null) validate(value);
  return value;
}
