import { gzipSync, deflateSync } from 'node:zlib';

const TAG = Object.freeze({
  end: 0, byte: 1, short: 2, int: 3, long: 4, float: 5, double: 6,
  byteArray: 7, string: 8, list: 9, compound: 10, intArray: 11, longArray: 12
});

export function nbtInt(value) { return { type: TAG.int, value }; }
export function nbtString(value) { return { type: TAG.string, value }; }
export function nbtList(childType, value) { return { type: TAG.list, childType, value }; }
export function nbtCompound(value) { return { type: TAG.compound, value }; }

export function encodeNbtRoot(fields, { compression = 'none', rootName = '' } = {}) {
  const raw = Buffer.concat([
    Buffer.from([TAG.compound]), encodeString(rootName), encodeCompoundPayload(fields)
  ]);
  if (compression === 'gzip') return gzipSync(raw, { mtime: 0 });
  if (compression === 'zlib') return deflateSync(raw);
  if (compression !== 'none') throw new Error(`unsupported fixture compression: ${compression}`);
  return raw;
}

export function structureNbt({
  size = [3, 2, 3],
  palette = ['minecraft:air', 'minecraft:stone_bricks', 'minecraft:oak_planks'],
  blocks = [
    { pos: [0, 0, 0], state: 1 },
    { pos: [1, 0, 0], state: 2 },
    { pos: [2, 1, 2], state: 1 }
  ],
  entities = [],
  extraRoot = {},
  compression = 'none'
} = {}) {
  const paletteTags = palette.map((entry) => nbtCompound({
    Name: nbtString(typeof entry === 'string' ? entry : entry.Name),
    ...(typeof entry === 'object' && entry.Properties
      ? { Properties: nbtCompound(Object.fromEntries(
        Object.entries(entry.Properties).map(([key, value]) => [key, nbtString(value)])
      )) }
      : {})
  }));
  const blockTags = blocks.map((block) => nbtCompound({
    state: nbtInt(block.state),
    pos: nbtList(TAG.int, block.pos.map(nbtInt)),
    ...(block.nbt ? { nbt: nbtCompound(block.nbt) } : {})
  }));
  return encodeNbtRoot({
    DataVersion: nbtInt(3955),
    size: nbtList(TAG.int, size.map(nbtInt)),
    palette: nbtList(TAG.compound, paletteTags),
    blocks: nbtList(TAG.compound, blockTags),
    entities: nbtList(TAG.compound, entities.map((entry) => nbtCompound(entry))),
    ...extraRoot
  }, { compression });
}

function encodeNamed(name, tag) {
  return Buffer.concat([Buffer.from([tag.type]), encodeString(name), encodePayload(tag)]);
}

function encodePayload(tag) {
  if (tag.type === TAG.int) {
    const output = Buffer.alloc(4); output.writeInt32BE(tag.value); return output;
  }
  if (tag.type === TAG.string) return encodeString(tag.value);
  if (tag.type === TAG.list) {
    const length = Buffer.alloc(4); length.writeInt32BE(tag.value.length);
    return Buffer.concat([
      Buffer.from([tag.childType]), length, ...tag.value.map((entry) => encodePayload(entry))
    ]);
  }
  if (tag.type === TAG.compound) return encodeCompoundPayload(tag.value);
  throw new Error(`unsupported fixture tag type: ${tag.type}`);
}

function encodeCompoundPayload(fields) {
  return Buffer.concat([
    ...Object.entries(fields).map(([name, tag]) => encodeNamed(name, tag)),
    Buffer.from([TAG.end])
  ]);
}

function encodeString(value) {
  const bytes = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(2); length.writeUInt16BE(bytes.length);
  return Buffer.concat([length, bytes]);
}
