import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseNbt } from './nbt.js';

const AIR = Object.freeze({ state: 'minecraft:air', name: 'air', category: 'air', air: true });
const WATER_IDS = new Set([8, 9]);
const EARTH_IDS = new Set([2, 3, 12, 13, 80, 82, 110, 172]);
const ROCK_IDS = new Set([1, 4, 7, 43, 44, 48, 67, 97, 98, 109, 139, 168]);
const WOOD_IDS = new Set([5, 17, 53, 54, 63, 64, 65, 68, 72, 85, 96, 107, 126, 127, 134, 135, 136, 143, 162, 163, 164, 183, 184, 185, 186, 187, 193, 194, 195, 196, 197]);
const LEAF_IDS = new Set([18, 106, 161]);
const PLANT_IDS = new Set([6, 31, 32, 37, 38, 39, 40, 59, 81, 83, 86, 91, 103, 104, 105, 111, 115, 141, 142, 175]);
const GLASS_IDS = new Set([20, 95, 102, 160]);
const LIGHT_IDS = new Set([50, 75, 76, 89, 91, 123, 124, 169]);
const FENCE_IDS = new Set([85, 101, 102, 107, 113, 139, 160, 183, 184, 185, 186, 187]);
const STAIR_IDS = new Set([53, 67, 108, 109, 114, 128, 134, 135, 136, 156, 163, 164, 180]);
const SLAB_IDS = new Set([43, 44, 125, 126, 181, 182]);
const DOOR_IDS = new Set([64, 71, 96, 167, 193, 194, 195, 196, 197]);
const DECOR_IDS = new Set([23, 25, 30, 47, 58, 61, 62, 84, 116, 117, 118, 130, 138, 140, 144, 145, 146, 151, 154, 176, 177]);
const OLD_BLOCK_NAMES = {
  0:'air',1:'stone',2:'grass_block',3:'dirt',4:'cobblestone',5:'planks',8:'water',9:'stationary_water',12:'sand',13:'gravel',17:'log',18:'leaves',20:'glass',24:'sandstone',31:'tall_grass',35:'wool',41:'gold_block',42:'iron_block',43:'double_slab',44:'slab',45:'bricks',47:'bookshelf',48:'mossy_cobblestone',49:'obsidian',50:'torch',53:'oak_stairs',54:'chest',58:'crafting_table',64:'wooden_door',65:'ladder',67:'cobblestone_stairs',79:'ice',80:'snow_block',81:'cactus',82:'clay',85:'fence',87:'netherrack',88:'soul_sand',89:'glowstone',91:'jack_o_lantern',95:'stained_glass',96:'trapdoor',98:'stone_bricks',101:'iron_bars',102:'glass_pane',106:'vine',107:'fence_gate',108:'brick_stairs',109:'stone_brick_stairs',110:'mycelium',111:'lily_pad',112:'nether_bricks',113:'nether_brick_fence',114:'nether_brick_stairs',116:'enchanting_table',118:'cauldron',121:'end_stone',123:'redstone_lamp',124:'lit_redstone_lamp',125:'double_wooden_slab',126:'wooden_slab',128:'sandstone_stairs',130:'ender_chest',134:'spruce_stairs',135:'birch_stairs',136:'jungle_stairs',138:'beacon',139:'cobblestone_wall',140:'flower_pot',144:'skull',145:'anvil',146:'trapped_chest',151:'daylight_detector',152:'redstone_block',154:'hopper',155:'quartz_block',156:'quartz_stairs',159:'stained_hardened_clay',160:'stained_glass_pane',161:'leaves2',162:'log2',163:'acacia_stairs',164:'dark_oak_stairs',168:'prismarine',169:'sea_lantern',171:'carpet',172:'hardened_clay',174:'packed_ice',175:'double_plant',179:'red_sandstone',180:'red_sandstone_stairs',181:'double_red_sandstone_slab',182:'red_sandstone_slab'
};

export function decodeSchematicBlockVolume(buffer) {
  const parsed = parseNbt(buffer);
  const schematic = normalizeSchematicRoot(parsed.value);
  const blockAtIndex = (index) => Number.isInteger(index) && index >= 0 && index < schematic.blockCount ? decodeBlockAt(schematic, index) : AIR;
  const blockAt = (x, y, z) => {
    if (![x, y, z].every(Number.isInteger) || x < 0 || y < 0 || z < 0 || x >= schematic.width || y >= schematic.height || z >= schematic.length) return AIR;
    return blockAtIndex(y * schematic.length * schematic.width + z * schematic.width + x);
  };
  return Object.freeze({
    source_sha256: createHash('sha256').update(buffer).digest('hex'),
    root_name: parsed.name,
    format: schematic.format,
    width: schematic.width,
    height: schematic.height,
    length: schematic.length,
    materials: schematic.materials,
    block_count: schematic.blockCount,
    blockAt,
    blockAtIndex
  });
}

export async function readSchematicBlockVolume(filePath) {
  return decodeSchematicBlockVolume(await fs.readFile(filePath));
}

function normalizeSchematicRoot(root) {
  const width = numberTag(root.Width ?? root.width);
  const height = numberTag(root.Height ?? root.height);
  const length = numberTag(root.Length ?? root.length);
  if (width && height && length && Buffer.isBuffer(root.Blocks)) {
    return { format: root.SchematicVersion || root.Version ? 'mcedit-or-schematica' : 'mcedit-classic', kind:'legacy', width, height, length, materials:root.Materials || 'unknown', blocks:root.Blocks, blockCount:root.Blocks.length, addBlocks:Buffer.isBuffer(root.AddBlocks) ? root.AddBlocks : undefined };
  }
  if (width && height && length && Buffer.isBuffer(root.BlockData) && root.Palette && typeof root.Palette === 'object') {
    const paletteNames = paletteNamesFromSpongePalette(root.Palette);
    const paletteIds = decodeVarintBlockData(root.BlockData, width * height * length);
    return { format:'sponge-schematic', kind:'palette', width, height, length, materials:`palette:${paletteNames.length}`, blockCount:paletteIds.length, paletteIds, paletteNames };
  }
  if (root.Regions && typeof root.Regions === 'object') return normalizeRegionSchematic(root);
  throw new Error('Unsupported schematic: expected classic Blocks, Sponge BlockData, or Regions.');
}

function paletteNamesFromSpongePalette(palette) {
  const reverse = [];
  for (const [state, id] of Object.entries(palette)) reverse[Number(id)] = state;
  return reverse.map((value) => value || 'minecraft:air');
}

function decodeVarintBlockData(buffer, expectedLength) {
  const values = new Int32Array(expectedLength);
  let offset = 0;
  for (let index = 0; index < expectedLength && offset < buffer.length; index += 1) {
    let value = 0;
    let shift = 0;
    while (offset < buffer.length) {
      const byte = buffer[offset++];
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
      if (shift > 35) throw new Error('Invalid Sponge schematic varint block data.');
    }
    values[index] = value;
  }
  return values;
}

function normalizeRegionSchematic(root) {
  const [regionName, region] = Object.entries(root.Regions)[0] || [];
  if (!region) throw new Error('Unsupported Regions schematic: no regions.');
  const size = region.Size || root.Metadata?.EnclosingSize || {};
  const width = Math.abs(numberTag(size.x ?? size.X ?? size.Width) || 0);
  const height = Math.abs(numberTag(size.y ?? size.Y ?? size.Height) || 0);
  const length = Math.abs(numberTag(size.z ?? size.Z ?? size.Length) || 0);
  const paletteNames = Array.isArray(region.BlockStatePalette) ? region.BlockStatePalette.map(blockStateName) : [];
  if (!width || !height || !length || !paletteNames.length || !Array.isArray(region.BlockStates)) throw new Error('Unsupported Regions schematic: expected Size, BlockStatePalette, and BlockStates.');
  const paletteIds = decodePackedBlockStates(region.BlockStates, paletteNames.length, width * height * length);
  return { format:'region-palette-schematic', kind:'palette', regionName, width, height, length, materials:`palette:${paletteNames.length}`, blockCount:paletteIds.length, paletteIds, paletteNames };
}

function blockStateName(value = {}) {
  const name = String(value.Name || value.name || 'minecraft:air');
  const properties = value.Properties && typeof value.Properties === 'object' ? Object.entries(value.Properties).sort(([a],[b]) => a.localeCompare(b)).map(([key, propertyValue]) => `${key}=${propertyValue}`).join(',') : '';
  return properties ? `${name}[${properties}]` : name;
}

function decodePackedBlockStates(longs, paletteLength, expectedLength) {
  const bits = Math.max(2, Math.ceil(Math.log2(Math.max(1, paletteLength))));
  const mask = (1n << BigInt(bits)) - 1n;
  const unsigned = longs.map((value) => BigInt.asUintN(64, typeof value === 'bigint' ? value : BigInt(value)));
  const values = new Int32Array(expectedLength);
  for (let index = 0; index < expectedLength; index += 1) {
    const bitIndex = BigInt(index * bits);
    const longIndex = Number(bitIndex / 64n);
    const offset = Number(bitIndex % 64n);
    const current = unsigned[longIndex] || 0n;
    const next = unsigned[longIndex + 1] || 0n;
    const combined = offset + bits > 64 ? (current >> BigInt(offset)) | (next << BigInt(64 - offset)) : current >> BigInt(offset);
    values[index] = Number(combined & mask);
  }
  return values;
}

function decodeBlockAt(schematic, index) {
  if (schematic.kind === 'palette') {
    const id = schematic.paletteIds[index] || 0;
    const state = schematic.paletteNames[id] || 'minecraft:air';
    const fullName = stripBlockProperties(state);
    const name = fullName.replace(/^minecraft:/, '');
    return { id, state, key:fullName, name, category:blockCategory(fullName), air:name === 'air' || name === 'cave_air' || name === 'void_air' };
  }
  let id = schematic.blocks[index] & 0xff;
  if (schematic.addBlocks) {
    const packed = schematic.addBlocks[Math.floor(index / 2)] || 0;
    id += (index % 2 === 0 ? packed & 0x0f : (packed >> 4) & 0x0f) << 8;
  }
  const name = OLD_BLOCK_NAMES[id] || `legacy_${id}`;
  return { id, state:name, key:String(id), name, category:blockCategory(id), air:id === 0 };
}

function blockCategory(value) {
  if (typeof value === 'string' && !/^\d+$/.test(value)) return blockNameCategory(value);
  const id = Number(value);
  if (id === 0) return 'air';
  if (WATER_IDS.has(id)) return 'water';
  if (LEAF_IDS.has(id) || PLANT_IDS.has(id)) return 'vegetation';
  if (EARTH_IDS.has(id)) return 'earth';
  if (ROCK_IDS.has(id)) return 'rock';
  if (WOOD_IDS.has(id)) return 'wood';
  if (GLASS_IDS.has(id)) return 'glass';
  if (LIGHT_IDS.has(id)) return 'light';
  if (FENCE_IDS.has(id)) return 'fence';
  if (STAIR_IDS.has(id)) return 'stair';
  if (SLAB_IDS.has(id)) return 'slab';
  if (DOOR_IDS.has(id)) return 'opening';
  if (DECOR_IDS.has(id)) return 'decor';
  return 'other';
}

function blockNameCategory(state) {
  const value = stripBlockProperties(state).replace(/^minecraft:/, '');
  if (['air','cave_air','void_air'].includes(value)) return 'air';
  if (/(water|kelp|seagrass)/.test(value)) return 'water';
  if (/(glass|pane)/.test(value)) return 'glass';
  if (/(torch|lantern|lamp|glowstone|sea_lantern|end_rod|beacon|light)/.test(value)) return 'light';
  if (/(leaves|leaf|vine|grass|fern|flower|azalea|sapling|bush|cactus|bamboo|lily|moss_carpet|mushroom|roots)/.test(value)) return 'vegetation';
  if (/(fence|wall|bars|railing)/.test(value)) return 'fence';
  if (/stairs?$/.test(value)) return 'stair';
  if (/slab/.test(value)) return 'slab';
  if (/(door|trapdoor|gate|button|pressure_plate|ladder)/.test(value)) return 'opening';
  if (/(chest|barrel|table|pot|skull|banner|bed|lectern|bookshelf|anvil|hopper|cauldron|campfire|carpet|chain|decorated_pot)/.test(value)) return 'decor';
  if (/(dirt|grass_block|podzol|sand|gravel|clay|mud|mycelium|snow_block|soul_sand|red_sand|terracotta|farmland)/.test(value)) return 'earth';
  if (/(stone|cobble|deepslate|blackstone|basalt|tuff|calcite|andesite|diorite|granite|brick|quartz|sandstone|prismarine|end_stone|netherrack|obsidian|purpur)/.test(value)) return 'rock';
  if (/(planks|log|wood|stem|hyphae|stripped|wool)/.test(value)) return 'wood';
  return 'other';
}

function stripBlockProperties(value) { return String(value || 'minecraft:air').replace(/\[.*\]$/, ''); }
function numberTag(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
