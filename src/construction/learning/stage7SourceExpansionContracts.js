export const SOURCE_EXPANSION_SCHEMA_VERSION = 1;
export const CANDIDATE_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
export const LOCAL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
export const RIGHTS_CONCLUSIONS = Object.freeze([
  'verified',
  'deferred',
  'private_research_only',
  'rejected'
]);
export const REVIEW_DECISIONS = Object.freeze(['accept', 'defer', 'reject']);
export const REVIEW_WAVES = Object.freeze(['discovery', 'yield']);

const DISCOVERY_KEYS = Object.freeze([
  'schema_version',
  'candidate_id',
  'source_id',
  'asset_id',
  'canonical_url',
  'preview_url',
  'author',
  'title',
  'observed_at',
  'published_at',
  'claimed_format',
  'public_dimensions',
  'building_type',
  'style',
  'signals'
]);
const DIMENSION_KEYS = Object.freeze(['x', 'y', 'z']);
const SIGNAL_KEYS = Object.freeze([
  'popularity',
  'reception',
  'preview_completeness',
  'building_completeness',
  'technical_compatibility',
  'scarcity',
  'duplicate_risk'
]);
const RIGHTS_KEYS = Object.freeze([
  'schema_version',
  'candidate_id',
  'revision',
  'observed_at',
  'reviewed_by',
  'scope',
  'authoritative_urls',
  'author_chain',
  'permissions',
  'conditions',
  'ai_ml_restriction',
  'platform_conflict',
  'upstream_conflict',
  'conclusion',
  'reason_codes'
]);
const PERMISSION_KEYS = Object.freeze([
  'download',
  'copy',
  'transform',
  'training',
  'derivative_research_artifacts',
  'local_retention'
]);
const REVIEW_KEYS = Object.freeze([
  'schema_version',
  'candidate_id',
  'wave',
  'revision',
  'decided_at',
  'decided_by',
  'decision'
]);

export class SourceExpansionContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'SourceExpansionContractError';
    this.code = code;
  }
}

export function parseValidatedJsonl(text, validator) {
  if (typeof text !== 'string' || typeof validator !== 'function') {
    throw new SourceExpansionContractError('JSONL_INVALID', 'text and validator required');
  }
  const records = text
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line, index) => {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new SourceExpansionContractError('JSONL_INVALID', `line ${index + 1}`);
      }
      return validator(parsed);
    });
  const identities = new Set();
  for (const record of records) {
    const identity = `${record.candidate_id}:${record.revision ?? 'base'}`;
    if (identities.has(identity)) {
      throw new SourceExpansionContractError('RECORD_DUPLICATE', identity);
    }
    identities.add(identity);
  }
  return Object.freeze(records);
}

export function validateDiscoveryRecord(record) {
  rejectUnknownKeys(record, DISCOVERY_KEYS, 'DISCOVERY_KEYS_INVALID');
  requireSchemaVersion(record.schema_version);
  const sourceId = requireLocalId(record.source_id, 'source_id');
  const assetId = requireLocalId(record.asset_id, 'asset_id');
  const candidateId = requireId(record.candidate_id, 'candidate_id');
  if (candidateId !== `${sourceId}:${assetId}`) {
    throw new SourceExpansionContractError('CANDIDATE_ID_MISMATCH', candidateId);
  }

  const dimensions = validateDimensions(record.public_dimensions);
  const signals = validateSignals(record.signals);
  const output = {
    schema_version: SOURCE_EXPANSION_SCHEMA_VERSION,
    candidate_id: candidateId,
    source_id: sourceId,
    asset_id: assetId,
    canonical_url: requireHttps(record.canonical_url, 'canonical_url'),
    preview_url: requireHttps(record.preview_url, 'preview_url'),
    author: requireNonEmptyString(record.author, 'author'),
    title: requireNonEmptyString(record.title, 'title'),
    observed_at: validateIsoDate(record.observed_at, 'observed_at'),
    published_at: record.published_at === null
      ? null
      : validateIsoDate(record.published_at, 'published_at'),
    claimed_format: requireNonEmptyString(record.claimed_format, 'claimed_format'),
    public_dimensions: dimensions,
    building_type: requireNonEmptyString(record.building_type, 'building_type'),
    style: requireNonEmptyString(record.style, 'style'),
    signals,
    oversized: dimensions !== null && DIMENSION_KEYS.some((axis) => dimensions[axis] > 64)
  };
  return deepFreeze(output);
}

export function validateRightsRecord(record) {
  rejectUnknownKeys(record, RIGHTS_KEYS, 'RIGHTS_KEYS_INVALID');
  requireSchemaVersion(record.schema_version);
  const urls = requireNonEmptyArray(record.authoritative_urls, 'authoritative_urls')
    .map((value, index) => requireHttps(value, `authoritative_urls[${index}]`));
  const authorChain = requireNonEmptyArray(record.author_chain, 'author_chain')
    .map((value, index) => requireNonEmptyString(value, `author_chain[${index}]`));
  rejectUnknownKeys(record.permissions, PERMISSION_KEYS, 'PERMISSIONS_KEYS_INVALID');
  const permissions = Object.fromEntries(
    PERMISSION_KEYS.map((key) => [key, requireBoolean(record.permissions[key], `permissions.${key}`)])
  );
  const conclusion = record.conclusion;
  if (!RIGHTS_CONCLUSIONS.includes(conclusion)) {
    throw new SourceExpansionContractError('CONCLUSION_INVALID', 'conclusion');
  }

  return deepFreeze({
    schema_version: SOURCE_EXPANSION_SCHEMA_VERSION,
    candidate_id: requireId(record.candidate_id, 'candidate_id'),
    revision: requirePositiveInteger(record.revision, 'revision', 'REVISION_INVALID'),
    observed_at: validateIsoDate(record.observed_at, 'observed_at'),
    reviewed_by: requireNonEmptyString(record.reviewed_by, 'reviewed_by'),
    scope: requireNonEmptyString(record.scope, 'scope'),
    authoritative_urls: urls,
    author_chain: authorChain,
    permissions,
    conditions: requireStringArray(record.conditions, 'conditions'),
    ai_ml_restriction: requireBoolean(record.ai_ml_restriction, 'ai_ml_restriction'),
    platform_conflict: requireBoolean(record.platform_conflict, 'platform_conflict'),
    upstream_conflict: requireBoolean(record.upstream_conflict, 'upstream_conflict'),
    conclusion,
    reason_codes: requireStringArray(record.reason_codes, 'reason_codes')
  });
}

export function validateReviewDecision(record) {
  rejectUnknownKeys(record, REVIEW_KEYS, 'REVIEW_KEYS_INVALID');
  requireSchemaVersion(record.schema_version);
  if (!REVIEW_WAVES.includes(record.wave)) {
    throw new SourceExpansionContractError('WAVE_INVALID', 'wave');
  }
  if (!REVIEW_DECISIONS.includes(record.decision)) {
    throw new SourceExpansionContractError('DECISION_INVALID', 'decision');
  }
  return deepFreeze({
    schema_version: SOURCE_EXPANSION_SCHEMA_VERSION,
    candidate_id: requireId(record.candidate_id, 'candidate_id'),
    wave: record.wave,
    revision: requirePositiveInteger(record.revision, 'revision', 'REVISION_INVALID'),
    decided_at: validateIsoDate(record.decided_at, 'decided_at'),
    decided_by: requireNonEmptyString(record.decided_by, 'decided_by'),
    decision: record.decision
  });
}

export function validateIsoDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new SourceExpansionContractError('DATE_INVALID', label);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new SourceExpansionContractError('DATE_INVALID', label);
  }
  return value;
}

function validateDimensions(value) {
  if (value === null) return null;
  rejectUnknownKeys(value, DIMENSION_KEYS, 'DIMENSIONS_KEYS_INVALID');
  return Object.fromEntries(
    DIMENSION_KEYS.map((axis) => [
      axis,
      requirePositiveInteger(value[axis], `public_dimensions.${axis}`, 'DIMENSION_INVALID')
    ])
  );
}

function validateSignals(value) {
  rejectUnknownKeys(value, SIGNAL_KEYS, 'SIGNALS_KEYS_INVALID');
  return {
    popularity: requireNonNegativeSignal(value.popularity, 'signals.popularity'),
    reception: requireNonNegativeSignal(value.reception, 'signals.reception'),
    preview_completeness: requireUnit(value.preview_completeness, 'signals.preview_completeness', { nullable: true }),
    building_completeness: requireUnit(value.building_completeness, 'signals.building_completeness', { nullable: true }),
    technical_compatibility: requireUnit(value.technical_compatibility, 'signals.technical_compatibility', { nullable: true }),
    scarcity: requireUnit(value.scarcity, 'signals.scarcity', { nullable: true }),
    duplicate_risk: requireUnit(value.duplicate_risk, 'signals.duplicate_risk', { nullable: true })
  };
}

function requireSchemaVersion(value) {
  if (value !== SOURCE_EXPANSION_SCHEMA_VERSION) {
    throw new SourceExpansionContractError('SCHEMA_VERSION_INVALID', 'schema_version');
  }
}

function requireId(value, label) {
  if (typeof value !== 'string' || !CANDIDATE_ID_PATTERN.test(value)) {
    throw new SourceExpansionContractError('ID_INVALID', label);
  }
  return value;
}

function requireLocalId(value, label) {
  if (typeof value !== 'string' || !LOCAL_ID_PATTERN.test(value)) {
    throw new SourceExpansionContractError('ID_INVALID', label);
  }
  return value;
}

function requireHttps(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new SourceExpansionContractError('URL_INVALID', label);
  }
  if (parsed.protocol !== 'https:') {
    throw new SourceExpansionContractError('URL_NOT_HTTPS', label);
  }
  return parsed.href;
}

function requireUnit(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new SourceExpansionContractError('SIGNAL_INVALID', label);
  }
  return value;
}

function requireNonNegativeSignal(value, label) {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new SourceExpansionContractError('SIGNAL_INVALID', label);
  }
  return value;
}

function requirePositiveInteger(value, label, code) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new SourceExpansionContractError(code, label);
  }
  return value;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SourceExpansionContractError('STRING_INVALID', label);
  }
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new SourceExpansionContractError('BOOLEAN_INVALID', label);
  }
  return value;
}

function requireNonEmptyArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new SourceExpansionContractError('ARRAY_INVALID', label);
  }
  return value;
}

function requireStringArray(value, label) {
  if (!Array.isArray(value)) {
    throw new SourceExpansionContractError('ARRAY_INVALID', label);
  }
  return value.map((entry, index) => requireNonEmptyString(entry, `${label}[${index}]`));
}

function rejectUnknownKeys(value, allowed, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SourceExpansionContractError(code, 'object required');
  }
  const keys = Object.keys(value);
  const unknown = keys.filter((key) => !allowed.includes(key)).sort();
  if (unknown.length > 0) {
    throw new SourceExpansionContractError(code, unknown.join(','));
  }
  const missing = allowed.filter((key) => !Object.hasOwn(value, key));
  if (missing.length > 0) {
    throw new SourceExpansionContractError(code, `missing:${missing.join(',')}`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
