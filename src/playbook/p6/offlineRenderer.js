import { deepFreeze, sha256 } from '../shadow/canonical.js';
import { P6_VIEW_IDS, P6_VISUAL_SETTINGS } from './constants.js';
import { p6Error } from './contracts.js';
import { encodeRgbaPng } from './png.js';

export const P6_REFERENCE_PALETTE = deepFreeze({
  background: [210, 225, 232, 255],
  stone: [126, 126, 118, 255],
  timber: [104, 70, 43, 255],
  roof: [73, 47, 48, 255],
  glass: [116, 181, 196, 255],
  foliage: [86, 125, 65, 255],
  water: [70, 124, 168, 255],
  accent: [181, 146, 72, 255],
  neutral: [154, 139, 119, 255]
});

const MAX_VOXELS = 2_000_000;
const FACE_DEFINITIONS = Object.freeze([
  face(1, 0, 0, 0.82, [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]),
  face(-1, 0, 0, 0.74, [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]),
  face(0, 1, 0, 1, [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]),
  face(0, -1, 0, 0.60, [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]]),
  face(0, 0, 1, 0.90, [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]]),
  face(0, 0, -1, 0.68, [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]])
]);

export function renderReferenceView({
  blueprint,
  operations,
  camera,
  settings,
  palette = P6_REFERENCE_PALETTE
} = {}) {
  const viewport = validateSettings(settings);
  const bounds = normalizeBounds(blueprint?.bounds);
  const colors = validatePalette(palette);
  const cameraState = normalizeCamera(camera, viewport.width, viewport.height);
  const voxels = buildVoxels(operations, bounds, colors);
  if (voxels.size === 0) failed();

  let rgba = Buffer.alloc(viewport.width * viewport.height * 4);
  rgba.fill(Buffer.from(colors.background));
  let depth = new Float64Array(viewport.width * viewport.height);
  depth.fill(Infinity);
  const ordered = [...voxels.values()].sort(compareVoxel);
  for (const voxel of ordered) {
    for (const definition of FACE_DEFINITIONS) {
      if (voxels.has(key(voxel.x + definition.normal.x, voxel.y + definition.normal.y, voxel.z + definition.normal.z))) continue;
      if (dot(definition.normal, subtract(cameraState.position, voxel)) <= 0) continue;
      const projected = definition.corners.map(corner => project({
        x: voxel.x + corner[0] - 0.5,
        y: voxel.y + corner[1] - 0.5,
        z: voxel.z + corner[2] - 0.5
      }, cameraState));
      const color = shade(voxel.color, definition.shade);
      rasterize(projected[0], projected[1], projected[2], color, rgba, depth, viewport.width, viewport.height);
      rasterize(projected[0], projected[2], projected[3], color, rgba, depth, viewport.width, viewport.height);
    }
  }
  const png = encodeRgbaPng({ width: viewport.width, height: viewport.height, rgba });
  rgba = null;
  depth = null;
  return png;
}

export function renderReferenceViews({ solution, cameraManifest, settings } = {}) {
  if (!plain(solution) || typeof solution.solution_id !== 'string'
    || !plain(cameraManifest) || cameraManifest.solution_id !== solution.solution_id
    || !Array.isArray(cameraManifest.views) || cameraManifest.views.length !== P6_VIEW_IDS.length) failed();
  const blueprint = solution.blueprint;
  const operations = solution.operations ?? blueprint?.operations;
  return cameraManifest.views.map((camera, index) => {
    if (camera.view_id !== P6_VIEW_IDS[index]) failed();
    const bytes = renderReferenceView({ blueprint, operations, camera, settings });
    return {
      view_id: camera.view_id,
      filename: `${solution.solution_id}-${camera.view_id}-reference.png`,
      bytes,
      sha256: sha256(bytes),
      width: settings.width_px,
      height: settings.height_px
    };
  });
}

function buildVoxels(operations, bounds, palette) {
  if (!Array.isArray(operations) || operations.length === 0) failed();
  const volume = (bounds.maxX - bounds.minX + 1)
    * (bounds.maxY - bounds.minY + 1)
    * (bounds.maxZ - bounds.minZ + 1);
  if (!Number.isSafeInteger(volume) || volume > MAX_VOXELS) failed();
  const voxels = new Map();
  for (const operation of operations) {
    if (!plain(operation) || typeof operation.block !== 'string' || operation.block.length === 0) failed();
    const cuboid = operationCuboid(operation);
    if (cuboid.minX < bounds.minX || cuboid.maxX > bounds.maxX
      || cuboid.minY < bounds.minY || cuboid.maxY > bounds.maxY
      || cuboid.minZ < bounds.minZ || cuboid.maxZ > bounds.maxZ) failed();
    const role = operation.block === 'minecraft:air' ? null : materialRole(operation, palette);
    for (let x = cuboid.minX; x <= cuboid.maxX; x += 1) {
      for (let y = cuboid.minY; y <= cuboid.maxY; y += 1) {
        for (let z = cuboid.minZ; z <= cuboid.maxZ; z += 1) {
          const pointKey = key(x, y, z);
          if (role === null) voxels.delete(pointKey);
          else voxels.set(pointKey, { x, y, z, color: palette[role] });
        }
      }
    }
  }
  return voxels;
}

function operationCuboid(operation) {
  let from;
  let to;
  if (operation.kind === 'fill') {
    from = operation.from;
    to = operation.to;
  } else if (operation.kind === 'setblock') {
    from = operation.at;
    to = operation.at;
  } else failed();
  if (!pointOfIntegers(from) || !pointOfIntegers(to)) failed();
  return {
    minX: Math.min(from.x, to.x), maxX: Math.max(from.x, to.x),
    minY: Math.min(from.y, to.y), maxY: Math.max(from.y, to.y),
    minZ: Math.min(from.z, to.z), maxZ: Math.max(from.z, to.z)
  };
}

function materialRole(operation, palette) {
  if (operation.material_role !== undefined) {
    if (typeof operation.material_role !== 'string' || operation.material_role === 'background'
      || !Object.hasOwn(palette, operation.material_role)) failed();
    return operation.material_role;
  }
  const block = operation.block.toLowerCase();
  if (/glass|ice/u.test(block)) return 'glass';
  if (/water/u.test(block)) return 'water';
  if (/leaves|grass|moss|fern|vine|azalea|flower|sapling|bush/u.test(block)) return 'foliage';
  if (/stairs|slab|tile|shingle/u.test(block)) return 'roof';
  if (/gold|copper|lantern|light|glow|sea_lantern|amethyst/u.test(block)) return 'accent';
  if (/log|wood|plank|stem|hyphae|fence|barrel/u.test(block)) return 'timber';
  if (/stone|brick|cobble|deepslate|andesite|diorite|granite|quartz|terracotta|concrete/u.test(block)) return 'stone';
  return 'neutral';
}

function normalizeCamera(camera, width, height) {
  if (!plain(camera) || !P6_VIEW_IDS.includes(camera.view_id)
    || camera.horizontal_fov_degrees !== P6_VISUAL_SETTINGS.horizontal_fov_degrees) failed();
  const position = numericPoint(camera.position);
  const target = numericPoint(camera.target);
  const forward = normalize(subtract(target, position));
  const referenceUp = Math.abs(forward.y) > 0.999 ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 };
  const right = normalize(cross(forward, referenceUp));
  const up = normalize(cross(right, forward));
  const focal = width / (2 * Math.tan(camera.horizontal_fov_degrees * Math.PI / 360));
  return { position, forward, right, up, focal, centerX: width / 2, centerY: height / 2 };
}

function project(point, camera) {
  const relative = subtract(point, camera.position);
  const z = dot(relative, camera.forward);
  if (!(z > 0.000001)) return null;
  return {
    x: camera.centerX + dot(relative, camera.right) * camera.focal / z,
    y: camera.centerY - dot(relative, camera.up) * camera.focal / z,
    z
  };
}

function rasterize(a, b, c, color, rgba, depth, width, height) {
  if (!a || !b || !c) return;
  const area = edge(a, b, c.x, c.y);
  if (Math.abs(area) < 1e-12) return;
  const minX = Math.max(0, Math.ceil(Math.min(a.x, b.x, c.x) - 0.5));
  const maxX = Math.min(width - 1, Math.floor(Math.max(a.x, b.x, c.x) - 0.5));
  const minY = Math.max(0, Math.ceil(Math.min(a.y, b.y, c.y) - 0.5));
  const maxY = Math.min(height - 1, Math.floor(Math.max(a.y, b.y, c.y) - 0.5));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = edge(b, c, px, py) / area;
      const w1 = edge(c, a, px, py) / area;
      const w2 = edge(a, b, px, py) / area;
      if (w0 < -1e-12 || w1 < -1e-12 || w2 < -1e-12) continue;
      const inverseDepth = w0 / a.z + w1 / b.z + w2 / c.z;
      if (!(inverseDepth > 0)) continue;
      const candidateDepth = 1 / inverseDepth;
      const pixelIndex = y * width + x;
      if (candidateDepth >= depth[pixelIndex] - 1e-9) continue;
      depth[pixelIndex] = candidateDepth;
      const byteIndex = pixelIndex * 4;
      rgba[byteIndex] = color[0];
      rgba[byteIndex + 1] = color[1];
      rgba[byteIndex + 2] = color[2];
      rgba[byteIndex + 3] = color[3];
    }
  }
}

function validateSettings(settings) {
  if (!plain(settings) || settings.width_px !== P6_VISUAL_SETTINGS.width_px
    || settings.height_px !== P6_VISUAL_SETTINGS.height_px
    || settings.aspect_ratio !== P6_VISUAL_SETTINGS.aspect_ratio
    || settings.horizontal_fov_degrees !== P6_VISUAL_SETTINGS.horizontal_fov_degrees) failed();
  return { width: settings.width_px, height: settings.height_px };
}

function validatePalette(palette) {
  if (!plain(palette)) failed();
  const required = Object.keys(P6_REFERENCE_PALETTE);
  if (Object.keys(palette).length !== required.length) failed();
  for (const role of required) {
    const color = palette[role];
    if (!Array.isArray(color) || color.length !== 4
      || color.some(component => !Number.isInteger(component) || component < 0 || component > 255)) failed();
  }
  return palette;
}

function normalizeBounds(bounds) {
  if (!plain(bounds)) failed();
  const result = {
    minX: bounds.min_x ?? bounds.minX,
    minY: bounds.min_y ?? bounds.minY,
    minZ: bounds.min_z ?? bounds.minZ,
    maxX: bounds.max_x ?? bounds.maxX,
    maxY: bounds.max_y ?? bounds.maxY,
    maxZ: bounds.max_z ?? bounds.maxZ
  };
  if (!Object.values(result).every(Number.isInteger)
    || result.minX > result.maxX || result.minY > result.maxY || result.minZ > result.maxZ) failed();
  return result;
}

function numericPoint(point) {
  if (!plain(point)) failed();
  const result = { x: Number(point.x), y: Number(point.y), z: Number(point.z) };
  if (!Object.values(result).every(Number.isFinite)) failed();
  return result;
}

function shade(color, factor) {
  return color.map((component, index) => index === 3 ? component : Math.round(component * factor));
}

function face(x, y, z, shadeFactor, corners) { return Object.freeze({ normal: Object.freeze({ x, y, z }), shade: shadeFactor, corners: Object.freeze(corners) }); }
function compareVoxel(left, right) { return left.x - right.x || left.y - right.y || left.z - right.z; }
function pointOfIntegers(value) { return plain(value) && Number.isInteger(value.x) && Number.isInteger(value.y) && Number.isInteger(value.z); }
function key(x, y, z) { return `${x},${y},${z}`; }
function edge(a, b, x, y) { return (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x); }
function subtract(left, right) { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function dot(left, right) { return left.x * right.x + left.y * right.y + left.z * right.z; }
function cross(left, right) { return { x: left.y * right.z - left.z * right.y, y: left.z * right.x - left.x * right.z, z: left.x * right.y - left.y * right.x }; }
function normalize(vector) { const length = Math.hypot(vector.x, vector.y, vector.z); if (!(length > 0)) failed(); return { x: vector.x / length, y: vector.y / length, z: vector.z / length }; }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function failed() { throw p6Error('P6_RENDER_FAILED'); }
