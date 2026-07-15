import zlib from 'node:zlib';

const TAG = {
  END: 0,
  BYTE: 1,
  SHORT: 2,
  INT: 3,
  LONG: 4,
  FLOAT: 5,
  DOUBLE: 6,
  BYTE_ARRAY: 7,
  STRING: 8,
  LIST: 9,
  COMPOUND: 10,
  INT_ARRAY: 11,
  LONG_ARRAY: 12
};

export function parseNbt(buffer, { maxInflatedBytes } = {}) {
  const source = inflateNbt(buffer, maxInflatedBytes);
  const reader = new BinaryReader(source);
  const type = reader.u8();
  if (type !== TAG.COMPOUND) {
    throw new Error(`NBT root must be a compound tag, got ${type}.`);
  }
  const name = reader.string();
  return {
    name,
    value: readPayload(reader, type)
  };
}

function inflateNbt(buffer, maxInflatedBytes) {
  if (!Buffer.isBuffer(buffer)) throw new Error('NBT input must be a Buffer.');
  const options = Number.isSafeInteger(maxInflatedBytes) && maxInflatedBytes > 0
    ? { maxOutputLength: maxInflatedBytes }
    : undefined;
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) return zlib.gunzipSync(buffer, options);
  if (buffer.length >= 2 && buffer[0] === 0x78) {
    try {
      return zlib.inflateSync(buffer, options);
    } catch (error) {
      if (options) throw error;
      return buffer;
    }
  }
  if (options && buffer.length > options.maxOutputLength) throw new Error('NBT input exceeds maximum decoded size.');
  return buffer;
}

function readPayload(reader, type) {
  switch (type) {
    case TAG.BYTE:
      return reader.i8();
    case TAG.SHORT:
      return reader.i16();
    case TAG.INT:
      return reader.i32();
    case TAG.LONG:
      return reader.i64();
    case TAG.FLOAT:
      return reader.f32();
    case TAG.DOUBLE:
      return reader.f64();
    case TAG.BYTE_ARRAY:
      return reader.byteArray();
    case TAG.STRING:
      return reader.string();
    case TAG.LIST:
      return reader.list();
    case TAG.COMPOUND:
      return reader.compound();
    case TAG.INT_ARRAY:
      return reader.intArray();
    case TAG.LONG_ARRAY:
      return reader.longArray();
    default:
      throw new Error(`Unsupported NBT tag type: ${type}.`);
  }
}

class BinaryReader {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
  }

  u8() {
    this.ensure(1);
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  i8() {
    this.ensure(1);
    const value = this.buffer.readInt8(this.offset);
    this.offset += 1;
    return value;
  }

  u16() {
    this.ensure(2);
    const value = this.buffer.readUInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  i16() {
    this.ensure(2);
    const value = this.buffer.readInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  i32() {
    this.ensure(4);
    const value = this.buffer.readInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  i64() {
    this.ensure(8);
    const value = this.buffer.readBigInt64BE(this.offset);
    this.offset += 8;
    return value;
  }

  f32() {
    this.ensure(4);
    const value = this.buffer.readFloatBE(this.offset);
    this.offset += 4;
    return value;
  }

  f64() {
    this.ensure(8);
    const value = this.buffer.readDoubleBE(this.offset);
    this.offset += 8;
    return value;
  }

  string() {
    const length = this.u16();
    this.ensure(length);
    const value = this.buffer.toString('utf8', this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  byteArray() {
    const length = this.i32();
    if (length < 0) throw new Error(`Invalid NBT byte array length: ${length}.`);
    this.ensure(length);
    const value = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  intArray() {
    const length = this.i32();
    if (length < 0) throw new Error(`Invalid NBT int array length: ${length}.`);
    const value = [];
    for (let index = 0; index < length; index += 1) value.push(this.i32());
    return value;
  }

  longArray() {
    const length = this.i32();
    if (length < 0) throw new Error(`Invalid NBT long array length: ${length}.`);
    const value = [];
    for (let index = 0; index < length; index += 1) value.push(this.i64());
    return value;
  }

  list() {
    const childType = this.u8();
    const length = this.i32();
    if (length < 0) throw new Error(`Invalid NBT list length: ${length}.`);
    const value = [];
    for (let index = 0; index < length; index += 1) value.push(readPayload(this, childType));
    return value;
  }

  compound() {
    const value = {};
    while (true) {
      const type = this.u8();
      if (type === TAG.END) return value;
      const name = this.string();
      value[name] = readPayload(this, type);
    }
  }

  ensure(length) {
    if (this.offset + length > this.buffer.length) {
      throw new Error(`Unexpected end of NBT data at byte ${this.offset}.`);
    }
  }
}
