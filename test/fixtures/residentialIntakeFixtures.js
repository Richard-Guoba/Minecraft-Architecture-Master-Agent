import fs from 'node:fs/promises';
import path from 'node:path';

const TAG = Object.freeze({
  end: 0,
  byte: 1,
  short: 2,
  int: 3,
  long: 4,
  byteArray: 7,
  string: 8,
  list: 9,
  compound: 10,
  longArray: 12
});

export function classicSchematic({
  width = 2,
  height = 2,
  length = 2,
  blockId = 1,
  blocks = undefined
} = {}) {
  const volume = width * height * length;
  const blockBytes = blocks === undefined
    ? Buffer.from([blockId, ...Array(Math.max(0, volume - 1)).fill(0)])
    : Buffer.from(blocks);
  return encodeNbtRoot({
    Width: short(width),
    Height: short(height),
    Length: short(length),
    Blocks: byteArray(blockBytes)
  });
}

export function spongeSchematic({
  width = 2,
  height = 1,
  length = 1,
  palette = { 'minecraft:oak_planks': 0, 'minecraft:air': 1 },
  blockData = [0, 1]
} = {}) {
  return encodeNbtRoot({
    Width: dimension(width),
    Height: dimension(height),
    Length: dimension(length),
    Palette: compound(Object.fromEntries(
      Object.entries(palette).map(([name, value]) => [name, int(value)])
    )),
    BlockData: byteArray(Buffer.from(encodeVarints(blockData)))
  });
}

export function vanillaStructure({
  size = [2, 1, 1],
  palette = ['minecraft:air', 'minecraft:stone'],
  blocks = [{ pos: [0, 0, 0], state: 1 }],
  entities = []
} = {}) {
  return encodeNbtRoot({
    size: list(TAG.int, size.map(int)),
    palette: list(TAG.compound, palette.map((name) => compound({ Name: string(name) }))),
    blocks: list(TAG.compound, blocks.map((block) => compound({
      pos: list(TAG.int, block.pos.map(int)),
      state: int(block.state),
      ...(block.nbt ? { nbt: compound(block.nbt) } : {})
    }))),
    entities: list(TAG.compound, entities.map(compound))
  });
}

export function regionSchematic({
  size = [2, 1, 1],
  palette = ['minecraft:stone', 'minecraft:air'],
  states = [0, 1]
} = {}) {
  return encodeNbtRoot({
    Regions: compound({
      Main: compound({
        Size: compound({ x: int(size[0]), y: int(size[1]), z: int(size[2]) }),
        BlockStatePalette: list(TAG.compound, palette.map((name) => compound({
          Name: string(name)
        }))),
        BlockStates: longArray(packStates(states, palette.length))
      })
    })
  });
}

export async function writeBatchFixture({
  root,
  batchId,
  houseFilename = 'Fixture House.schematic',
  otherFilename = 'Fixture Tower.schematic',
  houseBytes = classicSchematic(),
  otherBytes = classicSchematic({ blockId: 5 })
}) {
  const batchPath = path.join(root, 'inbox', batchId);
  await fs.writeFile(path.join(batchPath, 'houses', houseFilename), houseBytes);
  await fs.writeFile(path.join(batchPath, 'other-architecture', otherFilename), otherBytes);
  const manifestPath = path.join(batchPath, 'batch-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.candidates = [
    fixtureCandidate('houses', houseFilename, 'Fixture House'),
    fixtureCandidate('other-architecture', otherFilename, 'Fixture Tower')
  ];
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function end() { return { type: TAG.end }; }
function short(value) { return { type: TAG.short, value }; }
function int(value) { return { type: TAG.int, value }; }
function dimension(value) {
  return value >= -32_768 && value <= 32_767 ? short(value) : int(value);
}
function string(value) { return { type: TAG.string, value }; }
function byteArray(value) { return { type: TAG.byteArray, value }; }
function longArray(value) { return { type: TAG.longArray, value }; }
function list(childType, value) { return { type: TAG.list, childType, value }; }
function compound(value) { return { type: TAG.compound, value }; }

function encodeNbtRoot(fields) {
  return Buffer.concat([
    Buffer.from([TAG.compound]), encodeString(''), encodeCompound(fields), Buffer.from([TAG.end])
  ]);
}

function encodeCompound(fields) {
  return Buffer.concat(Object.entries(fields).map(([name, tag]) => Buffer.concat([
    Buffer.from([tag.type]), encodeString(name), encodePayload(tag)
  ])));
}

function encodePayload(tag) {
  if (tag.type === TAG.short) {
    const output = Buffer.alloc(2); output.writeInt16BE(tag.value); return output;
  }
  if (tag.type === TAG.int) {
    const output = Buffer.alloc(4); output.writeInt32BE(tag.value); return output;
  }
  if (tag.type === TAG.string) return encodeString(tag.value);
  if (tag.type === TAG.byteArray) return Buffer.concat([encodeLength(tag.value.length), tag.value]);
  if (tag.type === TAG.longArray) {
    return Buffer.concat([encodeLength(tag.value.length), ...tag.value.map((value) => {
      const output = Buffer.alloc(8); output.writeBigInt64BE(value); return output;
    })]);
  }
  if (tag.type === TAG.list) {
    return Buffer.concat([
      Buffer.from([tag.childType]), encodeLength(tag.value.length),
      ...tag.value.map(encodePayload)
    ]);
  }
  if (tag.type === TAG.compound) return Buffer.concat([encodeCompound(tag.value), Buffer.from([TAG.end])]);
  if (tag.type === TAG.end) return Buffer.alloc(0);
  throw new Error(`unsupported fixture tag: ${tag.type}`);
}

function encodeString(value) {
  const bytes = Buffer.from(value, 'utf8');
  const output = Buffer.alloc(2); output.writeUInt16BE(bytes.length);
  return Buffer.concat([output, bytes]);
}

function encodeLength(value) {
  const output = Buffer.alloc(4); output.writeInt32BE(value); return output;
}

function encodeVarints(values) {
  const output = [];
  for (const source of values) {
    let value = source >>> 0;
    do {
      let byte = value & 0x7f;
      value >>>= 7;
      if (value !== 0) byte |= 0x80;
      output.push(byte);
    } while (value !== 0);
  }
  return output;
}

function packStates(states, paletteLength) {
  const bits = Math.max(2, Math.ceil(Math.log2(Math.max(1, paletteLength))));
  const longCount = Math.ceil((states.length * bits) / 64);
  const output = Array(longCount).fill(0n);
  for (let index = 0; index < states.length; index += 1) {
    const bitIndex = BigInt(index * bits);
    const longIndex = Number(bitIndex / 64n);
    const offset = Number(bitIndex % 64n);
    output[longIndex] |= BigInt(states[index]) << BigInt(offset);
    if (offset + bits > 64) {
      output[longIndex + 1] |= BigInt(states[index]) >> BigInt(64 - offset);
    }
  }
  return output.map((value) => BigInt.asIntN(64, value));
}

function fixtureCandidate(lane, filename, title) {
  return {
    relative_path: `${lane}/${filename}`,
    lane,
    title,
    origin: {
      url: `https://example.invalid/${lane}/${encodeURIComponent(filename)}`,
      author: 'fixture-author',
      license_status: 'recorded',
      license_text: 'fixture license',
      allowed_uses: ['local-analysis', 'local-training'],
      acquired_at: '2026-07-24T12:00:00.000Z'
    },
    collector_note: ''
  };
}
