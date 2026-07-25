import { decodeBoundedNbt } from '../../boundedNbt.js';
import { TrainingDataError, assertSourceId } from '../../trainingError.js';
import { RESIDENTIAL_INTAKE_LIMITS } from './limits.js';

const AIR = Object.freeze({
  canonical_state: 'minecraft:air', name: 'air', category: 'air', air: true
});
const LEGACY_NAMES = Object.freeze({
  0: 'air', 1: 'stone', 2: 'grass_block', 3: 'dirt', 4: 'cobblestone',
  5: 'planks', 8: 'water', 9: 'stationary_water', 12: 'sand', 13: 'gravel',
  17: 'log', 18: 'leaves', 20: 'glass', 24: 'sandstone', 35: 'wool',
  43: 'double_slab', 44: 'slab', 45: 'bricks', 47: 'bookshelf', 48: 'mossy_cobblestone',
  50: 'torch', 53: 'oak_stairs', 54: 'chest', 58: 'crafting_table',
  64: 'wooden_door', 65: 'ladder', 67: 'cobblestone_stairs', 85: 'fence',
  89: 'glowstone', 91: 'jack_o_lantern', 95: 'stained_glass', 96: 'trapdoor',
  98: 'stone_bricks', 101: 'iron_bars', 102: 'glass_pane', 107: 'fence_gate',
  108: 'brick_stairs', 109: 'stone_brick_stairs', 114: 'nether_brick_stairs',
  116: 'enchanting_table', 117: 'brewing_stand', 118: 'cauldron', 123: 'redstone_lamp',
  124: 'lit_redstone_lamp', 125: 'double_wooden_slab', 126: 'wooden_slab',
  128: 'sandstone_stairs', 130: 'ender_chest', 134: 'spruce_stairs',
  135: 'birch_stairs', 136: 'jungle_stairs', 138: 'beacon', 139: 'cobblestone_wall',
  140: 'flower_pot', 144: 'skull', 145: 'anvil', 146: 'trapped_chest',
  151: 'daylight_detector', 154: 'hopper', 156: 'quartz_stairs',
  159: 'stained_hardened_clay', 160: 'stained_glass_pane', 163: 'acacia_stairs',
  164: 'dark_oak_stairs', 168: 'prismarine', 169: 'sea_lantern', 171: 'carpet',
  172: 'hardened_clay', 179: 'red_sandstone', 180: 'red_sandstone_stairs',
  181: 'double_red_sandstone_slab', 182: 'red_sandstone_slab'
});
const RESOURCE_ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/u;
const PROPERTY = /^[a-z0-9_]+=[a-z0-9_.-]+$/u;
const EXTERNAL = new Set(['minecraft:jigsaw', 'minecraft:structure_block']);
const COMMAND = new Set([
  'minecraft:command_block',
  'minecraft:chain_command_block',
  'minecraft:repeating_command_block'
]);

export function decodeResidentialSchematic(bytes, {
  sourceId,
  format,
  limits = RESIDENTIAL_INTAKE_LIMITS
} = {}) {
  const id = assertSourceId(sourceId);
  if (!['schem', 'schematic'].includes(format)) {
    fail('SCHEMATIC_FORMAT_INVALID', id, { format });
  }
  const decoded = decodeBoundedNbt(bytes, {
    sourceId: id,
    limits,
    materializeArrays: true
  });
  const root = decoded.value;
  if (!plain(root)) fail('SCHEMATIC_ROOT_INVALID', id);
  if (isLegacy(root)) return legacyArtifact(root, format, id, limits);
  if (isSponge(root)) return spongeArtifact(root, format, id, limits);
  if (isRegionRoot(root)) return regionArtifact(root, format, id, limits);
  fail('SCHEMATIC_FORMAT_UNSUPPORTED', id);
}

function isLegacy(root) {
  return root.Width !== undefined
    && root.Height !== undefined
    && root.Length !== undefined
    && Buffer.isBuffer(root.Blocks);
}

function isSponge(root) {
  return root.Width !== undefined
    && root.Height !== undefined
    && root.Length !== undefined
    && plain(root.Palette)
    && Buffer.isBuffer(root.BlockData);
}

function isRegionRoot(root) {
  return plain(root.Regions);
}

function legacyArtifact(root, format, sourceId, limits) {
  const declaredSize = dimensions(root, sourceId, limits);
  const blockCount = declaredSize.x * declaredSize.y * declaredSize.z;
  if (root.Blocks.length !== blockCount) {
    fail('SCHEMATIC_BLOCK_COUNT_INVALID', sourceId, {
      declared_block_count: blockCount,
      block_count: root.Blocks.length
    });
  }
  const records = new Map();
  const recordFor = (id) => {
    if (!records.has(id)) records.set(id, legacyBlock(id));
    return records.get(id);
  };
  return artifact({
    format,
    declaredSize,
    blockCount,
    blockEntityCount: collectionCount(root.TileEntities, 'SCHEMATIC_BLOCK_ENTITIES_INVALID', sourceId, limits.maxBlockEntities),
    entityCount: collectionCount(root.Entities, 'SCHEMATIC_ENTITIES_INVALID', sourceId, limits.maxEntities),
    blockAtIndex: (index) => recordFor(root.Blocks[index] & 0xff)
  });
}

function spongeArtifact(root, format, sourceId, limits) {
  const declaredSize = dimensions(root, sourceId, limits);
  const blockCount = declaredSize.x * declaredSize.y * declaredSize.z;
  const palette = spongePalette(root.Palette, sourceId, limits);
  const indexes = decodeVarints(root.BlockData, blockCount, sourceId);
  for (const paletteIndex of indexes) {
    if (paletteIndex >= palette.length) {
      fail('SCHEMATIC_PALETTE_INDEX_INVALID', sourceId, { palette_index: paletteIndex });
    }
  }
  return artifact({
    format,
    declaredSize,
    blockCount,
    blockEntityCount: collectionCount(root.BlockEntities, 'SCHEMATIC_BLOCK_ENTITIES_INVALID', sourceId, limits.maxBlockEntities),
    entityCount: collectionCount(root.Entities, 'SCHEMATIC_ENTITIES_INVALID', sourceId, limits.maxEntities),
    blockAtIndex: (index) => palette[indexes[index]]
  });
}

function regionArtifact(root, format, sourceId, limits) {
  const entries = Object.entries(root.Regions);
  if (entries.length !== 1 || !plain(entries[0]?.[1])) {
    fail('SCHEMATIC_REGION_INVALID', sourceId);
  }
  const region = entries[0][1];
  if (!plain(region.Size) || !Array.isArray(region.BlockStatePalette) || !Array.isArray(region.BlockStates)) {
    fail('SCHEMATIC_REGION_INVALID', sourceId);
  }
  const declaredSize = dimensions(region.Size, sourceId, limits, true);
  const blockCount = declaredSize.x * declaredSize.y * declaredSize.z;
  const palette = regionPalette(region.BlockStatePalette, sourceId, limits);
  const indexes = decodePackedStates(region.BlockStates, palette.length, blockCount, sourceId);
  for (const paletteIndex of indexes) {
    if (paletteIndex >= palette.length) {
      fail('SCHEMATIC_PALETTE_INDEX_INVALID', sourceId, { palette_index: paletteIndex });
    }
  }
  return artifact({
    format,
    declaredSize,
    blockCount,
    blockEntityCount: collectionCount(region.TileEntities, 'SCHEMATIC_BLOCK_ENTITIES_INVALID', sourceId, limits.maxBlockEntities),
    entityCount: collectionCount(region.Entities, 'SCHEMATIC_ENTITIES_INVALID', sourceId, limits.maxEntities),
    blockAtIndex: (index) => palette[indexes[index]]
  });
}

function artifact({
  format, declaredSize, blockCount, blockEntityCount, entityCount, blockAtIndex
}) {
  return Object.freeze({
    format,
    declared_size: Object.freeze(declaredSize),
    block_count: blockCount,
    block_entity_count: blockEntityCount,
    entity_count: entityCount,
    blockAtIndex(index) {
      return Number.isInteger(index) && index >= 0 && index < blockCount
        ? blockAtIndex(index)
        : AIR;
    }
  });
}

function dimensions(value, sourceId, limits, lowercase = false) {
  const fields = lowercase
    ? [value.x ?? value.X ?? value.Width, value.y ?? value.Y ?? value.Height, value.z ?? value.Z ?? value.Length]
    : [value.Width, value.Height, value.Length];
  if (!fields.every((item) => Number.isSafeInteger(item) && item > 0 && item <= 32_767)) {
    fail('SCHEMATIC_DIMENSIONS_INVALID', sourceId);
  }
  const [x, y, z] = fields;
  const volume = x * y * z;
  if (!Number.isSafeInteger(volume)) fail('SCHEMATIC_DIMENSIONS_INVALID', sourceId);
  if (volume > limits.maxBlocks) {
    fail('SCHEMATIC_VOLUME_LIMIT', sourceId, { block_count: volume });
  }
  return { x, y, z };
}

function spongePalette(value, sourceId, limits) {
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > limits.maxPaletteEntries) {
    fail('SCHEMATIC_PALETTE_INVALID', sourceId, { palette_count: entries.length });
  }
  const output = Array(entries.length);
  for (const [state, index] of entries) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= entries.length || output[index] !== undefined) {
      fail('SCHEMATIC_PALETTE_INVALID', sourceId);
    }
    output[index] = stateRecord(state, sourceId);
  }
  if (output.some((item) => item === undefined)) fail('SCHEMATIC_PALETTE_INVALID', sourceId);
  return Object.freeze(output);
}

function regionPalette(value, sourceId, limits) {
  if (value.length === 0 || value.length > limits.maxPaletteEntries) {
    fail('SCHEMATIC_PALETTE_INVALID', sourceId, { palette_count: value.length });
  }
  return Object.freeze(value.map((entry) => {
    if (!plain(entry) || typeof entry.Name !== 'string') {
      fail('SCHEMATIC_PALETTE_INVALID', sourceId);
    }
    const properties = entry.Properties === undefined ? {} : entry.Properties;
    if (!plain(properties)) fail('SCHEMATIC_PALETTE_INVALID', sourceId);
    const suffix = Object.entries(properties)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${key}=${item}`)
      .join(',');
    return stateRecord(`${entry.Name}${suffix ? `[${suffix}]` : ''}`, sourceId);
  }));
}

function decodeVarints(bytes, expected, sourceId) {
  const values = new Uint32Array(expected);
  let offset = 0;
  for (let index = 0; index < expected; index += 1) {
    let value = 0;
    let shift = 0;
    let terminated = false;
    while (offset < bytes.length && shift <= 28) {
      const byte = bytes[offset++];
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        terminated = true;
        break;
      }
      shift += 7;
    }
    if (!terminated) fail('SCHEMATIC_BLOCK_DATA_INVALID', sourceId);
    values[index] = value >>> 0;
  }
  if (offset !== bytes.length) fail('SCHEMATIC_BLOCK_DATA_INVALID', sourceId);
  return values;
}

function decodePackedStates(longs, paletteSize, expected, sourceId) {
  const bits = Math.max(2, Math.ceil(Math.log2(Math.max(1, paletteSize))));
  const required = Math.ceil((expected * bits) / 64);
  if (longs.length !== required) fail('SCHEMATIC_BLOCK_DATA_INVALID', sourceId);
  const values = new Uint32Array(expected);
  const mask = (1n << BigInt(bits)) - 1n;
  const unsigned = longs.map((value) => BigInt.asUintN(64, value));
  for (let index = 0; index < expected; index += 1) {
    const bitIndex = BigInt(index * bits);
    const longIndex = Number(bitIndex / 64n);
    const offset = Number(bitIndex % 64n);
    const current = unsigned[longIndex];
    const next = unsigned[longIndex + 1] ?? 0n;
    const combined = offset + bits > 64
      ? (current >> BigInt(offset)) | (next << BigInt(64 - offset))
      : current >> BigInt(offset);
    values[index] = Number(combined & mask);
  }
  return values;
}

function collectionCount(value, code, sourceId, limit) {
  if (value === undefined) return 0;
  if (!Array.isArray(value) || value.length > limit) {
    fail(code, sourceId, { count: Array.isArray(value) ? value.length : undefined });
  }
  return value.length;
}

function legacyBlock(id) {
  const name = LEGACY_NAMES[id] ?? `legacy_${id}`;
  if (id === 0) return AIR;
  return Object.freeze({
    canonical_state: `minecraft:${name}`,
    name,
    category: categoryFor(name),
    air: false
  });
}

function stateRecord(value, sourceId) {
  if (typeof value !== 'string') fail('SCHEMATIC_BLOCK_ID_INVALID', sourceId);
  const match = /^(?<name>[^\[]+)(?:\[(?<properties>.*)\])?$/u.exec(value);
  if (!match || !RESOURCE_ID.test(match.groups.name) || match.groups.name.split(':')[1].split('/').includes('..')) {
    fail('SCHEMATIC_BLOCK_ID_INVALID', sourceId);
  }
  const properties = match.groups.properties === undefined || match.groups.properties === ''
    ? []
    : match.groups.properties.split(',');
  if (!properties.every((item) => PROPERTY.test(item))) fail('SCHEMATIC_PROPERTIES_INVALID', sourceId);
  const canonicalState = `${match.groups.name}${properties.length ? `[${[...properties].sort().join(',')}]` : ''}`;
  if (EXTERNAL.has(match.groups.name)) fail('STRUCTURE_EXTERNAL_DEPENDENCY', sourceId);
  if (COMMAND.has(match.groups.name)) fail('SECURITY_REVIEW_REQUIRED', sourceId);
  const name = match.groups.name.replace(/^minecraft:/u, '');
  return Object.freeze({
    canonical_state: canonicalState,
    name,
    category: categoryFor(name),
    air: ['air', 'cave_air', 'void_air'].includes(name)
  });
}

function categoryFor(name) {
  if (['air', 'cave_air', 'void_air'].includes(name)) return 'air';
  if (/(water|kelp|seagrass)/u.test(name)) return 'water';
  if (/(glass|pane)/u.test(name)) return 'glass';
  if (/(torch|lantern|lamp|glowstone|sea_lantern|end_rod|beacon|light)/u.test(name)) return 'light';
  if (/(leaves|leaf|vine|grass|fern|flower|azalea|sapling|bush|cactus|bamboo|lily|moss_carpet|mushroom|roots)/u.test(name)) return 'vegetation';
  if (/(fence|wall|bars|railing)/u.test(name)) return 'fence';
  if (/stairs?$/u.test(name)) return 'stair';
  if (/slab/u.test(name)) return 'slab';
  if (/(door|trapdoor|gate|button|pressure_plate|ladder)/u.test(name)) return 'opening';
  if (/(chest|barrel|table|pot|skull|banner|bed|lectern|bookshelf|anvil|hopper|cauldron|campfire|carpet|chain|decorated_pot)/u.test(name)) return 'decor';
  if (/(dirt|grass_block|podzol|sand|gravel|clay|mud|mycelium|snow_block|soul_sand|red_sand|terracotta|farmland)/u.test(name)) return 'earth';
  if (/(stone|cobble|deepslate|blackstone|basalt|tuff|calcite|andesite|diorite|granite|brick|quartz|sandstone|prismarine|end_stone|netherrack|obsidian|purpur)/u.test(name)) return 'rock';
  if (/(planks|log|wood|stem|hyphae|stripped|wool)/u.test(name)) return 'wood';
  return 'other';
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value);
}

function fail(code, sourceId, metadata = {}) {
  throw new TrainingDataError(code, `schematic:${sourceId}`, {
    stage: 'schematic',
    source_id: sourceId,
    ...metadata
  });
}
