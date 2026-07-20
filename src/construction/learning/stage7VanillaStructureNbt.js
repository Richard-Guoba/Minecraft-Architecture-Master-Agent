import {
  CANDIDATE_NBT_LIMITS,
  CandidateReadinessError,
  assertCandidateId
} from './stage7CandidateBoundary.js';
import { BOUNDED_NBT_VERSION } from './stage7BoundedNbt.js';

export const VANILLA_STRUCTURE_ADAPTER_VERSION = 'stage7-java-structure-nbt-v1';
const RESOURCE_ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/u;
const PROPERTY_NAME = /^[a-z0-9_]+$/u;
const PROPERTY_VALUE = /^[a-z0-9_.-]+$/u;
const AIR = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);
const EXTERNAL = new Set(['minecraft:jigsaw', 'minecraft:structure_block']);
const COMMAND = new Set([
  'minecraft:command_block',
  'minecraft:chain_command_block',
  'minecraft:repeating_command_block'
]);

export function isAirIdentifier(value) { return AIR.has(value); }

export function validateVanillaStructureNbt(decoded, {
  candidateId,
  limits = CANDIDATE_NBT_LIMITS
} = {}) {
  const id = assertCandidateId(candidateId);
  if (!decoded || decoded.version !== BOUNDED_NBT_VERSION || !plain(decoded.value)) {
    fail('STRUCTURE_INPUT_INVALID', id);
  }
  const root = decoded.value;
  if (root.palettes !== undefined) fail('STRUCTURE_MULTI_PALETTE', id);
  if (!Array.isArray(root.size) || !Array.isArray(root.palette) || !Array.isArray(root.blocks)) {
    fail('STRUCTURE_FIELDS_INVALID', id);
  }
  const size = dimensions(root.size, id);
  if (root.palette.length === 0 || root.palette.length > limits.maxPaletteEntries) {
    fail('STRUCTURE_PALETTE_LIMIT', id, { palette_count: root.palette.length });
  }
  if (root.blocks.length === 0 || root.blocks.length > limits.maxBlocks) {
    fail('STRUCTURE_BLOCK_LIMIT', id, { block_count: root.blocks.length });
  }
  const palette = Object.freeze(root.palette.map((entry) => paletteEntry(entry, id)));
  const seen = new Set();
  let blockEntityCount = 0;
  const blocks = root.blocks.map((entry) => {
    if (!plain(entry) || !Number.isSafeInteger(entry.state) || !Array.isArray(entry.pos)
      || entry.pos.length !== 3 || !entry.pos.every(Number.isSafeInteger)) {
      fail('STRUCTURE_BLOCK_INVALID', id);
    }
    if (entry.state < 0 || entry.state >= palette.length) {
      fail('STRUCTURE_PALETTE_INDEX_INVALID', id, { palette_index: entry.state });
    }
    const [x, y, z] = entry.pos;
    if (x < 0 || y < 0 || z < 0 || x >= size.x || y >= size.y || z >= size.z) {
      fail('STRUCTURE_COORDINATE_INVALID', id, { x, y, z });
    }
    const key = `${x},${y},${z}`;
    if (seen.has(key)) fail('STRUCTURE_COORDINATE_DUPLICATE', id, { x, y, z });
    seen.add(key);
    const name = palette[entry.state].name;
    if (EXTERNAL.has(name)) fail('STRUCTURE_EXTERNAL_DEPENDENCY', id);
    if (COMMAND.has(name)) fail('SECURITY_REVIEW_REQUIRED', id);
    const blockEntityPresent = entry.nbt !== undefined;
    if (blockEntityPresent && !plain(entry.nbt)) fail('STRUCTURE_BLOCK_ENTITY_INVALID', id);
    if (blockEntityPresent) blockEntityCount += 1;
    return Object.freeze({ x, y, z, palette_index: entry.state, block_entity_present: blockEntityPresent });
  });
  if (blockEntityCount > limits.maxBlockEntities) {
    fail('STRUCTURE_BLOCK_ENTITY_LIMIT', id, { block_entity_count: blockEntityCount });
  }
  const nonAir = blocks.filter((block) => !isAirIdentifier(palette[block.palette_index].name));
  if (nonAir.length === 0) fail('STRUCTURE_EMPTY', id);
  const bounds = boundsOf(nonAir);
  return Object.freeze({
    version: VANILLA_STRUCTURE_ADAPTER_VERSION,
    parser_version: decoded.version,
    candidate_id: id,
    source_orientation: 'source',
    declared_size: Object.freeze(size),
    palette,
    blocks: Object.freeze(blocks),
    entity_count: Array.isArray(root.entities) ? root.entities.length : 0,
    block_entity_count: blockEntityCount,
    non_air_bounds: bounds
  });
}

function dimensions(value, candidateId) {
  if (value.length !== 3 || !value.every((item) => Number.isSafeInteger(item) && item > 0)) {
    fail('STRUCTURE_SIZE_INVALID', candidateId);
  }
  return { x: value[0], y: value[1], z: value[2] };
}

function paletteEntry(entry, candidateId) {
  if (!plain(entry) || typeof entry.Name !== 'string' || !RESOURCE_ID.test(entry.Name)
    || entry.Name.split(':')[1].split('/').includes('..')) {
    fail('STRUCTURE_BLOCK_ID_INVALID', candidateId);
  }
  const properties = entry.Properties === undefined ? {} : entry.Properties;
  if (!plain(properties) || Object.entries(properties).some(([key, value]) =>
    !PROPERTY_NAME.test(key) || typeof value !== 'string' || !PROPERTY_VALUE.test(value))) {
    fail('STRUCTURE_PROPERTIES_INVALID', candidateId);
  }
  const sorted = Object.entries(properties).sort(([left], [right]) => left.localeCompare(right));
  const suffix = sorted.length
    ? `[${sorted.map(([key, value]) => `${key}=${value}`).join(',')}]`
    : '';
  return Object.freeze({
    name: entry.Name,
    properties: Object.freeze(Object.fromEntries(sorted)),
    canonical_state: `${entry.Name}${suffix}`
  });
}

function boundsOf(blocks) {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -1, y: -1, z: -1 };
  for (const block of blocks) {
    min.x = Math.min(min.x, block.x); min.y = Math.min(min.y, block.y); min.z = Math.min(min.z, block.z);
    max.x = Math.max(max.x, block.x); max.y = Math.max(max.y, block.y); max.z = Math.max(max.z, block.z);
  }
  return Object.freeze({
    min: Object.freeze(min),
    max: Object.freeze(max),
    extent: Object.freeze({
      x: max.x - min.x + 1,
      y: max.y - min.y + 1,
      z: max.z - min.z + 1
    })
  });
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(code, candidateId, safeDetail = {}) {
  throw new CandidateReadinessError(code, 'structure', candidateId, safeDetail);
}
