import { createHash } from 'node:crypto';
import {
  CANDIDATE_ID_PATTERN,
  LOCAL_ID_PATTERN
} from './stage7SourceExpansionContracts.js';
import { READINESS_TERMINAL_STATES } from './stage7CandidateReadinessState.js';

export const PILOT_BATCH_SCHEMA_VERSION = 1;

const DOCUMENT_KEYS = Object.freeze(['schema_version', 'batch', 'batch_sha256', 'approval']);
const BATCH_KEYS = Object.freeze(['batch_id', 'as_of', 'code_revision', 'candidates']);
const APPROVAL_KEYS = Object.freeze([
  'approved_batch_sha256', 'approved_at', 'approved_by',
  'authorizes_acquisition', 'authorizes_training', 'authorizes_dataset_admission'
]);
const CANDIDATE_KEYS = Object.freeze([
  'candidate_id', 'role', 'reserve_for', 'source_id', 'source_group',
  'asset_family', 'immutable_revision', 'relative_nbt_path',
  'canonical_file_url', 'approved_redirect_urls', 'primary_function',
  'building_type', 'style_family', 'environment', 'admission_state',
  'admission_evidence_sha256', 'rights', 'quality', 'technical', 'scores'
]);
const RIGHTS_KEYS = Object.freeze([
  'license_id', 'evidence_url', 'scope', 'verified_at', 'evidence_sha256',
  'permissions', 'ai_ml_restriction', 'platform_conflict', 'upstream_conflict'
]);
const PERMISSION_KEYS = Object.freeze([
  'download', 'copy', 'transform', 'training', 'local_retention'
]);
const QUALITY_KEYS = Object.freeze([
  'preview_urls', 'popularity', 'reception', 'maintenance', 'owner_quality_decision'
]);
const TECHNICAL_KEYS = Object.freeze([
  'claimed_format', 'standalone_evidence', 'vanilla_compatible_expected',
  'external_dependency_expected', 'jigsaw_expected'
]);
const SCORE_KEYS = Object.freeze([
  'parser_reliability', 'quality', 'diversity', 'source_stability', 'total'
]);
const LABEL_PATTERN = /^[a-z0-9][a-z0-9_]{0,63}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const REVISION_PATTERN = /^[a-f0-9]{40}$/u;
const MAINTENANCE = new Set(['active', 'stable', 'archived']);

export class PilotContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'PilotContractError';
    this.code = code;
  }
}

export function canonicalPilotJson(value) {
  return `${JSON.stringify(sortKeys(value))}\n`;
}

export function hashPilotValue(value) {
  return createHash('sha256').update(canonicalPilotJson(value)).digest('hex');
}

export function validatePilotBatchDocument(document) {
  exactObject(document, DOCUMENT_KEYS, 'PILOT_DOCUMENT_INVALID');
  if (document.schema_version !== PILOT_BATCH_SCHEMA_VERSION) {
    fail('PILOT_DOCUMENT_INVALID', 'schema_version');
  }
  exactObject(document.batch, BATCH_KEYS, 'PILOT_DOCUMENT_INVALID');
  exactObject(document.approval, APPROVAL_KEYS, 'PILOT_APPROVAL_INVALID');
  const batch = document.batch;
  if (!LOCAL_ID_PATTERN.test(batch.batch_id || '')) {
    fail('PILOT_DOCUMENT_INVALID', 'batch_id');
  }
  requireDate(batch.as_of, 'PILOT_DOCUMENT_INVALID', 'as_of');
  if (!REVISION_PATTERN.test(batch.code_revision || '')) {
    fail('PILOT_DOCUMENT_INVALID', 'code_revision');
  }
  if (!Array.isArray(batch.candidates)) {
    fail('PILOT_DOCUMENT_INVALID', 'candidates');
  }
  rejectRawDuplicates(batch.candidates);
  const candidates = batch.candidates.map((candidate) => validateCandidate(candidate, batch.as_of));
  validateComposition(candidates);

  const expectedBatchHash = hashPilotValue(batch);
  if (document.batch_sha256 !== expectedBatchHash) {
    fail('PILOT_BATCH_HASH_INVALID', 'batch_sha256');
  }
  const approval = document.approval;
  requireTimestamp(approval.approved_at, 'PILOT_APPROVAL_INVALID', 'approved_at');
  requireNonEmpty(approval.approved_by, 'PILOT_APPROVAL_INVALID', 'approved_by');
  if (approval.approved_batch_sha256 !== expectedBatchHash
    || approval.authorizes_acquisition !== true
    || approval.authorizes_training !== false
    || approval.authorizes_dataset_admission !== false) {
    fail('PILOT_APPROVAL_INVALID', 'authority');
  }
  return deepFreeze(structuredClone(document));
}

export function selectPilotCandidate(document, candidateId) {
  const validated = validatePilotBatchDocument(document);
  const candidate = validated.batch.candidates.find((item) => item.candidate_id === candidateId);
  if (!candidate) fail('PILOT_CANDIDATE_NOT_APPROVED', String(candidateId));
  return candidate;
}

export function reserveEligible(document, reserveId, readinessRecords) {
  const reserve = selectPilotCandidate(document, reserveId);
  if (reserve.role !== 'reserve' || !Array.isArray(readinessRecords)) {
    fail('PILOT_RESERVE_NOT_ELIGIBLE', reserveId);
  }
  const primaryStates = readinessRecords.filter(
    (record) => record?.candidate_id === reserve.reserve_for
  );
  const reserveStates = readinessRecords.filter(
    (record) => record?.candidate_id === reserve.candidate_id
  );
  const primary = primaryStates.length === 1 ? primaryStates[0] : null;
  if (!primary || primary.terminal !== true
    || !READINESS_TERMINAL_STATES.includes(primary.state)
    || reserveStates.length !== 0) {
    fail('PILOT_RESERVE_NOT_ELIGIBLE', reserveId);
  }
  return true;
}

function validateCandidate(candidate, asOf) {
  exactObject(candidate, CANDIDATE_KEYS, 'PILOT_CANDIDATE_INVALID');
  if (!CANDIDATE_ID_PATTERN.test(candidate.candidate_id || '')
    || !LOCAL_ID_PATTERN.test(candidate.source_id || '')
    || !candidate.candidate_id.startsWith(`${candidate.source_id}:`)
    || !LOCAL_ID_PATTERN.test(candidate.source_group || '')
    || !LOCAL_ID_PATTERN.test(candidate.asset_family || '')
    || !['primary', 'reserve'].includes(candidate.role)
    || (candidate.role === 'primary' && candidate.reserve_for !== null)
    || (candidate.role === 'reserve'
      && !CANDIDATE_ID_PATTERN.test(candidate.reserve_for || ''))
    || !REVISION_PATTERN.test(candidate.immutable_revision || '')
    || !validRelativeNbtPath(candidate.relative_nbt_path)
    || candidate.admission_state !== 'admission_contract_ready'
    || !SHA256_PATTERN.test(candidate.admission_evidence_sha256 || '')) {
    fail('PILOT_CANDIDATE_INVALID', candidate.candidate_id || 'unknown');
  }
  for (const key of ['primary_function', 'building_type', 'style_family', 'environment']) {
    if (!LABEL_PATTERN.test(candidate[key] || '')) {
      fail('PILOT_CANDIDATE_INVALID', `${candidate.candidate_id}:${key}`);
    }
  }
  const fileUrl = requireHttps(candidate.canonical_file_url,
    'PILOT_CANDIDATE_INVALID', candidate.candidate_id);
  if (!fileUrl.pathname.includes(`/${candidate.immutable_revision}/`)
    || !decodedPath(fileUrl.pathname).endsWith(`/${candidate.relative_nbt_path}`)) {
    fail('PILOT_CANDIDATE_INVALID', `${candidate.candidate_id}:canonical_file_url`);
  }
  if (!Array.isArray(candidate.approved_redirect_urls)
    || new Set(candidate.approved_redirect_urls).size !== candidate.approved_redirect_urls.length) {
    fail('PILOT_CANDIDATE_INVALID', `${candidate.candidate_id}:redirects`);
  }
  for (const redirect of candidate.approved_redirect_urls) {
    requireHttps(redirect, 'PILOT_CANDIDATE_INVALID', candidate.candidate_id);
    if (redirect === candidate.canonical_file_url) {
      fail('PILOT_CANDIDATE_INVALID', `${candidate.candidate_id}:redirects`);
    }
  }
  validateRights(candidate.rights, asOf, candidate.candidate_id);
  validateQuality(candidate.quality, candidate.candidate_id);
  validateTechnical(candidate.technical, candidate.candidate_id);
  validateScores(candidate.scores, candidate.candidate_id);
  return candidate;
}

function validateRights(rights, asOf, candidateId) {
  exactObject(rights, RIGHTS_KEYS, 'PILOT_RIGHTS_INVALID');
  exactObject(rights.permissions, PERMISSION_KEYS, 'PILOT_RIGHTS_INVALID');
  requireNonEmpty(rights.license_id, 'PILOT_RIGHTS_INVALID', candidateId);
  requireHttps(rights.evidence_url, 'PILOT_RIGHTS_INVALID', candidateId);
  requireNonEmpty(rights.scope, 'PILOT_RIGHTS_INVALID', candidateId);
  requireDate(rights.verified_at, 'PILOT_RIGHTS_INVALID', candidateId);
  if (rights.verified_at !== asOf
    || !SHA256_PATTERN.test(rights.evidence_sha256 || '')
    || !PERMISSION_KEYS.every((key) => rights.permissions[key] === true)
    || rights.ai_ml_restriction !== false
    || rights.platform_conflict !== false
    || rights.upstream_conflict !== false) {
    fail('PILOT_RIGHTS_INVALID', candidateId);
  }
}

function validateQuality(quality, candidateId) {
  exactObject(quality, QUALITY_KEYS, 'PILOT_CANDIDATE_INVALID');
  if (!Array.isArray(quality.preview_urls) || quality.preview_urls.length === 0
    || new Set(quality.preview_urls).size !== quality.preview_urls.length
    || !finiteNonNegative(quality.popularity)
    || !finiteNonNegative(quality.reception)
    || !MAINTENANCE.has(quality.maintenance)
    || quality.owner_quality_decision !== 'accept') {
    fail('PILOT_CANDIDATE_INVALID', `${candidateId}:quality`);
  }
  quality.preview_urls.forEach((url) =>
    requireHttps(url, 'PILOT_CANDIDATE_INVALID', candidateId));
}

function validateTechnical(technical, candidateId) {
  exactObject(technical, TECHNICAL_KEYS, 'PILOT_CANDIDATE_INVALID');
  if (technical.claimed_format !== 'minecraft_java_structure_nbt'
    || typeof technical.standalone_evidence !== 'string'
    || technical.standalone_evidence.trim().length === 0
    || technical.vanilla_compatible_expected !== true
    || technical.external_dependency_expected !== false
    || technical.jigsaw_expected !== false) {
    fail('PILOT_CANDIDATE_INVALID', `${candidateId}:technical`);
  }
}

function validateScores(scores, candidateId) {
  exactObject(scores, SCORE_KEYS, 'PILOT_SCORE_INVALID');
  if (!SCORE_KEYS.every((key) => Number.isFinite(scores[key])
    && scores[key] >= 0 && scores[key] <= 1)) {
    fail('PILOT_SCORE_INVALID', candidateId);
  }
  const expected = 0.45 * scores.parser_reliability
    + 0.30 * scores.quality
    + 0.15 * scores.diversity
    + 0.10 * scores.source_stability;
  if (Math.abs(scores.total - expected) > 1e-12) {
    fail('PILOT_SCORE_INVALID', candidateId);
  }
}

function validateComposition(candidates) {
  const primaries = candidates.filter((candidate) => candidate.role === 'primary');
  const reserves = candidates.filter((candidate) => candidate.role === 'reserve');
  if (primaries.length !== 5 || reserves.length !== 3) {
    fail('PILOT_RESERVE_INVALID', 'cardinality');
  }
  const primaryById = new Map(primaries.map((candidate) => [candidate.candidate_id, candidate]));
  const bound = new Set();
  for (const reserve of reserves) {
    const primary = primaryById.get(reserve.reserve_for);
    if (!primary || bound.has(reserve.reserve_for)
      || reserve.building_type !== primary.building_type
      || reserve.primary_function !== primary.primary_function) {
      fail('PILOT_RESERVE_INVALID', reserve.candidate_id);
    }
    bound.add(reserve.reserve_for);
  }
  if (new Set(primaries.map((candidate) => candidate.source_group)).size < 4
    || new Set(primaries.map((candidate) => candidate.building_type)).size < 4
    || maximumCount(primaries, 'source_group') > 2
    || maximumCount(primaries, 'building_type') > 2) {
    fail('PILOT_DIVERSITY_INVALID', 'primaries');
  }
}

function rejectRawDuplicates(candidates) {
  if (!Array.isArray(candidates)) fail('PILOT_DOCUMENT_INVALID', 'candidates');
  const identities = [
    candidates.map((candidate) => candidate?.candidate_id),
    candidates.map((candidate) => candidate?.canonical_file_url),
    candidates.map((candidate) => `${candidate?.source_id}:${candidate?.relative_nbt_path}`)
  ];
  if (identities.some((values) => new Set(values).size !== values.length)) {
    fail('PILOT_CANDIDATE_DUPLICATE', 'identity');
  }
}

function maximumCount(records, key) {
  const counts = new Map();
  records.forEach((record) => counts.set(record[key], (counts.get(record[key]) || 0) + 1));
  return Math.max(...counts.values());
}

function validRelativeNbtPath(value) {
  if (typeof value !== 'string' || value !== value.toLowerCase()
    || value.includes('\\') || value.startsWith('/') || !value.endsWith('.nbt')) return false;
  const segments = value.split('/');
  return segments.length > 1
    && segments.every((segment) => segment.length > 0 && !['.', '..'].includes(segment));
}

function requireHttps(value, code, detail) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(code, detail);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) fail(code, detail);
  return url;
}

function decodedPath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function requireDate(value, code, detail) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)
    || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    fail(code, detail);
  }
}

function requireTimestamp(value, code, detail) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value) fail(code, detail);
}

function requireNonEmpty(value, code, detail) {
  if (typeof value !== 'string' || value.trim().length === 0) fail(code, detail);
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function exactObject(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, 'object');
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code, actual.join(','));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort()
      .map((key) => [key, sortKeys(value[key])]));
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function fail(code, detail) {
  throw new PilotContractError(code, detail);
}
