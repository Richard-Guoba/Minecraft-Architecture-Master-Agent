import assert from 'node:assert/strict';
import test from 'node:test';
import { TrainingDataError } from '../src/training/trainingError.js';
import { BOUNDED_NBT_LIMITS, decodeBoundedNbt } from '../src/training/boundedNbt.js';
import {
  encodeNbtRoot,
  nbtCompound,
  nbtInt,
  nbtList,
  nbtString
} from './fixtures/stage7CandidateReadinessFixtures.js';

const ID = 'synthetic-source:house-01';

test('bounded decoder uses the neutral training error contract', () => {
  assert.throws(
    () => decodeBoundedNbt(Buffer.alloc(0), { sourceId: 'fixture' }),
    (error) => error instanceof TrainingDataError && error.code === 'NBT_ROOT_INVALID'
  );
});

test('bounded decoder accepts deterministic gzip, zlib, and uncompressed roots', () => {
  for (const compression of ['none', 'gzip', 'zlib']) {
    const bytes = encodeNbtRoot({ value: nbtInt(7) }, { compression });
    const result = decodeBoundedNbt(bytes, { sourceId: ID });
    assert.equal(result.compression, compression);
    assert.equal(result.value.value, 7);
    assert.equal(Object.isFrozen(result.value), true);
    assert.ok(result.inflated_byte_count >= 4);
  }
});

test('bounded decoder enforces depth, entry, and string budgets', () => {
  const deep = encodeNbtRoot({
    a: nbtCompound({ b: nbtCompound({ c: nbtInt(1) }) })
  });
  assert.throws(
    () => decodeBoundedNbt(deep, {
      sourceId: ID,
      limits: { ...BOUNDED_NBT_LIMITS, maxDepth: 2 }
    }),
    hasCode('NBT_DEPTH_LIMIT')
  );
  const list = encodeNbtRoot({ values: nbtList(3, [nbtInt(1), nbtInt(2), nbtInt(3)]) });
  assert.throws(
    () => decodeBoundedNbt(list, {
      sourceId: ID,
      limits: { ...BOUNDED_NBT_LIMITS, maxEntries: 2 }
    }),
    hasCode('NBT_ENTRY_LIMIT')
  );
  const string = encodeNbtRoot({ value: nbtString('abcd') });
  assert.throws(
    () => decodeBoundedNbt(string, {
      sourceId: ID,
      limits: { ...BOUNDED_NBT_LIMITS, maxStringBytes: 3 }
    }),
    hasCode('NBT_STRING_LIMIT')
  );
});

test('bounded decoder rejects malformed, hostile, and over-expanded input', () => {
  const string = encodeNbtRoot({ value: nbtString('abcd') });
  const invalidUtf8 = Buffer.from([10, 0, 0, 8, 0, 1, 0x61, 0, 1, 0xff, 0]);
  const duplicate = Buffer.from([
    10, 0, 0,
    3, 0, 1, 0x61, 0, 0, 0, 1,
    3, 0, 1, 0x61, 0, 0, 0, 2,
    0
  ]);
  const hugeIntArray = Buffer.from([
    10, 0, 0, 11, 0, 1, 0x61, 0x7f, 0xff, 0xff, 0xff
  ]);
  const negativeList = Buffer.from([
    10, 0, 0, 9, 0, 1, 0x61, 3, 0xff, 0xff, 0xff, 0xff
  ]);

  assert.throws(() => decodeBoundedNbt(invalidUtf8, { sourceId: ID }), hasCode('NBT_UTF8_INVALID'));
  assert.throws(() => decodeBoundedNbt(string.subarray(0, -1), { sourceId: ID }), hasCode('NBT_TRUNCATED'));
  assert.throws(
    () => decodeBoundedNbt(Buffer.concat([string, Buffer.from([1])]), { sourceId: ID }),
    hasCode('NBT_TRAILING_BYTES')
  );
  assert.throws(() => decodeBoundedNbt(duplicate, { sourceId: ID }), hasCode('NBT_DUPLICATE_NAME'));
  assert.throws(() => decodeBoundedNbt(hugeIntArray, { sourceId: ID }), hasCode('NBT_ENTRY_LIMIT'));
  assert.throws(() => decodeBoundedNbt(negativeList, { sourceId: ID }), hasCode('NBT_LIST_LENGTH_INVALID'));
  assert.throws(
    () => decodeBoundedNbt(Buffer.from([0x78, 0x9c, 0xff]), { sourceId: ID }),
    hasCode('NBT_DECOMPRESSION_FAILED')
  );
  assert.throws(
    () => decodeBoundedNbt(Buffer.from([0x50, 0x4b, 0x03, 0x04]), { sourceId: ID }),
    hasCode('NBT_CONTAINER_UNSUPPORTED')
  );

  const compressed = encodeNbtRoot({ value: nbtString('x'.repeat(2048)) }, { compression: 'gzip' });
  assert.throws(
    () => decodeBoundedNbt(compressed, {
      sourceId: ID,
      limits: { ...BOUNDED_NBT_LIMITS, maxInflatedBytes: 128 }
    }),
    hasCode('NBT_INFLATED_LIMIT')
  );
  assert.throws(
    () => decodeBoundedNbt(compressed, {
      sourceId: ID,
      limits: { ...BOUNDED_NBT_LIMITS, maxCompressionRatio: 2 }
    }),
    hasCode('NBT_COMPRESSION_RATIO')
  );
});

function hasCode(code) {
  return (error) => error instanceof TrainingDataError && error.code === code;
}
