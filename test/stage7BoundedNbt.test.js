import assert from 'node:assert/strict';
import test from 'node:test';
import { CandidateReadinessError, CANDIDATE_NBT_LIMITS } from '../src/construction/learning/stage7CandidateBoundary.js';
import { decodeBoundedNbt } from '../src/construction/learning/stage7BoundedNbt.js';
import { encodeNbtRoot, nbtCompound, nbtInt, nbtList, nbtString } from './fixtures/stage7CandidateReadinessFixtures.js';

const ID = 'synthetic-source:house-01';

test('bounded decoder accepts deterministic gzip, zlib, and uncompressed roots', () => {
  for (const compression of ['none', 'gzip', 'zlib']) {
    const bytes = encodeNbtRoot({ value: nbtInt(7) }, { compression });
    const result = decodeBoundedNbt(bytes, { candidateId: ID });
    assert.equal(result.compression, compression);
    assert.equal(result.value.value, 7);
    assert.equal(Object.isFrozen(result.value), true);
    assert.ok(result.inflated_byte_count >= 4);
  }
});

test('bounded decoder refuses depth and entry budgets before unbounded work', () => {
  const deep = encodeNbtRoot({
    a: nbtCompound({ b: nbtCompound({ c: nbtInt(1) }) })
  });
  assert.throws(
    () => decodeBoundedNbt(deep, {
      candidateId: ID,
      limits: { ...CANDIDATE_NBT_LIMITS, maxDepth: 2 }
    }),
    hasCode('NBT_DEPTH_LIMIT')
  );
  const list = encodeNbtRoot({ values: nbtList(3, [nbtInt(1), nbtInt(2), nbtInt(3)]) });
  assert.throws(
    () => decodeBoundedNbt(list, {
      candidateId: ID,
      limits: { ...CANDIDATE_NBT_LIMITS, maxEntries: 2 }
    }),
    hasCode('NBT_ENTRY_LIMIT')
  );
});

test('bounded decoder refuses oversized strings, invalid UTF-8, truncation, and trailing bytes', () => {
  const string = encodeNbtRoot({ value: nbtString('abcd') });
  assert.throws(
    () => decodeBoundedNbt(string, {
      candidateId: ID,
      limits: { ...CANDIDATE_NBT_LIMITS, maxStringBytes: 3 }
    }),
    hasCode('NBT_STRING_LIMIT')
  );
  const invalidUtf8 = Buffer.from([10, 0, 0, 8, 0, 1, 0x61, 0, 1, 0xff, 0]);
  assert.throws(() => decodeBoundedNbt(invalidUtf8, { candidateId: ID }), hasCode('NBT_UTF8_INVALID'));
  assert.throws(() => decodeBoundedNbt(string.subarray(0, -1), { candidateId: ID }), hasCode('NBT_TRUNCATED'));
  assert.throws(
    () => decodeBoundedNbt(Buffer.concat([string, Buffer.from([1])]), { candidateId: ID }),
    hasCode('NBT_TRAILING_BYTES')
  );
});

test('bounded decoder refuses duplicate compound names and invalid tag types', () => {
  const duplicate = Buffer.from([
    10, 0, 0,
    3, 0, 1, 0x61, 0, 0, 0, 1,
    3, 0, 1, 0x61, 0, 0, 0, 2,
    0
  ]);
  assert.throws(() => decodeBoundedNbt(duplicate, { candidateId: ID }), hasCode('NBT_DUPLICATE_NAME'));
  assert.throws(
    () => decodeBoundedNbt(Buffer.from([10, 0, 0, 99, 0, 0, 0]), { candidateId: ID }),
    hasCode('NBT_TAG_INVALID')
  );
  assert.throws(
    () => decodeBoundedNbt(Buffer.from([0x78, 0x9c, 0xff]), { candidateId: ID }),
    hasCode('NBT_DECOMPRESSION_FAILED')
  );
  assert.throws(
    () => decodeBoundedNbt(Buffer.from([0x50, 0x4b, 0x03, 0x04]), { candidateId: ID }),
    hasCode('NBT_CONTAINER_UNSUPPORTED')
  );
});

test('bounded decoder refuses hostile declared array and list lengths before allocation', () => {
  const hugeIntArray = Buffer.from([
    10, 0, 0, 11, 0, 1, 0x61, 0x7f, 0xff, 0xff, 0xff
  ]);
  assert.throws(
    () => decodeBoundedNbt(hugeIntArray, { candidateId: ID }),
    hasCode('NBT_ENTRY_LIMIT')
  );
  const negativeList = Buffer.from([
    10, 0, 0, 9, 0, 1, 0x61, 3, 0xff, 0xff, 0xff, 0xff
  ]);
  assert.throws(
    () => decodeBoundedNbt(negativeList, { candidateId: ID }),
    hasCode('NBT_LIST_LENGTH_INVALID')
  );
});

test('bounded decoder refuses inflated-byte and compression-ratio limits', () => {
  const bytes = encodeNbtRoot({ value: nbtString('x'.repeat(2048)) }, { compression: 'gzip' });
  assert.throws(
    () => decodeBoundedNbt(bytes, {
      candidateId: ID,
      limits: { ...CANDIDATE_NBT_LIMITS, maxInflatedBytes: 128 }
    }),
    hasCode('NBT_INFLATED_LIMIT')
  );
  assert.throws(
    () => decodeBoundedNbt(bytes, {
      candidateId: ID,
      limits: { ...CANDIDATE_NBT_LIMITS, maxCompressionRatio: 2 }
    }),
    hasCode('NBT_COMPRESSION_RATIO')
  );
});

function hasCode(code) {
  return (error) => error instanceof CandidateReadinessError && error.code === code;
}
