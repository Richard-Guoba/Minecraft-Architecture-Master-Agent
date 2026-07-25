import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { decodeBoundedNbt } from '../src/training/boundedNbt.js';
import { RESIDENTIAL_INTAKE_LIMITS } from '../src/training/residential/intake/limits.js';
import { validateVanillaStructureNbt } from '../src/training/vanillaStructureNbt.js';

const decoderUrl = new URL('../src/training/boundedNbt.js', import.meta.url).href;
const limitsUrl = new URL(
  '../src/training/residential/intake/limits.js',
  import.meta.url
).href;

test('materialization budget preserves a dense 64-cube with the maximum palette', () => {
  const sourceId = 'dense-cube-maximum-palette';
  const decoded = decodeBoundedNbt(denseVanillaStructure(), {
    sourceId,
    limits: RESIDENTIAL_INTAKE_LIMITS,
    materializeArrays: true
  });
  const structure = validateVanillaStructureNbt(decoded, {
    sourceId,
    limits: RESIDENTIAL_INTAKE_LIMITS
  });
  assert.deepEqual(structure.declared_size, { x: 64, y: 64, z: 64 });
  assert.equal(structure.palette.length, 4096);
  assert.equal(structure.blocks.length, 64 ** 3);
});

test('materialization entry accounting is cumulative across collections', () => {
  const bytes = Buffer.from([
    10, 0, 0,
    11, 0, 1, 0x61, 0, 0, 0, 3, ...Buffer.alloc(12),
    11, 0, 1, 0x62, 0, 0, 0, 3, ...Buffer.alloc(12),
    0
  ]);
  assert.throws(
    () => decodeBoundedNbt(bytes, {
      sourceId: 'cumulative-materialization',
      limits: {
        ...RESIDENTIAL_INTAKE_LIMITS,
        maxMaterializedEntries: 5
      },
      materializeArrays: true
    }),
    (error) => error.code === 'NBT_MATERIALIZATION_LIMIT'
  );
});

test('boxed NBT collections fail with a controlled limit under a capped heap', async (t) => {
  const cases = [
    { name: 'int array', tagType: 11, childType: null, width: 4, length: 6_000_000 },
    { name: 'long array', tagType: 12, childType: null, width: 8, length: 6_000_000 },
    { name: 'long list', tagType: 9, childType: 4, width: 8, length: 6_000_000 },
    {
      name: 'maximum-size string list',
      tagType: 9,
      childType: 8,
      width: 32_768,
      length: 1_999
    }
  ];
  for (const item of cases) {
    await t.test(item.name, async () => {
      const worker = new Worker(`
        const { parentPort, workerData } = require('node:worker_threads');
        Promise.all([
          import(workerData.decoderUrl),
          import(workerData.limitsUrl)
        ]).then(([{ decodeBoundedNbt }, { RESIDENTIAL_INTAKE_LIMITS }]) => {
          const length = workerData.length;
          const lengthOffset = workerData.childType === null ? 7 : 8;
          const payloadOffset = lengthOffset + 4;
          const elementWidth = workerData.childType === 8
            ? workerData.width + 2
            : workerData.width;
          const bytes = Buffer.alloc(payloadOffset + length * elementWidth + 1);
          bytes[0] = 10;
          bytes[3] = workerData.tagType;
          bytes.writeUInt16BE(1, 4);
          bytes[6] = 0x78;
          if (workerData.childType !== null) bytes[7] = workerData.childType;
          bytes.writeInt32BE(length, lengthOffset);
          if (workerData.childType === 8) {
            for (let index = 0; index < length; index += 1) {
              bytes.writeUInt16BE(workerData.width, payloadOffset + index * elementWidth);
            }
          }
          try {
            decodeBoundedNbt(bytes, {
              sourceId: 'hostile-materialization-worker',
              limits: RESIDENTIAL_INTAKE_LIMITS,
              materializeArrays: true
            });
            parentPort.postMessage({ kind: 'accepted' });
          } catch (error) {
            parentPort.postMessage({
              kind: 'training_error',
              name: error.name,
              code: error.code,
              stage: error.metadata?.stage
            });
          }
        });
      `, {
        eval: true,
        resourceLimits: { maxOldGenerationSizeMb: 64 },
        workerData: { ...item, decoderUrl, limitsUrl }
      });
      let result;
      try {
        result = await settledWorkerResult(worker);
      } finally {
        await worker.terminate();
      }
      assert.deepEqual(result, {
        kind: 'training_error',
        name: 'TrainingDataError',
        code: 'NBT_MATERIALIZATION_LIMIT',
        stage: 'nbt'
      });
    });
  }
});

function denseVanillaStructure() {
  const sizePayload = Buffer.alloc(3 * 4);
  sizePayload.writeInt32BE(64, 0);
  sizePayload.writeInt32BE(64, 4);
  sizePayload.writeInt32BE(64, 8);
  const palettePayload = Buffer.concat(Array.from({ length: 4096 }, (_, index) => (
    Buffer.concat([
      Buffer.from([8]),
      encodedString('Name'),
      encodedString(`minecraft:test_${index}`),
      Buffer.from([0])
    ])
  )));
  const blockCount = 64 ** 3;
  const blockWidth = 36;
  const blocksPayload = Buffer.alloc(blockCount * blockWidth);
  for (let index = 0; index < blockCount; index += 1) {
    let offset = index * blockWidth;
    blocksPayload[offset++] = 9;
    blocksPayload.writeUInt16BE(3, offset);
    offset += 2;
    blocksPayload.write('pos', offset);
    offset += 3;
    blocksPayload[offset++] = 3;
    blocksPayload.writeInt32BE(3, offset);
    offset += 4;
    blocksPayload.writeInt32BE(index % 64, offset);
    offset += 4;
    blocksPayload.writeInt32BE(Math.floor(index / (64 * 64)), offset);
    offset += 4;
    blocksPayload.writeInt32BE(Math.floor(index / 64) % 64, offset);
    offset += 4;
    blocksPayload[offset++] = 3;
    blocksPayload.writeUInt16BE(5, offset);
    offset += 2;
    blocksPayload.write('state', offset);
    offset += 5;
    blocksPayload.writeInt32BE(index % 4096, offset);
  }
  return Buffer.concat([
    Buffer.from([10, 0, 0]),
    namedList('size', 3, 3, sizePayload),
    namedList('palette', 10, 4096, palettePayload),
    namedList('blocks', 10, blockCount, blocksPayload),
    namedList('entities', 10, 0, Buffer.alloc(0)),
    Buffer.from([0])
  ]);
}

function encodedString(value) {
  const bytes = Buffer.from(value);
  const output = Buffer.alloc(2 + bytes.length);
  output.writeUInt16BE(bytes.length);
  bytes.copy(output, 2);
  return output;
}

function settledWorkerResult(worker) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish({ kind: 'worker_timeout' }), 10_000);
    worker.once('message', finish);
    worker.once('error', (error) => finish({
      kind: 'worker_error',
      code: error.code,
      message: error.message
    }));
    worker.once('exit', (code) => finish({ kind: 'worker_exit', code }));
  });
}

function namedList(name, childType, length, payload) {
  const nameBytes = Buffer.from(name);
  const header = Buffer.alloc(1 + 2 + nameBytes.length + 1 + 4);
  let offset = 0;
  header[offset++] = 9;
  header.writeUInt16BE(nameBytes.length, offset);
  offset += 2;
  nameBytes.copy(header, offset);
  offset += nameBytes.length;
  header[offset++] = childType;
  header.writeInt32BE(length, offset);
  return Buffer.concat([header, payload]);
}
