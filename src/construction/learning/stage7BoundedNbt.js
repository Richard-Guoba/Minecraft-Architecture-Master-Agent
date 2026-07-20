import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { gunzipSync, inflateSync } from 'node:zlib';
import {
  CANDIDATE_NBT_LIMITS,
  CandidateReadinessError,
  assertCandidateId
} from './stage7CandidateBoundary.js';

export const BOUNDED_NBT_VERSION = 'stage7-bounded-nbt-v1';

const TAG = Object.freeze({
  END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6,
  BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12
});
const VALID_TYPES = new Set(Object.values(TAG));
const UTF8 = new TextDecoder('utf-8', { fatal: true });

export function decodeBoundedNbt(buffer, {
  candidateId,
  limits = CANDIDATE_NBT_LIMITS
} = {}) {
  const id = assertCandidateId(candidateId);
  if (!Buffer.isBuffer(buffer)) fail('NBT_INPUT_INVALID', id);
  if (buffer.length > limits.maxRawBytes) {
    fail('RAW_BYTES_LIMIT', id, { byte_count: buffer.length });
  }
  const inflated = inflateBounded(buffer, limits, id);
  const ratio = inflated.bytes.length / Math.max(1, buffer.length);
  if (ratio > limits.maxCompressionRatio) {
    fail('NBT_COMPRESSION_RATIO', id, {
      raw_byte_count: buffer.length,
      inflated_byte_count: inflated.bytes.length
    });
  }
  const reader = new Reader(inflated.bytes, limits, id);
  const type = reader.u8();
  if (type !== TAG.COMPOUND) fail('NBT_ROOT_INVALID', id, { tag_type: type });
  const rootName = reader.string();
  const value = reader.payload(TAG.COMPOUND, 1, false);
  if (reader.offset !== inflated.bytes.length) {
    fail('NBT_TRAILING_BYTES', id, { trailing_byte_count: inflated.bytes.length - reader.offset });
  }
  return Object.freeze({
    version: BOUNDED_NBT_VERSION,
    compression: inflated.compression,
    raw_byte_count: buffer.length,
    inflated_byte_count: inflated.bytes.length,
    root_name: rootName,
    value
  });
}

function inflateBounded(buffer, limits, candidateId) {
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) fail('NBT_CONTAINER_UNSUPPORTED', candidateId);
  const options = { maxOutputLength: limits.maxInflatedBytes };
  try {
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
      return { compression: 'gzip', bytes: gunzipSync(buffer, options) };
    }
    if (isZlib(buffer)) {
      return { compression: 'zlib', bytes: inflateSync(buffer, options) };
    }
  } catch (error) {
    if (error.code === 'ERR_BUFFER_TOO_LARGE' || /maxOutputLength|larger than/u.test(error.message || '')) {
      fail('NBT_INFLATED_LIMIT', candidateId, { max_inflated_bytes: limits.maxInflatedBytes });
    }
    fail('NBT_DECOMPRESSION_FAILED', candidateId);
  }
  if (buffer.length > limits.maxInflatedBytes) {
    fail('NBT_INFLATED_LIMIT', candidateId, { max_inflated_bytes: limits.maxInflatedBytes });
  }
  return { compression: 'none', bytes: buffer };
}

function isZlib(buffer) {
  if (buffer.length < 2) return false;
  const header = (buffer[0] << 8) | buffer[1];
  return (buffer[0] & 0x0f) === 8 && header % 31 === 0;
}

class Reader {
  constructor(buffer, limits, candidateId) {
    this.buffer = buffer;
    this.limits = limits;
    this.candidateId = candidateId;
    this.offset = 0;
    this.entries = 0;
  }

  payload(type, depth, charge = true) {
    if (!VALID_TYPES.has(type) || type === TAG.END) fail('NBT_TAG_INVALID', this.candidateId, { tag_type: type });
    if (depth > this.limits.maxDepth) fail('NBT_DEPTH_LIMIT', this.candidateId, { depth });
    if (charge) this.charge(1);
    if (type === TAG.BYTE) return this.i8();
    if (type === TAG.SHORT) return this.i16();
    if (type === TAG.INT) return this.i32();
    if (type === TAG.LONG) return this.i64();
    if (type === TAG.FLOAT) return this.f32();
    if (type === TAG.DOUBLE) return this.f64();
    if (type === TAG.STRING) return this.string();
    if (type === TAG.BYTE_ARRAY) return this.arrayDescriptor('byte', 1);
    if (type === TAG.INT_ARRAY) return this.arrayDescriptor('int', 4);
    if (type === TAG.LONG_ARRAY) return this.arrayDescriptor('long', 8);
    if (type === TAG.LIST) return this.list(depth);
    if (type === TAG.COMPOUND) return this.compound(depth);
    fail('NBT_TAG_INVALID', this.candidateId, { tag_type: type });
  }

  list(depth) {
    const childType = this.u8();
    const length = this.length('NBT_LIST_LENGTH_INVALID');
    if (length > 0 && (!VALID_TYPES.has(childType) || childType === TAG.END)) {
      fail('NBT_TAG_INVALID', this.candidateId, { tag_type: childType });
    }
    this.charge(length);
    const output = [];
    for (let index = 0; index < length; index += 1) {
      output.push(this.payload(childType, depth + 1, false));
    }
    return Object.freeze(output);
  }

  compound(depth) {
    const output = {};
    while (true) {
      const type = this.u8();
      if (type === TAG.END) return Object.freeze(output);
      if (!VALID_TYPES.has(type)) fail('NBT_TAG_INVALID', this.candidateId, { tag_type: type });
      const name = this.string();
      if (Object.hasOwn(output, name)) fail('NBT_DUPLICATE_NAME', this.candidateId);
      output[name] = this.payload(type, depth + 1);
    }
  }

  arrayDescriptor(kind, width) {
    const length = this.length('NBT_ARRAY_LENGTH_INVALID');
    this.charge(length);
    const byteLength = length * width;
    if (!Number.isSafeInteger(byteLength)) fail('NBT_ARRAY_LENGTH_INVALID', this.candidateId);
    this.ensure(byteLength);
    const start = this.offset;
    this.offset += byteLength;
    return Object.freeze({
      nbt_array: kind,
      length,
      sha256: createHash('sha256').update(this.buffer.subarray(start, this.offset)).digest('hex')
    });
  }

  string() {
    const length = this.u16();
    if (length > this.limits.maxStringBytes) {
      fail('NBT_STRING_LIMIT', this.candidateId, { string_byte_count: length });
    }
    this.ensure(length);
    const bytes = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    try {
      return UTF8.decode(bytes);
    } catch {
      fail('NBT_UTF8_INVALID', this.candidateId, { string_byte_count: length });
    }
  }

  length(code) {
    const value = this.i32();
    if (value < 0) fail(code, this.candidateId, { declared_length: value });
    return value;
  }

  charge(count) {
    if (!Number.isSafeInteger(count) || count < 0 || this.entries + count > this.limits.maxEntries) {
      fail('NBT_ENTRY_LIMIT', this.candidateId, { entry_count: this.entries + count });
    }
    this.entries += count;
  }

  ensure(length) {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.buffer.length) {
      fail('NBT_TRUNCATED', this.candidateId, { byte_offset: this.offset });
    }
  }

  u8() { this.ensure(1); const value = this.buffer.readUInt8(this.offset); this.offset += 1; return value; }
  i8() { this.ensure(1); const value = this.buffer.readInt8(this.offset); this.offset += 1; return value; }
  u16() { this.ensure(2); const value = this.buffer.readUInt16BE(this.offset); this.offset += 2; return value; }
  i16() { this.ensure(2); const value = this.buffer.readInt16BE(this.offset); this.offset += 2; return value; }
  i32() { this.ensure(4); const value = this.buffer.readInt32BE(this.offset); this.offset += 4; return value; }
  i64() { this.ensure(8); const value = this.buffer.readBigInt64BE(this.offset); this.offset += 8; return value; }
  f32() { this.ensure(4); const value = this.buffer.readFloatBE(this.offset); this.offset += 4; return value; }
  f64() { this.ensure(8); const value = this.buffer.readDoubleBE(this.offset); this.offset += 8; return value; }
}

function fail(code, candidateId, safeDetail = {}) {
  throw new CandidateReadinessError(code, 'nbt', candidateId, safeDetail);
}
