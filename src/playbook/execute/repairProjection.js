import { executeError } from './contracts.js';
import { sha256, stableJson } from '../shadow/canonical.js';

const MAX_SCALE_PRECISION = 6;
const ID = /^[a-z0-9][a-z0-9_-]{0,127}$/u;
const STRUCTURE_SOURCES = Object.freeze([
  Object.freeze({ kind: 'upper', path: 'roof_frame.strategy' }),
  Object.freeze({ kind: 'frame', path: 'system' }),
  Object.freeze({ kind: 'base', path: 'foundation.strategy' })
]);

export function projectMassingPayload(payload) {
  assertPlainData(payload);
  if (!plain(payload) || !Array.isArray(payload.volumes) || payload.volumes.length !== 3) invalid();
  const precision = payload.volumes.flatMap((volume) => volume?.scale || []).reduce((maximum, value) => Math.max(maximum, decimalPrecision(value)), 0);
  if (precision > MAX_SCALE_PRECISION) invalid();
  const factor = 10 ** precision;
  const ids = new Set();
  const volumes = payload.volumes.map((volume) => {
    if (!plain(volume) || typeof volume.id !== 'string' || !ID.test(volume.id) || ids.has(volume.id)
      || volume.shape !== 'box' || !Array.isArray(volume.scale) || volume.scale.length !== 3
      || !plain(volume.placement) || typeof volume.placement.relation !== 'string') invalid();
    const placementKeys = Object.keys(volume.placement);
    if (placementKeys.some((key) => !['relation', 'attach_to'].includes(key))
      || volume.placement.attach_to !== undefined && (typeof volume.placement.attach_to !== 'string' || !ID.test(volume.placement.attach_to))) invalid();
    ids.add(volume.id);
    const scaleUnits = volume.scale.map((value) => toUnits(value, precision));
    if (scaleUnits.some((value) => !Number.isSafeInteger(value) || value <= 0)) invalid();
    const role = semanticRole(volume);
    return Object.freeze({ source: volume, id: volume.id, role, scale_units: Object.freeze(scaleUnits), placement: volume.placement });
  });
  return Object.freeze({ payload, precision, factor, volumes: Object.freeze(volumes) });
}

export function massingPreconditions(projection) {
  return projection.volumes.map((volume) => ({
    kind: 'volume', id: volume.id,
    sha256: sha256(stableJson({ id: volume.id, role: volume.role, scale_units: volume.scale_units, placement: volume.placement }))
  }));
}

export function projectStructurePayload(payload) {
  assertPlainData(payload);
  if (!plain(payload)) invalid();
  const anchors = STRUCTURE_SOURCES.map(({ kind, path }) => {
    const [outer, inner] = path.split('.');
    const container = inner ? ownData(payload, outer) : payload;
    if (inner && !plain(container)) invalid();
    const value = inner ? ownData(container, inner) : ownData(payload, outer);
    if (typeof value !== 'string' || value.length === 0 || value.length > 128 || !ID.test(value)) invalid();
    return Object.freeze({ kind, path, value, sha256: sha256(stableJson({ path, value })) });
  });
  if (new Set(anchors.map((anchor) => anchor.value)).size !== anchors.length) invalid();
  return Object.freeze({ payload, anchors: Object.freeze(anchors) });
}

export function structurePreconditions(projection) {
  return projection.anchors.map((anchor) => ({ kind: 'structural-anchor', id: anchor.value, sha256: anchor.sha256 }));
}

export function applySemanticRole(volume, role) {
  volume.role = role;
  const tags = Array.isArray(volume.tags) ? volume.tags.filter((tag) => tag !== 'primary-mass' && tag !== 'secondary-mass') : [];
  tags.push(role === 'primary-mass' ? 'primary-mass' : 'secondary-mass');
  volume.tags = tags;
  if (role === 'primary-mass') volume.purpose = 'main-building-envelope';
  else if (volume.purpose === 'main-building-envelope') delete volume.purpose;
}

export function unitsToScale(units, precision) {
  if (!Number.isSafeInteger(units) || units <= 0 || !Number.isInteger(precision) || precision < 0 || precision > MAX_SCALE_PRECISION) invalid();
  return units / (10 ** precision);
}

export function canonicalClone(value) {
  assertPlainData(value);
  return structuredClone(value);
}

function semanticRole(volume) {
  if (volume.role === 'primary-mass' || volume.purpose === 'main-building-envelope' || Array.isArray(volume.tags) && volume.tags.includes('primary-mass')) return 'primary-mass';
  if (volume.role === 'secondary-mass' || Array.isArray(volume.tags) && volume.tags.includes('secondary-mass')) return 'secondary-mass';
  return 'support-volume';
}

function decimalPrecision(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) invalid();
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/u.exec(String(value));
  if (!match) invalid();
  return Math.max(0, (match[2]?.length || 0) - Number(match[3] || 0));
}

function toUnits(value, precision) {
  const text = String(value);
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/u.exec(text);
  if (!match) invalid();
  const fractional = match[2] || '';
  const exponent = Number(match[3] || 0);
  const digits = BigInt(`${match[1]}${fractional}`);
  const power = precision + exponent - fractional.length;
  if (power < 0) invalid();
  const units = digits * (10n ** BigInt(power));
  if (units > BigInt(Number.MAX_SAFE_INTEGER)) invalid();
  return Number(units);
}

function ownData(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
  return descriptor.value;
}

function assertPlainData(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) invalid(); return; }
  if (!value || typeof value !== 'object' || ancestors.has(value) || Object.getOwnPropertySymbols(value).length) invalid();
  ancestors.add(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertyNames(value).length !== value.length + 1) invalid();
    for (let index = 0; index < value.length; index += 1) assertPlainData(ownData(value, String(index)), ancestors);
  } else {
    if (!plain(value) || Object.getOwnPropertyNames(value).length !== Object.keys(value).length) invalid();
    for (const key of Object.keys(value)) assertPlainData(ownData(value, key), ancestors);
  }
  ancestors.delete(value);
}

function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function invalid() { throw executeError('P5_REPAIR_INVALID'); }
