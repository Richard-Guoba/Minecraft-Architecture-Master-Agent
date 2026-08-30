import { deepFreeze } from '../shadow/canonical.js';
import {
  P6_CAMERA_PROTOCOL,
  P6_CAMERA_VIEW_PURPOSES,
  P6_PROTOCOL_FILE_HASHES,
  P6_PROTOCOL_VERSION,
  P6_SCHEMA_VERSION,
  P6_VIEW_IDS,
  P6_VISUAL_SETTINGS
} from './constants.js';
import { p6Error } from './contracts.js';

const HASH = /^[a-f0-9]{64}$/u;
const PLAYER_EYE_HEIGHT = 1.62;
const SOLUTION_IDS = Object.freeze([
  'playbook-candidate-01',
  'playbook-candidate-02',
  'playbook-candidate-03',
  'baseline-current'
]);

export function decimal6(number) {
  if (!Number.isFinite(number)) invalid();
  const normalized = Object.is(number, -0) || Math.abs(number) < 0.0000005 ? 0 : number;
  return normalized.toFixed(6);
}

export function deriveSharedFraming({
  solutions,
  horizontalFovDegrees = P6_VISUAL_SETTINGS.horizontal_fov_degrees,
  aspect = P6_VISUAL_SETTINGS.aspect_ratio
} = {}) {
  if (!Array.isArray(solutions) || solutions.length !== 4) invalid();
  const fov = validFov(horizontalFovDegrees);
  const aspectNumber = parseAspect(aspect);
  const normalized = solutions.map((solution, index) => {
    if (!plain(solution) || solution.solution_id !== SOLUTION_IDS[index]) invalid();
    return {
      bounds: normalizeBounds(solution.bounds),
      mainEntry: normalizeEntry(solution.main_entry ?? solution.mainEntry, normalizeBounds(solution.bounds))
    };
  });
  const view_multipliers = Object.fromEntries(P6_VIEW_IDS.map(viewId => {
    let sharedMultiplier = 1;
    for (const solution of normalized) {
      const view = baseViews(solution.bounds, solution.mainEntry).find(item => item.view_id === viewId);
      sharedMultiplier = Math.max(sharedMultiplier, framingMultiplier({
        bounds: solution.bounds,
        view,
        horizontalFovDegrees: fov,
        aspect: aspectNumber
      }));
    }
    let roundedUp = Math.ceil((sharedMultiplier - Number.EPSILON) * 1_000_000) / 1_000_000;
    while (!normalized.every(solution => {
      const view = baseViews(solution.bounds, solution.mainEntry).find(item => item.view_id === viewId);
      return fitsPersisted(solution.bounds, view, roundedUp, fov, aspectNumber);
    })) roundedUp += 0.000001;
    return [viewId, decimal6(roundedUp)];
  }));
  return deepFreeze({
    horizontal_fov_degrees: fov,
    aspect_ratio: aspect,
    view_multipliers
  });
}

export function deriveFixedViewManifest({
  solutionId,
  blueprintSha256,
  buildFunctionSha256,
  bounds,
  mainEntry,
  sharedFraming
} = {}) {
  if (!SOLUTION_IDS.includes(solutionId)
    || typeof blueprintSha256 !== 'string' || !HASH.test(blueprintSha256)
    || typeof buildFunctionSha256 !== 'string' || !HASH.test(buildFunctionSha256)) invalid();
  const normalizedBounds = normalizeBounds(bounds);
  const normalizedEntry = normalizeEntry(mainEntry, normalizedBounds);
  const multipliers = normalizeFraming(sharedFraming);
  const views = baseViews(normalizedBounds, normalizedEntry).map(view => {
    const multiplier = multipliers[view.view_id];
    const position = scaledPosition(view, multiplier);
    const result = {
      view_id: view.view_id,
      purpose: P6_CAMERA_VIEW_PURPOSES[view.view_id],
      horizontal_fov_degrees: P6_VISUAL_SETTINGS.horizontal_fov_degrees,
      framing_multiplier: decimal6(multiplier),
      position: point6(position),
      target: point6(view.target)
    };
    if (view.view_id === 'entry-eye') result.entry_offset_blocks = P6_CAMERA_PROTOCOL.entry_eye_offset_blocks;
    return result;
  });
  return deepFreeze({
    schema_version: P6_SCHEMA_VERSION,
    protocol_version: P6_PROTOCOL_VERSION,
    solution_id: solutionId,
    blueprint_sha256: blueprintSha256,
    build_function_sha256: buildFunctionSha256,
    request_sha256: P6_PROTOCOL_FILE_HASHES['fixed-request.json'],
    settings_sha256: P6_PROTOCOL_FILE_HASHES['visual-settings.json'],
    bounds: {
      min_x: normalizedBounds.minX,
      min_y: normalizedBounds.minY,
      min_z: normalizedBounds.minZ,
      max_x: normalizedBounds.maxX,
      max_y: normalizedBounds.maxY,
      max_z: normalizedBounds.maxZ
    },
    main_entry: {
      center_x: decimal6(normalizedEntry.x),
      center_y: decimal6(normalizedEntry.y),
      center_z: decimal6(normalizedEntry.z),
      facing: 'south'
    },
    views
  });
}

function baseViews(bounds, entry) {
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  const depth = bounds.maxZ - bounds.minZ + 1;
  const radius = Math.max(width, depth);
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2
  };
  const eyeY = bounds.minY + Math.max(2, 0.45 * height);
  const far = Math.max(12, 1.35 * radius);
  return [
    view('front-south', { x: center.x, y: eyeY, z: bounds.maxZ + far }, { x: center.x, y: eyeY, z: center.z }),
    view('side-east', { x: bounds.maxX + far, y: eyeY, z: center.z }, { x: center.x, y: eyeY, z: center.z }),
    view('quarter-southeast', { x: bounds.maxX + 0.95 * radius, y: eyeY + 0.10 * height, z: bounds.maxZ + 0.95 * radius }, center),
    view('quarter-southwest', { x: bounds.minX - 0.95 * radius, y: eyeY + 0.10 * height, z: bounds.maxZ + 0.95 * radius }, center),
    view('roof-birdseye', { x: center.x, y: bounds.maxY + Math.max(16, 1.50 * radius), z: center.z }, center),
    view('entry-eye', { x: entry.x, y: entry.y + PLAYER_EYE_HEIGHT, z: entry.z + P6_CAMERA_PROTOCOL.entry_eye_offset_blocks }, { x: entry.x, y: entry.y, z: entry.z })
  ];
}

function framingMultiplier({ bounds, view, horizontalFovDegrees, aspect }) {
  if (fits(bounds, view, 1, horizontalFovDegrees, aspect)) return 1;
  let low = 1;
  let high = 2;
  while (!fits(bounds, view, high, horizontalFovDegrees, aspect)) {
    high *= 2;
    if (high > 1024) invalid();
  }
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const midpoint = (low + high) / 2;
    if (fits(bounds, view, midpoint, horizontalFovDegrees, aspect)) high = midpoint;
    else low = midpoint;
  }
  return high;
}

function fits(bounds, view, multiplier, horizontalFovDegrees, aspect) {
  const position = scaledPosition(view, multiplier);
  return fitsFromPosition(bounds, position, view.target, horizontalFovDegrees, aspect);
}

function fitsPersisted(bounds, view, multiplier, horizontalFovDegrees, aspect) {
  const position = numericPoint(point6(scaledPosition(view, multiplier)));
  const target = numericPoint(point6(view.target));
  return fitsFromPosition(bounds, position, target, horizontalFovDegrees, aspect);
}

function fitsFromPosition(bounds, position, target, horizontalFovDegrees, aspect) {
  const basis = cameraBasis(position, target);
  const horizontalTangent = Math.tan(horizontalFovDegrees * Math.PI / 360);
  const verticalTangent = horizontalTangent / aspect;
  for (const corner of boundsCorners(bounds)) {
    const relative = subtract(corner, position);
    const depth = dot(relative, basis.forward);
    if (depth <= 0) return false;
    if (Math.abs(dot(relative, basis.right) / depth) > horizontalTangent) return false;
    if (Math.abs(dot(relative, basis.up) / depth) > verticalTangent) return false;
  }
  return true;
}

function boundsCorners(bounds) {
  const xs = [bounds.minX - 0.5, bounds.maxX + 0.5];
  const ys = [bounds.minY - 0.5, bounds.maxY + 0.5];
  const zs = [bounds.minZ - 0.5, bounds.maxZ + 0.5];
  return xs.flatMap(x => ys.flatMap(y => zs.map(z => ({ x, y, z }))));
}

function cameraBasis(position, target) {
  const forward = normalize(subtract(target, position));
  const referenceUp = Math.abs(forward.y) > 0.999 ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 };
  const right = normalize(cross(forward, referenceUp));
  return { forward, right, up: normalize(cross(right, forward)) };
}

function normalizeFraming(sharedFraming) {
  if (sharedFraming === null || sharedFraming === undefined) {
    return Object.fromEntries(P6_VIEW_IDS.map(viewId => [viewId, 1]));
  }
  if (!plain(sharedFraming)
    || sharedFraming.horizontal_fov_degrees !== P6_VISUAL_SETTINGS.horizontal_fov_degrees
    || sharedFraming.aspect_ratio !== P6_VISUAL_SETTINGS.aspect_ratio
    || !plain(sharedFraming.view_multipliers)
    || Object.keys(sharedFraming.view_multipliers).length !== P6_VIEW_IDS.length) invalid();
  return Object.fromEntries(P6_VIEW_IDS.map(viewId => {
    const value = sharedFraming.view_multipliers[viewId];
    if (typeof value !== 'string' || !/^(?:[1-9]\d*)\.\d{6}$/u.test(value) || Number(value) < 1) invalid();
    return [viewId, Number(value)];
  }));
}

function normalizeBounds(bounds) {
  if (!plain(bounds)) invalid();
  const aliases = [
    ['minX', 'min_x'], ['minY', 'min_y'], ['minZ', 'min_z'],
    ['maxX', 'max_x'], ['maxY', 'max_y'], ['maxZ', 'max_z']
  ];
  const result = {};
  for (const [canonical, snake] of aliases) {
    const value = bounds[canonical] ?? bounds[snake];
    if (!Number.isInteger(value)) invalid();
    result[canonical] = value;
  }
  if (result.minX > result.maxX || result.minY > result.maxY || result.minZ > result.maxZ) invalid();
  return result;
}

function normalizeEntry(entry, bounds) {
  if (!plain(entry)) invalid();
  const result = {
    x: entry.x ?? entry.center_x,
    y: entry.y ?? entry.center_y,
    z: entry.z ?? entry.center_z,
    facing: entry.facing ?? entry.side
  };
  if (![result.x, result.y, result.z].every(Number.isFinite) || result.facing !== 'south') invalid();
  if (result.x < bounds.minX || result.x > bounds.maxX
    || result.y < bounds.minY || result.y > bounds.maxY
    || result.z !== bounds.maxZ) invalid();
  return result;
}

function parseAspect(aspect) {
  if (aspect !== '16:9') invalid();
  return 16 / 9;
}

function validFov(value) {
  if (!Number.isFinite(value) || value !== P6_VISUAL_SETTINGS.horizontal_fov_degrees) invalid();
  return value;
}

function point6(point) {
  return { x: decimal6(point.x), y: decimal6(point.y), z: decimal6(point.z) };
}

function scaleFromTarget(position, target, multiplier) {
  return {
    x: target.x + (position.x - target.x) * multiplier,
    y: target.y + (position.y - target.y) * multiplier,
    z: target.z + (position.z - target.z) * multiplier
  };
}

function scaledPosition(view, multiplier) {
  if (view.view_id !== 'entry-eye') return scaleFromTarget(view.position, view.target, multiplier);
  return {
    x: view.position.x,
    y: view.position.y,
    z: view.target.z + (view.position.z - view.target.z) * multiplier
  };
}

function numericPoint(point) { return { x: Number(point.x), y: Number(point.y), z: Number(point.z) }; }

function view(view_id, position, target) { return { view_id, position, target }; }
function subtract(left, right) { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function dot(left, right) { return left.x * right.x + left.y * right.y + left.z * right.z; }
function cross(left, right) { return { x: left.y * right.z - left.z * right.y, y: left.z * right.x - left.x * right.z, z: left.x * right.y - left.y * right.x }; }
function normalize(vector) { const length = Math.hypot(vector.x, vector.y, vector.z); if (!(length > 0)) invalid(); return { x: vector.x / length, y: vector.y / length, z: vector.z / length }; }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function invalid() { throw p6Error('P6_CAMERA_PROTOCOL_INVALID'); }
